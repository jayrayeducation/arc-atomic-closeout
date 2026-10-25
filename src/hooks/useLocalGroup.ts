import { useCallback, useState } from 'react'
import type { Address } from 'viem'
import type { Expense } from '@/lib/settlement'
import { groupKey, loadLocalGroup, saveLocalGroup, type LocalGroupData } from '@/lib/storage'

/** Browser-local expense notes and member labels for one group on one chain. */
export function useLocalGroup(chainId: number, contract: Address | null, groupId: bigint) {
  const key = contract ? groupKey(chainId, contract, groupId) : null
  // The workspace is remounted per chain+group, so loading once on mount is enough.
  const [data, setData] = useState<LocalGroupData>(() => (key ? loadLocalGroup(key) : { expenses: [], names: {} }))

  const commit = useCallback(
    (next: LocalGroupData) => {
      setData(next)
      if (key) saveLocalGroup(key, next)
    },
    [key],
  )

  const addExpense = useCallback((e: Expense) => commit({ ...data, expenses: [...data.expenses, e] }), [commit, data])
  const removeExpense = useCallback((id: string) => commit({ ...data, expenses: data.expenses.filter((x) => x.id !== id) }), [commit, data])
  const setName = useCallback((addr: string, name: string) => commit({ ...data, names: { ...data.names, [addr.toLowerCase()]: name } }), [commit, data])
  const replaceAll = useCallback((next: LocalGroupData) => commit(next), [commit])

  return { ...data, addExpense, removeExpense, setName, replaceAll }
}
