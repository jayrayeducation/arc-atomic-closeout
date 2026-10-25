// Local, read-only audit of the exact deployment artifact. No wallet or RPC calls.
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { keccak256, toHex } from 'viem'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root))
const source = await read('contracts/AtomicCloseout.sol')
const sourceSha256 = createHash('sha256').update(source).digest('hex')
if (sourceSha256 !== 'ac11dd2cfbd5485574a0e9f12c8bb8c77e729bd3a8bbc2dc5eb73b5de8a7b80c') {
  throw new Error('Contract differs from the archived Arc Studio source')
}
const artifact = JSON.parse(await read('contracts/out/AtomicCloseout.sol/AtomicCloseout.json'))
const metadata = artifact.metadata
if (metadata.compiler?.version !== '0.8.28+commit.7893614a' || metadata.settings?.evmVersion !== 'cancun' ||
    metadata.settings?.optimizer?.enabled !== true || metadata.settings?.optimizer?.runs !== 200 ||
    metadata.settings?.compilationTarget?.['contracts/AtomicCloseout.sol'] !== 'AtomicCloseout') {
  throw new Error('Unexpected compiler settings or compilation target')
}
for (const [path, entry] of Object.entries(metadata.sources)) {
  const bytes = await read(path)
  if (keccak256(toHex(bytes)) !== entry.keccak256) throw new Error(`Artifact source hash differs: ${path}`)
}
const constructor = artifact.abi.find((entry) => entry.type === 'constructor')
if (constructor?.inputs?.length !== 1 || constructor.inputs[0].type !== 'address') {
  throw new Error('Unexpected constructor ABI')
}
const uiSource = (await read('src/lib/abi.ts')).toString('utf8')
const uiAbi = JSON.parse(uiSource.slice(uiSource.indexOf('=') + 1, uiSource.lastIndexOf('as const')).trim())
const canonical = (value) => JSON.stringify(value, (_key, v) =>
  v && !Array.isArray(v) && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map((key) => [key, v[key]])) : v)
const contractAbi = artifact.abi.filter((entry) => entry.type !== 'constructor')
if (canonical(uiAbi) !== canonical(contractAbi)) throw new Error('Frontend ABI differs from compiled contract ABI')
const creation = artifact.bytecode.object
const runtime = artifact.deployedBytecode.object
if (!/^0x[0-9a-f]+$/i.test(creation) || !/^0x[0-9a-f]+$/i.test(runtime)) throw new Error('Missing or unlinked bytecode')
const creationSha256 = createHash('sha256').update(Buffer.from(creation.slice(2), 'hex')).digest('hex')
console.log(JSON.stringify({ mode: 'LOCAL_READ_ONLY', sourceSha256, compiler: metadata.compiler.version,
  evm: metadata.settings.evmVersion, optimizerRuns: metadata.settings.optimizer.runs,
  verifiedSourceFiles: Object.keys(metadata.sources).length, abiEntries: artifact.abi.length,
  frontendAbiMatches: true, constructor: 'AtomicCloseout(address usdc)',
  constructorUSDC: '0x3600000000000000000000000000000000000000',
  creationBytes: (creation.length - 2) / 2, runtimeBytes: (runtime.length - 2) / 2,
  creationSha256, immutableSlots: Object.values(artifact.deployedBytecode.immutableReferences ?? {}).flat().length,
  transactionsSent: 0 }, null, 2))
