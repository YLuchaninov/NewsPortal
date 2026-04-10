import type { APIRoute } from "astro";

import { getPool } from "../../../lib/server/db";
import { resolveWebSession } from "../../../lib/server/auth";
import {
  loadSavedDigestItems,
  parseSelectedDigestItemIds,
  renderSavedDigestHtml,
} from "../../../lib/server/saved-digest";

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const session = await resolveWebSession(request);
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const itemIds = parseSelectedDigestItemIds(url.searchParams);
  const items = await loadSavedDigestItems(getPool(), session.userId, itemIds);
  if (items.length === 0) {
    return new Response("No saved digest items selected.", { status: 400 });
  }

  return new Response(renderSavedDigestHtml(items), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": 'attachment; filename="saved-digest.html"',
    },
  });
};
