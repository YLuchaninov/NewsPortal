import {
  createReadTool,
  readOptionalString,
  readPageArgs,
  readRequiredString,
  withActorDefault,
  type McpToolDefinition,
} from "../shared";
import { createDiscoveryWriteTool } from "./vnext-funnel";
import {
  artifactCreateSchema,
  briefPreviewSchema,
  candidatesNormalizeSchema,
  feedbackSchema,
  handoffSchema,
  listSchema,
  llmGatewaySchema,
  megaLoopPreviewSchema,
  policyActivateSchema,
  probeExecuteSchema,
  probePlanPreviewSchema,
  readSchema,
  replaySchema,
  rollbackApplySchema,
  rollbackPrepareSchema,
  routePreviewSchema,
  routingApplySchema,
  runCreateSchema,
  runStartSchema,
  scopeResolveSchema,
  sourceInventoryExplainSchema,
  sourceInventoryResolveScopesSchema,
  understandPreviewSchema,
} from "./vnext-schemas";

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
