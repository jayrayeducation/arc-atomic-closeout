# Проверка предупреждения MetaMask — 25.10.2026

Проверяемый локальный исходник: `d1ac7aa4e176ab3976d64a80eebba1f534364580` плюс изменения этого аудита. Сайт: https://arc-atomic-closeout.vercel.app/. Проверка сделана внутри команды проекта; это **не независимый аудит безопасности**.

## Что установлено

1. Подключение реализовано через `ConnectKitButton` → `ConnectKitProvider` → wagmi `injected()` → EIP-1193 провайдер. Конфигурация перечисляет Arc Testnet (5042002), Arc Mainnet (5042) и Ethereum Mainnet для ENS; действия с USDC вынесены в отдельные кнопки. В коде подключения нет вызова `writeContract`, `eth_sendTransaction`, `personal_sign`, `eth_signTypedData`, `permit` или `transfer`.
2. Найдена реальная ошибка production-кода: `src/main.tsx` и `src/config.ts` безусловно загружали Studio-инструментирование `src/tracing.ts`. Оно переопределяло глобальный `fetch` и `window.ethereum.request`, а родительский iframe мог включить запись параметров RPC без проверки origin. В локальном тесте **до исправления** `window.ethereum` имел getter и функция `request` была заменена. Само инструментирование не отправляло деньги, но на публичном сайте такой доступ к вызовам кошелька недопустим.
3. Исправлено: загрузка `tracing.ts` и `console-capture.ts` только в iframe, чей непосредственный родитель имеет origin `https://studio.arc.io`; `config.ts` больше не импортирует трассировку. Оригинальные файлы Studio, контракт, UI и бейдж сохранены. В локальном production-тесте **после исправления** EIP-1193 `request` остался исходной функцией.
4. Безопасная проверка `node tests-ui/connect-audit.mjs`: headless Chromium, новый подставной EIP-1193 аккаунт `0x1111111111111111111111111111111111111111` без приватного ключа и средств; все внешние HTTP-запросы браузера блокируются. До нажатия Connect доступ к аккаунтам не запрашивался. После нажатия зафиксированы только `wallet_requestPermissions` с параметром `[{"eth_accounts":{}}]`, `eth_requestAccounts`, `eth_chainId`. Это разрешение на просмотр адреса аккаунта, без allowance и прав расходования. Не было `eth_sendTransaction`, подписи, `approve`, `permit`, `transfer` или redirect. Дополнительный тест поместил приложение в iframe не от Studio и послал `studio-trace-config`; provider остался неизменённым. Подключение завершилось без финансового действия.
5. При локальном сценарии браузер попытался обратиться к `rpc.testnet.arc.io` и `cloudflare-eth.com` (Arc Testnet RPC и Ethereum RPC для ENS); тест заблокировал оба запроса. Других внешних хостов в этом сценарии не обнаружено. В коде также есть ссылки на `studio.arc.io` и Arc explorers, которые открываются только по нажатию. `WalletConnect` присутствует транзитивно через ConnectKit, но текущая wagmi конфигурация содержит только `injected()`; WalletConnect project ID в source не обнаружен.
6. Все явные вызовы `writeContract` в UI принадлежат кнопкам создания группы, утверждения плана, точного USDC allowance для текущего контракта, финансирования, финализации, возврата и вывода. Адрес spender в `approve` — текущий адрес AtomicCloseout, сумма — `myDebt`. `withdrawTo`/`refundTo` получают альтернативный адрес из явного поля пользователя. В `src/` вне `onchain-facts.ts` нет постороннего фиксированного адреса получателя; три адреса `0x...de01`–`de03` маркированы как demo data.
7. Статическая проверка зависимостей: `npm ls --depth=0` PASS; 36 прямых пакетов, у них нет `preinstall`/`install`/`postinstall` hooks. Из 2995 локальных package manifests 7 имели такие hooks (включая `esbuild`, `protobufjs` и native optional packages); один найденный `ljharb-monorepo-symlink-test` находится в тестовом fixture пакета `resolve`. Проверка не запускала install scripts и не является доказательством отсутствия вредоносного кода во всех транзитивных зависимостях. Пакеты Circle SDK в `package.json` не импортируются браузерным `src/`; часть используется Studio/deploy скриптами.

## Что остаётся неизвестным

Точный текст/скриншот предупреждения MetaMask пока не предоставлен. Поэтому нельзя установить, сработала ли URL-репутация, проверка конкретного RPC/адреса или другой сигнал. MetaMask [описывает предупреждение «Deceptive site ahead» как проверку URL](https://support.metamask.io/ru/stay-safe/safety-in-web3/deceptive-site-ahead-when-trying-to-connect-to-a-site/) и [перечисляет несколько источников сигналов безопасности](https://support.metamask.io/configure/wallet/security-alerts/). Предположение о ложной репутационной классификации **не подтверждено**. Из этой среды публичный Vercel URL не открывается, а реальное расширение MetaMask с предупреждением не проверялось; соответствие текущего публичного bundle локальному исходнику тоже не подтверждено.

В репозитории есть `bun.lock`, но нет `package-lock.json`; Vercel использует `npm install --legacy-peer-deps`, поэтому npm зависимости могут менять разрешённые patch/minor версии между deploy. Онлайн-проверка advisories в этой среде недоступна. Это отдельное ограничение воспроизводимости и supply-chain проверки, оно само по себе не объясняет предупреждение MetaMask.

До проверки точного предупреждения не подключать кошельки со средствами и не подтверждать запросы через красный экран. Если предупреждение окажется блокировкой URL и после публикации исправления, владелец может воспользоваться [официальной утилитой MetaMask «Why Blocked?»](https://metamask.github.io/eth-phishing-detect/) и [каналом обращения к MetaMask](https://support.metamask.io/ru/stay-safe/safety-in-web3/deceptive-site-ahead-when-trying-to-connect-to-a-site/) с URL, скриншотом, ссылкой на GitHub и этим отчётом. Защитные функции MetaMask не отключать.

## Проверки после исправления

| Команда | Статус | Результат |
|---|---|---|
| `npm.cmd run build` | PASS | Vite production build; mainnet config pending. |
| `node tests-ui/connect-audit.mjs` | PASS | Только `eth_accounts` permission, `eth_requestAccounts`, `eth_chainId`; provider не изменён даже в iframe чужого origin; запрещённые методы 0. |
| `npm.cmd run check` | PASS | Oxlint и TypeScript. |
| `npm.cmd run contracts:test` | PASS | 152 теста, 0 failures, 10 suites. |
| `python scripts/scan-staged-secrets.py` | PASS | 193 staged files, 0 совпадений с секретами, 0 закрытых путей, 0 файлов свыше 5 МБ. |

Контракт `contracts/AtomicCloseout.sol`, Studio project URL и бейдж не менялись. Mainnet deploy и USDC транзакций не было.
