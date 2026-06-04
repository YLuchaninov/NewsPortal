import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";

import { createHarness, createLogger, readEnvFile } from "./lib/mcp-http-testkit.mjs";

const log = createLogger("ted-api-adapter-proof");
const SHORT_WAIT_MS = 10_000;
const CONTENT_WAIT_MS = 8 * 60 * 1000;

const RUN_ID = randomUUID();
const ADAPTER_KEY = "api.ted_eu_software_tender_search";
const FETCH_URL = "https://api.ted.europa.eu/v3/notices/search";
const SEARCH_QUERY =
  "classification-cpv = 72* AND notice-type IN (cn-standard cn-social cn-desg subco) AND publication-date >= 20260501";

const FIELD_LANGS = ["eng", "deu", "fra", "spa", "ita", "pol", "ces", "hrv", "lit"];
const LINK_LANGS = ["ENG", "DEU", "FRA", "SPA", "ITA", "POL", "CES", "HRV", "LIT"];

function rows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.rows)) return payload.rows;
  return [];
}

function idFrom(payload, keys) {
  for (const key of keys) {
    if (payload?.[key] != null) return String(payload[key]);
  }
  return "";
}

function compact(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function adapterConfig() {
  return {
    maxItemsPerPoll: 10,
    requestTimeoutMs: 45_000,
    userAgent: "SignalOps MCP TED procurement signal verification/1.0",
    requestMethod: "POST",
    requestHeaders: {},
    requestBodyJson: {
      query: SEARCH_QUERY,
      fields: [
        "publication-number",
        "notice-title",
        "buyer-name",
        "deadline-receipt-tender-date-lot",
        "description-lot",
        "notice-type",
        "publication-date",
        "classification-cpv",
        "links",
      ],
      page: 1,
      limit: 10,
      scope: "ACTIVE",
      paginationMode: "PAGE_NUMBER",
      onlyLatestVersions: true,
    },
    responseFormat: "json",
    pagination: { mode: "none", maxPagesPerPoll: 1 },
    itemsPath: "notices",
    titleField: [...FIELD_LANGS.map((lang) => `notice-title.${lang}`), "publication-number"],
    leadField: [
      ...FIELD_LANGS.map((lang) => `description-lot.${lang}`),
      ...FIELD_LANGS.map((lang) => `notice-title.${lang}`),
    ],
    bodyField: [
      ...FIELD_LANGS.map((lang) => `description-lot.${lang}`),
      ...FIELD_LANGS.map((lang) => `notice-title.${lang}`),
      "classification-cpv",
      "notice-type",
    ],
    urlField: [
      ...LINK_LANGS.map((lang) => `links.htmlDirect.${lang}`),
      ...LINK_LANGS.map((lang) => `links.html.${lang}`),
      ...LINK_LANGS.map((lang) => `links.pdf.${lang}`),
      "links.xml.MUL",
    ],
    publishedAtField: "publication-date",
    externalIdField: "publication-number",
    languageField: [],
    adapter: {
      sourceRole: "official_procurement_item_api",
      contentKind: "api_payload",
      tags: ["outsourcing-buyer-signal", "official-procurement", "ted-eu", "software-tender"],
    },
  };
}

function adapterRecipe() {
  const config = adapterConfig();
  return {
    request: {
      method: config.requestMethod,
      headers: config.requestHeaders,
      bodyJson: config.requestBodyJson,
    },
    response: { format: config.responseFormat },
    pagination: config.pagination,
    items: config.itemsPath,
    map: {
      title: config.titleField,
      lead: config.leadField,
      body: config.bodyField,
      url: config.urlField,
      publishedAt: config.publishedAtField,
      externalId: config.externalIdField,
      language: config.languageField,
    },
    constants: config.adapter,
    maxItems: config.maxItemsPerPoll,
    metadata: {
      source: "official TED Search API",
      query: SEARCH_QUERY,
      mcpProofRunId: RUN_ID,
    },
  };
}

function adapterPayload(status = "active") {
  return {
    adapterKey: ADAPTER_KEY,
    title: "TED EU software tender search API",
    description:
      "Declarative TED Search API adapter for active EU software/IT procurement notices with item-level buyer evidence.",
    providerType: "api",
    outputMode: "signal_candidates",
    status,
    priority: 920,
    matchRules: {
      urlHostContains: ["api.ted.europa.eu"],
      allowAutoSelect: true,
    },
    configSchema: {},
    recipe: adapterRecipe(),
    metadata: {
      mcpProofRunId: RUN_ID,
      officialDocs: [
        "https://docs.ted.europa.eu/api/latest/search.html",
        "https://docs.ted.europa.eu/api/latest/index.html",
      ],
      note: "Search API is public for published notices; no API key is required.",
    },
  };
}

function channelPayload() {
  const config = adapterConfig();
  return {
    providerType: "api",
    name: `TED EU software tender API ${RUN_ID.slice(0, 8)}`,
    fetchUrl: FETCH_URL,
    language: "en",
    isActive: true,
    pollIntervalSeconds: 21_600,
    maxItemsPerPoll: config.maxItemsPerPoll,
    requestTimeoutMs: config.requestTimeoutMs,
    requestMethod: config.requestMethod,
    requestHeaders: config.requestHeaders,
    requestBodyJson: config.requestBodyJson,
    responseFormat: config.responseFormat,
    pagination: config.pagination,
    itemsPath: config.itemsPath,
    titleField: config.titleField,
    leadField: config.leadField,
    bodyField: config.bodyField,
    urlField: config.urlField,
    publishedAtField: config.publishedAtField,
    externalIdField: config.externalIdField,
    languageField: config.languageField,
    sourceRole: "official_procurement_item_api",
    contentKind: "api_payload",
    tags: ["outsourcing-buyer-signal", "official-procurement", "ted-eu", "software-tender"],
  };
}

function calibrationInterestPayload() {
  return {
    name: `TED EU software procurement buyer signals [${RUN_ID.slice(0, 8)}]`,
    description:
      "Official TED/Tenders Electronic Daily procurement notices where a buyer requests IT services, software development, implementation, integration, maintenance or digital system delivery. Global means worldwide coverage except Russia/China noise, not a literal place constraint.",
    positive_texts: [
      "official TED procurement notice IT services consulting software development Internet support buyer tender",
      "contract notice software development implementation integration maintenance digital system procurement deadline",
      "public buyer asks vendor contractor to provide software-related services and submit tender",
      "official tender item with buyer name CPV 72000000 72200000 72262000 deadline procurement documents",
    ],
    negative_texts: [
      "vendor service landing page without a buyer procurement notice",
      "agency ranking page or top companies list",
      "market report or generic how-to guide",
      "homepage, search results page, tag page, category page, profile page, listing wrapper without item detail",
      "jobs-only employee hiring page without contractor vendor procurement",
      "Russia-centered or China-centered procurement unless explicitly outside Russia and China",
    ],
    must_have_terms: "",
    must_not_have_terms: [
      "top companies",
      "best agencies",
      "service landing page",
      "ranking page",
      "market report",
      "how-to guide",
      "category page",
      "tag page",
      "profile page",
      "search results page",
      "jobs-only",
    ],
    places: ["global"],
    languages_allowed: ["en", "de", "fr", "es", "it", "pl", "cs", "hr", "lt"],
    time_window_hours: 24 * 365,
    allowed_content_kinds: ["editorial", "api_payload", "document", "data_file"],
    short_tokens_required: "",
    short_tokens_forbidden: "",
    candidate_positive_signals: [
      "official_buyer_notice: TED or official procurement item with buyer name, notice id, CPV, publication/deadline",
      "software_scope: IT services, software development, application software, integration, maintenance, digital system",
      "vendor_search_process: tender/procurement documents, deadline, proposal/bid submission or contract notice",
    ],
    candidate_negative_signals: [
      "seller_authored: vendor or agency page rather than buyer notice",
      "wrapper_only: search/category/tag/profile/listing page without item-level notice",
      "context_only: generic procurement guidance or API documentation without active item",
    ],
    selection_profile_strictness: "balanced",
    selection_profile_unresolved_decision: "hold",
    selection_profile_llm_review_mode: "always",
    priority: "0.92",
    isActive: true,
  };
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

async function mcp(report, harness, token, name, args = {}, options = {}) {
  report.mcpCalls.push({ name, args, at: new Date().toISOString() });
  try {
    return await harness.mcpToolCall(token, name, args, { timeoutMs: 180_000, ...options });
  } catch (error) {
    report.gaps.push({
      category: options.gapCategory ?? "mcp_gap",
      message: `${name} failed`,
      args,
      error: error instanceof Error ? error.message : String(error),
      diagnostics: error?.mcpDiagnostics ?? error?.httpDiagnostics ?? null,
      at: new Date().toISOString(),
    });
    if (options.optional) return null;
    throw error;
  }
}

async function upsertAdapter(report, harness, token) {
  const existing = await mcp(report, harness, token, "ingress.adapters.read", { adapterKey: ADAPTER_KEY }, { optional: true });
  if (existing) {
    const updated = await mcp(report, harness, token, "ingress.adapters.update_declarative", {
      adapterKey: ADAPTER_KEY,
      payload: adapterPayload("active"),
    });
    report.readAfterWrite.push({ entity: "ingress_adapter", id: ADAPTER_KEY, operation: "update", ok: Boolean(updated) });
  } else {
    const created = await mcp(report, harness, token, "ingress.adapters.create_declarative", {
      payload: adapterPayload("active"),
    });
    report.readAfterWrite.push({ entity: "ingress_adapter", id: ADAPTER_KEY, operation: "create", ok: Boolean(created?.created) });
  }
  const readBack = await mcp(report, harness, token, "ingress.adapters.read", { adapterKey: ADAPTER_KEY });
  report.readAfterWrite.push({ entity: "ingress_adapter", id: ADAPTER_KEY, operation: "read", ok: Boolean(readBack) });
  return readBack;
}

async function main() {
  const harness = createHarness({ logPrefix: "ted-api-adapter-proof" });
  const report = {
    kind: "ted-api-adapter-mcp-proof",
    runId: RUN_ID,
    startedAt: new Date().toISOString(),
    status: "running",
    mcpCalls: [],
    readAfterWrite: [],
    gaps: [],
    evidence: {},
  };

  try {
    report.env = { discoveryEnabled: String(process.env.DISCOVERY_ENABLED ?? "") };
    report.envFile = await readEnvFile(".env.dev");
    await harness.setup({ rebuild: false });
    const issued = await harness.issueToken({
      label: `ted-api-adapter-proof-${RUN_ID}`,
      scopes: ["read", "write.channels", "write.discovery", "write.templates", "write.sequences"],
      expiresInSeconds: 4 * 60 * 60,
    });
    const token = issued.token;

    const [initialize, toolsList] = await Promise.all([
      harness.mcpRpc(token, "initialize", {}),
      harness.mcpRpc(token, "tools/list", {}),
    ]);
    report.mcpCalls.push(
      { name: "initialize", args: {}, at: new Date().toISOString() },
      { name: "tools/list", args: {}, at: new Date().toISOString() }
    );
    const tools = new Set((toolsList?.result?.tools ?? []).map((tool) => String(tool.name)));
    for (const required of [
      "ingress.adapters.dry_run",
      "ingress.adapters.create_declarative",
      "ingress.adapters.update_declarative",
      "ingress.adapters.read",
      "channels.create",
      "channels.read",
      "ingress.bindings.set",
      "ingress.bindings.read",
      "channels.sync.request",
      "fetch_runs.list",
      "signal_candidates.list",
      "signal_candidates.explain",
      "content_items.list",
      "system_interests.create",
      "system_interests.read",
      "maintenance.reindex.request",
      "maintenance.reindex_jobs.list",
      "operator.selection.dashboard",
    ]) {
      if (!tools.has(required)) {
        report.gaps.push({ category: "mcp_tool_gap", message: `Missing MCP tool: ${required}` });
      }
    }
    if (report.gaps.some((gap) => gap.category === "mcp_tool_gap")) {
      throw new Error("Required MCP tools are missing.");
    }
    report.evidence.initialize = compact(initialize?.result?.serverInfo);

    report.evidence.dryRun = await mcp(report, harness, token, "ingress.adapters.dry_run", {
      adapterKey: ADAPTER_KEY,
      providerType: "api",
      fetchUrl: FETCH_URL,
      config: adapterConfig(),
      limit: 5,
    });
    if (report.evidence.dryRun?.status !== "ok" || rows(report.evidence.dryRun.itemsPreview).length < 3) {
      report.gaps.push({
        category: "adapter_gap",
        message: "TED adapter dry-run did not return at least 3 item previews.",
        dryRun: report.evidence.dryRun,
      });
      throw new Error("TED adapter dry-run failed acceptance.");
    }

    report.evidence.adapter = await upsertAdapter(report, harness, token);

    const channel = await mcp(report, harness, token, "channels.create", { payload: channelPayload() });
    const channelId = idFrom(channel, ["channelId"]) || String(channel?.createdChannelIds?.[0] ?? "");
    if (!channelId) throw new Error("channels.create did not return channelId.");
    report.evidence.channelId = channelId;
    report.readAfterWrite.push({ entity: "source_channel", id: channelId, operation: "create", ok: true });
    report.evidence.channelRead = await mcp(report, harness, token, "channels.read", { channelId });
    report.readAfterWrite.push({ entity: "source_channel", id: channelId, operation: "read", ok: Boolean(report.evidence.channelRead) });

    report.evidence.bindingSet = await mcp(report, harness, token, "ingress.bindings.set", {
      channelId,
      adapterKey: ADAPTER_KEY,
      config: {},
      selectionMode: "mcp",
      enabled: true,
      selectionReason: "MCP-only outsourcing buyer-signal rescue: official TED software tender item API.",
    });
    report.evidence.bindingRead = await mcp(report, harness, token, "ingress.bindings.read", { channelId });
    report.readAfterWrite.push({
      entity: "ingress_binding",
      id: channelId,
      operation: "set/read",
      ok: String(report.evidence.bindingRead?.adapter_key ?? report.evidence.bindingRead?.adapterKey) === ADAPTER_KEY,
    });

    report.evidence.syncEvent = await mcp(report, harness, token, "channels.sync.request", {
      channelId,
      reason: "MCP-only TED API software tender buyer-signal proof",
    });
    report.evidence.outbox = await mcp(report, harness, token, "outbox.events.list", {
      eventType: "source.channel.sync.requested",
      aggregateType: "source_channel",
      aggregateId: channelId,
      limit: 5,
    });

    report.evidence.fetchRun = await waitFor("TED channel fetch run", async () => {
      const fetchRuns = await mcp(report, harness, token, "fetch_runs.list", { channelId, page: 1, pageSize: 5 });
      const latest = rows(fetchRuns)[0];
      if (latest?.outcome === "new_content" || Number(latest?.new_signal_candidate_count ?? latest?.newSignalCandidateCount ?? 0) > 0) {
        return latest;
      }
      return null;
    });

    report.evidence.signal_candidates = await waitFor("TED channel signal_candidates", async () => {
      const signal_candidates = await mcp(report, harness, token, "signal_candidates.list", { channelId, page: 1, pageSize: 10 });
      return rows(signal_candidates).length > 0 ? signal_candidates : null;
    });
    const signalCandidateRows = rows(report.evidence.signal_candidates);
    report.evidence.signalCandidateExplains = [];
    for (const signal_candidate of signalCandidateRows.slice(0, 5)) {
      const docId = idFrom(signal_candidate, ["doc_id", "docId", "id", "entityId"]);
      if (!docId) continue;
      report.evidence.signalCandidateExplains.push(await mcp(report, harness, token, "signal_candidates.explain", { docId }));
    }
    const docIds = signalCandidateRows
      .map((signal_candidate) => idFrom(signal_candidate, ["doc_id", "docId", "id", "entityId"]))
      .filter(Boolean)
      .slice(0, 10);
    report.evidence.calibrationInterest = await mcp(report, harness, token, "system_interests.create", {
      payload: calibrationInterestPayload(),
    });
    const interestId = idFrom(report.evidence.calibrationInterest, [
      "entityId",
      "interestTemplateId",
      "systemInterestId",
      "interestId",
    ]);
    if (interestId) {
      report.evidence.calibrationInterestRead = await mcp(report, harness, token, "system_interests.read", {
        interestTemplateId: interestId,
      });
      report.readAfterWrite.push({
        entity: "system_interest",
        id: interestId,
        operation: "create/read",
        ok: Boolean(report.evidence.calibrationInterestRead),
      });
    } else {
      report.gaps.push({
        category: "mcp_write_gap",
        message: "system_interests.create did not return an interest id for TED calibration.",
      });
    }
    report.evidence.reindex = await mcp(report, harness, token, "maintenance.reindex.request", {
      payload: {
        indexName: "interest_centroids",
        jobKind: "backfill",
        options: {
          docIds,
          retroNotifications: "skip",
          reason: "MCP TED API adapter buyer-signal replay after channel onboarding",
        },
      },
    });
    const reindexJobId =
      idFrom(report.evidence.reindex, ["reindexJobId", "jobId", "entityId"]) ||
      idFrom(report.evidence.reindex?.job ?? {}, ["reindex_job_id", "reindexJobId", "jobId"]);
    report.evidence.reindexJobId = reindexJobId;
    if (reindexJobId) {
      report.evidence.reindexJob = await waitFor("TED reindex job", async () => {
        const jobs = await mcp(report, harness, token, "maintenance.reindex_jobs.list", { page: 1, pageSize: 10 });
        const match = rows(jobs).find((job) => idFrom(job, ["reindex_job_id", "reindexJobId", "jobId", "id"]) === reindexJobId);
        return ["completed", "failed"].includes(String(match?.status ?? "")) ? match : null;
      });
    }

    report.evidence.postReindexSignalCandidateExplains = [];
    for (const docId of docIds.slice(0, 5)) {
      report.evidence.postReindexSignalCandidateExplains.push(await mcp(report, harness, token, "signal_candidates.explain", { docId }));
    }
    report.evidence.selectionDashboard = await mcp(report, harness, token, "operator.selection.dashboard", {});
    report.evidence.contentItems = await mcp(report, harness, token, "content_items.list", { channelId, page: 1, pageSize: 10 });
    report.evidence.reportVerifySelection = await mcp(report, harness, token, "operator.report.verify", {
      reportKind: "selection",
      entityIds: { channelIds: [channelId], docIds },
      includeSamples: true,
    });
    report.evidence.effectVerify = await mcp(report, harness, token, "operator.effect.verify", {
      domain: "selection",
      entityIds: { channelIds: [channelId], docIds },
      includeSamples: true,
    });

    const contentRows = rows(report.evidence.contentItems);
    report.status = contentRows.length > 0 ? "passed" : "needs_selection_followup";
    report.counts = {
      mcpCalls: report.mcpCalls.length,
      dryRunItems: rows(report.evidence.dryRun?.itemsPreview).length,
      signal_candidates: signalCandidateRows.length,
      signalCandidateExplains: report.evidence.signalCandidateExplains.length,
      selectedContentItems: contentRows.length,
      readAfterWriteOk: report.readAfterWrite.every((entry) => entry.ok === true),
    };
  } catch (error) {
    report.status = "failed";
    report.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    report.finishedAt = new Date().toISOString();
    const jsonPath = `/tmp/signalops-ted-api-adapter-mcp-proof-${RUN_ID}.json`;
    const mdPath = `/tmp/signalops-ted-api-adapter-mcp-proof-${RUN_ID}.md`;
    await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(
      mdPath,
      [
        "# TED API Adapter MCP Proof",
        "",
        `- Status: ${report.status}`,
        `- Run ID: ${RUN_ID}`,
        `- Adapter key: ${ADAPTER_KEY}`,
        `- Channel ID: ${report.evidence.channelId ?? "n/a"}`,
        `- MCP calls: ${report.mcpCalls.length}`,
        `- Dry-run items: ${rows(report.evidence.dryRun?.itemsPreview).length}`,
        `- Signal Candidates: ${rows(report.evidence.signal_candidates).length}`,
        `- Selected content items: ${rows(report.evidence.contentItems).length}`,
        `- JSON: ${jsonPath}`,
      ].join("\n"),
      "utf8"
    );
    log(`artifact json: ${jsonPath}`);
    log(`artifact md: ${mdPath}`);
    await harness.cleanup();
  }
}

main().catch((error) => {
  log(`failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
