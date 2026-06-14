import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  createHarness,
  createLogger,
  repoRoot,
} from "../lib/mcp-http-testkit.mjs";

const log = createLogger("scenario-mcp-verification");

function readArg(name) {
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length);
  }
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function readStringList(value, fieldName) {
  if (value == null) {
    return [];
  }
  if (typeof value === "string") {
    return value
      .split(/[,;\n]/u)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean);
  }
  throw new Error(`${fieldName} must be a string or an array of strings.`);
}

function validateScenarioPack(pack) {
  if (!pack || typeof pack !== "object" || Array.isArray(pack)) {
    throw new Error("Scenario pack must be a JSON object.");
  }
  const scenarios = asArray(pack.scenarios);
  if (scenarios.length === 0) {
    throw new Error("Scenario pack must include at least one scenario.");
  }
  return scenarios.map((scenario, index) => {
    const key = normalizeText(scenario.key);
    const name = normalizeText(scenario.name);
    if (!key) {
      throw new Error(`Scenario at index ${index} is missing key.`);
    }
    if (!name) {
      throw new Error(`Scenario ${key} is missing name.`);
    }
    return {
      key,
      name,
      description: normalizeText(scenario.description),
      positiveTexts: readStringList(scenario.positiveTexts, `${key}.positiveTexts`),
      negativeTexts: readStringList(scenario.negativeTexts, `${key}.negativeTexts`),
      candidatePositiveSignals: readStringList(
        scenario.candidatePositiveSignals,
        `${key}.candidatePositiveSignals`
      ),
      candidateNegativeSignals: readStringList(
        scenario.candidateNegativeSignals,
        `${key}.candidateNegativeSignals`
      ),
      geographies: readStringList(scenario.geographies, `${key}.geographies`),
      languages: readStringList(scenario.languages, `${key}.languages`),
      operatorConstraints:
        scenario.operatorConstraints && typeof scenario.operatorConstraints === "object"
          ? scenario.operatorConstraints
          : {},
      maxBatches: Number.isFinite(Number(scenario.maxBatches))
        ? Math.max(1, Math.min(11, Number(scenario.maxBatches)))
        : 3,
    };
  });
}

async function readPack(packPath) {
  const resolved = path.resolve(repoRoot, packPath);
  const raw = await readFile(resolved, "utf8");
  return {
    path: resolved,
    pack: JSON.parse(raw),
  };
}

async function run() {
  const packArg = readArg("--pack");
  if (!packArg) {
    throw new Error("Pass --pack <scenario-pack.json>.");
  }
  const preflightOnly = hasFlag("--preflight-only");
  const { path: packPath, pack } = await readPack(packArg);
  const scenarios = validateScenarioPack(pack);
  const report = {
    kind: "discovery-vnext-mcp-scenario-verification",
    runId: "",
    packPath,
    preflightOnly,
    scenarios: [],
    status: "passed",
  };

  if (preflightOnly) {
    report.scenarios = scenarios.map((scenario) => ({
      key: scenario.key,
      status: "preflight_passed",
      checks: ["pack_schema"],
    }));
  } else {
    const client = createHarness({ logPrefix: "scenario-mcp-verification" });
    report.runId = client.runId;
    try {
      await client.setup({ rebuild: false });
      const issued = await client.issueToken({
        label: `scenario-verification-${client.runId}`,
        scopes: ["read", "write.discovery"],
      });
      for (const scenario of scenarios) {
        log(`Previewing scenario ${scenario.key}`);
        const brief = await client.mcpToolCall(issued.token, "discovery.brief.preview", {
          name: scenario.name,
          description: scenario.description,
          positiveTexts: scenario.positiveTexts,
          negativeTexts: scenario.negativeTexts,
          candidatePositiveSignals: scenario.candidatePositiveSignals,
          candidateNegativeSignals: scenario.candidateNegativeSignals,
          geographies: scenario.geographies,
          languages: scenario.languages,
          operatorConstraints: scenario.operatorConstraints,
        });
        const discoveryBrief = brief.payload ?? brief;
        const megaLoop = await client.mcpToolCall(issued.token, "discovery.mega_loop.preview", {
          discoveryBrief,
          maxBatches: scenario.maxBatches,
        });
        report.scenarios.push({
          key: scenario.key,
          status: megaLoop.status === "failed" ? "failed" : "passed",
          briefStatus: brief.status,
          megaLoopStatus: megaLoop.status,
          hypothesisBatchCount: asArray(megaLoop.batches).length,
          warnings: asArray(megaLoop.warnings),
        });
      }
    } finally {
      await client.cleanup();
    }
  }

  if (report.scenarios.some((scenario) => scenario.status === "failed")) {
    report.status = "failed";
  }
  const outputPath = `/tmp/signalops-discovery-vnext-mcp-scenario-verification-${report.runId || "preflight"}.json`;
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
  log(`Wrote ${outputPath}`);
  if (report.status !== "passed") {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(`[scenario-mcp-verification] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
