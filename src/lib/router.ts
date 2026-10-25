/**
 * Minimal hash router. Routes:
 *   #/                      landing
 *   #/demo                  interactive demo (synthetic data)
 *   #/groups                my groups
 *   #/create                create group
 *   #/g/<chainId>/<groupId> shareable group workspace (reads the chain, not the creator's browser)
 * No private expense data is ever placed in a URL.
 */
import { useEffect, useState } from 'react'
import { DEFAULT_CHAIN_ID, isSupportedChain } from './deployments'

export type Route =
  | { name: 'landing' }
  | { name: 'demo' }
  | { name: 'groups'; chainId: number }
  | { name: 'create'; chainId: number }
  | { name: 'group'; chainId: number; groupId: bigint; tab: string | null }

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  if (parts[0] === 'demo') return { name: 'demo' }
  if (parts[0] === 'groups') return { name: 'groups', chainId: isSupportedChain(Number(parts[1])) ? Number(parts[1]) : DEFAULT_CHAIN_ID }
  if (parts[0] === 'create') return { name: 'create', chainId: isSupportedChain(Number(parts[1])) ? Number(parts[1]) : DEFAULT_CHAIN_ID }
  if (parts[0] === 'g' && /^\d+$/.test(parts[1] ?? '') && /^\d+$/.test(parts[2] ?? '')) {
    return { name: 'group', chainId: Number(parts[1]), groupId: BigInt(parts[2]), tab: parts[3] ?? null }
  }
  return { name: 'landing' }
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))
  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash(window.location.hash))
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export const hrefGroup = (chainId: number, groupId: bigint | number, tab?: string) =>
  `#/g/${chainId}/${groupId.toString()}${tab ? `/${tab}` : ''}`

export function navigate(hash: string) {
  window.location.hash = hash
}
