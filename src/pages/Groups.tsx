import { useAccount } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { Plus } from 'lucide-react'
import { getDeployment } from '@/lib/deployments'
import { useMyGroupIds } from '@/hooks/useChainEvents'
import { GroupCard, OpenGroupById } from '@/components/GroupCards'
import { NetworkBadge } from '@/components/NetworkBadge'
import { Callout, Skeleton } from '@/components/primitives'

export default function Groups({ chainId }: { chainId: number }) {
  const { address } = useAccount()
  const q = useMyGroupIds(chainId, address)
  const deployment = getDeployment(chainId)
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">My groups</h1>
          <p className="mt-2 text-ink-dim">Groups where your connected wallet is a member, read from the chain.</p>
        </div>
        <a href={`#/create/${chainId}`} className="btn-primary">
          <Plus className="h-4 w-4" aria-hidden /> Create group
        </a>
      </div>
      <NetworkBadge chainId={chainId} />
      {(!deployment?.contract || deployment.fromBlock === null) && <Callout tone="bad">Deployment configuration is missing for {deployment?.label ?? `chain ${chainId}`}. Financial actions are disabled; the app will not switch to another network.</Callout>}
      {!address ? (
        <Callout title="Connect a wallet to see your groups">
          <span className="mt-2 block">
            <ConnectKitButton.Custom>
              {({ show }) => (
                <button className="btn-primary" onClick={show}>
                  Connect wallet
                </button>
              )}
            </ConnectKitButton.Custom>
          </span>
        </Callout>
      ) : q.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : q.error ? (
        <Callout tone="bad" title="Could not read events from the network">
          Check your connection and try again.
        </Callout>
      ) : (
        <>
          {q.data?.backfilling && (
            <Callout title="Still scanning the chain">
              Scanned to block {q.data.scanned.toString()} of {q.data.head.toString()}. More groups may appear.
            </Callout>
          )}
          {q.ids.length === 0 ? (
            <div className="surface p-8 text-center text-ink-dim">You are not a member of any group on this network yet.</div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {q.ids.map((id) => (
                <GroupCard key={id.toString()} chainId={chainId} groupId={id} />
              ))}
            </div>
          )}
        </>
      )}
      <div className="surface-inner max-w-md p-4">
        <p className="label mb-2">Open a shared group</p>
        <OpenGroupById chainId={chainId} />
      </div>
    </div>
  )
}
