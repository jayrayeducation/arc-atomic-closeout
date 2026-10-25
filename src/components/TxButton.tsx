import type { ReactNode } from 'react'
import { ConnectKitButton } from 'connectkit'
import { useSwitchChain } from 'wagmi'
import { Loader2 } from 'lucide-react'
import clsx from 'clsx'
import type { useTx } from '@/hooks/useTx'
import { getDeployment } from '@/lib/deployments'
import { Callout } from './primitives'
import { ExplorerLink } from './ExplorerLink'

type Tx = ReturnType<typeof useTx>

const PHASE_COPY: Record<string, string> = {
  switching: 'Switching network in your wallet…',
  preparing: 'Checking the transaction…',
  wallet: 'Confirm in your wallet…',
  confirming: 'Submitted. Waiting for onchain confirmation…',
}

interface Props {
  tx: Tx
  chainId: number
  label: ReactNode
  onRun: () => void
  disabled?: boolean
  variant?: 'primary' | 'blue' | 'ghost'
  className?: string
}

/** One truthful button for a real wallet transaction: connect, switch network, sign, confirm. */
export function TxButton({ tx, chainId, label, onRun, disabled, variant = 'primary', className }: Props) {
  const { switchChain, isPending } = useSwitchChain()
  const cls = clsx(variant === 'primary' ? 'btn-primary' : variant === 'blue' ? 'btn-blue' : 'btn-ghost', 'w-full sm:w-auto', className)
  if (!tx.isConnected) {
    return (
      <ConnectKitButton.Custom>
        {({ show }) => (
          <button className={cls} onClick={show}>
            Connect wallet to continue
          </button>
        )}
      </ConnectKitButton.Custom>
    )
  }
  if (tx.wrongNetwork) {
    return (
      <button className={cls} disabled={isPending} onClick={() => switchChain({ chainId })}>
        Switch wallet to {getDeployment(chainId)?.label ?? 'the right network'}
      </button>
    )
  }
  return (
    <button className={cls} disabled={disabled || tx.busy} onClick={onRun}>
      {tx.busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {tx.busy ? (PHASE_COPY[tx.state.phase] ?? 'Working…') : label}
    </button>
  )
}

/** Honest lifecycle readout for the last transaction. */
export function TxStatus({ tx, chainId }: { tx: Tx; chainId: number }) {
  const { phase, hash, error, label } = tx.state
  if (phase === 'idle') return null
  if (phase === 'failed') {
    return (
      <Callout tone="bad" title={`${label} failed`}>
        {error}
        {hash && (
          <span className="mt-1 block">
            <ExplorerLink chainId={chainId} kind="tx" value={hash} />
          </span>
        )}
      </Callout>
    )
  }
  if (phase === 'confirmed' && hash) {
    return (
      <Callout tone="ok" title={`${label}: confirmed onchain`}>
        <ExplorerLink chainId={chainId} kind="tx" value={hash} />
      </Callout>
    )
  }
  if (phase === 'confirming' && hash) {
    return (
      <Callout title={`${label}: pending, not settled yet`}>
        <ExplorerLink chainId={chainId} kind="tx" value={hash} />
      </Callout>
    )
  }
  return null
}
