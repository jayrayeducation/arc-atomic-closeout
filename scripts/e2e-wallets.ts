/**
 * Creates THROWAWAY Arc Testnet wallets for the live integration test.
 * Keys are stored in .e2e-wallets.json (gitignored), never printed, never used on mainnet.
 * Usage: bun run scripts/e2e-wallets.ts
 */
import fs from 'node:fs'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

const FILE = new URL('../.e2e-wallets.json', import.meta.url).pathname
if (fs.existsSync(FILE)) {
  const w = JSON.parse(fs.readFileSync(FILE, 'utf8')) as Record<string, { address: string }>
  console.log('existing wallets:', Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v.address])))
} else {
  const names = ['alex', 'maya', 'jordan', 'stranger']
  const out: Record<string, { privateKey: string; address: string }> = {}
  for (const n of names) {
    const pk = generatePrivateKey()
    out[n] = { privateKey: pk, address: privateKeyToAccount(pk).address }
  }
  fs.writeFileSync(FILE, JSON.stringify(out, null, 2), { mode: 0o600 })
  console.log('created wallets:', Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.address])))
}
