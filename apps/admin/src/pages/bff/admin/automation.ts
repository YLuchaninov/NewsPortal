import type { APIRoute } from "astro";

import { readRuntimeConfig } from "@newsportal/config";
import { MCP_SEQUENCE_PAYLOAD_SCHEMAS } from "@newsportal/contracts";

import type { AdminActionContext } from "../../../lib/server/admin-action";
import {
  adminActionError,
  adminActionSuccess,
  insertAdminAuditLog,
  prepareAdminAction,
} from "../../../lib/server/admin-action";
import {
  assertAdminPayloadHasNoNestedEnvelope,
  assertAdminPayloadMatchesSchema,
  assertNoUnexpectedAdminFields,
} from "../../../lib/server/admin-payload-validation";
import { getPool } from "../../../lib/server/db";
import {
  buildSequenceAuditPayload,
  buildSequenceCancelApiPayload,
  buildSequenceCreateApiPayload,
  buildSequenceManualRunApiPayload,
  buildSequenceRetryApiPayload,
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
  await insertAdminAuditLog(getPool(), {
    actorUserId,
    actionType,
    entityType,
    entityId,
    payloadJson,
  });
}

function respondAutomationSuccess(
  context: AdminActionContext,
  message: string,
  payload: unknown,
  status = 200
): Response {
  return adminActionSuccess(context, {
    section: "automation",
    message,
    json: payload,
    status,
  });
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
    case "retry_run":
      return "sequence_run_retried";
  }
}

export const POST: APIRoute = async ({ request }) => {
  const action = await prepareAdminAction(request, {
    fallbackRedirectPath: "/automation",
    actionToken: { scope: "automation" },
  });
  if (!action.ok) {
    return action.response;
  }
  const context = action.context;
  const { payload, session } = context;

  try {
    assertAdminPayloadHasNoNestedEnvelope(payload, "Automation action");
    assertNoUnexpectedAdminFields(
      payload,
      [
        "sequenceId",
        "runId",
        "title",
        "description",
        "taskGraph",
        "editorState",
        "status",
        "triggerEvent",
        "cron",
        "maxRuns",
        "tags",
        "contextJson",
        "triggerMeta",
        "contextOverrides",
        "reason",
        "createdBy",
      ],
      "Automation action",
    );
    const intent = resolveSequenceAdminIntent(payload);

    if (intent === "create_sequence") {
      const requestPayload = buildSequenceCreateApiPayload(payload, session.userId);
      assertAdminPayloadMatchesSchema(
        requestPayload,
        MCP_SEQUENCE_PAYLOAD_SCHEMAS.create,
        "Sequence create payload",
      );
      const result = await callAutomationApi<Record<string, unknown>>("/maintenance/sequences", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestPayload),
      });
      await writeAuditLog(
        session.userId,
        resolveActionType(intent),
        "sequence",
        String(result.sequence_id ?? ""),
        buildSequenceAuditPayload(intent, payload, result)
      );
      return respondAutomationSuccess(
        context,
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
      const requestPayload = buildSequenceUpdateApiPayload(payload);
      assertAdminPayloadMatchesSchema(
        requestPayload,
        MCP_SEQUENCE_PAYLOAD_SCHEMAS.update,
        "Sequence update payload",
      );
      const result = await callAutomationApi<Record<string, unknown>>(
        `/maintenance/sequences/${encodeURIComponent(sequenceId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(requestPayload),
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
        context,
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
        context,
        "Sequence archived",
        result
      );
    }

    if (intent === "run_sequence") {
      const sequenceId = String(payload.sequenceId ?? "").trim();
      if (!sequenceId) {
        throw new Error("Sequence ID is required.");
      }
      const requestPayload = buildSequenceManualRunApiPayload(payload, session.userId);
      assertAdminPayloadMatchesSchema(
        requestPayload,
        MCP_SEQUENCE_PAYLOAD_SCHEMAS.run,
        "Sequence run payload",
      );
      const result = await callAutomationApi<Record<string, unknown>>(
        `/maintenance/sequences/${encodeURIComponent(sequenceId)}/runs`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(requestPayload),
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
        context,
        "Sequence run requested",
        result,
        202
      );
    }

    if (intent === "retry_run") {
      const runId = String(payload.runId ?? "").trim();
      if (!runId) {
        throw new Error("Run ID is required.");
      }
      const requestPayload = buildSequenceRetryApiPayload(payload, session.userId);
      assertAdminPayloadMatchesSchema(
        requestPayload,
        MCP_SEQUENCE_PAYLOAD_SCHEMAS.retryRun,
        "Sequence retry payload",
      );
      const result = await callAutomationApi<Record<string, unknown>>(
        `/maintenance/sequence-runs/${encodeURIComponent(runId)}/retry`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(requestPayload),
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
        context,
        "Sequence retry requested",
        result,
        202
      );
    }

    const runId = String(payload.runId ?? "").trim();
    if (!runId) {
      throw new Error("Run ID is required.");
    }
    const requestPayload = buildSequenceCancelApiPayload(payload);
    assertAdminPayloadMatchesSchema(
      requestPayload,
      MCP_SEQUENCE_PAYLOAD_SCHEMAS.cancelRun,
      "Sequence cancel payload",
    );
    const result = await callAutomationApi<Record<string, unknown>>(
      `/maintenance/sequence-runs/${encodeURIComponent(runId)}/cancel`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestPayload),
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
      context,
      "Sequence run cancelled",
      result
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update automation state.";
    return adminActionError(context, {
      section: "automation",
      message,
    });
  }
};
