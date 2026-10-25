# Arc Mainnet deployment package (owner-run, not executed)

> **Status: NOT DEPLOYED.** Nothing in this repository has broadcast a mainnet transaction or spent real USDC.
> Arc Mainnet moves real USDC and transactions are irreversible. Atomic Closeout is **not audited**.
> Review every address and setting yourself before continuing. An independent professional audit has not been performed.

Arc Studio can write and edit mainnet configuration but does not deploy to, sign for, fund or transact on mainnet.
Every step below is performed by the authorized builder, from their own wallet, outside Arc Studio.

## Verified network facts (docs.arc.io, checked while building)

| Item | Arc Mainnet | Arc Testnet |
|---|---|---|
| Chain ID | 5042 | 5042002 |
| RPC | https://rpc.mainnet.arc.io | https://rpc.testnet.arc.io |
| Explorer | https://explorer.arc.io | https://explorer.testnet.arc.io |
| USDC (ERC-20 interface, 6 decimals) | `0x3600000000000000000000000000000000000000` | same address |
| Native gas token | USDC (18 decimals in the native view) | USDC |

The contract uses only the 6-decimal ERC-20 view of USDC. It has no payable function and never reads `msg.value`.
Network fees are paid by each caller from the same USDC balance and are never taken from deposits.

## Pre-flight checklist

- [ ] Record the lack of an independent audit in the owner risk decision; resolve any new findings before deployment.
- [ ] `arc-forge build` and `arc-forge test --network arc` pass on the exact commit you will deploy. Current Windows mock suite and artifact audit are recorded in `TEST_REPORT_RU.md`.
- [ ] Review the archived live testnet lifecycle evidence in `docs/test-results/`; repeat it only if the exact bytecode or workflow changes.
- [ ] You control the deployer wallet. Never paste a private key or seed phrase into a shell, file or chat. See `ARC_FOUNDRY_WSL_RU.md`.
- [ ] The deployer wallet holds enough mainnet USDC for gas. Funding is your decision. Arc Studio never funds mainnet wallets.
- [ ] You re-checked chain ID 5042, the RPC URL and the USDC address against https://docs.arc.io/arc/references/contract-addresses.md.

## 1. Dry run (no broadcast, no cost)

```bash
export ARC_RPC_URL=https://rpc.mainnet.arc.io
export CONFIRM_MAINNET=I_UNDERSTAND_THIS_USES_REAL_USDC
arc-forge script contracts/script/DeployAtomicCloseout.s.sol --rpc-url $ARC_RPC_URL
```

The script refuses to run on any chain other than 5042 or 5042002, refuses mainnet without `CONFIRM_MAINNET`, and refuses any USDC address other than Arc's.
Arc recommends its Foundry fork (`arc-forge`) for Arc-specific behaviour: https://docs.arc.io/arc/tutorials/install-arc-foundry.md

Dry-run record (simulation only, no transaction sent, run while building):

| Check | Result |
|---|---|
| Testnet simulation (chain 5042002) | Script ran successfully. Forge estimated about 3.63M gas. |
| Mainnet simulation with `CONFIRM_MAINNET` set (chain 5042) | Script ran successfully against the mainnet RPC (read-only). Same gas estimate. |
| Mainnet without `CONFIRM_MAINNET` | Refused: `Mainnet deploy not confirmed` |
| Unsupported chain (default local chain) | Refused: `Unsupported chain: use Arc Testnet or Arc Mainnet` |

Stock `forge` prints the estimated cost in "ETH" and computes it from the node's gas price. On Arc the gas token is USDC, so read that figure as USDC and treat it as a rough estimate only.
Confirm real fees with Arc's tooling before broadcasting.

## 2. Signing and broadcast (separate owner approval)

The read-only scripts never send a transaction. `arc-forge script --broadcast` is **not** a Rabby wallet connection and must not be run without a verified local signer. The dedicated `/deploy` browser flow has now been implemented locally for the authorized Rabby address; it has passed mock/browser tests but has **not yet been published or exercised with a live Rabby transaction**. See `BROWSER_MAINNET_DEPLOY_RU.md`. Do not export Rabby keys or seed phrase to Foundry. A hardware signer remains an alternative only after separately checking the installed Arc Foundry version and device compatibility.

Before signing, record the authorized `from` address, chain ID 5042, constructor USDC address, fresh `eth_estimateGas`, `maxFeePerGas`, maximum fee in USDC and full 12-transaction budget in `MAINNET_RELEASE_PREFLIGHT_RU.md`. Obtain a separate go-ahead for deployment. Broadcast exactly one transaction, then verify its receipt and code before proceeding. The current repository does not automate that action.

Record the deployed address and deployment block here (placeholders until you do it):

| Field | Value |
|---|---|
| Mainnet contract | `<MAINNET_CONTRACT_ADDRESS_PLACEHOLDER>` |
| Deploy transaction | `<MAINNET_DEPLOY_TX_HASH_PLACEHOLDER>` |
| Deployment block | `<MAINNET_DEPLOY_BLOCK_PLACEHOLDER>` |
| Deployer wallet | `<AUTHORIZED_BUILDER_WALLET_PLACEHOLDER>` |

## 3. Read-only verification

```bash
node scripts/mainnet-verify.mjs <MAINNET_CONTRACT_ADDRESS>
```

This sends no transaction. It checks the chain ID, that the runtime bytecode matches `contracts/out/AtomicCloseout.sol/AtomicCloseout.json`
(ignoring the immutable USDC slot), that `USDC()` is Arc's USDC and reports 6 decimals.

For explorer source verification use the compiler settings from `foundry.toml`: Solidity 0.8.28, EVM `cancun`, optimizer on with 200 runs,
constructor argument `0x3600000000000000000000000000000000000000`.

## 4. Point the app at mainnet (only after step 3 passes)

Add to `.env` (public values only):

```
VITE_ATOMIC_CLOSEOUT_MAINNET=<MAINNET_CONTRACT_ADDRESS>
VITE_ATOMIC_DEPLOY_BLOCK_MAINNET=<MAINNET_DEPLOY_BLOCK>
```

Testnet and mainnet data are kept apart: every read, activity scan, explorer link and local note is keyed by chain ID and contract address.

## 5. Real-USDC smoke test (owner-approved, minimal)

See `docs/MAINNET_SMOKE_TEST.md`. Use the smallest amounts you are comfortable losing.
