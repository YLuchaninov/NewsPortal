import type { APIRoute } from "astro";

import {
  buildFlashRedirect,
  requestPrefersHtmlNavigation
} from "../../../lib/server/browser-flow";
import {
  buildExpiredAdminSessionCookie,
  resolveAdminSession
} from "../../../lib/server/auth";
import { getPool } from "../../../lib/server/db";
import { readRequestPayload } from "../../../lib/server/request";
import {
  parseRssAdminChannelInput,
  upsertRssChannels
} from "../../../lib/server/rss-channels";

export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
  const browserRequest = requestPrefersHtmlNavigation(request);
  const session = await resolveAdminSession(request);
  if (!session || !session.roles.includes("admin")) {
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "auth",
        status: "error",
        message: "Please sign in as an admin to continue.",
        setCookie: buildExpiredAdminSessionCookie()
      });
    }
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const payload = await readRequestPayload(request);
    const channel = parseRssAdminChannelInput(payload);
    const result = await upsertRssChannels(getPool(), [channel]);

    if (channel.channelId) {
      if (browserRequest) {
        return buildFlashRedirect(request, {
          section: "channels",
          status: "success",
          message: "Channel updated"
        });
      }
      return Response.json({
        updated: true,
        channelId: channel.channelId,
        updatedChannelIds: result.updatedChannelIds
      });
    }

    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "channels",
        status: "success",
        message: "Channel created"
      });
    }

    return Response.json(
      {
        channelId: result.createdChannelIds[0] ?? null,
        createdChannelIds: result.createdChannelIds
      },
      { status: 201 }
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Failed to upsert RSS channel.";
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "channels",
        status: "error",
        message: errorMessage
      });
    }
    return Response.json(
      {
        error: errorMessage
      },
      {
        status: 400
      }
    );
  }
};
