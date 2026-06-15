import {
  ADMIN_CHANNEL_PAYLOAD_SCHEMAS,
  ADMIN_CHANNEL_PROVIDER_TYPES,
  validateAdminChannelPayload,
  type JsonSchema,
} from "@signalops/contracts";

import {
  JsonRpcError,
  readOptionalInteger,
  readOptionalString,
  readPayload,
  readRequiredString,
} from "./shared";

export const channelDetailSchema = {
  type: "object",
  required: ["channelId"],
  properties: {
    channelId: { type: "string" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_PREFIX_RE = /^[0-9a-f-]{8,35}$/i;

export const channelPayloadSchema = {
  type: "object",
  properties: {
    ...ADMIN_CHANNEL_PAYLOAD_SCHEMAS.rss.properties,
    ...ADMIN_CHANNEL_PAYLOAD_SCHEMAS.website.properties,
    ...ADMIN_CHANNEL_PAYLOAD_SCHEMAS.api.properties,
    ...ADMIN_CHANNEL_PAYLOAD_SCHEMAS.email_imap.properties,
    providerType: { type: "string", enum: ADMIN_CHANNEL_PROVIDER_TYPES },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const channelPayloadWithEvidenceSchema = {
  type: "object",
  properties: {
    ...channelPayloadSchema.properties,
    feedProbeEvidence: { type: "object", additionalProperties: true },
    sourceCandidateStatus: { type: "string" },
    candidateStatus: { type: "string" },
    validation: { type: "object", additionalProperties: true },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const channelMutationSchema = {
  type: "object",
  required: ["payload"],
  properties: {
    payload: channelPayloadSchema,
    funnelId: { type: "string" },
    laneId: { type: "string" },
    changeMode: { type: "string", enum: ["autopilot_setup", "manual_tuning", "expert_override"] },
    configurationScope: { type: "string", enum: ["funnel", "shared", "global"] },
    funnelPlanId: { type: "string" },
    planFingerprint: { type: "string" },
    operator_override_reason: { type: "string" },
    verificationTarget: { type: "string", enum: ["selection", "source_health", "llm_review", "replay"] },
    sourceRole: { type: "string" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const bulkOnboardPlanSchema = {
  type: "object",
  required: ["sources"],
  properties: {
    sources: {
      type: "array",
      items: channelPayloadWithEvidenceSchema,
    },
    mode: { type: "string", enum: ["strict", "allow_overrides"] },
    includeExisting: { type: "boolean" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const bulkOnboardApplySchema = {
  type: "object",
  required: ["sources", "planFingerprint"],
  properties: {
    sources: {
      type: "array",
      items: channelPayloadWithEvidenceSchema,
    },
    planFingerprint: { type: "string" },
    confirm: { type: "boolean" },
    overrideReason: { type: "string" },
    mode: { type: "string", enum: ["strict", "allow_overrides"] },
    includeExisting: { type: "boolean" },
    funnelId: { type: "string" },
    laneId: { type: "string" },
    changeMode: { type: "string", enum: ["autopilot_setup", "manual_tuning", "expert_override"] },
    configurationScope: { type: "string", enum: ["funnel", "shared", "global"] },
    funnelPlanId: { type: "string" },
    funnelPlanFingerprint: { type: "string" },
    operator_override_reason: { type: "string" },
    verificationTarget: { type: "string", enum: ["selection", "source_health", "llm_review", "replay"] },
    sourceRole: { type: "string" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const bulkOnboardVerifySchema = {
  type: "object",
  required: ["channelIds"],
  properties: {
    channelIds: { type: "array", items: { type: "string" } },
    includeSamples: { type: "boolean" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const channelActiveStateSchema = {
  type: "object",
  required: ["channelId", "isActive"],
  properties: {
    channelId: { type: "string" },
    isActive: { type: "boolean" },
    reason: { type: "string" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const channelSyncRequestSchema = {
  type: "object",
  required: ["channelId"],
  properties: {
    channelId: { type: "string" },
    reason: { type: "string" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const outboxEventsListSchema = {
  type: "object",
  properties: {
    limit: { type: "number" },
    eventType: { type: "string" },
    aggregateType: { type: "string" },
    aggregateId: { type: "string" },
    status: { type: "string" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const channelAlternativesPlanSchema = {
  type: "object",
  properties: {
    channelIds: { type: "array", items: { type: "string" } },
    urls: { type: "array", items: { type: "string" } },
    failureKinds: { type: "array", items: { type: "string" } },
    includeFeedProbe: { type: "boolean" },
    maxCandidates: { type: "number" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const channelBottlenecksListSchema = {
  type: "object",
  properties: {
    page: { type: "number" },
    pageSize: { type: "number" },
    providerType: { type: "string" },
    failureBucket: { type: "string" },
    repairLane: { type: "string" },
    q: { type: "string" },
    channelIds: { type: "array", items: { type: "string" } },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const channelBottlenecksExplainSchema = {
  type: "object",
  required: ["channelId"],
  properties: {
    channelId: { type: "string" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const channelAlternativesStartSchema = {
  type: "object",
  required: ["targetId"],
  properties: {
    targetId: { type: "string" },
    channelIds: { type: "array", items: { type: "string" } },
    urls: { type: "array", items: { type: "string" } },
    failureKinds: { type: "array", items: { type: "string" } },
    includeFeedProbe: { type: "boolean" },
    maxCandidates: { type: "number" },
    maxDepth: { type: "number" },
    maxHypotheses: { type: "number" },
    maxSearchResults: { type: "number" },
    maxDomains: { type: "number" },
    maxEndpoints: { type: "number" },
    maxSocialItems: { type: "number" },
    providerExecutionEnabled: { type: "boolean" },
    requestedBy: { type: "string" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export function readValidatedChannelPayload(args: Record<string, unknown>): Record<string, unknown> {
  const payload = readPayload(args);
  const issues = validateAdminChannelPayload(payload);
  if (issues.length > 0) {
    const firstIssue = issues[0];
    const issueMessage =
      firstIssue.path === "$"
        ? firstIssue.message.replace("$", "payload")
        : `payload.${firstIssue.message}`;
    throw new JsonRpcError(-32602, `MCP channel payload failed schema validation: ${issueMessage}`, {
      statusCode: 400,
      data: {
        path: firstIssue.path === "$" ? "payload" : `payload.${firstIssue.path}`,
        hint:
          Object.prototype.hasOwnProperty.call(payload, "isActive") &&
          Object.keys(payload).every((key) => ["channelId", "isActive"].includes(key))
            ? "Use channels.set_active for activation/deactivation only. channels.update requires a complete provider-specific payload."
            : undefined,
      },
    });
  }
  return payload;
}

export function channelProviderHints(providerType: unknown): Record<string, unknown> {
  const normalized = readOptionalString(providerType);
  return {
    channelId: "channelId is for existing channel updates only; omit it when creating a channel.",
    polling:
      normalized === "website"
        ? "website channels use maxResourcesPerPoll in settings/config."
        : normalized === "rss" || normalized === "api"
          ? "RSS/API channels use maxItemsPerPoll in settings/config."
          : "Use provider-specific polling fields: website maxResourcesPerPoll; RSS/API maxItemsPerPoll.",
  };
}

export function readCreateChannelPayload(args: Record<string, unknown>): Record<string, unknown> {
  const payload = readValidatedChannelPayload(args);
  if (Object.prototype.hasOwnProperty.call(payload, "channelId") && readOptionalString(payload.channelId)) {
    throw new JsonRpcError(
      -32602,
      "channelId is for existing channel updates only; omit it when creating a channel",
      {
        statusCode: 400,
        data: {
          path: "payload.channelId",
          expectedShape: "omit channelId for channels.create",
          hints: channelProviderHints(payload.providerType),
        },
      }
    );
  }
  return payload;
}

export async function readResolvedChannelPayload(
  pool: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  args: Record<string, unknown>,
  options: { requireChannelId?: boolean } = {}
): Promise<Record<string, unknown>> {
  const payload = readValidatedChannelPayload(args);
  const channelId = readOptionalString(payload.channelId);
  if (!channelId) {
    if (options.requireChannelId) {
      throw new JsonRpcError(-32602, "channels.update requires an existing channelId.", {
        statusCode: 400,
        data: {
          path: "payload.channelId",
          expectedShape: "full UUID or unique UUID prefix",
          hints: channelProviderHints(payload.providerType),
        },
      });
    }
    return payload;
  }
  return {
    ...payload,
    channelId: await resolveChannelId(pool, channelId),
  };
}

export async function resolveChannelId(
  pool: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
  value: unknown
): Promise<string> {
  const normalized = readRequiredString(value, "channelId");
  if (UUID_RE.test(normalized)) {
    return normalized;
  }
  if (!UUID_PREFIX_RE.test(normalized)) {
    throw new JsonRpcError(-32602, "channelId must be a full UUID or a unique UUID prefix.", {
      statusCode: 400,
      data: {
        path: "channelId",
        expectedShape: "UUID or unique UUID prefix of at least 8 hex characters",
      },
    });
  }
  const result = await pool.query(
    `
      select channel_id::text as id
        from source_channels
       where channel_id::text like $1
       order by channel_id::text
       limit 2
    `,
    [`${normalized}%`]
  );
  const rows = result.rows as Array<{ id: string }>;
  if (rows.length === 1) {
    return rows[0]?.id;
  }
  if (rows.length > 1) {
    throw new JsonRpcError(-32602, "channelId prefix is ambiguous; pass the full UUID.", {
      statusCode: 400,
      data: {
        path: "channelId",
        value: normalized,
        matches: rows.map((row) => row.id),
      },
    });
  }
  throw new JsonRpcError(-32602, `Channel ${normalized} was not found.`, {
    statusCode: 400,
    data: {
      path: "channelId",
      value: normalized,
    },
  });
}

export function readBulkOnboardingMode(value: unknown): "strict" | "allow_overrides" | undefined {
  if (value == null || value === "") {
    return undefined;
  }
  if (value === "strict" || value === "allow_overrides") {
    return value;
  }
  throw new JsonRpcError(-32602, "mode must be strict or allow_overrides.", {
    statusCode: 400,
    data: { path: "mode", expectedShape: '"strict" | "allow_overrides"' },
  });
}

export function readSourcesArray(args: Record<string, unknown>): unknown[] {
  if (!Array.isArray(args.sources)) {
    throw new JsonRpcError(-32602, "sources must be an array of channel payload objects.", {
      statusCode: 400,
      data: { path: "sources", expectedShape: "ChannelPayload[]" },
    });
  }
  return args.sources;
}

export function readChannelIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new JsonRpcError(-32602, "channelIds must be an array of strings.", {
      statusCode: 400,
      data: { path: "channelIds", expectedShape: "string[]" },
    });
  }
  return value.map((entry) => String(entry ?? "").trim()).filter(Boolean);
}

export function readOptionalStringArray(value: unknown, path: string): string[] | undefined {
  if (value == null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new JsonRpcError(-32602, `${path} must be an array of strings.`, {
      statusCode: 400,
      data: { path, expectedShape: "string[]" },
    });
  }
  return value.map((entry) => String(entry ?? "").trim()).filter(Boolean);
}

export function readOptionalBoundedInteger(value: unknown, path: string): number | undefined {
  const parsed = readOptionalInteger(value);
  if (parsed == null) {
    return undefined;
  }
  if (parsed <= 0) {
    throw new JsonRpcError(-32602, `${path} must be a positive integer.`, {
      statusCode: 400,
      data: { path, expectedShape: "positive integer" },
    });
  }
  return parsed;
}

export function readOptionalNonNegativeInteger(value: unknown, path: string): number | undefined {
  const parsed = readOptionalInteger(value);
  if (parsed == null) {
    return undefined;
  }
  if (parsed < 0) {
    throw new JsonRpcError(-32602, `${path} must be a non-negative integer.`, {
      statusCode: 400,
      data: { path, expectedShape: "non-negative integer" },
    });
  }
  return parsed;
}

export function asMcpInvalidRequest(error: unknown, toolName: string): never {
  if (error instanceof JsonRpcError) {
    throw error;
  }
  throw new JsonRpcError(
    -32602,
    error instanceof Error ? error.message : `${toolName} arguments failed validation.`,
    {
      statusCode: 400,
      data: {
        tool: toolName,
      },
    }
  );
}

