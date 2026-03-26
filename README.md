# NewsPortal

Локальный MVP polyglot news-platform monorepo.

Сейчас репозиторий содержит baseline для:

- PostgreSQL как единственного source of truth;
- Redis + BullMQ как transport only;
- SQL migrations с нуля;
- outbox relay, публикующего thin jobs из PostgreSQL в BullMQ;
- RSS fetchers с cursor-aware raw article persistence;
- Python workers для `normalize + dedup`, читающих BullMQ jobs с inbox idempotency;
- Python workers для `embed + cluster + system criteria gating + optional user-interest match + notify + criteria-scope Gemini-review`, также работающих через BullMQ и inbox idempotency;
- phase-2 article tables для raw, normalized и deduped state;
- phase-3 feature extraction, embedding registries, compiled interest/criterion state и HNSW registry plumbing;
- phase-4 matching, notification, moderation, reactions, prompt-template и audit tables;
- foundation tables для users, roles, profiles, channels, outbox и inbox idempotency;
- Astro web/admin apps с Firebase-backed session bridge и локальными write routes;
- FastAPI read/debug/explain endpoints для articles, clusters, notifications, channels, templates и maintenance views;
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

## Internal MVP Notes

- `pnpm dev:mvp:internal` использует `docker compose --env-file .env.dev -f infra/docker/compose.yml -f infra/docker/compose.dev.yml`; `pnpm dev:mvp:internal:no-build` поднимает тот же stack без rebuild, а `pnpm dev:mvp:internal:stop`, `pnpm dev:mvp:internal:down`, `pnpm dev:mvp:internal:down:volumes` и `pnpm dev:mvp:internal:logs` закрывают повседневный lifecycle stack-а.
- В compose-based SSR `NEWSPORTAL_API_BASE_URL` должен указывать на внутренний service DNS `http://api:8000`, а `NEWSPORTAL_PUBLIC_API_BASE_URL` остается host/browser-facing URL вроде `http://127.0.0.1:8000`.
- Для Astro SSR/BFF теперь используются отдельные app base URLs: `NEWSPORTAL_WEB_APP_BASE_URL` и `NEWSPORTAL_ADMIN_APP_BASE_URL`; compose прокидывает их в контейнеры как `NEWSPORTAL_APP_BASE_URL`, чтобы redirects и trusted host reconstruction не деградировали в `http://localhost/`.
- `apps/web` и `apps/admin` теперь имеют contract `dev -> astro dev`, `build -> astro build`, `start -> built SSR server`.
- Browser/session routes `web` и `admin` больше не делят `/api/*` c Python API: public/read API остается на `/api/*`, а Astro BFF живет на `/bff/*`; через nginx admin surface доступен на `/admin/`, поэтому его browser/BFF paths снаружи имеют вид `/admin/bff/*`.
- Для first-run admin bootstrap используется `ADMIN_ALLOWLIST_EMAILS`; allowlisted email получает локальную роль `admin` при первом успешном Firebase sign-in, а exact allowlisted address допускает repeatable `+alias` sign-in для internal tests. После bootstrap PostgreSQL остается источником истины для authorization.
- Active admin `interest_templates` materialize-ятся в system `criteria`, поэтому операторский system layer уже участвует и во fresh ingest, и в historical backfill.
- Fresh ingest и historical backfill теперь идут в system-first порядке: `criteria -> criteria-scope gray-zone LLM -> system-selected feed -> optional per-user user_interests`.
- Пользователь без `user_interests` все равно видит system-selected feed; baseline notifications пока остаются personalization-lane contract, а не отдельным system-feed alert path.
- `web` keeps `/` as the global system-selected feed and now exposes a separate `/matches` surface for per-user personalized matches.
- Successful user-interest create/update/clone flows now compile first and then queue a scoped `repair` replay for historical system-feed-eligible articles, without resending retro notifications.
- Internal MVP acceptance фиксируется как RSS-first ingest path. Website/API/IMAP остаются в кодовой базе, но не считаются доказанными этим acceptance gate.
- Для multi-RSS polling baseline теперь используются `FETCHERS_BATCH_SIZE=100` и `FETCHERS_CONCURRENCY=4`; single-channel smoke и multi-channel proofs делят один и тот же fetcher/runtime contract.
- `source_channels.poll_interval_seconds` теперь трактуется как base/min interval; adaptive runtime truth живет в `source_channel_runtime_state` и управляет `effective_poll_interval_seconds`, `next_due_at`, backoff и overdue state без переписывания operator baseline.
- Admin surface показывает provider-agnostic scheduling health, append-only fetch history и LLM usage rollups; read-model API дополнена `/maintenance/fetch-runs`, `/maintenance/llm-reviews` и `/maintenance/llm-usage-summary`.
- Web surface умеет подключать `web_push` через service worker `/sw.js`; для browser subscription нужен `WEB_PUSH_VAPID_PUBLIC_KEY`, а notify worker дополнительно учитывает `user_profiles.notification_preferences`.
- Локальный `email_digest` delivery path идет через SMTP sink `mailpit`; для compose baseline используется `smtp://mailpit:1025`, а UI sink доступен на `http://127.0.0.1:8025`.
- Root `pnpm integration_tests` делегирует на этот же internal MVP acceptance path и не расширяет proof scope beyond RSS-first ingest.

## Manual MVP Readiness

Для ручного MVP прогона теперь есть консистентный baseline:

- admin умеет создавать и bulk-import RSS channels с `adaptiveEnabled` и `maxPollIntervalSeconds`;
- provider-wide scheduling patch позволяет массово назначать `fast=300`, `normal=900`, `slow=3600`, `daily=86400`, `three_day=259200`;
- fetchers сохраняют `source_channel_runtime_state` и append-only `channel_fetch_runs`, поэтому overdue/adaptive/failed каналы видны отдельно от `source_channels.last_*`;
- worker пишет first-class Gemini usage/cost поля в `llm_review_log`;
- public `/feed` теперь показывает system-selected статьи по article-level gate из `system_feed_results`, даже если у текущего пользователя нет ни одного `user_interest`;
- web показывает configured notification channels, working `notification_preferences`, browser-side `web_push` connect flow и расширенный lifecycle interests.

Минимальный manual checklist:

1. Поднимите stack через `pnpm dev:mvp:internal`.
2. Импортируйте RSS channels через admin single/bulk form, используя шаблон [infra/scripts/manual-rss-bundle.template.json](infra/scripts/manual-rss-bundle.template.json).
3. Назначьте часть каналов на `fast`, часть на `daily` и часть на `three_day`, затем проверьте `next due`, `overdue`, `recent failures` и fetch history в admin.
4. В `web` создайте anonymous session, убедитесь, что system-selected feed на `/` заполняется и без персонализации, затем откройте `/matches`, подключите `web_push`, включите нужные `notification_preferences`, создайте или отредактируйте interest и дождитесь compile/update path plus background historical sync.
5. Проверьте admin summary: `System Feed News`, recent fetch runs, recent LLM reviews и delivery state по user channels.

Ограничение baseline:

- фактический browser receipt для `web_push` остается manual-only proof item;
- repo не содержит канонического списка real RSS feeds, только импортный template; реальные feed URLs оператор подставляет сам.

## Targeted Smokes

1. Запустить relay smoke с хоста:

   ```sh
   pnpm test:relay:compose
   ```

2. Запустить phase-2 RSS ingest smoke с хоста:

   ```sh
   pnpm test:ingest:compose
   ```

3. Запустить deterministic multi-channel RSS proof через admin bulk flow:

   ```sh
   pnpm test:ingest:multi:compose
   ```

4. Запустить heavier 60-channel RSS soak:

   ```sh
   pnpm test:ingest:soak:compose
   ```

5. Запустить phase-2 migration и worker smoke с хоста:

   ```sh
   pnpm test:migrations:smoke
   pnpm test:normalize-dedup:compose
   ```

6. Запустить phase-3 relay routing smoke с хоста для проверки optional embed fanout:

   ```sh
   pnpm test:relay:phase3:compose
   ```

7. Запустить phase-4/5 relay routing smoke с хоста:

   ```sh
   pnpm test:relay:phase45:compose
   ```

   Этот smoke теперь подтверждает последовательный routing `article.clustered -> q.match.criteria -> article.criteria.matched -> q.match.interests`.

8. Запустить worker smokes внутри контейнера `worker` после поднятия Postgres/Redis:

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
- Article processing уже поддерживает путь `raw -> normalized -> deduped -> embedded -> clustered`, после которого system `criteria` записывают article-level gate в `system_feed_results`, а per-user personalization и notify продолжаются только для eligible статей.
- Public/system feed eligibility теперь читается из `system_feed_results`, а не из `articles.processing_state`.
- Изменения admin `interest_templates`, real `user_interests` и direct `criteria` запускают versioned compile jobs и обновляют Postgres-backed compiled/vector registries.
- Gemini является baseline provider только для criteria-scope gray-zone review; interest-side gray-zone LLM review в baseline runtime отключен.
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
