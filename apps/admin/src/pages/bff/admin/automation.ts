import type { APIRoute } from "astro";

import { readRuntimeConfig } from "@newsportal/config";

import {
  buildAdminSignInPath,
  buildFlashRedirect,
  requestPrefersHtmlNavigation,
  resolveAdminRedirectPath,
} from "../../../lib/server/browser-flow";
import {
  buildExpiredAdminSessionCookie,
  resolveAdminSession,
} from "../../../lib/server/auth";
import { getPool } from "../../../lib/server/db";
import { readRequestPayload } from "../../../lib/server/request";
import {
  buildSequenceAuditPayload,
  buildSequenceCancelApiPayload,
  buildSequenceCreateApiPayload,
  buildSequenceManualRunApiPayload,
  buildSequenceUpdateApiPayload,
  resolveSequenceAdminIntent,
  type SequenceAdminIntent,
} from "../../../lib/server/automation";

export const prerender = false;

async function callAutomationApi<T>(path: string, init: RequestInit): Promise<T> {
  const runtimeConfig = readRuntimeConfig(process.env, {
    defaultAppBaseUrl: "http://127.0.0.1:4322/",
  });
  const response = await fetch(`${runtimeConfig.apiBaseUrl}${path}`, init);
  const payload = (await response.json().catch(() => ({}))) as T | { detail?: unknown };
  if (!response.ok) {
    const detail =
      payload && typeof payload === "object" && "detail" in payload
        ? (payload as { detail?: unknown }).detail
        : null;
    const message =
      Array.isArray(detail)
        ? detail.join("; ")
        : typeof detail === "string"
          ? detail
          : `Automation request failed with ${response.status}.`;
    throw new Error(message);
  }
  return payload as T;
}

async function writeAuditLog(
  actorUserId: string,
  actionType: string,
  entityType: string,
  entityId: string | null,
  payloadJson: Record<string, unknown>
): Promise<void> {
  await getPool().query(
    `
      insert into audit_log (
        actor_user_id,
        action_type,
        entity_type,
        entity_id,
        payload_json
      )
      values ($1, $2, $3, $4, $5::jsonb)
    `,
    [actorUserId, actionType, entityType, entityId, JSON.stringify(payloadJson)]
  );
}

function respondAutomationSuccess(
  request: Request,
  browserRequest: boolean,
  redirectTo: string,
  message: string,
  payload: unknown,
  status = 200
): Response {
  if (browserRequest) {
    return buildFlashRedirect(request, {
      section: "automation",
      status: "success",
      message,
      redirectTo,
    });
  }
  return Response.json(payload, { status });
}

function resolveActionType(intent: SequenceAdminIntent): string {
  switch (intent) {
    case "create_sequence":
      return "sequence_created";
    case "update_sequence":
      return "sequence_updated";
    case "archive_sequence":
      return "sequence_archived";
    case "run_sequence":
      return "sequence_run_requested";
    case "cancel_run":
      return "sequence_run_cancelled";
  }
}

export const POST: APIRoute = async ({ request }) => {
  const browserRequest = requestPrefersHtmlNavigation(request);
  const payload = await readRequestPayload(request);
  const redirectTo = resolveAdminRedirectPath(
    request,
    String(payload.redirectTo ?? request.headers.get("referer") ?? ""),
    "/automation"
  );
  const session = await resolveAdminSession(request);

  if (!session || !session.roles.includes("admin")) {
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "auth",
        status: "error",
        message: "Please sign in as an admin to continue.",
        setCookie: buildExpiredAdminSessionCookie(),
        redirectTo: buildAdminSignInPath(request, redirectTo),
      });
    }
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const intent = resolveSequenceAdminIntent(payload);

    if (intent === "create_sequence") {
      const result = await callAutomationApi<Record<string, unknown>>("/maintenance/sequences", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildSequenceCreateApiPayload(payload, session.userId)),
      });
      await writeAuditLog(
        session.userId,
        resolveActionType(intent),
        "sequence",
        String(result.sequence_id ?? ""),
        buildSequenceAuditPayload(intent, payload, result)
      );
      return respondAutomationSuccess(
        request,
        browserRequest,
        redirectTo,
        "Sequence created",
        result,
        201
      );
    }

    if (intent === "update_sequence") {
      const sequenceId = String(payload.sequenceId ?? "").trim();
      if (!sequenceId) {
        throw new Error("Sequence ID is required.");
      }
      const result = await callAutomationApi<Record<string, unknown>>(
        `/maintenance/sequences/${encodeURIComponent(sequenceId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(buildSequenceUpdateApiPayload(payload)),
        }
      );
      await writeAuditLog(
        session.userId,
        resolveActionType(intent),
        "sequence",
        sequenceId,
        buildSequenceAuditPayload(intent, payload, result)
      );
      return respondAutomationSuccess(
        request,
        browserRequest,
        redirectTo,
        "Sequence updated",
        result
      );
    }

    if (intent === "archive_sequence") {
      const sequenceId = String(payload.sequenceId ?? "").trim();
      if (!sequenceId) {
        throw new Error("Sequence ID is required.");
      }
      const result = await callAutomationApi<Record<string, unknown>>(
        `/maintenance/sequences/${encodeURIComponent(sequenceId)}`,
        {
          method: "DELETE",
        }
      );
      await writeAuditLog(
        session.userId,
        resolveActionType(intent),
        "sequence",
        sequenceId,
        buildSequenceAuditPayload(intent, payload, result)
      );
      return respondAutomationSuccess(
        request,
        browserRequest,
        redirectTo,
        "Sequence archived",
        result
      );
    }

    if (intent === "run_sequence") {
      const sequenceId = String(payload.sequenceId ?? "").trim();
      if (!sequenceId) {
        throw new Error("Sequence ID is required.");
      }
      const result = await callAutomationApi<Record<string, unknown>>(
        `/maintenance/sequences/${encodeURIComponent(sequenceId)}/runs`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(buildSequenceManualRunApiPayload(payload, session.userId)),
        }
      );
      await writeAuditLog(
        session.userId,
        resolveActionType(intent),
        "sequence_run",
        String(result.run_id ?? ""),
        buildSequenceAuditPayload(intent, payload, result)
      );
      return respondAutomationSuccess(
        request,
        browserRequest,
        redirectTo,
        "Sequence run requested",
        result,
        202
      );
    }

    const runId = String(payload.runId ?? "").trim();
    if (!runId) {
      throw new Error("Run ID is required.");
    }
    const result = await callAutomationApi<Record<string, unknown>>(
      `/maintenance/sequence-runs/${encodeURIComponent(runId)}/cancel`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildSequenceCancelApiPayload(payload)),
      }
    );
    await writeAuditLog(
      session.userId,
      resolveActionType(intent),
      "sequence_run",
      runId,
      buildSequenceAuditPayload(intent, payload, result)
    );
    return respondAutomationSuccess(
      request,
      browserRequest,
      redirectTo,
      "Sequence run cancelled",
      result
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update automation state.";
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "automation",
        status: "error",
        message,
        redirectTo,
      });
    }
    return Response.json({ error: message }, { status: 400 });
  }
};
