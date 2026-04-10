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
- Why now: the latest UI verification and repair capability is fully closed and archived; live state is intentionally compressed until a new bounded item is opened.

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
- Repo-level UI proof now includes `pnpm test:web:viewports` for web desktop/tablet/mobile browser coverage and `pnpm test:discovery:admin:compose` for `/admin/discovery` operator flows.
- Immediate notification truth remains `web_push` / `telegram` for `notification_log`; `email_digest` stays digest-only, so browser proofs that verify `/notifications` or feedback must seed an immediate channel separately.
- Former audit findings `F-001` through `F-005` are now fully closed: website-admin acceptance self-bootstraps and cleans up quietly, admin source CRUD covers `api` and `email_imap`, and admin exposes a first-class automation/outbox operator surface.
- The standalone audit artifact has been retired; durable operator-baseline truth now lives in `docs/manual-mvp-runbook.md`, `docs/verification.md`, `docs/blueprint.md`, `docs/contracts/universal-task-engine.md`, `.aidp/os.yaml`, and `docs/history.md`.
- Python services по-прежнему не имеют repo-level typecheck gate comparable to `pnpm typecheck`.
- Article-yield remediation on 2026-04-08 remains shipped truth: repeatable diagnostics/export CLI, future-only remediation CLI, and enrichment sanitizers for malformed extracted timestamps plus non-positive media dimensions are live; the last verified compose snapshot on 2026-04-08 showed `502` active RSS channels, `6605` article rows, `672` distinct canonical URLs, `19` eligible rows, and `0` pending `article.ingest.requested` runs.
- Shipped zero-shot cutover truth is now end-to-end additive and final-selection-first: raw intake persists `document_observations`, worker dedup materializes `canonical_documents`, clustering/verification populate `story_clusters` plus `verification_results`, semantic filtering writes `interest_filter_results`, and downstream selection truth lives in `final_selection_results`; `system_feed_results` remains a bounded compatibility projection only.
- Worker-side personalization/backfill behavior now prefers `final_selection_results` whenever present, and historical repair proof explicitly clears and rebuilds additive stage-2/3/4 rows (`story_clusters`, `verification_results`, `interest_filter_results`, `final_selection_results`) before re-validating compatibility projection and retro-notification suppression.
- Shipped zero-shot stage-5 discovery truth remains decoupled from downstream selected-content outcomes: discovery/source-quality metrics are based on generic intake evidence such as unique-article ratio, fetch health, freshness, lead-time, and duplication pressure rather than `system_feed_results` or `final_selection_results`.
- Current discovery blueprint truth still remains graph-first and mission-fit-centric at the planning layer: `discovery_missions.interest_graph` stays authoritative planning state and contextual source scoring still persists through `discovery_source_interest_scores`, but source onboarding is no longer only mission/hypothesis-owned because the bounded recall path can now acquire and promote candidates into `source_channels` too.
- Shipped independent-recall stage-1/2/3/4/5 truth now persists additive `discovery_source_quality_snapshots`, `discovery_recall_missions`, and `discovery_recall_candidates`; discovery summary now counts promoted/duplicate recall candidates separately, source-profile reads surface the latest generic quality snapshot, admin/help discovery surfaces label mission fit vs generic source quality vs neutral recall backlog vs recall-promotion state explicitly, and neutral recall can now both acquire bounded `rss` / `website` candidates without `interest_graph` and onboard promoted candidates through the existing PostgreSQL + outbox source-registration contract while persisting `registered_channel_id` and shared source-profile channel linkage.
- The separate compose discovery schema-drift residual around `0016_adaptive_discovery_cutover.sql` is now repaired on the local baseline: `0026a_discovery_schema_drift_prerepair.sql` heals drifted DBs before `0027`, `0030_discovery_schema_drift_repair.sql` restores the remaining discovery core tables/constraints idempotently, and migration smoke now asserts the full discovery core so the same drift fails fast in fresh proof.

## Capability planning

### Active capabilities

- none.

### Active work items

- none.

### Next recommended action

- Open a new bounded item before more implementation work; if it touches web/admin interactive surfaces, reuse the shipped UI proof owners instead of creating a parallel harness.

### Archive sync status

- Completed item or capability awaiting archive sync:
  none.
- Why it is still live, if applicable:
  n/a.
- Archive action required next:
  none.

### Test artifacts and cleanup state

- Users created:
  run-scoped Firebase admin aliases from `pnpm integration_tests`, `pnpm test:website:admin:compose`, `node infra/scripts/test-automation-admin-flow.mjs`, `pnpm test:discovery:admin:compose`, and `pnpm test:web:viewports` were created and cleaned by their scripts; anonymous/local user rows created inside the compose proof remain in the local PostgreSQL volume.
- Subscriptions or device registrations:
  none recorded; user-facing immediate notification proof used deterministic `telegram` channel fixtures instead of persistent `web_push` subscriptions.
- Tokens / keys / credentials issued:
  none recorded; proof reused declared local env contracts only.
- Seeded or imported data:
  run-scoped RSS, website, API, and Email IMAP channels; projected/resource-only website rows; system/user interests; saved/followed content-state rows; digest delivery rows; sequence/run/task-run rows from `/automation`; reindex/backfill jobs; discovery mission/class/candidate/recall rows; and responsive-proof content fixtures were created during the UI-verification closeout proofs on the local compose baseline.
- Cleanup status:
  compose services were stopped non-destructively with `pnpm dev:mvp:internal:down`; local PostgreSQL/Redis volumes were intentionally preserved, so proof artifacts remain as residual local test data because no destructive volume reset was performed.

## Handoff state

- Current item status:
  no active item; `C-UI-INTERACTIVE-VERIFICATION-AND-REPAIR` is closed and archived.
- Executed proof:
  - targeted regression proof: `node --check infra/scripts/test-web-viewports.mjs`
  - targeted regression proof: `node --check infra/scripts/test-discovery-admin-flow.mjs`
  - targeted regression proof: `node --import tsx --test tests/unit/ts/discovery-admin.test.ts`
  - targeted regression proof: `python -m unittest tests.unit.python.test_api_discovery_management tests.unit.python.test_discovery_orchestrator`
  - closeout gate: `pnpm unit_tests`
  - closeout gate: `pnpm typecheck`
  - closeout gate: `pnpm integration_tests`
  - closeout gate: `pnpm test:web:viewports`
  - closeout gate: `pnpm test:website:admin:compose`
  - closeout gate: `node infra/scripts/test-automation-admin-flow.mjs`
  - closeout gate: `pnpm test:discovery:admin:compose`
  - closeout gate: `pnpm test:website:compose`
  - closeout gate: `pnpm test:channel-auth:compose`
  - closeout gate: `pnpm test:cluster-match-notify:compose`
  - closeout gate: `pnpm test:discovery-enabled:compose`
  - closeout gate: `pnpm test:reindex-backfill:compose`
  - cleanup proof: `pnpm dev:mvp:internal:down`
- Proof status:
  `passed`
- What is already proven:
  web and admin interactive owner flows now have dedicated compose/browser coverage for responsive web surfaces, admin automation, website/resources, and discovery control-plane actions; the declared local closeout chain is green.
- What is still unproven or blocked:
  none for the archived capability; admin responsive behavior beyond desktop and browser receipt for `web_push` remain intentionally outside this capability's proof scope.
- Scope or coordination warning for the next agent:
  the worktree is still heavily mixed with unrelated changes, so any new task must declare its own overlap paths instead of assuming nearby web/admin paths belong to a single capability.

### Recently changed

- 2026-04-09 — archived `C-UI-INTERACTIVE-VERIFICATION-AND-REPAIR`: added first-class `pnpm test:web:viewports` and `pnpm test:discovery:admin:compose` proof owners, fixed tablet header overflow plus notification-fixture drift in the web acceptance harnesses, repaired discovery admin runtime/audit/read-model regressions, and greened the full closeout chain.
- 2026-04-09 — archived `C-ADMIN-AUDIT-FINDINGS-REMEDIATION-AND-AUDIT-RETIREMENT`: the website-admin harness residuals, `api`/`email_imap` operator CRUD gap, and sequence/outbox operator gap are all closed; stable docs were synced, the final gate chain plus automation smoke passed, and `docs/admin-api-coverage-audit.md` was deleted.
- 2026-04-09 — completed and archived `SPIKE-ADMIN-API-COVERAGE-AND-RUNTIME-VERIFICATION`: added the temporary audit artifact, ran the declared admin/operator gate sweep, confirmed the operator-ready baseline, and recorded explicit gaps plus harness residuals (`F-001` through `F-005`) before remediation.
- 2026-04-09 — completed and archived `PATCH-DISCOVERY-SCHEMA-REPAIR-DOC-SYNC`: synced the repaired discovery migration baseline into `docs/blueprint.md`, `docs/engineering.md`, and `docs/contracts/discovery-agent.md`, then rechecked consistency with targeted `rg` plus `git diff --check`.
- 2026-04-09 — completed and archived `PATCH-DISCOVERY-SCHEMA-REPAIR-0016`: added `0026a_discovery_schema_drift_prerepair.sql` plus `0030_discovery_schema_drift_repair.sql`, expanded migration smoke to assert discovery-core tables/indexes/constraints, repaired the live compose DB, and re-greened `pnpm test:discovery-enabled:compose`.

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
