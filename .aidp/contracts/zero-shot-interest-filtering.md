# Контракт zero-shot interest filtering

Этот contract обязателен, когда работа трогает canonical documents, observations, story clustering, verification, `interest_filter_results`, `final_selection_results`, historical repair/backfill or zero-shot selection semantics.

## Назначение

SignalOps принимает noisy intake, сохраняет observations, canonicalize-ит documents, отделяет verification от semantic filtering и принимает final selection decisions as `selected`, `rejected`, or `gray_zone`.

## Shipped baseline

- `canonical_documents` and `document_observations` are persisted additive truth.
- `story_clusters`, `story_cluster_members`, and `verification_results` are canonical/story verification layers.
- `interest_filter_results` stores explicit technical filter, semantic decision, compatibility decision and verification snapshot.
- `final_selection_results` is primary internal final-selection gate.
- `system_feed_results` remains bounded compatibility projection.
- Discovery/source scoring must not read downstream selected-content outcomes as upstream source-quality truth.
- Selection diagnostics and operator guidance distinguish `explicit_marker`, `hidden_intent`, `mixed` and `unknown` signal visibility.
- Evidence lanes are configuration/control-plane concepts backed by Funnel Autopilot 2.0 tables and bindings. Native runtime multi-lane selection is not assumed; selection ownership still resolves through the existing profile/filter/final-selection pipeline.
- `final_selection_results.explain_json.funnelRuntimeAttribution` is the worker-owned explain projection for Funnel Autopilot runtime participation when active bindings are observable. It may list funnel/lane ids, system-interest bindings, source roles, `selection_review` template bindings and bounded replay bindings.

## Processing rules

- Persist observations before semantic filtering when technical persistence is possible.
- Semantic interests must not suppress raw observations before canonicalization/dedup/verification.
- Duplicate copies should not carry the full expensive semantic/verification burden independently.
- Verification is not equivalent to interest match.
- Final selection combines technical filters, semantic decisions, verification state, gray-zone/LLM policy and compatibility constraints.
- Funnel attribution may explain which funnel, lane, source role, template and plan contributed to a decision, but it must not replace the additive truth in `interest_filter_results` and `final_selection_results`, and it must not be treated as semantic proof by itself.
- `must_have_terms` remains any-of at runtime, but it is a hard pre-semantic gate and must not be recommended as hidden-intent safe without mandatory-marker proof.
- `short_tokens_required` is an extracted-token requirement, not a phrase gate or broad OR keyword replacement.
- Hidden/unknown signal tuning baseline is empty hard lexical gates plus representative prototypes, literal candidate cue groups, near-miss negatives, content-kind/source-context evidence and bounded replay.
- Mixed signal tuning must split evidence paths into lane-like system interests/config entries or otherwise avoid applying a global hard gate to hidden lanes.

## Responsibility boundaries

- Fetchers persist raw observations/resources/signal-candidates and emit outbox.
- Workers own canonicalization, clustering, verification, filters, final selection and repair/backfill.
- API/admin/web expose materialized truth and explainability; they must not silently recompute hidden selection ownership.
- Discovery may acquire/register sources but does not own downstream selection truth.

## Compatibility rules

- `signal_candidates` may remain storage/runtime compatibility surface but must not be the only semantic decision unit.
- `system_feed_results` may remain fallback/read projection only while `final_selection_results` is absent for a row.
- Public/domain meaning follows `.aidp/contracts/content-model.md`.

## Failure modes

- Re-coupling discovery quality to selected-content outcomes.
- Early semantic filtering that drops observations.
- Per-copy expensive processing in duplicate-heavy corpus.
- Compatibility layer becoming accidental permanent truth.
- Treating any-of `must_have_terms` as sufficient safety for hidden-intent signals.
- Applying an explicit-marker gate globally to a mixed signal.
- Docs claiming a target stage is shipped before code/runtime exists.

## Proof expectations

- Schema/runtime stages: `pnpm test:migrations:smoke`, `pnpm unit_tests`, `pnpm typecheck`.
- Selection cutover: prove `final_selection_results`, compatibility projection, final-selection-first reads and explain surfaces.
- Backfill/repair: prove additive stage rows are rebuilt and retro notifications are suppressed.
- Broad closeout: compose-backed ingest through canonicalization, verification, filtering, final selection and repair visibility.

## Update triggers

Update on changes to canonical document ownership, observation persistence, duplicate/story clustering, verification, semantic filtering, final selection, compatibility with `signal_candidates`/`system_feed_results`, or proof contour.
