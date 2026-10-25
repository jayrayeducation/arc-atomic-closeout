import { erc20Abi } from 'viem'
import { Check } from 'lucide-react'
import { atomicCloseoutAbi } from '@/lib/abi'
import { usdc, formatDeadline, timeLeft } from '@/lib/format'
import { useTx } from '@/hooks/useTx'
import { useNow } from '@/hooks/useNow'
import { useUsdc } from '@/hooks/useUsdc'
import { Callout, Card, Progress } from './primitives'
import { TxButton, TxStatus } from './TxButton'
import type { RoundCtx } from './roundTypes'
import { statusName } from '@/lib/types'

export function FundingStatus({ ctx }: { ctx: RoundCtx }) {
  const { chainId, contract, members, round, me } = ctx
  const tx = useTx(chainId)
  const now = useNow()
  const { address: usdcAddress, balance, allowance, loading } = useUsdc(chainId, tx.address, contract)
  const status = statusName(round.status)
  const fully = round.fundedTotal === round.totalAmount
  const funding = status === 'Funding'
  const deadlinePassed = BigInt(Math.floor(now / 1000)) >= BigInt(round.deadline)
  const myDebt = me >= 0 ? round.debts[me] : 0n
  const iFunded = me >= 0 && round.funded[me]
  const remaining = round.totalAmount - round.fundedTotal
  const needsAllowance = allowance !== undefined && allowance < myDebt
  const insufficient = balance !== undefined && balance < myDebt
  // Arc gas is USDC from the same balance, so a deposit that empties the wallet leaves nothing for fees.
  const noFeeRoom = balance !== undefined && balance <= myDebt && !insufficient

  return (
    <Card
      title="Funding"
      aside={<span className="text-xs text-ink-mute">{funding && !fully ? timeLeft(BigInt(round.deadline), now) : `Deadline ${formatDeadline(round.deadline)}`}</span>}
    >
      <div className="space-y-5">
        <div>
          <div className="mb-2 flex justify-between text-sm">
            <span className="text-ink-dim">Deposited</span>
            <span className="num font-semibold">
              {usdc(round.fundedTotal)} of {usdc(round.totalAmount)} USDC
            </span>
          </div>
          <Progress value={Number((round.fundedTotal * 1000n) / round.totalAmount)} max={1000} label="Funding progress" />
          <p className="mt-2 text-xs text-ink-mute">Remaining to fund: <span className="num">{usdc(remaining)} USDC</span>. Funding is a deposit. It is not settlement.</p>
        </div>

        <ul className="space-y-2">
          {members.map((m, i) =>
            round.debts[i] > 0n ? (
              <li key={m.address} className="surface-inner flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <span className="truncate">
                  {m.name}
                  {i === me && <span className="ml-2 text-xs text-cyan">you</span>}
                </span>
                <span className="flex items-center gap-3">
                  <span className="num text-ink-dim">{usdc(round.debts[i])} USDC</span>
                  {round.funded[i] ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-ok">
                      <Check className="h-3.5 w-3.5" aria-hidden /> Deposited
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-warn">Owes {usdc(round.debts[i])}</span>
                  )}
                </span>
              </li>
            ) : null,
          )}
        </ul>

        {funding && me >= 0 && myDebt > 0n && !iFunded && !deadlinePassed && (
          <div className="surface-inner space-y-3 p-4">
            <div className="flex justify-between text-sm">
              <span className="text-ink-dim">Your USDC balance</span>
              <span className="num font-semibold">{loading || balance === undefined ? '…' : `${usdc(balance)} USDC`}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-ink-dim">Your exact obligation</span>
              <span className="num font-semibold">{usdc(myDebt)} USDC</span>
            </div>
            {insufficient && (
              <Callout tone="bad" title="Insufficient USDC">
                You need {usdc(myDebt)} USDC plus network fees. {chainId === 5042
                  ? 'Add real Arc Mainnet USDC to this wallet only after confirming the network and your budget.'
                  : 'Use Get test USDC in the sidebar to add testnet funds.'}
              </Callout>
            )}
            {noFeeRoom && <Callout tone="warn">Depositing would use your whole balance. Network fees are paid in USDC from the same balance, so keep a little extra.</Callout>}
            {needsAllowance ? (
              <TxButton
                tx={tx}
                chainId={chainId}
                variant="blue"
                label={`Step 1 of 2: allow exactly ${usdc(myDebt)} USDC`}
                disabled={insufficient || !usdcAddress}
                onRun={() =>
                  void tx.run('USDC allowance', async (c) => {
                    if (!usdcAddress) throw new Error('USDC is not available on this network.')
                    const { request } = await c.client.simulateContract({ address: usdcAddress, abi: erc20Abi, functionName: 'approve', args: [contract, myDebt], account: c.account })
                    c.signing()
                    return c.wallet.writeContract(request)
                  })
                }
              />
            ) : (
              <TxButton
                tx={tx}
                chainId={chainId}
                label={`${allowance !== undefined && myDebt > 0n ? 'Step 2 of 2: ' : ''}Deposit ${usdc(myDebt)} USDC`}
                disabled={insufficient}
                onRun={() =>
                  void tx.run('Deposit', async (c) => {
                    const { request } = await c.client.simulateContract({ address: contract, abi: atomicCloseoutAbi, functionName: 'fund', args: [round.roundId], account: c.account })
                    c.signing()
                    return c.wallet.writeContract(request)
                  })
                }
              />
            )}
          </div>
        )}
        {funding && me >= 0 && myDebt === 0n && <Callout>You have no obligation in this plan. {round.credits[me] > 0n ? 'You are a creditor and will be able to withdraw after finalization.' : ''}</Callout>}
        {funding && iFunded && !fully && <Callout tone="ok">Your deposit is confirmed onchain. Waiting for the remaining debtors.</Callout>}
        {funding && deadlinePassed && !fully && <Callout tone="warn" title="Deadline passed">Funding is closed. Depositors can reclaim their own deposits.</Callout>}

        {funding && fully && (
          <div className="space-y-3">
            <Callout tone="ok" title="Fully funded">
              All obligations are deposited. Finalizing converts the deposits into creditor entitlements in a single transaction. Anyone can trigger it.
            </Callout>
            <TxButton
              tx={tx}
              chainId={chainId}
              label="Finalize settlement"
              onRun={() =>
                void tx.run('Finalize', async (c) => {
                  const { request } = await c.client.simulateContract({ address: contract, abi: atomicCloseoutAbi, functionName: 'finalize', args: [round.roundId], account: c.account })
                  c.signing()
                  return c.wallet.writeContract(request)
                })
              }
            />
          </div>
        )}
        <TxStatus tx={tx} chainId={chainId} />
      </div>
    </Card>
  )
}
