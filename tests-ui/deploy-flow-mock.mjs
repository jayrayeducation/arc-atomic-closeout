// End-to-end UI rehearsal with a fake RPC and a fake rejecting Rabby. Never reaches a real network.
import { spawn } from 'node:child_process'
import { chromium } from 'playwright-core'

const host = 'http://127.0.0.1:4176'
const chrome = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const sender = '0x3B0278E623a5F9C50AfaAB22c972c69Ec687448a'
const rpcMethods = []
const server = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4176', '--strictPort'], { stdio: 'ignore', shell: false })
let browser
const hex = (value) => `0x${BigInt(value).toString(16)}`
try {
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(`${host}/deploy`)).ok) break } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  browser = await chromium.launch({ executablePath: chrome, headless: true })
  const page = await browser.newPage()
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin === host) return route.continue()
    if (url.host !== 'rpc.blockdaemon.mainnet.arc.io') return route.abort()
    const request = route.request().postDataJSON()
    const method = request.method
    rpcMethods.push(method)
    let result
    if (method === 'eth_chainId') result = '0x13b2'
    else if (method === 'eth_getBlockByNumber') result = { number: '0x7b', timestamp: hex(Math.floor(Date.now() / 1000)),
      hash: `0x${'aa'.repeat(32)}`, parentHash: `0x${'bb'.repeat(32)}`, gasLimit: hex(30_000_000), gasUsed: '0x0', baseFeePerGas: hex(20_000_000_000) }
    else if (method === 'eth_gasPrice') result = hex(30_000_000_000)
    else if (method === 'eth_call') result = `0x${(6).toString(16).padStart(64, '0')}`
    else if (method === 'eth_estimateGas') result = hex(3_000_000)
    else if (method === 'eth_getBalance') result = hex(1_000_000_000_000_000_000n)
    else if (method === 'eth_maxPriorityFeePerGas') result = hex(1_000_000_000)
    else if (method === 'eth_feeHistory') result = { oldestBlock: '0x79', baseFeePerGas: [hex(20_000_000_000), hex(20_000_000_000)], gasUsedRatio: [0], reward: [[hex(1_000_000_000)]] }
    else throw new Error(`Unexpected mock RPC method: ${method}`)
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) })
  })
  await page.addInitScript(() => {
    const calls = []
    let connected = false
    const provider = { isRabby: true, request: async ({ method, params }) => {
      calls.push({ method, params })
      if (method === 'eth_accounts') return connected ? ['0x3B0278E623a5F9C50AfaAB22c972c69Ec687448a'] : []
      if (method === 'eth_requestAccounts') { connected = true; return ['0x3B0278E623a5F9C50AfaAB22c972c69Ec687448a'] }
      if (method === 'eth_chainId') return '0x13b2'
      if (method === 'eth_sendTransaction') throw Object.assign(new Error('User rejected'), { code: 4001 })
      throw new Error(`Unexpected mock wallet method: ${method}`)
    }, on: () => {}, removeListener: () => {} }
    Object.defineProperty(window, 'ethereum', { configurable: true, value: provider })
    window.__deployFlowMock = calls
  })
  await page.goto(`${host}/deploy`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Connect Rabby' }).click()
  await page.getByRole('button', { name: 'Deploy Contract' }).waitFor()
  try {
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('Deploy Contract') && !button.disabled), null, { timeout: 10_000 })
  } catch (error) {
    console.log(JSON.stringify({ mockRpcMethods: [...new Set(rpcMethods)], visibleError: await page.locator('[role="alert"]').allTextContents() }))
    throw error
  }
  const deploy = page.getByRole('button', { name: 'Deploy Contract' })
  if (!await deploy.isEnabled()) throw new Error('Healthy mock RPC did not enable Deploy')
  await deploy.click()
  await page.getByRole('dialog').getByLabel('Type this exact sentence to proceed:').fill("I'm deploying Atomic Closeout to Arc Mainnet with real USDC gas.")
  await page.getByRole('button', { name: 'Confirm in Rabby' }).click()
  await page.getByText(/Rabby request was rejected/).waitFor()
  const sends = await page.evaluate(() => window.__deployFlowMock.filter((call) => call.method === 'eth_sendTransaction'))
  if (sends.length !== 1) throw new Error(`Expected one mock wallet transaction, got ${sends.length}`)
  const tx = sends[0].params[0]
  if (tx.from.toLowerCase() !== sender.toLowerCase() || tx.chainId !== '0x13b2' || tx.to !== undefined || tx.value !== '0x0' || !tx.data.startsWith('0x') || tx.data.length !== 26176) {
    throw new Error('Mock wallet transaction does not match reviewed contract creation')
  }
  if (!rpcMethods.includes('eth_estimateGas') || !rpcMethods.includes('eth_getBalance')) throw new Error('Fresh quote was not obtained')
  console.log(JSON.stringify({ pass: true, mode: 'MOCK_ONLY', rpcMethods: [...new Set(rpcMethods)], walletSendRequests: sends.length,
    result: 'rejected without hash; no real transaction' }))
} finally { await browser?.close(); server.kill() }
