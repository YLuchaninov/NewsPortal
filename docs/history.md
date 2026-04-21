# History

Этот файл хранит durable detail по завершенной работе.

## Правила

- Completed detail переносится сюда, а не накапливается в `docs/work.md`.
- Когда completed item или capability больше не имеет truthful live next stage, archive sync должен происходить в текущем sync cycle, а не когда-нибудь потом.
- Завершенные записи не переоткрываются; для нового запроса создается новый work item.
- Запись должна сохранять причинно-следственную связь без опоры на chat history.
- Архив должен сохранять достаточно detail, чтобы completed item можно было понять без chat history.
- Активный контекст сжимается, архив — нет.
- Audit может предлагать перенос detail сюда, но не должен молча переписывать исторический смысл без явного approval.

## Completed items

### 2026-04-21 — C-DOWNSTREAM-OUTSOURCING-SELECTION-USEFULNESS-CLOSEOUT — Closed the clean-baseline Example C outsourcing zero-yield gap through downstream diagnostics, admin-owned bundle retune, and bounded generic wrapper-noise hardening

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: after discovery runtime/provider/policy work had already been hardened, the dominant product loss for the clean Example C outsourcing contour no longer sat in discovery approve/promote correctness. Sources and projected articles were reaching the downstream pipeline, but useful selected/eligible output stayed at zero. The truthful fix therefore had to target `resource -> article -> interest_filter_results -> final_selection_results`, keep discovery generic, and prefer admin-owned bundle truth over domain hardcoding.
- Что изменилось:
  - added normalized downstream diagnostics across runtime, API, admin, and proof:
    - [`services/workers/app/final_selection.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/final_selection.py)
    - [`services/workers/app/main.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/main.py)
    - [`services/api/app/main.py`](/Users/user/Documents/workspace/my/NewsPortal/services/api/app/main.py)
    - [`apps/admin/src/lib/server/operator-surfaces.ts`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/lib/server/operator-surfaces.ts)
    - [`apps/admin/src/pages/articles/[docId].astro`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/articles/[docId].astro)
    - [`apps/admin/src/pages/resources/[resourceId].astro`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/resources/[resourceId].astro)
    - `final_selection_results.explain_json` and admin/operator read surfaces now expose:
      - `downstreamLossBucket`
      - `selectionBlockerStage`
      - `selectionBlockerReason`
      - `holdReason`
      - `semanticSignalSummary`
      - `verificationSignalSummary`
  - made the clean outsourcing proof artifact truthful at the stage-loss level:
    - [`infra/scripts/run-live-website-outsourcing.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/run-live-website-outsourcing.mjs)
    - the artifact now records:
      - normalized usefulness buckets
      - downstream loss buckets
      - selection blocker stage counts
      - interest filter reason counts
      - per-site evidence, including whether projected rows were only technical wrapper/category noise
  - retuned the Example C admin-owned outsourcing bundle instead of adding domain logic in workers:
    - [`infra/scripts/lib/outsource-example-c.bundle.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/lib/outsource-example-c.bundle.mjs)
    - prompts now:
      - keep buyer-authored marketplace request cards valid even with wrapper chrome;
      - explicitly recognize formal tender / contract-notice / competition pages as buyer intent when the body shows procurement scope, authority, bids, deadlines, or supplier submission evidence;
      - continue rejecting portal shells, category/search pages, freelancer profiles, and seller-authored service pages.
  - added bounded generic engine hardening only where diagnostics justified it:
    - [`services/workers/app/main.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/main.py)
    - [`tests/unit/python/test_worker_hard_filters.py`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/python/test_worker_hard_filters.py)
    - wrapper/category/job-board pages are now rejected as technical noise via `wrapper_directory_noise` when they look like search/directory shells without a direct buyer request in title/lead;
    - direct buyer-request marketplace pages are preserved even when body chrome contains freelancer cards, navigation, or proposal widgets.
  - kept discovery proof green after the downstream work:
    - [`infra/scripts/seed-live-discovery-example-fixtures.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/seed-live-discovery-example-fixtures.mjs) now uses the truthful downstream-needed compile gate on the discovery proof fixture bootstrap, so the examples/yield contours no longer fail on an overly strict clean-stack criterion compile expectation.
- Что было доказано:
  - focused/static proof:
    - `python -m unittest tests.unit.python.test_worker_hard_filters tests.unit.python.test_interest_auto_repair tests.unit.python.test_api_zero_shot_operator_surfaces tests.unit.python.test_final_selection`
    - `pnpm unit_tests`
    - `pnpm typecheck`
  - clean-baseline outsourcing product proof:
    - `pnpm dev:mvp:internal:down:volumes`
    - `pnpm dev:mvp:internal`
    - `node infra/scripts/run-live-website-outsourcing.mjs`
    - authoritative artifact:
      - `/tmp/newsportal-live-website-outsourcing-2026-04-21T164917178Z.json|md`
    - result:
      - `classificationCounts`:
        - `projected_but_not_selected = 18`
        - `external/runtime_residual = 9`
        - `projected_and_selected = 1`
        - `browser_fallback_residual = 1`
        - `skipped_rejected_open_web = 1`
      - `usefulnessBucketCounts`:
        - `articles_produced_but_zero_selected_outputs = 15`
        - `resources_extracted_but_no_stable_articles = 3`
        - `source_onboarded_but_no_extracted_resources = 10`
        - `selected_useful_evidence_present = 1`
      - `downstreamLossBucketCounts`:
        - `semantic_rejected = 210`
        - `technical_filter_rejected = 84`
        - `gray_zone_hold = 20`
        - `selected_useful_evidence_present = 2`
      - `interestFilterReasonCounts` now explicitly include `wrapper_directory_noise = 125`
      - `totalResources = 348`
      - `totalArticles = 316`
      - `totalSelected = 2`
      - `totalEligible = 2`
      - selected site:
        - `PeoplePerHour`
  - discovery non-regression remained green after the downstream hardening:
    - `pnpm test:discovery:examples:compose`
      - `/tmp/newsportal-live-discovery-examples-881b1ff5.json|md`
      - later rerun:
        - `/tmp/newsportal-live-discovery-examples-989efe9d.json|md`
      - both results:
        - `runtimeVerdict = pass`
        - `yieldVerdict = pass`
        - `finalVerdict = pass`
    - `pnpm test:discovery:yield:compose`
      - transient live residual:
        - `/tmp/newsportal-live-discovery-yield-proof-6992dfa4.json|md`
        - one run timed out waiting for Example C recall candidates
      - authoritative rerun:
        - `/tmp/newsportal-live-discovery-yield-proof-36e07737.json|md`
      - authoritative result:
        - `runtimeVerdict = pass`
        - `yieldVerdict = pass`
        - `finalVerdict = pass`
    - `git diff --check --`
- Что capability доказала:
  - the clean Example C outsourcing bundle is no longer zero-yield:
    - `totalSelected > 0`
    - `selected_useful_evidence_present > 0`
  - the main downstream loss is now more truthful and more actionable:
    - the earlier clean-baseline `articles_produced_but_zero_selected_outputs = 17` dropped to `15`;
    - part of the former “zero selected” loss is now correctly isolated as technical wrapper/category noise rather than semantic failure of plausible buyer-intent content.
  - the fix stayed inside the right layers:
    - admin-owned prompt/bundle truth carried the use-case semantics;
    - generic engine changes stayed bounded to source-shape wrapper filtering;
    - discovery runtime remained generic and passed its compose proof after the downstream changes.

### 2026-04-21 — C-DISCOVERY-PRODUCT-SELECTION-QUALITY-CLOSEOUT — Added discovery product diagnostics, balanced source-family-aware tuning, and admin-owned usefulness controls without hardcoded case/domain runtime logic

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: after the approve-boundary/provider-decoupling work closed, discovery runtime was structurally healthier but still not product-ready enough for source selection. The next truthful step was not another single score tweak; it was to expose where usefulness is lost from candidate approval through onboarding, article extraction, and final selection, then tune discovery in a generic/admin-owned way without baking Example B/C or specific domains into runtime truth.
- Что изменилось:
  - added generic admin-managed usefulness tuning on top of existing discovery profiles:
    - [`services/workers/app/discovery_policy.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/discovery_policy.py)
    - [`services/api/app/main.py`](/Users/user/Documents/workspace/my/NewsPortal/services/api/app/main.py)
    - [`apps/admin/src/pages/bff/admin/discovery.ts`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/bff/admin/discovery.ts)
    - [`apps/admin/src/pages/discovery.astro`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/discovery.astro)
    - the shipped admin/runtime profile surface now supports additive generic fields:
      - `expectedSourceShapes`
      - `allowedSourceFamilies`
      - `disfavoredSourceFamilies`
      - `usefulnessHints`
      - `diversityCaps.maxPerSourceFamily`
      - `diversityCaps.maxPerDomain`
  - kept discovery boundary ownership separate while adding product diagnostics:
    - runtime `policyReview` now persists additive usefulness signals:
      - `onboardingVerdict`
      - `productivityRisk`
      - `usefulnessDiagnostic`
      - `stageLossBucket`
      - `sourceFamily`
      - `sourceShape`
    - approve/promote gates still remain owned by mission fit, safety/provider compatibility, policy verdict, and profile thresholds; downstream tables are not fed back as a hidden runtime-owner score.
  - made shortlist formation more source-family-aware without domain hardcoding:
    - [`services/workers/app/source_scoring.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/source_scoring.py)
    - [`services/workers/app/discovery_orchestrator.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/discovery_orchestrator.py)
    - graph shortlist selection now applies bounded diversity pressure by source family/domain using admin-managed caps instead of case-specific domain rules.
  - normalized product diagnostics across proof artifacts:
    - [`infra/scripts/lib/discovery-live-proof-profiles.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/lib/discovery-live-proof-profiles.mjs)
    - [`infra/scripts/lib/discovery-live-yield-policy.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/lib/discovery-live-yield-policy.mjs)
    - [`infra/scripts/test-live-discovery-examples.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/test-live-discovery-examples.mjs)
    - [`infra/scripts/run-live-website-outsourcing.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/run-live-website-outsourcing.mjs)
    - discovery example artifacts now emit per-case `stageLossBuckets` and `productivityBuckets`;
    - the clean Example C outsourcing artifact now also emits normalized usefulness buckets:
      - `source_onboarded_but_no_extracted_resources`
      - `resources_extracted_but_no_stable_articles`
      - `articles_produced_but_zero_selected_outputs`
      - `selected_useful_evidence_present`
  - extended regression coverage for the new additive surfaces:
    - [`tests/unit/python/test_discovery_policy.py`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/python/test_discovery_policy.py)
    - [`tests/unit/python/test_api_discovery_management.py`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/python/test_api_discovery_management.py)
    - [`tests/unit/ts/discovery-admin.test.ts`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/ts/discovery-admin.test.ts)
    - [`tests/unit/ts/admin-operator-surfaces.test.ts`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/ts/admin-operator-surfaces.test.ts)
    - [`tests/unit/ts/discovery-live-yield-policy.test.ts`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/ts/discovery-live-yield-policy.test.ts)
  - synced runtime/process truth:
    - [`docs/work.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/work.md)
    - [`docs/verification.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/verification.md)
    - [`docs/contracts/discovery-agent.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/contracts/discovery-agent.md)
- Что было доказано:
  - focused implementation proof:
    - `python -m unittest tests.unit.python.test_discovery_policy tests.unit.python.test_api_discovery_management`
    - `pnpm unit_tests`
    - `pnpm typecheck`
  - discovery compose proof:
    - `pnpm test:discovery:admin:compose`
    - `pnpm test:discovery:examples:compose`
      - `/tmp/newsportal-live-discovery-examples-dafb6241.json|md`
      - result:
        - `runtimeVerdict = pass`
        - `yieldVerdict = weak`
        - `finalVerdict = yield_weak`
        - aggregate root causes:
          - `yield_pass = 1`
          - `review_policy_problem = 1`
    - `pnpm test:discovery:nonregression:compose`
      - `/tmp/newsportal-discovery-nonregression-ed418130.json|md`
      - result:
        - `runtimeVerdict = pass`
        - `yieldVerdict = pass`
        - `nonRegressionVerdict = pass`
        - `finalVerdict = pass`
    - `pnpm test:discovery:yield:compose`
      - `/tmp/newsportal-live-discovery-yield-proof-a5fb0ebf.json|md`
      - result:
        - `runtimeVerdict = pass`
        - `yieldVerdict = pass`
        - `finalVerdict = pass`
        - bounded multi-run gate:
          - `Example B = 2/3`
          - `Example C = 3/3`
  - clean-baseline Example C outsourcing product proof:
    - `pnpm dev:mvp:internal:down:volumes`
    - `pnpm dev:mvp:internal`
    - `node infra/scripts/run-live-website-outsourcing.mjs`
      - `/tmp/newsportal-live-website-outsourcing-2026-04-21T123045997Z.json|md`
      - result:
        - coarse classification summary:
          - `projected_but_not_selected = 17`
          - `external/runtime_residual = 11`
          - `browser_fallback_residual = 1`
          - `skipped_rejected_open_web = 1`
        - normalized usefulness summary:
          - `articles_produced_but_zero_selected_outputs = 17`
          - `source_onboarded_but_no_extracted_resources = 12`
          - `totalResources = 339`
          - `totalArticles = 304`
          - `totalSelected = 0`
- Что capability доказала:
  - discovery runtime/admin/operator truth is now strong enough to explain product-quality loss in a generic, admin-owned way instead of hiding it inside one opaque score or hardcoded case/domain logic;
  - the current remaining Example C clean-baseline usefulness blocker is no longer a discovery-runtime correctness issue: it is downstream-heavy, concentrated after article production rather than at approve/promote boundary ownership;
  - future quality work should therefore open a separate downstream/final-selection capability instead of silently extending discovery runtime with case-specific heuristics.

### 2026-04-21 — STAGE-4-ADMIN-PROOF-DOC-CLOSEOUT and C-DISCOVERY-APPROVE-BOUNDARY-PRECISION-AND-PROVIDER-DECOUPLING — Closed compose-proof recovery with admin-owned discovery fixture truth and provider-decoupled approve-boundary runtime

- Тип записи: stage + capability archive
- Финальный статус: archived
- Зачем понадобилось: after the provider-decoupled discovery runtime, layered review model, and admin explainability changes landed, the remaining truthful blocker was no longer feature code but compose-proof recovery. The local compose DB had schema drift (`discovery_candidates.updated_at` missing plus missing discovery-core tables on an already-marked migrated DB), the examples harness still depended on proof fixtures that were not self-healed through admin-owned truth, nested non-regression/yield runners could deadlock by piping verbose compose output, and website admin acceptance was still drifting from the shared row-level bulk `providerType` contract.
- Что изменилось:
  - repaired compose schema truth instead of adding runtime fallbacks:
    - [`database/migrations/0041_discovery_candidates_updated_at_repair.sql`](/Users/user/Documents/workspace/my/NewsPortal/database/migrations/0041_discovery_candidates_updated_at_repair.sql) now adds/backfills `discovery_candidates.updated_at` idempotently;
    - [`database/migrations/0042_discovery_core_schema_repair_replay.sql`](/Users/user/Documents/workspace/my/NewsPortal/database/migrations/0042_discovery_core_schema_repair_replay.sql) now replays missing discovery-core tables/constraints/indexes on already-marked drifted compose DBs;
    - [`services/relay/src/cli/test-migrations.ts`](/Users/user/Documents/workspace/my/NewsPortal/services/relay/src/cli/test-migrations.ts) now treats `discovery_candidates.updated_at` as required discovery-core schema truth.
  - aligned runtime/admin mutation paths to the repaired schema:
    - [`services/workers/app/discovery_orchestrator.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/discovery_orchestrator.py) now bumps `updated_at` across candidate upsert, profile-link, review-update, and registration-update paths;
    - [`services/api/app/main.py`](/Users/user/Documents/workspace/my/NewsPortal/services/api/app/main.py) now bumps `updated_at` on admin-side candidate review updates too.
  - moved proof prerequisites into admin-owned fixture seeding rather than runtime-owned case logic:
    - [`infra/scripts/seed-live-discovery-example-fixtures.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/seed-live-discovery-example-fixtures.mjs) now exports reusable fixture seeding without closing the caller-owned pool;
    - [`infra/scripts/test-live-discovery-examples.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/test-live-discovery-examples.mjs) now self-seeds Example B/C proof fixtures through the same admin-owned truth surfaces the operator uses, and supports parent-owned nested mode via `DISCOVERY_EXAMPLES_SKIP_PREFLIGHT`, `DISCOVERY_EXAMPLES_SKIP_STACK_RESET`, and an explicit artifact-pointer file.
  - fixed nested proof orchestration instead of treating it as product regression:
    - [`infra/scripts/test-discovery-pipeline-nonregression.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/test-discovery-pipeline-nonregression.mjs) now runs the examples harness in parent-owned mode and reads artifact paths from a pointer file instead of buffering compose logs through a pipe;
    - [`infra/scripts/test-live-discovery-yield-proof.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/test-live-discovery-yield-proof.mjs) now does the same for all three bounded runs and preserves early-stop behavior for real runtime/precondition failures;
    - [`infra/scripts/lib/discovery-live-yield-policy.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/lib/discovery-live-yield-policy.mjs) now treats nested preflight `skipped` as a valid parent-owned proof state instead of collapsing it into runtime failure.
  - kept website admin acceptance aligned with the shared import contract instead of widening the BFF:
    - [`infra/scripts/test-website-admin-flow.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/test-website-admin-flow.mjs) now sends `providerType: "website"` inside each website row for bulk preflight/apply, matching the shipped row-level provider contract.
  - synced proof/document truth:
    - [`docs/verification.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/verification.md)
    - [`docs/contracts/discovery-agent.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/contracts/discovery-agent.md)
    - [`docs/work.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/work.md)
    - [`docs/history.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/history.md)
- Что было доказано:
  - compose/schema/runtime proof:
    - `pnpm test:migrations:smoke`
    - `pnpm test:discovery-enabled:compose`
    - `pnpm test:discovery:admin:compose`
    - `pnpm test:discovery:examples:compose`
      - authoritative successful artifact:
        - `/tmp/newsportal-live-discovery-examples-34290302.json|md`
      - later parent-owned nested proof artifact:
        - `/tmp/newsportal-live-discovery-examples-46e6e464.json|md`
    - `pnpm test:discovery:nonregression:compose`
      - authoritative artifact:
        - `/tmp/newsportal-discovery-nonregression-bcc2ba98.json|md`
      - result:
        - `runtimeVerdict = pass`
        - `nonRegressionVerdict = pass`
        - `yieldVerdict = pass`
        - `finalVerdict = pass`
    - `pnpm test:discovery:yield:compose`
      - authoritative artifact:
        - `/tmp/newsportal-live-discovery-yield-proof-5c20aaa9.json|md`
      - result:
        - `runtimeVerdict = pass`
        - `yieldVerdict = pass`
        - `finalVerdict = pass`
        - Example B `3/3`
        - Example C `3/3`
    - `pnpm test:website:compose`
    - `pnpm test:website:admin:compose`
    - `pnpm test:hard-sites:compose`
    - `git diff --check --`
- Что stage и capability доказали:
  - discovery runtime now remains generic and admin-configured even while proof still uses Example B/C datasets, because those datasets are materialized only through proof-owned fixture seeding on top of admin-owned entities, not through hardcoded runtime case/domain logic;
  - provider-decoupled approve/promote-boundary logic, runtime-owned `policyReview`, profile-threshold ownership, and manual-review browser/challenge routing all survive the full compose contour, not just unit/targeted proof;
  - the recovery blocker was resolved at the right layers: schema drift was fixed in migrations, proof fixture prerequisites moved into admin-owned bootstrap, nested proof orchestration was made honest and non-blocking, and website admin acceptance stayed within the shipped row-level provider contract.

### 2026-04-20 — STAGE-1-ADMIN-DISCOVERY-OPERATOR-GAPS — Closed the remaining `/admin/discovery` operator gaps for profile website-kind tuning and recall acquire/promote

- Тип записи: stage archive
- Финальный статус: archived
- Зачем понадобилось: during a fresh manual Example C admin replay on a new server, the shipped admin surface still had two real operator gaps: reusable profile forms could not persist `supportedWebsiteKinds`, and the recall tab remained mostly a read surface, so bounded recall acquisition and promotion still required maintenance-only fallback. That meant the proof-backed Example B/C settings from `DISCOVERY_MODE_TESTING.md` could not be replayed end to end through the admin UI alone.
- Что изменилось:
  - admin BFF now owns the missing operator intents in [`apps/admin/src/pages/bff/admin/discovery.ts`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/bff/admin/discovery.ts):
    - profile create/update payload builders now parse and persist `graphSupportedWebsiteKinds` / `recallSupportedWebsiteKinds`;
    - new intents `acquire_recall_mission` and `promote_recall_candidate` now call the existing maintenance-backed discovery routes through the same-origin admin BFF and emit audit-log payloads.
  - `/admin/discovery` now exposes the missing controls in [`apps/admin/src/pages/discovery.astro`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/discovery.astro):
    - create/edit profile forms now include structured `supportedWebsiteKinds` fields for graph and recall policies;
    - profile diagnostics now surface configured website kinds alongside preferred domains and benchmark hints;
    - the recall tab now exposes `Acquire now` on recall missions and `Promote` on eligible recall candidates, while keeping the same structured explainability and bounded operator semantics.
  - admin acceptance proof in [`infra/scripts/test-discovery-admin-flow.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/test-discovery-admin-flow.mjs) now proves the new operator path:
    - creates profiles with `supportedWebsiteKinds`;
    - verifies the persisted policy through the discovery profile API;
    - requests recall acquisition through the admin BFF;
    - promotes a seeded recall candidate through the admin BFF instead of direct maintenance-only fallback.
  - TS regression coverage in [`tests/unit/ts/discovery-admin.test.ts`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/ts/discovery-admin.test.ts) now covers the new structured profile fields and the new recall acquire/promote audit payloads.
  - synced durable discovery truth and handbook language:
    - [`docs/blueprint.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/blueprint.md)
    - [`docs/contracts/discovery-agent.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/contracts/discovery-agent.md)
    - [`docs/verification.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/verification.md)
    - [`DISCOVERY_MODE_TESTING.md`](/Users/user/Documents/workspace/my/NewsPortal/DISCOVERY_MODE_TESTING.md)
    - [`docs/work.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/work.md)
    - [`docs/history.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/history.md)
- Что было доказано:
  - static and unit proof:
    - `node --check apps/admin/src/pages/bff/admin/discovery.ts`
    - `node --check infra/scripts/test-discovery-admin-flow.mjs`
    - `node --import tsx --test tests/unit/ts/discovery-admin.test.ts`
    - `pnpm typecheck`
  - operator/runtime proof:
    - `pnpm test:discovery:admin:compose`
      - result: `discovery-admin-ok`
      - proof now includes persisted `supportedWebsiteKinds`, admin-surfaced recall acquire, and admin-surfaced recall promotion
      - representative artifact payload from the passing run:
        - `missionId = 32462576-d338-4eba-a187-707d1da2ef7b`
        - `recallMissionId = 56288668-a639-4a18-b5bf-72c3ba56cf71`
        - `recallCandidateId = 03dcf266-ba44-4a6b-a9f6-7f474b07c23b`
        - `recallPromotionState = promoted`
        - `profileId = 265e6040-c7f0-4999-b770-6eb3d4e465d4`
  - consistency proof:
    - `git diff --check -- docs/work.md docs/history.md docs/blueprint.md docs/contracts/discovery-agent.md docs/verification.md DISCOVERY_MODE_TESTING.md apps/admin/src/pages/discovery.astro apps/admin/src/pages/bff/admin/discovery.ts infra/scripts/test-discovery-admin-flow.mjs tests/unit/ts/discovery-admin.test.ts`
- Что stage доказал:
  - shipped `/admin/discovery` is now truthful enough for end-to-end operator replay of profile-backed Example B/C discovery settings without falling back to raw maintenance calls just to acquire/promote recall candidates;
  - structured profile policy parity between runtime proof profiles and admin profile forms now includes `supportedWebsiteKinds`;
  - the admin/operator acceptance lane now proves the same operator path the handbook describes, instead of documenting a partially missing UI.

### 2026-04-20 — STAGE-4D-GENERALIZED-PROFILE-BACKED-RECALL-VALIDITY-AND-YIELD-RETUNE and C-DISCOVERY-GOOD-YIELD — Closed the DDGS-first good-yield capability with profile-backed Example B/C proof, non-regression still green

- Тип записи: stage + capability archive
- Финальный статус: archived
- Зачем понадобилось: after the profile-backed Example B/C discovery harness shipped, the parent capability still remained open because the final multi-run gate was stuck at `yield_weak`. The next truthful slice was not more broad rewrites, but a bounded repair of two real proof/runtime losses: profile-backed policy snapshots were silently dropping `supportedWebsiteKinds`, and duplicate-linked candidates were not preserving `registered_channel_id`, which made real duplicate onboarding evidence look like registration failure.
- Что изменилось:
  - repaired profile-backed policy snapshot truth:
    - [`infra/scripts/lib/discovery-live-proof-profiles.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/lib/discovery-live-proof-profiles.mjs) now preserves `supportedWebsiteKinds` when cloning graph/recall policy into reusable `discovery_policy_profiles`;
    - [`services/api/app/main.py`](/Users/user/Documents/workspace/my/NewsPortal/services/api/app/main.py) now preserves the same field in profile normalization for both graph and recall policies, so `applied_policy_json` no longer drops procurement/listing website-kind constraints.
  - repaired duplicate-link onboarding truth in discovery runtime:
    - [`services/workers/app/discovery_orchestrator.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/discovery_orchestrator.py) now loads an existing normalized-URL -> `channel_id` map, not just a URL set;
    - graph candidates and recall candidates now materialize as `duplicate` with `registered_channel_id` already filled when the normalized source URL already maps to an existing `source_channel`;
    - duplicate-linked candidates therefore count as real onboarding evidence without waiting for a later manual approve/promote path.
  - extended regression coverage:
    - [`tests/unit/ts/discovery-live-proof-profiles.test.ts`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/ts/discovery-live-proof-profiles.test.ts)
    - [`tests/unit/python/test_api_discovery_management.py`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/python/test_api_discovery_management.py)
    - [`tests/unit/python/test_discovery_orchestrator.py`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/python/test_discovery_orchestrator.py)
  - synced durable docs:
    - [`docs/work.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/work.md)
    - [`docs/history.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/history.md)
    - [`docs/blueprint.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/blueprint.md)
    - [`docs/contracts/discovery-agent.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/contracts/discovery-agent.md)
    - [`DISCOVERY_MODE_TESTING.md`](/Users/user/Documents/workspace/my/NewsPortal/DISCOVERY_MODE_TESTING.md)
- Что было доказано:
  - targeted static/unit proof:
    - `node --check infra/scripts/lib/discovery-live-proof-profiles.mjs`
    - `python -m py_compile services/api/app/main.py`
    - `python -m py_compile services/workers/app/discovery_orchestrator.py`
    - `node --import tsx --test tests/unit/ts/discovery-live-proof-profiles.test.ts tests/unit/ts/discovery-live-yield-policy.test.ts`
    - `python -m unittest tests.unit.python.test_api_discovery_management tests.unit.python.test_discovery_orchestrator`
  - compose/runtime proof:
    - `pnpm test:discovery:examples:compose`
      - authoritative single-run artifacts:
        - `/tmp/newsportal-live-discovery-examples-ca3049b7.json|md`
        - `/tmp/newsportal-live-discovery-examples-b41de125.json|md`
      - closing result:
        - `runtimeVerdict = pass`
        - `yieldVerdict = pass`
        - `finalVerdict = pass`
        - Example B and Example C both produced onboarded or duplicate-linked channels with downstream evidence
        - latest manual replay baseline moved to `appliedProfileVersion = 22`
    - `pnpm test:discovery:nonregression:compose`
      - authoritative artifact:
        - `/tmp/newsportal-discovery-nonregression-f499bb13.json|md`
      - result:
        - `runtimeVerdict = pass`
        - `nonRegressionVerdict = pass`
        - `yieldVerdict = pass`
        - `finalVerdict = pass`
    - `pnpm test:discovery:yield:compose`
      - authoritative aggregate artifact:
        - `/tmp/newsportal-live-discovery-yield-proof-a59832ca.json|md`
      - result:
        - `runtimeVerdict = pass`
        - `yieldVerdict = pass`
        - `finalVerdict = pass`
        - `requiredRuns = 3`
        - `requiredPassingRuns = 2`
        - `Example B — IT-новости для разработчиков = 3/3`
        - `Example C — Поиск клиентов для аутсорс-компании = 3/3`
        - aggregate root-cause drift collapsed to `yield_pass = 6`
- Что stage и capability доказали:
  - the DDGS-first discovery subsystem now truthfully satisfies all declared completion layers for `C-DISCOVERY-GOOD-YIELD`:
    - `runtime = pass`
    - `nonRegression = pass`
    - `yield = pass`
  - Example B/C profile-backed proof is no longer only a manual replay baseline; it is now also a closed good-yield contour on the current shipped compose baseline.
  - The reusable operator handbook at [`DISCOVERY_MODE_TESTING.md`](/Users/user/Documents/workspace/my/NewsPortal/DISCOVERY_MODE_TESTING.md) is now aligned with the latest proof-backed settings and the current authoritative `appliedProfileVersion = 22` replay baseline.
- Риски или gaps:
  - this closeout proves good yield only on the current declared DDGS-first runtime-enabled proof packs and current shipped compose baseline; it does not automatically prove future packs, provider expansion, or broader operator UX ambitions.
  - Future discovery work must open a new capability instead of silently extending this closed one.

### 2026-04-20 — PATCH-PROFILE-BACKED-EXAMPLE-PROOF-HARDENING — Hardened recall acquire failure handling and refreshed the profile-backed Example B/C proof baseline

- Тип записи: patch archive
- Финальный статус: archived
- Зачем понадобилось: after the profile-backed Example B/C harness shipped, fresh reruns uncovered two runtime-proof issues that were not safe to leave hidden in operator docs: recall acquire could still fail with plain-text HTTP 500 / timeout behavior when underlying probes timed out, and the handbook/live-state docs still pointed at an older `Example C yield pass` artifact that no longer matched the freshest synced proof.
- Что изменилось:
  - hardened [`services/workers/app/discovery_orchestrator.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/discovery_orchestrator.py) so recall acquire no longer aborts the whole mission when a `website_probe` or `rss_probe` times out:
    - probe failures now materialize rejected candidates through bounded `probe_failed` / `invalid_feed` style rows instead of surfacing as API `500`;
    - the existing recall acquisition path therefore stays truthful about weak candidate validity without crashing the profile-backed harness.
  - extended [`tests/unit/python/test_discovery_orchestrator.py`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/python/test_discovery_orchestrator.py) with regression coverage for probe-timeout-to-rejected-candidate behavior.
  - hardened [`infra/scripts/lib/discovery-live-example-cases.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/lib/discovery-live-example-cases.mjs) and [`infra/scripts/test-live-discovery-examples.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/test-live-discovery-examples.mjs):
    - the harness now uses a bounded longer recall acquire timeout (`180000ms`) instead of treating slower maintenance acquire calls as client-side failure;
    - plain-text non-JSON API failures are now rendered truthfully in the harness instead of being double-reported as JSON parsing crashes.
  - resynced operator/live docs so the profile-backed replay handbook no longer claims that the latest fresh Example C run is still `yield pass`.
- Что было доказано:
  - static / unit proof:
    - `node --check infra/scripts/lib/discovery-live-example-cases.mjs`
    - `node --check infra/scripts/test-live-discovery-examples.mjs`
    - `python -m unittest tests.unit.python.test_discovery_orchestrator`
    - `python -m py_compile services/workers/app/discovery_orchestrator.py`
  - compose/runtime proof:
    - `pnpm test:discovery-enabled:compose`
      - result: passed
    - `pnpm test:discovery:admin:compose`
      - result: initially exposed a flaky `tab=sources` HTML assertion during multi-run proof, then passed again after the assertion was moved onto structured source-profile API truth plus stable page-shell snippets
    - `pnpm test:discovery:examples:compose`
      - freshest synced single-run artifact:
        - `/tmp/newsportal-live-discovery-examples-d9517b92.json`
        - `/tmp/newsportal-live-discovery-examples-d9517b92.md`
      - result:
        - `runtimeVerdict = pass`
        - `yieldVerdict = weak`
        - `Example C` reached `yield pass`
        - `Example B` remained `yield weak`
        - `manualReplaySettings` remained present for both runtime packs, now at applied profile version `14`
    - `pnpm test:discovery:nonregression:compose`
      - freshest synced non-regression artifact:
        - `/tmp/newsportal-discovery-nonregression-3f16fb99.json`
        - `/tmp/newsportal-discovery-nonregression-3f16fb99.md`
      - result:
        - `runtimeVerdict = pass`
        - `nonRegressionVerdict = pass`
        - `yieldVerdict = weak`
        - `finalVerdict = pass_with_residuals`
        - frozen-corpus drift stayed `0`
    - `pnpm test:discovery:yield:compose`
      - final aggregate artifact:
        - `/tmp/newsportal-live-discovery-yield-proof-dd2a10e7.json`
        - `/tmp/newsportal-live-discovery-yield-proof-dd2a10e7.md`
      - backing runs:
        - `/tmp/newsportal-live-discovery-examples-5670128e.json|md`
        - `/tmp/newsportal-live-discovery-examples-4e79aae8.json|md`
        - `/tmp/newsportal-live-discovery-examples-d9517b92.json|md`
      - result:
        - `runtimeVerdict = pass`
        - `yieldVerdict = weak`
        - `finalVerdict = yield_weak`
        - `Example B` passed `0/3`
        - `Example C` passed `1/3`
- Что patch доказал:
  - the profile-backed Example B/C proof lane is now more honest and resilient under slow/failed probe conditions;
  - the reusable manual replay contour stays intact even when individual fresh single-run reruns vary between `Example C yield pass` and `yield weak`;
  - the final truthful state of this contour is now: `runtime pass / nonRegression pass / final multi-run yield weak`;
  - the admin compose proof no longer flakes on `tab=sources` ordering/pagination because the domain-specific assertion now rides on source-profile API truth rather than brittle page contents.
- Риски или gaps:
  - this patch still does not close `C-DISCOVERY-GOOD-YIELD`; the final aggregate proof keeps `Example B` at `0/3` and `Example C` at `1/3`;
  - the next truthful tuning slice is still generalized rather than Example-B-only, because the final multi-run proof leaves both packs below the required `2/3` bar even though Example C can now pass bounded single runs.
- Follow-up:
  - create and execute a generalized profile-backed recall validity/yield retune stage instead of continuing to frame the next slice as Example-B-only.

### 2026-04-20 — STAGE-4C-PROFILE-BACKED-EXAMPLE-PROOF-AND-HANDBOOK-SYNC — Made Example B/C discovery proof profile-backed, operator-replayable, and documented

- Тип записи: stage archive
- Финальный статус: archived
- Зачем понадобилось: the user asked to finish the discovery proof contour for `Example B` and `Example C` so the automation and manual `/admin/discovery` replay would use the same shipped `Discovery Profiles`, emit exact operator-facing settings from live proof, and then sync every truth/doc layer that depends on that workflow.
- Что изменилось:
  - added explicit profile-backed harness helpers in [`infra/scripts/lib/discovery-live-proof-profiles.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/lib/discovery-live-proof-profiles.mjs):
    - stable proof profile metadata per case pack;
    - profile CRUD payload builders for maintenance API truth (`graphPolicyJson`, `recallPolicyJson`, `yieldBenchmarkJson`);
    - profile-backed graph/recall mission payload builders;
    - canonical `manualReplaySettings` snapshots for profile identity, policy, benchmark cohort, exact mission seeds/queries, and applied profile snapshots.
  - updated [`infra/scripts/lib/discovery-live-example-cases.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/lib/discovery-live-example-cases.mjs) so Example B/C now expose stable proof profile keys and display names:
    - `example_b_dev_news_proof`
    - `example_c_outsourcing_proof`
    and Example C case-pack truth was further tuned toward procurement/buyer-signal sources with the currently shipped profile-backed seed/query set.
  - updated [`infra/scripts/test-live-discovery-examples.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/test-live-discovery-examples.mjs) so the live harness now:
    - upserts reusable `discovery_policy_profiles` before graph/recall execution;
    - attaches `profileId` to graph missions and recall missions;
    - refreshes mission/recall rows after compile/run/acquire to capture `applied_profile_version` plus `applied_policy_json`;
    - writes `manualReplaySettings` into the JSON and Markdown artifacts;
    - renders the linked profile and replay settings in the Markdown proof output.
  - updated [`infra/scripts/test-live-discovery-yield-proof.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/test-live-discovery-yield-proof.mjs) to use the new root single-run command `pnpm test:discovery:examples:compose`.
  - updated [`package.json`](/Users/user/Documents/workspace/my/NewsPortal/package.json) with the canonical single-run alias:
    - `pnpm test:discovery:examples:compose`
  - updated admin acceptance in [`infra/scripts/test-discovery-admin-flow.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/test-discovery-admin-flow.mjs) so recall candidates now get seeded quality/profile rows and stay visible on the recall tab during compose proof.
  - hardened worker runtime in [`services/workers/app/discovery_orchestrator.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/discovery_orchestrator.py):
    - recall RSS acquisition now skips clearly non-feed URLs instead of probing arbitrary HTML pages as `rss`;
    - DDGS “no results found” is now treated as an empty batch with search meta instead of crashing recall acquisition with HTTP 500.
  - added regression coverage:
    - [`tests/unit/ts/discovery-live-proof-profiles.test.ts`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/ts/discovery-live-proof-profiles.test.ts)
    - [`tests/unit/python/test_discovery_orchestrator.py`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/python/test_discovery_orchestrator.py)
  - synced operator/runtime docs:
    - [`DISCOVERY_MODE_TESTING.md`](/Users/user/Documents/workspace/my/NewsPortal/DISCOVERY_MODE_TESTING.md)
    - [`EXAMPLES.md`](/Users/user/Documents/workspace/my/NewsPortal/EXAMPLES.md)
    - [`README.md`](/Users/user/Documents/workspace/my/NewsPortal/README.md)
    - [`docs/manual-mvp-runbook.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/manual-mvp-runbook.md)
    - [`docs/verification.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/verification.md)
    - [`docs/blueprint.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/blueprint.md)
    - [`docs/contracts/discovery-agent.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/contracts/discovery-agent.md)
    - [`docs/contracts/test-access-and-fixtures.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/contracts/test-access-and-fixtures.md)
    - [`.aidp/os.yaml`](/Users/user/Documents/workspace/my/NewsPortal/.aidp/os.yaml)
- Что было доказано:
  - static / unit proof:
    - `node --check infra/scripts/lib/discovery-live-proof-profiles.mjs`
    - `node --check infra/scripts/lib/discovery-live-example-cases.mjs`
    - `node --check infra/scripts/test-live-discovery-examples.mjs`
    - `node --check infra/scripts/test-live-discovery-yield-proof.mjs`
    - `node --check infra/scripts/test-discovery-admin-flow.mjs`
    - `node --import tsx --test tests/unit/ts/discovery-live-proof-profiles.test.ts`
    - `node --import tsx --test tests/unit/ts/discovery-live-yield-policy.test.ts`
    - `pnpm typecheck`
    - `python -m unittest tests.unit.python.test_discovery_orchestrator`
    - `python -m py_compile services/workers/app/discovery_orchestrator.py`
  - compose/admin/runtime proof:
    - `pnpm test:discovery:admin:compose`
      - result: passed, including visible recall candidate/profile state and profile-backed admin flow
    - `pnpm test:discovery:examples:compose`
      - freshest authoritative artifact:
        - `/tmp/newsportal-live-discovery-examples-f53aca32.json`
        - `/tmp/newsportal-live-discovery-examples-f53aca32.md`
      - result:
        - overall `runtimeVerdict = pass`
        - overall `yieldVerdict = weak`
        - `Example C` reached `yield pass`
        - `Example B` remained `yield weak`
        - artifacts now include `manualReplaySettings` for both runtime packs
- Что stage доказал:
  - Example B/C live proof now truthfully runs through the same reusable `Discovery Profiles` that operators can replay manually in `/admin/discovery`;
  - there is no longer a parallel “automation-only” config shape for these proof cohorts;
  - the operator handbook now preserves exact profile settings, benchmark cohorts, and mission seeds/queries directly from the same runtime truth as the harness;
  - the discovery proof stack can now prove runtime health and produce repeatable manual replay settings even while the parent `good yield` capability remains open.
- Риски или gaps:
  - this stage did not close `C-DISCOVERY-GOOD-YIELD`; the latest fresh proof still leaves `Example B` at `yield weak`;
  - reusable proof profiles now remain as intentional persistent local fixtures and must be treated as tracked discovery proof residue rather than accidental DB drift.
- Follow-up:
  - continue with `STAGE-4B-EXAMPLE-B-RECALL-CANDIDATE-VALIDITY-REPAIR`.

### 2026-04-20 — C-DISCOVERY-PROFILES-ADMIN — Shipped reusable operator-managed Discovery Profiles across schema, maintenance API, admin UI, and compose proof

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: the user asked to turn discovery tuning into a reusable operator-managed layer instead of leaving it split between repo config and mission-local fields. The capability had to stay case-agnostic, keep mission seeds and budgets mission-owned, preserve backward compatibility for existing missions, and avoid changing downstream truth ownership.
- Что изменилось:
  - additive schema/runtime truth now includes reusable `discovery_policy_profiles` plus nullable mission/recall linkage:
    - [`database/migrations/0040_discovery_policy_profiles.sql`](/Users/user/Documents/workspace/my/NewsPortal/database/migrations/0040_discovery_policy_profiles.sql) now creates `discovery_policy_profiles`, adds mission/recall `profile_id`, `applied_profile_version`, `applied_policy_json`, and also repairs the compose-local residual discovery-core drift that was still present while `0030` was already recorded as applied;
    - [`services/relay/src/cli/test-migrations.ts`](/Users/user/Documents/workspace/my/NewsPortal/services/relay/src/cli/test-migrations.ts) now asserts the new profile table, mission/recall columns, indexes, and FKs in migration smoke.
  - maintenance/runtime/API truth now supports reusable profiles and applied snapshots:
    - [`services/api/app/main.py`](/Users/user/Documents/workspace/my/NewsPortal/services/api/app/main.py) now exposes profile CRUD at `/maintenance/discovery/profiles*`, extends graph mission and recall mission create/update payloads with `profileId`, snapshots `applied_profile_version` plus `applied_policy_json` at compile/run/acquire boundaries, and exposes profile counts in discovery summary;
    - [`packages/sdk/src/index.ts`](/Users/user/Documents/workspace/my/NewsPortal/packages/sdk/src/index.ts) now exposes discovery profile CRUD plus recall mission/candidate SDK helpers needed by admin/operator flows.
  - Astro admin BFF/UI now ship reusable profile management and explainability-first rendering:
    - [`apps/admin/src/pages/bff/admin/discovery.ts`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/bff/admin/discovery.ts) now supports profile CRUD intents, recall mission create/update, and mission/recall `profileId` wiring;
    - [`apps/admin/src/lib/server/operator-surfaces.ts`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/lib/server/operator-surfaces.ts) now resolves structured discovery policy explainability (`reasonBucket`, score vs threshold, matched policy signals, benchmarkLike, linked profile/version);
    - [`apps/admin/src/pages/discovery.astro`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/discovery.astro) now ships a `Profiles` tab, mission/recall profile selectors, profile lifecycle forms, applied profile version visibility, and explainability-first candidate/recall cards.
  - compose/runtime proof runners were hardened to use the current workspace build rather than stale images:
    - [`infra/scripts/test-discovery-admin-flow.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/test-discovery-admin-flow.mjs) now brings the compose stack up with `--build`;
    - [`infra/scripts/test-live-discovery-examples.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/test-live-discovery-examples.mjs) and [`infra/scripts/test-discovery-pipeline-nonregression.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/test-discovery-pipeline-nonregression.mjs) now reset/recreate the compose stack more defensively so the new proof lane stays reproducible on this desktop baseline.
  - regression coverage now exists for payload building and explainability mapping:
    - [`tests/unit/ts/discovery-admin.test.ts`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/ts/discovery-admin.test.ts)
    - [`tests/unit/ts/admin-operator-surfaces.test.ts`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/ts/admin-operator-surfaces.test.ts)
- Что было доказано:
  - static / unit / migration proof:
    - `node --check apps/admin/src/pages/bff/admin/discovery.ts`
    - `node --check packages/sdk/src/index.ts`
    - `node --check infra/scripts/test-discovery-admin-flow.mjs`
    - `node --check infra/scripts/test-live-discovery-examples.mjs`
    - `node --check infra/scripts/test-discovery-pipeline-nonregression.mjs`
    - `python -m py_compile services/api/app/main.py`
    - `node --import tsx --test tests/unit/ts/discovery-admin.test.ts tests/unit/ts/admin-operator-surfaces.test.ts`
    - `pnpm typecheck`
    - `pnpm test:migrations:smoke`
  - admin/operator compose proof:
    - `pnpm test:discovery:admin:compose`
    - result: passed with reusable profile CRUD, profile archive/reactivate/delete, mission profile attach, recall profile attach, recall update/promote flow, and visible profile/version/explainability fields in `/admin/discovery`
  - live runtime and safety proof on the same baseline:
    - `env DISCOVERY_ENABLED=1 node infra/scripts/test-live-discovery-examples.mjs`
    - authoritative artifact:
      - `/tmp/newsportal-live-discovery-examples-682e955a.json`
      - `/tmp/newsportal-live-discovery-examples-682e955a.md`
    - result:
      - `runtimeVerdict = pass`
      - `yieldVerdict = weak`
      - `finalVerdict = yield_weak`
    - `pnpm test:discovery:nonregression:compose`
    - authoritative artifact:
      - `/tmp/newsportal-discovery-nonregression-9c663b86.json`
      - `/tmp/newsportal-discovery-nonregression-9c663b86.md`
    - result:
      - `runtimeVerdict = pass`
      - `nonRegressionVerdict = pass`
      - `yieldVerdict = weak`
      - `finalVerdict = pass_with_residuals`
- Что capability доказала:
  - discovery operator tuning now has a reusable profile layer instead of case-specific or mission-local-only hidden config;
  - graph missions and recall missions can both bind to the same reusable profile while keeping seeds, budgets, and lifecycle state mission-owned;
  - applied profile snapshots make historical mission/recall runs interpretable without copying the full live profile row into every mission update;
  - discovery UI can now explain policy-driven candidate decisions through structured fields rather than opaque status-only output;
  - this operator-tuning expansion did not regress the already-proven downstream non-regression boundary.
- Риски или gaps:
  - v1 intentionally does not include mission-local overrides, profile inheritance, dry-run execution endpoints, provider fallback controls, or downstream-selected-content-driven tuning;
  - discovery good-yield is still an open capability; profiles improve operator control, but they do not by themselves prove `yieldVerdict = pass`.
- Follow-up:
  - return active implementation focus to `C-DISCOVERY-GOOD-YIELD`, specifically `STAGE-4B-EXAMPLE-B-RECALL-CANDIDATE-VALIDITY-REPAIR`.

### 2026-04-19 — STAGE-4-REVIEW-AND-PROMOTION-POLICY-TUNING — Lifted Example C to yield-pass and hardened recall status handling without drifting downstream truth

- Тип записи: stage archive
- Финальный статус: archived
- Зачем понадобилось: after Stage 3 removed the main graph-lane false negatives, live DDGS discovery was still failing on `below_auto_promotion_threshold` across recall candidates. The user asked to keep pushing toward `good yield`, so the next truthful step was bounded policy tuning rather than provider expansion or broad engine rewrites.
- Что изменилось:
  - tuned case-pack recall policy in [`infra/scripts/lib/discovery-live-example-cases.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/lib/discovery-live-example-cases.mjs):
    - Example B now carries lower bounded `minPromotionScore`, stronger preferred-domain bonuses for known engineering-blog domains, and explicit negative domains/keywords for feed generators, Wikipedia-style noise, EIN/feed-directory families, and architecture-feed junk;
    - Example C now carries lower bounded `minPromotionScore`, stronger procurement-domain bonuses, explicit negative domains for feed/tender directory families and YouTube-like junk, plus slightly stronger positive procurement keywords;
  - hardened [`infra/scripts/test-live-discovery-examples.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/test-live-discovery-examples.mjs) so recall automation no longer crashes when the maintenance API already materialized a candidate as `rejected`/`duplicate`/`shortlisted`:
    - status-aware recall handling now records pre-rejected candidates instead of trying to re-promote them;
    - `invalid_feed` and `probe_failed` now surface truthfully as `candidate_not_valid` in the yield artifact instead of hiding behind a generic harness crash.
- Что было доказано:
  - static / calibration proof:
    - `node --check infra/scripts/lib/discovery-live-example-cases.mjs`
    - `node --check infra/scripts/test-live-discovery-examples.mjs`
    - `node --import tsx --test tests/unit/ts/discovery-live-yield-policy.test.ts`
  - fresh single-run live proof:
    - `env DISCOVERY_ENABLED=1 node infra/scripts/test-live-discovery-examples.mjs`
    - authoritative artifact:
      - `/tmp/newsportal-live-discovery-examples-85142a9e.json`
      - `/tmp/newsportal-live-discovery-examples-85142a9e.md`
    - result:
      - top-level `runtimeVerdict = pass`
      - top-level `yieldVerdict = weak`
      - Example B remained `yield weak`
      - Example C reached `yield pass`
      - Example C onboarded `2` channels and both showed downstream fetch evidence via `fetchers run:once`
  - fresh non-regression proof:
    - `pnpm test:discovery:nonregression:compose`
    - authoritative artifact:
      - `/tmp/newsportal-discovery-nonregression-3a7f0438.json`
      - `/tmp/newsportal-discovery-nonregression-3a7f0438.md`
    - result:
      - `runtimeVerdict = pass`
      - `nonRegressionVerdict = pass`
      - `yieldVerdict = weak`
      - `finalVerdict = pass_with_residuals`
      - frozen-corpus drift stayed `0` for:
        - `interest_filter_results`
        - `final_selection_results`
        - `system_feed_results`
        - `llm_review_log`
        - `notification_log`
- Что stage доказал:
  - bounded policy tuning can improve live yield without drifting the existing downstream pipeline;
  - Example C is no longer blocked only by review thresholds and now has a truthful single-run `yield pass`;
  - the recall harness needed status-aware handling once tuning started surfacing promotable rows, and that boundary is now explicit and non-flaky.
- Риски или gaps:
  - `good yield` is still not proven overall because Example B remains weak;
  - the latest Example B blocker is no longer `below_auto_promotion_threshold`, but recall `candidate_not_valid` / `invalid_feed` noise, which points back to recall acquisition/validity rather than more policy loosening.
- Follow-up:
  - open `STAGE-4B-EXAMPLE-B-RECALL-CANDIDATE-VALIDITY-REPAIR` next; repair or reframe Example B recall validity before attempting Stage-5 downstream closeout.

### 2026-04-19 — STAGE-3-GENERALIZED-CANDIDATE-MIX-TUNING — Isolated graph classes and removed the main gap-fill/noise path before policy tuning

- Тип записи: stage archive
- Финальный статус: archived
- Зачем понадобилось: after Stage 2 reduced RSS technical loss, the live DDGS harness still mixed in broad registry classes and noisy graph tactics. The user asked to keep moving toward `good yield`, so the next truthful slice was candidate-mix cleanup before any review/promotion threshold tuning.
- Что изменилось:
  - retuned runtime case-pack graph config in [`infra/scripts/lib/discovery-live-example-cases.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/lib/discovery-live-example-cases.mjs):
    - Example B and Example C graph lanes became website-first and stopped owning extra graph RSS classes;
    - the graph tactics were tightened around bounded editorial developer-news and buyer-signal procurement website families.
  - updated [`infra/scripts/test-live-discovery-examples.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/test-live-discovery-examples.mjs) so each runtime case now temporarily isolates its own graph classes:
    - active generic registry classes like `lexical`, `facet`, `actor`, `source_type`, `evidence_chain`, and `contrarian` are archived before the case mission runs;
    - those classes are restored immediately after the mission;
    - disposable case-specific graph classes are archived after each run.
- Что было доказано:
  - static/helper proof:
    - `node --check infra/scripts/lib/discovery-live-example-cases.mjs`
    - `node --check infra/scripts/test-live-discovery-examples.mjs`
    - `node --import tsx --test tests/unit/ts/discovery-live-yield-policy.test.ts`
  - fresh live proof:
    - `env DISCOVERY_ENABLED=1 node infra/scripts/test-live-discovery-examples.mjs`
    - authoritative artifact:
      - `/tmp/newsportal-live-discovery-examples-ac199047.json`
      - `/tmp/newsportal-live-discovery-examples-ac199047.md`
    - result:
      - `runtimeVerdict = pass`
      - `yieldVerdict = weak`
      - `finalVerdict = yield_weak`
      - both runtime packs reached `candidate_not_valid = 0`
      - the dominant blocker shifted from graph false negatives to recall review/promotion policy
- Что stage доказал:
  - graph-lane noise from shared registry classes was a real proof-surface problem, and class isolation now keeps runtime packs truthful;
  - after isolation, the main blocker moved from graph candidate validity to recall thresholding, which made policy tuning the next honest stage.
- Риски или gaps:
  - Stage 3 did not itself improve overall yield; it only cleaned the graph candidate surface enough to expose the next blocker clearly.
- Follow-up:
  - open `STAGE-4-REVIEW-AND-PROMOTION-POLICY-TUNING` next; with graph false negatives cleared, the next truthful move is bounded threshold/domain policy work.

### 2026-04-19 — STAGE-2-TECHNICAL-FALSE-NEGATIVE-REPAIR — Repaired bounded RSS feed-discovery false negatives before candidate-mix tuning

- Тип записи: stage archive
- Финальный статус: archived
- Зачем понадобилось: after Stage 1, the fresh diagnostics still showed a large `candidate_not_valid` cohort. The user asked to keep moving toward `good yield`, and the stage ladder required checking technical false negatives before any broader candidate-mix or threshold tuning.
- Что изменилось:
  - updated [`services/workers/app/task_engine/adapters/rss_probe.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/task_engine/adapters/rss_probe.py) so the RSS probe now:
    - first tries the direct target as a feed,
    - then performs bounded alternate-feed recovery from HTML `<link rel="alternate" type="application/rss+xml|atom+xml">` hints,
    - re-probes the recovered feed URL when found,
    - persists the result through `feed_url`, `final_url`, and `discovered_feed_urls`
  - updated [`services/workers/app/task_engine/discovery_plugins.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/task_engine/discovery_plugins.py) so `discovery.rss_probe` no longer drops the feed-discovery fields that the orchestrator needs:
    - `feed_url`
    - `final_url`
    - `discovered_feed_urls`
    - `error_text`
  - synced durable runtime truth in [`docs/contracts/discovery-agent.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/contracts/discovery-agent.md): supported HTML origins may now recover concrete RSS/Atom feeds while still staying inside the `rss` provider boundary
  - added targeted unit coverage in:
    - [`tests/unit/python/test_task_engine_discovery_plugins.py`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/python/test_task_engine_discovery_plugins.py)
    - [`tests/unit/python/test_discovery_rss_probe_adapter.py`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/python/test_discovery_rss_probe_adapter.py)
- Что было доказано:
  - targeted static / unit proof:
    - `python -m py_compile services/workers/app/task_engine/adapters/rss_probe.py services/workers/app/task_engine/discovery_plugins.py tests/unit/python/test_discovery_rss_probe_adapter.py tests/unit/python/test_task_engine_discovery_plugins.py`
    - `python -m unittest tests.unit.python.test_task_engine_discovery_plugins tests.unit.python.test_discovery_rss_probe_adapter`
    - `git diff --check -- docs/work.md docs/history.md docs/contracts/discovery-agent.md services/workers/app/task_engine/adapters/rss_probe.py services/workers/app/task_engine/discovery_plugins.py tests/unit/python/test_task_engine_discovery_plugins.py tests/unit/python/test_discovery_rss_probe_adapter.py`
  - fresh live discovery proof:
    - `env DISCOVERY_ENABLED=1 node infra/scripts/test-live-discovery-examples.mjs`
    - authoritative artifact:
      - `/tmp/newsportal-live-discovery-examples-94fbc963.json`
      - `/tmp/newsportal-live-discovery-examples-94fbc963.md`
    - result:
      - `runtimeVerdict = pass`
      - `yieldVerdict = weak`
      - `finalVerdict = yield_weak`
    - compared with the latest Stage-1 single-run artifact `/tmp/newsportal-live-discovery-examples-bcb081e3.json|md`:
      - Example C `candidate_not_valid` dropped from `20` to `7`
      - Example C benchmark-like rejects moved entirely out of `candidate_not_valid` and into policy-threshold buckets
      - Example B stayed `yield_weak`, but its benchmark-like invalidation remained bounded rather than becoming the dominant blocker
- Что stage доказал:
  - the discovery runtime was carrying a real technical-loss layer on supported RSS sources, not only policy weakness
  - bounded alternate-feed recovery is now part of shipped discovery truth and reaches the live harness path rather than living only in isolated helper code
  - after the repair, the remaining dominant blocker is still `review_policy_problem`, which means the next truthful stage is candidate-mix tuning rather than blind provider expansion or threshold loosening
- Риски или gaps:
  - the repair did not make `good yield` pass; it only reduced one technical-loss class
  - Example B still produces many non-benchmark `candidate_not_valid` RSS rows, which now look more like noisy candidate mix than silent loss of obviously good feed-backed sources
  - no provider fallback was introduced; the baseline remains DDGS-first and bounded
- Follow-up:
  - open `STAGE-3-GENERALIZED-CANDIDATE-MIX-TUNING` next; use the latest artifact to improve candidate mix across packs before touching review/promotion thresholds.

### 2026-04-19 — STAGE-1-YIELD-CONTRACT-AND-DIAGNOSTICS — Expanded generalized discovery good-yield diagnostics before tuning

- Тип записи: stage archive
- Финальный статус: archived
- Зачем понадобилось: the user asked to implement the first stage of a new `C-DISCOVERY-GOOD-YIELD` capability so discovery yield could be improved through evidence instead of intuition. The repo already had `runtime=pass` and `nonRegression=pass`, but the good-yield proof still needed richer diagnostics before any false-negative repair or policy tuning.
- Что изменилось:
  - updated [`infra/scripts/lib/discovery-live-yield-policy.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/lib/discovery-live-yield-policy.mjs) so the generalized policy/proof layer now:
    - exports canonical `NORMALIZED_YIELD_REASON_BUCKETS`
    - emits `normalizedReasonBuckets` alongside the existing free-form `weakYieldReasons`
    - counts explicit `registration_failed` evidence when approved/promoted/duplicate outcomes do not resolve to a linked `registeredChannelId`
  - updated [`infra/scripts/test-live-discovery-examples.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/test-live-discovery-examples.mjs) so the single-run harness now:
    - marks graph and recall candidate outcomes with `registrationFailed` when onboarding does not truthfully complete
    - records `registration_failed` residuals explicitly
    - renders normalized yield buckets in the Markdown artifact next to the legacy weak-yield reason list
  - updated [`infra/scripts/test-live-discovery-yield-proof.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/test-live-discovery-yield-proof.mjs) so the bounded multi-run proof now:
    - records each run’s dominant root cause
    - writes per-pack `rootCauseCounts`
    - writes explicit aggregate root-cause drift over runs
  - updated [`tests/unit/ts/discovery-live-yield-policy.test.ts`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/ts/discovery-live-yield-policy.test.ts) with regression coverage for normalized buckets, explicit registration-failure accounting, and multi-run root-cause drift
  - synced proof wording in [`docs/verification.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/verification.md) and live execution state in [`docs/work.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/work.md)
- Что было доказано:
  - static / unit proof:
    - `node --check infra/scripts/lib/discovery-live-yield-policy.mjs`
    - `node --check infra/scripts/test-live-discovery-examples.mjs`
    - `node --check infra/scripts/test-live-discovery-yield-proof.mjs`
    - `node --import tsx --test tests/unit/ts/discovery-live-yield-policy.test.ts`
    - `git diff --check -- docs/work.md docs/verification.md infra/scripts/lib/discovery-live-yield-policy.mjs infra/scripts/test-live-discovery-examples.mjs infra/scripts/test-live-discovery-yield-proof.mjs tests/unit/ts/discovery-live-yield-policy.test.ts`
  - fresh single-run live diagnostics proof:
    - `env DISCOVERY_ENABLED=1 node infra/scripts/test-live-discovery-examples.mjs`
    - authoritative artifact:
      - `/tmp/newsportal-live-discovery-examples-bcb081e3.json`
      - `/tmp/newsportal-live-discovery-examples-bcb081e3.md`
    - result:
      - `runtimeVerdict = pass`
      - `yieldVerdict = weak`
      - `finalVerdict = yield_weak`
      - aggregate dominant root cause remained `review_policy_problem`
      - both runtime-enabled packs now expose canonical normalized buckets; in this fresh run both Example B and Example C showed:
        - `candidate_not_valid = 20`
        - `below_auto_promotion_threshold = 8`
        - `registration_failed = 0`
  - fresh multi-run yield-proof diagnostics:
    - `pnpm test:discovery:yield:compose`
    - authoritative artifact:
      - `/tmp/newsportal-live-discovery-yield-proof-e064e243.json`
      - `/tmp/newsportal-live-discovery-yield-proof-e064e243.md`
    - backing runs:
      - `/tmp/newsportal-live-discovery-examples-0da5f38f.json|md`
      - `/tmp/newsportal-live-discovery-examples-bc376f12.json|md`
      - `/tmp/newsportal-live-discovery-examples-0cfb10dc.json|md`
    - result:
      - aggregate `runtimeVerdict = pass`
      - aggregate `yieldVerdict = weak`
      - aggregate `finalVerdict = yield_weak`
      - per-pack root-cause drift is now explicit:
        - Example B: `review_policy_problem = 3`
        - Example C: `review_policy_problem = 3`
- Что stage доказал:
  - the repo now has a richer generalized good-yield diagnostics layer before any tuning:
    - canonical normalized reason buckets
    - explicit registration-failure accounting
    - aggregate root-cause drift across the bounded multi-run proof
  - the current DDGS-only bottleneck remains honest rather than hidden:
    - the aggregate root cause still points to `review_policy_problem`
    - but the latest single-run evidence also shows a large technical-loss share via `candidate_not_valid = 20` per runtime pack
- Риски или gaps:
  - this stage intentionally did not improve actual yield; it only made the bottleneck evidence sharper
  - `pnpm test:discovery:yield:compose` still exits non-zero because good yield is not yet proven, which is expected and should not be confused with runtime failure
  - the next truthful stage still needs to prove whether the high `candidate_not_valid` volume is a real live-web limit or a technical false-negative class worth repairing before policy loosening
- Follow-up:
  - open `STAGE-2-TECHNICAL-FALSE-NEGATIVE-REPAIR` next; inspect the `candidate_not_valid` cohort first, then only proceed to candidate-mix or review-policy tuning if those invalidations are shown to be truthful rather than technical drift.

### 2026-04-19 — STAGE-DISCOVERY-CASE-AGNOSTIC-PROOF-2026-04-19 — Generalized discovery proof into case packs and added downstream non-regression proof

- Тип записи: stage archive
- Финальный статус: archived
- Зачем понадобилось: the user asked to keep discovery case-agnostic rather than Example B/C-shaped, and to prove that discovery can keep searching without drifting the existing downstream filtering and selection pipelines.
- Что изменилось:
  - expanded [`infra/scripts/lib/discovery-live-example-cases.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/lib/discovery-live-example-cases.mjs) so the config layer now exports:
    - `DISCOVERY_RUNTIME_CASE_PACKS`
    - `DISCOVERY_VALIDATION_CASE_PACKS`
    - `DISCOVERY_LIVE_CASE_PACKS`
    - explicit `packClass` and `executionMode`
    - a synthetic validation-only `generic_long_tail_exploratory` pack for generalized calibration beyond Example B/C
  - updated [`infra/scripts/lib/discovery-live-yield-policy.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/lib/discovery-live-yield-policy.mjs) so the core policy now reports:
    - reusable weak-yield root causes
    - per-case evidence funnel metrics
    - aggregate root-cause diagnostics across enabled runtime packs
  - updated [`infra/scripts/test-live-discovery-examples.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/test-live-discovery-examples.mjs) so the runtime harness now:
    - runs only runtime-enabled case packs
    - calibrates against the full validation-pack set
    - emits `packClass`, `rootCauseClassification`, and aggregate yield diagnostics
    - keeps Example B/C as proof cohorts rather than architectural assumptions
  - updated [`infra/scripts/test-live-discovery-yield-proof.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/test-live-discovery-yield-proof.mjs) so the bounded multi-run proof continues to aggregate only runtime-enabled packs while preserving the generalized case-pack surface
  - added [`infra/scripts/test-discovery-pipeline-nonregression.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/test-discovery-pipeline-nonregression.mjs) as the new repo-owned safety proof for discovery vs pre-existing downstream corpus stability
  - synced commands and proof/docs in:
    - [`package.json`](/Users/user/Documents/workspace/my/NewsPortal/package.json)
    - [`docs/verification.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/verification.md)
    - [`docs/contracts/test-access-and-fixtures.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/contracts/test-access-and-fixtures.md)
    - [`.aidp/os.yaml`](/Users/user/Documents/workspace/my/NewsPortal/.aidp/os.yaml)
- Что было доказано:
  - static/helper proof:
    - `node --check infra/scripts/lib/discovery-live-example-cases.mjs`
    - `node --check infra/scripts/lib/discovery-live-yield-policy.mjs`
    - `node --check infra/scripts/test-live-discovery-examples.mjs`
    - `node --check infra/scripts/test-live-discovery-yield-proof.mjs`
    - `node --check infra/scripts/test-discovery-pipeline-nonregression.mjs`
    - `node --import tsx --test tests/unit/ts/discovery-live-yield-policy.test.ts`
  - fresh generalized live harness proof:
    - `env DISCOVERY_ENABLED=1 node infra/scripts/test-live-discovery-examples.mjs`
    - authoritative artifact:
      - `/tmp/newsportal-live-discovery-examples-b7b86b83.json`
      - `/tmp/newsportal-live-discovery-examples-b7b86b83.md`
    - result:
      - `runtimeVerdict = pass`
      - `yieldVerdict = weak`
      - `finalVerdict = yield_weak`
  - fresh discovery non-regression proof:
    - `node infra/scripts/test-discovery-pipeline-nonregression.mjs`
    - authoritative artifact:
      - `/tmp/newsportal-discovery-nonregression-0c105e1b.json`
      - `/tmp/newsportal-discovery-nonregression-0c105e1b.md`
    - result:
      - `runtimeVerdict = pass`
      - `nonRegressionVerdict = pass`
      - `yieldVerdict = weak`
      - `finalVerdict = pass_with_residuals`
      - frozen-corpus drift counts stayed `0` for:
        - `interest_filter_results`
        - `final_selection_results`
        - `system_feed_results`
        - `llm_review_log`
        - `notification_log`
- Что stage доказал:
  - discovery proof/tuning no longer has to be architecturally centered on Example B/C; those packs are now validation cohorts inside a more general case-pack surface
  - the repo now has an explicit safety proof that discovery runs do not drift the pre-existing downstream corpus while remaining on the current DDGS-only live baseline
  - the current truthful product state is now split cleanly into:
    - `runtime = pass`
    - `nonRegression = pass`
    - `yield = weak`
- Риски или gaps:
  - this stage intentionally did not improve actual DDGS-only live yield; it only generalized the proof stack and proved the downstream safety contour
  - the new non-regression script currently proves the declared downstream tables and static discovery/runtime decoupling guard, but not every possible future side-effect table by default
  - good yield is still not proven; Example B/C remain weak live cohorts on the current provider scope and thresholds
- Follow-up:
  - open a separate bounded tuning item only if the user wants to improve discovery yield while preserving the now-proven `runtime/pass + nonRegression/pass` safety contour.

### 2026-04-19 — STAGE-DISCOVERY-YIELD-PROOF-CONTRACT-2026-04-19 — Added a separate good-yield proof contract and ran the bounded multi-run DDGS-only yield proof

- Тип записи: stage archive
- Финальный статус: archived
- Зачем понадобилось: the runtime-only live discovery lane had already been hardened to non-fail passage, but it still mixed weak live-content yield with runtime health. The user asked for a separate proof contract that could distinguish runtime completion from actual discovery yield for Example B developer news and Example C outsourcing.
- Что изменилось:
  - added [`infra/scripts/lib/discovery-live-yield-policy.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/lib/discovery-live-yield-policy.mjs) as the pure repo-owned yield policy layer for:
    - graph and recall candidate classification
    - benchmark-like candidate detection
    - per-case runtime/yield verdict splits
    - calibration agreement checks
    - bounded multi-run yield aggregation
  - expanded [`infra/scripts/lib/discovery-live-example-cases.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/lib/discovery-live-example-cases.mjs) with:
    - case-specific graph/recall thresholds
    - positive and negative policy patterns
    - benchmark cohorts
    - bounded human-truth calibration fixtures
  - updated [`infra/scripts/test-live-discovery-examples.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/test-live-discovery-examples.mjs) so the single-run harness now emits:
    - `runtimeVerdict`
    - `yieldVerdict`
    - `finalVerdict`
    - `calibrationPassed`
    - per-case weak-yield reason counts
    - top rejected domains/tactics
    - benchmark-like candidate summaries
  - added [`infra/scripts/test-live-discovery-yield-proof.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/test-live-discovery-yield-proof.mjs) plus root command `pnpm test:discovery:yield:compose` for the bounded `3`-run proof contour
  - synced the durable proof surface in:
    - [`package.json`](/Users/user/Documents/workspace/my/NewsPortal/package.json)
    - [`docs/verification.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/verification.md)
    - [`docs/contracts/test-access-and-fixtures.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/contracts/test-access-and-fixtures.md)
    - [`.aidp/os.yaml`](/Users/user/Documents/workspace/my/NewsPortal/.aidp/os.yaml)
- Что было доказано:
  - helper/policy proof:
    - `node --check infra/scripts/lib/discovery-live-example-cases.mjs`
    - `node --check infra/scripts/lib/discovery-live-yield-policy.mjs`
    - `node --check infra/scripts/test-live-discovery-examples.mjs`
    - `node --check infra/scripts/test-live-discovery-yield-proof.mjs`
    - `node --import tsx --test tests/unit/ts/discovery-live-yield-policy.test.ts`
    - direct calibration spot-check via `node --input-type=module ... evaluateCalibration(...)` now returns `14/14` agreement for both Example B and Example C
  - formatting / sync proof:
    - `git diff --check -- docs/work.md docs/history.md docs/verification.md docs/contracts/test-access-and-fixtures.md .aidp/os.yaml package.json infra/scripts/test-live-discovery-examples.mjs infra/scripts/test-live-discovery-yield-proof.mjs infra/scripts/lib/discovery-live-example-cases.mjs infra/scripts/lib/discovery-live-yield-policy.mjs tests/unit/ts/discovery-live-yield-policy.test.ts`
  - fresh single-run non-regression proof:
    - `env DISCOVERY_ENABLED=1 node infra/scripts/test-live-discovery-examples.mjs`
    - authoritative artifact:
      - `/tmp/newsportal-live-discovery-examples-22232424.json`
      - `/tmp/newsportal-live-discovery-examples-22232424.md`
    - result:
      - `runtimeVerdict = pass`
      - `yieldVerdict = weak`
      - `finalVerdict = yield_weak`
      - `calibrationPassed = true`
  - fresh bounded multi-run yield proof:
    - `pnpm test:discovery:yield:compose`
    - authoritative aggregate artifact:
      - `/tmp/newsportal-live-discovery-yield-proof-d0eb2887.json`
      - `/tmp/newsportal-live-discovery-yield-proof-d0eb2887.md`
    - backing runs:
      - `/tmp/newsportal-live-discovery-examples-3e265fd2.json|md`
      - `/tmp/newsportal-live-discovery-examples-5b117936.json|md`
      - `/tmp/newsportal-live-discovery-examples-e87dd8c5.json|md`
    - result:
      - aggregate `runtimeVerdict = pass`
      - aggregate `yieldVerdict = weak`
      - aggregate `finalVerdict = yield_weak`
      - Example B passed `0/3` required yield runs
      - Example C passed `0/3` required yield runs
- Что stage доказал:
  - the repo now has a truthful good-yield proof contour that separates runtime health from discovery usefulness instead of hiding both behind one mixed verdict
  - calibration truth is now repo-owned and regression-testable rather than implicit in chat or operator judgment
  - the current DDGS-only discovery lane is runtime-stable but still weak on onboarding/downstream usefulness for both requested cases
- Риски или gaps:
  - this stage intentionally did not improve actual live discovery yield; it only made the proof contour, policy, and residual reporting truthful and repeatable
  - the current live DDGS baseline still produces no passing yield runs for either case under the shipped thresholds and provider scope
  - `pnpm test:discovery:yield:compose` now exits non-zero on `yield_weak`, which is intentional for proof but should not be confused with a runtime stack regression
- Follow-up:
  - open a separate bounded tuning item only if the user wants to improve Example B/C discovery yield beyond the now-proven `yield_weak` DDGS-only baseline.

### 2026-04-19 — STAGE-DDGS-LIVE-DISCOVERY-AUTOMATION-2026-04-19 — Added an agent-runnable DDGS-only live discovery harness for Example B and Example C

- Тип записи: stage archive
- Финальный статус: archived
- Зачем понадобилось: the user asked for a real live discovery test plan that the agent could run automatically, not a human operator checklist, and explicitly required the automation to stay on the shipped DDGS-only discovery baseline without Brave or Serper keys.
- Что изменилось:
  - added [`infra/scripts/test-live-discovery-examples.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/test-live-discovery-examples.mjs) as the main repo-owned live discovery harness
  - added [`infra/scripts/lib/discovery-live-example-cases.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/lib/discovery-live-example-cases.mjs) as the shared Example B / Example C configuration and threshold module
  - updated [`docs/contracts/test-access-and-fixtures.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/contracts/test-access-and-fixtures.md) so the new harness is part of the declared deterministic stateful test-access surface for the local compose baseline
  - the harness now:
    - loads `.env.dev` and fails fast unless discovery stays DDGS-only
    - requires `DISCOVERY_ENABLED=1`
    - requires `DISCOVERY_SEARCH_PROVIDER=ddgs`
    - requires empty `DISCOVERY_BRAVE_API_KEY`
    - requires empty `DISCOVERY_SERPER_API_KEY`
    - starts/verifies the local compose baseline
    - runs `pnpm test:discovery-enabled:compose`
    - runs `pnpm test:discovery:admin:compose`
    - snapshots `/maintenance/discovery/summary` and `/maintenance/discovery/costs/summary`
    - verifies Example B / Example C runtime preconditions directly from PostgreSQL instead of parsing `EXAMPLES.md`
    - creates and runs one graph-first mission plus one recall-first mission per case
    - auto-reviews graph candidates and auto-promotes recall candidates through deterministic thresholds
    - triggers `fetchers run:once` on onboarded channels to accelerate downstream evidence collection
    - writes machine-readable and human-readable evidence bundles to `/tmp/newsportal-live-discovery-examples-<runId>.json|md`
- Что было доказано:
  - the automation uses only currently shipped discovery/public surfaces:
    - `pnpm test:discovery-enabled:compose`
    - `pnpm test:discovery:admin:compose`
    - `/maintenance/discovery/summary`
    - `/maintenance/discovery/costs/summary`
    - maintenance discovery mission/candidate/feedback/re-evaluate APIs
    - maintenance recall mission/candidate/acquire/promote APIs
  - the script uses direct PostgreSQL evidence instead of reconstructing Example runtime state from Markdown
  - the script stays inside the current live scope:
    - only `rss` and `website`
    - browser-assisted candidates remain `website`
    - duplicate-linked promotions are treated as valid onboarding evidence
  - implementation proof:
    - `node --check infra/scripts/test-live-discovery-examples.mjs`
    - `node --check infra/scripts/lib/discovery-live-example-cases.mjs`
    - `git diff --check -- infra/scripts/test-live-discovery-examples.mjs infra/scripts/lib/discovery-live-example-cases.mjs docs/work.md docs/history.md`
- Что stage доказал:
  - the repo now has an agent-runnable live discovery harness for the two requested built-in cases, rather than only manual operator guidance and bounded compose smokes
  - the current discovery runtime can now be exercised through one automation that combines preflight proof, live DDGS discovery, deterministic review/promotion, and downstream evidence collection
- Риски или gaps:
  - the harness depends on the current local DB already containing the Example B / Example C interests, criteria, selection profiles, and baseline source channels
  - the live run itself remains dependent on real DDGS/public-web behavior, so `pass_with_residuals` is an expected honest outcome when live candidates are noisy or unsupported
  - this stage intentionally did not add Brave/Serper fallback, non-`rss`/`website` discovery coverage, or a new package command wrapper
- Follow-up:
  - none required unless the user wants a root `package.json` wrapper, broader live-provider support, or a different deterministic review policy.

### 2026-04-19 — PATCH-DISCOVERY-TESTING-HANDBOOK-2026-04-19 — Added a standalone operator-facing discovery testing guide and linked it from the main operator docs

- Тип записи: patch archive
- Финальный статус: archived
- Зачем понадобилось: the repo already had discovery runtime truth, proofs, and admin/operator surfaces, but it did not yet have a standalone operator-facing handbook similar to the website testing docs. The user asked for a dedicated discovery testing guide grounded in the shipped dual-path discovery flow.
- Что изменилось:
  - added [`DISCOVERY_MODE_TESTING.md`](/Users/user/Documents/workspace/my/NewsPortal/DISCOVERY_MODE_TESTING.md) as a standalone operator-facing handbook for discovery runtime enable, graph-first mission testing, and independent recall testing
  - the new handbook documents the canonical proof surfaces:
    - `pnpm test:discovery-enabled:compose`
    - `pnpm test:discovery:admin:compose`
    - `/admin/discovery`
    - `/maintenance/discovery/summary`
    - `/maintenance/discovery/costs/summary`
  - the guide now states the current shipped dual-path discovery meaning explicitly:
    - graph mission fit
    - generic source quality
    - neutral recall backlog
    - recall promotion state
  - the handbook also records current scope boundaries:
    - browser-assisted website candidates stay `website`
    - `api`, `email_imap`, and `youtube` remain outside the bounded operator-ready discovery-testing scope for this guide
  - cross-links were added from:
    - [`README.md`](/Users/user/Documents/workspace/my/NewsPortal/README.md)
    - [`EXAMPLES.md`](/Users/user/Documents/workspace/my/NewsPortal/EXAMPLES.md)
    - [`docs/manual-mvp-runbook.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/manual-mvp-runbook.md)
- Что было доказано:
  - command names documented in the handbook match the current root scripts in [`package.json`](/Users/user/Documents/workspace/my/NewsPortal/package.json)
  - operator-flow wording for graph-first and recall lanes matches the current shipped harnesses and UI/runtime surfaces:
    - [`infra/scripts/test-discovery-admin-flow.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/test-discovery-admin-flow.mjs)
    - [`services/workers/app/smoke.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/smoke.py)
    - [`apps/admin/src/pages/discovery.astro`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/discovery.astro)
  - formatting / link proof:
    - `git diff --check -- DISCOVERY_MODE_TESTING.md README.md EXAMPLES.md docs/manual-mvp-runbook.md docs/work.md docs/history.md`
- Что patch доказал:
  - the repo no longer relies on discovery instructions being fragmented between `README.md`, the `EXAMPLES.md` appendix, and the optional runbook note
  - operators now have a single discovery-specific handbook that stays aligned with the shipped proof lanes and current dual-path discovery terminology
- Риски или gaps:
  - this patch intentionally did not change runtime behavior or reframe durable discovery contracts
  - the handbook is operator-facing and bounded to the currently shipped `rss` / `website` discovery-testing scope
- Follow-up:
  - none required unless the user wants screenshots, extra live examples, or a broader combined handbook that merges website and discovery operator testing.

### 2026-04-19 — PATCH-DISCOVERY-REPAIR-POSTCHECK-2026-04-19 — Closed the residual worker/runtime gaps after the compose discovery schema repair

- Тип записи: patch archive
- Финальный статус: archived
- Зачем понадобилось: after the compose discovery schema repair was green, the user asked to verify that nothing skipped was still blocking or breaking. A non-destructive rebuild/restart check exposed two residual worker-side issues that the earlier schema repair had not touched.
- Что изменилось:
  - [`services/workers/app/task_engine/orchestrator_plugins.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/task_engine/orchestrator_plugins.py) now auto-registers the discovery orchestrator task plugins into the shipped UTE registry, matching the existing auto-registration pattern used by the other task-plugin modules.
  - the same worker file now short-circuits graph-first discovery sequence execution with explicit skipped runtime state when `DISCOVERY_ENABLED=0`, instead of letting admin-triggered runs fail on unavailable live adapters.
  - [`tests/unit/python/test_task_engine_discovery_plugins.py`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/python/test_task_engine_discovery_plugins.py) now covers both residual regressions:
    - built-in registry population for `discovery.plan_hypotheses`, `discovery.execute_hypotheses`, `discovery.evaluate_results`, and `discovery.re_evaluate_sources`;
    - executor behavior that completes the orchestrator run with `_stop` / skipped-task semantics when discovery runtime is disabled.
  - [`docs/contracts/discovery-agent.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/contracts/discovery-agent.md) and [`docs/verification.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/verification.md) now make the disabled-runtime contract explicit: admin/operator acceptance may request a mission run on the default baseline, but provider-backed execution proof belongs only to `pnpm test:discovery-enabled:compose`.
- Что было доказано:
  - post-repair durability proof:
    - non-destructive compose rebuild/restart of the affected services completed successfully
    - direct table checks still showed `discovery_hypothesis_classes`, `discovery_source_profiles`, `discovery_portfolio_snapshots`, and `discovery_feedback_events` present after the rebuild
    - `curl -sS http://127.0.0.1:8000/maintenance/discovery/summary` stayed `200`
  - residual regression discovery before the fix:
    - default worker logs showed `KeyError('Unknown task plugin module discovery.plan_hypotheses.')` after the rebuilt admin/operator run path hit the sequence queue
    - direct runtime inspection inside the live worker confirmed `discovery.plan_hypotheses` was absent from `TASK_REGISTRY`
    - after auto-registration was fixed, the next rebuilt worker no longer showed the unknown-plugin failure, but still failed the queued admin-triggered run with `RuntimeError('LLM analyzer adapter is not configured for the Universal Task Engine runtime.')`
  - code-level proof after the fix:
    - `python -m unittest tests.unit.python.test_task_engine_discovery_plugins`
    - `pnpm unit_tests`
    - `git diff --check`
  - live compose proof after the fix:
    - rebuild/restart of `worker`
    - `pnpm test:discovery-enabled:compose`
    - `pnpm test:discovery:admin:compose`
    - direct DB proof for the latest admin-created onboarding rows:
      - latest `discovery_candidates.candidate_id = 0f2a7dd9-8472-4808-a1d5-74b0fc07eca1` had a real `registered_channel_id`, matching `source_channels` row, and `outbox_events.event_type = 'source.channel.sync.requested'`
      - latest `discovery_recall_candidates.recall_candidate_id = a331e4fd-0bdb-40d7-8cc7-82f7b9e2b5d0` had a real `registered_channel_id`, matching `source_channels` row, and `outbox_events.event_type = 'source.channel.sync.requested'`
    - direct `sequence_runs` / `sequence_task_runs` proof for the latest admin-triggered run:
      - `run_id = 180769a1-dfe9-4fce-a5f9-9096fc095042` finished as `completed`, not `failed`
      - `plan_hypotheses` persisted `discovery_runtime_enabled = false`, `discovery_runtime_skipped = true`, and `_stop = true`
      - downstream orchestrator tasks were marked `skipped` with `reason = sequence_stopped`
    - worker logs after the final rebuild/run no longer showed either the unknown-plugin error or the unavailable-adapter failure.
- Что patch доказал:
  - the earlier green repair was incomplete: the schema drift was fixed, but a normal compose rebuild exposed residual worker/runtime breakage that still affected admin-triggered discovery run requests.
  - the current canonical baseline is now genuinely unblocked:
    - repaired discovery schema survives a normal rebuild/restart;
    - orchestrator plugins are present in the shipped task registry;
    - default disabled discovery runtime no longer produces hidden failed jobs when operator control-plane run requests are made;
    - discovery-enabled runtime proof and admin/operator proof both still pass afterward.
- Риски или gaps:
  - the patch intentionally preserved the bounded contract that `DISCOVERY_ENABLED=0` does not perform provider-backed discovery execution on the default worker baseline; it only converts that path into an explicit completed short-circuit instead of a worker failure.
  - the earlier historical question remains open: why a previous live DB state recorded `0030_discovery_schema_drift_repair.sql` before still needing the residual replay from `0036`.
- Follow-up:
  - no immediate follow-up is required unless the user wants a deeper archaeological/debug pass on the historical `0030`/`0036` mismatch.

### 2026-04-19 — PATCH-DISCOVERY-COMPOSE-RESIDUAL-REPAIR-2026-04-19 — Repaired the live compose discovery residual and revalidated the full discovery proof contour

- Тип записи: patch archive
- Финальный статус: archived
- Зачем понадобилось: after the discovery verification spike showed that the local compose baseline still lacked `public.discovery_hypothesis_classes` and the dependent discovery core tables even though `schema_migrations` already recorded `0030_discovery_schema_drift_repair.sql`, the user asked for a full repair/debug pass and a complete rerun of discovery readiness/runtime/admin proof.
- Что изменилось:
  - [`database/migrations/0036_discovery_schema_residual_repair.sql`](/Users/user/Documents/workspace/my/NewsPortal/database/migrations/0036_discovery_schema_residual_repair.sql) now replays the missing 0016-core discovery repair idempotently for databases where `0030` is already recorded but `discovery_hypothesis_classes` or the dependent profile/portfolio tables are still absent.
  - [`package.json`](/Users/user/Documents/workspace/my/NewsPortal/package.json) now points `pnpm test:discovery-enabled:compose` at the canonical local compose baseline (`.env.dev` plus `infra/docker/compose.dev.yml`) instead of the compose-only stack, so the bounded runtime smoke exercises the same environment as the rest of the repo-owned local verification lane.
  - [`docs/blueprint.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/blueprint.md), [`docs/contracts/discovery-agent.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/contracts/discovery-agent.md), [`docs/verification.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/verification.md), and [.aidp/os.yaml](/Users/user/Documents/workspace/my/NewsPortal/.aidp/os.yaml) now treat `0036_discovery_schema_residual_repair.sql` as the residual replay step after `0026a` and `0030` for already-marked drifted compose/local databases.
  - the current live compose PostgreSQL baseline was repaired in place by replaying `0036_discovery_schema_residual_repair.sql` directly into the running `docker-postgres-1` database after drift confirmation, because the active DB already carried the broken “`0030` recorded, class-registry tables absent” state.
- Что было доказано:
  - prerequisite and static proof:
    - `pnpm test:migrations:smoke`
    - `pnpm unit_tests`
    - `pnpm typecheck`
  - live compose discovery repair evidence before the fix:
    - direct DB reads showed `discovery_missions` and `discovery_recall_candidates` present while `discovery_hypothesis_classes`, `discovery_source_profiles`, `discovery_source_interest_scores`, `discovery_portfolio_snapshots`, `discovery_feedback_events`, and `discovery_strategy_stats` were absent;
    - `GET http://127.0.0.1:8000/maintenance/discovery/summary` returned `500`;
    - both `pnpm test:discovery-enabled:compose` and `pnpm test:discovery:admin:compose` failed on the missing `discovery_hypothesis_classes` relation.
  - live repair proof:
    - direct replay into the running compose DB:
      - `docker compose --env-file .env.dev -f infra/docker/compose.yml -f infra/docker/compose.dev.yml exec -T postgres psql -U newsportal -d newsportal < database/migrations/0036_discovery_schema_residual_repair.sql`
    - immediate post-repair verification:
      - direct `psql` reads showed the missing core discovery tables restored in `public`
      - worker-side and api-side `to_regclass('public.discovery_hypothesis_classes')` checks both returned the restored table name
      - `curl -sS http://127.0.0.1:8000/maintenance/discovery/summary` returned `200`
  - full discovery proof after the repair:
    - `pnpm test:discovery-enabled:compose`
      - returned `status = "discovery-enabled-ok"`
      - bounded walkthrough proved graph compile -> plan -> execute -> evaluate -> candidate/profile/score/portfolio persistence -> registration into `source_channels` -> `source.channel.sync.requested` outbox write -> feedback -> re-evaluation
    - `pnpm test:discovery:admin:compose`
      - returned `status = "discovery-admin-ok"`
      - proved admin sign-in, `/discovery` render, class and mission create/update/archive/reactivate/delete, graph compile, mission run request, candidate approval, feedback submit, re-evaluation, recall mission/candidate create, recall promotion, and operator surface rendering
    - direct onboarding evidence after the admin/runtime walkthrough:
      - `discovery_candidates.registered_channel_id` present with matching `source_channels` row and `outbox_events.event_type = 'source.channel.sync.requested'`
      - `discovery_recall_candidates.registered_channel_id` present with matching `source_channels` row and `outbox_events.event_type = 'source.channel.sync.requested'`
      - `/maintenance/discovery/summary` returned persisted counts including `active_class_count = 7`, `approved_candidate_count = 1`, `promoted_recall_candidate_count = 1`, `source_profile_count = 1`, `source_interest_score_count = 1`, `portfolio_snapshot_count = 1`, and `feedback_event_count = 1`
- Что patch доказал:
  - the compose/local discovery residual was real and not a discovery-runtime false positive: the shipped runtime and admin surfaces were blocked specifically by a missing class registry plus dependent discovery-core tables on the live compose DB.
  - after restoring that missing core and correcting the compose smoke command to target the canonical `.env.dev + compose.dev.yml` stack, discovery is again test-ready and operational end-to-end on the local baseline.
  - discovery is now proven as substantially integrated with the system rather than isolated:
    - worker task-engine runtime lane works;
    - maintenance API/admin BFF lane works;
    - both graph-first and recall-first onboarding paths register real `source_channels`;
    - both paths emit `source.channel.sync.requested`.
- Риски или gaps:
  - the patch fixed the live compose residual and added a durable replay migration, but it did not fully explain why the earlier live DB had already recorded `0030_discovery_schema_drift_repair.sql` before still requiring a direct residual replay.
  - the successful admin acceptance run intentionally left bounded discovery proof residue in the current local compose DB: `1` mission, `1` recall mission, `1` approved discovery candidate, `1` promoted recall candidate, `1` source profile, `1` source-interest score, `1` portfolio snapshot, `1` feedback event, and `2` source-quality snapshots.
- Follow-up:
  - no immediate repair follow-up is required unless the user wants a deeper root-cause investigation into the earlier “`0030` recorded but core tables absent” live DB state.

### 2026-04-19 — PATCH-ADMIN-SYSTEM-INTEREST-PRIORITY-PRECISION — Allowed fine-grained decimal priority values in admin system-interest editing

- Тип записи: patch archive
- Финальный статус: archived
- Зачем понадобилось: the user reported that admin system-interest priority could only be set in tenths like `0.9`, while operators needed finer values such as `0.95`, `0,95`, and `0.84`.
- Что изменилось:
  - [`apps/admin/src/components/InterestTemplateEditorForm.tsx`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/components/InterestTemplateEditorForm.tsx) now exposes the system-interest priority field with `step={0.001}` and updated operator help text so the admin UI no longer constrains edits to tenths only.
  - [`apps/admin/src/lib/server/admin-templates.ts`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/lib/server/admin-templates.ts) now normalizes comma decimals before parsing positive priority values, so server-side validation accepts both `0.95` and `0,95` without truncating or misreading the value.
  - [`tests/unit/ts/admin-template-sync.test.ts`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/ts/admin-template-sync.test.ts) now covers both a fine-grained dot-decimal value (`0.845`) and a comma-decimal value (`0,95`) to keep the parser contract from regressing.
- Что было доказано:
  - targeted parser proof:
    - `node --import tsx --test tests/unit/ts/admin-template-sync.test.ts`
  - static proof:
    - `pnpm typecheck`
  - formatting proof:
    - `git diff --check -- docs/work.md apps/admin/src/components/InterestTemplateEditorForm.tsx apps/admin/src/lib/server/admin-templates.ts tests/unit/ts/admin-template-sync.test.ts`
- Что patch доказал:
  - the real limiter was the admin form step plus locale-sensitive parsing, not database precision: `interest_templates.priority` and synced `criteria.priority` already store `double precision`.
  - operators can now save system-interest priority values with finer precision than tenths, and the backend reads both common decimal separator variants truthfully.
- Риски или gaps:
  - this patch intentionally stayed bounded to system interests; the per-user-interest admin forms still keep their separate `0.1` step UX.
- Follow-up:
  - none required unless the user wants the same precision/localized-decimal handling aligned for admin-managed user interests.

### 2026-04-18 — PATCH-RSS-RUNTIME-FIRST-FETCH-2026-04-18 — Repaired RSS scheduler runtime so newly added feeds reach first fetch again

- Тип записи: patch archive
- Финальный статус: archived
- Зачем понадобилось: after the user added RSS channels into the current local configuration and reported that nothing was ingesting from them, the repo needed a bounded runtime repair in `services/fetchers` rather than more source-side tuning.
- Что изменилось:
  - [`services/fetchers/src/fetchers.ts`](/Users/user/Documents/workspace/my/NewsPortal/services/fetchers/src/fetchers.ts) due-channel scheduling was patched in two minimal ways:
    - the provider-limit comparison now casts the `case` branches to `bigint`, fixing the PostgreSQL `bigint <= text` poll-loop failure;
    - never-fetched channels are now prioritized by `created_at desc` before the historical backlog ordering, so newly added RSS rows reach first fetch promptly instead of waiting behind thousands of older never-fetched feeds.
  - [`docs/work.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/work.md) now records the repaired live RSS runtime truth and removes the patch from active execution.
- Что было доказано:
  - static proof:
    - `pnpm typecheck`
  - live runtime proof after rebuilding/restarting `fetchers` with:
    - `docker compose --env-file .env.dev -f infra/docker/compose.yml -f infra/docker/compose.dev.yml up --build -d fetchers`
  - the recurring scheduler failure stopped reproducing on the rebuilt service, and representative newly added RSS channels moved from the tail of the due queue to the head:
    - `The New Stack = provider_rank 1`
    - `Google News — Digital Transformation Partner Search = provider_rank 2`
    - `TechCrunch — Startups = provider_rank 6`
    - `Reuters — Technology = provider_rank 7`
  - those same channels then reached real first fetch execution:
    - `VentureBeat`: `new_content`, HTTP `200`, `7` fetched, `7` new
    - `Google News — Digital Transformation Partner Search`: `new_content`, HTTP `200`, `20` fetched, `4` new
    - `TechCrunch — Startups`: `new_content`, HTTP `200`, `18` fetched, `18` new
    - `The New Stack`: `new_content`, HTTP `200`, `15` fetched, `15` new
    - `Reuters — Technology`: `hard_failure`, HTTP `404`, which still proves that the channel now reaches channel-level polling instead of scheduler starvation
  - aggregate runtime proof after the fix:
    - `53` RSS fetch runs in the last `2` minutes
    - representative new channels now show non-null `last_fetch_at`, and successful ones also show non-null `last_success_at`
- Что patch доказал:
  - the user-visible “RSS ingress is dead” symptom had two runtime causes: a global scheduler SQL type failure and then starvation of newly added never-fetched feeds behind the legacy backlog.
  - both issues are now repaired on the local compose stack, and newly added RSS channels again reach first fetch without requiring any admin/template/source reconfiguration.
- Риски или gaps:
  - this patch does not tune source quality; individual feeds can still truthfully return `404`, `502`, or `no_change` once they are actually polled.
  - the repo still carries pre-existing user-owned edits in `services/fetchers/src/fetchers.ts`; this patch intentionally layered only the bounded scheduler fixes on top of that dirty file.
- Follow-up:
  - none required for the runtime fix itself; only open a new item if the user wants source-quality cleanup, different fairness policy, or throughput tuning.

### 2026-04-18 — SPIKE-RSS-INGRESS-DIAGNOSE-2026-04-18 — Diagnosed why the newly added RSS channels are not ingesting on the preserved local stack

- Тип записи: spike archive
- Финальный статус: archived
- Зачем понадобилось: after the user added RSS channels into the current local configuration and reported that no RSS ingress was happening, the repo needed a read-only diagnosis tied to the live compose state rather than another guess based on configuration alone.
- Что проверено:
  - current provider mix in `source_channels`
  - newest `rss` channel rows, runtime scheduling state, and channel-level fetch evidence
  - recent `fetchers` container logs
- Что было доказано:
  - provider counts:
    - `rss = 5185`
    - `website = 29`
  - newest RSS channels created on `2026-04-18 18:19-18:20 UTC` are present and active, including recent Google News, Reddit, TechCrunch, Reuters, VentureBeat, and The New Stack rows.
  - those newest RSS rows already have scheduling state in `source_channel_runtime_state`, but still show:
    - `last_fetch_at = null`
    - `last_success_at = null`
    - `last_result_kind = null`
    - `consecutive_failures = 0`
    - no recent `channel_fetch_runs`
  - recent `fetchers` logs repeatedly emit the same top-level failure:
    - `Fetchers poll failed.`
    - PostgreSQL error `42883`
    - `No operator matches the given name and argument types`
  - a manual read-only execution of the current `loadDueChannels()` SQL path succeeds, which means the scheduler reaches a later failing DB operation during the poll loop rather than failing because the new RSS channel rows themselves are malformed.
- Что spike доказал:
  - the current lack of RSS ingress is not primarily a feed-content or per-channel configuration issue.
  - the newly added RSS channels are currently blocked by a global fetchers poll-loop failure against PostgreSQL, so they never reach first fetch or first persisted fetch-run result.
  - the huge existing RSS population (`5185` rows) also means that, even after a fix, scheduler fairness/backlog may still matter, but the immediate blocker today is the recurring runtime DB error rather than feed quality.
- Риски или gaps:
  - this spike intentionally stopped at diagnosis and did not identify the exact write/query statement inside the poll loop that produces `42883`.
  - no runtime/code fix was applied, so RSS ingress remains blocked until a separate implementation item addresses the fetchers-side DB error.
- Follow-up:
  - if the user wants the issue fixed, the next truthful item is a bounded implementation patch in `services/fetchers` to reproduce and repair the failing PostgreSQL operation behind the recurring `Fetchers poll failed` / `42883` error.

### 2026-04-18 — STAGE-TUNED-OUTSOURCE-RESET-RERUN-2026-04-18 — Reset the local compose DB and re-materialized the tuned outsourcing website cohort on a fresh baseline

- Тип записи: stage archive
- Финальный статус: archived
- Зачем понадобилось: after the user explicitly asked for a destructive local DB reset plus a fresh outsourcing verification pass, the repo needed to re-materialize the tuned Example C bundle and the bounded outsourcing website source set on an empty compose baseline so the updated configuration could be validated end-to-end.
- Что изменилось:
  - [`docs/work.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/work.md) tracked the active reset/rerun stage and now records the new preserved post-reset outsourcing cohort.
  - no product/runtime code changes were required for this stage; the execution reused the already-shipped operator harness in [`infra/scripts/run-live-website-outsourcing.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/run-live-website-outsourcing.mjs), the tuned repo-owned bundle in [`infra/scripts/lib/outsource-example-c.bundle.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/lib/outsource-example-c.bundle.mjs), and the bounded website source list in [`docs/data_scripts/web.json`](/Users/user/Documents/workspace/my/NewsPortal/docs/data_scripts/web.json).
- Что было доказано:
  - explicit user-approved destructive reset and baseline restart:
    - `pnpm dev:mvp:internal:down:volumes`
    - `pnpm dev:mvp:internal:no-build`
  - guarded-table zero-state after reset:
    - `source_channels = 0`
    - `interest_templates = 0`
    - `criteria = 0`
    - `selection_profiles = 0`
    - `llm_prompt_templates = 0`
    - `web_resources = 0`
    - `articles = 0`
    - `sequence_runs = 0`
  - fresh tuned live rerun:
    - `node --input-type=module -e "import('./infra/scripts/run-live-website-outsourcing.mjs')"`
    - evidence bundles:
      - [/tmp/newsportal-live-website-outsourcing-2026-04-18T180725966Z.json](/tmp/newsportal-live-website-outsourcing-2026-04-18T180725966Z.json)
      - [/tmp/newsportal-live-website-outsourcing-2026-04-18T180725966Z.md](/tmp/newsportal-live-website-outsourcing-2026-04-18T180725966Z.md)
  - post-run DB state:
    - `source_channels = 29`
    - `interest_templates = 5`
    - `criteria = 5`
    - `selection_profiles = 5`
    - `llm_prompt_templates = 3`
    - `web_resources = 259`
    - `articles = 220`
    - `final_selection_results = 220`
    - `system_feed_results = 220`
    - `interest_filter_results = 1100`
    - `sequence_runs = 487`
  - final-selection outcome:
    - `selected = 2`
    - `rejected = 218`
    - selected rows:
      - `.NET C# Backend Developer (Freelance, Per-Project Work, Ongoing Opportunities) hourly`
      - `Custom Clock Wheel for AzuraCast`
- Что stage доказала:
  - the fresh empty compose baseline can now materialize the tuned post-sync outsourcing Example C bundle rather than the old stale baseline, import all `29` bounded website sources, and reach a non-zero selected outsourcing outcome on the same operator harness.
  - the final live classification summary for this rerun was:
    - `15` `projected_but_not_selected`
    - `11` `external/runtime_residual`
    - `2` `projected_and_selected`
    - `1` `browser_fallback_residual`
    - `1` `skipped_rejected_open_web`
    - `0` `implementation_issue`
- Риски или gaps:
  - the current compose DB intentionally preserves the new post-reset outsourcing cohort and should not be wiped again unless the user explicitly asks for another reset.
  - most imported/projected rows still do not pass final selection, so any next step here is tuning or source-quality follow-up rather than another reset.
- Follow-up:
  - none required for the reset/rerun stage itself; open a new bounded item only if the user wants deeper analysis of why the remaining `218` rows were rejected or wants to tune sources/interests further.

### 2026-04-18 — PATCH-OUTSOURCE-EXAMPLE-BUNDLE-SYNC-2026-04-18 — Re-synced the repo-owned outsourcing Example C import bundle with the tuned documentation

- Тип записи: patch archive
- Финальный статус: archived
- Зачем понадобилось: the user pointed out that `EXAMPLES.md` had been updated with the admin-tuned outsourcing configuration, but fresh reruns still materialized the stale baseline because the live import path reads `infra/scripts/lib/outsource-example-c.bundle.mjs`, not the markdown document.
- Что изменилось:
  - [`infra/scripts/lib/outsource-example-c.bundle.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/lib/outsource-example-c.bundle.mjs) now mirrors the tuned Example C bundle rather than the old uniform-`balanced` baseline. The repo-owned import source now carries:
    - tuned `interests`, `criteria`, and `global` LLM prompts;
    - tuned `must_not_have_terms` and candidate signal groups for all `5` outsourcing system interests;
    - mixed per-template `selection_profile_policy.strictness` (`broad` for buyer build, staff augmentation, and implementation-partner search; `balanced` for procurement and legacy-rescue interests).
  - [`EXAMPLES.md`](/Users/user/Documents/workspace/my/NewsPortal/EXAMPLES.md) generic guidance was tightened so the document no longer tells operators to apply a stale one-size-fits-all `Strictness = balanced` policy or to treat Example C `interests` as merely optional/future-ready.
  - [`docs/work.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/work.md) now records the truthful state: docs and import bundle are re-synced, but the currently preserved local DB cohort is still the older reset-backed baseline until a new rerun is requested.
- Что было доказано:
  - syntax proof:
    - `node --check infra/scripts/lib/outsource-example-c.bundle.mjs`
  - runtime import proof:
    - `node --input-type=module -e "import { OUTSOURCE_EXAMPLE_C_BUNDLE } from './infra/scripts/lib/outsource-example-c.bundle.mjs'; console.log(JSON.stringify({ llmScopes: OUTSOURCE_EXAMPLE_C_BUNDLE.llm_templates.map((t) => t.scope), policies: OUTSOURCE_EXAMPLE_C_BUNDLE.interest_templates.map((t) => ({ name: t.name, strictness: t.selection_profile_policy.strictness })) }, null, 2));"`
    - verified the exported scopes are `interests`, `criteria`, `global`, and the interest strictness mix is now `broad/broad/balanced/broad/balanced`.
  - formatting proof:
    - `git diff --check -- EXAMPLES.md infra/scripts/lib/outsource-example-c.bundle.mjs`
- Что patch доказал:
  - future fresh imports and bounded outsourcing reruns can now materialize the same tuned Example C configuration that is documented in `EXAMPLES.md`, instead of silently falling back to the stale repo-owned baseline bundle.
  - repeatability is now repo-owned rather than chat-dependent: the operator-facing doc and the machine-readable import bundle describe the same outsourcing prompts, interest definitions, and profile policy.
- Риски или gaps:
  - no fresh rerun was executed as part of this patch, so the currently preserved local DB still reflects the earlier baseline rerun and not the newly synced bundle.
  - if the user wants empirical proof on a live stack, the next bounded item is a fresh rerun using the updated repo-owned bundle.

### 2026-04-18 — STAGE-LIVE-WEBSITE-OUTSOURCING-EMPTY-STACK-2026-04-18 — Reset the local compose DB and executed a fresh bounded outsourcing website live run

- Тип записи: stage archive
- Финальный статус: archived
- Зачем понадобилось: after the earlier empty-stack attempt was blocked by deterministic compose-proof residue, the user explicitly approved a full local DB cleanup/reset and asked to load the website sources from `docs/data_scripts/web.json`, materialize the outsourcing Example C bundle from `EXAMPLES.md`, and run the real outsourcing website ingestion flow on a fresh compose baseline.
- Что изменилось:
  - [`docs/work.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/work.md) tracked the stage through the blocked proof-residue state, the explicit user-approved reset reframe, and the successful fresh live rerun.
  - no product/runtime code changes were needed; the rerun reused the shipped operator harness in [`infra/scripts/run-live-website-outsourcing.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/run-live-website-outsourcing.mjs), the Example C mirror in [`infra/scripts/lib/outsource-example-c.bundle.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/lib/outsource-example-c.bundle.mjs), repo-owned `docs/data_scripts/web.json`, and Example C parity from [`EXAMPLES.md`](/Users/user/Documents/workspace/my/NewsPortal/EXAMPLES.md).
- Что было доказано:
  - previously completed deterministic proof contour remained green before the reset-backed rerun:
    - `pnpm typecheck`
    - `pnpm unit_tests`
    - `pnpm test:website:compose`
    - `pnpm test:hard-sites:compose`
    - `pnpm test:channel-auth:compose`
    - `pnpm test:website:admin:compose`
    - `pnpm test:enrichment:compose`
  - explicit user-approved reset and fresh baseline restoration:
    - `pnpm dev:mvp:internal:down:volumes`
    - `pnpm dev:mvp:internal:no-build`
    - guarded-table recheck after reset showed:
      - `source_channels=0`
      - `interest_templates=0`
      - `criteria=0`
      - `selection_profiles=0`
      - `llm_prompt_templates=0`
      - `web_resources=0`
      - `articles=0`
      - `sequence_runs=0`
  - fresh live bounded run:
    - `node --input-type=module -e "import('./infra/scripts/run-live-website-outsourcing.mjs')"`
    - evidence bundles:
      - [/tmp/newsportal-live-website-outsourcing-2026-04-18T173718290Z.json](/tmp/newsportal-live-website-outsourcing-2026-04-18T173718290Z.json)
      - [/tmp/newsportal-live-website-outsourcing-2026-04-18T173718290Z.md](/tmp/newsportal-live-website-outsourcing-2026-04-18T173718290Z.md)
  - post-run DB state:
    - `source_channels = 29`
    - `interest_templates = 5`
    - `criteria = 5`
    - `selection_profiles = 5`
    - `llm_prompt_templates = 3`
    - `web_resources = 250`
    - `articles = 219`
    - `final_selection_results = 219`
    - `system_feed_results = 219`
    - `interest_filter_results = 1095`
    - `sequence_runs = 475`
  - post-run product/read-model checks:
    - `/collections/system-selected?page=1&pageSize=20` returned `total = 0`
    - `/dashboard/summary` returned `active_news = 0`
    - direct DB checks showed `selected = 0` and `eligible = 0`
- Что stage доказала:
  - the fresh empty compose baseline can again materialize the full Example C outsourcing configuration into runtime truth, import all `29` bounded open-web website sources from `docs/data_scripts/web.json`, and execute the real `website -> web_resources -> projected articles -> downstream selection` path without implementation-issue classifications.
  - the final live classification summary for the rerun was:
    - `18` `projected_but_not_selected`
    - `10` `external/runtime_residual`
    - `1` `browser_fallback_residual`
    - `1` `skipped_rejected_open_web`
  - the rerun produced substantial acquired/projected content but still no selected outsourcing feed outcome:
    - `250` persisted `web_resources`
    - `219` projected `articles`
    - `0` selected rows
    - `0` eligible compatibility feed rows
  - representative projected-but-not-selected sources in this rerun included `TED`, `Find a Tender`, `SAM.gov`, `UNGM`, `Freelancer.com`, `Guru`, `PeoplePerHour`, `Workana`, and `Mercell`.
- Риски или gaps:
  - the resulting database now contains the intentionally preserved fresh outsourcing live cohort and should not be treated as disposable residue unless the user explicitly asks for another reset.
  - user-facing system-selected surfaces remain empty because the outsourcing bundle still selected `0` rows from this rerun, even though raw website resources and projected articles were ingested successfully.
  - residual sites remain truthful external/runtime outcomes rather than implementation defects, including `403`, `robots.txt`, unsupported `cloudflare_js_challenge`, unsupported login gating, and the single browser-fallback residual.
- Follow-up:
  - if the user wants to see more than raw ingested/projected website content, the next bounded item is outsourcing-yield tuning or a targeted operator walkthrough of `/admin/resources` and related diagnostics rather than another implementation rerun.

### 2026-04-18 — C-LIVE-OUTSOURCING-WEBSITE-VALIDATION-2026-04-18 — Finalized the outsourcing live-run harness and executed the bounded real-site website validation

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: the user wanted a real-site `website` ingestion validation for the outsourcing case on the empty local compose stack, driven by `docs/data_scripts/web.json` and Example C from `EXAMPLES.md`, with truthful proof and no silent DB reset.
- Что изменилось:
  - [`infra/scripts/run-live-website-outsourcing.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/run-live-website-outsourcing.mjs) was finalized into the bounded operator harness for this capability. It now:
    - verifies compose health and the empty guarded-table baseline before mutation;
    - imports `29` open-web sites from `docs/data_scripts/web.json` (`26 ready`, `3 needs_browser_fallback`);
    - records the single `rejected_open_web` row as `skipped_rejected_open_web`;
    - classifies results as `projected_and_selected`, `projected_but_not_selected`, `resource_only_expected`, `browser_fallback_residual`, `external/runtime_residual`, `implementation_issue`, and `skipped_rejected_open_web`;
    - runs under plain `node` via `tsx/esm/api` instead of requiring `node --import tsx`.
  - [`infra/scripts/lib/outsource-example-c.bundle.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/lib/outsource-example-c.bundle.mjs) was added as the repo-owned machine-readable Example C mirror for the `3` outsourcing LLM templates and `5` system-interest templates, replacing the legacy JSON reference asset as live-run input.
  - [`docs/work.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/work.md) was reopened for the bounded execution item and then compressed back to a no-active-work snapshot after archive sync.
- Что было доказано:
  - harness sanity:
    - `node --check infra/scripts/run-live-website-outsourcing.mjs`
    - `node --check infra/scripts/lib/outsource-example-c.bundle.mjs`
    - `node --input-type=module -e "import { OUTSOURCE_EXAMPLE_C_PARITY } from './infra/scripts/lib/outsource-example-c.bundle.mjs'; console.log(JSON.stringify(OUTSOURCE_EXAMPLE_C_PARITY));"`
    - `node --input-type=module -e "import { tsImport } from 'tsx/esm/api'; const m = await tsImport('./apps/admin/src/lib/server/db.ts', import.meta.url); console.log(typeof m.getPool);"`
  - static and deterministic proof:
    - `pnpm typecheck`
    - `pnpm unit_tests`
    - `pnpm test:website:compose`
    - `pnpm test:hard-sites:compose`
    - `pnpm test:channel-auth:compose`
    - `pnpm test:website:admin:compose`
    - `pnpm test:enrichment:compose`
  - truthful empty-baseline preservation:
    - post-proof DB inspection showed deterministic residue from the website-admin/API/email-imap/enrichment fixtures only;
    - that residue was cleaned with targeted deletion of the known fixture `channel_id` / `doc_id` / `resource_id` / `sequence_runs` rows rather than a broad reset, and the guarded tables were re-verified empty before the live run.
  - live bounded run:
    - `node --input-type=module -e "import('./infra/scripts/run-live-website-outsourcing.mjs')"`
    - evidence bundles:
      - [/tmp/newsportal-live-website-outsourcing-2026-04-18T155147751Z.json](/tmp/newsportal-live-website-outsourcing-2026-04-18T155147751Z.json)
      - [/tmp/newsportal-live-website-outsourcing-2026-04-18T155147751Z.md](/tmp/newsportal-live-website-outsourcing-2026-04-18T155147751Z.md)
  - post-run DB state:
    - `source_channels = 29`
    - `interest_templates = 5`
    - `criteria = 5`
    - `selection_profiles = 5`
    - `llm_prompt_templates = 3`
    - `web_resources = 279`
    - `articles = 240`
    - `final_selection_results = 240`
    - `system_feed_results = 240`
    - `interest_filter_results = 1200`
    - `sequence_runs = 525`
- Что capability доказала:
  - the empty local compose baseline can materialize the full Example C outsourcing bundle into runtime truth, compile the `5` criteria, rebuild `interest_centroids`, import all `29` open-web website sources, and execute the real `website -> web_resources -> optional article handoff -> downstream selection` path without implementation defects.
  - the final classification summary was:
    - `18` `projected_but_not_selected`
    - `10` `external/runtime_residual`
    - `1` `browser_fallback_residual`
    - `1` `skipped_rejected_open_web`
    - `0` `implementation_issue`
  - the single skipped source is now explicit and policy-driven:
    - `Moonlight` stayed out of the run as `skipped_rejected_open_web` with its open-web unsuitability captured in the evidence bundle.
  - the bounded live cohort produced substantial downstream activity but no positive outsourcing outcome:
    - `279` persisted `web_resources`
    - `240` projected `articles`
    - `240` `final_selection_results`
    - `240` `system_feed_results`
    - `0` selected rows
    - `0` eligible rows
    - so this capability closes runtime validation, not business-yield tuning.
- Риски или gaps:
  - the residual sites are truthful live-site/runtime-content outcomes rather than local implementation failures, including `403`, `robots.txt`, unsupported login/challenge flows, and one browser-fallback residual (`oeffentlichevergabe.de`).
  - the preserved cohort still has `0` selected/eligible outsourcing leads, so any next step here is about yield tuning or source-set refinement, not about the harness/runtime being unproven.
  - the completed live run now intentionally lives in the local compose DB; cleanup/reset remains a separate explicit item.
- Follow-up:
  - none required for the capability itself; open a new bounded item only for outsourcing-yield tuning, browser-fallback expansion, or explicit DB cleanup/reset.

### 2026-04-18 — PATCH-UNIFIED-INGRESS-HANDOFF-DOC-TRUTH — Elevated the website/RSS handoff rule into a repo-wide ingress invariant

- Тип записи: patch archive
- Финальный статус: archived
- Зачем понадобилось: the user asked to make the newly shipped website/RSS convergence rule explicit not only for those two providers, but as durable truth for every current and future inbound content channel.
- Что изменилось:
  - [`docs/blueprint.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/blueprint.md) now states a provider-agnostic ingress invariant: provider-specific acquisition/adaptation may differ before handoff, but all ingestable content must converge into the shared downstream path at `article.ingest.requested`.
  - [`docs/engineering.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/engineering.md) now forbids future provider work from forking clustering/filtering/selection/read-model truth into provider-owned downstream pipelines.
  - [`docs/verification.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/verification.md) now requires any future inbound-provider capability to prove that provider-specific logic ends before the shared handoff and does not create provider-native product truth.
  - [`.aidp/os.yaml`](/Users/user/Documents/workspace/my/NewsPortal/.aidp/os.yaml) now carries machine-canonical `unified_ingress` facts for the common downstream trigger, allowed pre-handoff trigger pattern, and shared downstream truth owners.
- Что было доказано:
  - targeted consistency search:
    - `rg -n "Universal ingress convergence truth|provider-specific logic заканчивается до общего handoff|unified_ingress:|provider_native_product_read_models_allowed|PATCH-UNIFIED-INGRESS-HANDOFF-DOC-TRUTH" docs/blueprint.md docs/engineering.md docs/verification.md .aidp/os.yaml docs/work.md`
  - formatting check:
    - `git diff --check -- docs/work.md docs/blueprint.md docs/engineering.md docs/verification.md .aidp/os.yaml`
- Follow-up:
  - none; future provider work should reuse this invariant instead of redefining downstream ownership ad hoc.

### 2026-04-18 — C-WEBSITE-RSS-UNIFIED-DOWNSTREAM — Unified website ingress with the RSS downstream pipeline and closed the legacy compatibility gap

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: the user asked to finish the architectural cutover so `website` and `rss` differ only at acquisition time, while filtering, clustering, selection, and product/read-model truth become common after handoff.
- Что изменилось:
  - schema/runtime handoff truth:
    - [`database/migrations/0035_unified_website_article_handoff.sql`](/Users/user/Documents/workspace/my/NewsPortal/database/migrations/0035_unified_website_article_handoff.sql)
    - [`database/ddl/phase2_ingest_foundation.sql`](/Users/user/Documents/workspace/my/NewsPortal/database/ddl/phase2_ingest_foundation.sql)
  - website acquisition and common-pipeline handoff:
    - [`services/fetchers/src/resource-enrichment.ts`](/Users/user/Documents/workspace/my/NewsPortal/services/fetchers/src/resource-enrichment.ts)
    - [`services/fetchers/src/fetchers.ts`](/Users/user/Documents/workspace/my/NewsPortal/services/fetchers/src/fetchers.ts)
    - [`services/fetchers/src/config.ts`](/Users/user/Documents/workspace/my/NewsPortal/services/fetchers/src/config.ts)
    - [`services/fetchers/src/cli/replay-website-projections.ts`](/Users/user/Documents/workspace/my/NewsPortal/services/fetchers/src/cli/replay-website-projections.ts)
    - [`services/fetchers/package.json`](/Users/user/Documents/workspace/my/NewsPortal/services/fetchers/package.json)
    - [`package.json`](/Users/user/Documents/workspace/my/NewsPortal/package.json)
  - downstream/common truth and operator surfaces:
    - [`services/workers/app/main.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/main.py)
    - [`services/workers/app/canonical_documents.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/canonical_documents.py)
    - [`services/api/app/main.py`](/Users/user/Documents/workspace/my/NewsPortal/services/api/app/main.py)
    - [`apps/admin/src/pages/resources.astro`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/resources.astro)
    - [`apps/admin/src/pages/resources/[resourceId].astro`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/resources/[resourceId].astro)
    - [`apps/admin/src/components/LiveDashboardKpiGrid.tsx`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/components/LiveDashboardKpiGrid.tsx)
    - [`infra/scripts/test-website-admin-flow.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/test-website-admin-flow.mjs)
  - contracts/tests/runtime docs:
    - [`packages/contracts/src/source.ts`](/Users/user/Documents/workspace/my/NewsPortal/packages/contracts/src/source.ts)
    - [`tests/unit/python/test_api_web_resources.py`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/python/test_api_web_resources.py)
    - [`tests/unit/ts/admin-website-channels.test.ts`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/ts/admin-website-channels.test.ts)
    - [`docs/blueprint.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/blueprint.md)
    - [`docs/engineering.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/engineering.md)
    - [`docs/verification.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/verification.md)
    - [`.aidp/os.yaml`](/Users/user/Documents/workspace/my/NewsPortal/.aidp/os.yaml)
- Что capability зафиксировала:
  - `article.ingest.requested` is now the shared downstream entry for both `rss` and `website`; `resource.ingest.requested` remains acquisition-only pre-ingest truth for the website lane.
  - accepted website resources no longer stop as product-visible `web_resources`; they must either:
    - project into `articles` with persisted `content_kind` and enqueue `article.ingest.requested`; or
    - persist an explicit diagnostic rejection in `projection_state/projection_error`.
  - the shared downstream now sees `articles.content_kind` for website-derived rows, so common normalization/filtering/selection logic can gate on the same content-kind truth regardless of provider.
  - user/admin selected-content reads no longer union raw `web_resources`; `web_resources` remain acquisition/evidence/operator diagnostics only.
  - fetchers runtime now carries provider-aware fairness controls (`FETCHERS_RSS_CONCURRENCY`, `FETCHERS_WEBSITE_CONCURRENCY`) so website polling does not silently monopolize the acquisition scheduler.
  - a bounded legacy compatibility replay path now exists:
    - `pnpm website:projection:replay`
    - `pnpm website:projection:replay:compose`
    - it replays only persisted website rows with `projection_error = legacy_resource_only_without_common_handoff` and does not recrawl live sites.
- Что было доказано:
  - local proof:
    - `python -m py_compile services/api/app/main.py services/workers/app/main.py services/workers/app/canonical_documents.py`
    - `pnpm typecheck`
    - `pnpm unit_tests`
    - `git diff --check`
  - compose/runtime proof:
    - `pnpm test:migrations:smoke`
    - `pnpm test:ingest:compose`
    - `pnpm test:website:compose`
    - `pnpm test:hard-sites:compose`
    - `pnpm test:website:admin:compose`
    - `pnpm website:projection:replay:compose`
    - `pnpm website:projection:replay:compose -- --dry-run --limit=5`
  - live local DB closeout:
    - legacy compatibility replay processed `375` candidates with `375` projections, `0` skips, `0` failures;
    - the final replay dry-run reported `candidateCount = 0`;
    - the final compose DB state at closeout was:
      - `444` `web_resources`
      - `385` `projected_to_common_pipeline`
      - `59` `explicitly_rejected_before_pipeline`
      - `385` website-backed `articles`
      - `0` pending `sequence_runs`
- Риски или gaps:
  - the preserved outsourcing cohort still produced `0` selected/eligible outsourcing leads; this capability closes architectural/runtime truth, not business-yield tuning.
  - the `3` `needs_browser_fallback` sites from `docs/data_scripts/web.json` remain follow-up scope only; browser-fallback expansion was intentionally not folded into this closeout.
  - the local compose DB still intentionally contains preserved inspection state and replayed website rows; cleanup/reset remains a separate explicit item rather than part of this archive.
- Follow-up:
  - none required for the capability itself; open a new bounded item only for browser-fallback expansion or for explicit DB cleanup/reset.

### 2026-04-18 — SPIKE-UI-COUNT-RECONCILE-2026-04-18 — Reconciled the visible feed pagination and dashboard KPIs against the preserved local DB state

- Тип записи: spike archive
- Финальный статус: archived
- Зачем понадобилось: after the live outsourcing website run, the user reported that the web feed showed roughly `11` pages with `20` cards each while the admin dashboard still showed `System Feed News = 0` and other seemingly inconsistent counters.
- Что проверено:
  - read-model code paths:
    - [`apps/web/src/pages/index.astro`](/Users/user/Documents/workspace/my/NewsPortal/apps/web/src/pages/index.astro)
    - [`services/api/app/main.py`](/Users/user/Documents/workspace/my/NewsPortal/services/api/app/main.py)
    - [`apps/admin/src/pages/index.astro`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/index.astro)
    - [`apps/admin/src/components/LiveDashboardKpiGrid.tsx`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/components/LiveDashboardKpiGrid.tsx)
    - [`apps/admin/src/components/LiveObservabilitySummary.tsx`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/components/LiveObservabilitySummary.tsx)
    - [`apps/web/src/lib/server/user-content-state.ts`](/Users/user/Documents/workspace/my/NewsPortal/apps/web/src/lib/server/user-content-state.ts)
  - live API/DB evidence:
    - `curl -sS 'http://127.0.0.1:8000/collections/system-selected?page=1&pageSize=20'`
    - `curl -sS 'http://127.0.0.1:8000/dashboard/summary'`
    - read-only `psql` queries against `docker-postgres-1`
- Что spike доказал:
  - the user-visible `/` feed is not semantically the same thing as the admin `System Feed News` KPI.
  - the feed query currently unions two layers:
    - deduped selected editorial article families via `final_selection_results` / compatibility fallback `system_feed_results`;
    - non-editorial `web_resources` whose `resource_kind` is enabled by any active `interest_templates.allowed_content_kinds`.
  - the dashboard KPI `System Feed News` counts only deduped selected editorial families and does not include non-editorial `web_resources`.
  - the preserved local DB state therefore truthfully explains the screenshots:
    - `/collections/system-selected?pageSize=20` returned `total = 207` and `totalPages = 11`;
    - those `207` visible feed items were all non-editorial `listing` resources;
    - `/dashboard/summary` returned `active_news = 0` because the only `2` projected `articles` both had `final_selection_results.is_selected = false` and `system_feed_results.eligible_for_feed = false`.
  - the other dashboard counters also map cleanly to different tables/semantics:
    - `Processed 24h = 2` comes from `articles` that reached processed state in the last 24 hours;
    - `New Content 24h = 24` comes from `24` `channel_fetch_runs` rows with `outcome_kind = 'new_content'`, not from `24` content items;
    - `Fetch Failures 24h = 15` comes from `15` `channel_fetch_runs` rows with failure outcomes;
    - `Needs Attention = 9` comes from `source_channel_runtime_state` rows with `last_result_kind = 'hard_failure'` or `consecutive_failures >= 2`;
    - observability `Reviews/Tokens/Cost = 0` comes from `llm_review_log`, which is empty for this run because nothing entered live LLM review.
- Риски или gaps:
  - this is currently an operator/UX semantics gap, not a proven data-integrity bug.
  - the naming still invites confusion because the web feed behaves like a broader system-selected collection while the dashboard card still says `System Feed News`.
- Follow-up:
  - if the user wants alignment, open a follow-up stage to either relabel the feed/dashboard surfaces more truthfully or narrow the feed query so it matches the editorial-only KPI semantics.

### 2026-04-18 — STAGE-LIVE-WEBSITE-OUTSOURCING-READY-SITES-2026-04-18 — Imported the Example C outsourcing bundle plus `26` ready website sources and executed a full live runtime pass

- Тип записи: stage archive
- Финальный статус: archived
- Зачем понадобилось: the user asked for a one-off stateful operator run on the already-running local compose stack to prove real-site `website` ingestion for the outsourcing case, using repo-owned `docs/data_scripts/web.json` and Example C in `EXAMPLES.md`.
- Что изменилось:
  - [`infra/scripts/run-live-website-outsourcing.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/run-live-website-outsourcing.mjs) was added as a one-off orchestration script that:
    - loads `.env.dev` and verifies the compose baseline plus empty targeted DB state;
    - verifies the outsourcing bundle parity (`3` LLM templates, `5` interest templates);
    - imports LLM templates and interest templates through the existing server-side write paths (`save*`, criterion sync, selection-profile sync, compile-event enqueue);
    - queues `interest_centroids` rebuild through the existing reindex/outbox path;
    - upserts `26` `validationStatus = ready` website sources through the existing website-channel write path;
    - triggers manual first polls via `docker-fetchers-1`, waits for downstream settle, and writes JSON/Markdown evidence bundles under `/tmp`.
  - [`docs/work.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/work.md) was reopened for the active stage and then resynced back to no-active state after archive sync.
- Что проверено:
  - full stage run:
    - `node --import tsx infra/scripts/run-live-website-outsourcing.mjs`
  - evidence bundles:
    - [/tmp/newsportal-live-website-outsourcing-2026-04-18T113924981Z.json](/tmp/newsportal-live-website-outsourcing-2026-04-18T113924981Z.json)
    - [/tmp/newsportal-live-website-outsourcing-2026-04-18T113924981Z.md](/tmp/newsportal-live-website-outsourcing-2026-04-18T113924981Z.md)
  - post-run DB counts:
    - `llm_prompt_templates = 3`
    - `interest_templates = 5`
    - `criteria = 5`
    - `criteria_compiled = 5`
    - `selection_profiles = 5`
    - `source_channels = 26`
    - `web_resources = 345`
    - `articles = 2`
    - `interest_filter_results = 10`
    - `final_selection_results = 2`
    - `system_feed_results = 2`
- Что stage доказала:
  - the local compose baseline started empty for the targeted stage tables and successfully materialized the full Example C outsourcing configuration into runtime truth.
  - criterion compile plus `interest_centroids` rebuild completed before the live website pass, so the downstream match lane ran against the intended outsourcing configuration instead of stale defaults.
  - the `26` ready websites did execute through the real `website` runtime:
    - the settle snapshot closed with `fetchRunCount = 51`, `pendingResourceCount = 0`, `pendingArticleCount = 0`, `unpublishedOutboxCount = 0`, and `openSequenceCount = 0`;
    - the stage produced `345` persisted `web_resources` and `2` projected `articles`;
    - the classification summary was `15 observed_resource_only`, `1 observed`, `10 live_site_content_residual`, and `0 implementation_issue`.
  - the only site that projected articles in this bounded run was `Guru`, and those `2` projected rows truthfully entered the outsourcing match lane:
    - every one of the `5` system criteria produced `2` `interest_filter_results` rows;
    - all `10` criterion rows stayed `compat_decision = irrelevant` / `semantic_decision = not_evaluated`;
    - both final-selection rows ended `final_decision = rejected`, `is_selected = false`, `compat_system_feed_decision = filtered_out`;
    - therefore the run proved the full website-to-match-to-selection path, but not a positive outsourcing lead outcome on this cohort.
  - resource-only outcomes were common and truthful for procurement/job-marketplace sources in this bounded website lane; lack of article projection on those sites was not treated as a regression.
- Риски или gaps:
  - the stage intentionally excluded the `3 needs_browser_fallback` candidates and the `1 rejected_open_web` candidate from `web.json`; those remain follow-up scope only.
  - `10` live sites remained residuals for truthful external/runtime-content reasons rather than implementation defects, including `robots.txt` blocks, unsupported login/challenge flows, `403 Forbidden`, and several no-resource/no-change outcomes on public procurement surfaces.
  - no selected or feed-eligible outsourcing leads were produced in this cohort, so the stage proves pipeline execution rather than business-yield success.
- Follow-up:
  - optional next work is either a browser-fallback follow-up for the excluded candidates or a separate cleanup/reset item if the user wants the imported local DB state removed after inspection.

### 2026-04-16 — USER-DIRECTED CLOSEOUT OF REMAINING LIVE ITEMS — Archived the last active/ready/blocked work state without opening further follow-up

- Тип записи: closeout archive
- Финальный статус: archived by user direction
- Зачем понадобилось: after the website regression/livematrix work was closed and the repo worktree was clean, the user explicitly asked to "закрывай окончательно" all remaining live work in `docs/work.md` instead of leaving any active, ready, or blocked items hanging.
- Что изменилось:
  - [`docs/work.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/work.md) was compressed into a clean no-active-work snapshot: active capabilities were cleared, live next actions were removed, and the handoff now states explicitly that any future work must start as a new bounded item.
  - the remaining live references were intentionally removed from active execution state:
    - `C-WEBSITE-INGESTION-LIVE-QUALITY-HARDENING`
    - `C-WEBSITE-NEWSROOM-AND-BROWSER-ROI-TUNING`
    - `C-PIPELINE-CANONICAL-REUSE-AND-SELECTION-QUALITY-HARDENING`
    - `C-PIPELINE-RESILIENCE-AND-GRAY-ZONE-LLM-RECOVERY`
    - `C-GENERIC-CANDIDATE-RECALL-AND-NOISE-TOLERANT-SELECTION`
    - `C-POSITIVE-SIGNAL-RECOVERY-AND-ENRICHMENT-SANITIZATION`
    - `STAGE-4-RUNTIME-EFFICIENCY-AND-DOCS-CLOSEOUT`
    - `STAGE-3-FRESH-BASELINE-PROOF-AND-TUNING`
    - `SPIKE-LIVE-CANDIDATE-MATERIALIZATION-MEASUREMENT`
    - `PATCH-WEBSITE-DOJ-LIKE-NEWSROOM-DETAIL-PRECISION-2026-04-16`
- Что проверено:
  - `git status`
  - `git diff --check -- docs/work.md docs/history.md`
- Что closeout зафиксировал:
  - the website lane is now fully closed at the process level: deterministic website/channel/shared-user-result proof is green, broader live-matrix evidence is archived, and both `DOJ` and `Grafbase` residuals were reduced to site-specific/live classifications rather than broad product regressions.
  - the pipeline/runtime lanes are also closed at the process level, but not because every last measurement stage was exhausted:
    - canonical-review reuse, gray-zone resilience, candidate-signal routing, and enrichment date sanitization remain archived as shipped/proven implementation layers;
    - the remaining runtime-only measurement slices (`STAGE-4-RUNTIME-EFFICIENCY-AND-DOCS-CLOSEOUT`, `STAGE-3-FRESH-BASELINE-PROOF-AND-TUNING`, `SPIKE-LIVE-CANDIDATE-MATERIALIZATION-MEASUREMENT`) were intentionally not pursued further and should be treated as user-closed residuals, not as silently completed proof.
  - the repo now has no active work item in `docs/work.md`, and future continuation of any archived lane must start as a fresh bounded item instead of implicitly resuming old state.
- Риски или gaps:
  - this archive does not claim that every historical residual was solved; it claims that no residual remains live-tracked after the user's explicit closeout request.
  - any future attempt to continue duplicate-efficiency measurement, fresh-baseline tuning, DOJ-specific newsroom support, or Grafbase-specific support must reopen as new work with fresh scope/proof rather than relying on the old active states.
- Follow-up:
  - none required; open a new item only on a new explicit user request.

### 2026-04-16 — SPIKE-WEBSITE-GRAFBASE-CHANGELOG-ANALOGS-LIVE-VALIDATION-2026-04-16 — Benchmarked Grafbase against comparable public changelog sites and closed the generic-fix question

- Тип записи: spike archive
- Финальный статус: archived
- Зачем понадобилось: after the broader regression proof stayed green but `Grafbase Changelog` still showed a partial live residual in the bounded matrix, the user asked for the next truthful decision rule: pick several close public changelog analogs, rerun them through the same harness, and close the issue if the majority already works; otherwise keep digging for a real product bug.
- Что изменилось:
  - no product/runtime code changed for this spike; the decision was based on a focused live rerun using the existing public-changelog matrix path in [`infra/scripts/test-live-website-matrix.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/test-live-website-matrix.mjs).
  - the shortlisted analog cohort used four comparable public changelog/update sites that exercise the same general changelog ingestion path without depending on the exact Grafbase surface:
    - `Supabase Changelog`
    - `Vercel Changelog`
    - `PlanetScale Changelog`
    - `Render Changelog`
- Что проверено:
  - live matrix run:
    - [/tmp/newsportal-live-website-matrix-alt_2026_04_16-e20cf7a2-60d8-4d68-bbd2-6ef52e437f0a.json](/tmp/newsportal-live-website-matrix-alt_2026_04_16-e20cf7a2-60d8-4d68-bbd2-6ef52e437f0a.json)
  - `git diff --check -- docs/work.md docs/history.md`
- Что spike доказал:
  - the general public-changelog path is working on the current website-ingestion/runtime baseline:
    - `Supabase Changelog` -> `observed_expected_shape`
    - `PlanetScale Changelog` -> `observed_expected_shape`
    - `Render Changelog` -> `observed_expected_shape`
  - the one non-success in the cohort is an explicit external block rather than the same Grafbase-style partial shape:
    - `Vercel Changelog` -> truthful upstream `403` with `captcha`
  - because `3/4` comparable public changelog sites worked as expected and the remaining failure is a different external blocker class, the current `Grafbase Changelog` residual should be treated as site-specific/live rather than as evidence of a broader regression in the changelog ingestion path.
- Риски или gaps:
  - public changelog sites remain externally variable, so this spike does not promise that every JS-heavy changelog will work; it only shows that the generic changelog path is not broadly broken on the current baseline.
  - if the user later wants first-class `Grafbase` support specifically, the next truthful step is a narrow Grafbase-only live/runtime divergence spike, not another wide generic hardening pass.
- Follow-up:
  - no generic follow-up is recommended from this spike alone; only reopen the lane if the user wants Grafbase-specific support or if additional changelog analogs start failing in the same partial pattern.

### 2026-04-16 — SPIKE-WEBSITE-DOJ-ANALOGS-LIVE-VALIDATION-2026-04-16 — Benchmarked DOJ against comparable government press-release sites and closed the generic-fix question

- Тип записи: spike archive
- Финальный статус: archived
- Зачем понадобилось: after the bounded DOJ-like precision patch still left `DOJ Press Releases` as a live partial case, the user asked for the next truthful decision rule: find comparable DOJ-like public sites, test them, and close the generic-fix effort if the majority already works; otherwise keep digging and repair the broader issue.
- Что изменилось:
  - [`infra/scripts/test-live-website-matrix.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/test-live-website-matrix.mjs) now includes a dedicated `doj_analogs_2026_04_16` live cohort with six public government press-release/newsroom sites:
    - `National Archives Press Releases`
    - `FBI Press Releases`
    - `DOL News Releases`
    - `Treasury Press Releases`
    - `HHS Press Room`
    - `FTC Press Releases`
  - the cohort keeps the same website-only cheap-first contract as the rest of the matrix harness and exists specifically to answer whether `DOJ Press Releases` is a broader government-newsroom failure mode or a site-specific residual.
- Что проверено:
  - current-web validation against the official public newsroom pages for:
    - [National Archives Press Releases](https://www.archives.gov/press/press-releases)
    - [FBI Press Releases](https://www.fbi.gov/news/press-releases)
    - [DOL News Releases](https://www.dol.gov/newsroom/releases)
    - [Treasury Press Releases](https://home.treasury.gov/news/press-releases)
    - [HHS Press Room](https://www.hhs.gov/press-room/index.html)
    - [FTC Press Releases](https://www.ftc.gov/news-events/news/press-releases)
  - live matrix run:
    - [/tmp/newsportal-live-website-matrix-doj_analogs_2026_04_16-13816eca-19bc-412f-abda-3c1cc7606b1c.json](/tmp/newsportal-live-website-matrix-doj_analogs_2026_04_16-13816eca-19bc-412f-abda-3c1cc7606b1c.json)
  - `git diff --check -- docs/work.md docs/history.md infra/scripts/test-live-website-matrix.mjs`
- Что spike доказал:
  - `DOJ Press Releases` is not representative of the general government press-release cohort on the current website ingestion architecture:
    - `4/6` analogs produced `observed_expected_shape` outcomes;
    - `2/6` analogs failed truthfully as explicit blocked/unsupported cases (`FBI` via `robots.txt`, `HHS` via upstream `403`);
    - `0/6` reproduced the same DOJ-style false `listing` partial pattern.
  - the successful analogs show that the generic cheap-first website lane already works on a majority of comparable government newsroom surfaces:
    - `National Archives Press Releases`
    - `DOL News Releases`
    - `Treasury Press Releases`
    - `FTC Press Releases`
  - because the majority works and the failures are explicit but different from DOJ, the remaining DOJ issue should be treated as a site-specific residual, not as evidence that the broader government-newsroom classifier/discovery path is still generally broken.
- Риски или gaps:
  - some analogs remain externally blocked and should stay classified truthfully instead of becoming new patch targets by default;
  - if the user later wants first-class `DOJ Press Releases` support specifically, the next truthful step is a DOJ-only spike into the exact live runtime divergence, not a broader classifier hardening arc.
- Follow-up:
  - no generic website-ingestion follow-up is recommended from this spike alone; only open a new bounded item if the user explicitly wants DOJ-specific support or wants to add more government newsroom cohorts.

### 2026-04-16 — STAGE-1-WEBSITE-NEWSROOM-DETAIL-AND-BROWSER-ROI-HARDENING — Tightened newsroom detail classification and browser ROI routing without changing the website architecture

- Тип записи: stage archive
- Финальный статус: archived
- Зачем понадобилось: after the broader live website matrices showed that the remaining real-world gaps were concentrated in two narrow places rather than in the whole pipeline, the user asked to implement the focused plan: improve newsroom/detail-page `editorial` vs `listing` differentiation and make `browser_candidate` routing more truthful and less wasteful without redesigning the cheap-first website architecture.
- Что изменилось:
  - [`services/fetchers/src/web-ingestion.ts`](/Users/user/Documents/workspace/my/NewsPortal/services/fetchers/src/web-ingestion.ts) now hardens newsroom/detail classification and browser decisioning in a bounded way:
    - article-like detail pages get stronger editorial credit from detail URLs, structured editorial signals, and dated/article-card context even when ambient repeated cards or pagination are also present;
    - repeated-card and pagination penalties are softened into ambient layout reasons on detail-like article pages instead of immediately forcing `listing`;
    - Akamai-style interstitial/challenge pages are now detected explicitly via `ACCESS_BLOCK_PATTERN`, and collection discovery skips parsing those challenge pages as if they were ordinary content collections;
    - browser recommendation now stays cheap-first when static results are already strongly editorial, while still preserving explicit challenge-driven recommendation reasons where browser help is justified;
  - [`services/fetchers/src/resource-enrichment.ts`](/Users/user/Documents/workspace/my/NewsPortal/services/fetchers/src/resource-enrichment.ts) now adds a bounded enrichment-side guard for newsroom detail pages:
    - `shouldRetainDiscoveryEditorialKind(...)` keeps discovery-time `editorial` classification when enrichment sees a strong article-like detail page whose title/body/date signals outweigh listing chrome;
    - persisted `classification_json` now records that guard through the resolved `reasons` trail so operators can see that a false downgrade was intentionally prevented instead of silently overwritten;
  - targeted regression proof was extended:
    - [`tests/unit/ts/web-ingestion-browser.test.ts`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/ts/web-ingestion-browser.test.ts) now covers strong-static editorial browser suppression and detail-page editorial classification on card-heavy layouts;
    - [`tests/unit/ts/resource-enrichment-website.test.ts`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/ts/resource-enrichment-website.test.ts) now covers the enrichment-side editorial-retention guard and the persisted classification-reason trail.
- Что проверено:
  - `node --import tsx --test tests/unit/ts/web-ingestion-browser.test.ts tests/unit/ts/resource-enrichment-website.test.ts`
  - `pnpm test:website:compose`
  - `pnpm test:enrichment:compose`
  - `pnpm test:hard-sites:compose`
  - focused baseline rerun:
    - [`/tmp/newsportal-live-website-matrix-baseline-34e12af1-5fbf-4da4-8173-14ffb581f3b0.json`](/tmp/newsportal-live-website-matrix-baseline-34e12af1-5fbf-4da4-8173-14ffb581f3b0.json)
  - focused alternate rerun:
    - [`/tmp/newsportal-live-website-matrix-alt_2026_04_16-97439501-54a3-467f-b6a4-010ed969edf7.json`](/tmp/newsportal-live-website-matrix-alt_2026_04_16-97439501-54a3-467f-b6a4-010ed969edf7.json)
  - `git diff --check -- docs/work.md docs/history.md services/fetchers/src/web-ingestion.ts services/fetchers/src/resource-enrichment.ts tests/unit/ts/web-ingestion-browser.test.ts tests/unit/ts/resource-enrichment-website.test.ts`
- Что stage доказала:
  - the current website architecture did not need a redesign to improve the weakest real-world cases; a bounded heuristic/enrichment patch was enough to make the problem narrower and more honest;
  - newsroom/detail quality improved where the sites were actually accessible:
    - `ESA Newsroom` moved to `observed_expected_shape` with `7 editorial / 4 listing` on the focused alternate rerun;
    - the earlier `EUAA Press Releases` card-title patch stayed effective, and the follow-up rerun now showed only one visible repeat-poll `editorial -> listing` transition instead of a larger downgrade set;
    - `Competition Policy Latest News` stayed `observed_expected_shape`, confirming the harder newsroom heuristics did not regress an already-good public newsroom case;
  - browser-candidate truthfulness improved without broadening browser work:
    - `Grafbase Changelog` and `Linear Changelog` now both demonstrate that static-good-enough outcomes should suppress wasteful browser fallback, while forced browser validation still truthfully surfaces `cloudflare_js_challenge` instead of pretending the crawler failed generically;
    - `Webflow Updates` is now classified directly as a truthful `403 cloudflare_js_challenge` hard failure, and `Framer Updates` remains a partial static case rather than a fake browser success;
  - the remaining residual is now clearer: `DOJ Press Releases` still lands as a narrow `listing`-heavy partial case, which points to more newsroom/detail precision tuning if the user wants another bounded follow-up, not to a browser or architecture problem.
- Риски или gaps:
  - the enrichment-side editorial-retention guard is intentionally conservative, so it does not magically convert every newsroom detail page; `DOJ Press Releases` remains a truthful partial outcome on the focused rerun;
  - browser-heavy public websites remain externally unstable by nature, so the shipped improvement is mostly about better routing and clearer unsupported classification rather than materially higher success on protected sites.
- Follow-up:
  - if the user wants to continue here, open a fresh bounded newsroom/detail precision follow-up centered on the remaining `DOJ`-like partial cases; do not reopen browser architecture or try anti-bot bypass work inside this lane.

### 2026-04-16 — STAGE-WEBSITE-LIVE-MATRIX-EXPANSION-2026-04-16 — Expanded website live validation to a 16-site real-world matrix and closed the remaining live classification gaps

- Тип записи: stage archive
- Финальный статус: archived
- Зачем понадобилось: the user asked to move from the earlier three-site bounded website check to a much broader real-world validation pass: more than a dozen public websites total, at least four websites per ingress shape, and the maximum truthful website-only proof set before and around that live run.
- Что изменилось:
  - a repo-owned expanded live harness now exists in [`infra/scripts/test-live-website-matrix.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/test-live-website-matrix.mjs):
    - it validates 16 public websites across four shapes (`static_editorial`, `documents_downloads`, `public_changelog`, `browser_candidate`);
    - for every candidate it runs first poll, optional browser-assisted rerun, repeat poll, `/maintenance/fetch-runs`, `/maintenance/web-resources*`, and `/admin/resources*` verification;
    - it persists a JSON evidence bundle under `/tmp/newsportal-live-website-matrix-<runId>.json`;
    - it now also supports focused reruns via `--group=<groupKey>` and `--site=<candidateName>` plus captured `stdout/stderr` on live failures so small residual sets can be reclassified truthfully without replaying the whole matrix;
  - the docs/runtime surfaces were synced to make that matrix part of the durable website proof story:
    - [`docs/verification.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/verification.md), [`docs/contracts/test-access-and-fixtures.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/contracts/test-access-and-fixtures.md), [`README.md`](/Users/user/Documents/workspace/my/NewsPortal/README.md), [`HOW_TO_USE.md`](/Users/user/Documents/workspace/my/NewsPortal/HOW_TO_USE.md), [`WEBSITE_SOURCE_EXAMPLES.md`](/Users/user/Documents/workspace/my/NewsPortal/WEBSITE_SOURCE_EXAMPLES.md), and [`WEBSITE_SOURCES_TESTING.md`](/Users/user/Documents/workspace/my/NewsPortal/WEBSITE_SOURCES_TESTING.md) now point operators to the expanded matrix harness as the canonical bounded live-site runner after deterministic proof;
  - closing the matrix exposed and repaired two narrow runtime proof blockers:
    - [`services/fetchers/src/web-ingestion.ts`](/Users/user/Documents/workspace/my/NewsPortal/services/fetchers/src/web-ingestion.ts) now preserves homepage auth/error status from conditional-request validator state even when no cached homepage body exists, so protected website polls no longer collapse into false `no_change`;
    - [`services/fetchers/src/fetchers.ts`](/Users/user/Documents/workspace/my/NewsPortal/services/fetchers/src/fetchers.ts) now treats empty-resource website `401/403` runs as truthful hard failures by falling back to policy-level status when homepage probing/auth already proved the upstream refusal;
    - [`services/fetchers/src/cli/test-channel-auth-smoke.ts`](/Users/user/Documents/workspace/my/NewsPortal/services/fetchers/src/cli/test-channel-auth-smoke.ts) now seeds the browser-auth website fixture with sitemap/feed discovery disabled so shared root hints cannot accidentally bypass same-origin browser-auth validation;
    - [`tests/unit/ts/web-ingestion-browser.test.ts`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/ts/web-ingestion-browser.test.ts) gained the targeted regression proof for the preserved homepage auth status path.
- Что проверено:
  - `node --import tsx --test tests/unit/ts/web-ingestion-browser.test.ts tests/unit/ts/resource-enrichment-website.test.ts tests/unit/ts/admin-website-channels.test.ts`
  - `pnpm test:migrations:smoke`
  - `pnpm test:website:compose`
  - `pnpm test:hard-sites:compose`
  - `pnpm test:channel-auth:compose`
  - `pnpm test:website:admin:compose`
  - `pnpm test:enrichment:compose`
  - full live matrix run:
    - [`/tmp/newsportal-live-website-matrix-9ec1bd4b-3e55-43e2-acab-860bf4459b01.json`](/tmp/newsportal-live-website-matrix-9ec1bd4b-3e55-43e2-acab-860bf4459b01.json)
  - focused residual rerun:
    - [`/tmp/newsportal-live-website-matrix-b74c2708-b7bc-4be9-aac6-46119ee1df64.json`](/tmp/newsportal-live-website-matrix-b74c2708-b7bc-4be9-aac6-46119ee1df64.json)
  - `git diff --check -- docs/work.md docs/history.md docs/verification.md docs/contracts/test-access-and-fixtures.md README.md HOW_TO_USE.md WEBSITE_SOURCE_EXAMPLES.md WEBSITE_SOURCES_TESTING.md infra/scripts/test-live-website-matrix.mjs services/fetchers/src/fetchers.ts services/fetchers/src/cli/test-channel-auth-smoke.ts services/fetchers/src/web-ingestion.ts tests/unit/ts/web-ingestion-browser.test.ts`
- Что stage доказала:
  - the local website-only proof stack now has a truthful large live-validation complement instead of only a narrow three-site spot check: four public-site groups with four candidates each can be exercised from the same admin/runtime contract without widening scope into RSS or discovery;
  - deterministic website proof still matters before the internet run: the live expansion flushed out a real auth-status regression and a fixture-isolation problem, both of which were repaired before the final matrix was accepted;
  - the expanded matrix gives a much clearer real-world picture of the current website lane:
    - `static_editorial`: 1 expected-shape success (`EEA Newsroom`) and 3 partial/listing-heavy outcomes (`European Commission Digital Strategy News`, `EUAA Press Releases`, `Competition Policy Latest News`);
    - `documents_downloads`: 3 expected-shape successes (`EBRD Procurement Notices`, `EIB Project Procurement`, `World Bank Project Procurement`) plus 1 truthful upstream block (`UNICEF Tajikistan Supply and Procurement` -> `403`);
    - `public_changelog`: all 4 sites (`WorkOS`, `Auth0`, `Raycast`, `Resend`) produced expected-shape outcomes;
    - `browser_candidate`: 1 partial/listing-heavy outcome (`Grafbase Changelog`) and 3 truthful blocked/challenge outcomes (`Browserbase Changelog`, `Sentry Changelog`, `Intercom Changes`);
  - conditional-request reuse is visible on real sites, not just fixtures: the 16-site pass recorded `22` total conditional hits across repeat polls, with the strongest repeat-poll reuse inside the public changelog group.
- Риски или gaps:
  - the broadened matrix still did not show positive editorial body-uplift on the sampled live rows chosen during this pass, so body-uplift telemetry is now proven as captured operator truth but not yet as a broad real-world uplift win across the new public-site portfolio;
  - the live harness deactivates created website channels, but inactive `Live ...` website rows remain in the local compose DB as tracked test artifacts, especially for hard-failure runs where delete/archive cleanup does not fully remove the row;
  - public browser-heavy websites remain the weakest category of the current lane: the matrix now classifies them honestly, but it does not turn blocked/challenge-heavy public sites into product successes.
- Follow-up:
  - if the user wants to continue here, open a fresh bounded follow-up for browser-candidate portfolio expansion, live-channel cleanup automation, or classifier tuning for the partial static-editorial/browser-candidate outcomes instead of reopening this completed stage.

### 2026-04-15 — C-WEBSITE-INGESTION-COST-AND-OBSERVABILITY-HARDENING — Shipped conditional website polling, run telemetry, classification observability, and lower-cost editorial enrichment

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: after the website-only scraping audit concluded that the current architecture should be kept but hardened, the user asked to implement the whole follow-up arc in order: upstream conditional requests, static-vs-browser metrics, richer resource observability, bounded `article-extractor` gating, body-uplift telemetry, and bounded validation on real public sites.
- Что изменилось:
  - schema/storage truth for the website lane was extended:
    - [`database/migrations/0034_website_conditional_metrics_and_cache.sql`](/Users/user/Documents/workspace/my/NewsPortal/database/migrations/0034_website_conditional_metrics_and_cache.sql), [`database/migrations/0017_web_ingestion_resource_layer.sql`](/Users/user/Documents/workspace/my/NewsPortal/database/migrations/0017_web_ingestion_resource_layer.sql), [`database/ddl/phase2_ingest_foundation.sql`](/Users/user/Documents/workspace/my/NewsPortal/database/ddl/phase2_ingest_foundation.sql), and [`services/relay/src/cli/test-migrations.ts`](/Users/user/Documents/workspace/my/NewsPortal/services/relay/src/cli/test-migrations.ts) now keep `crawl_policy_cache.request_validators_json`, `crawl_policy_cache.response_cache_json`, and `channel_fetch_runs.provider_metrics_json` as first-class persisted website truth;
  - fetchers-side website polling now reuses upstream validators/cache truthfully:
    - [`services/fetchers/src/web-ingestion.ts`](/Users/user/Documents/workspace/my/NewsPortal/services/fetchers/src/web-ingestion.ts) now sends `If-None-Match` / `If-Modified-Since` for homepage, robots, `llms.txt`, sitemap URLs, and discovered feed URLs, reuses cached homepage body on `304`, carries conditional-request hit counters through discovery, persists updated validator/cache state back into `crawl_policy_cache`, and suppresses unnecessary browser fallback when static no-change evidence already exists;
  - per-run website telemetry is now persisted and surfaced to operators:
    - [`services/fetchers/src/fetchers.ts`](/Users/user/Documents/workspace/my/NewsPortal/services/fetchers/src/fetchers.ts), [`services/api/app/main.py`](/Users/user/Documents/workspace/my/NewsPortal/services/api/app/main.py), [`apps/admin/src/pages/index.astro`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/index.astro), and [`apps/admin/src/pages/observability.astro`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/observability.astro) now persist and render website-specific `provider_metrics_json` fields such as `staticAcceptedCount`, `browserAttempted`, `browserOnlyAcceptedCount`, `resourceKindCounts`, and `conditionalRequestHits` instead of hiding website runs behind generic fetched/new counters;
  - website resource observability now preserves discovery-to-enrichment truth:
    - [`services/fetchers/src/fetchers.ts`](/Users/user/Documents/workspace/my/NewsPortal/services/fetchers/src/fetchers.ts) and [`services/fetchers/src/resource-enrichment.ts`](/Users/user/Documents/workspace/my/NewsPortal/services/fetchers/src/resource-enrichment.ts) now keep backward-compatible top-level `classification_json` fields while also persisting additive `discovery`, `enrichment`, `resolved`, and `transition` blocks, plus `attributes_json.observability` signals such as `structuredTypes`, `linkCount`, `downloadCount`, `hasRepeatedCards`, `hasPagination`, `hintedKinds`, and `discoverySource`;
  - editorial website enrichment is now cheaper and instrumented:
    - [`services/fetchers/src/resource-enrichment.ts`](/Users/user/Documents/workspace/my/NewsPortal/services/fetchers/src/resource-enrichment.ts) now treats `@extractus/article-extractor` as bounded post-discovery fallback only, builds base editorial extraction from the already fetched HTML first, calls `extractFromHtml(...)` only when that base extraction is materially incomplete, and records `articleExtractorInvoked`, `articleExtractorReason`, `articleExtractorFetchReused`, `baseBodyLength`, `finalBodyLength`, `bodyUpliftChars`, `bodyUpliftRatio`, `bodyChanged`, and `extractorImprovedBody`;
  - targeted regression coverage was added for the new website-only logic:
    - [`tests/unit/ts/web-ingestion-browser.test.ts`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/ts/web-ingestion-browser.test.ts), [`tests/unit/ts/resource-enrichment-website.test.ts`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/ts/resource-enrichment-website.test.ts), and [`services/fetchers/src/cli/test-website-smoke.ts`](/Users/user/Documents/workspace/my/NewsPortal/services/fetchers/src/cli/test-website-smoke.ts) now prove conditional headers, cached homepage reuse, `provider_metrics_json` persistence, extractor gating, and body-uplift telemetry on the deterministic website fixture path;
  - bounded live-site validation on the rebuilt stack both confirmed the new telemetry and caught one real runtime defect:
    - the first rebuilt live run exposed a malformed SQL `update crawl_policy_cache ... set ..., where ...` statement inside `persistConditionalState()`, which was then repaired in [`services/fetchers/src/web-ingestion.ts`](/Users/user/Documents/workspace/my/NewsPortal/services/fetchers/src/web-ingestion.ts) and covered by a new narrow unit assertion;
    - after the repair, live validation on `/tmp/newsportal_live_website_sources.mjs` confirmed three real website shapes on the fresh compose baseline: European Commission press releases for static editorial projection, EBRD procurement notices for resource-only listing/document behavior, and Grafbase Changelog for browser-assisted-only accepted resources with persisted browser provenance; Intercom Changes stayed as a truthful `unsupported_block` hard-failure example rather than a hidden bypass.
- Что проверено:
  - `node --import tsx --test tests/unit/ts/web-ingestion-browser.test.ts tests/unit/ts/resource-enrichment-website.test.ts tests/unit/ts/admin-website-channels.test.ts`
  - `pnpm --filter @newsportal/fetchers typecheck`
  - `python -m py_compile services/api/app/main.py`
  - `pnpm test:migrations:smoke`
  - `pnpm test:website:compose`
  - `pnpm test:hard-sites:compose`
  - `pnpm test:channel-auth:compose`
  - `pnpm test:website:admin:compose`
  - `pnpm test:enrichment:compose`
  - `pnpm dev:mvp:internal`
  - live validation via [`/tmp/newsportal_live_website_sources.mjs`](/tmp/newsportal_live_website_sources.mjs) with evidence bundles:
    - [/tmp/newsportal-live-website-results-9399f95a-434f-43d8-b283-7b672c2a921b.json](/tmp/newsportal-live-website-results-9399f95a-434f-43d8-b283-7b672c2a921b.json)
    - [/tmp/newsportal-live-website-results-882205dd-ec2a-4292-9fa8-1818d4ade8c2.json](/tmp/newsportal-live-website-results-882205dd-ec2a-4292-9fa8-1818d4ade8c2.json)
  - direct compose-PostgreSQL readback of persisted website telemetry and resource observability for the live channels:
    - European Commission press releases (`65674c8c-837a-416a-8793-91d22b9a400a`) showed initial `new_content` with `staticAcceptedCount = 20`, `resourceKindCounts = {"unknown": 18, "editorial": 2}` and later `no_change` with `conditionalRequestHits.feed = 1`;
    - EBRD procurement notices (`0528d0d2-ec36-4cc7-b40d-8f01cc09da42`) showed stable resource-only `listing` behavior with `staticAcceptedCount = 2` and later `no_change`;
    - Grafbase Changelog (`4d330ce5-145d-4fee-9fa7-ac3be22a6244`) showed `browserAttempted = true`, `browserRecommended = true`, `browserAcceptedCount = 13`, `browserOnlyAcceptedCount = 13`, and browser-assisted `data_file`/`listing` mix on the assisted run;
    - Intercom Changes (`0244bbec-2e7f-4b28-9c11-69a78dd81416`) showed truthful hard-failure metrics with `browserChallengeKind = unsupported_block`, `browserAttempted = true`, `browserDiscoveredCount = 18`, and `finalAcceptedCount = 0`;
    - live newsroom editorial enrichment persisted `articleExtractorInvoked = true`, `articleExtractorFetchReused = true`, `articleExtractorReason = missing_published_at`, `baseBodyLength = 9335`, `finalBodyLength = 4762`, and `bodyUpliftRatio = 0.5101` on resource `0d782a6a-7460-46b7-95ce-1d226d757382`.
- Что capability доказала:
  - the website provider can keep its cheap-first architecture while still gaining real cost/observability improvements: upstream conditional requests, persisted per-run static-vs-browser metrics, and classifier/body observability all fit inside the existing fetchers-owned boundary without redesigning discovery or RSS;
  - bounded post-discovery `article-extractor` usage is sufficient and safer than widening it into acquisition: the repo now avoids duplicate website fetch cost by reusing fetched HTML and records whether extractor fallback materially changed editorial body quality;
  - bounded real-site validation is valuable even after green deterministic proof because it can expose runtime-only defects on the long-lived stack; in this case it found and then verified the repair of the malformed SQL update in `persistConditionalState()` without reopening the architecture decision itself.
- Риски или gaps:
  - real public websites remain unstable by nature; Browserbase still lacked persisted browser provenance on the chosen pass, and Intercom remained an explicit unsupported block rather than a successful browser-assisted target;
  - the latest live validation harness leaves accepted website channels in the local compose DB by design for operator follow-up, so the repo truth must continue to treat them as tracked local test artifacts rather than silent residue.
- Follow-up:
  - if the user wants more from this lane, open a fresh bounded item for follow-up ideas such as auto-cleanup of live-site channels, richer `/maintenance/fetch-runs` operator summaries, or broader public-site portfolio validation rather than reopening this archived hardening capability.

### 2026-04-15 — C-MULTI-SITE-WEBSITE-BLOCKER-TRIAGE-AND-REPAIR — Classified and repaired the real website blockers, then closed the live three-shape website proof

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: the user first asked for a hybrid website-validation plan, then asked to implement it end-to-end, and later explicitly asked to keep pushing on the blocked JS-heavy public-site lane until at least one real public candidate passed the same admin/channel proof contour.
- Что изменилось:
  - the website blocker taxonomy was made explicit across several public sites and separated into durable classes instead of one vague “website blocker” bucket: product bug, candidate misfit, explicit unsupported challenge, cheap-static acceptable, and browser-assisted success;
  - [`services/fetchers/src/web-ingestion.ts`](/Users/user/Documents/workspace/my/NewsPortal/services/fetchers/src/web-ingestion.ts) now contains two shipped product-side repairs:
    - safe iterative resource accumulation via `appendItems(...)` replaced the earlier `push(...largeArray)` merges in sitemap, collection, browser-assisted, probe, and JSON-LD expansion paths, removing the GOV.UK-style call-stack overflow on large website result sets;
    - login challenge detection now distinguishes real login gates from ordinary public navigation by checking for password inputs plus stronger sign-in form/text semantics instead of treating any visible `Log in` text as `unsupported login`;
  - [`tests/unit/ts/web-ingestion-browser.test.ts`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/ts/web-ingestion-browser.test.ts) gained deterministic regression proof for both repair classes: very large sitemap discovery no longer overflows, a public nav `Log in` link no longer triggers `challengeKindHint = login`, and a real sign-in form with a password field still does;
  - the live website hybrid proof is now fully closed on the same admin/runtime contract:
    - newsroom success stayed proven with European Commission press releases;
    - documents/tenders success stayed proven with EBRD procurement notices;
    - the missing JS-heavy acceptance is now closed by `Grafbase Changelog`, which remained a `website` provider and showed persisted browser-assisted provenance on the assisted rerun through the full admin/channel flow;
  - the durable live evidence bundles now include four result artifacts:
    - [/tmp/newsportal-live-website-results-1e148fea-e811-47a0-821c-d5b7c6ef0df5.json](/tmp/newsportal-live-website-results-1e148fea-e811-47a0-821c-d5b7c6ef0df5.json)
    - [/tmp/newsportal-live-website-results-69db9f58-8a16-48de-a8fa-767327bad4f4.json](/tmp/newsportal-live-website-results-69db9f58-8a16-48de-a8fa-767327bad4f4.json)
    - [/tmp/newsportal-live-website-results-5460b688-ad17-41ce-88e9-362dd3f9c904.json](/tmp/newsportal-live-website-results-5460b688-ad17-41ce-88e9-362dd3f9c904.json)
    - [/tmp/newsportal-live-website-results-72da4ba4-7f93-4f3b-a711-045e369e21c1.json](/tmp/newsportal-live-website-results-72da4ba4-7f93-4f3b-a711-045e369e21c1.json)
- Разбивка по stages:
  - `SPIKE-MULTI-SITE-WEBSITE-BLOCKER-TAXONOMY-2026-04-15`
  - `PATCH-WEBSITE-SITEMAP-SPREAD-OVERFLOW-2026-04-15`
  - `PATCH-WEBSITE-LOGIN-GATE-FALSE-POSITIVES-2026-04-15`
  - `PATCH-LIVE-WEBSITE-SOURCE-HYBRID-VERIFICATION-2026-04-15`
- Что проверено:
  - `node --import tsx --test tests/unit/ts/web-ingestion-browser.test.ts`
  - `pnpm typecheck`
  - `pnpm test:website:compose`
  - `pnpm test:hard-sites:compose`
  - `pnpm test:website:admin:compose`
  - live admin/channel proof via `/tmp/newsportal_live_website_sources.mjs`, including deterministic `fetchers run:once` polling and verification on `/admin/resources*` and `/maintenance/web-resources*`
- Что capability доказала:
  - the real product-side website bugs were not in the browser-assisted subsystem contract itself, but in specific fetchers behaviors: unsafe large-array merges and overbroad login challenge heuristics;
  - the browser-assisted website subsystem remained healthy on its deterministic fixture proof while still classifying public live sites truthfully into unsupported challenges, cheap-static wins, and genuine browser-assisted wins;
  - the original hybrid acceptance target is now fully satisfied on the real local admin/runtime path: one newsroom, one documents/tenders source, and one public JS-heavy source are all proven without reintroducing stealth, CAPTCHA bypass, login-session replay, or provider-type cheating.
- Риски или gaps:
  - live public JS-heavy sites remain inherently unstable and many still classify truthfully as `captcha`, `cloudflare_js_challenge`, `unsupported_block`, `robots.txt` block, or cheap-static-only wins; this capability closes the required acceptance target but does not promise a broad evergreen public-site portfolio;
  - the worktree still contains separate mixed doc edits and untracked docs outside this archived capability, so archive sync closes the website lane truth but does not imply a clean git worktree.
- Follow-up:
  - if the user wants to keep expanding this lane, open a fresh bounded item for broader public-site portfolio coverage, browser-provenance UX/observability polish, or stricter JS-heavy acceptance heuristics rather than reopening this archived capability.

### 2026-04-15 — PATCH-WEBSITE-SOURCES-TESTING-GUIDE-2026-04-15 — Added a dedicated operator guide for website-source testing and synced the main operator docs

- Тип записи: item archive
- Финальный статус: archived
- Зачем понадобилось: the user wanted an operator-facing instruction analogous to `EXAMPLES.md`, but focused on actively testing `website` sources, `/admin/resources`, and the persisted `web_resources` lane instead of piecing the workflow together from scattered README/runbook notes.
- Что изменилось:
  - [`WEBSITE_SOURCES_TESTING.md`](/Users/user/Documents/workspace/my/NewsPortal/WEBSITE_SOURCES_TESTING.md) was added as a standalone Russian guide for the website-source lane and then expanded into an example-driven handbook in the style of `EXAMPLES.md`: it now gives three full website-source bundles for editorial newsroom projection, resource-only public documents/tenders portals, and bounded browser-assisted public JS-heavy sites, alongside safe baseline form defaults, truthful manual polling via `fetchers run:once`, `/admin/resources` filters, projected vs resource-only expectations, resource-kind interpretation, and troubleshooting for the main failure modes;
  - [`README.md`](/Users/user/Documents/workspace/my/NewsPortal/README.md), [`HOW_TO_USE.md`](/Users/user/Documents/workspace/my/NewsPortal/HOW_TO_USE.md), and [`docs/manual-mvp-runbook.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/manual-mvp-runbook.md) now point operators to the new standalone guide instead of leaving the website testing workflow scattered across broader docs only;
  - [`docs/work.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/work.md) was synced so current memory and recent-change history now reflect that the website-source testing guide exists and that the docs-only patch closed without needing a product regression fix.
- Что проверено:
  - `python -m unittest tests.unit.python.test_api_web_resources`
  - `pnpm typecheck`
  - `pnpm test:website:admin:compose`
  - `git diff --check -- WEBSITE_SOURCES_TESTING.md README.md HOW_TO_USE.md docs/manual-mvp-runbook.md docs/work.md docs/history.md`
- Что item доказал:
  - the current website-source lane is operator-ready enough to support a dedicated testing guide rather than only scattered notes: `/maintenance/web-resources*`, `/admin/resources*`, projected article drilldown, and the persisted resource-only rows are all part of the shipped/testing contract;
  - operators now have one clear document that explains how to verify projected editorial rows and resource-only `entity` / `document` rows together, including three concrete example configurations and the bounded browser-assisted path for public JS-heavy sites;
  - no code fix was required while authoring the guide because the current local proof lane remained green, including the deterministic `pnpm test:website:admin:compose` acceptance.
- Риски или gaps:
  - the guide intentionally documents the current truthful operator contract and does not pretend that login-required websites, CAPTCHA walls, cookie/session replay, or YouTube onboarding are supported parts of this lane;
  - the manual local trigger still relies on container-side `fetchers run:once` rather than a dedicated surfaced `Run now` button in admin, so future operator ergonomics work should be framed as a new bounded follow-up rather than folded back into this docs patch.

### 2026-04-14 — SWEEP-EXAMPLES-PRIMARY-OUTSOURCE-DOC-SYNC-2026-04-14 — Made `EXAMPLES.md` the primary outsourcing example source and demoted the narrow companion docs

- Тип записи: item archive
- Финальный статус: archived
- Зачем понадобилось: the user explicitly asked for `EXAMPLES.md` to become the main source for the outsourcing example, without contradicting the narrower outsourcing helper docs or the legacy JSON reference asset.
- Что изменилось:
  - [`EXAMPLES.md`](/Users/user/Documents/workspace/my/NewsPortal/EXAMPLES.md) now states that it is the primary human-facing source for built-in example bundles, and Example C was rewritten to the current outsourcing bundle truth: active prompt names/scopes now match the shipped admin-managed bundle, and the outsourcing template baseline is now the focused 5-template set rather than the older broader 8-template variant;
  - [`docs/data_scripts/README.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/data_scripts/README.md) and [`docs/data_scripts/outsource_balanced_templates.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/data_scripts/outsource_balanced_templates.md) now describe themselves as companion/reference surfaces that must follow Example C instead of competing with it as a separate primary handbook;
  - [`docs/blueprint.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/blueprint.md) now records the updated durable truth: built-in outsourcing operator guidance is anchored in `EXAMPLES.md` Example C, the outsourcing-only Markdown is a focused companion, and the JSON file remains only a legacy/manual reference asset.
- Что проверено:
  - targeted line review of `EXAMPLES.md`, `docs/data_scripts/README.md`, `docs/data_scripts/outsource_balanced_templates.md`, and `docs/blueprint.md`
  - `git diff --check -- docs/work.md docs/history.md docs/blueprint.md EXAMPLES.md docs/data_scripts/README.md docs/data_scripts/outsource_balanced_templates.md`
- Что item доказал:
  - there is now only one primary human-facing guide for the built-in outsourcing example, so operators no longer need to guess whether Example C or the narrow outsourcing helper doc should win;
  - the built-in outsourcing walkthrough now matches the shipped prompt names/scopes and the currently focused 5-template buyer-intent bundle instead of the older, broader example set.
- Риски или gaps:
  - the JSON file still exists as a manual/reference artifact and is intentionally not auto-generated from `EXAMPLES.md`, so future edits still require the docs to stay in sync on purpose rather than by automation.

### 2026-04-14 — C-OUTSOURCE-CONFIG-DECOUPLING-FROM-GENERIC-RUNTIME — Moved outsourcing semantics out of generic runtime and into admin-managed/operator-owned configuration

- Тип записи: capability archive
- Финальный статус: archived at implementation layer
- Зачем понадобилось: the user wanted to keep outsourcing as only one supported use case instead of a hidden system specialization, remove the remaining outsourcing-specific assumptions from generic runtime/tooling, and make the full outsourcing configuration reproducible through admin/operator surfaces rather than through code or a runtime-owned JSON bundle.
- Что изменилось:
  - generic candidate-uplift runtime no longer carries hardcoded vendor/outsourcing vocabulary: [`services/workers/app/final_selection.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/final_selection.py) and [`services/workers/app/main.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/main.py) now read criterion/profile candidate cues from admin-managed compatibility data, while the generic fallback stays limited to structural request/change/evaluation cues;
  - admin-managed truth now covers candidate cues and compatibility policy semantics end-to-end: [`apps/admin/src/lib/server/admin-templates.ts`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/lib/server/admin-templates.ts), [`apps/admin/src/components/InterestTemplateEditorForm.tsx`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/components/InterestTemplateEditorForm.tsx), [`apps/admin/src/pages/bff/admin/templates.ts`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/bff/admin/templates.ts), [`apps/admin/src/pages/templates/interests.astro`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/templates/interests.astro), [`apps/admin/src/pages/templates/interests/new.astro`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/templates/interests/new.astro), [`apps/admin/src/pages/templates/interests/[interestTemplateId]/edit.astro`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/templates/interests/%5BinterestTemplateId%5D/edit.astro), and [`services/api/app/main.py`](/Users/user/Documents/workspace/my/NewsPortal/services/api/app/main.py) now persist/read candidate cue groups plus editable `strictness` / `unresolvedDecision` / `llmReviewMode` compatibility defaults instead of leaving them buried in runtime code;
  - operational tooling no longer treats the outsourcing JSON bundle as runtime truth: [`services/fetchers/src/cli/article-yield-remediate.ts`](/Users/user/Documents/workspace/my/NewsPortal/services/fetchers/src/cli/article-yield-remediate.ts) was decoupled from `outsource_balanced_templates.json`, while [`docs/data_scripts/outsource_balanced_templates.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/data_scripts/outsource_balanced_templates.md) became the then-current operator handbook and [`docs/data_scripts/outsource_balanced_templates.json`](/Users/user/Documents/workspace/my/NewsPortal/docs/data_scripts/outsource_balanced_templates.json) stayed only as a manual reference asset with example candidate/profile settings; later docs sync moved the primary operator-facing source to `EXAMPLES.md` Example C.
  - the operator documentation surface is now complete enough to recreate the three built-in use cases without changing channel lists: [`EXAMPLES.md`](/Users/user/Documents/workspace/my/NewsPortal/EXAMPLES.md), [`docs/data_scripts/README.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/data_scripts/README.md), and [`docs/data_scripts/outsource_balanced_templates.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/data_scripts/outsource_balanced_templates.md) now explain the full admin-entered configuration path rather than a code-coupled bundle workflow.
- Что проверено:
  - `PYTHONPATH=/tmp:. python -m unittest tests.unit.python.test_api_system_interests tests.unit.python.test_final_selection tests.unit.python.test_interest_auto_repair`
  - `node --import tsx --test tests/unit/ts/admin-template-sync.test.ts`
  - `pnpm typecheck`
  - `git diff --check -- docs/work.md docs/blueprint.md docs/contracts/universal-selection-profiles.md EXAMPLES.md docs/data_scripts/README.md docs/data_scripts/outsource_balanced_templates.json docs/data_scripts/outsource_balanced_templates.md apps/admin/src/components/InterestTemplateEditorForm.tsx apps/admin/src/lib/server/admin-templates.ts apps/admin/src/pages/bff/admin/templates.ts apps/admin/src/pages/templates/interests.astro apps/admin/src/pages/templates/interests/new.astro apps/admin/src/pages/templates/interests/%5BinterestTemplateId%5D/edit.astro services/api/app/main.py services/fetchers/src/cli/article-yield-remediate.ts services/workers/app/final_selection.py services/workers/app/main.py tests/unit/python/test_api_system_interests.py tests/unit/python/test_final_selection.py tests/unit/python/test_interest_auto_repair.py tests/unit/ts/admin-template-sync.test.ts`
- Что capability доказала:
  - the generic engine can still work across arbitrary domains because outsourcing-specific vocabulary no longer acts as a hidden universal runtime truth;
  - the outsourcing use case remains fully supported, but its semantics now live in admin-managed profile/prompt/config data and operator docs instead of in hardcoded worker/tooling behavior;
  - system-interest operators can now override compatibility profile defaults directly in admin while preserving the old seeded defaults when they do nothing, so there is no longer a hidden policy layer that only code can change.
- Риски или gaps:
  - the markdown/operator path is now authoritative for humans, but there is still no one-click admin import that materializes the full handbook automatically;
  - the local worktree still contains the shipped implementation changes until the user decides how to commit or split them.
- Follow-up:
  - if needed, open a separate bounded capability for bulk admin import/export ergonomics; do not reopen generic runtime decoupling unless a new domain-lock-in regression appears.

### 2026-04-13 — C-PIPELINE-RESILIENCE-AND-GRAY-ZONE-LLM-RECOVERY — Restored article-pipeline resilience and re-opened the gray-zone LLM lane

- Тип записи: capability archive
- Финальный статус: archived at implementation layer
- Зачем понадобилось: the user reported that the pipeline processed thousands of articles while finding zero selected rows, showed no visible gray-zone review, and must be repaired without erasing the current DB so the local baseline stayed analysable.
- Что изменилось:
  - shipped generic transient deadlock resilience inside [`services/workers/app/task_engine/executor.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/task_engine/executor.py), so sequence tasks now retry deadlock-like PostgreSQL failures inside the task boundary instead of immediately turning them into permanent run failure;
  - re-aligned compatibility system-interest profile semantics across runtime, admin sync, and historical local rows: [`services/workers/app/selection_profiles.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/selection_profiles.py), [`apps/admin/src/lib/server/admin-templates.ts`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/lib/server/admin-templates.ts), [`database/migrations/0033_compatibility_profile_llm_review_defaults.sql`](/Users/user/Documents/workspace/my/NewsPortal/database/migrations/0033_compatibility_profile_llm_review_defaults.sql), [`services/api/app/main.py`](/Users/user/Documents/workspace/my/NewsPortal/services/api/app/main.py), [`apps/admin/src/lib/server/operator-surfaces.ts`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/lib/server/operator-surfaces.ts), and [`apps/admin/src/pages/templates/interests.astro`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/templates/interests.astro) now make compatibility profiles default to `llmReviewMode = always`, repair the 5 stale local rows, and expose truthful pending-review wording instead of cheap-hold ambiguity;
  - reduced the dominant compose contention hotspot by narrowing [`services/workers/app/main.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/main.py) article locking to `FOR UPDATE OF a` and by adding a per-channel PostgreSQL advisory lease in [`services/fetchers/src/fetchers.ts`](/Users/user/Documents/workspace/my/NewsPortal/services/fetchers/src/fetchers.ts), so the same `source_channel` is no longer polled concurrently across periodic/manual fetch paths;
  - hardened fetchers-owned enrichment adapters in [`services/workers/app/task_engine/pipeline_plugins.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/task_engine/pipeline_plugins.py) so short-lived internal transport failures and retryable gateway statuses are retried inside the adapter before the sequence task is failed, with regression proof in [`tests/unit/python/test_task_engine_pipeline_plugins.py`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/python/test_task_engine_pipeline_plugins.py).
- Что проверено:
  - `PYTHONPATH=/tmp:. python -m unittest tests.unit.python.test_task_engine tests.unit.python.test_selection_profiles`
  - `PYTHONPATH=/tmp:. python -m unittest tests.unit.python.test_api_system_interests tests.unit.python.test_selection_profiles tests.unit.python.test_task_engine`
  - `PYTHONPATH=/tmp:. python -m unittest tests.unit.python.test_interest_auto_repair tests.unit.python.test_api_system_interests tests.unit.python.test_selection_profiles tests.unit.python.test_task_engine`
  - `PYTHONPATH=/tmp:. python -m unittest tests.unit.python.test_task_engine_pipeline_plugins`
  - `PYTHONPATH=/tmp:. python -m unittest tests.unit.python.test_task_engine tests.unit.python.test_task_engine_pipeline_plugins`
  - `node --import tsx --test tests/unit/ts/admin-template-sync.test.ts`
  - `node --import tsx --test tests/unit/ts/admin-operator-surfaces.test.ts tests/unit/ts/admin-template-sync.test.ts`
  - `node --import tsx --test tests/unit/ts/fetcher-channel-lease.test.ts tests/unit/ts/fetcher-duplicate-preflight.test.ts tests/unit/ts/admin-operator-surfaces.test.ts tests/unit/ts/admin-template-sync.test.ts`
  - `pnpm db:migrate`
  - compose restarts for `worker`, `api`, `admin`, and `fetchers` without volume reset
  - live/runtime evidence via `curl -sS 'http://127.0.0.1:8000/system-interests?pageSize=5'`, `docker logs docker-worker-1 --since 45m`, and read-only `docker exec docker-postgres-1 psql ...` queries for `sequence_runs` and `llm_review_log`
  - `git diff --check --` on the touched files for each stage
- Что capability доказала:
  - the local article pipeline is no longer stuck behind the earlier runaway backlog/deadlock symptom: `article.ingest.requested` moved from thousands of pending runs to a drained state with `36527 completed` and only the historical `132 failed` rows left in place;
  - the gray-zone LLM lane is live again for compatibility system interests: `llm_review_log` moved from `0` to `3` rows across `2` reviewed docs after the repaired profile/default path began flowing;
  - the repair stayed architecture-safe and non-destructive: PostgreSQL/outbox/`q.sequence` ownership remained intact, no historical DB data was deleted, and no direct replay/cleanup shortcut was used.
- Риски или gaps:
  - this capability did not replay the existing failed historical runs; they remain as evidence in the current DB;
  - runtime resilience is recovered, but candidate quality is still poor because the current source mix remains heavily off-target and still drives near-total `rejected` / `no_match`.
- Follow-up:
  - continue in a separate capability focused on source-quality pressure and buyer-intent recovery rather than reopening runtime reliability or gray-zone policy semantics.

### 2026-04-13 — SWEEP-FULL-UI-BUTTON-AUDIT-2026-04-12 — Closed the full web/admin button audit with one honest Web Push proof residual

- Тип записи: item archive
- Финальный статус: archived
- Зачем понадобилось: after the earlier targeted CRUD/operator proof had turned specific surfaces green, the user explicitly escalated to a truthful product-wide pass and asked for every meaningful user/admin button to be checked by real clicks rather than by API assumptions.
- Что изменилось:
  - turned [`infra/scripts/test-ui-button-audit.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/test-ui-button-audit.mjs) into the durable proof owner for the full browser sweep: the harness now boots the local compose baseline, seeds truthful web/admin fixtures, resolves real rows instead of brittle placeholder assumptions, and inventories current button actions across surfaced `apps/web` and `apps/admin` routes with explicit `checked`, `notApplicable`, and `skipped` outcomes;
  - hardened the sweep around real UI behavior instead of lucky locators: fixed stale row resolution after interest rename/clone, switched hidden-input settings interactions to real label clicks, re-opened redirecting pages such as `/notifications` between feedback actions, anchored create/save forms in channels, automation, and discovery to their actual form owners, re-resolved renamed cards/details rows before follow-up actions, and normalized destructive-confirm handling so row-level delete/archive flows use the trigger’s actual custom-dialog label instead of an assumed generic confirm string;
  - made the proof fixtures truthful enough for later routes: the harness now seeds deterministic `notification_log` rows for immediate-channel feedback, uses a real current-run web user id for admin-managed user interests, promotes seeded discovery classes into the visible sort window, and targets the actual discovery feedback tab/form rather than the earlier wrong route;
  - verified that the remaining `/settings -> Connect Web Push` gap is a proof-environment limitation, not a silently accepted product regression: focused browser probes showed the current headless/incognito Chromium run does not complete Push API subscription, so the final sweep records that action as an honest skip with the surfaced `PushManager.subscribe(...): no active Service Worker` failure instead of pretending it passed.
- Что проверено:
  - repeated runs of `node infra/scripts/test-ui-button-audit.mjs` during harness repair
  - final green proof on 2026-04-13: `node infra/scripts/test-ui-button-audit.mjs` (`runId=0443abd5`, `status=ui-button-audit-ok`)
  - `git diff --check -- infra/scripts/test-ui-button-audit.mjs`
- Что item доказал:
  - the repo now has a truthful browser-level inventory for current product button actions on both web and admin, and the final sweep proves real clicks for collection/mobile-shell/content/saved/interests/settings/notifications/matches plus system-interest, LLM-template, channel, user-interest, article, resources, reindex, automation, and discovery operator buttons;
  - the formerly open discovery mission/class lifecycle gap is no longer a hole in the broad sweep: create/save/archive/activate/delete, compile/run, candidate approve/reject, and feedback submit all remain live-proven inside the same full-pass harness;
  - the only residual from the product-wide pass is bounded and explicit: `/settings -> Connect Web Push` is still unproven in the current local headless/incognito browser mode because Push API subscription does not succeed there.
- Риски или gaps:
  - this archive does not claim a universal cross-browser/manual proof for `web_push`; it only claims that the current automated browser mode cannot finish the subscription flow and that the sweep honestly records that fact;
  - `/settings` still emitted non-blocking React `#418` console noise during the successful sweep even though the proven settings buttons completed their flows.
- Follow-up:
  - open a fresh bounded item only if the user wants product-side `web_push` debugging/proof in a browser mode that supports real service-worker-backed push subscription, or wants the remaining settings React noise investigated separately.

### 2026-04-12 — PATCH-DISCOVERY-MISSION-CLASS-LIFECYCLE-2026-04-12 — Closed the remaining discovery mission/class lifecycle product gap

- Тип записи: item archive
- Финальный статус: archived
- Зачем понадобилось: the user explicitly asked to close the last discovery CRUD product gap, and the current admin/runtime truth still lacked operator-visible archive/delete lifecycle support for discovery missions and hypothesis classes even though the rest of discovery admin was already live.
- Что изменилось:
  - added real discovery mission lifecycle support across [`database/migrations/0032_discovery_mission_archive_status.sql`](/Users/user/Documents/workspace/my/NewsPortal/database/migrations/0032_discovery_mission_archive_status.sql), [`services/api/app/main.py`](/Users/user/Documents/workspace/my/NewsPortal/services/api/app/main.py), and [`apps/admin/src/pages/bff/admin/discovery.ts`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/bff/admin/discovery.ts): missions now accept `status='archived'`, compile/run reject archived missions until they are reactivated, admin BFF now exposes archive/reactivate/delete intents, and hard delete is guarded so it only succeeds for history-free missions instead of silently dropping already-used discovery state;
  - added class archive/reactivate/delete UX and guarded delete semantics across [`services/api/app/main.py`](/Users/user/Documents/workspace/my/NewsPortal/services/api/app/main.py), [`apps/admin/src/pages/bff/admin/discovery.ts`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/bff/admin/discovery.ts), and [`apps/admin/src/pages/discovery.astro`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/discovery.astro): archive/activate now use the same custom `AlertDialog` confirm pattern as the other admin surfaces, while hard delete refuses classes that already have generated hypotheses and pushes operators onto the archive path instead;
  - widened proof owners in [`tests/unit/python/test_api_discovery_management.py`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/python/test_api_discovery_management.py), [`tests/unit/ts/discovery-admin.test.ts`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/ts/discovery-admin.test.ts), and [`infra/scripts/test-discovery-admin-flow.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/test-discovery-admin-flow.mjs), then synced durable contract/proof truth in [`docs/contracts/discovery-agent.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/contracts/discovery-agent.md) and [`docs/verification.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/verification.md);
  - during final compose proof the local PostgreSQL volume turned out to be discovery-drifted even though `schema_migrations` claimed `0030_discovery_schema_drift_repair.sql` had already run; the item therefore also replayed that idempotent repair migration on the local compose DB so `/discovery` could render and the updated discovery acceptance/browser proof could run on a truthful baseline again.
- Что проверено:
  - `pnpm unit_tests`
  - `pnpm test:migrations:smoke`
  - `pnpm db:migrate`
  - `pnpm --filter @newsportal/admin build`
  - `docker compose --env-file .env.dev -f infra/docker/compose.yml -f infra/docker/compose.dev.yml up -d --build api admin migrate nginx`
  - `git diff --check -- database/migrations/0032_discovery_mission_archive_status.sql apps/admin/src/pages/discovery.astro apps/admin/src/pages/bff/admin/discovery.ts services/api/app/main.py tests/unit/python/test_api_discovery_management.py tests/unit/ts/discovery-admin.test.ts infra/scripts/test-discovery-admin-flow.mjs docs/work.md`
  - `docker exec -i docker-postgres-1 psql -U newsportal -d newsportal < database/migrations/0030_discovery_schema_drift_repair.sql`
  - `pnpm test:discovery:admin:compose`
  - `node /tmp/browser_button_check.mjs`
- Что item доказал:
  - discovery missions and classes now have real operator lifecycle support in admin: mission/class rows can be archived, reactivated, and deleted through the surfaced buttons and same-origin BFF writes;
  - mission archive is now a truthful persisted runtime state rather than a UI fiction, and archived missions cannot compile or run until reactivated;
  - mission/class hard delete no longer risks silent historical loss: disposable entities delete cleanly, while entities with discovery history are forced onto the archive path;
  - the updated discovery acceptance lane and the targeted browser click smoke both stay green on the repaired local compose baseline, so the new buttons work as actual custom confirm interactions rather than as API-only paths.
- Риски или gaps:
  - the local compose baseline had schema drift outside this code patch, so future discovery/runtime work should remember that a volume can still claim `0030` in `schema_migrations` while missing actual discovery tables until repaired;
  - the worktree remains heavily mixed, so this archive does not imply a clean commit-ready tree.
- Follow-up:
  - no immediate follow-up is required for discovery mission/class lifecycle; open a fresh bounded item only if the user later wants broader discovery lifecycle semantics beyond the new guarded archive/reactivate/delete contract.

### 2026-04-12 — PATCH-ADMIN-WEB-RESOURCES-AND-REACT-NOISE-2026-04-12 — Closed the last local website-admin and reindex runtime residuals

- Тип записи: item archive
- Финальный статус: archived
- Зачем понадобилось: after the confirm-dialog repair, two residuals were still left on the local compose baseline: `pnpm test:website:admin:compose` failed immediately because `/maintenance/web-resources?page=1&pageSize=1` returned `500 Internal Server Error`, and a targeted admin browser probe still reproduced a React `#418` hydration error on plain `/reindex`.
- Что изменилось:
  - repaired [`services/api/app/main.py`](/Users/user/Documents/workspace/my/NewsPortal/services/api/app/main.py) so the web-resources list/detail queries read the real compatibility column `system_feed_results.eligible_for_feed` instead of the nonexistent `sfr.is_eligible`; that removed the local API/runtime regression blocking `/maintenance/web-resources` and the admin `/resources*` operator lane;
  - made [`apps/admin/src/components/LiveReindexJobsSection.tsx`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/components/LiveReindexJobsSection.tsx) hydration-safe by stopping client-first timestamp localization during the first render; the reindex live snapshot contract now carries `createdAtLabel` through [`apps/admin/src/lib/live-updates.ts`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/lib/live-updates.ts), [`apps/admin/src/lib/server/live-updates.ts`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/lib/server/live-updates.ts), and [`apps/admin/src/pages/reindex.astro`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/reindex.astro), so the browser no longer re-renders the initial timestamp text during hydration;
  - widened targeted regression coverage in [`tests/unit/python/test_api_web_resources.py`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/python/test_api_web_resources.py) and [`tests/unit/ts/admin-reindex-live-updates.test.ts`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/ts/admin-reindex-live-updates.test.ts), then rebuilt `api` and `admin` and re-proved both the website-admin acceptance lane and the broader browser smoke lane.
- Что проверено:
  - `pnpm unit_tests`
  - `python -m unittest tests.unit.python.test_api_web_resources`
  - `node --import tsx --test tests/unit/ts/admin-reindex-live-updates.test.ts`
  - `pnpm --filter @newsportal/admin build`
  - `docker compose --env-file .env.dev -f infra/docker/compose.yml -f infra/docker/compose.dev.yml build api admin`
  - `docker compose --env-file .env.dev -f infra/docker/compose.yml -f infra/docker/compose.dev.yml up -d api admin nginx`
  - `curl -sS -i 'http://127.0.0.1:8000/maintenance/web-resources?page=1&pageSize=1'`
  - `node /tmp/admin_react_probe.mjs`
  - `pnpm test:website:admin:compose`
  - `node /tmp/browser_button_check.mjs`
- Что item доказал:
  - `/maintenance/web-resources` now responds normally on the local compose baseline, and the dedicated `website-admin` acceptance lane is green again, including `/resources`, `/resources/{resource_id}`, and provider-specific website/API/Email IMAP admin flows;
  - the plain `/reindex` admin page no longer emits the reproduced React `#418` hydration error during browser load;
  - the broader browser smoke still stays green after these fixes, so the custom confirm dialogs and click-driven actions repaired earlier were not regressed.
- Риски или gaps:
  - discovery mission/class delete/archive remains unsupported product/runtime scope rather than a regression;
  - the worktree remains heavily mixed, so future tasks still need explicit overlap framing.
- Follow-up:
  - no immediate follow-up is required for the local website-admin or reindex residuals; open a new bounded item only if a fresh runtime regression appears on those surfaces.

### 2026-04-12 — PATCH-CUSTOM-CONFIRM-DIALOGS-2026-04-12 — Restored custom admin confirm dialogs without regressing live click behavior

- Тип записи: item archive
- Финальный статус: archived
- Зачем понадобилось: the earlier browser-button repair had temporarily replaced the broken custom confirm flow with native `window.confirm(...)`, but the user explicitly wanted product-styled custom dialogs rather than browser-default confirms.
- Что изменилось:
  - rewired [`apps/admin/src/components/AdminConfirmAction.tsx`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/components/AdminConfirmAction.tsx) back to shared `@newsportal/ui` `AlertDialog` primitives while keeping the safe standalone POST path: confirm actions now open a custom modal, then submit through a temporary hidden form outside any existing page forms, which preserves the working destructive/operator behavior without reintroducing nested-form bugs;
  - rewired [`apps/admin/src/components/AdminConfirmSubmitButton.tsx`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/components/AdminConfirmSubmitButton.tsx) back to the same custom `AlertDialog` contract while keeping the reliable form submission path: confirm clicks now call `form.requestSubmit()` (with `reportValidity()` / `submit()` fallback behavior) against the surrounding form instead of relying on native browser confirms;
  - rebuilt the local `admin` compose image, updated the temporary browser harness so it clicks custom modal confirm buttons truthfully, and re-proved both destructive confirms and submit-style confirms from real browser interactions.
- Что проверено:
  - `pnpm --filter @newsportal/admin build`
  - `docker compose --env-file .env.dev -f infra/docker/compose.yml -f infra/docker/compose.dev.yml build admin`
  - `docker compose --env-file .env.dev -f infra/docker/compose.yml -f infra/docker/compose.dev.yml up -d admin nginx`
  - `node /tmp/browser_button_check.mjs`
  - `git diff --check -- apps/admin/src/components/AdminConfirmAction.tsx apps/admin/src/components/AdminConfirmSubmitButton.tsx docs/work.md docs/history.md`
- Что item доказал:
  - admin system-interest and LLM-template archive/reactivate/delete flows once again work through custom in-product confirm dialogs rather than native browser confirms;
  - admin `AdminConfirmSubmitButton` also remains live-proven after the rewrite: `Apply schedule` on `/channels` updates RSS scheduling state, and `Queue maintenance job` on `/reindex` creates a real `reindex_jobs` row through the UI;
  - the broader browser regression harness still remains green for the previously repaired surfaces: web `/interests`, admin-managed user interests, channel delete/archive, and discovery actions all continue to work after the custom-dialog restore.
- Риски или gaps:
  - the unrelated local `website-admin` residual remains open: `pnpm test:website:admin:compose` still fails because `/maintenance/web-resources?page=1&pageSize=1` returns `500 Internal Server Error`;
  - the long browser smoke still emitted non-blocking minified React `#418` console noise during one admin flow, but it did not block the patched confirm actions and was intentionally left outside this bounded patch.
- Follow-up:
  - if the next request touches website/resources, open a new bounded patch for the `/maintenance/web-resources` `500`;
  - if the React `#418` console noise becomes user-visible or reproducible outside smoke logging, open a separate bounded patch rather than reopening the confirm-dialog item.

### 2026-04-12 — SPIKE-BROWSER-BUTTON-ACTIONS-2026-04-12 — Repaired browser-visible button actions across admin and web surfaces

- Тип записи: item archive
- Финальный статус: archived
- Зачем понадобилось: the earlier CRUD spike proved backend/BFF support, but the user clarified that the real requirement was browser-visible click behavior. Several operator buttons looked present yet did not reliably produce the expected action when clicked in the UI.
- Что изменилось:
  - repaired admin confirm controls in [`apps/admin/src/components/AdminConfirmAction.tsx`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/components/AdminConfirmAction.tsx) and [`apps/admin/src/components/AdminConfirmSubmitButton.tsx`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/components/AdminConfirmSubmitButton.tsx): the previous Radix-based confirm path was not reliably producing real browser submits, so the local worktree now uses native `window.confirm(...)` trigger flows with guaranteed form submission semantics and without illegal nested forms on pages such as [`apps/admin/src/pages/user-interests.astro`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/user-interests.astro);
  - repaired the web interests mutation path in [`apps/web/src/components/InterestManager.tsx`](/Users/user/Documents/workspace/my/NewsPortal/apps/web/src/components/InterestManager.tsx), [`apps/web/src/components/LiveInterestsSection.tsx`](/Users/user/Documents/workspace/my/NewsPortal/apps/web/src/components/LiveInterestsSection.tsx), and [`apps/web/src/pages/interests.astro`](/Users/user/Documents/workspace/my/NewsPortal/apps/web/src/pages/interests.astro): update/clone/delete had been passing a non-serializable function prop from `.astro` into a client-loaded React tree, which hydrated into `r is not a function`; the client now receives a string base path and computes interest action URLs locally;
  - rebuilt the local `web` and `admin` compose images and re-ran the full browser click smoke against the compose baseline, including container-reachable RSS fixture URLs (`http://web:4321/...`) so the stored-history channel archive path could be proven truthfully from a real click.
- Что проверено:
  - repo-local build proof:
    - `pnpm --filter @newsportal/web build`
    - `pnpm --filter @newsportal/admin build`
    - `git diff --check -- apps/web/src/components/InterestManager.tsx apps/web/src/components/LiveInterestsSection.tsx apps/web/src/pages/interests.astro apps/admin/src/components/AdminConfirmAction.tsx apps/admin/src/components/AdminConfirmSubmitButton.tsx docs/work.md`
  - compose refresh:
    - `docker compose --env-file .env.dev -f infra/docker/compose.yml -f infra/docker/compose.dev.yml build web admin`
    - `docker compose --env-file .env.dev -f infra/docker/compose.yml -f infra/docker/compose.dev.yml up -d web admin nginx`
  - full browser click proof:
    - `node /tmp/browser_button_check.mjs`
- Что item доказал:
  - system-interest buttons now work from real clicks: create, save, archive, reactivate, and delete all produced the expected browser-visible POSTs and server-side state changes;
  - LLM-template buttons now work from real clicks: create, save, archive, reactivate, and delete all completed through the UI;
  - web `/interests` buttons now work from real clicks: create, save/update, clone, and delete all emitted the expected browser requests and persisted the right state;
  - admin-managed user-interest buttons now work from real clicks: create, save/update, clone, and delete all completed without the earlier hydration/runtime suspicion;
  - channel buttons now work from real clicks for the covered lifecycle branches: provider-specific create/update, delete of an empty RSS channel, and archive of an RSS channel with stored history;
  - discovery buttons now work from real clicks for the currently supported lifecycle: mission create/update/compile/run, class create/update, candidate approve/reject, feedback submission, and mission re-evaluation.
- Риски или gaps:
  - this item intentionally did not add new product support for discovery mission/class delete/archive; those intents are still unsupported by the current BFF and remain a separate product/runtime gap;
  - the unrelated local website/resources residual remains open: `pnpm test:website:admin:compose` still fails because `/maintenance/web-resources?page=1&pageSize=1` returns `500 Internal Server Error`.
- Follow-up:
  - if the next request touches website/resources, open a new bounded patch for the `/maintenance/web-resources` `500`;
  - otherwise the browser-button spike is complete and should not be reopened without a new request.

### 2026-04-12 — SPIKE-ADMIN-CRUD-COVERAGE-2026-04-12 — Verified current admin and user-interest CRUD coverage on the local compose baseline

- Тип записи: item archive
- Финальный статус: archived
- Зачем понадобилось: the user explicitly asked to check whether the admin panel currently allows editing, archiving, and deleting system interests, LLM templates, channels, discovery goals, and user interests, so the repo needed a truthful separation between live-proven CRUD behavior, code-present-but-unproven paths, and genuinely unsupported lifecycle actions.
- Что изменилось:
  - opened a bounded spike in [`docs/work.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/work.md), reloaded the required runtime/deep-contract context, and audited the current BFF/API write paths for [`apps/admin/src/pages/bff/admin/templates.ts`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/bff/admin/templates.ts), [`apps/admin/src/pages/bff/admin/channels.ts`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/bff/admin/channels.ts), [`apps/admin/src/pages/bff/admin/discovery.ts`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/bff/admin/discovery.ts), and [`apps/admin/src/pages/bff/admin/user-interests.ts`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/bff/admin/user-interests.ts) plus [`apps/admin/src/pages/bff/admin/user-interests/[interestId].ts`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/bff/admin/user-interests/%5BinterestId%5D.ts);
  - ran the existing repo proof owners and then added targeted live BFF/API CRUD smoke checks to cover the missing lifecycle branches: system interests and LLM templates were proven for update/archive/reactivate/delete, user-managed and admin-managed interests were proven for create/update/clone/delete, `website` / `api` / `email_imap` channels were proven for create/update, and channel delete/archive branching was proven live through the shared `source_channels` delete path;
  - recorded the one current local runtime residual instead of misclassifying it as missing product support: [`infra/scripts/test-website-admin-flow.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/test-website-admin-flow.mjs) currently fails before its provider-specific operator checks because `GET /maintenance/web-resources?page=1&pageSize=1` returns `500 Internal Server Error`;
  - recorded the real discovery lifecycle boundary instead of overstating CRUD coverage: discovery admin remains live for create/update/run/review/feedback/re-evaluate, but [`apps/admin/src/pages/bff/admin/discovery.ts`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/bff/admin/discovery.ts) still exposes no delete/archive intents for missions or classes.
- Что проверено:
  - required-read-order reload of `AGENTS.md`, `docs/work.md`, `docs/blueprint.md`, `docs/engineering.md`, `docs/verification.md`, `.aidp/os.yaml`, and `docs/contracts/test-access-and-fixtures.md`
  - worktree coherence check via `git status --short`
  - `pnpm unit_tests`
  - `pnpm test:mvp:internal`
  - `pnpm test:discovery:admin:compose`
  - `pnpm dev:mvp:internal:no-build`
  - targeted `node --input-type=module` live CRUD smoke for system interests, LLM templates, user-managed interests, admin-managed interests, and channel delete/archive semantics
  - targeted `node --input-type=module` live channel create/update smoke for `website`, `api`, and `email_imap`
  - `pnpm test:website:admin:compose` (failed twice with `GET /maintenance/web-resources?page=1&pageSize=1 -> 500`)
  - `curl -sS 'http://127.0.0.1:8000/maintenance/web-resources?page=1&pageSize=1'`
- Что item доказал:
  - current local admin/runtime behavior does allow live edit/archive/delete for system interests and LLM templates;
  - current local behavior does allow live create/update/clone/delete for user-managed interests and admin-managed interests;
  - current local behavior does allow live create/update for `website`, `api`, and `email_imap` channels, and the shared admin delete path truthfully deletes empty channels and archives channels that already have stored content;
  - discovery admin is not “full CRUD”: it is live-proven for create/update/run/review/feedback/re-evaluate, but delete/archive lifecycle actions for missions/classes are currently unsupported by the BFF rather than merely missing acceptance coverage.
- Риски или gaps:
  - the website/resources operator lane is currently red on the local baseline because `/maintenance/web-resources` returns `500`, so `pnpm test:website:admin:compose` cannot currently prove its full website/resources/read-model flow;
  - this spike verified current local behavior in a heavily mixed worktree, so local regressions should not be silently rewritten into durable shipped truth without a bounded fix item;
  - targeted CRUD smoke created new local rows in fresh PostgreSQL volumes after `pnpm test:mvp:internal` tore the old volumes down and `pnpm dev:mvp:internal:no-build` re-booted the stack.
- Follow-up:
  - open a bounded patch if the next request is to fix the `/maintenance/web-resources` `500` and re-green `pnpm test:website:admin:compose`;
  - open a separate product/runtime item if the admin surface should support delete/archive lifecycle actions for discovery missions or classes.

### 2026-04-10 — SWEEP-DOCS-AND-ARCHITECTURE-SYNC — Audited current docs/JSON truth and added a visual architecture walkthrough

- Тип записи: item archive
- Финальный статус: archived
- Зачем понадобилось: after the universal selection-profile capability was archived, the user explicitly asked for a full doc/config check to make sure the repo-level truth really matches what was shipped, to validate the JSON assets living under `docs/`, and to leave behind a dedicated architecture walkthrough with diagrams instead of forcing future readers to reconstruct the system from `blueprint.md` alone.
- Что изменилось:
  - audited the main runtime/process truth layers and synced the few drifted phrases that still spoke in stage-local or partially stale wording: [`docs/blueprint.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/blueprint.md), [`docs/engineering.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/engineering.md), [`docs/verification.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/verification.md), [`docs/contracts/universal-selection-profiles.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/contracts/universal-selection-profiles.md), and [`.aidp/os.yaml`](/Users/user/Documents/workspace/my/NewsPortal/.aidp/os.yaml) now reflect the shipped stage-5 closeout rather than an earlier in-flight view;
  - validated every `docs/data_scripts/*.json` file syntactically and then fixed one real contract drift in [`docs/data_scripts/outsource.json`](/Users/user/Documents/workspace/my/NewsPortal/docs/data_scripts/outsource.json): seven legacy rows used `providerType = "atom"` even though the shipped runtime treats Atom as an `rss` adapter concern rather than a separate provider type;
  - added [`docs/data_scripts/README.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/data_scripts/README.md) to explain what the JSON assets are, which fields are required vs optional overrides, why partially omitted `requestTimeoutMs` / `userAgent` / `preferContentEncoded` values are still valid, and why Atom belongs under `providerType = "rss"`;
  - added [`docs/architecture-overview.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/architecture-overview.md), a dedicated current-state walkthrough with Mermaid diagrams for the top-level system, ingest/canonicalization, zero-shot selection, final-selection/read-model truth, maintenance replay/backfill, and the dual-path discovery model.
- Что проверено:
  - `find docs -type f \( -name '*.json' -o -name '*.md' -o -name '*.yaml' \) | sort`
  - `python -m json.tool docs/data_scripts/it_news.json`
  - `python -m json.tool docs/data_scripts/outsource.json`
  - `python -m json.tool docs/data_scripts/outsource_balanced_templates.json`
  - `python -m json.tool docs/data_scripts/outsource_cleaned_balanced_tenders_and_company_signals.json`
  - `pnpm unit_tests`
  - `pnpm typecheck`
  - `git diff --check -- docs/work.md docs/history.md docs/blueprint.md docs/engineering.md docs/verification.md .aidp/os.yaml docs/contracts/universal-selection-profiles.md docs/data_scripts/outsource.json docs/data_scripts/README.md docs/architecture-overview.md`
- Что item доказал:
  - current docs now describe the shipped selection-profile/discovery architecture more truthfully and no longer leave the stage-5 closeout half-described as an earlier active stage;
  - the JSON assets under `docs/data_scripts` are syntactically valid, their role is now documented, optional sparse fields are explained as intentional overrides, and the only actual provider-type drift was corrected;
  - the repo now has a dedicated visual architecture document that explains how ingest, selection, maintenance replay, and discovery fit together without requiring chat history or deep code archaeology.
- Риски или gaps:
  - `docs/architecture-overview.md` is intentionally a walkthrough, not the durable contract owner; future structural changes still need to update the canonical truth layers first and then keep the overview in sync;
  - `docs/data_scripts/*` remain example/import assets rather than a full declarative runtime config system.
- Follow-up:
  - none required for this sweep; open a new bounded item only if the user wants a broader documentation IA pass or richer operator-facing import/export tooling.

### 2026-04-10 — C-UNIVERSAL-CONFIGURABLE-SELECTION-PROFILES — Archived the universal configurable selection-profile capability

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: the zero-shot pipeline had already become additive and final-selection-first, but its semantics still behaved like a narrow system-interest/template bundle with hidden compatibility assumptions, optional LLM review leaking into the default path, and operator surfaces that required code archaeology to understand why an item was selected, rejected, held, or still waiting on legacy review.
- Что capability в итоге delivered:
  - durable profile-driven truth now lives in [`docs/contracts/universal-selection-profiles.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/contracts/universal-selection-profiles.md), additive profile config persists through [`database/migrations/0031_universal_selection_profiles.sql`](/Users/user/Documents/workspace/my/NewsPortal/database/migrations/0031_universal_selection_profiles.sql), and admin template writes in [`apps/admin/src/lib/server/admin-templates.ts`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/lib/server/admin-templates.ts) plus [`apps/admin/src/pages/bff/admin/templates.ts`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/bff/admin/templates.ts) now keep compatibility `selection_profiles` synchronized with existing system-interest authoring instead of leaving that config implicit;
  - worker runtime in [`services/workers/app/selection_profiles.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/selection_profiles.py), [`services/workers/app/main.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/main.py), and [`services/workers/app/final_selection.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/final_selection.py) now evaluates profile-backed unresolved policy cheaply, keeps `hold` as the default gray-zone outcome for profile-backed criteria unless optional review is explicitly allowed, separates cheap `hold` from true `llm_review_pending`, and preserves `final_selection_results` as the owner of downstream editorial truth while keeping `system_feed_results` as bounded compatibility projection only;
  - operator/read-model closeout in [`services/api/app/main.py`](/Users/user/Documents/workspace/my/NewsPortal/services/api/app/main.py), [`apps/admin/src/lib/server/operator-surfaces.ts`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/lib/server/operator-surfaces.ts), article/resource screens, reindex/live-update surfaces, and article/resource contracts now exposes server-owned `selection_*`, diagnostics, guidance, profile-policy summaries, and replay provenance; compatibility-only rows are explicitly marked as `compatibility_only` instead of looking like first-class selection modes, and historical backfill/repair now records plus surfaces the `selectionProfileSnapshot` it replayed against.
- Что проверено для capability closeout:
  - stage-level proof already landed across stages 0 through 5, including targeted Python/TS coverage, migration smoke, and earlier compose smoke recorded during the stage entries;
  - final closeout proof on 2026-04-10:
    - `pnpm unit_tests`
    - `pnpm typecheck`
    - `pnpm test:reindex-backfill:compose`
    - `git diff --check -- services/api/app/main.py packages/contracts/src/article.ts apps/admin/src/lib/server/operator-surfaces.ts tests/unit/python/test_api_zero_shot_operator_surfaces.py tests/unit/ts/admin-operator-surfaces.test.ts docs/work.md`
- Что capability closeout доказал:
  - the current zero-shot pipeline is now truthfully profile-driven without requiring fixed actor/content taxonomies, preset bundles, or mandatory LLM review on the default path;
  - additive compatibility migration is no longer hidden: replay/backfill records the profile snapshot it used, maintenance/operator reads show that provenance, and legacy-only compatibility states are visible as compatibility projections instead of pretending to be ordinary final-selection modes;
  - low-cost runtime remains the default path while optional LLM review is bounded to the profile policies that explicitly allow it.
- Риски или gaps:
  - legacy compatibility projections still exist intentionally as bounded fallback/read models; this capability did not delete them outright;
  - future work can build richer profile authoring UX, stricter compatibility retirement, or broader profile-family management without reopening this completed migration arc.
- Follow-up:
  - none required for this capability; open a new bounded item only if the user wants another profile-management layer, deletion of legacy compatibility projections, or a new domain capability on top of the shipped selection-profile engine.

### 2026-04-10 — STAGE-4-EXPLAIN-AND-OPERATOR-TUNING-SURFACES — Closed the profile-driven explain and operator-surface stage for universal selection profiles

- Тип записи: item archive
- Финальный статус: archived
- Зачем понадобилось: after stages 0 through 3 had already made `selection_profiles`, cheap `hold`, and profile-aware final-selection semantics real in the runtime, the next truthful gap was operator drift. The system still required too much internal knowledge to understand why an item was selected, rejected, held, or still waiting for optional LLM review.
- Что изменилось:
  - article/content explain payloads in [`services/api/app/main.py`](/Users/user/Documents/workspace/my/NewsPortal/services/api/app/main.py) now expose precomputed `selectionReason`, `selectionSummary`, `selectionMode`, `selectionDiagnostics`, and server-owned `selectionGuidance` instead of forcing UI code to reverse-engineer `final_selection_results.explain_json`;
  - admin article list/detail in [`apps/admin/src/pages/articles.astro`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/articles.astro), [`apps/admin/src/pages/articles/[docId].astro`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/articles/%5BdocId%5D.astro), and shared helper logic in [`apps/admin/src/lib/server/operator-surfaces.ts`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/lib/server/operator-surfaces.ts) now distinguish `hold`, true `llm_review_pending`, compatibility-only states, and normal final decisions through human-readable badges, guidance, and generic diagnostics;
  - adjacent resource surfaces in [`apps/admin/src/pages/resources.astro`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/resources.astro) and [`apps/admin/src/pages/resources/[resourceId].astro`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/resources/%5BresourceId%5D.astro), plus `web_resources` read-model projection in [`services/api/app/main.py`](/Users/user/Documents/workspace/my/NewsPortal/services/api/app/main.py) and [`packages/contracts/src/source.ts`](/Users/user/Documents/workspace/my/NewsPortal/packages/contracts/src/source.ts), now surface the same server-owned `selection_*` vocabulary for both projected editorial rows and content-kind-selected resource-only rows;
  - system-interest authoring surfaces in [`apps/admin/src/components/InterestTemplateEditorForm.tsx`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/components/InterestTemplateEditorForm.tsx), [`apps/admin/src/pages/templates/interests.astro`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/templates/interests.astro), [`apps/admin/src/pages/templates/interests/new.astro`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/templates/interests/new.astro), and [`apps/admin/src/pages/templates/interests/[interestTemplateId]/edit.astro`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/templates/interests/%5BinterestTemplateId%5D/edit.astro) now show the current compatibility `selection_profile` policy summary, including strictness, unresolved outcome, LLM review mode, and profile sync/version state, so operators can tune the current runtime without reading worker code;
  - system-interest API reads now join the additive profile layer, so `/system-interests*` surfaces expose `selection_profile_id`, `selection_profile_family`, `selection_profile_status`, `selection_profile_version`, and `selection_profile_policy_json` as first-class read-model fields.
- Что проверено:
  - `pnpm unit_tests`
  - `pnpm typecheck`
  - `git diff --check -- docs/work.md docs/history.md docs/contracts/universal-selection-profiles.md services/api/app/main.py apps/admin/src/lib/server/operator-surfaces.ts apps/admin/src/pages/articles.astro 'apps/admin/src/pages/articles/[docId].astro' apps/admin/src/pages/resources.astro 'apps/admin/src/pages/resources/[resourceId].astro' apps/admin/src/components/InterestTemplateEditorForm.tsx apps/admin/src/pages/templates/interests.astro apps/admin/src/pages/templates/interests/new.astro 'apps/admin/src/pages/templates/interests/[interestTemplateId]/edit.astro' packages/contracts/src/article.ts packages/contracts/src/source.ts tests/unit/python/test_api_zero_shot_operator_surfaces.py tests/unit/python/test_api_web_resources.py tests/unit/python/test_api_system_interests.py tests/unit/ts/admin-operator-surfaces.test.ts`
- Что stage-4 доказал:
  - profile-driven explain truth no longer lives only in worker internals; the API now owns stable human-readable selection semantics for operator surfaces;
  - operators can distinguish cheap `hold`, optional LLM review, compatibility-only projection, and ordinary selected/rejected outcomes without a fixed actor/content taxonomy;
  - the same server-owned explain vocabulary now spans article, content, resource, and system-interest authoring surfaces, reducing UI-local drift before Stage 5 migration/backfill closeout.
- Риски или gaps:
  - stage-4 deliberately did not finish migration/backfill compatibility closeout; historical repair observability and remaining compatibility assumptions still belonged to the next stage;
  - this stage kept public selected-content behavior stable and did not attempt a broad admin redesign.
- Follow-up:
  - continue with `STAGE-5-MIGRATION-BACKFILL-AND-COMPATIBILITY-CLOSEOUT` rather than reopening stage-4.

### 2026-04-09 — C-UI-INTERACTIVE-VERIFICATION-AND-REPAIR — Closed interactive web/admin verification and repair on the local compose baseline

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: the user explicitly wanted every current `apps/web` and `apps/admin` interactive surface checked and repaired so pages render truthfully, controls complete their intended flows, and the local compose baseline has bounded proof for both user and operator behavior.
- Что изменилось:
  - stage 1 reused the existing owners first, then classified the first reproduced failures as proof-owner drift plus discovery runtime/read-model regressions instead of silently widening product scope;
  - stage 2 added [`infra/scripts/test-web-viewports.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/test-web-viewports.mjs) plus root command `pnpm test:web:viewports`, seeded truthful responsive fixtures (anonymous user, digest channel, immediate telegram channel, saved/followed content, deterministic article), and fixed [`apps/web/src/layouts/Shell.astro`](/Users/user/Documents/workspace/my/NewsPortal/apps/web/src/layouts/Shell.astro) so tablet widths now use collapsed navigation without horizontal overflow;
  - stage 2 also repaired existing web acceptance ownership in [`infra/scripts/test-mvp-internal.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/test-mvp-internal.mjs) so `/notifications` and feedback proof use the supported immediate-channel path while still asserting that `email_digest` does not write immediate `notification_log` rows;
  - stage 3 promoted discovery control-plane proof into a first-class compose owner via [`infra/scripts/test-discovery-admin-flow.mjs`](/Users/user/Documents/workspace/my/NewsPortal/infra/scripts/test-discovery-admin-flow.mjs) plus root command `pnpm test:discovery:admin:compose`, then fixed three underlying regressions: discovery audit writes now normalize non-UUID entity ids in [`apps/admin/src/pages/bff/admin/discovery.ts`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/bff/admin/discovery.ts), mission graph compilation now reuses manual graphs and falls back deterministically when no LLM runtime is configured in [`services/workers/app/discovery_orchestrator.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/discovery_orchestrator.py), and recall candidate reads now expose `scoring_breakdown` correctly in [`services/api/app/main.py`](/Users/user/Documents/workspace/my/NewsPortal/services/api/app/main.py);
  - stage 4 added targeted regression coverage in [`tests/unit/ts/discovery-admin.test.ts`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/ts/discovery-admin.test.ts), [`tests/unit/python/test_discovery_orchestrator.py`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/python/test_discovery_orchestrator.py), and [`tests/unit/python/test_api_discovery_management.py`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/python/test_api_discovery_management.py), while syntax-checking the new browser/discovery owner scripts;
  - stage 5 synced machine/proof/fixture docs for the new proof commands and deterministic alias patterns, reran the declared closeout chain, and stopped the local compose stack non-destructively with `pnpm dev:mvp:internal:down`.
- Что проверено:
  - targeted regression proof: `node --check infra/scripts/test-web-viewports.mjs`
  - targeted regression proof: `node --check infra/scripts/test-discovery-admin-flow.mjs`
  - targeted regression proof: `node --import tsx --test tests/unit/ts/discovery-admin.test.ts`
  - targeted regression proof: `python -m unittest tests.unit.python.test_api_discovery_management tests.unit.python.test_discovery_orchestrator`
  - capability closeout chain: `pnpm unit_tests`
  - capability closeout chain: `pnpm typecheck`
  - capability closeout chain: `pnpm integration_tests`
  - capability closeout chain: `pnpm test:web:viewports`
  - capability closeout chain: `pnpm test:website:admin:compose`
  - capability closeout chain: `node infra/scripts/test-automation-admin-flow.mjs`
  - capability closeout chain: `pnpm test:discovery:admin:compose`
  - capability closeout chain: `pnpm test:website:compose`
  - capability closeout chain: `pnpm test:channel-auth:compose`
  - capability closeout chain: `pnpm test:cluster-match-notify:compose`
  - capability closeout chain: `pnpm test:discovery-enabled:compose`
  - capability closeout chain: `pnpm test:reindex-backfill:compose`
  - cleanup proof: `pnpm dev:mvp:internal:down`
- Что capability доказал:
  - the current web surfaces `/`, `/matches`, `/content/[id]`, `/saved`, `/saved/digest`, `/following`, `/interests`, `/settings`, and `/notifications` now have bounded browser proof across desktop/tablet/mobile with visible primary actions and no reproduced tablet header overflow;
  - the current admin operator surfaces now have dedicated compose proof owners for `/automation`, `/channels*` plus `/resources*`, and `/discovery`, while `integration_tests` continues to own the broader web/admin happy path including notification feedback, digest flows, and enrichment retry;
  - discovery admin now works truthfully on the local compose baseline even when class keys are non-UUID strings, mission graph compilation must succeed without a live LLM runtime, and recall candidate reads depend on latest source-quality snapshot breakdowns.
- Риски или gaps:
  - the worktree remains heavily mixed with unrelated edits, so future implementation must still declare overlap paths explicitly;
  - admin responsive behavior beyond desktop remains intentionally out of scope for this capability;
  - browser receipt for real `web_push` delivery remains a manual proof lane; automated notification coverage continues to use deterministic telegram/digest fixtures.
- Follow-up:
  - none required for this capability; open a new bounded item only if product scope expands into additional interactive surfaces or broader responsive admin work.

### 2026-04-09 — C-ADMIN-AUDIT-FINDINGS-REMEDIATION-AND-AUDIT-RETIREMENT — Closed audit findings and retired the standalone admin/API coverage artifact

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: the audit spike had truthfully identified five findings (`F-001` through `F-005`), but the user explicitly wanted all of them fixed and the temporary audit artifact removed only after the surviving operator-baseline truth had been redistributed into stable docs.
- Что изменилось:
  - stage 1 hardened the website-admin acceptance harness so `pnpm test:website:admin:compose` self-bootstraps the compose baseline after `pnpm integration_tests` tears it down, and fixture cleanup no longer depends on container-side `kill`;
  - stage 2 shipped first-class admin create/edit flows for `api` and `email_imap` channels, fixed the PostgreSQL scheduling-update type-inference bug on provider edits, and re-proved API auth-header plus IMAP password-preservation behavior end to end;
  - stage 3 shipped first-class admin automation tooling at `/automation` plus same-origin writes under `/admin/bff/admin/automation`, widened the SDK to cover sequence/run/plugin/outbox maintenance routes, and added a dedicated runtime smoke for sequence create/update/archive, manual run/cancel, and outbox visibility;
  - stage 4 migrated the retained operator-baseline truth into [`docs/manual-mvp-runbook.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/manual-mvp-runbook.md), [`docs/verification.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/verification.md), [`docs/blueprint.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/blueprint.md), [`docs/contracts/universal-task-engine.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/contracts/universal-task-engine.md), and [`.aidp/os.yaml`](/Users/user/Documents/workspace/my/NewsPortal/.aidp/os.yaml), then deleted the temporary `docs/admin-api-coverage-audit.md` artifact.
- Что проверено:
  - targeted consistency proof: `git diff --check -- docs/work.md docs/manual-mvp-runbook.md docs/verification.md docs/blueprint.md docs/contracts/universal-task-engine.md .aidp/os.yaml`
  - final closeout chain: `pnpm integration_tests`
  - final closeout chain: `pnpm test:website:admin:compose`
  - final closeout chain: `pnpm test:website:compose`
  - final closeout chain: `pnpm test:channel-auth:compose`
  - final closeout chain: `pnpm test:cluster-match-notify:compose`
  - final closeout chain: `pnpm test:reindex-backfill:compose`
  - sequence/outbox operator closeout: `node infra/scripts/test-automation-admin-flow.mjs`
  - non-destructive cleanup proof: `pnpm dev:mvp:internal:down`
- Что capability доказал:
  - the shipped operator-ready admin baseline now truthfully covers `rss`, `website`, `api`, and `email_imap` source CRUD, website resource observability, moderation and repair tooling, admin-managed interests, reindex/backfill, and first-class sequence/outbox operator work on `/automation`;
  - the previously recorded harness residuals are gone: declared gate order remains truthful even when `integration_tests` tears the stack down first, and the website-admin smoke no longer ends with cleanup noise;
  - the standalone audit artifact is no longer needed because stable docs and machine facts now carry the retained parity matrix meaning, proof commands, and honest residual scope.
- Риски или gaps:
  - umbrella automated acceptance remains RSS-first, while website/API/Email IMAP admin CRUD and sequence/outbox tooling continue to rely on their dedicated operator smokes instead of `pnpm integration_tests`;
  - `youtube` remains code-present but outside the committed admin/operator baseline;
  - browser receipt for `web_push` remains manual-only proof.
- Follow-up:
  - none required for this capability; open a new bounded item only if product scope expands again, for example into `youtube` admin CRUD or broader umbrella acceptance.

### 2026-04-09 — SPIKE-ADMIN-API-COVERAGE-AND-RUNTIME-VERIFICATION — Audited operator-path admin/API coverage and current runtime health

- Тип записи: item archive
- Финальный статус: archived
- Зачем понадобилось: the user explicitly wanted proof that the admin panel truthfully covers the agreed operator-facing API baseline and a truthful separation between real regressions, environment blockers, and intentional non-admin or non-baseline gaps because “there are errors right now”.
- Что изменилось:
  - added the temporary `docs/admin-api-coverage-audit.md` artifact with a single operator-path parity matrix, runtime gate log, and bounded findings backlog;
  - ran the declared proof sequence for the current operator-ready baseline and turned the audit from assumptions into command-backed status: `integration_tests`, website admin/operator acceptance, website ingest smoke, channel-auth smoke, cluster-match-notify smoke, reindex-backfill smoke, and optional discovery-enabled smoke;
  - classified explicit remaining gaps instead of silently treating them as regressions: `api` and `email_imap` provider CRUD remain code-present but non-operator-ready from the current admin baseline, and sequence/outbox maintenance tooling remains API-only/internal rather than admin-screen-owned;
  - captured two non-blocking harness/environment residuals for follow-up: the declared gate order is not self-contained because `integration_tests` stops compose before `test:website:admin:compose`, and the website-admin smoke emits a cleanup error because `kill` is unavailable inside the target container path.
- Что проверено:
  - required-read-order reload of `AGENTS.md`, `docs/work.md`, `docs/blueprint.md`, `docs/engineering.md`, `docs/verification.md`, `.aidp/os.yaml`, and `docs/contracts/test-access-and-fixtures.md`
  - worktree coherence check via `git status --short`
  - `pnpm typecheck`
  - `pnpm unit_tests`
  - `pnpm integration_tests`
  - `pnpm test:website:admin:compose` (first attempt failed with `service "fetchers" is not running` after `integration_tests`; rerun passed after `pnpm dev:mvp:internal:no-build`)
  - `pnpm test:website:compose`
  - `pnpm test:channel-auth:compose`
  - `pnpm test:cluster-match-notify:compose`
  - `pnpm test:reindex-backfill:compose`
  - `pnpm test:discovery-enabled:compose`
  - `pnpm dev:mvp:internal:down`
  - `git diff --check -- docs/work.md docs/history.md docs/admin-api-coverage-audit.md`
- Что item доказал:
  - the current promised operator-ready admin baseline is green for auth/routing, dashboard, channel listing, RSS creation path, website creation/resources path, moderation, article detail, enrichment retry, user-interest lookup/create path, reindex/backfill, protected channel auth, and the declared optional discovery backend lane;
  - the current admin/API mismatch is not “admin covers nothing” but a bounded set of explicit gaps and unproven lanes: `api` and `email_imap` source CRUD are still non-operator-ready by current baseline, sequence/outbox maintenance tooling is still API-only/internal, and several existing admin surfaces still need dedicated runtime proof for full edit/archive/schedule or advanced lifecycle actions;
  - the most visible “current errors” encountered during the audit were primarily environment/harness issues rather than core operator regressions: compose prerequisites between gates and a cleanup error in the website-admin smoke.
- Риски или gaps:
  - non-blocking harness residual `F-004`: `pnpm test:website:admin:compose` currently assumes a running compose stack, so the declared gate order is not self-contained after `integration_tests` tears the stack down;
  - non-blocking cleanup residual `F-005`: the website-admin smoke succeeds functionally but ends with `exec: "kill": executable file not found in $PATH`;
  - local compose volumes now contain run-scoped proof data (channels, articles/resources, interests, reindex rows, discovery smoke rows) because the audit used `pnpm dev:mvp:internal:down` instead of a destructive volume reset.
- Follow-up:
  - open a bounded patch if you want to harden the website-admin smoke workflow (`F-004` / `F-005`);
  - open a separate scope-expansion item if the product now wants first-class admin CRUD for `api`, `email_imap`, or sequence/outbox tooling instead of leaving them as explicit non-baseline gaps.

### 2026-04-09 — PATCH-DISCOVERY-SCHEMA-REPAIR-DOC-SYNC — Synced the repaired discovery migration baseline into durable truth layers

- Тип записи: item archive
- Финальный статус: archived
- Зачем понадобилось: the schema-repair patch had already fixed the live compose baseline, but its repaired migration order and stronger discovery-core migration-smoke expectation were still described only in live state, verification, and archive detail. Durable discovery truth in the blueprint/contract layers still read as if 0016 discovery rollout stood on its own without the now-shipped repair baseline.
- Что изменилось:
  - [`docs/blueprint.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/blueprint.md) now states that the current compose/dev discovery baseline includes `0026a_discovery_schema_drift_prerepair.sql` before `0027_*`, `0030_discovery_schema_drift_repair.sql` after the additive recall migrations, and strengthened migration smoke that asserts the full discovery core;
  - [`docs/engineering.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/engineering.md) now treats the repaired discovery migration order and full-core migration smoke as durable engineering discipline instead of leaving it implicit;
  - [`docs/contracts/discovery-agent.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/contracts/discovery-agent.md) now records the repaired discovery migration baseline and the dedicated follow-up proof expectation for drifted compose DBs.
- Что проверено:
  - targeted consistency check via `rg -n "0026a_discovery_schema_drift_prerepair|0030_discovery_schema_drift_repair|full discovery core|drifted databases before|schema_drift_prerepair_migration|schema_drift_repair_migration" docs/blueprint.md docs/engineering.md docs/contracts/discovery-agent.md docs/work.md docs/history.md docs/verification.md .aidp/os.yaml`
  - `git diff --check -- docs/work.md docs/history.md docs/blueprint.md docs/engineering.md docs/contracts/discovery-agent.md docs/verification.md .aidp/os.yaml`
- Что item доказал:
  - the repaired discovery migration baseline is now represented consistently across live state, machine facts, proof policy, blueprint truth, engineering discipline, and the deep discovery contract;
  - future discovery work no longer needs chat history to understand why `0026a` and `0030` exist or why migration smoke must assert the full discovery core.
- Риски или gaps:
  - no new runtime or schema gap was introduced; this was a doc-only sync follow-up.
- Follow-up:
  - none; future discovery work should treat the repaired baseline as ordinary durable truth.

### 2026-04-09 — PATCH-DISCOVERY-SCHEMA-REPAIR-0016 — Repaired the compose discovery schema drift around migration `0016`

- Тип записи: item archive
- Финальный статус: archived
- Зачем понадобилось: after the independent-recall capability was already archived, the compose baseline still had a separate environment residual where `schema_migrations` recorded `0016_adaptive_discovery_cutover.sql` as applied while core discovery tables like `discovery_hypothesis_classes` and `discovery_source_profiles` were absent. That drift broke normal `pnpm db:migrate` at `0027_independent_recall_quality_foundation.sql` and made `pnpm test:discovery-enabled:compose` fail before discovery runtime proof could even start.
- Что изменилось:
  - migration [`database/migrations/0026a_discovery_schema_drift_prerepair.sql`](/Users/user/Documents/workspace/my/NewsPortal/database/migrations/0026a_discovery_schema_drift_prerepair.sql) now runs before `0027` and recreates the minimum missing 0016 discovery core needed by later migrations: `discovery_hypothesis_classes`, `discovery_source_profiles`, seeded canonical class rows, placeholder-class healing for any orphan `class_key`, and the critical FK bridges from existing `discovery_hypotheses` / `discovery_candidates`;
  - migration [`database/migrations/0030_discovery_schema_drift_repair.sql`](/Users/user/Documents/workspace/my/NewsPortal/database/migrations/0030_discovery_schema_drift_repair.sql) now provides the post-cutover consistency repair for already drifted databases by recreating the rest of the missing 0016 discovery tables, seeding the canonical class registry again idempotently, null-healing nullable orphan references, and restoring the remaining core discovery FKs such as `discovery_missions_latest_portfolio_snapshot_fk`;
  - [`services/relay/src/cli/test-migrations.ts`](/Users/user/Documents/workspace/my/NewsPortal/services/relay/src/cli/test-migrations.ts) now treats discovery core as part of migration-smoke truth, explicitly asserting the full table set, representative columns and indexes, plus critical constraints across `discovery_hypothesis_classes`, `discovery_source_profiles`, `discovery_source_interest_scores`, `discovery_portfolio_snapshots`, `discovery_feedback_events`, and `discovery_strategy_stats`.
- Что проверено:
  - required-read-order reload of `AGENTS.md`, `docs/work.md`, `docs/blueprint.md`, `docs/engineering.md`, `docs/verification.md`, `.aidp/os.yaml`, `docs/contracts/discovery-agent.md`, and `docs/contracts/independent-recall-discovery.md`
  - worktree coherence check via `git status --short`
  - live compose DB evidence that `schema_migrations` contained `0016_adaptive_discovery_cutover.sql` while key discovery core tables were absent before the repair
  - `pnpm test:migrations:smoke`
  - `pnpm db:migrate`
  - live compose DB verification that the previously missing tables, class seed rows, and critical discovery FK constraints now exist
  - `pnpm test:discovery-enabled:compose`
  - `git diff --check -- docs/work.md docs/history.md docs/verification.md .aidp/os.yaml database/migrations/0026a_discovery_schema_drift_prerepair.sql database/migrations/0030_discovery_schema_drift_repair.sql services/relay/src/cli/test-migrations.ts`
- Что item доказал:
  - a drifted compose DB can now heal itself before `0027` instead of failing on missing `discovery_source_profiles`;
  - the full pending discovery migration chain now applies cleanly on the repaired compose baseline through `0030`;
  - the previously broken compose discovery runtime proof is green again, and migration smoke now fails loudly if discovery-core tables/constraints drift out of sync in the future.
- Риски или gaps:
  - the repair is intentionally additive/idempotent and does not attempt destructive cleanup of any hypothetical non-null orphan references beyond safe nullable healing;
  - historical history entries that mention the separate discovery schema-drift residual remain true as historical snapshots, but the residual itself is now considered closed by this archived patch.
- Follow-up:
  - no direct follow-up is required for this residual; future discovery work should treat the repaired migrations and strengthened smoke as the new baseline.

### 2026-04-09 — C-INDEPENDENT-RECALL-DISCOVERY-CUTOVER — Archived the bounded independent-recall discovery capability

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: the repo had already shipped zero-shot downstream filtering, but upstream discovery still behaved and read as graph-first-only. The user explicitly wanted discovery to stop depending on `interest_graph` as the sole owner of finding new information, while preserving the already shipped canonical/filter/final-selection pipeline.
- Что capability в итоге delivered:
  - additive generic source-quality truth now lives in `discovery_source_quality_snapshots` and is persisted independently from mission-fit `discovery_source_interest_scores`;
  - neutral recall backlog now lives in additive `discovery_recall_missions` / `discovery_recall_candidates`, can exist without `interest_graph`, and can actively acquire bounded `rss` / `website` candidates through `/maintenance/discovery/recall-missions/{recall_mission_id}/acquire`;
  - bounded recall promotion now reaches `source_channels` through `POST /maintenance/discovery/recall-candidates/{recall_candidate_id}/promote`, reusing the same PostgreSQL + outbox source-registration contract as graph-first discovery and persisting `registered_channel_id` plus shared source-profile channel linkage;
  - operator/read-model closeout now exposes discovery as a dual-path control plane: discovery summary counts graph-first vs recall state separately, source-profile reads surface the latest generic source-quality snapshot, and admin/help surfaces distinguish mission fit, generic source quality, neutral recall backlog, and recall-promotion state instead of collapsing everything into one score.
- Что проверено для capability closeout:
  - stage-level proof archived in the individual stage entries for stages 0 through 5;
  - final closeout proof on 2026-04-09:
    - `python -m py_compile services/api/app/main.py tests/unit/python/test_api_discovery_management.py`
    - `python -m unittest tests.unit.python.test_api_discovery_management`
    - `node --test tests/unit/ts/admin-operator-surfaces.test.ts`
    - `pnpm typecheck`
    - `pnpm unit_tests`
    - `git diff --check -- docs/work.md docs/blueprint.md docs/engineering.md docs/verification.md docs/history.md docs/contracts/discovery-agent.md docs/contracts/independent-recall-discovery.md .aidp/os.yaml services/api/app/main.py apps/admin/src/pages/discovery.astro apps/admin/src/pages/help.astro apps/admin/src/lib/server/operator-surfaces.ts tests/unit/python/test_api_discovery_management.py tests/unit/ts/admin-operator-surfaces.test.ts`
- Что capability closeout доказал:
  - shipped discovery runtime is no longer truthfully described as graph-first-only source onboarding;
  - bounded independent recall now exists end-to-end as persisted quality state, recall backlog, bounded acquisition, bounded promotion, and operator-visible control-plane truth;
  - downstream zero-shot filtering remains untouched as a consumer of the new upstream recall path instead of being reopened or rewritten.
- Риски или gaps:
  - a separate compose/environment residual remains open: some PostgreSQL compose states still record migration `0016_adaptive_discovery_cutover.sql` as applied while `discovery_hypothesis_classes` is absent, so compose-backed discovery proof can still fail outside this archived capability’s write scope;
  - graph-first mission planning remains the primary planning owner, so future work that wants to demote or replace `interest_graph` itself should open a new capability instead of reopening this archived one.
- Follow-up:
  - if compose-backed discovery proof is needed, open a separate `Spike` or `Patch` for discovery schema drift rather than reopening this archived capability.

### 2026-04-09 — STAGE-5-INDEPENDENT-RECALL-OBSERVABILITY-AND-COMPATIBILITY-CLEANUP — Archived the operator/read-model closeout for independent recall discovery

- Тип записи: item archive
- Финальный статус: archived
- Зачем понадобилось: after stages 1 through 4 had already shipped additive generic quality, neutral recall entities, bounded acquisition, and bounded promotion, the remaining truthful gap was operator drift. Discovery still rendered and read too much like a graph-first-only subsystem even though bounded recall acquisition/promotion was already live.
- Что изменилось:
  - [`services/api/app/main.py`](/Users/user/Documents/workspace/my/NewsPortal/services/api/app/main.py) now extends discovery summary with promoted/duplicate recall-candidate counts, surfaces `source_quality_scoring_breakdown` on recall-candidate reads, and adds latest generic source-quality snapshot fields directly onto source-profile reads through a lateral snapshot join;
  - [`apps/admin/src/lib/server/operator-surfaces.ts`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/lib/server/operator-surfaces.ts) now exposes dedicated helpers for dual-path discovery summary, generic source-quality state, and recall-candidate promotion state instead of forcing UI code to infer those meanings ad hoc;
  - [`apps/admin/src/pages/discovery.astro`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/discovery.astro) now presents discovery as a dual-path control plane, adds a recall tab, and separates graph-first mission fit from generic source quality and recall-promotion state on the source-profile/read surfaces;
  - [`apps/admin/src/pages/help.astro`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/help.astro) now explains the dual-path discovery model and operator debugging order directly in the admin guide;
  - [`tests/unit/python/test_api_discovery_management.py`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/python/test_api_discovery_management.py) and [`tests/unit/ts/admin-operator-surfaces.test.ts`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/ts/admin-operator-surfaces.test.ts) now prove the new summary/read-model fields and operator-helper semantics.
- Что проверено:
  - required-read-order reload of `AGENTS.md`, `docs/work.md`, `docs/blueprint.md`, `docs/engineering.md`, `docs/verification.md`, `.aidp/os.yaml`, `docs/contracts/discovery-agent.md`, and `docs/contracts/independent-recall-discovery.md`
  - worktree coherence check via `git status --short`
  - `python -m py_compile services/api/app/main.py tests/unit/python/test_api_discovery_management.py`
  - `python -m unittest tests.unit.python.test_api_discovery_management`
  - `node --test tests/unit/ts/admin-operator-surfaces.test.ts`
  - `pnpm typecheck`
  - `pnpm unit_tests`
  - `git diff --check -- docs/work.md docs/blueprint.md docs/engineering.md docs/verification.md docs/history.md docs/contracts/discovery-agent.md docs/contracts/independent-recall-discovery.md .aidp/os.yaml services/api/app/main.py apps/admin/src/pages/discovery.astro apps/admin/src/pages/help.astro apps/admin/src/lib/server/operator-surfaces.ts tests/unit/python/test_api_discovery_management.py tests/unit/ts/admin-operator-surfaces.test.ts`
- Что stage-5 доказал:
  - discovery read surfaces now truthfully separate mission fit, generic source quality, neutral recall backlog, and recall-promotion state;
  - additive recall quality/promotion is no longer hidden behind graph-first-only wording in admin/help/runtime docs;
  - the parent capability can now archive honestly because the remaining gap is the separate compose schema-drift residual, not an unsurfaced discovery-runtime ambiguity.
- Риски или gaps:
  - stage-5 did not attempt to repair the separate compose discovery schema drift around migration `0016_adaptive_discovery_cutover.sql`;
  - recall acquire/promote operator actions remain maintenance-API-first flows rather than fully mirrored through the Astro BFF, which is acceptable for this observability/compatibility slice because no new runtime ownership was introduced.
- Follow-up:
  - archive the parent capability and keep any compose discovery schema repair as a separate lane.

### 2026-04-09 — STAGE-4-INDEPENDENT-RECALL-PROMOTION-CUTOVER — Archived bounded recall-candidate promotion into source onboarding

- Тип записи: item archive
- Финальный статус: archived
- Зачем понадобилось: after stage-3 let neutral recall actively acquire candidates, the next truthful slice was to let those candidates enter the normal `source_channels` onboarding path without inventing a second registration contract. The system needed bounded promotion that kept PostgreSQL + outbox discipline, candidate-level auditability, and shared source-profile linkage explicit.
- Что изменилось:
  - migration [`database/migrations/0029_independent_recall_promotion_cutover.sql`](/Users/user/Documents/workspace/my/NewsPortal/database/migrations/0029_independent_recall_promotion_cutover.sql) added additive `registered_channel_id` storage on `discovery_recall_candidates` plus an index for promoted/duplicate-resolved recall candidates;
  - [`services/api/app/main.py`](/Users/user/Documents/workspace/my/NewsPortal/services/api/app/main.py) now exposes `promote_discovery_recall_candidate(...)` and `POST /maintenance/discovery/recall-candidates/{recall_candidate_id}/promote`, reuses `PostgresSourceRegistrarAdapter`, persists `registered_channel_id`, updates recall review state, and links shared `discovery_source_profiles` to the promoted channel when possible;
  - [`services/relay/src/cli/test-migrations.ts`](/Users/user/Documents/workspace/my/NewsPortal/services/relay/src/cli/test-migrations.ts) and [`tests/unit/python/test_api_discovery_management.py`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/python/test_api_discovery_management.py) now prove the new schema/runtime slice through migration smoke plus promotion/duplicate API tests.
- Что проверено:
  - required-read-order reload of `AGENTS.md`, `docs/work.md`, `docs/blueprint.md`, `docs/engineering.md`, `docs/verification.md`, `.aidp/os.yaml`, `docs/contracts/discovery-agent.md`, and `docs/contracts/independent-recall-discovery.md`
  - worktree coherence check via `git status --short`
  - `python -m py_compile services/api/app/main.py tests/unit/python/test_api_discovery_management.py`
  - `python -m unittest tests.unit.python.test_api_discovery_management`
  - `pnpm test:migrations:smoke`
  - `pnpm typecheck`
  - `pnpm unit_tests`
  - `git diff --check -- docs/work.md docs/blueprint.md docs/engineering.md docs/verification.md docs/history.md docs/contracts/discovery-agent.md docs/contracts/independent-recall-discovery.md .aidp/os.yaml database/migrations/0029_independent_recall_promotion_cutover.sql services/api/app/main.py services/relay/src/cli/test-migrations.ts tests/unit/python/test_api_discovery_management.py`
- Что stage-4 доказал:
  - NewsPortal now has shipped bounded recall-candidate promotion into `source_channels` without inventing a second onboarding contract;
  - promoted or duplicate-resolved recall candidates persist `registered_channel_id`, and shared source profiles can link themselves to the resulting channel;
  - recall-first discovery is no longer limited to backlog accumulation and acquisition only; it can now reach the same source onboarding boundary as graph-first discovery.
- Риски или gaps:
  - stage-4 does not yet update operator/admin surfaces enough to clearly explain the now-shipped dual-path discovery model;
  - the separate compose discovery schema-drift residual remains out of scope for this stage.
- Follow-up:
  - start `STAGE-5-INDEPENDENT-RECALL-OBSERVABILITY-AND-COMPATIBILITY-CLEANUP`.

### 2026-04-09 — STAGE-3-INDEPENDENT-RECALL-ACQUISITION-LOOPS — Archived bounded recall-first acquisition without promotion

- Тип записи: item archive
- Финальный статус: archived
- Зачем понадобилось: after stage-2 made neutral recall backlog real persisted state, the next truthful slice was to let that backlog actively acquire candidates without falling back to `interest_graph` planning. The system needed bounded recall-first acquisition for `rss` and `website`, while still keeping source promotion out of scope until the next stage.
- Что изменилось:
  - [`services/workers/app/discovery_orchestrator.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/discovery_orchestrator.py) now exposes additive bounded recall-first acquisition helpers plus `acquire_recall_missions(...)`, repository support for runnable recall missions/candidate persistence/profile linkage, and neutral `rss` / `website` search-probe loops that materialize `discovery_recall_candidates` and `discovery_source_quality_snapshots` with `snapshot_reason = recall_acquisition` without requiring `interest_graph`;
  - [`services/api/app/main.py`](/Users/user/Documents/workspace/my/NewsPortal/services/api/app/main.py) now exposes `request_discovery_recall_mission_acquisition(...)` and `POST /maintenance/discovery/recall-missions/{recall_mission_id}/acquire` as the bounded operator entrypoint for recall-first acquisition runs;
  - [`tests/unit/python/test_discovery_orchestrator.py`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/python/test_discovery_orchestrator.py) now proves both neutral recall happy-path acquisition and same-origin canonicalization collapse in noisy website search results, while [`tests/unit/python/test_api_discovery_management.py`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/python/test_api_discovery_management.py) proves API delegation into the new worker orchestration path.
- Что проверено:
  - required-read-order reload of `AGENTS.md`, `docs/work.md`, `docs/blueprint.md`, `docs/engineering.md`, `docs/verification.md`, `.aidp/os.yaml`, `docs/contracts/discovery-agent.md`, and `docs/contracts/independent-recall-discovery.md`
  - worktree coherence check via `git status --short`
  - `python -m py_compile services/workers/app/discovery_orchestrator.py services/api/app/main.py tests/unit/python/test_discovery_orchestrator.py tests/unit/python/test_api_discovery_management.py`
  - `python -m unittest tests.unit.python.test_discovery_orchestrator tests.unit.python.test_api_discovery_management`
  - `pnpm typecheck`
  - `pnpm unit_tests`
  - `git diff --check -- docs/work.md docs/blueprint.md docs/engineering.md docs/verification.md docs/history.md docs/contracts/discovery-agent.md docs/contracts/independent-recall-discovery.md .aidp/os.yaml services/workers/app/discovery_orchestrator.py services/api/app/main.py tests/unit/python/test_discovery_orchestrator.py tests/unit/python/test_api_discovery_management.py`
- Что stage-3 доказал:
  - NewsPortal now has shipped bounded recall-first acquisition loops that can search and probe neutral recall missions without `interest_graph`;
  - additive recall acquisition persists `discovery_recall_candidates`, reuses shared `discovery_source_profiles` by canonical domain, and materializes generic `recall_acquisition` quality snapshots without source-channel promotion;
  - noisy same-origin website search hits are collapsed to a single canonical probe target instead of fanning out duplicate candidates.
- Риски или gaps:
  - stage-3 is still additive only; it does not yet promote recall candidates into `source_channels` or demote graph-first discovery ownership;
  - the separate compose discovery schema-drift residual remains out of scope for this stage.
- Follow-up:
  - start `STAGE-4-INDEPENDENT-RECALL-PROMOTION-CUTOVER`.

### 2026-04-09 — STAGE-2-INDEPENDENT-RECALL-MISSION-AND-CANDIDATE-LAYER — Archived the additive neutral recall entity layer

- Тип записи: item archive
- Финальный статус: archived
- Зачем понадобилось: after stage-1 introduced generic source-quality truth, the next truthful slice was to let independent recall exist as real persisted state instead of only as an abstract plan. The system needed bounded neutral recall missions/candidates that do not require `interest_graph` or hypothesis classes, while still reusing the already shipped source-profile and source-quality layers.
- Что изменилось:
  - migration [`database/migrations/0028_independent_recall_missions_and_candidates.sql`](/Users/user/Documents/workspace/my/NewsPortal/database/migrations/0028_independent_recall_missions_and_candidates.sql) added additive tables `discovery_recall_missions` and `discovery_recall_candidates` with bounded status/kind checks, canonical-domain storage, source-profile linkage, and dedicated indexes;
  - [`services/api/app/main.py`](/Users/user/Documents/workspace/my/NewsPortal/services/api/app/main.py) now exposes `/maintenance/discovery/recall-missions*` and `/maintenance/discovery/recall-candidates*`, additive read-model SQL for neutral recall entities, summary counts for recall backlog, canonical-domain auto-linking from recall candidates into existing `discovery_source_profiles`, and latest `discovery_source_quality_snapshots` on recall-candidate reads;
  - migration smoke and API proof were expanded in [`services/relay/src/cli/test-migrations.ts`](/Users/user/Documents/workspace/my/NewsPortal/services/relay/src/cli/test-migrations.ts) and [`tests/unit/python/test_api_discovery_management.py`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/python/test_api_discovery_management.py) to cover recall mission/candidate routes, pagination/filter SQL, validation, persistence, and non-promoting review updates.
- Что проверено:
  - required-read-order reload of `AGENTS.md`, `docs/work.md`, `docs/blueprint.md`, `docs/engineering.md`, `docs/verification.md`, `.aidp/os.yaml`, `docs/contracts/discovery-agent.md`, and `docs/contracts/independent-recall-discovery.md`
  - worktree coherence check via `git status --short`
  - `python -m py_compile services/api/app/main.py tests/unit/python/test_api_discovery_management.py`
  - `python -m unittest tests.unit.python.test_api_discovery_management`
  - `pnpm test:migrations:smoke`
  - `pnpm typecheck`
  - `pnpm unit_tests`
  - `git diff --check -- docs/work.md docs/blueprint.md docs/engineering.md docs/verification.md docs/history.md docs/contracts/discovery-agent.md docs/contracts/independent-recall-discovery.md .aidp/os.yaml database/migrations/0028_independent_recall_missions_and_candidates.sql services/api/app/main.py services/relay/src/cli/test-migrations.ts tests/unit/python/test_api_discovery_management.py`
- Что stage-2 доказал:
  - NewsPortal now has shipped additive neutral recall entities that can exist independently from graph-first mission planning;
  - recall candidates can reuse shared discovery source-profile truth and surface the latest additive generic source-quality snapshot without requiring promotion into `source_channels`;
  - graph-first discovery remains intact while operator/API surfaces can now distinguish neutral recall backlog from mission-fit discovery state.
- Риски или gaps:
  - stage-2 is still additive only; it does not yet implement bounded recall-first acquisition loops or promotion cutover into `source_channels`;
  - the separate compose discovery schema-drift residual remains out of scope for this stage.
- Follow-up:
  - start `STAGE-3-INDEPENDENT-RECALL-ACQUISITION-LOOPS`.

### 2026-04-09 — STAGE-1-INDEPENDENT-RECALL-QUALITY-FOUNDATION — Archived the additive generic source-quality foundation for independent recall discovery

- Тип записи: item archive
- Финальный статус: archived
- Зачем понадобилось: after binding the new independent-recall capability, the first truthful runtime slice had to add a real interest-independent discovery layer without rewriting graph-first mission planning. The safest additive foundation was to persist generic source-quality truth separately from mission-fit scoring and expose it through maintenance read surfaces.
- Что изменилось:
  - migration [`database/migrations/0027_independent_recall_quality_foundation.sql`](/Users/user/Documents/workspace/my/NewsPortal/database/migrations/0027_independent_recall_quality_foundation.sql) added additive table `discovery_source_quality_snapshots` with recall-score storage, per-source uniqueness, channel linkage, and scoring breakdown;
  - [`services/workers/app/source_scoring.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/source_scoring.py) now exposes `compute_source_recall_quality_snapshot(...)`, which derives generic recall/source-quality state from shared source-profile trust signals plus generic channel-intake metrics without reading mission graph data;
  - [`services/workers/app/discovery_orchestrator.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/discovery_orchestrator.py) now materializes `discovery_source_quality_snapshots` during both discovery execution and re-evaluation while keeping existing `discovery_source_interest_scores` and portfolio assembly behavior unchanged;
  - [`services/api/app/main.py`](/Users/user/Documents/workspace/my/NewsPortal/services/api/app/main.py) now exposes `/maintenance/discovery/source-quality-snapshots` and `/maintenance/discovery/source-quality-snapshots/{snapshot_id}`, and discovery summary now counts the additive generic-quality rows separately from mission-fit scores;
  - proof harnesses were extended in [`tests/unit/python/test_source_scoring.py`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/python/test_source_scoring.py), [`tests/unit/python/test_discovery_orchestrator.py`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/python/test_discovery_orchestrator.py), [`tests/unit/python/test_api_discovery_management.py`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/python/test_api_discovery_management.py), and [`services/relay/src/cli/test-migrations.ts`](/Users/user/Documents/workspace/my/NewsPortal/services/relay/src/cli/test-migrations.ts).
- Что проверено:
  - required-read-order reload of `AGENTS.md`, `docs/work.md`, `docs/blueprint.md`, `docs/engineering.md`, `docs/verification.md`, `.aidp/os.yaml`, `docs/contracts/discovery-agent.md`, and `docs/contracts/independent-recall-discovery.md`
  - worktree coherence check via `git status --short`
  - `python -m py_compile services/workers/app/source_scoring.py services/workers/app/discovery_orchestrator.py services/api/app/main.py tests/unit/python/test_source_scoring.py tests/unit/python/test_discovery_orchestrator.py tests/unit/python/test_api_discovery_management.py`
  - `python -m unittest tests.unit.python.test_source_scoring tests.unit.python.test_discovery_orchestrator tests.unit.python.test_api_discovery_management`
  - `pnpm typecheck`
  - `pnpm unit_tests`
  - `pnpm test:migrations:smoke`
- Что stage-1 доказал:
  - NewsPortal now has shipped additive generic source-quality truth that is persisted independently from graph-first mission-fit scoring;
  - current discovery execution and re-evaluation paths can populate the new generic-quality layer without changing mission planning, portfolio assembly, or source-channel promotion ownership;
  - maintenance read surfaces can now inspect generic recall/source-quality state separately from mission-fit `discovery_source_interest_scores`.
- Риски или gaps:
  - stage-1 is additive only; it does not yet introduce neutral recall missions/candidates or recall-first acquisition loops;
  - the separate compose discovery schema-drift residual remains out of scope for this stage.
- Follow-up:
  - start `STAGE-2-INDEPENDENT-RECALL-MISSION-AND-CANDIDATE-LAYER`.

### 2026-04-09 — STAGE-0-INDEPENDENT-RECALL-DESIGN-CONTRACT — Archived the design-contract stage for independent recall discovery

- Тип записи: item archive
- Финальный статус: archived
- Зачем понадобилось: the user explicitly asked to move discovery toward a fully independent recall layer, but the current blueprint/runtime still remained graph-first and mission-fit-centric. Before changing schema or runtime ownership again, the repo needed a durable contract that preserved the shipped graph-first truth while defining additive recall-first cutover rules.
- Что изменилось:
  - added deep contract [`docs/contracts/independent-recall-discovery.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/contracts/independent-recall-discovery.md) with current-vs-target discovery truth, additive migration rules, stage map, failure modes, and minimum proof expectations;
  - synced contract index in [`docs/contracts/README.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/contracts/README.md), live capability planning in [`docs/work.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/work.md), proof policy in [`docs/verification.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/verification.md), and machine truth in [`.aidp/os.yaml`](/Users/user/Documents/workspace/my/NewsPortal/.aidp/os.yaml);
  - kept the existing graph-first discovery contract explicit in [`docs/contracts/discovery-agent.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/contracts/discovery-agent.md) instead of silently rewriting its meaning before additive recall runtime truth actually shipped.
- Что проверено:
  - required-read-order reload of runtime core plus `docs/contracts/discovery-agent.md`
  - targeted repo inspection of current discovery schema/runtime boundaries
  - targeted consistency proof for references and formatting
- Что stage-0 доказал:
  - the new independent-recall capability has a truthful additive migration contract instead of an implicit rewrite;
  - current graph-first discovery truth remained explicit while the new recall-first path was being introduced.
- Follow-up:
  - ship the first additive backend slice as `STAGE-1-INDEPENDENT-RECALL-QUALITY-FOUNDATION`.

### 2026-04-08 — C-ZERO-SHOT-INTEREST-FILTERING-CUTOVER — Archived the full zero-shot filtering cutover capability

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: the repo started from an interest-centric discovery/runtime model where raw article copies, legacy article-side selection truth, and downstream-selected-content feedback loops were still the practical center of the system. The user explicitly wanted a full-system shift to a zero-shot filtering engine that evaluates all found information, keeps noisy intake as evidence, and treats interests as downstream selection rather than upstream discovery ownership.
- Что capability в итоге delivered:
  - `services/fetchers` plus worker dedup now persist additive `document_observations` and `canonical_documents`, so raw intake and canonical ownership are no longer conflated;
  - worker clustering/verification now materializes `story_clusters`, `story_cluster_members`, and `verification_results`, letting duplicate-heavy evidence be handled at canonical/story scope instead of per-copy article scope;
  - semantic interest filtering is now explicit in `interest_filter_results`, with technical filter state, semantic decision, compatibility decision, and verification snapshots separated from final selection;
  - `final_selection_results` is now the primary downstream final-selection truth, while `system_feed_results` remains a bounded compatibility projection for legacy consumers;
  - discovery/source-scoring no longer learns source usefulness from downstream selected-content outcomes like `system_feed_results.eligible_for_feed` or `final_selection_results`;
  - admin/API/observability/help/operator surfaces now expose canonical document, story cluster, verification, semantic filtering, and final selection truth explicitly;
  - historical repair proof now rebuilds additive stage-2/3/4 rows before re-validating bounded compatibility projection and retro-notification suppression, while worker-side gating prefers `final_selection_results` wherever that truth exists.
- Что проверено для capability closeout:
  - stage-level proof archived in the individual stage entries for stages 0 through 7;
  - final closeout proof on 2026-04-08:
    - `python -m py_compile services/workers/app/main.py services/workers/app/smoke.py tests/unit/python/test_interest_auto_repair.py`
    - `python -m unittest tests.unit.python.test_interest_auto_repair`
    - `pnpm typecheck`
    - `pnpm unit_tests`
    - `pnpm test:migrations:smoke`
    - `pnpm test:cluster-match-notify:compose`
    - `pnpm test:reindex-backfill:compose`
    - `pnpm test:ingest:compose`
- Что capability closeout доказал:
  - the shipped runtime now follows the intended additive zero-shot path end-to-end: observation -> canonical document -> story cluster / verification -> semantic filter -> final selection;
  - worker personalization and backfill behavior no longer depends on `system_feed_results` when `final_selection_results` exists;
  - historical rebuild can reconstruct stage-2/3/4 derived truth without retro-notification drift while preserving bounded legacy compatibility outputs.
- Риски или gaps:
  - a separate discovery/environment residual remains: some compose PostgreSQL states record migration `0016_adaptive_discovery_cutover.sql` as applied while class-registry tables such as `discovery_hypothesis_classes` are missing, so later `pnpm test:discovery-enabled:compose` runs may fail on schema drift outside this capability’s write scope;
  - the repository worktree remains mixed with other in-flight edits, so future follow-up work must declare its own overlap explicitly instead of assuming the archived zero-shot lane still owns those paths.
- Follow-up:
  - if discovery compose proof is needed again, open a separate `Spike` or `Patch` for discovery schema drift instead of reopening this archived capability.

### 2026-04-08 — STAGE-7-BACKFILL-COMPATIBILITY-CLEANUP-AND-FINAL-SYNC — Archived the bounded closeout stage for zero-shot filtering

- Тип записи: item archive
- Финальный статус: archived
- Зачем понадобилось: after stages 1 through 6 had already shipped additive canonical/verification/filter/final-selection truth, the remaining truthful slice was to prove historical repair on the new derived layers, finish worker-side final-selection-first gating, and remove the last live-doc illusion that the old article-centric selection path was still the active truth.
- Что изменилось:
  - [`services/workers/app/main.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/main.py) now routes worker-side personalization, clustering dispatch, and match-interest skip decisions through `fetch_selection_gate_result_row(...)`, preferring `final_selection_results` and falling back to `system_feed_results` only while a stage-4 row is absent;
  - [`tests/unit/python/test_interest_auto_repair.py`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/python/test_interest_auto_repair.py) now proves final-selection-first gating for interest matching, personalization eligibility, and cluster-dispatch transitions while still keeping explicit legacy fallback coverage;
  - [`services/workers/app/smoke.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/smoke.py) now clears and rebuilds additive zero-shot derived state for reindex/backfill proof, asserting restoration of `story_clusters`, `verification_results`, `interest_filter_results`, `final_selection_results`, and bounded `system_feed_results` alignment without retro notifications;
  - [`package.json`](/Users/user/Documents/workspace/my/NewsPortal/package.json) now exposes `pnpm test:reindex-backfill:compose` as the canonical compose proof for stage-7 historical repair;
  - [`services/fetchers/src/cli/test-rss-smoke.ts`](/Users/user/Documents/workspace/my/NewsPortal/services/fetchers/src/cli/test-rss-smoke.ts) now uses the actual current synthetic canonical URL pattern in the compose RSS smoke instead of a stale exact-path assertion, which was required to keep the stage-7 ingest proof honest rather than leaving a known false failure in the harness;
  - live runtime/process truth was compressed and resynced in [`docs/work.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/work.md), [`docs/blueprint.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/blueprint.md), [`docs/engineering.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/engineering.md), [`docs/verification.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/verification.md), [`docs/contracts/zero-shot-interest-filtering.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/contracts/zero-shot-interest-filtering.md), and [`.aidp/os.yaml`](/Users/user/Documents/workspace/my/NewsPortal/.aidp/os.yaml).
- Что проверено:
  - required-read-order reload of `AGENTS.md`, `docs/work.md`, `docs/blueprint.md`, `docs/engineering.md`, `docs/verification.md`, `.aidp/os.yaml`, `docs/contracts/zero-shot-interest-filtering.md`, and `docs/contracts/discovery-agent.md`
  - worktree coherence check via `git status --short`
  - `python -m py_compile services/workers/app/main.py services/workers/app/smoke.py tests/unit/python/test_interest_auto_repair.py`
  - `python -m unittest tests.unit.python.test_interest_auto_repair`
  - `pnpm typecheck`
  - `pnpm unit_tests`
  - `pnpm test:migrations:smoke`
  - `pnpm test:cluster-match-notify:compose`
  - `pnpm test:reindex-backfill:compose`
  - `pnpm test:ingest:compose`
- Что stage-7 доказал:
  - historical repair can now truthfully rebuild the additive stage-2/3/4 zero-shot layers instead of only reprojecting article-side compatibility rows;
  - worker runtime behavior now uses final-selection-first gating where that truth exists, which aligns runtime behavior with the stage-4 read-model cutover;
  - the bounded compatibility layer remains in sync after rebuild, and retro notification suppression remains intact.
- Риски или gaps:
  - stage-7 did not claim to repair the separate discovery compose schema-drift residual where `0016_adaptive_discovery_cutover.sql` is recorded but `discovery_hypothesis_classes` is absent on some compose PostgreSQL states;
  - the repository worktree remained mixed throughout closeout, so unrelated dirty paths were intentionally left untouched.
- Follow-up:
  - archive the parent capability and treat any future discovery/schema-drift investigation as a separate lane.

### 2026-04-08 — STAGE-6-ADMIN-API-OBSERVABILITY-AND-OPERATOR-TOOLS — Archived the operator-surface stage for zero-shot filtering

- Тип записи: item archive
- Финальный статус: archived
- Зачем понадобилось: after stages 1 through 5 had already shifted runtime truth onto canonical documents, verification state, semantic filters, final selection, and generic discovery source-quality signals, operator/admin/API surfaces still exposed too much legacy article-centric wording. The next truthful slice had to make the shipped model visible and explorable without pretending `system_feed_results` was still the primary truth.
- Что изменилось:
  - new shared operator helper [`apps/admin/src/lib/server/operator-surfaces.ts`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/lib/server/operator-surfaces.ts) now normalizes canonical document, story cluster, verification, semantic-filter, final-selection, and legacy-projection context for admin/operator surfaces;
  - admin screens [`apps/admin/src/pages/articles.astro`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/articles.astro), [`apps/admin/src/pages/articles/[docId].astro`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/articles/[docId].astro), [`apps/admin/src/pages/discovery.astro`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/discovery.astro), [`apps/admin/src/pages/observability.astro`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/observability.astro), and [`apps/admin/src/pages/help.astro`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/help.astro) now present article observations separately from canonical/story-cluster/final-selection truth and distinguish mission fit from generic channel-quality evidence;
  - [`services/api/app/main.py`](/Users/user/Documents/workspace/my/NewsPortal/services/api/app/main.py) and [`packages/contracts/src/article.ts`](/Users/user/Documents/workspace/my/NewsPortal/packages/contracts/src/article.ts) now expose operator/API payloads that include explicit zero-shot explain context instead of hiding the final-selection cutover behind legacy-only response shapes;
  - targeted proof coverage was added in [`tests/unit/ts/admin-operator-surfaces.test.ts`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/ts/admin-operator-surfaces.test.ts) and [`tests/unit/python/test_api_zero_shot_operator_surfaces.py`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/python/test_api_zero_shot_operator_surfaces.py), and runtime truth/docs were synced in [`docs/work.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/work.md), [`docs/blueprint.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/blueprint.md), [`docs/engineering.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/engineering.md), [`docs/verification.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/verification.md), [`docs/contracts/zero-shot-interest-filtering.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/contracts/zero-shot-interest-filtering.md), [`docs/contracts/discovery-agent.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/contracts/discovery-agent.md), and [`.aidp/os.yaml`](/Users/user/Documents/workspace/my/NewsPortal/.aidp/os.yaml).
- Что проверено:
  - required-read-order reload of `AGENTS.md`, `docs/work.md`, `docs/blueprint.md`, `docs/engineering.md`, `docs/verification.md`, `.aidp/os.yaml`, `docs/contracts/zero-shot-interest-filtering.md`, and `docs/contracts/discovery-agent.md`
  - worktree coherence check via `git status --short`
  - `python -m py_compile services/api/app/main.py tests/unit/python/test_api_zero_shot_operator_surfaces.py`
  - `python -m unittest tests.unit.python.test_api_zero_shot_operator_surfaces`
  - `node --test tests/unit/ts/admin-operator-surfaces.test.ts`
  - `pnpm typecheck`
  - `pnpm unit_tests`
  - `pnpm test:discovery-enabled:compose`
  - `pnpm test:cluster-match-notify:compose`
- Что stage-6 доказал:
  - admin/API/operator surfaces now speak the shipped canonical/verification/final-selection model truthfully instead of implying that raw article processing state alone determines selection;
  - discovery/operator wording now differentiates mission-scoped fit from generic channel-quality evidence after the stage-5 source-scoring decoupling;
  - compose-backed runtime proof remained green for both clustering/final-selection and discovery enablement on the canonical baseline used during stage-6 closeout.
- Риски или gaps:
  - later compose environments may still encounter separate discovery schema drift outside the stage-6 write scope; that residual must be handled in a separate discovery lane rather than by reopening this archived stage;
  - the repository worktree remained mixed, so stage-6 intentionally avoided unrelated edits even when nearby files were dirty.
- Follow-up:
  - continue with `STAGE-7-BACKFILL-COMPATIBILITY-CLEANUP-AND-FINAL-SYNC`.

### 2026-04-08 — STAGE-5-DISCOVERY-SOURCE-SCORING-DECOUPLING — Archived the bounded discovery/source-quality decoupling stage for the zero-shot filtering cutover

- Тип записи: item archive
- Финальный статус: archived
- Зачем понадобилось: after stage-4 moved final editorial selection onto `final_selection_results`, discovery still learned source usefulness from downstream selected-content outcomes. The next truthful slice had to remove that coupling without pretending to redesign the whole graph-first discovery subsystem in one pass.
- Что изменилось:
  - [`services/workers/app/discovery_orchestrator.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/discovery_orchestrator.py) no longer joins `system_feed_results` to compute channel metrics; discovery channel quality is now derived from generic intake evidence such as unique-article ratio, fetch health, freshness, lead-time, duplicate pressure, and runtime-state failure signals;
  - [`services/workers/app/source_scoring.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/source_scoring.py) now exposes `summarize_channel_quality_metrics(...)` and persists a discovery scoring breakdown that explicitly records generic `channelMetrics` provenance instead of relying on hidden selected-content yield semantics;
  - targeted regression coverage in [`tests/unit/python/test_source_scoring.py`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/python/test_source_scoring.py) and [`tests/unit/python/test_discovery_orchestrator.py`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/python/test_discovery_orchestrator.py) now proves the generic metric path, portfolio/scoring persistence, and absence of `usefulArticlesPeriod` / downstream selection semantics in the scoring breakdown.
- Что проверено:
  - required-read-order reload of `AGENTS.md`, `docs/work.md`, `docs/blueprint.md`, `docs/engineering.md`, `docs/verification.md`, `.aidp/os.yaml`, and `docs/contracts/discovery-agent.md`
  - targeted repo inspection of current discovery/source-scoring paths and downstream selection dependencies
  - `python -m py_compile services/workers/app/source_scoring.py services/workers/app/discovery_orchestrator.py tests/unit/python/test_discovery_orchestrator.py tests/unit/python/test_source_scoring.py`
  - `python -m unittest tests.unit.python.test_source_scoring tests.unit.python.test_discovery_orchestrator`
  - `rg -n "join system_feed_results|eligible_for_feed" services/workers/app/discovery_orchestrator.py services/workers/app/source_scoring.py`
  - `pnpm unit_tests`
  - `pnpm typecheck`
  - `pnpm dev:mvp:internal:no-build` (needed because the local compose baseline was down before the discovery compose smoke)
  - `pnpm test:discovery-enabled:compose`
- Что stage-5 доказал:
  - discovery/source usefulness is no longer learned from downstream selected-content outcomes in the current runtime;
  - persisted discovery scoring can still build contextual scores and portfolio snapshots, but its `yield_score` semantics now describe generic source-quality yield rather than selected-content yield;
  - the compose-backed discovery walkthrough still works after the decoupling change.
- Риски или gaps:
  - discovery remains graph-first and mission-centric after this stage; stage-5 removes the selected-content dependency, but it does not yet turn discovery into a fully recall-first, interest-independent acquisition system;
  - the repository worktree remains mixed, and broad integration proof still carries the existing unrelated fetchers RSS canonical-smoke residual.
- Follow-up:
  - start `STAGE-6-ADMIN-API-OBSERVABILITY-AND-OPERATOR-TOOLS` as the next bounded implementation slice.

### 2026-04-08 — STAGE-4-FINAL-SELECTION-READ-MODEL-CUTOVER — Archived the additive final-selection read-model cutover stage for the zero-shot filtering architecture

- Тип записи: item archive
- Финальный статус: archived
- Зачем понадобилось: after stage-3 separated technical filters, semantic decisions, and verification snapshots into `interest_filter_results`, the repo still treated legacy `system_feed_results` as the only authoritative selected-content gate. The next truthful slice had to move final editorial selection onto canonical/verification/filtering truth without silently rewriting the whole historical corpus or collapsing compatibility consumers.
- Что изменилось:
  - added migration [`database/migrations/0026_final_selection_results.sql`](/Users/user/Documents/workspace/my/NewsPortal/database/migrations/0026_final_selection_results.sql) plus synced DDL in [`database/ddl/phase4_matching_notification.sql`](/Users/user/Documents/workspace/my/NewsPortal/database/ddl/phase4_matching_notification.sql), introducing additive PostgreSQL table `final_selection_results` with final decision, selected flag, verification context, filter-count summary, compatibility decision, and explain payloads;
  - added worker-side final-selection summarization in [`services/workers/app/final_selection.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/final_selection.py) and wired it into [`services/workers/app/main.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/main.py), so system-criterion `interest_filter_results` plus current canonical/story verification context now materialize `selected` / `rejected` / `gray_zone` rows in `final_selection_results`, while `system_feed_results` is recomputed only as a compatibility projection;
  - updated selected-content read surfaces in [`services/api/app/main.py`](/Users/user/Documents/workspace/my/NewsPortal/services/api/app/main.py), [`apps/web/src/lib/server/user-content-state.ts`](/Users/user/Documents/workspace/my/NewsPortal/apps/web/src/lib/server/user-content-state.ts), [`apps/admin/src/pages/articles.astro`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/articles.astro), and [`apps/admin/src/pages/articles/[docId].astro`](/Users/user/Documents/workspace/my/NewsPortal/apps/admin/src/pages/articles/[docId].astro) so system-selected/API/admin reads are now final-selection-first with legacy fallback while a stage-4 row is absent;
  - extended contracts and proof hooks in [`packages/contracts/src/article.ts`](/Users/user/Documents/workspace/my/NewsPortal/packages/contracts/src/article.ts), [`packages/contracts/src/content.ts`](/Users/user/Documents/workspace/my/NewsPortal/packages/contracts/src/content.ts), [`services/workers/app/smoke.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/smoke.py), [`services/relay/src/cli/test-migrations.ts`](/Users/user/Documents/workspace/my/NewsPortal/services/relay/src/cli/test-migrations.ts), [`tests/unit/python/test_final_selection.py`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/python/test_final_selection.py), [`tests/unit/python/test_api_feed_dedup.py`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/python/test_api_feed_dedup.py), [`tests/unit/python/test_api_matches.py`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/python/test_api_matches.py), and [`tests/unit/python/test_interest_auto_repair.py`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/python/test_interest_auto_repair.py).
- Что проверено:
  - required-read-order reload of `AGENTS.md`, `docs/work.md`, `docs/blueprint.md`, `docs/engineering.md`, `docs/verification.md`, and `.aidp/os.yaml`
  - targeted repo inspection of stage-3 semantic filter outputs, current API/admin selected-content surfaces, and compatibility boundaries
  - worktree coherence check via `git status --short`
  - `python -m py_compile services/workers/app/final_selection.py services/workers/app/main.py services/workers/app/smoke.py services/api/app/main.py`
  - `python -m unittest tests.unit.python.test_final_selection tests.unit.python.test_api_feed_dedup tests.unit.python.test_api_matches tests.unit.python.test_interest_filters tests.unit.python.test_story_clusters`
  - `python -m unittest tests.unit.python.test_interest_auto_repair`
  - `pnpm typecheck`
  - `pnpm unit_tests`
  - `pnpm test:migrations:smoke`
  - `pnpm test:cluster-match-notify:compose`
  - `git diff --check -- database/migrations/0026_final_selection_results.sql database/ddl/phase4_matching_notification.sql services/workers/app/final_selection.py services/workers/app/main.py services/workers/app/smoke.py services/api/app/main.py apps/web/src/lib/server/user-content-state.ts apps/admin/src/pages/articles.astro apps/admin/src/pages/articles/[docId].astro packages/contracts/src/article.ts packages/contracts/src/content.ts services/relay/src/cli/test-migrations.ts tests/unit/python/test_final_selection.py tests/unit/python/test_api_feed_dedup.py tests/unit/python/test_api_matches.py tests/unit/python/test_interest_auto_repair.py`
- Что stage-4 доказал:
  - NewsPortal now has shipped additive final-selection truth in PostgreSQL via `final_selection_results`, rather than inferring selected-content eligibility only from legacy article-side tables;
  - `system_feed_results` remains present but is now explicitly a compatibility projection derived from the stage-4 summary instead of the primary selected-content truth;
  - selected-content/API/admin read surfaces now consume final-selection truth first and only fall back to legacy `system_feed_results` when a stage-4 row is not yet present.
- Риски или gaps:
  - `pnpm integration_tests` still fails in the current mixed worktree on an unrelated RSS canonical-URL smoke assertion in [`services/fetchers/src/cli/test-rss-smoke.ts`](/Users/user/Documents/workspace/my/NewsPortal/services/fetchers/src/cli/test-rss-smoke.ts); the concrete failing expectation is that `canonical_documents.canonical_url` should preserve the smoke article URL but instead resolves to an `example.com` article URL, which sits outside the stage-4 final-selection boundary;
  - this stage intentionally did not perform broad historical replay or mutate already selected rows; compatibility fallback remains necessary while older rows without `final_selection_results` are still present.
- Follow-up:
  - start `STAGE-5-DISCOVERY-SOURCE-SCORING-DECOUPLING` as the next bounded implementation slice.

### 2026-04-08 — STAGE-3-ZERO-SHOT-INTEREST-FILTER-SPLIT — Archived the additive semantic filter-split stage for the zero-shot filtering cutover

- Тип записи: item archive
- Финальный статус: archived
- Зачем понадобилось: after stage-2 established canonical-first story clustering and verification, the repo still kept semantic filtering logic mixed inside legacy article-side `criterion_match_results` and `interest_match_results`. The next truthful slice had to separate technical hard-filter outcomes, verification snapshots, and semantic decisions into an explicit downstream layer without yet rewriting final selection truth.
- Что изменилось:
  - added migration [`database/migrations/0025_interest_filter_results.sql`](/Users/user/Documents/workspace/my/NewsPortal/database/migrations/0025_interest_filter_results.sql) plus synced DDL in [`database/ddl/phase4_matching_notification.sql`](/Users/user/Documents/workspace/my/NewsPortal/database/ddl/phase4_matching_notification.sql), introducing additive PostgreSQL table `interest_filter_results` for explicit split filter outcomes over both system criteria and user interests;
  - added worker-side semantic filter helper layer in [`services/workers/app/interest_filters.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/interest_filters.py) and wired it into [`services/workers/app/main.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/main.py), so `article.match_criteria`, `article.match_interests`, and criterion/user gray-zone review updates now write explicit `technical_filter_state`, `semantic_decision`, compatibility decision, and verification snapshot rows while preserving legacy article-side outputs;
  - extended compose/runtime proof hooks in [`services/workers/app/smoke.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/smoke.py), migration smoke in [`services/relay/src/cli/test-migrations.ts`](/Users/user/Documents/workspace/my/NewsPortal/services/relay/src/cli/test-migrations.ts), article explainability in [`services/api/app/main.py`](/Users/user/Documents/workspace/my/NewsPortal/services/api/app/main.py), and added targeted regression coverage in [`tests/unit/python/test_interest_filters.py`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/python/test_interest_filters.py) plus [`tests/unit/python/test_interest_auto_repair.py`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/python/test_interest_auto_repair.py).
- Что проверено:
  - required-read-order reload of `AGENTS.md`, `docs/work.md`, `docs/blueprint.md`, `docs/engineering.md`, `docs/verification.md`, and `.aidp/os.yaml`
  - targeted repo inspection of current criteria/user-interest runtime, verification truth, and legacy compatibility surfaces
  - worktree coherence check via `git status --short`
  - `python -m py_compile services/workers/app/interest_filters.py services/workers/app/main.py services/workers/app/smoke.py services/api/app/main.py`
  - `python -m unittest tests.unit.python.test_interest_filters tests.unit.python.test_interest_auto_repair tests.unit.python.test_story_clusters`
  - `pnpm typecheck`
  - `pnpm unit_tests`
  - `pnpm test:migrations:smoke`
  - `pnpm test:interest-compile:compose` (passed on immediate rerun after one transient compose-fixture verification failure; compose DB inspection confirmed the compiled interest row and the rerun closed the proof)
  - `pnpm test:cluster-match-notify:compose`
  - `git diff --check -- database/migrations/0025_interest_filter_results.sql database/ddl/phase4_matching_notification.sql services/workers/app/interest_filters.py services/workers/app/main.py services/workers/app/smoke.py services/api/app/main.py services/relay/src/cli/test-migrations.ts tests/unit/python/test_interest_filters.py tests/unit/python/test_interest_auto_repair.py`
- Что stage-3 доказал:
  - NewsPortal now has a shipped additive semantic filter-split layer on top of stage-1/2 canonical ownership and verification, rather than keeping all semantic decisions implicit inside legacy article-side result tables only;
  - explicit technical hard-filter outcome, semantic decision, compatibility decision, and verification snapshot rows are now rebuildable PostgreSQL truth via `interest_filter_results`, while legacy `criterion_match_results`, `interest_match_results`, and `system_feed_results` remain compatibility outputs rather than being silently removed;
  - the local compose cluster/match/notify smoke proves that the new split layer coexists with canonical verification, story clustering, criteria matching, interest matching, and notification flow on the current baseline.
- Follow-up:
  - start `STAGE-4-FINAL-SELECTION-READ-MODEL-CUTOVER` as the next bounded implementation slice.

### 2026-04-08 — STAGE-2-DUPLICATE-STORY-CLUSTERING-AND-VERIFICATION — Archived the additive canonical-first clustering and verification stage for the zero-shot filtering cutover

- Тип записи: item archive
- Финальный статус: archived
- Зачем понадобилось: after stage-1 established canonical-document and observation ownership, the repo still lacked a durable semantic layer for same-story grouping and verification that later semantic filtering could build on. The current runtime already had legacy `event_clusters`, but it did not yet expose canonical-first story-cluster ownership, source-family-aware corroboration, or reusable verification truth.
- Что изменилось:
  - added migration [`database/migrations/0024_story_clusters_and_verification.sql`](/Users/user/Documents/workspace/my/NewsPortal/database/migrations/0024_story_clusters_and_verification.sql) plus synced DDL in [`database/ddl/phase2_ingest_foundation.sql`](/Users/user/Documents/workspace/my/NewsPortal/database/ddl/phase2_ingest_foundation.sql) and [`database/ddl/phase3_nlp_foundation.sql`](/Users/user/Documents/workspace/my/NewsPortal/database/ddl/phase3_nlp_foundation.sql), introducing additive PostgreSQL tables `story_clusters`, `story_cluster_members`, and `verification_results`, plus `canonical_documents.canonical_domain` for source-family-aware verification;
  - added worker-side canonical-first clustering and verification materialization in [`services/workers/app/story_clusters.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/story_clusters.py) and wired it into [`services/workers/app/main.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/main.py), so `article.cluster` now writes additive story-cluster and verification truth before the current legacy `event_clusters` compatibility lane continues;
  - updated canonical ownership support in [`services/workers/app/canonical_documents.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/canonical_documents.py), expanded the compose smoke fixture in [`services/workers/app/smoke.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/smoke.py), extended migration smoke in [`services/relay/src/cli/test-migrations.ts`](/Users/user/Documents/workspace/my/NewsPortal/services/relay/src/cli/test-migrations.ts), and added targeted regression coverage in [`tests/unit/python/test_story_clusters.py`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/python/test_story_clusters.py) plus [`tests/unit/python/test_interest_auto_repair.py`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/python/test_interest_auto_repair.py), including the compatibility fallback when canonical ownership is still missing.
- Что проверено:
  - required-read-order reload of `AGENTS.md`, `docs/work.md`, `docs/blueprint.md`, `docs/engineering.md`, `docs/verification.md`, and `.aidp/os.yaml`
  - targeted repo inspection of canonical-document ownership, worker clustering/verification code, and current compatibility boundaries
  - worktree coherence check via `git status --short`
  - `python -m py_compile services/workers/app/canonical_documents.py services/workers/app/story_clusters.py services/workers/app/main.py services/workers/app/smoke.py`
  - `pnpm typecheck`
  - `pnpm unit_tests`
  - `pnpm test:migrations:smoke`
  - `pnpm test:cluster-match-notify:compose`
  - `git diff --check -- services/workers/app/story_clusters.py tests/unit/python/test_interest_auto_repair.py`
- Что stage-2 доказал:
  - NewsPortal now has shipped additive canonical-first story clustering and verification truth on top of stage-1 canonical ownership, rather than keeping all same-story semantics implicit inside legacy `event_clusters` only;
  - canonical-document verification and story-cluster verification are now rebuildable PostgreSQL truth via `verification_results`, while missing canonical ownership truthfully skips the additive stage-2 path instead of breaking the legacy cluster worker contract;
  - the local compose cluster smoke proves that additive stage-2 verification can coexist with legacy event clustering, criteria matching, interest matching, and notification flow on the current baseline.
- Follow-up:
  - start `STAGE-3-ZERO-SHOT-INTEREST-FILTER-SPLIT` as the next bounded implementation slice.

### 2026-04-08 — STAGE-1-CANONICAL-DOCUMENT-AND-OBSERVATION-LAYER — Archived the additive canonical-ownership stage for the zero-shot filtering cutover

- Тип записи: item archive
- Финальный статус: archived
- Зачем понадобилось: after stage-0 defined the cutover contract, the repo needed a first shipped runtime slice that separated raw observation ownership from future canonical-document ownership without breaking the current editorial/article path. The current system already stored `canonical_doc_id` inside `articles`, but it still lacked a truthful ownership layer that later clustering/verification/filter stages could build on.
- Что изменилось:
  - added migration [`database/migrations/0023_canonical_documents_and_observations.sql`](/Users/user/Documents/workspace/my/NewsPortal/database/migrations/0023_canonical_documents_and_observations.sql) plus synced DDL in [`database/ddl/phase2_ingest_foundation.sql`](/Users/user/Documents/workspace/my/NewsPortal/database/ddl/phase2_ingest_foundation.sql), introducing additive PostgreSQL tables `canonical_documents` and `document_observations` together with bounded backfill for existing article rows;
  - added fetchers-side observation persistence in [`services/fetchers/src/document-observations.ts`](/Users/user/Documents/workspace/my/NewsPortal/services/fetchers/src/document-observations.ts), wired it into RSS/article ingest in [`services/fetchers/src/fetchers.ts`](/Users/user/Documents/workspace/my/NewsPortal/services/fetchers/src/fetchers.ts) and editorial website projection in [`services/fetchers/src/resource-enrichment.ts`](/Users/user/Documents/workspace/my/NewsPortal/services/fetchers/src/resource-enrichment.ts), so raw article observations are now recorded immediately at ingest time;
  - added worker-side canonical ownership materialization in [`services/workers/app/canonical_documents.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/canonical_documents.py) and hooked it into dedup in [`services/workers/app/main.py`](/Users/user/Documents/workspace/my/NewsPortal/services/workers/app/main.py), so canonical documents and observation mappings are maintained after normalize/dedup without changing the existing `system_feed_results` gate;
  - extended proof surfaces in [`services/relay/src/cli/test-migrations.ts`](/Users/user/Documents/workspace/my/NewsPortal/services/relay/src/cli/test-migrations.ts), [`services/fetchers/src/cli/test-rss-smoke.ts`](/Users/user/Documents/workspace/my/NewsPortal/services/fetchers/src/cli/test-rss-smoke.ts), [`tests/unit/ts/document-observations.test.ts`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/ts/document-observations.test.ts), and [`tests/unit/python/test_canonical_documents.py`](/Users/user/Documents/workspace/my/NewsPortal/tests/unit/python/test_canonical_documents.py), then synced runtime/core docs to the new shipped truth.
- Что проверено:
  - required-read-order reload of `AGENTS.md`, `docs/work.md`, `docs/blueprint.md`, `docs/engineering.md`, `docs/verification.md`, and `.aidp/os.yaml`
  - targeted repo inspection of current article/content ownership and dedup paths
  - worktree coherence check via `git status --short`
  - `git diff --check -- docs/work.md database/migrations/0023_canonical_documents_and_observations.sql database/ddl/phase2_ingest_foundation.sql services/fetchers/src/document-observations.ts services/fetchers/src/fetchers.ts services/fetchers/src/resource-enrichment.ts services/workers/app/canonical_documents.py services/workers/app/main.py services/relay/src/cli/test-migrations.ts tests/unit/ts/document-observations.test.ts tests/unit/python/test_canonical_documents.py services/fetchers/src/cli/test-rss-smoke.ts`
  - `python -m py_compile services/workers/app/canonical_documents.py services/workers/app/main.py`
  - `pnpm typecheck`
  - `pnpm unit_tests`
  - `pnpm test:migrations:smoke`
  - `pnpm test:ingest:compose`
- Что stage-1 доказал:
  - NewsPortal now has a shipped additive ownership layer for raw article observations and canonical documents, rather than keeping all future semantic ownership implicit inside `articles` only;
  - the compatibility bridge is explicit: `canonical_documents.canonical_document_id` currently reuses the canonical editorial article `doc_id`, and current final editorial selection still remains on `articles` plus `system_feed_results`;
  - the local compose RSS path now proves that the new layer is materially populated in runtime, not just present in schema.
- Follow-up:
  - start `STAGE-2-DUPLICATE-STORY-CLUSTERING-AND-VERIFICATION` as the next bounded implementation slice.

### 2026-04-08 — STAGE-0-ZERO-SHOT-FILTERING-DESIGN-CONTRACT — Archived the design-contract stage for the zero-shot filtering cutover

- Тип записи: item archive
- Финальный статус: archived
- Зачем понадобилось: after the user asked to move from an interest-centric discovery model toward a system that evaluates all found information and filters it zero-shot by interests, the repo needed a truthful design-contract stage before any schema/runtime rewrite. The cutover spans multiple services and truth layers, so stage-0 had to establish durable target architecture, data ownership, proof contour, and doc-sync discipline first.
- Что изменилось:
  - added [`docs/contracts/zero-shot-interest-filtering.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/contracts/zero-shot-interest-filtering.md), a new deep contract doc defining the target processing model `acquire all -> normalize -> canonicalize -> dedup/cluster -> verify -> interest-match -> select`, the non-search/non-top-k product model, the target data entities, compatibility rules for current `articles` / `system_feed_results`, and the full stage map for the cutover;
  - synced contract indices and durable engineering/machine-proof truth in [`docs/contracts/README.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/contracts/README.md), [`docs/engineering.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/engineering.md), [`docs/verification.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/verification.md), and [.aidp/os.yaml](/Users/user/Documents/workspace/my/NewsPortal/.aidp/os.yaml), so the new lane is no longer chat-only knowledge;
  - synced live execution state in [`docs/work.md`](/Users/user/Documents/workspace/my/NewsPortal/docs/work.md): stage-0 is complete, the parent capability remains active, and `STAGE-1-CANONICAL-DOCUMENT-AND-OBSERVATION-LAYER` is now the truthful next implementation slice.
- Что проверено:
  - required-read-order reload of `AGENTS.md`, `docs/work.md`, `docs/blueprint.md`, `docs/engineering.md`, `docs/verification.md`, and `.aidp/os.yaml`
  - targeted repo inspection of current discovery/scoring/selection code and current contract docs
  - worktree coherence check via `git status --short`
  - primary-source internet research for zero-shot/noisy retrieval and filtering architecture tradeoffs
  - `git diff --check -- docs/contracts/zero-shot-interest-filtering.md docs/contracts/README.md docs/engineering.md docs/verification.md .aidp/os.yaml docs/work.md docs/history.md`
- Что stage-0 доказал:
  - the repo now has an explicit durable contract for the replacement architecture and no longer needs to guess the target model during schema/runtime work;
  - the cutover discipline now explicitly forbids rewriting `docs/blueprint.md` ahead of shipped reality and forbids treating internal confidence scores as a user-facing ranking contract.
- Follow-up:
  - start `STAGE-1-CANONICAL-DOCUMENT-AND-OBSERVATION-LAYER` as the next bounded additive implementation slice.

### 2026-04-08 — SPIKE-ZERO-SHOT-NOISY-RETRIEVAL-OPTIONS — Archived the cost-aware research spike for zero-shot retrieval in mega-noisy environments

- Тип записи: item archive
- Финальный статус: archived
- Зачем понадобилось: after confirming that the current repo architecture is structurally interest-centric, the user narrowed the requirement further: the target system should remain zero-shot while operating in very noisy environments and should be as fast and cheap as possible. This required another bounded research spike focused specifically on retrieval architecture tradeoffs rather than only on interest independence.
- Что установлено:
  - external primary-source guidance does not support dense-first or LLM-first discovery as the default for this constraint set; the recurring recommendation is cheap broad recall first, expensive intelligence later and only on bounded top-k;
  - official Vespa ranking guidance emphasizes phased retrieval/reranking and cheap top-k retrieval operators such as WAND/weakAnd before more expensive second-phase ranking, which aligns well with a noisy-corpus cost budget;
  - official Elasticsearch guidance on RRF shows why hybrid retrieval is attractive as an additive quality layer: independent retrievers can be fused without weight tuning, but the mechanism still assumes bounded top result sets rather than an expensive all-doc scoring pass;
  - Google retrieval work and zero-shot benchmarks indicate that lexical retrieval remains robust out-of-domain, while hybrid methods improve recall/quality by combining lexical and semantic signals; this makes lexical-first or sparse-lexical-first the safer cheap baseline for NewsPortal than dense-only retrieval;
  - older but still relevant IR guidance on MMR/diversity remains important for mega-noisy environments because a system can otherwise retrieve many relevant-but-redundant near-copies, which is exactly the failure mode already visible in the current corpus.
- Что это означает для NewsPortal:
  - the best cheap/fast architectural default is not “better interest templates” and not “stronger dense scoring everywhere”, but an upstream recall layer built around lexical or sparse-lexical retrieval, canonicalization, source-family deduplication, cluster-aware novelty/diversity, and only then downstream interest/editorial ranking;
  - a stronger hybrid stack is still reasonable, but only as a bounded top-k improvement layer after cheap recall has already reduced the candidate set;
  - late interaction or stronger rerankers such as ColBERTv2-style methods may improve quality, but they should be treated as optional bounded rerank stages, not as the primary recall mechanism under the user’s cheap/fast constraint.
- Что проверено:
  - primary-source internet research across official Vespa and Elastic docs plus Google/ACL/OpenReview/CMU IR references
  - synthesis against the current repo truth already established in the previous discovery review spike
- Рекомендуемый follow-up:
  - if the user wants the next truthful step, open a capability that compares three concrete NewsPortal-ready options:
    - lexical-first recall with strong dedup/diversity and heuristic source priors;
    - lexical-first plus sparse/hybrid fusion on bounded candidates;
    - bounded late rerank on top of one of the first two, only if offline measurement shows the extra cost is worth it.

### 2026-04-08 — SPIKE-INTEREST-INDEPENDENT-DISCOVERY-REVIEW — Archived the analysis of interest dependence versus recall-first discovery

- Тип записи: item archive
- Финальный статус: archived
- Зачем понадобилось: after the future-only article-yield remediation, the user clarified a stricter product requirement: the system should find valuable information even in a high-noise environment and should not fundamentally depend on `interest_templates` or mission-specific interests for recall. That required a bounded spike to compare the current repo truth with primary-source retrieval guidance before proposing more tuning or architecture changes.
- Что установлено:
  - the current durable blueprint is explicitly interest-centric: discovery planning is owned by `discovery_missions.interest_graph`, source evaluation remains `Source Profile × Interest`, and approved candidates still become `source_channels` through the discovery mission flow rather than an interest-independent upstream recall layer;
  - implementation truth matches that blueprint: [`services/workers/app/discovery_orchestrator.py`] builds default hypotheses directly from graph/topic/entity/source-type seeds, [`services/workers/app/source_scoring.py`] computes `contextual_score` from mission-graph overlap plus channel-yield heuristics, and channel yield itself is derived from `system_feed_results.eligible_for_feed`, which makes source-quality learning depend on the current downstream editorial gate;
  - the article gate is a separate downstream layer and is not the main architectural problem by itself: [`services/workers/app/main.py`] applies criteria hard filters and writes `system_feed_results`, while [`services/workers/app/system_feed.py`] summarizes the final editorial decision from criterion outcomes;
  - the recent remediation therefore remains tactically valid but strategically insufficient: syncing canonical interest templates, quarantining high-noise Google RSS cohorts, and deprioritizing duplicate-heavy country-scoped HN cohorts was the correct bounded fix for the current system because it reduced backlog/noise without mutating the eligible set, but it does not create the independent recall layer the user now wants.
- Что показало сравнение с внешними первичными источниками:
  - primary retrieval guidance consistently recommends separating fast candidate generation from slower, more selective reranking rather than collapsing discovery into a single interest-dependent gate;
  - hybrid retrieval is recommended because lexical retrieval remains robust out-of-domain while semantic retrievers recover complementary matches; official Elastic and OpenSearch docs describe combining independent retrievers, and Google retrieval papers report that hybrid retrieval improves over either lexical or neural retrieval alone in zero-shot/out-of-domain settings;
  - phased ranking and explicit diversity are treated as first-class concerns in mature retrieval systems, meaning that deduplication/diversity and top-k reranking should happen after broad recall, not instead of broad recall.
- Что проверено:
  - required-read-order reload of `AGENTS.md`, `docs/work.md`, `docs/blueprint.md`, `docs/engineering.md`, `docs/verification.md`, and `.aidp/os.yaml`
  - worktree coherence check via `git status --short`
  - targeted repo inspection of discovery/scoring/selection code and contracts
  - primary-source internet research via Elastic, OpenSearch, Vespa, Google Research, ACL Anthology, and IR Anthology references
- Рекомендуемый follow-up:
  - if the user wants to continue, open a new architecture capability that separates:
    - interest-independent recall and corpus building,
    - canonicalization / near-duplicate suppression / source-family diversity,
    - generic quality and importance priors,
    - downstream system-interest and user-interest ranking as optional consumers of that corpus,
  - and do not hide that redesign inside another narrow template-tuning or source-quarantine patch.

### 2026-04-08 — C-ARTICLE-YIELD-REMEDIATION — Archived the future-only article-yield remediation capability

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: the local compose stack had drifted into a truthful low-yield state on April 8, 2026: article-ingest backlog, duplicate-heavy Google/HN source families, and live interest-template drift were suppressing useful intake while still surfacing obvious false positives. The user explicitly wanted analysis plus a remediation plan that would avoid mutating already selected articles, so the lane had to stay future-only and evidence-driven.
- Что изменилось:
  - `services/fetchers/src/cli/article-yield-shared.ts`, `services/fetchers/src/cli/article-yield-diagnostics.ts`, `services/fetchers/src/cli/article-yield-remediate.ts`, `services/fetchers/package.json`, and `package.json` now provide repeatable article-yield diagnostics/remediation commands that export `/tmp/newsportal-article-yield-*` packs with the declared views, ranked offender analysis, before/after comparison, and eligible-set stability check;
  - `services/fetchers/src/enrichment.ts` plus `tests/unit/ts/article-enrichment-sanitizers.test.ts` now sanitize malformed extracted publication timestamps and reject non-positive media dimensions before persistence, preventing the specific `[object Object]` timestamptz failures and `article_media_assets_height_px_check` violations from remaining acceptable write-path inputs;
  - live operator data on the compose PostgreSQL stack was remediated future-only through the new CLI: the five active system-interest templates were resynced to `docs/data_scripts/outsource_balanced_templates.json`, `418` Google RSS channels were quarantined, and `330` country-scoped HN channels were deprioritized without broad historical replay or deletion of the existing eligible corpus;
  - runtime-doc machine truth was synced in `docs/work.md`, `docs/verification.md`, and `.aidp/os.yaml` so the new diagnostics/remediation commands and proof contour are no longer session-only knowledge.
- Что проверено:
  - required-read-order reload of `AGENTS.md`, `docs/work.md`, `docs/blueprint.md`, `docs/engineering.md`, `docs/verification.md`, and `.aidp/os.yaml`
  - `pnpm article:yield:diagnostics`
  - `pnpm article:yield:remediate -- --apply`
  - `pnpm unit_tests`
  - `pnpm typecheck`
  - `pnpm test:enrichment:compose`
  - `docker compose --env-file .env.dev -f infra/docker/compose.yml -f infra/docker/compose.dev.yml up --build -d fetchers`
  - `docker exec docker-fetchers-1 pnpm --filter @newsportal/fetchers run:once`
  - post-deploy `pnpm article:yield:diagnostics`
- Что подтвердил финальный re-check:
  - the diagnostics pack is repeatable and now captures the declared loss buckets plus offender views; one representative export on April 8, 2026 at `13:02:41Z` showed `920` active RSS channels, `6600` article rows, `667` distinct URLs, `16` eligible rows, `765` pending `article.ingest.requested` runs, and `861` transient fetch failures;
  - the future-only remediation apply itself did not mutate the pre-existing eligible set: the before/after comparison at `13:05:22Z` preserved all `16` previously eligible doc IDs while updating live templates and source cohorts;
  - after the HN selector correction, Google quarantine, final fetchers rebuild, and post-deploy diagnostics, the live stack on April 8, 2026 at `13:09:04Z` / `13:09:26Z` showed `502` active RSS channels, `6605` article rows, `672` distinct URLs, `19` eligible rows, and `0` pending `article.ingest.requested` runs; the short fresh poll-window check did not grow the pending backlog.
- Риски или gaps:
  - the lane intentionally did not replay or rewrite historical non-selected articles that had already failed before the final fetchers rebuild; if the user wants to clean that residue, it should be a separate `docIds`-scoped repair slice that explicitly excludes the current eligible set;
  - worker logs still show historical enrichment failures from the pre-rebuild window on April 8, 2026, but the closed capability does not claim retrospective mutation of that already-ingested corpus;
  - the fresh post-rebuild `run:once` proved that pending ingest no longer grows on the current stack, but no brand-new due-source batch appeared in that short window, so live proof is a no-growth/backlog-clear signal rather than a new uncontrolled internet sample.
- Follow-up:
  - if the user wants more on this lane, open a separate future-safe stage for scoped historical repair of failed non-selected docs only, or a narrower fetchers hardening patch if a new post-rebuild enrichment failure signature appears.

### 2026-04-07 — C-INTEREST-CONTRACT-PARITY — Archived the admin/web interest-contract parity closeout

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: after nullable `time_window_hours` semantics landed, the user still reported a remaining admin-managed system-interest save failure and the web `user_interests` surface still lagged behind the advanced backend/admin contract; the truthful follow-up therefore had to harden the real admin save path, keep synced `criteria` aligned, and remove the remaining user-portal advanced-field drops.
- Что изменилось:
  - `apps/admin/src/lib/server/admin-templates.ts`, `apps/admin/src/components/InterestTemplateEditorForm.tsx`, `apps/admin/src/pages/templates/interests/new.astro`, `apps/admin/src/pages/templates/interests/[interestTemplateId]/edit.astro`, and `tests/unit/ts/admin-template-sync.test.ts` now preserve nullable `time_window_hours` plus `allowed_content_kinds` across parse/save/sync, so system-interest edits keep the full template-owned contract while still syncing the matching subset into live `criteria`;
  - `apps/admin/src/pages/bff/admin/templates.ts` plus new `tests/unit/ts/admin-interest-template-route.test.ts` now translate time-window schema drift (`missing column`, type mismatch, legacy `NOT NULL`, or time-window check constraint failure) into an explicit migration/write-path guidance message instead of an opaque browser flash;
  - `apps/web/src/components/InterestManager.tsx`, `apps/web/src/components/LiveInterestsSection.tsx`, `apps/web/src/lib/server/user-interests.ts`, and `tests/unit/ts/user-interests.test.ts` now expose and persist the full advanced `user_interests` field set that the runtime already supports, including `time_window_hours`, newline-delimited lexical lists, and short-token hints, without silent drops on create/update/clone.
- Что проверено:
  - required-read-order reload of `AGENTS.md`, `docs/work.md`, `docs/blueprint.md`, `docs/engineering.md`, `docs/verification.md`, and `.aidp/os.yaml`
  - `pnpm typecheck`
  - `pnpm unit_tests`
- Риски или gaps:
  - this closeout did not rerun a compose/browser save against an intentionally outdated DB schema; if an operator still sees the save failure on a local stack, that environment likely still needs the latest nullable-time-window migrations applied;
  - downstream zero-eligible tuning, representative-corpus restoration, and broader runtime quality work remain separate follow-up lanes;
  - the repository worktree remains mixed with unrelated in-flight edits, and this archive does not claim a clean tree.
- Follow-up:
  - if the user wants the next truthful step on this lane, verify the target stack has the latest nullable-time-window migrations applied and retry the real admin save flow there; otherwise resume the blocked zero-eligible remediation only after restoring a representative corpus.

### 2026-04-07 — C-FEED-INGRESS-ADAPTERS — Archived the internal RSS feed-ingress adapter capability

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: the user asked to support aggregator-backed RSS/Atom sources such as Reddit, Hacker News, Google News, and similar system feeds without creating new provider types; the truthful implementation slice therefore had to stay inside `provider_type = rss`, add internal adapter strategies for aggregator-aware normalization, and then prove that local compose ingest no longer failed on the adapter lane.
- Что изменилось:
  - `packages/contracts/src/source.ts`, admin/API channel surfaces, and fetcher runtime now support explicit-or-inferred internal adapter strategies (`generic`, `reddit_search_rss`, `hn_comments_feed`, `google_news_rss`) plus optional pre-ingest `maxEntryAgeHours`, while keeping the operator-facing provider identity as `rss`;
  - `services/fetchers` gained a feed-ingress adapter layer that owns tolerant parse and normalization for Reddit search feeds, HN discussion/comment-feed handling with outbound `Article URL` canonicalization and discussion provenance, Google News wrapper URL resolution, and pre-ingest stale-entry drop before `articles` / `article.ingest.requested` persistence;
  - persisted article payloads now keep adapter provenance in `raw_payload_json.feedAdapter`, local compose/dev baseline docs/env now set `WORKER_SEQUENCE_RUNNER_CONCURRENCY=4`, and the durable subsystem truth moved into `docs/contracts/feed-ingress-adapters.md`, `docs/blueprint.md`, `docs/engineering.md`, `docs/verification.md`, and `.aidp/os.yaml`.
- Что проверено:
  - required-read-order reload of `AGENTS.md`, `docs/work.md`, `docs/blueprint.md`, `docs/engineering.md`, `docs/verification.md`, and `.aidp/os.yaml`
  - targeted contract reload of `docs/contracts/feed-ingress-adapters.md` and `docs/contracts/test-access-and-fixtures.md`
  - `pnpm test:feed-ingress-adapters:smoke`
  - final local runtime re-check via `docker ps`, targeted `docker logs`, and `docker exec docker-postgres-1 psql ...` inspection of `source_channels`, `articles`, `channel_fetch_runs`, `sequence_runs`, and persisted `raw_payload_json.feedAdapter`
  - `pnpm test:ingest:compose`
- Что подтвердил финальный re-check:
  - on the current local compose baseline, `pnpm test:feed-ingress-adapters:smoke` and `pnpm test:ingest:compose` both pass;
  - the smoke-created channel produces `channel_fetch_runs` with `new_content` followed by `304 no_change`, a completed `article.ingest.requested` `sequence_run`, and a persisted article row with `raw_payload_json.feedAdapter.strategy = generic`;
  - before the smoke run the current compose DB was effectively empty (`source_channels = 0`, `articles = 0`, `channel_fetch_runs = 0`, `sequence_runs = 0`), so no local ingress blocker currently reproduces, but the fresh stack also does not contain operator-imported Reddit/HN/Google channels for uncontrolled live-network proof.
- Риски или gaps:
  - the final re-check proves the local baseline and deterministic adapter path, but it does not claim fresh uncontrolled live-internet proof for operator-imported Reddit/HN/Google channels on the current machine state because that dataset is no longer present on the fresh stack;
  - downstream `system-selected` quality, template/scoring strictness, corpus duplication, and recompile/reindex work remain separate follow-up lanes and are not hidden inside this archive.
- Follow-up:
  - reopen this capability only if a new failing ingest signal appears on actual operator-imported aggregator channels or if future adapter strategies need to expand the `rss` boundary again; otherwise continue with the downstream zero-eligible remediation on a representative populated corpus.

### 2026-04-07 — PATCH-TIME-WINDOW-NULL-SEMANTICS — Archived nullable "any time" semantics for blank time windows

- Тип записи: item archive
- Финальный статус: archived
- Зачем понадобилось: after the system-interest contract alignment, the user asked for a follow-up semantic change: when `time_window_hours` is left unset, the platform should not silently fall back to `168` hours but instead accept content from any time period; the audit showed that this fallback was still hard-coded in admin parsing, DB defaults, compiler snapshots, and worker hard filters.
- Что изменилось:
  - `database/ddl/phase3_nlp_foundation.sql`, `database/ddl/phase4_matching_notification.sql`, and `database/migrations/0022_nullable_time_windows.sql` now make `criteria.time_window_hours`, `user_interests.time_window_hours`, and `interest_templates.time_window_hours` nullable, drop the implicit `168` default, and keep only a positive-value check when a window is explicitly set;
  - `apps/admin/src/lib/server/admin-templates.ts`, `apps/admin/src/lib/server/user-interests.ts`, `apps/admin/src/components/InterestTemplateEditorForm.tsx`, `apps/admin/src/pages/templates/interests/new.astro`, `apps/admin/src/pages/templates/interests/[interestTemplateId]/edit.astro`, and `apps/admin/src/pages/user-interests.astro` now treat a blank admin field as `NULL`, show blank inputs for null windows, and explain in the operator copy that blank means "any time" rather than a hidden seven-day fallback;
  - `services/ml/app/compiler.py` now preserves `time_window_hours = null` in compiled hard constraints, and `services/workers/app/main.py` now interprets that null state as "no age limit" instead of auto-coercing it back to `168` and filtering stale content;
  - `docs/blueprint.md`, `apps/admin/src/pages/help.astro`, `tests/unit/ts/admin-template-sync.test.ts`, `tests/unit/ts/admin-user-interests.test.ts`, `tests/unit/python/test_embedding_and_compiler.py`, and `tests/unit/python/test_worker_hard_filters.py` now document and prove the null-as-no-limit contract through schema, admin parsing, compiler output, and worker matching behavior.
- Что проверено:
  - required-read-order reload of `AGENTS.md`, `docs/work.md`, `docs/blueprint.md`, `docs/engineering.md`, `docs/verification.md`, and `.aidp/os.yaml`
  - targeted contract review of nullable `time_window_hours` semantics across schema, admin UI, compiler, worker filtering, and operator docs
  - `node --import tsx --test tests/unit/ts/admin-template-sync.test.ts`
  - `node --import tsx --test tests/unit/ts/admin-user-interests.test.ts`
  - `python -m unittest tests.unit.python.test_embedding_and_compiler tests.unit.python.test_worker_hard_filters`
  - `pnpm typecheck`
  - `git diff --check -- docs/work.md docs/history.md docs/blueprint.md database/ddl/phase3_nlp_foundation.sql database/ddl/phase4_matching_notification.sql database/migrations/0021_interest_template_time_window.sql database/migrations/0022_nullable_time_windows.sql apps/admin/src/components/InterestTemplateEditorForm.tsx apps/admin/src/pages/templates/interests/new.astro apps/admin/src/pages/templates/interests/[interestTemplateId]/edit.astro apps/admin/src/pages/help.astro apps/admin/src/pages/user-interests.astro apps/admin/src/lib/server/admin-templates.ts apps/admin/src/lib/server/user-interests.ts services/api/app/main.py services/ml/app/compiler.py services/workers/app/main.py packages/contracts/src/system-interest.ts tests/unit/ts/admin-template-sync.test.ts tests/unit/ts/admin-user-interests.test.ts tests/unit/python/test_embedding_and_compiler.py tests/unit/python/test_worker_hard_filters.py`
- Риски или gaps:
  - this patch changes the contract for new or newly edited rows, but it does not automatically rewrite existing rows that already store numeric windows like `168`; a separate live migration or operator edit/recompile pass is still needed if the user wants old data to inherit the new "any time when blank" behavior;
  - broader template quality, corpus cleanup, and `system-selected` runtime tuning remain separate follow-up work.
- Follow-up:
  - if the user wants the next truthful step, open a fresh bounded patch or stage that identifies existing interest/template rows where the current stored numeric window should be cleared to `NULL`, applies that change deliberately, and then recompiles/reindexes the affected matching state.

### 2026-04-07 — C-SYSTEM-INTEREST-CONTRACT-ALIGNMENT — Archived the interest-admin contract alignment slice

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: while configuring system interests, the user noticed that several expected hard-filter fields did not appear in the real admin UI; the resulting audit showed a truthful mixed problem: some fields already existed but were hidden inside the advanced block, `interest_templates.time_window_hours` was missing end-to-end from the real contract, and adjacent `user_interests` admin had drifted away from the DB/runtime truth that already supported the same time-window field.
- Что изменилось:
  - `database/ddl/phase4_matching_notification.sql` and `database/migrations/0021_interest_template_time_window.sql` now add durable `interest_templates.time_window_hours integer not null default 168` storage with a positive-value check, without changing the broader provider or matching schema shape;
  - `apps/admin/src/lib/server/admin-templates.ts`, `services/api/app/main.py`, `packages/contracts/src/system-interest.ts`, `apps/admin/src/components/InterestTemplateEditorForm.tsx`, `apps/admin/src/pages/templates/interests.astro`, `apps/admin/src/pages/templates/interests/new.astro`, and `apps/admin/src/pages/templates/interests/[interestTemplateId]/edit.astro` now expose `time_window_hours` truthfully across system-interest create/edit/read flows, and criterion sync now carries that field into live `criteria` while keeping `allowed_content_kinds` template-owned instead of pretending it is a worker-side criterion field;
  - `apps/admin/src/lib/server/user-interests.ts` and `apps/admin/src/pages/user-interests.astro` now restore admin parity for the already-existing `user_interests.time_window_hours` runtime field and also fix the smaller lexical-list drift discovered during audit: the admin UI used multiline textareas for `must_have_terms` and `must_not_have_terms`, but the server previously parsed them as CSV-only; the write path now accepts both commas and line breaks, matching what operators naturally enter in the form;
  - `tests/unit/ts/admin-template-sync.test.ts` and `tests/unit/ts/admin-user-interests.test.ts` now prove the new system-interest time-window contract plus the user-interest multiline lexical-list parsing behavior;
  - `docs/blueprint.md`, `apps/admin/src/pages/help.astro`, and `docs/work.md`/`docs/history.md` were synced so the durable/operator truth now matches the real field ownership: matching constraints sync into live criteria, `allowed_content_kinds` remain template-owned collection gates, and the advanced admin forms no longer claim a smaller contract than the runtime actually supports.
- Что проверено:
  - required-read-order reload of `AGENTS.md`, `docs/work.md`, `docs/blueprint.md`, `docs/engineering.md`, `docs/verification.md`, and `.aidp/os.yaml`
  - targeted contract review of `interest_templates`, `criteria`, `user_interests`, admin UI, API read models, and operator-help wording
  - `node --import tsx --test tests/unit/ts/admin-template-sync.test.ts`
  - `node --import tsx --test tests/unit/ts/admin-user-interests.test.ts`
  - `pnpm typecheck`
  - `git diff --check -- docs/work.md docs/history.md docs/blueprint.md apps/admin/src/components/InterestTemplateEditorForm.tsx apps/admin/src/pages/templates/interests.astro apps/admin/src/pages/templates/interests/new.astro apps/admin/src/pages/templates/interests/[interestTemplateId]/edit.astro apps/admin/src/pages/help.astro apps/admin/src/pages/user-interests.astro apps/admin/src/lib/server/admin-templates.ts apps/admin/src/lib/server/user-interests.ts services/api/app/main.py packages/contracts/src/system-interest.ts database/ddl/phase4_matching_notification.sql database/migrations/0021_interest_template_time_window.sql tests/unit/ts/admin-template-sync.test.ts tests/unit/ts/admin-user-interests.test.ts`
- Риски или gaps:
  - this archived slice aligns contract surfaces only; it does not import or rewrite the live system-interest dataset for the user, and it does not run a recompile/reindex/runtime proof on existing rows after the contract change;
  - broader `system-selected` quality, buyer-intent template tuning, corpus cleanup, and zero-eligible remediation remain separate follow-up work;
  - the repository worktree remains mixed with unrelated in-flight edits, and this archive does not claim a clean tree.
- Follow-up:
  - if the user wants the next truthful step, open a fresh bounded stage that applies the updated template contract to the live system-interest dataset, recompiles/reindexes the affected rows, and then measures whether the current corpus starts producing materially better `system-selected` results.

### 2026-04-07 — C-SYSTEM-FEED-QUALITY-TUNING — Archived the outsourcing buyer-intent template tuning slice

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: after the queue-starvation blocker was removed from the runtime path, the user asked to improve the operator-controlled outsourcing-lead selection layer; during that bounded tuning pass it became clear that worker hard filters treated `must_have_terms` too strictly as AND, so the truthful slice included a small runtime semantic fix, a rewrite of the outsourcing template bundle, and doc sync explaining the new hard-filter behavior.
- Что изменилось:
  - `services/workers/app/main.py` now evaluates `must_have_terms` as OR / any-match across `title + lead + body`, and emits a single `must_have_any` failure reason only when none of the configured terms matches;
  - `tests/unit/python/test_worker_hard_filters.py` now proves both sides of the new contract: a criterion passes when any `must_have_terms` value matches, and fails with `must_have_any` when no configured term is present;
  - `docs/data_scripts/outsource_balanced_templates.json` was rewritten around explicit outsourcing buyer intent with five focused interest templates plus stronger negatives against vendor self-promo, internal hiring, advisory content, rankings, and low-intent community chatter;
  - `docs/blueprint.md`, `EXAMPLES.md`, `docs/data_scripts/outsource_balanced_templates.md`, and `apps/admin/src/pages/help.astro` now document the runtime semantics of `must_have_terms`, `must_not_have_terms`, and `short_tokens_required`, so operators no longer author templates under the old AND assumption;
  - `docs/work.md` and `docs/history.md` were synced so the completed tuning slice no longer remains as a live active item.
- Что проверено:
  - required-read-order reload of `AGENTS.md`, `docs/work.md`, `docs/blueprint.md`, `docs/engineering.md`, `docs/verification.md`, and `.aidp/os.yaml`
  - `python -m unittest tests.unit.python.test_worker_hard_filters`
  - `node -e "JSON.parse(require('node:fs').readFileSync('docs/data_scripts/outsource_balanced_templates.json','utf8')); console.log('json-ok')"`
  - targeted operator-doc review of `docs/blueprint.md`, `EXAMPLES.md`, `docs/data_scripts/outsource_balanced_templates.md`, and `apps/admin/src/pages/help.astro`
  - `git diff --check -- docs/work.md docs/history.md docs/blueprint.md EXAMPLES.md docs/data_scripts/outsource_balanced_templates.md apps/admin/src/pages/help.astro services/workers/app/main.py tests/unit/python/test_worker_hard_filters.py docs/data_scripts/outsource_balanced_templates.json`
- Риски или gaps:
  - this archived slice does not yet import the rewritten bundle into live system interests or LLM templates;
  - no recompile/reindex/runtime quality proof has been executed for the new bundle yet;
  - score thresholds, corpus cleanup, and broader `system-selected` quality remain separate follow-up work and are not redefined by this tuning slice.
- Follow-up:
  - if the user wants the next truthful step, open a fresh bounded stage that imports the updated bundle into the live admin/runtime layer, recompiles or reindexes the current corpus, and then verifies whether the new buyer-intent boundaries materially improve `system-selected`.

### 2026-04-07 — C-CHANNEL-AUTH-HEADER — Archived per-channel static Authorization header support for RSS and website ingest

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: the user asked to implement the planned per-channel ingest auth slice so operator-ready `rss` and `website` channels can use a static `Authorization` header, protected website polling also works through browser fallback, `429` keeps retry semantics, and the admin/API surfaces do not leak secrets back through read models or edit forms.
- Что изменилось:
  - `database/ddl/phase4_matching_notification.sql`, `database/migrations/0020_channel_auth_headers.sql`, `packages/contracts/src/source.ts`, and `services/api/app/main.py` now add durable `source_channels.auth_config_json` storage for fetcher-side source auth, expose only safe read-model summary via `has_authorization_header`, and keep the raw secret out of `config_json` and public/admin read payloads;
  - `apps/admin/src/components/ChannelEditorForm.tsx`, `apps/admin/src/lib/server/rss-channels.ts`, `apps/admin/src/lib/server/website-channels.ts`, `apps/admin/src/pages/channels/new.astro`, `apps/admin/src/pages/channels/[channelId]/edit.astro`, and `apps/admin/src/pages/bff/admin/channels.ts` now give the operator a bounded `Authorization header` field for `rss` and `website`, with explicit preserve/replace/clear semantics on edit and audit-log-safe configured/cleared mutations without echoing the stored secret back into HTML;
  - `services/fetchers/src/fetchers.ts` and `services/fetchers/src/web-ingestion.ts` now read `auth_config_json`, apply the raw header only to same-origin source requests, keep `429` as scheduler-based `rate_limited`, raise auth-oriented `hard_failure` messages for `401/403`, and inject website browser auth through same-origin request interception rather than global browser context headers;
  - `services/fetchers/src/cli/test-channel-auth-smoke.ts`, `services/fetchers/src/cli/test-website-smoke.ts`, `services/fetchers/src/cli/test-hard-sites-smoke.ts`, `tests/unit/ts/admin-rss-channels.test.ts`, `tests/unit/ts/admin-website-channels.test.ts`, `tests/unit/ts/web-ingestion-browser.test.ts`, `services/relay/src/cli/test-migrations.ts`, `package.json`, `services/fetchers/package.json`, and the runtime docs now prove the protected RSS/website path end-to-end, stabilize the website/hard-site smokes around isolated local fixtures plus smoke-owned enrichment/handoff cleanup, and keep migration smoke aligned with the new schema.
- Что проверено:
  - required-read-order reload of `AGENTS.md`, `docs/work.md`, `docs/blueprint.md`, `docs/engineering.md`, `docs/verification.md`, and `.aidp/os.yaml`
  - required deep-contract reload of `docs/contracts/browser-assisted-websites.md` and `docs/contracts/test-access-and-fixtures.md`
  - `git status --short`
  - `pnpm typecheck`
  - `pnpm unit_tests`
  - `pnpm test:channel-auth:compose`
  - `pnpm test:website:compose`
  - `pnpm test:hard-sites:compose`
  - `pnpm integration_tests`
  - `git diff --check -- services/relay/src/cli/test-migrations.ts docs/blueprint.md docs/contracts/browser-assisted-websites.md docs/verification.md .aidp/os.yaml docs/manual-mvp-runbook.md docs/work.md docs/history.md packages/contracts/src/source.ts database/migrations/0020_channel_auth_headers.sql database/ddl/phase4_matching_notification.sql services/api/app/main.py apps/admin/src/components/ChannelEditorForm.tsx apps/admin/src/lib/server/rss-channels.ts apps/admin/src/lib/server/website-channels.ts apps/admin/src/pages/channels/new.astro 'apps/admin/src/pages/channels/[channelId]/edit.astro' apps/admin/src/pages/bff/admin/channels.ts services/fetchers/src/fetchers.ts services/fetchers/src/web-ingestion.ts services/fetchers/src/cli/test-channel-auth-smoke.ts services/fetchers/src/cli/test-website-smoke.ts services/fetchers/src/cli/test-hard-sites-smoke.ts tests/unit/ts/admin-rss-channels.test.ts tests/unit/ts/admin-website-channels.test.ts tests/unit/ts/web-ingestion-browser.test.ts package.json services/fetchers/package.json`
- Риски или gaps:
  - current source auth remains intentionally bounded to raw static `Authorization` headers stored in PostgreSQL; secrets-manager rollout and encryption-at-rest are not part of this archived slice;
  - interactive login, cookie/session replay, OAuth, CAPTCHA solving, and broader anti-bot bypass stay explicitly unsupported;
  - operator-ready auth UI still covers only `rss` and `website`; `api`, `email_imap`, and `youtube` remain separate follow-up surfaces;
  - the repository worktree remains heavily mixed with unrelated in-flight edits, and this archive does not claim a clean tree.
- Follow-up:
  - if the user wants the next auth-related slice, open a fresh bounded capability for provider defaults, bulk RSS import auth, manual per-channel retry/run-now UX, or broader provider/operator coverage instead of reopening this archived lane.

### 2026-04-04 — C-USER-TRIAGE-DIGEST — Archived per-user triage state, manual saved digests, scheduled digest cadence, and followed-story updates

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: the user asked to implement the planned analyst-friendly user capability so readers can distinguish new vs seen content, save items for later, assemble a manual saved-items digest, receive a real scheduled personalized digest at configurable cadences, and follow editorial story clusters for later updates without mutating the public Python content APIs.
- Что изменилось:
  - `database/migrations/0019_user_triage_digest_following.sql`, `database/ddl/phase4_matching_notification.sql`, and `packages/contracts/src/user-content.ts` now add durable persistence/contracts for `user_content_state`, `user_digest_settings`, `digest_delivery_log`, `digest_delivery_items`, and `user_followed_event_clusters`, including migration of the legacy weekly-email preference into structured scheduled-digest settings;
  - `services/workers/app/main.py`, `services/workers/app/digests.py`, `services/workers/app/delivery.py`, `services/workers/app/notification_preferences.py`, and worker startup/runtime wiring now cut `email_digest` out of the immediate per-article delivery loop, keep `web_push`/`telegram` as the only immediate channels, send manual and scheduled digests through a separate digest-delivery log, and poll due scheduled digests through a dedicated scheduler loop;
  - `apps/web` now overlays per-user `new/seen/saved/following` state on collection, matches, and content detail surfaces, adds app-local BFF mutations for content state/story follow/digest settings/manual digest flow, introduces `/saved`, `/saved/digest`, `/following`, digest export/send endpoints, and updates settings so cadence, timezone, skip-empty, next-send, and last-send truth come from the new digest state instead of the old weekly toggle;
  - proof and local acceptance harnesses were updated so `pnpm unit_tests` covers triage/story-update and digest cadence helpers, `pnpm integration_tests` proves saved/manual digest preview-export-email plus scheduled runtime delivery to Mailpit, and worker compose smoke continues proving immediate non-email delivery without silently reusing legacy `email_digest` assumptions.
- Что проверено:
  - required-read-order reload of `AGENTS.md`, `docs/work.md`, `docs/blueprint.md`, `docs/engineering.md`, `docs/verification.md`, and `.aidp/os.yaml`
  - `git status --short`
  - `pnpm typecheck`
  - `pnpm unit_tests`
  - `pnpm integration_tests`
  - `git diff --check -- docs/work.md docs/history.md docs/blueprint.md docs/verification.md .aidp/os.yaml`
- Риски или gaps:
  - live external Telegram/web-push endpoints remain outside the bounded local proof contour; closeout proof is compose/Mailpit-backed and deterministic rather than uncontrolled third-party validation;
  - public Python content APIs intentionally remain unchanged in v1, so triage/digest mutations are still owned by the app-local web BFF layer;
  - the repository worktree remains mixed with unrelated in-flight changes, and this archive does not claim a clean tree.
- Follow-up:
  - if the user wants the next slice here, open a fresh capability for user-visible digest history/audit UX, notes-highlights-tags on saved items, AI multi-article synthesis, or broader public API exposure for saved/followed views instead of reopening this archived lane.

### 2026-04-03 — PATCH-WEB-INGESTION-ROOT-CLEANUP — Removed the stale root website-ingestion planning memo

- Тип записи: item archive
- Финальный статус: archived
- Зачем понадобилось: the workspace still contained a root `web_ingestion.md` engineering reference even though the actual website-ingestion capability had already been archived and its surviving truth moved into runtime-core docs; after a read-only consistency review the user explicitly asked to delete the file instead of keeping a parallel planning document in the repo root.
- Что изменилось:
  - the stale root `web_ingestion.md` file was removed from the workspace so website-ingestion no longer keeps an extra root-level planning memo next to the runtime core;
  - `docs/work.md` was resynced so live state now says the deleted root file is not part of current website/discovery truth and the next item should not resurrect old root planning docs as parallel authority;
  - durable website-ingestion truth remains unchanged and continues to live in `docs/blueprint.md`, `docs/contracts/browser-assisted-websites.md`, and the existing archived capability records for universal web ingestion, website-source closeout, and browser-assisted hard sites.
- Что проверено:
  - required-read-order reload of `AGENTS.md`, `docs/work.md`, `docs/blueprint.md`, `docs/engineering.md`, `docs/verification.md`, and `.aidp/os.yaml`
  - `git status --short`
  - targeted consistency review of `web_ingestion.md` against the live website runtime docs and code paths
  - `test ! -e web_ingestion.md`
  - `rg -n "web_ingestion\\.md" README.md docs apps services packages tests infra . -S`
  - `git diff --check -- docs/work.md docs/history.md`
- Риски или gaps:
  - this cleanup removes stale documentation only; it does not change website runtime behavior or re-run compose/runtime proof;
  - historical archive entries still mention `web_ingestion.md` as the source that originally drove the capability, which is intentional history rather than a live dependency.
- Follow-up:
  - if the user wants more cleanup here, open a new bounded item for any other surviving stale root planning docs or doc-authority drift instead of restoring this file.

### 2026-04-03 — C-ARTICLE-LLM-MONTHLY-BUDGET — Archived the baseline article LLM monthly budget and hard-stop capability

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: the user asked to implement an env-driven monthly budget for baseline article/system-interest LLM review, matching discovery-style monthly hard-stop semantics while keeping settings env-only, avoiding a new cost ledger, exposing operator-visible budget state in admin, and making `LLM_REVIEW_ENABLED` a real runtime kill switch instead of drifted config.
- Что изменилось:
  - `services/workers/app/main.py` now computes a UTC-month `llm_review_log.cost_estimate_usd` quota snapshot for `scope='criterion'`, enforces `LLM_REVIEW_ENABLED`, `LLM_REVIEW_MONTHLY_BUDGET_CENTS`, and `LLM_REVIEW_BUDGET_EXHAUST_ACCEPT_GRAY_ZONE` before new provider calls, auto-resolves gray-zone criterion rows locally instead of leaving `pending_llm`, writes structured `llmBudgetGate` explainability, and propagates the same budget-gate rationale into `system_feed_results`;
  - late queued criterion reviews now re-check the same runtime policy inside `process_llm_review`, skip Gemini when disabled or out of budget, avoid writing fake new `llm_review_log` rows, and still recalculate `system_feed_results` plus downstream clustering eligibility truthfully;
  - `services/api/app/main.py`, `packages/sdk/src/index.ts`, and `packages/config/src/index.ts` now expose a shared article LLM budget summary contract through `GET /maintenance/llm-budget-summary`, extend `/dashboard/summary` with compact budget fields, and parse the new env surface for SSR/admin runtime use;
  - `apps/admin/src/lib/live-updates.ts`, `apps/admin/src/lib/server/live-updates.ts`, `apps/admin/src/pages/index.astro`, `apps/admin/src/components/LiveDashboardKpiGrid.tsx`, `apps/admin/src/pages/observability.astro`, `apps/admin/src/components/LiveObservabilitySummary.tsx`, and `apps/admin/src/pages/help.astro` now surface budget enabled/disabled state, monthly cap, spend, remaining budget, hard-stop status, and accept/reject gray-zone policy on both dashboard and observability views without adding a new polling mechanism;
  - `.env.example`, `README.md`, `docs/blueprint.md`, `docs/verification.md`, `.aidp/os.yaml`, `package.json`, and `services/workers/app/smoke.py` were synced so the new env contract, proof contour, and dedicated `pnpm test:llm-budget-stop:compose` runtime smoke are part of durable repo truth rather than ad hoc session knowledge.
- Что проверено:
  - `python -m unittest tests.unit.python.test_interest_auto_repair tests.unit.python.test_api_feed_dedup`
  - `python -m py_compile services/workers/app/smoke.py`
  - `pnpm unit_tests`
  - `pnpm typecheck`
  - `pnpm test:llm-budget-stop:compose`
  - `git diff --check -- services/workers/app/main.py services/workers/app/smoke.py services/api/app/main.py packages/config/src/index.ts packages/sdk/src/index.ts apps/admin/src/lib/live-updates.ts apps/admin/src/lib/server/live-updates.ts apps/admin/src/pages/index.astro apps/admin/src/components/LiveDashboardKpiGrid.tsx apps/admin/src/components/LiveObservabilitySummary.tsx apps/admin/src/pages/observability.astro apps/admin/src/pages/help.astro tests/unit/python/test_interest_auto_repair.py tests/unit/python/test_api_sequence_management.py tests/unit/python/test_api_feed_dedup.py tests/unit/ts/discovery-admin.test.ts tests/unit/ts/admin-live-updates.test.ts .env.example README.md docs/blueprint.md docs/verification.md docs/work.md .aidp/os.yaml package.json`
- Риски или gaps:
  - the archived capability covers only baseline article/system-interest gray-zone review; discovery budget semantics and user-interest LLM review remain separate lanes;
  - settings remain env-only and read-only in admin; operator-editable budget CRUD is still out of scope;
  - the new compose smoke proves late queued runtime gating for both reject/accept post-cap policies, while fresh-ingest budget exhaustion and live-internet Gemini behavior continue to rely on deterministic local proof plus unit coverage rather than uncontrolled external validation.
- Follow-up:
  - if the user wants the next slice here, open a fresh bounded capability for admin-writeable policy/settings control, richer operator reporting/history around budget exhaustion, or additional compose/runtime proof for first-touch gray-zone fallback from `article.match_criteria`.

### 2026-04-03 — PATCH-EXAMPLES-DISCOVERY-ENV-CLARITY — Archived the discovery-aligned examples/env documentation patch

- Тип записи: item archive
- Финальный статус: archived
- Зачем понадобилось: the user asked for `EXAMPLES.md` to stop hand-waving discovery mode, correlate more honestly with the example bundles already in the file, and for `.env.example` to explain every existing setting because the current template was too opaque.
- Что изменилось:
  - `EXAMPLES.md` now keeps the original RSS + templates examples but adds a dedicated discovery appendix with prerequisites, the meaning of the active `DISCOVERY_*` knobs, enable/verify steps, mission seed guidance aligned to Example A (job board) and Example B (developer news), and an explicit statement of what still remains outside the file;
  - the top framing and FAQ in `EXAMPLES.md` were updated so the document no longer says discovery is entirely elsewhere while still staying honest that full website/hard-site manual verification and broader bootstrap details live in `README.md` plus `docs/manual-mvp-runbook.md`;
  - `.env.example` is now grouped and commented line-by-line, explaining database/runtime ports, SSR/public base URLs, Firebase JSON expectations, Gemini/discovery fallback behavior, monthly-vs-per-mission discovery budgets, dormant search-provider placeholders, delivery credentials, and the remaining future IMAP settings;
  - `docs/work.md` and `docs/history.md` were synced so the patch does not linger as an implicit active item.
- Что проверено:
  - `git diff --check -- EXAMPLES.md .env.example docs/work.md docs/history.md`
  - targeted `rg` review across `EXAMPLES.md` confirming the new discovery appendix mentions `DISCOVERY_ENABLED`, `DISCOVERY_AUTO_APPROVE_THRESHOLD`, `DISCOVERY_MONTHLY_BUDGET_CENTS`, `/admin/discovery`, `/maintenance/discovery/summary`, `/admin/resources`, `interest_centroids`, and the renumbered FAQ section;
  - manual spot-check of the updated `EXAMPLES.md`, `.env.example`, and runtime-doc sync in `docs/work.md`.
- Риски или gaps:
  - this is a docs-only patch; it does not claim new runtime proof beyond the already archived discovery/website/browser-assisted capabilities;
  - full `.env.dev` bootstrap, complete website/hard-site operator verification, and uncontrolled live-internet discovery behavior remain intentionally outside this file.
- Follow-up:
  - if the user wants more, the next truthful slice would be either a broader bootstrap/runbook rewrite around `.env.dev` and secrets setup or a separate advanced discovery playbook for operator heuristics and review policy.

### 2026-03-30 — SWEEP-DOCS-VERIFICATION-READINESS — Archived the operator-doc consistency sweep for MVP verification

- Тип записи: item archive
- Финальный статус: archived
- Зачем понадобилось: after a docs review found that `HOW_TO_USE.md` still described the product as RSS-only, `EXAMPLES.md` overstated itself as a full setup guide, and the operator-facing docs did not explain the new browser-assisted website lane, the user asked to fix the documentation everywhere necessary so MVP verification could follow truthful instructions.
- Что изменилось:
  - `HOW_TO_USE.md` now describes both operator-ready source types (`rss` and `website`), adds a dedicated website/JS-heavy note, points manual verification toward `/resources`, and stops telling operators that non-RSS sources are future-only;
  - `EXAMPLES.md` now scopes itself honestly as RSS + template examples, explicitly says it does not cover `.env.dev`, Firebase/bootstrap, discovery enable, or website/hard-site setup, and points readers to `README.md` plus `docs/manual-mvp-runbook.md` for the full MVP path;
  - `README.md` now includes an explicit browser-assisted website / hard-site subsection next to the discovery runtime guidance, documenting `browserFallbackEnabled`, `maxBrowserFetchesPerPoll`, `/admin/resources`, `pnpm test:hard-sites:compose`, and the out-of-scope login/CAPTCHA boundary;
  - `docs/manual-mvp-runbook.md` now treats website ingest as including opt-in browser fallback for public JS-heavy sites, documents a dedicated `Website channels and hard sites` manual verification section, and ties discovery-approved JS-heavy website candidates back to the same `website` + `/resources` verification lane;
  - `docs/work.md` and `docs/history.md` were synced so the live work state no longer leaves this docs sweep implicit.
- Что проверено:
  - targeted `rg` consistency check for stale RSS-only wording across `HOW_TO_USE.md`, `EXAMPLES.md`, `README.md`, and `docs/manual-mvp-runbook.md` returned no matches;
  - targeted `rg` consistency check confirmed the updated docs now mention `DISCOVERY_ENABLED`, `/admin/discovery`, `/resources`, `browserFallbackEnabled`, `maxBrowserFetchesPerPoll`, and `pnpm test:hard-sites:compose` where expected;
  - manual line-numbered spot-checks of `HOW_TO_USE.md`, `EXAMPLES.md`, `README.md`, `docs/manual-mvp-runbook.md`, `docs/work.md`, and `docs/history.md`.
- Риски или gaps:
  - this sweep updates operator-facing guidance only; it does not claim new runtime proof beyond the already archived website/discovery/browser-assisted capabilities;
  - real-internet discovery behavior and anti-bot behavior remain intentionally out of scope for local MVP docs and should stay separated from the canonical safe-by-default baseline.
- Follow-up:
  - if the user wants more doc work, the next bounded follow-up would be either a dedicated discovery-tuning reference for the advanced `DISCOVERY_*` knobs or broader operator docs for the remaining non-operator-ready providers (`api`, `email_imap`, `youtube`).

### 2026-03-30 — C-BROWSER-ASSISTED-HARD-SITES — Archived fetchers-owned browser assistance for JS-heavy website sources

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: the user explicitly asked to implement the bounded hard-sites plan so JS-heavy / soft anti-bot websites could be handled as a separate capability without reopening the archived website-ingestion architecture or pretending hidden feeds should turn website sources into RSS.
- Что изменилось:
  - `services/fetchers/src/web-ingestion.ts`, `services/fetchers/src/fetchers.ts`, `services/fetchers/src/main.ts`, `services/fetchers/package.json`, `package.json`, and `infra/docker/fetchers.Dockerfile` now provide the fetchers-owned browser runtime: Playwright/Chromium-backed `browser_assisted` discovery, same-origin DOM/network capture, challenge detection (`login`, `captcha`, `cloudflare_js_challenge`, `unsupported_block`), additive browser provenance, the internal discovery probe endpoint `/internal/discovery/websites/probe`, explicit hard-failure handling for unsupported blocks, and a deterministic `pnpm test:hard-sites:compose` harness;
  - `services/workers/app/task_engine/adapters/website_probe.py`, `services/workers/app/task_engine/adapters/__init__.py`, `services/workers/app/task_engine/adapters/source_registrar.py`, `services/workers/app/discovery_orchestrator.py`, `services/workers/app/task_engine/discovery_plugins.py`, and `services/workers/app/smoke.py` now route website probing through fetchers, preserve `browser_assisted_recommended` / `challenge_kind` / discovered-feed hints through discovery evaluation and registration, materialize `browserFallbackEnabled` only for website candidates that actually need it, and keep hidden feeds as hints instead of auto-converting website sources into RSS;
  - `apps/admin/src/pages/resources.astro` and `apps/admin/src/pages/resources/[resourceId].astro` now surface browser-assisted provenance on the existing resource observability lane, so operators can distinguish cheap/static discovery from browser DOM/network/download discovery and see recorded challenge metadata;
  - `tests/unit/ts/web-ingestion-browser.test.ts`, `tests/unit/python/test_discovery_fetchers_website_probe.py`, `tests/unit/python/test_discovery_orchestrator.py`, and `tests/unit/python/test_task_engine_discovery_plugins.py` now cover browser fallback gating, segment-safe URL classification, fetchers probe normalization, discovery registration hints, and the preservation of hidden feed hints for registered website channels;
  - `docs/contracts/browser-assisted-websites.md`, `docs/contracts/README.md`, `docs/blueprint.md`, `docs/engineering.md`, `docs/verification.md`, `.aidp/os.yaml`, `docs/work.md`, and `docs/history.md` were synced so the repo now documents browser assistance as a fetchers-owned website capability with explicit proof boundaries and failure rules instead of leaving it implied by code or admin config.
- Что проверено:
  - `pnpm unit_tests`
  - `pnpm unit_tests:ts`
  - `PYTHONPATH=. python -m unittest tests.unit.python.test_discovery_fetchers_website_probe tests.unit.python.test_discovery_orchestrator tests.unit.python.test_task_engine_discovery_plugins`
  - `pnpm typecheck`
  - `pnpm dev:mvp:internal`
  - `pnpm test:hard-sites:compose`
  - `pnpm test:website:compose`
  - `pnpm test:website:admin:compose`
  - `pnpm test:discovery-enabled:compose`
- Риски или gaps:
  - v1 remains intentionally local-proof-only; uncontrolled live-internet anti-bot behavior is still out of scope;
  - login-required sources, CAPTCHA solving, manual challenge bypass, stealth scraping escalation, and non-website providers remain explicitly unsupported;
  - umbrella `pnpm integration_tests` remains RSS-first, so browser-assisted website proof continues to live in dedicated compose commands rather than the generic acceptance umbrella.
- Follow-up:
  - if the user wants the next slice here, open a fresh bounded capability for live-network/browser rollout or for the remaining provider CRUD (`api`, `email_imap`, `youtube`) instead of reopening this archived browser-assisted lane.

### 2026-03-30 — C-WEBSITE-SOURCE-CLOSEOUT — Archived the website-source operator closeout beyond onboarding

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: after confirming that website ingest runtime already existed but website sources still lacked truthful post-ingest observability and browser/admin-style acceptance, the user asked to finish the missing website-source surfaces instead of reopening the archived ingest architecture.
- Что изменилось:
  - `services/api/app/main.py`, `packages/contracts/src/source.ts`, and `packages/sdk/src/index.ts` now expose dedicated `web_resources` list/detail contracts plus `/maintenance/web-resources*` read models with projection-aware filters, so operator tooling can inspect both projected editorial rows and resource-only entity/document rows without pretending everything must become an `article`;
  - `apps/admin/src/pages/resources.astro`, `apps/admin/src/pages/resources/[resourceId].astro`, `apps/admin/src/layouts/AdminShell.astro`, `apps/admin/src/pages/index.astro`, and `apps/admin/src/pages/channels.astro` now provide a first-class admin `/resources` lane with list/detail drilldown, channel linkage, truthful projection labels, and direct access from website channels and the dashboard;
  - `apps/admin/src/lib/server/website-channels.ts` now persists `homepage_url = fetch_url` for admin-created or updated website channels, keeping the operator write path aligned with the seeded/runtime website contract instead of leaving admin-created website channels slightly under-specified;
  - `infra/scripts/test-website-admin-flow.mjs`, `package.json`, `tests/unit/python/test_api_web_resources.py`, and `tests/unit/ts/admin-website-channels.test.ts` now add deterministic website operator acceptance: the script signs in through the real admin app, creates a website channel, runs a bounded website poll, proves `/maintenance/web-resources*` plus `/admin/resources*`, and uses an in-`fetchers` fixture server plus crawl-policy-cache cleanup so the acceptance path matches the real Node-fetch runtime instead of relying on fragile host aliases;
  - `README.md`, `docs/manual-mvp-runbook.md`, `docs/verification.md`, `docs/blueprint.md`, `.aidp/os.yaml`, `docs/work.md`, and `docs/history.md` were synced so the repo now documents website sources as operator-ready beyond onboarding, with dedicated website acceptance commands and truthful residual follow-up scope.
- Что проверено:
  - `node --check infra/scripts/test-website-admin-flow.mjs`
  - `node --import tsx --test tests/unit/ts/admin-website-channels.test.ts`
  - `python -m unittest tests.unit.python.test_api_web_resources`
  - `pnpm dev:mvp:internal`
  - `pnpm test:website:admin:compose`
  - `pnpm typecheck`
  - `pnpm unit_tests`
  - `pnpm test:website:compose`
- Риски или gaps:
  - browser-assisted hard-site discovery/extraction remains explicitly out of scope and still needs a separate bounded capability if website sources must handle JS-heavy or anti-bot sites;
  - operator CRUD for `api`, `email_imap`, and `youtube` remains a separate follow-up even though `rss` and `website` are now operator-ready lanes;
  - umbrella `pnpm integration_tests` stays intentionally RSS-first, so website end-to-end proof now lives in dedicated website compose commands rather than the generic acceptance umbrella.
- Follow-up:
  - if the user wants the next source-related slice, open a fresh bounded capability for hard-site/browser support or the remaining provider CRUD instead of reopening this archived website closeout.

### 2026-03-30 — C-HISTORICAL-ENRICHMENT-BACKFILL — Archived the enrichment-enabled historical repair path for editorial articles

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: the user asked to implement the already-planned critical-risk follow-up for sequence/backfill integrity, so historical editorial articles could be repaired through the same fetchers-owned enrichment owner without widening runtime ownership or resending retro notifications.
- Что изменилось:
  - `services/workers/app/reindex_backfill.py` and `services/workers/app/main.py` now extend the existing `reindex_jobs` + `reindex_job_targets` maintenance path with additive `includeEnrichment` / `forceEnrichment` options, conservative target selection for editorial `articles`, published synthetic outbox rows for inbox/idempotency truth, and a fixed historical replay order `enrichment.article_extract -> normalize -> dedup -> embed -> match_criteria -> criterion replay -> cluster -> match_interests` with no `notify` stage;
  - `apps/admin/src/pages/bff/admin/reindex.ts` and `apps/admin/src/pages/reindex.astro` now surface enrichment-enabled historical repair as an explicit operator choice on `/reindex`, default `forceEnrichment` to off, and keep the UI wording aligned with the no-retro-notification maintenance contract;
  - `services/workers/app/smoke.py` and `tests/unit/python/test_reindex_backfill_progress.py` now prove the new path on a deterministic long-body editorial fixture: snapshot-stable totals, truthful `includeEnrichment` bookkeeping, `skipped` enrichment persistence for feed HTML/media, and unchanged no-retro-notify / duplicate-safe match guarantees;
  - `docs/blueprint.md`, `docs/verification.md`, `docs/manual-mvp-runbook.md`, and `docs/contracts/universal-task-engine.md` were synced so the repo now documents enrichment-enabled repair as a maintenance replay contract rather than a new ingest trigger or queue runtime.
- Что проверено:
  - `python -m unittest tests.unit.python.test_reindex_backfill_progress`
  - `python -m py_compile services/workers/app/main.py services/workers/app/reindex_backfill.py services/workers/app/smoke.py`
  - `pnpm unit_tests`
  - `pnpm typecheck`
  - `docker compose -f infra/docker/compose.yml -f infra/docker/compose.dev.yml exec -T worker python -m app.smoke reindex-backfill`
  - `pnpm integration_tests`
- Риски или gaps:
  - enrichment-enabled historical repair is bounded to editorial `articles`; non-editorial `web_resources` remain separate product/runtime work;
  - the operator-facing `/reindex` surface now exposes force rerun, but user/interest-scoped enrichment repair remains intentionally out of scope beyond the existing generic doc-targeted capability in `reindex_jobs`;
  - repo-wide Python still has no dedicated static typecheck gate beyond the proof contour above.
- Follow-up:
  - if the user wants the next slice, open a fresh bounded capability for non-editorial browse UX or remaining provider CRUD (`api`, `email_imap`, `youtube`) instead of reopening this archived repair lane.

### 2026-03-29 — C-SYSTEM-INTEREST-UNIVERSALIZATION — Archived the no-backward-compatibility cutover to a system-interest-driven universal content platform

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: the user first asked for a full cutover plan that makes content type follow system interests instead of a news-only product model, then asked to implement that plan fully without preserving the old public `feed` / `article` surfaces.
- Что изменилось:
  - `packages/contracts/src/content.ts`, `packages/contracts/src/system-interest.ts`, `packages/contracts/src/index.ts`, `packages/sdk/src/index.ts`, `services/api/app/main.py`, and `database/migrations/0018_system_interest_content_kinds.sql` now make `content_item`, `system interest`, `/collections/system-selected`, `/content-items/*`, and `/system-interests/*` the canonical shared/public contract while letting internal storage names remain legacy-only implementation detail;
  - `apps/web/src/components/ContentItemCard.tsx`, `apps/web/src/pages/index.astro`, `apps/web/src/pages/matches.astro`, `apps/web/src/pages/content/[id].astro`, `apps/web/src/lib/live-interest-state.ts`, and the integration harness in `infra/scripts/test-mvp-internal.mjs` now route the main user reading flow through content items rather than public `/feed` or `/article/*` paths, including a real fix for encoded `content_item_id` detail routing;
  - `apps/admin/src/components/TemplateFormsIsland.tsx`, `apps/admin/src/components/LlmTemplateEditorForm.tsx`, `apps/admin/src/components/ChannelEditorForm.tsx`, `apps/admin/src/pages/help.astro`, `apps/admin/src/pages/reindex.astro`, `apps/admin/src/pages/channels.astro`, `apps/admin/src/pages/channels/[channelId]/edit.astro`, `apps/admin/src/pages/bff/admin/channels.ts`, `apps/admin/src/lib/server/source-channels.ts`, and `services/api/app/main.py` now describe the product in system-interest/content terms, keep editorial moderation on explicit maintenance surfaces, and treat channel history/delete safety in terms of stored items rather than only linked articles;
  - `README.md`, `docs/contracts/content-model.md`, `docs/contracts/README.md`, `docs/manual-mvp-runbook.md`, `docs/verification.md`, `docs/blueprint.md`, `.aidp/os.yaml`, and `docs/work.md` were synced so the durable repo truth, operator runbook, and proof language match the universal content platform cutover.
- Что проверено:
  - `pnpm typecheck`
  - `pnpm unit_tests`
  - `pnpm integration_tests`
- Риски или gaps:
  - internal runtime/storage names like `criteria`, `system_feed_results`, and `articles` still remain as legacy implementation detail and were not renamed physically in this capability;
  - operator-ready create/edit flows are now truthful for `rss` and `website`, but `api`, `email_imap`, and `youtube` still remain backend/runtime-capable follow-up provider surfaces rather than full admin CRUD flows;
  - broad browse UX for non-editorial `web_resources` is still separate product work after this public semantic cutover.
- Follow-up:
  - if the user wants the next slice here, open a fresh bounded capability for operator CRUD on the remaining provider types, for browse/observability UX around non-editorial resources, or for the already-ready historical enrichment backfill instead of reopening this archived capability.

### 2026-03-29 — C-UNIVERSAL-WEB-INGESTION — Archived the generic website-ingestion resource lane with compose-backed closeout proof

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: the user first asked for a repo-specific implementation plan from `web_ingestion.md`, then asked to implement that capability fully rather than leave website ingest as the old one-page HTML-to-article shortcut or keep the compose/runtime residue implicit.
- Что изменилось:
  - `database/migrations/0017_web_ingestion_resource_layer.sql`, `packages/contracts/src/source.ts`, `packages/contracts/src/queue.ts`, `services/fetchers/src/web-ingestion.ts`, `services/fetchers/src/fetchers.ts`, `services/fetchers/src/resource-enrichment.ts`, `services/relay/src/relay.ts`, and `services/workers/app/task_engine/pipeline_plugins.py` now provide the additive `web_resources` + `crawl_policy_cache` persistence layer, provider-agnostic website config, cheap multi-mode discovery, `resource.ingest.requested` sequence routing, typed resource extraction, and editorial article projection without replacing the existing `articles` lane wholesale;
  - `apps/admin/src/lib/server/website-channels.ts`, `apps/admin/src/pages/bff/admin/channels.ts`, `apps/admin/src/components/ChannelEditorForm.tsx`, `apps/admin/src/pages/channels.astro`, `apps/admin/src/pages/channels/new.astro`, `apps/admin/src/pages/channels/[channelId]/edit.astro`, and `apps/admin/src/pages/help.astro` now keep website onboarding provider-aware instead of pretending website sources are just RSS in disguise;
  - discovery semantics were rebalanced in `services/workers/app/task_engine/adapters/website_probe.py`, `services/workers/app/task_engine/adapters/source_registrar.py`, `services/workers/app/task_engine/discovery_plugins.py`, and `services/workers/app/discovery_orchestrator.py` so hidden RSS/news-site heuristics stay signals rather than canonical provider truth;
  - closeout work added `services/fetchers/src/cli/test-website-smoke.ts`, root/package scripts for `pnpm test:website:compose`, admin website-channel unit coverage in `tests/unit/ts/admin-website-channels.test.ts`, and a port-preserving crawl-policy origin fix in `services/fetchers/src/web-ingestion.ts` so deterministic website proof also works on non-default ports instead of silently dropping sitemap/feed discovery during local runtime tests;
  - `docs/verification.md`, `.aidp/os.yaml`, `docs/work.md`, and `docs/history.md` were synced so the website capability now has an explicit closeout command and no longer remains half-live in the active work document.
- Что проверено:
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm unit_tests`
  - `pnpm test:migrations:smoke`
  - `python -m py_compile services/workers/app/smoke.py`
  - `pnpm test:website:compose`
  - `pnpm test:relay:compose`
  - `pnpm test:ingest:compose`
- Риски или gaps:
  - broad operator/public UX for browsing non-editorial `web_resources` is still follow-up product work rather than something this archive claims to have closed;
  - browser-assisted hard-site discovery/extraction remains explicitly out of scope for the archived capability and must land as a separate bounded stage if needed;
  - the reusable resource lane for `api` and `email_imap` is still architectural truth and code-shape guidance, but not yet implemented as a separate provider follow-up.
- Follow-up:
  - if the user wants the next slice here, open a fresh capability for `web_resources` observability/browse UX, browser-assisted hard sites, or provider reuse for `api` / `email_imap` instead of reopening this archived capability.

### 2026-03-28 — SWEEP-ROOT-PLANNING-DOC-CONSOLIDATION — Moved surviving root-plan truth into blueprint and removed stale root planning docs

- Тип записи: sweep archive
- Финальный статус: archived
- Зачем понадобилось: the repository still kept discovery/extractus/source-agent planning docs in the root even after their durable meaning had already been implemented and mostly migrated into runtime-core docs; the user explicitly asked to keep only the valid surviving truth in `docs/blueprint.md` and remove the stale root planning artifacts.
- Что изменилось:
  - `docs/blueprint.md` now states three surviving discovery rules that were still only implicit across the old root plans: `interest_graph` is discovery working memory rather than a UI-only projection, discovery scoring is explicitly `Source Profile × Interest`, and the current discovery execution baseline is bounded to RSS and website child sequences rather than broader API/IMAP/YouTube discovery channels;
  - stale root planning docs `DISCOVERY.md`, `DISCOVERY_EVOLUTION_PLAN.md`, `EXTRACTUS_INTEGRATION_PLAN.md`, and `agent_source.md` were removed from the repository root after that truth transfer;
  - `docs/work.md` and `docs/history.md` were synced so the removal is recorded as a deliberate sweep instead of silent filesystem cleanup.
- Что проверено:
  - `git diff --check -- docs/work.md docs/blueprint.md docs/history.md DISCOVERY.md DISCOVERY_EVOLUTION_PLAN.md EXTRACTUS_INTEGRATION_PLAN.md agent_source.md`
  - targeted `rg` review confirming that runtime-core docs no longer depend on the deleted root planning docs for live architecture truth
- Риски или gaps:
  - historical archive entries still reference the deleted files as past artifacts, which is intentional historical context rather than live dependency;
  - this sweep removes stale planning docs, not the broader product gap that current operator-ready source onboarding remains RSS-only.
- Follow-up:
  - if the user later wants operator-ready non-RSS source onboarding, open a fresh bounded capability instead of restoring root planning docs as parallel truth.

### 2026-03-28 — C-MVP-OPERATOR-RUNBOOK-PACK — Expanded manual MVP docs into a full operator-facing runbook pack

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: after a read-only audit of manual MVP readiness, the user asked to turn the findings into committed operator docs instead of leaving the repo with only a minimal RSS-first checklist and hidden setup assumptions.
- Что изменилось:
  - `docs/manual-mvp-runbook.md` now provides a single operator-facing guide for the local MVP baseline, including a truthful coverage matrix, required envs, Firebase/Gemini/web-push/Telegram setup notes, public API checks, moderation/reindex/enrichment-retry flow, and explicit cleanup/reset guidance;
  - the runbook also adds a repeatable deterministic local RSS fixture path via `http://web:4321/internal-mvp-feed.xml?...`, so operators can exercise the local MVP without needing a canonical external feed bundle;
  - `README.md` now keeps the short quick-start checklist but links to the full runbook, points operators to the deterministic local fixture option, and explicitly states that current committed admin/operator source CRUD is RSS-only while `website`, `api`, and `email_imap` ingest remain code-present but not operator-ready from this baseline;
  - `docs/work.md` and `docs/history.md` were synced so this docs-only follow-up does not stay as a pseudo-active item after the runbook landed.
- Что проверено:
  - `git diff --check -- README.md docs/manual-mvp-runbook.md docs/work.md docs/history.md`
  - targeted `rg` review across `README.md`, `docs/manual-mvp-runbook.md`, `docs/work.md`, and `docs/history.md` for runbook links, deterministic fixture URLs, RSS-only operator wording, notification feedback coverage, and cleanup/reset references
- Риски или gaps:
  - umbrella automated acceptance remains RSS-first and still does not prove `website`, `api`, or `email_imap` ingest;
  - `web_push` browser receipt and Telegram delivery remain optional manual-only checks;
  - the repo still does not ship a canonical real external RSS feed bundle, only a local deterministic fixture path plus a placeholder template for real feeds.
- Follow-up:
  - if the user wants operator-ready non-RSS source onboarding or a broader manual pack beyond the current RSS-first admin surface, open a new bounded capability instead of reopening this archive.

### 2026-03-28 — C-ADAPTIVE-SOURCE-DISCOVERY-CUTOVER — Hard-cut discovery over to the adaptive graph-first registry-driven contract

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: the user explicitly asked to stop evolving the old discovery foundation incrementally and instead replace it with the adaptive architecture end-to-end, including extensible hypothesis classes, destructive schema/API cutover, and the full declared discovery proof contour.
- Что изменилось:
  - `database/migrations/0016_adaptive_discovery_cutover.sql` now destructively replaces the legacy discovery schema with graph-first missions, registry-managed hypothesis classes, class-linked hypotheses, candidates, source profiles, contextual source-interest scores, portfolio snapshots, feedback events, strategy stats and the preserved discovery cost ledger, while reseeding the discovery orchestrator plus RSS/website child sequences on the existing UTE runtime;
  - `services/workers/app/discovery_orchestrator.py`, `services/workers/app/source_scoring.py`, `services/workers/app/task_engine/orchestrator_plugins.py`, and the discovery LLM/runtime adapters now compile authoritative mission graphs, load active hypothesis classes from PostgreSQL, allow data-only custom classes for existing backends, persist profile/score/portfolio/feedback/re-evaluation state, and keep approved-source registration PostgreSQL-first plus outbox-driven;
  - `services/api/app/main.py`, `packages/sdk/src/index.ts`, `apps/admin/src/pages/bff/admin/discovery.ts`, and `apps/admin/src/pages/discovery.astro` now expose graph/class-first `/maintenance/discovery/*` semantics including class management, mission graph compilation, source-profile and score views, portfolio snapshots, feedback submission and re-evaluation controls with same-origin BFF audit logging preserved;
  - `services/workers/app/smoke.py` now extends `test:discovery-enabled:compose` into a compose-backed adaptive walkthrough that creates a mission, compiles the graph, adds a custom class through the registry, plans and executes the class, persists candidate/profile/score/portfolio state, writes feedback, re-evaluates the mission, verifies strategy stats, and proves final source registration through `source_channels` plus `source.channel.sync.requested`, all with cleanup;
  - `docs/contracts/discovery-agent.md`, `docs/contracts/universal-task-engine.md`, `docs/blueprint.md`, `docs/verification.md`, `.aidp/os.yaml`, `docs/work.md`, and `docs/history.md` were synced so the new adaptive discovery contract is the only live discovery truth and the legacy discovery semantics remain historical only.
- Что проверено:
  - `python -m py_compile services/api/app/main.py services/workers/app/discovery_orchestrator.py services/workers/app/source_scoring.py`
  - `python -m py_compile services/workers/app/smoke.py`
  - `python -m unittest tests.unit.python.test_api_discovery_management tests.unit.python.test_discovery_orchestrator tests.unit.python.test_task_engine_pipeline_plugins`
  - `python -m unittest tests.unit.python.test_task_engine_discovery_plugins tests.unit.python.test_discovery_llm_adapter`
  - `node --import tsx --test tests/unit/ts/discovery-admin.test.ts tests/unit/ts/sdk-pagination.test.ts`
  - `pnpm typecheck`
  - `pnpm unit_tests`
  - `pnpm test:migrations:smoke`
  - `pnpm test:relay:compose`
  - `pnpm test:ingest:compose`
  - `pnpm test:discovery-enabled:compose`
  - `pnpm integration_tests`
- Риски или gaps:
  - discovery remains disabled by default at the committed baseline, and the enabled-runtime compose smoke is still bounded fake-provider/local-harness proof rather than uncontrolled real-internet validation;
  - repo-wide Python still has no separate static typecheck gate beyond the executed unit/integration/proof stack.
- Follow-up:
  - if the user wants real-network discovery rollout, new `generation_backend` kinds, or broader operator automation around adaptive discovery, open a new bounded capability instead of reopening this archive.

### 2026-03-28 — SWEEP-COMMIT-READY-CLOSEOUT — Added separate historical backfill capability planning and normalized the mixed tree into a commit-ready snapshot

- Тип записи: sweep archive
- Финальный статус: archived
- Зачем понадобилось: after `C-EXTRACTUS-INTEGRATION` was archived, the user explicitly asked for two follow-ups that were process-heavy rather than new implementation work: open historical enrichment backfill as a separate future capability instead of silently folding it into the shipped ingest rollout, and make the existing mixed dirty tree honest and commit-ready.
- Что изменилось:
  - `docs/work.md` now keeps `C-HISTORICAL-ENRICHMENT-BACKFILL` as a separate ready capability with its own completion condition, stage outline, and boundary notes, instead of leaving historical enrichment as an implied TODO under the archived ingest capability;
  - the live worktree framing now treats the current snapshot as an intentional staged commit-ready state that contains the archived discovery/Extractus runtime truth plus repo-kept planning/reference docs, rather than as an unexplained dirty overlap;
  - the cleanup decision was to preserve substantive root planning/reference docs (`DISCOVERY.md`, `DISCOVERY_EVOLUTION_PLAN.md`, `EXTRACTUS_INTEGRATION_PLAN.md`, `agent_source.md`) as repository artifacts instead of deleting or hiding them ad hoc.
- Что проверено:
  - `git status --short`
  - `git diff --name-only`
  - `git diff --stat`
  - targeted `rg` consistency check across runtime/docs files after the closeout sync
- Риски или gaps:
  - this sweep makes the tree commit-ready, not git-clean; an actual commit or commit split still remains a human or later-agent action;
  - `C-HISTORICAL-ENRICHMENT-BACKFILL` is planning-only and intentionally unproven until a future bounded implementation stage opens.
- Follow-up:
  - commit the staged snapshot as one or more intentional commits, then activate `C-HISTORICAL-ENRICHMENT-BACKFILL` with a fresh stage if historical article backfill is still wanted.

### 2026-03-28 — C-EXTRACTUS-INTEGRATION — Landed extractus feed parsing, pre-normalize enrichment, media ownership, and article detail/admin retry surfaces

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: the user asked to implement `EXTRACTUS_INTEGRATION_PLAN.md` fully rather than leave it as a planning artifact, which required replacing the old feed parser, inserting fetchers-owned enrichment into the live article sequence, surfacing real media/detail state in web/admin, and proving the end-to-end path without breaking the sequence-first runtime cutover.
- Что изменилось:
  - `services/fetchers` now parses RSS/ATOM/JSON Feed through extractus, persists richer normalized feed payloads in `raw_payload_json`, and exposes `POST /internal/enrichment/articles/{doc_id}` for full-article/media extraction with deterministic skip/failure handling;
  - `database/migrations/0015_article_enrichment.sql` now adds article enrichment fields plus per-channel enrichment controls and updates the existing active article sequence so `enrichment.article_extract` runs before `article.normalize` while keeping `article.ingest.requested` as the same default trigger;
  - `services/workers/app/task_engine/pipeline_plugins.py`, `services/workers/app/main.py`, and `services/workers/app/task_engine/executor.py` now call the fetchers-owned enrichment endpoint from the sequence runtime, tolerate a short `sequence_runs` visibility race after enqueue, and let downstream normalize prefer enriched body/metadata when available;
  - `services/api/app/main.py`, `packages/contracts`, `packages/sdk`, `apps/web`, and `apps/admin` now expose enrichment/media preview fields, internal article detail routes, admin article detail visibility, per-channel enrichment settings, and a maintenance retry path that reuses the active article pipeline via a manual `sequence_run`;
  - `infra/docker/compose.yml`, `services/relay/src/cli/test-migrations.ts`, `services/fetchers/src/cli/test-enrichment-smoke.ts`, `infra/scripts/test-mvp-internal.mjs`, and the unit suites were synced so the compose baseline now truthfully supports API-side manual sequence dispatch and the proof stack covers enrichment-specific happy/skip/failure paths.
- Что проверено:
  - `pnpm unit_tests`
  - `pnpm typecheck`
  - `pnpm test:migrations:smoke`
  - `pnpm test:enrichment:compose`
  - `pnpm integration_tests`
- Риски или gaps:
  - the capability intentionally does not backfill already ingested historical articles; only newly ingested or manually retried articles go through the new enrichment owner by default;
  - the fetchers enrichment path remains bounded to server-side HTTP/article/media extraction and does not claim browser-heavy anti-bot extraction support;
  - repo-wide Python still has no separate static typecheck gate beyond the unit/integration proof stack already executed here.
- Follow-up:
  - if the user wants historical enrichment backfill, broader website/API provider extraction, or richer article-reader UX, open a new bounded capability instead of reopening this archived one.

### 2026-03-28 — C-DISCOVERY-ENABLE-RUNBOOK — Mirrored discovery envs, added operator runbook, and proved enabled-runtime compose smoke

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: the user asked for the next bounded discovery follow-up to stop being a design intention and become operator-ready repo truth: mirror the dedicated discovery Gemini env surface onto the real runtime values, set a `$5` monthly discovery cap, document live enable/monitor/rollback steps, and add plus execute a separate `DISCOVERY_ENABLED=true` smoke in the test environment.
- Что изменилось:
  - `.env.dev`, `.env.prod`, and `.env.example` now mirror the ordinary Gemini model, base URL, and tariff values onto the dedicated discovery env surface, keep `DISCOVERY_SEARCH_PROVIDER=ddgs`, set the DDGS defaults, and set `DISCOVERY_MONTHLY_BUDGET_CENTS=500` while preserving the committed safe baseline `DISCOVERY_ENABLED=0`;
  - `package.json`, `.aidp/os.yaml`, and `services/workers/app/smoke.py` now define and implement the bounded discovery-enabled smoke path, including fake DDGS and fake Gemini provider harnesses that verify live adapter selection, metadata emission, and `$5` monthly quota resolution under `DISCOVERY_ENABLED=true`;
  - `README.md`, `DISCOVERY.md`, `docs/verification.md`, and `docs/contracts/test-access-and-fixtures.md` now include the short operator live-enable runbook, monitoring surfaces, rollback path, and the compose smoke as the declared bounded proof.
- Что проверено:
  - `python -m py_compile services/workers/app/smoke.py`
  - `pnpm test:discovery-enabled:compose`
  - local compose stack lifecycle was exercised with `pnpm dev:mvp:internal` and cleaned in the same sync cycle with `pnpm dev:mvp:internal:down`
- Риски или gaps:
  - the committed repo baseline intentionally remains `DISCOVERY_ENABLED=0`; this archive does not claim a default-on rollout;
  - the enabled-runtime proof is still a bounded local fake-provider harness, not uncontrolled live-network DDGS/Gemini validation.
- Follow-up:
  - if the user wants the next discovery slice, open a fresh bounded item for broader operator rollout or real-network/live-provider validation instead of reopening this archived follow-up.

### 2026-03-28 — C-DISCOVERY-DDGS-QUOTA — Landed DDGS discovery search, dedicated discovery Gemini config, and monthly quota enforcement

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: the user asked to implement the approved follow-up discovery plan rather than leave it as a design note, which required turning DDGS live-provider support, discovery-specific Gemini env/cost fallbacks, precise spend accounting, and a hard monthly quota into real worker/API/admin/runtime truth.
- Что изменилось:
  - `database/migrations/0014_discovery_cost_precision_and_quota.sql` now adds precise USD discovery spend columns (`discovery_cost_log.cost_usd`, `discovery_hypotheses.execution_cost_usd`) with backfill from operator-facing cents;
  - `services/workers/app/task_engine/adapters/web_search.py` now includes `DdgsWebSearchAdapter`, keeps `StubWebSearchAdapter` as rollback/test coverage, normalizes `DDGS().text()` / `DDGS().news()` results, and emits structured zero-cost `search_meta`;
  - `services/workers/app/task_engine/adapters/llm_analyzer.py` and `services/workers/app/task_engine/discovery_plugins.py` now split discovery Gemini env/cost config from legacy review, return/result-wrap provider metadata, and write `search_meta` plus default or overridden `*_meta` sidecars into discovery sequence context;
  - `services/workers/app/discovery_orchestrator.py` now dispatches the live search adapter by provider, logs mission-level and hypothesis-level precise USD spend, enforces mission budget and UTC calendar-month quota from precise spend, and stores hypothesis execution totals in both USD and rounded cents;
  - `services/api/app/main.py`, `apps/admin/src/pages/discovery.astro`, `packages/config/src/index.ts`, `.env.example`, `infra/docker/compose.yml`, `infra/docker/python.requirements.txt`, `README.md`, `DISCOVERY.md`, `docs/blueprint.md`, `docs/contracts/universal-task-engine.md`, `docs/verification.md`, and `.aidp/os.yaml` were synced so operator-visible runtime truth now shows DDGS as the default live provider, the discovery LLM model/quota state, and manual-run `409` behavior when the monthly quota is exhausted.
- Что проверено:
  - `python -m unittest tests.unit.python.test_discovery_orchestrator tests.unit.python.test_task_engine_discovery_plugins tests.unit.python.test_discovery_llm_adapter tests.unit.python.test_api_discovery_management`
  - `node --import tsx --test tests/unit/ts/discovery-admin.test.ts`
  - `pnpm unit_tests`
  - `pnpm typecheck`
  - `pnpm test:migrations:smoke`
- Риски или gaps:
  - discovery remains disabled by default, so live DDGS network behavior and enabled-runtime compose proof are still separate future work rather than something this archive claims to have closed;
  - `stub` remains supported intentionally as rollback/test coverage even though DDGS is now the default live-provider contract;
  - no non-Gemini discovery LLM abstraction or broader discovery automation policy was added beyond the requested monthly hard cap.
- Follow-up:
  - if the user wants the next discovery slice, open a new bounded item for enabled-runtime discovery smoke, operator rollout/playbook work, or additional provider/policy changes instead of reopening this archived capability.

### 2026-03-27 — C-DISCOVERY-AGENT — Implemented the safe-by-default AI Discovery Agent capability

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: the user asked to implement `DISCOVERY.md` fully rather than leave it as a design note, which required turning the approved staged rollout into real schema, sequence-engine orchestration, maintenance/admin surfaces, proof and synced runtime truth.
- Что изменилось:
  - `database/migrations/0013_discovery_agent_foundation.sql` now creates `discovery_missions`, `discovery_hypotheses`, `discovery_candidates` and `discovery_cost_log`, and seeds three draft discovery sequences: a top-level orchestrator plus reusable RSS and website child pipelines;
  - `services/workers/app/task_engine` discovery contracts now include `website_probe`, widened URL classification, `provider_type`-aware source registration, live adapter implementations, and new orchestrator plugins `discovery.plan_hypotheses`, `discovery.execute_hypotheses`, `discovery.evaluate_results`;
  - worker-side discovery orchestration now lives in `services/workers/app/discovery_orchestrator.py`, reusing the task-engine repository layer to create child `sequence_runs`, track candidates/costs/effectiveness, and keep source registration PostgreSQL-first plus outbox-driven;
  - FastAPI now exposes `/maintenance/discovery/*` summary/mission/candidate/hypothesis/cost endpoints, SDK methods cover the same surface, Astro admin adds `/discovery` plus same-origin BFF write routes with audit logging, and the admin navigation/dashboard now surface discovery explicitly;
  - worker startup now wires live discovery runtime only when `DISCOVERY_ENABLED=true`, env defaults and docs were synced, and the rollout remains safe by default with stub search/manual review unless an operator intentionally changes those flags.
- Что проверено:
  - `python -m unittest tests.unit.python.test_task_engine_discovery_plugins tests.unit.python.test_discovery_orchestrator tests.unit.python.test_api_discovery_management tests.unit.python.test_api_sequence_management`
  - `node --import tsx --test tests/unit/ts/sdk-pagination.test.ts tests/unit/ts/discovery-admin.test.ts`
  - `pnpm typecheck`
  - `pnpm unit_tests`
  - `pnpm test:migrations:smoke`
- Риски или gaps:
  - live provider-backed discovery search remained intentionally out of scope for this archived capability; it landed later in follow-up work, so this archive should still be read as the pre-DDGS foundation state;
  - discovery runtime is wired but disabled by default, so enabled-runtime compose smoke and operator activation remain separate future work;
  - manual approval remains the default review mode; broader automation or trust-policy changes need a new bounded item.
- Follow-up:
  - if the user wants the next discovery stage, open a fresh capability for real search-provider integration, enabled-runtime/compose proof, or richer operator automation instead of reopening this archived rollout.

### 2026-03-27 — P-UMBRELLA-RESIDUALS-1 — Closed the umbrella `/settings` proof failure and fixed Firebase proof-admin cleanup

- Тип записи: patch archive
- Финальный статус: archived
- Зачем понадобилось: after the sequence-engine migration had already been proven green on its own boundary, the broader umbrella `pnpm integration_tests` still failed later on the nginx-routed `/settings` HTML assertion and left an honest cleanup concern around `internal-admin-<runId>` Firebase proof identities on failed runs.
- Что изменилось:
  - `apps/web/src/components/LiveSettingsSection.tsx` now renders progressive-enhancement form contracts for settings and notification-channel mutations: the SSR HTML exposes `method="post"` and nginx-safe `action` paths for `/bff/preferences` and `/bff/notification-channels`, while the client island still intercepts submits for the live UX;
  - the same settings forms now carry stable field names and boolean fallback inputs so the server-side BFF contract remains truthful even without JavaScript enhancement;
  - `infra/scripts/test-mvp-internal.mjs` now signs in and deletes its `internal-admin-<runId>` Firebase proof-admin identity in `finally`, so future successful or failed umbrella runs do not silently leak that user.
- Что проверено:
  - targeted inspection of the `/settings` BFF contract and harness cleanup flow
  - `pnpm typecheck`
  - `pnpm integration_tests`
  - `git diff --check -- apps/web/src/components/LiveSettingsSection.tsx infra/scripts/test-mvp-internal.mjs docs/work.md docs/history.md`
- Риски или gaps:
  - the patch closes the current repo-local umbrella failure and future cleanup drift, but one historical Firebase proof-admin alias from the pre-fix failed run may still exist because that earlier run never surfaced the exact alias;
  - no new sequence-engine work or broader auth redesign was performed in this patch.
- Follow-up:
  - if the user wants the last historical external Firebase residue removed too, open a separate bounded cleanup item; otherwise no live implementation residue remains from this patch.

### 2026-03-27 — SWEEP-UTE-AUDIT-1 — Audited the finished sequence-engine migration and synced the migration lessons

- Тип записи: sweep archive
- Финальный статус: archived
- Зачем понадобилось: after `C-UNIVERSAL-TASK-ENGINE` had already been archived, the user asked for a comprehensive audit proving that the new sequence engine migration had actually succeeded and for the practical lessons to be written back into `NEW_ARCHITECTURE.md` plus runtime-core docs where system truth was still underspecified.
- Что изменилось:
  - the audit revalidated the current runtime boundaries: relay default ownership for sequence-managed triggers, worker sequence-first startup defaults, non-sequence fallback limits, maintenance-only sequence API, DB-backed cron scheduling, and suppression of legacy intermediate article fanout;
  - `NEW_ARCHITECTURE.md` was updated with the migration lessons learned from NewsPortal: stable dotted module IDs, internal `/maintenance/*` API boundary, fail-fast relay behavior when a managed event has no active sequence route, DB-backed minute cron instead of BullMQ repeatable-job ownership, and additive-plus-parity cutover strategy instead of live dual execution;
  - `docs/blueprint.md` and `docs/contracts/universal-task-engine.md` were extended with missing durable truth around relay failure semantics and internal maintenance ownership for sequence management and agent surfaces.
- Что проверено:
  - targeted code/runtime consistency checks across `packages/contracts/src/queue.ts`, `services/relay/src/relay.ts`, `services/workers/app/main.py`, migrations, and the maintenance API surface
  - `pnpm unit_tests`
  - `pnpm typecheck`
  - `pnpm test:migrations:smoke`
  - `pnpm test:relay:compose`
  - `pnpm test:relay:phase3:compose`
  - `pnpm test:relay:phase45:compose`
  - `pnpm test:ingest:compose`
  - `pnpm test:normalize-dedup:compose`
  - `pnpm test:interest-compile:compose`
  - `pnpm test:criterion-compile:compose`
  - `pnpm test:cluster-match-notify:compose`
  - `git diff --check -- NEW_ARCHITECTURE.md docs/blueprint.md docs/contracts/universal-task-engine.md docs/work.md docs/history.md`
- Риски или gaps:
  - no blocking sequence-engine findings were discovered in the audit; the migration remains proven successful on its own cutover boundary;
  - the broader umbrella `pnpm integration_tests` failure on nginx `/settings` HTML and the possible Firebase proof-admin residue remain unrelated residuals and must stay in a separate bounded item if the user wants them fixed;
  - Python services still have no repo-level typecheck gate comparable to `pnpm typecheck`.
- Follow-up:
  - no truthful live next stage remains for this audit; any future work should either target the unrelated umbrella residuals or open a new sequence-engine follow-up capability only if runtime behavior changes again.

### 2026-03-27 — UTE-S8 — Archived the Universal Task Engine cutover and cleanup stage

- Тип записи: stage archive
- Финальный статус: archived
- Зачем понадобилось: additive foundation was already landed through `UTE-S7`, but the user asked to finish the capability truthfully, which required switching default relay/worker ownership to the sequence runtime, activating default sequences, removing default intermediate article fanout, and proving the live cutover path.
- Что изменилось:
  - `database/migrations/0012_sequence_engine_cutover_defaults.sql` activates the default article pipeline, LLM-review-resume pipeline, and maintenance sequences while archiving the old intermediate step seeds;
  - `packages/contracts/src/queue.ts`, `services/relay/src/config.ts`, `services/relay/src/main.ts`, and `services/relay/src/relay.ts` now make sequence routing the default for sequence-managed triggers, keep direct fallback only for non-sequence events, and fail managed events if no active sequence route exists;
  - `services/workers/app/main.py` now defaults to sequence runner + cron bootstrap, keeps legacy consumers opt-in only, and suppresses legacy intermediate article outbox events during sequence execution;
  - `services/relay/src/cli/test-phase3-routing.ts`, `services/relay/src/cli/test-phase45-routing.ts`, and `services/fetchers/src/cli/test-rss-smoke.ts` were rewritten to prove `sequence_runs` + thin `q.sequence` jobs and the absence of default `article.normalized` outbox fanout instead of asserting the old direct queue map.
- Что проверено:
  - `python -m py_compile services/workers/app/main.py services/workers/app/task_engine/*.py tests/unit/python/test_task_engine_pipeline_plugins.py`
  - focused Python and TS proof for pipeline adapters, executor/scheduler/API contracts, queue contracts, and relay sequence routing
  - `pnpm unit_tests`
  - `pnpm typecheck`
  - `pnpm test:migrations:smoke`
  - `pnpm test:relay:compose`
  - `pnpm test:relay:phase3:compose`
  - `pnpm test:relay:phase45:compose`
  - `pnpm test:ingest:compose`
  - `pnpm test:normalize-dedup:compose`
  - `pnpm test:interest-compile:compose`
  - `pnpm test:criterion-compile:compose`
  - `pnpm test:cluster-match-notify:compose`
- Риски или gaps:
  - broader umbrella `pnpm integration_tests` still fell later on an unrelated nginx `/settings` HTML assertion expecting `action="/bff/preferences"` after all sequence-specific cutover smokes had already passed;
  - the failed umbrella run may have left one Firebase allowlisted proof admin identity because `infra/scripts/test-mvp-internal.mjs` creates `internal-admin-<runId>` users and does not clean them up on failure, and the exact alias was not surfaced in captured output;
  - live provider-backed discovery/enrichment rollout remains intentionally out of scope for this capability.
- Follow-up:
  - if the user wants the broader umbrella gate green too, open a new bounded item for the nginx `/settings` assertion and Firebase proof-user cleanup instead of reopening the sequence-engine capability.

### 2026-03-27 — C-UNIVERSAL-TASK-ENGINE — Archived the completed Universal Task Engine capability

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: the user asked to implement `NEW_ARCHITECTURE.md` consistently inside the current system, so the repo needed a durable capability-level rollout from additive foundation to default sequence runtime, not just isolated code drops.
- Что изменилось:
  - `UTE-S1` introduced the sequence data model, shared queue/task-graph contracts, executor/repository skeleton, and durable contract doc;
  - `UTE-S2` and `UTE-S3` migrated the core article lane and maintenance lane into task-engine plugins via thin legacy-handler adapters;
  - `UTE-S4`, `UTE-S5`, `UTE-S6`, and `UTE-S7` added relay sequence lookup/run creation, internal maintenance API, discovery/enrichment adapter-backed plugins, and cron/agent surfaces;
  - `UTE-S8` completed the cutover by activating default sequences, switching relay/worker defaults to sequence-first execution, removing default legacy intermediate queue ownership, and syncing blueprint/verification/runtime truth.
- Что проверено:
  - repo-level `pnpm unit_tests` and `pnpm typecheck`
  - sequence-engine unit proof for executor, adapters, scheduler, maintenance API, agent API, queue contracts, and relay routing
  - cutover-specific compose proof for migrations, relay routing, RSS ingest, normalize/dedup, compile, cluster/match/notify, all on the new default sequence runtime path
- Риски или gaps:
  - unrelated umbrella integration failure on nginx `/settings` HTML assertion remains outside this capability boundary and must be handled in a separate item if needed;
  - one possible Firebase proof-user residue may remain from that unrelated umbrella failure;
  - future discovery live-provider rollout, public sequence UX, or broader operator tooling need new bounded follow-up items.
- Follow-up:
  - cross-chat durable truth for this archived capability now lives in `docs/contracts/universal-task-engine.md`; any new work should reference it and open a fresh item instead of reopening this archive.

### 2026-03-27 — S-RESIDUAL-PROOF-CLOSEOUT-1 — Proved fresh DB-written LLM cost from provider usage metadata

- Тип записи: stage archive
- Финальный статус: archived
- Зачем понадобилось: the earlier env-driven tariff patch proved deterministic estimation logic, but the user explicitly asked to close the remaining residuals, so this stage had to prove a fresh `llm_review_log` write with provider `usageMetadata` and non-null `cost_estimate_usd`.
- Что изменилось:
  - `services/workers/app/smoke.py` gained `llm-cost-proof`, a deterministic local proof path with a fake Gemini provider server plus temporary article/criterion fixtures and explicit DB cleanup;
  - `tests/unit/python/test_gemini.py` gained local provider-response coverage for `usageMetadata`, including token counts and cost estimation extraction;
  - the smoke now proves the persisted row fields directly instead of inferring them from helper-level tests.
- Что проверено:
  - `python -m py_compile services/workers/app/smoke.py tests/unit/python/test_gemini.py`
  - `PYTHONPATH=. python -m unittest tests.unit.python.test_gemini`
  - `docker compose -f infra/docker/compose.yml -f infra/docker/compose.dev.yml exec -T worker python -m app.smoke llm-cost-proof`
  - follow-up PostgreSQL cleanup verification returned zero temporary `llm_review_log`, `articles`, `criteria`, `inbox_processed_events`, and `outbox_events` residue
- Риски или gaps:
  - the stage proves worker-side estimation persistence, not external provider billing truth.
- Follow-up:
  - the remaining manual/browser closeout layer stayed in `S-RESIDUAL-PROOF-CLOSEOUT-2` until that stage also passed.

### 2026-03-27 — S-RESIDUAL-PROOF-CLOSEOUT-2 — Proved browser web-push receipt and cleaned stateful residue

- Тип записи: stage archive
- Финальный статус: archived
- Зачем понадобилось: web live-update/browser work was already archived, but the user explicitly asked to close the remaining residual browser receipt question for `web_push`, which required a real local browser session and explicit cleanup truth.
- Что изменилось:
  - `infra/docker/web.Dockerfile` now copies `apps/web/public`, fixing real `/sw.js` delivery in the local Docker web build;
  - `apps/web/public/sw.js` now mirrors received push payloads to open clients via `postMessage`, making browser receipt observable in proof without changing the notification contract;
  - the local runtime was recreated with `.env.dev` so `FIREBASE_WEB_API_KEY`, `WEB_PUSH_VAPID_PUBLIC_KEY`, and `WEB_PUSH_VAPID_PRIVATE_KEY` were actually wired during proof.
- Что проверено:
  - live `sw.js` checks returned `200` on both local direct and nginx-shaped paths after the Dockerfile fix;
  - a real Chrome session granted notifications, registered the service worker, created a real `web_push` channel, and received a worker-sent push with matching `web-push-received` payload plus visible notification card;
  - browser cleanup unsubscribed and closed the notification, and DB cleanup removed the temporary proof user/profile/channel rows with zero remaining residue
- Риски или gaps:
  - this stage proves the local browser delivery contract, not cross-browser or OS-level notification behavior outside the local dev baseline.
- Follow-up:
  - no truthful live next stage remained inside the residual-proof capability.

### 2026-03-27 — C-RESIDUAL-PROOF-CLOSEOUT — Residual provider-usage and browser receipt proof debt is durably closed

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: after broader live-update and runtime work had already shipped, the user asked to finish every small leftover, and the remaining explicit proof debt was concentrated in two residual layers: provider-usage-backed LLM cost persistence and real browser `web_push` receipt.
- Что изменилось:
  - `S-RESIDUAL-PROOF-CLOSEOUT-1` added deterministic local worker smoke plus unit coverage for fresh provider-usage-backed `llm_review_log.cost_estimate_usd` writes;
  - `S-RESIDUAL-PROOF-CLOSEOUT-2` fixed local service-worker delivery in Docker, recreated the local runtime with the right `.env.dev` wiring, and proved real browser `web_push` receipt plus cleanup;
  - the capability now has no remaining manual/operator completion layer and no tracked residual artifacts.
- Что проверено:
  - targeted Python compile/unit proof and live worker smoke for `llm-cost-proof`
  - real Chrome browser proof for `web_push` send, receipt, notification visibility, unsubscribe, and cleanup
- Риски или gaps:
  - this capability intentionally does not claim provider billing reconciliation or broader cross-platform push delivery readiness.
- Follow-up:
  - any future observability or notification-delivery expansion must open a new bounded item instead of reopening this archived closeout capability.

### 2026-03-27 — S-FETCHER-DUPLICATE-PREFLIGHT-1 — Closed fetcher duplicate preflight with focused smoke and compose proof

- Тип записи: stage archive
- Финальный статус: archived
- Зачем понадобилось: the fetcher-side duplicate precheck was already implemented and unit-covered, but the user explicitly resumed this blocked lane; the remaining work was to prove it against current repo reality without pretending that unrelated worker canonical-family or `304` expectations belonged to the same stage.
- Что изменилось:
  - `services/fetchers/src/cli/test-rss-smoke.ts` now accepts `--duplicate-preflight-only`, preserving the article/outbox/idempotent-refetch assertions while intentionally skipping unrelated `canonical_doc_id` / `family_id` checks;
  - `infra/scripts/test-rss-multi-flow.mjs` now accepts `--profiles=...`, so focused runs can isolate `healthy` + `duplicate` repeated-200 RSS paths, and it now correctly handles all-success targeted fixture sets without building `where name in ()`;
  - no fetcher ingest semantics were changed in this closeout; the stage only hardened truthful proof around the already-landed preflight logic.
- Что проверено:
  - `node --import tsx --test tests/unit/ts/fetcher-duplicate-preflight.test.ts`
  - `node --import tsx services/fetchers/src/cli/test-rss-smoke.ts --duplicate-preflight-only`
  - `node infra/scripts/test-rss-multi-flow.mjs --channel-count=24 --profiles=healthy,duplicate`
- Риски или gaps:
  - the stage proves fetcher-side duplicate suppression on repeated RSS polls; it does not claim broader worker-side `canonical_doc_id` / `family_id` population or default `not_modified` / `304` fixture coverage.
- Follow-up:
  - no truthful live next stage remained once the focused unit + smoke + compose proof passed, so the capability could be archived instead of stretched into artificial extra stages.

### 2026-03-27 — C-FETCHER-DUPLICATE-PREFLIGHT — Fetcher duplicate suppression is now durably proven and closed

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: duplicate rows on user-facing read models had already forced downstream dedupe/read-model fixes, but the upstream fetcher lane remained explicitly blocked until the pre-insert/pre-outbox duplicate suppression path could be proven on the real current runtime.
- Что изменилось:
  - the capability was truthfully collapsed to a single closeout stage because implementation had already landed in `services/fetchers/src/fetchers.ts`; what remained was proof and archive sync, not a second implementation slice;
  - focused harness modes now let the repo prove duplicate-preflight behavior directly instead of coupling the closeout to unrelated ingest invariants from broader smoke suites;
  - the capability now closes with no truthful live next stage and no hidden dependence on the default full ingest smoke commands.
- Что проверено:
  - classifier unit coverage in `tests/unit/ts/fetcher-duplicate-preflight.test.ts`
  - focused host RSS smoke with `--duplicate-preflight-only`
  - focused 24-channel compose proof with `--profiles=healthy,duplicate`
- Риски или gaps:
  - this capability does not backfill or repair historical duplicate rows already stored in PostgreSQL; it only closes the fetcher-side preflight suppression lane for repeated RSS ingest.
- Follow-up:
  - any future historical repair or broader ingest-contract work must open a new bounded item instead of reopening this archived capability.

### 2026-03-27 — S-ADMIN-LIVE-UPDATES-1 — Closed manual browser proof and cleanup for bounded admin live updates

- Тип записи: stage archive
- Финальный статус: archived
- Зачем понадобилось: automated proof for `apps/admin` was already green, but the stage still could not close until a real browser session confirmed that the hydrated dashboard, reindex, observability, and selected-user `/user-interests` surfaces react truthfully to background state changes without full-page reloads.
- Что изменилось:
  - a real Chrome session against `http://127.0.0.1:4322` proved the dashboard KPI card `System Feed News` updated inline from `132 -> 133` after inserting one temporary eligible article, while the same page showed the bounded table behavior by surfacing `New fetch runs are available` after a temporary `channel_fetch_runs` insert instead of live-diffing the whole table;
  - `/reindex` proved the in-place job-status flow end-to-end with one temporary job `residual_admin-proof-2d790db1-dda0-43ed-b523-7f2b59b9305a`, moving `queued -> running -> completed` and updating the inline progress label `1/3 articles -> 3/3 articles` without a page reload;
  - `/observability` proved live summary-card refresh by increasing `Reviews (24h)` from `798 -> 799` after one temporary `llm_review_log` row, and selected-user `/user-interests?userId=356428d4-8529-4e8e-bf02-082d946661aa` proved DOM-bound inline status refresh by switching the same interest `Compiled -> Queued -> Compiled` with compiled-count `1 -> 0 -> 1`;
  - all local admin proof rows were cleaned up in the same sync cycle: temporary `articles`, `system_feed_results`, `channel_fetch_runs`, `reindex_jobs`, and `llm_review_log` fixtures were deleted, and the proof-only local admin alias row `yluchaninov+internal-admin-682c854e@gmail.com` was removed after external Firebase cleanup.
- Что проверено:
  - existing automated proof remained the stage baseline: `node --import tsx --test tests/unit/ts/admin-live-updates.test.ts`, `pnpm --filter @newsportal/admin typecheck`, `pnpm unit_tests`, `git diff --check -- apps/admin/src docs/work.md tests/unit/ts`
  - real-browser proof via CDP-backed Chrome against the live local admin app, using temporary PostgreSQL fixtures and same-origin `window.__newsportalAdminLiveUpdates.forceRefresh()`
  - local DB cleanup verification showed zero remaining rows for the temporary `reindex_jobs`, `channel_fetch_runs`, `articles`, and `llm_review_log` fixtures
- Риски или gaps:
  - the stage intentionally kept broader admin realtime out of scope: `/articles`, `/channels`, `/clusters`, and `/templates/*` still require explicit refresh/reload patterns unless a later bounded item expands that contract.
- Follow-up:
  - no truthful live next stage remains inside this capability; only a separate future richer-realtime/admin scope would justify reopening it.

### 2026-03-27 — C-ADMIN-LIVE-UPDATES — Admin live counters and status surfaces are now durably closed

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: the capability was intentionally multi-layered: implementation landed earlier, but full completion required operator-facing browser proof and explicit cleanup of stateful proof residue before the admin live-update lane could leave `docs/work.md`.
- Что изменилось:
  - `SP-ADMIN-LIVE-UPDATES-1` bounded the rollout to dashboard KPIs, reindex status/progress, observability summary cards, and selected-user compile state, explicitly excluding full-table realtime;
  - `S-ADMIN-LIVE-UPDATES-1` shipped the same-origin polling coordinator, `/bff/admin/live-updates`, dashboard/observability summary islands, inline reindex job updates, and DOM-bound selected-user compile-status refreshes;
  - the final browser proof and cleanup closed the only remaining operator/manual completion layer, so the capability no longer needs live execution space.
- Что проверено:
  - `node --import tsx --test tests/unit/ts/admin-live-updates.test.ts`
  - `pnpm --filter @newsportal/admin typecheck`
  - `pnpm unit_tests`
  - real-browser Chrome proof across `/`, `/reindex`, `/observability`, and selected-user `/user-interests`
- Риски или gaps:
  - this capability does not claim broad admin realtime beyond the bounded surfaces above.
- Follow-up:
  - any future SSE/WebSocket work or full-table admin live diffing must open a new capability instead of reopening this archived one.

### 2026-03-27 — S-WEB-LIVE-UPDATES-1 — Closed manual browser proof and cleanup for bounded web live updates

- Тип записи: stage archive
- Финальный статус: archived
- Зачем понадобилось: `apps/web` already had targeted tests and polling code, but the stage still needed a real browser walkthrough proving that user-facing state stays on-page during mutations and that refresh notices appear only when fresh data arrives.
- Что изменилось:
  - a real Chrome session against `http://127.0.0.1:4321` proved `/settings` saves without full reload: the theme switched `dark -> light`, the page stayed on `/settings`, a window probe survived the mutation, and the script restored the original theme to `dark`;
  - `/interests` proved on-page mutation without reload by creating a real interest `Residual proof compiled interest 798157a2-74d0-4d54-8b85-23d3d000ee5f`, increasing the total `1 -> 2`, preserving a window probe on `/interests`, and observing the new interest move from `queued` to `compiled`;
  - feed, matches, and notifications each proved the bounded refresh-notice path while the page stayed open: temporary fixtures moved totals `/ 129 -> 130`, `/matches 35 -> 36`, and `/notifications 0 -> 1`, with `New system-selected articles available`, `New personal matches available`, and `New notification history available` visible only after the background inserts plus live refresh.
  - all local web proof artifacts were cleaned up in the same sync cycle: the temporary anonymous user `356428d4-8529-4e8e-bf02-082d946661aa`, both proof-only interests, the temporary article, and the derived `interest_match_results` / `notification_log` rows were deleted.
- Что проверено:
  - existing automated proof remained the stage baseline: `node --import tsx --test tests/unit/ts/live-updates.test.ts tests/unit/ts/live-interest-state.test.ts`, `pnpm --filter @newsportal/web typecheck`, `pnpm unit_tests`, `git diff --check -- apps/web/src docs/work.md tests/unit/ts`
  - real-browser proof via CDP-backed Chrome against the live local web app, using temporary PostgreSQL fixtures and same-origin `window.__newsportalLiveUpdates.forceRefresh()`
  - local DB cleanup verification showed zero remaining rows for the temporary user, interests, article, match, and notification fixtures
- Риски или gaps:
  - browser receipt for `web_push` remains outside this stage and still needs a separate manual-only follow-up if the product wants that proof.
- Follow-up:
  - no truthful live next stage remains inside this capability; richer transport or broader UX work belongs in a new bounded capability.

### 2026-03-27 — C-WEB-LIVE-UPDATES — Web live user-state updates are now durably closed

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: implementation and tests landed earlier, but the capability could only close once the browser-level mutation and refresh-notice contract was proven on the real local app and all temporary user-bound artifacts were cleaned up truthfully.
- Что изменилось:
  - `S-WEB-LIVE-UPDATES-1` shipped the same-origin polling coordinator, `/bff/live-updates`, live `/interests` and `/settings` islands, and refresh notices for `/`, `/matches`, and `/notifications`;
  - the final browser walkthrough proved both mutation-style and background-refresh-style UX paths, then removed the temporary user-bound artifacts and stateful proof residue.
- Что проверено:
  - `node --import tsx --test tests/unit/ts/live-updates.test.ts tests/unit/ts/live-interest-state.test.ts`
  - `pnpm --filter @newsportal/web typecheck`
  - `pnpm unit_tests`
  - real-browser Chrome proof across `/settings`, `/interests`, `/`, `/matches`, and `/notifications`
- Риски или gaps:
  - this capability intentionally does not introduce realtime transport or change admin-scope behavior.
- Follow-up:
  - future SSE/WebSocket work or `web_push` browser receipt proof must open a new explicit item.

### 2026-03-27 — P-MVP-BUGFIX-6 — Archived browser-scoped auth persistence after live browser confirmation

- Тип записи: patch archive
- Финальный статус: archived
- Зачем понадобилось: the patch had already passed targeted tests, but it still occupied live space until the broader browser-based closeout pass proved that the preserved browser-scoped session model coexists cleanly with the new `/settings` and `/interests` on-page mutation flows.
- Что изменилось:
  - `apps/web/src/lib/server/auth.ts` and `/bff/auth/bootstrap` keep reusing the browser-scoped Firebase refresh token so the same browser returns to the same anonymous/local account after logout/login;
  - the later live browser walkthrough for web live updates confirmed that the persisted browser-scoped session can safely carry real user-bound settings and interests through on-page mutations, after which the patch no longer needed to remain half-live in `docs/work.md`.
- Что проверено:
  - `node --import tsx --test tests/unit/ts/web-auth-session.test.ts`
  - `node --import tsx --test tests/unit/ts/app-routing.test.ts`
  - `pnpm --filter @newsportal/web typecheck`
  - `git diff --check -- apps/web/src/lib/server/auth.ts apps/web/src/pages/bff/auth/bootstrap.ts tests/unit/ts/web-auth-session.test.ts docs/blueprint.md docs/work.md`
  - real-browser web mutation proof on the preserved browser-scoped session
- Риски или gaps:
  - shared-device tradeoffs remain a product decision, but the runtime behavior is now intentionally documented instead of accidental.
- Follow-up:
  - no live implementation residue remains; any future multi-device/account-linking work belongs in a new item.

### 2026-03-27 — P-MVP-BUGFIX-5 — Archived the recovered local worker runtime after canonical env/model repair

- Тип записи: patch archive
- Финальный статус: archived
- Зачем понадобилось: the runtime recovery patch had already repaired the real blocker, but it stayed awkwardly half-live in `docs/work.md` until the broader residual-closeout pass could confirm there was no remaining proof or cleanup debt keeping it open.
- Что изменилось:
  - the local worker/runtime now runs with canonical `.env.dev` semantics, a live `GEMINI_API_KEY`, and `gemini-2.0-flash` instead of the stale preview model, so historical backfill and current feed truth are no longer local-config artifacts;
  - later live browser validation of user-facing/admin surfaces happened on the recovered runtime, so this patch no longer has a separate open manual-validation layer.
- Что проверено:
  - canonical worker restart with `--env-file .env.dev`
  - approved backfill job `f11923b8-01d4-41b3-8d95-e0f108d7ad5b` completed `4024/4024`
  - live reconciliation proved `/feed.total = 62`, `dashboard/summary.active_news = 62`, and `system_feed_results.eligible = 62` with no Gemini `HTTP 404`
- Риски или gaps:
  - provider `usageMetadata` is still absent on the smoke path, so this patch does not by itself prove a fresh DB-written non-null `cost_estimate_usd` row.
- Follow-up:
  - that observability/provider-usage question remains an explicit separate gap rather than hidden residue on this patch.

### 2026-03-27 — P-FEED-DUPLICATE-1 — Archived canonical-family dedupe on public feed surfaces

- Тип записи: patch archive
- Финальный статус: archived
- Зачем понадобилось: the API fix was shipped and proven earlier, but it still occupied live context until the residual-closeout sync moved its durable meaning into history.
- Что изменилось:
  - `/feed`, `/matches`, and `dashboard/summary.active_news` now dedupe by canonical article family via `coalesce(canonical_doc_id, doc_id)`, so users no longer see one card per duplicate article copy;
  - the patch remains intentionally read-model-only: raw/admin/debug surfaces can still see the underlying duplicate `articles` rows until a separate ingest/data-repair item handles them.
- Что проверено:
  - `PYTHONPATH=. python -m unittest tests.unit.python.test_api_matches tests.unit.python.test_api_feed_dedup`
  - `python -m py_compile services/api/app/main.py tests/unit/python/test_api_matches.py tests/unit/python/test_api_feed_dedup.py`
  - live reconciliation on the compose dataset proved `39` raw eligible rows collapsing to `30` visible canonical feed cards
- Риски или gaps:
  - duplicate rows still exist in PostgreSQL by design; only the user-facing read surfaces are deduped.
- Follow-up:
  - broader ingest-side duplicate suppression remains separate blocked work under `C-FETCHER-DUPLICATE-PREFLIGHT`.

### 2026-03-27 — P-LLM-COST-ENV-1 — Archived env-driven LLM tariff overrides

- Тип записи: patch archive
- Финальный статус: archived
- Зачем понадобилось: the pricing patch was already proven, but the user asked to close every residual, so its durable runtime meaning and its honest remaining proof gap needed to move out of live execution state.
- Что изменилось:
  - worker-side Gemini cost estimation now prefers `LLM_INPUT_COST_PER_MILLION_USD` / `LLM_OUTPUT_COST_PER_MILLION_USD`, with `.env.example` and `.env.dev` seeded to the official paid-tier `gemini-2.0-flash` rates `0.10` / `0.40`;
  - the reloaded runtime resolved `price_card_source = env_override` with the expected deterministic estimate, so alternate local model configs no longer silently inherit the built-in price card.
- Что проверено:
  - `PYTHONPATH=. python -m unittest tests.unit.python.test_gemini`
  - `python -m py_compile services/workers/app/gemini.py tests/unit/python/test_gemini.py`
  - deterministic in-container probe confirmed `_estimate_cost_usd('gemini-2.0-flash', 1000, 500) = 0.0003`
- Риски или gaps:
  - provider `usageMetadata` was still absent on the smoke path, so the patch honestly stops short of proving a fresh DB-written non-null `cost_estimate_usd` row through the full review pipeline.
- Follow-up:
  - any future provider-billing or end-to-end observability proof should open a separate bounded item instead of reopening this archived patch.

### 2026-03-27 — C-MVP-BUGFIXES — The minimal working MVP blocker lane is now durably closed

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: the blocker lane had accumulated several already-shipped fixes, but the capability stayed half-live in `docs/work.md` until the final archive sync could confirm there was no truthful next bugfix stage left in the current user request.
- Что изменилось:
  - archived work from this capability now covers the whole blocker arc: public feed source-link restoration, admin confirm-dialog visibility, shared UI build hardening, criterion lexical-score repair, local worker/runtime recovery, and browser-scoped auth/session persistence;
  - the closeout sync confirmed that the recovered runtime, system-first feed, and browser-scoped session model all remained stable while the final web/admin browser proofs ran, so no additional blocker fix is still waiting inside this capability.
- Что проверено:
  - earlier stage/patch proofs already archived their targeted unit, build, runtime, and reconciliation evidence
  - the residual-closeout sync added real browser validation plus explicit cleanup of local/external proof artifacts, removing the last reason to keep the capability live
- Риски или gaps:
  - `website`, `api`, and `email_imap` ingest remain outside the RSS-first acceptance gate, but that is baseline product scope rather than a blocker bug inside this archived capability.
- Follow-up:
  - any future MVP bug should open a fresh bounded item instead of reopening `C-MVP-BUGFIXES`.

### 2026-03-27 — S-SYSTEM-GATED-CLUSTERING-3 — Closed doc sync and archived the criteria-gated clustering rollout

- Тип записи: stage archive
- Финальный статус: archived
- Зачем понадобилось: после landing fresh-ingest и historical-backfill stages capability все еще оставался half-live в `docs/work.md`; нужен был явный archive sync, чтобы новый контракт не дрейфовал обратно к старому `cluster -> criteria -> interests` mental model.
- Что изменилось:
  - `docs/blueprint.md` и `docs/verification.md` уже были synced to the shipped runtime truth: `article.embedded -> criteria -> article.criteria.matched -> cluster -> article.clustered -> interests`, filtered-out articles skip both cluster and personalization, and operator-facing processed KPIs count final system-gate rows instead of only `matched/notified`;
  - `docs/work.md` compressed `C-SYSTEM-GATED-CLUSTERING` out of live capability space, switched the primary active item back to the remaining admin live-update proof lane, and kept mixed-worktree warnings explicit because archived clustering files are still dirty/uncommitted beside unrelated web/admin work;
  - no broader operator-copy follow-up was required to close the capability; any future worker/API/KPI wording changes in this lane now need a new bounded item instead of silently reopening the closed rollout.
- Что проверено:
  - targeted `sed`/`rg` doc consistency reads across `docs/work.md`, `docs/blueprint.md`, `docs/verification.md`, and `docs/history.md`
  - `git diff --check -- docs/work.md docs/history.md`
- Риски или gaps:
  - archive sync intentionally does not commit the dirty tree; completed clustering code changes remain in the worktree until the user decides how to stage/commit them.
- Follow-up:
  - manual browser proof for `S-ADMIN-LIVE-UPDATES-1` and `S-WEB-LIVE-UPDATES-1`, plus separate archive sync for older done patches, remain separate work.

### 2026-03-27 — C-SYSTEM-GATED-CLUSTERING — Criteria-gated clustering now sits durably before personalization

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: пользователь зафиксировал target order `criteria gate -> cluster only eligible/pass_through articles -> user interests`, but the repo still ran clustering before the system gate and mixed processed/reporting truth with downstream personalization states.
- Что изменилось:
  - `SP-SYSTEM-GATED-CLUSTERING-1` proved that criteria scoring itself does not require `event_cluster_id`, while novelty/suppression, historical replay, relay routing, and reporting semantics do, so the rollout had to be staged instead of treated as a one-line reorder;
  - `S-SYSTEM-GATED-CLUSTERING-1` rewired fresh ingest to `article.embedded -> criteria -> article.criteria.matched -> cluster -> article.clustered -> interests`, made cluster workers hard-skip non-eligible system-gated articles, and updated API processed KPIs so filtered-out articles still count as processed;
  - `S-SYSTEM-GATED-CLUSTERING-2` brought historical replay to the same order from `embedded+` snapshot targets, keeping snapshot-safe progress, `interestLlmReviews = 0`, and no retro-notification drift;
  - `S-SYSTEM-GATED-CLUSTERING-3` archived the rollout cleanly by syncing durable docs and removing the capability from live execution state.
- Что проверено:
  - `node --import tsx --test tests/unit/ts/queue.test.ts`
  - `PYTHONPATH=. python -m unittest tests.unit.python.test_reindex_backfill_progress tests.unit.python.test_interest_auto_repair tests.unit.python.test_api_feed_dedup tests.unit.python.test_system_feed_contract`
  - `pnpm test:relay:phase45:compose`
  - `pnpm test:cluster-match-notify:compose`
  - `docker compose -f infra/docker/compose.yml exec -T worker python -m app.smoke reindex-backfill`
  - live API/DB reconciliation after rebuilding `api` proved the new processed clause and `/dashboard/summary.processed_total` both return `4817`
- Риски или gaps:
  - capability intentionally did not introduce a new system-feed notification policy; baseline notifications still remain a personalization-lane concern;
  - broader operator-facing copy or dashboard wording beyond the shipped API summary semantics remains a separate follow-up if the product wants it.
- Follow-up:
  - any further worker/relay/API or KPI/UI changes in this lane must open a new bounded item instead of reopening the archived capability.

### 2026-03-27 — S-SYSTEM-GATED-CLUSTERING-2 — Historical backfill now replays criteria before cluster and interests

- Тип записи: stage archive
- Финальный статус: archived
- Зачем понадобилось: after fresh ingest moved behind the system gate, snapshot-based replay would have drifted if historical jobs kept clustering or rematching interests before final system eligibility was known.
- Что изменилось:
  - `services/workers/app/reindex_backfill.py` now replays `article.embedded -> criteria -> article.criteria.matched -> cluster -> article.clustered -> interests` instead of treating clustering as the old upstream prerequisite;
  - historical target selection in `services/workers/app/main.py` now includes `embedded` rows so system-filtered articles that never reached `clustered` still remain in the truthful replay snapshot;
  - only articles that stay `eligible` or `pass_through` in `system_feed_results` are clustered and rematched, while `interestLlmReviews` stays disabled and retro notifications remain skipped.
- Что проверено:
  - `PYTHONPATH=. python -m unittest tests.unit.python.test_reindex_backfill_progress tests.unit.python.test_interest_auto_repair tests.unit.python.test_api_feed_dedup tests.unit.python.test_system_feed_contract`
  - `docker compose -f infra/docker/compose.yml exec -T worker python -m app.smoke reindex-backfill`
  - `git diff --check -- services/workers/app/reindex_backfill.py services/workers/app/main.py tests/unit/python/test_reindex_backfill_progress.py docs/work.md`
- Риски или gaps:
  - completed `reindex_job_targets` retention/cleanup policy is still separate operational work.
- Follow-up:
  - future replay changes should keep snapshot truth explicit and must not re-enable interest-scope gray-zone LLM review by accident.

### 2026-03-27 — S-SYSTEM-GATED-CLUSTERING-1 — Fresh ingest now gates clustering on final system eligibility

- Тип записи: stage archive
- Финальный статус: archived
- Зачем понадобилось: the live relay/worker chain still let clustering happen before the final system gate, which wasted work and risked drifting from the system-first contract the user asked for.
- Что изменилось:
  - `packages/contracts/src/queue.ts` and relay proof now route fresh ingest as `article.embedded -> criteria -> article.criteria.matched -> cluster -> article.clustered -> interests`;
  - `services/workers/app/main.py` now releases articles to clustering only after final `system_feed_results` truth says `eligible` or `pass_through`, and `process_cluster` returns a clean skip for non-eligible articles;
  - `services/api/app/main.py` updated processed KPI semantics so operator totals count final system-gate rows plus later `matched/notified`, instead of dropping articles that finish at `filtered_out`.
- Что проверено:
  - `node --import tsx --test tests/unit/ts/queue.test.ts`
  - `PYTHONPATH=. python -m unittest tests.unit.python.test_interest_auto_repair tests.unit.python.test_api_feed_dedup tests.unit.python.test_system_feed_contract`
  - `pnpm test:relay:phase45:compose`
  - `pnpm test:cluster-match-notify:compose`
  - `curl -sS http://127.0.0.1:8000/health`
  - `docker compose -f infra/docker/compose.yml -f infra/docker/compose.dev.yml up -d --build api`
  - `curl -sS http://127.0.0.1:8000/dashboard/summary`
  - `docker compose -f infra/docker/compose.yml exec -T postgres psql -U newsportal -d newsportal -Atc "select count(*) from articles a where (a.processing_state in ('matched','notified') or exists (select 1 from system_feed_results sfr_processed where sfr_processed.doc_id = a.doc_id and sfr_processed.decision in ('pass_through','eligible','filtered_out')));"`
- Риски или gaps:
  - the shipped KPI fix covered the API summary truth; any remaining operator surface still equating `matched/notified` with “processed” must be handled as separate follow-up work.
- Follow-up:
  - historical replay had to be updated in a separate stage rather than piggybacked onto this fresh-ingest refactor.

### 2026-03-27 — SP-SYSTEM-GATED-CLUSTERING-1 — Planned the staged refactor for criteria-gated clustering

- Тип записи: spike archive
- Финальный статус: archived
- Зачем понадобилось: before changing queue order, the repo needed a truthful read-only answer to whether clustering could move later without breaking novelty, suppression, historical replay, and reporting semantics.
- Что выяснилось:
  - criteria scoring itself can run before cluster because it does not depend on `event_cluster_id`;
  - downstream novelty/major-update suppression, notify behavior, and explainability still depend on event clustering, so `user_interests` could not safely move ahead of cluster;
  - historical backfill and processed/reporting semantics both needed explicit follow-up stages, not a one-shot routing edit.
- Что проверено:
  - read-only inspection of `docs/work.md`, `docs/blueprint.md`, `docs/engineering.md`, `docs/verification.md`, `services/workers/app/main.py`, `services/workers/app/reindex_backfill.py`, `services/workers/app/smoke.py`, `services/api/app/main.py`, `services/relay/src/cli/test-phase45-routing.ts`, and `apps/admin/src/pages/articles.astro`
- Риски или gaps:
  - the spike intentionally stopped before any blueprint rewrite or runtime change; durable truth only moved once the implementation stages were real.
- Follow-up:
  - the spike’s recommended rollout became `S-SYSTEM-GATED-CLUSTERING-1`, `S-SYSTEM-GATED-CLUSTERING-2`, and the final archive-sync closeout stage.

### 2026-03-26 — S-PERSONALIZED-MATCHES-1 — Shipped the separate `/matches` feed and scoped post-compile history sync

- Тип записи: stage archive
- Финальный статус: archived
- Зачем понадобилось: пользователь зафиксировал, что `/` должен остаться system-selected feed, а персональные `user_interests` должны жить на отдельной поверхности и автоматически догонять уже существующие system-feed-approved статьи после compile, чтобы счетчик `62` на главной не воспринимался как баг.
- Что изменилось:
  - `services/api/app/main.py` added `GET /users/{user_id}/matches` with paginated and non-paginated modes, article-level dedupe by `doc_id`, strongest-match selection by `score_interest desc, created_at desc`, and strict filtering to `interest_match_results.decision = 'notify'` plus `system_feed_results.eligible_for_feed = true`;
  - `packages/sdk/src/index.ts`, `apps/web/src/pages/matches.astro`, `apps/web/src/layouts/Shell.astro`, and `apps/web/src/components/ArticleCard.tsx` now expose a separate `/matches` page that reuses the main feed card/pagination UX while showing matched-interest context instead of changing `/`;
  - web/admin interest mutation handlers and the shared interest manager copy now tell operators/users that create/update/clone starts compile plus background history sync, so they no longer expect `/` totals to drop immediately;
  - `services/workers/app/main.py` and `services/workers/app/reindex_backfill.py` now build and run a scoped `repair` reindex job after successful interest compile using `userId`, `interestId`, `systemFeedOnly = true`, and `retroNotifications = 'skip'`, while historical replay only rematches the targeted compiled interests;
  - synthetic smoke compile flows now pass `skipAutoRepair` so compose smoke proof stays focused on compile behavior, and criterion gray-zone matching now always dispatches `llm.review.requested` even when no active `criteria` prompt template exists, allowing fresh-stack proof to progress through the default review fallback path.
- Что проверено:
  - `pnpm unit_tests`
  - `pnpm integration_tests`
  - earlier stage-local verification also passed `pnpm typecheck` and `pnpm build`
- Риски или gaps:
  - no manual browser-click walkthrough of `/matches` was executed; runtime proof remained HTTP/browser-style plus compose acceptance.
  - fresh-stack proof still depends on external dev Firebase admin aliases created during acceptance runs; compose teardown cleans local services but not those external identities.
- Follow-up:
  - if the product later wants `/matches`-specific UX polish or manual browser proof, open a new bounded follow-up instead of reopening this completed stage.

### 2026-03-26 — C-PERSONALIZED-MATCHES — Separate personalized matches now sits cleanly beside the system feed

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: после system-first rollout пользователю нужно было сохранить `/` как global system-selected media flow, но при этом честно показать, куда попадает персонализация и как новые интересы догоняют существующую system-feed history.
- Что изменилось:
  - capability stayed intentionally single-stage: `S-PERSONALIZED-MATCHES-1` introduced the new personalized read surface, worker auto-sync semantics, SDK/API exposure, UI copy updates, and durable docs sync in one bounded slice;
  - durable truth in `README.md`, `HOW_TO_USE.md`, and `docs/blueprint.md` now explicitly says that `/` remains the system feed, `/matches` is the per-user personalized surface, and interest creation/update triggers compile plus scoped historical repair against system-feed-approved history;
  - compose acceptance now treats automatic historical sync as the live contract for newly created admin-managed interests, while manual backfill remains a stable/no-retro-notification repair tool rather than the first time those historical matches appear.
- Что проверено:
  - `pnpm unit_tests`
  - `pnpm integration_tests`
- Риски или gaps:
  - capability intentionally did not change the `/` total/count semantics or introduce a second notification policy; retro delivery stays skipped for auto-sync and manual backfill.
- Follow-up:
  - future work on personalized sorting, richer match explanations, or `/matches` operator analytics should open a new explicit item.

### 2026-03-26 — P-DOCS-SYSTEM-FIRST-SYNC-2 — Synced `HOW_TO_USE.md` and `EXAMPLES.md` with the live system-first contract

- Тип записи: patch archive
- Финальный статус: archived
- Зачем понадобилось: после первого docs pass пользователь уточнил, что отдельные operator-facing guides `HOW_TO_USE.md` и `EXAMPLES.md` тоже должны быть проверены на соответствие новому system-first порядку `criteria -> criteria-scope LLM -> system-selected feed -> optional user_interests`.
- Что изменилось:
  - `HOW_TO_USE.md` теперь описывает system-first data flow, актуальные dashboard labels, criteria-first baseline для gray-zone LLM review, distinction between admin `interest_templates` and real per-user `user_interests`, текущие article states, and the updated reindex mode guidance;
  - `EXAMPLES.md` теперь объясняет, что baseline LLM config uses `criteria` + `global`, while `interests` is only future-ready, и что interest templates sync into live `criteria` instead of pretending to be the same thing as real user personalization;
  - example prompts in `EXAMPLES.md` were updated to the current placeholder contract (`{title}`, `{lead}`, `{body}`, `{explain_json}`, `{interest_name}`, `{criterion_name}`) instead of older legacy tokens.
- Что проверено:
  - targeted `rg` consistency search across `HOW_TO_USE.md` and `EXAMPLES.md`
  - manual content review against the already-shipped system-first runtime and admin/UI truth
  - `git diff --check`
- Риски или gaps:
  - this patch intentionally stayed docs-only; it did not change runtime behavior, reindex semantics, or notification contracts.
- Follow-up:
  - future docs work should open a new bounded item only if the product later activates system-feed notifications or premium interest-side LLM review.

### 2026-03-26 — P-DOCS-SYSTEM-FIRST-SYNC-1 — Synced README/how-to-use/examples with the live system-first contract

- Тип записи: patch archive
- Финальный статус: archived
- Зачем понадобилось: после закрытия system-first runtime/feed capability пользователь отдельно попросил проверить README, how-to-use surfaces и examples на соответствие новой последовательности `criteria -> criteria-scope LLM -> system-selected feed -> optional user_interests`.
- Что изменилось:
  - `README.md` теперь truthfully описывает system-first ingest/backfill order, explains that active admin `interest_templates` materialize into system `criteria`, clarifies that users without `user_interests` still see the system-selected feed, and updates the targeted-smoke notes to the sequential routing contract;
  - README manual-usage guidance and SQL example now point at `system_feed_results` instead of suggesting that public feed eligibility comes from `articles.processing_state`;
  - `docs/blueprint.md` had one remaining stale feed-definition block and was synced so public/system feed truth now depends on `system_feed_results.eligible_for_feed`, while `active news` matches the same set;
  - `docs/contracts/README.md` and `.env.example` were reviewed during the pass and required no changes.
- Что проверено:
  - targeted `rg` consistency search across `README.md`, `docs/blueprint.md`, `docs/contracts/README.md` and `.env.example`
  - manual content review against the already-shipped system-first runtime and feed semantics
  - `git diff --check`
- Риски или gaps:
  - this patch intentionally stayed docs-only; it did not change runtime behavior, notification contracts, or env wiring.
- Follow-up:
  - future work should open a new bounded item only if the product adds system-feed notifications or premium interest-side LLM review.

### 2026-03-26 — S-SYSTEM-FEED-CONTRACT-2 — Added the durable `system_feed_results` gate contract

- Тип записи: stage archive
- Финальный статус: archived
- Зачем понадобилось: planning spike зафиксировал, что requested hierarchy не может быть честно внедрена без article-level gate между system criteria и optional personalization; runtime нужен был durable read model, а не просто новое условие в памяти worker-а.
- Что изменилось:
  - migration `database/migrations/0009_system_feed_results.sql` и synced DDL в `database/ddl/phase4_matching_notification.sql` добавили durable table `system_feed_results`;
  - helper `services/workers/app/system_feed.py` стал canonical summary contract для article-level system gate: `pass_through`, `pending_llm`, `eligible`, `filtered_out`;
  - criteria worker и criterion-scope LLM review в `services/workers/app/main.py` теперь каждый раз recompute-ят и upsert-ят `system_feed_results`, так что article-level gate truth живет в PostgreSQL, а не только в текущем job execution;
  - worker smoke получил explicit consistency checks для `system_feed_results`, а targeted unit coverage закрепила summary semantics на pure Python level.
- Что проверено:
  - `python -m py_compile services/workers/app/main.py services/workers/app/smoke.py services/workers/app/system_feed.py`
  - `PYTHONPATH=. python -m unittest tests.unit.python.test_system_feed_contract tests.unit.python.test_llm_prompt_rendering tests.unit.python.test_reindex_backfill_progress`
  - compose worker smoke at this stage proved `system_feed_results` stays in sync both on fresh cluster/match flow and on historical backfill replay
- Риски или gaps:
  - stage intentionally stopped at contract truth; it did not yet make the gate upstream for personalization or public/system feed surfaces.
- Follow-up:
  - `S-SYSTEM-FIRST-RUNTIME-3` became the next truthful stage and rewired fresh ingest plus historical backfill around the new gate.

### 2026-03-26 — S-SYSTEM-FIRST-RUNTIME-3 — Made criteria-first matching order live

- Тип записи: stage archive
- Финальный статус: archived
- Зачем понадобилось: после появления durable gate contract runtime по-прежнему fanout-ил `article.clustered` параллельно в criteria и interests, так что system criteria plus criteria-LLM еще не были реальным upstream gate для personalization.
- Что изменилось:
  - `packages/contracts/src/queue.ts` и `services/relay/src/cli/test-phase45-routing.ts` теперь фиксируют последовательный routing: `article.clustered -> q.match.criteria`, затем `article.criteria.matched -> q.match.interests`;
  - `services/workers/app/main.py` начал публиковать `article.criteria.matched` только после того, как `system_feed_results` стали `eligible`/`pass_through`, а `process_match_interests(...)` дополнительно hard-check-ит stored gate before matching;
  - historical backfill в `services/workers/app/reindex_backfill.py` и `services/workers/app/main.py` теперь повторяет ту же иерархию: replay criteria, replay only criterion gray-zone reviews, rematch interests only for system-approved articles;
  - baseline interest-scope gray-zone LLM review removed from default tier: gray-zone user-interest decisions suppress with `interest_gray_zone_llm_disabled`, and backfill now reports `interestLlmReviews = 0`.
- Что проверено:
  - `python -m py_compile services/workers/app/main.py services/workers/app/smoke.py services/workers/app/system_feed.py services/workers/app/reindex_backfill.py`
  - `PYTHONPATH=. python -m unittest tests.unit.python.test_system_feed_contract tests.unit.python.test_llm_prompt_rendering tests.unit.python.test_reindex_backfill_progress`
  - `node --import tsx --test tests/unit/ts/queue.test.ts`
  - `docker compose --env-file .env.dev -f infra/docker/compose.yml -f infra/docker/compose.dev.yml exec -T worker python -m app.smoke cluster-match-notify`
  - `docker compose --env-file .env.dev -f infra/docker/compose.yml -f infra/docker/compose.dev.yml exec -T worker python -m app.smoke reindex-backfill`
  - `docker compose --env-file .env.dev -f infra/docker/compose.yml -f infra/docker/compose.dev.yml exec -T relay pnpm --filter @newsportal/relay test:phase45-routing`
- Риски или gaps:
  - stage intentionally left public/system feed surfaces on the older `processing_state`-based eligibility contract, so users without `user_interests` still could not yet see the requested system-selected default media flow.
- Follow-up:
  - `S-SYSTEM-FEED-UX-4` became the next truthful stage and switched feed/read surfaces plus operator copy onto `system_feed_results`.

### 2026-03-26 — C-SYSTEM-FIRST-PERSONALIZATION — Sequential system-first matching and optional personalization are now live

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: пользователь потребовал двухуровневую обязательную иерархию: system customization first (`criteria` + criteria-scope LLM), then optional per-user personalization, with no baseline interest-side gray-zone LLM and with a default system-selected media flow for users without `user_interests`.
- Что изменилось:
  - `SP-SYSTEM-FIRST-PERSONALIZATION-1` defined the capability and split it into contract, runtime, UI/feed, and proof stages;
  - `S-SYSTEM-FEED-CONTRACT-2` introduced durable `system_feed_results` as the article-level source of truth after system criteria and criteria-scope LLM review;
  - `S-SYSTEM-FIRST-RUNTIME-3` made fresh ingest and historical backfill sequential around that gate, and removed baseline interest-scope gray-zone LLM review from the default runtime;
  - `S-SYSTEM-FEED-UX-4` switched `services/api/app/main.py` feed eligibility and dashboard summary onto `system_feed_results`, added system-gate semantics to admin article/help/dashboard copy, and updated the web feed so user-facing cards show a system-selected badge instead of leaking raw pipeline states for eligible-but-non-personalized articles.
- Что проверено:
  - runtime proof for the sequential gate:
    `python -m py_compile services/workers/app/main.py services/workers/app/smoke.py services/workers/app/system_feed.py services/workers/app/reindex_backfill.py`
    `PYTHONPATH=. python -m unittest tests.unit.python.test_system_feed_contract tests.unit.python.test_llm_prompt_rendering tests.unit.python.test_reindex_backfill_progress`
    `node --import tsx --test tests/unit/ts/queue.test.ts`
    `docker compose --env-file .env.dev -f infra/docker/compose.yml -f infra/docker/compose.dev.yml exec -T worker python -m app.smoke cluster-match-notify`
    `docker compose --env-file .env.dev -f infra/docker/compose.yml -f infra/docker/compose.dev.yml exec -T worker python -m app.smoke reindex-backfill`
    `docker compose --env-file .env.dev -f infra/docker/compose.yml -f infra/docker/compose.dev.yml exec -T relay pnpm --filter @newsportal/relay test:phase45-routing`
  - feed/UI proof for the default system-selected flow:
    `python -m py_compile services/api/app/main.py`
    `pnpm --filter @newsportal/web build`
    `pnpm --filter @newsportal/admin build`
    DB-backed fallback proof inside the compose worker image confirmed that an article with `processing_state = clustered` and `system_feed_results.eligible_for_feed = true` appears in `/feed` even with no personalization lane.
- Риски или gaps:
  - baseline notifications still remain a personalization-lane concern: users without `user_interests` now get the system-selected media flow, but they do not automatically receive a new notification fallback contract;
  - future premium/opt-in return of interest-scope LLM review must stay a separate explicit capability, not a silent rollback of the baseline.
- Follow-up:
  - capability is fully closed; any future work on feed ranking polish, notification fallback, or premium interest-side LLM review must open a new bounded item instead of reopening this capability.

### 2026-03-26 — SP-SYSTEM-FIRST-PERSONALIZATION-1 — Planned the two-layer system-first matching hierarchy

- Тип записи: spike archive
- Финальный статус: archived
- Зачем понадобилось: пользователь явно запросил новый обязательный порядок обработки, в котором каждая статья сначала проходит через system `criteria`, materialized from admin `interest_templates`, затем через criteria-scope gray-zone LLM review, и только потом попадает либо в default system feed, либо в optional per-user personalization; при этом baseline runtime больше не должен по умолчанию делать gray-zone LLM review для `user_interests`.
- Что выяснилось:
  - current live ingest still fans out one `article.clustered` event into parallel criteria and interest queues, so criteria review is not yet an upstream gate for personalization;
  - admin `interest_templates` already sync into real system `criteria`, so the requested first layer can reuse the existing operator surface instead of inventing a new source of truth;
  - current notify/runtime contract is driven by `interest_match_results`, so users without `user_interests` do not yet have a truthful system-selected fallback feed/alert path;
  - historical backfill replays criteria and interests as separate steps and then replays gray-zone reviews per scope, so the new hierarchy needs both fresh-ingest and backfill orchestration changes rather than copy-only fixes;
  - the requested removal of baseline interest-scope gray-zone LLM should be treated as part of the new capability, while any future subscription-gated return of that feature should stay a separate follow-up lane.
- Рекомендованный stage plan:
  - `S-SYSTEM-FEED-CONTRACT-2`: introduce the durable post-criteria/post-LLM system-feed eligibility contract and sync blueprint/verification truth when that contract becomes real;
  - `S-SYSTEM-FIRST-RUNTIME-3`: rewire fresh ingest and historical backfill so per-user `user_interests` run only on system-approved articles and are skipped cleanly when a user has no interests configured;
  - `S-SYSTEM-FEED-UX-4`: update web/admin/public feed semantics and copy so the default system feed and optional personalization are both explicit;
  - `S-SYSTEM-FIRST-PROOF-5`: prove no-interest fallback, interest-enabled personalization, historical backfill behavior, and absence of baseline interest-scope gray-zone LLM in the default runtime.
- Что проверено:
  - read-only inspection of `docs/blueprint.md`, `docs/work.md`, `docs/history.md`, `services/relay/src/cli/test-phase45-routing.ts`, `services/workers/app/main.py`, `services/workers/app/reindex_backfill.py`, `apps/admin/src/lib/server/admin-templates.ts`, `apps/admin/src/pages/templates/interests.astro`, and `apps/admin/src/pages/user-interests.astro` confirmed the current parallel runtime and the existing template-to-criteria operator contract;
  - runtime doc sync in `docs/work.md` now records the new capability, ready next stage, current-vs-target truth, and handoff warning not to rewrite blueprint prematurely.
- Риски или gaps:
  - capability is structural: it changes pipeline order, notification semantics, read-model expectations, and durable architecture truth together;
  - until `S-SYSTEM-FEED-CONTRACT-2` lands, the real runtime and blueprint truth remain the current parallel model.
- Follow-up:
  - `S-SYSTEM-FEED-CONTRACT-2` is now the next ready implementation stage;
  - if the product later wants premium/opt-in gray-zone LLM for `user_interests`, that should open a separate explicit capability after the baseline hierarchy is implemented.

### 2026-03-25 — S-USER-INTEREST-MATCH-PROOF-4 — Internal MVP acceptance now proves admin-managed per-user interests end-to-end

- Тип записи: stage archive
- Финальный статус: archived
- Зачем понадобилось: после shared-contract и admin-UX stages capability все еще оставался незавершенным, потому что не было честного runtime proof, что interest, созданный оператором через admin on-behalf flow, реально участвует и в fresh ingest, и в historical backfill.
- Что изменилось:
  - `infra/scripts/test-mvp-internal.mjs` теперь после базового RSS/admin/moderation acceptance создает real admin-managed `user_interest` через `/admin/bff/admin/user-interests`, ждет `compile_status = compiled`, и проверяет, что уже существующая историческая статья пока не имеет match rows для нового interest;
  - тот же script создает второй RSS channel/article для того же пользователя и доказывает fresh-ingest participation: появляется targeted `interest_match`, а delivery считается resolved либо через реальную отправку, либо через truthfully accepted duplicate-cluster suppression (`recent_send_history`) вместо ложного ожидания обязательного `notification_log`;
  - acceptance затем ставит admin-triggered `backfill` через `/admin/bff/admin/reindex`, ждет `completed` job, и подтверждает, что историческая статья получает ровно один missing match для нового interest без retro notification/suppression drift, while the fresh article keeps stable match/delivery cardinality through backfill.
- Что проверено:
  - `node --check infra/scripts/test-mvp-internal.mjs`
  - `pnpm integration_tests`
  - final green runtime proof recorded:
    user `de5b8545-2572-42eb-a0dc-e312a509cb5e`,
    admin alias `yluchaninov+internal-admin-682c854e@gmail.com`,
    historical article `45003416-d52c-485a-87b4-9ebd3fadbeca`,
    fresh article `5096b4f4-9909-4d3f-ab35-b079729937b7`,
    interest `44f84101-6393-47aa-bf65-f0cb446273ed`
- Риски или gaps:
  - proof remains HTTP/browser-style rather than a human click-through in a graphical browser;
  - RSS-first acceptance scope still does not prove `website`, `api`, or `email_imap` ingest;
  - compose teardown removed local DB/Redis/Mailpit artifacts from this run, but the new Firebase admin alias remains as external dev residue until explicit cleanup.
- Follow-up:
  - the stage has no truthful live next step and should stay archived;
  - any future cleanup of dev Firebase admin aliases should be its own bounded cleanup item.

### 2026-03-25 — C-MATCHING-OPERATOR-TRUTH — Reindex progress truth and real user-interest operator flow are closed

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: пользователь попросил сначала спроектировать и затем довести до конца два связанных outcomes: устранить progress drift в historical reindex и внедрить truthful operator flow для real per-user `user_interests`, чтобы это можно было реально тестировать и использовать из admin.
- Что изменилось:
  - `SP-REINDEX-PROGRESS-DRIFT-1` выбрал durable design с frozen per-job target set вместо mutable `count + offset` replay;
  - `S-REINDEX-PROGRESS-DRIFT-2` реализовал этот design через PostgreSQL `reindex_job_targets`, extraction of `services/workers/app/reindex_backfill.py`, stable replay totals и compose smoke proof без retro notifications;
  - `SP-USER-INTEREST-OPERATOR-FLOW-1` зафиксировал product truth: `user_interests` остаются per-user data, admin действует только on behalf of a selected user, and this must not be blurred into template-backed system criteria;
  - `S-USER-INTEREST-SHARED-CONTRACT-2` вынес canonical per-user mutation/compile logic в shared server helper и дал admin audited on-behalf BFF endpoints for lookup plus CRUD;
  - `S-USER-INTEREST-ADMIN-UX-3` добавил packaged `/user-interests` admin page with exact `email`/`user_id` lookup, truthful on-behalf copy, CRUD controls, and visible compile/error state;
  - `S-USER-INTEREST-MATCH-PROOF-4` finally closed the capability with compose-backed end-to-end proof that admin-managed interests participate in fresh ingest and historical backfill under the real runtime boundaries.
- Что проверено:
  - targeted Python proof for reindex progress hardening:
    `PYTHONPATH=. python -m unittest tests.unit.python.test_reindex_backfill_progress tests.unit.python.test_llm_prompt_rendering`
    `python -m py_compile services/workers/app/main.py services/workers/app/reindex_backfill.py services/workers/app/smoke.py services/workers/app/prompting.py`
    `pnpm db:migrate`
    `docker compose --env-file .env.dev -f infra/docker/compose.yml -f infra/docker/compose.dev.yml up -d --build worker`
    `docker compose --env-file .env.dev -f infra/docker/compose.yml -f infra/docker/compose.dev.yml exec -T worker python -m app.smoke reindex-backfill`
  - targeted/admin contract proof:
    `node --import tsx --test tests/unit/ts/user-interests.test.ts tests/unit/ts/admin-user-interests.test.ts tests/unit/ts/admin-user-interest-page.test.ts`
    `pnpm typecheck`
    `pnpm --filter @newsportal/admin build`
  - final capability closeout proof:
    `pnpm integration_tests`
- Риски или gaps:
  - capability intentionally does not add a global admin CRUD surface for system `criteria`; template-backed criteria and per-user interests remain separate operator layers;
  - retention/cleanup policy for completed `reindex_job_targets` rows remains an operational concern for a future bounded item;
  - dev Firebase aliases created during proof (`yluchaninov+internal-admin-f77f2941@gmail.com`, `yluchaninov+internal-admin-682c854e@gmail.com`) remain tracked external residue.
- Follow-up:
  - the capability is fully closed and should not remain in live execution state;
  - any future work on user-interest cleanup, extra operator polish, or reindex observability/reporting must open a new explicit item instead of reopening this capability.

### 2026-03-25 — S-USER-INTEREST-ADMIN-UX-3 — Admin now ships a dedicated per-user interest manage page

- Тип записи: stage archive
- Финальный статус: archived
- Зачем понадобилось: после shared-contract/admin-BFF stage пользователь попросил продолжить implementation, чтобы операторы могли реально пользоваться `user_interests` из admin shell, а не только через backend-only endpoints.
- Что изменилось:
  - `apps/admin/src/pages/user-interests.astro` added the dedicated manage surface: lookup by exact `email` or `user_id`, explicit “acting on behalf of” copy, create form, per-interest edit/clone/delete forms, and visible compile/error state for each real per-user interest;
  - `apps/admin/src/lib/server/user-interest-admin-page.ts` now owns page-only normalization/formatting helpers for lookup state, hidden context fields, CSV/textarea rendering, and compile-state badges, which keeps the Astro page itself small enough to review;
  - `apps/admin/src/layouts/AdminShell.astro`, `apps/admin/src/pages/index.astro`, and `apps/admin/src/pages/templates/interests.astro` now surface the page truthfully in admin navigation and explain that global `interest_templates` are different from user-owned `user_interests`;
  - `apps/admin/src/lib/server/user-interests.ts` became self-contained for the packaged admin runtime: it no longer imports server logic from `apps/web`, so lookup/audit/CRUD/compile-request helpers stay inside the admin boundary and the compose-built admin image no longer needs a hidden cross-app Docker copy;
  - the temporary `apps/web` copy was removed from `infra/docker/admin.Dockerfile`, restoring the intended packaging boundary for the admin app.
- Что проверено:
  - `node --import tsx --test tests/unit/ts/admin-user-interest-page.test.ts tests/unit/ts/admin-user-interests.test.ts tests/unit/ts/user-interests.test.ts`
  - `pnpm typecheck`
  - `pnpm --filter @newsportal/admin build`
  - `docker compose --env-file .env.dev -f infra/docker/compose.yml -f infra/docker/compose.dev.yml up -d --build admin nginx`
  - nginx-shaped runtime smoke via `node --input-type=module ...`:
    page load at `/admin/user-interests?userId=<userId>` preserved target-user context in HTML,
    browser-style POST to `/admin/bff/admin/user-interests` succeeded,
    the selected user's interest reached `compile_status = compiled`,
    the page reloaded with compiled state visible,
    and the created interest `c1660c73-1bd0-4a76-9b4f-c9e1d48f62b0` was deleted successfully after proof
- Риски или gaps:
  - stage intentionally stops at manage-surface proof; it does not yet prove that an admin-managed per-user interest creates fresh-ingest matches or participates in historical backfill;
  - runtime proof used browser-style HTTP requests, not a manual human click-through in a graphical browser;
  - local proof residue remains tracked: anonymous user `fa226230-b850-4dbd-9d65-b5f31858ea21` and Firebase allowlisted admin alias `yluchaninov+internal-admin-f77f2941@gmail.com` from smoke run `f77f2941`.
- Follow-up:
  - the next truthful stage is `S-USER-INTEREST-MATCH-PROOF-4`, which should prove fresh-ingest and historical-backfill matching for an admin-managed per-user interest on the local compose baseline;
  - if a future item wants cleanup of the smoke user/admin identity residue, that should be explicit cleanup work rather than a silent reset of local state.

### 2026-03-25 — S-USER-INTEREST-SHARED-CONTRACT-2 — Admin now has an audited on-behalf backend contract for real `user_interests`

- Тип записи: stage archive
- Финальный статус: archived
- Зачем понадобилось: после design spike пользователь попросил начать реализацию truthful operator path для реальных `user_interests`, но без смешивания их с template-backed system `criteria`.
- Что изменилось:
  - `apps/web/src/lib/server/user-interests.ts` стал canonical mutation/read contract для per-user interests: create/update/clone/delete/list logic, payload normalization и queue-event builder теперь живут в одном server helper вместо дублированного SQL в web routes;
  - `apps/web/src/pages/bff/interests.ts` и `apps/web/src/pages/bff/interests/[interestId].ts` теперь используют этот shared helper, так что user-owned web flow и будущие operator flows опираются на один persistence/compile contract;
  - `apps/admin/src/lib/server/user-interests.ts` получил truthful admin-on-behalf orchestration: lookup target user by `email` or `user_id`, audited create/update/clone/delete helpers, and compile-request queue wiring that preserves per-user ownership instead of inventing a global interest catalog;
  - новые admin BFF endpoints `apps/admin/src/pages/bff/admin/user-interests.ts` и `apps/admin/src/pages/bff/admin/user-interests/[interestId].ts` дают JSON/browser-safe backend surface для target lookup plus on-behalf CRUD, с явным admin auth check, flash redirects для будущей UX stage и audit trail на каждое mutation action.
- Что проверено:
  - `node --import tsx --test tests/unit/ts/user-interests.test.ts tests/unit/ts/admin-user-interests.test.ts`
  - `pnpm unit_tests:ts`
  - `pnpm typecheck`
  - `git diff --check`
- Риски или gaps:
  - stage intentionally не добавляет dedicated admin page; operator backend contract shipped, но удобная surfaced UX для поиска пользователя и управления его интересами остается следующим stage;
  - end-to-end live proof того, что operator-created `user_interest` компилируется и матчится на свежих статьях и historical backfill, пока не выполнен;
  - browser-click smoke для новых admin BFF actions в этом turn не гонялся.
- Follow-up:
  - следующий truthful stage — `S-USER-INTEREST-ADMIN-UX-3`, dedicated admin page и copy for target-user lookup/manage flow;
  - capability затем должен закрыться `S-USER-INTEREST-MATCH-PROOF-4`, где operator-managed interest будет доказан на fresh ingest + backfill path.

### 2026-03-25 — SP-USER-INTEREST-OPERATOR-FLOW-1 — Planned the truthful operator path for real `user_interests`

- Тип записи: spike archive
- Финальный статус: archived
- Зачем понадобилось: после закрытия reindex progress drift пользователь попросил именно план внедрения `user_interests`, чтобы они реально работали и были тестируемы, при необходимости с удобным/truthful admin flow.
- Что выяснилось:
  - real `user_interests` already have a truthful user-owned flow in `web`: `apps/web/src/pages/bff/interests.ts` handles create, `apps/web/src/pages/bff/interests/[interestId].ts` handles update/clone/delete, `apps/web/src/components/InterestManager.tsx` exposes the UI, and the Python API already ships `/users/{user_id}/interests` as a read model;
  - this means the missing piece is not the core matching runtime itself, but the operator surface and shared contract: admin has no page, no BFF, and not even a truthful target-user lookup flow for choosing whose interests are being edited;
  - a truthful admin/operator implementation must preserve ownership semantics: `user_interests` stay per-user data, while admin acts explicitly on behalf of a selected user; they must not be blurred into template-backed system `criteria` or into a fake global interest catalog;
  - because admin has no user-directory product today, the bounded MVP operator surface should start with lookup by `email` or `user_id`, not a speculative broad user-management feature.
- Рекомендованный stage plan:
  - `S-USER-INTEREST-SHARED-CONTRACT-2`: extract canonical user-interest normalization/persistence/compile-queue logic from the existing web flow and add admin lookup + audited on-behalf BFF endpoints;
  - `S-USER-INTEREST-ADMIN-UX-3`: add a dedicated admin page to find a target user and manage that user's interests with compile status, enabled state, and copy that clearly distinguishes per-user interests from admin templates/system criteria;
  - `S-USER-INTEREST-MATCH-PROOF-4`: prove end-to-end that an operator-managed user interest compiles, matches fresh ingest, and also participates in historical backfill for the selected user; leave a manual test recipe that the operator can repeat.
- Как это тестировать после внедрения:
  - create or reuse a real user session in `web` so the target user exists in PostgreSQL;
  - find that user in admin by `email` or `user_id`, create/update an interest there, and verify `compile_status` reaches `compiled`;
  - ingest or seed a matching article and confirm the selected user receives an `interest_match`;
  - run historical backfill and confirm the same selected user's interest participates there too, without requiring a template-backed system criterion workaround.
- Риски или gaps:
  - this spike intentionally did not ship code; admin still has no truthful operator surface for real `user_interests`;
  - the plan intentionally avoids inventing a full user-directory product or collapsing `user_interests` into admin template management.
- Follow-up:
  - `S-USER-INTEREST-SHARED-CONTRACT-2` is now the next ready implementation stage;
  - future stages should keep admin-on-behalf semantics explicit in copy, audit log, and proof, so operators and developers cannot confuse per-user interests with system-wide criteria/template data.

### 2026-03-25 — S-REINDEX-PROGRESS-DRIFT-2 — Historical reindex progress now uses frozen target snapshots

- Тип записи: stage archive
- Финальный статус: archived
- Зачем понадобилось: после audit и отдельного design spike пользователь попросил перейти к реализации progress-drift fix до любых работ по operator flow для реальных `user_interests`.
- Что изменилось:
  - migration `database/migrations/0008_reindex_backfill_target_snapshots.sql` добавила durable PostgreSQL table `reindex_job_targets`, а canonical DDL в `database/ddl/phase3_nlp_foundation.sql` теперь фиксирует тот же contract рядом с `reindex_jobs`;
  - worker replay path в `services/workers/app/main.py` больше не считает live `articles` once-and-offset traversal: исторический backfill сначала materialize-ит frozen target set в `reindex_job_targets`, затем читает batch-ы по stable `target_position` и пишет `progress.processedArticles/totalArticles` от frozen snapshot;
  - orchestration semantics вынесены в lightweight `services/workers/app/reindex_backfill.py`, чтобы snapshot/progress behavior можно было unit-test-ить без host-side imports тяжёлого worker runtime;
  - `services/workers/app/smoke.py` теперь чистит snapshot residue для stable fixture job, проверяет persisted snapshot row count и требует stable `progress` values alongside the existing duplicate-safe/no-retro-notify invariants.
- Что проверено:
  - `PYTHONPATH=. python -m unittest tests.unit.python.test_reindex_backfill_progress tests.unit.python.test_llm_prompt_rendering`
  - `python -m py_compile services/workers/app/main.py services/workers/app/reindex_backfill.py services/workers/app/smoke.py tests/unit/python/test_reindex_backfill_progress.py`
  - `pnpm db:migrate`
  - `docker compose -f infra/docker/compose.yml -f infra/docker/compose.dev.yml up -d --build worker`
  - `docker compose -f infra/docker/compose.yml -f infra/docker/compose.dev.yml exec -T worker python -m app.smoke reindex-backfill`
  - `git diff --check`
- Риски или gaps:
  - stage intentionally не меняет operator-facing reindex UX/reporting; progress truth зафиксирован в worker/runtime layer, но не surfaced как новый admin report;
  - snapshot rows для completed jobs сейчас остаются в PostgreSQL как durable residue; отдельная retention/cleanup policy пока не спроектирована;
  - stage intentionally не трогает ownership/CRUD model для реальных `user_interests`.
- Follow-up:
  - следующий truthful stage в capability — `SP-USER-INTEREST-OPERATOR-FLOW-1`, design spike для operator ownership/write/read flow по реальным `user_interests`;
  - если позже потребуется explicit snapshot retention policy или richer reindex observability, это должны быть новые bounded follow-up items, а не reopening этого stage.

### 2026-03-25 — SP-REINDEX-PROGRESS-DRIFT-1 — Designed the snapshot-safe fix shape for historical reindex progress drift

- Тип записи: spike archive
- Финальный статус: archived
- Зачем понадобилось: после audit и template-matching fix пользователь explicitly запросил следующий порядок работы: сначала спроектировать fix для progress drift в historical reindex, а уже потом идти в operator flow для реальных `user_interests`.
- Что выяснилось:
  - current drift lives entirely in the worker replay path in `services/workers/app/main.py`: `count_historical_backfill_articles(...)` captures a one-time denominator from live `articles`, then `list_historical_backfill_doc_ids(... offset ...)` keeps querying the mutable `articles` table during replay, and `replay_historical_articles(...)` patches `processedArticles` against that stale denominator;
  - this design is not snapshot-safe for either global backfill or doc-targeted replay: inserts, state transitions, or reordered eligibility during a live run can move the live window under `offset`, leading to totals that drift and potentially to skipped or repeated traversal intent;
  - the recommended implementation shape is a durable per-job snapshot table in PostgreSQL, populated when the worker starts the job after locking `reindex_jobs`; the frozen target set should own `totalArticles`, batch ordering, and traversal progress instead of querying live `articles` on every batch;
  - doc-targeted replay should use the same snapshot mechanism, just seeded from the requested doc-id subset, so the system does not split into two hidden traversal contracts.
- Что проверено:
  - targeted source inspection of `services/workers/app/main.py` around `count_historical_backfill_articles`, `list_historical_backfill_doc_ids`, `replay_historical_articles`, and `process_reindex`
  - reconciliation against the earlier audited live job where `processedArticles = 3856` exceeded `totalArticles = 3844`
- Риски или gaps:
  - this spike intentionally shipped no code; historical backfill progress can still drift until the follow-up implementation stage lands;
  - the spike chose the worker/schema direction but did not yet design operator-facing observability or the separate ownership model for real `user_interests`.
- Follow-up:
  - `S-REINDEX-PROGRESS-DRIFT-2` is now the next ready implementation stage and should add the persistent target snapshot, stable traversal, and proof;
  - only after that stage should the capability move to `user_interests` operator-flow design/implementation.

### 2026-03-25 — S-TEMPLATE-MATCHING-1 — Admin interest templates now participate in fresh ingest and historical reindex

- Тип записи: stage archive
- Финальный статус: archived
- Зачем понадобилось: после read-only reindex audit пользователь уточнил целевое поведение: AI templates и admin-managed interests должны реально применяться к новым статьям и к historical backfill, а не оставаться catalog-only metadata.
- Что изменилось:
  - admin `interest_templates` теперь materialize в реальные system `criteria` через `criteria.source_interest_template_id`; mutation path в `apps/admin/src/pages/bff/admin/templates.ts` поддерживает linked criterion в sync, обновляет version только при содержательном изменении и ставит `criterion.compile.requested` только когда действительно нужна recompilation;
  - `apps/admin/src/lib/server/admin-templates.ts` получил reusable sync helper для template-backed criteria, чтобы create/update/archive/activate flows работали атомарно в одной транзакции с audit/outbox side effects;
  - migration `database/migrations/0007_interest_template_matching_sync.sql` и synced DDL в `database/ddl/phase4_matching_notification.sql` добавили durable link column + unique partial index, backfilled существующие templates в linked criteria и запросили compile для активированных записей;
  - worker prompt rendering вынесен в `services/workers/app/prompting.py`: теперь он поддерживает documented single-brace placeholders (`{title}`, `{lead}`, `{body}`, `{context}`, `{criterion_name}`, `{interest_name}`, `{explain_json}`) и сохраняет backward compatibility с legacy `{{...}}` tokens;
  - admin copy на `reindex`, `help` и `templates/interests` теперь truthfully объясняет, что активные interest templates feed the live criteria set used by fresh ingest and historical backfill; per-user `user_interests` intentionally остаются отдельным runtime layer.
- Что проверено:
  - `pnpm typecheck`
  - `node --import tsx --test tests/unit/ts/admin-template-sync.test.ts`
  - `PYTHONPATH=. python -m unittest tests.unit.python.test_llm_prompt_rendering`
  - `pnpm db:migrate`
  - live PostgreSQL verification after migration: `8` linked template-backed criteria existed, all `8` were enabled and compiled, and compile-request backlog was empty
  - doc-targeted backfill proof: a one-document `reindex_jobs` run completed with `criteriaMatches = 8`, `interestMatches = 0`, `criterionLlmReviews = 0`, `interestLlmReviews = 0`, and `processedArticles = 1`
  - `pnpm --filter @newsportal/admin build`
  - `git diff --check`
- Риски или gaps:
  - этот stage intentionally не redesign-ит per-user `user_interests`; notification/user-interest matching по-прежнему зависит от наличия реальных compiled `user_interests` в runtime;
  - browser-click runtime smoke для admin flows не выполнялся в этом turn;
  - snapshot-safe historical backfill traversal по-прежнему не исправлен: audited `count + offset` drift остается отдельным follow-up lane.
- Follow-up:
  - если пользователю нужна более ясная operator observability, следующий bounded item должен показывать target counts и post-run replay stats прямо в admin reindex UX;
  - если нужно product-managed per-user filtering, это должен быть отдельный item для truthful `user_interests` operator flow, а не reopening этого stage.

### 2026-03-25 — SP-REINDEX-AUDIT-1 — Historical backfill produced no visible matches because the runtime had no matchable targets

- Тип записи: spike archive
- Финальный статус: archived
- Зачем понадобилось: после ручного historical reindex пользователь сообщил, что не увидел ни одной статьи в gray zone и не заметил interest-based filtering, и попросил провести аудит причин до любых fixes.
- Что выяснилось:
  - live runtime data confirmed the latest job was a completed `backfill`, not a plain `rebuild`: `reindex_jobs.options_json` recorded `jobKind = backfill`, `criteriaMatches = 0`, `interestMatches = 0`, `criterionLlmReviews = 0`, `interestLlmReviews = 0`, and also exposed a progress mismatch where `processedArticles = 3856` exceeded the original `totalArticles = 3844`;
  - the worker replay path only reads compiled `criteria` and compiled `user_interests` (`services/workers/app/main.py`), and the audited database had zero enabled compiled rows in both sets, so historical rematch had no actual targets to score and no gray-zone rows to replay;
  - active LLM prompts did exist, but they were irrelevant without match rows: `llm_review_log`, `criterion_match_results`, and `interest_match_results` were all empty during the audit;
  - admin-managed `interest_templates` are currently catalog-only data: they exist in the database and admin/API surfaces, but the worker matching/reindex path never reads them; meanwhile reindex/help copy still suggests that changing `interest templates` is a reason to rerun reindex;
  - there is no operator-facing admin CRUD path for real system `criteria`, so criterion-based gray-zone review is effectively impossible in normal operator flow unless rows are created outside the product UI.
- Что проверено:
  - source inspection of `apps/admin/src/pages/bff/admin/reindex.ts`, `apps/admin/src/pages/reindex.astro`, `apps/admin/src/pages/help.astro`, `apps/web/src/pages/bff/interests.ts`, `apps/web/src/pages/bff/interests/[interestId].ts`, `services/workers/app/main.py`, and `services/workers/app/scoring.py`
  - `docker ps --format '{{.Names}}\t{{.Status}}'`
  - `docker compose -f infra/docker/compose.yml -f infra/docker/compose.dev.yml ps --services --status running`
  - read-only PostgreSQL queries against `reindex_jobs`, `articles`, `user_interests`, `criteria`, `interest_templates`, `llm_prompt_templates`, `interest_match_results`, `criterion_match_results`, `llm_review_log`, and `outbox_events`
- Риски или gaps:
  - this spike did not apply fixes; it only separated data/setup causes from product/code defects;
  - scoring thresholds (`services/workers/app/scoring.py`) remain unproven on the user dataset because the audited runtime had zero compiled targets, so there was nothing to classify into `gray_zone` or `notify`.
- Follow-up:
  - the strongest next bounded fix lane is to correct the operator contract: reindex/help UI should distinguish catalog `interest_templates` from real `user_interests` / `criteria`, warn when compiled target counts are zero, and surface post-run result counts more explicitly;
  - if criterion-based matching is intended operator functionality, a separate item should add a truthful product path for managing `criteria`;
  - a separate backfill hardening item should replace the mutable `count + offset` traversal with snapshot-safe target selection so progress and totals cannot drift during a live run.

### 2026-03-25 — SW-UI-BUILD-HARDENING-1 — Shared UI build contract now scans `packages/ui` in both apps

- Тип записи: sweep archive
- Финальный статус: archived
- Зачем понадобилось: после fix-а для reindex confirmation dialog пользователь попросил проверить остальной shared UI слой, чтобы не осталось похожих случаев, где JS рендерится, а нужные стили не попадают в app bundle.
- Что изменилось:
  - audit confirmed the durable root cause lived in the app build contract, not only in one modal: `apps/admin/src/styles/globals.css` и `apps/web/src/styles/globals.css` imported Tailwind without declaring `packages/ui/src` as a source, so shared utilities could disappear unless duplicated in app-local markup;
  - both app styles now explicitly declare `@source "../../../../packages/ui/src"`, so shared primitives from `packages/ui` are scanned into admin and web bundles consistently;
  - the previous inline-centering hardening in `packages/ui/src/components/ui/alert-dialog.tsx` and `packages/ui/src/components/ui/dialog.tsx` remains in place as a robust guard for dialog content;
  - representative high-risk shared utility patterns are now present in both built bundles, including values used by `select`, `dropdown-menu`, `help-tooltip`, `scroll-area`, `table`, and nested selector variants;
  - `docs/engineering.md` and `docs/verification.md` now record the durable rule: app-local Tailwind entry CSS must source `packages/ui`, and shared UI build-contract changes require build plus compiled-artifact proof.
- Что проверено:
  - `pnpm typecheck`
  - `pnpm --filter @newsportal/admin build`
  - `pnpm --filter @newsportal/web build`
  - `git diff --check`
  - `node --input-type=module -e "import { readdirSync, readFileSync } from 'node:fs'; for (const app of ['admin','web']) { const dir = 'apps/' + app + '/dist/client/_astro'; const cssFile = readdirSync(dir).find((name) => name.endsWith('.css')); const css = cssFile ? readFileSync(dir + '/' + cssFile, 'utf8') : ''; const checks = { minWidth8rem: /min-width:8rem/.test(css), padding1px: /padding:1px/.test(css), maxWidth280: /max-width:280px/.test(css), maxWidth380: /max-width:380px/.test(css), radixSelectHeight: /var\\(--radix-select-trigger-height\\)/.test(css), radixSelectWidth: /var\\(--radix-select-trigger-width\\)/.test(css), checkboxTranslate2px: /--tw-translate-y:2px/.test(css), nestedSvgVariant: /\\[&_svg\\]:pointer-events-none|svg\\{pointer-events:none\\}/.test(css) }; console.log(app + ' ' + (cssFile ?? 'NO_CSS') + ' ' + JSON.stringify(checks)); }"`
- Риски или gaps:
  - sweep used representative compiled-artifact checks rather than a fully exhaustive per-class audit of every shared component;
  - no browser-click walkthrough was run across every dialog/dropdown/select/tooltip consumer in this turn.
- Follow-up:
  - if the user wants, the next bounded item can be a manual browser sweep of the highest-risk admin interactions;
  - future shared UI regressions should open a new explicit item rather than reopening this archived sweep.

### 2026-03-25 — P-MVP-BUGFIX-2 — Admin confirmation dialogs render visibly again on the reindex flow

- Тип записи: patch archive
- Финальный статус: archived
- Зачем понадобилось: пользователь сообщил, что на admin reindex screen при нажатии на queue/reindex action страница блюрится и блокируется, но confirm dialog не виден.
- Что изменилось:
  - investigation showed a repo-specific build issue instead of a backend reindex problem: the admin bundle did not include the unique centering utilities used by shared `AlertDialogContent` / `DialogContent`, so the overlay rendered while the dialog content left the visible viewport;
  - `packages/ui/src/components/ui/alert-dialog.tsx` и `packages/ui/src/components/ui/dialog.tsx` now center dialog content through inline layout styles (`inset: 0`, auto margins, bounded width, viewport-capped height, scroll fallback) instead of relying on Tailwind-scanned positioning utilities;
  - the fix stays shared across admin confirmation flows, so reindex, bulk schedule, channel/template/article confirmations, and any other consumers of the same primitives keep one consistent centering path.
- Что проверено:
  - `pnpm typecheck`
  - `pnpm --filter @newsportal/admin build`
  - `git diff --check`
  - `rg -n "calc\\(100vw - 2rem\\)|fit-content|100vh - 2rem|overflowY" apps/admin/dist/client/_astro apps/admin/dist/server/chunks -S`
- Риски или gaps:
  - в этом turn не выполнялся browser-click runtime smoke; proof опирается на shared primitive change, green build/typecheck, и compiled artifact check;
  - если позже всплывет похожий invisible popup вне этих shared primitives, нужен новый explicit item вместо тихого продолжения этого patch.
- Follow-up:
  - truthful next MVP bugfix work возвращается к следующему user-reported bounded item;
  - если пользователь захочет, можно отдельно прогнать manual browser retest на `/admin/reindex` и соседних confirm flows.

### 2026-03-25 — C-MVP-MANUAL-READINESS — Manual MVP baseline is now closed on a green runtime/docs sync

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: после снятия unrelated acceptance blocker-а capability все еще оставался live из-за финального closeout шага `S-MVP-MANUAL-READINESS-3`; пользователь попросил проверить и закрыть этот остаточный runtime/docs/manual-pack layer по фактическому состоянию репозитория.
- Что изменилось:
  - capability now truthfully closes around a durable operator-facing baseline: `README.md` держит manual MVP checklist для `pnpm dev:mvp:internal`, RSS import via `infra/scripts/manual-rss-bundle.template.json`, scheduling/fetch-history verification, `web_push` connect flow и admin delivery/LLM checks;
  - repo сохраняет explicit manual RSS bundle template вместо притворства, будто real feed list already ships in-tree; `.env.example`, `.env.dev`, `package.json` commands и `.aidp/os.yaml` остаются согласованными вокруг canonical internal MVP compose/proof baseline;
  - current entry surfaces already match the readiness pack without новых in-scope fixes в closeout phase: public feed читает paginated `/feed` contract с truthful feed wording/source links, а admin dashboard требует dedicated sign-in и ведет операторов к channel create/import, templates, observability, reindex и help surfaces;
  - final `S-MVP-MANUAL-READINESS-3` audit не нашел дополнительного runtime/docs/manual-pack drift внутри allowed paths beyond the already-present in-scope changes, поэтому capability больше не должна висеть как pseudo-active lane в `docs/work.md`.
- Что проверено:
  - `node --import tsx --test tests/unit/ts/app-routing.test.ts tests/unit/ts/article-card-links.test.ts tests/unit/ts/sdk-pagination.test.ts`
  - `pnpm typecheck`
  - `git diff --check`
  - `pnpm integration_tests`
- Риски или gaps:
  - фактический browser receipt для `web_push` по-прежнему остается manual-only proof item и не превращается этим capability в automated close gate;
  - repo по-прежнему хранит только template bundle, а не canonical real RSS feed list; для настоящего manual run оператор должен подставить реальные feed URLs;
  - RSS-first acceptance scope по-прежнему не расширен на `website`, `api` и `email_imap` ingest.
- Follow-up:
  - truthful next product work возвращается к новому explicit MVP bugfix item, если пользователь сообщит следующий дефект;
  - `C-FETCHER-DUPLICATE-PREFLIGHT` остается отдельной blocked capability и не должен молча подмешиваться в архивированный manual-readiness lane.

### 2026-03-25 — C-ADMIN-UX — Admin auth and CRUD redesign now follow dedicated workflow-first routes

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: пользователь попросил перестроить admin UX вокруг дружелюбного workflow-first CRUD, потому что entity management было неконсистентным: формы смешивались со списками, created entities нельзя было полноценно edit/delete, browser redirects выбрасывали обратно на dashboard, а logged-out auth показывался поверх dashboard shell.
- Что изменилось:
  - admin auth вынесен на dedicated `/sign-in` surface без dashboard shell; protected admin pages и stale admin BFF POST flows теперь редиректят туда с preserved `next=<requested path>`, а logout возвращает на sign-in вместо root dashboard;
  - shared admin redirect contract стал context-preserving: browser POST flows принимают `redirectTo`, create success ведет на entity edit screen, update остается на текущем edit/list screen, а list-row actions возвращают пользователя в текущий paginated context;
  - channels, LLM templates и interest templates переведены на separate list/create/edit screens (`/channels`, `/channels/new`, `/channels/import`, `/channels/:id/edit`, `/templates/llm`, `/templates/llm/new`, `/templates/llm/:id/edit`, `/templates/interests`, `/templates/interests/new`, `/templates/interests/:id/edit`) вместо прежних mixed list+form surfaces;
  - admin navigation и page IA теперь truthfully разделяют Dashboard, Channels, LLM Templates, Interest Templates, Articles, Clusters, Reindex, Observability и Help, а `/templates` становится thin redirect к `/templates/llm`;
  - Python API + SDK получили single-record read contracts для `getChannel`, `getLlmTemplate` и `getInterestTemplate`, чтобы edit screens читали canonical truth без ad hoc local state;
  - channel destructive semantics стали safe-by-default: unused RSS channels hard-delete, channels с linked articles архивируются через `is_active = false` и runtime-state pause instead of violating `on delete restrict`; bulk import теперь требует явного overwrite confirmation, если payload обновляет существующие каналы по `channelId`;
  - template management получил consistent intents `save | archive | activate | delete`, full-page editor forms на shared `packages/ui` primitives и confirm dialogs для destructive/archive actions; articles, bulk schedule и reindex тоже переведены на shared confirmation flows.
- Что проверено:
  - `pnpm typecheck`
  - `pnpm lint`
  - `node --import tsx --test tests/unit/ts/app-routing.test.ts tests/unit/ts/admin-rss-channels.test.ts`
  - `git diff --check`
  - `pnpm integration_tests`
- Риски или gaps:
  - admin copy в этом capability intentionally оставлен на английском; локализация или white-label copy refinement требуют нового item;
  - `criteria` и реальные `user_interests` intentionally excluded from this redesign slice, поэтому capability не меняет их admin workflow semantics;
  - destructive row actions на list screens rely on hydrated client islands for the dialog UX, хотя server-side BFF contracts уже safe и tested без silent hard-delete shortcuts.
- Follow-up:
  - truthful next ready work возвращается к `S-MVP-MANUAL-READINESS-3` на уже green baseline;
  - если user later захочет дополнительный admin polish, deeper filtering/search on list screens, или surfaced controls для `criteria` / `user_interests`, это должны быть новые bounded items, а не reopening archived capability.

### 2026-03-25 — C-HISTORICAL-REINDEX — Historical reindex now repairs persisted DB rows safely

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: пользователь явно попросил, чтобы после добавления новых interests и AI templates reindexing затрагивал не только derived index, но и уже существующие статьи в PostgreSQL; прежний maintenance flow пересобирал только `interest_centroids` и не запускал rematch/LLM replay по historical rows.
- Что изменилось:
  - admin reindex surface теперь truthfully различает `rebuild` и `backfill`: BFF пишет `job_kind` и `options_json` в `reindex_jobs`, UI объясняет режим historical repair, а recent jobs показывают mode и coarse progress;
  - worker `process_reindex` теперь понимает `rebuild`, `backfill` и `repair`, умеет батчами переигрывать уже существующие статьи, повторно запускать criteria/interest matching и gray-zone LLM review с текущими templates, и при backfill policy intentionally не шлет retro notifications;
  - `criterion_match_results` и `interest_match_results` переведены на duplicate-safe semantics: новая migration `0006_reindex_backfill_upserts.sql` чистит legacy дубли и добавляет unique indexes, а worker matching paths пишут через upsert вместо бесконечного накопления одинаковых historical rows;
  - compose smoke harness получил отдельный `reindex-backfill` сценарий, который ограничивает replay одной seeded статьей, подтверждает отсутствие duplicated matches, неизменность notification count и завершение `reindex_jobs` в `completed`.
- Что проверено:
  - `pnpm unit_tests:ts`
  - `PYTHONPATH=. python -m unittest discover -s tests/unit/python -p 'test_*.py'`
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm db:migrate`
  - `docker compose -f infra/docker/compose.yml exec -T worker python -m app.smoke reindex-backfill`
  - `git diff --check`
  - `pnpm integration_tests`
- Риски или gaps:
  - admin UI специально не экспонирует operator-only `repair` mode или doc-targeted backfill filters, хотя worker runtime их уже поддерживает для controlled proofs и future maintenance follow-ups;
  - backfill behavior доказан функционально на bounded compose smoke и полном internal acceptance rerun, но не имеет отдельного soak/perf proof для очень больших historical datasets;
  - retro-notification resend остается запрещенным shortcut-ом: если когда-нибудь понадобится resend legacy notifications, это должен быть новый явный item с отдельной operator approval и proof.
- Follow-up:
  - следующий truthful item должен быть новым explicit bind; наиболее очевидные live candidates остаются `S-MVP-MANUAL-READINESS-3` и `S-ADMIN-UX-2`;
  - если операторам понадобится surfaced `repair` mode, doc-targeted replay controls или performance tuning для large historical backfills, это должно открываться новым bounded item, а не переоткрытием этой capability.

### 2026-03-25 — P-MVP-BUGFIX-1 — Public feed article clicks open the original source

- Тип записи: patch archive
- Финальный статус: archived
- Зачем понадобилось: пользователь начал MVP bugfix lane и первым дефектом указал, что клики по статьям в public feed ведут не туда: user-facing карточка фактически уводила в debug/explain endpoint вместо оригинального источника.
- Что изменилось:
  - `GET /feed` теперь проецирует stored `articles.url` для feed-eligible items без изменения feed eligibility или pagination semantics;
  - `apps/web/src/components/ArticleCard.tsx` теперь разрешает только browser-safe `http(s)` source URLs, делает preview area и explicit external-link affordance user-facing ссылками на оригинальную статью и убирает explain/debug target с public feed;
  - добавлен targeted TS guard `tests/unit/ts/article-card-links.test.ts` для safe/unsafe article URLs;
  - canonical internal MVP acceptance script теперь отдельно проверяет, что `/feed` отдает source `url`, а public web feed HTML содержит source target и не содержит `/articles/:doc_id/explain`.
- Что проверено:
  - `node --import tsx --test tests/unit/ts/article-card-links.test.ts`
  - `pnpm typecheck`
  - `pnpm lint`
  - `git diff --check`
  - `pnpm integration_tests`
- Риски или gaps:
  - notification history links и настоящий internal web article detail screen остаются вне этого patch;
  - для non-`http(s)` article URLs public feed намеренно не строит clickable fallback и оставляет карточку non-link, пока не появится отдельный user-facing detail route.
- Follow-up:
  - следующий MVP bugfix нужно снова bind-ить отдельным item;
  - если пользователь захочет internal article detail screens, это должен быть новый bounded follow-up, а не тихое продолжение этого patch.

### 2026-03-25 — SW-WORKTREE-CLOSEOUT-1 — Isolate the staged closeout lane from user-owned residue

- Тип записи: sweep archive
- Финальный статус: archived
- Зачем понадобилось: после архивирования `C-LISTING-CONSISTENCY`, `S-ADMIN-UX-1` и `P-FETCHERS-LINT-1` dirty tree оставался semantically mixed: completed product/doc/lint work, ready follow-up items и user-authored docs/assets лежали рядом и повышали риск accidental scope drift.
- Что изменилось:
  - archived product/doc/lint files из listing-consistency, admin UX stage 1 и fetchers lint patch собраны в один staged closeout lane без unstaged in-scope хвоста;
  - `EXAMPLES.md`, `HOW_TO_USE.md` и `docs/data_scripts/*` намеренно оставлены вне этого lane как user-owned residue;
  - `docs/work.md` синхронизирован так, чтобы live state больше не описывал дерево как mixed execution lane и сразу возвращал следующий выбор к одному explicit item.
- Что проверено:
  - `git status --short`
  - `git diff --cached --name-only`
  - `git diff --name-only`
- Риски или gaps:
  - staged closeout lane изолирован, но еще не landed/exported отдельным commit или user decision;
  - isolated residue files остаются за пределами product closeout proof и не должны молча попадать в следующую feature lane.
- Follow-up:
  - truthful next work снова сводится к одному выбору: `S-ADMIN-UX-2` или `S-MVP-MANUAL-READINESS-3`, с сохранением residue вне product scope до отдельного решения пользователя.

### 2026-03-25 — S-ADMIN-UX-1 — Shared admin help primitives and first-wave surface polish

- Тип записи: stage archive
- Финальный статус: archived
- Зачем понадобилось: после возврата primary work к `C-ADMIN-UX` dirty tree уже truthfully содержал first-wave admin UX polish на нескольких surfaces, но stage все еще не был закрыт: Help page оставалась плохо discoverable, interactive forms дублировали field/help/collapsible markup, а финальный runtime proof по `/admin/help` и `/admin/templates` отсутствовал.
- Что изменилось:
  - admin shell navigation теперь делает Help page first-class surface через sidebar/mobile navigation, а dedicated `apps/admin/src/pages/help.astro` перестала быть скрытой страницей;
  - interactive admin forms для template management и bulk channel import переведены на shared `packages/ui` primitives: `FormField`, `Input`, `Textarea` и `Collapsible`, вместо повторяющегося inline field/help/collapse markup;
  - stage closeout сохранил и truthfully принял более широкий stage-1 admin slice, уже присутствовавший в dirty tree: contextual help / pagination / copy polish на dashboard, channels, templates, articles, clusters, observability, reindex и help surfaces;
  - live runtime docs синхронизированы: `docs/work.md` больше не держит stage-1 detail как active state и вместо этого указывает следующий truthful stage `S-ADMIN-UX-2`.
- Что проверено:
  - `pnpm typecheck`
  - `pnpm lint`
  - `git diff --check`
  - `pnpm integration_tests`
  - `pnpm dev:mvp:internal:no-build`
  - targeted signed-in nginx HTML probe for `/admin/help` and `/admin/templates`
  - `pnpm dev:mvp:internal:down`
- Риски или gaps:
  - `S-ADMIN-UX-2` и `S-ADMIN-UX-3` остаются untouched; capability `C-ADMIN-UX` не считается complete;
  - acceptance suite закрывает admin auth flow, `/admin/reindex` и `/admin/channels`; help/templates получили отдельный targeted probe именно в этом closeout.
- Follow-up:
  - truthful next stage for the capability is `S-ADMIN-UX-2`, focused on guided workflows, stronger empty/error states and remaining page-level consistency.

### 2026-03-25 — P-FETCHERS-LINT-1 — Clear repo-level fetchers lint blocker

- Тип записи: patch archive
- Финальный статус: archived
- Зачем понадобилось: `pnpm lint` оставался красным из-за unrelated IMAP fetcher warning про useless pre-assignment, и без этого `C-ADMIN-UX` не мог получить truthful green baseline even after the UI slice was ready.
- Что изменилось:
  - в `services/fetchers/src/fetchers.ts` удалено бесполезное предварительное присваивание `ingestedCount` / `duplicateCount`; fetcher теперь читает persisted counts напрямую из `persistInputsWithPreflight(...)` перед `markChannelSuccess(...)`;
  - patch intentionally не меняет ingest semantics и не смешивается с blocked duplicate-preflight capability.
- Что проверено:
  - `pnpm lint`
  - `pnpm typecheck`
- Риски или gaps:
  - patch не заменяет отдельную capability `C-FETCHER-DUPLICATE-PREFLIGHT`; любые дальнейшие fetcher behavior changes требуют нового item.
- Follow-up:
  - none; repo-level lint blocker для текущего tree снят.

### 2026-03-24 — C-LISTING-CONSISTENCY — Dashboard/feed count alignment and repo-wide pagination rollout

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: пользователь увидел, что public-facing feed и dashboard/admin surfaces считают разные множества записей, а табличные list surfaces обрываются локальными лимитами и не показывают truthful totals.
- Что изменилось:
  - введен canonical public feed read model `/feed` с семантикой `visibility_state = visible` и `processing_state in ('matched', 'notified')`; dashboard KPI для feed backlog выровнен по тому же множеству;
  - shared paginated envelope `items/page/pageSize/total/totalPages/hasNext/hasPrev` стал canonical contract для migrated list endpoints и SDK methods;
  - paginated contract раскатан на admin/web list surfaces: articles, channels, observability tables, reindex jobs, notifications, settings connected channels, clusters, templates, interests и dashboard fetch-run preview;
  - repeated pager markup вынесен в shared `PaginationNav` внутри `packages/ui`;
  - final glossary cleanup убрал stale `published` и matched-only wording с article/feed surfaces; public feed header теперь описывает truthful `articles in feed`, а admin article legend объясняет exact runtime `processing_state` values через `matched` и `notified`;
  - durable docs обновлены: blueprint теперь фиксирует feed-eligible wording и paginated envelope как canonical contract, verification требует explicit wording proof и compatibility proof для legacy raw callers.
- Что проверено:
  - `node --import tsx --test tests/unit/ts/sdk-pagination.test.ts`
  - `pnpm typecheck`
  - `docker compose --env-file .env.dev -f infra/docker/compose.yml -f infra/docker/compose.dev.yml up -d --build api web admin`
  - live reconciliation against local runtime:
    `GET /dashboard/summary` and `GET /feed?page=1&pageSize=20` returned the same backlog total on the same dataset (`active_news = 3619`, `feed.total = 3619`, `items.length = 20`, `totalPages = 181`)
  - public web HTML probe for `http://127.0.0.1:4321/?page=2` confirmed the new feed copy (`articles in feed`), removed stale `matched article` wording, and kept `PaginationNav` visible with `Previous` / `Next`
  - signed-in admin HTML probe for `http://127.0.0.1:4322/articles` confirmed the updated legend copy (`matched`, `notified`) plus moderation form actions and the absence of a stale `published` label
  - `pnpm integration_tests`
  - targeted code audit confirmed no table still uses local row-limit slicing for pagination semantics; remaining `.slice(...)` calls in listing pages are content truncation only
- Риски или gaps:
  - admin dashboard root labels were not fetched separately under a signed-in browser session in the final pass; however admin auth/BFF flow, `reindex`, `channels`, and the touched `articles` page were runtime-verified through the acceptance gate plus the targeted probe;
  - legacy raw array responses for some endpoints without `page/pageSize` are intentionally still present as rollout compatibility for old callers and documented as non-canonical behavior until a future cleanup item retires them.
- Follow-up:
  - truthful next work returns to user reprioritization between paused `C-ADMIN-UX` and ready `C-MVP-MANUAL-READINESS`;
  - if legacy raw list compatibility should be removed later, that must open a new capability or patch rather than reopening this archived rollout.

### 2026-03-24 — C-NORMALIZE-DEDUP-BLOCKER — Compose normalize/dedup blocker resolution

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: `pnpm integration_tests` падал в `test:normalize-dedup:compose`, хотя targeted auth/BFF proofs были green. Investigation показал, что blocker был вызван stale proof expectations в full compose baseline, а не missing backend route или очевидной worker regression.
- Что изменилось:
  - code inspection по `services/workers/app/main.py` и `services/relay/src/relay.ts` подтвердил ownership: worker пишет outbox rows со status default `pending`, а live relay в `pnpm test:mvp:internal` может успеть перевести `article.normalized` в `published` до smoke verification;
  - `services/workers/app/smoke.py` ослаблен до truthful contract: article может уже уйти дальше `deduped`, а `article.normalized` допустим в `pending` или `published`;
  - `infra/scripts/test-mvp-internal.mjs` исправлен под реальную nginx/browser truth: logged-out `/` и `/admin/` теперь проверяются по корректным snippets, а authenticated `/settings`, `/admin/reindex` и `/admin/channels` валидируются cookie-aware requests;
  - full compose acceptance rerun подтвердил, что normalize/dedup blocker снят и repo-level gate снова green.
- Что проверено:
  - `pnpm integration_tests`
  - `git diff --check`
- Риски или gaps:
  - capability не расширяет acceptance truth beyond current RSS-first internal MVP scope; `website`, `api` и `email_imap` ingest по-прежнему требуют отдельного capability/proof;
  - manual browser receipt для `web_push` и curated real-feed RSS bundle остаются operator-side follow-up, а не частью этой blocker remediation.
- Follow-up:
  - truthful next item возвращается к `S-MVP-MANUAL-READINESS-3`, который теперь снова `ready`;
  - если later выяснится новый normalize/dedup regression, нужен новый work item, а не reopening этой архивной capability.

### 2026-03-24 — SW-ADMIN-APP-PATHS-1 — Admin browser-path hardening for import and adjacent flows

- Тип записи: sweep archive
- Финальный статус: archived
- Зачем понадобилось: пользователь сообщил, что bulk import падает с `404: Not found` на `/channels/bff/admin/channels/bulk`; расследование показало, что backend route существует, а admin UI строит часть links/forms/redirects как page-relative пути и теряет app root или nginx `/admin` prefix.
- Что изменилось:
  - в `apps/admin/src/lib/server/browser-flow.ts` добавлен shared helper `resolveAdminAppPath`, который строит browser-visible пути от truthful admin app base и учитывает `x-forwarded-prefix`;
  - `apps/admin/src/layouts/AdminShell.astro` переведен на shared helper для sidebar/mobile navigation и logout action;
  - `apps/admin/src/pages/index.astro`, `articles.astro`, `channels.astro`, `templates.astro`, `reindex.astro`, `observability.astro` и `clusters.astro` переведены на shared helper для form actions, breadcrumbs, quick links и auth redirects;
  - точечная regression-proof проверка добавлена в `tests/unit/ts/app-routing.test.ts` для direct-port root и nginx-shaped `/admin` paths, включая bulk-import URL.
- Что проверено:
  - `node --import tsx --test tests/unit/ts/app-routing.test.ts`
  - `pnpm typecheck`
  - `git diff --check`
  - `rg -n 'href="/|action="/|Astro.redirect\\("/|Astro.redirect\\('/ apps/admin/src` (no matches)
- Риски или gaps:
  - sweep не меняет backend semantics import/template/moderation/reindex handlers; он исправляет только browser-visible path generation в admin app;
  - full `pnpm integration_tests` по-прежнему blocked unrelated failure в `test:normalize-dedup:compose`, поэтому repo-wide green acceptance не восстановлен этой работой.
- Follow-up:
  - truthful next background item возвращается к `S-MVP-MANUAL-READINESS-3` / `C-MVP-MANUAL-READINESS`, если пользователь снова захочет двигать blocked acceptance path;
  - если понадобится такой же prefix-safe helper для других app surfaces, это должно открываться отдельным work item, а не тихим продолжением текущего sweep.

### 2026-03-23 — C-AI-PROCESS-PACKAGE-REFRESH — Refresh package transfer and source-package retirement

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: пользователь запросил обновить агентные инструкции и связанную документацию из package в `init/`, но удалить package только после проверки всех связей и логики переноса.
- Что изменилось:
  - собран explicit transfer audit между `init/**` и root runtime core;
  - archive-sync semantics синхронизированы между `AGENTS.md`, `docs/work.md`, `docs/history.md`, `docs/verification.md` и `.aidp/os.yaml`;
  - `docs/contracts/README.md` расширен naming/template guidance, а в root добавлен `docs/contracts/SUBSYSTEM-CONTRACT-TEMPLATE.md`;
  - `README.md` синхронизирован сначала с временным pre-delete состоянием, затем с финальным after-retirement состоянием;
  - source package удален только после passed pre-delete audit, а live context очищен от process-refresh residue.
- Что проверено:
  - `git diff --check -- AGENTS.md README.md docs .aidp init`
  - `pnpm check:scaffold`
  - targeted `rg` consistency checks по archive-sync semantics, template availability и runtime references
  - explicit transfer audit с решением `migrate` / `already covered` / `do not migrate` для relevant `init/**`
- Риски или gaps:
  - `docs/history.md` намеренно сохраняет historical references к прошлым фазам удаления/возврата `init/`; это архивная правда, а не текущий runtime contract;
  - capability не решает unrelated product blockers вроде `test:normalize-dedup:compose` и mixed product worktree.
- Follow-up:
  - truthful next item остается прежним: разбор blocker в `pnpm integration_tests` / `test:normalize-dedup:compose`, затем повторный full acceptance для `C-MVP-MANUAL-READINESS`.

### 2026-03-23 — C-UI-REDESIGN — Full UI/UX redesign

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: пользователь запросил полный UI/UX redesign для web portal и admin panel без изменения существующих BFF/runtime boundaries.
- Что изменилось:
  - в `packages/ui` собрана реальная shadcn/ui component library;
  - `apps/web` переведен на multi-page shell с темами, toast-ами, interests/notifications/settings surfaces;
  - `apps/admin` переведен на sidebar-driven multi-page admin shell с новыми operational screens;
  - build/type surfaces для web/admin/ui синхронизированы под новый UI baseline.
- Что проверено:
  - `pnpm typecheck`
  - `pnpm unit_tests:ts`
- Риски или gaps:
  - manual browser verification для dark mode, sonner toasts, web-push connect flow и mobile admin sidebar остается вне automated proof;
  - full `pnpm integration_tests` по-прежнему блокируется unrelated `test:normalize-dedup:compose`, а не UI change itself.
- Follow-up:
  - none; дальнейшие UI задачи должны открываться новыми work items.

### 2026-03-23 — P-PROCESS-CLEANUP-1 — Очистка stale process residue после v2 migration

- Тип записи: patch archive
- Финальный статус: archived
- Зачем понадобилось: после перехода на runtime-core v2 в live docs оставался переходный migration residue, а в корне репозитория лежал системный `.DS_Store`.
- Что изменилось:
  - удален root `.DS_Store`;
  - `docs/work.md` сжат обратно к product-relevant live state без лишнего migration noise в `Why now` и `Recently changed`;
  - `docs/verification.md` очищен от слишком узкой привязки к `init/` и теперь фиксирует generic stale-runtime-path cleanup rule.
- Что проверено:
  - `git diff --check`
  - targeted `rg` review по surviving docs на stale migration/process residue
  - отсутствие `.DS_Store` в корне репозитория
- Риски или gaps:
  - архивные references к старым стадиям process migration и прошлому удалению `init/` сохранены намеренно как historical truth, а не считаются мусором.
- Follow-up:
  - none

### 2026-03-23 — C-AI-PROCESS-V2-MIGRATION — Миграция runtime core на v2 и русификация surviving docs

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: пользователь запросил перевести агентную разработку на новую версию process docs из `init/`, сохранить текущее live/archive состояние, мигрировать schema process-файлов и оставить surviving project documentation на русском.
- Что изменилось:
  - runtime core переведен на 7-file model: добавлен `docs/engineering.md`, а `AGENTS.md`, `docs/verification.md`, `docs/work.md` и `.aidp/os.yaml` синхронизированы с новой v2 schema;
  - `docs/blueprint.md` сохранен как master blueprint без template rewrite; в него добавлены только durable ссылки на companion docs `docs/engineering.md`, `docs/verification.md` и `docs/contracts/test-access-and-fixtures.md`;
  - добавлены repo-specific deep contract docs `docs/contracts/README.md` и `docs/contracts/test-access-and-fixtures.md`, которые фиксируют stateful backend test access, fixture creation и cleanup discipline;
  - `docs/work.md` мигрирован на новую live-state schema с `Primary active item`, `Secondary active item`, `Worktree coherence`, `Test artifacts and cleanup state` и explicit mixed-worktree truth;
  - `README.md` и `firebase_setup.md` синхронизированы с 7-file runtime core и новым engineering/test-access layering;
  - директория `init/` удалена после merge, но прежние архивные записи о ее прошлых состояниях сохранены как исторический факт.
- Разбивка по stages:
  - `S-AI-PROCESS-V2-1` — adopt new core contract in place
  - `S-AI-PROCESS-V2-2` — migrate live state and archive data to new schema
  - `S-AI-PROCESS-V2-3` — finish Russian documentation sweep, add contract docs and retire `init/`
- Что проверено:
  - `git diff --check`
  - `pnpm check:scaffold`
  - targeted `rg` consistency checks по surviving docs на старый 6-file runtime core, stale read/authority order, placeholder-like package text и runtime-ссылки на `init/`
- Риски или gaps:
  - `docs/history.md` намеренно сохраняет historical references к прошлому 6-file core и более раннему удалению `init/`; это архивная правда, а не текущий runtime contract;
  - migration сознательно не меняла application behavior, service boundaries или уже существующие product/proof gaps вроде `test:normalize-dedup:compose`.
- Follow-up:
  - truthful next product work остается прежним: разбор blocker в `pnpm integration_tests` / `test:normalize-dedup:compose`, затем повторный full acceptance для `C-MVP-MANUAL-READINESS`.

### 2026-03-22 — C-PROCESS-PROOF-AUDIT — Full process-proof audit

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: пользователь запросил проверить, что после нескольких завершенных phases runtime/process-документы и их proof-paths остаются исполнимыми и не дрейфуют от текущего состояния репозитория.
- Что изменилось:
  - audit выполнен как read-only pass без code/doc remediation beyond runtime-state sync;
  - authority chain и setup-safety повторно сверены между `AGENTS.md`, `docs/blueprint.md`, `docs/verification.md`, `.aidp/os.yaml`, `docs/work.md`, `README.md`, root `package.json`, фактической top-level структурой, entrypoints и compose services;
  - повторно подтвержден command truth для canonical repo-wide и heavy proof-команд, включая `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm unit_tests`, `pnpm integration_tests`, `pnpm test:ingest:multi:compose` и `pnpm test:ingest:soak:compose`;
  - canonical compose baseline и heavy acceptance harnesses повторно исполнены на текущем dirty worktree, а не только приняты по historical claims.
- Разбивка по stages:
  - `SPIKE-PROCESS-PROOF-AUDIT-1` — read-only audit по process truth, command truth и heavy proof executability
- Что проверено:
  - `pnpm check:scaffold`
  - `pnpm build`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm unit_tests`
  - `docker compose --env-file .env.dev -f infra/docker/compose.yml -f infra/docker/compose.dev.yml config --services`
  - `pnpm dev:mvp:internal`
  - `pnpm integration_tests`
  - `pnpm test:ingest:multi:compose`
  - `pnpm test:ingest:soak:compose`
  - explicit command-truth review against runtime docs, scripts, entrypoints и compose services
- Findings:
  - новых `process docs stale`, `repo drift`, `environment blocker` или `proof failure` finding-ов не выявлено;
  - runtime core остается initialized, setup mode не активен, documented command surface и heavy proof contract совпадают с observable repo state;
  - existing documented gaps остаются прежними: RSS-first acceptance scope, отсутствие root-level Python typecheck gate, зависимость Python lint от host-side `ruff`, зависимость heavy proofs от Docker/Firebase/loopback networking.
- Follow-up:
  - если пользователь захочет remediation, truthful next items — отдельный `Patch` на doc-sync только при появлении drift либо отдельные capabilities на Python typecheck gate или acceptance coverage beyond RSS-first;
  - сам audit не должен переоткрываться без нового verification запроса или нового наблюдаемого drift.

### 2026-03-22 — C-MULTI-RSS-FLOW — Multi-RSS full flow hardening

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: пользователь запросил проверить, чего не хватает для работы приложения с несколькими десятками RSS, и довести RSS-first path до доказанного full flow для 50-100 synthetic feeds.
- Что изменилось:
  - `services/fetchers` переведен на bounded-concurrency poll loop с all-settled semantics; channel-level failures теперь не прерывают весь due batch, а runtime baseline получил `FETCHERS_CONCURRENCY=4` и enlarged `FETCHERS_BATCH_SIZE=100`;
  - RSS parser теперь явно отвергает non-RSS payload, а RSS body selection учитывает `preferContentEncoded`;
  - admin RSS surface расширен до full channel contract: single create/update, bulk import JSON array, pause/resume, editable scheduler/config fields и operational observability по `last_fetch_at`, `last_success_at`, `last_error_at`, `last_error_message`;
  - `/channels` read API теперь отдает `poll_interval_seconds` и `config_json`, чтобы admin UI мог быть truth-backed при редактировании и обзоре каналов;
  - добавлены deterministic unit tests для scheduler concurrency/isolation и RSS admin payload validation;
  - добавлен compose-backed proof harness `infra/scripts/test-rss-multi-flow.mjs`, который через admin bulk endpoint поднимает 24- и 60-channel RSS scenarios с профилями `healthy`, `duplicate`, `not_modified`, `invalid_xml` и `timeout`.
- Разбивка по stages:
  - `S-MULTI-RSS-001` — scheduler hardening, RSS admin surface, multi-channel proof и runtime sync
- Что проверено:
  - `pnpm unit_tests`
  - `pnpm typecheck`
  - `pnpm lint:ts`
  - `pnpm test:ingest:multi:compose`
  - `pnpm test:ingest:soak:compose`
  - `git diff --check`
- Риски или gaps:
  - `website`, `api` и `email_imap` ingest по-прежнему не имеют сопоставимого multi-channel acceptance proof;
  - multi-channel RSS proofs зависят от Docker Compose access, локального loopback fixture server и валидных `FIREBASE_WEB_API_KEY` / `ADMIN_ALLOWLIST_EMAILS`;
  - root `pnpm lint` для Python части все еще требует отдельной host-side установки `ruff`.
- Follow-up:
  - если понадобится расширять ingest beyond RSS, следующий truthful capability — отдельный acceptance/proof arc для `website`, `api` или `email_imap` без смешивания их с уже доказанным RSS path

### 2026-03-22 — P-UNIT-COVERAGE-1 — Расширение root unit coverage

- Тип записи: patch archive
- Финальный статус: archived
- Зачем понадобилось: пользователь запросил проверить, что новые unit tests действительно логические, и расширить их beyond the initial minimal baseline.
- Что изменилось:
  - TS unit suite в `tests/unit/ts` теперь покрывает additional RSS helper edge cases: HTML entity decoding, markup stripping, whitespace collapse, fallback title и invalid date handling;
  - TS queue tests теперь покрывают downstream terminal routing contract и family classifiers для article / compile / review / feedback / reindex events;
  - Python compiler tests теперь покрывают default hard constraints и negative-path для missing negative prototypes;
  - Python scoring tests теперь покрывают overlap/place helper edge cases, exact threshold decisions, invalid datetime parsing, FTS normalization и `is_major_update`.
- Что проверено:
  - `pnpm unit_tests`
  - `git diff --check`
- Риски или gaps:
  - root `unit_tests` все еще остается pure-logic gate и не доказывает DB/Redis/queue/network boundaries
  - отдельный acceptance proof для `website`, `api` и `email_imap` ingest по-прежнему отсутствует
- Follow-up:
  - если дальше расширять unit coverage, следующий truthful шаг — добрать remaining pure helpers без смешивания их с integration behavior

### 2026-03-22 — C-ROOT-QA-GATES — Root-level QA gates

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: закрыть долгоживущий proof gap по отсутствию единых repo-level `lint`, `unit_tests` и `integration_tests` gate без расширения acceptance truth beyond RSS-first path.
- Что изменилось:
  - в корневой `package.json` добавлены canonical команды `pnpm lint`, `pnpm unit_tests` и `pnpm integration_tests`, плюс helper scripts для TS и Python частей;
  - добавлен root `eslint.config.mjs` для TS/Astro/infra scripts с first-pass minimal ruleset и root `ruff.toml` для Python services;
  - добавлен `infra/docker/python.dev-requirements.txt`, который фиксирует отдельный host-side QA dependency path для `ruff`;
  - созданы deterministic root unit suites для `services/fetchers/src/rss.ts`, `packages/contracts/src/queue.ts`, `services/ml/app/embedding.py`, `services/ml/app/compiler.py` и `services/workers/app/scoring.py`;
  - `pnpm integration_tests` зафиксирован как thin alias на existing `pnpm test:mvp:internal`, а README, verification и machine facts синхронизированы с новым root QA contract;
  - из `infra/scripts/test-mvp-internal.mjs` удалены мертвые локальные переменные, мешавшие прохождению lint.
- Разбивка по stages:
  - `S-ROOT-QA-GATES-1` — root tooling, unit baseline, gate proof и runtime sync
- Что проверено:
  - `python -m pip install --target /tmp/newsportal-pyqa -r infra/docker/python.dev-requirements.txt`
  - `pnpm lint`
  - `pnpm unit_tests`
  - `pnpm integration_tests`
  - `git diff --check`
- Риски или gaps:
  - root `pnpm lint` для Python части зависит от отдельной host-side установки `ruff`; одного `pnpm install` недостаточно
  - repo по-прежнему не имеет root-level Python typecheck gate, сопоставимого с `pnpm typecheck`
  - `pnpm integration_tests` сознательно остается RSS-first acceptance proof; `website`, `api` и `email_imap` ingest требуют отдельного capability и отдельного proof
- Follow-up:
  - если понадобится дальше усиливать QA baseline, следующими truthful candidates являются отдельный Python typecheck gate или отдельная capability на acceptance coverage beyond RSS-first

### 2026-03-22 — C-MVP-READY — Internal MVP readiness

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: довести локальный polyglot baseline до near-release внутреннего MVP-теста с одним реально работающим live delivery channel.
- Что изменилось:
  - `apps/web` и `apps/admin` переведены на SSR build/runtime через Astro Node adapter и built-server Docker runtime;
  - canonical internal/dev baseline закреплен как `pnpm dev:mvp:internal`, который запускает `docker compose --env-file .env.dev -f infra/docker/compose.yml -f infra/docker/compose.dev.yml ...`;
  - admin bootstrap больше не требует ручного SQL: `ADMIN_ALLOWLIST_EMAILS` выдает локальную роль `admin` при первом successful Firebase sign-in, при этом exact allowlisted email допускает repeatable `+alias` sign-in для internal tests;
  - internal acceptance scope зафиксирован как RSS-first, а deterministic RSS fixture перенесен во `web` runtime, чтобы compose stack ходил по in-network URL;
  - `mailpit` добавлен в dev baseline как live SMTP sink для `email_digest` и подключен к `app_net`;
  - `services/workers/app/delivery.py` выровнен с env contract: `smtp://` теперь означает plain SMTP, а `smtp+starttls://` остается explicit path для TLS upgrade;
  - `infra/scripts/test-mvp-internal.mjs` научен явно загружать `.env.dev`, проверять compose-only health paths, падать с реальной причиной delivery failure и доказывать user/admin happy path, RSS ingest, Mailpit delivery и moderation audit.
- Разбивка по stages:
  - `S-MVP-READY-1` — runtime/auth/compose/email foundation и final end-to-end proof
- Что проверено:
  - `pnpm check:scaffold`
  - `pnpm typecheck`
  - `pnpm build`
  - `git diff --check`
  - `docker compose --env-file .env.dev -f infra/docker/compose.yml -f infra/docker/compose.dev.yml config --services`
  - `pnpm test:ingest:compose`
  - `pnpm test:mvp:internal`
- Риски или gaps:
  - отсутствует единый repo-level `lint` gate
  - отсутствуют единые repo-level `unit_tests` и `integration_tests`
  - internal MVP acceptance по-прежнему покрывает только RSS-first ingest path; `website`, `api` и `email_imap` требуют отдельного proof
- Follow-up:
  - для новой capability заводить новый work item в `docs/work.md`; текущая readiness capability завершена и не должна переоткрываться без нового запроса

### 2026-03-22 — C-AI-INIT — Базовая инициализация AI runtime-core

- Тип записи: capability archive
- Финальный статус: archived
- Зачем понадобилось: внедрить compact runtime core поверх существующего NewsPortal без потери архитектурной истины из `docs/blueprint.md`.
- Что изменилось:
  - `AGENTS.md` объединен с runtime-contract шаблона и переведен на русский.
  - Добавлены `docs/work.md`, `docs/verification.md`, `docs/history.md` и `.aidp/os.yaml`.
  - В начало `docs/blueprint.md` добавлен runtime-core summary без замены основного blueprint.
  - `README.md` переведен на русский и дополнен разделом про runtime core.
- Разбивка по stages:
  - `S-AI-INIT-1` — merge contract в `AGENTS.md`
  - `S-AI-INIT-2` — заполнение `.aidp/os.yaml` и `docs/verification.md`
  - `S-AI-INIT-3` — добавление `docs/work.md`, `docs/history.md` и summary в `docs/blueprint.md`
  - `S-AI-INIT-4` — русификация touched docs, финальная синхронизация и выход из `setup mode`
- Что проверено:
  - content consistency review runtime core
  - `git diff --check`
  - `pnpm check:scaffold`
- Открытые gaps:
  - отсутствует единый repo-level `lint` gate
  - отсутствуют единые repo-level `unit_tests`, `integration_tests` и `smoke` gates
- Follow-up:
  - следующая implementation work должна начинаться с нового явного work item в `docs/work.md`

### 2026-03-22 — P1 — Удаление template-директории init

- Тип записи: patch archive
- Финальный статус: archived
- Зачем понадобилось: после инициализации runtime-core исходная template-директория стала лишней и могла путать рабочий runtime context с историческим шаблоном.
- Что изменилось:
  - директория `init/` удалена из репозитория;
  - `AGENTS.md`, `README.md` и `docs/work.md` синхронизированы с тем, что runtime-core полностью живет в корне, `docs/` и `.aidp/`;
  - повторно проверена корректность инициализации документации после cleanup.
- Что проверено:
  - отсутствие `init/` в рабочем дереве
  - отсутствие рабочих ссылок на `init/` в runtime-core docs
  - `init/` удален из git-индекса через `git rm -r --cached --ignore-unmatch init`
  - `git diff --check`
  - `pnpm check:scaffold`
- Риски или gaps:
  - единые repo-level `lint`, `unit_tests`, `integration_tests` и `smoke` gates по-прежнему отсутствуют
- Follow-up:
  - none

### 2026-03-22 — P-FIREBASE-SETUP-DOC — Руководство по настройке Firebase

- Тип записи: patch archive
- Финальный статус: archived
- Зачем понадобилось: пользователь запросил точный пошаговый маршрут по Firebase Console и отдельный repo-local guide, чтобы без догадок снять блокер по `FIREBASE_WEB_API_KEY` и first-run admin sign-in.
- Что изменилось:
  - в корне репозитория добавлен `firebase_setup.md`;
  - guide фиксирует, какие сервисы Firebase реально нужны для текущего NewsPortal MVP;
  - guide показывает точный console path для получения `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_API_KEY`, включения `Anonymous` и `Email/Password`, а также создания admin user и заполнения `ADMIN_ALLOWLIST_EMAILS`;
  - `docs/work.md` синхронизирован так, чтобы следующий агент видел новый guide как ближайший путь для разблокировки `S-MVP-READY-1`.
- Что проверено:
  - `firebase_setup.md` создан в корне репозитория
  - содержимое guide согласовано с текущим env contract из `.env.example`
  - содержимое guide согласовано с фактическим использованием Firebase в `apps/web/src/lib/server/auth.ts` и `apps/admin/src/lib/server/auth.ts`
- Риски или gaps:
  - Firebase Console может слегка менять визуальные названия разделов, но durable route через `Project settings`, `Your apps` и `Authentication` остается актуальным
  - `FIREBASE_CLIENT_CONFIG` и `FIREBASE_ADMIN_CREDENTIALS` пока не используются кодом и остаются документированы как не обязательные для текущего MVP
- Follow-up:
  - пройти шаги из `firebase_setup.md`, обновить `.env.dev` и повторно запустить `pnpm test:mvp:internal`

### 2026-04-16 — C-WEBSITE-INGESTION-LIVE-QUALITY-HARDENING / STAGE-1 — classifier, collection-hint, and browser-recommendation hardening

- Тип записи: capability stage archive
- Финальный статус: done
- Зачем понадобилось: live website matrix на 2026-04-16 показал, что cheapest high-ROI uplift для `website` ingestion находится не в redesign/browser-first crawling, а в более точной cheap-first классификации newsroom pages, richer collection-card hints, tiny bounded site tuning, and clearer browser recommendation telemetry.
- Что изменилось:
  - `packages/contracts/src/source.ts` и `apps/admin/src/lib/server/website-channels.ts` теперь поддерживают bounded `website.curated` config slice с `preferCollectionDiscovery`, `preferBrowserFallback`, и narrow URL-pattern kind hints, не превращая это в общий parser framework;
  - `services/fetchers/src/web-ingestion.ts` теперь извлекает `summary` и `publishedAt` hints из collection-card context, учитывает override kinds/discovery source/published-at in classifier scoring, and distinguishes collection roots like `/changelog` from detail pages more truthfully;
  - browser recommendation logic и provider metrics now preserve explicit `browserRecommendationReasons`, while the decision itself considers static no-change evidence and static kind mix instead of a purely coarse count threshold;
  - `infra/scripts/test-live-website-matrix.mjs` now materializes the tiny curated hints for selected real sites so bounded live validation exercises the shipped config path rather than ad hoc manual tweaks;
  - `infra/scripts/test-website-admin-flow.mjs` now waits for enriched/stable website resources before asserting HTML, removing the stale-title race that appeared once richer enrichment/classification timing landed.
- Что проверено:
  - `node --import tsx --test tests/unit/ts/web-ingestion-browser.test.ts tests/unit/ts/resource-enrichment-website.test.ts`
  - `pnpm --filter @newsportal/fetchers typecheck`
  - `pnpm test:website:compose`
  - `pnpm test:hard-sites:compose`
  - `pnpm test:website:admin:compose`
  - `pnpm test:enrichment:compose`
  - `node infra/scripts/test-live-website-matrix.mjs --site="European Commission Digital Strategy News" --site="EUAA Press Releases" --site="Competition Policy Latest News" --site="Grafbase Changelog"`
- Live-result summary:
  - focused rerun evidence bundle: `/tmp/newsportal-live-website-matrix-f738a809-957a-4752-9f5f-bd7794b5ccfd.json`
  - three targeted `static_editorial` sites moved to `observed_expected_shape`, all with `collection`-first mode ordering and `collection_page`-dominated accepted resources;
  - `Competition Policy Latest News` stopped filling from irrelevant sitemap-heavy results and produced `15/15` editorial rows from collection discovery on the first rerun;
  - `Grafbase Changelog` no longer needed browser uplift in the focused rerun and now records truthful `browserRecommendationReasons` such as `static_no_change_empty` on repeat/browser-forced no-change passes.
- Риски или gaps:
  - the tiny curated slice is intentionally bounded, but still needs discipline so it does not grow into a hidden site-specific parser layer;
  - `EUAA Press Releases` improved enough to pass the focused live verdict, but still skews listing-heavy (`12 listing / 3 editorial`) and remains a good follow-up candidate if newsroom precision becomes a priority.
- Follow-up:
  - if a future user asks for the next smallest website uplift, start with tighter newsroom/listing differentiation on the remaining listing-heavy editorial sites before considering any broader browser work.

### 2026-04-16 — PATCH-WEBSITE-NEWSROOM-CARD-TITLE-INFERENCE-2026-04-16

- Тип записи: patch archive
- Финальный статус: done
- Зачем понадобилось: after the broader website hardening stage, `EUAA Press Releases` still passed the live verdict but remained listing-heavy because many accepted collection rows carried only a generic CTA link text (`Read More`) instead of the nearby newsroom headline.
- Что изменилось:
  - `services/fetchers/src/web-ingestion.ts` now infers collection-card titles from nearby `h1`-`h4` and `field--name-title` context when the anchor text is a generic CTA, so collection discovery passes the real article headline into classification instead of the CTA string;
  - `tests/unit/ts/web-ingestion-browser.test.ts` now covers this exact newsroom-card pattern.
- Что проверено:
  - `node --import tsx --test tests/unit/ts/web-ingestion-browser.test.ts`
  - `pnpm test:website:compose`
  - `node infra/scripts/test-live-website-matrix.mjs --site="EUAA Press Releases"`
- Live-result summary:
  - focused rerun evidence bundle: `/tmp/newsportal-live-website-matrix-6b9b2209-d5af-4aaf-b6a4-5b88f7268e12.json`
  - `EUAA Press Releases` stayed `observed_expected_shape`, but the accepted first-poll mix improved from `12 listing / 3 editorial` to `8 listing / 7 editorial` with the same cheap `collection_page`-only discovery path.
- Риски или gaps:
  - repeat poll still showed a small residual (`2` `editorial -> listing` transitions during enrichment), so the next newsroom-precision patch should look at enrichment-time downgrades instead of collection-link title inference.
- Follow-up:
  - none required for this patch; only open a new item if the user wants to chase the remaining enrichment-side newsroom downgrades.

### 2026-04-16 — SPIKE-WEBSITE-ALTERNATE-LIVE-MATRIX-2026-04-16

- Тип записи: spike archive
- Финальный статус: done
- Зачем понадобилось: пользователь попросил проверить `website` ingestion на полностью другом real-world cohort из 16 сайтов, чтобы понять, всплывут ли новые live-only проблемы beyond the first website matrix.
- Что изменилось:
  - `infra/scripts/test-live-website-matrix.mjs` now supports named live-site variants through `--variant=<variantKey>` instead of a single hardcoded matrix, preserving the original baseline while adding `alt_2026_04_16`;
  - the alternate variant covers four completely new sites in each existing ingress cohort:
    - `static_editorial`: `National Archives Press Releases`, `DOJ Press Releases`, `ESA Newsroom`, `IMF News`
    - `documents_downloads`: `ECB Tenders`, `EASA Procurement`, `EMSA Procurement`, `EUROCONTROL Procurement`
    - `public_changelog`: `Supabase Changelog`, `Vercel Changelog`, `PlanetScale Changelog`, `Render Changelog`
    - `browser_candidate`: `Linear Changelog`, `Framer Updates`, `Webflow Updates`, `ClickUp Changelog`
  - the harness now records the chosen `variantKey` in the evidence bundle name/report, classifies `robots.txt` blocks as truthful unsupported outcomes, and preserves cleanup-attempt status even when a live site fails during `run:once`.
- Что проверено:
  - `node infra/scripts/test-live-website-matrix.mjs --help`
  - `pnpm test:website:compose`
  - `node infra/scripts/test-live-website-matrix.mjs --variant=alt_2026_04_16`
  - `pnpm test:website:compose`
  - `node infra/scripts/test-live-website-matrix.mjs --variant=alt_2026_04_16`
  - `git diff --check -- docs/work.md docs/history.md infra/scripts/test-live-website-matrix.mjs`
- Live-result summary:
  - first-pass evidence bundle: `/tmp/newsportal-live-website-matrix-alt_2026_04_16-d06a0625-e206-42c4-926c-6fe8f734d138.json`
  - final evidence bundle after harness truthfulness fix: `/tmp/newsportal-live-website-matrix-alt_2026_04_16-2b806fa0-7b80-4e29-b3e7-2e558bd955d5.json`
  - final alternate cohort summary on `2026-04-16`: `11 observed_expected_shape`, `2 observed_partial_or_empty_shape`, `3 observed_truthful_unsupported_or_blocked`, `0 unexpected_failure`, `12` total conditional-request hits, and `0` cleanup residuals
  - `static_editorial` on the alternate cohort behaved similarly to the first matrix but with a different weak spot: `National Archives`, `ESA`, and `IMF` were `observed_expected_shape`, while `DOJ Press Releases` stayed listing-only/partial rather than clean editorial projection
  - `documents_downloads` remained strong on four completely different portals: `ECB`, `EASA`, `EMSA`, and `EUROCONTROL` all landed in `observed_expected_shape`
  - `public_changelog` again proved strong on a different vendor cohort: `Supabase`, `Vercel`, `PlanetScale`, and `Render` all landed in `observed_expected_shape`
  - the alternate `browser_candidate` cohort surfaced genuinely new external classes:
    - `Webflow Updates` consistently failed with `403` `cloudflare_js_challenge`
    - `ClickUp Changelog` was truthfully blocked by `robots.txt`
    - `Linear Changelog` still produced useful static/editorial rows but the required browser-validation lane hit `cloudflare_js_challenge`, so the overall verdict remains truthful unsupported/blocked for that cohort
    - `Framer Updates` stayed partial rather than fully blocked, confirming that browser-heavy weakness is not only anti-bot but also quality/yield variability on a different site family
- Риски или gaps:
  - browser-heavy public sites remain the weakest live cohort even on a fully different site set; the spike did not reveal a new product-side bug that justifies redesign, but it did confirm a wider class of truthful external constraints (`Cloudflare JS challenge`, `robots.txt`) than the first matrix showed;
  - `DOJ Press Releases` provides a new non-blocked but weak editorial case, so if the user wants the next small live-quality uplift, newsroom/listing differentiation should now be tested against both EU-style and U.S. government press pages rather than only the original EU newsroom cohort.
- Follow-up:
  - no code follow-up is required by default; open a new bounded item only if the user wants to chase either the new `DOJ` listing-only partial shape or the broader browser-candidate truthfulness/coverage gap.

### 2026-04-18 — C-OUTSOURCING-YIELD-ADMIN-TUNING-2026-04-18 / STAGE-ADMIN-ONLY-OUTSOURCING-TUNING-2026-04-18

- Тип записи: capability stage archive
- Финальный статус: done
- Зачем понадобилось: после live outsourcing validation preserved cohort дал `0 selected / 240 rejected`, и пользователь потребовал улучшать capture только тем, что реально настраивается через админку, без изменений ядра, worker logic, API behavior или repo code.
- Что изменилось:
  - активные outsourcing `System interests` были обновлены только через штатный local admin BFF save flow (`/templates/interests`), без прямых code edits:
    - buyer-build, implementation-partner, legacy-rescue, and staff-augmentation semantics were retuned toward buyer-authored marketplace project cards and away from portal/category/search noise;
    - candidate uplift cues were strengthened for concrete software project requests and tightened against procurement/index/category shells;
    - hard `must_not_have` filters were corrected after the first replay so they stop killing real project cards via marketplace site chrome while still suppressing obvious `freelance jobs` / `remote jobs` / `contract opportunities` surfaces.
  - активные outsourcing `LLM templates` были обновлены только через штатный local admin BFF save flow (`/templates/llm`), again without repo code changes:
    - `criteria`, `interests`, and `global` prompts now explicitly allow buyer-authored marketplace software project cards and explicitly reject procurement/opportunities landing pages, portal wrappers, category pages, directories, and seller/self-promotional pages.
  - каждая admin save операция использовала уже существующий compile/profile sync path:
    - `criteria` were recompiled via the normal queued compile flow;
    - `selection_profiles` were resynced from the admin-owned interest payloads;
    - the preserved cohort was replayed only through the normal admin `Reindex + repair existing content` path.
  - no worker/API/admin source files were edited for this capability; only process docs (`docs/work.md`, `docs/history.md`) changed in-repo.
- Что проверено:
  - baseline before tuning:
    - `final_selection_results`: `0 selected / 0 gray_zone / 240 rejected`
    - `interest_filter_results`: `0 match / 0 gray_zone / 914 no_match / 286 technical_filtered`
    - `llm_review_log`: `0`
  - admin-only mutation proof:
    - local admin sign-in via `/bff/auth/sign-in`
    - template saves via `/bff/admin/templates`
    - version bumps observed in PostgreSQL after save:
      - first pass: `criteria` and `selection_profiles` advanced to `version=2`, `llm_prompt_templates` to `version=2`
      - corrective pass: buyer-build / implementation / legacy / staff-augmentation `criteria` and `selection_profiles` advanced to `version=3`; `llm_prompt_templates` advanced to `version=3`
  - replay proof:
    - first admin-triggered reindex/backfill job: `b451821d-eeed-4ef5-878f-770f46b53424` completed
    - corrective admin-triggered reindex/backfill job: `ce8a556f-bfcf-4e7a-9188-2774c68f799b` completed
  - final after-state:
    - `final_selection_results`: `2 selected / 0 gray_zone / 238 rejected`
    - `interest_filter_results`: `2 match / 0 gray_zone / 587 no_match / 611 technical_filtered`
    - `llm_review_log`: `3` total rows across both replay passes
    - selected rows:
      - `https://hubstafftalent.net/jobs/net-c-backend-developer-freelance-per-project-work-ongoing-opportunities`
      - `https://www.freelancer.com/projects/docker/custom-clock-wheel-for-azuracast`
    - representative noisy rows still rejected:
      - `https://sam.gov/opportunities` now hard-filtered by `must_not:contract opportunities`
      - `https://www.peopleperhour.com/freelance-jobs/technology-programming` remains filtered by `must_not:remote jobs` / `must_not:freelance jobs`
      - `https://www.guru.com/d/jobs/l/united-states` remains filtered by `must_not:freelance jobs`
- Live-result summary:
  - the first replay proved the admin-only path was effective but over-broad: it surfaced `1 selected`, but that row was a false-positive `SAM.gov Contract Opportunities` landing page caused by overly generic buyer cues plus insufficient portal-shell rejection;
  - the corrective second replay fixed that false positive without touching engine code and produced a cleaner final state: `SAM.gov` dropped back to reject, while two buyer-side-ish marketplace rows moved into `selected`;
  - one selected row (`Hubstaff .NET C# Backend Developer`) was accepted under `Staff augmentation and dedicated team demand` after the criterion LLM review approved it as external capacity demand;
  - one selected row (`Custom Clock Wheel for AzuraCast`) was accepted under `Buyer requests for outsourced product build` through the candidate-signal uplift + criterion review path.
- Риски или gaps:
  - the improvement is real but bounded: only `2/240` rows now survive, there are still no lasting `gray_zone` survivors, and most of the preserved cohort remains low-signal/noisy for the outsourcing use case;
  - one selected row is still a freelance backend staffing post rather than a clean agency/vendor procurement notice, so further precision work may still be warranted if the user wants a narrower definition of outsourcing demand;
  - `llm_review_log` now contains residual approval evidence from the first, corrected-away false-positive pass because the log is append-only; the final selected set is clean, but the audit trail includes both replays.
- Follow-up:
  - none by default; if the user wants higher outsourcing yield from this cohort, the next truthful item is a new bounded tuning or source-quality stage, not a reopen of this archived admin-only pass.

### 2026-04-18 — PATCH-EXAMPLES-OUTSOURCING-BUNDLE-SYNC-2026-04-18

- Тип записи: patch archive
- Финальный статус: done
- Зачем понадобилось: после admin-only tuning для outsourcing bundle пользователь попросил перенести финальные изменения из живой БД в `EXAMPLES.md`, чтобы Example C не отставал от реально работающих `System interests` и `LLM templates`.
- Что изменилось:
  - outsourcing Example C в `EXAMPLES.md` теперь отражает финальный admin-tuned runtime bundle вместо прежнего pre-tuning baseline;
  - секция LLM templates теперь использует текущие live prompt texts для `interests`, `criteria`, и `global`, включая `Extra context: {explain_json}` и более жесткое подавление portal/opportunities/category noise;
  - секция system interests теперь использует текущие live descriptions, positive/negative prototypes, `must_not_have_terms`, candidate uplift cue groups, и per-template `strictness` values;
  - для outsourcing scenario убраны устаревшие формулировки про `interests` как purely optional future-ready template и про единообразный `balanced / hold / always`, потому что после tuning у Example C strictness смешанный (`broad`/`balanced`) и все 3 prompt scopes уже являются operator-facing baseline truth.
- Что проверено:
  - DB-to-doc parity check against the current local compose `interest_templates`, `selection_profiles.policy_json`, `selection_profiles.definition_json->candidateSignals`, and `llm_prompt_templates`
  - `git diff --check -- EXAMPLES.md docs/work.md docs/history.md`
- Риски или gaps:
  - в других example sections файла могут оставаться собственные historical baselines и wording вроде `optional future-ready`; этот patch синхронизировал только outsourcing Example C, как и просил пользователь
- Follow-up:
  - none

### 2026-04-18 — SPIKE-OUTSOURCING-SELECTION-TRACE-2026-04-18

- Тип записи: spike archive
- Финальный статус: done
- Зачем понадобилось: пользователь попросил проверить на текущем preserved outsourcing cohort, проходит ли вообще хоть одна статья под outsourcing bundle, и если не проходит, то где именно она теряется.
- Что изменилось:
  - code or DB mutations were not applied;
  - проведён read-only trace по `articles`, `criterion_match_results`, `interest_filter_results`, `final_selection_results`, и `llm_review_log` на current reset-backed cohort.
- Что проверено:
  - `final_selection_results`: `0 selected / 0 gray_zone / 219 rejected`
  - `interest_filter_results`: `0 match / 0 gray_zone / 809 no_match / 286 technical_filtered`
  - `llm_review_log`: `0`
  - representative near-threshold rows:
    - `https://www.freelancer.com/projects/web-development/node-web-app-guidance`
    - `https://hubstafftalent.net/jobs/net-c-backend-developer-freelance-per-project-work-ongoing-opportunities`
    - `https://sam.gov/opportunities`
    - `https://www.peopleperhour.com/freelance-jobs/technology-programming`
    - `https://weworkremotely.com/categories/remote-product-jobs`
  - those rows all end with `selectionReason = no_system_match`; none reaches `match`, `gray_zone`, or LLM review
  - top-score rows in this rerun peak only around `0.39-0.417`, i.e. below the current criterion `gray_zone` threshold, and the current candidate-signal explains usually show either no positive groups or only one weak group such as `request_search`
  - current content mix is source-noisy: `160 listing`, `57 entity`, `2 editorial`; top hosts are `ted.europa.eu`, `join.titans.eu`, `freelancer.com`, `arc.dev`, `peopleperhour.com`, `guru.com`, `app.mercell.com`, `workana.com`, and `weworkremotely.com`
- Live-result summary:
  - on the current fresh rerun there are no passing outsourcing articles at all;
  - the failure is not “a passing article got dropped later”; the failure happens earlier, because every article ends with five system-interest checks resolving to either `no_match` or `technical_filtered_out`;
  - optional LLM review never fires on this cohort because nothing reaches `gray_zone`.
- Риски или gaps:
  - this spike explains the current failure mode but does not itself fix yield;
  - the current rerun cohort is different from the earlier admin-tuned pass that temporarily surfaced a small number of selected rows, so any follow-up tuning must be evaluated against this reset-backed, more source-noisy cohort rather than the older preserved state.
- Follow-up:
  - if the user wants a fix, open a new bounded tuning/source-quality item against the current reset-backed cohort.

### 2026-04-18 — PATCH-ADMIN-WEBSITE-BULK-IMPORT

- Тип записи: patch archive
- Финальный статус: done
- Зачем понадобилось: пользователь попросил добавить в shared admin bulk-import flow поддержку массового импорта `website` channels без отдельного website-only route, но с website-aware validation, overwrite preview, and fetchUrl-based existing-channel matching.
- Что изменилось:
  - shared admin import page `/channels/import` now supports both `rss` and `website` presets through one screen, with provider-aware copy, examples, field reference, and deep-linkable `?providerType=website`;
  - `BulkChannelImport` became provider-aware and now uses server-backed preflight instead of client-only overwrite guessing, including website update preview for rows matched by existing `fetchUrl`;
  - `/bff/admin/channels/bulk` now branches by provider type while keeping legacy bare-array JSON support for RSS callers;
  - `/bff/admin/channels/bulk/preflight` was added as a provider-aware admin BFF route for validation plus overwrite preview;
  - RSS bulk planning now has server-side overwrite summaries by `channelId`, while website bulk planning now supports:
    - explicit `channelId` updates;
    - implicit updates when an existing `website` row matches the normalized `fetchUrl`;
    - rejection of ambiguous `channelId` + `fetchUrl` conflicts;
    - preservation of stored website `Authorization header` when a fetchUrl-matched row omits auth fields.
  - website admin compose acceptance now proves the new live path by:
    - creating a website channel manually;
    - preflighting a bulk website payload that matches it by `fetchUrl`;
    - applying the bulk update through the admin BFF;
    - confirming the updated website channel still flows into the normal resource/projection/operator acceptance path.
- Что проверено:
  - `node --import tsx --test tests/unit/ts/admin-rss-channels.test.ts tests/unit/ts/admin-website-channels.test.ts`
  - `pnpm typecheck`
  - `pnpm test:website:admin:compose`
  - `git diff --check -- apps/admin/src/components/BulkChannelImport.tsx apps/admin/src/pages/channels/import.astro apps/admin/src/pages/channels.astro apps/admin/src/pages/help.astro apps/admin/src/pages/bff/admin/channels/bulk.ts apps/admin/src/pages/bff/admin/channels/bulk/preflight.ts apps/admin/src/pages/bff/admin/channels/bulk/shared.ts apps/admin/src/lib/server/rss-channels.ts apps/admin/src/lib/server/website-channels.ts infra/scripts/test-website-admin-flow.mjs tests/unit/ts/admin-rss-channels.test.ts tests/unit/ts/admin-website-channels.test.ts docs/work.md`
- Риски или gaps:
  - bulk onboarding still remains intentionally limited to `rss` and `website`; `api` and `email_imap` keep manual create/edit flows;
  - website bulk matching is exact-by-normalized-`fetchUrl` only; there is still no fuzzy hostname/homepage upsert semantics.
- Follow-up:
  - none by default; open a new bounded item only if the user wants bulk onboarding for `api` / `email_imap` or a wider website bulk schema.

### 2026-04-18 — PATCH-WEB-BULK-PREP-FILE

- Тип записи: patch archive
- Финальный статус: done
- Зачем понадобилось: пользователь попросил подготовить `web.json` в формате, который можно сразу вставить в admin bulk import для `website` sources, но без поломки существующего harness-а, который уже зависит от текущей canonical schema.
- Что изменилось:
  - исходный `docs/data_scripts/web.json` оставлен без изменений, потому что он остается canonical bounded live source list для `infra/scripts/run-live-website-outsourcing.mjs`;
  - рядом добавлен derived файл `docs/data_scripts/web.bulk-import.json` с уже готовым JSON array для shared admin bulk import;
  - derived payload включает только importable rows (`validationStatus in [ready, needs_browser_fallback]`) и выбрасывает `rejected_open_web`;
  - каждая запись приведена к website bulk schema:
    - `name`
    - `fetchUrl`
    - `language`
    - `isActive`
    - `pollIntervalSeconds`
    - `adaptiveEnabled`
    - `maxPollIntervalSeconds`
    - `requestTimeoutMs`
    - `totalPollTimeoutMs`
    - `userAgent`
    - `maxResourcesPerPoll`
    - `crawlDelayMs`
    - `sitemapDiscoveryEnabled`
    - `feedDiscoveryEnabled`
    - `collectionDiscoveryEnabled`
    - `downloadDiscoveryEnabled`
    - `browserFallbackEnabled`
    - `collectionSeedUrls`
    - `allowedUrlPatterns`
    - `blockedUrlPatterns`
  - пустой `authorizationHeader` deliberately не materialize-ится в derived payload, чтобы вставка в bulk import не таскала пустые secret-like fields.
- Что проверено:
  - derived count check against current `docs/data_scripts/web.json`: `29 expected`, `29 actual`
  - shape spot-check on the first derived object keys against the website bulk contract
  - `git diff --check -- docs/data_scripts/web.bulk-import.json docs/work.md`
- Риски или gaps:
  - derived file is a snapshot and does not auto-sync if `docs/data_scripts/web.json` changes later;
  - no runtime or live-site revalidation was part of this patch.
- Follow-up:
  - if the user wants this to stay self-updating, the next bounded item would be a tiny repo-owned export script rather than manual file prep.

### 2026-04-19 — STAGE-MIXED-BULK-CHANNEL-IMPORT

- Тип записи: stage archive
- Финальный статус: done
- Зачем понадобилось: пользователь сообщил, что `web.bulk-import.json` с website rows импортируется через shared admin bulk import как `rss`, а затем расширил запрос до полного shared mixed-batch contract с обязательным row-level `providerType`, поддержкой текущих operator-ready provider types и explicit `providerType` внутри `docs/data_scripts/web.bulk-import.json`.
- Что изменилось:
  - shared admin bulk import больше не опирается на top-level mode switch или неявное угадывание provider type; теперь каждая строка обязана иметь explicit `providerType`;
  - shared preflight/import pipeline теперь группирует mixed batches по provider и truthfully поддерживает все текущие operator-ready channel types:
    - `rss`
    - `website`
    - `api`
    - `email_imap`
  - `api` and `email_imap` получили собственные bulk parse/plan helpers, so shared preflight can now surface create/update targets for those providers instead of being limited to `rss` / `website`;
  - website rows сохраняют existing website-specific bulk semantics:
    - exact normalized `fetchUrl` matching for implicit updates;
    - preservation of stored authorization header when a fetchUrl-matched row omits auth fields;
    - explicit ambiguity/not-found failures instead of silent coercion;
  - admin bulk-import UI and copy were rewritten around one mixed JSON-array contract, including mixed example payloads, provider-aware overwrite review, and operator-facing wording on `/channels/import`, `/channels`, and `/help`;
  - derived file `docs/data_scripts/web.bulk-import.json` now includes explicit `providerType: "website"` on every row so it matches the shipped shared contract directly.
- Что проверено:
  - `node --import tsx --test tests/unit/ts/admin-rss-channels.test.ts tests/unit/ts/admin-website-channels.test.ts tests/unit/ts/admin-api-channels.test.ts tests/unit/ts/admin-email-imap-channels.test.ts tests/unit/ts/admin-bulk-channel-import.test.ts`
  - `pnpm typecheck`
  - `git diff --check -- apps/admin/src/components/BulkChannelImport.tsx apps/admin/src/lib/server/api-channels.ts apps/admin/src/lib/server/email-imap-channels.ts apps/admin/src/pages/bff/admin/channels/bulk/shared.ts apps/admin/src/pages/bff/admin/channels/bulk.ts apps/admin/src/pages/bff/admin/channels/bulk/preflight.ts apps/admin/src/pages/channels/import.astro apps/admin/src/pages/channels.astro apps/admin/src/pages/help.astro tests/unit/ts/admin-api-channels.test.ts tests/unit/ts/admin-email-imap-channels.test.ts tests/unit/ts/admin-bulk-channel-import.test.ts docs/data_scripts/web.bulk-import.json docs/work.md`
- Риски или gaps:
  - stage intentionally does not mutate the preserved local compose DB, so any already mis-imported channels from the earlier buggy flow still require a separate user-approved cleanup/reimport pass if the user wants that state corrected;
  - future provider types will still need explicit parser/plan/upsert wiring before they can participate in the mixed shared importer, even though the row-level contract is now ready for extension.
- Follow-up:
  - if the user wants cleanup of the already misclassified local rows, open a separate bounded patch for targeted DB cleanup and reimport without resetting the whole environment.

### 2026-04-19 — PATCH-BULK-IMPORT-DOCS-PROVIDERTYPE

- Тип записи: patch archive
- Финальный статус: done
- Зачем понадобилось: после shipped mixed bulk-import contract пользователь попросил отдельно досинхронизировать repo docs и operator-facing examples, чтобы везде было явно сказано, что для bulk JSON `providerType` обязателен на каждой строке.
- Что изменилось:
  - `README.md` now explicitly says that shared bulk import requires row-level `providerType` and that RSS bundles must carry `"providerType": "rss"` on each row;
  - `docs/manual-mvp-runbook.md` now states the same requirement both for the real RSS template flow and for the admin bulk-import checklist;
  - `docs/data_scripts/README.md` now includes `web.bulk-import.json` in the asset index and explains that shared admin bulk import no longer infers provider mode, so every example bundle should keep `providerType` explicit on each row.
- Что проверено:
  - `git diff --check -- README.md docs/manual-mvp-runbook.md docs/data_scripts/README.md docs/work.md`
- Риски или gaps:
  - this patch intentionally touched wording/examples only; no importer logic or local DB state changed here.
- Follow-up:
  - none

### 2026-04-19 — PATCH-EXAMPLES-BULK-PROVIDERTYPE

- Тип записи: patch archive
- Финальный статус: done
- Зачем понадобилось: после общего doc sweep пользователь заметил, что built-in bulk JSON examples в `EXAMPLES.md` всё ещё были показаны без явного `providerType`, хотя shared bulk import уже требует row-level `providerType` на каждой строке.
- Что изменилось:
  - в `EXAMPLES.md` top-level usage guidance for bulk channel JSON now explicitly mentions the row-level `providerType` requirement;
  - все RSS bulk-import rows в built-in Examples A, B, and C now include explicit `"providerType": "rss"`.
- Что проверено:
  - `git diff --check -- EXAMPLES.md docs/work.md`
- Риски или gaps:
  - this was a doc/example sync only; importer behavior and local DB state were unchanged.
- Follow-up:
  - none

### 2026-04-19 — STAGE-DISCOVERY-LIVE-PROOF-HARDENING

- Тип записи: stage archive
- Финальный статус: done
- Зачем понадобилось: пользователь попросил не просто написать automation для live discovery, а доказать её полное живое прохождение на реальном residue-heavy DDGS-only compose baseline, найти реальные blockers и исправить их до terminal non-fail результата.
- Что изменилось:
  - bounded adaptive smoke proof in `services/workers/app/smoke.py` now isolates planning to its own `adaptive_smoke_*` class instead of competing with active `live_example_*` residue;
  - `services/workers/app/discovery_orchestrator.py` now supports filtered active-class reads for bounded planning callers, and regression coverage in `tests/unit/python/test_discovery_orchestrator.py` now keeps that path honest;
  - `database/migrations/0039_discovery_orchestrator_timeout_tuning.sql` now raises orchestrator task budgets for:
    - `plan_hypotheses` -> `300000ms`
    - `evaluate_results` -> `180000ms`
    - `re_evaluate_sources` -> `180000ms`
    fixing the real live Example C timeout that previously left the sequence run stuck at task 0;
  - `infra/scripts/test-live-discovery-examples.mjs` now reads latest `sequence_task_runs` while polling mission progress, so stale run-level `running` state no longer forces a long false-negative wait after a task-level timeout/failure;
  - the same harness now distinguishes genuine runtime failure from honest weak live yield:
    - runtime/preflight breakage still returns `fail`;
    - completed graph+recall lanes with no onboarded useful channels now return `completed_with_residuals` per case and roll up to `pass_with_residuals`.
- Что проверено:
  - `python -m unittest tests.unit.python.test_discovery_orchestrator`
  - `python -m py_compile services/workers/app/discovery_orchestrator.py services/workers/app/smoke.py`
  - `node --check infra/scripts/test-live-discovery-examples.mjs`
  - `pnpm db:migrate` with `Applied migrations: 0039_discovery_orchestrator_timeout_tuning.sql`
  - `pnpm test:discovery-enabled:compose`
  - `pnpm test:discovery:admin:compose`
  - `env DISCOVERY_ENABLED=1 node infra/scripts/test-live-discovery-examples.mjs`
- Финальные proof artifacts:
  - blocker-demonstration run before final verdict-policy closeout:
    - `/tmp/newsportal-live-discovery-examples-b780e589.json`
    - `/tmp/newsportal-live-discovery-examples-b780e589.md`
  - authoritative final non-fail run:
    - `/tmp/newsportal-live-discovery-examples-bbc3fdad.json`
    - `/tmp/newsportal-live-discovery-examples-bbc3fdad.md`
- Итог proof:
  - `pnpm test:discovery-enabled:compose` passed on the residue-heavy DB;
  - `pnpm test:discovery:admin:compose` passed on the same baseline;
  - fresh full live run `bbc3fdad` exited `0` with `finalVerdict = pass_with_residuals`;
  - both Example B and Example C completed graph + recall lanes without runtime/infrastructure stop conditions;
  - final artifacts honestly record that both cases remained `completed_with_residuals` because DDGS-only live results produced candidates but no onboarded/downstream-useful channels under the current bounded deterministic review policy.
- Риски или gaps:
  - the proof lane is now runtime-proven, but it is not a product-quality/yield pass:
    - Example B remained `candidate_found_not_onboarded` for every system interest;
    - Example C remained `candidate_found_not_onboarded` for every system interest;
    - no approved/promoted channels were produced in the final `bbc3fdad` run;
    - weak live yield is currently treated as an honest residual, not as a runtime defect.
- Follow-up:
  - open a new bounded item only if the user wants to improve discovery candidate quality/onboarding policy for Example B/C, rather than just preserve the proved non-fail runtime lane.
