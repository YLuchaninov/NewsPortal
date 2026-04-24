import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");

const CORE_COMMANDS = [
  command("lint", "deterministic", ["lint"]),
  command("typecheck", "deterministic", ["typecheck"]),
  command("unit_tests", "deterministic", ["unit_tests"]),
  command("integration_tests", "stateful-core", ["integration_tests"]),
  command("local-stack-start", "stateful-core", ["dev:mvp:internal"]),
  command("website-compose", "stateful-core", ["test:website:compose"]),
  command("website-admin-compose", "stateful-core", ["test:website:admin:compose"]),
  command("automation-admin-compose", "stateful-core", ["test:automation:admin:compose"]),
  command("mcp-compose", "stateful-core", ["test:mcp:compose"]),
  command("web-viewports", "browser-ui", ["test:web:viewports"]),
  command("web-ui-audit", "browser-ui", ["test:web:ui-audit"]),
];

const FULL_ONLY_COMMANDS = [
  command("discovery-enabled-compose", "live-enabled", ["test:discovery-enabled:compose"]),
  command("discovery-admin-compose", "live-enabled", ["test:discovery:admin:compose"]),
  command("discovery-examples-compose", "live-provider", ["test:discovery:examples:compose"]),
  command("discovery-yield-compose", "live-provider", ["test:discovery:yield:compose"]),
  command("website-matrix-compose", "live-provider", ["test:website:matrix:compose"]),
  command("mcp-http-live", "live-provider", ["test:mcp:http:live"]),
];

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

const PARKED_ENV = ["IMAP_HOST", "IMAP_USERNAME", "IMAP_PASSWORD", "TELEGRAM_BOT_TOKEN"];

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
    mode: "core",
    preflightOnly: false,
    failFast: false,
  };

  for (const argument of argv) {
    if (argument.startsWith("--mode=")) {
      parsed.mode = argument.slice("--mode=".length);
      continue;
    }
    if (argument === "--preflight-only") {
      parsed.preflightOnly = true;
      continue;
    }
    if (argument === "--fail-fast") {
      parsed.failFast = true;
    }
  }

  if (!["core", "full", "cleanup"].includes(parsed.mode)) {
    throw new Error(`Unsupported mode ${parsed.mode}. Use core, full or cleanup.`);
  }

  return parsed;
}

function log(message) {
  console.log(`[product-local] ${message}`);
}

async function readEnvFile(relativePath) {
  const content = await readFile(path.join(repoRoot, relativePath), "utf8");
  return Object.fromEntries(
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        if (separatorIndex < 0) {
          return [line, ""];
        }
        return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
      })
  );
}

function hasConfiguredValue(env, key) {
  const value = String(process.env[key] ?? env[key] ?? "").trim();
  return Boolean(value && value !== "replace-me" && value !== "{}");
}

function maskedPresence(env, key) {
  return {
    key,
    configured: hasConfiguredValue(env, key),
  };
}

function validateEnv(env, mode) {
  const failures = [];
  const warnings = [];

  if (mode !== "cleanup") {
    for (const key of CORE_REQUIRED_ENV) {
      if (!hasConfiguredValue(env, key)) {
        failures.push(`${key} must be configured for local product ${mode} testing.`);
      }
    }
  }

  const emailDigestSmtpUrl = String(process.env.EMAIL_DIGEST_SMTP_URL ?? env.EMAIL_DIGEST_SMTP_URL ?? "");
  if (emailDigestSmtpUrl && !emailDigestSmtpUrl.includes("mailpit:1025")) {
    warnings.push("EMAIL_DIGEST_SMTP_URL is not the local Mailpit sink; local digest evidence may be non-repeatable.");
  }

  if (mode === "full") {
    if (String(process.env.DISCOVERY_ENABLED ?? env.DISCOVERY_ENABLED ?? "").trim() !== "1") {
      failures.push("DISCOVERY_ENABLED=1 is required for full local product testing.");
    }
    for (const key of ["DISCOVERY_SEARCH_PROVIDER", "DISCOVERY_MONTHLY_BUDGET_CENTS"]) {
      if (!hasConfiguredValue(env, key)) {
        failures.push(`${key} must be configured for full discovery testing.`);
      }
    }
    if (!hasConfiguredValue(env, "DISCOVERY_GEMINI_MODEL") && !hasConfiguredValue(env, "GEMINI_MODEL")) {
      failures.push("DISCOVERY_GEMINI_MODEL or GEMINI_MODEL must be configured for full discovery testing.");
    }
    if (!hasConfiguredValue(env, "DISCOVERY_GEMINI_BASE_URL") && !hasConfiguredValue(env, "GEMINI_BASE_URL")) {
      failures.push("DISCOVERY_GEMINI_BASE_URL or GEMINI_BASE_URL must be configured for full discovery testing.");
    }

    const provider = String(process.env.DISCOVERY_SEARCH_PROVIDER ?? env.DISCOVERY_SEARCH_PROVIDER ?? "").trim();
    if (provider === "brave" && !hasConfiguredValue(env, "DISCOVERY_BRAVE_API_KEY")) {
      failures.push("DISCOVERY_BRAVE_API_KEY is required when DISCOVERY_SEARCH_PROVIDER=brave.");
    }
    if (provider === "serper" && !hasConfiguredValue(env, "DISCOVERY_SERPER_API_KEY")) {
      failures.push("DISCOVERY_SERPER_API_KEY is required when DISCOVERY_SEARCH_PROVIDER=serper.");
    }
  }

  for (const key of PARKED_ENV) {
    if (hasConfiguredValue(env, key)) {
      warnings.push(`${key} is configured but not required; parked ingestion/delivery lanes are outside this product contour.`);
    }
  }

  return {
    status: failures.length === 0 ? "passed" : "failed",
    failures,
    warnings,
    required: CORE_REQUIRED_ENV.map((key) => maskedPresence(env, key)),
    parked: PARKED_ENV.map((key) => maskedPresence(env, key)),
  };
}

function runProductCommand(item) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(item.executable, item.args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "inherit",
  });
  const finishedAt = new Date().toISOString();
  return {
    key: item.key,
    lane: item.lane,
    command: [item.executable, ...item.args].join(" "),
    status: result.status === 0 ? "passed" : "failed",
    exitCode: result.status ?? 1,
    signal: result.signal ?? null,
    startedAt,
    finishedAt,
  };
}

function buildCommandList(mode) {
  if (mode === "cleanup") {
    return [];
  }
  if (mode === "full") {
    return [...CORE_COMMANDS, ...FULL_ONLY_COMMANDS];
  }
  return CORE_COMMANDS;
}

function buildCleanupChecklist() {
  return [
    "Review /tmp/newsportal-*.json and /tmp/newsportal-*.md artifacts for the current run.",
    "Confirm temporary Firebase admin identities from harnesses were deleted or recorded as residue.",
    "Confirm disposable MCP tokens were revoked by the MCP harness cleanup.",
    "Confirm temporary source channels, discovery profiles/candidates and notification rows are either acceptable local residue or reset with pnpm dev:mvp:internal:down:volumes.",
    "Use pnpm dev:mvp:internal:down for normal shutdown or pnpm dev:mvp:internal:down:volumes only for intentional local state reset.",
  ];
}

function buildIncludedLanes(mode) {
  const coreLanes = [
    "rss-ingestion",
    "website-ingestion",
    "website-resources",
    "web-user-flow",
    "admin-operator-flow",
    "email-digest-mailpit-delivery",
    "mcp-deterministic",
    "browser-ui",
  ];
  if (mode !== "full") {
    return coreLanes;
  }
  return [
    ...coreLanes,
    "discovery",
    "live-website-matrix",
    "mcp-live-http",
  ];
}

function formatMarkdown(report) {
  const lines = [
    `# NewsPortal Local Product Test ${report.runId}`,
    "",
    `- Mode: \`${report.mode}\``,
    `- Status: \`${report.status}\``,
    `- Started: \`${report.startedAt}\``,
    `- Finished: \`${report.finishedAt}\``,
    "",
    "## Scope",
    "",
    `- Included: ${report.includedLanes.join(", ")}.`,
    `- Parked: ${report.parkedLanes.join(", ")}.`,
    "",
    "## Env Preflight",
    "",
    `- Status: \`${report.env.status}\``,
  ];

  for (const warning of report.env.warnings) {
    lines.push(`- Warning: ${warning}`);
  }
  for (const failure of report.env.failures) {
    lines.push(`- Failure: ${failure}`);
  }

  if (report.commands.length > 0) {
    lines.push("", "## Commands", "");
    lines.push("| Key | Lane | Status | Exit | Command |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const item of report.commands) {
      lines.push(
        `| ${item.key} | ${item.lane} | \`${item.status}\` | ${item.exitCode} | \`${item.command}\` |`
      );
    }
  }

  if (report.cleanupChecklist.length > 0) {
    lines.push("", "## Cleanup Checklist", "");
    for (const item of report.cleanupChecklist) {
      lines.push(`- ${item}`);
    }
  }

  lines.push("", "## Artifacts", "");
  lines.push(`- JSON: ${report.artifacts.jsonPath}`);
  lines.push(`- Markdown: ${report.artifacts.mdPath}`);

  return lines.join("\n");
}

async function writeArtifacts(report) {
  const jsonPath = `/tmp/newsportal-product-local-${report.mode}-${report.runId}.json`;
  const mdPath = `/tmp/newsportal-product-local-${report.mode}-${report.runId}.md`;
  const reportWithArtifactPaths = {
    ...report,
    artifacts: {
      jsonPath,
      mdPath,
    },
  };

  await writeFile(jsonPath, `${JSON.stringify(reportWithArtifactPaths, null, 2)}\n`, "utf8");
  await writeFile(mdPath, `${formatMarkdown(reportWithArtifactPaths)}\n`, "utf8");

  return reportWithArtifactPaths;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = await readEnvFile(".env.dev");
  const startedAt = new Date().toISOString();
  const runId = randomUUID().slice(0, 8);
  const envResult = validateEnv(env, args.mode);
  const commands = [];
  const commandList = buildCommandList(args.mode);

  log(`Run ${runId} started in ${args.mode} mode.`);
  if (envResult.status === "failed") {
    log("Env preflight failed; commands will not run.");
  } else if (args.preflightOnly) {
    log("Preflight-only mode; commands will not run.");
  } else {
    for (const item of commandList) {
      log(`Running ${item.key}: ${item.executable} ${item.args.join(" ")}`);
      const result = runProductCommand(item);
      commands.push(result);
      if (args.failFast && result.status !== "passed") {
        log(`Stopping after ${item.key} because --fail-fast is enabled.`);
        break;
      }
    }
  }

  const hasFailedCommand = commands.some((item) => item.status !== "passed");
  const skippedCommands =
    envResult.status === "failed" || args.preflightOnly
      ? commandList.map((item) => ({
          key: item.key,
          lane: item.lane,
          command: [item.executable, ...item.args].join(" "),
          reason: envResult.status === "failed" ? "env-preflight-failed" : "preflight-only",
        }))
      : [];
  const status =
    envResult.status === "failed" || hasFailedCommand
      ? "failed"
      : args.preflightOnly
        ? "preflight-passed"
        : "passed";
  const report = await writeArtifacts({
    kind: "newsportal-local-product-test",
    runId,
    mode: args.mode,
    status,
    startedAt,
    finishedAt: new Date().toISOString(),
    env: envResult,
    commands,
    skippedCommands,
    cleanupChecklist: args.mode === "cleanup" ? buildCleanupChecklist() : [],
    parkedLanes: ["telegram-ingestion", "email-imap-ingestion", "api-source-ingestion"],
    includedLanes: buildIncludedLanes(args.mode),
    artifacts: null,
  });

  log(`JSON artifact: ${report.artifacts.jsonPath}`);
  log(`Markdown artifact: ${report.artifacts.mdPath}`);

  if (status === "failed") {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(`[product-local] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
