// Local browser safety smoke. External RPC is blocked and wallet is a no-funds mock.
import { spawn } from 'node:child_process'
import { chromium } from 'playwright-core'

const host = 'http://127.0.0.1:4175'
const address = '0x3B0278E623a5F9C50AfaAB22c972c69Ec687448a'
const chrome = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const server = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4175', '--strictPort'], { stdio: 'ignore', shell: false })
let browser
try {
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(`${host}/deploy`)).ok) break } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  browser = await chromium.launch({ executablePath: chrome, headless: true })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await page.route('**/*', (route) => new URL(route.request().url()).origin === host ? route.continue() : route.abort())
  await page.addInitScript(() => {
    const calls = []
    let connected = false
    const address = '0x3B0278E623a5F9C50AfaAB22c972c69Ec687448a'
    const provider = { isRabby: true, request: async ({ method }) => {
      calls.push(method)
      if (method === 'eth_accounts') return connected ? [address] : []
      if (method === 'eth_requestAccounts') { connected = true; return [address] }
      if (method === 'eth_chainId') return '0x13b2'
      throw new Error(`Mock blocked ${method}`)
    }, on: () => {}, removeListener: () => {} }
    Object.defineProperty(window, 'ethereum', { configurable: true, value: provider })
    window.__deployAudit = { calls, originalRequest: provider.request }
  })
  await page.goto(`${host}/deploy`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: /Atomic Closeout.*Mainnet Deployment/ }).waitFor()
  await page.getByText('Built with Arc Studio').first().waitFor()
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) throw new Error('Mobile horizontal overflow')
  if (process.env.DEPLOY_SCREENSHOT) await page.screenshot({ path: process.env.DEPLOY_SCREENSHOT, fullPage: true })
  const before = await page.evaluate(() => window.__deployAudit.calls)
  if (before.includes('eth_requestAccounts') || before.includes('eth_sendTransaction')) throw new Error('Wallet action before user click')
  await page.getByRole('button', { name: 'Connect Rabby' }).click()
  await page.getByText(address).first().waitFor()
  if (await page.getByRole('button', { name: 'Deploy Contract' }).isEnabled()) throw new Error('Deploy enabled while RPC is unavailable')
  const first = await page.evaluate(() => ({ calls: window.__deployAudit.calls, unchanged: window.ethereum.request === window.__deployAudit.originalRequest }))
  if (!first.unchanged || first.calls.includes('eth_sendTransaction')) throw new Error('Unsafe mock wallet call')
  await page.evaluate(() => localStorage.setItem('atomic-closeout:arc-mainnet-deploy:v1:0x3b0278e623a5f9c50afaab22c972c69ec687448a', JSON.stringify({ phase: 'uncertain' })))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByText(/Outcome uncertain/).waitFor()
  if (await page.getByRole('button', { name: 'Deploy Contract' }).isEnabled()) throw new Error('Reload unlocked uncertain deployment')
  await page.evaluate(() => localStorage.setItem('atomic-closeout:arc-mainnet-deploy:v1:0x3b0278e623a5f9c50afaab22c972c69ec687448a', JSON.stringify({ phase: 'pending', hash: `0x${'12'.repeat(32)}` })))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByText(/0x12121212/).first().waitFor()
  if (await page.getByRole('button', { name: 'Deploy Contract' }).isEnabled()) throw new Error('Reload unlocked pending hash')
  const root = await page.goto(`${host}/#/`, { waitUntil: 'domcontentloaded' })
  if (!root?.ok()) throw new Error('Landing route broken')
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto(`${host}/deploy`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: /Atomic Closeout.*Mainnet Deployment/ }).waitFor()
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) throw new Error('Desktop horizontal overflow')
  console.log(JSON.stringify({ pass: true, browser: 'Chromium headless', mobile: '390x844', desktop: '1280x800', route: '/deploy',
    checks: ['no permission before click', 'Rabby account permission only', 'no transaction', 'RPC failure blocks deploy', 'uncertain reload stays locked', 'pending hash reload stays locked', 'original landing works'] }))
} finally { await browser?.close(); server.kill() }
