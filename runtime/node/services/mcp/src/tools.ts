import {
  assertJsonSchema,
  validateJsonSchema,
} from "@signalops/contracts";

import { ADMIN_MCP_TOOLS } from "./tools/admin-tools";
import { CHANNEL_MCP_TOOLS } from "./tools/channels-tools";
import { CONTENT_ANALYSIS_MCP_TOOLS } from "./tools/content-analysis-tools";
import { CONTENT_MCP_TOOLS } from "./tools/content-tools";
import { DISCOVERY_MCP_TOOLS } from "./tools/discovery-tools";
import { INGRESS_ADAPTER_MCP_TOOLS } from "./tools/ingress-adapters-tools";
import {
  OPERATOR_INTELLIGENCE_MCP_TOOLS,
  OPERATOR_REPORT_MCP_TOOLS,
} from "./tools/operator-tools";
import { SEQUENCE_MCP_TOOLS } from "./tools/sequences-tools";
import { TEMPLATE_MCP_TOOLS } from "./tools/templates-tools";
import {
  JsonRpcError,
  readRequiredString,
  requireDestructiveConfirmation,
  requireScope,
  type McpToolContext,
  type McpToolDefinition,
} from "./tools/shared";
import {
  MCP_STRUCTURED_OUTPUT_SCHEMA,
  buildToolAnnotations,
  buildToolDescription,
} from "./context";
import { expectedShapeForSchema } from "./tools/content-analysis-helpers";
import { nextReadBackForTool } from "./operating-intelligence";

export type { McpToolContext, McpToolDefinition } from "./tools/shared";

export const MCP_TOOLS: readonly McpToolDefinition[] = [
  ...ADMIN_MCP_TOOLS,
  ...TEMPLATE_MCP_TOOLS,
  ...CHANNEL_MCP_TOOLS,
  ...INGRESS_ADAPTER_MCP_TOOLS,
  ...CONTENT_MCP_TOOLS,
  ...SEQUENCE_MCP_TOOLS,
  ...DISCOVERY_MCP_TOOLS,
  ...CONTENT_ANALYSIS_MCP_TOOLS,
  ...OPERATOR_INTELLIGENCE_MCP_TOOLS,
  ...OPERATOR_REPORT_MCP_TOOLS,
] as const;

export function listMcpTools() {
  return MCP_TOOLS.map((tool) => ({
    name: tool.name,
    title: buildToolAnnotations(tool).title,
    description: buildToolDescription(tool),
    inputSchema: tool.inputSchema,
    outputSchema: MCP_STRUCTURED_OUTPUT_SCHEMA,
    annotations: buildToolAnnotations(tool),
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
  if (
    args.payload != null &&
    typeof args.payload === "object" &&
    !Array.isArray(args.payload) &&
    Object.prototype.hasOwnProperty.call(args.payload, "payload")
  ) {
    throw new JsonRpcError(
      -32602,
      `MCP tool "${tool.name}" arguments failed schema validation: payload.payload is not allowed.`,
      {
        statusCode: 400,
        data: {
          tool: tool.name,
          path: "payload.payload",
          code: "nested_payload_not_allowed",
          expectedShape: "arguments.payload must be the API payload object, not an envelope.",
        },
      }
    );
  }
  const argumentIssues = validateJsonSchema(args, tool.inputSchema);
  if (argumentIssues.length > 0) {
    const firstIssue = argumentIssues[0];
    const unsupportedSystemInterestAlias = readUnsupportedSystemInterestAliasIssue(
      tool.name,
      firstIssue?.path
    );
    if (unsupportedSystemInterestAlias) {
      throw new JsonRpcError(
        -32602,
        `payload.${unsupportedSystemInterestAlias.fieldName} is not a supported system_interests write field. Use ${unsupportedSystemInterestAlias.canonical}.`,
        {
          statusCode: 400,
          data: {
            tool: tool.name,
            path: `payload.${unsupportedSystemInterestAlias.fieldName}`,
            code: "unsupported_field_alias",
            canonicalField: unsupportedSystemInterestAlias.canonical,
            expectedShape: unsupportedSystemInterestAlias.expectedShape,
          },
        }
      );
    }
    throw new JsonRpcError(
      -32602,
      `MCP tool "${tool.name}" arguments failed schema validation: ${firstIssue?.message ?? "invalid arguments."}`,
      {
        statusCode: 400,
        data: {
          tool: tool.name,
          path: firstIssue?.path ?? "$",
          code: firstIssue?.code ?? "invalid_arguments",
          expectedShape: expectedShapeForSchema(tool.inputSchema),
        },
      }
    );
  }
  if (tool.destructive) {
    requireDestructiveConfirmation(context.token, args);
  }
  const result = await tool.handler(context, args);
  if (tool.outputSchema) {
    try {
      assertJsonSchema(result, tool.outputSchema, {
        boundaryName: `MCP tool "${tool.name}" result`,
      });
    } catch (error) {
      throw new JsonRpcError(
        -32603,
        error instanceof Error ? error.message : "MCP tool result failed schema validation.",
        {
          statusCode: 500,
          data: {
            tool: tool.name,
          },
        }
      );
    }
  }
  if (tool.requiredScope !== "read") {
    const readBack = nextReadBackForTool(tool.name);
    if (
      Object.keys(readBack).length > 0 &&
      result != null &&
      typeof result === "object" &&
      !Array.isArray(result)
    ) {
      return {
        ...(result as Record<string, unknown>),
        ...readBack,
      };
    }
  }
  return result;
}

function readUnsupportedSystemInterestAliasIssue(
  toolName: string,
  issuePath: string | undefined
): { fieldName: string; canonical: string; expectedShape: string } | null {
  if (!["system_interests.create", "system_interests.update"].includes(toolName)) {
    return null;
  }
  const fieldName = String(issuePath ?? "").replace(/^payload\./u, "");
  const hints: Record<string, { canonical: string; expectedShape: string }> = {
    candidateSignals: {
      canonical:
        "candidate_positive_signals/candidate_negative_signals or candidate_positive_signal_groups/candidate_negative_signal_groups",
      expectedShape:
        "Flat candidate_*_signals arrays create simple groups; structured candidate_*_signal_groups accepts { name, tier, cues } for quality auto-select.",
    },
    selectionProfile: {
      canonical:
        "selection_profile_strictness, selection_profile_unresolved_decision, selection_profile_llm_review_mode, selection_profile_auto_select_mode, selection_profile_signal_visibility",
      expectedShape: "Use flat selection_profile_* fields, not a nested selectionProfile object.",
    },
    allowedContentKinds: {
      canonical: "allowed_content_kinds",
      expectedShape: "Use allowed_content_kinds as a string array or comma/newline-separated string.",
    },
    llmReviewMode: {
      canonical: "selection_profile_llm_review_mode",
      expectedShape:
        "Use selection_profile_llm_review_mode with disabled, optional_high_value_only, or always.",
    },
  };
  const hint = hints[fieldName];
  return hint ? { fieldName, ...hint } : null;
}
