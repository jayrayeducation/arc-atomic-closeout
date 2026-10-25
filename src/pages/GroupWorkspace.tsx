import { useEffect, useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import clsx from 'clsx'
import { Check, Copy, Link2 } from 'lucide-react'
import { getDeployment } from '@/lib/deployments'
import { buildPlan, computeBalances } from '@/lib/settlement'
import { buildMembers } from '@/lib/members'
import { buildShareLink } from '@/lib/share'
import { hrefGroup } from '@/lib/router'
import { statusName } from '@/lib/types'
import { usdc, formatDeadline, shortAddr } from '@/lib/format'
import { useGroup } from '@/hooks/useGroup'
import { useGroupEvents } from '@/hooks/useChainEvents'
import { useLocalGroup } from '@/hooks/useLocalGroup'
import { ActivityTimeline } from '@/components/ActivityTimeline'
import { Balances } from '@/components/Balances'
import { ExpensesTab } from '@/components/ExpensesTab'
import { ExplorerLink } from '@/components/ExplorerLink'
import { NetworkBadge } from '@/components/NetworkBadge'
import { Callout, Card, Skeleton, Stat, StatusPill } from '@/components/primitives'
import { RoundTab } from '@/components/RoundTab'
import { SettlementPlan } from '@/components/SettlementPlan'

const TABS = [
  { id: 'round', label: 'Round' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'balances', label: 'Balances' },
  { id: 'activity', label: 'Activity' },
] as const
type TabId = (typeof TABS)[number]['id']

const STAGES = ['Track', 'Approve', 'Fund', 'Settle']

export default function GroupWorkspace({ chainId, groupId, initialTab }: { chainId: number; groupId: bigint; initialTab: string | null }) {
  const deployment = getDeployment(chainId)
  const { address } = useAccount()
  const q = useGroup(chainId, groupId)
  const ev = useGroupEvents(chainId, groupId)
  const local = useLocalGroup(chainId, deployment?.contract ?? null, groupId)
  const [tab, setTab] = useState<TabId>(TABS.some((t) => t.id === initialTab) ? (initialTab as TabId) : 'round')
  const [shareUrl, setShareUrl] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    void buildShareLink(hrefGroup(chainId, groupId)).then(setShareUrl)
  }, [chainId, groupId])

  const members = useMemo(() => (q.data ? buildMembers(q.data.group.members, local.names) : []), [q.data, local.names])
  const me = useMemo(() => (address ? members.findIndex((m) => m.address.toLowerCase() === address.toLowerCase()) : -1), [address, members])
  const balances = useMemo(() => {
    if (members.length === 0 || local.expenses.length === 0) return null
    try {
      return computeBalances(local.expenses, members.length)
    } catch {
      return null
    }
  }, [local.expenses, members.length])

  if (!deployment?.contract || deployment.fromBlock === null) {
    return <Callout tone="bad" title={`No deployment configured for ${deployment?.label ?? `chain ${chainId}`}`}>This app only reads a network when its contract address is configured. Data from other networks is never shown here.</Callout>
  }
  if (q.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <div className="grid gap-4 sm:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }
  if (q.error || !q.data) {
    return (
      <Callout tone="bad" title={`Group #${groupId.toString()} was not found on ${deployment.label}`}>
        Check the group id and network. The group may not exist or the RPC may be unreachable.
      </Callout>
    )
  }

  const { group, current } = q.data
  const status = current ? statusName(current.status) : 'None'
  const stage = status === 'Approval' ? 1 : status === 'Funding' ? 2 : status === 'Settled' ? 3 : 0
  const totalPaidLocal = local.expenses.reduce((a, e) => a + e.amount, 0n)
  const live = status === 'Approval' || status === 'Funding'
  const nameOf = (a: string) => members.find((m) => m.address.toLowerCase() === a.toLowerCase())?.name.split(' (')[0] ?? ''

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="label">Group #{groupId.toString()}</p>
          <h1 className="truncate font-display text-3xl font-semibold tracking-tight">{group.name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <NetworkBadge chainId={chainId} />
            <StatusPill status={status} fullyFunded={current ? current.fundedTotal === current.totalAmount : false} />
            <span className="text-xs text-ink-mute">
              Contract <ExplorerLink chainId={chainId} kind="address" value={deployment.contract} />
            </span>
          </div>
        </div>
        <button
          className="btn-ghost"
          onClick={() => {
            void navigator.clipboard.writeText(shareUrl).then(() => {
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1800)
            })
          }}
          disabled={!shareUrl}
        >
          {copied ? <Check className="h-4 w-4 text-ok" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          {copied ? 'Link copied' : 'Copy group link'}
        </button>
      </div>

      <ol className="grid grid-cols-4 gap-2" aria-label="Round stage">
        {STAGES.map((s, i) => (
          <li key={s} className={clsx('rounded-xl border px-3 py-2.5 text-center text-xs font-semibold sm:text-sm', i < stage || (i === 3 && status === 'Settled') ? 'border-ok/30 bg-ok/10 text-ok' : i === stage ? 'border-cyan/40 bg-cyan/10 text-cyan' : 'border-white/[0.06] text-ink-mute')}>
            {s}
          </li>
        ))}
      </ol>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Members" value={group.members.length} sub={me >= 0 ? `You are ${members[me].name.split(' (')[0]}` : address ? 'Your wallet is not a member' : 'Wallet not connected'} />
        <Stat label="Expenses total (local)" value={usdc(totalPaidLocal)} sub="from this browser's notes" />
        <Stat label="Plan total (onchain)" value={current ? usdc(current.totalAmount) : '—'} sub={current ? `Funded ${usdc(current.fundedTotal)}` : 'No plan proposed'} tone="cyan" />
        <Stat label="Deadline" value={current && live ? formatDeadline(current.deadline) : '—'} sub={current ? `Approvals ${current.approvalCount}/${group.members.length}` : undefined} />
      </div>

      <div role="tablist" aria-label="Group sections" className="flex gap-1 overflow-x-auto rounded-xl border border-white/[0.06] bg-card p-1">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={clsx('min-h-[44px] flex-1 whitespace-nowrap rounded-lg px-4 text-sm font-semibold transition', tab === t.id ? 'bg-white/10 text-cyan' : 'text-ink-dim hover:text-ink')}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'round' && (
        <RoundTab chainId={chainId} contract={deployment.contract} groupId={groupId} data={q.data} members={members} me={me} events={ev.events} expenses={local.expenses} />
      )}
      {tab === 'expenses' && (
        <ExpensesTab members={members} expenses={local.expenses} names={local.names} me={me} locked={live} onAdd={local.addExpense} onDelete={local.removeExpense} onNameChange={local.setName} onReplace={local.replaceAll} />
      )}
      {tab === 'balances' && (
        <div className="space-y-6">
          <Card title="Balances from your expense notes" aside={<span className="text-xs text-ink-mute">local, not onchain</span>}>
            {balances ? <Balances members={members} balances={balances} /> : <p className="text-sm text-ink-mute">Add expenses to see paid, share and net position for every member.</p>}
          </Card>
          {balances && (
            <Card title="Proposed settlement">
              <SettlementPlan members={members} plan={buildPlan(balances.net)} me={me >= 0 ? me : undefined} />
            </Card>
          )}
          {current && (
            <Card title="Onchain plan (authoritative)">
              <SettlementPlan members={members} plan={{ debts: [...current.debts], credits: [...current.credits], total: current.totalAmount }} me={me >= 0 ? me : undefined} />
            </Card>
          )}
        </div>
      )}
      {tab === 'activity' && (
        <Card title="Activity" aside={ev.data?.backfilling ? <span className="text-xs text-warn">Scanning: block {ev.data.scanned.toString()} of {ev.data.head.toString()}</span> : <span className="inline-flex items-center gap-1 text-xs text-ink-mute"><Link2 className="h-3 w-3" aria-hidden />Live from {shortAddr(deployment.contract)}</span>}>
          <ActivityTimeline chainId={chainId} events={ev.events} head={ev.data?.head} loading={ev.isLoading} nameOf={nameOf} />
        </Card>
      )}
    </div>
  )
}
