# Work

Этот файл хранит только live execution state. Он не является backlog, blueprint или историей.

## Свежесть live state

- Последняя проверка этого файла по worktree reality: 2026-04-25
- Последняя проверка blockers/dependencies: 2026-04-25
- Следующая revalidation для blocked items: n/a

## Текущий режим

- Workflow mode: normal
- Разрешенные workflow modes: setup | normal | repair
- Audit overlay: none
- Разрешенные audit overlay values: none | requested | active-read-only | approved-for-apply
- Фокус аудита: n/a
- Почему сейчас: old `docs/contracts/*` удалены после переноса runtime truth в `.aidp/contracts/*`; no active work remains.

## Проверки закрытия route

- `.aidp/os.yaml` initialization flag: true
- `.aidp/os.yaml` placeholder flag: false
- Setup route: закрыт 2026-04-24
- Repair route: закрыт 2026-04-24
- Current route: `normal`

## Текущая память

- NewsPortal — pnpm polyglot monorepo with Astro web/admin, FastAPI API, Node fetchers/relay/MCP, Python workers/ML/indexer, PostgreSQL, Redis/BullMQ and Docker Compose local baseline.
- PostgreSQL is durable business truth; Redis/BullMQ, HNSW, snapshots, queues and cache are derived/runtime state.
- Canonical AIDP runtime truth lives in `.aidp/*`; root/tool router files must remain thin.
- Product/reference docs remain under `docs/product`; runtime-agent contracts live under `.aidp/contracts/*`.
- Stateful proof must follow `.aidp/contracts/test-access-and-fixtures.md`.
- Старые contract materials проверены, перенесены в `.aidp/contracts/*` and then дополнены source-code-owned contracts for auth/session, notifications/digests and runtime/migrations/indexes.

## Планирование capabilities

### Активные capabilities

None.

## Активное execution state

### Primary active item

- ID: none
- Parent capability: n/a
- Почему это primary active work: n/a

### Secondary active item

- ID: none
- Почему существует: n/a
- Разрешенные overlap paths: n/a
- Условие выхода к одному primary item: n/a

### Согласованность worktree

- Worktree status: mixed
- Alignment note: current dirty tree is explained by completed AIDP bootstrap/repair, product/reference docs cleanup, root proof aliases, lint-fix changes discovered by the requested gates, completed product-local test contour implementation, and completed `docs/contracts` deletion.
- Scope warning: `.codex/config.toml` remains pre-existing/unowned by this AIDP work; do not revert it without explicit user request.
- Legacy docs note: product/reference docs were kept as reference material and cleaned from stale old runtime-doc links; legacy runtime docs deletion remains part of the bootstrap migration state.
- Required action before ordinary implementation: create a new active item with scope, allowed paths, risk and proof.

### Активные риски

- Risk 1: Compose/integration gates are stateful and can create users, rows, queues, images, containers, volumes or external-provider artifacts; use the test-access contract and record cleanup.
- Risk 2: auth/session, notification/delivery and runtime/migration/index boundaries have AIDP contracts; future changes must load the matching contract before implementation.
- Risk 3: existing large orchestration pressure zones must not grow casually; future work must apply `.aidp/engineering.md` architecture review triggers.

### Известные gaps

- Fact gap: production deploy process is not declared in root scripts.
- Proof gap: no separate package/release command is declared.

### Наблюдения этой сессии

- Active item `PRODUCT-LOCAL-TEST-CONTOUR-2026-04-24` opened to implement the requested local internal product testing contour without Telegram/email/API ingestion lanes.
- Implemented product-local root scripts: `pnpm test:product:local:core`, `pnpm test:product:local:full`, `pnpm test:product:local:cleanup`.
- Added `infra/scripts/test-product-local.mjs` to run env preflight, command orchestration and `/tmp/newsportal-product-local-<mode>-<runId>.json|md` evidence artifacts.
- Narrowed `pnpm test:website:admin:compose` to mandatory website/resources acceptance only; API source ingestion, inbound Email IMAP ingestion and Telegram ingestion are now parked for this contour.
- Added `docs/product/operator/local-product-testing.md` and updated operator docs/README/AIDP proof map to state current RSS/website focus and parked lanes.
- Root scripts, package-level scripts, tests, smoke harnesses, compose files and source-code boundaries were audited and consolidated into `.aidp/os.yaml` and `.aidp/verification.md`.
- Product/reference docs were kept under `docs/` and cleaned so local markdown links point to existing repository files.
- User confirmed old `docs/contracts/*` should be deleted; files and empty directory were removed, and surviving product docs link to `.aidp/contracts/*`.
- Initial `pnpm lint` failed on 43 lint issues across Astro/admin pages, infra proof scripts and fetcher code; minimal behavior-preserving fixes restored the gate.
- `pnpm typecheck` completed with zero errors; Astro reported existing hint/deprecation notices only.
- `pnpm unit_tests` completed successfully: TS 245/245 and Python 265/265.
- `pnpm test:mvp:internal` completed successfully, including compose startup, migrations, relay phases, RSS ingest, worker smoke path, browser-style auth checks, admin flows, fresh ingest and cleanup.

### Подтверждено для консолидации

- AIDP setup and repair are complete -> `.aidp/os.yaml`, `.aidp/work.md`, `.aidp/history.md`.
- Tool-facing router files must stay thin and Russian-readable -> root `AGENTS.md` and `.aidp/adapters/*`.
- Stateful test model is required durable runtime context -> `.aidp/contracts/test-access-and-fixtures.md`.
- Deep contracts and source-code-owned boundaries are consolidated -> `.aidp/contracts/*`, `.aidp/blueprint.md`, `.aidp/engineering.md`, `.aidp/verification.md`, `.aidp/os.yaml`.
- Architecture quality bar and proof checklist are consolidated -> `.aidp/engineering.md` and `.aidp/verification.md`.
- Verification proof surface coverage is consolidated -> `.aidp/os.yaml`, `.aidp/verification.md` and root `package.json` proof aliases.

### Parked / latent items

- None currently owned by live work.

### Память попыток

- Сработало, с evidence: docs local markdown link check passed for 36 files; `pnpm lint`; `pnpm typecheck`; `pnpm unit_tests`; `pnpm test:mvp:internal`.
- Пробовали и не сработало: first `pnpm lint` failed on 43 lint issues; fixes were applied and the command passed on rerun.
- Еще не выполнялось: broad integration/live-provider gates outside the requested MVP internal smoke; production deploy and package/release proof because no such root commands are declared.
- Product-local proof executed this session: `node --check infra/scripts/test-product-local.mjs`; `node --check infra/scripts/test-website-admin-flow.mjs`; targeted ESLint for changed harnesses; `pnpm test:product:local:cleanup`; `node infra/scripts/test-product-local.mjs --mode=core --preflight-only`; `node infra/scripts/test-product-local.mjs --mode=full --preflight-only`; `pnpm lint:ts`.
- Product-local evidence artifacts from implementation proof: `/tmp/newsportal-product-local-core-6fd0a54c.json|md`, `/tmp/newsportal-product-local-full-00f25bc1.json|md`, `/tmp/newsportal-product-local-cleanup-b0d39c46.json|md`.
- Product-local full proof executed after follow-up test request: `pnpm test:product:local:core` passed with artifact `/tmp/newsportal-product-local-core-ea611ff8.json|md`; escalated `pnpm test:product:local:full` passed with artifact `/tmp/newsportal-product-local-full-6d7fccc5.json|md`; `pnpm test:product:local:cleanup` passed with artifact `/tmp/newsportal-product-local-cleanup-c8548794.json|md`; `pnpm dev:mvp:internal:down` stopped the remaining compose stack.
- Product-local fixes from full proof: isolated phase4 smoke criteria so unrelated system criteria cannot block `article.criteria.matched`; stabilized admin article UI audit by forcing a recent-failures article surface; preserved parked ingestion lanes while still testing outbound Mailpit email digest delivery.
- First non-escalated `pnpm test:product:local:full` was invalid because sandbox blocked localhost sockets, Docker socket and DNS; rerun with escalated permissions passed.

### Следующее рекомендуемое действие

- Следующий шаг: wait for the operator’s next product/code request and create a fresh active item before implementation.
- Почему это следующее: no active work remains after deleting old duplicate contract docs.

### Статус archive sync

- Completed item или capability awaiting archive sync: none
- Почему еще live: n/a
- Требуемое archive action: none
- Expected archive destination/index label: latest completed item archived as `AIDP-DOCS-CONTRACTS-DELETE-2026-04-25`.

### Test artifacts and cleanup state

- Users created: temporary anonymous/user/admin identities during `pnpm test:mvp:internal`; harness reported cleanup of the allowlisted Firebase admin identity.
- Subscriptions or device registrations: test notification/digest channels created inside the disposable compose database.
- Tokens / keys / credentials issued: temporary test credentials only inside the MVP harness flow.
- External registrations or webhooks: none recorded beyond Firebase test identity lifecycle used by the harness.
- Seeded or imported data: disposable compose PostgreSQL data created by migrations, seeds and MVP smoke.
- Cleanup status: `pnpm test:mvp:internal` stopped compose.dev and removed PostgreSQL/Redis volumes; final product-local proof wrote `/tmp/newsportal-product-local-*` evidence artifacts, `pnpm test:product:local:cleanup` passed, and `pnpm dev:mvp:internal:down` stopped the remaining compose stack after the full contour.
- Residual cleanup note: temporary AIDP release package folder is absent.

## Handoff state

- Current item status: no active item.
- Уже доказано: AIDP runtime core initialized/repaired; contracts migrated; source audit, architecture hardening, verification coverage, docs cleanup and requested gates complete.
- Еще не доказано или blocked: production deploy/package proof unavailable because commands are not declared; Telegram ingestion, inbound Email IMAP ingestion, API source ingestion and `youtube` remain parked/future lanes.
- Scope/coordination warning для следующего агента: dirty worktree contains completed AIDP/docs/proof changes plus pre-existing `.codex/config.toml`; do not revert unrelated changes.

### Недавно изменено

- 2026-04-24 — Initialized AIDP runtime core for NewsPortal in Russian and moved route from `setup` to `normal`.
- 2026-04-24 — Consolidated real commands, runtime surfaces, proof expectations and stateful test access into `.aidp/*`.
- 2026-04-24 — Migrated old deep contracts into `.aidp/contracts/*` and added source-code-owned contracts.
- 2026-04-24 — Completed architecture engineering hardening with quality bar, no-god-object rules, magic-constant rules and architecture proof checklist.
- 2026-04-24 — Completed verification surface coverage audit and added root aliases for existing automation, website matrix and UI audit harnesses.
- 2026-04-24 — Cleaned product/reference docs from stale old runtime-doc links and fixed one broken discovery example link.
- 2026-04-24 — Fixed lint failures surfaced by final proof and passed lint, typecheck, unit tests and MVP internal smoke.
- 2026-04-24 — Implemented and executed local product testing contour without Telegram/email/API ingestion lanes; `core` and escalated `full` passed with evidence artifacts, and compose stack was stopped after proof.
- 2026-04-25 — Deleted old duplicate `docs/contracts/*` after redirecting surviving product-doc links to `.aidp/contracts/*`.

## Active work index

No active work items.
