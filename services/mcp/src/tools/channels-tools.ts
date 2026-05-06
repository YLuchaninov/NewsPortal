import {
  applyChannelBulkOnboardingWithPool,
  deleteChannelWithAudit,
  planChannelBulkOnboardingWithPool,
  saveChannelFromPayload,
  setChannelActiveStateWithAudit,
  verifyChannelBulkOnboardingWithPool
} from "@newsportal/control-plane";
import {
  ADMIN_CHANNEL_PAYLOAD_SCHEMAS,
  ADMIN_CHANNEL_PROVIDER_TYPES,
  validateAdminChannelPayload,
  type JsonSchema,
} from "@newsportal/contracts";

import {
  createReadTool,
  createWriteTool,
  JsonRpcError,
  readPageArgs,
  readPayload,
  readBooleanFlag,
  requireDestructiveConfirmation,
  readOptionalInteger,
  readOptionalString,
  readRequiredString,
  type McpToolDefinition
} from "./shared";

const channelDetailSchema = {
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

const channelPayloadSchema = {
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

const channelMutationSchema = {
  type: "object",
  required: ["payload"],
  properties: {
    payload: channelPayloadSchema,
  },
  additionalProperties: false,
} satisfies JsonSchema;

const bulkOnboardPlanSchema = {
  type: "object",
  required: ["sources"],
  properties: {
    sources: {
      type: "array",
      items: channelPayloadSchema,
    },
    mode: { type: "string", enum: ["strict", "allow_overrides"] },
    includeExisting: { type: "boolean" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

const bulkOnboardApplySchema = {
  type: "object",
  required: ["sources", "planFingerprint"],
  properties: {
    sources: {
      type: "array",
      items: channelPayloadSchema,
    },
    planFingerprint: { type: "string" },
    confirm: { type: "boolean" },
    overrideReason: { type: "string" },
    mode: { type: "string", enum: ["strict", "allow_overrides"] },
    includeExisting: { type: "boolean" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

const bulkOnboardVerifySchema = {
  type: "object",
  required: ["channelIds"],
  properties: {
    channelIds: { type: "array", items: { type: "string" } },
    includeSamples: { type: "boolean" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

const channelActiveStateSchema = {
  type: "object",
  required: ["channelId", "isActive"],
  properties: {
    channelId: { type: "string" },
    isActive: { type: "boolean" },
    reason: { type: "string" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

function readValidatedChannelPayload(args: Record<string, unknown>): Record<string, unknown> {
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

async function resolveChannelId(
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

function readBulkOnboardingMode(value: unknown): "strict" | "allow_overrides" | undefined {
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

function readSourcesArray(args: Record<string, unknown>): unknown[] {
  if (!Array.isArray(args.sources)) {
    throw new JsonRpcError(-32602, "sources must be an array of channel payload objects.", {
      statusCode: 400,
      data: { path: "sources", expectedShape: "ChannelPayload[]" },
    });
  }
  return args.sources;
}

function readChannelIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new JsonRpcError(-32602, "channelIds must be an array of strings.", {
      statusCode: 400,
      data: { path: "channelIds", expectedShape: "string[]" },
    });
  }
  return value.map((entry) => String(entry ?? "").trim()).filter(Boolean);
}

function asMcpInvalidRequest(error: unknown, toolName: string): never {
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

export const CHANNEL_MCP_TOOLS: readonly McpToolDefinition[] = [
  createReadTool(
    "channels.list",
    "List channels with optional provider filter.",
    {
      type: "object",
      properties: {
        page: { type: "number" },
        pageSize: { type: "number" },
        providerType: { type: "string" },
      },
      additionalProperties: false,
    },
    async ({ sdk }, args) =>
      sdk.listChannelsPage<Record<string, unknown>>({
        ...readPageArgs(args),
        providerType: readOptionalString(args.providerType) ?? undefined,
      })
  ),
  createReadTool(
    "channels.read",
    "Read one channel. Full channelId is preferred; unique UUID prefixes from reports are accepted for read-back.",
    channelDetailSchema,
    async ({ sdk, pool }, args) =>
      sdk.getChannel<Record<string, unknown>>(await resolveChannelId(pool, args.channelId))
  ),
  createReadTool(
    "fetch_runs.list",
    "List fetch runs.",
    {
      type: "object",
      properties: {
        channelId: { type: "string" },
        page: { type: "number" },
        pageSize: { type: "number" },
      },
      additionalProperties: false,
    },
    async ({ sdk }, args) => {
      const page = readOptionalInteger(args.page);
      const pageSize = readOptionalInteger(args.pageSize);
      if (page || pageSize) {
        return sdk.listFetchRunsPage<Record<string, unknown>>({
          page,
          pageSize,
          channelId: readOptionalString(args.channelId) ?? undefined,
        });
      }
      return sdk.listFetchRuns<Record<string, unknown>>(
        readOptionalString(args.channelId) ?? undefined
      );
    }
  ),
  createReadTool(
    "channels.bulk_onboard.plan",
    "Plan bulk channel onboarding without mutating state. Classifies each RSS/website/API/email source as create/update/duplicate/invalid/risky/override and returns a stale-safe planFingerprint.",
    bulkOnboardPlanSchema,
    async ({ pool }, args) => {
      try {
        return await planChannelBulkOnboardingWithPool(pool, readSourcesArray(args), {
          mode: readBulkOnboardingMode(args.mode),
          includeExisting: args.includeExisting === true,
        });
      } catch (error) {
        return asMcpInvalidRequest(error, "channels.bulk_onboard.plan");
      }
    }
  ),
  createReadTool(
    "channels.bulk_onboard.verify",
    "Verify bulk-onboarded channels from DB-backed state. Separates channel acquisition, website resources, projection, and downstream final selection decisions.",
    bulkOnboardVerifySchema,
    async ({ pool }, args) =>
      verifyChannelBulkOnboardingWithPool(
        pool,
        readChannelIds(args.channelIds),
        args.includeSamples === true
      )
  ),
  createWriteTool(
    "channels.create",
    "Create a channel through the shared control-plane service.",
    "write.channels",
    channelMutationSchema,
    async ({ pool, token }, args) =>
      saveChannelFromPayload(pool, token.issuedByUserId, readValidatedChannelPayload(args))
  ),
  createWriteTool(
    "channels.bulk_onboard.apply",
    "Apply a previously confirmed bulk onboarding plan. Recomputes the planFingerprint, rejects stale plans, requires confirm=true for updates, and only writes ready/explicitly-overridden rows.",
    "write.channels",
    bulkOnboardApplySchema,
    async ({ pool, token }, args) => {
      try {
        return await applyChannelBulkOnboardingWithPool(
          pool,
          token.issuedByUserId,
          readSourcesArray(args),
          {
            planFingerprint: readRequiredString(args.planFingerprint, "planFingerprint"),
            confirm: args.confirm === true,
            overrideReason: readOptionalString(args.overrideReason),
            mode: readBulkOnboardingMode(args.mode),
            includeExisting: args.includeExisting === true,
          }
        );
      } catch (error) {
        return asMcpInvalidRequest(error, "channels.bulk_onboard.apply");
      }
    }
  ),
  createWriteTool(
    "channels.update",
    "Update a channel through the shared control-plane service. This requires a complete provider-specific channel payload with providerType, name, fetchUrl, and settings. For activation/deactivation only, use channels.set_active.",
    "write.channels",
    channelMutationSchema,
    async ({ pool, token }, args) =>
      saveChannelFromPayload(pool, token.issuedByUserId, readValidatedChannelPayload(args))
  ),
  createWriteTool(
    "channels.set_active",
    "Activate or deactivate one existing channel by channelId without requiring the full provider-specific payload. Use this for operational cleanup of structurally failing sources.",
    "write.channels",
    channelActiveStateSchema,
    async ({ pool, token }, args) => {
      const result = await setChannelActiveStateWithAudit(
        pool,
        token.issuedByUserId,
        await resolveChannelId(pool, args.channelId),
        readBooleanFlag(args.isActive, "isActive"),
        readOptionalString(args.reason)
      );
      return {
        ...result,
        nextReadBack: [
          {
            tool: "channels.read",
            arguments: { channelId: result.channelId },
          },
          {
            tool: "operator.report.verify",
            arguments: {
              reportKind: "channel_health",
              entityIds: { channelIds: [result.channelId] },
              includeSamples: true,
            },
          },
        ],
      };
    }
  ),
  createWriteTool(
    "channels.delete",
    "Delete or archive a channel depending on stored items.",
    "write.channels",
    {
      type: "object",
      required: ["channelId", "confirm"],
      properties: {
        channelId: { type: "string" },
        confirm: { type: "boolean" },
      },
      additionalProperties: false,
    },
    async ({ pool, token }, args) => {
      requireDestructiveConfirmation(token, args);
      return deleteChannelWithAudit(
        pool,
        token.issuedByUserId,
        await resolveChannelId(pool, args.channelId)
      );
    },
    true
  ),
] as const;
