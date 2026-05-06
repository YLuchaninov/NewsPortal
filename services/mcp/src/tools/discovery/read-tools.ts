import {
  createReadTool,
  JsonRpcError,
  readAliasedRequiredString,
  readOptionalString,
  readPageArgs,
  resolveUniqueUuidPrefix,
  type McpToolDefinition,
} from "../shared";

type QueryablePool = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
};

const profileDetailSchema = {
  type: "object",
  properties: {
    profileId: { type: "string" },
    id: { type: "string" },
    entityId: { type: "string" },
  },
  additionalProperties: false,
} as const;

const classDetailSchema = {
  type: "object",
  properties: {
    classKey: { type: "string" },
    key: { type: "string" },
    id: { type: "string" },
    entityId: { type: "string" },
  },
  additionalProperties: false,
} as const;

const missionDetailSchema = {
  type: "object",
  properties: {
    missionId: { type: "string" },
    id: { type: "string" },
    entityId: { type: "string" },
  },
  additionalProperties: false,
} as const;

const candidateDetailSchema = {
  type: "object",
  properties: {
    candidateId: { type: "string" },
    id: { type: "string" },
    entityId: { type: "string" },
  },
  additionalProperties: false,
} as const;

const recallMissionDetailSchema = {
  type: "object",
  properties: {
    recallMissionId: { type: "string" },
    missionId: { type: "string" },
    id: { type: "string" },
    entityId: { type: "string" },
  },
  additionalProperties: false,
} as const;

const recallCandidateDetailSchema = {
  type: "object",
  properties: {
    recallCandidateId: { type: "string" },
    candidateId: { type: "string" },
    id: { type: "string" },
    entityId: { type: "string" },
  },
  additionalProperties: false,
} as const;

const sourceProfileDetailSchema = {
  type: "object",
  properties: {
    sourceProfileId: { type: "string" },
    profileId: { type: "string" },
    id: { type: "string" },
    entityId: { type: "string" },
  },
  additionalProperties: false,
} as const;

const sourceInterestScoreDetailSchema = {
  type: "object",
  properties: {
    scoreId: { type: "string" },
    id: { type: "string" },
    entityId: { type: "string" },
  },
  additionalProperties: false,
} as const;

async function resolveUuidFilter(
  pool: QueryablePool,
  value: unknown,
  input: {
    path: string;
    tableName: string;
    columnName: string;
    label: string;
  }
): Promise<string | undefined> {
  return resolveUniqueUuidPrefix(pool, value, input);
}

async function resolveUuidArgument(
  pool: QueryablePool,
  args: Record<string, unknown>,
  input: {
    canonicalField: string;
    aliases: readonly string[];
    tableName: string;
    columnName: string;
    label: string;
  }
): Promise<string> {
  const resolved = await resolveUuidFilter(
    pool,
    readAliasedRequiredString(args, input.canonicalField, input.aliases),
    {
      path: input.canonicalField,
      tableName: input.tableName,
      columnName: input.columnName,
      label: input.label,
    }
  );
  if (!resolved) {
    throw new JsonRpcError(-32602, `${input.canonicalField} is required.`, {
      statusCode: 400,
      data: { path: input.canonicalField },
    });
  }
  return resolved;
}

function resolveMissionIdFilter(
  pool: QueryablePool,
  value: unknown,
  path = "missionId"
): Promise<string | undefined> {
  return resolveUuidFilter(pool, value, {
    path,
    tableName: "discovery_missions",
    columnName: "mission_id",
    label: "Discovery mission",
  });
}

async function resolveMissionIdArgument(
  pool: QueryablePool,
  args: Record<string, unknown>
): Promise<string> {
  const missionId = await resolveMissionIdFilter(
    pool,
    readAliasedRequiredString(args, "missionId", ["id", "entityId"])
  );
  if (!missionId) {
    throw new JsonRpcError(-32602, "missionId is required.", {
      statusCode: 400,
      data: { path: "missionId" },
    });
  }
  return missionId;
}

function resolveRecallMissionIdFilter(
  pool: QueryablePool,
  value: unknown,
  path = "recallMissionId"
): Promise<string | undefined> {
  return resolveUuidFilter(pool, value, {
    path,
    tableName: "discovery_recall_missions",
    columnName: "recall_mission_id",
    label: "Discovery recall mission",
  });
}

async function resolveRecallMissionIdArgument(
  pool: QueryablePool,
  args: Record<string, unknown>
): Promise<string> {
  const recallMissionId = await resolveRecallMissionIdFilter(
    pool,
    readAliasedRequiredString(args, "recallMissionId", ["missionId", "id", "entityId"])
  );
  if (!recallMissionId) {
    throw new JsonRpcError(-32602, "recallMissionId is required.", {
      statusCode: 400,
      data: { path: "recallMissionId" },
    });
  }
  return recallMissionId;
}

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
    "Read one discovery profile. Prefer profileId; id/entityId and unique UUID prefixes from reports are accepted for read-back.",
    profileDetailSchema,
    async ({ sdk, pool }, args) =>
      sdk.getDiscoveryProfile<Record<string, unknown>>(
        await resolveUuidArgument(pool, args, {
          canonicalField: "profileId",
          aliases: ["id", "entityId"],
          tableName: "discovery_profiles",
          columnName: "profile_id",
          label: "Discovery profile",
        })
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
    "Read one discovery class. Prefer classKey; key/id/entityId are accepted for read-back.",
    classDetailSchema,
    async ({ sdk }, args) =>
      sdk.getDiscoveryClass<Record<string, unknown>>(
        readAliasedRequiredString(args, "classKey", ["key", "id", "entityId"])
      )
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
    "Read one discovery mission. Prefer missionId; id/entityId and unique UUID prefixes from reports are accepted for read-back.",
    missionDetailSchema,
    async ({ sdk, pool }, args) =>
      sdk.getDiscoveryMission<Record<string, unknown>>(
        await resolveMissionIdArgument(pool, args)
      )
  ),
  createReadTool(
    "discovery.missions.portfolio.read",
    "Read one discovery mission portfolio snapshot. Prefer missionId; id/entityId and unique UUID prefixes from reports are accepted for read-back.",
    missionDetailSchema,
    async ({ sdk, pool }, args) =>
      sdk.getDiscoveryMissionPortfolio<Record<string, unknown>>(
        await resolveMissionIdArgument(pool, args)
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
    "Read one recall mission. Prefer recallMissionId; missionId/id/entityId and unique UUID prefixes from reports are accepted for read-back.",
    recallMissionDetailSchema,
    async ({ sdk, pool }, args) =>
      sdk.getDiscoveryRecallMission<Record<string, unknown>>(
        await resolveRecallMissionIdArgument(pool, args)
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
    async ({ sdk, pool }, args) =>
      sdk.listDiscoveryCandidates<Record<string, unknown>>({
        ...readPageArgs(args),
        missionId: await resolveMissionIdFilter(pool, args.missionId),
        status: readOptionalString(args.status) ?? undefined,
        providerType: readOptionalString(args.providerType) ?? undefined,
      })
  ),
  createReadTool(
    "discovery.candidates.read",
    "Read one discovery candidate. Prefer candidateId; id/entityId and unique UUID prefixes from reports are accepted for read-back.",
    candidateDetailSchema,
    async ({ sdk, pool }, args) =>
      sdk.getDiscoveryCandidate<Record<string, unknown>>(
        await resolveUuidArgument(pool, args, {
          canonicalField: "candidateId",
          aliases: ["id", "entityId"],
          tableName: "discovery_candidates",
          columnName: "candidate_id",
          label: "Discovery candidate",
        })
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
    async ({ sdk, pool }, args) =>
      sdk.listDiscoveryRecallCandidates<Record<string, unknown>>({
        ...readPageArgs(args),
        recallMissionId: await resolveRecallMissionIdFilter(pool, args.recallMissionId),
        status: readOptionalString(args.status) ?? undefined,
        providerType: readOptionalString(args.providerType) ?? undefined,
        canonicalDomain: readOptionalString(args.canonicalDomain) ?? undefined,
      })
  ),
  createReadTool(
    "discovery.recall_candidates.read",
    "Read one recall candidate. Prefer recallCandidateId; candidateId/id/entityId and unique UUID prefixes from reports are accepted for read-back.",
    recallCandidateDetailSchema,
    async ({ sdk, pool }, args) =>
      sdk.getDiscoveryRecallCandidate<Record<string, unknown>>(
        await resolveUuidArgument(pool, args, {
          canonicalField: "recallCandidateId",
          aliases: ["candidateId", "id", "entityId"],
          tableName: "discovery_recall_candidates",
          columnName: "recall_candidate_id",
          label: "Discovery recall candidate",
        })
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
    async ({ sdk, pool }, args) =>
      sdk.listDiscoveryHypotheses<Record<string, unknown>>({
        ...readPageArgs(args),
        missionId: await resolveMissionIdFilter(pool, args.missionId),
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
    "Read one discovery source profile. Prefer sourceProfileId; profileId/id/entityId and unique UUID prefixes from reports are accepted for read-back.",
    sourceProfileDetailSchema,
    async ({ sdk, pool }, args) =>
      sdk.getDiscoverySourceProfile<Record<string, unknown>>(
        await resolveUuidArgument(pool, args, {
          canonicalField: "sourceProfileId",
          aliases: ["profileId", "id", "entityId"],
          tableName: "discovery_source_profiles",
          columnName: "source_profile_id",
          label: "Discovery source profile",
        })
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
    async ({ sdk, pool }, args) =>
      sdk.listDiscoverySourceInterestScores<Record<string, unknown>>({
        ...readPageArgs(args),
        missionId: await resolveMissionIdFilter(pool, args.missionId),
        channelId: readOptionalString(args.channelId) ?? undefined,
        minScore: typeof args.minScore === "number" ? args.minScore : undefined,
      })
  ),
  createReadTool(
    "discovery.source_interest_scores.read",
    "Read one source-interest score row. Prefer scoreId; id/entityId and unique UUID prefixes from reports are accepted for read-back.",
    sourceInterestScoreDetailSchema,
    async ({ sdk, pool }, args) =>
      sdk.getDiscoverySourceInterestScore<Record<string, unknown>>(
        await resolveUuidArgument(pool, args, {
          canonicalField: "scoreId",
          aliases: ["id", "entityId"],
          tableName: "discovery_source_interest_scores",
          columnName: "score_id",
          label: "Discovery source-interest score",
        })
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
    async ({ sdk, pool }, args) =>
      sdk.listDiscoveryFeedback<Record<string, unknown>>({
        ...readPageArgs(args),
        missionId: await resolveMissionIdFilter(pool, args.missionId),
      })
  ),
  createReadTool(
    "discovery.costs.summary",
    "Read discovery cost summary.",
    { type: "object", additionalProperties: false },
    async ({ sdk }) => sdk.getDiscoveryCostSummary<Record<string, unknown>>()
  )
] as const;
