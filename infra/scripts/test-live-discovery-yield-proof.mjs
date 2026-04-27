import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  DISCOVERY_LIVE_DEFAULTS,
  DISCOVERY_RUNTIME_CASE_PACKS,
} from "./lib/discovery-live-example-cases.mjs";
import {
  formatYieldProofMarkdown,
} from "./lib/discovery-live-yield-report.mjs";
import { runSingleDiscoveryExamplesHarness } from "./lib/discovery-live-yield-runner.mjs";
import { determineMultiRunYieldProof } from "./lib/discovery-live-yield-policy.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");

function log(message) {
  console.log(`[live-discovery-yield-proof] ${message}`);
}

function runCommand(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(
      `Command failed (${command} ${args.join(" ")}): exit code ${result.status ?? "unknown"}`
    );
  }
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
    log("Ensuring compose stack is running for the parent yield harness.");
    runCommand("pnpm", ["dev:mvp:internal"]);

    let stoppedEarly = false;
    for (let index = 0; index < runCount; index += 1) {
      const execution = runSingleDiscoveryExamplesHarness({
        iteration: index + 1,
        runId,
        repoRoot,
      });
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
      if (
        execution.status !== 0
        || parsed.finalVerdict === "precondition_failed"
        || parsed.finalVerdict === "fail"
        || parsed.runtimeVerdict === "fail"
      ) {
        report.runtimeVerdict = parsed.runtimeVerdict ?? "fail";
        report.yieldVerdict = parsed.yieldVerdict ?? "fail";
        report.finalVerdict = parsed.finalVerdict ?? "fail";
        report.error = `Run ${index + 1} ended early with ${String(parsed.finalVerdict ?? "fail")}.`;
        stoppedEarly = true;
        break;
      }
    }

    if (!stoppedEarly) {
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
    }
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(mdPath, `${formatYieldProofMarkdown(report)}\n`, "utf8");
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
