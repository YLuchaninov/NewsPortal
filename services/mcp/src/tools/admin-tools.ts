import { listMcpAccessTokens } from "@newsportal/control-plane";

import {
  createReadTool,
  type McpToolDefinition
} from "./shared";

export const ADMIN_MCP_TOOLS: readonly McpToolDefinition[] = [
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
] as const;
