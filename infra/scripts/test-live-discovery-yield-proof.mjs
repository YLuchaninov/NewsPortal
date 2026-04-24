import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  DISCOVERY_LIVE_DEFAULTS,
  DISCOVERY_RUNTIME_CASE_PACKS,
} from "./lib/discovery-live-example-cases.mjs";
import { determineMultiRunYieldProof } from "./lib/discovery-live-yield-policy.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");

function log(message) {
  console.log(`[live-discovery-yield-proof] ${message}`);
}

function parseJsonArtifactPath(output) {
  const matches = [...String(output).matchAll(/Wrote JSON evidence to (.+\.json)/g)];
  const last = matches.at(-1);
  return last ? last[1].trim() : "";
}

function runSingleHarness(iteration, runId) {
  log(`Starting live discovery harness run ${iteration}.`);
  const pointerPath = `/tmp/newsportal-live-discovery-yield-run-${runId}-${iteration}.json`;
  const result = spawnSync("node", ["infra/scripts/test-live-discovery-examples.mjs"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      DISCOVERY_ENABLED: "1",
      DISCOVERY_EXAMPLES_SKIP_PREFLIGHT: "1",
      DISCOVERY_EXAMPLES_SKIP_STACK_RESET: "1",
      DISCOVERY_EXAMPLES_ARTIFACT_POINTER_FILE: pointerPath,
    },
    stdio: ["ignore", "inherit", "inherit"],
  });
  let jsonPath;
  try {
    const pointer = JSON.parse(readFileSync(pointerPath, "utf8"));
    jsonPath = String(pointer?.jsonPath ?? "").trim();
  } catch {
    jsonPath = parseJsonArtifactPath(`${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  }
  return {
    status: result.status ?? 1,
    jsonPath,
  };
}

function formatProofMarkdown(report) {
  const perCase = Array.isArray(report.multiRun?.perCase) ? report.multiRun.perCase : [];
  const aggregateRootCauses = report.multiRun?.aggregateRootCauses ?? {};
  return [
    "# Live Discovery Yield Proof",
    "",
    `Run id: \`${report.runId}\``,
    `Started at: \`${report.startedAt}\``,
    `Runtime verdict: \`${report.runtimeVerdict}\``,
    `Yield verdict: \`${report.yieldVerdict}\``,
    `Final verdict: \`${report.finalVerdict}\``,
    "",
    "## Aggregated runs",
    "",
    ...report.runs.map(
      (item, index) =>
        `- Run ${index + 1}: path=\`${item.jsonPath || "missing"}\`, final=\`${item.finalVerdict}\`, runtime=\`${item.runtimeVerdict}\`, yield=\`${item.yieldVerdict}\`, calibration=\`${item.calibrationPassed ? "passed" : "failed"}\`, dominant_root_cause=\`${item.aggregateYieldDiagnostics?.dominantRootCause || "n/a"}\``
    ),
    "",
    "## Per-case yield counts",
    "",
    ...(perCase.length > 0
      ? perCase.map(
      (item) => {
        const rootCauseSummary = Object.entries(item.rootCauseCounts ?? {})
          .map(([key, count]) => `${key}:${count}`)
          .join(", ");
        return `- ${item.label}: ${item.passingRuns}/${item.totalRuns} passing runs (required ${report.multiRun?.requiredPassingRuns ?? "n/a"}); root_causes=[${rootCauseSummary || "none"}]`;
      }
    )
      : ["- Multi-run summary unavailable because the proof stopped early."]),
    "",
    "## Aggregate Root Causes",
    "",
    ...(Object.keys(aggregateRootCauses).length > 0
      ? Object.entries(aggregateRootCauses).map(([key, count]) => `- ${key}: ${count}`)
      : ["- None recorded."]),
  ].join("\n");
}

async function main() {
  const runId = randomUUID().slice(0, 8);
  const startedAt = new Date().toISOString();
  const jsonPath = `/tmp/newsportal-live-discovery-yield-proof-${runId}.json`;
  const mdPath = `/tmp/newsportal-live-discovery-yield-proof-${runId}.md`;
  const runCount = Number.parseInt(
    String(DISCOVERY_LIVE_DEFAULTS.yieldAcceptance?.multiRunCount ?? 3),
    10
  ) || 3;

  const report = {
    runId,
    startedAt,
    runs: [],
    multiRun: null,
    runtimeVerdict: "fail",
    yieldVerdict: "fail",
    finalVerdict: "fail",
    error: null,
  };

  try {
    for (let index = 0; index < runCount; index += 1) {
      const execution = runSingleHarness(index + 1, runId);
      if (!execution.jsonPath) {
        throw new Error(`Run ${index + 1} did not report a JSON artifact path.`);
      }
      const parsed = JSON.parse(await readFile(execution.jsonPath, "utf8"));
      report.runs.push({
        jsonPath: execution.jsonPath,
        exitCode: execution.status,
        finalVerdict: parsed.finalVerdict,
        runtimeVerdict: parsed.runtimeVerdict,
        yieldVerdict: parsed.yieldVerdict,
        aggregateYieldDiagnostics: parsed.aggregateYieldDiagnostics ?? null,
        calibrationPassed: Array.isArray(parsed.calibration)
          ? parsed.calibration.every((item) => item.passed === true)
          : false,
        caseRuns: parsed.caseRuns ?? [],
      });
      if (parsed.finalVerdict === "precondition_failed" || parsed.runtimeVerdict === "fail") {
        report.runtimeVerdict = parsed.runtimeVerdict ?? "fail";
        report.yieldVerdict = parsed.yieldVerdict ?? "fail";
        report.finalVerdict = parsed.finalVerdict ?? "fail";
        report.error = `Run ${index + 1} ended early with ${String(parsed.finalVerdict ?? "fail")}.`;
        return;
      }
    }

    report.multiRun = determineMultiRunYieldProof(
      report.runs.map((item) => ({
        runtimeVerdict: item.runtimeVerdict,
        caseRuns: item.caseRuns,
      })),
      DISCOVERY_LIVE_DEFAULTS
    );
    for (const casePack of DISCOVERY_RUNTIME_CASE_PACKS) {
      if (!report.multiRun.perCase.some((item) => item.key === casePack.key)) {
        report.multiRun.perCase.push({
          key: casePack.key,
          label: casePack.label,
          passingRuns: 0,
          totalRuns: 0,
          yieldVerdicts: [],
          rootCauseCounts: {},
        });
      }
    }
    report.multiRun.perCase.sort((left, right) => left.label.localeCompare(right.label));
    report.multiRun.aggregateRootCauseDrift = report.multiRun.aggregateRootCauses;
    const calibrationPassed = report.runs.every((item) => item.calibrationPassed === true);
    report.runtimeVerdict = report.multiRun.runtimeVerdict;
    report.yieldVerdict =
      report.multiRun.runtimeVerdict === "fail"
        ? "fail"
        : report.multiRun.yieldVerdict === "pass" && calibrationPassed
          ? "pass"
          : "weak";
    report.finalVerdict =
      report.runtimeVerdict === "fail"
        ? "fail"
        : report.yieldVerdict === "pass"
          ? "pass"
          : "yield_weak";
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(mdPath, `${formatProofMarkdown(report)}\n`, "utf8");
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
