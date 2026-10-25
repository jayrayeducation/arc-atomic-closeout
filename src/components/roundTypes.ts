import type { Address } from 'viem'
import type { Member } from '@/lib/members'
import type { ActivityEvent, RoundView } from '@/lib/types'
import type { Expense } from '@/lib/settlement'

/** Everything a round panel needs. Contract state is authoritative; expenses are local notes. */
export interface RoundCtx {
  chainId: number
  contract: Address
  members: Member[]
  round: RoundView
  /** Index of the connected wallet in the group, or -1. */
  me: number
  events: ActivityEvent[]
  expenses: Expense[]
}
