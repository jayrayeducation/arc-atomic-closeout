import { useReadContract } from 'wagmi'
import { erc20Abi, type Address } from 'viem'
import { getUsdc } from '@/onchain-facts'

/** USDC ERC-20 view (6 decimals): the single source for balance and allowance. Native gas is the same pool. */
export function useUsdc(chainId: number, owner: Address | undefined, spender: Address | undefined) {
  const usdc = getUsdc(chainId)
  const address = usdc?.address as Address | undefined
  const balance = useReadContract({
    address,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: owner ? [owner] : undefined,
    chainId,
    query: { enabled: Boolean(address && owner), refetchInterval: 6000 },
  })
  const allowance = useReadContract({
    address,
    abi: erc20Abi,
    functionName: 'allowance',
    args: owner && spender ? [owner, spender] : undefined,
    chainId,
    query: { enabled: Boolean(address && owner && spender), refetchInterval: 6000 },
  })
  return { address, balance: balance.data, allowance: allowance.data, loading: balance.isLoading || allowance.isLoading }
}
