// Reproducible, local-only gate for the browser deployment payload.
// --write is permitted only after a successful Foundry compilation of the original source.
import { createHash } from 'node:crypto'
import { readFile, writeFile, access } from 'node:fs/promises'
import { keccak256, toHex } from 'viem'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root))
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex')
const canonical = (value) => JSON.stringify(value, (_key, item) =>
  item && !Array.isArray(item) && typeof item === 'object'
    ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]])) : item)
const expected = {
  source: 'ac11dd2cfbd5485574a0e9f12c8bb8c77e729bd3a8bbc2dc5eb73b5de8a7b80c',
  creation: '77653c12803035044c6677596ca24360f0976b1a50f4e9f10ab657b3f93913e3',
  runtime: 'e45af6d1364acb379549e74735993a4844f7a6f705e92fb2facb2c716772ff2b',
}
const expectedSources = {
  'contracts/AtomicCloseout.sol': '0x78545623069bddad74fa1c2ec53ab2700775249bfbfbfca4580a0da18a1ea3b9',
  'node_modules/@openzeppelin/contracts/interfaces/IERC1363.sol': '0xd5ea07362ab630a6a3dee4285a74cf2377044ca2e4be472755ad64d7c5d4b69d',
  'node_modules/@openzeppelin/contracts/interfaces/IERC165.sol': '0x0afcb7e740d1537b252cb2676f600465ce6938398569f09ba1b9ca240dde2dfc',
  'node_modules/@openzeppelin/contracts/interfaces/IERC20.sol': '0x1a6221315ce0307746c2c4827c125d821ee796c74a676787762f4778671d4f44',
  'node_modules/@openzeppelin/contracts/token/ERC20/IERC20.sol': '0x74ed01eb66b923d0d0cfe3be84604ac04b76482a55f9dd655e1ef4d367f95bc2',
  'node_modules/@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol': '0x304d732678032a9781ae85c8f204c8fba3d3a5e31c02616964e75cfdc5049098',
  'node_modules/@openzeppelin/contracts/utils/ReentrancyGuard.sol': '0xa516cbf1c7d15d3517c2d668601ce016c54395bf5171918a14e2686977465f53',
  'node_modules/@openzeppelin/contracts/utils/StorageSlot.sol': '0xcf74f855663ce2ae00ed8352666b7935f6cddea2932fdf2c3ecd30a9b1cd0e97',
  'node_modules/@openzeppelin/contracts/utils/introspection/IERC165.sol': '0x8891738ffe910f0cf2da09566928589bf5d63f4524dd734fd9cedbac3274dd5c',
}
const immutableStarts = [626, 5361, 5489, 5561, 8414, 8994]
const output = new URL('../src/generated/mainnetDeployArtifact.json', import.meta.url)
const source = await read('contracts/AtomicCloseout.sol')
if (sha(source) !== expected.source) throw new Error('Original Arc Studio Solidity source hash mismatch')
const uiSource = (await read('src/lib/abi.ts')).toString('utf8')
const uiAbi = JSON.parse(uiSource.slice(uiSource.indexOf('=') + 1, uiSource.lastIndexOf('as const')).trim())
let generated
try { generated = JSON.parse(await readFile(output, 'utf8')) } catch { /* --write can create it */ }
let fromBuild
if (!process.argv.includes('--pinned-only')) try {
  await access(new URL('../contracts/out/AtomicCloseout.sol/AtomicCloseout.json', import.meta.url))
  const a = JSON.parse(await read('contracts/out/AtomicCloseout.sol/AtomicCloseout.json'))
  const m = a.metadata
  const constructor = a.abi.find((entry) => entry.type === 'constructor')
  if (m.compiler?.version !== '0.8.28+commit.7893614a' || m.settings?.evmVersion !== 'cancun' ||
      m.settings?.optimizer?.enabled !== true || m.settings?.optimizer?.runs !== 200 ||
      m.settings?.compilationTarget?.['contracts/AtomicCloseout.sol'] !== 'AtomicCloseout' ||
      constructor?.inputs?.length !== 1 || constructor.inputs[0].type !== 'address' ||
      Object.keys(a.bytecode.linkReferences ?? {}).length || Object.keys(a.deployedBytecode.linkReferences ?? {}).length) {
    throw new Error('Unexpected compiler, constructor or library linking')
  }
  for (const [path, entry] of Object.entries(m.sources)) {
    if (keccak256(toHex(await read(path))) !== entry.keccak256) throw new Error(`Artifact import hash mismatch: ${path}`)
  }
  if (canonical(Object.fromEntries(Object.entries(m.sources).map(([path, entry]) => [path, entry.keccak256]))) !== canonical(expectedSources)) {
    throw new Error('Compiled dependency fingerprints differ from the reviewed control')
  }
  const creation = a.bytecode.object
  const runtime = a.deployedBytecode.object
  if (!/^0x[0-9a-f]+$/i.test(creation) || !/^0x[0-9a-f]+$/i.test(runtime) ||
      sha(Buffer.from(creation.slice(2), 'hex')) !== expected.creation ||
      sha(Buffer.from(runtime.slice(2), 'hex')) !== expected.runtime ||
      canonical(a.abi.filter((entry) => entry.type !== 'constructor')) !== canonical(uiAbi)) {
    throw new Error('Build bytecode or frontend ABI differs from the reviewed control')
  }
  fromBuild = {
    schema: 1, chainId: 5042, usdc: '0x3600000000000000000000000000000000000000',
    sourceSha256: expected.source, compiler: m.compiler.version, evmVersion: m.settings.evmVersion,
    optimizerRuns: m.settings.optimizer.runs,
    sourceKeccak: Object.fromEntries(Object.entries(m.sources).map(([path, entry]) => [path, entry.keccak256])),
    creationSha256: expected.creation, runtimeTemplateSha256: expected.runtime,
    runtimeAbiSha256: sha(Buffer.from(canonical(uiAbi))),
    creationBytecode: creation, runtimeTemplate: runtime,
    immutableReferences: Object.values(a.deployedBytecode.immutableReferences ?? {}).flat(),
  }
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}
if (process.argv.includes('--write')) {
  if (!fromBuild) throw new Error('Compiled Foundry artifact is required for --write')
  await writeFile(output, `${JSON.stringify(fromBuild, null, 2)}\n`)
  generated = fromBuild
}
if (!generated) throw new Error('Pinned browser deployment artifact is missing')
if (generated.schema !== 1 || generated.chainId !== 5042 || generated.usdc !== '0x3600000000000000000000000000000000000000' ||
    generated.sourceSha256 !== expected.source || generated.creationSha256 !== expected.creation ||
    generated.runtimeTemplateSha256 !== expected.runtime || generated.compiler !== '0.8.28+commit.7893614a' ||
    generated.evmVersion !== 'cancun' || generated.optimizerRuns !== 200 ||
    sha(Buffer.from(generated.creationBytecode.slice(2), 'hex')) !== expected.creation ||
    sha(Buffer.from(generated.runtimeTemplate.slice(2), 'hex')) !== expected.runtime ||
    generated.runtimeAbiSha256 !== sha(Buffer.from(canonical(uiAbi)))) {
  throw new Error('Pinned browser artifact, compiler, source or ABI differs from the reviewed control')
}
if (!/^0x[0-9a-f]+$/i.test(generated.creationBytecode) || !/^0x[0-9a-f]+$/i.test(generated.runtimeTemplate) ||
    !Array.isArray(generated.immutableReferences) || generated.immutableReferences.length !== 6 ||
    generated.immutableReferences.some(({ start, length }, index) => !Number.isInteger(start) || length !== 32 || start !== immutableStarts[index] || start + length > (generated.runtimeTemplate.length - 2) / 2) ||
    canonical(generated.sourceKeccak) !== canonical(expectedSources)) {
  throw new Error('Malformed deployment bytecode or immutable references')
}
for (const [path, hash] of Object.entries(generated.sourceKeccak)) {
  if (keccak256(toHex(await read(path))) !== hash) throw new Error(`Pinned source/import changed: ${path}`)
}
if (fromBuild && canonical(generated) !== canonical(fromBuild)) throw new Error('Pinned artifact differs from current Foundry compilation')
console.log(JSON.stringify({ status: 'PASS', sourceSha256: expected.source, creationSha256: expected.creation,
  runtimeTemplateSha256: expected.runtime, sourceFiles: Object.keys(generated.sourceKeccak).length,
  reproducedAgainstFoundry: Boolean(fromBuild), transactionsSent: 0 }))
