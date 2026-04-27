import type { APIRoute } from "astro";

import { readRuntimeConfig } from "@newsportal/config";

import {
  buildAdminSignInPath,
  buildFlashRedirect,
  requestPrefersHtmlNavigation,
  resolveAdminAppPath,
  resolveAdminRedirectPath,
} from "../../../lib/server/browser-flow";
import {
  buildExpiredAdminSessionCookie,
  resolveAdminSession,
} from "../../../lib/server/auth";
import { getPool } from "../../../lib/server/db";
import { readRequestPayload } from "../../../lib/server/request";

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
    [actorUserId, actionType, entityType, normalizeAuditEntityId(entityId), JSON.stringify(payloadJson)]
  );
}

function respondDiscoverySuccess(
  request: Request,
  browserRequest: boolean,
  redirectTo: string,
  message: string,
  payload: unknown,
  status = 200
): Response {
  if (browserRequest) {
    return buildFlashRedirect(request, {
      section: "discovery",
      status: "success",
      message,
      redirectTo,
    });
  }
  return Response.json(payload, { status });
}

export const POST: APIRoute = async ({ request }) => {
  const browserRequest = requestPrefersHtmlNavigation(request);
  const payload = await readRequestPayload(request);
  const redirectTo = resolveAdminRedirectPath(
    request,
    String(payload.redirectTo ?? request.headers.get("referer") ?? ""),
    "/discovery"
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
    const intent = resolveDiscoveryIntent(payload);

    if (intent === "create_profile") {
      const result = await callDiscoveryApi<Record<string, unknown>>("/maintenance/discovery/profiles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildDiscoveryProfileCreateApiPayload(payload, session.userId)),
      });
      await writeAuditLog(
        session.userId,
        "discovery_profile_created",
        "discovery_policy_profile",
        String(result.profile_id ?? "") || null,
        buildDiscoveryAuditPayload(intent, payload, result)
      );
      return respondDiscoverySuccess(
        request,
        browserRequest,
        redirectTo,
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
      const result = await callDiscoveryApi<Record<string, unknown>>(
        `/maintenance/discovery/profiles/${profileId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(buildDiscoveryProfileUpdateApiPayload(payload)),
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
        request,
        browserRequest,
        redirectTo,
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
        request,
        browserRequest,
        redirectTo,
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
        request,
        browserRequest,
        resolveAdminAppPath(request, "/discovery?tab=profiles"),
        "Discovery profile deleted",
        result
      );
    }

    if (intent === "create_mission") {
      const result = await callDiscoveryApi<{ mission_id: string }>("/maintenance/discovery/missions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildDiscoveryMissionCreateApiPayload(payload, session.userId)),
      });
      await writeAuditLog(
        session.userId,
        "discovery_mission_created",
        "discovery_mission",
        result.mission_id,
        buildDiscoveryAuditPayload(intent, payload, result)
      );
      return respondDiscoverySuccess(
        request,
        browserRequest,
        redirectTo,
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
      const result = await callDiscoveryApi<{ mission_id: string }>(
        `/maintenance/discovery/missions/${missionId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(buildDiscoveryMissionUpdateApiPayload(payload)),
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
        request,
        browserRequest,
        redirectTo,
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
        request,
        browserRequest,
        redirectTo,
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
        request,
        browserRequest,
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
      const result = await callDiscoveryApi<{ run_id?: string }>(
        `/maintenance/discovery/missions/${missionId}/run`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ requestedBy: session.userId }),
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
        request,
        browserRequest,
        redirectTo,
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
        request,
        browserRequest,
        redirectTo,
        "Interest graph compiled",
        result
      );
    }

    if (intent === "create_class") {
      const result = await callDiscoveryApi<Record<string, unknown>>("/maintenance/discovery/classes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildDiscoveryHypothesisClassCreateApiPayload(payload)),
      });
      await writeAuditLog(
        session.userId,
        "discovery_class_created",
        "discovery_hypothesis_class",
        String(result.class_key ?? "") || null,
        buildDiscoveryAuditPayload(intent, payload, result)
      );
      return respondDiscoverySuccess(
        request,
        browserRequest,
        redirectTo,
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
      const result = await callDiscoveryApi<Record<string, unknown>>(
        `/maintenance/discovery/classes/${classKey}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(buildDiscoveryHypothesisClassUpdateApiPayload(payload)),
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
        request,
        browserRequest,
        redirectTo,
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
        request,
        browserRequest,
        redirectTo,
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
        request,
        browserRequest,
        resolveAdminAppPath(request, "/discovery?tab=classes"),
        "Hypothesis class deleted",
        result
      );
    }

    if (intent === "create_recall_mission") {
      const result = await callDiscoveryApi<Record<string, unknown>>(
        "/maintenance/discovery/recall-missions",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(buildDiscoveryRecallMissionCreateApiPayload(payload, session.userId)),
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
        request,
        browserRequest,
        redirectTo,
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
      const result = await callDiscoveryApi<Record<string, unknown>>(
        `/maintenance/discovery/recall-missions/${recallMissionId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(buildDiscoveryRecallMissionUpdateApiPayload(payload)),
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
        request,
        browserRequest,
        redirectTo,
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
        request,
        browserRequest,
        redirectTo,
        "Recall acquisition requested",
        result
      );
    }

    if (intent === "promote_recall_candidate") {
      const recallCandidateId = String(payload.recallCandidateId ?? "").trim();
      if (!recallCandidateId) {
        throw new Error("Recall candidate ID is required.");
      }
      const result = await callDiscoveryApi<Record<string, unknown>>(
        `/maintenance/discovery/recall-candidates/${recallCandidateId}/promote`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            enabled: true,
            reviewedBy: session.userId,
            tags: parseTextList(payload.tags),
          }),
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
        request,
        browserRequest,
        redirectTo,
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
      const result = await callDiscoveryApi<{ candidate_id: string }>(
        `/maintenance/discovery/candidates/${candidateId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(buildDiscoveryCandidateReviewApiPayload(payload, session.userId)),
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
        request,
        browserRequest,
        redirectTo,
        reviewStatus === "approved" ? "Discovery candidate approved" : "Discovery candidate updated",
        result
      );
    }

    if (intent === "submit_feedback") {
      const result = await callDiscoveryApi<Record<string, unknown>>("/maintenance/discovery/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildDiscoveryFeedbackApiPayload(payload, session.userId)),
      });
      await writeAuditLog(
        session.userId,
        "discovery_feedback_submitted",
        "discovery_feedback_event",
        String(result.feedback_event_id ?? "") || null,
        buildDiscoveryAuditPayload(intent, payload, result)
      );
      return respondDiscoverySuccess(
        request,
        browserRequest,
        redirectTo,
        "Discovery feedback recorded",
        result,
        201
      );
    }

    const result = await callDiscoveryApi<Record<string, unknown>>("/maintenance/discovery/re-evaluate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        missionId: String(payload.missionId ?? "").trim() || null,
      }),
    });
    await writeAuditLog(
      session.userId,
      "discovery_re_evaluation_requested",
      "discovery_mission",
      String(payload.missionId ?? "").trim() || null,
      buildDiscoveryAuditPayload(intent, payload, result)
    );
    return respondDiscoverySuccess(
      request,
      browserRequest,
      redirectTo,
      "Discovery re-evaluation completed",
      result
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update discovery state.";
    if (browserRequest) {
      return buildFlashRedirect(request, {
        section: "discovery",
        status: "error",
        message,
        redirectTo,
      });
    }
    return Response.json({ error: message }, { status: 400 });
  }
};
