import { useCallback, useState } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import type { Address, Hash, PublicClient, WalletClient } from 'viem'
import { describeTxError } from '@/lib/format'
import { assertWriteSafety } from '@/lib/mainnetWriteSafety'
import { getDeployment } from '@/lib/deployments'
import { arc } from 'viem/chains'

export type TxPhase = 'idle' | 'switching' | 'preparing' | 'wallet' | 'confirming' | 'confirmed' | 'failed'

export interface TxState {
  phase: TxPhase
  label: string
  hash: Hash | null
  error: string | null
}

export interface TxContext {
  client: PublicClient
  wallet: WalletClient
  account: Address
  /** Call right before asking the wallet to sign, so the UI is truthful. */
  signing: () => Promise<void>
}

const IDLE: TxState = { phase: 'idle', label: '', hash: null, error: null }

/**
 * Runs one real wallet transaction on `chainId`:
 * chain check -> simulate -> wallet signature -> receipt. "confirmed" is only
 * reported after a successful onchain receipt.
 */
export function useTx(chainId: number) {
  const { address, chainId: walletChainId, isConnected } = useAccount()
  const { data: wallet } = useWalletClient({ chainId })
  const client = usePublicClient({ chainId })
  const qc = useQueryClient()
  const [state, setState] = useState<TxState>(IDLE)

  const busy = ['switching', 'preparing', 'wallet', 'confirming'].includes(state.phase)
  const wrongNetwork = isConnected && walletChainId !== chainId

  const run = useCallback(
    async (label: string, action: (ctx: TxContext) => Promise<Hash>): Promise<Hash | null> => {
      if (!address || !client) {
        setState({ ...IDLE, phase: 'failed', label, error: 'Connect a wallet first.' })
        return null
      }
      try {
        if (walletChainId !== chainId) throw new Error('Switch your wallet to the network shown on this page before signing.')
        if (chainId === arc.id && !window.confirm(`${label} on Arc Mainnet 5042?\n\nContract: ${getDeployment(chainId)?.contract ?? 'MISSING'}\nReal USDC network fees apply. Review the exact amount, recipient and contract in your wallet. Atomic Closeout has not had an independent audit.`)) return null
        setState({ ...IDLE, phase: 'preparing', label })
        const w = wallet
        if (!w || w.chain?.id !== chainId) throw new Error('Wallet is not ready on this network. Try again in a moment.')
        await assertWriteSafety(client, w, chainId, address)
        const hash = await action({
          client: client,
          wallet: w,
          account: address,
          signing: async () => {
            await assertWriteSafety(client, w, chainId, address)
            setState({ ...IDLE, phase: 'wallet', label })
          },
        })
        setState({ phase: 'confirming', label, hash, error: null })
        const receipt = await client.waitForTransactionReceipt({ hash })
        if (receipt.status !== 'success') {
          setState({ phase: 'failed', label, hash, error: 'The transaction was included but reverted onchain.' })
          return null
        }
        setState({ phase: 'confirmed', label, hash, error: null })
        await qc.invalidateQueries()
        return hash
      } catch (err) {
        const msg = describeTxError(err)
        setState(msg === null ? IDLE : { phase: 'failed', label, hash: null, error: msg })
        return null
      }
    },
    [address, chainId, client, qc, wallet, walletChainId],
  )

  const reset = useCallback(() => setState(IDLE), [])
  return { state, run, reset, busy, wrongNetwork, isConnected, address }
}
