# NewsPortal MCP Client Setup Examples

These examples assume the NewsPortal server is already running and that you have already issued an MCP token from the admin UI.

Quick framing:

- Audience: operator or developer wiring a real MCP client to NewsPortal.
- Covers: concrete config snippets for supported clients and the minimum checks that prove the client sees the server.
- Out of scope: server implementation internals, token issuance policy design, and non-NewsPortal MCP servers.
- Prerequisites: reachable `/mcp` endpoint and a valid bearer token from `/automation/mcp`.
- Expected result: the client lists or connects to the `newsportal` server without hardcoded secrets in config files.

## Shared variables

For local testing:

```bash
export NEWSPORTAL_MCP_URL="http://127.0.0.1:8080/mcp"
export NEWSPORTAL_MCP_TOKEN="npmcp_replace_with_real_token"
```

For a remote or shared environment, replace the URL with the deployed HTTPS endpoint:

```bash
export NEWSPORTAL_MCP_URL="https://newsportal.example.com/mcp"
export NEWSPORTAL_MCP_TOKEN="npmcp_replace_with_real_token"
```

Recommended naming:

- server name: `newsportal`
- auth header: `Authorization: Bearer <token>`

## Codex

Preferred setup: add the server with the CLI and let Codex read the bearer token from an environment variable.

```bash
codex mcp add newsportal \
  --url "$NEWSPORTAL_MCP_URL" \
  --bearer-token-env-var NEWSPORTAL_MCP_TOKEN
```

Verify:

```bash
codex mcp list
```

If you also want the agent to prefer this server when the task is about NewsPortal admin or maintenance operations, add an instruction like this to your local rules:

```md
Use the NewsPortal MCP server for NewsPortal admin and maintenance work before falling back to guesses or manual API exploration.
Start with read surfaces and scenario guides before writes.
```

Notes:

- The official Codex MCP quickstart explicitly documents `codex mcp add ... --url ...` and shared Codex CLI / IDE configuration.
- The bearer token env-var flag is available in the local Codex CLI help and is the safest way to avoid hardcoding the token into a file.

Source:

- [OpenAI Docs MCP guide](https://developers.openai.com/learn/docs-mcp)

## OpenCode

OpenCode supports remote MCP servers directly in `opencode.json` or `opencode.jsonc`.

Project-level example:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "newsportal": {
      "type": "remote",
      "url": "{env:NEWSPORTAL_MCP_URL}",
      "enabled": true,
      "oauth": false,
      "headers": {
        "Authorization": "Bearer {env:NEWSPORTAL_MCP_TOKEN}"
      }
    }
  }
}
```

Why `oauth: false`:

- NewsPortal MCP uses admin-issued bearer tokens, not OAuth.

Useful OpenCode checks:

```bash
opencode mcp list
opencode mcp debug newsportal
```

If you have many MCP servers enabled in OpenCode, keep `newsportal` scoped to the agents that actually need it so it does not add unnecessary tool context to unrelated sessions.

Sources:

- [OpenCode MCP servers](https://opencode.ai/docs/mcp-servers)
- [OpenCode config reference](https://opencode.ai/docs/config/)

## Cursor

Project-scoped example in `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "newsportal": {
      "url": "${env:NEWSPORTAL_MCP_URL}",
      "headers": {
        "Authorization": "Bearer ${env:NEWSPORTAL_MCP_TOKEN}"
      }
    }
  }
}
```

Global config path:

- `~/.cursor/mcp.json`

Project config path:

- `.cursor/mcp.json`

Useful Cursor checks:

```bash
cursor-agent mcp list
cursor-agent mcp list-tools newsportal
```

Recommended project instruction snippet:

```md
Use the `newsportal` MCP server for NewsPortal operator work.
Start with `GET /mcp`-discoverable resources, prompts, and read tools before any write action.
```

Sources:

- [Cursor MCP overview](https://docs.cursor.com/advanced/model-context-protocol)
- [Cursor CLI MCP guide](https://docs.cursor.com/cli/mcp)

## VS Code

VS Code MCP config lives in `.vscode/mcp.json` for project scope.

Example using a secure prompt for the token:

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "newsportal-mcp-token",
      "description": "NewsPortal MCP bearer token",
      "password": true
    }
  ],
  "servers": {
    "newsportal": {
      "type": "http",
      "url": "http://127.0.0.1:8080/mcp",
      "headers": {
        "Authorization": "Bearer ${input:newsportal-mcp-token}"
      }
    }
  }
}
```

For a remote environment, replace the URL with the deployed HTTPS endpoint.

Recommended VS Code workflow:

1. Open Copilot Chat in Agent mode.
2. Enable the `newsportal` server in the MCP tools picker.
3. Ask the agent to start with NewsPortal MCP guide resources and read tools.

Source:

- [VS Code MCP configuration reference](https://code.visualstudio.com/docs/copilot/reference/mcp-configuration)

## Claude Code

Claude Code supports project-scoped `.mcp.json` and CLI-based registration.

CLI example:

```bash
claude mcp add --transport http newsportal "$NEWSPORTAL_MCP_URL" \
  --header "Authorization: Bearer ${NEWSPORTAL_MCP_TOKEN}"
```

Project-scoped `.mcp.json` example:

```json
{
  "mcpServers": {
    "newsportal": {
      "type": "http",
      "url": "${NEWSPORTAL_MCP_URL:-http://127.0.0.1:8080/mcp}",
      "headers": {
        "Authorization": "Bearer ${NEWSPORTAL_MCP_TOKEN}"
      }
    }
  }
}
```

Useful Claude Code checks:

```bash
claude mcp list
claude mcp get newsportal
```

Inside Claude Code:

```text
/mcp
```

That is the fastest way to confirm that the server is reachable and authenticated.

Sources:

- [Claude Code MCP docs](https://code.claude.com/docs/en/mcp)

## Claude Desktop

NewsPortal MCP is a remote HTTP server, so treat Claude Desktop differently depending on how you want to use it:

- Remote NewsPortal MCP:
  add it through Claude's connector flow, not through `claude_desktop_config.json`
- Local stdio MCP servers:
  use Claude Desktop extensions or local config only if you are packaging a local MCP server, which is not how NewsPortal ships

Important remote note:

- Anthropic's remote MCP guidance says remote connectors are configured through Claude's connector flow and accessed from Anthropic-managed infrastructure.
- That means a private NewsPortal deployment behind VPN-only access will not work there unless it is made reachable according to Anthropic's remote connector requirements.

Sources:

- [Remote MCP / custom connectors in Claude](https://support.claude.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp)
- [Claude Desktop local MCP / extensions guide](https://support.claude.com/en/articles/10949351-getting-started-with-model-context-protocol-mcp-on-claude-for-desktop)
