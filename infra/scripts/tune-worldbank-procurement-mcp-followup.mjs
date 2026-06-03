import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";

import { createHarness, createLogger } from "./lib/mcp-http-testkit.mjs";

const log = createLogger("worldbank-procurement-followup");
const RUN_ID = randomUUID();
const SOURCE_ARTIFACT =
  process.env.WORLDBANK_PROOF_ARTIFACT ??
  "/tmp/newsportal-worldbank-procurement-mcp-proof-40b62bb0-bbe8-46ad-854c-125455057e75.json";
const WAIT_MS = 8 * 60 * 1000;
const POLL_MS = 10_000;

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

function tunedInterestPayload(interestTemplateId) {
  return {
    interestTemplateId,
    name: "World Bank digital platform buyer signals [buyer-process tuned]",
    description:
      "World Bank financed procurement item-detail notices for digital platform, software implementation, data systems, CRM, web portal or integration delivery. Keep broad recall, but select only item-level buyer/project/vendor-search evidence; exclude Russia/China, closed-award-only records, individual staffing, seller/service/SEO/context pages.",
    positive_texts: [
      "World Bank procurement item detail buyer notice project implementation unit digital platform software implementation data systems CRM web portal integration delivery",
      "buyer process evidence includes request for expressions of interest EOI invitation for bids request for proposal terms of reference deadline submission contact procurement method",
      "delivery scope evidence includes platform development software implementation data warehousing data management CRM information system web portal interoperability integration application development",
      "public buyer evidence includes ministry project implementation unit government agency financed project notice id project id contract package assignment title",
    ],
    negative_texts: [
      "closed contract award only awarded supplier signed contract price no open opportunity no current vendor search",
      "individual consultant specialist employment CV staffing-only hiring-only role without vendor or firm delivery opportunity",
      "vendor service page agency profile ranking page guide category page procurement documentation without a specific buyer notice",
      "Russia China Russian Federation PRC buyer project country or delivery country",
    ],
    must_have_terms: "",
    must_not_have_terms: [
      "Russian Federation",
      "Russia",
      "China",
      "People's Republic of China",
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
      "official_notice_identity: World Bank, procurement notice, notice id, project id, procurement method, buyer contact",
      "buyer_process: request for expressions of interest, expression of interest, EOI, invitation for bids, RFP, RFQ, terms of reference, deadline, submit, consultants, firm selection",
      "delivery_scope: digital platform, platform development, software implementation, data warehousing, CRM, data management, information system, web portal, integration, interoperability, application development",
      "buyer_entity: ministry, project implementation unit, government agency, financed project, public buyer, recipient country",
    ],
    candidate_negative_signals: [
      "closed_award_only: contract award, awarded bidder, signed contract, contract price, no active submission path",
      "individual_staffing: individual consultant, specialist CV, employment role, hiring-only",
      "seller_or_context: vendor agency service page, ranking page, guide, category page, API docs, procurement portal instructions without specific notice",
      "excluded_country: Russia, Russian Federation, China, PRC",
    ],
    selection_profile_strictness: "balanced",
    selection_profile_unresolved_decision: "hold",
    selection_profile_llm_review_mode: "always",
    priority: "0.92",
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
  const source = JSON.parse(await import("node:fs/promises").then((fs) => fs.readFile(SOURCE_ARTIFACT, "utf8")));
  const interestTemplateId = source?.evidence?.calibrationInterestRead?.interest_template_id;
  const channelId = source?.evidence?.channelId;
  const docIds = [...new Set((source?.evidence?.articles?.items ?? []).map((item) => item.doc_id).filter(Boolean))].slice(0, 25);
  if (!interestTemplateId) throw new Error(`Missing interestTemplateId in ${SOURCE_ARTIFACT}`);
  if (!channelId) throw new Error(`Missing channelId in ${SOURCE_ARTIFACT}`);
  if (docIds.length === 0) throw new Error(`Missing article docIds in ${SOURCE_ARTIFACT}`);

  const harness = createHarness({ logPrefix: "worldbank-procurement-followup" });
  const report = {
    kind: "worldbank-procurement-mcp-followup",
    runId: RUN_ID,
    sourceArtifact: SOURCE_ARTIFACT,
    startedAt: new Date().toISOString(),
    status: "running",
    mcpCalls: [],
    readAfterWrite: [],
    gaps: [],
    evidence: { interestTemplateId, channelId, docIds },
  };

  try {
    await harness.setup({ rebuild: false });
    const issued = await harness.issueToken({
      label: `worldbank-procurement-followup-${RUN_ID}`,
      scopes: ["read", "write.channels", "write.discovery", "write.templates", "write.sequences"],
      expiresInSeconds: 4 * 60 * 60,
    });
    const token = issued.token;

    await Promise.all([harness.mcpRpc(token, "initialize", {}), harness.mcpRpc(token, "tools/list", {})]);
    report.mcpCalls.push(
      { name: "initialize", args: {}, at: new Date().toISOString() },
      { name: "tools/list", args: {}, at: new Date().toISOString() }
    );

    report.evidence.preDashboard = await mcp(report, harness, token, "operator.selection.dashboard", {});
    report.evidence.preResiduals = await mcp(report, harness, token, "articles.residuals.summary", {});
    report.evidence.preHolds = await mcp(report, harness, token, "articles.holds.summary", {});

    report.evidence.interestUpdate = await mcp(report, harness, token, "system_interests.update", {
      payload: tunedInterestPayload(interestTemplateId),
    });
    report.evidence.interestRead = await mcp(report, harness, token, "system_interests.read", { interestTemplateId });
    report.readAfterWrite.push({
      entity: "system_interest",
      id: interestTemplateId,
      operation: "update_read",
      ok: Boolean(report.evidence.interestRead?.interest_template_id),
    });

    report.gaps.push({
      category: "mcp_tool_gap",
      message:
        "Article-level useful/noise feedback is not available in discovery.feedback.submit; used system_interests.update + bounded reindex + articles.explain instead.",
      desiredTool: "articles.feedback.submit or content_items.feedback.submit",
      at: new Date().toISOString(),
    });

    report.evidence.reindex = await mcp(report, harness, token, "maintenance.reindex.request", {
      payload: {
        indexName: "interest_centroids",
        jobKind: "backfill",
        options: {
          docIds,
          interestId: interestTemplateId,
          batchSize: 25,
          retroNotifications: "skip",
          reason: `World Bank procurement buyer-process tuning follow-up ${RUN_ID}`,
        },
      },
    });
    report.evidence.reindexJobId = idFrom(report.evidence.reindex, ["reindexJobId", "reindex_job_id", "jobId", "id"]);
    if (report.evidence.reindexJobId) {
      await waitFor("World Bank follow-up reindex completion", async () => {
        const jobs = await mcp(report, harness, token, "maintenance.reindex_jobs.list", { page: 1, pageSize: 20 });
        report.evidence.latestReindexJobs = jobs;
        const job = (jobs?.items ?? []).find((item) => String(item.reindex_job_id ?? item.id ?? "") === report.evidence.reindexJobId);
        if (!job) return null;
        const status = String(job.status ?? "");
        if (status === "completed") return job;
        if (status === "failed" || status === "canceled") throw new Error(`Reindex job ${report.evidence.reindexJobId} ${status}`);
        return null;
      });
    }

    report.evidence.postDashboard = await mcp(report, harness, token, "operator.selection.dashboard", {});
    report.evidence.contentItems = await mcp(report, harness, token, "content_items.list", {
      channelId,
      page: 1,
      pageSize: 25,
    });
    report.evidence.allSelectedItems = await mcp(report, harness, token, "content_items.list", {
      page: 1,
      pageSize: 25,
    });
    report.evidence.articleExplains = [];
    for (const docId of docIds.slice(0, 10)) {
      report.evidence.articleExplains.push(await mcp(report, harness, token, "articles.explain", { docId }));
    }
    report.evidence.selectionVerify = await mcp(report, harness, token, "operator.report.verify", {
      reportKind: "selection",
      entityIds: { docIds, targetIds: [interestTemplateId], channelIds: [channelId] },
      includeSamples: true,
    });
    report.evidence.holdVerify = await mcp(report, harness, token, "operator.report.verify", {
      reportKind: "selection_hold_quality",
      entityIds: { docIds, targetIds: [interestTemplateId] },
      includeSamples: true,
    });
    report.evidence.effectVerify = await mcp(report, harness, token, "operator.effect.verify", {
      domain: "selection",
      entityIds: { articleIds: docIds, interestTemplateIds: [interestTemplateId], channelIds: [channelId] },
      includeSamples: true,
    });

    const channelSelectedCount = Number(report.evidence.contentItems?.total ?? 0);
    const globalSelectedCount = Number(report.evidence.allSelectedItems?.total ?? 0);
    const grayZoneCount = Number(report.evidence.postDashboard?.summary?.grayZone ?? report.evidence.postDashboard?.grayZone ?? 0);
    report.status = channelSelectedCount > 0 ? "passed" : "needs_source_or_selection_followup";
    report.summary = {
      channelSelectedCount,
      globalSelectedCount,
      grayZoneCount,
      mcpCalls: report.mcpCalls.length,
      readAfterWriteOk: report.readAfterWrite.every((entry) => entry.ok),
    };
  } catch (error) {
    report.status = "failed";
    report.error = error instanceof Error ? error.message : String(error);
  } finally {
    report.finishedAt = new Date().toISOString();
    const jsonPath = `/tmp/newsportal-worldbank-procurement-mcp-followup-${RUN_ID}.json`;
    const mdPath = `/tmp/newsportal-worldbank-procurement-mcp-followup-${RUN_ID}.md`;
    await writeFile(jsonPath, JSON.stringify(report, null, 2));
    await writeFile(
      mdPath,
      [
        "# World Bank Procurement MCP Follow-Up",
        "",
        `- status: ${report.status}`,
        `- source artifact: ${SOURCE_ARTIFACT}`,
        `- interest: ${interestTemplateId}`,
        `- channel: ${channelId}`,
        `- reindex job: ${report.evidence.reindexJobId ?? "n/a"}`,
        `- MCP calls: ${report.mcpCalls.length}`,
        `- channel selected: ${report.summary?.channelSelectedCount ?? "n/a"}`,
        `- global selected: ${report.summary?.globalSelectedCount ?? "n/a"}`,
        `- gray zone: ${report.summary?.grayZoneCount ?? "n/a"}`,
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
