# Built with Arc Studio: competition evidence

Project: **Atomic Closeout** (Built with Arc Studio microgrant submission).
Everything below is what exists in this repository. Nothing is pre-filled for items that do not exist yet.

## Submitter details (to be completed by the authorized builder)

| Item | Value |
|---|---|
| Authorized builder GitHub | `<GITHUB_REPO_URL_PLACEHOLDER>` |
| Arc Studio project link | `<STUDIO_PROJECT_URL_PLACEHOLDER>` (copy it from the Arc Studio project you are working in) |
| Live site | `<SITE_URL_PLACEHOLDER>` |
| Builder wallet (public address only) | `<AUTHORIZED_BUILDER_WALLET_PLACEHOLDER>` |
| Mainnet contract | `<MAINNET_CONTRACT_ADDRESS_PLACEHOLDER>` (not deployed) |
| Mainnet transaction hashes | `<MAINNET_TX_HASH_PLACEHOLDER>` (none exist) |

## What was built inside Arc Studio

| Artifact | Path |
|---|---|
| Solidity contract | `contracts/AtomicCloseout.sol` |
| Foundry tests (9 suites + hash vector) | `contracts/test/*.t.sol`, mocks in `contracts/test/mocks/` |
| Deployment script (owner-run) | `contracts/script/DeployAtomicCloseout.s.sol` |
| Financial model (exact integers) | `src/lib/settlement.ts`, tests in `tests/settlement.test.ts` |
| Frontend | `src/` (React, TypeScript, Tailwind, wagmi, viem, ConnectKit) |
| Live testnet scripts | `scripts/testnet-e2e.ts`, `tests-ui/run.mjs` |
| Test output | `docs/test-results/` |
| Screenshots of the running app | `docs/screenshots/` |

## Arc Studio build history (what happened, in order)

1. Verified Arc payment mechanics against docs.arc.io: chain IDs 5042 and 5042002, RPC and explorer URLs, USDC ERC-20 interface at
   `0x3600000000000000000000000000000000000000` with 6 decimals, native gas USDC with 18 decimals, blocklist and zero-address behaviour.
2. Chose the ERC-20 route (SafeERC20, explicit allowance) so every contract amount is a 6-decimal integer and no `msg.value` handling exists.
3. Contract authored in Arc Studio, then reviewed by Arc Studio's automated rule-based and behaviour reviews (balanced depth). Both returned no material findings.
   After the reviews, `refundTo` was added (a blocklisted depositor could otherwise be stuck) and covered by new tests. That addition was not re-reviewed.
4. Tests generated and run in Arc Studio's Foundry environment.
5. Deployed to Arc Testnet through Arc Studio.
6. Frontend built, then inspected in a real headless browser (screenshots in `docs/screenshots/`).
7. The full lifecycle was executed against the deployed testnet contract, from scripts and through the real UI.

## Testnet deployment (real)

| Field | Value |
|---|---|
| Network | Arc Testnet, chain ID 5042002 |
| Contract | `0x329cc6b4adf9e136c4b254d1e46fbe228c0b01da` ([explorer](https://explorer.testnet.arc.io/address/0x329cc6b4adf9e136c4b254d1e46fbe228c0b01da)) |
| Deploy transaction | `0xf73e8dc997d4a7ad455f73e267ba8fe0dbf5f4f4dd0c2d0d72cadce451622350` ([explorer](https://explorer.testnet.arc.io/tx/0xf73e8dc997d4a7ad455f73e267ba8fe0dbf5f4f4dd0c2d0d72cadce451622350)) |
| Deployment block | 69040767 |
| Constructor argument | `0x3600000000000000000000000000000000000000` (Arc USDC ERC-20 interface) |
| Read-only check | `bun run verify:deployment -- --chain 5042002 --address 0x329cc6b4adf9e136c4b254d1e46fbe228c0b01da` |

## Test evidence

See `docs/test-results/` for raw output. Summary figures are in the README "Test results" section and are copied from those files.
Per-transaction hashes for the live lifecycle are in `docs/test-results/testnet-e2e.md` and `docs/test-results/ui-e2e.json`.
`docs/test-results/testnet-e2e-run1.md` is an earlier run kept for transparency: it recorded one failure caused by a wrong expectation in the test script (the contract correctly returned `DeadlinePassed`, the script expected `WrongStatus`); the script was corrected and re-run.

## Differentiation

Splitwise-style apps record who owes whom and rely on trust. Basic onchain splitters send money on request but have no shared agreement.
Atomic Closeout adds: unanimous approval of one immutable plan ID, exact-amount escrow funding, pull-payment entitlements after full funding,
and deadline refunds that only the depositor can claim.

## Honest limitations

See `docs/SECURITY.md`. The contract is unaudited, the mainnet package is unexecuted, and expense notes are local to the browser.
