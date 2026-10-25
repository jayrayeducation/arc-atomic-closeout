import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, ArrowUpRight, Check, CircleDollarSign, Copy, ExternalLink, RefreshCw, ShieldCheck, Wallet } from 'lucide-react'
import type { Address, Hex } from 'viem'
import {
  ARC_USDC, ARTIFACT_FACTS, CHAIN_ID, DEPLOYER, EXPLORER, GITHUB_URL, MAX_DEPLOY_FEE_USDC, RPC_URLS, STUDIO_URL,
  assertAuthorizedWallet, assertPinnedArtifact, displayUsdc, estimateDeployment,
  findRabby, sameQuote, selectRpc, sendDeployment, verifyDeployment, walletState,
  type DeployQuote, type Evidence, type RabbyProvider, type RpcHealth,
} from '@/lib/browserDeploy'

type Stored = { phase: 'awaiting_wallet' | 'pending' | 'uncertain' | 'critical'; hash?: Hex; detail?: string }
const STORAGE_KEY = `atomic-closeout:arc-mainnet-deploy:v1:${DEPLOYER.toLowerCase()}`
const CONFIRM_TEXT = "I'm deploying Atomic Closeout to Arc Mainnet with real USDC gas."
const hashRe = /^0x[0-9a-f]{64}$/i

function readStored(): Stored | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      const previous = localStorage.getItem(`${STORAGE_KEY}:evidence`)
      if (!previous) return null
      const hash = (JSON.parse(previous) as { txHash?: string }).txHash
      return hash && hashRe.test(hash) ? { phase: 'pending', hash: hash as Hex, detail: 'Rechecking saved evidence after reload.' } : { phase: 'uncertain', detail: 'Saved evidence is malformed; inspect Rabby and Explorer.' }
    }
    const parsed = JSON.parse(raw) as Stored
    if (!['awaiting_wallet', 'pending', 'uncertain', 'critical'].includes(parsed.phase) || (parsed.hash && !hashRe.test(parsed.hash))) return null
    if ((parsed.phase === 'pending' || parsed.phase === 'critical') && !parsed.hash) return { phase: 'uncertain', detail: 'Saved transaction hash is missing; inspect Rabby before retrying.' }
    return parsed
  } catch { return null }
}
function saveStored(value: Stored | null) {
  if (value) localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  else localStorage.removeItem(STORAGE_KEY)
}
function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-1 border-b border-white/[0.05] py-3 last:border-b-0 sm:flex-row sm:justify-between sm:gap-6">
    <dt className="text-sm text-ink-mute">{label}</dt><dd className="min-w-0 break-all font-mono text-sm text-ink">{children}</dd>
  </div>
}
function Panel({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return <section className="surface p-5 sm:p-7"><div className="mb-5"><p className="label text-cyan">{eyebrow}</p><h2 className="mt-1 font-display text-xl font-semibold">{title}</h2></div>{children}</section>
}
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error)
function isRejection(error: unknown) {
  const e = error as { code?: number; message?: string }
  return e?.code === 4001 || /user rejected|user denied|rejected the request/i.test(e?.message ?? '')
}

export default function DeployMainnet() {
  const [provider, setProvider] = useState<RabbyProvider | null>(null)
  const [wallet, setWallet] = useState<{ address: Address | null; chainId: number } | null>(null)
  const [rpc, setRpc] = useState<RpcHealth | null>(null)
  const [quote, setQuote] = useState<DeployQuote | null>(null)
  const [stored, setStored] = useState<Stored | null>(readStored)
  const [evidence, setEvidence] = useState<Evidence | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [phrase, setPhrase] = useState('')
  const [copied, setCopied] = useState(false)
  const [storageReady] = useState(() => {
    try { localStorage.setItem(`${STORAGE_KEY}:probe`, '1'); localStorage.removeItem(`${STORAGE_KEY}:probe`); return true }
    catch { return false }
  })
  const busyRef = useRef(false)
  const providerRef = useRef<RabbyProvider | null>(null)
  const rpcRef = useRef<RpcHealth | null>(null)

  const setPending = useCallback((next: Stored | null) => { setStored(next); saveStored(next) }, [])
  const refresh = useCallback(async (currentProvider?: RabbyProvider | null) => {
    setError(''); setQuote(null)
    try {
      assertPinnedArtifact()
      const health = await selectRpc()
      rpcRef.current = health
      setRpc(health)
      const walletProvider = currentProvider ?? providerRef.current
      if (walletProvider) {
        const state = await walletState(walletProvider)
        setWallet(state)
        if (state.address?.toLowerCase() === DEPLOYER.toLowerCase() && state.chainId === CHAIN_ID && !readStored()) {
          setQuote(await estimateDeployment(health, DEPLOYER))
        }
      }
    } catch (failure) { rpcRef.current = null; setRpc(null); setError(errorText(failure)) }
  }, [])

  const verifyHash = useCallback(async (hash: Hex, currentRpc?: RpcHealth | null) => {
    try {
      const health = currentRpc ?? rpcRef.current ?? await selectRpc()
      rpcRef.current = health; setRpc(health)
      const record = await verifyDeployment(health, hash)
      localStorage.setItem(`${STORAGE_KEY}:evidence`, JSON.stringify(record))
      setEvidence(record); setError(''); setPending(null)
    } catch (failure) {
      const message = errorText(failure)
      if (message.startsWith('CRITICAL:')) { setPending({ phase: 'critical', hash, detail: message }); setError(message) }
      else { setPending({ phase: 'pending', hash, detail: message }); setError(`Receipt verification pending: ${message}`) }
    }
  }, [setPending])

  useEffect(() => {
    let active = true
    const start = async () => {
      try {
        assertPinnedArtifact()
        const walletProvider = await findRabby()
        if (!active) return
        providerRef.current = walletProvider
        setProvider(walletProvider)
        if (walletProvider) setWallet(await walletState(walletProvider))
        const health = await selectRpc()
        if (!active) return
        rpcRef.current = health; setRpc(health)
        const prior = readStored()
        if (prior?.hash) await verifyHash(prior.hash, health)
        else if (prior?.phase === 'awaiting_wallet') setPending({ phase: 'uncertain', detail: 'A wallet request was open before reload. Check Rabby activity and Explorer before any retry.' })
      } catch (failure) { if (active) setError(errorText(failure)) }
    }
    void start()
    return () => { active = false }
  }, [verifyHash, setPending])

  useEffect(() => {
    if (!provider) return
    const changed = () => { setQuote(null); void walletState(provider).then(setWallet).catch((failure) => setError(errorText(failure))) }
    provider.on?.('accountsChanged', changed)
    provider.on?.('chainChanged', changed)
    return () => { provider.removeListener?.('accountsChanged', changed); provider.removeListener?.('chainChanged', changed) }
  }, [provider])

  const connect = async () => {
    setError('')
    try {
      const walletProvider = providerRef.current ?? await findRabby()
      if (!walletProvider) throw new Error('Rabby Wallet was not detected. Install or enable Rabby, then reload.')
      providerRef.current = walletProvider; setProvider(walletProvider)
      const state = await walletState(walletProvider, true)
      setWallet(state)
      assertAuthorizedWallet(state)
      await refresh(walletProvider)
    } catch (failure) { setError(errorText(failure)) }
  }

  const switchNetwork = async () => {
    if (!provider) return
    try {
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x13b2' }] })
      setWallet(await walletState(provider)); await refresh(provider)
    } catch (failure) { setError(errorText(failure)) }
  }

  const startDeploy = async () => {
    if (busyRef.current || !provider || !quote || stored || evidence || phrase !== CONFIRM_TEXT) return
    busyRef.current = true; setBusy(true); setConfirmOpen(false); setPhrase(''); setError('')
    try {
      // Every external fact is reread after the user's confirmation and before the only signing request.
      const freshRpc = await selectRpc()
      const freshWallet = await walletState(provider)
      assertAuthorizedWallet(freshWallet)
      const freshQuote = await estimateDeployment(freshRpc, DEPLOYER)
      setRpc(freshRpc); rpcRef.current = freshRpc; setQuote(freshQuote); setWallet(freshWallet)
      if (!sameQuote(quote, freshQuote)) throw new Error('Network fee, balance or gas estimate changed. Review the new quote and confirm again.')
      setPending({ phase: 'awaiting_wallet' })
      let hash: Hex
      try { hash = await sendDeployment(provider, freshQuote) }
      catch (failure) {
        if (isRejection(failure)) { setPending(null); throw new Error('Rabby request was rejected. No transaction hash was returned.') }
        setPending({ phase: 'uncertain', detail: errorText(failure) })
        throw new Error('Transaction outcome is uncertain. Inspect Rabby activity before retrying. ' + errorText(failure))
      }
      setPending({ phase: 'pending', hash })
      await verifyHash(hash, freshRpc)
    } catch (failure) { setError(errorText(failure)) }
    finally { busyRef.current = false; setBusy(false) }
  }

  const clearUncertain = () => {
    if (stored?.phase !== 'uncertain') return
    if (window.confirm('Only continue if you checked Rabby activity and Explorer and confirmed that no deployment transaction was sent. Unlock this browser?')) {
      localStorage.removeItem(`${STORAGE_KEY}:evidence`)
      setPending(null); setError(''); void refresh()
    }
  }

  const authorized = wallet?.address?.toLowerCase() === DEPLOYER.toLowerCase() && wallet.chainId === CHAIN_ID
  const ready = Boolean(storageReady && provider && authorized && rpc && quote && !stored && !evidence && !busy)
  const evidenceJson = evidence ? JSON.stringify(evidence, null, 2) : ''

  return <div className="space-y-6 pb-12">
    <div className="surface relative overflow-hidden border-cyan/20 p-6 sm:p-9">
      <div className="absolute -right-20 -top-28 h-72 w-72 rounded-full bg-cyan/10 blur-3xl" aria-hidden />
      <div className="relative"><div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan/25 bg-cyan/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-cyan"><ShieldCheck className="h-4 w-4" /> Owner-run deployment</div>
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-5xl">Atomic Closeout <span className="text-cyan">— Mainnet Deployment</span></h1>
        <p className="mt-4 max-w-3xl text-ink-dim">Deploy the reviewed Arc Studio contract with one explicit Rabby confirmation. This page sends exactly one contract creation request when you approve it. It never asks for a private key, USDC allowance or transfer.</p>
        <div className="mt-6 flex flex-wrap gap-3 text-sm"><a className="btn-ghost" href={STUDIO_URL} target="_blank" rel="noopener noreferrer">Built with Arc Studio <ArrowUpRight className="h-4 w-4" /></a><a className="btn-ghost" href={GITHUB_URL} target="_blank" rel="noopener noreferrer">GitHub source <ArrowUpRight className="h-4 w-4" /></a></div>
      </div>
    </div>

    <div className="grid gap-6 lg:grid-cols-2">
      <Panel eyebrow="01 / Network" title="Arc Mainnet connection"><dl>
        <Detail label="Network / chain ID">Arc Mainnet · {CHAIN_ID} (0x13b2)</Detail>
        <Detail label="RPC status">{rpc ? <span className="text-ok">Verified read-only</span> : <span className="text-warn">Unavailable / checking</span>}</Detail>
        <Detail label="Active RPC">{rpc?.url ?? 'PENDING'}</Detail>
        <Detail label="Latest block">{rpc?.block.toString() ?? 'PENDING'}</Detail>
        <Detail label="Gas price">{rpc ? `${formatGwei(rpc.gasPrice)} gwei` : 'PENDING'}</Detail>
        <Detail label="Explorer"><a className="text-cyan underline" href={EXPLORER} target="_blank" rel="noopener noreferrer">explorer.arc.io <ExternalLink className="inline h-3 w-3" /></a></Detail>
      </dl><button className="btn-ghost mt-5" type="button" onClick={() => void refresh()}><RefreshCw className="h-4 w-4" /> Refresh RPC & estimate</button>
        <p className="mt-3 text-xs text-ink-mute">Official RPC: rpc.mainnet.arc.io. This page tries the three public endpoints supplied by the owner. It never changes your location or bypasses wallet warnings. Available endpoints: {RPC_URLS.map((url) => new URL(url).host).join(', ')}.</p>
      </Panel>

      <Panel eyebrow="02 / Wallet" title="Rabby deployer"><dl>
        <Detail label="Authorized sender">{DEPLOYER}</Detail>
        <Detail label="Rabby">{provider ? <span className="text-ok">Detected</span> : <span className="text-warn">Not detected</span>}</Detail>
        <Detail label="Permission">{wallet?.address ? 'Account connected' : 'No account access'}</Detail>
        <Detail label="Connected address">{wallet?.address ?? 'Not connected'}</Detail>
        <Detail label="Wallet chain">{wallet ? `${wallet.chainId}${wallet.chainId === CHAIN_ID ? ' · Arc Mainnet' : ' · wrong network'}` : 'PENDING'}</Detail>
        <Detail label="Gas balance">{quote ? `${displayUsdc(quote.balance)} native USDC` : 'PENDING'}</Detail>
      </dl><div className="mt-5 flex flex-wrap gap-3"><button className="btn-primary" type="button" onClick={() => void connect()}><Wallet className="h-4 w-4" /> Connect Rabby</button>{wallet?.address && wallet.chainId !== CHAIN_ID && <button className="btn-ghost" type="button" onClick={() => void switchNetwork()}>Switch to Arc Mainnet</button>}</div>
        {wallet?.address && wallet.address.toLowerCase() !== DEPLOYER.toLowerCase() && <p className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-300">This wallet is not the authorized deployer. Deployment is blocked.</p>}
      </Panel>
    </div>

    <Panel eyebrow="03 / Contract" title="Pinned Arc Studio artifact"><div className="grid gap-x-8 md:grid-cols-2"><dl>
      <Detail label="Contract">AtomicCloseout.sol · AtomicCloseout</Detail>
      <Detail label="Source SHA-256">{ARTIFACT_FACTS.sourceSha256}</Detail>
      <Detail label="Compiler">{ARTIFACT_FACTS.compiler}</Detail>
      <Detail label="EVM / optimizer">{ARTIFACT_FACTS.evmVersion} · {ARTIFACT_FACTS.optimizerRuns} runs</Detail>
    </dl><dl><Detail label="Creation SHA-256">{ARTIFACT_FACTS.creationSha256}</Detail>
      <Detail label="Creation bytecode">{ARTIFACT_FACTS.creationBytes.toLocaleString()} bytes; no linked libraries</Detail>
      <Detail label="Constructor">AtomicCloseout(address usdc)</Detail>
      <Detail label="Argument · Arc USDC">{ARC_USDC}</Detail></dl></div>
      <p className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-4 text-sm text-amber-200"><AlertTriangle className="mr-2 inline h-4 w-4" /> This contract has not received an independent security audit. Direct USDC transfers to the contract outside <code>fund()</code> cannot be recovered.</p>
    </Panel>

    <Panel eyebrow="04 / Cost" title="Live deployment quote"><dl className="grid gap-x-8 md:grid-cols-2">
      <Detail label="eth_estimateGas">{quote?.estimatedGas.toString() ?? 'PENDING'}</Detail>
      <Detail label="Gas limit (25% reserve)">{quote?.gasLimit.toString() ?? 'PENDING'}</Detail>
      <Detail label="maxFeePerGas">{quote ? `${formatGwei(quote.maxFeePerGas)} gwei` : 'PENDING'}</Detail>
      <Detail label="Priority fee">{quote ? `${formatGwei(quote.priorityFeePerGas)} gwei` : 'PENDING'}</Detail>
      <Detail label="Estimated USDC fee">{quote ? `${displayUsdc(quote.estimatedGas * quote.maxFeePerGas)} USDC (upper estimate)` : 'PENDING'}</Detail>
      <Detail label="Maximum wallet fee">{quote ? `${displayUsdc(quote.maxCost)} USDC` : 'PENDING'}</Detail>
      <Detail label="Hard safety cap">{displayUsdc(MAX_DEPLOY_FEE_USDC)} USDC</Detail>
      <Detail label="Balance after maximum fee">{quote ? `${displayUsdc(quote.remaining)} USDC` : 'PENDING'}</Detail>
      <Detail label="Native value sent">0 USDC</Detail>
    </dl><p className="mt-3 text-xs text-ink-mute">Quote is refreshed immediately before Rabby opens. If any parameter changes, confirmation stops and you must review the new quote. Actual fee is known only from the receipt.</p></Panel>

    <Panel eyebrow="05 / Action" title="Deploy with one Rabby confirmation"><div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end"><div>
      <p className="text-sm text-ink-dim">Transaction type: contract creation. <code>to</code>: absent. <code>value</code>: 0. <code>data</code>: pinned creation bytecode + one Arc USDC constructor argument. No approval or USDC transfer is requested.</p>
      {error && <p role="alert" className="mt-4 break-words rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-300">{error}</p>}
      {!storageReady && <p role="alert" className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-300">Browser storage is unavailable. Deployment is blocked because a pending transaction could not survive a reload.</p>}
      {stored?.phase === 'uncertain' && <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 p-4 text-sm text-amber-200"><p>Outcome uncertain. Do not retry until Rabby activity and Explorer have been checked.</p><button className="btn-ghost mt-3" type="button" onClick={clearUncertain}>I checked: no transaction was sent</button></div>}
      {stored?.hash && <p className="mt-4 break-all text-sm">Transaction: <a className="text-cyan underline" href={`${EXPLORER}/tx/${stored.hash}`} target="_blank" rel="noopener noreferrer">{stored.hash}</a>. Status: {stored.phase}. <button className="ml-2 text-cyan underline" type="button" onClick={() => void verifyHash(stored.hash!)}>Recheck receipt</button></p>}
      {stored?.phase === 'awaiting_wallet' && <p className="mt-4 text-sm text-warn">Rabby request is open. Review its warning and transaction details. You may reject it.</p>}
    </div><button className="btn-primary min-w-48" type="button" disabled={!ready} onClick={() => { setPhrase(''); setConfirmOpen(true) }}><CircleDollarSign className="h-4 w-4" /> {busy ? 'Checking…' : 'Deploy Contract'}</button></div>
    </Panel>

    <Panel eyebrow="06 / Evidence" title={evidence ? 'Deployment verified' : 'Awaiting verified receipt'}>
      {evidence ? <><div className="mb-4 inline-flex items-center gap-2 rounded-full bg-emerald-400/10 px-3 py-1 text-sm font-semibold text-ok"><Check className="h-4 w-4" /> Runtime code and constructor state verified</div><dl className="grid gap-x-8 md:grid-cols-2">
        <Detail label="Contract"><a className="text-cyan underline" href={evidence.explorerContract} target="_blank" rel="noopener noreferrer">{evidence.contractAddress}</a></Detail>
        <Detail label="Transaction"><a className="text-cyan underline" href={evidence.explorerTx} target="_blank" rel="noopener noreferrer">{evidence.txHash}</a></Detail>
        <Detail label="Receipt status">{evidence.receiptStatus}</Detail>
        <Detail label="Deployer / chain">{evidence.deployer} · {evidence.chainId}</Detail>
        <Detail label="Block / time">{evidence.blockNumber} · {evidence.timestamp}</Detail>
        <Detail label="Gas used / fee">{evidence.gasUsed} · {evidence.actualFeeUsdc} USDC</Detail>
        <Detail label="Runtime code hash">{evidence.runtimeCodeHash}</Detail>
      </dl><button className="btn-ghost mt-4" type="button" onClick={() => void navigator.clipboard.writeText(evidenceJson).then(() => setCopied(true))}><Copy className="h-4 w-4" /> {copied ? 'Copied evidence JSON' : 'Copy evidence JSON'}</button>
        <div className="mt-5 rounded-xl border border-white/10 bg-navy-800 p-4 text-sm"><p className="font-semibold">Production configuration — manual release step</p><p className="mt-2 text-ink-dim">After reviewing this evidence, set these public Vercel variables and redeploy the site. The page does not change production automatically.</p><pre className="mt-3 overflow-x-auto text-cyan">{`VITE_ATOMIC_CLOSEOUT_MAINNET=${evidence.contractAddress}\nVITE_ATOMIC_DEPLOY_BLOCK_MAINNET=${evidence.blockNumber}`}</pre></div>
      </> : <p className="text-sm text-ink-dim">A deployment hash is not proof of a working settlement. This panel shows VERIFIED only after a successful receipt, exact runtime bytecode comparison and initialized read methods. Mainnet settlement evidence is recorded separately.</p>}
    </Panel>

    {confirmOpen && quote && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" role="presentation"><div className="surface w-full max-w-2xl border-cyan/25 p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="deploy-confirm-title"><h2 id="deploy-confirm-title" className="font-display text-2xl font-semibold">Confirm real Arc Mainnet deployment</h2><p className="mt-3 text-sm text-ink-dim">One contract creation request will open in Rabby. Stop if Rabby shows any security warning or different transaction details.</p><dl className="mt-4">
      <Detail label="Network">Arc Mainnet · 5042</Detail><Detail label="From">{DEPLOYER}</Detail><Detail label="To / value">Contract creation / 0 USDC</Detail><Detail label="Constructor USDC">{ARC_USDC}</Detail><Detail label="Estimated gas">{quote.estimatedGas.toString()}</Detail><Detail label="Maximum fee">{displayUsdc(quote.maxCost)} USDC</Detail>
    </dl><label className="mt-4 block text-sm font-medium" htmlFor="deploy-phrase">Type this exact sentence to proceed:</label><p className="mt-2 rounded-lg bg-navy-800 p-3 font-mono text-sm text-cyan">{CONFIRM_TEXT}</p><input id="deploy-phrase" className="input mt-3" value={phrase} onChange={(event) => setPhrase(event.target.value)} autoComplete="off" /><div className="mt-5 flex flex-wrap justify-end gap-3"><button className="btn-ghost" type="button" onClick={() => { setConfirmOpen(false); setPhrase('') }}>Cancel</button><button className="btn-primary" type="button" disabled={phrase !== CONFIRM_TEXT || busy} onClick={() => void startDeploy()}>Confirm in Rabby</button></div></div></div>}
  </div>
}

function formatGwei(amount: bigint) { return (Number(amount) / 1e9).toFixed(3) }
