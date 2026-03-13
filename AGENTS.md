# AGENTS.md

## Source of truth
- Always read `docs/blueprint.md` before making architecture, scaffolding, schema, queue, or service-boundary changes.
- If implementation ideas conflict with `docs/blueprint.md`, follow the blueprint unless the user explicitly overrides it.

## Project summary
This repository is a polyglot monorepo for a news platform.

Baseline architecture:
- Astro for `apps/web` and `apps/admin`
- Node/TypeScript for `services/fetchers` and `services/relay`
- Python for `services/api`, `services/workers`, `services/ml`, and `services/indexer`
- PostgreSQL is the only source of truth
- Redis + BullMQ are transport only
- Consistency between DB and queues must use outbox/inbox patterns
- Docker Compose is the official local baseline

## Repository shape
Expected top-level structure:

- `apps/web`
- `apps/admin`
- `services/fetchers`
- `services/relay`
- `services/api`
- `services/workers`
- `services/ml`
- `services/indexer`
- `packages/ui`
- `packages/contracts`
- `packages/sdk`
- `packages/config`
- `database/migrations`
- `database/ddl`
- `database/seeds`
- `infra/docker`
- `infra/nginx`
- `infra/systemd`
- `infra/scripts`
- `data/models`
- `data/indices`
- `data/snapshots`
- `data/logs`
- `docs`

## Architecture constraints
- Do not replace Astro with Next.js or any other frontend framework.
- Do not replace PostgreSQL with SQLite as the main database.
- Do not use `pgvector` as the primary ANN baseline.
- Do not add Kafka or Kubernetes in the baseline.
- Do not make internal REST between Astro and Python the main transport path for heavy processing.
- Do not put large article payloads into queues; queue payloads should be IDs and compact metadata only.
- Do not move heavy NLP or matching logic into frontend runtimes.
- Do not invent business logic that is not defined yet; leave clear TODOs instead.

## Service responsibilities
- `apps/web`: user-facing product UI
- `apps/admin`: operational/admin UI
- `services/fetchers`: ingest from RSS, websites, email feeds, external APIs; write raw article + outbox event
- `services/relay`: read outbox events, publish jobs to BullMQ, manage delivery status / re-drive
- `services/api`: thin read/debug/explain API only
- `services/workers`: normalize, dedup, embed, cluster, match, notify, reindex orchestration
- `services/ml`: preprocessing, feature extraction, embeddings, compilers, scoring helpers
- `services/indexer`: HNSW rebuilds, backfills, cleanup, retention

## Shared packages
- `packages/contracts`: DTOs, queue payload schemas, event schemas, JSON schemas, OpenAPI fragments
- `packages/sdk`: generated TS SDK for web/admin
- `packages/ui`: shared UI primitives based on shadcn/ui
- `packages/config`: theme, brand, notification, prompt, public API, and source bundle config

## Delivery style
- Prefer small, reviewable changes.
- For large tasks, first propose a short plan, then implement.
- Scaffold first; do not attempt the entire product in one pass.
- Prefer minimal runnable foundations over broad fake implementations.
- After edits, run the smallest meaningful validation and report what was checked.

## Priority order for greenfield setup
1. Create repository skeleton and workspace files.
2. Create infra baseline (`docker compose`, env files, placeholders).
3. Create database folders, initial DDL/migration placeholders, and contracts.
4. Create minimal service/app placeholders.
5. Add docs for local bootstrap and task boundaries.

## Done criteria for scaffolding tasks
- Repository tree matches the blueprint.
- Shared workspace config exists.
- Local bootstrap steps are documented.
- No architecture drift from the blueprint.