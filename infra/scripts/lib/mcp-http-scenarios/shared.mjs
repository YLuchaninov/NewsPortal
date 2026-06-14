import {
  assertMcpSseHandshake,
  mcpBaseUrl,
  nginxBaseUrl,
  postJson,
  readIdentifier,
  waitFor,
} from "../mcp-http-testkit.mjs";
import { randomUUID } from "node:crypto";
import {
  assertFullShippedCoverage,
  buildMcpDocParityMatrix,
  getUnexpectedUntestedShippedEntries,
  getUntestedShippedEntries,
} from "../mcp-http-doc-parity.mjs";
import { DETERMINISTIC_SCENARIO_ORDER } from "../mcp-http-scenario-catalog.mjs";
import {
  assert,
  assertClientError,
  buildPromptArguments,
  extractFirstObjectRow,
  firstResultLine,
  hasContentArray,
  normalizeStatus,
  pushEvidence,
  readFirstRow,
  readJsonRpcErrorMessage,
  readRows,
  sqlLiteral,
} from "../mcp-http-scenario-utils.mjs";

export {
  assertMcpSseHandshake,
  mcpBaseUrl,
  nginxBaseUrl,
  postJson,
  readIdentifier,
  waitFor,
  randomUUID,
  assertFullShippedCoverage,
  buildMcpDocParityMatrix,
  getUnexpectedUntestedShippedEntries,
  getUntestedShippedEntries,
  DETERMINISTIC_SCENARIO_ORDER,
  assert,
  assertClientError,
  buildPromptArguments,
  extractFirstObjectRow,
  firstResultLine,
  hasContentArray,
  normalizeStatus,
  pushEvidence,
  readFirstRow,
  readJsonRpcErrorMessage,
  readRows,
  sqlLiteral,
};

export function readSourceInventoryScopeStatus(responsePayload) {
  const sourceInventory = responsePayload?.sourceInventory;
  if (!sourceInventory || typeof sourceInventory !== "object") {
    return "";
  }
  const rawConfirmation =
    sourceInventory.scope_confirmation_json ?? sourceInventory.scopeConfirmationJson;
  const confirmation =
    typeof rawConfirmation === "string" ? parseJsonPayloadSilently(rawConfirmation) : rawConfirmation;
  if (!confirmation || typeof confirmation !== "object") {
    return "";
  }
  return String(confirmation.scopeStatus ?? "").trim();
}

export function buildMcpScenarioApiUrl(pathname) {
  const normalizedPathname = String(pathname ?? "").startsWith("/")
    ? String(pathname)
    : `/${String(pathname ?? "")}`;
  return `${nginxBaseUrl}/api${normalizedPathname}`;
}

export function parseJsonPayloadSilently(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function seedContentAnalysisCanaryRows(harness) {
  const subjectId = randomUUID();
  const runKey = harness.runId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const provider = "mcp-canary";
  const sourceHash = `mcp-${runKey}`;
  const analysisIds = {};
  for (const analysisType of ["ner", "sentiment", "category", "system_interest_label", "content_filter"]) {
    analysisIds[analysisType] = firstResultLine(
      await harness.queryPostgres(`
        insert into content_analysis_results (
          subject_type,
          subject_id,
          analysis_type,
          provider,
          model_key,
          model_version,
          status,
          result_json,
          confidence,
          source_hash
        )
        values (
          'signal_candidate',
          ${sqlLiteral(subjectId)},
          ${sqlLiteral(analysisType)},
          ${sqlLiteral(provider)},
          ${sqlLiteral(`${analysisType}-canary-v1`)},
          '1',
          'completed',
          ${sqlLiteral(JSON.stringify({ source: "mcp-http-deterministic", analysisType }))}::jsonb,
          0.91,
          ${sqlLiteral(`${sourceHash}-${analysisType}`)}
        )
        returning analysis_id::text;
      `)
    );
    assert(analysisIds[analysisType], `Failed to seed ${analysisType} content analysis canary.`);
  }

  await harness.queryPostgres(`
    insert into content_entities (
      subject_type,
      subject_id,
      entity_text,
      normalized_key,
      entity_type,
      salience,
      confidence,
      mention_count,
      mentions_json,
      provider,
      model_key,
      analysis_id
    )
    values
      ('signal_candidate', ${sqlLiteral(subjectId)}, 'OpenAI', 'openai', 'ORG', 0.9, 0.95, 1, '[{"offset":0,"length":6}]'::jsonb, ${sqlLiteral(provider)}, 'ner-canary-v1', ${sqlLiteral(analysisIds.ner)}),
      ('signal_candidate', ${sqlLiteral(subjectId)}, 'Warsaw', 'warsaw', 'GPE', 0.7, 0.9, 1, '[{"offset":12,"length":6}]'::jsonb, ${sqlLiteral(provider)}, 'ner-canary-v1', ${sqlLiteral(analysisIds.ner)})
    on conflict do nothing;
  `);

  await harness.queryPostgres(`
    insert into content_labels (
      subject_type,
      subject_id,
      label_type,
      label_key,
      label_name,
      decision,
      score,
      confidence,
      explain_json,
      analysis_id
    )
    values
      ('signal_candidate', ${sqlLiteral(subjectId)}, 'taxonomy', 'ai', 'AI', 'match', 0.88, 0.9, '{"source":"mcp-canary"}'::jsonb, ${sqlLiteral(analysisIds.category)}),
      ('signal_candidate', ${sqlLiteral(subjectId)}, 'sentiment', 'positive', 'Positive', 'match', 0.72, 0.86, '{"source":"mcp-canary"}'::jsonb, ${sqlLiteral(analysisIds.sentiment)}),
      ('signal_candidate', ${sqlLiteral(subjectId)}, 'tone', 'neutral', 'Neutral', 'match', 0.67, 0.8, '{"source":"mcp-canary"}'::jsonb, ${sqlLiteral(analysisIds.sentiment)}),
      ('signal_candidate', ${sqlLiteral(subjectId)}, 'risk', 'low', 'Low risk', 'match', 0.2, 0.78, '{"source":"mcp-canary"}'::jsonb, ${sqlLiteral(analysisIds.sentiment)}),
      ('signal_candidate', ${sqlLiteral(subjectId)}, 'system_interest', 'mcp_canary_interest', 'MCP Canary Interest', 'match', 0.81, 0.84, '{"source":"mcp-canary"}'::jsonb, ${sqlLiteral(analysisIds.system_interest_label)})
    on conflict do nothing;
  `);

  await harness.queryPostgres(`
    insert into content_filter_results (
      subject_type,
      subject_id,
      policy_key,
      policy_version,
      mode,
      decision,
      passed,
      score,
      matched_rules_json,
      failed_rules_json,
      explain_json
    )
    values (
      'signal_candidate',
      ${sqlLiteral(subjectId)},
      ${sqlLiteral(`mcp_canary_filter_${runKey}`)},
      1,
      'dry_run',
      'keep',
      true,
      0.82,
      '[{"rule":"canary"}]'::jsonb,
      '[]'::jsonb,
      '{"source":"mcp-canary"}'::jsonb
    )
    on conflict do nothing;
  `);

  harness.addCleanup("delete-content-analysis-canary-rows", async () => {
    await harness.queryPostgres(`
      delete from content_filter_results where subject_type = 'signal_candidate' and subject_id = ${sqlLiteral(subjectId)};
      delete from content_labels where subject_type = 'signal_candidate' and subject_id = ${sqlLiteral(subjectId)};
      delete from content_entities where subject_type = 'signal_candidate' and subject_id = ${sqlLiteral(subjectId)};
      delete from content_analysis_results where subject_type = 'signal_candidate' and subject_id = ${sqlLiteral(subjectId)};
      delete from content_filter_policies where policy_key = ${sqlLiteral(`mcp_canary_filter_policy_${runKey}`)};
      delete from content_analysis_policies where policy_key = ${sqlLiteral(`mcp_canary_analysis_policy_${runKey}`)};
      delete from content_analysis_policies where policy_key = ${sqlLiteral(`mcp_canary_structured_extraction_${runKey}`)};
    `);
  });

  return {
    subjectId,
    analysisIds,
    filterPolicyKey: `mcp_canary_filter_${runKey}`,
    policyKeySuffix: runKey,
  };
}

export async function seedReadOnlyContentCanaryRows(harness) {
  const suffix = harness.runId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const channelId = firstResultLine(
    await harness.queryPostgres(`
      insert into source_channels (
        provider_type,
        name,
        external_id,
        fetch_url,
        homepage_url,
        language,
        is_active
      )
      values (
        'rss',
        ${sqlLiteral(`MCP read canary channel ${suffix}`)},
        ${sqlLiteral(`mcp-read-canary-${suffix}`)},
        ${sqlLiteral(`https://example.com/${suffix}/read-canary.xml`)},
        'https://example.com',
        'en',
        true
      )
      on conflict (provider_type, external_id)
      where external_id is not null
      do update set name = excluded.name, is_active = true, updated_at = now()
      returning channel_id::text;
    `)
  );
  assert(channelId, "Failed to seed MCP read canary channel.");

  const docId = firstResultLine(
    await harness.queryPostgres(`
      insert into signal_candidates (
        channel_id,
        source_signal_candidate_id,
        url,
        published_at,
        title,
        lead,
        body,
        lang,
        processing_state,
        normalized_at,
        deduped_at,
        raw_payload_json
      )
      values (
        ${sqlLiteral(channelId)},
        ${sqlLiteral(`mcp-read-canary-${suffix}`)},
        ${sqlLiteral(`https://example.com/${suffix}/signal_candidate`)},
        now(),
        ${sqlLiteral(`MCP read canary signal_candidate ${suffix}`)},
        'Deterministic MCP read canary lead.',
        'Deterministic MCP read canary body with enough text for read and explain paths.',
        'en',
        'deduped',
        now(),
        now(),
        '{"source":"mcp-read-canary"}'::jsonb
      )
      on conflict (channel_id, source_signal_candidate_id)
      where source_signal_candidate_id is not null
      do update
      set title = excluded.title, updated_at = now()
      returning doc_id::text;
    `)
  );
  assert(docId, "Failed to seed MCP read canary signal_candidate.");

  const resourceId = firstResultLine(
    await harness.queryPostgres(`
      insert into web_resources (
        channel_id,
        external_resource_id,
        url,
        normalized_url,
        final_url,
        resource_kind,
        discovery_source,
        title,
        summary,
        body,
        lang,
        extraction_state,
        classification_json,
        attributes_json,
        raw_payload_json
      )
      values (
        ${sqlLiteral(channelId)},
        ${sqlLiteral(`mcp-read-canary-resource-${suffix}`)},
        ${sqlLiteral(`https://example.com/${suffix}/resource`)},
        ${sqlLiteral(`https://example.com/${suffix}/resource`)},
        ${sqlLiteral(`https://example.com/${suffix}/resource`)},
        'editorial',
        'website',
        ${sqlLiteral(`MCP read canary resource ${suffix}`)},
        'Deterministic MCP read canary resource summary.',
        'Deterministic MCP read canary resource body.',
        'en',
        'enriched',
        '{"kind":"editorial"}'::jsonb,
        '{"source":"mcp-read-canary"}'::jsonb,
        '{"source":"mcp-read-canary"}'::jsonb
      )
      on conflict (channel_id, external_resource_id)
      do update
      set title = excluded.title, updated_at = now()
      returning resource_id::text;
    `)
  );
  assert(resourceId, "Failed to seed MCP read canary web resource.");

  harness.addCleanup("delete-read-only-content-canary-rows", async () => {
    await harness.queryPostgres(`
      delete from web_resources where resource_id = ${sqlLiteral(resourceId)};
      delete from signal_candidates where doc_id = ${sqlLiteral(docId)};
      delete from source_channels where channel_id = ${sqlLiteral(channelId)};
    `);
  });

  return {
    channelId,
    docId,
    contentItemId: `signal_candidate:${docId}`,
    resourceId,
  };
}

export function buildReadToolCalls() {
  return [
    { name: "admin.summary.get", args: {} },
    { name: "admin.mcp_tokens.list", args: {} },
    { name: "system_interests.list", args: { page: 1, pageSize: 20 } },
    { name: "llm_templates.list", args: { page: 1, pageSize: 20 } },
    { name: "channels.list", args: { page: 1, pageSize: 20 } },
    { name: "channels.bulk_onboard.plan", args: { sources: [
      {
        providerType: "website",
        name: "Read-only bulk plan canary",
        fetchUrl: "https://example.com/mcp-read-bulk/",
        isActive: true,
      },
    ] } },
    { name: "sequences.list", args: { page: 1, pageSize: 20 } },
    { name: "sequences.plugins.list", args: {} },
    { name: "discovery.runs.list", args: { page: 1, pageSize: 20 } },
    { name: "discovery.artifacts.list", args: { page: 1, pageSize: 20 } },
    { name: "discovery.candidates.list", args: { page: 1, pageSize: 20 } },
    { name: "discovery.source_inventory.list", args: { page: 1, pageSize: 20 } },
    { name: "discovery.policies.list", args: { page: 1, pageSize: 20 } },
    { name: "discovery.adapter_backlog.list", args: { page: 1, pageSize: 20 } },
    { name: "discovery.feedback.list", args: { page: 1, pageSize: 20 } },
    { name: "discovery.replay_runs.list", args: { page: 1, pageSize: 20 } },
    { name: "discovery.rollback_groups.list", args: { page: 1, pageSize: 20 } },
    { name: "discovery.rollback_actions.list", args: { page: 1, pageSize: 20 } },
    { name: "discovery.eval_runs.list", args: { page: 1, pageSize: 20 } },
    { name: "discovery.source_families.coverage", args: { includeExamples: false } },
    { name: "signal_candidates.list", args: { page: 1, pageSize: 20 } },
    { name: "content_items.list", args: { page: 1, pageSize: 20 } },
    { name: "signal_candidates.residuals.summary", args: {} },
    { name: "web_resources.list", args: { page: 1, pageSize: 20 } },
    { name: "fetch_runs.list", args: { page: 1, pageSize: 20 } },
    { name: "llm_budget.summary", args: {} },
    { name: "operator.flow.route", args: {
      sessionGoal: "deterministic MCP operator routing proof",
      domain: "selection",
      objective: "increase_recall",
      symptoms: ["zero_selected"],
      signalVisibility: "mixed",
    } },
    { name: "operator.system.health", args: { domains: ["selection", "website_pipeline"], includeSamples: true } },
    { name: "operator.issue.explain", args: { symptom: "website resources projected but rejected", domain: "website_pipeline", includeSamples: true } },
    { name: "operator.tuning.recommend", args: { domain: "selection", objective: "increase_precision", residualBucket: "gray_zone_hold" } },
    { name: "operator.effect.verify", args: { domain: "selection", changeRef: "deterministic-read-only-proof", baselineWindowHours: 24, comparisonWindowHours: 24 } },
    { name: "operator.report.verify", args: { reportKind: "cleanup", entityIds: {}, includeSamples: true } },
    { name: "operator.report.verify", args: { reportKind: "system_health", entityIds: {}, includeSamples: true } },
    { name: "operator.report.verify", args: { reportKind: "website_pipeline", entityIds: {}, includeSamples: true } },
    { name: "operator.selection.dashboard", args: {} },
    { name: "operator.selection.reindex_plan", args: { maxDocIds: 5, chunkSize: 2, reason: "deterministic MCP read-only proof" } },
  ];
}
