import {
  createReadTool,
  detailSchema,
  JsonRpcError,
  readOptionalString,
  readPageArgs,
  readRequiredString,
  type McpToolDefinition,
} from "../shared";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_PREFIX_RE = /^[0-9a-f-]{8,35}$/i;

type QueryablePool = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
};

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
  const normalized = readOptionalString(value);
  if (!normalized) {
    return undefined;
  }
  if (UUID_RE.test(normalized)) {
    return normalized;
  }
  if (!UUID_PREFIX_RE.test(normalized)) {
    throw new JsonRpcError(-32602, `${input.path} must be a full UUID or a unique UUID prefix.`, {
      statusCode: 400,
      data: {
        path: input.path,
        expectedShape: "UUID or unique UUID prefix of at least 8 hex characters",
      },
    });
  }

  const result = await pool.query(
    `
      select ${input.columnName}::text as id
        from ${input.tableName}
       where ${input.columnName}::text like $1
       order by ${input.columnName}::text
       limit 2
    `,
    [`${normalized}%`]
  );
  const rows = result.rows as Array<{ id: string }>;
  if (rows.length === 1) {
    return rows[0]?.id;
  }
  if (rows.length > 1) {
    throw new JsonRpcError(-32602, `${input.path} prefix is ambiguous; pass the full UUID.`, {
      statusCode: 400,
      data: {
        path: input.path,
        value: normalized,
        matches: rows.map((row) => row.id),
      },
    });
  }
  throw new JsonRpcError(-32602, `${input.label} ${normalized} was not found.`, {
    statusCode: 400,
    data: {
      path: input.path,
      value: normalized,
    },
  });
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
