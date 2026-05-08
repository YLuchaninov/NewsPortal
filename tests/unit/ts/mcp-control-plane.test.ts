import assert from "node:assert/strict";
import test from "node:test";

import {
  deleteRevokedMcpAccessToken,
  hasMcpScope,
  issueMcpAccessToken,
  listMcpAccessTokens,
  recordMcpRequestLog,
  revokeMcpAccessToken,
  resolveMcpAccessTokenBySecret,
  summarizeMcpAccessTokens,
  touchMcpAccessTokenUsage,
  MCP_SCOPE_OPTIONS,
} from "../../../packages/control-plane/src/mcp-tokens.ts";
import { hydrateTemplateUpdatePayloadForSave } from "../../../packages/control-plane/src/templates.ts";
import { createNewsPortalSdk } from "../../../packages/sdk/src/index.ts";
import {
  buildToolResult,
  JsonRpcError,
  parseJsonRpcRequest,
  readOptionalArgumentsObject,
} from "../../../services/mcp/src/protocol.ts";
import { listMcpPrompts, resolveMcpPrompt } from "../../../services/mcp/src/prompts.ts";
import { listMcpResources, resolveMcpResource } from "../../../services/mcp/src/resources.ts";
import { executeMcpTool, listMcpTools } from "../../../services/mcp/src/tools.ts";

const WRITE_SEQUENCES_TOKEN = {
  tokenId: "token-write-sequences",
  label: "writer",
  tokenPrefix: "npmcp_token-write-sequences",
  scopes: ["read", "write.sequences"],
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
} as const;

const WRITE_DISCOVERY_TOKEN = {
  tokenId: "token-write-discovery",
  label: "discovery-writer",
  tokenPrefix: "npmcp_token-write-discovery",
  scopes: ["read", "write.discovery"],
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
} as const;

const WRITE_CHANNELS_TOKEN = {
  tokenId: "token-write-channels",
  label: "channel-writer",
  tokenPrefix: "npmcp_token-write-channels",
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
} as const;

const WRITE_TEMPLATES_TOKEN = {
  tokenId: "token-write-templates",
  label: "template-writer",
  tokenPrefix: "npmcp_token-write-templates",
  scopes: ["read", "write.templates"],
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
} as const;

const DESTRUCTIVE_CHANNELS_TOKEN = {
  ...WRITE_CHANNELS_TOKEN,
  tokenId: "token-destructive-channels",
  scopes: ["read", "write.channels", "write.destructive"],
} as const;

const DESTRUCTIVE_ADMIN_TOKEN = {
  tokenId: "550e8400-e29b-41d4-a716-446655440010",
  label: "admin-token-writer",
  tokenPrefix: "npmcp_token-admin-token-writer",
  scopes: ["read", "admin.tokens", "write.destructive"],
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
} as const;

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

      if (/delete from mcp_access_tokens/i.test(sql)) {
        if (
          !state.token ||
          state.token.token_id !== String(params[0]) ||
          state.token.status !== "revoked"
        ) {
          return { rows: [] };
        }
        const deleted = state.token;
        state.token = null;
        return {
          rows: [{ ...deleted }],
        };
      }

      if (/select status\s+from mcp_access_tokens/i.test(sql)) {
        return {
          rows:
            state.token && state.token.token_id === String(params[0])
              ? [{ status: state.token.status }]
              : [],
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

function createFakeReindexPool() {
  const state = {
    clientQueries: [] as Array<{ sql: string; params: unknown[] }>,
    poolQueries: [] as Array<{ sql: string; params: unknown[] }>,
    released: false,
  };
  const client = {
    async query(sql: string, params: unknown[] = []) {
      state.clientQueries.push({ sql, params });
      return { rows: [] };
    },
    release() {
      state.released = true;
    },
  };
  return {
    state,
    async connect() {
      return client;
    },
    async query(sql: string, params: unknown[] = []) {
      state.poolQueries.push({ sql, params });
      if (/insert into audit_log/i.test(sql)) {
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL in fake reindex pool: ${sql}`);
    },
  };
}

function createFakeChannelActivePool() {
  const state = {
    sourceChannelUpdates: [] as Array<{ sql: string; params: unknown[] }>,
    auditRows: [] as unknown[][],
  };
  return {
    state,
    async query(sql: string, params: unknown[] = []) {
      if (/update source_channels/i.test(sql)) {
        state.sourceChannelUpdates.push({ sql, params });
        return {
          rows: [
            {
              channelId: String(params[0]),
              name: "Failing website",
              providerType: "website",
              isActive: Boolean(params[1]),
            },
          ],
        };
      }
      if (/insert into audit_log/i.test(sql)) {
        state.auditRows.push(params);
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL in fake channel active pool: ${sql}`);
    },
  };
}

function createFakeDiscoveryPrefixPool() {
  const state = {
    queries: [] as Array<{ sql: string; params: unknown[] }>,
  };
  const mappings = [
    {
      pattern: /from sequences/i,
      prefix: "cccccccc",
      id: "cccccccc-1111-4111-8111-111111111111",
    },
    {
      pattern: /from sequence_runs/i,
      prefix: "dddddddd",
      id: "dddddddd-1111-4111-8111-111111111111",
    },
    {
      pattern: /from articles/i,
      prefix: "ea25c952",
      id: "ea25c952-1111-4111-8111-111111111111",
    },
    {
      pattern: /from web_resources/i,
      prefix: "eeeeeeee",
      id: "eeeeeeee-1111-4111-8111-111111111111",
    },
  ];
  return {
    state,
    async query(sql: string, params: unknown[] = []) {
      state.queries.push({ sql, params });
      const mapping = mappings.find((entry) => entry.pattern.test(sql));
      if (mapping) {
        return {
          rows:
            params[0] === `${mapping.prefix}%`
              ? [{ id: mapping.id }]
              : [],
        };
      }
      throw new Error(`Unexpected SQL in fake read-id prefix pool: ${sql}`);
    },
  };
}

function createFakeDiscoveryReportPool() {
  const state = {};
  return {
    state,
    async query(sql: string) {
      if (/from discovery_targets/i.test(sql)) {
        return {
          rows: [
            {
              targetId: "target-1",
              title: "Manual resilient target",
              status: "active",
              originKind: "manual_prompt",
              priority: 1,
              lastRunId: "run-1",
              lastCoverageSnapshotId: "coverage-1",
              updatedAt: "2026-05-06T11:00:00.000Z",
            },
          ],
        };
      }
      if (/from discovery_runs/i.test(sql)) {
        return {
          rows: [
            {
              runId: "run-1",
              targetId: "target-1",
              runKind: "manual",
              triggerKind: "mcp",
              status: "running",
              createdAt: "2026-05-06T11:05:00.000Z",
            },
          ],
        };
      }
      if (/from discovery_coverage_snapshots/i.test(sql)) {
        return {
          rows: [
            {
              coverageSnapshotId: "coverage-1",
              targetId: "target-1",
              coverageScore: 0.42,
              sourceCount: 3,
              strongSourceCount: 1,
              missingRoleCount: 4,
              createdAt: "2026-05-06T11:08:00.000Z",
            },
          ],
        };
      }
      if (/from discovery_hypotheses/i.test(sql)) {
        return { rows: [{ status: "queued", count: 4 }] };
      }
      if (/from discovery_source_endpoints/i.test(sql)) {
        return {
          rows: [
            {
              status: "manual_review",
              providerType: "rss",
              count: 2,
            },
          ],
        };
      }
      if (/from discovery_source_contracts/i.test(sql)) {
        return { rows: [{ status: "probation", count: 1 }] };
      }
      if (/from discovery_claims/i.test(sql)) {
        return { rows: [{ status: "candidate", count: 1 }] };
      }
      if (/from discovery_negative_evidence/i.test(sql)) {
        return { rows: [] };
      }
      if (/from discovery_provider_health/i.test(sql)) {
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL in fake discovery report pool: ${sql}`);
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

  const deleted = await deleteRevokedMcpAccessToken(pool, {
    tokenId: issued.tokenId,
    deletedByUserId: "550e8400-e29b-41d4-a716-446655440002",
  });
  assert.equal(deleted.tokenId, issued.tokenId);
  assert.equal(pool.state.token, null);
  assert.equal(pool.state.auditRows.length, 3);
});

test("MCP token delete is limited to already revoked records", async () => {
  const pool = createFakeMcpPool();

  const issued = await issueMcpAccessToken(pool, {
    label: "Active token",
    scopes: "read",
    issuedByUserId: "550e8400-e29b-41d4-a716-446655440000",
  });

  await assert.rejects(
    () =>
      deleteRevokedMcpAccessToken(pool, {
        tokenId: issued.tokenId,
        deletedByUserId: "550e8400-e29b-41d4-a716-446655440001",
      }),
    /Only revoked MCP tokens can be deleted/
  );
  assert.equal(pool.state.token?.status, "active");
});

test("MCP token summaries distinguish usable active tokens from expired active rows", () => {
  const tokens = [
    {
      ...WRITE_SEQUENCES_TOKEN,
      expiresAt: null,
    },
    {
      ...WRITE_DISCOVERY_TOKEN,
      tokenId: "token-expired-active",
      expiresAt: "2020-01-01T00:00:00.000Z",
    },
    {
      ...WRITE_CHANNELS_TOKEN,
      tokenId: "token-revoked",
      status: "revoked",
      revokedAt: "2026-05-06T12:00:00.000Z",
      expiresAt: null,
    },
  ];

  assert.deepEqual(summarizeMcpAccessTokens(tokens), {
    total: 3,
    active: 2,
    activeUsable: 1,
    expiredActive: 1,
    revoked: 1,
  });
});

test("MCP template update hydration preserves omitted optional fields", async () => {
  const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
  const queryable = {
    async query(sql: string, params?: unknown[]) {
      calls.push({ sql, params });
      if (/from interest_templates it/i.test(sql)) {
        return {
          rows: [
            {
              name: "Existing interest",
              description: "Existing description",
              positive_texts: ["old signal"],
              negative_texts: ["old noise"],
              must_have_terms: ["RFP"],
              must_not_have_terms: ["vendor blog"],
              places: ["EU"],
              languages_allowed: ["en", "de"],
              time_window_hours: 2160,
              allowed_content_kinds: ["editorial", "document"],
              short_tokens_required: ["AI"],
              short_tokens_forbidden: ["NBA"],
              priority: 0.8,
              is_active: true,
              definition_json: {
                candidateSignals: {
                  positiveGroups: [{ name: "buyer_need", cues: ["RFP", "vendor search"] }],
                  negativeGroups: [{ name: "vendor_marketing", cues: ["case study"] }],
                },
              },
              policy_json: {
                strictness: "broad",
                unresolvedDecision: "reject",
                llmReviewMode: "optional_high_value_only",
              },
            },
          ],
        };
      }
      if (/from llm_prompt_templates/i.test(sql)) {
        return {
          rows: [
            {
              name: "Existing LLM template",
              scope: "criteria",
              language: "en",
              template_text: "Review {title}",
              is_active: false,
            },
          ],
        };
      }
      throw new Error(`Unexpected query: ${sql}`);
    },
  };

  const interestPayload = await hydrateTemplateUpdatePayloadForSave(queryable as any, {
    kind: "interest",
    interestTemplateId: "11111111-1111-4111-8111-111111111111",
    name: "Updated interest",
    positive_texts: "new signal",
  });

  assert.equal(interestPayload.name, "Updated interest");
  assert.equal(interestPayload.positive_texts, "new signal");
  assert.deepEqual(interestPayload.languages_allowed, ["en", "de"]);
  assert.deepEqual(interestPayload.allowed_content_kinds, ["editorial", "document"]);
  assert.equal(interestPayload.selection_profile_strictness, "broad");
  assert.equal(interestPayload.selection_profile_unresolved_decision, "reject");
  assert.equal(interestPayload.selection_profile_llm_review_mode, "optional_high_value_only");
  assert.deepEqual(interestPayload.candidate_positive_signals, [
    "buyer_need: RFP, vendor search",
  ]);

  const llmPayload = await hydrateTemplateUpdatePayloadForSave(queryable as any, {
    kind: "llm",
    promptTemplateId: "22222222-2222-4222-8222-222222222222",
    templateText: "Updated {title}",
  });

  assert.equal(llmPayload.templateText, "Updated {title}");
  assert.equal(llmPayload.name, "Existing LLM template");
  assert.equal(llmPayload.scope, "criteria");
  assert.equal(llmPayload.language, "en");
  assert.equal(llmPayload.isActive, false);
  assert.equal(calls.length, 2);
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
  assert.deepEqual(readOptionalArgumentsObject(undefined), {});
  assert.throws(() => readOptionalArgumentsObject("not-json-object"), /arguments must be an object/i);

  const toolNames = listMcpTools().map((tool) => tool.name);
  assert.ok(toolNames.includes("admin.summary.get"));
  assert.ok(toolNames.includes("articles.list"));
  assert.ok(toolNames.includes("articles.read"));
  assert.ok(toolNames.includes("articles.explain"));
  assert.ok(toolNames.includes("content_items.list"));
  assert.ok(toolNames.includes("content_items.read"));
  assert.ok(toolNames.includes("content_items.explain"));
  assert.ok(toolNames.includes("articles.residuals.list"));
  assert.ok(toolNames.includes("articles.residuals.summary"));
  assert.ok(toolNames.includes("sequences.create"));
  assert.ok(toolNames.includes("discovery.provider_health.list"));
  assert.ok(toolNames.includes("discovery.endpoints.promote"));
  assert.ok(toolNames.includes("channels.set_active"));

  const resourceUris = listMcpResources().map((entry) => entry.uri);
  assert.ok(resourceUris.includes("newsportal://guide/server-overview"));
  assert.ok(resourceUris.includes("newsportal://guide/operator-playbooks"));
  assert.ok(resourceUris.includes("newsportal://guide/scenarios/sequences"));
  assert.ok(resourceUris.includes("newsportal://guide/scenarios/discovery"));
  assert.ok(resourceUris.includes("newsportal://guide/scenarios/system-interests"));
  assert.ok(resourceUris.includes("newsportal://guide/scenarios/llm-templates"));
  assert.ok(resourceUris.includes("newsportal://guide/scenarios/channels"));
  assert.ok(resourceUris.includes("newsportal://guide/scenarios/article-diagnostics"));
  assert.ok(resourceUris.includes("newsportal://guide/scenarios/observability"));
  assert.ok(resourceUris.includes("newsportal://guide/scenarios/cleanup"));
  assert.ok(resourceUris.includes("newsportal://articles/residuals-summary"));
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
  assert.ok(promptNames.includes("system_interest.polish"));
  assert.ok(promptNames.includes("llm_template.tune"));
  assert.ok(promptNames.includes("discovery.coverage.tune"));
  assert.ok(promptNames.includes("discovery.target.review"));
  assert.ok(promptNames.includes("discovery.contract.review"));
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
    objective: "promote a high-signal discovery endpoint",
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
  const systemInterestPolishPrompt = resolveMcpPrompt("system_interest.polish");
  const systemInterestPolishRendered = systemInterestPolishPrompt.render({
    interestName: "AI safety",
    residualPattern: "semantic_rejected repeated across policy-analysis articles",
  });
  assert.match(
    systemInterestPolishRendered.messages[0]?.content.text ?? "",
    /newsportal:\/\/guide\/scenarios\/article-diagnostics/i
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

test("MCP read tools accept common report aliases for system interest read-back", async () => {
  const requests: string[] = [];
  const sdk = createNewsPortalSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async (input) => {
      requests.push(String(input));
      return new Response(JSON.stringify({ interestTemplateId: "interest-1" }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    }) as typeof fetch,
  });

  const result = await executeMcpTool(
    {
      sdk,
      pool: createFakeMcpPool(),
      token: WRITE_CHANNELS_TOKEN,
    },
    "system_interests.read",
    {
      entityId: "01f72c31-9c7f-4160-9ec1-b8c8130c3c10",
    }
  );

  assert.deepEqual(result, { interestTemplateId: "interest-1" });
  assert.match(requests[0] ?? "", /01f72c31-9c7f-4160-9ec1-b8c8130c3c10/);
});

test("MCP channel active-state tool avoids full provider payload guessing", async () => {
  const dummySdk = createNewsPortalSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async () => {
      throw new Error("fetch should not be called by channels.set_active");
    }) as typeof fetch,
  });
  const pool = createFakeChannelActivePool();

  const result = await executeMcpTool(
    {
      sdk: dummySdk,
      pool,
      token: WRITE_CHANNELS_TOKEN,
    },
    "channels.set_active",
    {
      channelId: "abea2560-0000-4000-8000-000000000000",
      isActive: false,
      reason: "Cloudflare challenge",
    }
  );

  assert.equal(pool.state.sourceChannelUpdates.length, 1);
  assert.deepEqual(pool.state.sourceChannelUpdates[0]?.params, [
    "abea2560-0000-4000-8000-000000000000",
    false,
  ]);
  assert.equal(pool.state.auditRows.length, 1);
  assert.equal((result as Record<string, unknown>).channelId, "abea2560-0000-4000-8000-000000000000");
  assert.match(JSON.stringify(result), /channels\.read/);
  assert.match(JSON.stringify(result), /operator\.report\.verify/);
});

test("MCP discovery endpoint lists use v3 filters before API calls", async () => {
  const requests: string[] = [];
  const sdk = createNewsPortalSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async (input) => {
      requests.push(String(input));
      return new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    }) as typeof fetch,
  });

  await executeMcpTool(
    {
      sdk,
      pool: createFakeMcpPool(),
      token: WRITE_DISCOVERY_TOKEN,
    },
    "discovery.endpoints.list",
    {
      targetId: "target-1",
      status: "manual_review",
      pageSize: 50,
    }
  );

  assert.match(
    requests[0] ?? "",
    /\/maintenance\/discovery\/endpoints\?status=manual_review&targetId=target-1&pageSize=50/
  );

  await assert.rejects(
    () =>
      executeMcpTool(
        {
          sdk,
          pool: createFakeMcpPool(),
          token: WRITE_DISCOVERY_TOKEN,
        },
        "discovery.endpoints.list",
        {
          unexpected: true,
          pageSize: 50,
        }
      ),
    (error) => error instanceof JsonRpcError && error.code === -32602
  );
  assert.equal(requests.length, 1, "invalid v3 list args should fail before backend fetch");
});

test("MCP discovery target read accepts full v3 target ids", async () => {
  const requests: string[] = [];
  const sdk = createNewsPortalSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async (input) => {
      requests.push(String(input));
      return new Response(JSON.stringify({ targetId: "f3dbf7b8-72ad-41e9-94d5-7d113b28ca13" }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    }) as typeof fetch,
  });

  await executeMcpTool(
    {
      sdk,
      pool: createFakeMcpPool(),
      token: WRITE_DISCOVERY_TOKEN,
    },
    "discovery.targets.read",
    {
      targetId: "f3dbf7b8-72ad-41e9-94d5-7d113b28ca13",
    }
  );

  assert.match(requests[0] ?? "", /f3dbf7b8-72ad-41e9-94d5-7d113b28ca13/);

  await assert.rejects(
    () =>
      executeMcpTool(
        {
          sdk,
          pool: createFakeMcpPool(),
          token: WRITE_DISCOVERY_TOKEN,
        },
        "discovery.targets.read",
        {}
      ),
    (error) =>
      error instanceof JsonRpcError &&
      error.code === -32602
  );
});

test("MCP discovery read tools expose v3 target, coverage and run surfaces", async () => {
  const requests: string[] = [];
  const sdk = createNewsPortalSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async (input) => {
      requests.push(String(input));
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    }) as typeof fetch,
  });
  const pool = createFakeMcpPool();

  await executeMcpTool(
    { sdk, pool, token: WRITE_DISCOVERY_TOKEN },
    "discovery.targets.read",
    { targetId: "9b88d3e8-7fc9-4ef2-a0a6-0cd591de6a25" }
  );
  await executeMcpTool(
    { sdk, pool, token: WRITE_DISCOVERY_TOKEN },
    "discovery.coverage.read",
    { targetId: "9b88d3e8-7fc9-4ef2-a0a6-0cd591de6a25" }
  );
  await executeMcpTool(
    { sdk, pool, token: WRITE_DISCOVERY_TOKEN },
    "discovery.runs.read",
    { runId: "d0e6f11f-1111-4111-8111-111111111111" }
  );

  assert.match(requests.join("\n"), /9b88d3e8-7fc9-4ef2-a0a6-0cd591de6a25/);
  assert.match(requests.join("\n"), /d0e6f11f-1111-4111-8111-111111111111/);
});

test("MCP sequence and content read tools accept report aliases and UUID prefixes", async () => {
  const requests: string[] = [];
  const sdk = createNewsPortalSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async (input) => {
      requests.push(String(input));
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    }) as typeof fetch,
  });
  const pool = createFakeDiscoveryPrefixPool();

  await executeMcpTool(
    { sdk, pool, token: WRITE_SEQUENCES_TOKEN },
    "sequences.read",
    { entityId: "cccccccc" }
  );
  await executeMcpTool(
    { sdk, pool, token: WRITE_SEQUENCES_TOKEN },
    "sequences.runs.read",
    { sequenceRunId: "dddddddd" }
  );
  await executeMcpTool(
    { sdk, pool, token: WRITE_SEQUENCES_TOKEN },
    "sequences.run_task_runs.list",
    { id: "dddddddd" }
  );
  await executeMcpTool(
    { sdk, pool, token: WRITE_CHANNELS_TOKEN },
    "articles.explain",
    { canonicalId: "ea25c952" }
  );
  await executeMcpTool(
    { sdk, pool, token: WRITE_CHANNELS_TOKEN },
    "content_items.read",
    { id: "ea25c952" }
  );
  await executeMcpTool(
    { sdk, pool, token: WRITE_CHANNELS_TOKEN },
    "web_resources.read",
    { entityId: "eeeeeeee" }
  );

  const requestLog = requests.join("\n");
  assert.match(requestLog, /cccccccc-1111-4111-8111-111111111111/);
  assert.match(requestLog, /dddddddd-1111-4111-8111-111111111111/);
  assert.match(requestLog, /ea25c952-1111-4111-8111-111111111111/);
  assert.match(requestLog, /editorial%3Aea25c952-1111-4111-8111-111111111111/);
  assert.match(requestLog, /eeeeeeee-1111-4111-8111-111111111111/);
});

test("MCP sequence write tools reject malformed UUID ids before backend fetch", async () => {
  const requests: string[] = [];
  const sdk = createNewsPortalSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async (input) => {
      requests.push(String(input));
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    }) as typeof fetch,
  });
  const pool = createFakeMcpPool();
  const malformedId = "00000000-0000-0000-0000-nonexistentid";

  const invalidCalls: Array<{
    toolName: string;
    args: Record<string, unknown>;
    expectedPath: string;
  }> = [
    {
      toolName: "sequences.update",
      args: {
        sequenceId: malformedId,
        payload: { title: "Should not reach backend" },
      },
      expectedPath: "sequenceId",
    },
    {
      toolName: "sequences.run",
      args: {
        sequenceId: malformedId,
      },
      expectedPath: "sequenceId",
    },
    {
      toolName: "sequences.retry_run",
      args: {
        runId: malformedId,
      },
      expectedPath: "runId",
    },
    {
      toolName: "sequences.cancel_run",
      args: {
        runId: malformedId,
      },
      expectedPath: "runId",
    },
  ];

  for (const invalidCall of invalidCalls) {
    await assert.rejects(
      () =>
        executeMcpTool(
          { sdk, pool, token: WRITE_SEQUENCES_TOKEN },
          invalidCall.toolName,
          invalidCall.args
        ),
      (error) =>
        error instanceof JsonRpcError &&
        error.code === -32602 &&
        error.message === `${invalidCall.expectedPath} must be a full UUID.`
    );
  }
  assert.equal(requests.length, 0, "invalid sequence write ids should fail before backend fetch");
});

test("MCP adjacent write tools reject malformed UUID ids before backend or DB work", async () => {
  const requests: string[] = [];
  const sdk = createNewsPortalSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async (input) => {
      requests.push(String(input));
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    }) as typeof fetch,
  });
  const pool = createFakeMcpPool();
  const malformedId = "00000000-0000-0000-0000-nonexistentid";

  const invalidCalls: Array<{
    toolName: string;
    token: typeof WRITE_DISCOVERY_TOKEN | typeof WRITE_TEMPLATES_TOKEN | typeof DESTRUCTIVE_CHANNELS_TOKEN | typeof DESTRUCTIVE_ADMIN_TOKEN;
    args: Record<string, unknown>;
    expectedPath: string;
    expectedMessage?: string;
  }> = [
    {
      toolName: "discovery.targets.update",
      token: WRITE_DISCOVERY_TOKEN,
      args: { targetId: malformedId, payload: { title: "Nope" } },
      expectedPath: "targetId",
    },
    {
      toolName: "discovery.coverage.refresh",
      token: WRITE_DISCOVERY_TOKEN,
      args: { targetId: malformedId },
      expectedPath: "targetId",
    },
    {
      toolName: "discovery.runs.cancel",
      token: WRITE_DISCOVERY_TOKEN,
      args: { runId: malformedId },
      expectedPath: "runId",
    },
    {
      toolName: "discovery.endpoints.promote",
      token: WRITE_DISCOVERY_TOKEN,
      args: { endpointId: malformedId, payload: { enabled: true } },
      expectedPath: "endpointId",
    },
    {
      toolName: "discovery.endpoints.reject",
      token: WRITE_DISCOVERY_TOKEN,
      args: { endpointId: malformedId, payload: { reason: "Nope" } },
      expectedPath: "endpointId",
    },
    {
      toolName: "system_interests.update",
      token: WRITE_TEMPLATES_TOKEN,
      args: {
        payload: {
          interestTemplateId: malformedId,
          name: "Nope",
          positive_texts: "signals",
        },
      },
      expectedPath: "payload.interestTemplateId",
    },
    {
      toolName: "llm_templates.update",
      token: WRITE_TEMPLATES_TOKEN,
      args: {
        payload: {
          promptTemplateId: malformedId,
          name: "Nope",
          templateText: "Review {title}",
        },
      },
      expectedPath: "payload.promptTemplateId",
    },
    {
      toolName: "channels.delete",
      token: DESTRUCTIVE_CHANNELS_TOKEN,
      args: { channelId: malformedId, confirm: true },
      expectedPath: "channelId",
      expectedMessage: "channelId must be a full UUID or a unique UUID prefix.",
    },
    {
      toolName: "admin.mcp_tokens.revoke",
      token: DESTRUCTIVE_ADMIN_TOKEN,
      args: { tokenId: malformedId, confirm: true },
      expectedPath: "tokenId",
    },
    {
      toolName: "admin.mcp_tokens.delete_revoked",
      token: DESTRUCTIVE_ADMIN_TOKEN,
      args: { tokenId: malformedId, confirm: true },
      expectedPath: "tokenId",
    },
  ];

  for (const invalidCall of invalidCalls) {
    await assert.rejects(
      () =>
        executeMcpTool(
          { sdk, pool, token: invalidCall.token },
          invalidCall.toolName,
          invalidCall.args
        ),
      (error) =>
        error instanceof JsonRpcError &&
        error.code === -32602 &&
        error.message ===
          (invalidCall.expectedMessage ?? `${invalidCall.expectedPath} must be a full UUID.`)
    );
  }

  assert.equal(requests.length, 0, "invalid adjacent write ids should fail before backend fetch");
  assert.equal(pool.calls.length, 0, "invalid adjacent write ids should fail before DB work");
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

test("MCP tool execution validates declared input schemas before handler work", async () => {
  const dummySdk = createNewsPortalSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async () => {
      throw new Error("fetch should not be called when schema checks fail");
    }) as typeof fetch,
  });
  const readToken = {
    tokenId: "token-schema",
    label: "reader",
    tokenPrefix: "npmcp_token-schema",
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
  } as const;

  await assert.rejects(
    () =>
      executeMcpTool(
        {
          sdk: dummySdk,
          pool: { query: async () => ({ rows: [] }) },
          token: readToken,
        },
        "channels.list",
        {
          page: "1",
        }
      ),
    /channels\.list.*page must be number/i
  );

  await assert.rejects(
    () =>
      executeMcpTool(
        {
          sdk: dummySdk,
          pool: { query: async () => ({ rows: [] }) },
          token: readToken,
        },
        "channels.list",
        {
          unexpected: true,
        }
      ),
    /channels\.list.*unexpected is not allowed/i
  );
});

test("MCP discovery target create applies actor defaults and v3 payload passthrough", async () => {
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  const sdk = createNewsPortalSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async (input, init) => {
      requests.push({
        url: String(input),
        body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
      });
      return new Response(JSON.stringify({ targetId: "target-1", status: "active" }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    }) as typeof fetch,
  });

  const result = await executeMcpTool(
    {
      sdk,
      pool: createFakeMcpPool(),
      token: WRITE_DISCOVERY_TOKEN,
    },
    "discovery.targets.create_manual",
    {
      payload: {
        originKind: "manual_prompt",
        title: "Manual resilient target",
        seedTopics: ["AI rollout failures", "LLM integration blockers"],
        seedLanguages: ["en", "de"],
        seedGeos: ["us", "eu"],
      },
    }
  );

  assert.equal((result as Record<string, unknown>).targetId, "target-1");
  assert.deepEqual(requests[0]?.body.seedTopics, [
    "AI rollout failures",
    "LLM integration blockers",
  ]);
  assert.deepEqual(requests[0]?.body.seedLanguages, ["en", "de"]);
  assert.deepEqual(requests[0]?.body.seedGeos, ["us", "eu"]);
  assert.equal(requests[0]?.body.createdBy, WRITE_DISCOVERY_TOKEN.issuedByUserId);

  await assert.rejects(
    () =>
      executeMcpTool(
        {
          sdk,
          pool: createFakeMcpPool(),
          token: WRITE_DISCOVERY_TOKEN,
        },
        "discovery.targets.create_manual",
        {
          payload: "invalid",
        }
      ),
    (error) => error instanceof JsonRpcError && error.code === -32602
  );
  assert.equal(requests.length, 1, "invalid v3 target payloads should fail before backend fetch");
});

test("MCP discovery run start calls v3 run endpoint", async () => {
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  const sdk = createNewsPortalSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async (input, init) => {
      requests.push({
        url: String(input),
        body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
      });
      return (
      new Response(JSON.stringify({ runId: "run-1", status: "pending" }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      }))
    }) as typeof fetch,
  });

  const result = await executeMcpTool(
    {
      sdk,
      pool: createFakeMcpPool(),
      token: WRITE_DISCOVERY_TOKEN,
    },
    "discovery.runs.start",
    {
      payload: {
        targetId: "11111111-1111-4111-8111-111111111111",
        runKind: "manual",
        triggerKind: "mcp",
      },
    }
  );

  assert.equal((result as Record<string, unknown>).runId, "run-1");
  assert.match(requests[0]?.url ?? "", /\/maintenance\/discovery\/runs$/);
  assert.equal(requests[0]?.body.createdBy, WRITE_DISCOVERY_TOKEN.issuedByUserId);
});

test("MCP endpoint promotion sends probation-review payload through v3", async () => {
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  const sdk = createNewsPortalSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async (input, init) => {
      requests.push({
        url: String(input),
        body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
      });
      return new Response(
        JSON.stringify({
          endpointId: "22222222-2222-4222-8222-222222222222",
          status: "registered",
          trustStage: "probation",
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        }
      );
    }) as typeof fetch,
  });

  const createResult = await executeMcpTool(
    {
      sdk,
      pool: createFakeMcpPool(),
      token: WRITE_DISCOVERY_TOKEN,
    },
    "discovery.endpoints.promote",
    {
      endpointId: "22222222-2222-4222-8222-222222222222",
      payload: {
        enabled: true,
        tags: ["discovery", "technical_change"],
      },
    }
  );

  assert.match(JSON.stringify(createResult), /probation/i);
  assert.match(requests[0]?.url ?? "", /\/maintenance\/discovery\/endpoints\/22222222-2222-4222-8222-222222222222\/promote$/);
  assert.deepEqual(requests[0]?.body.tags, ["discovery", "technical_change"]);
  assert.equal(requests[0]?.body.reviewedBy, WRITE_DISCOVERY_TOKEN.issuedByUserId);

  const rejectResult = await executeMcpTool(
    {
      sdk,
      pool: createFakeMcpPool(),
      token: WRITE_DISCOVERY_TOKEN,
    },
    "discovery.endpoints.reject",
    {
      endpointId: "22222222-2222-4222-8222-222222222222",
      payload: {
        reason: "insufficient evidence",
      },
    }
  );

  assert.match(JSON.stringify(rejectResult), /registered|probation/i);
  assert.match(requests[1]?.url ?? "", /\/maintenance\/discovery\/endpoints\/22222222-2222-4222-8222-222222222222\/reject$/);
});

test("MCP endpoint promote/reject reject malformed ids before backend calls", async () => {
  const requests: string[] = [];
  const sdk = createNewsPortalSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async (input) => {
      requests.push(String(input));
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    }) as typeof fetch,
  });

  await assert.rejects(
    () =>
      executeMcpTool(
        {
          sdk,
          pool: createFakeMcpPool(),
          token: WRITE_DISCOVERY_TOKEN,
        },
        "discovery.endpoints.promote",
        {
          endpointId: "not-a-uuid",
          payload: { enabled: true },
        }
      ),
    (error) =>
      error instanceof JsonRpcError &&
      error.code === -32602 &&
      /endpointId must be a full UUID/i.test(error.message)
  );

  await assert.rejects(
    () =>
      executeMcpTool(
        {
          sdk,
          pool: createFakeMcpPool(),
          token: WRITE_DISCOVERY_TOKEN,
        },
        "discovery.endpoints.reject",
        {
          endpointId: "not-a-uuid",
          payload: { reason: "bad evidence" },
        }
      ),
    (error) =>
      error instanceof JsonRpcError &&
      error.code === -32602 &&
      /endpointId must be a full UUID/i.test(error.message)
  );
  assert.equal(requests.length, 0, "malformed endpoint ids must fail before backend fetch");
});

test("MCP discovery report verify warns for v3 in-progress runs and probation contracts", async () => {
  const dummySdk = createNewsPortalSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async () => {
      throw new Error("operator.report.verify should use the DB-backed pool");
    }) as typeof fetch,
  });

  const result = await executeMcpTool(
    {
      sdk: dummySdk,
      pool: createFakeDiscoveryReportPool(),
      token: WRITE_DISCOVERY_TOKEN,
    },
    "operator.report.verify",
    {
      reportKind: "discovery_run",
      entityIds: { targetIds: ["target-1"], runIds: ["run-1"] },
      includeSamples: true,
    }
  );

  const serialized = JSON.stringify(result);
  assert.match(serialized, /queued\/running|in progress/i);
  assert.match(serialized, /2 discovery endpoints still require evidence review/i);
  assert.match(serialized, /1 promoted sources are still in contract probation/i);
  assert.match(serialized, /coverageScore/i);
});

test("MCP reindex request rejects unsupported indexName and jobKind at the boundary", async () => {
  const dummySdk = createNewsPortalSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async () => {
      throw new Error("fetch should not be called by maintenance.reindex.request");
    }) as typeof fetch,
  });
  const pool = createFakeReindexPool();

  await assert.rejects(
    () =>
      executeMcpTool(
        {
          sdk: dummySdk,
          pool,
          token: WRITE_SEQUENCES_TOKEN,
        },
        "maintenance.reindex.request",
        {
          payload: {
            indexName: "articles",
            jobKind: "backfill",
          },
        }
      ),
    (error) => error instanceof JsonRpcError && error.code === -32602
  );
  await assert.rejects(
    () =>
      executeMcpTool(
        {
          sdk: dummySdk,
          pool,
          token: WRITE_SEQUENCES_TOKEN,
        },
        "maintenance.reindex.request",
        {
          payload: {
            indexName: "interest_centroids",
            jobKind: "repair",
          },
        }
      ),
    (error) => error instanceof JsonRpcError && error.code === -32602
  );
  assert.equal(pool.state.clientQueries.length, 0);
});

test("MCP reindex backfill stores selection replay defaults and read-back hints", async () => {
  const dummySdk = createNewsPortalSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async () => {
      throw new Error("fetch should not be called by maintenance.reindex.request");
    }) as typeof fetch,
  });
  const pool = createFakeReindexPool();

  const result = await executeMcpTool(
    {
      sdk: dummySdk,
      pool,
      token: WRITE_SEQUENCES_TOKEN,
    },
    "maintenance.reindex.request",
    {
      payload: {
        indexName: "interest_centroids",
        jobKind: "backfill",
      },
    }
  );
  const reindexInsert = pool.state.clientQueries.find((entry) =>
    /insert into public\.reindex_jobs/i.test(entry.sql)
  );
  assert.ok(reindexInsert, "reindex job insert should be recorded");
  assert.equal(reindexInsert.params[1], "interest_centroids");
  assert.equal(reindexInsert.params[2], "backfill");
  assert.deepEqual(JSON.parse(String(reindexInsert.params[3])), {
    batchSize: 100,
    retroNotifications: "skip",
    replayExistingArticles: true,
    includeEnrichment: false,
    forceEnrichment: false,
  });
  assert.equal(pool.state.released, true);
  assert.equal(typeof (result as Record<string, unknown>).reindexJobId, "string");
  assert.match(
    JSON.stringify((result as Record<string, unknown>).nextReadBack),
    /operator\.report\.verify/
  );
});

test("MCP tool metadata disambiguates selection replay from content analysis backfill", () => {
  const tools = new Map(listMcpTools().map((tool) => [tool.name, tool]));
  const reindex = tools.get("maintenance.reindex.request");
  const reindexJobs = tools.get("maintenance.reindex_jobs.list");
  const contentBackfill = tools.get("content_analysis.backfill.request");

  assert.ok(reindex);
  assert.deepEqual(reindex.inputSchema.properties?.payload?.properties?.indexName?.enum, [
    "interest_centroids",
    "event_cluster_centroids",
  ]);
  assert.deepEqual(reindex.inputSchema.properties?.payload?.properties?.jobKind?.enum, [
    "rebuild",
    "backfill",
  ]);
  assert.match(reindex.description, /old articles|historical|existing/i);
  assert.match(reindex.description, /current system interests|interest_filter_results/i);
  assert.match(reindex.description, /final_selection_results|selected\/pass_through/i);
  assert.match(reindex.description, /jobKind=backfill/i);

  assert.ok(reindexJobs);
  assert.match(reindexJobs.description, /status, job_kind/i);
  assert.match(reindexJobs.description, /options_json/i);

  assert.ok(contentBackfill);
  assert.match(contentBackfill.description, /does not recompute article\.match_criteria/i);
  assert.match(contentBackfill.description, /interest_filter_results/i);
  assert.match(contentBackfill.description, /final_selection_results/i);
});

test("content analysis backfill response warns that final selection is not recomputed", async () => {
  const requests: Array<Record<string, unknown>> = [];
  const sdk = createNewsPortalSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async (_input, init) => {
      requests.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
      return new Response(JSON.stringify({ reindexJobId: "job-content-analysis", status: "queued" }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    }) as typeof fetch,
  });

  const result = await executeMcpTool(
    {
      sdk,
      pool: createFakeMcpPool(),
      token: WRITE_SEQUENCES_TOKEN,
    },
    "content_analysis.backfill.request",
    {
      payload: {
        subjectTypes: "article, web_resource",
        modules: "ner\ncontent_filter",
        subjectIds: "doc-1, doc-2",
      },
    }
  );

  assert.deepEqual(requests[0]?.subjectTypes, ["article", "web_resource"]);
  assert.deepEqual(requests[0]?.modules, ["ner", "content_filter"]);
  assert.deepEqual(requests[0]?.subjectIds, ["doc-1", "doc-2"]);
  assert.match(JSON.stringify(result), /does not recompute article\.match_criteria/i);
  assert.match(JSON.stringify(result), /final_selection_results/i);
  assert.match(JSON.stringify(result), /operator\.report\.verify/i);
});

test("SDK exposes resilient discovery mutation routes needed by MCP parity", async () => {
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

  await sdk.cancelDiscoveryRun<Record<string, unknown>>("11111111-1111-4111-8111-111111111111");
  await sdk.promoteDiscoveryEndpoint<Record<string, unknown>>(
    "22222222-2222-4222-8222-222222222222",
    { enabled: true }
  );
  await sdk.rejectDiscoveryEndpoint<Record<string, unknown>>(
    "33333333-3333-4333-8333-333333333333",
    { reason: "low evidence" }
  );

  assert.deepEqual(requests, [
    {
      url: "http://api.example.test/maintenance/discovery/runs/11111111-1111-4111-8111-111111111111/cancel",
      method: "POST",
    },
    {
      url: "http://api.example.test/maintenance/discovery/endpoints/22222222-2222-4222-8222-222222222222/promote",
      method: "POST",
    },
    {
      url: "http://api.example.test/maintenance/discovery/endpoints/33333333-3333-4333-8333-333333333333/reject",
      method: "POST",
    },
  ]);
});
