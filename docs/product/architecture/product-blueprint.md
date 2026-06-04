# Product Blueprint

Этот документ описывает суть SignalOps. Он не пытается сохранить историю всех идей и не заменяет код, миграции или `.aidp/*`. Его задача проще: быстро объяснить, что строится, почему система устроена именно так и какие решения нельзя случайно размыть.

## Идея продукта

SignalOps — платформа для управляемого отбора контента.

Она принимает материалы из разных источников, приводит их к понятной модели, убирает дубликаты, группирует события, отбирает полезное через zero-shot rules/profiles и показывает результат пользователю и оператору.

Главная ценность системы — не “скачать новости”. Ценность в том, чтобы оператор мог объяснить:

- откуда пришел материал;
- как он прошел обработку;
- почему он попал или не попал в общий поток;
- какие части результата можно переиграть, пересобрать или проверить.

## Базовые решения

| Область | Решение |
| --- | --- |
| Данные | PostgreSQL хранит бизнес-истину |
| Очереди | Redis + BullMQ используются как transport |
| Async flow | PostgreSQL outbox -> relay -> BullMQ -> workers |
| Frontend | Astro SSR для `web` и `admin` |
| Fetching | Node/TypeScript fetchers |
| Processing | Python workers и shared ML/indexer tooling |
| Локальный runtime | Docker Compose single-host baseline |
| Auth | Firebase identity + локальные PostgreSQL users/roles |
| Selection | System selection отдельно от user personalization |
| Discovery | Выключен по умолчанию, включается явно и работает через review/policy gates |
| Task execution | Sequence runtime исполняет зарегистрированные TaskPlugins с contract metadata |
| Ingress adapters | Catalog + channel binding выбирают adapter; legacy JSON остается diagnostic evidence |

## Данные и владение truth

PostgreSQL владеет долговечными бизнес-данными:

- users, roles, sessions and preferences;
- source channels and provider config;
- raw/document observations;
- signal_candidates and website resources;
- deduplicated documents, clusters and verification;
- selection, matching and notification rows;
- Discovery vNext runs, artifacts, candidates, source inventory, policies, adapter backlog, replay and rollback;
- sequence definitions and sequence runs;
- audit and delivery logs.

Производные слои можно пересобрать:

- BullMQ queues;
- Redis runtime state;
- HNSW indexes and snapshots;
- caches;
- generated DDL snapshots;
- local test artifacts.

Если данные нельзя восстановить без него, это не должно жить только в Redis, queue payload или generated file.

## Сервисы

`apps/web` показывает system-selected collection, personalized matches, saved/following surfaces и notification-related user flows.

`apps/admin` дает оператору channels, rules/templates, signal_candidates, clusters, resources, reindex, discovery, observability и BFF writes.

`services/fetchers` опрашивает источники, нормализует provider-specific вход, сохраняет observations/resources/signal-candidates и пишет outbox events.

`services/relay` читает `outbox_events`, применяет routing contracts и публикует тонкие jobs в BullMQ.

`services/workers` выполняет тяжелую обработку: normalize, dedup, embed, cluster, selection, LLM review, notifications, discovery и sequence runtime.

`services/api` дает read/debug/maintenance API поверх материализованной PostgreSQL-правды.

`services/mcp` открывает operator control-plane для MCP-клиентов с token scopes и bounded tools.

`packages/contracts` держит общий словарь типов. `packages/control-plane` держит shared write orchestration для admin/MCP. `packages/ui` держит UI primitives.

## Content model

Система работает не только со “статьями”.

RSS и editorial website rows могут материализоваться как `signal_candidates`. Website path дополнительно сохраняет `web_resources`: найденные страницы, документы, newsroom items, downloads и другие resource-level факты.

Это важно, потому что не каждый полезный website resource обязан быть полноценной новостной статьей. Оператор должен видеть resource-level truth, browser/static provenance и enrichment/projection status.

Website path должен оставаться cheap-first: static discovery, classification and enrichment идут раньше browser assistance. Browser fallback включается явно, оставляет provenance visible и не используется для обхода login/CAPTCHA/manual challenge. `article-extractor` не является общим parser для всего website lane; resource shape важнее списка “хороших” доменов.

## Selection model

Selection идет системным слоем до персонализации.

1. Raw/document observation фиксирует входной факт.
2. Deduplicated document layer убирает duplicate pressure.
3. Story cluster группирует близкие события.
4. Verification и filters оценивают качество и релевантность.
5. `interest_filter_results` хранит per-filter evidence.
6. `final_selection_results` решает, попадает ли материал в system-selected collection.
7. User personalization работает только поверх уже допущенного системного слоя.

Практический смысл: пользовательские matches не должны обходить системный gate, а system feed не должен зависеть от случайного user-interest состояния.

## LLM и серые зоны

LLM — не основной двигатель системы. Он нужен для спорных случаев.

Gray-zone review включается только там, где policy, env и budget разрешают внешний вызов. Решение сохраняется с контекстом, чтобы оператор мог понять расход и причину.

Если LLM выключен или бюджет исчерпан, система должна вести себя явно: hold, suppress или env-defined fallback, но не скрытый “магический match”.

## Discovery model

Discovery нужен для source acquisition: найти потенциальные источники, проверить кандидатов и дать оператору контролируемое продвижение.

Discovery vNext uses typed artifacts and deterministic routing. It must not automatically turn an uncertain external result into an active ingestion source without policy-backed routing and probation handoff.

Candidate recovery — важный принцип для discovery и selection. Система не должна решать релевантность только по репутации источника: шумный источник иногда дает ценный сигнал, а хороший источник может дать обычный шум. Правильный поток: wide ingest -> document/resource interpretation -> dedup/cluster context -> candidate routing -> gray-zone or LLM adjudication when allowed -> final selection.

Для разбора слабого candidate recovery полезнее смотреть типы потерь: obvious noise, ordinary non-match, candidate for review, strong match candidate, selected but low-confidence, rejected after review. Это рабочий язык для оператора и инженера; он не обязан быть точным enum в коде.

## Sequence runtime

Длинные workflows проходят через sequence runtime, когда им нужен видимый multi-step execution.

```text
outbox event or operator action
-> active sequence lookup
-> sequence_run
-> q.sequence job
-> worker sequence runner
-> sequence_task_runs
-> durable result in PostgreSQL
```

Sequence runtime нужен не ради “плагинов”, а ради наблюдаемости и переиспользования: signal_candidate processing, discovery, reindex/backfill, enrichment and bounded operator-created sequences могут использовать один механизм.

Принципы:

- jobs остаются тонкими;
- sequence definitions, runs and task status живут в PostgreSQL;
- worker читает authoritative context из базы, а не из queue payload;
- ошибка шага должна быть видна в run/task status;
- каждый executable step проходит через зарегистрированный `TaskPlugin`, который публикует options/context/output schema, output caps, retry classification and error codes;
- API/admin/MCP показывают plugin contract metadata через sequence plugin discovery, но это не означает произвольную загрузку кода из UI или БД;
- sequence runtime не должен стать новым монолитом для любой бизнес-логики.

## Ingress adapter model

Ingress adapter identity теперь живет в каталоге и binding:

```text
ingress_adapter_catalog
-> source_channel_adapter_binding
-> fetchers adapter resolver
-> provider poller / declarative recipe / builtin adapter
```

`source_channel_adapter_binding.adapter_key` — active adapter-selection truth. Legacy RSS `config_json.adapterStrategy` and API `adapterKey` values can remain in stored channel JSON as migration/diagnostic evidence, but active runtime and read models should resolve through a valid enabled binding or provider default.

Declarative adapters are intentionally bounded: JSON/NDJSON API sources, GET or static non-secret JSON POST, selectors/mappings, bounded pagination and dry-run preview. They do not accept uploaded code, JS/WASM execution, secret-bearing adapter config or hidden persistence during dry-run.

## Operator model

Оператор должен видеть:

- health источников и overdue/failure state;
- последние fetch runs;
- resources и signal_candidates отдельно;
- selection reasons and diagnostics;
- LLM usage and budget;
- reindex/backfill progress;
- discovery cost, candidates and promotion state;
- notification/digest delivery state.

Если важный async path нельзя объяснить через UI/API/log/audit row, его нужно считать недостаточно операторским.

## Runtime и delivery

Основной локальный контур:

```sh
pnpm dev:mvp:internal
```

Он поднимает PostgreSQL, Redis, Mailpit, migrate, relay, fetchers, worker, API, web, admin, MCP и nginx.

Production deploy-команда в репозитории отдельно не объявлена. Поэтому confidence по delivery строится через compose/build/smoke gates, а не через несуществующий release ritual.

## Ограничения

- Не добавлять внутренний synchronous REST между Node и Python для тяжелой обработки вместо outbox/queue flow.
- Не делать Redis/BullMQ источником бизнес-истины.
- Не отправлять большие payloads в jobs.
- Не смешивать provider-specific quirks с общей product logic.
- Не превращать discovery в скрытый auto-registration crawler.
- Не делать personalization bypass для system selection.
- Не рассылать retro notifications во время historical replay/backfill.
- Не использовать docs как второй runtime contract рядом с `.aidp/*`.

## Что считается хорошей документацией для этой системы

Хороший документ отвечает на четыре вопроса:

1. Что это за часть системы?
2. Почему она существует?
3. Какие решения или ограничения здесь принципиальны?
4. Как человек проверит, что все работает?

Все остальное должно жить в коде, тестах, миграциях или runtime contracts.
