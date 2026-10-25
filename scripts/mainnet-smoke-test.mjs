// Read-only balance and escrow check after owner-approved transactions.
import { createPublicClient, http, isAddress, formatUnits } from 'viem'
import { arc } from 'viem/chains'

const address = process.argv[2]
if (!address || !isAddress(address)) throw new Error('Usage: node scripts/mainnet-smoke-test.mjs <deployed contract address>')
const client = createPublicClient({ chain: arc, transport: http('https://rpc.mainnet.arc.io') })
if (await client.getChainId() !== 5042) throw new Error('Wrong network')
const usdc = '0x3600000000000000000000000000000000000000'
const [locked, balance] = await Promise.all([
  client.readContract({ address, abi: [{ type: 'function', name: 'totalLocked', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }], functionName: 'totalLocked' }),
  client.readContract({ address: usdc, abi: [{ type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] }], functionName: 'balanceOf', args: [address] }),
])
if (balance < locked) throw new Error('CRITICAL: USDC balance is below totalLocked')
console.log(JSON.stringify({ mode: 'READ_ONLY', chainId: 5042, address, balanceUsdc: formatUnits(balance, 6), totalLockedUsdc: formatUnits(locked, 6), solvent: true }, null, 2))
