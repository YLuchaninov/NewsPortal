import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  createHarness,
} from "./lib/mcp-http-testkit.mjs";
import {
  formatDeterministicReportMarkdown,
  resolveDeterministicScenarios,
  runDeterministicScenario,
} from "./lib/mcp-http-scenarios.mjs";

function parseArgs(argv) {
  const parsed = {
    scenarios: [],
    group: "",
    skipBuild: false,
  };

  for (const argument of argv) {
    if (argument.startsWith("--scenario=")) {
      parsed.scenarios.push(argument.slice("--scenario=".length));
      continue;
    }
    if (argument.startsWith("--group=")) {
      parsed.group = argument.slice("--group=".length);
      continue;
    }
    if (argument === "--skip-build") {
      parsed.skipBuild = true;
    }
  }

  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const harness = createHarness({
    logPrefix: "mcp-http-compose",
  });
  const scenarioKeys = resolveDeterministicScenarios({
    scenarios: args.scenarios,
    group: args.group,
  });
  harness.selectedScenarioKeys = scenarioKeys;
  const startedAt = new Date().toISOString();
  let report = null;

  await harness.setup({
    rebuild: !args.skipBuild,
  });

  try {
    for (const scenarioKey of scenarioKeys) {
      harness.log(`Running deterministic scenario ${scenarioKey}.`);
      const result = await runDeterministicScenario(harness, scenarioKey);
      harness.recordScenario(result);
    }

    report = {
      kind: "deterministic-mcp-http-proof",
      runId: harness.runId,
      startedAt,
      finishedAt: new Date().toISOString(),
      selectedScenarios: scenarioKeys,
      scenarios: harness.scenarioResults,
      coverage: harness.getCoverage(),
      shippedInventory: harness.shippedInventory,
      docParityMatrix: harness.docParityMatrix ?? null,
      adminEmail: harness.adminEmail,
      artifacts: null,
    };

    const markdown = formatDeterministicReportMarkdown({
      ...report,
      artifacts: {
        jsonPath: `/tmp/newsportal-mcp-http-deterministic-${harness.runId}.json`,
        mdPath: `/tmp/newsportal-mcp-http-deterministic-${harness.runId}.md`,
      },
    });
    const artifacts = await harness.writeArtifacts(
      "newsportal-mcp-http-deterministic",
      report,
      markdown
    );
    report.artifacts = artifacts;

    harness.log(`Deterministic MCP HTTP proof completed successfully.`);
    harness.log(`JSON artifact: ${artifacts.jsonPath}`);
    harness.log(`Markdown artifact: ${artifacts.mdPath}`);
  } finally {
    await harness.cleanup();
  }

  if (!report) {
    throw new Error("MCP HTTP deterministic proof finished without a report.");
  }
}

const isMainModule =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMainModule) {
  void main().catch((error) => {
    console.error(`[mcp-http-compose] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
