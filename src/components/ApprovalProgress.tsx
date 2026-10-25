import { useMemo } from 'react'
import { Check, Clock3 } from 'lucide-react'
import { atomicCloseoutAbi } from '@/lib/abi'
import { checkPlan } from '@/lib/verify'
import { signedUsdc, formatDeadline, timeLeft } from '@/lib/format'
import { useTx } from '@/hooks/useTx'
import { useNow } from '@/hooks/useNow'
import { Callout, Card, Progress } from './primitives'
import { SettlementPlan } from './SettlementPlan'
import { TxButton, TxStatus } from './TxButton'
import type { RoundCtx } from './roundTypes'
import { statusName } from '@/lib/types'

export function ApprovalProgress({ ctx }: { ctx: RoundCtx }) {
  const { chainId, contract, members, round, me } = ctx
  const tx = useTx(chainId)
  const now = useNow()
  const check = useMemo(() => checkPlan(chainId, contract, round, ctx.expenses), [chainId, contract, round, ctx.expenses])
  const open = statusName(round.status) === 'Approval'
  const approvedCount = round.approvalCount
  const myNet = me >= 0 ? round.credits[me] - round.debts[me] : null
  const isProposer = ctx.me >= 0 && round.proposer.toLowerCase() === round.members[me].toLowerCase()

  return (
    <Card
      title={`Plan #${round.roundNumber} approvals`}
      aside={<span className="text-xs text-ink-mute">{open ? timeLeft(BigInt(round.deadline), now) : `Deadline ${formatDeadline(round.deadline)}`}</span>}
    >
      <div className="space-y-5">
        <div>
          <div className="mb-2 flex justify-between text-sm">
            <span className="text-ink-dim">Approvals</span>
            <span className="num font-semibold">
              {approvedCount} of {members.length}
            </span>
          </div>
          <Progress value={approvedCount} max={members.length} label="Approval progress" />
        </div>

        <ul className="grid gap-2 sm:grid-cols-2">
          {members.map((m, i) => (
            <li key={m.address} className="surface-inner flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
              <span className="truncate">
                {m.name}
                {i === me && <span className="ml-2 text-xs text-cyan">you</span>}
              </span>
              {round.approved[i] ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-ok">
                  <Check className="h-3.5 w-3.5" aria-hidden /> Approved
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-warn">
                  <Clock3 className="h-3.5 w-3.5" aria-hidden /> Pending
                </span>
              )}
            </li>
          ))}
        </ul>

        <SettlementPlan members={members} plan={{ debts: [...round.debts], credits: [...round.credits], total: round.totalAmount }} me={me >= 0 ? me : undefined} />

        <div className="space-y-2">
          <p className="label">Plan ID</p>
          <p className="break-all font-mono text-xs text-ink-dim">{round.planHash}</p>
          {check.hashOk ? (
            <Callout tone="ok">This ID was recomputed in your browser from the chain, contract, group, round, member order, amounts and expiry, and matches the onchain value.</Callout>
          ) : (
            <Callout tone="bad" title="Plan ID mismatch">
              The onchain plan ID does not match the displayed fields. Do not approve.
            </Callout>
          )}
          {check.local === 'match' && <Callout tone="ok">Your local expense list produces exactly this plan.</Callout>}
          {check.local === 'mismatch' && (
            <Callout tone="warn" title="Your local expenses differ from this plan">
              The onchain plan is authoritative. Approve only if the amounts above are correct for you.
            </Callout>
          )}
          {check.local === 'none' && (
            <Callout>No expense notes exist in this browser for this group. Check the amounts above against your own records before approving.</Callout>
          )}
        </div>

        {me >= 0 && myNet !== null && (
          <div className="surface-inner p-4 text-sm">
            <p className="label">Your position in this plan</p>
            <p className={`num mt-1 font-display text-xl font-semibold ${myNet > 0n ? 'text-ok' : myNet < 0n ? 'text-bad' : ''}`}>
              {myNet === 0n ? 'Even, nothing to pay or receive' : `${signedUsdc(myNet)} USDC`}
            </p>
          </div>
        )}

        {me < 0 && <Callout>You are viewing this group as a non-member. Only listed wallets can approve, and nobody can approve for another member.</Callout>}

        {open && me >= 0 && !round.approved[me] && (
          <TxButton
            tx={tx}
            chainId={chainId}
            label="Approve this exact plan"
            onRun={() =>
              void tx.run('Approve plan', async (c) => {
                const { request } = await c.client.simulateContract({
                  address: contract,
                  abi: atomicCloseoutAbi,
                  functionName: 'approvePlan',
                  args: [round.roundId, round.planHash],
                  account: c.account,
                })
                await c.signing()
                return c.wallet.writeContract(request)
              })
            }
            disabled={!check.hashOk}
          />
        )}
        {open && me >= 0 && round.approved[me] && <Callout tone="ok">You approved this plan. Waiting for {members.length - approvedCount} more.</Callout>}
        {open && isProposer && (
          <TxButton
            tx={tx}
            chainId={chainId}
            variant="ghost"
            label="Cancel this plan (proposer only)"
            onRun={() =>
              void tx.run('Cancel plan', async (c) => {
                const { request } = await c.client.simulateContract({
                  address: contract,
                  abi: atomicCloseoutAbi,
                  functionName: 'cancelPlan',
                  args: [round.roundId],
                  account: c.account,
                })
                await c.signing()
                return c.wallet.writeContract(request)
              })
            }
          />
        )}
        <TxStatus tx={tx} chainId={chainId} />
        <p className="text-xs text-ink-mute">Each approval is a wallet transaction bound to this plan ID. If the numbers change, a new plan with a new ID is required and earlier approvals do not carry over.</p>
      </div>
    </Card>
  )
}
