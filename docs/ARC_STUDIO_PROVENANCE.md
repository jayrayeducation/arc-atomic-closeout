# Происхождение Arc Studio

- Исходный проект: https://studio.arc.io/app/c6e2330d-8e2f-44aa-935c-a9859f922a5e?thread=fe457d3b-009c-4455-8cd0-7944598e9009
- Архив: `atomic_closeout_arc_studio_o0esu6.zip` в родительском каталоге `source/`.
- SHA-256 ZIP: `e845a395b9dcebf722ee286d0e8f8d118e17e4704978c3347455c997cad4629a`.
- Контракт из архива: `contracts/AtomicCloseout.sol`; SHA-256 `ac11dd2cfbd5485574a0e9f12c8bb8c77e729bd3a8bbc2dc5eb73b5de8a7b80c`. Файл совпадает с ZIP побайтно; изменений контракта Codex нет, diff пуст.
- По документации архива тестовый контракт: `0x329cc6b4adf9e136c4b254d1e46fbe228c0b01da`, Arc Testnet `5042002`, блок `69040767`; [транзакция размещения](https://explorer.testnet.arc.io/tx/0xf73e8dc997d4a7ad455f73e267ba8fe0dbf5f4f4dd0c2d0d72cadce451622350).
- Тестовые транзакции создания, согласования, финансирования, finalization, withdraw и refund перечислены с полными хэшами в `docs/test-results/testnet-e2e.md` и `docs/test-results/ui-e2e.json`. Эти записи получены из архива. Текущая среда блокирует RPC, поэтому независимая повторная проверка хэшей пока `PENDING`.

Полученные из Studio файлы: `src/`, `contracts/`, `scripts/`, `tests/`, `tests-ui/`, `docs/test-results/`, `docs/screenshots/`, `lib/`, `broadcast/`, `README.md`, `AGENTS.md`, `foundry.toml`, `vite.config.ts`, `bun.lock`, `src/onchain-facts.ts` и остальные файлы исходного ZIP. Исходные скриншоты, артефакты и история в архиве сохранены локально. Артефакты сборки и закрытые данные исключаются только из будущего публичного Git.

Изменения Codex после распаковки: конфигурация публикации и игнорирования закрытых файлов, явный выбор сети в UI, проверка сети кошелька перед подписью, ссылка-бейдж на конкретный Studio project, безопасные read-only скрипты mainnet, документация выпуска и отчёты. Они нужны для безопасного выпуска за пределами Studio. Эти правки **не** выдаются за действия внутри Arc Studio.

После публикации Codex ограничил загрузку исходных `src/tracing.ts` и `src/console-capture.ts` только iframe исходного Studio origin: публичный сайт больше не переопределяет `window.ethereum.request` и `fetch`. Оригинальные файлы Studio сохранены; Solidity-контракт и его diff относительно ZIP не менялись. Причина и проверка описаны в `docs/METAMASK_SECURITY_AUDIT_RU.md`.
