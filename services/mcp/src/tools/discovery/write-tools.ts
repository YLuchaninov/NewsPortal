import {
  createWriteTool,
  readOptionalString,
  readPayload,
  readRequiredString,
  requireDestructiveConfirmation,
  withActorDefault,
  writeMcpMutationAudit,
  type McpToolDefinition,
} from "../shared";

export const DISCOVERY_WRITE_MCP_TOOLS: readonly McpToolDefinition[] = [
  createWriteTool(
    "discovery.profiles.create",
    "Create a discovery profile.",
    "write.discovery",
    {
      type: "object",
      required: ["payload"],
      properties: {
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      const payload = withActorDefault(readPayload(args), "createdBy", token.issuedByUserId);
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
    {
      type: "object",
      required: ["profileId", "payload"],
      properties: {
        profileId: { type: "string" },
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      const profileId = readRequiredString(args.profileId, "profileId");
      const result = await sdk.updateDiscoveryProfile<Record<string, unknown>>(
        profileId,
        readPayload(args)
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
    "Create a discovery mission.",
    "write.discovery",
    {
      type: "object",
      required: ["payload"],
      properties: {
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      const payload = withActorDefault(readPayload(args), "createdBy", token.issuedByUserId);
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
    {
      type: "object",
      required: ["missionId", "payload"],
      properties: {
        missionId: { type: "string" },
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      const missionId = readRequiredString(args.missionId, "missionId");
      const result = await sdk.updateDiscoveryMission<Record<string, unknown>>(
        missionId,
        readPayload(args)
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
    {
      type: "object",
      required: ["missionId"],
      properties: {
        missionId: { type: "string" },
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
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
    {
      type: "object",
      required: ["missionId"],
      properties: {
        missionId: { type: "string" },
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
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
    {
      type: "object",
      required: ["payload"],
      properties: {
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      const result = await sdk.createDiscoveryClass<Record<string, unknown>>(readPayload(args));
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
    {
      type: "object",
      required: ["classKey", "payload"],
      properties: {
        classKey: { type: "string" },
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      const classKey = readRequiredString(args.classKey, "classKey");
      const result = await sdk.updateDiscoveryClass<Record<string, unknown>>(
        classKey,
        readPayload(args)
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
    "Create a recall mission.",
    "write.discovery",
    {
      type: "object",
      required: ["payload"],
      properties: {
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      const payload = withActorDefault(readPayload(args), "createdBy", token.issuedByUserId);
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
    {
      type: "object",
      required: ["recallMissionId", "payload"],
      properties: {
        recallMissionId: { type: "string" },
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      const recallMissionId = readRequiredString(args.recallMissionId, "recallMissionId");
      const result = await sdk.updateDiscoveryRecallMission<Record<string, unknown>>(
        recallMissionId,
        readPayload(args)
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
    {
      type: "object",
      required: ["payload"],
      properties: {
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
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
    "Update a recall candidate.",
    "write.discovery",
    {
      type: "object",
      required: ["recallCandidateId", "payload"],
      properties: {
        recallCandidateId: { type: "string" },
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
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
    {
      type: "object",
      required: ["recallCandidateId"],
      properties: {
        recallCandidateId: { type: "string" },
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    async ({ sdk, pool, token }, args) => {
      const recallCandidateId = readRequiredString(
        args.recallCandidateId,
        "recallCandidateId"
      );
      const payload = args.payload == null ? {} : readPayload(args);
      const result = await sdk.promoteDiscoveryRecallCandidate<Record<string, unknown>>(
        recallCandidateId,
        {
          ...payload,
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
    "Review a discovery candidate.",
    "write.discovery",
    {
      type: "object",
      required: ["candidateId", "payload"],
      properties: {
        candidateId: { type: "string" },
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
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
    {
      type: "object",
      required: ["payload"],
      properties: {
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
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
    {
      type: "object",
      properties: {
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
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
