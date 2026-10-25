/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arc, arcTestnet } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { requireChain } from './onchain-facts'

const testnetRpc = requireChain(arcTestnet.id).rpcUrls[0]
const mainnetRpc = requireChain(arc.id).rpcUrls[0]

export const config = createConfig({
  // Arc Mainnet is listed so the wallet can recognise it, but the app only talks to it
  // when a mainnet deployment address has been configured by the owner.
  chains: [arcTestnet, arc, mainnet],
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: http(testnetRpc),
    [arc.id]: http(mainnetRpc),
    [mainnet.id]: http('https://cloudflare-eth.com'), // ENS resolution uses an explicit CORS-safe Ethereum RPC
  },
})
