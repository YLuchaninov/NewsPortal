import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

import {
  determineProductMegaFlowVerdict,
  PRODUCT_MEGA_FLOW_REQUIRED_COMMANDS,
  PRODUCT_MEGA_FLOW_SCENARIOS,
} from "./lib/product-mega-flow-proof.mjs";
import {
  createLogger,
  ensureComposeStack,
  readEnvFile,
  repoRoot,
} from "./lib/mcp-http-testkit.mjs";
import { runLiveDiscoveryExamplesReport } from "./test-live-discovery-examples.mjs";

const log = createLogger("product-mega-flow");

const CORE_REQUIRED_ENV = [
  "FIREBASE_PROJECT_ID",
  "FIREBASE_WEB_API_KEY",
  "ADMIN_ALLOWLIST_EMAILS",
  "APP_SECRET",
  "PUBLIC_API_SIGNING_KEY",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "GEMINI_BASE_URL",
  "EMAIL_DIGEST_SMTP_URL",
];

const DISCOVERY_REQUIRED_ENV = [
  "DISCOVERY_SEARCH_PROVIDER",
  "DISCOVERY_MONTHLY_BUDGET_CENTS",
];

const YIELD_PROOF_COMMAND = {
  key: "discovery-yield-compose",
  lane: "live-provider",
  executable: "pnpm",
  args: ["test:discovery:yield:compose"],
  proves: ["a-b-c-three-repeat-live-yield"],
};

function parseArgs(argv) {
  const parsed = {
    failFast: false,
    skipStackBuild: false,
    includeYieldProof: false,
  };

  for (const argument of argv) {
    if (argument === "--fail-fast") {
      parsed.failFast = true;
      continue;
    }
    if (argument === "--skip-stack-build") {
      parsed.skipStackBuild = true;
      continue;
    }
    if (argument === "--with-yield-proof") {
      parsed.includeYieldProof = true;
    }
  }

  return parsed;
}

function configuredValue(env, key) {
  const value = String(process.env[key] ?? env[key] ?? "").trim();
  return Boolean(value && value !== "replace-me" && value !== "{}");
}

function maskedPresence(env, key) {
  return {
    key,
    configured: configuredValue(env, key),
  };
}

function validateEnv(env) {
  const failures = [];
  const warnings = [];

  for (const key of CORE_REQUIRED_ENV) {
    if (!configuredValue(env, key)) {
      failures.push(`${key} must be configured for product mega-flow testing.`);
    }
  }

  if (String(process.env.DISCOVERY_ENABLED ?? env.DISCOVERY_ENABLED ?? "").trim() !== "1") {
    failures.push("DISCOVERY_ENABLED=1 is required for product mega-flow live discovery.");
  }

  for (const key of DISCOVERY_REQUIRED_ENV) {
    if (!configuredValue(env, key)) {
      failures.push(`${key} must be configured for product mega-flow live discovery.`);
    }
  }

  if (!configuredValue(env, "DISCOVERY_GEMINI_MODEL") && !configuredValue(env, "GEMINI_MODEL")) {
    failures.push("DISCOVERY_GEMINI_MODEL or GEMINI_MODEL must be configured.");
  }
  if (!configuredValue(env, "DISCOVERY_GEMINI_BASE_URL") && !configuredValue(env, "GEMINI_BASE_URL")) {
    failures.push("DISCOVERY_GEMINI_BASE_URL or GEMINI_BASE_URL must be configured.");
  }

  const provider = String(process.env.DISCOVERY_SEARCH_PROVIDER ?? env.DISCOVERY_SEARCH_PROVIDER ?? "").trim();
  if (provider === "brave" && !configuredValue(env, "DISCOVERY_BRAVE_API_KEY")) {
    failures.push("DISCOVERY_BRAVE_API_KEY is required when DISCOVERY_SEARCH_PROVIDER=brave.");
  }
  if (provider === "serper" && !configuredValue(env, "DISCOVERY_SERPER_API_KEY")) {
    failures.push("DISCOVERY_SERPER_API_KEY is required when DISCOVERY_SEARCH_PROVIDER=serper.");
  }

  const smtpUrl = String(process.env.EMAIL_DIGEST_SMTP_URL ?? env.EMAIL_DIGEST_SMTP_URL ?? "");
  if (smtpUrl && !smtpUrl.includes("mailpit:1025")) {
    warnings.push("EMAIL_DIGEST_SMTP_URL is not the local Mailpit sink; digest proof may be non-repeatable.");
  }

  return {
    status: failures.length === 0 ? "passed" : "failed",
    failures,
    warnings,
    required: [...CORE_REQUIRED_ENV, ...DISCOVERY_REQUIRED_ENV].map((key) =>
      maskedPresence(env, key)
    ),
  };
}

function extractJsonArtifactPaths(output) {
  const paths = new Set();
  const patterns = [
    /JSON artifact:\s*(\/tmp\/\S+?\.json)/gu,
    /Wrote JSON evidence to\s*(\/tmp\/\S+?\.json)/gu,
  ];
  for (const pattern of patterns) {
    for (const match of String(output ?? "").matchAll(pattern)) {
      paths.add(match[1]);
    }
  }
  return [...paths];
}

async function readJsonArtifact(jsonPath) {
  if (!jsonPath) {
    return null;
  }
  try {
    return JSON.parse(await readFile(jsonPath, "utf8"));
  } catch (error) {
    return {
      artifactReadError: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runMegaCommand(item) {
  const maxAttempts = Math.max(1, Number.parseInt(String(item.maxAttempts ?? 1), 10) || 1);
  const startedAt = new Date().toISOString();
  const attempts = [];
  const parsedArtifacts = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    log(`Running ${item.key} attempt ${attempt}/${maxAttempts}: ${item.executable} ${item.args.join(" ")}`);
    const result = spawnSync(item.executable, item.args, {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, DISCOVERY_ENABLED: "1" },
      maxBuffer: 64 * 1024 * 1024,
    });
    const stdout = result.stdout ?? "";
    const stderr = result.stderr ?? "";
    if (stdout) {
      process.stdout.write(stdout);
    }
    if (stderr) {
      process.stderr.write(stderr);
    }
    const jsonArtifactPaths = extractJsonArtifactPaths(`${stdout}\n${stderr}`);
    const attemptArtifacts = [];
    for (const jsonPath of jsonArtifactPaths) {
      const parsed = await readJsonArtifact(jsonPath);
      const artifact = {
        jsonPath,
        parsed,
      };
      parsedArtifacts.push(artifact);
      attemptArtifacts.push({
        jsonPath,
        kind: parsed?.kind ?? null,
        finalVerdict: parsed?.finalVerdict ?? null,
        status: parsed?.status ?? null,
      });
    }
    const status = result.status === 0 ? "passed" : "failed";
    attempts.push({
      attempt,
      status,
      exitCode: result.status ?? 1,
      signal: result.signal ?? null,
      artifacts: attemptArtifacts,
    });
    if (status === "passed") {
      break;
    }
    if (attempt < maxAttempts) {
      log(`${item.key} failed on attempt ${attempt}; retrying once for bounded flaky proof tolerance.`);
    }
  }
  const finalAttempt = attempts.at(-1) ?? {
    status: "failed",
    exitCode: 1,
    signal: null,
    artifacts: [],
  };
  const artifacts = attempts.flatMap((attempt) => attempt.artifacts);

  return {
    key: item.key,
    lane: item.lane,
    command: [item.executable, ...item.args].join(" "),
    proves: item.proves ?? [],
    status: finalAttempt.status,
    exitCode: finalAttempt.exitCode,
    signal: finalAttempt.signal,
    startedAt,
    finishedAt: new Date().toISOString(),
    attempts,
    artifacts,
    parsedArtifacts,
  };
}

function findParsedArtifact(commandResults, commandKey, predicate = () => true) {
  const commandResult = commandResults.find((item) => item.key === commandKey);
  for (const artifact of commandResult?.parsedArtifacts ?? []) {
    if (predicate(artifact.parsed)) {
      return artifact.parsed;
    }
  }
  return null;
}

function stripParsedArtifacts(commandResults) {
  return commandResults.map((item) => {
    const stripped = { ...item };
    delete stripped.parsedArtifacts;
    return stripped;
  });
}

function formatMarkdown(report) {
  const lines = [
    `# NewsPortal Product Mega Flow ${report.runId}`,
    "",
    `- Final verdict: \`${report.finalVerdict}\``,
    `- Runtime verdict: \`${report.runtimeVerdict}\``,
    `- Yield verdict: \`${report.yieldVerdict}\``,
    `- Started: \`${report.startedAt}\``,
    `- Finished: \`${report.finishedAt}\``,
    "",
    "## Scope",
    "",
    "- Live A/B/C discovery is a hard acceptance layer.",
    "- The 9-domain discovery matrix remains a separate residual diagnostic and is not required here.",
    "- Deterministic fixtures cover provider, filter, sequence and Web/Admin/MCP surface buckets.",
    "",
    "## Commands",
    "",
    "| Key | Lane | Status | Exit |",
    "| --- | --- | --- | --- |",
  ];

  for (const item of report.commands) {
    lines.push(`| ${item.key} | ${item.lane} | \`${item.status}\` | ${item.exitCode} |`);
  }

  lines.push("", "## Scenarios", "");
  lines.push("| Example | Domain | Status | Discovery | Selected | Downstream |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const scenario of report.scenarios) {
    lines.push(
      `| ${scenario.example} | ${scenario.productDomain} | \`${scenario.status}\` | ` +
        `\`${scenario.liveDiscovery.finalVerdict}\` | ${scenario.liveDiscovery.selectedFinalRows} | ` +
        `${scenario.liveDiscovery.downstreamEvidenceRows} |`
    );
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
  if (report.discoveryArtifact?.jsonPath) {
    lines.push(`- Live discovery single-run: ${report.discoveryArtifact.jsonPath}`);
  }
  if (report.yieldProofArtifact?.jsonPath) {
    lines.push(`- Live discovery multi-run yield: ${report.yieldProofArtifact.jsonPath}`);
  }

  return lines.join("\n");
}

async function writeArtifacts(report) {
  const jsonPath = `/tmp/newsportal-product-mega-flow-${report.runId}.json`;
  const mdPath = `/tmp/newsportal-product-mega-flow-${report.runId}.md`;
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

async function withDiscoveryParentEnv(callback) {
  const previous = {
    DISCOVERY_ENABLED: process.env.DISCOVERY_ENABLED,
    DISCOVERY_EXAMPLES_SKIP_PREFLIGHT: process.env.DISCOVERY_EXAMPLES_SKIP_PREFLIGHT,
    DISCOVERY_EXAMPLES_SKIP_STACK_RESET: process.env.DISCOVERY_EXAMPLES_SKIP_STACK_RESET,
  };
  process.env.DISCOVERY_ENABLED = "1";
  process.env.DISCOVERY_EXAMPLES_SKIP_PREFLIGHT = "1";
  process.env.DISCOVERY_EXAMPLES_SKIP_STACK_RESET = "1";
  try {
    return await callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runId = randomUUID().slice(0, 8);
  const startedAt = new Date().toISOString();
  const env = await readEnvFile(".env.dev");
  const envResult = validateEnv(env);
  const commandResults = [];
  let discoveryResult = null;
  let yieldProofReport = null;
  let capturedError = null;

  log(`Run ${runId} started.`);

  if (envResult.status === "passed") {
    try {
      await ensureComposeStack(log, { rebuild: !args.skipStackBuild });
      discoveryResult = await withDiscoveryParentEnv(() =>
        runLiveDiscoveryExamplesReport({
          artifactPrefix: "newsportal-product-mega-flow-discovery",
          throwOnError: false,
          closePool: true,
        })
      );

      const commands = args.includeYieldProof
        ? [...PRODUCT_MEGA_FLOW_REQUIRED_COMMANDS, YIELD_PROOF_COMMAND]
        : PRODUCT_MEGA_FLOW_REQUIRED_COMMANDS;
      for (const item of commands) {
        const result = await runMegaCommand(item);
        commandResults.push(result);
        if (item.key === "discovery-yield-compose") {
          yieldProofReport = findParsedArtifact(commandResults, "discovery-yield-compose");
        }
        if (args.failFast && result.status !== "passed") {
          log(`Stopping after ${item.key} because --fail-fast is enabled.`);
          break;
        }
      }
    } catch (error) {
      capturedError = error instanceof Error ? error.message : String(error);
    }
  } else {
    log("Env preflight failed; product mega-flow commands will not run.");
  }

  const mcpArtifact = findParsedArtifact(
    commandResults,
    "mcp-compose",
    (artifact) => artifact?.kind === "deterministic-mcp-http-proof"
  );
  const verdicts = determineProductMegaFlowVerdict({
    scenarios: PRODUCT_MEGA_FLOW_SCENARIOS,
    discoveryReport: discoveryResult?.report ?? null,
    commandResults,
    mcpArtifact,
    yieldProofReport: args.includeYieldProof ? yieldProofReport : null,
  });
  const failures = [
    ...envResult.failures,
    ...(capturedError ? [capturedError] : []),
    ...verdicts.commandFailures.map((item) => `${item.key} failed with exit ${item.exitCode}.`),
    ...verdicts.scenarioSummaries
      .filter((item) => item.status !== "passed")
      .map((item) => `${item.example} ${item.productDomain} did not satisfy mega-flow acceptance.`),
  ];
  const strippedCommands = stripParsedArtifacts(commandResults);
  const yieldCommandArtifact =
    strippedCommands.find((item) => item.key === "discovery-yield-compose")?.artifacts?.[0] ?? null;
  const report = await writeArtifacts({
    kind: "newsportal-product-mega-flow-proof",
    runId,
    startedAt,
    finishedAt: new Date().toISOString(),
    env: envResult,
    runtimeVerdict: verdicts.runtimeVerdict,
    yieldVerdict: verdicts.yieldVerdict,
    finalVerdict: verdicts.finalVerdict,
    discoveryFinalVerdict: verdicts.discoveryFinalVerdict,
    yieldProofFinalVerdict: verdicts.yieldProofFinalVerdict,
    scenarios: verdicts.scenarioSummaries,
    commands: strippedCommands,
    discoveryArtifact: discoveryResult
      ? {
          jsonPath: discoveryResult.jsonPath,
          mdPath: discoveryResult.mdPath,
          finalVerdict: discoveryResult.report?.finalVerdict ?? null,
        }
      : null,
    yieldProofArtifact: yieldCommandArtifact,
    failures,
    error: capturedError,
    artifacts: null,
  });

  log(`JSON artifact: ${report.artifacts.jsonPath}`);
  log(`Markdown artifact: ${report.artifacts.mdPath}`);

  if (report.finalVerdict !== "pass") {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(`[product-mega-flow] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
