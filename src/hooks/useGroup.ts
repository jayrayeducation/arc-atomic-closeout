import { usePublicClient } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import type { Address, PublicClient } from 'viem'
import { atomicCloseoutAbi } from '@/lib/abi'
import { getDeployment } from '@/lib/deployments'
import type { GroupView, RoundView } from '@/lib/types'

export interface GroupData {
  group: GroupView
  rounds: RoundView[]
  /** Latest round, or null when no plan was ever proposed. */
  current: RoundView | null
}

export async function readGroup(client: PublicClient, contract: Address, groupId: bigint): Promise<GroupData> {
  const group = await client.readContract({ address: contract, abi: atomicCloseoutAbi, functionName: 'getGroup', args: [groupId] })
  const ids = await client.readContract({ address: contract, abi: atomicCloseoutAbi, functionName: 'groupRounds', args: [groupId] })
  const rounds = await Promise.all(
    ids.map((id) => client.readContract({ address: contract, abi: atomicCloseoutAbi, functionName: 'getRound', args: [id] })),
  )
  return { group, rounds, current: rounds.length ? rounds[rounds.length - 1] : null }
}

/** Live contract state is the only source of truth for statuses and balances. */
export function useGroup(chainId: number, groupId: bigint) {
  const client = usePublicClient({ chainId })
  const deployment = getDeployment(chainId)
  const contract = deployment?.contract ?? null
  return useQuery({
    queryKey: ['group', chainId, contract, groupId.toString()],
    enabled: Boolean(client && contract),
    refetchInterval: 6000,
    queryFn: () => readGroup(client as PublicClient, contract as Address, groupId),
  })
}

export function useGroupCount(chainId: number) {
  const client = usePublicClient({ chainId })
  const contract = getDeployment(chainId)?.contract ?? null
  return useQuery({
    queryKey: ['groupCount', chainId, contract],
    enabled: Boolean(client && contract),
    refetchInterval: 15000,
    queryFn: () =>
      (client as PublicClient).readContract({ address: contract as Address, abi: atomicCloseoutAbi, functionName: 'groupCount' }),
  })
}
