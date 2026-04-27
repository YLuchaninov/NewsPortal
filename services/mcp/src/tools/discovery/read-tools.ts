import {
  createReadTool,
  detailSchema,
  readOptionalString,
  readPageArgs,
  readRequiredString,
  type McpToolDefinition,
} from "../shared";

export const DISCOVERY_READ_MCP_TOOLS: readonly McpToolDefinition[] = [
  createReadTool(
    "discovery.summary.get",
    "Read the discovery summary.",
    { type: "object", additionalProperties: false },
    async ({ sdk }) => sdk.getDiscoverySummary<Record<string, unknown>>()
  ),
  createReadTool(
    "discovery.profiles.list",
    "List discovery profiles.",
    {
      type: "object",
      properties: {
        page: { type: "number" },
        pageSize: { type: "number" },
        status: { type: "string" },
      },
      additionalProperties: false,
    },
    async ({ sdk }, args) =>
      sdk.listDiscoveryProfiles<Record<string, unknown>>({
        ...readPageArgs(args),
        status: readOptionalString(args.status) ?? undefined,
      })
  ),
  createReadTool(
    "discovery.profiles.read",
    "Read one discovery profile.",
    detailSchema,
    async ({ sdk }, args) =>
      sdk.getDiscoveryProfile<Record<string, unknown>>(
        readRequiredString(args.profileId, "profileId")
      )
  ),
  createReadTool(
    "discovery.classes.list",
    "List discovery classes.",
    {
      type: "object",
      properties: {
        page: { type: "number" },
        pageSize: { type: "number" },
        status: { type: "string" },
      },
      additionalProperties: false,
    },
    async ({ sdk }, args) =>
      sdk.listDiscoveryClasses<Record<string, unknown>>({
        ...readPageArgs(args),
        status: readOptionalString(args.status) ?? undefined,
      })
  ),
  createReadTool(
    "discovery.classes.read",
    "Read one discovery class.",
    detailSchema,
    async ({ sdk }, args) =>
      sdk.getDiscoveryClass<Record<string, unknown>>(readRequiredString(args.classKey, "classKey"))
  ),
  createReadTool(
    "discovery.missions.list",
    "List discovery missions.",
    {
      type: "object",
      properties: {
        page: { type: "number" },
        pageSize: { type: "number" },
        status: { type: "string" },
      },
      additionalProperties: false,
    },
    async ({ sdk }, args) =>
      sdk.listDiscoveryMissions<Record<string, unknown>>({
        ...readPageArgs(args),
        status: readOptionalString(args.status) ?? undefined,
      })
  ),
  createReadTool(
    "discovery.missions.read",
    "Read one discovery mission.",
    detailSchema,
    async ({ sdk }, args) =>
      sdk.getDiscoveryMission<Record<string, unknown>>(
        readRequiredString(args.missionId, "missionId")
      )
  ),
  createReadTool(
    "discovery.missions.portfolio.read",
    "Read one discovery mission portfolio snapshot.",
    detailSchema,
    async ({ sdk }, args) =>
      sdk.getDiscoveryMissionPortfolio<Record<string, unknown>>(
        readRequiredString(args.missionId, "missionId")
      )
  ),
  createReadTool(
    "discovery.recall_missions.list",
    "List recall missions.",
    {
      type: "object",
      properties: {
        page: { type: "number" },
        pageSize: { type: "number" },
        status: { type: "string" },
        missionKind: { type: "string" },
      },
      additionalProperties: false,
    },
    async ({ sdk }, args) =>
      sdk.listDiscoveryRecallMissions<Record<string, unknown>>({
        ...readPageArgs(args),
        status: readOptionalString(args.status) ?? undefined,
        missionKind: readOptionalString(args.missionKind) ?? undefined,
      })
  ),
  createReadTool(
    "discovery.recall_missions.read",
    "Read one recall mission.",
    detailSchema,
    async ({ sdk }, args) =>
      sdk.getDiscoveryRecallMission<Record<string, unknown>>(
        readRequiredString(args.recallMissionId, "recallMissionId")
      )
  ),
  createReadTool(
    "discovery.candidates.list",
    "List discovery candidates.",
    {
      type: "object",
      properties: {
        page: { type: "number" },
        pageSize: { type: "number" },
        missionId: { type: "string" },
        status: { type: "string" },
        providerType: { type: "string" },
      },
      additionalProperties: false,
    },
    async ({ sdk }, args) =>
      sdk.listDiscoveryCandidates<Record<string, unknown>>({
        ...readPageArgs(args),
        missionId: readOptionalString(args.missionId) ?? undefined,
        status: readOptionalString(args.status) ?? undefined,
        providerType: readOptionalString(args.providerType) ?? undefined,
      })
  ),
  createReadTool(
    "discovery.candidates.read",
    "Read one discovery candidate.",
    detailSchema,
    async ({ sdk }, args) =>
      sdk.getDiscoveryCandidate<Record<string, unknown>>(
        readRequiredString(args.candidateId, "candidateId")
      )
  ),
  createReadTool(
    "discovery.recall_candidates.list",
    "List recall candidates.",
    {
      type: "object",
      properties: {
        page: { type: "number" },
        pageSize: { type: "number" },
        recallMissionId: { type: "string" },
        status: { type: "string" },
        providerType: { type: "string" },
        canonicalDomain: { type: "string" },
      },
      additionalProperties: false,
    },
    async ({ sdk }, args) =>
      sdk.listDiscoveryRecallCandidates<Record<string, unknown>>({
        ...readPageArgs(args),
        recallMissionId: readOptionalString(args.recallMissionId) ?? undefined,
        status: readOptionalString(args.status) ?? undefined,
        providerType: readOptionalString(args.providerType) ?? undefined,
        canonicalDomain: readOptionalString(args.canonicalDomain) ?? undefined,
      })
  ),
  createReadTool(
    "discovery.recall_candidates.read",
    "Read one recall candidate.",
    detailSchema,
    async ({ sdk }, args) =>
      sdk.getDiscoveryRecallCandidate<Record<string, unknown>>(
        readRequiredString(args.recallCandidateId, "recallCandidateId")
      )
  ),
  createReadTool(
    "discovery.hypotheses.list",
    "List discovery hypotheses.",
    {
      type: "object",
      properties: {
        page: { type: "number" },
        pageSize: { type: "number" },
        missionId: { type: "string" },
        status: { type: "string" },
      },
      additionalProperties: false,
    },
    async ({ sdk }, args) =>
      sdk.listDiscoveryHypotheses<Record<string, unknown>>({
        ...readPageArgs(args),
        missionId: readOptionalString(args.missionId) ?? undefined,
        status: readOptionalString(args.status) ?? undefined,
      })
  ),
  createReadTool(
    "discovery.source_profiles.list",
    "List source profiles.",
    {
      type: "object",
      properties: {
        page: { type: "number" },
        pageSize: { type: "number" },
        sourceType: { type: "string" },
        minTrustScore: { type: "number" },
      },
      additionalProperties: false,
    },
    async ({ sdk }, args) =>
      sdk.listDiscoverySourceProfiles<Record<string, unknown>>({
        ...readPageArgs(args),
        sourceType: readOptionalString(args.sourceType) ?? undefined,
        minTrustScore:
          typeof args.minTrustScore === "number" ? args.minTrustScore : undefined,
      })
  ),
  createReadTool(
    "discovery.source_profiles.read",
    "Read one source profile.",
    detailSchema,
    async ({ sdk }, args) =>
      sdk.getDiscoverySourceProfile<Record<string, unknown>>(
        readRequiredString(args.sourceProfileId, "sourceProfileId")
      )
  ),
  createReadTool(
    "discovery.source_interest_scores.list",
    "List source-interest scores.",
    {
      type: "object",
      properties: {
        page: { type: "number" },
        pageSize: { type: "number" },
        missionId: { type: "string" },
        channelId: { type: "string" },
        minScore: { type: "number" },
      },
      additionalProperties: false,
    },
    async ({ sdk }, args) =>
      sdk.listDiscoverySourceInterestScores<Record<string, unknown>>({
        ...readPageArgs(args),
        missionId: readOptionalString(args.missionId) ?? undefined,
        channelId: readOptionalString(args.channelId) ?? undefined,
        minScore: typeof args.minScore === "number" ? args.minScore : undefined,
      })
  ),
  createReadTool(
    "discovery.source_interest_scores.read",
    "Read one source-interest score row.",
    detailSchema,
    async ({ sdk }, args) =>
      sdk.getDiscoverySourceInterestScore<Record<string, unknown>>(
        readRequiredString(args.scoreId, "scoreId")
      )
  ),
  createReadTool(
    "discovery.feedback.list",
    "List discovery feedback rows.",
    {
      type: "object",
      properties: {
        page: { type: "number" },
        pageSize: { type: "number" },
        missionId: { type: "string" },
      },
      additionalProperties: false,
    },
    async ({ sdk }, args) =>
      sdk.listDiscoveryFeedback<Record<string, unknown>>({
        ...readPageArgs(args),
        missionId: readOptionalString(args.missionId) ?? undefined,
      })
  ),
  createReadTool(
    "discovery.costs.summary",
    "Read discovery cost summary.",
    { type: "object", additionalProperties: false },
    async ({ sdk }) => sdk.getDiscoveryCostSummary<Record<string, unknown>>()
  )
] as const;
