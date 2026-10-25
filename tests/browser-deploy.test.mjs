// Pure/mocked safety gates. No external RPC, wallet extension, signing or money.
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'

const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true },
  resolve: { alias: { '@': `${process.cwd()}/src` } }, server: { middlewareMode: true }, appType: 'custom' })
after(async () => server.close())
const d = await server.ssrLoadModule('/src/lib/browserDeploy.ts')
const pinned = JSON.parse(await readFile('src/generated/mainnetDeployArtifact.json', 'utf8'))
const now = () => BigInt(Math.floor(Date.now() / 1000))
const hash = `0x${'12'.repeat(32)}`
const contract = `0x${'ab'.repeat(20)}`
const fakeClient = (overrides = {}) => ({
  getChainId: async () => 5042,
  getBlock: async () => ({ number: 123n, timestamp: now() }),
  estimateGas: async () => 3_000_000n,
  estimateFeesPerGas: async () => ({ maxFeePerGas: 30_000_000_000n, maxPriorityFeePerGas: 1_000_000_000n }),
  getBalance: async () => 1_000_000_000_000_000_000n,
  ...overrides,
})
const health = (overrides = {}) => ({ url: d.RPC_URLS[0], client: fakeClient(overrides), block: 123n, timestamp: now(), gasPrice: 30_000_000_000n })
const quote = async (overrides = {}) => d.estimateDeployment(health(overrides), d.DEPLOYER)
function wallet({ account = d.DEPLOYER, chain = '0x13b2', send, isRabby = true } = {}) {
  const requests = []
  return { isRabby, requests, request: async ({ method, params }) => {
    requests.push({ method, params })
    if (method === 'eth_accounts') return account ? [account] : []
    if (method === 'eth_chainId') return chain
    if (method === 'eth_sendTransaction') return send ? send(params) : hash
    throw new Error(`Unexpected wallet method ${method}`)
  } }
}

test('pinned artifact matches reviewed creation/runtime; altered bytecode is blocked', () => {
  d.assertPinnedArtifact()
  assert.equal(d.creationData().length, 2 + 13055 * 2 + 64)
  assert.equal(d.expectedRuntime().length, 2 + 12468 * 2)
  const changed = structuredClone(pinned)
  changed.creationBytecode = `0x00${changed.creationBytecode.slice(4)}`
  assert.throws(() => d.validateArtifact(changed), /CRITICAL/)
})

test('missing wallet, wrong account and wrong network cannot send', async () => {
  const q = await quote()
  for (const provider of [wallet({ account: null }), wallet({ account: `0x${'11'.repeat(20)}` }), wallet({ chain: '0x1' }), wallet({ isRabby: false })]) {
    await assert.rejects(d.sendDeployment(provider, q))
    assert.equal(provider.requests.filter((r) => r.method === 'eth_sendTransaction').length, 0)
  }
})

test('unavailable RPC, insufficient gas and invalid chain abort preflight', async () => {
  await assert.rejects(d.selectVerifiedRpc(async () => { throw new Error('HTTP 403') }), /No verified Arc Mainnet RPC/)
  await assert.rejects(quote({ getBalance: async () => 1n }), /Insufficient USDC/)
  await assert.rejects(quote({ getChainId: async () => 1 }), /RPC switched/)
  await assert.rejects(quote({ estimateFeesPerGas: async () => ({ maxFeePerGas: 200_000_000_000n, maxPriorityFeePerGas: 1n }) }), /safety cap/)
})

test('signature rejection sends only one request and has no hash', async () => {
  const q = await quote()
  const provider = wallet({ send: () => { throw Object.assign(new Error('User rejected'), { code: 4001 }) } })
  await assert.rejects(d.sendDeployment(provider, q), /User rejected/)
  assert.equal(provider.requests.filter((r) => r.method === 'eth_sendTransaction').length, 1)
})

test('simultaneous double click cannot open two wallet transactions', async () => {
  const q = await quote()
  let resolveSend
  const provider = wallet({ send: () => new Promise((resolve) => { resolveSend = resolve }) })
  const first = d.sendDeployment(provider, q)
  await assert.rejects(d.sendDeployment(provider, q), /already open/)
  for (let i = 0; i < 20 && !resolveSend; i++) await new Promise((resolve) => setTimeout(resolve, 5))
  assert.ok(resolveSend)
  resolveSend(hash)
  assert.equal(await first, hash)
  assert.equal(provider.requests.filter((r) => r.method === 'eth_sendTransaction').length, 1)
  const tx = provider.requests.find((r) => r.method === 'eth_sendTransaction').params[0]
  assert.equal(tx.to, undefined)
  assert.equal(tx.value, '0x0')
  assert.equal(tx.chainId, '0x13b2')
  assert.equal(tx.from, d.DEPLOYER)
})

function receiptClient({ status = 'success', code = d.expectedRuntime(), from = d.DEPLOYER } = {}) {
  return fakeClient({
    getTransactionReceipt: async () => ({ status, contractAddress: contract, from, blockNumber: 123n, gasUsed: 2_000_000n, effectiveGasPrice: 30_000_000_000n }),
    getTransaction: async () => ({ from, to: null, value: 0n, input: d.creationData(), blockNumber: 123n }),
    getCode: async () => code,
    readContract: async ({ functionName }) => functionName === 'USDC' ? d.ARC_USDC : 0n,
  })
}
test('successful receipt requires exact runtime and initialized state', async () => {
  const result = await d.verifyDeployment({ ...health(), client: receiptClient() }, hash)
  assert.equal(result.status, 'VERIFIED')
  assert.equal(result.deployer, d.DEPLOYER)
  assert.equal(result.blockNumber, '123')
})
test('failed receipt and wrong deployed code are CRITICAL', async () => {
  await assert.rejects(d.verifyDeployment({ ...health(), client: receiptClient({ status: 'reverted' }) }, hash), /CRITICAL/)
  await assert.rejects(d.verifyDeployment({ ...health(), client: receiptClient({ code: '0x6000' }) }, hash), /CRITICAL/)
})
