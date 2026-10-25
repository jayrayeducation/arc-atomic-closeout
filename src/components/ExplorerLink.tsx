import { ExternalLink } from 'lucide-react'
import { buildAddressExplorerUrl, buildTxExplorerUrl } from '@/onchain-facts'
import { shortAddr, shortHash } from '@/lib/format'

interface Props {
  chainId: number
  kind: 'tx' | 'address'
  value: string
  label?: string
}

/** Link to the block explorer of the SAME chain the data came from. */
export function ExplorerLink({ chainId, kind, value, label }: Props) {
  const href = kind === 'tx' ? buildTxExplorerUrl(chainId, value) : buildAddressExplorerUrl(chainId, value)
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-mono text-xs text-cyan underline-offset-2 hover:underline"
    >
      {label ?? (kind === 'tx' ? shortHash(value) : shortAddr(value))}
      <ExternalLink className="h-3 w-3" aria-hidden />
    </a>
  )
}
