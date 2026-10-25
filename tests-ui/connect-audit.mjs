// Read-only wallet connection audit. The injected account has no private key or funds.
import { spawn } from 'node:child_process'
import { chromium } from 'playwright-core'

const host = 'http://127.0.0.1:4174'
const chrome = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const server = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4174', '--strictPort'], {
  stdio: 'ignore',
  shell: false,
})
let browser

async function ready() {
  for (let i = 0; i < 40; i++) {
    try {
      const response = await fetch(host)
      if (response.ok) return
    } catch { /* server is starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('Local preview did not start')
}

try {
  await ready()
  browser = await chromium.launch({ executablePath: chrome, headless: true })
  const page = await browser.newPage()
  const externalHosts = new Set()
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.origin === host) return route.continue()
    externalHosts.add(url.hostname)
    return route.abort()
  })
  await page.addInitScript(() => {
    const requests = []
    let connected = false
    const account = '0x1111111111111111111111111111111111111111'
    const provider = {
      isMetaMask: true,
      request: async ({ method, params }) => {
        requests.push({ method, params })
        if (method === 'eth_accounts') return connected ? [account] : []
        if (method === 'wallet_requestPermissions') return [{ parentCapability: 'eth_accounts', caveats: [] }]
        if (method === 'eth_requestAccounts') {
          connected = true
          return [account]
        }
        if (method === 'eth_chainId') return '0x' + (5042002).toString(16)
        if (method === 'net_version') return '5042002'
        throw new Error(`Blocked audit RPC method: ${method}`)
      },
      on: () => provider,
      removeListener: () => provider,
    }
    window.ethereum = provider
    window.__walletAudit = { requests, originalRequest: provider.request }
  })
  await page.goto(`${host}/#/groups/5042002`, { waitUntil: 'domcontentloaded' })
  const beforeClick = await page.evaluate(() => window.__walletAudit.requests.map(({ method }) => method))
  if (beforeClick.includes('wallet_requestPermissions') || beforeClick.includes('eth_requestAccounts')) {
    throw new Error('Account permission was requested before the user clicked Connect')
  }
  await page.getByRole('button', { name: 'Connect wallet', exact: true }).first().click()
  await page.getByText(/MetaMask|Browser Wallet|Injected/i).first().click({ timeout: 10_000 })
  await page.getByText('0x1111', { exact: false }).first().waitFor({ timeout: 10_000 })
  const result = await page.evaluate(() => ({
    requests: window.__walletAudit.requests,
    providerUnmodified: window.ethereum.request === window.__walletAudit.originalRequest,
    providerDescriptor: Object.getOwnPropertyDescriptor(window, 'ethereum')?.get ? 'getter' : 'value',
    url: window.location.href,
  }))
  console.log(JSON.stringify({ audit: result, externalHosts: [...externalHosts] }))
  const forbidden = /^(eth_sendTransaction|eth_sign|personal_sign|eth_signTypedData.*)$/
  if (!result.providerUnmodified) throw new Error('Production page modified window.ethereum.request')
  if (!result.url.startsWith(host + '/')) throw new Error('Connection redirected the browser')
  if (result.requests.some(({ method }) => forbidden.test(method))) throw new Error('Connection requested a signature or transaction')
  const permissions = result.requests.filter(({ method }) => method === 'wallet_requestPermissions')
  if (permissions.some(({ params }) => !Array.isArray(params) || params.length !== 1 || Object.keys(params[0]).join() !== 'eth_accounts')) {
    throw new Error('Connection requested more than account access')
  }
  if (!result.requests.some(({ method }) => method === 'eth_requestAccounts')) throw new Error('Account connection was not requested')
  await page.evaluate(() => {
    const frame = document.createElement('iframe')
    frame.id = 'audit-frame'
    frame.src = `${window.location.origin}/#/demo`
    document.body.appendChild(frame)
  })
  await page.waitForFunction(() => document.querySelector('#audit-frame')?.contentWindow?.document.readyState === 'complete')
  const framedProviderUnmodified = await page.evaluate(async () => {
    const frame = document.querySelector('#audit-frame').contentWindow
    frame.postMessage({ type: 'studio-trace-config', enabled: true }, window.location.origin)
    await new Promise((resolve) => setTimeout(resolve, 50))
    return frame.ethereum.request === frame.__walletAudit.originalRequest
  })
  if (!framedProviderUnmodified) throw new Error('Untrusted parent enabled Studio provider tracing')
  console.log(JSON.stringify({ pass: true, requests: result.requests, externalHosts: [...externalHosts] }))
} finally {
  await browser?.close()
  server.kill()
}
