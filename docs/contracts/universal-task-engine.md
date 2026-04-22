# Universal Task Engine Contract

Этот документ фиксирует durable truth для capability `C-UNIVERSAL-TASK-ENGINE`.

## Назначение

Universal Task Engine вводит sequence-based execution model для NewsPortal: декларативные `TaskGraph`-последовательности, единый `q.sequence` runtime, plugin registry и run/task-run observability.

## Почему нужен отдельный contract doc

- Подсистема меняет сразу data model, worker orchestration, relay handoff shape и maintenance API.
- Миграция растянута на несколько stages; truth нельзя надежно держать только в `docs/blueprint.md` и `docs/work.md`.
- К этой подсистеме придется регулярно возвращаться из разных чатов и work items.

## In scope

- таблицы `sequences`, `sequence_runs`, `sequence_task_runs`;
- `TaskGraph` contract, reserved context keys и `_stop` early termination;
- `TaskPlugin` / registry / executor boundaries;
- `q.sequence` queue payload и run lifecycle persistence;
- sequence-trigger routing shape для relay;
- internal/maintenance API для sequence management и run observability;
- stage-by-stage cutover discipline от legacy queue fanout к default sequence runtime.

## Out of scope

- discovery/enrichment plugin behavior beyond their own task contracts;
- arbitrary DAG/branching workflow execution semantics beyond the current linear `TaskGraph` runtime;
- agent UX specifics сверх catalog/run API;
- удаление legacy queue/event contracts до финального cutover stage.

## Current rollout truth

- `NEW_ARCHITECTURE.md` остается proposal/reference input, но durable repo-owned truth для этой capability живет здесь и в runtime core.
- `UTE-S1` through `UTE-S7` landed the additive foundation, plugin catalog, relay/API prep, discovery adapters, and cron/agent surfaces.
- `UTE-S8` completed the runtime cutover: relay now treats sequence-managed triggers as default sequence-routing events, worker startup defaults to `q.sequence` consumption plus DB-backed cron polling, and legacy queue consumers are opt-in only.
- Active default sequences are seeded and activated via `0011_sequence_engine_default_sequences.sql` and `0012_sequence_engine_cutover_defaults.sql`:
  - article ingest pipeline
  - LLM review resume pipeline
  - interest compile
  - criterion compile
  - feedback ingest
  - reindex
- `0016_adaptive_discovery_cutover.sql` keeps discovery on the same engine by reseeding the maintenance-owned discovery orchestrator plus the reusable RSS and website child sequences; discovery domain truth itself now lives in `docs/contracts/discovery-agent.md`.
- `0015_article_enrichment.sql` keeps the active article lane on the same trigger `article.ingest.requested`, but prepends fetchers-owned `enrichment.article_extract` before `article.normalize`; this is a task-graph change inside the existing default sequence, not a new default trigger or a fetchers-side queue runtime.
- Default managed runtime path is now:
  `outbox_events -> relay sequence lookup -> sequence_runs -> q.sequence -> TaskGraph plugins/legacy handler adapters`.
- Direct fallback queue fanout remains only for non-sequence events such as `foundation.smoke.requested` and `source.channel.sync.requested`.
- Legacy intermediate article events (`article.normalized`, `article.embedded`, `article.criteria.matched`, `article.clustered`, `article.interests.matched`) remain compatibility constants only; relay no longer maps them in the default fallback fanout, and sequence runtime suppresses their default outbox emission.
- Capability implementation is complete; future changes to sequence runtime, discovery rollout or operator UX must open new bounded items instead of silently reopening this capability.

## External contract

### Data model

- `sequences`
  Хранит sequence definition, `task_graph`, status, optional `trigger_event`, optional `cron`, optional `editor_state`, counters и metadata.
- `sequence_runs`
  Хранит один запуск sequence, trigger metadata, accumulated/final `context_json`, run status, timestamps, optional `retry_of_run_id` и error.
- `sequence_task_runs`
  Хранит lifecycle отдельной задачи внутри run: input snapshot, output snapshot, status, duration и error.

### Queue contract

- `q.sequence` — единственная очередь для Sequence Runner.
- Job payload остается thin и ID-based: `jobId`, `runId`, `sequenceId`.
- `q.sequence` не заменяет outbox. Triggered execution все равно стартует из PostgreSQL truth и relay handoff.
- Для sequence-managed events отсутствие active sequence route считается relay failure, а не soft fallback/silent skip.
- Sequence-managed trigger set в current runtime:
  - `article.ingest.requested`
  - `interest.compile.requested`
  - `criterion.compile.requested`
  - `llm.review.requested`
  - `notification.feedback.recorded`
  - `reindex.requested`

### TaskGraph contract

- `TaskGraph` — упорядоченный массив задач.
- Каждая задача содержит `key`, `module`, `options`, optional `enabled`, optional `retry`, optional `timeout_ms`, optional human-facing `label`, and optional operator `notes`.
- `module` должен существовать в registry.
- `key` должен быть уникален внутри sequence.
- Repo-consistent module naming для discovery/enrichment stages использует dotted IDs (`discovery.*`, `utility.db_store`, `enrichment.*`), а не PascalCase proposal names из `NEW_ARCHITECTURE.md`.

### Context contract

- Executor передает mutable context от задачи к задаче.
- Reserved keys:
  - `_sequence_id`
  - `_run_id`
  - `_task_key`
  - `_task_index`
  - `_trigger_type`
  - `_trigger_meta`
- `_stop` разрешен как control flag для normal early termination и не считается failure.
- Pipeline plugins продолжают читать article/business truth из PostgreSQL по thin identifiers вроде `doc_id`, а не из больших queue payloads.

## Internal responsibility boundaries

- Relay остается владельцем outbox polling, idempotent publish handoff и eventual sequence lookup.
- Relay обязан fail-ить sequence-managed outbox event, если для него нет active sequence route; direct fallback допустим только для non-sequence events.
- Sequence Runner остается владельцем linear traversal, retries/timeouts, context merge и run/task-run persistence.
- Task plugins остаются self-contained execution units и не должны брать на себя обязанности relay или global scheduler.
- Sequence management API остается internal/maintenance surface, пока capability явно не расширит public client contract.
- Astro admin operator UX for shipped sequence control lives on `/automation` with same-origin BFF writes under `/admin/bff/admin/automation`; it must reuse the same maintenance contracts instead of inventing a parallel runtime path.
- The shipped operator UX is now a multi-route visual workspace:
  - `/automation` overview/library
  - `/automation/templates` template gallery
  - `/automation/{sequenceId}` visual editor
  - `/automation/{sequenceId}/executions` workflow-scoped execution history
- This workspace may use a presentational graph/canvas model, but `task_graph` remains the execution source of truth; saved `editor_state` is additive operator metadata and must not silently broaden runtime execution semantics.
- Legacy handlers и новые plugins могут временно coexist only during staged migration; их boundaries должны быть explicit, а не hidden.

## Maintenance API contract

- Sequence management endpoints живут только под internal `/maintenance/*` surface.
- Current additive endpoint set:
  - `/maintenance/sequences`
  - `/maintenance/sequences/{sequence_id}`
  - `/maintenance/sequences/{sequence_id}/runs`
  - `/maintenance/sequence-runs/{run_id}`
  - `/maintenance/sequence-runs/{run_id}/task-runs`
  - `/maintenance/sequence-runs/{run_id}/cancel`
  - `/maintenance/sequence-runs/{run_id}/retry`
  - `/maintenance/sequence-plugins`
  - `/maintenance/agent/sequence-tools`
  - `/maintenance/agent/sequences`
- `DELETE /maintenance/sequences/{sequence_id}` является soft-archive operation, а не hard delete.
- Manual run path обязан сначала создать `sequence_runs` row в PostgreSQL, а уже потом делать best-effort enqueue в `q.sequence`.
- Если dispatch не удался, API обязано пометить созданный run как `failed` с recorded dispatch error, а не оставлять silent pending row.
- До отдельной runtime stage cooperative cancellation truthfully поддерживается только для `pending` runs; `running` runs через API пока не прерываются.
- Failed-run retry must reuse the same persisted sequence definition and create a new `sequence_runs` row linked through `retry_of_run_id`; retry does not mutate the original failed run in place.
- First-class admin operator reads may aggregate FastAPI/SDK sequence state with recent run/outbox visibility, but write actions still must flow through the same maintenance API and explicit audit logging path.
- Agent create/run path обязан reuse-ить те же `create sequence -> create sequence_run -> enqueue q.sequence -> read run` contracts, а не bypass-ить их отдельным in-memory orchestration path.
- Agent-created sequences на текущем additive stage создаются как `draft` by default; последующий live activation остаётся вопросом более позднего cutover/operator stage.
- Adjacent maintenance endpoints, которые перезапускают existing business pipelines через manual sequence runs, обязаны сохранять ту же truth discipline: если downstream legacy idempotency tables ожидают persisted `event_id`, maintenance path сначала materialize-ит compatible outbox truth, а потом создает `sequence_run`.

## Discovery and enrichment plugin contract

- `UTE-S6` intentionally lands additive plugin contracts plus deterministic unit proof, а не live provider rollout.
- Network-, LLM- и DB-heavy plugins (`discovery.web_search`, `discovery.url_validator`, `discovery.rss_probe`, `discovery.website_probe`, `discovery.content_sampler`, `discovery.llm_analyzer`, `discovery.source_registrar`, `utility.db_store`, `enrichment.article_loader`, `enrichment.article_enricher`) обязаны идти через pluggable runtime adapters.
- Default runtime adapters могут truthfully сообщать, что provider/runtime integration еще не configured; это не считается cutover bug до отдельной rollout stage.
- `discovery.relevance_scorer` остается deterministic local scorer внутри discovery child pipelines; richer discovery scoring policy lives in `docs/contracts/discovery-agent.md` and must not bypass the existing plugin/task boundary.
- Source registration по-прежнему не должно bypass-ить PostgreSQL + outbox discipline; adapter boundary нужен именно для сохранения этого ownership, а не для прямых side effects в plugin code. Discovery rollout widens this boundary with explicit `provider_type` ownership so website-origin candidates can either stay `website` or collapse to hidden-RSS `rss` registration without bypassing `source_channels`, `source_channel_runtime_state` and outbox sync semantics.
- Post-cutover article enrichment contract now uses `enrichment.article_extract` as the first task of the active article ingest sequence. Этот plugin вызывает fetchers internal HTTP endpoint, сохраняет thin `doc_id`/`event_id` context discipline, не берет ownership над queue consumption, и оставляет `services/fetchers` единственным owner-ом full-article/media extraction plus enrichment-owned `article_media_assets` rewrites.

## Discovery orchestration adjunct

- Discovery orchestration stays maintenance-only and additive on top of the engine; it does not introduce a parallel in-memory scheduler or direct admin-to-worker side channel.
- Discovery domain model, registry semantics, source profiling/scoring and portfolio/feedback truth live in `docs/contracts/discovery-agent.md`; this document only governs the UTE boundary that discovery reuses.
- UTE-owned orchestrator plugin surface is:
  - `discovery.plan_hypotheses`
  - `discovery.execute_hypotheses`
  - `discovery.evaluate_results`
- `discovery.re_evaluate_sources`
- Worker-side orchestration must reuse the task-engine repository/service layer to create child `sequence_runs`, read task outputs and update persisted run state; importing FastAPI helpers into worker runtime is forbidden.
- Discovery admin/API surface lives under `/maintenance/discovery/*`; Astro admin keeps the repo-wide pattern of same-origin BFF writes with explicit audit logging, while direct read surfaces stay on FastAPI/SDK.
- Adjunct runtime boundary remains part of the contract:
  - `DISCOVERY_ENABLED=false` keeps live runtime disabled;
  - `DISCOVERY_SEARCH_PROVIDER=ddgs` is the default live-provider contract while runtime stays disabled until explicitly enabled;
  - discovery search must keep `stub` as a supported rollback/test provider;
  - discovery planning/source-evaluation LLM usage must read dedicated `DISCOVERY_GEMINI_*` and `DISCOVERY_LLM_*` envs first, then fall back to legacy Gemini/LLM envs;
  - discovery monthly quota is enforced as a UTC calendar-month hard cap on new external discovery calls, separate from per-mission budgets;
  - approved sources must still register only through PostgreSQL + outbox `source.channel.sync.requested`.

## Data and state rules

- PostgreSQL остается source of truth для sequence definitions, run state и business state.
- Redis/BullMQ остается transport/retry layer; queue state не становится authoritative run history.
- Executor должен терпимо переживать короткий post-commit visibility lag между `sequence_runs` insert и worker-side `get_run`, retry-ируя short lookup window перед тем как объявить run missing.
- Pipeline plugins обязаны сохранять текущие business invariants:
  - PostgreSQL-first write path;
  - outbox/inbox idempotency;
  - `system_feed_results` как upstream system gate;
  - criteria-gated clustering;
  - historical backfill with frozen target snapshot;
  - no silent retro-notifications.
- Manual article enrichment retry использует тот же active article sequence и тот же sequence-first runtime: FastAPI maintenance path materialize-ит published synthetic `article.ingest.requested` outbox row, создает manual `sequence_run` с `force_enrichment=true`, а затем dispatch-ит его через Redis-backed `q.sequence`.
- Historical enrichment-enabled repair не вводит новый trigger или отдельный queue runtime: maintenance backfill reuse-ит frozen `reindex_job_targets` snapshot, вызывает fetchers-owned `enrichment.article_extract` через existing internal contract, затем replay-ит `normalize -> dedup -> embed -> criteria -> criterion review -> cluster -> interests` внутри maintenance lane без `notify` stage.
- После `UTE-S8` default runtime не должен повторно публиковать legacy intermediate article events во время sequence execution; их возврат допустим только как explicit opt-in compatibility path, а не как silent default.

## Runtime and delivery considerations

- Worker-side engine code живет под `services/workers/app/task_engine/`.
- После `UTE-S8` `services/workers/app/main.py` truthfully boot-ит sequence runtime по умолчанию:
  - `WORKER_ENABLE_SEQUENCE_RUNNER=true` by default
  - `WORKER_ENABLE_SEQUENCE_CRON_SCHEDULER=true` by default
  - `WORKER_ENABLE_LEGACY_QUEUE_CONSUMERS=false` by default
- Compatibility/runtime flags остаются:
  - `WORKER_ENABLE_SEQUENCE_RUNNER`
  - `WORKER_ENABLE_SEQUENCE_CRON_SCHEDULER`
  - `WORKER_ENABLE_LEGACY_QUEUE_CONSUMERS`
  - `WORKER_SEQUENCE_RUNNER_CONCURRENCY`
  - `WORKER_SEQUENCE_RUNNER_LOCK_DURATION_MS`
  - `WORKER_SEQUENCE_RUNNER_STALLED_INTERVAL_MS`
  - `WORKER_SEQUENCE_CRON_POLL_INTERVAL_SECONDS`
- Long-running sequence lanes such as discovery and website extraction must not rely on BullMQ's 30s default worker lock window; the shipped worker baseline now extends the `q.sequence` lock/stall window to 300000ms and still keeps DB-backed run claiming authoritative so duplicate job pickup cannot re-start the same `run_id`.
- Relay default runtime after `UTE-S8` truthfully uses sequence routing unless `RELAY_ENABLE_SEQUENCE_ROUTING` is explicitly disabled.
- Compose/runtime baselines, в которых API surface умеет создавать manual sequence runs, должны давать `services/api` доступ к Redis, потому что maintenance dispatch path enqueue-ит `q.sequence` jobs напрямую после DB write.
- Cron polling/bootstrap остаётся DB-backed and minute-based: scheduler перечитывает active cron sequences из PostgreSQL, создаёт `sequence_runs` only for the currently due minute, записывает `trigger_meta.scheduledFor` и dispatch-ит в `q.sequence`; missed catch-up/backfill scheduling не считается реализованным до более поздней capability.
- Additive SQL migrations `0010` and `0011` laid the foundation; `0012` is the cutover activation migration that turns seeded default sequences live.
- На plugin-migration stages допустим adapter pattern: pipeline plugins могут временно вызывать legacy `process_*` handlers через thin job-shim, если это сохраняет существующие side effects и дает parity-friendly extraction без runtime switch.
- Эти adapter plugins не должны фабриковать synthetic outbox identity внутри себя: если legacy handler пишет в inbox idempotency tables, `event_id` обязан приходить из уже существующей persisted outbox truth или из explicit test shim/proof harness.

## Failure modes

- Docs/runtime drift: contract говорит про sequence default, а code/runtime все еще живет на legacy queues.
- Hidden dual execution: relay или worker path accidentally запускает и legacy handler, и sequence run.
- Context drift: plugin writes critical state only into context instead of PostgreSQL.
- Lost observability: run/task-run tables есть, но executor не пишет lifecycle truth.
- Historical repair drift: reindex/backfill теряет frozen snapshot semantics или отправляет retro-notifications.

## Minimum proof expectations

- `UTE-S1` foundation without runtime cutover:
  - `pnpm unit_tests`
  - `pnpm typecheck`
  - targeted TS coverage for new queue/task-graph contracts
  - Python executor unit coverage for lifecycle, `_stop`, retry and timeout behavior
- `UTE-S2` / `UTE-S3` plugin migration without relay cutover:
  - targeted Python adapter coverage for payload mapping and normalized context outputs
  - `pnpm unit_tests`
  - existing default runtime ownership remains on legacy queues/handlers
- `UTE-S4` relay prep without live switch:
  - targeted relay routing coverage for active sequence lookup, run creation and `q.sequence` payloads
  - `pnpm unit_tests`
  - `pnpm typecheck`
  - runtime default keeps `RELAY_ENABLE_SEQUENCE_ROUTING=false`
- `UTE-S5` internal sequence API without runtime cutover:
  - targeted Python API coverage for sequence CRUD/archive semantics, manual run status mapping, pending-only cancel behavior, task-run detail and plugin catalog
  - `pnpm unit_tests`
  - runtime default keeps legacy worker startup and legacy relay routing unless separately switched in later stages
- `UTE-S6` discovery/enrichment plugins without live provider rollout:
  - targeted Python coverage for discovery/enrichment plugin contracts, deterministic adapter boundaries and end-to-end fake-runtime sequence execution
  - `pnpm unit_tests`
  - runtime default keeps legacy relay/worker routing, and live external-provider smoke remains out of scope unless a later stage explicitly introduces it
- Adaptive discovery adjunct on top of the cutover engine:
  - follow `docs/contracts/discovery-agent.md` for discovery-domain proof contour;
  - UTE-specific expectation is that discovery continues to prove sequence-managed child-run creation, plugin execution, and PostgreSQL-first source registration without bypassing `q.sequence` or outbox discipline.
- `UTE-S7` cron and agent integration without cutover:
  - targeted Python coverage for cron parsing, minute-based due-sequence polling/bootstrap, dispatch-failure handling, sequence job payload processing, agent draft-sequence create/run contract and agent tool catalog surface
  - `pnpm unit_tests`
  - runtime default keeps `WORKER_ENABLE_SEQUENCE_RUNNER=false`, `WORKER_ENABLE_SEQUENCE_CRON_SCHEDULER=false` and legacy relay/worker routing unless a later stage explicitly flips them
- `UTE-S8` final cutover:
  - `pnpm unit_tests`
  - `pnpm typecheck`
  - `pnpm test:migrations:smoke`
  - `pnpm test:relay:compose`
  - `pnpm test:relay:phase3:compose`
  - `pnpm test:relay:phase45:compose`
  - `pnpm test:ingest:compose`
  - `pnpm test:normalize-dedup:compose`
  - `pnpm test:interest-compile:compose`
  - `pnpm test:criterion-compile:compose`
  - `pnpm test:cluster-match-notify:compose`
  - explicit proof that default runtime suppresses legacy intermediate article fanout while preserving inbox/idempotency and `system_feed_results` gating
- Post-cutover admin/operator surface changes on this boundary must additionally rerun `node infra/scripts/test-automation-admin-flow.mjs`, so the shipped automation workspace routes and sequence/outbox UX stay aligned with the maintenance contract.
- Plugin migration stages:
  использовать parity-oriented proof against current handler behavior plus existing worker smoke paths where relevant.
- Broader umbrella `pnpm integration_tests` remains desirable, but unrelated failures outside the sequence/runtime boundary may stay as explicitly recorded residuals once all cutover-specific proofs above pass.

## Related files

- `NEW_ARCHITECTURE.md`
- `docs/contracts/discovery-agent.md`
- `docs/work.md`
- `docs/blueprint.md`
- `packages/contracts/src/queue.ts`
- `database/migrations/0010_sequence_engine_foundation.sql`
- `services/workers/app/task_engine/`
- `services/relay/src/relay.ts`
- `services/api/app/main.py`

## Update triggers

Обновляй этот contract doc, когда меняются:

- sequence data model или status model;
- `TaskGraph` shape или reserved context keys;
- `q.sequence` payload contract;
- relay-to-sequence handoff semantics;
- plugin lifecycle rules;
- cutover strategy или rollout truth;
- minimum proof expectations для sequence engine stages.
