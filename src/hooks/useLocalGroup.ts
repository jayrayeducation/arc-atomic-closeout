import { useCallback, useEffect, useState } from 'react'
import type { Address } from 'viem'
import type { Expense } from '@/lib/settlement'
import { emptyLocalGroup, groupKey, loadLocalGroup, LOCAL_GROUP_CHANGED, saveLocalGroup, type GroupVisibility, type LocalGroupData } from '@/lib/storage'

/** Browser-local expense notes and member labels for one group on one chain. */
export function useLocalGroup(chainId: number, contract: Address | null, groupId: bigint) {
  const key = contract ? groupKey(chainId, contract, groupId) : null
  // The workspace is remounted per chain+group, so loading once on mount is enough.
  const read = useCallback(() => {
    try { return { data: key ? loadLocalGroup(key) : emptyLocalGroup(), error: null as string | null } }
    catch (error) { return { data: emptyLocalGroup(), error: error instanceof Error ? error.message : 'Could not load local notes.' } }
  }, [key])
  const [snapshot, setSnapshot] = useState(read)

  useEffect(() => {
    const changed = (event: Event) => {
      if (event.type === 'storage' && (event as StorageEvent).key !== key) return
      if (event.type === LOCAL_GROUP_CHANGED && (event as CustomEvent<string>).detail !== key) return
      setSnapshot(read())
    }
    window.addEventListener(LOCAL_GROUP_CHANGED, changed)
    window.addEventListener('storage', changed)
    return () => { window.removeEventListener(LOCAL_GROUP_CHANGED, changed); window.removeEventListener('storage', changed) }
  }, [key, read])

  const commit = useCallback(
    (next: LocalGroupData) => {
      if (snapshot.error) return
      try { if (key) saveLocalGroup(key, next); setSnapshot({ data: next, error: null }) }
      catch (error) { setSnapshot((current) => ({ ...current, error: error instanceof Error ? error.message : 'Could not save local notes.' })) }
    },
    [key, snapshot.error],
  )

  const data = snapshot.data
  const addExpense = useCallback((e: Expense) => commit({ ...data, expenses: [...data.expenses, e] }), [commit, data])
  const removeExpense = useCallback((id: string) => commit({ ...data, expenses: data.expenses.filter((x) => x.id !== id) }), [commit, data])
  const updateExpense = useCallback((expense: Expense) => commit({ ...data, expenses: data.expenses.map((e) => e.id === expense.id ? expense : e) }), [commit, data])
  const setName = useCallback((addr: string, name: string) => commit({ ...data, names: { ...data.names, [addr.toLowerCase()]: name } }), [commit, data])
  const setDetails = useCallback((localTitle: string, description: string) => commit({ ...data, localTitle, description }), [commit, data])
  const setVisibility = useCallback((visibility: GroupVisibility) => commit({ ...data, visibility }), [commit, data])
  const clearNotes = useCallback(() => commit({ ...emptyLocalGroup(), visibility: data.visibility }), [commit, data.visibility])
  const replaceAll = useCallback((next: LocalGroupData) => commit(next), [commit])

  return { ...data, storageError: snapshot.error, addExpense, removeExpense, updateExpense, setName, setDetails, setVisibility, clearNotes, replaceAll }
}
