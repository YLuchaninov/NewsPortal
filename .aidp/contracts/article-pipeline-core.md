# Контракт article pipeline core

Этот contract обязателен, когда работа трогает ingest-to-selection pipeline: `article.ingest.requested`, `resource.ingest.requested`, observations, canonical documents, story clusters, verification, semantic filters, final selection, LLM review reuse or compatibility projections.

## Назначение

Защитить уже shipped article/selection pipeline от случайного дрейфа: ingest, canonicalization, verification, semantic filtering, final selection and compatibility projections должны оставаться разделенными слоями.

## Truth model

- `services/fetchers` owns fetch/extract/enrichment handoff and raw/resource/article persistence.
- `document_observations` are additive evidence and must not disappear because an early semantic gate rejects content.
- `canonical_documents` are primary dedup/evidence units; duplicate article rows may exist and must preserve provenance.
- `verification_results` express corroboration/evidence quality and are not the same as semantic match.
- `interest_filter_results` own technical/semantic filtering truth.
- `final_selection_results` is primary internal selection truth.
- `system_feed_results` is bounded compatibility projection only.

## Canonical reuse

- Criterion-scope LLM review reuse key is `canonical_document_id + criterion_id`.
- Duplicate rows of one canonical document must not trigger repeated LLM review for the same resolved criterion.
- Canonical reuse must not erase article-level provenance.

## Инварианты

- PostgreSQL remains authoritative pipeline state.
- Generic engine cannot regain hidden domain-specific hardcoding.
- Application/admin tuning belongs in templates, criteria, profiles, prompts and policy config.
- Compatibility projections must be visibly compatibility-only and must not become primary write truth.
- Historical repair/backfill must preserve frozen target snapshots and must not send retro notifications.

## Safe tuning layers

- Admin/application layer: `interest_templates`, `criteria`, `criteria_compiled`, `selection_profiles`, prompt templates, cues, allowed content kinds, strictness and LLM policy.
- Read-model/operator visibility: summaries, explain payloads, diagnostics wording.
- Bounded runtime hardening: retry/deadlock hardening, per-channel leases, non-fatal enrichment degradation, generic wrapper/category-noise filtering.

## Запрещено без отдельного stage и усиленного proof

- Source-level ranking as primary relevance gate.
- Blanket `must_have_terms` as baseline recall choke point.
- Hardcoded domain vocabulary inside generic engine.
- Direct writes to compatibility-only selected truth.
- Re-reviewing duplicates independently when canonical verdict exists.
- Destructive reset without declared preserve-set and repair scope.

## Proof expectations

Minimum for core changes:

- `pnpm unit_tests`
- `pnpm typecheck`
- relevant worker/fetcher/relay compose smoke such as `pnpm test:ingest:compose`, `pnpm test:normalize-dedup:compose`, `pnpm test:cluster-match-notify:compose`
- targeted proof for canonical reuse, final-selection-first reads and compatibility projection alignment

## Update triggers

Update when ingest-to-selection ownership, canonical reuse, final-selection ownership, reset preserve-set, gray-zone/hold/pending review semantics or selected read-model expectations change.
