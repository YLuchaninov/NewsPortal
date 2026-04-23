# MCP Control Plane Contract

Этот документ фиксирует durable truth для capability `C-MCP-REMOTE-ADMIN-CONTROL-PLANE`.

## Назначение

MCP control plane добавляет для NewsPortal отдельный remote HTTP operator surface для AI clients и automation tools, но не создает второй backend и не меняет runtime ownership существующих subsystems.

## In scope

- remote HTTP MCP endpoint at `/mcp`;
- admin-issued MCP bearer tokens, их inventory, revoke/block flow и audit;
- transport-agnostic control-plane orchestration для admin/MCP writes;
- MCP tools, resources и prompts для bounded operator surfaces;
- article/content diagnostics and residual-analysis read surfaces for evidence-based tuning;
- request logging, scope enforcement и destructive confirmation policy;
- compose/nginx delivery contract.

## Out of scope

- browser-cookie reuse как MCP auth mechanism;
- public client API replacement;
- direct PostgreSQL bypass для sequence/discovery/runtime-owned writes;
- unrestricted self-modifying change-set tools;
- production OAuth rollout beyond current local/admin-token baseline.

## Current durable truth

- MCP is a control-plane transport layer, not a new source of truth.
- PostgreSQL remains the only source of truth.
- Existing runtime owners stay unchanged:
  - `sequences`, `sequence_runs`, `sequence_task_runs` and discovery maintenance flows stay FastAPI-owned and are accessed from MCP through maintenance/public HTTP surfaces via `@newsportal/sdk`;
  - `system interests`, `LLM templates`, and `channels` use shared transport-agnostic control-plane services reused by both admin BFF and MCP;
  - heavy runtime execution continues through outbox, relay, `q.sequence`, fetchers, and workers.
- MCP auth uses admin-issued bearer tokens stored hashed only; token secret is shown once at issuance and later only prefix/metadata remain visible.
- Tokens are operator-managed from admin `/automation/mcp`.
- MCP request handling must enforce explicit scopes before tool execution.
- Archive/delete/auth-widening or similar destructive actions require explicit confirmation in tool arguments; silent destructive writes are forbidden.

## Remote transport contract

- Canonical local endpoint is `/mcp` behind nginx.
- Initial transport is HTTP JSON-RPC shaped for MCP-style methods:
  - `initialize`
  - `tools/list`
  - `tools/call`
  - `resources/list`
  - `resources/read`
  - `prompts/list`
  - `prompts/get`
- Current baseline is stateless request/response over HTTP. If later streamable-session semantics are added, they must remain backward compatible with the existing local acceptance client.

## Tool and resource contract

- Tool naming stays namespaced and explicit:
  - `admin.summary.get`
  - `system_interests.*`
  - `llm_templates.*`
  - `channels.*`
  - `articles.*`
  - `content_items.*`
  - `articles.residuals.*`
  - `discovery.*`
  - `sequences.*`
  - `sequence_runs.*`
  - `web_resources.*`
  - `fetch_runs.*`
  - `llm_budget.summary`
- Resources use the `newsportal://` scheme and return high-signal operator context, not raw DB dumps.
- Prompts are guidance templates only; they do not gain write authority on their own.
- MCP should expose an explicit orientation layer for agents and operators:
  - at least one guide resource that explains what the server is for, the bounded domains it owns, and the safe read-before-write workflow;
  - at least one playbook-style resource or prompt that shows recommended operator flows for common jobs like discovery, sequence maintenance, and configuration changes;
  - the shipped guidance layer should cover the main bounded scenarios explicitly rather than stopping at one generic overview:
    - sequences
    - discovery
    - system interests
    - LLM templates
    - channels
    - article diagnostics and residual tuning
    - read-only observability
    - cleanup/destructive planning
  - this guidance layer exists to help clients discover safe usage patterns, but clients still control whether and when prompts/resources are loaded.
- Guidance content must reinforce:
  - MCP is a control-plane transport, not a second source of truth;
  - list/read-before-write is the default workflow;
  - destructive actions require explicit scope plus explicit confirmation;
  - read-after-write verification remains mandatory.

## Auth and token contract

- MCP tokens are issued only by authenticated admins.
- Tokens carry explicit scopes; absence of scope is deny-by-default.
- Current scope families:
  - `read`
  - `write.templates`
  - `write.channels`
  - `write.discovery`
  - `write.sequences`
  - `write.destructive`
  - `admin.tokens`
- Token table truth:
  - hashed secret only;
  - token prefix for operator recognition;
  - status, expiry, issuer, revoker, created/revoked timestamps;
  - last-used timestamp and additive usage metadata.
- Revoked or expired tokens must fail immediately and must not update last-used state as if they succeeded.

## Audit and observability contract

- Token lifecycle actions must write to `audit_log`.
- Mutating MCP tool calls must write to `audit_log`.
- Request-level MCP telemetry belongs in additive `mcp_request_log`.
- MCP request logging must not replace domain audit rows; it complements them.

## Admin operator surface contract

- `/automation/mcp` is the primary operator surface for:
  - issuing a token;
  - seeing token label/scopes/status/prefix/expiry/usage;
  - revoking a token;
  - reviewing MCP safety guidance.
- Admin BFF remains same-origin and thin; browser flows stay cookie-authenticated only inside admin, never reused by external MCP clients.

## Delivery contract

- `services/mcp` is a standalone Node/TypeScript service in the monorepo.
- nginx proxies `/mcp` to the MCP service on the compose baseline.
- local proof must cover:
  - token issuance;
  - authenticated MCP read;
  - article/content diagnostics and residual-analysis reads;
  - authenticated MCP write;
  - revoked-token failure;
  - nginx route reachability.

## Proof minimums

- `pnpm unit_tests`
- `pnpm typecheck`
- `pnpm test:mcp:compose`
- `git diff --check --`

When template/channel extraction changes existing operator behavior, add:

- `pnpm test:website:admin:compose`

When discovery/sequence MCP writes change maintenance/operator paths, add:

- `pnpm test:discovery:admin:compose`
- `node infra/scripts/test-automation-admin-flow.mjs`
