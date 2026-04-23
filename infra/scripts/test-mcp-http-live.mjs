import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  createHarness,
  extractHttpDiagnostics,
  extractMcpDiagnostics,
  readIdentifier,
  waitFor,
} from "./lib/mcp-http-testkit.mjs";
import {
  buildDiscoveryProfilePayload,
  buildProfileBackedGraphMissionPayload,
  buildProfileBackedRecallMissionPayload,
} from "./lib/discovery-live-proof-profiles.mjs";
import { DISCOVERY_LIVE_DEFAULTS } from "./lib/discovery-live-example-cases.mjs";
import { classifyRecallCandidate } from "./lib/discovery-live-yield-policy.mjs";

export const LIVE_CASE = {
  key: "mcp_http_live",
  label: "MCP HTTP Live Discovery",
  proofProfile: {
    profileKey: "mcp_http_live_profile",
    displayName: "MCP HTTP Live Discovery Profile",
    description:
      "Reusable MCP live-proof profile for developer-tools, open-source, and cloud-infrastructure source discovery.",
  },
  graphPolicy: {
    providerTypes: ["rss", "website"],
    supportedWebsiteKinds: ["editorial", "blog", "docs"],
    preferredDomains: [
      "blog.cloudflare.com",
      "blog.jetbrains.com",
      "github.blog",
      "www.infoq.com",
      "kubernetes.io",
      "thenewstack.io",
    ],
    negativeDomains: [
      "feedspot.com",
      "rssing.com",
      "rss.app",
      "wikipedia.org",
      "einnews.com",
      "stackoverflow.com",
      "makeuseof.com",
      "tutorialspoint.com",
    ],
    positiveKeywords: [
      "release",
      "open source",
      "developer tools",
      "cloud",
      "infrastructure",
      "engineering",
      "developer",
      "platform",
    ],
    negativeKeywords: [
      "coupon",
      "deal",
      "shopping",
      "directory",
      "rss aggregator",
      "listicle",
      "how to",
      "guide",
      "questions",
      "web store",
    ],
    preferredTactics: ["official engineering blog", "engineering blog rss", "developer platform blog"],
    expectedSourceShapes: ["editorial_blog", "release_notes"],
    allowedSourceFamilies: ["editorial", "official_blog", "documentation"],
    disfavoredSourceFamilies: ["aggregator"],
    usefulnessHints: ["official releases", "engineering updates", "tooling launches"],
    diversityCaps: {
      maxPerSourceFamily: 2,
      maxPerDomain: 2,
    },
    minRssReviewScore: 0.45,
    minWebsiteReviewScore: 0.45,
    minPromotionScore: 0.24,
  },
  recallPolicy: {
    providerTypes: ["rss", "website"],
    supportedWebsiteKinds: ["editorial", "blog", "docs"],
    preferredDomains: [
      "blog.cloudflare.com",
      "blog.jetbrains.com",
      "github.blog",
      "www.infoq.com",
      "kubernetes.io",
      "thenewstack.io",
      "engineering.fb.com",
    ],
    negativeDomains: [
      "feedspot.com",
      "rssing.com",
      "rss.app",
      "wikipedia.org",
      "einnews.com",
      "stackoverflow.com",
      "makeuseof.com",
      "tutorialspoint.com",
      "obsidianstats.com",
      "starikov.co",
      "launchnotes.com",
    ],
    positiveKeywords: [
      "developer tools",
      "open source",
      "cloud",
      "infra",
      "engineering",
      "developer",
      "platform",
      "release notes",
      "changelog",
    ],
    negativeKeywords: [
      "shopping",
      "games",
      "directory",
      "rss aggregator",
      "generator",
      "widgets",
      "how to",
      "guide",
      "questions",
      "template",
      "web store",
    ],
    preferredTactics: [
      "official engineering blog",
      "engineering blog rss",
      "developer changelog",
      "release notes rss",
    ],
    expectedSourceShapes: ["editorial_blog", "docs"],
    allowedSourceFamilies: ["editorial", "official_blog", "documentation"],
    disfavoredSourceFamilies: ["aggregator"],
    usefulnessHints: ["recurring official release surfaces"],
    preferredDomainBonus: 0.14,
    positiveKeywordBonus: 0.06,
    benchmarkBonus: 0.08,
    diversityCaps: {
      maxPerSourceFamily: 2,
      maxPerDomain: 2,
    },
    minPromotionScore: 0.2,
  },
  yieldBenchmark: {
    domains: ["blog.cloudflare.com", "blog.jetbrains.com", "github.blog", "www.infoq.com"],
    titleKeywords: ["release", "open source", "developer tools", "cloud", "engineering"],
    tacticKeywords: ["rss", "release notes", "engineering blog", "developer changelog"],
  },
  graphMission: {
    title: "Live developer-tools source discovery",
    description:
      "Find live, high-signal sources for developer tools, open-source releases, and cloud infrastructure changes.",
    seedTopics: ["developer tools", "open source releases", "cloud infrastructure"],
    seedLanguages: ["en"],
    seedRegions: ["global"],
    targetProviderTypes: ["rss", "website"],
    maxHypotheses: 4,
    maxSources: 6,
    budgetCents: 120,
    priority: 1,
  },
  recallMission: {
    title: "Live direct source recall",
    description:
      "Acquire live-like domains for developer tools, official release notes, and engineering blogs.",
    missionKind: "manual",
    seedQueries: [
      "site:blog.jetbrains.com company blog feed",
      "site:github.blog engineering feed",
      "site:blog.cloudflare.com developers rss",
      "site:engineering.fb.com engineering blog",
      "site:www.infoq.com feed developers",
    ],
    targetProviderTypes: ["rss", "website"],
    maxCandidates: 8,
  },
};

function buildLiveProfilePayload(runId) {
  const base = buildDiscoveryProfilePayload(LIVE_CASE);
  const suffix = runId.replace(/-/g, "_");
  return {
    ...base,
    profileKey: `${base.profileKey}_${suffix}`,
    displayName: `${base.displayName} ${runId.slice(0, 8)}`,
    description: `${base.description} Live run ${runId}.`,
  };
}

function normalizeStatus(value) {
  return String(value ?? "").trim().toLowerCase();
}

function readRows(payload) {
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

function classifyStepError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  const httpDiagnostics = extractHttpDiagnostics(error);
  const mcpDiagnostics = extractMcpDiagnostics(error);
  if (
    mcpDiagnostics?.toolName === "discovery.recall_candidates.promote"
    && Number(mcpDiagnostics?.errorData?.statusCode ?? 0) === 422
  ) {
    return {
      verdict: "yield-usefulness-weak-but-runtime-healthy",
      reason: "live recall candidate promotion failed validation for the attempted candidate, which is a yield weakness unless every candidate should have been promotable",
    };
  }
  if (httpDiagnostics?.bodyKind === "html") {
    if (
      httpDiagnostics.sourceHint === "external-upstream-challenge-likely" ||
      httpDiagnostics.sourceHint === "newsportal-gateway-upstream-html" ||
      httpDiagnostics.sourceHint === "external-gateway-html"
    ) {
      return {
        verdict: "external-runtime-residual",
        reason: "html response looks like an upstream challenge or gateway residual rather than a shipped MCP contract regression",
      };
    }
    return {
      verdict: "implementation-regression",
      reason: "html returned from a local MCP/admin boundary should be treated as a product-side regression until proven otherwise",
    };
  }
  if (
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("429") ||
    normalized.includes("rate limit") ||
    normalized.includes("dns") ||
    normalized.includes("connection refused")
  ) {
    return {
      verdict: "external-runtime-residual",
      reason: "runtime/network pressure or provider throttling produced a non-product residual",
    };
  }
  if (normalized.includes("deferred") || normalized.includes("unsupported")) {
    return {
      verdict: "documented-unsupported-example",
      reason: "the failing step hit an explicitly deferred or unsupported example path",
    };
  }
  if (
    normalized.includes("no recall candidates")
    || normalized.includes("no promotable recall candidates")
    || normalized.includes("no discovery candidates")
  ) {
    return {
      verdict: "yield-usefulness-weak-but-runtime-healthy",
      reason: "runtime stayed healthy but the live acquisition window did not produce useful candidates",
    };
  }
  return {
    verdict: "implementation-regression",
    reason: "the failure does not match an accepted external residual pattern",
  };
}

function worstVerdict(verdicts) {
  if (verdicts.includes("implementation-regression")) {
    return "implementation-regression";
  }
  if (verdicts.includes("external-runtime-residual")) {
    return "external-runtime-residual";
  }
  if (verdicts.includes("documented-unsupported-example")) {
    return "documented-unsupported-example";
  }
  if (verdicts.includes("yield-usefulness-weak-but-runtime-healthy")) {
    return "yield-usefulness-weak-but-runtime-healthy";
  }
  return "healthy";
}

async function runStep(report, label, fn) {
  const startedAt = Date.now();
  try {
    const evidence = await fn();
    report.steps.push({
      label,
      verdict: "healthy",
      durationMs: Date.now() - startedAt,
      evidence,
    });
    return evidence;
  } catch (error) {
    const classification = classifyStepError(error);
    const httpDiagnostics = extractHttpDiagnostics(error);
    const mcpDiagnostics = extractMcpDiagnostics(error);
    report.steps.push({
      label,
      verdict: classification.verdict,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      classificationReason: classification.reason,
      httpDiagnostics,
      mcpDiagnostics,
    });
    return null;
  }
}

function formatMarkdown(report) {
  const lines = [
    "# MCP HTTP Live Evidence",
    "",
    `- Run ID: ${report.runId}`,
    `- Runtime verdict: ${report.runtimeVerdict}`,
    `- Usefulness verdict: ${report.usefulnessVerdict}`,
    `- Started at: ${report.startedAt}`,
    `- Finished at: ${report.finishedAt}`,
    "",
    "## Steps",
  ];
  for (const step of report.steps) {
    lines.push(`- ${step.label}: ${step.verdict}${step.error ? ` (${step.error})` : ""}`);
    if (step.classificationReason) {
      lines.push(`  classification: ${step.classificationReason}`);
    }
    if (step.httpDiagnostics) {
      lines.push(
        `  http: ${step.httpDiagnostics.requestMethod} ${step.httpDiagnostics.requestUrl} -> ${step.httpDiagnostics.status} ${step.httpDiagnostics.statusText || ""}`.trim()
      );
      lines.push(
        `  content-type/body/source: ${step.httpDiagnostics.contentType ?? "unknown"} / ${step.httpDiagnostics.bodyKind ?? "unknown"} / ${step.httpDiagnostics.sourceHint ?? "unknown"}`
      );
      if (step.httpDiagnostics.bodyPreview) {
        lines.push(`  body preview: ${step.httpDiagnostics.bodyPreview}`);
      }
    }
    if (step.mcpDiagnostics) {
      lines.push(
        `  mcp: ${step.mcpDiagnostics.rpcMethod ?? "unknown"} / ${step.mcpDiagnostics.toolName ?? step.mcpDiagnostics.promptName ?? step.mcpDiagnostics.resourceUri ?? "unknown"} / code ${step.mcpDiagnostics.errorCode ?? "unknown"}`
      );
      if (step.mcpDiagnostics.errorMessage) {
        lines.push(`  mcp error: ${step.mcpDiagnostics.errorMessage}`);
      }
      if (step.mcpDiagnostics.errorData) {
        lines.push(`  mcp data: ${JSON.stringify(step.mcpDiagnostics.errorData)}`);
      }
    }
  }
  if (report.artifacts) {
    lines.push("");
    lines.push("## Artifacts");
    lines.push(`- JSON: ${report.artifacts.jsonPath}`);
    lines.push(`- Markdown: ${report.artifacts.mdPath}`);
  }
  return lines.join("\n");
}

async function main() {
  const harness = createHarness({
    logPrefix: "mcp-http-live",
  });
  const report = {
    kind: "live-mcp-http-evidence",
    runId: harness.runId,
    startedAt: new Date().toISOString(),
    steps: [],
    runtimeVerdict: "healthy",
    usefulnessVerdict: "healthy",
    artifacts: null,
  };

  await harness.setup({
    rebuild: process.argv.includes("--skip-build") === false,
  });

  try {
    const liveToken = await runStep(report, "issue-live-operator-token", async () => {
      const issued = await harness.issueToken({
        label: `live-${harness.runId}`,
        scopes:
          "read,write.templates,write.channels,write.discovery,write.sequences,write.destructive",
      });
      harness.liveToken = issued;
      return {
        tokenId: issued.tokenRecord.tokenId,
        label: issued.tokenRecord.label,
      };
    });

    await runStep(report, "read-live-summary-and-prompts", async () => {
      const token = harness.liveToken.token;
      const [summary, prompt, budget, fetchRuns] = await Promise.all([
        harness.mcpToolCall(token, "admin.summary.get", {}),
        harness.mcpPromptGet(token, "sequence.draft", {
          objective: "prepare a bounded live MCP operator run",
        }),
        harness.mcpToolCall(token, "llm_budget.summary", {}),
        harness.mcpToolCall(token, "fetch_runs.list", { page: 1, pageSize: 10 }),
      ]);
      return {
        summaryKeys: Object.keys(summary ?? {}),
        promptMessages: prompt?.result?.messages?.length ?? 0,
        budgetKeys: Object.keys(budget ?? {}),
        fetchRunKeys: Object.keys(fetchRuns ?? {}),
      };
    });

    await runStep(report, "sequence-drafting-and-bounded-run", async () => {
      const token = harness.liveToken.token;
      const sequence = await harness.mcpToolCall(token, "sequences.create", {
        payload: {
          title: `MCP live bounded sequence ${harness.runId}`,
          description: "Live MCP operator sequence proof with bounded failure semantics.",
          taskGraph: [
            {
              key: "normalize_missing_article",
              module: "article.normalize",
              options: {},
            },
          ],
          status: "active",
          tags: ["mcp", "live-proof"],
        },
      });
      const sequenceId = String(sequence.sequence_id ?? sequence.sequenceId ?? "");
      const run = await harness.mcpToolCall(token, "sequences.run", {
        sequenceId,
        payload: {
          contextJson: {
            doc_id: `live-missing-doc-${harness.runId}`,
            event_id: `live-missing-event-${harness.runId}`,
          },
        },
      });
      const runId = String(run.run_id ?? run.runId ?? "");
      const finalRun = await waitFor(
        "bounded live sequence run",
        () => harness.mcpToolCall(token, "sequences.runs.read", { runId }),
        (value) => ["failed", "succeeded", "cancelled"].includes(normalizeStatus(value.status)),
        { timeoutMs: 90000, intervalMs: 2500 }
      );
      await harness.mcpToolCall(token, "sequences.archive", {
        sequenceId,
        confirm: true,
      });
      return {
        sequenceId,
        runId,
        finalStatus: finalRun.status,
      };
    });

    await runStep(report, "profile-backed-live-discovery", async () => {
      const token = harness.liveToken.token;
      const profile = await harness.mcpToolCall(token, "discovery.profiles.create", {
        payload: buildLiveProfilePayload(harness.runId),
      });
      const profileId = String(profile.profile_id ?? profile.profileId ?? "");
      const graphMission = await harness.mcpToolCall(token, "discovery.missions.create", {
        payload: buildProfileBackedGraphMissionPayload(
          LIVE_CASE,
          harness.runId,
          profileId
        ),
      });
      const missionId = String(graphMission.mission_id ?? graphMission.missionId ?? "");
      await harness.mcpToolCall(token, "discovery.missions.compile_graph", { missionId });
      await harness.mcpToolCall(token, "discovery.missions.run", { missionId });
      const candidates = await waitFor(
        "live discovery candidates",
        () => harness.mcpToolCall(token, "discovery.candidates.list", { missionId, page: 1, pageSize: 20 }),
        (payload) => readRows(payload).length > 0,
        { timeoutMs: 90000, intervalMs: 3000 }
      ).catch(() => null);
      await harness.mcpToolCall(token, "discovery.missions.archive", {
        missionId,
        confirm: true,
      });
      await harness.mcpToolCall(token, "discovery.profiles.archive", {
        profileId,
        confirm: true,
      });
      return {
        profileId,
        missionId,
        candidateCount: candidates ? readRows(candidates).length : 0,
      };
    });

    await runStep(report, "live-recall-acquisition", async () => {
      const token = harness.liveToken.token;
      const profile = await harness.mcpToolCall(token, "discovery.profiles.create", {
        payload: buildLiveProfilePayload(`${harness.runId}-recall`),
      });
      const profileId = String(profile.profile_id ?? profile.profileId ?? "");
      const recallMission = await harness.mcpToolCall(token, "discovery.recall_missions.create", {
        payload: buildProfileBackedRecallMissionPayload(
          LIVE_CASE,
          harness.runId,
          profileId
        ),
      });
      const recallMissionId = String(
        recallMission.recall_mission_id ?? recallMission.recallMissionId ?? ""
      );
      await harness.mcpToolCall(token, "discovery.recall_missions.acquire", {
        recallMissionId,
      }, { timeoutMs: 90000 });

      const recallCandidates = await waitFor(
        "live recall candidates",
        () =>
          harness.mcpToolCall(token, "discovery.recall_candidates.list", {
            recallMissionId,
            page: 1,
            pageSize: 20,
          }),
        (payload) => readRows(payload).length > 0,
        { timeoutMs: 90000, intervalMs: 3000 }
      ).catch(() => null);
      const firstCandidate = readRows(recallCandidates ?? {})[0] ?? null;
      const candidatePlans = readRows(recallCandidates ?? {})
        .map((candidate) => ({
          candidate,
          plan: classifyRecallCandidate(candidate, LIVE_CASE, DISCOVERY_LIVE_DEFAULTS),
        }))
        .sort((left, right) => right.plan.reviewScore - left.plan.reviewScore);

      let promotionEvidence = null;
      const promotionAttempts = [];
      for (const item of candidatePlans) {
        const recallCandidateId = readIdentifier(item.candidate, [
          "recall_candidate_id",
          "recallCandidateId",
        ]);
        if (!recallCandidateId) {
          continue;
        }
        const registeredChannelId = String(
          item.candidate.registered_channel_id ?? item.candidate.registeredChannelId ?? ""
        ).trim();
        const currentStatus = normalizeStatus(item.candidate.status);
        if (registeredChannelId) {
          promotionAttempts.push({
            recallCandidateId,
            decision: "already_registered",
            status: currentStatus,
            registeredChannelId,
          });
          continue;
        }
        if (item.plan.decision !== "promotable") {
          promotionAttempts.push({
            recallCandidateId,
            decision: item.plan.decision,
            rejectionReason: item.plan.rejectionReason ?? null,
            reviewScore: item.plan.reviewScore ?? null,
          });
          continue;
        }
        try {
          const promoted = await harness.mcpToolCall(token, "discovery.recall_candidates.promote", {
            recallCandidateId,
            payload: {
              tags: ["mcp", "live-proof"],
            },
          });
          const promotedChannelId = String(
            promoted.registered_channel_id ?? promoted.registeredChannelId ?? ""
          );
          if (promotedChannelId) {
            await harness.mcpToolCall(token, "channels.delete", {
              channelId: promotedChannelId,
              confirm: true,
            });
          }
          promotionEvidence = {
            recallCandidateId,
            promotedChannelId,
            reviewScore: item.plan.reviewScore ?? null,
          };
          promotionAttempts.push({
            recallCandidateId,
            decision: "promoted",
            promotedChannelId: promotedChannelId || null,
            reviewScore: item.plan.reviewScore ?? null,
          });
          break;
        } catch (error) {
          promotionAttempts.push({
            recallCandidateId,
            decision: "promotion_failed",
            reviewScore: item.plan.reviewScore ?? null,
            error: error instanceof Error ? error.message : String(error),
            mcpDiagnostics: extractMcpDiagnostics(error),
            httpDiagnostics: extractHttpDiagnostics(error),
          });
        }
      }

      await harness.mcpToolCall(token, "discovery.recall_missions.pause", {
        recallMissionId,
        confirm: true,
      });
      await harness.mcpToolCall(token, "discovery.profiles.archive", {
        profileId,
        confirm: true,
      });

      if (!firstCandidate) {
        throw new Error("No recall candidates were produced during the live acquisition window.");
      }

      if (!promotionEvidence) {
        throw new Error("No promotable recall candidates were produced during the live acquisition window.");
      }

      return {
        profileId,
        recallMissionId,
        recallCandidateCount: readRows(recallCandidates ?? {}).length,
        promotionEvidence,
        promotionAttempts,
      };
    });

    const verdicts = report.steps.map((step) => step.verdict);
    report.runtimeVerdict = worstVerdict(
      verdicts.filter((verdict) =>
        ["healthy", "implementation-regression", "external-runtime-residual", "documented-unsupported-example"].includes(
          verdict
        )
      )
    );
    report.usefulnessVerdict = worstVerdict(
      verdicts.filter((verdict) =>
        ["healthy", "yield-usefulness-weak-but-runtime-healthy", "external-runtime-residual"].includes(
          verdict
        )
      )
    );
    report.finishedAt = new Date().toISOString();

    const markdown = formatMarkdown({
      ...report,
      artifacts: {
        jsonPath: `/tmp/newsportal-mcp-http-live-${harness.runId}.json`,
        mdPath: `/tmp/newsportal-mcp-http-live-${harness.runId}.md`,
      },
    });
    const artifacts = await harness.writeArtifacts("newsportal-mcp-http-live", report, markdown);
    report.artifacts = artifacts;
    if (report.runtimeVerdict === "implementation-regression") {
      throw new Error(`Live MCP HTTP evidence found an implementation regression. See ${artifacts.jsonPath}`);
    }
    console.log(`[mcp-http-live] JSON artifact: ${artifacts.jsonPath}`);
    console.log(`[mcp-http-live] Markdown artifact: ${artifacts.mdPath}`);
    console.log(
      `[mcp-http-live] Runtime verdict=${report.runtimeVerdict}, usefulness verdict=${report.usefulnessVerdict}`
    );
  } finally {
    await harness.cleanup();
  }
}

const isMainModule =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMainModule) {
  void main().catch((error) => {
    console.error(`[mcp-http-live] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
