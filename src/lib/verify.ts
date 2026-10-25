import type { Address } from 'viem'
import { buildPlan, computeBalances, computePlanHash, hashExpenses, type Expense } from './settlement'
import type { RoundView } from './types'

export interface PlanCheck {
  /** Recomputed plan ID from the onchain fields equals the onchain plan hash. */
  hashOk: boolean
  /** Local expenses vs the onchain plan. */
  local: 'none' | 'match' | 'mismatch'
}

/** Recompute the plan ID from onchain fields and compare to local expenses. Pure and deterministic. */
export function checkPlan(chainId: number, contract: Address, round: RoundView, expenses: Expense[]): PlanCheck {
  const recomputed = computePlanHash({
    chainId,
    contract,
    groupId: round.groupId,
    roundId: round.roundId,
    members: round.members,
    debts: round.debts,
    credits: round.credits,
    deadline: BigInt(round.deadline),
    expensesHash: round.expensesHash,
  })
  const hashOk = recomputed.toLowerCase() === round.planHash.toLowerCase()
  if (expenses.length === 0) return { hashOk, local: 'none' }
  try {
    const n = round.members.length
    const plan = buildPlan(computeBalances(expenses, n).net)
    const same =
      plan.debts.every((d, i) => d === round.debts[i]) &&
      plan.credits.every((c, i) => c === round.credits[i]) &&
      hashExpenses(expenses, n).toLowerCase() === round.expensesHash.toLowerCase()
    return { hashOk, local: same ? 'match' : 'mismatch' }
  } catch {
    return { hashOk, local: 'mismatch' }
  }
}
