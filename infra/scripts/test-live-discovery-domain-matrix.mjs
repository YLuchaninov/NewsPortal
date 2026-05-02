import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import process from "node:process";

import { DISCOVERY_RUNTIME_CASE_PACKS } from "./lib/discovery-live-example-cases.mjs";
import {
  DOMAIN_MATRIX_MIN_PASSING_RUNS,
  DOMAIN_MATRIX_REPEAT_COUNT,
  buildDomainMatrixCaseRuns,
  determineDomainMatrixVerdicts,
  summarizeDomainCaseRun,
} from "./lib/discovery-live-domain-matrix.mjs";
import { runCommand } from "./lib/mcp-http-testkit.mjs";
import { runLiveDiscoveryExamplesReport } from "./test-live-discovery-examples.mjs";

function log(message) {
  console.log(`[live-discovery-domain-matrix] ${message}`);
}

function slug(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function formatRootCauseCounts(counts) {
  const entries = Object.entries(counts ?? {});
  if (entries.length === 0) {
    return "none";
  }
  return entries.map(([key, count]) => `${key}:${count}`).join(", ");
}

function formatDomainMatrixMarkdown(report) {
  const lines = [
    "# Mega Comprehensive Discovery Matrix Evidence",
    "",
    `Run id: \`${report.runId}\``,
    `Started at: \`${report.startedAt}\``,
    `Runtime verdict: \`${report.runtimeVerdict}\``,
    `Yield verdict: \`${report.yieldVerdict}\``,
    `Final verdict: \`${report.finalVerdict}\``,
    `Repeat count: ${report.repeatCount}`,
    `Min passing runs: ${report.minPassingRuns}`,
    "",
    "## Per-Domain Verdicts",
    "",
    "| Example | Domain | Passing runs | Runtime failures | Root causes |",
    "| --- | --- | ---: | ---: | --- |",
    ...report.matrix.perDomain.map((item) =>
      `| ${item.parentCaseKey} | ${item.domain} | ${item.passingRuns}/${item.totalRuns} | ${item.runtimeFailures} | ${formatRootCauseCounts(item.rootCauseCounts)} |`
    ),
    "",
    "## Run Details",
    "",
  ];

  for (const item of report.runs) {
    lines.push(
      `### Iteration ${item.iteration} · ${item.parentCaseKey} · ${item.domain}`,
      "",
      `- Child artifact: \`${item.jsonPath || "n/a"}\``,
      `- Child final verdict: \`${item.childFinalVerdict || "unknown"}\``,
      `- Domain yield verdict: \`${item.domainSummary?.targetYieldVerdict ?? "unknown"}\``,
      `- Root cause: \`${item.domainSummary?.rootCauseClassification ?? "unknown"}\``,
      `- Target candidates: ${item.domainSummary?.targetCandidatesFound ?? 0}`,
      `- Target benchmark-like candidates: ${item.domainSummary?.targetBenchmarkLikeCandidates ?? 0}`,
      `- Target approved/promoted/duplicate: ${item.domainSummary?.targetApprovedOrPromoted ?? 0}`,
      `- Target registered channels: ${(item.domainSummary?.targetRegisteredChannelIds ?? []).join(", ") || "none"}`,
      `- Target baseline successful fetches: ${item.domainSummary?.targetBaselineSuccessfulFetches ?? 0}`,
      `- Target downstream evidence rows: ${item.domainSummary?.targetDownstreamEvidence ?? 0}`,
      ""
    );
  }

  if (report.error) {
    lines.push("## Error", "", report.error, "");
  }

  return lines.join("\n");
}

async function main() {
  const runId = randomUUID().slice(0, 8);
  const startedAt = new Date().toISOString();
  const jsonPath = `/tmp/newsportal-live-discovery-domain-matrix-${runId}.json`;
  const mdPath = `/tmp/newsportal-live-discovery-domain-matrix-${runId}.md`;
  const matrixCases = buildDomainMatrixCaseRuns(DISCOVERY_RUNTIME_CASE_PACKS);
  const report = {
    runId,
    startedAt,
    repeatCount: DOMAIN_MATRIX_REPEAT_COUNT,
    minPassingRuns: DOMAIN_MATRIX_MIN_PASSING_RUNS,
    matrixTargets: matrixCases.map((item) => ({
      parentCaseKey: item.parentCaseKey,
      parentLabel: item.parentLabel,
      domain: item.domain,
      label: item.label,
    })),
    runs: [],
    matrix: {
      runtimeVerdict: "fail",
      yieldVerdict: "fail",
      finalVerdict: "fail",
      perDomain: [],
      consistentlyFailingDomains: [],
    },
    runtimeVerdict: "fail",
    yieldVerdict: "fail",
    finalVerdict: "fail",
    error: null,
  };

  try {
    process.env.DISCOVERY_ENABLED = "1";
    process.env.DISCOVERY_EXAMPLES_SKIP_PREFLIGHT = "1";
    process.env.DISCOVERY_EXAMPLES_SKIP_STACK_RESET = "1";

    log("Ensuring compose stack is running for the domain matrix parent harness.");
    runCommand("pnpm", ["dev:mvp:internal"]);

    let stoppedEarly = false;
    for (let iteration = 1; iteration <= DOMAIN_MATRIX_REPEAT_COUNT && !stoppedEarly; iteration += 1) {
      for (const matrixCase of matrixCases) {
        const artifactPrefix = [
          "newsportal-live-discovery-domain-matrix-child",
          runId,
          `i${iteration}`,
          slug(matrixCase.parentCaseKey),
          slug(matrixCase.domain),
        ].join("-");
        log(`Running iteration ${iteration}/${DOMAIN_MATRIX_REPEAT_COUNT} for ${matrixCase.parentCaseKey} on ${matrixCase.domain}.`);
        const child = await runLiveDiscoveryExamplesReport({
          artifactPrefix,
          casePacks: [matrixCase.caseDefinition],
          validationCasePacks: [matrixCase.caseDefinition],
          closePool: false,
          throwOnError: false,
        });
        const caseRun = child.report.caseRuns[0] ?? null;
        const domainSummary = caseRun
          ? summarizeDomainCaseRun(caseRun, { domain: matrixCase.domain })
          : {
              parentCaseKey: matrixCase.parentCaseKey,
              domain: matrixCase.domain,
              runtimeVerdict: child.report.runtimeVerdict,
              targetYieldVerdict: "weak",
              rootCauseClassification: child.report.finalVerdict === "precondition_failed"
                ? "precondition_failed"
                : "runtime_problem",
              targetCandidatesFound: 0,
              targetBenchmarkLikeCandidates: 0,
              targetApprovedOrPromoted: 0,
              targetRegisteredChannelIds: [],
              targetBaselineSuccessfulFetches: 0,
              targetDownstreamEvidence: 0,
            };
        report.runs.push({
          iteration,
          parentCaseKey: matrixCase.parentCaseKey,
          parentLabel: matrixCase.parentLabel,
          domain: matrixCase.domain,
          label: matrixCase.label,
          jsonPath: child.jsonPath,
          mdPath: child.mdPath,
          childFinalVerdict: child.report.finalVerdict,
          childRuntimeVerdict: child.report.runtimeVerdict,
          childYieldVerdict: child.report.yieldVerdict,
          childError: child.report.error,
          domainSummary,
        });
        if (child.report.finalVerdict === "fail" || child.report.finalVerdict === "precondition_failed") {
          stoppedEarly = true;
          break;
        }
      }
    }

    report.matrix = determineDomainMatrixVerdicts(report.runs, {
      repeatCount: DOMAIN_MATRIX_REPEAT_COUNT,
      minPassingRuns: DOMAIN_MATRIX_MIN_PASSING_RUNS,
    });
    report.runtimeVerdict = report.matrix.runtimeVerdict;
    report.yieldVerdict = report.matrix.yieldVerdict;
    report.finalVerdict = report.matrix.finalVerdict;
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(mdPath, `${formatDomainMatrixMarkdown(report)}\n`, "utf8");
    log(`Wrote JSON evidence to ${jsonPath}`);
    log(`Wrote Markdown evidence to ${mdPath}`);
  }

  if (report.finalVerdict !== "pass") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
