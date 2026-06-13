import {
  getMcpTokenAllowedFunnelIds,
  listFunnelContentItems,
  readFunnelContentAttribution,
} from "@signalops/control-plane";

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
  requireMcpTokenFunnelAccess,
  resolveUniqueUuidPrefix,
  type McpAccessTokenRecord,
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
    funnelId: { type: "string" },
    laneId: { type: "string" },
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
    funnelId: { type: "string" },
    laneId: { type: "string" },
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

const llmBudgetSummarySchema = {
  type: "object",
  properties: {
    funnelId: { type: "string" },
    laneId: { type: "string" },
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
    funnelId: { type: "string" },
    laneId: { type: "string" },
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

function readFunnelContentScope(token: McpAccessTokenRecord, args: Record<string, unknown>) {
  const funnelId = readOptionalString(args.funnelId);
  requireMcpTokenFunnelAccess(token, funnelId);
  return {
    funnelId,
    laneId: readOptionalString(args.laneId),
    allowedFunnelIds: getMcpTokenAllowedFunnelIds(token),
  };
}

function readFunnelAwareReadScope(token: McpAccessTokenRecord, args: Record<string, unknown>) {
  const funnelId = readOptionalString(args.funnelId);
  const laneId = readOptionalString(args.laneId);
  const allowedFunnelIds = getMcpTokenAllowedFunnelIds(token);
  if (funnelId) {
    requireMcpTokenFunnelAccess(token, funnelId);
    return { funnelId, laneId, allowedFunnelIds };
  }
  if (allowedFunnelIds.length === 1) {
    return { funnelId: allowedFunnelIds[0], laneId, allowedFunnelIds };
  }
  if (allowedFunnelIds.length > 1) {
    throw new JsonRpcError(
      -32004,
      "This MCP token is bound to multiple funnels; pass funnelId for a scoped operator read.",
      {
        statusCode: 403,
        data: {
          path: "funnelId",
          allowedFunnelIds,
          requiredAction:
            "Pass funnelId so the read cannot be mistaken for global operator state.",
        },
      }
    );
  }
  return { funnelId: null, laneId, allowedFunnelIds };
}

async function readFunnelLlmBudgetParticipation(
  pool: QueryablePool,
  scope: ReturnType<typeof readFunnelAwareReadScope>
): Promise<Record<string, unknown> | null> {
  if (!scope.funnelId && !scope.laneId) {
    return null;
  }
  const params: string[] = [];
  const clauses: string[] = [];
  if (scope.funnelId) {
    params.push(scope.funnelId);
    clauses.push(`ftb.funnel_id = $${params.length}::uuid`);
  }
  if (scope.laneId) {
    params.push(scope.laneId);
    clauses.push(`ftb.lane_id = $${params.length}::uuid`);
  }
  const participation = await pool.query(
    `
      select
        max(ofn.name) as "funnelName",
        max(fl.name) as "laneName",
        count(distinct ftb.prompt_template_id)::int as "boundTemplateCount",
        count(distinct lrl.review_id)::int as "reviewLogCount",
        count(distinct lrl.doc_id)::int as "reviewedDocCount",
        count(distinct lrl.review_id) filter (where lrl.decision = 'approve')::int as "approveCount",
        count(distinct lrl.review_id) filter (where lrl.decision = 'reject')::int as "rejectCount",
        count(distinct lrl.review_id) filter (where lrl.decision = 'uncertain')::int as "uncertainCount",
        coalesce(sum(coalesce(lrl.total_tokens, 0)), 0)::int as "totalTokens",
        coalesce(sum(coalesce(lrl.cost_estimate_usd, 0)), 0)::float as "estimatedCostUsd",
        max(lrl.created_at) as "lastReviewAt"
      from funnel_template_bindings ftb
      left join operator_funnels ofn on ofn.funnel_id = ftb.funnel_id
      left join funnel_lanes fl on fl.lane_id = ftb.lane_id
      left join llm_review_log lrl on lrl.prompt_template_id = ftb.prompt_template_id
      where ${clauses.join(" and ")}
    `,
    params
  );
  return participation.rows[0] ?? {};
}

function shouldUseFunnelContentScope(
  token: McpAccessTokenRecord,
  args: Record<string, unknown>
): boolean {
  return Boolean(
    readOptionalString(args.funnelId) ||
      readOptionalString(args.laneId) ||
      getMcpTokenAllowedFunnelIds(token).length > 0
  );
}

async function readScopedDocAttributionOrThrow(
  pool: QueryablePool,
  token: McpAccessTokenRecord,
  args: Record<string, unknown>,
  docId: string
): Promise<Array<Record<string, unknown>> | null> {
  if (!shouldUseFunnelContentScope(token, args)) {
    return null;
  }
  const scope = readFunnelContentScope(token, args);
  const attribution = await readFunnelContentAttribution(pool, {
    ...scope,
    docId,
  });
  if (attribution.length === 0) {
    throw new JsonRpcError(
      -32004,
      "The requested content item is not visible in the requested MCP funnel scope.",
      {
        statusCode: 403,
        data: {
          path: "docId",
          docId,
          funnelId: scope.funnelId ?? null,
          laneId: scope.laneId ?? null,
          requiredAction:
            "Use a token bound to the matching funnel, pass the correct funnelId/laneId, or read the item with an unrestricted operator token.",
        },
      }
    );
  }
  return attribution;
}

function withFunnelAttribution<T extends Record<string, unknown>>(
  payload: T,
  attribution: Array<Record<string, unknown>> | null
): T {
  return attribution ? ({ ...payload, funnelAttribution: attribution } as T) : payload;
}

export const CONTENT_MCP_TOOLS: readonly McpToolDefinition[] = [
  createReadTool(
    "signal_candidates.list",
    "List editorial signal_candidate observations from the maintenance API.",
    signalCandidateListSchema,
    async ({ sdk, pool, token }, args) => {
      if (shouldUseFunnelContentScope(token, args)) {
        return listFunnelContentItems(pool, {
          ...readFunnelContentScope(token, args),
          ...readPageArgs(args),
          channelId: readOptionalString(args.channelId),
          q: readOptionalString(args.q),
        });
      }
      return shapePaginatedContentItems(
        await sdk.listSignalCandidatesPage<Record<string, unknown>>({
          ...readPageArgs(args),
          channelId: readOptionalString(args.channelId) ?? undefined,
          q: readOptionalString(args.q) ?? undefined,
        }),
        args
      );
    }
  ),
  createReadTool(
    "signal_candidates.read",
    "Read one editorial signal_candidate observation with compact defaults. Prefer docId; signalCandidateId/canonicalId/id/entityId and unique UUID prefixes from reports are accepted for read-back.",
    signalCandidateDetailSchema,
    async ({ sdk, pool, token }, args) => {
      const docId = await resolveSignalCandidateDocIdArgument(pool, args);
      const attribution = await readScopedDocAttributionOrThrow(pool, token, args, docId);
      return withFunnelAttribution(
        shapeContentLikeRecord(await sdk.getSignalCandidate<Record<string, unknown>>(docId), args) ?? {},
        attribution
      );
    }
  ),
  createReadTool(
    "signal_candidates.explain",
    "Read signal_candidate-level selection diagnostics, filter evidence, and verification context. Prefer docId; signalCandidateId/canonicalId/id/entityId and unique UUID prefixes from reports are accepted for read-back.",
    signalCandidateDetailSchema,
    async ({ sdk, pool, token }, args) => {
      const docId = await resolveSignalCandidateDocIdArgument(pool, args);
      const attribution = await readScopedDocAttributionOrThrow(pool, token, args, docId);
      return withFunnelAttribution(
        shapeExplainPayload(await sdk.getSignalCandidateExplain<Record<string, unknown>>(docId), "signal_candidate", args),
        attribution
      );
    }
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
        funnelId: { type: "string" },
        laneId: { type: "string" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      if (shouldUseFunnelContentScope(token, args)) {
        return listFunnelContentItems(pool, {
          ...readFunnelContentScope(token, args),
          ...readPageArgs(args),
          selectedOnly: true,
          sort: readOptionalContentSort(args.sort),
          q: readOptionalString(args.q),
          channelId: readOptionalString(args.channelId),
        });
      }
      return shapePaginatedContentItems(
        await sdk.listContentItemsPage<Record<string, unknown>>({
          ...readPageArgs(args),
          sort: readOptionalContentSort(args.sort),
          q: readOptionalString(args.q) ?? undefined,
          channelId: readOptionalString(args.channelId) ?? undefined,
        }),
        args
      );
    }
  ),
  createReadTool(
    "content_items.read",
    "Read one content item with compact defaults. Prefer contentItemId; docId/signalCandidateId/canonicalId/resourceId/id/entityId and unique UUID prefixes from reports are accepted for read-back.",
    contentItemReadSchema,
    async ({ sdk, pool, token }, args) => {
      const contentItemId = await resolveContentItemIdArgument(pool, args);
      const docId = contentItemId.startsWith("signal_candidate:")
        ? contentItemId.slice("signal_candidate:".length)
        : null;
      const attribution = docId
        ? await readScopedDocAttributionOrThrow(pool, token, args, docId)
        : null;
      if (!docId && shouldUseFunnelContentScope(token, args)) {
        throw new JsonRpcError(
          -32004,
          "Funnel-scoped content read requires a signal_candidate docId-backed content item.",
          { statusCode: 403, data: { path: "contentItemId" } }
        );
      }
      return withFunnelAttribution(
        shapeContentLikeRecord(await sdk.getContentItem<Record<string, unknown>>(contentItemId), args) ?? {},
        attribution
      );
    }
  ),
  createReadTool(
    "content_items.explain",
    "Read content-item explainability including selection diagnostics and guidance. Prefer contentItemId; docId/signalCandidateId/canonicalId/resourceId/id/entityId and unique UUID prefixes from reports are accepted for read-back.",
    contentItemReadSchema,
    async ({ sdk, pool, token }, args) => {
      const contentItemId = await resolveContentItemIdArgument(pool, args);
      const docId = contentItemId.startsWith("signal_candidate:")
        ? contentItemId.slice("signal_candidate:".length)
        : null;
      const attribution = docId
        ? await readScopedDocAttributionOrThrow(pool, token, args, docId)
        : null;
      if (!docId && shouldUseFunnelContentScope(token, args)) {
        throw new JsonRpcError(
          -32004,
          "Funnel-scoped content explain requires a signal_candidate docId-backed content item.",
          { statusCode: 403, data: { path: "contentItemId" } }
        );
      }
      return withFunnelAttribution(
        shapeExplainPayload(await sdk.getContentItemExplain<Record<string, unknown>>(contentItemId), "content_item", args),
        attribution
      );
    }
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
    "Read the LLM budget summary. Optional Funnel Autopilot context returns funnel-bound template/review participation while the budget account remains global.",
    llmBudgetSummarySchema,
    async ({ sdk, pool, token }, args) => {
      const scope = readFunnelAwareReadScope(token, args);
      const summary = await sdk.getLlmBudgetSummary<Record<string, unknown>>();
      const base =
        summary != null && typeof summary === "object" && !Array.isArray(summary)
          ? summary
          : { summary };
      const participation = await readFunnelLlmBudgetParticipation(pool, scope);
      if (!participation) {
        return base;
      }
      return {
        ...base,
        funnelScope: {
          funnelId: scope.funnelId,
          laneId: scope.laneId,
          accountingMode: "global_budget_with_funnel_template_participation",
          warning:
            "LLM budget limits are global. Funnel scope shows bound template/review participation and must not be read as an isolated per-funnel budget cap.",
          participation,
        },
      };
    }
  ),
] as const;
