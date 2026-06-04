import type { APIRoute } from "astro";

import {
  cancelReindexJob,
  queueReindexJobWithSupersession,
} from "@signalops/control-plane";

import {
  adminActionError,
  adminActionSuccess,
  insertAdminAuditLog,
  prepareAdminAction,
} from "../../../lib/server/admin-action";
import { getPool } from "../../../lib/server/db";

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
  const intent = String(payload.intent ?? "queue");
  if (intent === "cancel") {
    const reindexJobId = String(payload.reindexJobId ?? "").trim();
    if (!reindexJobId) {
      return adminActionError(action.context, {
        section: "reindex",
        message: "Choose a reindex job to cancel.",
        status: 400,
        json: { error: "reindexJobId is required." },
      });
    }

    const pool = getPool();
    const client = await pool.connect();
    let cancelResult: Awaited<ReturnType<typeof cancelReindexJob>>;
    try {
      await client.query("begin");
      cancelResult = await cancelReindexJob(client, {
        reindexJobId,
        reason: "Cancelled from the admin reindex job list.",
      });
      await insertAdminAuditLog(client, {
        actorUserId: session.userId,
        actionType: cancelResult.changed
          ? "reindex_cancel_requested"
          : "reindex_cancel_noop",
        entityType: "reindex_job",
        entityId: reindexJobId,
        payloadJson: {
          reindexJobId: cancelResult.reindexJobId,
          previousStatus: cancelResult.previousStatus,
          status: cancelResult.status,
          changed: cancelResult.changed,
          terminal: cancelResult.terminal,
        },
      });
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      return adminActionError(action.context, {
        section: "reindex",
        message: "Unable to cancel reindex right now.",
        status: 500,
        json: {
          error: error instanceof Error ? error.message : "Failed to cancel reindex."
        },
      });
    } finally {
      client.release();
    }

    return adminActionSuccess(action.context, {
      section: "reindex",
      message: cancelResult.changed
        ? cancelResult.status === "cancelled"
          ? "Reindex job cancelled."
          : "Reindex job cancellation requested."
        : cancelResult.terminal
          ? "Reindex job is already finished."
          : "Reindex job is already cancelling.",
      status: 200,
      json: cancelResult,
    });
  }

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
  const pool = getPool();
  const client = await pool.connect();
  let queuedJob: Awaited<ReturnType<typeof queueReindexJobWithSupersession>>;

  try {
    await client.query("begin");
    queuedJob = await queueReindexJobWithSupersession(client, {
      indexName,
      jobKind,
      optionsJson,
      requestedByUserId: session.userId,
    });
    await insertAdminAuditLog(client, {
      actorUserId: session.userId,
      actionType: "reindex_requested",
      entityType: "reindex_job",
      entityId: queuedJob.reindexJobId,
      payloadJson: {
        indexName,
        jobKind,
        options: optionsJson,
        cancellationKey: queuedJob.cancellationKey,
        supersession: {
          cancelledQueuedCount: queuedJob.cancelledQueuedCount,
          cancellationRequestedCount: queuedJob.cancellationRequestedCount,
        },
      },
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
    json: queuedJob,
  });
};
