import type { APIRoute } from "astro";
import type { PoolClient } from "pg";

import {
  adminActionError,
  adminActionSuccess,
  prepareAdminAction,
} from "../../../lib/server/admin-action";
import { resolveAdminSession } from "../../../lib/server/auth";
import { getPool } from "../../../lib/server/db";
import { insertOutboxEvent } from "../../../lib/server/outbox";
import {
  createAdminUserInterest,
  findAdminUserInterestTarget,
  listAdminUserInterests,
  parseUserInterestCreateInput,
  resolveAdminUserInterestLookupInput,
} from "../../../lib/server/user-interests";

export const prerender = false;

function resolveErrorStatus(message: string): number {
  if (
    message === "Target userId or email is required." ||
    message === "Description is required."
  ) {
    return 400;
  }
  if (message === "User not found.") {
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
  const lookup = resolveLookupOrThrow(payload);
  const target = await findAdminUserInterestTarget(queryable, lookup);
  if (!target) {
    throw new Error("User not found.");
  }
  return target;
}

export const GET: APIRoute = async ({ request }) => {
  const session = await resolveAdminSession(request);
  if (!session || !session.roles.includes("admin")) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const requestUrl = new URL(request.url);
    const lookup = resolveLookupOrThrow(
      Object.fromEntries(requestUrl.searchParams.entries())
    );
    const pool = getPool();
    const target = await findAdminUserInterestTarget(pool, lookup);
    if (!target) {
      return Response.json({ error: "User not found." }, { status: 404 });
    }
    const interests = await listAdminUserInterests(pool, target.userId);
    return Response.json({ target, interests });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load user interests.";
    return Response.json({ error: message }, { status: resolveErrorStatus(message) });
  }
};

export const POST: APIRoute = async ({ request }) => {
  const action = await prepareAdminAction(request, {
    fallbackRedirectPath: "/",
    authFlashSection: "user-interests",
    actionToken: { scope: "user-interests" },
  });
  if (!action.ok) {
    return action.response;
  }

  const { payload, session } = action.context;
  let interestInput;
  try {
    interestInput = parseUserInterestCreateInput(payload);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Description is required.";
    return adminActionError(action.context, {
      section: "user-interests",
      message,
      status: resolveErrorStatus(message),
    });
  }

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");
    const target = await resolveTargetOrThrow(client, payload);
    const result = await createAdminUserInterest(client, {
      actorUserId: session.userId,
      target,
      interest: interestInput,
      queueCompileRequest: async (event) => insertOutboxEvent(client, event),
    });
    await client.query("commit");

    return adminActionSuccess(action.context, {
      section: "user-interests",
      message: "User interest created. Compilation and background match sync started.",
      status: 201,
      json: {
        interestId: result.interestId,
        target,
      },
    });
  } catch (error) {
    await client.query("rollback");
    const message =
      error instanceof Error ? error.message : "Unable to create user interest.";
    return adminActionError(action.context, {
      section: "user-interests",
      message:
        resolveErrorStatus(message) === 500
          ? "Unable to create user interest right now."
          : message,
      status: resolveErrorStatus(message),
      json: { error: message },
    });
  } finally {
    client.release();
  }
};
