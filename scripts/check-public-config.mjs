import { loadEnv } from 'vite'
import { isAddress, zeroAddress } from 'viem'

const env = loadEnv('production', process.cwd(), 'VITE_')
const testnet = env.VITE_ATOMIC_CLOSEOUT_TESTNET
const testnetBlock = env.VITE_ATOMIC_DEPLOY_BLOCK_TESTNET
const mainnet = env.VITE_ATOMIC_CLOSEOUT_MAINNET
const mainnetBlock = env.VITE_ATOMIC_DEPLOY_BLOCK_MAINNET
const validBlock = (value) => /^\d+$/.test(value ?? '') && BigInt(value) > 0n
if (testnet?.toLowerCase() !== '0x329cc6b4adf9e136c4b254d1e46fbe228c0b01da' || !validBlock(testnetBlock)) {
  throw new Error('Set the original Arc Testnet contract address and deployment block before building')
}
if (Boolean(mainnet) !== Boolean(mainnetBlock)) throw new Error('Mainnet contract address and deployment block must be set together')
if (mainnet && (!isAddress(mainnet) || mainnet.toLowerCase() === zeroAddress || mainnet.toLowerCase() === testnet.toLowerCase() || !validBlock(mainnetBlock))) {
  throw new Error('Invalid Arc Mainnet deployment configuration')
}
console.log(`Public config valid: testnet configured; mainnet ${mainnet ? 'configured' : 'pending'}`)
