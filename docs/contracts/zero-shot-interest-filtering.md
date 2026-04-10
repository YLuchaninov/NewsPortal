# Zero-Shot Interest Filtering Cutover Contract

Этот документ фиксирует durable design contract для capability `C-ZERO-SHOT-INTEREST-FILTERING-CUTOVER`.

## Назначение

Подсистема должна перевести NewsPortal из interest-centric discovery/runtime в zero-shot систему массового отбора информации, которая:

- принимает весь найденный noisy intake;
- сохраняет raw observations как evidence, а не теряет их из-за раннего interest gate;
- canonicalize-ит документы и убирает duplicate-heavy surface noise;
- считает verification state по canonical document / cluster, а не только по копиям статей;
- применяет zero-shot semantic interest filtering как downstream decision layer;
- принимает финальное решение в терминах `selected`, `rejected`, `gray_zone`.

## Почему нужен отдельный contract doc

Эта capability меняет сразу несколько durable boundaries:

- ownership между discovery, ingest, canonical document truth и final selection truth;
- data model между raw observation, canonical document, cluster и verification/filter results;
- explain/admin/operator model;
- proof contour для backfill, compatibility и final cutover.

Эту truth нельзя надежно держать только в `docs/work.md` или размывать по временным заметкам.

## In scope

- target architecture и stage map для:
  - raw intake observations;
  - canonical documents;
  - duplicate groups / story clusters;
  - verification state;
  - semantic interest filtering;
  - final selection read model;
  - compatibility and backfill strategy;
  - admin/API/observability/explain surfaces.
- rules for how `docs/blueprint.md`, `docs/engineering.md`, `docs/verification.md`, `.aidp/os.yaml`, `docs/work.md`, and `docs/history.md` should be synced during the cutover.

## Out of scope

- claiming that the target architecture is already shipped before its stages land;
- changing public product meaning away from the existing `content_item` / `system-selected collection` contract before the relevant stages ship;
- uncontrolled live-internet proof;
- broad historical mutation of already selected data without an explicit scoped backfill stage.

## Current baseline truth

Пока capability не shipped, действующей runtime truth остается текущая architecture из `docs/blueprint.md`:

- discovery planning остается graph-first и interest-centric;
- `articles` и related rows остаются действующей raw/editorial runtime model;
- additive stage-4 runtime truth now persists `final_selection_results` as the primary internal final-selection gate, while `system_feed_results` remains a compatibility projection for legacy article-side consumers;
- shipped stage-5 discovery/source-scoring truth no longer depends on downstream selected-content outcomes like `system_feed_results` / `final_selection_results`, although discovery planning itself still remains graph-first and interest-centric.

Этот документ задает target contract и cutover discipline, но не переписывает shipped blueprint truth раньше времени.

## Target contract

### Product and decision model

- Система не является top-k search product.
- Внутренние numeric scores допустимы только как confidence/explain signals.
- Canonical business outputs:
  - `selected`
  - `rejected`
  - `gray_zone`
- Interest matching is a filtering decision over found information, not the upstream owner of what gets discovered in the first place.

### Processing model

Target pipeline:

`acquire all -> normalize -> canonicalize -> dedup/cluster -> verify -> interest-match -> select`

Rules:

- все найденные observations должны сохраняться со статусом, если only technical failure does not prevent persistence;
- semantic interests не должны silently suppress raw observations before canonicalization/dedup/verification;
- duplicate copies must not each carry the full expensive semantic/verification burden independently when they resolve to the same canonical evidence unit;
- verification and gray-zone escalation should prefer canonical document / cluster scope over per-copy article scope.

### Core data entities

The cutover must introduce or explicitly map the following durable responsibilities:

- `raw observation`
  - source-specific fetched/extracted unit with provenance and raw ingest status.
- `canonical document`
  - deduplicated normalized content artifact that may own one or more observations.
- `duplicate / story cluster`
  - group of canonical documents representing the same event, update stream, or high-overlap information unit.
- `verification result`
  - corroboration / independence / conflict / provenance quality state for canonical document or cluster.
- `interest filter result`
  - zero-shot semantic decision for a canonical document or cluster against a system interest or user interest.
- `final selection result`
  - downstream global selection truth derived from verification plus semantic filter results.

### Compatibility rules for current tables

- `articles` may remain as an existing storage/runtime compatibility surface during the cutover, but must stop being the only semantic decision unit.
- `final_selection_results` is the shipped additive final-selection truth as of stage-4; `system_feed_results` may remain as a compatibility read model/projection during intermediate stages, but it must not silently retake primary ownership of final selection.
- `discovery_source_interest_scores` and related discovery heuristics must not remain the primary upstream signal for generic source usefulness after the decoupling stage ships.
- Public/domain meaning must continue to use the universal-content contract from `docs/contracts/content-model.md`.

### Verification and selection rules

- Verification is not equivalent to interest match.
- A document may:
  - match the interest semantically but remain weakly verified;
  - fail semantic interest matching but still remain persisted as evidence;
  - remain `gray_zone` because verification or semantic meaning is unresolved.
- Final selection must combine:
  - semantic interest result,
  - verification state,
  - visibility / moderation / product gates,
  not a single legacy article-side score.

## Internal responsibility boundaries

- `services/fetchers`
  - owns source fetch, extraction, normalization inputs, and observation-side ingest handoff.
- `services/workers`
  - owns canonicalization, dedup/grouping, verification, semantic filtering, and final selection derivation.
- `services/api`, `apps/admin`, `apps/web`
  - own truthful read/write/operator surfaces over the new model, not shadow processing logic.
- `discovery`
  - may still register or discover candidate sources, but must stop owning downstream interest-selection truth.

## Stage map and cutover rules

### `STAGE-0-ZERO-SHOT-FILTERING-DESIGN-CONTRACT`

- produce this contract, stage map, migration boundaries, proof contour, and doc-sync rules;
- do not rewrite `docs/blueprint.md` as if the target architecture were already live.

### `STAGE-1-CANONICAL-DOCUMENT-AND-OBSERVATION-LAYER`

- add canonical document and observation ownership;
- preserve compatibility for existing article flows.
- shipped stage-1 runtime truth now persists additive PostgreSQL tables `canonical_documents` and `document_observations`;
- during this compatibility stage, `canonical_documents.canonical_document_id` reuses the canonical editorial article `doc_id` rather than introducing a fully decoupled identifier yet;
- fetchers persist pending raw article observations on ingest, worker dedup materializes canonical ownership, and current final selection still reads through `articles` plus `system_feed_results`.

### `STAGE-2-DUPLICATE-STORY-CLUSTERING-AND-VERIFICATION`

- add duplicate/story clustering and verification truth;
- avoid per-copy expensive semantic processing when canonical evidence already exists.
- shipped stage-2 runtime truth now persists additive PostgreSQL tables `story_clusters`, `story_cluster_members`, and `verification_results`, plus `canonical_documents.canonical_domain` for source-family-aware verification;
- worker `article.cluster` now materializes canonical-first story-cluster membership and verification results before the current legacy `event_clusters` / `system_feed_results` compatibility path continues;
- duplicate observations may refresh canonical-document verification and rebuild the linked story-cluster state, while missing canonical ownership must skip the additive stage-2 path without breaking the legacy cluster worker contract.

### `STAGE-3-ZERO-SHOT-INTEREST-FILTER-SPLIT`

- separate technical filters, verification, and semantic interest decisions.
- shipped stage-3 runtime truth now persists additive PostgreSQL table `interest_filter_results`;
- worker `article.match_criteria`, `article.match_interests`, and criterion/user gray-zone review updates now materialize explicit `technical_filter_state`, `semantic_decision`, compatibility decision, and verification snapshot rows on top of canonical/story verification;
- legacy `criterion_match_results`, `interest_match_results`, and `system_feed_results` still remain compatibility outputs at this stage, so the split is shipped without yet redefining final selection truth.

### `STAGE-4-FINAL-SELECTION-READ-MODEL-CUTOVER`

- shift final selection truth onto canonical/verification/filtering results.
- shipped stage-4 runtime truth now persists additive PostgreSQL table `final_selection_results`;
- worker final-selection derivation now summarizes system-criterion `interest_filter_results` plus the current canonical-or-story-cluster verification context into `selected` / `rejected` / `gray_zone`, and then projects bounded compatibility rows back into `system_feed_results`;
- API/public/admin selected-content read surfaces now prefer `final_selection_results` and fall back to `system_feed_results` only while a given article has not yet materialized a stage-4 row.

### `STAGE-5-DISCOVERY-SOURCE-SCORING-DECOUPLING`

- remove dependency from upstream source usefulness on current downstream `eligible_for_feed`.
- shipped stage-5 runtime truth now computes discovery channel-quality signals from generic intake evidence such as unique-article ratio, fetch health, freshness, lead-time, and duplication pressure;
- discovery repository/runtime must not join `system_feed_results`, `final_selection_results`, or other downstream selected-content tables when computing source usefulness;
- `discovery_source_interest_scores` remains mission-scoped, but its persisted `yield_score` semantics now represent generic source-yield quality rather than downstream selected-content yield.

### `STAGE-6-ADMIN-API-OBSERVABILITY-AND-OPERATOR-TOOLS`

- upgrade operator/admin/API/explain/diagnostics surfaces to the new model.
- shipped stage-6 runtime truth now exposes article observations, canonical documents, story clusters, verification state, final selection, and discovery channel-quality vocabulary explicitly across admin/operator/API explain surfaces;
- operator article/detail/explain surfaces must expose article observations separately from canonical document, story cluster, verification, and final selection truth;
- compatibility `system_feed_results` wording may remain visible only as explicit legacy projection and must not look like the primary selection source;
- discovery/observability/help surfaces must distinguish mission-scoped fit from generic channel-quality evidence and explain that final selection is no longer inferred from raw article processing state alone.

### `STAGE-7-BACKFILL-COMPATIBILITY-CLEANUP-AND-FINAL-SYNC`

- perform required backfill, remove compatibility-only paths, and archive the old architecture from runtime docs.
- shipped stage-7 runtime truth now treats `final_selection_results` as the primary worker-side gate for personalization/backfill decisions and leaves `system_feed_results` as bounded compatibility projection only;
- historical repair proof now explicitly clears and rebuilds additive stage-2/3/4 rows (`story_clusters`, `verification_results`, `interest_filter_results`, `final_selection_results`) before re-validating compatibility projection and retro-notification suppression;
- closeout keeps runtime docs archived around the new model instead of leaving the article-centric selection path live by inertia.

## Doc sync rules

- `docs/blueprint.md`
  - update only when a stage ships and durable current runtime truth actually changed.
- `docs/engineering.md`
  - update when ownership/boundary/refactor discipline changes durably.
- `docs/verification.md`
  - update when proof contour or close-gate expectations change durably.
- `.aidp/os.yaml`
  - update when machine-canonical commands, facts, or required contract docs change.
- `docs/work.md`
  - carries live capability planning, active stage, proof, risks, and handoff.
- `docs/history.md`
  - archives completed stages and cutover decisions once they are no longer live.

## Runtime and delivery considerations

- Sequence-first runtime and PostgreSQL-as-truth remain non-negotiable.
- Derived cluster/verification/filter results must remain rebuildable from PostgreSQL truth.
- Historical repair must stay explicitly scoped and must not silently mutate already selected data.
- Local compose remains the canonical proof baseline.

## Failure modes

- hidden re-coupling of source discovery to final selection truth;
- early semantic filtering that drops observations before canonicalization;
- per-copy expensive processing that defeats the cost model in duplicate-heavy corpora;
- writing future target behavior into `docs/blueprint.md` before the code/runtime actually ships;
- compatibility layers becoming accidental permanent truth.

## Minimum proof expectations

- Stage-0:
  - required-read-order reload;
  - contract doc sync in `docs/contracts/README.md`, `docs/work.md`, and other touched truth layers;
  - targeted consistency proof such as `git diff --check` and/or `rg` checks for references.
- Shipped `STAGE-4-FINAL-SELECTION-READ-MODEL-CUTOVER`:
  - requires `pnpm test:migrations:smoke`, `pnpm unit_tests`, `pnpm typecheck`, and `pnpm test:cluster-match-notify:compose`;
  - should attempt `pnpm integration_tests`, but if that broad gate fails on unrelated mixed-worktree RSS/canonical smoke drift, the residual must be recorded explicitly instead of being misreported as a stage-4 regression;
  - proof must explicitly cover additive `final_selection_results`, compatibility projection into `system_feed_results`, and final-selection-first read behavior for selected-content/API/admin surfaces.
- Shipped `STAGE-5-DISCOVERY-SOURCE-SCORING-DECOUPLING`:
  - requires `pnpm unit_tests`, `pnpm typecheck`, and `pnpm test:discovery-enabled:compose`;
  - must include targeted proof that discovery/source-scoring no longer reads downstream selected-content outcomes as an upstream learning signal;
  - should record any broad integration-gate residuals separately instead of hiding them inside the decoupling stage.
- Shipped `STAGE-7-BACKFILL-COMPATIBILITY-CLEANUP-AND-FINAL-SYNC`:
  - requires `pnpm unit_tests`, `pnpm typecheck`, `pnpm test:migrations:smoke`, `pnpm test:ingest:compose`, `pnpm test:cluster-match-notify:compose`, and `pnpm test:reindex-backfill:compose`;
  - must explicitly prove that historical repair rebuilds additive stage-2/3/4 rows and keeps compatibility `system_feed_results` aligned without retro-notifications;
  - if a previously green discovery compose proof later fails on compose-schema drift outside the declared zero-shot write scope, record that residual separately instead of misreporting it as a stage-7 regression.
- Implementation stages:
  - must follow `docs/verification.md` and strengthen proof as schema/runtime boundaries move.
- Capability closeout:
  - requires deterministic compose proof for the end-to-end path from ingest through canonicalization, clustering, verification, interest filtering, final selection, and historical repair visibility.

## Related files

- `docs/blueprint.md`
- `docs/engineering.md`
- `docs/verification.md`
- `.aidp/os.yaml`
- `docs/contracts/content-model.md`
- `docs/contracts/discovery-agent.md`
- `services/fetchers/*`
- `services/workers/app/*`
- `services/api/app/main.py`
- `apps/admin/*`
- `apps/web/*`

## Update triggers

- any stage that ships canonical document ownership, duplicate/story clustering, verification, semantic filtering, or final selection cutover;
- any schema or runtime change that affects compatibility with `articles`, `system_feed_results`, or discovery/source scoring;
- any proof-model change for this capability;
- any change in the declared stage map or cutover rules.
