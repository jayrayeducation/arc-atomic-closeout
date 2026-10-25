# Публикация сайта

Статус: **READY после успешного production build; публичного URL пока нет**.

1. Владелец подтверждает хостинг и аккаунт. Не использовать ранее подключённые аккаунты других участников.
2. В хостинге указать root `source/`, install `npm install --legacy-peer-deps`, build `npm run build`, output `dist/`. Эти настройки и SPA rewrite находятся в `vercel.json`; `.vercelignore` исключает локальные секреты при CLI-загрузке. Проект Vite, без серверного API.
3. Задать только переменные из `.env.example` в панели Vercel. Не переносить локальный `.env`; mainnet адрес/блок заполнять только после `mainnet-verify`. `npm run build` отклонит отсутствующую testnet конфигурацию и неполную пару mainnet адрес/блок.
4. Hash router использует `#/...`; SPA fallback для этих маршрутов не требуется. Для произвольного URL настроить отдачу `index.html`.
5. Перед публикацией проверить `npm run typecheck`, `npm run build`, адреса RPC, chain ID 5042/5042002, адрес контракта, ссылки explorer, выбор сети, кошелёк, мобильный экран и `Built with Arc Studio`.
6. Попросить у владельца отдельное подтверждение публичного deployment. После публикации открыть **публичный HTTPS URL**, повторить сценарий с чистым браузером и занести URL/результат в release report.

Локальный `localhost` и preview Arc Studio не считаются публичным сайтом.
