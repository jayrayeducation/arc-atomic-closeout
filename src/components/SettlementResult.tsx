import { useState } from 'react'
import { isAddress, type Address } from 'viem'
import { Check } from 'lucide-react'
import { atomicCloseoutAbi } from '@/lib/abi'
import { usdc } from '@/lib/format'
import { useTx } from '@/hooks/useTx'
import { Callout, Card } from './primitives'
import { ExplorerLink } from './ExplorerLink'
import { TxButton, TxStatus } from './TxButton'
import type { RoundCtx } from './roundTypes'

export function SettlementResult({ ctx }: { ctx: RoundCtx }) {
  const { chainId, contract, members, round, me, events } = ctx
  const tx = useTx(chainId)
  const [alt, setAlt] = useState('')
  const [showAlt, setShowAlt] = useState(false)
  const allWithdrawn = round.withdrawnTotal === round.totalAmount
  const finalized = events.find((e) => e.name === 'Finalized' && e.roundId === round.roundId)
  const withdrawals = events.filter((e) => e.name === 'Withdrawn' && e.roundId === round.roundId)
  const myCredit = me >= 0 ? round.credits[me] : 0n
  const altValid = alt === '' || isAddress(alt, { strict: false })

  const withdraw = () =>
    void tx.run('Withdraw', async (c) => {
      const to = alt.trim()
      const base = { address: contract, abi: atomicCloseoutAbi, account: c.account } as const
      if (showAlt && to) {
        const { request } = await c.client.simulateContract({ ...base, functionName: 'withdrawTo', args: [round.roundId, to as Address] })
        await c.signing()
        return c.wallet.writeContract(request)
      }
      const { request } = await c.client.simulateContract({ ...base, functionName: 'withdraw', args: [round.roundId] })
      await c.signing()
      return c.wallet.writeContract(request)
    })

  return (
    <Card title="Settlement result">
      <div className="space-y-5">
        {allWithdrawn ? (
          <Callout tone="ok" title="Settled and fully withdrawn">
            Every creditor has claimed their entitlement. Confirmed contract state shows {usdc(round.withdrawnTotal)} USDC withdrawn of {usdc(round.totalAmount)} USDC.
          </Callout>
        ) : (
          <Callout tone="warn" title="Settlement finalized; withdrawal pending">
            The plan is finalized onchain and each creditor's entitlement is recorded. Money has not reached a creditor until they withdraw. Withdrawn so far: {usdc(round.withdrawnTotal)} of {usdc(round.totalAmount)} USDC.
          </Callout>
        )}

        <ul className="space-y-2">
          {members.map((m, i) =>
            round.credits[i] > 0n ? (
              <li key={m.address} className="surface-inner flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <span className="truncate">
                  {m.name}
                  {i === me && <span className="ml-2 text-xs text-cyan">you</span>}
                </span>
                <span className="flex items-center gap-3">
                  <span className="num font-semibold">{usdc(round.credits[i])} USDC</span>
                  {round.withdrawn[i] ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-ok">
                      <Check className="h-3.5 w-3.5" aria-hidden /> Withdrawn
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-warn">Withdrawal pending</span>
                  )}
                </span>
              </li>
            ) : null,
          )}
        </ul>

        {myCredit > 0n && !round.withdrawn[me] && (
          <div className="space-y-3">
            <TxButton tx={tx} chainId={chainId} label={`Withdraw ${usdc(myCredit)} USDC`} onRun={withdraw} disabled={showAlt && (!altValid || alt === '')} />
            <button className="block text-xs text-ink-mute underline underline-offset-2" onClick={() => setShowAlt((s) => !s)}>
              {showAlt ? 'Withdraw to my own wallet instead' : 'Direct transfer failing? Withdraw to a different address'}
            </button>
            {showAlt && (
              <div>
                <input className="input font-mono" placeholder="0x recipient chosen by you" value={alt} onChange={(e) => setAlt(e.target.value.trim())} aria-label="Alternative recipient" />
                {!altValid && <p className="mt-1 text-xs text-bad">Enter a valid address.</p>}
                <p className="mt-1 text-xs text-ink-mute">Only you can withdraw your entitlement, and only to an address you choose.</p>
              </div>
            )}
          </div>
        )}
        <TxStatus tx={tx} chainId={chainId} />

        <div className="space-y-2 border-t border-white/[0.06] pt-4 text-sm">
          <p className="label">Evidence</p>
          <div className="flex justify-between gap-3">
            <span className="text-ink-dim">Contract</span>
            <ExplorerLink chainId={chainId} kind="address" value={contract} />
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-ink-dim">Finalize transaction</span>
            {finalized ? <ExplorerLink chainId={chainId} kind="tx" value={finalized.txHash} /> : <span className="text-xs text-ink-mute">not found in scanned events</span>}
          </div>
          {withdrawals.map((w) => (
            <div key={w.key} className="flex justify-between gap-3">
              <span className="text-ink-dim">Withdrawal ({usdc(w.args.amount as bigint)} USDC)</span>
              <ExplorerLink chainId={chainId} kind="tx" value={w.txHash} />
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}
