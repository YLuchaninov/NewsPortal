import type { APIRoute } from "astro";
import { randomUUID } from "node:crypto";

import { NOTIFICATION_FEEDBACK_RECORDED_EVENT } from "@newsportal/contracts";

import {
  buildFlashRedirect,
  requestPrefersHtmlNavigation
} from "../../lib/server/browser-flow";
import { getPool } from "../../lib/server/db";
import { insertOutboxEvent } from "../../lib/server/outbox";
import { readRequestPayload } from "../../lib/server/request";
import {
  buildExpiredSessionCookie,
  resolveWebSession
} from "../../lib/server/auth";

export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
  const browserRequest = requestPrefersHtmlNavigation(request);
  const session = await resolveWebSession(request);
  if (!session) {
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "auth",
        status: "error",
        message: "Please start a session to continue.",
        setCookie: buildExpiredSessionCookie()
      });
    }
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const payload = await readRequestPayload(request);
  const notificationId = String(payload.notificationId ?? "");
  const docId = String(payload.docId ?? "");
  const interestId = String(payload.interestId ?? "");
  const feedbackValue = String(payload.feedbackValue ?? "");
  if (!notificationId || !docId || !["helpful", "not_helpful"].includes(feedbackValue)) {
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "notifications",
        status: "error",
        message: "Invalid feedback payload."
      });
    }
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
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "notifications",
        status: "error",
        message: "Unable to record feedback right now."
      });
    }
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

  if (browserRequest) {
    return buildFlashRedirect(request, {
      section: "notifications",
      status: "success",
      message: "Feedback recorded"
    });
  }

  return Response.json({ ok: true });
};
