// Read-only deployment preflight. Broadcasting remains an explicit owner action
// through contracts/script/DeployAtomicCloseout.s.sol and an approved keystore.
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createPublicClient, http, isAddress, formatUnits } from 'viem'
import { arc } from 'viem/chains'

const from = process.argv[2]
if (!from || !isAddress(from)) throw new Error('Usage: node scripts/mainnet-deploy.mjs <authorized deployer public address>')
const source = await readFile(new URL('../contracts/AtomicCloseout.sol', import.meta.url))
const sourceHash = createHash('sha256').update(source).digest('hex')
if (sourceHash !== 'ac11dd2cfbd5485574a0e9f12c8bb8c77e729bd3a8bbc2dc5eb73b5de8a7b80c') throw new Error('Contract differs from the archived Arc Studio source; review the diff before deployment')
const artifact = JSON.parse(await readFile(new URL('../contracts/out/AtomicCloseout.sol/AtomicCloseout.json', import.meta.url)))
if (artifact.metadata?.compiler?.version !== '0.8.28+commit.7893614a' || artifact.metadata?.settings?.evmVersion !== 'cancun' ||
    artifact.metadata?.settings?.optimizer?.enabled !== true || artifact.metadata?.settings?.optimizer?.runs !== 200 ||
    artifact.abi?.find((entry) => entry.type === 'constructor')?.inputs?.length !== 1) {
  throw new Error('Compiled artifact settings or ABI do not match the reviewed contract')
}
const bytecode = artifact.bytecode.object
if (!/^0x[\da-f]+$/i.test(bytecode) || bytecode.length < 100) throw new Error('Missing compiled creation bytecode. Run forge build.')
const usdc = '0x3600000000000000000000000000000000000000'
const constructorArg = usdc.slice(2).padStart(64, '0')
const data = `${bytecode}${constructorArg}`
const client = createPublicClient({ chain: arc, transport: http('https://rpc.mainnet.arc.io') })
const chainId = await client.getChainId()
if (chainId !== 5042) throw new Error(`Wrong RPC chain: ${chainId}`)
const [gas, fee, balance] = await Promise.all([
  client.estimateGas({ account: from, data }),
  client.estimateFeesPerGas(),
  client.getBalance({ address: from }),
])
const maxFee = fee.maxFeePerGas ?? 0n
if (maxFee <= 0n) throw new Error('RPC did not provide a usable maximum fee')
const maxCost = gas * maxFee
console.log(JSON.stringify({ mode: 'READ_ONLY', chainId, from, usdc, sourceSha256: sourceHash, compiler: '0.8.28', evm: 'cancun', optimizerRuns: 200,
  bytecodeBytes: (bytecode.length - 2) / 2, constructorArg: usdc, estimatedGas: gas.toString(),
  maxFeePerGasWei: maxFee.toString(), maxCostUsdc: formatUnits(maxCost, 18), nativeBalanceUsdc: formatUnits(balance, 18),
  sufficientNativeBalance: balance >= maxCost, transactionsSent: 0 }, null, 2))
