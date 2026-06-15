import { getMcpTokenAllowedFunnelIds } from "@signalops/control-plane";
import type { JsonSchema } from "@signalops/contracts";

import {
  createWriteTool,
  JsonRpcError,
  mcpFunnelWriteContextPayload,
  readOptionalString,
  readMcpFunnelWriteContext,
  shouldAuditMcpFunnelWriteContext,
  withMcpFunnelWriteContext,
  writeMcpMutationAudit,
  type McpFunnelWriteContext,
  type McpToolContext,
  type McpToolDefinition,
} from "../shared";
import { funnelContextSchemaProperties } from "./vnext-schemas";

const funnelContextFieldNames = new Set(Object.keys(funnelContextSchemaProperties));

function withFunnelContextSchema(schema: JsonSchema): JsonSchema {
  const properties =
    schema && typeof schema === "object" && "properties" in schema && schema.properties
      ? (schema.properties as Record<string, JsonSchema>)
      : {};
  return {
    ...schema,
    properties: {
      ...properties,
      ...funnelContextSchemaProperties,
    },
    additionalProperties: false,
  } satisfies JsonSchema;
}

function withoutFunnelContextArgs(args: Record<string, unknown>): Record<string, unknown> {
  const payload = { ...args };
  for (const fieldName of funnelContextFieldNames) {
    delete payload[fieldName];
  }
  return payload;
}

function asResponseRecord(value: unknown): Record<string, unknown> {
  if (value != null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { result: value };
}

function discoveryRiskKind(
  args: Record<string, unknown>,
  fallback: McpFunnelWriteContext["riskKind"]
): McpFunnelWriteContext["riskKind"] {
  const verificationTarget = readOptionalString(args.verificationTarget);
  if (
    verificationTarget === "selection" ||
    verificationTarget === "source_health" ||
    verificationTarget === "llm_review" ||
    verificationTarget === "replay"
  ) {
    return verificationTarget;
  }
  const runKind = readOptionalString(args.runKind);
  if (runKind === "replay" || Object.prototype.hasOwnProperty.call(args, "replayKind")) {
    return "replay";
  }
  return fallback;
}

function readDiscoveryResultIds(response: Record<string, unknown>): Record<string, unknown> {
  const candidateIds = Array.isArray(response.candidateIds)
    ? response.candidateIds
    : Array.isArray(response.candidate_ids)
      ? response.candidate_ids
      : undefined;
  return {
    runId: response.runId ?? response.run_id ?? response.vnextRunId ?? response.vnext_run_id ?? null,
    artifactId: response.artifactId ?? response.artifact_id ?? null,
    candidateId: response.candidateId ?? response.candidate_id ?? candidateIds?.[0] ?? null,
    sourceInventoryId: response.sourceInventoryId ?? response.source_inventory_id ?? null,
    policyId: response.policyId ?? response.policy_id ?? null,
    replayRunId: response.replayRunId ?? response.replay_run_id ?? null,
    rollbackGroupId: response.rollbackGroupId ?? response.rollback_group_id ?? null,
    feedbackId: response.feedbackId ?? response.feedback_id ?? null,
  };
}

function readDiscoveryAuditEntityId(response: Record<string, unknown>): string | null {
  const ids = readDiscoveryResultIds(response);
  for (const value of Object.values(ids)) {
    const normalized = String(value ?? "").trim();
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

async function runFunnelAwareDiscoveryWrite(
  context: McpToolContext,
  args: Record<string, unknown>,
  input: {
    toolName: string;
    fallbackRiskKind: McpFunnelWriteContext["riskKind"];
    handler: (backendArgs: Record<string, unknown>) => Promise<unknown>;
  }
): Promise<Record<string, unknown>> {
  const funnelContext = await readMcpFunnelWriteContext(context.pool, context.token, args, {
    toolName: input.toolName,
    riskKind: discoveryRiskKind(args, input.fallbackRiskKind),
    selectionImpacting: true,
  });
  if (getMcpTokenAllowedFunnelIds(context.token).length > 0 && !funnelContext.funnelId) {
    throw new JsonRpcError(
      -32004,
      "Funnel-bound MCP tokens must pass funnelId for discovery writes.",
      {
        statusCode: 403,
        data: {
          path: "funnelId",
          requiredAction:
            "Pass one of the token's allowed funnel ids, or use an unrestricted operator token for shared/global discovery writes.",
        },
      }
    );
  }

  const response = asResponseRecord(await input.handler(withoutFunnelContextArgs(args)));
  if (shouldAuditMcpFunnelWriteContext(funnelContext)) {
    await writeMcpMutationAudit(context.pool, context.token, {
      actionType: "mcp_funnel_write_context_recorded",
      entityType: "discovery_vnext",
      entityId: readDiscoveryAuditEntityId(response),
      payloadJson: {
        ...mcpFunnelWriteContextPayload(funnelContext),
        discoveryTool: input.toolName,
        discoveryResultIds: readDiscoveryResultIds(response),
      },
    });
  }
  return withMcpFunnelWriteContext(response, funnelContext);
}

function funnelAwareDiscoveryDescription(description: string): string {
  return `${description} Optional Funnel Autopilot context fields are supported for scoped setup/manual tuning: funnelId, laneId, changeMode, configurationScope, funnelPlanId, planFingerprint and verificationTarget.`;
}

export function createDiscoveryWriteTool(
  name: string,
  description: string,
  inputSchema: JsonSchema,
  fallbackRiskKind: McpFunnelWriteContext["riskKind"],
  handler: (context: McpToolContext, args: Record<string, unknown>) => Promise<unknown>,
  destructive = false
): McpToolDefinition {
  return createWriteTool(
    name,
    funnelAwareDiscoveryDescription(description),
    "write.discovery",
    withFunnelContextSchema(inputSchema),
    async (context, args) =>
      runFunnelAwareDiscoveryWrite(context, args, {
        toolName: name,
        fallbackRiskKind,
        handler: (backendArgs) => handler(context, backendArgs),
      }),
    destructive
  );
}
