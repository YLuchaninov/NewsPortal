import type { APIRoute } from "astro";

import {
  buildFlashRedirect,
  requestPrefersHtmlNavigation
} from "../../../lib/server/browser-flow";
import { getPool } from "../../../lib/server/db";
import { insertOutboxEvent } from "../../../lib/server/outbox";
import { readRequestPayload } from "../../../lib/server/request";
import {
  buildInterestCompileRequestedEvent,
  buildUserInterestUpdatePatch,
  cloneUserInterest,
  deleteUserInterest,
  updateUserInterest
} from "../../../lib/server/user-interests";
import {
  buildExpiredSessionCookie,
  resolveWebSession
} from "../../../lib/server/auth";

export const prerender = false;
export const POST: APIRoute = async ({ request, params }) => {
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

  const interestId = params.interestId;
  if (!interestId) {
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "interests",
        status: "error",
        message: "Interest id is required."
      });
    }
    return Response.json({ error: "Interest id is required." }, { status: 400 });
  }

  const payload = await readRequestPayload(request);
  const action = String(payload._action ?? "update");
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");

    if (action === "delete") {
      await deleteUserInterest(client, interestId, session.userId);
      await client.query("commit");
      if (browserRequest) {
        return buildFlashRedirect(request, {
          section: "interests",
          status: "success",
          message: "Interest deleted"
        });
      }
      return Response.json({ deleted: true });
    }

    if (action === "clone") {
      const result = await cloneUserInterest(
        client,
        interestId,
        session.userId,
        String(payload.description ?? "")
      );
      await insertOutboxEvent(
        client,
        buildInterestCompileRequestedEvent(result.interestId, result.version)
      );
      await client.query("commit");
      if (browserRequest) {
        return buildFlashRedirect(request, {
          section: "interests",
          status: "success",
          message: "Interest cloned"
        });
      }
      return Response.json(
        { cloned: true, interestId: result.interestId },
        { status: 201 }
      );
    }

    const result = await updateUserInterest(
      client,
      interestId,
      session.userId,
      buildUserInterestUpdatePatch(payload)
    );
    await insertOutboxEvent(
      client,
      buildInterestCompileRequestedEvent(result.interestId, result.version)
    );
    await client.query("commit");
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "interests",
        status: "success",
        message: "Interest updated"
      });
    }
    return Response.json({ updated: true, version: result.version });
  } catch (error) {
    await client.query("rollback");
    const errorMessage = error instanceof Error ? error.message : "Failed to update interest.";
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "interests",
        status: "error",
        message: errorMessage === "Interest not found." ? errorMessage : "Unable to update interest right now."
      });
    }
    return Response.json(
      {
        error: errorMessage
      },
      {
        status: 500
      }
    );
  } finally {
    client.release();
  }
};
