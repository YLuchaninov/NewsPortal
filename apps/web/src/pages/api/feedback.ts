import type { APIRoute } from "astro";
import { randomUUID } from "node:crypto";

import { NOTIFICATION_FEEDBACK_RECORDED_EVENT } from "@newsportal/contracts";

import { getPool } from "../../lib/server/db";
import { insertOutboxEvent } from "../../lib/server/outbox";
import { readRequestPayload } from "../../lib/server/request";
import { resolveWebSession } from "../../lib/server/auth";

export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
  const session = await resolveWebSession(request);
  if (!session) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const payload = await readRequestPayload(request);
  const notificationId = String(payload.notificationId ?? "");
  const docId = String(payload.docId ?? "");
  const interestId = String(payload.interestId ?? "");
  const feedbackValue = String(payload.feedbackValue ?? "");
  if (!notificationId || !docId || !["helpful", "not_helpful"].includes(feedbackValue)) {
    return Response.json({ error: "Invalid feedback payload." }, { status: 400 });
  }

  const feedbackId = randomUUID();
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query(
      `
        insert into notification_feedback (
          feedback_id,
          user_id,
          notification_id,
          doc_id,
          interest_id,
          feedback_value
        )
        values ($1, $2, $3, $4, $5, $6)
        on conflict (user_id, notification_id) do update
        set
          feedback_value = excluded.feedback_value,
          created_at = now()
      `,
      [
        feedbackId,
        session.userId,
        notificationId,
        docId,
        interestId || null,
        feedbackValue
      ]
    );
    await insertOutboxEvent(client, {
      eventType: NOTIFICATION_FEEDBACK_RECORDED_EVENT,
      aggregateType: "notification_feedback",
      aggregateId: feedbackId,
      payload: {
        notificationId,
        docId,
        userId: session.userId,
        interestId: interestId || null,
        version: 1
      }
    });
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to record feedback."
      },
      {
        status: 500
      }
    );
  } finally {
    client.release();
  }

  return Response.json({ ok: true });
};
