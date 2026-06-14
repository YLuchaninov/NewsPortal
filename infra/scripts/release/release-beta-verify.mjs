import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const runId = crypto.randomUUID().slice(0, 8);
const artifactDir = path.join(os.tmpdir(), `signalops-release-beta-verify-${runId}`);

const steps = [
  step("prod-env", "pnpm", ["check:prod-env"]),
  step("beta-route-exposure", "pnpm", ["check:beta-route-exposure"]),
  step("control-plane-ownership", "pnpm", ["check:control-plane-ownership"]),
  step("compliance", "pnpm", ["check:compliance"]),
  step("lint", "pnpm", ["lint"]),
  step("typecheck", "pnpm", ["typecheck"]),
  step("unit-tests", "pnpm", ["unit_tests"]),
  step("workspace-build", "pnpm", ["build"]),
  step("node-runtime-build", "pnpm", ["build:node-runtime"]),
  step("production-compose-image-build", "docker", [
    "compose",
    "--env-file",
    ".env.prod",
    "-f",
    "infra/docker/compose.yml",
    "-f",
    "infra/docker/compose.prod.yml",
    "build",
  ]),
  step("runtime-image-sizes", "pnpm", ["check:runtime-image-sizes"]),
  step("production-image-contents", "pnpm", ["check:production-image-contents"]),
  step("supply-chain-inventory-artifact", "pnpm", [
    "check:supply-chain-inventory",
    "--output",
    path.join(artifactDir, "supply-chain-inventory.json"),
  ]),
  step("product-beta-readiness", "pnpm", ["test:product:beta-readiness"]),
  step("product-local-cleanup", "pnpm", ["test:product:local:cleanup"]),
  step("local-stack-down", "pnpm", ["dev:mvp:internal:down"]),
];

function step(name, command, args) {
  return { name, command, args };
}

function runStep(item) {
  console.log(`\n[release:beta:verify] ${item.name}: ${item.command} ${item.args.join(" ")}`);
  const result = spawnSync(item.command, item.args, {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${item.name} failed with exit code ${result.status ?? "unknown"}.`);
  }
}

function attemptCleanup(completedSteps, currentStep) {
  const shouldCleanup =
    currentStep?.startsWith("product-") ||
    currentStep === "local-stack-down" ||
    completedSteps.some((name) => name.startsWith("product-"));
  if (!shouldCleanup) {
    return;
  }
  for (const item of [
    step("product-local-cleanup-after-failure", "pnpm", ["test:product:local:cleanup"]),
    step("local-stack-down-after-failure", "pnpm", ["dev:mvp:internal:down"]),
  ]) {
    try {
      runStep(item);
    } catch (error) {
      console.warn(`[release:beta:verify] cleanup step ${item.name} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

fs.mkdirSync(artifactDir, { recursive: true });

const startedAt = new Date().toISOString();
const completedSteps = [];
let currentStep = null;

try {
  for (const item of steps) {
    currentStep = item.name;
    runStep(item);
    completedSteps.push(item.name);
  }
} catch (error) {
  console.error(`\n[release:beta:verify] failed after steps: ${completedSteps.join(", ") || "none"}`);
  console.error(`[release:beta:verify] artifact dir: ${artifactDir}`);
  attemptCleanup(completedSteps, currentStep);
  throw error;
}

const summary = {
  schemaVersion: 1,
  runId,
  startedAt,
  completedAt: new Date().toISOString(),
  deploymentTarget: "single-host-compose",
  deployStatus: "verified_not_deployed",
  artifactDir,
  completedSteps,
};
const summaryFile = path.join(artifactDir, "release-beta-verify-summary.json");
fs.writeFileSync(summaryFile, `${JSON.stringify(summary, null, 2)}\n`);

console.log("\n[release:beta:verify] passed");
console.log(`[release:beta:verify] artifact dir: ${artifactDir}`);
console.log(`[release:beta:verify] summary: ${summaryFile}`);
