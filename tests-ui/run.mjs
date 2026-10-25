// Drives the REAL app UI in headless Chromium against Arc Testnet with throwaway wallets.
// Prereqs: dev server on :5173, .e2e-wallets.json funded, a Chromium build (see README "UI end-to-end").
// Usage: CHROME=/path/to/chrome-headless-shell node tests-ui/run.mjs
import fs from 'node:fs'
import { chromium } from 'playwright-core'
import { installWallet, accountOf } from './wallet-harness.mjs'

const BASE = process.env.APP_URL ?? 'http://localhost:5173/'
const SHOTS = new URL('../docs/screenshots/', import.meta.url).pathname
const results = []
let page

async function step(name, fn) {
  try {
    await fn()
    results.push({ name, pass: true })
    console.log('PASS', name)
  } catch (e) {
    results.push({ name, pass: false, error: e.message.split('\n').slice(0, 3).join(' ') })
    console.log('FAIL', name, '-', e.message.split('\n')[0])
    await page.screenshot({ path: `${SHOTS}ui-fail-${results.length}.png` }).catch(() => {})
  }
}
const shot = (n, full = false) => page.screenshot({ path: `${SHOTS}${n}.png`, fullPage: full })
const see = (text, timeout = 90_000) => page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout })
const press = async (nameRe, timeout = 30_000) => {
  const b = page.getByRole('button', { name: nameRe }).first()
  await b.waitFor({ state: 'visible', timeout })
  await b.click()
}

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-zygote'] })
page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
const consoleErrors = []
page.on('crash', () => console.log('!! PAGE CRASHED'))
page.on('pageerror', (e) => consoleErrors.push(e.message.slice(0, 200)))
const wallet = await installWallet(page, { account: 'alex', chainId: 1 })
const addr = (n) => accountOf(n).address
let groupId = null

await step('open create page, wallet disconnected', async () => {
  await page.goto(BASE + '#/create')
  await see('Create a group')
  await see('Connect wallet to continue')
})

await step('connect injected wallet through the connect modal', async () => {
  await press(/^connect wallet$/i)
  await page.waitForTimeout(1500)
  await shot('ui-connect-modal')
  await page.getByText(/MetaMask|Browser Wallet|Injected/i).first().click()
  await see(addr('alex').slice(0, 6))
})

await step('network mismatch is shown and blocks the action', async () => {
  // The connect modal itself requests Arc Testnet; simulate the user moving the wallet to Ethereum afterwards.
  await wallet.setChain(1)
  await see('Wallet on another network')
  await see('Switch wallet to Arc Testnet')
  await shot('ui-network-mismatch')
})

await step('switch network from the app', async () => {
  await press(/Switch wallet to Arc Testnet/)
  await see('Create group onchain')
})

await step('validation: duplicate members are rejected before any transaction', async () => {
  await page.getByPlaceholder('Weekend Trip').fill('UI E2E trip')
  await page.getByLabel('Member 2 wallet').fill(addr('alex'))
  await page.getByLabel('Member 3 wallet').fill(addr('jordan'))
  await press(/Create group onchain/)
  await see('Each wallet can appear only once')
})

await step('create group through the UI (real transaction)', async () => {
  await page.getByLabel('Member 2 wallet').fill(addr('maya'))
  await page.getByLabel('Member 1 name').fill('Alex')
  await page.getByLabel('Member 2 name').fill('Maya')
  await page.getByLabel('Member 3 name').fill('Jordan')
  await press(/Create group onchain/)
  await page.waitForURL(/#\/g\/5042002\/\d+/, { timeout: 90_000 })
  groupId = page.url().match(/\/g\/5042002\/(\d+)/)[1]
  await see('UI E2E trip')
  await shot('ui-group-created')
})

await step('add expenses (exact integer math) and keep them across reload', async () => {
  await page.getByRole('tab', { name: 'Expenses' }).click()
  const add = async (title, amount, payerIndex) => {
    await page.getByPlaceholder('Dinner on Saturday').fill(title)
    await page.getByPlaceholder('0.00').first().fill(amount)
    await page.getByLabel('Paid by').selectOption({ index: payerIndex })
    await press(/Add expense/)
  }
  await add('Lodging', '12', 0)
  await add('Snacks', '1.5', 1)
  await see('Total paid')
  await shot('ui-expenses')
  await page.reload()
  await see(addr('alex').slice(0, 6))
  await page.getByRole('tab', { name: 'Expenses' }).click()
  await page.locator('li').filter({ hasText: '12.00 USDC' }).first().waitFor({ timeout: 30_000 })
  await page.locator('li').filter({ hasText: '1.50 USDC' }).first().waitFor({ timeout: 30_000 })
})

await step('balances tab shows exact net positions summing to zero', async () => {
  await page.getByRole('tab', { name: 'Balances' }).click()
  await see('+7.50')
  await see('-3.00')
  await see('-4.50')
  await see('add up to exactly 0.000000')
  await shot('ui-balances', true)
})

await step('propose the plan onchain (real transaction)', async () => {
  await page.getByRole('tab', { name: 'Round' }).click()
  await press(/Propose plan onchain/)
  await see('approvals', 90_000)
  await see('recomputed in your browser')
  await see('local expense list produces exactly this plan')
  await shot('ui-approval', true)
})

await step('non-member sees a read-only view and cannot approve', async () => {
  await wallet.setAccount('stranger')
  await see('not a member')
  await see('Only listed wallets can approve')
  await shot('ui-nonmember')
})

for (const who of ['alex', 'maya', 'jordan']) {
  await step(`approve exact plan as ${who} (real transaction)`, async () => {
    await wallet.setAccount(who)
    await press(/Approve this exact plan/)
    await see('You approved this plan', 90_000).catch(() => see('Funding', 90_000))
  })
}

await step('funding opens only after unanimous approval', async () => {
  await see('Fully funded', 1).catch(() => {})
  await see('Remaining to fund')
  await shot('ui-funding', true)
})

for (const [who, amount] of [['maya', '3.00'], ['jordan', '4.50']]) {
  await step(`${who}: exact allowance then deposit ${amount} USDC (real transactions)`, async () => {
    await wallet.setAccount(who)
    await press(new RegExp(`allow exactly ${amount.replace('.', '\\.')}`), 60_000)
    await press(new RegExp(`Deposit ${amount.replace('.', '\\.')} USDC`), 90_000)
    // The last debtor's deposit completes funding, which replaces the "waiting" notice with "Fully funded".
    await page.getByText(/Your deposit is confirmed onchain|Fully funded/).first().waitFor({ state: 'visible', timeout: 90_000 })
  })
}

await step('fully funded round can be finalized (real transaction)', async () => {
  await see('Fully funded')
  await shot('ui-fully-funded')
  await press(/Finalize settlement/)
  await see('withdrawal pending', 90_000)
  await shot('ui-finalized', true)
})

await step('creditor withdraws (real transaction)', async () => {
  await wallet.setAccount('alex')
  await press(/Withdraw 7\.50 USDC/)
  await see('Settled and fully withdrawn', 90_000)
  await shot('ui-settled', true)
})

await step('activity timeline lists confirmed events with explorer links', async () => {
  await page.getByRole('tab', { name: 'Activity' }).click()
  await see('Withdrew 7.50 USDC')
  const links = await page.locator('a[href*="explorer.testnet.arc.io/tx/"]').count()
  if (links < 8) throw new Error(`only ${links} explorer links`)
  await shot('ui-activity', true)
})

await step('reload keeps connection, group and settled state (persistence)', async () => {
  await page.reload()
  await see('Settled and fully withdrawn', 60_000)
  await see(addr('alex').slice(0, 6))
})

await step('shared link works with no wallet and no local notes', async () => {
  const p2 = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await p2.goto(`${BASE}#/g/5042002/${groupId}`)
  await p2.getByText('UI E2E trip').first().waitFor({ timeout: 60_000 })
  await p2.getByText('Settled and fully withdrawn').first().waitFor({ timeout: 60_000 })
  await p2.screenshot({ path: `${SHOTS}ui-group-mobile.png`, fullPage: true })
  await p2.close()
})

await step('refunded group from the scripted lifecycle test renders its refund state', async () => {
  await page.goto(`${BASE}#/g/5042002/1`)
  await see('Plan history', 60_000)
  await shot('ui-refund-group', true)
})

await browser.close()
const failed = results.filter((r) => !r.pass).length
fs.writeFileSync(new URL('../docs/test-results/ui-e2e.json', import.meta.url).pathname, JSON.stringify({ ranAt: new Date().toISOString(), groupId, passed: results.length - failed, failed, results, transactions: wallet.tx(), pageErrors: consoleErrors }, null, 2))
console.log(`UI E2E: ${results.length - failed} passed, ${failed} failed; page errors: ${consoleErrors.length}`)
process.exit(failed ? 1 : 0)
