# Discovery vNext Contract

## Canon

Discovery vNext is the only active operator-facing discovery truth. It uses typed artifacts, vNext runs, candidates, source inventory, probe reports, source understanding, routing decisions, adapter backlog, feedback, replay and rollback.

Applied historical migrations may still describe older schemas as migration history. Active runtime code, API, MCP, Admin UI, operator docs, scripts and tests must not expose older discovery concepts or compatibility paths.

## Durable Model

- `discovery_vnext_runs`: bounded run metadata for brief compile, mega loop, candidate acquisition, probe, understand/route, replay, rollback and full runs.
- `discovery_run_steps`: resumable per-step runtime events for full and step-specific runs, including status, policy version, live/dry-run mode, budget and result/error payloads.
- `discovery_artifacts`: append-only typed artifacts with schema version, lineage and validation JSON. Supported artifact types are `DiscoveryBrief`, `HypothesisBatch`, `ProbePlan`, `ProbeReport`, `SourceUnderstanding`, `RoutingDecision` and optional `QueryQualityReport`.
- `discovery_candidates`: normalized candidate sources with dedupe, rediscovery count, acquisition evidence and artifact links.
- `discovery_query_attempts`: durable search/acquisition audit rows with query family, provider, status, provider response/error, cost estimates and result counts.
- `discovery_llm_gateway_events`: durable LLM audit rows with task, prompt hash/payload metadata, model, token/cost estimates, output validation and artifact lineage.
- `source_inventory`: durable source truth for inventory state, current provider type, linked understanding/routing artifacts, registered channel and risk/monitoring metadata.
- `source_monitoring_state` and `source_observations`: cheap watch/probation/stable monitoring state and observations.
- `discovery_policies`: versioned routing, probe, mega-loop, risk, rollback and permissions policies. Missing or invalid required policy is fail-closed.
- `adapter_backlog`: durable work queue for sources requiring auth, browser support, parser work, custom adapter or unsupported format handling.
- `discovery_feedback_events`, `discovery_replay_runs`, `discovery_rollback_groups`, `discovery_rollback_actions`, `discovery_vnext_eval_runs`: operator feedback, non-live replay, rollback and eval metadata.

## Runtime Rules

- `DiscoveryBrief` must be domain-neutral and compiled from system interests without hardcoded domain routing.
- Required active policies are resolved from `discovery_policies` for runtime steps. Missing or invalid required policy is a closed failure, not a code-default fallback.
- Live search/LLM execution is an operator path only when `DISCOVERY_ENABLED`, credentials, active policies and an explicit positive run budget are present. Preview and replay paths must mark provider execution as non-live.
- Candidate acquisition may use provider cards and provider health as availability/telemetry, but provider failures and zero useful history must not penalize a source's keep/drop routing.
- Query attempts, provider errors and LLM events are audit telemetry and must preserve enough metadata to replay or diagnose a run without re-calling providers.
- Probe execution goes through fetchers-owned RSS/website/resource semantics. Python workers may orchestrate, but must not duplicate browser or website parsing ownership.
- `SourceUnderstanding` captures capability, access pattern, observability, risk and evidence. `RoutingDecision` is deterministic and policy-versioned.
- Historical yield is reporting/debug telemetry only. It must never be a keep/drop input.
- Probation handoff must create channels only through the existing source registrar and must emit `source.channel.sync.requested` through the outbox discipline.
- `source_channels`, `source_channel_runtime_state`, fetchers, outbox, UTE, `web_resources`, downstream filtering and notifications remain shared runtime boundaries.
- Probation channel creation must not trigger retro notifications.

## Operator Surfaces

`/maintenance/discovery/*`, `/admin/discovery` and `discovery.*` MCP tools are vNext-only. They may expose runs, artifacts, candidates, probe reports, source understanding, routing decisions, source inventory, policies, adapter backlog, feedback, replay and rollback. They must reject invalid write payloads before backend calls and preserve action-token/permission guardrails.

Destructive rollback or cleanup requires explicit destructive permission plus confirmation. No fallback to historical discovery rows, route names, role names, thresholds, templates or wrappers is allowed.

## Proof

Required proof scales with touched surface:

- Schema/artifact changes: migration smoke plus schema/unit tests for valid payloads, missing required fields, enum failures, lineage and schema version behavior.
- Routing changes: no-yield-penalty tests, routing matrix tests, high-risk denial, auth/CAPTCHA handling and rollback grouping.
- Probation handoff: source registrar tests proving `source.channel.sync.requested` and no retro notification behavior.
- API/MCP/Admin changes: endpoint/tool/page tests, invalid payload rejection and permission/destructive confirmation tests.
- Sweep/cleanup changes: static denylist proof for retired discovery names outside applied migrations.
