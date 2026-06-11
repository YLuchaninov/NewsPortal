# Hidden-Signal Selection Reference

Last synchronized with repository reality: 2026-06-10.

This guide documents the implemented hidden-signal selection repair. It is operator guidance, not a new runtime algorithm. Domain-specific behavior still belongs only in admin/MCP configuration, scenario packs or historical evidence.

## What Changed

The system now exposes a domain-neutral control-plane model for signals that are easy, hard or mixed to observe:

- `explicit_marker` — a signal with a proven mandatory marker.
- `hidden_intent` — hidden or operational intent where the useful item may not contain the operator's expected terms.
- `mixed` — one business goal with both explicit-marker and hidden-intent evidence paths.
- `unknown` — use hidden-signal safety until evidence proves a stricter lane.

MCP, admin and API read-backs now make these risks visible:

- MCP guidance/resources explain evidence lanes, hard-gate safety, strict next steps and operator flow modes.
- `operator.tuning.recommend` and `operator.report.verify` can surface `signalVisibility`, `evidenceLaneGuidance`, hard-gate proof requirements, candidate cue warnings, score/freshness diagnostics and strict proof fields.
- Admin system-interest edit screens show persisted guardrail warnings when API read-back detects unsafe hard gates or weak candidate cues.
- API system-interest read models expose `candidate_signals_quality_warnings`, `hard_gate_safety_warnings` and warning counts.
- Reindex jobs expose `selection_replay` / `selectionReplay` counters so operators can prove selection replay targets were actually processed separately from enrichment reruns.

## Signal-Type Defaults

| Type | Default approach | Hard gate policy |
| --- | --- | --- |
| `explicit_marker` | Use representative prototypes and prove the marker is mandatory with samples. | Allowed only after mandatory-marker proof and bounded replay. |
| `hidden_intent` | Keep hard lexical gates empty; tune literal `candidateSignals`, near-miss negatives, content kinds and source/context evidence. | Forbidden by default. |
| `mixed` | Split into lane-like system interests or config-pack entries so each lane has its own evidence and proof. | No global gate shared by hidden and explicit lanes. |
| `unknown` | Treat as hidden until evidence proves otherwise. | Forbidden by default. |

## Hard-Gate Semantics

`must_have_terms` is any-of at runtime, but it is still a hard pre-semantic gate. If none of the terms appears in candidate text, the item does not reach semantic scoring, candidate recovery, gray-zone handling or LLM review.

`short_tokens_required` is an extracted-token requirement. It is not a phrase gate and not a broad OR keyword replacement.

For hidden or unknown signals, start with:

```json
{
  "must_have_terms": [],
  "short_tokens_required": []
}
```

Add hard lexical gates only after representative samples prove a mandatory marker and bounded replay confirms recall did not collapse.

## CandidateSignals Contract

`candidateSignals` is the primary hidden-signal recovery surface, but only when cues are observable text:

- `group.name` may be conceptual, for example `buyer_ask` or `technical_failure`.
- `group.cues` must be literal fragments that can appear in candidate content.
- Snake-case/id-like cues such as `rfp_published` or `vendor_search` are warnings unless they are truly literal source text.
- Single-cue groups are weak evidence for hidden or mixed signals.
- Zero-hit cue groups should be repaired from representative rejected/near-miss samples before changing hard gates, strictness, LLM templates, budgets or sources.

Candidate cues can help items survive into gray/hold/review paths. They do not directly publish or select content.

## Required Operator Loop

For `0 selected`, `0 LLM reviews` or suspicious gray-zone collapse:

1. Read `operator.selection.dashboard`.
2. Read `signal_candidates.residuals.summary/list`.
3. Inspect 1-3 representative `signal_candidates.explain` rows.
4. Read one affected system interest and compile/profile status.
5. Classify `signalVisibility`.
6. Fix at most one scoped config issue.
7. Read back the persisted interest/profile/candidate cues.
8. Replay 25-50 explicit `docIds`.
9. Verify `maintenance.reindex_jobs.list` and `operator.report.verify includeSamples=true`.

Do not report a mutation response, Discovery preview, source count, RSS volume, hard-filter count or gray-zone collapse as selected-signal proof.

## Reindex Freshness Proof

Historical replay is operator-visible derived-state work. The relevant read-back fields are:

- `selectionReplayTargetCount`
- `selectionReplayedCount`
- `enrichmentTargetCount`
- `enrichmentProcessedCount`
- `skippedSelectionDueToEnrichmentState`

Selection replay targets must not be shrunk just because enrichment rerun is not needed. If selection rows remain stale or profile versions are mixed, reports should be partial or blocked until bounded replay proves fresh results.

## What Did Not Change

- Runtime `must_have_terms` remains any-of.
- Runtime `short_tokens_required` remains extracted-token matching.
- LLM review remains downstream of gray/reviewable paths and does not bypass semantic rejection.
- Native multi-lane runtime selection was not added in this stage.
- Domain-specific terms, source choices and business meanings are not runtime defaults.
- Existing fields remain backward-compatible; warnings are advisory proof helpers, not write blockers.
