import { useState } from 'react'
import { Download, Upload } from 'lucide-react'
import type { Expense } from '@/lib/settlement'
import type { Member } from '@/lib/members'
import { exportLocalGroup, importLocalGroup, importLegacyExpenses, type LocalGroupData } from '@/lib/storage'
import { Callout, Card } from './primitives'
import { ExpenseEditor } from './ExpenseEditor'
import { ExpenseTable } from './ExpenseTable'

interface Props {
  members: Member[]
  expenses: Expense[]
  names: Record<string, string>
  localTitle?: string
  description?: string
  visibility?: LocalGroupData['visibility']
  me: number
  locked: boolean
  storageKey: string
  groupId: bigint
  chainId: number
  onAdd: (e: Expense) => void
  onDelete: (id: string) => void
  onUpdate: (expense: Expense) => void
  onNameChange: (addr: string, name: string) => void
  onReplace: (d: LocalGroupData) => void
}

export function ExpensesTab({ members, expenses, names, localTitle, description, visibility, me, locked, storageKey, groupId, chainId, onAdd, onDelete, onUpdate, onNameChange, onReplace }: Props) {
  const [text, setText] = useState('')
  const [showIo, setShowIo] = useState(false)
  const [ioError, setIoError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [legacy, setLegacy] = useState(false)
  const [backupDownloaded, setBackupDownloaded] = useState(false)
  const addresses = members.map((m) => m.address)
  const backupText = () => exportLocalGroup(storageKey, { expenses, names, localTitle, description, visibility }, addresses)
  const downloadBackup = () => {
    const url = URL.createObjectURL(new Blob([backupText()], { type: 'application/json' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `atomic-closeout-group-${groupId}-local-backup.json`; anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setBackupDownloaded(true)
  }

  return (
    <div className="space-y-6">
      <Callout title="Stored in this browser only">
        Expense titles, categories and dates are saved in local browser storage. They are never put in a link, are not uploaded, and may not synchronize across devices. Only the final amounts are written onchain when you propose a plan.
      </Callout>
      {locked && (
        <Callout tone="warn" title="A plan is already live">
          Edits here do not change any proposed or settled plan. Compare local calculations with the immutable onchain plan before using these notes again.
        </Callout>
      )}
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <Card title="Add an expense">
          {editing ? <><ExpenseEditor key={editing.id} members={members} initial={editing} onAdd={onAdd} onSave={(expense) => { onUpdate(expense); setEditing(null) }} /><button type="button" className="btn-ghost mt-3" onClick={() => setEditing(null)}>Cancel edit</button></>
            : <ExpenseEditor members={members} onAdd={onAdd} defaultPayer={Math.max(me, 0)} />}
        </Card>
        <div className="space-y-6">
          <Card title="Expenses">
            <ExpenseTable expenses={expenses} members={members} onEdit={setEditing} onDelete={(id) => { if (window.confirm('Delete this local expense? The onchain plan and history will not change.')) onDelete(id) }} />
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
                <button className="btn-ghost" onClick={() => setText(backupText())}>
                  <Download className="h-4 w-4" aria-hidden /> Export as text
                </button>
                <button className="btn-ghost ml-2" onClick={downloadBackup}>Download current backup</button>
                <textarea className="input min-h-[120px] py-2 font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste an export here to import it" aria-label="Export or import text" />
                <button
                  className="btn-ghost"
                  onClick={() => {
                    try {
                      if (chainId === 5042 && groupId === 1n && !backupDownloaded) throw new Error('Download the current Group #1 backup before replacing its local notes.')
                      const imported = legacy ? importLegacyExpenses(text, addresses) : importLocalGroup(text, storageKey, addresses)
                      if (!window.confirm('Replace local notes and local group settings in this browser? The onchain group and settlement remain unchanged.')) return
                      onReplace(legacy ? { ...imported, localTitle, description, visibility } : imported)
                      setIoError(null)
                    } catch (err) {
                      setIoError(err instanceof Error ? err.message : 'Import failed.')
                    }
                  }}
                >
                  Restore local backup from this text
                </button>
                <label className="flex items-center gap-2 text-xs text-ink-mute"><input type="checkbox" checked={legacy} onChange={(event) => setLegacy(event.target.checked)} /> Import legacy v1 notes without group binding (only after checking their source)</label>
                {ioError && <p className="text-xs text-bad">{ioError}</p>}
                {chainId === 5042 && groupId === 1n && !backupDownloaded && <p className="text-xs text-warn">Group #1: download the current backup before importing over contest notes.</p>}
                <p className="text-xs text-ink-mute">Treat the export as private. Share it only with group members.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
