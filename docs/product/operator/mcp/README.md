# SignalOps MCP Docs

This folder is the operator-facing documentation pack for the shipped SignalOps remote MCP server.

Quick framing:

- Audience: SignalOps operator or developer who needs to issue a token, connect a client, and prove the MCP surface is reachable.
- Covers: client setup examples, direct HTTP smoke, and bounded local/remote testing guidance for the shipped SignalOps MCP server.
- Out of scope: agent-runtime authoring rules, arbitrary MCP server implementation details, and unsupported write-heavy experiments on shared environments.
- Prerequisites: reachable SignalOps `/mcp` endpoint, admin sign-in, and a valid MCP bearer token issued from `/automation/mcp`.
- Expected result: you can connect a real MCP client or complete direct HTTP smoke without guessing auth, URLs, or the intended proof lane.

Use it when you need to:

- connect a real MCP client to SignalOps;
- issue a SignalOps MCP token and wire it into a client config;
- smoke-test `GET /mcp` and JSON-RPC calls directly over HTTP;
- return after setup to review ongoing operational health through `operator.system.health`, `operator.issue.explain`, `operator.tuning.recommend`, `operator.effect.verify`, `signalops://guide/operating-model`, and `signalops://ops/*`;
- inspect, configure and replay content analysis evidence through `content_analysis.*`, `content_analysis_policies.*`, `content_analysis.backfill.request`, `content_entities.*`, `content_labels.*`, `content_filter_policies.*` and `content_filter_results.*`; default backfill modules include `ner`, `sentiment`, `category`, `cluster_summary`, `system_interest_labels` and `content_filter`; `structured_extraction` is available as an explicit opt-in module because active Gemini-backed templates can call an LLM; local analysis policies tune bounded deterministic `config_json` keys;
- understand which checks are local-only and which ones are safe for shared or remote environments.

## What lives here

- [Client Setup Examples](./client-setups.md)
  Real configuration examples for major MCP clients, including Codex, OpenCode, Cursor, VS Code, and Claude Code, plus notes for Claude Desktop.
- [HTTP Smoke Examples](./http-smoke.md)
  Minimal `curl` examples for `GET /mcp`, `initialize`, `tools/list`, `resources/read`, `prompts/get`, `tools/call`, and signal_candidate residual diagnostics.
- [Testing Local And Remote](./testing.md)
  How to test the SignalOps MCP server on the canonical local compose baseline and how to run bounded non-local smoke checks safely, including signal_candidate/content diagnostics.

## Canonical SignalOps assumptions

- Local admin UI: `http://127.0.0.1:4322`
- Local MCP endpoint behind nginx: `http://127.0.0.1:8080/mcp`
- Auth model: admin-issued bearer token from `/automation/mcp`
- Token format: `Authorization: Bearer npmcp_...`
- Transport model:
  - `GET /mcp` for lightweight server metadata
  - `POST /mcp` for JSON-RPC methods like `initialize`, `tools/list`, `resources/list`, `prompts/list`, and `tools/call`
  - `GET /mcp` with `Accept: text/event-stream` for clients that require SSE; the server returns an SSE `endpoint` event pointing at `/mcp/messages?sessionId=...`
  - SSE clients may subscribe with `resources/subscribe` and receive `notifications/resources/updated` for operational resources after write tools; clients without subscriptions should follow `nextReadBack` in mutation responses
- Context model:
  - `initialize` returns server instructions with read-before-write, ongoing-operations, cleanup, destructive-confirmation, token-inventory and schema guidance
  - `tools/list` returns titles, enriched descriptions, schemas and annotations so tool-only clients still get operational context
  - `signalops://guide/client-contract` is the high-priority resource for clients that expose resources
  - `signalops://guide/operating-model` and `signalops://ops/health`, `signalops://ops/issues`, `signalops://ops/tuning-backlog`, `signalops://ops/recent-changes` are the starting point for daily operation and fine-tuning sessions
  - `operator.system.health`, `operator.issue.explain`, `operator.tuning.recommend`, and `operator.effect.verify` are read-only; tuning recommendations may include suggested guarded tool calls but never apply them
  - `diagnose.mcp_error` helps classify transport, auth/scope, schema, backend validation and business-state errors
  - write tools are strict: send `arguments.payload` as one JSON object, never a JSON string and never nested as `payload.payload`; unknown fields and guessed aliases should fail as MCP `-32602` before backend/API calls
  - sequence plugin discovery is MCP-native through `sequences.plugins.list`; it exposes registered TaskPlugin contract metadata, not arbitrary runtime code loading
  - bulk source onboarding is MCP-native through `channels.bulk_onboard.plan`, `channels.bulk_onboard.apply`, and `channels.bulk_onboard.verify`; clients should plan first, apply only the current `planFingerprint`, use `confirm=true` for updates, and verify channel acquisition separately from website projection/selection outcomes
  - reference/manual bundles are calibration evidence, not hidden runtime config; when an operator says an example bundle worked better, compare its signal families, positive/negative cue groups, content-kind policy and LLM-review guardrails with current MCP state before editing Discovery vNext artifacts, policies, system interests or templates
  - for rare-signal funnels, broad source acquisition and strict independent content selection should be tuned separately; low-yield but working sources belong in monitoring/contract evaluation, while transport/provider-shape failures belong in `channels.bottlenecks.*`, `channels.alternatives.*`, adapters or polite-polling repair
  - final operator reports should be verified with `operator.report.verify` for setup reports and ongoing reports such as `system_health`, `channel_health`, `website_pipeline`, `selection_tuning`, `content_analysis`, `llm_budget`, `sequence_run`, or `discovery_run` instead of relying only on mutation responses
  - token lifecycle is MCP-native through `admin.mcp_tokens.list`, `admin.mcp_tokens.revoke`, and `admin.mcp_tokens.delete_revoked` when the token has `admin.tokens` plus destructive scope; clients should not call admin REST directly as a workaround
  - migration-owned default/adaptive/system sequences are protected from MCP cleanup archive calls
  - Discovery vNext probation handoff has semantic guards: RSS candidates need valid feed evidence; website candidates need supported website-kind evidence; rejected candidates cannot be registered silently
  - reindex maintenance is MCP-native through `maintenance.reindex.request` plus `maintenance.reindex_jobs.list`; clients should not call `sequences.run` on `Default Reindex` unless they already have a valid reindex job/event context
  - ingress adapter catalog is the source of truth for adapter identity; use `ingress.adapters.*` to list/read/create/update bounded declarative API adapters, dry-run without writes, recommend adapters for a channel, and read `ingress.adapters.legacy_fallback_report` before any legacy reader removal
  - sticky adapter selection lives in `source_channel_adapter_binding`; use `ingress.bindings.read/set/delete` for channel bindings, keep credentials out of adapter and binding config, and treat legacy RSS/API config only as historical diagnostics ignored by runtime selection
  - declarative adapter runtime is intentionally bounded: JSON/NDJSON API, GET or static non-secret JSON POST, item selector, fallback field mapping, max items and bounded `page`/`next_url`/`cursor` pagination; no uploaded code, JS/WASM sandbox, secret-bearing adapter config, or dry-run persistence

## Before you configure a client

1. Start the SignalOps stack or make sure you have a reachable deployed `/mcp` endpoint.
2. Sign in to the admin UI.
3. Open `/automation/mcp`.
4. Issue the narrowest token that matches the job.
5. Save the token immediately because the secret is shown once.

## Source references

The client examples in this folder were aligned on 2026-04-23 against these official docs:

- [OpenAI Codex Docs MCP guide](https://developers.openai.com/learn/docs-mcp)
- [OpenCode MCP servers](https://opencode.ai/docs/mcp-servers)
- [OpenCode config reference](https://opencode.ai/docs/config/)
- [VS Code MCP configuration reference](https://code.visualstudio.com/docs/copilot/reference/mcp-configuration)
- [Claude Code MCP docs](https://code.claude.com/docs/en/mcp)
- [Claude remote MCP / connector guidance](https://support.claude.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp)
- [Cursor MCP overview](https://docs.cursor.com/advanced/model-context-protocol)
- [Cursor CLI MCP guide](https://docs.cursor.com/cli/mcp)
