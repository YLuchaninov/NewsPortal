import type { APIRoute } from "astro";
import type { PoolClient } from "pg";

import {
  buildAdminSignInPath,
  buildFlashRedirect,
  requestPrefersHtmlNavigation,
  resolveAdminRedirectPath,
} from "../../../../lib/server/browser-flow";
import {
  buildExpiredAdminSessionCookie,
  resolveAdminSession,
} from "../../../../lib/server/auth";
import { getPool } from "../../../../lib/server/db";
import { insertOutboxEvent } from "../../../../lib/server/outbox";
import { readRequestPayload } from "../../../../lib/server/request";
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
  const browserRequest = requestPrefersHtmlNavigation(request);
  const payload = await readRequestPayload(request);
  const redirectTo = resolveAdminRedirectPath(
    request,
    String(payload.redirectTo ?? request.headers.get("referer") ?? ""),
    "/"
  );
  const session = await resolveAdminSession(request);

  if (!session || !session.roles.includes("admin")) {
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "user-interests",
        status: "error",
        message: "Please sign in as an admin to continue.",
        setCookie: buildExpiredAdminSessionCookie(),
        redirectTo: buildAdminSignInPath(request, redirectTo),
      });
    }
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  const interestId = params.interestId;
  if (!interestId) {
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "user-interests",
        status: "error",
        message: "Interest id is required.",
        redirectTo,
      });
    }
    return Response.json({ error: "Interest id is required." }, { status: 400 });
  }

  const action = String(payload._action ?? "update").trim();
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");
    const target = await resolveTargetOrThrow(client, payload);

    if (action === "delete") {
      await deleteAdminUserInterest(client, {
        actorUserId: session.userId,
        target,
        interestId,
      });
      await client.query("commit");

      if (browserRequest) {
        return buildFlashRedirect(request, {
          section: "user-interests",
          status: "success",
          message: "User interest deleted",
          redirectTo,
        });
      }

      return Response.json({ deleted: true, target });
    }

    if (action === "clone") {
      const result = await cloneAdminUserInterest(client, {
        actorUserId: session.userId,
        target,
        interestId,
        descriptionOverride: String(payload.description ?? ""),
        queueCompileRequest: async (event) => insertOutboxEvent(client, event),
      });
      await client.query("commit");

      if (browserRequest) {
        return buildFlashRedirect(request, {
          section: "user-interests",
          status: "success",
          message: "User interest cloned. Compilation and background match sync started.",
          redirectTo,
        });
      }

      return Response.json(
        {
          cloned: true,
          interestId: result.interestId,
          target,
        },
        { status: 201 }
      );
    }

    const result = await updateAdminUserInterest(client, {
      actorUserId: session.userId,
      target,
      interestId,
      patch: buildUserInterestUpdatePatch(payload),
      queueCompileRequest: async (event) => insertOutboxEvent(client, event),
    });
    await client.query("commit");

    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "user-interests",
        status: "success",
        message: "User interest updated. Compilation and background match sync started.",
        redirectTo,
      });
    }

    return Response.json({ updated: true, version: result.version, target });
  } catch (error) {
    await client.query("rollback");
    const message =
      error instanceof Error ? error.message : "Unable to update user interest.";
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "user-interests",
        status: "error",
        message:
          resolveErrorStatus(message) === 500
            ? "Unable to update user interest right now."
            : message,
        redirectTo,
      });
    }
    return Response.json({ error: message }, { status: resolveErrorStatus(message) });
  } finally {
    client.release();
  }
};
