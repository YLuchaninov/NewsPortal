# History

Этот файл хранит долговечную историю завершенной AIDP-работы. Live state держи в `.aidp/work.md`.

## Свежесть архива

- Последняя проверка архива: 2026-04-24
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
  - product/reference docs under `docs/contracts/*` still exist as old reference material and may be deleted/rewired only under a separate docs cleanup item;
  - runtime/product gates were not executed because repair changed AIDP docs only.
- Follow-up created: none.
- Archived on: 2026-04-24

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
