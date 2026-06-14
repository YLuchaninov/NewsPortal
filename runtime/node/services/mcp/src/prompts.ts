import { buildPromptTitle } from "./context";
import { JsonRpcError, readRequiredString } from "./protocol";
import { channelReviewPrompts } from "./prompts/channels";
import { cleanupPrompts } from "./prompts/cleanup";
import {
  discoveryPlanningPrompts,
  discoveryReviewPrompts,
  discoveryTuningPrompts,
} from "./prompts/discovery";
import {
  diagnosticPrompts,
  operationsReviewPrompts,
  sequenceDraftPrompts,
} from "./prompts/operations";
import { selectionTuningPrompts, systemInterestPrompts } from "./prompts/selection";
import { maintenanceSessionPrompts, openingSessionPrompts } from "./prompts/sessions";
import { llmBudgetPrompts, templateTuningPrompts } from "./prompts/templates";
import type { McpPromptDefinition } from "./prompts/types";

export type { McpPromptDefinition } from "./prompts/types";

// Parity anchor for the public prompt facade after group extraction:
// domain-specific/domain vocabulary tuning belongs in MCP/admin configuration, not runtime hardcode or runtime defaults.
export const MCP_PROMPTS: readonly McpPromptDefinition[] = [
  ...diagnosticPrompts,
  ...openingSessionPrompts,
  ...discoveryPlanningPrompts,
  ...maintenanceSessionPrompts,
  ...operationsReviewPrompts,
  ...selectionTuningPrompts,
  ...channelReviewPrompts,
  ...llmBudgetPrompts,
  ...discoveryReviewPrompts,
  ...systemInterestPrompts,
  ...templateTuningPrompts,
  ...discoveryTuningPrompts,
  ...sequenceDraftPrompts,
  ...cleanupPrompts,
];

export function listMcpPrompts() {
  return MCP_PROMPTS.map((prompt) => ({
    name: prompt.name,
    title: buildPromptTitle(prompt.name),
    description: prompt.description,
    arguments: prompt.arguments,
  }));
}

export function resolveMcpPrompt(name: string): McpPromptDefinition {
  const normalized = readRequiredString(name, "name");
  const prompt = MCP_PROMPTS.find((entry) => entry.name === normalized);
  if (!prompt) {
    throw new JsonRpcError(-32602, `Unknown MCP prompt "${normalized}".`, {
      statusCode: 404,
    });
  }
  return prompt;
}
