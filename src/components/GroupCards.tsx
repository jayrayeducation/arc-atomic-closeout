import { useState } from 'react'
import { ArrowRight, Users } from 'lucide-react'
import { useGroup } from '@/hooks/useGroup'
import { useLocalGroup } from '@/hooks/useLocalGroup'
import { getDeployment } from '@/lib/deployments'
import { hrefGroup, navigate } from '@/lib/router'
import { statusName } from '@/lib/types'
import { usdc } from '@/lib/format'
import { Skeleton, StatusPill } from './primitives'
import { GroupActions } from './GroupActions'

export function GroupCard({ chainId, groupId }: { chainId: number; groupId: bigint }) {
  const { data, isLoading, error } = useGroup(chainId, groupId)
  const contract = getDeployment(chainId)?.contract ?? null
  const local = useLocalGroup(chainId, contract, groupId)
  if (isLoading) return <Skeleton className="h-28" />
  if (error || !data) return <div className="surface p-5 text-sm text-bad">Could not load group #{groupId.toString()}.</div>
  const { group, current } = data
  const status = current ? statusName(current.status) : 'None'
  return <article className="surface p-5 transition hover:border-cyan/30">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <a href={hrefGroup(chainId, groupId)} className="font-display text-lg font-semibold text-cyan hover:underline">{local.localTitle?.trim() || group.name}</a>
        {local.localTitle?.trim() && <p className="text-xs text-ink-mute">ONCHAIN name: {group.name}</p>}
        {local.description && <p className="mt-1 line-clamp-2 text-xs text-ink-dim">{local.description}</p>}
        <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-mute"><Users className="h-3.5 w-3.5" aria-hidden /> {group.members.length} members · group #{groupId.toString()}</p>
      </div>
      <div className="flex flex-col items-end gap-2"><StatusPill status={status} fullyFunded={current ? current.fundedTotal === current.totalAmount : false} />
        {contract && <GroupActions chainId={chainId} contract={contract} groupId={groupId} onchainName={group.name} members={group.members} status={status} local={local} />}</div>
    </div>
    <div className="mt-4 flex items-center justify-between text-sm"><span className="num text-ink-dim">{current ? `${usdc(current.totalAmount)} USDC plan` : 'No plan proposed'}</span><a href={hrefGroup(chainId, groupId)} className="inline-flex items-center gap-1 text-cyan hover:underline">Open group <ArrowRight className="h-4 w-4" /></a></div>
  </article>
}

/** Open any group by id: groups are readable without a wallet and without the creator's browser. */
export function OpenGroupById({ chainId }: { chainId: number }) {
  const [id, setId] = useState('')
  return <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); if (/^\d+$/.test(id) && id !== '0') navigate(hrefGroup(chainId, BigInt(id))) }}>
    <input className="input" inputMode="numeric" placeholder="Group id, for example 1" value={id} onChange={(event) => setId(event.target.value.trim())} aria-label="Group id" />
    <button className="btn-ghost" type="submit">Open</button>
  </form>
}
