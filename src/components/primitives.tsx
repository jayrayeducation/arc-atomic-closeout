import type { ReactNode } from 'react'
import clsx from 'clsx'
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import type { StatusName } from '@/lib/types'

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton', className)} aria-hidden />
}

const TONE: Record<string, string> = {
  neutral: 'border-white/10 bg-white/[0.04] text-ink-dim',
  cyan: 'border-cyan/30 bg-cyan/10 text-cyan',
  blue: 'border-blue/30 bg-blue/10 text-blue',
  ok: 'border-ok/30 bg-ok/10 text-ok',
  warn: 'border-warn/30 bg-warn/10 text-warn',
  bad: 'border-bad/30 bg-bad/10 text-bad',
}

export function Pill({ tone = 'neutral', children, className }: { tone?: keyof typeof TONE; children: ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold', TONE[tone], className)}>
      {children}
    </span>
  )
}

const STATUS_TONE: Record<StatusName, { tone: keyof typeof TONE; label: string }> = {
  None: { tone: 'neutral', label: 'No plan yet' },
  Approval: { tone: 'blue', label: 'Awaiting approvals' },
  Funding: { tone: 'cyan', label: 'Funding' },
  Settled: { tone: 'ok', label: 'Finalized' },
  Expired: { tone: 'warn', label: 'Expired' },
  Refunded: { tone: 'neutral', label: 'Refunded' },
  Cancelled: { tone: 'neutral', label: 'Cancelled' },
}

export function StatusPill({ status, fullyFunded }: { status: StatusName; fullyFunded?: boolean }) {
  const s = STATUS_TONE[status]
  const label = status === 'Funding' && fullyFunded ? 'Fully funded, awaiting finalize' : s.label
  return <Pill tone={s.tone}>{label}</Pill>
}

export function DemoBadge({ className }: { className?: string }) {
  return (
    <Pill tone="warn" className={clsx('uppercase tracking-wider', className)}>
      Demo data
    </Pill>
  )
}

export function Callout({ tone = 'info', title, children }: { tone?: 'info' | 'warn' | 'bad' | 'ok'; title?: string; children: ReactNode }) {
  const Icon = tone === 'ok' ? CheckCircle2 : tone === 'info' ? Info : AlertTriangle
  const color = { info: 'border-blue/30 bg-blue/10 text-blue', warn: 'border-warn/30 bg-warn/10 text-warn', bad: 'border-bad/30 bg-bad/10 text-bad', ok: 'border-ok/30 bg-ok/10 text-ok' }[tone]
  return (
    <div role={tone === 'bad' ? 'alert' : 'status'} className={clsx('flex gap-3 rounded-xl border p-3.5 text-sm', color)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 text-ink-dim">
        {title && <p className="font-semibold text-ink">{title}</p>}
        <div className="text-pretty">{children}</div>
      </div>
    </div>
  )
}

export function Card({ title, aside, children, className }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx('surface p-5 sm:p-6', className)}>
      {(title || aside) && (
        <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>}
          {aside}
        </header>
      )}
      {children}
    </section>
  )
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'ok' | 'bad' | 'cyan' }) {
  return (
    <div className="surface-inner p-4">
      <p className="label">{label}</p>
      <p className={clsx('num mt-1 font-display text-2xl font-semibold tracking-tight', tone === 'ok' && 'text-ok', tone === 'bad' && 'text-bad', tone === 'cyan' && 'text-cyan')}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-ink-mute">{sub}</p>}
    </div>
  )
}

export function Progress({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max === 0 ? 0 : Math.min(100, Math.round((value / max) * 100))
  return (
    <div>
      <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded-full bg-gradient-to-r from-blue to-cyan" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
