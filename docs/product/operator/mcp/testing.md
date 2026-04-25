# Testing NewsPortal MCP Locally And Remotely

This guide separates three different things that are easy to blur together:

Quick framing:

- Audience: operator or developer choosing the right MCP proof lane for local, shared, or remote NewsPortal environments.
- Covers: deterministic local compose proof, direct HTTP smoke, and bounded remote/shared-environment checks.
- Out of scope: agent-runtime process rules, production rollout policy, and open-ended write exploration against shared environments.
- Prerequisites: reachable NewsPortal stack plus the auth/env requirements for the chosen lane.
- Expected result: you can choose one honest proof contour, run it, and know what green evidence should look like.

- local compose verification of the shipped NewsPortal stack;
- direct HTTP smoke against a reachable MCP endpoint;
- bounded remote or shared-environment checks where you must be much more conservative with writes.

## 1. Local compose baseline

Use this path when you want the canonical NewsPortal proof contour.

### Prerequisites

- valid `FIREBASE_WEB_API_KEY`
- valid `ADMIN_ALLOWLIST_EMAILS`
- Docker working locally

### Start the stack

```bash
pnpm dev:mvp:internal
```

Important local URLs:

- admin UI: `http://127.0.0.1:4322`
- nginx MCP ingress: `http://127.0.0.1:8080/mcp`

### Issue a token

1. Sign in to the admin UI.
2. Open `http://127.0.0.1:4322/automation/mcp`.
3. Create a narrow-scope token.
4. Save the secret immediately.

### Fast local smoke

Use the examples in [HTTP Smoke Examples](./http-smoke.md).

Recommended first checks:

1. `GET /mcp`
2. `initialize`
3. `tools/list`
4. `resources/read` for `newsportal://guide/server-overview`
5. `tools/call` for `admin.summary.get`

### Canonical deterministic proof

Run the shipped local matrix:

```bash
pnpm test:mcp:compose
```

Focused reruns:

```bash
pnpm test:mcp:http:auth
pnpm test:mcp:http:reads
pnpm test:mcp:http:writes
pnpm test:mcp:http:discovery
```

What these prove:

- token issuance, expiry, and revoke behavior
- `GET /mcp` and JSON-RPC discovery
- built-in resources and prompts
- article/content diagnostics and residual-analysis reads
- sequence, discovery, channel, template, and system-interest flows
- destructive-policy and scope failures
- audit and request-log evidence

## 2. Local provider-backed evidence

Use this when you want a more life-like run while still staying on the local compose baseline.

```bash
pnpm test:mcp:http:live
```

This still runs against the local NewsPortal stack, but it allows outbound provider/runtime behavior and writes `/tmp/newsportal-mcp-http-live-*.json|md` artifacts.

Use it for:

- live-like discovery and recall journeys
- bounded runtime-backed sequence execution
- classifying runtime vs provider vs usefulness residuals

Do not confuse this with testing a shared staging deployment. It is still a local NewsPortal stack plus live/provider pressure.

## 3. Non-local or shared-environment smoke

Use this path for staging or another deployed NewsPortal environment.

### Rules first

- prefer a dedicated staging environment, not production;
- use the narrowest token possible;
- start read-only;
- create only bounded disposable fixtures;
- clean them up before you leave;
- never start with destructive tools.

### Minimal remote smoke

Set the deployed endpoint and a token:

```bash
export NEWSPORTAL_MCP_URL="https://newsportal.example.com/mcp"
export NEWSPORTAL_MCP_TOKEN="npmcp_replace_with_real_token"
```

Then run:

1. `GET /mcp`
2. `initialize`
3. `tools/list`
4. `resources/read` for:
   - `newsportal://guide/server-overview`
   - `newsportal://guide/scenarios/<target-domain>`
5. `tools/call` for `admin.summary.get`

Only after that should you attempt writes.

### Recommended bounded remote write smoke

Pick one disposable workflow, not all of them at once:

- create a disposable sequence, run it, inspect it, archive it;
- create a disposable system interest, verify it, archive or delete it;
- create a disposable LLM template, verify it, archive or delete it;
- create a disposable channel only if the environment is explicitly meant for onboarding tests.

For discovery in shared environments:

- prefer read-only summary and list checks first;
- only run bounded discovery writes if the environment is intended for that and the downstream side effects are understood.

For article/content diagnostics in shared environments:

- stay read-only unless you have an explicit bounded tuning task;
- start with `articles.residuals.summary` and only then inspect `articles.residuals.list`, `articles.explain`, and `content_items.explain`;
- use `system_interest.polish`, `llm_template.tune`, or `discovery.profile.tune` as recommendation prompts, not as an excuse to skip read-after-write verification on the actual entity.

### Remote smoke checklist

- token accepted by `GET /mcp`
- JSON-RPC discovery methods succeed
- built-in NewsPortal guide resources read successfully
- article/content diagnostics and residual buckets can be read successfully
- at least one safe read-only tool succeeds
- any bounded write is read back and verified
- any disposable artifact is archived or deleted before closeout

## 4. What not to do

- do not point Anthropic remote connectors at a private NewsPortal deployment unless network reachability requirements are actually satisfied;
- do not reuse browser cookies as MCP auth;
- do not hardcode tokens into committed config files;
- do not run the local compose proof scripts and assume they are exercising a remote shared deployment;
- do not treat `pnpm test:mcp:http:live` as a production smoke against a deployed environment.

## 5. Recommended operator order

For any environment:

1. issue or rotate a scoped token
2. `GET /mcp`
3. `initialize`
4. read guide resources
5. list tools/resources/prompts
6. run read-only domain checks
7. run one bounded write scenario if needed
8. verify read-after-write
9. clean up disposable artifacts

## 6. Where the repo truth lives

- MCP contract: [.aidp/contracts/mcp-control-plane.md](../../../../.aidp/contracts/mcp-control-plane.md)
- Proof commands: [.aidp/verification.md](../../../../.aidp/verification.md)
- Admin token UI: [apps/admin/src/pages/automation/mcp.astro](../../../../apps/admin/src/pages/automation/mcp.astro)
