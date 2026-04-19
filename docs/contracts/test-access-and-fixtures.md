# Test Access and Fixtures Contract

Этот документ фиксирует repo-specific truth для stateful backend testing, fixture creation и cleanup.

Используй его, когда работа трогает:

- Docker Compose baseline;
- локальные PostgreSQL/Redis-backed smoke paths;
- Firebase-backed admin или anonymous auth flows;
- Mailpit delivery;
- `web_push` subscriptions и notification channels;
- persistent test data, которую могут оставить integration proofs.

## Назначение

Сделать test access, identities, fixtures и cleanup воспроизводимыми и явными, чтобы локальные proof runs не оставляли скрытый operational drift.

## Allowed Environments

- `local`
  Канонический baseline. Разрешены:
  - `pnpm dev:mvp:internal` и связанные compose lifecycle commands;
  - host-side smoke against local PostgreSQL/Redis;
  - local Mailpit на compose baseline;
  - local Firebase-backed dev setup через `.env.dev`;
  - local fixture servers из repo scripts.
- `dev`
  Отдельная shared dev-среда сейчас не объявлена как стандартный baseline. Используй только при явном human framing work item.
- `staging`
  Не объявлена как стандартная test среда для этого репозитория.
- `preview`
  Не объявлена как стандартная test среда для этого репозитория.
- `sandbox`
  Не объявлена как стандартная test среда для этого репозитория.
- `forbidden without explicit approval`
  Любая production-like среда, shared live external integration или data set с неучтенными real users.

## Approved Access Sources

- `env vars`
  `.env.dev`, `.env.example`, compose env wiring и их documented counterparts.
- `seed/bootstrap command`
  `pnpm dev:mvp:internal`, `pnpm test:mvp:internal`, `pnpm test:ingest:multi:compose`, `pnpm test:discovery-enabled:compose`, `pnpm db:seed:outbox-smoke`, worker smoke commands и fetcher RSS smoke.
- `secrets manager path or mechanism`
  Сейчас отдельный secrets manager path не объявлен как обязательная часть baseline.
- `ephemeral credential mechanism`
  Script-created Firebase test identities и run-scoped passwords/aliases внутри deterministic proof harnesses.

## Approved Test Identities

- `admin`
  Allowlisted Firebase identity из `ADMIN_ALLOWLIST_EMAILS`, включая alias patterns `internal-admin-<runId>`, `rss-admin-<runId>`, `website-admin-<runId>`, `live-website-matrix-<runId>`, `automation-admin-<runId>`, `discovery-admin-<runId>` и `viewport-admin-<runId>`.
- `regular user`
  Anonymous web session или local user row, созданный deterministic proof script, включая `internal-user-<runId>@example.test` и `viewport-user-<runId>@example.test`.
- `disabled user`
  Сейчас не зафиксирован как reusable seeded identity.
- `premium or paid user`
  Сейчас не зафиксирован как reusable seeded identity.
- `notifications-enabled user`
  Local user с `notification_preferences` и подключенным notification channel.
- `machine identity`
  Compose services и worker/relay/fetcher/api processes, работающие через declared env contracts.

## Fixture Creation Procedures

- `reusable seeded fixtures`
  Worker smoke helpers и relay/fetcher smoke data, которые создаются deterministic code path-ами внутри репозитория.
- `deterministic creation scripts`
  - `infra/scripts/test-mvp-internal.mjs`
  - `infra/scripts/test-web-viewports.mjs`
  - `infra/scripts/test-website-admin-flow.mjs`
  - `infra/scripts/test-live-website-matrix.mjs` for bounded repo-owned real-site validation after local compose proof; it is intentionally supplemental rather than deterministic acceptance
  - `infra/scripts/test-live-discovery-examples.mjs`
  - `infra/scripts/test-discovery-pipeline-nonregression.mjs`
  - `infra/scripts/test-live-discovery-yield-proof.mjs`
  - `infra/scripts/test-automation-admin-flow.mjs`
  - `infra/scripts/test-discovery-admin-flow.mjs`
  - `infra/scripts/test-rss-multi-flow.mjs`
  - `services/workers/app/smoke.py`
  - `services/fetchers/src/cli/test-rss-smoke.ts`
  - `services/relay/src/cli/seed-outbox-smoke.ts`
- `ephemeral entity naming convention`
  - `internal-admin-<runId>@...`
  - `email+internal-admin-<runId>@...`
  - `rss-admin-<runId>@...`
  - `email+rss-admin-<runId>@...`
  - `website-admin-<runId>@...`
  - `email+website-admin-<runId>@...`
  - `live-website-matrix-<runId>@...`
  - `email+live-website-matrix-<runId>@...`
  - `automation-admin-<runId>@...`
  - `email+automation-admin-<runId>@...`
  - `discovery-admin-<runId>@...`
  - `email+discovery-admin-<runId>@...`
  - `viewport-admin-<runId>@...`
  - `email+viewport-admin-<runId>@...`
  - `internal-user-<runId>@example.test`
  - `viewport-user-<runId>@example.test`
  - `Internal MVP RSS <runId>`
  - `Viewport RSS <runId>`
  - `RSS multi <runId> ...`

## Discovery Proof Notes

- Discovery proof remains `DDGS-first`; Brave/Serper-backed discovery is not part of the default local proof contour.
- `infra/scripts/test-live-discovery-examples.mjs` is the canonical runtime/yield harness for live discovery case packs.
- `infra/scripts/test-discovery-pipeline-nonregression.mjs` is the canonical safety proof for discovery vs pre-existing downstream corpus stability.
- `infra/scripts/test-live-discovery-yield-proof.mjs` is the canonical bounded `3`-run aggregate yield proof.
- `Example B` and `Example C` remain required runtime proof cohorts today, but they are validation packs rather than architecture; synthetic or future case packs may participate in calibration without becoming mandatory local DB preconditions.

## Persistent Artifacts That Must Be Tracked

Отслеживай в `docs/work.md`, если active work создал или модифицировал:

- users;
- subscriptions или device registrations;
- API keys или tokens;
- webhook endpoints;
- seeded messages или rows;
- source channels, созданные proof harness-ом;
- notification channel rows;
- external registrations;
- imported fixture datasets.

## Cleanup Procedures

- `remove created users`
  Удали local/test identities, если они были созданы только для текущей работы и больше не нужны; если identity остается как repeatable fixture, зафиксируй это явно.
- `remove subscriptions or device registrations`
  Очисти временные `web_push` subscriptions и local notification channel residue, если work item требует clean completion.
- `revoke keys or tokens`
  Временные issued tokens должны считаться ephemeral; persistent issued secrets без cleanup не оставляй.
- `remove external registrations`
  Если внешняя integration создала durable registration, cleanup обязателен или должен быть явно записан как residual gap.
- `reset seeded or imported data`
  При необходимости используй item-scoped cleanup или full local reset только в пределах одобренного scope. Destructive reset вроде `pnpm dev:mvp:internal:down:volumes` не выполняй молча.

## Residual Artifact Policy

Если cleanup не может быть завершен в рамках active work:

- запиши artifact, cleanup status и rationale в `docs/work.md`;
- зафиксируй это в handoff;
- если нужен отдельный cleanup item, создай его явно, а не оставляй residue молча.

## Proof Expectations

Stateful backend testing должна доказывать одновременно:

- behavioral truth затронутого flow;
- cleanup truth или честно записанный residual artifact state.

Если work touches stateful boundaries, сверяйся не только с `docs/verification.md`, но и с этим contract doc.

## Update Triggers

Обновляй этот файл, когда меняются:

- допустимые test environments;
- approved access sources;
- supported test identities;
- deterministic fixture procedures;
- cleanup commands или cleanup policy;
- persistent artifact tracking expectations.
