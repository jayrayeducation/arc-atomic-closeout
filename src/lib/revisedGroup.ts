import type { Address } from 'viem'
import { allocateExpense, buildPlan, computeBalances, validateMembers, type Expense } from './settlement'
import { exportLocalGroup, importLocalGroup, type LocalGroupData } from './storage'

export interface RevisedDraft {
  chainId: number
  contract: Address
  sourceGroupId: string
  sourceStatus: string
  name: string
  description: string
  oldMembers: Address[]
  newMembers: Address[]
  notes: LocalGroupData
  skippedExpenses: number
}

const DRAFT_KEY = 'atomic-closeout:revised-group:v1'
const NOTES_KEY = 'revised-group-draft'

/** Keep an expense only when every participating wallet and its payer remain. */
export function remapExpenses(expenses: readonly Expense[], oldMembers: readonly Address[], newMembers: readonly Address[]) {
  const newIndex = new Map(newMembers.map((address, i) => [address.toLowerCase(), i]))
  const copied: Expense[] = []
  let skipped = 0
  for (const expense of expenses) {
    const payer = newIndex.get(oldMembers[expense.payer]?.toLowerCase())
    if (payer === undefined || oldMembers.some((address, i) => expense.included[i] && !newIndex.has(address.toLowerCase()))) { skipped++; continue }
    const included = new Array<boolean>(newMembers.length).fill(false)
    const custom = new Array<bigint>(newMembers.length).fill(0n)
    const bps = new Array<number>(newMembers.length).fill(0)
    oldMembers.forEach((address, i) => {
      const at = newIndex.get(address.toLowerCase())
      if (at !== undefined) { included[at] = expense.included[i]; custom[at] = expense.custom[i]; bps[at] = expense.bps[i] }
    })
    const revised = { ...expense, id: crypto.randomUUID(), payer, included, custom, bps }
    if (!allocateExpense(revised, newMembers.length).ok) { skipped++; continue }
    copied.push(revised)
  }
  return { copied, skipped }
}

export function prepareRevisedDraft(input: Omit<RevisedDraft, 'notes' | 'skippedExpenses'> & { sourceNotes: LocalGroupData }): RevisedDraft {
  const error = validateMembers(input.newMembers)
  if (error) throw new Error(error)
  if (!input.name.trim() || new TextEncoder().encode(input.name.trim()).length > 64) throw new Error('Group name must be 1–64 bytes.')
  const { copied, skipped } = remapExpenses(input.sourceNotes.expenses, input.oldMembers, input.newMembers)
  if (copied.length) buildPlan(computeBalances(copied, input.newMembers.length).net)
  const names = Object.fromEntries(Object.entries(input.sourceNotes.names).filter(([address]) => input.newMembers.some((member) => member.toLowerCase() === address.toLowerCase())))
  return { chainId: input.chainId, contract: input.contract, sourceGroupId: input.sourceGroupId,
    sourceStatus: input.sourceStatus, name: input.name.trim(), description: input.description,
    oldMembers: [...input.oldMembers], newMembers: [...input.newMembers],
    notes: { expenses: copied, names, localTitle: '', description: input.description, visibility: 'active' }, skippedExpenses: skipped }
}

export function saveRevisedDraft(draft: RevisedDraft): void {
  localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, notes: exportLocalGroup(NOTES_KEY, draft.notes, draft.newMembers) }))
}

export function loadRevisedDraft(chainId: number, contract: Address): RevisedDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw || raw.length > 1_000_000) return null
    const parsed = JSON.parse(raw) as Omit<RevisedDraft, 'notes'> & { notes: string }
    if (parsed.chainId !== chainId || parsed.contract?.toLowerCase() !== contract.toLowerCase() ||
        !/^\d+$/.test(parsed.sourceGroupId) || validateMembers(parsed.oldMembers) || validateMembers(parsed.newMembers) ||
        typeof parsed.name !== 'string' || typeof parsed.sourceStatus !== 'string' || typeof parsed.notes !== 'string') return null
    return { ...parsed, notes: importLocalGroup(parsed.notes, NOTES_KEY, parsed.newMembers) }
  } catch { return null }
}

export function clearRevisedDraft(): void { localStorage.removeItem(DRAFT_KEY) }
