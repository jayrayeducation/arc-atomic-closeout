# Competition evidence · Atomic Closeout

This page maps the contest claims to inspectable sources. It is not a submission receipt or an independent security audit.

| Claim | Evidence | Status |
|---|---|---|
| Project began in Arc Studio | [Original Arc Studio project](https://studio.arc.io/app/c6e2330d-8e2f-44aa-935c-a9859f922a5e?thread=fe457d3b-009c-4455-8cd0-7944598e9009); [export provenance](ARC_STUDIO_PROVENANCE.md) | Source project and export documented; Studio link may require Circle login |
| Arc Mainnet contract exists | [Deployment transaction](https://explorer.arc.io/tx/0xd3135a28e036f0227c8b21e6c657b7e5325caa44e3d332a8cfba167c02a02b54), block 27,856,267; [contract](https://explorer.arc.io/address/0xe05790767da98b524472ea9d78459aca4fb3b6c6) | Receipt and runtime presence RPC verified; owner deployed separately from Studio |
| Arc Demo completed | [Nine transaction receipts](MAINNET_EVIDENCE.md) for Group #5 / Round #3 | Three approvals, 0.20 USDC funded, finalized and withdrawn; RPC verified |
| Earlier Mainnet Demo completed | [Group #1 current state](MAINNET_EVIDENCE.md#separate-earlier-run--group-1) | Settled and fully withdrawn 0.20 USDC; current contract state RPC verified; separate from Arc Demo |
| Full demo video | [Watch the 6:08 video on YouTube](https://www.youtube.com/watch?v=xWpZg0jgYL0); [six excerpts and source provenance](assets/README.md) | YouTube oEmbed returned the Atomic Closeout title and JayRay Education author; source MP4 checked locally |
| Contract tests pass | `npm run contracts:test` | 153 passed, 0 failed in local run on 2026-10-26 |
| App available | [Live site](https://arc-atomic-closeout.vercel.app/) | HTTP 200 checked; owner should confirm full browser flow after every release |

## What Arc Studio contributed

The exported Studio project contained `contracts/AtomicCloseout.sol`, Foundry tests, the frontend, financial model, testnet deployment materials and screenshots. Its source ZIP and hash are recorded in [provenance](ARC_STUDIO_PROVENANCE.md). Production wallet safeguards, group-management UX and the owner-run mainnet deployment were later work on the exported project. We do **not** describe the owner-run mainnet deployment as an Arc Studio deployment.

## Claim boundaries

- Arc Demo's third approval and funding opening are **one** transaction. There are nine unique Arc Demo hashes in the record.
- Two 0.10 USDC deposits and the 0.20 USDC withdrawal have matching USDC `Transfer` logs. Finalization records an entitlement; it does not itself transfer the creditor's USDC.
- ERC-20 allowance transaction hashes were not provided. The code and video show the allowance workflow, but allowance receipts are not claimed as verified.
- Expense notes, labels and local archive/hide state are browser-local. Member addresses, approved plan, deposits and payout history are onchain.
- The contract has **not** had an independent security audit. The project is an early-stage prototype; no real customer adoption or contest award is claimed.
- The [full demo is public on YouTube](https://www.youtube.com/watch?v=xWpZg0jgYL0). Actual contest submission remains an owner action; no submitted entry or award is claimed.

The [read-only verifier](../scripts/verify-mainnet-evidence.mjs) and [structured JSON record](mainnet-evidence.json) make the Mainnet claims repeatable without a wallet, private key or transaction.
