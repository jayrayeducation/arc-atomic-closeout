/**
 * Which AtomicCloseout deployment the app talks to, per chain.
 * The archived Studio testnet deployment has a public default. Mainnet comes
 * only from explicit environment values. A chain without an address is reported
 * as "not deployed": the app never falls back to another chain's data.
 */
import { isAddress, type Address } from 'viem'
import { arc, arcTestnet } from 'viem/chains'
import { requireChain } from '@/onchain-facts'
import publicDeployments from '../../public-deployments.json'

export interface Deployment {
  chainId: number
  label: string
  isTestnet: boolean
  contract: Address | null
  /** First block to scan for events (the deployment block). */
  fromBlock: bigint | null
  explorerBase: string
}

function parseAddress(v: string | undefined): Address | null {
  return v && isAddress(v, { strict: false }) ? (v) : null
}

function parseBlock(v: string | undefined): bigint | null {
  return v && /^\d+$/.test(v) ? BigInt(v) : null
}

const env = import.meta.env as Record<string, string | undefined>

export const DEPLOYMENTS: Record<number, Deployment> = {
  [arcTestnet.id]: {
    chainId: arcTestnet.id,
    label: 'Arc Testnet',
    isTestnet: true,
    contract: parseAddress(env.VITE_ATOMIC_CLOSEOUT_TESTNET ?? publicDeployments.testnet.contract),
    fromBlock: parseBlock(env.VITE_ATOMIC_DEPLOY_BLOCK_TESTNET ?? publicDeployments.testnet.fromBlock),
    explorerBase: requireChain(arcTestnet.id).explorerBase,
  },
  [arc.id]: {
    chainId: arc.id,
    label: 'Arc Mainnet',
    isTestnet: false,
    contract: parseAddress(env.VITE_ATOMIC_CLOSEOUT_MAINNET),
    fromBlock: parseBlock(env.VITE_ATOMIC_DEPLOY_BLOCK_MAINNET),
    explorerBase: requireChain(arc.id).explorerBase,
  },
}

export const DEFAULT_CHAIN_ID = arcTestnet.id

export function getDeployment(chainId: number): Deployment | undefined {
  return DEPLOYMENTS[chainId]
}

export const SUPPORTED_CHAIN_IDS = [arcTestnet.id, arc.id] as const
export type SupportedChainId = (typeof SUPPORTED_CHAIN_IDS)[number]

export function isSupportedChain(id: number): id is SupportedChainId {
  return id === arcTestnet.id || id === arc.id
}
