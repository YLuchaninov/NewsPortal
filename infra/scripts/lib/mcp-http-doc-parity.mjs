const COVERED_SHIPPED = "covered-shipped";
const SHIPPED_NOT_YET_TESTED = "shipped-not-yet-tested";
const DOCUMENTED_BUT_DEFERRED = "documented-but-deferred";
const NOT_HTTP_APPLICABLE = "not-http-applicable";

export const DOC_PARITY_CLASSIFICATIONS = [
  COVERED_SHIPPED,
  SHIPPED_NOT_YET_TESTED,
  DOCUMENTED_BUT_DEFERRED,
  NOT_HTTP_APPLICABLE,
];

export const EXPECTED_SHIPPED_NOT_YET_EXERCISED = {
  tools: [
    "articles.holds.explain",
    "articles.holds.list",
    "articles.holds.summary",
    "channels.alternatives.plan",
    "channels.alternatives.start",
    "channels.bottlenecks.explain",
    "channels.bottlenecks.list",
    "channels.bottlenecks.summary",
    "channels.set_active",
    "discovery.adapter_backlog.list",
    "discovery.adapter_backlog.read",
    "discovery.artifacts.create",
    "discovery.artifacts.list",
    "discovery.artifacts.read",
    "discovery.artifacts.validate",
    "discovery.brief.preview",
    "discovery.candidates.create",
    "discovery.candidates.list",
    "discovery.candidates.normalize",
    "discovery.candidates.read",
    "discovery.eval_runs.list",
    "discovery.eval_runs.read",
    "discovery.feedback.list",
    "discovery.feedback.read",
    "discovery.feedback.submit",
    "discovery.mega_loop.preview",
    "discovery.policies.activate",
    "discovery.policies.list",
    "discovery.policies.read",
    "discovery.policies.validate",
    "discovery.probation.handoff",
    "discovery.probe.execute",
    "discovery.probe.plan_preview",
    "discovery.replay.start",
    "discovery.replay_runs.list",
    "discovery.replay_runs.read",
    "discovery.rollback.apply",
    "discovery.rollback.prepare",
    "discovery.rollback_actions.list",
    "discovery.rollback_actions.read",
    "discovery.rollback_groups.list",
    "discovery.rollback_groups.read",
    "discovery.route.preview",
    "discovery.routing.apply",
    "discovery.runs.cancel",
    "discovery.runs.create",
    "discovery.runs.list",
    "discovery.runs.read",
    "discovery.source_families.coverage",
    "discovery.source_inventory.list",
    "discovery.source_inventory.read",
    "discovery.understand.preview",
    "operator.funnel.audit",
    "operator.funnel.autoplan",
    "operator.funnel.iteration.recommend",
    "operator.selection.precision_audit",
    "system_interests.compile_status.list",
    "templates.duplicates.audit",
  ],
  resources: [],
  prompts: [],
};

export const LEGACY_MCP_PLAN_SNAPSHOT = {
  tools: [
    { name: "admin.summary.get" },
    { name: "system_interests.list" },
    { name: "system_interests.read" },
    { name: "system_interests.create" },
    { name: "system_interests.update" },
    { name: "system_interests.archive" },
    { name: "system_interests.delete" },
    { name: "llm_templates.list" },
    { name: "llm_templates.read" },
    { name: "llm_templates.create" },
    { name: "llm_templates.update" },
    { name: "llm_templates.archive" },
    { name: "llm_templates.delete" },
    { name: "channels.list" },
    { name: "channels.read" },
    { name: "channels.create" },
    { name: "channels.update" },
    { name: "channels.delete" },
    { name: "discovery.artifacts.list" },
    { name: "discovery.artifacts.read" },
    { name: "discovery.artifacts.create" },
    { name: "discovery.artifacts.validate" },
    { name: "discovery.brief.preview" },
    { name: "discovery.candidates.list" },
    { name: "discovery.candidates.read" },
    { name: "discovery.candidates.normalize" },
    { name: "discovery.candidates.create" },
    { name: "discovery.runs.list" },
    { name: "discovery.runs.read" },
    { name: "discovery.runs.create" },
    { name: "discovery.runs.cancel" },
    { name: "discovery.mega_loop.preview" },
    { name: "discovery.probe.plan_preview" },
    { name: "discovery.probe.execute" },
    { name: "discovery.understand.preview" },
    { name: "discovery.route.preview" },
    { name: "discovery.routing.apply" },
    { name: "discovery.probation.handoff" },
    { name: "discovery.source_inventory.list" },
    { name: "discovery.source_inventory.read" },
    { name: "discovery.policies.list" },
    { name: "discovery.policies.read" },
    { name: "discovery.policies.validate" },
    { name: "discovery.policies.activate" },
    { name: "discovery.adapter_backlog.list" },
    { name: "discovery.adapter_backlog.read" },
    { name: "discovery.feedback.list" },
    { name: "discovery.feedback.read" },
    { name: "discovery.feedback.submit" },
    { name: "discovery.replay_runs.list" },
    { name: "discovery.replay_runs.read" },
    { name: "discovery.replay.start" },
    { name: "discovery.rollback_groups.list" },
    { name: "discovery.rollback_groups.read" },
    { name: "discovery.rollback_actions.list" },
    { name: "discovery.rollback_actions.read" },
    { name: "discovery.rollback.prepare" },
    { name: "discovery.rollback.apply" },
    { name: "discovery.eval_runs.list" },
    { name: "discovery.eval_runs.read" },
    { name: "sequences.list" },
    { name: "sequences.read" },
    { name: "sequences.plugins.list" },
    { name: "sequences.runs.read" },
    { name: "sequences.run_task_runs.list" },
    { name: "sequences.create" },
    { name: "sequences.update" },
    { name: "sequences.run" },
    { name: "sequences.retry_run" },
    { name: "sequences.cancel_run" },
    { name: "sequences.archive" },
    { name: "web_resources.list" },
    { name: "web_resources.read" },
    { name: "fetch_runs.list" },
    { name: "llm_budget.summary" },
  ],
  resources: [
    { uri: "signalops://admin/summary" },
    { uri: "signalops://llm/budget-summary" },
    { uri: "signalops://discovery/summary" },
    { uri: "signalops://system-interests" },
    { uri: "signalops://templates/llm" },
    { uri: "signalops://channels" },
    { uri: "signalops://sequences" },
    { uri: "signalops://web-resources" },
    { uri: "signalops://fetch-runs" },
    {
      uri: "signalops://discovery/source-inventory",
      note: "Discovery vNext inventory is exposed through discovery.source_inventory.* tools.",
    },
    {
      uri: "signalops://discovery/artifacts",
      note: "Typed Discovery vNext artifacts are exposed through discovery.artifacts.* tools.",
    },
  ],
  prompts: [
    { name: "system_interest.create" },
    { name: "discovery.session.plan" },
    { name: "sequence.draft" },
    { name: "cleanup.guidance" },
    {
      name: "system_interest.polish",
      note: "Mentioned in the older planning doc but not shipped in the HTTP prompt registry.",
    },
    {
      name: "discovery.routing.review",
      note: "Deferred documentation example for reviewing vNext SourceUnderstanding and RoutingDecision artifacts.",
    },
  ],
  examples: [
    {
      kind: "transport",
      name: "stdio-first local MCP workflow",
      classification: NOT_HTTP_APPLICABLE,
      note: "The shipped SignalOps MCP contract is remote HTTP-only behind nginx /mcp.",
    },
    {
      kind: "tool",
      name: "change_set.apply / rollback",
      classification: DOCUMENTED_BUT_DEFERRED,
      note: "Explicitly deferred in the remote control-plane rollout and still not shipped.",
    },
    {
      kind: "tool",
      name: "review / polish self-refinement tools",
      classification: DOCUMENTED_BUT_DEFERRED,
      note: "Older planning examples referenced review/polish flows that are not in the current HTTP tool registry.",
    },
  ],
};

function toKeySet(values) {
  return new Set(
    Array.from(values ?? [])
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
  );
}

function classifyShippedEntry(name, coveredSet) {
  return coveredSet.has(name) ? COVERED_SHIPPED : SHIPPED_NOT_YET_TESTED;
}

const DISCOVERY_VNEXT_CANONICAL_ALIAS_NAMES = {
  "discovery_vnext.preview_brief": "discovery.brief.preview",
  "discovery_vnext.start_run": "discovery.runs.execute",
  "discovery_vnext.list_artifacts": "discovery.artifacts.list",
  "discovery_vnext.get_artifact": "discovery.artifacts.read",
  "discovery_vnext.preview_mega_loop": "discovery.mega_loop.preview",
  "discovery_vnext.normalize_candidates": "discovery.candidates.normalize",
  "discovery_vnext.create_probe_plan": "discovery.probe.plan_preview",
  "discovery_vnext.execute_probe": "discovery.probe.execute",
  "discovery_vnext.preview_scope_resolution": "discovery.scope.resolve_preview",
  "discovery_vnext.apply_scope_resolution": "discovery.scope.resolve_apply",
  "discovery_vnext.preview_source_understanding": "discovery.understand.preview",
  "discovery_vnext.apply_routing": "discovery.routing.apply",
  "discovery_vnext.apply_probation_handoff": "discovery.probation.handoff",
  "discovery_vnext.explain_source_inventory": "discovery.source_inventory.explain",
  "discovery_vnext.resolve_source_inventory_scopes": "discovery.source_inventory.resolve_scopes",
  "maintenance.discovery.source_scope_reresolve": "discovery.source_inventory.resolve_scopes",
  "discovery_vnext.submit_feedback": "discovery.feedback.submit",
  "discovery_vnext.prepare_rollback": "discovery.rollback.prepare",
  "discovery_vnext.apply_rollback": "discovery.rollback.apply",
};

function canonicalToolName(name) {
  if (DISCOVERY_VNEXT_CANONICAL_ALIAS_NAMES[name]) {
    return DISCOVERY_VNEXT_CANONICAL_ALIAS_NAMES[name];
  }
  if (name.startsWith("discovery_vnext.")) {
    return name.replace(/^discovery_vnext\./u, "discovery.");
  }
  return name;
}

function buildShippedEntries(kind, shippedValues, coveredValues, idField) {
  const coveredSet = toKeySet(coveredValues);
  return Array.from(shippedValues ?? [])
    .map((value) => String(value?.[idField] ?? "").trim())
    .filter(Boolean)
    .map((name) => {
      const coverageName = kind === "tool" ? canonicalToolName(name) : name;
      return {
        kind,
        [idField]: name,
        classification: classifyShippedEntry(coverageName, coveredSet),
        source: "shipped-http-contract",
      };
    });
}

function buildLegacyEntries(kind, shippedValues, legacyValues, idField) {
  const shippedSet = toKeySet(
    Array.from(shippedValues ?? []).map((value) => value?.[idField])
  );
  return Array.from(legacyValues ?? []).map((entry) => {
    const name = String(entry?.[idField] ?? "").trim();
    const classification = shippedSet.has(name) ? COVERED_SHIPPED : DOCUMENTED_BUT_DEFERRED;
    return {
      kind,
      [idField]: name,
      classification,
      source: "legacy-planning-doc",
      note: entry?.note ? String(entry.note) : null,
    };
  });
}

function buildSummary(sections) {
  const summary = {};
  for (const [sectionName, entries] of Object.entries(sections)) {
    summary[sectionName] = entries.reduce((accumulator, entry) => {
      accumulator[entry.classification] = (accumulator[entry.classification] ?? 0) + 1;
      return accumulator;
    }, {});
  }
  return summary;
}

export function buildMcpDocParityMatrix({
  shippedTools = [],
  shippedResources = [],
  shippedPrompts = [],
  coveredTools = [],
  coveredResources = [],
  coveredPrompts = [],
  planDocPath = "/Users/user/Downloads/signalops_mcp_plan.md",
} = {}) {
  const shipped = {
    tools: buildShippedEntries("tool", shippedTools, coveredTools, "name"),
    resources: buildShippedEntries("resource", shippedResources, coveredResources, "uri"),
    prompts: buildShippedEntries("prompt", shippedPrompts, coveredPrompts, "name"),
  };
  const legacy = {
    tools: buildLegacyEntries("tool", shippedTools, LEGACY_MCP_PLAN_SNAPSHOT.tools, "name"),
    resources: buildLegacyEntries(
      "resource",
      shippedResources,
      LEGACY_MCP_PLAN_SNAPSHOT.resources,
      "uri"
    ),
    prompts: buildLegacyEntries("prompt", shippedPrompts, LEGACY_MCP_PLAN_SNAPSHOT.prompts, "name"),
    examples: LEGACY_MCP_PLAN_SNAPSHOT.examples.map((entry) => ({
      ...entry,
      source: "legacy-planning-doc",
    })),
  };

  return {
    sources: {
      shippedContract: "docs/contracts/mcp-control-plane.md",
      legacyPlanningDoc: planDocPath,
    },
    shipped,
    legacy,
    summary: buildSummary({
      shippedTools: shipped.tools,
      shippedResources: shipped.resources,
      shippedPrompts: shipped.prompts,
      legacyTools: legacy.tools,
      legacyResources: legacy.resources,
      legacyPrompts: legacy.prompts,
      legacyExamples: legacy.examples,
    }),
  };
}

export function getUntestedShippedEntries(matrix) {
  const shippedEntries = [
    ...(matrix?.shipped?.tools ?? []),
    ...(matrix?.shipped?.resources ?? []),
    ...(matrix?.shipped?.prompts ?? []),
  ];
  return shippedEntries.filter((entry) => entry.classification === SHIPPED_NOT_YET_TESTED);
}

function getExpectedUntestedKey(entry) {
  if (entry.kind === "resource") {
    return entry.uri;
  }
  return entry.name;
}

export function getUnexpectedUntestedShippedEntries(matrix) {
  const expected = {
    tool: toKeySet(EXPECTED_SHIPPED_NOT_YET_EXERCISED.tools),
    resource: toKeySet(EXPECTED_SHIPPED_NOT_YET_EXERCISED.resources),
    prompt: toKeySet(EXPECTED_SHIPPED_NOT_YET_EXERCISED.prompts),
  };
  return getUntestedShippedEntries(matrix).filter((entry) => {
    const key = getExpectedUntestedKey(entry);
    const expectedKey = entry.kind === "tool" ? canonicalToolName(key) : key;
    return !expected[entry.kind]?.has(expectedKey);
  });
}

export function assertFullShippedCoverage(matrix) {
  const missing = getUnexpectedUntestedShippedEntries(matrix);
  if (missing.length === 0) {
    return;
  }
  const details = missing
    .map((entry) => `${entry.kind}:${entry.name ?? entry.uri ?? "unknown"}`)
    .join(", ");
  throw new Error(`MCP doc-parity matrix found shipped HTTP surfaces without coverage: ${details}`);
}
