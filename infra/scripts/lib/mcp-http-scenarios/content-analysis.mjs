import {
  readIdentifier,
  assert,
  pushEvidence,
  readRows,
  seedContentAnalysisCanaryRows,
} from "./shared.mjs";

export async function scenarioContentAnalysisOperatorFlows(harness) {
  const evidence = [];
  const token = harness.tokens.automation.token;
  const canary = await seedContentAnalysisCanaryRows(harness);
  const analysisId = canary.analysisIds.ner;

  const analysisList = await harness.mcpToolCall(token, "content_analysis.list", {
    page: 1,
    pageSize: 20,
    subjectType: "signal_candidate",
    subjectId: canary.subjectId,
  });
  assert(readRows(analysisList).length > 0, "content_analysis.list should expose seeded canary rows.");
  await harness.mcpToolCall(token, "content_analysis.read", { analysisId });

  const entityList = await harness.mcpToolCall(token, "content_entities.list", {
    page: 1,
    pageSize: 20,
    subjectType: "signal_candidate",
    subjectId: canary.subjectId,
  });
  assert(readRows(entityList).length > 0, "content_entities.list should expose seeded canary entities.");

  const labelList = await harness.mcpToolCall(token, "content_labels.list", {
    page: 1,
    pageSize: 20,
    subjectType: "signal_candidate",
    subjectId: canary.subjectId,
  });
  assert(readRows(labelList).length > 0, "content_labels.list should expose seeded canary labels.");

  const filterResults = await harness.mcpToolCall(token, "content_filter_results.list", {
    page: 1,
    pageSize: 20,
    subjectType: "signal_candidate",
    subjectId: canary.subjectId,
  });
  assert(readRows(filterResults).length > 0, "content_filter_results.list should expose seeded dry-run canary results.");

  await harness.mcpToolCall(token, "content_analysis_policies.list", {
    page: 1,
    pageSize: 20,
    module: "ner",
  });
  await harness.mcpToolCall(token, "content_analysis_policies.list", {
    page: 1,
    pageSize: 20,
    module: "structured_extraction",
  });
  const analysisPolicy = await harness.mcpToolCall(token, "content_analysis_policies.create", {
    payload: {
      policyKey: `mcp_canary_analysis_policy_${canary.policyKeySuffix}`,
      title: `MCP Canary Analysis Policy ${harness.runId}`,
      description: "Inactive deterministic MCP content-analysis policy canary.",
      scopeType: "manual",
      module: "ner",
      enabled: false,
      mode: "observe",
      provider: "unsupported-canary",
      modelKey: "no-dispatch-canary",
      modelVersion: "1",
      configJson: {
        maxTextChars: 50000,
        canary: true,
      },
      failurePolicy: "skip",
      priority: 997,
      version: 1,
      isActive: false,
    },
  });
  const policyId = readIdentifier(analysisPolicy, ["policy_id", "policyId"]);
  assert(policyId, "content_analysis_policies.create must return policy id.");
  await harness.mcpToolCall(token, "content_analysis_policies.read", { policyId });
  await harness.mcpToolCall(token, "content_analysis_policies.update", {
    policyId,
    payload: {
      title: `MCP Canary Analysis Policy ${harness.runId} updated`,
      description: "Updated inactive deterministic MCP content-analysis policy canary.",
      isActive: false,
      priority: 998,
    },
  });
  await harness.mcpToolCall(token, "content_analysis_policies.read", { policyId });

  const structuredPolicy = await harness.mcpToolCall(token, "content_analysis_policies.create", {
    payload: {
      policyKey: `mcp_canary_structured_extraction_${canary.policyKeySuffix}`,
      title: `MCP Canary Structured Extraction ${harness.runId}`,
      description: "Inactive configurable structured extraction template canary.",
      scopeType: "manual",
      module: "structured_extraction",
      enabled: false,
      mode: "observe",
      provider: "gemini",
      modelKey: "gemini-canary-no-dispatch",
      modelVersion: "1",
      configJson: {
        templateKey: "mcp_canary_structured_extraction",
        maxTextChars: 50000,
        instructions: "Extract only facts explicitly supported by source text.",
        entityTypes: [
          {
            type: "job_opening",
            fields: [
              { key: "company", type: "string", project: ["entity", "label"] },
              { key: "role", type: "string", project: ["label"] },
            ],
          },
        ],
      },
      failurePolicy: "skip",
      priority: 996,
      version: 1,
      isActive: false,
    },
  });
  const structuredPolicyId = readIdentifier(structuredPolicy, ["policy_id", "policyId"]);
  assert(structuredPolicyId, "content_analysis_policies.create must return structured extraction policy id.");
  await harness.mcpToolCall(token, "content_analysis_policies.read", { policyId: structuredPolicyId });
  await harness.mcpToolCall(token, "content_analysis_policies.update", {
    policyId: structuredPolicyId,
    payload: {
      title: `MCP Canary Structured Extraction ${harness.runId} updated`,
      isActive: false,
      priority: 999,
    },
  });

  await harness.mcpToolCall(token, "content_filter_policies.list", {
    page: 1,
    pageSize: 20,
  });
  const filterPolicy = await harness.mcpToolCall(token, "content_filter_policies.create", {
    payload: {
      policyKey: `mcp_canary_filter_policy_${canary.policyKeySuffix}`,
      title: `MCP Canary Filter Policy ${harness.runId}`,
      description: "Inactive dry-run deterministic MCP content-filter policy canary.",
      scopeType: "manual",
      mode: "dry_run",
      combiner: "all",
      policyJson: {
        rules: [
          {
            type: "label_required",
            labelType: "taxonomy",
            labelKey: "ai",
          },
        ],
      },
      version: 1,
      isActive: false,
      priority: 997,
    },
  });
  const filterPolicyId = readIdentifier(filterPolicy, ["filter_policy_id", "filterPolicyId"]);
  assert(filterPolicyId, "content_filter_policies.create must return filter policy id.");
  await harness.mcpToolCall(token, "content_filter_policies.read", { filterPolicyId });
  await harness.mcpToolCall(token, "content_filter_policies.update", {
    filterPolicyId,
    payload: {
      title: `MCP Canary Filter Policy ${harness.runId} updated`,
      description: "Updated inactive dry-run deterministic MCP content-filter policy canary.",
      isActive: false,
      priority: 998,
    },
  });
  await harness.mcpToolCall(token, "content_filter_policies.read", { filterPolicyId });
  const preview = await harness.mcpToolCall(token, "content_filter_policies.preview", {
    filterPolicyId,
    payload: {
      limit: 1,
    },
  });
  assert(preview && typeof preview === "object", "content_filter_policies.preview should return an object.");

  const backfill = await harness.mcpToolCall(token, "content_analysis.backfill.request", {
    payload: {
      subjectTypes: ["signal_candidate"],
      modules: ["ner", "structured_extraction"],
      missingOnly: true,
      batchSize: 1,
      maxTextChars: 50000,
    },
  });
  const reindexJobId = readIdentifier(backfill, ["reindexJobId", "reindex_job_id"]);
  assert(reindexJobId, "content_analysis.backfill.request must return reindexJobId.");
  assert(
    JSON.stringify(backfill).includes("final_selection_results"),
    "content_analysis.backfill.request should warn that final selection is not recomputed."
  );

  pushEvidence(evidence, "content-analysis-canary", {
    subjectId: canary.subjectId,
    analysisId,
    policyId,
    structuredPolicyId,
    filterPolicyId,
    reindexJobId,
  });

  return {
    key: "content-analysis-operator-flows",
    summary: "Covered content-analysis reads, inactive policy writes, dry-run filter preview/results, and backfill queueing through HTTP MCP.",
    evidence,
  };
}
