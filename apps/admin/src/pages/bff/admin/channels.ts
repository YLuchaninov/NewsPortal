import type { APIRoute } from "astro";

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
import {
  deleteOrArchiveRssChannel,
  parseRssAdminChannelInput,
  upsertRssChannels,
} from "../../../lib/server/rss-channels";

export const prerender = false;

type ChannelIntent = "save" | "delete";

function resolveChannelIntent(payload: Record<string, unknown>): ChannelIntent {
  return String(payload.intent ?? "save").trim() === "delete" ? "delete" : "save";
}

function resolveChannelEditPath(request: Request, channelId: string): string {
  return resolveAdminAppPath(request, `/channels/${channelId}/edit`);
}

async function writeAuditLog(
  actorUserId: string,
  actionType: string,
  entityId: string,
  payloadJson: Record<string, unknown>
): Promise<void> {
  await getPool().query(
    `
      insert into audit_log (
        actor_user_id,
        action_type,
        entity_type,
        entity_id,
        payload_json
      )
      values ($1, $2, 'channel', $3, $4::jsonb)
    `,
    [actorUserId, actionType, entityId, JSON.stringify(payloadJson)]
  );
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

      const result = await deleteOrArchiveRssChannel(pool, channelId);
      await writeAuditLog(
        session.userId,
        result.mode === "delete" ? "channel_deleted" : "channel_archived",
        channelId,
        {
          articleCount: result.articleCount,
          mode: result.mode,
        }
      );

      if (browserRequest) {
        return buildFlashRedirect(request, {
          section: "channels",
          status: "success",
          message:
            result.mode === "delete"
              ? "Channel deleted"
              : "Channel archived because it already has historical articles",
          redirectTo:
            result.mode === "delete"
              ? resolveAdminAppPath(request, "/channels")
              : redirectTo,
        });
      }

      return Response.json({
        ok: true,
        mode: result.mode,
        articleCount: result.articleCount,
      });
    }

    const channel = parseRssAdminChannelInput(payload);
    const result = await upsertRssChannels(pool, [channel]);
    const channelId = channel.channelId ?? result.createdChannelIds[0] ?? null;
    const entityPath = channelId ? resolveChannelEditPath(request, channelId) : redirectTo;

    if (channelId) {
      await writeAuditLog(
        session.userId,
        channel.channelId ? "channel_updated" : "channel_created",
        channelId,
        {
          name: channel.name,
          isActive: channel.isActive,
          pollIntervalSeconds: channel.pollIntervalSeconds,
        }
      );
    }

    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "channels",
        status: "success",
        message: channel.channelId ? "Channel updated" : "Channel created",
        redirectTo: channel.channelId ? redirectTo : entityPath,
      });
    }

    if (channel.channelId) {
      return Response.json({
        updated: true,
        channelId: channel.channelId,
        updatedChannelIds: result.updatedChannelIds,
      });
    }

    return Response.json(
      {
        channelId,
        createdChannelIds: result.createdChannelIds,
      },
      { status: 201 }
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to update RSS channel.";
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
