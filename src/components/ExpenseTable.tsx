import { Pencil, Trash2 } from 'lucide-react'
import type { Expense } from '@/lib/settlement'
import { allocateExpense } from '@/lib/settlement'
import type { Member } from '@/lib/members'
import { usdc } from '@/lib/format'

interface Props {
  expenses: Expense[]
  members: Member[]
  onDelete?: (id: string) => void
  onEdit?: (expense: Expense) => void
}

const MODE_LABEL = { equal: 'Equal', custom: 'Custom', percent: 'Percentage' } as const

export function ExpenseTable({ expenses, members, onDelete, onEdit }: Props) {
  if (expenses.length === 0) {
    return <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-ink-mute">No expenses yet. Add the first shared cost.</p>
  }
  const total = expenses.reduce((a, e) => a + e.amount, 0n)
  return (
    <div>
      <ul className="divide-y divide-white/[0.05]">
        {expenses.map((e) => {
          const a = allocateExpense(e, members.length)
          return (
            <li key={e.id} className="flex flex-wrap items-start justify-between gap-3 py-3.5">
              <div className="min-w-0">
                <p className="truncate font-medium">{e.title}</p>
                <p className="mt-0.5 text-xs text-ink-mute">
                  {e.category} · {e.date} · paid by {members[e.payer]?.name.split(' (')[0] ?? 'unknown'} · {MODE_LABEL[e.mode]} split
                  {a.ok ? ` · ${a.shares.filter((s) => s > 0n).length} members` : ''}
                </p>
                {e.note && <p className="mt-1 text-xs text-ink-dim">{e.note}</p>}
              </div>
              <div className="flex items-center gap-3">
                <span className="num font-semibold">{usdc(e.amount)} USDC</span>
                {onEdit && <button type="button" className="grid h-10 w-10 place-items-center rounded-lg text-ink-mute hover:bg-white/[0.06] hover:text-cyan" aria-label={`Edit ${e.title}`} onClick={() => onEdit(e)}><Pencil className="h-4 w-4" aria-hidden /></button>}
                {onDelete && (
                  <button type="button" className="grid h-10 w-10 place-items-center rounded-lg text-ink-mute hover:bg-white/[0.06] hover:text-bad" aria-label={`Delete ${e.title}`} onClick={() => onDelete(e.id)}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      <div className="mt-2 flex justify-between border-t border-white/10 pt-3 text-sm">
        <span className="font-semibold">Total paid</span>
        <span className="num font-semibold">{usdc(total)} USDC</span>
      </div>
    </div>
  )
}
