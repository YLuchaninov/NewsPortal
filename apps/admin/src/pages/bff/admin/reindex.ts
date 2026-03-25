import type { APIRoute } from "astro";
import { randomUUID } from "node:crypto";

import { REINDEX_REQUESTED_EVENT } from "@newsportal/contracts";

import {
  buildAdminSignInPath,
  buildFlashRedirect,
  requestPrefersHtmlNavigation,
  resolveAdminRedirectPath,
} from "../../../lib/server/browser-flow";
import {
  buildExpiredAdminSessionCookie,
  resolveAdminSession
} from "../../../lib/server/auth";
import { getPool } from "../../../lib/server/db";
import { insertOutboxEvent } from "../../../lib/server/outbox";
import { readRequestPayload } from "../../../lib/server/request";

export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
  const browserRequest = requestPrefersHtmlNavigation(request);
  const redirectTo = resolveAdminRedirectPath(
    request,
    request.headers.get("referer"),
    "/reindex"
  );
  const session = await resolveAdminSession(request);
  if (!session || !session.roles.includes("admin")) {
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "auth",
        status: "error",
        message: "Please sign in as an admin to continue.",
        setCookie: buildExpiredAdminSessionCookie(),
        redirectTo: buildAdminSignInPath(request, redirectTo)
      });
    }
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  const payload = await readRequestPayload(request);
  const indexName = String(payload.indexName ?? "interest_centroids");
  const requestedJobKind = String(payload.jobKind ?? "rebuild");
  const jobKind = requestedJobKind === "backfill" ? "backfill" : "rebuild";
  const optionsJson =
    jobKind === "backfill"
      ? {
          batchSize: 100,
          retroNotifications: "skip",
          replayExistingArticles: true,
        }
      : {};
  const reindexJobId = randomUUID();
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query(
      `
        insert into reindex_jobs (
          reindex_job_id,
          index_name,
          job_kind,
          options_json,
          requested_by_user_id,
          status
        )
        values ($1, $2, $3, $4::jsonb, $5, 'queued')
      `,
      [reindexJobId, indexName, jobKind, JSON.stringify(optionsJson), session.userId]
    );
    await insertOutboxEvent(client, {
      eventType: REINDEX_REQUESTED_EVENT,
      aggregateType: "reindex_job",
      aggregateId: reindexJobId,
      payload: {
        reindexJobId,
        indexName,
        jobKind,
        version: 1
      }
    });
    await client.query(
      `
        insert into audit_log (
          actor_user_id,
          action_type,
          entity_type,
          entity_id,
          payload_json
        )
        values ($1, 'reindex_requested', 'reindex_job', $2, $3::jsonb)
      `,
      [session.userId, reindexJobId, JSON.stringify({ indexName, jobKind, options: optionsJson })]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "reindex",
        status: "error",
        message: "Unable to queue reindex right now.",
        redirectTo
      });
    }
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to queue reindex."
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
      section: "reindex",
      status: "success",
      message: jobKind === "backfill" ? "Reindex and historical backfill queued" : "Reindex queued",
      redirectTo
    });
  }

  return Response.json({ reindexJobId }, { status: 201 });
};
