import { loadEnv } from 'vite'
import { isAddress, zeroAddress } from 'viem'
import { readFileSync } from 'node:fs'

const publicDeployments = JSON.parse(readFileSync(new URL('../public-deployments.json', import.meta.url), 'utf8'))

const env = loadEnv('production', process.cwd(), 'VITE_')
const testnet = env.VITE_ATOMIC_CLOSEOUT_TESTNET ?? publicDeployments.testnet.contract
const testnetBlock = env.VITE_ATOMIC_DEPLOY_BLOCK_TESTNET ?? publicDeployments.testnet.fromBlock
const mainnet = env.VITE_ATOMIC_CLOSEOUT_MAINNET
const mainnetBlock = env.VITE_ATOMIC_DEPLOY_BLOCK_MAINNET
const validBlock = (value) => /^\d+$/.test(value ?? '') && BigInt(value) > 0n
if (testnet?.toLowerCase() !== publicDeployments.testnet.contract.toLowerCase() || testnetBlock !== publicDeployments.testnet.fromBlock || !validBlock(testnetBlock)) {
  throw new Error('Set the original Arc Testnet contract address and deployment block before building')
}
if (Boolean(mainnet) !== Boolean(mainnetBlock)) throw new Error('Mainnet contract address and deployment block must be set together')
if (mainnet && (!isAddress(mainnet) || mainnet.toLowerCase() === zeroAddress || mainnet.toLowerCase() === testnet.toLowerCase() || !validBlock(mainnetBlock))) {
  throw new Error('Invalid Arc Mainnet deployment configuration')
}
console.log(`Public config valid: testnet configured; mainnet ${mainnet ? 'configured' : 'pending'}`)
