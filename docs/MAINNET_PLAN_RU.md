# Arc Mainnet: минимальный план, без отправки транзакций

**Статус:** технический план готов, выполнение BLOCKED до свежего RPC preflight, адресов владельца и отдельного разрешения. Сеть `5042`; RPC `https://rpc.mainnet.arc.io`; explorer `https://explorer.arc.io`; USDC ERC-20 `0x3600000000000000000000000000000000000000` с 6 decimals. Gas оплачивается тем же USDC как native balance с 18 decimals. [Сеть](https://docs.arc.io/integrate/connect-to-arc), [USDC](https://docs.arc.io/arc/references/contract-addresses), [gas](https://docs.arc.io/arc/references/gas-and-fees).

## Участники и активы

| Роль | Публичный адрес | Основная сумма | Операции |
|---|---|---:|---|
| A — deployer, creator, creditor | PENDING | получает 0.20 USDC | deploy, create, propose, approve, finalize, withdraw |
| B — debtor | PENDING | вносит 0.10 USDC | approve plan, approve USDC, fund |
| C — debtor | PENDING | вносит 0.10 USDC | approve plan, approve USDC, fund |

Все три адреса должны принадлежать уполномоченному владельцу/участникам. Ключи и seed не нужны в репозитории или чате. В сценарии одна небольшая задолженность каждому из B и C. Требуемый principal — **0.20 USDC**, плюс отдельный gas-резерв у каждого кошелька.

## Последовательность: 12 транзакций

| № | Отправитель | Вызов | Сумма principal | Доказательство |
|---:|---|---|---:|---|
| 1 | A | deploy `AtomicCloseout(Arc USDC)` | 0 | код, адрес, receipt, `USDC()` |
| 2 | A | `createGroup(A,B,C)` | 0 | `GroupCreated`, group ID |
| 3 | A | `proposePlan` | 0 | `PlanProposed`, plan hash, debts/credits/deadline |
| 4–6 | A/B/C | `approvePlan` каждый | 0 | 3 `PlanApproved`, затем `FundingOpened` |
| 7–8 | B/C | `USDC.approve(contract,100000)` | 0 | exact allowance по 0.10 USDC |
| 9–10 | B/C | `fund(roundId)` | 0.10 USDC каждый | 2 `Funded`, escrow/`totalLocked` = 0.20 |
| 11 | A | `finalize(roundId)` | 0 | `Finalized`; USDC ещё в контракте |
| 12 | A | `withdraw(roundId)` | получает 0.20 USDC | `Withdrawn`; `totalLocked` = 0, баланс контракта = 0 если нет сторонних переводов |

## Локальная оценка, не котировка сети

Свежий `forge test --match-contract ACGasTest -vv --gas-report` с mock USDC дал deployment **2,782,536 gas** и размер runtime **13,087 bytes**. Для приведённых 12 вызовов ориентир **3,982,841 gas** суммарно, включая mock-оценку `approve`. При гипотетическом `maxFeePerGas = 30 gwei` это **0.11948523 USDC** gas, с запасом 25% по gas (округление до 4,978,552 gas) — **0.14935656 USDC**, а вместе с principal — **0.34935656 USDC**. Это арифметика локальных тестов, **не** текущий gas price, баланс кошельков или утверждённый предел расходов. Arc может потребовать другие gas limits/fees. Документация Arc указывает EIP-1559 и минимум 20 gwei; актуальную плату надо получить из RPC непосредственно перед подписью.

Архивный mainnet dry-run в `docs/MAINNET_DEPLOYMENT.md` оценивал один deploy примерно в **3.63 млн gas**, что заметно выше локальных 2.78 млн. Поэтому локальную сумму **нельзя использовать как spending cap**. Разницу разрешит только новый Arc RPC preflight на текущем bytecode.

Точный бюджет и максимальные расходы: **PENDING**. После появления разрешённого RPC и публичного адреса A выполнить `node scripts/mainnet-deploy.mjs <A>`: скрипт read-only проверит chain ID, исходный SHA-256, bytecode, ABI, настройки компилятора, `eth_estimateGas`, `maxFeePerGas`, native USDC balance и maximum deployment fee. Для каждого следующего вызова отдельно выполнить `eth_estimateGas` от фактического отправителя с фактическими аргументами и проверить его баланс/allowance; итоговый лимит равен `sum(gasLimit_i × maxFeePerGas_i) + 0.20 USDC`. До этого утверждать точную максимальную сумму нельзя.

## Проверка после разрешённого deploy

1. Сохранить адрес и tx hash из receipt; выполнить `node scripts/mainnet-verify.mjs <contract>` — код должен совпасть с artifact вне immutable slots, `USDC()` и decimals = 6.
2. Заполнить две переменные mainnet в Vercel только после этой проверки, повторить production build и проверить **публичный HTTPS URL**.
3. Для каждого шага проверить `chainId=5042`, успешный receipt, block number, событие, изменение `getRound`/баланса, explorer URL. После финального withdrawal выполнить `node scripts/mainnet-smoke-test.mjs <contract>`.
4. Заполнить `docs/MAINNET_EVIDENCE.md` только фактическими хэшами. Не считать deploy или testnet доказательством mainnet settlement.

**Approval gates:** отдельно согласовать публичные GitHub/Vercel публикации, затем mainnet deploy, затем реальные USDC-транзакции. Никакая из них не выполнена.
