import type { APIRoute } from "astro";

import {
  buildFlashRedirect,
  requestPrefersHtmlNavigation
} from "../../lib/server/browser-flow";
import { getPool } from "../../lib/server/db";
import { insertOutboxEvent } from "../../lib/server/outbox";
import { readRequestPayload } from "../../lib/server/request";
import {
  buildInterestCompileRequestedEvent,
  createUserInterest,
  listUserInterestsForOwner,
  parseUserInterestCreateInput
} from "../../lib/server/user-interests";
import {
  buildExpiredSessionCookie,
  resolveWebSession
} from "../../lib/server/auth";

export const prerender = false;
export const GET: APIRoute = async ({ request }) => {
  const session = await resolveWebSession(request);
  if (!session) {
    return Response.json({ interests: [] }, { status: 200 });
  }

  const interests = await listUserInterestsForOwner(getPool(), session.userId);
  return Response.json({ interests });
};

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
  let input;
  try {
    input = parseUserInterestCreateInput(payload);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Description is required.";
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "interests",
        status: "error",
        message: errorMessage
      });
    }
    return Response.json({ error: errorMessage }, { status: 400 });
  }
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");
    const result = await createUserInterest(client, session.userId, input);
    await insertOutboxEvent(
      client,
      buildInterestCompileRequestedEvent(result.interestId, result.version)
    );
    await client.query("commit");
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "interests",
        status: "success",
        message: "Interest created. Compilation and background match sync started."
      });
    }

    return Response.json({ interestId: result.interestId }, { status: 201 });
  } catch (error) {
    await client.query("rollback");
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "interests",
        status: "error",
        message: "Unable to create interest right now."
      });
    }
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to create interest."
      },
      {
        status: 500
      }
    );
  } finally {
    client.release();
  }
};
