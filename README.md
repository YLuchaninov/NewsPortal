# NewsPortal

Internal local MVP for a polyglot news platform monorepo.

This repository now includes a local MVP baseline for:

- PostgreSQL as the single source of truth;
- Redis + BullMQ as transport only;
- SQL migrations from scratch;
- outbox relay publishing thin jobs from PostgreSQL into BullMQ;
- RSS fetchers with cursor-aware raw article persistence;
- Python normalize + dedup workers consuming BullMQ jobs with inbox idempotency;
- Python embed + cluster + match + notify + Gemini-review workers consuming BullMQ jobs with inbox idempotency;
- phase-2 article tables for raw, normalized, and deduped state;
- phase-3 article feature extraction, embedding registries, compiled interest/criterion state, and HNSW registry plumbing;
- phase-4 matching, notification, moderation, reactions, prompt-template, and audit tables;
- base foundation tables for users, roles, profiles, channels, outbox, and inbox idempotency;
- Astro web/admin apps with Firebase-backed session bridges and local write routes;
- FastAPI read/debug/explain endpoints for articles, clusters, notifications, channels, templates, and maintenance views;
- multi-provider fetchers for RSS, website/http, external JSON APIs, and IMAP-polled email feeds;
- nginx front door for local single-host routing.

YouTube and browser-heavy anti-bot fetchers remain future-ready only.

## Source of Truth

- [docs/blueprint.md](docs/blueprint.md)
- [AGENTS.md](AGENTS.md)

## Foundation Layout

```text
apps/
  web/      Astro app with user-facing health endpoint
  admin/    Astro app with admin health endpoint
services/
  fetchers/  Node/TypeScript RSS ingest service + smoke CLI
  relay/    Node/TypeScript outbox relay + migration/test CLI
  api/      FastAPI thin read/debug baseline with health endpoint
  workers/  Python normalize, dedup, embed, and compile workers consuming BullMQ queues
  ml/       Shared Python feature extraction, embedding, and compiler logic
  indexer/  Shared Python HNSW rebuild and consistency tooling
packages/
  contracts/  Shared TS contracts for health, auth boundary, and queue payloads
database/
  migrations/  Ordered SQL migrations
  ddl/         Current schema snapshot
infra/
  docker/      Compose baseline and Dockerfiles
```

## Local Bootstrap

1. Install Node dependencies:

   ```sh
   pnpm install
   ```

2. Start the local MVP stack:

   ```sh
   docker compose -f infra/docker/compose.yml up --build -d postgres redis migrate relay fetchers worker api web admin nginx
   ```

3. Run the relay smoke test from the host:

   ```sh
   pnpm test:relay:compose
   ```

4. Run the phase-2 RSS ingest smoke test from the host:

   ```sh
   pnpm test:ingest:compose
   ```

5. Run the phase-2 migration and worker smoke tests from the host:

   ```sh
   pnpm test:migrations:smoke
   pnpm test:normalize-dedup:smoke
   ```

6. Run the phase-3 relay routing smoke test from the host to exercise optional embed fanout:

   ```sh
   pnpm test:relay:phase3:compose
   ```

7. Run the phase-4/5 relay routing smoke test from the host:

   ```sh
   docker compose -f infra/docker/compose.yml exec -T relay pnpm --filter @newsportal/relay test:phase45-routing
   ```

8. Run the worker smokes inside the `worker` container after provisioning Postgres/Redis:

   ```sh
   pnpm test:interest-compile:compose
   pnpm test:criterion-compile:compose
   pnpm test:cluster-match-notify:compose
   ```

## Key Commands

- `pnpm check:scaffold`
- `pnpm db:migrate`
- `pnpm db:seed:outbox-smoke`
- `pnpm fetch:rss:once`
- `pnpm index:check:interest-centroids`
- `pnpm index:rebuild:interest-centroids`
- `pnpm test:cluster-match-notify:compose`
- `pnpm test:criterion-compile:smoke`
- `pnpm test:criterion-compile:compose`
- `pnpm test:embed:compose`
- `pnpm test:embed:smoke`
- `pnpm test:ingest:compose`
- `pnpm test:interest-compile:compose`
- `pnpm test:interest-compile:smoke`
- `pnpm test:migrations:smoke`
- `pnpm test:normalize-dedup:compose`
- `pnpm test:normalize-dedup:smoke`
- `pnpm test:relay`
- `pnpm test:relay:phase3`
- `pnpm test:relay:compose`
- `docker compose -f infra/docker/compose.yml exec -T relay pnpm --filter @newsportal/relay test:phase45-routing`
- `pnpm test:relay:phase3:compose`
- `pnpm typecheck`

## Health Endpoints

- `web`: `http://127.0.0.1:4321/api/health`
- `admin`: `http://127.0.0.1:4322/api/health`
- `nginx`: `http://127.0.0.1:8080/health`
- `api`: `http://127.0.0.1:8000/health`
- `relay`: `http://127.0.0.1:4000/health`
- `fetchers`: internal container health on `http://127.0.0.1:4100/health`
- `postgres`: `127.0.0.1:55432`
- `redis`: `127.0.0.1:56379`

## Current Scope

- Queue payloads stay thin and contain only IDs plus compact metadata.
- Article processing now supports `raw -> normalized -> deduped -> embedded -> clustered -> matched -> notified`.
- Interest and criterion edits trigger versioned compile jobs and update Postgres-backed compiled/vector registries.
- Gemini is the gray-zone LLM provider baseline for local MVP review flows.
- Firebase-backed anonymous web sessions and non-anonymous admin sessions are wired through Astro BFF routes.
- `./data` is bind-mounted into Python services so derived models, HNSW indices, snapshots, and logs survive container rebuilds.
- HNSW remains derived state; both `interest_centroids` and `event_cluster_centroids` are rebuildable from PostgreSQL.

## RSS Smoke Verification

The ingest smoke test provisions a temporary RSS channel inside the running `fetchers` container, serves a local fixture feed, and verifies:

- one article row reaches `raw -> normalized -> deduped`;
- one `article_external_refs` row is written;
- `etag` and `timestamp` fetch cursors are updated;
- `article.ingest.requested` and `article.normalized` are both published from outbox;
- `worker.normalize` and `worker.dedup` are recorded in `inbox_processed_events`;
- re-fetching the same feed does not create duplicate articles.

Useful verification queries after the smoke test:

```sql
select doc_id, processing_state, normalized_at, deduped_at, canonical_doc_id, family_id
from articles
order by ingested_at desc
limit 5;
```

```sql
select consumer_name, event_id, processed_at
from inbox_processed_events
order by processed_at desc
limit 10;
```
