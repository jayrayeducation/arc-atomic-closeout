import { useMemo, useState } from 'react'
import { atomicCloseoutAbi } from '@/lib/abi'
import { buildPlan, computeBalances, hashExpenses, type Expense } from '@/lib/settlement'
import { useTx } from '@/hooks/useTx'
import type { Address } from 'viem'
import type { Member } from '@/lib/members'
import { Callout, Card } from './primitives'
import { SettlementPlan } from './SettlementPlan'
import { TxButton, TxStatus } from './TxButton'

const DURATIONS = [
  { label: '6 minutes (test)', seconds: 6 * 60 },
  { label: '30 minutes', seconds: 30 * 60 },
  { label: '24 hours', seconds: 24 * 3600 },
  { label: '3 days', seconds: 3 * 86400 },
  { label: '7 days', seconds: 7 * 86400 },
]

interface Props {
  chainId: number
  contract: Address
  groupId: bigint
  members: Member[]
  expenses: Expense[]
  me: number
}

/** Turn the local expense list into one immutable onchain plan. */
export function ProposePanel({ chainId, contract, groupId, members, expenses, me }: Props) {
  const tx = useTx(chainId)
  const [duration, setDuration] = useState(DURATIONS[2].seconds)
  const calc = useMemo(() => {
    if (expenses.length === 0) return { error: 'Add at least one expense first.', plan: null, hash: null }
    try {
      const n = members.length
      const b = computeBalances(expenses, n)
      const plan = buildPlan(b.net)
      if (plan.total === 0n) return { error: 'Everyone is already even. There is nothing to settle.', plan: null, hash: null }
      return { error: null, plan, hash: hashExpenses(expenses, n) }
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'Invalid expenses.', plan: null, hash: null }
    }
  }, [expenses, members.length])

  return (
    <Card title="Propose the final plan">
      <div className="space-y-5">
        <p className="text-pretty text-sm text-ink-dim">
          Proposing freezes these exact numbers onchain as one immutable plan. Nobody is approved automatically, including you. Changing anything later means starting a new plan.
        </p>
        {calc.error && <Callout tone="warn">{calc.error}</Callout>}
        {calc.plan && (
          <>
            <SettlementPlan members={members} plan={calc.plan} me={me >= 0 ? me : undefined} />
            <p className="break-all text-xs text-ink-mute">Expense commitment: <span className="font-mono">{calc.hash}</span></p>
            <fieldset>
              <legend className="label mb-2">Approval and funding window</legend>
              <div className="flex flex-wrap gap-2">
                {DURATIONS.map((d) => (
                  <button key={d.seconds} type="button" aria-pressed={duration === d.seconds} onClick={() => setDuration(d.seconds)} className={`min-h-[44px] rounded-xl border px-4 text-sm font-semibold ${duration === d.seconds ? 'border-cyan/50 bg-cyan/10 text-cyan' : 'border-white/10 text-ink-dim'}`}>
                    {d.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-ink-mute">If funding is not complete by the deadline, every depositor can reclaim their own deposit.</p>
            </fieldset>
            {me < 0 ? (
              <Callout>Only members of this group can propose a plan.</Callout>
            ) : (
              <TxButton
                tx={tx}
                chainId={chainId}
                label="Propose plan onchain"
                onRun={() =>
                  void tx.run('Propose plan', async (c) => {
                    const plan = calc.plan
                    const expensesHash = calc.hash
                    if (!plan || !expensesHash) throw new Error('Nothing to propose.')
                    const block = await c.client.getBlock()
                    const deadline = block.timestamp + BigInt(duration)
                    const { request } = await c.client.simulateContract({
                      address: contract,
                      abi: atomicCloseoutAbi,
                      functionName: 'proposePlan',
                      args: [groupId, plan.debts, plan.credits, deadline, expensesHash],
                      account: c.account,
                    })
                    await c.signing()
                    return c.wallet.writeContract(request)
                  })
                }
              />
            )}
            <TxStatus tx={tx} chainId={chainId} />
          </>
        )}
      </div>
    </Card>
  )
}
