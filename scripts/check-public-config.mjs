import { loadEnv } from 'vite'
import { isAddress, zeroAddress } from 'viem'
import { readFileSync } from 'node:fs'

const publicDeployments = JSON.parse(readFileSync(new URL('../public-deployments.json', import.meta.url), 'utf8'))

const env = loadEnv('production', process.cwd(), 'VITE_')
const testnet = env.VITE_ATOMIC_CLOSEOUT_TESTNET ?? publicDeployments.testnet.contract
const testnetBlock = env.VITE_ATOMIC_DEPLOY_BLOCK_TESTNET ?? publicDeployments.testnet.fromBlock
const mainnet = env.VITE_ATOMIC_CLOSEOUT_MAINNET || publicDeployments.mainnet.contract
const mainnetBlock = env.VITE_ATOMIC_DEPLOY_BLOCK_MAINNET || publicDeployments.mainnet.fromBlock
const validBlock = (value) => /^\d+$/.test(value ?? '') && BigInt(value) > 0n
if (testnet?.toLowerCase() !== publicDeployments.testnet.contract.toLowerCase() || testnetBlock !== publicDeployments.testnet.fromBlock || !validBlock(testnetBlock)) {
  throw new Error('Set the original Arc Testnet contract address and deployment block before building')
}
if (Boolean(env.VITE_ATOMIC_CLOSEOUT_MAINNET) !== Boolean(env.VITE_ATOMIC_DEPLOY_BLOCK_MAINNET)) throw new Error('Mainnet Vite variables must be set together')
if (!isAddress(mainnet) || mainnet.toLowerCase() === zeroAddress || mainnet.toLowerCase() !== publicDeployments.mainnet.contract.toLowerCase() ||
    mainnet.toLowerCase() === testnet.toLowerCase() || mainnetBlock !== publicDeployments.mainnet.fromBlock || !validBlock(mainnetBlock)) {
  throw new Error('Invalid Arc Mainnet deployment configuration')
}
console.log('Public config valid: Arc Mainnet 5042 configured from pinned deployment; testnet preserved')
