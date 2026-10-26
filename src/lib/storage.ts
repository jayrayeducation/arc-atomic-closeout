/** Browser-local notes. Onchain membership, balances and plan state are never read from here. */
import { isAddress, type Address } from 'viem'
import { allocateExpense, type Expense, type SplitMode } from './settlement'

export type GroupVisibility = 'active' | 'archived' | 'hidden'
export interface LocalGroupData {
  expenses: Expense[]
  names: Record<string, string>
  localTitle?: string
  description?: string
  visibility?: GroupVisibility
}

type StoredExpense = Omit<Expense, 'amount' | 'custom'> & { amount: string; custom: string[] }
const PREFIX = 'atomic-closeout:v1'
const MAX_JSON = 1_000_000
export const LOCAL_GROUP_CHANGED = 'atomic-closeout:local-group-changed'
export const emptyLocalGroup = (): LocalGroupData => ({ expenses: [], names: {}, visibility: 'active' })

export function groupKey(chainId: number, contract: Address, groupId: bigint | number | string): string {
  return `${PREFIX}:${chainId}:${contract.toLowerCase()}:${groupId.toString()}`
}

const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max
const integer = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && Number(v) >= min && Number(v) <= max
const decimal = (v: unknown): v is string => typeof v === 'string' && /^\d{1,78}$/.test(v)

function parseExpense(value: unknown): Expense {
  if (!object(value) || !str(value.id, 100) || !value.id || !str(value.title, 80) || !value.title.trim() ||
      !str(value.category, 40) || !str(value.date, 10) || !/^\d{4}-\d{2}-\d{2}$/.test(value.date) ||
      !decimal(value.amount) || !['equal', 'custom', 'percent'].includes(String(value.mode)) ||
      !Array.isArray(value.included) || value.included.length < 2 || value.included.length > 8 ||
      !Array.isArray(value.custom) || !Array.isArray(value.bps) ||
      value.custom.length !== value.included.length || value.bps.length !== value.included.length ||
      !integer(value.payer, 0, value.included.length - 1) ||
      !value.included.every((v) => typeof v === 'boolean') || !value.custom.every(decimal) ||
      !value.bps.every((v) => integer(v, 0, 10_000)) ||
      (value.note !== undefined && !str(value.note, 500))) throw new Error('Invalid expense in local notes.')
  const expense: Expense = {
    id: value.id, title: value.title, category: value.category, date: value.date,
    payer: value.payer, amount: BigInt(value.amount), mode: value.mode as SplitMode,
    included: value.included, custom: value.custom.map(BigInt),
    bps: value.bps, note: value.note,
  }
  if (!allocateExpense(expense, expense.included.length).ok) throw new Error('Invalid split in local notes.')
  return expense
}

function parseData(value: unknown, members?: readonly Address[]): LocalGroupData {
  if (!object(value) || !Array.isArray(value.expenses) || value.expenses.length > 500 || !object(value.names)) {
    throw new Error('Invalid local notes format.')
  }
  const expenses = value.expenses.map(parseExpense)
  if (new Set(expenses.map((e) => e.id)).size !== expenses.length) throw new Error('Duplicate expense ids in local notes.')
  if (members && expenses.some((e) => e.included.length !== members.length)) throw new Error('Expense member count differs from this group.')
  const names: Record<string, string> = {}
  const entries = Object.entries(value.names)
  if (entries.length > 8) throw new Error('Too many member labels in local notes.')
  for (const [address, name] of entries) {
    if (!isAddress(address, { strict: false }) || !str(name, 24) ||
        (members && !members.some((member) => member.toLowerCase() === address.toLowerCase()))) {
      throw new Error('Member label address does not belong to this group.')
    }
    names[address.toLowerCase()] = name
  }
  if (value.localTitle !== undefined && !str(value.localTitle, 80)) throw new Error('Invalid local group title.')
  if (value.description !== undefined && !str(value.description, 1000)) throw new Error('Invalid local group description.')
  if (value.visibility !== undefined && (typeof value.visibility !== 'string' || !['active', 'archived', 'hidden'].includes(value.visibility))) throw new Error('Invalid local group visibility.')
  return { expenses, names, localTitle: value.localTitle ?? '',
    description: value.description ?? '', visibility: (value.visibility ?? 'active') as GroupVisibility }
}

const toStored = (e: Expense): StoredExpense => ({ ...e, amount: e.amount.toString(), custom: e.custom.map(String) })
const serialize = (data: LocalGroupData) => ({ ...data, expenses: data.expenses.map(toStored) })

export function loadLocalGroup(key: string, members?: readonly Address[]): LocalGroupData {
  const raw = localStorage.getItem(key)
  if (!raw) return emptyLocalGroup()
  if (raw.length > MAX_JSON) throw new Error('Local notes are too large to load safely.')
  return parseData(JSON.parse(raw), members)
}

export function saveLocalGroup(key: string, data: LocalGroupData): void {
  const raw = JSON.stringify(serialize(data))
  if (raw.length > MAX_JSON) throw new Error('Local notes are too large to save.')
  parseData(JSON.parse(raw))
  localStorage.setItem(key, raw)
  window.dispatchEvent(new CustomEvent(LOCAL_GROUP_CHANGED, { detail: key }))
}

export function exportLocalGroup(key: string, data: LocalGroupData, members: readonly Address[]): string {
  return JSON.stringify({ v: 2, groupKey: key, members, data: serialize(data) }, null, 2)
}

export function importLocalGroup(text: string, key: string, members: readonly Address[]): LocalGroupData {
  if (text.length > MAX_JSON) throw new Error('Backup is too large.')
  const parsed: unknown = JSON.parse(text)
  if (!object(parsed) || parsed.v !== 2 || parsed.groupKey !== key || !Array.isArray(parsed.members) ||
      parsed.members.length !== members.length || !parsed.members.every((v, i) => typeof v === 'string' && v.toLowerCase() === members[i].toLowerCase())) {
    throw new Error('This backup does not match this group and its onchain member order.')
  }
  return parseData(parsed.data, members)
}

/** Existing v1 text exports remain importable after an explicit legacy warning in the UI. */
export function importLegacyExpenses(text: string, members: readonly Address[]): LocalGroupData {
  if (text.length > MAX_JSON) throw new Error('Backup is too large.')
  const parsed: unknown = JSON.parse(text)
  if (!object(parsed) || parsed.v !== 1) throw new Error('Not an Atomic Closeout v1 export.')
  return parseData(parsed, members)
}
