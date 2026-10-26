# Arc Mainnet evidence · Atomic Closeout

**Verification:** read-only Arc Mainnet RPC, 26 October 2026. Chain ID `5042`; contract [`0xe05790767da98b524472ea9d78459aca4fb3b6c6`](https://explorer.arc.io/address/0xe05790767da98b524472ea9d78459aca4fb3b6c6). The [machine-readable record](mainnet-evidence.json) contains full hashes, UTC timestamps, block numbers, senders, decoded calls and event arguments. Re-run `node scripts/verify-mainnet-evidence.mjs` from the repository root; add `--write` only to refresh that record. The script uses `eth_chainId`, transaction, receipt, block, code and `eth_call` reads. It has no wallet or transaction-sending method.

## Contract deployment

The owner deployed the contract separately from Arc Studio. The [deployment receipt](https://explorer.arc.io/tx/0xd3135a28e036f0227c8b21e6c657b7e5325caa44e3d332a8cfba167c02a02b54) succeeded at block **27,856,267** on **2026-10-25 21:10:35 UTC**. The transaction was a contract creation from `0x3B0278E623a5F9C50AfaAB22c972c69Ec687448a`; its receipt created the pinned address above. Current runtime code is present. The [Arc Studio original](https://studio.arc.io/app/c6e2330d-8e2f-44aa-935c-a9859f922a5e?thread=fe457d3b-009c-4455-8cd0-7944598e9009) is the source project, not the mainnet deployment agent.

## Arc Demo · Group #5, Round #3

This is the full run featured in the owner's **6:08 recording**. All nine hashes below have successful receipts, target the pinned contract, decode to the listed function and emit the expected contract event. Block numbers and timestamps came from the RPC. All three approvals bind to the same plan hash, `0x03c90bce6f84f19d5a8ddaff6e8ae437d9f381b8116622b40cee9d36179c90d2`. The third approval has count 3 and opens funding; it is **one transaction**, not a tenth transaction.

| Step | Arc Explorer transaction | Block · UTC | Verified event / value |
|---|---|---|---|
| Create **Arc Demo** | [0x006e…9d02](https://explorer.arc.io/tx/0x006edcf63759ca302a2b86556056c31df3396d3f5daffe26e7cf55a35f0e9d02) | 27,923,431 · 06:38:03 | `GroupCreated`, Group #5, 3 wallets |
| Propose plan | [0xce67…5cb0](https://explorer.arc.io/tx/0xce678f0b3341e126fc3b5252e3f4e984644ca4e99882d9f273d6d5cb66a65cb0) | 27,923,592 · 06:39:25 | `PlanProposed`, Round #3, **0.20 USDC** |
| Approve 1 / 3 | [0x7190…cc96](https://explorer.arc.io/tx/0x7190a8ae129414490db66ddd576f4a25c7e6d3ee9908a084f0e5bc13422acc96) | 27,923,615 · 06:39:36 | `PlanApproved`, count 1 |
| Approve 2 / 3 | [0x820d…f744](https://explorer.arc.io/tx/0x820d588b0f59c9ddfe9e9b952ba6f0144f67877847bf922bd12715b656daf744) | 27,923,666 · 06:40:02 | `PlanApproved`, count 2 |
| Approve 3 / 3; funding opens | [0x3d3e…ce1a](https://explorer.arc.io/tx/0x3d3eddeebe19bef927ab92699f3050e7ff49d68fdbfb1a9a56ebf6d7f068ce1a) | 27,923,710 · 06:40:25 | `PlanApproved`, count 3 |
| Max deposits | [0xcd20…8b15](https://explorer.arc.io/tx/0xcd20dfc1c05646b570e2f2c7098e343489867b155a672604605311f146968b15) | 27,923,754 · 06:40:47 | `Funded` + USDC `Transfer`, **0.10 USDC** |
| Jon deposits | [0x7e7b…4251](https://explorer.arc.io/tx/0x7e7b473a6fe9a42faaee6c28d379f69416e2fc3c2a331e1441dc83b4c9dd4251) | 27,923,881 · 06:41:51 | `Funded` + USDC `Transfer`, **0.10 USDC** |
| Finalize | [0x72d8…8856](https://explorer.arc.io/tx/0x72d8c6d6828678c57092fd52c351d842554fece6d2b7b3e37a4276f818bb8856) | 27,923,914 · 06:42:08 | `Finalized`, **0.20 USDC** entitlement |
| Creditor withdraws | [0xdd4c…89a1](https://explorer.arc.io/tx/0xdd4c6177fc57ba9096a6c62695125f3a6767a6ef265d480d33cb70aa11289a1f) | 27,923,992 · 06:42:48 | `Withdrawn` + USDC `Transfer`, **0.20 USDC** |

UTC date for every Arc Demo step is **2026-10-26**. The two `Funded` receipts contain matching `Transfer` logs from the debtor to the contract at the Arc USDC address `0x3600000000000000000000000000000000000000`. The `Withdrawn` receipt contains a matching transfer from the contract to the creditor. A current read of Round #3 returned status `Settled`, `totalAmount = fundedTotal = withdrawnTotal = 200000` USDC base units (0.20 USDC). **Finalization and withdrawal are separate actions**; finalization itself does not transfer the creditor's USDC.

**Allowance limitation:** the owner did not provide ERC-20 approval transaction hashes. The app's exact-amount allowance path is visible in the code and video, but this document does not claim to have independently checked allowance receipts or values.

## Separate earlier run · Group #1

Do not combine this run with Arc Demo. A current read of **Group #1**, named **“Atomic Closeout — Mainnet Demo”**, returned three members and active Round #1. That round is `Settled` with `totalAmount = fundedTotal = withdrawnTotal = 200000` base units (0.20 USDC). These current-state facts are RPC verified. This document does not list Group #1's transaction hashes because they were not supplied and validated as a separate set.

## What verification means here

`RPC_VERIFIED` means responses from a public Arc RPC matched the pinned chain, contract, successful receipts, decoded contract events, expected amounts and current round state. This is a reproducible read-only check, **not** an independent security audit or a claim that the RPC provider itself is a self-run node. Explorer links are direct reference links; the verification was performed through RPC because the Explorer web page was not accessible to the automated reader.
