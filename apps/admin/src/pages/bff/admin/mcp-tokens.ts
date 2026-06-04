import type { APIRoute } from "astro";

import {
  deleteRevokedMcpAccessToken,
  issueMcpAccessToken,
  revokeMcpAccessToken,
} from "@signalops/control-plane";

import {
  adminActionError,
  prepareAdminAction,
  readRequiredAdminText,
  requireAdminIntent,
} from "../../../lib/server/admin-action";
import { getPool } from "../../../lib/server/db";

export const prerender = false;

type TokenIntent = "issue" | "revoke" | "delete";

export const POST: APIRoute = async ({ request }) => {
  const action = await prepareAdminAction(request, {
    fallbackRedirectPath: "/automation/mcp",
    actionToken: { scope: "mcp-tokens" },
  });
  if (!action.ok) {
    return action.response;
  }

  try {
    const { payload, session } = action.context;
    const pool = getPool();
    const intent = requireAdminIntent<TokenIntent>(payload, ["issue", "revoke", "delete"], "issue");

    if (intent === "revoke") {
      const tokenId = readRequiredAdminText(payload, "tokenId", "MCP token ID is required.");
      const tokenRecord = await revokeMcpAccessToken(pool, {
        tokenId,
        revokedByUserId: session.userId,
      });
      return Response.json({ ok: true, tokenRecord });
    }

    if (intent === "delete") {
      const tokenId = readRequiredAdminText(payload, "tokenId", "MCP token ID is required.");
      const tokenRecord = await deleteRevokedMcpAccessToken(pool, {
        tokenId,
        deletedByUserId: session.userId,
      });
      return Response.json({ ok: true, tokenRecord });
    }

    const result = await issueMcpAccessToken(pool, {
      label: payload.label,
      scopes: payload.scopes,
      expiresAt: payload.expiresAt,
      issuedByUserId: session.userId,
    });

    return Response.json(
      {
        token: result.token,
        tokenRecord: {
          tokenId: result.tokenId,
          label: result.label,
          tokenPrefix: result.tokenPrefix,
          scopes: result.scopes,
          status: result.status,
          expiresAt: result.expiresAt,
          lastUsedAt: result.lastUsedAt,
          lastUsedIp: result.lastUsedIp ?? null,
          lastUsedUserAgent: result.lastUsedUserAgent,
          recentRequestCount: result.recentRequestCount,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to update MCP tokens.";
    return adminActionError(action.context, {
      section: "automation",
      message: errorMessage,
      status: 400,
    });
  }
};
