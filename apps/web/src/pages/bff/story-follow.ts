import type { APIRoute } from "astro";

import { getPool } from "../../lib/server/db";
import { readRequestPayload } from "../../lib/server/request";
import {
  buildExpiredSessionCookie,
  resolveWebSession,
} from "../../lib/server/auth";
import { setStoryFollowState } from "../../lib/server/user-content-state";

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

  if (!contentItemId || !["follow", "unfollow"].includes(action)) {
    return Response.json(
      { error: "contentItemId and a valid follow action are required." },
      { status: 400 }
    );
  }

  try {
    const userState = await setStoryFollowState(
      getPool(),
      session.userId,
      contentItemId,
      action === "follow"
    );
    return Response.json({ ok: true, userState });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unable to update followed story state.",
      },
      { status: 400 }
    );
  }
};
