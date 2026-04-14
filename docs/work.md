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
- Why now: the user asked to reset the local compose DB and rerun channel polling from a near-zero baseline while preserving system interests, their runtime companions, LLM templates, and channels.

## Current memory

- Runtime core инициализирован; ordinary implementation work разрешен.
- `docs/blueprint.md` остается главным architectural source of truth для boundaries, ownership и durable system behavior.
- `docs/contracts/test-access-and-fixtures.md` обязателен whenever work touches local PostgreSQL/Redis-backed proof, Firebase identities, Mailpit, web-push subscriptions или other persistent test artifacts.
- `docs/contracts/discovery-agent.md` обязателен whenever work touches adaptive discovery missions, class registry, source profiles/scores, portfolio snapshots, feedback or re-evaluation.
- `docs/contracts/independent-recall-discovery.md` обязателен whenever work touches additive recall-first discovery entities, generic source-quality snapshots, or the long-term cutover away from discovery being owned by `interest_graph`.
- `docs/contracts/browser-assisted-websites.md` обязателен whenever work touches JS-heavy website polling, browser-assisted discovery, website hard-site probing, or unsupported challenge behavior.
- `docs/contracts/feed-ingress-adapters.md` обязателен whenever work touches aggregator-aware RSS/Atom normalization, adapter strategy inference, pre-ingest stale gating, or canonical URL resolution inside the `rss` boundary.
- `docs/contracts/zero-shot-interest-filtering.md` обязателен whenever work touches canonical documents, duplicate/story clustering, verification state, semantic interest filtering, final selection truth, or compatibility/backfill behavior around that cutover.
- Default runtime for sequence-managed triggers остается sequence-first: relay создает PostgreSQL-backed `sequence_runs`, публикует thin `q.sequence` jobs, и worker startup consumes `q.sequence` plus DB-backed cron polling by default.
- Non-sequence relay fallback remains only for `foundation.smoke.requested` and `source.channel.sync.requested`.
- Canonical local compose/dev baseline for this lane now sets `WORKER_SEQUENCE_RUNNER_CONCURRENCY=4`, while Python runtime fallback still defaults to `1` when the env is unset.
- Worktree остается heavily mixed с unrelated in-flight edits, поэтому любой новый item обязан заново объявлять overlap paths вместо предположения о clean baseline.
- New local stateful request on 2026-04-13 explicitly allows a destructive local DB reset, but only if the preserved subset is exported first and later restored truthfully.
- The minimum truthful preserved subset for this reset is now confirmed as `source_providers`, `source_channels`, `interest_templates`, `criteria`, `criteria_compiled`, `selection_profiles`, and `llm_prompt_templates`; preserving only templates/channels would break current system-interest runtime dependencies after reset.
- To restart channel polling from zero, restored `source_channels` must come back without prior fetch/runtime state: `fetch_cursors` and `source_channel_runtime_state` should stay empty/fresh, while channel-side last-fetch/error timestamps must be cleared after restore.
- Repo-level UI proof now includes `pnpm test:web:viewports` for web desktop/tablet/mobile browser coverage and `pnpm test:discovery:admin:compose` for `/admin/discovery` operator flows.
- The local website-admin operator lane is green again on the rebuilt compose baseline: `/maintenance/web-resources` responds normally, `/resources*` reads render, and provider-specific website/API/Email IMAP admin acceptance is live-proven.
- Fresh local verification on 2026-04-12 proved live edit/archive/delete flows for system interests and LLM templates, live create/update/clone/delete for user-managed and admin-managed interests, live provider-specific create/update for `website` / `api` / `email_imap` channels, and live channel delete/archive behavior for `rss`.
- Discovery admin is now live-proven for create/update/archive/reactivate/delete on mission/class rows in addition to compile/run/review/feedback/re-evaluate flows; mission archive is a real persisted lifecycle state, and hard delete is intentionally guarded to history-free entities only.
- Browser-level button proof on 2026-04-12 remains green for the targeted surfaces: the local worktree uses custom `AlertDialog`-based confirm flows in `apps/admin/src/components/AdminConfirmAction.tsx` and `apps/admin/src/components/AdminConfirmSubmitButton.tsx`, preserves the earlier web `/interests` serialization repair, and the rebuilt full browser smoke proves real click-driven actions for system interests, LLM templates, web user interests, admin-managed user interests, channels, bulk RSS schedule/reindex confirm-submit flows, and discovery without the earlier admin React `#418` console noise.
- The broader full-product button sweep is now complete on the 2026-04-13 local baseline via `infra/scripts/test-ui-button-audit.mjs`: the harness inventories and live-click-proves current button actions across the surfaced `apps/web` and `apps/admin` pages, records `checked` vs `not applicable`, and leaves only one honest residual skip for `/settings -> Connect Web Push`, which fails in the current headless/incognito Chromium proof mode with `PushManager.subscribe(...): no active Service Worker` rather than as a reproduced product-side button regression.
- The local compose DB needed an idempotent replay of `database/migrations/0030_discovery_schema_drift_repair.sql` on 2026-04-12 because `schema_migrations` claimed discovery repair was applied while key tables like `discovery_hypothesis_classes` were physically missing; after the repair, `/discovery` rendered again and the updated discovery acceptance/browser proof both passed.
- Immediate notification truth remains `web_push` / `telegram` for `notification_log`; `email_digest` stays digest-only, so browser proofs that verify `/notifications` or feedback must seed an immediate channel separately.
- Former audit findings `F-001` through `F-005` remain historically closed at the shipped baseline, but the current mixed worktree can still regress individual proof lanes such as the local `website-admin` / `web-resources` path.
- The standalone audit artifact has been retired; durable operator-baseline truth now lives in `docs/manual-mvp-runbook.md`, `docs/verification.md`, `docs/blueprint.md`, `docs/contracts/universal-task-engine.md`, `.aidp/os.yaml`, and `docs/history.md`.
- Python services по-прежнему не имеют repo-level typecheck gate comparable to `pnpm typecheck`.
- Article-yield remediation on 2026-04-08 remains shipped truth: repeatable diagnostics/export CLI, future-only remediation CLI, and enrichment sanitizers for malformed extracted timestamps plus non-positive media dimensions are live; the last verified compose snapshot on 2026-04-08 showed `502` active RSS channels, `6605` article rows, `672` distinct canonical URLs, `19` eligible rows, and `0` pending `article.ingest.requested` runs.
- Shipped zero-shot cutover truth is now end-to-end additive and final-selection-first: raw intake persists `document_observations`, worker dedup materializes `canonical_documents`, clustering/verification populate `story_clusters` plus `verification_results`, semantic filtering writes `interest_filter_results`, and downstream selection truth lives in `final_selection_results`; `system_feed_results` remains a bounded compatibility projection only.
- Worker-side personalization/backfill behavior now prefers `final_selection_results` whenever present, and historical repair proof explicitly clears and rebuilds additive stage-2/3/4 rows (`story_clusters`, `verification_results`, `interest_filter_results`, `final_selection_results`) before re-validating compatibility projection and retro-notification suppression.
- Shipped zero-shot stage-5 discovery truth remains decoupled from downstream selected-content outcomes: discovery/source-quality metrics are based on generic intake evidence such as unique-article ratio, fetch health, freshness, lead-time, and duplication pressure rather than `system_feed_results` or `final_selection_results`.
- Current discovery blueprint truth still remains graph-first and mission-fit-centric at the planning layer: `discovery_missions.interest_graph` stays authoritative planning state and contextual source scoring still persists through `discovery_source_interest_scores`, but source onboarding is no longer only mission/hypothesis-owned because the bounded recall path can now acquire and promote candidates into `source_channels` too.
- Shipped independent-recall stage-1/2/3/4/5 truth now persists additive `discovery_source_quality_snapshots`, `discovery_recall_missions`, and `discovery_recall_candidates`; discovery summary now counts promoted/duplicate recall candidates separately, source-profile reads surface the latest generic quality snapshot, admin/help discovery surfaces label mission fit vs generic source quality vs neutral recall backlog vs recall-promotion state explicitly, and neutral recall can now both acquire bounded `rss` / `website` candidates without `interest_graph` and onboard promoted candidates through the existing PostgreSQL + outbox source-registration contract while persisting `registered_channel_id` and shared source-profile channel linkage.
- The separate compose discovery schema-drift residual around `0016_adaptive_discovery_cutover.sql` is now repaired on the local baseline: `0026a_discovery_schema_drift_prerepair.sql` heals drifted DBs before `0027`, `0030_discovery_schema_drift_repair.sql` restores the remaining discovery core tables/constraints idempotently, and migration smoke now asserts the full discovery core so the same drift fails fast in fresh proof.
- Fresh forensic read-only investigation on 2026-04-13 showed a split failure mode rather than one broken stage: the local compose DB had `28528` article rows, `9064` pending `article.ingest.requested` runs, `0` selected rows, `19119` rejected rows, `313` final gray-zone rows, and `0` `llm_review_log` rows.
- Worker runtime is live but degraded: compose logs repeatedly show `DeadlockDetected` on `articles` and `source_channels` while consuming `q.sequence`, so backlog drains slowly instead of the sequence lane being fully dead.
- The current local system-interest lane does not actually route gray-zone system criteria into LLM review: all active compatibility `selection_profiles` read as `llmReviewMode = optional_high_value_only`, `highValue = false`, `unresolvedDecision = hold`, so runtime resolves most gray-zone cases to cheap hold instead of `llm.review.requested`.
- The dominant final-selection shape in the current local DB is still `5 criteria -> 0 matches -> rejected`, so pipeline hardening alone is not enough; durable recovery must keep generic throughput healthy and restore truthful gray-zone review semantics for system-interest criteria.
- Stage 1 implementation is now proven locally: `SequenceExecutor` retries transient DB deadlock-like failures inside the task boundary without stretching normal retryable task delays, and compatibility system-interest profile defaults now resolve to explicit LLM review while non-compatibility profile families keep cheap-hold defaults unless policy opts into review.
- Stage 2 implementation is now proven locally too: migration `0033_compatibility_profile_llm_review_defaults.sql` repaired the 5 current compatibility profiles in the local compose DB from `optional_high_value_only` to `always`, and admin/API read surfaces now expose normalized LLM-review state instead of stale/raw cheap-hold wording.
- Stage 3 already has two shipped runtime guards on the local branch: worker article fetch now locks only `articles` rows instead of `articles + source_channels`, and fetchers channel polling now holds a per-channel PostgreSQL advisory lease so the same `source_channel` cannot be polled concurrently across poll loops/manual paths.

## Capability planning

### Active capabilities

- `C-PIPELINE-RESILIENCE-AND-GRAY-ZONE-LLM-RECOVERY`
  - Goal: restore general pipeline health for sequence-managed article processing and recover truthful gray-zone-to-LLM behavior for system-interest criteria without bypassing PostgreSQL/outbox/`q.sequence` architecture.
  - Outcome: article backlog stops degrading under normal compose concurrency, transient DB deadlocks and short-lived internal fetchers outages no longer turn into permanent per-run failure by default, and gray-zone system criteria can truthfully route into LLM review under durable profile policy instead of silently collapsing into cheap hold.
  - Full completion condition: sequence runtime has deterministic transient-failure handling and proof around deadlock-like DB errors plus short-lived fetchers transport failures; active system-interest profile defaults and operator semantics are re-aligned so gray-zone review can run through `llm.review.requested`; runtime/process docs and proof expectations are synced to the shipped behavior.
  - Proposed stage breakdown:
    1. `STAGE-1-SEQUENCE-DEADLOCK-RESILIENCE-AND-SYSTEM-CRITERION-LLM-DEFAULTS`
    2. `STAGE-2-SYSTEM-INTEREST-PROFILE-REPAIR-AND-OPERATOR-VISIBILITY`
    3. `STAGE-3-THROUGHPUT-TUNING-AND-SOURCE-COHORT-HARDENING`
    4. `STAGE-4-TRANSIENT-FETCHERS-ENRICHMENT-RETRY-HARDENING`
  - Immediate next stage:
    none; implementation closeout is complete and archive sync should move the detailed stage trail into `docs/history.md`.

- `C-GENERIC-CANDIDATE-RECALL-AND-NOISE-TOLERANT-SELECTION`
  - Goal: restore general recall quality after the runtime lane is healthy, so the system can find rare meaningful signals in a noisy field for any information domain rather than relying on source-ranking or a single use case such as outsourced development.
  - Outcome: the repo has a document/event-level candidate-loss model, wide-recall routing that preserves rare useful signals from noisy sources, and a bounded path for escalating ambiguous candidates into gray-zone/LLM review without domain-specific hacks.
  - Full completion condition: the repo has a truthful baseline for where potential candidates are currently lost, durable document/cluster-level signal planning that stays generic across information domains, and proof that the new routing improves candidate flow without shrinking ingest breadth or turning source-level scoring into the primary relevance gate.
  - Proposed stage breakdown:
    1. `SPIKE-CANDIDATE-LOSS-TAXONOMY-BASELINE`
    2. `STAGE-1-DOCUMENT-AND-CLUSTER-CANDIDATE-SIGNALS`
    3. `STAGE-2-GRAY-ZONE-AND-LLM-CANDIDATE-ROUTING`
    4. `STAGE-3-NOISE-TOLERANT-PROOF-AND-OPERATOR-VISIBILITY`
    5. `SPIKE-LIVE-CANDIDATE-MATERIALIZATION-MEASUREMENT`
  - Immediate next stage: `SPIKE-LIVE-CANDIDATE-MATERIALIZATION-MEASUREMENT`

- `C-POSITIVE-SIGNAL-RECOVERY-AND-ENRICHMENT-SANITIZATION`
  - Goal: recover generic positive-signal extraction and candidate uplift on the fresh post-reset corpus while independently eliminating known enrichment date-sanitization failures such as `0000-06-19T00:00:00.000Z`.
  - Outcome: the repo has a truthful explanation for why the current fresh corpus produces only `no_match`, a bounded generic fix for positive-signal/candidate-uplift recovery that does not hardcode one use case, and a durable sanitization fix so malformed year-zero timestamps no longer fail enrichment runs.
  - Full completion condition: fresh-corpus forensic proof identifies where positive signals are currently flattened to zero; shipped worker/filter changes produce at least bounded `gray_zone`/candidate-uplift materialization without breaking the `1 real match -> selected` rule; malformed extracted dates with year `0000` are sanitized before persistence and no longer fail enrichment; docs/proof are synced to the shipped behavior.
  - Proposed stage breakdown:
    1. `SPIKE-FRESH-CORPUS-POSITIVE-SIGNAL-LOSS-2026-04-13`
    2. `STAGE-1-GENERIC-POSITIVE-SIGNAL-AND-UPLIFT-RECOVERY`
    3. `STAGE-2-ENRICHMENT-DATE-SANITIZATION-HARDENING`
    4. `STAGE-3-FRESH-BASELINE-PROOF-AND-TUNING`
  - Immediate next stage: `STAGE-3-FRESH-BASELINE-PROOF-AND-TUNING`

### Active work items

- `PATCH-LOCAL-DB-RESET-WITH-PRESERVED-SYSTEM-CONFIG-2026-04-13-R2`
  - Kind: Patch
  - Status: done
  - Goal: wipe the local compose runtime data again so the current source/interest/template configuration can be rerun from a near-zero baseline and evaluated immediately.
  - In scope:
    - export the current preserved subset before any destructive action
    - destructive local compose volume reset
    - restore only the truthful runtime subset needed for sources + interests + templates to function
    - clear historical fetch/runtime state so channels repoll from zero
    - verify that article/runtime tables restart empty before new polling resumes
  - Out of scope:
    - changing code or schema as part of the reset
    - preserving historical article/review/filter/final-selection rows
    - source-level tuning during the reset itself
  - Allowed paths:
    - `docs/work.md`
    - optional `/tmp` reset artifacts and SQL snapshots
  - Depends on:
    - `PATCH-LOCAL-DB-RESET-WITH-PRESERVED-SYSTEM-CONFIG-2026-04-13`
  - Required proof:
    - preserved snapshot artifact path recorded before reset
    - destructive reset commands recorded in executed proof
    - post-restore SQL counts for preserved tables and zero/fresh runtime tables
    - live service health after restart
  - Risk:
    - high; this intentionally destroys local runtime history again, so the main risk is silently omitting a dependency from the preserved subset and booting a misleading “fresh” baseline.
  - Progress now:
    - snapshot/export artifact captured at `/tmp/newsportal-reset-r2-2026-04-13T191252Z` before any destructive action.
    - the preserved subset remained the same truthful minimum as the first reset: `source_providers`, `source_channels`, `interest_templates`, `criteria`, `criteria_compiled`, `selection_profiles`, and `llm_prompt_templates`.
    - the fresh compose seed created replacement `source_providers` rows with different UUIDs, so the restore had to replace those baseline providers before `source_channels` could be reimported truthfully.
    - after restore, `5173` channels had their `last_fetch_at`, `last_success_at`, `last_error_at`, and `last_error_message` cleared so repolling restarted from zero.
    - first fresh-motion proof on the rebuilt baseline now shows new runtime growth again: `/tmp/newsportal-reset-r2-2026-04-13T191252Z/post_restore_counts.tsv` already reached `20` articles / `30` filter rows, and `/tmp/newsportal-reset-r2-2026-04-13T191252Z/first_motion_counts.tsv` reached `247` articles / `265` filter rows / `53` final-selection rows without restoring any historical runtime tables.

- `SPIKE-FRESH-CORPUS-POSITIVE-SIGNAL-LOSS-2026-04-13`
  - Kind: Spike
  - Status: done
  - Goal: explain why the fresh post-reset corpus reaches `verification` and `final_selection` but still produces only `semantic_decision = no_match` and zero candidate-uplift / gray-zone rows.
  - In scope:
    - read-only analysis of `interest_filter_results`, `final_selection_results`, and `system_feed_results` on the fresh post-reset corpus
    - sampling near-miss documents with high `semantic_score` but `no_match`
    - locating where positive signals should be produced but currently remain `0`
    - separating generic signal-loss problems from the independent enrichment date bug
  - Out of scope:
    - modifying runtime behavior in this spike
    - source-ranking as a primary fix
    - direct threshold hacks for a single business niche
  - Allowed paths:
    - `docs/work.md`
    - optional read-only `/tmp` artifacts
  - Depends on:
    - `PATCH-LOCAL-DB-RESET-WITH-PRESERVED-SYSTEM-CONFIG-2026-04-13`
  - Required proof:
    - read-only SQL/log evidence for positive-signal loss on the fresh corpus
    - sampled near-miss rows with `explain_json`
    - a truthful next implementation stage for generic positive-signal recovery
  - Risk:
    - medium; the main risk is mistaking noisy fresh-corpus mix for the whole problem and patching around symptoms instead of the missing positive-signal path itself.
  - Progress now:
    - fresh-corpus forensic evidence already shows `14769` final rows with the exact same terminal shape: `0 match / 5 no_match / 0 gray_zone / 0 technical_filtered_out`.
    - the current fresh corpus has `0` candidate-uplift rows, `0` runtime-review-state rows, `0` `gray_zone` rows, and `0` `llm_review_log` rows even though all 5 restored compatibility `selection_profiles` still read `llmReviewMode = always`.
    - sampled near-miss titles such as `Operations Partner for IT Agency`, `Fintech Outreach & Business Development Partner`, and ERP implementation/vendor-demand headlines currently reach only `semantic_score ≈ 0.24-0.35`, with `S_pos = 0`, empty `filterReasons`, and final `semanticDecision = no_match`.
    - the spike also found the operational reason why repo-side fixes were not showing up in the fresh compose baseline at first: local `worker` and `fetchers` run from built images rather than source bind-mounts, so live runtime behavior stayed stale until `docker compose ... up --build -d worker fetchers` rebuilt those services.

- `STAGE-1-GENERIC-POSITIVE-SIGNAL-AND-UPLIFT-RECOVERY`
  - Kind: Stage
  - Status: done
  - Goal: restore generic document-level positive-signal extraction and bounded candidate uplift so the fresh corpus no longer collapses every near-miss article to `S_pos = 0`.
  - In scope:
    - generic positive/noise signal expansion in zero-shot final-selection helpers
    - bounded threshold tuning for document-only and canonical-context uplift
    - explainability payload improvements so live `interest_filter_results.explain_json` shows why a candidate did or did not uplift
    - targeted unit coverage for uplifted and correctly rejected noisy cases
  - Out of scope:
    - source-level ranking as a relevance gate
    - one-off hacks for outsourced-development only
    - broad queue/runtime redesign
  - Allowed paths:
    - `docs/work.md`
    - `docs/blueprint.md`
    - `services/workers/app/final_selection.py`
    - `tests/unit/python/test_final_selection.py`
    - `tests/unit/python/test_interest_auto_repair.py`
  - Depends on:
    - `SPIKE-FRESH-CORPUS-POSITIVE-SIGNAL-LOSS-2026-04-13`
  - Required proof:
    - targeted Python unit coverage for new positive-signal uplift behavior
    - targeted Python unit coverage for noisy partner/marketplace non-uplift behavior
    - live fresh-corpus evidence that `candidateSignals` now materialize in `interest_filter_results`
    - `git diff --check --` on touched files
  - Risk:
    - medium/high; over-broad signals could inflate false positives, while under-broad changes would leave the fresh corpus stuck in universal `no_match`.
  - Progress now:
    - positive groups now cover generic request/search, implementation/service-delivery, market-demand, and procurement-intent cues, while noisy marketplace-style partner/freelancer cues are scored separately as negative pressure.
    - candidate explain payloads now persist positive/noise hit counts so live DB reads can distinguish `no signal`, `weak signal`, and `signal blocked by noise/context`.
    - live proof after rebuilding the compose `worker`/`fetchers` images shows `interest_filter_results.explain_json ? 'candidateSignals'` rising from `0` on the stale runtime to `1405` post-rebuild rows on the fresh baseline.

- `STAGE-2-ENRICHMENT-DATE-SANITIZATION-HARDENING`
  - Kind: Stage
  - Status: done
  - Goal: prevent malformed extracted dates such as `0000-06-19T00:00:00.000Z` from failing article enrichment and turning otherwise processable rows into `enrichment_state = failed`.
  - In scope:
    - sanitize invalid year-zero or otherwise non-persistable extracted timestamps before DB persistence
    - keep valid extracted date behavior unchanged
    - add targeted proof for malformed-date inputs
  - Out of scope:
    - broad enrichment redesign
    - replaying historical failed rows in this stage
    - using date sanitization as a substitute for positive-signal recovery
  - Allowed paths:
    - `docs/work.md`
    - `docs/blueprint.md`
    - fetchers/worker enrichment code in the current article-extraction path
    - targeted unit tests for enrichment sanitization
  - Depends on:
    - `SPIKE-FRESH-CORPUS-POSITIVE-SIGNAL-LOSS-2026-04-13`
  - Required proof:
    - targeted failing test for malformed year-zero extracted date
    - targeted passing test after sanitization hardening
    - `git diff --check --` on touched files
  - Risk:
    - medium; over-broad sanitization could erase good timestamps, while under-broad sanitization would keep failing on malformed provider data.
  - Progress now:
    - fetchers-side enrichment sanitization now rejects year-zero or otherwise non-persistable timestamps before DB persistence while leaving valid timestamps untouched.
    - targeted TS unit coverage now proves both string and `Date` inputs with year `0000` sanitize to `null`.
    - recent `docker-fetchers-1` logs no longer show the earlier `date/time field value out of range` / `0000-...` failure signature after the rebuilt runtime picked up this fix, though historical failed rows remain in the preserved fresh corpus and unrelated extraction failures still exist.

- `STAGE-3-FRESH-BASELINE-PROOF-AND-TUNING`
  - Kind: Stage
  - Status: active
  - Goal: measure the fresh rebuilt baseline after the generic positive-signal and date-sanitization fixes, confirm the live runtime behavior changed in the intended direction, and identify the remaining tuning gap without erasing current DB evidence.
  - In scope:
    - read-only DB/log proof on the rebuilt fresh compose runtime
    - confirming live materialization of `candidateSignals`, LLM review activity, and final-selection distribution after rebuild
    - separating remaining recall/tuning gaps from the already fixed stale-runtime and year-zero-sanitization issues
    - repairing criterion-LLM template semantics where the active prompt text is narrower than the current system criteria it serves
    - keeping the canonical outsourcing bundle JSON aligned with the live criterion/interest/global prompt semantics
    - syncing docs to the truthful shipped/runtime state
  - Out of scope:
    - another destructive DB reset
    - replaying or deleting historical fresh-baseline rows
    - broad architecture changes outside this capability
  - Allowed paths:
    - `docs/work.md`
    - `docs/blueprint.md`
    - `docs/data_scripts/outsource_balanced_templates.json`
    - `docs/data_scripts/outsource_balanced_templates.md`
    - `database/migrations/*`
    - optional read-only `/tmp` artifacts
  - Depends on:
    - `STAGE-1-GENERIC-POSITIVE-SIGNAL-AND-UPLIFT-RECOVERY`
    - `STAGE-2-ENRICHMENT-DATE-SANITIZATION-HARDENING`
  - Required proof:
    - targeted unit proof from stages 1 and 2 still passing
    - live compose rebuild/restart proof for `worker` and `fetchers`
    - read-only SQL evidence for post-rebuild candidate-signal/LLM-review materialization
    - `git diff --check --` on touched files
  - Risk:
    - medium; the main risk is declaring success too early because positive signals now materialize, while `gray_zone` and final-selection outcomes on the fresh corpus may still need additional bounded tuning.
  - Progress now:
    - the rebuilt fresh baseline currently shows `1405` post-rebuild `candidateSignals` rows and `18` post-rebuild `llm_review_log` rows, proving the live runtime is no longer stuck in the earlier all-zero explain/review state.
    - the same window still shows `0` `gray_zone` rows and `405` post-rebuild `final_selection_results.final_decision = rejected`, so remaining work is now a tuning/selection-quality problem rather than a dead path.
    - sampled post-rebuild `llm_review_log` rows now come from live fresh-corpus titles such as `Configuration flags are where software goes to rot`, `Show HN: I built a no-code report builder...`, and `[FOR HIRE] Need a website or web app? I can help`, and they still terminate as `rejected` with `0 match / 5 no_match`; this confirms the remaining gap is not "no LLM path" but "LLM/uplift still getting routed mostly noisy candidates".
    - fresh template-path forensics on 2026-04-13 show that the live criterion lane is using exactly one active `criteria` prompt template (`Outsourcing buyer-intent criterion review`) for all criterion reviews; `llm_review_log` currently shows `46` reviews through that template with `0 approve / 20 uncertain / 26 reject`, which points to a template-semantics mismatch rather than a missing-template path.
    - the canonical bundle `docs/data_scripts/outsource_balanced_templates.json` now carries the refreshed outsourcing prompt semantics, and the local proof DB has already been updated to the same `version = 2` texts for all three outsourcing templates (`criteria`, `interests`, `global`); the criterion template is now criterion-grounded instead of using one universal build-only buyer-intent frame.
    - post-refresh proof is now live too: `llm_review_log` has `39` rows with `prompt_version = 2` and `0` remaining version-1 rows in the refresh window, with `12 approve / 13 uncertain / 24 reject`; fresh `final_selection_results` in the same window now include `7 selected`, `1 gray_zone`, and `281 rejected`, so the template repair is no longer just config-level but already affecting outcomes on new corpus rows.
    - the new false-positive pattern is now clear too: fresh `selected` rows after the template refresh are predominantly career/job pages (`talent-soft`, `/careers/`, job-detail style titles/bodies) that the criterion LLM now misreads as staff-augmentation or procurement demand.
    - a short-lived attempt to hard-code an anti-employment buyer-side guard in the generic criterion runtime was rejected as too application-specific for a system that must support arbitrary information domains, so that approach has been removed instead of shipped.
    - the current bounded next move stays in the outsourcing application layer only: bundle prompt semantics now explicitly reject employment/career postings and internal hiring language, while the generic engine remains unchanged.
    - those outsourcing prompt semantics have now been tightened again and pushed straight into the local proof DB from the JSON bundle, lifting all three outsourcing templates to `version = 3`; in the immediate post-refresh window the runtime has not yet produced new review rows, so this semantic change is shipped but still awaiting fresh materialization in `llm_review_log`.

- `PATCH-LOCAL-DB-RESET-WITH-PRESERVED-SYSTEM-CONFIG-2026-04-13`
  - Kind: Patch
  - Status: done
  - Goal: reset the local compose PostgreSQL/Redis-backed runtime so channel polling can restart from a near-zero baseline, while preserving the current system-interest/LLM/channel configuration needed for a truthful rerun.
  - In scope:
    - export the preserved local subset before any destructive action
    - destructive local compose reset of volumes only after the snapshot exists
    - restore preserved system-interest/runtime config rows into the fresh DB
    - clear historical poll/runtime state so channels repoll as if fresh
    - post-reset verification that the stack is healthy, preserved rows exist, and article/runtime tables are empty or fresh
  - Out of scope:
    - preserving historical article/selection/review corpus rows
    - changing shipped application code or schema just to make this reset easier
    - broad runtime tuning or new feature implementation
  - Allowed paths:
    - `docs/work.md`
    - optional `/tmp` reset artifacts and SQL snapshots
  - Depends on:
    - `STAGE-4-TRANSIENT-FETCHERS-ENRICHMENT-RETRY-HARDENING`
    - `STAGE-3-NOISE-TOLERANT-PROOF-AND-OPERATOR-VISIBILITY`
  - Required proof:
    - preserved snapshot artifact path recorded before reset
    - destructive reset commands recorded in executed proof
    - post-restore SQL counts for preserved tables and empty/fresh runtime/article tables
    - live service health after restart
  - Risk:
    - high; this is intentionally destructive local state work, and the main risk is silently dropping runtime dependencies or restoring stale fetch/runtime state so the rerun is not actually “from zero”.
  - Worktree overlap:
    - repo worktree is heavily mixed, but this item should avoid repo-tracked code edits beyond `docs/work.md`; destructive runtime commands must not assume a clean git baseline.
  - Progress now:
    - dependency audit is complete: the local DB currently has `5173` channels, all `5173` reference one of the 5 baseline `source_providers`, and system-interest runtime truth currently spans `5` `interest_templates`, `5` linked `criteria`, `5` `criteria_compiled`, `5` `selection_profiles`, and `3` active `llm_prompt_templates`.
    - reset-specific runtime state to discard on restore is confirmed too: `fetch_cursors = 4324`, `source_channel_runtime_state = 5173`, and current channel-side polling timestamps/errors live on `source_channels` itself.
    - preserved snapshot artifact was written to `/tmp/newsportal-reset-2026-04-13T20260413T165012Z` before reset; it contains per-table SQL dumps for the preserve-set plus `pre_reset_counts.tsv`.
    - the local compose stack was then reset with `pnpm dev:mvp:internal:down:volumes` and re-booted via `pnpm dev:mvp:internal:no-build`; the fresh DB was restored with the preserved `source_providers`, `interest_templates`, `criteria`, `criteria_compiled`, `selection_profiles`, `llm_prompt_templates`, and `source_channels`.
    - post-restore zero-state proof passed before fetchers restart: preserved table counts returned to `5/5173/5/5/5/5/3`, while `fetch_cursors`, `source_channel_runtime_state`, `articles`, `document_observations`, `canonical_documents`, `verification_results`, `interest_filter_results`, `final_selection_results`, and `llm_review_log` were all `0`.
    - restored channels were normalized back to fresh polling state by clearing `last_fetch_at`, `last_success_at`, `last_error_at`, and `last_error_message` for all `5173` rows before restarting `fetchers`.
    - first-motion proof passed after `docker start docker-fetchers-1`: the stack returned to healthy state and the rerun immediately began from zero, reaching `128` `source_channel_runtime_state` rows, `84` `fetch_cursors`, `511` `articles`, `511` `document_observations`, `10` `canonical_documents`, `16` `verification_results`, `40` `interest_filter_results`, `8` `final_selection_results`, and `511` `article.ingest.requested` sequence runs in the first minute.

- `STAGE-1-SEQUENCE-DEADLOCK-RESILIENCE-AND-SYSTEM-CRITERION-LLM-DEFAULTS`
  - Kind: Stage
  - Status: done
  - Goal: add generic transient deadlock resilience to sequence task execution and re-align system-interest selection-profile defaults so new/runtime-compatible gray-zone cases can reach the LLM review lane.
  - In scope:
    - task-engine retry handling for transient PostgreSQL deadlock-like failures inside sequence task execution
    - system-interest selection-profile default policy generation and runtime coercion where current repo-owned defaults drift from intended gray-zone LLM behavior
    - targeted unit coverage for both runtime retry behavior and selection-profile default semantics
    - `docs/work.md` sync for this stage
  - Out of scope:
    - mass DB rewrites of existing production/local rows beyond repo-owned code or migration changes required for durable defaults
    - broad source-cohort tuning, feed quarantine, or article-selection threshold redesign
    - admin UX redesign beyond what is strictly needed for truthful default semantics and tests
    - full backlog elimination in this stage
  - Allowed paths:
    - `docs/work.md`
    - `docs/blueprint.md`
    - `docs/contracts/universal-selection-profiles.md`
    - `services/workers/app/task_engine/*`
    - `services/workers/app/selection_profiles.py`
    - `apps/admin/src/lib/server/admin-templates.ts`
    - `apps/admin/src/components/InterestTemplateEditorForm.tsx`
    - `apps/admin/src/pages/templates/interests/new.astro`
    - `tests/unit/python/test_task_engine.py`
    - `tests/unit/python/test_selection_profiles.py`
    - `tests/unit/ts/admin-template-sync.test.ts`
  - Depends on: -
  - Required proof:
    - targeted Python unit coverage for transient retry handling in `SequenceExecutor`
    - targeted Python unit coverage for selection-profile runtime defaults
    - targeted TS unit coverage for admin template/profile sync defaults
    - `git diff --check --` on touched files
  - Risk:
    - medium/high; sequence retry changes can accidentally duplicate task-run persistence if they rerun whole runs instead of retrying only inside task execution, and selection-profile default changes can silently broaden LLM usage if the policy semantics are not kept explicit.
  - Worktree overlap:
    - required overlap with existing mixed edits in `apps/admin/src/lib/server/admin-templates.ts`, `services/workers/app/main.py`, and adjacent tests; this stage must preserve unrelated in-flight work and avoid reverting it.

- `STAGE-2-SYSTEM-INTEREST-PROFILE-REPAIR-AND-OPERATOR-VISIBILITY`
  - Kind: Stage
  - Status: done
  - Goal: repair already persisted compatibility `selection_profiles` that still carry cheap-hold defaults and make gray-zone review state visible to operators without bypassing the sequence-first architecture.
  - In scope:
    - migration/repair path for historical compatibility system-interest profile policy rows
    - truthful operator/admin visibility for `gray_zone`, cheap `hold`, and pending LLM-review state
    - targeted proof for repaired rows and updated read surfaces
  - Out of scope:
    - broad source-cohort tuning or threshold redesign
    - global expansion of mandatory LLM review to non-compatibility profile families
    - throughput tuning beyond Stage 1 executor resilience
  - Allowed paths:
    - `docs/work.md`
    - `docs/blueprint.md`
    - `docs/contracts/universal-selection-profiles.md`
    - `database/migrations/*`
    - `services/workers/app/main.py`
    - `services/workers/app/final_selection.py`
    - `services/api/app/main.py`
    - `apps/admin/src/pages/templates/interests.astro`
    - `apps/admin/src/lib/server/operator-surfaces.ts`
    - related targeted tests under `tests/unit/python/*` and `tests/unit/ts/*`
  - Depends on:
    - `STAGE-1-SEQUENCE-DEADLOCK-RESILIENCE-AND-SYSTEM-CRITERION-LLM-DEFAULTS`
  - Required proof:
    - targeted repair/migration proof for existing compatibility `selection_profiles`
    - targeted operator-surface proof for visible `gray_zone` / `hold` / pending-review state
    - `git diff --check --` on touched files
  - Risk:
    - medium/high; historical profile repair and operator-surface changes can misrepresent queue state if compatibility mapping is not kept explicit.

- `STAGE-3-THROUGHPUT-TUNING-AND-SOURCE-COHORT-HARDENING`
  - Kind: Stage
  - Status: done
  - Goal: remove the dominant article-pipeline contention hotspots and prove that the compose article lane can drain again under normal concurrency.
  - In scope:
    - deadlock hotspot reduction and lock-order/runtime tuning beyond task-local retry
    - bounded throughput tuning for `q.sequence` article lanes
    - targeted proof for worker throughput health and resumed gray-zone review activity after the earlier policy repair
  - Out of scope:
    - deleting historical article data for cleanup
    - broad product/UI redesign unrelated to operator visibility
    - changing non-article sequence lanes without evidence they share the same hotspot
    - generic candidate-recall work, which now belongs to `C-GENERIC-CANDIDATE-RECALL-AND-NOISE-TOLERANT-SELECTION`
  - Allowed paths:
    - `docs/work.md`
    - `docs/blueprint.md`
    - `services/workers/app/main.py`
    - `services/workers/app/task_engine/*`
    - `services/workers/app/final_selection.py`
    - `services/fetchers/src/*`
    - targeted tests under `tests/unit/python/*`
    - targeted tests under `tests/unit/ts/*`
    - compose-safe proof scripts or docs only if required for verification
  - Depends on:
    - `STAGE-1-SEQUENCE-DEADLOCK-RESILIENCE-AND-SYSTEM-CRITERION-LLM-DEFAULTS`
    - `STAGE-2-SYSTEM-INTEREST-PROFILE-REPAIR-AND-OPERATOR-VISIBILITY`
  - Required proof:
    - targeted throughput/deadlock proof on local compose runtime
    - targeted proof that repaired gray-zone review lane is still visible after throughput tuning
    - `git diff --check --` on touched files
  - Risk:
    - high; concurrency and source-cohort tuning can accidentally hide symptoms instead of removing root causes if proof is too narrow.

- `STAGE-4-TRANSIENT-FETCHERS-ENRICHMENT-RETRY-HARDENING`
  - Kind: Stage
  - Status: done
  - Goal: make fetchers-owned enrichment steps resilient to brief internal transport failures so article/resource sequences do not permanently fail during short fetchers restarts or transient service-resolution issues.
  - In scope:
    - retry hardening inside fetchers-owned task-engine enrichment adapters
    - bounded transient-error classification for internal fetchers HTTP transport failures
    - targeted unit proof for retry-vs-permanent-failure behavior
    - `docs/work.md` and `docs/blueprint.md` sync for the shipped runtime truth
  - Out of scope:
    - replaying or mutating already failed historical runs in the current DB
    - widening retry semantics for unrelated external integrations without evidence
    - source-quality tuning or criteria-threshold redesign
  - Allowed paths:
    - `docs/work.md`
    - `docs/blueprint.md`
    - `services/workers/app/task_engine/pipeline_plugins.py`
    - `tests/unit/python/test_task_engine_pipeline_plugins.py`
  - Depends on:
    - `STAGE-3-THROUGHPUT-TUNING-AND-SOURCE-COHORT-HARDENING`
  - Required proof:
    - targeted Python unit coverage for transient fetchers enrichment retry behavior
    - compose/runtime evidence that Stage 3 backlog/deadlock pressure is materially reduced and gray-zone LLM reviews are now appearing
    - `git diff --check --` on touched files
  - Risk:
    - medium; over-broad retry classification could hide permanent contract failures, while under-broad retry classification would leave routine service restarts causing permanent sequence failures.

- `SPIKE-CANDIDATE-LOSS-TAXONOMY-BASELINE`
  - Kind: Spike
  - Status: done
  - Goal: establish a truthful baseline for where potentially meaningful documents/events are currently lost in the selection lane now that the runtime path is healthy again.
  - In scope:
    - read-only SQL/log evidence for dominant candidate-loss shapes across `no_match`, `gray_zone`, LLM review, and final selection
    - grouping the current corpus by document/event-level signal patterns rather than by “good” vs “bad” sources
    - writing a separate Russian planning document that frames the next capability as generic noise-tolerant candidate recall for any information domain
    - preparing the bounded next implementation stage for document/cluster-level candidate signals
  - Out of scope:
    - changing runtime behavior or historical DB rows
    - source-ranking as the primary relevance mechanism
    - hand-curating domain-specific allow/deny lists as the final fix
    - reopening queue/runtime hardening that is already proven
  - Allowed paths:
    - `docs/work.md`
    - `docs/generic-candidate-recall-plan.md`
    - optional read-only `/tmp` artifacts if needed for evidence capture
  - Depends on:
    - `C-PIPELINE-RESILIENCE-AND-GRAY-ZONE-LLM-RECOVERY`
  - Required proof:
    - read-only SQL/log evidence for candidate-loss baseline
    - separate Russian planning document for the next capability
    - truthful next-stage framing for generic document/event-level mitigation
  - Risk:
    - low/medium; the main risk is misclassifying noise as source quality and then planning the wrong primary mitigation.

- `STAGE-1-DOCUMENT-AND-CLUSTER-CANDIDATE-SIGNALS`
  - Kind: Stage
  - Status: done
  - Goal: introduce generic document/canonical/cluster-level candidate signals so potentially meaningful items are less likely to be flattened into early `no_match`.
  - In scope:
    - additive, explainable candidate signals at document/canonical/cluster level
    - bounded changes in worker selection/candidate routing logic that preserve wide ingest
    - targeted operator/read-model visibility for why an item became a candidate or stayed ordinary noise
    - targeted proof for candidate-signal behavior without source-ranking as a primary gate
  - Out of scope:
    - ingest narrowing by host/domain reputation
    - broad domain-specific hacks for one use case
    - historical replay or mutation of existing DB rows in the current baseline
  - Allowed paths:
    - `docs/work.md`
    - `docs/blueprint.md`
    - `docs/generic-candidate-recall-plan.md`
    - `services/workers/app/main.py`
    - `services/workers/app/final_selection.py`
    - `services/api/app/main.py`
    - `apps/admin/src/lib/server/operator-surfaces.ts`
    - targeted tests under `tests/unit/python/*` and `tests/unit/ts/*`
  - Depends on:
    - `SPIKE-CANDIDATE-LOSS-TAXONOMY-BASELINE`
  - Required proof:
    - targeted unit proof for additive candidate signals
    - read-model/operator proof for candidate reasoning visibility
    - `git diff --check --` on touched files
  - Risk:
    - medium/high; weak signal design can either collapse back into cheap rejection or over-broaden gray-zone volume if the routing thresholds are not bounded.
  - Progress now:
    - first safe slice is shipped locally: worker criterion matching now applies a bounded document-level candidate-signal uplift that can move near-threshold `irrelevant` system-criterion outcomes into `gray_zone` when the text carries multiple request/implementation/evaluation cues and no clear noise-group hits.
    - the uplift is additive only: it does not narrow ingest, does not rewrite historical DB rows, and does not change the rule that a single real criterion `match` is already enough for final `selected` when there is no `gray_zone` or conflicting verification.
    - final-selection/API explain payloads now expose `candidateSignalUpliftCount`, so later operator/read-model work can distinguish ordinary semantic gray zone from gray zone created by candidate-signal recovery.
    - the first operator-visibility slice is now proven too: API/admin read models surface recovered-candidate summaries/guidance and `selection_candidate_signal_uplift_count`, so candidate-recovery cases are visible without touching historical DB rows or changing final-selection semantics.
    - the stage closeout slice is shipped too: candidate recovery now also supports bounded context-backed uplift using shared evidence from canonical/story-cluster context, but only under stricter conditions than document-only uplift so generic noise does not flood gray zone.

- `STAGE-2-GRAY-ZONE-AND-LLM-CANDIDATE-ROUTING`
  - Kind: Stage
  - Status: done
  - Goal: make recovered candidates flow through gray-zone and LLM review semantics more intentionally, so the system preserves rare meaningful cases without turning every ambiguous item into review debt.
  - In scope:
    - bounded routing refinements for candidate-recovered gray-zone cases
    - preserving the current `1 real match -> selected` rule while improving ambiguous-candidate handling
    - targeted proof that recovered candidates reach the existing LLM lane or honest hold states without broadening unrelated traffic
  - Out of scope:
    - ingest narrowing by source reputation
    - historical replay or mutation of preserved DB rows
    - domain-specific allow/deny lists
  - Allowed paths:
    - `docs/work.md`
    - `docs/blueprint.md`
    - `docs/generic-candidate-recall-plan.md`
    - `services/workers/app/main.py`
    - `services/workers/app/final_selection.py`
    - `services/api/app/main.py`
    - `apps/admin/src/lib/server/operator-surfaces.ts`
    - targeted tests under `tests/unit/python/*`
    - targeted tests under `tests/unit/ts/*`
  - Depends on:
    - `STAGE-1-DOCUMENT-AND-CLUSTER-CANDIDATE-SIGNALS`
  - Required proof:
    - targeted unit/integration proof for recovered-candidate routing through gray-zone and LLM states
    - read-model/operator proof for visible recovered-candidate routing states
    - `git diff --check --` on touched files
  - Risk:
    - medium/high; the main risk is creating review debt or silently weakening semantic standards if routing semantics become broader than the bounded candidate-recovery path.
  - Progress now:
    - first routing slice is shipped locally: recovered candidates no longer auto-upgrade to `relevant` when the LLM monthly budget is exhausted or the review lane is disabled.
    - candidate-recovered gray-zone rows now persist explicit `runtimeReviewState`, so final-selection hold vs pending-review counts track whether review was actually queued instead of inferring that only from `llmReviewAllowed`.
    - ordinary non-recovered gray-zone budget behavior remains unchanged, so this slice narrows one risky false-positive path without broadening unrelated traffic.
    - read-only preserved-DB baseline after the stage closeout shows `0` recovered-candidate rows and `0` rows with `runtimeReviewState` so far, which is consistent with “new runtime behavior has shipped but this preserved corpus has not yet materialized fresh recovered rows” rather than with a new routing regression.

- `STAGE-3-NOISE-TOLERANT-PROOF-AND-OPERATOR-VISIBILITY`
  - Kind: Stage
  - Status: done
  - Goal: prove the generic candidate-recovery lane against the preserved DB baseline and make operator visibility good enough to measure signal quality without mutating history.
  - In scope:
    - read-only baseline evidence for recovered-candidate materialization on the preserved local DB
    - truthful operator/read-model visibility for recovered-candidate counts and routing states
    - bounded follow-up tuning only where proof shows the current visibility still hides queue reality or signal quality
  - Out of scope:
    - historical replay or deletion of preserved DB rows
    - source-ranking as a relevance gate
    - broad threshold retuning without proof
  - Allowed paths:
    - `docs/work.md`
    - `docs/blueprint.md`
    - `docs/generic-candidate-recall-plan.md`
    - `services/api/app/main.py`
    - `apps/admin/src/lib/server/operator-surfaces.ts`
    - targeted tests under `tests/unit/python/*`
    - targeted tests under `tests/unit/ts/*`
    - optional read-only `/tmp` artifacts
  - Depends on:
    - `STAGE-2-GRAY-ZONE-AND-LLM-CANDIDATE-ROUTING`
  - Required proof:
    - read-only DB evidence for recovered-candidate rows and routing states
    - targeted read-model/operator proof for visible recovered-candidate counters or summaries
    - `git diff --check --` on touched files
  - Risk:
    - medium; the main risk is falsely concluding the lane is broken when the preserved corpus simply has not yet materialized post-change rows.
  - Progress now:
    - stage opened with a preserved-DB baseline on 2026-04-13: `interest_filter_results` currently shows `0` recovered rows and `0` rows with `runtimeReviewState`, `llm_review_log(scope='criterion')` shows `16` reviews across `15` docs, and `final_selection_results` remains `37732 rejected / 497 gray_zone / 4 selected`.
    - API/admin read models now expose explicit `candidateRecoveryState` / `candidateRecoverySummary`, so zero recovered rows are visible as an honest absence rather than as an ambiguous missing signal.
    - the read-only preserved-DB baseline is archived in `/tmp/newsportal-stage3-candidate-recovery-baseline-2026-04-13/report.md`.

- `SPIKE-LIVE-CANDIDATE-MATERIALIZATION-MEASUREMENT`
  - Kind: Spike
  - Status: active
  - Goal: continue measuring the preserved DB until post-change recovered-candidate rows materialize, without replaying or erasing history.
  - In scope:
    - read-only follow-up counts for recovered-candidate rows, runtime-review-state rows, and final-selection distribution
    - preserving baseline artifacts under `/tmp`
    - truthful handoff for future measurement without requiring chat history
  - Out of scope:
    - any DB replay, cleanup, or destructive reset
    - broad runtime retuning without fresh evidence
    - source-level gating as a substitute for document/event-level recall
  - Allowed paths:
    - `docs/work.md`
    - optional read-only `/tmp` artifacts
  - Depends on:
    - `STAGE-3-NOISE-TOLERANT-PROOF-AND-OPERATOR-VISIBILITY`
  - Required proof:
    - read-only DB evidence only
    - baseline artifact path recorded in `docs/work.md`
  - Risk:
    - low; the main risk is overinterpreting zero materialized rows too early.
  - Progress now:
    - initial baseline artifact captured at `/tmp/newsportal-stage3-candidate-recovery-baseline-2026-04-13/report.md`.

### Next recommended action

- Continue `STAGE-3-FRESH-BASELINE-PROOF-AND-TUNING` on the rebuilt baseline: inspect the new post-reset corpus and verify whether candidate-uplift / gray-zone / LLM-review behavior improves on this truly fresh rerun.

### Archive sync status

- Completed item or capability awaiting archive sync:
  none; the full UI button-audit sweep was archived in `docs/history.md` during this sync cycle.
- Why it is still live, if applicable:
  n/a.
- Archive action required next:
  none.

### Test artifacts and cleanup state

- Users created:
  run-scoped Firebase admin aliases created by `pnpm test:mvp:internal`, `pnpm test:discovery:admin:compose`, and the targeted 2026-04-12 live CRUD checks were cleaned after each run; anonymous/local user rows created by the web bootstrap and interest CRUD checks remain in the local PostgreSQL volume.
- Subscriptions or device registrations:
  none recorded; immediate notification proof still uses deterministic `telegram` fixtures instead of persistent `web_push` subscriptions.
- Tokens / keys / credentials issued:
  none recorded; proof reused declared local env contracts only.
- Seeded or imported data:
  fresh local compose volumes now contain run-scoped articles, channels, interests, notification rows, discovery mission/class/candidate rows, and targeted CRUD-check entities created by `pnpm test:mvp:internal`, `pnpm test:discovery:admin:compose`, the targeted admin/user/channel smoke checks, and the temporary idempotent replay of `0030_discovery_schema_drift_repair.sql` used to heal the drifted local discovery schema before final discovery acceptance/browser proof.
- Cleanup status:
  Firebase aliases were cleaned; on 2026-04-13 the local PostgreSQL/Redis volumes were intentionally destroyed and recreated for `PATCH-LOCAL-DB-RESET-WITH-PRESERVED-SYSTEM-CONFIG-2026-04-13`, then again for `PATCH-LOCAL-DB-RESET-WITH-PRESERVED-SYSTEM-CONFIG-2026-04-13-R2`; the preserved system-interest/source/template subset is now restored from `/tmp/newsportal-reset-r2-2026-04-13T191252Z`, and compose services are currently running on the second fresh baseline.
- Reset note:
  the user has now explicitly approved a destructive local reset for the compose DB/Redis volumes as long as the preserved system-interest/LLM/channel subset is exported and restored first.

## Handoff state

- Current item status:
  `C-PIPELINE-RESILIENCE-AND-GRAY-ZONE-LLM-RECOVERY` is implementation-complete through `STAGE-4-TRANSIENT-FETCHERS-ENRICHMENT-RETRY-HARDENING`; `C-GENERIC-CANDIDATE-RECALL-AND-NOISE-TOLERANT-SELECTION` has completed `SPIKE-CANDIDATE-LOSS-TAXONOMY-BASELINE`, `STAGE-1-DOCUMENT-AND-CLUSTER-CANDIDATE-SIGNALS`, `STAGE-2-GRAY-ZONE-AND-LLM-CANDIDATE-ROUTING`, and `STAGE-3-NOISE-TOLERANT-PROOF-AND-OPERATOR-VISIBILITY`; `PATCH-LOCAL-DB-RESET-WITH-PRESERVED-SYSTEM-CONFIG-2026-04-13` and `PATCH-LOCAL-DB-RESET-WITH-PRESERVED-SYSTEM-CONFIG-2026-04-13-R2` are done; `C-POSITIVE-SIGNAL-RECOVERY-AND-ENRICHMENT-SANITIZATION` has now completed the fresh-corpus spike plus stages 1 and 2, and is currently in `STAGE-3-FRESH-BASELINE-PROOF-AND-TUNING` on the rebuilt second fresh baseline.
- Executed proof:
  - required read-order reload for `AGENTS.md`, `docs/work.md`, `docs/blueprint.md`, `docs/engineering.md`, `docs/verification.md`, `.aidp/os.yaml`, `docs/contracts/test-access-and-fixtures.md`, and `docs/contracts/universal-task-engine.md`
  - read-only forensic diagnostics on 2026-04-13 via `pnpm article:yield:diagnostics`, targeted SQL counts, and compose worker/relay log inspection
  - `PYTHONPATH=/tmp:. python -m unittest tests.unit.python.test_task_engine tests.unit.python.test_selection_profiles`
  - `node --import tsx --test tests/unit/ts/admin-template-sync.test.ts`
  - `git diff --check -- docs/work.md services/workers/app/task_engine/executor.py services/workers/app/selection_profiles.py apps/admin/src/lib/server/admin-templates.ts apps/admin/src/components/InterestTemplateEditorForm.tsx apps/admin/src/pages/templates/interests/new.astro tests/unit/python/test_task_engine.py tests/unit/python/test_selection_profiles.py tests/unit/ts/admin-template-sync.test.ts`
  - `PYTHONPATH=/tmp:. python -m unittest tests.unit.python.test_api_system_interests tests.unit.python.test_selection_profiles tests.unit.python.test_task_engine`
  - `node --import tsx --test tests/unit/ts/admin-operator-surfaces.test.ts tests/unit/ts/admin-template-sync.test.ts`
  - `pnpm db:migrate`
  - local PostgreSQL verification before/after migration via `docker exec docker-postgres-1 psql ... selection_profiles ...`
  - `PYTHONPATH=/tmp:. python -m unittest tests.unit.python.test_interest_auto_repair tests.unit.python.test_api_system_interests tests.unit.python.test_selection_profiles tests.unit.python.test_task_engine`
  - `node --import tsx --test tests/unit/ts/fetcher-channel-lease.test.ts tests/unit/ts/fetcher-duplicate-preflight.test.ts tests/unit/ts/admin-operator-surfaces.test.ts tests/unit/ts/admin-template-sync.test.ts`
  - compose restarts for `worker`, `api`, `admin`, and `fetchers` without volume reset
  - live API verification: `curl -sS 'http://127.0.0.1:8000/system-interests?pageSize=5'`
  - fresh compose SQL/runtime evidence after Stage 3: `docker exec docker-postgres-1 psql ... sequence_runs ... trigger_event = 'article.ingest.requested'`, `docker logs docker-worker-1 --since 45m`, `docker exec docker-postgres-1 psql ... llm_review_log ...`
  - `PYTHONPATH=/tmp:. python -m unittest tests.unit.python.test_task_engine_pipeline_plugins`
  - `PYTHONPATH=/tmp:. python -m unittest tests.unit.python.test_task_engine tests.unit.python.test_task_engine_pipeline_plugins`
  - `git diff --check -- docs/work.md docs/blueprint.md services/workers/app/task_engine/pipeline_plugins.py tests/unit/python/test_task_engine_pipeline_plugins.py`
  - separate Russian plan in `docs/generic-candidate-recall-plan.md`
  - read-only baseline for `SPIKE-CANDIDATE-LOSS-TAXONOMY-BASELINE` via `docker exec docker-postgres-1 psql ...` over `interest_filter_results`, `final_selection_results`, `verification_results`, `llm_review_log`, `criteria`, and sampled article/title cohorts
  - read-only spike artifact written to `/tmp/newsportal-candidate-loss-spike-2026-04-13/report.md`
  - `PYTHONPATH=/tmp:. python -m unittest tests.unit.python.test_final_selection tests.unit.python.test_interest_auto_repair`
  - `git diff --check -- services/workers/app/final_selection.py services/workers/app/main.py services/api/app/main.py tests/unit/python/test_final_selection.py tests/unit/python/test_interest_auto_repair.py`
  - `PYTHONPATH=/tmp:. python -m unittest tests.unit.python.test_api_system_interests tests.unit.python.test_final_selection tests.unit.python.test_interest_auto_repair`
  - `node --import tsx --test tests/unit/ts/admin-operator-surfaces.test.ts`
  - second destructive local reset on 2026-04-13 with preserve-set export to `/tmp/newsportal-reset-r2-2026-04-13T191252Z`, `pnpm dev:mvp:internal:down:volumes`, `pnpm dev:mvp:internal:no-build`, restore of `interest_templates` / `criteria` / `criteria_compiled` / `selection_profiles` / `llm_prompt_templates`, replacement restore of `source_providers` plus `source_channels`, and poll-state clearing via PostgreSQL
  - post-reset health and growth artifacts: `/tmp/newsportal-reset-r2-2026-04-13T191252Z/pre_reset_counts.tsv`, `/tmp/newsportal-reset-r2-2026-04-13T191252Z/post_restore_counts.tsv`, `/tmp/newsportal-reset-r2-2026-04-13T191252Z/first_motion_counts.tsv`, `/tmp/newsportal-reset-r2-2026-04-13T191252Z/post_restore_services.txt`
  - `git diff --check -- services/api/app/main.py apps/admin/src/lib/server/operator-surfaces.ts tests/unit/python/test_api_system_interests.py tests/unit/ts/admin-operator-surfaces.test.ts`
  - `PYTHONPATH=/tmp:. python -m unittest tests.unit.python.test_final_selection tests.unit.python.test_interest_auto_repair tests.unit.python.test_api_system_interests`
  - `node --import tsx --test tests/unit/ts/admin-operator-surfaces.test.ts`
  - `git diff --check -- services/workers/app/final_selection.py services/workers/app/main.py services/api/app/main.py apps/admin/src/lib/server/operator-surfaces.ts tests/unit/python/test_final_selection.py tests/unit/python/test_interest_auto_repair.py tests/unit/python/test_api_system_interests.py tests/unit/ts/admin-operator-surfaces.test.ts`
  - `PYTHONPATH=/tmp:. python -m unittest tests.unit.python.test_interest_auto_repair tests.unit.python.test_final_selection tests.unit.python.test_api_system_interests`
  - `node --import tsx --test tests/unit/ts/admin-operator-surfaces.test.ts`
  - `git diff --check -- services/workers/app/main.py services/workers/app/final_selection.py services/api/app/main.py apps/admin/src/lib/server/operator-surfaces.ts tests/unit/python/test_interest_auto_repair.py tests/unit/python/test_final_selection.py tests/unit/python/test_api_system_interests.py tests/unit/ts/admin-operator-surfaces.test.ts`
  - read-only preserved-DB baseline via `docker exec docker-postgres-1 psql ... interest_filter_results ... candidateSignals/runtimeReviewState`, `docker exec docker-postgres-1 psql ... llm_review_log ...`, and `docker exec docker-postgres-1 psql ... final_selection_results ...`
  - `PYTHONPATH=/tmp:. python -m unittest tests.unit.python.test_api_system_interests tests.unit.python.test_interest_auto_repair tests.unit.python.test_final_selection`
  - `node --import tsx --test tests/unit/ts/admin-operator-surfaces.test.ts`
  - `git diff --check -- services/api/app/main.py apps/admin/src/lib/server/operator-surfaces.ts tests/unit/python/test_api_system_interests.py tests/unit/python/test_interest_auto_repair.py tests/unit/python/test_final_selection.py tests/unit/ts/admin-operator-surfaces.test.ts docs/work.md docs/blueprint.md`
  - read-only Stage-3 baseline artifact written to `/tmp/newsportal-stage3-candidate-recovery-baseline-2026-04-13/report.md`
  - dependency audit for the destructive reset via `docker exec docker-postgres-1 psql ...` over `source_channels`, `source_providers`, `interest_templates`, `criteria`, `criteria_compiled`, `selection_profiles`, `llm_prompt_templates`, `fetch_cursors`, and `source_channel_runtime_state`
  - preserved-subset export written to `/tmp/newsportal-reset-2026-04-13T20260413T165012Z` via `docker exec docker-postgres-1 pg_dump ...`
  - destructive local reset via `pnpm dev:mvp:internal:down:volumes`
  - fresh baseline boot via `pnpm dev:mvp:internal:no-build`
  - restore of preserved rows into the fresh DB via `docker exec -i docker-postgres-1 psql ... < /tmp/newsportal-reset-2026-04-13T20260413T165012Z/*.sql`
  - `PYTHONPATH=/tmp:. python -m unittest tests.unit.python.test_final_selection tests.unit.python.test_interest_auto_repair`
  - `node --import tsx --test tests/unit/ts/article-enrichment-sanitizers.test.ts`
  - `docker compose --env-file .env.dev -f infra/docker/compose.yml -f infra/docker/compose.dev.yml up --build -d worker fetchers`
  - live post-rebuild verification via `docker exec docker-postgres-1 psql -U newsportal -d newsportal ... interest_filter_results ... explain_json ? 'candidateSignals'`, `... final_selection_results ...`, `... llm_review_log ...`, plus `docker logs docker-worker-1 --since 10m` and `docker logs docker-fetchers-1 --since 30m | rg '0000-|date/time field value out of range|Article enrichment extract failed'`
  - `node --input-type=module -e "import {readFileSync} from 'node:fs'; JSON.parse(readFileSync('docs/data_scripts/outsource_balanced_templates.json','utf8')); console.log('json-ok');"`
  - local proof-only DB refresh of outsourcing LLM template texts, followed by live verification via `docker exec docker-postgres-1 psql -U newsportal -d newsportal ... llm_prompt_templates ...`
  - live template-path forensics via `docker exec docker-postgres-1 psql -U newsportal -d newsportal ... llm_review_log ... prompt_version ...`
  - post-refresh outcome verification via `docker exec docker-postgres-1 psql -U newsportal -d newsportal ... llm_review_log ... approve/uncertain/reject ...` and `... final_selection_results ... selected/gray_zone/rejected ...`
  - bundle-driven local template refresh via `node --input-type=module ... | docker exec -i docker-postgres-1 psql -U newsportal -d newsportal`
  - post-refresh verification via `docker exec docker-postgres-1 psql -U newsportal -d newsportal ... llm_prompt_templates version ...`, `... llm_review_log prompt_version ...`, and `... interest_filter_results/final_selection_results ...`
  - post-restore zero-state verification via `docker exec docker-postgres-1 psql ...` over preserved tables plus `fetch_cursors`, `source_channel_runtime_state`, `articles`, `document_observations`, `canonical_documents`, `verification_results`, `interest_filter_results`, `final_selection_results`, and `llm_review_log`
  - fetchers resume via `docker start docker-fetchers-1`
  - first-motion verification via `docker ps`, `docker logs docker-fetchers-1 --since 90s`, and `docker exec docker-postgres-1 psql ...` over runtime/article/selection counts plus `sequence_runs` joined to `sequences`
- What is already proven:
  current local runtime keeps persisting observations, canonical documents, verification rows, interest-filter rows, and final-selection rows; Stage 1 now adds task-local transient DB retry handling in `SequenceExecutor` and makes compatibility system-interest profiles default to explicit LLM review while preserving cheap-hold defaults for non-compatibility profile families; Stage 2 repaired the historical local compatibility profile rows in-place without deleting data and updated admin/API/operator wording so pending LLM review is visible instead of hidden behind stale `optional`/raw policy text; Stage 3 materially reduced the earlier backlog/deadlock symptom on the local compose baseline: the active `article.ingest.requested` sequence moved from thousands of pending runs to `36527 completed` and `132 failed`, fresh worker logs in the recent 45-minute window no longer show `DeadlockDetected`, and `llm_review_log` has moved from `0` to `6` rows across `5` reviewed docs after the repaired profile path started flowing; Stage 4 now hardens the fetchers-owned enrichment adapters so short-lived internal transport failures and retryable gateway statuses are retried inside the task adapter before a run is failed; the completed candidate-loss spike now shows that the dominant terminal shape is `5 filters -> 0 matches -> rejected`, while the only current `selected` docs come from direct request-like titles approved by LLM, and `implementation/howto` plus `comparison/listicle` shapes appear to be the main gray-zone reservoirs for the next generic recall stage; `STAGE-1-DOCUMENT-AND-CLUSTER-CANDIDATE-SIGNALS` is implementation-complete and proven: near-threshold request/implementation documents can be uplifted from early `irrelevant` to `gray_zone`, shared canonical/story-cluster context can provide a stricter context-backed recovery path, recovered candidates queue the existing LLM review path, API/admin read models expose recovered-candidate summaries/guidance via `candidateSignalUpliftCount` / `selection_candidate_signal_uplift_count`, and the `1 real match -> selected` final-selection rule remains unchanged; `STAGE-2-GRAY-ZONE-AND-LLM-CANDIDATE-ROUTING` is implementation-complete and proven too: recovered candidates no longer auto-approve on exhausted LLM budget, final-selection hold vs pending-review counts prefer explicit `runtimeReviewState.reviewQueued` over policy-only inference, and the preserved DB baseline shows no post-change recovered rows yet rather than a new routing regression; `STAGE-3-NOISE-TOLERANT-PROOF-AND-OPERATOR-VISIBILITY` is now complete as well: API/admin read models expose explicit `candidateRecoveryState` / `candidateRecoverySummary`, and the zero-row preserved-DB baseline is now visible as a truthful absence rather than as an ambiguous missing feature; `PATCH-LOCAL-DB-RESET-WITH-PRESERVED-SYSTEM-CONFIG-2026-04-13` is proven too: the local DB was wiped and recreated, the preserved configuration subset was restored from `/tmp/newsportal-reset-2026-04-13T20260413T165012Z`, all historical article/runtime/selection rows were removed, channel fetch state was cleared, and the fresh rerun started materializing new sequence/article/selection rows immediately after `fetchers` was resumed.
- What is still unproven or blocked:
  the reset slice itself is complete; what remains unproven is why the fresh corpus still collapses into `S_pos = 0` / `no_match` everywhere and how much of the observed loss is independent from the separate `0000-...` enrichment date failure.
- Scope or coordination warning for the next agent:
  the worktree remains heavily mixed, especially around worker/article-selection files; do not revert unrelated in-flight edits, and if another reset is considered later, do not assume the user only meant “templates + channels” literally because the live runtime also requires the linked `criteria`, `criteria_compiled`, `selection_profiles`, and `source_providers` rows to preserve truthful system-interest behavior after reset.

### Recently changed

- 2026-04-13 — archived `SWEEP-FULL-UI-BUTTON-AUDIT-2026-04-12`: completed the full browser-level web/admin button audit, hardened the reusable audit harness, and closed the sweep with one honest `Connect Web Push` proof-environment residual.
- 2026-04-12 — archived `PATCH-DISCOVERY-MISSION-CLASS-LIFECYCLE-2026-04-12`: added mission/class archive/reactivate/delete support across discovery admin UI, BFF, API, migration/runtime proof, and browser-confirm click coverage.
- 2026-04-12 — archived `PATCH-ADMIN-WEB-RESOURCES-AND-REACT-NOISE-2026-04-12`: repaired `/maintenance/web-resources`, made `LiveReindexJobsSection` hydration-safe, and re-greened website-admin plus browser-smoke proof.
- 2026-04-12 — archived `PATCH-CUSTOM-CONFIRM-DIALOGS-2026-04-12`: replaced the temporary native confirm fallback with custom `AlertDialog`-based admin confirms, rebuilt `admin`, and re-greened full browser click proof including bulk schedule and reindex submit buttons.
- 2026-04-12 — archived `SPIKE-BROWSER-BUTTON-ACTIONS-2026-04-12`: repaired admin confirm submission, fixed web `/interests` serialized action paths, rebuilt `web/admin`, and re-greened full browser click proof across templates, user interests, channels, and discovery.
- 2026-04-12 — archived `SPIKE-ADMIN-CRUD-COVERAGE-2026-04-12`: live proof separated supported CRUD flows from local runtime gaps, confirmed admin/user/template/channel behavior, and recorded the current `web-resources` regression plus missing discovery delete/archive intents.
- 2026-04-10 — archived `SWEEP-DOCS-AND-ARCHITECTURE-SYNC`: runtime/process docs were re-synced to shipped selection/discovery truth, `docs/data_scripts` assets were validated and documented, legacy `atom` provider rows were normalized back to `rss`, and a new visual walkthrough landed in `docs/architecture-overview.md`.
- 2026-04-10 — archived `C-UNIVERSAL-CONFIGURABLE-SELECTION-PROFILES`: the repo now has durable profile contracts, additive `selection_profiles`, cheap hold-aware final selection, server-owned explain/guidance/read models, replay provenance, compatibility-only normalization, and green `reindex-backfill` compose proof for the migrated lane.

## Operating limits

Keep this file operationally small.

- Keep `Current memory` roughly within 20-40 lines.
- Keep `Recently changed` to at most 5-8 concise bullets.
- Keep only active capabilities и decision-relevant live state.
- Do not let the worktree become semantically broader than the active execution state recorded here.
- Move durable completed detail into `docs/history.md`.
- Do not let a fully completed capability remain here as durable detail after the current sync cycle.

## Automatic compression triggers

Run context compression when any are true:

- an item moved to `done`
- an item is about to be archived
- the primary active item changed
- this file exceeds the operating limits above
- more than 8 recent change bullets are present
- completed detail is still occupying live space here
- a capability line has become stale after stage completion or replanning
- all stages for a capability are done and it now needs durable archival detail
- a handoff or session end is about to happen after meaningful changes
