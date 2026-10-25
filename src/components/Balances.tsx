import type { Balances as BalancesT } from '@/lib/settlement'
import type { Member } from '@/lib/members'
import { signedUsdc, usdc } from '@/lib/format'
import { BalanceChart } from './BalanceChart'
import { Callout } from './primitives'

/** Paid, assigned share and signed net per participant. Net must sum to exactly zero. */
export function Balances({ members, balances }: { members: Member[]; balances: BalancesT }) {
  const sum = balances.net.reduce((a, b) => a + b, 0n)
  const totalPaid = balances.paid.reduce((a, b) => a + b, 0n)
  return (
    <div className="space-y-5">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="text-left">
              <th className="label pb-2 font-semibold">Member</th>
              <th className="label pb-2 text-right font-semibold">Paid</th>
              <th className="label pb-2 text-right font-semibold">Assigned share</th>
              <th className="label pb-2 text-right font-semibold">Net position</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {members.map((m, i) => (
              <tr key={m.address}>
                <td className="py-3 pr-3 font-medium">{m.name}</td>
                <td className="num py-3 text-right text-ink-dim">{usdc(balances.paid[i])}</td>
                <td className="num py-3 text-right text-ink-dim">{usdc(balances.share[i])}</td>
                <td className={`num py-3 text-right font-semibold ${balances.net[i] > 0n ? 'text-ok' : balances.net[i] < 0n ? 'text-bad' : 'text-ink-mute'}`}>
                  {balances.net[i] === 0n ? usdc(0n) : signedUsdc(balances.net[i])}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-white/10">
              <td className="pt-3 font-semibold">Total</td>
              <td className="num pt-3 text-right font-semibold">{usdc(totalPaid)}</td>
              <td className="num pt-3 text-right font-semibold">{usdc(balances.share.reduce((a, b) => a + b, 0n))}</td>
              <td className="num pt-3 text-right font-semibold">{usdc(sum)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {sum === 0n ? (
        <p className="text-xs text-ink-mute">Check: net positions add up to exactly 0.000000 USDC. Positive means owed money, negative means owes money.</p>
      ) : (
        <Callout tone="bad" title="Net positions do not sum to zero">
          This should be impossible. Do not propose a plan.
        </Callout>
      )}
      <BalanceChart rows={members.map((m, i) => ({ name: m.name.split(' (')[0], paid: balances.paid[i], share: balances.share[i], net: balances.net[i] }))} />
    </div>
  )
}
