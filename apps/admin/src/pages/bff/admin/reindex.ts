import type { APIRoute } from "astro";
import { randomUUID } from "node:crypto";

import { REINDEX_REQUESTED_EVENT } from "@newsportal/contracts";

import {
  adminActionError,
  adminActionSuccess,
  insertAdminAuditLog,
  prepareAdminAction,
} from "../../../lib/server/admin-action";
import { getPool } from "../../../lib/server/db";
import { insertOutboxEvent } from "../../../lib/server/outbox";

export const prerender = false;

function readBooleanField(value: unknown): boolean {
  if (typeof value !== "string") {
    return value === true;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "on" || normalized === "true" || normalized === "1" || normalized === "yes";
}

export const POST: APIRoute = async ({ request }) => {
  const action = await prepareAdminAction(request, {
    fallbackRedirectPath: "/reindex",
    actionToken: { scope: "reindex" },
  });
  if (!action.ok) {
    return action.response;
  }

  const { payload, session } = action.context;
  const indexName = String(payload.indexName ?? "interest_centroids");
  const requestedJobKind = String(payload.jobKind ?? "rebuild");
  const jobKind = requestedJobKind === "backfill" ? "backfill" : "rebuild";
  const includeEnrichment = jobKind === "backfill" && readBooleanField(payload.includeEnrichment);
  const forceEnrichment = includeEnrichment && readBooleanField(payload.forceEnrichment);
  const optionsJson =
    jobKind === "backfill"
      ? {
          batchSize: 100,
          retroNotifications: "skip",
          replayExistingArticles: true,
          includeEnrichment,
          forceEnrichment,
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
    await insertAdminAuditLog(client, {
      actorUserId: session.userId,
      actionType: "reindex_requested",
      entityType: "reindex_job",
      entityId: reindexJobId,
      payloadJson: { indexName, jobKind, options: optionsJson },
    });
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    return adminActionError(action.context, {
      section: "reindex",
      message: "Unable to queue reindex right now.",
      status: 500,
      json: {
        error: error instanceof Error ? error.message : "Failed to queue reindex."
      },
    });
  } finally {
    client.release();
  }

  return adminActionSuccess(action.context, {
    section: "reindex",
    message:
      jobKind === "backfill"
        ? includeEnrichment
          ? "Reindex and historical enrichment repair queued"
          : "Reindex and historical backfill queued"
        : "Reindex queued",
    status: 201,
    json: { reindexJobId },
  });
};
