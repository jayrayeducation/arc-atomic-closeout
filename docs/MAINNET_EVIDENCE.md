# Arc Mainnet evidence

Статус: **PENDING**. Размещения mainnet и реальных переводов USDC в рамках этой работы нет. Хэши не заполнены.

Для каждого разрешённого действия после исполнения записать: chain ID `5042`, адрес контракта, адрес участника, действие, сумму USDC, tx hash, ссылку `https://explorer.arc.io/tx/<hash>`, номер блока, статус receipt, событие контракта и проверенное изменение состояния.

| Действие | Участник | Сумма | Tx hash | Блок/статус | Событие и состояние |
|---|---|---:|---|---|---|
| Create group | PENDING | 0 | PENDING | PENDING | `GroupCreated`; PENDING |
| Propose plan | PENDING | 0 | PENDING | PENDING | `PlanProposed`; PENDING |
| Approve plan (каждый участник) | PENDING | 0 | PENDING | PENDING | `PlanApproved`; PENDING |
| USDC allowance (каждый должник) | PENDING | PENDING | PENDING | PENDING | `Approval`; PENDING |
| Fund obligation (каждый должник) | PENDING | PENDING | PENDING | PENDING | `Funded`; PENDING |
| Finalize | PENDING | 0 | PENDING | PENDING | `Finalized`; PENDING |
| Withdraw creditor funds | PENDING | PENDING | PENDING | PENDING | `Withdrawn`; PENDING |

Finalization создаёт право на выплату; USDC передаётся кредитору при отдельном `withdraw`.
