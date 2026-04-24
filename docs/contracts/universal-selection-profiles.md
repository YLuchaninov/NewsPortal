# Universal Selection Profiles Contract

Этот документ фиксирует durable design contract для capability `C-UNIVERSAL-CONFIGURABLE-SELECTION-PROFILES`.

## Назначение

Подсистема должна эволюционировать текущий zero-shot/final-selection runtime в универсальный configurable selection engine, который:

- сохраняет already-shipped cheap mass-scale pipeline `canonicalize -> verify -> interest-filter -> final selection`;
- перестает держать предметную семантику в скрытом виде внутри текущего template bundle, source cohorts или обязательного gray-zone LLM review;
- переносит смысл отбора в универсальные `selection_profile` / `selection_profile_policy` contracts;
- остается настраиваемым без дополнительного обучения модели;
- оставляет LLM как optional override только для явно объявленных high-value cases, а не как обязательный production gate.

## Почему нужен отдельный contract doc

`docs/contracts/zero-shot-interest-filtering.md` уже задает additive pipeline и final-selection ownership, но не описывает durable contract для:

- универсальной profile-driven semantics;
- cheap `accept / reject / hold` policy перед final-selection mapping;
- separation between engine truth and domain-specific configuration;
- operator-tunable profile vocabulary без fixed actor/content taxonomies;
- optional-only LLM escalation policy.

Эта truth переживет один stage и будет общей для runtime, migrations, admin/operator surfaces, explain vocabulary и backfill discipline, поэтому ее нельзя держать только в `.aidp/work.md`.

## Relationship to Existing Zero-Shot Contract

- `docs/contracts/zero-shot-interest-filtering.md` остается owner-ом additive pipeline, canonical-document truth, verification, `interest_filter_results` и `final_selection_results`.
- Этот документ добавляет следующий слой: как semantic filtering semantics должны развиваться поверх уже shipped pipeline.
- Если между документами есть конфликт, pipeline ownership и shipped runtime truth остаются за `docs/contracts/zero-shot-interest-filtering.md`, а profile-driven semantics эволюционируют только через отдельные stages, объявленные здесь.

## In scope

- universal profile-driven filtering semantics поверх current zero-shot/final-selection runtime;
- target contract for `selection_profile`, `selection_profile_definition`, `selection_profile_policy`, optional facets and explain vocabulary;
- rules for mapping current `interest_templates` / `criteria` world into future profile-driven configuration;
- cheap runtime decision model for mass-scale ingestion without mandatory LLM review;
- stage map, compatibility rules, proof contour, and doc-sync discipline for this evolution.

## Out of scope

- declaring that the future profile model is already shipped before runtime/schema stages land;
- forcing a fixed built-in taxonomy such as `buyer/vendor`, `press_release/news`, or preset bundles into the engine core;
- requiring model fine-tuning, self-training, or domain-specific retraining as part of the baseline system contract;
- removing the current `interest_templates` / `criteria` runtime before compatibility stages ship.

## Current baseline truth

Сегодня shipped runtime truth такая:

- additive zero-shot pipeline уже живет в `canonical_documents`, `story_clusters`, `verification_results`, `interest_filter_results`, и `final_selection_results`;
- additive stage-1 profile-config truth now also persists `selection_profiles` as the first durable profile-driven configuration layer;
- `services/workers/app/main.py::process_match_criteria` still computes criterion results through positive/negative/lexical/meta scoring and fixed thresholds from `services/workers/app/scoring.py`;
- shipped stage-2 runtime now also reads compatibility `selection_profiles` during criterion evaluation: compatibility system-interest profiles synced from admin templates now default to explicit `llmReviewMode = always`, while other profile-backed gray-zone criteria still default to cheap `hold` unless the policy explicitly allows review; criteria without a profile still preserve the legacy always-review fallback, and migration `0033_compatibility_profile_llm_review_defaults.sql` repairs historical compatibility rows that were seeded before this default was corrected;
- `services/workers/app/final_selection.py` summarizes `interest_filter_results` into the editorial final-selection gate;
- shipped stage-3 runtime now lets `final_selection_results` and bounded `system_feed_results` distinguish profile-backed cheap `hold` from true LLM-pending gray-zone cases: unresolved profile-backed criteria still surface `final_decision = gray_zone`, but only rows with profile-approved LLM review remain compatibility `pending_llm`, while cheap holds project as compatibility `filtered_out` with explicit `semantic_hold` explain reason;
- `services/api/app/main.py` uses `final_selection_results` as the primary internal editorial gate for the public/admin selected-content read path;
- `apps/admin/src/pages/bff/admin/templates.ts` now syncs `interest_templates` into both compatibility `criteria` and additive `selection_profiles`, so current domain semantics are no longer stored only as implicit engine-side template truth;
- shipped stage-4 operator/explain truth now surfaces profile-driven `selectionMode`, summaries, guidance, diagnostics, and compatibility profile-policy summaries across article/content/resource/system-interest authoring reads; system-interest authoring forms now also expose editable compatibility policy controls seeded from those defaults instead of leaving the policy buried only in worker tables or local UI heuristics;
- shipped stage-5 migration truth now records the active `selectionProfileSnapshot` in historical `backfill` / `repair` results and projects both a human-readable `selection_profile_summary` and the structured replay snapshot itself through maintenance reindex read surfaces, so replay provenance is explicit during compatibility closeout;
- active semantics remain materially biased by the current system templates, active criteria, and narrow source cohorts, even though the additive runtime architecture itself is already more general than those semantics.

## Target contract

### Product and decision model

- System-selected remains a filtering product, not a top-k ranking product.
- Runtime numeric scores may exist as internal confidence/explain signals, but canonical business decisions must remain discrete and inspectable.
- Engine-level profile evaluation outputs are:
  - `accept`
  - `reject`
  - `hold`
- Final-selection/public-facing mapping may continue to use:
  - `selected`
  - `rejected`
  - `gray_zone`
- `hold` is the cheap unresolved state. It is not an automatic LLM work queue by default, although a profile family may still choose `llmReviewMode = always` as its shipped compatibility default.

### Universality rules

Engine truth must not require:

- fixed actor-role taxonomies;
- fixed content-type taxonomies;
- preset-only configuration as the primary authoring mode;
- source-origin as semantic truth;
- domain-specific negative dictionaries baked into core runtime;
- mandatory training loops or self-training;
- mandatory LLM review for unresolved cases.

These may appear only as:

- profile-local definitions;
- optional facets;
- optional operator affordances;
- optional high-value runtime overrides.

### Core configuration entities

Future runtime must support the following logical responsibilities, whether as tables, documents, or compiled representations:

- `selection_profile`
  - named operator-facing profile that defines one filtering intent.
- `selection_profile_definition`
  - versioned definition of what should match and what should not match.
  - must support:
    - natural-language profile description;
    - positive definitions/examples;
    - negative definitions/examples;
    - required evidence;
    - forbidden evidence.
- `selection_profile_policy`
  - controls strictness, hold behavior, output policy, optional LLM escalation policy, and compatibility mode.
- `selection_profile_facet` (optional)
  - operator-declared additional distinction axis when a profile needs one, without forcing that axis into engine truth for every profile.
- `selection_profile_binding`
  - links profile semantics to source acquisition scope, output collections, and optional user/operator surfaces without making sources the owner of semantic truth.

### Runtime processing model

Default mass-scale runtime target:

`cheap prefilter -> cheap candidate scoring -> profile evidence evaluation -> accept/reject/hold -> final selection mapping`

Rules:

- expensive LLM review must not be part of the default hot path for every `hold`;
- unresolved documents may remain in `hold` / `gray_zone` without automatic costly escalation;
- optional LLM review is allowed only when:
  - the profile policy explicitly enables it;
  - the case belongs to a declared high-value path;
  - budget and operator intent allow it.
- profile tuning must work through config and examples, not through retraining.

### Explainability contract

Every profile-driven decision must be explainable in profile vocabulary:

- what matched;
- what failed to match;
- which required evidence was present or missing;
- which forbidden evidence triggered rejection or hold;
- why the runtime produced `accept`, `reject`, or `hold`;
- whether an optional LLM override was used.

Explain surfaces must favor human-readable reasoning over opaque raw scores.

## Compatibility rules with current runtime

- `interest_templates`, `criteria`, `criteria_compiled`, `criterion_match_results`, `interest_filter_results`, and `final_selection_results` remain the shipped baseline until later stages land.
- Current templates/criteria may be interpreted as a compatibility projection of future profile semantics during migration.
- `allowed_content_kinds` remains a currently shipped gate and must not be silently deleted before profile-config stages ship a truthful replacement.
- `final_selection_results` remains the primary internal editorial gate throughout this capability.
- Existing public `system-selected collection` meaning from `docs/contracts/content-model.md` must remain stable during the migration.
- Historical repair/backfill must continue rebuilding `interest_filter_results` and `final_selection_results` truthfully during the transition.

## Stage map

### `STAGE-0-UNIVERSAL-SELECTION-PROFILE-DESIGN-CONTRACT`

- produce this contract and sync runtime/process docs around it;
- do not claim that runtime/schema behavior has already changed;
- keep current pipeline and compatibility semantics truthful in all docs.

### `STAGE-1-PROFILE-CONFIG-MODEL-AND-COMPATIBILITY-MAPPING`

- add the first durable profile config model and compatibility mapping from current system templates/criteria;
- preserve current public behavior while making current domain semantics explicit configuration rather than hidden engine truth;
- do not require built-in actor/content taxonomies or preset bundles.
- shipped stage-1 runtime truth now persists additive PostgreSQL table `selection_profiles`;
- admin system-interest writes now sync template changes into both `criteria` and compatibility `selection_profiles`;
- current runtime scoring and final selection still remain compatibility-owned by `criteria` / `interest_filter_results` / `final_selection_results`, so `selection_profiles` is additive config truth rather than the runtime scoring owner yet.

### `STAGE-2-CHEAP-PROFILE-SCORING-AND-HOLD-POLICY`

- evolve current criterion-centric scoring into profile-driven positive/negative/required/forbidden evaluation;
- introduce cheap `hold` as the default unresolved runtime outcome;
- keep LLM review optional and policy-driven rather than mandatory for every gray-zone case.
- shipped stage-2 runtime truth now keeps current criterion scoring weights/thresholds, but `process_match_criteria` reads compatibility `selection_profiles` for gray-zone policy;
- unresolved compatibility system-interest profiles synced from admin templates now default to explicit LLM review, while other profile-backed gray-zone criteria still default to cheap `hold` instead of automatic LLM queueing;
- LLM review remains available only when the resolved profile policy allows it, while legacy criteria without a profile keep the previous always-review fallback.

### `STAGE-3-FINAL-SELECTION-POLICY-CUTOVER`

- derive editorial/system final selection from profile-driven runtime outcomes and explicit output policy;
- preserve compatibility projection while the read path still needs legacy fields;
- stop treating current narrow template semantics as implicit engine truth.
- shipped stage-3 runtime truth now derives `final_selection_results` from profile-aware `interest_filter_results` counts, explicitly separates `llmReviewPending` from cheap `hold`, and keeps bounded `system_feed_results` truthful by mapping only genuine review-pending gray-zone rows to compatibility `pending_llm`;
- profile-backed unresolved criteria without LLM opt-in now surface `selectionReason = semantic_hold` and compatibility `filtered_out`, while legacy criteria without a profile still preserve the old gray-zone-to-review behavior.

### `STAGE-4-EXPLAIN-AND-OPERATOR-TUNING-SURFACES`

- expose profile-driven explain surfaces and operator-tunable controls;
- keep authoring approachable through description/examples/evidence/policy rather than through hidden code-level semantics;
- do not require operator understanding of embeddings, thresholds, or prompt internals just to tune a profile.
- shipped stage-4 truth now centralizes explain vocabulary in API/read models: article/content/resource surfaces expose `selectionReason`, `selectionSummary`, `selectionMode`, `selectionDiagnostics`, and `selectionGuidance`, while system-interest list/edit/create surfaces expose the current compatibility `selection_profile` policy summary and prefilled editable controls instead of hiding that policy in runtime code.

### `STAGE-5-MIGRATION-BACKFILL-AND-COMPATIBILITY-CLOSEOUT`

- backfill and migrate the current outsourcing-focused semantics into explicit profile config;
- ensure historical repair and current selected-content surfaces remain truthful;
- archive compatibility-only assumptions once runtime no longer depends on them.
- shipped stage-5 truth now records `selectionProfileSnapshot` in worker `backfill` / `repair` result payloads, projects both a human-readable `selection_profile_summary` and structured snapshot counts through maintenance reindex read surfaces, and normalizes article/operator `selection_*` payloads so compatibility-only rows are explicit `compatibility_only` state instead of raw legacy decisions.

## Failure modes

- reintroducing domain lock-in via hardcoded taxonomies or bundle-specific engine rules;
- keeping LLM review as a de facto mandatory gray-zone stage through hidden budget/runtime fallbacks;
- treating source cohorts as semantic truth instead of as recall/acquisition hints;
- forcing profile authoring through complex low-level thresholds rather than through understandable definitions and evidence rules;
- rewriting docs as if profile-driven runtime were already shipped before schema/runtime stages land;
- breaking `final_selection_results` ownership during the migration.

## Doc sync rules

- `.aidp/blueprint.md`
  - may mention this contract as the next durable semantics layer for the selection lane, but must not claim shipped profile runtime before later stages land.
- `.aidp/engineering.md`
  - should record that universal selection semantics must stay profile-driven and must not regress into hidden domain-specific engine truth.
- `.aidp/verification.md`
  - should define stage-level proof for this capability, starting with the design-contract stage.
- `.aidp/os.yaml`
  - should include this contract in machine-canonical delivery/deep-contract facts.
- `.aidp/work.md`
  - carries active stage status, proof, and next step for this capability.
- `.aidp/history.md`
  - archives completed stages once they are no longer live.

## Minimum proof expectations

- `STAGE-0-UNIVERSAL-SELECTION-PROFILE-DESIGN-CONTRACT`
  - required-read-order reload;
  - sync of this contract plus touched truth layers;
  - targeted consistency proof such as `git diff --check --` and reference checks.
- Later implementation stages:
  - must follow `.aidp/verification.md` and strengthen proof as schema/runtime/admin surfaces move.

## Related files

- `docs/contracts/zero-shot-interest-filtering.md`
- `docs/contracts/content-model.md`
- `.aidp/blueprint.md`
- `.aidp/engineering.md`
- `.aidp/verification.md`
- `.aidp/os.yaml`
- `services/workers/app/main.py`
- `services/workers/app/scoring.py`
- `services/workers/app/final_selection.py`
- `services/api/app/main.py`
