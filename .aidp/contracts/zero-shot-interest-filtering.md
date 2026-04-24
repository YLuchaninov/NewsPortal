# Контракт zero-shot interest filtering

Этот contract обязателен, когда работа трогает canonical documents, observations, story clustering, verification, `interest_filter_results`, `final_selection_results`, historical repair/backfill or zero-shot selection semantics.

## Назначение

NewsPortal принимает noisy intake, сохраняет observations, canonicalize-ит documents, отделяет verification от semantic filtering и принимает final selection decisions as `selected`, `rejected`, or `gray_zone`.

## Shipped baseline

- `canonical_documents` and `document_observations` are persisted additive truth.
- `story_clusters`, `story_cluster_members`, and `verification_results` are canonical/story verification layers.
- `interest_filter_results` stores explicit technical filter, semantic decision, compatibility decision and verification snapshot.
- `final_selection_results` is primary internal final-selection gate.
- `system_feed_results` remains bounded compatibility projection.
- Discovery/source scoring must not read downstream selected-content outcomes as upstream source-quality truth.

## Processing rules

- Persist observations before semantic filtering when technical persistence is possible.
- Semantic interests must not suppress raw observations before canonicalization/dedup/verification.
- Duplicate copies should not carry the full expensive semantic/verification burden independently.
- Verification is not equivalent to interest match.
- Final selection combines technical filters, semantic decisions, verification state, gray-zone/LLM policy and compatibility constraints.

## Responsibility boundaries

- Fetchers persist raw observations/resources/articles and emit outbox.
- Workers own canonicalization, clustering, verification, filters, final selection and repair/backfill.
- API/admin/web expose materialized truth and explainability; they must not silently recompute hidden selection ownership.
- Discovery may acquire/register sources but does not own downstream selection truth.

## Compatibility rules

- `articles` may remain storage/runtime compatibility surface but must not be the only semantic decision unit.
- `system_feed_results` may remain fallback/read projection only while `final_selection_results` is absent for a row.
- Public/domain meaning follows `.aidp/contracts/content-model.md`.

## Failure modes

- Re-coupling discovery quality to selected-content outcomes.
- Early semantic filtering that drops observations.
- Per-copy expensive processing in duplicate-heavy corpus.
- Compatibility layer becoming accidental permanent truth.
- Docs claiming a target stage is shipped before code/runtime exists.

## Proof expectations

- Schema/runtime stages: `pnpm test:migrations:smoke`, `pnpm unit_tests`, `pnpm typecheck`.
- Selection cutover: prove `final_selection_results`, compatibility projection, final-selection-first reads and explain surfaces.
- Backfill/repair: prove additive stage rows are rebuilt and retro notifications are suppressed.
- Broad closeout: compose-backed ingest through canonicalization, verification, filtering, final selection and repair visibility.

## Update triggers

Update on changes to canonical document ownership, observation persistence, duplicate/story clustering, verification, semantic filtering, final selection, compatibility with `articles`/`system_feed_results`, or proof contour.
