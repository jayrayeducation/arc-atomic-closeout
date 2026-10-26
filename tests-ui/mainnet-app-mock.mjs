// Main app rehearsal with an injected no-funds Rabby. External network is blocked.
import { spawn } from 'node:child_process'
import { chromium } from 'playwright-core'

const host = 'http://127.0.0.1:4177'
const chrome = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const server = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4177', '--strictPort'], { stdio: 'ignore', shell: false })
let browser
try {
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(`${host}/`)).ok) break } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  browser = await chromium.launch({ executablePath: chrome, headless: true })
  const page = await browser.newPage()
  await page.route('**/*', (route) => new URL(route.request().url()).origin === host ? route.continue() : route.abort())
  await page.addInitScript(() => {
    const address = '0x3B0278E623a5F9C50AfaAB22c972c69Ec687448a'
    const calls = []
    const listeners = new Map()
    let connected = sessionStorage.getItem('mock-connected') === '1'
    let chain = 5042
    const provider = {
      isRabby: true,
      request: async ({ method, params }) => {
        calls.push({ method, params })
        if (method === 'eth_accounts') return connected ? [address] : []
        if (method === 'wallet_requestPermissions') return [{ parentCapability: 'eth_accounts', caveats: [] }]
        if (method === 'eth_requestAccounts') { connected = true; sessionStorage.setItem('mock-connected', '1'); return [address] }
        if (method === 'eth_chainId') return `0x${chain.toString(16)}`
        if (method === 'net_version') return String(chain)
        if (method === 'wallet_switchEthereumChain') {
          chain = Number(params[0].chainId)
          for (const listener of listeners.get('chainChanged') ?? []) listener(`0x${chain.toString(16)}`)
          return null
        }
        throw new Error(`Blocked mock wallet method ${method}`)
      },
      on: (event, fn) => { const set = listeners.get(event) ?? new Set(); set.add(fn); listeners.set(event, set) },
      removeListener: (event, fn) => listeners.get(event)?.delete(fn),
    }
    Object.defineProperty(window, 'ethereum', { configurable: true, value: provider })
    window.__mainnetMock = { calls, setChain: (id) => { chain = id; for (const fn of listeners.get('chainChanged') ?? []) fn(`0x${id.toString(16)}`) } }
  })
  await page.goto(`${host}/#/`, { waitUntil: 'domcontentloaded' })
  await page.getByText(/Creating a group on Arc Mainnet 5042/).waitFor()
  await page.getByRole('link', { name: /Create group/ }).first().click()
  await page.getByRole('heading', { name: 'Create a group' }).waitFor()
  await page.getByText(/Actions use real USDC for network fees/).waitFor()
  const contractLink = page.getByRole('link', { name: /0xe057/i })
  if (!(await contractLink.getAttribute('href'))?.startsWith('https://explorer.arc.io/address/')) throw new Error('Mainnet Explorer link is wrong')
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).first().click()
  await page.getByText(/Rabby|Browser Wallet|Injected/i).first().click()
  await page.getByText(/0x3B02/i).first().waitFor()
  const methods = async () => page.evaluate(() => window.__mainnetMock.calls.map((x) => x.method))
  if ((await methods()).includes('wallet_switchEthereumChain')) throw new Error('Connection switched a wallet already on Arc Mainnet')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByText(/0x3B02/i).first().waitFor()
  if ((await methods()).includes('wallet_switchEthereumChain')) throw new Error('Reload switched the wallet')
  await page.evaluate(() => window.__mainnetMock.setChain(1))
  await page.getByRole('button', { name: /Wallet on another network. Switch to Arc Mainnet/ }).first().waitFor()
  if ((await methods()).includes('wallet_switchEthereumChain')) throw new Error('Wrong-network warning switched wallet without a click')
  await page.getByRole('button', { name: /Wallet on another network. Switch to Arc Mainnet/ }).first().click()
  await page.getByRole('button', { name: 'Review new group and network fee' }).waitFor()
  const calls = await methods()
  if (calls.filter((method) => method === 'wallet_switchEthereumChain').length !== 1) throw new Error('Explicit network switch was not exactly one request')
  if (calls.some((method) => /^(eth_sendTransaction|eth_sign|personal_sign|eth_signTypedData)/.test(method))) throw new Error('Connection requested a signature or transaction')
  console.log(JSON.stringify({ pass: true, mode: 'MOCK_ONLY', route: '/#/create', mainnetContract: '0xe05790767da98b524472ea9d78459aca4fb3b6c6', explicitSwitches: 1, signatures: 0 }))
} finally { await browser?.close(); server.kill() }
