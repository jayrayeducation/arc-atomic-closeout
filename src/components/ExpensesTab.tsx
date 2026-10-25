import { useState } from 'react'
import { Download, Upload } from 'lucide-react'
import type { Expense } from '@/lib/settlement'
import type { Member } from '@/lib/members'
import { exportExpenses, importExpenses, type LocalGroupData } from '@/lib/storage'
import { Callout, Card } from './primitives'
import { ExpenseEditor } from './ExpenseEditor'
import { ExpenseTable } from './ExpenseTable'

interface Props {
  members: Member[]
  expenses: Expense[]
  names: Record<string, string>
  me: number
  locked: boolean
  onAdd: (e: Expense) => void
  onDelete: (id: string) => void
  onNameChange: (addr: string, name: string) => void
  onReplace: (d: LocalGroupData) => void
}

export function ExpensesTab({ members, expenses, names, me, locked, onAdd, onDelete, onNameChange, onReplace }: Props) {
  const [text, setText] = useState('')
  const [showIo, setShowIo] = useState(false)
  const [ioError, setIoError] = useState<string | null>(null)

  return (
    <div className="space-y-6">
      <Callout title="Stored in this browser only">
        Expense titles, categories and dates are saved in local browser storage. They are never put in a link, are not uploaded, and may not synchronize across devices. Only the final amounts are written onchain when you propose a plan.
      </Callout>
      {locked && (
        <Callout tone="warn" title="A plan is already live">
          Edits here do not change the proposed plan. The immutable onchain plan stays authoritative.
        </Callout>
      )}
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Card title="Add an expense">
          <ExpenseEditor members={members} onAdd={onAdd} defaultPayer={Math.max(me, 0)} />
        </Card>
        <div className="space-y-6">
          <Card title="Expenses">
            <ExpenseTable expenses={expenses} members={members} onDelete={onDelete} />
          </Card>
          <Card title="Member labels">
            <ul className="space-y-2">
              {members.map((m) => (
                <li key={m.address} className="flex items-center gap-2">
                  <input
                    className="input"
                    aria-label={`Label for ${m.address}`}
                    placeholder={m.name}
                    defaultValue={names[m.address.toLowerCase()] ?? ''}
                    maxLength={24}
                    onBlur={(e) => onNameChange(m.address, e.target.value)}
                  />
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-ink-mute">Labels are local. Wallet addresses are the real identities.</p>
          </Card>
          <div>
            <button className="btn-ghost" onClick={() => setShowIo((s) => !s)}>
              <Upload className="h-4 w-4" aria-hidden /> Move notes to another device
            </button>
            {showIo && (
              <div className="surface-inner mt-3 space-y-3 p-4">
                <button className="btn-ghost" onClick={() => setText(exportExpenses({ expenses, names }))}>
                  <Download className="h-4 w-4" aria-hidden /> Export as text
                </button>
                <textarea className="input min-h-[120px] py-2 font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste an export here to import it" aria-label="Export or import text" />
                <button
                  className="btn-ghost"
                  onClick={() => {
                    try {
                      onReplace(importExpenses(text))
                      setIoError(null)
                    } catch (err) {
                      setIoError(err instanceof Error ? err.message : 'Import failed.')
                    }
                  }}
                >
                  Replace local notes with this text
                </button>
                {ioError && <p className="text-xs text-bad">{ioError}</p>}
                <p className="text-xs text-ink-mute">Treat the export as private. Share it only with group members.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
