import type { APIRoute } from "astro";
import {
  assertJsonSchema,
  WEB_BFF_ACTION_PAYLOAD_SCHEMAS,
} from "@signalops/contracts";

import { getPool } from "../../lib/server/db";
import { prepareWebAction } from "../../lib/server/web-action";
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
  const action = await prepareWebAction(request, {
    authSetCookie: true,
    actionToken: { scope: "saved-digest" },
    payloadReader: async (actionRequest) =>
      Object.fromEntries((await actionRequest.clone().formData()).entries()),
  });
  if (!action.ok) {
    return action.response;
  }
  const { session } = action.context;
  if (!session) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const formData = await request.formData();
  try {
    assertJsonSchema(Object.fromEntries(formData.entries()), WEB_BFF_ACTION_PAYLOAD_SCHEMAS["saved-digest"], {
      boundaryName: "saved-digest payload",
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Invalid saved digest payload.",
      },
      { status: 400 },
    );
  }
  const itemIds = parseSelectedDigestItemIds(formData);
  const returnTo = String(formData.get("returnTo") ?? "/saved/digest").trim() || "/saved/digest";

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
