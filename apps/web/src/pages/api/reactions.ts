import type { APIRoute } from "astro";
import { randomUUID } from "node:crypto";

import { getPool } from "../../lib/server/db";
import { readRequestPayload } from "../../lib/server/request";
import { resolveWebSession } from "../../lib/server/auth";

export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
  const session = await resolveWebSession(request);
  if (!session) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const payload = await readRequestPayload(request);
  const docId = String(payload.docId ?? "");
  const reactionType = String(payload.reactionType ?? "");
  if (!docId || !["like", "dislike"].includes(reactionType)) {
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

  return Response.json({ ok: true });
};
