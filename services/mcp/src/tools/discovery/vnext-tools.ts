import { getMcpTokenAllowedFunnelIds } from "@signalops/control-plane";
import type { JsonSchema } from "@signalops/contracts";

import {
  createReadTool,
  createWriteTool,
  JsonRpcError,
  mcpFunnelWriteContextPayload,
  readOptionalString,
  readPageArgs,
  readRequiredString,
  readMcpFunnelWriteContext,
  shouldAuditMcpFunnelWriteContext,
  withActorDefault,
  withMcpFunnelWriteContext,
  writeMcpMutationAudit,
  type McpFunnelWriteContext,
  type McpToolContext,
  type McpToolDefinition,
} from "../shared";

const funnelContextSchemaProperties = {
  funnelId: { type: "string" },
  laneId: { type: "string" },
  changeMode: { type: "string", enum: ["autopilot_setup", "manual_tuning", "expert_override"] },
  configurationScope: { type: "string", enum: ["funnel", "shared", "global"] },
  funnelPlanId: { type: "string" },
  planFingerprint: { type: "string" },
  operator_override_reason: { type: "string" },
  verificationTarget: { type: "string", enum: ["selection", "source_health", "llm_review", "replay"] },
} satisfies Record<string, JsonSchema>;

const funnelContextFieldNames = new Set(Object.keys(funnelContextSchemaProperties));

const listSchema = {
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

const readSchema = {
  type: "object",
  required: ["recordId"],
  properties: {
    recordId: { type: "string" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

const runCreateSchema = {
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

const runStartSchema = {
  type: "object",
  required: ["runKind", "budget"],
  properties: {
    ...runCreateSchema.properties,
    liveProviderExecution: { type: "boolean" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

const artifactCreateSchema = {
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

const briefPreviewSchema = {
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

const megaLoopPreviewSchema = {
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

const candidatesNormalizeSchema = {
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

const probePlanPreviewSchema = {
  type: "object",
  required: ["candidateUrl"],
  properties: {
    candidateUrl: { type: "string" },
    candidateKindGuess: { type: "string" },
    policy: { type: "object", additionalProperties: true },
  },
  additionalProperties: false,
} satisfies JsonSchema;

const probeExecuteSchema = {
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

const understandPreviewSchema = {
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

const scopeResolveSchema = {
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

const routePreviewSchema = {
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

const routingApplySchema = {
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

const handoffSchema = {
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

const sourceInventoryExplainSchema = {
  type: "object",
  required: ["sourceInventoryId"],
  properties: {
    sourceInventoryId: { type: "string" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

const sourceInventoryResolveScopesSchema = {
  type: "object",
  properties: {
    sourceInventoryIds: { type: "array", items: { type: "string" } },
    limit: { type: "integer" },
    apply: { type: "boolean" },
    createdBy: { type: "string" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

const policyActivateSchema = {
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

const replaySchema = {
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

const llmGatewaySchema = {
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

const rollbackPrepareSchema = {
  type: "object",
  required: ["sourceInventoryId", "reason"],
  properties: {
    sourceInventoryId: { type: "string" },
    reason: { type: "string" },
    createdBy: { type: "string" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

const rollbackApplySchema = {
  type: "object",
  required: ["rollbackGroupId", "confirm"],
  properties: {
    rollbackGroupId: { type: "string" },
    appliedBy: { type: "string" },
    confirm: { type: "boolean" },
  },
  additionalProperties: false,
} satisfies JsonSchema;

const feedbackSchema = {
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

function withFunnelContextSchema(schema: JsonSchema): JsonSchema {
  const properties =
    schema && typeof schema === "object" && "properties" in schema && schema.properties
      ? (schema.properties as Record<string, JsonSchema>)
      : {};
  return {
    ...schema,
    properties: {
      ...properties,
      ...funnelContextSchemaProperties,
    },
    additionalProperties: false,
  } satisfies JsonSchema;
}

function withoutFunnelContextArgs(args: Record<string, unknown>): Record<string, unknown> {
  const payload = { ...args };
  for (const fieldName of funnelContextFieldNames) {
    delete payload[fieldName];
  }
  return payload;
}

function asResponseRecord(value: unknown): Record<string, unknown> {
  if (value != null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { result: value };
}

function discoveryRiskKind(
  args: Record<string, unknown>,
  fallback: McpFunnelWriteContext["riskKind"]
): McpFunnelWriteContext["riskKind"] {
  const verificationTarget = readOptionalString(args.verificationTarget);
  if (
    verificationTarget === "selection" ||
    verificationTarget === "source_health" ||
    verificationTarget === "llm_review" ||
    verificationTarget === "replay"
  ) {
    return verificationTarget;
  }
  const runKind = readOptionalString(args.runKind);
  if (runKind === "replay" || Object.prototype.hasOwnProperty.call(args, "replayKind")) {
    return "replay";
  }
  return fallback;
}

function readDiscoveryResultIds(response: Record<string, unknown>): Record<string, unknown> {
  const candidateIds = Array.isArray(response.candidateIds)
    ? response.candidateIds
    : Array.isArray(response.candidate_ids)
      ? response.candidate_ids
      : undefined;
  return {
    runId: response.runId ?? response.run_id ?? response.vnextRunId ?? response.vnext_run_id ?? null,
    artifactId: response.artifactId ?? response.artifact_id ?? null,
    candidateId: response.candidateId ?? response.candidate_id ?? candidateIds?.[0] ?? null,
    sourceInventoryId: response.sourceInventoryId ?? response.source_inventory_id ?? null,
    policyId: response.policyId ?? response.policy_id ?? null,
    replayRunId: response.replayRunId ?? response.replay_run_id ?? null,
    rollbackGroupId: response.rollbackGroupId ?? response.rollback_group_id ?? null,
    feedbackId: response.feedbackId ?? response.feedback_id ?? null,
  };
}

function readDiscoveryAuditEntityId(response: Record<string, unknown>): string | null {
  const ids = readDiscoveryResultIds(response);
  for (const value of Object.values(ids)) {
    const normalized = String(value ?? "").trim();
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

async function runFunnelAwareDiscoveryWrite(
  context: McpToolContext,
  args: Record<string, unknown>,
  input: {
    toolName: string;
    fallbackRiskKind: McpFunnelWriteContext["riskKind"];
    handler: (backendArgs: Record<string, unknown>) => Promise<unknown>;
  }
): Promise<Record<string, unknown>> {
  const funnelContext = await readMcpFunnelWriteContext(context.pool, context.token, args, {
    toolName: input.toolName,
    riskKind: discoveryRiskKind(args, input.fallbackRiskKind),
    selectionImpacting: true,
  });
  if (getMcpTokenAllowedFunnelIds(context.token).length > 0 && !funnelContext.funnelId) {
    throw new JsonRpcError(
      -32004,
      "Funnel-bound MCP tokens must pass funnelId for discovery writes.",
      {
        statusCode: 403,
        data: {
          path: "funnelId",
          requiredAction:
            "Pass one of the token's allowed funnel ids, or use an unrestricted operator token for shared/global discovery writes.",
        },
      }
    );
  }

  const response = asResponseRecord(await input.handler(withoutFunnelContextArgs(args)));
  if (shouldAuditMcpFunnelWriteContext(funnelContext)) {
    await writeMcpMutationAudit(context.pool, context.token, {
      actionType: "mcp_funnel_write_context_recorded",
      entityType: "discovery_vnext",
      entityId: readDiscoveryAuditEntityId(response),
      payloadJson: {
        ...mcpFunnelWriteContextPayload(funnelContext),
        discoveryTool: input.toolName,
        discoveryResultIds: readDiscoveryResultIds(response),
      },
    });
  }
  return withMcpFunnelWriteContext(response, funnelContext);
}

function funnelAwareDiscoveryDescription(description: string): string {
  return `${description} Optional Funnel Autopilot context fields are supported for scoped setup/manual tuning: funnelId, laneId, changeMode, configurationScope, funnelPlanId, planFingerprint and verificationTarget.`;
}

function createDiscoveryWriteTool(
  name: string,
  description: string,
  inputSchema: JsonSchema,
  fallbackRiskKind: McpFunnelWriteContext["riskKind"],
  handler: (context: McpToolContext, args: Record<string, unknown>) => Promise<unknown>,
  destructive = false
): McpToolDefinition {
  return createWriteTool(
    name,
    funnelAwareDiscoveryDescription(description),
    "write.discovery",
    withFunnelContextSchema(inputSchema),
    async (context, args) =>
      runFunnelAwareDiscoveryWrite(context, args, {
        toolName: name,
        fallbackRiskKind,
        handler: (backendArgs) => handler(context, backendArgs),
      }),
    destructive
  );
}

const DISCOVERY_RESOURCES = [
  ["runs", "runs"],
  ["artifacts", "artifacts"],
  ["candidates", "candidates"],
  ["source_inventory", "source-inventory"],
  ["policies", "policies"],
  ["adapter_backlog", "adapter-backlog"],
  ["feedback", "feedback"],
  ["replay_runs", "replay-runs"],
  ["rollback_groups", "rollback-groups"],
  ["rollback_actions", "rollback-actions"],
  ["eval_runs", "eval-runs"],
  ["run_steps", "run-steps"],
  ["query_attempts", "query-attempts"],
  ["llm_gateway_events", "llm-gateway-events"],
  ["monitoring_state", "monitoring-state"],
  ["source_observations", "source-observations"],
] as const;

function listArgs(args: Record<string, unknown>) {
  return {
    ...readPageArgs(args),
    status: readOptionalString(args.status) ?? undefined,
    artifactType: readOptionalString(args.artifactType) ?? undefined,
    interestId: readOptionalString(args.interestId) ?? undefined,
    currentState: readOptionalString(args.currentState) ?? undefined,
    sourceVoice: readOptionalString(args.sourceVoice) ?? undefined,
    artifactFreshnessKind: readOptionalString(args.artifactFreshnessKind) ?? undefined,
    signalProductionMode: readOptionalString(args.signalProductionMode) ?? undefined,
  };
}

function actor(args: Record<string, unknown>, actorUserId: string, field = "createdBy") {
  return withActorDefault({ ...args }, field, actorUserId);
}

export const DISCOVERY_VNEXT_READ_MCP_TOOLS: readonly McpToolDefinition[] = DISCOVERY_RESOURCES.flatMap(
  ([toolPart, resource]) => [
    createReadTool(
      `discovery.${toolPart}.list`,
      `List Discovery vNext ${resource} records.`,
      listSchema,
      async ({ sdk }, args) => sdk.listDiscoveryVNextRecords<Record<string, unknown>>(resource, listArgs(args))
    ),
    createReadTool(
      `discovery.${toolPart}.read`,
      `Read one Discovery vNext ${resource} record.`,
      readSchema,
      async ({ sdk }, args) =>
        sdk.getDiscoveryVNextRecord<Record<string, unknown>>(
          resource,
          readRequiredString(args.recordId, "recordId")
        )
    ),
  ]
) as readonly McpToolDefinition[];

export const DISCOVERY_VNEXT_WRITE_MCP_TOOLS: readonly McpToolDefinition[] = [
  createDiscoveryWriteTool(
    "discovery.runs.create",
    "Create a Discovery vNext run record. Execution remains bounded by vNext policies.",
    runCreateSchema,
    "source_health",
    async ({ sdk, token }, args) =>
      sdk.createDiscoveryVNextRun<Record<string, unknown>>(actor(args, token.issuedByUserId))
  ),
  createDiscoveryWriteTool(
    "discovery.runs.execute",
    "Start a policy-governed Discovery vNext run. Live execution fails closed without enabled runtime, credentials and positive budget.",
    runStartSchema,
    "source_health",
    async ({ sdk, token }, args) =>
      sdk.startDiscoveryVNextRun<Record<string, unknown>>(actor(args, token.issuedByUserId))
  ),
  createDiscoveryWriteTool(
    "discovery.runs.cancel",
    "Cancel a queued or running Discovery vNext run.",
    { type: "object", required: ["runId"], properties: { runId: { type: "string" } }, additionalProperties: false },
    "source_health",
    async ({ sdk }, args) =>
      sdk.cancelDiscoveryVNextRun<Record<string, unknown>>(readRequiredString(args.runId, "runId"))
  ),
  createDiscoveryWriteTool(
    "discovery.brief.preview",
    "Compile a domain-neutral DiscoveryBrief preview.",
    briefPreviewSchema,
    "selection",
    async ({ sdk }, args) => sdk.previewDiscoveryBrief<Record<string, unknown>>(args)
  ),
  createDiscoveryWriteTool(
    "discovery.artifacts.validate",
    "Validate a Discovery vNext artifact payload.",
    artifactCreateSchema,
    "source_health",
    async ({ sdk }, args) => sdk.validateDiscoveryArtifact<Record<string, unknown>>(args)
  ),
  createDiscoveryWriteTool(
    "discovery.artifacts.create",
    "Create a typed Discovery vNext artifact.",
    artifactCreateSchema,
    "source_health",
    async ({ sdk, token }, args) =>
      sdk.createDiscoveryArtifact<Record<string, unknown>>(actor(args, token.issuedByUserId))
  ),
  createDiscoveryWriteTool(
    "discovery.mega_loop.preview",
    "Run a bounded non-live HypothesisMegaLoop preview.",
    megaLoopPreviewSchema,
    "selection",
    async ({ sdk }, args) => sdk.previewDiscoveryMegaLoop<Record<string, unknown>>(args)
  ),
  createDiscoveryWriteTool(
    "discovery.candidates.normalize",
    "Normalize candidate acquisition results without persistence.",
    candidatesNormalizeSchema,
    "source_health",
    async ({ sdk }, args) => sdk.normalizeDiscoveryCandidates<Record<string, unknown>>(args)
  ),
  createDiscoveryWriteTool(
    "discovery.candidates.create",
    "Persist Discovery vNext candidates plus QueryQualityReport artifact.",
    candidatesNormalizeSchema,
    "source_health",
    async ({ sdk, token }, args) =>
      sdk.createDiscoveryCandidates<Record<string, unknown>>(actor(args, token.issuedByUserId))
  ),
  createDiscoveryWriteTool(
    "discovery.probe.plan_preview",
    "Create a ProbePlan preview. Browser probing is disabled unless policy explicitly budgets it.",
    probePlanPreviewSchema,
    "source_health",
    async ({ sdk }, args) => sdk.previewDiscoveryProbePlan<Record<string, unknown>>(args)
  ),
  createDiscoveryWriteTool(
    "discovery.probe.execute",
    "Execute a ProbePlan through fetchers-owned RSS/website probe semantics.",
    probeExecuteSchema,
    "source_health",
    async ({ sdk, token }, args) =>
      sdk.executeDiscoveryProbe<Record<string, unknown>>(actor(args, token.issuedByUserId))
  ),
  createDiscoveryWriteTool(
    "discovery.scope.resolve_preview",
    "Resolve the monitorable source scope from a candidate and ProbeReport without persistence.",
    scopeResolveSchema,
    "source_health",
    async ({ sdk }, args) => sdk.previewDiscoveryScopeResolution<Record<string, unknown>>(args)
  ),
  createDiscoveryWriteTool(
    "discovery.scope.resolve_apply",
    "Persist a SourceScopeResolution artifact for a probed candidate.",
    scopeResolveSchema,
    "source_health",
    async ({ sdk, token }, args) =>
      sdk.applyDiscoveryScopeResolution<Record<string, unknown>>(actor(args, token.issuedByUserId))
  ),
  createDiscoveryWriteTool(
    "discovery.understand.preview",
    "Synthesize SourceUnderstanding from DiscoveryBrief, ProbeReport and SourceScopeResolution.",
    understandPreviewSchema,
    "source_health",
    async ({ sdk }, args) => sdk.previewDiscoveryUnderstanding<Record<string, unknown>>(args)
  ),
  createDiscoveryWriteTool(
    "discovery.route.preview",
    "Preview a deterministic no-yield-penalty RoutingDecision.",
    routePreviewSchema,
    "source_health",
    async ({ sdk }, args) => sdk.previewDiscoveryRoute<Record<string, unknown>>(args)
  ),
  createDiscoveryWriteTool(
    "discovery.routing.apply",
    "Persist SourceUnderstanding, RoutingDecision, source inventory and adapter backlog effects.",
    routingApplySchema,
    "source_health",
    async ({ sdk, token }, args) =>
      sdk.applyDiscoveryRoutingDecision<Record<string, unknown>>(actor(args, token.issuedByUserId))
  ),
  createDiscoveryWriteTool(
    "discovery.probation.handoff",
    "Register a probation source only through the existing source registrar/outbox path.",
    handoffSchema,
    "source_health",
    async ({ sdk, token }, args) =>
      sdk.handoffDiscoveryProbation<Record<string, unknown>>(actor(args, token.issuedByUserId))
  ),
  createDiscoveryWriteTool(
    "discovery.source_inventory.explain",
    "Explain a Discovery source inventory row with scope, understanding, routing and observation lineage.",
    sourceInventoryExplainSchema,
    "source_health",
    async ({ sdk }, args) => sdk.explainDiscoverySourceInventory<Record<string, unknown>>(args)
  ),
  createDiscoveryWriteTool(
    "discovery.source_inventory.resolve_scopes",
    "Preview or apply bounded SourceScopeResolution metadata for source inventory rows; apply may reversible-pause invalid vNext channel projections.",
    sourceInventoryResolveScopesSchema,
    "source_health",
    async ({ sdk, token }, args) =>
      sdk.resolveDiscoverySourceInventoryScopes<Record<string, unknown>>(actor(args, token.issuedByUserId))
  ),
  createDiscoveryWriteTool(
    "discovery.policies.validate",
    "Validate a Discovery vNext policy definition.",
    policyActivateSchema,
    "source_health",
    async ({ sdk }, args) => sdk.validateDiscoveryPolicy<Record<string, unknown>>(args)
  ),
  createDiscoveryWriteTool(
    "discovery.policies.activate",
    "Activate a versioned Discovery vNext policy and archive the old active version.",
    policyActivateSchema,
    "source_health",
    async ({ sdk, token }, args) =>
      sdk.activateDiscoveryPolicy<Record<string, unknown>>(actor(args, token.issuedByUserId))
  ),
  createDiscoveryWriteTool(
    "discovery.llm_gateway.run",
    "Run and audit a Discovery vNext LLM gateway task.",
    llmGatewaySchema,
    "llm_review",
    async ({ sdk, token }, args) =>
      sdk.runDiscoveryLlmGateway<Record<string, unknown>>(actor(args, token.issuedByUserId))
  ),
  createDiscoveryWriteTool(
    "discovery.replay.start",
    "Start a non-live Discovery vNext replay. Live provider execution is not available here.",
    replaySchema,
    "replay",
    async ({ sdk, token }, args) =>
      sdk.startDiscoveryReplay<Record<string, unknown>>(actor(args, token.issuedByUserId))
  ),
  createDiscoveryWriteTool(
    "discovery.rollback.prepare",
    "Prepare a rollback group for vNext-owned source inventory/probation effects.",
    rollbackPrepareSchema,
    "source_health",
    async ({ sdk, token }, args) =>
      sdk.prepareDiscoveryRollback<Record<string, unknown>>(actor(args, token.issuedByUserId))
  ),
  createDiscoveryWriteTool(
    "discovery.rollback.apply",
    "Apply a prepared Discovery vNext rollback. Requires write.destructive and confirm=true.",
    rollbackApplySchema,
    "source_health",
    async ({ sdk, token }, args) =>
      sdk.applyDiscoveryRollback<Record<string, unknown>>(actor(args, token.issuedByUserId, "appliedBy")),
    true
  ),
  createDiscoveryWriteTool(
    "discovery.feedback.submit",
    "Submit operator feedback against a Discovery vNext artifact, candidate, inventory row, decision or policy.",
    feedbackSchema,
    "source_health",
    async ({ sdk, token }, args) =>
      sdk.submitDiscoveryFeedback<Record<string, unknown>>(actor(args, token.issuedByUserId))
  ),
];

function aliasTool(tool: McpToolDefinition, name: string, descriptionPrefix = "Alias for") {
  return {
    ...tool,
    name,
    description: `${descriptionPrefix} ${tool.name}. ${tool.description}`,
  } satisfies McpToolDefinition;
}

const DISCOVERY_VNEXT_PREFIX_ALIASES = [
  ...DISCOVERY_VNEXT_READ_MCP_TOOLS,
  ...DISCOVERY_VNEXT_WRITE_MCP_TOOLS,
].map((tool) => aliasTool(tool, tool.name.replace(/^discovery\./u, "discovery_vnext.")));

function toolByName(name: string): McpToolDefinition {
  const tool = [...DISCOVERY_VNEXT_READ_MCP_TOOLS, ...DISCOVERY_VNEXT_WRITE_MCP_TOOLS].find((entry) => entry.name === name);
  if (!tool) {
    throw new Error(`Missing Discovery vNext MCP tool ${name}`);
  }
  return tool;
}

export const DISCOVERY_VNEXT_CANONICAL_ALIAS_MCP_TOOLS: readonly McpToolDefinition[] = [
  aliasTool(toolByName("discovery.brief.preview"), "discovery_vnext.preview_brief", "Canonical vNext alias for"),
  aliasTool(toolByName("discovery.runs.execute"), "discovery_vnext.start_run", "Canonical vNext alias for"),
  aliasTool(toolByName("discovery.artifacts.list"), "discovery_vnext.list_artifacts", "Canonical vNext alias for"),
  aliasTool(toolByName("discovery.artifacts.read"), "discovery_vnext.get_artifact", "Canonical vNext alias for"),
  aliasTool(toolByName("discovery.mega_loop.preview"), "discovery_vnext.preview_mega_loop", "Canonical vNext alias for"),
  aliasTool(toolByName("discovery.candidates.normalize"), "discovery_vnext.normalize_candidates", "Canonical vNext alias for"),
  aliasTool(toolByName("discovery.probe.plan_preview"), "discovery_vnext.create_probe_plan", "Canonical vNext alias for"),
  aliasTool(toolByName("discovery.probe.execute"), "discovery_vnext.execute_probe", "Canonical vNext alias for"),
  aliasTool(toolByName("discovery.scope.resolve_preview"), "discovery_vnext.preview_scope_resolution", "Canonical vNext alias for"),
  aliasTool(toolByName("discovery.scope.resolve_apply"), "discovery_vnext.apply_scope_resolution", "Canonical vNext alias for"),
  aliasTool(toolByName("discovery.understand.preview"), "discovery_vnext.preview_source_understanding", "Canonical vNext alias for"),
  aliasTool(toolByName("discovery.routing.apply"), "discovery_vnext.apply_routing", "Canonical vNext alias for"),
  aliasTool(toolByName("discovery.probation.handoff"), "discovery_vnext.apply_probation_handoff", "Canonical vNext alias for"),
  aliasTool(toolByName("discovery.source_inventory.explain"), "discovery_vnext.explain_source_inventory", "Canonical vNext alias for"),
  aliasTool(toolByName("discovery.source_inventory.resolve_scopes"), "discovery_vnext.resolve_source_inventory_scopes", "Canonical vNext alias for"),
  aliasTool(toolByName("discovery.source_inventory.resolve_scopes"), "maintenance.discovery.source_scope_reresolve", "Canonical maintenance alias for"),
  aliasTool(toolByName("discovery.feedback.submit"), "discovery_vnext.submit_feedback", "Canonical vNext alias for"),
  aliasTool(toolByName("discovery.rollback.prepare"), "discovery_vnext.prepare_rollback", "Canonical vNext alias for"),
  aliasTool(toolByName("discovery.rollback.apply"), "discovery_vnext.apply_rollback", "Canonical vNext alias for"),
];

export const DISCOVERY_VNEXT_ALIAS_MCP_TOOLS: readonly McpToolDefinition[] = [
  ...DISCOVERY_VNEXT_PREFIX_ALIASES,
  ...DISCOVERY_VNEXT_CANONICAL_ALIAS_MCP_TOOLS,
] as const;
