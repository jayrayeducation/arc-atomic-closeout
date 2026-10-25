# Браузерное размещение Atomic Closeout через Rabby

**Статус: локальная реализация проверена; публичная публикация и mainnet deploy не выполнялись.** Маршрут `/deploy` использует существующий Vite/React интерфейс и Vercel SPA fallback. Исходный `contracts/AtomicCloseout.sol`, Arc Studio бейдж, исходная Studio-ссылка и testnet deployment не изменены.

Локальные Chromium-тесты включают безопасный dry-run UI с **подставными** RPC и Rabby: страница получает mock `eth_estimateGas`, отображает quote и после явной фразы открывает один fake `eth_sendTransaction`; mock кошелёк отказывает. Никакой hash или факт mainnet deployment этим тестом не создаётся.

## Что именно размещается

- Разрешённый отправитель **только** `0x3B0278E623a5F9C50AfaAB22c972c69Ec687448a`.
- Сеть Arc Mainnet `5042` (`0x13b2`). Конструктор `AtomicCloseout(address usdc)` получает `0x3600000000000000000000000000000000000000`.
- `to` отсутствует, `value=0`, `data` — фиксированный creation bytecode + ровно один ABI-encoded адрес USDC. Страница вызывает `eth_sendTransaction` **один раз** только после ввода фразы подтверждения и свежего preflight. Подключение Rabby отдельно запрашивает только `eth_requestAccounts`.
- Original source SHA-256 `ac11dd2cfbd5485574a0e9f12c8bb8c77e729bd3a8bbc2dc5eb73b5de8a7b80c`; creation SHA-256 `77653c12803035044c6677596ca24360f0976b1a50f4e9f10ab657b3f93913e3`; runtime template SHA-256 `e45af6d1364acb379549e74735993a4844f7a6f705e92fb2facb2c716772ff2b`.

После **принудительной** локальной пересборки 56 Solidity файлов solc 0.8.28 артефакт сравнивался с контрольными хэшами, metadata девяти исходников, ABI UI, Cancun, optimizer 200, 6 immutable references и отсутствием linked libraries. Команда `node scripts/check-deploy-artifact.mjs --write` записала `src/generated/mainnetDeployArtifact.json`. Обычный `npm run build` повторно проверяет source/import hashes, ABI и bytecode; если артефакт Forge локально есть, сравнивает с ним весь pinned payload. Vercel не получает закрытые ключи и не собирает случайный удалённый bytecode.

## RPC и кошелёк

Официальный RPC `https://rpc.mainnet.arc.io` остаётся эталоном в [документации Arc](https://docs.arc.io/integrate/connect-to-arc), но владелец наблюдал 403 / Cloudflare 1009. Страница не меняет геолокацию. Она по порядку проверяет предоставленные владельцем публичные RPC: Blockdaemon, dRPC и Nodeflare. Каждый кандидат должен вернуть chain ID 5042, свежий блок, gas price не ниже 20 gwei и `USDC.decimals()=6`; при ошибке пробуется следующий. Если ни один не прошёл, Deploy отключён. В текущем sandbox исходящие HTTPS к Arc заблокированы, поэтому реальный latest block, gas, баланс и стоимость **не подтверждены**.

Основное приложение после подтверждённого deploy использует те же три публичных endpoint как viem/wagmi fallback для Arc Mainnet; Arc Testnet transport сохранён. Это позволяет читать settlement из разрешённого RPC, если официальный endpoint у владельца продолжит возвращать 403. `/deploy` отдельно проверяет chain ID и свежесть ответа перед каждой оценкой и подписью.

Rabby находится через EIP-6963 (`rdns=io.rabby`) либо `window.ethereum`/`providers` с `isRabby=true`. Страница не переопределяет provider. Только после нажатия **Connect Rabby** запрашивается разрешение на аккаунт. Адрес и chain проверяются после подключения, при событиях аккаунта/сети и непосредственно перед `eth_sendTransaction`. При любом несовпадении Deploy отключён. Кошелёк нельзя просить игнорировать предупреждения.

## Ручной порядок владельца после публикации

1. Открыть `https://arc-atomic-closeout.vercel.app/deploy`; сверить GitHub/Studio ссылки и source/creation fingerprints.
2. Подключить **только** разрешённый Rabby адрес. Переключить Rabby на Arc Mainnet 5042. Страница должна показать рабочий RPC, номер свежего блока, native USDC баланс и gas quote.
3. Сверить `estimatedGas`, gas limit с запасом 25%, `maxFeePerGas`, максимальную комиссию в USDC и оставшийся баланс. У страницы есть дополнительный **жёсткий предел 0,50 USDC** на максимальную комиссию одного deploy; если свежая котировка выше, Deploy выключен до отдельного пересмотра бюджета и кода. При недоступном RPC или недостатке средств Deploy также выключен.
4. Только после отдельного разрешения на финансовую операцию нажать **Deploy Contract**, сверить `from`, пустой `to`, `value=0`, USDC constructor и maximum fee, ввести точную фразу, затем нажать **Confirm in Rabby**. В Rabby ещё раз проверить цепь, контрактное создание и отсутствие security warning. При предупреждении или несовпадении отменить.
5. После отправки дождаться receipt или нажать **Recheck receipt**. При неизвестном результате **не нажимать Deploy повторно**: проверить Rabby Activity и Explorer. Страница сохраняет tx hash/неопределённый статус между перезагрузками и блокирует новый запрос.
6. Метка **VERIFIED** появляется только после success receipt, проверки sender/`to`/`value`/input, точного runtime bytecode (с конструкторным immutable USDC), `USDC()`, `groupCount=0`, `roundCount=0`, `totalLocked=0`, блока и фактической комиссии. Скопировать JSON evidence. Не считать deploy доказательством settlement.
7. После отдельного просмотра evidence вручную задать в Vercel `VITE_ATOMIC_CLOSEOUT_MAINNET=<verified address>` и `VITE_ATOMIC_DEPLOY_BLOCK_MAINNET=<verified block>` и перевыпустить сайт. Testnet настройки остаются отдельными.

## Локальные команды

```powershell
npm.cmd run check
npm.cmd run build
npm.cmd run contracts:test
npm.cmd run test:deploy
python scripts/scan-staged-secrets.py
```

Публикация разрешена только после `gh api user --jq .login` = `jayrayeducation`. Если проверка аккаунта или сеть недоступны, не выполнять commit/push; не менять GitHub identity. Указанный сайт станет иметь `/deploy` только после успешного push и Vercel deployment, которые надо проверить по публичному HTTPS URL. Mainnet конфигурация до реального deploy остаётся пустой.

В текущем окружении `gh api user --jq .login` отклонён локальным TCP 443 (`connectex ... forbidden by its access permissions`), а публичный `/deploy` недоступен инструменту проверки. Поэтому новый commit/push и Vercel release **не заявляются выполненными**.

После восстановления обычного разрешённого доступа владелец может выполнить в PowerShell из этого каталога:

```powershell
Set-Location 'C:\Hackathons\Arc\AtomicCloseout\source'
$login = gh api user --jq .login
if ($LASTEXITCODE -ne 0 -or $login -ne 'jayrayeducation') { throw 'GitHub identity mismatch; publication stopped' }
git remote -v
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw 'Staged diff check failed' }
python scripts/scan-staged-secrets.py
if ($LASTEXITCODE -ne 0) { throw 'Secret scan failed' }
git commit -m 'Add Rabby Arc Mainnet browser deployment'
if ($LASTEXITCODE -ne 0) { throw 'Commit failed' }
git push origin main
if ($LASTEXITCODE -ne 0) { throw 'Push failed' }
git rev-parse HEAD
gh api repos/jayrayeducation/arc-atomic-closeout --jq .full_name
Invoke-WebRequest 'https://arc-atomic-closeout.vercel.app/deploy' -UseBasicParsing
```

После успешного ответа HTTPS открыть страницу в обычном браузере и проверить фактический Vercel deployment SHA, артефакт, сеть и Rabby. **Публикация страницы не является разрешением на mainnet-транзакцию.**
