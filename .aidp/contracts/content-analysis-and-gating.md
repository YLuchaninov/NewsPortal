# Контракт content analysis and gating

Этот contract обязателен, когда работа трогает persisted content analysis, NER/entities, labels, content filter policies, post-selection gates, analysis read APIs, admin Analysis/Filter Policies UI или MCP `content_analysis.*` surfaces.

## Назначение

`content_analysis` is a universal layer for durable machine-readable enrichment and explicit filtering decisions over content subjects. It adds observable analysis facts without replacing ingest, canonicalization, interest filtering, final selection or personalization.

## Subject model

- Supported runtime target subject types are `article`, `web_resource` and `story_cluster`. `canonical_document` is reserved/future for read compatibility and is not a v1 backfill target.
- `subject_id` must reference the owner table id for the subject type.
- `canonical_document_id` and `source_channel_id` are denormalized explain/query aids only; they must not become alternate primary keys.
- Analysis rows are additive durable facts in PostgreSQL and may be replayed/backfilled.

## Durable tables

- `content_analysis_policies` declares analysis jobs/providers and default options.
- `content_analysis_results` stores normalized analysis outputs such as `ner`, `sentiment`, `category`, `system_interest_label`, `cluster`, `content_filter`, `structured_extraction`.
- `content_entities` stores queryable NER/entity projections from an analysis result.
- `content_labels` stores queryable labels, including projected `system_interest` decisions.
- `content_filter_policies` stores configurable final gate policies.
- `content_filter_results` stores per-subject gate decisions and explanation and is the owner-table for content gate decisions.

PostgreSQL remains source of truth. Queue context, SDK response fields, UI chips and MCP responses are read projections over these tables.

## Initial rollout truth

- Stage 1 ships deterministic heuristic NER as `provider=heuristic`, `model_key=newsportal-titlecase-v1`.
- Stage 1 ships system-interest label projection from existing `interest_filter_results`; it does not re-run interest matching.
- Stage 1 ships a default recent-content gate policy as `dry_run`, not enforce-by-default.
- Stage 2 ships queued content-analysis backfill through `reindex_jobs.job_kind = content_analysis`; it replays existing articles/resources, writes progress into `options_json.progress` and skips retro notifications.
- Stage 2 ships admin policy create/update forms. Updates to mode, combiner or `policy_json` create a new policy version and deactivate the previous one.
- Stage 3 ships local deterministic `sentiment` and `category` modules as safe observe-mode signals. They persist `content_analysis_results` and queryable `content_labels` with label types `sentiment`, `tone`, `risk` and `taxonomy`.
- Stage 4 ships `cluster_summary` projection for existing `story_clusters`. It records verification counts, source-family context, top entities/places and member canonical documents without changing clustering thresholds or feed visibility.
- Stage 5 ships management surfaces for `content_analysis_policies` through FastAPI, SDK, admin and MCP. Runtime-significant policy updates create a new policy version and deactivate the previous one.
- Stage 6 ships runtime consumption of active local `content_analysis_policies.config_json` for deterministic `ner`, `sentiment`, `category` and `system_interest_label` modules. Unsupported external provider/model policies are recorded as skipped by the runtime path and do not dispatch network/model calls.
- Stage 7 ships configurable `structured_extraction` templates through `content_analysis_policies.config_json`; this module intentionally calls Gemini for strict JSON extraction when an enabled policy applies, and broad backfill/default replay must not include it unless explicitly requested.
- Default sequence graph adds:
  - `content.ner_extract` after embedding;
  - `content.sentiment_analyze` and `content.category_classify` after NER;
  - `content.structured_extract` as an opt-in operator/backfill/sequence-available module for configurable LLM JSON extraction;
  - `content.system_interest_label_project` after criterion matching;
  - `content.cluster_summary_project` after clustering;
  - `content.filter_gate` after clustering.
- Enforce/hold semantics are explicit future stages unless an operator creates or updates a policy into those modes with confirmation.

## Separation from selection

- `interest_filter_results` and `final_selection_results` remain primary selection truth.
- `content_labels` may project system interest decisions for search/filtering, but must not become the owner of selection decisions.
- `content_filter_results` may explain an additional gate and is the durable source of truth for gate decisions. `content_analysis_results.analysis_type = "content_filter"` is only a summary/projection snapshot. Until enforce behavior is wired by a declared stage, dry-run/observe results must not hide content from user feeds.
- Personalization still consumes system-selected content and must not bypass system gates.

## Policy model

`content_filter_policies.policy_json` is structured JSON. Current supported rules include relative date checks, persisted-label checks and structured extraction field checks.

`content_analysis_policies.config_json` is also structured JSON. Local deterministic modules currently support only bounded config keys:

- `ner`: `maxTextChars`, `entityTypeAllowlist`;
- `sentiment`: `maxTextChars`, `positiveTerms`, `negativeTerms`, `riskTerms`, `positiveThreshold`, `negativeThreshold`, `riskScaleTerms`, `highRiskThreshold`, `riskWatchThreshold`;
- `category`: `maxTextChars`, `taxonomyTerms`, `minScore`, `maxCategories`;
- `system_interest_label`: `includeGrayZone`, `includeNoMatch`.
- `structured_extraction`: `templateKey`, `maxTextChars`, `instructions`, `allowHighCardinalityLabels`, `entityTypes[]` with field definitions and `project` targets.

Provider/model fields are provenance and dispatch hints. For local deterministic modules, only the shipped local provider/model pairs are executable; other providers must not be called implicitly. For `structured_extraction`, provider `gemini` is executable by explicit active policy and explicit module request/sequence configuration, and records LLM usage metadata. Projecting free-text extracted fields into `content_labels` is blocked by default unless `allowHighCardinalityLabels` is true.

Relative date example:

```json
{
  "dateFallback": ["source_lastmod_at", "discovered_at", "ingested_at"],
  "onPass": "keep",
  "onFail": "reject",
  "rules": [
    {
      "key": "published_not_older_than_3_months",
      "field": "published_at",
      "op": "gte_relative",
      "value": { "amount": 3, "unit": "months" }
    }
  ]
}
```

Persisted label example:

```json
{
  "onPass": "needs_review",
  "onFail": "keep",
  "rules": [
    {
      "key": "negative_sentiment",
      "field": "label",
      "op": "has_label",
      "value": {
        "labelType": "sentiment",
        "labelKey": "negative",
        "minScore": 0.2
      }
    }
  ]
}
```

Supported label operators are `has_label` and `not_has_label`. Label rules may include `labelType`, `labelKey`, `decisions` and `minScore`.

Structured extraction rules may use `has_extracted_field`, `extracted_field_in` and `extracted_date_gte_relative`. They read the latest completed `structured_extraction` result for the subject and should record matched entity type, field key, confidence and threshold where relevant.

Policy modes:

- `disabled` skips evaluation.
- `observe` records evidence without operator intent to gate.
- `dry_run` records what would happen and is the default safe mode.
- `hold` is reserved for review workflows.
- `enforce` is reserved for a declared rollout where read paths explicitly honor the gate.

## API, admin and MCP

- FastAPI `/maintenance/content-analysis`, `/maintenance/content-entities`, `/maintenance/content-labels`, `/maintenance/content-filter-policies` and `/maintenance/content-filter-results` expose the layer.
- FastAPI `/maintenance/content-analysis-policies` exposes analysis module policy configuration.
- FastAPI `/maintenance/content-analysis/backfill` queues safe replay work through the maintenance job/outbox path.
- Article/resource/content detail responses may attach `analysis_summary` as a compact projection.
- Admin surfaces may show analysis evidence and policy lists, but must keep policy writes bounded and auditable when added.
- MCP tools are explicit namespaced operator tools: `content_analysis.*`, `content_analysis_policies.*`, `content_entities.*`, `content_labels.*`, `content_filter_policies.*`, `content_filter_results.*`.
- MCP mutating policy tools require `write.sequences` and must write audit entries.

## Инварианты

- Analysis is explainable derived truth, not hidden scoring magic.
- Analysis jobs must be replay-safe and idempotent for the same subject/provider/model/source hash.
- NER/entities and labels are query aids and must preserve provenance through `analysis_id`.
- Local sentiment/category classifiers are deterministic heuristics. They are filterable evidence, not a replacement for provider-grade NLP quality.
- Structured extraction is hybrid: local hints are deterministic, but final extraction is LLM JSON output validated against the operator template.
- Cluster summaries are projections over existing `story_clusters`, `story_cluster_members` and `verification_results`; they must not become a second owner for cluster membership or verification.
- Analysis policies are durable operator configuration. Local deterministic modules may consume bounded `config_json`; external provider/model values must not secretly trigger provider execution.
- Relative time filters must record the actual field used and the threshold.
- Historical backfill must use the maintenance job path, track progress, and skip retro notifications.
- Default behavior must stay safe: observe or dry-run unless a stage explicitly proves enforce behavior.
- Paid/external model calls are allowed only for explicitly configured modules with budget, provider and failure-mode proof; currently this means `structured_extraction` with provider `gemini`.

## Proof expectations

Minimum for Stage 1 style changes:

- migration smoke when feasible;
- targeted Python unit tests for NER and policy evaluation;
- `pnpm typecheck`;
- `pnpm lint:py`;
- MCP/admin type proof when surfaces change;
- relevant compose proof when enforce/read-path behavior changes.

## Update triggers

Update this contract when subject types, durable analysis tables, policy modes, rule operators, sequence plugins, default policy behavior, read-path enforcement, admin/MCP tool catalog or external provider behavior changes.
