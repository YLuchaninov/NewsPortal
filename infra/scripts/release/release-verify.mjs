import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const runId = crypto.randomUUID().slice(0, 8);
const artifactDir = path.join(os.tmpdir(), `signalops-release-verify-${runId}`);
const steps = [
  {
    name: "compliance",
    command: "pnpm",
    args: ["check:compliance"],
  },
  {
    name: "operator-truth-parity",
    command: "pnpm",
    args: ["check:operator-truth-parity"],
  },
  {
    name: "lint",
    command: "pnpm",
    args: ["lint"],
  },
  {
    name: "typecheck",
    command: "pnpm",
    args: ["typecheck"],
  },
  {
    name: "unit-tests",
    command: "pnpm",
    args: ["unit_tests"],
  },
  {
    name: "workspace-build",
    command: "pnpm",
    args: ["build"],
  },
  {
    name: "node-runtime-build",
    command: "pnpm",
    args: ["build:node-runtime"],
  },
  {
    name: "production-compose-image-build",
    command: "docker",
    args: [
      "compose",
      "--env-file",
      ".env.prod",
      "-f",
      "infra/docker/compose.yml",
      "-f",
      "infra/docker/compose.prod.yml",
      "build",
    ],
  },
  {
    name: "runtime-image-sizes",
    command: "pnpm",
    args: ["check:runtime-image-sizes"],
  },
  {
    name: "production-image-contents",
    command: "pnpm",
    args: ["check:production-image-contents"],
  },
  {
    name: "supply-chain-inventory-artifact",
    command: "pnpm",
    args: [
      "check:supply-chain-inventory",
      "--output",
      path.join(artifactDir, "supply-chain-inventory.json"),
    ],
  },
  {
    name: "product-local-core",
    command: "pnpm",
    args: ["test:product:local:core"],
  },
  {
    name: "product-local-full",
    command: "pnpm",
    args: ["test:product:local:full"],
  },
  {
    name: "product-local-cleanup",
    command: "pnpm",
    args: ["test:product:local:cleanup"],
  },
  {
    name: "local-stack-down",
    command: "pnpm",
    args: ["dev:mvp:internal:down"],
  },
];

function runStep(step) {
  const printable = [step.command, ...step.args].join(" ");
  console.log(`\n[release:verify] ${step.name}: ${printable}`);
  const result = spawnSync(step.command, step.args, {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${step.name} failed with exit code ${result.status ?? "unknown"}.`);
  }
}

fs.mkdirSync(artifactDir, { recursive: true });

const startedAt = new Date().toISOString();
const completedSteps = [];
let currentStep = null;

function shouldAttemptFailureCleanup() {
  return (
    currentStep?.startsWith("product-local") ||
    currentStep === "local-stack-down" ||
    completedSteps.some((step) => step.startsWith("product-local"))
  );
}

function runBestEffortCleanup() {
  if (!shouldAttemptFailureCleanup()) {
    return;
  }
  for (const step of [
    { name: "product-local-cleanup-after-failure", command: "pnpm", args: ["test:product:local:cleanup"] },
    { name: "local-stack-down-after-failure", command: "pnpm", args: ["dev:mvp:internal:down"] },
  ]) {
    console.log(`\n[release:verify] ${step.name}: ${step.command} ${step.args.join(" ")}`);
    const result = spawnSync(step.command, step.args, {
      cwd: repoRoot,
      env: process.env,
      stdio: "inherit",
    });
    if (result.status !== 0) {
      console.warn(
        `[release:verify] ${step.name} failed with exit code ${result.status ?? "unknown"}.`,
      );
    }
  }
}

function assertNoRunningContainers() {
  const result = spawnSync("docker", ["ps", "--format", "{{.Names}}"], {
    cwd: repoRoot,
    env: process.env,
    encoding: "utf8",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`docker ps failed with exit code ${result.status ?? "unknown"}.`);
  }
  const names = result.stdout.trim();
  if (names) {
    throw new Error(`release verification left running containers:\n${names}`);
  }
}

try {
  for (const step of steps) {
    currentStep = step.name;
    runStep(step);
    completedSteps.push(step.name);
  }
  currentStep = "no-running-containers";
  assertNoRunningContainers();
  completedSteps.push("no-running-containers");
} catch (error) {
  console.error(`\n[release:verify] failed after steps: ${completedSteps.join(", ") || "none"}`);
  console.error(`[release:verify] artifact dir: ${artifactDir}`);
  runBestEffortCleanup();
  throw error;
}

const summary = {
  schemaVersion: 1,
  runId,
  startedAt,
  completedAt: new Date().toISOString(),
  deployCommand: null,
  deployStatus: "absent_by_design",
  artifactDir,
  completedSteps,
};
const summaryFile = path.join(artifactDir, "release-verify-summary.json");
fs.writeFileSync(summaryFile, `${JSON.stringify(summary, null, 2)}\n`);

console.log(`\n[release:verify] passed`);
console.log(`[release:verify] artifact dir: ${artifactDir}`);
console.log(`[release:verify] summary: ${summaryFile}`);
