import { ArrowRight, CheckCircle2, ClipboardList, Coins, FlaskConical, ShieldCheck, Users } from 'lucide-react'
import { LogoMark } from '@/components/AppShell'
import { DemoBadge } from '@/components/primitives'
import { SAMPLE_BALANCES } from '@/components/BalanceChart'

const STEPS = [
  { icon: ClipboardList, title: 'Track', text: 'Log shared costs with exact USDC amounts and equal, custom or percentage splits.' },
  { icon: CheckCircle2, title: 'Approve', text: 'Every member approves the exact final plan with their own wallet. Any change needs a new plan.' },
  { icon: Coins, title: 'Fund', text: 'Debtors deposit exactly what they owe into the contract. Funding is not settlement.' },
  { icon: ShieldCheck, title: 'Settle', text: 'When funding is complete, finalize once. Creditors withdraw. If not, depositors reclaim after expiry.' },
]

export default function Landing() {
  return (
    <div className="space-y-16 sm:space-y-24">
      <section className="grid items-center gap-10 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <div className="mb-5 flex items-center gap-2.5 text-sm font-medium text-ink-dim">
            <LogoMark size={22} /> Group expenses, settled in USDC on Arc
          </div>
          <h1 className="text-balance font-display text-4xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-6xl">
            Split the bill. <span className="bg-gradient-to-r from-cyan to-blue bg-clip-text text-transparent">Close it out for real.</span>
          </h1>
          <p className="mt-5 max-w-xl text-pretty text-lg text-ink-dim">
            Other apps tell you who owes whom and hope everyone pays. Atomic Closeout turns the agreed final plan into an escrowed USDC settlement:
            everyone consents to the exact numbers, debtors fund, creditors get paid.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a href="#/create" className="btn-primary">
              Create group <ArrowRight className="h-4 w-4" aria-hidden />
            </a>
            <a href="#/demo" className="btn-ghost">
              <FlaskConical className="h-4 w-4" aria-hidden /> Interactive demo
              <DemoBadge className="ml-1 py-0.5" />
            </a>
          </div>
          <p className="mt-4 text-sm text-ink-mute">
            The demo uses synthetic data and never touches a wallet. Creating a group sends real transactions on Arc Testnet.
          </p>
        </div>
        <div className="surface relative overflow-hidden p-5 sm:p-6">
          <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-blue/20 blur-3xl" aria-hidden />
          <div className="relative">
            <div className="flex items-center justify-between">
              <p className="label">Sample plan preview</p>
              <DemoBadge />
            </div>
            <p className="mt-3 font-display text-lg font-semibold">Weekend Trip</p>
            <ul className="mt-4 space-y-3">
              {SAMPLE_BALANCES.map((r) => (
                <li key={r.name} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-ink-mute" aria-hidden />
                    {r.name}
                  </span>
                  <span className={`num font-semibold ${r.net > 0 ? 'text-ok' : 'text-bad'}`}>
                    {r.net > 0 ? 'receives' : 'pays'} {r.display}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-5 border-t border-white/[0.06] pt-4 text-xs text-ink-mute">
              Net positions add up to exactly zero. This preview is computed from the demo expenses, not from the chain.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="how">
        <h2 id="how" className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          Track, approve, fund, settle
        </h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="surface p-5">
              <div className="flex items-center justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan/10 text-cyan">
                  <s.icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="num font-display text-sm text-ink-mute">0{i + 1}</span>
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-pretty text-sm text-ink-dim">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          ['Exact integers only', 'Every amount is a whole number of USDC base units (6 decimals). Odd remainders go to members by stable order, never to floats.'],
          ['No organizer power', 'Nobody can approve for another member. No admin key, no upgrade path. A missed deadline lets each depositor reclaim only their own deposit.'],
          ['Honest status', 'A transaction is called settled only after it is confirmed onchain. Pending and simulated actions are labelled as such.'],
        ].map(([t, d]) => (
          <div key={t} className="surface-inner p-5">
            <h3 className="font-display text-base font-semibold">{t}</h3>
            <p className="mt-2 text-pretty text-sm text-ink-dim">{d}</p>
          </div>
        ))}
      </section>
    </div>
  )
}
