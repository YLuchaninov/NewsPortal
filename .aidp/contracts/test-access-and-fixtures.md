# Контракт тестового доступа и fixtures

Этот contract фиксирует runtime-истину для stateful backend testing, fixture creation и cleanup в NewsPortal.

Используй его, когда работа трогает:

- Docker Compose baseline;
- локальные PostgreSQL/Redis-backed smoke paths;
- Firebase-backed admin или anonymous auth flows;
- Mailpit delivery;
- `web_push` subscriptions и notification channels;
- source channels, discovery profiles/candidates или imported datasets;
- integration proofs, которые могут оставить durable state.

## Назначение

Сделать test access, identities, fixtures и cleanup воспроизводимыми и явными, чтобы proof runs не оставляли скрытый operational drift.

## Разрешенные environments

- `local`: канонический baseline. Разрешены `pnpm dev:mvp:internal`, related compose lifecycle commands, host-side smoke against local PostgreSQL/Redis, Mailpit, local Firebase-backed `.env.dev` setup and repo-owned fixture scripts.
- `dev`: не объявлена как стандартный baseline; используй только при явном human framing.
- `staging`: не объявлена как стандартная test environment.
- `preview`: не объявлена как стандартная test environment.
- `sandbox`: не объявлена как стандартная test environment.
- `production-like`: запрещена без explicit human approval.

## Разрешенные источники доступа

- Env vars from `.env.dev`, `.env.example`, compose env wiring and documented counterparts.
- Seed/bootstrap/runtime commands:
  - `pnpm dev:mvp:internal`
  - `pnpm test:mvp:internal`
  - `pnpm test:ingest:multi:compose`
  - `pnpm test:discovery-enabled:compose`
  - `pnpm test:discovery:examples:compose`
  - `pnpm db:seed:outbox-smoke`
  - worker smoke commands through `services/workers/app/smoke.py`
  - fetcher smoke commands through `services/fetchers/src/cli/*`
- Ephemeral credentials created by deterministic proof harnesses.
- No mandatory secrets manager path is currently declared.

## Разрешенные test identities

- Admin: allowlisted Firebase identity from `ADMIN_ALLOWLIST_EMAILS`, including run-scoped aliases such as `internal-admin-<runId>`, `rss-admin-<runId>`, `website-admin-<runId>`, `live-website-matrix-<runId>`, `automation-admin-<runId>`, `discovery-admin-<runId>` and `viewport-admin-<runId>`.
- Regular user: anonymous web session or deterministic local row such as `internal-user-<runId>@example.test` and `viewport-user-<runId>@example.test`.
- Notifications-enabled user: local user with `notification_preferences` and declared notification channel.
- Machine identity: compose services and worker/relay/fetcher/api processes using declared env contracts.
- Disabled and paid/premium reusable identities are not currently declared.

## Процедуры создания fixtures

Reusable deterministic procedures:

- `infra/scripts/test-mvp-internal.mjs`
- `infra/scripts/test-web-viewports.mjs`
- `infra/scripts/test-website-admin-flow.mjs`
- `infra/scripts/test-live-website-matrix.mjs`
- `infra/scripts/test-live-discovery-examples.mjs`
- `infra/scripts/test-discovery-pipeline-nonregression.mjs`
- `infra/scripts/test-live-discovery-yield-proof.mjs`
- `infra/scripts/test-automation-admin-flow.mjs`
- `infra/scripts/test-discovery-admin-flow.mjs`
- `infra/scripts/test-rss-multi-flow.mjs`
- `services/workers/app/smoke.py`
- `services/fetchers/src/cli/test-rss-smoke.ts`
- `services/relay/src/cli/seed-outbox-smoke.ts`

## Правила ephemeral naming

Используй видимые run-scoped names:

- `<lane>-admin-<runId>@...`
- `email+<lane>-admin-<runId>@...`
- `<lane>-user-<runId>@example.test`
- `Internal MVP RSS <runId>`
- `Viewport RSS <runId>`
- `RSS multi <runId> ...`

Не создавай persistent identities без записи в live state.

## Persistent artifacts, которые нужно отслеживать

Записывай в `.aidp/work.md`, если active work создает или меняет:

- users;
- subscriptions or device registrations;
- API/MCP tokens or keys;
- webhook endpoints;
- seeded messages or rows;
- source channels created by proof harnesses;
- `discovery_policy_profiles`;
- discovery missions/candidates/source quality snapshots when not cleaned;
- notification channel rows;
- external registrations;
- imported fixture datasets.

## Cleanup procedures

- Remove temporary users/identities if they are not reusable fixtures.
- Remove temporary `web_push` subscriptions and notification channel residue when clean completion requires it.
- Treat issued tokens as ephemeral unless they are durable seeded fixtures.
- Clean external registrations or record explicit residual cleanup gaps.
- Use item-scoped cleanup when possible.
- Do not run destructive full reset such as `pnpm dev:mvp:internal:down:volumes` silently; it must be in scope and approved/expected.

## Политика residual artifacts

If cleanup cannot be completed:

- record artifact, cleanup status and rationale in `.aidp/work.md`;
- include it in handoff;
- create explicit follow-up cleanup work if needed.

## Discovery proof notes

- Discovery proof is DDGS-first by default; Brave/Serper-backed discovery is not part of the default local proof contour.
- `pnpm test:discovery:examples:compose` is the canonical profile-backed examples entrypoint.
- `pnpm test:discovery-enabled:compose` proves bounded enabled runtime.
- Live external provider proof is allowed only as bounded evidence and may leave explicit nondeterministic proof gaps.

## Proof expectations

Stateful backend proof must show:

- behavioral truth of the affected flow;
- correct environment and identity source;
- cleanup truth or explicit residual artifact state.

Work that creates persistent artifacts is not cleanly done until artifacts are removed, intentionally retained as fixtures, or recorded with cleanup state.

## Триггеры обновления

Update this file when allowed environments, test identities, fixture scripts, cleanup commands, artifact tracking expectations or stateful proof contours change.
