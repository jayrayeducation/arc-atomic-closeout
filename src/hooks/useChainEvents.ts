import { useMemo } from 'react'
import { usePublicClient } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { decodeEventLog, type Address, type PublicClient } from 'viem'
import { atomicCloseoutAbi } from '@/lib/abi'
import { getDeployment } from '@/lib/deployments'
import type { ActivityEvent } from '@/lib/types'

interface CacheEntry {
  events: Map<string, ActivityEvent>
  scanned: bigint
}

/** Per chain+contract scan cache. Keeps testnet and mainnet strictly apart. */
const CACHE = new Map<string, CacheEntry>()
const MAX_REQUESTS_PER_PASS = 40

export interface ChainEvents {
  events: ActivityEvent[]
  scanned: bigint
  head: bigint
  /** True while the scan has not reached the chain head yet. */
  backfilling: boolean
}

async function scan(client: PublicClient, chainId: number, contract: Address, fromBlock: bigint): Promise<ChainEvents> {
  // Never start at genesis: the scan begins at the deployment block.
  const cacheKey = `${chainId}:${contract.toLowerCase()}`
  const entry = CACHE.get(cacheKey) ?? { events: new Map<string, ActivityEvent>(), scanned: fromBlock - 1n }
  CACHE.set(cacheKey, entry)
  const head = await client.getBlockNumber()
  let start = entry.scanned + 1n
  let span = 20_000n
  let requests = 0
  while (start <= head && requests < MAX_REQUESTS_PER_PASS) {
    const end = start + span - 1n > head ? head : start + span - 1n
    requests++
    try {
      const logs = await client.getLogs({ address: contract, fromBlock: start, toBlock: end })
      for (const log of logs) {
        if (log.transactionHash === null || log.logIndex === null || log.blockNumber === null) continue
        let decoded
        try {
          decoded = decodeEventLog({ abi: atomicCloseoutAbi, data: log.data, topics: log.topics })
        } catch {
          continue
        }
        const args = (decoded.args ?? {}) as Record<string, unknown>
        // Dedupe by chainId + txHash + logIndex.
        const key = `${chainId}:${log.transactionHash}:${log.logIndex}`
        const actor = (args.member ?? args.proposer ?? args.creator ?? args.by ?? args.caller ?? null) as Address | null
        entry.events.set(key, {
          key,
          chainId,
          name: decoded.eventName,
          args,
          blockNumber: log.blockNumber,
          txHash: log.transactionHash,
          logIndex: log.logIndex,
          groupId: (args.groupId as bigint | undefined) ?? null,
          roundId: (args.roundId as bigint | undefined) ?? null,
          actor,
        })
      }
      entry.scanned = end
      start = end + 1n
      if (span < 200_000n) span *= 2n
    } catch (err) {
      if (span <= 250n) throw err
      span /= 4n
    }
  }
  const events = [...entry.events.values()].sort((a, b) =>
    a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1,
  )
  return { events, scanned: entry.scanned, head, backfilling: entry.scanned < head }
}

export function useChainEvents(chainId: number) {
  const client = usePublicClient({ chainId })
  const deployment = getDeployment(chainId)
  const contract = deployment?.contract ?? null
  const fromBlock = deployment?.fromBlock ?? null
  return useQuery({
    queryKey: ['events', chainId, contract],
    enabled: Boolean(client && contract && fromBlock !== null),
    refetchInterval: (q) => (q.state.data?.backfilling ? 500 : 8000),
    queryFn: () => scan(client as PublicClient, chainId, contract as Address, fromBlock as bigint),
  })
}

/** Groups in which `address` is a member, newest first. */
export function useMyGroupIds(chainId: number, address: Address | undefined) {
  const q = useChainEvents(chainId)
  const ids = useMemo(() => {
    if (!address || !q.data) return []
    const set = new Set<string>()
    for (const e of q.data.events) {
      if (e.name === 'MemberAdded' && (e.args.member as string).toLowerCase() === address.toLowerCase() && e.groupId !== null) {
        set.add(e.groupId.toString())
      }
    }
    return [...set].map((s) => BigInt(s)).sort((a, b) => (a < b ? 1 : -1))
  }, [address, q.data])
  return { ...q, ids }
}

/** Events that belong to one group (by group id, or by round ids proposed for it). */
export function useGroupEvents(chainId: number, groupId: bigint) {
  const q = useChainEvents(chainId)
  const events = useMemo(() => {
    if (!q.data) return []
    const rounds = new Set<string>()
    for (const e of q.data.events) {
      if (e.name === 'PlanProposed' && e.groupId === groupId && e.roundId !== null) rounds.add(e.roundId.toString())
    }
    return q.data.events.filter((e) => {
      if (e.name === 'MemberAdded') return false // listed once under GroupCreated
      if (e.groupId !== null && e.name !== 'PlanProposed') return e.groupId === groupId
      if (e.groupId !== null) return e.groupId === groupId
      return e.roundId !== null && rounds.has(e.roundId.toString())
    })
  }, [q.data, groupId])
  return { ...q, events }
}
