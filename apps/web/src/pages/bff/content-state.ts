import type { APIRoute } from "astro";

import { getPool } from "../../lib/server/db";
import { readRequestPayload } from "../../lib/server/request";
import {
  buildExpiredSessionCookie,
  resolveWebSession,
} from "../../lib/server/auth";
import {
  markContentItemSeen,
  markContentItemUnread,
  setContentItemSavedState,
} from "../../lib/server/user-content-state";

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

  const payload = await readRequestPayload(request);
  const contentItemId = String(payload.contentItemId ?? "").trim();
  const action = String(payload.action ?? "").trim();

  if (!contentItemId || !action) {
    return Response.json(
      { error: "contentItemId and action are required." },
      { status: 400 }
    );
  }

  const pool = getPool();
  try {
    const userState =
      action === "mark_seen"
        ? await markContentItemSeen(pool, session.userId, contentItemId)
        : action === "mark_unread"
          ? await markContentItemUnread(pool, session.userId, contentItemId)
          : action === "save"
            ? await setContentItemSavedState(pool, session.userId, contentItemId, "saved")
            : action === "unsave"
              ? await setContentItemSavedState(pool, session.userId, contentItemId, "none")
              : action === "archive"
                ? await setContentItemSavedState(pool, session.userId, contentItemId, "archived")
                : null;

    if (!userState) {
      return Response.json({ error: `Unsupported action "${action}".` }, { status: 400 });
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
