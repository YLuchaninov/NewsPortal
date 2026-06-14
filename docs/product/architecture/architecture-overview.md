# Architecture Overview

SignalOps — это локальная content platform для сбора источников, нормализации контента, отбора полезных материалов, персонализации и операторского контроля.

Самая короткая модель такая:

```text
sources -> fetchers -> PostgreSQL -> outbox -> relay -> BullMQ -> workers -> PostgreSQL -> API/admin/web/MCP
```

PostgreSQL хранит бизнес-истину. Redis, BullMQ, HNSW-индексы, snapshots и cache — рабочие и пересобираемые слои.

Audience truth split: MCP resources are operator truth for MCP sessions, product docs are developer/operator documentation truth, and `.aidp/*` is agent-runtime truth. These layers may speak to different audiences, but their shared invariants must match.

## Что входит в систему

- `runtime/node/apps/web` — пользовательское Astro SSR приложение.
- `runtime/node/apps/admin` — Astro SSR админка и операторские BFF routes.
- `runtime/python/src/signalops/api` — FastAPI read/debug/maintenance API.
- `runtime/node/services/fetchers` — Node/TypeScript сборщики RSS, website, API и IMAP-polled email источников.
- `runtime/node/services/relay` — outbox relay: читает события из PostgreSQL и отправляет тонкие jobs в BullMQ.
- `runtime/python/src/signalops/workers` — Python workers: normalization, dedup, embeddings, clustering, selection, notifications, discovery и sequence runtime.
- `runtime/node/services/mcp` — MCP control-plane для операторских инструментов.
- `runtime/node/packages/contracts` — общие типы и контракты для source/content/queue/auth.
- `runtime/node/packages/control-plane` — общая логика admin/MCP write flows.
- `infra/docker` и `infra/nginx` — локальный single-host runtime.

## Главный поток контента

1. Оператор создает source channel в админке или через control-plane.
2. Fetchers опрашивают due channels и сохраняют наблюдения, статьи или website resources в PostgreSQL.
3. Fetchers пишут тонкое событие в `outbox_events`.
4. Relay публикует sequence-managed события только через `q.sequence`, а non-sequence service events через их прямые очереди.
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

Website-источники важны отдельно: `web_resources` не являются “почти статьями” и не должны тихо превращаться в RSS. Editorial-compatible resources могут проецироваться в `signal_candidates`, но resource truth остается видимой в admin `Resources`.

Adapter selection для source channels идет через `ingress_adapter_catalog` и `source_channel_adapter_binding`. Старые RSS/API hints в `config_json` могут объяснять историю канала, но не должны быть текущей runtime truth, если binding уже есть.

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
- probation handoff depends on vNext routing policy and review gates;
- vNext candidates, probe reports, source understanding and routing decisions are the operator model;
- browser-assisted hints для website candidates не превращают source в RSS и не обходят CAPTCHA/login/manual challenge.

## Task plugins and sequences

Sequence runtime исполняет зарегистрированные TaskPlugins, а не произвольный код из админки. Plugin contract metadata виден через API/MCP/admin discovery, чтобы оператор понимал options, required context, outputs, retry class and failure codes before running or editing a sequence.

## Операторские поверхности

Оператору важны не внутренние классы, а видимые точки контроля:

- `/admin` — dashboard, channels, rules, signal_candidates, clusters, resources, reindex, observability.
- `/admin/discovery` — vNext runs, artifacts, candidates, probe reports, source understanding, routing decisions, source inventory, policies, adapter backlog, replay and rollback.
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
pnpm test:mvp:internal
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
