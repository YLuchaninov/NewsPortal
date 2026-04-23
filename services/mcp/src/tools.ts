import {
  deleteChannelWithAudit,
  deleteTemplateWithAudit,
  hasMcpScope,
  listMcpAccessTokens,
  saveChannelFromPayload,
  saveTemplateFromPayload,
  setTemplateActiveStateWithAudit,
  writeAuditLog,
  type McpAccessTokenRecord,
  type McpScope,
} from "@newsportal/control-plane";
import { createNewsPortalSdk } from "@newsportal/sdk";
import type { Pool } from "pg";

import {
  JsonRpcError,
  readBooleanFlag,
  readOptionalInteger,
  readOptionalString,
  readRequiredString,
} from "./protocol";

type NewsPortalSdk = ReturnType<typeof createNewsPortalSdk>;

export interface McpToolContext {
  sdk: NewsPortalSdk;
  pool: Pool;
  token: McpAccessTokenRecord;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  requiredScope: McpScope | "read";
  destructive?: boolean;
  handler: (context: McpToolContext, args: Record<string, unknown>) => Promise<unknown>;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readPageArgs(args: Record<string, unknown>) {
  return {
    page: readOptionalInteger(args.page),
    pageSize: readOptionalInteger(args.pageSize),
  };
}

function readPayload(args: Record<string, unknown>): Record<string, unknown> {
  const payload = args.payload;
  if (payload != null && typeof payload === "object" && !Array.isArray(payload)) {
    return { ...(payload as Record<string, unknown>) };
  }
  throw new JsonRpcError(-32602, "payload must be a JSON object.", {
    statusCode: 400,
  });
}

function withActorDefault(
  payload: Record<string, unknown>,
  fieldName: string,
  actorUserId: string
): Record<string, unknown> {
  return {
    ...payload,
    [fieldName]: readOptionalString(payload[fieldName]) ?? actorUserId,
  };
}

function normalizeAuditEntityId(entityId: string | null | undefined): string | null {
  const normalized = String(entityId ?? "").trim();
  return UUID_RE.test(normalized) ? normalized : null;
}

async function writeMcpMutationAudit(
  pool: Pool,
  token: McpAccessTokenRecord,
  input: {
    actionType: string;
    entityType: string;
    entityId?: string | null;
    payloadJson?: Record<string, unknown>;
  }
): Promise<void> {
  await writeAuditLog(pool, {
    actorUserId: token.issuedByUserId,
    actionType: input.actionType,
    entityType: input.entityType,
    entityId: normalizeAuditEntityId(input.entityId),
    payloadJson: {
      via: "mcp",
      mcpTokenId: token.tokenId,
      mcpTokenLabel: token.label,
      ...input.payloadJson,
    },
  });
}

async function requireScope(
  token: McpAccessTokenRecord,
  requiredScope: McpScope | "read"
): Promise<void> {
  if (!hasMcpScope(token.scopes, requiredScope)) {
    throw new JsonRpcError(-32004, `MCP token is missing required scope "${requiredScope}".`, {
      statusCode: 403,
    });
  }
}

function requireDestructiveConfirmation(
  token: McpAccessTokenRecord,
  args: Record<string, unknown>
): void {
  if (!hasMcpScope(token.scopes, "write.destructive")) {
    throw new JsonRpcError(-32004, "Destructive MCP tools require scope \"write.destructive\".", {
      statusCode: 403,
    });
  }
  if (!readBooleanFlag(args.confirm, "confirm")) {
    throw new JsonRpcError(
      -32602,
      "Destructive MCP tools require confirm=true in the tool arguments.",
      {
        statusCode: 400,
      }
    );
  }
}

const pagingSchema = {
  type: "object",
  properties: {
    page: { type: "number" },
    pageSize: { type: "number" },
  },
  additionalProperties: true,
} satisfies Record<string, unknown>;

const detailSchema = {
  type: "object",
  additionalProperties: true,
} satisfies Record<string, unknown>;

const contentDetailSchema = {
  type: "object",
  properties: {
    docId: { type: "string" },
    contentItemId: { type: "string" },
    includeBody: { type: "boolean" },
    includeBodyHtml: { type: "boolean" },
    includeRawPayload: { type: "boolean" },
    includeMediaAssets: { type: "boolean" },
  },
  additionalProperties: false,
} satisfies Record<string, unknown>;

function isFlagEnabled(value: unknown): boolean {
  return value === true || String(value ?? "").trim().toLowerCase() === "true";
}

function readOptionalContentSort(
  value: unknown
): "latest" | "oldest" | "title_asc" | "title_desc" | undefined {
  const normalized = readOptionalString(value);
  if (
    normalized === "latest" ||
    normalized === "oldest" ||
    normalized === "title_asc" ||
    normalized === "title_desc"
  ) {
    return normalized;
  }
  return undefined;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : null;
}

function shapeContentLikeRecord(
  value: unknown,
  args: Record<string, unknown>
): Record<string, unknown> | null {
  const record = asObject(value);
  if (!record) {
    return null;
  }
  if (!isFlagEnabled(args.includeBody)) {
    delete record.body;
  }
  if (!isFlagEnabled(args.includeBodyHtml)) {
    delete record.body_html;
    delete record.full_content_html;
  }
  if (!isFlagEnabled(args.includeRawPayload)) {
    delete record.raw_payload_json;
  }
  if (!isFlagEnabled(args.includeMediaAssets)) {
    delete record.media_assets;
    delete record.media_json;
  }
  return record;
}

function shapePaginatedContentItems(
  value: unknown,
  args: Record<string, unknown>
): Record<string, unknown> {
  const payload = asObject(value) ?? {};
  const items = Array.isArray(payload.items)
    ? payload.items.map((entry) => shapeContentLikeRecord(entry, args) ?? entry)
    : [];
  return {
    ...payload,
    items,
  };
}

function shapeExplainPayload(
  value: unknown,
  itemKey: "article" | "content_item",
  args: Record<string, unknown>
): Record<string, unknown> {
  const payload = asObject(value) ?? {};
  return {
    ...payload,
    [itemKey]: shapeContentLikeRecord(payload[itemKey], args) ?? payload[itemKey],
  };
}

function createReadTool(
  name: string,
  description: string,
  inputSchema: Record<string, unknown>,
  handler: McpToolDefinition["handler"]
): McpToolDefinition {
  return {
    name,
    description,
    inputSchema,
    requiredScope: "read",
    handler,
  };
}

function createWriteTool(
  name: string,
  description: string,
  requiredScope: McpScope,
  inputSchema: Record<string, unknown>,
  handler: McpToolDefinition["handler"],
  destructive = false
): McpToolDefinition {
  return {
    name,
    description,
    inputSchema,
    requiredScope,
    destructive,
    handler,
  };
}

export const MCP_TOOLS: readonly McpToolDefinition[] = [
  createReadTool(
    "admin.summary.get",
    "Read the operator summary plus MCP token inventory counts.",
    { type: "object", additionalProperties: false },
    async ({ sdk, pool }) => {
      const [dashboardSummary, tokens] = await Promise.all([
        sdk.getDashboardSummary<Record<string, unknown>>(),
        listMcpAccessTokens(pool),
      ]);
      return {
        dashboardSummary,
        mcpTokens: {
          total: tokens.length,
          active: tokens.filter((token) => token.status === "active").length,
          revoked: tokens.filter((token) => token.status === "revoked").length,
        },
      };
    }
  ),
  createReadTool(
    "system_interests.list",
    "List system interests from the public read surface.",
    pagingSchema,
    async ({ sdk }, args) => sdk.listSystemInterestsPage<Record<string, unknown>>(readPageArgs(args))
  ),
  createReadTool(
    "system_interests.read",
    "Read one system interest.",
    detailSchema,
    async ({ sdk }, args) =>
      sdk.getSystemInterest<Record<string, unknown>>(
        readRequiredString(args.interestTemplateId, "interestTemplateId")
      )
  ),
  createReadTool(
    "llm_templates.list",
    "List LLM prompt templates.",
    pagingSchema,
    async ({ sdk }, args) => sdk.listLlmTemplatesPage<Record<string, unknown>>(readPageArgs(args))
  ),
  createReadTool(
    "llm_templates.read",
    "Read one LLM prompt template.",
    detailSchema,
    async ({ sdk }, args) =>
      sdk.getLlmTemplate<Record<string, unknown>>(
        readRequiredString(args.promptTemplateId, "promptTemplateId")
      )
  ),
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
    "Read one channel.",
    detailSchema,
    async ({ sdk }, args) =>
      sdk.getChannel<Record<string, unknown>>(readRequiredString(args.channelId, "channelId"))
  ),
  createReadTool(
    "articles.list",
    "List editorial article observations from the maintenance API.",
    pagingSchema,
    async ({ sdk }, args) =>
      shapePaginatedContentItems(
        await sdk.listArticlesPage<Record<string, unknown>>(readPageArgs(args)),
        args
      )
  ),
  createReadTool(
    "articles.read",
    "Read one editorial article observation with compact defaults.",
    {
      ...contentDetailSchema,
      required: ["docId"],
    },
    async ({ sdk }, args) =>
      shapeContentLikeRecord(
        await sdk.getArticle<Record<string, unknown>>(readRequiredString(args.docId, "docId")),
        args
      )
  ),
  createReadTool(
    "articles.explain",
    "Read article-level selection diagnostics, filter evidence, and verification context.",
    {
      ...contentDetailSchema,
      required: ["docId"],
    },
    async ({ sdk }, args) =>
      shapeExplainPayload(
        await sdk.getArticleExplain<Record<string, unknown>>(
          readRequiredString(args.docId, "docId")
        ),
        "article",
        args
      )
  ),
  createReadTool(
    "content_items.list",
    "List selected/public content items with optional search and sort.",
    {
      type: "object",
      properties: {
        page: { type: "number" },
        pageSize: { type: "number" },
        sort: { type: "string" },
        q: { type: "string" },
      },
      additionalProperties: false,
    },
    async ({ sdk }, args) =>
      shapePaginatedContentItems(
        await sdk.listContentItemsPage<Record<string, unknown>>({
          ...readPageArgs(args),
          sort: readOptionalContentSort(args.sort),
          q: readOptionalString(args.q) ?? undefined,
        }),
        args
      )
  ),
  createReadTool(
    "content_items.read",
    "Read one content item with compact defaults.",
    {
      ...contentDetailSchema,
      required: ["contentItemId"],
    },
    async ({ sdk }, args) =>
      shapeContentLikeRecord(
        await sdk.getContentItem<Record<string, unknown>>(
          readRequiredString(args.contentItemId, "contentItemId")
        ),
        args
      )
  ),
  createReadTool(
    "content_items.explain",
    "Read content-item explainability including selection diagnostics and guidance.",
    {
      ...contentDetailSchema,
      required: ["contentItemId"],
    },
    async ({ sdk }, args) =>
      shapeExplainPayload(
        await sdk.getContentItemExplain<Record<string, unknown>>(
          readRequiredString(args.contentItemId, "contentItemId")
        ),
        "content_item",
        args
      )
  ),
  createReadTool(
    "articles.residuals.list",
    "List article residual buckets for tuning and operator diagnosis.",
    {
      type: "object",
      properties: {
        page: { type: "number" },
        pageSize: { type: "number" },
        downstreamLossBucket: { type: "string" },
        selectionBlockerStage: { type: "string" },
        selectionBlockerReason: { type: "string" },
        selectionMode: { type: "string" },
        verificationState: { type: "string" },
        processingState: { type: "string" },
        observationState: { type: "string" },
        duplicateKind: { type: "string" },
        q: { type: "string" },
      },
      additionalProperties: false,
    },
    async ({ sdk }, args) =>
      shapePaginatedContentItems(
        await sdk.listArticleResidualsPage<Record<string, unknown>>({
          ...readPageArgs(args),
          downstreamLossBucket: readOptionalString(args.downstreamLossBucket) ?? undefined,
          selectionBlockerStage: readOptionalString(args.selectionBlockerStage) ?? undefined,
          selectionBlockerReason: readOptionalString(args.selectionBlockerReason) ?? undefined,
          selectionMode: readOptionalString(args.selectionMode) ?? undefined,
          verificationState: readOptionalString(args.verificationState) ?? undefined,
          processingState: readOptionalString(args.processingState) ?? undefined,
          observationState: readOptionalString(args.observationState) ?? undefined,
          duplicateKind: readOptionalString(args.duplicateKind) ?? undefined,
          q: readOptionalString(args.q) ?? undefined,
        }),
        args
      )
  ),
  createReadTool(
    "articles.residuals.summary",
    "Read aggregate residual diagnostics and blocker-bucket counts.",
    {
      type: "object",
      properties: {
        downstreamLossBucket: { type: "string" },
        selectionBlockerStage: { type: "string" },
        selectionBlockerReason: { type: "string" },
        selectionMode: { type: "string" },
        verificationState: { type: "string" },
        processingState: { type: "string" },
        observationState: { type: "string" },
        duplicateKind: { type: "string" },
        q: { type: "string" },
      },
      additionalProperties: false,
    },
    async ({ sdk }, args) =>
      sdk.getArticleResidualSummary<Record<string, unknown>>({
        downstreamLossBucket: readOptionalString(args.downstreamLossBucket) ?? undefined,
        selectionBlockerStage: readOptionalString(args.selectionBlockerStage) ?? undefined,
        selectionBlockerReason: readOptionalString(args.selectionBlockerReason) ?? undefined,
        selectionMode: readOptionalString(args.selectionMode) ?? undefined,
        verificationState: readOptionalString(args.verificationState) ?? undefined,
        processingState: readOptionalString(args.processingState) ?? undefined,
        observationState: readOptionalString(args.observationState) ?? undefined,
        duplicateKind: readOptionalString(args.duplicateKind) ?? undefined,
        q: readOptionalString(args.q) ?? undefined,
      })
  ),
  createReadTool(
    "sequences.list",
    "List sequences from the maintenance API.",
    pagingSchema,
    async ({ sdk }, args) => sdk.listSequencesPage<Record<string, unknown>>(readPageArgs(args))
  ),
  createReadTool(
    "sequences.read",
    "Read one sequence.",
    detailSchema,
    async ({ sdk }, args) =>
      sdk.getSequence<Record<string, unknown>>(readRequiredString(args.sequenceId, "sequenceId"))
  ),
  createReadTool(
    "sequences.plugins.list",
    "List available sequence plugins.",
    { type: "object", additionalProperties: false },
    async ({ sdk }) => sdk.listSequencePlugins<Record<string, unknown>>()
  ),
  createReadTool(
    "sequences.runs.read",
    "Read one sequence run.",
    detailSchema,
    async ({ sdk }, args) =>
      sdk.getSequenceRun<Record<string, unknown>>(readRequiredString(args.runId, "runId"))
  ),
  createReadTool(
    "sequences.run_task_runs.list",
    "List task runs for a sequence run.",
    detailSchema,
    async ({ sdk }, args) =>
      sdk.getSequenceRunTaskRuns<Record<string, unknown>>(readRequiredString(args.runId, "runId"))
  ),
  createReadTool(
    "discovery.summary.get",
    "Read the discovery summary.",
    { type: "object", additionalProperties: false },
    async ({ sdk }) => sdk.getDiscoverySummary<Record<string, unknown>>()
  ),
  createReadTool(
    "discovery.profiles.list",
    "List discovery profiles.",
    {
      type: "object",
      properties: {
        page: { type: "number" },
        pageSize: { type: "number" },
        status: { type: "string" },
      },
      additionalProperties: false,
    },
    async ({ sdk }, args) =>
      sdk.listDiscoveryProfiles<Record<string, unknown>>({
        ...readPageArgs(args),
        status: readOptionalString(args.status) ?? undefined,
      })
  ),
  createReadTool(
    "discovery.profiles.read",
    "Read one discovery profile.",
    detailSchema,
    async ({ sdk }, args) =>
      sdk.getDiscoveryProfile<Record<string, unknown>>(
        readRequiredString(args.profileId, "profileId")
      )
  ),
  createReadTool(
    "discovery.classes.list",
    "List discovery classes.",
    {
      type: "object",
      properties: {
        page: { type: "number" },
        pageSize: { type: "number" },
        status: { type: "string" },
      },
      additionalProperties: false,
    },
    async ({ sdk }, args) =>
      sdk.listDiscoveryClasses<Record<string, unknown>>({
        ...readPageArgs(args),
        status: readOptionalString(args.status) ?? undefined,
      })
  ),
  createReadTool(
    "discovery.classes.read",
    "Read one discovery class.",
    detailSchema,
    async ({ sdk }, args) =>
      sdk.getDiscoveryClass<Record<string, unknown>>(readRequiredString(args.classKey, "classKey"))
  ),
  createReadTool(
    "discovery.missions.list",
    "List discovery missions.",
    {
      type: "object",
      properties: {
        page: { type: "number" },
        pageSize: { type: "number" },
        status: { type: "string" },
      },
      additionalProperties: false,
    },
    async ({ sdk }, args) =>
      sdk.listDiscoveryMissions<Record<string, unknown>>({
        ...readPageArgs(args),
        status: readOptionalString(args.status) ?? undefined,
      })
  ),
  createReadTool(
    "discovery.missions.read",
    "Read one discovery mission.",
    detailSchema,
    async ({ sdk }, args) =>
      sdk.getDiscoveryMission<Record<string, unknown>>(
        readRequiredString(args.missionId, "missionId")
      )
  ),
  createReadTool(
    "discovery.missions.portfolio.read",
    "Read one discovery mission portfolio snapshot.",
    detailSchema,
    async ({ sdk }, args) =>
      sdk.getDiscoveryMissionPortfolio<Record<string, unknown>>(
        readRequiredString(args.missionId, "missionId")
      )
  ),
  createReadTool(
    "discovery.recall_missions.list",
    "List recall missions.",
    {
      type: "object",
      properties: {
        page: { type: "number" },
        pageSize: { type: "number" },
        status: { type: "string" },
        missionKind: { type: "string" },
      },
      additionalProperties: false,
    },
    async ({ sdk }, args) =>
      sdk.listDiscoveryRecallMissions<Record<string, unknown>>({
        ...readPageArgs(args),
        status: readOptionalString(args.status) ?? undefined,
        missionKind: readOptionalString(args.missionKind) ?? undefined,
      })
  ),
  createReadTool(
    "discovery.recall_missions.read",
    "Read one recall mission.",
    detailSchema,
    async ({ sdk }, args) =>
      sdk.getDiscoveryRecallMission<Record<string, unknown>>(
        readRequiredString(args.recallMissionId, "recallMissionId")
      )
  ),
  createReadTool(
    "discovery.candidates.list",
    "List discovery candidates.",
    {
      type: "object",
      properties: {
        page: { type: "number" },
        pageSize: { type: "number" },
        missionId: { type: "string" },
        status: { type: "string" },
        providerType: { type: "string" },
      },
      additionalProperties: false,
    },
    async ({ sdk }, args) =>
      sdk.listDiscoveryCandidates<Record<string, unknown>>({
        ...readPageArgs(args),
        missionId: readOptionalString(args.missionId) ?? undefined,
        status: readOptionalString(args.status) ?? undefined,
        providerType: readOptionalString(args.providerType) ?? undefined,
      })
  ),
  createReadTool(
    "discovery.candidates.read",
    "Read one discovery candidate.",
    detailSchema,
    async ({ sdk }, args) =>
      sdk.getDiscoveryCandidate<Record<string, unknown>>(
        readRequiredString(args.candidateId, "candidateId")
      )
  ),
  createReadTool(
    "discovery.recall_candidates.list",
    "List recall candidates.",
    {
      type: "object",
      properties: {
        page: { type: "number" },
        pageSize: { type: "number" },
        recallMissionId: { type: "string" },
        status: { type: "string" },
        providerType: { type: "string" },
        canonicalDomain: { type: "string" },
      },
      additionalProperties: false,
    },
    async ({ sdk }, args) =>
      sdk.listDiscoveryRecallCandidates<Record<string, unknown>>({
        ...readPageArgs(args),
        recallMissionId: readOptionalString(args.recallMissionId) ?? undefined,
        status: readOptionalString(args.status) ?? undefined,
        providerType: readOptionalString(args.providerType) ?? undefined,
        canonicalDomain: readOptionalString(args.canonicalDomain) ?? undefined,
      })
  ),
  createReadTool(
    "discovery.recall_candidates.read",
    "Read one recall candidate.",
    detailSchema,
    async ({ sdk }, args) =>
      sdk.getDiscoveryRecallCandidate<Record<string, unknown>>(
        readRequiredString(args.recallCandidateId, "recallCandidateId")
      )
  ),
  createReadTool(
    "discovery.hypotheses.list",
    "List discovery hypotheses.",
    {
      type: "object",
      properties: {
        page: { type: "number" },
        pageSize: { type: "number" },
        missionId: { type: "string" },
        status: { type: "string" },
      },
      additionalProperties: false,
    },
    async ({ sdk }, args) =>
      sdk.listDiscoveryHypotheses<Record<string, unknown>>({
        ...readPageArgs(args),
        missionId: readOptionalString(args.missionId) ?? undefined,
        status: readOptionalString(args.status) ?? undefined,
      })
  ),
  createReadTool(
    "discovery.source_profiles.list",
    "List source profiles.",
    {
      type: "object",
      properties: {
        page: { type: "number" },
        pageSize: { type: "number" },
        sourceType: { type: "string" },
        minTrustScore: { type: "number" },
      },
      additionalProperties: false,
    },
    async ({ sdk }, args) =>
      sdk.listDiscoverySourceProfiles<Record<string, unknown>>({
        ...readPageArgs(args),
        sourceType: readOptionalString(args.sourceType) ?? undefined,
        minTrustScore:
          typeof args.minTrustScore === "number" ? args.minTrustScore : undefined,
      })
  ),
  createReadTool(
    "discovery.source_profiles.read",
    "Read one source profile.",
    detailSchema,
    async ({ sdk }, args) =>
      sdk.getDiscoverySourceProfile<Record<string, unknown>>(
        readRequiredString(args.sourceProfileId, "sourceProfileId")
      )
  ),
  createReadTool(
    "discovery.source_interest_scores.list",
    "List source-interest scores.",
    {
      type: "object",
      properties: {
        page: { type: "number" },
        pageSize: { type: "number" },
        missionId: { type: "string" },
        channelId: { type: "string" },
        minScore: { type: "number" },
      },
      additionalProperties: false,
    },
    async ({ sdk }, args) =>
      sdk.listDiscoverySourceInterestScores<Record<string, unknown>>({
        ...readPageArgs(args),
        missionId: readOptionalString(args.missionId) ?? undefined,
        channelId: readOptionalString(args.channelId) ?? undefined,
        minScore: typeof args.minScore === "number" ? args.minScore : undefined,
      })
  ),
  createReadTool(
    "discovery.source_interest_scores.read",
    "Read one source-interest score row.",
    detailSchema,
    async ({ sdk }, args) =>
      sdk.getDiscoverySourceInterestScore<Record<string, unknown>>(
        readRequiredString(args.scoreId, "scoreId")
      )
  ),
  createReadTool(
    "discovery.feedback.list",
    "List discovery feedback rows.",
    {
      type: "object",
      properties: {
        page: { type: "number" },
        pageSize: { type: "number" },
        missionId: { type: "string" },
      },
      additionalProperties: false,
    },
    async ({ sdk }, args) =>
      sdk.listDiscoveryFeedback<Record<string, unknown>>({
        ...readPageArgs(args),
        missionId: readOptionalString(args.missionId) ?? undefined,
      })
  ),
  createReadTool(
    "discovery.costs.summary",
    "Read discovery cost summary.",
    { type: "object", additionalProperties: false },
    async ({ sdk }) => sdk.getDiscoveryCostSummary<Record<string, unknown>>()
  ),
  createReadTool(
    "web_resources.list",
    "List web resources.",
    {
      type: "object",
      properties: {
        page: { type: "number" },
        pageSize: { type: "number" },
        channelId: { type: "string" },
        extractionState: { type: "string" },
        projection: { type: "string" },
        resourceKind: { type: "string" },
      },
      additionalProperties: false,
    },
    async ({ sdk }, args) =>
      sdk.listWebResourcesPage<Record<string, unknown>>({
        ...readPageArgs(args),
        channelId: readOptionalString(args.channelId) ?? undefined,
        extractionState: readOptionalString(args.extractionState) ?? undefined,
        projection: readOptionalString(args.projection) ?? undefined,
        resourceKind: readOptionalString(args.resourceKind) ?? undefined,
      })
  ),
  createReadTool(
    "web_resources.read",
    "Read one web resource.",
    detailSchema,
    async ({ sdk }, args) =>
      sdk.getWebResource<Record<string, unknown>>(
        readRequiredString(args.resourceId, "resourceId")
      )
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
    "llm_budget.summary",
    "Read the LLM budget summary.",
    { type: "object", additionalProperties: false },
    async ({ sdk }) => sdk.getLlmBudgetSummary<Record<string, unknown>>()
  ),
  createWriteTool(
    "system_interests.create",
    "Create a system interest through the shared control-plane service.",
    "write.templates",
    {
      type: "object",
      required: ["payload"],
      properties: {
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ pool, token }, args) => {
      const payload = {
        ...readPayload(args),
        kind: "interest",
      };
      return saveTemplateFromPayload(pool, token.issuedByUserId, payload);
    }
  ),
  createWriteTool(
    "system_interests.update",
    "Update a system interest through the shared control-plane service.",
    "write.templates",
    {
      type: "object",
      required: ["payload"],
      properties: {
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ pool, token }, args) => {
      const payload = {
        ...readPayload(args),
        kind: "interest",
      };
      return saveTemplateFromPayload(pool, token.issuedByUserId, payload);
    }
  ),
  createWriteTool(
    "system_interests.archive",
    "Archive a system interest.",
    "write.templates",
    {
      type: "object",
      required: ["interestTemplateId", "confirm"],
      properties: {
        interestTemplateId: { type: "string" },
        confirm: { type: "boolean" },
      },
      additionalProperties: false,
    },
    async ({ pool, token }, args) => {
      requireDestructiveConfirmation(token, args);
      const interestTemplateId = readRequiredString(
        args.interestTemplateId,
        "interestTemplateId"
      );
      await setTemplateActiveStateWithAudit(
        pool,
        token.issuedByUserId,
        "interest",
        interestTemplateId,
        false
      );
      return {
        ok: true,
        interestTemplateId,
        status: "archived",
      };
    },
    true
  ),
  createWriteTool(
    "system_interests.delete",
    "Delete a system interest.",
    "write.templates",
    {
      type: "object",
      required: ["interestTemplateId", "confirm"],
      properties: {
        interestTemplateId: { type: "string" },
        confirm: { type: "boolean" },
      },
      additionalProperties: false,
    },
    async ({ pool, token }, args) => {
      requireDestructiveConfirmation(token, args);
      const interestTemplateId = readRequiredString(
        args.interestTemplateId,
        "interestTemplateId"
      );
      await deleteTemplateWithAudit(pool, token.issuedByUserId, "interest", interestTemplateId);
      return {
        ok: true,
        interestTemplateId,
      };
    },
    true
  ),
  createWriteTool(
    "llm_templates.create",
    "Create an LLM template through the shared control-plane service.",
    "write.templates",
    {
      type: "object",
      required: ["payload"],
      properties: {
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ pool, token }, args) => {
      const payload = {
        ...readPayload(args),
        kind: "llm",
      };
      return saveTemplateFromPayload(pool, token.issuedByUserId, payload);
    }
  ),
  createWriteTool(
    "llm_templates.update",
    "Update an LLM template through the shared control-plane service.",
    "write.templates",
    {
      type: "object",
      required: ["payload"],
      properties: {
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ pool, token }, args) => {
      const payload = {
        ...readPayload(args),
        kind: "llm",
      };
      return saveTemplateFromPayload(pool, token.issuedByUserId, payload);
    }
  ),
  createWriteTool(
    "llm_templates.archive",
    "Archive an LLM template.",
    "write.templates",
    {
      type: "object",
      required: ["promptTemplateId", "confirm"],
      properties: {
        promptTemplateId: { type: "string" },
        confirm: { type: "boolean" },
      },
      additionalProperties: false,
    },
    async ({ pool, token }, args) => {
      requireDestructiveConfirmation(token, args);
      const promptTemplateId = readRequiredString(args.promptTemplateId, "promptTemplateId");
      await setTemplateActiveStateWithAudit(
        pool,
        token.issuedByUserId,
        "llm",
        promptTemplateId,
        false
      );
      return {
        ok: true,
        promptTemplateId,
        status: "archived",
      };
    },
    true
  ),
  createWriteTool(
    "llm_templates.delete",
    "Delete an LLM template.",
    "write.templates",
    {
      type: "object",
      required: ["promptTemplateId", "confirm"],
      properties: {
        promptTemplateId: { type: "string" },
        confirm: { type: "boolean" },
      },
      additionalProperties: false,
    },
    async ({ pool, token }, args) => {
      requireDestructiveConfirmation(token, args);
      const promptTemplateId = readRequiredString(args.promptTemplateId, "promptTemplateId");
      await deleteTemplateWithAudit(pool, token.issuedByUserId, "llm", promptTemplateId);
      return {
        ok: true,
        promptTemplateId,
      };
    },
    true
  ),
  createWriteTool(
    "channels.create",
    "Create a channel through the shared control-plane service.",
    "write.channels",
    {
      type: "object",
      required: ["payload"],
      properties: {
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ pool, token }, args) =>
      saveChannelFromPayload(pool, token.issuedByUserId, readPayload(args))
  ),
  createWriteTool(
    "channels.update",
    "Update a channel through the shared control-plane service.",
    "write.channels",
    {
      type: "object",
      required: ["payload"],
      properties: {
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ pool, token }, args) =>
      saveChannelFromPayload(pool, token.issuedByUserId, readPayload(args))
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
        readRequiredString(args.channelId, "channelId")
      );
    },
    true
  ),
  createWriteTool(
    "sequences.create",
    "Create a sequence through the maintenance API.",
    "write.sequences",
    {
      type: "object",
      required: ["payload"],
      properties: {
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      const payload = withActorDefault(readPayload(args), "createdBy", token.issuedByUserId);
      const result = await sdk.createSequence<Record<string, unknown>>(payload);
      await writeMcpMutationAudit(pool, token, {
        actionType: "sequence_created",
        entityType: "sequence",
        entityId: String(result.sequence_id ?? ""),
        payloadJson: {
          title: result.title ?? payload.title ?? null,
        },
      });
      return result;
    }
  ),
  createWriteTool(
    "sequences.update",
    "Update a sequence through the maintenance API.",
    "write.sequences",
    {
      type: "object",
      required: ["sequenceId", "payload"],
      properties: {
        sequenceId: { type: "string" },
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      const sequenceId = readRequiredString(args.sequenceId, "sequenceId");
      const result = await sdk.updateSequence<Record<string, unknown>>(sequenceId, readPayload(args));
      await writeMcpMutationAudit(pool, token, {
        actionType: "sequence_updated",
        entityType: "sequence",
        entityId: sequenceId,
      });
      return result;
    }
  ),
  createWriteTool(
    "sequences.run",
    "Request a sequence run.",
    "write.sequences",
    {
      type: "object",
      required: ["sequenceId"],
      properties: {
        sequenceId: { type: "string" },
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      const sequenceId = readRequiredString(args.sequenceId, "sequenceId");
      const payload =
        args.payload == null
          ? {}
          : readPayload(args);
      const result = await sdk.requestSequenceRun<Record<string, unknown>>(sequenceId, {
        ...payload,
        requestedBy: readOptionalString(payload.requestedBy) ?? token.issuedByUserId,
        triggerMeta:
          payload.triggerMeta != null &&
          typeof payload.triggerMeta === "object" &&
          !Array.isArray(payload.triggerMeta)
            ? {
                ...(payload.triggerMeta as Record<string, unknown>),
                requestedFrom: "mcp",
              }
            : {
                requestedFrom: "mcp",
              },
      });
      await writeMcpMutationAudit(pool, token, {
        actionType: "sequence_run_requested",
        entityType: "sequence_run",
        entityId: String(result.run_id ?? ""),
        payloadJson: {
          sequenceId,
        },
      });
      return result;
    }
  ),
  createWriteTool(
    "sequences.retry_run",
    "Retry a sequence run.",
    "write.sequences",
    {
      type: "object",
      required: ["runId"],
      properties: {
        runId: { type: "string" },
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      const runId = readRequiredString(args.runId, "runId");
      const payload =
        args.payload == null
          ? {}
          : readPayload(args);
      const result = await sdk.retrySequenceRun<Record<string, unknown>>(runId, {
        ...payload,
        requestedBy: readOptionalString(payload.requestedBy) ?? token.issuedByUserId,
        triggerMeta:
          payload.triggerMeta != null &&
          typeof payload.triggerMeta === "object" &&
          !Array.isArray(payload.triggerMeta)
            ? {
                ...(payload.triggerMeta as Record<string, unknown>),
                requestedFrom: "mcp",
              }
            : {
                requestedFrom: "mcp",
              },
      });
      await writeMcpMutationAudit(pool, token, {
        actionType: "sequence_run_retried",
        entityType: "sequence_run",
        entityId: String(result.run_id ?? runId),
      });
      return result;
    }
  ),
  createWriteTool(
    "sequences.cancel_run",
    "Cancel a pending sequence run.",
    "write.sequences",
    {
      type: "object",
      required: ["runId"],
      properties: {
        runId: { type: "string" },
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      const runId = readRequiredString(args.runId, "runId");
      const payload = args.payload == null ? {} : readPayload(args);
      const result = await sdk.cancelSequenceRun<Record<string, unknown>>(runId, payload);
      await writeMcpMutationAudit(pool, token, {
        actionType: "sequence_run_cancelled",
        entityType: "sequence_run",
        entityId: runId,
      });
      return result;
    }
  ),
  createWriteTool(
    "sequences.archive",
    "Archive a sequence.",
    "write.sequences",
    {
      type: "object",
      required: ["sequenceId", "confirm"],
      properties: {
        sequenceId: { type: "string" },
        confirm: { type: "boolean" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      requireDestructiveConfirmation(token, args);
      const sequenceId = readRequiredString(args.sequenceId, "sequenceId");
      const result = await sdk.archiveSequence<Record<string, unknown>>(sequenceId);
      await writeMcpMutationAudit(pool, token, {
        actionType: "sequence_archived",
        entityType: "sequence",
        entityId: sequenceId,
      });
      return result;
    },
    true
  ),
  createWriteTool(
    "discovery.profiles.create",
    "Create a discovery profile.",
    "write.discovery",
    {
      type: "object",
      required: ["payload"],
      properties: {
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      const payload = withActorDefault(readPayload(args), "createdBy", token.issuedByUserId);
      const result = await sdk.createDiscoveryProfile<Record<string, unknown>>(payload);
      await writeMcpMutationAudit(pool, token, {
        actionType: "discovery_profile_created",
        entityType: "discovery_policy_profile",
        entityId: String(result.profile_id ?? ""),
      });
      return result;
    }
  ),
  createWriteTool(
    "discovery.profiles.update",
    "Update a discovery profile.",
    "write.discovery",
    {
      type: "object",
      required: ["profileId", "payload"],
      properties: {
        profileId: { type: "string" },
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      const profileId = readRequiredString(args.profileId, "profileId");
      const result = await sdk.updateDiscoveryProfile<Record<string, unknown>>(
        profileId,
        readPayload(args)
      );
      await writeMcpMutationAudit(pool, token, {
        actionType: "discovery_profile_updated",
        entityType: "discovery_policy_profile",
        entityId: profileId,
      });
      return result;
    }
  ),
  createWriteTool(
    "discovery.profiles.archive",
    "Archive a discovery profile.",
    "write.discovery",
    {
      type: "object",
      required: ["profileId", "confirm"],
      properties: {
        profileId: { type: "string" },
        confirm: { type: "boolean" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      requireDestructiveConfirmation(token, args);
      const profileId = readRequiredString(args.profileId, "profileId");
      const result = await sdk.updateDiscoveryProfile<Record<string, unknown>>(profileId, {
        status: "archived",
      });
      await writeMcpMutationAudit(pool, token, {
        actionType: "discovery_profile_archived",
        entityType: "discovery_policy_profile",
        entityId: profileId,
      });
      return result;
    },
    true
  ),
  createWriteTool(
    "discovery.missions.create",
    "Create a discovery mission.",
    "write.discovery",
    {
      type: "object",
      required: ["payload"],
      properties: {
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      const payload = withActorDefault(readPayload(args), "createdBy", token.issuedByUserId);
      const result = await sdk.createDiscoveryMission<Record<string, unknown>>(payload);
      await writeMcpMutationAudit(pool, token, {
        actionType: "discovery_mission_created",
        entityType: "discovery_mission",
        entityId: String(result.mission_id ?? ""),
      });
      return result;
    }
  ),
  createWriteTool(
    "discovery.missions.update",
    "Update a discovery mission.",
    "write.discovery",
    {
      type: "object",
      required: ["missionId", "payload"],
      properties: {
        missionId: { type: "string" },
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      const missionId = readRequiredString(args.missionId, "missionId");
      const result = await sdk.updateDiscoveryMission<Record<string, unknown>>(
        missionId,
        readPayload(args)
      );
      await writeMcpMutationAudit(pool, token, {
        actionType: "discovery_mission_updated",
        entityType: "discovery_mission",
        entityId: missionId,
      });
      return result;
    }
  ),
  createWriteTool(
    "discovery.missions.compile_graph",
    "Compile the graph for a discovery mission.",
    "write.discovery",
    {
      type: "object",
      required: ["missionId"],
      properties: {
        missionId: { type: "string" },
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      const missionId = readRequiredString(args.missionId, "missionId");
      const payload = args.payload == null ? {} : readPayload(args);
      const result = await sdk.compileDiscoveryMissionGraph<Record<string, unknown>>(
        missionId,
        payload
      );
      await writeMcpMutationAudit(pool, token, {
        actionType: "discovery_graph_compiled",
        entityType: "discovery_mission",
        entityId: missionId,
      });
      return result;
    }
  ),
  createWriteTool(
    "discovery.missions.run",
    "Run a discovery mission.",
    "write.discovery",
    {
      type: "object",
      required: ["missionId"],
      properties: {
        missionId: { type: "string" },
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      const missionId = readRequiredString(args.missionId, "missionId");
      const payload = args.payload == null ? {} : readPayload(args);
      const result = await sdk.runDiscoveryMission<Record<string, unknown>>(missionId, {
        ...payload,
        requestedBy: readOptionalString(payload.requestedBy) ?? token.issuedByUserId,
      });
      await writeMcpMutationAudit(pool, token, {
        actionType: "discovery_mission_run_requested",
        entityType: "discovery_mission",
        entityId: missionId,
      });
      return result;
    }
  ),
  createWriteTool(
    "discovery.missions.archive",
    "Archive a discovery mission.",
    "write.discovery",
    {
      type: "object",
      required: ["missionId", "confirm"],
      properties: {
        missionId: { type: "string" },
        confirm: { type: "boolean" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      requireDestructiveConfirmation(token, args);
      const missionId = readRequiredString(args.missionId, "missionId");
      const result = await sdk.updateDiscoveryMission<Record<string, unknown>>(missionId, {
        status: "archived",
      });
      await writeMcpMutationAudit(pool, token, {
        actionType: "discovery_mission_archived",
        entityType: "discovery_mission",
        entityId: missionId,
      });
      return result;
    },
    true
  ),
  createWriteTool(
    "discovery.classes.create",
    "Create a discovery class.",
    "write.discovery",
    {
      type: "object",
      required: ["payload"],
      properties: {
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      const result = await sdk.createDiscoveryClass<Record<string, unknown>>(readPayload(args));
      await writeMcpMutationAudit(pool, token, {
        actionType: "discovery_class_created",
        entityType: "discovery_hypothesis_class",
        entityId: String(result.class_key ?? ""),
      });
      return result;
    }
  ),
  createWriteTool(
    "discovery.classes.update",
    "Update a discovery class.",
    "write.discovery",
    {
      type: "object",
      required: ["classKey", "payload"],
      properties: {
        classKey: { type: "string" },
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      const classKey = readRequiredString(args.classKey, "classKey");
      const result = await sdk.updateDiscoveryClass<Record<string, unknown>>(
        classKey,
        readPayload(args)
      );
      await writeMcpMutationAudit(pool, token, {
        actionType: "discovery_class_updated",
        entityType: "discovery_hypothesis_class",
        entityId: classKey,
      });
      return result;
    }
  ),
  createWriteTool(
    "discovery.classes.archive",
    "Archive a discovery class.",
    "write.discovery",
    {
      type: "object",
      required: ["classKey", "confirm"],
      properties: {
        classKey: { type: "string" },
        confirm: { type: "boolean" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      requireDestructiveConfirmation(token, args);
      const classKey = readRequiredString(args.classKey, "classKey");
      const result = await sdk.updateDiscoveryClass<Record<string, unknown>>(classKey, {
        status: "archived",
      });
      await writeMcpMutationAudit(pool, token, {
        actionType: "discovery_class_archived",
        entityType: "discovery_hypothesis_class",
        entityId: classKey,
      });
      return result;
    },
    true
  ),
  createWriteTool(
    "discovery.recall_missions.create",
    "Create a recall mission.",
    "write.discovery",
    {
      type: "object",
      required: ["payload"],
      properties: {
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      const payload = withActorDefault(readPayload(args), "createdBy", token.issuedByUserId);
      const result = await sdk.createDiscoveryRecallMission<Record<string, unknown>>(payload);
      await writeMcpMutationAudit(pool, token, {
        actionType: "discovery_recall_mission_created",
        entityType: "discovery_recall_mission",
        entityId: String(result.recall_mission_id ?? ""),
      });
      return result;
    }
  ),
  createWriteTool(
    "discovery.recall_missions.update",
    "Update a recall mission.",
    "write.discovery",
    {
      type: "object",
      required: ["recallMissionId", "payload"],
      properties: {
        recallMissionId: { type: "string" },
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      const recallMissionId = readRequiredString(args.recallMissionId, "recallMissionId");
      const result = await sdk.updateDiscoveryRecallMission<Record<string, unknown>>(
        recallMissionId,
        readPayload(args)
      );
      await writeMcpMutationAudit(pool, token, {
        actionType: "discovery_recall_mission_updated",
        entityType: "discovery_recall_mission",
        entityId: recallMissionId,
      });
      return result;
    }
  ),
  createWriteTool(
    "discovery.recall_missions.acquire",
    "Request acquisition for a recall mission.",
    "write.discovery",
    {
      type: "object",
      required: ["recallMissionId"],
      properties: {
        recallMissionId: { type: "string" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      const recallMissionId = readRequiredString(args.recallMissionId, "recallMissionId");
      const result = await sdk.requestDiscoveryRecallMissionAcquire<Record<string, unknown>>(
        recallMissionId
      );
      await writeMcpMutationAudit(pool, token, {
        actionType: "discovery_recall_mission_acquired",
        entityType: "discovery_recall_mission",
        entityId: recallMissionId,
      });
      return result;
    }
  ),
  createWriteTool(
    "discovery.recall_missions.pause",
    "Pause a recall mission.",
    "write.discovery",
    {
      type: "object",
      required: ["recallMissionId", "confirm"],
      properties: {
        recallMissionId: { type: "string" },
        confirm: { type: "boolean" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      requireDestructiveConfirmation(token, args);
      const recallMissionId = readRequiredString(args.recallMissionId, "recallMissionId");
      const result = await sdk.updateDiscoveryRecallMission<Record<string, unknown>>(
        recallMissionId,
        {
          status: "paused",
        }
      );
      await writeMcpMutationAudit(pool, token, {
        actionType: "discovery_recall_mission_paused",
        entityType: "discovery_recall_mission",
        entityId: recallMissionId,
      });
      return result;
    },
    true
  ),
  createWriteTool(
    "discovery.recall_candidates.create",
    "Create a recall candidate.",
    "write.discovery",
    {
      type: "object",
      required: ["payload"],
      properties: {
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      const result = await sdk.createDiscoveryRecallCandidate<Record<string, unknown>>(
        readPayload(args)
      );
      await writeMcpMutationAudit(pool, token, {
        actionType: "discovery_recall_candidate_created",
        entityType: "discovery_recall_candidate",
        entityId: String(result.recall_candidate_id ?? ""),
      });
      return result;
    }
  ),
  createWriteTool(
    "discovery.recall_candidates.update",
    "Update a recall candidate.",
    "write.discovery",
    {
      type: "object",
      required: ["recallCandidateId", "payload"],
      properties: {
        recallCandidateId: { type: "string" },
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      const recallCandidateId = readRequiredString(
        args.recallCandidateId,
        "recallCandidateId"
      );
      const result = await sdk.updateDiscoveryRecallCandidate<Record<string, unknown>>(
        recallCandidateId,
        readPayload(args)
      );
      await writeMcpMutationAudit(pool, token, {
        actionType: "discovery_recall_candidate_updated",
        entityType: "discovery_recall_candidate",
        entityId: recallCandidateId,
      });
      return result;
    }
  ),
  createWriteTool(
    "discovery.recall_candidates.promote",
    "Promote a recall candidate into the normal source graph.",
    "write.discovery",
    {
      type: "object",
      required: ["recallCandidateId"],
      properties: {
        recallCandidateId: { type: "string" },
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      const recallCandidateId = readRequiredString(
        args.recallCandidateId,
        "recallCandidateId"
      );
      const payload = args.payload == null ? {} : readPayload(args);
      const result = await sdk.promoteDiscoveryRecallCandidate<Record<string, unknown>>(
        recallCandidateId,
        {
          ...payload,
          reviewedBy: readOptionalString(payload.reviewedBy) ?? token.issuedByUserId,
          enabled:
            typeof payload.enabled === "boolean"
              ? payload.enabled
              : true,
        }
      );
      await writeMcpMutationAudit(pool, token, {
        actionType: "discovery_recall_candidate_promoted",
        entityType: "discovery_recall_candidate",
        entityId: recallCandidateId,
      });
      return result;
    }
  ),
  createWriteTool(
    "discovery.candidates.review",
    "Review a discovery candidate.",
    "write.discovery",
    {
      type: "object",
      required: ["candidateId", "payload"],
      properties: {
        candidateId: { type: "string" },
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      const candidateId = readRequiredString(args.candidateId, "candidateId");
      const payload = withActorDefault(readPayload(args), "reviewedBy", token.issuedByUserId);
      const result = await sdk.updateDiscoveryCandidate<Record<string, unknown>>(candidateId, payload);
      await writeMcpMutationAudit(pool, token, {
        actionType: "discovery_candidate_reviewed",
        entityType: "discovery_candidate",
        entityId: candidateId,
      });
      return result;
    }
  ),
  createWriteTool(
    "discovery.feedback.create",
    "Create a discovery feedback event.",
    "write.discovery",
    {
      type: "object",
      required: ["payload"],
      properties: {
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      const payload = withActorDefault(readPayload(args), "createdBy", token.issuedByUserId);
      const result = await sdk.createDiscoveryFeedback<Record<string, unknown>>(payload);
      await writeMcpMutationAudit(pool, token, {
        actionType: "discovery_feedback_submitted",
        entityType: "discovery_feedback_event",
        entityId: null,
      });
      return result;
    }
  ),
  createWriteTool(
    "discovery.re_evaluate",
    "Request discovery source re-evaluation.",
    "write.discovery",
    {
      type: "object",
      properties: {
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      const payload = args.payload == null ? {} : readPayload(args);
      const result = await sdk.reEvaluateDiscoverySources<Record<string, unknown>>(payload);
      await writeMcpMutationAudit(pool, token, {
        actionType: "discovery_re_evaluation_requested",
        entityType: "discovery_mission",
        entityId: readOptionalString(payload.missionId),
      });
      return result;
    }
  ),
] as const;

export function listMcpTools() {
  return MCP_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
}

export function resolveMcpTool(name: string): McpToolDefinition {
  const normalized = readRequiredString(name, "name");
  const tool = MCP_TOOLS.find((entry) => entry.name === normalized);
  if (!tool) {
    throw new JsonRpcError(-32601, `Unknown MCP tool "${normalized}".`, {
      statusCode: 404,
    });
  }
  return tool;
}

export async function executeMcpTool(
  context: McpToolContext,
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const tool = resolveMcpTool(name);
  await requireScope(context.token, tool.requiredScope);
  if (tool.destructive) {
    requireDestructiveConfirmation(context.token, args);
  }
  return tool.handler(context, args);
}
