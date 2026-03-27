# Work

Это live execution document для репозитория.

Используй его для:

- short current memory;
- capability planning и stage breakdown;
- active work registry;
- active execution state;
- worktree coherence;
- test artifacts и cleanup state;
- known gaps;
- next recommended action;
- handoff state.

Не используй его как длинный журнал истории.
Durable completed detail переносится в `docs/history.md`.

## Current mode

- Operating mode: normal
- Why now: the user requested the admin follow-up so operator-visible counters and async job/status surfaces in `apps/admin` also refresh without manual full-page reloads.

## Current memory

- Runtime core инициализирован; ordinary implementation work разрешен.
- `docs/blueprint.md` остается главным architectural source of truth для system boundaries и service ownership.
- `docs/contracts/test-access-and-fixtures.md` обязателен whenever work touches local PostgreSQL/Redis-backed proof or other persistent backend fixtures; even when compose teardown is clean, external identities and other out-of-band residue must still be tracked explicitly.
- `llm_review_log.cost_estimate_usd` is a local worker-side estimate, not provider billing truth: the worker reads Gemini `usageMetadata`, computes USD before insert, and the API/admin surfaces only sum the persisted estimate rows.
- The new patch must let env override the token tariff so alternate `GEMINI_MODEL` values stop silently inheriting the built-in `gemini-2.0-flash` price card; on 2026-03-26 the official Gemini Developer API paid-tier price for `gemini-2.0-flash` remains USD `0.10` input and USD `0.40` output per 1M tokens.
- Astro browser/session mutation flows живут в `/bff/*` и `/admin/bff/*`; public `/api/*` остается за Python API.
- `pnpm dev:mvp:internal` остается canonical compose baseline; root-level QA gates — `pnpm lint`, `pnpm unit_tests`, `pnpm integration_tests`.
- RSS-first acceptance scope не расширился: `website`, `api` и `email_imap` ingest по-прежнему вне доказанного internal MVP gate.
- Admin reindex/backfill semantics уже truthfully зафиксированы: rebuild refreshes derived indices, backfill repairs historical matches without retro notifications.
- Active admin `interest_templates` now materialize into real `criteria` rows via `source_interest_template_id`, and migration `0007_interest_template_matching_sync.sql` backfilled the current runtime so existing templates started participating in matching without manual DB edits.
- `system_feed_results` now exists as a durable article-level read model: criteria worker writes the preliminary system gate there, criterion-scope LLM review recomputes it, and both compose worker smoke and historical-backfill smoke proved the row stays consistent with criterion outcomes.
- Fresh ingest now routes sequentially: `article.clustered -> q.match.criteria -> system_feed_results -> article.criteria.matched -> q.match.interests`, while `process_match_interests` also hard-checks the stored gate before matching.
- Historical backfill now mirrors the same order: replay criteria, replay only criterion-scope gray-zone LLM, and rematch `user_interests` only for articles that remained eligible in `system_feed_results`.
- Baseline runtime no longer does interest-scope gray-zone LLM review: gray-zone user-interest matches are truthfully suppressed with `interest_gray_zone_llm_disabled`, and backfill reports `interestLlmReviews = 0`.
- Public/system feed surfaces now derive eligibility from `system_feed_results`, so users without `user_interests` still receive the system-selected media flow even when personalization rows are absent.
- Historical backfill progress remains snapshot-based through `reindex_job_targets`; completed replay rows still need an explicit retention/cleanup policy.
- Real `user_interests` already have one canonical server contract plus packaged admin UX; the system-first feed now sits above that personalization layer instead of beside it.
- The latest compose-backed acceptance and system-first proof runs both ended with `docker compose down -v --remove-orphans`; tracked residue is limited to dev Firebase admin aliases created for proof runs.
- New investigation lane must reconcile four live truths on the same dataset before any fix is trusted: `articles`, `system_feed_results`, reindex job target snapshots/progress, and the dashboard/API queries that surface those numbers.
- Live diagnosis now points at one concrete bug in the system-first lane: criterion lexical scoring is effectively disabled because stored whitespace-separated `lexical_query` values are evaluated with `plainto_tsquery`, which behaves like an all-terms requirement and yields zero lexical hits on the current dataset.
- The latest visible reindex card (`interest_centroids backfill 247/247`) is a historical snapshot from 2026-03-26 08:54 UTC, not current total article volume; current PostgreSQL state has already moved on to `4024` `system_feed_results` rows.
- Runtime replay on 2026-03-26 11:14 UTC confirmed the lexical fix is live: the new backfill froze `3990` targets, completed `3990/3990`, and produced `criterionLlmReviews = 116` instead of zero.
- The earlier empty-feed state was not product truth: first the worker missed `GEMINI_API_KEY` because of a non-canonical restart path, and then the corrected key path exposed a stale local `.env.dev` Gemini model value; both local runtime drifts are now fixed.
- Canonical worker restart with `--env-file .env.dev` proved the key path is healthy, and a one-off live probe confirmed the remaining failure was config-only: `gemini-2.0-flash` works with the same key and the same worker client, while the old local `.env.dev` value `gemini-3.0-flash-preview` produced `HTTP Error 404: Not Found`.
- Local `.env.dev` now uses `gemini-2.0-flash`; after the restart path briefly recreated `postgres`/`redis`, `relay` was brought back up, approved backfill job `f11923b8-01d4-41b3-8d95-e0f108d7ad5b` completed `4024/4024` at 2026-03-26 11:40 UTC, and final live state shows `/feed.total = 62`, `dashboard/summary.active_news = 62`, `system_feed_results.eligible = 62`, and new `approve`/`reject` LLM outcomes without `HTTP 404`.
- `/` now remains the system feed while `/matches` serves deduped per-user matches from `interest_match_results`, restricted to `system_feed_results.eligible_for_feed = true`.
- Successful user-interest compilation now auto-queues a scoped `repair` reindex job for the same `userId` + `interestId`, limited to system-feed-approved history and skipping retro notifications.
- Synthetic worker smoke compile paths opt out of that auto-repair via `skipAutoRepair`, so compose smoke proof stays focused on compile semantics instead of starting unrelated background replays.
- Criterion gray-zone reviews no longer deadlock on fresh stacks without an active `criteria` prompt template: the worker always dispatches `llm.review.requested`, and the review worker falls back to the default prompt/template lookup path.
- Web user settings, interests, notification channels, and other user-bound state all hang off PostgreSQL `user_id`; if web bootstrap creates a new anonymous Firebase subject, the app truthfully lands on a fresh local user with empty `user_profiles` and related rows.
- Web bootstrap now persists a browser-scoped Firebase refresh token and reuses it during `/bff/auth/bootstrap`, so the same device returns to the same anonymous/local user after logout/login while explicit sign-out still clears the active session cookie until the user starts a session again.
- Web live-update rollout is implemented in `apps/web` and now mainly awaits manual browser proof for its hydrated UX paths.
- Admin live-update rollout is now implemented in `apps/admin`: `AdminShell` mounts a bounded same-origin polling coordinator, `dashboard`/`reindex`/`observability` counters refresh live, and selected-user `/user-interests` compile status binds update inline; automated proof is green, while manual browser proof remains open.

## Capability planning

### Active capabilities

| Capability ID | Title | Status | Full completion condition | Planned stages | Current next stage | Notes |
|---|---|---|---|---|---|---|
| C-MVP-BUGFIXES | Minimal working MVP bugfix lane | active | User-confirmed blocker bugs for the minimal working MVP are fixed without regressing the current RSS-first acceptance flow | `P-MVP-BUGFIX-1`, `P-MVP-BUGFIX-2`, `SW-UI-BUILD-HARDENING-1`, `SP-MVP-BUGFIX-3`, `P-MVP-BUGFIX-3`, `P-MVP-BUGFIX-4`, `P-MVP-BUGFIX-5`, `P-MVP-BUGFIX-6`, follow-up product/config item TBD | `follow-up product/config item TBD` | Feed recovery and same-browser auth persistence are proven; capability now waits on manual validation/archive-sync decisions for the latest done bugfixes |
| C-WEB-LIVE-UPDATES | Web user-state live updates | active | Authenticated `apps/web` surfaces update truthfully after background user work and other user-relevant state changes via same-origin polling, with compile/repair progress surfaced inline where appropriate and refresh prompts/toasts everywhere else, without introducing realtime transport or admin-scope changes | `S-WEB-LIVE-UPDATES-1`, follow-up richer realtime/admin stage TBD | `S-WEB-LIVE-UPDATES-1` | First rollout stays inside `apps/web` and its BFF read paths; admin live updates remain explicit follow-up work |
| C-ADMIN-LIVE-UPDATES | Admin counters and job-status live updates | active | Authenticated `apps/admin` surfaces refresh operator-visible counters and asynchronous job/status indicators truthfully via same-origin polling, without live-streaming full tables or introducing realtime transport or new public `/api/*` contracts | `SP-ADMIN-LIVE-UPDATES-1`, `S-ADMIN-LIVE-UPDATES-1`, optional follow-up table-notice stage TBD | `S-ADMIN-LIVE-UPDATES-1` | V1 should target dashboard KPI cards, reindex progress/status, observability summary cards, and selected-user compile/repair state only; broad admin list realtime stays out of scope |
| C-FETCHER-DUPLICATE-PREFLIGHT | Fetcher duplicate preflight | blocked | Fetcher batch precheck реализован и доказан unit + RSS smoke + multi-RSS compose proof | `S-FETCHER-DUPLICATE-PREFLIGHT-1`, `S-FETCHER-DUPLICATE-PREFLIGHT-2` | `S-FETCHER-DUPLICATE-PREFLIGHT-1` | Background work; stays isolated until explicitly resumed |

Rule: если capability active или ready и у нее нет truthful next stage, следующую stage нужно создать до implementation.
Rule: dependency truth и mixed worktree должны быть явно представлены, а не скрыты внутри dirty tree.

## Active execution state

### Primary active item

- ID: `S-ADMIN-LIVE-UPDATES-1`
- Parent capability: `C-ADMIN-LIVE-UPDATES`
- Why this is the primary active work: the user explicitly asked to proceed with the bounded admin live-update rollout, so this stage now owns polling-based freshness for admin counters and async job/status surfaces.

### Secondary active item

- ID: `S-WEB-LIVE-UPDATES-1`
- Why it exists: the earlier `apps/web` live-update rollout is already implemented but still has an open manual-browser proof layer, so it remains explicit while the new admin implementation stage advances in parallel only through shared runtime-doc truth.
- Allowed overlap paths: `docs/work.md`, `docs/blueprint.md`
- Exit condition for returning to one primary item: admin implementation reaches its next sync point and the web stage is either manually verified or intentionally left as explicit residual follow-up.

### Worktree coherence

- Worktree status: the tree is still mixed from earlier web/admin/api/worker/doc work; the new admin live-update stage will add bounded `apps/admin` plus TS/runtime-doc edits on top of that existing dirt while preserving the already-dirty web rollout files.
- Primary item alignment note: `S-ADMIN-LIVE-UPDATES-1` must stay inside `apps/admin`, targeted TS coverage, and required runtime-doc sync; it must not implicitly reopen public `/api/*`, worker behavior, or full-table admin realtime beyond read-only integration with already persisted state.
- Mixed-change warning, if any: yes — multiple unrelated files are already dirty, including `docs/work.md`, so every edit for this patch must remain additive and preserve pre-existing user or prior-agent changes.
- Required action before more implementation, if any: if the admin rollout needs new public `/api/*` contracts, WebSocket/SSE transport, or live table diffing for articles/channels/clusters/templates, stop and split that broader behavior into a follow-up stage instead of stretching this bounded counters/status slice.

### Active risks

- Operators can still confuse template-backed system matching with per-user interest filtering: active admin templates now feed `criteria`, but `user_interests` remain a separate runtime layer with different data ownership.
- User-facing surfaces are now deduped by canonical article family, but the underlying duplicate `articles` rows still exist in PostgreSQL and will remain visible to raw/admin/debug surfaces until a separate ingest/data-repair item handles them.
- Fixing lexical scoring can materially increase criterion `gray_zone` volume, so the patch must preserve truthful criteria-scope LLM behavior and not silently change interest-scope review semantics.
- Human-facing validation is still useful because the live blocker is fixed but the recovered feed mix may surface product-quality questions separate from the runtime bug.
- The new admin manage page must stay explicit about on-behalf semantics: future work cannot blur per-user `user_interests` into template-backed system criteria or hide which user is being edited.
- Reindex jobs now leave durable `reindex_job_targets` rows in PostgreSQL for snapshot-safe replay; retention/cleanup policy for completed jobs is still implicit and could become operational drift if ignored.
- Dev Firebase still contains allowlisted proof-only admin aliases; a future cleanup item should remove them explicitly rather than assuming compose teardown handled external identity residue.
- Env-driven tariffs can silently understate or overstate observability spend if parsing or fallback behavior is ambiguous, so the patch must keep invalid env handling explicit and preserve a truthful default for `gemini-2.0-flash`.
- Auth/session bridge changes can easily break the user command/read path, so the fix must preserve explicit sign-out semantics while still letting `/bff/auth/bootstrap` resume the same browser-scoped anonymous identity on the next sign-in.
- Persisting a browser-scoped refresh token improves continuity for anonymous users, but it also means the shared-device behavior must remain an explicit product tradeoff rather than an accidental side effect.
- Polling can drift from page-local SSR semantics if totals/revisions are computed differently from the existing admin page queries, so the new admin snapshot endpoint must reuse current read truth instead of inventing parallel counters.
- Admin pages can easily become internally inconsistent if counters or status chips update while paginated tables silently reorder underneath, so v1 must update only card/status surfaces and otherwise use refresh notices instead of live-diffing full tables.
- Aggressive polling across every authenticated page could create noisy BFF traffic, so the coordinator must pause on hidden tabs, switch to fast mode only while work is pending, and back off on failures.

### Known gaps

- Proof gap: Python services по-прежнему не имеют repo-level typecheck gate, сопоставимого с `pnpm typecheck`.
- Proof gap: `pnpm unit_tests` покрывает только deterministic pure logic; DB/Redis/queue/network boundaries доказываются integration/smoke path.
- Proof gap: multi-channel RSS proofs compose-backed и не имеют lightweight host-only variant.
- Proof gap: there is no operator-facing proof/report that explains how many historical articles were replayed, how many produced gray-zone matches, or whether compiled interests existed at run time.
- Proof gap: the live post-reload Gemini smoke used the real worker container and resolved `price_card_source = env_override`, but provider `usageMetadata` still came back unavailable in that probe, so this patch does not yet prove a non-null fresh `cost_estimate_usd` written through the full DB review path.
- Product gap: users without `user_interests` now get the system-selected feed, but baseline notifications still remain a personalization-lane concern rather than a separate system-feed alert contract.

### Next recommended action

- Run manual browser proof for `S-ADMIN-LIVE-UPDATES-1`: verify dashboard KPI cards update while background work runs, reindex job status/progress changes inline without reload, observability summary cards refresh while tables only ask for page refresh, and selected-user `/user-interests` updates compile badges/counts in place.

### Archive sync status

- Completed item or capability awaiting archive sync:
  `P-MVP-BUGFIX-6`, `P-FEED-DUPLICATE-1`, `P-LLM-COST-ENV-1`
- Why it is still live, if applicable:
  the latest auth/session bugfix and the earlier feed/cost patches all completed in this sync cycle and still need durable archival detail or an explicit follow-up decision on their residual gaps.
- Archive action required next:
  archive `P-MVP-BUGFIX-6`, `P-FEED-DUPLICATE-1`, and `P-LLM-COST-ENV-1` unless the user asks for a deeper follow-up on browser-scoped auth persistence, duplicate-row repair, or fresh DB-written `llm_review_log.cost_estimate_usd` rows.

### Test artifacts and cleanup state

- Users created:
  allowlisted Firebase admin alias `yluchaninov+internal-admin-f77f2941@gmail.com` created for smoke run `f77f2941`; no automated cleanup ran, so the identity remains as local/dev Firebase residue.
  allowlisted Firebase admin alias `yluchaninov+internal-admin-682c854e@gmail.com` created during the final `integration_tests` proof run; compose teardown cleaned local services, but the external dev Firebase identity remains until explicit cleanup.
- Subscriptions or device registrations:
  none for this patch.
- Tokens / keys / credentials issued:
  no persistent tokens were retained; only ephemeral session cookies were used during the smoke run.
- Seeded or imported data:
  none from the latest compose-backed proof run; both `pnpm integration_tests` and the final system-first compose proofs finished with `docker compose down -v --remove-orphans`, so local PostgreSQL/Redis/Mailpit state from those runs was removed.
- Cleanup status:
  latest compose-backed runtime artifacts were torn down cleanly; only the two Firebase admin aliases remain as tracked external residue pending an explicit cleanup item.

## Handoff state

- Current item status:
  `S-ADMIN-LIVE-UPDATES-1` is `active`: `apps/admin` now has a shell-mounted same-origin live-update coordinator plus `/bff/admin/live-updates`, live KPI/summary islands for `/` and `/observability`, inline reindex status/progress updates on `/reindex`, and selected-user compile-status bindings on `/user-interests`; automated proof passed (`pnpm --filter @newsportal/admin typecheck`, targeted TS admin live-update tests, full `pnpm unit_tests`, and `git diff --check -- apps/admin/src docs/work.md tests/unit/ts`), but manual browser validation is still open before the stage can close.
  `S-WEB-LIVE-UPDATES-1` is `active`: `apps/web` now has a shell-mounted same-origin live-update coordinator, compact `/bff/live-updates` snapshot endpoint, live `/interests` and `/settings` islands, and refresh-notice headers for `/`, `/matches`, and `/notifications`; automated proof passed (`pnpm --filter @newsportal/web typecheck`, targeted TS tests, full `pnpm unit_tests`), but manual browser validation is still open before the stage can close.
  `P-MVP-BUGFIX-6` is `done`; web bootstrap now reuses a browser-scoped Firebase refresh token, so logout/login on the same browser returns to the same anonymous/local user instead of minting a fresh `user_id` with empty `user_profiles`; targeted TS auth tests, redirect regression tests, and web typecheck all passed, while a live browser click-through remains an optional follow-up rather than open coding work.
  `P-FEED-DUPLICATE-1` is `done`; it proved the repeated article cards were not a frontend rendering bug but separate eligible article rows from the same canonical family, then updated the API read path so `/feed`, `/matches`, and `dashboard/summary.active_news` dedupe on canonical article families after the `api` runtime reload.
  `SP-MVP-BUGFIX-3` is `done`; it proved that the 2026-03-26 08:54 UTC reindex card reflects a frozen 247-article snapshot, while the live blocker is that all current `system_feed_results` rows are `filtered_out` and worker lexical scoring never contributes.
  `P-MVP-BUGFIX-3` is `done`; it changed worker lexical-query semantics from all-terms `plainto_tsquery` behavior to explicit OR-style `to_tsquery` behavior for the already stored whitespace lexical bags, added targeted unit coverage, and intentionally stopped short of a live replay because that follow-up may call the active criteria LLM prompt on many articles.
  `P-MVP-BUGFIX-4` is `done`; it rebuilt/restarted the worker, queued an approved `interest_centroids` backfill job, and proved on the live local dataset that lexical scoring now reaches criteria LLM review, but the runtime still keeps the feed empty because `GEMINI_API_KEY` is missing and all `124` new criteria reviews ended as `uncertain`.
  `P-MVP-BUGFIX-5` is `blocked`; its proof is complete and the user-visible blocker is fixed, but the user explicitly reprioritized an env-priced observability patch before manual validation/archive sync.
  `P-LLM-COST-ENV-1` is `done`; it added `LLM_INPUT_COST_PER_MILLION_USD` and `LLM_OUTPUT_COST_PER_MILLION_USD`, synced `.env.example`/`.env.dev` to the 2026-03-26 official `gemini-2.0-flash` price, reloaded the worker, and proved the reloaded runtime resolves `price_card_source = env_override` with the expected deterministic estimate.
  `S-PERSONALIZED-MATCHES-1` is `done`; it shipped the separate `/matches` read surface, paginated `/users/{user_id}/matches` API + SDK support, post-create/update compile messaging, scoped historical auto-repair after compile, smoke-only `skipAutoRepair`, and the missing gray-zone review dispatch fallback that fresh compose proof needed.
  `P-DOCS-SYSTEM-FIRST-SYNC-2` is `archived`.
  `P-DOCS-SYSTEM-FIRST-SYNC-1` is `archived`.
  `C-SYSTEM-FIRST-PERSONALIZATION` and its stages remain `archived`.
  `S-FETCHER-DUPLICATE-PREFLIGHT-1` remains the only explicit blocked background stage.
- What is already proven:
  the bounded admin live-update substrate is now live inside `apps/admin`: `AdminShell.astro` mounts a same-origin polling coordinator for opted-in admin pages, `/bff/admin/live-updates` serves page-scoped freshness snapshots, dashboard and observability summary cards update without full reload, reindex status/progress now refreshes inline, and selected-user `/user-interests` updates compile badges/counts via DOM-bound live status patches; `pnpm --filter @newsportal/admin typecheck`, `node --import tsx --test tests/unit/ts/admin-live-updates.test.ts`, full `pnpm unit_tests`, and `git diff --check -- apps/admin/src docs/work.md tests/unit/ts` all passed.
  the web live-update substrate is now live inside `apps/web`: `Shell.astro` mounts a same-origin polling coordinator for authenticated sessions, `/bff/live-updates` aggregates feed/match/notification totals plus interest/settings and repair-job freshness, `/interests` and `/settings` now update via client fetch + local state instead of hard reloads, and `/`, `/matches`, `/notifications` expose refresh notices keyed off the same snapshot channel; `pnpm --filter @newsportal/web typecheck`, targeted TS live-update tests, full TS unit tests, full Python unit tests, and `git diff --check -- apps/web/src docs/work.md tests/unit/ts` all passed.
  the new durable `system_feed_results` contract is live: migration `0009_system_feed_results.sql`, synced phase-4 DDL, criteria-worker maintenance, criterion-LLM recompute, targeted Python unit coverage, and compose worker smoke/backfill smoke all passed in this turn.
  the sequential runtime is now live and proven: queue routing changed to `article.clustered -> criteria` and `article.criteria.matched -> interests`, compose relay routing smoke passed, compose worker `cluster-match-notify` smoke passed, and compose worker `reindex-backfill` smoke passed with `criterionLlmReviews = 0` and `interestLlmReviews = 0`.
  public/system feed eligibility now comes from `system_feed_results`: `services/api/app/main.py` switched `/feed` and dashboard summary to the system gate, web/admin builds passed, and a DB-backed fallback proof confirmed that an article with `processing_state = clustered` and `system_feed_results.eligible_for_feed = true` appears in `/feed` without any personalization lane.
  the prior user-interest operator flow remains proven: canonical mutation helpers, packaged admin `/user-interests`, compile proof, fresh-ingest `interest_match`, and historical rematch without retro notification drift all stayed green while system-first routing moved ahead of personalization.
  user-facing docs are now aligned with that runtime truth: README/how-to-use/examples describe the sequential system-first order, README SQL examples expose `system_feed_results`, and the stale feed gate wording in `docs/blueprint.md` no longer points at `processing_state`.
  `HOW_TO_USE.md` and `EXAMPLES.md` now also match the live contract: they describe system-first filtering, distinguish `interest_templates` from real `user_interests`, treat `criteria`/`global` as the active baseline LLM scopes, and use current prompt placeholders.
  the personalized matches slice is now live and proven: `/users/{user_id}/matches` returns deduped system-feed-eligible personal matches, web `/matches` reuses feed cards/pagination, user/admin interest mutations announce background compile + sync, successful interest compilation auto-queues a scoped `repair`, and fresh compose acceptance now expects historical admin-managed interests to auto-sync before manual backfill.
- What is still unproven or blocked:
  `S-ADMIN-LIVE-UPDATES-1` still lacks manual browser proof for the new hydrated admin UX: no click-through has yet confirmed the live counter/status behavior on `/`, `/reindex`, `/observability`, and selected-user `/user-interests` under real background change.
  `S-WEB-LIVE-UPDATES-1` still lacks manual browser proof for the new hydrated UX: no click-through has yet confirmed that `/interests` and `/settings` stay on-page during mutation or that feed/matches/notifications surface the intended refresh notices/toasts under live data change.
  the post-reload live Gemini smoke did not return provider `usageMetadata`, so the patch stops short of proving a fresh non-null DB-written `cost_estimate_usd` row through the full review pipeline.
  no manual browser-click walkthrough was executed in this turn; runtime proof used HTTP/browser-style requests instead of a human-driven browser session.
  `website`, `api` и `email_imap` ingest остаются вне current RSS-first acceptance gate.
  Browser receipt для `web_push` по-прежнему manual-only.
- Scope or coordination warning for the next agent:
  do not reintroduce `processing_state` as the canonical public-feed gate now that runtime truth is article-level `system_feed_results`. Future work should open a new bounded item instead of implicitly reopening archived system-first, user-interest, or reindex lanes.

### Recently changed

- 2026-03-27 — `S-ADMIN-LIVE-UPDATES-1` reached automated-proof status: `apps/admin` now mounts a same-origin live-update coordinator plus `/bff/admin/live-updates`, dashboard and observability summary counters refresh live, `/reindex` updates status/progress inline, and selected-user `/user-interests` updates compile badges/counts in place; `pnpm --filter @newsportal/admin typecheck`, targeted TS admin live-update tests, full `pnpm unit_tests`, and `git diff --check -- apps/admin/src docs/work.md tests/unit/ts` all passed, while manual browser proof remains open.
- 2026-03-26 — `S-WEB-LIVE-UPDATES-1` reached automated-proof status: `apps/web` now mounts a same-origin live-update coordinator plus `/bff/live-updates`, `/interests` and `/settings` switched from hard reloads to fetch-driven local state, and `/`, `/matches`, `/notifications` now show polling-backed refresh notices/toasts; `pnpm --filter @newsportal/web typecheck`, targeted TS live-update tests, and full `pnpm unit_tests` all passed, while manual browser proof remains open.
- 2026-03-26 — `P-FEED-DUPLICATE-1` completed: user-facing API surfaces now rank and dedupe eligible articles by `coalesce(canonical_doc_id, doc_id)` instead of returning one card per duplicate copy; targeted Python tests passed, `api` was rebuilt/restarted, and live proof on the current dataset reconciled `39` raw eligible rows down to `30` visible canonical feed cards with matching dashboard summary.
- 2026-03-26 — `P-MVP-BUGFIX-6` completed: web auth bootstrap now stores and reuses a browser-scoped Firebase refresh token, so logout/login on the same browser returns to the same anonymous/local user instead of creating a fresh profile with empty settings; targeted TS auth tests, existing redirect regression tests, and `pnpm --filter @newsportal/web typecheck` all passed.
- 2026-03-26 — `S-PERSONALIZED-MATCHES-1` completed: API/web/admin/SDK now expose a separate `/matches` personalized surface, successful interest compile auto-queues scoped history repair for system-feed-approved articles, compose smoke compile uses `skipAutoRepair`, and fresh-stack gray-zone criteria now always dispatch LLM review even without an active template; `pnpm unit_tests` and `pnpm integration_tests` both passed.
- 2026-03-26 — `P-LLM-COST-ENV-1` completed: worker Gemini pricing now accepts `LLM_INPUT_COST_PER_MILLION_USD` / `LLM_OUTPUT_COST_PER_MILLION_USD`, `.env.example` and `.env.dev` were seeded with the official `gemini-2.0-flash` paid-tier values `0.10` / `0.40`, unit/syntax checks passed, and the reloaded worker reported `price_card_source = env_override` with the expected deterministic estimate `0.0003` for `1000` prompt + `500` completion tokens.
- 2026-03-26 — `P-MVP-BUGFIX-5` reached live-proof completion: local `.env.dev` was corrected from `gemini-3.0-flash-preview` to `gemini-2.0-flash`, `relay` was restarted after the compose recreate path, backfill job `f11923b8-01d4-41b3-8d95-e0f108d7ad5b` completed `4024/4024`, and final reconciliation recovered `/feed.total = 62`, `dashboard/summary.active_news = 62`, `system_feed_results.eligible = 62`, and `llm_review_log` decisions `approve/reject/uncertain` with no `HTTP 404`.
- 2026-03-26 — `P-DOCS-SYSTEM-FIRST-SYNC-2` archived after syncing `HOW_TO_USE.md` and `EXAMPLES.md` with the live system-first contract, including dashboard wording, template semantics, current LLM scopes, article-state explanations, and prompt placeholders.

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

## Compression checklist

When compressing context:

1. keep the active item accurate and schema-complete
2. keep active capability lines accurate and concise
3. preserve only current mode, current memory, active capabilities, active items, worktree coherence, active risks, known gaps, next recommended action, test artifacts, handoff state, and concise recent changes
4. move durable completed detail into `docs/history.md`
4a. if a capability has no truthful next stage and no open completion layer, archive it now instead of leaving durable detail here
5. delete stale temporary notes after preserving their durable meaning
6. keep enough current memory that the next agent can continue without chat history
7. if the worktree is mixed, either reframe it honestly here or reduce it before handoff

## Active work index

| ID | Kind | Title | Parent capability | Status | Depends on | Allowed paths | Risk | Proof status | Owner | Summary |
|---|---|---|---|---|---|---|---|---|---|---|
| S-ADMIN-LIVE-UPDATES-1 | Stage | Ship polling-based live admin counters and job-status updates across `apps/admin` | C-ADMIN-LIVE-UPDATES | active | SP-ADMIN-LIVE-UPDATES-1 | `apps/admin/`, `tests/unit/ts/`, `docs/work.md`, `docs/blueprint.md` | high | partial | Codex | Same-origin polling live updates are implemented across bounded admin surfaces and automated proof is green; the remaining close gate is manual browser validation for dashboard/reindex/observability and selected-user `/user-interests`. |
| S-WEB-LIVE-UPDATES-1 | Stage | Ship polling-based live user-state updates across `apps/web` | C-WEB-LIVE-UPDATES | active | - | `apps/web/`, `tests/unit/ts/`, `docs/work.md`, `docs/blueprint.md` | high | partial | Codex | Same-origin polling live updates are implemented and automated proof is green; the remaining close gate is manual browser validation for the new on-page interest/settings UX and refresh notices. |
| SP-ADMIN-LIVE-UPDATES-1 | Spike | Design bounded admin live-update rollout for counters and job statuses | C-ADMIN-LIVE-UPDATES | done | - | `apps/admin/`, `packages/sdk/`, `services/api/`, `docs/work.md` | medium | passed | Codex | Read-only review mapped the bounded v1 targets to dashboard KPIs, reindex job progress/status, observability summary cards, and selected-user compile state, while explicitly excluding full-table realtime across articles/channels/clusters/templates. |
| SP-MVP-BUGFIX-3 | Spike | Diagnose empty system feed and reindex count mismatch | C-MVP-BUGFIXES | done | - | `services/api/`, `services/workers/`, `apps/admin/`, `tests/unit/python/`, `docs/work.md` | high | passed | Codex | Read-only DB/API/job reconciliation proved the latest visible reindex card is a historical frozen snapshot and isolated the live blocker to zero lexical hits plus all-current `system_feed_results = filtered_out`. |
| P-MVP-BUGFIX-3 | Patch | Fix criterion lexical scoring for the system-first feed | C-MVP-BUGFIXES | done | SP-MVP-BUGFIX-3 | `services/workers/`, `tests/unit/python/`, `docs/work.md` | high | passed | Codex | Worker lexical scoring now interprets stored whitespace lexical bags as OR-style tsquery terms, restoring usable lexical signal without requiring immediate criteria recompilation; live replay remains a separate operator-approved follow-up. |
| P-MVP-BUGFIX-4 | Patch | Apply lexical-scoring fix to the current local runtime | C-MVP-BUGFIXES | done | P-MVP-BUGFIX-3 | `docs/work.md` | high | passed | Codex | Worker restart plus approved backfill proved the lexical fix is live, but final reconciliation showed the local worker has no `GEMINI_API_KEY`, so all new criteria reviews stayed `uncertain` and the feed remained empty. |
| P-MVP-BUGFIX-5 | Patch | Re-apply worker runtime with canonical `.env.dev` semantics | C-MVP-BUGFIXES | blocked | P-MVP-BUGFIX-4 | `docs/work.md`, `.env.dev` | high | passed | Codex | Canonical env-file semantics and local Gemini model drift are fixed; live proof recovered the feed and dashboard, and only manual validation/archive sync remain after the user-prioritized env-cost patch. |
| P-LLM-COST-ENV-1 | Patch | Make LLM token pricing env-driven and reload the runtime | - | done | - | `services/workers/app/gemini.py`, `tests/unit/python/test_gemini.py`, `.env.example`, `.env.dev`, `docs/work.md` | medium | passed | Codex | Gemini cost estimation now prefers env overrides, `.env` defaults were seeded to the official Gemini 2.0 Flash paid-tier price, and the reloaded worker resolved `price_card_source = env_override` with the expected deterministic estimate. |
| P-MVP-BUGFIX-6 | Patch | Preserve browser-scoped web settings across logout/login | C-MVP-BUGFIXES | done | - | `apps/web/src/lib/server/auth.ts`, `apps/web/src/pages/bff/auth/`, `tests/unit/ts/`, `docs/work.md`, `docs/blueprint.md` | high | passed | Codex | Web bootstrap now stores and reuses a browser-scoped Firebase refresh token, so repeated sign-in on the same browser resumes the same anonymous/local user instead of creating a fresh profile with empty settings. |
| S-PERSONALIZED-MATCHES-1 | Stage | Ship separate `/matches` feed and scoped auto-repair after interest compile | C-PERSONALIZED-MATCHES | done | - | `services/api/`, `services/workers/`, `apps/web/`, `apps/admin/`, `packages/sdk/`, `tests/unit/python/`, `tests/unit/ts/`, `README.md`, `HOW_TO_USE.md`, `docs/blueprint.md`, `docs/work.md`, `infra/scripts/test-mvp-internal.mjs` | high | passed | Codex | `/matches` is now live on top of the system-selected `/` feed, scoped historical auto-repair runs after successful interest compile, smoke compile paths skip that replay, and compose acceptance now expects historical admin-managed interests to auto-sync without retro notifications. |
| P-FEED-DUPLICATE-1 | Patch | Hide canonical duplicate article families on public feed surfaces | - | done | - | `services/api/`, `tests/unit/python/`, `docs/work.md` | medium | passed | Codex | `/feed`, `/matches`, and `dashboard/summary.active_news` now dedupe by canonical article family so multi-channel exact copies no longer surface as separate user-facing cards. |
| S-FETCHER-DUPLICATE-PREFLIGHT-1 | Stage | Fetcher-side duplicate suppression before insert/outbox | C-FETCHER-DUPLICATE-PREFLIGHT | blocked | - | `services/fetchers/`, `tests/unit/ts/fetcher-duplicate-preflight.test.ts`, `docs/work.md`, `docs/blueprint.md` | medium | partial | unassigned | Background capability remains blocked and should stay isolated until it is explicitly resumed. |

## Item detail

### S-ADMIN-LIVE-UPDATES-1

- Kind: `Stage`
- Status: `active`
- Goal: реализовать bounded admin live-update rollout для `apps/admin`, чтобы KPI cards, async job statuses/progress и selected-user compile state обновлялись через same-origin polling без полного reload-а и без live-diffing всех admin tables
- In scope:
  app-local polling substrate and snapshot logic in `apps/admin`, new admin BFF live-update endpoint, shell-mounted coordinator, live counter/status updates for `/`, `/reindex`, `/observability`, and selected-user `/user-interests`, targeted TS unit coverage, and required runtime-doc sync
- Out of scope:
  WebSocket/SSE transport, new public `/api/*` contracts, full live table diffing for `/articles`, `/channels`, `/clusters`, `/templates/*`, worker business-logic changes, and broader admin UX redesign beyond bounded freshness/status behavior
- Allowed paths:
  `apps/admin/`, `tests/unit/ts/`, `docs/work.md`, `docs/blueprint.md`
- Required proof:
  targeted TS coverage for admin live-update snapshot diffing/polling helpers and selected-user status flows; `pnpm typecheck` or narrower truthful admin typecheck entry if available; `pnpm unit_tests`; manual browser-oriented verification that dashboard/reindex/observability counters update without full-page reload and that selected-user `/user-interests` compile statuses refresh inline while broader tables only show refresh notices when needed
- Risk: `high`
- Executed proof:
  `node --import tsx --test tests/unit/ts/admin-live-updates.test.ts`; `pnpm --filter @newsportal/admin typecheck`; `pnpm unit_tests`; `git diff --check -- apps/admin/src docs/work.md tests/unit/ts`
- Proof status:
  partial

### S-WEB-LIVE-UPDATES-1

- Kind: `Stage`
- Status: `active`
- Goal: реализовать web-only live-update rollout для user-facing `apps/web`, чтобы compile/repair flow и другие user-relevant state changes доходили до UI через same-origin polling, inline status updates и refresh prompts/toasts вместо полного ручного reload-а
- In scope:
  app-local polling substrate and snapshot logic in `apps/web`, new web BFF live-update endpoint, live `/interests` and `/settings` behavior, refresh notices for `/`, `/matches`, and `/notifications`, targeted TS unit coverage, and required runtime-doc sync
- Out of scope:
  admin live updates, WebSocket/SSE transport, new public `/api/*` contracts, worker business-logic changes, auth/logout semantic changes, and broader product redesign beyond the approved web UX
- Allowed paths:
  `apps/web/`, `tests/unit/ts/`, `docs/work.md`, `docs/blueprint.md`
- Required proof:
  `pnpm --filter @newsportal/web typecheck`; `pnpm unit_tests`; targeted TS coverage for snapshot diffing/polling helpers and live interest/update flows; manual browser-oriented verification that `/interests` and `/settings` update without full-page reload and that feed/matches/notifications surface refresh prompts when fresh data appears
- Risk: `high`
- Executed proof:
  `node --import tsx --test tests/unit/ts/live-updates.test.ts tests/unit/ts/live-interest-state.test.ts`; `pnpm --filter @newsportal/web typecheck`; `pnpm unit_tests`; `git diff --check -- apps/web/src docs/work.md tests/unit/ts`
- Proof status:
  partial

### SP-MVP-BUGFIX-3

- Kind: `Spike`
- Status: `done`
- Goal: понять, почему после system-first flow change дашборд, recent reindex job и feed показывают цифры, которые не сходятся с реальным числом статей в PostgreSQL
- In scope:
  read-only inspection and, if needed, bounded fixes in `services/api/`, `services/workers/`, `apps/admin/`, `tests/unit/python/`, and sync in `docs/work.md`
- Out of scope:
  new product semantics for personalization, unrelated UI polish, fetcher duplicate work, retention-policy redesign for completed `reindex_job_targets`
- Allowed paths:
  `services/api/`, `services/workers/`, `apps/admin/`, `tests/unit/python/`, `docs/work.md`
- Required proof:
  read-only reconciliation of live `articles` / `system_feed_results` / `reindex_jobs` / `reindex_job_targets` truth against dashboard/feed surfaces, plus targeted source inspection; if code ships, reframe or extend proof to the touched runtime boundary
- Risk: `high`
- Executed proof:
  live `curl` checks for `http://127.0.0.1:8000/dashboard/summary` and `http://127.0.0.1:8000/feed?page=1&pageSize=5`; read-only PostgreSQL inspection of `articles`, `system_feed_results`, `reindex_jobs`, `reindex_job_targets`, `criteria`, `criterion_match_results`, `llm_prompt_templates`, and source inspection of `services/api/app/main.py`, `apps/admin/src/pages/reindex.astro`, `apps/admin/src/pages/bff/admin/reindex.ts`, `services/workers/app/main.py`, `services/workers/app/reindex_backfill.py`, `services/workers/app/system_feed.py`, `services/workers/app/scoring.py`, and `services/ml/app/compiler.py`
- Proof status:
  passed

### P-MVP-BUGFIX-3

- Kind: `Patch`
- Status: `done`
- Goal: исправить criterion lexical scoring так, чтобы existing compiled criteria перестали давать нулевой lexical signal почти на всех статьях и system-first feed снова мог поднимать `gray_zone`/`eligible` статьи truthfully
- In scope:
  bounded worker fix in `services/workers/`, targeted Python unit coverage in `tests/unit/python/`, and sync in `docs/work.md`
- Out of scope:
  broad criteria retuning, operator-facing reindex/report UX changes, interest-scope LLM behavior changes, historical target retention policy
- Allowed paths:
  `services/workers/`, `tests/unit/python/`, `docs/work.md`
- Required proof:
  targeted Python unit coverage for lexical-query semantics plus boundary-aware verification that the fix changes the criterion/system-feed scoring path in the intended direction without reintroducing interest-scope review
- Risk: `high`
- Executed proof:
  `PYTHONPATH=. python -m unittest tests.unit.python.test_lexical tests.unit.python.test_scoring`; `python -m py_compile services/workers/app/main.py services/workers/app/lexical.py tests/unit/python/test_lexical.py`; `git diff --check`; read-only PostgreSQL verification before closeout showed that legacy compiled lexical bags are non-empty, `plainto_tsquery` yielded zero lexical hits across all current criteria matches, and the same stored bags produce strong OR-style ranks on representative live articles via `to_tsquery('simple', replace(..., ' ', ' | '))`
- Proof status:
  passed

### P-MVP-BUGFIX-4

- Kind: `Patch`
- Status: `done`
- Goal: применить уже зафиксированный lexical-scoring fix к текущему local runtime и проверить, что approved backfill больше не оставляет весь system feed в `filtered_out`
- In scope:
  worker restart, approved reindex/backfill triggering on the local dataset, read-only reconciliation of resulting job/feed/system-feed counts, and sync in `docs/work.md`
- Out of scope:
  new code changes beyond already landed lexical fix, broad criteria retuning, operator UI/report redesign, Firebase cleanup
- Allowed paths:
  `docs/work.md`
- Required proof:
  successful worker restart on the landed code, completed approved backfill (or truthful failure capture), and post-run reconciliation of `reindex_jobs`, `system_feed_results`, `/dashboard/summary`, and `/feed`
- Risk: `high`
- Executed proof:
  `docker compose -f infra/docker/compose.yml -f infra/docker/compose.dev.yml up -d --build worker`; direct local insertion of one approved `reindex_jobs` + `outbox_events` pair for `reindex.requested` backfill `34a20e26-6912-438d-b2af-41418ede7a2e`; live PostgreSQL reconciliation showed the job reached `completed` with `progress = 3990/3990` and `backfill.criterionLlmReviews = 116`; post-run checks showed `articles_total = 4010`, `system_feed_results` still `filtered_out = 4010`, `/dashboard/summary.active_news = 0`, `/feed.total = 0`, `llm_review_log` added `124` new `uncertain` rows, each with `response_json.error = 'GEMINI_API_KEY is not configured.'`, and worker env confirmed `LLM_REVIEW_ENABLED=1` with empty `GEMINI_API_KEY`
- Proof status:
  passed

### P-MVP-BUGFIX-5

- Kind: `Patch`
- Status: `blocked`
- Goal: починить local worker runtime так, чтобы он не только подхватил существующий `GEMINI_API_KEY` из `.env.dev`, но и использовал рабочую Gemini model config, а затем повторно прогнать backfill и truthfully зафиксировать реальную feed truth после lexical fix
- In scope:
  canonical worker restart with `--env-file .env.dev`, in-container env verification, bounded local correction in `.env.dev`, relay recovery after the compose recreate path, one more approved backfill/reconciliation cycle, and sync in `docs/work.md`
- Out of scope:
  new scoring code, prompt rewrites, broader env-platform redesign, production/deployment changes
- Allowed paths:
  `docs/work.md`, `.env.dev`
- Required proof:
  worker env must expose non-empty `GEMINI_API_KEY`, the corrected model config must stop producing `HTTP 404` review failures, rerun backfill must complete truthfully, and post-run reconciliation must show the recovered feed state rather than a local config artifact
- Risk: `high`
- Executed proof:
  canonical restart with `--env-file .env.dev` rebuilt/recreated `worker`; in-container env verification showed non-empty `GEMINI_API_KEY`; live probe with forced `gemini-2.0-flash` returned a clean `approve`, proving the worker client/key path was healthy while the old local `.env.dev` preview model was not; `.env.dev` was then corrected to `gemini-2.0-flash`, `worker` and `relay` were restarted canonically, approved backfill job `f11923b8-01d4-41b3-8d95-e0f108d7ad5b` completed `4024/4024`, final reconciliation showed `/feed.total = 62`, `dashboard/summary.active_news = 62`, `system_feed_results.eligible = 62`, and `llm_review_log` decisions `approve = 70`, `reject = 40`, `uncertain = 14` without `HTTP 404`
- Proof status:
  passed

### P-LLM-COST-ENV-1

- Kind: `Patch`
- Status: `done`
- Goal: сделать LLM token-cost estimation env-driven, чтобы alternate Gemini model configs могли задавать собственный тариф через `LLM_INPUT_COST_PER_MILLION_USD` и `LLM_OUTPUT_COST_PER_MILLION_USD`, а local runtime после reload начал писать truthful updated estimates
- In scope:
  bounded worker cost-estimation changes in `services/workers/app/gemini.py`, targeted Python unit coverage in `tests/unit/python/test_gemini.py`, env sync in `.env.example`/`.env.dev`, runtime sync in `docs/work.md`, and local reload validation on the existing compose baseline
- Out of scope:
  admin UI copy changes, provider-side billing integration, historical backfill/rewrite of old `llm_review_log` rows, broader observability redesign
- Allowed paths:
  `services/workers/app/gemini.py`, `tests/unit/python/test_gemini.py`, `.env.example`, `.env.dev`, `docs/work.md`
- Required proof:
  targeted Python unit coverage for env override parsing and cost calculation, syntax sanity for the touched Python module, runtime reload of the local worker with the new env values, and live verification that the reloaded worker resolves the env tariff source and expected deterministic estimate; any missing provider `usageMetadata` on the smoke path must remain an explicit residual gap
- Risk: `medium`
- Executed proof:
  `PYTHONPATH=. python -m unittest tests.unit.python.test_gemini`; `python -m py_compile services/workers/app/gemini.py tests/unit/python/test_gemini.py`; `git diff --check -- services/workers/app/gemini.py tests/unit/python/test_gemini.py .env.example .env.dev docs/work.md`; `docker compose -f infra/docker/compose.yml -f infra/docker/compose.dev.yml up -d --build worker`; escalated in-container worker probe `review_with_gemini(...)` showed `price_card_source = env_override` with the env-seeded `0.10` / `0.40` tariff while provider token usage remained unavailable on that smoke call; deterministic in-container probe confirmed `_estimate_cost_usd('gemini-2.0-flash', 1000, 500) = 0.0003` with `price_card_source = env_override`
- Proof status:
  passed

### P-MVP-BUGFIX-6

- Kind: `Patch`
- Status: `done`
- Goal: починить web auth/session bridge так, чтобы повторный вход на том же браузере возвращал пользователя в прежний anonymous/local account и не обнулял `user_profiles`, interests, notification channels и другие user-bound настройки
- In scope:
  bounded web auth changes in `apps/web/src/lib/server/auth.ts` and `apps/web/src/pages/bff/auth/`, targeted TS unit coverage in `tests/unit/ts/`, durable auth-flow sync in `docs/blueprint.md`, and live execution sync in `docs/work.md`
- Out of scope:
  new non-anonymous end-user login UX, admin auth semantics, account-linking flows across devices, destructive cleanup of existing anonymous users, unrelated settings-page redesign
- Allowed paths:
  `apps/web/src/lib/server/auth.ts`, `apps/web/src/pages/bff/auth/`, `tests/unit/ts/`, `docs/work.md`, `docs/blueprint.md`
- Required proof:
  targeted TS unit coverage for refresh-cookie restore/fallback behavior plus auth bootstrap cookie/header verification sufficient to prove the same browser can resume the prior anonymous identity without silently bypassing explicit sign-out
- Risk: `high`
- Executed proof:
  `node --import tsx --test tests/unit/ts/web-auth-session.test.ts`; `node --import tsx --test tests/unit/ts/app-routing.test.ts`; `pnpm --filter @newsportal/web typecheck`; `git diff --check -- apps/web/src/lib/server/auth.ts apps/web/src/pages/bff/auth/bootstrap.ts tests/unit/ts/web-auth-session.test.ts docs/blueprint.md docs/work.md`
- Proof status:
  passed

### P-FEED-DUPLICATE-1

- Kind: `Patch`
- Status: `done`
- Goal: убрать повторяющиеся article copies с user-facing `/feed` и `/matches`, если они уже сведены в одну canonical family через dedup pipeline
- In scope:
  bounded API read-path changes in `services/api/`, targeted Python unit coverage in `tests/unit/python/`, and sync in `docs/work.md`
- Out of scope:
  fetcher ingest redesign, worker dedup algorithm changes, destructive cleanup of historical duplicate rows, admin/internal raw article listings
- Allowed paths:
  `services/api/`, `tests/unit/python/`, `docs/work.md`
- Required proof:
  targeted Python unit coverage for canonical-family feed/match dedupe plus live reconciliation of `/feed`, `/dashboard/summary`, and representative PostgreSQL duplicate families on the local compose dataset
- Risk: `medium`
- Executed proof:
  `PYTHONPATH=. python -m unittest tests.unit.python.test_api_matches tests.unit.python.test_api_feed_dedup`; `python -m py_compile services/api/app/main.py tests/unit/python/test_api_matches.py tests/unit/python/test_api_feed_dedup.py`; `git diff --check -- services/api/app/main.py tests/unit/python/test_api_matches.py tests/unit/python/test_api_feed_dedup.py docs/work.md`; `docker compose -f infra/docker/compose.yml -f infra/docker/compose.dev.yml up -d --build api`; live in-container proof via `services.api.app.main.list_feed_articles(page=1, page_size=100)` and `get_dashboard_summary()` showed `feed_total = 30`, `feed_items = 30`, `active_news = 30`; direct HTTP proof `curl -sS 'http://127.0.0.1:8000/feed?pageSize=100' | jq ...` showed `total = 30`, `items = 30`, and no repeated titles in the returned page; PostgreSQL reconciliation on the same local dataset still showed `39` raw eligible rows collapsing to `30` `count(distinct coalesce(canonical_doc_id, doc_id))`, including `Oracle Cloud Infrastructure: The bare metal facts` `3 -> 1` and `Google Reinvents Android Sideloading to Thwart Scammers` `8 -> 1`
- Proof status:
  passed

### S-FETCHER-DUPLICATE-PREFLIGHT-1

- Kind: `Stage`
- Status: `blocked`
- Goal: добавить fetcher-side duplicate suppression до insert/outbox path без нарушения current ingest contract
- In scope:
  `services/fetchers/`, `tests/unit/ts/fetcher-duplicate-preflight.test.ts`, `docs/work.md`, `docs/blueprint.md`
- Out of scope:
  worker normalize/dedup behavior, admin/browser flow fixes, manual readiness runtime sync, broader ingest redesign
- Allowed paths:
  `services/fetchers/`, `tests/unit/ts/fetcher-duplicate-preflight.test.ts`, `docs/work.md`, `docs/blueprint.md`
- Required proof:
  unit coverage plus RSS smoke и multi-RSS compose proof на финальной implementation stage
- Risk: `medium`
