import type { APIRoute } from "astro";

import { getPool } from "../../lib/server/db";
import {
  buildExpiredSessionCookie,
  resolveWebSession,
} from "../../lib/server/auth";
import {
  loadSavedDigestItems,
  parseSelectedDigestItemIds,
  queueManualSavedDigest,
} from "../../lib/server/saved-digest";

function buildReturnRedirect(request: Request, returnTo: string, status: "success" | "error", message: string): Response {
  const requestUrl = new URL(request.url);
  const location = new URL(returnTo || "/saved/digest", requestUrl);
  location.searchParams.set("flash_status", status);
  location.searchParams.set("flash_message", message);
  return new Response(null, {
    status: 303,
    headers: {
      Location: location.toString(),
    },
  });
}

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const session = await resolveWebSession(request);
  if (!session) {
    return Response.json(
      { error: "Unauthorized." },
      {
        status: 401,
        headers: {
          "Set-Cookie": buildExpiredSessionCookie(),
        },
      }
    );
  }

  const formData = await request.formData();
  const itemIds = parseSelectedDigestItemIds(formData);
  const returnTo = String(formData.get("returnTo") ?? "/saved/digest").trim() || "/saved/digest";
  if (itemIds.length === 0) {
    return buildReturnRedirect(request, returnTo, "error", "Select at least one saved item.");
  }

  try {
    const items = await loadSavedDigestItems(getPool(), session.userId, itemIds);
    if (items.length === 0) {
      return buildReturnRedirect(request, returnTo, "error", "No saved items were available for this digest.");
    }

    const queued = await queueManualSavedDigest(getPool(), session.userId, items);
    return buildReturnRedirect(
      request,
      returnTo,
      "success",
      `Saved digest queued for ${queued.recipientEmail}.`
    );
  } catch (error) {
    return buildReturnRedirect(
      request,
      returnTo,
      "error",
      error instanceof Error ? error.message : "Unable to queue the saved digest."
    );
  }
};
