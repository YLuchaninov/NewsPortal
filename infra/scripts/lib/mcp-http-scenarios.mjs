import {
  assertMcpSseHandshake,
  apiBaseUrl,
  mcpBaseUrl,
  postJson,
  readIdentifier,
  waitFor,
} from "./mcp-http-testkit.mjs";
import { randomUUID } from "node:crypto";
import {
  assertFullShippedCoverage,
  buildMcpDocParityMatrix,
  getUnexpectedUntestedShippedEntries,
  getUntestedShippedEntries,
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
  const tokenAdmin = await harness.issueToken({
    label: `token-admin-${harness.runId}`,
    scopes: "read,admin.tokens,write.destructive",
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
  const mcpLifecycleCheck = await harness.issueToken({
    label: `mcp-lifecycle-${harness.runId}`,
    scopes: "read",
  });

  harness.tokens = {
    analyst,
    automation,
    discovery,
    config,
    tokenAdmin,
    expired,
    revokeCheck,
    mcpLifecycleCheck,
  };

  assert(html.includes(`analyst-${harness.runId}`) === false, "Pre-issue HTML should not already contain the new token labels.");

  const refreshedHtml = await harness.assertAdminHtml([
    `analyst-${harness.runId}`,
    `automation-${harness.runId}`,
    `discovery-${harness.runId}`,
    `config-${harness.runId}`,
    `token-admin-${harness.runId}`,
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

  const mcpRevoked = await harness.mcpToolCall(tokenAdmin.token, "admin.mcp_tokens.revoke", {
    tokenId: mcpLifecycleCheck.tokenRecord.tokenId,
    reason: "deterministic MCP token lifecycle proof",
    confirm: true,
  });
  assert(
    mcpRevoked.tokenRecord?.status === "revoked",
    "admin.mcp_tokens.revoke should return a revoked sanitized token record."
  );
  const mcpRevokedAttempt = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-mcp-revoked`,
      method: "initialize",
      params: {},
    },
    {
      bearerToken: mcpLifecycleCheck.token,
      expectStatus: 403,
    }
  );
  assert(
    readJsonRpcErrorMessage(mcpRevokedAttempt.json).toLowerCase().includes("revoked"),
    "Token revoked through MCP should fail on the next request."
  );

  const mcpDeleted = await harness.mcpToolCall(
    tokenAdmin.token,
    "admin.mcp_tokens.delete_revoked",
    {
      tokenId: mcpLifecycleCheck.tokenRecord.tokenId,
      confirm: true,
    }
  );
  assert(
    mcpDeleted.tokenRecord?.tokenId === mcpLifecycleCheck.tokenRecord.tokenId,
    "admin.mcp_tokens.delete_revoked should return the deleted token record."
  );
  const tokenInventory = await harness.mcpToolCall(tokenAdmin.token, "admin.mcp_tokens.list", {});
  assert(
    !tokenInventory.items?.some(
      (item) => item.tokenId === mcpLifecycleCheck.tokenRecord.tokenId
    ),
    "Deleted revoked token should not remain in admin.mcp_tokens.list."
  );

  pushEvidence(evidence, "token-labels", {
    analyst: analyst.tokenRecord.label,
    automation: automation.tokenRecord.label,
    discovery: discovery.tokenRecord.label,
    config: config.tokenRecord.label,
    tokenAdmin: tokenAdmin.tokenRecord.label,
  });
  pushEvidence(evidence, "token-statuses", {
    expiredStatus: expiredAttempt.status,
    revokedStatus: revokedAttempt.status,
    mcpRevokedStatus: mcpRevokedAttempt.status,
    mcpDeletedTokenId: mcpDeleted.tokenRecord?.tokenId,
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
  const initializeInstructions = String(initialize?.result?.instructions ?? "");
  assert(
    initializeInstructions.includes("admin.mcp_tokens.list") &&
      initializeInstructions.includes("read") &&
      initializeInstructions.includes("confirm=true") &&
      initializeInstructions.includes("operator.system.health"),
    "MCP initialize should ship high-signal server instructions for read-first cleanup, destructive confirmation, and ongoing operations."
  );
  assert(
    initialize?.result?.capabilities?.resources?.subscribe === true,
    "MCP initialize should advertise resource subscription support for operational monitoring."
  );
  const sseInitialize = await assertMcpSseHandshake(token);
  assert(
    sseInitialize.serverName === "newsportal-mcp",
    "MCP SSE initialize should return the expected server name."
  );

  const toolsList = await harness.mcpRpc(token, "tools/list", {});
  const resourcesList = await harness.mcpRpc(token, "resources/list", {});
  const promptsList = await harness.mcpRpc(token, "prompts/list", {});

  assert(Array.isArray(toolsList?.result?.tools), "tools/list must return an array.");
  assert(Array.isArray(resourcesList?.result?.resources), "resources/list must return an array.");
  assert(Array.isArray(promptsList?.result?.prompts), "prompts/list must return an array.");
  const tokenInventoryTool = toolsList.result.tools.find(
    (tool) => tool.name === "admin.mcp_tokens.list"
  );
  assert(
    tokenInventoryTool?.annotations?.readOnlyHint === true &&
      tokenInventoryTool?.outputSchema?.type === "object" &&
      String(tokenInventoryTool?.description ?? "").includes("Read-only"),
    "tools/list should expose read-only annotations, outputSchema, and usage guidance for token inventory."
  );
  const channelDeleteTool = toolsList.result.tools.find((tool) => tool.name === "channels.delete");
  assert(
    channelDeleteTool?.annotations?.destructiveHint === true &&
      String(channelDeleteTool?.description ?? "").includes("confirm=true"),
    "tools/list should expose destructive annotations and confirmation guidance for destructive tools."
  );
  const tokenRevokeTool = toolsList.result.tools.find(
    (tool) => tool.name === "admin.mcp_tokens.revoke"
  );
  assert(
    tokenRevokeTool?.annotations?.destructiveHint === true &&
      String(tokenRevokeTool?.description ?? "").includes("direct admin REST"),
    "tools/list should expose MCP-native token revoke and discourage direct admin REST bypass."
  );
  const systemHealthTool = toolsList.result.tools.find(
    (tool) => tool.name === "operator.system.health"
  );
  const tuningRecommendTool = toolsList.result.tools.find(
    (tool) => tool.name === "operator.tuning.recommend"
  );
  assert(
    systemHealthTool?.annotations?.readOnlyHint === true &&
      String(systemHealthTool?.description ?? "").includes("operational health") &&
      tuningRecommendTool?.annotations?.readOnlyHint === true,
    "tools/list should expose read-only operating intelligence tools for returning operators."
  );
  const clientContractResource = resourcesList.result.resources.find(
    (resource) => resource.uri === "newsportal://guide/client-contract"
  );
  const operatingModelResource = resourcesList.result.resources.find(
    (resource) => resource.uri === "newsportal://guide/operating-model"
  );
  const opsHealthResource = resourcesList.result.resources.find(
    (resource) => resource.uri === "newsportal://ops/health"
  );
  assert(
    clientContractResource?.annotations?.priority >= 0.9 &&
      String(clientContractResource?.title ?? "").length > 0,
    "resources/list should expose high-priority client-contract context metadata."
  );
  assert(
    operatingModelResource?.annotations?.priority >= 0.8 &&
      opsHealthResource?.annotations?.priority >= 0.6,
    "resources/list should expose operating model and ops health resources for ongoing system work."
  );
  const diagnosePrompt = promptsList.result.prompts.find(
    (prompt) => prompt.name === "diagnose.mcp_error"
  );
  const dailyReviewPrompt = promptsList.result.prompts.find(
    (prompt) => prompt.name === "operations.daily_review"
  );
  const websitePipelinePrompt = promptsList.result.prompts.find(
    (prompt) => prompt.name === "website.pipeline.review"
  );
  assert(
    String(diagnosePrompt?.title ?? "").length > 0 &&
      String(dailyReviewPrompt?.title ?? "").length > 0 &&
      String(websitePipelinePrompt?.title ?? "").length > 0,
    "prompts/list should expose titled MCP error and ongoing operations guidance."
  );

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
  pushEvidence(evidence, "context-metadata", {
    initializeInstructions: initializeInstructions.split("\n").length,
    tokenInventoryAnnotations: tokenInventoryTool.annotations,
    tokenRevokeAnnotations: tokenRevokeTool.annotations,
    channelDeleteAnnotations: channelDeleteTool.annotations,
    clientContractPriority: clientContractResource.annotations.priority,
    diagnosePromptTitle: diagnosePrompt.title,
  });
  pushEvidence(evidence, "sse-transport", {
    endpoint: sseInitialize.endpoint,
    protocolVersion: sseInitialize.protocolVersion,
  });

  return {
    key: "protocol-discovery",
    summary: "Enumerated the shipped MCP HTTP contract, proved SSE compatibility, and read every shipped resource and prompt over JSON-RPC.",
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
      positive_texts: ["policy", "regulation"],
      negative_texts: ["sports"],
      must_have_terms: "policy",
      must_not_have_terms: "vendor blog, market report",
      places: "Europe",
      languages_allowed: ["en"],
      time_window_hours: "",
      allowed_content_kinds: "editorial, document",
      short_tokens_required: ["EU"],
      short_tokens_forbidden: "",
      candidate_positive_signals: "policy: public policy, regulation change",
      candidate_negative_signals: ["noise: sports commentary, market report"],
      selection_profile_strictness: "balanced",
      selection_profile_unresolved_decision: "hold",
      selection_profile_llm_review_mode: "always",
      priority: "1.0",
      isActive: true,
    },
  });
  const interestTemplateId = String(interest.entityId ?? interest.interestTemplateId ?? "");
  assert(interestTemplateId, "system_interests.create must return an interest template id.");
  assert(
    Array.isArray(interest.nextReadBack?.resources) &&
      interest.nextReadBack.resources.includes("newsportal://ops/health"),
    "Mutation responses should include nextReadBack ops resources for clients without resource subscriptions."
  );
  harness.rememberEntity("interestTemplateId", interestTemplateId);

  await harness.mcpToolCall(token, "system_interests.update", {
    payload: {
      interestTemplateId,
      name: `MCP Interest ${harness.runId} updated`,
      description: "Updated through deterministic HTTP MCP.",
      positive_texts: ["policy", "regulation"],
      negative_texts: ["sports"],
      must_have_terms: "policy",
      must_not_have_terms: "vendor blog, market report",
      places: "Europe",
      languages_allowed: ["en"],
      time_window_hours: "",
      allowed_content_kinds: "editorial, document",
      short_tokens_required: ["EU"],
      short_tokens_forbidden: "",
      candidate_positive_signals: "policy: public policy, regulation change",
      candidate_negative_signals: ["noise: sports commentary, market report"],
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

  const bulkSources = [
    {
      providerType: "rss",
      name: `MCP Bulk RSS ${harness.runId}`,
      fetchUrl: `https://example.com/${harness.runId}/bulk/feed.xml`,
      language: "en",
      isActive: true,
    },
    {
      providerType: "website",
      name: `MCP Bulk Website ${harness.runId}`,
      fetchUrl: `https://example.com/${harness.runId}/bulk/`,
      language: "en",
      isActive: true,
      feedDiscoveryEnabled: true,
      sitemapDiscoveryEnabled: true,
      maxResourcesPerPoll: 5,
    },
  ];
  const bulkRiskPlan = await harness.mcpToolCall(token, "channels.bulk_onboard.plan", {
    sources: [
      ...bulkSources,
      {
        providerType: "rss",
        name: `MCP Bulk Risky RSS ${harness.runId}`,
        fetchUrl: `https://example.com/${harness.runId}/bulk/opportunity`,
        language: "en",
        isActive: true,
      },
      {
        providerType: "website",
        name: `MCP Bulk Duplicate Website ${harness.runId}`,
        fetchUrl: `https://example.com/${harness.runId}/bulk/`,
        language: "en",
        isActive: true,
      },
    ],
  });
  const bulkRiskItems = Array.isArray(bulkRiskPlan.items) ? bulkRiskPlan.items : [];
  assert(
    bulkRiskItems.some((item) => item.status === "needs_override"),
    "channels.bulk_onboard.plan should mark obvious website URLs submitted as RSS as needs_override."
  );
  assert(
    bulkRiskItems.some((item) => item.status === "duplicate"),
    "channels.bulk_onboard.plan should classify duplicate source rows before apply."
  );

  const bulkPlan = await harness.mcpToolCall(token, "channels.bulk_onboard.plan", {
    sources: bulkSources,
  });
  assert(bulkPlan.planFingerprint, "channels.bulk_onboard.plan must return planFingerprint.");
  assert(
    Number(bulkPlan.summary?.readyCreate ?? 0) >= 2,
    "channels.bulk_onboard.plan should classify new mixed RSS/website sources as ready_create."
  );
  const staleBulkApply = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-bulk-onboard-stale-fingerprint`,
      method: "tools/call",
      params: {
        name: "channels.bulk_onboard.apply",
        arguments: {
          sources: bulkSources,
          planFingerprint: "stale-fingerprint",
        },
      },
    },
    {
      bearerToken: token,
      expectStatus: 400,
    }
  );
  assert(
    readJsonRpcErrorMessage(staleBulkApply.json).toLowerCase().includes("stale"),
    "channels.bulk_onboard.apply should reject stale planFingerprint before writes."
  );

  const bulkApply = await harness.mcpToolCall(token, "channels.bulk_onboard.apply", {
    sources: bulkSources,
    planFingerprint: bulkPlan.planFingerprint,
  });
  const bulkChannelIds = [
    ...(bulkApply.createdChannelIds ?? []),
    ...(bulkApply.updatedChannelIds ?? []),
  ].map(String);
  assert(bulkChannelIds.length >= 2, "channels.bulk_onboard.apply should create mixed-source channels.");
  assert(
    JSON.stringify(bulkApply.nextReadBack ?? {}).includes("operator.report.verify"),
    "channels.bulk_onboard.apply mutation response should include nextReadBack for clients without notifications."
  );
  for (const bulkChannelId of bulkChannelIds) {
    harness.addCleanup(`delete-bulk-channel-${bulkChannelId}`, async () => {
      await harness.mcpToolCall(token, "channels.delete", {
        channelId: bulkChannelId,
        confirm: true,
      });
    });
  }
  const bulkVerify = await harness.mcpToolCall(token, "channels.bulk_onboard.verify", {
    channelIds: bulkChannelIds,
    includeSamples: true,
  });
  assert(
    Number(bulkVerify.summary?.foundChannels ?? 0) >= 2,
    "channels.bulk_onboard.verify should read back created channels from DB state."
  );
  const updatePlan = await harness.mcpToolCall(token, "channels.bulk_onboard.plan", {
    sources: bulkSources,
  });
  assert(
    Number(updatePlan.summary?.readyUpdate ?? 0) >= 2,
    "channels.bulk_onboard.plan should detect existing bulk sources as ready_update."
  );
  const updateWithoutConfirm = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-bulk-onboard-update-without-confirm`,
      method: "tools/call",
      params: {
        name: "channels.bulk_onboard.apply",
        arguments: {
          sources: bulkSources,
          planFingerprint: updatePlan.planFingerprint,
        },
      },
    },
    {
      bearerToken: token,
      expectStatus: 400,
    }
  );
  assert(
    readJsonRpcErrorMessage(updateWithoutConfirm.json).includes("confirm=true"),
    "channels.bulk_onboard.apply should require confirm=true when the plan updates existing channels."
  );

  pushEvidence(evidence, "config-entities", {
    interestTemplateId,
    promptTemplateId,
    channelId,
    bulkChannelIds,
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

  const targetBackfillDocId = firstResultLine(
    await harness.queryPostgres(`
      select doc_id::text
      from public.articles
      order by created_at desc
      limit 1;
    `)
  );
  const reindexRequest = await harness.mcpToolCall(token, "maintenance.reindex.request", {
    payload: {
      indexName: "interest_centroids",
      jobKind: "backfill",
      ...(targetBackfillDocId
        ? {
            options: {
              docIds: [targetBackfillDocId],
            },
          }
        : {}),
    },
  });
  const reindexJobId = String(reindexRequest.reindexJobId ?? reindexRequest.reindex_job_id ?? "");
  assert(reindexJobId, "maintenance.reindex.request must return a reindex job id.");
  assert(
    JSON.stringify(reindexRequest.nextReadBack ?? {}).includes("operator.report.verify"),
    "maintenance.reindex.request should return selection read-back guidance."
  );
  harness.rememberEntity("reindexJobId", reindexJobId);
  const reindexJobStatus = await waitFor(
    "MCP maintenance reindex job",
    async () =>
      firstResultLine(
        await harness.queryPostgres(`
          select status
          from public.reindex_jobs
          where reindex_job_id = ${sqlLiteral(reindexJobId)}::uuid;
        `)
      ),
    (status) => ["completed", "failed"].includes(normalizeStatus(status)),
    { timeoutMs: 90000, intervalMs: 2500 }
  );
  assert(
    normalizeStatus(reindexJobStatus) === "completed",
    `maintenance.reindex.request job should complete, got ${reindexJobStatus}`
  );
  const reindexJobEvidence = firstResultLine(
    await harness.queryPostgres(`
      select status || '|' || job_kind || '|' || index_name || '|' ||
             coalesce(options_json->>'batchSize', '') || '|' ||
             coalesce(options_json->>'retroNotifications', '') || '|' ||
             coalesce(options_json->>'replayExistingArticles', '') || '|' ||
             coalesce(options_json->>'includeEnrichment', '') || '|' ||
             coalesce(options_json->>'forceEnrichment', '')
      from public.reindex_jobs
      where reindex_job_id = ${sqlLiteral(reindexJobId)}::uuid;
    `)
  );
  const [
    finalReindexStatus,
    finalReindexJobKind,
    finalReindexIndexName,
    finalReindexBatchSize,
    finalReindexRetroNotifications,
    finalReindexReplayExistingArticles,
    finalReindexIncludeEnrichment,
    finalReindexForceEnrichment,
  ] = reindexJobEvidence.split("|");
  assert(normalizeStatus(finalReindexStatus) === "completed", "Backfill reindex job should be completed.");
  assert(finalReindexJobKind === "backfill", "Backfill reindex job should store job_kind=backfill.");
  assert(finalReindexIndexName === "interest_centroids", "Backfill reindex job should target interest_centroids.");
  assert(finalReindexBatchSize === "100", "Backfill reindex job should store default batchSize=100.");
  assert(
    finalReindexRetroNotifications === "skip",
    "Backfill reindex job should skip retro notifications by default."
  );
  assert(
    finalReindexReplayExistingArticles === "true",
    "Backfill reindex job should replay existing articles by default."
  );
  assert(finalReindexIncludeEnrichment === "false", "Backfill reindex job should not include enrichment by default.");
  assert(finalReindexForceEnrichment === "false", "Backfill reindex job should not force enrichment by default.");
  await harness.mcpToolCall(token, "maintenance.reindex_jobs.list", { page: 1, pageSize: 20 });

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
    reindexJobId,
    reindexJobStatus,
  });

  return {
    key: "sequence-operator-flows",
    summary: "Covered sequence create/update/run/cancel/retry/archive paths plus MCP-native reindex queue/read evidence.",
    evidence,
  };
}

async function scenarioDiscoveryOperatorFlows(harness) {
  const evidence = [];
  const token = harness.tokens.discovery.token;
  const sourceUrl = `https://mcp-${harness.runId.replace(/-/g, "").slice(0, 12)}.example.test/feed.xml`;

  const brief = await harness.mcpToolCall(token, "discovery.brief.preview", {
    interestId: harness.runId,
    name: "MCP deterministic policy updates",
    description: "Track public policy and regulatory update sources.",
    languages: ["en"],
    operatorConstraints: { publicOnly: true },
  });
  const discoveryBrief = brief.payload ?? brief;
  pushEvidence(evidence, "brief-preview", brief);

  const run = await harness.mcpToolCall(token, "discovery.runs.create", {
    runKind: "full",
    triggerKind: "mcp",
    createdBy: "mcp-http-scenarios",
    request: { sourceUrl },
    budget: { maxCandidates: 1, maxProbeRequests: 3 },
  });
  const runId = String(run.vnext_run_id ?? run.vnextRunId ?? run.runId ?? "");
  assert(runId, "discovery.runs.create must return a vNext run id.");
  harness.rememberEntity("runId", runId);
  await harness.mcpToolCall(token, "discovery.runs.read", { recordId: runId });
  await harness.mcpToolCall(token, "discovery.runs.list", { page: 1, pageSize: 20 });
  await harness.mcpToolCall(token, "discovery.runs.cancel", { runId });

  const candidate = await harness.mcpToolCall(token, "discovery.candidates.normalize", {
    results: [{ url: sourceUrl, title: "Deterministic policy feed", candidateKindGuess: "rss" }],
    hypothesisId: `${harness.runId}:hypothesis:mcp`,
    queryAttemptId: `${harness.runId}:query:mcp`,
    query: "public policy regulatory updates feed",
    queryFamilyIntent: "official_update_feed",
    runId,
    interestId: harness.runId,
  });
  pushEvidence(evidence, "candidate-normalize", candidate);
  await harness.mcpToolCall(token, "discovery.probe.plan_preview", {
    candidateUrl: sourceUrl,
    candidateKindGuess: "rss",
  });
  const probeReport = {
    candidateUrl: sourceUrl,
    accessPattern: "public",
    technicalObservability: {
      observable: true,
      score: 0.9,
      feedValid: true,
      hasRecurringStructure: true,
      providerFailuresAreTelemetryOnly: true,
    },
    probeSummary: { validFeed: true, sampleEntryCount: 3 },
    evidence: ["deterministic MCP probe fixture"],
    observations: [
      {
        kind: "feed_probe",
        valid: true,
        url: sourceUrl,
        sampleEntryCount: 3,
      },
    ],
  };
  const scopeResolveArgs = {
    discoveryBrief,
    probeReport,
    candidate: {
      canonicalUrl: sourceUrl,
      canonicalDomain: "example.test",
      candidateKindGuess: "rss",
    },
    runId,
    interestId: harness.runId,
    createdBy: "mcp-http-scenarios",
  };
  const scopePreview = await harness.mcpToolCall(token, "discovery.scope.resolve_preview", scopeResolveArgs);
  const scopePreviewPayload = scopePreview.payload ?? scopePreview;
  assert(scopePreviewPayload?.sourceScopeType === "feed", "discovery.scope.resolve_preview must classify valid RSS as feed.");
  pushEvidence(evidence, "scope-resolve-preview", {
    sourceScopeType: scopePreviewPayload?.sourceScopeType,
    resolvedSourceUrl: scopePreviewPayload?.resolvedSourceUrl,
  });
  const scopeApply = await harness.mcpToolCall(token, "discovery.scope.resolve_apply", scopeResolveArgs);
  const sourceScopeResolutionArtifact = scopeApply?.sourceScopeResolutionArtifact ?? {};
  const sourceScopeResolution =
    sourceScopeResolutionArtifact.payload_json ??
    sourceScopeResolutionArtifact.payload ??
    scopePreviewPayload;
  const sourceScopeResolutionArtifactId = String(
    sourceScopeResolutionArtifact.artifact_id ?? sourceScopeResolutionArtifact.artifactId ?? ""
  );
  assert(sourceScopeResolutionArtifactId, "discovery.scope.resolve_apply must persist a SourceScopeResolution artifact.");
  assert(
    sourceScopeResolution?.sourceScopeType === "feed",
    "Persisted SourceScopeResolution artifact must keep feed scope."
  );
  pushEvidence(evidence, "scope-resolve-apply", {
    sourceScopeResolutionArtifactId,
    sourceScopeType: sourceScopeResolution.sourceScopeType,
  });
  const understanding = await harness.mcpToolCall(token, "discovery.understand.preview", {
    discoveryBrief,
    probeReport,
    sourceScopeResolution,
    candidate: {
      canonicalUrl: sourceUrl,
      canonicalDomain: "example.test",
      candidateKindGuess: "rss",
    },
  });
  const sourceUnderstanding = understanding.payload ?? understanding.sourceUnderstanding?.payload ?? understanding.sourceUnderstanding ?? understanding;
  const routing = await harness.mcpToolCall(token, "discovery.route.preview", {
    sourceUnderstanding,
    providerType: "rss",
    accessPattern: "public",
  });
  pushEvidence(evidence, "routing-preview", routing);
  const routingApply = await harness.mcpToolCall(token, "discovery.routing.apply", {
    sourceUnderstanding,
    canonicalUrl: sourceScopeResolution.resolvedSourceUrl ?? sourceUrl,
    canonicalDomain: "example.test",
    sourceIdentityKey: `rss|example.test|${sourceScopeResolution.resolvedSourceUrl ?? sourceUrl}`,
    providerType: "rss",
    accessPattern: "public",
    runId,
    interestId: harness.runId,
    createdBy: "mcp-http-scenarios",
  });
  const sourceInventoryId = String(
    routingApply?.sourceInventory?.source_inventory_id ?? routingApply?.sourceInventory?.sourceInventoryId ?? ""
  );
  assert(sourceInventoryId, "discovery.routing.apply must persist a source inventory row for scope proof.");
  assert(
    routingApply?.sourceInventory?.latest_source_scope_resolution_artifact_id ||
      routingApply?.sourceInventory?.source_scope_type,
    "Scope-aware routing apply must write source inventory scope fields."
  );
  const explain = await harness.mcpToolCall(token, "discovery.source_inventory.explain", {
    sourceInventoryId,
  });
  assert(
    explain?.lineage?.sourceScopeResolutionArtifactId || explain?.sourceInventory?.source_scope_type,
    "discovery.source_inventory.explain must return scope lineage."
  );
  const resolveScopesPreview = await harness.mcpToolCall(token, "discovery.source_inventory.resolve_scopes", {
    sourceInventoryIds: [sourceInventoryId],
    limit: 1,
    apply: false,
    createdBy: "mcp-http-scenarios",
  });
  assert(resolveScopesPreview?.status === "preview", "resolve_scopes apply=false must remain a preview.");
  assert(Number(resolveScopesPreview?.count ?? 0) === 1, "resolve_scopes preview must inspect the bounded inventory id.");
  assert(
    Array.isArray(resolveScopesPreview?.destructiveActions) && resolveScopesPreview.destructiveActions.length === 0,
    "resolve_scopes preview must not include destructive actions."
  );
  const resolveScopesApply = await harness.mcpToolCall(token, "discovery.source_inventory.resolve_scopes", {
    sourceInventoryIds: [sourceInventoryId],
    limit: 1,
    apply: true,
    createdBy: "mcp-http-scenarios",
  });
  assert(resolveScopesApply?.status === "applied", "resolve_scopes apply=true must apply non-destructive metadata.");
  assert(
    resolveScopesApply?.destructiveConfirmationRequired === false,
    "resolve_scopes apply must not require destructive confirmation for metadata-only scope resolution."
  );
  pushEvidence(evidence, "source-inventory-scope-tools", {
    sourceInventoryId,
    explainLineage: explain?.lineage ?? {},
    resolvePreviewCount: resolveScopesPreview?.count,
    resolveApplyCount: resolveScopesApply?.count,
  });

  await harness.mcpToolCall(token, "discovery.artifacts.validate", {
    artifactType: "DiscoveryBrief",
    payload: discoveryBrief,
  });
  const feedback = await harness.mcpToolCall(token, "discovery.feedback.submit", {
    targetType: "artifact",
    targetId: runId,
    feedbackType: "mark_useful",
    feedback: {
      note: "deterministic MCP vNext classification/usefulness proof",
      usefulnessKind: "classification_usefulness",
      classificationCorrect: true,
      sourceUsefulAsClassified: true,
    },
    createdBy: "mcp-http-scenarios",
  });
  pushEvidence(evidence, "feedback", feedback);
  const typedFeedback = await harness.mcpToolCall(token, "discovery.feedback.submit", {
    targetType: "source_inventory",
    targetId: sourceInventoryId,
    feedbackType: "source_scope_correct",
    feedback: {
      note: "deterministic MCP source scope typed feedback proof",
      sourceScopeType: sourceScopeResolution.sourceScopeType,
      sourceScopeResolutionArtifactId,
    },
    createdBy: "mcp-http-scenarios",
  });
  pushEvidence(evidence, "typed-scope-feedback", {
    feedbackId: typedFeedback?.feedbackEvent?.feedback_event_id ?? typedFeedback?.feedback_event_id ?? null,
    feedbackType: "source_scope_correct",
  });

  await harness.assertAdminHtmlAt(`/discovery/source-inventory/${sourceInventoryId}`, [
    "Operator Actions",
    "Source Scope",
    sourceUrl,
    sourceInventoryId,
    "Risk",
  ]);
  const adminAction = await postJson(`${apiBaseUrl}/maintenance/discovery/source-inventory/action`, {
    sourceInventoryId,
    action: "confirm_scope",
    reason: "deterministic MCP/admin source scope smoke",
    createdBy: "mcp-http-scenarios",
  });
  assert(
    adminAction?.json?.sourceInventory?.scope_confirmation_json?.scopeStatus === "confirmed",
    "confirm_scope action must confirm scope without destructive rollback."
  );
  const confirmationStatus = firstResultLine(
    await harness.queryPostgres(`
      select coalesce(scope_confirmation_json->>'scopeStatus', '')
      from source_inventory
      where source_inventory_id = ${sqlLiteral(sourceInventoryId)}
    `)
  );
  assert(confirmationStatus === "confirmed", "source inventory confirm_scope must be readable from DB.");
  pushEvidence(evidence, "admin-source-inventory-smoke", {
    sourceInventoryId,
    scopeStatus: confirmationStatus,
  });

  await harness.mcpToolCall(token, "discovery.policies.validate", {
    policyName: "discovery-routing",
    policyVersion: "mcp-scenario",
    policyType: "routing",
    definition: { yieldIndependent: true },
  });
  await harness.mcpToolCall(token, "discovery.replay.start", {
    replayKind: "full_non_live",
    input: { runId },
    createdBy: "mcp-http-scenarios",
    dryRun: true,
  });
  await harness.mcpToolCall(token, "discovery.runs.list", { page: 1, pageSize: 20 });
  await harness.mcpToolCall(token, "discovery.artifacts.list", { page: 1, pageSize: 20 });
  await harness.mcpToolCall(token, "discovery.candidates.list", { page: 1, pageSize: 20 });
  await harness.mcpToolCall(token, "discovery.source_inventory.list", { page: 1, pageSize: 20 });
  await harness.mcpToolCall(token, "discovery.adapter_backlog.list", { page: 1, pageSize: 20 });

  pushEvidence(evidence, "discovery-ids", { runId });

  return {
    key: "discovery-operator-flows",
    summary: "Ran Discovery vNext run/artifact/candidate/probe/understanding/routing/replay/feedback flows through HTTP MCP.",
    evidence,
  };
}

async function scenarioDiscoveryVnextFullFlow(harness) {
  const evidence = [];
  const token = harness.tokens.discovery.token;
  const sourceUrl = `https://mcp-full-${harness.runId.replace(/-/g, "").slice(0, 12)}.example.test/feed.xml`;
  const interestId = harness.runId;

  const run = await harness.mcpToolCall(token, "discovery.runs.execute", {
    runKind: "full",
    triggerKind: "mcp",
    request: {
      interest: {
        interestId,
        name: "MCP full Discovery vNext flow",
        description: "Track deterministic public regulatory update feeds.",
        languages: ["en"],
      },
      searchProvider: "stub",
      maxBatches: 1,
    },
    budget: { maxRunCostCents: 1 },
    liveProviderExecution: false,
    createdBy: "mcp-http-scenarios",
  });
  const runId = String(run?.run?.vnext_run_id ?? run?.run?.vnextRunId ?? "");
  assert(runId, "discovery.runs.execute must return a vNext run id.");
  assert(
    Array.isArray(run?.result?.steps) && run.result.steps.includes("candidate_acquisition"),
    "discovery.runs.execute full mode must run candidate acquisition."
  );
  pushEvidence(evidence, "full-run", { runId, steps: run.result.steps });

  const briefArtifact = (run?.result?.briefArtifact ?? {});
  const discoveryBrief = briefArtifact.payload_json ?? briefArtifact.payload ?? {};
  const candidateCreate = await harness.mcpToolCall(token, "discovery.candidates.create", {
    results: [{ url: sourceUrl, title: "MCP full flow feed", candidateKindGuess: "rss" }],
    hypothesisId: `${harness.runId}:hypothesis:full`,
    query: "mcp deterministic full discovery feed",
    queryFamilyIntent: "official_update_feed",
    runId,
    interestId,
    createdBy: "mcp-http-scenarios",
  });
  const candidateRows = Array.isArray(candidateCreate?.candidates)
    ? candidateCreate.candidates
    : readRows(candidateCreate);
  const candidate = candidateRows[0] ?? {};
  const candidateId = String(candidate.candidate_id ?? candidate.candidateId ?? "");
  assert(candidateId, "discovery.candidates.create must persist a candidate.");

  const understanding = await harness.mcpToolCall(token, "discovery.understand.preview", {
    discoveryBrief,
    probeReport: {
      probeSummary: {
        validFeed: true,
        sampleEntryCount: 3,
        technicalObservability: 0.9,
        discoveredFeedUrls: [sourceUrl],
      },
      evidence: ["deterministic MCP full flow probe fixture"],
    },
    candidate: {
      candidateId,
      canonicalUrl: sourceUrl,
      canonicalDomain: "example.test",
      candidateKindGuess: "rss",
    },
  });
  const sourceUnderstanding =
    understanding.payload ?? understanding.sourceUnderstanding?.payload ?? understanding.sourceUnderstanding ?? understanding;
  const routing = await harness.mcpToolCall(token, "discovery.routing.apply", {
    sourceUnderstanding,
    canonicalUrl: sourceUrl,
    canonicalDomain: "example.test",
    sourceIdentityKey: `${harness.runId}:mcp-full-flow`,
    providerType: "rss",
    accessPattern: "public",
    runId,
    interestId,
    candidateId,
    createdBy: "mcp-http-scenarios",
  });
  const sourceInventoryId = String(
    routing?.sourceInventory?.source_inventory_id ?? routing?.sourceInventory?.sourceInventoryId ?? ""
  );
  assert(sourceInventoryId, "discovery.routing.apply must persist source inventory.");
  pushEvidence(evidence, "routing-apply", {
    sourceInventoryId,
    decision: routing?.routingDecisionArtifact?.payload_json?.decision,
  });

  const llm = await harness.mcpToolCall(token, "discovery.llm_gateway.run", {
    task: "discovery_compile_interest_graph",
    prompt: "Return deterministic MCP full-flow evidence.",
    payload: { runId, sourceInventoryId },
    budget: { maxRunCostCents: 1 },
    liveProviderExecution: false,
    runId,
    createdBy: "mcp-http-scenarios",
  });
  pushEvidence(evidence, "llm-gateway", { status: llm?.event?.status });

  const prepared = await harness.mcpToolCall(token, "discovery.rollback.prepare", {
    sourceInventoryId,
    reason: "MCP full-flow rollback proof.",
    createdBy: "mcp-http-scenarios",
  });
  const rollbackGroupId = String(
    prepared?.rollbackGroup?.rollback_group_id ?? prepared?.rollbackGroup?.rollbackGroupId ?? ""
  );
  assert(rollbackGroupId, "discovery.rollback.prepare must return a rollback group.");
  await harness.mcpToolCall(token, "discovery.rollback.apply", {
    rollbackGroupId,
    appliedBy: "mcp-http-scenarios",
    confirm: true,
  });

  const diagnosticReads = [
    ["run-steps", await harness.mcpToolCall(token, "discovery.run_steps.list", { page: 1, pageSize: 20 })],
    ["query-attempts", await harness.mcpToolCall(token, "discovery.query_attempts.list", { page: 1, pageSize: 20 })],
    ["llm-gateway-events", await harness.mcpToolCall(token, "discovery.llm_gateway_events.list", { page: 1, pageSize: 20 })],
    ["monitoring-state", await harness.mcpToolCall(token, "discovery.monitoring_state.list", { page: 1, pageSize: 20 })],
    ["source-observations", await harness.mcpToolCall(token, "discovery.source_observations.list", { page: 1, pageSize: 20 })],
  ];
  const diagnosticReadIds = {
    "run-steps": ["discovery.run_steps.read", "run_step_id", "runStepId"],
    "query-attempts": ["discovery.query_attempts.read", "query_attempt_id", "queryAttemptId"],
    "llm-gateway-events": ["discovery.llm_gateway_events.read", "llm_gateway_event_id", "llmGatewayEventId"],
    "monitoring-state": ["discovery.monitoring_state.read", "source_inventory_id", "sourceInventoryId"],
    "source-observations": ["discovery.source_observations.read", "observation_id", "observationId"],
  };
  for (const [label, payload] of diagnosticReads) {
    assert(Array.isArray(payload?.items), `discovery ${label} read surface must return items.`);
    const [readTool, snakeId, camelId] = diagnosticReadIds[label] ?? [];
    const firstItem = payload.items[0];
    const recordId = String(firstItem?.[snakeId] ?? firstItem?.[camelId] ?? "");
    if (readTool && recordId) {
      await harness.mcpToolCall(token, readTool, { recordId });
    }
  }
  pushEvidence(evidence, "diagnostic-reads", diagnosticReads.map(([label]) => label));

  return {
    key: "discovery-vnext-full-flow",
    summary: "Executed full Discovery vNext MCP flow and read run-step/query/LLM/monitoring/observation diagnostics.",
    evidence,
  };
}

function buildReadToolCalls() {
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
    { name: "articles.list", args: { page: 1, pageSize: 20 } },
    { name: "content_items.list", args: { page: 1, pageSize: 20 } },
    { name: "articles.residuals.summary", args: {} },
    { name: "web_resources.list", args: { page: 1, pageSize: 20 } },
    { name: "fetch_runs.list", args: { page: 1, pageSize: 20 } },
    { name: "llm_budget.summary", args: {} },
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

  const syncRequest = await harness.mcpToolCall(harness.tokens.config.token, "channels.sync.request", {
    channelId: readOnlyCanary.channelId,
    reason: "deterministic MCP outbox coverage proof",
  });
  const syncEventId = String(syncRequest?.event_id ?? syncRequest?.eventId ?? "");
  assert(syncEventId, "channels.sync.request must enqueue an outbox event for the canary channel.");
  const outboxEvents = await harness.mcpToolCall(token, "outbox.events.list", {
    eventType: "source.channel.sync.requested",
    aggregateId: readOnlyCanary.channelId,
    limit: 5,
  });
  assert(readRows(outboxEvents).length > 0, "outbox.events.list must expose the requested source sync event.");
  listResults["outbox.events.list"] = outboxEvents;

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

  const firstRun = readFirstRow(listResults["discovery.runs.list"] ?? {});
  const runId = readIdentifier(firstRun, ["vnext_run_id", "vnextRunId", "run_id", "runId"]);
  if (runId) {
    await harness.mcpToolCall(token, "discovery.runs.read", { recordId: runId });
  }

  const firstEvalRun = readFirstRow(listResults["discovery.eval_runs.list"] ?? {});
  const evalRunId = readIdentifier(firstEvalRun, ["eval_run_id", "evalRunId"]);
  if (evalRunId) {
    await harness.mcpToolCall(token, "discovery.eval_runs.read", { recordId: evalRunId });
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
  const invalidChannelPayload = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-channel-create-missing-fetch-url`,
      method: "tools/call",
      params: {
        name: "channels.create",
        arguments: {
          payload: {
            providerType: "website",
            name: `Invalid website channel ${harness.runId}`,
            websiteUrl: `https://example.com/${harness.runId}/`,
          },
        },
      },
    },
    {
      bearerToken: harness.tokens.config.token,
      expectStatus: 400,
    }
  );
  const invalidBulkOnboardSource = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-bulk-onboard-extra-field-denied`,
      method: "tools/call",
      params: {
        name: "channels.bulk_onboard.plan",
        arguments: {
          sources: [
            {
              providerType: "website",
              name: `Invalid bulk website ${harness.runId}`,
              fetchUrl: `https://example.com/${harness.runId}/bulk-invalid/`,
              websiteUrl: `https://example.com/${harness.runId}/bulk-invalid/`,
            },
          ],
        },
      },
    },
    {
      bearerToken: harness.tokens.config.token,
      expectStatus: 400,
    }
  );
  const invalidDiscoveryArtifactCreatePayload = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-discovery-artifact-nested-payload-denied`,
      method: "tools/call",
      params: {
        name: "discovery.artifacts.create",
        arguments: {
          payload: {
            payload: {
              artifactType: "DiscoveryBrief",
            },
          },
        },
      },
    },
    {
      bearerToken: harness.tokens.discovery.token,
      expectStatus: 400,
    }
  );
  const invalidDiscoveryRunCreatePayload = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-discovery-run-nested-payload-denied`,
      method: "tools/call",
      params: {
        name: "discovery.runs.create",
        arguments: {
          payload: {
            payload: {
              runKind: "full",
            },
          },
        },
      },
    },
    {
      bearerToken: harness.tokens.discovery.token,
      expectStatus: 400,
    }
  );

  const invalidDiscoveryRoutePayload = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-invalid-discovery-review-payload`,
      method: "tools/call",
      params: {
        name: "discovery.route.preview",
        arguments: {
          sourceUnderstanding: "not-an-object",
          payload: {
            reason: "cleanup",
          },
        },
      },
    },
    {
      bearerToken: harness.tokens.discovery.token,
      expectStatus: 400,
    }
  );

  const invalidDiscoveryRollbackPayload = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-invalid-discovery-rollback-payload`,
      method: "tools/call",
      params: {
        name: "discovery.rollback.apply",
        arguments: {
          rollbackGroupId: "00000000-0000-4000-8000-000000000000",
        },
      },
    },
    {
      bearerToken: harness.tokens.discovery.token,
      expectStatus: 400,
    }
  );

  const invalidDiscoveryArtifactJsonString = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-discovery-artifact-json-string-denied`,
      method: "tools/call",
      params: {
        name: "discovery.artifacts.create",
        arguments: {
          artifactType: "DiscoveryBrief",
          payload: JSON.stringify({
            name: "String payload should be rejected",
          }),
        },
      },
    },
    {
      bearerToken: harness.tokens.discovery.token,
      expectStatus: 400,
    }
  );

  const invalidDiscoveryPolicyNestedPayload = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-discovery-policy-nested-payload-denied`,
      method: "tools/call",
      params: {
        name: "discovery.policies.activate",
        arguments: {
          payload: {
            payload: {
              policyName: "bad",
            },
          },
        },
      },
    },
    {
      bearerToken: harness.tokens.discovery.token,
      expectStatus: 400,
    }
  );

  const invalidSequenceCreateExtraPayload = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-sequence-create-extra-field-denied`,
      method: "tools/call",
      params: {
        name: "sequences.create",
        arguments: {
          payload: {
            title: `Invalid sequence ${harness.runId}`,
            taskGraph: [],
            target: "interest_centroids",
          },
        },
      },
    },
    {
      bearerToken: harness.tokens.automation.token,
      expectStatus: 400,
    }
  );

  const invalidTemplateExtraPayload = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-llm-template-extra-field-denied`,
      method: "tools/call",
      params: {
        name: "llm_templates.create",
        arguments: {
          payload: {
            name: `Invalid template ${harness.runId}`,
            templateText: "Do not create.",
            model: "guessed-field",
          },
        },
      },
    },
    {
      bearerToken: harness.tokens.config.token,
      expectStatus: 400,
    }
  );

  const invalidContentPolicyExtraPayload = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-content-policy-extra-field-denied`,
      method: "tools/call",
      params: {
        name: "content_analysis_policies.create",
        arguments: {
          payload: {
            policyKey: `invalid_policy_${harness.runId.replace(/-/g, "_")}`,
            title: "Invalid policy",
            module: "ner",
            payload: {
              nested: true,
            },
          },
        },
      },
    },
    {
      bearerToken: harness.tokens.automation.token,
      expectStatus: 400,
    }
  );

  const invalidDiscoveryFeedbackPayload = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-discovery-feedback-missing-target-denied`,
      method: "tools/call",
      params: {
        name: "discovery.feedback.submit",
        arguments: {
          feedbackType: "approve",
        },
      },
    },
    {
      bearerToken: harness.tokens.discovery.token,
      expectStatus: 400,
    }
  );

  const tokenRevokeWithoutAdminScope = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-token-revoke-missing-admin-scope`,
      method: "tools/call",
      params: {
        name: "admin.mcp_tokens.revoke",
        arguments: {
          tokenId: harness.tokens.analyst.tokenRecord.tokenId,
          reason: "should be denied by scope",
          confirm: true,
        },
      },
    },
    {
      bearerToken: harness.tokens.config.token,
      expectStatus: 403,
    }
  );

  const tokenSelfRevoke = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-token-self-revoke`,
      method: "tools/call",
      params: {
        name: "admin.mcp_tokens.revoke",
        arguments: {
          tokenId: harness.tokens.tokenAdmin.tokenRecord.tokenId,
          reason: "self revoke should be denied",
          confirm: true,
        },
      },
    },
    {
      bearerToken: harness.tokens.tokenAdmin.token,
      expectStatus: 400,
    }
  );

  const systemSequenceId = firstResultLine(
    await harness.queryPostgres(`
      select sequence_id::text
      from public.sequences
      where created_by like 'migration:%'
        and status in ('active', 'draft')
      order by title
      limit 1;
    `)
  );
  assert(systemSequenceId, "Expected at least one migration-owned system sequence for archive denial proof.");
  const systemSequenceArchive = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-system-sequence-archive-denied`,
      method: "tools/call",
      params: {
        name: "sequences.archive",
        arguments: {
          sequenceId: systemSequenceId,
          confirm: true,
        },
      },
    },
    {
      bearerToken: harness.tokens.automation.token,
      expectStatus: 400,
    }
  );

  const defaultReindexSequenceId = firstResultLine(
    await harness.queryPostgres(`
      select sequence_id::text
      from public.sequences
      where title = 'Default Reindex'
        and created_by like 'migration:%'
      limit 1;
    `)
  );
  assert(defaultReindexSequenceId, "Expected migration-owned Default Reindex sequence for manual-run denial proof.");
  const defaultReindexManualRun = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-default-reindex-manual-run-denied`,
      method: "tools/call",
      params: {
        name: "sequences.run",
        arguments: {
          sequenceId: defaultReindexSequenceId,
        },
      },
    },
    {
      bearerToken: harness.tokens.automation.token,
      expectStatus: 400,
    }
  );
  const invalidSequenceRunPayload = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-sequence-run-extra-target-denied`,
      method: "tools/call",
      params: {
        name: "sequences.run",
        arguments: {
          sequenceId: defaultReindexSequenceId,
          payload: {
            target: "interest_centroids",
          },
        },
      },
    },
    {
      bearerToken: harness.tokens.automation.token,
      expectStatus: 400,
    }
  );
  const invalidReindexIndexName = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-reindex-invalid-index-denied`,
      method: "tools/call",
      params: {
        name: "maintenance.reindex.request",
        arguments: {
          payload: {
            indexName: "articles",
            jobKind: "backfill",
          },
        },
      },
    },
    {
      bearerToken: harness.tokens.automation.token,
      expectStatus: 400,
    }
  );
  const invalidReindexJobKind = await postJson(
    mcpBaseUrl,
    {
      jsonrpc: "2.0",
      id: `${harness.runId}-reindex-invalid-kind-denied`,
      method: "tools/call",
      params: {
        name: "maintenance.reindex.request",
        arguments: {
          payload: {
            indexName: "interest_centroids",
            jobKind: "repair",
          },
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
  assert(
    readJsonRpcErrorMessage(invalidChannelPayload.json).includes("payload.websiteUrl"),
    "Invalid channel create payloads should be rejected by MCP schema before control-plane 422."
  );
  assert(
    readJsonRpcErrorMessage(invalidBulkOnboardSource.json).includes("websiteUrl"),
    "Invalid bulk onboarding source rows should be rejected by MCP schema before backend/control-plane writes."
  );
  assert(
    readJsonRpcErrorMessage(invalidDiscoveryArtifactCreatePayload.json).includes("payload"),
    "Nested discovery artifact create payloads should be rejected by MCP schema before backend 422."
  );
  assert(
    readJsonRpcErrorMessage(invalidDiscoveryRunCreatePayload.json).includes("payload"),
    "Nested discovery run create payloads should be rejected by MCP schema before backend 422."
  );
  assert(
    readJsonRpcErrorMessage(invalidDiscoveryRoutePayload.json).includes("sourceUnderstanding"),
    "Invalid discovery route payloads should be rejected by MCP schema before backend 422."
  );
  assert(
    readJsonRpcErrorMessage(invalidDiscoveryRollbackPayload.json).includes("confirm"),
    "Invalid rollback payload should be rejected by MCP schema before backend 422."
  );
  assert(
    invalidDiscoveryArtifactJsonString.json?.error?.data?.path === "payload",
    "JSON-string write payloads should fail at the MCP payload boundary with data.path=payload."
  );
  assert(
    readJsonRpcErrorMessage(invalidDiscoveryPolicyNestedPayload.json).includes("payload"),
    "Nested discovery policy payloads should be rejected by MCP schema before backend 422."
  );
  assert(
    readJsonRpcErrorMessage(invalidSequenceCreateExtraPayload.json).includes("payload.target"),
    "Sequence create should reject guessed extra payload fields before backend 422."
  );
  assert(
    readJsonRpcErrorMessage(invalidTemplateExtraPayload.json).includes("payload.model"),
    "LLM template create should reject guessed extra payload fields before control-plane mutation."
  );
  assert(
    readJsonRpcErrorMessage(invalidContentPolicyExtraPayload.json).includes("payload.payload"),
    "Content analysis policy create should reject nested payload envelopes before backend 422."
  );
  assert(
    readJsonRpcErrorMessage(invalidDiscoveryFeedbackPayload.json).includes("target"),
    "Discovery feedback should require an explicit target at the MCP boundary."
  );
  assert(
    readJsonRpcErrorMessage(tokenRevokeWithoutAdminScope.json).includes("admin.tokens"),
    "MCP token revoke should require admin.tokens scope rather than encouraging direct REST bypass."
  );
  assert(
    readJsonRpcErrorMessage(tokenSelfRevoke.json).toLowerCase().includes("current mcp token"),
    "MCP token revoke should reject self-revoke through the active session."
  );
  assert(
    readJsonRpcErrorMessage(systemSequenceArchive.json).toLowerCase().includes("system sequence"),
    "MCP cleanup should reject archiving migration-owned system sequences."
  );
  assert(
    readJsonRpcErrorMessage(defaultReindexManualRun.json).includes("maintenance.reindex"),
    "MCP should reject manual Default Reindex runs without a valid reindex job/event context."
  );
  assert(
    readJsonRpcErrorMessage(invalidSequenceRunPayload.json).includes("payload.target"),
    "MCP should reject extra sequence run payload fields before backend 422 responses."
  );
  assert(
    readJsonRpcErrorMessage(invalidReindexIndexName.json).includes("payload.indexName"),
    "MCP should reject unsupported reindex indexName before creating a skipped job."
  );
  assert(
    readJsonRpcErrorMessage(invalidReindexJobKind.json).includes("payload.jobKind"),
    "MCP should reject unsupported reindex jobKind instead of coercing it to rebuild."
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
    invalidChannelPayload: invalidChannelPayload.status,
    invalidBulkOnboardSource: invalidBulkOnboardSource.status,
    invalidDiscoveryArtifactCreatePayload: invalidDiscoveryArtifactCreatePayload.status,
    invalidDiscoveryRunCreatePayload: invalidDiscoveryRunCreatePayload.status,
    invalidDiscoveryRoutePayload: invalidDiscoveryRoutePayload.status,
    invalidDiscoveryRollbackPayload: invalidDiscoveryRollbackPayload.status,
    invalidDiscoveryArtifactJsonString: invalidDiscoveryArtifactJsonString.status,
    invalidDiscoveryPolicyNestedPayload: invalidDiscoveryPolicyNestedPayload.status,
    invalidSequenceCreateExtraPayload: invalidSequenceCreateExtraPayload.status,
    invalidTemplateExtraPayload: invalidTemplateExtraPayload.status,
    invalidContentPolicyExtraPayload: invalidContentPolicyExtraPayload.status,
    invalidDiscoveryFeedbackPayload: invalidDiscoveryFeedbackPayload.status,
    tokenRevokeWithoutAdminScope: tokenRevokeWithoutAdminScope.status,
    tokenSelfRevoke: tokenSelfRevoke.status,
    systemSequenceArchive: systemSequenceArchive.status,
    defaultReindexManualRun: defaultReindexManualRun.status,
    invalidSequenceRunPayload: invalidSequenceRunPayload.status,
    invalidReindexIndexName: invalidReindexIndexName.status,
    invalidReindexJobKind: invalidReindexJobKind.status,
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

async function scenarioIngressAdapterOperatorFlows(harness) {
  const evidence = [];
  const token = harness.tokens.config.token;
  const runKey = harness.runId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const adapterKey = `api.mcp_operator_${runKey}`;

  await harness.mcpToolCall(token, "ingress.adapters.list", { providerType: "api" });
  await harness.mcpToolCall(token, "ingress.adapters.read", { adapterKey: "api.generic_json_mapping" });
  const fallbackReportBefore = await harness.mcpToolCall(token, "ingress.adapters.legacy_fallback_report", {});
  assert(
    fallbackReportBefore.totals && typeof fallbackReportBefore.totals === "object",
    "ingress.adapters.legacy_fallback_report must return totals."
  );
  assert(
    Array.isArray(fallbackReportBefore.channels),
    "ingress.adapters.legacy_fallback_report must include channel-level readiness evidence."
  );
  assert(
    Number(fallbackReportBefore.totals.lastRunLegacyConfigCount ?? 0) === 0,
    "Clean MCP ingress adapter scenario expects zero legacy_config fetch-run resolutions."
  );
  const created = await harness.mcpToolCall(token, "ingress.adapters.create_declarative", {
    payload: {
      adapterKey,
      providerType: "api",
      title: `MCP operator JSON API ${harness.runId}`,
      description: "Deterministic MCP coverage adapter.",
      outputMode: "articles",
      status: "draft",
      matchRules: { urlHostContains: ["example.com"], allowAutoSelect: false },
      configSchema: {},
      recipe: {
        request: { method: "GET" },
        response: { format: "json" },
        pagination: { mode: "none", maxPagesPerPoll: 1 },
        items: "items",
        map: { title: "title", url: "url", externalId: "id" },
      },
      metadata: { scenario: "ingress-adapter-operator-flows" },
    },
  });
  assert(created.created === true, "ingress.adapters.create_declarative must create a row.");
  await harness.mcpToolCall(token, "ingress.adapters.update_declarative", {
    adapterKey,
    payload: {
      title: `MCP operator JSON API ${harness.runId} updated`,
      status: "active",
      metadata: { scenario: "ingress-adapter-operator-flows", updated: true },
    },
  });
  await harness.mcpToolCall(token, "ingress.adapters.read", { adapterKey });

  const dryRun = await harness.mcpToolCall(token, "ingress.adapters.dry_run", {
    adapterKey: "website.generic_discovery",
    providerType: "website",
  });
  assert(dryRun.status === "unsupported", "Non-API dry-run should return unsupported without writes.");

  const channel = await harness.mcpToolCall(token, "channels.create", {
    payload: {
      providerType: "api",
      name: `MCP adapter channel ${harness.runId}`,
      fetchUrl: `https://example.com/${runKey}/items.json`,
      language: "en",
      isActive: true,
      itemsPath: "items",
      titleField: "title",
      urlField: "url",
      externalIdField: "id",
    },
  });
  const channelId = String(channel.channelId ?? channel.createdChannelIds?.[0] ?? "");
  assert(channelId, "channels.create must return a channel id for ingress adapter scenario.");

  harness.addCleanup("delete-ingress-adapter-operator-flow-rows", async () => {
    await harness.queryPostgres(`
      delete from source_channel_adapter_binding where channel_id = ${sqlLiteral(channelId)};
      delete from source_channels where channel_id = ${sqlLiteral(channelId)};
      delete from ingress_adapter_catalog where adapter_key = ${sqlLiteral(adapterKey)};
    `);
  });

  const initialBinding = await harness.mcpToolCall(token, "ingress.bindings.read", { channelId });
  await harness.mcpToolCall(token, "ingress.adapters.recommend_for_channel", { channelId });
  const bindingAfterRecommend = await harness.mcpToolCall(token, "ingress.bindings.read", { channelId });
  assert(
    initialBinding.adapter_key === bindingAfterRecommend.adapter_key ||
      initialBinding.adapterKey === bindingAfterRecommend.adapterKey,
    "ingress.adapters.recommend_for_channel must not mutate the current binding."
  );

  await harness.mcpToolCall(token, "ingress.bindings.set", {
    channelId,
    adapterKey,
    config: { maxItemsPerPoll: 3 },
    selectionMode: "mcp",
    selectionReason: "deterministic MCP operator scenario",
  });
  const updatedBinding = await harness.mcpToolCall(token, "ingress.bindings.read", { channelId });
  assert(
    updatedBinding.adapter_key === adapterKey || updatedBinding.adapterKey === adapterKey,
    "ingress.bindings.set must attach the requested adapter."
  );
  await harness.mcpToolCall(token, "ingress.bindings.delete", { channelId });

  pushEvidence(evidence, "adapter-key", adapterKey);
  pushEvidence(evidence, "channel-id", channelId);
  pushEvidence(evidence, "dry-run-status", dryRun.status);
  pushEvidence(evidence, "legacy-fallback-report-status", fallbackReportBefore.status);

  return {
    key: "ingress-adapter-operator-flows",
    summary: "Covered ingress adapter catalog, binding, recommendation, and dry-run MCP operator tools.",
    evidence,
  };
}

async function scenarioRequestLogAndAuditEvidence(harness) {
  const evidence = [];
  const analystTokenId = harness.tokens.analyst.tokenRecord.tokenId;
  const automationTokenId = harness.tokens.automation.tokenRecord.tokenId;
  const configTokenId = harness.tokens.config.tokenRecord.tokenId;
  const discoveryTokenId = harness.tokens.discovery.tokenRecord.tokenId;

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
    where token_id in ('${analystTokenId}', '${automationTokenId}', '${configTokenId}', '${discoveryTokenId}')
    order by created_at desc
    limit 40
  `);
  assert(requestRows, "mcp_request_log should contain rows for authenticated MCP activity.");

  const backend422Count = Number(
    firstResultLine(
      await harness.queryPostgres(`
        select count(*)::int
        from mcp_request_log
        where token_id in ('${analystTokenId}', '${automationTokenId}', '${configTokenId}', '${discoveryTokenId}')
          and success = false
          and coalesce(error_text, '') like '%422%'
      `)
    ) ?? 0
  );
  assert(
    backend422Count === 0,
    `Covered invalid MCP write scenarios should fail at MCP -32602 boundary, not backend 422; got ${backend422Count}.`
  );

  const auditRows = await harness.queryPostgres(`
    select action_type
    from audit_log
    where entity_type in (
      'mcp_access_token',
      'sequence',
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
  pushEvidence(evidence, "backend-422-errors", { coveredInvalidWriteScenarios: backend422Count });

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
    expectedNotYetExercisedCount: getUntestedShippedEntries(matrix).length,
    unexpectedNotYetExercisedCount: getUnexpectedUntestedShippedEntries(matrix).length,
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
  "discovery-vnext-full-flow": scenarioDiscoveryVnextFullFlow,
  "content-analysis-operator-flows": scenarioContentAnalysisOperatorFlows,
  "read-only-operator-needs": scenarioReadOnlyOperatorNeeds,
  "negative-scope-and-destructive-policy": scenarioNegativeScopeAndDestructivePolicy,
  "ingress-adapter-operator-flows": scenarioIngressAdapterOperatorFlows,
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
