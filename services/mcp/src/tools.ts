import { ADMIN_MCP_TOOLS } from "./tools/admin-tools";
import { CHANNEL_MCP_TOOLS } from "./tools/channels-tools";
import { CONTENT_MCP_TOOLS } from "./tools/content-tools";
import { DISCOVERY_MCP_TOOLS } from "./tools/discovery-tools";
import { SEQUENCE_MCP_TOOLS } from "./tools/sequences-tools";
import { TEMPLATE_MCP_TOOLS } from "./tools/templates-tools";
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
  requireDestructiveConfirmation,
  requireScope,
  writeMcpMutationAudit,
  type McpToolContext,
  type McpToolDefinition,
} from "./tools/shared";

export type { McpToolContext, McpToolDefinition } from "./tools/shared";

const CONTENT_ANALYSIS_MCP_TOOLS: readonly McpToolDefinition[] = [
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
    "Queue safe content-analysis replay for existing content. Default modules exclude structured_extraction; request that module explicitly when an LLM-backed extraction policy should run.",
    "write.sequences",
    {
      type: "object",
      properties: {
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      const payload = readPayload(args);
      const queued = await sdk.requestContentAnalysisBackfill<Record<string, unknown>>(payload);
      await writeMcpMutationAudit(pool, token, {
        actionType: "content_analysis_backfill_requested",
        entityType: "reindex_job",
        entityId: readOptionalString(queued.reindexJobId),
        payloadJson: { payload, queued },
      });
      return queued;
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
    {
      type: "object",
      required: ["payload"],
      properties: {
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
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
    {
      type: "object",
      required: ["policyId", "payload"],
      properties: {
        policyId: { type: "string" },
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
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
    {
      type: "object",
      required: ["payload"],
      properties: {
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
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
    {
      type: "object",
      required: ["filterPolicyId", "payload"],
      properties: {
        filterPolicyId: { type: "string" },
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
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
    {
      type: "object",
      required: ["filterPolicyId"],
      properties: {
        filterPolicyId: { type: "string" },
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ sdk }, args) =>
      sdk.previewContentFilterPolicy<Record<string, unknown>>(
        readRequiredString(args.filterPolicyId, "filterPolicyId"),
        args.payload && typeof args.payload === "object" ? args.payload : {}
      )
  ),
] as const;

export const MCP_TOOLS: readonly McpToolDefinition[] = [
  ...ADMIN_MCP_TOOLS,
  ...TEMPLATE_MCP_TOOLS,
  ...CHANNEL_MCP_TOOLS,
  ...CONTENT_MCP_TOOLS,
  ...SEQUENCE_MCP_TOOLS,
  ...DISCOVERY_MCP_TOOLS,
  ...CONTENT_ANALYSIS_MCP_TOOLS,
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
