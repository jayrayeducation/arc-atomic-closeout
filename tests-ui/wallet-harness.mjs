// Playwright helper: injects a window.ethereum (EIP-1193) provider into the page.
// Signing and broadcasting happen in Node with the throwaway wallets from .e2e-wallets.json,
// so the REAL app UI sends REAL Arc Testnet transactions. Private keys never enter the page.
import fs from 'node:fs'
import { createPublicClient, createWalletClient, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'

const RPC = 'https://rpc.testnet.arc.io'
const keyFile = new URL('../.e2e-wallets.json', import.meta.url).pathname
const wallets = JSON.parse(fs.readFileSync(keyFile, 'utf8'))
export const accountOf = (n) => privateKeyToAccount(wallets[n].privateKey)
const pub = createPublicClient({ chain: arcTestnet, transport: http(RPC) })

export async function installWallet(page, { account = 'alex', chainId = 1 } = {}) {
  const state = { account, chainId, log: [] }
  await page.exposeFunction('__nodeRpc', async (method, params) => {
    const acc = accountOf(state.account)
    state.log.push(method)
    switch (method) {
      case 'eth_requestAccounts':
      case 'eth_accounts':
        return [acc.address]
      case 'eth_chainId':
        return '0x' + state.chainId.toString(16)
      case 'net_version':
        return String(state.chainId)
      case 'wallet_switchEthereumChain': {
        const id = parseInt(params[0].chainId, 16)
        if (id !== 5042002 && id !== 1) throw Object.assign(new Error('Unrecognized chain'), { code: 4902 })
        state.chainId = id
        setTimeout(() => page.evaluate((c) => window.__emit('chainChanged', c), '0x' + id.toString(16)).catch(() => {}), 50)
        return null
      }
      case 'wallet_addEthereumChain':
        return null
      case 'eth_sendTransaction': {
        if (state.rejectNext) {
          state.rejectNext = false
          throw new Error('User rejected the request.')
        }
        const tx = params[0]
        // A real wallet signs only for the account that is active in it.
        if (tx.from && tx.from.toLowerCase() !== acc.address.toLowerCase()) {
          throw new Error(`Requested account ${tx.from} is not the active wallet account ${acc.address}`)
        }
        state.log.push(`send as ${state.account}`)
        const wc = createWalletClient({ account: acc, chain: arcTestnet, transport: http(RPC) })
        const hash = await wc.sendTransaction({ to: tx.to, data: tx.data, value: tx.value ? BigInt(tx.value) : undefined })
        state.log.push('sent ' + hash)
        return hash
      }
      case 'personal_sign':
      case 'eth_signTypedData_v4':
        throw Object.assign(new Error('User rejected the request.'), { code: 4001 })
      default: {
        const res = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
        const j = await res.json()
        if (j.error) throw Object.assign(new Error(j.error.message), { code: j.error.code })
        return j.result
      }
    }
  })
  await page.addInitScript(() => {
    const listeners = {}
    window.__emit = (ev, payload) => (listeners[ev] ?? []).forEach((cb) => cb(payload))
    window.ethereum = {
      isMetaMask: true,
      request: ({ method, params }) => window.__nodeRpc(method, params ?? []),
      on: (ev, cb) => ((listeners[ev] ??= []).push(cb), window.ethereum),
      removeListener: (ev, cb) => ((listeners[ev] = (listeners[ev] ?? []).filter((x) => x !== cb)), window.ethereum),
    }
  })
  return {
    state,
    async setAccount(name) {
      state.account = name
      await page.evaluate((a) => window.__emit('accountsChanged', [a]), accountOf(name).address)
      await page.waitForTimeout(800)
    },
    async setChain(id) {
      state.chainId = id
      await page.evaluate((c) => window.__emit('chainChanged', c), '0x' + id.toString(16))
      await page.waitForTimeout(800)
    },
    tx: () => state.log.filter((l) => l.startsWith('sent ')).map((l) => l.slice(5)),
  }
}

export { pub }
