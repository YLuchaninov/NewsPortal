# Контракт MCP control plane

Этот contract обязателен, когда работа трогает `services/mcp`, `/mcp`, MCP tokens/scopes, MCP tools/resources/prompts, admin `/automation/mcp`, MCP audit/request logging or MCP compose/nginx delivery.

## Назначение

MCP control plane adds a remote HTTP operator surface for AI clients and automation tools. It is a transport/control layer, not a second backend and not a new source of truth.

## In scope

- HTTP MCP endpoint `/mcp`.
- Admin-issued bearer tokens, inventory, revoke/block flow and audit.
- Shared control-plane orchestration for admin/MCP writes.
- MCP tools/resources/prompts for bounded operator surfaces.
- Article/content diagnostics and residual-analysis reads.
- Request logging, scope enforcement and destructive confirmation policy.
- Compose/nginx delivery.

## Out of scope

- Browser-cookie reuse as MCP auth.
- Replacing public client API.
- Direct PostgreSQL bypass for runtime-owned writes.
- Unrestricted self-modifying tools.
- Production OAuth rollout beyond current local/admin-token baseline.

## Runtime ownership

- PostgreSQL remains source of truth.
- MCP reads/writes through existing owners:
  - sequence/discovery maintenance flows through FastAPI/SDK;
  - system interests, LLM templates and channels through shared control-plane services;
  - heavy execution through outbox, relay, `q.sequence`, fetchers and workers.
- MCP tokens are stored hashed only; token secret is shown once.
- Scopes are deny-by-default.
- Destructive actions require explicit confirmation in tool arguments.

## Transport contract

- Canonical local endpoint is `/mcp` behind nginx.
- HTTP JSON-RPC shaped methods include initialize, tools/list, tools/call, resources/list/read, prompts/list/get.
- Current baseline is stateless request/response; future streamable sessions must remain backward compatible with local acceptance client.

## Tool/resource contract

Tool names are explicit/namespaced, including `admin.summary.get`, `system_interests.*`, `llm_templates.*`, `channels.*`, `articles.*`, `content_items.*`, `content_analysis.*`, `content_entities.*`, `content_labels.*`, `content_filter_policies.*`, `content_filter_results.*`, `discovery.*`, `sequences.*`, `web_resources.*`, `fetch_runs.*`, `llm_budget.summary`.

Resources use `newsportal://` and should return high-signal operator context, not raw DB dumps. Prompts provide guidance only and do not gain write authority.

## Auth, audit and observability

- Tokens carry explicit scopes such as `read`, `write.templates`, `write.channels`, `write.discovery`, `write.sequences`, `write.destructive`, `admin.tokens`.
- Revoked/expired tokens fail immediately and should not update last-used as successful.
- Token lifecycle and mutating MCP tool calls write `audit_log`.
- Request-level telemetry writes additive `mcp_request_log`.

## Proof expectations

- `pnpm unit_tests`
- `pnpm typecheck`
- `pnpm test:mcp:compose`
- `git diff --check --`
- Add `pnpm test:website:admin:compose` when template/channel extraction changes operator behavior.
- Add `pnpm test:discovery:admin:compose` or automation flow proof when discovery/sequence MCP writes change maintenance paths.

## Update triggers

Update when MCP endpoint shape, token/scopes, destructive policy, tool/resource/prompt catalog, audit logging, admin token UI or compose/nginx delivery changes.
