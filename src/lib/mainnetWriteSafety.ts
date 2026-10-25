import type { Address, PublicClient, WalletClient } from 'viem'
import { arc } from 'viem/chains'
import { expectedRuntime } from './browserDeploy'
import { getDeployment } from './deployments'

/** Recheck the wallet and the exact deployed runtime before a real signature. */
export async function assertWriteSafety(client: PublicClient, wallet: WalletClient, chainId: number, account: Address): Promise<void> {
  const deployment = getDeployment(chainId)
  if (!deployment?.contract || deployment.fromBlock === null) throw new Error('Deployment configuration is missing. Financial actions are disabled.')
  const [rpcChain, walletChain, accounts] = await Promise.all([
    client.getChainId(), wallet.getChainId(), wallet.getAddresses(),
  ])
  if (rpcChain !== chainId) throw new Error('Read-only RPC is on a different network. Transaction blocked.')
  if (walletChain !== chainId || !accounts.some((address) => address.toLowerCase() === account.toLowerCase())) {
    throw new Error('Wallet network or account changed. Reconnect and review this action before signing.')
  }
  if (chainId === arc.id) {
    const code = await client.getCode({ address: deployment.contract })
    if (!code || code.toLowerCase() !== expectedRuntime().toLowerCase()) {
      throw new Error('Arc Mainnet contract bytecode does not match the reviewed build. Transaction blocked.')
    }
  }
}
