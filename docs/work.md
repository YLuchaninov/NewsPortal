# Work

Это live execution document для репозитория.

Используй его для:

- short current memory;
- capability planning и active execution state;
- worktree coherence;
- known gaps и next recommended action;
- test artifacts и cleanup state;
- handoff state.

Не используй его как длинный журнал истории.
Durable completed detail переносится в `docs/history.md`.

## Current mode

- Operating mode: normal
- Why now: on 2026-04-19 the user asked to move discovery from the already-proven `runtime=pass / nonRegression=pass / yield=weak` baseline toward a truthful `good yield` capability without breaking the existing downstream filtering pipeline and without shaping discovery core around Example B/C.

## Current memory

- Runtime core инициализирован; ordinary implementation work разрешен.
- On 2026-04-20 `STAGE-4D-GENERALIZED-PROFILE-BACKED-RECALL-VALIDITY-AND-YIELD-RETUNE` closed and the parent capability `C-DISCOVERY-GOOD-YIELD` reached full completion:
  - the reusable profile-backed Example B/C harness still materializes stable `discovery_policy_profiles` before graph/recall execution and reuses the same profile truth for automation plus manual replay;
  - `pnpm test:discovery:examples:compose` remains the canonical single-run entrypoint for the profile-backed Example B/C harness;
  - single-run artifacts still include `manualReplaySettings` per case with profile identity, graph/recall policy, benchmark cohort, exact mission seeds/queries, and applied profile version/policy snapshots;
  - `DISCOVERY_MODE_TESTING.md` remains the primary operator handbook for manual replay of those proof-backed profiles, while `README.md`, `EXAMPLES.md`, and `docs/manual-mvp-runbook.md` only point into that handbook;
  - latest authoritative proof artifacts now are:
    - `/tmp/newsportal-live-discovery-examples-b41de125.json`
    - `/tmp/newsportal-live-discovery-examples-b41de125.md`
    - `/tmp/newsportal-live-discovery-yield-proof-a59832ca.json`
    - `/tmp/newsportal-live-discovery-yield-proof-a59832ca.md`
    - `/tmp/newsportal-discovery-nonregression-f499bb13.json`
    - `/tmp/newsportal-discovery-nonregression-f499bb13.md`
  - latest authoritative result:
    - latest single-run `runtimeVerdict=pass`, `yieldVerdict=pass`, `finalVerdict=pass`
    - final multi-run gate `runtimeVerdict=pass`, `yieldVerdict=pass`, `finalVerdict=pass`
    - multi-run per-pack counts are now:
      - `Example B = 3/3`
      - `Example C = 3/3`
    - non-regression `nonRegressionVerdict=pass`
    - the latest synced manual replay baseline used applied profile version `22`; operators should still trust the `manualReplaySettings` from their own fresh artifact if later reruns advance that version again.
- The profile-backed proof fixes that unlocked the closeout are now part of shipped discovery truth:
  - profile materialization and API normalization preserve `supportedWebsiteKinds` instead of dropping them from `discovery_policy_profiles`;
  - graph and recall candidate materialization now persist `registered_channel_id` immediately for truthfully duplicate-linked sources, so duplicate outcomes count as real onboarding evidence without waiting for a later manual promote/approve step.
- On 2026-04-20 `C-DISCOVERY-PROFILES-ADMIN` was implemented and proven end to end:
  - additive schema/runtime truth now includes reusable `discovery_policy_profiles` plus nullable mission/recall `profile_id`, `applied_profile_version`, and `applied_policy_json`;
  - maintenance API and admin BFF/UI now support reusable profile CRUD, mission/recall profile attachment, and explainability-first structured policy rendering on `/admin/discovery`;
  - authoritative proof:
    - `pnpm test:discovery:admin:compose`
    - `/tmp/newsportal-live-discovery-examples-682e955a.json|md`
    - `/tmp/newsportal-discovery-nonregression-9c663b86.json|md`
  - result:
    - discovery admin/operator acceptance passed with reusable profile CRUD plus graph/recall attach flows;
    - live discovery runtime stayed `runtimeVerdict=pass`;
    - discovery downstream safety stayed `nonRegressionVerdict=pass`;
    - overall discovery yield remains `weak`, which is unchanged capability residue rather than a regression from profiles.
- `C-DISCOVERY-GOOD-YIELD` is now completed and archived in `docs/history.md`; discovery keeps the already-proven `runtime=pass` and `nonRegression=pass` baseline and now also has proof-backed `yield=pass` on the required multi-pack contour.
- `STAGE-3-GENERALIZED-CANDIDATE-MIX-TUNING` is now archived:
  - authoritative artifact: `/tmp/newsportal-live-discovery-examples-ac199047.json|md`
  - result: `runtimeVerdict=pass`, `yieldVerdict=weak`, but both runtime packs reached `candidate_not_valid=0` after case-owned graph-class isolation, which moved the bottleneck away from graph false negatives and into recall policy.
- `STAGE-4-REVIEW-AND-PROMOTION-POLICY-TUNING` is now archived:
  - authoritative live artifact: `/tmp/newsportal-live-discovery-examples-85142a9e.json|md`
  - authoritative non-regression artifact: `/tmp/newsportal-discovery-nonregression-3a7f0438.json|md`
  - result:
    - top-level `runtimeVerdict=pass`
    - top-level `yieldVerdict=weak`
    - Example C reached `yield pass` with `2` onboarded channels and bounded downstream fetch evidence
    - Example B remained `yield weak`, but its blocker shifted from threshold policy to recall `candidate_not_valid` / `invalid_feed` noise
    - downstream frozen-corpus drift stayed `0`
- `STAGE-1-YIELD-CONTRACT-AND-DIAGNOSTICS` is now implemented and freshly proven:
  - [`infra/scripts/lib/discovery-live-yield-policy.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/lib/discovery-live-yield-policy.mjs) now exports canonical `NORMALIZED_YIELD_REASON_BUCKETS` and writes `normalizedReasonBuckets` per pack alongside the existing weak-yield rollups;
  - the same generalized policy layer now treats missing `registeredChannelId` after approve/promote/duplicate as explicit `registration_failed` evidence instead of leaving it implicit in residual wording;
  - [`infra/scripts/test-live-discovery-examples.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/test-live-discovery-examples.mjs) now persists those `registration_failed` signals on graph/recall candidates and renders both free-form weak-yield reasons and normalized buckets in the Markdown artifact;
  - [`infra/scripts/test-live-discovery-yield-proof.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/test-live-discovery-yield-proof.mjs) now records per-run dominant root cause, per-pack `rootCauseCounts`, and explicit aggregate root-cause drift across the bounded multi-run proof;
  - [`tests/unit/ts/discovery-live-yield-policy.test.ts`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/ts/discovery-live-yield-policy.test.ts) now covers normalized buckets, explicit registration failures, and multi-run root-cause drift rollups.
- Fresh authoritative Stage-1 proof artifacts now exist:
  - single-run diagnostics refresh:
    - `/tmp/newsportal-live-discovery-examples-bcb081e3.json`
    - `/tmp/newsportal-live-discovery-examples-bcb081e3.md`
    - result: `runtimeVerdict=pass`, `yieldVerdict=weak`, `finalVerdict=yield_weak`
    - dominant root cause stayed `review_policy_problem`
    - canonical normalized buckets are now present per pack; both Example B and Example C showed `candidate_not_valid=20`, `below_auto_promotion_threshold=8`, and `candidate_found_not_onboarded` counts (`8` / `5`)
  - multi-run diagnostics refresh:
    - `/tmp/newsportal-live-discovery-yield-proof-e064e243.json`
    - `/tmp/newsportal-live-discovery-yield-proof-e064e243.md`
    - backing runs:
      - `/tmp/newsportal-live-discovery-examples-0da5f38f.json|md`
      - `/tmp/newsportal-live-discovery-examples-bc376f12.json|md`
      - `/tmp/newsportal-live-discovery-examples-0cfb10dc.json|md`
    - result: `runtimeVerdict=pass`, `yieldVerdict=weak`, `finalVerdict=yield_weak`
    - per-pack root-cause drift is now explicit:
      - Example B: `review_policy_problem=3`
      - Example C: `review_policy_problem=3`
- `STAGE-2-TECHNICAL-FALSE-NEGATIVE-REPAIR` is now implemented and freshly proven:
  - [`services/workers/app/task_engine/adapters/rss_probe.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/task_engine/adapters/rss_probe.py) now performs bounded alternate-feed recovery for `rss` discovery probes: if the original target is an HTML page rather than a parseable feed, the adapter can recover `<link rel="alternate" type="application/rss+xml|atom+xml">` feeds, re-probe them, and surface the resulting concrete feed URL through `feed_url`, `final_url`, and `discovered_feed_urls`;
  - [`services/workers/app/task_engine/discovery_plugins.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/task_engine/discovery_plugins.py) now preserves `feed_url`, `final_url`, `discovered_feed_urls`, and `error_text` in the `discovery.rss_probe` plugin output instead of dropping those fields before the orchestrator sees them;
  - [`docs/contracts/discovery-agent.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/contracts/discovery-agent.md) now records this as current durable truth: supported HTML origins may recover alternate feeds while still staying inside the `rss` provider boundary;
  - targeted Python unit coverage now lives in:
    - [`tests/unit/python/test_task_engine_discovery_plugins.py`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/python/test_task_engine_discovery_plugins.py)
    - [`tests/unit/python/test_discovery_rss_probe_adapter.py`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/python/test_discovery_rss_probe_adapter.py)
- Fresh authoritative Stage-2 proof artifact now exists:
  - `/tmp/newsportal-live-discovery-examples-94fbc963.json`
  - `/tmp/newsportal-live-discovery-examples-94fbc963.md`
  - result: `runtimeVerdict=pass`, `yieldVerdict=weak`, `finalVerdict=yield_weak`
  - comparison versus the Stage-1 baseline shows:
    - Example C `candidate_not_valid` dropped from `20` to `7`
    - Example C benchmark-like candidates no longer died as `candidate_not_valid`; all `4` benchmark-like rejects moved to `below_auto_promotion_threshold`
    - Example B still remained `yield_weak`, but its benchmark-like invalidation stayed bounded (`2` benchmark-like `candidate_not_valid`) instead of becoming the dominant loss class
- The case-agnostic discovery proof stage requested on 2026-04-19 is now implemented and proven:
  - `infra/scripts/lib/discovery-live-example-cases.mjs` now exports explicit runtime and validation case-pack sets, adds `packClass` / `executionMode`, and includes a synthetic `generic_long_tail_exploratory` validation-only pack so calibration is no longer architecturally limited to Example B/C;
  - `infra/scripts/lib/discovery-live-yield-policy.mjs` now exposes generalized root-cause diagnostics (`generation_problem`, `quality_problem`, `review_policy_problem`, `registration_problem`, `downstream_ingest_problem`, `downstream_usefulness_problem`) plus aggregate root-cause rollups, while keeping the scoring/approval core reusable across packs;
  - `infra/scripts/test-live-discovery-examples.mjs` now separates runtime-enabled case packs from validation packs, records pack class, root-cause classification, aggregate yield diagnostics, and keeps the existing DDGS-only runtime lane truthful rather than Example-shaped;
  - `infra/scripts/test-discovery-pipeline-nonregression.mjs` now owns the new safety proof lane for discovery vs pre-existing downstream corpus stability and writes `/tmp/newsportal-discovery-nonregression-<runId>.json|md`.
- The repo now ships a separate DDGS-only discovery yield-proof contour on top of the already hardened runtime lane:
  - `infra/scripts/lib/discovery-live-yield-policy.mjs` now owns pure repo-owned yield classification, benchmark matching, calibration agreement, case/runtime verdict splits, and multi-run aggregation logic for Example B/C;
  - `infra/scripts/lib/discovery-live-example-cases.mjs` now carries case-specific benchmark cohorts, negative/positive tuning patterns, separate graph/recall thresholds, and bounded human-truth calibration fixtures for Example B developer news and Example C outsourcing;
  - `infra/scripts/test-live-discovery-examples.mjs` now emits separate `runtimeVerdict`, `yieldVerdict`, `calibrationPassed`, benchmark-like candidate evidence, top rejected domains/tactics, and per-case weak-yield summaries; `yield_weak` is now the truthful single-run non-regression outcome whenever runtime passes but onboarding/downstream usefulness does not;
  - `infra/scripts/test-live-discovery-yield-proof.mjs` now runs the bounded `3`-run proof contour and fails only as explicit good-yield proof failure when the current DDGS-only policy does not reach the required `2/3` per-case yield acceptance.
- Fresh authoritative proof artifacts for the new yield contract now exist:
  - single-run non-regression proof:
    - `/tmp/newsportal-live-discovery-examples-22232424.json`
    - `/tmp/newsportal-live-discovery-examples-22232424.md`
    - result: `runtimeVerdict=pass`, `yieldVerdict=weak`, `finalVerdict=yield_weak`, calibration `14/14` for both Example B and Example C
  - multi-run yield proof:
    - `/tmp/newsportal-live-discovery-yield-proof-d0eb2887.json`
    - `/tmp/newsportal-live-discovery-yield-proof-d0eb2887.md`
    - backing runs:
      - `/tmp/newsportal-live-discovery-examples-3e265fd2.json|md`
      - `/tmp/newsportal-live-discovery-examples-5b117936.json|md`
      - `/tmp/newsportal-live-discovery-examples-e87dd8c5.json|md`
    - result: `runtimeVerdict=pass`, `yieldVerdict=weak`, `finalVerdict=yield_weak`; Example B passed `0/3` required yield runs and Example C passed `0/3`.
- Fresh authoritative proof artifacts for the generalized case-agnostic safety contour now also exist:
  - single-run live harness after the refactor:
    - `/tmp/newsportal-live-discovery-examples-b7b86b83.json`
    - `/tmp/newsportal-live-discovery-examples-b7b86b83.md`
    - result: `runtimeVerdict=pass`, `yieldVerdict=weak`, `finalVerdict=yield_weak`
  - discovery non-regression proof:
    - `/tmp/newsportal-discovery-nonregression-0c105e1b.json`
    - `/tmp/newsportal-discovery-nonregression-0c105e1b.md`
    - result: `runtimeVerdict=pass`, `nonRegressionVerdict=pass`, `yieldVerdict=weak`, `finalVerdict=pass_with_residuals`
    - frozen-corpus drift counts were `0` for `interest_filter_results`, `final_selection_results`, `system_feed_results`, `llm_review_log`, and `notification_log`
- The repo now ships a dedicated operator-facing discovery handbook at `DISCOVERY_MODE_TESTING.md`, aligned with the current dual-path discovery runtime and linked from `README.md`, `EXAMPLES.md`, and `docs/manual-mvp-runbook.md`.
- The repo now also ships a DDGS-only live discovery automation:
  - `infra/scripts/test-live-discovery-examples.mjs`
  - `infra/scripts/lib/discovery-live-example-cases.mjs`
  - the harness is agent-runnable end to end, fails fast if `DISCOVERY_SEARCH_PROVIDER != ddgs` or if Brave/Serper discovery keys are populated, verifies Example B/C runtime bundle preconditions from DB instead of parsing Markdown, runs both graph-first and recall-first discovery lanes per case through maintenance APIs, triggers `fetchers run:once` on onboarded channels, and writes evidence bundles to `/tmp/newsportal-live-discovery-examples-<runId>.json|md`.
  - `docs/contracts/test-access-and-fixtures.md` now also lists this harness as an approved deterministic stateful test procedure on the local compose baseline.
  - proof hardening on 2026-04-19 now also makes the lane truthfully non-flaky on the current residue-heavy compose DB:
    - `services/workers/app/smoke.py` now forces the adaptive smoke walkthrough to plan only against its own `adaptive_smoke_*` class instead of competing with active `live_example_*` residue;
    - `services/workers/app/discovery_orchestrator.py` now supports bounded class-key filtering for active registry reads so the smoke walkthrough can isolate planning without mutating other operator classes;
    - `database/migrations/0039_discovery_orchestrator_timeout_tuning.sql` raises orchestrator task budgets for `plan_hypotheses`, `evaluate_results`, and `re_evaluate_sources`, fixing the real Example C `plan_hypotheses` timeout on live DDGS runs;
    - `infra/scripts/test-live-discovery-examples.mjs` now treats latest `sequence_task_runs` state as a more truthful progress signal than stale run-level `running`, and its final verdict now distinguishes honest weak live yield (`pass_with_residuals`) from genuine runtime/preflight failure.
  - fresh proof artifacts now exist for the hardened lane:
    - `/tmp/newsportal-live-discovery-examples-b780e589.json`
    - `/tmp/newsportal-live-discovery-examples-b780e589.md`
    - `/tmp/newsportal-live-discovery-examples-bbc3fdad.json`
    - `/tmp/newsportal-live-discovery-examples-bbc3fdad.md`
  - the latest full live run `bbc3fdad` is now the authoritative proof artifact:
    - `pnpm test:discovery-enabled:compose` passed;
    - `pnpm test:discovery:admin:compose` passed;
    - `env DISCOVERY_ENABLED=1 node infra/scripts/test-live-discovery-examples.mjs` exited `0`;
    - final verdict was `pass_with_residuals`;
    - both Example B and Example C completed graph + recall lanes, but both remained `completed_with_residuals` because DDGS live results produced only rejected/not-onboarded candidates and no downstream-useful channels.
- `docs/blueprint.md` остается главным architectural source of truth для boundaries, ownership и durable system behavior.
- `docs/contracts/test-access-and-fixtures.md` обязателен whenever work touches local PostgreSQL/Redis-backed proof, Firebase identities, Mailpit, web-push subscriptions или other persistent test artifacts.
- `docs/contracts/article-pipeline-core.md` обязателен whenever work touches the shipped article/selection pipeline core.
- `docs/contracts/discovery-agent.md` обязателен whenever work touches adaptive discovery missions, class registry, source profiles/scores, portfolio snapshots, feedback or re-evaluation.
- `docs/contracts/independent-recall-discovery.md` обязателен whenever work touches additive recall-first discovery entities or generic source-quality snapshots.
- `docs/contracts/browser-assisted-websites.md` обязателен whenever work touches JS-heavy website polling, browser-assisted discovery, website hard-site probing, or unsupported challenge behavior.
- `docs/contracts/feed-ingress-adapters.md` обязателен whenever work touches aggregator-aware RSS/Atom normalization or canonical URL resolution inside the `rss` boundary.
- `docs/contracts/zero-shot-interest-filtering.md` обязателен whenever work touches canonical documents, duplicate/story clustering, verification state, semantic interest filtering, or final selection truth.
- Default runtime for sequence-managed triggers остается sequence-first: relay writes PostgreSQL-backed `sequence_runs`, publishes thin `q.sequence` jobs, and worker startup consumes `q.sequence` plus DB-backed cron polling by default.
- Non-sequence relay fallback remains only for `foundation.smoke.requested` and `source.channel.sync.requested`.
- Canonical local compose/dev baseline sets `WORKER_SEQUENCE_RUNNER_CONCURRENCY=4`, while Python runtime fallback still defaults to `1` when the env is unset.
- Current website truth is closed at the bounded live-validation layer: deterministic website/channel/shared-result proof is green, broad website live-matrix evidence is archived, and no further generic website follow-up is active.
- The bounded live outsourcing validation is now shipped in repo-owned operator tooling:
  - `infra/scripts/run-live-website-outsourcing.mjs`
  - `infra/scripts/lib/outsource-example-c.bundle.mjs`
  - the harness now imports the Example C outsourcing bundle from repo code, accepts `26 ready + 3 needs_browser_fallback` rows from `docs/data_scripts/web.json`, records the single `rejected_open_web` row as `skipped_rejected_open_web`, and runs under plain `node`.
- Repo-owned `docs/data_scripts/web.json` remains the bounded live source list for this cohort: `26 ready`, `3 needs_browser_fallback`, `1 rejected_open_web`.
- The previous completed evidence bundle for the earlier live outsourcing run still lives at:
  - `/tmp/newsportal-live-website-outsourcing-2026-04-18T155147751Z.json`
  - `/tmp/newsportal-live-website-outsourcing-2026-04-18T155147751Z.md`
- The repo-owned outsourcing bundle is now truthfully repeatable from both `EXAMPLES.md` and `infra/scripts/lib/outsource-example-c.bundle.mjs`:
  - the outsourcing `interests`, `criteria`, and `global` LLM prompt texts now mirror the tuned admin bundle;
  - the five system-interest definitions now mirror the tuned descriptions, positive/negative prototypes, `must_not_have_terms`, candidate uplift cue groups, and mixed per-template `strictness` (`broad` / `balanced`);
  - the stale uniform `balanced / hold / always` wording in the generic EXAMPLES guidance was removed so future operator repeats no longer drift back to the pre-tuned baseline.
- A fresh post-sync reset-backed live outsourcing rerun completed on 2026-04-18 and now intentionally remains preserved in the local compose DB:
  - `29` `source_channels`
  - `5` `interest_templates`
  - `5` `criteria`
  - `5` `selection_profiles`
  - `3` `llm_prompt_templates`
  - `259` `web_resources`
  - `220` `articles`
  - `220` `final_selection_results`
  - `220` `system_feed_results`
  - `1100` `interest_filter_results`
  - `487` `sequence_runs`
- The completed evidence bundle for that tuned rerun lives at:
  - `/tmp/newsportal-live-website-outsourcing-2026-04-18T180725966Z.json`
  - `/tmp/newsportal-live-website-outsourcing-2026-04-18T180725966Z.md`
- The tuned rerun now proves positive outsourcing yield on the fresh baseline:
  - evidence summary is `15 projected_but_not_selected`, `11 external/runtime_residual`, `2 projected_and_selected`, `1 browser_fallback_residual`, `1 skipped_rejected_open_web`, and `0 implementation_issue`;
  - direct DB checks after the rerun show `2 selected` and `2 eligible`;
  - the selected rows are:
    - `.NET C# Backend Developer (Freelance, Per-Project Work, Ongoing Opportunities) hourly`
    - `Custom Clock Wheel for AzuraCast`
- The currently preserved live cohort is no longer the old zero-yield baseline; it is the post-sync tuned rerun and should be treated as the authoritative local outsourcing inspection set until the user requests another reset.
- RSS-ingress diagnostics on 2026-04-18 now show two separate runtime issues on the local compose stack:
  - the local DB currently contains `5185` `rss` channels in addition to the `29` outsourcing `website` channels;
  - the first blocker was a global fetchers poll-loop SQL type mismatch (`bigint <= text`) in due-channel selection, which prevented any RSS channel from reaching first fetch;
  - the second blocker was first-fetch starvation: never-fetched RSS rows were ordered oldest-first inside the provider queue, which buried user-added channels around `provider_rank 4950+ / 4961` behind the historical backlog;
  - both scheduler issues are now patched in `services/fetchers`, rebuilt into the live `fetchers` container, and proven on the live stack:
    - representative new RSS channels moved to the head of the due queue (`The New Stack = rank 1`, `Google News — Digital Transformation Partner Search = rank 2`, `TechCrunch — Startups = rank 6`, `Reuters — Technology = rank 7`);
    - those same channels then reached first fetches:
      - `VentureBeat`: `new_content`, `200`, `7 fetched`, `7 new`
      - `Google News — Digital Transformation Partner Search`: `new_content`, `200`, `20 fetched`, `4 new`
      - `TechCrunch — Startups`: `new_content`, `200`, `18 fetched`, `18 new`
      - `The New Stack`: `new_content`, `200`, `15 fetched`, `15 new`
      - `Reuters — Technology`: `hard_failure`, `404`, which still proves the channel now reaches real fetch execution instead of scheduler starvation
    - recent runtime DB proof shows `53` RSS fetch runs in the last `2` minutes after the fix.
- `C-WEBSITE-RSS-UNIFIED-DOWNSTREAM` is fully implemented and archived in `docs/history.md`; provider-specific acquisition may differ before handoff, but downstream product/filtering/selection/read-model truth must converge at `article.ingest.requested`.
- Shared admin bulk import now accepts mixed `rss`, `website`, `api`, and `email_imap` batches through one JSON array with explicit row-level `providerType`; shared preflight/import no longer guesses provider mode, website rows can still upsert by exact normalized `fetchUrl`, and `docs/data_scripts/web.bulk-import.json` now carries explicit `providerType: "website"` on every row.
- Discovery repair truth on 2026-04-19:
  - the live compose DB had a real residual drift where `schema_migrations` already recorded `0030_discovery_schema_drift_repair.sql`, but core 0016 discovery tables such as `discovery_hypothesis_classes`, `discovery_source_profiles`, `discovery_source_interest_scores`, `discovery_portfolio_snapshots`, `discovery_feedback_events`, and `discovery_strategy_stats` were still absent;
  - repo truth now carries a follow-up residual replay migration [`database/migrations/0036_discovery_schema_residual_repair.sql`](/Users/user/Documents/workspace/my/NewsPortal/database/migrations/0036_discovery_schema_residual_repair.sql) plus synced runtime docs (`docs/blueprint.md`, `docs/contracts/discovery-agent.md`, `docs/verification.md`, `.aidp/os.yaml`);
  - `package.json` now points `pnpm test:discovery-enabled:compose` at the canonical `.env.dev + compose.dev.yml` baseline instead of the compose-only stack, so the bounded discovery smoke now targets the same local environment as the rest of the repo-owned verification lane;
  - the current local compose baseline was repaired in place by replaying `0036_discovery_schema_residual_repair.sql` directly into the live compose PostgreSQL after drift confirmation, and the shipped discovery compose proofs are green again.
  - the follow-up post-repair durability check then found and fixed two worker-side residual issues inside the same compose proof contour:
    - discovery orchestrator task plugins were not being auto-registered into the default UTE registry, which let queued admin-triggered runs fail with `Unknown task plugin module discovery.plan_hypotheses`;
    - once the plugins were registered, the default `DISCOVERY_ENABLED=0` worker baseline still let admin-triggered discovery runs fail on unavailable live adapters instead of short-circuiting cleanly;
    - [`services/workers/app/task_engine/orchestrator_plugins.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/task_engine/orchestrator_plugins.py) now auto-registers the orchestrator plugins and returns explicit skipped runtime state when discovery execution is requested on a disabled worker baseline, and [`tests/unit/python/test_task_engine_discovery_plugins.py`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/python/test_task_engine_discovery_plugins.py) now keeps both behaviors under regression coverage.

## Capability planning

### Active capabilities

- none

### Active work items
- none

## Next recommended action

- none; the current discovery good-yield capability is closed. If the user wants follow-up work, open a new item for operator polish, broader case-pack expansion, or provider-scope experimentation.

## Archive sync status

- Completed item or capability awaiting archive sync:
  none after syncing `STAGE-4D-GENERALIZED-PROFILE-BACKED-RECALL-VALIDITY-AND-YIELD-RETUNE` and `C-DISCOVERY-GOOD-YIELD` into `docs/history.md`
- Why it is still live, if applicable:
  n/a
- Archive action required next:
  none

## Test artifacts and cleanup state

- Current stage precondition:
  - the current compose DB intentionally preserves the fresh reset-backed outsourcing live cohort
  - active discovery verification will reuse the same local compose baseline and may temporarily create discovery-scoped Firebase admin aliases, missions/classes/candidates, recall entities, and source-channel registrations through shipped proof harnesses
- Pre-existing local operator residue still present outside the guarded tables:
  - prior live evidence bundles:
    - `/tmp/newsportal-live-website-outsourcing-2026-04-18T155147751Z.json`
    - `/tmp/newsportal-live-website-outsourcing-2026-04-18T155147751Z.md`
  - transient admin-only tuning helpers:
    - `/tmp/admin_outsourcing_tune_20260418.mjs`
    - `/tmp/admin-outsourcing-tune-session.json`
- Cleanup status:
  - the user-approved reset was executed via `pnpm dev:mvp:internal:down:volumes` followed by `pnpm dev:mvp:internal:no-build`
  - the fresh rerun cohort remains intentionally present after success:
    - `29` `source_channels`
    - `259` `web_resources`
    - `220` `articles`
    - `220` `final_selection_results`
    - `220` `system_feed_results`
    - `1100` `interest_filter_results`
    - `487` `sequence_runs`
  - no post-run cleanup/reset was performed; this cohort is intentionally preserved for inspection and tuning follow-up
  - discovery verification cleanup status:
    - the repaired compose baseline now intentionally contains additional live-discovery proof residue from repeated proof hardening and closeout reruns:
      - fresh discovery missions and recall missions for Example B/C from runs including `ca3049b7`, `b41de125`, and the aggregate yield gate `a59832ca`;
      - fresh graph and recall candidates for both cases, including duplicate-linked candidates that now persist `registered_channel_id` during materialization;
      - fresh sequence runs, sequence task runs, feedback rows, portfolio snapshots, source profiles, and source-quality snapshots tied to those proof runs;
      - fresh onboarded or duplicate-linked channels were produced by the closing proof contour, including multi-run passing evidence for both Example B and Example C.
    - direct proof artifacts for the hardened lane now live at:
      - `/tmp/newsportal-live-discovery-examples-ca3049b7.json`
      - `/tmp/newsportal-live-discovery-examples-ca3049b7.md`
      - `/tmp/newsportal-live-discovery-examples-b41de125.json`
      - `/tmp/newsportal-live-discovery-examples-b41de125.md`
      - `/tmp/newsportal-live-discovery-yield-proof-a59832ca.json`
      - `/tmp/newsportal-live-discovery-yield-proof-a59832ca.md`
      - `/tmp/newsportal-discovery-nonregression-f499bb13.json`
      - `/tmp/newsportal-discovery-nonregression-f499bb13.md`
    - Firebase admin aliases are created and cleaned by the shipped admin acceptance harness; no separate residual Firebase cleanup task is currently known
    - the profile-backed Example B/C harness now also leaves reusable stable-key `discovery_policy_profiles` for:
      - `example_b_dev_news_proof`
      - `example_c_outsourcing_proof`
      those profiles are intentional reusable proof fixtures rather than accidental residue and are now documented in `DISCOVERY_MODE_TESTING.md`

## Handoff

- Current active item and status:
  no active implementation item remains; `C-DISCOVERY-GOOD-YIELD` is complete and archived.
- What is already proven:
  `C-DISCOVERY-GOOD-YIELD` is now complete:
  - `pnpm test:discovery:examples:compose` remains the canonical single-run Example B/C proof entrypoint and now finishes `runtimeVerdict=pass`, `yieldVerdict=pass`, `finalVerdict=pass` on the latest authoritative run `/tmp/newsportal-live-discovery-examples-b41de125.json|md`;
  - `pnpm test:discovery:yield:compose` now finishes `runtimeVerdict=pass`, `yieldVerdict=pass`, `finalVerdict=pass` on `/tmp/newsportal-live-discovery-yield-proof-a59832ca.json|md`;
  - the required runtime packs both reached `3/3` passing runs in the final bounded multi-run gate:
    - `Example B — IT-новости для разработчиков`
    - `Example C — Поиск клиентов для аутсорс-компании`
  - `pnpm test:discovery:nonregression:compose` stayed green on `/tmp/newsportal-discovery-nonregression-f499bb13.json|md`;
  - the harness still materializes reusable profiles `example_b_dev_news_proof` and `example_c_outsourcing_proof` before graph/recall execution;
  - single-run artifacts still include `manualReplaySettings` that exactly capture profile key/display name, graph policy, recall policy, benchmark cohort, exact mission seeds/queries, and applied profile version/policy snapshots;
  - the latest synced manual replay baseline used applied profile version `22`, but operators should still treat the `manualReplaySettings` from their own fresh artifact as the canonical replay source if profile versions advance again.
  `C-DISCOVERY-PROFILES-ADMIN` is now fully proven and archived at the code/proof layer:
  - reusable `discovery_policy_profiles` exist as additive operator-managed tuning truth for graph and recall lanes;
  - `discovery_missions` and `discovery_recall_missions` can now reference `profile_id` and persist `applied_profile_version` plus `applied_policy_json` snapshots for historical reproducibility;
  - `/admin/discovery` now ships a `Profiles` tab, mission/recall profile selectors, and explainability-first candidate/recall policy signals;
  - `pnpm test:discovery:admin:compose` passed with reusable profile CRUD, mission attach, recall attach, profile archive/reactivate/delete, and visible explainability/profile version fields;
  - live runtime and downstream safety remained green on the same baseline through:
    - `/tmp/newsportal-live-discovery-examples-682e955a.json|md`
    - `/tmp/newsportal-discovery-nonregression-9c663b86.json|md`
  the live discovery automation is wired to the currently shipped discovery/runtime surfaces and now also has a case-agnostic safety proof:
  - it enforces the DDGS-only guard (`DISCOVERY_ENABLED=1`, `DISCOVERY_SEARCH_PROVIDER=ddgs`, Brave/Serper keys empty)
  - it treats `pnpm test:discovery-enabled:compose` and `pnpm test:discovery:admin:compose` as mandatory preflight proof before live execution
  - it separates runtime-enabled case packs from validation-only packs; Example B/C remain required runtime packs, while calibration can now include additional synthetic/generalized packs without turning them into DB preconditions
  - it verifies runtime-pack preconditions from PostgreSQL (`interest_templates`, `criteria`, `selection_profiles`, baseline `source_channels`) instead of reconstructing state from `EXAMPLES.md`
  - it runs both graph-first and recall-first discovery lanes through maintenance APIs and records machine-readable plus Markdown evidence at `/tmp/newsportal-live-discovery-examples-<runId>.json|md`
  - it classifies weak yield through reusable root-cause buckets and aggregate pack diagnostics instead of only Example-specific residual wording
  - the new non-regression runner at `/tmp/newsportal-discovery-nonregression-0c105e1b.json|md` proves `runtime=pass` and `nonRegression=pass` with zero drift on the pre-existing downstream corpus
  - adaptive discovery smoke is now deterministic against active `live_example_*` residue because smoke planning uses only its own `adaptive_smoke_*` class
  - the orchestrator task budget for live DDGS runs now covers long `plan_hypotheses` / evaluation / re-evaluation work
  - the harness now reads latest `sequence_task_runs` so stale run-level `running` status no longer forces a long false-negative wait
  - the latest authoritative generalized proof artifacts are:
    - `/tmp/newsportal-live-discovery-examples-b7b86b83.json|md`
    - `/tmp/newsportal-discovery-nonregression-0c105e1b.json|md`
    - the first proves `runtimeVerdict=pass`, `yieldVerdict=weak`
    - the second proves `runtimeVerdict=pass`, `nonRegressionVerdict=pass`, `yieldVerdict=weak`, `finalVerdict=pass_with_residuals`
  - it keeps the current discovery scope truthful:
    - only `rss` / `website` are in-scope for the automation
    - browser-assisted website candidates remain `website`
    - duplicate-linked recall promotions count as valid onboarding evidence
- What is still unproven or intentionally left open:
  nothing remains open for `C-DISCOVERY-GOOD-YIELD`; any further work should be framed as a new capability such as operator UX polish, new case-pack expansion, or provider-scope experimentation.
- Scope or coordination warning for the next agent:
  do not reopen `C-DISCOVERY-GOOD-YIELD` just to continue general discovery evolution. Open a new item instead, and keep the stronger architectural requirement intact: discovery core policy must stay reusable for future case packs, Example B/C are proof cohorts rather than architectural owners, and any new tuning change must preserve the downstream non-regression boundary from `docs/contracts/article-pipeline-core.md`, `docs/contracts/discovery-agent.md`, and `docs/contracts/zero-shot-interest-filtering.md`.
