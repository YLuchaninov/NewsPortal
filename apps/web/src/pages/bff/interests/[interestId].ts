import type { APIRoute } from "astro";
import { WEB_BFF_ACTION_PAYLOAD_SCHEMAS } from "@newsportal/contracts";

import { buildFlashRedirect } from "../../../lib/server/browser-flow";
import { getPool } from "../../../lib/server/db";
import { insertOutboxEvent } from "../../../lib/server/outbox";
import {
  buildInterestCompileRequestedEvent,
  buildUserInterestUpdatePatch,
  cloneUserInterest,
  deleteUserInterest,
  updateUserInterest
} from "../../../lib/server/user-interests";
import { prepareWebAction } from "../../../lib/server/web-action";

export const prerender = false;
export const POST: APIRoute = async ({ request, params }) => {
  const prepared = await prepareWebAction(request, {
    actionToken: { scope: "interests.update" },
    payloadSchema: WEB_BFF_ACTION_PAYLOAD_SCHEMAS["interests.update"],
    payloadBoundaryName: "interest mutation payload",
  });
  if (!prepared.ok) {
    return prepared.response;
  }
  const { browserRequest, payload, session } = prepared.context;
  if (!session) {
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

  const actionType = String(payload._action ?? "update");
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");

    if (actionType === "delete") {
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

    if (actionType === "clone") {
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
          message: "Interest cloned. Compilation and background match sync started."
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
        message: "Interest updated. Compilation and background match sync started."
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
