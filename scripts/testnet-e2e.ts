/**
 * LIVE Arc Testnet lifecycle test for AtomicCloseout.
 * Uses throwaway wallets from .e2e-wallets.json (see scripts/e2e-wallets.ts).
 * Every transaction below is a real testnet transaction; results are written to
 * docs/test-results/testnet-e2e.{json,md}. Nothing is mocked or hand-written.
 * Usage: bun run scripts/testnet-e2e.ts
 */
import fs from 'node:fs'
import { createPublicClient, createWalletClient, erc20Abi, http, type Address, type Hash, type Hex } from 'viem'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'
import { atomicCloseoutAbi } from '../src/lib/abi'
import { buildPlan, computeBalances, computePlanHash, hashExpenses, type Expense } from '../src/lib/settlement'

const CONTRACT = (process.env.VITE_ATOMIC_CLOSEOUT_TESTNET ?? '0x329cc6b4adf9e136c4b254d1e46fbe228c0b01da') as Address
const USDC = '0x3600000000000000000000000000000000000000' as Address
const RPC = 'https://rpc.testnet.arc.io'
const EXPLORER = 'https://explorer.testnet.arc.io'

const wallets = JSON.parse(fs.readFileSync(new URL('../.e2e-wallets.json', import.meta.url).pathname, 'utf8')) as Record<string, { privateKey: Hex }>
const acct = (n: string) => privateKeyToAccount(wallets[n].privateKey)
const pub = createPublicClient({ chain: arcTestnet, transport: http(RPC) })
const wc = (n: string) => createWalletClient({ account: acct(n), chain: arcTestnet, transport: http(RPC) })

interface Step {
  name: string
  pass: boolean
  detail: string
  hash?: Hash
  gasUsed?: string
  block?: string
}
const steps: Step[] = []
const ok = (name: string, detail: string, extra: Partial<Step> = {}) => {
  steps.push({ name, pass: true, detail, ...extra })
  console.log('PASS', name, '-', detail)
}
const bad = (name: string, detail: string, extra: Partial<Step> = {}) => {
  steps.push({ name, pass: false, detail, ...extra })
  console.log('FAIL', name, '-', detail)
}
const check = (name: string, cond: boolean, detail: string) => (cond ? ok(name, detail) : bad(name, detail))

type Args = readonly unknown[]

async function send(who: string, label: string, address: Address, abi: typeof atomicCloseoutAbi | typeof erc20Abi, functionName: string, args: Args): Promise<Hash | null> {
  try {
    const { request } = await pub.simulateContract({ address, abi, functionName, args, account: acct(who) } as never)
    const hash = await wc(who).writeContract(request as never)
    const r = await pub.waitForTransactionReceipt({ hash })
    if (r.status !== 'success') {
      bad(label, 'receipt status reverted', { hash })
      return null
    }
    ok(label, `${who} confirmed in block ${r.blockNumber}`, { hash, gasUsed: r.gasUsed.toString(), block: r.blockNumber.toString() })
    return hash
  } catch (e) {
    bad(label, `unexpected failure: ${(e as Error).message.split('\n')[0]}`)
    return null
  }
}

async function expectRevert(who: string, label: string, functionName: string, args: Args, errorName: string) {
  try {
    await pub.simulateContract({ address: CONTRACT, abi: atomicCloseoutAbi, functionName, args, account: acct(who) } as never)
    bad(label, `expected ${errorName} but call would succeed`)
  } catch (e) {
    const msg = (e as Error).message
    check(label, msg.includes(errorName), `reverts with ${errorName}`)
  }
}

const roundOf = (id: bigint) => pub.readContract({ address: CONTRACT, abi: atomicCloseoutAbi, functionName: 'getRound', args: [id] })
const usdcBal = (a: Address) => pub.readContract({ address: USDC, abi: erc20Abi, functionName: 'balanceOf', args: [a] })
const locked = () => pub.readContract({ address: CONTRACT, abi: atomicCloseoutAbi, functionName: 'totalLocked' })
const STATUS = ['None', 'Approval', 'Funding', 'Settled', 'Expired', 'Refunded', 'Cancelled']

function mkExpense(id: string, payer: number, amount: bigint): Expense {
  return { id, title: id, category: 'Test', date: '2026-10-25', payer, amount, mode: 'equal', included: [true, true, true], custom: [0n, 0n, 0n], bps: [0, 0, 0] }
}

async function main() {
  const A = acct('alex').address
  const B = acct('maya').address
  const C = acct('jordan').address
  const S = acct('stranger').address
  const sink = acct(generateSink()).address
  console.log('contract', CONTRACT, 'wallets', A, B, C)

  // sanity: right chain and right contract
  const chainId = await pub.getChainId()
  check('network: Arc Testnet chain id', chainId === 5042002, `chainId ${chainId}`)
  const tokenAddr = await pub.readContract({ address: CONTRACT, abi: atomicCloseoutAbi, functionName: 'USDC' })
  check('contract uses Arc USDC ERC-20 interface', tokenAddr.toLowerCase() === USDC, tokenAddr)
  const decimals = await pub.readContract({ address: USDC, abi: erc20Abi, functionName: 'decimals' })
  check('USDC ERC-20 decimals are 6', decimals === 6, String(decimals))
  const lockedStart = await locked()

  // ---- scenario 1: full settlement. Expenses in exact base units, netted by the app's own model.
  // Alex paid 12.000001, Maya paid 1.5, Jordan paid 0: shares split equally with odd remainder to the earliest member.
  const expenses = [mkExpense('lodging', 0, 12_000_001n), mkExpense('snacks', 1, 1_500_000n)]
  const bal = computeBalances(expenses, 3)
  const plan = buildPlan(bal.net)
  check('model: net positions sum to zero', bal.net.reduce((x, y) => x + y, 0n) === 0n, bal.net.join(','))
  const expensesHash = hashExpenses(expenses, 3)
  console.log('plan', plan.debts, plan.credits)

  await send('alex', 'createGroup', CONTRACT, atomicCloseoutAbi, 'createGroup', ['E2E ' + new Date().toISOString().slice(0, 16), [A, B, C]])
  const groupId = await pub.readContract({ address: CONTRACT, abi: atomicCloseoutAbi, functionName: 'groupCount' })
  const g = await pub.readContract({ address: CONTRACT, abi: atomicCloseoutAbi, functionName: 'getGroup', args: [groupId] })
  check('state: group members stored in order', g.members[0] === A && g.members[1] === B && g.members[2] === C, `group #${groupId}`)
  await expectRevert('alex', 'createGroup rejects duplicate member', 'createGroup', ['dup', [A, A]], 'DuplicateMember')
  await expectRevert('stranger', 'proposePlan rejects non-member', 'proposePlan', [groupId, plan.debts, plan.credits, BigInt(Math.floor(Date.now() / 1000) + 3600), expensesHash], 'NotMember')

  const head = await pub.getBlock()
  const deadline1 = head.timestamp + 3600n
  await expectRevert('alex', 'proposePlan rejects unbalanced plan', 'proposePlan', [groupId, [0n, plan.debts[1] + 1n, plan.debts[2]], plan.credits, deadline1, expensesHash], 'PlanUnbalanced')
  await send('alex', 'proposePlan', CONTRACT, atomicCloseoutAbi, 'proposePlan', [groupId, plan.debts, plan.credits, deadline1, expensesHash])
  const roundId = await pub.readContract({ address: CONTRACT, abi: atomicCloseoutAbi, functionName: 'roundCount' })
  let r = await roundOf(roundId)
  check('state: round is Approval', STATUS[r.status] === 'Approval', STATUS[r.status])
  const tsHash = computePlanHash({ chainId: 5042002, contract: CONTRACT, groupId, roundId, members: g.members, debts: plan.debts, credits: plan.credits, deadline: deadline1, expensesHash })
  check('plan ID: browser-side TypeScript hash equals onchain hash', tsHash.toLowerCase() === r.planHash.toLowerCase(), r.planHash)
  await expectRevert('alex', 'proposePlan blocked while round active', 'proposePlan', [groupId, plan.debts, plan.credits, deadline1, expensesHash], 'RoundStillActive')
  await expectRevert('maya', 'fund before unanimous approval', 'fund', [roundId], 'WrongStatus')
  await expectRevert('alex', 'approve with wrong plan hash', 'approvePlan', [roundId, ('0x' + '11'.repeat(32))], 'PlanHashMismatch')
  await expectRevert('stranger', 'approve by non-member', 'approvePlan', [roundId, r.planHash], 'NotMember')

  for (const who of ['alex', 'maya', 'jordan']) {
    await send(who, `approvePlan (${who})`, CONTRACT, atomicCloseoutAbi, 'approvePlan', [roundId, r.planHash])
    if (who === 'alex') await expectRevert('alex', 'duplicate approval', 'approvePlan', [roundId, r.planHash], 'AlreadyApproved')
  }
  r = await roundOf(roundId)
  check('state: unanimous approvals open Funding', STATUS[r.status] === 'Funding' && r.approvalCount === 3, `${STATUS[r.status]} ${r.approvalCount}/3`)

  await expectRevert('alex', 'creditor cannot fund (NotDebtor)', 'fund', [roundId], 'NotDebtor')
  await expectRevert('maya', 'fund without allowance fails', 'fund', [roundId], 'allowance')
  await expectRevert('alex', 'finalize impossible before funding', 'finalize', [roundId], 'NotFullyFunded')

  for (const [who, idx] of [['maya', 1], ['jordan', 2]] as const) {
    const debt = plan.debts[idx]
    await send(who, `USDC approve exact ${debt} (${who})`, USDC, erc20Abi, 'approve', [CONTRACT, debt])
    const before = await usdcBal(CONTRACT)
    await send(who, `fund ${debt} (${who})`, CONTRACT, atomicCloseoutAbi, 'fund', [roundId])
    const after = await usdcBal(CONTRACT)
    check(`accounting: contract USDC +${debt} exactly after ${who} funds`, after - before === debt, `${before} -> ${after}`)
    await expectRevert(who, `double funding rejected (${who})`, 'fund', [roundId], 'AlreadyFunded')
  }
  r = await roundOf(roundId)
  check('state: fundedTotal equals totalAmount', r.fundedTotal === r.totalAmount, `${r.fundedTotal}/${r.totalAmount}`)
  check('state: still Funding (funding is not settlement)', STATUS[r.status] === 'Funding', STATUS[r.status])
  await expectRevert('maya', 'refund impossible when fully funded', 'refund', [roundId], 'NotRefundable')
  await expectRevert('alex', 'withdraw before finalize', 'withdraw', [roundId], 'NotSettled')

  await send('jordan', 'finalize (permissionless, called by a debtor)', CONTRACT, atomicCloseoutAbi, 'finalize', [roundId])
  r = await roundOf(roundId)
  check('state: Settled with entitlements recorded', STATUS[r.status] === 'Settled' && r.credits[0] === plan.credits[0], `${STATUS[r.status]} credit ${r.credits[0]}`)
  await expectRevert('alex', 'finalize twice', 'finalize', [roundId], 'WrongStatus')
  await expectRevert('maya', 'debtor cannot withdraw', 'withdraw', [roundId], 'NotCreditor')
  await expectRevert('alex', 'withdrawTo zero address', 'withdrawTo', [roundId, '0x0000000000000000000000000000000000000000'], 'ZeroRecipient')

  const cBefore = await usdcBal(CONTRACT)
  const sinkBefore = await usdcBal(sink)
  await send('alex', 'withdrawTo fresh address (exact recipient delta)', CONTRACT, atomicCloseoutAbi, 'withdrawTo', [roundId, sink])
  const cAfter = await usdcBal(CONTRACT)
  const sinkAfter = await usdcBal(sink)
  check('accounting: recipient received exactly the entitlement', sinkAfter - sinkBefore === plan.credits[0], `${sinkBefore} -> ${sinkAfter}`)
  check('accounting: contract paid out exactly the entitlement', cBefore - cAfter === plan.credits[0], `${cBefore} -> ${cAfter}`)
  await expectRevert('alex', 'double withdraw rejected', 'withdraw', [roundId], 'AlreadyWithdrawn')
  r = await roundOf(roundId)
  check('state: withdrawnTotal equals totalAmount', r.withdrawnTotal === r.totalAmount && r.withdrawn[0], `${r.withdrawnTotal}`)
  check('invariant: totalLocked back to starting value', (await locked()) === lockedStart, `${await locked()}`)

  // ---- scenario 2: expiry and refund. Minimum window is 5 minutes.
  const plan2 = { debts: [0n, 1_000_000n, 1_000_000n], credits: [2_000_000n, 0n, 0n] }
  const head2 = await pub.getBlock()
  const deadline2 = head2.timestamp + 330n
  await send('alex', 'proposePlan (round 2, expiry scenario)', CONTRACT, atomicCloseoutAbi, 'proposePlan', [groupId, plan2.debts, plan2.credits, deadline2, expensesHash])
  const round2 = await pub.readContract({ address: CONTRACT, abi: atomicCloseoutAbi, functionName: 'roundCount' })
  const r2 = await roundOf(round2)
  for (const who of ['alex', 'maya', 'jordan']) await send(who, `approvePlan round 2 (${who})`, CONTRACT, atomicCloseoutAbi, 'approvePlan', [round2, r2.planHash])
  await send('maya', 'USDC approve exact 1000000 (maya)', USDC, erc20Abi, 'approve', [CONTRACT, 1_000_000n])
  const lockedBefore2 = await locked()
  await send('maya', 'fund round 2 (maya only, jordan never funds)', CONTRACT, atomicCloseoutAbi, 'fund', [round2])
  check('invariant: totalLocked +1 USDC after deposit', (await locked()) - lockedBefore2 === 1_000_000n, `${await locked()}`)
  await expectRevert('maya', 'refund before deadline rejected', 'refund', [round2], 'NotRefundable')
  await expectRevert('alex', 'finalize with partial funding', 'finalize', [round2], 'NotFullyFunded')

  console.log('waiting for chain time to pass the deadline', deadline2.toString())
  for (;;) {
    const b = await pub.getBlock()
    if (b.timestamp >= deadline2) break
    await new Promise((res) => setTimeout(res, 10_000))
  }
  const r2b = await roundOf(round2)
  check('state: derived status is Expired after deadline', STATUS[r2b.status] === 'Expired', STATUS[r2b.status])
  await expectRevert('jordan', 'fund after deadline rejected', 'fund', [round2], 'DeadlinePassed')
  await expectRevert('jordan', 'non-depositor refund rejected', 'refund', [round2], 'NothingToRefund')
  await expectRevert('alex', 'creditor cannot take deposits', 'refund', [round2], 'NothingToRefund')
  await expectRevert('alex', 'withdraw on an expired round rejected', 'withdraw', [round2], 'NotSettled')
  const sink2 = acct(generateSink()).address
  const s2b = await usdcBal(sink2)
  const c2b = await usdcBal(CONTRACT)
  await send('maya', 'refundTo fresh address (own deposit only)', CONTRACT, atomicCloseoutAbi, 'refundTo', [round2, sink2])
  check('accounting: depositor recovered exactly 1.000000 USDC', (await usdcBal(sink2)) - s2b === 1_000_000n, `${s2b} -> ${await usdcBal(sink2)}`)
  check('accounting: contract returned exactly 1.000000 USDC', c2b - (await usdcBal(CONTRACT)) === 1_000_000n, '')
  await expectRevert('maya', 'double refund rejected', 'refund', [round2], 'AlreadyRefunded')
  const r2c = await roundOf(round2)
  check('state: derived status is Refunded after all deposits returned', STATUS[r2c.status] === 'Refunded', STATUS[r2c.status])
  check('invariant: totalLocked back to starting value', (await locked()) === lockedStart, `${await locked()}`)
  void S
}

function generateSink(): string {
  const n = 'sink' + Math.random().toString(36).slice(2, 8)
  wallets[n] = { privateKey: generatePrivateKey() }
  return n
}

let fatal: string | null = null
try {
  await main()
} catch (e) {
  fatal = (e as Error).message
  console.log('FATAL', fatal)
}

const passed = steps.filter((s) => s.pass).length
const failed = steps.length - passed
const out = { contract: CONTRACT, chainId: 5042002, ranAt: new Date().toISOString(), passed, failed, fatal, steps }
fs.mkdirSync(new URL('../docs/test-results', import.meta.url).pathname, { recursive: true })
fs.writeFileSync(new URL('../docs/test-results/testnet-e2e.json', import.meta.url).pathname, JSON.stringify(out, null, 2))
const md = [
  '# Live Arc Testnet lifecycle test',
  '',
  `Contract: ${CONTRACT} (chain 5042002). Run at ${out.ranAt}. Generated by scripts/testnet-e2e.ts.`,
  '',
  `Result: **${passed} passed, ${failed} failed**${fatal ? `, fatal error: ${fatal}` : ''}.`,
  '',
  '| Result | Step | Detail | Transaction |',
  '|---|---|---|---|',
  ...steps.map((s) => `| ${s.pass ? 'PASS' : 'FAIL'} | ${s.name} | ${s.detail.replace(/\|/g, '/')} | ${s.hash ? `[${s.hash.slice(0, 10)}…](${EXPLORER}/tx/${s.hash})` : 'call simulation / read'} |`),
].join('\n')
fs.writeFileSync(new URL('../docs/test-results/testnet-e2e.md', import.meta.url).pathname, md + '\n')
console.log(`DONE ${passed} passed, ${failed} failed`)
process.exit(failed > 0 || fatal ? 1 : 0)
