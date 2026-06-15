import type { JsonSchema } from "@signalops/contracts";

export const funnelContextSchemaProperties = {
  funnelId: { type: "string" },
  laneId: { type: "string" },
  changeMode: { type: "string", enum: ["autopilot_setup", "manual_tuning", "expert_override"] },
  configurationScope: { type: "string", enum: ["funnel", "shared", "global"] },
  funnelPlanId: { type: "string" },
  planFingerprint: { type: "string" },
  operator_override_reason: { type: "string" },
  verificationTarget: { type: "string", enum: ["selection", "source_health", "llm_review", "replay"] },
} satisfies Record<string, JsonSchema>;

export const listSchema = {
  type: "object",
  properties: {
    page: { type: "number" },
    pageSize: { type: "number" },
    status: { type: "string" },
    artifactType: { type: "string" },
    interestId: { type: "string" },
    currentState: { type: "string" },
    sourceVoice: { type: "string" },
    artifactFreshnessKind: { type: "string" },
    signalProductionMode: { type: "string" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const readSchema = {
  type: "object",
  required: ["recordId"],
  properties: {
    recordId: { type: "string" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const runCreateSchema = {
  type: "object",
  required: ["runKind"],
  properties: {
    runKind: {
      type: "string",
      enum: [
        "brief_compile",
        "mega_loop",
        "candidate_acquisition",
        "probe",
        "understand_route",
        "replay",
        "rollback",
        "full",
      ],
    },
    triggerKind: {
      type: "string",
      enum: ["operator", "mcp", "api", "replay", "rollback", "eval"],
    },
    request: { type: "object", additionalProperties: true },
    budget: { type: "object", additionalProperties: true },
    createdBy: { type: "string" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const runStartSchema = {
  type: "object",
  required: ["runKind", "budget"],
  properties: {
    ...runCreateSchema.properties,
    liveProviderExecution: { type: "boolean" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const artifactCreateSchema = {
  type: "object",
  required: ["artifactType", "payload"],
  properties: {
    artifactType: {
      type: "string",
      enum: [
        "DiscoveryBrief",
        "HypothesisBatch",
        "ProbePlan",
        "ProbeReport",
        "SourceScopeResolution",
        "SourceUnderstanding",
        "RoutingDecision",
        "QueryQualityReport",
      ],
    },
    payload: { type: "object", additionalProperties: true },
    vnextRunId: { type: "string" },
    runId: { type: "string" },
    interestId: { type: "string" },
    candidateId: { type: "string" },
    parentArtifactIds: { type: "array", items: { type: "string" } },
    memoryMode: { type: "string" },
    lens: { type: "string" },
    policyVersion: { type: "string" },
    createdBy: { type: "string" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const briefPreviewSchema = {
  type: "object",
  required: ["name"],
  properties: {
    interestId: { type: "string" },
    name: { type: "string" },
    description: { type: "string" },
    positiveTexts: { type: ["string", "array"], items: { type: "string" } },
    negativeTexts: { type: ["string", "array"], items: { type: "string" } },
    candidatePositiveSignals: { type: ["string", "array"], items: { type: "string" } },
    candidateNegativeSignals: { type: ["string", "array"], items: { type: "string" } },
    geographies: { type: "array", items: { type: "string" } },
    languages: { type: "array", items: { type: "string" } },
    operatorConstraints: { type: "object", additionalProperties: true },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const megaLoopPreviewSchema = {
  type: "object",
  required: ["discoveryBrief"],
  properties: {
    discoveryBrief: { type: "object", additionalProperties: true },
    loopStrategy: { type: "string" },
    coveragePolicy: { type: "object", additionalProperties: true },
    adaptivePolicy: { type: "object", additionalProperties: true },
    maxBatches: { type: "number" },
    locale: { type: "string" },
    previousHypotheses: { type: "array", items: { type: "object", additionalProperties: true } },
    sourceInventory: { type: "array", items: { type: "object", additionalProperties: true } },
    feedbackEvents: { type: "array", items: { type: "object", additionalProperties: true } },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const candidatesNormalizeSchema = {
  type: "object",
  required: ["results", "hypothesisId"],
  properties: {
    results: { type: "array", items: { type: "object", additionalProperties: true } },
    hypothesisId: { type: "string" },
    queryAttemptId: { type: "string" },
    query: { type: "string" },
    queryFamilyIntent: { type: "string" },
    lens: { type: "string" },
    memoryMode: { type: "string" },
    vnextRunId: { type: "string" },
    runId: { type: "string" },
    interestId: { type: "string" },
    hypothesisArtifactId: { type: "string" },
    createdBy: { type: "string" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const probePlanPreviewSchema = {
  type: "object",
  required: ["candidateUrl"],
  properties: {
    candidateUrl: { type: "string" },
    candidateKindGuess: { type: "string" },
    policy: { type: "object", additionalProperties: true },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const probeExecuteSchema = {
  type: "object",
  required: ["probePlan"],
  properties: {
    probePlan: { type: "object", additionalProperties: true },
    vnextRunId: { type: "string" },
    runId: { type: "string" },
    interestId: { type: "string" },
    candidateId: { type: "string" },
    createdBy: { type: "string" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const understandPreviewSchema = {
  type: "object",
  required: ["discoveryBrief", "probeReport"],
  properties: {
    discoveryBrief: { type: "object", additionalProperties: true },
    probeReport: { type: "object", additionalProperties: true },
    sourceScopeResolution: { type: "object", additionalProperties: true },
    candidate: { type: "object", additionalProperties: true },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const scopeResolveSchema = {
  type: "object",
  required: ["probeReport"],
  properties: {
    discoveryBrief: { type: "object", additionalProperties: true },
    candidate: { type: "object", additionalProperties: true },
    probeReport: { type: "object", additionalProperties: true },
    previousMemory: { type: "object", additionalProperties: true },
    vnextRunId: { type: "string" },
    runId: { type: "string" },
    interestId: { type: "string" },
    candidateId: { type: "string" },
    parentArtifactIds: { type: "array", items: { type: "string" } },
    createdBy: { type: "string" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const routePreviewSchema = {
  type: "object",
  required: ["sourceUnderstanding"],
  properties: {
    sourceUnderstanding: { type: "object", additionalProperties: true },
    providerType: { type: "string" },
    accessPattern: { type: "string" },
    policy: { type: "object", additionalProperties: true },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const routingApplySchema = {
  type: "object",
  required: ["sourceUnderstanding", "canonicalUrl", "canonicalDomain", "sourceIdentityKey"],
  properties: {
    sourceUnderstanding: { type: "object", additionalProperties: true },
    canonicalUrl: { type: "string" },
    canonicalDomain: { type: "string" },
    sourceIdentityKey: { type: "string" },
    providerType: { type: "string" },
    accessPattern: { type: "string" },
    policy: { type: "object", additionalProperties: true },
    vnextRunId: { type: "string" },
    runId: { type: "string" },
    interestId: { type: "string" },
    candidateId: { type: "string" },
    createdBy: { type: "string" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const handoffSchema = {
  type: "object",
  required: ["sourceUnderstanding", "routingDecision"],
  properties: {
    sourceUnderstanding: { type: "object", additionalProperties: true },
    routingDecision: { type: "object", additionalProperties: true },
    sourceInventoryId: { type: "string" },
    providerType: { type: "string" },
    createdBy: { type: "string" },
    dryRun: { type: "boolean" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const sourceInventoryExplainSchema = {
  type: "object",
  required: ["sourceInventoryId"],
  properties: {
    sourceInventoryId: { type: "string" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const sourceInventoryResolveScopesSchema = {
  type: "object",
  properties: {
    sourceInventoryIds: { type: "array", items: { type: "string" } },
    limit: { type: "integer" },
    apply: { type: "boolean" },
    createdBy: { type: "string" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const policyActivateSchema = {
  type: "object",
  required: ["policyName", "policyVersion", "policyType", "definition"],
  properties: {
    policyName: { type: "string" },
    policyVersion: { type: "string" },
    policyType: {
      type: "string",
      enum: ["routing", "probe", "mega_loop", "risk", "rollback", "permissions"],
    },
    definition: { type: "object", additionalProperties: true },
    createdBy: { type: "string" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const replaySchema = {
  type: "object",
  required: ["replayKind"],
  properties: {
    replayKind: {
      type: "string",
      enum: ["artifact_lineage", "routing_policy", "candidate_acquisition", "full_non_live"],
    },
    input: { type: "object", additionalProperties: true },
    policyVersions: { type: "object", additionalProperties: true },
    dryRun: { type: "boolean" },
    createdBy: { type: "string" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const llmGatewaySchema = {
  type: "object",
  required: ["task", "payload"],
  properties: {
    task: { type: "string" },
    prompt: { type: "string" },
    payload: { type: "object", additionalProperties: true },
    budget: { type: "object", additionalProperties: true },
    model: { type: "string" },
    temperature: { type: "number" },
    outputSchema: { type: "object", additionalProperties: true },
    vnextRunId: { type: "string" },
    runId: { type: "string" },
    artifactId: { type: "string" },
    liveProviderExecution: { type: "boolean" },
    createdBy: { type: "string" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const rollbackPrepareSchema = {
  type: "object",
  required: ["sourceInventoryId", "reason"],
  properties: {
    sourceInventoryId: { type: "string" },
    reason: { type: "string" },
    createdBy: { type: "string" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const rollbackApplySchema = {
  type: "object",
  required: ["rollbackGroupId", "confirm"],
  properties: {
    rollbackGroupId: { type: "string" },
    appliedBy: { type: "string" },
    confirm: { type: "boolean" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export const feedbackSchema = {
  type: "object",
  required: ["targetType", "targetId", "feedbackType"],
  properties: {
    targetType: {
      type: "string",
      enum: ["artifact", "candidate", "source_inventory", "routing_decision", "policy"],
    },
    targetId: { type: "string" },
    feedbackType: {
      type: "string",
      enum: [
        "approve",
        "reject",
        "correct",
        "rollback",
        "mark_noise",
        "mark_useful",
        "policy_issue",
        "source_scope_correct",
        "source_scope_wrong",
        "source_understanding_correct",
        "source_understanding_wrong",
        "routing_correct",
        "routing_wrong",
        "source_useful_as_inventory",
        "source_not_useful",
        "lead_useful",
        "lead_false_positive",
        "adapter_gap_confirmed",
        "adapter_gap_wrong",
      ],
    },
    feedback: { type: "object", additionalProperties: true },
    createdBy: { type: "string" },
  },
  additionalProperties: false,
} satisfies JsonSchema;
