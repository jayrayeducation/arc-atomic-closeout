# Atomic Closeout

Group expenses that end in real USDC settlement on Arc. Members log shared costs, everyone approves the exact final plan with their own wallet,
debtors fund exact amounts into escrow, and creditors are paid when funding is complete. If funding never completes, each depositor can reclaim only their own deposit after the deadline.

Built with [Arc Studio](https://studio.arc.io/app/c6e2330d-8e2f-44aa-935c-a9859f922a5e?thread=fe457d3b-009c-4455-8cd0-7944598e9009). [Provenance and post-Studio changes](docs/ARC_STUDIO_PROVENANCE.md).

> **Status:** unaudited testnet MVP. Live on Arc Testnet. **Not deployed to Arc Mainnet.** No mainnet transaction has been sent and no real USDC has been spent.

## The problem

Splitwise-style apps tell you who owes whom, then rely on trust and a separate payment. Basic onchain splitters move money but have no shared agreement about the numbers.
Atomic Closeout joins the two: the group agrees on one immutable plan, and the money only moves under that plan.

## What it does

1. **Track.** Add shared expenses with exact USDC amounts. Split equally, by custom amounts or by percentages, and choose who is included. Odd leftover units are assigned by a fixed member order, so the same inputs always give the same shares.
2. **Approve.** The app nets everything into signed balances that sum to exactly zero and proposes the settlement. Each member approves the exact plan with a real wallet transaction. Nobody can approve for someone else. A changed plan is a new plan with a new ID.
3. **Fund.** After unanimous approval, debtors set an exact allowance and deposit exactly what they owe. Funding is a deposit, not settlement.
4. **Settle.** When funding is complete anyone can finalize. Creditors then withdraw their own entitlement. The app says "Settlement finalized; withdrawal pending" until the money has actually been withdrawn.
5. **Refund.** If the deadline passes before full funding, each depositor reclaims their own deposit. The proposer can also cancel an unfunded plan to correct it.

Other screens: group workspace with progress and deadline, balances chart, activity timeline with explorer links, shareable group links that load from the chain (no creator browser needed),
and an **Interactive demo** (Weekend Trip) that is scripted, labelled **DEMO DATA**, and never claims any onchain proof.

Expense titles and notes are saved in **this browser only** and may not synchronize across devices. They are never put in a link. The onchain plan is the source of truth.

## Live demo path (60 to 90 seconds)

Open the landing page, choose **Interactive demo**, press **Auto-play**. It walks through expenses, netting, plan ID, approvals, two debtor deposits, finalization, the creditor withdrawal and the evidence step.
Every step is marked **Simulated**. For the real thing, connect a wallet on Arc Testnet and **Create group**. See `docs/VIDEO_SCRIPT.md` for the recording script.

## Tech stack

React 18, TypeScript, Vite, Tailwind CSS, wagmi, viem, ConnectKit. Solidity 0.8.28 with Foundry and OpenZeppelin. Self-hosted fonts.

## Arc and USDC handling

Arc's native gas token is USDC. The app and contract use only the 6-decimal ERC-20 view of USDC (`0x3600000000000000000000000000000000000000`, same address on Arc Testnet and Arc Mainnet per docs.arc.io).
Amounts are whole numbers of base units end to end. Network fees are paid in USDC from the caller's balance and are never taken from deposits. The contract rejects any token that does not report exactly 6 decimals.
Network facts (chain IDs 5042 and 5042002, RPC, explorer) come from the Arc Studio registry in `src/onchain-facts.ts`.

## Deployments

| Network | Contract | Status |
|---|---|---|
| Arc Testnet (5042002) | `0x329cc6b4adf9e136c4b254d1e46fbe228c0b01da` | Deployed, block 69040767, tx `0xf73e8dc997d4a7ad455f73e267ba8fe0dbf5f4f4dd0c2d0d72cadce451622350` |
| Arc Mainnet (5042) | `<MAINNET_CONTRACT_ADDRESS_PLACEHOLDER>` | **Not deployed.** Owner-run package in `docs/MAINNET_DEPLOYMENT.md` |

Release links: [GitHub](https://github.com/jayrayeducation/arc-atomic-closeout), public site **PENDING**, builder profile **PENDING**, video **PENDING**. No mainnet address or transaction exists yet. [DoraHacks submission draft](docs/DORAHACKS_SUBMISSION.md).

## Development

Prerequisites: Node 22 and npm for the frontend; Bun and Foundry for the original model and contract suites. For Arc mainnet, use [Arc Foundry](https://docs.arc.io/arc/tutorials/install-arc-foundry).

```bash
npm install --legacy-peer-deps
npm run dev             # http://localhost:5173
npm run check           # lint and typecheck
npm run build           # production build is `vite build`
```

### Environment variables

Public values only. The archived Arc Studio testnet address and deployment block are tracked in `public-deployments.json`, so a clean production checkout builds without `.env`. Copy `.env.example` into a local `.env` only when overriding public settings; never publish `.env` or `.e2e-wallets.json`. Mainnet remains disabled until both mainnet values are configured after an authorized deployment.

| Name | Purpose |
|---|---|
| `VITE_ATOMIC_CLOSEOUT_TESTNET` | Arc Testnet contract address |
| `VITE_ATOMIC_DEPLOY_BLOCK_TESTNET` | Block where event scanning starts on testnet |
| `VITE_ATOMIC_CLOSEOUT_MAINNET` | Arc Mainnet contract address. Leave empty until the owner has deployed |
| `VITE_ATOMIC_DEPLOY_BLOCK_MAINNET` | Mainnet start block |

Testnet and mainnet are kept strictly apart: reads, event scans, explorer links and local notes are keyed by chain and contract.

## Tests

```bash
forge test                 # contract unit, fuzz and invariant tests
bun test tests             # exact-integer settlement model and plan-hash vector
bun run e2e:wallets        # create throwaway Arc Testnet wallets (gitignored file; fund them from the faucet)
bun run e2e:testnet        # live Arc Testnet lifecycle against the deployed contract (about 8 minutes)
bun run e2e:ui             # drives the real UI with a test wallet on Arc Testnet (needs Chromium; see docs)
bun run verify:deployment -- --chain 5042002 --address 0x329cc6b4adf9e136c4b254d1e46fbe228c0b01da
```

### Results (recorded in `docs/test-results/`)

Current local release check (2026-10-25): `npm run contracts:test` **152 PASS, 0 FAIL**; `npm run lint`, `npm run typecheck`, `npm run build` PASS. Bun model tests and live Arc RPC checks remain BLOCKED by this environment. Separate native `forge build` compiles but fails while writing its global signature cache. See [exact commands and limitations](docs/TEST_REPORT_RU.md) and [toolchain setup](docs/TOOLCHAIN_SETUP_RU.md).

`scripts/compass-deploy.ts` is an archived Studio helper requiring the unavailable `@circlefin/compass-chains` module. It is preserved but excluded from current app lint/typecheck. The archival PNG files in `docs/screenshots/` are damaged in the ZIP; new screenshots must be recorded before submission. Video script: [English](docs/VIDEO_SCRIPT_EN.md), [shotlist](docs/VIDEO_SHOTLIST_RU.md).

Gas figures are in `docs/test-results/gas-benchmarks.txt` (mock USDC, isolated transactions) and the live gas used per transaction is in `docs/test-results/testnet-e2e.md`.

## Security

Not audited. See `docs/SECURITY.md` for guarantees, Arc-specific handling and known limitations.
No admin, no upgrade path, pull-payment settlement, deposits refundable only to the depositor.

## Arc Mainnet

Nothing here deploys to mainnet automatically. `node scripts/mainnet-deploy.mjs <authorized-public-address>` performs a read-only preflight; `mainnet-verify.mjs` and `mainnet-smoke-test.mjs` check a deployed address. Follow `docs/MAINNET_DEPLOYMENT.md` for the owner-approved broadcast and `docs/MAINNET_SMOKE_TEST.md` for minimal real-USDC operations. [12-transaction plan and cost limits](docs/MAINNET_PLAN_RU.md) · [Website checklist](docs/WEB_DEPLOYMENT_CHECKLIST.md).

## How it was built in Arc Studio

Contract, tests, deployment and app were created in Arc Studio. See `docs/COMPETITION_EVIDENCE.md` for the build history, artifacts and submitter placeholders, and `docs/screenshots/` for the running app.
