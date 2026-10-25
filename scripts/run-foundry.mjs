// Use an existing local Solidity 0.8.28 compiler to avoid svm-rs home lookup
// failures under restricted Windows user tokens. Never downloads a binary.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)
if (!['test', 'build'].includes(args[0])) throw new Error('Usage: node scripts/run-foundry.mjs test|build [forge arguments]')
const env = { ...process.env }
let forge = 'forge'
if (process.platform === 'win32') {
  const localForge = join(env.USERPROFILE ?? '', '.foundry', 'bin', 'forge.exe')
  if (existsSync(localForge)) forge = localForge
  const localSolc = join(env.APPDATA ?? '', 'svm', '0.8.28', 'solc-0.8.28')
  if (!env.FOUNDRY_SOLC && existsSync(localSolc)) env.FOUNDRY_SOLC = localSolc
  if (!env.FOUNDRY_SOLC) throw new Error('Solidity 0.8.28 compiler not found. Install it from the official Foundry release, then set FOUNDRY_SOLC to its absolute path.')
}
if (env.FOUNDRY_SOLC) {
  const check = spawnSync(env.FOUNDRY_SOLC, ['--version'], { env, encoding: 'utf8' })
  if (check.error || check.status !== 0 || !check.stdout.includes('0.8.28')) throw new Error('FOUNDRY_SOLC must point to a working Solidity 0.8.28 compiler')
}
const result = spawnSync(forge, args, { env, stdio: 'inherit' })
if (result.error) throw result.error
process.exit(result.status ?? 1)
