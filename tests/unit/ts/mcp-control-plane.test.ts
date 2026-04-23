import assert from "node:assert/strict";
import test from "node:test";

import {
  hasMcpScope,
  issueMcpAccessToken,
  listMcpAccessTokens,
  recordMcpRequestLog,
  revokeMcpAccessToken,
  resolveMcpAccessTokenBySecret,
  touchMcpAccessTokenUsage,
  MCP_SCOPE_OPTIONS,
} from "../../../packages/control-plane/src/mcp-tokens.ts";
import { createNewsPortalSdk } from "../../../packages/sdk/src/index.ts";
import {
  buildToolResult,
  JsonRpcError,
  parseJsonRpcRequest,
} from "../../../services/mcp/src/protocol.ts";
import { listMcpPrompts, resolveMcpPrompt } from "../../../services/mcp/src/prompts.ts";
import { listMcpResources, resolveMcpResource } from "../../../services/mcp/src/resources.ts";
import { executeMcpTool, listMcpTools } from "../../../services/mcp/src/tools.ts";

function createFakeMcpPool() {
  const state = {
    token: null,
    auditRows: [],
    requestLogs: [],
  };
  const calls = [];

  return {
    state,
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });

      if (/insert into mcp_access_tokens/i.test(sql)) {
        state.token = {
          token_id: String(params[0]),
          label: String(params[1]),
          token_prefix: String(params[2]),
          secret_hash: String(params[3]),
          scopes: JSON.parse(String(params[4])),
          status: "active",
          issued_by_user_id: String(params[5]),
          revoked_by_user_id: null,
          revoked_at: null,
          expires_at: params[6] ? new Date(String(params[6])) : null,
          last_used_at: null,
          last_used_ip: null,
          last_used_user_agent: null,
          created_at: new Date("2026-04-23T10:00:00.000Z"),
          updated_at: new Date("2026-04-23T10:00:00.000Z"),
        };
        return {
          rows: [{ ...state.token }],
        };
      }

      if (/from mcp_access_tokens mat/i.test(sql)) {
        return {
          rows: state.token
            ? [
                {
                  ...state.token,
                  recent_request_count: 2,
                },
              ]
            : [],
        };
      }

      if (/from mcp_access_tokens\s+where secret_hash/i.test(sql)) {
        return {
          rows:
            state.token && state.token.secret_hash === String(params[0])
              ? [{ ...state.token }]
              : [],
        };
      }

      if (/update mcp_access_tokens\s+set\s+status = 'revoked'/i.test(sql)) {
        if (!state.token || state.token.token_id !== String(params[0])) {
          return { rows: [] };
        }
        state.token = {
          ...state.token,
          status: "revoked",
          revoked_by_user_id: String(params[1]),
          revoked_at: new Date("2026-04-23T11:00:00.000Z"),
          updated_at: new Date("2026-04-23T11:00:00.000Z"),
        };
        return {
          rows: [{ ...state.token }],
        };
      }

      if (/update mcp_access_tokens\s+set\s+last_used_at = now\(\)/i.test(sql)) {
        if (state.token && state.token.token_id === String(params[0])) {
          state.token = {
            ...state.token,
            last_used_at: new Date("2026-04-23T12:00:00.000Z"),
            last_used_ip: params[1] ? String(params[1]) : null,
            last_used_user_agent: params[2] ? String(params[2]) : null,
            updated_at: new Date("2026-04-23T12:00:00.000Z"),
          };
        }
        return { rows: [] };
      }

      if (/insert into mcp_request_log/i.test(sql)) {
        state.requestLogs.push(params);
        return { rows: [] };
      }

      if (/insert into audit_log/i.test(sql)) {
        state.auditRows.push(params);
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL in fake MCP pool: ${sql}`);
    },
  };
}

test("MCP token helpers issue, resolve, list, touch, revoke, and log request metadata", async () => {
  const pool = createFakeMcpPool();

  const issued = await issueMcpAccessToken(pool, {
    label: "Codex desktop",
    scopes: "read, write.sequences, write.destructive",
    issuedByUserId: "550e8400-e29b-41d4-a716-446655440000",
    expiresAt: "2026-05-01T00:00:00.000Z",
  });

  assert.match(issued.token, /^npmcp_[a-z0-9]+\.[A-Za-z0-9_-]+$/);
  assert.equal(issued.label, "Codex desktop");
  assert.deepEqual(issued.scopes, ["read", "write.sequences", "write.destructive"]);
  assert.equal(hasMcpScope(issued.scopes, "read"), true);
  assert.equal(hasMcpScope(issued.scopes, "write.templates"), false);

  const resolved = await resolveMcpAccessTokenBySecret(pool, issued.token);
  assert.equal(resolved?.tokenId, issued.tokenId);
  assert.equal(resolved?.status, "active");

  const listed = await listMcpAccessTokens(pool);
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.recentRequestCount, 2);

  await touchMcpAccessTokenUsage(pool, {
    tokenId: issued.tokenId,
    ipAddress: "127.0.0.1",
    userAgent: "node:test",
  });
  assert.equal(pool.state.token?.last_used_ip, "127.0.0.1");
  assert.equal(pool.state.token?.last_used_user_agent, "node:test");

  await recordMcpRequestLog(pool, {
    tokenId: issued.tokenId,
    requestMethod: "tools/call",
    toolName: "admin.summary.get",
    success: true,
    requestJson: { name: "admin.summary.get" },
    responseJson: { ok: true },
  });
  assert.equal(pool.state.requestLogs.length, 1);

  const revoked = await revokeMcpAccessToken(pool, {
    tokenId: issued.tokenId,
    revokedByUserId: "550e8400-e29b-41d4-a716-446655440001",
    reason: "rotated",
  });
  assert.equal(revoked.status, "revoked");
  assert.equal(pool.state.auditRows.length, 2);
});

test("JSON-RPC parsing, prompt/resource registries, and tool list expose MCP foundation metadata", () => {
  const parsed = parseJsonRpcRequest({
    jsonrpc: "2.0",
    id: "req-1",
    method: "tools/list",
    params: {},
  });
  assert.equal(parsed.method, "tools/list");
  assert.throws(
    () =>
      parseJsonRpcRequest({
        jsonrpc: "2.0",
        id: "req-2",
        method: "tools/call",
        params: [],
      }),
    JsonRpcError
  );

  const toolNames = listMcpTools().map((tool) => tool.name);
  assert.ok(toolNames.includes("admin.summary.get"));
  assert.ok(toolNames.includes("sequences.create"));
  assert.ok(toolNames.includes("discovery.recall_missions.pause"));

  const resourceUris = listMcpResources().map((entry) => entry.uri);
  assert.ok(resourceUris.includes("newsportal://guide/server-overview"));
  assert.ok(resourceUris.includes("newsportal://guide/operator-playbooks"));
  assert.ok(resourceUris.includes("newsportal://guide/scenarios/sequences"));
  assert.ok(resourceUris.includes("newsportal://guide/scenarios/discovery"));
  assert.ok(resourceUris.includes("newsportal://guide/scenarios/system-interests"));
  assert.ok(resourceUris.includes("newsportal://guide/scenarios/llm-templates"));
  assert.ok(resourceUris.includes("newsportal://guide/scenarios/channels"));
  assert.ok(resourceUris.includes("newsportal://guide/scenarios/observability"));
  assert.ok(resourceUris.includes("newsportal://guide/scenarios/cleanup"));
  const resource = resolveMcpResource("newsportal://admin/summary");
  assert.equal(resource.name, "admin.summary");
  const guideResource = resolveMcpResource("newsportal://guide/server-overview");
  assert.equal(guideResource.name, "guide.server.overview");
  const discoveryGuideResource = resolveMcpResource("newsportal://guide/scenarios/discovery");
  assert.equal(discoveryGuideResource.name, "guide.scenarios.discovery");
  assert.ok(listMcpResources().length >= 14);

  const promptNames = listMcpPrompts().map((entry) => entry.name);
  assert.ok(promptNames.includes("operator.session.start"));
  assert.ok(promptNames.includes("sequences.session.plan"));
  assert.ok(promptNames.includes("discovery.session.plan"));
  assert.ok(promptNames.includes("system_interests.session.plan"));
  assert.ok(promptNames.includes("llm_templates.session.plan"));
  assert.ok(promptNames.includes("channels.session.plan"));
  assert.ok(promptNames.includes("observability.session.plan"));
  const prompt = resolveMcpPrompt("sequence.draft");
  assert.equal(prompt.name, "sequence.draft");
  const orientationPrompt = resolveMcpPrompt("operator.session.start");
  const orientationRendered = orientationPrompt.render({
    objective: "review discovery sources",
    domain: "discovery",
  });
  assert.match(
    orientationRendered.messages[0]?.content.text ?? "",
    /newsportal:\/\/guide\/server-overview/i
  );
  const discoverySessionPrompt = resolveMcpPrompt("discovery.session.plan");
  const discoverySessionRendered = discoverySessionPrompt.render({
    objective: "promote a high-signal recall candidate",
  });
  assert.match(
    discoverySessionRendered.messages[0]?.content.text ?? "",
    /newsportal:\/\/guide\/scenarios\/discovery/i
  );
  const observabilitySessionPrompt = resolveMcpPrompt("observability.session.plan");
  const observabilityRendered = observabilitySessionPrompt.render({
    question: "why did yesterday's recall yield weaken",
  });
  assert.match(
    observabilityRendered.messages[0]?.content.text ?? "",
    /newsportal:\/\/guide\/scenarios\/observability/i
  );
  assert.ok(listMcpPrompts().length >= 10);

  assert.deepEqual(buildToolResult({ ok: true }), {
    content: [
      {
        type: "text",
        text: JSON.stringify({ ok: true }, null, 2),
      },
    ],
    structuredContent: { ok: true },
  });
  assert.equal(MCP_SCOPE_OPTIONS.includes("write.discovery"), true);
});

test("MCP tool execution enforces scope and destructive confirmation before handler work", async () => {
  const dummySdk = createNewsPortalSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async () => {
      throw new Error("fetch should not be called when scope checks fail");
    }) as typeof fetch,
  });

  await assert.rejects(
    () =>
      executeMcpTool(
        {
          sdk: dummySdk,
          pool: { query: async () => ({ rows: [] }) },
          token: {
            tokenId: "token-1",
            label: "read-only",
            tokenPrefix: "npmcp_token-1",
            scopes: ["read"],
            status: "active",
            issuedByUserId: "550e8400-e29b-41d4-a716-446655440000",
            revokedByUserId: null,
            revokedAt: null,
            expiresAt: null,
            lastUsedAt: null,
            lastUsedIp: null,
            lastUsedUserAgent: null,
            createdAt: "2026-04-23T10:00:00.000Z",
            updatedAt: "2026-04-23T10:00:00.000Z",
            recentRequestCount: 0,
          },
        },
        "sequences.create",
        {
          payload: {
            title: "Blocked",
          },
        }
      ),
    /missing required scope "write\.sequences"/i
  );

  await assert.rejects(
    () =>
      executeMcpTool(
        {
          sdk: dummySdk,
          pool: { query: async () => ({ rows: [] }) },
          token: {
            tokenId: "token-2",
            label: "writer",
            tokenPrefix: "npmcp_token-2",
            scopes: ["read", "write.channels"],
            status: "active",
            issuedByUserId: "550e8400-e29b-41d4-a716-446655440000",
            revokedByUserId: null,
            revokedAt: null,
            expiresAt: null,
            lastUsedAt: null,
            lastUsedIp: null,
            lastUsedUserAgent: null,
            createdAt: "2026-04-23T10:00:00.000Z",
            updatedAt: "2026-04-23T10:00:00.000Z",
            recentRequestCount: 0,
          },
        },
        "channels.delete",
        {
          channelId: "channel-1",
          confirm: true,
        }
      ),
    /write\.destructive/i
  );
});

test("SDK exposes discovery delete routes needed by MCP parity without forking a new client", async () => {
  const requests = [];
  const sdk = createNewsPortalSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async (input, init) => {
      requests.push({
        url: String(input),
        method: init?.method ?? "GET",
      });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    }) as typeof fetch,
  });

  await sdk.deleteDiscoveryClass<Record<string, unknown>>("class-1");
  await sdk.deleteDiscoveryMission<Record<string, unknown>>("mission-1");

  assert.deepEqual(requests, [
    {
      url: "http://api.example.test/maintenance/discovery/classes/class-1",
      method: "DELETE",
    },
    {
      url: "http://api.example.test/maintenance/discovery/missions/mission-1",
      method: "DELETE",
    },
  ]);
});
