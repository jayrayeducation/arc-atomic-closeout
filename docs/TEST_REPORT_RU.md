# Проверка выпуска — 25.10.2026

## Браузерный deploy на Arc Mainnet — 25.10.2026

| Команда / сценарий | Результат | Проверено |
|---|---|---|
| `npm.cmd run contracts:test -- --force` | PASS | Свежая компиляция 56 файлов solc 0.8.28, **153/153** контрактных теста. |
| `node scripts/check-deploy-artifact.mjs --write` | PASS | Pinned payload получен из только что собранного `contracts/out`, контрольные SHA-256 source/creation/runtime, 9 import hashes, ABI, compiler, optimizer, Cancun, 6 immutable refs, без linked libraries. |
| `node scripts/check-deploy-artifact.mjs` | PASS | Browser artifact совпал с контрольной сборкой, source/import hashes и UI ABI. В чистой Vercel-сборке без `contracts/out` этот же gate сверяет фиксированные fingerprints и установленные исходники. |
| `node scripts/check-deploy-artifact.mjs --pinned-only` | PASS | Смоделирован Vercel-путь без локального Foundry `out`: 9 source/import hashes и pinned source/ABI/creation/runtime fingerprints совпали; транзакций 0. |
| `npm.cmd run check` | PASS | oxlint type-aware и `tsc --noEmit` после страницы `/deploy`. |
| `npm.cmd run build` | PASS | Vite 6.4.5; `/deploy` включён в bundle; mainnet app contract address остаётся пустым. |
| `npm.cmd run contracts:test` | PASS | **153/153**, 0 FAIL, 10 suites; invariants 128 runs / 19200 calls / 0 reverts. |
| `npm.cmd run test:deploy` | PASS | 7 mock-тестов: неподходящая сеть/адрес/кошелёк, испорченный bytecode, недоступный RPC, недостаточный gas, отказ подписи, неверный receipt/code, повторный запрос. Chromium headless: `/deploy` на 390×844 и 1280×800, Connect Rabby без финансовых RPC, блокировка при недоступном RPC и восстановление после reload. Отдельный mock RPC дал quote; после точной фразы страница сделала **ровно один** fake `eth_sendTransaction` contract creation, mock Rabby отказал без hash. Никакая реальная сеть не использовалась. |
| `selectRpc()` по Blockdaemon/dRPC/Nodeflare | BLOCKED | Все три RPC недоступны из sandbox: `HTTP request failed`. Поэтому реальный latest block, eth_estimateGas, баланс и live fee **не получены**. Пользователь сообщил, что эти endpoints работают в его среде; из текущей это не подтверждено. |
| `gh api user --jq .login` | BLOCKED | GitHub API TCP 443: `connectex ... forbidden by its access permissions`; аккаунт `jayrayeducation` из sandbox сейчас не подтверждён, push не делался. |
| `python scripts/scan-staged-secrets.py`; `git diff --cached --check` | PASS | 206 staged/tracked файлов, 0 чувствительных путей, 0 secret-pattern matches, 0 файлов >5 МБ; ошибок whitespace нет. |

Исходный контракт и тестовые testnet evidence не изменены. Ни одной настоящей подписи, `eth_sendTransaction` или USDC-транзакции в этой работе нет. `BROWSER_MAINNET_DEPLOY_RU.md` содержит порядок ручного действия и проверки evidence.

После обнаруженного 403 официального RPC mainnet wagmi transport переведён на fallback из трёх публичных endpoint, предоставленных владельцем; testnet transport не менялся. `npm.cmd run check`, `npm.cmd run build` и `npm.cmd run test:deploy` повторно проверяются после этого изменения. Live доступность endpoint остаётся BLOCKED в sandbox.

## Дополнение: Arc Mainnet preflight, 25.10.2026

| Проверка | Статус | Результат |
|---|---|---|
| `node scripts/run-foundry.mjs test --offline --force --summary` | PASS | Свежая компиляция 56 Solidity файлов с solc 0.8.28, затем 152 теста до добавления точного gas-сценария. |
| `npm.cmd run contracts:test` | PASS | **153 теста, 0 FAIL**, 10 suites; новая проверка 0,20 USDC, invariant: 128 runs / 19200 calls / 0 reverts. |
| `npm.cmd run contracts:test -- --match-test test_Gas_SmallSettlement_3Wallets -vv` | PASS | 1 тест; lifecycle 1 169 250 gas без deploy и intrinsic; 12 операций в сценарии трёх кошельков. |
| `node scripts/mainnet-artifact-audit.mjs` | PASS | SHA-256 оригинала, hashes 9 исходников в metadata, solc 0.8.28, Cancun, optimizer 200, 72 artifact ABI entries, runtime ABI UI совпадает; creation 13055 B, runtime 12468 B. |
| `npm.cmd run check` | PASS | lint и typecheck. |
| `npm.cmd run build` | PASS | Vite 6.4.5; mainnet config пуст, testnet настроен. |
| `wsl.exe --status`, `wsl.exe --list --quiet` | BLOCKED | `Wsl/EnumerateDistros/Service/E_ACCESSDENIED`; Arc Foundry внутри WSL не установлен и не проверен. |
| `node scripts/mainnet-deploy.mjs <diagnostic address>` | BLOCKED | Arc RPC TCP 443: Node `fetch failed` / `EACCES`, ещё до `eth_chainId`; live gas и баланс не получены. |
| `node scripts/mainnet-wallet-preflight.mjs <A> <B> <C>` | BLOCKED | Диагностический запуск с тремя фиктивными адресами дошёл до `eth_chainId`; TCP 443 вернул `EACCES`. Публичные A/B/C пока не получены; реальные балансы не проверены, транзакций 0. |
| `python scripts/scan-staged-secrets.py` | PASS | 197 staged/tracked файлов, 0 sensitive paths, 0 secret-pattern paths, 0 файлов >5 МБ. |
| `git diff --cached --check`; `node --check` для `mainnet-artifact-audit.mjs`, `mainnet-wallet-preflight.mjs`, `mainnet-deploy.mjs` | PASS | Ошибок форматирования и синтаксиса нет. |
| `gh api user --jq .login` | BLOCKED | GitHub API TCP 443: `connectex ... forbidden by its access permissions`. Новый commit/push не выполнялся. |

Контракт `contracts/AtomicCloseout.sol` не изменён. Локальные mock gas значения не заменяют Arc-specific simulation и live fee quote. Детали в `MAINNET_RELEASE_PREFLIGHT_RU.md` и `ARC_FOUNDRY_WSL_RU.md`.

UX-исправление: в `src/components/FundingStatus.tsx` при нехватке USDC на Arc Mainnet больше не предлагается testnet faucet. После изменения `npm.cmd run check` и `npm.cmd run build` повторно PASS; проверка live Rabby на публичном URL остаётся BLOCKED до подтверждённого mainnet deployment.

## Исправление чистой Vercel-сборки — 25.10.2026

Из опубликованного коммита `73aa0be0bdbb3bedb21c06109ecdd7f934ecf465` создан чистый checkout без `.env`. Команда `npm.cmd install --legacy-peer-deps --offline --no-audit --no-fund` — **PASS**, 947 пакетов. Предупреждения `deprecated` не прервали установку. Затем `npm.cmd run build` — **FAIL** в `scripts/check-public-config.mjs:11`: `Set the original Arc Testnet contract address and deployment block before building`. Это локально воспроизведённая причина сбоя чистой сборки; полный лог удалённого deployment недоступен, поэтому тождество с удалённой ошибкой ещё не доказано.

Исправление: публичные testnet адрес и блок из архивного Studio deployment вынесены в `public-deployments.json` и используются как значения по умолчанию в проверке сборки и UI. Mainnet по умолчанию остаётся без адреса. Повторная чистая сборка с теми же установленными пакетами и без `.env` — **PASS**, Vite 6.4.5. В `package.json` зафиксирована Node 22.x для совпадения с проверенной локальной средой; Vercel поддерживает выбор этой версии. В исходном каталоге `npm.cmd run check` — **PASS**, `npm.cmd run build` — **PASS**, `npm.cmd run contracts:test` — **PASS**, 152 теста, 0 ошибок, 10 suites. Внешний Vercel deployment и его URL ещё требуют проверки после push.

Все результаты ниже относятся к **текущему** запуску, если явно не указано «архив».

| Команда | Результат | Тесты / пояснение |
|---|---|---|
| `npm.cmd install --no-package-lock --legacy-peer-deps` | PASS | 947 пакетов установлено. `npm audit` сообщил 89 уязвимостей зависимостей (49 high); требуется triage до публичного релиза. Bun lock не применялся. |
| `npm.cmd run lint` | PASS | Проверены `src/` с type-aware oxlint; архивный `scripts/compass-deploy.ts` исключён из текущего gate из-за отсутствующего Studio-only пакета. |
| `npm.cmd run typecheck` | PASS | `tsc --noEmit`, `src/` и поддерживаемые TS-скрипты. |
| `node --check scripts/mainnet-deploy.mjs`, `mainnet-verify.mjs`, `mainnet-smoke-test.mjs` | PASS | 3 синтаксические проверки. |
| `npm.cmd run build` | PASS | После Vercel/config изменений: Vite 6.4.5, 6445 модулей, сборка за 15.21 c; mainnet config пока пуст. Предупреждение о JS chunk 1.52 MB. |
| `npm.cmd run dev -- --host 127.0.0.1`; `Invoke-WebRequest http://127.0.0.1:5173/` | PASS | Локальная HTML-страница HTTP 200. Браузерный сценарий текущей версии не выполнен: Chrome/Edge не найдены, Arc RPC заблокирован. |
| `npm.cmd run contracts:test` | PASS | Через локальный solc 0.8.28: **152 PASS, 0 FAIL**, 10 suites; 7 fuzz-тестов × 256 прогонов, инварианты: 128 runs и 19 200 calls без revert. Лог: `docs/test-results/forge-local-2026-10-25.txt`. |
| `npm.cmd run contracts:build` | FAIL после компиляции | 56 Solidity файлов компилируются успешно; затем native Windows Forge 1.8.5 не получает глобальный `cache_dir` для сигнатур. `--no-cache` и `--no-lint` не помогли. |
| `npm.cmd run contracts:test -- --match-contract ACGasTest -vv --gas-report` | PASS | 3 gas tests; mock deployment 2 782 536 gas, runtime 13 087 bytes. Лог `docs/test-results/forge-gas-local-2026-10-25.txt`. |
| `bun test tests` | BLOCKED | Bun отсутствует; попытка получить его через npm завершается `EACCES`. 0 тестов запущено сейчас. |
| `bun run e2e:testnet`; `node tests-ui/run.mjs` | BLOCKED | Нужны доступ к Arc RPC и разрешённые тестовые кошельки. В текущей среде RPC возвращает `EACCES`; чужие архивные кошельки не использовались. 0 тестов запущено сейчас. |
| `node scripts/mainnet-deploy.mjs 0x0000000000000000000000000000000000000001` | BLOCKED | Скрипт дошёл до read-only запроса chain ID; RPC отклонён `EACCES`. Адрес служил только для проверки локального пути к preflight, транзакций 0. Реальный адрес deployer PENDING. |

Архивные `docs/test-results/forge-test.txt` заявляют 156 PASS, а **текущий фактический запуск дал 152 PASS**; причина разницы в архивной сумме пока не установлена. Текущие 10 suites завершились без ошибок. `testnet-e2e.md` заявляет 67 PASS как архив. Архивные tx hashes нельзя подтвердить через RPC в этой среде.

## Аудит кода контракта

Исходный `contracts/AtomicCloseout.sol` оставлен без изменений, diff относительно ZIP пуст. Проверены: сумма долгов равна сумме кредитов, шестизначный ERC-20 путь (native gas имеет 18 знаков), проверка фактически полученного депозита, дедлайн, единогласие, индивидуальные refunds/withdrawals, защита от повторного вызова и reentrancy, несколько групп/раундов. При полном финансировании finalization доступна и после дедлайна; при неполном — каждый внёсший может вернуть свою сумму. Учёт `totalLocked` уменьшается при выплате/возврате. Прямой перевод USDC в контракт вне `fund()` не восстанавливается; утрата доступа к кошельку кредитора либо запрет всех доступных адресов получателя также может оставить entitlement невостребованным. Внешний security audit отсутствует. Свежий `forge test` выполнен; Arc-specific выполнение и live RPC-проверка остаются заблокированы. Независимого security audit нет.

## Исправления и ограничения

- Исправлен npm lint/check для Windows; сборка теперь воспроизводима через npm с `--legacy-peer-deps`.
- Добавлены явные mainnet/testnet маршруты создания и списка групп, выбор только при настроенном контракте, проверка chain ID клиента кошелька до подписи.
- Добавлен видимый бейдж со ссылкой на фактический Arc Studio project.
- Исправлено описание UX: `finalize` записывает entitlement, USDC переводится отдельным `withdraw`.
- Для ENS задан явный CORS-совместимый Ethereum RPC согласно текущей документации Arc.
- Архивные PNG повреждены (байты `EF BF BD` вместо бинарных данных), поэтому новые скриншоты и запись нужны после доступного браузерного прогона.
- Foundry test разблокирован локальным solc; отдельный `forge build` падает после компиляции на global signature cache. Подробности: `TOOLCHAIN_SETUP_RU.md`.
- DNS для Arc/GitHub/npm работает; TCP 443 для всех запрещён (`PermissionError 10013`), TLS/HTTP не достигаются, proxy не задан. Bun и live RPC остаются блокерами. `gh api user --jq .login` также блокирован сетью. npm dependency audit требует отдельного разбора.
