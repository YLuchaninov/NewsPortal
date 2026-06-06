import {
  applyChannelBulkOnboardingWithPool,
  ChannelBottleneckNotFoundError,
  deleteChannelWithAudit,
  explainChannelBottleneckWithPool,
  listChannelBottlenecksWithPool,
  planChannelAlternativesWithPool,
  planChannelBulkOnboardingWithPool,
  saveChannelFromPayload,
  setChannelActiveStateWithAudit,
  summarizeChannelBottlenecksWithPool,
  verifyChannelBulkOnboardingWithPool
} from "@signalops/control-plane";
import {
  ADMIN_CHANNEL_PAYLOAD_SCHEMAS,
  ADMIN_CHANNEL_PROVIDER_TYPES,
  validateAdminChannelPayload,
  type JsonSchema,
} from "@signalops/contracts";

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
  writeMcpMutationAudit,
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

const channelPayloadWithEvidenceSchema = {
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
      items: channelPayloadWithEvidenceSchema,
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
      items: channelPayloadWithEvidenceSchema,
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

const channelSyncRequestSchema = {
  type: "object",
  required: ["channelId"],
  properties: {
    channelId: { type: "string" },
    reason: { type: "string" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

const outboxEventsListSchema = {
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

const channelAlternativesPlanSchema = {
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

const channelBottlenecksListSchema = {
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

const channelBottlenecksExplainSchema = {
  type: "object",
  required: ["channelId"],
  properties: {
    channelId: { type: "string" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

const channelAlternativesStartSchema = {
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

function channelProviderHints(providerType: unknown): Record<string, unknown> {
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

function readCreateChannelPayload(args: Record<string, unknown>): Record<string, unknown> {
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

async function readResolvedChannelPayload(
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

function readOptionalStringArray(value: unknown, path: string): string[] | undefined {
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

function readOptionalBoundedInteger(value: unknown, path: string): number | undefined {
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

function readOptionalNonNegativeInteger(value: unknown, path: string): number | undefined {
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
    "outbox.events.list",
    "List outbox events with optional event/aggregate/status filters for read-after-write source sync proof.",
    outboxEventsListSchema,
    async ({ sdk }, args) =>
      sdk.listOutboxEvents<Record<string, unknown>[]>({
        limit: readOptionalInteger(args.limit) ?? undefined,
        eventType: readOptionalString(args.eventType) ?? undefined,
        aggregateType: readOptionalString(args.aggregateType) ?? undefined,
        aggregateId: readOptionalString(args.aggregateId) ?? undefined,
        status: readOptionalString(args.status) ?? undefined,
      })
  ),
  createReadTool(
    "channels.bottlenecks.summary",
    "Summarize source bottlenecks from the shared control-plane read model. Separates working noisy/low-yield sources from technical fetch/provider-shape failures.",
    {
      type: "object",
      properties: {
        providerType: { type: "string" },
        failureBucket: { type: "string" },
        repairLane: { type: "string" },
        q: { type: "string" },
        channelIds: { type: "array", items: { type: "string" } },
      },
      additionalProperties: false,
    },
    async ({ pool }, args) =>
      summarizeChannelBottlenecksWithPool(pool, {
        providerType: readOptionalString(args.providerType) ?? undefined,
        failureBucket: readOptionalString(args.failureBucket) ?? undefined,
        repairLane: readOptionalString(args.repairLane) ?? undefined,
        q: readOptionalString(args.q) ?? undefined,
        channelIds: readOptionalStringArray(args.channelIds, "channelIds"),
      })
  ),
  createReadTool(
    "channels.bottlenecks.list",
    "List per-channel source bottlenecks with fetch outcomes, selection/projection stats, provider-shape validation, failure bucket, and repair lane.",
    channelBottlenecksListSchema,
    async ({ pool }, args) =>
      listChannelBottlenecksWithPool(pool, {
        ...readPageArgs(args),
        providerType: readOptionalString(args.providerType) ?? undefined,
        failureBucket: readOptionalString(args.failureBucket) ?? undefined,
        repairLane: readOptionalString(args.repairLane) ?? undefined,
        q: readOptionalString(args.q) ?? undefined,
        channelIds: readOptionalStringArray(args.channelIds, "channelIds"),
      })
  ),
  createReadTool(
    "channels.bottlenecks.explain",
    "Explain one channel bottleneck and return source-health diagnosis plus MCP read-back/repair next actions.",
    channelBottlenecksExplainSchema,
    async ({ pool }, args) => {
      try {
        return await explainChannelBottleneckWithPool(
          pool,
          await resolveChannelId(pool, args.channelId)
        );
      } catch (error) {
        if (error instanceof ChannelBottleneckNotFoundError) {
          throw new JsonRpcError(-32602, error.message, {
            statusCode: 404,
            data: { path: "channelId" },
          });
        }
        throw error;
      }
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
  createReadTool(
    "channels.alternatives.plan",
    "Plan safer alternative channel candidates for broken or mismatched sources. Uses fetchers feed probing for RSS autodiscovery and never mutates channels.",
    channelAlternativesPlanSchema,
    async ({ pool }, args) => {
      try {
        return await planChannelAlternativesWithPool(pool, {
          channelIds: readOptionalStringArray(args.channelIds, "channelIds"),
          urls: readOptionalStringArray(args.urls, "urls"),
          failureKinds: readOptionalStringArray(args.failureKinds, "failureKinds"),
          includeFeedProbe: args.includeFeedProbe !== false,
          maxCandidates: readOptionalBoundedInteger(args.maxCandidates, "maxCandidates"),
        });
      } catch (error) {
        return asMcpInvalidRequest(error, "channels.alternatives.plan");
      }
    }
  ),
  createWriteTool(
    "channels.create",
    "Create a channel through the shared control-plane service.",
    "write.channels",
    channelMutationSchema,
    async ({ pool, token }, args) => {
      try {
        return await saveChannelFromPayload(
          pool,
          token.issuedByUserId,
          readCreateChannelPayload(args)
        );
      } catch (error) {
        return asMcpInvalidRequest(error, "channels.create");
      }
    }
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
    "channels.alternatives.start",
    "Start bounded discovery replacement runs for existing bad channels after planning alternatives. This does not create source channels; candidates must still pass bulk onboarding.",
    "write.discovery",
    channelAlternativesStartSchema,
    async ({ pool, sdk, token }, args) => {
      try {
        const targetId = readRequiredString(args.targetId, "targetId");
        const plan = await planChannelAlternativesWithPool(pool, {
          channelIds: readOptionalStringArray(args.channelIds, "channelIds"),
          urls: readOptionalStringArray(args.urls, "urls"),
          failureKinds: readOptionalStringArray(args.failureKinds, "failureKinds"),
          includeFeedProbe: args.includeFeedProbe !== false,
          maxCandidates: readOptionalBoundedInteger(args.maxCandidates, "maxCandidates"),
        });
        const channelIds = Array.from(
          new Set(
            plan.candidates
              .map((candidate) => candidate.sourceChannelId)
              .filter((value): value is string => Boolean(value))
          )
        );
        const runs: unknown[] = [];
        const skipped: Array<Record<string, unknown>> = [];
        for (const channelId of channelIds) {
          runs.push(
            await sdk.createDiscoveryVNextRun<Record<string, unknown>>({
              runKind: "candidate_acquisition",
              triggerKind: "mcp",
              request: {
                source: "channels.alternatives.start",
                targetId,
                channelId,
                maxDepth: readOptionalBoundedInteger(args.maxDepth, "maxDepth") ?? 1,
                maxHypotheses: readOptionalBoundedInteger(args.maxHypotheses, "maxHypotheses") ?? 6,
                maxSearchResults:
                  readOptionalBoundedInteger(args.maxSearchResults, "maxSearchResults") ?? 8,
                maxDomains: readOptionalBoundedInteger(args.maxDomains, "maxDomains") ?? 12,
                maxEndpoints: readOptionalBoundedInteger(args.maxEndpoints, "maxEndpoints") ?? 20,
                maxSocialItems:
                  readOptionalNonNegativeInteger(args.maxSocialItems, "maxSocialItems") ?? 0,
                providerExecutionEnabled: args.providerExecutionEnabled === true,
              },
              budget: {
                liveProviderExecution: args.providerExecutionEnabled === true,
              },
              createdBy:
                readOptionalString(args.requestedBy) ??
                `channels.alternatives.start:${token.issuedByUserId}`,
            })
          );
        }
        for (const input of plan.inputs) {
          if (input.channelId && !channelIds.includes(input.channelId)) {
            skipped.push({
              channelId: input.channelId,
              reason:
                "No bounded alternative candidate was returned for this input, so no replacement run was started.",
            });
          }
        }
        if ((readOptionalStringArray(args.urls, "urls") ?? []).length > 0) {
          skipped.push({
            reason:
              "URL-only alternatives are plan-only until an existing channelId is available for source replacement.",
          });
        }
        return {
          plan,
          runs,
          skipped,
          nextReadBack: [
            {
              tool: "operator.report.verify",
              arguments: {
                reportKind: "discovery_run",
                entityIds: { targetIds: [targetId] },
                includeSamples: true,
              },
            },
            {
              tool: "channels.bulk_onboard.plan",
              arguments: { sources: "<chosen alternatives from plan.candidates>" },
            },
          ],
        };
      } catch (error) {
        return asMcpInvalidRequest(error, "channels.alternatives.start");
      }
    }
  ),
  createWriteTool(
    "channels.update",
    "Update a channel through the shared control-plane service. This requires a complete provider-specific channel payload with providerType, name, fetchUrl, and settings. For activation/deactivation only, use channels.set_active.",
    "write.channels",
    channelMutationSchema,
    async ({ pool, token }, args) => {
      try {
        return await saveChannelFromPayload(
          pool,
          token.issuedByUserId,
          await readResolvedChannelPayload(pool, args, { requireChannelId: true })
        );
      } catch (error) {
        return asMcpInvalidRequest(error, "channels.update");
      }
    }
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
    "channels.sync.request",
    "Queue a source.channel.sync.requested outbox event for an existing source channel without mutating channel configuration.",
    "write.channels",
    channelSyncRequestSchema,
    async ({ pool, token }, args) => {
      const channelId = await resolveChannelId(pool, args.channelId);
      const result = await pool.query(
        `
        insert into outbox_events (
          event_id,
          event_type,
          aggregate_type,
          aggregate_id,
          payload_json
        )
        values (gen_random_uuid(), 'source.channel.sync.requested', 'source_channel', $1, $2::jsonb)
        returning *
        `,
        [
          channelId,
          JSON.stringify({
            channelId,
            source: "mcp.channels.sync.request",
            reason: readOptionalString(args.reason) ?? null,
          }),
        ]
      );
      await pool.query(
        `
        insert into source_channel_runtime_state (
          channel_id,
          adaptive_enabled,
          effective_poll_interval_seconds,
          max_poll_interval_seconds,
          next_due_at,
          adaptive_step,
          consecutive_no_change_polls,
          consecutive_failures,
          adaptive_reason,
          updated_at
        )
        values (
          $1,
          true,
          (select poll_interval_seconds from source_channels where channel_id = $1),
          (select least(poll_interval_seconds * 16, 604800) from source_channels where channel_id = $1),
          now(),
          0,
          0,
          0,
          'mcp_sync_request',
          now()
        )
        on conflict (channel_id)
        do update
        set
          next_due_at = now(),
          adaptive_step = 0,
          consecutive_failures = 0,
          adaptive_reason = 'mcp_sync_request',
          updated_at = now()
        `,
        [channelId]
      );
      const event = result.rows[0] as Record<string, unknown>;
      await writeMcpMutationAudit(pool, token, {
        actionType: "channel_sync_requested",
        entityType: "source_channel",
        entityId: channelId,
        payloadJson: {
          eventId: event.event_id,
          reason: readOptionalString(args.reason) ?? null,
        },
      });
      return {
        ...event,
        nextReadBack: [
          { tool: "channels.read", arguments: { channelId } },
          { tool: "fetch_runs.list", arguments: { channelId, page: 1, pageSize: 5 } },
          {
            tool: "outbox.events.list",
            arguments: {
              eventType: "source.channel.sync.requested",
              aggregateType: "source_channel",
              aggregateId: channelId,
              limit: 10,
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
