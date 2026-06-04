import { writeFile } from "node:fs/promises";
import process from "node:process";

import {
  createHarness as createVerificationClient,
  createLogger,
  readEnvFile,
  runCommand,
} from "./lib/mcp-http-testkit.mjs";

const log = createLogger("outsourcing-mcp-verification");

const DEFAULT_POLL_WINDOWS_MINUTES = [15, 45, 90];
const SHORT_WAIT_MS = 10_000;
const CONTENT_WAIT_MS = 5 * 60 * 1000;
const DISCOVERY_WAIT_MS = 15 * 60 * 1000;

const EXCLUDED_GEO_CONSTRAINTS = {
  excludedCountries: ["Russia", "China"],
  excludedCountryCodes: ["RU", "CN"],
  excludedDomains: [".ru", ".рф", ".cn"],
  note:
    "Provider search can return stray pages; reject or mark noise when candidate evidence is Russia/China-centered.",
};

const OUTSOURCING_SIGNAL_PACKS = [
  {
    key: "public_procurement_software",
    name: "Public procurement software outsourcing signals",
    description:
      "Find RFP, tender, procurement notice and contract opportunity sources for software delivery, modernization and implementation work.",
    geographies: ["global"],
    languages: ["en", "es", "fr", "de", "pt", "pl", "nl", "it"],
    positiveTexts: [
      "request for proposal software development vendor",
      "public tender application modernization implementation partner",
      "procurement notice digital services software delivery",
      "contract opportunity custom software development",
    ],
    negativeTexts: [
      "vendor marketing page without buyer notice",
      "generic procurement advice article",
      "job advertisement without contract buyer evidence",
    ],
    candidatePositiveSignals: [
      "buyer_notice: RFP, RFQ, tender, procurement notice, call for bids, buyer organization",
      "project_scope: software development, application modernization, digital service implementation, integration",
      "commercial_evidence: deadline, budget, award notice, procurement portal, contact instructions",
    ],
    candidateNegativeSignals: [
      "seller_promo: outsourcing agency service page without buyer ask",
      "employment_only: internal job opening without vendor search",
      "wrapper_only: category/search/listing page without project detail",
    ],
    evidenceTerms: [
      "rfp",
      "tender",
      "procurement",
      "software",
      "development",
      "implementation",
      "modernization",
      "vendor",
      "contract",
      "deadline",
    ],
  },
  {
    key: "startup_hiring_delivery_gap",
    name: "Startup hiring and delivery gap signals",
    description:
      "Find hiring bursts, fractional CTO asks, roadmap pressure and explicit vendor/team requests that imply a company may need external software delivery capacity.",
    geographies: ["global"],
    languages: ["en", "es", "fr", "de", "pt", "pl", "nl"],
    positiveTexts: [
      "startup looking for development team build MVP",
      "need fractional CTO and software delivery partner",
      "hiring spike engineering roadmap blocked outsourcing",
      "seeking external developers product launch deadline",
    ],
    negativeTexts: [
      "generic hiring post without vendor or delivery ask",
      "outsourcing agency marketing blog",
      "career page with no project or procurement signal",
    ],
    candidatePositiveSignals: [
      "delivery_gap: roadmap, MVP, launch deadline, backlog, blocked engineering capacity",
      "vendor_search: looking for agency, external developers, dev shop, implementation partner",
      "buyer_context: founder, startup, scaleup, product owner, CTO, operations lead",
    ],
    candidateNegativeSignals: [
      "jobs_only: internal recruiting without vendor ask",
      "seller_authored: agency advert or lead magnet",
      "generic_advice: how to hire developers without a current buyer/project",
    ],
    evidenceTerms: [
      "startup",
      "mvp",
      "roadmap",
      "fractional cto",
      "development team",
      "external developers",
      "agency",
      "partner",
      "launch",
      "outsourcing",
    ],
  },
  {
    key: "marketplace_forum_project_asks",
    name: "Marketplace and forum project ask signals",
    description:
      "Find project-detail asks on forums, marketplaces, repositories and Q&A communities where the buyer intent and software project are explicit.",
    geographies: ["global"],
    languages: ["en", "es", "fr", "de", "pt", "pl", "nl"],
    positiveTexts: [
      "looking for developer agency to build web app",
      "need software contractor integration project",
      "seeking team to develop marketplace app",
      "fixed price project custom software vendor",
    ],
    negativeTexts: [
      "category listing page without project details",
      "developer profile or seller portfolio",
      "generic tutorial or advice thread",
    ],
    candidatePositiveSignals: [
      "buyer_ask: looking for, need, seeking, request, help with, project owner",
      "project_object: web app, mobile app, integration, API, automation, marketplace, SaaS",
      "commercial_fit: budget, timeline, fixed price, proposal, contact, contractor, agency",
    ],
    candidateNegativeSignals: [
      "seller_profile: vendor portfolio, agency listing, freelancer profile",
      "navigation_wrapper: category, tag, search results, homepage",
      "advice_only: generic recommendations without a current project ask",
    ],
    evidenceTerms: [
      "looking for",
      "need",
      "seeking",
      "developer",
      "agency",
      "contractor",
      "project",
      "budget",
      "proposal",
      "integration",
    ],
  },
  {
    key: "migration_integration_deadline",
    name: "Migration and integration deadline signals",
    description:
      "Find deprecations, breaking changes, compliance deadlines and integration deadlines that can create demand for external implementation help.",
    geographies: ["global"],
    languages: ["en", "ja", "ko", "de", "fr", "es", "pt", "pl"],
    positiveTexts: [
      "API deprecation migration deadline integration support",
      "breaking change requires implementation partner",
      "compliance deadline software integration project",
      "legacy modernization migration vendor needed",
    ],
    negativeTexts: [
      "generic changelog without buyer or implementation pressure",
      "marketing launch blog",
      "tutorial without deadline or project demand",
    ],
    candidatePositiveSignals: [
      "deadline_pressure: deprecation, removed API, migration deadline, compliance date",
      "implementation_need: integration, upgrade, migration, modernization, data conversion",
      "buyer_trigger: affected users, customer notices, project requirements, vendor support ask",
    ],
    candidateNegativeSignals: [
      "source_only_changelog: no buyer/project follow-through",
      "tutorial_only: how-to without current project or procurement",
      "seller_promo: agency landing page about migrations",
    ],
    evidenceTerms: [
      "migration",
      "deprecation",
      "deadline",
      "integration",
      "breaking change",
      "upgrade",
      "modernization",
      "compliance",
      "implementation",
      "vendor",
    ],
  },
  {
    key: "funded_digital_projects",
    name: "Funded digital project signals",
    description:
      "Find grants, awards, innovation calls and funded programs where organizations will need software delivery or implementation vendors.",
    geographies: ["global"],
    languages: ["en", "es", "fr", "de", "pt", "pl", "it", "nl"],
    positiveTexts: [
      "grant funded digital transformation software implementation",
      "innovation funding call software development project",
      "award notice platform development vendor",
      "funded program application modernization",
    ],
    negativeTexts: [
      "grant writing service advertisement",
      "closed archive without current opportunity",
      "generic university news without implementation project",
    ],
    candidatePositiveSignals: [
      "funding_signal: grant, award, funded program, call for proposals, innovation fund",
      "software_scope: platform, portal, app, automation, data system, modernization",
      "next_step: implementation partner, procurement, application deadline, project budget",
    ],
    candidateNegativeSignals: [
      "service_vendor: grant-writing or consulting promotion",
      "expired_only: closed opportunity with no current project path",
      "context_only: funding news without software implementation evidence",
    ],
    evidenceTerms: [
      "grant",
      "funded",
      "award",
      "innovation",
      "software",
      "implementation",
      "platform",
      "digital transformation",
      "deadline",
      "vendor",
    ],
  },
];

const REQUIRED_TOOLS = [
  "operator.funnel.audit",
  "operator.funnel.autoplan",
  "operator.funnel.iteration.recommend",
  "operator.tuning.recommend",
  "operator.effect.verify",
  "operator.report.verify",
  "discovery.source_families.coverage",
  "system_interests.create",
  "system_interests.update",
  "system_interests.read",
  "system_interests.list",
  "system_interests.compile_status.list",
  "llm_templates.list",
  "llm_templates.read",
  "discovery.runs.execute",
  "discovery.runs.read",
  "discovery.run_steps.list",
  "discovery.query_attempts.list",
  "discovery.llm_gateway_events.list",
  "discovery.artifacts.list",
  "discovery.candidates.list",
  "discovery.probe.plan_preview",
  "discovery.probe.execute",
  "discovery.understand.preview",
  "discovery.route.preview",
  "discovery.routing.apply",
  "discovery.probation.handoff",
  "discovery.source_inventory.list",
  "discovery.monitoring_state.list",
  "discovery.source_observations.list",
  "discovery.adapter_backlog.list",
  "discovery.feedback.submit",
  "channels.read",
  "channels.sync.request",
  "outbox.events.list",
  "fetch_runs.list",
  "web_resources.list",
  "articles.list",
  "articles.explain",
  "content_items.list",
  "content_items.explain",
  "maintenance.reindex.request",
  "maintenance.reindex_jobs.list",
  "sequences.plugins.list",
];

const REQUIRED_RESOURCES = [
  "signalops://guide/scenarios/discovery-live-gap-hunting",
  "signalops://guide/scenarios/funnel-calibration",
  "signalops://guide/operating-model",
];

const REQUIRED_PROMPTS = [
  "discovery.live_gap_hunting.plan",
  "operator.funnel.calibrate",
  "operations.daily_review",
];

function parseArgs(argv) {
  const pollArg = argv.find((arg) => arg.startsWith("--poll-windows="));
  const pollWindows = pollArg
    ? pollArg
        .slice("--poll-windows=".length)
        .split(",")
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isFinite(value) && value >= 0)
    : DEFAULT_POLL_WINDOWS_MINUTES;
  return {
    preflightOnly: argv.includes("--preflight-only"),
    skipBuild: argv.includes("--skip-build"),
    retainState: argv.includes("--retain-state"),
    skipScheduleCheck: argv.includes("--skip-schedule-check"),
    pollWindows,
  };
}

function envValue(env, key, fallback = "") {
  return String(process.env[key] ?? env[key] ?? fallback).trim();
}

function configured(value) {
  const normalized = String(value ?? "").trim();
  return Boolean(normalized && normalized !== "replace-me" && normalized !== "0" && normalized !== "{}");
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
  return String(valueFrom(candidate, ["canonical_url", "canonicalUrl", "sourceUrl", "url"]) ?? "");
}

function canonicalDomain(candidate) {
  const explicit = String(valueFrom(candidate, ["canonical_domain", "canonicalDomain", "domain"]) ?? "").trim();
  if (explicit) return explicit;
  try {
    return new URL(canonicalUrl(candidate)).hostname;
  } catch {
    return "";
  }
}

function stringifyEvidence(value, depth = 0) {
  if (value == null || depth > 4) return "";
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

function excludedGeoEvidence(value) {
  const haystack = stringifyEvidence(value).toLowerCase();
  return (
    /\.ru\b|\.xn--p1ai\b|\.cn\b|russia|russian federation|росси|china|chinese mainland|beijing|shanghai/u.test(haystack)
  );
}

function classifyError(error, fallbackCategory = "runtime_gap") {
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
  return fallbackCategory;
}

function summarizeError(error) {
  return {
    message: error instanceof Error ? error.message : String(error),
    name: error?.name ?? null,
    diagnostics: error?.mcpDiagnostics ?? error?.httpDiagnostics ?? null,
  };
}

function recordGap(report, category, message, context = {}) {
  const gap = {
    category,
    message,
    context,
    at: new Date().toISOString(),
  };
  report.gaps.push(gap);
  log(`${category}: ${message}`);
  return gap;
}

async function mcp(report, client, token, name, args = {}, options = {}) {
  report.mcpCalls.push({ name, args, at: new Date().toISOString() });
  try {
    const result = await client.mcpToolCall(token, name, args, {
      timeoutMs: 120_000,
      ...options,
    });
    return result;
  } catch (error) {
    recordGap(report, options.gapCategory ?? classifyError(error), `${name} failed`, {
      args,
      error: summarizeError(error),
    });
    if (options.optional) return null;
    throw error;
  }
}

async function safeMcp(report, client, token, name, args = {}, options = {}) {
  return mcp(report, client, token, name, args, { ...options, optional: true });
}

async function waitFor(label, fn, { timeoutMs = CONTENT_WAIT_MS, intervalMs = SHORT_WAIT_MS } = {}) {
  const started = Date.now();
  let lastValue = null;
  while (Date.now() - started < timeoutMs) {
    lastValue = await fn();
    if (lastValue) return lastValue;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for ${label}. Last value: ${JSON.stringify(lastValue)?.slice(0, 800)}`);
}

function buildInterestPayload(pack, namespace, iteration = 0) {
  const iterationNote = iteration > 0 ? ` Quality iteration ${iteration}.` : "";
  return {
    name: `${pack.name} [${namespace}]`,
    description:
      `${pack.description} Outsourcing client-signal MCP verification pack ${pack.key}. ` +
      `Exclude Russia and China; prefer buyer-authored project/vendor-search evidence over seller-authored marketing.${iterationNote}`,
    positive_texts: pack.positiveTexts,
    negative_texts: pack.negativeTexts,
    must_have_terms: "",
    must_not_have_terms: [
      "Russia-centered or China-centered source unless the page is explicitly about non-Russia/non-China buyer demand",
      "outsourcing agency service page without buyer-authored project evidence",
      "job-only page without vendor, contractor, RFP, proposal, or external delivery ask",
      "category, tag, search, profile, or listing wrapper without project details",
      "generic how-to article, market report, or SEO page without a current buyer signal",
    ],
    places: pack.geographies,
    languages_allowed: pack.languages,
    time_window_hours: 24 * 365,
    allowed_content_kinds: ["editorial", "listing", "document"],
    short_tokens_required: "",
    short_tokens_forbidden: "",
    candidate_positive_signals: pack.candidatePositiveSignals,
    candidate_negative_signals: [
      ...pack.candidateNegativeSignals,
      "excluded_geo: Russia or China centered evidence",
      "seller_only: vendor-authored marketing without current buyer/project ask",
      iteration > 0
        ? `quality_iteration_${iteration}: demote repeated wrapper/seller/jobs-only noise found during verification`
        : "quality_baseline: keep rare-signal recall broad but require independent buyer/project evidence",
    ],
    selection_profile_strictness: "balanced",
    selection_profile_unresolved_decision: "hold",
    selection_profile_llm_review_mode: "optional_high_value_only",
    priority: "0.82",
    isActive: true,
  };
}

function buildDiscoveryInterest(pack, interestId) {
  return {
    interestId,
    name: pack.name,
    description: pack.description,
    positive_texts: pack.positiveTexts,
    negative_texts: pack.negativeTexts,
    candidate_positive_signals: pack.candidatePositiveSignals,
    candidate_negative_signals: pack.candidateNegativeSignals,
    geographies: pack.geographies,
    languages: pack.languages,
    operatorConstraints: EXCLUDED_GEO_CONSTRAINTS,
  };
}

function extractChannelId(handoff) {
  const direct = idFrom(handoff?.sourceInventory, [
    "registered_channel_id",
    "registeredChannelId",
    "channel_id",
    "channelId",
  ]);
  if (direct) return direct;
  for (const row of handoff?.registrarResults ?? []) {
    const channelId = idFrom(row, ["channel_id", "channelId"]);
    if (channelId) return channelId;
  }
  return null;
}

async function runBootstrap(client, args, report) {
  if (!args.preflightOnly && !args.retainState) {
    report.bootstrap.cleanSlate = {
      command: "pnpm dev:mvp:internal:down:volumes",
      startedAt: new Date().toISOString(),
    };
    runCommand("pnpm", ["dev:mvp:internal:down:volumes"], { allowFailure: true });
    report.bootstrap.cleanSlate.finishedAt = new Date().toISOString();
  } else {
    report.bootstrap.cleanSlate = {
      skipped: true,
      reason: args.preflightOnly ? "preflight-only" : "retain-state",
    };
  }
  await client.setup({ rebuild: !args.skipBuild });
  report.bootstrap.stackStarted = true;
}

async function runPreflight(client, token, report, env, args) {
  const failures = [];
  if (envValue(env, "DISCOVERY_ENABLED") !== "1") failures.push("DISCOVERY_ENABLED=1 is required.");
  if (!args.preflightOnly && Number(envValue(env, "DISCOVERY_MCP_LIVE_GAP_MAX_COST_CENTS", "0")) <= 0) {
    failures.push("DISCOVERY_MCP_LIVE_GAP_MAX_COST_CENTS must be a positive integer.");
  }
  if (!configured(envValue(env, "DISCOVERY_SEARCH_PROVIDER"))) failures.push("DISCOVERY_SEARCH_PROVIDER is required.");
  const provider = envValue(env, "DISCOVERY_SEARCH_PROVIDER");
  if (provider === "brave" && !configured(envValue(env, "DISCOVERY_BRAVE_API_KEY"))) {
    failures.push("DISCOVERY_BRAVE_API_KEY is required when DISCOVERY_SEARCH_PROVIDER=brave.");
  }
  if (provider === "serper" && !configured(envValue(env, "DISCOVERY_SERPER_API_KEY"))) {
    failures.push("DISCOVERY_SERPER_API_KEY is required when DISCOVERY_SEARCH_PROVIDER=serper.");
  }
  if (!configured(envValue(env, "DISCOVERY_GEMINI_API_KEY")) && !configured(envValue(env, "GEMINI_API_KEY"))) {
    failures.push("DISCOVERY_GEMINI_API_KEY or GEMINI_API_KEY is required.");
  }
  if (!configured(envValue(env, "DISCOVERY_GEMINI_MODEL")) && !configured(envValue(env, "GEMINI_MODEL"))) {
    failures.push("DISCOVERY_GEMINI_MODEL or GEMINI_MODEL is required.");
  }
  if (!configured(envValue(env, "DISCOVERY_GEMINI_BASE_URL")) && !configured(envValue(env, "GEMINI_BASE_URL"))) {
    failures.push("DISCOVERY_GEMINI_BASE_URL or GEMINI_BASE_URL is required.");
  }

  const initialize = await client.mcpRpc(token, "initialize", {});
  if (String(initialize?.result?.serverInfo?.name ?? "") !== "signalops-mcp") {
    failures.push("MCP initialize did not return signalops-mcp.");
  }

  const [toolsList, resourcesList, promptsList] = await Promise.all([
    client.mcpRpc(token, "tools/list", {}),
    client.mcpRpc(token, "resources/list", {}),
    client.mcpRpc(token, "prompts/list", {}),
  ]);
  report.mcpCalls.push(
    { name: "initialize", args: {}, at: new Date().toISOString() },
    { name: "tools/list", args: {}, at: new Date().toISOString() },
    { name: "resources/list", args: {}, at: new Date().toISOString() },
    { name: "prompts/list", args: {}, at: new Date().toISOString() }
  );

  const tools = new Set((toolsList?.result?.tools ?? []).map((tool) => String(tool.name)));
  const resources = new Set((resourcesList?.result?.resources ?? []).map((resource) => String(resource.uri)));
  const prompts = new Set((promptsList?.result?.prompts ?? []).map((prompt) => String(prompt.name)));
  for (const tool of REQUIRED_TOOLS) if (!tools.has(tool)) failures.push(`Missing MCP tool: ${tool}`);
  for (const resource of REQUIRED_RESOURCES) if (!resources.has(resource)) failures.push(`Missing MCP resource: ${resource}`);
  for (const prompt of REQUIRED_PROMPTS) if (!prompts.has(prompt)) failures.push(`Missing MCP prompt: ${prompt}`);

  const failClosed = await client.mcpToolCall(
    token,
    "discovery.runs.execute",
    {
      runKind: "candidate_acquisition",
      triggerKind: "mcp",
      request: {
        interest: {
          interestId: `outsourcing-fail-${report.runId}`,
          name: "Outsourcing fail-closed budget check",
          description: "Budget zero must fail before provider execution.",
        },
      },
      budget: { maxRunCostCents: 0 },
      liveProviderExecution: true,
      createdBy: `outsourcing-verification:${report.runId}`,
    },
    { expectError: true }
  );
  report.mcpCalls.push({
    name: "discovery.runs.execute",
    args: { runKind: "candidate_acquisition", budget: { maxRunCostCents: 0 }, liveProviderExecution: true },
    at: new Date().toISOString(),
  });
  if (!failClosed?.error) failures.push("Live fail-closed budget proof did not fail.");

  report.preflight = {
    tools: tools.size,
    resources: resources.size,
    prompts: prompts.size,
    failClosedMessage: String(failClosed?.error?.message ?? ""),
    failures,
  };
  for (const failure of failures) recordGap(report, "preflight_gap", failure);
  return failures.length === 0;
}

async function readGuidance(client, token, report) {
  for (const uri of REQUIRED_RESOURCES) {
    await client.mcpResourceRead(token, uri);
    report.mcpCalls.push({ name: "resources/read", args: { uri }, at: new Date().toISOString() });
  }
  for (const prompt of REQUIRED_PROMPTS) {
    await client.mcpPromptGet(token, prompt, {
      objective: "prove outsourcing client-signal funnel from system interests to discovered sources and quality-polished MCP evidence",
      referenceEvidence: "operator-provided Live MCP Verification Plan: Outsourcing Client-Signal Funnel",
      currentGap: "unknown source and quality gaps for outsourcing client-signal discovery",
      scenarioPacks: OUTSOURCING_SIGNAL_PACKS.map((pack) => pack.key).join(", "),
      budget: `max ${report.maxCostCents} cents`,
    });
    report.mcpCalls.push({ name: "prompts/get", args: { name: prompt }, at: new Date().toISOString() });
  }
  await mcp(report, client, token, "operator.funnel.audit", {
    objective: "Outsourcing client-signal funnel verification",
    referenceEvidenceKind: "portable_funnel_guidance",
    referenceText:
      "Find ordinary and hidden signals that a non-Russia/non-China organization is seeking outsourced software development, implementation, integration, modernization or delivery capacity.",
    includeDiscovery: true,
    includeSamples: false,
  });
  await mcp(report, client, token, "operator.funnel.autoplan", {
    objective: "Outsourcing client-signal funnel verification",
    rareSignal: true,
    maxNewChannels: 25,
    includeSamples: false,
  });
  await mcp(report, client, token, "operator.funnel.iteration.recommend", {
    objective: "Outsourcing client-signal funnel verification",
    includeSamples: false,
  });
  await mcp(report, client, token, "discovery.source_families.coverage", { includeExamples: false });
  await mcp(report, client, token, "operator.report.verify", {
    reportKind: "source_family_balance",
    entityIds: {},
    includeSamples: false,
  });
}

async function createInterest(client, token, report, pack) {
  const namespace = `outsourcing-${report.runId.slice(0, 8)}`;
  const created = await mcp(report, client, token, "system_interests.create", {
    payload: buildInterestPayload(pack, namespace),
  });
  const interestId = idFrom(created, ["entityId", "interestTemplateId", "systemInterestId", "interestId"]);
  if (!interestId) throw new Error(`system_interests.create did not return an id for ${pack.key}.`);
  const readBack = await mcp(report, client, token, "system_interests.read", { interestTemplateId: interestId });
  report.readAfterWrite.push({ entity: "system_interest", id: interestId, tool: "system_interests.read", ok: Boolean(readBack) });
  return interestId;
}

async function runDiscovery(client, token, report, pack, interestId) {
  const perPackBudget = Math.max(1, Math.floor(report.maxCostCents / OUTSOURCING_SIGNAL_PACKS.length));
  const run = await mcp(
    report,
    client,
    token,
    "discovery.runs.execute",
    {
      runKind: "full",
      triggerKind: "mcp",
      request: {
        interest: buildDiscoveryInterest(pack, interestId),
        maxBatches: 2,
        maxCandidates: 25,
        maxProbeRequests: 10,
        maxBrowserProbeRequests: 0,
        searchProvider: envValue(report.env, "DISCOVERY_SEARCH_PROVIDER", "ddgs"),
        timeRange: "m",
        budget: { maxRunCostCents: perPackBudget },
      },
      budget: {
        maxRunCostCents: perPackBudget,
        maxCandidates: 25,
        maxProbeRequests: 10,
        maxBrowserProbeRequests: 0,
      },
      liveProviderExecution: true,
      createdBy: `outsourcing-verification:${report.runId}`,
    },
    { timeoutMs: DISCOVERY_WAIT_MS, gapCategory: "provider_gap" }
  );
  const runId = idFrom(run?.run, ["vnext_run_id", "vnextRunId", "runId"]);
  if (!runId) throw new Error(`discovery.runs.execute did not return a run id for ${pack.key}.`);

  await mcp(report, client, token, "discovery.runs.read", { recordId: runId });
  const [stepsPage, attemptsPage, llmPage, artifactsPage, candidatesPage, inventoryPage, backlogPage] = await Promise.all([
    safeMcp(report, client, token, "discovery.run_steps.list", { page: 1, pageSize: 100, interestId }),
    safeMcp(report, client, token, "discovery.query_attempts.list", { page: 1, pageSize: 100, interestId }),
    safeMcp(report, client, token, "discovery.llm_gateway_events.list", { page: 1, pageSize: 100, interestId }),
    safeMcp(report, client, token, "discovery.artifacts.list", { page: 1, pageSize: 100, interestId }),
    safeMcp(report, client, token, "discovery.candidates.list", { page: 1, pageSize: 100, interestId }),
    safeMcp(report, client, token, "discovery.source_inventory.list", { page: 1, pageSize: 100, interestId }),
    safeMcp(report, client, token, "discovery.adapter_backlog.list", { page: 1, pageSize: 100, interestId }),
  ]);

  const artifacts = rows(artifactsPage).filter(
    (row) => idFrom(row, ["vnext_run_id", "vnextRunId"]) === runId || idFrom(row, ["interest_id", "interestId"]) === interestId
  );
  const candidates = rows(candidatesPage).filter(
    (row) => idFrom(row, ["vnext_run_id", "vnextRunId"]) === runId || idFrom(row, ["interest_id", "interestId"]) === interestId
  );
  const brief = artifactPayload(artifacts.find((artifact) => artifactType(artifact) === "DiscoveryBrief"));
  return {
    runId,
    brief,
    steps: rows(stepsPage),
    queryAttempts: rows(attemptsPage),
    llmEvents: rows(llmPage),
    artifacts,
    candidates,
    sourceInventory: rows(inventoryPage),
    adapterBacklog: rows(backlogPage),
  };
}

async function submitCandidateFeedback(client, token, report, packReport, candidate, feedbackType, reason) {
  const candidateId = idFrom(candidate, ["candidate_id", "candidateId"]);
  if (!candidateId) return null;
  return safeMcp(report, client, token, "discovery.feedback.submit", {
    targetType: "candidate",
    targetId: candidateId,
    feedbackType,
    feedback: {
      reason,
      verificationRunId: report.runId,
      signalPack: packReport.key,
      ...(feedbackType === "mark_useful"
        ? {
            usefulnessKind: "classification_usefulness",
            classificationCorrect: true,
            sourceUsefulAsClassified: true,
          }
        : {}),
    },
    createdBy: `outsourcing-verification:${report.runId}`,
  });
}

async function routeCandidate(client, token, report, pack, packReport, candidate) {
  const candidateUrl = canonicalUrl(candidate);
  if (!candidateUrl || !/^https?:\/\//iu.test(candidateUrl)) return null;
  const candidateId = idFrom(candidate, ["candidate_id", "candidateId"]);
  const candidateDomain = canonicalDomain(candidate);
  if (excludedGeoEvidence({ candidateUrl, candidateDomain, candidate })) {
    packReport.excludedGeoCandidates.push({ candidateId, candidateUrl, candidateDomain });
    await submitCandidateFeedback(client, token, report, packReport, candidate, "mark_noise", "Russia/China exclusion evidence.");
    return null;
  }

  const probePlan = await mcp(report, client, token, "discovery.probe.plan_preview", {
    candidateUrl,
    candidateKindGuess: String(valueFrom(candidate, ["candidate_kind_guess", "candidateKindGuess"]) ?? "website"),
    policy: {
      maxBrowserProbeRequests: 0,
      excludedGeoConstraints: EXCLUDED_GEO_CONSTRAINTS,
    },
  });
  const probePlanPayload = probePlan?.payload ?? probePlan;
  const probe = await mcp(
    report,
    client,
    token,
    "discovery.probe.execute",
    {
      probePlan: probePlanPayload,
      runId: packReport.runId,
      interestId: packReport.interestId,
      candidateId,
      createdBy: `outsourcing-verification:${report.runId}`,
    },
    { timeoutMs: 180_000, gapCategory: "provider_gap" }
  );
  const probeReport = probe?.probeReportArtifact?.payload_json ?? probe?.probeReportArtifact?.payloadJson;
  if (!probeReport) return null;

  const understanding = await mcp(report, client, token, "discovery.understand.preview", {
    discoveryBrief: packReport.brief,
    probeReport,
    candidate: {
      candidateId,
      canonicalUrl: candidateUrl,
      canonicalDomain: candidateDomain,
      candidateKindGuess: String(valueFrom(candidate, ["candidate_kind_guess", "candidateKindGuess"]) ?? "website"),
    },
  });
  const sourceUnderstanding = understanding?.payload ?? understanding?.sourceUnderstanding?.payload ?? understanding?.sourceUnderstanding ?? understanding;
  const routePreview = await mcp(report, client, token, "discovery.route.preview", {
    sourceUnderstanding,
    providerType: String(sourceUnderstanding?.suggestedProviderType ?? "website"),
    accessPattern: String(sourceUnderstanding?.accessPattern ?? "public"),
    policy: {
      excludedGeoConstraints: EXCLUDED_GEO_CONSTRAINTS,
    },
  });
  const routing = await mcp(report, client, token, "discovery.routing.apply", {
    sourceUnderstanding,
    canonicalUrl: candidateUrl,
    canonicalDomain: candidateDomain,
    sourceIdentityKey: `outsourcing:${report.runId}:${packReport.key}:${candidateUrl}`,
    providerType: String(sourceUnderstanding?.suggestedProviderType ?? "website"),
    accessPattern: String(sourceUnderstanding?.accessPattern ?? "public"),
    runId: packReport.runId,
    interestId: packReport.interestId,
    candidateId,
    createdBy: `outsourcing-verification:${report.runId}`,
  });
  const routingDecision =
    routing?.routingDecisionArtifact?.payload_json ?? routing?.routingDecisionArtifact?.payloadJson ?? routing?.routingDecision ?? routePreview;
  const sourceInventoryId = idFrom(routing?.sourceInventory, ["source_inventory_id", "sourceInventoryId"]);
  const decision = String(routingDecision?.decision ?? "");
  packReport.routingAttempts.push({ candidateId, candidateUrl, sourceInventoryId, decision });
  await submitCandidateFeedback(client, token, report, packReport, candidate, "mark_useful", "Candidate reached probe/understand/routing verification.");

  if (decision !== "auto_register_probation") {
    return { candidateId, candidateUrl, sourceInventoryId, routingDecision, sourceUnderstanding, decision, channelId: null };
  }

  const handoff = await mcp(report, client, token, "discovery.probation.handoff", {
    sourceUnderstanding,
    routingDecision,
    sourceInventoryId,
    providerType: String(sourceUnderstanding?.suggestedProviderType ?? "website"),
    createdBy: `outsourcing-verification:${report.runId}`,
  });
  const channelId = extractChannelId(handoff);
  if (!channelId) {
    packReport.routingAttempts.at(-1).handoffStatus = handoff?.status ?? "missing_channel";
    return null;
  }
  await mcp(report, client, token, "channels.read", { channelId });
  report.readAfterWrite.push({ entity: "source_channel", id: channelId, tool: "channels.read", ok: true });
  return { candidateId, candidateUrl, sourceInventoryId, routingDecision, sourceUnderstanding, handoff, channelId, decision };
}

function reportHasFetchedContent(report) {
  return report.packs.some(
    (pack) =>
      (pack.webResources.length > 0 || pack.articles.length > 0 || pack.contentItems.length > 0) &&
      pack.explainableItems.length > 0
  );
}

async function proveContentTail(client, token, report, pack, packReport, routed, options = {}) {
  if (!routed.channelId) return;
  const channelId = routed.channelId;
  const timeoutMs = options.timeoutMs ?? CONTENT_WAIT_MS;
  let outbox = await safeMcp(report, client, token, "outbox.events.list", {
    eventType: "source.channel.sync.requested",
    aggregateType: "source_channel",
    aggregateId: channelId,
    limit: 20,
  });
  if (rows(outbox).length === 0) {
    await mcp(report, client, token, "channels.sync.request", {
      channelId,
      reason: `outsourcing client-signal verification ${report.runId}`,
    });
    outbox = await safeMcp(report, client, token, "outbox.events.list", {
      eventType: "source.channel.sync.requested",
      aggregateType: "source_channel",
      aggregateId: channelId,
      limit: 20,
    });
  }
  packReport.outboxEvents = rows(outbox);

  const fetchRunsPage = await waitFor(`fetch run for ${channelId}`, async () => {
    const page = await safeMcp(report, client, token, "fetch_runs.list", { channelId, page: 1, pageSize: 20 });
    return rows(page).length > 0 ? page : null;
  }, { timeoutMs });
  packReport.fetchRuns = rows(fetchRunsPage);

  const resourcesPage = await waitFor(`web resources for ${channelId}`, async () => {
    const page = await safeMcp(report, client, token, "web_resources.list", { channelId, page: 1, pageSize: 20 });
    return rows(page).length > 0 ? page : null;
  }, { timeoutMs });
  packReport.webResources = rows(resourcesPage);

  const articlesPage = await safeMcp(report, client, token, "articles.list", { channelId, page: 1, pageSize: 20 });
  packReport.articles = rows(articlesPage);
  for (const article of packReport.articles.slice(0, 5)) {
    const docId = idFrom(article, ["doc_id", "docId"]);
    if (!docId) continue;
    const explain = await safeMcp(report, client, token, "articles.explain", { docId });
    if (explain && signalScore(pack, { article, explain }) > 0) {
      packReport.explainableItems.push({ kind: "article", id: docId, title: article.title ?? null, url: article.url ?? null });
      report.docIds.add(docId);
    }
  }

  const contentItemsPage = await safeMcp(report, client, token, "content_items.list", { channelId, page: 1, pageSize: 20 });
  packReport.contentItems = rows(contentItemsPage);
  for (const item of packReport.contentItems.slice(0, 5)) {
    const contentItemId = idFrom(item, ["content_item_id", "contentItemId"]);
    if (!contentItemId) continue;
    const explain = await safeMcp(report, client, token, "content_items.explain", { contentItemId });
    if (explain && signalScore(pack, { item, explain }) > 0) {
      packReport.explainableItems.push({ kind: "content_item", id: contentItemId, title: item.title ?? null, url: item.url ?? null });
    }
  }

  await safeMcp(report, client, token, "operator.report.verify", {
    reportKind: "channel_onboarding",
    entityIds: { channelIds: [channelId] },
    includeSamples: true,
  });
  await safeMcp(report, client, token, "operator.report.verify", {
    reportKind: "website_pipeline",
    entityIds: { channelIds: [channelId] },
    includeSamples: true,
  });
}

async function runPack(client, token, report, pack) {
  const packReport = {
    key: pack.key,
    status: "started",
    interestId: null,
    runId: null,
    steps: [],
    queryAttempts: [],
    llmEvents: [],
    candidates: [],
    artifacts: [],
    sourceInventory: [],
    adapterBacklog: [],
    excludedGeoCandidates: [],
    routingAttempts: [],
    outboxEvents: [],
    fetchRuns: [],
    webResources: [],
    articles: [],
    contentItems: [],
    explainableItems: [],
  };
  report.packs.push(packReport);
  packReport.interestId = await createInterest(client, token, report, pack);
  const discovery = await runDiscovery(client, token, report, pack, packReport.interestId);
  Object.assign(packReport, discovery, {
    artifactTypes: [...new Set(discovery.artifacts.map(artifactType).filter(Boolean))].sort(),
  });

  if (!packReport.brief) {
    recordGap(report, "diagnostic_gap", `${pack.key} did not expose a DiscoveryBrief artifact.`);
  }
  if (packReport.candidates.length === 0) {
    packReport.status = packReport.queryAttempts.length > 0 ? "provider_attempts_no_candidates" : "no_provider_evidence";
    recordGap(report, "provider_gap", `${pack.key} produced no candidates.`, {
      queryAttempts: packReport.queryAttempts.length,
      runId: packReport.runId,
    });
    return packReport;
  }

  const preferred = packReport.candidates
    .filter((candidate) => /^https?:\/\//iu.test(canonicalUrl(candidate)))
    .filter((candidate) => !/google\.com|bing\.com|duckduckgo\.com|search\./iu.test(canonicalDomain(candidate)))
    .sort((left, right) => signalScore(pack, right) - signalScore(pack, left))
    .slice(0, 10);

  for (const candidate of preferred) {
    const routed = await routeCandidate(client, token, report, pack, packReport, candidate);
    if (!routed) continue;
    if (routed.sourceInventoryId) {
      report.sourceEvidenceIds.add(routed.sourceInventoryId);
    }
    if (!routed.channelId) continue;
    packReport.routed = {
      channelId: routed.channelId,
      candidateId: routed.candidateId,
      candidateUrl: routed.candidateUrl,
      sourceInventoryId: routed.sourceInventoryId,
    };
    report.channelIds.add(routed.channelId);
    const alreadyHasContentEvidence = reportHasFetchedContent(report);
    try {
      await proveContentTail(client, token, report, pack, packReport, routed, {
        timeoutMs: alreadyHasContentEvidence ? 30_000 : CONTENT_WAIT_MS,
      });
    } catch (error) {
      packReport.routingAttempts.at(-1).fetchStatus = "no_fetched_content";
      packReport.routingAttempts.at(-1).fetchError = error instanceof Error ? error.message : String(error);
      if (alreadyHasContentEvidence) {
        packReport.status = "routed_or_backlog_without_content";
        return packReport;
      }
      continue;
    }
    if (
      (packReport.webResources.length > 0 || packReport.articles.length > 0 || packReport.contentItems.length > 0) &&
      packReport.explainableItems.length > 0
    ) {
      packReport.status = "signal_content_fetched";
      return packReport;
    }
  }

  packReport.status =
    packReport.routingAttempts.length > 0 || packReport.adapterBacklog.length > 0
      ? "routed_or_backlog_without_content"
      : "candidates_without_routing";
  return packReport;
}

async function runQualityIterations(client, token, report) {
  const targetPacks = report.packs.filter((pack) => pack.interestId).slice(0, 2);
  for (let index = 0; index < 2; index += 1) {
    const iteration = index + 1;
    const recommendation = await mcp(report, client, token, "operator.funnel.iteration.recommend", {
      objective: `Outsourcing client-signal verification quality iteration ${iteration}`,
      includeSamples: true,
    });
    const tuning = await mcp(report, client, token, "operator.tuning.recommend", {
      domain: "selection",
      objective: "increase_precision",
      includeSamples: true,
      residualBucket: "outsourcing_client_signal_noise",
    });
    const target = targetPacks[index % targetPacks.length];
    if (target) {
      const pack = OUTSOURCING_SIGNAL_PACKS.find((entry) => entry.key === target.key);
      await mcp(report, client, token, "system_interests.update", {
        payload: {
          interestTemplateId: target.interestId,
          ...buildInterestPayload(pack, `outsourcing-${report.runId.slice(0, 8)}`, iteration),
        },
      });
      await mcp(report, client, token, "system_interests.read", { interestTemplateId: target.interestId });
      report.readAfterWrite.push({
        entity: "system_interest",
        id: target.interestId,
        tool: "system_interests.read",
        ok: true,
        iteration,
      });
    }
    await safeMcp(report, client, token, "operator.report.verify", {
      reportKind: "funnel_calibration",
      entityIds: { targetIds: targetPacks.map((pack) => pack.interestId).filter(Boolean) },
      includeSamples: true,
    });
    report.qualityIterations.push({
      iteration,
      recommendationStatus: recommendation ? "ok" : "missing",
      tuningStatus: tuning ? "ok" : "missing",
      updatedInterestId: target?.interestId ?? null,
    });
  }

  const docIds = [...report.docIds].slice(0, 50);
  const firstInterestId = targetPacks[0]?.interestId;
  const reindex = await mcp(report, client, token, "maintenance.reindex.request", {
    payload: {
      indexName: "interest_centroids",
      jobKind: "backfill",
      options: {
        ...(docIds.length > 0 ? { docIds } : {}),
        ...(firstInterestId ? { interestId: firstInterestId } : {}),
        batchSize: 25,
        retroNotifications: "skip",
        reason: `Outsourcing client-signal verification quality polish ${report.runId}`,
      },
    },
  });
  report.reindex = {
    reindexJobId: idFrom(reindex, ["reindexJobId", "reindex_job_id"]),
    docIds,
  };
  await safeMcp(report, client, token, "maintenance.reindex_jobs.list", { page: 1, pageSize: 20 });
  await safeMcp(report, client, token, "operator.effect.verify", {
    domain: "selection",
    changeRef: `outsourcing client-signal quality polish ${report.runId}`,
    entityIds: {
      targetIds: targetPacks.map((pack) => pack.interestId).filter(Boolean),
      channelIds: [...report.channelIds],
    },
    baselineWindowHours: 24,
    comparisonWindowHours: 1,
    includeSamples: true,
  });
  await safeMcp(report, client, token, "operator.report.verify", {
    reportKind: "selection",
    entityIds: {
      targetIds: targetPacks.map((pack) => pack.interestId).filter(Boolean),
      channelIds: [...report.channelIds],
    },
    includeSamples: true,
  });
}

async function runPollingWindows(client, token, report, pollWindows) {
  const started = Date.now();
  let previousMinute = 0;
  for (const minute of pollWindows) {
    const waitMs = Math.max(0, (minute - previousMinute) * 60 * 1000);
    previousMinute = minute;
    if (waitMs > 0) {
      log(`waiting for polling window T+${minute} minutes`);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    const observation = {
      minute,
      observedAt: new Date().toISOString(),
      channels: [],
      discovery: {},
    };
    for (const channelId of [...report.channelIds]) {
      const [fetchRuns, webResources, articles, contentItems] = await Promise.all([
        safeMcp(report, client, token, "fetch_runs.list", { channelId, page: 1, pageSize: 20 }),
        safeMcp(report, client, token, "web_resources.list", { channelId, page: 1, pageSize: 20 }),
        safeMcp(report, client, token, "articles.list", { channelId, page: 1, pageSize: 20 }),
        safeMcp(report, client, token, "content_items.list", { channelId, page: 1, pageSize: 20 }),
      ]);
      observation.channels.push({
        channelId,
        fetchRuns: rows(fetchRuns).length,
        webResources: rows(webResources).length,
        articles: rows(articles).length,
        contentItems: rows(contentItems).length,
      });
    }
    const [monitoring, observations, backlog] = await Promise.all([
      safeMcp(report, client, token, "discovery.monitoring_state.list", { page: 1, pageSize: 50 }),
      safeMcp(report, client, token, "discovery.source_observations.list", { page: 1, pageSize: 50 }),
      safeMcp(report, client, token, "discovery.adapter_backlog.list", { page: 1, pageSize: 50 }),
    ]);
    observation.discovery = {
      monitoringState: rows(monitoring).length,
      sourceObservations: rows(observations).length,
      adapterBacklog: rows(backlog).length,
    };
    report.pollingObservations.push(observation);
  }
  report.pollingElapsedMs = Date.now() - started;
}

async function checkScheduling(client, token, report, args) {
  if (args.skipScheduleCheck) {
    report.scheduling = { status: "skipped" };
    return;
  }
  const plugins = await mcp(report, client, token, "sequences.plugins.list", {});
  const pluginRows = rows(plugins);
  const suitable = pluginRows.find((plugin) => {
    const searchable = [plugin.module, plugin.category].filter(Boolean).join(" ");
    return /\b(channel|fetch|monitor|poll|source)\b/iu.test(searchable);
  });
  report.scheduling = suitable
    ? {
        status: "not_created",
        reason:
          "A possibly relevant sequence plugin exists, but this verification leaves persistent scheduling to source-channel polling unless the operator explicitly asks for a durable sequence.",
        candidatePlugin: suitable,
      }
    : {
        status: "sequence_gap_recorded",
        reason:
          "No unambiguous MCP sequence plugin for recurring outsourcing signal monitoring was selected; verification relies on channel polling cadence and explicit polling windows.",
      };
}

function summarizeStatus(report) {
  const packsWithCandidatesOrProviderEvidence = report.packs.filter(
    (pack) => pack.candidates.length > 0 || pack.queryAttempts.length > 0 || pack.status === "provider_attempts_no_candidates"
  );
  const packsWithCandidates = report.packs.filter((pack) => pack.candidates.length > 0);
  const sourcesRoutedOrBacklog = report.packs.filter(
    (pack) => pack.routingAttempts.length > 0 || pack.adapterBacklog.length > 0 || pack.sourceInventory.length > 0
  );
  const contentEvidence = report.packs.filter(
    (pack) => pack.webResources.length > 0 || pack.articles.length > 0 || pack.contentItems.length > 0 || pack.explainableItems.length > 0
  );
  const explainableItems = report.packs.reduce((count, pack) => count + pack.explainableItems.length, 0);
  report.successCriteria = {
    productMutationsHaveReadBack: report.readAfterWrite.every((entry) => entry.ok === true) && report.readAfterWrite.length > 0,
    packsWithCandidatesOrProviderEvidence: packsWithCandidatesOrProviderEvidence.length,
    packsWithCandidates: packsWithCandidates.length,
    sourcesRoutedOrBacklog: sourcesRoutedOrBacklog.length,
    contentEvidence: contentEvidence.length,
    explainableItems,
    qualityIterations: report.qualityIterations.length,
    pollingWindows: report.pollingObservations.length,
  };

  if (!report.successCriteria.productMutationsHaveReadBack) {
    recordGap(report, "verification_gap", "Not all product mutations have MCP read-after-write proof.");
  }
  if (report.successCriteria.packsWithCandidatesOrProviderEvidence < 3) {
    recordGap(report, "provider_gap", "Fewer than 3 outsourcing signal families produced candidates or explainable provider evidence.");
  }
  if (report.successCriteria.sourcesRoutedOrBacklog < 2) {
    recordGap(report, "runtime_gap", "Fewer than 2 sources reached routing/source inventory/adapter backlog evidence.");
  }
  if (report.successCriteria.contentEvidence < 1) {
    recordGap(report, "downstream_selection_gap", "No source produced fetched resources/articles/content items.");
  }
  if (report.successCriteria.explainableItems < 1) {
    recordGap(report, "diagnostic_gap", "No fetched item had item-level explainable signal evidence.");
  }
  if (report.successCriteria.qualityIterations < 2) {
    recordGap(report, "verification_gap", "Fewer than 2 MCP quality polishing iterations were verified.");
  }
  report.status = report.gaps.length === 0 ? "passed" : "failed";
}

function markdown(report) {
  const lines = [
    `# Outsourcing Client-Signal MCP Verification ${report.runId}`,
    "",
    `- status: ${report.status}`,
    `- startedAt: ${report.startedAt}`,
    `- finishedAt: ${report.finishedAt}`,
    `- operatorPath: bootstrap outside MCP, product actions through MCP only`,
    `- cleanSlate: ${report.bootstrap.cleanSlate?.skipped ? "skipped" : "executed"}`,
    `- JSON: ${report.artifacts?.jsonPath ?? "pending"}`,
    "",
    "## Success Criteria",
    "",
    `- productMutationsHaveReadBack: ${report.successCriteria?.productMutationsHaveReadBack ?? false}`,
    `- packsWithCandidatesOrProviderEvidence: ${report.successCriteria?.packsWithCandidatesOrProviderEvidence ?? 0}`,
    `- sourcesRoutedOrBacklog: ${report.successCriteria?.sourcesRoutedOrBacklog ?? 0}`,
    `- contentEvidence: ${report.successCriteria?.contentEvidence ?? 0}`,
    `- explainableItems: ${report.successCriteria?.explainableItems ?? 0}`,
    `- qualityIterations: ${report.successCriteria?.qualityIterations ?? 0}`,
    `- pollingWindows: ${report.successCriteria?.pollingWindows ?? 0}`,
    "",
    "## Signal Families",
    "",
    ...report.packs.flatMap((pack) => [
      `### ${pack.key}`,
      "",
      `- status: ${pack.status}`,
      `- interestId: ${pack.interestId ?? "n/a"}`,
      `- discoveryRunId: ${pack.runId ?? "n/a"}`,
      `- artifactTypes: ${(pack.artifactTypes ?? []).join(", ") || "none"}`,
      `- queryAttempts: ${pack.queryAttempts.length}`,
      `- candidates: ${pack.candidates.length}`,
      `- excludedGeoCandidates: ${pack.excludedGeoCandidates.length}`,
      `- routingAttempts: ${pack.routingAttempts.length}`,
      `- sourceInventory: ${pack.sourceInventory.length}`,
      `- adapterBacklog: ${pack.adapterBacklog.length}`,
      `- channelId: ${pack.routed?.channelId ?? "n/a"}`,
      `- webResources: ${pack.webResources.length}`,
      `- articles: ${pack.articles.length}`,
      `- contentItems: ${pack.contentItems.length}`,
      `- explainableItems: ${pack.explainableItems.length}`,
      "",
      ...(pack.explainableItems.slice(0, 5).map((item) => `- ${item.kind} ${item.id}: ${item.title ?? item.url ?? "untitled"}`)),
      "",
    ]),
    "## Quality Iterations",
    "",
    ...(report.qualityIterations.length
      ? report.qualityIterations.map((entry) => `- iteration ${entry.iteration}: updatedInterestId=${entry.updatedInterestId ?? "n/a"}`)
      : ["- none"]),
    "",
    "## Polling Observations",
    "",
    ...(report.pollingObservations.length
      ? report.pollingObservations.map(
          (entry) =>
            `- T+${entry.minute}: channels=${entry.channels.length}; monitoring=${entry.discovery.monitoringState}; observations=${entry.discovery.sourceObservations}; adapterBacklog=${entry.discovery.adapterBacklog}`
        )
      : ["- none"]),
    "",
    "## Scheduling",
    "",
    `- status: ${report.scheduling?.status ?? "not-run"}`,
    `- reason: ${report.scheduling?.reason ?? "n/a"}`,
    "",
    "## Gaps",
    "",
    ...(report.gaps.length ? report.gaps.map((gap) => `- ${gap.category}: ${gap.message}`) : ["- none"]),
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
  const jsonPath = `/tmp/signalops-discovery-vnext-mcp-outsourcing-verification-${report.runId}.json`;
  const mdPath = `/tmp/signalops-discovery-vnext-mcp-outsourcing-verification-${report.runId}.md`;
  report.artifacts = { jsonPath, mdPath };
  const serializable = {
    ...report,
    docIds: [...report.docIds],
    channelIds: [...report.channelIds],
    sourceEvidenceIds: [...report.sourceEvidenceIds],
  };
  await writeFile(jsonPath, `${JSON.stringify(serializable, null, 2)}\n`, "utf8");
  await writeFile(mdPath, markdown(serializable), "utf8");
  log(`wrote ${jsonPath}`);
  log(`wrote ${mdPath}`);
}

async function runVerification(client, token, args, env, bootstrap = {}) {
  const report = {
    kind: "discovery-vnext-mcp-outsourcing-verification",
    runId: client.runId,
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
    bootstrap,
    preflight: {},
    packs: [],
    readAfterWrite: [],
    qualityIterations: [],
    pollingObservations: [],
    pollingElapsedMs: 0,
    scheduling: {},
    reindex: {},
    gaps: [],
    mcpCalls: [],
    successCriteria: {},
    artifacts: {},
    docIds: new Set(),
    channelIds: new Set(),
    sourceEvidenceIds: new Set(),
  };

  const preflightOk = await runPreflight(client, token, report, env, args);
  if (!preflightOk || args.preflightOnly) {
    report.status = preflightOk ? "preflight_passed" : "failed";
    await persist(report);
    if (!preflightOk) throw new Error("Outsourcing MCP verification preflight failed.");
    return report;
  }

  await readGuidance(client, token, report);
  for (const pack of OUTSOURCING_SIGNAL_PACKS) {
    try {
      await runPack(client, token, report, pack);
    } catch (error) {
      const packReport = report.packs.find((entry) => entry.key === pack.key);
      if (packReport) packReport.status = "failed";
      recordGap(report, classifyError(error), `${pack.key} failed`, summarizeError(error));
    }
  }
  await runQualityIterations(client, token, report);
  await checkScheduling(client, token, report, args);
  await runPollingWindows(client, token, report, args.pollWindows);
  summarizeStatus(report);
  await persist(report);
  if (report.status !== "passed") {
    throw new Error(`Outsourcing MCP verification failed with ${report.gaps.length} gap(s). See ${report.artifacts.jsonPath}`);
  }
  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = await readEnvFile(".env.dev");
  const client = createVerificationClient({ logPrefix: "outsourcing-mcp-verification" });
  const bootstrapReport = { bootstrap: {} };
  await runBootstrap(client, args, bootstrapReport);
  try {
    const issued = await client.issueToken({
      label: `outsourcing-verification-${client.runId}`,
      scopes: "read,write.discovery,write.channels,write.sequences,write.templates",
    });
    await runVerification(client, issued.token, args, env, bootstrapReport.bootstrap);
  } finally {
    await client.cleanup();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
