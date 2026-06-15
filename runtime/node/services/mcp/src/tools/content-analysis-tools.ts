import { MCP_CONTENT_ANALYSIS_ARGUMENT_SCHEMAS } from "@signalops/contracts";

import {
  JsonRpcError,
  createReadTool,
  createWriteTool,
  detailSchema,
  pagingSchema,
  readBooleanFlag,
  readOptionalString,
  readPageArgs,
  readPayload,
  readRequiredString,
  writeMcpMutationAudit,
  type McpToolDefinition,
} from "./shared";
import { normalizeContentAnalysisBackfillPayload } from "./content-analysis-helpers";

export const CONTENT_ANALYSIS_MCP_TOOLS: readonly McpToolDefinition[] = [
  createReadTool(
    "content_analysis.list",
    "List persisted content analysis results.",
    {
      type: "object",
      properties: {
        page: { type: "number" },
        pageSize: { type: "number" },
        subjectType: { type: "string" },
        subjectId: { type: "string" },
        analysisType: { type: "string" },
        status: { type: "string" },
      },
      additionalProperties: false,
    },
    async ({ sdk }, args) =>
      sdk.listContentAnalysisResultsPage<Record<string, unknown>>({
        ...readPageArgs(args),
        subjectType: readOptionalString(args.subjectType) ?? undefined,
        subjectId: readOptionalString(args.subjectId) ?? undefined,
        analysisType: readOptionalString(args.analysisType) ?? undefined,
        status: readOptionalString(args.status) ?? undefined,
      })
  ),
  createReadTool(
    "content_analysis.read",
    "Read one persisted content analysis result.",
    detailSchema,
    async ({ sdk }, args) =>
      sdk.getContentAnalysisResult<Record<string, unknown>>(
        readRequiredString(args.analysisId, "analysisId")
      )
  ),
  createReadTool(
    "content_analysis_policies.list",
    "List content analysis module policies.",
    {
      type: "object",
      properties: {
        page: { type: "number" },
        pageSize: { type: "number" },
        module: { type: "string" },
      },
      additionalProperties: false,
    },
    async ({ sdk }, args) =>
      sdk.listContentAnalysisPoliciesPage<Record<string, unknown>>({
        ...readPageArgs(args),
        module: readOptionalString(args.module) ?? undefined,
      })
  ),
  createReadTool(
    "content_analysis_policies.read",
    "Read one content analysis module policy.",
    detailSchema,
    async ({ sdk }, args) =>
      sdk.getContentAnalysisPolicy<Record<string, unknown>>(
        readRequiredString(args.policyId, "policyId")
      )
  ),
  createWriteTool(
    "content_analysis.backfill.request",
    "Queue safe content-analysis replay for existing content. This refreshes NER/entities, sentiment, category, system-interest labels, and content-filter evidence only; it does not recompute signal_candidate.match_criteria, interest_filter_results, or final_selection_results. For old signal_candidates/current interests/selected or pass_through noise, use maintenance.reindex.request with jobKind=backfill. Default modules exclude structured_extraction; request that module explicitly when an LLM-backed extraction policy should run.",
    "write.sequences",
    MCP_CONTENT_ANALYSIS_ARGUMENT_SCHEMAS.backfillRequest,
    async ({ sdk, pool, token }, args) => {
      const payload =
        args.payload == null ? {} : normalizeContentAnalysisBackfillPayload(readPayload(args));
      const queued = await sdk.requestContentAnalysisBackfill<Record<string, unknown>>(payload);
      await writeMcpMutationAudit(pool, token, {
        actionType: "content_analysis_backfill_requested",
        entityType: "reindex_job",
        entityId: readOptionalString(queued.reindexJobId),
        payloadJson: { payload, queued },
      });
      return {
        ...queued,
        warnings: [
          "Content analysis backfill only refreshes analysis/label/filter evidence.",
          "It does not recompute signal_candidate.match_criteria, interest_filter_results, or final_selection_results; use maintenance.reindex.request jobKind=backfill for selection replay.",
        ],
      };
    }
  ),
  createReadTool(
    "content_entities.list",
    "List queryable NER entities.",
    {
      type: "object",
      properties: {
        page: { type: "number" },
        pageSize: { type: "number" },
        subjectType: { type: "string" },
        subjectId: { type: "string" },
        entityType: { type: "string" },
        entityText: { type: "string" },
        normalizedKey: { type: "string" },
      },
      additionalProperties: false,
    },
    async ({ sdk }, args) =>
      sdk.listContentEntitiesPage<Record<string, unknown>>({
        ...readPageArgs(args),
        subjectType: readOptionalString(args.subjectType) ?? undefined,
        subjectId: readOptionalString(args.subjectId) ?? undefined,
        entityType: readOptionalString(args.entityType) ?? undefined,
        entityText: readOptionalString(args.entityText) ?? undefined,
        normalizedKey: readOptionalString(args.normalizedKey) ?? undefined,
      })
  ),
  createReadTool(
    "content_labels.list",
    "List queryable content labels such as system-interest projections.",
    {
      type: "object",
      properties: {
        page: { type: "number" },
        pageSize: { type: "number" },
        subjectType: { type: "string" },
        subjectId: { type: "string" },
        labelType: { type: "string" },
        labelKey: { type: "string" },
        decision: { type: "string" },
      },
      additionalProperties: false,
    },
    async ({ sdk }, args) =>
      sdk.listContentLabelsPage<Record<string, unknown>>({
        ...readPageArgs(args),
        subjectType: readOptionalString(args.subjectType) ?? undefined,
        subjectId: readOptionalString(args.subjectId) ?? undefined,
        labelType: readOptionalString(args.labelType) ?? undefined,
        labelKey: readOptionalString(args.labelKey) ?? undefined,
        decision: readOptionalString(args.decision) ?? undefined,
      })
  ),
  createReadTool(
    "content_filter_policies.list",
    "List content filter/gate policies.",
    pagingSchema,
    async ({ sdk }, args) =>
      sdk.listContentFilterPoliciesPage<Record<string, unknown>>(readPageArgs(args))
  ),
  createReadTool(
    "content_filter_policies.read",
    "Read one content filter/gate policy.",
    detailSchema,
    async ({ sdk }, args) =>
      sdk.getContentFilterPolicy<Record<string, unknown>>(
        readRequiredString(args.filterPolicyId, "filterPolicyId")
      )
  ),
  createReadTool(
    "content_filter_results.list",
    "List persisted content filter/gate decisions.",
    {
      type: "object",
      properties: {
        page: { type: "number" },
        pageSize: { type: "number" },
        subjectType: { type: "string" },
        subjectId: { type: "string" },
        policyKey: { type: "string" },
        decision: { type: "string" },
        passed: { type: "boolean" },
      },
      additionalProperties: false,
    },
    async ({ sdk }, args) =>
      sdk.listContentFilterResultsPage<Record<string, unknown>>({
        ...readPageArgs(args),
        subjectType: readOptionalString(args.subjectType) ?? undefined,
        subjectId: readOptionalString(args.subjectId) ?? undefined,
        policyKey: readOptionalString(args.policyKey) ?? undefined,
        decision: readOptionalString(args.decision) ?? undefined,
        passed: typeof args.passed === "boolean" ? args.passed : undefined,
      })
  ),
  createWriteTool(
    "content_analysis_policies.create",
    "Create a content analysis module policy through the maintenance API.",
    "write.sequences",
    MCP_CONTENT_ANALYSIS_ARGUMENT_SCHEMAS.policyCreate,
    async ({ sdk, pool, token }, args) => {
      const payload = readPayload(args);
      const created = await sdk.createContentAnalysisPolicy<Record<string, unknown>>(payload);
      await writeMcpMutationAudit(pool, token, {
        actionType: "content_analysis_policy_created",
        entityType: "content_analysis_policy",
        entityId: readOptionalString(created.policy_id),
        payloadJson: { payload },
      });
      return created;
    }
  ),
  createWriteTool(
    "content_analysis_policies.update",
    "Update a content analysis module policy through the maintenance API.",
    "write.sequences",
    MCP_CONTENT_ANALYSIS_ARGUMENT_SCHEMAS.policyUpdate,
    async ({ sdk, pool, token }, args) => {
      const policyId = readRequiredString(args.policyId, "policyId");
      const payload = readPayload(args);
      if (
        payload.mode === "enforce" &&
        readBooleanFlag(payload.confirmEnforce, "confirmEnforce") !== true
      ) {
        throw new JsonRpcError(-32602, "confirmEnforce=true is required for enforce mode.", {
          statusCode: 400,
        });
      }
      delete payload.confirmEnforce;
      const updated = await sdk.updateContentAnalysisPolicy<Record<string, unknown>>(
        policyId,
        payload
      );
      await writeMcpMutationAudit(pool, token, {
        actionType: "content_analysis_policy_updated",
        entityType: "content_analysis_policy",
        entityId: policyId,
        payloadJson: { payload },
      });
      return updated;
    }
  ),
  createWriteTool(
    "content_filter_policies.create",
    "Create a content filter/gate policy through the maintenance API.",
    "write.sequences",
    MCP_CONTENT_ANALYSIS_ARGUMENT_SCHEMAS.filterPolicyCreate,
    async ({ sdk, pool, token }, args) => {
      const payload = readPayload(args);
      const created = await sdk.createContentFilterPolicy<Record<string, unknown>>(payload);
      await writeMcpMutationAudit(pool, token, {
        actionType: "content_filter_policy_created",
        entityType: "content_filter_policy",
        entityId: readOptionalString(created.filter_policy_id),
        payloadJson: { payload },
      });
      return created;
    }
  ),
  createWriteTool(
    "content_filter_policies.update",
    "Update a content filter/gate policy through the maintenance API.",
    "write.sequences",
    MCP_CONTENT_ANALYSIS_ARGUMENT_SCHEMAS.filterPolicyUpdate,
    async ({ sdk, pool, token }, args) => {
      const filterPolicyId = readRequiredString(args.filterPolicyId, "filterPolicyId");
      const payload = readPayload(args);
      if (
        payload.mode === "enforce" &&
        readBooleanFlag(payload.confirmEnforce, "confirmEnforce") !== true
      ) {
        throw new JsonRpcError(-32602, "confirmEnforce=true is required for enforce mode.", {
          statusCode: 400,
        });
      }
      delete payload.confirmEnforce;
      const updated = await sdk.updateContentFilterPolicy<Record<string, unknown>>(
        filterPolicyId,
        payload
      );
      await writeMcpMutationAudit(pool, token, {
        actionType: "content_filter_policy_updated",
        entityType: "content_filter_policy",
        entityId: filterPolicyId,
        payloadJson: { payload },
      });
      return updated;
    }
  ),
  createWriteTool(
    "content_filter_policies.preview",
    "Preview current persisted impact for a content filter/gate policy.",
    "write.sequences",
    MCP_CONTENT_ANALYSIS_ARGUMENT_SCHEMAS.filterPolicyPreview,
    async ({ sdk }, args) =>
      sdk.previewContentFilterPolicy<Record<string, unknown>>(
        readRequiredString(args.filterPolicyId, "filterPolicyId"),
        args.payload && typeof args.payload === "object" ? args.payload : {}
      )
  ),
] as const;

