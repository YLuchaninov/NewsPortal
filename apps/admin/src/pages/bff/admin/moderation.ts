import type { APIRoute } from "astro";
import { randomUUID } from "node:crypto";

import {
  adminActionError,
  adminActionSuccess,
  insertAdminAuditLog,
  prepareAdminAction,
  readRequiredAdminText,
} from "../../../lib/server/admin-action";
import { getPool } from "../../../lib/server/db";

export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
  const action = await prepareAdminAction(request, {
    fallbackRedirectPath: "/signal-candidates",
    actionToken: { scope: "moderation" },
  });
  if (!action.ok) {
    return action.response;
  }

  const { payload, session } = action.context;
  let docId: string;
  let actionType: "block" | "unblock";
  try {
    docId = readRequiredAdminText(payload, "docId", "Invalid moderation payload.");
    const requestedActionType = String(payload.actionType ?? "");
    if (requestedActionType !== "block" && requestedActionType !== "unblock") {
      throw new Error("Invalid moderation payload.");
    }
    actionType = requestedActionType;
  } catch {
    return adminActionError(action.context, {
      section: "signal_candidates",
      message: "Invalid moderation payload.",
      status: 400,
    });
  }
  const reason = String(payload.reason ?? "");

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `
        update signal_candidates
        set
          visibility_state = $2,
          updated_at = now()
        where doc_id = $1
      `,
      [docId, actionType === "block" ? "blocked" : "visible"]
    );
    await client.query(
      `
        insert into signal_candidate_moderation_actions (
          moderation_action_id,
          doc_id,
          admin_user_id,
          action_type,
          reason
        )
        values ($1, $2, $3, $4, $5)
      `,
      [randomUUID(), docId, session.userId, actionType, reason || null]
    );
    await insertAdminAuditLog(client, {
      actorUserId: session.userId,
      actionType: "signal_candidate_moderation",
      entityType: "signal_candidate",
      entityId: docId,
      payloadJson: { actionType, reason },
    });
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    return adminActionError(action.context, {
      section: "signal_candidates",
      message: "Unable to update signal_candidate moderation right now.",
      status: 500,
      json: {
        error: error instanceof Error ? error.message : "Moderation failed.",
      },
    });
  } finally {
    client.release();
  }

  return adminActionSuccess(action.context, {
    section: "signal_candidates",
    message: actionType === "block" ? "SignalCandidate blocked" : "SignalCandidate unblocked",
    json: { ok: true },
  });
};
