import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  createHarness,
  extractHttpDiagnostics,
  extractMcpDiagnostics,
  waitFor,
} from "./lib/mcp-http-testkit.mjs";

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
    mcpDiagnostics?.toolName === "discovery.endpoints.promote"
    && Number(mcpDiagnostics?.errorData?.statusCode ?? 0) === 422
  ) {
    return {
      verdict: "yield-usefulness-weak-but-runtime-healthy",
      reason: "live endpoint promotion failed validation for the attempted endpoint, which is a yield weakness unless every endpoint should have been promotable",
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
    normalized.includes("no discovery endpoints")
    || normalized.includes("no promotable discovery endpoints")
  ) {
    return {
      verdict: "yield-usefulness-weak-but-runtime-healthy",
      reason: "runtime stayed healthy but the live acquisition window did not produce useful endpoints",
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
    await runStep(report, "issue-live-operator-token", async () => {
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

    await runStep(report, "v3-live-discovery-target-run", async () => {
      const token = harness.liveToken.token;
      const target = await harness.mcpToolCall(token, "discovery.targets.create_manual", {
        payload: {
          originKind: "manual_prompt",
          title: `MCP HTTP live v3 discovery ${harness.runId}`,
          description:
            "Bounded v3 target for developer tools, open-source releases, and cloud infrastructure source discovery.",
          seedTopics: LIVE_CASE.graphMission.seedTopics,
          seedEntities: ["Cloudflare", "JetBrains", "GitHub", "Kubernetes"],
          seedGeos: ["global"],
          seedLanguages: ["en"],
          graphJson: {
            coreTopic: "developer tools and cloud infrastructure releases",
            sourceRoleTargets: {
              authoritative_anchor: { min: 1, target: 2 },
              technical_change: { min: 1, target: 2 },
              report_research: { min: 1, target: 1 },
            },
          },
          policyJson: {
            hypothesisBudget: {
              total: 24,
              bySignalMode: { direct: 18, hidden: 6 },
              maxPerProvider: { web_search: 18, reddit: 3, youtube: 3 },
            },
            targetSafety: {
              maxNewSourcesPerRun: 2,
              maxAutoPromotionsPerRun: 1,
            },
          },
        },
      });
      const targetId = String(target.target_id ?? target.targetId ?? "");
      await harness.mcpToolCall(token, "discovery.coverage.refresh", { targetId });
      const run = await harness.mcpToolCall(token, "discovery.runs.start", {
        payload: {
          targetId,
          runKind: "manual",
          triggerKind: "mcp",
          maxDepth: 1,
          maxHypotheses: 24,
          maxDomains: 40,
          maxEndpoints: 60,
        },
      });
      const runId = String(run.run_id ?? run.runId ?? "");
      await harness.mcpToolCall(token, "discovery.runs.read", { runId });
      await harness.mcpToolCall(token, "discovery.coverage.read", { targetId });
      const endpoints = await harness.mcpToolCall(token, "discovery.endpoints.list", {
        targetId,
        page: 1,
        pageSize: 20,
      });
      return {
        targetId,
        runId,
        endpointCount: readRows(endpoints).length,
      };
    });

    await runStep(report, "v3-live-guards-readback", async () => {
      const token = harness.liveToken.token;
      const [
        contracts,
        claims,
        negativeEvidence,
        providerHealth,
        evalSuites,
        evalRuns,
      ] = await Promise.all([
        harness.mcpToolCall(token, "discovery.contracts.list", { page: 1, pageSize: 10 }),
        harness.mcpToolCall(token, "discovery.claims.list", { page: 1, pageSize: 10 }),
        harness.mcpToolCall(token, "discovery.negative_evidence.list", { page: 1, pageSize: 10 }),
        harness.mcpToolCall(token, "discovery.provider_health.list", { page: 1, pageSize: 10 }),
        harness.mcpToolCall(token, "discovery.eval_suites.list", { page: 1, pageSize: 10 }),
        harness.mcpToolCall(token, "discovery.eval_runs.list", { page: 1, pageSize: 10 }),
      ]);
      return {
        contractRows: readRows(contracts).length,
        claimRows: readRows(claims).length,
        negativeEvidenceRows: readRows(negativeEvidence).length,
        providerHealthRows: readRows(providerHealth).length,
        evalSuiteRows: readRows(evalSuites).length,
        evalRunRows: readRows(evalRuns).length,
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
