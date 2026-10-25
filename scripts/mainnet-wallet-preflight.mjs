// Read-only checks for the three authorized public wallets in the 0.20 USDC plan.
// This file never requests a signature or broadcasts a transaction.
import { createPublicClient, http, isAddress, getAddress, formatUnits } from 'viem'
import { arc } from 'viem/chains'

const raw = process.argv.slice(2)
if (raw.length !== 3 || raw.some((address) => !isAddress(address))) {
  throw new Error('Usage: node scripts/mainnet-wallet-preflight.mjs <creditor/deployer A> <debtor B> <debtor C>')
}
const wallets = raw.map((address) => getAddress(address))
if (new Set(wallets.map((address) => address.toLowerCase())).size !== 3) {
  throw new Error('A, B and C must be three distinct wallet addresses')
}
const usdc = '0x3600000000000000000000000000000000000000'
const abi = [
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
]
const client = createPublicClient({ chain: arc, transport: http('https://rpc.mainnet.arc.io', { timeout: 15_000 }) })
const chainId = await client.getChainId()
if (chainId !== 5042) throw new Error(`Wrong RPC chain: ${chainId}`)
const decimals = await client.readContract({ address: usdc, abi, functionName: 'decimals' })
if (decimals !== 6) throw new Error(`Unexpected USDC decimals: ${decimals}`)
const fee = await client.estimateFeesPerGas()
if (!fee.maxFeePerGas || fee.maxFeePerGas <= 0n) throw new Error('No usable maxFeePerGas from RPC')
const rows = await Promise.all(wallets.map(async (address, index) => {
  const [native, erc20] = await Promise.all([
    client.getBalance({ address }),
    client.readContract({ address: usdc, abi, functionName: 'balanceOf', args: [address] }),
  ])
  return { role: ['A deployer/creditor', 'B debtor', 'C debtor'][index], address,
    nativeGasUsdc: formatUnits(native, 18), erc20Usdc: formatUnits(erc20, 6),
    principalNeededUsdc: index === 0 ? '0' : '0.10',
    principalAvailable: index === 0 || erc20 >= 100_000n,
    gasReserveVerified: false }
}))
console.log(JSON.stringify({ mode: 'READ_ONLY', chainId, rpc: 'https://rpc.mainnet.arc.io', usdc,
  erc20Decimals: decimals, nativeGasDecimals: 18, maxFeePerGasWei: fee.maxFeePerGas.toString(),
  walletBalances: rows, gasReserveVerified: false,
  note: 'Native and ERC-20 USDC views share underlying funds. Do not add the two displayed balances. Reserve per-wallet gas for every later transaction after live estimates.',
  transactionsSent: 0 }, null, 2))
