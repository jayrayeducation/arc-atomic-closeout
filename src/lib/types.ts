import type { Address, ContractFunctionReturnType, Hex } from 'viem'
import type { atomicCloseoutAbi } from './abi'

export type GroupView = ContractFunctionReturnType<typeof atomicCloseoutAbi, 'view', 'getGroup'>
export type RoundView = ContractFunctionReturnType<typeof atomicCloseoutAbi, 'view', 'getRound'>

/** Mirrors the Solidity enum order. */
export const STATUS = {
  None: 0,
  Approval: 1,
  Funding: 2,
  Settled: 3,
  Expired: 4,
  Refunded: 5,
  Cancelled: 6,
} as const

export type StatusName = keyof typeof STATUS

const NAMES: StatusName[] = ['None', 'Approval', 'Funding', 'Settled', 'Expired', 'Refunded', 'Cancelled']
export const statusName = (n: number): StatusName => NAMES[n] ?? 'None'

export interface ActivityEvent {
  /** chainId:txHash:logIndex, the dedupe key. */
  key: string
  chainId: number
  name:
    | 'GroupCreated'
    | 'MemberAdded'
    | 'PlanProposed'
    | 'PlanApproved'
    | 'FundingOpened'
    | 'PlanCancelled'
    | 'Funded'
    | 'Finalized'
    | 'Withdrawn'
    | 'Refunded'
  args: Record<string, unknown>
  blockNumber: bigint
  txHash: Hex
  logIndex: number
  groupId: bigint | null
  roundId: bigint | null
  actor: Address | null
}
