import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";

import { createHarness, createLogger } from "./lib/mcp-http-testkit.mjs";

const log = createLogger("uk-contractsfinder-proof");
const RUN_ID = randomUUID();
const ADAPTER_KEY = "api.uk_contractsfinder_it_services_ocds";
const FETCH_URL =
  "https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search?publishedFrom=2026-01-01T00%3A00%3A00&cpv=72000000&size=20";
const WAIT_MS = 8 * 60 * 1000;
const POLL_MS = 10_000;

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

async function waitFor(label, fn, { timeoutMs = WAIT_MS, intervalMs = POLL_MS } = {}) {
  const started = Date.now();
  let lastValue = null;
  while (Date.now() - started < timeoutMs) {
    lastValue = await fn();
    if (lastValue) return lastValue;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for ${label}. Last value: ${JSON.stringify(lastValue)?.slice(0, 800)}`);
}

function adapterConfig() {
  return {
    maxItemsPerPoll: 20,
    requestTimeoutMs: 45_000,
    userAgent: "SignalOps MCP UK Contracts Finder outsourcing signal verification/1.0",
    responseFormat: "json",
    pagination: { mode: "none", maxPagesPerPoll: 1 },
    itemsPath: "releases",
    titleField: "tender.title",
    leadField: "tender.description",
    bodyField: "tender.description",
    urlTemplate:
      "https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search?cpv=72000000&size=20&ocid={ocid}",
    publishedAtField: "date",
    externalIdField: "ocid",
    languageField: "language",
    adapter: {
      sourceRole: "official_uk_contracting_it_services_api",
      contentKind: "api_payload",
      tags: ["outsourcing-buyer-signal", "official-procurement", "uk", "contracts-finder", "it-services"],
    },
  };
}

function adapterPayload(status = "active") {
  const config = adapterConfig();
  return {
    adapterKey: ADAPTER_KEY,
    title: "UK Contracts Finder IT services OCDS API",
    description:
      "Declarative UK Contracts Finder OCDS adapter for CPV 72000000 IT/software services buyer-signal candidates.",
    providerType: "api",
    outputMode: "articles",
    status,
    priority: 850,
    matchRules: {
      urlHostContains: ["contractsfinder.service.gov.uk"],
      allowAutoSelect: true,
    },
    configSchema: {},
    recipe: {
      response: { format: config.responseFormat },
      pagination: config.pagination,
      items: config.itemsPath,
      map: {
        title: config.titleField,
        lead: config.leadField,
        body: config.bodyField,
        urlTemplate: config.urlTemplate,
        publishedAt: config.publishedAtField,
        externalId: config.externalIdField,
        language: config.languageField,
      },
      constants: config.adapter,
      maxItems: 20,
      metadata: {
        source: "official UK Contracts Finder OCDS API",
        cpv: "72000000",
        mcpProofRunId: RUN_ID,
      },
    },
    metadata: {
      mcpProofRunId: RUN_ID,
      officialDocs: ["https://www.gov.uk/government/publications/open-contracting"],
      residualGap:
        "Declarative URL mapping uses an API/search anchor because OCDS document arrays are not currently addressable by the generic path reader.",
    },
  };
}

function channelPayload() {
  const config = adapterConfig();
  return {
    providerType: "api",
    name: `UK Contracts Finder IT services ${RUN_ID.slice(0, 8)}`,
    fetchUrl: FETCH_URL,
    language: "en",
    isActive: true,
    pollIntervalSeconds: 21_600,
    maxItemsPerPoll: config.maxItemsPerPoll,
    requestTimeoutMs: config.requestTimeoutMs,
    responseFormat: config.responseFormat,
    pagination: config.pagination,
    itemsPath: config.itemsPath,
    titleField: config.titleField,
    leadField: config.leadField,
    bodyField: config.bodyField,
    urlTemplate: config.urlTemplate,
    publishedAtField: config.publishedAtField,
    externalIdField: config.externalIdField,
    languageField: config.languageField,
    sourceRole: config.adapter.sourceRole,
    contentKind: config.adapter.contentKind,
    tags: config.adapter.tags,
  };
}

function interestPayload() {
  return {
    name: `UK Contracts Finder IT/software buyer signals [${RUN_ID.slice(0, 8)}]`,
    description:
      "Official UK Contracts Finder OCDS records for active IT services/software implementation/digital platform opportunities. Negative-first calibration: reject award-only, complete, hardware-only, staffing-only and generic procurement/context records.",
    positive_texts: [
      "official Contracts Finder OCDS tender active IT services software implementation digital platform web application integration buyer opportunity",
      "buyer evidence includes contracting authority tender status active CPV IT services deadline submission process description",
      "software delivery scope includes software development web application platform integration data system support implementation",
    ],
    negative_texts: [
      "award only complete status contract already awarded supplier selected",
      "hardware laptop device supply only without software implementation delivery",
      "training staffing individual consultant employment only",
      "portal context search page API docs without item-level tender record",
      "Russia China Russian Federation PRC",
    ],
    must_have_terms: "",
    must_not_have_terms: [
      "Russia",
      "Russian Federation",
      "China",
      "award only",
      "AWARD",
      "complete status",
      "laptop supply",
      "hardware only",
    ],
    places: ["global"],
    languages_allowed: ["en"],
    time_window_hours: 24 * 365,
    allowed_content_kinds: ["api_payload", "document", "editorial"],
    short_tokens_required: "",
    short_tokens_forbidden: "",
    candidate_positive_signals: [
      "official_notice_identity: Contracts Finder, OCDS, ocid, contracting authority, tender record",
      "buyer_process: active tender, bid, submission, deadline, request for proposal, open procedure",
      "delivery_scope: IT services, software development, web application, platform, integration, data system, implementation",
    ],
    candidate_negative_signals: [
      "closed_award_only: award, awardUpdate, complete, awarded supplier, contract already placed",
      "hardware_or_staffing_only: laptop/device supply only, employment, individual staffing",
      "context_only: search/API/portal documentation without a concrete buyer notice",
    ],
    selection_profile_strictness: "balanced",
    selection_profile_unresolved_decision: "hold",
    selection_profile_llm_review_mode: "always",
    priority: "0.86",
    isActive: true,
  };
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

async function main() {
  const harness = createHarness({ logPrefix: "uk-contractsfinder-proof" });
  const report = {
    kind: "uk-contractsfinder-api-adapter-mcp-proof",
    runId: RUN_ID,
    startedAt: new Date().toISOString(),
    status: "running",
    mcpCalls: [],
    readAfterWrite: [],
    gaps: [
      {
        category: "adapter_mapping_gap",
        message: "OCDS document array URL extraction is not supported by the generic declarative path reader yet.",
        desiredFix: "Allow numeric array path segments such as tender.documents.0.url or add firstDocumentUrl mapping.",
      },
    ],
    evidence: {},
  };

  try {
    await harness.setup({ rebuild: false });
    const issued = await harness.issueToken({
      label: `uk-contractsfinder-proof-${RUN_ID}`,
      scopes: ["read", "write.channels", "write.discovery", "write.templates", "write.sequences"],
      expiresInSeconds: 4 * 60 * 60,
    });
    const token = issued.token;

    await Promise.all([harness.mcpRpc(token, "initialize", {}), harness.mcpRpc(token, "tools/list", {})]);
    report.mcpCalls.push(
      { name: "initialize", args: {}, at: new Date().toISOString() },
      { name: "tools/list", args: {}, at: new Date().toISOString() }
    );

    report.evidence.dryRun = await mcp(report, harness, token, "ingress.adapters.dry_run", {
      adapterKey: ADAPTER_KEY,
      providerType: "api",
      fetchUrl: FETCH_URL,
      config: adapterConfig(),
      limit: 5,
    });
    if (report.evidence.dryRun?.status !== "ok" || rows(report.evidence.dryRun.itemsPreview).length < 3) {
      throw new Error("UK Contracts Finder adapter dry-run failed acceptance.");
    }

    const existing = await mcp(report, harness, token, "ingress.adapters.read", { adapterKey: ADAPTER_KEY }, { optional: true });
    if (existing) {
      await mcp(report, harness, token, "ingress.adapters.update_declarative", {
        adapterKey: ADAPTER_KEY,
        payload: adapterPayload("active"),
      });
      report.readAfterWrite.push({ entity: "ingress_adapter", id: ADAPTER_KEY, operation: "update", ok: true });
    } else {
      const created = await mcp(report, harness, token, "ingress.adapters.create_declarative", {
        payload: adapterPayload("active"),
      });
      report.readAfterWrite.push({ entity: "ingress_adapter", id: ADAPTER_KEY, operation: "create", ok: Boolean(created) });
    }
    report.evidence.adapterRead = await mcp(report, harness, token, "ingress.adapters.read", { adapterKey: ADAPTER_KEY });

    const channel = await mcp(report, harness, token, "channels.create", { payload: channelPayload() });
    const channelId = idFrom(channel, ["channelId"]) || String(channel?.createdChannelIds?.[0] ?? "");
    if (!channelId) throw new Error("channels.create did not return channelId.");
    report.evidence.channelId = channelId;
    report.evidence.channelRead = await mcp(report, harness, token, "channels.read", { channelId });
    report.readAfterWrite.push({ entity: "source_channel", id: channelId, operation: "create/read", ok: Boolean(report.evidence.channelRead) });

    report.evidence.bindingSet = await mcp(report, harness, token, "ingress.bindings.set", {
      channelId,
      adapterKey: ADAPTER_KEY,
      config: {},
      selectionMode: "mcp",
      enabled: true,
      selectionReason: "MCP-only outsourcing buyer-signal expansion: UK Contracts Finder IT services OCDS.",
    });
    report.evidence.bindingRead = await mcp(report, harness, token, "ingress.bindings.read", { channelId });

    const createdInterest = await mcp(report, harness, token, "system_interests.create", { payload: interestPayload() });
    const interestId = idFrom(createdInterest, ["entityId", "interestTemplateId", "systemInterestId", "interestId"]);
    if (interestId) {
      report.evidence.interestId = interestId;
      report.evidence.interestRead = await mcp(report, harness, token, "system_interests.read", { interestTemplateId: interestId });
      report.readAfterWrite.push({ entity: "system_interest", id: interestId, operation: "create/read", ok: Boolean(report.evidence.interestRead) });
    }

    report.evidence.syncEvent = await mcp(report, harness, token, "channels.sync.request", {
      channelId,
      reason: "MCP-only UK Contracts Finder IT/software buyer-signal proof",
    });
    report.evidence.fetchRun = await waitFor("UK Contracts Finder fetch run", async () => {
      const fetchRuns = await mcp(report, harness, token, "fetch_runs.list", { channelId, page: 1, pageSize: 5 });
      const latest = rows(fetchRuns)[0];
      if (latest?.outcome === "new_content" || Number(latest?.new_article_count ?? latest?.newArticleCount ?? 0) > 0) return latest;
      return null;
    });
    report.evidence.articles = await waitFor("UK Contracts Finder articles", async () => {
      const articles = await mcp(report, harness, token, "articles.list", { channelId, page: 1, pageSize: 20 });
      return rows(articles).length > 0 ? articles : null;
    });

    const docIds = rows(report.evidence.articles)
      .map((article) => idFrom(article, ["doc_id", "docId", "id", "entityId"]))
      .filter(Boolean)
      .slice(0, 20);
    report.evidence.reindex = await mcp(report, harness, token, "maintenance.reindex.request", {
      payload: {
        indexName: "interest_centroids",
        jobKind: "backfill",
        options: {
          docIds,
          retroNotifications: "skip",
          reason: "MCP UK Contracts Finder IT services replay after channel onboarding",
        },
      },
    });
    const reindexJobId =
      idFrom(report.evidence.reindex, ["reindexJobId", "jobId", "entityId"]) ||
      idFrom(report.evidence.reindex?.job ?? {}, ["reindex_job_id", "reindexJobId", "jobId"]);
    report.evidence.reindexJobId = reindexJobId;
    if (reindexJobId) {
      report.evidence.reindexJob = await waitFor("UK Contracts Finder reindex job", async () => {
        const jobs = await mcp(report, harness, token, "maintenance.reindex_jobs.list", { page: 1, pageSize: 20 });
        const match = rows(jobs).find((job) => idFrom(job, ["reindex_job_id", "reindexJobId", "jobId", "id"]) === reindexJobId);
        return ["completed", "failed"].includes(String(match?.status ?? "")) ? match : null;
      });
    }

    report.evidence.articleExplains = [];
    for (const docId of docIds.slice(0, 8)) {
      report.evidence.articleExplains.push(await mcp(report, harness, token, "articles.explain", { docId }));
    }
    report.evidence.contentItems = await mcp(report, harness, token, "content_items.list", { channelId, page: 1, pageSize: 20 });
    report.evidence.globalContentItems = await mcp(report, harness, token, "content_items.list", { page: 1, pageSize: 20 });
    report.evidence.selectionVerify = await mcp(report, harness, token, "operator.report.verify", {
      reportKind: "selection",
      entityIds: { channelIds: [channelId], docIds },
      includeSamples: true,
    });

    const selected = Number(report.evidence.contentItems?.total ?? rows(report.evidence.contentItems).length);
    report.counts = {
      mcpCalls: report.mcpCalls.length,
      dryRunItems: rows(report.evidence.dryRun?.itemsPreview).length,
      articles: rows(report.evidence.articles).length,
      selected,
      globalSelected: Number(report.evidence.globalContentItems?.total ?? rows(report.evidence.globalContentItems).length),
      readAfterWriteOk: report.readAfterWrite.every((entry) => entry.ok),
    };
    report.status = selected > 0 ? "passed" : "needs_selection_followup";
  } catch (error) {
    report.status = "failed";
    report.error = error instanceof Error ? error.message : String(error);
  } finally {
    report.finishedAt = new Date().toISOString();
    const jsonPath = `/tmp/signalops-uk-contractsfinder-mcp-proof-${RUN_ID}.json`;
    const mdPath = `/tmp/signalops-uk-contractsfinder-mcp-proof-${RUN_ID}.md`;
    await writeFile(jsonPath, JSON.stringify(report, null, 2));
    await writeFile(
      mdPath,
      [
        "# UK Contracts Finder MCP Proof",
        "",
        `- status: ${report.status}`,
        `- channel: ${report.evidence.channelId ?? "n/a"}`,
        `- interest: ${report.evidence.interestId ?? "n/a"}`,
        `- reindex job: ${report.evidence.reindexJobId ?? "n/a"}`,
        `- MCP calls: ${report.mcpCalls.length}`,
        `- articles: ${report.counts?.articles ?? "n/a"}`,
        `- selected: ${report.counts?.selected ?? "n/a"}`,
        `- global selected: ${report.counts?.globalSelected ?? "n/a"}`,
        "",
        "## Artifacts",
        "",
        `- JSON: ${jsonPath}`,
        `- Markdown: ${mdPath}`,
      ].join("\n")
    );
    log(`${report.status} ${jsonPath}`);
  }
}

await main();
