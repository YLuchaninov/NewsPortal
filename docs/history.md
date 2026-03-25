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
