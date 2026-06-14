import process from "node:process";

import {
  createHarness,
  createLogger,
  readEnvFile,
} from "../lib/mcp-http-testkit.mjs";

const log = createLogger("discovery-vnext-mcp-live-gap");

const SCENARIO_PACKS = [
  {
    key: "public_procurement",
    name: "Public procurement source discovery",
    description: "Find public procurement notices, tenders, RFPs and public contract opportunity sources.",
    geographies: ["global"],
    languages: ["en", "es", "fr", "de", "pt", "pl", "nl", "it"],
    positiveTexts: [
      "public tender software implementation",
      "request for proposal digital services",
      "procurement notice technology contract",
      "contract award software development",
    ],
    negativeTexts: [
      "vendor marketing page without a buyer notice",
      "generic procurement advice signal_candidate",
      "job advertisement without contract or buyer evidence",
    ],
    candidatePositiveSignals: [
      "buyer_notice: public tender, RFP, RFQ, procurement notice, call for bids",
      "contract_evidence: buyer organization, deadline, scope, budget, procurement portal",
    ],
    candidateNegativeSignals: [
      "vendor_promo: agency services page, SEO signal_candidate, generic market report",
      "employment_only: job opening without buying or project evidence",
    ],
  },
  {
    key: "security_advisories",
    name: "Security advisory source discovery",
    description: "Find official security advisory, CVE, urgent patch and incident-response update sources.",
    geographies: ["global"],
    languages: ["en", "ja", "ko", "de", "fr"],
    positiveTexts: [
      "security advisory critical vulnerability patch",
      "CVE emergency update vendor advisory",
      "incident response mitigation bulletin",
      "official product security release notes",
    ],
    negativeTexts: [
      "SEO vulnerability explainer without official advisory",
      "generic cybersecurity opinion",
      "training course promotion",
    ],
    candidatePositiveSignals: [
      "official_advisory: CVE, severity, affected versions, mitigation, patch",
      "freshness: published advisory, updated bulletin, emergency release",
    ],
    candidateNegativeSignals: [
      "commentary_only: news summary without primary advisory link",
      "sales_page: product pitch without vulnerability details",
    ],
  },
  {
    key: "policy_regulatory",
    name: "Policy regulatory source discovery",
    description: "Find regulator updates, compliance deadlines, consultations and policy implementation sources.",
    geographies: ["global"],
    languages: ["en", "es", "fr", "de", "pt", "pl", "nl", "it"],
    positiveTexts: [
      "regulator consultation compliance deadline",
      "policy implementation guidance official update",
      "regulatory notice public consultation",
      "compliance requirement enforcement timeline",
    ],
    negativeTexts: [
      "law firm marketing without primary regulatory source",
      "generic policy commentary",
      "event invitation without regulatory update",
    ],
    candidatePositiveSignals: [
      "regulator_source: agency notice, consultation, guidance, deadline, enforcement date",
      "implementation_signal: compliance obligation, public comment period, official document",
    ],
    candidateNegativeSignals: [
      "secondary_commentary: consultant blog without official citation",
      "event_only: webinar or conference page without policy update",
    ],
  },
  {
    key: "research_grants",
    name: "Research grants source discovery",
    description: "Find grants, calls for proposals, funded-program opportunities and research funding sources.",
    geographies: ["global"],
    languages: ["en", "es", "fr", "de", "pt", "pl", "it"],
    positiveTexts: [
      "call for proposals research grant",
      "funding opportunity innovation program",
      "grant application deadline research",
      "funded program call applicants",
    ],
    negativeTexts: [
      "grant writing service advertisement",
      "old closed call archive",
      "generic university news without application opportunity",
    ],
    candidatePositiveSignals: [
      "funding_call: eligibility, application deadline, grant amount, call documents",
      "program_source: official funder, university, agency, foundation, research portal",
    ],
    candidateNegativeSignals: [
      "service_vendor: consulting or grant-writing promotion",
      "expired_only: closed call with no current opportunity",
    ],
  },
  {
    key: "software_changelogs",
    name: "Software changelog source discovery",
    description: "Find release notes, deprecations, breaking changes, migration notices and changelog sources.",
    geographies: ["global"],
    languages: ["en", "ja", "ko", "de", "fr"],
    positiveTexts: [
      "release notes breaking change migration",
      "deprecation notice changelog",
      "upgrade guide removed API",
      "product changelog migration deadline",
    ],
    negativeTexts: [
      "marketing launch blog without technical change",
      "generic tutorial",
      "third-party roundup without primary changelog",
    ],
    candidatePositiveSignals: [
      "primary_changelog: release notes, version, breaking change, deprecated API, migration guide",
      "operator_signal: deadline, removal, upgrade requirement, compatibility impact",
    ],
    candidateNegativeSignals: [
      "marketing_only: feature announcement without operator action",
      "tutorial_only: how-to signal_candidate without source release note",
    ],
  },
];

const REQUIRED_TOOLS = [
  "operator.funnel.audit",
  "operator.funnel.autoplan",
  "operator.funnel.iteration.recommend",
  "operator.report.verify",
  "operator.system.health",
  "operator.effect.verify",
  "discovery.source_families.coverage",
  "system_interests.create",
  "system_interests.read",
  "system_interests.list",
  "system_interests.compile_status.list",
  "llm_templates.list",
  "discovery.runs.execute",
  "discovery.runs.read",
  "discovery.run_steps.list",
  "discovery.query_attempts.list",
  "discovery.llm_gateway_events.list",
  "discovery.artifacts.list",
  "discovery.candidates.list",
  "discovery.probe.plan_preview",
  "discovery.probe.execute",
  "discovery.scope.resolve_preview",
  "discovery.scope.resolve_apply",
  "discovery.understand.preview",
  "discovery.routing.apply",
  "discovery.probation.handoff",
  "discovery.source_inventory.list",
  "discovery.monitoring_state.list",
  "discovery.source_observations.list",
  "discovery.adapter_backlog.list",
  "discovery.replay.start",
  "discovery.feedback.submit",
];

const REQUIRED_RESOURCES = [
  "signalops://guide/scenarios/discovery-live-gap-hunting",
  "signalops://guide/scenarios/discovery",
  "signalops://guide/scenarios/funnel-calibration",
  "signalops://guide/operating-model",
];

const REQUIRED_PROMPTS = [
  "discovery.live_gap_hunting.plan",
  "discovery.session.plan",
  "operator.funnel.calibrate",
];

function parseArgs(argv) {
  return {
    preflightOnly: argv.includes("--preflight-only"),
    skipBuild: argv.includes("--skip-build"),
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function configuredValue(env, key) {
  const value = String(process.env[key] ?? env[key] ?? "").trim();
  return Boolean(value && value !== "replace-me" && value !== "{}");
}

function envValue(env, key, fallback = "") {
  return String(process.env[key] ?? env[key] ?? fallback).trim();
}

function rows(payload) {
  return Array.isArray(payload?.items) ? payload.items : [];
}

function truncateText(value, maxLength = 180) {
  const text = String(value ?? "").replace(/\s+/gu, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
}

function markdownText(value) {
  return truncateText(value).replace(/\|/gu, "\\|");
}

function recordGap(report, type, message, context = {}) {
  const gap = {
    type,
    message,
    context,
    at: new Date().toISOString(),
  };
  report.gaps.push(gap);
  log(`${type}: ${message}`);
  return gap;
}

function classifyError(error, fallbackType = "runtime_gap") {
  const text = `${error?.message ?? error ?? ""} ${JSON.stringify(error?.mcpDiagnostics ?? {})}`.toLowerCase();
  if (/unknown mcp tool|unknown mcp resource|not found|unsupported.*tool|unsupported.*resource/u.test(text)) {
    return "missing_mcp_surface";
  }
  if (/schema validation|invalid arguments|additionalproperties|payload|expectedshape/u.test(text)) {
    return "schema_gap";
  }
  if (/policy|budget|discovery_enabled|live execution requires|permission|scope/u.test(text)) {
    return "policy_gap";
  }
  if (/provider|ddgs|search|network|timeout|captcha|403|429|fetch failed|enotfound|econn/u.test(text)) {
    return "provider_gap";
  }
  if (/did not return|diagnostic|structuredcontent|explain/u.test(text)) {
    return "diagnostic_gap";
  }
  return fallbackType;
}

function summarizeError(error) {
  return {
    message: error instanceof Error ? error.message : String(error),
    name: error?.name ?? null,
    diagnostics: error?.mcpDiagnostics ?? null,
  };
}

async function safeMcp(report, label, fn, fallbackType = "runtime_gap") {
  try {
    const result = await fn();
    report.events.push({ label, status: "ok", at: new Date().toISOString() });
    return result;
  } catch (error) {
    recordGap(report, classifyError(error, fallbackType), `${label} failed`, summarizeError(error));
    report.events.push({ label, status: "failed", at: new Date().toISOString() });
    return null;
  }
}

function idFrom(value, keys) {
  if (!value || typeof value !== "object") {
    return "";
  }
  for (const key of keys) {
    const normalized = String(value[key] ?? "").trim();
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function valueFrom(value, keys) {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  for (const key of keys) {
    if (value[key] != null) {
      return value[key];
    }
  }
  return undefined;
}

function rowRunId(row) {
  return String(valueFrom(row, ["vnext_run_id", "vnextRunId", "run_id", "runId"]) ?? "");
}

function rowInterestId(row) {
  return String(valueFrom(row, ["interest_id", "interestId"]) ?? "");
}

function artifactType(row) {
  return String(valueFrom(row, ["artifact_type", "artifactType"]) ?? "");
}

function payloadJson(row) {
  const payload = valueFrom(row, ["payload_json", "payloadJson", "payload"]);
  return payload && typeof payload === "object" ? payload : {};
}

function canonicalUrl(row) {
  return String(valueFrom(row, ["canonical_url", "canonicalUrl", "sourceUrl", "url"]) ?? "");
}

function canonicalDomain(row) {
  const explicit = String(valueFrom(row, ["canonical_domain", "canonicalDomain"]) ?? "").trim();
  if (explicit) {
    return explicit;
  }
  try {
    return new URL(canonicalUrl(row)).hostname;
  } catch {
    return "";
  }
}

function queryText(row) {
  const attempt = valueFrom(row, ["attempt_json", "attemptJson"]);
  return String(valueFrom(row, ["query_text", "queryText", "query"]) ?? attempt?.query ?? "");
}

function queryProvider(row) {
  const attempt = valueFrom(row, ["attempt_json", "attemptJson"]);
  return String(valueFrom(row, ["provider", "provider_name", "providerName"]) ?? attempt?.provider ?? "");
}

function queryResultCount(row) {
  const attempt = valueFrom(row, ["attempt_json", "attemptJson"]);
  return Number(valueFrom(row, ["result_count", "resultCount"]) ?? attempt?.result_count ?? 0);
}

function liveAttempt(row) {
  return valueFrom(row, ["live_provider_execution", "liveProviderExecution"]) === true;
}

function statusOf(row) {
  return String(valueFrom(row, ["status"]) ?? "").toLowerCase();
}

function candidateEvidence(row) {
  const acquisition = valueFrom(row, ["acquisition_json", "acquisitionJson", "acquisitionEvidence"]);
  const paths = Array.isArray(acquisition?.paths) ? acquisition.paths : [];
  return paths[0] && typeof paths[0] === "object" ? paths[0] : {};
}

function positiveTokens(pack) {
  const stopwords = new Set(["about", "after", "call", "from", "into", "with", "without"]);
  const tokens = [];
  for (const text of pack.positiveTexts ?? []) {
    for (const token of String(text).toLowerCase().match(/[a-z][a-z0-9_-]{4,}/gu) ?? []) {
      if (!stopwords.has(token) && !tokens.includes(token)) {
        tokens.push(token);
      }
    }
  }
  return tokens;
}

function candidateMatchesPositiveCue(candidate, tokens) {
  const evidence = candidateEvidence(candidate);
  const haystack = [
    canonicalUrl(candidate),
    canonicalDomain(candidate),
    evidence.title,
    evidence.snippet,
  ]
    .join(" ")
    .toLowerCase();
  return tokens.some((token) => haystack.includes(token));
}

function buildInterestPayload(pack, namespace) {
  return {
    name: `${pack.name} [${namespace}]`,
    description: `${pack.description} Domain-neutral live MCP gap-hunting proof pack ${pack.key}.`,
    positive_texts: pack.positiveTexts,
    negative_texts: pack.negativeTexts,
    must_have_terms: "",
    must_not_have_terms: [
      "generic marketing page without primary evidence",
      "job-only page without source signal",
      "stale archive without current update",
    ],
    places: pack.geographies,
    languages_allowed: pack.languages,
    time_window_hours: 24 * 365,
    allowed_content_kinds: ["editorial", "listing", "document"],
    short_tokens_required: "",
    short_tokens_forbidden: "",
    candidate_positive_signals: pack.candidatePositiveSignals,
    candidate_negative_signals: pack.candidateNegativeSignals,
    selection_profile_strictness: "balanced",
    selection_profile_unresolved_decision: "hold",
    selection_profile_llm_review_mode: "optional_high_value_only",
    priority: "0.75",
    isActive: true,
  };
}

function buildMarkdown(report) {
  const lines = [
    `# Discovery vNext MCP Live Gap Flow ${report.runId}`,
    "",
    `- status: ${report.status}`,
    `- startedAt: ${report.startedAt}`,
    `- finishedAt: ${report.finishedAt}`,
    `- preflightOnly: ${report.preflightOnly}`,
    `- operatorPath: MCP-only product actions`,
    "",
    "## Artifacts",
    "",
    `- JSON: ${report.artifacts?.jsonPath ?? "pending"}`,
    `- Markdown: ${report.artifacts?.mdPath ?? "pending"}`,
    "",
    "## Scenario Packs",
    "",
    ...report.packs.map((pack) => {
      const candidateCount = pack.candidates?.length ?? 0;
      const attemptCount = pack.queryAttempts?.length ?? 0;
      return `- ${pack.key}: ${pack.status}; run=${pack.runId ?? "n/a"}; candidates=${candidateCount}; queryAttempts=${attemptCount}; artifacts=${(pack.artifactTypes ?? []).join(", ") || "none"}`;
    }),
    "",
    "## Live Evidence",
    "",
    ...report.packs.flatMap((pack) => {
      const queryLines = (pack.queryAttempts ?? []).slice(0, 6).map((attempt) => {
        const live = liveAttempt(attempt) ? "live" : "not-live";
        return `- query: \`${markdownText(queryText(attempt), 220)}\`; provider=${markdownText(queryProvider(attempt) || "unknown")}; status=${markdownText(statusOf(attempt) || "unknown")}; ${live}; results=${queryResultCount(attempt)}`;
      });
      const candidateLines = (pack.candidates ?? []).slice(0, 5).map((candidate) => {
        const evidence = candidateEvidence(candidate);
        return `- ${markdownText(canonicalDomain(candidate) || "unknown")}: ${markdownText(evidence.title || canonicalUrl(candidate), 160)} (${markdownText(canonicalUrl(candidate), 220)})`;
      });
      return [
        `### ${pack.key}`,
        "",
        `- positiveCueMatchesTop${pack.candidateQuality?.topCandidateWindow ?? 0}: ${pack.candidateQuality?.positiveCueMatches ?? "n/a"}`,
        "",
        "**Queries**",
        "",
        ...(queryLines.length ? queryLines : ["- none"]),
        "",
        "**Top Candidates**",
        "",
        ...(candidateLines.length ? candidateLines : ["- none"]),
        "",
      ];
    }),
    "## LLM Gateway",
    "",
    `- status: ${report.llmGateway?.status ?? "not-run"}`,
    `- eventId: ${report.llmGateway?.eventId ?? "n/a"}`,
    "",
    "## Gaps",
    "",
    ...(report.gaps.length
      ? report.gaps.map((gap) => `- ${gap.type}: ${gap.message}`)
      : ["- none"]),
    "",
    "## Recommended Follow-Up",
    "",
    ...(report.recommendedFollowUp.length
      ? report.recommendedFollowUp.map((item) => `- ${item}`)
      : ["- No follow-up recorded."]),
  ];
  return lines.join("\n");
}

function validateLiveEnv(report, env) {
  const failures = [];
  if (envValue(env, "DISCOVERY_ENABLED") !== "1") {
    failures.push("DISCOVERY_ENABLED=1 is required.");
  }
  if (Number(envValue(env, "DISCOVERY_MCP_LIVE_GAP_MAX_COST_CENTS", "0")) <= 0) {
    failures.push("DISCOVERY_MCP_LIVE_GAP_MAX_COST_CENTS must be a positive integer.");
  }
  if (!configuredValue(env, "DISCOVERY_SEARCH_PROVIDER")) {
    failures.push("DISCOVERY_SEARCH_PROVIDER is required.");
  }
  const provider = envValue(env, "DISCOVERY_SEARCH_PROVIDER");
  if (provider === "brave" && !configuredValue(env, "DISCOVERY_BRAVE_API_KEY")) {
    failures.push("DISCOVERY_BRAVE_API_KEY is required when DISCOVERY_SEARCH_PROVIDER=brave.");
  }
  if (provider === "serper" && !configuredValue(env, "DISCOVERY_SERPER_API_KEY")) {
    failures.push("DISCOVERY_SERPER_API_KEY is required when DISCOVERY_SEARCH_PROVIDER=serper.");
  }
  if (!configuredValue(env, "DISCOVERY_GEMINI_API_KEY") && !configuredValue(env, "GEMINI_API_KEY")) {
    failures.push("DISCOVERY_GEMINI_API_KEY or GEMINI_API_KEY is required for live LLM gateway proof.");
  }
  if (!configuredValue(env, "DISCOVERY_GEMINI_MODEL") && !configuredValue(env, "GEMINI_MODEL")) {
    failures.push("DISCOVERY_GEMINI_MODEL or GEMINI_MODEL is required.");
  }
  if (!configuredValue(env, "DISCOVERY_GEMINI_BASE_URL") && !configuredValue(env, "GEMINI_BASE_URL")) {
    failures.push("DISCOVERY_GEMINI_BASE_URL or GEMINI_BASE_URL is required.");
  }
  for (const failure of failures) {
    recordGap(report, "policy_gap", failure, { phase: "env-preflight" });
  }
  return failures.length === 0;
}

async function runProtocolPreflight(harness, token, report) {
  const initialize = await harness.mcpRpc(token, "initialize", {});
  assert(String(initialize?.result?.serverInfo?.name ?? "") === "signalops-mcp", "MCP initialize failed.");
  const toolsList = await harness.mcpRpc(token, "tools/list", {});
  const resourcesList = await harness.mcpRpc(token, "resources/list", {});
  const promptsList = await harness.mcpRpc(token, "prompts/list", {});
  const toolNames = new Set((toolsList?.result?.tools ?? []).map((tool) => String(tool.name)));
  const resourceUris = new Set((resourcesList?.result?.resources ?? []).map((resource) => String(resource.uri)));
  const promptNames = new Set((promptsList?.result?.prompts ?? []).map((prompt) => String(prompt.name)));

  for (const tool of REQUIRED_TOOLS) {
    if (!toolNames.has(tool)) {
      recordGap(report, "missing_mcp_surface", `Required MCP tool is missing: ${tool}`);
    }
  }
  for (const uri of REQUIRED_RESOURCES) {
    if (!resourceUris.has(uri)) {
      recordGap(report, "missing_mcp_surface", `Required MCP resource is missing: ${uri}`);
    }
  }
  for (const prompt of REQUIRED_PROMPTS) {
    if (!promptNames.has(prompt)) {
      recordGap(report, "missing_mcp_surface", `Required MCP prompt is missing: ${prompt}`);
    }
  }

  report.preflight.inventory = {
    tools: toolNames.size,
    resources: resourceUris.size,
    prompts: promptNames.size,
  };
}

async function readGuidance(harness, token, report) {
  for (const uri of REQUIRED_RESOURCES) {
    await safeMcp(report, `resources/read ${uri}`, () => harness.mcpResourceRead(token, uri), "missing_mcp_surface");
  }
  for (const prompt of REQUIRED_PROMPTS) {
    await safeMcp(
      report,
      `prompts/get ${prompt}`,
      () =>
        harness.mcpPromptGet(token, prompt, {
          objective: "domain-neutral Discovery vNext live MCP gap hunting",
          referenceEvidence: "Live MCP gap-hunting scenario pack",
          referenceEvidenceKind: "portable_funnel_guidance",
          currentGap: "unknown live operator-flow gaps",
          scenarioPacks: SCENARIO_PACKS.map((pack) => pack.key).join(", "),
          budget: `max ${report.maxCostCents} cents`,
        }),
      "missing_mcp_surface"
    );
  }

  const audit = await safeMcp(
    report,
    "operator.funnel.audit",
    () =>
      harness.mcpToolCall(token, "operator.funnel.audit", {
        objective: "domain-neutral Discovery vNext live gap hunting",
        referenceEvidenceKind: "portable_funnel_guidance",
        referenceText: "Exercise public procurement, security advisories, policy regulatory, research grants and software changelog source discovery.",
        includeDiscovery: true,
        includeSamples: false,
      }),
    "diagnostic_gap"
  );
  const autoplan = await safeMcp(
    report,
    "operator.funnel.autoplan",
    () =>
      harness.mcpToolCall(token, "operator.funnel.autoplan", {
        objective: "domain-neutral Discovery vNext live gap hunting",
        rareSignal: true,
        maxNewChannels: 25,
        includeSamples: false,
      }),
    "diagnostic_gap"
  );
  const iteration = await safeMcp(
    report,
    "operator.funnel.iteration.recommend",
    () =>
      harness.mcpToolCall(token, "operator.funnel.iteration.recommend", {
        objective: "domain-neutral Discovery vNext live gap hunting",
        includeSamples: false,
      }),
    "diagnostic_gap"
  );
  const coverage = await safeMcp(
    report,
    "discovery.source_families.coverage",
    () => harness.mcpToolCall(token, "discovery.source_families.coverage", { includeExamples: false }),
    "missing_mcp_surface"
  );
  const balance = await safeMcp(
    report,
    "operator.report.verify source_family_balance",
    () =>
      harness.mcpToolCall(token, "operator.report.verify", {
        reportKind: "source_family_balance",
        entityIds: {},
        includeSamples: false,
      }),
    "diagnostic_gap"
  );
  report.bestPractices = {
    auditRecommendedActions: audit?.recommendedMcpActions ?? [],
    autoplanRecommendedActions: autoplan?.recommendedMcpActions ?? [],
    iterationNextAction: iteration?.nextAction ?? null,
    coverageRisks: coverage?.risks ?? [],
    sourceFamilyBalanceRisks: balance?.counts?.risks ?? [],
  };
}

async function proveFailClosed(harness, token, report) {
  const response = await harness.mcpToolCall(
    token,
    "discovery.runs.execute",
    {
      runKind: "candidate_acquisition",
      triggerKind: "mcp",
      request: {
        interest: {
          interestId: `fail-closed-${report.runId}`,
          name: "Fail closed live proof",
          description: "This call must fail because maxRunCostCents is zero.",
        },
        maxBatches: 1,
      },
      budget: { maxRunCostCents: 0 },
      liveProviderExecution: true,
      createdBy: `discovery-live-gap:${report.runId}`,
    },
    { expectError: true }
  );
  const message = String(response?.error?.message ?? "");
  if (!response?.error || !/budget|live execution requires|DISCOVERY_ENABLED/i.test(message)) {
    recordGap(report, "policy_gap", "Live fail-closed proof did not return the expected budget/runtime error.", {
      response,
    });
  } else {
    report.preflight.failClosed = { ok: true, message };
  }
}

async function createInterests(harness, token, report) {
  const namespace = `live-mcp-gap-${report.runId.slice(0, 8)}`;
  for (const pack of SCENARIO_PACKS) {
    const payload = buildInterestPayload(pack, namespace);
    const created = await safeMcp(
      report,
      `system_interests.create ${pack.key}`,
      () => harness.mcpToolCall(token, "system_interests.create", { payload }),
      "schema_gap"
    );
    const interestTemplateId = idFrom(created, ["entityId", "interestTemplateId", "systemInterestId", "interestId"]);
    if (!interestTemplateId) {
      recordGap(report, "runtime_gap", `system_interests.create did not return an id for ${pack.key}`, { created });
      report.packs.push({ key: pack.key, status: "interest_create_failed", gaps: ["runtime_gap"] });
      continue;
    }
    const readBack = await safeMcp(
      report,
      `system_interests.read ${pack.key}`,
      () => harness.mcpToolCall(token, "system_interests.read", { interestTemplateId }),
      "diagnostic_gap"
    );
    report.packs.push({
      key: pack.key,
      status: "interest_created",
      interestTemplateId,
      interestReadBack: Boolean(readBack),
      candidates: [],
      queryAttempts: [],
      artifacts: [],
      artifactTypes: [],
    });
  }
  await safeMcp(
    report,
    "system_interests.compile_status.list",
    () => harness.mcpToolCall(token, "system_interests.compile_status.list", { includeInactive: false, includeSamples: false }),
    "diagnostic_gap"
  );
  await safeMcp(
    report,
    "llm_templates.list",
    () => harness.mcpToolCall(token, "llm_templates.list", { page: 1, pageSize: 20 }),
    "diagnostic_gap"
  );
  report.bestPractices.llmTemplateMutation = "not_applied: no pre-execution MCP recommendation required a template write";
}

async function listDiscoveryDiagnostics(harness, token, report, runId, interestTemplateId) {
  const [
    runSteps,
    queryAttempts,
    llmEvents,
    artifacts,
    candidates,
    inventory,
    monitoring,
    observations,
    adapterBacklog,
    rollbackGroups,
  ] = await Promise.all([
    safeMcp(report, `discovery.run_steps.list ${runId}`, () => harness.mcpToolCall(token, "discovery.run_steps.list", { page: 1, pageSize: 100 })),
    safeMcp(report, `discovery.query_attempts.list ${runId}`, () => harness.mcpToolCall(token, "discovery.query_attempts.list", { page: 1, pageSize: 100 })),
    safeMcp(report, `discovery.llm_gateway_events.list ${runId}`, () => harness.mcpToolCall(token, "discovery.llm_gateway_events.list", { page: 1, pageSize: 100 })),
    safeMcp(report, `discovery.artifacts.list ${runId}`, () =>
      harness.mcpToolCall(token, "discovery.artifacts.list", { page: 1, pageSize: 100, interestId: interestTemplateId })),
    safeMcp(report, `discovery.candidates.list ${runId}`, () =>
      harness.mcpToolCall(token, "discovery.candidates.list", { page: 1, pageSize: 100, interestId: interestTemplateId })),
    safeMcp(report, `discovery.source_inventory.list ${runId}`, () => harness.mcpToolCall(token, "discovery.source_inventory.list", { page: 1, pageSize: 100 })),
    safeMcp(report, `discovery.monitoring_state.list ${runId}`, () => harness.mcpToolCall(token, "discovery.monitoring_state.list", { page: 1, pageSize: 100 })),
    safeMcp(report, `discovery.source_observations.list ${runId}`, () => harness.mcpToolCall(token, "discovery.source_observations.list", { page: 1, pageSize: 100 })),
    safeMcp(report, `discovery.adapter_backlog.list ${runId}`, () => harness.mcpToolCall(token, "discovery.adapter_backlog.list", { page: 1, pageSize: 100 })),
    safeMcp(report, `discovery.rollback_groups.list ${runId}`, () => harness.mcpToolCall(token, "discovery.rollback_groups.list", { page: 1, pageSize: 100 })),
  ]);
  return {
    runSteps: rows(runSteps).filter((row) => rowRunId(row) === runId),
    queryAttempts: rows(queryAttempts).filter((row) => rowRunId(row) === runId),
    llmEvents: rows(llmEvents).filter((row) => rowRunId(row) === runId),
    artifacts: rows(artifacts).filter((row) => rowRunId(row) === runId || rowInterestId(row) === interestTemplateId),
    candidates: rows(candidates).filter((row) => rowRunId(row) === runId || rowInterestId(row) === interestTemplateId),
    inventory: rows(inventory).filter((row) => rowRunId(row) === runId || rowInterestId(row) === interestTemplateId),
    monitoring: rows(monitoring),
    observations: rows(observations).filter((row) => rowRunId(row) === runId),
    adapterBacklog: rows(adapterBacklog).filter((row) => rowRunId(row) === runId || rowInterestId(row) === interestTemplateId),
    rollbackGroups: rows(rollbackGroups),
  };
}

async function probeAndRouteCandidate(harness, token, report, packReport, discoveryBrief, candidate) {
  const candidateUrl = canonicalUrl(candidate);
  if (!candidateUrl) {
    recordGap(report, "runtime_gap", `Candidate for ${packReport.key} has no canonical URL.`, { candidate });
    return;
  }
  const candidateId = idFrom(candidate, ["candidate_id", "candidateId"]);
  const probePlan = await safeMcp(
    report,
    `discovery.probe.plan_preview ${packReport.key}`,
    () =>
      harness.mcpToolCall(token, "discovery.probe.plan_preview", {
        candidateUrl,
        candidateKindGuess: String(valueFrom(candidate, ["candidate_kind_guess", "candidateKindGuess"]) ?? "unknown"),
      }),
    "schema_gap"
  );
  const probePlanPayload = probePlan?.payload ?? probePlan;
  if (!probePlanPayload) {
    return;
  }
  const probe = await safeMcp(
    report,
    `discovery.probe.execute ${packReport.key}`,
    () =>
      harness.mcpToolCall(token, "discovery.probe.execute", {
        probePlan: probePlanPayload,
        runId: packReport.runId,
        interestId: packReport.interestTemplateId,
        candidateId,
        createdBy: `discovery-live-gap:${report.runId}`,
      }),
    "provider_gap"
  );
  const probeReport = probe?.probeReportArtifact?.payload_json ?? probe?.probeReportArtifact?.payloadJson;
  if (!probeReport) {
    recordGap(report, "diagnostic_gap", `Probe did not return a ProbeReport payload for ${packReport.key}.`, { probe });
    return;
  }
  const scope = await safeMcp(
    report,
    `discovery.scope.resolve_apply ${packReport.key}`,
    () =>
      harness.mcpToolCall(token, "discovery.scope.resolve_apply", {
        discoveryBrief,
        probeReport,
        candidate: {
          candidateId,
          canonicalUrl: candidateUrl,
          canonicalDomain: canonicalDomain(candidate),
          candidateKindGuess: String(valueFrom(candidate, ["candidate_kind_guess", "candidateKindGuess"]) ?? "unknown"),
        },
        runId: packReport.runId,
        interestId: packReport.interestTemplateId,
        candidateId,
        createdBy: `discovery-live-gap:${report.runId}`,
      }),
    "schema_gap"
  );
  const sourceScopeResolutionArtifact = scope?.sourceScopeResolutionArtifact ?? {};
  const sourceScopeResolution =
    sourceScopeResolutionArtifact.payload_json ??
    sourceScopeResolutionArtifact.payloadJson ??
    sourceScopeResolutionArtifact.payload ??
    scope?.payload ??
    scope;
  const sourceScopeResolutionArtifactId = idFrom(sourceScopeResolutionArtifact, ["artifact_id", "artifactId"]);
  if (sourceScopeResolutionArtifactId && sourceScopeResolution && typeof sourceScopeResolution === "object") {
    sourceScopeResolution.sourceScopeResolutionArtifactId = sourceScopeResolutionArtifactId;
  }
  const understanding = await safeMcp(
    report,
    `discovery.understand.preview ${packReport.key}`,
    () =>
      harness.mcpToolCall(token, "discovery.understand.preview", {
        discoveryBrief,
        probeReport,
        sourceScopeResolution,
        candidate: {
          candidateId,
          canonicalUrl: candidateUrl,
          canonicalDomain: canonicalDomain(candidate),
          candidateKindGuess: String(valueFrom(candidate, ["candidate_kind_guess", "candidateKindGuess"]) ?? "unknown"),
        },
      }),
    "schema_gap"
  );
  const sourceUnderstanding =
    understanding?.payload ?? understanding?.sourceUnderstanding?.payload ?? understanding?.sourceUnderstanding ?? understanding;
  if (!sourceUnderstanding) {
    return;
  }
  if (sourceScopeResolutionArtifactId && sourceUnderstanding && typeof sourceUnderstanding === "object") {
    sourceUnderstanding.sourceScopeResolutionArtifactId ??= sourceScopeResolutionArtifactId;
  }
  const operationalUrl = String(sourceScopeResolution?.resolvedSourceUrl ?? sourceUnderstanding.sourceUrl ?? candidateUrl);
  const routing = await safeMcp(
    report,
    `discovery.routing.apply ${packReport.key}`,
    () =>
      harness.mcpToolCall(token, "discovery.routing.apply", {
        sourceUnderstanding,
        canonicalUrl: operationalUrl,
        canonicalDomain: canonicalDomain(candidate),
        sourceIdentityKey: `${String(sourceUnderstanding.suggestedProviderType ?? valueFrom(candidate, ["candidate_kind_guess", "candidateKindGuess"]) ?? "unknown")}|${canonicalDomain(candidate)}|${operationalUrl}`,
        providerType: String(sourceUnderstanding.suggestedProviderType ?? valueFrom(candidate, ["candidate_kind_guess", "candidateKindGuess"]) ?? "unknown"),
        accessPattern: String(sourceUnderstanding.accessPattern ?? "public"),
        runId: packReport.runId,
        interestId: packReport.interestTemplateId,
        candidateId,
        createdBy: `discovery-live-gap:${report.runId}`,
      }),
    "runtime_gap"
  );
  const sourceInventoryId = idFrom(routing?.sourceInventory, ["source_inventory_id", "sourceInventoryId"]);
  const routingDecision =
    routing?.routingDecisionArtifact?.payload_json ?? routing?.routingDecisionArtifact?.payloadJson ?? routing?.routingDecision;
  packReport.routing = {
    sourceInventoryId,
    decision: routingDecision?.decision ?? null,
  };
  if (sourceInventoryId) {
    await safeMcp(
      report,
      `discovery.source_inventory.read ${packReport.key}`,
      () => harness.mcpToolCall(token, "discovery.source_inventory.read", { recordId: sourceInventoryId }),
      "diagnostic_gap"
    );
  }
  if (routingDecision?.decision === "auto_register_probation") {
    await safeMcp(
      report,
      `discovery.probation.handoff ${packReport.key}`,
      () =>
        harness.mcpToolCall(token, "discovery.probation.handoff", {
          sourceUnderstanding,
          routingDecision,
          sourceInventoryId,
          providerType: String(sourceUnderstanding.suggestedProviderType ?? "rss"),
          createdBy: `discovery-live-gap:${report.runId}`,
        }),
      "runtime_gap"
    );
  }
  if (candidateId) {
    await safeMcp(
      report,
      `discovery.feedback.submit ${packReport.key}`,
      () =>
        harness.mcpToolCall(token, "discovery.feedback.submit", {
          targetType: "candidate",
          targetId: candidateId,
          feedbackType: "mark_useful",
          feedback: {
            source: "live-gap-flow",
            pack: packReport.key,
            usefulnessKind: "classification_usefulness",
            classificationCorrect: true,
            sourceUsefulAsClassified: true,
          },
          createdBy: `discovery-live-gap:${report.runId}`,
        }),
      "runtime_gap"
    );
  }
}

async function runPack(harness, token, report, packReport) {
  const pack = SCENARIO_PACKS.find((entry) => entry.key === packReport.key);
  if (!pack || !packReport.interestTemplateId) {
    return;
  }
  const perPackBudget = Math.max(1, Math.floor(report.maxCostCents / SCENARIO_PACKS.length));
  const run = await safeMcp(
    report,
    `discovery.runs.execute ${pack.key}`,
    () =>
      harness.mcpToolCall(token, "discovery.runs.execute", {
        runKind: "full",
        triggerKind: "mcp",
        request: {
          interest: {
            interestId: packReport.interestTemplateId,
            name: pack.name,
            description: pack.description,
            positive_texts: pack.positiveTexts,
            negative_texts: pack.negativeTexts,
            candidate_positive_signals: pack.candidatePositiveSignals,
            candidate_negative_signals: pack.candidateNegativeSignals,
            geographies: pack.geographies,
            languages: pack.languages,
          },
          maxBatches: 2,
          maxCandidates: 20,
          maxProbeRequests: 10,
          searchProvider: envValue(report.env, "DISCOVERY_SEARCH_PROVIDER", "ddgs"),
          timeRange: "m",
          budget: { maxRunCostCents: perPackBudget },
        },
        budget: {
          maxRunCostCents: perPackBudget,
          maxCandidates: 20,
          maxProbeRequests: 10,
          maxBrowserProbeRequests: 0,
        },
        liveProviderExecution: true,
        createdBy: `discovery-live-gap:${report.runId}`,
      }, { timeoutMs: 15 * 60 * 1000 }),
    "provider_gap"
  );
  const runId = idFrom(run?.run, ["vnext_run_id", "vnextRunId", "runId"]);
  packReport.runId = runId;
  if (!runId) {
    packReport.status = "run_failed";
    recordGap(report, "runtime_gap", `discovery.runs.execute did not return a run id for ${pack.key}.`, { run });
    return;
  }
  await safeMcp(
    report,
    `discovery.runs.read ${pack.key}`,
    () => harness.mcpToolCall(token, "discovery.runs.read", { recordId: runId }),
    "diagnostic_gap"
  );
  const diagnostics = await listDiscoveryDiagnostics(harness, token, report, runId, packReport.interestTemplateId);
  packReport.queryAttempts = diagnostics.queryAttempts;
  packReport.candidates = diagnostics.candidates;
  packReport.artifacts = diagnostics.artifacts;
  packReport.artifactTypes = [...new Set(diagnostics.artifacts.map(artifactType).filter(Boolean))].sort();
  packReport.diagnosticCounts = {
    runSteps: diagnostics.runSteps.length,
    queryAttempts: diagnostics.queryAttempts.length,
    llmEvents: diagnostics.llmEvents.length,
    artifacts: diagnostics.artifacts.length,
    candidates: diagnostics.candidates.length,
    inventory: diagnostics.inventory.length,
    monitoring: diagnostics.monitoring.length,
    observations: diagnostics.observations.length,
    adapterBacklog: diagnostics.adapterBacklog.length,
    rollbackGroups: diagnostics.rollbackGroups.length,
  };

  if (diagnostics.queryAttempts.length === 0) {
    recordGap(report, "runtime_gap", `Live run for ${pack.key} produced no query attempts.`, { runId });
  }
  if (diagnostics.queryAttempts.length > 0 && !diagnostics.queryAttempts.some(liveAttempt)) {
    recordGap(report, "runtime_gap", `Query attempts for ${pack.key} did not expose live provider metadata.`, {
      runId,
      queryAttempts: diagnostics.queryAttempts.slice(0, 3),
    });
  }
  const leakedProofQueries = diagnostics.queryAttempts
    .map(queryText)
    .filter((query) => /\b(live[-\s]?mcp[-\s]?gap|live\s+gap\s+proof|gap\s+proof)\b/iu.test(query));
  if (leakedProofQueries.length > 0) {
    recordGap(report, "runtime_gap", `Live queries for ${pack.key} leaked proof-harness vocabulary.`, {
      runId,
      queries: leakedProofQueries.slice(0, 3),
    });
  }
  if (diagnostics.candidates.length === 0) {
    const failedAttempts = diagnostics.queryAttempts.filter((attempt) => statusOf(attempt) === "failed");
    packReport.status = failedAttempts.length > 0 ? "provider_failure_explained" : "no_candidates";
    if (failedAttempts.length > 0) {
      recordGap(report, "provider_gap", `Live provider attempts failed for ${pack.key}.`, {
        runId,
        failedAttempts: failedAttempts.slice(0, 3),
      });
    }
    return;
  }
  const cueTokens = positiveTokens(pack);
  const matchingTopCandidates = diagnostics.candidates
    .slice(0, 10)
    .filter((candidate) => candidateMatchesPositiveCue(candidate, cueTokens)).length;
  packReport.candidateQuality = {
    topCandidateWindow: Math.min(10, diagnostics.candidates.length),
    positiveCueMatches: matchingTopCandidates,
    positiveCueTokens: cueTokens,
  };
  if (cueTokens.length > 0 && matchingTopCandidates === 0) {
    recordGap(report, "runtime_gap", `Top live candidates for ${pack.key} do not expose the pack's positive cues.`, {
      runId,
      positiveCueTokens: cueTokens,
      candidates: diagnostics.candidates.slice(0, 5),
    });
  }

  const discoveryBriefArtifact = diagnostics.artifacts.find((row) => artifactType(row) === "DiscoveryBrief");
  const discoveryBrief = payloadJson(discoveryBriefArtifact) ?? run?.result?.briefArtifact?.payload_json ?? {};
  packReport.status = "candidates_found";
  await probeAndRouteCandidate(harness, token, report, packReport, discoveryBrief, diagnostics.candidates[0]);
}

async function runLlmProof(harness, token, report) {
  const firstRun = report.packs.find((pack) => pack.runId)?.runId;
  if (!firstRun) {
    recordGap(report, "runtime_gap", "Skipping LLM gateway live proof because no live run id exists.");
    return;
  }
  const llm = await safeMcp(
    report,
    "discovery.llm_gateway.run live",
    () =>
      harness.mcpToolCall(token, "discovery.llm_gateway.run", {
        task: "discovery_live_gap_summary",
        prompt: "Return a concise JSON object summarizing Discovery vNext live MCP gap-hunting evidence.",
        payload: {
          runId: firstRun,
          packs: report.packs.map((pack) => ({
            key: pack.key,
            status: pack.status,
            candidates: pack.candidates?.length ?? 0,
            queryAttempts: pack.queryAttempts?.length ?? 0,
          })),
        },
        budget: { maxRunCostCents: Math.max(1, Math.min(10, report.maxCostCents)) },
        liveProviderExecution: true,
        runId: firstRun,
        createdBy: `discovery-live-gap:${report.runId}`,
      }, { timeoutMs: 5 * 60 * 1000 }),
    "provider_gap"
  );
  report.llmGateway = {
    status: llm?.event?.status ?? null,
    eventId: idFrom(llm?.event, ["llm_gateway_event_id", "llmGatewayEventId"]),
  };
}

async function runReplayAndVerification(harness, token, report) {
  for (const pack of report.packs.filter((entry) => entry.runId).slice(0, 3)) {
    await safeMcp(
      report,
      `discovery.replay.start full_non_live ${pack.key}`,
      () =>
        harness.mcpToolCall(token, "discovery.replay.start", {
          replayKind: "full_non_live",
          input: { runId: pack.runId },
          dryRun: true,
          createdBy: `discovery-live-gap:${report.runId}`,
        }),
      "runtime_gap"
    );
  }
  await safeMcp(
    report,
    "operator.system.health",
    () => harness.mcpToolCall(token, "operator.system.health", { domains: ["discovery"], includeSamples: true }),
    "diagnostic_gap"
  );
  await safeMcp(
    report,
    "operator.report.verify discovery_run",
    () =>
      harness.mcpToolCall(token, "operator.report.verify", {
        reportKind: "discovery_run",
        entityIds: { runIds: report.packs.map((pack) => pack.runId).filter(Boolean) },
        includeSamples: true,
      }),
    "diagnostic_gap"
  );
  await safeMcp(
    report,
    "operator.effect.verify discovery",
    () =>
      harness.mcpToolCall(token, "operator.effect.verify", {
        domain: "discovery",
        changeRef: `live-gap-${report.runId}`,
        baselineWindowHours: 24,
        comparisonWindowHours: 24,
        includeSamples: true,
      }),
    "diagnostic_gap"
  );
}

function finalizeReport(report) {
  const packsWithAttemptsOrCandidates = report.packs.filter(
    (pack) => (pack.candidates?.length ?? 0) > 0 || (pack.queryAttempts?.length ?? 0) > 0
  ).length;
  const packsWithCandidates = report.packs.filter((pack) => (pack.candidates?.length ?? 0) > 0).length;
  const allAttempts = report.packs.flatMap((pack) => pack.queryAttempts ?? []);
  const hasLiveProviderMetadata = allAttempts.some(
    (attempt) => liveAttempt(attempt) && String(valueFrom(attempt, ["provider"]) ?? "").trim()
  );
  const successfulArtifactFamilies = report.packs
    .filter((pack) => (pack.candidates?.length ?? 0) > 0)
    .filter((pack) => (pack.artifactTypes?.length ?? 0) >= 2).length;
  const allPacksBlockedByProvider =
    report.packs.length > 0 &&
    report.packs.every((pack) => pack.status === "provider_failure_explained" || pack.status === "run_failed");

  if (packsWithAttemptsOrCandidates < 3) {
    recordGap(report, "runtime_gap", "Fewer than three scenario packs produced candidates or explainable query attempts.", {
      packsWithAttemptsOrCandidates,
    });
  }
  if (!hasLiveProviderMetadata) {
    recordGap(report, "runtime_gap", "No query attempt exposed live provider metadata.");
  }
  if (packsWithCandidates > 0 && successfulArtifactFamilies === 0) {
    recordGap(report, "runtime_gap", "Candidate-producing packs did not expose at least two typed artifact families.");
  }
  if (allPacksBlockedByProvider) {
    recordGap(report, "provider_gap", "All scenario packs were blocked by provider/runtime failures.");
  }

  report.recommendedFollowUp = [
    ...new Set(
      report.gaps.map((gap) => {
        if (gap.type === "missing_mcp_surface") return "Add the missing MCP tool/resource/prompt and cover it in MCP contract tests.";
        if (gap.type === "schema_gap") return "Extend the MCP input schema so the operator action is expressible without API/SQL bypass.";
        if (gap.type === "runtime_gap") return "Fix Discovery vNext backend persistence/progression and add regression proof.";
        if (gap.type === "diagnostic_gap") return "Expose an MCP diagnostic/read surface with actionable state and error evidence.";
        if (gap.type === "policy_gap") return "Adjust active vNext policy or operator-readable policy error details.";
        if (gap.type === "provider_gap") return "Treat provider failure as telemetry unless all packs are blocked; verify credentials/provider health.";
        return "Review the gap and add the smallest MCP-visible proof.";
      })
    ),
  ];

  const blockingGaps = report.gaps.filter((gap) =>
    ["missing_mcp_surface", "schema_gap", "runtime_gap", "diagnostic_gap", "policy_gap"].includes(gap.type)
  );
  report.status =
    blockingGaps.length === 0 &&
    packsWithAttemptsOrCandidates >= 3 &&
    hasLiveProviderMetadata &&
    !allPacksBlockedByProvider
      ? "passed"
      : "failed";
  report.summary = {
    packsWithAttemptsOrCandidates,
    packsWithCandidates,
    successfulArtifactFamilies,
    queryAttempts: allAttempts.length,
    hasLiveProviderMetadata,
    allPacksBlockedByProvider,
    gapsByType: report.gaps.reduce((accumulator, gap) => {
      accumulator[gap.type] = (accumulator[gap.type] ?? 0) + 1;
      return accumulator;
    }, {}),
  };
}

async function runFlow(harness, token, args, env) {
  const report = {
    kind: "discovery-vnext-mcp-live-gap-flow",
    runId: harness.runId,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: "running",
    preflightOnly: args.preflightOnly,
    maxCostCents: Number(envValue(env, "DISCOVERY_MCP_LIVE_GAP_MAX_COST_CENTS", "0")),
    env: {
      DISCOVERY_ENABLED: envValue(env, "DISCOVERY_ENABLED"),
      DISCOVERY_SEARCH_PROVIDER: envValue(env, "DISCOVERY_SEARCH_PROVIDER"),
      DISCOVERY_MCP_LIVE_GAP_MAX_COST_CENTS: envValue(env, "DISCOVERY_MCP_LIVE_GAP_MAX_COST_CENTS"),
    },
    preflight: {},
    bestPractices: {},
    packs: [],
    events: [],
    gaps: [],
    recommendedFollowUp: [],
    artifacts: null,
  };

  validateLiveEnv(report, env);
  await runProtocolPreflight(harness, token, report);
  await proveFailClosed(harness, token, report);
  await readGuidance(harness, token, report);

  if (args.preflightOnly) {
    report.status = report.gaps.some((gap) => gap.type !== "provider_gap") ? "failed" : "passed";
    report.finishedAt = new Date().toISOString();
    return report;
  }

  if (report.gaps.some((gap) => ["missing_mcp_surface", "schema_gap", "policy_gap"].includes(gap.type))) {
    recordGap(report, "policy_gap", "Live execution skipped because preflight found blocking MCP/policy gaps.");
    report.finishedAt = new Date().toISOString();
    report.status = "failed";
    return report;
  }

  await createInterests(harness, token, report);
  for (const pack of report.packs) {
    log(`Running live pack ${pack.key}.`);
    await runPack(harness, token, report, pack);
  }
  await runLlmProof(harness, token, report);
  await runReplayAndVerification(harness, token, report);
  finalizeReport(report);
  report.finishedAt = new Date().toISOString();
  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = await readEnvFile(".env.dev");
  const harness = createHarness({ logPrefix: "discovery-vnext-mcp-live-gap" });
  let report = null;
  let tokenRecord = null;

  await harness.setup({ rebuild: !args.skipBuild });
  try {
    const issued = await harness.issueToken({
      label: `discovery-live-gap-${harness.runId}`,
      scopes: "read,write.discovery,write.templates,write.destructive",
    });
    tokenRecord = issued.tokenRecord;
    report = await runFlow(harness, issued.token, args, env);
  } catch (error) {
    report = report ?? {
      kind: "discovery-vnext-mcp-live-gap-flow",
      runId: harness.runId,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      status: "failed",
      preflightOnly: args.preflightOnly,
      maxCostCents: Number(envValue(env, "DISCOVERY_MCP_LIVE_GAP_MAX_COST_CENTS", "0")),
      env: {
        DISCOVERY_ENABLED: envValue(env, "DISCOVERY_ENABLED"),
        DISCOVERY_SEARCH_PROVIDER: envValue(env, "DISCOVERY_SEARCH_PROVIDER"),
        DISCOVERY_MCP_LIVE_GAP_MAX_COST_CENTS: envValue(env, "DISCOVERY_MCP_LIVE_GAP_MAX_COST_CENTS"),
      },
      preflight: {},
      bestPractices: {},
      packs: [],
      events: [],
      gaps: [],
      recommendedFollowUp: [],
      artifacts: null,
    };
    recordGap(report, classifyError(error), "Unhandled live MCP gap-flow error.", summarizeError(error));
    finalizeReport(report);
    report.finishedAt = new Date().toISOString();
  } finally {
    if (report) {
      const artifacts = await harness.writeArtifacts(
        "signalops-discovery-vnext-mcp-live-gap-flow",
        report,
        buildMarkdown(report)
      );
      report.artifacts = artifacts;
      await harness.writeArtifacts(
        "signalops-discovery-vnext-mcp-live-gap-flow",
        report,
        buildMarkdown(report)
      );
      log(`JSON artifact: ${artifacts.jsonPath}`);
      log(`Markdown artifact: ${artifacts.mdPath}`);
    }
    if (tokenRecord?.tokenId) {
      await harness.revokeToken(tokenRecord.tokenId).catch((error) => {
        log(`Token cleanup warning: ${error instanceof Error ? error.message : String(error)}`);
      });
    }
    await harness.cleanup();
  }

  if (!report || report.status !== "passed") {
    throw new Error(`Discovery vNext MCP live gap flow ${report?.status ?? "failed"}. See ${report?.artifacts?.jsonPath ?? "report artifact"}.`);
  }
}

await main();
