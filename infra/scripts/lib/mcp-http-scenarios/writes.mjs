import {
  mcpBaseUrl,
  postJson,
  waitFor,
  assert,
  firstResultLine,
  normalizeStatus,
  pushEvidence,
  readJsonRpcErrorMessage,
  sqlLiteral,
} from "./shared.mjs";

export async function scenarioTemplateInterestChannelFlows(harness) {
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
      interest.nextReadBack.resources.includes("signalops://ops/health"),
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

export async function scenarioSequenceOperatorFlows(harness) {
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
          module: "signal_candidate.normalize",
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
          module: "signal_candidate.normalize",
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
      from public.signal_candidates
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
             coalesce(options_json->>'replayExistingSignalCandidates', '') || '|' ||
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
    finalReindexReplayExistingSignalCandidates,
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
    finalReindexReplayExistingSignalCandidates === "true",
    "Backfill reindex job should replay existing signal_candidates by default."
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
          key: "normalize_missing_signal_candidate",
          module: "signal_candidate.normalize",
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
