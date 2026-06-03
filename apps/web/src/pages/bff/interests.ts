import type { APIRoute } from "astro";
import { WEB_BFF_ACTION_PAYLOAD_SCHEMAS } from "@newsportal/contracts";

import {
  buildFlashRedirect,
} from "../../lib/server/browser-flow";
import { getPool } from "../../lib/server/db";
import { insertOutboxEvent } from "../../lib/server/outbox";
import {
  buildInterestCompileRequestedEvent,
  createUserInterest,
  listUserInterestsForOwner,
  parseUserInterestCreateInput
} from "../../lib/server/user-interests";
import { resolveWebSession } from "../../lib/server/auth";
import { prepareWebAction } from "../../lib/server/web-action";

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
  const action = await prepareWebAction(request, {
    actionToken: { scope: "interests" },
    payloadSchema: WEB_BFF_ACTION_PAYLOAD_SCHEMAS["interests.create"],
    payloadBoundaryName: "interest create payload",
  });
  if (!action.ok) {
    return action.response;
  }
  const { browserRequest, payload, session } = action.context;
  if (!session) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

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
