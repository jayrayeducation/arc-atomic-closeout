// Main app routing and pre-signing gates. No RPC, wallet extension or transaction.
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true },
  resolve: { alias: { '@': `${process.cwd()}/src` } }, server: { middlewareMode: true }, appType: 'custom' })
after(async () => server.close())
const routes = await server.ssrLoadModule('/src/lib/router.ts')
const deployments = await server.ssrLoadModule('/src/lib/deployments.ts')
const safety = await server.ssrLoadModule('/src/lib/mainnetWriteSafety.ts')
const browserDeploy = await server.ssrLoadModule('/src/lib/browserDeploy.ts')
const account = '0x3B0278E623a5F9C50AfaAB22c972c69Ec687448a'
const mainnet = deployments.getDeployment(5042)
const wallet = (chainId = 5042, addresses = [account]) => ({ getChainId: async () => chainId, getAddresses: async () => addresses })
const client = (chainId = 5042, code = browserDeploy.expectedRuntime()) => ({ getChainId: async () => chainId, getCode: async () => code })

test('main app and restored unqualified routes select Arc Mainnet, including when wallet is already on 5042', () => {
  assert.equal(deployments.DEFAULT_CHAIN_ID, 5042)
  assert.equal(routes.parseHash('#/create').chainId, 5042)
  assert.equal(routes.parseHash('#/groups').chainId, 5042)
  assert.equal(routes.parseHash('#/create/5042002').chainId, 5042002)
  assert.equal(mainnet.contract.toLowerCase(), '0xe05790767da98b524472ea9d78459aca4fb3b6c6')
  assert.equal(mainnet.fromBlock, 27856267n)
  assert.notEqual(mainnet.contract.toLowerCase(), deployments.getDeployment(5042002).contract.toLowerCase())
})

test('pre-signing gate allows exact Mainnet runtime and blocks wrong wallet, RPC, account or bytecode', async () => {
  await safety.assertWriteSafety(client(), wallet(), 5042, account)
  await assert.rejects(safety.assertWriteSafety(client(), wallet(5042002), 5042, account), /Wallet network or account changed/)
  await assert.rejects(safety.assertWriteSafety(client(5042002), wallet(), 5042, account), /Read-only RPC/)
  await assert.rejects(safety.assertWriteSafety(client(), wallet(5042, ['0x1111111111111111111111111111111111111111']), 5042, account), /Wallet network or account changed/)
  await assert.rejects(safety.assertWriteSafety(client(5042, '0x6000'), wallet(), 5042, account), /bytecode/)
})

test('missing Mainnet address is a configuration error, never a Testnet fallback', async () => {
  const original = mainnet.contract
  try {
    mainnet.contract = null
    await assert.rejects(safety.assertWriteSafety(client(), wallet(), 5042, account), /Deployment configuration is missing/)
    assert.equal(routes.parseHash('#/create').chainId, 5042)
  } finally { mainnet.contract = original }
})
