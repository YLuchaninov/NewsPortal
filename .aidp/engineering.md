# Engineering

## Свежесть

- Последняя проверка по реальности репозитория: 2026-04-24
- Проверил: Codex
- Следующий trigger пересмотра: изменение workspace/package structure, proof commands, runtime boundaries или stateful test model.

## Назначение

Этот файл описывает долговечную инженерную дисциплину NewsPortal. Он не является backlog, proof log или историей. Архитектурный смысл живет в `.aidp/blueprint.md`, machine-readable команды — в `.aidp/os.yaml`, proof policy — в `.aidp/verification.md`.

## Общие принципы

- Делай минимальное честное изменение под declared active item.
- Сначала зафиксируй route, scope, allowed paths и proof; потом меняй код.
- Сохраняй существующие границы сервисов и пакетов, если work item явно не меняет архитектуру.
- Не называй behavior change refactor-ом.
- Предпочитай явные contracts и typed/shared boundaries скрытой связности.
- Не добавляй новый общий слой, если ответственность можно оставить локальной и понятной.
- Если durable truth меняется, обновляй правильный `.aidp/*` owner-файл в том же sync cycle.
- Архитектурное качество оценивай через явные quality attributes: modifiability, reliability, security, performance efficiency, operational excellence and cost/complexity tradeoffs.
- Любая архитектурная правка должна назвать affected concern, stakeholder/consumer, boundary, tradeoff and proof. Если это нельзя объяснить, изменение еще не готово.

## Архитектурный quality bar

NewsPortal должен развиваться как профессиональная, гибкая и масштабируемая система. Это означает:

- high cohesion: модуль имеет одну понятную причину меняться и один основной уровень абстракции;
- low coupling: модуль знает минимум о чужих data shapes, env, SQL details, queues and UI assumptions;
- explicit contracts: межсервисные и cross-package boundaries проходят через `packages/contracts`, `packages/control-plane`, server modules или deep contracts, а не через устные договоренности;
- information hiding: изменяемые решения прячутся за маленькими interfaces/functions, а не протекают во все call sites;
- bounded context: source ingestion, selection, personalization, discovery, auth/session, delivery and runtime/indexing остаются разными domains;
- evolvability: новое поведение добавляется через narrow extension points, adapters или cohesive modules, а не через расширение монолитного dispatcher;
- operational clarity: retry, timeout, concurrency, batching, idempotency, health and telemetry decisions должны быть видимыми и проверяемыми.

Архитектурное изменение непрофессионально, если оно делает код короче локально, но увеличивает hidden coupling, implicit state, unknown blast radius или future migration cost.

## Запрет god objects и god modules

God object/module запрещен. В этом репозитории это означает: один файл, class, route, worker module или script не должен одновременно владеть parsing, validation, persistence, orchestration, external calls, retry policy, formatting and UI/API response semantics.

Правила:

- Новый код не должен увеличивать уже крупные orchestration hotspots без явного extraction plan.
- Если touched file уже больше примерно 800 строк или содержит несколько unrelated responsibilities, добавляй новое cohesive behavior в отдельный module, helper или package boundary, если это не ломает scope.
- Если touched file больше примерно 1500 строк, любое нетривиальное добавление должно либо вынести локальную ответственность, либо записать в `.aidp/work.md`, почему extraction отложен.
- Existing pressure zones, обнаруженные source audit: `services/api/app/main.py`, `services/workers/app/main.py`, `services/workers/app/discovery_orchestrator.py`, `services/fetchers/src/web-ingestion.ts`, `services/fetchers/src/fetchers.ts`, `services/mcp/src/tools.ts`, large admin pages and compose/live proof scripts. Их не надо рефакторить без active item, но нельзя использовать как оправдание для дальнейшего роста.
- Не создавай static/container classes или namespace objects только ради группировки functions/constants; используй module scope and named exports.
- Не добавляй broad `utils`, `helpers`, `common`, `manager`, `service` modules без узкого имени и declared responsibility.
- Оркестратор может координировать steps, но не должен владеть внутренней business logic каждого step.

## Magic numbers, magic strings и configuration

Magic numbers and magic strings запрещены, кроме очевидных локальных literals без domain-смысла (`0`, `1`, empty string, simple boolean branches) и SQL placeholders.

Правила:

- Domain numbers должны быть named constants с units in name: `*_MS`, `*_SECONDS`, `*_LIMIT`, `*_BATCH_SIZE`, `*_CONCURRENCY`, `*_RETRY_*`.
- Runtime-tunable values должны читаться в config modules (`packages/config`, service-specific `config.ts`/`config.py`, `.env.example`) and validated/coerced once.
- Значения timeout, retry, concurrency, batch size, poll interval, token budget, page size and cost limit не должны быть разбросаны по call sites.
- Constants in TypeScript use module-level `CONSTANT_CASE` when they are durable constants; Python constants use module-level upper snake case.
- String enums, event names, queue names, channel types, provider types, status values and route-level state machines belong in typed contracts or local narrow enums/unions.
- Repeated SQL fragments or status literals should become named local constants only when reuse clarifies ownership; do not make a global constant dump.
- Defaults that affect runtime behavior must be reflected in `.env.example`, config code and relevant contract/verification text when durable.

## Правила modularity and decomposition

- Split by reason-to-change, not by technical trivia. A parser, repository, adapter, policy evaluator, renderer and delivery client are different responsibilities when they can change independently.
- Prefer small pure functions for parsing/normalization/policy decisions; keep side effects at explicit boundaries.
- Keep database access behind repository-like local modules when a flow has more than one route/API/worker consumer.
- Keep external provider adapters behind interfaces or cohesive modules; provider-specific quirks must not leak into product-wide logic.
- Keep UI components declarative; data loading, validation, persistence and authorization live in server modules/BFF/API/control-plane code.
- Keep long workflows readable by naming steps and passing explicit typed state, not mutable catch-all objects.
- Avoid boolean parameter clusters; prefer named option objects or discriminated unions when behavior has modes.
- Avoid hidden bidirectional dependencies. If module A needs module B and module B needs module A, introduce a narrower contract or move shared vocabulary into the correct package.
- Do not introduce an abstraction until it removes real duplication, isolates volatility, or creates an extension point already demanded by the active item.

## Дисциплина scalability and resilience

- Preserve asynchronous boundaries for heavy processing: use outbox/relay/BullMQ/worker flows instead of direct synchronous cross-service work.
- Jobs remain thin and reload authoritative state from PostgreSQL.
- Every new loop over database rows, sources, resources, articles, users or notifications must have an explicit bound, pagination/cursor, batch size or backpressure story.
- Every external call must have timeout, error classification, retry/backoff policy or explicit no-retry rationale.
- Concurrency must be bounded and configurable when it can affect CPU, network, DB connections, provider limits or queue pressure.
- Idempotency is required for retries, replay, outbox/inbox consumers, migrations, delivery attempts and cleanup scripts.
- Scale-out assumptions must be honest: no hidden in-memory singleton should become business truth or cross-worker coordination mechanism.
- Observability belongs with scalable behavior: important async paths need structured status, health, metrics/log context or durable audit rows.

## Дисциплина types and state machines

- TypeScript cross-boundary modes should use discriminated unions or explicit enum-like const arrays plus exhaustiveness checks when practical.
- Avoid broad `Record<string, unknown>` beyond parsing edges; normalize quickly into typed objects.
- Do not silence null/undefined by truthiness when empty string, zero or empty list are valid domain values; narrow explicitly.
- Python data crossing module boundaries should use dataclasses, typed mappings or narrow dict shapes with normalization near the edge.
- Status transitions must be explicit. If a state can be `queued`, `running`, `sent`, `failed`, `skipped`, etc., define legal values and update proof when adding a value.
- Error handling should preserve domain context and not collapse all failures into generic `Exception`/`Error` without status detail.

## Триггеры architecture review

Before implementation, strengthen design/proof if the work does any of these:

- adds or changes a service/package boundary;
- adds a new provider/channel/adapter/status/event/queue;
- adds long-running jobs, polling loops, batch processing or retries;
- changes auth/session/authorization, notification delivery, discovery, selection, migrations or indexing;
- makes a large file larger instead of extracting a cohesive responsibility;
- introduces new env/config values;
- introduces new shared helpers or abstractions;
- changes data ownership between PostgreSQL, Redis, HNSW, cache, queues or generated artifacts.

For these triggers, `.aidp/work.md` must record the architecture decision, tradeoff and proof expectation before code changes continue.

## Структура репозитория

- `apps/web` и `apps/admin` — Astro SSR apps с React islands, shared UI и server-side BFF modules.
- `services/fetchers`, `services/relay`, `services/mcp` — Node/TypeScript services.
- `services/api`, `services/workers`, `services/ml`, `services/indexer` — Python runtime/tooling.
- `packages/contracts`, `packages/config`, `packages/sdk`, `packages/control-plane`, `packages/ui` — workspace packages.
- `database/migrations` — ordered SQL truth.
- `infra/docker`, `infra/nginx`, `infra/scripts` — delivery and proof tooling.
- `tests/unit/ts` и `tests/unit/python` — deterministic unit proof.

## Дисциплина границ

- UI components should not own persistence semantics. Put server/database behavior in BFF server modules, API/control-plane modules or service code.
- Admin write orchestration should prefer `packages/control-plane` or existing admin server modules over duplicate SQL.
- Queue event names and payload shape belong in `packages/contracts/src/queue.ts`.
- Source/channel config contracts belong in `packages/contracts/src/source.ts` and provider-specific fetcher modules.
- Python workers own processing semantics; relay owns dispatch/routing only.
- Fetchers own acquisition and raw/resource persistence, not downstream selection semantics.
- API read/maintenance surfaces should expose materialized PostgreSQL truth rather than recompute hidden business logic per request.
- Derived state must remain reconstructable from PostgreSQL or declared source inputs.

## TypeScript discipline

- Use existing pnpm workspace package boundaries before inventing new imports.
- Keep Astro server-side modules explicit; avoid leaking browser-only code into server paths or server secrets into client code.
- Preserve strict TypeScript expectations from `tsconfig.base.json`.
- Keep shared contract exports stable and typed when other services consume them.
- Use existing UI primitives in `packages/ui` for product screens; avoid raw browser-default controls where the app already has a design-system primitive.

## Python discipline

- Keep `services/api` read/maintenance API concerns separate from `services/workers` processing concerns.
- Keep ML/compiler helpers in `services/ml` when they are shared by worker/indexing paths.
- Worker smoke helpers may create deterministic fixtures, but cleanup or residual tracking is part of the work.
- Prefer explicit SQL and data-shape handling over hidden global state.
- For indexing/rebuild tools, treat HNSW/snapshot outputs as derived artifacts.

## Database and migrations

- Add ordered SQL migrations under `database/migrations` for durable schema changes.
- Keep migrations as the source of schema evolution; DDL snapshots are reference/derived state.
- Migration changes require at least migration smoke proof and usually targeted API/worker proof.
- Do not silently rewrite existing migrations unless the active item is explicitly pre-release repair and the risk is represented.

## Async и side effects

- Use outbox/inbox idempotency for asynchronous business side effects.
- Keep BullMQ payloads thin and reload authoritative state from PostgreSQL.
- Do not add hidden retry loops that bypass visible queue/run state.
- Notification, web push, email, Telegram, Firebase and external search/LLM work require explicit environment and cleanup awareness.
- Auth/session changes must preserve separation between Firebase identity proof and local PostgreSQL authorization truth.
- Notification/digest changes must persist delivery status/errors and must not create hidden external side effects.

## Discovery и browser-assisted website discipline

- Discovery remains safe-by-default; live search or LLM paths must be gated by explicit env/config and bounded proof.
- Browser-assisted website handling belongs to fetchers-owned website/browser paths and must remain opt-in.
- Login/CAPTCHA/manual challenge bypass is out of scope unless a human explicitly changes product policy.
- Discovery candidate promotion must use the same PostgreSQL/source/outbox discipline as normal channel onboarding.

## Refactor discipline

- Refactor only inside declared scope.
- Strengthen proof when refactor touches service boundaries, contracts, database schema, queue routing or stateful side effects.
- If a file becomes a dumping ground for unrelated responsibilities, split only when the active item can honestly absorb that scope and proof.
- Do not combine broad cleanup with unrelated feature work.

## Stateful test discipline

Use `.aidp/contracts/test-access-and-fixtures.md` whenever work touches compose-backed state, Firebase/session bootstrap, Mailpit, web push, notification channels, imported datasets, source channels or other persistent artifacts.

Persistent artifacts created by proof must be removed or recorded in `.aidp/work.md` before clean close.

## Runtime, migrations and derived state discipline

- Treat `database/migrations` as ordered schema truth and `database/ddl` as reference snapshots.
- Use relay migration smoke before trusting schema changes.
- Treat HNSW index files and snapshots as derived artifacts; rebuild/check them through root index scripts when affected.
- Prefer nginx-routed local proof for changes that affect path prefixes, cookies, admin routing, MCP HTTP or API front-door behavior.

## Deep contract discipline

If a subsystem requires more detail than this compact core can hold, create or update a file under `.aidp/contracts/`. Current product/reference contracts under `docs/contracts/` may be used as observations, but runtime-agent canon should be migrated into `.aidp/contracts/` when it becomes required for active work.

## Proof expectations по типу engineering change

- Low-risk local TS/Python logic: targeted unit/static proof.
- UI/BFF change: typecheck or build plus targeted unit/flow proof; use viewport/browser proof for layout-sensitive surfaces.
- API/worker/fetcher/relay change: unit/static proof plus targeted smoke/integration proof.
- Migration/schema change: migration smoke plus affected read/write path proof.
- Compose/delivery change: compose startup or relevant service health proof.
- Discovery/browser/external integration change: bounded compose smoke plus explicit residual gap review.

## Запрещенные shortcuts

- Дублировать SQL/write behavior across admin, MCP, API and scripts without a shared boundary reason.
- Treating generated output as primary source truth.
- Adding broad env surface without documenting proof and safe defaults.
- Leaving hidden persistent test residue.
- Depending on chat memory for repository truth.
- Updating product docs while leaving `.aidp/*` stale when runtime-agent truth changed.
