import { useAccount, useSwitchChain } from 'wagmi'
import { AlertTriangle } from 'lucide-react'
import { Pill } from './primitives'
import { getDeployment } from '@/lib/deployments'

/** Shows the network the DATA comes from and whether the wallet matches it. */
export function NetworkBadge({ chainId }: { chainId: number }) {
  const { chainId: walletChain, isConnected } = useAccount()
  const { switchChain, isPending } = useSwitchChain()
  const d = getDeployment(chainId)
  const mismatch = isConnected && walletChain !== chainId
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Pill tone={d?.isTestnet ? 'cyan' : 'warn'}>
        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
        {d?.label ?? `Chain ${chainId}`}
      </Pill>
      {mismatch && (
        <button className="inline-flex min-h-[32px] items-center gap-1.5 rounded-full border border-warn/40 bg-warn/10 px-3 text-xs font-semibold text-warn" disabled={isPending || !d?.contract || d.fromBlock === null} onClick={() => switchChain({ chainId })}>
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
          Wallet on another network. Switch to {d?.label}
        </button>
      )}
    </div>
  )
}
