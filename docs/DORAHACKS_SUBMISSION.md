# DoraHacks: Arc Microgrants Round 2 — черновик заявки

**Название:** Atomic Closeout
**Tagline:** Close group expenses with a shared plan and real USDC settlement on Arc.

**Проблема:** приложения учёта расходов показывают долг, но не обеспечивают единое согласование финальных сумм и проверяемую выплату.

**Решение:** группа фиксирует расходы, участники утверждают точный план, должники финансируют escrow, после полного финансирования раунд финализируется, кредитор отдельно получает USDC. При неполном финансировании после срока доступны индивидуальные возвраты.

**Технологии:** Arc Studio; Solidity 0.8.28 / Foundry; React / Vite / TypeScript; wagmi / viem; шестизначный ERC-20 интерфейс native USDC; точная целочисленная модель и хэш плана.

**Почему Arc:** native USDC оплачивает gas, а ERC-20 интерфейс даёт allowance и `transferFrom` для escrow; быстрый проверяемый onchain расчёт.

**Почему Arc Studio:** исходные контракт, приложение, тесты и testnet deployment созданы в Studio. [Проект](https://studio.arc.io/app/c6e2330d-8e2f-44aa-935c-a9859f922a5e?thread=fe457d3b-009c-4455-8cd0-7944598e9009); дальнейшие внешние правки описаны в `ARC_STUDIO_PROVENANCE.md`.

| Материал | Статус |
|---|---|
| Новый публичный GitHub владельца `arc-atomic-closeout` | PENDING |
| Публичный HTTPS сайт | PENDING |
| Mainnet contract address | PENDING |
| Mainnet transaction evidence с реальным USDC | PENDING |
| Видео 90–120 c | сценарий готов, запись PENDING |
| Публичный builder profile | PENDING — предоставляет владелец |
| Testnet deployment | `0x329cc6b4adf9e136c4b254d1e46fbe228c0b01da`, архивный evidence |

## Проверка условий, 25.10.2026

Официальная [страница конкурса](https://dorahacks.io/hackathon/arc-microgrants-2/detail) из этого окружения возвращает HTTP 405; точное время окончания, формат формы, eligibility, лимит проектов и призовые условия **не удалось независимо подтвердить**. Публикации Arc указывают закрытие **1 ноября 2026**, но точный час и перевод на Киев — **PENDING**. До подачи владелец должен открыть официальную страницу под своим аккаунтом, сверить правила и заполнить поля формы. Требования Arc Studio, Arc Mainnet и реального USDC считать неподтверждёнными до этой проверки; в любом случае соответствующее mainnet evidence пока отсутствует. Заявка не отправлена.
