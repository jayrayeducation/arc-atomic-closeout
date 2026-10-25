/**
 * Browser-local storage for offchain expense details.
 * These notes live only in this browser. They are never put in a URL and are
 * not synchronised across devices. The onchain plan is authoritative.
 */
import type { Address } from 'viem'
import type { Expense, SplitMode } from './settlement'

interface StoredExpense {
  id: string
  title: string
  category: string
  date: string
  payer: number
  amount: string
  mode: SplitMode
  included: boolean[]
  custom: string[]
  bps: number[]
}

export interface LocalGroupData {
  expenses: Expense[]
  /** Optional display names keyed by lowercase wallet address. */
  names: Record<string, string>
}

const PREFIX = 'atomic-closeout:v1'

export function groupKey(chainId: number, contract: Address, groupId: bigint | number | string): string {
  return `${PREFIX}:${chainId}:${contract.toLowerCase()}:${groupId.toString()}`
}

function toStored(e: Expense): StoredExpense {
  return { ...e, amount: e.amount.toString(), custom: e.custom.map((c) => c.toString()) }
}

function fromStored(s: StoredExpense): Expense {
  return { ...s, amount: BigInt(s.amount), custom: s.custom.map((c) => BigInt(c)) }
}

export function loadLocalGroup(key: string): LocalGroupData {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return { expenses: [], names: {} }
    const parsed = JSON.parse(raw) as { expenses?: StoredExpense[]; names?: Record<string, string> }
    return { expenses: (parsed.expenses ?? []).map(fromStored), names: parsed.names ?? {} }
  } catch {
    return { expenses: [], names: {} }
  }
}

export function saveLocalGroup(key: string, data: LocalGroupData): void {
  localStorage.setItem(key, JSON.stringify({ expenses: data.expenses.map(toStored), names: data.names }))
}

/** Export expenses as JSON text so a member can paste them on another device. */
export function exportExpenses(data: LocalGroupData): string {
  return JSON.stringify({ v: 1, expenses: data.expenses.map(toStored), names: data.names }, null, 2)
}

export function importExpenses(text: string): LocalGroupData {
  const parsed = JSON.parse(text) as { v?: number; expenses?: StoredExpense[]; names?: Record<string, string> }
  if (parsed.v !== 1 || !Array.isArray(parsed.expenses)) throw new Error('Not an Atomic Closeout export.')
  return { expenses: parsed.expenses.map(fromStored), names: parsed.names ?? {} }
}
