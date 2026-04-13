# Discovery Agent Contract

Этот документ фиксирует durable truth для capability `C-ADAPTIVE-SOURCE-DISCOVERY-CUTOVER`.

## Назначение

Discovery subsystem отвечает за graph-first mission planning plus bounded independent-recall acquisition/promotion: mission-specific interest graph planning, class-registry-driven hypothesis execution, source profiling, contextual source scoring, portfolio assembly, feedback capture, bounded neutral recall backlog, and bounded re-evaluation.

## In scope

- `discovery_missions`, `discovery_hypothesis_classes`, `discovery_hypotheses`, `discovery_candidates`;
- `discovery_source_profiles`, `discovery_source_interest_scores`, `discovery_portfolio_snapshots`;
- `discovery_source_quality_snapshots` as additive generic source-quality truth that coexists with graph-first mission scoring;
- `discovery_feedback_events`, `discovery_strategy_stats`, `discovery_cost_log`;
- worker-side discovery orchestration and its maintenance API/admin surfaces;
- graph compilation, registry-driven hypothesis planning, source profile/scoring heuristics, portfolio/gap loop, feedback and re-evaluation.

## Out of scope

- source-channel operational ownership outside discovery registration;
- article ingest / enrich / match / notify runtime ownership;
- uncontrolled internet rollout beyond the bounded discovery-enabled smoke harness;
- arbitrary runtime-extensible code execution from DB-defined hypothesis classes.

## Current durable truth

- Discovery remains under `/maintenance/discovery/*` and Astro admin BFF writes.
- PostgreSQL remains the only source of truth for discovery state; Redis/BullMQ stay transport only through UTE.
- Discovery uses the existing UTE orchestrator boundary:
  - `discovery.plan_hypotheses`
  - `discovery.execute_hypotheses`
  - `discovery.evaluate_results`
  - `discovery.re_evaluate_sources`
- The active data model is graph-first:
  - each mission owns an authoritative `interest_graph jsonb`;
  - hypothesis classes are stored in `discovery_hypothesis_classes` and are the only truth for planning taxonomy;
  - hypotheses point to `class_key` and `tactic_key`, not to legacy flat strategy-only planning.
- Independent-recall stage-1 now also persists additive `discovery_source_quality_snapshots`; current execution and re-evaluation paths populate generic source-quality snapshots per source profile/channel, but this layer is additive only and does not yet replace mission-fit planning or promotion ownership.
- Independent-recall stage-2 now also persists additive `discovery_recall_missions` and `discovery_recall_candidates`; maintenance surfaces can inspect and edit neutral recall backlog, and recall candidates can link to existing source profiles plus latest generic quality snapshots by canonical domain.
- Independent-recall stage-3 now also ships bounded recall-first acquisition loops for `rss` and `website`; neutral recall missions can actively search/probe and persist recall candidates plus generic quality snapshots through `acquire_recall_missions(...)` and `/maintenance/discovery/recall-missions/{recall_mission_id}/acquire` without requiring `interest_graph`, but promotion into `source_channels` still remains outside this stage.
- Independent-recall stage-4 now also ships bounded recall-candidate promotion through `POST /maintenance/discovery/recall-candidates/{recall_candidate_id}/promote`; this path reuses `PostgresSourceRegistrarAdapter`, persists `registered_channel_id` on the recall candidate, links shared source profiles to the promoted channel when possible, and emits the same PostgreSQL + outbox onboarding contract as graph-first discovery.
- Independent-recall stage-5 now also ships operator/read-model closeout: discovery summary counts promoted vs duplicate recall candidates, source-profile reads surface the latest generic source-quality snapshot, and admin/help surfaces present mission fit, generic quality, neutral recall backlog, and promotion state separately.
- Graph-first missions/hypotheses remain the primary planning owner for discovery, but they are no longer the only acquisition/promotion owner because the bounded recall path can now acquire and promote sources too.
- The current compose/dev migration baseline also includes explicit discovery drift repair: `0026a_discovery_schema_drift_prerepair.sql` must heal historical 0016-drifted databases before `0027_*` additive recall migrations run, and `0030_discovery_schema_drift_repair.sql` must restore the remaining 0016 discovery-core tables/constraints idempotently after those later migrations. Discovery migration smoke is expected to assert the full discovery core so this drift fails fast instead of surviving as a hybrid partially-upgraded schema.
- New classes may be added data-only when they reuse an existing `generation_backend` and existing provider/channel execution capabilities.
- Source registration still goes through PostgreSQL + outbox discipline and must not bypass `source_channels`, whether the source is approved from graph-first `discovery_candidates` or promoted from `discovery_recall_candidates`.
- `DISCOVERY_ENABLED=false` remains the safe default baseline.

## Class registry contract

- `discovery_hypothesis_classes` is the authoritative registry for discovery planning classes.
- Minimum required fields:
  - `class_key`
  - `display_name`
  - `status`
  - `generation_backend`
  - `default_provider_types`
  - `seed_rules_json`
  - `max_per_mission`
- Supported `generation_backend` values at this stage:
  - `graph_seed_llm`
  - `graph_seed_only`
- Archived classes must remain readable for historical hypotheses but must not participate in new planning.
- Hard delete for a class is only valid while it has no generated hypotheses yet; once hypothesis history exists, operators must archive/reactivate the class instead of deleting it.

## Mission and graph contract

- Mission create/update stores seed inputs plus an authoritative `interest_graph`.
- Mission lifecycle now supports `planned`, `active`, `paused`, `completed`, `failed`, and `archived`.
- `interest_graph_status` truthfully records whether the stored graph is pending, compiled or failed.
- Graph compilation may use LLM assistance but must have a deterministic fallback and schema validation.
- Flat `topics`/`languages`/`regions` no longer drive planning directly; they are only mission seed inputs and list/filter metadata.
- Archived missions must remain readable in admin/API history but must not compile or run until they are reactivated into the planned backlog.
- Hard delete for a mission is only valid while it has no generated discovery history yet; runs, hypotheses, portfolio snapshots, feedback, contextual source scores, strategy stats, or mission-linked cost rows must force operators onto the archive/reactivate path instead.

## Scoring and portfolio contract

- Source profile is global/domain-oriented metadata and trust signals.
- `discovery_source_quality_snapshots` is the current additive owner of generic recall/source-quality state and must stay clearly separate from mission-fit scores.
- Source-interest score is mission-scoped contextual scoring.
- `yield_score`, `lead_time_score`, and `duplication_score` inside `discovery_source_interest_scores` now derive from generic channel-intake quality metrics such as unique-article ratio, fetch health, freshness, lead-time, and duplication pressure; these signals must not read downstream `system_feed_results`, `final_selection_results`, or other selected-content outcomes.
- operator/admin discovery surfaces must label mission-scoped contextual fit separately from generic channel-quality evidence and recall-promotion state, and must not present `yield_score` as downstream selected-content yield.
- Portfolio snapshots are persisted, not ephemeral UI-only calculations.
- Gap filling may create additional hypotheses, but only through the same class-registry-driven planning path.

## Feedback and re-evaluation contract

- Typed feedback is stored in `discovery_feedback_events`.
- Strategy adaptation state is stored in `discovery_strategy_stats`.
- Re-evaluation must reuse existing maintenance/UTE boundaries; discovery must not introduce a parallel in-memory scheduler.

## Proof minimums

- Shipped `STAGE-5-DISCOVERY-SOURCE-SCORING-DECOUPLING` minimum:
  - `pnpm unit_tests`
  - `pnpm typecheck`
  - `pnpm test:discovery-enabled:compose`
  - targeted Python proof that discovery/source-scoring no longer reads downstream selected-content outcomes and still persists portfolio snapshots
- `pnpm unit_tests`
- `pnpm typecheck`
- `pnpm test:migrations:smoke`
- `pnpm test:relay:compose`
- `pnpm test:ingest:compose`
- `pnpm test:discovery-enabled:compose`
- `pnpm integration_tests`

Separate schema-repair follow-up proof for drifted compose baselines also requires:

- `pnpm test:migrations:smoke`
- `pnpm db:migrate`
- `pnpm test:discovery-enabled:compose`

That proof must explicitly show the repaired discovery migration order (`0026a` before `0027_*`, `0030` after the additive recall migrations) on a previously drifted database rather than only on a fresh schema.

Capability closeout also requires a compose-backed adaptive walkthrough proving mission graph compile, custom class creation, planning, execution, profile/score/portfolio persistence, feedback capture, re-evaluation and source registration discipline.
