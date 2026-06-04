# SignalOps MCP HTTP Smoke Examples

These examples exercise the shipped SignalOps MCP server directly over HTTP, including the article/content diagnostics layer used for evidence-based tuning.

Quick framing:

- Audience: operator or developer validating the MCP transport directly with `curl`.
- Covers: metadata, `initialize`, discovery, resources, prompts, and tool-call smoke over the shipped HTTP surface.
- Out of scope: UI walkthroughs, long-lived client configuration, and exhaustive destructive testing.
- Prerequisites: reachable `/mcp` endpoint, bearer token, and `curl`; `jq` is recommended for readable output.
- Expected result: you can prove that the HTTP MCP surface responds with the expected discovery and read/write shapes.

## Shared environment

```bash
export SIGNALOPS_MCP_URL="http://127.0.0.1:8080/mcp"
export SIGNALOPS_MCP_TOKEN="npmcp_replace_with_real_token"
```

Remote variant:

```bash
export SIGNALOPS_MCP_URL="https://signalops.example.com/mcp"
export SIGNALOPS_MCP_TOKEN="npmcp_replace_with_real_token"
```

## 1. Server metadata over `GET /mcp`

```bash
curl -sS \
  -H "Authorization: Bearer $SIGNALOPS_MCP_TOKEN" \
  "$SIGNALOPS_MCP_URL" | jq
```

Expected shape:

- `serverInfo`
- `methods`
- `tools`
- `resources`
- `prompts`

## 2. Initialize

```bash
curl -sS \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SIGNALOPS_MCP_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": "init-1",
    "method": "initialize",
    "params": {}
  }' \
  "$SIGNALOPS_MCP_URL" | jq
```

Expected shape:

- `result.protocolVersion`
- `result.serverInfo.name`
- `result.capabilities`

## 3. List tools

```bash
curl -sS \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SIGNALOPS_MCP_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": "tools-1",
    "method": "tools/list",
    "params": {}
  }' \
  "$SIGNALOPS_MCP_URL" | jq
```

## 4. List resources

```bash
curl -sS \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SIGNALOPS_MCP_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": "resources-1",
    "method": "resources/list",
    "params": {}
  }' \
  "$SIGNALOPS_MCP_URL" | jq
```

## 5. Read the built-in server overview

```bash
curl -sS \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SIGNALOPS_MCP_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": "resource-read-1",
    "method": "resources/read",
    "params": {
      "uri": "signalops://guide/server-overview"
    }
  }' \
  "$SIGNALOPS_MCP_URL" | jq
```

## 6. Read a scenario guide

```bash
curl -sS \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SIGNALOPS_MCP_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": "resource-read-2",
    "method": "resources/read",
    "params": {
      "uri": "signalops://guide/scenarios/discovery"
    }
  }' \
  "$SIGNALOPS_MCP_URL" | jq
```

## 7. List prompts

```bash
curl -sS \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SIGNALOPS_MCP_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": "prompts-1",
    "method": "prompts/list",
    "params": {}
  }' \
  "$SIGNALOPS_MCP_URL" | jq
```

## 8. Render a prompt

```bash
curl -sS \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SIGNALOPS_MCP_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": "prompt-get-1",
    "method": "prompts/get",
    "params": {
      "name": "operator.session.start",
      "arguments": {
        "objective": "review sequence health",
        "domain": "sequences"
      }
    }
  }' \
  "$SIGNALOPS_MCP_URL" | jq
```

## 9. Call a safe read-only tool

```bash
curl -sS \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SIGNALOPS_MCP_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": "tool-call-1",
    "method": "tools/call",
    "params": {
      "name": "admin.summary.get",
      "arguments": {}
    }
  }' \
  "$SIGNALOPS_MCP_URL" | jq
```

## 10. Read article residual diagnostics

```bash
curl -sS \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SIGNALOPS_MCP_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": "tool-call-articles-summary-1",
    "method": "tools/call",
    "params": {
      "name": "articles.residuals.summary",
      "arguments": {}
    }
  }' \
  "$SIGNALOPS_MCP_URL" | jq
```

Expected shape:

- `result.content[0].text` with aggregate residual counts
- `structuredContent.total`
- `structuredContent.totals`
- `structuredContent.groups.downstreamLossBuckets`

## 11. Inspect one residual bucket

```bash
curl -sS \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SIGNALOPS_MCP_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": "tool-call-articles-list-1",
    "method": "tools/call",
    "params": {
      "name": "articles.residuals.list",
      "arguments": {
        "page": 1,
        "pageSize": 10,
        "downstreamLossBucket": "semantic_rejected"
      }
    }
  }' \
  "$SIGNALOPS_MCP_URL" | jq
```

## 12. Render a tuning prompt from residual evidence

```bash
curl -sS \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SIGNALOPS_MCP_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": "prompt-get-article-tune-1",
    "method": "prompts/get",
    "params": {
      "name": "system_interest.polish",
      "arguments": {
        "interestName": "AI policy monitoring",
        "residualPattern": "semantic_rejected repeated across policy-analysis articles"
      }
    }
  }' \
  "$SIGNALOPS_MCP_URL" | jq
```

## 13. Failure checks

Missing token:

```bash
curl -i -sS "$SIGNALOPS_MCP_URL"
```

Malformed token:

```bash
curl -i -sS \
  -H "Authorization: Bearer npmcp_invalid.invalid" \
  "$SIGNALOPS_MCP_URL"
```

Unknown JSON-RPC method:

```bash
curl -sS \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $SIGNALOPS_MCP_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": "bad-method-1",
    "method": "unknown.method",
    "params": {}
  }' \
  "$SIGNALOPS_MCP_URL" | jq
```

## Safe next step after smoke

After the read-only smoke passes:

1. read the scenario guide for the target domain;
2. render the matching session-start prompt if useful;
3. if the job is tuning-related, inspect `signalops://articles/residuals-summary` and `signalops://guide/scenarios/article-diagnostics`;
4. only then try bounded write actions with a narrow-scope token.
