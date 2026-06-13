# MCP Control Plane Contract

## Scope

The remote MCP control plane is HTTP-only behind the app gateway and exposes strict, schema-validated operator tools. Discovery tools are vNext-only.

MCP resources are operator truth for MCP sessions. Product docs are developer/operator documentation truth, and `.aidp/*` remains agent-runtime truth. These layers must express the same shared invariants even when the audience-specific wording differs.

## Discovery Tools

`discovery.*` tools may cover:

- read: list/read vNext runs, run steps, query attempts, LLM gateway events, artifacts, candidates, source inventory, monitoring state, observations, policies, adapter backlog, feedback, replay runs, rollback groups/actions and eval runs;
- propose/probe/route/register/policy: execute policy-governed runs, create/validate artifacts, preview briefs, run LLM gateway audits, mega-loop batches, candidate normalization, probe plans, probe execution, source understanding, routing, routing apply, probation handoff and policy activation;
- replay/rollback: non-live replay start, rollback prepare and confirmed rollback apply.

Write payloads must be rejected by MCP schema validation before backend calls when malformed. Discovery writes require `write.discovery`; destructive rollback/cleanup also requires `write.destructive` and `confirm=true`.

## Report And Context Rules

Operating-intelligence reports must describe vNext artifacts, source inventory, adapter backlog, replay and rollback. They must not describe removed discovery generations or compatibility aliases.

Recommended actions must point to current tools such as `discovery.runs.execute`, `discovery.brief.preview`, `discovery.llm_gateway.run`, `discovery.mega_loop.preview`, `discovery.candidates.create`, `discovery.probe.execute`, `discovery.route.preview`, `discovery.routing.apply`, `discovery.probation.handoff`, `discovery.policies.activate`, `discovery.replay.start` and `discovery.rollback.prepare/apply`.

## Funnel Autopilot

MCP exposes funnel-first operator tools for cases where the operator can describe the goal but does not know how to configure interests, templates, sources or replay. `operator.funnels.*` and `operator.funnel.*` tools must use the shared control-plane service rather than duplicating business rules in MCP handlers.

Funnel autoplan must classify ideas into safe lanes: `explicit_marker`, `hidden_intent`, `mixed_split`, `context_only` or `unknown`. Explicit-marker lanes may use evidence-led review; hidden-intent lanes require `selection_review` approval for automatic selection; context-only lanes cannot select alone; unknown lanes calibrate first; mixed ideas must split instead of applying a global hard gate.

Manual routes remain valid for expert operation: `system_interests.*`, `llm_templates.*`, `channels.*`, `discovery.*` and `maintenance.reindex.request` keep their old names. If a manual write supplies `changeMode`, MCP must require funnel/lane context or explicit shared/global scope plus a `verificationTarget`; `expert_override` must also carry `operator_override_reason`. Scoped system-interest, LLM-template, channel and bounded reindex writes must validate funnel/lane/plan ids, audit the funnel write context, bind the changed entity through the matching funnel binding table and return funnel read-back guidance. Scoped Discovery vNext writes must validate the same funnel/lane/plan context, strip MCP-only funnel metadata before backend API calls, audit discovery tool/result ids with the funnel write context and return funnel read-back guidance; funnel-bound tokens must supply an allowed `funnelId` for discovery writes instead of writing shared/global discovery state.

`operator.funnel.stage_plan` must materialize scoped lane skeletons from validated plan lanes when `funnelId` is supplied. Staging still does not apply interests, templates, channels or replay jobs by itself, but it must return lane ids so follow-up manual or autopilot writes can bind to real lanes.

`operator.selection.reindex_plan` must emit funnel-scoped `maintenance.reindex.request` templates when called with funnel context. Funnel-scoped `maintenance.reindex.request jobKind=backfill` must be bounded with `payload.options.docIds` unless `changeMode=expert_override` carries an override reason; successful scoped replay requests must write `funnel_reindex_job_bindings` and return replay binding/read-back guidance.

MCP tokens may be funnel-bound through sanitized token metadata. Empty funnel scope preserves legacy unrestricted behavior; a non-empty `allowedFunnelIds` list must limit funnel list/read/update/archive/stage/verify/overlap/report/reindex access to those funnels. Creating a new funnel requires an unrestricted token or admin UI issuance followed by a funnel-bound token. MCP token list/read-back may expose sanitized funnel ids but must never expose token secrets.

Funnel-aware read routes must carry context consistently. `operator.flow.route`, `operator.tuning.recommend`, `operator.effect.verify`, `operator.selection.dashboard`, `operator.selection.precision_audit`, `operator.selection.reindex_plan`, `operator.report.verify`, `signal_candidates.*`, `content_items.*` and `llm_budget.summary` accept funnel/lane context where applicable. A token bound to one funnel may default reads to that funnel; a token bound to multiple funnels must pass `funnelId` for scoped operator reads to avoid accidental global diagnostics.

`signal_candidates.*` and `content_items.*` must support funnel/lane context for Funnel Autopilot reads. When a funnel id, lane id or funnel-bound token is present, list/read/explain operations must use funnel-scoped attribution from `final_selection_results`, `interest_filter_results` and funnel bindings rather than a global inventory-only view. Funnel-bound tokens must reject item detail/explain reads when item-to-funnel attribution cannot be proven.

`llm_budget.summary` remains a global budget account, but when called with funnel/lane context or a funnel-bound token it must expose funnel-bound template/review participation and clearly state that the returned budget cap is not an isolated per-funnel budget.

Funnel reports must answer which funnel/lane selected or blocked a row, which source role fed it, which interest/profile/template participated, whether the reason was semantic/evidence-led/LLM approve, and what next action is safe. When worker runtime attribution is present, report and content-read rows should expose `funnelRuntimeAttribution` from `final_selection_results.explain_json` so external MCP clients do not need to infer runtime participation from separate inventory calls.

Selection recommendations and reports must distinguish `explicit_marker`, `hidden_intent`, `mixed` and `unknown` signal visibility when the client is diagnosing recall/precision or `0 selected`. They must explain that `must_have_terms` is any-of but still a hard pre-semantic gate, that `short_tokens_required` is an extracted-token requirement, and that hidden/unknown baselines use empty hard lexical gates unless mandatory-marker proof exists.

MCP guidance must route hidden and mixed signal recovery through representative samples, literal `candidateSignals` cue groups, near-miss negatives, content-kind/source-context evidence, bounded `docIds` replay and `operator.report.verify`. It must not recommend broad positive-term expansion, global hard gates, `strictness=broad`, LLM template rewrites, LLM budget changes or more source volume as the first response to hidden-signal `0 selected`.

Reindex proof must expose derived-state freshness. `maintenance.reindex_jobs.list` and report verification should inspect selection replay counters, enrichment counters and stale/mixed profile-version diagnostics; a completed job without replay proof is not final selected-signal proof.

## Proof

MCP changes require:

- tool list proof that discovery names are vNext-only;
- invalid-payload tests proving backend calls are not reached;
- permission tests for read/write/destructive paths;
- doc-parity/read-back proof when resources, prompts or operating-intelligence guidance change.
