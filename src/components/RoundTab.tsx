import { useState } from 'react'
import type { Address } from 'viem'
import type { Member } from '@/lib/members'
import type { Expense } from '@/lib/settlement'
import { statusName, type ActivityEvent } from '@/lib/types'
import type { GroupData } from '@/hooks/useGroup'
import { ApprovalProgress } from './ApprovalProgress'
import { FundingStatus } from './FundingStatus'
import { ProposePanel } from './ProposePanel'
import { RefundPanel } from './RefundPanel'
import { SettlementResult } from './SettlementResult'
import { StatusPill } from './primitives'
import type { RoundCtx } from './roundTypes'

interface Props {
  chainId: number
  contract: Address
  groupId: bigint
  data: GroupData
  members: Member[]
  me: number
  events: ActivityEvent[]
  expenses: Expense[]
}

/** Stage-appropriate panels, driven only by confirmed contract state. */
export function RoundTab({ chainId, contract, groupId, data, members, me, events, expenses }: Props) {
  const { current, rounds } = data
  const mk = (round: NonNullable<typeof current>): RoundCtx => ({ chainId, contract, members, round, me, events, expenses })
  const status = current ? statusName(current.status) : 'None'
  const canPropose = !current || ['Expired', 'Refunded', 'Cancelled', 'Settled'].includes(status)
  const [startNew, setStartNew] = useState(false)
  // After a finished or expired plan, new proposals stay tucked away until asked for.
  const showPropose = canPropose && (!current || status === 'Cancelled' || startNew)
  const olderRefundable = rounds.filter((r) => r !== current && statusName(r.status) === 'Expired' && r.fundedTotal > r.refundedTotal)

  return (
    <div className="space-y-6">
      {current && status === 'Approval' && <ApprovalProgress ctx={mk(current)} />}
      {current && status === 'Funding' && (
        <>
          <FundingStatus ctx={mk(current)} />
          <ApprovalProgress ctx={mk(current)} />
        </>
      )}
      {current && status === 'Settled' && (
        <>
          <SettlementResult ctx={mk(current)} />
          <ApprovalProgress ctx={mk(current)} />
        </>
      )}
      {current && (status === 'Expired' || status === 'Refunded') && <RefundPanel ctx={mk(current)} />}
      {current && status === 'Cancelled' && (
        <p className="surface-inner p-4 text-sm text-ink-dim">The previous plan (#{current.roundNumber}) was cancelled by its proposer before anyone deposited. Propose a corrected plan below.</p>
      )}

      {olderRefundable.map((r) => (
        <RefundPanel key={r.roundId.toString()} ctx={mk(r)} />
      ))}

      {canPropose && !showPropose && (
        <button className="btn-ghost" onClick={() => setStartNew(true)}>
          Start a new plan for this group
        </button>
      )}
      {showPropose && <ProposePanel chainId={chainId} contract={contract} groupId={groupId} members={members} expenses={expenses} me={me} />}

      {rounds.length > 1 && (
        <section className="surface p-5">
          <h2 className="font-display text-lg font-semibold">Plan history</h2>
          <ul className="mt-3 divide-y divide-white/[0.05] text-sm">
            {[...rounds].reverse().map((r) => (
              <li key={r.roundId.toString()} className="flex items-center justify-between gap-3 py-2.5">
                <span>
                  Plan #{r.roundNumber} <span className="text-ink-mute">(round {r.roundId.toString()})</span>
                </span>
                <StatusPill status={statusName(r.status)} fullyFunded={r.fundedTotal === r.totalAmount} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
