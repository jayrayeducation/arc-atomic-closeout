import { ArrowDownToLine, ArrowUpFromLine } from 'lucide-react'
import type { PlanAmounts } from '@/lib/settlement'
import { explainTransfers } from '@/lib/settlement'
import type { Member } from '@/lib/members'
import { usdc } from '@/lib/format'

interface Props {
  members: Member[]
  plan: PlanAmounts
  /** Highlight the connected wallet's row. */
  me?: number
}

const first = (n: string) => n.split(' (')[0]

/** Debtor obligations, creditor entitlements, and an explanatory who-covers-whom breakdown. */
export function SettlementPlan({ members, plan, me }: Props) {
  const transfers = explainTransfers(plan)
  const row = (i: number, amount: bigint, kind: 'pay' | 'get') => (
    <li key={i} className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm ${me === i ? 'bg-cyan/10 ring-1 ring-cyan/30' : 'bg-white/[0.03]'}`}>
      <span className="truncate font-medium">
        {members[i].name}
        {me === i && <span className="ml-2 text-xs text-cyan">you</span>}
      </span>
      <span className={`num font-semibold ${kind === 'pay' ? 'text-bad' : 'text-ok'}`}>{usdc(amount)} USDC</span>
    </li>
  )
  const debtors = plan.debts.map((d, i) => (d > 0n ? row(i, d, 'pay') : null)).filter(Boolean)
  const creditors = plan.credits.map((c, i) => (c > 0n ? row(i, c, 'get') : null)).filter(Boolean)
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="label mb-2 flex items-center gap-1.5">
            <ArrowUpFromLine className="h-3.5 w-3.5" aria-hidden /> Debtors deposit
          </p>
          <ul className="space-y-1.5">{debtors.length ? debtors : <li className="text-sm text-ink-mute">No debtors.</li>}</ul>
        </div>
        <div>
          <p className="label mb-2 flex items-center gap-1.5">
            <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden /> Creditors receive
          </p>
          <ul className="space-y-1.5">{creditors.length ? creditors : <li className="text-sm text-ink-mute">No creditors.</li>}</ul>
        </div>
      </div>
      <div className="surface-inner p-4">
        <p className="label">Total to settle</p>
        <p className="num font-display text-2xl font-semibold">{usdc(plan.total)} USDC</p>
        {transfers.length > 0 && (
          <>
            <p className="label mt-4">Who covers whom (explanatory)</p>
            <ul className="mt-2 space-y-1 text-sm text-ink-dim">
              {transfers.map((t, i) => (
                <li key={i} className="num">
                  {first(members[t.from].name)} covers {first(members[t.to].name)}: <span className="font-semibold text-ink">{usdc(t.amount)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink-mute">
              The contract pools deposits and pays each creditor their entitlement. This breakdown only explains where the money comes from.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
