import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";

import { createHarness, createLogger } from "./lib/mcp-http-testkit.mjs";

const log = createLogger("worldbank-procurement-proof");
const RUN_ID = randomUUID();
const ADAPTER_KEY = "api.worldbank_procurement_digital_platform_search";
const FETCH_URL =
  "https://search.worldbank.org/api/procnotices?format=json&qterm=digital%20platform&rows=10&os=0";
const SHORT_WAIT_MS = 10_000;
const CONTENT_WAIT_MS = 8 * 60 * 1000;

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

function adapterConfig() {
  return {
    maxItemsPerPoll: 10,
    requestTimeoutMs: 45_000,
    userAgent: "SignalOps MCP World Bank procurement signal verification/1.0",
    responseFormat: "json",
    pagination: { mode: "none", maxPagesPerPoll: 1 },
    itemsPath: "procnotices",
    titleField: ["bid_description", "project_name", "id"],
    leadField: ["notice_text", "bid_description", "project_name"],
    bodyField: ["notice_text", "bid_description", "notice_type", "procurement_method_name", "project_name"],
    urlTemplate: "https://projects.worldbank.org/en/projects-operations/procurement-detail/{id}",
    publishedAtField: "submission_date",
    externalIdField: "id",
    languageField: "notice_lang_name",
    adapter: {
      sourceRole: "official_multilateral_procurement_item_api",
      contentKind: "api_payload",
      tags: ["outsourcing-buyer-signal", "official-procurement", "world-bank", "digital-platform"],
    },
  };
}

function adapterRecipe() {
  const config = adapterConfig();
  return {
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
    maxItems: 10,
    metadata: {
      source: "official World Bank Procurement Notices API",
      query: "digital platform",
      mcpProofRunId: RUN_ID,
    },
  };
}

function adapterPayload(status = "active") {
  return {
    adapterKey: ADAPTER_KEY,
    title: "World Bank procurement digital platform notices API",
    description:
      "Declarative World Bank Procurement Notices API adapter for digital platform/software implementation buyer signals.",
    providerType: "api",
    outputMode: "articles",
    status,
    priority: 880,
    matchRules: {
      urlHostContains: ["search.worldbank.org"],
      allowAutoSelect: true,
    },
    configSchema: {},
    recipe: adapterRecipe(),
    metadata: {
      mcpProofRunId: RUN_ID,
      officialDocs: [
        "https://datacatalog.worldbank.org/search/dataset/0037776/procurement-notice",
        "https://search.worldbank.org/api/procnotices",
      ],
      note: "Public World Bank procurement notices API; no API key observed for this endpoint.",
    },
  };
}

function channelPayload() {
  const config = adapterConfig();
  return {
    providerType: "api",
    name: `World Bank digital platform procurement ${RUN_ID.slice(0, 8)}`,
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

function calibrationInterestPayload() {
  return {
    name: `World Bank digital platform buyer signals [${RUN_ID.slice(0, 8)}]`,
    description:
      "World Bank financed procurement notices where a public buyer or project implementation unit asks for digital platform, software implementation, information system, web portal or IT consulting delivery. Exclude Russia and China and seller-authored/context-only pages.",
    positive_texts: [
      "World Bank procurement notice request for expressions of interest digital platform software implementation consulting services buyer project",
      "public project implementation unit invites consultants firms bidders to submit EOI or bids for platform development information system",
      "buyer evidence includes notice id project id deadline contact procurement method scope of contract assignment title",
      "software implementation web portal information system digital government platform data management CRM application development",
    ],
    negative_texts: [
      "contract award only without open opportunity or follow-up buyer search",
      "vendor service page ranking page guide category page profile page",
      "Russia or China project country",
      "training-only or strategy-only consulting without implementation delivery scope",
    ],
    must_have_terms: "",
    must_not_have_terms: [
      "Russian Federation",
      "Russia",
      "China",
      "Contract Award only",
      "top companies",
      "best agencies",
      "ranking page",
      "how-to guide",
      "profile page",
    ],
    places: ["global"],
    languages_allowed: ["en"],
    time_window_hours: 24 * 365 * 2,
    allowed_content_kinds: ["editorial", "api_payload", "document"],
    short_tokens_required: "",
    short_tokens_forbidden: "",
    candidate_positive_signals: [
      "official_buyer_notice: World Bank procurement notice with project id, notice id, buyer/contact, procurement method",
      "implementation_scope: platform development, software implementation, information system, web portal, data management, CRM",
      "vendor_search_process: request for expression of interest, invitation for bids, consultants/firm selection, deadline or submission instructions",
    ],
    candidate_negative_signals: [
      "closed_award_only: contract award without current opportunity",
      "seller_authored: vendor/agency/service page",
      "excluded_country: Russia or China project country",
      "context_only: procurement guidance/API docs without a specific notice",
    ],
    selection_profile_strictness: "balanced",
    selection_profile_unresolved_decision: "hold",
    selection_profile_llm_review_mode: "always",
    priority: "0.88",
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

async function upsertAdapter(report, harness, token) {
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
    report.readAfterWrite.push({ entity: "ingress_adapter", id: ADAPTER_KEY, operation: "create", ok: Boolean(created?.created) });
  }
  const readBack = await mcp(report, harness, token, "ingress.adapters.read", { adapterKey: ADAPTER_KEY });
  report.readAfterWrite.push({ entity: "ingress_adapter", id: ADAPTER_KEY, operation: "read", ok: Boolean(readBack) });
  return readBack;
}

async function main() {
  const harness = createHarness({ logPrefix: "worldbank-procurement-proof" });
  const report = {
    kind: "worldbank-procurement-mcp-proof",
    runId: RUN_ID,
    startedAt: new Date().toISOString(),
    status: "running",
    mcpCalls: [],
    readAfterWrite: [],
    gaps: [],
    evidence: {},
  };

  try {
    await harness.setup({ rebuild: false });
    const issued = await harness.issueToken({
      label: `worldbank-procurement-proof-${RUN_ID}`,
      scopes: ["read", "write.channels", "write.discovery", "write.templates", "write.sequences"],
      expiresInSeconds: 4 * 60 * 60,
    });
    const token = issued.token;

    await Promise.all([
      harness.mcpRpc(token, "initialize", {}),
      harness.mcpRpc(token, "tools/list", {}),
    ]);
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
      report.gaps.push({
        category: "adapter_gap",
        message: "World Bank adapter dry-run did not return at least 3 item previews.",
        dryRun: report.evidence.dryRun,
      });
      throw new Error("World Bank adapter dry-run failed acceptance.");
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
      selectionReason: "MCP-only outsourcing buyer-signal expansion: World Bank digital platform procurement notices.",
    });
    report.evidence.bindingRead = await mcp(report, harness, token, "ingress.bindings.read", { channelId });
    report.readAfterWrite.push({
      entity: "ingress_binding",
      id: channelId,
      operation: "set/read",
      ok: String(report.evidence.bindingRead?.adapter_key ?? report.evidence.bindingRead?.adapterKey) === ADAPTER_KEY,
    });

    report.evidence.calibrationInterest = await mcp(report, harness, token, "system_interests.create", {
      payload: calibrationInterestPayload(),
    });
    const interestId = idFrom(report.evidence.calibrationInterest, ["entityId", "interestTemplateId", "systemInterestId", "interestId"]);
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
    }

    report.evidence.syncEvent = await mcp(report, harness, token, "channels.sync.request", {
      channelId,
      reason: "MCP-only World Bank procurement digital platform buyer-signal proof",
    });
    report.evidence.fetchRun = await waitFor("World Bank channel fetch run", async () => {
      const fetchRuns = await mcp(report, harness, token, "fetch_runs.list", { channelId, page: 1, pageSize: 5 });
      const latest = rows(fetchRuns)[0];
      if (latest?.outcome === "new_content" || Number(latest?.new_article_count ?? latest?.newArticleCount ?? 0) > 0) {
        return latest;
      }
      return null;
    });
    report.evidence.articles = await waitFor("World Bank channel articles", async () => {
      const articles = await mcp(report, harness, token, "articles.list", { channelId, page: 1, pageSize: 10 });
      return rows(articles).length > 0 ? articles : null;
    });
    const articleRows = rows(report.evidence.articles);
    const docIds = articleRows
      .map((article) => idFrom(article, ["doc_id", "docId", "id", "entityId"]))
      .filter(Boolean)
      .slice(0, 10);
    report.evidence.reindex = await mcp(report, harness, token, "maintenance.reindex.request", {
      payload: {
        indexName: "interest_centroids",
        jobKind: "backfill",
        options: {
          docIds,
          retroNotifications: "skip",
          reason: "MCP World Bank digital platform procurement replay after channel onboarding",
        },
      },
    });
    const reindexJobId =
      idFrom(report.evidence.reindex, ["reindexJobId", "jobId", "entityId"]) ||
      idFrom(report.evidence.reindex?.job ?? {}, ["reindex_job_id", "reindexJobId", "jobId"]);
    report.evidence.reindexJobId = reindexJobId;
    if (reindexJobId) {
      report.evidence.reindexJob = await waitFor("World Bank reindex job", async () => {
        const jobs = await mcp(report, harness, token, "maintenance.reindex_jobs.list", { page: 1, pageSize: 10 });
        const match = rows(jobs).find((job) => idFrom(job, ["reindex_job_id", "reindexJobId", "jobId", "id"]) === reindexJobId);
        return ["completed", "failed"].includes(String(match?.status ?? "")) ? match : null;
      });
    }

    report.evidence.articleExplains = [];
    for (const docId of docIds.slice(0, 5)) {
      report.evidence.articleExplains.push(await mcp(report, harness, token, "articles.explain", { docId }));
    }
    report.evidence.selectionDashboard = await mcp(report, harness, token, "operator.selection.dashboard", {});
    report.evidence.contentItems = await mcp(report, harness, token, "content_items.list", { channelId, page: 1, pageSize: 10 });
    report.evidence.reportVerifySelection = await mcp(report, harness, token, "operator.report.verify", {
      reportKind: "selection",
      entityIds: { channelIds: [channelId], docIds },
      includeSamples: true,
    });

    const contentRows = rows(report.evidence.contentItems);
    report.status = contentRows.length > 0 ? "passed" : "needs_selection_followup";
    report.counts = {
      mcpCalls: report.mcpCalls.length,
      dryRunItems: rows(report.evidence.dryRun?.itemsPreview).length,
      articles: articleRows.length,
      articleExplains: report.evidence.articleExplains.length,
      selectedContentItems: contentRows.length,
      globalSelectedArticleSignals: report.evidence.selectionDashboard?.counts?.selectedArticleSignals ?? null,
      readAfterWriteOk: report.readAfterWrite.every((entry) => entry.ok === true),
    };
  } catch (error) {
    report.status = "failed";
    report.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    report.finishedAt = new Date().toISOString();
    const jsonPath = `/tmp/signalops-worldbank-procurement-mcp-proof-${RUN_ID}.json`;
    const mdPath = `/tmp/signalops-worldbank-procurement-mcp-proof-${RUN_ID}.md`;
    await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(
      mdPath,
      [
        "# World Bank Procurement MCP Proof",
        "",
        `- Status: ${report.status}`,
        `- Run ID: ${RUN_ID}`,
        `- Adapter key: ${ADAPTER_KEY}`,
        `- Channel ID: ${report.evidence.channelId ?? "n/a"}`,
        `- MCP calls: ${report.mcpCalls.length}`,
        `- Dry-run items: ${rows(report.evidence.dryRun?.itemsPreview).length}`,
        `- Articles: ${rows(report.evidence.articles).length}`,
        `- Selected content items on channel: ${rows(report.evidence.contentItems).length}`,
        `- Global selected article signals: ${report.evidence.selectionDashboard?.counts?.selectedArticleSignals ?? "n/a"}`,
        `- JSON: ${jsonPath}`,
      ].join("\n"),
      "utf8"
    );
    log(`artifact json: ${jsonPath}`);
    log(`artifact md: ${mdPath}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
