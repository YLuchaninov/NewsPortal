import type { APIRoute } from "astro";

import { resolveAdminSession } from "../../../lib/server/auth";
import { getPool } from "../../../lib/server/db";
import { readRequestPayload } from "../../../lib/server/request";
import {
  parseRssAdminChannelInput,
  upsertRssChannels
} from "../../../lib/server/rss-channels";

export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
  const session = await resolveAdminSession(request);
  if (!session || !session.roles.includes("admin")) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const payload = await readRequestPayload(request);
    const channel = parseRssAdminChannelInput(payload);
    const result = await upsertRssChannels(getPool(), [channel]);

    if (channel.channelId) {
      return Response.json({
        updated: true,
        channelId: channel.channelId,
        updatedChannelIds: result.updatedChannelIds
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
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to upsert RSS channel."
      },
      {
        status: 400
      }
    );
  }
};
