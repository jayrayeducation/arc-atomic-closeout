import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Address } from 'viem'
import { ArrowDown, ArrowUp, MoreHorizontal, X } from 'lucide-react'
import { useLocalGroup } from '@/hooks/useLocalGroup'
import { buildShareLink } from '@/lib/share'
import { groupKey, exportLocalGroup, type GroupVisibility } from '@/lib/storage'
import { hrefGroup, navigate } from '@/lib/router'
import { prepareRevisedDraft, saveRevisedDraft } from '@/lib/revisedGroup'
import { buildPlan, computeBalances } from '@/lib/settlement'
import { usdc } from '@/lib/format'
import { Callout } from './primitives'

type Local = ReturnType<typeof useLocalGroup>
type Mode = 'details' | 'archive' | 'hide' | 'delete' | 'revision' | null
interface Props { chainId: number; contract: Address; groupId: bigint; onchainName: string; members: readonly Address[]; status: string; local: Local }

export function GroupActions({ chainId, contract, groupId, onchainName, members, status, local }: Props) {
  const [mode, setMode] = useState<Mode>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [rows, setRows] = useState<Address[]>([])
  const [acknowledged, setAcknowledged] = useState(false)
  const [backupMade, setBackupMade] = useState(false)
  const [phrase, setPhrase] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const dialog = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLDetailsElement>(null)
  const actionTaken = useRef(false)
  const hadDialog = useRef(false)
  const key = groupKey(chainId, contract, groupId)
  const visibleName = local.localTitle?.trim() || onchainName
  const open = (next: Mode) => {
    if (menu.current) menu.current.open = false
    actionTaken.current = false
    setMode(next); setTitle(local.localTitle || onchainName); setDescription(local.description || '')
    setRows([...members]); setAcknowledged(false); setBackupMade(false); setPhrase(''); setError('')
  }
  const close = () => {
    setMode(null)
    window.requestAnimationFrame(() => menu.current?.querySelector('summary')?.focus())
  }
  useEffect(() => {
    if (!mode) {
      if (hadDialog.current) window.requestAnimationFrame(() => menu.current?.querySelector('summary')?.focus())
      hadDialog.current = false
      return
    }
    hadDialog.current = true
    dialog.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { close(); return }
      if (event.key !== 'Tab' || !dialog.current) return
      const items = [...dialog.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled])')]
      if (!items.length) return
      if (event.shiftKey && (document.activeElement === items[0] || document.activeElement === dialog.current)) { event.preventDefault(); items[items.length - 1].focus() }
      else if (!event.shiftKey && document.activeElement === items[items.length - 1]) { event.preventDefault(); items[0].focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = previousOverflow }
  }, [mode])
  const backup = () => {
    const text = exportLocalGroup(key, { expenses: local.expenses, names: local.names, localTitle: local.localTitle, description: local.description, visibility: local.visibility }, members)
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = `atomic-closeout-group-${groupId}-local-backup.json`; a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setBackupMade(true)
  }
  const saveVisibility = (visibility: GroupVisibility) => {
    if (actionTaken.current) return
    actionTaken.current = true
    if (menu.current) menu.current.open = false
    local.setVisibility(visibility); setMode(null); setNotice(`${visibility === 'active' ? 'Restored' : visibility === 'archived' ? 'Archived' : 'Hidden'} locally. Onchain history is unchanged.`)
  }
  const move = (index: number, delta: number) => {
    const next = [...rows]; const at = index + delta
    if (at < 0 || at >= next.length) return
    ;[next[index], next[at]] = [next[at], next[index]]
    setRows(next)
  }
  let draft: ReturnType<typeof prepareRevisedDraft> | null = null
  let draftError = ''
  if (mode === 'revision') {
    try { draft = prepareRevisedDraft({ chainId, contract, sourceGroupId: groupId.toString(), sourceStatus: status,
      name: title, description, oldMembers: [...members], newMembers: rows, sourceNotes: local }) }
    catch (failure) { draftError = failure instanceof Error ? failure.message : 'Invalid revised group.' }
  }
  const activePlan = status === 'Approval' || status === 'Funding' || status === 'Expired'
  const plan = draft?.notes.expenses.length ? buildPlan(computeBalances(draft.notes.expenses, draft.newMembers.length).net) : null
  return <div className="relative" onClick={(event) => event.stopPropagation()}>
    <details ref={menu} className="group/menu relative"><summary className="btn-ghost list-none cursor-pointer px-3" aria-label={`Manage group ${groupId}`}><MoreHorizontal className="h-4 w-4" /> Manage</summary>
      <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-white/15 bg-navy-800 p-1 shadow-xl">
        <a className="block rounded-lg px-3 py-2 text-sm hover:bg-white/10" href={hrefGroup(chainId, groupId)}>Open group</a>
        <button className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10" onClick={() => open('details')}>Rename locally / Edit local details</button>
        {local.visibility === 'archived' || local.visibility === 'hidden' ? <button className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10" onClick={() => saveVisibility('active')}>Restore group</button> : <>
          <button className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10" onClick={() => open('archive')}>Archive group</button>
          <button className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10" onClick={() => open('hide')}>Hide from My groups</button>
        </>}
        <button className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10" onClick={() => open('revision')}>Change members / Create revised group</button>
        <button className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10" onClick={() => open('revision')}>Duplicate as new group</button>
        <button className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10" onClick={() => void buildShareLink(hrefGroup(chainId, groupId)).then((url) => navigator.clipboard.writeText(url)).then(() => setNotice('Group link copied.')).catch(() => setNotice('Could not copy the link.'))}>Copy group link</button>
        <button className="block w-full rounded-lg px-3 py-2 text-left text-sm text-bad hover:bg-white/10" onClick={() => open('delete')}>Delete local notes</button>
      </div>
    </details>
    {notice && <p role="status" className="mt-1 max-w-56 text-xs text-cyan">{notice}</p>}
    {mode && createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-3" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) close() }}><div ref={dialog} tabIndex={-1} className="surface max-h-[92dvh] w-full max-w-xl overflow-y-auto p-5 shadow-2xl outline-none sm:p-7" role="dialog" aria-modal="true" aria-label={`${mode} group ${groupId}`}>
      <div className="mb-4 flex items-start justify-between gap-3"><div><p className="label text-cyan">Group #{groupId.toString()} · LOCAL management</p><h2 className="font-display text-xl font-semibold">{mode === 'details' ? 'Edit local details' : mode === 'archive' ? 'Archive this group?' : mode === 'hide' ? 'Hide from My groups?' : mode === 'delete' ? 'Delete local notes?' : 'Change members / Create revised group'}</h2></div><button type="button" className="btn-ghost px-2" aria-label="Close dialog" onClick={close}><X className="h-4 w-4" /></button></div>
      {local.storageError && <Callout tone="bad">Local notes cannot be changed: {local.storageError}</Callout>}
      {mode === 'details' && <div className="space-y-4"><p className="text-sm text-ink-dim">ONCHAIN name: {onchainName}. Your local title and description appear only in this browser.</p><label className="block text-sm">Local title<input className="input mt-1" value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} /></label><label className="block text-sm">Description<textarea className="input mt-1 min-h-24" value={description} maxLength={1000} onChange={(event) => setDescription(event.target.value)} /></label><button className="btn-primary" disabled={Boolean(local.storageError)} onClick={() => { local.setDetails(title.trim(), description.trim()); setMode(null); setNotice('Local details saved. Onchain name is unchanged.') }}>Save local details</button></div>}
      {(mode === 'archive' || mode === 'hide') && <div className="space-y-4"><p className="text-sm text-ink-dim">{visibleName} will move to the {mode === 'archive' ? 'Archived' : 'Hidden'} tab in this browser. Its onchain group, members and settlement remain public and unchanged. No wallet request or network fee is involved.</p><div className="flex gap-3"><button className="btn-ghost" onClick={() => setMode(null)}>Cancel</button><button className="btn-primary" disabled={Boolean(local.storageError)} onClick={() => saveVisibility(mode === 'archive' ? 'archived' : 'hidden')}>Confirm {mode}</button></div></div>}
      {mode === 'delete' && <div className="space-y-4"><Callout tone="warn">This clears {local.expenses.length} local expenses, member labels, local title and description from this browser. It does not delete the blockchain group or Group #{groupId.toString()} settlement history.</Callout><button className="btn-ghost" onClick={backup}>Download local backup first</button>{chainId === 5042 && groupId === 1n && <Callout tone="warn">Group #1 contains contest evidence. Download the backup before clearing its local notes.</Callout>}<label className="block text-sm">Type DELETE LOCAL NOTES to continue<input className="input mt-1" value={phrase} onChange={(event) => setPhrase(event.target.value)} /></label><div className="flex gap-3"><button className="btn-ghost" onClick={() => setMode(null)}>Cancel</button><button className="btn-primary" disabled={phrase !== 'DELETE LOCAL NOTES' || (chainId === 5042 && groupId === 1n && !backupMade) || Boolean(local.storageError)} onClick={() => { local.clearNotes(); setMode(null); setNotice('Only browser-local notes were cleared. Onchain history remains.') }}>Delete local notes</button></div></div>}
      {mode === 'revision' && <div className="space-y-4"><Callout tone="warn">The original Group #{groupId.toString()} and all approvals, deposits, claims and history stay unchanged. A draft creates no transaction. A separate Create new group onchain action will be required.</Callout>{activePlan && <Callout tone="bad">Current status: {status}. Finish the current approval or funding path, or use the contract's cancel/refund actions when available. No funds or entitlements move to the new group.</Callout>}<label className="block text-sm">New group name<input className="input mt-1" value={title} maxLength={64} onChange={(event) => setTitle(event.target.value)} /></label><p className="text-sm font-semibold">Old onchain members</p><ol className="list-inside list-decimal break-all text-xs text-ink-mute">{members.map((address) => <li key={address}>{address}</li>)}</ol><p className="text-sm font-semibold">New member order</p><ol className="space-y-2">{rows.map((address, index) => <li key={index} className="flex gap-2"><input className="input min-w-0 flex-1 font-mono text-xs" aria-label={`New member ${index + 1}`} value={address} onChange={(event) => setRows(rows.map((row, i) => i === index ? event.target.value as Address : row))} /><button className="btn-ghost px-2" aria-label={`Move member ${index + 1} up`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp className="h-4 w-4" /></button><button className="btn-ghost px-2" aria-label={`Move member ${index + 1} down`} disabled={index === rows.length - 1} onClick={() => move(index, 1)}><ArrowDown className="h-4 w-4" /></button><button className="btn-ghost px-2" aria-label={`Remove member ${index + 1}`} disabled={rows.length <= 2} onClick={() => setRows(rows.filter((_, i) => i !== index))}><X className="h-4 w-4" /></button></li>)}</ol><button className="btn-ghost" disabled={rows.length >= 8} onClick={() => setRows([...rows, '' as Address])}>Add member</button>{draftError && <Callout tone="bad">{draftError}</Callout>}{draft && <Callout>Comparison: {members.length} old → {rows.length} new members. {draft.notes.expenses.length} local expenses copied; {draft.skippedExpenses} skipped because a removed participant was involved. {plan ? `Recalculated local plan total: ${usdc(plan.total)} USDC.` : 'No local plan to calculate.'}</Callout>}{activePlan && <label className="flex gap-2 text-sm"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /> I understand the old active plan and funds remain in Group #{groupId.toString()}.</label>}{error && <Callout tone="bad">{error}</Callout>}<div className="flex gap-3"><button className="btn-ghost" onClick={() => setMode(null)}>Cancel</button><button className="btn-primary" disabled={!draft || (activePlan && !acknowledged) || Boolean(local.storageError)} onClick={() => { try { if (!draft) return; saveRevisedDraft(draft); navigate(`#/create/${chainId}/revised`); setMode(null) } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not save draft.') } }}>Save revised group draft</button></div></div>}
    </div></div>, document.body)}
  </div>
}
