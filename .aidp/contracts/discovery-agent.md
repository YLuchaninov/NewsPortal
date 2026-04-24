# Контракт discovery agent

Этот contract обязателен, когда работа трогает `/maintenance/discovery/*`, discovery missions/classes/candidates/profiles, discovery policy profiles, source scoring, portfolio/feedback, recall acquisition/promotion or discovery LLM/search runtime.

## Назначение

Discovery отвечает за graph-first mission planning plus bounded independent-recall acquisition/promotion: interest graph planning, hypothesis execution, source profiling, contextual mission-fit scoring, generic source quality, feedback, re-evaluation and bounded promotion into source channels.

## In scope

- `discovery_missions`, `discovery_hypothesis_classes`, `discovery_hypotheses`, `discovery_candidates`.
- `discovery_policy_profiles` as reusable operator-managed tuning truth.
- `discovery_source_profiles`, `discovery_source_interest_scores`, `discovery_portfolio_snapshots`.
- `discovery_source_quality_snapshots` as generic source-quality truth.
- `discovery_recall_missions`, `discovery_recall_candidates`.
- `discovery_feedback_events`, `discovery_strategy_stats`, `discovery_cost_log`.
- Worker orchestration, maintenance API and admin surfaces.

## Out of scope

- Owning article ingest/match/notify runtime.
- Uncontrolled internet rollout beyond bounded discovery-enabled proof.
- Arbitrary DB-defined code execution.
- Using downstream selected-content tables as direct auto-approval or promotion owner.

## Durable truth

- PostgreSQL is discovery source of truth; Redis/BullMQ/UTE are transport/runtime.
- `DISCOVERY_ENABLED=false` remains safe default.
- Discovery plugins remain registered even when disabled, but live provider execution must short-circuit or skip truthfully.
- Policy profiles may snapshot effective policy into missions/recall missions through `applied_profile_version` and `applied_policy_json`.
- Historical interpretability depends on persisted applied policy snapshots, not mutating old missions when a live profile changes.
- Graph-first missions remain planning owner, but bounded recall path can acquire and promote sources too.
- Source registration/promote always goes through PostgreSQL + outbox discipline and `source.channel.sync.requested`.
- RSS alternate-feed recovery may keep a candidate inside `rss` provider boundary without silently converting it to website.

## Class and mission rules

- `discovery_hypothesis_classes` owns planning taxonomy.
- Archived classes/missions remain readable but do not participate in new runs.
- Hard delete is valid only before generated history exists.
- Mission `interest_graph` is authoritative planning state for graph-first lane.
- Flat topics/languages/regions are seed/filter metadata, not direct planning truth after graph compilation.

## Scoring rules

- `discovery_source_profiles` is global/domain-oriented source identity/trust state.
- `discovery_source_interest_scores` is mission-scoped contextual fit.
- `discovery_source_quality_snapshots` is generic source quality and must stay separate from mission fit.
- Source usefulness signals must not read `system_feed_results`, `final_selection_results` or other selected-content outcomes as upstream runtime input.

## Recall rules

Bounded recall introduces neutral acquisition independent of `interest_graph`, but it does not remove graph-first compatibility truth. Recall candidates may be promoted via the same source-channel registrar/outbox path and may resolve duplicates by linking `registered_channel_id`.

## Proof expectations

- General discovery changes: `pnpm unit_tests`, `pnpm typecheck`, relevant Python/TS targeted tests.
- Schema changes: `pnpm test:migrations:smoke`.
- Enabled runtime: `pnpm test:discovery-enabled:compose`.
- Admin/operator changes: `pnpm test:discovery:admin:compose`.
- Example/profile-backed runtime: `pnpm test:discovery:examples:compose`.
- Non-regression/yield lanes when tuning discovery policy: `pnpm test:discovery:nonregression:compose`, `pnpm test:discovery:yield:compose` where applicable.

## Update triggers

Update on discovery schema changes, policy profile semantics, graph/recall ownership, scoring/yield semantics, source registration discipline, provider/runtime env behavior or proof contour changes.
