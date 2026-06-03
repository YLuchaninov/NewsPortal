# E2E tests

Use this directory for browser-facing web/admin flows with the root Playwright harness.

E2E tests should prove user-visible behavior, accessibility-critical interactions, routing, and cross-page flows. Keep deterministic domain logic in `tests/unit/` and service-boundary checks in `tests/integration/`.

Run locally against already-running dev targets:

```sh
pnpm e2e_tests
```

Defaults:

- `E2E_WEB_BASE_URL=http://127.0.0.1:4321`
- `E2E_ADMIN_BASE_URL=http://127.0.0.1:4322`
- optional `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` enables the sign-in submit step
