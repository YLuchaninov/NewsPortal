# Public Beta Readiness

Этот документ фиксирует текущий Public Beta contract SignalOps. Он не заменяет код, миграции или package scripts: если текст спорит с системой, исправлять нужно текст или proof.

## Цель Beta

Public Beta означает, что один оператор может развернуть SignalOps на single-host Docker Compose, подключить реальные beta credentials, управлять источниками через admin/MCP и доказать локально, что ingestion, selection, operator visibility, auth boundaries and delivery checks работают.

Целевой deployment target: single-host Compose + nginx. Kubernetes, managed cloud migration and public multi-tenant hardening остаются вне этого beta contract.

## Provider Matrix

Source of truth в коде: `SIGNALOPS_PROVIDER_CAPABILITIES` из `runtime/node/packages/contracts`.

| Lane | Status | Beta expectation |
| --- | --- | --- |
| `rss` | `beta_runtime` | Runtime ingest, admin create/import, deterministic proof. |
| `website` | `beta_runtime` | Runtime ingest, resources/projection visibility, deterministic proof. |
| `api` | `beta_runtime` | Runtime ingest through explicit mapping, deterministic provider fixture proof. |
| `email_imap` | `beta_runtime` | Runtime ingest with mailbox config, deterministic provider fixture proof. |
| `telegram` | `delivery_only` | Notification delivery lane only; not source ingestion. |
| `youtube` | `future_hidden` | Declared/future value only; not visible as a normal beta source provider. |

External live API/IMAP targets are diagnostic until real beta-owned test targets exist. Their absence must not fail deterministic beta readiness when provider fixtures pass.

## Command Taxonomy

Canonical:

- `pnpm ci:fast` — fast local confidence.
- `pnpm test:product:local:core` — deterministic local product contour.
- `pnpm test:product:local:full` — extended local contour with gated discovery/live evidence.
- `pnpm test:product:beta-readiness` — writes `signalops-product-beta-readiness-proof`.
- `pnpm release:beta:verify` — Public Beta release gate; requires real `.env.prod`.

Required supporting checks:

- `pnpm check:control-plane-ownership`
- `pnpm check:beta-route-exposure`
- `pnpm check:prod-env`
- `pnpm check:secret-leaks`

Diagnostic:

- `pnpm diagnostic:product:total-live`
- Discovery live-provider flows
- website live matrix
- hard-sites browser-assisted proof

Website live matrix residuals are weak/diagnostic by default when they are classified as external blocks, unsupported challenges or partial external shapes. Set `SIGNALOPS_STRICT_LIVE_INTERNET=1` only when the operator intentionally wants those classified live-internet residuals to become hard failures.

Retired legacy proof scripts are not Public Beta gates.

## Production/Beta Runtime Contract

Production beta uses:

- `.env.prod` copied from `.env.prod.example` and validated by `pnpm check:prod-env`;
- `infra/docker/compose.yml` + `infra/docker/compose.prod.yml`;
- `infra/nginx/beta.conf`;
- `pnpm ops:beta <up|down|logs|status|backup|restore-dry-run>`.

Only nginx is public in the beta compose path. Postgres, Redis, API, web, admin, MCP, relay and fetchers stay on the internal compose network unless the dev overlay is used.

Required prod posture:

- `SIGNALOPS_COOKIE_SECURE_POLICY=always`
- `SIGNALOPS_API_CONTENT_AUTH_REQUIRED=true`
- `SIGNALOPS_WEB_TEST_AUTH_ENABLED=false`
- real Firebase config/admin credentials
- real `APP_SECRET`, `PUBLIC_API_SIGNING_KEY`, VAPID keys and SMTP settings
- TLS certificates mounted at `data/tls/fullchain.pem` and `data/tls/privkey.pem`

## Ops Contract

Before beta migration or deployment:

1. Run `pnpm check:prod-env`.
2. Run `pnpm check:beta-route-exposure`.
3. Run `pnpm ops:beta backup` against the current host if data exists.
4. Keep the generated dump under `data/backups/` or another operator-owned backup location.
5. Use `pnpm ops:beta restore-dry-run <backup.sql>` to verify a backup artifact shape before relying on it.

`pnpm ops:beta status` is the first beta status report: compose service state, PostgreSQL checks for outbox/fetch/channel status, and Redis ping. Service health is not the same as product readiness; use the product gates above before claiming beta readiness.

## Acceptance

Public Beta is ready only when:

- `pnpm release:beta:verify` passes with real `.env.prod`;
- the beta proof artifact has `kind=signalops-product-beta-readiness-proof` and `finalVerdict=pass`;
- admin can create/import RSS, website, API and Email IMAP fixture-backed channels;
- operator surfaces show fetch history/resources/signals/selection state;
- MCP read/write scope tests pass;
- backup and restore dry-run contract is documented and available.
