import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { parseUsdc } from '@/onchain-money'
import { allocateExpense, type Expense, type SplitMode } from '@/lib/settlement'
import type { Member } from '@/lib/members'
import { usdc } from '@/lib/format'
import { Callout } from './primitives'

const CATEGORIES = ['Lodging', 'Food', 'Transport', 'Activities', 'Utilities', 'Other']

function tryParseUsdc(s: string): bigint | null {
  try {
    return s.trim() === '' ? null : parseUsdc(s.trim())
  } catch {
    return null
  }
}

/** "33.33" -> 3333 basis points, integer-only. */
function parsePercent(s: string): number | null {
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(s.trim())
  if (!m) return null
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || '0')
}

interface Props {
  members: Member[]
  onAdd: (e: Expense) => void
  /** Index of the connected member, used as the default payer. */
  defaultPayer?: number
}

export function ExpenseEditor({ members, onAdd, defaultPayer = 0 }: Props) {
  const n = members.length
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0])
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [payer, setPayer] = useState(defaultPayer)
  const [amountText, setAmountText] = useState('')
  const [mode, setMode] = useState<SplitMode>('equal')
  const [included, setIncluded] = useState<boolean[]>(() => new Array<boolean>(n).fill(true))
  const [customText, setCustomText] = useState<string[]>(() => new Array<string>(n).fill(''))
  const [pctText, setPctText] = useState<string[]>(() => new Array<string>(n).fill(''))
  const [touched, setTouched] = useState(false)

  const draft = useMemo<{ expense: Expense | null; error: string | null; shares: bigint[] | null }>(() => {
    const amount = tryParseUsdc(amountText)
    if (amountText.trim() === '') return { expense: null, error: 'Enter an amount.', shares: null }
    if (amount === null) return { expense: null, error: 'Amount must be a number with at most 6 decimals.', shares: null }
    if (!title.trim()) return { expense: null, error: 'Give the expense a title.', shares: null }
    const custom = customText.map((t) => tryParseUsdc(t) ?? 0n)
    const bps = pctText.map((t) => (t.trim() === '' ? 0 : (parsePercent(t) ?? -1)))
    if (mode === 'percent' && bps.some((b, i) => included[i] && b < 0)) {
      return { expense: null, error: 'Percentages use up to two decimals, for example 33.33.', shares: null }
    }
    if (mode === 'custom' && customText.some((t, i) => included[i] && t.trim() !== '' && tryParseUsdc(t) === null)) {
      return { expense: null, error: 'Custom amounts must be numbers with at most 6 decimals.', shares: null }
    }
    const expense: Expense = {
      id: crypto.randomUUID(),
      title: title.trim(),
      category,
      date,
      payer,
      amount,
      mode,
      included,
      custom,
      bps: bps.map((b) => Math.max(b, 0)),
    }
    const a = allocateExpense(expense, n)
    return a.ok ? { expense, error: null, shares: a.shares } : { expense: null, error: a.error, shares: null }
  }, [amountText, title, category, date, payer, mode, included, customText, pctText, n])

  const submit = () => {
    setTouched(true)
    if (!draft.expense) return
    onAdd(draft.expense)
    setTitle('')
    setAmountText('')
    setCustomText(new Array<string>(n).fill(''))
    setPctText(new Array<string>(n).fill(''))
    setTouched(false)
  }

  const setAt = <T,>(arr: T[], i: number, v: T) => arr.map((x, j) => (i === j ? v : x))

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Title</span>
          <input className="input mt-1.5" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Dinner on Saturday" maxLength={80} />
        </label>
        <label className="block">
          <span className="label">Amount (USDC)</span>
          <input className="input num mt-1.5" inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} placeholder="0.00" />
        </label>
        <label className="block">
          <span className="label">Category</span>
          <select className="input mt-1.5" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Date</span>
          <input className="input mt-1.5" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="block sm:col-span-2">
          <span className="label">Paid by</span>
          <select className="input mt-1.5" value={payer} onChange={(e) => setPayer(Number(e.target.value))}>
            {members.map((m, i) => (
              <option key={m.address} value={i}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset>
        <legend className="label mb-2">Split</legend>
        <div className="inline-flex rounded-xl border border-white/10 bg-navy-800 p-1">
          {(['equal', 'custom', 'percent'] as const).map((m) => (
            <button
              type="button"
              key={m}
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`min-h-[40px] rounded-lg px-4 text-sm font-semibold transition ${mode === m ? 'bg-white/10 text-cyan' : 'text-ink-dim'}`}
            >
              {m === 'equal' ? 'Equal' : m === 'custom' ? 'Custom amounts' : 'Percentages'}
            </button>
          ))}
        </div>
        <ul className="mt-3 space-y-2">
          {members.map((m, i) => (
            <li key={m.address} className="flex items-center gap-3">
              <label className="flex min-h-[44px] flex-1 items-center gap-3 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-[#43E0D0]" checked={included[i]} onChange={(e) => setIncluded(setAt(included, i, e.target.checked))} />
                <span className="truncate">{m.name}</span>
              </label>
              {mode === 'custom' && (
                <input className="input num w-32" inputMode="decimal" placeholder="0.00" disabled={!included[i]} value={customText[i]} onChange={(e) => setCustomText(setAt(customText, i, e.target.value))} aria-label={`Custom amount for ${m.name}`} />
              )}
              {mode === 'percent' && (
                <div className="flex items-center gap-1.5">
                  <input className="input num w-24" inputMode="decimal" placeholder="0" disabled={!included[i]} value={pctText[i]} onChange={(e) => setPctText(setAt(pctText, i, e.target.value))} aria-label={`Percentage for ${m.name}`} />
                  <span className="text-sm text-ink-mute">%</span>
                </div>
              )}
              {mode === 'equal' && draft.shares && <span className="num w-28 text-right text-sm text-ink-dim">{usdc(draft.shares[i])}</span>}
            </li>
          ))}
        </ul>
        {mode !== 'equal' && draft.shares && <p className="mt-2 text-xs text-ink-mute">Resulting shares: {draft.shares.map((s, i) => `${members[i].name.split(' (')[0]} ${usdc(s)}`).join(' · ')}</p>}
      </fieldset>

      {touched && draft.error && <Callout tone="bad">{draft.error}</Callout>}
      <button type="submit" className="btn-primary w-full sm:w-auto" disabled={touched && !draft.expense}>
        <Plus className="h-4 w-4" aria-hidden /> Add expense
      </button>
      <p className="text-xs text-ink-mute">Odd base units are assigned to included members in group order, so the same inputs always produce the same shares.</p>
    </form>
  )
}
