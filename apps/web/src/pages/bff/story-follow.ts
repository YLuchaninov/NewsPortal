import type { APIRoute } from "astro";
import { WEB_BFF_ACTION_PAYLOAD_SCHEMAS } from "@newsportal/contracts";

import { getPool } from "../../lib/server/db";
import { prepareWebAction } from "../../lib/server/web-action";
import { setStoryFollowState } from "../../lib/server/user-content-state";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const prepared = await prepareWebAction(request, {
    authSetCookie: true,
    actionToken: { scope: "story-follow" },
    payloadSchema: WEB_BFF_ACTION_PAYLOAD_SCHEMAS["story-follow"],
    payloadBoundaryName: "story-follow payload",
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

  if (!contentItemId || !["follow", "unfollow"].includes(actionType)) {
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
      actionType === "follow"
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
