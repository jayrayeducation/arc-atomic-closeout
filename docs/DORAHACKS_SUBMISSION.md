# Atomic Closeout · contest submission draft

**Submission status: not submitted.** The owner must check the current contest page, eligibility, deadline and form fields before submitting. This is English copy to adapt, not a claim that an award or acceptance exists.

## Short description

**Split the bill. Close it out for real.** Atomic Closeout turns shared expenses into one USDC settlement plan that every member approves with their own wallet. Debtors fund exactly what they owe on Arc Mainnet; creditors withdraw after full funding. A missed funding deadline lets each depositor reclaim their own deposit.

## Problem and user

Small groups can track expenses and still end with uncertain collection: the balances live in one place, payments happen elsewhere, and there is no common record that everyone accepted the same numbers. Atomic Closeout is for groups that want the closeout itself to be explicit and verifiable, not just a list of IOUs.

## What is working

- Exact-integer USDC expense splits, net balances and a plan ID bound to member order and amounts.
- Each member approves the immutable plan from their own wallet. The contract opens funding after unanimous approval.
- Exact debtor deposits, separate finalization and creditor withdrawal, plus deadline refunds for incomplete funding.
- Browser-local expense notes, group names, archive/hide and backups; onchain financial state remains authoritative.
- A wallet-free Interactive Demo labelled DEMO DATA and a separate real Arc Mainnet run.

The mainnet contract is [`0xe05790767da98b524472ea9d78459aca4fb3b6c6`](https://explorer.arc.io/address/0xe05790767da98b524472ea9d78459aca4fb3b6c6) on Arc Mainnet **5042**. The owner deployed it independently after the project originated in [Arc Studio](https://studio.arc.io/app/c6e2330d-8e2f-44aa-935c-a9859f922a5e?thread=fe457d3b-009c-4455-8cd0-7944598e9009).

## Demonstration and proof

The featured real run is **Arc Demo, Group #5 / Round #3**: three wallet approvals of one 0.20 USDC plan, two 0.10 USDC deposits, finalization and a separate 0.20 USDC withdrawal. All nine unique receipts, decoded contract events, matching USDC transfers and final contract state were checked by read-only RPC. [Full evidence](MAINNET_EVIDENCE.md) · [machine-readable record](mainnet-evidence.json). The earlier completed **Group #1** is a separate run.

The owner recorded a **6:08** walkthrough. [Six lightweight excerpts](assets/README.md) are in the repository. **Public full-video URL: pending upload.** Do not insert a YouTube link until the owner provides one.

## Why Arc and USDC

Arc Mainnet provides the network for the contract and uses USDC for gas. The app and contract account for group obligations through Arc's 6-decimal USDC ERC-20 interface. The chain records consent and escrow state; local notes remain under the user's control in the browser. [Arc USDC event reference](https://docs.arc.io/integrate/infrastructure/indexing-events).

## Links to paste into the form

| Field | Link / value |
|---|---|
| Live app | https://arc-atomic-closeout.vercel.app/ |
| Repository and README | https://github.com/jayrayeducation/arc-atomic-closeout |
| Arc Studio original | https://studio.arc.io/app/c6e2330d-8e2f-44aa-935c-a9859f922a5e?thread=fe457d3b-009c-4455-8cd0-7944598e9009 |
| Mainnet contract | https://explorer.arc.io/address/0xe05790767da98b524472ea9d78459aca4fb3b6c6 |
| Transaction evidence | https://github.com/jayrayeducation/arc-atomic-closeout/blob/main/docs/MAINNET_EVIDENCE.md |
| Full demo video | **Owner to provide public URL** |
| Builder profile / submission URL | **Owner to provide** |

## Honest limitations

This is an early-stage prototype without an independent security audit. Expense notes do not automatically sync across devices. Group membership is fixed onchain; local archive/hide does not erase blockchain history. ERC-20 allowance receipts are not in the provided nine-hash evidence set. No customer traction, award or submitted contest entry is claimed.
