import {
  explainAdapterResearchWithPool,
  getSourceFamilyCoverageWithPool,
  getSourceRoleCoverageWithPool,
  listAdapterResearchWithPool,
  planAdapterResearch,
  planIndirectTargets,
  planIndirectTargetChannelsWithPool,
  planSourceRoles,
  startAdapterResearchWithPool,
  startIndirectTargetsWithPool,
} from "@newsportal/control-plane";

import {
  createReadTool,
  createWriteTool,
  readOptionalString,
  readPageArgs,
  readPayload,
  readRequiredString,
  readRequiredUuidString,
  withActorDefault,
  type McpToolDefinition,
} from "../shared";

const pageSchema = {
  type: "object",
  properties: {
    page: { type: "number" },
    pageSize: { type: "number" },
    status: { type: "string" },
    targetId: { type: "string" },
  },
  additionalProperties: false,
} as const;

const sourcePriorPageSchema = {
  type: "object",
  properties: {
    page: { type: "number" },
    pageSize: { type: "number" },
    targetId: { type: "string" },
    channelId: { type: "string" },
    endpointId: { type: "string" },
    contractId: { type: "string" },
  },
  additionalProperties: false,
} as const;

const payloadSchema = {
  type: "object",
  properties: {
    payload: { type: "object", additionalProperties: true },
  },
  required: ["payload"],
  additionalProperties: false,
} as const;

const sourceActionPayloadSchema = {
  type: "object",
  required: ["targetId"],
  properties: {
    targetId: { type: "string" },
    maxDepth: { type: "number" },
    maxHypotheses: { type: "number" },
    maxSearchResults: { type: "number" },
    maxDomains: { type: "number" },
    maxEndpoints: { type: "number" },
    maxSocialItems: { type: "number" },
    providerExecutionEnabled: { type: "boolean" },
    requestedBy: { type: "string" },
  },
  additionalProperties: false,
} as const;

const sourceRolePlanSchema = {
  type: "object",
  properties: {
    objective: { type: "string" },
    rareSignal: { type: "boolean" },
    includeResearchOnly: { type: "boolean" },
  },
  additionalProperties: false,
} as const;

const sourceRoleCoverageSchema = {
  type: "object",
  properties: {
    includeExamples: { type: "boolean" },
  },
  additionalProperties: false,
} as const;

const sourceFamilyCoverageSchema = {
  type: "object",
  properties: {
    includeExamples: { type: "boolean" },
  },
  additionalProperties: false,
} as const;

const adapterResearchPlanSchema = {
  type: "object",
  properties: {
    objective: { type: "string" },
    sourceRoles: { type: "array", items: { type: "string" } },
    platforms: { type: "array", items: { type: "string" } },
    includeResearchOnly: { type: "boolean" },
    maxCandidates: { type: "number" },
  },
  additionalProperties: false,
} as const;

const adapterResearchListSchema = {
  type: "object",
  properties: {
    page: { type: "number" },
    pageSize: { type: "number" },
  },
  additionalProperties: false,
} as const;

const adapterResearchExplainSchema = {
  type: "object",
  properties: {
    endpointId: { type: "string" },
  },
  required: ["endpointId"],
  additionalProperties: false,
} as const;

const indirectTargetsPlanSchema = {
  type: "object",
  properties: {
    objective: { type: "string" },
    platforms: { type: "array", items: { type: "string" } },
    queryTerms: { type: "array", items: { type: "string" } },
    maxQueries: { type: "number" },
  },
  additionalProperties: false,
} as const;

const indirectTargetChannelsPlanSchema = {
  type: "object",
  properties: {
    searchProvider: {
      type: "string",
      enum: ["ddgs_search", "searxng_search", "brave_search", "tavily_search", "exa_search", "serpapi_google_news_research"],
    },
    baseUrl: { type: "string" },
    endpointIds: { type: "array", items: { type: "string" } },
    maxChannels: { type: "number" },
    locale: { type: "string" },
    timeRange: { type: "string" },
    includeHighRisk: { type: "boolean" },
  },
  additionalProperties: false,
} as const;

function readStringListArg(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((entry) => String(entry ?? "").trim()).filter(Boolean);
}

function readPositiveNumberArg(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

const dispatchQueuedRunsPayloadSchema = {
  type: "object",
  properties: {
    payload: {
      type: "object",
      properties: {
        targetId: { type: "string" },
        runIds: { type: "array", items: { type: "string" } },
        limit: { type: "number" },
        includeAlreadyDispatched: { type: "boolean" },
        requestedBy: { type: "string" },
        reason: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  required: ["payload"],
  additionalProperties: false,
} as const;

function idSchema(field: string) {
  return {
    type: "object",
    properties: {
      [field]: { type: "string" },
    },
    required: [field],
    additionalProperties: false,
  } as const;
}

function idPayloadSchema(field: string) {
  return {
    type: "object",
    properties: {
      [field]: { type: "string" },
      payload: { type: "object", additionalProperties: true },
    },
    required: [field],
    additionalProperties: false,
  } as const;
}

function listArgs(args: Record<string, unknown>) {
  return {
    ...readPageArgs(args),
    status: readOptionalString(args.status) ?? undefined,
    targetId: readOptionalString(args.targetId) ?? undefined,
  };
}

function sourcePriorListArgs(args: Record<string, unknown>) {
  return {
    ...readPageArgs(args),
    targetId: readOptionalString(args.targetId) ?? undefined,
    channelId: readOptionalString(args.channelId) ?? undefined,
    endpointId: readOptionalString(args.endpointId) ?? undefined,
    contractId: readOptionalString(args.contractId) ?? undefined,
  };
}

export const DISCOVERY_V3_READ_MCP_TOOLS: readonly McpToolDefinition[] = [
  createReadTool(
    "discovery.summary.get",
    "Read the resilient discovery summary.",
    { type: "object", additionalProperties: false },
    async ({ sdk }) => sdk.getDiscoverySummary<Record<string, unknown>>()
  ),
  createReadTool(
    "discovery.autopilot.profiles.list",
    "List resilient discovery autopilot profiles.",
    { type: "object", additionalProperties: false },
    async ({ sdk }) => sdk.listDiscoveryAutopilotProfiles<Record<string, unknown>>()
  ),
  createReadTool(
    "discovery.targets.list",
    "List resilient discovery targets.",
    pageSchema,
    async ({ sdk }, args) => sdk.listDiscoveryTargets<Record<string, unknown>>(listArgs(args))
  ),
  createReadTool(
    "discovery.targets.read",
    "Read one resilient discovery target by full targetId.",
    idSchema("targetId"),
    async ({ sdk }, args) =>
      sdk.getDiscoveryTarget<Record<string, unknown>>(
        readRequiredUuidString(args.targetId, "targetId")
      )
  ),
  createReadTool(
    "discovery.coverage.read",
    "Read latest coverage snapshot for a target.",
    idSchema("targetId"),
    async ({ sdk }, args) =>
      sdk.getDiscoveryTargetCoverage<Record<string, unknown>>(
        readRequiredUuidString(args.targetId, "targetId")
      )
  ),
  createReadTool(
    "discovery.coverage.explain",
    "Explain latest target coverage gaps and next actions.",
    idSchema("targetId"),
    async ({ sdk }, args) =>
      sdk.explainDiscoveryTargetCoverage<Record<string, unknown>>(
        readRequiredUuidString(args.targetId, "targetId")
      )
  ),
  createReadTool(
    "discovery.runs.list",
    "List resilient discovery runs.",
    pageSchema,
    async ({ sdk }, args) => sdk.listDiscoveryRuns<Record<string, unknown>>(listArgs(args))
  ),
  createReadTool(
    "discovery.runs.read",
    "Read one resilient discovery run.",
    idSchema("runId"),
    async ({ sdk }, args) =>
      sdk.getDiscoveryRun<Record<string, unknown>>(readRequiredUuidString(args.runId, "runId"))
  ),
  createReadTool(
    "discovery.runs.diagnose",
    "Diagnose one resilient discovery run from persisted metrics.",
    idSchema("runId"),
    async ({ sdk }, args) =>
      sdk.diagnoseDiscoveryRun<Record<string, unknown>>(
        readRequiredUuidString(args.runId, "runId")
      )
  ),
  createReadTool(
    "discovery.source_priors.list",
    "List applied rare-signal source priors from channel config and Source Evidence Contracts. Prior-only evidence is not selected content.",
    sourcePriorPageSchema,
    async ({ sdk }, args) =>
      sdk.listDiscoverySourcePriors<Record<string, unknown>>(sourcePriorListArgs(args))
  ),
  createReadTool(
    "discovery.source_priors.evaluate",
    "Read-only rare-signal source-prior scoring for a target plus channel/endpoint/contract. This estimates whether a source deserves longer monitor/probation observation and never selects articles.",
    payloadSchema,
    async ({ sdk }, args) =>
      sdk.evaluateDiscoverySourcePrior<Record<string, unknown>>(readPayload(args))
  ),
  createReadTool(
    "discovery.source_roles.plan",
    "Plan thematic source roles for a rare-signal objective. This is acquisition guidance only and never selects content.",
    sourceRolePlanSchema,
    async (_context, args) =>
      planSourceRoles({
        objective: readOptionalString(args.objective) ?? undefined,
        rareSignal: typeof args.rareSignal === "boolean" ? args.rareSignal : undefined,
        includeResearchOnly:
          typeof args.includeResearchOnly === "boolean" ? args.includeResearchOnly : undefined,
      })
  ),
  createReadTool(
    "discovery.source_roles.coverage",
    "Read DB-backed thematic source-role coverage across channels and adapter/access-required endpoint evidence.",
    sourceRoleCoverageSchema,
    async ({ pool }, args) =>
      getSourceRoleCoverageWithPool(pool, {
        includeExamples: typeof args.includeExamples === "boolean" ? args.includeExamples : false,
      })
  ),
  createReadTool(
    "discovery.source_families.coverage",
    "Read DB-backed coverage-first source-family balance, lifecycle labels, noisy-source retention, and repair/access gaps.",
    sourceFamilyCoverageSchema,
    async ({ pool }, args) =>
      getSourceFamilyCoverageWithPool(pool, {
        includeExamples: typeof args.includeExamples === "boolean" ? args.includeExamples : false,
      })
  ),
  createReadTool(
    "discovery.adapter_research.plan",
    "Plan adapter research candidates for thematic source roles, including official/public, research-only, closed-access, and unsupported lanes.",
    adapterResearchPlanSchema,
    async (_context, args) =>
      planAdapterResearch({
        objective: readOptionalString(args.objective) ?? undefined,
        sourceRoles: readStringListArg(args.sourceRoles),
        platforms: readStringListArg(args.platforms),
        includeResearchOnly:
          typeof args.includeResearchOnly === "boolean" ? args.includeResearchOnly : undefined,
        maxCandidates: readPositiveNumberArg(args.maxCandidates),
      })
  ),
  createReadTool(
    "discovery.adapter_research.list",
    "List persisted adapter research endpoint evidence. These rows do not create channels or selected content by themselves.",
    adapterResearchListSchema,
    async ({ pool }, args) =>
      listAdapterResearchWithPool(pool, {
        page: readPositiveNumberArg(args.page),
        pageSize: readPositiveNumberArg(args.pageSize),
      })
  ),
  createReadTool(
    "discovery.adapter_research.explain",
    "Explain one persisted adapter research endpoint and its production/research/access implications.",
    adapterResearchExplainSchema,
    async ({ pool }, args) =>
      explainAdapterResearchWithPool(pool, {
        endpointId: readRequiredUuidString(args.endpointId, "endpointId"),
      })
  ),
  createReadTool(
    "discovery.indirect_targets.plan",
    "Plan bounded indirect aggregator queries for closed/API-gapped thematic source roles. Aggregator hits still need item-level evidence.",
    indirectTargetsPlanSchema,
    async (_context, args) =>
      planIndirectTargets({
        objective: readOptionalString(args.objective) ?? undefined,
        platforms: readStringListArg(args.platforms),
        queryTerms: readStringListArg(args.queryTerms),
        maxQueries: readPositiveNumberArg(args.maxQueries),
      })
  ),
  createReadTool(
    "discovery.indirect_targets.channels.plan",
    "Read-only planner that converts detect-only indirect aggregator endpoint evidence into API channel rows for channels.bulk_onboard.plan/apply/verify.",
    indirectTargetChannelsPlanSchema,
    async ({ pool }, args) =>
      planIndirectTargetChannelsWithPool(pool, {
        searchProvider: readOptionalString(args.searchProvider) as
          | "ddgs_search"
          | "searxng_search"
          | "brave_search"
          | "tavily_search"
          | "exa_search"
          | "serpapi_google_news_research"
          | undefined,
        baseUrl: readOptionalString(args.baseUrl) ?? undefined,
        endpointIds: readStringListArg(args.endpointIds),
        maxChannels: readPositiveNumberArg(args.maxChannels),
        locale: readOptionalString(args.locale) ?? undefined,
        timeRange: readOptionalString(args.timeRange) ?? undefined,
        includeHighRisk: typeof args.includeHighRisk === "boolean" ? args.includeHighRisk : undefined,
      })
  ),
  createReadTool(
    "discovery.endpoints.list",
    "List resilient discovery endpoints.",
    pageSchema,
    async ({ sdk }, args) => sdk.listDiscoveryEndpoints<Record<string, unknown>>(listArgs(args))
  ),
  createReadTool(
    "discovery.endpoints.read",
    "Read one resilient discovery endpoint.",
    idSchema("endpointId"),
    async ({ sdk }, args) =>
      sdk.getDiscoveryEndpoint<Record<string, unknown>>(
        readRequiredUuidString(args.endpointId, "endpointId")
      )
  ),
  createReadTool(
    "discovery.endpoints.explain",
    "Explain why an endpoint was found, why it was not promoted, missing evidence and next action.",
    idSchema("endpointId"),
    async ({ sdk }, args) =>
      sdk.explainDiscoveryEndpoint<Record<string, unknown>>(
        readRequiredUuidString(args.endpointId, "endpointId")
      )
  ),
  createReadTool(
    "discovery.hypotheses.list",
    "List resilient discovery hypotheses.",
    pageSchema,
    async ({ sdk }, args) => sdk.listDiscoveryHypotheses<Record<string, unknown>>(listArgs(args))
  ),
  createReadTool(
    "discovery.hypotheses.read",
    "Read one resilient discovery hypothesis.",
    idSchema("hypothesisId"),
    async ({ sdk }, args) =>
      sdk.getDiscoveryHypothesis<Record<string, unknown>>(
        readRequiredUuidString(args.hypothesisId, "hypothesisId")
      )
  ),
  createReadTool(
    "discovery.domains.list",
    "List resilient discovery domain inventory rows.",
    pageSchema,
    async ({ sdk }, args) => sdk.listDiscoveryDomains<Record<string, unknown>>(listArgs(args))
  ),
  createReadTool(
    "discovery.domains.read",
    "Read one resilient discovery domain inventory row.",
    idSchema("domainId"),
    async ({ sdk }, args) =>
      sdk.getDiscoveryDomain<Record<string, unknown>>(
        readRequiredUuidString(args.domainId, "domainId")
      )
  ),
  createReadTool(
    "discovery.actions.list",
    "List resilient discovery actions.",
    pageSchema,
    async ({ sdk }, args) => sdk.listDiscoveryActions<Record<string, unknown>>(listArgs(args))
  ),
  createReadTool(
    "discovery.actions.read",
    "Read one resilient discovery action.",
    idSchema("actionId"),
    async ({ sdk }, args) =>
      sdk.getDiscoveryAction<Record<string, unknown>>(
        readRequiredUuidString(args.actionId, "actionId")
      )
  ),
  createReadTool(
    "discovery.contracts.list",
    "List source evidence contracts.",
    pageSchema,
    async ({ sdk }, args) => sdk.listDiscoveryContracts<Record<string, unknown>>(listArgs(args))
  ),
  createReadTool(
    "discovery.contracts.read",
    "Read one source evidence contract.",
    idSchema("contractId"),
    async ({ sdk }, args) =>
      sdk.getDiscoveryContract<Record<string, unknown>>(
        readRequiredUuidString(args.contractId, "contractId")
      )
  ),
  createReadTool(
    "discovery.claims.list",
    "List hidden-signal claims.",
    pageSchema,
    async ({ sdk }, args) => sdk.listDiscoveryClaims<Record<string, unknown>>(listArgs(args))
  ),
  createReadTool(
    "discovery.claims.read",
    "Read one hidden-signal claim.",
    idSchema("claimId"),
    async ({ sdk }, args) =>
      sdk.getDiscoveryClaim<Record<string, unknown>>(
        readRequiredUuidString(args.claimId, "claimId")
      )
  ),
  createReadTool(
    "discovery.negative_evidence.list",
    "List negative evidence and cooldowns.",
    pageSchema,
    async ({ sdk }, args) =>
      sdk.listDiscoveryNegativeEvidence<Record<string, unknown>>(listArgs(args))
  ),
  createReadTool(
    "discovery.negative_evidence.read",
    "Read one negative evidence row.",
    idSchema("negativeEvidenceId"),
    async ({ sdk }, args) =>
      sdk.getDiscoveryNegativeEvidence<Record<string, unknown>>(
        readRequiredUuidString(args.negativeEvidenceId, "negativeEvidenceId")
      )
  ),
  createReadTool(
    "discovery.provider_health.list",
    "List provider health and circuit-breaker state.",
    pageSchema,
    async ({ sdk }, args) => sdk.listDiscoveryProviderHealth<Record<string, unknown>>(listArgs(args))
  ),
  createReadTool(
    "discovery.provider_health.read",
    "Read one provider health row by providerId.",
    idSchema("providerId"),
    async ({ sdk }, args) =>
      sdk.getDiscoveryProviderHealth<Record<string, unknown>>(
        readRequiredString(args.providerId, "providerId")
      )
  ),
  createReadTool(
    "discovery.identities.list",
    "List source identity rows used for duplicate pressure control.",
    pageSchema,
    async ({ sdk }, args) => sdk.listDiscoveryIdentities<Record<string, unknown>>(listArgs(args))
  ),
  createReadTool(
    "discovery.identities.read",
    "Read one source identity row.",
    idSchema("identityId"),
    async ({ sdk }, args) =>
      sdk.getDiscoveryIdentity<Record<string, unknown>>(
        readRequiredUuidString(args.identityId, "identityId")
      )
  ),
  createReadTool(
    "discovery.eval_suites.list",
    "List resilient discovery replay eval suites.",
    pageSchema,
    async ({ sdk }, args) => sdk.listDiscoveryEvalSuites<Record<string, unknown>>(listArgs(args))
  ),
  createReadTool(
    "discovery.eval_suites.read",
    "Read one resilient discovery replay eval suite.",
    idSchema("evalSuiteId"),
    async ({ sdk }, args) =>
      sdk.getDiscoveryEvalSuite<Record<string, unknown>>(
        readRequiredUuidString(args.evalSuiteId, "evalSuiteId")
      )
  ),
  createReadTool(
    "discovery.eval_runs.list",
    "List resilient discovery replay eval runs.",
    pageSchema,
    async ({ sdk }, args) => sdk.listDiscoveryEvalRuns<Record<string, unknown>>(listArgs(args))
  ),
  createReadTool(
    "discovery.eval_runs.read",
    "Read one resilient discovery replay eval run.",
    idSchema("evalRunId"),
    async ({ sdk }, args) =>
      sdk.getDiscoveryEvalRun<Record<string, unknown>>(
        readRequiredUuidString(args.evalRunId, "evalRunId")
      )
  ),
  createReadTool(
    "discovery.llm_decisions.list",
    "List discovery LLM decisions, schema validation and fallback records.",
    pageSchema,
    async ({ sdk }, args) =>
      sdk.listDiscoveryLlmDecisions<Record<string, unknown>>(listArgs(args))
  ),
  createReadTool(
    "discovery.llm_decisions.read",
    "Read one discovery LLM decision.",
    idSchema("decisionId"),
    async ({ sdk }, args) =>
      sdk.getDiscoveryLlmDecision<Record<string, unknown>>(
        readRequiredUuidString(args.decisionId, "decisionId")
      )
  ),
];

export const DISCOVERY_V3_WRITE_MCP_TOOLS: readonly McpToolDefinition[] = [
  createWriteTool(
    "discovery.targets.create_manual",
    "Create a manual resilient discovery target.",
    "write.discovery",
    payloadSchema,
    async ({ sdk, token }, args) =>
      sdk.createDiscoveryTarget<Record<string, unknown>>(
        withActorDefault(readPayload(args), "createdBy", token.issuedByUserId)
      )
  ),
  createWriteTool(
    "discovery.targets.create_simple",
    "Create a resilient discovery target from a simple operator prompt and safe autopilot defaults.",
    "write.discovery",
    payloadSchema,
    async ({ sdk, token }, args) =>
      sdk.createSimpleDiscoveryTarget<Record<string, unknown>>(
        withActorDefault(readPayload(args), "createdBy", token.issuedByUserId)
      )
  ),
  createWriteTool(
    "discovery.config.simplify",
    "Simplify a discovery prompt/config into target/autopilot/policy hints without creating a target.",
    "write.discovery",
    payloadSchema,
    async ({ sdk }, args) =>
      sdk.simplifyDiscoveryConfig<Record<string, unknown>>(readPayload(args))
  ),
  createWriteTool(
    "discovery.targets.update",
    "Update a resilient discovery target.",
    "write.discovery",
    idPayloadSchema("targetId"),
    async ({ sdk }, args) =>
      sdk.updateDiscoveryTarget<Record<string, unknown>>(
        readRequiredUuidString(args.targetId, "targetId"),
        readPayload(args)
      )
  ),
  createWriteTool(
    "discovery.coverage.refresh",
    "Refresh coverage for a resilient discovery target.",
    "write.discovery",
    idSchema("targetId"),
    async ({ sdk }, args) =>
      sdk.refreshDiscoveryTargetCoverage<Record<string, unknown>>(
        readRequiredUuidString(args.targetId, "targetId")
      )
  ),
  createWriteTool(
    "discovery.runs.start",
    "Start a resilient discovery run.",
    "write.discovery",
    payloadSchema,
    async ({ sdk, token }, args) =>
      sdk.createDiscoveryRun<Record<string, unknown>>(
        withActorDefault(readPayload(args), "createdBy", token.issuedByUserId)
      )
  ),
  createWriteTool(
    "discovery.runs.dispatch_queued",
    "Dispatch retained queued discovery runs into the Sequence Runner without deleting or cleaning old run rows.",
    "write.discovery",
    dispatchQueuedRunsPayloadSchema,
    async ({ sdk, token }, args) =>
      sdk.dispatchQueuedDiscoveryRuns<Record<string, unknown>>(
        withActorDefault(readPayload(args), "requestedBy", token.issuedByUserId)
      )
  ),
  createWriteTool(
    "discovery.runs.cancel",
    "Cancel a queued or running resilient discovery run.",
    "write.discovery",
    idSchema("runId"),
    async ({ sdk }, args) =>
      sdk.cancelDiscoveryRun<Record<string, unknown>>(readRequiredUuidString(args.runId, "runId"))
  ),
  createWriteTool(
    "discovery.source_priors.apply",
    "Apply a high/medium rare-signal source prior through discovery contract/channel JSON annotations. This extends monitoring only; it does not promote or select articles.",
    "write.discovery",
    payloadSchema,
    async ({ sdk, token }, args) =>
      sdk.applyDiscoverySourcePrior<Record<string, unknown>>(
        withActorDefault(readPayload(args), "requestedBy", token.issuedByUserId)
      )
  ),
  createWriteTool(
    "discovery.adapter_research.start",
    "Persist bounded adapter research endpoint evidence for thematic source roles. This does not create channels or select content.",
    "write.discovery",
    payloadSchema,
    async ({ pool, token }, args) =>
      startAdapterResearchWithPool(
        pool,
        withActorDefault(readPayload(args), "requestedBy", token.issuedByUserId)
      )
  ),
  createWriteTool(
    "discovery.indirect_targets.start",
    "Persist bounded indirect aggregator target evidence for closed/API-gapped thematic source roles. This does not create channels or select content.",
    "write.discovery",
    payloadSchema,
    async ({ pool, token }, args) =>
      startIndirectTargetsWithPool(
        pool,
        withActorDefault(readPayload(args), "requestedBy", token.issuedByUserId)
      )
  ),
  createWriteTool(
    "discovery.endpoints.promote",
    "Promote an endpoint into source_channels probation with a Source Evidence Contract.",
    "write.discovery",
    idPayloadSchema("endpointId"),
    async ({ sdk, token }, args) =>
      sdk.promoteDiscoveryEndpoint<Record<string, unknown>>(
        readRequiredUuidString(args.endpointId, "endpointId"),
        withActorDefault(readPayload(args), "reviewedBy", token.issuedByUserId)
      )
  ),
  createWriteTool(
    "discovery.endpoints.reject",
    "Reject a resilient discovery endpoint.",
    "write.discovery",
    idPayloadSchema("endpointId"),
    async ({ sdk, token }, args) =>
      sdk.rejectDiscoveryEndpoint<Record<string, unknown>>(
        readRequiredUuidString(args.endpointId, "endpointId"),
        withActorDefault(readPayload(args), "reviewedBy", token.issuedByUserId)
      )
  ),
  createWriteTool(
    "discovery.endpoints.expand",
    "Queue source expansion from an endpoint.",
    "write.discovery",
    idPayloadSchema("endpointId"),
    async ({ sdk, token }, args) =>
      sdk.expandDiscoveryEndpoint<Record<string, unknown>>(
        readRequiredUuidString(args.endpointId, "endpointId"),
        withActorDefault(readPayload(args), "reviewedBy", token.issuedByUserId)
      )
  ),
  createWriteTool(
    "discovery.endpoints.mark_duplicate",
    "Mark a resilient discovery endpoint as duplicate.",
    "write.discovery",
    idPayloadSchema("endpointId"),
    async ({ sdk, token }, args) =>
      sdk.markDiscoveryEndpointDuplicate<Record<string, unknown>>(
        readRequiredUuidString(args.endpointId, "endpointId"),
        withActorDefault(readPayload(args), "reviewedBy", token.issuedByUserId)
      )
  ),
  createWriteTool(
    "discovery.contracts.evaluate",
    "Evaluate a Source Evidence Contract and update probation/trust state.",
    "write.discovery",
    idPayloadSchema("contractId"),
    async ({ sdk, token }, args) =>
      sdk.evaluateDiscoveryContract<Record<string, unknown>>(
        readRequiredUuidString(args.contractId, "contractId"),
        withActorDefault(readPayload(args), "evaluatedBy", token.issuedByUserId)
      )
  ),
  createWriteTool(
    "discovery.negative_evidence.clear_cooldown",
    "Clear a negative-evidence cooldown after operator review.",
    "write.discovery",
    idSchema("negativeEvidenceId"),
    async ({ sdk }, args) =>
      sdk.clearDiscoveryNegativeEvidenceCooldown<Record<string, unknown>>(
        readRequiredUuidString(args.negativeEvidenceId, "negativeEvidenceId")
      )
  ),
  createWriteTool(
    "discovery.provider_health.repair",
    "Queue provider-health repair and clear provider cooldown where allowed.",
    "write.discovery",
    idPayloadSchema("providerId"),
    async ({ sdk, token }, args) =>
      sdk.repairDiscoveryProvider<Record<string, unknown>>(
        readRequiredString(args.providerId, "providerId"),
        withActorDefault(readPayload(args), "requestedBy", token.issuedByUserId)
      )
  ),
  createWriteTool(
    "discovery.eval_suites.run",
    "Run a stored resilient discovery replay eval suite.",
    "write.discovery",
    idPayloadSchema("evalSuiteId"),
    async ({ sdk, token }, args) =>
      sdk.runDiscoveryEvalSuite<Record<string, unknown>>(
        readRequiredUuidString(args.evalSuiteId, "evalSuiteId"),
        withActorDefault(readPayload(args), "requestedBy", token.issuedByUserId)
      )
  ),
  createWriteTool(
    "discovery.sources.expand_existing",
    "Queue sibling/feed/related-domain expansion from an existing source channel.",
    "write.discovery",
    {
      type: "object",
      properties: {
        channelId: { type: "string" },
        payload: sourceActionPayloadSchema,
      },
      required: ["channelId", "payload"],
      additionalProperties: false,
    },
    async ({ sdk, token }, args) =>
      sdk.expandExistingDiscoverySource<Record<string, unknown>>(
        readRequiredUuidString(args.channelId, "channelId"),
        withActorDefault(readPayload(args), "requestedBy", token.issuedByUserId)
      )
  ),
  createWriteTool(
    "discovery.sources.replace_candidates",
    "Queue same-role replacement discovery for an existing weak/degraded source channel.",
    "write.discovery",
    {
      type: "object",
      properties: {
        channelId: { type: "string" },
        payload: sourceActionPayloadSchema,
      },
      required: ["channelId", "payload"],
      additionalProperties: false,
    },
    async ({ sdk, token }, args) =>
      sdk.replaceDiscoverySourceCandidates<Record<string, unknown>>(
        readRequiredUuidString(args.channelId, "channelId"),
        withActorDefault(readPayload(args), "requestedBy", token.issuedByUserId)
      )
  ),
];
