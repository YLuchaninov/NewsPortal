# History

Этот файл хранит durable detail по завершенной работе.

## Правила

- Completed detail переносится сюда, а не накапливается в `docs/work.md`.
- Когда completed item или capability больше не имеет truthful live next stage, archive sync должен происходить в текущем sync cycle, а не когда-нибудь потом.
- Завершенные записи не переоткрываются; для нового запроса создается новый work item.
- Запись должна сохранять причинно-следственную связь без опоры на chat history.
- Архив должен сохранять достаточно detail, чтобы completed item можно было понять без chat history.
- Активный контекст сжимается, архив — нет.
- Audit может предлагать перенос detail сюда, но не должен молча переписывать исторический смысл без явного approval.

## Completed items

### 2026-03-23 — C-AI-PROCESS-PACKAGE-REFRESH — Refresh package transfer and source-package retirement

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: пользователь запросил обновить агентные инструкции и связанную документацию из package в `init/`, но удалить package только после проверки всех связей и логики переноса.
- Что изменилось:
  - собран explicit transfer audit между `init/**` и root runtime core;
  - archive-sync semantics синхронизированы между `AGENTS.md`, `docs/work.md`, `docs/history.md`, `docs/verification.md` и `.aidp/os.yaml`;
  - `docs/contracts/README.md` расширен naming/template guidance, а в root добавлен `docs/contracts/SUBSYSTEM-CONTRACT-TEMPLATE.md`;
  - `README.md` синхронизирован сначала с временным pre-delete состоянием, затем с финальным after-retirement состоянием;
  - source package удален только после passed pre-delete audit, а live context очищен от process-refresh residue.
- Что проверено:
  - `git diff --check -- AGENTS.md README.md docs .aidp init`
  - `pnpm check:scaffold`
  - targeted `rg` consistency checks по archive-sync semantics, template availability и runtime references
  - explicit transfer audit с решением `migrate` / `already covered` / `do not migrate` для relevant `init/**`
- Риски или gaps:
  - `docs/history.md` намеренно сохраняет historical references к прошлым фазам удаления/возврата `init/`; это архивная правда, а не текущий runtime contract;
  - capability не решает unrelated product blockers вроде `test:normalize-dedup:compose` и mixed product worktree.
- Follow-up:
  - truthful next item остается прежним: разбор blocker в `pnpm integration_tests` / `test:normalize-dedup:compose`, затем повторный full acceptance для `C-MVP-MANUAL-READINESS`.

### 2026-03-23 — C-UI-REDESIGN — Full UI/UX redesign

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: пользователь запросил полный UI/UX redesign для web portal и admin panel без изменения существующих BFF/runtime boundaries.
- Что изменилось:
  - в `packages/ui` собрана реальная shadcn/ui component library;
  - `apps/web` переведен на multi-page shell с темами, toast-ами, interests/notifications/settings surfaces;
  - `apps/admin` переведен на sidebar-driven multi-page admin shell с новыми operational screens;
  - build/type surfaces для web/admin/ui синхронизированы под новый UI baseline.
- Что проверено:
  - `pnpm typecheck`
  - `pnpm unit_tests:ts`
- Риски или gaps:
  - manual browser verification для dark mode, sonner toasts, web-push connect flow и mobile admin sidebar остается вне automated proof;
  - full `pnpm integration_tests` по-прежнему блокируется unrelated `test:normalize-dedup:compose`, а не UI change itself.
- Follow-up:
  - none; дальнейшие UI задачи должны открываться новыми work items.

### 2026-03-23 — P-PROCESS-CLEANUP-1 — Очистка stale process residue после v2 migration

- Тип записи: patch archive
- Финальный статус: archived
- Зачем понадобилось: после перехода на runtime-core v2 в live docs оставался переходный migration residue, а в корне репозитория лежал системный `.DS_Store`.
- Что изменилось:
  - удален root `.DS_Store`;
  - `docs/work.md` сжат обратно к product-relevant live state без лишнего migration noise в `Why now` и `Recently changed`;
  - `docs/verification.md` очищен от слишком узкой привязки к `init/` и теперь фиксирует generic stale-runtime-path cleanup rule.
- Что проверено:
  - `git diff --check`
  - targeted `rg` review по surviving docs на stale migration/process residue
  - отсутствие `.DS_Store` в корне репозитория
- Риски или gaps:
  - архивные references к старым стадиям process migration и прошлому удалению `init/` сохранены намеренно как historical truth, а не считаются мусором.
- Follow-up:
  - none

### 2026-03-23 — C-AI-PROCESS-V2-MIGRATION — Миграция runtime core на v2 и русификация surviving docs

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: пользователь запросил перевести агентную разработку на новую версию process docs из `init/`, сохранить текущее live/archive состояние, мигрировать schema process-файлов и оставить surviving project documentation на русском.
- Что изменилось:
  - runtime core переведен на 7-file model: добавлен `docs/engineering.md`, а `AGENTS.md`, `docs/verification.md`, `docs/work.md` и `.aidp/os.yaml` синхронизированы с новой v2 schema;
  - `docs/blueprint.md` сохранен как master blueprint без template rewrite; в него добавлены только durable ссылки на companion docs `docs/engineering.md`, `docs/verification.md` и `docs/contracts/test-access-and-fixtures.md`;
  - добавлены repo-specific deep contract docs `docs/contracts/README.md` и `docs/contracts/test-access-and-fixtures.md`, которые фиксируют stateful backend test access, fixture creation и cleanup discipline;
  - `docs/work.md` мигрирован на новую live-state schema с `Primary active item`, `Secondary active item`, `Worktree coherence`, `Test artifacts and cleanup state` и explicit mixed-worktree truth;
  - `README.md` и `firebase_setup.md` синхронизированы с 7-file runtime core и новым engineering/test-access layering;
  - директория `init/` удалена после merge, но прежние архивные записи о ее прошлых состояниях сохранены как исторический факт.
- Разбивка по stages:
  - `S-AI-PROCESS-V2-1` — adopt new core contract in place
  - `S-AI-PROCESS-V2-2` — migrate live state and archive data to new schema
  - `S-AI-PROCESS-V2-3` — finish Russian documentation sweep, add contract docs and retire `init/`
- Что проверено:
  - `git diff --check`
  - `pnpm check:scaffold`
  - targeted `rg` consistency checks по surviving docs на старый 6-file runtime core, stale read/authority order, placeholder-like package text и runtime-ссылки на `init/`
- Риски или gaps:
  - `docs/history.md` намеренно сохраняет historical references к прошлому 6-file core и более раннему удалению `init/`; это архивная правда, а не текущий runtime contract;
  - migration сознательно не меняла application behavior, service boundaries или уже существующие product/proof gaps вроде `test:normalize-dedup:compose`.
- Follow-up:
  - truthful next product work остается прежним: разбор blocker в `pnpm integration_tests` / `test:normalize-dedup:compose`, затем повторный full acceptance для `C-MVP-MANUAL-READINESS`.

### 2026-03-22 — C-PROCESS-PROOF-AUDIT — Full process-proof audit

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: пользователь запросил проверить, что после нескольких завершенных phases runtime/process-документы и их proof-paths остаются исполнимыми и не дрейфуют от текущего состояния репозитория.
- Что изменилось:
  - audit выполнен как read-only pass без code/doc remediation beyond runtime-state sync;
  - authority chain и setup-safety повторно сверены между `AGENTS.md`, `docs/blueprint.md`, `docs/verification.md`, `.aidp/os.yaml`, `docs/work.md`, `README.md`, root `package.json`, фактической top-level структурой, entrypoints и compose services;
  - повторно подтвержден command truth для canonical repo-wide и heavy proof-команд, включая `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm unit_tests`, `pnpm integration_tests`, `pnpm test:ingest:multi:compose` и `pnpm test:ingest:soak:compose`;
  - canonical compose baseline и heavy acceptance harnesses повторно исполнены на текущем dirty worktree, а не только приняты по historical claims.
- Разбивка по stages:
  - `SPIKE-PROCESS-PROOF-AUDIT-1` — read-only audit по process truth, command truth и heavy proof executability
- Что проверено:
  - `pnpm check:scaffold`
  - `pnpm build`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm unit_tests`
  - `docker compose --env-file .env.dev -f infra/docker/compose.yml -f infra/docker/compose.dev.yml config --services`
  - `pnpm dev:mvp:internal`
  - `pnpm integration_tests`
  - `pnpm test:ingest:multi:compose`
  - `pnpm test:ingest:soak:compose`
  - explicit command-truth review against runtime docs, scripts, entrypoints и compose services
- Findings:
  - новых `process docs stale`, `repo drift`, `environment blocker` или `proof failure` finding-ов не выявлено;
  - runtime core остается initialized, setup mode не активен, documented command surface и heavy proof contract совпадают с observable repo state;
  - existing documented gaps остаются прежними: RSS-first acceptance scope, отсутствие root-level Python typecheck gate, зависимость Python lint от host-side `ruff`, зависимость heavy proofs от Docker/Firebase/loopback networking.
- Follow-up:
  - если пользователь захочет remediation, truthful next items — отдельный `Patch` на doc-sync только при появлении drift либо отдельные capabilities на Python typecheck gate или acceptance coverage beyond RSS-first;
  - сам audit не должен переоткрываться без нового verification запроса или нового наблюдаемого drift.

### 2026-03-22 — C-MULTI-RSS-FLOW — Multi-RSS full flow hardening

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: пользователь запросил проверить, чего не хватает для работы приложения с несколькими десятками RSS, и довести RSS-first path до доказанного full flow для 50-100 synthetic feeds.
- Что изменилось:
  - `services/fetchers` переведен на bounded-concurrency poll loop с all-settled semantics; channel-level failures теперь не прерывают весь due batch, а runtime baseline получил `FETCHERS_CONCURRENCY=4` и enlarged `FETCHERS_BATCH_SIZE=100`;
  - RSS parser теперь явно отвергает non-RSS payload, а RSS body selection учитывает `preferContentEncoded`;
  - admin RSS surface расширен до full channel contract: single create/update, bulk import JSON array, pause/resume, editable scheduler/config fields и operational observability по `last_fetch_at`, `last_success_at`, `last_error_at`, `last_error_message`;
  - `/channels` read API теперь отдает `poll_interval_seconds` и `config_json`, чтобы admin UI мог быть truth-backed при редактировании и обзоре каналов;
  - добавлены deterministic unit tests для scheduler concurrency/isolation и RSS admin payload validation;
  - добавлен compose-backed proof harness `infra/scripts/test-rss-multi-flow.mjs`, который через admin bulk endpoint поднимает 24- и 60-channel RSS scenarios с профилями `healthy`, `duplicate`, `not_modified`, `invalid_xml` и `timeout`.
- Разбивка по stages:
  - `S-MULTI-RSS-001` — scheduler hardening, RSS admin surface, multi-channel proof и runtime sync
- Что проверено:
  - `pnpm unit_tests`
  - `pnpm typecheck`
  - `pnpm lint:ts`
  - `pnpm test:ingest:multi:compose`
  - `pnpm test:ingest:soak:compose`
  - `git diff --check`
- Риски или gaps:
  - `website`, `api` и `email_imap` ingest по-прежнему не имеют сопоставимого multi-channel acceptance proof;
  - multi-channel RSS proofs зависят от Docker Compose access, локального loopback fixture server и валидных `FIREBASE_WEB_API_KEY` / `ADMIN_ALLOWLIST_EMAILS`;
  - root `pnpm lint` для Python части все еще требует отдельной host-side установки `ruff`.
- Follow-up:
  - если понадобится расширять ingest beyond RSS, следующий truthful capability — отдельный acceptance/proof arc для `website`, `api` или `email_imap` без смешивания их с уже доказанным RSS path

### 2026-03-22 — P-UNIT-COVERAGE-1 — Расширение root unit coverage

- Тип записи: patch archive
- Финальный статус: archived
- Зачем понадобилось: пользователь запросил проверить, что новые unit tests действительно логические, и расширить их beyond the initial minimal baseline.
- Что изменилось:
  - TS unit suite в `tests/unit/ts` теперь покрывает additional RSS helper edge cases: HTML entity decoding, markup stripping, whitespace collapse, fallback title и invalid date handling;
  - TS queue tests теперь покрывают downstream terminal routing contract и family classifiers для article / compile / review / feedback / reindex events;
  - Python compiler tests теперь покрывают default hard constraints и negative-path для missing negative prototypes;
  - Python scoring tests теперь покрывают overlap/place helper edge cases, exact threshold decisions, invalid datetime parsing, FTS normalization и `is_major_update`.
- Что проверено:
  - `pnpm unit_tests`
  - `git diff --check`
- Риски или gaps:
  - root `unit_tests` все еще остается pure-logic gate и не доказывает DB/Redis/queue/network boundaries
  - отдельный acceptance proof для `website`, `api` и `email_imap` ingest по-прежнему отсутствует
- Follow-up:
  - если дальше расширять unit coverage, следующий truthful шаг — добрать remaining pure helpers без смешивания их с integration behavior

### 2026-03-22 — C-ROOT-QA-GATES — Root-level QA gates

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: закрыть долгоживущий proof gap по отсутствию единых repo-level `lint`, `unit_tests` и `integration_tests` gate без расширения acceptance truth beyond RSS-first path.
- Что изменилось:
  - в корневой `package.json` добавлены canonical команды `pnpm lint`, `pnpm unit_tests` и `pnpm integration_tests`, плюс helper scripts для TS и Python частей;
  - добавлен root `eslint.config.mjs` для TS/Astro/infra scripts с first-pass minimal ruleset и root `ruff.toml` для Python services;
  - добавлен `infra/docker/python.dev-requirements.txt`, который фиксирует отдельный host-side QA dependency path для `ruff`;
  - созданы deterministic root unit suites для `services/fetchers/src/rss.ts`, `packages/contracts/src/queue.ts`, `services/ml/app/embedding.py`, `services/ml/app/compiler.py` и `services/workers/app/scoring.py`;
  - `pnpm integration_tests` зафиксирован как thin alias на existing `pnpm test:mvp:internal`, а README, verification и machine facts синхронизированы с новым root QA contract;
  - из `infra/scripts/test-mvp-internal.mjs` удалены мертвые локальные переменные, мешавшие прохождению lint.
- Разбивка по stages:
  - `S-ROOT-QA-GATES-1` — root tooling, unit baseline, gate proof и runtime sync
- Что проверено:
  - `python -m pip install --target /tmp/newsportal-pyqa -r infra/docker/python.dev-requirements.txt`
  - `pnpm lint`
  - `pnpm unit_tests`
  - `pnpm integration_tests`
  - `git diff --check`
- Риски или gaps:
  - root `pnpm lint` для Python части зависит от отдельной host-side установки `ruff`; одного `pnpm install` недостаточно
  - repo по-прежнему не имеет root-level Python typecheck gate, сопоставимого с `pnpm typecheck`
  - `pnpm integration_tests` сознательно остается RSS-first acceptance proof; `website`, `api` и `email_imap` ingest требуют отдельного capability и отдельного proof
- Follow-up:
  - если понадобится дальше усиливать QA baseline, следующими truthful candidates являются отдельный Python typecheck gate или отдельная capability на acceptance coverage beyond RSS-first

### 2026-03-22 — C-MVP-READY — Internal MVP readiness

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: довести локальный polyglot baseline до near-release внутреннего MVP-теста с одним реально работающим live delivery channel.
- Что изменилось:
  - `apps/web` и `apps/admin` переведены на SSR build/runtime через Astro Node adapter и built-server Docker runtime;
  - canonical internal/dev baseline закреплен как `pnpm dev:mvp:internal`, который запускает `docker compose --env-file .env.dev -f infra/docker/compose.yml -f infra/docker/compose.dev.yml ...`;
  - admin bootstrap больше не требует ручного SQL: `ADMIN_ALLOWLIST_EMAILS` выдает локальную роль `admin` при первом successful Firebase sign-in, при этом exact allowlisted email допускает repeatable `+alias` sign-in для internal tests;
  - internal acceptance scope зафиксирован как RSS-first, а deterministic RSS fixture перенесен во `web` runtime, чтобы compose stack ходил по in-network URL;
  - `mailpit` добавлен в dev baseline как live SMTP sink для `email_digest` и подключен к `app_net`;
  - `services/workers/app/delivery.py` выровнен с env contract: `smtp://` теперь означает plain SMTP, а `smtp+starttls://` остается explicit path для TLS upgrade;
  - `infra/scripts/test-mvp-internal.mjs` научен явно загружать `.env.dev`, проверять compose-only health paths, падать с реальной причиной delivery failure и доказывать user/admin happy path, RSS ingest, Mailpit delivery и moderation audit.
- Разбивка по stages:
  - `S-MVP-READY-1` — runtime/auth/compose/email foundation и final end-to-end proof
- Что проверено:
  - `pnpm check:scaffold`
  - `pnpm typecheck`
  - `pnpm build`
  - `git diff --check`
  - `docker compose --env-file .env.dev -f infra/docker/compose.yml -f infra/docker/compose.dev.yml config --services`
  - `pnpm test:ingest:compose`
  - `pnpm test:mvp:internal`
- Риски или gaps:
  - отсутствует единый repo-level `lint` gate
  - отсутствуют единые repo-level `unit_tests` и `integration_tests`
  - internal MVP acceptance по-прежнему покрывает только RSS-first ingest path; `website`, `api` и `email_imap` требуют отдельного proof
- Follow-up:
  - для новой capability заводить новый work item в `docs/work.md`; текущая readiness capability завершена и не должна переоткрываться без нового запроса

### 2026-03-22 — C-AI-INIT — Базовая инициализация AI runtime-core

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: внедрить compact runtime core поверх существующего NewsPortal без потери архитектурной истины из `docs/blueprint.md`.
- Что изменилось:
  - `AGENTS.md` объединен с runtime-contract шаблона и переведен на русский.
  - Добавлены `docs/work.md`, `docs/verification.md`, `docs/history.md` и `.aidp/os.yaml`.
  - В начало `docs/blueprint.md` добавлен runtime-core summary без замены основного blueprint.
  - `README.md` переведен на русский и дополнен разделом про runtime core.
- Разбивка по stages:
  - `S-AI-INIT-1` — merge contract в `AGENTS.md`
  - `S-AI-INIT-2` — заполнение `.aidp/os.yaml` и `docs/verification.md`
  - `S-AI-INIT-3` — добавление `docs/work.md`, `docs/history.md` и summary в `docs/blueprint.md`
  - `S-AI-INIT-4` — русификация touched docs, финальная синхронизация и выход из `setup mode`
- Что проверено:
  - content consistency review runtime core
  - `git diff --check`
  - `pnpm check:scaffold`
- Открытые gaps:
  - отсутствует единый repo-level `lint` gate
  - отсутствуют единые repo-level `unit_tests`, `integration_tests` и `smoke` gates
- Follow-up:
  - следующая implementation work должна начинаться с нового явного work item в `docs/work.md`

### 2026-03-22 — P1 — Удаление template-директории init

- Тип записи: patch archive
- Финальный статус: archived
- Зачем понадобилось: после инициализации runtime-core исходная template-директория стала лишней и могла путать рабочий runtime context с историческим шаблоном.
- Что изменилось:
  - директория `init/` удалена из репозитория;
  - `AGENTS.md`, `README.md` и `docs/work.md` синхронизированы с тем, что runtime-core полностью живет в корне, `docs/` и `.aidp/`;
  - повторно проверена корректность инициализации документации после cleanup.
- Что проверено:
  - отсутствие `init/` в рабочем дереве
  - отсутствие рабочих ссылок на `init/` в runtime-core docs
  - `init/` удален из git-индекса через `git rm -r --cached --ignore-unmatch init`
  - `git diff --check`
  - `pnpm check:scaffold`
- Риски или gaps:
  - единые repo-level `lint`, `unit_tests`, `integration_tests` и `smoke` gates по-прежнему отсутствуют
- Follow-up:
  - none

### 2026-03-22 — P-FIREBASE-SETUP-DOC — Руководство по настройке Firebase

- Тип записи: patch archive
- Финальный статус: archived
- Зачем понадобилось: пользователь запросил точный пошаговый маршрут по Firebase Console и отдельный repo-local guide, чтобы без догадок снять блокер по `FIREBASE_WEB_API_KEY` и first-run admin sign-in.
- Что изменилось:
  - в корне репозитория добавлен `firebase_setup.md`;
  - guide фиксирует, какие сервисы Firebase реально нужны для текущего NewsPortal MVP;
  - guide показывает точный console path для получения `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_API_KEY`, включения `Anonymous` и `Email/Password`, а также создания admin user и заполнения `ADMIN_ALLOWLIST_EMAILS`;
  - `docs/work.md` синхронизирован так, чтобы следующий агент видел новый guide как ближайший путь для разблокировки `S-MVP-READY-1`.
- Что проверено:
  - `firebase_setup.md` создан в корне репозитория
  - содержимое guide согласовано с текущим env contract из `.env.example`
  - содержимое guide согласовано с фактическим использованием Firebase в `apps/web/src/lib/server/auth.ts` и `apps/admin/src/lib/server/auth.ts`
- Риски или gaps:
  - Firebase Console может слегка менять визуальные названия разделов, но durable route через `Project settings`, `Your apps` и `Authentication` остается актуальным
  - `FIREBASE_CLIENT_CONFIG` и `FIREBASE_ADMIN_CREDENTIALS` пока не используются кодом и остаются документированы как не обязательные для текущего MVP
- Follow-up:
  - пройти шаги из `firebase_setup.md`, обновить `.env.dev` и повторно запустить `pnpm test:mvp:internal`
