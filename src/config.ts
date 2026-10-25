/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arc, arcTestnet } from 'viem/chains'
import { fallback } from 'viem'
import { injected } from 'wagmi/connectors'
import { requireChain } from './onchain-facts'
import { RPC_URLS } from './lib/arcMainnetRpc'

const testnetRpc = requireChain(arcTestnet.id).rpcUrls[0]

export const config = createConfig({
  // The first chain is the ConnectKit default. Keep it aligned with the main app route.
  chains: [arc, arcTestnet, mainnet],
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: http(testnetRpc),
    [arc.id]: fallback(RPC_URLS.map((url) => http(url))),
    [mainnet.id]: http('https://cloudflare-eth.com'), // ENS resolution uses an explicit CORS-safe Ethereum RPC
  },
})
