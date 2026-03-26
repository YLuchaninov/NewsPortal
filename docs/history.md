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
