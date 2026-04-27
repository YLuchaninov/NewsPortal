import {
  mcpBaseUrl,
  postJson,
  readIdentifier,
  waitFor,
} from "./mcp-http-testkit.mjs";
import { randomUUID } from "node:crypto";
import {
  assertFullShippedCoverage,
  buildMcpDocParityMatrix,
} from "./mcp-http-doc-parity.mjs";
export {
  DETERMINISTIC_SCENARIO_GROUPS,
  DETERMINISTIC_SCENARIO_ORDER,
} from "./mcp-http-scenario-catalog.mjs";
import {
  DETERMINISTIC_SCENARIO_GROUPS,
  DETERMINISTIC_SCENARIO_ORDER,
} from "./mcp-http-scenario-catalog.mjs";
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
} from "./mcp-http-scenario-utils.mjs";

async function seedSyntheticDiscoveryCandidate(harness, { missionId, classKey }) {
  const suffix = harness.runId.slice(0, 8);
  const hypothesisId = firstResultLine(
    await harness.queryPostgres(`
      insert into discovery_hypotheses (
        mission_id,
        class_key,
        tactic_key,
        search_query,
        target_urls,
        target_provider_type,
        generation_context,
        expected_value,
        status
      )
      values (
        ${sqlLiteral(missionId)},
        ${sqlLiteral(classKey)},
        ${sqlLiteral("mcp_deterministic_fallback")},
        ${sqlLiteral(`site:${suffix} deterministic discovery candidate`)},
        array[${sqlLiteral(`https://mcp-${suffix}.example.test/source`)}]::text[],
        'website',
        '{"source":"mcp-deterministic-fallback"}'::jsonb,
        ${sqlLiteral("deterministic candidate fallback")},
        'pending'
      )
      returning hypothesis_id::text;
    `)
  );
  assert(hypothesisId, "Failed to seed deterministic discovery hypothesis.");

  const candidateId = firstResultLine(
    await harness.queryPostgres(`
      insert into discovery_candidates (
        hypothesis_id,
        mission_id,
        url,
        final_url,
        title,
        description,
        provider_type,
        is_valid,
        relevance_score,
        evaluation_json,
        llm_assessment,
        sample_data,
        status,
        rejection_reason
      )
      values (
        ${sqlLiteral(hypothesisId)},
        ${sqlLiteral(missionId)},
        ${sqlLiteral(`https://mcp-${suffix}.example.test/source`)},
        ${sqlLiteral(`https://mcp-${suffix}.example.test/source`)},
        ${sqlLiteral(`MCP deterministic candidate ${suffix}`)},
        ${sqlLiteral("Synthetic candidate seeded when the live discovery run produces no deterministic candidate rows.")},
        'website',
        true,
        0.91,
        '{"quality_signal_source":"mcp_deterministic_fallback","normalizedReasonBucket":"below_auto_approval_threshold","reviewScore":0.91}'::jsonb,
        '{}'::jsonb,
        '[]'::jsonb,
        'pending',
        null
      )
      returning candidate_id::text;
    `)
  );
  assert(candidateId, "Failed to seed deterministic discovery candidate.");

  const sourceProfileId = firstResultLine(
    await harness.queryPostgres(`
      insert into discovery_source_profiles (
        candidate_id,
        canonical_domain,
        source_type,
        org_name,
        country,
        languages,
        ownership_transparency,
        author_accountability,
        source_linking_quality,
        historical_stability,
        technical_quality,
        spam_signals,
        trust_score,
        extraction_data
      )
      values (
        ${sqlLiteral(candidateId)},
        ${sqlLiteral(`mcp-${suffix}.example.test`)},
        'news_site',
        ${sqlLiteral(`MCP Deterministic Org ${suffix}`)},
        'US',
        array['en']::text[],
        0.72,
        0.68,
        0.64,
        0.7,
        0.76,
        0.08,
        0.74,
        '{"source":"mcp-deterministic-fallback"}'::jsonb
      )
      returning source_profile_id::text;
    `)
  );
  assert(sourceProfileId, "Failed to seed deterministic discovery source profile.");

  await harness.queryPostgres(`
    update discovery_candidates
    set source_profile_id = ${sqlLiteral(sourceProfileId)}
    where candidate_id = ${sqlLiteral(candidateId)};
  `);

  await harness.queryPostgres(`
    insert into discovery_source_quality_snapshots (
      source_profile_id,
      channel_id,
      snapshot_reason,
      trust_score,
      extraction_quality_score,
      stability_score,
      independence_score,
      freshness_score,
      lead_time_score,
      yield_score,
      duplication_score,
      recall_score,
      scoring_breakdown
    )
    values (
      ${sqlLiteral(sourceProfileId)},
      null,
      'mcp_deterministic_fallback',
      0.74,
      0.76,
      0.7,
      0.69,
      0.66,
      0.62,
      0.71,
      0.12,
      0.73,
      '{"metricSource":"mcp_deterministic_fallback"}'::jsonb
    )
    on conflict (source_profile_id)
    do update
    set
      snapshot_reason = excluded.snapshot_reason,
      trust_score = excluded.trust_score,
      extraction_quality_score = excluded.extraction_quality_score,
      stability_score = excluded.stability_score,
      independence_score = excluded.independence_score,
      freshness_score = excluded.freshness_score,
      lead_time_score = excluded.lead_time_score,
      yield_score = excluded.yield_score,
      duplication_score = excluded.duplication_score,
      recall_score = excluded.recall_score,
      scoring_breakdown = excluded.scoring_breakdown,
      scored_at = now(),
      updated_at = now();
  `);

  await harness.queryPostgres(`
    insert into discovery_source_interest_scores (
      source_profile_id,
      channel_id,
      mission_id,
      topic_coverage,
      specificity,
      audience_fit,
      evidence_depth,
      signal_to_noise,
      fit_score,
      novelty_score,
      lead_time_score,
      yield_score,
      duplication_score,
      contextual_score,
      role_labels,
      scoring_breakdown
    )
    values (
      ${sqlLiteral(sourceProfileId)},
      null,
      ${sqlLiteral(missionId)},
      0.74,
      0.68,
      0.7,
      0.66,
      0.64,
      0.75,
      0.55,
      0.62,
      0.71,
      0.12,
      0.77,
      array['regional_watch']::text[],
      '{"metricSource":"mcp_deterministic_fallback"}'::jsonb
    )
    on conflict (mission_id, source_profile_id)
    do update
    set
      contextual_score = excluded.contextual_score,
      topic_coverage = excluded.topic_coverage,
      fit_score = excluded.fit_score,
      yield_score = excluded.yield_score,
      lead_time_score = excluded.lead_time_score,
      duplication_score = excluded.duplication_score,
      role_labels = excluded.role_labels,
      scoring_breakdown = excluded.scoring_breakdown,
      scored_at = now(),
      updated_at = now();
  `);

  return {
    candidateId,
    hypothesisId,
    sourceProfileId,
  };
}

async function seedContentAnalysisCanaryRows(harness) {
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
          'article',
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
      ('article', ${sqlLiteral(subjectId)}, 'OpenAI', 'openai', 'ORG', 0.9, 0.95, 1, '[{"offset":0,"length":6}]'::jsonb, ${sqlLiteral(provider)}, 'ner-canary-v1', ${sqlLiteral(analysisIds.ner)}),
      ('article', ${sqlLiteral(subjectId)}, 'Warsaw', 'warsaw', 'GPE', 0.7, 0.9, 1, '[{"offset":12,"length":6}]'::jsonb, ${sqlLiteral(provider)}, 'ner-canary-v1', ${sqlLiteral(analysisIds.ner)})
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
      ('article', ${sqlLiteral(subjectId)}, 'taxonomy', 'ai', 'AI', 'match', 0.88, 0.9, '{"source":"mcp-canary"}'::jsonb, ${sqlLiteral(analysisIds.category)}),
      ('article', ${sqlLiteral(subjectId)}, 'sentiment', 'positive', 'Positive', 'match', 0.72, 0.86, '{"source":"mcp-canary"}'::jsonb, ${sqlLiteral(analysisIds.sentiment)}),
      ('article', ${sqlLiteral(subjectId)}, 'tone', 'neutral', 'Neutral', 'match', 0.67, 0.8, '{"source":"mcp-canary"}'::jsonb, ${sqlLiteral(analysisIds.sentiment)}),
      ('article', ${sqlLiteral(subjectId)}, 'risk', 'low', 'Low risk', 'match', 0.2, 0.78, '{"source":"mcp-canary"}'::jsonb, ${sqlLiteral(analysisIds.sentiment)}),
      ('article', ${sqlLiteral(subjectId)}, 'system_interest', 'mcp_canary_interest', 'MCP Canary Interest', 'match', 0.81, 0.84, '{"source":"mcp-canary"}'::jsonb, ${sqlLiteral(analysisIds.system_interest_label)})
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
      'article',
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
      delete from content_filter_results where subject_type = 'article' and subject_id = ${sqlLiteral(subjectId)};
      delete from content_labels where subject_type = 'article' and subject_id = ${sqlLiteral(subjectId)};
      delete from content_entities where subject_type = 'article' and subject_id = ${sqlLiteral(subjectId)};
      delete from content_analysis_results where subject_type = 'article' and subject_id = ${sqlLiteral(subjectId)};
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

async function seedReadOnlyContentCanaryRows(harness) {
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
      insert into articles (
        channel_id,
        source_article_id,
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
        ${sqlLiteral(`https://example.com/${suffix}/article`)},
        now(),
        ${sqlLiteral(`MCP read canary article ${suffix}`)},
        'Deterministic MCP read canary lead.',
        'Deterministic MCP read canary body with enough text for read and explain paths.',
        'en',
        'deduped',
        now(),
        now(),
        '{"source":"mcp-read-canary"}'::jsonb
      )
      on conflict (channel_id, source_article_id)
      where source_article_id is not null
      do update
      set title = excluded.title, updated_at = now()
      returning doc_id::text;
    `)
  );
  assert(docId, "Failed to seed MCP read canary article.");

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
      delete from articles where doc_id = ${sqlLiteral(docId)};
      delete from source_channels where channel_id = ${sqlLiteral(channelId)};
    `);
  });

  return {
    channelId,
    docId,
    contentItemId: `editorial:${docId}`,
    resourceId,
  };
}

async function scenarioAuthAndTokenLifecycle(harness) {
  const evidence = [];
  const html = await harness.assertAdminHtml([
    "Issue bounded operator tokens for remote MCP clients",
    "Issue Token",
    "Recent MCP requests",
  ]);

  const analyst = await harness.issueToken({
    label: `analyst-${harness.runId}`,
    scopes: "read",
  });
  const automation = await harness.issueToken({
    label: `automation-${harness.runId}`,
    scopes: "read,write.sequences,write.destructive",
  });
  const discovery = await harness.issueToken({
    label: `discovery-${harness.runId}`,
    scopes: "read,write.discovery,write.channels,write.destructive",
  });
  const config = await harness.issueToken({
    label: `config-${harness.runId}`,
    scopes: "read,write.templates,write.channels,write.destructive",
  });
  const expired = await harness.issueToken({
    label: `expired-${harness.runId}`,
    scopes: "read",
    expiresAt: "2020-01-01T00:00:00.000Z",
  });
  const revokeCheck = await harness.issueToken({
    label: `revoke-${harness.runId}`,
    scopes: "read",
  });

  harness.tokens = {
    analyst,
    automation,
    discovery,
    config,
    expired,
    revokeCheck,
  };

  assert(html.includes(`analyst-${harness.runId}`) === false, "Pre-issue HTML should not already contain the new token labels.");

  const refreshedHtml = await harness.assertAdminHtml([
    `analyst-${harness.runId}`,
    `automation-${harness.runId}`,
    `discovery-${harness.runId}`,
    `config-${harness.runId}`,
  ]);
  assert(
    refreshedHtml.includes("Copy this token now") === false,
    "Server-rendered token workspace must not leak token secrets after issuance."
  );

  const getMcp = await harness.getMcpSummary(analyst.token);
  assert(getMcp.status === 200, "GET /mcp should be reachable with a valid bearer token.");
  assert(Number(getMcp.json?.tools ?? 0) >= 10, "GET /mcp should expose tool summary metadata.");

  const expiredAttempt = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-expired`,
      method: "initialize",
      params: {},
    },
    {
      bearerToken: expired.token,
      expectStatus: 401,
    }
  );
  assert(
    readJsonRpcErrorMessage(expiredAttempt.json).toLowerCase().includes("expired"),
    "Expired MCP token should fail with an expiration error."
  );

  await harness.revokeToken(revokeCheck.tokenRecord.tokenId);
  const revokedAttempt = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-revoked`,
      method: "initialize",
      params: {},
    },
    {
      bearerToken: revokeCheck.token,
      expectStatus: 403,
    }
  );
  assert(
    readJsonRpcErrorMessage(revokedAttempt.json).toLowerCase().includes("revoked"),
    "Revoked MCP token should fail with a revoke error."
  );

  pushEvidence(evidence, "token-labels", {
    analyst: analyst.tokenRecord.label,
    automation: automation.tokenRecord.label,
    discovery: discovery.tokenRecord.label,
    config: config.tokenRecord.label,
  });
  pushEvidence(evidence, "token-statuses", {
    expiredStatus: expiredAttempt.status,
    revokedStatus: revokedAttempt.status,
  });

  return {
    key: "auth-and-token-lifecycle",
    summary: "Issued scoped operator tokens, verified inventory/secret behavior, and rejected expired or revoked access over HTTP.",
    evidence,
  };
}

async function scenarioProtocolDiscovery(harness) {
  const evidence = [];
  const token = harness.tokens.analyst.token;

  const initialize = await harness.mcpRpc(token, "initialize", {});
  assert(
    String(initialize?.result?.serverInfo?.name ?? "") === "newsportal-mcp",
    "MCP initialize should return the expected server name."
  );

  const toolsList = await harness.mcpRpc(token, "tools/list", {});
  const resourcesList = await harness.mcpRpc(token, "resources/list", {});
  const promptsList = await harness.mcpRpc(token, "prompts/list", {});

  assert(Array.isArray(toolsList?.result?.tools), "tools/list must return an array.");
  assert(Array.isArray(resourcesList?.result?.resources), "resources/list must return an array.");
  assert(Array.isArray(promptsList?.result?.prompts), "prompts/list must return an array.");

  harness.shippedInventory.tools = toolsList.result.tools;
  harness.shippedInventory.resources = resourcesList.result.resources;
  harness.shippedInventory.prompts = promptsList.result.prompts;

  for (const resource of resourcesList.result.resources) {
    const readResult = await harness.mcpResourceRead(token, resource.uri);
    assert(hasContentArray(readResult), `resources/read must return contents for ${resource.uri}.`);
  }

  for (const prompt of promptsList.result.prompts) {
    const promptResult = await harness.mcpPromptGet(
      token,
      prompt.name,
      buildPromptArguments(prompt.name, harness.runId)
    );
    assert(
      Array.isArray(promptResult?.result?.messages) && promptResult.result.messages.length === 1,
      `prompts/get must return one message for ${prompt.name}.`
    );
  }

  pushEvidence(evidence, "inventory", {
    tools: toolsList.result.tools.length,
    resources: resourcesList.result.resources.length,
    prompts: promptsList.result.prompts.length,
  });

  return {
    key: "protocol-discovery",
    summary: "Enumerated the shipped MCP HTTP contract and read every shipped resource and prompt over JSON-RPC.",
    evidence,
  };
}

async function scenarioTemplateInterestChannelFlows(harness) {
  const evidence = [];
  const token = harness.tokens.config.token;

  const interest = await harness.mcpToolCall(token, "system_interests.create", {
    payload: {
      name: `MCP Interest ${harness.runId}`,
      description: "Deterministic HTTP MCP system-interest scenario.",
      positive_texts: "policy\nregulation",
      negative_texts: "sports",
      must_have_terms: "policy",
      must_not_have_terms: "",
      places: "Europe",
      languages_allowed: "en",
      time_window_hours: "",
      allowed_content_kinds: "editorial\ndocument",
      short_tokens_required: "EU",
      short_tokens_forbidden: "",
      candidate_positive_signals: "",
      candidate_negative_signals: "",
      selection_profile_strictness: "balanced",
      selection_profile_unresolved_decision: "hold",
      selection_profile_llm_review_mode: "always",
      priority: "1.0",
      isActive: true,
    },
  });
  const interestTemplateId = String(interest.entityId ?? interest.interestTemplateId ?? "");
  assert(interestTemplateId, "system_interests.create must return an interest template id.");
  harness.rememberEntity("interestTemplateId", interestTemplateId);

  await harness.mcpToolCall(token, "system_interests.update", {
    payload: {
      interestTemplateId,
      name: `MCP Interest ${harness.runId} updated`,
      description: "Updated through deterministic HTTP MCP.",
      positive_texts: "policy\nregulation",
      negative_texts: "sports",
      must_have_terms: "policy",
      must_not_have_terms: "",
      places: "Europe",
      languages_allowed: "en",
      time_window_hours: "",
      allowed_content_kinds: "editorial\ndocument",
      short_tokens_required: "EU",
      short_tokens_forbidden: "",
      candidate_positive_signals: "",
      candidate_negative_signals: "",
      selection_profile_strictness: "balanced",
      selection_profile_unresolved_decision: "hold",
      selection_profile_llm_review_mode: "always",
      priority: "0.9",
      isActive: true,
    },
  });
  await harness.mcpToolCall(token, "system_interests.read", { interestTemplateId });
  await harness.mcpToolCall(token, "system_interests.list", { page: 1, pageSize: 20 });
  await harness.mcpToolCall(token, "system_interests.archive", {
    interestTemplateId,
    confirm: true,
  });
  harness.addCleanup("delete-system-interest", async () => {
    await harness.mcpToolCall(token, "system_interests.delete", {
      interestTemplateId,
      confirm: true,
    });
  });

  const template = await harness.mcpToolCall(token, "llm_templates.create", {
    payload: {
      name: `MCP Template ${harness.runId}`,
      scope: "interests",
      language: "en",
      templateText: "Summarize the relevance of this source for operators.",
      isActive: true,
    },
  });
  const promptTemplateId = String(template.entityId ?? template.promptTemplateId ?? "");
  assert(promptTemplateId, "llm_templates.create must return a template id.");
  harness.rememberEntity("promptTemplateId", promptTemplateId);

  await harness.mcpToolCall(token, "llm_templates.update", {
    payload: {
      promptTemplateId,
      name: `MCP Template ${harness.runId} updated`,
      scope: "interests",
      language: "en",
      templateText: "Summarize the relevance of this source and note novelty.",
      isActive: true,
    },
  });
  await harness.mcpToolCall(token, "llm_templates.read", { promptTemplateId });
  await harness.mcpToolCall(token, "llm_templates.list", { page: 1, pageSize: 20 });
  await harness.mcpToolCall(token, "llm_templates.archive", {
    promptTemplateId,
    confirm: true,
  });

  const channel = await harness.mcpToolCall(token, "channels.create", {
    payload: {
      providerType: "rss",
      name: `MCP RSS ${harness.runId}`,
      fetchUrl: `https://example.com/${harness.runId}/feed.xml`,
      language: "en",
      isActive: true,
    },
  });
  const channelId = String(channel.channelId ?? channel.createdChannelIds?.[0] ?? "");
  assert(channelId, "channels.create must return a channel id.");
  harness.rememberEntity("channelId", channelId);

  await harness.mcpToolCall(token, "channels.update", {
    payload: {
      channelId,
      providerType: "rss",
      name: `MCP RSS ${harness.runId} updated`,
      fetchUrl: `https://example.com/${harness.runId}/feed.xml`,
      language: "en",
      isActive: true,
    },
  });
  await harness.mcpToolCall(token, "channels.read", { channelId });
  await harness.mcpToolCall(token, "channels.list", { page: 1, pageSize: 20, providerType: "rss" });
  harness.addCleanup("delete-config-channel", async () => {
    await harness.mcpToolCall(token, "channels.delete", {
      channelId,
      confirm: true,
    });
  });

  pushEvidence(evidence, "config-entities", {
    interestTemplateId,
    promptTemplateId,
    channelId,
  });

  return {
    key: "template-interest-channel-flows",
    summary: "Exercised real lifecycle writes for system interests, LLM templates, and channels through HTTP MCP.",
    evidence,
  };
}

async function scenarioSequenceOperatorFlows(harness) {
  const evidence = [];
  const token = harness.tokens.automation.token;

  await harness.mcpToolCall(token, "sequences.plugins.list", {});

  const validSequence = await harness.mcpToolCall(token, "sequences.create", {
    payload: {
      title: `MCP valid sequence ${harness.runId}`,
      description: "Deterministic HTTP pending-cancel path.",
      taskGraph: [
        {
          key: "normalize",
          module: "article.normalize",
          options: {},
        },
      ],
      editorState: {
        viewport: { x: 0, y: 0, zoom: 0.9 },
      },
      status: "draft",
      tags: ["mcp", "deterministic"],
    },
  });
  const validSequenceId = String(validSequence.sequence_id ?? validSequence.sequenceId ?? "");
  assert(validSequenceId, "sequences.create must return a sequence id.");
  harness.rememberEntity("validSequenceId", validSequenceId);

  await harness.mcpToolCall(token, "sequences.update", {
    sequenceId: validSequenceId,
    payload: {
      title: `MCP valid sequence ${harness.runId} updated`,
      description: "Updated through deterministic HTTP MCP.",
      taskGraph: [
        {
          key: "normalize",
          module: "article.normalize",
          options: {},
        },
      ],
      editorState: {
        viewport: { x: 0, y: 0, zoom: 0.9 },
      },
      status: "active",
      tags: ["mcp", "deterministic", "updated"],
    },
  });
  await harness.mcpToolCall(token, "sequences.read", { sequenceId: validSequenceId });
  await harness.mcpToolCall(token, "sequences.list", { page: 1, pageSize: 20 });

  await harness.stopWorker();
  const pendingRun = await harness.mcpToolCall(token, "sequences.run", {
    sequenceId: validSequenceId,
    payload: {
      contextJson: {},
      triggerMeta: {
        sourceEventId: "mcp-http-pending-cancel",
      },
    },
  });
  const pendingRunId = String(pendingRun.run_id ?? pendingRun.runId ?? "");
  assert(pendingRunId, "sequences.run must return a run id for the pending path.");
  harness.rememberEntity("pendingRunId", pendingRunId);

  await waitFor(
    "pending sequence run",
    () => harness.mcpToolCall(token, "sequences.runs.read", { runId: pendingRunId }),
    (run) => normalizeStatus(run.status) === "pending"
  );

  await harness.mcpToolCall(token, "sequences.cancel_run", {
    runId: pendingRunId,
    payload: {
      reason: "Deterministic MCP pending cancel path",
    },
  });
  await waitFor(
    "cancelled sequence run",
    () => harness.mcpToolCall(token, "sequences.runs.read", { runId: pendingRunId }),
    (run) => normalizeStatus(run.status) === "cancelled"
  );

  await harness.startWorker();

  const failingSequence = await harness.mcpToolCall(token, "sequences.create", {
    payload: {
      title: `MCP failing sequence ${harness.runId}`,
      description: "Deterministic HTTP failed retry path.",
      taskGraph: [
        {
          key: "normalize_missing_article",
          module: "article.normalize",
          options: {},
        },
      ],
      status: "active",
      tags: ["mcp", "deterministic", "failure"],
    },
  });
  const failingSequenceId = String(failingSequence.sequence_id ?? failingSequence.sequenceId ?? "");
  assert(failingSequenceId, "Failing sequence must return a sequence id.");
  harness.rememberEntity("failingSequenceId", failingSequenceId);

  const failedRun = await harness.mcpToolCall(token, "sequences.run", {
    sequenceId: failingSequenceId,
    payload: {
      contextJson: {
        doc_id: `missing-doc-${harness.runId}`,
        event_id: `missing-event-${harness.runId}`,
      },
    },
  });
  const failedRunId = String(failedRun.run_id ?? failedRun.runId ?? "");
  assert(failedRunId, "sequences.run must return a failed run id.");
  harness.rememberEntity("failedRunId", failedRunId);

  await waitFor(
    "failed sequence run",
    () => harness.mcpToolCall(token, "sequences.runs.read", { runId: failedRunId }),
    (run) => normalizeStatus(run.status) === "failed",
    { timeoutMs: 90000, intervalMs: 2500 }
  );
  await harness.mcpToolCall(token, "sequences.run_task_runs.list", { runId: failedRunId });

  const retriedRun = await harness.mcpToolCall(token, "sequences.retry_run", {
    runId: failedRunId,
    payload: {
      contextOverrides: {
        retry: true,
      },
    },
  });
  const retriedRunId = String(retriedRun.run_id ?? retriedRun.runId ?? "");
  assert(retriedRunId, "sequences.retry_run must return a retry run id.");
  harness.rememberEntity("retriedRunId", retriedRunId);

  await waitFor(
    "retried failed sequence run",
    () => harness.mcpToolCall(token, "sequences.runs.read", { runId: retriedRunId }),
    (run) => normalizeStatus(run.status) === "failed",
    { timeoutMs: 90000, intervalMs: 2500 }
  );

  await harness.mcpToolCall(token, "sequences.archive", {
    sequenceId: validSequenceId,
    confirm: true,
  });
  await harness.mcpToolCall(token, "sequences.archive", {
    sequenceId: failingSequenceId,
    confirm: true,
  });

  pushEvidence(evidence, "sequence-ids", {
    validSequenceId,
    pendingRunId,
    failingSequenceId,
    failedRunId,
    retriedRunId,
  });

  return {
    key: "sequence-operator-flows",
    summary: "Covered sequence create/update/run/cancel/retry/archive paths, including a genuine failed run and task-run evidence reads.",
    evidence,
  };
}

async function scenarioDiscoveryOperatorFlows(harness) {
  const evidence = [];
  const token = harness.tokens.discovery.token;

  await harness.mcpToolCall(token, "discovery.summary.get", {});
  await harness.mcpToolCall(token, "discovery.costs.summary", {});

  const profile = await harness.mcpToolCall(token, "discovery.profiles.create", {
    payload: {
      profileKey: `mcp_profile_${harness.runId.replace(/-/g, "_")}`,
      displayName: `MCP Profile ${harness.runId}`,
      description: "Deterministic HTTP MCP profile.",
      status: "active",
      graphPolicyJson: {
        providerTypes: ["rss", "website"],
        supportedWebsiteKinds: [],
        preferredDomains: [],
        blockedDomains: [],
        positiveKeywords: ["policy"],
        negativeKeywords: [],
        preferredTactics: [],
        expectedSourceShapes: [],
        allowedSourceFamilies: [],
        disfavoredSourceFamilies: [],
        usefulnessHints: [],
        diversityCaps: {},
      },
      recallPolicyJson: {
        providerTypes: ["rss", "website"],
        supportedWebsiteKinds: [],
        preferredDomains: [],
        blockedDomains: [],
        positiveKeywords: ["policy"],
        negativeKeywords: [],
        preferredTactics: [],
        expectedSourceShapes: [],
        allowedSourceFamilies: [],
        disfavoredSourceFamilies: [],
        usefulnessHints: [],
        diversityCaps: {},
      },
      yieldBenchmarkJson: {
        domains: [],
        titleKeywords: [],
        tacticKeywords: [],
      },
    },
  });
  const profileId = String(profile.profile_id ?? profile.profileId ?? "");
  assert(profileId, "discovery.profiles.create must return a profile id.");
  harness.rememberEntity("profileId", profileId);
  await harness.mcpToolCall(token, "discovery.profiles.update", {
    profileId,
    payload: {
      displayName: `MCP Profile ${harness.runId} updated`,
    },
  });
  await harness.mcpToolCall(token, "discovery.profiles.read", { profileId });
  await harness.mcpToolCall(token, "discovery.profiles.list", { page: 1, pageSize: 20, status: "active" });

  const discoveryClass = await harness.mcpToolCall(token, "discovery.classes.create", {
    payload: {
      classKey: `mcp_class_${harness.runId.slice(0, 8)}`,
      displayName: `MCP Class ${harness.runId.slice(0, 8)}`,
      status: "active",
      generationBackend: "graph_seed_only",
      defaultProviderTypes: ["website"],
      seedRulesJson: {
        keywords: ["policy"],
      },
      maxPerMission: 2,
      sortOrder: 0,
      configJson: {
        weight: 1,
      },
    },
  });
  const classKey = String(discoveryClass.class_key ?? discoveryClass.classKey ?? "");
  assert(classKey, "discovery.classes.create must return a class key.");
  harness.rememberEntity("classKey", classKey);
  await harness.mcpToolCall(token, "discovery.classes.update", {
    classKey,
    payload: {
      displayName: `MCP Class ${harness.runId.slice(0, 8)} updated`,
      configJson: {
        weight: 2,
      },
    },
  });
  await harness.mcpToolCall(token, "discovery.classes.read", { classKey });
  await harness.mcpToolCall(token, "discovery.classes.list", { page: 1, pageSize: 20, status: "active" });

  const mission = await harness.mcpToolCall(token, "discovery.missions.create", {
    payload: {
      title: `MCP Mission ${harness.runId}`,
      description: "Deterministic HTTP discovery mission.",
      sourceKind: "manual",
      seedTopics: ["policy"],
      seedLanguages: ["en"],
      seedRegions: ["europe"],
      targetProviderTypes: ["website"],
      interestGraph: {
        core_topic: "policy",
      },
      maxHypotheses: 2,
      maxSources: 3,
      budgetCents: 25,
      priority: 1,
      profileId,
    },
  });
  const missionId = String(mission.mission_id ?? mission.missionId ?? "");
  assert(missionId, "discovery.missions.create must return a mission id.");
  harness.rememberEntity("missionId", missionId);
  await harness.mcpToolCall(token, "discovery.missions.update", {
    missionId,
    payload: {
      title: `MCP Mission ${harness.runId} updated`,
      status: "active",
    },
  });
  await harness.mcpToolCall(token, "discovery.missions.read", { missionId });
  await harness.mcpToolCall(token, "discovery.missions.list", { page: 1, pageSize: 20, status: "active" });
  await harness.mcpToolCall(token, "discovery.missions.compile_graph", { missionId });
  await harness.mcpToolCall(token, "discovery.missions.run", { missionId });
  await waitFor(
    "discovery mission portfolio",
    () => harness.mcpToolCall(token, "discovery.missions.portfolio.read", { missionId }),
    (portfolio) => portfolio && typeof portfolio === "object",
    { timeoutMs: 90000, intervalMs: 2500 }
  );

  let candidateList = await harness.mcpToolCall(token, "discovery.candidates.list", {
    missionId,
    page: 1,
    pageSize: 20,
  });
  if (readRows(candidateList).length === 0) {
    const seeded = await seedSyntheticDiscoveryCandidate(harness, { missionId, classKey });
    harness.rememberEntity("sourceProfileId", seeded.sourceProfileId);
    pushEvidence(evidence, "discovery-deterministic-fallback", seeded);
    candidateList = await harness.mcpToolCall(token, "discovery.candidates.list", {
      missionId,
      page: 1,
      pageSize: 20,
    });
  }
  const candidateRow = readFirstRow(candidateList);
  const candidateId = readIdentifier(candidateRow, ["candidate_id", "candidateId"]);
  assert(candidateId, "discovery.candidates.list should expose at least one candidate id.");
  harness.rememberEntity("candidateId", candidateId);
  await harness.mcpToolCall(token, "discovery.candidates.read", { candidateId });
  await harness.mcpToolCall(token, "discovery.candidates.review", {
    candidateId,
    payload: {
      status: "approved",
    },
  });

  const recallMission = await harness.mcpToolCall(token, "discovery.recall_missions.create", {
    payload: {
      title: `MCP Recall Mission ${harness.runId}`,
      description: "Deterministic HTTP recall mission.",
      missionKind: "manual",
      seedDomains: ["example.com"],
      seedUrls: ["https://example.com/source"],
      seedQueries: ["policy news"],
      targetProviderTypes: ["website"],
      scopeJson: {},
      maxCandidates: 10,
      profileId,
    },
  });
  const recallMissionId = String(
    recallMission.recall_mission_id ?? recallMission.recallMissionId ?? ""
  );
  assert(recallMissionId, "discovery.recall_missions.create must return a recall mission id.");
  harness.rememberEntity("recallMissionId", recallMissionId);
  await harness.mcpToolCall(token, "discovery.recall_missions.update", {
    recallMissionId,
    payload: {
      title: `MCP Recall Mission ${harness.runId} updated`,
      status: "active",
    },
  });
  await harness.mcpToolCall(token, "discovery.recall_missions.read", { recallMissionId });
  await harness.mcpToolCall(token, "discovery.recall_missions.list", {
    page: 1,
    pageSize: 20,
    status: "active",
    missionKind: "manual",
  });
  await harness.mcpToolCall(token, "discovery.recall_missions.acquire", {
    recallMissionId,
  }, { timeoutMs: 90000 });

  const recallCandidate = await harness.mcpToolCall(token, "discovery.recall_candidates.create", {
    payload: {
      recallMissionId,
      url: `https://example.com/${harness.runId}/source`,
      finalUrl: `https://example.com/${harness.runId}/source`,
      title: `MCP Recall Candidate ${harness.runId}`,
      description: "Deterministic HTTP recall candidate.",
      providerType: "website",
      status: "pending",
      qualitySignalSource: "manual",
      evaluationJson: {
        policyReview: {
          stageLossBucket: "manual_only",
        },
      },
    },
  });
  const recallCandidateId = String(
    recallCandidate.recall_candidate_id ?? recallCandidate.recallCandidateId ?? ""
  );
  assert(recallCandidateId, "discovery.recall_candidates.create must return a recall candidate id.");
  harness.rememberEntity("recallCandidateId", recallCandidateId);
  await harness.mcpToolCall(token, "discovery.recall_candidates.update", {
    recallCandidateId,
    payload: {
      status: "shortlisted",
      qualitySignalSource: "operator_review",
    },
  });
  await harness.mcpToolCall(token, "discovery.recall_candidates.read", { recallCandidateId });
  await harness.mcpToolCall(token, "discovery.recall_candidates.list", {
    page: 1,
    pageSize: 20,
    recallMissionId,
  });

  const promoted = await harness.mcpToolCall(token, "discovery.recall_candidates.promote", {
    recallCandidateId,
    payload: {
      tags: ["mcp", "deterministic"],
    },
  });
  const promotedChannelId = String(promoted.registered_channel_id ?? promoted.registeredChannelId ?? "");
  assert(promotedChannelId, "Recall candidate promotion must register a channel.");
  harness.rememberEntity("promotedChannelId", promotedChannelId);
  const promotedSourceProfileId = String(promoted.source_profile_id ?? promoted.sourceProfileId ?? "").trim();
  if (promotedSourceProfileId) {
    harness.rememberEntity("sourceProfileId", promotedSourceProfileId);
  }

  await harness.mcpToolCall(token, "discovery.feedback.create", {
    payload: {
      missionId,
      candidateId,
      sourceProfileId: harness.getEntity("sourceProfileId"),
      feedbackType: "valuable_source",
      feedbackValue: "keep",
      notes: "Deterministic MCP feedback",
    },
  });
  await harness.mcpToolCall(token, "discovery.feedback.list", { missionId, page: 1, pageSize: 20 });
  await harness.mcpToolCall(token, "discovery.re_evaluate", {
    payload: {
      missionId,
    },
  }, { timeoutMs: 90000 });

  const hypotheses = await harness.mcpToolCall(token, "discovery.hypotheses.list", {
    missionId,
    page: 1,
    pageSize: 20,
  });
  assert(readRows(hypotheses).length > 0, "discovery.hypotheses.list should expose hypothesis rows.");

  let sourceProfiles = await harness.mcpToolCall(token, "discovery.source_profiles.list", {
    page: 1,
    pageSize: 20,
  });
  if (readRows(sourceProfiles).length === 0) {
    sourceProfiles = await harness.mcpToolCall(token, "discovery.source_profiles.list", {
      page: 1,
      pageSize: 20,
    });
  }
  const sourceProfileRow = readFirstRow(sourceProfiles);
  const sourceProfileId =
    harness.getEntity("sourceProfileId") ||
    readIdentifier(sourceProfileRow, ["source_profile_id", "sourceProfileId"]);
  assert(sourceProfileId, "discovery.source_profiles.list should expose a source profile id.");
  harness.rememberEntity("sourceProfileId", sourceProfileId);
  await harness.mcpToolCall(token, "discovery.source_profiles.read", { sourceProfileId });

  let sourceInterestScores = await harness.mcpToolCall(token, "discovery.source_interest_scores.list", {
    missionId,
    page: 1,
    pageSize: 20,
  });
  if (readRows(sourceInterestScores).length === 0) {
    sourceInterestScores = await harness.mcpToolCall(token, "discovery.source_interest_scores.list", {
      page: 1,
      pageSize: 20,
    });
  }
  const scoreRow = readFirstRow(sourceInterestScores);
  const scoreId = readIdentifier(scoreRow, ["score_id", "scoreId"]);
  assert(scoreId, "discovery.source_interest_scores.list should expose a score id.");
  harness.rememberEntity("scoreId", scoreId);
  await harness.mcpToolCall(token, "discovery.source_interest_scores.read", { scoreId });

  await harness.mcpToolCall(token, "discovery.recall_missions.pause", {
    recallMissionId,
    confirm: true,
  });
  await harness.mcpToolCall(token, "discovery.missions.archive", {
    missionId,
    confirm: true,
  });
  await harness.mcpToolCall(token, "discovery.classes.archive", {
    classKey,
    confirm: true,
  });
  await harness.mcpToolCall(token, "discovery.profiles.archive", {
    profileId,
    confirm: true,
  });
  harness.addCleanup("delete-promoted-discovery-channel", async () => {
    await harness.mcpToolCall(token, "channels.delete", {
      channelId: promotedChannelId,
      confirm: true,
    });
  });

  pushEvidence(evidence, "discovery-ids", {
    profileId,
    classKey,
    missionId,
    recallMissionId,
    candidateId,
    recallCandidateId,
    sourceProfileId,
    scoreId,
    promotedChannelId,
  });

  return {
    key: "discovery-operator-flows",
    summary: "Ran profile/class/mission/recall/candidate/promotion/feedback/re-evaluation flows through HTTP MCP and captured downstream discovery evidence.",
    evidence,
  };
}

function buildReadToolCalls() {
  return [
    { name: "admin.summary.get", args: {} },
    { name: "system_interests.list", args: { page: 1, pageSize: 20 } },
    { name: "llm_templates.list", args: { page: 1, pageSize: 20 } },
    { name: "channels.list", args: { page: 1, pageSize: 20 } },
    { name: "sequences.list", args: { page: 1, pageSize: 20 } },
    { name: "sequences.plugins.list", args: {} },
    { name: "discovery.summary.get", args: {} },
    { name: "discovery.profiles.list", args: { page: 1, pageSize: 20 } },
    { name: "discovery.classes.list", args: { page: 1, pageSize: 20 } },
    { name: "discovery.missions.list", args: { page: 1, pageSize: 20 } },
    { name: "discovery.recall_missions.list", args: { page: 1, pageSize: 20 } },
    { name: "discovery.candidates.list", args: { page: 1, pageSize: 20 } },
    { name: "discovery.recall_candidates.list", args: { page: 1, pageSize: 20 } },
    { name: "discovery.hypotheses.list", args: { page: 1, pageSize: 20 } },
    { name: "discovery.source_profiles.list", args: { page: 1, pageSize: 20 } },
    { name: "discovery.source_interest_scores.list", args: { page: 1, pageSize: 20 } },
    { name: "discovery.feedback.list", args: { page: 1, pageSize: 20 } },
    { name: "discovery.costs.summary", args: {} },
    { name: "articles.list", args: { page: 1, pageSize: 20 } },
    { name: "content_items.list", args: { page: 1, pageSize: 20 } },
    { name: "articles.residuals.summary", args: {} },
    { name: "web_resources.list", args: { page: 1, pageSize: 20 } },
    { name: "fetch_runs.list", args: { page: 1, pageSize: 20 } },
    { name: "llm_budget.summary", args: {} },
  ];
}

async function scenarioContentAnalysisOperatorFlows(harness) {
  const evidence = [];
  const token = harness.tokens.automation.token;
  const canary = await seedContentAnalysisCanaryRows(harness);
  const analysisId = canary.analysisIds.ner;

  const analysisList = await harness.mcpToolCall(token, "content_analysis.list", {
    page: 1,
    pageSize: 20,
    subjectType: "article",
    subjectId: canary.subjectId,
  });
  assert(readRows(analysisList).length > 0, "content_analysis.list should expose seeded canary rows.");
  await harness.mcpToolCall(token, "content_analysis.read", { analysisId });

  const entityList = await harness.mcpToolCall(token, "content_entities.list", {
    page: 1,
    pageSize: 20,
    subjectType: "article",
    subjectId: canary.subjectId,
  });
  assert(readRows(entityList).length > 0, "content_entities.list should expose seeded canary entities.");

  const labelList = await harness.mcpToolCall(token, "content_labels.list", {
    page: 1,
    pageSize: 20,
    subjectType: "article",
    subjectId: canary.subjectId,
  });
  assert(readRows(labelList).length > 0, "content_labels.list should expose seeded canary labels.");

  const filterResults = await harness.mcpToolCall(token, "content_filter_results.list", {
    page: 1,
    pageSize: 20,
    subjectType: "article",
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
      subjectTypes: ["article"],
      modules: ["ner", "structured_extraction"],
      missingOnly: true,
      batchSize: 1,
      maxTextChars: 50000,
    },
  });
  const reindexJobId = readIdentifier(backfill, ["reindexJobId", "reindex_job_id"]);
  assert(reindexJobId, "content_analysis.backfill.request must return reindexJobId.");

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

async function scenarioReadOnlyOperatorNeeds(harness) {
  const evidence = [];
  const token = harness.tokens.analyst.token;
  const readOnlyCanary = await seedReadOnlyContentCanaryRows(harness);
  const results = [];
  const listResults = {};
  let articleList = null;
  let contentItemList = null;
  let articleResidualSummary = null;
  let webResourceList = null;

  for (const call of buildReadToolCalls()) {
    const output = await harness.mcpToolCall(token, call.name, call.args);
    listResults[call.name] = output;
    if (call.name === "articles.list") {
      articleList = output;
    }
    if (call.name === "content_items.list") {
      contentItemList = output;
    }
    if (call.name === "articles.residuals.summary") {
      articleResidualSummary = output;
    }
    if (call.name === "web_resources.list") {
      webResourceList = output;
    }
    results.push({
      name: call.name,
      keys: output && typeof output === "object" ? Object.keys(output).slice(0, 6) : [],
    });
  }

  const firstSystemInterest = readFirstRow(listResults["system_interests.list"] ?? {});
  const interestTemplateId = readIdentifier(firstSystemInterest, [
    "interest_template_id",
    "interestTemplateId",
  ]);
  if (interestTemplateId) {
    await harness.mcpToolCall(token, "system_interests.read", {
      interestTemplateId,
    });
  }

  const firstTemplate = readFirstRow(listResults["llm_templates.list"] ?? {});
  const promptTemplateId = readIdentifier(firstTemplate, ["prompt_template_id", "promptTemplateId"]);
  if (promptTemplateId) {
    await harness.mcpToolCall(token, "llm_templates.read", {
      promptTemplateId,
    });
  }

  const firstChannel = readFirstRow(listResults["channels.list"] ?? {});
  const channelId = readIdentifier(firstChannel, ["channel_id", "channelId"]);
  if (channelId) {
    await harness.mcpToolCall(token, "channels.read", { channelId });
  }

  const firstSequence = readFirstRow(listResults["sequences.list"] ?? {});
  const sequenceId = readIdentifier(firstSequence, ["sequence_id", "sequenceId"]);
  if (sequenceId) {
    const sequence = await harness.mcpToolCall(token, "sequences.read", { sequenceId });
    const runId = readIdentifier(sequence, ["latest_run_id", "latestRunId"]);
    if (runId) {
      await harness.mcpToolCall(token, "sequences.runs.read", { runId });
      await harness.mcpToolCall(token, "sequences.run_task_runs.list", { runId });
    }
  }

  const firstProfile = readFirstRow(listResults["discovery.profiles.list"] ?? {});
  const profileId = readIdentifier(firstProfile, ["profile_id", "profileId"]);
  if (profileId) {
    await harness.mcpToolCall(token, "discovery.profiles.read", { profileId });
  }

  const firstClass = readFirstRow(listResults["discovery.classes.list"] ?? {});
  const classKey = readIdentifier(firstClass, ["class_key", "classKey"]);
  if (classKey) {
    await harness.mcpToolCall(token, "discovery.classes.read", { classKey });
  }

  const firstMission = readFirstRow(listResults["discovery.missions.list"] ?? {});
  const missionId = readIdentifier(firstMission, ["mission_id", "missionId"]);
  if (missionId) {
    await harness.mcpToolCall(token, "discovery.missions.read", { missionId });
    await harness.mcpToolCall(token, "discovery.missions.portfolio.read", { missionId });
  }

  const firstRecallMission = readFirstRow(listResults["discovery.recall_missions.list"] ?? {});
  const recallMissionId = readIdentifier(firstRecallMission, [
    "recall_mission_id",
    "recallMissionId",
  ]);
  if (recallMissionId) {
    await harness.mcpToolCall(token, "discovery.recall_missions.read", { recallMissionId });
  }

  const firstCandidate = readFirstRow(listResults["discovery.candidates.list"] ?? {});
  const candidateId = readIdentifier(firstCandidate, ["candidate_id", "candidateId"]);
  if (candidateId) {
    await harness.mcpToolCall(token, "discovery.candidates.read", { candidateId });
  }

  const firstRecallCandidate = readFirstRow(listResults["discovery.recall_candidates.list"] ?? {});
  const recallCandidateId = readIdentifier(firstRecallCandidate, [
    "recall_candidate_id",
    "recallCandidateId",
  ]);
  if (recallCandidateId) {
    await harness.mcpToolCall(token, "discovery.recall_candidates.read", { recallCandidateId });
  }

  const firstSourceProfile = readFirstRow(listResults["discovery.source_profiles.list"] ?? {});
  const sourceProfileId = readIdentifier(firstSourceProfile, [
    "source_profile_id",
    "sourceProfileId",
  ]);
  if (sourceProfileId) {
    await harness.mcpToolCall(token, "discovery.source_profiles.read", { sourceProfileId });
  }

  const firstSourceInterestScore = readFirstRow(
    listResults["discovery.source_interest_scores.list"] ?? {}
  );
  const scoreId = readIdentifier(firstSourceInterestScore, ["score_id", "scoreId"]);
  if (scoreId) {
    await harness.mcpToolCall(token, "discovery.source_interest_scores.read", { scoreId });
  }

  const firstWebResource = readFirstRow(webResourceList ?? {});
  const resourceId =
    readIdentifier(firstWebResource, ["resource_id", "resourceId"]) || readOnlyCanary.resourceId;
  if (resourceId) {
    await harness.mcpToolCall(token, "web_resources.read", {
      resourceId,
    });
  }

  const firstArticle = readFirstRow(articleList ?? {});
  const articleDocId = readIdentifier(firstArticle, ["doc_id", "docId"]) || readOnlyCanary.docId;
  if (articleDocId) {
    await harness.mcpToolCall(token, "articles.read", {
      docId: articleDocId,
    });
    await harness.mcpToolCall(token, "articles.explain", {
      docId: articleDocId,
    });
  }

  const firstContentItem = readFirstRow(contentItemList ?? {});
  const contentItemId =
    readIdentifier(firstContentItem, ["content_item_id", "contentItemId"]) || readOnlyCanary.contentItemId;
  if (contentItemId) {
    await harness.mcpToolCall(token, "content_items.read", {
      contentItemId,
    });
    await harness.mcpToolCall(token, "content_items.explain", {
      contentItemId,
    });
  }

  const residualSummaryRow = extractFirstObjectRow(articleResidualSummary);
  const residualGroups = residualSummaryRow?.groups;
  const firstResidualBucket = Array.isArray(residualGroups?.downstreamLossBuckets)
    ? residualGroups.downstreamLossBuckets[0]?.value
    : null;
  const residualList = await harness.mcpToolCall(token, "articles.residuals.list", {
    page: 1,
    pageSize: 20,
    ...(firstResidualBucket ? { downstreamLossBucket: firstResidualBucket } : {}),
  });
  const firstResidualRow = readFirstRow(residualList ?? {});
  if (firstResidualRow && firstResidualBucket) {
    assert(
      readIdentifier(firstResidualRow.selection_diagnostics, ["downstreamLossBucket"]) ===
        firstResidualBucket ||
        String(firstResidualRow?.selection_diagnostics?.downstreamLossBucket ?? "") ===
          String(firstResidualBucket),
      "articles.residuals.list should agree with the chosen residual bucket filter."
    );
  }

  const deniedWrite = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-denied-write`,
      method: "tools/call",
      params: {
        name: "channels.create",
        arguments: {
          payload: {
            providerType: "rss",
            name: `Denied ${harness.runId}`,
            fetchUrl: `https://example.com/${harness.runId}/denied.xml`,
            language: "en",
            isActive: true,
          },
        },
      },
    },
    {
      bearerToken: token,
      expectStatus: 403,
    }
  );
  assert(
    readJsonRpcErrorMessage(deniedWrite.json).includes("write.channels"),
    "Read-only analyst token should be denied channel writes by scope."
  );

  pushEvidence(evidence, "read-tool-count", {
    coveredReadTools: results.length,
    deniedWriteStatus: deniedWrite.status,
  });

  return {
    key: "read-only-operator-needs",
    summary: "Verified a read-only analyst persona can inspect shipped operator surfaces but is denied writes over HTTP MCP.",
    evidence,
  };
}

async function scenarioNegativeScopeAndDestructivePolicy(harness) {
  const evidence = [];
  const validToken = harness.tokens.analyst.token;
  harness.coverage.tools.add("channels.delete");
  harness.coverage.tools.add("system_interests.delete");

  const missingBearer = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-missing-bearer`,
      method: "initialize",
      params: {},
    },
    {
      expectStatus: 401,
    }
  );
  const malformed = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-malformed-bearer`,
      method: "initialize",
      params: {},
    },
    {
      bearerToken: "npmcp_malformed.invalid",
      expectStatus: 401,
    }
  );

  const destructiveWithoutConfirm = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-missing-confirm`,
      method: "tools/call",
      params: {
        name: "channels.delete",
        arguments: {
          channelId: harness.getEntity("channelId"),
        },
      },
    },
    {
      bearerToken: harness.tokens.config.token,
      expectStatus: 400,
    }
  );

  const destructiveWithoutScope = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-missing-destructive-scope`,
      method: "tools/call",
      params: {
        name: "system_interests.delete",
        arguments: {
          interestTemplateId: harness.getEntity("interestTemplateId"),
          confirm: true,
        },
      },
    },
    {
      bearerToken: validToken,
      expectStatus: 403,
    }
  );

  const invalidPayload = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-invalid-payload`,
      method: "tools/call",
      params: {
        name: "sequences.create",
        arguments: {
          payload: [],
        },
      },
    },
    {
      bearerToken: harness.tokens.automation.token,
      expectStatus: 400,
    }
  );

  const unknownMethod = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-unknown-method`,
      method: "method/unknown",
      params: {},
    },
    {
      bearerToken: validToken,
    }
  );
  const unknownTool = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-unknown-tool`,
      method: "tools/call",
      params: {
        name: "unknown.tool",
        arguments: {},
      },
    },
    {
      bearerToken: validToken,
    }
  );
  const unknownResource = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-unknown-resource`,
      method: "resources/read",
      params: {
        uri: "newsportal://unknown/resource",
      },
    },
    {
      bearerToken: validToken,
    }
  );
  const unknownPrompt = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-unknown-prompt`,
      method: "prompts/get",
      params: {
        name: "unknown.prompt",
        arguments: {},
      },
    },
    {
      bearerToken: validToken,
    }
  );

  assert(readJsonRpcErrorMessage(missingBearer.json), "Missing bearer token should produce an MCP auth error.");
  assert(
    readJsonRpcErrorMessage(malformed.json).toLowerCase().includes("token"),
    "Malformed bearer token should fail with a token error."
  );
  const destructiveWithoutConfirmMessage = readJsonRpcErrorMessage(
    destructiveWithoutConfirm.json
  ).toLowerCase();
  const destructiveWithoutScopeMessage = readJsonRpcErrorMessage(
    destructiveWithoutScope.json
  ).toLowerCase();
  assertClientError(destructiveWithoutConfirm, "Destructive tool without confirm");
  assertClientError(destructiveWithoutScope, "Destructive tool without scope");
  assert(
    destructiveWithoutConfirmMessage.includes("confirm")
      || destructiveWithoutConfirmMessage.includes("destructive"),
    "Destructive tool without confirm=true should be rejected."
  );
  assert(
    Boolean(destructiveWithoutScopeMessage),
    "Destructive tool without destructive scope should be rejected."
  );
  assert(
    readJsonRpcErrorMessage(invalidPayload.json).toLowerCase().includes("payload"),
    "Invalid payload schema should be rejected."
  );
  assertClientError(unknownMethod, "Unknown JSON-RPC method");
  assertClientError(unknownTool, "Unknown MCP tool");
  assertClientError(unknownResource, "Unknown MCP resource");
  assertClientError(unknownPrompt, "Unknown MCP prompt");
  assert(readJsonRpcErrorMessage(unknownMethod.json), "Unknown method should produce an MCP error.");
  assert(readJsonRpcErrorMessage(unknownTool.json), "Unknown tool should produce an MCP error.");
  assert(readJsonRpcErrorMessage(unknownResource.json), "Unknown resource should produce an MCP error.");
  assert(readJsonRpcErrorMessage(unknownPrompt.json), "Unknown prompt should produce an MCP error.");

  pushEvidence(evidence, "negative-statuses", {
    missingBearer: missingBearer.status,
    malformed: malformed.status,
    destructiveWithoutConfirm: destructiveWithoutConfirm.status,
    destructiveWithoutScope: destructiveWithoutScope.status,
    invalidPayload: invalidPayload.status,
    unknownMethod: unknownMethod.status,
    unknownTool: unknownTool.status,
    unknownResource: unknownResource.status,
    unknownPrompt: unknownPrompt.status,
  });

  return {
    key: "negative-scope-and-destructive-policy",
    summary: "Asserted real HTTP policy failures for auth, scope, destructive confirmation, invalid payloads, and unknown MCP methods.",
    evidence,
  };
}

async function scenarioRequestLogAndAuditEvidence(harness) {
  const evidence = [];
  const analystTokenId = harness.tokens.analyst.tokenRecord.tokenId;
  const automationTokenId = harness.tokens.automation.tokenRecord.tokenId;

  if (harness.getEntity("promptTemplateId") && !harness.getEntity("promptTemplateDeleted")) {
    await harness.mcpToolCall(harness.tokens.config.token, "llm_templates.delete", {
      promptTemplateId: harness.getEntity("promptTemplateId"),
      confirm: true,
    });
    harness.rememberEntity("promptTemplateDeleted", true);
  }

  const requestRows = await harness.queryPostgres(`
    select request_method,
           coalesce(tool_name, resource_uri, prompt_name, '') as target,
           success::text
    from mcp_request_log
    where token_id in ('${analystTokenId}', '${automationTokenId}')
    order by created_at desc
    limit 40
  `);
  assert(requestRows, "mcp_request_log should contain rows for authenticated MCP activity.");

  const auditRows = await harness.queryPostgres(`
    select action_type
    from audit_log
    where entity_type in (
      'mcp_access_token',
      'sequence',
      'discovery_profile',
      'discovery_mission',
      'discovery_hypothesis_class',
      'discovery_recall_candidate',
      'content_analysis_policy',
      'content_filter_policy',
      'reindex_job'
    )
    order by created_at desc
    limit 60
  `);
  assert(auditRows, "audit_log should contain MCP token lifecycle or mutation rows.");

  const tokenUsageHtml = await harness.assertAdminHtml([
    "Issued Tokens",
    `analyst-${harness.runId}`,
    `automation-${harness.runId}`,
  ]);
  assert(
    tokenUsageHtml.includes("Recent MCP requests"),
    "Admin MCP workspace should expose request activity summary."
  );

  pushEvidence(evidence, "request-log-sample", requestRows.split(/\r?\n/).slice(0, 6));
  pushEvidence(evidence, "audit-log-sample", auditRows.split(/\r?\n/).slice(0, 6));

  return {
    key: "request-log-and-audit-evidence",
    summary: "Confirmed additive MCP request logs and audit rows exist, and that admin surfaces expose recent activity truthfully.",
    evidence,
  };
}

async function scenarioDocParityMatrix(harness) {
  const evidence = [];
  const selectedScenarioKeys = Array.isArray(harness.selectedScenarioKeys)
    ? harness.selectedScenarioKeys
    : [];
  const isFullMatrix =
    selectedScenarioKeys.length === DETERMINISTIC_SCENARIO_ORDER.length &&
    DETERMINISTIC_SCENARIO_ORDER.every((name) => selectedScenarioKeys.includes(name));
  const matrix = buildMcpDocParityMatrix({
    shippedTools: harness.shippedInventory.tools,
    shippedResources: harness.shippedInventory.resources,
    shippedPrompts: harness.shippedInventory.prompts,
    coveredTools: harness.getCoverage().tools,
    coveredResources: harness.getCoverage().resources,
    coveredPrompts: harness.getCoverage().prompts,
  });
  if (isFullMatrix) {
    assertFullShippedCoverage(matrix);
  }
  harness.docParityMatrix = matrix;

  pushEvidence(evidence, "shipped-summary", matrix.summary.shippedTools);
  pushEvidence(evidence, "legacy-examples", matrix.legacy.examples);
  pushEvidence(evidence, "coverage-mode", {
    assertedFullShippedCoverage: isFullMatrix,
    selectedScenarios: selectedScenarioKeys,
  });

  return {
    key: "doc-parity-matrix",
    summary: "Built an explicit shipped-vs-deferred doc-parity matrix and proved full coverage for the shipped HTTP registry.",
    evidence,
  };
}

export const DETERMINISTIC_SCENARIOS = {
  "auth-and-token-lifecycle": scenarioAuthAndTokenLifecycle,
  "protocol-discovery": scenarioProtocolDiscovery,
  "template-interest-channel-flows": scenarioTemplateInterestChannelFlows,
  "sequence-operator-flows": scenarioSequenceOperatorFlows,
  "discovery-operator-flows": scenarioDiscoveryOperatorFlows,
  "content-analysis-operator-flows": scenarioContentAnalysisOperatorFlows,
  "read-only-operator-needs": scenarioReadOnlyOperatorNeeds,
  "negative-scope-and-destructive-policy": scenarioNegativeScopeAndDestructivePolicy,
  "request-log-and-audit-evidence": scenarioRequestLogAndAuditEvidence,
  "doc-parity-matrix": scenarioDocParityMatrix,
};

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

export function resolveDeterministicScenarios({ scenarios = [], group } = {}) {
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

export async function runDeterministicScenario(harness, scenarioKey) {
  const scenario = DETERMINISTIC_SCENARIOS[scenarioKey];
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
    lines.push(
      `- Shipped tools: ${JSON.stringify(shippedTools)}`
    );
    lines.push(
      `- Shipped resources: ${JSON.stringify(shippedResources)}`
    );
    lines.push(
      `- Shipped prompts: ${JSON.stringify(shippedPrompts)}`
    );
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
