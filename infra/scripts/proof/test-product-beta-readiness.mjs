import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import process from "node:process";
import { tsImport } from "tsx/esm/api";

const repoRoot = process.cwd();

const BETA_COMMANDS = [
  command("control-plane-ownership", "ownership", ["check:control-plane-ownership"]),
  command("beta-route-exposure", "delivery-security", ["check:beta-route-exposure"]),
  command("product-local-core", "product-proof", ["test:product:local:core"]),
  command("product-local-full", "product-proof", ["test:product:local:full"]),
];

function command(key, lane, args) {
  return {
    key,
    lane,
    executable: "pnpm",
    args,
  };
}

function parseArgs(argv) {
  const parsed = {
    failFast: false,
    skipFull: false,
  };
  for (const argument of argv) {
    if (argument === "--fail-fast") {
      parsed.failFast = true;
      continue;
    }
    if (argument === "--skip-full") {
      parsed.skipFull = true;
    }
  }
  return parsed;
}

function runCommand(item) {
  const startedAt = new Date().toISOString();
  console.log(`[product-beta] ${item.key}: ${item.executable} ${item.args.join(" ")}`);
  const result = spawnSync(item.executable, item.args, {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });
  return {
    key: item.key,
    lane: item.lane,
    command: [item.executable, ...item.args].join(" "),
    status: result.status === 0 ? "passed" : "failed",
    exitCode: result.status ?? 1,
    signal: result.signal ?? null,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
}

function commandList(args) {
  return args.skipFull
    ? BETA_COMMANDS.filter((item) => item.key !== "product-local-full")
    : BETA_COMMANDS;
}

async function loadProviderContract() {
  const contracts = await tsImport("../../../runtime/node/packages/contracts/src/index.ts", import.meta.url);
  const capabilities = contracts.SIGNALOPS_PROVIDER_CAPABILITIES;
  return {
    betaIngestProviders: capabilities
      .filter((item) => item.status === "beta_runtime" && item.ingestRuntime)
      .map((item) => item.providerType),
    deliveryOnlyProviders: capabilities
      .filter((item) => item.status === "delivery_only")
      .map((item) => item.providerType),
    futureHiddenProviders: capabilities
      .filter((item) => item.status === "future_hidden")
      .map((item) => item.providerType),
  };
}

function formatMarkdown(report) {
  const lines = [
    `# SignalOps Product Beta Readiness ${report.runId}`,
    "",
    `- Final verdict: \`${report.finalVerdict}\``,
    `- Started: \`${report.startedAt}\``,
    `- Finished: \`${report.finishedAt}\``,
    "",
    "## Provider Capability Contract",
    "",
    "- Beta ingest providers: `rss`, `website`, `api`, `email_imap`.",
    "- Telegram is delivery-only.",
    "- YouTube is future-hidden.",
    "",
    "## Commands",
    "",
    "| Key | Lane | Status | Exit |",
    "| --- | --- | --- | --- |",
  ];
  for (const item of report.commands) {
    lines.push(`| ${item.key} | ${item.lane} | \`${item.status}\` | ${item.exitCode} |`);
  }
  if (report.failures.length > 0) {
    lines.push("", "## Failures", "");
    for (const failure of report.failures) {
      lines.push(`- ${failure}`);
    }
  }
  lines.push("", "## Artifacts", "");
  lines.push(`- JSON: ${report.artifacts.jsonPath}`);
  lines.push(`- Markdown: ${report.artifacts.mdPath}`);
  return lines.join("\n");
}

async function writeArtifacts(report) {
  const jsonPath = `/tmp/signalops-product-beta-readiness-${report.runId}.json`;
  const mdPath = `/tmp/signalops-product-beta-readiness-${report.runId}.md`;
  const withArtifacts = {
    ...report,
    artifacts: {
      jsonPath,
      mdPath,
    },
  };
  await writeFile(jsonPath, `${JSON.stringify(withArtifacts, null, 2)}\n`, "utf8");
  await writeFile(mdPath, `${formatMarkdown(withArtifacts)}\n`, "utf8");
  return withArtifacts;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runId = randomUUID().slice(0, 8);
  const startedAt = new Date().toISOString();
  const providerContract = await loadProviderContract();
  const results = [];
  for (const item of commandList(args)) {
    const result = runCommand(item);
    results.push(result);
    if (args.failFast && result.status !== "passed") {
      break;
    }
  }
  const failures = results
    .filter((item) => item.status !== "passed")
    .map((item) => `${item.key} failed with exit ${item.exitCode}.`);
  const report = await writeArtifacts({
    kind: "signalops-product-beta-readiness-proof",
    schemaVersion: 1,
    runId,
    startedAt,
    finishedAt: new Date().toISOString(),
    finalVerdict: failures.length === 0 ? "pass" : "fail",
    providerContract,
    commands: results,
    failures,
    artifacts: null,
  });
  console.log(`[product-beta] JSON artifact: ${report.artifacts.jsonPath}`);
  console.log(`[product-beta] Markdown artifact: ${report.artifacts.mdPath}`);
  if (report.finalVerdict !== "pass") {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(`[product-beta] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
