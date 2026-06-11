import { writeFile } from "node:fs/promises";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  createHarness,
  createLogger,
  readEnvFile,
} from "./lib/mcp-http-testkit.mjs";

const log = createLogger("discovery-vnext-mcp-live-signal");

export const SIGNAL_PACKS = [
  {
    key: "security_advisories",
    name: "Security advisory signal source discovery",
    description: "Find official security advisory, CVE, urgent patch and mitigation update sources.",
    geographies: ["global"],
    languages: ["en", "ja", "ko", "de", "fr"],
    positiveTexts: [
      "security advisory critical vulnerability patch",
      "CVE emergency update vendor advisory",
      "official product security release notes",
    ],
    negativeTexts: ["SEO vulnerability explainer", "generic cybersecurity opinion", "training course promotion"],
    candidatePositiveSignals: [
      "official_advisory: security advisory, CVE, vendor advisory",
      "vulnerability_patch: critical vulnerability, patch, patched versions, update",
      "affected_versions: affected versions, remote code execution, mitigation",
      "operator_urgency: emergency release, upgrade immediately, exploit",
    ],
    candidateNegativeSignals: ["commentary_only: news summary without primary advisory link", "sales_page: product pitch"],
    evidenceTerms: ["security", "advisory", "cve", "vulnerability", "patch", "mitigation", "release notes"],
  },
  {
    key: "policy_regulatory",
    name: "Policy regulatory signal source discovery",
    description: "Find regulator updates, compliance deadlines, consultations and implementation guidance sources.",
    geographies: ["global"],
    languages: ["en", "es", "fr", "de", "pt", "pl", "nl", "it"],
    positiveTexts: [
      "regulator consultation compliance deadline",
      "policy implementation guidance official update",
      "regulatory notice public consultation",
    ],
    negativeTexts: ["law firm marketing", "generic policy commentary", "event invitation"],
    candidatePositiveSignals: [
      "regulatory_change: regulation, regulatory, reform, act",
      "compliance_obligation: compliance, comply, obligation, deadline",
      "implementation_guidance: guidance, prepare, what it means, implementation",
      "trade_policy_signal: customs, certificate, deforestation, free trade",
    ],
    candidateNegativeSignals: ["secondary_commentary: consultant blog", "event_only: webinar without policy update"],
    evidenceTerms: ["regulator", "regulatory", "consultation", "compliance", "deadline", "guidance", "procurement", "public tender"],
  },
  {
    key: "software_changelogs",
    name: "Software changelog signal source discovery",
    description: "Find release notes, deprecations, breaking changes, migration notices and changelog sources.",
    geographies: ["global"],
    languages: ["en", "ja", "ko", "de", "fr"],
    positiveTexts: [
      "release notes breaking change migration",
      "deprecation notice changelog",
      "upgrade guide removed API",
    ],
    negativeTexts: ["marketing launch blog", "generic tutorial", "third-party roundup"],
    candidatePositiveSignals: [
      "primary_changelog: release notes, changelog, version",
      "breaking_change: breaking change, deprecated, deprecation, removed API",
      "migration_signal: migration guide, upgrade guide, upgrade requirement",
      "developer_operator_signal: language server, CLI, compatibility impact, code intelligence",
    ],
    candidateNegativeSignals: ["marketing_only: feature announcement", "tutorial_only: how-to signal_candidate"],
    evidenceTerms: ["release notes", "changelog", "deprecation", "deprecated", "breaking change", "migration", "upgrade", "api"],
  },
];

const REQUIRED_TOOLS = [
  "operator.funnel.audit",
  "operator.funnel.autoplan",
  "operator.funnel.iteration.recommend",
  "system_interests.list",
  "system_interests.create",
  "system_interests.read",
  "system_interests.archive",
  "discovery.runs.execute",
  "discovery.runs.read",
  "discovery.artifacts.list",
  "discovery.candidates.list",
  "discovery.probe.plan_preview",
  "discovery.probe.execute",
  "discovery.scope.resolve_preview",
  "discovery.scope.resolve_apply",
  "discovery.understand.preview",
  "discovery.routing.apply",
  "discovery.probation.handoff",
  "channels.read",
  "channels.sync.request",
  "outbox.events.list",
  "fetch_runs.list",
  "web_resources.list",
  "signal_candidates.list",
  "signal_candidates.explain",
  "content_items.list",
  "content_items.explain",
  "maintenance.reindex.request",
  "maintenance.reindex_jobs.list",
];

const REQUIRED_RESOURCES = [
  "signalops://guide/scenarios/discovery-live-gap-hunting",
  "signalops://guide/scenarios/discovery",
  "signalops://guide/scenarios/funnel-calibration",
];

const REQUIRED_PROMPTS = ["discovery.live_gap_hunting.plan"];

function parseArgs(argv) {
  return {
    preflightOnly: argv.includes("--preflight-only"),
    skipBuild: argv.includes("--skip-build"),
  };
}

function envValue(env, key, fallback = "") {
  return String(process.env[key] ?? env[key] ?? fallback).trim();
}

function configured(value) {
  const normalized = String(value ?? "").trim();
  return Boolean(normalized && normalized !== "replace-me" && normalized !== "0");
}

function rows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.rows)) return payload.rows;
  return [];
}

function valueFrom(record, keys) {
  for (const key of keys) {
    if (record?.[key] != null) return record[key];
  }
  return null;
}

function idFrom(record, keys) {
  const value = valueFrom(record, keys);
  return value == null ? null : String(value);
}

function artifactPayload(artifact) {
  return artifact?.payload_json ?? artifact?.payloadJson ?? artifact?.payload ?? null;
}

function artifactType(artifact) {
  return String(valueFrom(artifact, ["artifact_type", "artifactType"]) ?? "");
}

function canonicalUrl(candidate) {
  return String(valueFrom(candidate, ["canonical_url", "canonicalUrl", "url"]) ?? "");
}

function canonicalDomain(candidate) {
  return String(valueFrom(candidate, ["canonical_domain", "canonicalDomain", "domain"]) ?? "");
}

function channelUrl(channel) {
  return String(valueFrom(channel, ["url", "fetch_url", "fetchUrl", "source_url", "sourceUrl", "feed_url", "feedUrl"]) ?? "");
}

function channelProviderType(channel) {
  return String(valueFrom(channel, ["provider_type", "providerType"]) ?? "");
}

function fetchRunSummary(fetchRun) {
  return {
    fetchRunId: idFrom(fetchRun, ["fetch_run_id", "fetchRunId", "id"]),
    channelId: idFrom(fetchRun, ["channel_id", "channelId"]),
    providerType: String(valueFrom(fetchRun, ["provider_type", "providerType"]) ?? ""),
    adapterKey: valueFrom(fetchRun, ["adapter_key", "adapterKey"]) ?? null,
    status: valueFrom(fetchRun, ["status", "run_status", "runStatus"]) ?? null,
    fetchedItemCount: Number(valueFrom(fetchRun, ["fetched_item_count", "fetchedItemCount"]) ?? 0),
    newSignalCandidateCount: Number(valueFrom(fetchRun, ["new_signal_candidate_count", "newSignalCandidateCount"]) ?? 0),
    errorMessage: valueFrom(fetchRun, ["error_message", "errorMessage"]) ?? null,
  };
}

function stringifyEvidence(value, depth = 0) {
  if (value == null || depth > 3) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => stringifyEvidence(entry, depth + 1)).join(" ");
  }
  if (typeof value === "object") {
    return Object.values(value).map((entry) => stringifyEvidence(entry, depth + 1)).join(" ");
  }
  return "";
}

function signalScore(pack, value) {
  const haystack = stringifyEvidence(value).toLowerCase();
  return (pack.evidenceTerms ?? []).reduce(
    (score, term) => score + (haystack.includes(String(term).toLowerCase()) ? 1 : 0),
    0
  );
}

function hasSignalEvidence(pack, item, explain) {
  return signalScore(pack, { item, explain }) > 0;
}

function proofNamespaceForRunId(runId) {
  return `live-mcp-signal-${String(runId).slice(0, 8)}`;
}

function activeFlag(row) {
  if (row?.isActive != null) return row.isActive === true;
  if (row?.is_active != null) return row.is_active === true;
  return true;
}

function liveSignalProofNamespaceFromName(name) {
  const match = String(name ?? "").match(/\[live-mcp-signal-[a-f0-9]{8}\]/iu);
  return match ? match[0].slice(1, -1) : null;
}

export function buildProofInterestArchiveActions(interests, currentNamespace) {
  return rows(interests)
    .filter((interest) => activeFlag(interest))
    .map((interest) => ({
      interestTemplateId: idFrom(interest, [
        "interestTemplateId",
        "interest_template_id",
        "systemInterestId",
        "interestId",
        "id",
      ]),
      namespace: liveSignalProofNamespaceFromName(interest?.name),
    }))
    .filter((interest) => interest.interestTemplateId && interest.namespace)
    .filter((interest) => interest.namespace !== currentNamespace)
    .map((interest) => ({
      interestTemplateId: interest.interestTemplateId,
      confirm: true,
    }));
}

function wrapperPenalty(item) {
  const title = String(valueFrom(item, ["title", "name"]) ?? "").toLowerCase();
  const url = String(valueFrom(item, ["url", "canonical_url", "canonicalUrl"]) ?? "").toLowerCase();
  let penalty = 0;
  if (/\bsign[ -]?in\b|\blog[ -]?in\b|\/login\b|\/signin\b/u.test(`${title} ${url}`)) penalty += 100;
  if (/^about\b|\babout government\b|\bcontact\b|\bprivacy\b|\bterms\b/u.test(title)) penalty += 50;
  if (/\bbug bounty\b|\breport a vulnerability\b/u.test(title)) penalty += 35;
  if (/\/(about|contact|privacy|terms)\/?$/u.test(url)) penalty += 35;
  return penalty;
}

function proofCandidateScore(pack, item) {
  const selected =
    item?.final_selection_selected === true ||
    String(item?.final_selection_decision ?? "") === "selected";
  const grayZone = String(item?.final_selection_decision ?? "") === "gray_zone";
  return (
    signalScore(pack, item) * 10 +
    (selected ? 1000 : 0) +
    (grayZone ? 100 : 0) -
    wrapperPenalty(item)
  );
}

export function rankSignalCandidatesForProof(pack, candidates) {
  return [...rows(candidates)].sort((left, right) => {
    const scoreDelta = proofCandidateScore(pack, right) - proofCandidateScore(pack, left);
    if (scoreDelta !== 0) return scoreDelta;
    return String(valueFrom(left, ["title", "url"]) ?? "").localeCompare(
      String(valueFrom(right, ["title", "url"]) ?? "")
    );
  });
}

export function isSelectedSignalAttempt(packReport) {
  return (
    (packReport?.signal_candidates ?? []).some(
      (signal_candidate) => signal_candidate?.final_selection_selected === true
    ) || (packReport?.contentItems ?? []).length > 0
  );
}

export function isFetchedExplainableSignalAttempt(packReport) {
  return (
    ((packReport?.webResources ?? []).length > 0 ||
      (packReport?.signal_candidates ?? []).length > 0 ||
      (packReport?.contentItems ?? []).length > 0) &&
    (packReport?.explainableItems ?? []).length > 0
  );
}

function captureSignalAttemptEvidence(packReport) {
  return {
    routed: packReport.routed,
    outboxEvents: [...(packReport.outboxEvents ?? [])],
    fetchRuns: [...(packReport.fetchRuns ?? [])],
    fetchRunSummaries: [...(packReport.fetchRunSummaries ?? [])],
    webResources: [...(packReport.webResources ?? [])],
    signal_candidates: [...(packReport.signal_candidates ?? [])],
    contentItems: [...(packReport.contentItems ?? [])],
    explainableItems: [...(packReport.explainableItems ?? [])],
  };
}

function restoreSignalAttemptEvidence(packReport, evidence) {
  if (!evidence) return;
  packReport.routed = evidence.routed;
  packReport.outboxEvents = evidence.outboxEvents;
  packReport.fetchRuns = evidence.fetchRuns;
  packReport.fetchRunSummaries = evidence.fetchRunSummaries;
  packReport.webResources = evidence.webResources;
  packReport.signal_candidates = evidence.signal_candidates;
  packReport.contentItems = evidence.contentItems;
  packReport.explainableItems = evidence.explainableItems;
}

function extractChannelId(handoff) {
  const direct = idFrom(handoff?.sourceInventory, ["registered_channel_id", "registeredChannelId", "channel_id", "channelId"]);
  if (direct) return direct;
  for (const row of handoff?.registrarResults ?? []) {
    const channelId = idFrom(row, ["channel_id", "channelId"]);
    if (channelId) return channelId;
  }
  return null;
}

function isFeedBackedFetchRun(fetchRun) {
  const providerType = String(valueFrom(fetchRun, ["provider_type", "providerType"]) ?? "").toLowerCase();
  const adapterKey = String(valueFrom(fetchRun, ["adapter_key", "adapterKey"]) ?? "").toLowerCase();
  return providerType === "rss" || adapterKey.startsWith("rss.");
}

function downstreamFailureKind(packReport) {
  if ((packReport.fetchRuns ?? []).some(isFeedBackedFetchRun) && (packReport.signal_candidates ?? []).length === 0) {
    return "rss_feed_not_productive";
  }
  return "no_fetched_content";
}

async function readDownstreamEvidence(report, harness, token, channelId) {
  const [resourcesPage, signalCandidatesPage] = await Promise.all([
    mcp(report, harness, token, "web_resources.list", { channelId, page: 1, pageSize: 20 }, { optional: true }),
    mcp(report, harness, token, "signal_candidates.list", { channelId, page: 1, pageSize: 20 }, { optional: true }),
  ]);
  return {
    resourcesPage,
    signalCandidatesPage,
    resources: rows(resourcesPage),
    signal_candidates: rows(signalCandidatesPage),
  };
}

export function buildInterestPayload(pack, namespace) {
  return {
    name: `${pack.name} [${namespace}]`,
    description: `${pack.description} Live MCP signal funnel proof pack ${pack.key}.`,
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
    priority: "0.8",
    isActive: true,
  };
}

async function mcp(report, harness, token, name, args = {}, options = {}) {
  report.mcpCalls.push({ name, args });
  try {
    return await harness.mcpToolCall(token, name, args, {
      timeoutMs: 120000,
      ...options,
    });
  } catch (error) {
    const gap = {
      category: options.gapCategory ?? "runtime_gap",
      tool: name,
      message: error instanceof Error ? error.message : String(error),
      args,
    };
    report.gaps.push(gap);
    if (options.optional) return null;
    throw error;
  }
}

async function waitFor(label, fn, { timeoutMs = 180000, intervalMs = 5000 } = {}) {
  const started = Date.now();
  let lastValue = null;
  while (Date.now() - started < timeoutMs) {
    lastValue = await fn();
    if (lastValue) return lastValue;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for ${label}. Last value: ${JSON.stringify(lastValue)?.slice(0, 800)}`);
}

async function runPreflight(harness, token, report, env, args) {
  const failures = [];
  if (envValue(env, "DISCOVERY_ENABLED") !== "1") failures.push("DISCOVERY_ENABLED=1 is required.");
  if (!args.preflightOnly && !configured(envValue(env, "DISCOVERY_MCP_LIVE_GAP_MAX_COST_CENTS"))) {
    failures.push("DISCOVERY_MCP_LIVE_GAP_MAX_COST_CENTS must be positive.");
  }
  if (!configured(envValue(env, "DISCOVERY_GEMINI_API_KEY")) && !configured(envValue(env, "GEMINI_API_KEY"))) {
    failures.push("Gemini-compatible LLM credentials are required.");
  }

  const initialize = await harness.mcpRpc(token, "initialize", {});
  if (String(initialize?.result?.serverInfo?.name ?? "") !== "signalops-mcp") {
    failures.push("MCP initialize did not return signalops-mcp.");
  }

  const [toolsList, resourcesList, promptsList] = await Promise.all([
    harness.mcpRpc(token, "tools/list", {}),
    harness.mcpRpc(token, "resources/list", {}),
    harness.mcpRpc(token, "prompts/list", {}),
  ]);
  const tools = new Set((toolsList?.result?.tools ?? []).map((tool) => String(tool.name)));
  const resources = new Set((resourcesList?.result?.resources ?? []).map((resource) => String(resource.uri)));
  const prompts = new Set((promptsList?.result?.prompts ?? []).map((prompt) => String(prompt.name)));

  for (const tool of REQUIRED_TOOLS) if (!tools.has(tool)) failures.push(`Missing MCP tool: ${tool}`);
  for (const resource of REQUIRED_RESOURCES) if (!resources.has(resource)) failures.push(`Missing MCP resource: ${resource}`);
  for (const prompt of REQUIRED_PROMPTS) if (!prompts.has(prompt)) failures.push(`Missing MCP prompt: ${prompt}`);

  const failClosed = await harness.mcpToolCall(
    token,
    "discovery.runs.execute",
    {
      runKind: "candidate_acquisition",
      triggerKind: "mcp",
      request: { interest: { interestId: `signal-fail-${report.runId}`, name: "Fail closed", description: "Budget zero must fail." } },
      budget: { maxRunCostCents: 0 },
      liveProviderExecution: true,
      createdBy: `discovery-live-signal:${report.runId}`,
    },
    { expectError: true }
  );
  if (!failClosed?.error) failures.push("Live fail-closed budget proof did not fail.");

  report.preflight = {
    tools: tools.size,
    resources: resources.size,
    prompts: prompts.size,
    failClosedMessage: String(failClosed?.error?.message ?? ""),
    failures,
  };
  if (failures.length > 0) {
    for (const failure of failures) report.gaps.push({ category: "preflight_gap", message: failure });
  }
  return failures.length === 0;
}

async function readGuidance(harness, token, report) {
  for (const uri of REQUIRED_RESOURCES) {
    await harness.mcpResourceRead(token, uri);
    report.mcpCalls.push({ name: "resources/read", args: { uri } });
  }
  for (const prompt of REQUIRED_PROMPTS) {
    await harness.mcpPromptGet(token, prompt, {
      objective: "prove Discovery vNext signal funnel from live MCP discovery to fetched explainable content",
      scenarioPacks: SIGNAL_PACKS.map((pack) => pack.key).join(", "),
    });
    report.mcpCalls.push({ name: "prompts/get", args: { name: prompt } });
  }
  await mcp(report, harness, token, "operator.funnel.audit", {
    objective: "Discovery vNext live signal funnel proof",
    referenceEvidenceKind: "portable_funnel_guidance",
    referenceText: "Operator must see real fetched content and explainable signal evidence, not search snippets.",
    includeDiscovery: true,
    includeSamples: false,
  });
  await mcp(report, harness, token, "operator.funnel.autoplan", {
    objective: "Discovery vNext live signal funnel proof",
    rareSignal: true,
    maxNewChannels: 6,
    includeSamples: false,
  });
  await mcp(report, harness, token, "operator.funnel.iteration.recommend", {
    objective: "Discovery vNext live signal funnel proof",
    includeSamples: false,
  });
}

async function archivePriorProofInterests(harness, token, report) {
  const currentNamespace = proofNamespaceForRunId(report.runId);
  const pageSize = 100;
  const interests = [];
  for (let page = 1; page <= 5; page += 1) {
    const result = await mcp(report, harness, token, "system_interests.list", {
      page,
      pageSize,
    });
    const pageRows = rows(result);
    interests.push(...pageRows);
    if (pageRows.length < pageSize) break;
  }
  const actions = buildProofInterestArchiveActions(interests, currentNamespace);
  report.proofIsolation = {
    currentNamespace,
    archivedProofInterestCount: actions.length,
    archivedProofInterestIds: actions.map((action) => action.interestTemplateId),
  };
  for (const action of actions) {
    await mcp(report, harness, token, "system_interests.archive", action, {
      gapCategory: "runtime_gap",
    });
  }
}

async function createInterest(harness, token, report, pack) {
  const namespace = proofNamespaceForRunId(report.runId);
  const created = await mcp(report, harness, token, "system_interests.create", {
    payload: buildInterestPayload(pack, namespace),
  });
  const interestId = idFrom(created, ["entityId", "interestTemplateId", "systemInterestId", "interestId"]);
  if (!interestId) throw new Error(`system_interests.create did not return an id for ${pack.key}.`);
  await mcp(report, harness, token, "system_interests.read", { interestTemplateId: interestId });
  return interestId;
}

async function runDiscovery(harness, token, report, pack, interestId) {
  const perPackBudget = Math.max(1, Math.floor(report.maxCostCents / SIGNAL_PACKS.length));
  const run = await mcp(
    report,
    harness,
    token,
    "discovery.runs.execute",
    {
      runKind: "full",
      triggerKind: "mcp",
      request: {
        interest: {
          interestId,
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
      createdBy: `discovery-live-signal:${report.runId}`,
    },
    { timeoutMs: 15 * 60 * 1000, gapCategory: "provider_gap" }
  );
  const runId = idFrom(run?.run, ["vnext_run_id", "vnextRunId", "runId"]);
  if (!runId) throw new Error(`discovery.runs.execute did not return a run id for ${pack.key}.`);
  await mcp(report, harness, token, "discovery.runs.read", { recordId: runId });
  const [artifactsPage, candidatesPage] = await Promise.all([
    mcp(report, harness, token, "discovery.artifacts.list", { page: 1, pageSize: 100, interestId }),
    mcp(report, harness, token, "discovery.candidates.list", { page: 1, pageSize: 100, interestId }),
  ]);
  const artifacts = rows(artifactsPage).filter((row) => idFrom(row, ["vnext_run_id", "vnextRunId"]) === runId || idFrom(row, ["interest_id", "interestId"]) === interestId);
  const candidates = rows(candidatesPage).filter((row) => idFrom(row, ["vnext_run_id", "vnextRunId"]) === runId || idFrom(row, ["interest_id", "interestId"]) === interestId);
  const brief = artifactPayload(artifacts.find((artifact) => artifactType(artifact) === "DiscoveryBrief"));
  if (!brief) throw new Error(`DiscoveryBrief artifact was not readable for ${pack.key}.`);
  if (candidates.length === 0) throw new Error(`No discovery candidates returned for ${pack.key}.`);
  return { runId, artifacts, candidates, brief };
}

async function routeCandidate(harness, token, report, packReport, candidate) {
  const candidateUrl = canonicalUrl(candidate);
  if (!candidateUrl || !/^https?:\/\//i.test(candidateUrl)) return null;
  const candidateId = idFrom(candidate, ["candidate_id", "candidateId"]);
  const probePlan = await mcp(report, harness, token, "discovery.probe.plan_preview", {
    candidateUrl,
    candidateKindGuess: String(valueFrom(candidate, ["candidate_kind_guess", "candidateKindGuess"]) ?? "website"),
  });
  const probePlanPayload = probePlan?.payload ?? probePlan;
  const probe = await mcp(report, harness, token, "discovery.probe.execute", {
    probePlan: probePlanPayload,
    runId: packReport.runId,
    interestId: packReport.interestId,
    candidateId,
    createdBy: `discovery-live-signal:${report.runId}`,
  }, { timeoutMs: 180000, gapCategory: "provider_gap" });
  const probeReport = probe?.probeReportArtifact?.payload_json ?? probe?.probeReportArtifact?.payloadJson;
  if (!probeReport) return null;
  const scopeResolveArgs = {
    discoveryBrief: packReport.brief,
    probeReport,
    candidate: {
      candidateId,
      canonicalUrl: candidateUrl,
      canonicalDomain: canonicalDomain(candidate),
      candidateKindGuess: String(valueFrom(candidate, ["candidate_kind_guess", "candidateKindGuess"]) ?? "website"),
    },
    runId: packReport.runId,
    interestId: packReport.interestId,
    candidateId,
    createdBy: `discovery-live-signal:${report.runId}`,
  };
  const scope = await mcp(report, harness, token, "discovery.scope.resolve_apply", scopeResolveArgs);
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
  const understanding = await mcp(report, harness, token, "discovery.understand.preview", {
    discoveryBrief: packReport.brief,
    probeReport,
    sourceScopeResolution,
    candidate: {
      candidateId,
      canonicalUrl: candidateUrl,
      canonicalDomain: canonicalDomain(candidate),
      candidateKindGuess: String(valueFrom(candidate, ["candidate_kind_guess", "candidateKindGuess"]) ?? "website"),
    },
  });
  const sourceUnderstanding = understanding?.payload ?? understanding?.sourceUnderstanding?.payload ?? understanding?.sourceUnderstanding ?? understanding;
  if (sourceScopeResolutionArtifactId && sourceUnderstanding && typeof sourceUnderstanding === "object") {
    sourceUnderstanding.sourceScopeResolutionArtifactId ??= sourceScopeResolutionArtifactId;
  }
  const operationalUrl = String(sourceScopeResolution?.resolvedSourceUrl ?? sourceUnderstanding?.sourceUrl ?? candidateUrl);
  const routing = await mcp(report, harness, token, "discovery.routing.apply", {
    sourceUnderstanding,
    canonicalUrl: operationalUrl,
    canonicalDomain: canonicalDomain(candidate),
    sourceIdentityKey: `${String(sourceUnderstanding?.suggestedProviderType ?? "website")}|${canonicalDomain(candidate)}|${operationalUrl}`,
    providerType: String(sourceUnderstanding?.suggestedProviderType ?? "website"),
    accessPattern: String(sourceUnderstanding?.accessPattern ?? "public"),
    runId: packReport.runId,
    interestId: packReport.interestId,
    candidateId,
    createdBy: `discovery-live-signal:${report.runId}`,
  });
  const routingDecision = routing?.routingDecisionArtifact?.payload_json ?? routing?.routingDecisionArtifact?.payloadJson ?? routing?.routingDecision;
  const sourceInventoryId = idFrom(routing?.sourceInventory, ["source_inventory_id", "sourceInventoryId"]);
  const decision = String(routingDecision?.decision ?? "");
  packReport.routingAttempts.push({ candidateId, candidateUrl, sourceInventoryId, decision });
  if (decision !== "auto_register_probation") return null;
  const handoff = await mcp(report, harness, token, "discovery.probation.handoff", {
    sourceUnderstanding,
    routingDecision,
    sourceInventoryId,
    providerType: String(sourceUnderstanding?.suggestedProviderType ?? "website"),
    createdBy: `discovery-live-signal:${report.runId}`,
  });
  const channelId = extractChannelId(handoff);
  if (!channelId) {
    packReport.routingAttempts.at(-1).handoffStatus = handoff?.status ?? "missing_channel";
    return null;
  }
  const channel = await mcp(report, harness, token, "channels.read", { channelId });
  return { candidateId, candidateUrl, sourceInventoryId, routingDecision, sourceUnderstanding, handoff, channelId, channel };
}

async function proveContentTail(harness, token, report, pack, packReport, routed) {
  const channelId = routed.channelId;
  let outbox = await mcp(report, harness, token, "outbox.events.list", {
    eventType: "source.channel.sync.requested",
    aggregateType: "source_channel",
    aggregateId: channelId,
    limit: 20,
  });
  if (rows(outbox).length === 0) {
    await mcp(report, harness, token, "channels.sync.request", {
      channelId,
      reason: `live signal funnel proof ${report.runId}`,
    });
    outbox = await mcp(report, harness, token, "outbox.events.list", {
      eventType: "source.channel.sync.requested",
      aggregateType: "source_channel",
      aggregateId: channelId,
      limit: 20,
    });
  }
  packReport.outboxEvents = rows(outbox);

  const fetchRunsPage = await waitFor(`fetch run for ${channelId}`, async () => {
    const page = await mcp(report, harness, token, "fetch_runs.list", { channelId, page: 1, pageSize: 20 }, { optional: true });
    const fetched = rows(page);
    return fetched.length > 0 ? page : null;
  }, { timeoutMs: 5 * 60 * 1000, intervalMs: 10000 });
  packReport.fetchRuns = rows(fetchRunsPage);
  packReport.fetchRunSummaries = packReport.fetchRuns.map(fetchRunSummary);

  const feedBacked = packReport.fetchRuns.some(isFeedBackedFetchRun);
  const downstreamEvidence = await waitFor(`downstream evidence for ${channelId}`, async () => {
    const evidence = await readDownstreamEvidence(report, harness, token, channelId);
    if (feedBacked) return evidence.signal_candidates.length > 0 ? evidence : null;
    return evidence.resources.length > 0 || evidence.signal_candidates.length > 0 ? evidence : null;
  }, { timeoutMs: 5 * 60 * 1000, intervalMs: 10000 });
  packReport.webResources = downstreamEvidence.resources;
  packReport.signal_candidates = downstreamEvidence.signal_candidates;

  const rankedInitialSignalCandidates = rankSignalCandidatesForProof(pack, packReport.signal_candidates);
  const docIds = rankedInitialSignalCandidates.map((signal_candidate) => idFrom(signal_candidate, ["doc_id", "docId"])).filter(Boolean).slice(0, 20);
  if (docIds.length > 0) {
    await mcp(report, harness, token, "maintenance.reindex.request", {
      payload: {
        indexName: "interest_centroids",
        jobKind: "backfill",
        options: {
          docIds,
          retroNotifications: "skip",
          reason: `Discovery vNext live signal proof ${report.runId}`,
        },
      },
    });
    await mcp(report, harness, token, "maintenance.reindex_jobs.list", { page: 1, pageSize: 20 });
  }

  const refreshedSignalCandidates = await mcp(report, harness, token, "signal_candidates.list", { channelId, page: 1, pageSize: 20 }, { optional: true });
  packReport.signal_candidates = rankSignalCandidatesForProof(pack, rows(refreshedSignalCandidates));
  for (const signal_candidate of packReport.signal_candidates.slice(0, 10)) {
    const docId = idFrom(signal_candidate, ["doc_id", "docId"]);
    if (!docId) continue;
    const explain = await mcp(report, harness, token, "signal_candidates.explain", { docId }, { optional: true });
    if (explain && hasSignalEvidence(pack, signal_candidate, explain)) {
      packReport.explainableItems.push({ kind: "signal_candidate", id: docId, title: signal_candidate.title ?? null, url: signal_candidate.url ?? null, explain });
    }
  }

  const contentItemsPage = await mcp(report, harness, token, "content_items.list", { channelId, page: 1, pageSize: 20 }, { optional: true });
  packReport.contentItems = rows(contentItemsPage);
  for (const item of packReport.contentItems.slice(0, 5)) {
    const contentItemId = idFrom(item, ["content_item_id", "contentItemId"]);
    if (!contentItemId) continue;
    const explain = await mcp(report, harness, token, "content_items.explain", { contentItemId }, { optional: true });
    if (explain && hasSignalEvidence(pack, item, explain)) {
      packReport.explainableItems.push({ kind: "content_item", id: contentItemId, title: item.title ?? null, url: item.url ?? null, explain });
    }
  }
}

async function runPack(harness, token, report, pack) {
  const packReport = {
    key: pack.key,
    status: "started",
    interestId: null,
    runId: null,
    candidates: [],
    artifacts: [],
    routingAttempts: [],
    outboxEvents: [],
    fetchRuns: [],
    fetchRunSummaries: [],
    webResources: [],
    signal_candidates: [],
    contentItems: [],
    explainableItems: [],
  };
  report.packs.push(packReport);
  packReport.interestId = await createInterest(harness, token, report, pack);
  const discovery = await runDiscovery(harness, token, report, pack, packReport.interestId);
  Object.assign(packReport, discovery, {
    artifactTypes: [...new Set(discovery.artifacts.map(artifactType).filter(Boolean))].sort(),
  });

  const preferred = discovery.candidates
    .filter((candidate) => /^https?:\/\//i.test(canonicalUrl(candidate)))
    .filter((candidate) => !/google\.com|bing\.com|duckduckgo\.com|search\./i.test(canonicalDomain(candidate)))
    .sort((left, right) => signalScore(pack, right) - signalScore(pack, left))
    .slice(0, 10);
  let bestFetchedAttempt = null;
  for (const candidate of preferred) {
    const routed = await routeCandidate(harness, token, report, packReport, candidate);
    if (!routed) continue;
    packReport.routed = {
      channelId: routed.channelId,
      channelUrl: channelUrl(routed.channel),
      channelProviderType: channelProviderType(routed.channel),
      candidateId: routed.candidateId,
      candidateUrl: routed.candidateUrl,
      sourceInventoryId: routed.sourceInventoryId,
    };
    packReport.outboxEvents = [];
    packReport.fetchRuns = [];
    packReport.fetchRunSummaries = [];
    packReport.webResources = [];
    packReport.signal_candidates = [];
    packReport.contentItems = [];
    packReport.explainableItems = [];
    try {
      await proveContentTail(harness, token, report, pack, packReport, routed);
    } catch (error) {
      packReport.routingAttempts.at(-1).fetchStatus = downstreamFailureKind(packReport);
      packReport.routingAttempts.at(-1).fetchError =
        error instanceof Error ? error.message : String(error);
      continue;
    }
    if (
      isFetchedExplainableSignalAttempt(packReport)
    ) {
      bestFetchedAttempt ??= captureSignalAttemptEvidence(packReport);
      if (!isSelectedSignalAttempt(packReport)) {
        packReport.routingAttempts.at(-1).fetchStatus = "fetched_explainable_but_not_selected";
        continue;
      }
      packReport.status = "signal_content_fetched";
      return packReport;
    }
  }
  if (bestFetchedAttempt) {
    restoreSignalAttemptEvidence(packReport, bestFetchedAttempt);
    packReport.status = "signal_content_fetched";
    return packReport;
  }
  packReport.status = "no_fetchable_probation_signal";
  report.gaps.push({
    category: "runtime_gap",
    message: `${pack.key} did not produce a probation channel with fetched content.`,
    routingAttempts: packReport.routingAttempts,
  });
  return packReport;
}

function summarizeStatus(report) {
  const packsWithContent = report.packs.filter((pack) => pack.status === "signal_content_fetched");
  const explainableCount = report.packs.reduce((count, pack) => count + pack.explainableItems.length, 0);
  const selectedCount = report.packs.reduce(
    (count, pack) =>
      count +
      pack.signal_candidates.filter((signal_candidate) => signal_candidate.final_selection_selected === true).length +
      pack.contentItems.length,
    0
  );
  report.successCriteria = {
    packsWithContent: packsWithContent.length,
    explainableItems: explainableCount,
    selectedOrContentItems: selectedCount,
  };
  if (packsWithContent.length >= 2) {
    const retainedGaps = [];
    for (const gap of report.gaps) {
      if (/did not produce a probation channel with fetched content/i.test(String(gap.message ?? ""))) {
        report.providerTelemetry.push({
          pack: String(gap.message).split(" ")[0],
          category: "provider_or_routing_residual",
          message: gap.message,
          routingAttempts: gap.routingAttempts ?? [],
        });
      } else {
        retainedGaps.push(gap);
      }
    }
    report.gaps = retainedGaps;
  }
  if (packsWithContent.length < 2) {
    report.gaps.push({ category: "runtime_gap", message: "Fewer than 2 signal families produced real fetched content." });
  }
  if (explainableCount < 3) {
    report.gaps.push({ category: "diagnostic_gap", message: "Fewer than 3 fetched signal_candidates/content items have explainable evidence." });
  }
  if (selectedCount < 1) {
    report.gaps.push({ category: "downstream_selection_gap", message: "No item reached final_selection_results.selected or content_items.list." });
  }
  report.status = report.gaps.length === 0 ? "passed" : "failed";
}

function markdown(report) {
  const lines = [
    `# Discovery vNext MCP Live Signal Funnel ${report.runId}`,
    "",
    `- status: ${report.status}`,
    `- startedAt: ${report.startedAt}`,
    `- finishedAt: ${report.finishedAt}`,
    `- operatorPath: MCP-only product actions after bootstrap token`,
    `- JSON: ${report.artifacts?.jsonPath ?? "pending"}`,
    "",
    "## Success Criteria",
    "",
    `- packsWithContent: ${report.successCriteria?.packsWithContent ?? 0}`,
    `- explainableItems: ${report.successCriteria?.explainableItems ?? 0}`,
    `- selectedOrContentItems: ${report.successCriteria?.selectedOrContentItems ?? 0}`,
    "",
    "## Lineage",
    "",
    ...report.packs.flatMap((pack) => [
      `### ${pack.key}`,
      "",
      `- status: ${pack.status}`,
      `- interestId: ${pack.interestId ?? "n/a"}`,
      `- discoveryRunId: ${pack.runId ?? "n/a"}`,
      `- artifactTypes: ${(pack.artifactTypes ?? []).join(", ") || "none"}`,
      `- candidates: ${pack.candidates.length}`,
      `- routingAttempts: ${pack.routingAttempts.length}`,
      `- channelId: ${pack.routed?.channelId ?? "n/a"}`,
      `- channelUrl: ${pack.routed?.channelUrl || "n/a"}`,
      `- channelProviderType: ${pack.routed?.channelProviderType || "n/a"}`,
      `- outboxEvents: ${pack.outboxEvents.length}`,
      `- fetchRuns: ${pack.fetchRuns.length}`,
      `- fetchRunSummaries: ${JSON.stringify(pack.fetchRunSummaries ?? [])}`,
      `- webResources: ${pack.webResources.length}`,
      `- signal_candidates: ${pack.signal_candidates.length}`,
      `- contentItems: ${pack.contentItems.length}`,
      `- explainableItems: ${pack.explainableItems.length}`,
      "",
      ...(pack.explainableItems.slice(0, 5).map((item) => `- ${item.kind} ${item.id}: ${item.title ?? item.url ?? "untitled"}`)),
      "",
    ]),
    "## Gaps",
    "",
    ...(report.gaps.length ? report.gaps.map((gap) => `- ${gap.category}: ${gap.message}`) : ["- none"]),
    "",
    "## Provider Telemetry",
    "",
    ...(report.providerTelemetry?.length
      ? report.providerTelemetry.map((entry) => `- ${entry.pack}: ${entry.message}`)
      : ["- none"]),
    "",
    "## MCP Calls",
    "",
    ...report.mcpCalls.map((call) => `- ${call.name}`),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

async function persist(report) {
  report.finishedAt = new Date().toISOString();
  const jsonPath = `/tmp/signalops-discovery-vnext-mcp-live-signal-flow-${report.runId}.json`;
  const mdPath = `/tmp/signalops-discovery-vnext-mcp-live-signal-flow-${report.runId}.md`;
  report.artifacts = { jsonPath, mdPath };
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(mdPath, markdown(report), "utf8");
  log(`wrote ${jsonPath}`);
  log(`wrote ${mdPath}`);
}

async function runFlow(harness, token, args, env) {
  const report = {
    kind: "discovery-vnext-mcp-live-signal-flow",
    runId: harness.runId,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: "running",
    preflightOnly: args.preflightOnly,
    maxCostCents: Number(envValue(env, "DISCOVERY_MCP_LIVE_GAP_MAX_COST_CENTS", "0")),
    env: {
      DISCOVERY_ENABLED: envValue(env, "DISCOVERY_ENABLED"),
      DISCOVERY_SEARCH_PROVIDER: envValue(env, "DISCOVERY_SEARCH_PROVIDER", "ddgs"),
      DISCOVERY_MCP_LIVE_GAP_MAX_COST_CENTS: envValue(env, "DISCOVERY_MCP_LIVE_GAP_MAX_COST_CENTS"),
    },
    preflight: {},
    packs: [],
    gaps: [],
    providerTelemetry: [],
    proofIsolation: {},
    mcpCalls: [],
    successCriteria: {},
    artifacts: {},
  };
  const preflightOk = await runPreflight(harness, token, report, env, args);
  if (!preflightOk || args.preflightOnly) {
    report.status = preflightOk ? "preflight_passed" : "failed";
    await persist(report);
    if (!preflightOk) throw new Error("Live signal preflight failed.");
    return report;
  }
  await readGuidance(harness, token, report);
  await archivePriorProofInterests(harness, token, report);
  for (const pack of SIGNAL_PACKS) {
    try {
      await runPack(harness, token, report, pack);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const packReport = report.packs.find((entry) => entry.key === pack.key);
      if (packReport) packReport.status = "provider_no_candidates";
      if (/No discovery candidates returned/i.test(message)) {
        report.providerTelemetry.push({
          pack: pack.key,
          category: "provider_gap",
          message,
        });
      } else {
        report.gaps.push({
          category: "runtime_gap",
          message: `${pack.key} failed: ${message}`,
        });
      }
    }
  }
  summarizeStatus(report);
  await persist(report);
  if (report.status !== "passed") {
    throw new Error(`Live signal flow failed with ${report.gaps.length} gap(s). See ${report.artifacts.jsonPath}`);
  }
  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = await readEnvFile(".env.dev");
  const harness = createHarness({ logPrefix: "discovery-vnext-mcp-live-signal" });
  await harness.setup({ rebuild: !args.skipBuild });
  try {
    const issued = await harness.issueToken({
      label: `discovery-live-signal-${harness.runId}`,
      scopes: "read,write.discovery,write.channels,write.sequences,write.templates,write.destructive",
    });
    await runFlow(harness, issued.token, args, env);
  } finally {
    await harness.cleanup();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
}
