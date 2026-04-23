import type { APIRoute } from "astro";

import {
  deleteChannelWithAudit,
  saveChannelFromPayload,
} from "@newsportal/control-plane";

import {
  buildAdminSignInPath,
  buildFlashRedirect,
  requestPrefersHtmlNavigation,
  resolveAdminAppPath,
  resolveAdminRedirectPath,
} from "../../../lib/server/browser-flow";
import {
  buildExpiredAdminSessionCookie,
  resolveAdminSession,
} from "../../../lib/server/auth";
import { getPool } from "../../../lib/server/db";
import { readRequestPayload } from "../../../lib/server/request";

export const prerender = false;

type ChannelIntent = "save" | "delete";

function resolveChannelIntent(payload: Record<string, unknown>): ChannelIntent {
  return String(payload.intent ?? "save").trim() === "delete" ? "delete" : "save";
}

function resolveChannelEditPath(request: Request, channelId: string): string {
  return resolveAdminAppPath(request, `/channels/${channelId}/edit`);
}

export const POST: APIRoute = async ({ request }) => {
  const browserRequest = requestPrefersHtmlNavigation(request);
  const payload = await readRequestPayload(request);
  const redirectTo = resolveAdminRedirectPath(
    request,
    String(payload.redirectTo ?? request.headers.get("referer") ?? ""),
    "/channels"
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
    const intent = resolveChannelIntent(payload);

    if (intent === "delete") {
      const channelId = String(payload.channelId ?? "").trim();
      if (!channelId) {
        throw new Error("Channel ID is required for delete.");
      }

      const result = await deleteChannelWithAudit(pool, session.userId, channelId);

      if (browserRequest) {
        return buildFlashRedirect(request, {
          section: "channels",
          status: "success",
          message:
            result.mode === "delete"
              ? `${result.providerLabel} channel deleted`
              : `${result.providerLabel} channel archived because it already has stored items`,
          redirectTo:
            result.mode === "delete"
              ? resolveAdminAppPath(request, "/channels")
              : redirectTo,
        });
      }

      return Response.json({
        ok: true,
        mode: result.mode,
        storedItemCount: result.storedItemCount,
        providerType: result.providerType,
      });
    }

    const result = await saveChannelFromPayload(pool, session.userId, payload);
    const entityPath = result.channelId
      ? resolveChannelEditPath(request, result.channelId)
      : redirectTo;

    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "channels",
        status: "success",
        message: result.created
          ? `${result.providerLabel} channel created`
          : `${result.providerLabel} channel updated`,
        redirectTo: result.created ? entityPath : redirectTo,
      });
    }

    if (!result.created && result.channelId) {
      return Response.json({
        updated: true,
        channelId: result.channelId,
        updatedChannelIds: result.updatedChannelIds,
      });
    }

    return Response.json(
      {
        channelId: result.channelId,
        createdChannelIds: result.createdChannelIds,
      },
      { status: 201 }
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to update channel.";
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "channels",
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
