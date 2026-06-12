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
import { createSignalOpsSdk } from "../../../packages/sdk/src/index.ts";
import {
  buildToolResult,
  JsonRpcError,
  parseJsonRpcRequest,
  readOptionalArgumentsObject,
} from "../../../services/mcp/src/protocol.ts";
import { MCP_SERVER_INSTRUCTIONS } from "../../../services/mcp/src/context.ts";
import {
  getDiagnosticsGuide,
  getOperatingModelGuide,
  getTuningGuide,
} from "../../../services/mcp/src/operating-intelligence.ts";
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

const DESTRUCTIVE_DISCOVERY_TOKEN = {
  ...WRITE_DISCOVERY_TOKEN,
  tokenId: "token-destructive-discovery",
  scopes: ["read", "write.discovery", "write.destructive"],
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

function createFakeSystemInterestWritePool() {
  const state: Record<string, unknown> = {
    interestTemplateId: "",
    allowedContentKinds: ["editorial", "listing"],
    policyJson: {
      strictness: "balanced",
      unresolvedDecision: "hold",
      llmReviewMode: "always",
    },
    definitionJson: {
      candidateSignals: {
        positiveGroups: [{ name: "buyer_need", cues: ["needs external implementation"] }],
        negativeGroups: [{ name: "vendor_marketing", cues: ["case study"] }],
      },
    },
    auditRows: [],
    clientQueries: [],
    poolQueries: [],
    released: false,
  };
  const client = {
    async query(sql: string, params: unknown[] = []) {
      (state.clientQueries as Array<unknown>).push({ sql, params });
      if (/^begin$/i.test(sql) || /^commit$/i.test(sql) || /^rollback$/i.test(sql)) {
        return { rows: [] };
      }
      if (/insert into interest_templates/i.test(sql)) {
        state.interestTemplateId = String(params[0]);
        state.allowedContentKinds = JSON.parse(String(params[10]));
        return { rows: [] };
      }
      if (/from interest_templates\s+where interest_template_id/i.test(sql)) {
        return {
          rows: [
            {
              interest_template_id: String(state.interestTemplateId),
              name: "Strict interest",
              description: "Representative evidence",
              positive_texts: ["buyer asks for implementation support"],
              negative_texts: [],
              must_have_terms: [],
              must_not_have_terms: [],
              places: [],
              languages_allowed: ["en"],
              time_window_hours: null,
              allowed_content_kinds: state.allowedContentKinds,
              short_tokens_required: [],
              short_tokens_forbidden: [],
              priority: 1,
              is_active: true,
            },
          ],
        };
      }
      if (/from criteria\s+where source_interest_template_id/i.test(sql)) {
        const hasCriterion = Boolean(state.criterionId);
        return {
          rows: hasCriterion
            ? [
                {
                  criterion_id: state.criterionId,
                  description: "Strict interest",
                  version: 1,
                  positive_texts: ["buyer asks for implementation support"],
                  negative_texts: [],
                  must_have_terms: [],
                  must_not_have_terms: [],
                  places: [],
                  languages_allowed: ["en"],
                  time_window_hours: null,
                  short_tokens_required: [],
                  short_tokens_forbidden: [],
                  priority: 1,
                  enabled: true,
                  compiled: false,
                  compile_status: "queued",
                },
              ]
            : [],
        };
      }
      if (/insert into criteria/i.test(sql)) {
        state.criterionId = "22222222-2222-4222-8222-222222222222";
        return { rows: [{ criterion_id: state.criterionId, version: 1 }] };
      }
      if (/from selection_profiles\s+where source_interest_template_id/i.test(sql)) {
        return { rows: [] };
      }
      if (/insert into selection_profiles/i.test(sql)) {
        state.selectionProfileId = "33333333-3333-4333-8333-333333333333";
        state.definitionJson = JSON.parse(String(params[6]));
        state.policyJson = JSON.parse(String(params[7]));
        return { rows: [{ selection_profile_id: state.selectionProfileId, version: 1 }] };
      }
      if (/insert into outbox_events/i.test(sql)) {
        return { rows: [] };
      }
      if (/insert into audit_log/i.test(sql)) {
        (state.auditRows as Array<unknown>).push(params);
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL in fake system interest write client: ${sql}`);
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
      (state.poolQueries as Array<unknown>).push({ sql, params });
      if (/from interest_templates it/i.test(sql)) {
        return {
          rows: [
            {
              interestTemplateId: String(state.interestTemplateId),
              allowedContentKinds: state.allowedContentKinds,
              criterionId: state.criterionId,
              criterionCompiled: false,
              criterionCompileStatus: "queued",
              compiledRowStatus: null,
              selectionProfileId: state.selectionProfileId,
              selectionProfileStatus: "active",
              selectionProfileVersion: 1,
              policyJson: state.policyJson,
              definitionJson: state.definitionJson,
            },
          ],
        };
      }
      throw new Error(`Unexpected SQL in fake system interest write pool: ${sql}`);
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

function createFakeChannelSyncRequestPool() {
  const state = {
    runtimeStateUpserts: [] as Array<{ sql: string; params: unknown[] }>,
    outboxInserts: [] as Array<{ sql: string; params: unknown[] }>,
    auditRows: [] as unknown[][],
  };
  return {
    state,
    async query(sql: string, params: unknown[] = []) {
      if (/insert into outbox_events/i.test(sql)) {
        state.outboxInserts.push({ sql, params });
        return {
          rows: [
            {
              event_id: "77777777-7777-4777-8777-777777777777",
              event_type: "source.channel.sync.requested",
              aggregate_type: "source_channel",
              aggregate_id: String(params[0]),
              payload_json: JSON.parse(String(params[1])),
            },
          ],
        };
      }
      if (/insert into source_channel_runtime_state/i.test(sql)) {
        state.runtimeStateUpserts.push({ sql, params });
        return { rows: [] };
      }
      if (/insert into audit_log/i.test(sql)) {
        state.auditRows.push(params);
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL in fake channel sync request pool: ${sql}`);
    },
  };
}

function createFakeTemplateDuplicateAuditPool() {
  const state = {
    queries: [] as Array<{ sql: string; params: unknown[] }>,
  };
  const interestRows = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      name: "[odpt-alpha] funded startups and scaleups",
      description: "Funding and scaleup buyer demand.",
      positive_texts: ["implementation partner"],
      negative_texts: [],
      must_have_terms: ["budget"],
      must_not_have_terms: [],
      places: ["United States"],
      languages_allowed: ["en"],
      short_tokens_required: ["rfp"],
      short_tokens_forbidden: [],
      priority: 80,
      isActive: true,
      updatedAt: "2026-05-08T10:00:00.000Z",
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      name: "[odpt-beta] funded startups and scaleups",
      description: "Funding and scaleup buyer demand.",
      positive_texts: ["implementation partner"],
      negative_texts: [],
      must_have_terms: ["project"],
      must_not_have_terms: [],
      places: ["Canada"],
      languages_allowed: ["en"],
      short_tokens_required: ["tender"],
      short_tokens_forbidden: [],
      priority: 80,
      isActive: true,
      updatedAt: "2026-05-08T11:00:00.000Z",
    },
    {
      id: "33333333-3333-4333-8333-333333333333",
      name: "high recall bridge proof",
      description: "Bridge/corpus proof-only interest.",
      positive_texts: [],
      negative_texts: [],
      must_have_terms: [],
      must_not_have_terms: [],
      places: [],
      languages_allowed: [],
      short_tokens_required: [],
      short_tokens_forbidden: [],
      priority: 10,
      isActive: false,
      updatedAt: "2026-05-08T09:00:00.000Z",
    },
  ];
  const llmRows = [
    {
      id: "44444444-4444-4444-8444-444444444444",
      name: "[odpt-alpha] Public signal demand gray-zone reviewer",
      scope: "criteria",
      language: "en",
      template_text: "Review gray-zone buyer demand.",
      isActive: true,
      updatedAt: "2026-05-08T10:00:00.000Z",
    },
    {
      id: "55555555-5555-4555-8555-555555555555",
      name: "[odpt-beta] Public signal demand gray-zone reviewer",
      scope: "criteria",
      language: "en",
      template_text: "Review gray-zone buyer demand.",
      isActive: true,
      updatedAt: "2026-05-08T11:00:00.000Z",
    },
  ];

  return {
    state,
    async query(sql: string, params: unknown[] = []) {
      state.queries.push({ sql, params });
      const includeInactive = params[0] === true;
      if (/left join criteria c on c\.source_interest_template_id/i.test(sql)) {
        return {
          rows: [
            {
              interestTemplateId: "11111111-1111-4111-8111-111111111111",
              name: "[odpt-alpha] funded startups and scaleups",
              isActive: true,
              interestUpdatedAt: "2026-05-08T10:00:00.000Z",
              criterionId: "aaaaaaaa-1111-4111-8111-111111111111",
              criterionEnabled: true,
              criterionCompiled: true,
              criterionCompileStatus: "compiled",
              criterionUpdatedAt: "2026-05-08T10:01:00.000Z",
              compiledRowStatus: "compiled",
              compiledAt: "2026-05-08T10:02:00.000Z",
              selectionProfileId: "bbbbbbbb-1111-4111-8111-111111111111",
              selectionProfileStatus: "active",
              selectionProfileVersion: 3,
            },
            {
              interestTemplateId: "22222222-2222-4222-8222-222222222222",
              name: "[odpt-beta] funded startups and scaleups",
              isActive: true,
              interestUpdatedAt: "2026-05-08T11:00:00.000Z",
              criterionId: "cccccccc-1111-4111-8111-111111111111",
              criterionEnabled: true,
              criterionCompiled: false,
              criterionCompileStatus: "queued",
              criterionUpdatedAt: "2026-05-08T11:01:00.000Z",
              compiledRowStatus: null,
              compiledAt: null,
              selectionProfileId: "dddddddd-1111-4111-8111-111111111111",
              selectionProfileStatus: "active",
              selectionProfileVersion: 1,
            },
          ],
        };
      }
      if (/from interest_templates/i.test(sql)) {
        return {
          rows: includeInactive ? interestRows : interestRows.filter((row) => row.isActive),
        };
      }
      if (/from llm_prompt_templates/i.test(sql)) {
        return {
          rows: includeInactive ? llmRows : llmRows.filter((row) => row.isActive),
        };
      }
      throw new Error(`Unexpected SQL in fake template duplicate audit pool: ${sql}`);
    },
  };
}

function createFakeFunnelAuditPool() {
  const state = {
    queries: [] as Array<{ sql: string; params: unknown[] }>,
  };
  return {
    state,
    async query(sql: string, params: unknown[] = []) {
      state.queries.push({ sql, params });
      if (/from interest_templates it\s+left join selection_profiles/i.test(sql)) {
        return {
          rows: [
            {
              interestTemplateId: "11111111-1111-4111-8111-111111111111",
              name: "ODPT Calibrated: procurement demand",
              description: "Buyer procurement and tender demand.",
              mustHaveTerms: ["mandatory_phrase"],
              mustNotHaveTerms: ["case study"],
              shortTokensRequired: ["rfp"],
              allowedContentKinds: ["editorial", "listing"],
              timeWindowHours: 2160,
              places: ["United States"],
              languagesAllowed: ["en"],
              definitionJson: {},
              policyJson: {},
              isActive: true,
              updatedAt: "2026-05-11T10:00:00.000Z",
            },
            {
              interestTemplateId: "22222222-2222-4222-8222-222222222222",
              name: "ODPT Calibrated: procurement demand copy",
              description: "Buyer procurement and tender demand.",
              mustHaveTerms: [],
              mustNotHaveTerms: [],
              shortTokensRequired: [],
              allowedContentKinds: ["editorial", "listing", "document"],
              timeWindowHours: null,
              places: [],
              languagesAllowed: ["en"],
              definitionJson: {},
              policyJson: {},
              isActive: true,
              updatedAt: "2026-05-11T10:01:00.000Z",
            },
          ],
        };
      }
      if (/from llm_prompt_templates\s+where is_active = true/i.test(sql)) {
        return {
          rows: [
            {
              promptTemplateId: "33333333-3333-4333-8333-333333333333",
              name: "Buyer-intent interest review",
              scope: "interests",
              language: "en",
              templateText: "Reject seller-authored pages, but missing wrapper and bland title instructions.",
              isActive: true,
              updatedAt: "2026-05-11T10:02:00.000Z",
            },
          ],
        };
      }
      if (/count\(c\.criterion_id\)/i.test(sql)) {
        return {
          rows: [
            {
              activeInterests: 2,
              activeInterestsWithCriterion: 2,
              compiledActiveCriteria: 1,
              activeSelectionProfiles: 2,
            },
          ],
        };
      }
      if (/from final_selection_results\s+group by final_decision/i.test(sql)) {
        return {
          rows: [
            { finalDecision: "selected", count: 12 },
            { finalDecision: "gray_zone", count: 25 },
            { finalDecision: "rejected", count: 100 },
          ],
        };
      }
      if (/from system_feed_results/i.test(sql)) {
        return {
          rows: [
            {
              webVisibleEligible: 10,
              eligibleRows: 10,
              pendingLlmRows: 2,
              systemFeedRows: 12,
            },
          ],
        };
      }
      if (/stalePassThroughCount/i.test(sql)) {
        return {
          rows: [
            {
              stalePassThroughCount: 0,
              missingInterestFilterResults: 0,
            },
          ],
        };
      }
      if (/from final_selection_results\s+group by verification_state/i.test(sql)) {
        return {
          rows: [
            { verificationState: "strong", finalDecision: "selected", count: 12 },
            { verificationState: "medium", finalDecision: "gray_zone", count: 25 },
          ],
        };
      }
      if (/from source_inventory/i.test(sql)) {
        return {
          rows: [
            {
              sourceInventoryId: "inventory-1",
              canonicalDomain: "example.com",
              currentState: "cheap_watch",
              providerType: "website",
              riskJson: { risk: "low" },
              updatedAt: "2026-05-11T10:03:00.000Z",
            },
          ],
        };
      }
      if (/from adapter_backlog/i.test(sql)) {
        return {
          rows: [
            {
              adapterNeed: "custom_adapter",
              priority: "normal",
              status: "open",
              count: 5,
            },
          ],
        };
      }
      throw new Error(`Unexpected SQL in fake funnel audit pool: ${sql}`);
    },
  };
}

function createFakeSourceFamilyPool() {
  const state = {
    queries: [] as Array<{ sql: string; params: unknown[] }>,
  };
  return {
    state,
    async query(sql: string, params: unknown[] = []) {
      state.queries.push({ sql, params });
      if (/from source_channels sc/i.test(sql)) {
        return {
          rows: [
            {
              channelId: "11111111-1111-4111-8111-111111111111",
              name: "HN query",
              providerType: "rss",
              adapterKey: null,
              researchMode: null,
              tosRisk: null,
              sourceRole: "community_search",
              fetchUrl: "https://hnrss.org/newest?q=project",
              isActive: true,
              pollIntervalSeconds: 3600,
              effectivePollIntervalSeconds: 7200,
              lastSuccessAt: new Date("2026-05-11T10:00:00.000Z"),
              lastErrorText: null,
              lastOutcomeKind: "new_content",
              lastHttpStatus: 200,
              consecutiveFailures: 0,
              runCount7d: 2,
              failureCount7d: 0,
              newItemCount7d: 18,
              signalCandidateCount: 18,
              webResourceCount: 0,
              selectedRows: 0,
              grayRows: 2,
              rejectedRows: 16,
              configJson: {},
            },
          ],
        };
      }
      if (/from source_inventory/i.test(sql)) {
        return {
          rows: [
            {
              sourceRole: "closed_professional_network",
              providerType: "search",
              endpointUrl: "https://www.linkedin.com/jobs/",
              status: "monitor_only",
              recommendedAction: "monitor",
              evidenceJson: {
                adapterResearch: {
                  accessKind: "closed_access",
                  adapterKey: "linkedin_public_signal_research",
                },
              },
            },
          ],
        };
      }
      throw new Error(`Unexpected SQL in fake source-family pool: ${sql}`);
    },
  };
}

function createFakeHoldQualityPool() {
  const state = {
    queries: [] as Array<{ sql: string; params: unknown[] }>,
  };
  const holdRow = {
    docId: "aaaaaaaa-1111-4111-8111-111111111111",
    title: "Looking for an ERP migration partner",
    url: "https://example.test/project",
    publishedAt: "2026-05-10T10:00:00.000Z",
    channelId: "bbbbbbbb-1111-4111-8111-111111111111",
    channelName: "Example Business Feed",
    providerType: "rss",
    finalDecision: "gray_zone",
    isSelected: false,
    verificationState: "medium",
    selectionReason: "candidate_signal_hold",
    downstreamLossBucket: "project_intent_hold",
    selectionBlockerReason: "candidate_signal_hold",
    holdReason: "candidate_signal_hold",
    candidateSignalTier: "project_intent",
    candidateSignalUpliftCount: 1,
    llmReviewPendingCount: 0,
    holdCount: 1,
    finalSelectionExplain: {
      candidateSignalTier: "project_intent",
      downstreamLossBucket: "project_intent_hold",
    },
    holdEvidence: [
      {
        semanticDecision: "gray_zone",
        candidateSignals: {
          candidateSignalTier: "project_intent",
          positiveSignals: { buyer: ["looking for"], project: ["migration"] },
        },
        llmReviewAllowed: true,
      },
    ],
  };
  return {
    state,
    async query(sql: string, params: unknown[] = []) {
      state.queries.push({ sql, params });
      if (/jsonb_agg/i.test(sql)) {
        return { rows: [holdRow] };
      }
      if (/group by tier/i.test(sql)) {
        return { rows: [{ tier: "project_intent", count: 1 }] };
      }
      if (/group by bucket/i.test(sql)) {
        return { rows: [{ bucket: "project_intent_hold", count: 1 }] };
      }
      if (/group by fsr\.verification_state/i.test(sql)) {
        return { rows: [{ verificationState: "medium", count: 1 }] };
      }
      if (/llmReviewPending/i.test(sql)) {
        return { rows: [{ count: 0 }] };
      }
      if (/select count\(\*\)::int as count/i.test(sql)) {
        return { rows: [{ count: 1 }] };
      }
      throw new Error(`Unexpected SQL in fake hold-quality pool: ${sql}`);
    },
  };
}

function createFakeSelectionPrecisionPool() {
  const state = {
    queries: [] as Array<{ sql: string; params: unknown[] }>,
  };
  return {
    state,
    async query(sql: string, params: unknown[] = []) {
      state.queries.push({ sql, params });
      if (/technicalFilterRows/i.test(sql)) {
        return { rows: [{ technicalFilterRows: 0, semanticEvaluatedRows: 2, semanticNotEvaluatedRows: 0 }] };
      }
      if (/"filterRows"/i.test(sql) && /"affectedCriteriaCount"/i.test(sql)) {
        return { rows: [] };
      }
      if (/select reason,\s*count\(\*\)::int as count/i.test(sql)) {
        return { rows: [] };
      }
      if (/"processedCandidateCount"/i.test(sql)) {
        return {
          rows: [
            {
              processedCandidateCount: 2,
              pendingCandidateCount: 0,
              criteriaCount: 1,
              expectedResultRows: 2,
              materializedResultRows: 2,
            },
          ],
        };
      }
      if (/invalidShortTokensRequired/i.test(sql)) {
        return { rows: [] };
      }
      if (/from signal_candidates\s+group by coalesce\(content_kind/i.test(sql)) {
        return { rows: [{ contentKind: "editorial", count: 2 }] };
      }
      if (/excludedObservedContentKinds/i.test(sql)) {
        return { rows: [] };
      }
      if (/source_interest_template_id/i.test(sql) && /technical_filter_state = 'filtered_out'/i.test(sql)) {
        return { rows: [] };
      }
      if (/from llm_review_log/i.test(sql)) {
        return { rows: [] };
      }
      if (/sourceClass/i.test(sql) && /from source_channels sc/i.test(sql)) {
        return { rows: [] };
      }
      if (/sp\.definition_json as "definitionJson"/i.test(sql)) {
        return { rows: [] };
      }
      if (/candidateSignalsRecoveryRows/i.test(sql)) {
        return {
          rows: [
            {
              candidateSignalsRecoveryRows: 0,
              positiveCueGroupHitCount: 0,
              negativeCueGroupHitCount: 0,
              positiveCueFragmentHitRows: 0,
              evaluatedRows: 2,
            },
          ],
        };
      }
      if (/activeSelectionProfileVersion/i.test(sql) && /filterResultProfileVersion/i.test(sql)) {
        return { rows: [] };
      }
      if (/minSFinal/i.test(sql) && /maxSFinal/i.test(sql)) {
        return {
          rows: [
            {
              minSFinal: 0.2,
              medianSFinal: 0.4,
              maxSFinal: 0.61,
              medianSPos: 0.3,
              maxSPos: 0.6,
              medianSLex: 0.1,
              maxSLex: 0.2,
              medianSMeta: 0.1,
              maxSMeta: 0.3,
              nearGrayThresholdRows: 1,
              grayZoneScoreRows: 1,
            },
          ],
        };
      }
      if (/from final_selection_results\s+group by coalesce\(final_decision/i.test(sql)) {
        return { rows: [{ finalDecision: "selected", reason: "semantic_match", count: 2 }] };
      }
      if (/criteriaWithPositiveEmbeddings/i.test(sql)) {
        return {
          rows: [{ criteriaWithPositiveEmbeddings: 1, rowsWithPositiveScore: 2, evaluatedRows: 2 }],
        };
      }
      if (/from final_selection_results fsr\s+join signal_candidates a/i.test(sql) && /selectionEvidence/i.test(sql)) {
        return {
          rows: [
            {
              docId: "aaaaaaaa-1111-4111-8111-111111111111",
              title: "RFP for CRM implementation partner",
              lead: "Buyer seeks proposals with budget and scope for a migration project.",
              url: "https://example.test/rfp/crm",
              totalFilterCount: 3,
              matchedFilterCount: 1,
              finalDecision: "selected",
              isSelected: true,
              selectionReason: "semantic_match",
              candidateSignalTier: "project_intent",
              finalSelectionExplain: {
                semanticSignalSummary: {
                  filterReasonCounts: {},
                },
              },
              selectionEvidence: [{ semanticDecision: "match" }],
            },
            {
              docId: "bbbbbbbb-1111-4111-8111-111111111111",
              title: "How to hire a software development agency",
              lead: "A generic guide and ranking page.",
              url: "https://www.linkedin.com/pulse/how-hire-development-agency",
              totalFilterCount: 2,
              matchedFilterCount: 1,
              finalDecision: "selected",
              isSelected: true,
              selectionReason: "semantic_match",
              candidateSignalTier: "",
              finalSelectionExplain: {
                semanticSignalSummary: {
                  filterReasonCounts: {},
                },
              },
              selectionEvidence: [{ semanticDecision: "match" }],
            },
          ],
        };
      }
      if (/stalePassThroughCount/i.test(sql)) {
        return {
          rows: [
            {
              stalePassThroughCount: 0,
              missingInterestFilterResults: 0,
            },
          ],
        };
      }
      throw new Error(`Unexpected SQL in fake selection-precision pool: ${sql}`);
    },
  };
}

function createFakeSelectionDashboardPool() {
  const state = {
    queries: [] as Array<{ sql: string; params: unknown[] }>,
  };
  const counts = [185, 1, 0];
  return {
    state,
    async query(sql: string, params: unknown[] = []) {
      state.queries.push({ sql, params });
      if (/technicalFilterRows/i.test(sql)) {
        return {
          rows: [
            {
              technicalFilterRows: 180,
              semanticEvaluatedRows: 2,
              semanticNotEvaluatedRows: 178,
            },
          ],
        };
      }
      if (/"filterRows"/i.test(sql) && /"affectedCriteriaCount"/i.test(sql)) {
        return {
          rows: [
            {
              reason: "wrapper_directory_noise",
              filterRows: 120,
              distinctCandidateCount: 12,
              affectedCriteriaCount: 9,
              topChannels: [
                { channelName: "Forum source", distinctCandidateCount: 8 },
                { channelName: "Listing source", distinctCandidateCount: 4 },
              ],
            },
            {
              reason: "time_window",
              filterRows: 60,
              distinctCandidateCount: 10,
              affectedCriteriaCount: 6,
              topChannels: [{ channelName: "Archive source", distinctCandidateCount: 10 }],
            },
          ],
        };
      }
      if (/select reason,\s*count\(\*\)::int as count/i.test(sql)) {
        return {
          rows: [
            { reason: "short_tokens_required", count: 120 },
            { reason: "content_kind", count: 60 },
          ],
        };
      }
      if (/"processedCandidateCount"/i.test(sql)) {
        return {
          rows: [
            {
              processedCandidateCount: 180,
              pendingCandidateCount: 5,
              criteriaCount: 9,
              expectedResultRows: 1620,
              materializedResultRows: 1620,
            },
          ],
        };
      }
      if (/invalidShortTokensRequired/i.test(sql)) {
        return {
          rows: [
            {
              interestTemplateId: "11111111-1111-4111-8111-111111111111",
              name: "Hidden signal",
              invalidShortTokensRequired: ["vendor needs to provide"],
            },
          ],
        };
      }
      if (/from signal_candidates\s+group by coalesce\(content_kind/i.test(sql)) {
        return { rows: [{ contentKind: "editorial", count: 185 }] };
      }
      if (/excludedObservedContentKinds/i.test(sql)) {
        return {
          rows: [
            {
              interestTemplateId: "11111111-1111-4111-8111-111111111111",
              name: "Listing-only interest",
              allowedContentKinds: ["listing"],
              excludedObservedContentKinds: [{ contentKind: "editorial", count: 185 }],
            },
          ],
        };
      }
      if (/topAffectedCriteria|source_interest_template_id/i.test(sql) && /technical_filter_state = 'filtered_out'/i.test(sql)) {
        return {
          rows: [
            {
              criterionId: "22222222-2222-4222-8222-222222222222",
              interestTemplateId: "11111111-1111-4111-8111-111111111111",
              name: "Hidden signal",
              reason: "short_tokens_required",
              count: 120,
            },
          ],
        };
      }
      if (/from llm_review_log/i.test(sql)) {
        return {
          rows: [{ errorText: "HTTP Error 404: Not Found", count: 3, lastSeenAt: "2026-06-06T08:00:00.000Z" }],
        };
      }
      if (/sourceClass/i.test(sql) && /from source_channels sc/i.test(sql)) {
        return {
          rows: [
            { sourceClass: "test_or_audit_like", count: 2, activeFailures: 2 },
            { sourceClass: "operator_like", count: 5, activeFailures: 1 },
          ],
        };
      }
      if (/sp\.definition_json as "definitionJson"/i.test(sql)) {
        return {
          rows: [
            {
              interestTemplateId: "11111111-1111-4111-8111-111111111111",
              name: "Hidden signal",
              definitionJson: {
                candidateSignals: {
                  positiveGroups: [
                    { name: "buyer_ask", cues: ["vendor_search"] },
                    { name: "project_object", cues: ["implementation partner"] },
                  ],
                  negativeGroups: [{ name: "noise", cues: ["generic_advice"] }],
                },
              },
            },
          ],
        };
      }
      if (/candidateSignalsRecoveryRows/i.test(sql)) {
        return {
          rows: [
            {
              candidateSignalsRecoveryRows: 0,
              positiveCueGroupHitCount: 0,
              negativeCueGroupHitCount: 0,
              positiveCueFragmentHitRows: 0,
              evaluatedRows: 1620,
            },
          ],
        };
      }
      if (/activeSelectionProfileVersion/i.test(sql) && /filterResultProfileVersion/i.test(sql)) {
        return {
          rows: [
            {
              activeSelectionProfileVersion: 5,
              filterResultProfileVersion: 3,
              filterRows: 74,
              distinctCandidateCount: 25,
              staleFilterResultRows: 74,
              reason: "unknown",
            },
            {
              activeSelectionProfileVersion: 5,
              filterResultProfileVersion: 5,
              filterRows: 1546,
              distinctCandidateCount: 155,
              staleFilterResultRows: 0,
              reason: "wrapper_directory_noise",
            },
          ],
        };
      }
      if (/minSFinal/i.test(sql) && /maxSFinal/i.test(sql)) {
        return {
          rows: [
            {
              minSFinal: 0,
              medianSFinal: 0.12,
              maxSFinal: 0.3373,
              medianSPos: 0.18,
              maxSPos: 0.41,
              medianSLex: 0.02,
              maxSLex: 0.08,
              medianSMeta: 0.04,
              maxSMeta: 0.12,
              nearGrayThresholdRows: 0,
              grayZoneScoreRows: 0,
            },
          ],
        };
      }
      if (/from final_selection_results\s+group by coalesce\(final_decision/i.test(sql)) {
        return { rows: [{ finalDecision: "rejected", reason: "below_threshold", count: 185 }] };
      }
      if (/criteriaWithPositiveEmbeddings/i.test(sql)) {
        return {
          rows: [{ criteriaWithPositiveEmbeddings: 9, rowsWithPositiveScore: 120, evaluatedRows: 1620 }],
        };
      }
      if (/group by coalesce\(final_decision/i.test(sql)) {
        return {
          rows: [
            {
              decision: "rejected",
              count: 185,
              selectedCount: 0,
              holdCount: 0,
              llmReviewPendingCount: 0,
            },
          ],
        };
      }
      if (/select count\(\*\)::int as total/i.test(sql)) {
        return { rows: [{ total: counts.shift() ?? 0 }] };
      }
      throw new Error(`Unexpected SQL in fake selection-dashboard pool: ${sql}`);
    },
  };
}

function createFakeSelectionReindexPlanPool() {
  const state = {
    queries: [] as Array<{ sql: string; params: unknown[] }>,
  };
  const holdByTier: Record<string, Record<string, unknown>> = {
    project_intent: {
      docId: "cccccccc-1111-4111-8111-111111111111",
      title: "Need ERP migration implementation partner",
      url: "https://example.test/marketplace/project",
      finalDecision: "gray_zone",
      isSelected: false,
      candidateSignalTier: "project_intent",
      downstreamLossBucket: "project_intent_hold",
      holdEvidence: [{ semanticDecision: "gray_zone" }],
    },
    buyer_intent: {
      docId: "dddddddd-1111-4111-8111-111111111111",
      title: "Looking for a mobile app vendor",
      url: "https://example.test/forum/buyer",
      finalDecision: "gray_zone",
      isSelected: false,
      candidateSignalTier: "buyer_intent",
      downstreamLossBucket: "buyer_intent_hold",
      holdEvidence: [{ semanticDecision: "gray_zone" }],
    },
    context: {
      docId: "eeeeeeee-1111-4111-8111-111111111111",
      title: "Funding portfolio archive",
      url: "https://example.test/funding/archive",
      finalDecision: "gray_zone",
      isSelected: false,
      candidateSignalTier: "context",
      downstreamLossBucket: "context_candidate_not_selected",
      holdEvidence: [{ semanticDecision: "gray_zone" }],
    },
  };
  return {
    state,
    async query(sql: string, params: unknown[] = []) {
      state.queries.push({ sql, params });
      if (/from final_selection_results fsr\s+join signal_candidates a/i.test(sql) && /selectionEvidence/i.test(sql)) {
        return {
          rows: [
            {
              docId: "aaaaaaaa-1111-4111-8111-111111111111",
              title: "RFP for CRM implementation partner",
              lead: "Buyer seeks proposals with budget and scope for a migration project.",
              url: "https://example.test/rfp/crm",
              totalFilterCount: 3,
              matchedFilterCount: 1,
              finalDecision: "selected",
              isSelected: true,
              selectionReason: "semantic_match",
              candidateSignalTier: "project_intent",
              finalSelectionExplain: { semanticSignalSummary: { filterReasonCounts: {} } },
              selectionEvidence: [{ semanticDecision: "match" }],
            },
            {
              docId: "bbbbbbbb-1111-4111-8111-111111111111",
              title: "How to hire a software development agency",
              lead: "A generic guide and ranking page.",
              url: "https://example.test/top-agencies",
              totalFilterCount: 2,
              matchedFilterCount: 1,
              finalDecision: "selected",
              isSelected: true,
              selectionReason: "semantic_match",
              candidateSignalTier: "",
              finalSelectionExplain: { semanticSignalSummary: { filterReasonCounts: {} } },
              selectionEvidence: [{ semanticDecision: "match" }],
            },
          ],
        };
      }
      if (/stalePassThroughCount/i.test(sql)) {
        return { rows: [{ stalePassThroughCount: 0, missingInterestFilterResults: 0 }] };
      }
      if (/jsonb_agg/i.test(sql)) {
        const tier = params.find((value) => typeof value === "string" && value in holdByTier) as string | undefined;
        return { rows: tier ? [holdByTier[tier]] : [] };
      }
      if (/select count\(\*\)::int as count/i.test(sql)) {
        const tier = params.find((value) => typeof value === "string" && value in holdByTier) as string | undefined;
        return { rows: [{ count: tier ? 1 : 0 }] };
      }
      throw new Error(`Unexpected SQL in fake selection-reindex-plan pool: ${sql}`);
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
      pattern: /from signal_candidates/i,
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
                  positiveGroups: [
                    {
                      name: "buyer_need",
                      tier: "project_intent",
                      cues: ["RFP", "vendor search"],
                    },
                  ],
                  negativeGroups: [
                    {
                      name: "vendor_marketing",
                      tier: "document_noise",
                      cues: ["case study"],
                    },
                  ],
                },
              },
              policy_json: {
                strictness: "broad",
                unresolvedDecision: "reject",
                llmReviewMode: "optional_high_value_only",
                signalVisibility: "explicit_marker",
                autoSelectMode: "evidence_led",
                autoSelectMinPositiveGroups: 2,
                autoSelectMinCueHits: 3,
                autoSelectRequiresNoNoise: false,
                autoSelectRequiresNoTechnicalVeto: true,
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
              purpose: "structured_extraction",
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
  assert.equal(interestPayload.selection_profile_signal_visibility, "explicit_marker");
  assert.equal(interestPayload.selection_profile_auto_select_mode, "evidence_led");
  assert.equal(interestPayload.selection_profile_auto_select_min_positive_groups, 2);
  assert.equal(interestPayload.selection_profile_auto_select_min_cue_hits, 3);
  assert.equal(interestPayload.selection_profile_auto_select_requires_no_noise, false);
  assert.equal(interestPayload.selection_profile_auto_select_requires_no_technical_veto, true);
  assert.deepEqual(interestPayload.candidate_positive_signal_groups, [
    {
      name: "buyer_need",
      tier: "project_intent",
      cues: ["RFP", "vendor search"],
    },
  ]);
  assert.deepEqual(interestPayload.candidate_negative_signal_groups, [
    {
      name: "vendor_marketing",
      tier: "document_noise",
      cues: ["case study"],
    },
  ]);

  const llmPayload = await hydrateTemplateUpdatePayloadForSave(queryable as any, {
    kind: "llm",
    promptTemplateId: "22222222-2222-4222-8222-222222222222",
    templateText: "Updated {title}",
  });

  assert.equal(llmPayload.templateText, "Updated {title}");
  assert.equal(llmPayload.name, "Existing LLM template");
  assert.equal(llmPayload.scope, "criteria");
  assert.equal(llmPayload.purpose, "structured_extraction");
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
  assert.ok(toolNames.includes("signal_candidates.list"));
  assert.ok(toolNames.includes("signal_candidates.read"));
  assert.ok(toolNames.includes("signal_candidates.explain"));
  assert.ok(toolNames.includes("content_items.list"));
  assert.ok(toolNames.includes("content_items.read"));
  assert.ok(toolNames.includes("content_items.explain"));
  assert.ok(toolNames.includes("outbox.events.list"));
  assert.ok(toolNames.includes("channels.sync.request"));
  assert.ok(toolNames.includes("signal_candidates.residuals.list"));
  assert.ok(toolNames.includes("signal_candidates.residuals.summary"));
  assert.ok(toolNames.includes("signal_candidates.holds.summary"));
  assert.ok(toolNames.includes("signal_candidates.holds.list"));
  assert.ok(toolNames.includes("signal_candidates.holds.explain"));
  assert.ok(toolNames.includes("sequences.create"));
  assert.ok(toolNames.includes("discovery.runs.create"));
  assert.ok(toolNames.includes("discovery_vnext.start_run"));
  assert.ok(toolNames.includes("discovery_vnext.preview_brief"));
  assert.ok(toolNames.includes("discovery_vnext.apply_routing"));
  assert.ok(toolNames.includes("discovery.artifacts.list"));
  assert.ok(toolNames.includes("discovery.candidates.list"));
  assert.ok(toolNames.includes("discovery.source_inventory.list"));
  assert.ok(toolNames.includes("discovery.policies.activate"));
  assert.ok(toolNames.includes("discovery.replay.start"));
  assert.ok(toolNames.includes("discovery.rollback.prepare"));
  assert.ok(toolNames.includes("discovery.rollback.apply"));
  assert.equal(toolNames.some((name) => name.includes(["source", "priors"].join("_"))), false);
  assert.equal(toolNames.some((name) => name.includes("endpoints.promote")), false);
  assert.equal(toolNames.some((name) => name.includes("targets.")), false);
  assert.ok(toolNames.includes("channels.alternatives.plan"));
  assert.ok(toolNames.includes("channels.alternatives.start"));
  assert.ok(toolNames.includes("channels.bottlenecks.summary"));
  assert.ok(toolNames.includes("channels.bottlenecks.list"));
  assert.ok(toolNames.includes("channels.bottlenecks.explain"));
  assert.ok(toolNames.includes("channels.set_active"));
  assert.ok(toolNames.includes("operator.funnel.audit"));
  assert.ok(toolNames.includes("operator.funnel.autoplan"));
  assert.ok(toolNames.includes("operator.funnel.iteration.recommend"));
  assert.ok(toolNames.includes("operator.flow.route"));
  assert.ok(toolNames.includes("operator.selection.dashboard"));
  assert.ok(toolNames.includes("operator.selection.reindex_plan"));
  assert.ok(toolNames.includes("discovery.source_families.coverage"));

  const resourceUris = listMcpResources().map((entry) => entry.uri);
  assert.ok(resourceUris.includes("signalops://guide/server-overview"));
  assert.ok(resourceUris.includes("signalops://guide/operator-playbooks"));
  assert.ok(resourceUris.includes("signalops://guide/scenarios/sequences"));
  assert.ok(resourceUris.includes("signalops://guide/scenarios/discovery"));
  assert.ok(resourceUris.includes("signalops://guide/scenarios/system-interests"));
  assert.ok(resourceUris.includes("signalops://guide/scenarios/llm-templates"));
  assert.ok(resourceUris.includes("signalops://guide/scenarios/channels"));
  assert.ok(resourceUris.includes("signalops://guide/scenarios/signal_candidate-diagnostics"));
  assert.ok(resourceUris.includes("signalops://guide/scenarios/observability"));
  assert.ok(resourceUris.includes("signalops://guide/scenarios/cleanup"));
  assert.ok(resourceUris.includes("signalops://guide/scenarios/funnel-calibration"));
  assert.ok(resourceUris.includes("signalops://guide/scenarios/selection-calibration"));
  assert.ok(resourceUris.includes("signalops://guide/scenarios/discovery-live-gap-hunting"));
  assert.ok(resourceUris.includes("signalops://guide/reference/selection-evidence-semantics"));
  assert.ok(resourceUris.includes("signalops://guide/reference/hidden-signal-evidence-lanes"));
  assert.ok(resourceUris.includes("signalops://guide/playbooks/flow-routing"));
  assert.ok(resourceUris.includes("signalops://guide/playbooks/operator-flow-modes"));
  assert.ok(resourceUris.includes("signalops://guide/playbooks/change-intents"));
  assert.ok(resourceUris.includes("signalops://signal-candidates/residuals-summary"));
  const resource = resolveMcpResource("signalops://admin/summary");
  assert.equal(resource.name, "admin.summary");
  const guideResource = resolveMcpResource("signalops://guide/server-overview");
  assert.equal(guideResource.name, "guide.server.overview");
  const discoveryGuideResource = resolveMcpResource("signalops://guide/scenarios/discovery");
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
  assert.ok(promptNames.includes("operator.funnel.calibrate"));
  assert.ok(promptNames.includes("discovery.live_gap_hunting.plan"));
  assert.ok(promptNames.includes("system_interest.polish"));
  assert.ok(promptNames.includes("llm_template.tune"));
  assert.ok(promptNames.includes("discovery.policy.tune"));
  assert.ok(promptNames.includes("discovery.artifact.review"));
  assert.ok(promptNames.includes("discovery.source_understanding.review"));
  const prompt = resolveMcpPrompt("sequence.draft");
  assert.equal(prompt.name, "sequence.draft");
  const orientationPrompt = resolveMcpPrompt("operator.session.start");
  const orientationRendered = orientationPrompt.render({
    objective: "review discovery sources",
    domain: "discovery",
  });
  assert.match(
    orientationRendered.messages[0]?.content.text ?? "",
    /signalops:\/\/guide\/server-overview/i
  );
  assert.match(orientationRendered.messages[0]?.content.text ?? "", /flowMode/);
  assert.match(orientationRendered.messages[0]?.content.text ?? "", /operator\.flow\.route/);
  const discoverySessionPrompt = resolveMcpPrompt("discovery.session.plan");
  const discoverySessionRendered = discoverySessionPrompt.render({
    objective: "promote a high-signal discovery endpoint",
  });
  assert.match(
    discoverySessionRendered.messages[0]?.content.text ?? "",
    /signalops:\/\/guide\/scenarios\/discovery/i
  );
  const funnelPrompt = resolveMcpPrompt("operator.funnel.calibrate");
  const funnelRendered = funnelPrompt.render({
    objective: "rare signal discovery",
    referenceEvidence: "Example C",
    currentGap: "selected content is flat",
  });
  assert.match(funnelRendered.messages[0]?.content.text ?? "", /operator\.funnel\.audit/i);
  const funnelGuide = resolveMcpResource("signalops://guide/scenarios/funnel-calibration");
  assert.equal(funnelGuide.name, "guide.scenarios.funnel-calibration");
  const liveGapGuide = resolveMcpResource("signalops://guide/scenarios/discovery-live-gap-hunting");
  assert.equal(liveGapGuide.name, "guide.scenarios.discovery-live-gap-hunting");
  const selectionCalibrationGuide = resolveMcpResource(
    "signalops://guide/scenarios/selection-calibration"
  );
  assert.equal(selectionCalibrationGuide.name, "guide.scenarios.selection-calibration");
  const selectionEvidenceGuide = resolveMcpResource(
    "signalops://guide/reference/selection-evidence-semantics"
  );
  assert.equal(selectionEvidenceGuide.name, "guide.reference.selection-evidence-semantics");
  const hiddenSignalGuide = resolveMcpResource(
    "signalops://guide/reference/hidden-signal-evidence-lanes"
  );
  assert.equal(hiddenSignalGuide.name, "guide.reference.hidden-signal-evidence-lanes");
  const strictNextStepsGuide = resolveMcpResource(
    "signalops://guide/playbooks/strict-next-steps"
  );
  assert.equal(strictNextStepsGuide.name, "guide.playbooks.strict-next-steps");
  const flowRoutingGuide = resolveMcpResource("signalops://guide/playbooks/flow-routing");
  assert.equal(flowRoutingGuide.name, "guide.playbooks.flow-routing");
  const operatorFlowModesGuide = resolveMcpResource(
    "signalops://guide/playbooks/operator-flow-modes"
  );
  assert.equal(operatorFlowModesGuide.name, "guide.playbooks.operator-flow-modes");
  const changeIntentsGuide = resolveMcpResource("signalops://guide/playbooks/change-intents");
  assert.equal(changeIntentsGuide.name, "guide.playbooks.change-intents");
  const liveGapPrompt = resolveMcpPrompt("discovery.live_gap_hunting.plan");
  const liveGapRendered = liveGapPrompt.render({
    objective: "prove real discovery gaps",
    scenarioPacks: "public_procurement, security_advisories",
    budget: "deep bounded live run",
  });
  assert.match(liveGapRendered.messages[0]?.content.text ?? "", /missing_mcp_surface/i);
  const observabilitySessionPrompt = resolveMcpPrompt("observability.session.plan");
  const observabilityRendered = observabilitySessionPrompt.render({
    question: "why did yesterday's recall yield weaken",
  });
  assert.match(
    observabilityRendered.messages[0]?.content.text ?? "",
    /signalops:\/\/guide\/scenarios\/observability/i
  );
  const systemInterestPolishPrompt = resolveMcpPrompt("system_interest.polish");
  const systemInterestPolishRendered = systemInterestPolishPrompt.render({
    interestName: "AI safety",
    residualPattern: "semantic_rejected repeated across policy-analysis signal_candidates",
  });
  assert.match(
    systemInterestPolishRendered.messages[0]?.content.text ?? "",
    /signalops:\/\/guide\/scenarios\/signal_candidate-diagnostics/i
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

test("MCP resource registry preserves complete metadata and representative reads", async () => {
  const resources = listMcpResources();

  assert.deepEqual(
    resources.map(({ uri, name, title }) => `${uri}|${name}|${title}`),
    [
      "signalops://guide/operating-model|guide.operating.model|Operating Model",
      "signalops://guide/playbooks/flow-routing|guide.playbooks.flow-routing|Flow Routing",
      "signalops://guide/playbooks/strict-next-steps|guide.playbooks.strict-next-steps|Strict Next Steps",
      "signalops://guide/playbooks/operator-flow-modes|guide.playbooks.operator-flow-modes|Operator Flow Modes",
      "signalops://guide/playbooks/change-intents|guide.playbooks.change-intents|Change Intents",
      "signalops://guide/diagnostics/channels|guide.diagnostics.channels|Diagnostics channels",
      "signalops://guide/tuning/channels|guide.tuning.channels|Tuning channels",
      "signalops://guide/diagnostics/website_pipeline|guide.diagnostics.website_pipeline|Diagnostics website_pipeline",
      "signalops://guide/tuning/website_pipeline|guide.tuning.website_pipeline|Tuning website_pipeline",
      "signalops://guide/diagnostics/selection|guide.diagnostics.selection|Diagnostics selection",
      "signalops://guide/tuning/selection|guide.tuning.selection|Tuning selection",
      "signalops://guide/diagnostics/content_analysis|guide.diagnostics.content_analysis|Diagnostics content_analysis",
      "signalops://guide/tuning/content_analysis|guide.tuning.content_analysis|Tuning content_analysis",
      "signalops://guide/diagnostics/llm_budget|guide.diagnostics.llm_budget|Diagnostics llm_budget",
      "signalops://guide/tuning/llm_budget|guide.tuning.llm_budget|Tuning llm_budget",
      "signalops://guide/diagnostics/discovery|guide.diagnostics.discovery|Diagnostics discovery",
      "signalops://guide/tuning/discovery|guide.tuning.discovery|Tuning discovery",
      "signalops://guide/diagnostics/sequences|guide.diagnostics.sequences|Diagnostics sequences",
      "signalops://guide/tuning/sequences|guide.tuning.sequences|Tuning sequences",
      "signalops://guide/diagnostics/cleanup|guide.diagnostics.cleanup|Diagnostics cleanup",
      "signalops://guide/tuning/cleanup|guide.tuning.cleanup|Tuning cleanup",
      "signalops://ops/health|ops.health|Operational Health",
      "signalops://ops/issues|ops.issues|Operational Issues",
      "signalops://ops/tuning-backlog|ops.tuning.backlog|Tuning Backlog",
      "signalops://ops/recent-changes|ops.recent.changes|Recent MCP Changes",
      "signalops://guide/server-overview|guide.server.overview|Guide Server Overview",
      "signalops://guide/client-contract|guide.client.contract|MCP Client Contract",
      "signalops://guide/reference/selection-evidence-semantics|guide.reference.selection-evidence-semantics|Selection Evidence Semantics",
      "signalops://guide/reference/hidden-signal-evidence-lanes|guide.reference.hidden-signal-evidence-lanes|Hidden Signal Evidence Lanes",
      "signalops://guide/operator-playbooks|guide.operator.playbooks|Guide Operator Playbooks",
      "signalops://guide/scenarios/sequences|guide.scenarios.sequences|Guide Scenarios Sequences",
      "signalops://guide/scenarios/discovery|guide.scenarios.discovery|Guide Scenarios Discovery",
      "signalops://guide/scenarios/discovery-live-gap-hunting|guide.scenarios.discovery-live-gap-hunting|Guide Scenarios Discovery Live Gap Hunting",
      "signalops://guide/scenarios/funnel-calibration|guide.scenarios.funnel-calibration|Guide Scenarios Funnel Calibration",
      "signalops://guide/scenarios/selection-calibration|guide.scenarios.selection-calibration|Guide Scenarios Selection Calibration",
      "signalops://guide/scenarios/system-interests|guide.scenarios.system-interests|Guide Scenarios System Interests",
      "signalops://guide/scenarios/llm-templates|guide.scenarios.llm-templates|Guide Scenarios LLM Templates",
      "signalops://guide/scenarios/channels|guide.scenarios.channels|Guide Scenarios Channels",
      "signalops://guide/scenarios/signal_candidate-diagnostics|guide.scenarios.signal_candidate-diagnostics|Guide Scenarios Signal Candidate Diagnostics",
      "signalops://guide/scenarios/observability|guide.scenarios.observability|Guide Scenarios Observability",
      "signalops://guide/scenarios/cleanup|guide.scenarios.cleanup|Guide Scenarios Cleanup",
      "signalops://admin/summary|admin.summary|Admin Summary",
      "signalops://llm/budget-summary|llm.budget.summary|LLM Budget Summary",
      "signalops://discovery/runs|discovery.runs|Discovery Runs",
      "signalops://discovery/artifacts|discovery.artifacts|Discovery Artifacts",
      "signalops://discovery/candidates|discovery.candidates|Discovery Candidates",
      "signalops://discovery/source-inventory|discovery.source_inventory|Discovery Source Inventory",
      "signalops://discovery/policies|discovery.policies|Discovery Policies",
      "signalops://discovery/adapter-backlog|discovery.adapter_backlog|Discovery Adapter Backlog",
      "signalops://discovery/feedback|discovery.feedback|Discovery Feedback",
      "signalops://discovery/replay-runs|discovery.replay_runs|Discovery Replay Runs",
      "signalops://discovery/rollback-groups|discovery.rollback_groups|Discovery Rollback Groups",
      "signalops://discovery/eval-runs|discovery.eval_runs|Discovery Eval Runs",
      "signalops://system-interests|system.interests|System Interests",
      "signalops://templates/llm|llm.templates|LLM Templates",
      "signalops://channels|channels|Channels",
      "signalops://sequences|sequences|Sequences",
      "signalops://web-resources|web.resources|Web Resources",
      "signalops://fetch-runs|fetch.runs|Fetch Runs",
      "signalops://signal-candidates/residuals-summary|signal_candidates.residuals.summary|Signal Candidates Residuals Summary",
    ]
  );
  assert.equal(new Set(resources.map((entry) => entry.uri)).size, resources.length);
  assert.equal(resources.every((entry) => entry.mimeType === "application/json"), true);

  assert.equal(resolveMcpResource("signalops://admin/summary").name, "admin.summary");
  assert.throws(
    () => resolveMcpResource("signalops://resource/does-not-exist"),
    (error) => error instanceof JsonRpcError && error.code === -32602
  );

  const serverOverview = await resolveMcpResource("signalops://guide/server-overview").read({} as any);
  assert.match(JSON.stringify(serverOverview), /bounded remote operator control plane/);
  assert.match(JSON.stringify(serverOverview), /admin\.summary\.get/);

  const clientContract = await resolveMcpResource("signalops://guide/client-contract").read({} as any);
  assert.match(JSON.stringify(clientContract), /Write payloads must be JSON objects/);
  assert.match(JSON.stringify(clientContract), /read-back/);

  const flowRouting = await resolveMcpResource("signalops://guide/playbooks/flow-routing").read({} as any);
  assert.equal((flowRouting as Record<string, unknown>).canonicalTool, "operator.flow.route");
  assert.match(JSON.stringify(flowRouting), /signalops:\/\/guide\/reference\/hidden-signal-evidence-lanes/);

  const referenceGuide = await resolveMcpResource(
    "signalops://guide/reference/selection-evidence-semantics"
  ).read({} as any);
  assert.match(JSON.stringify(referenceGuide), /final_selection_results/);
  assert.match(JSON.stringify(referenceGuide), /candidateSignals/);

  const scenarioGuide = await resolveMcpResource("signalops://guide/scenarios/discovery").read({} as any);
  assert.match(JSON.stringify(scenarioGuide), /Discovery vNext/);
  assert.match(JSON.stringify(scenarioGuide), /source inventory/);

  const operatorPlaybooks = await resolveMcpResource("signalops://guide/operator-playbooks").read({} as any);
  assert.match(JSON.stringify(operatorPlaybooks), /selection-calibration-zero-selected/);

  const opsContext = {
    sdk: {
      async getDashboardSummary() {
        return { ok: true };
      },
      async listDiscoveryVNextRecords() {
        return { items: [] };
      },
      async getLlmBudgetSummary() {
        return { budget: "empty" };
      },
      async getSignalCandidateResidualSummary() {
        return { buckets: [] };
      },
    },
    pool: {
      async query() {
        return { rows: [] };
      },
    },
  };
  const opsHealth = await resolveMcpResource("signalops://ops/health").read(opsContext as any);
  assert.match(JSON.stringify(opsHealth), /PostgreSQL source_channels/);
  assert.match(JSON.stringify(opsHealth), /API-backed dashboard/);
  const recentChanges = await resolveMcpResource("signalops://ops/recent-changes").read(opsContext as any);
  assert.deepEqual((recentChanges as Record<string, unknown>).recentMcpRequests, []);
});

test("MCP prompt registry preserves complete metadata and critical renders", () => {
  const prompts = listMcpPrompts();

  assert.deepEqual(
    prompts.map(
      ({ name, description, arguments: promptArgs }) =>
        `${name}|${description}|${promptArgs.map((arg) => arg.name).join(",")}`
    ),
    [
      "diagnose.mcp_error|Diagnose an MCP client/tool error and choose the next safe read or schema correction.|error,objective",
      "operator.session.start|Starter guidance for understanding and safely using the SignalOps MCP server.|objective,domain",
      "sequences.session.plan|Starter guidance for safe sequence creation, execution, and recovery work through MCP.|objective",
      "discovery.session.plan|Starter guidance for safe discovery and source-onboarding work through MCP.|objective",
      "operator.funnel.calibrate|Compare a prior working manual/reference bundle with current MCP state before discovery or template tuning.|objective,referenceEvidence,currentGap",
      "discovery.live_gap_hunting.plan|Plan a domain-neutral live Discovery vNext gap-hunting run that uses MCP-only operator actions.|objective,scenarioPacks,budget",
      "discovery.source_understanding.review|Review SourceUnderstanding, RoutingDecision, or probation source evidence.|contract",
      "system_interests.session.plan|Starter guidance for system-interest maintenance through MCP.|topic",
      "llm_templates.session.plan|Starter guidance for LLM template maintenance through MCP.|templateIntent",
      "channels.session.plan|Starter guidance for channel onboarding and maintenance through MCP.|source",
      "observability.session.plan|Starter guidance for read-only diagnosis and evidence gathering through MCP.|question",
      "operations.daily_review|Run a daily read-only operational review of SignalOps after setup.|focus",
      "operations.issue_triage|Triage a concrete production/operator symptom through read-only MCP diagnostics.|symptom,domain",
      "selection.tuning.plan|Plan a safe selection fine-tuning session from residual/signal_candidate evidence.|objective,residualBucket",
      "channel.health.review|Review channel fetch health and source onboarding state.|channelId",
      "website.pipeline.review|Explain website resources, projection, and downstream signal_candidate selection outcomes.|channelId",
      "llm_budget.review|Review LLM budget pressure, review behavior, and gray-zone/hold outcomes.|question",
      "discovery.yield.review|Review Discovery vNext run, artifact, source inventory, and routing quality.|runId,sourceInventoryId",
      "system_interest.create|Draft a bounded system-interest payload before calling MCP write tools.|topic,audience",
      "system_interest.polish|Turn signal_candidate residual evidence into a bounded system-interest tuning recommendation.|interestName,residualPattern",
      "llm_template.tune|Turn signal_candidate residual evidence into a bounded LLM template tuning recommendation.|templateName,residualPattern",
      "discovery.policy.tune|Turn signal_candidate residual evidence into a bounded Discovery vNext policy/artifact tuning recommendation.|targetTitle,residualPattern",
      "discovery.artifact.review|Review a Discovery vNext artifact or run before route/register/replay.|targetTitle,goal",
      "sequence.draft|Draft a sequence definition for the automation control plane.|objective",
      "cleanup.guidance|Prompt for safe MCP cleanup planning after experiments or tests.|scope",
    ]
  );
  assert.equal(new Set(prompts.map((entry) => entry.name)).size, prompts.length);
  assert.equal(resolveMcpPrompt("sequence.draft").name, "sequence.draft");
  assert.throws(
    () => resolveMcpPrompt("prompt.does.not.exist"),
    (error) => error instanceof JsonRpcError && error.code === -32602
  );

  const operatorSessionText =
    resolveMcpPrompt("operator.session.start").render({
      objective: "repair selected-signal recall",
      domain: "selection",
    }).messages[0]?.content.text ?? "";
  assert.match(operatorSessionText, /operator\.flow\.route/);
  assert.match(operatorSessionText, /signalops:\/\/guide\/server-overview/);
  assert.match(operatorSessionText, /flowMode/);

  const discoverySessionText =
    resolveMcpPrompt("discovery.session.plan").render({
      objective: "onboard high-signal public sources",
    }).messages[0]?.content.text ?? "";
  assert.match(discoverySessionText, /Discovery vNext/);
  assert.match(discoverySessionText, /passed_with_quality_gap/);
  assert.match(discoverySessionText, /source inventory/i);

  const selectionTuningText =
    resolveMcpPrompt("selection.tuning.plan").render({
      objective: "increase_recall",
      residualBucket: "semantic_rejected/no_system_match",
    }).messages[0]?.content.text ?? "";
  assert.match(selectionTuningText, /candidate_positive_signals/);
  assert.match(selectionTuningText, /must_have_terms=\[\]/);
  assert.match(selectionTuningText, /operator\.report\.verify/);

  const channelReviewText =
    resolveMcpPrompt("channel.health.review").render({
      channelId: "rss-channel",
    }).messages[0]?.content.text ?? "";
  assert.match(channelReviewText, /channels\.alternatives\.plan/);
  assert.match(channelReviewText, /website_fallback/);

  const llmReviewText =
    resolveMcpPrompt("llm_budget.review").render({
      question: "why is LLM spend zero",
    }).messages[0]?.content.text ?? "";
  assert.match(llmReviewText, /provider_endpoint_error/);
  assert.match(llmReviewText, /no reviewable candidate path/);

  const cleanupText =
    resolveMcpPrompt("cleanup.guidance").render({
      scope: "test artifacts and stale tokens",
    }).messages[0]?.content.text ?? "";
  assert.match(cleanupText, /admin\.mcp_tokens\.list\/revoke\/delete_revoked/);
  assert.match(cleanupText, /migration-owned default\/adaptive\/system sequences/);
});

test("MCP selection calibration guidance explains zero-selected diagnostics", async () => {
  const guide = resolveMcpResource("signalops://guide/scenarios/selection-calibration");
  const guideText = JSON.stringify(await guide.read({} as any));
  const strictGuide = resolveMcpResource("signalops://guide/playbooks/strict-next-steps");
  const strictGuideText = JSON.stringify(await strictGuide.read({} as any));
  const flowRoutingGuide = resolveMcpResource("signalops://guide/playbooks/flow-routing");
  const flowRoutingGuideText = JSON.stringify(await flowRoutingGuide.read({} as any));
  const flowModesGuide = resolveMcpResource("signalops://guide/playbooks/operator-flow-modes");
  const flowModesGuideText = JSON.stringify(await flowModesGuide.read({} as any));
  const changeIntentsGuide = resolveMcpResource("signalops://guide/playbooks/change-intents");
  const changeIntentsGuideText = JSON.stringify(await changeIntentsGuide.read({} as any));
  const evidenceGuide = resolveMcpResource("signalops://guide/reference/selection-evidence-semantics");
  const evidenceGuideText = JSON.stringify(await evidenceGuide.read({} as any));
  const hiddenSignalGuide = resolveMcpResource(
    "signalops://guide/reference/hidden-signal-evidence-lanes"
  );
  const hiddenSignalGuideText = JSON.stringify(await hiddenSignalGuide.read({} as any));
  const tuningGuide = resolveMcpResource("signalops://guide/tuning/selection");
  const tuningGuideText = JSON.stringify(await tuningGuide.read({} as any));

  assert.match(evidenceGuideText, /must_have_terms/);
  assert.match(evidenceGuideText, /any-of/);
  assert.match(evidenceGuideText, /hard pre-semantic gate/);
  assert.match(evidenceGuideText, /unsafe for hidden intent/i);
  assert.match(evidenceGuideText, /short_tokens_required/);
  assert.match(evidenceGuideText, /extracted short-token/);
  assert.match(evidenceGuideText, /positive_texts/);
  assert.match(evidenceGuideText, /not keyword/);
  assert.match(evidenceGuideText, /candidateSignals/);
  assert.match(evidenceGuideText, /docIds/);
  assert.match(evidenceGuideText, /operator\.report\.verify/);
  assert.match(evidenceGuideText, /criteriaMatches/);
  assert.match(evidenceGuideText, /interestMatches/);
  assert.match(evidenceGuideText, /row counters/i);
  assert.match(evidenceGuideText, /distinct candidates/i);
  assert.match(evidenceGuideText, /filterReasonBreakdown\.distinctCandidateCount/);
  assert.match(evidenceGuideText, /gray_zone/);
  assert.match(evidenceGuideText, /hidden-signal-evidence-lanes/);
  assert.match(hiddenSignalGuideText, /explicit_marker/);
  assert.match(hiddenSignalGuideText, /hidden_intent/);
  assert.match(hiddenSignalGuideText, /mixed/);
  assert.match(hiddenSignalGuideText, /unknown/);
  assert.match(hiddenSignalGuideText, /must_have_terms=\[\]/);
  assert.match(hiddenSignalGuideText, /short_tokens_required=\[\]/);
  assert.match(hiddenSignalGuideText, /OR hard gate is not hidden-signal safe/);
  assert.match(hiddenSignalGuideText, /mandatory marker/i);
  assert.match(hiddenSignalGuideText, /group\.name/);
  assert.match(hiddenSignalGuideText, /group\.cues/);
  assert.match(hiddenSignalGuideText, /literal observable text fragments/);
  assert.match(guideText, /semantic_rejected\/no_system_match/);
  assert.match(guideText, /llmReviewMode=always/);
  assert.match(guideText, /candidateSignals/);
  assert.match(guideText, /docIds/);
  assert.match(guideText, /operator\.report\.verify/);
  assert.match(guideText, /preflight\/not_applicable/);
  assert.match(guideText, /criteriaMatches\/interestMatches/);
  assert.match(guideText, /filterReasonBreakdown/);
  assert.match(guideText, /distinctCandidateCount/);
  assert.match(guideText, /Globally removing wrapper/);
  assert.match(guideText, /gray[- ]zone collapse/i);
  assert.match(guideText, /signalVisibility/);
  assert.match(guideText, /hidden_intent/);
  assert.match(guideText, /must_have_terms=\[\]/);
  assert.match(guideText, /literal observable fragments/);
  assert.match(guideText, /strict-next-steps/);
  assert.match(strictGuideText, /must_do_next/);
  assert.match(strictGuideText, /read-back -> classify -> bounded write -> bounded replay -> verify/);
  assert.match(strictGuideText, /candidate_positive_signals/);
  assert.match(strictGuideText, /discovery\.brief\.preview.*not a bypass/i);
  assert.match(strictGuideText, /passed_with_quality_gap.*partial proof/i);
  assert.match(strictGuideText, /mandatory for autonomous\/default MCP client recommendations/i);
  assert.match(strictGuideText, /not a ban on expert operator action/i);
  assert.match(strictGuideText, /planned_change_flow/i);
  assert.match(strictGuideText, /hidden_intent/);
  assert.match(strictGuideText, /OR must_have_terms remains a hard pre-semantic gate/);
  assert.match(flowRoutingGuideText, /operator\.flow\.route/);
  assert.match(flowRoutingGuideText, /mustRead/);
  assert.match(flowRoutingGuideText, /mustDoNext/);
  assert.match(flowRoutingGuideText, /doNotDoYet/);
  assert.match(flowRoutingGuideText, /A route block is not proof of effect/);
  assert.match(flowRoutingGuideText, /Source acquisition proof is not selection proof/);
  assert.match(flowModesGuideText, /diagnostic_flow/);
  assert.match(flowModesGuideText, /operator\.flow\.route/);
  assert.match(flowModesGuideText, /planned_change_flow/);
  assert.match(flowModesGuideText, /expert_override_flow/);
  assert.match(flowModesGuideText, /source_onboarding_flow/);
  assert.match(flowModesGuideText, /scenario_pack_rollout_flow/);
  assert.match(flowModesGuideText, /cleanup_flow/);
  assert.match(flowModesGuideText, /operatorOverrideReason/);
  assert.match(flowModesGuideText, /read-back/);
  assert.match(flowModesGuideText, /operator\.report\.verify/);
  assert.match(flowModesGuideText, /changeIntent/);
  assert.match(flowModesGuideText, /cleanupIntent/);
  assert.match(flowModesGuideText, /tuningLayer/);
  assert.match(flowModesGuideText, /signalVisibility/);
  assert.match(flowModesGuideText, /hardGatePolicy/);
  assert.match(changeIntentsGuideText, /system_update/);
  assert.match(changeIntentsGuideText, /selection_tuning/);
  assert.match(changeIntentsGuideText, /llm_tuning/);
  assert.match(changeIntentsGuideText, /source_tuning/);
  assert.match(changeIntentsGuideText, /cleanupIntent/);
  assert.match(changeIntentsGuideText, /Mutation response is not verified effect/);
  assert.match(changeIntentsGuideText, /Source acquisition proof is not selection proof/);
  assert.match(changeIntentsGuideText, /signalVisibility=explicit_marker/);
  assert.match(changeIntentsGuideText, /hardGatePolicy=forbidden_by_default/);
  assert.match(tuningGuideText, /semantic_rejected\/no_system_match/);
  assert.match(tuningGuideText, /candidateSignals/);
  assert.match(tuningGuideText, /docIds/);

  assert.match(MCP_SERVER_INSTRUCTIONS, /0 selected/i);
  assert.match(MCP_SERVER_INSTRUCTIONS, /semantic_rejected\/no_system_match/);
  assert.match(MCP_SERVER_INSTRUCTIONS, /no_pending_gray_zone/);
  assert.match(MCP_SERVER_INSTRUCTIONS, /runtime_credentials_missing/);
  assert.match(MCP_SERVER_INSTRUCTIONS, /operator\.flow\.route/);
  assert.match(MCP_SERVER_INSTRUCTIONS, /signalops:\/\/guide\/playbooks\/strict-next-steps/);
  assert.match(MCP_SERVER_INSTRUCTIONS, /signalops:\/\/guide\/playbooks\/operator-flow-modes/);
  assert.match(MCP_SERVER_INSTRUCTIONS, /signalops:\/\/guide\/playbooks\/change-intents/);
  assert.match(MCP_SERVER_INSTRUCTIONS, /flowMode/);
  assert.match(MCP_SERVER_INSTRUCTIONS, /changeIntent/);
  assert.match(MCP_SERVER_INSTRUCTIONS, /candidate_positive_signals/);
  assert.match(MCP_SERVER_INSTRUCTIONS, /signalVisibility/);
  assert.match(MCP_SERVER_INSTRUCTIONS, /must_have_terms=\[\]/);
  assert.match(MCP_SERVER_INSTRUCTIONS, /Snake_case\/id-like cues/);

  const selectionPrompt = resolveMcpPrompt("selection.tuning.plan").render({
    objective: "increase_recall",
    residualBucket: "semantic_rejected/no_system_match",
  });
  const selectionText = selectionPrompt.messages[0]?.content.text ?? "";
  assert.match(selectionText, /semantic_rejected\/no_system_match/);
  assert.match(selectionText, /candidateSignals/);
  assert.match(selectionText, /filter rows are not distinct candidates/);
  assert.match(selectionText, /docIds/);
  assert.match(selectionText, /operator\.report\.verify/);
  assert.match(selectionText, /operator\.flow\.route/);
  assert.match(selectionText, /route block/);
  assert.match(selectionText, /candidate_positive_signals/);
  assert.match(selectionText, /planned_change/);
  assert.match(selectionText, /expert_override/);
  assert.match(selectionText, /changeIntent=selection_tuning/);
  assert.match(selectionText, /tuningLayer/);
  assert.match(selectionText, /signalVisibility/);
  assert.match(selectionText, /candidateSignalsHitRate/);
  assert.match(selectionText, /labelLikeCueWarnings/);
  assert.match(selectionText, /hard lexical gates/);
  assert.doesNotMatch(selectionText, /positive-term expansion.*main|broaden positive signals/i);

  const llmPrompt = resolveMcpPrompt("llm_budget.review").render({
    question: "why is LLM spend zero",
  });
  const llmText = llmPrompt.messages[0]?.content.text ?? "";
  assert.match(llmText, /no_pending_gray_zone/);
  assert.match(llmText, /semantic rejection before LLM/);
  assert.match(llmText, /changeIntent=llm_tuning/);
  assert.match(llmText, /tuningLayer=llm_provider/);

  const discoveryPrompt = resolveMcpPrompt("discovery.session.plan").render({
    objective: "run live Discovery",
  });
  const discoveryText = discoveryPrompt.messages[0]?.content.text ?? "";
  assert.match(discoveryText, /runtime_credentials_missing/);
  assert.match(discoveryText, /preflight\/not_applicable/);
  assert.match(discoveryText, /passed_with_quality_gap.*partial proof/i);
  assert.match(discoveryText, /domain_contamination/);
  assert.match(discoveryText, /operator-flow-modes/);
  assert.match(discoveryText, /change-intents/);

  const systemInterestSession = resolveMcpPrompt("system_interests.session.plan").render({
    topic: "rare operational signal",
  });
  assert.match(systemInterestSession.messages[0]?.content.text ?? "", /planned_change/);
  assert.match(systemInterestSession.messages[0]?.content.text ?? "", /expert_override/);
  assert.match(systemInterestSession.messages[0]?.content.text ?? "", /changeIntent=config_update/);

  const channelSession = resolveMcpPrompt("channels.session.plan").render({
    source: "new source family",
  });
  const channelSessionText = channelSession.messages[0]?.content.text ?? "";
  assert.match(channelSessionText, /source_onboarding/);
  assert.match(channelSessionText, /changeIntent=source_tuning/);
  assert.match(channelSessionText, /channels\.bulk_onboard\.plan/);

  const systemInterestPrompt = resolveMcpPrompt("system_interest.create").render({
    topic: "hidden operational signal family",
  });
  const systemInterestText = systemInterestPrompt.messages[0]?.content.text ?? "";
  assert.match(systemInterestText, /real item-level evidence/i);
  assert.match(systemInterestText, /candidate cue groups/i);
  assert.match(systemInterestText, /Hidden\/operational signals/i);
  assert.match(systemInterestText, /group\.name/);
  assert.match(systemInterestText, /group\.cues/);
  assert.match(systemInterestText, /must_have_terms=\[\]/);

  const channelPrompt = resolveMcpPrompt("channel.health.review").render({
    channelId: "rss-channel",
  });
  const channelText = channelPrompt.messages[0]?.content.text ?? "";
  assert.match(channelText, /channels\.alternatives\.plan/);
  assert.match(channelText, /website_fallback/);
});

test("Discovery brief preview MCP schema accepts portable cue fields", () => {
  const tool = listMcpTools().find((item) => item.name === "discovery.brief.preview");
  assert.ok(tool);
  const properties = (tool.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
  assert.ok(properties.positiveTexts);
  assert.ok(properties.negativeTexts);
  assert.ok(properties.candidatePositiveSignals);
  assert.ok(properties.candidateNegativeSignals);
  assert.ok(properties.operatorConstraints);
});

test("MCP channels.sync.request enqueues refetch and read-back hints without invalid runtime state", async () => {
  const pool = createFakeChannelSyncRequestPool();
  const channelId = "11111111-1111-4111-8111-111111111111";

  const result = (await executeMcpTool(
    {
      sdk: createSignalOpsSdk({ baseUrl: "http://api.example.test" }),
      pool,
      token: WRITE_CHANNELS_TOKEN,
    },
    "channels.sync.request",
    {
      channelId,
      reason: "operator requested fresh fetch",
    }
  )) as Record<string, unknown>;

  assert.equal(result.event_type, "source.channel.sync.requested");
  assert.equal(pool.state.outboxInserts.length, 1);
  assert.equal(pool.state.runtimeStateUpserts.length, 1);
  const runtimeSql = pool.state.runtimeStateUpserts[0]?.sql ?? "";
  assert.match(runtimeSql, /adaptive_enabled/i);
  assert.match(runtimeSql, /max_poll_interval_seconds/i);
  assert.match(runtimeSql, /least\(poll_interval_seconds \* 16, 604800\)/i);
  const nextReadBack = result.nextReadBack as {
    tools: Array<{ name: string; arguments: Record<string, unknown> }>;
  };
  assert.equal(nextReadBack.tools[0]?.name, "channels.read");
  assert.equal(nextReadBack.tools[1]?.name, "fetch_runs.list");
  assert.equal(nextReadBack.tools[2]?.name, "outbox.events.list");
  assert.equal(nextReadBack.tools[0]?.arguments.channelId, "<channelId-from-response>");
  assert.equal(nextReadBack.tools[1]?.arguments.channelId, "<channelId-from-response>");
  assert.equal(nextReadBack.tools[2]?.arguments.aggregateId, "<channelId-from-response>");
});

test("MCP read tools accept common report aliases for system interest read-back", async () => {
  const requests: string[] = [];
  const sdk = createSignalOpsSdk({
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

test("MCP template duplicate audit separates system interests from LLM templates", async () => {
  const pool = createFakeTemplateDuplicateAuditPool();
  const result = (await executeMcpTool(
    {
      sdk: createSignalOpsSdk({ baseUrl: "http://api.example.test" }),
      pool,
      token: WRITE_TEMPLATES_TOKEN,
    },
    "templates.duplicates.audit",
    {
      includeInactive: false,
      includeSamples: false,
    }
  )) as Record<string, unknown>;

  const totals = result.totals as Record<string, unknown>;
  assert.equal(totals.interests, 2);
  assert.equal(totals.llmTemplates, 2);
  assert.equal(totals.interestNameDuplicateGroups, 1);
  assert.equal(totals.llmNameDuplicateGroups, 1);
  assert.equal(totals.likelyProofOnlyInterestCount, 0);
  assert.match(JSON.stringify(result), /system_interests\.archive/);
  assert.match(JSON.stringify(result), /llm_templates\.archive/);
});

test("MCP system interest compile status reports uncompiled active criteria blockers", async () => {
  const result = (await executeMcpTool(
    {
      sdk: createSignalOpsSdk({ baseUrl: "http://api.example.test" }),
      pool: createFakeTemplateDuplicateAuditPool(),
      token: WRITE_TEMPLATES_TOKEN,
    },
    "system_interests.compile_status.list",
    {
      includeSamples: true,
    }
  )) as Record<string, unknown>;

  const totals = result.totals as Record<string, unknown>;
  assert.equal(totals.activeInterests, 2);
  assert.equal(totals.compiledActiveCriteria, 1);
  assert.equal(totals.blockerCount, 1);
  assert.match(JSON.stringify(result), /criterion_not_compiled/);
  assert.match(JSON.stringify(result), /maintenance\.reindex\.request/);
});

test("MCP operator funnel audit reports calibration drift without mutating", async () => {
  const dummySdk = createSignalOpsSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async () => {
      throw new Error("operator.funnel.audit should use the DB-backed pool");
    }) as typeof fetch,
  });
  const pool = createFakeFunnelAuditPool();

  const result = (await executeMcpTool(
    {
      sdk: dummySdk,
      pool,
      token: WRITE_TEMPLATES_TOKEN,
    },
    "operator.funnel.audit",
    {
      objective: "rare buyer-demand calibration",
      referenceEvidenceKind: "reference_text",
      referenceText:
        "Rare buyer-side demand funnel. Buyer-authored marketplace project cards and formal procurement notices should survive wrapper noise. Seller-authored pages reject. Bland procurement titles can pass when body evidence is concrete. Baseline must_have_terms empty, time window null, allowed kinds include editorial listing document data_file api_payload.",
      domainPrefix: "ODPT",
      includeDiscovery: true,
      includeSamples: true,
    }
  )) as Record<string, unknown>;

  const serialized = JSON.stringify(result);
  assert.equal(result.readOnly, true);
  assert.match(serialized, /hardGateDrift/);
  assert.match(serialized, /contentKindDrift/);
  assert.match(serialized, /promptGuardrailDrift/);
  assert.match(serialized, /adapterRequiredGap/);
  assert.match(serialized, /system_interests\.update/);
  assert.match(serialized, /maintenance\.reindex\.request/);
  assert.equal(pool.state.queries.length, 9);
});

test("MCP funnel calibration report verify returns DB-backed drift counts", async () => {
  const dummySdk = createSignalOpsSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async () => {
      throw new Error("operator.report.verify should use the DB-backed pool");
    }) as typeof fetch,
  });

  const result = (await executeMcpTool(
    {
      sdk: dummySdk,
      pool: createFakeFunnelAuditPool(),
      token: WRITE_TEMPLATES_TOKEN,
    },
    "operator.report.verify",
    {
      reportKind: "funnel_calibration",
      entityIds: { domainPrefix: "ODPT" },
      includeSamples: true,
    }
  )) as Record<string, unknown>;

  const serialized = JSON.stringify(result);
  assert.match(serialized, /funnel_calibration/);
  assert.match(serialized, /hardGateDrift/);
  assert.match(serialized, /webVisibleEligible/);
  assert.match(serialized, /operator\.funnel\.audit/);
});

test("MCP coverage-first funnel guidance retains noisy source inventory", async () => {
  const dummySdk = createSignalOpsSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async () => {
      throw new Error("coverage-first funnel tools should use the DB-backed pool");
    }) as typeof fetch,
  });
  const pool = createFakeSourceFamilyPool();

  const plan = (await executeMcpTool(
    {
      sdk: dummySdk,
      pool,
      token: WRITE_DISCOVERY_TOKEN,
    },
    "operator.funnel.autoplan",
    { objective: "rare buyer-demand discovery", maxNewChannels: 20, includeSamples: true }
  )) as Record<string, unknown>;

  assert.equal(plan.readOnly, true);
  assert.match(JSON.stringify(plan), /coverage_first_retention/);
  assert.match(JSON.stringify(plan), /working noisy/);
  assert.equal(((plan.selectionTuningPlan as Record<string, unknown>) ?? {}).sourceMetadataCanSelect, false);

  const recommendation = (await executeMcpTool(
    {
      sdk: dummySdk,
      pool,
      token: WRITE_DISCOVERY_TOKEN,
    },
    "operator.funnel.iteration.recommend",
    { objective: "rare buyer-demand discovery", includeSamples: true }
  )) as Record<string, unknown>;

  assert.equal(
    ((recommendation.decisionPolicy as Record<string, unknown>) ?? {}).autoDisableWorkingNoisySources,
    false,
  );
});

test("MCP source family balance report verifies no auto-disable policy", async () => {
  const result = (await executeMcpTool(
    {
      sdk: createSignalOpsSdk({ baseUrl: "http://api.example.test" }),
      pool: createFakeSourceFamilyPool(),
      token: WRITE_DISCOVERY_TOKEN,
    },
    "operator.report.verify",
    {
      reportKind: "source_family_balance",
      entityIds: {},
      includeSamples: true,
    }
  )) as Record<string, unknown>;

  assert.match(JSON.stringify(result), /source_family_balance/);
  assert.match(JSON.stringify(result), /retainedWorkingNoisyChannels/);
  assert.match(JSON.stringify(result), /operator explicitly disables/);
});

test("MCP hold quality tools and report verify expose tiered hold evidence", async () => {
  const dummySdk = createSignalOpsSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async () => {
      throw new Error("hold-quality tools should use the DB-backed pool");
    }) as typeof fetch,
  });
  const pool = createFakeHoldQualityPool();

  const summary = (await executeMcpTool(
    {
      sdk: dummySdk,
      pool,
      token: WRITE_TEMPLATES_TOKEN,
    },
    "signal_candidates.holds.summary",
    {}
  )) as Record<string, unknown>;

  assert.equal(summary.totalHolds, 1);
  assert.match(JSON.stringify(summary), /project_intent/);

  const list = (await executeMcpTool(
    {
      sdk: dummySdk,
      pool,
      token: WRITE_TEMPLATES_TOKEN,
    },
    "signal_candidates.holds.list",
    { candidateSignalTier: "project_intent", pageSize: 25 }
  )) as Record<string, unknown>;

  const items = list.items as Array<Record<string, unknown>>;
  assert.equal(items.length, 1);
  assert.equal(items[0]?.candidateSignalTier, "project_intent");

  const report = (await executeMcpTool(
    {
      sdk: dummySdk,
      pool,
      token: WRITE_TEMPLATES_TOKEN,
    },
    "operator.report.verify",
    {
      reportKind: "selection_hold_quality",
      entityIds: {},
      includeSamples: true,
    }
  )) as Record<string, unknown>;

  assert.match(JSON.stringify(report), /selection_hold_quality/);
  assert.match(JSON.stringify(report), /signal_candidates\.holds\.list/);
  assert.match(JSON.stringify(report), /project_intent_hold/);
});

test("MCP selection precision audit buckets selected rows without a public gate split", async () => {
  const dummySdk = createSignalOpsSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async () => {
      throw new Error("operator.selection.precision_audit should use the DB-backed pool");
    }) as typeof fetch,
  });
  const pool = createFakeSelectionPrecisionPool();

  const audit = (await executeMcpTool(
    {
      sdk: dummySdk,
      pool,
      token: WRITE_TEMPLATES_TOKEN,
    },
    "operator.selection.precision_audit",
    { includeSamples: true }
  )) as Record<string, unknown>;

  assert.equal(audit.readOnly, true);
  assert.equal(audit.highQualityCount, 1);
  assert.equal(audit.weakSelectedCount, 1);
  assert.match(JSON.stringify(audit), /strong_project_signal/);
  assert.match(JSON.stringify(audit), /noise/);
  assert.match(JSON.stringify(audit), /selected is the only web truth/);

  const report = (await executeMcpTool(
    {
      sdk: dummySdk,
      pool,
      token: WRITE_TEMPLATES_TOKEN,
    },
    "operator.report.verify",
    {
      reportKind: "selection",
      entityIds: {},
      includeSamples: true,
    }
  )) as Record<string, unknown>;

  assert.match(JSON.stringify(report), /weakSelectedCount/);
  assert.match(JSON.stringify(report), /Do not add a separate public selected gate/);
  assert.match(JSON.stringify(report), /filterReasonBreakdown/);
  assert.match(JSON.stringify(report), /distinctCandidateCount/);
  assert.match(JSON.stringify(report), /processor diagnostics, not selected-signal proof/);
  assert.match(JSON.stringify(report), /Use filterReasonBreakdown\.distinctCandidateCount/);
  assert.match(JSON.stringify(report), /must_do_next/);
  assert.match(JSON.stringify(report), /blocked_until/);
  assert.match(JSON.stringify(report), /readBackVerification/);
  assert.equal(report.flowMode, "diagnostic");
  assert.equal(report.proofStatus, "partial");
  assert.equal(report.signalVisibility, "unknown");
  assert.equal(report.hardGatePolicy, "forbidden_by_default");
  assert.match(JSON.stringify(report), /scoreThresholdDiagnostics/);
  assert.match(JSON.stringify(report), /candidateSignalsHitRate/);
  assert.match(JSON.stringify(report), /staleness/);
  assert.equal((report.scoreThresholds as Record<string, unknown>).irrelevantMaxThreshold, 0.45);
  assert.match(JSON.stringify(report), /missingProof/);
  assert.match(JSON.stringify(report), /processor counters alone are not sufficient/);

  const blockedOverrideReport = (await executeMcpTool(
    {
      sdk: dummySdk,
      pool,
      token: WRITE_TEMPLATES_TOKEN,
    },
    "operator.report.verify",
    {
      reportKind: "selection",
      entityIds: {},
      operationMode: "expert_override",
      affectedScope: ["interest:known-operator-config"],
      includeSamples: true,
    }
  )) as Record<string, unknown>;

  assert.equal(blockedOverrideReport.flowMode, "expert_override");
  assert.equal(blockedOverrideReport.proofStatus, "blocked");
  assert.match(JSON.stringify(blockedOverrideReport), /operatorOverrideReason is required/);

  const allowedOverrideReport = (await executeMcpTool(
    {
      sdk: dummySdk,
      pool,
      token: WRITE_TEMPLATES_TOKEN,
    },
    "operator.report.verify",
    {
      reportKind: "selection",
      entityIds: {},
      operationMode: "expert_override",
      operatorOverrideReason: "operator intentionally applies one bounded config change",
      affectedScope: ["interest:known-operator-config"],
      includeSamples: true,
    }
  )) as Record<string, unknown>;

  assert.equal(allowedOverrideReport.flowMode, "expert_override");
  assert.equal(allowedOverrideReport.operatorOverrideNotes instanceof Array, true);
  assert.match(JSON.stringify(allowedOverrideReport), /Override can skip parts of diagnosis/);

  const plannedReport = (await executeMcpTool(
    {
      sdk: dummySdk,
      pool,
      token: WRITE_TEMPLATES_TOKEN,
    },
    "operator.report.verify",
    {
      reportKind: "selection",
      entityIds: {},
      operationMode: "planned_change",
      changeIntent: "selection_tuning",
      tuningLayer: "technical_filter",
      includeSamples: true,
    }
  )) as Record<string, unknown>;

  assert.equal(plannedReport.flowMode, "planned_change");
  assert.equal(plannedReport.changeIntent, "selection_tuning");
  assert.equal(plannedReport.tuningLayer, "technical_filter");
  assert.match(JSON.stringify(plannedReport), /intentProofRequired/);
  assert.match(JSON.stringify(plannedReport), /mutation response alone is not verified effect|processor counters alone are not sufficient/i);
});

test("MCP selection dashboard explains raw signal_candidate totals versus selected signals", async () => {
  const dummySdk = createSignalOpsSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/content-items")) {
        return new Response(
          JSON.stringify({
            items: [],
            page: 1,
            pageSize: 1,
            total: 0,
            totalPages: 0,
            hasPrev: false,
            hasNext: false,
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      throw new Error(`Unexpected SDK call: ${url}`);
    }) as typeof fetch,
  });
  const pool = createFakeSelectionDashboardPool();

  const dashboard = (await executeMcpTool(
    {
      sdk: dummySdk,
      pool,
      token: WRITE_TEMPLATES_TOKEN,
    },
    "operator.selection.dashboard",
    {}
  )) as Record<string, unknown>;

  const counts = dashboard.counts as Record<string, unknown>;
  assert.equal(dashboard.readOnly, true);
  assert.equal(counts.rawSignalCandidateObservations, 185);
  assert.equal(counts.selectedSignalCandidateSignals, 0);
  assert.equal(counts.visibleContentItems, 0);
  assert.equal(counts.technicalFilterRows, 180);
  assert.equal(counts.semanticEvaluatedRows, 2);
  assert.equal(counts.processedCandidateCount, 180);
  assert.equal(counts.pendingCandidateCount, 5);
  assert.equal(counts.criteriaCount, 9);
  assert.equal(counts.expectedResultRows, 1620);
  assert.equal(counts.materializedResultRows, 1620);
  assert.equal((dashboard.filterReasonCounts as Record<string, unknown>).short_tokens_required, 120);
  const breakdown = dashboard.filterReasonBreakdown as Array<Record<string, unknown>>;
  assert.equal(breakdown[0]?.reason, "wrapper_directory_noise");
  assert.equal(breakdown[0]?.filterRows, 120);
  assert.equal(breakdown[0]?.distinctCandidateCount, 12);
  assert.equal(breakdown[0]?.affectedCriteriaCount, 9);
  assert.match(JSON.stringify(dashboard.counterSemantics), /not unique candidate counts/);
  assert.equal((dashboard.diagnosticHints as Record<string, unknown>).hardFilterCollapseSuspected, true);
  assert.equal((dashboard.diagnosticHints as Record<string, unknown>).shortTokenPhraseMismatch, true);
  assert.equal((dashboard.diagnosticHints as Record<string, unknown>).contentKindMismatch, true);
  assert.equal((dashboard.diagnosticHints as Record<string, unknown>).llmProviderEndpointError, true);
  assert.equal((dashboard.diagnosticHints as Record<string, unknown>).activeTestChannelNoise, true);
  assert.equal((dashboard.diagnosticHints as Record<string, unknown>).filterRowsNotCandidateRows, true);
  assert.equal((dashboard.diagnosticHints as Record<string, unknown>).belowGrayThreshold, true);
  assert.equal((dashboard.diagnosticHints as Record<string, unknown>).zeroCandidateSignalHits, true);
  assert.equal((dashboard.diagnosticHints as Record<string, unknown>).mixedProfileVersions, true);
  assert.equal(
    (dashboard.diagnosticHints as Record<string, unknown>).semanticEmbeddingsPresentButBelowThreshold,
    true
  );
  assert.equal(dashboard.candidateSignalsConfigured, true);
  assert.equal(dashboard.candidateSignalsHitRate, 0);
  assert.equal((dashboard.scoreThresholds as Record<string, unknown>).irrelevantMaxThreshold, 0.45);
  assert.equal((dashboard.scoreThresholds as Record<string, unknown>).relevantMinThreshold, 0.72);
  assert.equal((dashboard.scoreDistribution as Record<string, unknown>).maxSFinal, 0.3373);
  assert.match(JSON.stringify(dashboard.labelLikeCueWarnings), /vendor_search/);
  assert.match(JSON.stringify(dashboard.zeroHitCueGroups), /No configured candidateSignals cue groups/);
  assert.equal(
    ((dashboard.staleProfileDiagnostics as Record<string, unknown>).staleFilterResultRows),
    74
  );
  assert.match(
    String((dashboard.diagnosticHints as Record<string, unknown>).interestCentroidsNotSelectionRootCause),
    /criteria_compiled embeddings/
  );
  assert.match(JSON.stringify(dashboard), /raw editorial observations/i);
  assert.match(JSON.stringify(dashboard), /current active source count/i);
  assert.match(JSON.stringify(dashboard), /strict selection currently exposes zero/i);
  assert.match(JSON.stringify(dashboard), /zeroSelectedHighRejection/);
  assert.match(JSON.stringify(dashboard), /grayZoneCollapseSuspected/);
  assert.match(JSON.stringify(dashboard), /invalidShortTokensRequired/);
  assert.match(JSON.stringify(dashboard), /signal_candidates\.residuals\.summary/);
  assert.match(JSON.stringify(dashboard), /system_interests\.compile_status\.list/);
  assert.match(JSON.stringify(dashboard), /operator\.report\.verify/);
});

test("MCP operator tuning recommend avoids positive-term expansion for semantic recall", async () => {
  const sdk = {
    async getDashboardSummary() {
      return {};
    },
    async listDiscoveryVNextRecords() {
      return { items: [] };
    },
    async getLlmBudgetSummary() {
      return {};
    },
    async getSignalCandidateResidualSummary() {
      return {};
    },
  };
  const pool = {
    async query() {
      return { rows: [] };
    },
  };

  const recommendation = (await executeMcpTool(
    {
      sdk: sdk as never,
      pool,
      token: WRITE_TEMPLATES_TOKEN,
    },
    "operator.tuning.recommend",
    {
      domain: "selection",
      objective: "increase_recall",
      residualBucket: "semantic_rejected/no_system_match",
      signalVisibility: "hidden_intent",
      evidenceLaneType: "hidden_intent_lane",
    }
  )) as Record<string, unknown>;

  const serialized = JSON.stringify(recommendation);
  assert.equal(recommendation.flowMode, "diagnostic");
  assert.match(serialized, /"flowRoute"/);
  assert.match(serialized, /"mustRead"/);
  assert.match(serialized, /"nextToolCalls"/);
  assert.equal(recommendation.changeIntent, "selection_tuning");
  assert.equal(recommendation.tuningLayer, "semantic_match");
  assert.equal(recommendation.signalVisibility, "hidden_intent");
  assert.equal(recommendation.evidenceLaneType, "hidden_intent_lane");
  assert.equal(recommendation.hardGatePolicy, "forbidden_by_default");
  assert.equal(recommendation.mandatoryMarkerProofRequired, true);
  assert.match(serialized, /intentProofRequired/);
  assert.match(serialized, /evidenceLaneGuidance/);
  assert.match(serialized, /candidateSignals/);
  assert.match(serialized, /candidateSignalsHitRate/);
  assert.match(serialized, /must_do_next/);
  assert.match(serialized, /allowed_after/);
  assert.match(serialized, /do_not_do_yet/);
  assert.match(serialized, /blocked_until/);
  assert.match(serialized, /Do not add broad must-have terms/);
  assert.match(serialized, /short_tokens_required as an OR keyword gate/);
  assert.match(serialized, /candidate_positive_signals/);
  assert.match(serialized, /candidate_negative_signals/);
  assert.match(serialized, /near-miss negative/);
  assert.match(serialized, /maintenance\.reindex\.request/);
  assert.match(serialized, /operator\.report\.verify/);
  assert.doesNotMatch(serialized, /Broaden positive signals or lower strictness/);
});

test("MCP operator tuning recommend supports planned change flow without emergency diagnosis", async () => {
  const sdk = {
    async getDashboardSummary() {
      return {};
    },
    async listDiscoveryVNextRecords() {
      return { items: [] };
    },
    async getLlmBudgetSummary() {
      return {};
    },
    async getSignalCandidateResidualSummary() {
      return {};
    },
  };
  const pool = {
    async query() {
      return { rows: [] };
    },
  };

  const recommendation = (await executeMcpTool(
    {
      sdk: sdk as never,
      pool,
      token: WRITE_TEMPLATES_TOKEN,
    },
    "operator.tuning.recommend",
    {
      domain: "selection",
      objective: "increase_precision",
      operationMode: "planned_change",
      changeIntent: "selection_tuning",
      tuningLayer: "technical_filter",
      updateRisk: "medium",
      affectedScope: ["interest:rare-operational-signal"],
    }
  )) as Record<string, unknown>;

  const serialized = JSON.stringify(recommendation);
  assert.equal(recommendation.flowMode, "planned_change");
  assert.equal(recommendation.changeIntent, "selection_tuning");
  assert.equal(recommendation.tuningLayer, "technical_filter");
  assert.equal(recommendation.updateRisk, "medium");
  assert.match(serialized, /one scoped staged write/i);
  assert.match(serialized, /operator\.selection\.dashboard/);
  assert.match(serialized, /bounded maintenance\.reindex\.request/);
  assert.match(serialized, /technical_filter tuning must prove candidate impact/);
  assert.match(serialized, /sample replay or source probe/i);
  assert.match(serialized, /mutation response as verified effect/i);
});

test("MCP operator tuning recommend supports expert override proof guardrails", async () => {
  const sdk = {
    async getDashboardSummary() {
      return {};
    },
    async listDiscoveryVNextRecords() {
      return { items: [] };
    },
    async getLlmBudgetSummary() {
      return {};
    },
    async getSignalCandidateResidualSummary() {
      return {};
    },
  };
  const pool = {
    async query() {
      return { rows: [] };
    },
  };

  const blocked = (await executeMcpTool(
    {
      sdk: sdk as never,
      pool,
      token: WRITE_TEMPLATES_TOKEN,
    },
    "operator.tuning.recommend",
    {
      domain: "selection",
      objective: "increase_recall",
      operationMode: "expert_override",
      changeIntent: "config_update",
      affectedScope: ["interest:known-operator-config"],
    }
  )) as Record<string, unknown>;

  assert.equal(blocked.flowMode, "expert_override");
  assert.equal(blocked.operator_override_allowed, false);
  assert.equal(blocked.proofStatus, "blocked");
  assert.match(JSON.stringify(blocked.blocked_until), /operatorOverrideReason/);

  const allowed = (await executeMcpTool(
    {
      sdk: sdk as never,
      pool,
      token: WRITE_TEMPLATES_TOKEN,
    },
    "operator.tuning.recommend",
    {
      domain: "selection",
      objective: "increase_recall",
      operationMode: "expert_override",
      changeIntent: "config_update",
      operatorOverrideReason: "operator has current external evidence and wants one bounded config change",
      affectedScope: ["interest:known-operator-config"],
    }
  )) as Record<string, unknown>;

  const serialized = JSON.stringify(allowed);
  assert.equal(allowed.operator_override_allowed, true);
  assert.match(serialized, /Read back affected entities immediately/);
  assert.match(serialized, /cannot skip MCP read-back or report verification/);
  assert.match(serialized, /proofRequired/);
  assert.match(serialized, /intentProofRequired/);
  assert.match(serialized, /unbounded mass edits/);
});

test("MCP operator tuning recommend supports LLM and cleanup intents", async () => {
  const sdk = {
    async getDashboardSummary() {
      return {};
    },
    async listDiscoveryVNextRecords() {
      return { items: [] };
    },
    async getLlmBudgetSummary() {
      return {};
    },
    async getSignalCandidateResidualSummary() {
      return {};
    },
  };
  const pool = {
    async query() {
      return { rows: [] };
    },
  };

  const llm = (await executeMcpTool(
    {
      sdk: sdk as never,
      pool,
      token: WRITE_TEMPLATES_TOKEN,
    },
    "operator.tuning.recommend",
    {
      domain: "llm_budget",
      objective: "reduce_cost",
      operationMode: "planned_change",
      changeIntent: "llm_tuning",
      tuningLayer: "llm_provider",
    }
  )) as Record<string, unknown>;

  const llmSerialized = JSON.stringify(llm);
  assert.equal(llm.changeIntent, "llm_tuning");
  assert.equal(llm.tuningLayer, "llm_provider");
  assert.match(llmSerialized, /provider endpoint\/model errors/);
  assert.match(llmSerialized, /Zero LLM spend is not proof that LLM is broken/);

  const cleanup = (await executeMcpTool(
    {
      sdk: sdk as never,
      pool,
      token: WRITE_TEMPLATES_TOKEN,
    },
    "operator.tuning.recommend",
    {
      domain: "cleanup",
      operationMode: "cleanup",
      cleanupIntent: "test_artifacts",
      updateRisk: "low",
    }
  )) as Record<string, unknown>;

  const cleanupSerialized = JSON.stringify(cleanup);
  assert.equal(cleanup.flowMode, "cleanup");
  assert.equal(cleanup.cleanupIntent, "test_artifacts");
  assert.match(cleanupSerialized, /archive or deactivate before deleting/);
  assert.match(cleanupSerialized, /confirm=true/);
  assert.match(cleanupSerialized, /cleanup report verification/);
});

test("MCP operator intent fields reject unsupported enum values", async () => {
  const sdk = {
    async getDashboardSummary() {
      return {};
    },
    async listDiscoveryVNextRecords() {
      return { items: [] };
    },
    async getLlmBudgetSummary() {
      return {};
    },
    async getSignalCandidateResidualSummary() {
      return {};
    },
  };
  const pool = {
    async query() {
      return { rows: [] };
    },
  };

  await assert.rejects(
    () =>
      executeMcpTool(
        {
          sdk: sdk as never,
          pool,
          token: WRITE_TEMPLATES_TOKEN,
        },
        "operator.tuning.recommend",
        {
          domain: "selection",
          changeIntent: "domain_specific_shortcut",
        }
      ),
    (error) => error instanceof JsonRpcError && error.code === -32602
  );

  await assert.rejects(
    () =>
      executeMcpTool(
        {
          sdk: sdk as never,
          pool,
          token: WRITE_TEMPLATES_TOKEN,
        },
        "operator.report.verify",
        {
          reportKind: "selection",
          entityIds: {},
          tuningLayer: "magic_layer",
        }
      ),
    (error) => error instanceof JsonRpcError && error.code === -32602
  );

  await assert.rejects(
    () =>
      executeMcpTool(
        {
          sdk: sdk as never,
          pool,
          token: WRITE_TEMPLATES_TOKEN,
        },
        "operator.tuning.recommend",
        {
          domain: "selection",
          signalVisibility: "domain_specific_visibility",
        }
      ),
    (error) => error instanceof JsonRpcError && error.code === -32602
  );

  await assert.rejects(
    () =>
      executeMcpTool(
        {
          sdk: sdk as never,
          pool,
          token: WRITE_TEMPLATES_TOKEN,
        },
        "operator.report.verify",
        {
          reportKind: "selection",
          entityIds: {},
          hardGatePolicy: "always_allow_keywords",
        }
      ),
    (error) => error instanceof JsonRpcError && error.code === -32602
  );
});

test("MCP operator flow route returns strict routes without backend queries", async () => {
  const pool = {
    async query() {
      throw new Error("operator.flow.route should not query the backend");
    },
  };
  const context = {
    sdk: {} as never,
    pool,
    token: WRITE_TEMPLATES_TOKEN,
  };

  const selectionRoute = (await executeMcpTool(context, "operator.flow.route", {
    sessionGoal: "diagnose 0 selected hidden signals",
    domain: "selection",
    objective: "increase_recall",
    symptoms: ["zero_selected", "semantic_rejected"],
    residualBucket: "semantic_rejected/no_system_match",
    signalVisibility: "hidden_intent",
    evidenceLaneType: "hidden_intent_lane",
  })) as Record<string, unknown>;
  const selectionSerialized = JSON.stringify(selectionRoute);
  assert.equal(selectionRoute.flowMode, "diagnostic");
  assert.equal(selectionRoute.changeIntent, "selection_tuning");
  assert.equal(selectionRoute.tuningLayer, "semantic_match");
  assert.equal(selectionRoute.signalVisibility, "hidden_intent");
  assert.equal(selectionRoute.hardGatePolicy, "forbidden_by_default");
  assert.equal(selectionRoute.mandatoryMarkerProofRequired, true);
  assert.equal(selectionRoute.mutationPolicy, "read-only advisory route; writes require existing scoped MCP/admin tools and read-back proof");
  assert.match(selectionSerialized, /operator\.selection\.dashboard/);
  assert.match(selectionSerialized, /signal_candidates\.residuals\.summary/);
  assert.match(selectionSerialized, /system_interests\.compile_status\.list/);
  assert.match(selectionSerialized, /maintenance\.reindex\.request/);
  assert.match(selectionSerialized, /operator\.report\.verify/);
  assert.match(selectionSerialized, /Do not add broad must-have terms/);
  assert.match(selectionSerialized, /short_tokens_required as an OR keyword gate/);
  assert.match(selectionSerialized, /Do not rewrite LLM templates/);
  assert.match(selectionSerialized, /Do not add more RSS\/source volume/);

  const mixedSelectionRoute = (await executeMcpTool(context, "operator.flow.route", {
    sessionGoal: "recover mixed signal recall without unsafe hard gates",
    domain: "selection",
    objective: "increase_recall",
    symptoms: ["zero_selected", "technical_filter_rejected"],
    residualBucket: "0 selected technical_filter_rejected must_have hard_gate",
    signalVisibility: "mixed",
  })) as Record<string, unknown>;
  const mixedSerialized = JSON.stringify(mixedSelectionRoute);
  assert.equal(mixedSelectionRoute.flowMode, "diagnostic");
  assert.equal(mixedSelectionRoute.signalVisibility, "mixed");
  assert.equal(mixedSelectionRoute.hardGatePolicy, "forbidden_by_default");
  assert.equal(mixedSelectionRoute.mandatoryMarkerProofRequired, true);
  assert.match(mixedSerialized, /mandatory-marker proof/i);
  assert.match(mixedSerialized, /Do not add broad must-have terms/);

  const llmRoute = (await executeMcpTool(context, "operator.flow.route", {
    sessionGoal: "0 LLM reviews after replay",
    symptoms: ["zero_llm_reviews"],
  })) as Record<string, unknown>;
  const llmSerialized = JSON.stringify(llmRoute);
  assert.equal(llmRoute.domain, "llm_budget");
  assert.equal(llmRoute.flowMode, "diagnostic");
  assert.equal(llmRoute.changeIntent, "llm_tuning");
  assert.equal(llmRoute.tuningLayer, "llm_provider");
  assert.match(llmSerialized, /no_reviewable_path/);
  assert.match(llmSerialized, /provider_endpoint_error/);
  assert.match(llmSerialized, /Do not call LLM broken/);
  assert.match(llmSerialized, /llm_budget\.summary/);

  const sourceRoute = (await executeMcpTool(context, "operator.flow.route", {
    sessionGoal: "repair invalid RSS source",
    symptoms: ["source_failure"],
  })) as Record<string, unknown>;
  const sourceSerialized = JSON.stringify(sourceRoute);
  assert.equal(sourceRoute.domain, "channels");
  assert.equal(sourceRoute.flowMode, "source_onboarding");
  assert.equal(sourceRoute.changeIntent, "source_tuning");
  assert.equal(sourceRoute.tuningLayer, "acquisition");
  assert.match(sourceSerialized, /channels\.bottlenecks\.summary/);
  assert.match(sourceSerialized, /channels\.alternatives\.plan/);
  assert.match(sourceSerialized, /Source acquisition proof is not selected-signal proof/);

  const plannedRoute = (await executeMcpTool(context, "operator.flow.route", {
    sessionGoal: "planned system interest update",
    domain: "selection",
    symptoms: ["planned_update", "config_write"],
    operationMode: "planned_change",
    changeIntent: "config_update",
    affectedScope: ["interest:known"],
  })) as Record<string, unknown>;
  const plannedSerialized = JSON.stringify(plannedRoute);
  assert.equal(plannedRoute.flowMode, "planned_change");
  assert.equal(plannedRoute.changeIntent, "config_update");
  assert.match(plannedSerialized, /one scoped staged write/i);
  assert.match(plannedSerialized, /Mutation responses are not verified effect/);
  assert.match(plannedSerialized, /Do not run emergency zero-selected diagnosis/);

  const cleanupRoute = (await executeMcpTool(context, "operator.flow.route", {
    symptoms: ["cleanup"],
    cleanupIntent: "test_artifacts",
  })) as Record<string, unknown>;
  const cleanupSerialized = JSON.stringify(cleanupRoute);
  assert.equal(cleanupRoute.flowMode, "cleanup");
  assert.equal(cleanupRoute.cleanupIntent, "test_artifacts");
  assert.match(cleanupSerialized, /archive\/deactivate/);
  assert.match(cleanupSerialized, /confirm=true/);

  const blockedOverride = (await executeMcpTool(context, "operator.flow.route", {
    operationMode: "expert_override",
    changeIntent: "config_update",
    affectedScope: ["interest:known"],
  })) as Record<string, unknown>;
  assert.equal(blockedOverride.flowMode, "expert_override");
  assert.equal(blockedOverride.operator_override_allowed, false);
  assert.equal(blockedOverride.proofStatus, "blocked");
  assert.match(JSON.stringify(blockedOverride), /operatorOverrideReason/);

  const allowedOverride = (await executeMcpTool(context, "operator.flow.route", {
    operationMode: "expert_override",
    operatorOverrideReason: "operator has fresh external evidence and chooses one bounded config update",
    affectedScope: ["interest:known"],
    changeIntent: "config_update",
  })) as Record<string, unknown>;
  assert.equal(allowedOverride.operator_override_allowed, true);
  assert.match(JSON.stringify(allowedOverride), /cannot skip MCP read-back or report verification/);
});

test("MCP operator flow route rejects unsupported enum values at schema boundary", async () => {
  await assert.rejects(
    () =>
      executeMcpTool(
        {
          sdk: {} as never,
          pool: {},
          token: WRITE_TEMPLATES_TOKEN,
        },
        "operator.flow.route",
        {
          symptoms: ["domain_specific_shortcut"],
        }
      ),
    (error) => error instanceof JsonRpcError && error.code === -32602
  );
});

test("MCP operating intelligence facade preserves guide shapes and tuning route block", async () => {
  const operatingModel = getOperatingModelGuide();
  assert.equal(operatingModel.model, "observe -> diagnose -> recommend -> guarded change -> verify effect -> monitor");
  assert.equal(operatingModel.domains.selection.domain, "selection");
  assert.match(JSON.stringify(operatingModel.operatingRules), /Tuning recommendations/);

  const operatingResource = resolveMcpResource("signalops://guide/operating-model");
  assert.deepEqual(await operatingResource.read({} as any), operatingModel);

  const selectionDiagnostics = getDiagnosticsGuide("selection") as Record<string, unknown>;
  assert.equal(selectionDiagnostics.domain, "selection");
  assert.match(JSON.stringify(selectionDiagnostics), /operator\.system\.health/);
  assert.match(JSON.stringify(selectionDiagnostics), /operator\.tuning\.recommend/);

  const unknownDiagnostics = getDiagnosticsGuide("unknown-domain") as Record<string, unknown>;
  assert.equal(unknownDiagnostics.domain, "unknown-domain");
  assert.equal(unknownDiagnostics.error, "Unknown operating domain.");
  assert.ok(Array.isArray(unknownDiagnostics.knownDomains));

  const selectionTuning = getTuningGuide("selection") as Record<string, unknown>;
  assert.equal(selectionTuning.domain, "selection");
  assert.match(JSON.stringify(selectionTuning), /zeroSelectedCalibration/);
  assert.match(JSON.stringify(selectionTuning), /semantic_rejected\/no_system_match/);

  const sdk = {
    async getDashboardSummary() {
      return {};
    },
    async listDiscoveryVNextRecords() {
      return { items: [] };
    },
    async getLlmBudgetSummary() {
      return {};
    },
    async getSignalCandidateResidualSummary() {
      return {};
    },
  };
  const pool = {
    async query() {
      return { rows: [] };
    },
  };
  const recommendation = (await executeMcpTool(
    {
      sdk: sdk as never,
      pool,
      token: WRITE_TEMPLATES_TOKEN,
    },
    "operator.tuning.recommend",
    {
      domain: "selection",
      objective: "increase_recall",
      residualBucket: "semantic_rejected/no_system_match",
      signalVisibility: "hidden_intent",
      evidenceLaneType: "hidden_intent_lane",
    }
  )) as Record<string, unknown>;

  const flowRoute = recommendation.flowRoute as Record<string, unknown>;
  assert.equal(flowRoute.domain, "selection");
  assert.equal(flowRoute.flowMode, "diagnostic");
  assert.equal(flowRoute.changeIntent, "selection_tuning");
  assert.equal(flowRoute.tuningLayer, "semantic_match");
  assert.equal(flowRoute.mandatoryMarkerProofRequired, true);
  assert.match(JSON.stringify(flowRoute), /operator\.report\.verify/);
});

test("MCP operator tuning recommend prioritizes technical-filter repair before semantic tuning", async () => {
  const sdk = {
    async getDashboardSummary() {
      return {};
    },
    async listDiscoveryVNextRecords() {
      return { items: [] };
    },
    async getLlmBudgetSummary() {
      return {};
    },
    async getSignalCandidateResidualSummary() {
      return {};
    },
  };
  const pool = {
    async query() {
      return { rows: [] };
    },
  };

  const recommendation = (await executeMcpTool(
    {
      sdk: sdk as never,
      pool,
      token: WRITE_TEMPLATES_TOKEN,
    },
    "operator.tuning.recommend",
    {
      domain: "selection",
      objective: "increase_recall",
      residualBucket: "technical_filter_rejected/wrapper_directory_noise/time_window/must_not",
    }
  )) as Record<string, unknown>;

  const serialized = JSON.stringify(recommendation);
  assert.match(serialized, /filterReasonBreakdown/);
  assert.match(serialized, /distinctCandidateCount/);
  assert.match(serialized, /10-30 representative rejected candidates/);
  assert.match(serialized, /short_tokens_required is an extracted-token requirement/);
  assert.match(serialized, /Do not globally remove wrapper_directory_noise/);
  assert.match(serialized, /temporary bounded experiment/);
  assert.match(serialized, /selection-hard-filter-calibration/);
  assert.match(serialized, /operator\.selection\.dashboard/);
  assert.match(serialized, /must_do_next/);
  assert.match(serialized, /candidate_positive_signals/);
  assert.match(serialized, /read-back/);
  assert.doesNotMatch(serialized, /disable wrapper_directory_noise as first step/i);
  assert.doesNotMatch(serialized, /positive-term expansion/);
  assert.doesNotMatch(serialized, /"candidateSignals":/);
});

test("MCP LLM budget report classifies provider 404 as endpoint error", async () => {
  const sdk = {
    async getDashboardSummary() {
      return {};
    },
    async listDiscoveryVNextRecords() {
      return { items: [] };
    },
    async getLlmBudgetSummary() {
      return {};
    },
    async getSignalCandidateResidualSummary() {
      return {};
    },
  };
  const pool = {
    async query(sql: string) {
      if (/from llm_review_log/i.test(sql)) {
        return {
          rows: [{ errorText: "HTTP Error 404: Not Found", count: 2, lastSeenAt: "2026-06-06T08:00:00.000Z" }],
        };
      }
      return { rows: [] };
    },
  };

  const report = (await executeMcpTool(
    {
      sdk: sdk as never,
      pool,
      token: WRITE_TEMPLATES_TOKEN,
    },
    "operator.report.verify",
    { reportKind: "llm_budget", entityIds: {}, includeSamples: true }
  )) as Record<string, unknown>;

  const serialized = JSON.stringify(report);
  assert.match(serialized, /provider_endpoint_error/);
  assert.match(serialized, /provider404/);
  assert.match(serialized, /preflight\/provider failures/);
});

test("MCP selection reindex planner builds bounded replay buckets and request templates", async () => {
  const dummySdk = createSignalOpsSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async () => {
      throw new Error("operator.selection.reindex_plan should use the DB-backed pool");
    }) as typeof fetch,
  });
  const pool = createFakeSelectionReindexPlanPool();

  const plan = (await executeMcpTool(
    {
      sdk: dummySdk,
      pool,
      token: WRITE_TEMPLATES_TOKEN,
    },
    "operator.selection.reindex_plan",
    { chunkSize: 2, maxDocIds: 10, reason: "unit-test replay", includeSamples: true }
  )) as Record<string, unknown>;

  assert.equal(plan.readOnly, true);
  assert.equal(plan.chunkSize, 2);
  assert.match(JSON.stringify(plan), /weak_selected/);
  assert.match(JSON.stringify(plan), /buyer_hold/);
  assert.match(JSON.stringify(plan), /context_only/);
  assert.match(JSON.stringify(plan), /maintenance\.reindex\.request/);
  assert.match(JSON.stringify(plan), /retroNotifications/);
  assert.match(JSON.stringify(plan), /skip/);
  assert.match(JSON.stringify(plan), /cccccccc-1111-4111-8111-111111111111/);
  assert.match(JSON.stringify(plan), /dddddddd-1111-4111-8111-111111111111/);
});

test("MCP operator funnel audit rejects unknown arguments at schema boundary", async () => {
  await assert.rejects(
    () =>
      executeMcpTool(
        {
          sdk: createSignalOpsSdk({ baseUrl: "http://api.example.test" }),
          pool: createFakeFunnelAuditPool(),
          token: WRITE_TEMPLATES_TOKEN,
        },
        "operator.funnel.audit",
        {
          objective: "calibrate",
          referenceEvidenceKind: "reference_text",
          unknownField: true,
        }
      ),
    (error) =>
      error instanceof JsonRpcError &&
      error.code === -32602 &&
      /unknownField|additional/i.test(error.message)
  );
});

test("MCP channel active-state tool avoids full provider payload guessing", async () => {
  const dummySdk = createSignalOpsSdk({
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

test("MCP channels.create rejects supplied channelId before backend calls", async () => {
  const pool = {
    async query(sql: string) {
      throw new Error(`channels.create should reject before DB calls: ${sql}`);
    },
  };

  await assert.rejects(
    () =>
      executeMcpTool(
        {
          sdk: createSignalOpsSdk({ baseUrl: "http://api.example.test" }),
          pool,
          token: WRITE_CHANNELS_TOKEN,
        },
        "channels.create",
        {
          payload: {
            providerType: "rss",
            channelId: "11111111-1111-4111-8111-111111111111",
            name: "Existing RSS by mistake",
            fetchUrl: "https://example.com/feed.xml",
          },
        }
      ),
    (error) =>
      error instanceof JsonRpcError &&
      error.code === -32602 &&
      /omit it when creating a channel/i.test(error.message) &&
      JSON.stringify(error).includes("payload.channelId")
  );
});

test("MCP channels.update requires an existing channelId", async () => {
  const pool = {
    async query(sql: string) {
      throw new Error(`channels.update should reject before DB calls: ${sql}`);
    },
  };

  await assert.rejects(
    () =>
      executeMcpTool(
        {
          sdk: createSignalOpsSdk({ baseUrl: "http://api.example.test" }),
          pool,
          token: WRITE_CHANNELS_TOKEN,
        },
        "channels.update",
        {
          payload: {
            providerType: "rss",
            name: "Missing update id",
            fetchUrl: "https://example.com/feed.xml",
          },
        }
      ),
    (error) =>
      error instanceof JsonRpcError &&
      error.code === -32602 &&
      /requires an existing channelId/i.test(error.message) &&
      JSON.stringify(error).includes("payload.channelId")
  );
});

test("MCP Discovery vNext artifact lists validate filters before API calls", async () => {
  const requests: string[] = [];
  const sdk = createSignalOpsSdk({
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
    "discovery.artifacts.list",
    {
      artifactType: "RoutingDecision",
      status: "validated",
      pageSize: 50,
    }
  );

  assert.match(
    requests[0] ?? "",
    /\/maintenance\/discovery\/artifacts\?status=validated&artifactType=RoutingDecision&pageSize=50/
  );

  await assert.rejects(
    () =>
      executeMcpTool(
        {
          sdk,
          pool: createFakeMcpPool(),
          token: WRITE_DISCOVERY_TOKEN,
        },
        "discovery.artifacts.list",
        {
          unexpected: true,
          pageSize: 50,
        }
      ),
    (error) => error instanceof JsonRpcError && error.code === -32602
  );
  assert.equal(requests.length, 1, "invalid vNext list args should fail before backend fetch");
});

test("MCP Discovery vNext write tools use strict schemas and vNext endpoints", async () => {
  const requests: Array<{ method: string | undefined; url: string; body?: string }> = [];
  const sdk = createSignalOpsSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async (input, init) => {
      requests.push({
        method: init?.method,
        url: String(input),
        body: typeof init?.body === "string" ? init.body : undefined,
      });
      return new Response(
        JSON.stringify({
          ok: true,
          vnext_run_id: "run-1",
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

  await executeMcpTool(
    {
      sdk,
      pool: createFakeMcpPool(),
      token: WRITE_DISCOVERY_TOKEN,
    },
    "discovery.runs.create",
    {
      runKind: "full",
      triggerKind: "mcp",
      request: {},
      budget: {},
    }
  );
  await executeMcpTool(
    {
      sdk,
      pool: createFakeMcpPool(),
      token: WRITE_DISCOVERY_TOKEN,
    },
    "discovery.artifacts.create",
    {
      artifactType: "DiscoveryBrief",
      payload: {
        briefId: "brief-1",
        domainNeutral: true,
        searchIntents: [],
        constraints: {},
      },
      vnextRunId: "run-1",
    }
  );

  assert.match(requests[0]?.url ?? "", /\/maintenance\/discovery\/runs$/);
  assert.match(requests[1]?.url ?? "", /\/maintenance\/discovery\/artifacts$/);
  assert.match(requests[0]?.body ?? "", /"createdBy":"550e8400-e29b-41d4-a716-446655440000"/);
  await assert.rejects(
    () =>
      executeMcpTool(
        {
          sdk,
          pool: createFakeMcpPool(),
          token: WRITE_DISCOVERY_TOKEN,
        },
        "discovery.runs.create",
        {
          runKind: "old_target_run",
        }
      ),
    (error) => error instanceof JsonRpcError && error.code === -32602
  );
  assert.equal(requests.length, 2, "invalid vNext write payloads should fail before backend fetch");
});

test("MCP Discovery vNext read accepts artifact ids and rejects missing ids", async () => {
  const requests: string[] = [];
  const sdk = createSignalOpsSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async (input) => {
      requests.push(String(input));
      return new Response(JSON.stringify({ artifactId: "f3dbf7b8-72ad-41e9-94d5-7d113b28ca13" }), {
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
    "discovery.artifacts.read",
    {
      recordId: "f3dbf7b8-72ad-41e9-94d5-7d113b28ca13",
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
        "discovery.artifacts.read",
        {}
      ),
    (error) =>
      error instanceof JsonRpcError &&
      error.code === -32602
);
});

test("MCP Discovery vNext read tools expose artifact, inventory and run surfaces", async () => {
  const requests: string[] = [];
  const sdk = createSignalOpsSdk({
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
    "discovery.artifacts.read",
    { recordId: "9b88d3e8-7fc9-4ef2-a0a6-0cd591de6a25" }
  );
  await executeMcpTool(
    { sdk, pool, token: WRITE_DISCOVERY_TOKEN },
    "discovery.source_inventory.read",
    { recordId: "8a88d3e8-7fc9-4ef2-a0a6-0cd591de6a25" }
  );
  await executeMcpTool(
    { sdk, pool, token: WRITE_DISCOVERY_TOKEN },
    "discovery.runs.read",
    { recordId: "d0e6f11f-1111-4111-8111-111111111111" }
  );

  assert.match(requests.join("\n"), /9b88d3e8-7fc9-4ef2-a0a6-0cd591de6a25/);
  assert.match(requests.join("\n"), /8a88d3e8-7fc9-4ef2-a0a6-0cd591de6a25/);
  assert.match(requests.join("\n"), /d0e6f11f-1111-4111-8111-111111111111/);
});

test("MCP sequence and content read tools accept report aliases and UUID prefixes", async () => {
  const requests: string[] = [];
  const sdk = createSignalOpsSdk({
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
    "signal_candidates.explain",
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
  assert.match(requestLog, /signal_candidate%3Aea25c952-1111-4111-8111-111111111111/);
  assert.match(requestLog, /eeeeeeee-1111-4111-8111-111111111111/);
});

test("MCP sequence write tools reject malformed UUID ids before backend fetch", async () => {
  const requests: string[] = [];
  const sdk = createSignalOpsSdk({
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
  const sdk = createSignalOpsSdk({
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
      toolName: "discovery.runs.create",
      token: WRITE_DISCOVERY_TOKEN,
      args: { runKind: "legacy_target_run" },
      expectedPath: "runKind",
      expectedMessage:
        'MCP tool "discovery.runs.create" arguments failed schema validation: runKind contains an unsupported value.',
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
      toolName: "system_interests.update",
      token: WRITE_TEMPLATES_TOKEN,
      args: {
        payload: {
          interestTemplateId: "11111111-1111-4111-8111-111111111111",
          name: "Nope",
          positive_texts: "representative signal evidence",
          short_tokens_required: ["vendor needs to provide"],
        },
      },
      expectedPath: "payload.short_tokens_required[0]",
      expectedMessage:
        "payload.short_tokens_required[0] must be a single extracted token, not a phrase.",
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
        error.message.includes(
          invalidCall.expectedMessage ?? `${invalidCall.expectedPath} must be a full UUID.`
        )
    );
  }

  assert.equal(requests.length, 0, "invalid adjacent write ids should fail before backend fetch");
  assert.equal(pool.calls.length, 0, "invalid adjacent write ids should fail before DB work");
});

test("MCP system interest writes return persisted profile read-back verification", async () => {
  const pool = createFakeSystemInterestWritePool();
  const sdk = createSignalOpsSdk({ baseUrl: "http://api.example.test" });

  const result = (await executeMcpTool(
    {
      sdk,
      pool: pool as never,
      token: WRITE_TEMPLATES_TOKEN,
    },
    "system_interests.create",
    {
      payload: {
        name: "Strict interest",
        positive_texts: ["buyer asks for implementation support"],
        allowed_content_kinds: ["editorial", "listing"],
        candidate_positive_signals: ["buyer_need: needs external implementation"],
        candidate_negative_signals: ["vendor_marketing: case study"],
        selection_profile_llm_review_mode: "always",
      },
    }
  )) as Record<string, unknown>;

  const verification = result.readBackVerification as Record<string, unknown>;
  assert.equal(verification.status, "verified");
  assert.equal(verification.selectionProfileLlmReviewMode, "always");
  assert.equal(verification.candidatePositiveSignalGroupCount, 1);
  assert.equal(verification.candidateNegativeSignalGroupCount, 1);
  assert.deepEqual(verification.allowedContentKinds, ["editorial", "listing"]);
  assert.match(JSON.stringify(verification.warnings), /one cue/);
  assert.match(JSON.stringify(verification.candidateSignalsQualityWarnings), /buyer_need/);
  assert.match(JSON.stringify(result), /system_interests\.compile_status\.list/);
  assert.equal(pool.state.released, true);
});

test("MCP system interest writes reject camelCase and nested profile aliases", async () => {
  const sdk = createSignalOpsSdk({ baseUrl: "http://api.example.test" });
  const pool = createFakeMcpPool();
  const cases = [
    {
      field: "candidateSignals",
      payload: {
        name: "Bad interest",
        positive_texts: ["representative signal"],
        candidateSignals: { positiveGroups: [{ cues: ["buyer ask"] }] },
      },
      canonical: "candidate_positive_signals",
    },
    {
      field: "selectionProfile",
      payload: {
        name: "Bad interest",
        positive_texts: ["representative signal"],
        selectionProfile: { llmReviewMode: "always" },
      },
      canonical: "selection_profile_llm_review_mode",
    },
    {
      field: "allowedContentKinds",
      payload: {
        name: "Bad interest",
        positive_texts: ["representative signal"],
        allowedContentKinds: ["editorial"],
      },
      canonical: "allowed_content_kinds",
    },
    {
      field: "llmReviewMode",
      payload: {
        name: "Bad interest",
        positive_texts: ["representative signal"],
        llmReviewMode: "always",
      },
      canonical: "selection_profile_llm_review_mode",
    },
  ];

  for (const item of cases) {
    await assert.rejects(
      () =>
        executeMcpTool(
          {
            sdk,
            pool,
            token: WRITE_TEMPLATES_TOKEN,
          },
          "system_interests.create",
          { payload: item.payload }
        ),
      (error) =>
        error instanceof JsonRpcError &&
        error.code === -32602 &&
        (error.data as Record<string, unknown>).path === `payload.${item.field}` &&
        JSON.stringify(error.data).includes(item.canonical)
    );
  }
});

test("MCP tool execution enforces scope and destructive confirmation before handler work", async () => {
  const dummySdk = createSignalOpsSdk({
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
  const dummySdk = createSignalOpsSdk({
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

test("MCP Discovery vNext route, policy, replay and rollback use vNext endpoints", async () => {
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  const sdk = createSignalOpsSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async (input, init) => {
      requests.push({
        url: String(input),
        body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
      });
      return new Response(JSON.stringify({ ok: true, policy_id: "policy-1" }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    }) as typeof fetch,
  });

  await executeMcpTool(
    { sdk, pool: createFakeMcpPool(), token: WRITE_DISCOVERY_TOKEN },
    "discovery.route.preview",
    {
      sourceUnderstanding: {
        sourceUrl: "https://example.com/feed.xml",
        sourceName: "Example feed",
        capabilities: { feed: true },
        observability: { staticFetch: true },
        risk: { level: "low" },
        yieldIndependent: true,
      },
      providerType: "rss",
      accessPattern: "public",
      policy: { yieldIndependent: true },
    }
  );
  await executeMcpTool(
    { sdk, pool: createFakeMcpPool(), token: WRITE_DISCOVERY_TOKEN },
    "discovery.policies.activate",
    {
      policyName: "discovery-routing",
      policyVersion: "vnext-test",
      policyType: "routing",
      definition: { yieldIndependent: true },
    }
  );
  await executeMcpTool(
    { sdk, pool: createFakeMcpPool(), token: WRITE_DISCOVERY_TOKEN },
    "discovery.replay.start",
    {
      replayKind: "full_non_live",
      input: {},
      dryRun: true,
    }
  );
  await executeMcpTool(
    { sdk, pool: createFakeMcpPool(), token: WRITE_DISCOVERY_TOKEN },
    "discovery.rollback.prepare",
    {
      sourceInventoryId: "source-inventory-1",
      reason: "bad source handoff",
    }
  );
  await executeMcpTool(
    { sdk, pool: createFakeMcpPool(), token: DESTRUCTIVE_DISCOVERY_TOKEN },
    "discovery.rollback.apply",
    {
      rollbackGroupId: "rollback-group-1",
      confirm: true,
    }
  );

  assert.match(requests[0]?.url ?? "", /\/maintenance\/discovery\/route\/preview$/);
  assert.match(requests[1]?.url ?? "", /\/maintenance\/discovery\/policies\/activate$/);
  assert.match(requests[2]?.url ?? "", /\/maintenance\/discovery\/replay$/);
  assert.match(requests[3]?.url ?? "", /\/maintenance\/discovery\/rollback\/prepare$/);
  assert.match(requests[4]?.url ?? "", /\/maintenance\/discovery\/rollback\/apply$/);
  assert.equal(requests[1]?.body.createdBy, WRITE_DISCOVERY_TOKEN.issuedByUserId);

  await assert.rejects(
    () =>
      executeMcpTool(
        { sdk, pool: createFakeMcpPool(), token: WRITE_DISCOVERY_TOKEN },
        "discovery.rollback.apply",
        {
          rollbackGroupId: "rollback-group-1",
          confirm: false,
        }
      ),
    (error) => error instanceof JsonRpcError && error.code === -32004
  );
  assert.equal(requests.length, 5, "unconfirmed rollback must fail before backend fetch");
});

test("MCP source-bottleneck report verify uses the shared channel read model", async () => {
  const dummySdk = createSignalOpsSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async () => {
      throw new Error("operator.report.verify should use the DB-backed pool");
    }) as typeof fetch,
  });
  let queryCount = 0;
  const pool = {
    async query(sql: string) {
      queryCount += 1;
      assert.match(sql, /from source_channels sc/i);
      assert.doesNotMatch(sql, /limit\s+1000/i);
      return {
        rows: [
          {
            channelId: "channel-1",
            name: "Broken page-as-rss",
            providerType: "rss",
            fetchUrl: "https://example.com/news",
            isActive: true,
            pollIntervalSeconds: 300,
            effectivePollIntervalSeconds: 300,
            maxPollIntervalSeconds: 4800,
            nextDueAt: "2026-05-10T00:00:00.000Z",
            consecutiveFailures: 3,
            consecutiveNoChangePolls: 0,
            adaptiveReason: "hard_failure_repair_backoff",
            lastOutcomeKind: "hard_failure",
            lastHttpStatus: 200,
            lastErrorText: "HTML instead of feed",
            lastProviderMetrics: {},
            outcomeCounts24h: { hard_failure: 2 },
            outcomeCounts7d: { hard_failure: 3 },
            runCount24h: 2,
            failureCount24h: 2,
            fetchedItemCount24h: 0,
            newItemCount24h: 0,
            duplicateCount24h: 0,
            runCount7d: 3,
            failureCount7d: 3,
            fetchedItemCount7d: 0,
            newItemCount7d: 0,
            duplicateCount7d: 0,
            signalCandidateCount: 0,
            selectedRows: 0,
            selectedUniqueContent: 0,
            grayRows: 0,
            rejectedRows: 0,
            visibleSignalCandidates: 0,
            duplicateSignalCandidates: 0,
            webResourceCount: 0,
            projectedResourceCount: 0,
            resourceOnlyCount: 0,
            extractionFailedCount: 0,
            projectedSelectedRows: 0,
            projectedGrayRows: 0,
            projectedRejectedRows: 0,
          },
        ],
      };
    },
  };

  const result = await executeMcpTool(
    {
      sdk: dummySdk,
      pool,
      token: WRITE_DISCOVERY_TOKEN,
    },
    "operator.report.verify",
    {
      reportKind: "source_bottleneck",
      entityIds: {},
      operationMode: "source_onboarding",
      changeIntent: "source_tuning",
      tuningLayer: "acquisition",
      includeSamples: true,
    }
  );

  const serialized = JSON.stringify(result);
  assert.equal(queryCount, 2);
  assert.match(serialized, /provider_shape_mismatch|html_instead_of_feed/);
  assert.match(serialized, /technicalBottlenecks/);
  assert.match(serialized, /changeIntent.*source_tuning|source_tuning.*changeIntent/);
  assert.match(serialized, /Source acquisition proof is not selection proof/);
  assert.match(serialized, /intentProofRequired/);
});

test("MCP cleanup report verify exposes cleanup intent proof guardrails", async () => {
  const dummySdk = createSignalOpsSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async () => {
      throw new Error("cleanup report should use the DB-backed pool");
    }) as typeof fetch,
  });
  const pool = {
    async query(sql: string) {
      if (/from source_channels/i.test(sql)) {
        return {
          rows: [
            {
              activeChannels: 2,
              activeSystemInterests: 3,
              activeLlmTemplates: 1,
              activeDiscoveryRuns: 0,
              probationDiscoverySources: 0,
              openAdapterBacklogItems: 0,
              activeSequences: 1,
              activeMcpTokens: 1,
            },
          ],
        };
      }
      return {
        rows: [
          {
            kind: "sequence",
            id: "11111111-1111-4111-8111-111111111111",
            name: "Default Reindex",
            createdBy: "migration:default",
          },
        ],
      };
    },
  };

  const report = (await executeMcpTool(
    {
      sdk: dummySdk,
      pool,
      token: WRITE_TEMPLATES_TOKEN,
    },
    "operator.report.verify",
    {
      reportKind: "cleanup",
      entityIds: {},
      operationMode: "cleanup",
      cleanupIntent: "test_artifacts",
      updateRisk: "low",
      includeSamples: true,
    }
  )) as Record<string, unknown>;

  const serialized = JSON.stringify(report);
  assert.equal(report.flowMode, "cleanup");
  assert.equal(report.cleanupIntent, "test_artifacts");
  assert.match(serialized, /archive or deactivate before deleting/);
  assert.match(serialized, /confirm=true/);
  assert.match(serialized, /protectedObjects/);
  assert.match(serialized, /intentProofRequired/);
});

test("MCP channels.alternatives.start respects bounded candidates", async () => {
  const calls: Array<{ channelId: string; payload: Record<string, unknown> }> = [];
  const sdk = {
    async createDiscoveryVNextRun(payload: Record<string, unknown>) {
      const request = payload.request as Record<string, unknown>;
      calls.push({ channelId: String(request.channelId), payload });
      return { vnextRunId: String(request.channelId), status: "queued" };
    },
  };
  const pool = {
    async query(sql: string) {
      assert.match(sql, /from source_channels sc/i);
      return {
        rows: [
          {
            channelId: "11111111-1111-4111-8111-111111111111",
            name: "First bad RSS",
            providerType: "rss",
            fetchUrl: "https://first.example.com/news",
            lastResultKind: "hard_failure",
            lastErrorMessage: "HTML instead of feed",
            consecutiveFailures: 4,
          },
          {
            channelId: "22222222-2222-4222-8222-222222222222",
            name: "Second bad RSS",
            providerType: "rss",
            fetchUrl: "https://second.example.com/news",
            lastResultKind: "hard_failure",
            lastErrorMessage: "HTML instead of feed",
            consecutiveFailures: 4,
          },
        ],
      };
    },
  };

  const result = await executeMcpTool(
    {
      sdk: sdk as never,
      pool,
      token: WRITE_DISCOVERY_TOKEN,
    },
    "channels.alternatives.start",
    {
      targetId: "target-1",
      channelIds: [
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
      ],
      includeFeedProbe: false,
      maxCandidates: 1,
      maxSocialItems: 0,
    }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.channelId, "11111111-1111-4111-8111-111111111111");
  assert.equal((calls[0]?.payload.request as Record<string, unknown>).maxSocialItems, 0);
  assert.equal((result as { plan: { candidates: unknown[] } }).plan.candidates.length, 1);
  assert.match(JSON.stringify(result), /No bounded alternative candidate/);
});

test("MCP reindex request rejects unsupported indexName and jobKind at the boundary", async () => {
  const dummySdk = createSignalOpsSdk({
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
            indexName: "signal_candidates",
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
  const dummySdk = createSignalOpsSdk({
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
    replayExistingSignalCandidates: true,
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

test("MCP reindex backfill accepts bounded docId chunks and rejects runtime options", async () => {
  const dummySdk = createSignalOpsSdk({
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
        options: {
          docIds: [
            "11111111-1111-4111-8111-111111111111",
            "22222222-2222-4222-8222-222222222222",
          ],
          batchSize: 50,
          reason: "selection-gray-zone-hold-bounded-replay",
          parentReindexJobId: "33333333-3333-4333-8333-333333333333",
        },
      },
    }
  );
  const reindexInsert = pool.state.clientQueries.find((entry) =>
    /insert into public\.reindex_jobs/i.test(entry.sql)
  );
  assert.ok(reindexInsert, "reindex job insert should be recorded");
  assert.deepEqual(JSON.parse(String(reindexInsert.params[3])), {
    batchSize: 50,
    retroNotifications: "skip",
    replayExistingSignalCandidates: true,
    includeEnrichment: false,
    forceEnrichment: false,
    docIds: [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ],
    reason: "selection-gray-zone-hold-bounded-replay",
    parentReindexJobId: "33333333-3333-4333-8333-333333333333",
  });
  assert.match(JSON.stringify(result), /Bounded replay chunk queued for 2 docIds/);

  await assert.rejects(
    () =>
      executeMcpTool(
        {
          sdk: dummySdk,
          pool: createFakeReindexPool(),
          token: WRITE_SEQUENCES_TOKEN,
        },
        "maintenance.reindex.request",
        {
          payload: {
            indexName: "interest_centroids",
            jobKind: "backfill",
            options: {
              progress: { processedSignalCandidates: 10 },
            },
          },
        }
      ),
    (error) => error instanceof JsonRpcError && error.code === -32602
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
  assert.equal(
    reindex.inputSchema.properties?.payload?.properties?.options?.additionalProperties,
    false
  );
  assert.equal(
    reindex.inputSchema.properties?.payload?.properties?.options?.properties?.docIds?.type,
    "array"
  );
  assert.match(reindex.description, /old signal_candidates|historical|existing/i);
  assert.match(reindex.description, /bounded chunks|docIds/i);
  assert.match(reindex.description, /current system interests|interest_filter_results/i);
  assert.match(reindex.description, /final_selection_results|selected\/pass_through/i);
  assert.match(reindex.description, /jobKind=backfill/i);

  assert.ok(reindexJobs);
  assert.match(reindexJobs.description, /status, job_kind/i);
  assert.match(reindexJobs.description, /options_json/i);

  assert.ok(contentBackfill);
  assert.match(contentBackfill.description, /does not recompute signal_candidate\.match_criteria/i);
  assert.match(contentBackfill.description, /interest_filter_results/i);
  assert.match(contentBackfill.description, /final_selection_results/i);
});

test("content analysis backfill response warns that final selection is not recomputed", async () => {
  const requests: Array<Record<string, unknown>> = [];
  const sdk = createSignalOpsSdk({
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
        subjectTypes: "signal_candidate, web_resource",
        modules: "ner\ncontent_filter",
        subjectIds: "doc-1, doc-2",
      },
    }
  );

  assert.deepEqual(requests[0]?.subjectTypes, ["signal_candidate", "web_resource"]);
  assert.deepEqual(requests[0]?.modules, ["ner", "content_filter"]);
  assert.deepEqual(requests[0]?.subjectIds, ["doc-1", "doc-2"]);
  assert.match(JSON.stringify(result), /does not recompute signal_candidate\.match_criteria/i);
  assert.match(JSON.stringify(result), /final_selection_results/i);
  assert.match(JSON.stringify(result), /operator\.report\.verify/i);
});

test("SDK exposes Discovery vNext mutation routes needed by MCP parity", async () => {
  const requests = [];
  const sdk = createSignalOpsSdk({
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

  await sdk.cancelDiscoveryVNextRun<Record<string, unknown>>("11111111-1111-4111-8111-111111111111");
  await sdk.applyDiscoveryRoutingDecision<Record<string, unknown>>({
    sourceUnderstanding: {},
    canonicalUrl: "https://example.com/feed.xml",
    canonicalDomain: "example.com",
    sourceIdentityKey: "example.com:rss",
  });
  await sdk.applyDiscoveryRollback<Record<string, unknown>>({
    rollbackGroupId: "33333333-3333-4333-8333-333333333333",
    confirm: true,
  });

  assert.deepEqual(requests, [
    {
      url: "http://api.example.test/maintenance/discovery/runs/11111111-1111-4111-8111-111111111111/cancel",
      method: "POST",
    },
    {
      url: "http://api.example.test/maintenance/discovery/routing-decisions/apply",
      method: "POST",
    },
    {
      url: "http://api.example.test/maintenance/discovery/rollback/apply",
      method: "POST",
    },
  ]);
});
