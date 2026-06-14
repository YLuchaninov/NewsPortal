import {
  DETERMINISTIC_SCENARIO_GROUPS,
  DETERMINISTIC_SCENARIO_ORDER,
} from "./mcp-http-scenario-catalog.mjs";

function withScenarioPrerequisites(scenarios) {
  const planned = Array.from(scenarios ?? []).filter(Boolean);
  const ordered = [];
  const push = (name) => {
    if (!ordered.includes(name)) {
      ordered.push(name);
    }
  };
  const needsAuth = planned.some((name) => name !== "auth-and-token-lifecycle");
  const needsProtocolDiscovery = planned.includes("doc-parity-matrix");
  if (needsAuth) {
    push("auth-and-token-lifecycle");
  }
  if (needsProtocolDiscovery) {
    push("protocol-discovery");
  }
  for (const name of planned) {
    push(name);
  }
  return ordered;
}

export function resolveDeterministicScenarioKeys({ scenarios = [], group } = {}) {
  const explicit = Array.from(scenarios ?? [])
    .map((name) => String(name ?? "").trim())
    .filter(Boolean);
  if (explicit.length > 0) {
    return withScenarioPrerequisites(explicit);
  }
  if (group) {
    const resolved = DETERMINISTIC_SCENARIO_GROUPS[String(group).trim()];
    if (!resolved) {
      throw new Error(`Unknown MCP HTTP scenario group "${group}".`);
    }
    return withScenarioPrerequisites(resolved);
  }
  return [...DETERMINISTIC_SCENARIO_ORDER];
}

export async function runDeterministicScenarioFromMap(harness, scenarioKey, scenariosByKey) {
  const scenario = scenariosByKey[scenarioKey];
  if (!scenario) {
    throw new Error(`Unknown deterministic MCP HTTP scenario "${scenarioKey}".`);
  }
  const startedAt = Date.now();
  const result = await scenario(harness);
  return {
    ...result,
    durationMs: Date.now() - startedAt,
  };
}

export function formatDeterministicReportMarkdown(report) {
  const lines = [
    "# MCP HTTP Deterministic Proof",
    "",
    `- Run ID: ${report.runId}`,
    `- Started at: ${report.startedAt}`,
    `- Scenarios: ${report.scenarios.map((scenario) => scenario.key).join(", ")}`,
    `- Coverage: ${report.coverage.tools.length} tools, ${report.coverage.resources.length} resources, ${report.coverage.prompts.length} prompts, ${report.coverage.rpcMethods.length} RPC methods`,
    "",
    "## Scenario Results",
  ];

  for (const scenario of report.scenarios) {
    lines.push(`- ${scenario.key}: ${scenario.summary} (${scenario.durationMs} ms)`);
  }

  if (report.docParityMatrix) {
    lines.push("");
    lines.push("## Doc Parity");
    const shippedTools = report.docParityMatrix.summary.shippedTools ?? {};
    const shippedResources = report.docParityMatrix.summary.shippedResources ?? {};
    const shippedPrompts = report.docParityMatrix.summary.shippedPrompts ?? {};
    lines.push(`- Shipped tools: ${JSON.stringify(shippedTools)}`);
    lines.push(`- Shipped resources: ${JSON.stringify(shippedResources)}`);
    lines.push(`- Shipped prompts: ${JSON.stringify(shippedPrompts)}`);
    lines.push(
      `- Deferred / non-HTTP examples: ${JSON.stringify(report.docParityMatrix.summary.legacyExamples ?? {})}`
    );
  }

  lines.push("");
  lines.push("## Artifacts");
  lines.push(`- JSON: ${report.artifacts?.jsonPath ?? "n/a"}`);
  lines.push(`- Markdown: ${report.artifacts?.mdPath ?? "n/a"}`);
  return lines.join("\n");
}
