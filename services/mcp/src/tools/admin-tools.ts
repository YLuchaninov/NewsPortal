import {
  deleteRevokedMcpAccessToken,
  getMcpAccessTokenEffectiveStatus,
  listMcpAccessTokens,
  revokeMcpAccessToken,
  summarizeMcpAccessTokens,
  type McpAccessTokenRecord,
} from "@newsportal/control-plane";

import {
  createReadTool,
  createWriteTool,
  JsonRpcError,
  readOptionalString,
  readRequiredUuidString,
  type McpToolDefinition
} from "./shared";

function serializeToken(token: McpAccessTokenRecord) {
  return {
    tokenId: token.tokenId,
    label: token.label,
    tokenPrefix: token.tokenPrefix,
    scopes: token.scopes,
    status: token.status,
    effectiveStatus: getMcpAccessTokenEffectiveStatus(token),
    expiresAt: token.expiresAt,
    lastUsedAt: token.lastUsedAt,
    createdAt: token.createdAt,
    revokedAt: token.revokedAt,
    recentRequestCount: token.recentRequestCount,
  };
}

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
        mcpTokens: summarizeMcpAccessTokens(tokens),
      };
    }
  ),
  createReadTool(
    "admin.mcp_tokens.list",
    "List sanitized MCP token records. Use this instead of guessing database columns; token secrets are never returned.",
    { type: "object", additionalProperties: false },
    async ({ pool }) => {
      const tokens = await listMcpAccessTokens(pool);
      return {
        ...summarizeMcpAccessTokens(tokens),
        items: tokens.map(serializeToken),
        databaseColumns: [
          "token_id",
          "label",
          "token_prefix",
          "scopes",
          "status",
          "issued_by_user_id",
          "revoked_by_user_id",
          "revoked_at",
          "expires_at",
          "last_used_at",
          "last_used_ip",
          "last_used_user_agent",
          "created_at",
          "updated_at",
        ],
      };
    }
  ),
  createWriteTool(
    "admin.mcp_tokens.revoke",
    "Revoke one MCP access token through MCP. Use this instead of direct admin REST calls; requires admin.tokens plus destructive confirmation. Refuses to revoke the current token to avoid cutting off the active MCP session.",
    "admin.tokens",
    {
      type: "object",
      required: ["tokenId", "confirm"],
      properties: {
        tokenId: { type: "string" },
        reason: { type: "string" },
        confirm: { type: "boolean" },
      },
      additionalProperties: false,
    },
    async ({ pool, token }, args) => {
      const tokenId = readRequiredUuidString(args.tokenId, "tokenId");
      if (tokenId === token.tokenId) {
        throw new JsonRpcError(
          -32602,
          "Refusing to revoke the current MCP token through the active MCP session. Use a different admin.tokens token or the admin UI for self-revoke.",
          {
            statusCode: 400,
          }
        );
      }
      const tokenRecord = await revokeMcpAccessToken(pool, {
        tokenId,
        revokedByUserId: token.issuedByUserId,
        reason: readOptionalString(args.reason) ?? "MCP token revoked through MCP cleanup.",
      });
      return {
        ok: true,
        tokenRecord: serializeToken(tokenRecord),
      };
    },
    true
  ),
  createWriteTool(
    "admin.mcp_tokens.delete_revoked",
    "Delete one already-revoked MCP token record through MCP. Use only after revoke/read-back evidence; requires admin.tokens plus destructive confirmation and cannot delete active tokens.",
    "admin.tokens",
    {
      type: "object",
      required: ["tokenId", "confirm"],
      properties: {
        tokenId: { type: "string" },
        confirm: { type: "boolean" },
      },
      additionalProperties: false,
    },
    async ({ pool, token }, args) => {
      const tokenId = readRequiredUuidString(args.tokenId, "tokenId");
      if (tokenId === token.tokenId) {
        throw new JsonRpcError(
          -32602,
          "Refusing to delete the current MCP token record through the active MCP session.",
          {
            statusCode: 400,
          }
        );
      }
      const tokenRecord = await deleteRevokedMcpAccessToken(pool, {
        tokenId,
        deletedByUserId: token.issuedByUserId,
      });
      return {
        ok: true,
        tokenRecord: serializeToken(tokenRecord),
      };
    },
    true
  ),
] as const;
