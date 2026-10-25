import { describe, expect, test } from 'bun:test'
import { keccak256, stringToHex } from 'viem'
import {
  allocateExpense,
  buildPlan,
  computeBalances,
  computePlanHash,
  explainTransfers,
  hashExpenses,
  validateMembers,
  type Expense,
} from '../src/lib/settlement'
import { DEMO_EXPENSES, DEMO_MEMBERS } from '../src/lib/demo'
import { parseUsdc, formatUsdc } from '../src/onchain-money'

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const base = (over: Partial<Expense>): Expense => ({
  id: 'x',
  title: 't',
  category: 'c',
  date: '2026-01-01',
  payer: 0,
  amount: 100n,
  mode: 'equal',
  included: [true, true, true],
  custom: [0n, 0n, 0n],
  bps: [0, 0, 0],
  ...over,
})

describe('USDC integer parsing', () => {
  test('exact six decimals', () => {
    expect(parseUsdc('1')).toBe(1_000_000n)
    expect(parseUsdc('0.000001')).toBe(1n)
    expect(formatUsdc(123_456_789n)).toBe('123.456789')
  })
  test('rejects a seventh decimal instead of rounding (deliberate wrong precision)', () => {
    expect(() => parseUsdc('0.0000001')).toThrow()
  })
  test('rejects an 18-decimal native-unit string being passed as USDC', () => {
    expect(() => parseUsdc('1.000000000000000000')).toThrow()
  })
})

describe('allocation', () => {
  test('equal split gives odd remainder to the earliest included members', () => {
    const a = allocateExpense(base({ amount: 100n }), 3)
    expect(a.ok && a.shares).toEqual([34n, 33n, 33n])
    const b = allocateExpense(base({ amount: 101n }), 3)
    expect(b.ok && b.shares).toEqual([34n, 34n, 33n])
  })
  test('excluded members receive nothing and order is stable', () => {
    const a = allocateExpense(base({ amount: 5n, included: [false, true, true] }), 3)
    expect(a.ok && a.shares).toEqual([0n, 3n, 2n])
  })
  test('custom must match the total exactly', () => {
    const bad = allocateExpense(base({ mode: 'custom', amount: 100n, custom: [50n, 30n, 19n] }), 3)
    expect(bad.ok).toBe(false)
    const good = allocateExpense(base({ mode: 'custom', amount: 100n, custom: [50n, 30n, 20n] }), 3)
    expect(good.ok && good.shares).toEqual([50n, 30n, 20n])
  })
  test('percentages must total 100% and use largest remainder with index tiebreak', () => {
    const bad = allocateExpense(base({ mode: 'percent', bps: [5000, 4000, 0] }), 3)
    expect(bad.ok).toBe(false)
    const good = allocateExpense(base({ mode: 'percent', amount: 101n, bps: [3333, 3333, 3334] }), 3)
    expect(good.ok && good.shares.reduce((x, y) => x + y, 0n)).toBe(101n)
  })
  test('rejects zero amounts, unknown payers and empty participation', () => {
    expect(allocateExpense(base({ amount: 0n }), 3).ok).toBe(false)
    expect(allocateExpense(base({ payer: 5 }), 3).ok).toBe(false)
    expect(allocateExpense(base({ included: [false, false, false] }), 3).ok).toBe(false)
  })
})

describe('conservation properties (randomized, seeded)', () => {
  test('shares sum to amount, nets sum to zero, plan balances, order-independent', () => {
    const r = rng(42)
    for (let round = 0; round < 400; round++) {
      const n = 2 + Math.floor(r() * 7)
      const count = 1 + Math.floor(r() * 6)
      const expenses: Expense[] = []
      for (let k = 0; k < count; k++) {
        const included = Array.from({ length: n }, () => r() > 0.3)
        if (!included.some(Boolean)) included[0] = true
        const amount = BigInt(1 + Math.floor(r() * 5_000_000_000))
        const payer = Math.floor(r() * n)
        const mode = r() < 0.6 ? 'equal' : 'percent'
        let bps = new Array<number>(n).fill(0)
        if (mode === 'percent') {
          const idx = included.map((v, i) => (v ? i : -1)).filter((i) => i >= 0)
          let left = 10000
          idx.forEach((i, pos) => {
            const v = pos === idx.length - 1 ? left : Math.floor(r() * (left + 1))
            bps[i] = v
            left -= v
          })
        } else bps = new Array<number>(n).fill(0)
        expenses.push({
          id: String(k),
          title: 't',
          category: 'c',
          date: '2026-01-01',
          payer,
          amount,
          mode,
          included,
          custom: new Array<bigint>(n).fill(0n),
          bps,
        })
      }
      for (const e of expenses) {
        const a = allocateExpense(e, n)
        expect(a.ok).toBe(true)
        if (a.ok) expect(a.shares.reduce((x, y) => x + y, 0n)).toBe(e.amount)
      }
      const bal = computeBalances(expenses, n)
      expect(bal.net.reduce((x, y) => x + y, 0n)).toBe(0n)
      const plan = buildPlan(bal.net)
      expect(plan.debts.reduce((x, y) => x + y, 0n)).toBe(plan.credits.reduce((x, y) => x + y, 0n))
      plan.debts.forEach((d, i) => expect(d > 0n && plan.credits[i] > 0n).toBe(false))
      const moved = explainTransfers(plan).reduce((x, t) => x + t.amount, 0n)
      expect(moved).toBe(plan.total)
      const shuffled = [...expenses].reverse()
      expect(computeBalances(shuffled, n).net).toEqual(bal.net)
    }
  })
})

describe('Weekend Trip fixture (exact math)', () => {
  const bal = computeBalances(DEMO_EXPENSES, 3)
  test('paid, share, net', () => {
    expect(bal.paid).toEqual([parseUsdc('576'), parseUsdc('217.45'), parseUsdc('210.1')])
    expect(bal.share).toEqual([parseUsdc('365.516668'), parseUsdc('343.016666'), parseUsdc('295.016666')])
    expect(bal.net).toEqual([parseUsdc('210.483332'), -parseUsdc('125.566666'), -parseUsdc('84.916666')])
  })
  test('plan and who-covers-whom', () => {
    const plan = buildPlan(bal.net)
    expect(plan.total).toBe(parseUsdc('210.483332'))
    expect(explainTransfers(plan)).toEqual([
      { from: 1, to: 0, amount: parseUsdc('125.566666') },
      { from: 2, to: 0, amount: parseUsdc('84.916666') },
    ])
  })
})

describe('plan hash', () => {
  const plan = buildPlan(computeBalances(DEMO_EXPENSES, 3).net)
  const input = {
    chainId: 5042002,
    contract: '0x00000000000000000000000000000000000000c1' as const,
    groupId: 1n,
    roundId: 1n,
    members: DEMO_MEMBERS.map((m) => m.address),
    debts: plan.debts,
    credits: plan.credits,
    deadline: 1_800_000_000n,
    expensesHash: hashExpenses(DEMO_EXPENSES, 3),
  }
  test('deterministic', () => {
    expect(computePlanHash(input)).toBe(computePlanHash({ ...input }))
  })
  test('binds chain, contract, group, round, ordering, amounts and expiry', () => {
    const h = computePlanHash(input)
    expect(computePlanHash({ ...input, chainId: 5042 })).not.toBe(h)
    expect(computePlanHash({ ...input, contract: '0x00000000000000000000000000000000000000c2' })).not.toBe(h)
    expect(computePlanHash({ ...input, groupId: 2n })).not.toBe(h)
    expect(computePlanHash({ ...input, roundId: 2n })).not.toBe(h)
    expect(computePlanHash({ ...input, members: [...input.members].reverse() })).not.toBe(h)
    expect(computePlanHash({ ...input, debts: [0n, plan.debts[1] + 1n, plan.debts[2]] })).not.toBe(h)
    expect(computePlanHash({ ...input, deadline: 1_800_000_001n })).not.toBe(h)
  })
})

describe('cross-language vector', () => {
  test('matches the Solidity vector (AtomicCloseout.HashVector.t.sol)', () => {
    const h = computePlanHash({
      chainId: 31337,
      contract: '0x2e234DAe75C793f67A35089C9d99245E1C58470b',
      groupId: 1n,
      roundId: 1n,
      members: DEMO_MEMBERS.map((m) => m.address),
      debts: [0n, 125_566_666n, 84_916_666n],
      credits: [210_483_332n, 0n, 0n],
      deadline: 1_800_000_000n,
      expensesHash: keccak256(stringToHex('vector-expenses')),
    })
    expect(h).toBe('0x24fcc93b9e534a44f1e5567b562b053a86c4c4f42b65d5c80cfa4014b76ae50e')
  })
})

describe('member validation', () => {
  const a = '0x000000000000000000000000000000000000de01'
  const b = '0x000000000000000000000000000000000000de02'
  test('rejects duplicates, zero, malformed and bad sizes', () => {
    expect(validateMembers([a, a])).not.toBeNull()
    expect(validateMembers([a, '0x0000000000000000000000000000000000000000'])).not.toBeNull()
    expect(validateMembers([a, 'nope'])).not.toBeNull()
    expect(validateMembers([a])).not.toBeNull()
    expect(validateMembers([a, b])).toBeNull()
  })
})
