# NewsPortal MCP HTTP Smoke Examples

These examples exercise the shipped NewsPortal MCP server directly over HTTP.

## Shared environment

```bash
export NEWSPORTAL_MCP_URL="http://127.0.0.1:8080/mcp"
export NEWSPORTAL_MCP_TOKEN="npmcp_replace_with_real_token"
```

Remote variant:

```bash
export NEWSPORTAL_MCP_URL="https://newsportal.example.com/mcp"
export NEWSPORTAL_MCP_TOKEN="npmcp_replace_with_real_token"
```

## 1. Server metadata over `GET /mcp`

```bash
curl -sS \
  -H "Authorization: Bearer $NEWSPORTAL_MCP_TOKEN" \
  "$NEWSPORTAL_MCP_URL" | jq
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
  -H "Authorization: Bearer $NEWSPORTAL_MCP_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": "init-1",
    "method": "initialize",
    "params": {}
  }' \
  "$NEWSPORTAL_MCP_URL" | jq
```

Expected shape:

- `result.protocolVersion`
- `result.serverInfo.name`
- `result.capabilities`

## 3. List tools

```bash
curl -sS \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $NEWSPORTAL_MCP_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": "tools-1",
    "method": "tools/list",
    "params": {}
  }' \
  "$NEWSPORTAL_MCP_URL" | jq
```

## 4. List resources

```bash
curl -sS \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $NEWSPORTAL_MCP_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": "resources-1",
    "method": "resources/list",
    "params": {}
  }' \
  "$NEWSPORTAL_MCP_URL" | jq
```

## 5. Read the built-in server overview

```bash
curl -sS \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $NEWSPORTAL_MCP_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": "resource-read-1",
    "method": "resources/read",
    "params": {
      "uri": "newsportal://guide/server-overview"
    }
  }' \
  "$NEWSPORTAL_MCP_URL" | jq
```

## 6. Read a scenario guide

```bash
curl -sS \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $NEWSPORTAL_MCP_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": "resource-read-2",
    "method": "resources/read",
    "params": {
      "uri": "newsportal://guide/scenarios/discovery"
    }
  }' \
  "$NEWSPORTAL_MCP_URL" | jq
```

## 7. List prompts

```bash
curl -sS \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $NEWSPORTAL_MCP_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": "prompts-1",
    "method": "prompts/list",
    "params": {}
  }' \
  "$NEWSPORTAL_MCP_URL" | jq
```

## 8. Render a prompt

```bash
curl -sS \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $NEWSPORTAL_MCP_TOKEN" \
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
  "$NEWSPORTAL_MCP_URL" | jq
```

## 9. Call a safe read-only tool

```bash
curl -sS \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $NEWSPORTAL_MCP_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": "tool-call-1",
    "method": "tools/call",
    "params": {
      "name": "admin.summary.get",
      "arguments": {}
    }
  }' \
  "$NEWSPORTAL_MCP_URL" | jq
```

## 10. Failure checks

Missing token:

```bash
curl -i -sS "$NEWSPORTAL_MCP_URL"
```

Malformed token:

```bash
curl -i -sS \
  -H "Authorization: Bearer npmcp_invalid.invalid" \
  "$NEWSPORTAL_MCP_URL"
```

Unknown JSON-RPC method:

```bash
curl -sS \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $NEWSPORTAL_MCP_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": "bad-method-1",
    "method": "unknown.method",
    "params": {}
  }' \
  "$NEWSPORTAL_MCP_URL" | jq
```

## Safe next step after smoke

After the read-only smoke passes:

1. read the scenario guide for the target domain;
2. render the matching session-start prompt if useful;
3. only then try bounded write actions with a narrow-scope token.
