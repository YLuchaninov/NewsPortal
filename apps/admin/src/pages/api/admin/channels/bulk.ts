import type { APIRoute } from "astro";

import { resolveAdminSession } from "../../../../lib/server/auth";
import { getPool } from "../../../../lib/server/db";
import {
  parseBulkRssAdminChannelInputs,
  upsertRssChannels
} from "../../../../lib/server/rss-channels";

export const prerender = false;

async function readBulkPayload(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const payload = (await request.json()) as unknown;

    if (Array.isArray(payload)) {
      return payload;
    }

    if (payload != null && typeof payload === "object" && Array.isArray((payload as { channels?: unknown }).channels)) {
      return (payload as { channels: unknown[] }).channels;
    }

    throw new Error('Bulk RSS payload must be a JSON array or an object with a "channels" array.');
  }

  const formData = await request.formData();
  const rawJson = String(formData.get("channelsJson") ?? "").trim();

  if (!rawJson) {
    throw new Error('Bulk RSS form payload must include "channelsJson".');
  }

  try {
    return JSON.parse(rawJson) as unknown;
  } catch {
    throw new Error("Bulk RSS form payload must contain valid JSON.");
  }
}

export const POST: APIRoute = async ({ request }) => {
  const session = await resolveAdminSession(request);
  if (!session || !session.roles.includes("admin")) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const payload = await readBulkPayload(request);
    const channels = parseBulkRssAdminChannelInputs(payload);
    const result = await upsertRssChannels(getPool(), channels);

    return Response.json({
      createdChannelIds: result.createdChannelIds,
      updatedChannelIds: result.updatedChannelIds,
      createdCount: result.createdChannelIds.length,
      updatedCount: result.updatedChannelIds.length
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to import RSS channels."
      },
      {
        status: 400
      }
    );
  }
};
