/**
 * READ-ONLY deployment check. Sends no transactions and needs no keys.
 * Confirms that an address on Arc Testnet or Arc Mainnet runs the AtomicCloseout bytecode from this repo
 * and is wired to Arc's 6-decimal USDC ERC-20 interface.
 *
 *   bun run verify:deployment -- --chain 5042002 --address 0x...
 *   bun run verify:deployment -- --chain 5042 --address 0x...
 */
import fs from 'node:fs'
import { createPublicClient, erc20Abi, http, isAddress } from 'viem'
import { atomicCloseoutAbi } from '../src/lib/abi'
import { getUsdc, requireChain } from '../src/onchain-facts'

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const chainId = Number(arg('chain') ?? '5042002')
const address = arg('address') ?? process.env.VITE_ATOMIC_CLOSEOUT_TESTNET
if (![5042002, 5042].includes(chainId)) throw new Error('--chain must be 5042002 (Arc Testnet) or 5042 (Arc Mainnet)')
if (!address || !isAddress(address)) throw new Error('--address 0x... is required')

const chain = requireChain(chainId)
const client = createPublicClient({ transport: http(chain.rpcUrls[0]) })
const results: [string, boolean, string][] = []
const check = (name: string, pass: boolean, detail: string) => {
  results.push([name, pass, detail])
  console.log(pass ? 'PASS' : 'FAIL', name, '-', detail)
}

check('RPC chain id matches', (await client.getChainId()) === chainId, `${chainId} (${chain.name})`)

const onchain = await client.getCode({ address: address })
const artifact = JSON.parse(fs.readFileSync(new URL('../contracts/out/AtomicCloseout.sol/AtomicCloseout.json', import.meta.url).pathname, 'utf8')) as {
  deployedBytecode: { object: string }
}
// Compare ignoring the trailing CBOR metadata hash and the immutable USDC address slot values.
const strip = (hex: string) => hex.toLowerCase().replace(/a264697066735822[0-9a-f]{68}64736f6c63[0-9a-f]{6}0033$/, '')
const local = strip(artifact.deployedBytecode.object)
const remote = strip(onchain ?? '0x')
check('contract has code', Boolean(onchain && onchain !== '0x'), `${((onchain?.length ?? 2) - 2) / 2} bytes`)
const lenOk = local.length === remote.length
let diff = 0
for (let i = 0; i < Math.min(local.length, remote.length); i++) if (local[i] !== remote[i]) diff++
check('bytecode matches this repository (immutables aside)', lenOk && diff <= 40, `length ${lenOk ? 'equal' : 'DIFFERENT'}, ${diff} differing hex chars (immutable USDC slot only)`)

const usdc = await client.readContract({ address: address, abi: atomicCloseoutAbi, functionName: 'USDC' })
check('uses Arc USDC ERC-20 interface', usdc.toLowerCase() === getUsdc(chainId)?.address.toLowerCase(), usdc)
const decimals = await client.readContract({ address: usdc, abi: erc20Abi, functionName: 'decimals' })
check('USDC reports 6 decimals', decimals === 6, String(decimals))
check('MAX_MEMBERS is 8', (await client.readContract({ address: address, abi: atomicCloseoutAbi, functionName: 'MAX_MEMBERS' })) === 8n, '')
console.log('groupCount', (await client.readContract({ address: address, abi: atomicCloseoutAbi, functionName: 'groupCount' })).toString())
console.log('totalLocked', (await client.readContract({ address: address, abi: atomicCloseoutAbi, functionName: 'totalLocked' })).toString())
process.exit(results.every((r) => r[1]) ? 0 : 1)
