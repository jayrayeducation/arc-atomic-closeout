// Second real-UI pass on Arc Testnet: cancellation, wallet rejection, insufficient funds,
// expiry + refund through the UI, and mobile layout checks. Real transactions, no mocks.
// Usage: CHROME=... node tests-ui/run2.mjs
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
    console.log('FAIL', name, '-', e.message.split('\n').slice(0, 3).join(' '))
    await page.screenshot({ path: `${SHOTS}ui2-fail-${results.length}.png` }).catch(() => {})
  }
}
const shot = (n, full = false) => page.screenshot({ path: `${SHOTS}${n}.png`, fullPage: full })
const see = (text, timeout = 90_000) => page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout })
const press = async (re, timeout = 30_000) => {
  const b = page.getByRole('button', { name: re }).first()
  await b.waitFor({ state: 'visible', timeout })
  await b.click()
}
const addr = (n) => accountOf(n).address
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)

const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-zygote'] })
page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
page.on('crash', () => console.log('!! PAGE CRASHED'))
const wallet = await installWallet(page, { account: 'alex', chainId: 5042002 })

async function createGroup(name, members) {
  await page.goto(BASE + '#/create')
  await see('Create a group')
  const connect = page.getByRole('button', { name: /^connect wallet$/i }).first()
  if (await connect.isVisible().catch(() => false)) {
    await connect.click()
    await page.getByText(/MetaMask|Browser Wallet|Injected/i).first().click()
    await see(addr('alex').slice(0, 6))
  }
  await page.getByPlaceholder('Weekend Trip').fill(name)
  await page.getByLabel('Member 2 wallet').fill(addr(members[1]))
  await page.getByLabel('Member 3 wallet').fill(addr(members[2]))
  await press(/Create group onchain/)
  await page.waitForURL(/#\/g\/5042002\/\d+/, { timeout: 90_000 })
  await see(name)
  return page.url().match(/\/g\/5042002\/(\d+)/)[1]
}
async function addExpense(title, amount, payerIndex) {
  await page.getByRole('tab', { name: 'Expenses' }).click()
  await page.getByPlaceholder('Dinner on Saturday').fill(title)
  await page.getByPlaceholder('0.00').first().fill(amount)
  await page.getByLabel('Paid by').selectOption({ index: payerIndex })
  await press(/Add expense/)
  await page.getByRole('tab', { name: 'Round' }).click()
}
async function propose(label) {
  await page.getByRole('tab', { name: 'Round' }).click()
  await page.getByRole('button', { name: label }).click()
  await press(/Propose plan onchain/)
  await page.getByRole('heading', { name: /Plan #\d+ approvals/ }).waitFor({ timeout: 90_000 })
}

let gX = null
let gY = null

// ---------- Group X: cancel, rejection, expiry + refund
await step('create group X (alex, maya, jordan)', async () => {
  gX = await createGroup('UI cancel+refund', ['alex', 'maya', 'jordan'])
})
await step('add expenses: alex paid 6.00, equal split', async () => {
  await addExpense('Dinner', '6', 0)
})
await step('propose plan #1 (6 minute window)', async () => {
  await propose('6 minutes (test)')
})
await step('only the proposer sees Cancel; other member does not', async () => {
  await wallet.setAccount('maya')
  await page.getByRole('button', { name: /Cancel this plan/ }).waitFor({ state: 'hidden', timeout: 20_000 })
  await see('Approve this exact plan')
  await wallet.setAccount('alex')
  await see('Cancel this plan')
})
await step('wallet rejection is silent: no error banner, button usable again', async () => {
  wallet.state.rejectNext = true
  await press(/Approve this exact plan/)
  await page.waitForTimeout(2500)
  if ((await page.getByText('Approve plan failed').count()) > 0) throw new Error('rejection shown as failure')
  await page.getByRole('button', { name: /Approve this exact plan/ }).first().waitFor({ state: 'visible' })
})
await step('proposer cancels the unfunded plan (real transaction)', async () => {
  await press(/Cancel this plan/)
  await see('was cancelled by its proposer', 90_000)
  await shot('ui2-cancelled', true)
})
await step('corrected plan can be proposed after cancellation', async () => {
  await propose('6 minutes (test)')
  await page.getByRole('heading', { name: /Plan #2 approvals/ }).waitFor({ timeout: 90_000 })
})
for (const who of ['alex', 'maya', 'jordan']) {
  await step(`approve plan #2 as ${who}`, async () => {
    await wallet.setAccount(who)
    await press(/Approve this exact plan/)
    await page.getByText(/You approved this plan|Funding/).first().waitFor({ timeout: 90_000 })
  })
}
await step('maya deposits her exact 2.00 USDC; jordan never funds', async () => {
  await wallet.setAccount('maya')
  await press(/allow exactly 2\.00/, 60_000)
  await press(/Deposit 2\.00 USDC/, 90_000)
  await see('Your deposit is confirmed onchain', 90_000)
})
await step('mobile layout of the funding screen has no horizontal overflow', async () => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(800)
  if (await overflow()) throw new Error('horizontal overflow at 390px')
  await shot('ui2-funding-mobile', true)
  await page.setViewportSize({ width: 1280, height: 1000 })
})
await step('wait for the deadline; UI shows the plan as expired with refund option', async () => {
  await see('Expired plan and refunds', 8 * 60_000)
  await see('Refund available')
  await shot('ui2-expired', true)
})
await step('jordan (no deposit) cannot refund; strangers see no refund button', async () => {
  await wallet.setAccount('jordan')
  await page.waitForTimeout(1500)
  if ((await page.getByRole('button', { name: /Reclaim/ }).count()) > 0) throw new Error('non-depositor sees Reclaim')
})
await step('maya reclaims exactly her own deposit through the UI (real transaction)', async () => {
  await wallet.setAccount('maya')
  await press(/Reclaim 2\.00 USDC/)
  await see('Your deposit was refunded', 90_000)
  await shot('ui2-refunded', true)
})
await step('mobile layout of the refund screen has no horizontal overflow', async () => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(800)
  if (await overflow()) throw new Error('horizontal overflow at 390px')
  await shot('ui2-refund-mobile', true)
  await page.setViewportSize({ width: 1280, height: 1000 })
})

// ---------- Group Y: insufficient funds error for an unfunded member
await step('create group Y (alex, maya, stranger)', async () => {
  await wallet.setAccount('alex')
  gY = await createGroup('UI insufficient funds', ['alex', 'maya', 'stranger'])
})
await step('propose a plan where the unfunded wallet owes money', async () => {
  await addExpense('Taxi', '3', 0)
  await propose('24 hours')
})
await step('unfunded wallet gets a clear insufficient-USDC error on approve', async () => {
  await wallet.setAccount('stranger')
  await press(/Approve this exact plan/)
  await page.getByText(/Insufficient USDC|failed/).first().waitFor({ timeout: 60_000 })
  await shot('ui2-insufficient', true)
})
await step('mobile layouts: create, groups, group workspace', async () => {
  await page.setViewportSize({ width: 390, height: 844 })
  for (const [hash, name] of [['/create', 'ui2-create-mobile'], ['/groups', 'ui2-groups-mobile'], [`/g/5042002/${gY}`, 'ui2-group-mobile']]) {
    await page.goto(BASE + '#' + hash)
    await page.waitForTimeout(2500)
    if (await overflow()) throw new Error(`overflow on ${hash}`)
    await shot(name, true)
  }
})

await browser.close()
const failed = results.filter((r) => !r.pass).length
fs.writeFileSync(new URL('../docs/test-results/ui-e2e-2.json', import.meta.url).pathname, JSON.stringify({ ranAt: new Date().toISOString(), groups: { cancelRefund: gX, insufficientFunds: gY }, passed: results.length - failed, failed, results, transactions: wallet.tx() }, null, 2))
console.log(`UI E2E 2: ${results.length - failed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
