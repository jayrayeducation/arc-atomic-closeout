import { signedUsdc, usdc } from '@/lib/format'

export interface BalanceRow {
  name: string
  paid: bigint
  share: bigint
  net: bigint
}

/** Static figures for the landing preview only. Mirrors the Weekend Trip demo fixture (see tests). */
export const SAMPLE_BALANCES = [
  { name: 'Alex', net: 1, display: '210.48 USDC' },
  { name: 'Maya', net: -1, display: '125.57 USDC' },
  { name: 'Jordan', net: -1, display: '84.92 USDC' },
]

/** Diverging bar chart of signed net positions. Widths are derived from exact integers. */
export function BalanceChart({ rows }: { rows: BalanceRow[] }) {
  let max = 1n
  for (const r of rows) {
    const a = r.net < 0n ? -r.net : r.net
    if (a > max) max = a
  }
  return (
    <ul className="space-y-3" aria-label="Net positions chart">
      {rows.map((r) => {
        const abs = r.net < 0n ? -r.net : r.net
        const pct = Number((abs * 10000n) / max) / 100 // display-only ratio, never used for money
        return (
          <li key={r.name} className="grid grid-cols-[84px_1fr_auto] items-center gap-3 text-sm">
            <span className="truncate font-medium">{r.name}</span>
            <div className="relative h-3 rounded-full bg-white/[0.05]">
              <div className="absolute left-1/2 top-[-3px] h-[18px] w-px bg-white/20" aria-hidden />
              <div
                className={`absolute top-0 h-3 rounded-full ${r.net >= 0n ? 'left-1/2 bg-ok' : 'right-1/2 bg-bad'}`}
                style={{ width: `${pct / 2}%` }}
              />
            </div>
            <span className={`num w-28 text-right font-semibold ${r.net > 0n ? 'text-ok' : r.net < 0n ? 'text-bad' : 'text-ink-mute'}`}>
              {r.net === 0n ? usdc(0n) : signedUsdc(r.net)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
