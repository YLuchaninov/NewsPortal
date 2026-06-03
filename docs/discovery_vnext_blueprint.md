# Discovery vNext Blueprint

Discovery vNext is the accepted source specification for the hard-cutover discovery system. It is not a staged compatibility plan.

## Goal

Build a broad, explainable, auditable and cheaply monitored source sensor mesh for any system interest without domain-specific hardcoding and without penalizing rare-signal sources for being quiet.

## Active Model

- `DiscoveryBrief`: domain-neutral compiled brief from system interests.
- `HypothesisBatch`: bounded mega-loop output with memory mode, lens and lineage.
- `QueryQualityReport`: optional report for query families and acquisition attempts.
- `ProbePlan` and `ProbeReport`: fetchers-owned static/feed/sitemap/website probe plan and result.
- `SourceUnderstanding`: source capability, access pattern, observability, risk and evidence.
- `RoutingDecision`: deterministic, policy-versioned decision.
- Runtime audit: `discovery_run_steps`, `discovery_query_attempts` and `discovery_llm_gateway_events` preserve step status, live/dry-run mode, provider attempts, LLM metadata, costs, validation and artifact lineage.
- `source_inventory`: durable source truth for inventory/watch/probation/stable/manual/backlog/blocked states.
- `adapter_backlog`: durable queue for sources requiring auth, parser, browser support, custom adapter or unsupported format handling.
- `replay` and `rollback`: non-live replay and reversible vNext-owned source/inventory/probation effects.

## Database

The active schema is additive through vNext migrations and destructive for legacy discovery-specific relations after cutover. Applied migrations remain historical artifacts and must not be edited. Shared runtime tables remain protected: `source_channels`, `source_channel_runtime_state`, `outbox_events`, fetcher/content tables, `web_resources`, downstream filtering and notifications.

## Runtime

1. Resolve required active policies from `discovery_policies`; missing/invalid policy fails closed.
2. Compile `DiscoveryBrief` with domain-neutrality validation and optional LLM gateway logging.
3. Run bounded `HypothesisMegaLoop` with policy budgets and artifact lineage.
4. Acquire candidates with query families, durable query attempts, dedupe, rediscovery counts and query quality reports.
5. Probe through fetchers-owned network/browser semantics; browser probing requires explicit policy budget.
6. Synthesize `SourceUnderstanding`.
7. Route deterministically with no-yield-penalty policy. Historical yield is telemetry/debug only.
8. Persist source inventory, monitoring state, observations, adapter backlog and rollback groups.
9. Handoff probation only through the existing registrar/outbox path.

Live search/LLM is the normal operator path only when `DISCOVERY_ENABLED`, credentials, active policy and explicit positive budget are present. Preview and replay flows are non-live and must not silently fallback from a failed live run.

## Operator Surfaces

`/maintenance/discovery/*`, `/admin/discovery` and `discovery.*` MCP tools expose only vNext concepts: runs, run steps, query attempts, LLM gateway events, artifacts, candidates, probe reports, source understanding, routing decisions, source inventory, monitoring state, observations, policies, adapter backlog, feedback, replay and rollback.

Invalid writes fail before backend mutation. Missing required policy fails closed. Destructive rollback requires destructive permission and explicit confirmation.

## Proof

- Schema and artifact validation tests.
- Domain-neutrality tests across eval domains.
- No-yield-penalty routing tests.
- Routing matrix tests for inventory, watch, probation, manual, backlog, blocked and rollback.
- Probation handoff regression proving `source.channel.sync.requested` and no retro notifications.
- API/MCP/Admin tests for current vNext resources and invalid payloads.
- Static denylist proof for removed discovery names outside applied migrations.
