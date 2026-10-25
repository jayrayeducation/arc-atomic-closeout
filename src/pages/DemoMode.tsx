import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Pause, Play, RotateCcw } from 'lucide-react'
import clsx from 'clsx'
import { DEMO_EXPENSES, DEMO_MEMBERS, DEMO_STEPS } from '@/lib/demo'
import { buildPlan, computeBalances, computePlanHash, hashExpenses } from '@/lib/settlement'
import { usdc } from '@/lib/format'
import type { Member } from '@/lib/members'
import { Balances } from '@/components/Balances'
import { ExpenseTable } from '@/components/ExpenseTable'
import { SettlementPlan } from '@/components/SettlementPlan'
import { Callout, Card, DemoBadge, Pill, Progress } from '@/components/primitives'

const STEP_SECONDS = 9 // 8 steps ~ 72 seconds

export default function DemoMode() {
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(false)

  const members: Member[] = DEMO_MEMBERS.map((m) => ({ address: m.address, name: m.name }))
  const calc = useMemo(() => {
    const balances = computeBalances(DEMO_EXPENSES, 3)
    const plan = buildPlan(balances.net)
    const planId = computePlanHash({
      chainId: 5042002,
      contract: '0x0000000000000000000000000000000000000000',
      groupId: 1n,
      roundId: 1n,
      members: DEMO_MEMBERS.map((m) => m.address),
      debts: plan.debts,
      credits: plan.credits,
      deadline: 1_800_000_000n,
      expensesHash: hashExpenses(DEMO_EXPENSES, 3),
    })
    return { balances, plan, planId }
  }, [])

  const active = playing && step < DEMO_STEPS.length - 1
  useEffect(() => {
    if (!active) return
    const t = window.setTimeout(() => setStep((s) => s + 1), STEP_SECONDS * 1000)
    return () => window.clearTimeout(t)
  }, [active, step])

  const id = DEMO_STEPS[step].id
  const { balances, plan } = calc

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-3xl font-semibold tracking-tight">Interactive demo: Weekend Trip</h1>
            <DemoBadge />
          </div>
          <p className="mt-2 max-w-2xl text-ink-dim">
            A scripted 60 to 90 second walkthrough with Alex, Maya and Jordan. The math is computed live with exact integers. Every approval, deposit and withdrawal below is simulated.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn-primary"
            onClick={() => {
              if (step >= DEMO_STEPS.length - 1) setStep(0)
              setPlaying((p) => !p)
            }}
          >
            {active ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
            {active ? 'Pause' : step > 0 ? 'Resume auto-play' : 'Auto-play (about 72 s)'}
          </button>
          <button
            className="btn-ghost"
            onClick={() => {
              setPlaying(false)
              setStep(0)
            }}
            aria-label="Restart demo"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      <Callout tone="warn" title="Scripted demo. DEMO DATA.">
        Wallets shown here are placeholders, no wallet is needed, and no transaction exists. Nothing in this view is proof of an onchain event. Real actions on Arc Testnet are available when you create a group.
      </Callout>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <ol className="surface space-y-1 p-3" aria-label="Demo steps">
          {DEMO_STEPS.map((s, i) => (
            <li key={s.id}>
              <button
                onClick={() => {
                  setPlaying(false)
                  setStep(i)
                }}
                aria-current={i === step ? 'step' : undefined}
                className={clsx('flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition', i === step ? 'bg-cyan/10 text-cyan' : i < step ? 'text-ink' : 'text-ink-mute hover:bg-white/[0.04]')}
              >
                <span className={clsx('num grid h-6 w-6 shrink-0 place-items-center rounded-full border text-xs', i <= step ? 'border-cyan/50' : 'border-white/10')}>{i + 1}</span>
                {s.title}
              </button>
            </li>
          ))}
        </ol>

        <div className="space-y-4">
          <Card title={`${step + 1}. ${DEMO_STEPS[step].title}`} aside={<Pill tone="warn">Simulated</Pill>}>
            <p className="mb-5 text-sm text-ink-dim">{DEMO_STEPS[step].detail}</p>
            {id === 'expenses' && <ExpenseTable expenses={DEMO_EXPENSES} members={members} />}
            {id === 'netting' && <Balances members={members} balances={balances} />}
            {(id === 'plan' || id === 'approve') && (
              <div className="space-y-4">
                <SettlementPlan members={members} plan={plan} />
                <div>
                  <p className="label">Illustrative plan ID</p>
                  <p className="break-all font-mono text-xs text-ink-dim">{calc.planId}</p>
                  <p className="mt-1 text-xs text-ink-mute">Computed from chain, group, round, member order, amounts and expiry using placeholder contract and group values. It is not registered onchain.</p>
                </div>
                {id === 'approve' && (
                  <ul className="grid gap-2 sm:grid-cols-3">
                    {members.map((m) => (
                      <li key={m.address} className="surface-inner px-3 py-2.5 text-sm">
                        {m.name}: <span className="font-semibold text-ok">approved (simulated)</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {id === 'fund' && (
              <div className="space-y-4">
                <Progress value={1} max={1} label="Simulated funding progress" />
                <ul className="space-y-2">
                  {plan.debts.map((d, i) =>
                    d > 0n ? (
                      <li key={i} className="surface-inner flex justify-between px-3 py-2.5 text-sm">
                        <span>{members[i].name} deposits</span>
                        <span className="num font-semibold">{usdc(d)} USDC (simulated)</span>
                      </li>
                    ) : null,
                  )}
                </ul>
                <p className="text-xs text-ink-mute">Funding is not settlement. Nothing is paid out yet.</p>
              </div>
            )}
            {id === 'finalize' && (
              <Callout tone="warn" title="Settlement finalized (simulated); withdrawal pending">
                The contract would record Alex's entitlement of {usdc(plan.total)} USDC in one step. No money reaches Alex until Alex withdraws.
              </Callout>
            )}
            {id === 'withdraw' && (
              <Callout tone="ok" title="Alex withdrew (simulated)">
                A real run would show a confirmed transaction here and the contract state would read {usdc(plan.total)} USDC withdrawn of {usdc(plan.total)} USDC.
              </Callout>
            )}
            {id === 'evidence' && (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="surface-inner p-4">
                    <p className="label">Scripted demo</p>
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-ink-dim">
                      <li>No wallet, no gas</li>
                      <li>Synthetic members and balances</li>
                      <li>No transaction hashes, because none exist</li>
                    </ul>
                  </div>
                  <div className="surface-inner border-cyan/20 p-4">
                    <p className="label text-cyan">Real Arc Testnet run</p>
                    <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-ink-dim">
                      <li>Each member signs with their own wallet</li>
                      <li>Real testnet USDC deposits</li>
                      <li>Confirmed transactions with explorer links</li>
                    </ul>
                  </div>
                </div>
                <a href="#/create" className="btn-primary">
                  Try it for real on Arc Testnet <ArrowRight className="h-4 w-4" aria-hidden />
                </a>
              </div>
            )}
          </Card>
          <div className="flex justify-between gap-3">
            <button className="btn-ghost" disabled={step === 0} onClick={() => { setPlaying(false); setStep((s) => s - 1) }}>
              Back
            </button>
            <button className="btn-ghost" disabled={step === DEMO_STEPS.length - 1} onClick={() => { setPlaying(false); setStep((s) => s + 1) }}>
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
