# Manual MVP Runbook

Этот runbook нужен для локального ручного прохода NewsPortal. Он не заменяет automated tests, но помогает человеку увидеть систему живьем.

## Перед стартом

Нужно:

- зависимости Node: `pnpm install`;
- Docker Compose;
- `.env.dev`;
- Firebase setup для admin/web auth;
- Python QA dependencies, если будете запускать полный lint: `python -m pip install -r infra/docker/python.dev-requirements.txt`.

Для Firebase используйте [firebase_setup.md](./setup/firebase_setup.md).

## Поднять локальный stack

```sh
pnpm dev:mvp:internal
```

Проверьте health:

- `http://127.0.0.1:4321/api/health`
- `http://127.0.0.1:4322/api/health`
- `http://127.0.0.1:8000/health`
- `http://127.0.0.1:8080/health`
- `http://127.0.0.1:8025/`

Если stack уже собран и нужен запуск без rebuild:

```sh
pnpm dev:mvp:internal:no-build
```

## Первый операторский проход

1. Откройте `/admin`.
2. Войдите admin-пользователем.
3. Откройте `Channels`.
4. Создайте RSS source или импортируйте небольшой bundle.
5. Дождитесь fetch run.
6. Проверьте, что появились articles.
7. Откройте `Rules` и создайте system interests.
8. Если правила должны примениться к старому контенту, запустите reindex/backfill.
9. Проверьте `Articles`, `Clusters`, `Observability`.

Ожидаемый результат: материал проходит ingest -> processing -> selection, а оператор видит причины и состояние.

## Website lane

Для website source проверяйте не только `Articles`.

1. Создайте `website` channel.
2. Дождитесь poll.
3. Откройте `Resources`.
4. Проверьте найденные resources, provenance and projection state.
5. Для website source отделяйте acquisition/projection proof от downstream selection proof: `web_resources` могут остаться resource-only или спроецироваться в `articles`, а projected rows могут дальше получить `final_decision=rejected`.
6. Если сайт JS-heavy и static path не помогает, включайте browser fallback только явно.

Перед тем как считать lane рабочим proof, используйте:

```sh
pnpm test:website:compose
pnpm test:website:admin:compose
pnpm test:hard-sites:compose
```

## Discovery lane

Discovery по умолчанию выключен.

Для ручной проверки:

1. Включите нужные env значения.
2. Запустите bounded smoke:

   ```sh
   pnpm test:discovery-enabled:compose
   ```

3. Для operator/API/MCP acceptance используйте touched-surface proof: `pnpm test:mcp:http:discovery`, targeted admin/API tests, `pnpm unit_tests:ts -- mcp-control-plane`.
4. Для deterministic vNext full-flow simulation без внешнего search/LLM используйте `pnpm test:discovery:vnext-flow`.

После этого можно проверять `/admin/discovery`: runs, artifacts, candidates, probe reports, source understanding, routing decisions, source inventory, policies, adapter backlog, replay and rollback.

## MCP lane

MCP нужен для operator tools.

Базовая проверка:

```sh
pnpm test:mcp:compose
```

HTTP группы:

```sh
pnpm test:mcp:http:auth
pnpm test:mcp:http:reads
pnpm test:mcp:http:writes
pnpm test:mcp:http:discovery
```

Подробнее: [MCP docs](./mcp/README.md).

## Ingress adapter lane

Admin `/ingress-adapters` управляет catalog/read-detail/create-edit declarative API adapters, channel binding card, legacy fallback readiness and dry-run preview. System/builtin adapters are read-only; custom declarative adapters cannot carry secrets and are limited to bounded JSON/NDJSON recipes with GET or static non-secret JSON POST.

Channel adapter truth is `source_channel_adapter_binding`. New admin/channel saves create or preserve this binding; legacy `config_json.adapterStrategy` and old API `adapterKey` may remain as historical JSON diagnostics, but runtime selection and read-model resolution ignore them. `ingress.adapters.legacy_fallback_report` is now readiness evidence: removal stays safe only when every active supported channel has a valid enabled binding and clean smoke proof shows zero historical `legacy_config` fetch-run resolutions.

Dry-run is preview-only: it must not write `articles`, `web_resources`, `fetch_cursors`, `outbox_events` or `channel_fetch_runs`.

## Delivery checks

Mailpit доступен на `http://127.0.0.1:8025/`. Используйте его для локальной проверки email digest без реальной отправки.

Web push и Telegram требуют отдельного env и не должны случайно включаться в обычный локальный проход.

## Нормальное завершение

Остановить stack без удаления volumes:

```sh
pnpm dev:mvp:internal:down
```

Полный reset локального состояния:

```sh
pnpm dev:mvp:internal:down:volumes
```

Используйте reset только когда точно хотите стереть локальную PostgreSQL/Redis state.

## Что считать успешным ручным проходом

- Health endpoints green.
- Admin login работает.
- RSS ingest дает articles.
- Website ingest дает visible resources.
- System interests влияют на selection.
- Reindex/backfill видим как операторский job.
- Observability объясняет fetch/selection/LLM/discovery state.
- Нет скрытых внешних side effects.

## Что не входит в обязательный manual baseline

- Production deploy.
- Kubernetes or multi-host deployment.
- YouTube ingestion.
- Telegram ingestion as mandatory proof.
- Browser bypass для CAPTCHA/login/manual challenge.
- Live discovery без явного env/proof.
