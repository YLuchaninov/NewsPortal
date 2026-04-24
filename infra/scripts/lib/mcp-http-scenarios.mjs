import {
  mcpBaseUrl,
  extractFirstObjectRow,
  postJson,
  readIdentifier,
  waitFor,
} from "./mcp-http-testkit.mjs";
import {
  assertFullShippedCoverage,
  buildMcpDocParityMatrix,
} from "./mcp-http-doc-parity.mjs";

export const DETERMINISTIC_SCENARIO_ORDER = [
  "auth-and-token-lifecycle",
  "protocol-discovery",
  "template-interest-channel-flows",
  "sequence-operator-flows",
  "discovery-operator-flows",
  "read-only-operator-needs",
  "negative-scope-and-destructive-policy",
  "request-log-and-audit-evidence",
  "doc-parity-matrix",
];

export const DETERMINISTIC_SCENARIO_GROUPS = {
  auth: ["auth-and-token-lifecycle"],
  reads: ["protocol-discovery", "read-only-operator-needs", "doc-parity-matrix"],
  writes: [
    "template-interest-channel-flows",
    "sequence-operator-flows",
    "discovery-operator-flows",
    "negative-scope-and-destructive-policy",
    "request-log-and-audit-evidence",
  ],
  discovery: ["discovery-operator-flows", "read-only-operator-needs", "doc-parity-matrix"],
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readJsonRpcErrorMessage(payload) {
  return String(payload?.error?.message ?? payload?.error ?? "").trim();
}

function assertClientError(response, label) {
  assert(
    Number(response?.status ?? 0) >= 400 && Number(response?.status ?? 0) < 500,
    `${label} should fail with a 4xx client error, got ${response?.status ?? "unknown"}.`
  );
}

function normalizeStatus(value) {
  return String(value ?? "").trim().toLowerCase();
}

function hasContentArray(result) {
  return Array.isArray(result?.result?.contents) && result.result.contents.length > 0;
}

function buildPromptArguments(name, runId) {
  switch (name) {
    case "operator.session.start":
      return {
        objective: `review article residual diagnostics ${runId}`,
        domain: "article diagnostics",
      };
    case "sequences.session.plan":
      return {
        objective: `review deterministic sequence flows ${runId}`,
      };
    case "discovery.session.plan":
      return {
        objective: `review deterministic discovery flows ${runId}`,
      };
    case "system_interests.session.plan":
      return {
        topic: `operator residual tuning ${runId}`,
      };
    case "llm_templates.session.plan":
      return {
        templateIntent: `improve residual explainability guidance ${runId}`,
      };
    case "channels.session.plan":
      return {
        source: `deterministic source ${runId}`,
      };
    case "observability.session.plan":
      return {
        question: `why did deterministic MCP coverage change for ${runId}`,
      };
    case "system_interest.create":
      return {
        topic: `MCP operator monitoring ${runId}`,
        audience: "operators",
      };
    case "system_interest.polish":
      return {
        interestName: `Operator interest ${runId}`,
        residualPattern: "semantic_rejected repeated across explainable article residuals",
      };
    case "llm_template.tune":
      return {
        templateName: `Operator template ${runId}`,
        residualPattern: "llm_review_pending repeated in gray-zone article residuals",
      };
    case "discovery.profile.tune":
      return {
        profileName: `Operator profile ${runId}`,
        residualPattern: "gray_zone_hold repeated after recall-style candidate recovery",
      };
    case "discovery.mission.review":
      return {
        missionTitle: `Review live mission ${runId}`,
        goal: "find net-new high-signal sources",
      };
    case "sequence.draft":
      return {
        objective: `validate deterministic MCP matrix ${runId}`,
      };
    case "cleanup.guidance":
      return {
        scope: `deterministic MCP HTTP proof ${runId}`,
      };
    default:
      return {};
  }
}

function readRows(payload) {
  const row = extractFirstObjectRow(payload);
  if (!row) {
    return [];
  }
  const arrays = [];
  const visit = (value) => {
    if (!value || typeof value !== "object") {
      return;
    }
    if (Array.isArray(value)) {
      if (value.every((entry) => entry && typeof entry === "object" && !Array.isArray(entry))) {
        arrays.push(value);
      }
      for (const entry of value) {
        visit(entry);
      }
      return;
    }
    for (const nested of Object.values(value)) {
      visit(nested);
    }
  };
  visit(payload);
  return arrays[0] ?? [];
}

function readFirstRow(payload) {
  const rows = readRows(payload);
  return rows[0] ?? null;
}

function pushEvidence(evidence, label, details) {
  evidence.push({
    label,
    details,
  });
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
    candidateList = await harness.mcpToolCall(token, "discovery.candidates.list", {
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
  harness.rememberEntity(
    "sourceProfileId",
    String(promoted.source_profile_id ?? promoted.sourceProfileId ?? "")
  );

  await harness.mcpToolCall(token, "discovery.feedback.create", {
    payload: {
      missionId,
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

async function scenarioReadOnlyOperatorNeeds(harness) {
  const evidence = [];
  const token = harness.tokens.analyst.token;
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
  const resourceId = readIdentifier(firstWebResource, ["resource_id", "resourceId"]);
  if (resourceId) {
    await harness.mcpToolCall(token, "web_resources.read", {
      resourceId,
    });
  }

  const firstArticle = readFirstRow(articleList ?? {});
  const articleDocId = readIdentifier(firstArticle, ["doc_id", "docId"]);
  if (articleDocId) {
    await harness.mcpToolCall(token, "articles.read", {
      docId: articleDocId,
    });
    await harness.mcpToolCall(token, "articles.explain", {
      docId: articleDocId,
    });
  }

  const firstContentItem = readFirstRow(contentItemList ?? {});
  const contentItemId = readIdentifier(firstContentItem, ["content_item_id", "contentItemId"]);
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
      'discovery_recall_candidate'
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
