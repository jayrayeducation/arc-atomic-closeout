# Atomic Closeout

> Built with Arc Studio - money-powered apps in minutes

Project memory for future agents and humans.

## What this app does

Group expense settlement in USDC on Arc. Members log shared costs, approve one exact immutable plan with their own wallets,
debtors fund exact amounts into escrow, creditors withdraw after full funding, and depositors can reclaim after a missed deadline.

## Tech stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS v3, wagmi v2, viem, ConnectKit, hash router (`src/lib/router.ts`)
- Fonts are self-hosted via `@fontsource-variable/*` (no external font requests)
- Contracts: Solidity 0.8.28 (Cancun), Foundry, OpenZeppelin 5.6.1. `bun run contracts:build`, `bun run contracts:test`
- Money: USDC ERC-20 interface `0x3600000000000000000000000000000000000000`, 6 decimals. Native gas is the same USDC (18 decimals). The contract never handles native value.

## Deployments

| Network | Chain ID | Contract | Block |
|---|---|---|---|
| Arc Testnet | 5042002 | `0x329cc6b4adf9e136c4b254d1e46fbe228c0b01da` | 69040767 |
| Arc Mainnet | 5042 | NOT DEPLOYED (owner-run only, see `docs/MAINNET_DEPLOYMENT.md`) | n/a |

Deploy tx (testnet): `0xf73e8dc997d4a7ad455f73e267ba8fe0dbf5f4f4dd0c2d0d72cadce451622350`. Addresses live in `.env` as `VITE_ATOMIC_*` keys (see `env.example.txt`).

## Key files

- `contracts/AtomicCloseout.sol` - the escrow. Do not change deployed behaviour without redeploying and updating `.env` and `src/lib/abi.ts`.
- `src/lib/settlement.ts` - exact-integer split, netting and plan-hash model (mirrors the contract's hash; cross-checked by `AtomicCloseout.HashVector.t.sol`)
- `src/lib/abi.ts` - generated from the forge artifact
- `src/pages/` and `src/components/` - UI. Contract state is the source of truth; expense notes are browser-local (`src/lib/storage.ts`)
- `scripts/testnet-e2e.ts` - live Arc Testnet lifecycle test. `tests-ui/` - real-UI lifecycle test with an injected test wallet
- `docs/` - README companions, test output, screenshots, mainnet package

## Rules for changes

- Never invent addresses, balances or transaction hashes. Demo data must stay labelled DEMO DATA.
- Never broadcast to mainnet or spend real USDC from here. Mainnet is owner-run.
- `.e2e-wallets.json` holds throwaway testnet keys. Never commit or print it.
- Run `bun run check`, `forge test`, `bun test tests` after changes.
