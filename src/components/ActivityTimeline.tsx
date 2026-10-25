import { usePublicClient } from 'wagmi'
import { useQuery } from '@tanstack/react-query'
import { type PublicClient } from 'viem'
import { CheckCircle2, Coins, FileCheck2, Flag, Landmark, RotateCcw, Users, XCircle, type LucideIcon } from 'lucide-react'
import type { ActivityEvent } from '@/lib/types'
import { usdc, shortAddr } from '@/lib/format'
import { ExplorerLink } from './ExplorerLink'
import { Skeleton } from './primitives'

const META: Record<ActivityEvent['name'], { icon: LucideIcon; color: string; title: (e: ActivityEvent) => string }> = {
  GroupCreated: { icon: Users, color: 'text-blue', title: (e) => `Group "${String(e.args.name)}" created` },
  MemberAdded: { icon: Users, color: 'text-blue', title: () => 'Member added' },
  PlanProposed: { icon: FileCheck2, color: 'text-blue', title: (e) => `Plan proposed for ${usdc(e.args.totalAmount as bigint)} USDC` },
  PlanApproved: { icon: CheckCircle2, color: 'text-cyan', title: (e) => `Approved (${String(e.args.approvalCount)} total)` },
  FundingOpened: { icon: Flag, color: 'text-cyan', title: () => 'All approved, funding opened' },
  PlanCancelled: { icon: XCircle, color: 'text-ink-mute', title: () => 'Plan cancelled by proposer' },
  Funded: { icon: Coins, color: 'text-cyan', title: (e) => `Deposited ${usdc(e.args.amount as bigint)} USDC` },
  Finalized: { icon: Landmark, color: 'text-ok', title: (e) => `Finalized ${usdc(e.args.totalAmount as bigint)} USDC` },
  Withdrawn: { icon: Landmark, color: 'text-ok', title: (e) => `Withdrew ${usdc(e.args.amount as bigint)} USDC` },
  Refunded: { icon: RotateCcw, color: 'text-warn', title: (e) => `Refunded ${usdc(e.args.amount as bigint)} USDC` },
}

interface Props {
  chainId: number
  events: ActivityEvent[]
  head?: bigint
  loading?: boolean
  nameOf: (addr: string) => string
}

export function ActivityTimeline({ chainId, events, head, loading, nameOf }: Props) {
  const client = usePublicClient({ chainId })
  const shown = [...events].reverse().slice(0, 60)
  const blocks = [...new Set(shown.map((e) => e.blockNumber.toString()))]
  const times = useQuery({
    queryKey: ['blockTimes', chainId, blocks.join(',')],
    enabled: Boolean(client) && blocks.length > 0,
    staleTime: Infinity,
    queryFn: async () => {
      const out: Record<string, number> = {}
      await Promise.all(
        blocks.map(async (b) => {
          const blk = await (client as PublicClient).getBlock({ blockNumber: BigInt(b) })
          out[b] = Number(blk.timestamp)
        }),
      )
      return out
    },
  })
  if (loading) return <Skeleton className="h-40" />
  if (shown.length === 0) return <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-ink-mute">No onchain activity yet for this group on this network.</p>
  return (
    <ol className="relative space-y-1 border-l border-white/10 pl-5">
      {shown.map((e) => {
        const m = META[e.name]
        const ts = times.data?.[e.blockNumber.toString()]
        const confirmations = head !== undefined ? head - e.blockNumber + 1n : null
        return (
          <li key={e.key} className="relative py-2.5">
            <span className={`absolute -left-[31px] top-3 grid h-5 w-5 place-items-center rounded-full bg-navy-900 ${m.color}`}>
              <m.icon className="h-4 w-4" aria-hidden />
            </span>
            <p className="text-sm font-medium">{m.title(e)}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-mute">
              {e.actor && <span>{nameOf(e.actor) || shortAddr(e.actor)}</span>}
              {ts && <span>{new Date(ts * 1000).toLocaleString()}</span>}
              <span>block {e.blockNumber.toString()}</span>
              {confirmations !== null && <span className="text-ok">confirmed{confirmations > 1n ? `, ${confirmations.toString()} blocks deep` : ''}</span>}
              <ExplorerLink chainId={chainId} kind="tx" value={e.txHash} />
            </p>
          </li>
        )
      })}
    </ol>
  )
}
