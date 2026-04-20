import http from "node:http";
import https from "node:https";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { tsImport } from "tsx/esm/api";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const composeArgs = [
  "compose",
  "--env-file",
  ".env.dev",
  "-f",
  "infra/docker/compose.yml",
  "-f",
  "infra/docker/compose.dev.yml",
];
const stackServices = [
  "postgres",
  "redis",
  "mailpit",
  "migrate",
  "relay",
  "fetchers",
  "worker",
  "api",
  "web",
  "admin",
  "nginx",
];
const staticGuardFiles = [
  "services/workers/app/discovery_orchestrator.py",
  "services/workers/app/task_engine/discovery_plugins.py",
  "services/workers/app/task_engine/discovery_runtime.py",
];

let runtimeDependenciesPromise;

function clearCachedAdminPool() {
  if ("__newsportalAdminPool" in globalThis) {
    globalThis.__newsportalAdminPool = undefined;
  }
}

function log(message) {
  console.log(`[discovery-nonregression] ${message}`);
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    env: options.env ? { ...process.env, ...options.env } : process.env,
  });
  if (result.status !== 0 && !options.allowFailure) {
    if (options.capture) {
      if (result.stdout) {
        process.stdout.write(result.stdout);
      }
      if (result.stderr) {
        process.stderr.write(result.stderr);
      }
    }
    throw new Error(
      `Command failed (${command} ${args.join(" ")}): exit code ${result.status ?? "unknown"}`
    );
  }
  return {
    status: result.status ?? 0,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function runCompose(...args) {
  return runCommand("docker", [...composeArgs, ...args], { capture: true });
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

function applyEnv(env) {
  for (const [key, value] of Object.entries(env)) {
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function forceDiscoveryComposeEnv() {
  process.env.DISCOVERY_ENABLED = "1";
}

async function loadRuntimeDependencies() {
  if (!runtimeDependenciesPromise) {
    runtimeDependenciesPromise = (async () => {
      const dbModule = await tsImport("../../apps/admin/src/lib/server/db.ts", import.meta.url);
      return {
        getPool: dbModule.getPool,
      };
    })();
  }
  return runtimeDependenciesPromise;
}

async function sendRequest(url, { timeoutMs = 10000 } = {}) {
  const target = new URL(url);
  const client = target.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = client.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (target.protocol === "https:" ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method: "GET",
        headers: {
          Connection: "close",
        },
      },
      (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          text += chunk;
        });
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 0,
            text,
          });
        });
      }
    );
    request.on("error", reject);
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Timed out waiting for ${url}.`));
    });
    request.end();
  });
}

async function waitFor(label, producer, predicate, { timeoutMs = 60000, intervalMs = 1500 } = {}) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const value = await producer();
      if (predicate(value)) {
        return value;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  const reason = lastError instanceof Error ? ` Last error: ${lastError.message}` : "";
  throw new Error(`Timed out waiting for ${label}.${reason}`);
}

async function waitForHttpHealth(label, url) {
  await waitFor(
    `${label} health`,
    async () => {
      const response = await sendRequest(url, { timeoutMs: 5000 });
      if (response.status !== 200) {
        throw new Error(`${label} responded with ${response.status}.`);
      }
      return true;
    },
    Boolean
  );
}

function parseEnvOutput(text) {
  return Object.fromEntries(
    String(text)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        if (separatorIndex < 0) {
          return [line, ""];
        }
        return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
      })
  );
}

function assertComposeDiscoveryEnv(serviceName) {
  const result = runCompose("exec", "-T", serviceName, "env");
  const env = parseEnvOutput(result.stdout);
  const failures = [];
  if (String(env.DISCOVERY_ENABLED ?? "").trim() !== "1") {
    failures.push(`${serviceName} DISCOVERY_ENABLED=${String(env.DISCOVERY_ENABLED ?? "").trim() || "unset"}`);
  }
  if (String(env.DISCOVERY_SEARCH_PROVIDER ?? "").trim().toLowerCase() !== "ddgs") {
    failures.push(
      `${serviceName} DISCOVERY_SEARCH_PROVIDER=${String(env.DISCOVERY_SEARCH_PROVIDER ?? "").trim() || "unset"}`
    );
  }
  if (String(env.DISCOVERY_BRAVE_API_KEY ?? "").trim() !== "") {
    failures.push(`${serviceName} DISCOVERY_BRAVE_API_KEY must be empty`);
  }
  if (String(env.DISCOVERY_SERPER_API_KEY ?? "").trim() !== "") {
    failures.push(`${serviceName} DISCOVERY_SERPER_API_KEY must be empty`);
  }
  if (failures.length > 0) {
    throw new Error(`Compose discovery env mismatch: ${failures.join("; ")}`);
  }
}

async function ensureComposeStack() {
  log("Ensuring compose stack is running before baseline snapshot.");
  runCommand("docker", [...composeArgs, "down", "--remove-orphans"]);
  runCommand("docker", [...composeArgs, "up", "--build", "-d", "--force-recreate", ...stackServices]);
  await Promise.all([
    waitForHttpHealth("api", "http://127.0.0.1:8000/health"),
    waitForHttpHealth("admin", "http://127.0.0.1:4322/api/health"),
    waitForHttpHealth("nginx", "http://127.0.0.1:8080/health"),
  ]);
  assertComposeDiscoveryEnv("worker");
  assertComposeDiscoveryEnv("api");
}

async function queryInt(pool, sql, params) {
  const result = await pool.query(sql, params);
  const value = result.rows[0] ? Object.values(result.rows[0])[0] : 0;
  return Number.parseInt(String(value ?? "0"), 10) || 0;
}

async function captureBaselineSnapshot(pool, startedAt) {
  const preExistingChannels = await pool.query(
    `
      select channel_id::text as channel_id
      from source_channels
      where created_at < $1::timestamptz
    `,
    [startedAt]
  );

  return {
    preExistingChannelCount: preExistingChannels.rowCount,
    preExistingChannelIds: preExistingChannels.rows.map((row) => row.channel_id),
    preExistingArticleCount: await queryInt(
      pool,
      `
        select count(*)::int
        from articles
        where created_at < $1::timestamptz
      `,
      [startedAt]
    ),
    oldCorpusCounts: {
      interestFilterResults: await queryInt(
        pool,
        `
          select count(*)::int
          from interest_filter_results ifr
          join articles a on a.doc_id = ifr.doc_id
          where a.created_at < $1::timestamptz
        `,
        [startedAt]
      ),
      finalSelectionResults: await queryInt(
        pool,
        `
          select count(*)::int
          from final_selection_results fsr
          join articles a on a.doc_id = fsr.doc_id
          where a.created_at < $1::timestamptz
        `,
        [startedAt]
      ),
      systemFeedResults: await queryInt(
        pool,
        `
          select count(*)::int
          from system_feed_results sfr
          join articles a on a.doc_id = sfr.doc_id
          where a.created_at < $1::timestamptz
        `,
        [startedAt]
      ),
      llmReviewLog: await queryInt(
        pool,
        `
          select count(*)::int
          from llm_review_log lrl
          join articles a on a.doc_id = lrl.doc_id
          where a.created_at < $1::timestamptz
        `,
        [startedAt]
      ),
      notificationLog: await queryInt(
        pool,
        `
          select count(*)::int
          from notification_log nl
          join articles a on a.doc_id = nl.doc_id
          where a.created_at < $1::timestamptz
        `,
        [startedAt]
      ),
    },
  };
}

function parseJsonArtifactPath(output) {
  const matches = [...String(output).matchAll(/Wrote JSON evidence to (.+\.json)/g)];
  const last = matches.at(-1);
  return last ? last[1].trim() : "";
}

function extractRegisteredChannelIds(parsed) {
  const channelIds = new Set();
  for (const caseRun of Array.isArray(parsed.caseRuns) ? parsed.caseRuns : []) {
    for (const lane of [caseRun.graphLane, caseRun.recallLane]) {
      for (const candidate of Array.isArray(lane?.candidates) ? lane.candidates : []) {
        if (candidate?.registeredChannelId) {
          channelIds.add(String(candidate.registeredChannelId).trim());
        }
      }
    }
    for (const row of Array.isArray(caseRun.downstreamEvidence) ? caseRun.downstreamEvidence : []) {
      if (row?.channelId) {
        channelIds.add(String(row.channelId).trim());
      }
    }
  }
  return [...channelIds].filter(Boolean);
}

async function runStaticDecouplingGuard() {
  const failures = [];
  for (const relativePath of staticGuardFiles) {
    const content = await readFile(path.join(repoRoot, relativePath), "utf8");
    const matches = [...content.matchAll(/final_selection_results|system_feed_results/g)];
    if (matches.length > 0) {
      failures.push(`${relativePath} references downstream selection truth tables directly`);
    }
  }
  return {
    status: failures.length === 0 ? "passed" : "failed",
    failures,
  };
}

async function captureDriftSnapshot(pool, startedAt, newChannelIds) {
  const params = [startedAt, newChannelIds];
  const driftCounts = {
    interestFilterResults: await queryInt(
      pool,
      `
        select count(*)::int
        from interest_filter_results ifr
        join articles a on a.doc_id = ifr.doc_id
        where a.created_at < $1::timestamptz
          and ifr.created_at >= $1::timestamptz
          and (cardinality($2::uuid[]) = 0 or a.channel_id <> all($2::uuid[]))
      `,
      params
    ),
    finalSelectionResults: await queryInt(
      pool,
      `
        select count(*)::int
        from final_selection_results fsr
        join articles a on a.doc_id = fsr.doc_id
        where a.created_at < $1::timestamptz
          and fsr.created_at >= $1::timestamptz
          and (cardinality($2::uuid[]) = 0 or a.channel_id <> all($2::uuid[]))
      `,
      params
    ),
    systemFeedResults: await queryInt(
      pool,
      `
        select count(*)::int
        from system_feed_results sfr
        join articles a on a.doc_id = sfr.doc_id
        where a.created_at < $1::timestamptz
          and greatest(sfr.created_at, sfr.updated_at) >= $1::timestamptz
          and (cardinality($2::uuid[]) = 0 or a.channel_id <> all($2::uuid[]))
      `,
      params
    ),
    llmReviewLog: await queryInt(
      pool,
      `
        select count(*)::int
        from llm_review_log lrl
        join articles a on a.doc_id = lrl.doc_id
        where a.created_at < $1::timestamptz
          and lrl.created_at >= $1::timestamptz
          and (cardinality($2::uuid[]) = 0 or a.channel_id <> all($2::uuid[]))
      `,
      params
    ),
    notificationLog: await queryInt(
      pool,
      `
        select count(*)::int
        from notification_log nl
        join articles a on a.doc_id = nl.doc_id
        where a.created_at < $1::timestamptz
          and nl.created_at >= $1::timestamptz
          and (cardinality($2::uuid[]) = 0 or a.channel_id <> all($2::uuid[]))
      `,
      params
    ),
  };
  const allowedNewChannelActivity = {
    sourceChannels: await queryInt(
      pool,
      `
        select count(*)::int
        from source_channels
        where created_at >= $1::timestamptz
          and (cardinality($2::uuid[]) > 0 and channel_id = any($2::uuid[]))
      `,
      params
    ),
    outboxSyncRequested: await queryInt(
      pool,
      `
        select count(*)::int
        from outbox_events
        where created_at >= $1::timestamptz
          and event_type = 'source.channel.sync.requested'
          and (cardinality($2::uuid[]) > 0 and aggregate_id = any($2::uuid[]))
      `,
      params
    ),
    articles: await queryInt(
      pool,
      `
        select count(*)::int
        from articles
        where created_at >= $1::timestamptz
          and (cardinality($2::uuid[]) > 0 and channel_id = any($2::uuid[]))
      `,
      params
    ),
    interestFilterResults: await queryInt(
      pool,
      `
        select count(*)::int
        from interest_filter_results ifr
        join articles a on a.doc_id = ifr.doc_id
        where ifr.created_at >= $1::timestamptz
          and (cardinality($2::uuid[]) > 0 and a.channel_id = any($2::uuid[]))
      `,
      params
    ),
    finalSelectionResults: await queryInt(
      pool,
      `
        select count(*)::int
        from final_selection_results fsr
        join articles a on a.doc_id = fsr.doc_id
        where fsr.created_at >= $1::timestamptz
          and (cardinality($2::uuid[]) > 0 and a.channel_id = any($2::uuid[]))
      `,
      params
    ),
    systemFeedResults: await queryInt(
      pool,
      `
        select count(*)::int
        from system_feed_results sfr
        join articles a on a.doc_id = sfr.doc_id
        where greatest(sfr.created_at, sfr.updated_at) >= $1::timestamptz
          and (cardinality($2::uuid[]) > 0 and a.channel_id = any($2::uuid[]))
      `,
      params
    ),
  };

  const failures = Object.entries(driftCounts)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `${key} drifted by ${count}`);

  return {
    status: failures.length === 0 ? "passed" : "failed",
    failures,
    driftCounts,
    allowedNewChannelActivity,
  };
}

function formatMarkdown(report) {
  const baselineSnapshot = report.baselineSnapshot ?? {
    preExistingChannelCount: 0,
    preExistingArticleCount: 0,
    oldCorpusCounts: {},
  };
  return [
    "# Discovery Pipeline Non-regression Proof",
    "",
    `Run id: \`${report.runId}\``,
    `Started at: \`${report.startedAt}\``,
    `Runtime verdict: \`${report.runtimeVerdict}\``,
    `Non-regression verdict: \`${report.nonRegressionVerdict}\``,
    `Yield verdict: \`${report.yieldVerdict}\``,
    `Final verdict: \`${report.finalVerdict}\``,
    "",
    "## Static guard",
    "",
    `- Status: \`${report.staticDecoupling.status}\``,
    ...report.staticDecoupling.failures.map((failure) => `- ${failure}`),
    "",
    "## Baseline snapshot",
    "",
    `- Pre-existing channels: ${baselineSnapshot.preExistingChannelCount}`,
    `- Pre-existing articles: ${baselineSnapshot.preExistingArticleCount}`,
    ...Object.entries(baselineSnapshot.oldCorpusCounts).map(
      ([key, count]) => `- ${key}: ${count}`
    ),
    "",
    "## Harness run",
    "",
    `- Artifact: \`${report.harness.jsonPath || "missing"}\``,
    `- Runtime verdict: \`${report.harness.runtimeVerdict}\``,
    `- Yield verdict: \`${report.harness.yieldVerdict}\``,
    `- Final verdict: \`${report.harness.finalVerdict}\``,
    `- New discovery channels: ${report.harness.newChannelIds.length}`,
    "",
    "## Drift snapshot",
    "",
    `- Status: \`${report.driftSnapshot.status}\``,
    ...Object.entries(report.driftSnapshot.driftCounts).map(
      ([key, count]) => `- ${key}: ${count}`
    ),
    "",
    "## Allowed new-channel activity",
    "",
    ...Object.entries(report.driftSnapshot.allowedNewChannelActivity).map(
      ([key, count]) => `- ${key}: ${count}`
    ),
  ].join("\n");
}

async function main() {
  const runId = randomUUID().slice(0, 8);
  const startedAt = new Date().toISOString();
  const jsonPath = `/tmp/newsportal-discovery-nonregression-${runId}.json`;
  const mdPath = `/tmp/newsportal-discovery-nonregression-${runId}.md`;
  const env = await readEnvFile(".env.dev");
  applyEnv(env);
  forceDiscoveryComposeEnv();

  const report = {
    runId,
    startedAt,
    staticDecoupling: { status: "failed", failures: [] },
    baselineSnapshot: null,
    harness: {
      jsonPath: "",
      runtimeVerdict: "fail",
      yieldVerdict: "fail",
      finalVerdict: "fail",
      newChannelIds: [],
    },
    driftSnapshot: {
      status: "failed",
      failures: [],
      driftCounts: {},
      allowedNewChannelActivity: {},
    },
    runtimeVerdict: "fail",
    nonRegressionVerdict: "fail",
    yieldVerdict: "fail",
    finalVerdict: "fail",
    error: null,
  };

  let pool = null;

  try {
    await ensureComposeStack();
    report.staticDecoupling = await runStaticDecouplingGuard();
    if (report.staticDecoupling.status !== "passed") {
      throw new Error(`Static decoupling guard failed: ${report.staticDecoupling.failures.join("; ")}`);
    }

    const { getPool } = await loadRuntimeDependencies();
    pool = getPool();
    report.baselineSnapshot = await captureBaselineSnapshot(pool, startedAt);
    await pool.end().catch(() => undefined);
    pool = null;
    clearCachedAdminPool();

    log("Running live discovery harness for non-regression proof.");
    const harness = runCommand("node", ["infra/scripts/test-live-discovery-examples.mjs"], {
      capture: true,
      env: { DISCOVERY_ENABLED: "1" },
      allowFailure: true,
    });
    const artifactPath = parseJsonArtifactPath(`${harness.stdout}\n${harness.stderr}`);
    if (!artifactPath) {
      throw new Error("Live discovery harness did not report a JSON artifact path.");
    }
    const parsedHarness = JSON.parse(await readFile(artifactPath, "utf8"));
    report.harness = {
      jsonPath: artifactPath,
      runtimeVerdict: parsedHarness.runtimeVerdict,
      yieldVerdict: parsedHarness.yieldVerdict,
      finalVerdict: parsedHarness.finalVerdict,
      newChannelIds: extractRegisteredChannelIds(parsedHarness),
    };
    report.runtimeVerdict = parsedHarness.runtimeVerdict;
    report.yieldVerdict = parsedHarness.yieldVerdict;
    if (parsedHarness.runtimeVerdict !== "pass") {
      throw new Error(`Live discovery harness runtime failed with ${parsedHarness.finalVerdict}.`);
    }

    pool = getPool();
    report.driftSnapshot = await captureDriftSnapshot(
      pool,
      startedAt,
      report.harness.newChannelIds
    );
    report.nonRegressionVerdict =
      report.staticDecoupling.status === "passed" && report.driftSnapshot.status === "passed"
        ? "pass"
        : "fail";
    report.finalVerdict =
      report.runtimeVerdict !== "pass" || report.nonRegressionVerdict !== "pass"
        ? "fail"
        : report.yieldVerdict === "pass"
          ? "pass"
          : "pass_with_residuals";
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    if (pool && typeof pool.end === "function") {
      await pool.end().catch(() => undefined);
    }
    clearCachedAdminPool();
    await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(mdPath, `${formatMarkdown(report)}\n`, "utf8");
    log(`Wrote JSON evidence to ${jsonPath}`);
    log(`Wrote Markdown evidence to ${mdPath}`);
  }

  if (report.finalVerdict === "fail") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
