import { useState } from 'react'
import { isAddress, type Address } from 'viem'
import { atomicCloseoutAbi } from '@/lib/abi'
import { usdc } from '@/lib/format'
import { useTx } from '@/hooks/useTx'
import { Callout, Card } from './primitives'
import { TxButton, TxStatus } from './TxButton'
import type { RoundCtx } from './roundTypes'

/** Refunds exist only for rounds that expired without full funding. Each depositor recovers only their own deposit. */
export function RefundPanel({ ctx }: { ctx: RoundCtx }) {
  const { chainId, contract, members, round, me } = ctx
  const tx = useTx(chainId)
  const [alt, setAlt] = useState('')
  const [showAlt, setShowAlt] = useState(false)
  const anyDeposit = round.fundedTotal > 0n
  const myDeposit = me >= 0 && round.funded[me] ? round.debts[me] : 0n
  const canRefund = myDeposit > 0n && !round.refunded[me]
  const altValid = alt === '' || isAddress(alt, { strict: false })

  const refund = () =>
    void tx.run('Refund', async (c) => {
      const base = { address: contract, abi: atomicCloseoutAbi, account: c.account } as const
      if (showAlt && alt.trim()) {
        const { request } = await c.client.simulateContract({ ...base, functionName: 'refundTo', args: [round.roundId, alt.trim() as Address] })
        await c.signing()
        return c.wallet.writeContract(request)
      }
      const { request } = await c.client.simulateContract({ ...base, functionName: 'refund', args: [round.roundId] })
      await c.signing()
      return c.wallet.writeContract(request)
    })

  return (
    <Card title="Expired plan and refunds">
      <div className="space-y-5">
        <Callout tone="warn" title="This plan expired before full funding">
          No settlement happened and none can happen for this plan. {anyDeposit ? 'Anyone who deposited can reclaim exactly their own deposit.' : 'Nobody deposited, so there is nothing to refund.'}
        </Callout>
        {anyDeposit && (
          <ul className="space-y-2">
            {members.map((m, i) =>
              round.funded[i] ? (
                <li key={m.address} className="surface-inner flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                  <span className="truncate">
                    {m.name}
                    {i === me && <span className="ml-2 text-xs text-cyan">you</span>}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="num">{usdc(round.debts[i])} USDC</span>
                    <span className={`text-xs font-semibold ${round.refunded[i] ? 'text-ok' : 'text-warn'}`}>{round.refunded[i] ? 'Refunded' : 'Refund available'}</span>
                  </span>
                </li>
              ) : null,
            )}
          </ul>
        )}
        {canRefund && (
          <div className="space-y-3">
            <TxButton tx={tx} chainId={chainId} label={`Reclaim ${usdc(myDeposit)} USDC`} onRun={refund} disabled={showAlt && (!altValid || alt === '')} />
            <button className="block text-xs text-ink-mute underline underline-offset-2" onClick={() => setShowAlt((s) => !s)}>
              {showAlt ? 'Refund to my own wallet instead' : 'Direct refund failing? Send it to a different address'}
            </button>
            {showAlt && (
              <div>
                <input className="input font-mono" placeholder="0x recipient chosen by you" value={alt} onChange={(e) => setAlt(e.target.value.trim())} aria-label="Alternative refund recipient" />
                {!altValid && <p className="mt-1 text-xs text-bad">Enter a valid address.</p>}
              </div>
            )}
          </div>
        )}
        {me >= 0 && !canRefund && myDeposit > 0n && <Callout tone="ok">Your deposit was refunded.</Callout>}
        <TxStatus tx={tx} chainId={chainId} />
        <p className="text-xs text-ink-mute">Neither the proposer nor any other member can touch your deposit. A new plan can be proposed while refunds remain open.</p>
      </div>
    </Card>
  )
}
