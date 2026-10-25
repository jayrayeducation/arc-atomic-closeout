# Security notes and known limitations

**Atomic Closeout has NOT been audited.** An automated rule-based review and a behaviour review were run during development
(both reported no material findings on the version they saw, before `refundTo` was added), but neither replaces a professional audit.
Do not use it with funds you cannot afford to lose.

## Design guarantees (enforced by the contract and covered by tests)

- No owner, admin, pause, upgrade path or fee. Nobody can move funds except the rules below.
- One immutable plan per round. Approval binds to the plan ID (a hash over chain ID, contract, group, round, member order, amounts, expiry and expense commitment). A changed plan is a new round with a new ID.
- Only a member can approve for themselves. There is no way to approve on behalf of someone else.
- Funding requires unanimous approval, is exact (no partial or excess deposits) and closes at the deadline.
- Finalize needs full funding and performs no transfers. Creditors withdraw their own entitlement (pull payments), so one failing recipient cannot block others.
- After a missed deadline each depositor can reclaim only their own deposit. A fully funded round can never be refunded, only finalized.
- `withdrawTo` and `refundTo` let the entitled party choose a different recipient (for example when their address is blocklisted). No one else can redirect funds.
- `totalLocked` tracks every unrefunded deposit and unwithdrawn entitlement; the contract's USDC balance must always be at least that (invariant-tested).
- Reentrancy guarded, checks-effects-interactions, custom errors, SafeERC20, no native-value handling.

## Arc-specific handling

- Arc's native gas token is USDC (18 decimals). The contract uses only the 6-decimal ERC-20 interface at `0x3600000000000000000000000000000000000000`.
  The constructor rejects any token that does not report exactly 6 decimals, and no function is payable.
- Gas is paid in USDC from the caller's balance. A deposit that empties a wallet leaves nothing for fees; the app warns about this.
- Arc enforces a USDC blocklist at runtime. A blocklisted debtor cannot fund; a blocklisted creditor or depositor can use `withdrawTo` / `refundTo`.

## Known limitations

- Funding, finalization and each creditor withdrawal are separate transactions. Finalization records entitlements but transfers no USDC; each successful withdrawal transfers one creditor's entitlement atomically.
- Group size is 2 to 8 members and fixed at creation.
- A group that never reaches unanimous approval simply expires. The proposer can cancel an unfunded plan to correct it.
- Offchain expense notes live in the browser's local storage only. They do not synchronize across devices. The onchain plan is authoritative; a plan commitment hash lets members check local notes against it.
- Tokens sent directly to the contract by mistake are not recoverable (they are outside the accounting).
- The unit and fuzz tests use a mock USDC. The live testnet scripts exercise the real Arc USDC; a blocklisted-address transfer was not exercised live.
- Event history is read by scanning logs from the deployment block through the public RPC; a very long history may take time to load.

## Static analysis (Slither, run on the final source)

Raw output: `docs/test-results/slither.json`. Result: 0 High, 3 reported as Medium, 4 Low, 3 Informational.

- 3 x `uninitialized-local` (the two running sums in the plan check and the "creator found" flag): intentional, Solidity zero-initialises them. Not a defect.
- 4 x `timestamp`: deadlines are the point of the design. Block timestamps can drift by seconds, which the 5 minute minimum window and the derived (not stored) expiry status tolerate.
- Informational: one low-level `staticcall` (the token decimals check in the constructor), complexity, naming style.
No source change was made after this analysis.
