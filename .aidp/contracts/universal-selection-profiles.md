# Контракт universal selection profiles

Этот contract обязателен, когда работа трогает `selection_profiles`, profile policy, gray-zone/hold behavior, system-interest authoring, final-selection explain fields or historical replay provenance.

## Назначение

Selection semantics must be profile-driven instead of hidden inside templates, source cohorts, hardcoded domain vocabulary or mandatory LLM review. The cheap mass-scale pipeline remains `canonicalize -> verify -> interest-filter -> final selection`.

## Current shipped truth

- Additive pipeline truth lives in `canonical_documents`, `story_clusters`, `verification_results`, `interest_filter_results`, `final_selection_results`.
- `selection_profiles` exists as durable profile-driven configuration.
- Admin system-interest writes sync templates into compatibility `criteria` and additive `selection_profiles`.
- Profile-backed gray-zone criteria may produce cheap `hold`; LLM review happens only when resolved profile policy allows it.
- `final_selection_results` and bounded `system_feed_results` distinguish true `llmReviewPending` from cheap `semantic_hold`.
- Historical backfill/repair records `selectionProfileSnapshot` and exposes profile summaries through maintenance reindex reads.

## Target decision model

Engine-level outcomes:

- `accept`
- `reject`
- `hold`

Final/public mapping may remain:

- `selected`
- `rejected`
- `gray_zone`

`hold` is cheap unresolved state, not automatic LLM queue.

## Universality rules

Engine truth must not require fixed actor-role taxonomies, fixed content-type taxonomies, preset-only authoring, source-origin as semantic truth, domain-specific negative dictionaries, training loops or mandatory LLM review.

Those concepts may exist only as profile-local definitions, optional facets, operator affordances or high-value overrides.

## Configuration responsibilities

- `selection_profile`: named filtering intent.
- `selection_profile_definition`: versioned positive/negative examples, required evidence and forbidden evidence.
- `selection_profile_policy`: strictness, hold behavior, output mapping, optional LLM escalation and compatibility behavior.
- Optional facets: operator-declared distinctions that do not become universal engine truth.
- Profile bindings: connect profiles to acquisition/output/user surfaces without making sources semantic owners.

## Explainability

Every profile decision must explain what matched, what failed, what evidence was missing, what forbidden evidence fired, why outcome is accept/reject/hold and whether optional LLM override was used.

## Failure modes

- Reintroducing domain lock-in through hardcoded taxonomies.
- Keeping LLM review as hidden mandatory gray-zone stage.
- Treating source cohorts as semantic truth.
- Hiding profile policy in worker code or UI heuristics.
- Breaking `final_selection_results` ownership.

## Proof expectations

- Profile config/model changes: migration proof, unit/typecheck, admin write/read proof.
- Runtime policy changes: targeted worker proof for hold vs LLM pending plus final-selection projection proof.
- Operator/explain changes: targeted API/admin tests for `selectionMode`, summaries, diagnostics and guidance.
- Backfill/replay changes: proof that `selectionProfileSnapshot` is captured and exposed.

## Update triggers

Update when profile schema, profile policy, hold/LLM behavior, system-interest compatibility mapping, explain vocabulary or replay provenance changes.
