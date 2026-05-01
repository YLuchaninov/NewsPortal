# Architecture Overview

NewsPortal — это локальная content platform для сбора источников, нормализации контента, отбора полезных материалов, персонализации и операторского контроля.

Самая короткая модель такая:

```text
sources -> fetchers -> PostgreSQL -> outbox -> relay -> BullMQ -> workers -> PostgreSQL -> API/admin/web/MCP
```

PostgreSQL хранит бизнес-истину. Redis, BullMQ, HNSW-индексы, snapshots и cache — рабочие и пересобираемые слои.

## Что входит в систему

- `apps/web` — пользовательское Astro SSR приложение.
- `apps/admin` — Astro SSR админка и операторские BFF routes.
- `services/api` — FastAPI read/debug/maintenance API.
- `services/fetchers` — Node/TypeScript сборщики RSS, website, API и IMAP-polled email источников.
- `services/relay` — outbox relay: читает события из PostgreSQL и отправляет тонкие jobs в BullMQ.
- `services/workers` — Python workers: normalization, dedup, embeddings, clustering, selection, notifications, discovery и sequence runtime.
- `services/mcp` — MCP control-plane для операторских инструментов.
- `packages/contracts` — общие типы и контракты для source/content/queue/auth.
- `packages/control-plane` — общая логика admin/MCP write flows.
- `infra/docker` и `infra/nginx` — локальный single-host runtime.

## Главный поток контента

1. Оператор создает source channel в админке или через control-plane.
2. Fetchers опрашивают due channels и сохраняют наблюдения, статьи или website resources в PostgreSQL.
3. Fetchers пишут тонкое событие в `outbox_events`.
4. Relay публикует job в BullMQ, чаще всего через sequence-managed путь `q.sequence`.
5. Workers читают job, снова загружают нужные данные из PostgreSQL, выполняют шаги обработки и пишут результат обратно.
6. API, admin, web и MCP читают уже материализованную правду из PostgreSQL.

Важная деталь: job не должен нести большой payload. Очередь говорит “что случилось”, а worker сам читает authoritative state из базы.

## Источники

Поддерживаемые provider types:

- `rss` — RSS, Atom и JSON Feed внутри одного adapter boundary.
- `website` — сайты, sitemap/section/homepage resources и browser-assisted fallback для публичных JS-heavy страниц.
- `api` — JSON endpoint ingest с явным mapping.
- `email_imap` — mailbox ingest для press inboxes и sender filters.
- `youtube` — значение в модели provider types, без полноценного operator runtime в текущем baseline.

Website-источники важны отдельно: `web_resources` не являются “почти статьями” и не должны тихо превращаться в RSS. Editorial-compatible resources могут проецироваться в `articles`, но resource truth остается видимой в admin `Resources`.

## Selection и personalization

Система сначала строит общий system-selected слой, а уже потом персонализацию.

```text
document observations
-> deduplicated documents
-> story clusters / verification
-> interest filter results
-> final_selection_results
-> system-selected feed
-> optional user matches / saved / following / notifications
```

`final_selection_results` — основная implementation truth для отбора. `system_feed_results` остается ограниченной compatibility projection и не должен становиться вторым центром принятия решений.

LLM не является горячим путем для каждой статьи. Он используется как bounded review для серых зон, когда policy и бюджет это разрешают.

## Discovery

Discovery помогает находить новые источники, но не должен самовольно расширять ingest рискованными sources.

Правила:

- по умолчанию discovery выключен;
- live search и LLM требуют явных env/config;
- auto-promotion зависит от profile policy и review gates;
- graph-first missions и independent recall — разные, но связанные пути;
- browser-assisted hints для website candidates не превращают source в RSS и не обходят CAPTCHA/login/manual challenge.

## Операторские поверхности

Оператору важны не внутренние классы, а видимые точки контроля:

- `/admin` — dashboard, channels, rules, articles, clusters, resources, reindex, observability.
- `/admin/discovery` и соседние discovery routes — missions, profiles, recall, candidates, sources.
- `/maintenance/*` FastAPI endpoints — read/debug/maintenance контур.
- MCP service — безопасный control-plane для внешних operator tools.
- Mailpit в dev compose — локальная проверка email delivery без реальных писем.

## Auth и роли

Firebase подтверждает identity. После bootstrap локальная PostgreSQL-модель users/roles решает authorization. Admin allowlist помогает первому входу, но не заменяет локальные роли.

Web anonymous sessions, admin sign-in, cookies, nginx `/admin` routing и BFF paths должны оставаться раздельными.

## Runtime baseline

Локальный baseline — Docker Compose:

```sh
pnpm dev:mvp:internal
```

Обычные gates:

```sh
pnpm lint
pnpm typecheck
pnpm unit_tests
pnpm integration_tests
```

Полный продуктовый локальный контур:

```sh
pnpm test:product:local:core
pnpm test:product:local:full
```

## Что нельзя ломать

- PostgreSQL остается бизнес-истиной.
- Redis/BullMQ остаются transport, а не state store.
- Heavy processing остается async через outbox/relay/workers.
- Website resources видимы как first-class layer.
- System selection не смешивается с personalization.
- Historical replay/backfill не рассылает retro notifications.
- Discovery и browser assistance остаются safe-by-default.
- Docs объясняют систему, но не заменяют `.aidp/*`, migrations, contracts и код.
