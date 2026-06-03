# Blueprint

## Свежесть

- Последняя проверка по реальности репозитория: 2026-04-24
- Проверил: Codex
- Следующий trigger пересмотра: изменение архитектуры ingest/selection/discovery/runtime surfaces, команд root QA или delivery baseline.

## Назначение системы

NewsPortal — локальный MVP polyglot content-platform monorepo для приема источников, нормализации и дедупликации контента, zero-shot selection, personalization, operator/admin workflows, discovery source acquisition и локального single-host runtime через Docker Compose.

Система строится вокруг PostgreSQL как единственного source of truth. Redis + BullMQ используются как transport/runtime coordination, а HNSW индексы, snapshots, очереди и cache являются пересобираемым derived state.

## Продуктовый смысл

Продукт должен давать пользователю и оператору управляемую новостную/content platform:

- источники `rss`, `website`, `api`, `email_imap` можно добавлять и проверять через admin/operator surfaces;
- ingest сохраняет raw/document observations и материализует пригодные для чтения content/article/resource rows;
- selection pipeline отделяет system-selected content от personalization;
- пользовательские matches, saved/digest/following/notification surfaces строятся поверх уже допущенного системного слоя;
- оператор видит health, discovery, fetch history, LLM usage, reindex и moderation/maintenance surfaces.

Система полезна только если selection truth, source truth, replay/backfill и operator visibility остаются объяснимыми и воспроизводимыми.

## Техническая модель

### Runtime-поверхности

- `apps/web` — Astro SSR web app, пользовательские страницы и BFF routes.
- `apps/admin` — Astro SSR admin app, operator/admin UI и same-origin BFF writes.
- `services/api` — FastAPI read/debug/maintenance API.
- `services/fetchers` — Node/TypeScript ingest runtime для RSS, website/http, external API и IMAP-polled email feeds.
- `services/relay` — Node/TypeScript outbox relay, migrations и routing tests.
- `services/workers` — Python BullMQ workers для normalize, dedup, embed, clustering, filtering, final selection, notifications, discovery и sequence engine.
- `services/ml` — shared Python ML/feature extraction/compiler logic.
- `services/indexer` — HNSW rebuild/check tooling.
- `services/mcp` — Node MCP control-plane service для operator tooling.

### Общие пакеты

- `packages/contracts` — TypeScript contracts для health/auth/source/content/queue/user/system-interest boundaries.
- `packages/config` — shared config helpers.
- `packages/sdk` — typed SDK surface для API/control-plane consumers.
- `packages/control-plane` — admin/control-plane orchestration shared by admin and MCP.
- `packages/ui` — shared React/Radix/lucide UI primitives.

### Delivery/runtime baseline

- `infra/docker/compose.yml` — canonical local stack baseline.
- `infra/docker/compose.dev.yml` — dev overlay with `.env.dev` and Mailpit.
- `infra/docker/*.Dockerfile` — service images.
- `infra/nginx/default.conf` — local single-host front door.
- `database/migrations` — ordered SQL migration truth.
- `database/ddl` — current schema snapshots.

## Операционная схема

1. Operators configure channels/sources in admin or through API/control-plane surfaces.
2. Fetchers poll due channels, persist raw observations/resources/articles in PostgreSQL, and emit thin outbox events.
3. Relay polls `outbox_events` and dispatches thin BullMQ jobs, currently including sequence-managed routing through `q.sequence`.
4. Workers read thin jobs, load authoritative state from PostgreSQL, write derived processing results, preserve inbox idempotency, and emit follow-up outbox events when needed.
5. API/admin/web read materialized truth from PostgreSQL and derived index snapshots when relevant.
6. Reindex/backfill and discovery flows are explicit operator-visible maintenance capabilities, not hidden side effects.

## Ключевые инварианты

- PostgreSQL owns business truth; queues, cache, HNSW files and snapshots are derived/runtime state.
- Redis + BullMQ are transport only and must not become the authoritative state layer.
- Jobs should remain thin; workers load heavy payloads from PostgreSQL.
- Outbox/inbox idempotency must remain visible for asynchronous side effects.
- Firebase identifies web/admin users, but local PostgreSQL users/roles own authorization truth after bootstrap.
- `web_resources` are first-class website/resource truth; they must not be silently converted into RSS/articles.
- `final_selection_results` is primary selection implementation truth; compatibility projections must stay bounded and observable.
- System-selected content and user-personalized matches are separate layers.
- Historical replay/backfill must not silently send retro notifications.
- Discovery is safe-by-default and disabled unless explicitly enabled through runtime env.
- Browser-assisted website handling is opt-in and must not bypass unsupported login/CAPTCHA/manual challenge boundaries.
- Admin authorization bootstraps from Firebase allowlist but local PostgreSQL remains authorization truth after bootstrap.

## Карта границ

- UI/BFF boundary: Astro pages/components may orchestrate user/admin flows, but database and external writes must go through local server-side modules or declared API/control-plane paths.
- Public API vs admin/operator API: FastAPI read/maintenance surfaces and admin BFF writes have different trust and authorization assumptions.
- Fetchers vs workers: fetchers acquire/persist raw/source/resource observations; workers own processing, selection, notifications and discovery orchestration.
- Relay vs workers: relay routes thin jobs; workers own processing semantics.
- PostgreSQL vs derived state: migrations/schema own durable state; HNSW, snapshots, queues and cache are rebuildable.
- Source model vs provider adapters: provider-specific RSS/website/API/email behavior must not leak as unbounded special cases across the product.
- System selection vs personalization: personalization consumes system-selected/canonical content and must not bypass system gates.
- Product docs vs AIDP runtime: product docs can explain operator/product behavior; AIDP runtime truth for agents lives in `.aidp/*`.
- Auth/session boundary: web anonymous sessions, admin password sign-in, cookies, allowlist and nginx `/admin` routing must stay visibly separated.
- Notification/digest boundary: immediate web push/Telegram notifications and scheduled email digests share channel storage but have separate delivery semantics and proof risks.

## Boundary/invariant references

Перед изменениями, которые пересекают durable boundary, агент должен прочитать этот раздел и соответствующий deep contract, если он есть.

- Architecture/runtime surfaces: смотри `Техническая модель`, `Runtime-поверхности`, `Delivery/runtime baseline`.
- Data/state ownership: смотри `Ключевые инварианты`, `PostgreSQL vs derived state`, `.aidp/contracts/runtime-migrations-and-derived-state.md`.
- API/control-plane/admin writes: смотри `UI/BFF boundary`, `Public API vs admin/operator API`, `.aidp/contracts/mcp-control-plane.md`, `.aidp/contracts/auth-session-boundary.md`.
- Source/content pipeline: смотри `Fetchers vs workers`, `Source model vs provider adapters`, `.aidp/contracts/feed-ingress-adapters.md`, `.aidp/contracts/content-model.md`, `.aidp/contracts/article-pipeline-core.md`.
- Selection/personalization/discovery: смотри `System selection vs personalization`, `.aidp/contracts/zero-shot-interest-filtering.md`, `.aidp/contracts/universal-selection-profiles.md`, `.aidp/contracts/discovery-agent.md`.
- Notifications/digests: смотри `Notification/digest boundary`, `.aidp/contracts/notifications-and-digests.md`.
- Test/runtime boundary: смотри `.aidp/contracts/test-access-and-fixtures.md`, `.aidp/engineering.md` section `Разделение production source, tests и fixtures`.
- AIDP/process truth: смотри `Product docs vs AIDP runtime`; durable AIDP truth живет только в `.aidp/*`, routers/adapters остаются thin.
- Planning/spec artifacts: проверяй tool-native plans, Spec Kit outputs, tickets, PRDs and external specs against relevant blueprint boundaries before implementation; они не могут менять durable architecture truth без consolidation в правильный owner-файл.

## Когда читать blueprint перед изменениями

Blueprint context обязателен до writes, которые меняют или могут изменить:

- architecture или service/package ownership;
- public/internal API, BFF, SDK, MCP tools, queue/event contracts;
- database schema, migrations, state ownership или derived-state model;
- runtime surfaces, Docker/compose/nginx/env, startup/health or packaging boundaries;
- auth/session/admin authorization, notification delivery, discovery/live-provider policy;
- production/test fixture boundaries or production image contents;
- durable AIDP/runtime documentation boundaries.

Если подходящего blueprint context нет, не выдумывай. Запиши gap в `.aidp/work.md`, подтверди reality по репозиторию и только затем обновляй правильный owner-файл.

## Durable boundary summary

- Architecture boundary: `apps/*`, `services/*`, `packages/*`, `database/*`, `infra/*` имеют разные reasons-to-change и не должны смешиваться ради удобства.
- Ownership boundary: fetchers own acquisition/raw persistence; relay owns dispatch/routing; workers own processing/selection/notifications/discovery; API/admin/web expose or orchestrate declared surfaces.
- API boundary: shared vocabulary belongs in `packages/contracts`, `packages/sdk`, `packages/control-plane` or explicit server modules, not hidden cross-service imports.
- State/data boundary: PostgreSQL owns business truth; Redis/BullMQ/HNSW/snapshots/cache are transport or derived state.
- Runtime boundary: compose/nginx/env/health scripts define local delivery baseline; proof harnesses and fixtures are dev/test inputs, not production runtime content.
- Packaging boundary: production Dockerfiles must not copy `tests/**`, `infra/scripts/**` or `infra/fixtures/**`; package/release proof remains a declared gap until real release commands exist.
- AIDP/process boundary: `.aidp/*` owns runtime truth for agents; root/tool routers, monitor output, human-docs and product docs are adapters or observations and must not become a second canon.

<!-- aidp-monitor:start aidp_blueprint_index v1 -->
```yaml
aidp_blueprint_index:
  schema: 1
  projection_status: current
  durable_risks:
    - id: BP-RISK-ASYNC-PIPELINE-ROUTING
      area: async_pipeline_routing
      severity: high
      status: tracked
      owner_section: ".aidp/blueprint.md#зоны-риска"
      review_trigger: "before relay/BullMQ/sequence/outbox/inbox changes"
    - id: BP-RISK-DATABASE-MIGRATIONS
      area: database_migrations_and_schema_repair
      severity: high
      status: tracked
      owner_section: ".aidp/blueprint.md#зоны-риска"
      review_trigger: "before migration/schema/data repair"
    - id: BP-RISK-DISCOVERY-LIVE-LLM-BUDGET
      area: discovery_live_search_llm_budget
      severity: medium
      status: tracked
      owner_section: ".aidp/blueprint.md#зоны-риска"
      review_trigger: "before discovery/live-provider/LLM budget changes"
    - id: BP-RISK-AIDP-SECOND-CANON
      area: aidp_process_truth
      severity: medium
      status: tracked
      owner_section: ".aidp/blueprint.md#durable-boundary-summary"
      review_trigger: "before AIDP/router/monitor/human-doc migration"
  canonical_neighborhoods:
    - id: UI-ADMIN
      name: "Admin UI work"
      owner_section: ".aidp/blueprint.md#канонические-neighborhoods-для-типовой-работы"
      refs:
        - "apps/admin"
        - "packages/ui"
        - "packages/control-plane"
    - id: API-CONTROL-PLANE
      name: "API/control-plane work"
      owner_section: ".aidp/blueprint.md#канонические-neighborhoods-для-типовой-работы"
      refs:
        - "services/api"
        - "services/mcp"
        - "packages/sdk"
        - "packages/control-plane"
    - id: SOURCE-DISCOVERY-SELECTION
      name: "Fetcher/discovery/selection work"
      owner_section: ".aidp/blueprint.md#канонические-neighborhoods-для-типовой-работы"
      refs:
        - "services/fetchers"
        - "services/workers"
        - ".aidp/contracts/discovery-agent.md"
        - ".aidp/contracts/article-pipeline-core.md"
    - id: DELIVERY-RUNTIME
      name: "Delivery/runtime work"
      owner_section: ".aidp/blueprint.md#канонические-neighborhoods-для-типовой-работы"
      refs:
        - "infra/docker"
        - "infra/nginx"
        - ".env.example"
  durable_boundaries:
    - id: DB-SOURCE-OF-TRUTH
      name: "PostgreSQL owns business truth"
      owner_section: ".aidp/blueprint.md#ключевые-инварианты"
      risk: high
    - id: SOURCE-VS-PROCESSING
      name: "Fetchers own acquisition; workers own processing/selection"
      owner_section: ".aidp/blueprint.md#карта-границ"
      risk: medium
    - id: SYSTEM-SELECTION-VS-PERSONALIZATION
      name: "System-selected content and personalization are separate layers"
      owner_section: ".aidp/blueprint.md#ключевые-инварианты"
      risk: medium
    - id: AIDP-RUNTIME-TRUTH
      name: ".aidp/* owns agent runtime truth; routers/docs/monitor are not canon"
      owner_section: ".aidp/blueprint.md#durable-boundary-summary"
      risk: medium
```
<!-- aidp-monitor:end -->

## Структурные правила

- Keep package/service responsibilities visible; avoid dumping orchestration into vague shared helpers.
- Database migrations are ordered source changes; DDL snapshots are derived/reference and must not outrank migrations.
- Queue event names and payload contracts belong in `packages/contracts`.
- Cross-surface write behavior should reuse `packages/control-plane` or explicit server modules rather than duplicate SQL in UI routes.
- Discovery/selection/website/browser-assisted behavior with durable complexity should have or use a deep contract under `.aidp/contracts/`.

## Модель capabilities

Durable capability lines that often need staged work:

- Content ingestion: source/channel management, fetchers, raw observations, resource/article persistence and outbox emission.
- Article/canonical pipeline: normalize, dedup, canonical documents, story clusters, verification and replay.
- Selection and personalization: selection profiles, interest filters, final selection, system feed compatibility, user-interest matches.
- Notifications and digests: web push, Telegram, email digest, preferences, delivery logs and cleanup discipline.
- Discovery acquisition: vNext runs, typed artifacts, candidates, probe reports, source understanding, routing decisions, source inventory, adapter backlog, replay and rollback.
- Content analysis and gating: persisted NER/entities, labels, analysis results, configurable content filter policies and dry-run/enforce gate explainability.
- Operator/admin control plane: admin UI, FastAPI maintenance endpoints, MCP service and audit logging.
- Runtime delivery: compose stack, migrations, health checks, nginx, Mailpit and local proof gates.

## Канонические neighborhoods для типовой работы

- UI/admin work: `apps/admin`, `packages/ui`, `packages/control-plane`, relevant API/BFF server modules, `.aidp/verification.md`.
- User web work: `apps/web`, `packages/ui`, `packages/sdk`, user BFF/server modules.
- API work: `services/api/app/main.py`, `packages/sdk`, affected database migrations/contracts.
- Fetcher/source work: `services/fetchers`, `packages/contracts/src/source.ts`, `.aidp/contracts/test-access-and-fixtures.md` if stateful proof is used.
- Worker/selection/discovery work: `services/workers`, `services/ml`, database migrations, relevant contract docs.
- Relay/queue work: `services/relay`, `packages/contracts/src/queue.ts`, worker smoke tests.
- Delivery work: `infra/docker`, `infra/nginx`, `.env.example`, root scripts.

## Зоны риска

- Async pipeline routing: relay, BullMQ queues, sequence engine and inbox/outbox idempotency; requires structural or integration proof.
- Database migrations and schema repair: can corrupt durable truth; requires migration smoke and targeted API/worker proof.
- Discovery live search/LLM budget: external cost and nondeterminism; keep flags safe-by-default and use bounded compose proof.
- Browser-assisted websites: can drift into unsupported crawling; keep fetchers-owned and opt-in.
- Admin/session/auth boundary: affects authorization; prove with admin/session flows.
- Notifications/web push/email/Telegram: creates persistent artifacts and external side effects; track cleanup.
- HNSW/index rebuilds: derived but operationally important; prove rebuild/check commands when touched.

## Запрещенные shortcuts

- Treating Redis/BullMQ, HNSW files, cache or generated DDL as source of truth.
- Enqueuing large payloads instead of thin jobs plus PostgreSQL reads.
- Adding direct cross-service synchronous REST calls for heavy internal processing without an explicit architectural decision.
- Letting discovery auto-register risky sources without review/policy gates.
- Letting personalization bypass system selection.
- Hiding behavior changes inside a "refactor".
- Leaving stateful test artifacts untracked.
- Duplicating AIDP runtime truth in root router files or product docs.
- Treating planning/spec artifacts, Plan Mode output, Spec Kit, tickets or PRDs as durable architecture truth without blueprint consolidation.

## Deep contracts

Текущие AIDP deep contracts:

- `.aidp/contracts/article-pipeline-core.md`
- `.aidp/contracts/auth-session-boundary.md`
- `.aidp/contracts/browser-assisted-websites.md`
- `.aidp/contracts/content-analysis-and-gating.md`
- `.aidp/contracts/content-model.md`
- `.aidp/contracts/discovery-agent.md`
- `.aidp/contracts/feed-ingress-adapters.md`
- `.aidp/contracts/mcp-control-plane.md`
- `.aidp/contracts/notifications-and-digests.md`
- `.aidp/contracts/runtime-migrations-and-derived-state.md`
- `.aidp/contracts/test-access-and-fixtures.md`
- `.aidp/contracts/universal-selection-profiles.md`
- `.aidp/contracts/universal-task-engine.md`
- `.aidp/contracts/zero-shot-interest-filtering.md`

Old long-form product contracts from `docs/contracts/` were migrated into `.aidp/contracts/*` and then deleted from `docs/` to avoid a second source of truth.

## Когда обновлять

Обновляй этот файл только при изменении долговечной архитектурной истины: purpose, runtime surfaces, boundaries, invariants, structural rules, capability model или risk zones.
