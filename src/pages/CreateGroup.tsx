import { useState } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import { parseEventLogs, type Address } from 'viem'
import { Plus, X } from 'lucide-react'
import { atomicCloseoutAbi } from '@/lib/abi'
import { getDeployment } from '@/lib/deployments'
import { validateMembers, MAX_MEMBERS } from '@/lib/settlement'
import { groupKey, saveLocalGroup } from '@/lib/storage'
import { hrefGroup, navigate } from '@/lib/router'
import { useTx } from '@/hooks/useTx'
import { Callout, Card } from '@/components/primitives'
import { NetworkBadge } from '@/components/NetworkBadge'
import { TxButton, TxStatus } from '@/components/TxButton'

interface Row {
  address: string
  name: string
}

export default function CreateGroup({ chainId }: { chainId: number }) {
  const deployment = getDeployment(chainId)
  const { address } = useAccount()
  const client = usePublicClient({ chainId })
  const tx = useTx(chainId)
  const [name, setName] = useState('')
  const [rows, setRows] = useState<Row[]>([
    { address: '', name: '' },
    { address: '', name: '' },
    { address: '', name: '' },
  ])
  const [error, setError] = useState<string | null>(null)

  // The connected wallet must be a member: it pre-fills the first row until you type there.
  const shown = rows.map((r, i) => (i === 0 && r.address === '' && address ? { ...r, address } : r))

  const update = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, j) => (i === j ? { ...x, ...patch } : x)))

  const submit = async () => {
    setError(null)
    const addrs = shown.map((r) => r.address.trim())
    const memberError = validateMembers(addrs)
    if (!name.trim()) return setError('Give the group a name.')
    if (new TextEncoder().encode(name.trim()).length > 64) return setError('Group names are limited to 64 bytes.')
    if (memberError) return setError(memberError)
    if (!address || !addrs.some((a) => a.toLowerCase() === address.toLowerCase())) {
      return setError('The connected wallet must be one of the members.')
    }
    if (!deployment?.contract || !client) return setError('No contract is deployed on this network.')
    const contract = deployment.contract
    const hash = await tx.run('Create group', async (ctx) => {
      const { request } = await ctx.client.simulateContract({
        address: contract,
        abi: atomicCloseoutAbi,
        functionName: 'createGroup',
        args: [name.trim(), addrs as Address[]],
        account: ctx.account,
      })
      ctx.signing()
      return ctx.wallet.writeContract(request)
    })
    if (!hash) return
    const receipt = await client.getTransactionReceipt({ hash })
    const created = parseEventLogs({ abi: atomicCloseoutAbi, logs: receipt.logs, eventName: 'GroupCreated' })[0]
    if (!created) return setError('Group created, but its id could not be read from the receipt. Open My groups.')
    const groupId = created.args.groupId
    const names: Record<string, string> = {}
    shown.forEach((r) => {
      if (r.name.trim()) names[r.address.trim().toLowerCase()] = r.name.trim()
    })
    saveLocalGroup(groupKey(chainId, contract, groupId), { expenses: [], names })
    navigate(hrefGroup(chainId, groupId))
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Create a group</h1>
        <p className="mt-2 text-ink-dim">The member list and its order are written onchain and cannot be changed. Choose 2 to {MAX_MEMBERS} wallets.</p>
      </div>
      <NetworkBadge chainId={chainId} />
      {!deployment?.contract && <Callout tone="bad">No contract is configured for this network.</Callout>}
      <Card>
        <div className="space-y-5">
          <label className="block">
            <span className="label">Group name</span>
            <input className="input mt-1.5" value={name} onChange={(e) => setName(e.target.value)} placeholder="Weekend Trip" maxLength={64} />
          </label>
          <div>
            <p className="label mb-2">Members</p>
            <ul className="space-y-3">
              {shown.map((r, i) => (
                <li key={i} className="grid gap-2 sm:grid-cols-[1fr_160px_auto]">
                  <input className="input font-mono" placeholder="0x wallet address" value={r.address} onChange={(e) => update(i, { address: e.target.value })} aria-label={`Member ${i + 1} wallet`} />
                  <input className="input" placeholder="Name (local only)" value={r.name} onChange={(e) => update(i, { name: e.target.value })} aria-label={`Member ${i + 1} name`} maxLength={24} />
                  <button type="button" className="btn-ghost px-3" disabled={rows.length <= 2} onClick={() => setRows((x) => x.filter((_, j) => j !== i))} aria-label={`Remove member ${i + 1}`}>
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="btn-ghost mt-3" disabled={rows.length >= MAX_MEMBERS} onClick={() => setRows((x) => [...x, { address: '', name: '' }])}>
              <Plus className="h-4 w-4" aria-hidden /> Add member
            </button>
            <p className="mt-3 text-xs text-ink-mute">Names are saved only in this browser. Everyone else sees shortened wallet addresses until they add their own labels.</p>
          </div>
          {error && <Callout tone="bad">{error}</Callout>}
          <TxButton tx={tx} chainId={chainId} label="Create group onchain" onRun={() => void submit()} disabled={!deployment?.contract} />
          <TxStatus tx={tx} chainId={chainId} />
        </div>
      </Card>
    </div>
  )
}
