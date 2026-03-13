import type { APIRoute } from "astro";

import { INTEREST_COMPILE_REQUESTED_EVENT } from "@newsportal/contracts";

import { getPool } from "../../../lib/server/db";
import { insertOutboxEvent } from "../../../lib/server/outbox";
import { readRequestPayload } from "../../../lib/server/request";
import { resolveWebSession } from "../../../lib/server/auth";

export const prerender = false;
export const POST: APIRoute = async ({ request, params }) => {
  const session = await resolveWebSession(request);
  if (!session) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const interestId = params.interestId;
  if (!interestId) {
    return Response.json({ error: "Interest id is required." }, { status: 400 });
  }

  const payload = await readRequestPayload(request);
  const action = String(payload._action ?? "update");
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");

    if (action === "delete") {
      await client.query(
        `
          delete from user_interests
          where interest_id = $1 and user_id = $2
        `,
        [interestId, session.userId]
      );
      await client.query("commit");
      return Response.json({ deleted: true });
    }

    const currentRow = await client.query<{ version: number }>(
      `
        select version
        from user_interests
        where interest_id = $1 and user_id = $2
      `,
      [interestId, session.userId]
    );
    if (!currentRow.rows[0]) {
      throw new Error("Interest not found.");
    }

    const nextVersion = currentRow.rows[0].version + 1;
    await client.query(
      `
        update user_interests
        set
          description = coalesce($3, description),
          positive_texts = coalesce($4::jsonb, positive_texts),
          negative_texts = coalesce($5::jsonb, negative_texts),
          enabled = coalesce($6, enabled),
          compiled = false,
          compile_status = 'queued',
          version = $7,
          updated_at = now()
        where interest_id = $1 and user_id = $2
      `,
      [
        interestId,
        session.userId,
        payload.description ? String(payload.description) : null,
        payload.positive_texts
          ? JSON.stringify(String(payload.positive_texts).split("\n").map((value) => value.trim()).filter(Boolean))
          : null,
        payload.negative_texts
          ? JSON.stringify(String(payload.negative_texts).split("\n").map((value) => value.trim()).filter(Boolean))
          : null,
        payload.enabled != null ? String(payload.enabled) === "true" : null,
        nextVersion
      ]
    );
    await insertOutboxEvent(client, {
      eventType: INTEREST_COMPILE_REQUESTED_EVENT,
      aggregateType: "interest",
      aggregateId: interestId,
      payload: {
        interestId,
        version: nextVersion
      }
    });
    await client.query("commit");
    return Response.json({ updated: true, version: nextVersion });
  } catch (error) {
    await client.query("rollback");
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to update interest."
      },
      {
        status: 500
      }
    );
  } finally {
    client.release();
  }
};
