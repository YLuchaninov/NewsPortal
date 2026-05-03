import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import { tsImport } from "tsx/esm/api";

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
  waitFor,
} from "./lib/mcp-http-testkit.mjs";
import { runLiveDiscoveryExamplesReport } from "./test-live-discovery-examples.mjs";

const log = createLogger("product-mega-flow");
const CRITERION_COMPILE_REQUESTED_EVENT = "criterion.compile.requested";
const REINDEX_REQUESTED_EVENT = "reindex.requested";

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
let runtimeDependenciesPromise;

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

async function loadRuntimeDependencies() {
  if (!runtimeDependenciesPromise) {
    runtimeDependenciesPromise = (async () => {
      const [
        adminTemplatesModule,
        dbModule,
        outboxModule,
      ] = await Promise.all([
        tsImport("../../apps/admin/src/lib/server/admin-templates.ts", import.meta.url),
        tsImport("../../apps/admin/src/lib/server/db.ts", import.meta.url),
        tsImport("../../apps/admin/src/lib/server/outbox.ts", import.meta.url),
      ]);
      return {
        getPool: dbModule.getPool,
        saveInterestTemplate: adminTemplatesModule.saveInterestTemplate,
        syncInterestTemplateCriterion: adminTemplatesModule.syncInterestTemplateCriterion,
        syncInterestTemplateSelectionProfile: adminTemplatesModule.syncInterestTemplateSelectionProfile,
        insertOutboxEvent: outboxModule.insertOutboxEvent,
      };
    })();
  }
  return runtimeDependenciesPromise;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function collectLiveArticles(caseRun) {
  return [
    ...asArray(caseRun?.baselineEvidence),
    ...asArray(caseRun?.discoveryEvidence),
  ]
    .flatMap((row) =>
      asArray(row?.articles).map((article) => ({
        docId: normalizeText(article?.docId),
        title: normalizeText(article?.title),
        url: normalizeText(article?.url),
        channelId: normalizeText(row?.channelId),
        channelName: normalizeText(row?.channelName),
      }))
    )
    .filter((article) => article.docId && article.title);
}

function collectEvidenceChannelNames(caseRun) {
  return [
    ...asArray(caseRun?.baselineEvidence),
    ...asArray(caseRun?.discoveryEvidence),
  ]
    .map((row) => normalizeText(row?.channelName))
    .filter(Boolean);
}

async function readLatestLiveArticleForScenario(pool, caseRun) {
  const channelNames = [...new Set(collectEvidenceChannelNames(caseRun))];
  if (channelNames.length === 0) {
    return null;
  }
  const result = await pool.query(
    `
      select
        a.doc_id::text as doc_id,
        a.title,
        a.url,
        sc.channel_id::text as channel_id,
        sc.name as channel_name,
        a.created_at
      from articles a
      join source_channels sc on sc.channel_id = a.channel_id
      where sc.name = any($1::text[])
      order by a.created_at desc
      limit 1
    `,
    [channelNames]
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return {
    docId: normalizeText(row.doc_id),
    title: normalizeText(row.title),
    url: normalizeText(row.url),
    channelId: normalizeText(row.channel_id),
    channelName: normalizeText(row.channel_name),
    evidenceWindow: "latest_existing_live_article_after_successful_fetch",
  };
}

function tokenizeTitle(title) {
  const stopWords = new Set([
    "about",
    "after",
    "from",
    "into",
    "that",
    "their",
    "this",
    "with",
    "your",
  ]);
  return normalizeText(title)
    .toLowerCase()
    .split(/[^a-z0-9+#.-]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !stopWords.has(token))
    .slice(0, 10);
}

function buildLiveSelectionTemplateInput({ scenario, article }) {
  const titleTokens = tokenizeTitle(article.title);
  const cueTerms = titleTokens.length > 0 ? titleTokens : ["engineering", "software", "developer"];
  return {
    interestTemplateId: undefined,
    name: `Mega Flow Live Selection Proof — Example ${scenario.example}`,
    description:
      `Live proof interest for ${scenario.productDomain}; compiled from a real discovery article title.`,
    positiveTexts: [
      article.title,
      `${article.title} ${scenario.productDomain}`,
      `${scenario.productDomain} live discovery selected article`,
    ],
    negativeTexts: [
      "celebrity gossip unrelated to software delivery",
      "consumer shopping discounts and sports scores",
      "recipe roundup and lifestyle travel tips",
    ],
    mustHaveTerms: [],
    mustNotHaveTerms: [],
    places: [],
    languagesAllowed: ["en"],
    timeWindowHours: null,
    allowedContentKinds: ["editorial", "document", "listing"],
    shortTokensRequired: [],
    shortTokensForbidden: [],
    candidatePositiveSignals: [
      {
        name: "live_title_signal",
        cues: cueTerms,
      },
    ],
    candidateNegativeSignals: [
      {
        name: "consumer_noise",
        cues: ["sports", "recipe", "celebrity", "shopping"],
      },
    ],
    selectionProfileStrictness: "broad",
    selectionProfileUnresolvedDecision: "hold",
    selectionProfileLlmReviewMode: "disabled",
    priority: 1,
    isActive: true,
  };
}

async function upsertLiveSelectionTemplate(pool, runtimeDependencies, { scenario, article }) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const existing = await client.query(
      `
        select interest_template_id::text as interest_template_id
        from interest_templates
        where name = $1
        order by updated_at desc
        limit 1
      `,
      [`Mega Flow Live Selection Proof — Example ${scenario.example}`]
    );
    const input = {
      ...buildLiveSelectionTemplateInput({ scenario, article }),
      interestTemplateId: existing.rows[0]?.interest_template_id,
    };
    const templateResult = await runtimeDependencies.saveInterestTemplate(client, input);
    const criterionSync = await runtimeDependencies.syncInterestTemplateCriterion(
      client,
      templateResult.interestTemplateId
    );
    await runtimeDependencies.syncInterestTemplateSelectionProfile(
      client,
      templateResult.interestTemplateId,
      input
    );
    if (criterionSync.compileRequested) {
      await runtimeDependencies.insertOutboxEvent(client, {
        eventType: CRITERION_COMPILE_REQUESTED_EVENT,
        aggregateType: "criterion",
        aggregateId: criterionSync.criterionId,
        payload: {
          criterionId: criterionSync.criterionId,
          version: criterionSync.version,
        },
      });
    }
    await client.query("commit");
    return {
      interestTemplateId: templateResult.interestTemplateId,
      criterionId: criterionSync.criterionId,
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function waitForCriterionCompiled(pool, criterionId) {
  return waitFor(
    `criterion ${criterionId} compile`,
    async () => {
      const result = await pool.query(
        `
          select c.compile_status, cc.compile_status as compiled_status, cc.error_text
          from criteria c
          left join criteria_compiled cc on cc.criterion_id = c.criterion_id
          where c.criterion_id = $1
        `,
        [criterionId]
      );
      const row = result.rows[0] ?? null;
      if (row?.compile_status === "failed" || row?.compiled_status === "failed") {
        throw new Error(`criterion compile failed: ${row.error_text ?? "unknown error"}`);
      }
      return row;
    },
    (row) => row?.compile_status === "compiled" && row?.compiled_status === "compiled",
    {
      timeoutMs: 120000,
      intervalMs: 2000,
      describeLastValue: (row) =>
        row ? `compile_status=${row.compile_status} compiled_status=${row.compiled_status}` : "missing",
    }
  );
}

async function queueBackfillForArticle(pool, runtimeDependencies, docId) {
  const client = await pool.connect();
  const reindexJobId = randomUUID();
  const options = {
    batchSize: 1,
    retroNotifications: "skip",
    docIds: [docId],
    includeEnrichment: false,
    forceEnrichment: false,
  };
  try {
    await client.query("begin");
    await client.query(
      `
        insert into reindex_jobs (
          reindex_job_id,
          index_name,
          job_kind,
          options_json,
          requested_by_user_id,
          status
        )
        values ($1, 'interest_centroids', 'backfill', $2::jsonb, null, 'queued')
      `,
      [reindexJobId, JSON.stringify(options)]
    );
    await runtimeDependencies.insertOutboxEvent(client, {
      eventType: REINDEX_REQUESTED_EVENT,
      aggregateType: "reindex_job",
      aggregateId: reindexJobId,
      payload: {
        reindexJobId,
        indexName: "interest_centroids",
        jobKind: "backfill",
        version: 1,
      },
    });
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  return reindexJobId;
}

async function waitForReindexCompleted(pool, reindexJobId) {
  return waitFor(
    `reindex job ${reindexJobId}`,
    async () => {
      const result = await pool.query(
        `
          select status, error_text, options_json
          from reindex_jobs
          where reindex_job_id = $1
        `,
        [reindexJobId]
      );
      const row = result.rows[0] ?? null;
      if (row?.status === "failed") {
        throw new Error(`reindex job failed: ${row.error_text ?? "unknown error"}`);
      }
      return row;
    },
    (row) => row?.status === "completed",
    {
      timeoutMs: 180000,
      intervalMs: 2000,
      isFatalError: (error) => /failed/iu.test(String(error?.message ?? "")),
      describeLastValue: (row) =>
        row ? `status=${row.status} error=${row.error_text ?? ""}` : "missing",
    }
  );
}

async function readSelectedArticle(pool, docId) {
  const result = await pool.query(
    `
      select
        a.doc_id::text as doc_id,
        a.title,
        a.url,
        sc.channel_id::text as channel_id,
        sc.name as channel_name,
        fsr.final_decision,
        fsr.is_selected,
        fsr.matched_filter_count,
        fsr.no_match_filter_count,
        fsr.gray_zone_filter_count,
        fsr.updated_at
      from articles a
      join source_channels sc on sc.channel_id = a.channel_id
      left join final_selection_results fsr on fsr.doc_id = a.doc_id
      where a.doc_id = $1
    `,
    [docId]
  );
  return result.rows[0] ?? null;
}

async function runLiveSelectionReplayProof(discoveryReport) {
  const runtimeDependencies = await loadRuntimeDependencies();
  const pool = runtimeDependencies.getPool();
  const byScenario = {};
  const errors = [];
  for (const scenario of PRODUCT_MEGA_FLOW_SCENARIOS) {
    const caseRun = asArray(discoveryReport?.caseRuns).find(
      (item) => item?.key === scenario.discoveryCaseKey || item?.key === scenario.key
    );
    const article = collectLiveArticles(caseRun)[0]
      ?? await readLatestLiveArticleForScenario(pool, caseRun);
    if (!article) {
      byScenario[scenario.key] = {
        status: "failed",
        reason: "no_live_article_available_for_selection_replay",
        selectedArticles: [],
      };
      continue;
    }
    try {
      log(`Creating live selection proof interest for Example ${scenario.example}: ${article.title}`);
      const template = await upsertLiveSelectionTemplate(pool, runtimeDependencies, {
        scenario,
        article,
      });
      await waitForCriterionCompiled(pool, template.criterionId);
      const reindexJobId = await queueBackfillForArticle(pool, runtimeDependencies, article.docId);
      await waitForReindexCompleted(pool, reindexJobId);
      const selected = await waitFor(
        `live selected article for Example ${scenario.example}`,
        () => readSelectedArticle(pool, article.docId),
        (row) => row?.is_selected === true,
        {
          timeoutMs: 120000,
          intervalMs: 2000,
          describeLastValue: (row) =>
            row
              ? `decision=${row.final_decision} selected=${row.is_selected} matched=${row.matched_filter_count}`
              : "missing",
        }
      );
      byScenario[scenario.key] = {
        status: "passed",
        interestTemplateId: template.interestTemplateId,
        criterionId: template.criterionId,
        reindexJobId,
        selectedArticles: [
          {
            docId: selected.doc_id,
            title: selected.title,
            url: selected.url,
            channelId: selected.channel_id,
            channelName: selected.channel_name,
            evidenceWindow: article.evidenceWindow ?? "current_discovery_window",
            finalDecision: selected.final_decision,
            matchedFilterCount: selected.matched_filter_count,
            selectedAt: selected.updated_at,
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Example ${scenario.example} live selection replay failed: ${message}`);
      byScenario[scenario.key] = {
        status: "failed",
        reason: message,
        article,
        selectedArticles: [],
      };
    }
  }

  return {
    status:
      errors.length === 0
      && PRODUCT_MEGA_FLOW_SCENARIOS.every(
        (scenario) => byScenario[scenario.key]?.status === "passed"
      )
        ? "passed"
        : "failed",
    errors,
    byScenario,
  };
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
    "- At least one live-discovery article must reach final selection for each A/B/C scenario.",
    "- The 9-domain discovery matrix remains a separate residual diagnostic and is not required here.",
    "- Deterministic fixtures cover provider, negative/filter, sequence and Web/Admin/MCP surface buckets, but cannot satisfy live-selected-article acceptance.",
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
  lines.push("| Example | Domain | Status | Discovery | Live selected | Downstream | Residual |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const scenario of report.scenarios) {
    lines.push(
      `| ${scenario.example} | ${scenario.productDomain} | \`${scenario.status}\` | ` +
        `\`${scenario.liveDiscovery.finalVerdict}\` | ${scenario.liveDiscovery.selectedFinalRows} ` +
        `(${scenario.liveDiscovery.discoverySelectedFinalRows} discovery, ` +
        `${scenario.liveDiscovery.replaySelectedFinalRows} replay) | ` +
        `${scenario.liveDiscovery.downstreamEvidenceRows} | ` +
        `${scenario.liveSelectedArticleEvidence?.residualReason ?? ""} |`
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
  let liveSelectionReplay = null;
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
          closePool: false,
        })
      );
      liveSelectionReplay = await runLiveSelectionReplayProof(discoveryResult?.report ?? null);

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
    liveSelectionProof: liveSelectionReplay?.byScenario ?? null,
  });
  const failures = [
    ...envResult.failures,
    ...(capturedError ? [capturedError] : []),
    ...asArray(liveSelectionReplay?.errors),
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
    liveSelectionReplay,
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
