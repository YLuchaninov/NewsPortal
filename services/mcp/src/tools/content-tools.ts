import {
  createReadTool,
  readPageArgs,
  readOptionalContentSort,
  shapeContentLikeRecord,
  shapePaginatedContentItems,
  shapeExplainPayload,
  JsonRpcError,
  readAliasedRequiredString,
  readOptionalString,
  resolveUniqueUuidPrefix,
  type McpToolDefinition
} from "./shared";
import {
  buildSignalCandidateHoldQualitySummary,
  explainSignalCandidateHoldQuality,
  listSignalCandidateHoldQuality,
} from "../operating-intelligence";

type QueryablePool = Parameters<McpToolDefinition["handler"]>[0]["pool"];

const signalCandidateDetailSchema = {
  type: "object",
  properties: {
    docId: { type: "string" },
    signalCandidateId: { type: "string" },
    canonicalId: { type: "string" },
    id: { type: "string" },
    entityId: { type: "string" },
    includeBody: { type: "boolean" },
    includeBodyHtml: { type: "boolean" },
    includeRawPayload: { type: "boolean" },
    includeMediaAssets: { type: "boolean" },
  },
  additionalProperties: false,
} as const;

const contentItemReadSchema = {
  type: "object",
  properties: {
    contentItemId: { type: "string" },
    docId: { type: "string" },
    signalCandidateId: { type: "string" },
    canonicalId: { type: "string" },
    resourceId: { type: "string" },
    id: { type: "string" },
    entityId: { type: "string" },
    includeBody: { type: "boolean" },
    includeBodyHtml: { type: "boolean" },
    includeRawPayload: { type: "boolean" },
    includeMediaAssets: { type: "boolean" },
  },
  additionalProperties: false,
} as const;

const webResourceDetailSchema = {
  type: "object",
  properties: {
    resourceId: { type: "string" },
    id: { type: "string" },
    entityId: { type: "string" },
  },
  additionalProperties: false,
} as const;

const signalCandidateHoldsListSchema = {
  type: "object",
  properties: {
    page: { type: "number" },
    pageSize: { type: "number" },
    candidateSignalTier: { type: "string" },
    downstreamLossBucket: { type: "string" },
    verificationState: { type: "string" },
    docIds: { type: "array", items: { type: "string" } },
    q: { type: "string" },
  },
  additionalProperties: false,
} as const;

const signalCandidateListSchema = {
  type: "object",
  properties: {
    page: { type: "number" },
    pageSize: { type: "number" },
    channelId: { type: "string" },
    q: { type: "string" },
  },
  additionalProperties: false,
} as const;

const signalCandidateHoldExplainSchema = {
  type: "object",
  required: ["docId"],
  properties: {
    docId: { type: "string" },
    id: { type: "string" },
  },
  additionalProperties: false,
} as const;

async function resolveSignalCandidateDocIdArgument(
  pool: QueryablePool,
  args: Record<string, unknown>
): Promise<string> {
  const docId = await resolveUniqueUuidPrefix(
    pool,
    readAliasedRequiredString(args, "docId", ["signalCandidateId", "canonicalId", "id", "entityId"]),
    {
      path: "docId",
      tableName: "signal_candidates",
      columnName: "doc_id",
      label: "SignalCandidate",
    }
  );
  if (!docId) {
    throw new JsonRpcError(-32602, "docId is required.", {
      statusCode: 400,
      data: { path: "docId" },
    });
  }
  return docId;
}

async function resolveWebResourceIdArgument(
  pool: QueryablePool,
  args: Record<string, unknown>
): Promise<string> {
  const resourceId = await resolveUniqueUuidPrefix(
    pool,
    readAliasedRequiredString(args, "resourceId", ["id", "entityId"]),
    {
      path: "resourceId",
      tableName: "web_resources",
      columnName: "resource_id",
      label: "Web resource",
    }
  );
  if (!resourceId) {
    throw new JsonRpcError(-32602, "resourceId is required.", {
      statusCode: 400,
      data: { path: "resourceId" },
    });
  }
  return resourceId;
}

async function resolveContentItemIdArgument(
  pool: QueryablePool,
  args: Record<string, unknown>
): Promise<string> {
  const direct =
    readOptionalString(args.contentItemId) ??
    readOptionalString(args.id) ??
    readOptionalString(args.entityId);
  if (direct?.includes(":")) {
    return direct;
  }
  if (args.resourceId != null) {
    return `resource:${await resolveWebResourceIdArgument(pool, args)}`;
  }
  if (args.docId != null || args.signalCandidateId != null || args.canonicalId != null) {
    return `signal_candidate:${await resolveSignalCandidateDocIdArgument(pool, args)}`;
  }
  if (direct) {
    return `signal_candidate:${await resolveSignalCandidateDocIdArgument(pool, { docId: direct })}`;
  }
  throw new JsonRpcError(
    -32602,
    "contentItemId is required. Accepted aliases: docId, signalCandidateId, canonicalId, resourceId, id, entityId.",
    {
      statusCode: 400,
      data: {
        path: "contentItemId",
        acceptedAliases: [
          "contentItemId",
          "docId",
          "signalCandidateId",
          "canonicalId",
          "resourceId",
          "id",
          "entityId",
        ],
      },
    }
  );
}

export const CONTENT_MCP_TOOLS: readonly McpToolDefinition[] = [
  createReadTool(
    "signal_candidates.list",
    "List editorial signal_candidate observations from the maintenance API.",
    signalCandidateListSchema,
    async ({ sdk }, args) =>
      shapePaginatedContentItems(
        await sdk.listSignalCandidatesPage<Record<string, unknown>>({
          ...readPageArgs(args),
          channelId: readOptionalString(args.channelId) ?? undefined,
          q: readOptionalString(args.q) ?? undefined,
        }),
        args
      )
  ),
  createReadTool(
    "signal_candidates.read",
    "Read one editorial signal_candidate observation with compact defaults. Prefer docId; signalCandidateId/canonicalId/id/entityId and unique UUID prefixes from reports are accepted for read-back.",
    signalCandidateDetailSchema,
    async ({ sdk, pool }, args) =>
      shapeContentLikeRecord(
        await sdk.getSignalCandidate<Record<string, unknown>>(
          await resolveSignalCandidateDocIdArgument(pool, args)
        ),
        args
      )
  ),
  createReadTool(
    "signal_candidates.explain",
    "Read signal_candidate-level selection diagnostics, filter evidence, and verification context. Prefer docId; signalCandidateId/canonicalId/id/entityId and unique UUID prefixes from reports are accepted for read-back.",
    signalCandidateDetailSchema,
    async ({ sdk, pool }, args) =>
      shapeExplainPayload(
        await sdk.getSignalCandidateExplain<Record<string, unknown>>(
          await resolveSignalCandidateDocIdArgument(pool, args)
        ),
        "signal_candidate",
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
        channelId: { type: "string" },
      },
      additionalProperties: false,
    },
    async ({ sdk }, args) =>
      shapePaginatedContentItems(
        await sdk.listContentItemsPage<Record<string, unknown>>({
          ...readPageArgs(args),
          sort: readOptionalContentSort(args.sort),
          q: readOptionalString(args.q) ?? undefined,
          channelId: readOptionalString(args.channelId) ?? undefined,
        }),
        args
      )
  ),
  createReadTool(
    "content_items.read",
    "Read one content item with compact defaults. Prefer contentItemId; docId/signalCandidateId/canonicalId/resourceId/id/entityId and unique UUID prefixes from reports are accepted for read-back.",
    contentItemReadSchema,
    async ({ sdk, pool }, args) =>
      shapeContentLikeRecord(
        await sdk.getContentItem<Record<string, unknown>>(
          await resolveContentItemIdArgument(pool, args)
        ),
        args
      )
  ),
  createReadTool(
    "content_items.explain",
    "Read content-item explainability including selection diagnostics and guidance. Prefer contentItemId; docId/signalCandidateId/canonicalId/resourceId/id/entityId and unique UUID prefixes from reports are accepted for read-back.",
    contentItemReadSchema,
    async ({ sdk, pool }, args) =>
      shapeExplainPayload(
        await sdk.getContentItemExplain<Record<string, unknown>>(
          await resolveContentItemIdArgument(pool, args)
        ),
        "content_item",
        args
      )
  ),
  createReadTool(
    "signal_candidates.residuals.list",
    "List signal_candidate residual buckets for tuning and operator diagnosis.",
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
        await sdk.listSignalCandidateResidualsPage<Record<string, unknown>>({
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
    "signal_candidates.residuals.summary",
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
      sdk.getSignalCandidateResidualSummary<Record<string, unknown>>({
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
    "signal_candidates.holds.summary",
    "Read DB-backed hold-quality counts split by candidate-signal tier, downstream bucket, verification state, and LLM-review pressure.",
    signalCandidateHoldsListSchema,
    async (context, args) => buildSignalCandidateHoldQualitySummary(context, args)
  ),
  createReadTool(
    "signal_candidates.holds.list",
    "List held signal_candidate candidates with candidate-signal tier/evidence so replay chunks can target buyer_intent/project_intent instead of context-only noise.",
    signalCandidateHoldsListSchema,
    async (context, args) => listSignalCandidateHoldQuality(context, args)
  ),
  createReadTool(
    "signal_candidates.holds.explain",
    "Explain one held signal_candidate candidate using final_selection_results and interest_filter_results candidateSignals evidence.",
    signalCandidateHoldExplainSchema,
    async (context, args) => explainSignalCandidateHoldQuality(context, args)
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
    "Read one web resource. Prefer resourceId; id/entityId and unique UUID prefixes from reports are accepted for read-back.",
    webResourceDetailSchema,
    async ({ sdk, pool }, args) =>
      sdk.getWebResource<Record<string, unknown>>(
        await resolveWebResourceIdArgument(pool, args)
      )
  ),
  createReadTool(
    "llm_budget.summary",
    "Read the LLM budget summary.",
    { type: "object", additionalProperties: false },
    async ({ sdk }) => sdk.getLlmBudgetSummary<Record<string, unknown>>()
  ),
] as const;
