/**
 * "Weekend Trip" sample group. EVERYTHING in this file is DEMO DATA:
 * the member addresses are obvious placeholders, not real wallets, and no
 * onchain transaction ever exists for them.
 */
import type { Address } from 'viem'
import { parseUsdc } from '@/onchain-money'
import type { Expense } from './settlement'

export const DEMO_MEMBERS: { name: string; address: Address }[] = [
  { name: 'Alex', address: '0x000000000000000000000000000000000000de01' },
  { name: 'Maya', address: '0x000000000000000000000000000000000000de02' },
  { name: 'Jordan', address: '0x000000000000000000000000000000000000de03' },
]

const all = [true, true, true]
const none = [0n, 0n, 0n]
const zeroBps = [0, 0, 0]

export const DEMO_EXPENSES: Expense[] = [
  {
    id: 'demo-1',
    title: 'Lakehouse, two nights',
    category: 'Lodging',
    date: '2026-09-12',
    payer: 0,
    amount: parseUsdc('480'),
    mode: 'equal',
    included: all,
    custom: none,
    bps: zeroBps,
  },
  {
    id: 'demo-2',
    title: 'Groceries',
    category: 'Food',
    date: '2026-09-12',
    payer: 1,
    amount: parseUsdc('127.45'),
    mode: 'equal',
    included: all,
    custom: none,
    bps: zeroBps,
  },
  {
    id: 'demo-3',
    title: 'Car rental',
    category: 'Transport',
    date: '2026-09-12',
    payer: 2,
    amount: parseUsdc('210.10'),
    mode: 'equal',
    included: all,
    custom: none,
    bps: zeroBps,
  },
  {
    id: 'demo-4',
    title: 'Saturday dinner (Alex and Maya)',
    category: 'Food',
    date: '2026-09-13',
    payer: 0,
    amount: parseUsdc('96'),
    mode: 'equal',
    included: [true, true, false],
    custom: none,
    bps: zeroBps,
  },
  {
    id: 'demo-5',
    title: 'Kayak rental (50 / 25 / 25)',
    category: 'Activities',
    date: '2026-09-13',
    payer: 1,
    amount: parseUsdc('90'),
    mode: 'percent',
    included: all,
    custom: none,
    bps: [5000, 2500, 2500],
  },
]

/** The scripted 60 to 90 second walkthrough. Every step is simulated. */
export const DEMO_STEPS = [
  { id: 'expenses', title: 'Track expenses', detail: 'Five shared costs are entered with exact USDC amounts.' },
  { id: 'netting', title: 'Net the balances', detail: 'Paid minus assigned share gives every signed net position, summing to exactly zero.' },
  { id: 'plan', title: 'Lock the plan', detail: 'A plan ID hashes the chain, contract, group, round, member order, amounts and expiry.' },
  { id: 'approve', title: 'Everyone approves', detail: 'Each member consents to that exact plan ID. Any change would need a new plan.' },
  { id: 'fund', title: 'Debtors fund', detail: 'Maya and Jordan each deposit their exact obligation.' },
  { id: 'finalize', title: 'Finalize', detail: 'Full funding turns the deposits into creditor entitlements in one step.' },
  { id: 'withdraw', title: 'Creditor withdraws', detail: 'Alex claims the entitlement. Withdrawal is a separate step.' },
  { id: 'evidence', title: 'Explorer evidence', detail: 'Real runs link to confirmed transactions. This scripted run has none.' },
] as const

export type DemoStepId = (typeof DEMO_STEPS)[number]['id']
