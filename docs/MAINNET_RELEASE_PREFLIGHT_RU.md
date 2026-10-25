# Arc Mainnet: актуальный preflight, 25.10.2026

**Статус: BLOCKED до live RPC, адресов участников и отдельного разрешения.** Это уточнение `MAINNET_PLAN_RU.md` по свежему mock gas-тесту. Mainnet deploy и реальные USDC-транзакции не выполнены.

## Сеть и участники

Arc Mainnet: chain ID `5042`, RPC `https://rpc.mainnet.arc.io`, Explorer `https://explorer.arc.io`. USDC ERC-20: `0x3600000000000000000000000000000000000000`, 6 decimals. Native gas оплачивается USDC с 18 decimals; оба представления используют один базовый баланс, их нельзя складывать. Источники: [сеть](https://docs.arc.io/integrate/connect-to-arc), [адреса](https://docs.arc.io/arc/references/contract-addresses), [gas](https://docs.arc.io/arc/references/gas-and-fees).

| Роль | Публичный адрес | Principal | Действия |
|---|---|---:|---|
| A — deployer, creator, creditor | `0x3B0278E623a5F9C50AfaAB22c972c69Ec687448a` (сообщён владельцем, баланс не проверен) | получает 0,20 USDC | deploy, create, propose, approve, finalize, withdraw |
| B — debtor | PENDING | вносит 0,10 USDC | approvePlan, USDC.approve, fund |
| C — debtor | PENDING | вносит 0,10 USDC | approvePlan, USDC.approve, fund |

Минимум по контракту — **2 кошелька**: A и один должник B на 0,20 USDC, 9 транзакций включая deploy. Для согласованного конкурсного видео используется план **3 кошелька / 12 транзакций**: он подтверждает согласие и два отдельных взноса. Все адреса должны принадлежать уполномоченным участникам. У каждого должен остаться USDC на gas после внесения principal.

## Точный порядок 12 транзакций

| № | Отправитель | Получатель и действие | Principal | Проверка |
|---:|---|---|---:|---|
| 1 | A | contract creation `AtomicCloseout(Arc USDC)`; поле `to` пусто | 0 | status 1, адрес, bytecode, `USDC()` |
| 2 | A | контракт: `createGroup(A,B,C)` | 0 | `GroupCreated`, group ID |
| 3 | A | контракт: `proposePlan` | 0 | A credit 200000, B/C debt 100000, hash, expiry |
| 4–6 | A/B/C | контракт: `approvePlan` | 0 | 3 `PlanApproved`, `FundingOpened` |
| 7–8 | B/C | Arc USDC: `approve(contract,100000)` | 0 | exact allowance, без unlimited approval |
| 9–10 | B/C | контракт: `fund(roundId)` | по 0,10 | 2 `Funded`, `totalLocked=200000` |
| 11 | A | контракт: `finalize(roundId)` | 0 | `Finalized`, средства ещё в контракте |
| 12 | A | контракт: `withdraw(roundId)` | получает 0,20 | `Withdrawn`, `totalLocked=0` |

В Rabby подписывать только после сверки сети, `from`, `to`, функции, calldata и максимальной комиссии. **Одна операция → успешный receipt в Explorer → следующая операция.** Не обходить предупреждения кошелька. Отдельно разрешить deploy и отдельно операции с реальным USDC.

После подтверждённого deploy, проверки контракта и публикации mainnet-конфигурации: на сайте выбрать **Arc Mainnet**, нажать **Connect wallet** и в ConnectKit выбрать **Rabby**. Сверить адрес A и метку сети; если сайт предлагает **Switch wallet to Arc Mainnet**, проверить запрос переключения в Rabby. Далее A нажимает **Create group onchain**, **Propose plan onchain**, **Approve this exact plan**; B и C каждый подключает свой адрес и нажимает **Approve this exact plan**, **Step 1 of 2: allow exactly 0.1 USDC**, затем **Step 2 of 2: Deposit 0.1 USDC**. После двух успешных депозитов A нажимает **Finalize settlement** и отдельно **Withdraw 0.2 USDC**. Названия кнопок взяты из текущего UI; до публикации mainnet адреса они не должны предлагать финансовое действие. Для каждого нажатия Rabby показывает отдельный запрос транзакции. Никакая кнопка подключения сама по себе не должна запрашивать `approve`, `fund` или перевод.

## Gas и стоимость

Свежий локальный mock-тест `test_Gas_SmallSettlement_3Wallets` дал deploy **2 782 536 gas**, lifecycle **1 169 250 gas** без deploy и transaction intrinsic. Разбивка lifecycle: create 261822; propose 344033; 3 approvePlan 126427; 2 USDC approve 92704; 2 fund 198910; finalize 38843; withdraw 106511. Итого **3 951 786 gas без intrinsic**; приблизительно **4 203 786 gas** при добавлении 12 × 21000 intrinsic. При **условных** 30 gwei и 25% запасе это около **0,157642 USDC gas**, с 0,20 principal около **0,357642 USDC**. Это арифметический ориентир, **не котировка и не лимит расходов**. Старый Arc dry-run оценивал один deploy в ~3,63 млн gas, что существенно выше mock. Arc-specific precompile, gas price и комиссия могут изменить результат.

Для актуальной оценки нужны: `node scripts/mainnet-artifact-audit.mjs`, `node scripts/mainnet-wallet-preflight.mjs <A> <B> <C>`, `node scripts/mainnet-deploy.mjs <A>` и Arc Foundry simulation. Для каждого следующего вызова требуется свежий `eth_estimateGas` с реальными аргументами и отправителем. Итоговый максимум: `Σ(gasLimit_i × maxFeePerGas_i) + 0,20 USDC`; отдельный резерв каждого B/C должен покрывать principal и его 3 комиссии. **Текущая стоимость deploy, балансы, достаточность USDC и утверждённый максимальный бюджет — PENDING** из-за RPC `EACCES` и отсутствия публичных A/B/C.

Контракт без независимого аудита. Прямые USDC-переводы на его адрес вне `fund()` не возвращаются; `finalize` сам не переводит кредитору средства; blocklist или утрата контроля над доступными кошельками может оставить права на выплату невостребованными. Подробности в `SECURITY.md`.

До подтверждённого deploy mainnet env остаётся пустым. После deploy сначала `node scripts/mainnet-verify.mjs <contract>`, затем адрес и block в Vercel, затем публичная проверка chain ID 5042, ABI, Rabby и Explorer. Testnet config сохраняется отдельно. Каждый фактический tx фиксировать в `MAINNET_EVIDENCE.md`: hash, block, status, sender, recipient, amount, gas, событие, изменение состояния и Explorer URL. Никаких вымышленных хэшей.
