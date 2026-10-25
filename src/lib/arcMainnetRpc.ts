// Public Arc Mainnet providers supplied by the authorized project owner.
// The official Arc RPC remains the documented network default but returned 403
// in the owner's region; no proxy or location change is used here.
export const RPC_URLS = [
  'https://rpc.blockdaemon.mainnet.arc.io',
  'https://rpc.drpc.mainnet.arc.io',
  'https://rpc.nodeflare.app/arc/public',
] as const
