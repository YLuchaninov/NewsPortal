# Work

Этот файл хранит только live execution state. Он не является backlog, blueprint или историей.

## Свежесть live state

- Последняя проверка этого файла по worktree reality: 2026-04-29
- Последняя проверка blockers/dependencies: 2026-04-29
- Следующая revalidation для blocked items: n/a

## Текущий режим

- Workflow mode: normal
- Разрешенные workflow modes: setup | normal | repair
- Audit overlay: none
- Разрешенные audit overlay values: none | requested | active-read-only | approved-for-apply
- Фокус аудита: n/a
- Почему сейчас: пользователь попросил продолжать по порядку; fetcher provider poller split is committed, selected compose proofs passed and local compose stack was cleaned up.

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

- Worktree status: clean after committing admin UI class-primitive stage.
- Alignment note: committed stage 16 touched only `.aidp/work.md`, `apps/admin/src/lib/admin-ui-classes.ts`, selected admin Astro pages and `DiscoveryHypothesesTab.astro`.
- Scope warning: do not run broad `git clean -fdX`; ignored `.env.*`, `.idea`, `node_modules`, `dist`, `.astro`, `data/models`, `data/snapshots` and other runtime/build artifacts may be locally useful and must only be removed by explicit targeted request.
- Required action before ordinary implementation: open the next scoped AIDP item before continuing broader admin UI cleanup.

### AIDP-ENGINEERING-REFACTORING-UNIFICATION-STAGE-16

- Kind: Stage
- Status: completed
- In scope: introduce a small internal admin UI class-constant module and replace repeated Astro table-header class strings in selected admin pages/components.
- Out of scope: visual redesign, copy changes, layout changes, React component rewrites, form behavior, server writes, API/runtime code, route changes and broad class-string sweeps.
- Allowed paths: `.aidp/work.md`, `apps/admin/src/lib/admin-ui-classes.ts`, and selected `apps/admin/src/pages/` or `apps/admin/src/components/discovery/` Astro files that only consume the constants.
- Risk: low-medium, because Astro class binding must preserve exact class tokens; no behavior or visual changes are intended.
- Required proof: `pnpm lint`; `pnpm typecheck`; `git diff --check --`; targeted `rg` review that replaced only identical class strings.
- Acceptance criteria: repeated table header class strings are centralized for the first admin UI primitive slice; rendered classes remain identical; no copy/layout/behavior changes.
- Architecture note: affected concern is admin UI maintainability and visual consistency; stakeholder/consumer is admin/operator pages; tradeoff is a very small class-token module instead of a broad design-system rewrite.
- Implemented, with evidence: added `apps/admin/src/lib/admin-ui-classes.ts` with table header and actions header class constants.
- Implemented, with evidence: replaced identical admin table header class strings in `channels.astro`, `resources.astro`, `templates/interests.astro`, `templates/llm.astro` and `DiscoveryHypothesesTab.astro`.
- Scope note: no visual redesign, copy, layout, React component rewrites, form behavior, server writes, API/runtime code or routes were changed.
- Passed proof: `pnpm lint` passed, including TS ESLint and Python ruff.
- Passed proof: `pnpm typecheck` passed with 0 errors and existing Astro hints only.
- Passed proof: `git diff --check --` passed.
- Residual note: broader admin UI primitive cleanup remains for repeated metric tiles, form field classes, buttons and page-section shells; those should be split by surface to avoid visual regression.

### AIDP-ENGINEERING-REFACTORING-UNIFICATION-STAGE-15

- Kind: Stage
- Status: completed
- In scope: continue proof-harness cleanup for remaining discovery/live/MVP proof scripts by moving repeated compose/env/http/Firebase/admin helpers onto the shared `infra/scripts/lib/mcp-http-testkit.mjs` APIs.
- Out of scope: scenario assertion changes, root script name changes, compose service definition changes, product/runtime code, API/admin/fetcher/worker behavior, UI visuals, auth semantics, queue/job names, source-channel configs and persistent payload changes.
- Allowed paths: `.aidp/work.md`, `infra/scripts/lib/mcp-http-testkit.mjs`, and selected remaining `infra/scripts/test-*.mjs` proof scripts.
- Risk: medium, because scripts coordinate stateful compose/live proofs, but the slice is harness-only and should preserve command names and scenario logic.
- Required proof: `node --check` for changed scripts and shared testkit; `pnpm lint`; `git diff --check --`; targeted unit/static gates where appropriate; record compose/live proof residuals honestly if not run.
- Acceptance criteria: another meaningful family of remaining proof scripts reuses shared helpers instead of local copies; no root command names or scenario assertions change; no runtime service code changes.
- Architecture note: affected concern is verification maintainability and proof-script cohesion; stakeholder/consumer is future agents/operators running discovery/live/MVP gates; tradeoff is continuing to extend the focused shared testkit only when the helper is already repeated across scripts.
- Implemented, with evidence: extended shared `runCommand` to preserve `status`, `env` overrides and `allowFailure` behavior needed by discovery harnesses.
- Implemented, with evidence: moved duplicated command/env/compose/http health helpers out of `test-discovery-pipeline-nonregression.mjs`.
- Implemented, with evidence: moved duplicated command/env/compose/http helpers out of `test-live-discovery-examples.mjs` while keeping its local detailed JSON error formatter, patch helper and snapshot-aware wait loop.
- Scope note: no scenario assertions, root script names, compose service definitions, product/runtime code, API/admin/fetcher/worker behavior, UI visuals, auth semantics, queue/job names, source-channel configs or persistent payloads were changed.
- Residual note: remaining proof-script cleanup candidates include `test-mvp-internal.mjs`, `test-live-discovery-yield-proof.mjs`, viewport/UI audit Firebase helpers and `test-product-local.mjs` env parsing. These are separate follow-up stages because they have broader product-flow or reporting assumptions.
- Passed proof: `node --check` passed for `infra/scripts/lib/mcp-http-testkit.mjs`, `test-discovery-pipeline-nonregression.mjs` and `test-live-discovery-examples.mjs`.
- Passed proof: `pnpm lint` passed, including TS ESLint over `infra/scripts/**/*.{js,mjs}` and Python ruff.
- Passed proof: `git diff --check --` passed.
- Compose/live proof note: discovery compose/live gates were not executed in this harness-only slice because root commands and scenario assertions were preserved; run them when a later runtime/scenario behavior stage touches these flows.

### AIDP-ENGINEERING-REFACTORING-UNIFICATION-STAGE-14

- Kind: Stage
- Status: completed
- In scope: further behavior-preserving consolidation of repeated compose/live proof-script helpers into `infra/scripts/lib/mcp-http-testkit.mjs` or a focused proof helper, starting with the remaining admin/website/discovery/RSS proof scripts.
- Out of scope: product/runtime behavior changes, compose service definitions, root script names, scenario assertions, fixture semantics, admin/API/fetcher/worker code, UI visual changes, auth semantics, queue/job names, source-channel config and persistent payload changes.
- Allowed paths: `.aidp/work.md`, `infra/scripts/lib/mcp-http-testkit.mjs`, and selected `infra/scripts/test-*.mjs` proof scripts.
- Risk: medium, because proof scripts coordinate compose lifecycle and persistent fixtures, but the intended change is harness-only and must preserve root command names and scenario assertions.
- Required proof: `node --check` for changed scripts and shared testkit; targeted script smoke where safe without starting long compose; `pnpm lint`; `git diff --check --`; record compose-proof residuals honestly if not run in this slice.
- Acceptance criteria: at least one meaningful family of remaining proof scripts uses shared command/env/http/admin-auth helpers instead of local duplicates; root script names and external behavior remain compatible; no runtime service code changes.
- Architecture note: affected concern is verification maintainability and proof-script cohesion; stakeholder/consumer is future agents/operators running compose/live gates; tradeoff is extending the existing focused `mcp-http-testkit.mjs` instead of introducing a broad generic helper layer unless necessary.
- Implemented, with evidence: added `runComposeCapture`, command failure diagnostics and fatal-error support for `waitFor` to `infra/scripts/lib/mcp-http-testkit.mjs`.
- Implemented, with evidence: moved duplicated command/env/http/admin allowlist/Firebase helpers out of `test-website-admin-flow.mjs`, `test-rss-multi-flow.mjs`, `test-discovery-admin-flow.mjs` and `test-live-website-matrix.mjs`.
- Scope note: no root script names, scenario assertions, compose service definitions, product/runtime code, UI visuals, auth semantics, queue/job names, source-channel config or persistent payloads were changed.
- Residual note: remaining proof-script candidates still exist in discovery nonregression/live examples/yield, `test-mvp-internal.mjs`, viewport/UI audit Firebase helpers and `test-product-local.mjs` env parsing; they should be handled in later scoped stages.
- Passed proof: `node --check` passed for `infra/scripts/lib/mcp-http-testkit.mjs`, `test-website-admin-flow.mjs`, `test-rss-multi-flow.mjs`, `test-discovery-admin-flow.mjs` and `test-live-website-matrix.mjs`.
- Passed proof: `pnpm lint` passed, including TS ESLint over `infra/scripts/**/*.{js,mjs}` and Python ruff.
- Passed proof: `pnpm typecheck` passed with 0 errors and existing Astro hints only.
- Passed proof: `pnpm unit_tests:ts` passed with 246 tests.
- Passed proof: `git diff --check --` passed.
- Compose/live proof note: targeted compose/live proof scripts were not executed in this harness-only slice because assertions/root commands were preserved and the changed code was structurally checked; run the relevant compose gate when a later runtime or scenario-behavior stage touches those flows.

### AIDP-ENGINEERING-REFACTORING-FETCHER-STAGE-13

- Kind: Stage
- Status: completed
- In scope: extract Email IMAP source-channel provider polling from `services/fetchers/src/fetchers.ts` into a focused provider module using explicit cursor, persistence and mark-success callbacks.
- Out of scope: IMAP behavior changes, message filtering changes, queue/job name changes, persisted payload changes, source-channel config changes, channel completion behavior changes, duplicate preflight behavior changes, outbox behavior changes, API/admin/UI changes and compose runtime behavior changes.
- Allowed paths: `.aidp/work.md`, `services/fetchers/src/fetchers.ts`, and a new focused Email IMAP provider poller module under `services/fetchers/src/`.
- Risk: medium-high, because IMAP polling owns external client lifecycle and UID cursor updates, but this slice preserves the moved function body and keeps persistence/service state callbacks explicit.
- Required proof: `pnpm unit_tests:ts`; `pnpm typecheck`; `pnpm lint`; `git diff --check --`.
- Acceptance criteria: Email IMAP provider flow no longer lives inline in `fetchers.ts`; `FetcherService` still owns scheduling, leases, error handling, persistence repository and health state; public `RssFetcherService` export remains compatible; no wire/persisted behavior changes.
- Implemented, with evidence: added `services/fetchers/src/fetcher-email-imap-poller.ts` for Email IMAP source-channel polling with explicit cursor, article-persistence and channel-success callbacks.
- Implemented, with evidence: reduced `services/fetchers/src/fetchers.ts` from 435 to 295 lines, leaving provider dispatch, scheduling, leases, failure handling, repository ownership, health state and `RssFetcherService` compatibility in the service.
- Scope note: no IMAP behavior, message filtering, queue/job name, persisted payload, source-channel config, channel completion, duplicate preflight, outbox, API/admin/UI or compose runtime behavior changes were made in this slice.
- Residual note: provider pollers are now split; remaining fetcher follow-ups are compose proof runs and smaller cleanup around shared provider dependency factories if future duplication appears.
- Passed proof: `pnpm unit_tests:ts` passed with 246 tests.
- Passed proof: `pnpm typecheck` passed with 0 errors and existing Astro hints only.
- Passed proof: `pnpm lint` passed, including TS ESLint and Python ruff.
- Passed proof: `git diff --check --` passed.
- Passed post-commit compose proof: `pnpm test:website:compose` passed for channel `79b3fa53-866f-4352-87c6-2a83f2290a27` after starting the local compose stack.
- Passed post-commit compose proof: `pnpm test:hard-sites:compose` passed for channels `b2304f36-b91a-4ba7-9fdf-d0f6ad95bcf5` and `2c16dfc3-c8b5-4e15-9db0-059860053602`.
- Cleanup proof: `pnpm dev:mvp:internal:down` completed and `docker ps --format '{{.Names}}'` returned no running project containers.

### AIDP-ENGINEERING-REFACTORING-FETCHER-STAGE-12

- Kind: Stage
- Status: completed
- In scope: extract Website source-channel provider polling from `services/fetchers/src/fetchers.ts` into a focused provider module using explicit crawl-policy-cache, persistence and mark-success callbacks.
- Out of scope: IMAP provider extraction, website discovery behavior changes, crawl policy changes, auth behavior changes, queue/job name changes, persisted payload changes, source-channel config changes, channel completion behavior changes, outbox behavior changes, API/admin/UI changes and compose runtime behavior changes.
- Allowed paths: `.aidp/work.md`, `services/fetchers/src/fetchers.ts`, and a new focused Website provider poller module under `services/fetchers/src/`.
- Risk: medium-high, because Website polling coordinates crawl policy cache, discovery modes, resource persistence and provider metrics, but this slice preserves the moved function body and delegates service-owned dependencies explicitly.
- Required proof: `pnpm unit_tests:ts`; `pnpm typecheck`; `pnpm lint`; `git diff --check --`.
- Acceptance criteria: Website provider flow no longer lives inline in `fetchers.ts`; `FetcherService` still owns scheduling, leases, error handling, persistence repository and health state; public `RssFetcherService` export remains compatible; no wire/persisted behavior changes.
- Implemented, with evidence: added `services/fetchers/src/fetcher-website-poller.ts` for Website source-channel polling with explicit crawl-policy-cache, cursor, resource-persistence and channel-success callbacks.
- Implemented, with evidence: reduced `services/fetchers/src/fetchers.ts` from 569 to 435 lines while preserving service-owned scheduling, leases, failure handling, repository ownership, health state and `RssFetcherService` compatibility.
- Scope note: no IMAP provider extraction, website discovery behavior, crawl policy, auth behavior, queue/job name, persisted payload, source-channel config, channel completion, outbox, API/admin/UI or compose runtime behavior changes were made in this slice.
- Residual note: Email IMAP provider poller remains in `fetchers.ts` and should be extracted separately because it owns IMAP client lifecycle and message cursor handling.
- Passed proof: `pnpm unit_tests:ts` passed with 246 tests.
- Passed proof: `pnpm typecheck` passed with 0 errors and existing Astro hints only.
- Passed proof: `pnpm lint` passed, including TS ESLint and Python ruff.
- Passed proof: `git diff --check --` passed.

### AIDP-ENGINEERING-REFACTORING-FETCHER-STAGE-11

- Kind: Stage
- Status: completed
- In scope: extract RSS source-channel provider polling from `services/fetchers/src/fetchers.ts` into a focused provider module using explicit persistence, mark-success and duplicate-counter callbacks.
- Out of scope: Website/IMAP provider extraction, RSS adapter behavior changes, queue/job name changes, persisted payload changes, source-channel config changes, channel completion behavior changes, duplicate preflight behavior changes, outbox behavior changes, API/admin/UI changes and compose runtime behavior changes.
- Allowed paths: `.aidp/work.md`, `services/fetchers/src/fetchers.ts`, and a new focused RSS provider poller module under `services/fetchers/src/`.
- Risk: medium-high, because RSS polling coordinates feed adapters, cursors, duplicate preflight and adapter drop counters, but this slice preserves the moved function body and delegates service-owned state updates explicitly.
- Required proof: `pnpm unit_tests:ts`; `pnpm typecheck`; `pnpm lint`; `git diff --check --`.
- Acceptance criteria: RSS provider flow no longer lives inline in `fetchers.ts`; `FetcherService` still owns scheduling, leases, error handling, persistence repository and health state; public `RssFetcherService` export remains compatible; no wire/persisted behavior changes.
- Implemented, with evidence: added `services/fetchers/src/fetcher-rss-poller.ts` for RSS source-channel polling with explicit cursor, persistence, channel-success and duplicate-counter callbacks.
- Implemented, with evidence: reduced `services/fetchers/src/fetchers.ts` from 745 to 569 lines while preserving service-owned scheduling, leases, failure handling, repository ownership, health state and `RssFetcherService` compatibility.
- Scope note: no Website/IMAP provider extraction, RSS adapter behavior, queue/job name, persisted payload, source-channel config, channel completion, duplicate preflight, outbox, API/admin/UI or compose runtime behavior changes were made in this slice.
- Residual note: Website and Email IMAP provider pollers remain in `fetchers.ts` and should be extracted as separate stages because they involve crawl policy cache state and IMAP client lifecycle.
- Passed proof: `pnpm unit_tests:ts` passed with 246 tests.
- Passed proof: `pnpm typecheck` passed with 0 errors and existing Astro hints only.
- Passed proof: `pnpm lint` passed, including TS ESLint and Python ruff.
- Passed proof: `git diff --check --` passed.

### AIDP-ENGINEERING-REFACTORING-FETCHER-STAGE-10

- Kind: Stage
- Status: completed
- In scope: extract API source-channel provider polling from `services/fetchers/src/fetchers.ts` into a focused provider module using explicit dependency callbacks.
- Out of scope: RSS/Website/IMAP provider extraction, queue/job name changes, persisted payload changes, source-channel config changes, channel completion behavior changes, duplicate preflight behavior changes, outbox behavior changes, API/admin/UI changes and compose runtime behavior changes.
- Allowed paths: `.aidp/work.md`, `services/fetchers/src/fetchers.ts`, and a new focused API provider poller module under `services/fetchers/src/`.
- Risk: medium, because API polling writes article inputs and channel cursors, but this slice preserves the moved function body and delegates persistence/mark-success through existing service methods.
- Required proof: `pnpm unit_tests:ts`; `pnpm typecheck`; `pnpm lint`; `git diff --check --`.
- Acceptance criteria: API provider flow no longer lives inline in `fetchers.ts`; `FetcherService` still owns scheduling, leases, error handling, persistence repository and health state; public `RssFetcherService` export remains compatible; no wire/persisted behavior changes.
- Implemented, with evidence: added `services/fetchers/src/fetcher-api-poller.ts` for API source-channel polling with explicit persistence and channel-success callbacks.
- Implemented, with evidence: reduced `services/fetchers/src/fetchers.ts` from 851 to 745 lines while keeping `FetcherService` responsible for scheduling, leases, failure handling, repository ownership, state counters and `RssFetcherService` compatibility.
- Scope note: no RSS/Website/IMAP provider extraction, queue/job name, persisted payload, source-channel config, channel completion, duplicate preflight, outbox, API/admin/UI or compose runtime behavior changes were made in this slice.
- Residual note: RSS, Website and Email IMAP provider pollers remain in `fetchers.ts` and should be extracted as separate stages because they involve RSS adapter counters, crawl policy cache state and IMAP client lifecycle respectively.
- Passed proof: `pnpm unit_tests:ts` passed with 246 tests.
- Passed proof: `pnpm typecheck` passed with 0 errors and existing Astro hints only.
- Passed proof: `pnpm lint` passed, including TS ESLint and Python ruff.
- Passed proof: `git diff --check --` passed.

### AIDP-ENGINEERING-REFACTORING-PROOF-HARNESS-STAGE-9

- Kind: Stage
- Status: completed
- In scope: move duplicated command/env/http/wait/admin-email helpers from `test-web-viewports.mjs` and `test-ui-button-audit.mjs` onto `infra/scripts/lib/mcp-http-testkit.mjs`.
- Out of scope: compose service list changes, Playwright scenario changes, fixture data changes, assertions changes, auth behavior changes, page interaction changes, root script name changes and runtime app behavior changes.
- Allowed paths: `.aidp/work.md`, `infra/scripts/lib/mcp-http-testkit.mjs`, `infra/scripts/test-web-viewports.mjs`, `infra/scripts/test-ui-button-audit.mjs`.
- Risk: medium, because proof harness import order and helper defaults affect stateful UI proof scripts, but the slice only removes duplicated implementations and keeps call sites equivalent.
- Required proof: `node --check infra/scripts/lib/mcp-http-testkit.mjs`; `node --check infra/scripts/test-web-viewports.mjs`; `node --check infra/scripts/test-ui-button-audit.mjs`; `pnpm lint`; `git diff --check --`.
- Acceptance criteria: duplicated helper implementations disappear from selected UI proof scripts; shared helper APIs remain backward-compatible; compose command names, scenarios and assertions remain unchanged.
- Implemented, with evidence: extended `infra/scripts/lib/mcp-http-testkit.mjs` with shared `fetchJson`, timeout-aware `postForm`, health-wait options and richer JSON error detail handling while keeping existing exports backward-compatible.
- Implemented, with evidence: moved duplicated command/env/form/http/admin-email helper implementations out of `test-web-viewports.mjs` and `test-ui-button-audit.mjs` onto the shared proof testkit.
- Compatibility note: selected UI scripts keep their root names, compose service lists, Playwright scenarios, seeded data, assertions and 120-second local wait defaults.
- Scope note: no compose service list, Playwright scenario, fixture data, assertion, auth behavior, page interaction, root script name or runtime app behavior changes were made in this slice.
- Residual note: `test-discovery-admin-flow.mjs`, `test-rss-multi-flow.mjs`, `test-website-admin-flow.mjs`, `test-live-website-matrix.mjs` and discovery/live proof families still have local helper duplication and should be handled as separate scoped stages.
- Passed proof: `node --check infra/scripts/lib/mcp-http-testkit.mjs` passed.
- Passed proof: `node --check infra/scripts/test-web-viewports.mjs` passed.
- Passed proof: `node --check infra/scripts/test-ui-button-audit.mjs` passed.
- Passed proof: `pnpm lint` passed, including TS ESLint and Python ruff.
- Passed proof: `git diff --check --` passed.

### AIDP-ENGINEERING-REFACTORING-UNIFICATION-STAGE-8

- Kind: Sweep
- Status: completed
- In scope: continue low-risk unification by moving more repeated Python unit dependency stubs and selected proof-script harness helpers onto existing shared support modules.
- Out of scope: compose scenario behavior changes, fixture lifecycle changes, broad UI class rewrites, fetcher provider poller extraction, API/worker/fetcher runtime behavior changes, public routes/payloads and dependency changes.
- Allowed paths: `.aidp/work.md`, `tests/unit/python/support/`, selected `tests/unit/python/test_*.py`, `infra/scripts/lib/mcp-http-testkit.mjs`, and selected `infra/scripts/test-*.mjs` proof scripts.
- Risk: medium, because test/proof harness import order matters, but behavior remains unchanged and proof is bounded.
- Required proof: `python -m compileall tests/unit/python/support selected tests`; targeted `python -m unittest` for changed Python tests; `node --check` for changed proof scripts; `pnpm unit_tests:py`; `pnpm lint`; `git diff --check --`.
- Acceptance criteria: more repeated dependency stubs disappear from tests/proof scripts; shared helper APIs remain backward-compatible; root proof script names and scenario assertions remain unchanged.
- Implemented, with evidence: added `install_gemini_stub` to `tests/unit/python/support/stubs.py` and moved the duplicated Gemini module bootstrap out of sequence-management and zero-shot operator API tests.
- Implemented, with evidence: moved additional repeated psycopg bootstrap blocks in API/discovery unit tests onto shared `install_psycopg_stub`.
- Scope note: no compose proof script behavior, fixture lifecycle, runtime service behavior, public routes/payloads or dependency changes were made in this slice.
- Residual note: deeper proof-script harness consolidation, broad admin UI class constants and fetcher provider poller extraction remain separate follow-up items.
- Passed proof: `python -m compileall tests/unit/python/support selected tests` passed.
- Passed proof: `python -m unittest tests.unit.python.test_api_sequence_management tests.unit.python.test_api_zero_shot_operator_surfaces` passed with 34 tests.
- Passed proof: `pnpm unit_tests:py` passed with 316 tests.
- Passed proof: `pnpm lint` passed, including TS ESLint and Python ruff.
- Passed proof: `git diff --check --` passed.

### AIDP-ENGINEERING-REFACTORING-UNIFICATION-STAGE-7

- Kind: Stage
- Status: completed
- In scope: behavior-preserving unification of repeated admin channel parsing helpers, admin client/view helpers, repeated admin UI class constants, proof-script harness helpers, Python unit dependency stubs and a safe fetchers provider-orchestration split.
- Out of scope: visual redesign, public endpoint/payload/SDK changes, auth semantics changes, queue/job name changes, source-channel config changes, persistence/outbox semantics changes, production deploy/release gates and broad unrelated formatting.
- Allowed paths: `.aidp/work.md`, `apps/admin/src/lib/server/`, `apps/admin/src/components/`, selected `apps/admin/src/pages/` and `apps/admin/src/components/discovery/` class-constant replacements, selected `apps/web/src/` view helper replacements, `infra/scripts/`, `tests/unit/python/`, and `services/fetchers/src/`.
- Risk: medium-high, because this crosses UI, proof scripts, test harnesses and fetcher orchestration, but each sub-slice must remain behavior-preserving and independently provable.
- Required proof: `git diff --check --`; `pnpm unit_tests:ts`; `pnpm unit_tests:py`; `pnpm typecheck`; `pnpm lint`; targeted compose/UI gates only where touched harness/runtime behavior requires them.
- Acceptance criteria: duplicated helper implementations are replaced by focused internal modules; provider-specific validation messages remain stable; `RssFetcherService` export compatibility remains; proof scripts keep the same root command names; no visual redesign or wire behavior changes.
- Architecture note: affected concern is extensibility and cohesion for admin inputs, operator UI surfaces, proof harnesses, Python unit setup and fetcher provider orchestration; tradeoff is focused internal helper modules over a broad framework rewrite.
- Implemented, with evidence: added `apps/admin/src/lib/server/source-channel-form.ts` and replaced duplicated RSS/API/Website channel form parsing, auth-header update and URL validation helpers while preserving provider-specific error prefixes.
- Implemented, with evidence: added `apps/admin/src/components/admin-client-helpers.ts` and replaced duplicated `readText`, `readCount`, UTC timestamp, status-badge and JSON post helpers in automation/MCP React surfaces.
- Implemented, with evidence: expanded `infra/scripts/lib/mcp-http-testkit.mjs` with configurable proof names and admin email prefixes, then moved `infra/scripts/test-automation-admin-flow.mjs` onto shared env/compose/http/Firebase helpers while preserving the root script.
- Implemented, with evidence: added `tests/unit/python/support/stubs.py` and moved three repeated API unit-test psycopg bootstrap blocks onto `install_psycopg_stub`.
- Implemented, with evidence: added `services/fetchers/src/fetcher-persist-inputs.ts` and moved pure RSS/website persist-input builders out of `services/fetchers/src/fetchers.ts` without changing provider polling flow or `RssFetcherService` compatibility.
- Scope note: no public endpoint, payload, source-channel config, queue/job name, persistence/outbox semantic, visual redesign or compose command name changes were made in this slice.
- Residual note: larger follow-up candidates remain for broad Astro class constants, remaining proof scripts, remaining Python test stubs and deeper fetcher provider poller modules.
- Passed proof: `pnpm unit_tests:ts` passed with 246 tests.
- Passed proof: `pnpm unit_tests:py` passed with 316 tests.
- Passed proof: `pnpm typecheck` passed with 0 errors and existing Astro hints only.
- Passed proof: `pnpm lint` passed, including TS ESLint and Python ruff.
- Passed proof: `node --check infra/scripts/test-automation-admin-flow.mjs` and `node --check infra/scripts/lib/mcp-http-testkit.mjs` passed.
- Passed proof: `python -m compileall tests/unit/python/support tests/unit/python/test_api_channels.py tests/unit/python/test_api_user_interests.py tests/unit/python/test_api_discovery_management.py` passed.
- Passed proof: `git diff --check --` passed.

### AIDP-ENGINEERING-REFACTORING-ADMIN-UI-STAGE-6B

- Kind: Stage
- Status: completed
- In scope: continue admin UI decomposition by moving `AutomationEditorWorkspace` pure read helpers, status class helper, JSON post helper and task graph edge/reindex helpers into a focused model/helper module.
- Out of scope: visual redesign, React Flow node rendering changes, workflow save/archive/run payload changes, BFF/server write changes, automation graph semantics changes, fetcher/API/worker refactors and compose runtime behavior changes.
- Allowed paths: `.aidp/work.md`, `apps/admin/src/components/AutomationEditorWorkspace.tsx`, and a new focused automation editor helper module under `apps/admin/src/components/`.
- Risk: low-medium, because helpers touch graph ordering and save/run errors, but this slice preserves function bodies and call sites.
- Required proof: `pnpm unit_tests:ts`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`.
- Acceptance criteria: pure helper implementations no longer live inline in `AutomationEditorWorkspace.tsx`; React Flow node rendering, user controls and BFF payloads stay unchanged; no visual redesign.
- Architecture note: affected concern is admin automation workspace cohesion; stakeholder/consumer is operators editing automation sequences; tradeoff is a helper module before deeper palette/inspector/canvas component extraction.
- Implemented, with evidence: added `apps/admin/src/components/automation-editor-workspace-model.ts` for JSON-ish value readers, status class helper, `postJson`, `moduleToKey`, `buildEdges` and `reindexTaskNodes`.
- Compatibility note: `AutomationEditorWorkspace.tsx` still owns React Flow node rendering, palette/inspector UI, save/archive/run handlers and BFF payload construction.
- Scope note: no visual redesign, React Flow node rendering, workflow save/archive/run payload, BFF/server write, automation graph semantics, fetcher/API/worker or compose runtime behavior changes were made in this slice.
- Passed proof: `pnpm unit_tests:ts` passed with 246 tests.
- Passed proof: `pnpm lint` passed, including TS ESLint and Python ruff.
- Passed proof: `pnpm typecheck` passed with 0 errors and existing Astro hints only.
- Passed proof: `git diff --check --` passed.

### AIDP-ENGINEERING-REFACTORING-ADMIN-UI-STAGE-6A

- Kind: Stage
- Status: completed
- In scope: begin admin UI decomposition by moving `ChannelEditorForm` provider flags, labels, descriptions, placeholders and small form helpers into a focused view-model module.
- Out of scope: visual redesign, form field name changes, POST payload changes, BFF/server write changes, provider behavior changes, fetcher/API/worker refactors and compose runtime behavior changes.
- Allowed paths: `.aidp/work.md`, `apps/admin/src/components/ChannelEditorForm.tsx`, and a new focused channel editor view-model module under `apps/admin/src/components/`.
- Risk: low-medium, because this moves visible copy and provider condition flags but should keep JSX, field names and default values stable.
- Required proof: `pnpm unit_tests:ts`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`.
- Acceptance criteria: channel editor provider view-model logic no longer lives inline in `ChannelEditorForm.tsx`; component rendering and form field names stay unchanged; no visual redesign or server payload changes.
- Architecture note: affected concern is admin UI component cohesion; stakeholder/consumer is channel create/edit admin operators; tradeoff is a typed view-model helper before deeper section component extraction.
- Implemented, with evidence: added `apps/admin/src/components/channel-editor-form-model.ts` for `ChannelEditorForm` provider flags, labels, descriptions, placeholders, helper constants and exported form value types.
- Compatibility note: `apps/admin/src/components/ChannelEditorForm.tsx` still exports `ChannelEditorFormValue` and `ChannelProviderType` through re-exports; JSX, form field names and submit/cancel behavior are unchanged.
- Scope note: no visual redesign, form field name, POST payload, BFF/server write, provider behavior, fetcher/API/worker or compose runtime behavior changes were made in this slice.
- Passed proof: `pnpm unit_tests:ts` passed with 246 tests.
- Passed proof: `pnpm lint` passed, including TS ESLint and Python ruff.
- Passed proof: `pnpm typecheck` passed with 0 errors and existing Astro hints only.
- Passed proof: `git diff --check --` passed.

### AIDP-ENGINEERING-REFACTORING-FETCHER-STAGE-5F

- Kind: Stage
- Status: completed
- In scope: begin `services/fetchers/src/fetchers.ts` orchestration decomposition by moving shared channel helper functions and `ChannelFetchError` into a focused helper module.
- Out of scope: polling flow changes, provider behavior changes, concurrency changes, persistence/preflight changes, queue/outbox changes, config parsing changes, API/admin/UI refactors and compose runtime behavior changes.
- Allowed paths: `.aidp/work.md`, `services/fetchers/src/fetchers.ts`, and a new focused fetcher channel helper module under `services/fetchers/src/`.
- Risk: low-medium, because helpers affect RSS/API/email normalization and fetch failure classification, but this slice preserves function bodies and call sites.
- Required proof: `pnpm unit_tests:ts`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`.
- Acceptance criteria: shared helper/error implementations no longer live in `fetchers.ts`; existing provider polling methods import and use the same helper names; public `RssFetcherService` behavior and exports remain unchanged.
- Architecture note: affected concern is fetcher service cohesion and provider orchestration readability; stakeholder/consumer is RSS/API/email/website polling and channel run diagnostics; tradeoff is one helper module before larger provider-flow extraction.
- Implemented, with evidence: added `services/fetchers/src/fetcher-channel-helpers.ts` for `ChannelFetchError`, text/body/url helpers, path lookup, retry-after parsing and failure classification.
- Compatibility note: `services/fetchers/src/fetchers.ts` still owns `FetcherService` and `RssFetcherService`; provider polling call sites import the same helper names.
- Scope note: no polling flow, provider behavior, concurrency, persistence/preflight, queue/outbox, config parsing, API/admin/UI or compose runtime behavior changes were made in this slice.
- Passed proof: `pnpm unit_tests:ts` passed with 246 tests.
- Passed proof: `pnpm lint` passed, including TS ESLint and Python ruff.
- Passed proof: `pnpm typecheck` passed with 0 errors and existing Astro hints only after restoring the remaining direct `canonicalizeUrl` import.
- Passed proof: `git diff --check --` passed.

### AIDP-ENGINEERING-REFACTORING-FETCHER-STAGE-5E

- Kind: Stage
- Status: completed
- In scope: continue resource enrichment decomposition by moving resource load, stored projection replay conversion, extraction persistence SQL and projected article/outbox SQL from `services/fetchers/src/resource-enrichment.ts` into a focused persistence repository module.
- Out of scope: SQL semantics changes, projection policy changes, article/outbox payload changes, extraction/classification/fetch policy changes, provider behavior changes, service API changes, queue changes, worker/API/admin/UI refactors and compose runtime behavior changes.
- Allowed paths: `.aidp/work.md`, `services/fetchers/src/resource-enrichment.ts`, and a new focused resource enrichment persistence module under `services/fetchers/src/`.
- Risk: medium-high, because the slice moves DB writes and article projection/outbox fanout, but it must preserve query text, payloads, public results and constructor behavior.
- Required proof: `pnpm unit_tests:ts`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`.
- Acceptance criteria: resource load/persist/projected article SQL implementations no longer live in `resource-enrichment.ts`; `ResourceEnrichmentService` remains the public orchestration API; no persisted field, outbox event, projection decision or result-shape behavior changes.
- Architecture note: affected concern is resource enrichment cohesion and PostgreSQL ownership; stakeholder/consumer is website projection replay, article ingestion fanout and resource admin surfaces; tradeoff is a focused repository module while keeping service orchestration stable.
- Implemented, with evidence: added `services/fetchers/src/resource-enrichment-persistence.ts` owning resource load SQL, stored projection conversion, extraction persistence SQL and projected article/outbox SQL.
- Compatibility note: `ResourceEnrichmentService` remains the public orchestration API and now delegates load/persist operations through `ResourceEnrichmentRepository`.
- Scope note: no SQL semantics, projection policy, article/outbox payload, extraction/classification/fetch policy, provider behavior, service API, queue, worker/API/admin/UI or compose runtime behavior changes were made in this slice.
- Passed proof: `pnpm unit_tests:ts` passed with 246 tests.
- Passed proof: `pnpm lint` passed, including TS ESLint and Python ruff.
- Passed proof: `pnpm typecheck` passed with 0 errors and existing Astro hints only.
- Passed proof: `git diff --check --` passed.

### AIDP-ENGINEERING-REFACTORING-FETCHER-STAGE-5D

- Kind: Stage
- Status: completed
- In scope: continue resource enrichment decomposition by moving projectability/body/projection-state decision helpers out of `services/fetchers/src/resource-enrichment.ts` into a focused projection helper module.
- Out of scope: projection policy changes, article upsert SQL changes, observation/outbox behavior changes, extraction/classification/fetch policy changes, provider behavior changes, service API changes, queue changes, worker/API/admin/UI refactors and compose runtime behavior changes.
- Allowed paths: `.aidp/work.md`, `services/fetchers/src/resource-enrichment.ts`, and a new focused projection helper module under `services/fetchers/src/`.
- Risk: medium, because projection decisions control common article pipeline fanout, but this slice is a pure helper extraction with identical decision branches and error labels.
- Required proof: `pnpm unit_tests:ts`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`.
- Acceptance criteria: projection decision helper implementations no longer live in `resource-enrichment.ts`; `ResourceEnrichmentService.persistExtraction` behavior and public result shape remain unchanged; no SQL/outbox/projection policy changes.
- Architecture note: affected concern is resource enrichment cohesion and projection policy ownership; stakeholder/consumer is website resource projection replay and article-ingest outbox fanout; tradeoff is a typed helper input contract instead of using the service-private persistence shape directly.
- Implemented, with evidence: moved projectability, projectable body and projection-state decision helpers into `services/fetchers/src/resource-enrichment-projection.ts`.
- Compatibility note: `services/fetchers/src/resource-enrichment.ts` still owns `ResourceEnrichmentService`, `ExtractionPersistShape`, SQL persistence and outbox fanout; it now imports `resolveProjectionDecision` from the focused helper module.
- Scope note: no projection policy branches, error labels, article upsert SQL, observation/outbox behavior, extraction/classification/fetch policy, provider behavior, service API, queue, worker/API/admin/UI or compose runtime behavior changes were made in this slice.
- Passed proof: `pnpm unit_tests:ts` passed with 246 tests.
- Passed proof: `pnpm lint` passed, including TS ESLint and Python ruff.
- Passed proof: `pnpm typecheck` passed with 0 errors and existing Astro hints only.
- Passed proof: `git diff --check --` passed.

### AIDP-ENGINEERING-REFACTORING-FETCHER-STAGE-5C

- Kind: Stage
- Status: completed
- In scope: continue fetcher decomposition by extracting the duplicated `AsyncSemaphore` implementation from `services/fetchers/src/fetchers.ts`, `services/fetchers/src/enrichment.ts` and `services/fetchers/src/resource-enrichment.ts` into one focused fetcher utility module.
- Out of scope: concurrency limit value changes, fetch policy changes, provider behavior changes, enrichment/projection/persistence SQL changes, service API changes, queue/outbox changes, worker/API/admin/UI refactors and compose runtime behavior changes.
- Allowed paths: `.aidp/work.md`, `services/fetchers/src/fetchers.ts`, `services/fetchers/src/enrichment.ts`, `services/fetchers/src/resource-enrichment.ts`, and a new focused fetcher semaphore module under `services/fetchers/src/`.
- Risk: low-medium, because the duplicated primitive gates fetcher/enrichment concurrency, but this slice keeps constructor and acquire/release semantics identical.
- Required proof: `pnpm unit_tests:ts`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`.
- Acceptance criteria: only one `AsyncSemaphore` implementation exists in fetcher source; the three existing call sites import it; no runtime concurrency settings or fetch/enrichment behavior change.
- Architecture note: affected concern is fetcher orchestration cohesion and shared utility ownership; stakeholder/consumer is RSS/website polling plus article/resource enrichment; tradeoff is one small shared utility module rather than three private duplicates.
- Implemented, with evidence: added `services/fetchers/src/async-semaphore.ts` and replaced local `AsyncSemaphore` implementations in `services/fetchers/src/fetchers.ts`, `services/fetchers/src/enrichment.ts` and `services/fetchers/src/resource-enrichment.ts` with imports.
- Scope note: no concurrency limit values, fetch policy, provider behavior, enrichment/projection/persistence SQL, service API, queue/outbox, worker/API/admin/UI or compose runtime behavior changes were made in this slice.
- Passed proof: `pnpm unit_tests:ts` passed with 246 tests.
- Passed proof: `pnpm lint` passed, including TS ESLint and Python ruff.
- Passed proof: `pnpm typecheck` passed with 0 errors and existing Astro hints only.
- Passed proof: `git diff --check --` passed.

### AIDP-ENGINEERING-REFACTORING-FETCHER-STAGE-5B

- Kind: Stage
- Status: completed
- In scope: continue fetcher enrichment decomposition by moving resource classification/decision helpers out of `services/fetchers/src/resource-enrichment.ts` into a focused helper module while preserving existing exports from `resource-enrichment.ts`.
- Out of scope: classification logic changes, fetch policy changes, provider behavior changes, projection/persistence SQL changes, service API changes, queue/outbox changes, worker/API/admin/UI refactors and compose runtime behavior changes.
- Allowed paths: `.aidp/work.md`, `services/fetchers/src/resource-enrichment.ts`, and a new focused classification helper module under `services/fetchers/src/`.
- Risk: medium, because resource classification affects website projection, but this slice is behavior-preserving extraction of already tested pure helpers.
- Required proof: `pnpm unit_tests:ts`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`.
- Acceptance criteria: classification helper implementations no longer live in `resource-enrichment.ts`; `resolveEditorialExtractorDecision`, `buildWebsiteResourceClassificationJson` and `shouldRetainDiscoveryEditorialKind` remain import-compatible from `resource-enrichment.ts`; resource enrichment unit tests pass; no classification behavior changes.
- Architecture note: affected concern is fetcher enrichment cohesion and classification helper ownership; stakeholder/consumer is website ingestion, projection replay and admin/resource tests; tradeoff is one focused helper module while preserving the public `resource-enrichment.ts` export surface.
- Implemented, with evidence: moved classification and editorial decision helper implementations into `services/fetchers/src/resource-enrichment-classification.ts`.
- Compatibility note: `services/fetchers/src/resource-enrichment.ts` still re-exports `resolveEditorialExtractorDecision`, `buildWebsiteResourceClassificationJson` and `shouldRetainDiscoveryEditorialKind`.
- Scope note: no classification logic, fetch policy, provider behavior, projection/persistence SQL, service API, queue/outbox, worker/API/admin/UI or compose runtime behavior changes were made in this slice.
- Passed proof: `pnpm unit_tests:ts` passed with 246 tests, including resource-enrichment website tests.
- Passed proof: `pnpm lint` passed, including TS ESLint and Python ruff.
- Passed proof: `pnpm typecheck` passed with 0 errors and existing Astro hints only.
- Passed proof: `git diff --check --` passed.

### AIDP-ENGINEERING-REFACTORING-FETCHER-STAGE-5A

- Kind: Stage
- Status: completed
- In scope: begin fetcher enrichment decomposition by moving pure HTML/content extraction helpers out of `services/fetchers/src/resource-enrichment.ts` into a focused helper module while preserving all existing exports from `resource-enrichment.ts`.
- Out of scope: fetch policy changes, provider behavior changes, projection/persistence SQL changes, resource classification behavior changes, service API changes, queue/outbox changes, worker/API/admin/UI refactors and compose runtime behavior changes.
- Allowed paths: `.aidp/work.md`, `services/fetchers/src/resource-enrichment.ts`, and a new focused helper module under `services/fetchers/src/`.
- Risk: medium, because resource enrichment feeds website projection and outbox fanout, but this slice is behavior-preserving extraction of pure helpers.
- Required proof: `pnpm unit_tests:ts`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`.
- Acceptance criteria: HTML/content helper implementations no longer live in `resource-enrichment.ts`; `ResourceEnrichmentService` and exported helper functions remain import-compatible; website/resource enrichment unit tests pass; no persistence/projection/classification behavior changes.
- Architecture note: affected concern is fetcher enrichment cohesion and parsing/helper ownership; stakeholder/consumer is website ingestion, projection replay and hard-sites proof; tradeoff is one focused helper module while keeping the public `resource-enrichment.ts` surface stable.
- Implemented, with evidence: moved HTML/content helper implementations into `services/fetchers/src/resource-enrichment-extraction.ts` and imported them from `services/fetchers/src/resource-enrichment.ts`.
- Scope note: no fetch policy, provider behavior, projection/persistence SQL, classification behavior, service API, queue/outbox, worker/API/admin/UI or compose runtime behavior changes were made in this slice.
- Passed proof: `pnpm unit_tests:ts` passed with 246 tests, including resource-enrichment website tests.
- Passed proof: `pnpm lint` passed, including TS ESLint and Python ruff.
- Passed proof: `pnpm typecheck` passed with 0 errors and existing Astro hints only.
- Passed proof: `git diff --check --` passed.
- Capability continuation note: remaining high-pressure refactor areas are deeper fetcher enrichment/projection/orchestration split, fetchers service orchestration, admin/web UI surfaces and proof-script modularity; these should be opened as separate AIDP items with targeted compose/stateful gates.

### AIDP-ENGINEERING-REFACTORING-WORKER-STAGE-4E

- Kind: Stage
- Status: completed
- In scope: continue worker runtime decomposition by moving final-selection/system-feed/criterion-review write helper implementations out of `services/workers/app/main.py` while preserving `worker_main` imports, processor dependency wiring and monkeypatch behavior.
- Out of scope: selection policy changes, LLM/provider behavior changes, queue/job name changes, job payload changes, DB schema changes, worker bootstrap changes, discovery/fetcher/API/UI refactors and compose runtime behavior changes.
- Allowed paths: `.aidp/work.md`, `services/workers/app/main.py`, and a new focused worker selection write repository module.
- Risk: medium-high, because helpers update selection tables, interest filter results and outbox fanout, and existing tests patch several `worker_main` dependency names.
- Required proof: `python -m compileall services/workers/app`; `python -m unittest tests.unit.python.test_interest_auto_repair`; `python -m unittest discover -s tests/unit/python -p 'test_*.py'`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`.
- Acceptance criteria: selection/system-feed/criterion-review write helper implementations live outside `main.py`; `services.workers.app.main` still exports `upsert_system_feed_result`, `find_reusable_criterion_llm_review`, `resolve_criterion_review_final_decision`, `persist_criterion_review_resolution`, `upsert_final_selection_result` and `should_dispatch_clustering`; existing monkeypatch tests keep working; no queue/job/DB behavior changes.
- Architecture note: affected concern is worker main composition-root pressure and selection write ownership; stakeholder/consumer is criteria/LLM/cluster processors and tests that patch `worker_main`; tradeoff is dynamic compatibility resolution inside the new repository module.
- Implemented, with evidence: moved `upsert_system_feed_result`, `find_reusable_criterion_llm_review`, `resolve_criterion_review_final_decision`, `persist_criterion_review_resolution`, `upsert_final_selection_result` and `should_dispatch_clustering` implementations into `services/workers/app/selection_write_repository.py` while `services.workers.app.main` still imports and exports those names.
- Fixed compatibility, with evidence: `selection_write_repository.py` resolves default article, selection, filter, outbox and dispatch dependencies through `worker_main` at call time, preserving existing monkeypatch tests and legacy runtime behavior.
- Scope note: no selection policy, LLM/provider behavior, queue names, job payloads, processor behavior, DB schema, worker bootstrap, API/admin/fetcher/UI or compose runtime behavior changes were made in this slice.
- Passed proof: `python -m compileall services/workers/app` passed.
- Passed proof: targeted `python -m unittest tests.unit.python.test_interest_auto_repair` passed with 26 tests.
- Passed proof: `python -m unittest discover -s tests/unit/python -p 'test_*.py'` passed with 316 tests.
- Passed proof: `pnpm lint` passed, including TS ESLint and Python ruff.
- Passed proof: `pnpm typecheck` passed with 0 errors and existing Astro hints only.
- Passed proof: `git diff --check --` passed.
- Capability continuation note: remaining high-pressure refactor areas are fetcher enrichment/orchestration split, admin/web UI surfaces and proof-script modularity; these should be opened as separate AIDP items with targeted compose/stateful gates.

### AIDP-ENGINEERING-REFACTORING-WORKER-STAGE-4D

- Kind: Stage
- Status: completed
- In scope: continue worker runtime decomposition by moving cluster vector/candidate/rebuild/create helper implementations out of `services/workers/app/main.py` while preserving `worker_main` imports and cluster processor dependency wiring.
- Out of scope: clustering algorithm changes, vector semantics changes, queue/job name changes, job payload changes, DB schema changes, selection/final-selection pipeline extraction, worker bootstrap changes, discovery/fetcher/API/UI refactors and compose runtime behavior changes.
- Allowed paths: `.aidp/work.md`, `services/workers/app/main.py`, and a new focused worker cluster repository module.
- Risk: medium, because cluster helpers touch vector registry, cluster membership state and embedding-provider model-key ownership.
- Required proof: `python -m compileall services/workers/app`; `python -m unittest tests.unit.python.test_interest_auto_repair`; `python -m unittest discover -s tests/unit/python -p 'test_*.py'`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`.
- Acceptance criteria: cluster helper implementations live outside `main.py`; `services.workers.app.main` still exports `fetch_cluster_event_vector`, `load_recent_cluster_candidates`, `rebuild_cluster_state` and `create_or_update_cluster`; cluster processor dependency wiring and behavior stay unchanged.
- Architecture note: affected concern is worker main composition-root pressure and cluster repository ownership; stakeholder/consumer is cluster processor and legacy imports from `worker_main`; tradeoff is dependency hooks for provider/vector helpers while keeping compatibility names in the legacy entrypoint.
- Implemented, with evidence: moved `fetch_cluster_event_vector`, `load_recent_cluster_candidates`, `rebuild_cluster_state` and `create_or_update_cluster` implementations into `services/workers/app/cluster_repository.py` while `services.workers.app.main` still imports and exports those names.
- Fixed compatibility, with evidence: `cluster_repository.py` resolves default vector/upsert/hash/mix/provider dependencies through `worker_main` at call time, preserving legacy patch/export behavior while avoiding duplicate provider initialization.
- Scope note: no clustering algorithm, vector semantics, queue names, job payloads, processor behavior, DB schema, selection pipeline, API/admin/fetcher/UI or compose runtime behavior changes were made in this slice.
- Passed proof: `python -m compileall services/workers/app` passed.
- Passed proof: targeted `python -m unittest tests.unit.python.test_interest_auto_repair` passed with 26 tests.
- Passed proof: `python -m unittest discover -s tests/unit/python -p 'test_*.py'` passed with 316 tests.
- Passed proof: `pnpm lint` passed, including TS ESLint and Python ruff.
- Passed proof: `pnpm typecheck` passed with 0 errors and existing Astro hints only.
- Passed proof: `git diff --check --` passed.
- Capability continuation note: remaining high-pressure refactor areas are deeper final-selection/LLM-review worker decomposition, fetcher enrichment/orchestration split, admin/web UI surfaces and proof-script modularity; these should be opened as separate AIDP items with targeted compose/stateful gates.

### AIDP-ENGINEERING-REFACTORING-WORKER-STAGE-4C

- Kind: Stage
- Status: completed
- In scope: continue worker runtime decomposition by moving compiled criteria/interests and active prompt-template read helpers out of `services/workers/app/main.py` while preserving `worker_main` imports and dependency-injection call sites.
- Out of scope: query semantics changes, queue/job name changes, job payload changes, processor behavior changes, DB schema changes, selection/final-selection pipeline extraction, worker bootstrap changes, discovery/fetcher/API/UI refactors and compose runtime behavior changes.
- Allowed paths: `.aidp/work.md`, `services/workers/app/main.py`, and a new focused worker matching read-model repository module.
- Risk: low-medium, because criteria/interest match processors consume these helpers through dependency injection and legacy default paths still resolve through `worker_main`.
- Required proof: `python -m compileall services/workers/app`; `python -m unittest tests.unit.python.test_interest_auto_repair`; `python -m unittest discover -s tests/unit/python -p 'test_*.py'`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`.
- Acceptance criteria: compiled criteria/interests and prompt-template read helper implementations live outside `main.py`; `services.workers.app.main` still exports `list_compiled_criteria`, `list_compiled_interests` and `find_prompt_template`; processor dependency wiring and public behavior stay unchanged.
- Architecture note: affected concern is worker main composition-root pressure and matching read-model ownership; stakeholder/consumer is criteria/interest/LLM review processors and tests that import `worker_main`; tradeoff is adding a focused read-model module while keeping compatibility names in the legacy entrypoint.
- Implemented, with evidence: moved `list_compiled_criteria`, `list_compiled_interests` and `find_prompt_template` implementations into `services/workers/app/matching_read_repository.py` while `services.workers.app.main` still imports and passes those names through processor dependency wiring.
- Scope note: no query semantics, queue names, job payloads, processor behavior, DB schema, selection pipeline, API/admin/fetcher/UI or compose runtime behavior changes were made in this slice.
- Passed proof: `python -m compileall services/workers/app` passed.
- Passed proof: targeted `python -m unittest tests.unit.python.test_interest_auto_repair` passed with 26 tests.
- Passed proof: `python -m unittest discover -s tests/unit/python -p 'test_*.py'` passed with 316 tests.
- Passed proof: `pnpm lint` passed, including TS ESLint and Python ruff.
- Passed proof: `pnpm typecheck` passed with 0 errors and existing Astro hints only.
- Passed proof: `git diff --check --` passed.

### AIDP-ENGINEERING-REFACTORING-WORKER-STAGE-4B

- Kind: Stage
- Status: completed
- In scope: continue worker runtime decomposition by moving final-selection/system-feed selection-gate read helpers out of `services/workers/app/main.py` while preserving `worker_main` imports and monkeypatch behavior.
- Out of scope: queue/job name changes, job payload changes, processor behavior changes, DB schema changes, final-selection write pipeline extraction, worker bootstrap changes, discovery/fetcher/API/UI refactors and compose runtime behavior changes.
- Allowed paths: `.aidp/work.md`, `services/workers/app/main.py`, and a new focused worker selection-gate repository module.
- Risk: medium, because tests and legacy runtime modules patch `worker_main.fetch_final_selection_result_row` and `worker_main.fetch_system_feed_result_row`.
- Required proof: `python -m compileall services/workers/app`; `python -m unittest tests.unit.python.test_interest_auto_repair`; `python -m unittest discover -s tests/unit/python -p 'test_*.py'`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`.
- Acceptance criteria: selection-gate read helper implementations live outside `main.py`; `services.workers.app.main` still exports `fetch_final_selection_result_row`, `fetch_system_feed_result_row`, `fetch_selection_gate_result_row` and `is_article_eligible_for_personalization`; existing monkeypatch tests keep working; no queue/job/DB behavior changes.
- Architecture note: affected concern is worker main composition-root pressure and selection-gate read ownership; stakeholder/consumer is worker processors, reindex backfill and tests that patch `worker_main`; tradeoff is dynamic compatibility resolution inside the new repository module.
- Implemented, with evidence: moved `fetch_final_selection_result_row`, `fetch_system_feed_result_row`, `fetch_selection_gate_result_row` and `is_article_eligible_for_personalization` implementations into `services/workers/app/selection_gate_repository.py` while `services.workers.app.main` still imports and exports those names.
- Fixed compatibility, with evidence: the new repository module resolves default final/system feed/open-connection dependencies through `worker_main` at call time, preserving existing monkeypatch tests and legacy runtime behavior.
- Fixed import-time dependency, with evidence: adjusted runtime-evaluated callable aliases to avoid requiring `psycopg.AsyncCursor` on minimal test stubs during full unit discovery.
- Scope note: no queue names, job payloads, processor behavior, DB schema, selection write pipeline, API/admin/fetcher/UI or compose runtime behavior changes were made in this slice.
- Passed proof: `python -m compileall services/workers/app` passed.
- Passed proof: targeted `python -m unittest tests.unit.python.test_interest_auto_repair` passed with 26 tests, covering the selection-gate monkeypatch path.
- Proof correction note: the first full unit run exposed the runtime-evaluated `psycopg.AsyncCursor` type alias against a minimal test stub; after changing callable aliases to accept `Any`, the full suite passed.
- Passed proof: `python -m unittest discover -s tests/unit/python -p 'test_*.py'` passed with 316 tests.
- Passed proof: `pnpm lint` passed, including TS ESLint and Python ruff.
- Passed proof: `pnpm typecheck` passed with 0 errors and existing Astro hints only.
- Passed proof: `git diff --check --` passed.
- Capability continuation note: remaining high-pressure refactor areas are deeper worker runtime decomposition, fetcher enrichment/orchestration split, admin/web UI surfaces and proof-script modularity; these should be opened as separate AIDP items with targeted compose/stateful gates.

### AIDP-ENGINEERING-REFACTORING-WORKER-STAGE-4A

- Kind: Stage
- Status: completed
- In scope: begin worker runtime decomposition by moving simple compile row-lock repository helpers and the published outbox helper out of `services/workers/app/main.py` while preserving imports from `worker_main` for tests and legacy runtime modules.
- Out of scope: queue/job name changes, job payload changes, processor behavior changes, DB schema changes, selection/final-selection pipeline extraction, worker bootstrap changes, discovery/fetcher/API/UI refactors and compose runtime behavior changes.
- Allowed paths: `.aidp/work.md`, `services/workers/app/main.py`, `services/workers/app/worker_events.py`, and new focused worker repository helper modules.
- Risk: medium, because worker main export ownership changes but legacy import/monkeypatch points must stay stable.
- Required proof: `python -m compileall services/workers/app`; `python -m unittest tests.unit.python.test_interest_auto_repair`; `python -m unittest discover -s tests/unit/python -p 'test_*.py'`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`.
- Acceptance criteria: `ensure_published_outbox_event`, `fetch_interest_for_update` and `fetch_criterion_for_update` no longer have implementations in `main.py`; `services.workers.app.main` still exports those names; compile processors and reindex backfill compatibility modules keep working; no queue/job/DB behavior changes.
- Architecture note: affected concern is worker main composition-root pressure; stakeholder/consumer is worker processors and existing unit tests that patch `worker_main`; tradeoff is adding focused helper modules while retaining compatibility names in the legacy entrypoint.
- Implemented, with evidence: moved `fetch_interest_for_update` and `fetch_criterion_for_update` implementations into `services/workers/app/compile_repository.py` while `services.workers.app.main` still imports and exports both names.
- Implemented, with evidence: moved `ensure_published_outbox_event` implementation into `services/workers/app/worker_events.py` while `services.workers.app.main` still imports and exposes the name through `WORKER_MAIN_COMPAT_EXPORTS`.
- Fixed import-time dependency, with evidence: kept `runtime_db.open_connection` as a lazy import inside `ensure_published_outbox_event` so API unit imports do not require `redis` through `worker_events`.
- Scope note: no queue names, job payloads, processor behavior, DB schema, API/admin/fetcher/UI or compose runtime behavior changes were made in this slice.
- Passed proof: `python -m compileall services/workers/app` passed.
- Passed proof: targeted `python -m unittest tests.unit.python.test_interest_auto_repair` passed with 26 tests, covering the `worker_main.fetch_interest_for_update` monkeypatch path.
- Proof correction note: the first full unit run exposed the accidental import-time `runtime_db` dependency from `worker_events`; after moving `open_connection` to a lazy function import, the full suite passed.
- Passed proof: `python -m unittest discover -s tests/unit/python -p 'test_*.py'` passed with 316 tests.
- Passed proof: `pnpm lint` passed, including TS ESLint and Python ruff.
- Passed proof: `pnpm typecheck` passed with 0 errors and existing Astro hints only.
- Passed proof: `git diff --check --` passed.
- Capability continuation note: remaining high-pressure refactor areas are deeper worker runtime decomposition, fetcher enrichment/orchestration split, admin/web UI surfaces and proof-script modularity; these should be opened as separate AIDP items with targeted compose/stateful gates.

### AIDP-ENGINEERING-REFACTORING-DISCOVERY-STAGE-3C

- Kind: Stage
- Status: completed
- In scope: continue discovery task-engine split by extracting remaining search, URL/RSS/website probe, content sampling and relevance scoring plugin families from `services/workers/app/task_engine/discovery_plugins.py` into focused family modules.
- Out of scope: task graph behavior changes, task/option/output name changes, runtime adapter changes, DB schema changes, queue/job changes, API/admin/fetcher/UI refactors and worker runtime decomposition.
- Allowed paths: `.aidp/work.md`, `services/workers/app/task_engine/discovery_plugins.py`, and focused plugin-family modules under `services/workers/app/task_engine/`.
- Risk: medium, because this completes the first plugin-family split while task names, registry exports and existing runtime patch-points must remain stable.
- Required proof: `python -m compileall services/workers/app/task_engine`; `python -m unittest tests.unit.python.test_task_engine_discovery_plugins`; `python -m unittest discover -s tests/unit/python -p 'test_*.py'`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`.
- Acceptance criteria: concrete search/probe/sampling/scoring plugin classes live in focused modules; `DISCOVERY_PLUGIN_CLASSES`, `UTILITY_PLUGIN_CLASSES`, `ENRICHMENT_PLUGIN_CLASSES`, `DISCOVERY_ENRICHMENT_PLUGIN_CLASSES` and registration functions remain import-compatible; existing tests can still patch `services.workers.app.task_engine.discovery_plugins.get_discovery_runtime`; no task names, options or outputs change.
- Architecture note: affected concern is discovery plugin cohesion and dependency direction; stakeholder/consumer is task graph authors and discovery runtime maintainers; tradeoff is more small plugin-family modules while keeping registry composition centralized.
- Implemented, with evidence: extracted `WebSearchPlugin` into `services/workers/app/task_engine/discovery_search_plugins.py`.
- Implemented, with evidence: extracted `UrlValidatorPlugin`, `RssProbePlugin` and `WebsiteProbePlugin` into `services/workers/app/task_engine/discovery_probe_plugins.py`.
- Implemented, with evidence: extracted `ContentSamplerPlugin` into `services/workers/app/task_engine/discovery_sampling_plugins.py`.
- Implemented, with evidence: extracted `RelevanceScorerPlugin` into `services/workers/app/task_engine/discovery_scoring_plugins.py`.
- Implemented, with evidence: `services/workers/app/task_engine/discovery_plugins.py` reduced from 957 lines after Stage 3B to 81 lines and now acts as registry composition owner with a compatibility runtime wrapper.
- Scope note: no task graph semantics, task names, plugin options, runtime adapter behavior, DB schema, queue/job, API/admin/fetcher/UI or dependency behavior changes were made in this slice.
- Passed proof: `python -m compileall services/workers/app/task_engine` passed.
- Passed proof: targeted `python -m unittest tests.unit.python.test_task_engine_discovery_plugins` passed with 12 tests.
- Passed proof: `python -m unittest discover -s tests/unit/python -p 'test_*.py'` passed with 316 tests.
- Passed proof: `pnpm lint` passed, including TS ESLint and Python ruff.
- Passed proof: `pnpm typecheck` passed with 0 errors and existing Astro hints only.
- Passed proof: `git diff --check --` passed.
- Capability continuation note: remaining high-pressure refactor areas are worker runtime decomposition, fetcher enrichment/orchestration split, admin/web UI surfaces and proof-script modularity; these should be opened as separate AIDP items with targeted compose/stateful gates.

### AIDP-ENGINEERING-REFACTORING-DISCOVERY-STAGE-3B

- Kind: Stage
- Status: completed
- In scope: continue discovery task-engine split by extracting LLM analyzer, source registration and utility storage plugin families from `services/workers/app/task_engine/discovery_plugins.py` into focused family modules.
- Out of scope: task graph behavior changes, task/option/output name changes, runtime adapter changes, DB schema changes, queue/job changes, API/admin/fetcher/UI refactors, and search/probe/sampling/scoring family extraction.
- Allowed paths: `.aidp/work.md`, `services/workers/app/task_engine/discovery_plugins.py`, and focused plugin-family modules under `services/workers/app/task_engine/`.
- Risk: medium, because plugin import topology changes while task names, registry exports and existing runtime patch-points must remain stable.
- Required proof: `python -m compileall services/workers/app/task_engine`; `python -m unittest tests.unit.python.test_task_engine_discovery_plugins`; `python -m unittest discover -s tests/unit/python -p 'test_*.py'`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`.
- Acceptance criteria: `LlmAnalyzerPlugin`, `SourceRegistrarPlugin` and `DbStorePlugin` live in focused modules; `DISCOVERY_PLUGIN_CLASSES`, `UTILITY_PLUGIN_CLASSES`, `DISCOVERY_ENRICHMENT_PLUGIN_CLASSES` and registration functions remain import-compatible; existing tests can still patch `services.workers.app.task_engine.discovery_plugins.get_discovery_runtime`; no task names, options or outputs change.
- Architecture note: affected concern is discovery plugin cohesion and dependency direction; stakeholder/consumer is task graph authors and discovery runtime maintainers; tradeoff is several small plugin-family modules while keeping registry composition centralized.
- Implemented, with evidence: extracted `LlmAnalyzerPlugin` into `services/workers/app/task_engine/discovery_llm_plugins.py`.
- Implemented, with evidence: extracted `SourceRegistrarPlugin` into `services/workers/app/task_engine/discovery_registration_plugins.py`.
- Implemented, with evidence: extracted `DbStorePlugin` into `services/workers/app/task_engine/discovery_storage_plugins.py`.
- Fixed compatibility, with evidence: extracted families resolve runtime through the registry owner so existing tests and legacy callers that patch `services.workers.app.task_engine.discovery_plugins.get_discovery_runtime` keep working.
- Implemented, with evidence: `services/workers/app/task_engine/discovery_plugins.py` reduced from 1343 lines after Stage 3A to 957 lines; task names, plugin options, outputs and registry function names remain unchanged.
- Scope note: no task graph semantics, task names, plugin options, runtime adapter behavior, DB schema, queue/job, API/admin/fetcher/UI or dependency behavior changes were made in this slice.
- Passed proof: `python -m compileall services/workers/app/task_engine` passed.
- Passed proof: targeted `python -m unittest tests.unit.python.test_task_engine_discovery_plugins` passed with 12 tests.
- Passed proof: `python -m unittest discover -s tests/unit/python -p 'test_*.py'` passed with 316 tests.
- Passed proof: `pnpm lint` passed, including TS ESLint and Python ruff.
- Passed proof: `pnpm typecheck` passed with 0 errors and existing Astro hints only.
- Passed proof: `git diff --check --` passed.

### AIDP-ENGINEERING-REFACTORING-DISCOVERY-STAGE-3A

- Kind: Stage
- Status: completed
- In scope: begin discovery task-engine split by extracting shared discovery plugin option/context helpers and the common `ContextTaskPlugin` base from `services/workers/app/task_engine/discovery_plugins.py` into a focused common module, plus the first low-risk enrichment plugin-family extraction.
- Out of scope: task graph behavior changes, registry name changes, plugin option changes, runtime adapter changes, DB schema changes, queue/job changes, API/admin/fetcher/UI refactors and full discovery/search/probe/scoring/LLM plugin-family split.
- Allowed paths: `.aidp/work.md`, `services/workers/app/task_engine/discovery_plugins.py`, and new focused common module(s) under `services/workers/app/task_engine/`.
- Risk: medium, because plugin import topology changes while task names, registry exports and runtime adapter calls must remain stable.
- Required proof: `python -m compileall services/workers/app/task_engine`; `python -m unittest discover -s tests/unit/python -p 'test_*.py'`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`.
- Acceptance criteria: shared helper/base concerns no longer live in the plugin registry owner; enrichment plugin classes live in a focused family module; `DISCOVERY_PLUGIN_CLASSES`, `UTILITY_PLUGIN_CLASSES`, `ENRICHMENT_PLUGIN_CLASSES`, `DISCOVERY_ENRICHMENT_PLUGIN_CLASSES` and registration functions remain import-compatible; no task names, options or outputs change.
- Architecture note: affected concern is discovery plugin cohesion and future plugin-family splitting; stakeholder/consumer is task graph authors and discovery runtime maintainers; tradeoff is one additional common module before splitting concrete plugin families.
- Implemented, with evidence: extracted discovery plugin lookup/coercion/token/url helpers and the common `ContextTaskPlugin` base into `services/workers/app/task_engine/discovery_plugin_common.py`.
- Implemented, with evidence: extracted `ArticleLoaderPlugin` and `ArticleEnricherPlugin` into `services/workers/app/task_engine/discovery_enrichment_plugins.py` while keeping `ENRICHMENT_PLUGIN_CLASSES` and registration exports owned by `services/workers/app/task_engine/discovery_plugins.py`.
- Fixed compatibility, with evidence: enrichment plugins resolve runtime through the registry owner so existing tests and legacy callers that patch `services.workers.app.task_engine.discovery_plugins.get_discovery_runtime` keep working.
- Implemented, with evidence: `services/workers/app/task_engine/discovery_plugins.py` reduced from 1907 lines before this slice to 1343 lines; task names, plugin options, outputs and registry function names remain unchanged.
- Scope note: no task graph semantics, task names, plugin options, runtime adapter behavior, DB schema, queue/job, API/admin/fetcher/UI or dependency behavior changes were made in this slice.
- Passed proof: `python -m compileall services/workers/app/task_engine` passed.
- Passed proof: targeted `python -m unittest tests.unit.python.test_task_engine_discovery_plugins` passed with 12 tests after preserving the runtime patch-point.
- Passed proof: `python -m unittest discover -s tests/unit/python -p 'test_*.py'` passed with 316 tests.
- Passed proof: `pnpm lint` passed, including TS ESLint and Python ruff.
- Passed proof: `pnpm typecheck` passed with 0 errors and existing Astro hints only.
- Passed proof: `git diff --check --` passed.
- Capability continuation note: remaining high-pressure refactor areas are worker runtime decomposition, deeper discovery search/probe/scoring/LLM family splits, fetcher enrichment/orchestration split, admin/web UI surfaces and proof-script modularity; each should be opened as a separate AIDP item with targeted compose/stateful gates.

### AIDP-ENGINEERING-REFACTORING-API-STAGE-2

- Kind: Stage
- Status: completed
- In scope: continue behavior-preserving API decomposition by moving a cohesive observability/LLM-budget route-handler cluster out of `services/api/app/main.py` into the existing focused route module while preserving public routes and compatibility imports.
- Out of scope: DB schema changes, route/path/payload changes, SDK changes, worker/fetcher/UI/proof-script refactors, dependency changes and compose/runtime behavior changes.
- Allowed paths: `.aidp/work.md`, `services/api/app/main.py`, `services/api/app/routes/observability_routes.py`, and route registration files only if wiring requires it.
- Risk: medium, because API route ownership changes but behavior should remain stable through compatibility imports and targeted proof.
- Required proof: `python -m compileall services/api/app`; `python -m unittest discover -s tests/unit/python -p 'test_*.py'`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`.
- Acceptance criteria: observability/LLM budget route handlers live in the focused route module; `main.py` compatibility names still exist for tests/legacy imports; public route paths and response ownership remain unchanged.
- Architecture note: affected concern is API entrypoint cohesion; stakeholder/consumer is API maintainers and existing observability/LLM budget consumers; tradeoff is route module owning direct read-model dependencies instead of receiving every handler through `globals()`.
- Implemented, with evidence: moved `/maintenance/fetch-runs`, `/maintenance/llm-reviews`, `/maintenance/llm-usage-summary`, `/maintenance/llm-budget-summary` and `/maintenance/outbox` handlers into `services/api/app/routes/observability_routes.py` while preserving route paths and response ownership.
- Implemented, with evidence: preserved a thin `services/api/app/main.py` compatibility `get_llm_budget_summary()` wrapper for tests and legacy imports that monkeypatch `api_main.query_one`.
- Implemented, with evidence: extracted discovery/sequence status constant ownership from `services/api/app/main.py` into `services/api/app/status_constants.py`, reducing entrypoint pressure without changing accepted status values.
- Scope note: no public route/path/payload, SDK, DB schema, queue/event, worker/fetcher/UI/proof-script or dependency behavior changes were made in this slice.
- Passed proof: `python -m compileall services/api/app` passed.
- Passed proof: targeted API unit tests for sequence management, reindex jobs and feed dedup passed with 26 tests.
- Passed proof: `python -m unittest discover -s tests/unit/python -p 'test_*.py'` passed with 316 tests after rerun with loopback permission.
- Passed proof: `pnpm lint` passed, including TS ESLint and Python ruff.
- Passed proof: `pnpm typecheck` passed with 0 errors and existing Astro hints only.
- Passed proof: `git diff --check --` passed.

### AIDP-ENGINEERING-REQUIREMENTS-AND-API-STAGE-1

- Kind: Stage
- Status: completed
- In scope: correct stale AIDP worktree coherence; extend compact engineering/proof guidance with secure-by-design, supply-chain/release integrity, observability-as-contract, ADR/deprecation and dependency-direction rails; perform one narrow behavior-preserving API route decomposition slice.
- Out of scope: broad worker/fetcher/UI/proof-script refactors, DB schema changes, public API payload/route changes, queue/event changes, dependency installs, release/deploy gates and visual redesign.
- Allowed paths: `.aidp/work.md`, `.aidp/engineering.md`, `.aidp/verification.md`, `services/api/app/main.py`, `services/api/app/routes/__init__.py`, new focused files under `services/api/app/routes/` if required.
- Risk: medium, because durable engineering rules change and the API entrypoint route wiring is touched, but product behavior and external contracts remain unchanged.
- Required proof: `python -m compileall services/api/app`; `pnpm unit_tests:py`; `pnpm typecheck`; `git diff --check --`; owner-file consistency review. No compose smoke is required unless API route wiring proof exposes a runtime issue.
- Acceptance criteria: AIDP worktree state matches repository reality; new engineering/proof rails are present in the correct owner files without duplicating blueprint; API `/health` route is registered through focused route wiring rather than inline entrypoint decoration; public route path and response shape stay stable.
- Architecture note: affected concern is API entrypoint cohesion and AIDP engineering quality bar; stakeholder/consumer is future AI/human maintainers and existing API health consumers; tradeoff is a small additional route module for clearer composition-root ownership.
- Implemented, with evidence: repaired stale AIDP worktree coherence by replacing the old dirty ARCH-HARDENING-FOLLOWUP note with the verified clean pre-stage state and current completed-stage dirty scope.
- Implemented, with evidence: added compact engineering rails for secure-by-design/threat modeling, dependency and supply-chain discipline, observability-as-contract, architecture decisions/compatibility/deprecation and dependency direction/layering.
- Implemented, with evidence: expanded verification expectations and the architecture proof checklist with security, supply-chain, observability, compatibility/deprecation and dependency-direction review.
- Implemented, with evidence: moved API `/health` route registration from inline `services/api/app/main.py` decoration into `services/api/app/routes/health_routes.py` and registered it through `services/api/app/routes/__init__.py`, preserving path and response shape.
- Scope note: no DB schema, queue/event, SDK, public payload, dependency, release/deploy, worker/fetcher/UI/proof-script or visual behavior changes were made in this slice.
- Passed proof: `python -m compileall services/api/app` passed.
- Passed proof: `python -m unittest discover -s tests/unit/python -p 'test_*.py'` passed with 316 tests after rerun with loopback permission; the first sandboxed attempt failed only because the Gemini test could not bind `127.0.0.1:0`.
- Passed proof: `pnpm lint` passed, including TS ESLint and Python ruff.
- Passed proof: `pnpm typecheck` passed with 0 errors and existing Astro hints only.
- Passed proof: `git diff --check --` passed.
- Non-gate note: a direct bare-shell import probe for `services.api.app.main` could not run because the local Python environment lacks `psycopg`; this is not a new regression and was not part of the required proof.
- Capability continuation note: remaining planned refactor stages for worker runtime, discovery plugins, fetcher enrichment/orchestration, admin/web UI surfaces and proof-script modularity are not implemented in this stage and should be opened as separate AIDP items.

### ARCH-HARDENING-FOLLOWUP-FINAL-PROOF-2026-04-29

- Kind: Stage
- Status: completed
- In scope: broad final proof for completed architecture hardening batches, including static/unit gates, Admin discovery proof, MCP proof, three-domain live discovery examples/yield proof and full product-local proof.
- Out of scope: additional refactoring, product behavior changes, API/BFF/DB/queue/schema changes, new provider rollout, paid LLM/model changes and production-like environments.
- Allowed paths: `.aidp/work.md` only unless a proof exposes a real regression requiring a narrow fix.
- Risk: high, because this is capability-level closure proof over API, worker, fetcher, admin UI, discovery, MCP and product-local surfaces.
- Required proof: `pnpm unit_tests:py`; `pnpm unit_tests:ts`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; `pnpm test:discovery:admin:compose`; `pnpm test:mcp:compose`; `pnpm test:mcp:http:writes`; `pnpm test:discovery:examples:compose`; `pnpm test:discovery:yield:compose`; `pnpm test:product:local:full`; cleanup/residual state check.
- Acceptance criteria: met.
- Architecture note: affected concern is capability-level regression confidence; stakeholder/consumer is the whole NewsPortal operator/product surface; proof intentionally exercises the refactored Admin route, MCP control-plane, three example domains and final product-local contour rather than adding new code.
- Passed deterministic proof: `pnpm unit_tests:py` passed with 316 tests; `pnpm unit_tests:ts` passed with 246 tests; `pnpm lint` passed; `pnpm typecheck` passed with 0 errors and existing Astro hints only; `git diff --check --` passed.
- Passed Admin proof: `pnpm test:discovery:admin:compose` passed with `discovery-admin-ok`, including update/compile/run/review/feedback/re-evaluate/recall/promote/archive/reactivate/delete coverage.
- Passed MCP proof: `pnpm test:mcp:compose` passed with deterministic HTTP artifact `/tmp/newsportal-mcp-http-deterministic-f32b17c1-b0db-4529-b05b-dd6b7b8b9291.md`; `pnpm test:mcp:http:writes` passed with deterministic writes artifact `/tmp/newsportal-mcp-http-deterministic-dc071d7a-8f0a-4b7e-8ccf-3d60d5b208e4.md`.
- Passed standalone three-domain examples proof: `pnpm test:discovery:examples:compose` passed with runtime/yield/final verdict `pass`; evidence `/tmp/newsportal-live-discovery-examples-7c2eb195.md`; case packs covered Example A Job Board, Example B Developer News and Example C Outsourcing Lead Discovery.
- Passed standalone multi-run yield proof: `pnpm test:discovery:yield:compose` passed with runtime/yield/final verdict `pass`; evidence `/tmp/newsportal-live-discovery-yield-proof-3e6aeba9.md`; each of Example A, Example B and Example C passed 3/3 runs with required 2 and aggregate `yield_pass:9`.
- Passed product-local full proof: `pnpm test:product:local:full` passed; evidence `/tmp/newsportal-product-local-full-2b534937.md`; included lint, typecheck, unit tests, integration tests, website compose/admin, automation admin, MCP compose, web viewports, UI audit, discovery enabled/admin/examples/yield, live website matrix and MCP HTTP live.
- Product-local live evidence note: embedded discovery examples evidence `/tmp/newsportal-live-discovery-examples-96234136.md`; embedded discovery yield evidence `/tmp/newsportal-live-discovery-yield-proof-986bfd6d.md`; live website matrix recorded 16 live sites with 7 expected-shape observations, 8 truthful unsupported/blocked observations, 1 partial/empty observation and no cleanup residuals; MCP HTTP live reported runtime `healthy` with usefulness `yield-usefulness-weak-but-runtime-healthy`.
- Cleanup proof: final `pnpm dev:mvp:internal:down:volumes` completed and final `docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'` returned no running containers.
- Capability closure note: `ARCH-HARDENING-FOLLOWUP-CAPABILITY` is closed by this final proof; no active architecture-hardening follow-up item remains.

### ARCH-HARDENING-FOLLOWUP-BATCH-67-ADMIN-DISCOVERY-COMPONENT-POLISH

- Kind: Stage
- Status: completed
- In scope: split the largest Stage 5 discovery components into focused create/list/workspace subcomponents under `apps/admin/src/components/discovery/`; keep route URL, query params, form names, BFF actions, side-pane data attributes and visual behavior stable.
- Out of scope: API/BFF contract changes, DB schema changes, discovery behavior changes, auth/session changes, visual redesign, route path changes, form/action renames, server view-model changes and broad CSS redesign.
- Allowed paths: `.aidp/work.md`, focused components under `apps/admin/src/components/discovery/`, and `apps/admin/src/pages/discovery.astro` only if import/prop wiring requires it.
- Risk: high, because the polish touches profile and mission forms, action buttons, mission side-pane behavior and admin discovery proof coverage even though it is behavior-preserving.
- Required proof: `pnpm typecheck`; `pnpm unit_tests:ts`; `pnpm lint`; `pnpm test:discovery:admin:compose`; `pnpm test:web:ui-audit`; `git diff --check --`; cleanup/residual state check.
- Acceptance criteria: met.
- Architecture note: affected concern is admin discovery UI component cohesion; stakeholder/consumer is the operator discovery admin page; tradeoff is more component files in exchange for smaller owners with one reason to change.
- Implemented, with evidence: split `DiscoveryProfilesTab.astro` into a 53-line composition owner plus `DiscoveryProfileCreateForm.astro` and `DiscoveryProfileList.astro`, preserving profile create/update/archive/reactivate/delete form names, field names and diagnostics rendering.
- Implemented, with evidence: split `DiscoveryMissionsTab.astro` into an 84-line composition owner plus `DiscoveryMissionCreateForm.astro`, `DiscoveryMissionList.astro` and `DiscoveryMissionWorkspaceContent.astro`, preserving mission create/update/compile/run/archive/reactivate/delete actions, list pane open links, portfolio links and side-pane data behavior.
- Scope note: route URLs, query params, form names, BFF intents/actions, side-pane data attributes, API/BFF contracts, DB schema, discovery behavior, auth/session behavior and visual redesign remain intentionally unchanged.
- Passed proof: `pnpm typecheck` passed with 0 errors and 0 warnings, retaining existing Astro hints; `pnpm unit_tests:ts` passed with 246 tests; `pnpm lint` passed; `git diff --check --` passed.
- Passed runtime/build proof: `pnpm dev:mvp:internal` built the admin Docker image successfully with the new Astro component graph and brought the local stack healthy.
- Passed stateful proof: `pnpm test:discovery:admin:compose` passed with `discovery-admin-ok`, including update/compile/run/review/feedback/re-evaluate/recall/promote/archive/reactivate/delete discovery admin flow.
- Passed stateful proof: after a disposable stack reset to avoid shared-worker contention, `pnpm test:web:ui-audit` passed with `ui-button-audit-ok` run id `3e447af7`; discovery action buttons remained intentionally covered by `test:discovery:admin:compose` inside that audit report.
- Cleanup proof: final `pnpm dev:mvp:internal:down:volumes` completed and final `docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'` returned no running containers.
- Final worktree proof: `git status --short` remains dirty only with completed architecture-hardening files, completed Batch 57 harness fix, completed Batch 58/59 fetcher persistence files, completed Batch 60/61/62/63 website-ingestion files, completed Batch 64/65/66/67 admin discovery component files, the Batch 64 UI audit harness fix and this AIDP state update.

### ARCH-HARDENING-FOLLOWUP-BATCH-66-ADMIN-DISCOVERY-PROFILE-MISSION-SPLIT

- Kind: Stage
- Status: completed
- In scope: extract the remaining large inline `profiles` and `missions` tab/workspace sections from `apps/admin/src/pages/discovery.astro` into focused discovery components; keep route URL, query params, form names, BFF actions, side-pane data attributes and visual behavior stable.
- Out of scope: API/BFF contract changes, DB schema changes, discovery behavior changes, auth/session changes, visual redesign, route path changes, form/action renames, and server view-model changes unless required to pass stable href data into extracted components.
- Allowed paths: `.aidp/work.md`, `apps/admin/src/pages/discovery.astro`, focused components under `apps/admin/src/components/discovery/`, and targeted admin/discovery proof harness files only if proof exposes a harness issue.
- Risk: high, because these sections own create/update/archive/delete profile and mission actions, mission graph compile/run actions, workspace pane behavior and admin discovery proof coverage.
- Required proof: `pnpm typecheck`; `pnpm unit_tests:ts`; `pnpm lint`; `pnpm test:discovery:admin:compose`; `pnpm test:web:ui-audit`; `git diff --check --`; cleanup/residual state check.
- Acceptance criteria: met.
- Architecture note: affected concern is admin discovery UI composition-root cohesion; stakeholder/consumer is the operator discovery admin page; server BFF actions and existing UI semantics remain unchanged while the final large presentational/operator sections get focused owners.
- Implemented, with evidence: extracted the policy profile create/list/update/archive/reactivate/delete workspace into `apps/admin/src/components/discovery/DiscoveryProfilesTab.astro`, preserving `create_profile`, `update_profile`, policy JSON textareas, class/template/profile linkage fields and profile diagnostics rendering.
- Implemented, with evidence: extracted the mission list/detail/forms/compile/run workspace into `apps/admin/src/components/discovery/DiscoveryMissionsTab.astro`, preserving `create_mission`, `update_mission`, `compile_mission`, `run_mission`, archive/reactivate/delete flows, mission graph controls and workspace pane content.
- Implemented, with evidence: moved mission selection and mission-scoped portfolio href materialization into the route composition root so the extracted mission component receives concrete href maps instead of owning URL-builder callbacks.
- Implemented, with evidence: `apps/admin/src/pages/discovery.astro` reduced from 1154 lines after Batch 65 to 365 lines; the new Batch 66 components own 499 and 406 lines.
- Scope note: route URLs, query params, form names, BFF intents/actions, side-pane data attributes, API/BFF contracts, DB schema, discovery behavior, auth/session behavior and visual redesign remain intentionally unchanged.
- Passed proof: `pnpm typecheck` passed with 0 errors and 0 warnings, retaining existing Astro hints; `pnpm unit_tests:ts` passed with 246 tests; `pnpm lint` passed; `git diff --check --` passed.
- Passed stateful proof: after `pnpm dev:mvp:internal`, `pnpm test:discovery:admin:compose` passed, including update/compile/run/review/feedback/re-evaluate/recall/promote/archive/reactivate/delete discovery admin flow.
- Stateful proof note: the first `pnpm test:web:ui-audit` attempt on the same stack timed out waiting for a compiled user interest while the shared worker was still occupied by the preceding discovery live/recall workload; no product or extracted-component failure was observed.
- Passed stateful proof: after `pnpm dev:mvp:internal:down:volumes` reset the disposable stack, `pnpm test:web:ui-audit` passed with `ui-button-audit-ok` run id `b2922aa4`; discovery action buttons remained intentionally covered by `test:discovery:admin:compose` inside that audit report.
- Cleanup proof: final `pnpm dev:mvp:internal:down:volumes` completed and final `docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'` returned no running containers.
- Final worktree proof: `git status --short` remains dirty only with completed architecture-hardening files, completed Batch 57 harness fix, completed Batch 58/59 fetcher persistence files, completed Batch 60/61/62/63 website-ingestion files, completed Batch 64/65/66 admin discovery component files, the Batch 64 UI audit harness fix and this AIDP state update.

### ARCH-HARDENING-FOLLOWUP-BATCH-65-ADMIN-DISCOVERY-SECOND-TAB-SPLIT

- Kind: Stage
- Status: completed
- In scope: extract additional self-contained tabs/workspaces from `apps/admin/src/pages/discovery.astro`, prioritizing recall, sources, portfolio and feedback sections; keep route URL, query params, form names, BFF actions, side-pane data attributes and visual behavior stable.
- Out of scope: API/BFF contract changes, DB schema changes, discovery behavior changes, auth/session changes, visual redesign, route path changes, form/action renames, and profile/mission deep refactors unless they are needed for safe component extraction in this batch.
- Allowed paths: `.aidp/work.md`, `apps/admin/src/pages/discovery.astro`, focused components under `apps/admin/src/components/discovery/`, and targeted admin/discovery proof harness files only if proof exposes a harness issue.
- Risk: high, because the page remains a large admin operator surface with server-side actions, tab state, side panes, discovery controls and proof coverage through admin compose/UI gates.
- Required proof: `pnpm typecheck`; `pnpm unit_tests:ts`; `pnpm lint`; `pnpm test:discovery:admin:compose`; `pnpm test:web:ui-audit`; `git diff --check --`; cleanup/residual state check.
- Acceptance criteria: met.
- Architecture note: affected concern is admin discovery UI composition-root cohesion; stakeholder/consumer is the operator discovery admin page; server BFF actions and existing UI semantics remain unchanged while more presentational/operator sections get focused owners.
- Implemented, with evidence: extracted the independent recall mission/candidate workspace into `apps/admin/src/components/discovery/DiscoveryRecallTab.astro`, preserving `create_recall_mission`, `update_recall_mission`, `acquire_recall_mission`, `promote_recall_candidate`, `redirectTo` and promotion tag form fields.
- Implemented, with evidence: extracted the source profile side-pane workspace into `apps/admin/src/components/discovery/DiscoverySourcesTab.astro`, preserving `data-discovery-row-href`, `data-discovery-row-pane="discovery-sources"` and `data-admin-pane-open-link` behavior.
- Implemented, with evidence: extracted portfolio controls/ranked sources/gaps into `apps/admin/src/components/discovery/DiscoveryPortfolioTab.astro`, preserving the `re_evaluate` form intent and mission-scoped portfolio hrefs.
- Implemented, with evidence: extracted feedback submit/history into `apps/admin/src/components/discovery/DiscoveryFeedbackTab.astro`, preserving the `submit_feedback` form intent and feedback pagination.
- Implemented, with evidence: moved source profile selection hrefs, mission scoped hrefs and selected mission href materialization into the route composition root so extracted components receive concrete href data instead of owning URL-builder callbacks.
- Implemented, with evidence: `apps/admin/src/pages/discovery.astro` reduced from 1661 lines after Batch 64 to 1154 lines; the new Batch 65 components own 302, 200, 118 and 108 lines.
- Scope note: route URLs, query params, form names, BFF intents/actions, side-pane data attributes, API/BFF contracts, DB schema, discovery behavior, auth/session behavior and visual redesign remain intentionally unchanged.
- Passed proof: `pnpm typecheck` passed with 0 errors and 0 warnings, retaining existing Astro hints; `pnpm unit_tests:ts` passed with 246 tests; `pnpm lint` passed; `git diff --check --` passed.
- Passed stateful proof: after `pnpm dev:mvp:internal`, `pnpm test:discovery:admin:compose` passed, including create/update/run/review/feedback/re-evaluate/recall/promote/archive/reactivate/delete discovery admin flow.
- Passed stateful proof: `pnpm test:web:ui-audit` passed with `ui-button-audit-ok`; discovery action buttons remain intentionally covered by `test:discovery:admin:compose` inside that audit report.
- Cleanup proof: `pnpm dev:mvp:internal:down:volumes` completed and final `docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'` returned no running containers.
- Final worktree proof: `git status --short` remains dirty only with completed architecture-hardening files, completed Batch 57 harness fix, completed Batch 58/59 fetcher persistence files, completed Batch 60/61/62/63 website-ingestion files, completed Batch 64/65 admin discovery component files, the Batch 64 UI audit harness fix and this AIDP state update.

### ARCH-HARDENING-FOLLOWUP-BATCH-64-ADMIN-DISCOVERY-SERVER-VIEW-SPLIT

- Kind: Stage
- Status: completed
- In scope: extract focused server view-model/helpers and first reusable section/tab components from `apps/admin/src/pages/discovery.astro`; keep the Astro route as the composition owner and preserve route URL, form names, BFF actions, request/response assumptions, visual behavior and proof coverage.
- Out of scope: API/BFF contract changes, DB schema changes, discovery behavior changes, auth/session changes, visual redesign, route path changes, form/action renames, and broad admin navigation refactors.
- Allowed paths: `.aidp/work.md`, `apps/admin/src/pages/discovery.astro`, new focused modules/components under `apps/admin/src/`, and targeted admin/discovery tests only if compatibility coverage requires them.
- Risk: high, because the page is a large admin operator surface with server-side actions, tab state, discovery controls, policy/profile data and proof coverage through admin compose/UI gates.
- Required proof: `pnpm typecheck`; `pnpm unit_tests:ts`; `pnpm lint`; `pnpm test:discovery:admin:compose`; `pnpm test:web:ui-audit`; `git diff --check --`; cleanup/residual state check.
- Acceptance criteria: met.
- Architecture note: affected concern is admin discovery UI composition-root cohesion; stakeholder/consumer is the operator discovery admin page; server BFF actions and existing UI semantics remain unchanged while view-model and presentational slices get focused owners.
- Implemented, with evidence: extracted the discovery control-plane hero into `apps/admin/src/components/discovery/DiscoveryControlPlaneHero.astro`.
- Implemented, with evidence: extracted the overview/dashboard tab into `apps/admin/src/components/discovery/DiscoveryDashboardTab.astro`.
- Implemented, with evidence: extracted the classes registry/create tab into `apps/admin/src/components/discovery/DiscoveryClassesTab.astro`.
- Implemented, with evidence: extracted the candidate moderation workspace pane into `apps/admin/src/components/discovery/DiscoveryCandidatesTab.astro`, preserving `data-discovery-row-*` side-pane behavior and review form intents.
- Implemented, with evidence: extracted the hypotheses table tab into `apps/admin/src/components/discovery/DiscoveryHypothesesTab.astro`.
- Implemented, with evidence: moved candidate selection href materialization into the route composition root so extracted components receive stable href data instead of owning URL-builder functions.
- Implemented, with evidence: `apps/admin/src/pages/discovery.astro` reduced from 2219 lines before Batch 64 to 1661 lines; new focused discovery components own 210, 203, 125, 136 and 90 lines.
- Fixed proof harness, with evidence: `infra/scripts/test-ui-button-audit.mjs` now waits for a browser-openable content item that is also story-followable by requiring `story_cluster_id`/`storyClusterId` before exercising follow/unfollow buttons.
- Scope note: route URLs, form names, BFF intents/actions, API contracts, DB schema, discovery behavior, auth/session behavior and visual redesign remain intentionally unchanged.
- Passed proof: `pnpm typecheck` passed with 0 errors and 0 warnings, retaining existing Astro hints; `pnpm unit_tests:ts` passed with 246 tests; `pnpm lint` passed after callback props were replaced with route-materialized href props; `git diff --check --` passed.
- Passed stateful proof: after `pnpm dev:mvp:internal`, `pnpm test:discovery:admin:compose` passed, including create/update/run/review/recall/promote/archive/delete discovery admin flow.
- Passed stateful proof: initial `pnpm test:web:ui-audit` exposed the harness selecting a non-followable content item; after the harness fix and a clean rerun, `pnpm test:web:ui-audit` passed with `ui-button-audit-ok`.
- Cleanup proof: `pnpm dev:mvp:internal:down:volumes` completed and final `docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'` returned no running containers.
- Final worktree proof: `git status --short` remains dirty only with completed architecture-hardening files, completed Batch 57 harness fix, completed Batch 58/59 fetcher persistence files, completed Batch 60/61/62/63 website-ingestion files, completed Batch 64 admin discovery component files, the Batch 64 UI audit harness fix and this AIDP state update.

### ARCH-HARDENING-FOLLOWUP-BATCH-63-WEBSITE-INGESTION-POLICY-PROBE-SPLIT

- Kind: Stage
- Status: completed
- In scope: extract conditional request state parsing/key helpers, website capability probing and discovery probe-result builders from `services/fetchers/src/web-ingestion.ts` into focused modules; keep public website ingestion exports and runtime behavior stable.
- Out of scope: DB schema changes, queue/event name changes, fetcher persistence changes, provider/acquisition behavior changes, static/browser discovery algorithm changes, API/admin/worker behavior changes, new website policy behavior and broad harness changes.
- Allowed paths: `.aidp/work.md`, `services/fetchers/src/web-ingestion.ts`, new focused modules under `services/fetchers/src/`, and targeted TS tests only if compatibility coverage requires them.
- Risk: high, because conditional request state, website capability probing and discovery probe responses affect website polling, discovery candidate probing and hard-site fallback decisions.
- Required proof: `pnpm typecheck`; `pnpm unit_tests:ts`; `pnpm lint`; `pnpm test:website:compose`; `pnpm test:hard-sites:compose`; `git diff --check --`; cleanup/residual state check.
- Acceptance criteria: met.
- Architecture note: affected concern is website ingestion composition-root cohesion; stakeholder/consumer is fetcher website polling and discovery probe API; PostgreSQL/outbox behavior and browser/static discovery policies remain unchanged while state/probe formatting logic gets focused owners.
- Implemented, with evidence: extracted conditional request state parsing, cached text response reads and conditional-state key construction from `services/fetchers/src/web-ingestion.ts` into `services/fetchers/src/web-ingestion-policy-state.ts`.
- Implemented, with evidence: extracted website capability probing into `services/fetchers/src/web-ingestion-capabilities.ts` while preserving the compatibility re-export from `services/fetchers/src/web-ingestion.ts`.
- Implemented, with evidence: extracted discovery website probe-result building and resource-shape classification into `services/fetchers/src/web-ingestion-probe-results.ts`.
- Implemented, with evidence: `services/fetchers/src/web-ingestion.ts` reduced from 1125 lines after Batch 62 to 849 lines; the new focused modules own 101, 65 and 143 lines.
- Scope note: DB schema, queue/event names, fetcher persistence, provider/acquisition behavior, static/browser discovery algorithm, API/admin/worker behavior and website policy behavior remain intentionally unchanged.
- Passed proof: `pnpm typecheck` passed with 0 errors and 0 warnings, retaining only existing Astro hints; `pnpm unit_tests:ts` passed with 246 tests; `pnpm lint` passed; `git diff --check --` passed.
- Passed stateful proof: after `pnpm dev:mvp:internal`, `pnpm test:website:compose` and `pnpm test:hard-sites:compose` passed.
- Cleanup proof: `pnpm dev:mvp:internal:down:volumes` completed and final `docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'` returned no running containers.
- Final worktree proof: `git status --short` remains dirty only with completed architecture-hardening files, completed Batch 57 harness fix, completed Batch 58/59 fetcher persistence files, completed Batch 60/61/62/63 website-ingestion files and this AIDP state update.

### ARCH-HARDENING-FOLLOWUP-BATCH-62-WEBSITE-INGESTION-BROWSER-RUNTIME

- Kind: Stage
- Status: completed
- In scope: extract Playwright/browser-assisted website discovery runtime from `services/fetchers/src/web-ingestion.ts` into a focused fetchers-owned module; preserve opt-in browser fallback policy, same-origin auth header routing, challenge reporting, network/DOM capture and browser provenance fields.
- Out of scope: DB schema changes, queue/event name changes, fetcher persistence changes, provider/acquisition behavior changes, static discovery algorithm changes, website classification algorithm changes, API/admin/worker behavior changes, new browser capabilities and broad harness changes.
- Allowed paths: `.aidp/work.md`, `services/fetchers/src/web-ingestion.ts`, new focused modules under `services/fetchers/src/`, and targeted TS tests only if compatibility coverage requires them.
- Risk: high, because browser-assisted discovery handles hard-site fallback, same-origin auth headers, rendered DOM/network capture and persisted resource provenance.
- Required proof: `pnpm typecheck`; `pnpm unit_tests:ts`; `pnpm lint`; `pnpm test:website:compose`; `pnpm test:hard-sites:compose`; `pnpm test:channel-auth:compose`; `git diff --check --`; cleanup/residual state check.
- Acceptance criteria: met.
- Architecture note: affected concern is browser-assisted website runtime cohesion; stakeholder/consumer is website source polling, discovery probing and hard-site handling; browser automation remains owned by `services/fetchers` and no new cross-service/browser policy is introduced.
- Implemented, with evidence: extracted Playwright/browser-assisted discovery runtime from `services/fetchers/src/web-ingestion.ts` into `services/fetchers/src/web-ingestion-browser-runtime.ts`.
- Implemented, with evidence: moved rendered DOM link discovery, same-origin network capture, same-origin auth header routing, challenge reporting and browser provenance signal construction behind the focused fetchers-owned browser runtime module.
- Implemented, with evidence: `services/fetchers/src/web-ingestion.ts` now delegates browser fallback execution to `discoverFromBrowserAssisted` while retaining policy decisioning, merge/filter/cursor metrics and public compatibility exports.
- Implemented, with evidence: `services/fetchers/src/web-ingestion.ts` reduced from 1447 lines after Batch 61 to 1125 lines; `services/fetchers/src/web-ingestion-browser-runtime.ts` owns 341 lines.
- Scope note: DB schema, queue/event names, fetcher persistence, provider/acquisition behavior, static discovery algorithm, website classification algorithm, API/admin/worker behavior and browser product policy remain intentionally unchanged.
- Passed proof: `pnpm typecheck` passed with 0 errors and 0 warnings, retaining only existing Astro hints; `pnpm unit_tests:ts` passed with 246 tests; `pnpm lint` passed; `git diff --check --` passed.
- Passed stateful proof: after `pnpm dev:mvp:internal`, `pnpm test:website:compose`, `pnpm test:hard-sites:compose` and `pnpm test:channel-auth:compose` passed.
- Cleanup proof: `pnpm dev:mvp:internal:down:volumes` completed and final `docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'` returned no running containers.
- Final worktree proof: `git status --short` remains dirty only with completed architecture-hardening files, completed Batch 57 harness fix, completed Batch 58/59 fetcher persistence files, completed Batch 60/61/62 website-ingestion files and this AIDP state update.

### ARCH-HARDENING-FOLLOWUP-BATCH-61-WEBSITE-INGESTION-STATIC-DISCOVERY-RUNTIME

- Kind: Stage
- Status: completed
- In scope: extract sitemap/feed/collection/inline-data/download website discovery adapters and their narrow discovery fetcher contract from `services/fetchers/src/web-ingestion.ts` into a focused module; keep `web-ingestion.ts` as the runtime composition/orchestration owner and preserve public helper exports.
- Out of scope: DB schema changes, queue/event name changes, fetcher persistence changes, provider/acquisition behavior changes, browser-assisted policy behavior changes, website classification algorithm changes, API/admin/worker behavior changes and broad harness changes.
- Allowed paths: `.aidp/work.md`, `services/fetchers/src/web-ingestion.ts`, new focused modules under `services/fetchers/src/`, and targeted TS tests only if compatibility coverage requires them.
- Risk: high, because static website discovery feeds sitemap/feed/collection/inline/download resource discovery and durable website resource persistence.
- Required proof: `pnpm typecheck`; `pnpm unit_tests:ts`; `pnpm lint`; `pnpm test:website:compose`; `pnpm test:hard-sites:compose`; `git diff --check --`; cleanup/residual state check.
- Acceptance criteria: met.
- Architecture note: affected concern is website ingestion runtime cohesion; stakeholder/consumer is website source polling, discovery probing and browser-assisted fallback decisioning; PostgreSQL/outbox behavior stays untouched while static discovery adapters move behind a narrow fetcher contract.
- Implemented, with evidence: extracted sitemap/feed/collection/inline-data/download static discovery adapters from `services/fetchers/src/web-ingestion.ts` into `services/fetchers/src/web-ingestion-static-discovery.ts`.
- Implemented, with evidence: added a narrow `WebsiteTextFetcher` and conditional-state key callback contract so static discovery can fetch through the existing authenticated/conditional fetch path without owning cache or persistence semantics.
- Implemented, with evidence: updated `probeWebsitesForDiscovery` and `discoverWebsiteResources` to call the focused static discovery module with named option objects; public website ingestion exports and helper compatibility exports remain stable.
- Implemented, with evidence: `services/fetchers/src/web-ingestion.ts` reduced from 1711 lines after Batch 60 to 1447 lines; `services/fetchers/src/web-ingestion-static-discovery.ts` owns 380 lines.
- Scope note: DB schema, queue/event names, fetcher persistence, provider/acquisition behavior, browser-assisted policy behavior, website classification algorithm and API/admin/worker behavior remain intentionally unchanged.
- Passed proof: `pnpm typecheck` passed with 0 errors and 0 warnings, retaining only existing Astro hints; `pnpm unit_tests:ts` passed with 246 tests; `pnpm lint` passed; `git diff --check --` passed.
- Passed stateful proof: after `pnpm dev:mvp:internal`, `pnpm test:website:compose` and `pnpm test:hard-sites:compose` passed.
- Cleanup proof: `pnpm dev:mvp:internal:down:volumes` completed and final `docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'` returned no running containers.
- Final worktree proof: `git status --short` remains dirty only with completed architecture-hardening files, completed Batch 57 harness fix, completed Batch 58/59 fetcher persistence files, completed Batch 60/61 website-ingestion files and this AIDP state update.

### ARCH-HARDENING-FOLLOWUP-BATCH-60-WEBSITE-INGESTION-EXTRACTION-HELPERS

- Kind: Stage
- Status: completed
- In scope: extract pure website ingestion types and URL/HTML/resource helper functions from `services/fetchers/src/web-ingestion.ts` into focused modules; keep public exports/import compatibility and runtime orchestration behavior unchanged.
- Out of scope: DB schema changes, queue/event name changes, fetcher persistence changes, provider/acquisition behavior changes, browser-assisted policy behavior changes, website classification algorithm changes, API/admin/worker behavior changes and broad harness changes.
- Allowed paths: `.aidp/work.md`, `services/fetchers/src/web-ingestion.ts`, new focused modules under `services/fetchers/src/`, and targeted TS tests only if compatibility coverage requires them.
- Risk: high, because website discovery helpers feed sitemap/feed/collection/inline/browser candidate discovery and durable resource persistence.
- Required proof: `pnpm unit_tests:ts`; `pnpm lint`; `pnpm typecheck`; `pnpm test:website:compose`; `pnpm test:hard-sites:compose`; `git diff --check --`; cleanup/residual state check.
- Acceptance criteria: met.
- Architecture note: affected concern is website ingestion helper cohesion; stakeholder/consumer is website discovery, browser-assisted discovery and fetcher resource persistence; PostgreSQL/outbox behavior stays untouched while pure parsing/classification-adjacent helpers move behind narrow modules.
- Implemented, with evidence: moved website ingestion public/shared types from `services/fetchers/src/web-ingestion.ts` into `services/fetchers/src/web-ingestion-types.ts` and kept compatibility type re-exports from `web-ingestion.ts`.
- Implemented, with evidence: moved pure URL/HTML/resource helper logic into `services/fetchers/src/web-ingestion-extraction.ts`, including collection link extraction, link/feed/download extraction, JSON-LD/inline-data URL extraction, resource dedupe, cursor filtering, pattern filtering and browser fallback recommendation helpers.
- Implemented, with evidence: `services/fetchers/src/web-ingestion.ts` now owns runtime cache/fetching/probe/discovery orchestration while importing helper names from the focused extraction module; public exports for `extractCollectionLinkCandidates`, `selectWebsiteDiscoveryModes` and `shouldAttemptBrowserAssistedDiscovery` remain stable.
- Implemented, with evidence: `services/fetchers/src/web-ingestion.ts` reduced from 2629 lines before Batch 60 to 1711 lines; new focused modules own 824 and 191 lines.
- Scope note: DB schema, queue/event names, fetcher persistence, provider/acquisition behavior, browser-assisted policy behavior, website classification algorithm and API/admin/worker behavior remain intentionally unchanged.
- Passed proof: `pnpm typecheck` passed with 0 errors and 0 warnings, retaining only existing Astro hints; `pnpm unit_tests:ts` passed with 246 tests; `pnpm lint` passed; `git diff --check --` passed.
- Passed stateful proof: after `pnpm dev:mvp:internal`, `pnpm test:website:compose` and `pnpm test:hard-sites:compose` passed.
- Cleanup proof: `pnpm dev:mvp:internal:down:volumes` completed and final `docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'` returned no running containers.
- Final worktree proof: `git status --short` remains dirty only with completed architecture-hardening files, completed Batch 57 harness fix, completed Batch 58/59 fetcher persistence files, completed Batch 60 website-ingestion files and this AIDP state update.

### ARCH-HARDENING-FOLLOWUP-BATCH-59-FETCHER-PERSISTENCE-SUBREPOSITORIES

- Kind: Stage
- Status: completed
- In scope: split `services/fetchers/src/fetcher-persistence.ts` into a stable facade plus focused channel-state and content-write persistence modules; keep the public `FetcherPersistenceRepository` API, exported helper/type names and fetcher call sites behavior-compatible.
- Out of scope: DB schema changes, queue/event name changes, provider/acquisition behavior changes, RSS/website parsing changes, browser-assisted policy changes, scheduler redesign, API/admin/worker behavior changes and broad test harness changes.
- Allowed paths: `.aidp/work.md`, `services/fetchers/src/fetcher-persistence.ts`, new focused modules under `services/fetchers/src/`, and targeted TS tests only if compatibility coverage requires them.
- Risk: high, because the extracted repository owns source-channel lease/cursor/runtime state, article/resource durable writes and outbox event persistence used by relay, workers and admin/operator proofs.
- Required proof: `pnpm unit_tests:ts`; `pnpm lint`; `pnpm typecheck`; `pnpm test:ingest:compose`; `pnpm test:website:compose`; `pnpm test:hard-sites:compose` if website persistence coupling is affected; `git diff --check --`; cleanup/residual state check.
- Acceptance criteria: met.
- Architecture note: affected concern is fetcher ingestion persistence internal cohesion; stakeholder/consumer is RSS/website acquisition, relay/worker article pipeline and admin/operator proof; PostgreSQL remains durable truth while the new Batch 58 persistence facade becomes a thin composition root instead of a second hotspot.
- Implemented, with evidence: split `services/fetchers/src/fetcher-persistence.ts` into a 72-line compatibility facade plus `services/fetchers/src/fetcher-channel-state-repository.ts`, `services/fetchers/src/fetcher-content-repository.ts` and `services/fetchers/src/fetcher-persistence-types.ts`.
- Implemented, with evidence: `FetcherChannelStateRepository` now owns advisory lease, due-channel loading, channel lookup, cursor reads/writes, fetch-run inserts and adaptive runtime-state updates.
- Implemented, with evidence: `FetcherContentRepository` now owns article/resource duplicate preflight, article writes, website resource writes, article observation upsert and outbox event inserts.
- Implemented, with evidence: public `FetcherPersistenceRepository` methods and exported helper/type names remain stable through facade re-exports; `services/fetchers/src/fetchers.ts` call sites remain unchanged.
- Scope note: SQL behavior, DB schema, queue/event names, provider/acquisition behavior, RSS/website parsing, browser-assisted policy, scheduler behavior and API/admin/worker behavior remain intentionally unchanged.
- Passed proof: `pnpm unit_tests:ts` passed with 246 tests, including duplicate preflight and website cache coverage.
- Passed proof: `pnpm lint` passed; `pnpm typecheck` passed with 0 errors and 0 warnings, retaining only existing Astro hints; `git diff --check --` passed.
- Passed stateful proof: initial `pnpm test:ingest:compose` failed only because `fetchers` service was not running; after `pnpm dev:mvp:internal`, `pnpm test:ingest:compose`, `pnpm test:website:compose`, `pnpm test:hard-sites:compose` and `pnpm test:channel-auth:compose` passed.
- Passed stateful proof: `pnpm test:ingest:multi:compose` passed for 24 RSS channels, including second fetch-cycle idempotency and not-modified coverage, then stopped compose and removed dev volumes.
- Cleanup proof: final `docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'` returned no running containers.
- Final worktree proof: `git status --short` remains dirty only with completed architecture-hardening files, completed Batch 57 harness fix, completed Batch 58/59 fetcher persistence files and this AIDP state update.

### ARCH-HARDENING-FOLLOWUP-BATCH-58-FETCHER-PERSISTENCE-REPOSITORY

- Kind: Stage
- Status: completed
- In scope: extract PostgreSQL persistence for fetcher channel loading/lease, cursors, article/resource writes, outbox writes, fetch completion and runtime state from `services/fetchers/src/fetchers.ts` into focused repository modules; preserve public `RssFetcherService` behavior and acquisition/classification flow.
- Out of scope: DB schema changes, queue/event name changes, provider behavior changes, RSS/website parsing changes, browser-assisted policy changes, API/admin read-model changes and broad fetcher scheduler redesign.
- Allowed paths: `.aidp/work.md`, `services/fetchers/src/fetchers.ts`, new focused modules under `services/fetchers/src/`, targeted TS tests only if compatibility/type coverage requires them.
- Risk: high, because fetcher persistence writes source truth, article/resource rows, outbox events and cursor/runtime state used by workers, admin and proofs.
- Required proof: targeted TypeScript compile/type proof for fetchers; `pnpm unit_tests:ts`; `pnpm lint`; `pnpm typecheck`; `pnpm test:ingest:compose`; `pnpm test:website:compose`; `pnpm test:hard-sites:compose` if website resource persistence is touched; `git diff --check --`; cleanup/residual state check.
- Acceptance criteria: met.
- Architecture note: affected concern is fetcher ingestion persistence boundary; stakeholder/consumer is RSS/website acquisition, relay/worker article pipeline and admin/operator proof; PostgreSQL remains durable truth while persistence moves behind cohesive fetcher repository modules.
- Implemented, with evidence: extracted channel loading/lease, cursor reads/writes, article/resource persistence, outbox writes, fetch-run inserts and source-channel runtime state updates from `services/fetchers/src/fetchers.ts` into `services/fetchers/src/fetcher-persistence.ts`.
- Implemented, with evidence: `services/fetchers/src/fetchers.ts` now keeps acquisition/orchestration/build-input logic and delegates persistence through `FetcherPersistenceRepository`; compatibility export for `classifyDuplicatePreflightInputs` is preserved for existing tests.
- Implemented, with evidence: extracted crawl policy cache SQL from `services/fetchers/src/web-ingestion.ts` into `services/fetchers/src/web-ingestion-persistence.ts`, leaving `CrawlPolicyCacheService` to orchestrate policy fetching/building and delegate DB load/upsert/conditional-state writes.
- Implemented, with evidence: `services/fetchers/src/fetchers.ts` reduced from 2168 lines to 1170 lines; `services/fetchers/src/web-ingestion.ts` reduced from 2725 lines to 2629 lines; new persistence modules own 1043 and 140 lines respectively.
- Scope note: DB schema, queue/event names, provider behavior, RSS/website parsing, browser-assisted policy, API/admin read models and scheduler behavior remain intentionally unchanged.
- Passed proof: `pnpm unit_tests:ts` passed with 246 tests; `pnpm lint` passed; `pnpm typecheck` passed with 0 errors and 0 warnings, retaining only existing Astro hints; `git diff --check --` passed.
- Passed stateful proof: `pnpm test:ingest:compose` passed after the compose stack was started; the initial attempt failed only because `fetchers` was not running.
- Passed stateful proof: `pnpm test:website:compose`, `pnpm test:channel-auth:compose`, `pnpm test:hard-sites:compose` and `pnpm test:ingest:multi:compose` passed; multi RSS covered 24 channels and cleaned compose/dev volumes.
- Cleanup proof: final `docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'` returned no running containers.
- Final worktree proof: `git status --short` remains dirty only with completed architecture-hardening files, completed Batch 58 fetcher persistence files and AIDP state.

### ARCH-HARDENING-FOLLOWUP-BATCH-57-MAXIMUM-PROOF-CHECKPOINT

- Kind: Sweep
- Status: completed
- In scope: run maximum necessary local/static/unit/build/stateful proof for completed architecture-hardening batches; fix failures found by proof when they are caused by current work; record residual proof gaps and cleanup state.
- Out of scope: new feature work, broad additional refactors, DB schema changes, queue/event/public API changes, destructive cleanup such as volume reset unless explicitly required and approved.
- Allowed paths: `.aidp/work.md`, files already touched by completed ARCH-HARDENING-FOLLOWUP batches, and narrow test/proof fixes directly required by failed gates.
- Risk: high, because this checkpoint exercises cross-surface API/worker/discovery/fetcher/admin/MCP behavior and may create local compose artifacts.
- Required proof: `pnpm unit_tests`; `pnpm lint`; `pnpm typecheck`; `pnpm build`; `pnpm test:migrations:smoke`; targeted compose gates for discovery/fetcher/MCP/admin as feasible; `pnpm integration_tests`; `pnpm test:product:local:core`; `pnpm test:product:local:full` if core and targeted gates pass; `git diff --check --`; cleanup/residual artifact status.
- Acceptance criteria: met.
- Architecture note: affected concern is proof confidence after architecture hardening; stakeholder/consumer is future refactor safety; behavior and contracts should remain unchanged while proof validates the extracted boundaries.
- Implemented, with evidence: ran the maximum local/static/unit/build/stateful proof pass requested by the user after Batch 1 through Batch 56 and fixed the only code-owned proof issue found.
- Fixed, with evidence: updated `infra/scripts/test-rss-multi-flow.mjs` so the multi RSS proof matches sequence-runtime behavior where `article.normalized` downstream outbox can be intentionally suppressed while the durable `article.ingest.requested` outbox and worker inbox progression still prove normalize/dedup flow. The harness now accepts zero normalized outbox events as the current architecture shape but still fails on partial normalized fanout.
- Passed proof: `pnpm unit_tests` passed with TS 246 tests and Python 316 tests; `pnpm lint` passed; `pnpm typecheck` passed with 0 errors and 0 warnings, retaining only existing Astro hints; `pnpm build` passed; `git diff --check --` passed.
- Passed proof: `pnpm test:migrations:smoke` initially failed with `ECONNREFUSED 127.0.0.1:55432` while the compose stack was down, then passed after starting the canonical local stack.
- Passed proof: `pnpm integration_tests` passed and cleaned its stack/volumes.
- Passed proof: `pnpm test:product:local:core` initially failed due a compose lifecycle/container-name conflict after previous stack state, then passed on a clean rerun after `pnpm dev:mvp:internal:down:volumes`; artifact `/tmp/newsportal-product-local-core-c92d4d12.md`.
- Passed proof: targeted discovery/fetcher gates passed: `pnpm test:discovery-enabled:compose`, `pnpm test:discovery:admin:compose`, `pnpm test:discovery:examples:compose`, `pnpm test:discovery:yield:compose`, `pnpm test:hard-sites:compose`.
- Passed proof: `pnpm test:ingest:multi:compose` first exposed the outdated outbox expectation described above; after the harness fix it passed for the 24-channel multi RSS flow.
- Passed proof: `pnpm test:product:local:full` passed; artifact `/tmp/newsportal-product-local-full-7fcb1894.md`. The full run included static/unit/build gates, integration/MVP, website, website-admin, automation-admin, deterministic MCP, web viewports, UI button audit, discovery-enabled/admin/examples/yield, website matrix and MCP HTTP live.
- Live-provider note: `website-matrix` recorded external upstream blocks as truthful live states, not product regressions: 16 live sites total, 7 `observed_expected_shape`, 8 `observed_truthful_unsupported_or_blocked`, 1 `observed_partial_or_empty_shape`; artifact `/tmp/newsportal-live-website-matrix-baseline-cb8b4bfa-3ab9-4aa4-9a28-3ffd794e43f5.json`.
- Cleanup proof: final `pnpm dev:mvp:internal:down:volumes` completed and `docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'` returned no running containers.
- Final worktree proof: `git diff --check --` passed; `git status --short` remains dirty only with completed architecture-hardening files, the Batch 57 harness fix and this AIDP state update.

### ARCH-HARDENING-FOLLOWUP-BATCH-56-WORKER-DISCOVERY-REPOSITORY-SOURCE-QUALITY-COST-MIXIN

- Kind: Stage
- Status: completed
- In scope: move source-profile persistence, source interest score/quality snapshot, portfolio snapshot, cost log/month-to-date cost, feedback events, strategy stats and channel metrics private repository SQL methods from `services/workers/app/discovery_repository.py` into a focused `services/workers/app/discovery_repository_source_quality.py` mixin; keep `DiscoveryCoordinatorRepository` as the public repository class and preserve async public method names/signatures.
- Out of scope: SQL behavior changes, DB schema, public repository method signatures, mission/hypothesis/candidate repository methods already extracted, discovery runtime wrappers, task-engine contracts, queue names and compose/runtime behavior changes.
- Allowed paths: `.aidp/work.md`, `services/workers/app/discovery_repository.py`, `services/workers/app/discovery_repository_source_quality.py`, `services/workers/app/discovery_repository_candidates.py`, `services/workers/app/discovery_repository_mission_hypotheses.py`, `services/workers/app/discovery_orchestrator.py`, `tests/unit/python/test_discovery_orchestrator.py`.
- Risk: high, because source quality and cost persistence are used by discovery execution, recall acquisition and evaluation; the move must preserve method names, SQL text/parameters and MRO behavior.
- Required proof: targeted Python syntax/import proof; targeted discovery orchestrator unit suite; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; compose discovery proof only if targeted/static gates reveal uncertainty.
- Acceptance criteria: met.
- Architecture note: affected concern is discovery repository internal breadth around source quality and cost persistence; stakeholder/consumer is worker discovery execution/recall/evaluation runtime; PostgreSQL remains durable truth while source-quality/cost SQL gets a cohesive owner module.
- Implemented, with evidence: moved source-profile persistence, source interest score/quality snapshot, portfolio snapshot, cost log/month-to-date cost, feedback events, strategy stats and channel metrics private SQL methods into `services/workers/app/discovery_repository_source_quality.py`.
- Implemented, with evidence: `DiscoveryCoordinatorRepository` now subclasses `DiscoverySourceQualityRepositoryMixin` alongside the mission/hypothesis and candidate/stats mixins, preserving public async method names/signatures and private method availability through MRO.
- Implemented, with evidence: `services/workers/app/discovery_repository.py` reduced from 1044 lines after Batch 55 to 363 lines; `services/workers/app/discovery_repository_source_quality.py` owns 689 lines.
- Scope note: mission/hypothesis/candidate repository methods already extracted, SQL behavior, DB schema, public repository method signatures, discovery runtime wrappers, task-engine contracts, queue names and compose/runtime behavior remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched worker/test modules passed; targeted `tests.unit.python.test_discovery_orchestrator` passed with 18 tests; `pnpm unit_tests:py` passed with 316 tests; `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed.
- Proof caveat: no compose proof was run for this batch because required static/unit gates passed and the slice was behavior-preserving repository mixin extraction with direct discovery orchestrator unit coverage; `pnpm typecheck` still reports existing Astro hints only, with 0 errors and 0 warnings.

### ARCH-HARDENING-FOLLOWUP-BATCH-55-WORKER-DISCOVERY-REPOSITORY-CANDIDATE-STATS-MIXIN

- Kind: Stage
- Status: completed
- In scope: move candidate/recall-candidate persistence, candidate review/update, hypothesis candidate stats, hypothesis effectiveness and mission/recall mission stats refresh private repository SQL methods from `services/workers/app/discovery_repository.py` into a focused `services/workers/app/discovery_repository_candidates.py` mixin; keep `DiscoveryCoordinatorRepository` as the public repository class and preserve async public method names/signatures.
- Out of scope: SQL behavior changes, DB schema, public repository method signatures, source-profile/scoring/cost repository methods, discovery runtime wrappers, task-engine contracts, queue names and compose/runtime behavior changes.
- Allowed paths: `.aidp/work.md`, `services/workers/app/discovery_repository.py`, `services/workers/app/discovery_repository_candidates.py`, `services/workers/app/discovery_repository_mission_hypotheses.py`, `services/workers/app/discovery_orchestrator.py`, `tests/unit/python/test_discovery_orchestrator.py`.
- Risk: high, because candidate persistence and aggregate refresh are used by discovery execution, recall acquisition and evaluation; the move must preserve method names, SQL text/parameters and MRO behavior.
- Required proof: targeted Python syntax/import proof; targeted discovery orchestrator unit suite; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; compose discovery proof only if targeted/static gates reveal uncertainty.
- Acceptance criteria: met.
- Architecture note: affected concern is discovery repository internal breadth around candidate persistence and aggregate refresh; stakeholder/consumer is worker discovery execution/recall/evaluation runtime; PostgreSQL remains durable truth while candidate/stats SQL gets a cohesive owner module.
- Implemented, with evidence: moved candidate/recall-candidate persistence, review/update, hypothesis candidate stats, hypothesis effectiveness and mission/recall mission stats refresh private SQL methods into `services/workers/app/discovery_repository_candidates.py`.
- Implemented, with evidence: `DiscoveryCoordinatorRepository` now subclasses `DiscoveryCandidateRepositoryMixin` alongside the mission/hypothesis mixin, preserving public async method names/signatures and private method availability through MRO.
- Implemented, with evidence: `services/workers/app/discovery_repository.py` reduced from 1490 lines after Batch 54 to 1044 lines; `services/workers/app/discovery_repository_candidates.py` owns 464 lines.
- Scope note: source-profile/scoring/cost repository methods, SQL behavior, DB schema, public repository method signatures, discovery runtime wrappers, task-engine contracts, queue names and compose/runtime behavior remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched worker/test modules passed; targeted `tests.unit.python.test_discovery_orchestrator` passed with 18 tests; `pnpm unit_tests:py` passed with 316 tests; `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed.
- Proof caveat: no compose proof was run for this batch because required static/unit gates passed and the slice was behavior-preserving repository mixin extraction with direct discovery orchestrator unit coverage; `pnpm typecheck` still reports existing Astro hints only, with 0 errors and 0 warnings.

### ARCH-HARDENING-FOLLOWUP-BATCH-54-WORKER-DISCOVERY-REPOSITORY-MISSION-HYPOTHESIS-MIXINS

- Kind: Stage
- Status: completed
- In scope: move mission, recall mission, hypothesis-class and hypothesis-state private repository SQL methods from `services/workers/app/discovery_repository.py` into a focused `services/workers/app/discovery_repository_mission_hypotheses.py` mixin; keep `DiscoveryCoordinatorRepository` as the public repository class and preserve async public method names/signatures.
- Out of scope: SQL behavior changes, DB schema, public repository method signatures, candidate/source-profile/scoring/cost repository methods, discovery runtime wrappers, task-engine contracts, queue names and compose/runtime behavior changes.
- Allowed paths: `.aidp/work.md`, `services/workers/app/discovery_repository.py`, `services/workers/app/discovery_repository_mission_hypotheses.py`, `services/workers/app/discovery_orchestrator.py`, `tests/unit/python/test_discovery_orchestrator.py`.
- Risk: high, because these private methods back planning, graph compile and hypothesis execution; the move must preserve method names, SQL text/parameters and MRO behavior.
- Required proof: targeted Python syntax/import proof; targeted discovery orchestrator unit suite; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; compose discovery proof only if targeted/static gates reveal uncertainty.
- Acceptance criteria: met.
- Architecture note: affected concern is discovery repository internal breadth; stakeholder/consumer is worker discovery planning/execution runtime; PostgreSQL remains durable truth while mission/hypothesis SQL gets a cohesive owner module.
- Implemented, with evidence: moved mission, recall mission, hypothesis-class and hypothesis-state private SQL methods into `services/workers/app/discovery_repository_mission_hypotheses.py`.
- Implemented, with evidence: `DiscoveryCoordinatorRepository` now subclasses `DiscoveryMissionHypothesisRepositoryMixin`, preserving public async method names/signatures and private method availability through MRO.
- Implemented, with evidence: `services/workers/app/discovery_repository.py` reduced from 2041 lines after Batch 53 to 1490 lines; `services/workers/app/discovery_repository_mission_hypotheses.py` owns 562 lines.
- Scope note: candidate/source-profile/scoring/cost repository methods, SQL behavior, DB schema, public repository method signatures, discovery runtime wrappers, task-engine contracts, queue names and compose/runtime behavior remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched worker/test modules passed; targeted `tests.unit.python.test_discovery_orchestrator` passed with 18 tests; `pnpm unit_tests:py` passed with 316 tests; `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed.
- Proof caveat: no compose proof was run for this batch because required static/unit gates passed and the slice was behavior-preserving repository mixin extraction with direct discovery orchestrator unit coverage; `pnpm typecheck` still reports existing Astro hints only, with 0 errors and 0 warnings.

### ARCH-HARDENING-FOLLOWUP-BATCH-53-WORKER-DISCOVERY-REPOSITORY

- Kind: Stage
- Status: completed
- In scope: move `DiscoveryCoordinatorRepository` and its persistence SQL implementation from `services/workers/app/discovery_orchestrator.py` into `services/workers/app/discovery_repository.py`; keep `DiscoveryCoordinatorRepository` importable from `discovery_orchestrator.py` as a compatibility alias for API/tests.
- Out of scope: SQL behavior changes, DB schema, repository method signatures, discovery runtime wrappers, task-engine contracts, queue names and compose/runtime behavior changes.
- Allowed paths: `.aidp/work.md`, `services/workers/app/discovery_orchestrator.py`, `services/workers/app/discovery_repository.py`, `tests/unit/python/test_discovery_orchestrator.py`.
- Risk: high, because this mechanically moves the persistence boundary used by graph planning, execution, recall acquisition and evaluation; it must preserve method signatures, SQL text/parameters and orchestrator compatibility exports.
- Required proof: targeted Python syntax/import proof; targeted discovery orchestrator unit suite; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; compose discovery proof only if targeted/static gates reveal uncertainty.
- Acceptance criteria: met.
- Architecture note: affected concern is discovery persistence/repository boundary; stakeholder/consumer is API maintenance surfaces and worker discovery runtime modules; PostgreSQL remains durable truth while persistence SQL moves into a cohesive repository module.
- Implemented, with evidence: moved `DiscoveryCoordinatorRepository` and its persistence SQL implementation into `services/workers/app/discovery_repository.py`.
- Implemented, with evidence: `services/workers/app/discovery_orchestrator.py` now imports and re-exports `DiscoveryCoordinatorRepository` as a compatibility alias, with explicit `__all__` for the public compatibility surface used by API/tests.
- Implemented, with evidence: repository method signatures, SQL text/parameters and public runtime wrappers were not intentionally changed; the move was mechanical around the persistence boundary.
- Implemented, with evidence: `services/workers/app/discovery_orchestrator.py` is reduced to 172 lines after this extraction; `services/workers/app/discovery_repository.py` owns 2041 lines of repository/persistence code.
- Scope note: SQL behavior, DB schema, repository method signatures, discovery runtime wrappers, task-engine contracts, queue names and compose/runtime behavior remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched worker/test modules passed; targeted `tests.unit.python.test_discovery_orchestrator` passed with 18 tests; `pnpm unit_tests:py` passed with 316 tests; `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed.
- Proof caveat: no compose proof was run for this batch because required static/unit gates passed and the slice was behavior-preserving repository extraction with direct discovery orchestrator unit coverage; `pnpm typecheck` still reports existing Astro hints only, with 0 errors and 0 warnings.

### ARCH-HARDENING-FOLLOWUP-BATCH-52-WORKER-DISCOVERY-GRAPH-PLANNING-RUNTIME

- Kind: Stage
- Status: completed
- In scope: move `compile_interest_graph_for_mission` and `plan_hypotheses` implementation logic from `services/workers/app/discovery_orchestrator.py` into a focused `services/workers/app/discovery_graph_planning_runtime.py` module; keep public orchestrator function names/signatures as compatibility wrappers and preserve patchable runtime-call dependencies for existing tests.
- Out of scope: discovery planning pure helper algorithms already extracted, hypothesis class taxonomy, LLM task names/payload shapes, repository persistence methods, DB schema, task-engine contracts, queue names and compose/runtime behavior changes.
- Allowed paths: `.aidp/work.md`, `services/workers/app/discovery_orchestrator.py`, `services/workers/app/discovery_graph_planning_runtime.py`, `tests/unit/python/test_discovery_orchestrator.py`.
- Risk: high, because graph compile/planning controls mission graph state, LLM cost logging, fallback hypotheses and inserted discovery hypotheses; this must be behavior-preserving.
- Required proof: targeted Python syntax/import proof; targeted discovery orchestrator unit suite; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; compose discovery proof only if targeted/static gates reveal uncertainty.
- Acceptance criteria: met.
- Architecture note: affected concern is graph-first discovery mission planning; stakeholder/consumer is worker discovery planning task runtime; PostgreSQL/repository, LLM runtime adapter, planning helper algorithms and cost/quota boundaries remain unchanged while orchestration moves behind a cohesive module.
- Implemented, with evidence: moved `compile_interest_graph_for_mission` and `plan_hypotheses` implementation logic into `services/workers/app/discovery_graph_planning_runtime.py`.
- Implemented, with evidence: `services/workers/app/discovery_orchestrator.py` keeps public wrappers with the same function names/signatures and passes patchable runtime-call dependencies to preserve existing tests/callers.
- Implemented, with evidence: preserved `discovery_month_start_utc` compatibility export from `discovery_orchestrator.py` for API imports while keeping graph planning runtime logic extracted.
- Implemented, with evidence: `services/workers/app/discovery_orchestrator.py` is reduced to 2187 lines after this extraction; `services/workers/app/discovery_graph_planning_runtime.py` owns 200 lines of graph planning orchestration.
- Scope note: discovery planning pure helper algorithms, hypothesis class taxonomy, LLM task names/payload shapes, repository persistence methods, DB schema, task-engine contracts, queue names and compose/runtime behavior remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched worker/test modules passed; targeted `tests.unit.python.test_discovery_orchestrator` passed with 18 tests; `pnpm unit_tests:py` passed with 316 tests; `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed.
- Proof caveat: no compose proof was run for this batch because required static/unit gates passed and the slice was behavior-preserving graph planning extraction with direct discovery orchestrator unit coverage; `pnpm typecheck` still reports existing Astro hints only, with 0 errors and 0 warnings.

### ARCH-HARDENING-FOLLOWUP-BATCH-51-WORKER-DISCOVERY-EXECUTION-RUNTIME

- Kind: Stage
- Status: completed
- In scope: move `execute_hypotheses` implementation logic from `services/workers/app/discovery_orchestrator.py` into a focused `services/workers/app/discovery_execution_runtime.py` module; keep the public orchestrator function name/signature as a compatibility wrapper and preserve patchable runtime/executor dependencies for existing tests.
- Out of scope: repository persistence methods, task-engine implementation, sequence registry/contracts, queue names, DB schema, policy/scoring algorithms, source registrar behavior, discovery planning and compose/runtime behavior changes.
- Allowed paths: `.aidp/work.md`, `services/workers/app/discovery_orchestrator.py`, `services/workers/app/discovery_execution_runtime.py`, `tests/unit/python/test_discovery_orchestrator.py`.
- Risk: high, because hypothesis execution dispatches child sequence runs, persists candidates, source profiles, interest scores, quality snapshots, portfolio snapshots, gap hypotheses, auto-registration status and discovery cost logs.
- Required proof: targeted Python syntax/import proof; targeted discovery orchestrator unit suite; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; compose discovery proof only if targeted/static gates reveal uncertainty.
- Acceptance criteria: met.
- Architecture note: affected concern is graph-first discovery hypothesis execution; stakeholder/consumer is worker discovery execution task runtime; PostgreSQL/repository, task-engine sequence execution, source registrar, policy/scoring and quota boundaries remain unchanged while the orchestration step moves behind a cohesive module.
- Implemented, with evidence: moved `execute_hypotheses` implementation logic into `services/workers/app/discovery_execution_runtime.py`.
- Implemented, with evidence: `services/workers/app/discovery_orchestrator.py` keeps public `execute_hypotheses` wrapper with the same signature and passes patchable runtime-call, executor and task-registry dependencies to preserve existing tests/callers.
- Implemented, with evidence: `services/workers/app/discovery_orchestrator.py` is reduced to 2329 lines after this extraction; `services/workers/app/discovery_execution_runtime.py` owns 383 lines of graph hypothesis execution runtime logic.
- Scope note: repository persistence methods, task-engine implementation, sequence registry/contracts, queue names, DB schema, policy/scoring algorithms, source registrar behavior, discovery planning and compose/runtime behavior remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched worker/test modules passed; targeted `tests.unit.python.test_discovery_orchestrator` passed with 18 tests; `pnpm unit_tests:py` passed with 316 tests; `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed.
- Proof caveat: no compose proof was run for this batch because required static/unit gates passed and the slice was behavior-preserving graph execution extraction with direct discovery orchestrator unit coverage; `pnpm typecheck` still reports existing Astro hints only, with 0 errors and 0 warnings.

### ARCH-HARDENING-FOLLOWUP-BATCH-50-WORKER-DISCOVERY-RECALL-ORCHESTRATION

- Kind: Stage
- Status: completed
- In scope: move `acquire_recall_missions` implementation logic from `services/workers/app/discovery_orchestrator.py` into a focused `services/workers/app/discovery_recall_orchestration.py` module; keep the public orchestrator function name/signature as a compatibility wrapper.
- Out of scope: recall persistence repository methods, policy/scoring algorithms, provider adapters, DB schema, task-engine plugin contracts, public task names, queue names, environment/config behavior and compose/runtime behavior changes.
- Allowed paths: `.aidp/work.md`, `services/workers/app/discovery_orchestrator.py`, `services/workers/app/discovery_recall_orchestration.py`, `services/workers/app/discovery_recall_runtime.py`, `tests/unit/python/test_discovery_orchestrator.py`.
- Risk: high, because recall acquisition runs bounded live search/probe orchestration and writes recall candidates, source profiles, quality snapshots and policy reviews; this must be behavior-preserving.
- Required proof: targeted Python syntax/import proof; targeted discovery orchestrator unit suite; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; compose discovery proof only if targeted/static gates reveal uncertainty.
- Acceptance criteria: met.
- Architecture note: affected concern is independent recall acquisition orchestration; stakeholder/consumer is worker discovery recall task runtime; PostgreSQL/repository, task-engine runtime adapters and policy/scoring boundaries remain unchanged while the orchestration step moves behind a cohesive module.
- Implemented, with evidence: moved `acquire_recall_missions` implementation logic into `services/workers/app/discovery_recall_orchestration.py`.
- Implemented, with evidence: `services/workers/app/discovery_orchestrator.py` keeps public `acquire_recall_missions` wrapper with the same signature and passes patchable runtime-call dependencies to preserve existing tests/callers.
- Implemented, with evidence: compatibility aliases for recall helper names remain available from `discovery_orchestrator.py`; existing unit tests caught and verified this compatibility surface.
- Implemented, with evidence: `services/workers/app/discovery_orchestrator.py` is reduced to 2658 lines after this extraction; `services/workers/app/discovery_recall_orchestration.py` owns 286 lines of recall acquisition orchestration.
- Scope note: recall persistence repository methods, policy/scoring algorithms, provider adapters, DB schema, task-engine plugin contracts, public task names, queue names, environment/config behavior and compose/runtime behavior remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched worker/test modules passed; targeted `tests.unit.python.test_discovery_orchestrator` passed with 18 tests; `pnpm unit_tests:py` passed with 316 tests; `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed.
- Proof caveat: no compose proof was run for this batch because required static/unit gates passed and the slice was behavior-preserving recall orchestration extraction with direct discovery orchestrator unit coverage; `pnpm typecheck` still reports existing Astro hints only, with 0 errors and 0 warnings.

### ARCH-HARDENING-FOLLOWUP-BATCH-49-WORKER-DISCOVERY-EVALUATION-RUNTIME

- Kind: Stage
- Status: completed
- In scope: move `evaluate_hypotheses` and `re_evaluate_sources` implementation logic from `services/workers/app/discovery_orchestrator.py` into `services/workers/app/discovery_evaluation_runtime.py`; keep public orchestrator functions as compatibility wrappers and inject `compile_interest_graph_for_mission` where needed.
- Out of scope: repository persistence methods, scoring algorithms, portfolio algorithm, task-engine plugin contracts, DB schema, public task names and compose/runtime behavior changes.
- Allowed paths: `.aidp/work.md`, `services/workers/app/discovery_orchestrator.py`, `services/workers/app/discovery_evaluation_runtime.py`, `tests/unit/python/test_discovery_orchestrator.py`.
- Risk: high, because source re-evaluation writes quality snapshots, interest scores, portfolio snapshots and gap hypotheses; this must be behavior-preserving with targeted unit proof.
- Required proof: targeted Python syntax/import proof; targeted discovery orchestrator unit suite; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; compose discovery proof only if targeted/static gates reveal uncertainty.
- Acceptance criteria: met.
- Architecture note: affected concern is discovery evaluation runtime; stakeholder/consumer is worker discovery evaluation/re-evaluation tasks; repository and scoring boundaries remain unchanged while orchestration moves behind a focused module.
- Implemented, with evidence: moved `evaluate_hypotheses` and `re_evaluate_sources` implementation logic into `services/workers/app/discovery_evaluation_runtime.py`.
- Implemented, with evidence: `services/workers/app/discovery_orchestrator.py` keeps public compatibility wrappers with the same function names/signatures and injects `compile_interest_graph_for_mission` for re-evaluation.
- Implemented, with evidence: `services/workers/app/discovery_orchestrator.py` is reduced to 2891 lines after this extraction; `services/workers/app/discovery_evaluation_runtime.py` owns 204 lines of discovery evaluation/re-evaluation runtime logic.
- Scope note: repository persistence methods, scoring algorithms, portfolio algorithm, task-engine plugin contracts, DB schema, public task names and compose/runtime behavior remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched worker/test modules passed; targeted `tests.unit.python.test_discovery_orchestrator` passed with 18 tests; `pnpm unit_tests:py` passed with 316 tests; `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed.
- Proof caveat: no compose proof was run for this batch because required static/unit gates passed and the slice was behavior-preserving evaluation runtime extraction with direct discovery orchestrator unit coverage.

### ARCH-HARDENING-FOLLOWUP-BATCH-48-WORKER-DISCOVERY-RECALL-PLANNING

- Kind: Stage
- Status: completed
- In scope: move pure recall acquisition planning helpers from `services/workers/app/discovery_orchestrator.py` into `services/workers/app/discovery_recall_runtime.py`: recall search plan building and seed probe target building; preserve `_build_recall_search_plans` and `_seed_probe_targets_for_recall_mission` compatibility names in `discovery_orchestrator.py`.
- Out of scope: probe execution, web-search runtime calls, recall candidate persistence, repository methods, task-engine plugin contracts, DB schema and public task names.
- Allowed paths: `.aidp/work.md`, `services/workers/app/discovery_orchestrator.py`, `services/workers/app/discovery_recall_runtime.py`, `tests/unit/python/test_discovery_orchestrator.py`.
- Risk: medium-high, because recall planning affects source acquisition breadth even though this is a behavior-preserving extraction.
- Required proof: targeted Python syntax/import proof; targeted discovery orchestrator unit suite; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; compose discovery proof only if targeted/static gates reveal uncertainty.
- Acceptance criteria: met.
- Architecture note: affected concern is independent recall acquisition planning; stakeholder/consumer is worker discovery recall orchestration; runtime probe/search adapters and persistence boundaries remain unchanged.
- Implemented, with evidence: moved recall search plan building and seed probe target building into `services/workers/app/discovery_recall_runtime.py`.
- Implemented, with evidence: `services/workers/app/discovery_orchestrator.py` preserves `_build_recall_search_plans` and `_seed_probe_targets_for_recall_mission` as imported compatibility names; probe execution, search runtime calls and persistence are unchanged.
- Implemented, with evidence: `services/workers/app/discovery_orchestrator.py` is reduced to 3055 lines after this extraction; `services/workers/app/discovery_recall_runtime.py` owns 323 lines including recall planning/runtime helpers.
- Scope note: probe execution, web-search runtime calls, recall candidate persistence, repository methods, task-engine plugin contracts, DB schema and public task names remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched worker/test modules passed; targeted `tests.unit.python.test_discovery_orchestrator` passed with 18 tests; `pnpm unit_tests:py` passed with 316 tests; `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed.
- Proof caveat: no compose proof was run for this batch because required static/unit gates passed and the slice was behavior-preserving helper extraction with direct discovery orchestrator unit coverage.

### ARCH-HARDENING-FOLLOWUP-BATCH-47-WORKER-DISCOVERY-PLANNING

- Kind: Stage
- Status: completed
- In scope: move pure discovery planning helpers/constants from `services/workers/app/discovery_orchestrator.py` into `services/workers/app/discovery_planning.py`: text normalization/tokenization, interest graph validation/defaulting, query-family ordering, generation seed building, default hypothesis building and deduping; preserve imported names in `discovery_orchestrator.py` for internal/test compatibility.
- Out of scope: repository persistence methods, runtime adapter calls, LLM/web-search execution, recall acquisition, DB schema, task-engine plugin contracts and public task names.
- Allowed paths: `.aidp/work.md`, `services/workers/app/discovery_orchestrator.py`, `services/workers/app/discovery_planning.py`, `tests/unit/python/test_discovery_orchestrator.py`.
- Risk: medium-high, because hypothesis planning is core discovery behavior even though this is a behavior-preserving extraction.
- Required proof: targeted Python syntax/import proof; targeted discovery orchestrator unit suite; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; compose discovery proof only if targeted/static gates reveal uncertainty.
- Acceptance criteria: met.
- Architecture note: affected concern is discovery mission graph and hypothesis planning; stakeholder/consumer is worker task-engine discovery orchestration; PostgreSQL/repository and runtime adapter boundaries remain unchanged while planning becomes a cohesive module.
- Implemented, with evidence: moved discovery text normalization/tokenization, interest graph validation/defaulting, query-family ordering, generation seed building, default hypothesis building and hypothesis deduping into `services/workers/app/discovery_planning.py`.
- Implemented, with evidence: `services/workers/app/discovery_orchestrator.py` preserves previous constants/private helper names as module-level aliases, so internal and test compatibility surfaces remain stable.
- Implemented, with evidence: `services/workers/app/discovery_orchestrator.py` is reduced to 3196 lines after this extraction; `services/workers/app/discovery_planning.py` owns 363 lines of discovery planning logic.
- Scope note: repository persistence methods, runtime adapter calls, LLM/web-search execution, recall acquisition, DB schema, task-engine plugin contracts and public task names remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched worker/test modules passed; targeted `tests.unit.python.test_discovery_orchestrator` passed with 18 tests; `pnpm unit_tests:py` passed with 316 tests; `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed.
- Proof caveat: no compose proof was run for this batch because required static/unit gates passed and the slice was behavior-preserving helper extraction with direct discovery orchestrator unit coverage.

### ARCH-HARDENING-FOLLOWUP-BATCH-46-API-DISCOVERY-PAYLOADS

- Kind: Stage
- Status: completed
- In scope: move discovery FastAPI/Pydantic request payload models out of `services/api/app/main.py` into `services/api/app/discovery_payloads.py`; preserve all `api_main.Discovery*Payload` aliases, validation behavior, route annotations and tests.
- Out of scope: discovery command/read behavior already extracted, content-analysis payloads, route paths, DB schema, queue/outbox behavior and UI.
- Allowed paths: `.aidp/work.md`, `services/api/app/main.py`, `services/api/app/discovery_payloads.py`, `tests/unit/python/test_api_discovery_management.py`.
- Risk: medium-high, because discovery request models span multiple operator/admin surfaces even though this is a behavior-preserving alias extraction.
- Required proof: targeted Python syntax/import proof; targeted discovery management unit suite; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; stronger compose proof only if static/unit gates indicate behavioral uncertainty.
- Acceptance criteria: met.
- Architecture note: affected concern is API discovery request-model cohesion; stakeholder/consumer is FastAPI/admin discovery management; boundary stays in the existing discovery payload module while `main.py` keeps compatibility aliases.
- Implemented, with evidence: moved discovery mission, recall mission, policy profile, recall candidate, hypothesis class, candidate review, feedback and re-evaluation request payload models into `services/api/app/discovery_payloads.py`.
- Implemented, with evidence: `services/api/app/main.py` keeps compatibility aliases for existing `api_main.Discovery*Payload` imports and route annotations; route paths, response shapes, DB schema and queue/outbox behavior remain unchanged.
- Implemented, with evidence: `services/api/app/main.py` is reduced to 2977 lines after this extraction; `services/api/app/discovery_payloads.py` owns 392 lines including discovery request payloads and existing policy normalizers.
- Implemented, with evidence: `services/api/app/main.py` no longer imports Pydantic directly after all remaining payload classes moved into cohesive payload modules.
- Scope note: discovery command/read behavior, content-analysis payloads, route paths, DB schema, queue/outbox behavior and UI remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched API/test modules passed; targeted `tests.unit.python.test_api_discovery_management` passed with 40 tests; `pnpm unit_tests:py` passed with 316 tests; `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed.
- Proof caveat: no compose proof was run for this batch because required static/unit gates passed and the slice was behavior-preserving API request-model alias extraction with direct discovery unit coverage.

### ARCH-HARDENING-FOLLOWUP-BATCH-45-API-CONTENT-ANALYSIS-PAYLOADS

- Kind: Stage
- Status: completed
- In scope: move content-analysis FastAPI/Pydantic request payload models out of `services/api/app/main.py` into `services/api/app/content_analysis_payloads.py`; preserve `api_main.ContentAnalysisPolicyPayload`, `ContentAnalysisPolicyUpdatePayload`, `ContentFilterPolicyPayload`, `ContentFilterPolicyUpdatePayload` and `ContentAnalysisBackfillPayload` aliases, validation behavior, route annotations and tests.
- Out of scope: content-analysis read/write command behavior already extracted, discovery payloads, route paths, DB schema, queue/outbox behavior and UI.
- Allowed paths: `.aidp/work.md`, `services/api/app/main.py`, `services/api/app/content_analysis_payloads.py`, `tests/unit/python/test_api_discovery_management.py`.
- Risk: medium, because request models are public API surface even though this is a behavior-preserving alias extraction.
- Required proof: targeted Python syntax/import proof; targeted discovery/content-analysis management unit suite; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; stronger compose proof only if static/unit gates indicate behavioral uncertainty.
- Acceptance criteria: met.
- Architecture note: affected concern is API content-analysis request-model cohesion; stakeholder/consumer is FastAPI/admin discovery/content-analysis management; boundary stays in API payload module while wrappers preserve public import/annotation compatibility.
- Implemented, with evidence: moved `ContentAnalysisPolicyPayload`, `ContentAnalysisPolicyUpdatePayload`, `ContentFilterPolicyPayload`, `ContentFilterPolicyUpdatePayload` and `ContentAnalysisBackfillPayload` into `services/api/app/content_analysis_payloads.py`.
- Implemented, with evidence: `services/api/app/main.py` keeps compatibility aliases for existing `api_main.Content*Payload` imports and route annotations; route paths, response shapes, DB schema and queue/outbox behavior remain unchanged.
- Implemented, with evidence: `services/api/app/main.py` is reduced to 3208 lines after this extraction; `services/api/app/content_analysis_payloads.py` owns 127 lines of content-analysis request payload definitions.
- Scope note: content-analysis read/write command behavior, discovery payloads, route paths, DB schema, queue/outbox behavior and UI remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched API/test modules passed; targeted `tests.unit.python.test_api_discovery_management` passed with 40 tests; `pnpm unit_tests:py` passed with 316 tests; `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed.
- Proof caveat: no compose proof was run for this batch because required static/unit gates passed and the slice was behavior-preserving API request-model alias extraction with direct unit coverage.

### ARCH-HARDENING-FOLLOWUP-BATCH-44-API-SEQUENCE-PAYLOADS

- Kind: Stage
- Status: completed
- In scope: move sequence-related FastAPI/Pydantic request payload models out of `services/api/app/main.py` into `services/api/app/sequence_payloads.py`; preserve `api_main.SequenceCreatePayload`, `SequenceUpdatePayload`, `SequenceManualRunPayload`, `SequenceRetryRunPayload`, `AgentSequenceCreatePayload`, `SequenceCancelPayload` and `ArticleEnrichmentRetryPayload` aliases, validation behavior, route annotations and tests.
- Out of scope: sequence command/read behavior already extracted, discovery/content payloads, route paths, DB schema, queue dispatch behavior and UI.
- Allowed paths: `.aidp/work.md`, `services/api/app/main.py`, `services/api/app/sequence_payloads.py`, `tests/unit/python/test_api_sequence_management.py`, `tests/unit/python/test_api_sequence_agent.py`.
- Risk: medium, because route/request models are public API surface even though this is a behavior-preserving alias extraction.
- Required proof: targeted Python syntax/import proof; targeted sequence management and sequence agent unit suites; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; stronger compose proof only if static/unit gates indicate behavioral uncertainty.
- Acceptance criteria: met.
- Architecture note: affected concern is API sequence request-model cohesion; stakeholder/consumer is FastAPI/admin/MCP sequence tooling; boundary stays in API payload module while wrappers preserve public import/annotation compatibility; tradeoff is maintaining aliases in `main.py` during migration.
- Implemented, with evidence: moved `SequenceCreatePayload`, `SequenceUpdatePayload`, `SequenceManualRunPayload`, `SequenceRetryRunPayload`, `AgentSequenceCreatePayload`, `SequenceCancelPayload` and `ArticleEnrichmentRetryPayload` into `services/api/app/sequence_payloads.py`.
- Implemented, with evidence: `services/api/app/main.py` keeps compatibility aliases for existing `api_main.Sequence*Payload` import and monkeypatch surfaces; route paths, response shapes, DB schema and queue dispatch behavior remain unchanged.
- Implemented, with evidence: `services/api/app/main.py` is reduced to 3323 lines after this extraction; `services/api/app/sequence_payloads.py` owns 79 lines of sequence request payload definitions.
- Scope note: sequence command/read behavior, discovery/content payloads, route paths, DB schema, queue dispatch behavior and UI remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched API/test modules passed; targeted `tests.unit.python.test_api_sequence_management` plus `tests.unit.python.test_api_sequence_agent` passed with 27 tests; `pnpm unit_tests:py` passed with 316 tests; `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed.
- Proof caveat: no compose proof was run for this batch because required static/unit gates passed and the slice was behavior-preserving API request-model alias extraction with direct sequence unit coverage.

### ARCH-HARDENING-FOLLOWUP-BATCH-43-API-SEQUENCE-COMMANDS

- Kind: Stage
- Status: completed
- In scope: move sequence create/update/archive DB writes, run creation/dispatch failure marking, manual run request, retry request, active-trigger lookup, article enrichment retry outbox write, agent sequence request and run cancellation out of `services/api/app/main.py` into `services/api/app/sequence_commands.py`; preserve route paths, public errors, response shapes, queue dispatch behavior and `api_main` monkeypatch surfaces for validators, query helpers, sequence read helpers, outbox helper, dispatch helper and UUID generation.
- Out of scope: task-engine implementation, queue names, sequence schema, discovery routes, route registration, content read-models, compose/runtime proof unless unit/static gates reveal behavioral uncertainty.
- Allowed paths: `.aidp/work.md`, `services/api/app/main.py`, `services/api/app/sequence_commands.py`, `tests/unit/python/test_api_sequence_management.py`, `tests/unit/python/test_api_sequence_agent.py`.
- Risk: high, because this touches operator-facing sequence writes and dispatch error semantics; this slice must be behavior-preserving and keep compatibility wrappers.
- Required proof: targeted Python syntax/import proof; targeted sequence management and sequence agent unit suites; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; stronger compose proof only if static/unit gates indicate behavioral uncertainty.
- Acceptance criteria: met.
- Architecture note: affected concern is API sequence command cohesion; stakeholder/consumer is FastAPI/admin/MCP sequence tooling and worker sequence dispatch; boundary stays inside API command module with PostgreSQL as durable truth and BullMQ as transport; tradeoff is explicit dependency injection from `main.py` to preserve tests and route compatibility while removing sequence write orchestration from the god module.
- Implemented, with evidence: moved sequence create/update/archive DB writes into `services/api/app/sequence_commands.py`.
- Implemented, with evidence: moved sequence run creation, dispatch failure marking, manual retry request, active-trigger lookup, article enrichment retry outbox write, agent sequence request and run cancellation command orchestration into `services/api/app/sequence_commands.py`.
- Implemented, with evidence: `services/api/app/main.py` keeps compatibility wrappers for route registration and monkeypatch surfaces; queue dispatch helper, route paths, DB schema and public errors remain unchanged.
- Implemented, with evidence: `services/api/app/main.py` is reduced to 3386 lines after this extraction; `services/api/app/sequence_commands.py` owns 657 lines of sequence command logic.
- Scope note: task-engine implementation, queue names, sequence schema, discovery routes, route registration and content read-models remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched API/test modules passed; targeted `tests.unit.python.test_api_sequence_management` plus `tests.unit.python.test_api_sequence_agent` passed with 27 tests; `pnpm unit_tests:py` passed with 316 tests; `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed.
- Proof caveat: no compose proof was run for this batch because required static/unit gates passed and the slice was behavior-preserving API sequence command extraction with direct unit coverage for route wrappers, validation, retry context, dispatch-error mapping and article retry orchestration.

### ARCH-HARDENING-FOLLOWUP-BATCH-42-API-SEQUENCE-READ-VALIDATION

- Kind: Stage
- Status: completed
- In scope: move sequence validation helpers, JSON/cron normalization, select SQL builders, plugin listing, sequence definition/run read-models, sequence list pagination and task-run reads out of `services/api/app/main.py` into `services/api/app/sequence_read_model.py`; preserve route paths, public errors, response shapes and `api_main` monkeypatch surfaces for `query_one`, `query_all`, `query_count`, pagination, task registry, cron parsing and parent-run guards.
- Out of scope: sequence create/update/archive DB writes, run creation/dispatch/cancel/retry transactions, article enrichment retry event writes, discovery routes, DB schema, queue names and task registry contents.
- Allowed paths: `.aidp/work.md`, `services/api/app/main.py`, `services/api/app/sequence_read_model.py`, `tests/unit/python/test_api_sequence_management.py`, `tests/unit/python/test_api_sequence_agent.py`.
- Risk: medium-high, because sequence API validation/read-model behavior is operator-facing and tied to task-engine route contracts; this slice must be behavior-preserving and keep compatibility wrappers.
- Required proof: targeted Python syntax/import proof; targeted sequence management and sequence agent unit suites; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; stronger compose proof only if static/unit gates indicate behavioral uncertainty.
- Acceptance criteria: met.
- Architecture note: affected concern is API sequence read/validation cohesion; stakeholder/consumer is FastAPI/admin/MCP sequence tooling; boundary stays inside API read-model/validation module while PostgreSQL remains read truth and BullMQ dispatch stays untouched; tradeoff is explicit dependency injection from `main.py` to preserve current monkeypatch/test surfaces while reducing the sequence god-block.
- Implemented, with evidence: moved sequence validation helpers, retry-context sanitization, JSON dump validation and cron normalization into `services/api/app/sequence_read_model.py`.
- Implemented, with evidence: moved sequence select SQL builders, plugin listing, sequence list pagination, sequence definition/run reads and task-run reads into `services/api/app/sequence_read_model.py`.
- Implemented, with evidence: `services/api/app/main.py` keeps compatibility aliases for sequence errors and wrappers for existing monkeypatch surfaces; sequence write/dispatch/cancel/retry transactions remain in `main.py` by design.
- Implemented, with evidence: `services/api/app/main.py` is reduced to 3763 lines after this extraction; `services/api/app/sequence_read_model.py` owns 280 lines of sequence read/validation logic.
- Scope note: sequence create/update/archive writes, run creation/dispatch/cancel/retry transactions, article enrichment retry event writes, discovery routes, DB schema, queue names and task registry contents remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched API/test modules passed; targeted `tests.unit.python.test_api_sequence_management` plus `tests.unit.python.test_api_sequence_agent` passed with 27 tests; `pnpm unit_tests:py` passed with 316 tests; `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed.
- Proof caveat: no compose proof was run for this batch because required static/unit gates passed and the slice was behavior-preserving API sequence read/validation extraction with direct unit coverage; write/dispatch runtime semantics were intentionally not moved.

### ARCH-HARDENING-FOLLOWUP-BATCH-41-API-CONTENT-OPERATOR-READ-MODELS

- Kind: Stage
- Status: completed
- In scope: move API article list, article residual list/summary, system-selected content item list and dashboard summary read-model SQL/assembly out of `services/api/app/main.py` into cohesive API read-model modules; preserve route paths, response shapes, query parameter behavior and `api_main` monkeypatch surfaces for `query_one`, `query_all`, `query_count`, pagination, content-analysis filters, content selection/explain helpers and LLM budget summary.
- Out of scope: content detail and web resource detail already extracted, worker/fetcher behavior, DB schema, route paths, public response fields, admin UI changes, LLM budget implementation internals.
- Allowed paths: `.aidp/work.md`, `services/api/app/main.py`, `services/api/app/article_list_read_model.py`, `services/api/app/article_residual_read_model.py`, `services/api/app/content_item_list_read_model.py`, `services/api/app/dashboard_read_model.py`, `tests/unit/python/test_api_zero_shot_operator_surfaces.py`, `tests/unit/python/test_api_feed_dedup.py`.
- Risk: high, because this is a larger behavior-preserving extraction across user/operator content read surfaces with non-trivial SQL, pagination, selection diagnostics and dashboard budget composition.
- Required proof: targeted Python syntax/import proof; targeted zero-shot/operator and feed-dedup unit suites; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; stronger compose proof only if static/unit gates indicate behavioral uncertainty.
- Acceptance criteria: met.
- Architecture note: affected concern is API content/operator read-model cohesion; stakeholder/consumer is FastAPI/admin/web content and dashboard readers; boundary stays inside API read-model modules with PostgreSQL as read truth; tradeoff is explicit dependency injection from `main.py` to preserve current monkeypatch/test surfaces while removing multiple SQL/read assembly responsibilities from the god module in one larger batch.
- Implemented, with evidence: moved article list SQL/selection payload assembly into `services/api/app/article_list_read_model.py`.
- Implemented, with evidence: moved article residual row loading, diagnostics payload assembly, filter matching and summary grouping into `services/api/app/article_residual_read_model.py`.
- Implemented, with evidence: moved system-selected/content-item list pagination/search/sort read model into `services/api/app/content_item_list_read_model.py`.
- Implemented, with evidence: moved dashboard summary SQL and LLM budget composition into `services/api/app/dashboard_read_model.py`.
- Implemented, with evidence: `services/api/app/main.py` keeps compatibility wrappers for route registration and monkeypatch surfaces, and is reduced to 3893 lines after this extraction; new modules own 729 lines of content/operator read-model logic.
- Scope note: content detail, web resource detail, worker/fetcher behavior, DB schema, route paths, public response fields, admin UI and LLM budget internals remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched API/test modules passed; targeted `tests.unit.python.test_api_zero_shot_operator_surfaces` plus `tests.unit.python.test_api_feed_dedup` passed with 18 tests; `pnpm unit_tests:py` passed with 316 tests; `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed.
- Proof caveat: no compose proof was run for this batch because required static/unit gates passed and the slice was behavior-preserving API read-model extraction with direct unit coverage for the moved surfaces.

### ARCH-HARDENING-FOLLOWUP-BATCH-40-API-WEB-RESOURCE-READ-MODEL

- Kind: Stage
- Status: completed
- In scope: move API web resource list/detail read-model SQL, filters, validation, projection diagnostics and selection payload application out of `services/api/app/main.py` into `services/api/app/web_resource_read_model.py`; include `list_web_resources_page`, route wrapper delegation and `get_web_resource`; preserve route paths, response shapes, HTTP error details and `api_main` monkeypatch surfaces for `query_one`, `query_all`, `query_count`, content-analysis filter helpers, pagination and selection payload application.
- Out of scope: content item/article detail already extracted, website fetcher runtime, web resource writes/projection worker behavior, article residual summaries, DB schema, route paths, public response fields.
- Allowed paths: `.aidp/work.md`, `services/api/app/main.py`, `services/api/app/web_resource_read_model.py`, `tests/unit/python/test_api_web_resources.py`.
- Risk: high, because this is an operator-facing web acquisition read surface with validation, content-analysis filters and selection diagnostics; this slice must be behavior-preserving and keep compatibility wrappers.
- Required proof: targeted Python syntax/import proof; targeted web resource unit tests; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; stronger compose proof only if static/unit gates indicate behavioral uncertainty.
- Acceptance criteria: met.
- Architecture note: affected concern is API web resource acquisition/read-model cohesion; stakeholder/consumer is FastAPI/admin website/resource readers; boundary stays inside API read-model modules with PostgreSQL as read truth; tradeoff is explicit dependency injection from `main.py` to preserve current monkeypatch/test surfaces while removing web resource SQL/filter ownership from the god module.
- Implemented, with evidence: moved API web resource list/detail SQL, validation, filter-building, projection diagnostics and selection payload application into `services/api/app/web_resource_read_model.py`.
- Implemented, with evidence: `services/api/app/main.py` keeps compatibility wrappers that pass main-owned `query_one`, `query_all`, `query_count`, content-analysis filter helpers, pagination, paginated response builder, selection payload application and analysis summary loading.
- Implemented, with evidence: strengthened targeted 404 compatibility coverage for missing web resources while existing web-resource tests continue to cover filters, route validation and projected/unprojected selection diagnostics.
- Implemented, with evidence: `services/api/app/main.py` is reduced to 4312 lines after this extraction; `services/api/app/web_resource_read_model.py` owns 325 lines of web resource read-model logic.
- Scope note: content item/article detail, website fetcher runtime, web resource writes/projection worker behavior, article residual summaries, DB schema, route paths and public response fields remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched API/test modules passed; targeted `tests.unit.python.test_api_web_resources` passed with 6 tests; `pnpm unit_tests:py` passed with 316 tests; `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed.
- Proof caveat: no compose proof was run for this batch because required static/unit gates passed and the slice was behavior-preserving API web-resource read-model extraction with strengthened direct unit coverage.

### ARCH-HARDENING-FOLLOWUP-BATCH-39-API-CONTENT-DETAIL-READ-MODEL

- Kind: Stage
- Status: completed
- In scope: move API content/article detail and explain read-model SQL/assembly out of `services/api/app/main.py` into `services/api/app/content_detail_read_model.py`; include `get_resource_content_item`, `get_content_item`, `get_content_item_explain`, `get_article` and `get_article_explain`; preserve route paths, response shapes, HTTP error details and `api_main` monkeypatch surfaces for `query_one`, `query_all`, `get_article`, `get_content_item`, preview lookup, selection/explain builders and content-analysis summary loading.
- Out of scope: content list/feed read-models, web resource list/get read-models, article residual summaries, enrichment retry writes, DB schema, route paths, public response fields.
- Allowed paths: `.aidp/work.md`, `services/api/app/main.py`, `services/api/app/content_detail_read_model.py`, `tests/unit/python/test_api_zero_shot_operator_surfaces.py`.
- Risk: high, because this is a larger user/operator-facing detail/explain surface with several monkeypatch compatibility tests; this slice must be behavior-preserving and keep compatibility wrappers.
- Required proof: targeted Python syntax/import proof; targeted zero-shot/operator content detail tests; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; stronger compose proof only if static/unit gates indicate behavioral uncertainty.
- Acceptance criteria: met.
- Architecture note: affected concern is API content detail read-model cohesion; stakeholder/consumer is FastAPI/web/admin content detail and explain readers; boundary stays inside API read-model modules with PostgreSQL as read truth; tradeoff is explicit dependency injection from `main.py` to preserve current monkeypatch/test surfaces while removing large detail/explain SQL ownership from the god module.
- Implemented, with evidence: moved API resource content item, content item, content item explain, article detail and article explain SQL/assembly into `services/api/app/content_detail_read_model.py`.
- Implemented, with evidence: `services/api/app/main.py` keeps compatibility wrappers that pass main-owned `query_one`, `query_all`, `get_article`, `get_content_item`, preview lookup, selection/explain builders and content-analysis summary loading.
- Implemented, with evidence: added targeted 404 compatibility coverage for missing article detail while existing zero-shot/operator detail/explain tests continue to cover SQL fields, fallback preview behavior, selection diagnostics and guidance.
- Implemented, with evidence: `services/api/app/main.py` is reduced to 4527 lines after this extraction; `services/api/app/content_detail_read_model.py` owns 527 lines of content detail read-model logic.
- Scope note: content list/feed read-models, web resource list/get read-models, article residual summaries, enrichment retry writes, DB schema, route paths and public response fields remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched API/test modules passed; targeted `tests.unit.python.test_api_zero_shot_operator_surfaces` passed with 14 tests; `pnpm unit_tests:py` passed with 316 tests; `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed.
- Proof caveat: no compose proof was run for this batch because required static/unit gates passed and the slice was behavior-preserving API detail/read-model extraction with strengthened direct unit coverage.

### ARCH-HARDENING-FOLLOWUP-BATCH-38-API-CHANNEL-READ-MODEL

- Kind: Stage
- Status: completed
- In scope: move API channel list/get read-model SQL, pagination, provider filtering and adapter-field projection out of `services/api/app/main.py` into `services/api/app/channel_read_model.py`; add targeted unit coverage for provider filtering/pagination and get not-found compatibility; preserve route paths, response shapes and `api_main` monkeypatch surfaces for `query_all`, `query_count`, `query_one`, pagination helpers and channel adapter field projection.
- Out of scope: channel create/update/import behavior, fetcher runtime, adaptive scheduler writes, DB schema, route paths, public response fields.
- Allowed paths: `.aidp/work.md`, `services/api/app/main.py`, `services/api/app/channel_read_model.py`, `tests/unit/python/test_api_channels.py`.
- Risk: medium-high, because this is operator/admin channel observability and source configuration read behavior; this slice must be behavior-preserving and keep compatibility wrappers.
- Required proof: targeted Python syntax/import proof; targeted channel read-model unit tests; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; stronger compose proof only if static/unit gates indicate behavioral uncertainty.
- Acceptance criteria: met.
- Architecture note: affected concern is API source/channel read-model cohesion; stakeholder/consumer is FastAPI/admin channel readers; boundary stays inside API read-model modules with PostgreSQL as read truth; tradeoff is explicit dependency injection from `main.py` to preserve current monkeypatch/test surfaces while moving channel SQL and projection ownership out of the god module.
- Implemented, with evidence: moved API channel list/get SQL, provider filtering, runtime lateral joins, pagination and adapter-field projection into `services/api/app/channel_read_model.py`.
- Implemented, with evidence: `services/api/app/main.py` keeps compatibility wrappers that pass main-owned `query_all`, `query_count`, `query_one`, pagination helpers, paginated response builder and channel adapter projection.
- Implemented, with evidence: added targeted unit coverage for paginated provider filtering, non-paginated adapter projection, get-channel 404 compatibility and get-channel adapter projection.
- Implemented, with evidence: `services/api/app/main.py` is reduced to 4931 lines after this extraction; `services/api/app/channel_read_model.py` owns 263 lines of channel read-model logic.
- Scope note: channel create/update/import behavior, fetcher runtime, adaptive scheduler writes, DB schema, route paths and public response fields remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched API/test modules passed; targeted `tests.unit.python.test_api_channels` passed with 4 tests; `pnpm unit_tests:py` passed with 315 tests; `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed.
- Proof caveat: no compose proof was run for this batch because required static/unit gates passed and the slice was behavior-preserving API read-model extraction with strengthened direct unit coverage.

### ARCH-HARDENING-FOLLOWUP-BATCH-37-API-USER-MATCH-READ-MODEL

- Kind: Stage
- Status: completed
- In scope: move API user match ranked/dedup read-model SQL, search/sort, pagination and internal projection cleanup out of `services/api/app/main.py` into `services/api/app/user_match_read_model.py`; strengthen targeted unit coverage for stripped internal fields while preserving existing ranked/dedup/search/sort coverage; preserve route path, response shape and `api_main` monkeypatch surfaces for `query_all`, `query_one` via `query_count`, pagination helpers and paginated response builder.
- Out of scope: interest matching worker behavior, user interest writes/compile, notification delivery, DB schema, route paths, public response fields.
- Allowed paths: `.aidp/work.md`, `services/api/app/main.py`, `services/api/app/user_match_read_model.py`, `tests/unit/python/test_api_matches.py`.
- Risk: medium-high, because this is user-facing matched content read behavior with non-trivial SQL composition; this slice must be behavior-preserving and keep compatibility wrappers.
- Required proof: targeted Python syntax/import proof; targeted user match unit tests; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; stronger compose proof only if static/unit gates indicate behavioral uncertainty.
- Acceptance criteria: met.
- Architecture note: affected concern is API user personalization read-model cohesion; stakeholder/consumer is FastAPI/web/admin matched-content readers; boundary stays inside API read-model modules with PostgreSQL as read truth; tradeoff is explicit dependency injection from `main.py` to preserve current monkeypatch/test surfaces while removing ranked match SQL ownership from the god module.
- Implemented, with evidence: moved API user match ranked/dedup SQL, search/sort, pagination and internal projection cleanup into `services/api/app/user_match_read_model.py`.
- Implemented, with evidence: `services/api/app/main.py` keeps a compatibility wrapper that passes main-owned `query_all`, `query_count`, pagination helper and paginated response builder.
- Implemented, with evidence: strengthened targeted unit coverage for internal projection field stripping while preserving existing ranked/dedup/search/sort tests.
- Implemented, with evidence: `services/api/app/main.py` is reduced to 5129 lines after this extraction; `services/api/app/user_match_read_model.py` owns 181 lines of user match read-model logic.
- Scope note: interest matching worker behavior, user interest writes/compile, notification delivery, DB schema, route paths and public response fields remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched API/test modules passed; targeted `tests.unit.python.test_api_matches` passed with 4 tests; `pnpm unit_tests:py` passed with 311 tests; `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed.
- Proof caveat: no compose proof was run for this batch because required static/unit gates passed and the slice was behavior-preserving API read-model extraction with strengthened direct unit coverage.

### ARCH-HARDENING-FOLLOWUP-BATCH-36-API-USER-INTERESTS-READ-MODEL

- Kind: Stage
- Status: completed
- In scope: move API user interest list read-model SQL and pagination out of `services/api/app/main.py` into `services/api/app/user_interest_read_model.py`; add targeted unit coverage for paginated and non-paginated behavior; preserve route path, response shape and `api_main` monkeypatch surfaces for `query_all`, `query_count`, pagination helpers and paginated response builder.
- Out of scope: user interest writes, compile worker behavior, user match ranking, DB schema, route paths, public response fields.
- Allowed paths: `.aidp/work.md`, `services/api/app/main.py`, `services/api/app/user_interest_read_model.py`, `tests/unit/python/test_api_user_interests.py`.
- Risk: medium, because this is user-facing interest configuration read behavior; this slice must be behavior-preserving and keep compatibility wrappers.
- Required proof: targeted Python syntax/import proof; targeted user interest read-model unit tests; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; stronger compose proof only if static/unit gates indicate behavioral uncertainty.
- Acceptance criteria: met.
- Architecture note: affected concern is API user interest read-model cohesion; stakeholder/consumer is FastAPI/web/admin user interest readers; boundary stays inside API read-model modules with PostgreSQL as read truth; tradeoff is explicit dependency injection from `main.py` to preserve current monkeypatch/test surfaces while removing user interest read ownership from the god module.
- Implemented, with evidence: moved API user interest list SQL and pagination behavior into `services/api/app/user_interest_read_model.py`.
- Implemented, with evidence: `services/api/app/main.py` keeps a compatibility wrapper that passes main-owned `query_all`, `query_count`, pagination helper and paginated response builder.
- Implemented, with evidence: added targeted unit coverage for non-paginated user interest list behavior and paginated count/offset behavior.
- Implemented, with evidence: `services/api/app/main.py` is reduced to 5261 lines after this extraction; `services/api/app/user_interest_read_model.py` owns 51 lines of user interest read-model logic.
- Scope note: user interest writes, compile worker behavior, user match ranking, DB schema, route paths and public response fields remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched API/test modules passed; targeted `tests.unit.python.test_api_user_interests` passed with 2 tests; `pnpm unit_tests:py` passed with 310 tests; `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed.
- Proof caveat: no compose proof was run for this batch because required static/unit gates passed and the slice was behavior-preserving API read-model extraction with direct unit coverage.

### ARCH-HARDENING-FOLLOWUP-BATCH-35-API-CLUSTERS-READ-MODEL

- Kind: Stage
- Status: completed
- In scope: move API event cluster list read-model SQL and pagination out of `services/api/app/main.py` into `services/api/app/cluster_read_model.py`; add targeted unit coverage for paginated and non-paginated behavior; preserve route path, response shape and `api_main` monkeypatch surfaces for `query_all`, `query_count`, pagination helpers and paginated response builder.
- Out of scope: worker cluster generation/matching behavior, cluster membership writes, DB schema, route paths, public response fields.
- Allowed paths: `.aidp/work.md`, `services/api/app/main.py`, `services/api/app/cluster_read_model.py`, `tests/unit/python/test_api_clusters.py`.
- Risk: medium, because this is operator/user-facing cluster read behavior; this slice must be behavior-preserving and keep compatibility wrappers.
- Required proof: targeted Python syntax/import proof; targeted cluster read-model unit tests; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; stronger compose proof only if static/unit gates indicate behavioral uncertainty.
- Acceptance criteria: met.
- Architecture note: affected concern is API cluster read-model cohesion; stakeholder/consumer is FastAPI/web/admin cluster readers; boundary stays inside API read-model modules with PostgreSQL as read truth; tradeoff is explicit dependency injection from `main.py` to preserve current monkeypatch/test surfaces while removing cluster read ownership from the god module.
- Implemented, with evidence: moved API event cluster list SQL, member aggregation and pagination behavior into `services/api/app/cluster_read_model.py`.
- Implemented, with evidence: `services/api/app/main.py` keeps a compatibility wrapper that passes main-owned `query_all`, `query_count`, pagination helper and paginated response builder.
- Implemented, with evidence: added targeted unit coverage for non-paginated limit/member projection behavior and paginated count/offset behavior.
- Implemented, with evidence: `services/api/app/main.py` is reduced to 5281 lines after this extraction; `services/api/app/cluster_read_model.py` owns 49 lines of cluster read-model logic.
- Scope note: worker cluster generation/matching behavior, cluster membership writes, DB schema, route paths and public response fields remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched API/test modules passed; targeted `tests.unit.python.test_api_clusters` passed with 2 tests; `pnpm unit_tests:py` passed with 308 tests; `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed.
- Proof caveat: no compose proof was run for this batch because required static/unit gates passed and the slice was behavior-preserving API read-model extraction with direct unit coverage.

### ARCH-HARDENING-FOLLOWUP-BATCH-34-API-SYSTEM-INTERESTS-READ-MODEL

- Kind: Stage
- Status: completed
- In scope: move API system interest list/get read-model SQL, pagination and not-found behavior out of `services/api/app/main.py` into `services/api/app/system_interest_read_model.py`; preserve selection profile policy normalization by injecting the existing normalizer; add targeted unit coverage for non-paginated list and get not-found compatibility; preserve route paths, response shapes and `api_main` monkeypatch surfaces for `query_all`, `query_count`, `query_one`, pagination helpers, paginated response builder and system interest normalization.
- Out of scope: selection policy normalization semantics, interest template writes, selection profile writes, DB schema, route paths, public response fields.
- Allowed paths: `.aidp/work.md`, `services/api/app/main.py`, `services/api/app/system_interest_read_model.py`, `tests/unit/python/test_api_system_interests.py`.
- Risk: medium-high, because system interests feed selection behavior and admin/operator reads; this slice must be behavior-preserving and keep compatibility wrappers.
- Required proof: targeted Python syntax/import proof; targeted system interest unit tests; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; stronger compose proof only if static/unit gates indicate behavioral uncertainty.
- Acceptance criteria: met.
- Architecture note: affected concern is API system interest read-model cohesion; stakeholder/consumer is FastAPI/admin/operator interest template readers and selection observability; boundary stays inside API read-model modules with PostgreSQL as read truth; tradeoff is explicit normalizer injection from `main.py` to preserve current compatibility and selection-profile policy projection behavior.
- Implemented, with evidence: moved API system interest list/get SQL, pagination and not-found read behavior into `services/api/app/system_interest_read_model.py`.
- Implemented, with evidence: `services/api/app/main.py` keeps compatibility wrappers that pass main-owned `query_all`, `query_count`, `query_one`, pagination helpers, paginated response builder and selection-profile normalization.
- Implemented, with evidence: added targeted unit coverage for non-paginated system interest list behavior and not-found HTTP 404 compatibility while existing selection-profile policy projection tests continue to pass.
- Implemented, with evidence: `services/api/app/main.py` is reduced to 5299 lines after this extraction; `services/api/app/system_interest_read_model.py` owns 104 lines of system interest read-model logic.
- Scope note: selection policy normalization semantics, interest template writes, selection profile writes, DB schema, route paths and public response fields remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched API/test modules passed; targeted `tests.unit.python.test_api_system_interests` passed with 8 tests; `pnpm unit_tests:py` passed with 306 tests; `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed.
- Proof caveat: no compose proof was run for this batch because required static/unit gates passed and the slice was behavior-preserving API read-model extraction with direct unit coverage.

### ARCH-HARDENING-FOLLOWUP-BATCH-33-API-NOTIFICATIONS-READ-MODEL

- Kind: Stage
- Status: completed
- In scope: move API user notification list read-model SQL and pagination out of `services/api/app/main.py` into `services/api/app/notification_read_model.py`; add targeted unit coverage for paginated and non-paginated behavior; preserve route path, response shape and `api_main` monkeypatch surfaces for `query_all`, `query_count`, pagination helpers and paginated response builder.
- Out of scope: notification delivery/worker behavior, notification preferences, digest behavior, DB schema, route paths, public response fields.
- Allowed paths: `.aidp/work.md`, `services/api/app/main.py`, `services/api/app/notification_read_model.py`, `tests/unit/python/test_api_notifications.py`.
- Risk: medium, because this is user-facing notification read behavior; this slice must be behavior-preserving and keep compatibility wrappers.
- Required proof: targeted Python syntax/import proof; targeted notification read-model unit tests; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; stronger compose proof only if static/unit gates indicate behavioral uncertainty.
- Acceptance criteria: met.
- Architecture note: affected concern is API notification read-model cohesion; stakeholder/consumer is FastAPI/web/admin user notification readers; boundary stays inside API read-model modules with PostgreSQL as read truth; tradeoff is explicit dependency injection from `main.py` to preserve current monkeypatch/test surfaces while removing notification read ownership from the god module.
- Implemented, with evidence: moved API user notification list SQL and pagination into `services/api/app/notification_read_model.py`.
- Implemented, with evidence: `services/api/app/main.py` keeps a compatibility wrapper that passes main-owned `query_all`, `query_count`, pagination helper and paginated response builder.
- Implemented, with evidence: added targeted unit coverage for non-paginated notification limit/article join behavior and paginated count/offset behavior.
- Implemented, with evidence: `services/api/app/main.py` is reduced to 5381 lines after this extraction; `services/api/app/notification_read_model.py` owns 51 lines of notification read-model logic.
- Scope note: notification delivery/worker behavior, notification preferences, digest behavior, DB schema, route paths and public response fields remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched API/test modules passed; targeted `tests.unit.python.test_api_notifications` passed with 2 tests; `pnpm unit_tests:py` passed with 304 tests; `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed.
- Proof caveat: no compose proof was run for this batch because required static/unit gates passed and the slice was behavior-preserving API read-model extraction with direct unit coverage.

### ARCH-HARDENING-FOLLOWUP-BATCH-32-API-LLM-TEMPLATES-READ-MODEL

- Kind: Stage
- Status: completed
- In scope: move API LLM prompt template list/get read-model SQL, pagination and not-found behavior out of `services/api/app/main.py` into `services/api/app/llm_review_read_model.py`; add targeted unit coverage for paginated list and 404 not-found compatibility; preserve route paths, response shapes and `api_main` monkeypatch surfaces for `query_all`, `query_count`, `query_one`, pagination helpers and paginated response builder.
- Out of scope: worker prompt rendering, LLM review execution, prompt template write behavior, DB schema, route paths, public response fields.
- Allowed paths: `.aidp/work.md`, `services/api/app/main.py`, `services/api/app/llm_review_read_model.py`, `tests/unit/python/test_api_llm_templates.py`.
- Risk: medium, because this is operator-facing template observability/config read behavior; this slice must be behavior-preserving and keep compatibility wrappers.
- Required proof: targeted Python syntax/import proof; targeted LLM template unit tests; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; stronger compose proof only if static/unit gates indicate behavioral uncertainty.
- Acceptance criteria: met.
- Architecture note: affected concern is API LLM template read-model cohesion; stakeholder/consumer is FastAPI/admin/operator prompt template management; boundary stays inside API read-model modules with PostgreSQL as read truth; tradeoff is module-specific not-found error converted back to FastAPI HTTP 404 in `main.py` for compatibility.
- Implemented, with evidence: moved API LLM prompt template list/get SQL, pagination and not-found read behavior into `services/api/app/llm_review_read_model.py`.
- Implemented, with evidence: `services/api/app/main.py` keeps compatibility wrappers that pass main-owned `query_all`, `query_count` and `query_one`, and convert module not-found back into existing HTTP 404 detail.
- Implemented, with evidence: added targeted unit coverage for paginated prompt template list SQL/shape and not-found HTTP 404 compatibility.
- Implemented, with evidence: `services/api/app/main.py` is reduced to 5399 lines after this extraction; `services/api/app/llm_review_read_model.py` owns 195 lines including LLM review and template read-model logic.
- Scope note: worker prompt rendering, LLM review execution, prompt template write behavior, DB schema, route paths and public response fields remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched API/test modules passed; targeted `tests.unit.python.test_api_llm_templates` passed with 2 tests; `pnpm unit_tests:py` passed with 302 tests; `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed.
- Proof caveat: no compose proof was run for this batch because required static/unit gates passed and the slice was behavior-preserving API read-model extraction with direct unit coverage.

### ARCH-HARDENING-FOLLOWUP-BATCH-31-API-REINDEX-JOBS-READ-MODEL

- Kind: Stage
- Status: completed
- In scope: move API reindex job list read-model SQL/pagination/projection logic out of `services/api/app/main.py` into `services/api/app/reindex_read_model.py`; add targeted unit coverage for non-paginated limit behavior and preserve existing paginated projection behavior; preserve route path, response shape and `api_main` monkeypatch surfaces for `query_all`, `query_count`, pagination helpers and selection-profile projection.
- Out of scope: reindex job creation/backfill request already extracted, worker reindex/backfill runtime, DB schema, queue/outbox behavior, route paths, public response fields.
- Allowed paths: `.aidp/work.md`, `services/api/app/main.py`, `services/api/app/reindex_read_model.py`, `tests/unit/python/test_api_reindex_jobs.py`.
- Risk: medium, because this is operator-facing reindex observability; this slice must be behavior-preserving and keep compatibility wrappers.
- Required proof: targeted Python syntax/import proof; targeted reindex jobs unit tests; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; stronger compose proof only if static/unit gates indicate behavioral uncertainty.
- Acceptance criteria: met.
- Architecture note: affected concern is API reindex observability read-model cohesion; stakeholder/consumer is FastAPI/admin/operator reindex monitoring; boundary stays inside API read-model modules with PostgreSQL as read truth; tradeoff is explicit dependency injection from `main.py` to preserve current monkeypatch/test surfaces while removing read-model ownership from the god module.
- Implemented, with evidence: moved API reindex job list SQL, pagination and selection-profile projection orchestration into `services/api/app/reindex_read_model.py`.
- Implemented, with evidence: `services/api/app/main.py` keeps a compatibility wrapper that passes main-owned `query_all`, `query_count`, pagination helpers, paginated response builder and projection function.
- Implemented, with evidence: added targeted unit coverage for non-paginated limit behavior while existing paginated projection coverage continues to pass.
- Implemented, with evidence: `services/api/app/main.py` is reduced to 5419 lines after this extraction; `services/api/app/reindex_read_model.py` owns 101 lines of reindex read-model logic.
- Scope note: reindex job creation/backfill request, worker reindex/backfill runtime, DB schema, queue/outbox behavior, route paths and public response fields remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched API/test modules passed; targeted `tests.unit.python.test_api_reindex_jobs` passed with 2 tests; `pnpm unit_tests:py` passed with 300 tests; `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed.
- Proof caveat: no compose proof was run for this batch because required static/unit gates passed and the slice was behavior-preserving API read-model extraction with direct unit coverage.

### ARCH-HARDENING-FOLLOWUP-BATCH-30-API-CONTENT-ANALYSIS-BACKFILL

- Kind: Stage
- Status: completed
- In scope: move API content-analysis backfill request persistence/outbox logic out of `services/api/app/main.py`; add targeted unit coverage for normalized subject IDs, queued reindex job persistence and outbox payload shape; preserve route path, response shape, event type, aggregate fields, reindex job kind/index name and `api_main` monkeypatch surfaces for `uuid.uuid4`, `psycopg.connect`, database URL resolution, `dict_row`, `dump_json_value` and subject ID normalization.
- Out of scope: worker backfill processing behavior, queue/event contract changes, reindex DB schema, policy write/read logic already extracted, content-analysis read-model behavior, route paths, public response fields.
- Allowed paths: `.aidp/work.md`, `services/api/app/main.py`, `services/api/app/content_analysis_backfill.py`, `tests/unit/python/test_api_discovery_management.py`.
- Risk: medium-high, because this writes durable reindex jobs and emits outbox events; this slice must be behavior-preserving and keep compatibility wrappers.
- Required proof: targeted Python syntax/import proof; targeted unit tests for content-analysis backfill request persistence/outbox behavior; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; stronger compose proof only if static/unit gates indicate behavioral uncertainty.
- Acceptance criteria: met.
- Architecture note: affected concern is API content-analysis backfill request cohesion; stakeholder/consumer is FastAPI/admin/operator content-analysis replay flow; boundary stays inside API modules with PostgreSQL/outbox as durable async handoff; tradeoff is explicit dependency injection from `main.py` to preserve existing route/test patch surfaces while moving reindex/outbox write ownership out of the god module.
- Implemented, with evidence: moved content-analysis backfill request reindex job persistence and outbox event emission into `services/api/app/content_analysis_backfill.py`.
- Implemented, with evidence: `services/api/app/main.py` keeps a compatibility wrapper that passes main-owned `uuid.uuid4`, `psycopg.connect`, `build_database_url`, `dict_row`, `dump_json_value` and subject ID normalization dependencies.
- Implemented, with evidence: added targeted unit coverage for normalized requested/subject UUIDs, queued reindex job options persistence and `reindex.requested` outbox payload shape.
- Implemented, with evidence: `services/api/app/main.py` is reduced to 5433 lines after this extraction; `services/api/app/content_analysis_backfill.py` owns 95 lines of backfill request logic.
- Scope note: worker backfill processing behavior, queue/event contract names, reindex DB schema, policy write/read behavior, content-analysis read-model behavior, route paths and public response fields remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched API/test modules passed; targeted `tests.unit.python.test_api_discovery_management` passed with 40 tests; `pnpm unit_tests:py` passed with 299 tests; `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed.
- Proof caveat: no compose proof was run for this batch because required static/unit gates passed and the slice was behavior-preserving API persistence/outbox extraction with strengthened direct unit coverage.

### ARCH-HARDENING-FOLLOWUP-BATCH-29-API-CONTENT-ANALYSIS-POLICY-WRITES

- Kind: Stage
- Status: completed
- In scope: move API content-analysis policy and content-filter policy create/update write logic out of `services/api/app/main.py`; add targeted unit coverage for create and versioned update behavior; preserve route paths, response shapes, HTTP 500 failure behavior and `api_main` monkeypatch surfaces for `query_one`, policy readbacks, `psycopg.connect` and database URL resolution.
- Out of scope: content-analysis backfill enqueueing, read-model/list/get behavior already extracted, DB schema, worker analysis behavior, queue/event names, route paths, public response fields.
- Allowed paths: `.aidp/work.md`, `services/api/app/main.py`, `services/api/app/content_analysis_policies.py`, `tests/unit/python/test_api_discovery_management.py`.
- Risk: medium-high, because policy versioning changes content-analysis runtime behavior; this slice must be behavior-preserving and keep compatibility wrappers.
- Required proof: targeted Python syntax/import proof; targeted unit tests for content-analysis policy writes; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; stronger compose proof only if static/unit gates indicate behavioral uncertainty.
- Acceptance criteria: met.
- Architecture note: affected concern is API content-analysis policy write cohesion; stakeholder/consumer is FastAPI/admin/operator content-analysis and content-filter policy management; boundary stays inside API modules with PostgreSQL as durable truth; tradeoff is explicit dependency injection from `main.py` to preserve existing route/test patch surfaces while moving persistence/versioning ownership out of the god module.
- Implemented, with evidence: moved content-analysis policy and content-filter policy create/update write/versioning logic into `services/api/app/content_analysis_policies.py`.
- Implemented, with evidence: `services/api/app/main.py` keeps compatibility wrappers that pass main-owned `query_one`, policy readback functions, `build_database_url`, `psycopg.connect` and `dict_row`, then converts module write failures back into existing HTTP 500 route behavior.
- Implemented, with evidence: added targeted unit coverage for content-filter policy JSON persistence/readback and versioned content-analysis policy update runtime changes.
- Implemented, with evidence: `services/api/app/main.py` is reduced to 5505 lines after this extraction; `services/api/app/content_analysis_policies.py` owns 377 lines of policy write logic.
- Scope note: content-analysis backfill enqueueing, read-model/list/get behavior, DB schema, worker analysis behavior, queue/event names, route paths and public response fields remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched API/test modules passed; targeted `tests.unit.python.test_api_discovery_management` passed with 39 tests; `pnpm unit_tests:py` passed with 298 tests; `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed.
- Proof caveat: no compose proof was run for this batch because required static/unit gates passed and the slice was behavior-preserving API policy write extraction with strengthened direct unit coverage.

### ARCH-HARDENING-FOLLOWUP-BATCH-28-API-DISCOVERY-RE-EVALUATION

- Kind: Stage
- Status: completed
- In scope: move API discovery re-evaluation request handoff out of `services/api/app/main.py`; add targeted unit coverage for mission_id forwarding and repository injection; preserve route path, response shape, error behavior and `api_main` monkeypatch surfaces for `DiscoveryCoordinatorRepository` and `re_evaluate_sources`.
- Out of scope: re-evaluation algorithm/orchestrator internals, feedback/candidate/mission management already extracted, route paths, public response fields, DB schema, queue/event names.
- Allowed paths: `.aidp/work.md`, `services/api/app/main.py`, `services/api/app/discovery_re_evaluation.py`, `tests/unit/python/test_api_discovery_management.py`.
- Risk: medium, because the route triggers discovery re-evaluation runtime but the slice is a behavior-preserving handoff extraction.
- Required proof: targeted Python syntax/import proof; targeted discovery management unit tests including new re-evaluation test; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; stronger compose proof only if static/unit gates indicate behavioral uncertainty.
- Acceptance criteria: met.
- Architecture note: affected concern is API discovery runtime handoff cohesion; stakeholder/consumer is FastAPI/admin/operator re-evaluation flow; boundary stays inside API modules with orchestration delegated to worker discovery runtime through explicit dependency injection; tradeoff is preserving `main.py` patch surfaces while removing direct route-owned orchestration.
- Implemented, with evidence: moved discovery re-evaluation request handoff into `services/api/app/discovery_re_evaluation.py`.
- Implemented, with evidence: `services/api/app/main.py` keeps route-level compatibility wrapper that passes main-owned `DiscoveryCoordinatorRepository` and `re_evaluate_sources` dependencies.
- Implemented, with evidence: added targeted unit test for mission_id forwarding and repository injection into the orchestrator handoff.
- Implemented, with evidence: `services/api/app/main.py` is at 5781 lines after this extraction; `services/api/app/discovery_re_evaluation.py` owns 16 lines of handoff logic.
- Scope note: re-evaluation algorithm/orchestrator internals, feedback/candidate/mission management, route paths, response fields, DB schema and queue/event names remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched API/test modules passed; targeted `tests.unit.python.test_api_discovery_management` passed with 37 tests; `pnpm unit_tests:py` passed with 296 tests; `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed.
- Proof caveat: no compose proof was run for this batch because required static/unit gates passed and the slice was a behavior-preserving API runtime handoff extraction with direct unit coverage.

### ARCH-HARDENING-FOLLOWUP-BATCH-26-API-DISCOVERY-CANDIDATES

- Kind: Stage
- Status: completed
- In scope: move API discovery candidate update, recall candidate create/update/promote and canonical-domain helper logic out of `services/api/app/main.py`; preserve route names, response shapes, SQL behavior, source registrar semantics, source-profile linking and `api_main` monkeypatch surfaces for candidate/recall candidate/source profile lookups, `PostgresSourceRegistrarAdapter`, `psycopg.connect`, canonical domain resolution and database URL resolution.
- Out of scope: mission/recall mission management already extracted, feedback creation, source profile create/update management, route paths, public response fields, DB schema, queue/event names, registrar internals.
- Allowed paths: `.aidp/work.md`, `services/api/app/main.py`, `services/api/app/discovery_candidates.py`, `tests/unit/python/test_api_discovery_management.py`.
- Risk: medium-high, because candidate promotion can register source channels and link source profiles; this slice must be behavior-preserving and keep compatibility wrappers.
- Required proof: targeted Python syntax/import proof; targeted discovery management unit tests; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; stronger compose proof only if static/unit gates indicate behavioral uncertainty.
- Acceptance criteria: met.
- Architecture note: affected concern is API discovery candidate management cohesion; stakeholder/consumer is FastAPI/admin/operator candidate review and promotion flows; boundary stays inside API modules with PostgreSQL as durable truth and source registration via existing registrar adapter; tradeoff is explicit dependency injection from `main.py` to preserve current monkeypatch/test surfaces while moving ownership out of the god module.
- Implemented, with evidence: moved discovery candidate update, recall candidate create/update/promote and canonical-domain validation logic into `services/api/app/discovery_candidates.py`.
- Implemented, with evidence: `services/api/app/main.py` keeps compatibility wrappers that pass main-owned candidate/recall candidate/source profile lookups, canonical domain resolver, source registrar adapter, database URL and `psycopg.connect` dependencies.
- Implemented, with evidence: added targeted guard test proving rejected recall candidates are not promoted through registrar unless rejected as `already_registered`.
- Implemented, with evidence: `services/api/app/main.py` is reduced to 5798 lines after this extraction; `services/api/app/discovery_candidates.py` owns 397 lines of candidate management logic.
- Scope note: mission/recall mission management, feedback creation, source profile create/update management, route paths, response fields, DB schema, queue/event names and registrar internals remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched API/test modules passed; targeted `tests.unit.python.test_api_discovery_management` passed with 35 tests; `pnpm unit_tests:py` passed with 294 tests; `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed.
- Proof caveat: no compose proof was run for this batch because required static/unit gates passed and the slice was behavior-preserving API candidate extraction with strengthened direct unit coverage.

### ARCH-HARDENING-FOLLOWUP-BATCH-27-API-DISCOVERY-FEEDBACK

- Kind: Stage
- Status: completed
- In scope: move API discovery feedback create logic out of `services/api/app/main.py`; add targeted unit coverage for trimmed optional IDs and created row readback; preserve route names, response shapes, SQL behavior and `api_main` monkeypatch surfaces for `query_one`, `psycopg.connect`, feedback select SQL and database URL resolution.
- Out of scope: feedback list/read-model already extracted, candidate/mission management already extracted, re-evaluation runtime, route paths, public response fields, DB schema, queue/event names.
- Allowed paths: `.aidp/work.md`, `services/api/app/main.py`, `services/api/app/discovery_feedback.py`, `tests/unit/python/test_api_discovery_management.py`.
- Risk: medium, because feedback events affect discovery learning/observability but this slice is a small behavior-preserving persistence extraction.
- Required proof: targeted Python syntax/import proof; targeted discovery management unit tests including new feedback test; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; stronger compose proof only if static/unit gates indicate behavioral uncertainty.
- Acceptance criteria: met.
- Architecture note: affected concern is API discovery feedback write cohesion; stakeholder/consumer is FastAPI/admin/operator feedback creation flow; boundary stays inside API modules with PostgreSQL as durable truth; tradeoff is explicit dependency injection from `main.py` to preserve current monkeypatch/test surfaces while moving ownership out of the god module.
- Implemented, with evidence: moved discovery feedback creation logic into `services/api/app/discovery_feedback.py`.
- Implemented, with evidence: `services/api/app/main.py` keeps compatibility wrapper that passes main-owned feedback select SQL, `query_one`, database URL and `psycopg.connect` dependencies.
- Implemented, with evidence: added targeted unit test for optional ID trimming and created feedback row readback.
- Implemented, with evidence: `services/api/app/main.py` is reduced to 5780 lines after this extraction; `services/api/app/discovery_feedback.py` owns 54 lines of feedback write logic.
- Scope note: feedback list/read-model, candidate/mission management, re-evaluation runtime, route paths, response fields, DB schema and queue/event names remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched API/test modules passed; targeted `tests.unit.python.test_api_discovery_management` passed with 36 tests; `pnpm unit_tests:py` passed with 295 tests; `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed.
- Proof caveat: no compose proof was run for this batch because required static/unit gates passed and the slice was small behavior-preserving API feedback extraction with strengthened direct unit coverage.

### ARCH-HARDENING-FOLLOWUP-BATCH-24-API-DISCOVERY-RECALL-MISSIONS

- Kind: Stage
- Status: completed
- In scope: move API discovery recall mission create, update and acquisition request logic out of `services/api/app/main.py`; add targeted unit tests for recall mission create/update behavior where existing coverage is indirect; preserve route names, response shapes, SQL behavior and `api_main` monkeypatch surfaces for `get_discovery_recall_mission`, `require_attachable_discovery_policy_profile`, `snapshot_discovery_recall_mission_profile_policy`, `load_discovery_settings`, `DiscoveryCoordinatorRepository`, `acquire_recall_missions`, `psycopg.connect` and database URL resolution.
- Out of scope: graph discovery mission management, candidate/recall candidate promotion, feedback creation, route paths, public response fields, DB schema, queue/event names, orchestrator/runtime behavior.
- Allowed paths: `.aidp/work.md`, `services/api/app/main.py`, `services/api/app/discovery_recall_missions.py`, `tests/unit/python/test_api_discovery_management.py`.
- Risk: medium-high, because recall mission management controls independent recall setup and live acquisition handoff; this slice must be behavior-preserving and keep compatibility wrappers.
- Required proof: targeted Python syntax/import proof; targeted discovery management unit tests including new recall mission tests; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; stronger compose proof only if static/unit gates indicate behavioral uncertainty.
- Acceptance criteria: met.
- Architecture note: affected concern is API discovery recall mission cohesion; stakeholder/consumer is FastAPI/admin/operator recall mission management and acquisition request flows; boundary stays inside API modules with PostgreSQL as durable truth and discovery orchestrator invoked through explicit dependency injection; tradeoff is temporary `main.py` compatibility wrappers to preserve test/caller monkeypatch surfaces while moving ownership out of the god module.
- Implemented, with evidence: moved discovery recall mission create, update and acquisition request logic into `services/api/app/discovery_recall_missions.py`.
- Implemented, with evidence: `services/api/app/main.py` keeps compatibility wrappers that pass main-owned profile attachment, recall mission lookup, policy snapshot, discovery settings, orchestrator repository, acquire function, database URL and `psycopg.connect` dependencies.
- Implemented, with evidence: added targeted unit tests for recall mission create profile trimming/attachment and update-time applied policy snapshot reset when profile changes.
- Implemented, with evidence: `services/api/app/main.py` is reduced to 6178 lines after this extraction; `services/api/app/discovery_recall_missions.py` owns 174 lines of recall mission management logic.
- Scope note: graph discovery mission management, candidate/recall candidate promotion, feedback creation, route paths, response fields, DB schema, queue/event names and orchestrator/runtime behavior remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched API/test modules passed; targeted `tests.unit.python.test_api_discovery_management` passed with 32 tests; `pnpm unit_tests:py` passed with 291 tests; `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed.
- Proof caveat: no compose proof was run for this batch because required static/unit gates passed and the slice was behavior-preserving API recall mission extraction with strengthened direct unit coverage.

### ARCH-HARDENING-FOLLOWUP-BATCH-25-API-DISCOVERY-MISSIONS

- Kind: Stage
- Status: completed
- In scope: move API graph discovery mission create, update, delete, compile and run request logic out of `services/api/app/main.py`; preserve route names, response shapes, SQL behavior, quota checks, sequence trigger semantics and `api_main` monkeypatch surfaces for `get_discovery_mission`, `require_attachable_discovery_policy_profile`, `snapshot_discovery_mission_profile_policy`, `get_discovery_monthly_quota_snapshot`, `create_sequence_run_request_for_trigger`, `load_discovery_settings`, `DiscoveryCoordinatorRepository`, `compile_interest_graph_for_mission`, `psycopg.connect` and database URL resolution.
- Out of scope: recall mission management already extracted, candidate/recall candidate promotion, feedback creation, route paths, public response fields, DB schema, queue/event names, orchestrator runtime internals.
- Allowed paths: `.aidp/work.md`, `services/api/app/main.py`, `services/api/app/discovery_missions.py`, `tests/unit/python/test_api_discovery_management.py`.
- Risk: medium-high, because graph discovery mission management controls mission persistence, compile handoff, quota guardrails and sequence run dispatch; this slice must be behavior-preserving and keep compatibility wrappers.
- Required proof: targeted Python syntax/import proof; targeted discovery management unit tests; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; stronger compose proof only if static/unit gates indicate behavioral uncertainty.
- Acceptance criteria: met.
- Architecture note: affected concern is API discovery mission management cohesion; stakeholder/consumer is FastAPI/admin/operator graph discovery mission flows; boundary stays inside API modules with PostgreSQL as durable truth and orchestrator/sequence handoffs injected explicitly; tradeoff is temporary `main.py` compatibility wrappers to preserve current tests and route call sites while moving ownership out of the god module.
- Implemented, with evidence: moved discovery mission create, update, delete, compile and run request logic into `services/api/app/discovery_missions.py`.
- Implemented, with evidence: `services/api/app/main.py` keeps compatibility wrappers that pass main-owned mission lookup, profile attachment, policy snapshot, quota snapshot, sequence trigger, discovery settings, orchestrator repository, interest-graph compiler, database URL and `psycopg.connect` dependencies.
- Implemented, with evidence: added targeted unit tests for graph mission profile update applied policy reset and compile-time snapshot-before-compiler handoff.
- Implemented, with evidence: `services/api/app/main.py` is reduced to 6028 lines after this extraction; `services/api/app/discovery_missions.py` owns 325 lines of graph discovery mission management logic.
- Scope note: recall mission management, candidate/recall candidate promotion, feedback creation, route paths, response fields, DB schema, queue/event names and orchestrator internals remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched API/test modules passed; targeted `tests.unit.python.test_api_discovery_management` passed with 34 tests; `pnpm unit_tests:py` passed with 293 tests; `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed.
- Proof caveat: no compose proof was run for this batch because required static/unit gates passed and the slice was behavior-preserving API mission management extraction with strengthened direct unit coverage.

### ARCH-HARDENING-FOLLOWUP-BATCH-16-API-OBSERVABILITY-READ-MODEL

- Kind: Stage
- Status: completed
- In scope: move API fetch run listing and outbox event listing read-model logic out of `services/api/app/main.py`; preserve route names, response shapes, pagination semantics and `api_main` monkeypatch surfaces for `query_all`/`query_count`.
- Out of scope: relay/outbox semantics, fetcher behavior, channel fetch persistence, route paths, public response fields, DB schema, queue/event names.
- Allowed paths: `.aidp/work.md`, `services/api/app/main.py`, `services/api/app/observability_read_model.py`, targeted tests only if compatibility imports require them.
- Risk: medium, because these are operator-facing observability reads; this slice must be behavior-preserving.
- Required proof: targeted Python syntax/import proof; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; stronger compose proof only if static/unit gates indicate behavioral uncertainty.
- Acceptance criteria: met.
- Implemented, with evidence: moved API fetch run listing and outbox event listing read-model logic into `services/api/app/observability_read_model.py`.
- Implemented, with evidence: `services/api/app/main.py` keeps compatibility wrappers that pass main-owned `query_all` and `query_count` dependencies, preserving existing monkeypatch surfaces and response shapes.
- Implemented, with evidence: `services/api/app/main.py` is reduced to 7333 lines after this extraction.
- Scope note: relay/outbox semantics, fetcher behavior, channel fetch persistence, route paths, response fields, DB schema and queue/event names remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched API modules passed; `pnpm unit_tests:py`, `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed.
- Proof caveat: no compose proof was run for this batch because required static/unit gates passed and the slice was behavior-preserving read-model extraction only.

### ARCH-HARDENING-FOLLOWUP-BATCH-19-API-DISCOVERY-GET-READ-MODEL

- Kind: Stage
- Status: completed
- In scope: move API discovery get-by-id/source-profile lookup/portfolio snapshot read helpers out of `services/api/app/main.py`; preserve route names, response shapes, not-found messages and `api_main` monkeypatch surfaces for `query_one` and public `get_discovery_*` compatibility functions.
- Out of scope: discovery paginated list reads, create/update/delete/promote flows, quota/cost/monthly/summary behavior, orchestrator/runtime behavior, route paths, public response fields, DB schema, queue/event names.
- Allowed paths: `.aidp/work.md`, `services/api/app/main.py`, `services/api/app/discovery_read_model.py`, targeted tests only if compatibility imports require them.
- Risk: medium-high, because discovery write/update flows call some get helpers and tests may monkeypatch `api_main` functions; this slice must be behavior-preserving.
- Required proof: targeted Python syntax/import proof; targeted discovery management unit tests; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; stronger compose proof only if static/unit gates indicate behavioral uncertainty.
- Acceptance criteria: met.
- Architecture note: affected concern is API discovery read-model cohesion; stakeholder/consumer is FastAPI routes/tests/admin/control-plane readers; boundary stays inside API modules with PostgreSQL as read truth; tradeoff is temporary `main.py` compatibility wrappers until callers/tests are migrated.
- Implemented, with evidence: moved API discovery get-by-id/read helpers for missions, recall missions, policy profiles, classes, candidates, recall candidates, hypotheses, source profiles, quality snapshots, interest scores and portfolio snapshots into `services/api/app/discovery_read_model.py`.
- Implemented, with evidence: `services/api/app/main.py` keeps compatibility wrappers that pass main-owned `query_one`, convert `DiscoveryReadModelNotFound` back into `SequenceNotFoundError`, and preserve public SQL-builder compatibility exports expected by tests.
- Implemented, with evidence: `services/api/app/main.py` is reduced to 6615 lines after this extraction; `services/api/app/discovery_read_model.py` now owns 649 lines of discovery read-model logic.
- Scope note: discovery paginated list reads, create/update/delete/promote flows, quota/cost/monthly/summary behavior, orchestrator/runtime behavior, route paths, response fields, DB schema and queue/event names remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched API modules passed; targeted `tests.unit.python.test_api_discovery_management` passed; `pnpm unit_tests:py`, `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed.
- Proof caveat: no compose proof was run for this batch because required static/unit gates passed and the slice was behavior-preserving read-model extraction only.

### ARCH-HARDENING-FOLLOWUP-BATCH-20-API-DISCOVERY-SUMMARY-READ-MODEL

- Kind: Stage
- Status: completed
- In scope: move API discovery monthly quota, summary and cost summary read-model logic out of `services/api/app/main.py`; preserve route names, response shapes, env/config semantics and `api_main` monkeypatch surfaces for `query_one`, `query_all`, `load_discovery_settings` and `get_discovery_monthly_quota_snapshot`.
- Out of scope: discovery list/get reads already extracted, create/update/delete/promote flows, mission run quota enforcement, orchestrator/runtime behavior, env defaults, route paths, public response fields, DB schema, queue/event names.
- Allowed paths: `.aidp/work.md`, `services/api/app/main.py`, `services/api/app/discovery_read_model.py`, targeted tests only if compatibility imports require them.
- Risk: medium-high, because quota and cost summaries are operator guardrails and tests patch `api_main` dependencies; this slice must be behavior-preserving.
- Required proof: targeted Python syntax/import proof; targeted discovery management unit tests; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; stronger compose proof only if static/unit gates indicate behavioral uncertainty.
- Acceptance criteria: met.
- Architecture note: affected concern is API discovery observability/read-model cohesion; stakeholder/consumer is FastAPI/admin/operator readers; boundary stays inside API read-model modules with PostgreSQL/config as inputs; tradeoff is explicit dependency injection to preserve existing `api_main` monkeypatch compatibility.
- Implemented, with evidence: moved discovery monthly quota, summary and cost summary read-model logic into `services/api/app/discovery_read_model.py`.
- Implemented, with evidence: `services/api/app/main.py` keeps compatibility wrappers that pass main-owned `query_one`, `query_all`, `load_discovery_settings`, cost helpers and `get_discovery_monthly_quota_snapshot`, preserving existing monkeypatch surfaces and response shapes.
- Implemented, with evidence: `services/api/app/main.py` is reduced to 6435 lines after this extraction; `services/api/app/discovery_read_model.py` now owns 904 lines of discovery read-model logic.
- Scope note: discovery write/update/delete/promote flows, mission run quota enforcement, orchestrator/runtime behavior, env defaults, route paths, response fields, DB schema and queue/event names remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched API modules passed; targeted `tests.unit.python.test_api_discovery_management` passed; `pnpm unit_tests:py`, `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed.
- Proof caveat: no compose proof was run for this batch because required static/unit gates passed and the slice was behavior-preserving read-model extraction only.

### ARCH-HARDENING-FOLLOWUP-BATCH-21-API-DISCOVERY-POLICY-PROFILES

- Kind: Stage
- Status: completed
- In scope: move API discovery policy profile attachability, create, update and delete management logic out of `services/api/app/main.py`; preserve route names, response shapes, SQL behavior and `api_main` monkeypatch surfaces for `get_discovery_policy_profile`, payload normalization helpers, `psycopg.connect` and database URL resolution.
- Out of scope: discovery mission/recall mission management, class management, candidate/recall candidate promotion, feedback creation, route paths, public response fields, DB schema, queue/event names, orchestrator/runtime behavior.
- Allowed paths: `.aidp/work.md`, `services/api/app/main.py`, `services/api/app/discovery_policy_profiles.py`, targeted tests only if compatibility imports require them.
- Risk: medium-high, because policy profiles are attached to mission and recall mission creation; this slice must be behavior-preserving and keep compatibility wrappers.
- Required proof: targeted Python syntax/import proof; targeted discovery management unit tests; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; stronger compose proof only if static/unit gates indicate behavioral uncertainty.
- Acceptance criteria: met.
- Architecture note: affected concern is API discovery management cohesion; stakeholder/consumer is FastAPI/admin/operator write flows; boundary stays inside API modules with PostgreSQL as durable truth; tradeoff is explicit dependency injection from `main.py` to preserve current test/caller monkeypatch surfaces while moving ownership out of the god module.
- Implemented, with evidence: moved discovery policy profile attachability, create, update and delete management logic into `services/api/app/discovery_policy_profiles.py`.
- Implemented, with evidence: `services/api/app/main.py` keeps compatibility wrappers that pass main-owned `get_discovery_policy_profile`, payload normalization helpers, `build_database_url`, `psycopg.connect` and `dict_row`, then convert module-specific errors back into existing `SequenceValidationError`, `SequenceNotFoundError` and `SequenceConflictError`.
- Implemented, with evidence: `services/api/app/main.py` is reduced to 6377 lines after this extraction; `services/api/app/discovery_policy_profiles.py` owns 201 lines of policy-profile management logic.
- Scope note: mission/recall mission management, class management, candidate/recall candidate promotion, feedback creation, route paths, response fields, DB schema and queue/event names remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched API modules passed; targeted `tests.unit.python.test_api_discovery_management` passed; `pnpm unit_tests:py`, `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed.
- Proof caveat: no compose proof was run for this batch because required static/unit gates passed and the slice was behavior-preserving API management extraction only.

### ARCH-HARDENING-FOLLOWUP-BATCH-22-API-DISCOVERY-CLASSES

- Kind: Stage
- Status: completed
- In scope: move API discovery hypothesis class create, update and delete management logic out of `services/api/app/main.py`; preserve route names, response shapes, SQL behavior and `api_main` monkeypatch surfaces for `get_discovery_class`, `psycopg.connect` and database URL resolution.
- Out of scope: policy profile management already extracted, mission/recall mission management, candidate/recall candidate promotion, feedback creation, route paths, public response fields, DB schema, queue/event names, orchestrator/runtime behavior.
- Allowed paths: `.aidp/work.md`, `services/api/app/main.py`, `services/api/app/discovery_classes.py`, targeted tests only if compatibility imports require them.
- Risk: medium, because hypothesis classes are operator-managed discovery configuration and can block deletion when hypotheses exist; this slice must be behavior-preserving and keep compatibility wrappers.
- Required proof: targeted Python syntax/import proof; targeted discovery management unit tests; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; stronger compose proof only if static/unit gates indicate behavioral uncertainty.
- Acceptance criteria: met.
- Architecture note: affected concern is API discovery management cohesion; stakeholder/consumer is FastAPI/admin/operator write flows; boundary stays inside API modules with PostgreSQL as durable truth; tradeoff is explicit dependency injection from `main.py` to preserve current test/caller monkeypatch surfaces while moving ownership out of the god module.
- Implemented, with evidence: moved discovery hypothesis class create, update and delete management logic into `services/api/app/discovery_classes.py`.
- Implemented, with evidence: `services/api/app/main.py` keeps compatibility wrappers that pass main-owned `get_discovery_class`, `build_database_url`, `psycopg.connect` and `dict_row`, then convert module-specific errors back into existing `SequenceValidationError`, `SequenceNotFoundError` and `SequenceConflictError`.
- Implemented, with evidence: `services/api/app/main.py` is reduced to 6316 lines after this extraction; `services/api/app/discovery_classes.py` owns 166 lines of discovery class management logic.
- Scope note: policy profile management, mission/recall mission management, candidate/recall candidate promotion, feedback creation, route paths, response fields, DB schema and queue/event names remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched API modules passed; targeted `tests.unit.python.test_api_discovery_management` passed; `pnpm unit_tests:py`, `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed.
- Proof caveat: no compose proof was run for this batch because required static/unit gates passed and the slice was behavior-preserving API management extraction only.

### ARCH-HARDENING-FOLLOWUP-BATCH-23-API-DISCOVERY-POLICY-SNAPSHOTS

- Kind: Stage
- Status: completed
- In scope: move API discovery applied policy snapshot builders and mission/recall snapshot persistence helpers out of `services/api/app/main.py`; add targeted unit tests where existing coverage only checks indirect invocation; preserve route names, response shapes, SQL behavior and `api_main` monkeypatch surfaces for mission/profile lookups, payload normalization helpers, `psycopg.connect` and database URL resolution.
- Out of scope: mission/recall mission create/update/delete flows, candidate/recall candidate promotion, feedback creation, route paths, public response fields, DB schema, queue/event names, orchestrator/runtime behavior.
- Allowed paths: `.aidp/work.md`, `services/api/app/main.py`, `services/api/app/discovery_policy_snapshots.py`, `tests/unit/python/test_api_discovery_management.py`.
- Risk: medium-high, because applied policy snapshots feed discovery mission and recall runtime behavior; this slice must be behavior-preserving and strengthen direct coverage.
- Required proof: targeted Python syntax/import proof; targeted discovery management unit tests including new snapshot tests; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; stronger compose proof only if static/unit gates indicate behavioral uncertainty.
- Acceptance criteria: met.
- Architecture note: affected concern is API discovery policy snapshot cohesion and testability; stakeholder/consumer is mission/recall mission write/runtime flows; boundary stays inside API modules with PostgreSQL as durable truth; tradeoff is explicit dependency injection from `main.py` to preserve current test/caller monkeypatch surfaces while moving ownership out of the god module.
- Implemented, with evidence: moved applied discovery policy snapshot builders and mission/recall snapshot persistence helpers into `services/api/app/discovery_policy_snapshots.py`.
- Implemented, with evidence: `services/api/app/main.py` keeps compatibility wrappers that pass main-owned mission/profile lookups, payload normalization helpers, `build_database_url`, `psycopg.connect` and `dict_row`.
- Implemented, with evidence: added targeted unit tests for graph policy snapshot shape, mission applied policy persistence and recall applied policy clearing when no profile is attached.
- Implemented, with evidence: `services/api/app/main.py` is reduced to 6240 lines after this extraction; `services/api/app/discovery_policy_snapshots.py` owns 170 lines of policy snapshot logic.
- Scope note: mission/recall mission create/update/delete flows, candidate/recall candidate promotion, feedback creation, route paths, response fields, DB schema and queue/event names remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched API/test modules passed; targeted `tests.unit.python.test_api_discovery_management` passed with 30 tests; `pnpm unit_tests:py` passed with 289 tests; `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed.
- Proof caveat: no compose proof was run for this batch because required static/unit gates passed and the slice was behavior-preserving API snapshot extraction with strengthened direct unit coverage.

### ARCH-HARDENING-FOLLOWUP-BATCH-17-API-CONTENT-ANALYSIS-READ-MODEL

- Kind: Stage
- Status: completed
- In scope: move API content-analysis normalization helpers, summary/filter read helpers, read/list endpoints for analysis results/entities/labels/policies/filter results out of `services/api/app/main.py`; preserve route names, response shapes, pagination semantics and `api_main` monkeypatch surfaces for `query_one`/`query_all`/`query_count`.
- Out of scope: content-analysis backfill enqueue semantics, policy create/update/versioning writes, filter policy create/update writes, worker analysis behavior, route paths, public response fields, DB schema, queue/event names.
- Allowed paths: `.aidp/work.md`, `services/api/app/main.py`, `services/api/app/content_analysis_read_model.py`, targeted tests only if compatibility imports require them.
- Risk: medium-high, because these helpers shape operator content-analysis reads and analysis summaries embedded into article/resource responses; this slice must be behavior-preserving.
- Required proof: targeted Python syntax/import proof; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; stronger compose proof only if static/unit gates indicate behavioral uncertainty.
- Acceptance criteria: met.
- Implemented, with evidence: moved API content-analysis normalization helpers, analysis summary/filter helper logic and read/list endpoints for analysis results, entities, labels, analysis policies, filter policies and filter results into `services/api/app/content_analysis_read_model.py`.
- Implemented, with evidence: `services/api/app/main.py` keeps compatibility wrappers that pass main-owned `query_one`, `query_all` and `query_count` dependencies, preserving existing monkeypatch surfaces and response shapes.
- Implemented, with evidence: `services/api/app/main.py` is reduced to 6812 lines after this extraction.
- Scope note: content-analysis backfill enqueue semantics, policy create/update/versioning writes, filter policy create/update writes, worker analysis behavior, route paths, response fields, DB schema and queue/event names remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched API modules passed; `pnpm unit_tests:py`, `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed.
- Proof caveat: no compose proof was run for this batch because required static/unit gates passed and the slice was behavior-preserving read-model extraction only.

### ARCH-HARDENING-FOLLOWUP-BATCH-18-API-DISCOVERY-LIST-READ-MODEL

- Kind: Stage
- Status: completed
- In scope: move API discovery paginated/list read-model functions out of `services/api/app/main.py`; preserve route names, response shapes, pagination semantics and `api_main` monkeypatch surfaces for `query_all`/`query_count`.
- Out of scope: discovery create/update/delete/promote flows, get-by-id not-found semantics, quota/cost/summary behavior, orchestrator/runtime behavior, route paths, public response fields, DB schema, queue/event names.
- Allowed paths: `.aidp/work.md`, `services/api/app/main.py`, `services/api/app/discovery_read_model.py`, targeted tests only if compatibility imports require them.
- Risk: medium, because these are operator-facing discovery list reads; this slice must be behavior-preserving.
- Required proof: targeted Python syntax/import proof; targeted discovery management unit tests; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; stronger compose proof only if static/unit gates indicate behavioral uncertainty.
- Acceptance criteria: met.
- Implemented, with evidence: moved API discovery paginated/list read-model functions for missions, recall missions, policy profiles, classes, candidates, recall candidates, hypotheses, source profiles, quality snapshots, interest scores and feedback into `services/api/app/discovery_read_model.py`.
- Implemented, with evidence: `services/api/app/main.py` keeps compatibility wrappers that pass main-owned `query_all` and `query_count` dependencies, preserving existing monkeypatch surfaces and response shapes.
- Implemented, with evidence: `services/api/app/main.py` is reduced to 6621 lines after this extraction.
- Scope note: discovery create/update/delete/promote flows, get-by-id not-found semantics, quota/cost/summary behavior, orchestrator/runtime behavior, route paths, response fields, DB schema and queue/event names remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched API modules passed; targeted `tests.unit.python.test_api_discovery_management` passed; `pnpm unit_tests:py`, `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed.
- Proof caveat: no compose proof was run for this batch because required static/unit gates passed and the slice was behavior-preserving read-model extraction only.

### ARCH-HARDENING-FOLLOWUP-BATCH-15-API-LLM-REVIEW-READ-MODEL

- Kind: Stage
- Status: completed
- In scope: move API LLM review list, usage summary and monthly budget summary read-model logic out of `services/api/app/main.py`; preserve `api_main` compatibility functions, route names, response shapes and monkeypatch surfaces for `query_one`/`query_all`.
- Out of scope: LLM review worker semantics, monthly budget policy semantics, env/config defaults, route paths, public response fields, DB schema, queue/event names.
- Allowed paths: `.aidp/work.md`, `services/api/app/main.py`, `services/api/app/llm_review_read_model.py`, targeted tests only if compatibility imports require them.
- Risk: medium, because the monthly budget summary is an operator-facing guardrail; this slice must be behavior-preserving.
- Required proof: targeted Python syntax/import proof; targeted unit test for LLM budget compatibility; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; stronger compose proof only if static/unit gates indicate behavioral uncertainty.
- Acceptance criteria: met.
- Implemented, with evidence: moved API LLM review list, usage summary and monthly budget summary read-model logic into `services/api/app/llm_review_read_model.py`.
- Implemented, with evidence: `services/api/app/main.py` keeps compatibility wrappers that pass main-owned `query_one`, `query_all` and `query_count` dependencies, preserving existing monkeypatch surfaces and response shapes.
- Implemented, with evidence: `services/api/app/main.py` is reduced to 7366 lines after this extraction.
- Scope note: LLM review worker semantics, monthly budget policy semantics, env/config defaults, route paths, response fields, DB schema and queue/event names remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched API modules passed; targeted `test_llm_budget_summary_uses_precise_usd_comparison` passed; `pnpm unit_tests:py`, `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed.
- Proof caveat: no compose proof was run for this batch because required static/unit gates passed and the slice was behavior-preserving read-model extraction only.

### ARCH-HARDENING-FOLLOWUP-BATCH-14-API-CONTENT-SELECTION-READ-MODEL

- Kind: Stage
- Status: completed
- In scope: move API content item ID helpers, article/system selection SQL clauses, selection explain/diagnostics/guidance builders and article/resource selection payload applicators out of `services/api/app/main.py`; preserve `api_main` compatibility imports and all response shapes.
- Out of scope: FastAPI route paths, public response fields, SQL semantics, sequence/discovery/content-analysis API logic, DB schema, worker/fetcher behavior.
- Allowed paths: `.aidp/work.md`, `services/api/app/main.py`, `services/api/app/content_selection_read_model.py`, targeted tests only if compatibility imports require them.
- Risk: medium-high, because these helpers shape content API responses and operator diagnostics; this slice must be behavior-preserving.
- Required proof: targeted Python syntax/import proof; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; stronger compose proof only if static/unit gates indicate behavioral uncertainty.
- Acceptance criteria: met.
- Implemented, with evidence: moved content item ID helpers, article/system selection SQL clauses, selection explain/diagnostics/guidance builders, content selection SQL builders, resource/article selection payload applicators and selected content preview helper into `services/api/app/content_selection_read_model.py`.
- Implemented, with evidence: `services/api/app/main.py` keeps compatibility exports and a `query_count` wrapper that preserves the existing `api_main.query_one` monkeypatch surface used by unit tests.
- Implemented, with evidence: `services/api/app/main.py` is reduced to 7443 lines after this extraction.
- Scope note: FastAPI route paths, response fields, SQL semantics, DB schema, worker/fetcher behavior and content-analysis/discovery/sequence logic remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched API modules passed; `pnpm unit_tests:py`, `pnpm lint`, `pnpm typecheck` and `git diff --check --` passed.
- Proof caveat: no compose proof was run for this batch because required static/unit gates passed and the slice was behavior-preserving read-model extraction only.

### ARCH-HARDENING-FOLLOWUP-BATCH-13-WORKER-REINDEX-BACKFILL-RUNTIME

- Kind: Stage
- Status: completed
- In scope: move reindex job context/options helpers, historical backfill snapshot/replay helpers, gray-zone replay helpers, content-analysis backfill helpers and interest auto-repair job helper ownership out of `services/workers/app/main.py`; preserve `main.py` compatibility exports and behavior.
- Out of scope: reindex/backfill semantics, content-analysis policy behavior, selection/matching semantics, HNSW/indexer behavior, queue/event names, DB migrations, public API/schema changes.
- Allowed paths: `.aidp/work.md`, `services/workers/app/main.py`, `services/workers/app/reindex_backfill_runtime.py`, `services/workers/app/reindex_processor.py`, targeted tests only if compatibility imports require them.
- Risk: high, because this code updates reindex jobs, snapshot rows, final selection/review replay paths and content-analysis backfill progress; this slice must be behavior-preserving.
- Required proof: targeted Python syntax/import proof; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `pnpm test:reindex-backfill:compose` or `pnpm integration_tests`; `git diff --check --`; cleanup with empty `docker ps` if compose stack remains running.
- Acceptance criteria: met.
- Implemented, with evidence: moved reindex job context/options helpers, historical backfill snapshot helpers, gray-zone replay helpers, content-analysis backfill helpers, selection-profile snapshot helper and interest auto-repair queue helper into `services/workers/app/reindex_backfill_runtime.py`.
- Implemented, with evidence: `services/workers/app/main.py` keeps the moved helper names as compatibility exports for existing unit tests, monkeypatch callers and reindex processor dependency injection.
- Implemented, with evidence: `services/workers/app/main.py` is reduced to 1752 lines after this extraction while preserving `process_reindex` dependency wiring.
- Scope note: reindex/backfill semantics, content-analysis policies, HNSW/index behavior, queue names and DB schema remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched worker modules passed; `pnpm unit_tests:py`, `pnpm lint`, `pnpm typecheck`, `pnpm integration_tests` and `git diff --check --` passed.
- Proof caveat: direct `pnpm test:reindex-backfill:compose` was attempted first and failed because the compose `worker` service was not running; this was a harness precondition miss, not a code failure. Canonical `pnpm integration_tests` then started compose itself and passed.
- Passed stateful proof detail: final `pnpm integration_tests` passed; it exercised phase 4/5 reindex routing and Internal MVP acceptance queued historical backfill after an admin-managed interest was live.
- Cleanup completed: the successful integration harness removed compose containers and volumes; final `docker ps` returned only the header row and no running containers.

### ARCH-HARDENING-FOLLOWUP-BATCH-12-WORKER-COMPILE-PROCESSORS

- Kind: Stage
- Status: completed
- In scope: move `process_interest_compile` and `process_criterion_compile` into focused compile processor module ownership; preserve `main.py` compatibility wrappers and main-owned monkeypatch dependency names; wire sequence direct handlers when import-safe.
- Out of scope: compiler semantics, embedding provider behavior, feature extraction behavior, HNSW/index behavior, auto-repair/reindex semantics, queue/event names, DB migrations, public API/schema changes.
- Allowed paths: `.aidp/work.md`, `services/workers/app/main.py`, `services/workers/app/compile_processors.py`, `services/workers/app/task_engine/pipeline_plugins.py`, targeted tests only if compatibility imports require them.
- Risk: high, because compile processors write compiled selection artifacts/vector registries and can trigger downstream derived-state repair paths; this slice must be behavior-preserving.
- Required proof: targeted Python syntax/import proof; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `pnpm integration_tests`; `git diff --check --`; cleanup with empty `docker ps` if compose stack remains running.
- Acceptance criteria: met.
- Implemented, with evidence: moved interest and criterion compile processor logic into `services/workers/app/compile_processors.py`, with focused dependency dataclasses preserving main-owned compiler, feature extractor, vector registry, indexer and auto-repair call surfaces.
- Implemented, with evidence: `services/workers/app/main.py` keeps `process_interest_compile` and `process_criterion_compile` as compatibility wrappers using main-owned dependency names; `INTEREST_COMPILE_CONSUMER` and `CRITERION_COMPILE_CONSUMER` remain compatibility exports for import callers.
- Implemented, with evidence: `services/workers/app/task_engine/pipeline_plugins.py` now resolves both compile handlers through direct focused processors before falling back to legacy `main.py` loading.
- Scope note: compiler semantics, vector/index behavior, auto-repair/reindex semantics and compile repository helper decomposition remain intentionally unchanged.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched worker modules passed; `pnpm unit_tests:py`, `pnpm lint`, `pnpm typecheck`, `pnpm integration_tests` and `git diff --check --` passed.
- Passed stateful proof detail: final `pnpm integration_tests` passed; compose worker smoke returned `compiled` for both `interest-compile` and `criterion-compile`, and Internal MVP acceptance passed through fresh ingest, matching, notification, admin-managed interest and historical backfill.
- Cleanup completed: the successful integration harness removed compose containers and volumes; final `docker ps` returned only the header row and no running containers.

### ARCH-HARDENING-FOLLOWUP-BATCH-11-WORKER-REINDEX-PROCESSOR

- Kind: Stage
- Status: completed
- In scope: move `process_reindex` into a focused reindex processor module; preserve `main.py` compatibility wrapper and main-owned monkeypatch dependency names; wire sequence direct handler when import-safe.
- Out of scope: reindex/backfill semantics, content-analysis policy behavior, HNSW/indexer behavior, queue/event names, DB migrations, public API/schema changes.
- Allowed paths: `.aidp/work.md`, `services/workers/app/main.py`, `services/workers/app/reindex_processor.py`, `services/workers/app/task_engine/pipeline_plugins.py`, targeted tests only if compatibility imports require them.
- Risk: high, because reindex controls HNSW rebuilds, historical backfill and content-analysis backfill; this slice must be behavior-preserving.
- Required proof: targeted Python syntax/import proof; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `pnpm integration_tests`; `git diff --check --`; cleanup with empty `docker ps` if compose stack remains running.
- Acceptance criteria: met.
- Implemented, with evidence: moved reindex processor logic into `services/workers/app/reindex_processor.py`, with `ReindexProcessorDependencies` preserving main-owned dependency names and indexer/backfill/content-analysis call surfaces.
- Implemented, with evidence: `services/workers/app/main.py` keeps `process_reindex` as a compatibility wrapper; `REINDEX_CONSUMER` remains a compatibility export for import callers.
- Implemented, with evidence: `services/workers/app/task_engine/pipeline_plugins.py` now resolves `process_reindex` through a direct focused handler before falling back to legacy `main.py` loading for not-yet-migrated processors.
- Scope note: reindex repository/helper decomposition, HNSW behavior, historical backfill semantics and content-analysis policy behavior remain intentionally out of this batch.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched worker modules passed; `pnpm unit_tests:py`, `pnpm lint`, `pnpm typecheck`, `pnpm integration_tests` and `git diff --check --` passed.
- Passed stateful proof detail: final `pnpm integration_tests` passed; phase 4/5 relay routing covered reindex triggers, and Internal MVP acceptance passed through historical backfill after the processor extraction.
- Cleanup completed: the successful integration harness removed compose containers and volumes; final `docker ps` returned only the header row and no running containers.

### ARCH-HARDENING-FOLLOWUP-BATCH-10-WORKER-FEEDBACK-INGEST-PROCESSOR

- Kind: Stage
- Status: completed
- In scope: move `process_feedback_ingest` into a focused feedback ingest processor module; preserve `main.py` compatibility wrapper and main-owned monkeypatch dependency names; wire sequence direct handler when import-safe.
- Out of scope: feedback product semantics, notification delivery behavior, LLM review, reindex, queue/event names, DB migrations, public API/schema changes.
- Allowed paths: `.aidp/work.md`, `services/workers/app/main.py`, `services/workers/app/feedback_ingest_processor.py`, `services/workers/app/task_engine/pipeline_plugins.py`, targeted tests only if compatibility imports require them.
- Risk: medium, because feedback ingest updates notification delivery payload state and participates in phase 4/5 routing, but this slice is behavior-preserving.
- Required proof: targeted Python syntax/import proof; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `pnpm integration_tests`; `git diff --check --`; cleanup with empty `docker ps` if compose stack remains running.
- Acceptance criteria: met.
- Implemented, with evidence: moved feedback ingest processor logic into `services/workers/app/feedback_ingest_processor.py`, with `FeedbackIngestProcessorDependencies` preserving the main-owned dependency surface.
- Implemented, with evidence: `services/workers/app/main.py` keeps `process_feedback_ingest` as a compatibility wrapper; `FEEDBACK_INGEST_CONSUMER` remains a compatibility export alongside `LLM_REVIEW_CONSUMER` for worker smoke/import callers.
- Implemented, with evidence: `services/workers/app/task_engine/pipeline_plugins.py` now resolves `process_feedback_ingest` through a direct focused handler before falling back to legacy `main.py` loading for not-yet-migrated processors.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched worker modules passed; `pnpm unit_tests:py`, `pnpm lint`, `pnpm typecheck`, `pnpm integration_tests` and `git diff --check --` passed.
- Passed stateful proof detail: final `pnpm integration_tests` passed; phase 4/5 relay routing covered feedback ingest triggers, and full Internal MVP acceptance passed through fresh ingest, matching, notification, admin flows and historical backfill.
- Cleanup completed: the successful integration harness removed compose containers and volumes; final `docker ps` returned only the header row and no running containers.

### ARCH-HARDENING-FOLLOWUP-BATCH-9-WORKER-LLM-REVIEW-PROCESSOR

- Kind: Stage
- Status: completed
- In scope: move `process_llm_review` into a focused LLM review processor module; preserve `main.py` compatibility wrapper and main-owned monkeypatch dependency names; wire sequence direct handler when import-safe.
- Out of scope: LLM provider behavior, review policy semantics, quota semantics, criteria/interest scoring semantics, notification semantics, queue/event names, DB migrations, public API/schema changes.
- Allowed paths: `.aidp/work.md`, `services/workers/app/main.py`, `services/workers/app/llm_review_processor.py`, `services/workers/app/task_engine/pipeline_plugins.py`, targeted tests only if compatibility imports require them.
- Risk: high, because LLM review resolves gray-zone criteria/interests and can emit downstream outbox events; this slice must be behavior-preserving.
- Required proof: targeted Python syntax/import proof; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `pnpm integration_tests`; `git diff --check --`; cleanup with empty `docker ps` if compose stack remains running.
- Acceptance criteria: met.
- Implemented, with evidence: moved LLM review processor logic into `services/workers/app/llm_review_processor.py`, with `LlmReviewProcessorDependencies` preserving the main-owned dependency and monkeypatch surface.
- Implemented, with evidence: `services/workers/app/main.py` keeps `process_llm_review` as a compatibility wrapper using main-owned dependency names; `LLM_REVIEW_CONSUMER` remains a compatibility export for worker smoke helpers.
- Implemented, with evidence: `services/workers/app/task_engine/pipeline_plugins.py` now resolves `process_llm_review` through a direct focused handler before falling back to legacy `main.py` loading for not-yet-migrated processors.
- Scope note: LLM review SQL/repository decomposition and provider/quota policy changes remain intentionally out of this batch; direct processor defaults can lazy-bind main-owned helper defaults until a later repository split.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched worker modules passed; `pnpm unit_tests:py`, `pnpm lint`, `pnpm typecheck`, `pnpm integration_tests` and `git diff --check --` passed after compatibility export remediation.
- Remediation detail: the first integration attempt failed because `services/workers/app/smoke.py` imports `LLM_REVIEW_CONSUMER` from `main.py`; restoring that compatibility export fixed the smoke import surface.
- Passed stateful proof detail: final `pnpm integration_tests` passed; phase 4/5 relay routing covered LLM review triggers, and `test:cluster-match-notify:compose` returned matched criteria/interests plus notified delivery.
- Cleanup completed: the successful integration harness removed compose containers and volumes; final `docker ps` returned only the header row and no running containers.

### ARCH-HARDENING-FOLLOWUP-BATCH-8-WORKER-INTEREST-MATCH-PROCESSOR

- Kind: Stage
- Status: completed
- In scope: move `process_match_interests` into a focused interest match processor module; preserve `main.py` compatibility wrapper and main-owned monkeypatch dependency names; wire sequence direct handler when import-safe.
- Out of scope: interest scoring semantics, final selection semantics, notification semantics, LLM review policy changes, queue/event names, DB migrations, public API/schema changes, criteria matching.
- Allowed paths: `.aidp/work.md`, `services/workers/app/main.py`, `services/workers/app/interest_match_processor.py`, `services/workers/app/task_engine/pipeline_plugins.py`, targeted tests only if compatibility imports require them.
- Risk: high, because interest matching owns personalization/filter truth and participates in final selection/outbox routing; this slice must be behavior-preserving.
- Required proof: targeted Python syntax/import proof; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `pnpm integration_tests`; `git diff --check --`; cleanup with empty `docker ps` if compose stack remains running.
- Acceptance criteria: met.
- Implemented, with evidence: moved interest matching processor logic into `services/workers/app/interest_match_processor.py`, with `InterestMatchProcessorDependencies` preserving the main-owned dependency and monkeypatch surface.
- Implemented, with evidence: `services/workers/app/main.py` keeps `process_match_interests` as a compatibility wrapper using main-owned dependency names, preserving import/test callers while reducing the worker hotspot to 3498 lines.
- Implemented, with evidence: `services/workers/app/task_engine/pipeline_plugins.py` now resolves `process_match_interests` through a direct focused handler before falling back to legacy `main.py` loading for not-yet-migrated processors.
- Scope note: interest match SQL/repository decomposition remains intentionally out of this batch; direct processor defaults can lazy-bind main-owned helper defaults until a later repository split.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched worker modules passed; `pnpm unit_tests:py`, `pnpm lint`, `pnpm typecheck`, `pnpm integration_tests` and `git diff --check --` passed.
- Passed stateful proof detail: `pnpm integration_tests` included `test:cluster-match-notify:compose`, where `interests` returned `status: matched`, `interestCount: 1`, and downstream `notify` returned `sentCount: 1`, `suppressedCount: 0`, `llmReviewCount: 0`.
- Cleanup completed: the successful integration harness removed compose containers and volumes; final `docker ps` returned only the header row and no running containers.

### ARCH-HARDENING-FOLLOWUP-BATCH-7-WORKER-CRITERIA-MATCH-PROCESSOR

- Kind: Stage
- Status: completed
- In scope: move `process_match_criteria` into a focused criteria match processor module; preserve `main.py` compatibility wrapper and main-owned monkeypatch dependency names; wire sequence direct handler when import-safe.
- Out of scope: criteria scoring semantics, LLM review policy changes, selection profile behavior changes, reusable review semantics, interest matching, queue/event names, DB migrations, public API/schema changes.
- Allowed paths: `.aidp/work.md`, `services/workers/app/main.py`, `services/workers/app/criteria_match_processor.py`, `services/workers/app/task_engine/pipeline_plugins.py`, targeted tests only if compatibility imports require them.
- Risk: high, because criteria matching gates clustering and can enqueue LLM review events; this slice must be behavior-preserving.
- Required proof: targeted Python syntax/import proof; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `pnpm integration_tests`; `git diff --check --`; cleanup with empty `docker ps` if compose stack remains running.
- Acceptance criteria: met.
- Implemented, with evidence: moved criteria matching processor logic into `services/workers/app/criteria_match_processor.py`, with `CriteriaMatchProcessorDependencies` preserving the heavily monkeypatched main-owned dependency surface.
- Implemented, with evidence: `services/workers/app/main.py` keeps `process_match_criteria` as a compatibility wrapper using main-owned dependency names, preserving existing unit test monkeypatch behavior.
- Implemented, with evidence: `services/workers/app/task_engine/pipeline_plugins.py` now resolves `process_match_criteria` through a direct focused handler before falling back to legacy `main.py` loading for not-yet-migrated processors.
- Scope note: criteria helper repository decomposition remains intentionally out of this batch; direct processor defaults can lazy-bind main-owned helper defaults until a later repository split.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched worker modules passed; `pnpm unit_tests:py`, `pnpm lint`, `pnpm typecheck`, `pnpm integration_tests` and `git diff --check --` passed.
- Passed stateful proof detail: `pnpm integration_tests` included `test:cluster-match-notify:compose`, where `criteria` returned `status: matched`, `criteriaCount: 1`, and downstream interests/notify passed.
- Cleanup completed: the successful integration harness removed compose containers and volumes; final `docker ps` returned only the header row and no running containers.

### ARCH-HARDENING-FOLLOWUP-BATCH-6-WORKER-ARTICLE-EXTRACT-PROCESSOR

- Kind: Stage
- Status: completed
- In scope: move the `process_article_extract` wrapper into a focused worker module and wire sequence/legacy handler resolution to the narrow handler where applicable; keep fetchers-owned `ArticleExtractPlugin` semantics unchanged.
- Out of scope: fetchers enrichment endpoint behavior, resource extraction, reindex semantics, queue/event names, DB migrations, public API/schema changes.
- Allowed paths: `.aidp/work.md`, `services/workers/app/main.py`, `services/workers/app/article_extraction_processor.py`, `services/workers/app/task_engine/pipeline_plugins.py`, targeted tests only if compatibility imports require them.
- Risk: medium, because the wrapper delegates to fetchers-owned enrichment and participates in historical backfill, but this slice is behavior-preserving.
- Required proof: targeted Python syntax/import proof; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `pnpm integration_tests` if stateful enrichment/reindex coupling requires it; `git diff --check --`; cleanup with empty `docker ps` if compose stack remains running.
- Acceptance criteria: met.
- Implemented, with evidence: moved the article enrichment wrapper into `services/workers/app/article_extraction_processor.py`; the wrapper still delegates to `ArticleExtractPlugin` and preserves the existing context/result shape.
- Implemented, with evidence: `services/workers/app/main.py` keeps `process_article_extract` as a compatibility export, while `services/workers/app/task_engine/pipeline_plugins.py` can resolve `process_article_extract` through a direct focused handler.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched worker modules passed; `pnpm unit_tests:py`, `pnpm lint`, `pnpm typecheck`, `pnpm integration_tests` and `git diff --check --` passed.
- Passed stateful proof detail: `pnpm integration_tests` completed Internal MVP acceptance and included enrichment retry verification after the wrapper move.
- Cleanup completed: the successful integration harness removed compose containers and volumes; final `docker ps` returned only the header row and no running containers.

### ARCH-HARDENING-FOLLOWUP-BATCH-5-WORKER-CLUSTER-PROCESSOR

- Kind: Stage
- Status: completed
- In scope: extract article cluster worker processor logic into a focused cluster processor module; update sequence pipeline plugins to use the narrow cluster processor handler instead of legacy `main.py` as the handler; keep `main.py` compatibility wrapper and main-owned dependency names for tests/monkeypatches.
- Out of scope: clustering semantics, story/canonical verification semantics, selection gate semantics, repository decomposition of all cluster/system-feed helpers, matching/LLM/reindex/compile processors, queue/event names, DB migrations, public API/schema changes.
- Allowed paths: `.aidp/work.md`, `services/workers/app/main.py`, `services/workers/app/cluster_processor.py`, `services/workers/app/task_engine/pipeline_plugins.py`, targeted tests only if compatibility imports require them.
- Risk: high, because cluster writes event clusters, story verification state and downstream matched events, but this slice is behavior-preserving.
- Required proof: targeted Python syntax/import proof; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `pnpm test:cluster-match-notify:compose` or `pnpm integration_tests`; `git diff --check --`; cleanup with `pnpm dev:mvp:internal:down` and empty `docker ps` if compose stack remains running.
- Acceptance criteria: met.
- Implemented, with evidence: moved article cluster processor logic into `services/workers/app/cluster_processor.py`, including focused dependency wiring through `ArticleClusterProcessorDependencies`.
- Implemented, with evidence: `services/workers/app/main.py` keeps `process_cluster` as a compatibility wrapper using main-owned dependency names, preserving import and monkeypatch surfaces while shrinking the hotspot.
- Implemented, with evidence: `services/workers/app/task_engine/pipeline_plugins.py` now resolves `process_cluster` through a direct processor handler before falling back to legacy `main.py` loading for not-yet-migrated processors.
- Scope note: cluster/system-feed repository helper decomposition remains intentionally out of this batch; default direct processor dependencies can still lazy-bind main-owned helper defaults until a later repository split.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched worker modules passed; `pnpm unit_tests:py`, `pnpm lint`, `pnpm typecheck`, `pnpm integration_tests` and `git diff --check --` passed.
- Passed stateful proof detail: `pnpm integration_tests` included `test:cluster-match-notify:compose`, where `cluster` returned `status: clustered`, `isNewCluster: true` and downstream criteria/interests/notify all passed.
- Cleanup completed: the successful integration harness removed compose containers and volumes; final `docker ps` returned only the header row and no running containers.

### ARCH-HARDENING-FOLLOWUP-BATCH-4-WORKER-NOTIFY-PROCESSOR

- Kind: Stage
- Status: completed
- In scope: extract article notify worker processor logic into a focused notification processor module; update sequence pipeline plugins to use the narrow notify processor instead of dynamically loading `services/workers/app/main.py`; keep `main.py` compatibility wrapper and main-owned dependency names for tests/monkeypatches.
- Out of scope: notification product semantics, delivery channel behavior, digest schedulers, LLM review, clustering/matching, queue/event names, DB migrations, public API/schema changes.
- Allowed paths: `.aidp/work.md`, `services/workers/app/main.py`, `services/workers/app/notification_processor.py`, `services/workers/app/task_engine/pipeline_plugins.py`, targeted tests only if compatibility imports require them.
- Risk: medium-high, because notify writes delivery logs/suppressions and advances article processing state, but this slice is behavior-preserving.
- Required proof: targeted Python syntax/import proof; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `pnpm test:relay:phase3:compose` or `pnpm integration_tests`; `git diff --check --`; cleanup with `pnpm dev:mvp:internal:down` and empty `docker ps` if compose stack remains running.
- Acceptance criteria: met.
- Implemented, with evidence: moved article notify processor logic into `services/workers/app/notification_processor.py`, including focused dependency wiring through `ArticleNotifyProcessorDependencies` and lazy runtime imports so API unit imports do not require Redis.
- Implemented, with evidence: `services/workers/app/main.py` keeps `process_notify` as a compatibility wrapper using main-owned dependency names, preserving import and monkeypatch surfaces while shrinking the hotspot.
- Implemented, with evidence: `services/workers/app/task_engine/pipeline_plugins.py` now resolves `process_notify` through a direct processor handler before falling back to legacy `main.py` loading for not-yet-migrated processors.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched worker modules passed; `pnpm unit_tests:py`, `pnpm lint`, `pnpm typecheck`, `pnpm integration_tests` and `git diff --check --` passed.
- Passed stateful proof detail: `pnpm integration_tests` included `test:cluster-match-notify:compose`, where `notify` returned `sentCount: 1`, `suppressedCount: 0`, `llmReviewCount: 0` through the new processor path.
- Cleanup completed: the successful integration harness removed compose containers and volumes; final `docker ps` returned only the header row and no running containers.

### ARCH-HARDENING-FOLLOWUP-BATCH-3-WORKER-EMBED-PROCESSOR

- Kind: Stage
- Status: completed
- In scope: extract article embed worker processor logic into the existing cohesive article processor module; update sequence pipeline plugins to use the narrow embed processor instead of dynamically loading `services/workers/app/main.py`; keep `main.py` compatibility wrapper and main-owned dependency names for tests/monkeypatches.
- Out of scope: clustering, matching, notify, LLM review, reindex, interest/criterion compile, queue/event names, DB migrations, vector schema changes, embedding model behavior changes.
- Allowed paths: `.aidp/work.md`, `services/workers/app/main.py`, `services/workers/app/article_processors.py`, `services/workers/app/task_engine/pipeline_plugins.py`, targeted tests only if compatibility imports require them.
- Risk: high, because embed writes vector registries/features and gates downstream clustering/matching, but this slice is behavior-preserving.
- Required proof: targeted Python syntax/import proof; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `pnpm test:embed:compose` or `pnpm integration_tests`; `git diff --check --`; cleanup with `pnpm dev:mvp:internal:down` and empty `docker ps` if compose stack remains running.
- Acceptance criteria: met.
- Implemented, with evidence: moved article embed processor logic into `services/workers/app/article_processors.py`, including focused dependency wiring through `ArticleEmbedProcessorDependencies` and lazy default imports for runtime-only dependencies.
- Implemented, with evidence: `services/workers/app/main.py` keeps `process_embed` as a compatibility wrapper using main-owned dependency names, preserving import and monkeypatch surfaces while shrinking the hotspot.
- Implemented, with evidence: `services/workers/app/task_engine/pipeline_plugins.py` now resolves `process_embed` through a direct processor handler before falling back to legacy `main.py` loading for not-yet-migrated processors.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched worker modules passed; `pnpm unit_tests:py`, `pnpm lint`, `pnpm typecheck`, `pnpm test:embed:compose` and `git diff --check --` passed.
- Cleanup completed: `pnpm dev:mvp:internal:down` removed the compose stack after embed proof, and final `docker ps` returned only the header row with no running containers.

### ARCH-HARDENING-FOLLOWUP-BATCH-2-WORKER-NORMALIZE-DEDUP-PROCESSORS

- Kind: Stage
- Status: completed
- In scope: extract normalize/dedup worker processor logic and direct repository/event helpers into cohesive worker modules; update sequence pipeline plugins to use narrow processors for normalize/dedup instead of dynamically loading `services/workers/app/main.py`; keep `main.py` compatibility wrappers and existing monkeypatch/import surfaces.
- Out of scope: full worker processor migration, queue names, event names, task keys, DB migrations, sequence runtime semantics, content-analysis/LLM/reindex processors, Admin/UI/fetcher/API changes.
- Allowed paths: `.aidp/work.md`, `services/workers/app/main.py`, `services/workers/app/task_engine/pipeline_plugins.py`, new focused modules under `services/workers/app/`, targeted Python tests only if compatibility imports require them.
- Risk: high, because normalize/dedup participate in the core article pipeline and sequence runtime, but this slice is intended to be behavior-preserving.
- Required proof: targeted Python syntax/import proof; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `pnpm test:normalize-dedup:compose`; `pnpm integration_tests` if compose smoke or sequence coupling requires it; `git diff --check --`; cleanup with `pnpm dev:mvp:internal:down` and empty `docker ps` if compose stack remains running.
- Acceptance criteria: met.
- Implemented, with evidence: moved normalize/dedup processor logic into `services/workers/app/article_processors.py`, moved direct article row locking into `services/workers/app/article_repository.py`, and moved shared inbox/outbox/processing-state helpers into `services/workers/app/worker_events.py`.
- Implemented, with evidence: `services/workers/app/main.py` keeps `process_normalize` and `process_dedup` compatibility wrappers using main-owned dependency names, preserving import/monkeypatch surfaces while shrinking the hotspot.
- Implemented, with evidence: `services/workers/app/task_engine/pipeline_plugins.py` now resolves `process_normalize` and `process_dedup` through direct processor handlers before falling back to legacy `main.py` loading for the not-yet-migrated processors.
- Passed proof: targeted `python -m py_compile` and `python -m ruff check` for touched worker modules passed; `pnpm unit_tests:py`, `pnpm lint`, `pnpm typecheck`, and `git diff --check --` passed.
- Stateful proof residual: first `pnpm integration_tests` after the extraction passed normalize/dedup smoke but failed later because `/collections/system-selected` did not include the new item on the first page; this was classified as dirty compose volume residue from the previous product core stack.
- Passed remediation proof: clean rerun `pnpm integration_tests` passed, including `test:normalize-dedup:compose`, relay phase routing, article pipeline worker smokes, admin/web flows and historical backfill.
- Cleanup completed: the successful integration harness removed compose containers and volumes; final `docker ps` returned only the header row and no running containers.

### ARCH-HARDENING-FOLLOWUP-BATCH-1-API-ROUTER-HARDENING

- Kind: Stage
- Status: completed
- In scope: continue FastAPI decomposition by converting focused route registration modules to real `APIRouter` composition where safe, and extract cohesive API read-model/route helper logic out of `services/api/app/main.py` only when behavior-preserving compatibility exports remain available.
- Out of scope: DB migrations, route/path/schema/response changes, worker/fetcher/discovery runtime behavior changes, Admin UI redesign, MCP tool changes, broad all-hotspot refactor in one batch.
- Allowed paths: `.aidp/work.md`, `services/api/app/main.py`, `services/api/app/routes/*`, new focused modules under `services/api/app/`, targeted Python tests only if import compatibility requires them.
- Risk: medium-high, because FastAPI route composition and read-model helpers are public API surfaces, but this batch is intended to be behavior-preserving.
- Required proof: targeted Python syntax/import proof; `pnpm unit_tests:py`; `pnpm lint`; `pnpm typecheck`; `git diff --check --`; `pnpm test:product:local:core` if route registration or handler behavior changes require stateful confirmation.
- Acceptance criteria: met.
- Implemented, with evidence: focused route registration modules now build local `APIRouter` instances and are composed through `services/api/app/routes.register_api_routes`, leaving public paths and handler functions unchanged.
- Implemented, with evidence: LLM review budget/env helpers moved from `services/api/app/main.py` into `services/api/app/llm_review_budget.py`, while imported names remain available to existing `main.py` callers.
- Passed proof: targeted `python -m py_compile` for touched API modules passed; `pnpm unit_tests:py` passed with 286 tests; `pnpm lint:py`, `pnpm lint`, `pnpm typecheck`, and `git diff --check --` passed.
- Resolved residual, with evidence: after the initial product core run `9cc660a2` exposed stateful `integration_tests` instability, targeted `pnpm test:normalize-dedup:compose` passed on a fresh compose stack and `pnpm integration_tests` passed cleanly.
- Passed final product proof: clean rerun `pnpm test:product:local:core` passed on run `c35c5ecf`, 11/11 lanes green, with artifacts `/tmp/newsportal-product-local-core-c35c5ecf.json` and `/tmp/newsportal-product-local-core-c35c5ecf.md`.
- Cleanup completed: `pnpm dev:mvp:internal:down` removed the compose stack after final product core proof; final `docker ps` returned only the header row and no running containers.

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
