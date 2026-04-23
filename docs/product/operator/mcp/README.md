# NewsPortal MCP Docs

This folder is the operator-facing documentation pack for the shipped NewsPortal remote MCP server.

Quick framing:

- Audience: NewsPortal operator or developer who needs to issue a token, connect a client, and prove the MCP surface is reachable.
- Covers: client setup examples, direct HTTP smoke, and bounded local/remote testing guidance for the shipped NewsPortal MCP server.
- Out of scope: agent-runtime authoring rules, arbitrary MCP server implementation details, and unsupported write-heavy experiments on shared environments.
- Prerequisites: reachable NewsPortal `/mcp` endpoint, admin sign-in, and a valid MCP bearer token issued from `/automation/mcp`.
- Expected result: you can connect a real MCP client or complete direct HTTP smoke without guessing auth, URLs, or the intended proof lane.

Use it when you need to:

- connect a real MCP client to NewsPortal;
- issue a NewsPortal MCP token and wire it into a client config;
- smoke-test `GET /mcp` and JSON-RPC calls directly over HTTP;
- understand which checks are local-only and which ones are safe for shared or remote environments.

## What lives here

- [Client Setup Examples](./client-setups.md)
  Real configuration examples for major MCP clients, including Codex, OpenCode, Cursor, VS Code, and Claude Code, plus notes for Claude Desktop.
- [HTTP Smoke Examples](./http-smoke.md)
  Minimal `curl` examples for `GET /mcp`, `initialize`, `tools/list`, `resources/read`, `prompts/get`, `tools/call`, and article residual diagnostics.
- [Testing Local And Remote](./testing.md)
  How to test the NewsPortal MCP server on the canonical local compose baseline and how to run bounded non-local smoke checks safely, including article/content diagnostics.

## Canonical NewsPortal assumptions

- Local admin UI: `http://127.0.0.1:4322`
- Local MCP endpoint behind nginx: `http://127.0.0.1:8080/mcp`
- Auth model: admin-issued bearer token from `/automation/mcp`
- Token format: `Authorization: Bearer npmcp_...`
- Transport model:
  - `GET /mcp` for lightweight server metadata
  - `POST /mcp` for JSON-RPC methods like `initialize`, `tools/list`, `resources/list`, `prompts/list`, and `tools/call`

## Before you configure a client

1. Start the NewsPortal stack or make sure you have a reachable deployed `/mcp` endpoint.
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
