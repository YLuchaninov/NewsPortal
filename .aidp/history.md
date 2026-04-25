# History

Этот файл хранит долговечную историю завершенной AIDP-работы. Live state держи в `.aidp/work.md`.

## Свежесть архива

- Последняя проверка архива: 2026-04-25
- Проверил: Codex
- Следующий trigger пересмотра: завершение нового work item/capability или обнаружение stale live detail в `.aidp/work.md`.

## Правила

- Завершенные детали принадлежат сюда, а не в `.aidp/work.md`.
- Не переоткрывай архивный item; для новой работы создавай новый item в `.aidp/work.md`.
- Архив должен объяснять outcome без chat history.
- Отмененные и superseded items архивируются честно, с причиной и replacement, если он есть.

## Индекс архива

- `AIDP-BOOTSTRAP-2026-04-24` — первичная инициализация/repair AIDP runtime core для NewsPortal.
- `AIDP-CONTRACTS-REPAIR-2026-04-24` — явный repair неполного переноса старых deep contracts из `docs/contracts/*` в `.aidp/contracts/*`.
- `AIDP-SOURCE-AUDIT-2026-04-24` — дополнительный source-code audit после старой AIDP, добавивший code-owned contracts.
- `AIDP-ARCH-ENGINEERING-2026-04-24` — усиление architecture engineering quality bar.
- `AIDP-VERIFICATION-COVERAGE-2026-04-24` — аудит и закрепление test/proof surfaces.
- `AIDP-FINAL-PROOF-DOCS-2026-04-24` — финальная чистка product/reference docs, lint fixes and requested proof gates.
- `AIDP-DOCS-CONTRACTS-DELETE-2026-04-25` — удаление старых duplicate `docs/contracts/*` после переноса canonical truth в `.aidp/contracts/*`.

## Завершенные items

### AIDP-BOOTSTRAP-2026-04-24 — Инициализация AIDP core

- Archive outcome: completed
- Kind: Stage
- Финальный status: archived
- Parent capability: none
- Superseded by: n/a
- Cancelled because: n/a
- Почему существовало: репозиторий получил AIDP 1.6.1 core, но `.aidp/*` оставался шаблонным, `os.yaml` имел `initialized: false`, а пользователь попросил заполнить runtime truth на русском, учитывая существующий старый contract материал.
- Что изменилось:
  - корневой `AGENTS.md` и adapter presets сделаны тонкими русскоязычными routers;
  - `.aidp/os.yaml` заполнен реальными facts, commands, capabilities and proof gaps для NewsPortal;
  - `.aidp/blueprint.md` описывает реальную архитектуру монорепо, runtime surfaces, invariants, boundaries and risk zones;
  - `.aidp/engineering.md` описывает репозиторную engineering discipline для TS/Astro, Python, migrations, async pipeline, discovery and stateful tests;
  - `.aidp/verification.md` описывает реальные proof gates и close gates;
  - `.aidp/contracts/test-access-and-fixtures.md` заменен repository-specific test-access contract;
  - `.aidp/work.md` переведен из `setup` в `normal` и оставляет truthful handoff;
  - шаблонные example rows удалены из live runtime truth.
- Выполненный proof:
  - read-only review of `.aidp/*`, root/package manifests, README, compose files, env example, package structure, test tree, source tree and existing contract docs;
  - post-edit audit by text search for setup placeholders/stale references;
  - no runtime code gates were required or run because no product code changed.
- Оставшиеся risks/gaps:
  - pre-existing dirty worktree contained `.codex/config.toml`, a temporary imported AIDP package folder and legacy runtime-doc deletions; unrelated changes were not reverted;
  - product/reference docs cleanup was completed later in `AIDP-FINAL-PROOF-DOCS-2026-04-24`;
  - full migration of every long-form `docs/contracts/*` contract into `.aidp/contracts/` was completed later in `AIDP-CONTRACTS-REPAIR-2026-04-24`.
- Follow-up created: none; parked notes live in `.aidp/work.md`.
- Archived on: 2026-04-24

### AIDP-CONTRACTS-REPAIR-2026-04-24 — Перенос старых deep contracts

- Archive outcome: completed
- Kind: Sweep
- Финальный status: archived
- Parent capability: C-AIDP-CONTRACTS
- Superseded by: n/a
- Cancelled because: n/a
- Почему существовало: пользователь указал, что предыдущий bootstrap некорректно припарковал старые `docs/contracts/*` вместо проверки и переноса в `.aidp/contracts/*`.
- Что изменилось:
  - создан один AIDP contract на каждый старый subsystem contract: article pipeline, browser-assisted websites, content model, discovery agent, feed ingress adapters, independent recall discovery, MCP control plane, universal selection profiles, universal task engine and zero-shot interest filtering;
  - `.aidp/contracts/README.md` теперь перечисляет все runtime contracts и фиксирует, что old `docs/contracts/*` являются reference/evidence, а не AIDP canon;
  - `.aidp/blueprint.md`, `.aidp/os.yaml` и `.aidp/verification.md` обновлены под полный набор deep contracts;
  - `.aidp/work.md` вернул route в `normal` после repair.
- Выполненный proof:
  - прочитаны и сопоставлены старые `docs/contracts/*.md`;
  - выполнен one-for-one filename audit между `docs/contracts` и `.aidp/contracts`;
  - выполнен repository search по ключевым surfaces: `final_selection_results`, `selection_profiles`, `discovery_recall_*`, `q.sequence`, MCP tokens/tools, browser fallback, feed adapters;
  - `os.yaml` успешно parsed через Ruby YAML.
- Оставшиеся risks/gaps:
  - product/reference docs under `docs/contracts/*` were later deleted in `AIDP-DOCS-CONTRACTS-DELETE-2026-04-25`;
  - runtime/product gates were not executed because repair changed AIDP docs only.
- Follow-up created: none.
- Archived on: 2026-04-24

### AIDP-DOCS-CONTRACTS-DELETE-2026-04-25 — Удаление старых docs contracts

- Archive outcome: completed
- Kind: Patch
- Финальный status: archived
- Parent capability: C-DOCS-CONTRACTS-REMOVE
- Superseded by: n/a
- Cancelled because: n/a
- Почему существовало: пользователь подтвердил, что старые contract docs в `docs/contracts/*` больше не нужны после переноса runtime truth в `.aidp/contracts/*`, и попросил удалить их.
- Что изменилось:
  - удалены `docs/contracts/*` and empty `docs/contracts/` directory;
  - surviving product docs now link to `.aidp/contracts/*`;
  - `.aidp/blueprint.md`, `.aidp/engineering.md`, `.aidp/verification.md` and `.aidp/contracts/README.md` no longer present `docs/contracts/*` as a current reference source;
  - `.aidp/work.md` returned to no-active-item state.
- Выполненный proof:
  - `find docs/contracts -maxdepth 1 -type f` returned no files before the directory was removed;
  - docs local markdown link check passed for 24 remaining markdown files under `docs/`;
  - targeted search found no live markdown links to `/docs/contracts/` or `docs/contracts/*.md`;
  - `test ! -e docs/contracts` passed;
  - `.aidp/os.yaml` parsed successfully through Ruby YAML;
  - `git diff --check` passed.
- Оставшиеся risks/gaps:
  - historical archive entries still mention `docs/contracts/*` where they describe the previous migration path; those are history, not runtime truth;
  - canonical runtime contracts now live only under `.aidp/contracts/*`.
- Follow-up created: none.
- Archived on: 2026-04-25

### AIDP-SOURCE-AUDIT-2026-04-24 — Source-code audit пропущенной runtime truth

- Archive outcome: completed
- Kind: Sweep
- Финальный status: archived
- Parent capability: C-AIDP-SOURCE-AUDIT
- Superseded by: n/a
- Cancelled because: n/a
- Почему существовало: пользователь попросил дополнительно пройти source code, потому что старая AIDP могла пропустить durable behavior, которого не было в старых `docs/contracts/*`.
- Что изменилось:
  - добавлен `.aidp/contracts/auth-session-boundary.md` для Firebase web/admin identity, local PostgreSQL roles, cookies, allowlist and nginx `/admin` boundary;
  - добавлен `.aidp/contracts/notifications-and-digests.md` для web push, Telegram, email digest, preferences, delivery logs, scheduler and Mailpit proof;
  - добавлен `.aidp/contracts/runtime-migrations-and-derived-state.md` для compose/nginx, ordered migrations, `schema_migrations`, HNSW rebuild/check and derived-state rules;
  - `.aidp/contracts/README.md`, `.aidp/blueprint.md`, `.aidp/engineering.md`, `.aidp/verification.md` и `.aidp/os.yaml` синхронизированы с новыми contracts and commands;
  - `.aidp/work.md` возвращен из `repair` в `normal`.
- Выполненный proof:
  - прочитаны web/admin auth modules and BFF routes, notification channel/digest modules, worker delivery/scheduler code, notification preference code, migration runner, migration smoke code, indexer config/store/CLI, nginx config, `.env.example`, root scripts and compose references;
  - `os.yaml` parsed через Ruby YAML;
  - проверено наличие новых contracts в `.aidp/contracts/README.md`, `.aidp/blueprint.md` и `.aidp/os.yaml`;
  - runtime product gates were not run because this repair changed AIDP docs only.
- Оставшиеся risks/gaps:
  - no product runtime behavior was changed;
  - compose and external-provider proof remains required for future work that touches auth/session, notifications/digests, migrations/runtime or HNSW indexing.
- Follow-up created: none.
- Archived on: 2026-04-24

### AIDP-ARCH-ENGINEERING-2026-04-24 — Усиление architecture engineering requirements

- Archive outcome: completed
- Kind: Sweep
- Финальный status: archived
- Parent capability: C-AIDP-ARCH-ENGINEERING
- Superseded by: n/a
- Cancelled because: n/a
- Почему существовало: пользователь попросил профессионально заполнить architecture/engineering requirements: no god objects, no magic numbers, гибкость, масштабируемость and maintainability.
- Что изменилось:
  - `.aidp/engineering.md` получил architecture quality bar, god object/module rules, magic number/string/config rules, modularity/decomposition rules, scalability/resilience discipline, type/state-machine discipline and architecture review triggers;
  - `.aidp/verification.md` получил architecture proof checklist и doc-only architecture hardening proof category;
  - `.aidp/work.md` возвращен к no-active-item state.
- External research evidence:
  - ISO/IEC/IEEE 42010 architecture description model: concerns, stakeholders, viewpoints, decisions and rationale;
  - SEI/CMU reports on quality attribute evaluation and modifiability tactics;
  - Parnas 1972 ACM paper on decomposition by information hiding/modularity;
  - Microsoft Azure Well-Architected guidance on pillars, tradeoffs, loose coupling, performance/capacity, operational excellence and automation;
  - Google TypeScript Style Guide, TypeScript Handbook narrowing/exhaustiveness and PEP 8 constants/resource handling.
- Repository evidence:
  - source scan found large orchestration pressure zones such as `services/api/app/main.py`, `services/workers/app/main.py`, `services/workers/app/discovery_orchestrator.py`, `services/fetchers/src/web-ingestion.ts`, `services/fetchers/src/fetchers.ts`, `services/mcp/src/tools.ts`, `apps/admin/src/pages/discovery.astro` and large proof scripts;
  - env/config scan confirmed many runtime constants already belong in config modules and `.env.example`, so engineering rules now require new tunables to stay centralized and validated.
- Выполненный proof:
  - web research used primary/official sources where available;
  - repo scans inspected large files and runtime constants/config/env surfaces;
  - AIDP owner files updated only under `.aidp/*`;
  - `os.yaml` parsed after edits;
  - runtime product gates were not run because no product code changed.
- Оставшиеся risks/gaps:
  - existing large files are documented as pressure zones, not refactored in this work;
  - future product changes touching those files must apply the new architecture review triggers.
- Follow-up created: none.
- Archived on: 2026-04-24

### AIDP-VERIFICATION-COVERAGE-2026-04-24 — Аудит test/proof surfaces

- Archive outcome: completed
- Kind: Sweep
- Финальный status: archived
- Parent capability: C-AIDP-VERIFICATION-COVERAGE
- Superseded by: n/a
- Cancelled because: n/a
- Почему существовало: пользователь попросил проверить, что verification and related AIDP files учитывают все test surfaces, нужные для полноценной разработки.
- Что изменилось:
  - `package.json` получил root aliases для уже существующих harnesses: `test:automation:admin:compose`, `test:website:matrix:compose`, `test:web:ui-audit`;
  - `.aidp/os.yaml` получил полный command coverage для root test/proof/diagnostic/runtime scripts;
  - `.aidp/verification.md` получил expanded proof map, test surface taxonomy, boundary-specific proof selection and explicit diagnostics/live-provider guidance;
  - `.aidp/work.md` возвращен к no-active-item state.
- Repository evidence:
  - root `package.json` scripts compared against `.aidp/os.yaml` commands;
  - package-level scripts inspected in apps, packages, fetchers and relay;
  - `tests/unit/ts`, `tests/unit/python`, `services/*/src/cli`, `services/workers/app/smoke.py` and `infra/scripts` inspected as proof surface inventory.
- Выполненный proof:
  - `package.json` parsed successfully with Node;
  - `.aidp/os.yaml` parsed successfully with Ruby YAML;
  - command coverage audit confirmed all root scripts matching test/proof/build/dev/check/diagnostic/remediation patterns are represented in `.aidp/os.yaml`;
  - targeted search confirmed newly surfaced gates are present in `package.json`, `.aidp/os.yaml` and `.aidp/verification.md`.
- Оставшиеся risks/gaps:
  - no runtime tests were executed because this work changed verification metadata and script aliases only;
  - compose/live/external-provider gates remain stateful and must be selected per active work item.
- Follow-up created: none.
- Archived on: 2026-04-24

### AIDP-FINAL-PROOF-DOCS-2026-04-24 — Финальная чистка docs and proof gates

- Archive outcome: completed
- Kind: Sweep
- Финальный status: archived
- Parent capability: C-FINAL-PROOF-DOCS
- Superseded by: n/a
- Cancelled because: n/a
- Почему существовало: пользователь попросил запустить `pnpm lint`, `pnpm typecheck`, `pnpm unit_tests`, `pnpm test:mvp:internal`, исправить surfaced issues, оставить `docs/*` как product/reference docs and clean stale old AIDP paths.
- Что изменилось:
  - product/reference docs under `docs/` were cleaned from stale old runtime-doc links while keeping product/reference content in place;
  - fixed one broken local markdown link in `docs/product/operator/examples/DISCOVERY_MODE_TESTING.md`;
  - lint failures surfaced by the final gate were fixed with minimal local changes in admin Astro pages, infra proof scripts, MVP smoke helper code and fetcher website-ingestion code;
  - `.aidp/work.md` was closed back to no active item and records proof/cleanup status.
- Выполненный proof:
  - local markdown link check passed for 36 docs files;
  - stale old runtime-doc path search returned no active product-doc matches after cleanup;
  - `pnpm lint` passed after fixes;
  - `pnpm typecheck` passed with zero errors;
  - `pnpm unit_tests` passed: TypeScript 245/245, Python 265/265;
  - `pnpm test:mvp:internal` passed, including compose startup, migrations, relay routing phases, RSS ingest, worker smokes, browser-style web/admin auth, admin-managed interest flow, fresh ingest and cleanup.
- Cleanup:
  - MVP harness stopped compose.dev, removed PostgreSQL/Redis volumes and reported cleanup of the temporary allowlisted Firebase admin identity;
  - temporary AIDP release package folder was already absent by operator action;
  - `.codex/config.toml` remains pre-existing/unowned and was not reverted.
- Оставшиеся risks/gaps:
  - production deploy and package/release proof remain gaps because no root commands are declared;
  - broad live-provider gates outside MVP internal smoke were not requested in this item.
- Follow-up created: none.
- Archived on: 2026-04-24

### PRODUCT-LOCAL-TEST-CONTOUR-2026-04-24 — Local product testing contour without parked ingestion lanes

- Archive outcome: completed
- Kind: Sweep
- Финальный status: archived
- Parent capability: Runtime delivery / Operator product testing
- Superseded by: n/a
- Cancelled because: n/a
- Почему существовало: пользователь попросил реализовать локальный internal product testing plan без Telegram ingestion, inbound Email IMAP ingestion и API source ingestion.
- Что изменилось:
  - added root scripts `pnpm test:product:local:core`, `pnpm test:product:local:full` and `pnpm test:product:local:cleanup`;
  - added `infra/scripts/test-product-local.mjs` for env preflight, command orchestration and `/tmp/newsportal-product-local-<mode>-<runId>.json|md` evidence artifacts;
  - narrowed `pnpm test:website:admin:compose` so mandatory acceptance covers website/resources and no longer blocks on API source or inbound Email IMAP ingestion;
  - documented the current contour in `docs/product/operator/local-product-testing.md`, README/operator docs and AIDP proof map;
  - kept local `email_digest` delivery via Mailpit in scope because it is outbound delivery, not inbound email ingestion.
- Выполненный proof:
  - `node --check infra/scripts/test-product-local.mjs`;
  - `node --check infra/scripts/test-website-admin-flow.mjs`;
  - targeted ESLint for changed harnesses;
  - `pnpm test:product:local:cleanup`;
  - `node infra/scripts/test-product-local.mjs --mode=core --preflight-only`;
  - `node infra/scripts/test-product-local.mjs --mode=full --preflight-only`;
  - `pnpm lint:ts`;
  - `pnpm test:cluster-match-notify:compose` passed after isolating the phase4 smoke criterion from unrelated system criteria;
  - `pnpm test:web:ui-audit` passed after stabilizing the admin article moderation/retry surface;
  - `pnpm test:product:local:core` passed with deterministic/stateful/browser evidence;
  - escalated `pnpm test:product:local:full` passed with discovery, live website matrix and live MCP HTTP evidence;
  - `pnpm test:product:local:cleanup` passed and `pnpm dev:mvp:internal:down` stopped the remaining compose stack.
- Evidence artifacts:
  - `/tmp/newsportal-product-local-core-6fd0a54c.json|md`;
  - `/tmp/newsportal-product-local-full-00f25bc1.json|md`;
  - `/tmp/newsportal-product-local-cleanup-b0d39c46.json|md`;
  - `/tmp/newsportal-product-local-core-ea611ff8.json|md`;
  - `/tmp/newsportal-product-local-full-6d7fccc5.json|md`;
  - `/tmp/newsportal-product-local-cleanup-c8548794.json|md`;
  - supporting live artifacts include `/tmp/newsportal-mcp-http-deterministic-950488cc-92bd-4905-a066-9b6628ea427f.json|md`, `/tmp/newsportal-live-discovery-yield-proof-27b4010b.json|md`, `/tmp/newsportal-live-website-matrix-baseline-f242b232-3048-43e8-af5c-1e483063c680.json` and `/tmp/newsportal-mcp-http-live-5779c04a-13d6-4310-aa73-b24a50be1e94.json|md`.
- Issues found and fixed during proof:
  - deterministic MCP discovery scenario now seeds a mission-scoped candidate when needed instead of depending on stale global candidates;
  - phase4 worker smoke now temporarily isolates its own criterion so unrelated active criteria cannot turn a matched article into a gray-zone hold and suppress `article.criteria.matched`;
  - browser UI audit now uses RSS/website-only channel import data, current user-interest selectors, stable recent-failures article moderation/retry coverage, and scopes discovery action buttons to the dedicated discovery admin proof;
  - admin/browser BFF request handling now preserves JSON request bodies, handles boolean reindex flags, and avoids treating JSON requests as HTML navigation;
  - React/Astro hydration/runtime issues found by browser proof were fixed with UTC date formatting, a defined workspace pane label data attribute and client-safe automation helpers;
  - API discovery feedback now normalizes blank optional UUID strings to `null`.
- Оставшиеся risks/gaps:
  - live-provider proof remains environment/time dependent; the successful full run classified upstream captcha/403/unsupported blocks in the website matrix as truthful live evidence rather than deterministic regressions;
  - Telegram ingestion, inbound Email IMAP ingestion, API source ingestion and `youtube` remain parked/future lanes;
  - production deploy and release/package proof remain undeclared repository gaps.
- Follow-up created: none.
- Archived on: 2026-04-24

### REPO-CLEANUP-2026-04-25 — Repository cleanup repair/sweep

- Archive outcome: completed
- Kind: Sweep
- Финальный status: archived
- Parent capability: Repository hygiene / AIDP repair
- Superseded by: n/a
- Cancelled because: n/a
- Почему существовало: пользователь попросил проверить весь репозиторий на оставшуюся чистку, затем разрешил применить найденные cleanup-пункты.
- Что изменилось:
  - repaired `.aidp/work.md`, which still described a mixed/dirty worktree after the repository had already become clean;
  - cleaned stale product-doc references to old local paths and obsolete worktree status claims;
  - converted product-doc links away from machine-specific absolute repo-root targets;
  - fixed broken product example links to the root `README.md`;
  - removed empty untracked source directories from `apps/admin` and `apps/web`;
  - removed only low-risk ignored local cache artifacts: `.DS_Store`, `.pytest_cache`, `.ruff_cache` and Python `__pycache__`.
- Выполненный proof:
  - pre-apply `git status --porcelain` was empty;
  - `docs/contracts/` was absent;
  - local markdown link check passed for 52 docs/.aidp markdown files after link cleanup;
  - `.aidp/os.yaml` parsed successfully after cleanup;
  - targeted stale-path searches confirmed no live product-doc references to old `docs/contracts`, old root runtime docs or `docs/data_scripts` remained.
- Cleanup:
  - intentionally left `.env.*`, `.idea`, `node_modules`, `.astro`, `dist`, `data/models`, `data/snapshots` and other potentially useful local runtime/build artifacts in place;
  - did not run broad `git clean -fdX`.
- Оставшиеся risks/gaps:
  - current cleanup changes remain unstaged/uncommitted until the operator commits or discards them;
  - runtime product gates were not run because no product code, migrations, root scripts or service contracts changed.
- Follow-up created: none.
- Archived on: 2026-04-25
