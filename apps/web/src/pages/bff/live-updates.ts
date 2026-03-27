import type { APIRoute } from "astro";

import { resolveWebSession } from "../../lib/server/auth";
import { serializeLiveUpdatesResponse } from "../../lib/live-updates";
import { loadLiveUpdatesSnapshot } from "../../lib/server/live-updates";

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const session = await resolveWebSession(request);
  if (!session) {
    return Response.json(serializeLiveUpdatesResponse(null), {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  }

  const snapshot = await loadLiveUpdatesSnapshot(session.userId);
  return Response.json(serializeLiveUpdatesResponse(snapshot), {
    headers: {
      "Cache-Control": "no-store",
    },
  });
};
