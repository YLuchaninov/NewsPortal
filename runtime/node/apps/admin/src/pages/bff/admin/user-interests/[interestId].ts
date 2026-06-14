import type { APIRoute } from "astro";
import type { PoolClient } from "pg";

import {
  adminActionError,
  adminActionSuccess,
  prepareAdminAction,
} from "../../../../lib/server/admin-action";
import { getPool } from "../../../../lib/server/db";
import { insertOutboxEvent } from "@signalops/control-plane/outbox";
import {
  buildUserInterestUpdatePatch,
  cloneAdminUserInterest,
  deleteAdminUserInterest,
  findAdminUserInterestTarget,
  updateAdminUserInterest,
  resolveAdminUserInterestLookupInput,
} from "../../../../lib/server/user-interests";

export const prerender = false;

function resolveErrorStatus(message: string): number {
  if (message === "Target userId or email is required." || message === "Interest id is required.") {
    return 400;
  }
  if (message === "User not found." || message === "Interest not found.") {
    return 404;
  }
  if (message === "Multiple users matched this email.") {
    return 409;
  }
  return 500;
}

function resolveLookupOrThrow(
  payload: Record<string, unknown>
): { userId?: string; email?: string } {
  const lookup = resolveAdminUserInterestLookupInput(payload);
  if (!lookup.userId && !lookup.email) {
    throw new Error("Target userId or email is required.");
  }
  return lookup;
}

async function resolveTargetOrThrow(
  queryable: Pick<PoolClient, "query">,
  payload: Record<string, unknown>
) {
  const target = await findAdminUserInterestTarget(
    queryable,
    resolveLookupOrThrow(payload)
  );
  if (!target) {
    throw new Error("User not found.");
  }
  return target;
}

export const POST: APIRoute = async ({ request, params }) => {
  const adminAction = await prepareAdminAction(request, {
    fallbackRedirectPath: "/",
    authFlashSection: "user-interests",
    actionToken: { scope: "user-interests" },
  });
  if (!adminAction.ok) {
    return adminAction.response;
  }

  const { payload, session } = adminAction.context;
  const interestId = params.interestId;
  if (!interestId) {
    return adminActionError(adminAction.context, {
      section: "user-interests",
      message: "Interest id is required.",
      status: 400,
    });
  }

  const actionIntent = String(payload._action ?? "update").trim();
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");
    const target = await resolveTargetOrThrow(client, payload);

    if (actionIntent === "delete") {
      await deleteAdminUserInterest(client, {
        actorUserId: session.userId,
        target,
        interestId,
      });
      await client.query("commit");

      return adminActionSuccess(adminAction.context, {
        section: "user-interests",
        message: "User interest deleted",
        json: { deleted: true, target },
      });
    }

    if (actionIntent === "clone") {
      const result = await cloneAdminUserInterest(client, {
        actorUserId: session.userId,
        target,
        interestId,
        descriptionOverride: String(payload.description ?? ""),
        queueCompileRequest: async (event) => insertOutboxEvent(client, event),
      });
      await client.query("commit");

      return adminActionSuccess(adminAction.context, {
        section: "user-interests",
        message: "User interest cloned. Compilation and background match sync started.",
        status: 201,
        json: {
          cloned: true,
          interestId: result.interestId,
          target,
        },
      });
    }

    const result = await updateAdminUserInterest(client, {
      actorUserId: session.userId,
      target,
      interestId,
      patch: buildUserInterestUpdatePatch(payload),
      queueCompileRequest: async (event) => insertOutboxEvent(client, event),
    });
    await client.query("commit");

    return adminActionSuccess(adminAction.context, {
      section: "user-interests",
      message: "User interest updated. Compilation and background match sync started.",
      json: { updated: true, version: result.version, target },
    });
  } catch (error) {
    await client.query("rollback");
    const message =
      error instanceof Error ? error.message : "Unable to update user interest.";
    return adminActionError(adminAction.context, {
      section: "user-interests",
      message:
        resolveErrorStatus(message) === 500
          ? "Unable to update user interest right now."
          : message,
      status: resolveErrorStatus(message),
      json: { error: message },
    });
  } finally {
    client.release();
  }
};
