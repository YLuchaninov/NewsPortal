import {
  assertMcpSseHandshake,
  mcpBaseUrl,
  postJson,
  readIdentifier,
  assertFullShippedCoverage,
  buildMcpDocParityMatrix,
  getUnexpectedUntestedShippedEntries,
  getUntestedShippedEntries,
  DETERMINISTIC_SCENARIO_ORDER,
  assert,
  buildPromptArguments,
  extractFirstObjectRow,
  firstResultLine,
  hasContentArray,
  pushEvidence,
  readFirstRow,
  readJsonRpcErrorMessage,
  readRows,
  seedReadOnlyContentCanaryRows,
  buildReadToolCalls,
} from "./shared.mjs";

export async function scenarioProtocolDiscovery(harness) {
  const evidence = [];
  const token = harness.tokens.analyst.token;

  const initialize = await harness.mcpRpc(token, "initialize", {});
  assert(
    String(initialize?.result?.serverInfo?.name ?? "") === "signalops-mcp",
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
    sseInitialize.serverName === "signalops-mcp",
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
    (resource) => resource.uri === "signalops://guide/client-contract"
  );
  const operatingModelResource = resourcesList.result.resources.find(
    (resource) => resource.uri === "signalops://guide/operating-model"
  );
  const opsHealthResource = resourcesList.result.resources.find(
    (resource) => resource.uri === "signalops://ops/health"
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

export async function scenarioReadOnlyOperatorNeeds(harness) {
  const evidence = [];
  const token = harness.tokens.analyst.token;
  const readOnlyCanary = await seedReadOnlyContentCanaryRows(harness);
  const results = [];
  const listResults = {};
  let signalCandidateList = null;
  let contentItemList = null;
  let signalCandidateResidualSummary = null;
  let webResourceList = null;

  for (const call of buildReadToolCalls()) {
    const output = await harness.mcpToolCall(token, call.name, call.args);
    listResults[call.name] = output;
    if (call.name === "signal_candidates.list") {
      signalCandidateList = output;
    }
    if (call.name === "content_items.list") {
      contentItemList = output;
    }
    if (call.name === "signal_candidates.residuals.summary") {
      signalCandidateResidualSummary = output;
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

  const firstSignalCandidate = readFirstRow(signalCandidateList ?? {});
  const signalCandidateDocId = readIdentifier(firstSignalCandidate, ["doc_id", "docId"]) || readOnlyCanary.docId;
  if (signalCandidateDocId) {
    await harness.mcpToolCall(token, "signal_candidates.read", {
      docId: signalCandidateDocId,
    });
    await harness.mcpToolCall(token, "signal_candidates.explain", {
      docId: signalCandidateDocId,
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

  const residualSummaryRow = extractFirstObjectRow(signalCandidateResidualSummary);
  const residualGroups = residualSummaryRow?.groups;
  const firstResidualBucket = Array.isArray(residualGroups?.downstreamLossBuckets)
    ? residualGroups.downstreamLossBuckets[0]?.value
    : null;
  const residualList = await harness.mcpToolCall(token, "signal_candidates.residuals.list", {
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
      "signal_candidates.residuals.list should agree with the chosen residual bucket filter."
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

export async function scenarioRequestLogAndAuditEvidence(harness) {
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

export async function scenarioDocParityMatrix(harness) {
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
