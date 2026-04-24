# Контракт independent recall discovery

Этот contract обязателен, когда работа трогает generic source quality, neutral recall missions/candidates, recall acquisition or recall-candidate promotion.

## Назначение

Independent recall adds upstream interest-independent acquisition so discovery is not solely owned by `interest_graph`. It keeps zero-shot filtering downstream and separates generic source quality from mission-fit scoring.

## Current shipped truth

- Graph-first discovery remains valid compatibility truth.
- `discovery_source_quality_snapshots` persists generic source-quality snapshots.
- `discovery_recall_missions` and `discovery_recall_candidates` persist neutral recall backlog.
- Recall acquisition for `rss` and `website` can search/probe and persist recall candidates without `interest_graph`.
- Recall-candidate promotion uses `POST /maintenance/discovery/recall-candidates/{recall_candidate_id}/promote`, reuses source registrar, persists `registered_channel_id` and emits normal onboarding/outbox truth.

## Target flow

`neutral recall acquisition -> generic source quality evaluation -> bounded promotion into source_channels -> existing ingest/canonical/filter/select pipeline`

## Compatibility rules

- `discovery_missions`, `discovery_hypotheses`, `discovery_candidates`, `discovery_source_interest_scores`, and portfolio snapshots remain graph-first truth until explicitly demoted.
- `discovery_source_profiles` is shared anchor for graph and recall.
- Generic source quality must not silently replace mission-fit scores in UI/API wording.
- Source-channel onboarding must keep PostgreSQL + outbox discipline.

## Failure modes

- Generic source quality mixed back into mission-fit scores.
- Recall storage becoming primary truth before admin/API surfaces distinguish it.
- Claiming interest-independent discovery while all acquisition still requires `interest_graph`.
- Reopening downstream zero-shot filtering by accident.
- Hiding unrelated schema drift inside recall work.

## Proof expectations

- Quality foundation: migrations, unit/typecheck, targeted scoring/persistence proof.
- Recall mission/candidate layer: API proof for maintenance surfaces and source-profile linking.
- Acquisition loops: targeted worker/API proof plus unit/typecheck.
- Promotion cutover: migration proof, API/worker proof for source-channel onboarding and outbox discipline.
- Observability cleanup: targeted TS/Python proof for admin/read-model wording.

## Update triggers

Update when recall tables, source quality semantics, recall acquisition providers, promotion boundaries, or graph-vs-recall compatibility rules change.
