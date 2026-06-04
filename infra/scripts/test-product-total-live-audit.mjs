import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

import {
  determineProductTotalLiveAuditVerdict,
  PRODUCT_TOTAL_LIVE_DIAGNOSTIC_COMMANDS,
  PRODUCT_TOTAL_LIVE_REQUIRED_COMMANDS,
  PRODUCT_TOTAL_LIVE_STATUSES,
} from "./lib/product-total-live-audit-proof.mjs";
import {
  createLogger,
  ensureComposeStack,
  readEnvFile,
  repoRoot,
} from "./lib/mcp-http-testkit.mjs";

const log = createLogger("product-total-live");

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

function parseArgs(argv) {
  const parsed = {
    failFast: false,
    preflightOnly: false,
    skipStackBuild: false,
    skipDiagnostics: false,
  };

  for (const argument of argv) {
    if (argument === "--fail-fast") {
      parsed.failFast = true;
      continue;
    }
    if (argument === "--preflight-only") {
      parsed.preflightOnly = true;
      continue;
    }
    if (argument === "--skip-stack-build") {
      parsed.skipStackBuild = true;
      continue;
    }
    if (argument === "--skip-diagnostics") {
      parsed.skipDiagnostics = true;
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
      failures.push(`${key} must be configured for product total-live testing.`);
    }
  }

  if (String(process.env.DISCOVERY_ENABLED ?? env.DISCOVERY_ENABLED ?? "").trim() !== "1") {
    failures.push("DISCOVERY_ENABLED=1 is required for product total-live discovery diagnostics.");
  }

  for (const key of DISCOVERY_REQUIRED_ENV) {
    if (!configuredValue(env, key)) {
      failures.push(`${key} must be configured for product total-live discovery diagnostics.`);
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

  for (const key of ["IMAP_HOST", "IMAP_USERNAME", "IMAP_PASSWORD", "API_LIVE_TEST_URL"]) {
    if (configuredValue(env, key)) {
      warnings.push(`${key} is configured but external API/IMAP live proof is not part of this required contour yet.`);
    }
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
    /"evidencePath"\s*:\s*"(\/tmp\/[^"]+?\.json)"/gu,
    /(\/tmp\/signalops-[^\s"']+?\.json)/gu,
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

async function runAuditCommand(item) {
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
      maxBuffer: 96 * 1024 * 1024,
    });
    const stdout = result.stdout ?? "";
    const stderr = result.stderr ?? "";
    if (stdout) {
      process.stdout.write(stdout);
    }
    if (stderr) {
      process.stderr.write(stderr);
    }
    const attemptArtifacts = [];
    for (const jsonPath of extractJsonArtifactPaths(`${stdout}\n${stderr}`)) {
      const parsed = await readJsonArtifact(jsonPath);
      parsedArtifacts.push({ jsonPath, parsed });
      attemptArtifacts.push({
        jsonPath,
        kind: parsed?.kind ?? null,
        status: parsed?.status ?? null,
        finalVerdict: parsed?.finalVerdict ?? null,
        runtimeVerdict: parsed?.runtimeVerdict ?? null,
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
      log(`${item.key} failed on attempt ${attempt}; retrying for bounded flaky proof tolerance.`);
    }
  }

  const finalAttempt = attempts.at(-1) ?? {
    status: "failed",
    exitCode: 1,
    signal: null,
    artifacts: [],
  };

  return {
    key: item.key,
    lane: item.lane,
    command: [item.executable, ...item.args].join(" "),
    proves: item.proves ?? [],
    diagnostic: Boolean(item.weakAllowed),
    status: finalAttempt.status,
    exitCode: finalAttempt.exitCode,
    signal: finalAttempt.signal,
    startedAt,
    finishedAt: new Date().toISOString(),
    attempts,
    artifacts: attempts.flatMap((attempt) => attempt.artifacts),
    parsedArtifacts,
  };
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
    `# SignalOps Product Total Live Audit ${report.runId}`,
    "",
    `- Final verdict: \`${report.finalVerdict}\``,
    `- Runtime verdict: \`${report.runtimeVerdict}\``,
    `- Started: \`${report.startedAt}\``,
    `- Finished: \`${report.finishedAt}\``,
    "",
    "## Acceptance Model",
    "",
    "- Strict A/B/C mega-flow is a hard required layer.",
    "- API and Email IMAP require deterministic provider fixture ingestion.",
    "- API and Email IMAP external live checks are explicitly not applicable until real external targets exist.",
    "- Live internet diagnostic lanes may produce `weak_with_classified_residual` without hiding the residual.",
    "",
    "## Provider Evidence",
    "",
    `- RSS: \`${report.providerEvidence.rss.status}\` (${report.providerEvidence.rss.reason ?? "ok"})`,
    `- Website: \`${report.providerEvidence.website.status}\` (${report.providerEvidence.website.reason ?? "ok"})`,
    `- API fixture: \`${report.providerEvidence.api.fixture.status}\` (${report.providerEvidence.api.fixture.reason ?? "ok"})`,
    `- API external live: \`${report.providerEvidence.api.externalLive.status}\` (${report.providerEvidence.api.externalLive.reason})`,
    `- Email IMAP fixture: \`${report.providerEvidence.emailImap.fixture.status}\` (${report.providerEvidence.emailImap.fixture.reason ?? "ok"})`,
    `- Email IMAP external live: \`${report.providerEvidence.emailImap.externalLive.status}\` (${report.providerEvidence.emailImap.externalLive.reason})`,
    "",
    "## Commands",
    "",
    "| Key | Lane | Diagnostic | Status | Exit |",
    "| --- | --- | --- | --- | --- |",
  ];

  for (const item of report.commands) {
    lines.push(
      `| ${item.key} | ${item.lane} | ${item.diagnostic ? "yes" : "no"} | \`${item.status}\` | ${item.exitCode} |`
    );
  }

  if (report.diagnosticWeak.length > 0) {
    lines.push("", "## Classified Weak Diagnostics", "");
    for (const item of report.diagnosticWeak) {
      lines.push(`- ${item.key}: ${item.reason}`);
    }
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

function preflightOnlyVerdicts() {
  const notApplicable = {
    status: PRODUCT_TOTAL_LIVE_STATUSES.notApplicable,
    acceptance: "preflight_only",
    reason: "preflight_only",
  };
  return {
    runtimeVerdict: "preflight_pass",
    finalVerdict: "preflight_pass",
    strictMegaFlow: {
      status: PRODUCT_TOTAL_LIVE_STATUSES.notApplicable,
      reason: "preflight_only",
      finalVerdict: null,
      runtimeVerdict: null,
      yieldVerdict: null,
    },
    providerEvidence: {
      rss: notApplicable,
      website: notApplicable,
      api: {
        fixture: notApplicable,
        externalLive: notApplicable,
      },
      emailImap: {
        fixture: notApplicable,
        externalLive: notApplicable,
      },
    },
    commandSummaries: {},
    diagnosticSummaries: {},
    diagnosticWeak: [],
    diagnosticFailures: [],
    requiredMissing: [],
    requiredFailures: [],
    failReasons: [],
  };
}

async function writeArtifacts(report) {
  const jsonPath = `/tmp/signalops-product-total-live-${report.runId}.json`;
  const mdPath = `/tmp/signalops-product-total-live-${report.runId}.md`;
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
  const env = await readEnvFile(".env.dev");
  const envResult = validateEnv(env);
  const commandResults = [];
  let capturedError = null;

  log(`Run ${runId} started.`);

  if (envResult.status === "passed" && !args.preflightOnly) {
    try {
      await ensureComposeStack(log, { rebuild: !args.skipStackBuild });
      const commands = [
        ...PRODUCT_TOTAL_LIVE_REQUIRED_COMMANDS,
        ...(args.skipDiagnostics ? [] : PRODUCT_TOTAL_LIVE_DIAGNOSTIC_COMMANDS),
      ];
      for (const item of commands) {
        const result = await runAuditCommand(item);
        commandResults.push(result);
        if (args.failFast && result.status !== "passed" && !item.weakAllowed) {
          log(`Stopping after ${item.key} because --fail-fast is enabled.`);
          break;
        }
      }
    } catch (error) {
      capturedError = error instanceof Error ? error.message : String(error);
    }
  } else if (args.preflightOnly) {
    log("Preflight-only mode; commands will not run.");
  } else {
    log("Env preflight failed; product total-live commands will not run.");
  }

  const verdicts = args.preflightOnly && envResult.status === "passed"
    ? preflightOnlyVerdicts()
    : determineProductTotalLiveAuditVerdict({
        env: envResult,
        commandResults,
        requiredCommands: args.preflightOnly ? [] : PRODUCT_TOTAL_LIVE_REQUIRED_COMMANDS,
        diagnosticCommands: args.skipDiagnostics ? [] : PRODUCT_TOTAL_LIVE_DIAGNOSTIC_COMMANDS,
      });
  const failures = [
    ...envResult.failures,
    ...(capturedError ? [capturedError] : []),
    ...verdicts.failReasons,
  ];
  const report = await writeArtifacts({
    kind: "signalops-product-total-live-audit",
    runId,
    startedAt,
    finishedAt: new Date().toISOString(),
    mode: args.preflightOnly ? "preflight" : args.skipDiagnostics ? "required-only" : "full",
    env: envResult,
    runtimeVerdict: verdicts.runtimeVerdict,
    finalVerdict: verdicts.finalVerdict,
    strictMegaFlow: verdicts.strictMegaFlow,
    providerEvidence: verdicts.providerEvidence,
    commandSummaries: verdicts.commandSummaries,
    diagnosticSummaries: verdicts.diagnosticSummaries,
    diagnosticWeak: verdicts.diagnosticWeak,
    diagnosticFailures: verdicts.diagnosticFailures,
    requiredMissing: verdicts.requiredMissing,
    requiredFailures: verdicts.requiredFailures,
    failures,
    error: capturedError,
    commands: stripParsedArtifacts(commandResults),
    skippedDiagnostics: args.skipDiagnostics,
    artifacts: null,
  });

  log(`JSON artifact: ${report.artifacts.jsonPath}`);
  log(`Markdown artifact: ${report.artifacts.mdPath}`);

  if (report.finalVerdict === "fail") {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(`[product-total-live] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
