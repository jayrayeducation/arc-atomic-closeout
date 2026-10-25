import type { Address } from 'viem'
import { shortAddr } from './format'

export interface Member {
  address: Address
  name: string
}

export function buildMembers(addresses: readonly Address[], names: Record<string, string>): Member[] {
  return addresses.map((a, i) => ({
    address: a,
    name: names[a.toLowerCase()]?.trim() || `Member ${i + 1} (${shortAddr(a)})`,
  }))
}
