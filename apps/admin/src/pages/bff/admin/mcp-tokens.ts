import type { APIRoute } from "astro";

import {
  issueMcpAccessToken,
  revokeMcpAccessToken,
} from "@newsportal/control-plane";

import {
  buildAdminSignInPath,
  buildFlashRedirect,
  requestPrefersHtmlNavigation,
  resolveAdminRedirectPath,
} from "../../../lib/server/browser-flow";
import {
  buildExpiredAdminSessionCookie,
  resolveAdminSession,
} from "../../../lib/server/auth";
import { getPool } from "../../../lib/server/db";
import { readRequestPayload } from "../../../lib/server/request";

export const prerender = false;

type TokenIntent = "issue" | "revoke";

function resolveTokenIntent(payload: Record<string, unknown>): TokenIntent {
  return String(payload.intent ?? "issue").trim() === "revoke" ? "revoke" : "issue";
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const browserRequest = requestPrefersHtmlNavigation(request);
  const payload = await readRequestPayload(request);
  const redirectTo = resolveAdminRedirectPath(
    request,
    String(payload.redirectTo ?? request.headers.get("referer") ?? ""),
    "/automation/mcp"
  );
  const session = await resolveAdminSession(request);

  if (!session || !session.roles.includes("admin")) {
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "auth",
        status: "error",
        message: "Please sign in as an admin to continue.",
        setCookie: buildExpiredAdminSessionCookie(),
        redirectTo: buildAdminSignInPath(request, redirectTo),
      });
    }
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const pool = getPool();
    const intent = resolveTokenIntent(payload);

    if (intent === "revoke") {
      const tokenId = String(payload.tokenId ?? "").trim();
      if (!tokenId) {
        throw new Error("MCP token ID is required.");
      }
      const tokenRecord = await revokeMcpAccessToken(pool, {
        tokenId,
        revokedByUserId: session.userId,
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
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "automation",
        status: "error",
        message: errorMessage,
        redirectTo,
      });
    }
    return Response.json(
      {
        error: errorMessage,
      },
      {
        status: 400,
      }
    );
  }
};
