import type { APIRoute } from "astro";
import { WEB_BFF_ACTION_PAYLOAD_SCHEMAS } from "@signalops/contracts";

import { getPool } from "../../lib/server/db";
import { prepareWebAction } from "../../lib/server/web-action";
import {
  markContentItemSeen,
  markContentItemUnread,
  setContentItemSavedState,
} from "../../lib/server/user-content-state";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const prepared = await prepareWebAction(request, {
    authSetCookie: true,
    actionToken: { scope: "content-state" },
    payloadSchema: WEB_BFF_ACTION_PAYLOAD_SCHEMAS["content-state"],
    payloadBoundaryName: "content-state payload",
  });
  if (!prepared.ok) {
    return prepared.response;
  }

  const { payload, session } = prepared.context;
  if (!session) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }
  const contentItemId = String(payload.contentItemId ?? "").trim();
  const actionType = String(payload.action ?? "").trim();

  if (!contentItemId || !actionType) {
    return Response.json(
      { error: "contentItemId and action are required." },
      { status: 400 }
    );
  }

  const pool = getPool();
  try {
    const userState =
      actionType === "mark_seen"
        ? await markContentItemSeen(pool, session.userId, contentItemId)
        : actionType === "mark_unread"
          ? await markContentItemUnread(pool, session.userId, contentItemId)
          : actionType === "save"
            ? await setContentItemSavedState(pool, session.userId, contentItemId, "saved")
            : actionType === "unsave"
              ? await setContentItemSavedState(pool, session.userId, contentItemId, "none")
              : actionType === "archive"
                ? await setContentItemSavedState(pool, session.userId, contentItemId, "archived")
                : null;

    if (!userState) {
      return Response.json({ error: `Unsupported action "${actionType}".` }, { status: 400 });
    }

    return Response.json({ ok: true, userState });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unable to update content state.",
      },
      { status: 400 }
    );
  }
};
