# Local Product Testing

Этот документ задает текущий локальный internal product testing contour для NewsPortal.

## Scope

В обязательном локальном product cycle сейчас входят:

- RSS ingestion через deterministic local fixture feed и RSS smoke;
- website ingestion, `/admin/resources`, projected editorial rows and resource-only rows;
- web anonymous user flow: `/`, `/matches`, `/content/*`, `/saved`, `/following`, `/settings`, `/notifications`;
- admin/operator flow for RSS/website channels, templates, articles, reindex, automation/outbox and observability;
- local `email_digest` delivery via Mailpit;
- discovery enabled/runtime/admin/examples/yield proof when running the full contour;
- MCP deterministic and live HTTP proof;
- desktop/tablet/mobile viewport proof and UI button audit.

Parked for this contour:

- Telegram ingestion;
- inbound Email IMAP ingestion;
- API source ingestion;
- required Telegram delivery proof;
- `youtube` source onboarding;
- production deploy or release/package proof.

`email_digest` remains in scope because it is outbound delivery through the local Mailpit sink, not inbound email ingestion. FastAPI read/maintenance endpoints remain in scope because they are product read surfaces, not API source ingestion.

## Commands

Use the core contour for deterministic local product confidence:

```sh
pnpm test:product:local:core
```

It runs:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm unit_tests`
- `pnpm integration_tests`
- `pnpm dev:mvp:internal`
- `pnpm test:website:compose`
- `pnpm test:website:admin:compose`
- `pnpm test:automation:admin:compose`
- `pnpm test:mcp:compose`
- `pnpm test:web:viewports`
- `pnpm test:web:ui-audit`

Use the full contour when live/provider lanes are intentionally part of the run:

```sh
pnpm test:product:local:full
```

It includes the core contour plus discovery, live website matrix and live MCP HTTP proof.

Use cleanup mode after a manual run to emit the current cleanup checklist without deleting local state:

```sh
pnpm test:product:local:cleanup
```

All three commands write evidence artifacts under `/tmp/newsportal-product-local-<mode>-<runId>.json` and `.md`.

## Environment Preflight

Core requires:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_WEB_API_KEY`
- `ADMIN_ALLOWLIST_EMAILS`
- `APP_SECRET`
- `PUBLIC_API_SIGNING_KEY`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `GEMINI_BASE_URL`
- `EMAIL_DIGEST_SMTP_URL`

Full additionally requires discovery to be intentionally enabled and configured. `IMAP_*`, API source credentials and `TELEGRAM_BOT_TOKEN` are not required for this contour.

## Acceptance

A green core run means RSS, website/resources, web/admin product flows, local digest delivery, MCP deterministic checks and browser UI checks are working on the local stack.

A green full run means the same baseline also survived the enabled discovery/live-provider and live MCP/website evidence lanes. Live lanes can still produce provider/yield residuals; classify those from the generated artifacts before treating them as product regressions.

## Cleanup

Before closing a product testing cycle:

- keep the generated `/tmp/newsportal-product-local-*` artifacts;
- confirm test Firebase identities were deleted by the harnesses;
- confirm disposable MCP tokens were cleaned by the MCP harness;
- record or reset temporary source channels, discovery profiles/candidates, notification rows and Mailpit messages;
- use `pnpm dev:mvp:internal:down` for normal shutdown;
- use `pnpm dev:mvp:internal:down:volumes` only for intentional local state reset.
