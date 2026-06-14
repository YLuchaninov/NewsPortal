import {
  postJson,
  assert,
  firstResultLine,
  pushEvidence,
  readRows,
  sqlLiteral,
  readSourceInventoryScopeStatus,
  buildMcpScenarioApiUrl,
} from "./shared.mjs";

export async function scenarioDiscoveryOperatorFlows(harness) {
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
  const adminAction = await postJson(
    buildMcpScenarioApiUrl("/maintenance/discovery/source-inventory/action"),
    {
      sourceInventoryId,
      action: "confirm_scope",
      reason: "deterministic MCP/admin source scope smoke",
      createdBy: "mcp-http-scenarios",
    },
    { expectStatus: 200 }
  );
  assert(
    readSourceInventoryScopeStatus(adminAction?.json) === "confirmed",
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

export async function scenarioDiscoveryVnextFullFlow(harness) {
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
