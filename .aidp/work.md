# Work

Этот файл хранит только live execution state. Он не является backlog, blueprint или историей.

## Свежесть live state

- Последняя проверка этого файла по worktree reality: 2026-04-27
- Последняя проверка blockers/dependencies: 2026-04-27
- Следующая revalidation для blocked items: n/a

## Текущий режим

- Workflow mode: normal
- Разрешенные workflow modes: setup | normal | repair
- Audit overlay: none
- Разрешенные audit overlay values: none | requested | active-read-only | approved-for-apply
- Фокус аудита: n/a
- Почему сейчас: ARCH-HOTSPOT-REFACTOR-CAPABILITY завершена; final full proof прошел, stack cleanup выполнен, контейнеров не осталось.

## Проверки закрытия route

- `.aidp/os.yaml` initialization flag: true
- `.aidp/os.yaml` placeholder flag: false
- Setup route: закрыт 2026-04-24
- Repair route: закрыт 2026-04-25 after live-state/docs cleanup repair
- Current route: `normal`

## Текущая память

- NewsPortal — pnpm polyglot monorepo with Astro web/admin, FastAPI API, Node fetchers/relay/MCP, Python workers/ML/indexer, PostgreSQL, Redis/BullMQ and Docker Compose local baseline.
- PostgreSQL is durable business truth; Redis/BullMQ, HNSW, snapshots, queues and cache are derived/runtime state.
- Canonical AIDP runtime truth lives in `.aidp/*`; root/tool router files must remain thin.
- Product/reference docs remain under `docs/product`; runtime-agent contracts live under `.aidp/contracts/*`.
- Stateful proof must follow `.aidp/contracts/test-access-and-fixtures.md`.
- Old duplicate `docs/contracts/*` were migrated into `.aidp/contracts/*` and deleted from `docs/`.

## Планирование capabilities

### Активные capabilities

- none

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

- Worktree status: dirty with completed but uncommitted content-analysis implementation, Hybrid Structured Extraction, honest-green harness/docs/test hardening, completed architecture hotspot refactor capability and AIDP proof records.
- Alignment note: dirty tree is expected to remain limited to the universal content-analysis layer, repo-owned live proof hardening, completed architecture hotspot refactor work and AIDP state records.
- Scope warning: do not run broad `git clean -fdX`; ignored `.env.*`, `.idea`, `node_modules`, `dist`, `.astro`, `data/models`, `data/snapshots` and other runtime/build artifacts may be locally useful and must only be removed by explicit targeted request.
- Required action before ordinary implementation: none for this capability; choose the next route/item from fresh user request and revalidate worktree reality first.

### ARCH-HOTSPOT-REFACTOR-BATCH-1-API-ROUTES

- Kind: Stage
- Status: completed
- In scope: start API decomposition by moving FastAPI route registration out of `services/api/app/main.py` into cohesive route modules while preserving route paths, response shapes and existing service/read-model functions; keep compatibility exports for tests.
- Out of scope: DB migrations, route/path/schema changes, content-analysis behavior refactor, discovery semantics changes, queue/event changes, UI changes, full service-function extraction beyond what is required for safe route registration.
- Allowed paths: `.aidp/work.md`, `services/api/app/main.py`, new `services/api/app/routes/*`, targeted Python tests only if import compatibility requires them.
- Risk: medium-high, because FastAPI route registration touches many maintenance/public API surfaces but is intended to be behavior-preserving.
- Required proof: `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `pnpm test:product:local:core`; `git diff --check --`; cleanup with `pnpm dev:mvp:internal:down` and empty `docker ps` if compose stack remains running.
- Acceptance criteria: met.
- Сработало, с evidence: moved FastAPI route registration out of `services/api/app/main.py` into domain route modules under `services/api/app/routes/` while keeping route handler/service functions and compatibility exports in `main.py`; `/health` remains the only direct decorator in `main.py`.
- Сработало, с evidence: `pnpm unit_tests:py`, `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed after the API route split.
- Сработало, с evidence: targeted direct handler tests passed through `PYTHONPATH=. python -m unittest tests.unit.python.test_api_sequence_management tests.unit.python.test_api_sequence_agent tests.unit.python.test_api_discovery_management tests.unit.python.test_content_analysis`.
- Сработало после remediation: initial `pnpm test:product:local:core` run `307d3446` failed because nested sequence route handlers used postponed local Pydantic annotations and returned 400/422 for sequence create paths; removing postponed annotations from `sequence_routes.py` fixed Admin/MCP sequence creation.
- Сработало, с evidence: clean rerun `pnpm test:product:local:core` passed on run `43293bf5`, 11/11 lanes green, with artifacts `/tmp/newsportal-product-local-core-43293bf5.json` and `/tmp/newsportal-product-local-core-43293bf5.md`.
- Cleanup completed: `pnpm dev:mvp:internal:down` removed the compose stack after Batch 1 proof; final `docker ps` returned only the header row and no running containers.

### ARCH-HOTSPOT-REFACTOR-BATCH-2-WORKER-BOOTSTRAP

- Kind: Stage
- Status: completed
- In scope: reduce `services/workers/app/main.py` by moving non-content-analysis worker processors/helpers into cohesive modules while preserving queue names, task keys, public function imports and monkeypatch surfaces.
- Out of scope: content-analysis module refactor, DB migrations, queue/event semantic changes, discovery runtime decomposition, fetcher/admin/proof script refactors.
- Allowed paths: `.aidp/work.md`, `services/workers/app/main.py`, new or existing focused worker modules under `services/workers/app/`, targeted Python tests only if compatibility imports require them.
- Risk: high, because worker bootstrap/processor imports affect async runtime and sequence execution.
- Required proof: `pnpm unit_tests:py`; `pnpm integration_tests`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; cleanup with `pnpm dev:mvp:internal:down` and empty `docker ps` if compose stack remains running.
- Acceptance criteria: met.
- Сработало, с evidence: extracted worker queue/event/index constants into `services/workers/app/worker_queues.py` and worker bootstrap/runtime scheduling into `services/workers/app/worker_bootstrap.py`, leaving `services/workers/app/main.py` as the compatibility owner for imports, monkeypatch surfaces and public worker functions.
- Сработало, с evidence: `python -m py_compile services/workers/app/main.py services/workers/app/worker_bootstrap.py services/workers/app/worker_queues.py` and `python -m ruff check services/workers/app/main.py services/workers/app/worker_bootstrap.py services/workers/app/worker_queues.py` passed.
- Сработало, с evidence: `pnpm unit_tests:py` passed 286 Python tests after the worker bootstrap split.
- Сработало, с evidence: `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed after the worker bootstrap split.
- Сработало, с evidence: `pnpm integration_tests` / `pnpm test:mvp:internal` passed, including migration smoke, relay routing, RSS ingest, normalize/dedup, interest/criterion compile, cluster/match/notify, browser-style auth/admin/web flows, deterministic fetches and enrichment retry.
- Cleanup completed: `pnpm dev:mvp:internal:down` found no remaining compose stack after the integration script cleanup, and final `docker ps` returned only the header row with no running containers.

### ARCH-HOTSPOT-REFACTOR-BATCH-3-FETCHERS-WEBSITE

- Kind: Stage
- Status: completed
- In scope: split `services/fetchers/src/web-ingestion.ts` into cohesive internal modules while preserving its public exports and caller/test behavior.
- Out of scope: source ingestion semantics changes, browser discovery behavior changes, public API/export renames, proof verdict weakening, DB migrations, API/worker/discovery/admin refactors.
- Allowed paths: `.aidp/work.md`, `services/fetchers/src/web-ingestion.ts`, new focused modules under `services/fetchers/src/`, targeted TypeScript tests only if import compatibility requires them.
- Risk: medium-high, because website ingestion touches external-source handling, browser-assisted discovery, cache/challenge paths and resource persistence.
- Required proof: `pnpm unit_tests:ts`; `pnpm test:ingest:compose`; `pnpm test:website:compose`; `pnpm test:hard-sites:compose`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; cleanup with `pnpm dev:mvp:internal:down` and empty `docker ps` if compose stack remains running.
- Acceptance criteria: met.
- Сработало, с evidence: extracted request/header authorization helpers into `services/fetchers/src/web-ingestion-headers.ts` and URL/resource classification heuristics into `services/fetchers/src/web-ingestion-classification.ts`, while keeping `services/fetchers/src/web-ingestion.ts` as the public compatibility aggregator/export surface.
- Сработало, с evidence: `services/fetchers/src/web-ingestion.ts` shrank from 3015 lines to 2725 lines; new focused modules are 270 lines for classification and 52 lines for headers.
- Сработало, с evidence: `pnpm unit_tests:ts` passed 246 TypeScript tests, including website-ingestion classification, request-header auth, collection extraction, cache and browser-assisted discovery tests.
- Сработало, с evidence: `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed after the website ingestion split; typecheck reported only existing Astro hints and no errors.
- Сработало после remediation: initial `pnpm test:ingest:compose` failed because the compose stack was intentionally stopped (`service "fetchers" is not running`); after `pnpm dev:mvp:internal` started the canonical dev stack, the rerun passed.
- Сработало, с evidence: `pnpm test:ingest:compose`, `pnpm test:website:compose` and `pnpm test:hard-sites:compose` passed on the rebuilt fetchers image.
- Cleanup completed: `pnpm dev:mvp:internal:down` removed the compose stack after Batch 3 proof, and final `docker ps` returned only the header row with no running containers.

### ARCH-HOTSPOT-REFACTOR-BATCH-4-ADMIN-DISCOVERY-UI-BFF

- Kind: Stage
- Status: completed
- In scope: split `apps/admin/src/pages/discovery.astro` into a server view-model plus tab/section components while preserving the visual UI, route path, form names, BFF actions and payload shapes.
- Out of scope: UI redesign, discovery product semantics changes, API/MCP/runtime refactors, live proof harness changes, DB migrations.
- Allowed paths: `.aidp/work.md`, `apps/admin/src/pages/discovery.astro`, new focused Admin server/view/component modules under `apps/admin/src/`, targeted TypeScript tests only if compatibility imports require them.
- Risk: medium, because the page coordinates many discovery forms but should remain a behavior-preserving view decomposition.
- Required proof: `pnpm unit_tests:ts`; `pnpm test:discovery:admin:compose`; `pnpm test:web:ui-audit`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; cleanup with `pnpm dev:mvp:internal:down` and empty `docker ps` if compose stack remains running.
- Acceptance criteria: met.
- Сработало, с evidence: extracted discovery page data loading, pagination/link helpers and selected workspace state into `apps/admin/src/lib/server/discovery-page-view-model.ts`, while preserving `apps/admin/src/pages/discovery.astro` markup, route path, form names, BFF actions and payload shapes.
- Сработало, с evidence: targeted `pnpm --filter @newsportal/admin typecheck` passed after fixing missing destructured locals from the new view-model.
- Сработало, с evidence: `pnpm unit_tests:ts` passed 246 TypeScript tests after the Admin discovery page split.
- Сработало, с evidence: `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed after the Admin discovery page split; typecheck reported only existing Astro hints and no errors.
- Сработало, с evidence: `pnpm test:discovery:admin:compose` passed and exercised Admin discovery profile/class/mission updates, graph compile/run, candidate approval, feedback, recall mission creation/promotion and delete/archive/reactivate flows.
- Сработало после remediation: initial `pnpm test:web:ui-audit` run `747bb96b` failed in the unrelated web `/matches` save-toggle wait; rerun `70baae26` on the same healthy stack passed, including web button coverage and Admin button coverage. Discovery action buttons remained covered by `test:discovery:admin:compose` as reported by the audit artifact.
- Cleanup completed: `pnpm dev:mvp:internal:down` removed the compose stack after Batch 4 proof, and final `docker ps` returned only the header row with no running containers.

### ARCH-HOTSPOT-REFACTOR-BATCH-5-DISCOVERY-RUNTIME

- Kind: Stage
- Status: completed
- In scope: split `services/workers/app/discovery_orchestrator.py` into graph mission runtime, recall runtime, candidate evaluation, quota/cost helpers and repository boundaries while preserving graph-first/recall semantics, proof profiles, fixtures and yield policy.
- Out of scope: content-analysis implementation refactor, discovery product behavior changes, proof verdict logic changes, EXAMPLES/fixtures changes, DB migrations, public API/MCP route/tool renames.
- Allowed paths: `.aidp/work.md`, `services/workers/app/discovery_orchestrator.py`, new focused discovery runtime modules under `services/workers/app/`, targeted Python tests only if compatibility imports require them.
- Risk: high, because discovery runtime affects queue/runtime behavior and live proof boundaries.
- Required proof: `pnpm unit_tests:py`; `pnpm test:discovery-enabled:compose`; `pnpm test:discovery:admin:compose`; `pnpm test:discovery:examples:compose`; `pnpm test:discovery:yield:compose`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; then checkpoint `pnpm test:product:local:full`; cleanup with `pnpm dev:mvp:internal:down` and empty `docker ps`.
- Acceptance criteria: met.
- Сработало, с evidence: extracted discovery cost/metadata helpers into `services/workers/app/discovery_cost_helpers.py`, candidate/context assessment helpers into `services/workers/app/discovery_candidate_evaluation.py`, and recall URL/probe helpers into `services/workers/app/discovery_recall_runtime.py`; `services/workers/app/discovery_orchestrator.py` remains the compatibility owner and imports the focused helpers.
- Сработало, с evidence: `services/workers/app/discovery_orchestrator.py` shrank from 3821 lines to 3533 lines; new focused modules are 45 lines for cost helpers, 119 lines for candidate evaluation and 175 lines for recall runtime.
- Сработало, с evidence: `python -m py_compile services/workers/app/discovery_orchestrator.py services/workers/app/discovery_cost_helpers.py services/workers/app/discovery_candidate_evaluation.py services/workers/app/discovery_recall_runtime.py` passed before compose proof.
- Сработало, с evidence: `pnpm unit_tests:py` passed 286 Python tests after the discovery runtime split.
- Сработало, с evidence: `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed after the discovery runtime split; typecheck reported only existing Astro hints and no errors.
- Сработало после remediation: initial `pnpm test:discovery-enabled:compose` failed because the compose worker service was not running; after `pnpm dev:mvp:internal` started the canonical dev stack, the rerun passed with status `discovery-enabled-ok`.
- Сработало, с evidence: `pnpm test:discovery:admin:compose`, `pnpm test:discovery:examples:compose` and `pnpm test:discovery:yield:compose` passed after the split; standalone examples/yield artifacts included `/tmp/newsportal-live-discovery-examples-645adf9d.json`, `/tmp/newsportal-live-discovery-yield-proof-f792ed10.json` and their `.md` companions.
- Сработало после диагностики и cleanup: first checkpoint `pnpm test:product:local:full` run `6f1880e7` failed only in `integration_tests` because the dirty live stack had stale Redis `q.sequence` backlog and pending `article.ingest.requested` rows from previous live proof runs; evidence was recorded through product artifacts `/tmp/newsportal-product-local-full-6f1880e7.json` and `.md`, Redis queue keys, worker logs and DB queue state.
- Сработало после clean disposable reset: `pnpm dev:mvp:internal:down:volumes` cleared the stale proof state, `docker ps` was empty, and clean checkpoint `pnpm test:product:local:full` passed on run `cfb49680`, 17/17 lanes green, writing `/tmp/newsportal-product-local-full-cfb49680.json` and `/tmp/newsportal-product-local-full-cfb49680.md`.
- Сработало, с evidence: clean full checkpoint included discovery examples artifact `/tmp/newsportal-live-discovery-examples-c3ea02e3.json`, yield artifact `/tmp/newsportal-live-discovery-yield-proof-0f051abc.json`, MCP live artifact `/tmp/newsportal-mcp-http-live-af6a1388-69a5-4a32-a10c-ea51b644cf6a.json`, and classified website-matrix external-source blocks as expected residuals.
- Cleanup completed: `pnpm dev:mvp:internal:down` removed the compose stack after Batch 5 proof, and final `docker ps` returned only the header row with no running containers.

### ARCH-HOTSPOT-REFACTOR-BATCH-6-PROOF-HARNESS

- Kind: Stage
- Status: completed
- In scope: split large proof scripts into shared testkit/case runners while preserving deterministic scenario order, acceptance criteria, artifact schema and verdict logic; move MCP scenarios by domain and split discovery examples script into stack/env helpers, baseline lane, graph lane, recall lane and evidence/report formatting where this reduces duplication.
- Out of scope: product behavior changes, proof verdict weakening, live proof harness removal, route/API/MCP tool renames, DB migrations, discovery runtime semantics changes, content-analysis implementation refactor.
- Allowed paths: `.aidp/work.md`, `infra/scripts/*`, focused proof/testkit modules under `infra/scripts/lib/`, targeted TypeScript tests only if import compatibility requires them.
- Risk: medium-high, because proof harness refactor can accidentally change acceptance behavior even when runtime code is untouched.
- Required proof: `pnpm unit_tests:ts`; `pnpm test:mcp:compose`; `pnpm test:mcp:http:writes`; `pnpm test:discovery:examples:compose`; `pnpm test:discovery:yield:compose`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; cleanup with `pnpm dev:mvp:internal:down` and empty `docker ps` if compose stack remains running.
- Acceptance criteria: met.
- Сработало, с evidence: extracted deterministic MCP scenario order/group catalog into `infra/scripts/lib/mcp-http-scenario-catalog.mjs`, while `infra/scripts/lib/mcp-http-scenarios.mjs` keeps the public exports and scenario implementations.
- Сработало, с evidence: extracted live discovery examples Markdown/report formatting into `infra/scripts/lib/discovery-live-report-format.mjs`, while `infra/scripts/test-live-discovery-examples.mjs` keeps runtime orchestration and artifact writing.
- Сработало, с evidence: extracted yield proof Markdown formatting into `infra/scripts/lib/discovery-live-yield-report.mjs` and single-run examples harness delegation into `infra/scripts/lib/discovery-live-yield-runner.mjs`; `infra/scripts/test-live-discovery-yield-proof.mjs` remains the multi-run entrypoint.
- Сработало, с evidence: `node --check` passed for the new proof helper modules and updated discovery proof entrypoints.
- Сработало, с evidence: `pnpm unit_tests:ts` passed 246 TypeScript tests after the proof harness split.
- Сработало, с evidence: `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed after the proof harness split; typecheck reported only existing Astro hints and no errors.
- Сработало, с evidence: `pnpm test:mcp:compose` passed with artifact `/tmp/newsportal-mcp-http-deterministic-36d92017-1ff5-4697-8261-6825c42305a7.json` and `.md`, preserving deterministic scenario order and doc-parity coverage.
- Сработало, с evidence: `pnpm test:mcp:http:writes` passed with artifact `/tmp/newsportal-mcp-http-deterministic-579ddbc5-533a-4cf6-a22a-dc6cc5b7d3a9.json` and `.md`, preserving the writes group mapping from the extracted catalog.
- Сработало, с evidence: `pnpm test:discovery:examples:compose` passed with artifact `/tmp/newsportal-live-discovery-examples-a1792838.json` and `.md`; the JSON reported runtime/yield/final verdict `pass` and calibration `true`.
- Сработало, с evidence: `pnpm test:discovery:yield:compose` passed with artifact `/tmp/newsportal-live-discovery-yield-proof-104c3892.json` and `.md`; the JSON reported runtime/yield/final verdict `pass` and multi-run runtime/yield verdict `pass`.
- Cleanup completed: `pnpm dev:mvp:internal:down` removed the compose stack after Batch 6 proof, and final `docker ps` returned only the header row with no running containers.

### ARCH-HOTSPOT-REFACTOR-FINAL-FULL-PROOF

- Kind: Stage
- Status: completed
- In scope: final clean capability proof after all architecture hotspot refactor batches, including static/unit/stateful/live acceptance and cleanup evidence.
- Out of scope: new product behavior, additional refactor, DB migrations, public API/MCP/queue/schema changes, destructive volume reset unless a stale disposable state failure is diagnosed and remediation is explicitly warranted.
- Allowed paths: `.aidp/work.md`; runtime/local test artifacts under `/tmp`; targeted code/test paths only if a final proof failure requires repair.
- Risk: high, because full product/discovery/MCP proof can create local Docker state, rows, queues, tokens and nondeterministic external-source residual artifacts.
- Required proof: final static/unit/stateful/live proof according to the capability plan, including `pnpm test:product:local:full`; cleanup with `pnpm dev:mvp:internal:down` and empty `docker ps`.
- Acceptance criteria: met.
- Сработало, с evidence: final syntax/static gates passed after final remediation: `node --check infra/scripts/test-live-discovery-examples.mjs`, `node --check infra/scripts/test-live-discovery-yield-proof.mjs`, `python -m py_compile services/api/app/main.py services/workers/app/main.py` and `git diff --check --`.
- Сработало, с evidence: final static/unit gates passed `pnpm unit_tests:ts` (246 TS tests), `pnpm unit_tests:py` (286 Python tests), `pnpm lint`, `pnpm typecheck` and `pnpm test:migrations:smoke`.
- Сработало, с evidence: final targeted proof passed `pnpm test:discovery:yield:compose` with `/tmp/newsportal-live-discovery-yield-proof-2cc57c54.json`; Example A/B/C each reported 3/3 passing runs.
- Сработало после диагностики: first `pnpm integration_tests` in final proof hit an RSS startup/worker-consumption race (`article` still `raw`, sequence run `pending`, no task run yet); isolated `pnpm test:ingest:compose` passed on the canonical stack, and rerun `pnpm integration_tests` passed.
- Сработало, с evidence: final targeted stateful gates passed `pnpm test:product:local:core` with `/tmp/newsportal-product-local-core-d02e33f4.json` and `pnpm test:mcp:http:writes` with `/tmp/newsportal-mcp-http-deterministic-54a45477-a352-460d-ae22-889ee6b8ec25.json`.
- Сработало после remediation: standalone yield proof initially produced a false parent failure even though all three nested runs passed; `infra/scripts/test-live-discovery-yield-proof.mjs` was fixed to aggregate nested pass results honestly and only fail on real nested/runtime failures.
- Сработало после remediation: live discovery examples content-filter backfill was limited to proof-window subject IDs so stale broad `content_filter` reindex jobs cannot block the queue; API backfill now leaves outbox events pending for relay delivery and preserves optional `subjectIds`.
- Сработало, с evidence: final `pnpm test:product:local:full` passed on run `f2f6dc78`, 17/17 commands green, writing `/tmp/newsportal-product-local-full-f2f6dc78.json` and `/tmp/newsportal-product-local-full-f2f6dc78.md`.
- Сработало, с evidence: final full run covered lint, typecheck, unit tests, integration, local stack, website/admin/automation/MCP compose, web viewports/UI audit, discovery enabled/admin/examples/yield, website matrix and MCP HTTP live.
- Сработало, с evidence: final full discovery examples artifact `/tmp/newsportal-live-discovery-examples-ada5dba8.json` passed; nested yield proof artifacts `/tmp/newsportal-live-discovery-examples-9177c257.json`, `/tmp/newsportal-live-discovery-examples-f783ca5c.json` and `/tmp/newsportal-live-discovery-examples-0208f9e2.json` passed; final yield artifact `/tmp/newsportal-live-discovery-yield-proof-0bde079b.json` reported runtime/yield/final verdict `pass`.
- Сработало, с evidence: final yield proof showed Example A Job Board, Example B Developer News and Example C Outsourcing each at 3/3 passing runs with aggregate `yield_pass: 9`.
- Сработало, с evidence: final MCP HTTP live artifact `/tmp/newsportal-mcp-http-live-f3afe825-7328-4f7f-9ce0-a2a8682d4e99.json` reported runtime verdict `healthy` and usefulness verdict `healthy`.
- Residual classified: final website matrix observed live external-source blocks including captcha, 403, Cloudflare challenge and unsupported blocks; harness classified them as upstream/source residuals and the command remained green.
- Cleanup completed: `pnpm dev:mvp:internal:down` removed the compose stack after final full proof, and final `docker ps` returned only the header row with no running containers.

### REFACTOR-FULL-LIVE-PROOF-2026-04-27

- Kind: Stage
- Status: completed
- In scope: full static/unit/stateful/live proof after API/MCP/fetcher/discovery refactor batches; verify public behavior remains intact through repo-owned gates.
- Out of scope: new product behavior, broad refactor, schema changes, destructive volume reset, production-like environments.
- Allowed paths: `.aidp/work.md`; runtime/local test artifacts under `/tmp`; targeted code/test paths only if a proof failure requires repair.
- Risk: high, because full product/discovery/MCP proof can create local Docker state, rows, queues, tokens and nondeterministic external-source residual artifacts.
- Required proof: `pnpm unit_tests:ts`; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `pnpm test:migrations:smoke`; `pnpm test:mcp:compose`; `pnpm test:discovery:admin:compose`; `pnpm test:discovery:examples:compose`; `pnpm test:discovery:yield:compose`; `pnpm test:product:local:full`; `git diff --check --`; cleanup with `pnpm dev:mvp:internal:down` and empty `docker ps`.
- Acceptance criteria: met.
- Сработало, с evidence: baseline proof passed `pnpm unit_tests:ts` (246 TS tests), `pnpm unit_tests:py` (286 Python tests), `pnpm lint`, `pnpm typecheck`, `pnpm test:migrations:smoke`, `pnpm test:mcp:compose`, `pnpm test:discovery:admin:compose`, `pnpm test:discovery:examples:compose`, `pnpm test:discovery:yield:compose`, `pnpm test:product:local:full` and `git diff --check --`.
- Сработало, с evidence: final clean `pnpm test:product:local:full` passed on run `d27c0c5f`, 17/17 lanes passed, and wrote `/tmp/newsportal-product-local-full-d27c0c5f.json` and `/tmp/newsportal-product-local-full-d27c0c5f.md`.
- Сработало, с evidence: product full covered deterministic, stateful-core, browser-ui, live-enabled and live-provider lanes: lint/typecheck/unit/integration, local stack, website/admin/automation/MCP compose, web viewports/UI audit, discovery enabled/admin/examples/yield, website matrix and MCP HTTP live.
- Сработало, с evidence: final MCP live artifact `/tmp/newsportal-mcp-http-live-b66077d9-1f24-4f8b-80a9-8075e7a384f9.json` and `.md` reported runtime verdict `healthy` and usefulness verdict `healthy`.
- Сработало, с evidence: final discovery examples/yield artifacts were produced during the clean product run, including `/tmp/newsportal-live-discovery-examples-334fb3bf.json`, `/tmp/newsportal-live-discovery-yield-proof-78e27eab.json` and their `.md` companions.
- Сработало после remediation: initial standalone `pnpm test:migrations:smoke` failed because the local stack/PostgreSQL was not running (`ECONNREFUSED 127.0.0.1:55432`); after starting the repo compose stack it passed.
- Сработало после remediation: initial `pnpm test:mcp:compose` failed against a stale disposable local DB volume missing `discovery_hypothesis_classes`; isolated migration smoke proved the schema was valid, `pnpm dev:mvp:internal:down:volumes` reset local proof state, and rerun passed.
- Сработало после remediation: first full product attempt `d25d3cb8` failed in RSS ingest smoke because the dirty live stack had a Redis sequence backlog from previous targeted live proof runs; isolated clean-stack ingest passed, and the clean full rerun `d27c0c5f` passed.
- Residual classified: live website/source matrix observed upstream blocks such as captcha/403/Cloudflare/unsupported sources during product full; these were classified as external-source residuals by the harness and did not make the final clean command red.
- Cleanup completed: `pnpm dev:mvp:internal:down` removed the compose stack after final proof, and final `docker ps` returned only the header row with no running containers.

### CONTENT-ANALYSIS-OPTIMIZATION

- Kind: Stage
- Status: completed with classified residuals
- In scope: make `structured_extraction` explicit opt-in for default backfill/UI; align public module naming on `cluster_summary` with legacy `clustering` compatibility; document first-class subject boundaries; clarify content-filter source of truth; limit high-cardinality structured extraction label projection; split worker structured extraction/filter evaluation modules behind compatible imports; minimal Admin UX warnings/presets.
- Out of scope: removing existing analysis data, enforce-mode rollout, production deploy, non-Gemini provider implementation, broad UI redesign.
- Allowed paths: `.aidp/*`, `packages/contracts/*`, `services/api/*`, `services/workers/*`, `services/mcp/*`, `apps/admin/*`, `docs/product/*`, `tests/unit/*`, targeted migration/docs files only if compatibility requires them.
- Risk: medium-high, because this changes defaults around LLM-backed extraction and touches operator/admin/MCP surfaces while preserving compatibility.
- Required proof: `pnpm unit_tests:py`; `pnpm unit_tests:ts`; `pnpm lint`; `pnpm typecheck`; `pnpm test:migrations:smoke`; targeted MCP compose if feasible; `git diff --check --`.
- Acceptance criteria: satisfied. Default replay/backfill no longer includes `structured_extraction`; explicit Admin/MCP/API requests still can run it; `cluster_summary` is the canonical public module name with `clustering` accepted as a legacy alias; high-cardinality extracted text is not projected to labels unless explicitly enabled; docs/contracts state filter source-of-truth and runtime subject boundaries; worker structured extraction/filter helpers are split behind compatible imports; Admin UX exposes presets and LLM/default-off warnings.

### CONTENT-ANALYSIS-HYBRID-FULL-PROOF

- Kind: Stage
- Status: completed with classified residuals
- In scope: maximal local/static/stateful proof for the completed Hybrid Structured Extraction module: unit tests, lint/typecheck, migration smoke, MCP compose/writes, discovery examples/yield, integration/product local full, artifact and cleanup tracking.
- Out of scope: new product behavior, production deploy, enforce-mode rollout, broad refactors unless a failing proof requires a targeted fix.
- Allowed paths: `.aidp/*`; test/runtime artifacts under `/tmp`; targeted code/test paths only if a proof failure requires repair.
- Risk: high, because this runs stateful compose/product harnesses and may create local containers, volumes, tokens, rows, queues and external-source residual artifacts.
- Required proof: `pnpm unit_tests:ts`; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `pnpm test:migrations:smoke`; `pnpm test:mcp:http:writes`; `pnpm test:mcp:compose`; `pnpm test:discovery:examples:compose`; `pnpm test:discovery:yield:compose`; `pnpm integration_tests`; `pnpm test:product:local:full`; `git diff --check --`; cleanup with `pnpm dev:mvp:internal:down` and empty `docker ps`.
- Acceptance criteria: satisfied. Static/unit gates, migration smoke, MCP writes/compose, discovery examples/yield, integration, product local full, whitespace check and cleanup completed. `pnpm test:product:local:full` passed on run `7bc6e7a9` with 17/17 commands green; Example A/B/C runtime/yield proof passed; MCP live reported runtime/usefulness healthy; website-matrix source blocks remained classified external residuals.

### CONTENT-ANALYSIS-HONEST-GREEN-PROOF

- Kind: Stage
- Status: completed
- In scope: repo-owned live proof hardening for Example A/B/C discovery examples, baseline-channel evidence, content-analysis persistence assertions, first-class MCP content-analysis doc-parity scenario, RSS smoke timeout diagnostics, docs/AIDP sync and targeted tests.
- Out of scope: product runtime behavior changes, external provider/model rollout, paid LLM dispatch, enforce-mode gating, production-like environment changes, broad refactors.
- Allowed paths: `.aidp/*`, `infra/scripts/*`, `services/fetchers/src/cli/test-rss-smoke.ts`, `docs/product/operator/examples/*`, `docs/product/operator/manual-mvp-runbook.md`, `tests/unit/ts/*`.
- Risk: high, because this hardens stateful compose/live harnesses, discovery proof profiles, MCP writes and RSS processing assertions.
- Required proof: `pnpm unit_tests:ts`; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `pnpm test:migrations:smoke`; `git diff --check --`; targeted `pnpm test:mcp:http:writes`, `pnpm test:mcp:compose`, `pnpm test:discovery:examples:compose`, `pnpm test:discovery:yield:compose`; final `pnpm test:product:local:full` if local/runtime budget permits.
- Acceptance criteria: satisfied. `pnpm test:product:local:full` passed on run `52428b12`; Example A appears beside B/C in repo-owned live discovery examples; external-source failures remain classified artifacts; MCP doc-parity includes first-class content-analysis operator flows; RSS smoke still requires processed article state and now emits deeper diagnostics with a 90s wait window.

### CONTENT-ANALYSIS-HYBRID-STRUCTURED-EXTRACTION

- Kind: Stage
- Status: completed
- In scope: `structured_extraction` module/type, configurable extraction template in `content_analysis_policies.config_json`, Gemini JSON-backed worker runtime, local hints, result validation/projection to `content_entities` and `content_labels`, structured filter ops, backfill/Admin/MCP/docs/tests.
- Out of scope: enforce-mode feed hiding, new template table, non-Gemini provider adapters, production rollout, paid live proof requirements.
- Allowed paths: `.aidp/*`, `database/migrations/*`, `packages/contracts/*`, `packages/sdk/*`, `services/api/*`, `services/workers/*`, `services/mcp/*`, `apps/admin/*`, `docs/product/*`, `tests/unit/*`, targeted MCP proof harness files.
- Risk: high, because this introduces LLM provider dispatch into content_analysis runtime and extends persisted schema constraints/filter semantics.
- Required proof: `pnpm unit_tests:py`; `pnpm unit_tests:ts`; `pnpm lint`; `pnpm typecheck`; `pnpm test:migrations:smoke`; targeted MCP compose if feasible; `git diff --check --`.
- Acceptance criteria: satisfied. Operator can create/update structured extraction templates through Admin/MCP; backfill/plugin can run LLM-backed extraction for article/web_resource subjects; full JSON result persists; key fields project to entities/labels; filter policies can match projected/structured fields; default behavior remains dry-run/observe with no enforce feed hiding.

### CONTENT-ANALYSIS-LIVE-EXAMPLES-PROOF

- Kind: Stage
- Status: completed with residuals
- In scope: full local/live proof for EXAMPLES.md domains A/B/C; baseline proof; product local full; MCP HTTP writes/live; discovery examples proof; admin/MCP-style domain configuration; artifact and cleanup tracking.
- Out of scope: production-like environments, enforce-mode read-path rollout, external provider feature implementation, destructive volume reset unless explicitly required by a repo-owned harness.
- Allowed paths: `.aidp/*`; runtime/local test artifacts under `/tmp`; local compose state created by repo-owned proof harnesses.
- Risk: high, because this uses live external provider paths, local compose state, source imports, LLM/discovery budgets and ephemeral admin/MCP credentials.
- Required proof: `pnpm unit_tests`; `pnpm lint`; `pnpm typecheck`; `pnpm test:migrations:smoke`; `pnpm test:product:local:full`; `pnpm test:mcp:http:writes`; `pnpm test:mcp:http:live`; `pnpm test:discovery:examples:compose`; per-domain evidence or recorded residuals.
- Acceptance criteria: mostly satisfied. Baseline checks passed; product local full produced artifacts but exited failed because `pnpm integration_tests` hit RSS processed-article timeout and `pnpm test:mcp:compose` doc-parity flagged missing coverage for new content-analysis tools; standalone MCP writes passed; standalone content-analysis MCP canary passed; MCP live passed inside product full with runtime healthy/usefulness weak; discovery examples/yield for B/C passed. Example A full live import was not covered by the repo-owned discovery examples harness and remains a manual/live residual.

### CONTENT-ANALYSIS-STAGE-1

- Kind: Stage
- Status: completed
- In scope: DB schema and seeded defaults for universal content analysis/gating; contracts/SDK/API read/write surfaces; worker task plugins for deterministic NER observe, system-interest label projection and dry-run content gate; sequence/plugin registration; minimal admin/MCP visibility; docs/AIDP sync.
- Out of scope: production-grade external NER/sentiment provider rollout, paid LLM fallback, enforce-mode rollout by default, analytical clustering, broad UI redesign.
- Allowed paths: `.aidp/*`, `database/migrations/*`, `packages/contracts/*`, `packages/sdk/*`, `packages/control-plane/*`, `services/api/*`, `services/workers/*`, `services/mcp/*`, `apps/admin/*`, `apps/web/*`, `docs/product/*`, `tests/unit/*`.
- Risk: high, because this touches migrations, UTE plugins, selection-adjacent read paths, admin/MCP surfaces and replay/gating semantics.
- Required proof: migration smoke if feasible; `pnpm typecheck`; `pnpm unit_tests` or targeted TS/Python unit tests; targeted worker/plugin proof; MCP/admin proof where touched, with residual gaps recorded if compose gates cannot run.
- Acceptance criteria: `content_analysis_results`, `content_entities`, `content_labels`, `content_filter_policies`, `content_filter_results` exist; article/resource/content-item reads can include analysis summary; MCP and admin expose analysis/filter basics; default behavior stays observe/dry_run and does not hide content or send retro notifications.

### CONTENT-ANALYSIS-STAGE-2

- Kind: Stage
- Status: completed
- In scope: queued content-analysis backfill/replay job over existing articles/resources; progress visibility through existing maintenance job UI; admin create/update/preview flow for content filter policies; MCP/API/SDK surface for requesting backfill; docs/AIDP sync and proof.
- Out of scope: external paid NER/sentiment provider rollout, enforce-mode read-path gating, analytical clustering, full product UI redesign, retro notifications.
- Allowed paths: `.aidp/*`, `database/migrations/*`, `packages/contracts/*`, `packages/sdk/*`, `services/api/*`, `services/workers/*`, `services/mcp/*`, `apps/admin/*`, `docs/product/*`, `tests/unit/*`.
- Risk: high, because it touches migrations, worker maintenance jobs, admin writes and MCP write tooling.
- Required proof: migration smoke if feasible; `pnpm typecheck`; `pnpm unit_tests`; `pnpm lint`; targeted worker/content-analysis proof; `git diff --check --`.
- Acceptance criteria: operator can queue safe content-analysis replay without retro notifications; replay persists NER/entities, system-interest labels and dry-run filter results for existing content; admin can create/update/preview filter policies with enforce confirmation; MCP can request replay and policy writes stay auditable.

### CONTENT-ANALYSIS-STAGE-3

- Kind: Stage
- Status: completed
- In scope: local deterministic sentiment, taxonomy category, tone/risk label extraction; task plugins and article sequence wiring; backfill module support; filter policy rules that can use persisted labels/analysis scores; admin/MCP/API/SDK/docs updates and targeted tests.
- Out of scope: external paid NER/sentiment providers, LLM-based classifiers, enforce-mode read-path gating, full analytical clustering implementation, retro notifications.
- Allowed paths: `.aidp/*`, `database/migrations/*`, `packages/contracts/*`, `packages/sdk/*`, `services/api/*`, `services/workers/*`, `services/mcp/*`, `apps/admin/*`, `docs/product/*`, `tests/unit/*`.
- Risk: high, because this extends worker analysis semantics, sequence modules, policy evaluation and operator controls.
- Required proof: migration smoke if feasible; `pnpm typecheck`; `pnpm unit_tests`; `pnpm lint`; targeted worker/content-analysis proof; `git diff --check --`.
- Acceptance criteria: replay and sequence runs can persist sentiment/category/tone/risk labels for articles/resources; content filter policies can match positive/negative/category labels in dry-run; admin and MCP can request these modules; behavior remains observe/dry-run by default.

### CONTENT-ANALYSIS-STAGE-4

- Kind: Stage
- Status: completed
- In scope: persisted `cluster_summary` projection for existing `story_clusters`; task plugin and backfill module support; MCP/API/admin/doc visibility for requesting cluster summaries; targeted tests.
- Out of scope: changing clustering thresholds or algorithms, external providers, read-path enforce gating, retro notifications, full cluster management UI.
- Allowed paths: `.aidp/*`, `database/migrations/*`, `packages/contracts/*`, `packages/sdk/*`, `services/api/*`, `services/workers/*`, `services/mcp/*`, `apps/admin/*`, `docs/product/*`, `tests/unit/*`.
- Risk: medium-high, because this touches worker analysis semantics, maintenance replay and operator controls while relying on existing cluster truth.
- Required proof: migration smoke if feasible; `pnpm typecheck`; `pnpm unit_tests`; `pnpm lint`; targeted worker/content-analysis proof; `git diff --check --`.
- Acceptance criteria: existing story clusters can receive replay-safe `cluster_summary` analysis rows; backfill can request cluster summaries; admin/MCP/docs expose the module; no clustering decisions or feed visibility are changed.

### CONTENT-ANALYSIS-STAGE-5

- Kind: Stage
- Status: completed
- In scope: CRUD/versioning visibility for `content_analysis_policies`; API/SDK/MCP read/write tools; admin page/forms for analysis policies; docs/AIDP/tests.
- Out of scope: external provider integration, paid LLM calls, changing runtime provider dispatch behavior, enforce read-path gating, retro notifications.
- Allowed paths: `.aidp/*`, `packages/contracts/*`, `packages/sdk/*`, `services/api/*`, `services/mcp/*`, `apps/admin/*`, `docs/product/*`, `tests/unit/*`.
- Risk: medium-high, because this adds operator writes for analysis configuration while keeping runtime behavior unchanged.
- Required proof: `pnpm typecheck`; `pnpm unit_tests`; `pnpm lint`; targeted SDK/API/MCP/admin proof where feasible; `git diff --check --`.
- Acceptance criteria: operators can list/read/create/update analysis policies in admin and MCP; updates preserve policy version/provenance semantics; current analysis execution remains observe/dry-run and unchanged unless future runtime work consumes policy configs.

### CONTENT-ANALYSIS-STAGE-6

- Kind: Stage
- Status: completed
- In scope: runtime resolution of active `content_analysis_policies` for local deterministic NER, sentiment, taxonomy category and system-interest label projection; safe `config_json` controls; policy provenance in `content_analysis_results`; replay/plugin support; docs/tests.
- Out of scope: external provider/model dispatch, paid LLM calls, read-path enforce gating, automatic retro notifications, changing clustering algorithms.
- Allowed paths: `.aidp/*`, `services/workers/*`, `docs/product/*`, `tests/unit/*`.
- Risk: medium-high, because operator-authored policies begin to affect persisted analysis outputs while still staying local and replay-safe.
- Required proof: `pnpm unit_tests:py`; `pnpm lint:py`; `pnpm typecheck` if docs/contracts or TS surfaces drift; targeted content-analysis tests; `git diff --check --`.
- Acceptance criteria: active local analysis policies can tune deterministic module behavior through bounded config; unsupported external provider configs are not executed; persisted analysis rows record policy id/version; replay and UTE plugins remain backward compatible.

### Активные риски

- Risk 1: Compose/integration gates are stateful and can create users, rows, queues, images, containers, volumes or external-provider artifacts; use the test-access contract and record cleanup.
- Risk 2: auth/session, notification/delivery and runtime/migration/index boundaries have AIDP contracts; future changes must load the matching contract before implementation.
- Risk 3: existing large orchestration pressure zones must not grow casually; future work must apply `.aidp/engineering.md` architecture review triggers.

### Известные gaps

- Fact gap: production deploy process is not declared in root scripts.
- Proof gap: no separate package/release command is declared.

### Наблюдения этой сессии

- User approved applying the read-only cleanup audit findings after asking what else should be cleaned.
- AIDP repair was required because `.aidp/work.md` claimed a mixed/dirty worktree while Git was clean before this cleanup pass.
- Product docs had stale absolute local links and two stale status/path claims: `docs/data_scripts` and an old in-flight website-ingestion delta.
- Local markdown link proof also surfaced broken example links to the root README; those were fixed to use the correct relative depth.
- Empty untracked source directories existed under `apps/admin/src/lib/auth`, `apps/web/src/lib/auth` and `apps/web/src/pages/article`.
- Ignored local cache artifacts existed: `.DS_Store`, `.pytest_cache`, `.ruff_cache` and Python `__pycache__` directories.

### Подтверждено для консолидации

- AIDP setup remains complete -> `.aidp/os.yaml` still has `initialized: true` and `project.placeholder_values_present: false`.
- Repository cleanup repair/sweep completed -> `.aidp/work.md` and `.aidp/history.md`.
- Product docs keep product/reference role and must not reintroduce old `docs/contracts/*` runtime truth.

### Parked / latent items

- CAP-CONTENT-ANALYSIS-2026-04-25 — Stage 1 foundation, Stage 2 backfill/admin filter policy editing, Stage 3 local sentiment/category signals, Stage 4 cluster-summary projection, Stage 5 analysis-policy management and Stage 6 local runtime policy consumption completed; future stages may add external providers, enforce-mode rollout and richer cluster management.
- CAP-CONTENT-ANALYSIS-LIVE-PROOF-2026-04-25 — live examples proof completed with recorded residuals; no active execution remains.
- CAP-CONTENT-ANALYSIS-HONEST-GREEN-2026-04-26 — completed; closes the recorded Example A/MCP doc-parity/RSS smoke harness residuals.
- CAP-CONTENT-ANALYSIS-HYBRID-STRUCTURED-EXTRACTION-2026-04-26 — completed; adds configurable LLM-backed structured extraction templates to the universal content_analysis layer.
- CAP-CONTENT-ANALYSIS-OPTIMIZATION-2026-04-26 — completed; makes structured extraction explicitly opt-in, narrows public/runtime surfaces and reduces high-cardinality label/cost risk without removing the capability.
- Enforce rollout, external providers and analytical clustering remain parked for later stages.

### Память попыток

- Сработало, с evidence: CONTENT-ANALYSIS-OPTIMIZATION completed the requested optimization pass. `structured_extraction` is explicit opt-in for default backfill/Admin backfill/MCP docs; `cluster_summary` is the canonical public module with legacy `clustering` compatibility; `canonical_document` is documented as reserved/future for v1 runtime backfill; `content_filter_results` is documented as the owner-table for gate decisions; structured extraction label projection now suppresses high-cardinality free text unless `allowHighCardinalityLabels` is set.
- Сработало, с evidence: worker internals were split into `services/workers/app/content_analysis_structured.py` and `services/workers/app/content_filter_policy.py` while keeping existing public imports/behavior compatible; Admin analysis-policy UX now includes `Job opening extraction` and `Buyer intent extraction` presets plus an LLM cost warning; backfill UI keeps `structured_extraction` unchecked by default.
- Сработало, с evidence: optimization proof passed `pnpm unit_tests:py` (286 tests), `pnpm unit_tests:ts` (246 tests), `pnpm lint`, `pnpm typecheck`, `pnpm test:migrations:smoke`, `pnpm test:mcp:http:writes`, `pnpm test:mcp:compose` and `pnpm test:product:local:full` run `653b61d6`, producing `/tmp/newsportal-product-local-full-653b61d6.json` and `.md`.
- Сработало, с evidence: product-full discovery examples included A/B/C and wrote `/tmp/newsportal-live-discovery-examples-9c534f52.json`; yield proof completed three live harness runs and wrote `/tmp/newsportal-live-discovery-yield-proof-2f66faec.json`; deterministic MCP compose artifact `/tmp/newsportal-mcp-http-deterministic-9502b37d-e383-43e1-94f2-9f96d69e0971.json` included `content-analysis-operator-flows`; MCP live artifact `/tmp/newsportal-mcp-http-live-da4f25da-07d9-4466-b2d4-7c18ed9436de.json` reported runtime/usefulness healthy.
- Cleanup completed: `git diff --check --` exited 0; `pnpm dev:mvp:internal:down` removed the compose stack; `docker ps --format '{{.Names}} {{.Status}}'` returned empty.
- Сработало после remediation: `pnpm test:migrations:smoke` first failed because local PostgreSQL was not running (`ECONNREFUSED 127.0.0.1:55432`), then passed after starting Postgres through the repo compose stack. `pnpm test:mcp:compose` first failed on a stale disposable DB volume missing `discovery_hypothesis_classes`, then passed after `pnpm dev:mvp:internal:down:volumes`.
- Residual classified: product-full website matrix recorded live upstream blocks/captcha/403 as truthful external residuals in `/tmp/newsportal-live-website-matrix-baseline-3d4fe729-41a7-4ff9-8531-45b0c35ad215.json`; they did not hide product failures.
- Сработало, с evidence: CONTENT-ANALYSIS-HYBRID-FULL-PROOF completed the maximal proof pass for the Hybrid Structured Extraction module. `pnpm unit_tests:ts` passed 246 tests; `pnpm unit_tests:py` passed 284 tests; `pnpm lint`, `pnpm typecheck`, `pnpm test:migrations:smoke`, `pnpm test:mcp:http:writes`, `pnpm test:mcp:compose`, `pnpm test:discovery:examples:compose`, `pnpm test:discovery:yield:compose`, `pnpm integration_tests`, `pnpm test:product:local:full` and `git diff --check --` exited 0 after documented retries.
- Сработало, с evidence: `pnpm test:product:local:full` passed on run `7bc6e7a9`, producing `/tmp/newsportal-product-local-full-7bc6e7a9.json` and `.md`; summary reported `status=passed`, `mode=full`, `commandCount=17`, `failed=[]`.
- Сработало, с evidence: product-full discovery examples proof included `example_a_job_board`, `example_b_dev_news` and `example_c_outsourcing` with runtime/yield/final verdicts pass in `/tmp/newsportal-live-discovery-examples-b5639526.json`; yield proof passed in `/tmp/newsportal-live-discovery-yield-proof-a5bed357.json`.
- Сработало, с evidence: MCP content-analysis proof stayed green through deterministic writes/compose and product-full MCP live; deterministic artifacts included `/tmp/newsportal-mcp-http-deterministic-8b3b7411-b1ab-4f96-84e6-988137f44b2a.json`, `/tmp/newsportal-mcp-http-deterministic-17a4fcdf-d7c5-4e47-9a4e-8c7d181f6a6e.json` and product-full `/tmp/newsportal-mcp-http-deterministic-3a2827c9-6c5b-4b32-b510-57e6b8013bf1.json`; live MCP artifact `/tmp/newsportal-mcp-http-live-2250457c-6a1b-4e6e-aabe-48bf1d972d18.json` reported runtime/usefulness healthy.
- Сработало после remediation: `pnpm test:migrations:smoke` first failed because Postgres was not running (`ECONNREFUSED 127.0.0.1:55432`); starting the local Postgres service and rerunning passed.
- Сработало после remediation: `pnpm test:mcp:http:writes` first failed on a stale disposable DB volume missing `discovery_hypothesis_classes`; `pnpm dev:mvp:internal:down:volumes` reset the local proof volume, and rerun passed.
- Сработало после retry: `pnpm integration_tests` first hit an RSS processed-article wait residual with latest article `raw`, sequence run `pending` and no task run yet; isolated `pnpm test:ingest:compose` passed, full `pnpm integration_tests` rerun passed, and product-full integration also passed.
- Residual classified: product-full website matrix observed expected live-source blocks/captcha/403/unsupported cases in `/tmp/newsportal-live-website-matrix-baseline-49369078-da77-4123-9255-d67702f0c923.json`; these stayed classified residuals and did not hide product failures.
- Cleanup completed: `pnpm dev:mvp:internal:down` removed the compose stack, and `docker ps --format '{{.Names}} {{.Status}}'` returned empty.
- Сработало, с evidence: CONTENT-ANALYSIS-STAGE-6 added runtime resolution of active `content_analysis_policies` for local deterministic NER, sentiment, category and system-interest label projection, including bounded `config_json` controls and `policy_id/policy_version` provenance in `content_analysis_results`.
- Сработало, с evidence: unsupported external provider/model analysis policies are skipped by local runtime paths instead of triggering provider dispatch.
- Сработало, с evidence: `pnpm unit_tests` passed 245 TS tests and 279 Python tests.
- Сработало, с evidence: `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed for Stage 6; typecheck still emits existing Astro hint-style diagnostics but exits 0.
- Не выполнялось: migration smoke for Stage 6, because this slice added no database migration.
- Сработало, с evidence: CONTENT-ANALYSIS-STAGE-5 added `content_analysis_policies` management through FastAPI maintenance endpoints, SDK methods, MCP read/write tools, admin page/BFF forms, version-preserving update semantics, audit hooks and docs.
- Сработало, с evidence: `pnpm unit_tests` passed 245 TS tests and 275 Python tests.
- Сработало, с evidence: `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed for Stage 5; typecheck still emits existing Astro hint-style diagnostics but exits 0.
- Не выполнялось: migration smoke for Stage 5, because this slice added no database migration.
- Сработало, с evidence: CONTENT-ANALYSIS-STAGE-4 added `cluster_summary` projection over existing `story_clusters`, plugin `content.cluster_summary_project`, backfill support for `story_cluster` subjects, admin/MCP/docs coverage and migration `0048`.
- Сработало, с evidence: `pnpm test:migrations:smoke` passed after starting local PostgreSQL, applying 49 migrations in a temporary schema and verifying active article/resource sequence graphs.
- Сработало, с evidence: `pnpm unit_tests` passed 245 TS tests and 275 Python tests.
- Сработало, с evidence: `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed for Stage 4; typecheck still emits existing Astro hint-style diagnostics but exits 0.
- Сработало, с evidence: CONTENT-ANALYSIS-STAGE-3 added local deterministic sentiment/tone/risk and taxonomy category analysis, task plugins `content.sentiment_analyze` and `content.category_classify`, backfill module support, label-based filter policy rules and admin/MCP/docs coverage.
- Сработало, с evidence: `pnpm test:migrations:smoke` passed after starting local PostgreSQL, applying 48 migrations in a temporary schema and verifying active article/resource sequence graphs.
- Сработало, с evidence: `pnpm unit_tests` passed 245 TS tests and 274 Python tests.
- Сработало, с evidence: `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed for Stage 3; typecheck still emits existing Astro hint-style diagnostics but exits 0.
- Сработало, с evidence: CONTENT-ANALYSIS-STAGE-2 added `reindex_jobs.job_kind = content_analysis`, FastAPI/SDK/MCP backfill request surfaces, worker replay over articles/resources, admin backfill form, admin policy create/update forms and policy versioning on evaluation changes.
- Сработало, с evidence: `pnpm test:migrations:smoke` passed after starting local PostgreSQL, applying 47 migrations in a temporary schema and verifying active article/resource sequence graphs.
- Сработало, с evidence: `pnpm unit_tests` passed 245 TS tests and 271 Python tests.
- Сработало, с evidence: `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed for Stage 2; typecheck still emits existing Astro hint-style diagnostics but exits 0.
- Сработало, с evidence: CONTENT-ANALYSIS-STAGE-1 shipped the first vertical slice: migration `0045`, contracts/SDK/API/MCP surfaces, worker UTE plugins, admin/web read surfaces, docs and targeted tests.
- Сработало, с evidence: `pnpm test:migrations:smoke` passed after starting local PostgreSQL, applying 46 migrations in a temporary schema and verifying article/resource sequence graphs.
- Сработало, с evidence: `pnpm unit_tests` passed 245 TS tests and 269 Python tests.
- Сработало, с evidence: `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed; typecheck still emits existing Astro hint-style diagnostics but exits 0.
- Сработало, с evidence: `git status --porcelain` was empty before apply phase; old `docs/contracts/` directory was absent; targeted stale-path audit identified only cleanup candidates.
- Сработало, с evidence: local markdown link check passed for 52 docs/.aidp markdown files after product-doc link cleanup.
- Сработало, с evidence: `.aidp/os.yaml` parsed successfully after cleanup.
- Не выполнялось: full compose product/MCP/admin UI smoke for this stage; Stage 1 is observe/dry-run and covered by unit/type/migration proof.
- Сработало, с evidence: CONTENT-ANALYSIS-LIVE-EXAMPLES-PROOF baseline checks passed on 2026-04-25: `pnpm unit_tests` passed 245 TS tests and 279 Python tests; `pnpm lint` passed including `ruff check services`; `pnpm typecheck` exited 0 with existing Astro hints only; `pnpm test:migrations:smoke` passed after local PostgreSQL start, applying 49 migrations in a temporary schema and verifying 29 tables, 65 indexes, 106 tracked columns, cursor/discovery constraints and active article/resource sequence graphs.
- Сработало частично, с evidence: `pnpm test:product:local:full` wrote `/tmp/newsportal-product-local-full-e2486cd5.json` and `.md`; product harness ran through website/admin/automation/web/discovery/website matrix/MCP live surfaces, but final status was failed because `pnpm integration_tests` failed at RSS smoke waiting for processed article and `pnpm test:mcp:compose` failed doc-parity coverage for shipped `content_analysis.*`, `content_analysis_policies.*` and `content_filter_*` tools.
- Сработало, с evidence: `pnpm test:mcp:http:writes` passed after Docker-socket escalation and wrote `/tmp/newsportal-mcp-http-deterministic-268970db-0eeb-4e6d-bf51-1c86a4cf8d9c.json` and `.md`; selected scenarios covered auth/token lifecycle, template/interest/channel writes, sequence writes, discovery writes, destructive-policy guards and audit evidence.
- Сработало, с evidence: `pnpm test:mcp:http:live` ran inside product full, wrote `/tmp/newsportal-mcp-http-live-5356ef11-8822-4710-ba68-c4997aa3e891.json` and `.md`, and reported runtime verdict `healthy` with usefulness verdict `yield-usefulness-weak-but-runtime-healthy`; live recall acquisition produced no promotable candidates in the bounded window.
- Сработало, с evidence: `pnpm test:discovery:examples:compose` ran inside product full and wrote `/tmp/newsportal-live-discovery-examples-c5dc4ad7.json` and `.md`; runtime/yield/final verdicts were `pass`, fixture seed created 15 interest templates, 15 criteria, 15 selection profiles and 39 RSS channels, and B/C case packs passed with classified residuals.
- Сработало, с evidence: `pnpm test:discovery:yield:compose` ran three live discovery harness attempts and wrote `/tmp/newsportal-live-discovery-yield-proof-a8149199.json` and `.md`; both `example_b_dev_news` and `example_c_outsourcing` passed 3/3 runs with aggregate root cause `yield_pass`.
- Сработало, с evidence: live DB inspection before cleanup showed `content_analysis_results=9423`, `content_entities=82790`, `content_labels=9868`, `content_filter_results=648`, `content_analysis_policies=5`, `content_filter_policies=1`; analysis rows covered `ner`, `sentiment`, `category`, `system_interest_label`, `content_filter` and `cluster_summary`; entities included ORG/PERSON/GPE/DATE; filter results were `dry_run` keep/reject only.
- Сработало, с evidence: content-analysis MCP canary created a bounded read/write proof and wrote `/tmp/newsportal-content-analysis-mcp-canary-038883f8-4988-46c8-9bae-cce8de3ac2ec.json` and `.md`; `tools/list` contained all required new content-analysis tools, list/read surfaces returned rows, inactive canary analysis/filter policies were created and updated through MCP, filter preview returned `previewOnly=true`, and `content_analysis.backfill.request` queued reindex job `ee5236d6-b61f-4b65-addf-86ba6aba5324`.
- Осталось residual: Example A Job Board full live admin import/configuration was not exercised by the existing repo-owned discovery examples harness; B/C were covered by discovery examples/yield. Full manual A/B/C admin import and active LLM-template scope switching remains a follow-up operator validation if strict parity with the original manual plan is required.
- Осталось residual: `content_analysis.backfill.request` canary proved queueing through MCP but the queued job was not drained before cleanup (`status=queued` after short wait).
- Осталось residual: website matrix classified real upstream failures as external-source residuals, including 403/captcha/Cloudflare/unsupported block cases; matrix summary was 16 total sites with 7 expected shape, 8 truthful unsupported/blocked and 1 partial/empty shape.
- Сработало, с evidence: CONTENT-ANALYSIS-HONEST-GREEN-PROOF added repo-owned `example_a_job_board` discovery live profile beside B/C, seeded Example A interests/channels from `EXAMPLES.md`, added baseline-channel proof evidence, yield-policy baseline acceptance and A profile unit coverage.
- Сработало, с evidence: live discovery examples proof inside final product full wrote `/tmp/newsportal-live-discovery-examples-a6a3b4f8.json` and `.md`; enabled runtime packs were `example_a_job_board`, `example_b_dev_news`, `example_c_outsourcing`; A/B/C each had `runtimeVerdict=pass`, `yieldVerdict=pass`, `status=passed`; A had 3 baseline evidence rows and 5 downstream evidence rows.
- Сработало, с evidence: `pnpm test:discovery:yield:compose` inside final product full wrote `/tmp/newsportal-live-discovery-yield-proof-f3c7c8c2.json` and `.md` after three A/B/C live harness runs.
- Сработало, с evidence: MCP deterministic compose added first-class `content-analysis-operator-flows`, passed inside final product full, and wrote `/tmp/newsportal-mcp-http-deterministic-bd2598c5-bda5-4bc3-824d-f1a169dede23.json` and `.md`; MCP live wrote `/tmp/newsportal-mcp-http-live-398030ff-23f7-4d30-ad96-ff79bfb313cf.json` and `.md` with runtime/usefulness healthy.
- Сработало, с evidence: RSS smoke diagnostics were hardened without weakening the assertion: processed article wait is 90s and timeout diagnostics include latest article state, matching sequence run and latest task run; `pnpm integration_tests` passed after this fix.
- Сработало, с evidence: final `pnpm test:product:local:full` passed with run id `52428b12`, 17/17 commands passed, and wrote `/tmp/newsportal-product-local-full-52428b12.json` and `.md`.
- Сработало, с evidence: final cleanup ran `pnpm dev:mvp:internal:down`; `docker ps --format '{{.Names}} {{.Status}}'` returned empty output.
- Сработало, с evidence: `pnpm unit_tests:ts`, `pnpm unit_tests:py`, `pnpm lint`, `pnpm typecheck`, `pnpm test:migrations:smoke`, `pnpm test:mcp:http:writes`, `pnpm test:mcp:compose`, `pnpm test:discovery:examples:compose`, `pnpm test:discovery:yield:compose`, `pnpm integration_tests`, final `pnpm test:product:local:full` and final `git diff --check --` passed for the honest-green slice.
- Осталось residual: final A/B/C content-analysis evidence in the discovery examples artifact was explicitly classified as `not_applicable` because the proof window had no article subjects or no processed article subjects for sampling; this is recorded as artifact classification, not hidden success.
- Сработало, с evidence: CONTENT-ANALYSIS-HYBRID-STRUCTURED-EXTRACTION added `structured_extraction` as a `content_analysis` module/type, `extracted_field` labels, migration `0049`, Admin policy/backfill controls, MCP policy/backfill parity, worker plugin `content.structured_extract`, Gemini strict-JSON runtime path, local deterministic hints, validation, projection to `content_entities`/`content_labels`, and filter ops `has_extracted_field`, `extracted_field_in`, `extracted_date_gte_relative`.
- Сработало, с evidence: `pnpm unit_tests:py` passed 284 Python tests; `pnpm unit_tests:ts` passed 246 TS tests; `pnpm lint`, `pnpm typecheck`, `pnpm test:migrations:smoke`, `pnpm test:mcp:compose` and `git diff --check --` passed for Hybrid Structured Extraction. Migration smoke applied 50 migrations. MCP compose artifact: `/tmp/newsportal-mcp-http-deterministic-ec6b907a-25ce-49c6-bb37-5f00fa7a1a42.json`.
- Сработало, с evidence: a stale local compose volume caused the first MCP compose attempt to miss an older discovery table; `pnpm dev:mvp:internal:down:volumes` reset the disposable local stack, and the rerun passed.
- Сработало, с evidence: cleanup ran `pnpm dev:mvp:internal:down`; `docker ps --format '{{.Names}} {{.Status}}'` returned empty output.

### Следующее рекомендуемое действие

- Следующий шаг: wait for the next user-requested implementation or validation slice.
- Почему это следующее: refactor full live proof is complete; no active execution remains.

### Статус archive sync

- Completed item или capability awaiting archive sync: none
- Почему еще live: n/a
- Требуемое archive action: none
- Expected archive destination/index label: latest cleanup item archived as `REPO-CLEANUP-2026-04-25`.

### Test artifacts and cleanup state

- Users created: none in this cleanup pass.
- Subscriptions or device registrations: none.
- Tokens / keys / credentials issued: repo-owned proof harnesses issued disposable Firebase admin identities/MCP tokens and cleaned them up.
- External registrations or webhooks: none.
- Seeded or imported data: live proof harnesses seeded disposable admin/operator rows, A/B/C discovery fixtures, website matrix rows and MCP canary rows in local compose data; final proof used a clean disposable stack and was stopped after proof.
- Runtime artifacts: `/tmp/newsportal-product-local-full-d27c0c5f.json`, `/tmp/newsportal-product-local-full-d27c0c5f.md`, `/tmp/newsportal-mcp-http-live-b66077d9-1f24-4f8b-80a9-8075e7a384f9.json`, `/tmp/newsportal-mcp-http-live-b66077d9-1f24-4f8b-80a9-8075e7a384f9.md`, `/tmp/newsportal-live-discovery-examples-334fb3bf.json`, `/tmp/newsportal-live-discovery-examples-334fb3bf.md`, `/tmp/newsportal-live-discovery-yield-proof-78e27eab.json`, `/tmp/newsportal-live-discovery-yield-proof-78e27eab.md`.
- Cleanup status: `pnpm dev:mvp:internal:down` completed after proof; final `docker ps` returned only the header row and no running containers.

## Handoff state

- Current item status: no active item; REFACTOR-FULL-LIVE-PROOF-2026-04-27 completed after clean full product/live proof.
- Уже доказано: AIDP runtime core remains initialized; full product proof passed static/unit/stateful/browser/discovery/live-provider/MCP lanes after clean-stack rerun; cleanup left no running containers.
- Еще не доказано или blocked: none for the requested refactor regression proof.
- Scope/coordination warning для следующего агента: do not broaden into external provider/model rollout, enforce-by-default behavior, paid LLM fallback or clustering unless a follow-up stage opens it.

### Недавно изменено

- 2026-04-24 — Initialized AIDP runtime core for NewsPortal in Russian and moved route from `setup` to `normal`.
- 2026-04-24 — Consolidated real commands, runtime surfaces, proof expectations and stateful test access into `.aidp/*`.
- 2026-04-24 — Migrated old deep contracts into `.aidp/contracts/*` and added source-code-owned contracts.
- 2026-04-24 — Completed architecture engineering hardening with quality bar, no-god-object rules, magic-constant rules and architecture proof checklist.
- 2026-04-24 — Completed verification surface coverage audit and added root aliases for existing automation, website matrix and UI audit harnesses.
- 2026-04-24 — Fixed lint failures surfaced by final proof and passed lint, typecheck, unit tests and MVP internal smoke.
- 2026-04-24 — Implemented and executed local product testing contour without Telegram/email/API ingestion lanes; `core` and escalated `full` passed with evidence artifacts, and compose stack was stopped after proof.
- 2026-04-25 — Deleted old duplicate `docs/contracts/*` after redirecting surviving product-doc links to `.aidp/contracts/*`.
- 2026-04-25 — Applied repository cleanup repair/sweep for stale AIDP live state, stale product-doc paths/status, absolute local doc links, empty source dirs and low-risk local cache artifacts.
- 2026-04-25 — Implemented CONTENT-ANALYSIS-STAGE-1 with persisted analysis/gate schema, worker sequence plugins, API/SDK/MCP/admin/web read surfaces, AIDP/product docs and proof.
- 2026-04-25 — Implemented CONTENT-ANALYSIS-STAGE-2 with queued backfill/replay, admin policy create/update/preview forms, MCP backfill request, policy versioning and proof.
- 2026-04-25 — Implemented CONTENT-ANALYSIS-STAGE-3 with local sentiment/tone/risk and taxonomy category signals, label-based filter rules, replay/admin/MCP/docs updates and proof.
- 2026-04-25 — Implemented CONTENT-ANALYSIS-STAGE-4 with story-cluster summary projection, replay/admin/MCP/docs updates and proof.
- 2026-04-26 — Opened CONTENT-ANALYSIS-HONEST-GREEN-PROOF to close Example A discovery proof, content-analysis MCP doc-parity and RSS smoke timeout residuals.
- 2026-04-25 — Implemented CONTENT-ANALYSIS-STAGE-5 with analysis-policy CRUD/versioning across API, SDK, MCP, admin UI/BFF and docs.
- 2026-04-25 — Implemented CONTENT-ANALYSIS-STAGE-6 with runtime consumption of local deterministic analysis policy configs and provenance.
- 2026-04-25 — Ran CONTENT-ANALYSIS-LIVE-EXAMPLES-PROOF; baseline checks, B/C live discovery/yield, MCP writes/live and direct content-analysis MCP canary passed, with Example A/manual-admin parity and product-full residuals recorded.
- 2026-04-27 — Completed REFACTOR-FULL-LIVE-PROOF-2026-04-27; clean `pnpm test:product:local:full` run `d27c0c5f` passed 17/17 lanes, MCP live was healthy/useful, and compose cleanup left no running containers.

## Active work index

- none
