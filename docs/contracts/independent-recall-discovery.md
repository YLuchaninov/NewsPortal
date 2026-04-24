# Independent Recall Discovery Contract

Этот документ фиксирует durable design contract для capability `C-INDEPENDENT-RECALL-DISCOVERY-CUTOVER`.

## Назначение

Подсистема должна добавить upstream interest-independent recall layer для discovery, чтобы:

- generic source acquisition не зависел от `interest_graph` как от единственного владельца planning truth;
- generic source quality persisted отдельно от mission-fit scoring;
- already shipped zero-shot filtering pipeline оставался downstream consumer найденного корпуса, а не переоткрывался как часть discovery redesign.

## Почему нужен отдельный contract doc

Текущий [discovery-agent.md](/Users/user/Documents/workspace/my/NewsPortal/docs/contracts/discovery-agent.md) truthfully описывает shipped graph-first discovery runtime. Новый capability не должен тайно переписывать этот контракт "задним числом". Нужен отдельный документ, который:

- сохраняет current graph-first truth как compatibility baseline;
- фиксирует target additive recall-first architecture;
- задает migration rules, чтобы новый recall layer не сломал already shipped mission/hypothesis flow.

## In scope

- additive independent-recall entities and state;
- generic source-quality snapshots and future recall-scoring truth;
- neutral recall missions/candidates that do not require `interest_graph`;
- bounded promotion path from recall-first candidates into `source_channels`;
- compatibility rules between graph-first discovery and recall-first discovery;
- proof contour и doc-sync rules for the cutover.

## Out of scope

- claiming that current discovery is already fully interest-independent;
- removing `discovery_missions`, `discovery_hypothesis_classes`, or mission graph planning before the additive recall path is shipped and proven;
- reopening the archived zero-shot filtering capability;
- using uncontrolled live internet as closeout proof;
- hiding unrelated compose schema drift inside this capability.

## Current baseline truth

Current shipped discovery truth remains the one documented in [discovery-agent.md](/Users/user/Documents/workspace/my/NewsPortal/docs/contracts/discovery-agent.md):

- discovery is graph-first and mission-centric;
- `discovery_missions.interest_graph` is authoritative planning state;
- `discovery_hypothesis_classes` is the taxonomy owner for planning;
- mission-fit scoring persists through `discovery_source_interest_scores`;
- portfolio assembly and gap-filling still operate on mission-fit scored sources;
- approved candidates still reach `source_channels` through the mission/hypothesis flow.

Stage-5 already removed dependence on downstream selected-content outcomes, but it did not make discovery itself interest-independent.
Shipped stage-1 of this capability now also persists additive `discovery_source_quality_snapshots` and maintenance read surfaces for `/maintenance/discovery/source-quality-snapshots*`; this creates an explicit generic source-quality layer without yet replacing graph-first mission planning or promotion ownership.
Shipped stage-2 of this capability now also persists additive `discovery_recall_missions` and `discovery_recall_candidates`, plus maintenance read/write surfaces for `/maintenance/discovery/recall-missions*` and `/maintenance/discovery/recall-candidates*`; neutral recall state can now exist without `interest_graph` or hypothesis classes, but it still does not own acquisition loops or promotion into `source_channels`.
Shipped stage-3 of this capability now also executes bounded recall-first acquisition for `rss` and `website`; neutral recall missions can actively search/probe via `acquire_recall_missions(...)` and `/maintenance/discovery/recall-missions/{recall_mission_id}/acquire`, persist additive recall candidates plus generic quality snapshots without `interest_graph`, and reuse shared `discovery_source_profiles` by canonical domain, but promotion into `source_channels` still remains explicitly out of scope.
Shipped stage-4 of this capability now also executes bounded recall-candidate promotion; `POST /maintenance/discovery/recall-candidates/{recall_candidate_id}/promote` reuses the existing PostgreSQL + outbox onboarding discipline, persists `registered_channel_id` on `discovery_recall_candidates`, and links shared `discovery_source_profiles` to the promoted channel when possible without removing the graph-first path.

## Target contract

### Product and runtime meaning

- discovery is not a ranking product;
- upstream discovery should build and refresh a broad source/corpus opportunity set;
- system interests and user interests remain downstream consumers of found information rather than the only driver of what may be discovered.

### Processing model

Target high-level flow:

`neutral recall acquisition -> generic source quality evaluation -> bounded promotion into source_channels -> existing ingest/canonical/filter/select pipeline`

Rules:

- generic recall entities must stay additive-first until the new path is proven;
- graph-first mission planning may remain as one consumer/booster of discovery, but must stop being the only owner of source acquisition;
- generic source quality must be materialized separately from mission-fit scores;
- downstream zero-shot filtering remains untouched unless a later capability explicitly changes it.

## Core data responsibilities

The cutover must introduce or explicitly map the following durable responsibilities:

- `generic source quality snapshot`
  - persisted, rebuildable, interest-independent quality assessment for a source profile/channel using generic intake evidence.
- `independent recall mission`
  - bounded recall-first acquisition job or grouping that does not require `interest_graph`.
- `independent recall candidate`
  - source candidate found through the recall-first path before mission-fit scoring or downstream selection.
- `promotion decision`
  - bounded decision that allows a recall-first candidate to become a normal `source_channel` through the same PostgreSQL + outbox discipline used elsewhere.

## Compatibility rules

- `discovery_missions`, `discovery_hypotheses`, `discovery_candidates`, `discovery_source_interest_scores`, and `discovery_portfolio_snapshots` remain shipped graph-first compatibility truth until later stages explicitly downgrade them.
- `discovery_source_profiles` remains the shared source-profile anchor for both graph-first and future recall-first discovery.
- New generic recall/source-quality state must not silently replace mission-fit scoring until public/admin/API surfaces are updated to distinguish the two meanings.
- `source_channels` onboarding must keep the existing PostgreSQL + outbox contract.

## Stage map

### `STAGE-0-INDEPENDENT-RECALL-DESIGN-CONTRACT`

- create this contract;
- define current-vs-target discovery truth;
- declare stage breakdown, additive migration boundaries, and proof contour.

### `STAGE-1-INDEPENDENT-RECALL-QUALITY-FOUNDATION`

- add additive generic recall/source-quality storage and runtime materialization;
- keep the current graph-first mission runtime as-is;
- generic source quality may be populated from existing discovery execution/re-evaluation as long as it remains clearly separate from mission-fit scoring.
- shipped truth:
  - additive table `discovery_source_quality_snapshots` now persists generic recall/source-quality snapshots per source profile/channel;
  - worker discovery execution and re-evaluation now materialize those snapshots alongside the existing mission-fit `discovery_source_interest_scores`;
  - maintenance API now exposes `/maintenance/discovery/source-quality-snapshots*` as a read surface for the new generic quality layer.

### `STAGE-2-INDEPENDENT-RECALL-MISSION-AND-CANDIDATE-LAYER`

- add bounded neutral recall missions and candidate state without requiring `interest_graph` or hypothesis classes.
- shipped truth:
  - additive tables `discovery_recall_missions` and `discovery_recall_candidates` now persist neutral recall backlog independently from graph-first `discovery_missions` / `discovery_candidates`;
  - maintenance API now exposes `/maintenance/discovery/recall-missions*` and `/maintenance/discovery/recall-candidates*` for bounded neutral recall CRUD/read access;
  - recall candidates now auto-link to existing `discovery_source_profiles` by canonical domain when possible and surface the latest additive `discovery_source_quality_snapshots` on reads;
  - graph-first mission planning, hypothesis execution, and promotion into `source_channels` remain unchanged compatibility owners.

### `STAGE-3-INDEPENDENT-RECALL-ACQUISITION-LOOPS`

- add bounded recall-first acquisition loops for provider types such as RSS and website;
- graph-first mission planning may seed or prioritize, but must not remain the sole acquisition owner.
- shipped truth:
  - worker orchestration now exposes `acquire_recall_missions(...)` for bounded neutral recall acquisition;
  - maintenance API now exposes `POST /maintenance/discovery/recall-missions/{recall_mission_id}/acquire` as the operator entrypoint for recall-first search/probe runs;
  - recall-first acquisition currently stays bounded to `rss` and `website`, persists additive `discovery_recall_candidates`, reuses shared `discovery_source_profiles`, and materializes `discovery_source_quality_snapshots` with `snapshot_reason = recall_acquisition`;
  - graph-first mission planning and promotion into `source_channels` remain unchanged compatibility owners.

### `STAGE-4-INDEPENDENT-RECALL-PROMOTION-CUTOVER`

- allow bounded promotion from recall-first candidates into `source_channels`;
- preserve explicit auditability and PostgreSQL + outbox discipline.
- shipped truth:
  - `discovery_recall_candidates` now persist `registered_channel_id` for promoted or duplicate-resolved recall candidates;
  - maintenance API now exposes `POST /maintenance/discovery/recall-candidates/{recall_candidate_id}/promote` for bounded recall-candidate promotion;
  - promotion reuses `PostgresSourceRegistrarAdapter` and the existing `source.channel.sync.requested` outbox contract instead of introducing a parallel onboarding path;
  - shared `discovery_source_profiles` now link themselves to the promoted channel when a recall candidate promotion resolves to a concrete channel.

### `STAGE-5-INDEPENDENT-RECALL-OBSERVABILITY-AND-COMPATIBILITY-CLEANUP`

- update operator/admin/API surfaces to distinguish:
  - generic source quality,
  - graph-first mission fit,
  - neutral recall backlog and promotion state,
  - downstream zero-shot filtering outcomes;
- archive the old discovery truth once the recall-first path is truly shipped.
- shipped truth:
  - discovery summary now reports promoted and duplicate recall-candidate counts alongside graph-first mission counters;
  - source-profile reads now surface the latest additive generic source-quality snapshot directly on the operator read model;
  - admin/help discovery surfaces now present shipped runtime as a dual-path control plane and distinguish mission fit, generic source quality, neutral recall backlog, and recall-promotion state explicitly.

## Doc sync rules

- [.aidp/blueprint.md](/Users/user/Documents/workspace/my/NewsPortal/.aidp/blueprint.md)
  - update only when a stage ships and current runtime truth changes durably.
- [docs/contracts/discovery-agent.md](/Users/user/Documents/workspace/my/NewsPortal/docs/contracts/discovery-agent.md)
  - keep truthful current graph-first runtime contract until later stages actually demote it.
- [.aidp/engineering.md](/Users/user/Documents/workspace/my/NewsPortal/.aidp/engineering.md)
  - update when additive recall boundaries or engineering discipline change durably.
- [.aidp/verification.md](/Users/user/Documents/workspace/my/NewsPortal/.aidp/verification.md)
  - update when new minimum proof for recall-first stages becomes durable.
- [.aidp/os.yaml](/Users/user/Documents/workspace/my/NewsPortal/.aidp/os.yaml)
  - update when the new contract becomes required context or new machine-canonical runtime facts exist.
- [.aidp/work.md](/Users/user/Documents/workspace/my/NewsPortal/.aidp/work.md)
  - carry the active stage, proof state, and handoff.
- [.aidp/history.md](/Users/user/Documents/workspace/my/NewsPortal/.aidp/history.md)
  - archive completed stages and the capability once no truthful live next stage remains.

## Failure modes

- generic source quality gets mixed back into mission-fit scores without clear storage or naming separation;
- additive recall storage quietly becomes primary truth before admin/API surfaces are updated;
- a stage claims interest-independent discovery while still requiring `interest_graph` for all acquisition;
- unrelated discovery schema drift is misreported as a regression of the new capability;
- downstream zero-shot filtering gets reopened accidentally instead of remaining a consumer of the new recall layer.

## Minimum proof expectations

- `STAGE-0-INDEPENDENT-RECALL-DESIGN-CONTRACT`
  - required-read-order reload;
  - sync this contract plus touched truth layers;
  - targeted consistency proof for references and formatting.
- `STAGE-1-INDEPENDENT-RECALL-QUALITY-FOUNDATION`
  - `pnpm unit_tests`
  - `pnpm typecheck`
  - `pnpm test:migrations:smoke`
  - targeted Python proof for generic recall/source-quality scoring and persistence
  - targeted API proof if new maintenance read surfaces are added
- `STAGE-3-INDEPENDENT-RECALL-ACQUISITION-LOOPS`
  - `python -m py_compile` for touched Python worker/API/tests
  - targeted Python proof for bounded recall-first acquisition orchestration and API delegation
  - `pnpm unit_tests`
  - `pnpm typecheck`
  - `git diff --check --` on touched stage files
- `STAGE-4-INDEPENDENT-RECALL-PROMOTION-CUTOVER`
  - `pnpm test:migrations:smoke`
  - `python -m py_compile` for touched Python API/tests
  - targeted Python proof for recall-candidate promotion and source-channel onboarding discipline
  - `pnpm unit_tests`
  - `pnpm typecheck`
  - `git diff --check --` on touched stage files
- `STAGE-5-INDEPENDENT-RECALL-OBSERVABILITY-AND-COMPATIBILITY-CLEANUP`
  - `python -m py_compile` for touched Python API/tests
  - targeted TS/Python proof for operator helpers and discovery read-model wording
  - `pnpm unit_tests`
  - `pnpm typecheck`
  - `git diff --check --` on touched stage files
- capability implementation closeout may archive after stage-5 proof passes if the only remaining gap is the separately tracked compose discovery schema-drift residual; that residual must stay explicit as a follow-up lane rather than silently blocking doc/runtime sync.
