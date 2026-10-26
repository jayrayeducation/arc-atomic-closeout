import { useRef, useState } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { parseEventLogs, type Address } from 'viem'
import { Plus, X } from 'lucide-react'
import { atomicCloseoutAbi } from '@/lib/abi'
import { getDeployment } from '@/lib/deployments'
import { validateMembers, MAX_MEMBERS } from '@/lib/settlement'
import { groupKey, saveLocalGroup } from '@/lib/storage'
import { clearRevisedDraft, loadRevisedDraft } from '@/lib/revisedGroup'
import { displayUsdc } from '@/lib/browserDeploy'
import { hrefGroup, navigate } from '@/lib/router'
import { useTx } from '@/hooks/useTx'
import { Callout, Card } from '@/components/primitives'
import { NetworkBadge } from '@/components/NetworkBadge'
import { ExplorerLink } from '@/components/ExplorerLink'
import { TxStatus } from '@/components/TxButton'

interface Row {
  address: string
  name: string
}

export default function CreateGroup({ chainId, revised = false }: { chainId: number; revised?: boolean }) {
  const deployment = getDeployment(chainId)
  const draft = revised && deployment?.contract ? loadRevisedDraft(chainId, deployment.contract) : null
  const { address, chainId: walletChainId } = useAccount()
  const client = usePublicClient({ chainId })
  const tx = useTx(chainId)
  const [name, setName] = useState(draft?.name ?? '')
  const [rows, setRows] = useState<Row[]>(() => draft ? draft.newMembers.map((member) => ({ address: member, name: draft.notes.names[member.toLowerCase()] ?? '' })) : [
    { address: '', name: '' },
    { address: '', name: '' },
    { address: '', name: '' },
  ])
  const [error, setError] = useState<string | null>(null)
  const [review, setReview] = useState<{ gas: bigint; maxFeePerGas: bigint; maxCost: bigint } | null>(null)
  const submittingRef = useRef(false)
  const [acknowledged, setAcknowledged] = useState(false)

  // The connected wallet must be a member: it pre-fills the first row until you type there.
  const shown = rows.map((r, i) => (i === 0 && r.address === '' && address ? { ...r, address } : r))

  const update = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, j) => (i === j ? { ...x, ...patch } : x)))

  const validate = () => {
    setError(null)
    const addrs = shown.map((r) => r.address.trim())
    const memberError = validateMembers(addrs)
    if (!name.trim()) { setError('Give the group a name.'); return null }
    if (new TextEncoder().encode(name.trim()).length > 64) { setError('Group names are limited to 64 bytes.'); return null }
    if (memberError) { setError(memberError); return null }
    if (!address || !addrs.some((a) => a.toLowerCase() === address.toLowerCase())) {
      setError('The connected wallet must be one of the members.'); return null
    }
    if (!deployment?.contract || deployment.fromBlock === null || !client) { setError('Deployment configuration is missing on this network.'); return null }
    if (walletChainId !== chainId) { setError(`Switch Rabby to ${deployment.label} before reviewing a transaction.`); return null }
    if (draft && ['Approval', 'Funding', 'Expired'].includes(draft.sourceStatus) && !acknowledged) { setError('Acknowledge that the old active plan and funds stay in the old group.'); return null }
    return addrs as Address[]
  }
  const prepareReview = async () => {
    const addrs = validate()
    if (!addrs || !deployment?.contract || !client || !address) return
    try {
      if (await client.getChainId() !== chainId) throw new Error('RPC is on a different network.')
      const [gas, fees] = await Promise.all([
        client.estimateContractGas({ address: deployment.contract, abi: atomicCloseoutAbi, functionName: 'createGroup', args: [name.trim(), addrs], account: address }),
        client.estimateFeesPerGas(),
      ])
      const maxFeePerGas = fees.maxFeePerGas ?? 0n
      if (maxFeePerGas <= 0n) throw new Error('No reliable gas quote is available.')
      setReview({ gas, maxFeePerGas, maxCost: gas * maxFeePerGas })
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not estimate network fee.') }
  }
  const submit = async () => {
    if (submittingRef.current) return
    const addrs = validate()
    if (!addrs || !review || !deployment?.contract || !client) return
    submittingRef.current = true
    const contract = deployment.contract
    try {
      const latest = await client.estimateFeesPerGas()
      if ((latest.maxFeePerGas ?? 0n) * review.gas > (review.maxCost * 110n) / 100n) {
        setReview(null); setError('Network fee increased. Review a fresh estimate before creating the group.'); return
      }
      setReview(null)
      const hash = await tx.run('Create group', async (ctx) => {
        const { request } = await ctx.client.simulateContract({
          address: contract,
          abi: atomicCloseoutAbi,
          functionName: 'createGroup',
          args: [name.trim(), addrs],
          account: ctx.account,
        })
        await ctx.signing()
        return ctx.wallet.writeContract(request)
      })
      if (!hash) return
      const receipt = await client.getTransactionReceipt({ hash })
      const created = parseEventLogs({ abi: atomicCloseoutAbi, logs: receipt.logs, eventName: 'GroupCreated' })[0]
      if (!created) { setError('Group created, but its id could not be read from the receipt. Open My groups.'); return }
      const groupId = created.args.groupId
      const names: Record<string, string> = {}
      shown.forEach((r) => { if (r.name.trim()) names[r.address.trim().toLowerCase()] = r.name.trim() })
      saveLocalGroup(groupKey(chainId, contract, groupId), { expenses: draft?.notes.expenses ?? [], names: { ...draft?.notes.names, ...names }, description: draft?.description ?? '', visibility: 'active' })
      if (draft) clearRevisedDraft()
      navigate(hrefGroup(chainId, groupId))
    } catch (failure) { setReview(null); setError(failure instanceof Error ? failure.message : 'Could not complete group creation. Check wallet activity before retrying.') }
    finally { submittingRef.current = false }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Create a group</h1>
        <p className="mt-2 text-ink-dim">The member list and its order are written onchain and cannot be changed. Choose 2 to {MAX_MEMBERS} wallets.</p>
      </div>
      <NetworkBadge chainId={chainId} />
      {revised && !draft && <Callout tone="bad">The revised group draft is missing or invalid. Return to the original group and prepare it again. No onchain action occurred.</Callout>}
      {draft && <Callout tone="warn" title={`Revised draft from Group #${draft.sourceGroupId}`}>LOCAL draft only. Old status: {draft.sourceStatus}. Old members: {draft.oldMembers.length}; proposed new members: {draft.newMembers.length}. {draft.notes.expenses.length} local expenses copied; {draft.skippedExpenses} skipped. Old approvals, deposits, entitlements and history stay in Group #{draft.sourceGroupId}.</Callout>}
      {deployment?.contract && deployment.fromBlock !== null ? <p className="text-sm text-ink-dim">{deployment.label} contract: <ExplorerLink chainId={chainId} kind="address" value={deployment.contract} />. {chainId === 5042 ? 'Actions use real USDC for network fees.' : 'Testnet actions use test tokens.'}</p>
        : <Callout tone="bad">Deployment configuration is missing for {deployment?.label ?? `chain ${chainId}`}. Financial actions are disabled; the app will not switch to another network.</Callout>}
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
          {draft && ['Approval', 'Funding', 'Expired'].includes(draft.sourceStatus) && <label className="flex gap-2 text-sm"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /> I understand the old active plan and any funds remain in Group #{draft.sourceGroupId}.</label>}
          {!address ? <ConnectKitButton.Custom>{({ show }) => <button type="button" className="btn-primary" onClick={show}>Connect wallet to review</button>}</ConnectKitButton.Custom>
            : <button type="button" className="btn-primary" onClick={() => void prepareReview()} disabled={!deployment?.contract || deployment.fromBlock === null || (revised && !draft)}>Review new group and network fee</button>}
          <TxStatus tx={tx} chainId={chainId} />
        </div>
      </Card>
      {review && deployment?.contract && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3" role="presentation"><div className="surface max-h-[90dvh] w-full max-w-xl overflow-y-auto p-6" role="dialog" aria-modal="true" aria-label="Review new group onchain"><h2 className="font-display text-xl font-semibold">Create new group onchain?</h2><p className="mt-3 text-sm text-warn">This is a separate Arc Mainnet transaction. The old group and settlement remain unchanged. No funds, approvals or entitlements transfer.</p><dl className="mt-4 space-y-2 break-all text-sm"><div>Old Group ID: {draft?.sourceGroupId ?? 'none'}</div><div>Network: {deployment.label} · {chainId}</div><div>Contract: {deployment.contract}</div><div>New name: {name}</div><div>Estimated gas: {review.gas.toString()}</div><div>Estimated maximum network fee: {displayUsdc(review.maxCost)} USDC</div><div>Members in exact onchain order:</div>{shown.map((row, i) => <div key={i}>{i + 1}. {row.address}</div>)}</dl><div className="mt-5 flex gap-3"><button className="btn-ghost" onClick={() => setReview(null)}>Cancel</button><button className="btn-primary" onClick={() => void submit()}>Create new group onchain</button></div></div></div>}
    </div>
  )
}
