import { createPublicClient, encodeDeployData, formatUnits, getAddress, http, keccak256, sha256, type Address, type Hex } from 'viem'
import { arc } from 'viem/chains'
import pinned from '@/generated/mainnetDeployArtifact.json'
import { RPC_URLS } from './arcMainnetRpc'
export { RPC_URLS } from './arcMainnetRpc'

export const DEPLOYER = getAddress('0x3B0278E623a5F9C50AfaAB22c972c69Ec687448a')
export const ARC_USDC = getAddress('0x3600000000000000000000000000000000000000')
export const CHAIN_ID = 5042
export const EXPLORER = 'https://explorer.arc.io'
export const MAX_DEPLOY_FEE_USDC = 500_000_000_000_000_000n // 0.50 native USDC, 18 decimals
export const STUDIO_URL = 'https://studio.arc.io/app/c6e2330d-8e2f-44aa-935c-a9859f922a5e?thread=fe457d3b-009c-4455-8cd0-7944598e9009'
export const GITHUB_URL = 'https://github.com/jayrayeducation/arc-atomic-closeout'
const SOURCE_SHA = 'ac11dd2cfbd5485574a0e9f12c8bb8c77e729bd3a8bbc2dc5eb73b5de8a7b80c'
const CREATION_SHA = '77653c12803035044c6677596ca24360f0976b1a50f4e9f10ab657b3f93913e3'
const RUNTIME_SHA = 'e45af6d1364acb379549e74735993a4844f7a6f705e92fb2facb2c716772ff2b'
const IMMUTABLE_STARTS = [626, 5361, 5489, 5561, 8414, 8994]
const USDC_ABI = [{ type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint8' }] }] as const
const READ_ABI = [
  { type: 'function', name: 'USDC', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'groupCount', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'roundCount', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'totalLocked', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
] as const
const CONSTRUCTOR_ABI = [{ type: 'constructor', stateMutability: 'nonpayable', inputs: [{ name: 'usdc_', type: 'address' }] }] as const

export type RabbyProvider = {
  isRabby?: boolean
  request: (request: { method: string; params?: unknown[] }) => Promise<unknown>
  on?: (event: string, callback: (...args: unknown[]) => void) => void
  removeListener?: (event: string, callback: (...args: unknown[]) => void) => void
}
export type RpcHealth = { url: string; client: ReturnType<typeof makeClient>; block: bigint; timestamp: bigint; gasPrice: bigint }
export type DeployQuote = RpcHealth & { from: Address; estimatedGas: bigint; gasLimit: bigint; maxFeePerGas: bigint; priorityFeePerGas: bigint; maxCost: bigint; balance: bigint; remaining: bigint; createdAt: number }
export type Evidence = { status: 'VERIFIED'; receiptStatus: 'success'; chainId: 5042; rpc: string; txHash: Hex; contractAddress: Address; deployer: Address; txTo: null; valueWei: '0'; blockNumber: string; timestamp: string; gasUsed: string; effectiveGasPrice: string; actualFeeUsdc: string; sourceSha256: string; creationSha256: string; runtimeCodeHash: Hex; constructorUSDC: Address; explorerTx: string; explorerContract: string }

function makeClient(url: string) { return createPublicClient({ chain: arc, transport: http(url, { timeout: 12_000, retryCount: 0 }) }) }
const fail = (message: string): never => { throw new Error(message) }
export const displayUsdc = (amount: bigint) => formatUnits(amount, 18)
export const creationData = (): Hex => encodeDeployData({ abi: CONSTRUCTOR_ABI, bytecode: pinned.creationBytecode as Hex, args: [ARC_USDC] })

export function validateArtifact(artifact: typeof pinned): void {
  if (artifact.schema !== 1 || artifact.chainId !== CHAIN_ID || artifact.usdc.toLowerCase() !== ARC_USDC.toLowerCase() ||
      artifact.sourceSha256 !== SOURCE_SHA || artifact.creationSha256 !== CREATION_SHA || artifact.runtimeTemplateSha256 !== RUNTIME_SHA ||
      artifact.compiler !== '0.8.28+commit.7893614a' || artifact.evmVersion !== 'cancun' || artifact.optimizerRuns !== 200 ||
      !/^0x[0-9a-f]+$/i.test(artifact.creationBytecode) || !/^0x[0-9a-f]+$/i.test(artifact.runtimeTemplate) ||
      sha256(artifact.creationBytecode as Hex).slice(2) !== CREATION_SHA || sha256(artifact.runtimeTemplate as Hex).slice(2) !== RUNTIME_SHA ||
      artifact.immutableReferences.length !== 6 || artifact.immutableReferences.some((ref, index) => ref.length !== 32 || ref.start !== IMMUTABLE_STARTS[index] || ref.start + 32 > (artifact.runtimeTemplate.length - 2) / 2)) {
    fail('CRITICAL: deployment artifact differs from the reviewed Arc Studio build')
  }
}
export function assertPinnedArtifact(): void {
  validateArtifact(pinned)
  if (!creationData().endsWith(ARC_USDC.slice(2).toLowerCase().padStart(64, '0'))) fail('CRITICAL: constructor argument mismatch')
}

export function expectedRuntime(): Hex {
  assertPinnedArtifact()
  const chars = pinned.runtimeTemplate.slice(2).split('')
  const word = ARC_USDC.slice(2).toLowerCase().padStart(64, '0')
  for (const ref of pinned.immutableReferences) chars.splice(ref.start * 2, ref.length * 2, ...word)
  return `0x${chars.join('')}`
}

export async function findRabby(target: Window = window): Promise<RabbyProvider | null> {
  const announced: RabbyProvider[] = []
  const onProvider = (event: Event) => {
    const detail = (event as CustomEvent<{ info?: { rdns?: string }; provider?: RabbyProvider }>).detail
    if (detail?.provider?.isRabby === true && detail.info?.rdns === 'io.rabby') announced.push(detail.provider)
  }
  target.addEventListener('eip6963:announceProvider', onProvider)
  target.dispatchEvent(new Event('eip6963:requestProvider'))
  await new Promise((resolve) => setTimeout(resolve, 120))
  target.removeEventListener('eip6963:announceProvider', onProvider)
  if (announced[0]) return announced[0]
  const injected: unknown = Reflect.get(target, 'ethereum') as unknown
  const candidates: unknown[] = [injected]
  if (injected && typeof injected === 'object' && 'providers' in injected && Array.isArray(injected.providers)) {
    candidates.unshift(...(injected.providers as unknown[]))
  }
  const valid = candidates.filter((p): p is RabbyProvider => Boolean(p && typeof p === 'object' && 'request' in p && typeof p.request === 'function'))
  return valid.find((provider) => provider.isRabby === true) ?? null
}

export async function walletState(provider: RabbyProvider, requestPermission = false): Promise<{ address: Address | null; chainId: number }> {
  if (provider.isRabby !== true) fail('Rabby provider is required')
  const accounts = await provider.request({ method: requestPermission ? 'eth_requestAccounts' : 'eth_accounts' })
  const chain = await provider.request({ method: 'eth_chainId' })
  if (!Array.isArray(accounts) || (accounts.length && typeof accounts[0] !== 'string')) throw new Error('Invalid wallet account response')
  if (typeof chain !== 'string') throw new Error('Invalid wallet chain response')
  const chainId = Number(BigInt(chain))
  const address = accounts.length ? getAddress(accounts[0] as string) : null
  return { address, chainId }
}

export function assertAuthorizedWallet(state: { address: Address | null; chainId: number }): void {
  if (!state.address) throw new Error('Connect Rabby before deployment')
  if (state.address.toLowerCase() !== DEPLOYER.toLowerCase()) fail('Connected wallet is not the authorized deployer')
  if (state.chainId !== CHAIN_ID) fail('Rabby must be on Arc Mainnet, chain ID 5042')
}

async function inspectRpc(url: string): Promise<RpcHealth> {
  const client = makeClient(url)
  const [chainId, block, gasPrice, decimals] = await Promise.all([
    client.getChainId(), client.getBlock(), client.getGasPrice(),
    client.readContract({ address: ARC_USDC, abi: USDC_ABI, functionName: 'decimals' }),
  ])
  const now = BigInt(Math.floor(Date.now() / 1000))
  if (chainId !== CHAIN_ID || block.number <= 0n || block.timestamp > now + 120n || now - block.timestamp > 900n ||
      gasPrice < 20_000_000_000n || decimals !== 6) fail(`RPC ${url} returned inconsistent Arc network data`)
  return { url, client, block: block.number, timestamp: block.timestamp, gasPrice }
}

export async function selectVerifiedRpc(inspect: (url: string) => Promise<RpcHealth>): Promise<RpcHealth> {
  const failures: string[] = []
  for (const url of RPC_URLS) {
    try { return await inspect(url) } catch (error) {
      const reason = error instanceof Error ? error.message.split(/\r?\n/)[0].slice(0, 120) : 'unavailable'
      failures.push(`${new URL(url).host}: ${reason}`)
    }
  }
  throw new Error(`No verified Arc Mainnet RPC. ${failures.join('; ')}`)
}
export const selectRpc = () => selectVerifiedRpc(inspectRpc)

export async function estimateDeployment(rpc: RpcHealth, from: Address): Promise<DeployQuote> {
  assertPinnedArtifact()
  if (from.toLowerCase() !== DEPLOYER.toLowerCase()) fail('Unauthorized deployment address')
  if (await rpc.client.getChainId() !== CHAIN_ID) fail('RPC switched away from Arc Mainnet')
  const [estimatedGas, fees, balance, block] = await Promise.all([
    rpc.client.estimateGas({ account: from, data: creationData(), value: 0n }),
    rpc.client.estimateFeesPerGas(), rpc.client.getBalance({ address: from }), rpc.client.getBlock(),
  ])
  const now = BigInt(Math.floor(Date.now() / 1000))
  if (block.number <= 0n || block.timestamp > now + 120n || now - block.timestamp > 900n || estimatedGas <= 0n || estimatedGas > 20_000_000n) fail('Invalid or stale deployment gas estimate')
  const maxFeePerGas = fees.maxFeePerGas ?? 0n
  const priorityFeePerGas = fees.maxPriorityFeePerGas ?? 0n
  if (maxFeePerGas < 20_000_000_000n || priorityFeePerGas > maxFeePerGas) fail('Invalid Arc EIP-1559 fee data')
  const gasLimit = (estimatedGas * 125n + 99n) / 100n
  const maxCost = gasLimit * maxFeePerGas
  if (maxCost > MAX_DEPLOY_FEE_USDC) fail('Maximum deployment fee exceeds the 0.50 USDC safety cap; stop and review the quote')
  if (balance < maxCost) fail(`Insufficient USDC for maximum deployment fee: ${displayUsdc(maxCost)} USDC required`)
  return { ...rpc, from, block: block.number, timestamp: block.timestamp, estimatedGas, gasLimit, maxFeePerGas, priorityFeePerGas, maxCost, balance, remaining: balance - maxCost, createdAt: Date.now() }
}

const QUOTE_STEP_USDC = 10_000_000_000_000_000n // 0.01 native USDC

/** An explicit spend ceiling, with 10% fee headroom rounded up to 0.01 USDC. */
export function quoteApprovalCeiling(quote: DeployQuote): bigint {
  if (quote.maxCost <= 0n || quote.maxCost > MAX_DEPLOY_FEE_USDC) fail('Deployment quote exceeds the hard safety cap')
  const withHeadroom = (quote.maxCost * 110n + 99n) / 100n
  const rounded = ((withHeadroom + QUOTE_STEP_USDC - 1n) / QUOTE_STEP_USDC) * QUOTE_STEP_USDC
  return rounded > MAX_DEPLOY_FEE_USDC ? MAX_DEPLOY_FEE_USDC : rounded
}

/** Compare financial boundaries, not volatile RPC values from two blocks. */
export function quoteNeedsReapproval(accepted: DeployQuote, fresh: DeployQuote, ceiling: bigint): string | null {
  if (accepted.from.toLowerCase() !== DEPLOYER.toLowerCase() || fresh.from.toLowerCase() !== DEPLOYER.toLowerCase() ||
      ceiling < accepted.maxCost || ceiling > MAX_DEPLOY_FEE_USDC || fresh.maxCost > MAX_DEPLOY_FEE_USDC ||
      fresh.balance < fresh.maxCost) fail('Fresh deployment quote failed its safety checks')
  if (fresh.maxCost > ceiling) return 'The maximum fee increased above your approved spending ceiling. Review the new values and confirm them again.'
  const balanceChange = fresh.balance > accepted.balance ? fresh.balance - accepted.balance : accepted.balance - fresh.balance
  if (balanceChange >= QUOTE_STEP_USDC) return 'Wallet balance changed by at least 0.01 USDC. Review the new balance and confirm again.'
  return null
}

let requestActive = false
export async function sendDeployment(provider: RabbyProvider, quote: DeployQuote): Promise<Hex> {
  if (requestActive) fail('A deployment request is already open')
  requestActive = true
  try {
    if (Date.now() - quote.createdAt > 60_000) fail('Deployment estimate expired; refresh it')
    assertPinnedArtifact()
    assertAuthorizedWallet(await walletState(provider))
    const result = await provider.request({ method: 'eth_sendTransaction', params: [{
      from: DEPLOYER, chainId: '0x13b2', data: creationData(), value: '0x0',
      gas: `0x${quote.gasLimit.toString(16)}`,
      maxFeePerGas: `0x${quote.maxFeePerGas.toString(16)}`,
      maxPriorityFeePerGas: `0x${quote.priorityFeePerGas.toString(16)}`,
    }] })
    if (typeof result !== 'string' || !/^0x[0-9a-f]{64}$/i.test(result)) fail('Wallet returned no valid transaction hash; inspect Rabby activity before retrying')
    return result as Hex
  } finally { requestActive = false }
}

export async function verifyDeployment(rpc: RpcHealth, hash: Hex): Promise<Evidence> {
  if (await rpc.client.getChainId() !== CHAIN_ID) fail('CRITICAL: verification RPC is not Arc Mainnet')
  const [receipt, tx] = await Promise.all([rpc.client.getTransactionReceipt({ hash }), rpc.client.getTransaction({ hash })])
  if (receipt.status !== 'success' || !receipt.contractAddress || receipt.from.toLowerCase() !== DEPLOYER.toLowerCase() ||
      tx.from.toLowerCase() !== DEPLOYER.toLowerCase() || tx.to !== null || tx.value !== 0n || tx.input.toLowerCase() !== creationData().toLowerCase() ||
      receipt.blockNumber !== tx.blockNumber) throw new Error('CRITICAL: deployment receipt or transaction does not match the approved request')
  const address = receipt.contractAddress
  const [code, usdc, groups, rounds, locked, block] = await Promise.all([
    rpc.client.getCode({ address }),
    rpc.client.readContract({ address, abi: READ_ABI, functionName: 'USDC' }),
    rpc.client.readContract({ address, abi: READ_ABI, functionName: 'groupCount' }),
    rpc.client.readContract({ address, abi: READ_ABI, functionName: 'roundCount' }),
    rpc.client.readContract({ address, abi: READ_ABI, functionName: 'totalLocked' }),
    rpc.client.getBlock({ blockNumber: receipt.blockNumber }),
  ])
  if (!code) throw new Error('CRITICAL: no deployed runtime bytecode')
  if (code.toLowerCase() !== expectedRuntime().toLowerCase() || usdc.toLowerCase() !== ARC_USDC.toLowerCase() ||
      groups !== 0n || rounds !== 0n || locked !== 0n) throw new Error('CRITICAL: deployed bytecode or constructor state differs from the reviewed contract')
  const actualFee = receipt.gasUsed * receipt.effectiveGasPrice
  return { status: 'VERIFIED', receiptStatus: 'success', chainId: CHAIN_ID, rpc: rpc.url, txHash: hash, contractAddress: address,
    deployer: DEPLOYER, txTo: null, valueWei: '0', blockNumber: receipt.blockNumber.toString(), timestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
    gasUsed: receipt.gasUsed.toString(), effectiveGasPrice: receipt.effectiveGasPrice.toString(), actualFeeUsdc: displayUsdc(actualFee),
    sourceSha256: SOURCE_SHA, creationSha256: CREATION_SHA, runtimeCodeHash: keccak256(code), constructorUSDC: ARC_USDC,
    explorerTx: `${EXPLORER}/tx/${hash}`, explorerContract: `${EXPLORER}/address/${address}` }
}

export const ARTIFACT_FACTS = { sourceSha256: SOURCE_SHA, creationSha256: CREATION_SHA, runtimeTemplateSha256: RUNTIME_SHA,
  compiler: pinned.compiler, evmVersion: pinned.evmVersion, optimizerRuns: pinned.optimizerRuns, constructorUSDC: ARC_USDC,
  creationBytes: (pinned.creationBytecode.length - 2) / 2, runtimeBytes: (pinned.runtimeTemplate.length - 2) / 2 }
