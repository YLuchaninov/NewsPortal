import {
  createReadTool,
  pagingSchema,
  detailSchema,
  contentDetailSchema,
  readPageArgs,
  readOptionalContentSort,
  shapeContentLikeRecord,
  shapePaginatedContentItems,
  shapeExplainPayload,
  readOptionalString,
  readRequiredString,
  type McpToolDefinition
} from "./shared";

export const CONTENT_MCP_TOOLS: readonly McpToolDefinition[] = [
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
    "llm_budget.summary",
    "Read the LLM budget summary.",
    { type: "object", additionalProperties: false },
    async ({ sdk }) => sdk.getLlmBudgetSummary<Record<string, unknown>>()
  ),
] as const;
