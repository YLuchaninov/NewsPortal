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
- HTTP JSON-RPC shaped methods include initialize, tools/list, tools/call, resources/list/read/subscribe/unsubscribe, prompts/list/get.
- `POST /mcp` remains direct JSON-RPC request/response for repo proof harnesses and Streamable HTTP-compatible clients that accept JSON responses.
- `GET /mcp` with ordinary JSON accept headers remains lightweight server metadata for operator smoke.
- `GET /mcp` with `Accept: text/event-stream` opens an authenticated SSE session for clients that require legacy EventSource transport, emits an `endpoint` event for `/mcp/messages?sessionId=...`, and sends JSON-RPC responses back as `event: message` SSE frames.
- `/mcp/messages` is a session message endpoint owned by the MCP service and routed through nginx for SSE clients; it must not become a separate unauthenticated API surface.
- Initialize negotiates supported protocol versions and currently supports `2025-06-18`, `2025-03-26`, and `2024-11-05`.
- Initialize returns concise server `instructions` with critical read-before-write, ongoing-operations, cleanup, destructive-confirmation, schema, token-inventory, and external-content trust guidance. These instructions are the compatibility baseline for clients that do not surface resources/prompts.

## Tool/resource contract

Tool names are explicit/namespaced, including `admin.summary.get`, `system_interests.*`, `llm_templates.*`, `channels.*`, `articles.*`, `content_items.*`, `content_analysis.*`, `content_entities.*`, `content_labels.*`, `content_filter_policies.*`, `content_filter_results.*`, `discovery.*`, `sequences.*`, `web_resources.*`, `fetch_runs.*`, `llm_budget.summary`, and `operator.*` operational intelligence/read-back tools.
All MCP tools declare shared JSON input schemas before handler work. Mutating MCP tools also declare a result schema and validate the returned value at the execution boundary before responding. Write tools are a strict typed facade, not a thin backend proxy: JSON-string payloads, nested `payload.payload` envelopes, unknown fields and wrong aliases must be rejected at the MCP boundary with JSON-RPC `-32602` before SDK/API/backend calls.
`tools/list` must expose model-usable context for every tool: human-readable `title`, enriched `description`, JSON `inputSchema`, object-shaped `outputSchema`, and `annotations` such as `readOnlyHint`, `destructiveHint`, `idempotentHint`, and `openWorldHint`.
Every `tools/call` response must expose object-shaped `structuredContent` for client compatibility. Tool handlers may return arrays internally, but the protocol response wraps top-level arrays as `{ "items": [...] }` and top-level scalar/null payloads as `{ "value": ... }`; human-readable text content may still preserve the raw payload shape.
Discovery write tools must reject backend-invalid review/update/promotion payload shapes at the MCP schema boundary before proxying to the API. Cleanup flows must use canonical camelCase payload fields and backend status enums rather than guessed aliases such as `decision`, `reason`, `review_decision`, or `rejection_reason`. Recall candidate promotion must verify evidence before registering a channel: RSS promotion needs valid feed evidence; website promotion needs supported website-kind evidence or an explicit operator `overrideReason`; rejected candidates require an explicit override reason.
`admin.mcp_tokens.list` is the read-only MCP token inventory surface. It returns sanitized token metadata and canonical column guidance, never token secrets or raw DB dumps.
MCP token lifecycle writes are exposed only through `admin.mcp_tokens.revoke` and `admin.mcp_tokens.delete_revoked`, gated by `admin.tokens` plus destructive confirmation. MCP agents must not bypass missing token tools/scopes by calling admin REST endpoints directly. The active token must not be self-revoked through its own MCP session.
Cleanup flows must treat migration-owned default/adaptive/system sequences as protected system objects. `sequences.archive` must reject public `sequences` rows whose `created_by` starts with `migration:`.
Reindex maintenance is exposed through `maintenance.reindex.request` and `maintenance.reindex_jobs.list`. MCP agents must not manually call `sequences.run` on migration-owned `Default Reindex` without a valid `contextJson.event_id` and `contextJson.reindex_job_id`; normal reindex work should queue a `reindex.requested` event and then verify the reindex job plus triggered sequence run state. Operator phrases about old/historical/existing articles, rerunning content by current interests, selected/pass_through noise, or changes to Example C/templates/criteria map to `maintenance.reindex.request` with `jobKind=backfill`, not to content-analysis backfill. `content_analysis.backfill.request` refreshes analysis/label/filter evidence only and must not be reported as recomputing `article.match_criteria`, `interest_filter_results`, or `final_selection_results`.

`operator.system.health`, `operator.issue.explain`, `operator.tuning.recommend`, and `operator.effect.verify` are read-only operating intelligence surfaces for clients that return after setup to understand live state, diagnose problems, fine-tune settings, and verify effects. They must report source-of-truth evidence and must not mutate configuration; tuning recommendations may include suggested guarded tool calls, but they do not execute them.
`operator.report.verify` is the read-only report verification surface. Before final human-facing reports for channel onboarding, discovery runs, cleanup, selection, system health, channel health, website pipeline, selection tuning, content analysis, LLM budget, sequence run, or discovery yield decisions, clients should call it with the relevant entity ids and base claims on its DB-backed counts/statuses rather than mutation responses alone.

Bulk source onboarding is exposed as `channels.bulk_onboard.plan`, `channels.bulk_onboard.apply`, and `channels.bulk_onboard.verify`. MCP clients should use this plan/apply/verify flow for multi-source onboarding instead of issuing many independent `channels.create` calls. `plan` is read-only and classifies each source row; `apply` must recompute and match `planFingerprint`, requires `write.channels`, requires `confirm=true` for updates, and requires `overrideReason` for provider mismatch overrides; `verify` reports DB-backed channel acquisition, website resources, projection and final-selection outcomes separately.

Resources use `newsportal://` and should return high-signal operator context, not raw DB dumps. Guide resources should expose `title` and priority annotations so clients can rank them, including `newsportal://guide/client-contract` as the critical tool-only/client-compatibility runbook and `newsportal://guide/operating-model` plus `newsportal://ops/*` resources for ongoing operation. Mutating tools should provide `nextReadBack` for clients without resource subscriptions, and SSE clients may subscribe to operational resources and receive `notifications/resources/updated`.
Prompts provide guidance only and do not gain write authority. Prompt list entries should expose titles and include workflow/error-diagnosis prompts for setup, ongoing operations, issue triage, tuning, channel health, website pipeline, LLM budget and discovery yield sessions.

## Auth, audit and observability

- Tokens carry explicit scopes such as `read`, `write.templates`, `write.channels`, `write.discovery`, `write.sequences`, `write.destructive`, `admin.tokens`.
- Revoked/expired tokens fail immediately and should not update last-used as successful.
- Token lifecycle and mutating MCP tool calls write `audit_log`.
- Request-level telemetry writes additive `mcp_request_log`.

## Proof expectations

- `pnpm unit_tests`
- `pnpm typecheck`
- `pnpm test:mcp:compose`, including direct JSON-RPC and SSE handshake coverage
- `git diff --check --`
- Add `pnpm test:website:admin:compose` when template/channel extraction changes operator behavior.
- Add `pnpm test:discovery:admin:compose` or automation flow proof when discovery/sequence MCP writes change maintenance paths.

## Update triggers

Update when MCP endpoint shape, token/scopes, destructive policy, tool/resource/prompt catalog, audit logging, admin token UI or compose/nginx delivery changes.
