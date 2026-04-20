# NewsPortal

Локальный MVP polyglot content-platform monorepo.

Сейчас репозиторий содержит baseline для:

- PostgreSQL как единственного source of truth;
- Redis + BullMQ как transport only;
- SQL migrations с нуля;
- outbox relay, публикующего thin jobs из PostgreSQL в BullMQ;
- RSS fetchers с cursor-aware raw article persistence;
- Python workers для `normalize + dedup`, читающих BullMQ jobs с inbox idempotency;
- Python workers для `embed + cluster + system-interest gating + optional user-interest match + notify + system-interest-scope Gemini-review`, также работающих через BullMQ и inbox idempotency;
- phase-2 article tables для raw, normalized и deduped state;
- phase-3 feature extraction, embedding registries, compiled interest/criterion state и HNSW registry plumbing;
- phase-4 matching, notification, moderation, reactions, prompt-template и audit tables;
- foundation tables для users, roles, profiles, channels, outbox и inbox idempotency;
- Astro web/admin apps с Firebase-backed session bridge и локальными write routes;
- FastAPI read/debug/explain endpoints для articles, clusters, notifications, channels, templates и maintenance views;
- discovery orchestration for source acquisition: missions, hypotheses, candidates, cost ledger, reusable child sequences and maintenance/admin review surfaces with safe-by-default runtime flags;
- multi-provider fetchers для RSS, website/http, external JSON APIs и IMAP-polled email feeds;
- SSR-ready Astro build/runtime path для `web` и `admin` через Node adapter;
- canonical internal-test compose.dev path c локальным SMTP sink для `email_digest`;
- nginx front door для локального single-host routing.

YouTube и browser-heavy anti-bot fetchers пока остаются future-ready направлением.

## Источники истины

- [docs/blueprint.md](docs/blueprint.md)
- [AGENTS.md](AGENTS.md)
- [docs/engineering.md](docs/engineering.md)
- [docs/verification.md](docs/verification.md)

## AI runtime-core

В репозитории используется компактный AI runtime-core из семи файлов:

- `AGENTS.md`
- `docs/work.md`
- `docs/blueprint.md`
- `docs/engineering.md`
- `docs/verification.md`
- `docs/history.md`
- `.aidp/os.yaml`

Рабочий read order для обычной implementation work:

1. `AGENTS.md`
2. `docs/work.md`
3. `docs/blueprint.md`
4. `docs/engineering.md`
5. `docs/verification.md`
6. `.aidp/os.yaml`
7. `docs/history.md` только при необходимости durable historical detail

Authority order для конфликтов между runtime-файлами:

1. `AGENTS.md`
2. `docs/blueprint.md`
3. `.aidp/os.yaml`
4. `docs/engineering.md`
5. `docs/verification.md`
6. `docs/work.md`
7. `docs/history.md`

Различие режимов:

- `setup mode` используется только для первичной инициализации или переинициализации runtime core;
- `normal mode` используется для обычной работы, где каждое изменение начинается с явного work item.

Authoritative runtime core живет только в корне репозитория и в `docs/`/`.aidp/`.
Временный refresh source package уже retired после verified transfer-audit.

Для stateful backend testing и fixture cleanup используй deep contract doc [docs/contracts/test-access-and-fixtures.md](docs/contracts/test-access-and-fixtures.md).

## Базовая структура

```text
apps/
  web/        Astro-приложение с пользовательским health endpoint
  admin/      Astro-приложение с admin health endpoint
services/
  fetchers/   Node/TypeScript ingest service + smoke CLI
  relay/      Node/TypeScript outbox relay + migration/test CLI
  api/        FastAPI thin read/debug API с health endpoint
  workers/    Python workers для normalize, dedup, embed, compile, match и notify
  ml/         Shared Python logic для feature extraction, embeddings и compilers
  indexer/    Shared Python tooling для HNSW rebuild и consistency checks
packages/
  contracts/  Shared TS contracts для health, auth boundary и queue payloads
database/
  migrations/ Ordered SQL migrations
  ddl/        Текущий schema snapshot
infra/
  docker/     Compose baseline и Dockerfiles
```

## Локальный запуск

1. Установить Node dependencies:

   ```sh
   pnpm install
   ```

2. Один раз установить Python QA dependency для root `lint`:

   ```sh
   python -m pip install -r infra/docker/python.dev-requirements.txt
   ```

3. Поднять canonical internal MVP stack:

   ```sh
   pnpm dev:mvp:internal
   ```

   Если контейнеры и образы уже актуальны и нужен запуск без rebuild:

   ```sh
   pnpm dev:mvp:internal:no-build
   ```

4. Проверить локальные health endpoints:

   ```sh
   http://127.0.0.1:4321/api/health
   http://127.0.0.1:4322/api/health
   http://127.0.0.1:8000/health
   http://127.0.0.1:8080/health
   http://127.0.0.1:8025/
   ```

5. Прогнать быстрые root-level QA gates:

   ```sh
   pnpm lint
   pnpm unit_tests
   ```

6. Запустить canonical full acceptance gate:

   ```sh
   pnpm integration_tests
   ```

   `pnpm test:mvp:internal` сохранен как backward-compatible alias implementation path под этим gate.

7. Управление compose.dev stack вручную:

   ```sh
   pnpm dev:mvp:internal:stop
   pnpm dev:mvp:internal:down
   pnpm dev:mvp:internal:down:volumes
   pnpm dev:mvp:internal:logs
   ```

   `stop` останавливает контейнеры без удаления, `down` удаляет stack без стирания volumes, `down:volumes` удаляет stack вместе с volumes, `logs` показывает compose-логи. Для конкретных сервисов можно передать имена после `--`, например `pnpm dev:mvp:internal:logs -- web api`.

## Root QA Gates

- `pnpm lint`
  Root-level ESLint + Ruff gate для `apps`, `packages`, `services` и `infra/scripts`; Python часть требует установленный `ruff` из `infra/docker/python.dev-requirements.txt`.
- `pnpm unit_tests`
  Root-level deterministic unit gate: `node:test` + `tsx` для pure TS logic и `unittest` для pure Python helpers.
- `pnpm integration_tests`
  Root-level full-acceptance gate; сейчас это thin alias на `pnpm test:mvp:internal`.

## Article LLM Review Runtime

- Baseline system-interest gray-zone review stays env-driven and uses Gemini plus `llm_review_log` as the spend/usage source of truth.
- Main env surface for this lane:
  - `LLM_REVIEW_ENABLED`
  - `LLM_REVIEW_MONTHLY_BUDGET_CENTS`
  - `LLM_REVIEW_BUDGET_EXHAUST_ACCEPT_GRAY_ZONE`
  - `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_BASE_URL`
  - `LLM_INPUT_COST_PER_MILLION_USD`, `LLM_OUTPUT_COST_PER_MILLION_USD`
- `LLM_REVIEW_MONTHLY_BUDGET_CENTS=0` disables the monthly cap only; it does not disable the lane itself.
- When the monthly cap is exhausted, system-interest gray-zone criteria are auto-resolved by env policy instead of leaving articles in `pending_llm`.
- Operator read surfaces for this runtime are:
  - `/maintenance/llm-budget-summary`
  - `/dashboard/summary`
  - `/admin`
  - `/admin/observability`

## Discovery Runtime

- Discovery capability lives on top of the same Universal Task Engine runtime and stays disabled unless `DISCOVERY_ENABLED=true`.
- Default rollout is intentionally safe:
  - `DISCOVERY_SEARCH_PROVIDER=ddgs`
  - live search still stays dormant until `DISCOVERY_ENABLED=true`
  - manual approval by default
  - reusable RSS/website child sequences stay seeded as draft until explicitly activated
- Main discovery env surface:
  - `DISCOVERY_ENABLED`
  - `DISCOVERY_CRON`
  - `DISCOVERY_BUDGET_CENTS_DEFAULT`
  - `DISCOVERY_MAX_HYPOTHESES_PER_RUN`
  - `DISCOVERY_MAX_SOURCES_DEFAULT`
  - `DISCOVERY_AUTO_APPROVE_THRESHOLD`
  - `DISCOVERY_SEARCH_PROVIDER`
  - `DISCOVERY_DDGS_BACKEND`
  - `DISCOVERY_DDGS_REGION`
  - `DISCOVERY_DDGS_SAFESEARCH`
  - `DISCOVERY_GEMINI_API_KEY`
  - `DISCOVERY_GEMINI_MODEL`
  - `DISCOVERY_GEMINI_BASE_URL`
  - `DISCOVERY_LLM_INPUT_COST_PER_MILLION_USD`
  - `DISCOVERY_LLM_OUTPUT_COST_PER_MILLION_USD`
  - `DISCOVERY_MONTHLY_BUDGET_CENTS`
  - `DISCOVERY_BRAVE_API_KEY` and `DISCOVERY_SERPER_API_KEY` remain dormant placeholders only
- Admin discovery surface lives at `/admin/discovery` behind the existing allowlisted admin/session boundary and keeps same-origin BFF writes with audit logging.

### Discovery live enable runbook

1. Keep the repo baseline safe by default in committed templates, but mirror real discovery envs in the local/prod env file:
   - `DISCOVERY_GEMINI_API_KEY`, `DISCOVERY_GEMINI_MODEL`, `DISCOVERY_GEMINI_BASE_URL`
   - `DISCOVERY_LLM_INPUT_COST_PER_MILLION_USD`, `DISCOVERY_LLM_OUTPUT_COST_PER_MILLION_USD`
   - `DISCOVERY_MONTHLY_BUDGET_CENTS=500`
   - `DISCOVERY_SEARCH_PROVIDER=ddgs`
2. Start the local compose stack with `pnpm dev:mvp:internal`.
3. Prove the bounded enabled-runtime path with `pnpm test:discovery-enabled:compose`.
4. Prove the profile-backed Example B/C discovery harness with `pnpm test:discovery:examples:compose` if you want a repo-owned live run that materializes reusable `Discovery Profiles` and emits canonical `manualReplaySettings` for later manual replay.
5. For a real local enable, restart the relevant containers with `DISCOVERY_ENABLED=1` in the runtime env, then verify:
   - `GET /maintenance/discovery/summary` shows `enabled=true`, the expected discovery LLM model, and the monthly quota fields;
   - `/admin/discovery` shows the active provider/model plus the monthly quota state;
   - manual mission runs succeed before quota exhaustion and return `409` after the hard cap is reached.
6. Monitor discovery live via:
   - `/maintenance/discovery/summary`
   - `/maintenance/discovery/costs/summary`
   - `/admin/discovery`
   - worker logs for discovery planning/execution errors
7. Roll back by setting `DISCOVERY_ENABLED=0` or switching `DISCOVERY_SEARCH_PROVIDER=stub`, then restart the affected runtime.

For a dedicated operator-facing testing handbook for this subsystem, including bounded enable smoke, profile-backed Example B/C replay, graph-first mission testing, and independent recall/promotion checks, use [DISCOVERY_MODE_TESTING.md](./DISCOVERY_MODE_TESTING.md).

### Browser-assisted website and hard-site notes

- Safe default stays unchanged: cheap/static website discovery remains first, and browser help is opt-in rather than default.
- Enable browser assistance only for public `website` channels when static discovery misses real resources or the site is clearly JS-heavy. The relevant website config keys are `browserFallbackEnabled=true` and `maxBrowserFetchesPerPoll` (keep the current default `2` unless you have a bounded reason to change it).
- When discovery recommends browser help for a website candidate, the registered provider must still remain `website`; hidden feeds remain hints only and must not silently convert the source into RSS.
- For a dedicated operator-facing manual pass of `website` channels, `/admin/resources`, projected vs resource-only rows, and bounded live-site checks, use [WEBSITE_SOURCES_TESTING.md](./WEBSITE_SOURCES_TESTING.md).
- For the expanded repo-owned real-site matrix after local website proof is green, run `node infra/scripts/test-live-website-matrix.mjs`; it validates 16 primary public sites across static editorial, document/download-heavy, public changelog, and browser-candidate shapes and writes a JSON evidence bundle under `/tmp/newsportal-live-website-matrix-<runId>.json`.
- Operator verification for this lane should include:
  - `pnpm test:hard-sites:compose`
  - `/admin/resources` and `/admin/resources/[resourceId]` to confirm browser provenance is visible
- Unsupported login/CAPTCHA/manual challenge bypass is intentionally out of scope; these sites should fail explicitly rather than degrade into hidden retry logic.

## Internal MVP Notes

- `pnpm dev:mvp:internal` использует `docker compose --env-file .env.dev -f infra/docker/compose.yml -f infra/docker/compose.dev.yml`; `pnpm dev:mvp:internal:no-build` поднимает тот же stack без rebuild, а `pnpm dev:mvp:internal:stop`, `pnpm dev:mvp:internal:down`, `pnpm dev:mvp:internal:down:volumes` и `pnpm dev:mvp:internal:logs` закрывают повседневный lifecycle stack-а.
- В compose-based SSR `NEWSPORTAL_API_BASE_URL` должен указывать на внутренний service DNS `http://api:8000`, а `NEWSPORTAL_PUBLIC_API_BASE_URL` остается host/browser-facing URL вроде `http://127.0.0.1:8000`.
- Для Astro SSR/BFF теперь используются отдельные app base URLs: `NEWSPORTAL_WEB_APP_BASE_URL` и `NEWSPORTAL_ADMIN_APP_BASE_URL`; compose прокидывает их в контейнеры как `NEWSPORTAL_APP_BASE_URL`, чтобы redirects и trusted host reconstruction не деградировали в `http://localhost/`.
- `apps/web` и `apps/admin` теперь имеют contract `dev -> astro dev`, `build -> astro build`, `start -> built SSR server`.
- Browser/session routes `web` и `admin` больше не делят `/api/*` c Python API: public/read API остается на `/api/*`, а Astro BFF живет на `/bff/*`; через nginx admin surface доступен на `/admin/`, поэтому его browser/BFF paths снаружи имеют вид `/admin/bff/*`.
- Admin now also exposes `/admin/discovery` for mission planning, candidate review, hypothesis inspection and cost summaries, while FastAPI keeps the canonical `/maintenance/discovery/*` read/action surface for SDK/BFF consumers.
- Для first-run admin bootstrap используется `ADMIN_ALLOWLIST_EMAILS`; allowlisted email получает локальную роль `admin` при первом успешном Firebase sign-in, а exact allowlisted address допускает repeatable `+alias` sign-in для internal tests. После bootstrap PostgreSQL остается источником истины для authorization.
- Active admin `interest_templates` materialize-ятся в live system-interest rules, поэтому операторский system layer уже участвует и во fresh ingest, и в historical backfill.
- Fresh ingest и historical backfill теперь идут в system-first порядке: `system interests -> system-interest-scope gray-zone LLM -> system-selected collection -> optional per-user user_interests`.
- Пользователь без `user_interests` все равно видит system-selected collection; baseline notifications пока остаются personalization-lane contract, а не отдельным system alert path.
- `web` keeps `/` as the global system-selected collection and exposes a separate `/matches` surface for per-user personalized matches.
- Successful user-interest create/update/clone flows now compile first and then queue a scoped `repair` replay for historical system-selected content, without resending retro notifications.
- Umbrella `pnpm integration_tests` acceptance все еще остается RSS-first ingest path, но website lane теперь имеет отдельные deterministic proofs через `pnpm test:website:compose` и `pnpm test:website:admin:compose`; `api` / `email_imap` operator acceptance по-прежнему остаются follow-up scope.
- Для multi-RSS polling baseline теперь используются `FETCHERS_BATCH_SIZE=100` и `FETCHERS_CONCURRENCY=4`; single-channel smoke и multi-channel proofs делят один и тот же fetcher/runtime contract.
- `source_channels.poll_interval_seconds` теперь трактуется как base/min interval; adaptive runtime truth живет в `source_channel_runtime_state` и управляет `effective_poll_interval_seconds`, `next_due_at`, backoff и overdue state без переписывания operator baseline.
- Admin surface показывает provider-agnostic scheduling health, append-only fetch history, website resource browse/detail observability via `/admin/resources`, и LLM usage/budget rollups; read-model API дополнена `/maintenance/fetch-runs`, `/maintenance/llm-reviews`, `/maintenance/llm-usage-summary`, `/maintenance/llm-budget-summary` и `/maintenance/web-resources*`.
- Web surface умеет подключать `web_push` через service worker `/sw.js`; для browser subscription нужен `WEB_PUSH_VAPID_PUBLIC_KEY`, а notify worker дополнительно учитывает `user_profiles.notification_preferences`.
- Локальный `email_digest` delivery path идет через SMTP sink `mailpit`; для compose baseline используется `smtp://mailpit:1025`, а UI sink доступен на `http://127.0.0.1:8025`.
- Root `pnpm integration_tests` делегирует на этот же internal MVP acceptance path и не расширяет proof scope beyond RSS-first ingest.

## Manual MVP Readiness

Для ручного MVP прогона теперь есть консистентный baseline:

- admin умеет создавать RSS и website channels, а website lane теперь дает `/admin/resources` browse/detail для projected и resource-only `web_resources`;
- browser-assisted website handling for public JS-heavy sites is available as an opt-in website-channel setting via `browserFallbackEnabled`; cheap static modes remain default and browser provenance should surface on `/admin/resources`;
- provider-wide scheduling patch позволяет массово назначать `fast=300`, `normal=900`, `slow=3600`, `daily=86400`, `three_day=259200`;
- fetchers сохраняют `source_channel_runtime_state` и append-only `channel_fetch_runs`, поэтому overdue/adaptive/failed каналы видны отдельно от `source_channels.last_*`;
- worker пишет first-class Gemini usage/cost поля в `llm_review_log`;
- public `/collections/system-selected` теперь показывает system-selected content items по article/resource gate, даже если у текущего пользователя нет ни одного `user_interest`;
- web показывает configured notification channels, working `notification_preferences`, browser-side `web_push` connect flow и расширенный lifecycle interests.

Полный operator-facing runbook теперь собран в [docs/manual-mvp-runbook.md](docs/manual-mvp-runbook.md). Используй его, если нужен не только quick start, а полный local MVP walkthrough c setup, API checks, moderation/backfill, optional notifications и cleanup/reset guidance.

Минимальный manual checklist:

1. Поднимите stack через `pnpm dev:mvp:internal`.
2. Для repeatable local run либо импортируйте deterministic local fixture feeds из runbook (`http://web:4321/internal-mvp-feed.xml?...`), либо используйте real RSS URLs через шаблон [infra/scripts/manual-rss-bundle.template.json](infra/scripts/manual-rss-bundle.template.json). Для shared bulk import теперь обязателен row-level `providerType` на каждой JSON row; RSS bundles должны явно нести `"providerType": "rss"`.
3. Назначьте часть каналов на `fast`, часть на `daily` и часть на `three_day`, затем проверьте `next due`, `overdue`, `recent failures` и fetch history в admin.
4. В `web` создайте anonymous session, убедитесь, что system-selected collection на `/` заполняется и без персонализации, затем откройте `/matches`, подключите `web_push`, включите нужные `notification_preferences`, создайте или отредактируйте interest и дождитесь compile/update path plus background historical sync.
5. Если вы тестируете website source, откройте `/admin/resources` и проверьте, что projected editorial rows и resource-only entity/document rows видны одновременно; для JS-heavy/public hard-site path дополнительно включите browser fallback только при необходимости и убедитесь, что browser provenance отрисовывается truthfully.
6. Проверьте admin summary: `System-selected content`, recent fetch runs, recent LLM reviews и delivery state по user channels.

Ограничение baseline:

- фактический browser receipt для `web_push` остается manual-only proof item;
- repo не содержит канонического списка real RSS feeds, только импортный template; реальные feed URLs оператор подставляет сам.
- current committed admin/operator source CRUD supports RSS and website onboarding; `api` и `email_imap` ingest остаются code-present, но не operator-ready частью этого manual baseline.

## Targeted Smokes

1. Запустить relay smoke с хоста:

   ```sh
   pnpm test:relay:compose
   ```

2. Запустить phase-2 RSS ingest smoke с хоста:

   ```sh
   pnpm test:ingest:compose
   ```

3. Запустить deterministic website ingest smoke:

   ```sh
   pnpm test:website:compose
   ```

4. Запустить deterministic website admin/operator acceptance:

   ```sh
   pnpm test:website:admin:compose
   ```

5. Запустить deterministic multi-channel RSS proof через admin bulk flow:

   ```sh
   pnpm test:ingest:multi:compose
   ```

6. Запустить heavier 60-channel RSS soak:

   ```sh
   pnpm test:ingest:soak:compose
   ```

7. Запустить phase-2 migration и worker smoke с хоста:

   ```sh
   pnpm test:migrations:smoke
   pnpm test:normalize-dedup:compose
   ```

8. Запустить phase-3 relay routing smoke с хоста для проверки optional embed fanout:

   ```sh
   pnpm test:relay:phase3:compose
   ```

9. Запустить phase-4/5 relay routing smoke с хоста:

   ```sh
   pnpm test:relay:phase45:compose
   ```

   Этот smoke теперь подтверждает последовательный routing `article.clustered -> q.match.criteria -> article.criteria.matched -> q.match.interests`.

10. Запустить worker smokes внутри контейнера `worker` после поднятия Postgres/Redis:

   ```sh
    pnpm test:interest-compile:compose
    pnpm test:criterion-compile:compose
    pnpm test:cluster-match-notify:compose
   ```

   `pnpm test:cluster-match-notify:compose` теперь также доказывает, что `system_feed_results` заполняется до optional personalization lane и что baseline runtime не отправляет interest-side gray-zone review в LLM.

## Основные команды

- `pnpm check:scaffold`
- `pnpm db:migrate`
- `pnpm db:seed:outbox-smoke`
- `pnpm dev:mvp:internal`
- `pnpm dev:mvp:internal:no-build`
- `pnpm dev:mvp:internal:stop`
- `pnpm dev:mvp:internal:down`
- `pnpm dev:mvp:internal:down:volumes`
- `pnpm dev:mvp:internal:logs`
- `pnpm fetch:rss:once`
- `pnpm index:check:interest-centroids`
- `pnpm index:check:event-cluster-centroids`
- `pnpm index:rebuild:interest-centroids`
- `pnpm index:rebuild:event-cluster-centroids`
- `pnpm integration_tests`
- `pnpm lint`
- `pnpm test:cluster-match-notify:compose`
- `pnpm test:cluster-match-notify:smoke`
- `pnpm test:criterion-compile:smoke`
- `pnpm test:criterion-compile:compose`
- `pnpm test:embed:compose`
- `pnpm test:embed:smoke`
- `pnpm test:ingest:compose`
- `pnpm test:ingest:multi:compose`
- `pnpm test:ingest:soak:compose`
- `pnpm test:website:compose`
- `pnpm test:website:admin:compose`
- `pnpm test:interest-compile:compose`
- `pnpm test:interest-compile:smoke`
- `pnpm test:migrations:smoke`
- `pnpm test:mvp:internal`
- `pnpm test:normalize-dedup:compose`
- `pnpm test:normalize-dedup:smoke`
- `pnpm test:relay`
- `pnpm test:relay:phase3`
- `pnpm test:relay:compose`
- `pnpm test:relay:phase3:compose`
- `pnpm test:relay:phase45:compose`
- `pnpm typecheck`
- `pnpm unit_tests`
- `pnpm build`

## Health endpoints

- `web`: `http://127.0.0.1:4321/`
- `admin`: `http://127.0.0.1:4322/`
- `nginx`: `http://127.0.0.1:8080/health`
- `api`: `http://127.0.0.1:8000/health`
- `relay`: `http://127.0.0.1:4000/health`
- `fetchers`: контейнерный health endpoint `http://127.0.0.1:4100/health`
- `mailpit`: `http://127.0.0.1:8025/`
- `postgres`: `127.0.0.1:55432`
- `redis`: `127.0.0.1:56379`

## Текущий охват

- Queue payloads остаются тонкими и содержат только ID плюс компактные metadata.
- Article processing уже поддерживает путь `raw -> normalized -> deduped -> embedded -> clustered`, после которого system interests записывают editorial gate в `system_feed_results`, а per-user personalization и notify продолжаются только для eligible статей.
- Public/system-selected collection eligibility теперь читается из `system_feed_results` plus `allowed_content_kinds`, а не из `articles.processing_state`.
- Изменения admin `interest_templates` and real `user_interests` запускают versioned compile jobs и обновляют Postgres-backed compiled/vector registries.
- Gemini является baseline provider только для system-interest gray-zone review; interest-side gray-zone LLM review в baseline runtime отключен, а article-side monthly cap/hard-stop now resolves gray-zone criteria by env policy instead of leaving them pending.
- Firebase-backed anonymous web sessions и non-anonymous admin sessions подключены через Astro BFF routes.
- `./data` bind-mounted в Python services, поэтому derived models, HNSW indices, snapshots и logs переживают container rebuild.
- HNSW остается derived state; `interest_centroids` и `event_cluster_centroids` пересобираются из PostgreSQL.

## Проверка RSS smoke

Ingest smoke test создает временный RSS channel внутри running `fetchers` container, поднимает локальный fixture feed и проверяет, что:

- одна article row проходит путь `raw -> normalized -> deduped`;
- создается одна строка в `article_external_refs`;
- обновляются fetch cursors `etag` и `timestamp`;
- события `article.ingest.requested` и `article.normalized` публикуются через outbox;
- `worker.normalize` и `worker.dedup` фиксируются в `inbox_processed_events`;
- повторный fetch того же feed не создает duplicate articles.

Отдельные multi-channel proofs через `pnpm test:ingest:multi:compose` и `pnpm test:ingest:soak:compose` поднимают host-side synthetic RSS fixture server, создают RSS каналы через admin bulk endpoint и дополнительно доказывают:

- bounded-concurrency scheduler не abort-ит весь batch из-за `invalid_xml` или `timeout` канала;
- `not_modified` fixtures действительно отдают `304`, а повторный fetch проходит через `next_due_at`-aware second cycle со stable article count;
- full RSS-only path `admin -> source_channels -> fetchers -> relay -> workers` остается green на 24 и 60 feeds.

Полезные verification queries после smoke test:

```sql
select
  a.doc_id,
  a.processing_state,
  sfr.decision as system_feed_decision,
  sfr.eligible_for_feed,
  a.normalized_at,
  a.deduped_at
from articles a
left join system_feed_results sfr on sfr.doc_id = a.doc_id
order by a.ingested_at desc
limit 5;
```

```sql
select consumer_name, event_id, processed_at
from inbox_processed_events
order by processed_at desc
limit 10;
```
