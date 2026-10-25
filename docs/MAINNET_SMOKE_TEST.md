# Minimal real-USDC smoke test checklist (Arc Mainnet)

**Do not run this without explicit approval from the authorized builder.** It spends real USDC. The contract is unaudited.
Use wallets you control, and amounts you accept losing. Suggested totals are far below 5 USDC across all wallets.

Prerequisite: `docs/MAINNET_DEPLOYMENT.md` steps 1 to 4 completed and `verify:deployment` passing.

## Wallets

Use three wallets you control: **A** (creditor), **B** and **C** (debtors). Each needs a little USDC for network fees (paid in USDC on Arc),
B and C also need their deposit amounts. Never share seed phrases or private keys with anyone, including Arc Studio.

## Happy path (one group, ~0.30 USDC moved)

1. [ ] Connect wallet A. Confirm the network badge reads **Arc Mainnet** and the contract link matches your recorded address.
2. [ ] Create group with A, B, C. Record tx hash: `<TX>`.
3. [ ] Add two tiny expenses (for example A paid 0.30, B paid 0.00, equal split) so B and C owe 0.10 each and A is owed 0.20.
4. [ ] Propose the plan with a 24-hour window. Record plan ID and tx hash.
5. [ ] Approve from A, B and C. Each must be a separate wallet transaction. Confirm nobody can approve for another member.
6. [ ] B and C each set an exact USDC allowance, then deposit. Confirm contract balance equals deposits.
7. [ ] Finalize (any wallet). Confirm the UI says "Settlement finalized; withdrawal pending" and **not** "paid".
8. [ ] A withdraws. Confirm A's USDC rose by 0.20 minus network fees and the contract USDC balance returned to zero.
9. [ ] Open the shared group link in a clean browser with no wallet: the settled state must render from the chain.

## Expiry and refund (~0.10 USDC moved)

10. [ ] Propose a new plan with the minimum window (5 minutes). Approve with all wallets.
11. [ ] Only B deposits. Wait past the deadline.
12. [ ] Confirm funding is rejected after the deadline, then B reclaims exactly their own deposit. A second refund must fail.

## Evidence to record (no fabricated values)

| Item | Value |
|---|---|
| Create group tx | `<MAINNET_TX_HASH_PLACEHOLDER>` |
| Propose tx | `<MAINNET_TX_HASH_PLACEHOLDER>` |
| Approvals (x3) | `<MAINNET_TX_HASH_PLACEHOLDER>` |
| Deposits (x2) | `<MAINNET_TX_HASH_PLACEHOLDER>` |
| Finalize tx | `<MAINNET_TX_HASH_PLACEHOLDER>` |
| Withdraw tx | `<MAINNET_TX_HASH_PLACEHOLDER>` |
| Refund tx | `<MAINNET_TX_HASH_PLACEHOLDER>` |

Stop immediately and do not continue if any balance, status or address differs from what this checklist expects.
