import { MCP_DISCOVERY_ARGUMENT_SCHEMAS } from "@newsportal/contracts";

import {
  createWriteTool,
  JsonRpcError,
  normalizePayloadStringListFields,
  normalizeRecordStringListFields,
  readBooleanFlag,
  readOptionalString,
  readPayload,
  readRequiredString,
  requireDestructiveConfirmation,
  withActorDefault,
  writeMcpMutationAudit,
  type McpToolDefinition,
} from "../shared";

const SUPPORTED_WEBSITE_KINDS = new Set([
  "editorial",
  "procurement_portal",
  "listing",
  "document",
  "resource",
]);
const PROVIDER_TYPES = ["rss", "website", "api", "email_imap", "youtube"] as const;
const PROFILE_PROVIDER_TYPES = ["rss", "website"] as const;
const WEBSITE_KINDS = ["editorial", "procurement_portal", "listing", "document", "resource"] as const;
const MCP_INTERACTIVE_DISCOVERY_MAX_HYPOTHESES = 5;

const DISCOVERY_POLICY_LIST_FIELDS = {
  providerTypes: { allowedValues: PROFILE_PROVIDER_TYPES },
  supportedWebsiteKinds: { allowedValues: WEBSITE_KINDS },
  preferredDomains: undefined,
  blockedDomains: undefined,
  positiveKeywords: undefined,
  negativeKeywords: undefined,
  preferredTactics: undefined,
  expectedSourceShapes: undefined,
  allowedSourceFamilies: undefined,
  disfavoredSourceFamilies: undefined,
  usefulnessHints: undefined,
} as const;

const DISCOVERY_BENCHMARK_LIST_FIELDS = {
  domains: undefined,
  titleKeywords: undefined,
  tacticKeywords: undefined,
} as const;

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

function normalizeDiscoveryMissionPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return normalizePayloadStringListFields(payload, {
    seedTopics: undefined,
    seedLanguages: undefined,
    seedRegions: undefined,
    targetProviderTypes: { allowedValues: PROVIDER_TYPES },
  });
}

function stripMcpOnlyDiscoveryMissionFields(
  payload: Record<string, unknown>
): Record<string, unknown> {
  const normalized = { ...payload };
  delete normalized.confirmLargeRun;
  return normalized;
}

function guardInteractiveDiscoveryMissionSize(payload: Record<string, unknown>): void {
  const rawMax = payload.maxHypotheses;
  if (rawMax == null) {
    return;
  }
  const maxHypotheses = Number(rawMax);
  if (
    !Number.isFinite(maxHypotheses) ||
    !Number.isInteger(maxHypotheses) ||
    maxHypotheses <= MCP_INTERACTIVE_DISCOVERY_MAX_HYPOTHESES
  ) {
    return;
  }
  if (
    payload.confirmLargeRun != null &&
    readBooleanFlag(payload.confirmLargeRun, "payload.confirmLargeRun")
  ) {
    return;
  }
  throw new JsonRpcError(
    -32602,
    `Interactive MCP discovery missions should use maxHypotheses <= ${MCP_INTERACTIVE_DISCOVERY_MAX_HYPOTHESES} unless payload.confirmLargeRun=true is provided.`,
    {
      statusCode: 400,
      data: {
        tool: "discovery.missions.create/update",
        path: "payload.maxHypotheses",
        code: "large_run_requires_confirmation",
        expectedShape: {
          maxHypotheses: `integer <= ${MCP_INTERACTIVE_DISCOVERY_MAX_HYPOTHESES} for normal MCP sessions`,
          confirmLargeRun:
            "boolean true when an operator intentionally accepts a longer async discovery run",
        },
      },
    }
  );
}

function prepareDiscoveryMissionPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const normalized = normalizeDiscoveryMissionPayload(payload);
  guardInteractiveDiscoveryMissionSize(normalized);
  return stripMcpOnlyDiscoveryMissionFields(normalized);
}

function normalizeRecallMissionPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return normalizePayloadStringListFields(payload, {
    seedDomains: undefined,
    seedUrls: undefined,
    seedQueries: undefined,
    targetProviderTypes: { allowedValues: PROVIDER_TYPES },
  });
}

function normalizeDiscoveryClassPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return normalizePayloadStringListFields(payload, {
    defaultProviderTypes: { allowedValues: PROVIDER_TYPES },
  });
}

function normalizeDiscoveryProfilePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...payload };
  normalized.graphPolicyJson = normalizeRecordStringListFields(
    normalized.graphPolicyJson,
    DISCOVERY_POLICY_LIST_FIELDS,
    "payload.graphPolicyJson"
  );
  normalized.recallPolicyJson = normalizeRecordStringListFields(
    normalized.recallPolicyJson,
    DISCOVERY_POLICY_LIST_FIELDS,
    "payload.recallPolicyJson"
  );
  normalized.yieldBenchmarkJson = normalizeRecordStringListFields(
    normalized.yieldBenchmarkJson,
    DISCOVERY_BENCHMARK_LIST_FIELDS,
    "payload.yieldBenchmarkJson"
  );
  return normalized;
}

async function assertRecallCandidateCanPromoteThroughMcp(
  pool: Parameters<McpToolDefinition["handler"]>[0]["pool"],
  recallCandidateId: string,
  overrideReason: string | null
): Promise<void> {
  const result = await pool.query<{
    status: string | null;
    provider_type: string | null;
    url: string | null;
    final_url: string | null;
    evaluation_json: Record<string, unknown> | null;
    rejection_reason: string | null;
  }>(
    `
      select status, provider_type, url, final_url, evaluation_json, rejection_reason
      from public.discovery_recall_candidates
      where recall_candidate_id = $1
      limit 1
    `,
    [recallCandidateId]
  );
  const row = result.rows[0];
  if (!row) {
    return;
  }
  const providerType = readOptionalString(row.provider_type) ?? "rss";
  const status = readOptionalString(row.status) ?? "pending";
  const evaluationJson = asRecord(row.evaluation_json) ?? {};
  if (status === "rejected" && !overrideReason) {
    throw new JsonRpcError(
      -32602,
      `Rejected recall candidate ${recallCandidateId} cannot be promoted without payload.overrideReason.`,
      {
        statusCode: 400,
        data: {
          tool: "discovery.recall_candidates.promote",
          path: "payload.overrideReason",
          expectedShape: "non-empty string explaining a human/operator override",
        },
      }
    );
  }
  if (providerType === "rss" && !hasValidFeedEvidence(evaluationJson)) {
    throw new JsonRpcError(
      -32602,
      `Recall candidate ${recallCandidateId} is providerType=rss but has no valid feed evidence. Do not promote HTML/opportunity pages as RSS; create a website channel or provide validated feed evidence.`,
      {
        statusCode: 400,
        data: {
          tool: "discovery.recall_candidates.promote",
          path: "recallCandidateId",
          expectedShape:
            "RSS recall candidates require evaluationJson.isValid/validFeed=true or discoveredFeedUrls evidence before promotion.",
          url: row.final_url ?? row.url,
        },
      }
    );
  }
  if (providerType === "website" && !hasSupportedWebsiteEvidence(evaluationJson) && !overrideReason) {
    throw new JsonRpcError(
      -32602,
      `Website recall candidate ${recallCandidateId} has no supported website-kind evidence and requires payload.overrideReason for promotion.`,
      {
        statusCode: 400,
        data: {
          tool: "discovery.recall_candidates.promote",
          path: "payload.overrideReason",
          expectedShape:
            "website promotion requires supported websiteKind evidence or an explicit overrideReason.",
          url: row.final_url ?? row.url,
        },
      }
    );
  }
}

export const DISCOVERY_WRITE_MCP_TOOLS: readonly McpToolDefinition[] = [
  createWriteTool(
    "discovery.profiles.create",
    "Create a discovery profile.",
    "write.discovery",
    MCP_DISCOVERY_ARGUMENT_SCHEMAS.profileCreate,
    async ({ sdk, pool, token }, args) => {
      const payload = withActorDefault(
        normalizeDiscoveryProfilePayload(readPayload(args)),
        "createdBy",
        token.issuedByUserId
      );
      const result = await sdk.createDiscoveryProfile<Record<string, unknown>>(payload);
      await writeMcpMutationAudit(pool, token, {
        actionType: "discovery_profile_created",
        entityType: "discovery_policy_profile",
        entityId: String(result.profile_id ?? ""),
      });
      return result;
    }
  ),
  createWriteTool(
    "discovery.profiles.update",
    "Update a discovery profile.",
    "write.discovery",
    MCP_DISCOVERY_ARGUMENT_SCHEMAS.profileUpdate,
    async ({ sdk, pool, token }, args) => {
      const profileId = readRequiredString(args.profileId, "profileId");
      const result = await sdk.updateDiscoveryProfile<Record<string, unknown>>(
        profileId,
        normalizeDiscoveryProfilePayload(readPayload(args))
      );
      await writeMcpMutationAudit(pool, token, {
        actionType: "discovery_profile_updated",
        entityType: "discovery_policy_profile",
        entityId: profileId,
      });
      return result;
    }
  ),
  createWriteTool(
    "discovery.profiles.archive",
    "Archive a discovery profile.",
    "write.discovery",
    {
      type: "object",
      required: ["profileId", "confirm"],
      properties: {
        profileId: { type: "string" },
        confirm: { type: "boolean" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      requireDestructiveConfirmation(token, args);
      const profileId = readRequiredString(args.profileId, "profileId");
      const result = await sdk.updateDiscoveryProfile<Record<string, unknown>>(profileId, {
        status: "archived",
      });
      await writeMcpMutationAudit(pool, token, {
        actionType: "discovery_profile_archived",
        entityType: "discovery_policy_profile",
        entityId: profileId,
      });
      return result;
    },
    true
  ),
  createWriteTool(
    "discovery.missions.create",
    "Create a discovery mission. Pass a single object in arguments.payload; do not pass a JSON string and do not nest another payload field inside payload.",
    "write.discovery",
    MCP_DISCOVERY_ARGUMENT_SCHEMAS.missionCreate,
    async ({ sdk, pool, token }, args) => {
      const payload = withActorDefault(
        prepareDiscoveryMissionPayload(readPayload(args)),
        "createdBy",
        token.issuedByUserId
      );
      const result = await sdk.createDiscoveryMission<Record<string, unknown>>(payload);
      await writeMcpMutationAudit(pool, token, {
        actionType: "discovery_mission_created",
        entityType: "discovery_mission",
        entityId: String(result.mission_id ?? ""),
      });
      return result;
    }
  ),
  createWriteTool(
    "discovery.missions.update",
    "Update a discovery mission.",
    "write.discovery",
    MCP_DISCOVERY_ARGUMENT_SCHEMAS.missionUpdate,
    async ({ sdk, pool, token }, args) => {
      const missionId = readRequiredString(args.missionId, "missionId");
      const result = await sdk.updateDiscoveryMission<Record<string, unknown>>(
        missionId,
        prepareDiscoveryMissionPayload(readPayload(args))
      );
      await writeMcpMutationAudit(pool, token, {
        actionType: "discovery_mission_updated",
        entityType: "discovery_mission",
        entityId: missionId,
      });
      return result;
    }
  ),
  createWriteTool(
    "discovery.missions.compile_graph",
    "Compile the graph for a discovery mission.",
    "write.discovery",
    MCP_DISCOVERY_ARGUMENT_SCHEMAS.missionRun,
    async ({ sdk, pool, token }, args) => {
      const missionId = readRequiredString(args.missionId, "missionId");
      const payload = args.payload == null ? {} : readPayload(args);
      const result = await sdk.compileDiscoveryMissionGraph<Record<string, unknown>>(
        missionId,
        payload
      );
      await writeMcpMutationAudit(pool, token, {
        actionType: "discovery_graph_compiled",
        entityType: "discovery_mission",
        entityId: missionId,
      });
      return result;
    }
  ),
  createWriteTool(
    "discovery.missions.run",
    "Run a discovery mission.",
    "write.discovery",
    MCP_DISCOVERY_ARGUMENT_SCHEMAS.missionRun,
    async ({ sdk, pool, token }, args) => {
      const missionId = readRequiredString(args.missionId, "missionId");
      const payload = args.payload == null ? {} : readPayload(args);
      const result = await sdk.runDiscoveryMission<Record<string, unknown>>(missionId, {
        ...payload,
        requestedBy: readOptionalString(payload.requestedBy) ?? token.issuedByUserId,
      });
      await writeMcpMutationAudit(pool, token, {
        actionType: "discovery_mission_run_requested",
        entityType: "discovery_mission",
        entityId: missionId,
      });
      return result;
    }
  ),
  createWriteTool(
    "discovery.missions.archive",
    "Archive a discovery mission.",
    "write.discovery",
    {
      type: "object",
      required: ["missionId", "confirm"],
      properties: {
        missionId: { type: "string" },
        confirm: { type: "boolean" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      requireDestructiveConfirmation(token, args);
      const missionId = readRequiredString(args.missionId, "missionId");
      const result = await sdk.updateDiscoveryMission<Record<string, unknown>>(missionId, {
        status: "archived",
      });
      await writeMcpMutationAudit(pool, token, {
        actionType: "discovery_mission_archived",
        entityType: "discovery_mission",
        entityId: missionId,
      });
      return result;
    },
    true
  ),
  createWriteTool(
    "discovery.classes.create",
    "Create a discovery class.",
    "write.discovery",
    MCP_DISCOVERY_ARGUMENT_SCHEMAS.classCreate,
    async ({ sdk, pool, token }, args) => {
      const result = await sdk.createDiscoveryClass<Record<string, unknown>>(
        normalizeDiscoveryClassPayload(readPayload(args))
      );
      await writeMcpMutationAudit(pool, token, {
        actionType: "discovery_class_created",
        entityType: "discovery_hypothesis_class",
        entityId: String(result.class_key ?? ""),
      });
      return result;
    }
  ),
  createWriteTool(
    "discovery.classes.update",
    "Update a discovery class.",
    "write.discovery",
    MCP_DISCOVERY_ARGUMENT_SCHEMAS.classUpdate,
    async ({ sdk, pool, token }, args) => {
      const classKey = readRequiredString(args.classKey, "classKey");
      const result = await sdk.updateDiscoveryClass<Record<string, unknown>>(
        classKey,
        normalizeDiscoveryClassPayload(readPayload(args))
      );
      await writeMcpMutationAudit(pool, token, {
        actionType: "discovery_class_updated",
        entityType: "discovery_hypothesis_class",
        entityId: classKey,
      });
      return result;
    }
  ),
  createWriteTool(
    "discovery.classes.archive",
    "Archive a discovery class.",
    "write.discovery",
    {
      type: "object",
      required: ["classKey", "confirm"],
      properties: {
        classKey: { type: "string" },
        confirm: { type: "boolean" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      requireDestructiveConfirmation(token, args);
      const classKey = readRequiredString(args.classKey, "classKey");
      const result = await sdk.updateDiscoveryClass<Record<string, unknown>>(classKey, {
        status: "archived",
      });
      await writeMcpMutationAudit(pool, token, {
        actionType: "discovery_class_archived",
        entityType: "discovery_hypothesis_class",
        entityId: classKey,
      });
      return result;
    },
    true
  ),
  createWriteTool(
    "discovery.recall_missions.create",
    "Create a recall mission. Pass a single object in arguments.payload; do not pass a JSON string and do not nest another payload field inside payload.",
    "write.discovery",
    MCP_DISCOVERY_ARGUMENT_SCHEMAS.recallMissionCreate,
    async ({ sdk, pool, token }, args) => {
      const payload = withActorDefault(
        normalizeRecallMissionPayload(readPayload(args)),
        "createdBy",
        token.issuedByUserId
      );
      const result = await sdk.createDiscoveryRecallMission<Record<string, unknown>>(payload);
      await writeMcpMutationAudit(pool, token, {
        actionType: "discovery_recall_mission_created",
        entityType: "discovery_recall_mission",
        entityId: String(result.recall_mission_id ?? ""),
      });
      return result;
    }
  ),
  createWriteTool(
    "discovery.recall_missions.update",
    "Update a recall mission.",
    "write.discovery",
    MCP_DISCOVERY_ARGUMENT_SCHEMAS.recallMissionUpdate,
    async ({ sdk, pool, token }, args) => {
      const recallMissionId = readRequiredString(args.recallMissionId, "recallMissionId");
      const result = await sdk.updateDiscoveryRecallMission<Record<string, unknown>>(
        recallMissionId,
        normalizeRecallMissionPayload(readPayload(args))
      );
      await writeMcpMutationAudit(pool, token, {
        actionType: "discovery_recall_mission_updated",
        entityType: "discovery_recall_mission",
        entityId: recallMissionId,
      });
      return result;
    }
  ),
  createWriteTool(
    "discovery.recall_missions.acquire",
    "Request acquisition for a recall mission.",
    "write.discovery",
    {
      type: "object",
      required: ["recallMissionId"],
      properties: {
        recallMissionId: { type: "string" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      const recallMissionId = readRequiredString(args.recallMissionId, "recallMissionId");
      const result = await sdk.requestDiscoveryRecallMissionAcquire<Record<string, unknown>>(
        recallMissionId
      );
      await writeMcpMutationAudit(pool, token, {
        actionType: "discovery_recall_mission_acquired",
        entityType: "discovery_recall_mission",
        entityId: recallMissionId,
      });
      return result;
    }
  ),
  createWriteTool(
    "discovery.recall_missions.pause",
    "Pause a recall mission.",
    "write.discovery",
    {
      type: "object",
      required: ["recallMissionId", "confirm"],
      properties: {
        recallMissionId: { type: "string" },
        confirm: { type: "boolean" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      requireDestructiveConfirmation(token, args);
      const recallMissionId = readRequiredString(args.recallMissionId, "recallMissionId");
      const result = await sdk.updateDiscoveryRecallMission<Record<string, unknown>>(
        recallMissionId,
        {
          status: "paused",
        }
      );
      await writeMcpMutationAudit(pool, token, {
        actionType: "discovery_recall_mission_paused",
        entityType: "discovery_recall_mission",
        entityId: recallMissionId,
      });
      return result;
    },
    true
  ),
  createWriteTool(
    "discovery.recall_candidates.create",
    "Create a recall candidate.",
    "write.discovery",
    MCP_DISCOVERY_ARGUMENT_SCHEMAS.recallCandidateCreate,
    async ({ sdk, pool, token }, args) => {
      const result = await sdk.createDiscoveryRecallCandidate<Record<string, unknown>>(
        readPayload(args)
      );
      await writeMcpMutationAudit(pool, token, {
        actionType: "discovery_recall_candidate_created",
        entityType: "discovery_recall_candidate",
        entityId: String(result.recall_candidate_id ?? ""),
      });
      return result;
    }
  ),
  createWriteTool(
    "discovery.recall_candidates.update",
    "Update a recall candidate. Use payload.status one of pending, shortlisted, rejected, duplicate; use camelCase rejectionReason, not rejection_reason.",
    "write.discovery",
    MCP_DISCOVERY_ARGUMENT_SCHEMAS.recallCandidateUpdate,
    async ({ sdk, pool, token }, args) => {
      const recallCandidateId = readRequiredString(
        args.recallCandidateId,
        "recallCandidateId"
      );
      const result = await sdk.updateDiscoveryRecallCandidate<Record<string, unknown>>(
        recallCandidateId,
        readPayload(args)
      );
      await writeMcpMutationAudit(pool, token, {
        actionType: "discovery_recall_candidate_updated",
        entityType: "discovery_recall_candidate",
        entityId: recallCandidateId,
      });
      return result;
    }
  ),
  createWriteTool(
    "discovery.recall_candidates.promote",
    "Promote a recall candidate into the normal source graph.",
    "write.discovery",
    MCP_DISCOVERY_ARGUMENT_SCHEMAS.recallCandidatePromote,
    async ({ sdk, pool, token }, args) => {
      const recallCandidateId = readRequiredString(
        args.recallCandidateId,
        "recallCandidateId"
      );
      const payload =
        args.payload == null
          ? {}
          : normalizePayloadStringListFields(readPayload(args), {
              tags: undefined,
            });
      const overrideReason = readOptionalString(payload.overrideReason);
      await assertRecallCandidateCanPromoteThroughMcp(
        pool,
        recallCandidateId,
        overrideReason
      );
      const result = await sdk.promoteDiscoveryRecallCandidate<Record<string, unknown>>(
        recallCandidateId,
        {
          ...Object.fromEntries(
            Object.entries(payload).filter(([key]) => key !== "overrideReason")
          ),
          reviewedBy: readOptionalString(payload.reviewedBy) ?? token.issuedByUserId,
          enabled:
            typeof payload.enabled === "boolean"
              ? payload.enabled
              : true,
        }
      );
      await writeMcpMutationAudit(pool, token, {
        actionType: "discovery_recall_candidate_promoted",
        entityType: "discovery_recall_candidate",
        entityId: recallCandidateId,
      });
      return result;
    }
  ),
  createWriteTool(
    "discovery.candidates.review",
    "Review a discovery candidate. Use payload.status approved, rejected, or pending; use camelCase rejectionReason, not reason, decision, review_decision, or rejection_reason.",
    "write.discovery",
    MCP_DISCOVERY_ARGUMENT_SCHEMAS.candidateReview,
    async ({ sdk, pool, token }, args) => {
      const candidateId = readRequiredString(args.candidateId, "candidateId");
      const payload = withActorDefault(readPayload(args), "reviewedBy", token.issuedByUserId);
      const result = await sdk.updateDiscoveryCandidate<Record<string, unknown>>(candidateId, payload);
      await writeMcpMutationAudit(pool, token, {
        actionType: "discovery_candidate_reviewed",
        entityType: "discovery_candidate",
        entityId: candidateId,
      });
      return result;
    }
  ),
  createWriteTool(
    "discovery.feedback.create",
    "Create a discovery feedback event.",
    "write.discovery",
    MCP_DISCOVERY_ARGUMENT_SCHEMAS.feedbackCreate,
    async ({ sdk, pool, token }, args) => {
      const payload = withActorDefault(readPayload(args), "createdBy", token.issuedByUserId);
      const result = await sdk.createDiscoveryFeedback<Record<string, unknown>>(payload);
      await writeMcpMutationAudit(pool, token, {
        actionType: "discovery_feedback_submitted",
        entityType: "discovery_feedback_event",
        entityId: null,
      });
      return result;
    }
  ),
  createWriteTool(
    "discovery.re_evaluate",
    "Request discovery source re-evaluation.",
    "write.discovery",
    MCP_DISCOVERY_ARGUMENT_SCHEMAS.reEvaluate,
    async ({ sdk, pool, token }, args) => {
      const payload = args.payload == null ? {} : readPayload(args);
      const result = await sdk.reEvaluateDiscoverySources<Record<string, unknown>>(payload);
      await writeMcpMutationAudit(pool, token, {
        actionType: "discovery_re_evaluation_requested",
        entityType: "discovery_mission",
        entityId: readOptionalString(payload.missionId),
      });
      return result;
    }
  ),
] as const;
