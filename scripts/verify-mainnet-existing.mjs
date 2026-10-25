// Read-only check of the owner-supplied deployment. Never creates or signs a transaction.
import { createPublicClient, encodeDeployData, http, sha256 } from 'viem'
import { arc } from 'viem/chains'
import { readFile } from 'node:fs/promises'

const address = '0xe05790767da98b524472ea9d78459aca4fb3b6c6'
const deployer = '0x3B0278E623a5F9C50AfaAB22c972c69Ec687448a'
const blockNumber = 27856267n
const usdc = '0x3600000000000000000000000000000000000000'
const urls = ['https://rpc.blockdaemon.mainnet.arc.io', 'https://rpc.drpc.mainnet.arc.io']
const artifact = JSON.parse(await readFile(new URL('../src/generated/mainnetDeployArtifact.json', import.meta.url)))
if (sha256(artifact.creationBytecode).slice(2) !== artifact.creationSha256) throw new Error('Pinned creation bytecode hash mismatch')
const word = usdc.slice(2).padStart(64, '0')
const chars = artifact.runtimeTemplate.slice(2).split('')
for (const ref of artifact.immutableReferences) chars.splice(ref.start * 2, ref.length * 2, ...word)
const expectedRuntime = `0x${chars.join('')}`
const creationData = encodeDeployData({ abi: [{ type: 'constructor', stateMutability: 'nonpayable', inputs: [{ name: 'usdc_', type: 'address' }] }], bytecode: artifact.creationBytecode, args: [usdc] })

let lastError
for (const url of urls) {
  try {
    const client = createPublicClient({ chain: arc, transport: http(url, { timeout: 12_000, retryCount: 0 }) })
    if (await client.getChainId() !== 5042) throw new Error('RPC is not Arc Mainnet')
    const [code, block, token] = await Promise.all([
      client.getCode({ address }), client.getBlock({ blockNumber, includeTransactions: true }),
      client.readContract({ address, abi: [{ type: 'function', name: 'USDC', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }], functionName: 'USDC' }),
    ])
    if (!code || code.toLowerCase() !== expectedRuntime.toLowerCase()) throw new Error('Runtime bytecode differs from pinned build')
    if (token.toLowerCase() !== usdc.toLowerCase()) throw new Error('Constructor USDC differs')
    let match
    for (const tx of block.transactions) {
      if (tx.to !== null || tx.from.toLowerCase() !== deployer.toLowerCase()) continue
      const receipt = await client.getTransactionReceipt({ hash: tx.hash })
      if (receipt.contractAddress?.toLowerCase() === address.toLowerCase()) {
        if (receipt.status !== 'success' || tx.value !== 0n || tx.input.toLowerCase() !== creationData.toLowerCase()) throw new Error('Creation receipt/transaction differs from pinned deployment')
        match = { txHash: tx.hash, status: receipt.status, gasUsed: receipt.gasUsed.toString() }
        break
      }
    }
    if (!match) throw new Error('Deployment receipt not found at supplied block')
    console.log(JSON.stringify({ mode: 'READ_ONLY', verified: true, rpc: url, chainId: 5042, address, deployer, blockNumber: blockNumber.toString(), usdc: token, runtimeMatches: true, creationMatches: true, ...match }, null, 2))
    process.exit(0)
  } catch (error) { lastError = `${new URL(url).host}: ${error instanceof Error ? error.message.split('\n')[0] : error}` }
}
throw new Error(`Mainnet deployment not verified. Last RPC error: ${lastError}`)
