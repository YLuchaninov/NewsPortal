import type { APIRoute } from "astro";

import { readRuntimeConfig } from "@newsportal/config";
import { MCP_DISCOVERY_PAYLOAD_SCHEMAS } from "@newsportal/contracts";

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
} from "../../../lib/server/admin-payload-validation";
import { resolveAdminAppPath } from "../../../lib/server/browser-flow";
import { getPool } from "../../../lib/server/db";

export const prerender = false;

import {
  buildDiscoveryAuditPayload,
  buildDiscoveryCandidateReviewApiPayload,
  buildDiscoveryFeedbackApiPayload,
  buildDiscoveryHypothesisClassCreateApiPayload,
  buildDiscoveryHypothesisClassUpdateApiPayload,
  buildDiscoveryMissionCreateApiPayload,
  buildDiscoveryMissionUpdateApiPayload,
  buildDiscoveryProfileCreateApiPayload,
  buildDiscoveryProfileUpdateApiPayload,
  buildDiscoveryRecallMissionCreateApiPayload,
  buildDiscoveryRecallMissionUpdateApiPayload,
  normalizeAuditEntityId,
  parseTextList,
  resolveDiscoveryIntent,
} from "../../../lib/server/discovery-payloads";
export {
  resolveDiscoveryIntent,
  parseTextList,
  parseProviderTypes,
  parseOptionalNumber,
  normalizeAuditEntityId,
  buildDiscoveryMissionCreateApiPayload,
  buildDiscoveryMissionUpdateApiPayload,
  buildDiscoveryRecallMissionCreateApiPayload,
  buildDiscoveryRecallMissionUpdateApiPayload,
  buildDiscoveryProfileCreateApiPayload,
  buildDiscoveryProfileUpdateApiPayload,
  buildDiscoveryHypothesisClassCreateApiPayload,
  buildDiscoveryHypothesisClassUpdateApiPayload,
  buildDiscoveryCandidateReviewApiPayload,
  buildDiscoveryFeedbackApiPayload,
  buildDiscoveryAuditPayload,
} from "../../../lib/server/discovery-payloads";
export type { DiscoveryIntent } from "../../../lib/server/discovery-payloads";

const SUPPORTED_WEBSITE_KINDS = new Set([
  "editorial",
  "procurement_portal",
  "listing",
  "document",
  "resource",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readPath(record: Record<string, unknown>, path: readonly string[]): unknown {
  let current: unknown = record;
  for (const key of path) {
    const currentRecord = asRecord(current);
    if (!currentRecord) {
      return undefined;
    }
    current = currentRecord[key];
  }
  return current;
}

function readOptionalString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function hasStringArrayValue(value: unknown): boolean {
  return Array.isArray(value) && value.some((entry) => readOptionalString(entry));
}

function hasValidFeedEvidence(evaluationJson: Record<string, unknown>): boolean {
  return (
    evaluationJson.isValid === true ||
    evaluationJson.validFeed === true ||
    readPath(evaluationJson, ["feed", "isValid"]) === true ||
    readPath(evaluationJson, ["rss", "isValid"]) === true ||
    hasStringArrayValue(evaluationJson.discoveredFeedUrls) ||
    hasStringArrayValue(readPath(evaluationJson, ["probe", "discoveredFeedUrls"])) ||
    hasStringArrayValue(readPath(evaluationJson, ["evaluation", "discoveredFeedUrls"]))
  );
}

function hasSupportedWebsiteEvidence(evaluationJson: Record<string, unknown>): boolean {
  if (readPath(evaluationJson, ["policyReview", "matchedSignals", "websiteKindSupported"]) === true) {
    return true;
  }
  const kind =
    readOptionalString(readPath(evaluationJson, ["classification", "kind"])) ??
    readOptionalString(readPath(evaluationJson, ["probe", "classification", "kind"])) ??
    readOptionalString(evaluationJson.websiteKind);
  return Boolean(kind && SUPPORTED_WEBSITE_KINDS.has(kind));
}

async function assertRecallCandidateCanPromoteThroughAdmin(
  recallCandidateId: string,
  overrideReason: string | null,
): Promise<void> {
  const result = await getPool().query<{
    status: string | null;
    provider_type: string | null;
    url: string | null;
    final_url: string | null;
    evaluation_json: Record<string, unknown> | null;
  }>(
    `
      select status, provider_type, url, final_url, evaluation_json
      from public.discovery_recall_candidates
      where recall_candidate_id = $1
      limit 1
    `,
    [recallCandidateId],
  );
  const row = result.rows[0];
  if (!row) {
    return;
  }
  const providerType = readOptionalString(row.provider_type) ?? "rss";
  const status = readOptionalString(row.status) ?? "pending";
  const evaluationJson = asRecord(row.evaluation_json) ?? {};
  if (status === "rejected" && !overrideReason) {
    throw new Error(
      `Rejected recall candidate ${recallCandidateId} cannot be promoted without overrideReason.`,
    );
  }
  if (providerType === "rss" && !hasValidFeedEvidence(evaluationJson)) {
    throw new Error(
      `Recall candidate ${recallCandidateId} is providerType=rss but has no valid feed evidence. Do not promote HTML/opportunity pages as RSS.`,
    );
  }
  if (providerType === "website" && !hasSupportedWebsiteEvidence(evaluationJson) && !overrideReason) {
    throw new Error(
      `Website recall candidate ${recallCandidateId} requires supported website-kind evidence or overrideReason before promotion.`,
    );
  }
}

async function callDiscoveryApi<T>(path: string, init: RequestInit): Promise<T> {
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
          : `Discovery request failed with ${response.status}.`;
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
    entityId: normalizeAuditEntityId(entityId),
    payloadJson,
  });
}

function respondDiscoverySuccess(
  context: AdminActionContext,
  redirectTo: string,
  message: string,
  payload: unknown,
  status = 200
): Response {
  return adminActionSuccess(context, {
    section: "discovery",
    message,
    json: payload,
    status,
    redirectTo,
  });
}

export const POST: APIRoute = async ({ request }) => {
  const action = await prepareAdminAction(request, {
    fallbackRedirectPath: "/discovery",
    actionToken: { scope: "discovery" },
  });
  if (!action.ok) {
    return action.response;
  }
  const context = action.context;
  const { payload, session } = context;

  try {
    assertAdminPayloadHasNoNestedEnvelope(payload, "Discovery action");
    const intent = resolveDiscoveryIntent(payload);

    if (intent === "create_profile") {
      const requestPayload = buildDiscoveryProfileCreateApiPayload(payload, session.userId);
      assertAdminPayloadMatchesSchema(
        requestPayload,
        MCP_DISCOVERY_PAYLOAD_SCHEMAS.profileCreate,
        "Discovery profile create payload",
      );
      const result = await callDiscoveryApi<Record<string, unknown>>("/maintenance/discovery/profiles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestPayload),
      });
      await writeAuditLog(
        session.userId,
        "discovery_profile_created",
        "discovery_policy_profile",
        String(result.profile_id ?? "") || null,
        buildDiscoveryAuditPayload(intent, payload, result)
      );
      return respondDiscoverySuccess(
        context,
        context.redirectTo,
        "Discovery profile created",
        result,
        201
      );
    }

    if (intent === "update_profile") {
      const profileId = String(payload.profileId ?? "").trim();
      if (!profileId) {
        throw new Error("Profile ID is required.");
      }
      const requestPayload = buildDiscoveryProfileUpdateApiPayload(payload);
      assertAdminPayloadMatchesSchema(
        requestPayload,
        MCP_DISCOVERY_PAYLOAD_SCHEMAS.profileUpdate,
        "Discovery profile update payload",
      );
      const result = await callDiscoveryApi<Record<string, unknown>>(
        `/maintenance/discovery/profiles/${profileId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(requestPayload),
        }
      );
      await writeAuditLog(
        session.userId,
        "discovery_profile_updated",
        "discovery_policy_profile",
        profileId,
        buildDiscoveryAuditPayload(intent, payload, result)
      );
      return respondDiscoverySuccess(
        context,
        context.redirectTo,
        "Discovery profile updated",
        result
      );
    }

    if (intent === "archive_profile" || intent === "activate_profile") {
      const profileId = String(payload.profileId ?? "").trim();
      if (!profileId) {
        throw new Error("Profile ID is required.");
      }
      const result = await callDiscoveryApi<Record<string, unknown>>(
        `/maintenance/discovery/profiles/${profileId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            status: intent === "archive_profile" ? "archived" : "active",
          }),
        }
      );
      await writeAuditLog(
        session.userId,
        intent === "archive_profile"
          ? "discovery_profile_archived"
          : "discovery_profile_activated",
        "discovery_policy_profile",
        profileId,
        buildDiscoveryAuditPayload(intent, payload, result)
      );
      return respondDiscoverySuccess(
        context,
        context.redirectTo,
        intent === "archive_profile" ? "Discovery profile archived" : "Discovery profile activated",
        result
      );
    }

    if (intent === "delete_profile") {
      const profileId = String(payload.profileId ?? "").trim();
      if (!profileId) {
        throw new Error("Profile ID is required.");
      }
      const result = await callDiscoveryApi<Record<string, unknown>>(
        `/maintenance/discovery/profiles/${profileId}`,
        {
          method: "DELETE",
          headers: { "content-type": "application/json" },
        }
      );
      await writeAuditLog(
        session.userId,
        "discovery_profile_deleted",
        "discovery_policy_profile",
        profileId,
        buildDiscoveryAuditPayload(intent, payload, result)
      );
      return respondDiscoverySuccess(
        context,
        resolveAdminAppPath(request, "/discovery?tab=profiles"),
        "Discovery profile deleted",
        result
      );
    }

    if (intent === "create_mission") {
      const requestPayload = buildDiscoveryMissionCreateApiPayload(payload, session.userId);
      assertAdminPayloadMatchesSchema(
        requestPayload,
        MCP_DISCOVERY_PAYLOAD_SCHEMAS.missionCreate,
        "Discovery mission create payload",
      );
      const result = await callDiscoveryApi<{ mission_id: string }>("/maintenance/discovery/missions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestPayload),
      });
      await writeAuditLog(
        session.userId,
        "discovery_mission_created",
        "discovery_mission",
        result.mission_id,
        buildDiscoveryAuditPayload(intent, payload, result)
      );
      return respondDiscoverySuccess(
        context,
        context.redirectTo,
        "Adaptive discovery mission created",
        result,
        201
      );
    }

    if (intent === "update_mission") {
      const missionId = String(payload.missionId ?? "").trim();
      if (!missionId) {
        throw new Error("Mission ID is required.");
      }
      const requestPayload = buildDiscoveryMissionUpdateApiPayload(payload);
      assertAdminPayloadMatchesSchema(
        requestPayload,
        MCP_DISCOVERY_PAYLOAD_SCHEMAS.missionUpdate,
        "Discovery mission update payload",
      );
      const result = await callDiscoveryApi<{ mission_id: string }>(
        `/maintenance/discovery/missions/${missionId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(requestPayload),
        }
      );
      await writeAuditLog(
        session.userId,
        "discovery_mission_updated",
        "discovery_mission",
        missionId,
        buildDiscoveryAuditPayload(intent, payload, result)
      );
      return respondDiscoverySuccess(
        context,
        context.redirectTo,
        "Adaptive discovery mission updated",
        result
      );
    }

    if (intent === "archive_mission" || intent === "activate_mission") {
      const missionId = String(payload.missionId ?? "").trim();
      if (!missionId) {
        throw new Error("Mission ID is required.");
      }
      const result = await callDiscoveryApi<{ mission_id: string }>(
        `/maintenance/discovery/missions/${missionId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            status: intent === "archive_mission" ? "archived" : "planned",
          }),
        }
      );
      await writeAuditLog(
        session.userId,
        intent === "archive_mission"
          ? "discovery_mission_archived"
          : "discovery_mission_activated",
        "discovery_mission",
        missionId,
        buildDiscoveryAuditPayload(intent, payload, result)
      );
      return respondDiscoverySuccess(
        context,
        context.redirectTo,
        intent === "archive_mission"
          ? "Adaptive discovery mission archived"
          : "Adaptive discovery mission reactivated",
        result
      );
    }

    if (intent === "delete_mission") {
      const missionId = String(payload.missionId ?? "").trim();
      if (!missionId) {
        throw new Error("Mission ID is required.");
      }
      const result = await callDiscoveryApi<Record<string, unknown>>(
        `/maintenance/discovery/missions/${missionId}`,
        {
          method: "DELETE",
          headers: { "content-type": "application/json" },
        }
      );
      await writeAuditLog(
        session.userId,
        "discovery_mission_deleted",
        "discovery_mission",
        missionId,
        buildDiscoveryAuditPayload(intent, payload, result)
      );
      return respondDiscoverySuccess(
        context,
        resolveAdminAppPath(request, "/discovery?tab=missions"),
        "Adaptive discovery mission deleted",
        result
      );
    }

    if (intent === "run_mission") {
      const missionId = String(payload.missionId ?? "").trim();
      if (!missionId) {
        throw new Error("Mission ID is required.");
      }
      const requestPayload = { requestedBy: session.userId };
      assertAdminPayloadMatchesSchema(
        requestPayload,
        MCP_DISCOVERY_PAYLOAD_SCHEMAS.missionRun,
        "Discovery mission run payload",
      );
      const result = await callDiscoveryApi<{ run_id?: string }>(
        `/maintenance/discovery/missions/${missionId}/run`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(requestPayload),
        }
      );
      await writeAuditLog(
        session.userId,
        "discovery_mission_run_requested",
        "discovery_mission",
        missionId,
        buildDiscoveryAuditPayload(intent, payload, result)
      );
      return respondDiscoverySuccess(
        context,
        context.redirectTo,
        "Adaptive discovery mission run requested",
        result,
        202
      );
    }

    if (intent === "compile_graph") {
      const missionId = String(payload.missionId ?? "").trim();
      if (!missionId) {
        throw new Error("Mission ID is required.");
      }
      const result = await callDiscoveryApi<Record<string, unknown>>(
        `/maintenance/discovery/missions/${missionId}/compile-graph`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        }
      );
      await writeAuditLog(
        session.userId,
        "discovery_graph_compiled",
        "discovery_mission",
        missionId,
        buildDiscoveryAuditPayload(intent, payload, result)
      );
      return respondDiscoverySuccess(
        context,
        context.redirectTo,
        "Interest graph compiled",
        result
      );
    }

    if (intent === "create_class") {
      const requestPayload = buildDiscoveryHypothesisClassCreateApiPayload(payload);
      assertAdminPayloadMatchesSchema(
        requestPayload,
        MCP_DISCOVERY_PAYLOAD_SCHEMAS.classCreate,
        "Discovery class create payload",
      );
      const result = await callDiscoveryApi<Record<string, unknown>>("/maintenance/discovery/classes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestPayload),
      });
      await writeAuditLog(
        session.userId,
        "discovery_class_created",
        "discovery_hypothesis_class",
        String(result.class_key ?? "") || null,
        buildDiscoveryAuditPayload(intent, payload, result)
      );
      return respondDiscoverySuccess(
        context,
        context.redirectTo,
        "Hypothesis class created",
        result,
        201
      );
    }

    if (intent === "update_class") {
      const classKey = String(payload.classKey ?? "").trim();
      if (!classKey) {
        throw new Error("Class key is required.");
      }
      const requestPayload = buildDiscoveryHypothesisClassUpdateApiPayload(payload);
      assertAdminPayloadMatchesSchema(
        requestPayload,
        MCP_DISCOVERY_PAYLOAD_SCHEMAS.classUpdate,
        "Discovery class update payload",
      );
      const result = await callDiscoveryApi<Record<string, unknown>>(
        `/maintenance/discovery/classes/${classKey}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(requestPayload),
        }
      );
      await writeAuditLog(
        session.userId,
        "discovery_class_updated",
        "discovery_hypothesis_class",
        classKey,
        buildDiscoveryAuditPayload(intent, payload, result)
      );
      return respondDiscoverySuccess(
        context,
        context.redirectTo,
        "Hypothesis class updated",
        result
      );
    }

    if (intent === "archive_class" || intent === "activate_class") {
      const classKey = String(payload.classKey ?? "").trim();
      if (!classKey) {
        throw new Error("Class key is required.");
      }
      const result = await callDiscoveryApi<Record<string, unknown>>(
        `/maintenance/discovery/classes/${classKey}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            status: intent === "archive_class" ? "archived" : "active",
          }),
        }
      );
      await writeAuditLog(
        session.userId,
        intent === "archive_class" ? "discovery_class_archived" : "discovery_class_activated",
        "discovery_hypothesis_class",
        classKey,
        buildDiscoveryAuditPayload(intent, payload, result)
      );
      return respondDiscoverySuccess(
        context,
        context.redirectTo,
        intent === "archive_class" ? "Hypothesis class archived" : "Hypothesis class reactivated",
        result
      );
    }

    if (intent === "delete_class") {
      const classKey = String(payload.classKey ?? "").trim();
      if (!classKey) {
        throw new Error("Class key is required.");
      }
      const result = await callDiscoveryApi<Record<string, unknown>>(
        `/maintenance/discovery/classes/${classKey}`,
        {
          method: "DELETE",
          headers: { "content-type": "application/json" },
        }
      );
      await writeAuditLog(
        session.userId,
        "discovery_class_deleted",
        "discovery_hypothesis_class",
        classKey,
        buildDiscoveryAuditPayload(intent, payload, result)
      );
      return respondDiscoverySuccess(
        context,
        resolveAdminAppPath(request, "/discovery?tab=classes"),
        "Hypothesis class deleted",
        result
      );
    }

    if (intent === "create_recall_mission") {
      const requestPayload = buildDiscoveryRecallMissionCreateApiPayload(payload, session.userId);
      assertAdminPayloadMatchesSchema(
        requestPayload,
        MCP_DISCOVERY_PAYLOAD_SCHEMAS.recallMissionCreate,
        "Discovery recall mission create payload",
      );
      const result = await callDiscoveryApi<Record<string, unknown>>(
        "/maintenance/discovery/recall-missions",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(requestPayload),
        }
      );
      await writeAuditLog(
        session.userId,
        "discovery_recall_mission_created",
        "discovery_recall_mission",
        String(result.recall_mission_id ?? "") || null,
        buildDiscoveryAuditPayload(intent, payload, result)
      );
      return respondDiscoverySuccess(
        context,
        context.redirectTo,
        "Recall mission created",
        result,
        201
      );
    }

    if (intent === "update_recall_mission") {
      const recallMissionId = String(payload.recallMissionId ?? "").trim();
      if (!recallMissionId) {
        throw new Error("Recall mission ID is required.");
      }
      const requestPayload = buildDiscoveryRecallMissionUpdateApiPayload(payload);
      assertAdminPayloadMatchesSchema(
        requestPayload,
        MCP_DISCOVERY_PAYLOAD_SCHEMAS.recallMissionUpdate,
        "Discovery recall mission update payload",
      );
      const result = await callDiscoveryApi<Record<string, unknown>>(
        `/maintenance/discovery/recall-missions/${recallMissionId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(requestPayload),
        }
      );
      await writeAuditLog(
        session.userId,
        "discovery_recall_mission_updated",
        "discovery_recall_mission",
        recallMissionId,
        buildDiscoveryAuditPayload(intent, payload, result)
      );
      return respondDiscoverySuccess(
        context,
        context.redirectTo,
        "Recall mission updated",
        result
      );
    }

    if (intent === "acquire_recall_mission") {
      const recallMissionId = String(payload.recallMissionId ?? "").trim();
      if (!recallMissionId) {
        throw new Error("Recall mission ID is required.");
      }
      const result = await callDiscoveryApi<Record<string, unknown>>(
        `/maintenance/discovery/recall-missions/${recallMissionId}/acquire`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        }
      );
      await writeAuditLog(
        session.userId,
        "discovery_recall_mission_acquired",
        "discovery_recall_mission",
        recallMissionId,
        buildDiscoveryAuditPayload(intent, payload, result)
      );
      return respondDiscoverySuccess(
        context,
        context.redirectTo,
        "Recall acquisition requested",
        result
      );
    }

    if (intent === "promote_recall_candidate") {
      const recallCandidateId = String(payload.recallCandidateId ?? "").trim();
      if (!recallCandidateId) {
        throw new Error("Recall candidate ID is required.");
      }
      const overrideReason = readOptionalString(payload.overrideReason);
      await assertRecallCandidateCanPromoteThroughAdmin(recallCandidateId, overrideReason);
      const requestPayload = {
        enabled: true,
        reviewedBy: session.userId,
        tags: parseTextList(payload.tags),
      };
      assertAdminPayloadMatchesSchema(
        requestPayload,
        MCP_DISCOVERY_PAYLOAD_SCHEMAS.recallCandidatePromote,
        "Discovery recall candidate promote payload",
      );
      const result = await callDiscoveryApi<Record<string, unknown>>(
        `/maintenance/discovery/recall-candidates/${recallCandidateId}/promote`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(requestPayload),
        }
      );
      await writeAuditLog(
        session.userId,
        "discovery_recall_candidate_promoted",
        "discovery_recall_candidate",
        recallCandidateId,
        buildDiscoveryAuditPayload(intent, payload, result)
      );
      return respondDiscoverySuccess(
        context,
        context.redirectTo,
        "Recall candidate promotion requested",
        result
      );
    }

    if (intent === "review_candidate") {
      const candidateId = String(payload.candidateId ?? "").trim();
      if (!candidateId) {
        throw new Error("Candidate ID is required.");
      }
      const reviewStatus = String(payload.status ?? "").trim();
      const requestPayload = buildDiscoveryCandidateReviewApiPayload(payload, session.userId);
      assertAdminPayloadMatchesSchema(
        requestPayload,
        MCP_DISCOVERY_PAYLOAD_SCHEMAS.candidateReview,
        "Discovery candidate review payload",
      );
      const result = await callDiscoveryApi<{ candidate_id: string }>(
        `/maintenance/discovery/candidates/${candidateId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(requestPayload),
        }
      );
      await writeAuditLog(
        session.userId,
        "discovery_candidate_reviewed",
        "discovery_candidate",
        candidateId,
        buildDiscoveryAuditPayload(intent, payload, result)
      );
      return respondDiscoverySuccess(
        context,
        context.redirectTo,
        reviewStatus === "approved" ? "Discovery candidate approved" : "Discovery candidate updated",
        result
      );
    }

    if (intent === "submit_feedback") {
      const requestPayload = buildDiscoveryFeedbackApiPayload(payload, session.userId);
      assertAdminPayloadMatchesSchema(
        requestPayload,
        MCP_DISCOVERY_PAYLOAD_SCHEMAS.feedbackCreate,
        "Discovery feedback payload",
      );
      const result = await callDiscoveryApi<Record<string, unknown>>("/maintenance/discovery/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestPayload),
      });
      await writeAuditLog(
        session.userId,
        "discovery_feedback_submitted",
        "discovery_feedback_event",
        String(result.feedback_event_id ?? "") || null,
        buildDiscoveryAuditPayload(intent, payload, result)
      );
      return respondDiscoverySuccess(
        context,
        context.redirectTo,
        "Discovery feedback recorded",
        result,
        201
      );
    }

    const requestPayload = {
      missionId: String(payload.missionId ?? "").trim() || null,
    };
    assertAdminPayloadMatchesSchema(
      requestPayload,
      MCP_DISCOVERY_PAYLOAD_SCHEMAS.reEvaluate,
      "Discovery re-evaluate payload",
    );
    const result = await callDiscoveryApi<Record<string, unknown>>("/maintenance/discovery/re-evaluate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestPayload),
    });
    await writeAuditLog(
      session.userId,
      "discovery_re_evaluation_requested",
      "discovery_mission",
      String(payload.missionId ?? "").trim() || null,
      buildDiscoveryAuditPayload(intent, payload, result)
    );
    return respondDiscoverySuccess(
      context,
      context.redirectTo,
      "Discovery re-evaluation completed",
      result
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update discovery state.";
    return adminActionError(context, {
      section: "discovery",
      message,
    });
  }
};
