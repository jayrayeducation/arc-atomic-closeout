import { createPublicClient, http, isAddress } from 'viem'
import { arc } from 'viem/chains'
import { readFile } from 'node:fs/promises'

const address = process.argv[2]
if (!address || !isAddress(address)) throw new Error('Usage: node scripts/mainnet-verify.mjs <deployed contract address>')
const client = createPublicClient({ chain: arc, transport: http('https://rpc.mainnet.arc.io') })
if (await client.getChainId() !== 5042) throw new Error('Wrong network')
const code = await client.getCode({ address })
if (!code || code === '0x') throw new Error('No contract code at address')
const artifact = JSON.parse(await readFile(new URL('../contracts/out/AtomicCloseout.sol/AtomicCloseout.json', import.meta.url)))
const expected = artifact.deployedBytecode.object.toLowerCase()
const actual = code.toLowerCase()
if (actual.length !== expected.length) throw new Error('Deployed runtime bytecode length differs from local artifact')
let matches = true
let cursor = 0
const refs = Object.values(artifact.deployedBytecode.immutableReferences ?? {}).flat().sort((a, b) => a.start - b.start)
for (const ref of refs) {
  const start = 2 + ref.start * 2
  if (actual.slice(cursor, start) !== expected.slice(cursor, start)) matches = false
  cursor = start + ref.length * 2
}
if (actual.slice(cursor) !== expected.slice(cursor)) matches = false
if (!matches) throw new Error('Deployed runtime bytecode differs from local artifact outside immutable slots')
const usdc = await client.readContract({ address, abi: [{ type: 'function', name: 'USDC', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }], functionName: 'USDC' })
if (usdc.toLowerCase() !== '0x3600000000000000000000000000000000000000') throw new Error('Wrong USDC address')
const decimals = await client.readContract({ address: usdc, abi: [{ type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] }], functionName: 'decimals' })
if (decimals !== 6) throw new Error('Wrong USDC decimals')
console.log(JSON.stringify({ mode: 'READ_ONLY', chainId: 5042, address, codeBytes: (code.length - 2) / 2, usdc, decimals, runtimeBytecodeMatches: true, verified: true }, null, 2))
