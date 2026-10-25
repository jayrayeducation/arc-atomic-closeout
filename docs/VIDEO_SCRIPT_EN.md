# Atomic Closeout — narration (target 105 seconds)

Shared expenses are easy to record, but hard to close. A spreadsheet can tell friends who owes whom; it cannot prove that everyone agreed to the same numbers or that the money actually arrived.

Atomic Closeout, built with Arc Studio, connects the plan to USDC settlement on Arc. Here is the original Arc Studio project and the live app. The demo screen is clearly marked DEMO DATA; the wallet flow uses the selected network shown in the interface.

First, I create a group with three wallet addresses. We add two small expenses and choose how each is split. The app calculates exact six-decimal USDC balances and one immutable plan ID. Every member opens the same group and approves that precise plan with their own wallet.

Once everyone agrees, each debtor grants an exact USDC allowance and funds their obligation. The contract holds those deposits. Funding alone does not pay the creditor. When all deposits are present, anyone finalizes the round. The creditor then makes a separate withdrawal. If funding remains incomplete at the deadline, each depositor can reclaim their own money.

Here are the transaction receipts and contract events in the Arc explorer: group creation, proposal, approvals, funding, finalization and the final withdrawal. The network label and transaction hashes on screen show whether this is testnet or mainnet. Nothing from the simulated demo is presented as payment evidence.

Atomic Closeout turns a shared expense list into a verifiable agreement and a completed USDC closeout.

## Recording gate

Use the narration above only with matching Explorer evidence. For an Arc Mainnet cut, show chain 5042 and the verified deployment, then the real 0.10 USDC funding transactions from each debtor, the separate finalization and creditor withdrawal, and their successful receipts. If any step is incomplete, say "planned" or label the footage Arc Testnet; do not narrate a completed mainnet settlement. The video has not been recorded.
