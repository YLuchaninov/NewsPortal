# Контракт universal task engine

Этот contract обязателен, когда работа трогает `sequences`, `sequence_runs`, `sequence_task_runs`, `q.sequence`, task plugins, relay sequence routing, sequence maintenance API, automation workspace or worker sequence runtime.

## Назначение

Universal Task Engine is the sequence-based execution model for NewsPortal: declarative `TaskGraph`, single `q.sequence` runtime, plugin registry and run/task-run observability.

## Current rollout truth

- UTE foundation through final cutover is shipped.
- Default managed runtime path:
  `outbox_events -> relay sequence lookup -> sequence_runs -> q.sequence -> TaskGraph plugins/legacy handler adapters`.
- Active default sequences are seeded/activated by migrations `0011` and `0012`.
- Discovery and enrichment use the same engine through later migrations.
- Direct fallback queue fanout remains only for non-sequence events such as `foundation.smoke.requested` and `source.channel.sync.requested`.
- Legacy intermediate article events are compatibility constants and not default fallback fanout.

## Data model

- `sequences`: definition, `task_graph`, status, trigger event, cron, editor state, counters and metadata.
- `sequence_runs`: one run, trigger metadata, context, status, timestamps, retry link and error.
- `sequence_task_runs`: lifecycle of each task with input/output snapshots, status, duration and error.

## Queue and TaskGraph contract

- `q.sequence` is the only queue for Sequence Runner.
- Payload is thin and ID-based: `jobId`, `runId`, `sequenceId`.
- `q.sequence` does not replace outbox; triggered execution starts from PostgreSQL truth and relay handoff.
- Missing active sequence route for sequence-managed event is relay failure, not silent skip.
- `TaskGraph` is ordered tasks with unique `key`, registered `module`, options, optional enable/retry/timeout/label/notes.
- Reserved context keys include `_sequence_id`, `_run_id`, `_task_key`, `_task_index`, `_trigger_type`, `_trigger_meta`; `_stop` is normal early termination.

## Responsibility boundaries

- Relay owns outbox polling and sequence lookup/handoff.
- Sequence Runner owns traversal, retries/timeouts, context merge and run/task-run persistence.
- Task plugins are self-contained execution units and must not become relay or scheduler.
- Maintenance API owns sequence CRUD/run/read/cancel/retry.
- Admin `/automation` visual workspace may store `editor_state`, but `task_graph` remains execution truth.

## Discovery/enrichment adjunct

Discovery domain truth lives in `.aidp/contracts/discovery-agent.md`; UTE only governs sequence/plugin boundary. Fetchers remain owner of full article/media extraction when `enrichment.article_extract` calls fetchers internal endpoint.

## Runtime flags

Current important flags include `WORKER_ENABLE_SEQUENCE_RUNNER`, `WORKER_ENABLE_SEQUENCE_CRON_SCHEDULER`, `WORKER_ENABLE_LEGACY_QUEUE_CONSUMERS`, `WORKER_SEQUENCE_RUNNER_CONCURRENCY`, lock/stall durations and cron poll interval.

Relay uses sequence routing by default unless explicitly disabled.

## Failure modes

- Contract says sequence default but runtime still uses legacy queues.
- Hidden dual execution of legacy handler and sequence run.
- Critical state written only into context instead of PostgreSQL.
- Run/task-run observability not persisted.
- Historical repair loses frozen snapshots or sends retro notifications.

## Proof expectations

- Runtime/queue changes: `pnpm unit_tests`, `pnpm typecheck`, relay tests and relevant compose smoke.
- Final/default runtime changes: migration smoke, relay compose phase tests, ingest/normalize/interest/criterion/cluster smoke as relevant.
- Admin automation changes: `node infra/scripts/test-automation-admin-flow.mjs`.
- Plugin migrations: parity-oriented proof against current handler behavior plus existing worker smoke paths.

## Update triggers

Update when sequence data/status model, `TaskGraph`, context keys, `q.sequence` payload, relay handoff, plugin lifecycle, cutover strategy, automation UX ownership or UTE proof expectations change.
