# Atomic Closeout — release audit, 25.10.2026

## Gate

| Этап | Статус | Доказательство / блокер |
|---|---|---|
| SOURCE IMPORT | PASS | 304 записи ZIP безопасно распакованы в `source/`; архив сохранён; SHA-256 в `ARC_STUDIO_PROVENANCE.md`. |
| SECRETS | PASS для staged Git | 190 staged files просканированы `python scripts/scan-staged-secrets.py` без совпадений с ключами/токенами и без файлов свыше 5 МБ; `.env`, `.e2e-wallets.json`, caches и повреждённые PNG исключены. Архивные тестовые ключи остаются только локально и не используются. |
| CONTRACT TESTS | PASS | `npm run contracts:test`: 152 теста PASS, 0 FAIL, 10 suites; fuzz и инварианты. Отдельный `forge build` компилирует код, но падает после компиляции на глобальном кэше сигнатур Windows. |
| SECURITY | FAIL до проверки MetaMask warning | В публичном коде был лишний Studio provider/fetch wrapper; исправление staged и безопасный mock-connect PASS, но точная классификация предупреждения и новый публичный bundle не проверены. Независимого аудита и Arc-specific live проверки нет. Прямые USDC-переводы вне `fund()` невозвратны. |
| FRONTEND | PARTIAL | Локальный headless Chromium ConnectKit/injected сценарий PASS без финансовых RPC; live MetaMask warning на публичном URL не воспроизведён из sandbox. Архивные PNG повреждены. |
| PRODUCTION BUILD | PASS | `npm.cmd run build`, Vite 6.4.5, exit 0. |
| GITHUB | PUBLISHED, MetaMask fix PENDING push | Существующий `jayrayeducation/arc-atomic-closeout`, локальный HEAD `d1ac7aa4e176ab3976d64a80eebba1f534364580`. Новый push блокирован: `gh api user --jq .login` не достигает GitHub TCP 443 (`connectex`). |
| WEBSITE | URL сообщён владельцем, проверка BLOCKED | `https://arc-atomic-closeout.vercel.app/` указан владельцем, но sandbox не открывает его. Локальный production build PASS; staged MetaMask fix ещё не опубликован. |
| ARC MAINNET | BLOCKED | Документация Arc сверена; `mainnet-deploy.mjs` read-only preflight не завершился из-за RPC `EACCES` и отсутствия авторизованного deployer address. |
| REAL USDC | NOT YET | Ни одной mainnet USDC транзакции. |
| VIDEO | SCRIPTED | Английский текст и русский shotlist готовы; запись отсутствует. |
| DORAHACKS | READY как черновик | Заявка не отправлена; обязательные ссылки и mainnet evidence PENDING. Официальная страница недоступна из окружения (HTTP 405), точный deadline по Киеву PENDING. |

## Фактическая работа

- Исходный архив `atomic_closeout_arc_studio_o0esu6.zip` восстановлен без перезаписи. Контракт совпадает с оригиналом побайтно.
- Проанализированы учёт USDC, approvals, funding, settlement, refunds, reentrancy, повторные claims, deadlines и несколько раундов. Критическая ошибка в исходнике по коду не установлена, но из-за блокировки тестов выпуск в mainnet не одобрен этим обзором.
- Исправлены выбор testnet/mainnet на страницах создания/списка групп, защита от подписи в неверной сети, npm lint/check для Windows; сохранены дизайн и видимый бейдж Arc Studio.
- Добавлены `.env.example`, `.gitignore`, mainnet read-only скрипты, документация сайта, сценарий видео и черновик заявки.
- `npm run contracts:test` — 152 PASS; `npm run lint`, `npm run typecheck`, `npm run build` — PASS; HTTP 200 на localhost; Vercel JSON и синтаксис mainnet JS файлов — PASS.
- Тестовый контракт и хэши доступны только как **архивные записи**: [testnet contract](https://explorer.testnet.arc.io/address/0x329cc6b4adf9e136c4b254d1e46fbe228c0b01da), [deploy tx](https://explorer.testnet.arc.io/tx/0xf73e8dc997d4a7ad455f73e267ba8fe0dbf5f4f4dd0c2d0d72cadce451622350), lifecycle hashes в `docs/test-results/testnet-e2e.md`. Сеть из окружения их не подтвердила.
- GitHub: https://github.com/jayrayeducation/arc-atomic-closeout. Владелец сообщил сайт https://arc-atomic-closeout.vercel.app/; sandbox не смог открыть его. Mainnet контракт, mainnet tx и видео: **PENDING**.

## Оставшиеся ошибки и ограничения

1. Тестирование: контрактная suite PASS, но отдельный native `forge build` падает после компиляции на global signature cache. Bun отсутствует, RPC `EACCES`, Chromium не найден; browser/wallet e2e не выполнен. Архивные тестовые/UI evidence не заменяют live проверку.
2. Из зависимостей npm сообщает 89 уязвимостей (49 high). Нужна оценка достижимости и безопасные обновления с повторным build.
3. Архивные PNG повреждены. Нужны новые реальные скриншоты/видео с меткой сети.
4. Публичный GitHub уже существует, локальный author настроен на `jayrayeducation` с ID-based noreply. Новый commit/push MetaMask-исправления блокирован: обязательная команда `gh api user --jq .login` не достигает TCP 443. До повторной проверки аккаунта не публиковать изменения. Точный текст предупреждения и причина классификации ещё не установлены; см. `METAMASK_SECURITY_AUDIT_RU.md`.
5. Предположение о сроке 1 ноября 2026 есть в публичных анонсах, однако точное время и условия на официальной DoraHacks странице не проверены.

## Следующая финансовая стадия — только после отдельного разрешения

Подробная последовательность из 12 транзакций и локальная оценка gas: `docs/MAINNET_PLAN_RU.md`. Это расчёт на mock USDC; фактический максимальный расход определяется только после read-only Arc RPC preflight с адресами владельца.

**Сеть:** Arc Mainnet, chain ID 5042, RPC `https://rpc.mainnet.arc.io`, USDC ERC-20 `0x3600000000000000000000000000000000000000`, 6 decimals; gas в native USDC с 18 decimals. [Сеть](https://docs.arc.io/integrate/connect-to-arc), [адреса](https://docs.arc.io/arc/references/contract-addresses), [комиссии](https://docs.arc.io/arc/references/gas-and-fees).

**Отправитель:** PENDING — публичный адрес авторизованного владельца. **Назначение:** размещение `AtomicCloseout.sol` через собственный keystore/hardware wallet; затем только новый проверенный адрес контракта. **Сумма:** 0 USDC в операции размещения, позже пример около 0.20 USDC всего в escrow (по 0.10 от двух должников). **Gas и максимальные расходы:** PENDING — определить на свежем RPC через `node scripts/mainnet-deploy.mjs <deployer-address>` и gas estimates для реальных вызовов; до этого точные максимумы недоступны. Минимальный сценарий: 1 deploy + 1 create + 1 propose + 3 approve plan + 2 approve USDC + 2 fund + 1 finalize + 1 withdraw = **12 транзакций** с тремя контролируемыми кошельками. Каждая проверяется успешным receipt, событием контракта, балансом USDC и `totalLocked`; finalization и withdraw проверяются отдельно. Ни один шаг не выполнен.

**Участие владельца:** предоставить точный текст/скриншот MetaMask warning без личных данных, восстановить разрешённый сетевой доступ к GitHub для публикации исправления и проверить новый публичный Vercel bundle после push; предоставить только публичный адрес собственного mainnet deployer и трёх контролируемых кошельков; обеспечить исправную среду Bun/Arc Foundry/RPC и перепроверить официальный deadline. После полного preflight отдельно утвердить mainnet deployment, каждую группу реальных USDC операций и отправку DoraHacks заявки. Секреты не передавать в чат.
