# Контракт runtime, migrations and derived state

## Подсистема

- Имя: local runtime delivery, SQL migrations and rebuildable derived state.
- Владельцы кода/границ: `infra/docker`, `infra/nginx`, `.env.example`, `database/migrations`, `database/ddl`, `services/relay/src/migrations.ts`, `services/indexer`, root `package.json` scripts.
- Основные runtime surfaces: Docker Compose stack, nginx front door, relay migration runner, PostgreSQL schema, HNSW index/snapshot files, local proof scripts.

## Почему нужен contract

Blueprint уже фиксирует, что PostgreSQL является source of truth, а HNSW/cache/queues являются derived state. Source audit нашел конкретную operational mechanics, которая нужна будущим агентам перед изменениями delivery или schema. Этот contract держит эти правила в `.aidp/*`, а не в chat memory.

## Ответственности

- `database/migrations/*.sql` являются ordered durable schema evolution truth.
- `database/ddl/*.sql` являются current schema snapshots/reference и не должны быть важнее migrations.
- Relay migration runner применяет sorted migrations и записывает их в `schema_migrations`; каждая migration применяется transactionally.
- Local compose baseline стартует PostgreSQL, Redis, Mailpit, migrate, relay, fetchers, worker, API, web, admin, MCP and nginx.
- nginx является local single-host front door для `/`, `/api/`, `/bff/`, `/admin/`, `/admin/bff/`, `/relay/`, `/mcp` and `/health`.
- HNSW indices and snapshots являются rebuildable derived artifacts backed by PostgreSQL registries. Consistency diagnostics should explain registry, file, count, label, dirty-state and runtime-default model/dimension drift separately so operators can choose explicit rebuild/recompile actions.

## Интерфейсы и границы

- Compose baseline files: `infra/docker/compose.yml` and `infra/docker/compose.dev.yml`.
- Dev env file, ожидаемый root scripts: `.env.dev`, обычно copied from `.env.example` and filled with local-safe secrets.
- Migration command: `pnpm db:migrate`; smoke proof: `pnpm test:migrations:smoke`.
- Indexer commands:
  - `pnpm index:rebuild:interest-centroids`
  - `pnpm index:rebuild:event-cluster-centroids`
  - `pnpm index:check:derived-vectors`
  - `pnpm index:check:interest-centroids`
  - `pnpm index:check:event-cluster-centroids`
- Index check commands возвращают non-zero exit code, когда registry/files/count/label/dirty-state inconsistent.
- `pnpm index:check:derived-vectors` является read-only combined gate для interest and event-cluster centroid HNSW state; it reports diagnostics and repair commands but does not rebuild or delete derived artifacts.

## Модель данных или состояния

- Primary durable state: PostgreSQL schema/data and `schema_migrations`.
- Derived state: HNSW files under `HNSW_INDEX_ROOT`, snapshots under `HNSW_SNAPSHOT_ROOT`, Redis queues, cache and generated DDL snapshots.
- Runtime state: compose containers, service health, Mailpit mailbox, nginx proxy state and worker polling loops.
- Index registry truth: `hnsw_registry`, `interest_vector_registry`, `event_vector_registry` plus active embedding rows.

## Runtime и delivery concerns

- `.env.example` является safe baseline с local ports, discovery disabled by default и placeholder secrets, которые нужно заменить вне throwaway local setups.
- Host local defaults включают PostgreSQL `55432`, Redis `56379`, relay `4000`, fetchers `4100`, API `8000`, web `4321`, admin `4322`, nginx `8080`, Mailpit SMTP `1025` and UI `8025`.
- `MODEL_CACHE_DIR`, `HNSW_INDEX_ROOT` and `HNSW_SNAPSHOT_ROOT` являются runtime artifact locations, не business truth.
- Shared Python API/worker images must not bake local `data` contents into the image; derived `data` is created or mounted at runtime, and the image runs as non-root `newsportal`.
- `PYTHON_APP_UID` and `PYTHON_APP_GID` are build-time controls for aligning the non-root Python image user with bind-mounted local `data` ownership when needed.
- Baseline Python API/worker images use deterministic hash embeddings by default and must not install `sentence-transformers`, `torch`, CUDA/NVIDIA packages or other heavy neural payloads from `infra/docker/python.requirements.txt`; neural embeddings are an explicit optional contour via `infra/docker/python.optional-ml-requirements.txt` and `EMBEDDING_BACKEND=sentence-transformers`.
- Built Python API/worker proof images should pass the configured `pnpm check:python-image-size` ceiling before delivery/runtime hardening stages close.
- Compose-built service images should pass `pnpm check:runtime-image-sizes` before runtime/delivery hardening stages close. Default budgets are service-specific: API/worker stay lightweight after hash-first embeddings, relay/migrate/MCP remain small Node service images, web/admin have Astro runtime headroom, and fetchers has explicit extra headroom because browser-assisted ingestion includes Playwright/Chromium.
- Production compose runtime images should pass `pnpm check:production-image-contents` after production image build. The guard checks image contents, not only Dockerfile intent, and forbids repo-owned `tests/**`, `infra/scripts/**`, `infra/fixtures/**`, `.aidp/**`, `.env*` files and derived `data/**` files from the final runtime payload. Empty runtime-created data directories are allowed.
- `pnpm release:verify` is the repo-owned non-deploy release verification gate. It may build production compose images and run product-local proof commands, but it must not publish, push, deploy or assume a production target.
- JSON fallback HNSW writer допустим, когда `hnswlib` unavailable, но это все еще derived state и его нужно check/rebuild through indexer tooling.

## Риски и proof expectations

- Migration/schema changes требуют `pnpm test:migrations:smoke` плюс targeted proof для affected API/worker/fetcher/admin/web behavior.
- Compose/nginx/env changes требуют compose startup или explicit health proof, обычно через `pnpm dev:mvp:internal` или relevant compose smoke.
- Release-ready closure requires `pnpm release:verify` unless explicitly blocked by environment constraints; any skipped release step must be named in the active item archive.
- HNSW/index registry changes требуют `pnpm index:check:derived-vectors` and, when a family is intentionally repaired, the relevant rebuild command followed by the combined check.
- Delivery changes, затрагивающие Mailpit, nginx routes или env names, должны использовать local single-host path там, где возможно, а не только direct service ports.

## Правила изменений

- Не считай generated DDL snapshots, Redis, queue payloads, HNSW files или cache source of truth.
- Не меняй local ports/env names без обновления `.env.example`, root scripts/proof expectations и этого contract.
- Не переписывай silently applied migrations, если active route не является explicit schema repair with proof and residual risk recorded.
- Обновляй этот contract, когда меняются migration runner semantics, compose service set, nginx routes, env baseline, HNSW registry/index semantics или root runtime scripts.
