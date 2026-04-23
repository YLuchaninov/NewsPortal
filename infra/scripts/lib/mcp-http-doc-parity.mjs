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
    { name: "discovery.summary.get" },
    { name: "discovery.profiles.list" },
    { name: "discovery.profiles.read" },
    { name: "discovery.profiles.create" },
    { name: "discovery.profiles.update" },
    { name: "discovery.profiles.archive" },
    { name: "discovery.classes.list" },
    { name: "discovery.classes.read" },
    { name: "discovery.classes.create" },
    { name: "discovery.classes.update" },
    { name: "discovery.classes.archive" },
    { name: "discovery.missions.list" },
    { name: "discovery.missions.read" },
    { name: "discovery.missions.portfolio.read" },
    { name: "discovery.missions.create" },
    { name: "discovery.missions.update" },
    { name: "discovery.missions.compile_graph" },
    { name: "discovery.missions.run" },
    { name: "discovery.missions.archive" },
    { name: "discovery.recall_missions.list" },
    { name: "discovery.recall_missions.read" },
    { name: "discovery.recall_missions.create" },
    { name: "discovery.recall_missions.update" },
    { name: "discovery.recall_missions.acquire" },
    { name: "discovery.recall_missions.pause" },
    { name: "discovery.recall_candidates.list" },
    { name: "discovery.recall_candidates.read" },
    { name: "discovery.recall_candidates.create" },
    { name: "discovery.recall_candidates.update" },
    { name: "discovery.recall_candidates.promote" },
    { name: "discovery.candidates.list" },
    { name: "discovery.candidates.read" },
    { name: "discovery.candidates.review" },
    { name: "discovery.hypotheses.list" },
    { name: "discovery.source_profiles.list" },
    { name: "discovery.source_profiles.read" },
    { name: "discovery.source_interest_scores.list" },
    { name: "discovery.source_interest_scores.read" },
    { name: "discovery.feedback.list" },
    { name: "discovery.feedback.create" },
    { name: "discovery.re_evaluate" },
    { name: "discovery.costs.summary" },
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
    { uri: "newsportal://admin/summary" },
    { uri: "newsportal://llm/budget-summary" },
    { uri: "newsportal://discovery/summary" },
    { uri: "newsportal://system-interests" },
    { uri: "newsportal://templates/llm" },
    { uri: "newsportal://channels" },
    { uri: "newsportal://sequences" },
    { uri: "newsportal://web-resources" },
    { uri: "newsportal://fetch-runs" },
    {
      uri: "newsportal://discovery/profiles",
      note: "Older planning-doc example; current HTTP registry exposes discovery summaries, not per-collection resource URIs.",
    },
    {
      uri: "newsportal://discovery/recall-missions",
      note: "Older planning-doc example; current HTTP registry keeps this surface in tools, not resources.",
    },
  ],
  prompts: [
    { name: "system_interest.create" },
    { name: "discovery.mission.review" },
    { name: "sequence.draft" },
    { name: "cleanup.guidance" },
    {
      name: "system_interest.polish",
      note: "Mentioned in the older planning doc but not shipped in the HTTP prompt registry.",
    },
    {
      name: "discovery.mission.launch",
      note: "Mentioned in the older planning doc but not shipped in the HTTP prompt registry.",
    },
  ],
  examples: [
    {
      kind: "transport",
      name: "stdio-first local MCP workflow",
      classification: NOT_HTTP_APPLICABLE,
      note: "The shipped NewsPortal MCP contract is remote HTTP-only behind nginx /mcp.",
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

function buildShippedEntries(kind, shippedValues, coveredValues, idField) {
  const coveredSet = toKeySet(coveredValues);
  return Array.from(shippedValues ?? [])
    .map((value) => String(value?.[idField] ?? "").trim())
    .filter(Boolean)
    .map((name) => ({
      kind,
      [idField]: name,
      classification: classifyShippedEntry(name, coveredSet),
      source: "shipped-http-contract",
    }));
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
  planDocPath = "/Users/user/Downloads/newsportal_mcp_plan.md",
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

export function assertFullShippedCoverage(matrix) {
  const missing = getUntestedShippedEntries(matrix);
  if (missing.length === 0) {
    return;
  }
  const details = missing
    .map((entry) => `${entry.kind}:${entry.name ?? entry.uri ?? "unknown"}`)
    .join(", ");
  throw new Error(`MCP doc-parity matrix found shipped HTTP surfaces without coverage: ${details}`);
}
