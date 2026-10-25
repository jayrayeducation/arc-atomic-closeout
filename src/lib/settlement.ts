/**
 * Atomic Closeout financial model.
 *
 * Every amount is a bigint count of USDC base units (6 decimals, the ERC-20
 * view of Arc USDC). No floating point is used anywhere in this file.
 * Rounding is deterministic: leftovers go to participants by stable member
 * order, which is the order stored onchain when the group is created.
 */
import { encodeAbiParameters, keccak256, stringToHex, type Address, type Hex } from 'viem'

export const MIN_MEMBERS = 2
export const MAX_MEMBERS = 8
export const BPS_TOTAL = 10_000

export type SplitMode = 'equal' | 'custom' | 'percent'

/** One shared cost. Arrays are indexed by stable member order. */
export interface Expense {
  id: string
  title: string
  category: string
  /** ISO date, YYYY-MM-DD */
  date: string
  payer: number
  amount: bigint
  mode: SplitMode
  /** Which members participate in this cost. */
  included: boolean[]
  /** Custom split: exact base units per member (only used when mode is custom). */
  custom: bigint[]
  /** Percentage split: basis points per member, summing to 10 000 (mode percent). */
  bps: number[]
}

export type Allocation = { ok: true; shares: bigint[] } | { ok: false; error: string }

export function allocateExpense(expense: Expense, memberCount: number): Allocation {
  const { amount, payer, included, mode } = expense
  if (amount <= 0n) return { ok: false, error: 'Amount must be greater than zero.' }
  if (payer < 0 || payer >= memberCount) return { ok: false, error: 'Choose a payer from the group.' }
  if (included.length !== memberCount) return { ok: false, error: 'Participant list does not match the group.' }
  const idx: number[] = []
  included.forEach((on, i) => {
    if (on) idx.push(i)
  })
  if (idx.length === 0) return { ok: false, error: 'Include at least one member.' }
  const shares: bigint[] = new Array<bigint>(memberCount).fill(0n)

  if (mode === 'equal') {
    const k = BigInt(idx.length)
    const base = amount / k
    const rem = Number(amount % k)
    idx.forEach((memberIndex, position) => {
      shares[memberIndex] = base + (position < rem ? 1n : 0n)
    })
    return { ok: true, shares }
  }

  if (mode === 'custom') {
    let sum = 0n
    for (let i = 0; i < memberCount; i++) {
      const v = included[i] ? (expense.custom[i] ?? 0n) : 0n
      if (v < 0n) return { ok: false, error: 'Custom amounts cannot be negative.' }
      shares[i] = v
      sum += v
    }
    if (sum !== amount) {
      return { ok: false, error: 'Custom amounts must add up exactly to the expense total.' }
    }
    return { ok: true, shares }
  }

  // percent: floor each share, then hand the remaining base units to the
  // largest fractional remainders (ties broken by lowest member index).
  let bpsSum = 0
  const parts: { i: number; frac: bigint }[] = []
  let assigned = 0n
  for (const i of idx) {
    const b = expense.bps[i] ?? 0
    if (!Number.isInteger(b) || b < 0) return { ok: false, error: 'Percentages must be whole basis points.' }
    bpsSum += b
    const exact = amount * BigInt(b)
    const floor = exact / BigInt(BPS_TOTAL)
    shares[i] = floor
    assigned += floor
    parts.push({ i, frac: exact % BigInt(BPS_TOTAL) })
  }
  if (bpsSum !== BPS_TOTAL) return { ok: false, error: 'Percentages must add up to exactly 100%.' }
  parts.sort((a, b) => (a.frac === b.frac ? a.i - b.i : a.frac > b.frac ? -1 : 1))
  let leftover = Number(amount - assigned)
  for (const p of parts) {
    if (leftover === 0) break
    shares[p.i] += 1n
    leftover--
  }
  return { ok: true, shares }
}

export interface Balances {
  paid: bigint[]
  share: bigint[]
  /** paid - share. Positive: owed money (creditor). Negative: owes money (debtor). */
  net: bigint[]
}

export function computeBalances(expenses: Expense[], memberCount: number): Balances {
  const paid = new Array<bigint>(memberCount).fill(0n)
  const share = new Array<bigint>(memberCount).fill(0n)
  for (const e of expenses) {
    const a = allocateExpense(e, memberCount)
    if (!a.ok) throw new Error(`Invalid expense "${e.title}": ${a.error}`)
    paid[e.payer] += e.amount
    a.shares.forEach((s, i) => {
      share[i] += s
    })
  }
  const net = paid.map((p, i) => p - share[i])
  const sum = net.reduce((x, y) => x + y, 0n)
  if (sum !== 0n) throw new Error('Internal error: net positions do not sum to zero.')
  return { paid, share, net }
}

export interface PlanAmounts {
  debts: bigint[]
  credits: bigint[]
  total: bigint
}

/** Debtor obligations and creditor entitlements as the contract stores them. */
export function buildPlan(net: bigint[]): PlanAmounts {
  const debts = net.map((n) => (n < 0n ? -n : 0n))
  const credits = net.map((n) => (n > 0n ? n : 0n))
  const d = debts.reduce((x, y) => x + y, 0n)
  const c = credits.reduce((x, y) => x + y, 0n)
  if (d !== c) throw new Error('Internal error: plan is not balanced.')
  return { debts, credits, total: d }
}

export interface Transfer {
  from: number
  to: number
  amount: bigint
}

/**
 * Human-readable "who covers whom" breakdown (greedy, stable order).
 * Explanatory only: the contract pools debtor deposits and pays each creditor
 * their entitlement, which equals the sum of the rows addressed to them.
 */
export function explainTransfers(plan: PlanAmounts): Transfer[] {
  const debts = [...plan.debts]
  const credits = [...plan.credits]
  const out: Transfer[] = []
  let c = 0
  for (let d = 0; d < debts.length; d++) {
    while (debts[d] > 0n) {
      while (c < credits.length && credits[c] === 0n) c++
      if (c >= credits.length) break
      const amt = debts[d] < credits[c] ? debts[d] : credits[c]
      out.push({ from: d, to: c, amount: amt })
      debts[d] -= amt
      credits[c] -= amt
    }
  }
  return out
}

/**
 * Commitment to the economically relevant expense data (payer, amount and the
 * resulting per-member shares). Titles, categories and notes stay private.
 */
export function hashExpenses(expenses: Expense[], memberCount: number): Hex {
  const lines = expenses.map((e) => {
    const a = allocateExpense(e, memberCount)
    if (!a.ok) throw new Error(`Invalid expense "${e.title}": ${a.error}`)
    return `${e.payer}|${e.amount.toString()}|${a.shares.map((s) => s.toString()).join(',')}`
  })
  return keccak256(stringToHex(`AtomicCloseout.Expenses.v1\n${lines.join('\n')}`))
}

export const PLAN_TYPEHASH: Hex = keccak256(stringToHex('AtomicCloseout.Plan.v1'))

export interface PlanHashInput {
  chainId: number
  contract: Address
  groupId: bigint
  roundId: bigint
  members: readonly Address[]
  debts: readonly bigint[]
  credits: readonly bigint[]
  deadline: bigint
  expensesHash: Hex
}

/** Byte-for-byte mirror of AtomicCloseout._computePlanHash. */
export function computePlanHash(p: PlanHashInput): Hex {
  const encoded = encodeAbiParameters(
    [
      { type: 'bytes32' },
      { type: 'uint256' },
      { type: 'address' },
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'address[]' },
      { type: 'uint128[]' },
      { type: 'uint128[]' },
      { type: 'uint64' },
      { type: 'bytes32' },
    ],
    [
      PLAN_TYPEHASH,
      BigInt(p.chainId),
      p.contract,
      p.groupId,
      p.roundId,
      [...p.members],
      [...p.debts],
      [...p.credits],
      p.deadline,
      p.expensesHash,
    ],
  )
  return keccak256(encoded)
}

/** Validate a group's member list the same way the contract does. */
export function validateMembers(addresses: string[]): string | null {
  if (addresses.length < MIN_MEMBERS || addresses.length > MAX_MEMBERS) {
    return `A group needs ${MIN_MEMBERS} to ${MAX_MEMBERS} members.`
  }
  const seen = new Set<string>()
  for (const a of addresses) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(a)) return `"${a}" is not a valid wallet address.`
    if (/^0x0{40}$/.test(a)) return 'The zero address cannot be a member.'
    const k = a.toLowerCase()
    if (seen.has(k)) return 'Each wallet can appear only once.'
    seen.add(k)
  }
  return null
}
