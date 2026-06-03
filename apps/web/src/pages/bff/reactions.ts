import type { APIRoute } from "astro";
import { randomUUID } from "node:crypto";
import { WEB_BFF_ACTION_PAYLOAD_SCHEMAS } from "@newsportal/contracts";

import {
  buildFlashRedirect,
} from "../../lib/server/browser-flow";
import { getPool } from "../../lib/server/db";
import { prepareWebAction } from "../../lib/server/web-action";

export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
  const action = await prepareWebAction(request, {
    actionToken: { scope: "reactions" },
    payloadSchema: WEB_BFF_ACTION_PAYLOAD_SCHEMAS.reactions,
    payloadBoundaryName: "reactions payload",
  });
  if (!action.ok) {
    return action.response;
  }
  const { browserRequest, payload, session } = action.context;
  if (!session) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const docId = String(payload.docId ?? "");
  const reactionType = String(payload.reactionType ?? "");
  if (!docId || !["like", "dislike"].includes(reactionType)) {
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "feed",
        status: "error",
        message: "docId and reactionType are required."
      });
    }
    return Response.json({ error: "docId and reactionType are required." }, { status: 400 });
  }

  const pool = getPool();
  await pool.query(
    `
      insert into user_article_reactions (
        reaction_id,
        doc_id,
        user_id,
        reaction_type
      )
      values ($1, $2, $3, $4)
      on conflict (user_id, doc_id) do update
      set
        reaction_type = excluded.reaction_type,
        updated_at = now()
    `,
    [randomUUID(), docId, session.userId, reactionType]
  );

  if (browserRequest) {
    return buildFlashRedirect(request, {
      section: "feed",
      status: "success",
      message: "Reaction saved"
    });
  }

  return Response.json({ ok: true });
};
