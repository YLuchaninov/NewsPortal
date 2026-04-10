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

export const prerender = false;

const DEFAULT_DISCOVERY_PROVIDER_TYPES = [
  "rss",
  "website",
  "api",
  "email_imap",
  "youtube",
];
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DiscoveryIntent =
  | "create_mission"
  | "update_mission"
  | "run_mission"
  | "compile_graph"
  | "create_class"
  | "update_class"
  | "review_candidate"
  | "submit_feedback"
  | "re_evaluate";

export function resolveDiscoveryIntent(payload: Record<string, unknown>): DiscoveryIntent {
  const value = String(payload.intent ?? "").trim();
  if (
    value === "update_mission" ||
    value === "run_mission" ||
    value === "compile_graph" ||
    value === "create_class" ||
    value === "update_class" ||
    value === "review_candidate" ||
    value === "submit_feedback" ||
    value === "re_evaluate"
  ) {
    return value;
  }
  return "create_mission";
}

export function parseTextList(value: unknown): string[] {
  return String(value ?? "")
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseOptionalTextList(value: unknown): string[] | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return undefined;
  }
  return parseTextList(raw);
}

export function parseProviderTypes(value: unknown): string[] {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return [...DEFAULT_DISCOVERY_PROVIDER_TYPES];
  }
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseOptionalProviderTypes(value: unknown): string[] | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return undefined;
  }
  return parseProviderTypes(raw);
}

export function parseOptionalNumber(value: unknown): number | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseOptionalJsonRecord(value: unknown): Record<string, unknown> | undefined {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return undefined;
  }
  const parsed = JSON.parse(raw) as unknown;
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  throw new Error("Expected a JSON object.");
}

export function normalizeAuditEntityId(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

export function buildDiscoveryMissionCreateApiPayload(
  payload: Record<string, unknown>,
  createdBy: string
): Record<string, unknown> {
  return {
    title: String(payload.title ?? "").trim(),
    description: String(payload.description ?? "").trim() || null,
    sourceKind: String(payload.sourceKind ?? "").trim() || "manual",
    sourceRefId: String(payload.sourceRefId ?? "").trim() || null,
    seedTopics: parseTextList(payload.seedTopics ?? payload.topics),
    seedLanguages: parseTextList(payload.seedLanguages ?? payload.languages),
    seedRegions: parseTextList(payload.seedRegions ?? payload.regions),
    targetProviderTypes: parseProviderTypes(payload.targetProviderTypes),
    interestGraph: parseOptionalJsonRecord(payload.interestGraph),
    maxHypotheses: parseOptionalNumber(payload.maxHypotheses),
    maxSources: parseOptionalNumber(payload.maxSources),
    budgetCents: parseOptionalNumber(payload.budgetCents),
    priority: parseOptionalNumber(payload.priority) ?? 0,
    createdBy,
  };
}

export function buildDiscoveryMissionUpdateApiPayload(
  payload: Record<string, unknown>
): Record<string, unknown> {
  return {
    title: String(payload.title ?? "").trim() || undefined,
    description: String(payload.description ?? "").trim() || undefined,
    status: String(payload.status ?? "").trim() || undefined,
    priority: parseOptionalNumber(payload.priority),
    budgetCents: parseOptionalNumber(payload.budgetCents),
    maxHypotheses: parseOptionalNumber(payload.maxHypotheses),
    maxSources: parseOptionalNumber(payload.maxSources),
    seedTopics: parseOptionalTextList(payload.seedTopics ?? payload.topics),
    seedLanguages: parseOptionalTextList(payload.seedLanguages ?? payload.languages),
    seedRegions: parseOptionalTextList(payload.seedRegions ?? payload.regions),
    targetProviderTypes: parseOptionalProviderTypes(payload.targetProviderTypes),
    interestGraph: parseOptionalJsonRecord(payload.interestGraph),
  };
}

export function buildDiscoveryHypothesisClassCreateApiPayload(
  payload: Record<string, unknown>
): Record<string, unknown> {
  return {
    classKey: String(payload.classKey ?? "").trim(),
    displayName: String(payload.displayName ?? "").trim(),
    description: String(payload.description ?? "").trim() || null,
    status: String(payload.status ?? "").trim() || "draft",
    generationBackend: String(payload.generationBackend ?? "").trim() || "graph_seed_llm",
    defaultProviderTypes: parseProviderTypes(payload.defaultProviderTypes),
    promptInstructions: String(payload.promptInstructions ?? "").trim() || null,
    seedRulesJson: parseOptionalJsonRecord(payload.seedRulesJson) ?? {},
    maxPerMission: parseOptionalNumber(payload.maxPerMission) ?? 3,
    sortOrder: parseOptionalNumber(payload.sortOrder) ?? 0,
    configJson: parseOptionalJsonRecord(payload.configJson) ?? {},
  };
}

export function buildDiscoveryHypothesisClassUpdateApiPayload(
  payload: Record<string, unknown>
): Record<string, unknown> {
  const apiPayload: Record<string, unknown> = {
    displayName: String(payload.displayName ?? "").trim() || undefined,
    description: String(payload.description ?? "").trim() || undefined,
    status: String(payload.status ?? "").trim() || undefined,
    generationBackend: String(payload.generationBackend ?? "").trim() || undefined,
    defaultProviderTypes: parseOptionalProviderTypes(payload.defaultProviderTypes),
    promptInstructions: String(payload.promptInstructions ?? "").trim() || undefined,
    maxPerMission: parseOptionalNumber(payload.maxPerMission),
    sortOrder: parseOptionalNumber(payload.sortOrder),
  };
  const seedRulesJson = parseOptionalJsonRecord(payload.seedRulesJson);
  const configJson = parseOptionalJsonRecord(payload.configJson);
  if (seedRulesJson !== undefined) {
    apiPayload.seedRulesJson = seedRulesJson;
  }
  if (configJson !== undefined) {
    apiPayload.configJson = configJson;
  }
  return apiPayload;
}

export function buildDiscoveryCandidateReviewApiPayload(
  payload: Record<string, unknown>,
  reviewedBy: string
): Record<string, unknown> {
  return {
    status: String(payload.status ?? "").trim(),
    reviewedBy,
    rejectionReason: String(payload.rejectionReason ?? "").trim() || null,
  };
}

export function buildDiscoveryFeedbackApiPayload(
  payload: Record<string, unknown>,
  createdBy: string
): Record<string, unknown> {
  return {
    missionId: String(payload.missionId ?? "").trim() || null,
    candidateId: String(payload.candidateId ?? "").trim() || null,
    sourceProfileId: String(payload.sourceProfileId ?? "").trim() || null,
    feedbackType: String(payload.feedbackType ?? "").trim(),
    feedbackValue: String(payload.feedbackValue ?? "").trim() || null,
    notes: String(payload.notes ?? "").trim() || null,
    createdBy,
  };
}

export function buildDiscoveryAuditPayload(
  intent: DiscoveryIntent,
  payload: Record<string, unknown>,
  apiResult: Record<string, unknown> = {}
): Record<string, unknown> {
  if (intent === "create_mission") {
    return {
      title: String(payload.title ?? "").trim(),
      missionId: apiResult.mission_id ?? null,
      seedTopics: parseTextList(payload.seedTopics ?? payload.topics),
    };
  }
  if (intent === "update_mission") {
    return {
      missionId: String(payload.missionId ?? "").trim() || null,
      status: String(payload.status ?? "").trim() || null,
      priority: parseOptionalNumber(payload.priority),
      budgetCents: parseOptionalNumber(payload.budgetCents),
    };
  }
  if (intent === "run_mission") {
    return {
      missionId: String(payload.missionId ?? "").trim() || null,
      runId: apiResult.run_id ?? null,
    };
  }
  if (intent === "compile_graph") {
    return {
      missionId: String(payload.missionId ?? "").trim() || null,
      interestGraphStatus: apiResult.interest_graph_status ?? null,
      interestGraphVersion: apiResult.interest_graph_version ?? null,
    };
  }
  if (intent === "create_class" || intent === "update_class") {
    const resolvedClassKey =
      apiResult.class_key ?? (String(payload.classKey ?? payload.class_key ?? "").trim() || null);
    return {
      classKey: resolvedClassKey,
      displayName: String(payload.displayName ?? "").trim() || null,
      status: String(payload.status ?? "").trim() || null,
      generationBackend: String(payload.generationBackend ?? "").trim() || null,
    };
  }
  if (intent === "submit_feedback") {
    return {
      feedbackEventId: apiResult.feedback_event_id ?? null,
      missionId: String(payload.missionId ?? "").trim() || null,
      candidateId: String(payload.candidateId ?? "").trim() || null,
      sourceProfileId: String(payload.sourceProfileId ?? "").trim() || null,
      feedbackType: String(payload.feedbackType ?? "").trim() || null,
      feedbackValue: String(payload.feedbackValue ?? "").trim() || null,
    };
  }
  if (intent === "re_evaluate") {
    return {
      missionId: String(payload.missionId ?? "").trim() || null,
      reEvaluatedCount: apiResult.discovery_re_evaluated_count ?? null,
      portfolioSnapshotCount: apiResult.discovery_portfolio_snapshot_count ?? null,
    };
  }
  return {
    status: String(payload.status ?? "").trim(),
    rejectionReason: String(payload.rejectionReason ?? "").trim() || null,
    candidateId: String(payload.candidateId ?? "").trim() || null,
  };
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
