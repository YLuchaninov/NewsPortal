import http from "node:http";
import https from "node:https";
import { randomUUID } from "node:crypto";
import { writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { tsImport } from "tsx/esm/api";

import {
  DISCOVERY_RUNTIME_CASE_PACKS,
  DISCOVERY_VALIDATION_CASE_PACKS,
  DISCOVERY_LIVE_DEFAULTS,
} from "./lib/discovery-live-example-cases.mjs";
import {
  buildDiscoveryProfilePayload,
  buildManualReplaySettings,
  buildProfileBackedGraphMissionPayload,
  buildProfileBackedRecallMissionPayload,
} from "./lib/discovery-live-proof-profiles.mjs";
import { seedLiveDiscoveryExampleFixtures } from "./seed-live-discovery-example-fixtures.mjs";
import {
  classifyGraphCandidate,
  classifyRecallCandidate,
  determineCaseVerdicts,
  determineRunVerdicts,
  evaluateCalibration,
  summarizeAggregateRootCauses,
} from "./lib/discovery-live-yield-policy.mjs";
import { formatDiscoveryEvidenceMarkdown } from "./lib/discovery-live-report-format.mjs";

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
const STACK_SERVICES = [
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
const API_BASE_URL = "http://127.0.0.1:8000";
const ADMIN_BASE_URL = "http://127.0.0.1:4322";
const DISCOVERY_ORCHESTRATOR_SEQUENCE_ID = "0a8e8ec5-6cab-4d8b-9c28-0a1d6245bf17";
const CONTENT_ANALYSIS_PROCESSED_ARTICLE_STATES = new Set([
  "deduped",
  "embedded",
  "clustered",
  "matched",
  "notified",
]);
let runtimeDependenciesPromise;

function log(message) {
  console.log(`[live-discovery-examples] ${message}`);
}

function preflightStatusSucceeded(status) {
  return status === "passed" || status === "skipped";
}

function shouldSkipStackReset() {
  return String(process.env.DISCOVERY_EXAMPLES_SKIP_STACK_RESET ?? "").trim() === "1";
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
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
    const error = new Error(
      `Command failed (${command} ${args.join(" ")}): exit code ${result.status ?? "unknown"}`
    );
    error.stdout = result.stdout ?? "";
    error.stderr = result.stderr ?? "";
    throw error;
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

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeOptionalText(value) {
  const normalized = normalizeText(value);
  return normalized || null;
}

function asInt(value, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

async function sendRequest(url, { method = "GET", headers = {}, body = "", timeoutMs = 10000 } = {}) {
  const target = new URL(url);
  const client = target.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const request = client.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (target.protocol === "https:" ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method,
        headers: {
          Connection: "close",
          ...headers,
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
            statusText: response.statusMessage ?? "",
            headers: response.headers,
            text,
          });
        });
      }
    );

    request.on("error", reject);
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Timed out waiting for ${url}.`));
    });
    if (body) {
      request.write(body);
    }
    request.end();
  });
}

function parseJsonResponse(text, responseMeta) {
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch (error) {
      if (responseMeta.status >= 200 && responseMeta.status < 300) {
        throw error;
      }
    }
  }
  if (responseMeta.status < 200 || responseMeta.status >= 300) {
    const detailMessage = Array.isArray(json?.detail)
      ? json.detail
          .map((item) => {
            if (typeof item === "string") {
              return item;
            }
            if (item && typeof item === "object") {
              const location = Array.isArray(item.loc) ? item.loc.join(".") : "detail";
              const message = typeof item.msg === "string" ? item.msg : JSON.stringify(item);
              return `${location}: ${message}`;
            }
            return String(item);
          })
          .join("; ")
      : null;
    const message =
      typeof json?.error === "string"
        ? json.error
        : typeof json?.detail === "string"
          ? json.detail
          : detailMessage
            ? detailMessage
            : text && text.trim()
              ? `${text.trim()} (HTTP ${responseMeta.status} ${responseMeta.statusText})`
              : `HTTP ${responseMeta.status} ${responseMeta.statusText}`;
    throw new Error(message);
  }
  return json;
}

async function fetchJson(url, { timeoutMs = 10000 } = {}) {
  const response = await sendRequest(url, { timeoutMs });
  return parseJsonResponse(response.text, response);
}

async function postJson(url, payload, { timeoutMs = 60000 } = {}) {
  const target = new URL(url);
  const body = JSON.stringify(payload);
  const response = await sendRequest(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Origin: target.origin,
      Referer: `${target.origin}/`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body).toString(),
    },
    body,
    timeoutMs,
  });
  return parseJsonResponse(response.text, response);
}

async function patchJson(url, payload, { timeoutMs = 30000 } = {}) {
  const target = new URL(url);
  const body = JSON.stringify(payload);
  const response = await sendRequest(url, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      Origin: target.origin,
      Referer: `${target.origin}/`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body).toString(),
    },
    body,
    timeoutMs,
  });
  return parseJsonResponse(response.text, response);
}

async function waitFor(label, producer, predicate, { timeoutMs, intervalMs, describeLastValue = null }) {
  const startedAt = Date.now();
  let lastError = null;
  let lastValue = null;
  let hasLastValue = false;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const value = await producer();
      lastValue = value;
      hasLastValue = true;
      if (predicate(value)) {
        return value;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  const reason = lastError instanceof Error ? ` Last error: ${lastError.message}` : "";
  const snapshot =
    hasLastValue && typeof describeLastValue === "function"
      ? ` Last snapshot: ${describeLastValue(lastValue)}`
      : "";
  throw new Error(`Timed out waiting for ${label}.${reason}${snapshot}`);
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
    Boolean,
    {
      timeoutMs: 60000,
      intervalMs: 1500,
    }
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
  if (normalizeText(env.DISCOVERY_ENABLED) !== "1") {
    failures.push(`${serviceName} DISCOVERY_ENABLED=${normalizeText(env.DISCOVERY_ENABLED) || "unset"}`);
  }
  if (normalizeText(env.DISCOVERY_SEARCH_PROVIDER).toLowerCase() !== "ddgs") {
    failures.push(
      `${serviceName} DISCOVERY_SEARCH_PROVIDER=${normalizeText(env.DISCOVERY_SEARCH_PROVIDER) || "unset"}`
    );
  }
  if (normalizeText(env.DISCOVERY_BRAVE_API_KEY) !== "") {
    failures.push(`${serviceName} DISCOVERY_BRAVE_API_KEY must be empty`);
  }
  if (normalizeText(env.DISCOVERY_SERPER_API_KEY) !== "") {
    failures.push(`${serviceName} DISCOVERY_SERPER_API_KEY must be empty`);
  }
  if (failures.length > 0) {
    throw new Error(`Compose discovery env mismatch: ${failures.join("; ")}`);
  }
}

async function ensureComposeStack() {
  log("Ensuring compose stack is running.");
  runCommand("docker", [...composeArgs, "down", "--remove-orphans"]);
  runCommand("docker", [...composeArgs, "up", "--build", "-d", "--force-recreate", ...STACK_SERVICES]);
  await Promise.all([
    waitForHttpHealth("api", `${API_BASE_URL}/health`),
    waitForHttpHealth("admin", `${ADMIN_BASE_URL}/api/health`),
    waitForHttpHealth("nginx", "http://127.0.0.1:8080/health"),
  ]);
  assertComposeDiscoveryEnv("worker");
  assertComposeDiscoveryEnv("api");
}

function validateDdgsOnlyEnv(env) {
  const read = (key) => normalizeText(process.env[key] ?? env[key] ?? "");
  const guards = {
    discoveryEnabled: read("DISCOVERY_ENABLED") === "1",
    searchProvider: read("DISCOVERY_SEARCH_PROVIDER").toLowerCase() === "ddgs",
    braveUnset: read("DISCOVERY_BRAVE_API_KEY") === "",
    serperUnset: read("DISCOVERY_SERPER_API_KEY") === "",
  };
  const failures = [];
  if (!guards.discoveryEnabled) {
    failures.push("DISCOVERY_ENABLED must be 1.");
  }
  if (!guards.searchProvider) {
    failures.push("DISCOVERY_SEARCH_PROVIDER must be ddgs.");
  }
  if (!guards.braveUnset) {
    failures.push("DISCOVERY_BRAVE_API_KEY must stay empty.");
  }
  if (!guards.serperUnset) {
    failures.push("DISCOVERY_SERPER_API_KEY must stay empty.");
  }
  return {
    status: failures.length === 0 ? "passed" : "failed",
    failures,
    values: {
      DISCOVERY_ENABLED: read("DISCOVERY_ENABLED"),
      DISCOVERY_SEARCH_PROVIDER: read("DISCOVERY_SEARCH_PROVIDER"),
      DISCOVERY_BRAVE_API_KEY: read("DISCOVERY_BRAVE_API_KEY") ? "[set]" : "",
      DISCOVERY_SERPER_API_KEY: read("DISCOVERY_SERPER_API_KEY") ? "[set]" : "",
    },
  };
}

async function runPreflightCommands() {
  if (String(process.env.DISCOVERY_EXAMPLES_SKIP_PREFLIGHT ?? "").trim() === "1") {
    log("Skipping nested discovery preflight proof commands because the parent harness owns them.");
    return [
      {
        name: "pnpm test:discovery-enabled:compose",
        status: "skipped",
        startedAt: new Date().toISOString(),
        reason: "Skipped by parent proof harness.",
      },
      {
        name: "pnpm test:discovery:admin:compose",
        status: "skipped",
        startedAt: new Date().toISOString(),
        reason: "Skipped by parent proof harness.",
      },
    ];
  }
  log("Running discovery preflight proof commands.");
  const commands = [
    {
      name: "pnpm test:discovery-enabled:compose",
      args: ["test:discovery-enabled:compose"],
    },
    {
      name: "pnpm test:discovery:admin:compose",
      args: ["test:discovery:admin:compose"],
    },
  ];
  const results = [];
  for (const command of commands) {
    const startedAt = new Date().toISOString();
    try {
      const result = runCommand("pnpm", command.args, { capture: true });
      results.push({
        name: command.name,
        status: "passed",
        startedAt,
        stdout: result.stdout.trim(),
        stderr: result.stderr.trim(),
      });
    } catch (error) {
      results.push({
        name: command.name,
        status: "failed",
        startedAt,
        error: error instanceof Error ? error.message : String(error),
        stdout: error && typeof error === "object" && "stdout" in error ? String(error.stdout ?? "").trim() : "",
        stderr: error && typeof error === "object" && "stderr" in error ? String(error.stderr ?? "").trim() : "",
      });
      break;
    }
  }
  return results;
}

async function collectDiscoverySurfaceSnapshots() {
  const summary = await fetchJson(`${API_BASE_URL}/maintenance/discovery/summary`);
  const costs = await fetchJson(`${API_BASE_URL}/maintenance/discovery/costs/summary`);
  const adminDiscovery = await sendRequest(`${ADMIN_BASE_URL}/discovery`, { timeoutMs: 15000 });
  return {
    summary,
    costs,
    adminDiscovery: {
      status: adminDiscovery.status,
      dualPathDetected:
        adminDiscovery.status === 200 &&
        adminDiscovery.text.includes("Dual-path discovery control plane"),
      searchProviderDetected:
        adminDiscovery.status === 200 && adminDiscovery.text.includes("Search provider"),
      monthlyQuotaDetected:
        adminDiscovery.status === 200 && adminDiscovery.text.includes("Monthly quota"),
    },
  };
}

async function readPreconditionState(pool) {
  const interestResult = await pool.query(
    `
      select
        it.interest_template_id::text as interest_template_id,
        it.name,
        it.is_active
      from interest_templates it
    `
  );
  const criteriaResult = await pool.query(
    `
      select
        source_interest_template_id::text as source_interest_template_id,
        enabled
      from criteria
    `
  );
  const selectionProfilesResult = await pool.query(
    `
      select
        source_interest_template_id::text as source_interest_template_id,
        status
      from selection_profiles
    `
  );
  const channelResult = await pool.query(
    `
      select
        channel_id::text as channel_id,
        name,
        provider_type,
        is_active
      from source_channels
    `
  );
  return {
    interests: interestResult.rows,
    criteria: criteriaResult.rows,
    selectionProfiles: selectionProfilesResult.rows,
    channels: channelResult.rows,
  };
}

function evaluateCasePreconditions(caseDefinition, preconditionState) {
  const missingInterests = [];
  const missingCriteria = [];
  const missingProfiles = [];
  const missingChannels = [];

  for (const interestName of caseDefinition.interestNames) {
    const interestRows = preconditionState.interests.filter(
      (row) => normalizeText(row.name) === interestName
    );
    const activeInterest = interestRows.find((row) => row.is_active === true);
    if (!activeInterest) {
      missingInterests.push(interestName);
      continue;
    }
    const interestTemplateId = normalizeOptionalText(activeInterest.interest_template_id);
    const criteriaRows = preconditionState.criteria.filter(
      (row) => normalizeText(row.source_interest_template_id) === interestTemplateId
    );
    const selectionProfileRows = preconditionState.selectionProfiles.filter(
      (row) => normalizeText(row.source_interest_template_id) === interestTemplateId
    );
    if (!criteriaRows.some((row) => row.enabled === true)) {
      missingCriteria.push(interestName);
    }
    if (!selectionProfileRows.some((row) => normalizeText(row.status) === "active")) {
      missingProfiles.push(interestName);
    }
  }

  for (const channelName of caseDefinition.baselineChannelNames) {
    const channelRows = preconditionState.channels.filter(
      (row) => normalizeText(row.name) === channelName && row.is_active === true
    );
    if (channelRows.length === 0) {
      missingChannels.push(channelName);
    }
  }

  const failures = [];
  if (missingInterests.length > 0) {
    failures.push(`missing active interests: ${missingInterests.join(", ")}`);
  }
  if (missingCriteria.length > 0) {
    failures.push(`missing active criteria: ${missingCriteria.join(", ")}`);
  }
  if (missingProfiles.length > 0) {
    failures.push(`missing active selection profiles: ${missingProfiles.join(", ")}`);
  }
  if (missingChannels.length > 0) {
    failures.push(`missing active baseline channels: ${missingChannels.join(", ")}`);
  }

  return {
    caseKey: caseDefinition.key,
    status: failures.length === 0 ? "passed" : "failed",
    failures,
  };
}

async function listDiscoveryProfiles() {
  const payload = await fetchJson(
    `${API_BASE_URL}/maintenance/discovery/profiles?page=1&pageSize=100`,
    { timeoutMs: 15000 }
  );
  return asArray(payload.items);
}

async function upsertDiscoveryProfile(caseDefinition) {
  const profilePayload = buildDiscoveryProfilePayload(caseDefinition);
  const profiles = await listDiscoveryProfiles();
  const existing = profiles.find(
    (item) => normalizeText(item.profile_key) === normalizeText(profilePayload.profileKey)
  );
  if (!existing) {
    return postJson(`${API_BASE_URL}/maintenance/discovery/profiles`, profilePayload);
  }
  return patchJson(
    `${API_BASE_URL}/maintenance/discovery/profiles/${encodeURIComponent(String(existing.profile_id))}`,
    {
      displayName: profilePayload.displayName,
      description: profilePayload.description,
      status: "active",
      graphPolicyJson: profilePayload.graphPolicyJson,
      recallPolicyJson: profilePayload.recallPolicyJson,
      yieldBenchmarkJson: profilePayload.yieldBenchmarkJson,
    }
  );
}

async function getDiscoveryMission(missionId) {
  return fetchJson(
    `${API_BASE_URL}/maintenance/discovery/missions/${encodeURIComponent(missionId)}`,
    { timeoutMs: 15000 }
  );
}

async function getDiscoveryRecallMission(recallMissionId) {
  return fetchJson(
    `${API_BASE_URL}/maintenance/discovery/recall-missions/${encodeURIComponent(recallMissionId)}`,
    { timeoutMs: 15000 }
  );
}

async function listMissionCandidates(missionId) {
  const payload = await fetchJson(
    `${API_BASE_URL}/maintenance/discovery/candidates?missionId=${encodeURIComponent(missionId)}&page=1&pageSize=50`,
    { timeoutMs: 15000 }
  );
  return asArray(payload.items);
}

async function listRecallCandidates(recallMissionId) {
  const payload = await fetchJson(
    `${API_BASE_URL}/maintenance/discovery/recall-candidates?recallMissionId=${encodeURIComponent(recallMissionId)}&page=1&pageSize=50`,
    { timeoutMs: 15000 }
  );
  return asArray(payload.items);
}

async function listDiscoveryClasses() {
  const payload = await fetchJson(
    `${API_BASE_URL}/maintenance/discovery/classes?page=1&pageSize=100`,
    { timeoutMs: 15000 }
  );
  return asArray(payload.items);
}

async function getDiscoveryClass(classKey) {
  try {
    return await fetchJson(
      `${API_BASE_URL}/maintenance/discovery/classes/${encodeURIComponent(classKey)}`,
      { timeoutMs: 15000 }
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("was not found")) {
      return null;
    }
    throw error;
  }
}

async function upsertDiscoveryClass(payload) {
  const classKey = String(payload.classKey ?? "");
  const existing = await getDiscoveryClass(classKey);
  if (!existing) {
    return postJson(`${API_BASE_URL}/maintenance/discovery/classes`, payload);
  }
  return patchJson(
    `${API_BASE_URL}/maintenance/discovery/classes/${encodeURIComponent(classKey)}`,
    {
      displayName: payload.displayName,
      description: payload.description,
      status: payload.status,
      generationBackend: payload.generationBackend,
      defaultProviderTypes: payload.defaultProviderTypes,
      promptInstructions: payload.promptInstructions,
      seedRulesJson: payload.seedRulesJson,
      maxPerMission: payload.maxPerMission,
      sortOrder: payload.sortOrder,
      configJson: payload.configJson,
    }
  );
}

async function ensureCaseGraphClasses(caseDefinition) {
  const created = [];
  for (const classPayload of asArray(caseDefinition.graphClasses)) {
    const item = await upsertDiscoveryClass(classPayload);
    created.push({
      classKey: item.class_key,
      status: item.status,
    });
  }
  return created;
}

async function archiveCaseGraphClasses(caseDefinition) {
  const archived = [];
  for (const classPayload of asArray(caseDefinition.graphClasses)) {
    const classKey = String(classPayload.classKey ?? "").trim();
    if (!classKey) {
      continue;
    }
    const existing = await getDiscoveryClass(classKey);
    if (!existing) {
      continue;
    }
    if (normalizeText(existing.status) === "archived") {
      archived.push({
        classKey,
        alreadyArchived: true,
      });
      continue;
    }
    const updated = await patchJson(
      `${API_BASE_URL}/maintenance/discovery/classes/${encodeURIComponent(classKey)}`,
      {
        status: "archived",
      }
    );
    archived.push({
      classKey: updated.class_key,
      status: updated.status,
      alreadyArchived: false,
    });
  }
  return archived;
}

async function isolateGraphClassesForCase(caseDefinition) {
  const classes = await listDiscoveryClasses();
  const allowedClassKeys = new Set(
    asArray(caseDefinition.graphClasses)
      .map((item) => normalizeText(item.classKey))
      .filter(Boolean)
  );
  const isolated = [];
  for (const item of classes) {
    const classKey = normalizeText(item.class_key);
    const status = normalizeText(item.status).toLowerCase();
    if (!classKey || status !== "active" || allowedClassKeys.has(classKey) || isDisposableDiscoveryClass(item)) {
      continue;
    }
    const updated = await patchJson(
      `${API_BASE_URL}/maintenance/discovery/classes/${encodeURIComponent(classKey)}`,
      {
        status: "archived",
      }
    );
    isolated.push({
      classKey,
      previousStatus: status,
      currentStatus: normalizeText(updated.status).toLowerCase() || "archived",
    });
  }
  return isolated;
}

async function restoreIsolatedGraphClasses(isolatedRows) {
  const restored = [];
  for (const row of asArray(isolatedRows)) {
    const classKey = normalizeText(row.classKey);
    const previousStatus = normalizeText(row.previousStatus).toLowerCase();
    if (!classKey || !previousStatus || previousStatus === "archived") {
      continue;
    }
    const updated = await patchJson(
      `${API_BASE_URL}/maintenance/discovery/classes/${encodeURIComponent(classKey)}`,
      {
        status: previousStatus,
      }
    );
    restored.push({
      classKey,
      restoredStatus: normalizeText(updated.status).toLowerCase() || previousStatus,
    });
  }
  return restored;
}

function isDisposableDiscoveryClass(item) {
  const classKey = normalizeText(item.class_key);
  return (
    classKey.startsWith("acceptance_")
    || classKey.startsWith("delete_")
    || classKey.startsWith("adaptive_smoke_")
  );
}

async function archiveDisposableDiscoveryClasses() {
  const classes = await listDiscoveryClasses();
  const archived = [];
  for (const item of classes) {
    if (!isDisposableDiscoveryClass(item)) {
      continue;
    }
    if (normalizeText(item.status) === "archived") {
      archived.push({
        classKey: item.class_key,
        alreadyArchived: true,
      });
      continue;
    }
    const updated = await patchJson(
      `${API_BASE_URL}/maintenance/discovery/classes/${encodeURIComponent(String(item.class_key))}`,
      {
        status: "archived",
      }
    );
    archived.push({
      classKey: updated.class_key,
      status: updated.status,
      alreadyArchived: false,
    });
  }
  return archived;
}

async function readMissionGraphProgress(pool, missionId) {
  const hypothesisCountsResult = await pool.query(
    `
      select status, count(*)::int as total
      from discovery_hypotheses
      where mission_id = $1::uuid
      group by status
    `,
    [missionId]
  );
  const latestRunResult = await pool.query(
    `
      select
        sr.run_id::text as run_id,
        sr.status,
        sr.created_at,
        sr.started_at,
        sr.finished_at,
        sr.error_text
      from sequence_runs sr
      where
        sr.sequence_id = $1::uuid
        and sr.context_json ->> 'mission_id' = $2
      order by sr.created_at desc
      limit 1
    `,
    [DISCOVERY_ORCHESTRATOR_SEQUENCE_ID, missionId]
  );
  const latestRunId = normalizeOptionalText(latestRunResult.rows[0]?.run_id);
  let latestTask = null;
  if (latestRunId) {
    const latestTaskResult = await pool.query(
      `
        select
          task_index,
          task_key,
          status,
          started_at,
          finished_at,
          error_text
        from sequence_task_runs
        where run_id = $1::uuid
        order by task_index desc
        limit 1
      `,
      [latestRunId]
    );
    if (latestTaskResult.rows[0]) {
      latestTask = {
        taskIndex: asInt(latestTaskResult.rows[0].task_index, -1),
        taskKey: latestTaskResult.rows[0].task_key,
        status: latestTaskResult.rows[0].status,
        startedAt: latestTaskResult.rows[0].started_at,
        finishedAt: latestTaskResult.rows[0].finished_at,
        errorText: latestTaskResult.rows[0].error_text,
      };
    }
  }

  const hypothesisCounts = {
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
  };
  for (const row of hypothesisCountsResult.rows) {
    hypothesisCounts[normalizeText(row.status).toLowerCase()] = asInt(row.total, 0);
  }

  return {
    hypothesisCounts,
    latestRun: latestRunResult.rows[0]
      ? {
          runId: latestRunResult.rows[0].run_id,
          status: latestRunResult.rows[0].status,
          createdAt: latestRunResult.rows[0].created_at,
          startedAt: latestRunResult.rows[0].started_at,
          finishedAt: latestRunResult.rows[0].finished_at,
          errorText: latestRunResult.rows[0].error_text,
          latestTask,
        }
      : null,
  };
}

async function collectGraphCandidates(pool, missionId, caseDefinition, lane) {
  const deadlineAt = Date.now() + DISCOVERY_LIVE_DEFAULTS.missionCandidatePollTimeoutMs;
  let runAttempts = 1;

  while (Date.now() < deadlineAt) {
    const rawCandidates = await listMissionCandidates(missionId);
    if (rawCandidates.length > 0) {
      return rawCandidates;
    }

    const progress = await readMissionGraphProgress(pool, missionId);
    lane.progress.push(progress);
    const pendingCount = asInt(progress.hypothesisCounts.pending, 0);
    const runningCount = asInt(progress.hypothesisCounts.running, 0);
    const latestRunStatus = normalizeText(progress.latestRun?.status).toLowerCase();
    const latestTaskStatus = normalizeText(progress.latestRun?.latestTask?.status).toLowerCase();
    const latestTaskTerminal = latestTaskStatus === "completed" || latestTaskStatus === "failed";
    const latestRunTerminal =
      latestRunStatus === "completed"
      || latestRunStatus === "failed"
      || latestTaskTerminal;

    if (
      runningCount === 0 &&
      pendingCount > 0 &&
      latestRunTerminal &&
      runAttempts < DISCOVERY_LIVE_DEFAULTS.maxGraphRunAttemptsPerCase
    ) {
      lane.runRequests.push(
        await postJson(
          `${API_BASE_URL}/maintenance/discovery/missions/${encodeURIComponent(missionId)}/run`,
          {
            requestedBy: "infra:test-live-discovery-examples",
          }
        )
      );
      runAttempts += 1;
      continue;
    }

    if (runningCount === 0 && pendingCount === 0 && latestRunTerminal) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, DISCOVERY_LIVE_DEFAULTS.pollIntervalMs));
  }

  return [];
}

function pollChannelInFetchersContainer(channelId) {
  return runCommand(
    "docker",
    [
      ...composeArgs,
      "exec",
      "-T",
      "fetchers",
      "pnpm",
      "--filter",
      "@newsportal/fetchers",
      "run:once",
      channelId,
    ],
    {
      capture: true,
      allowFailure: true,
    }
  );
}

async function triggerChannelPolls(channelIds) {
  const uniqueChannelIds = [...new Set(channelIds.filter(Boolean))];
  const results = [];
  for (const channelId of uniqueChannelIds) {
    log(`Triggering fetchers run:once for ${channelId}`);
    const result = pollChannelInFetchersContainer(channelId);
    results.push({
      channelId,
      status: result.status,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
    });
  }
  return results;
}

async function resolveChannelsByName(pool, channelNames) {
  const names = asArray(channelNames).map((name) => normalizeText(name)).filter(Boolean);
  if (names.length === 0) {
    return [];
  }
  const result = await pool.query(
    `
      select
        channel_id::text as channel_id,
        name,
        fetch_url,
        provider_type,
        is_active
      from source_channels
      where name = any($1::text[])
      order by name
    `,
    [names]
  );
  const rowsByName = new Map(result.rows.map((row) => [normalizeText(row.name), row]));
  return names.map((name) => rowsByName.get(name) ?? {
    channel_id: null,
    name,
    fetch_url: null,
    provider_type: null,
    is_active: false,
    missing: true,
  });
}

function hasSuccessfulFetchRun(fetchRuns) {
  return asArray(fetchRuns).some((run) => {
    const outcome = normalizeText(run.outcomeKind ?? run.outcome_kind).toLowerCase();
    const status = Number(run.httpStatus ?? run.http_status ?? 0);
    const errorText = normalizeText(run.errorText ?? run.error_text);
    return !errorText && (
      outcome === "success"
      || outcome === "new_content"
      || outcome === "no_change"
      || outcome === "duplicate_only"
      || (status >= 200 && status < 400)
    );
  });
}

function contentAnalysisStatusIsPassing(status) {
  return status === "passed" || status === "not_applicable";
}

async function readChannelEvidence(pool, channelId, startedAtIso, interestNames) {
  const fetchRunsResult = await pool.query(
    `
      select
        started_at,
        outcome_kind,
        http_status,
        error_text,
        fetched_item_count,
        new_article_count,
        duplicate_suppressed_count
      from channel_fetch_runs
      where channel_id = $1 and started_at >= $2::timestamptz
      order by started_at desc
    `,
    [channelId, startedAtIso]
  );
  const articlesResult = await pool.query(
    `
      select
        doc_id::text as doc_id,
        title,
        url,
        created_at
      from articles
      where channel_id = $1 and created_at >= $2::timestamptz
      order by created_at desc
    `,
    [channelId, startedAtIso]
  );
  const interestFiltersResult = await pool.query(
    `
      select
        c.description as criterion_name,
        ifr.semantic_decision,
        ifr.compat_decision,
        ifr.filter_scope,
        ifr.created_at,
        a.doc_id::text as doc_id,
        a.title
      from interest_filter_results ifr
      join articles a on a.doc_id = ifr.doc_id
      left join criteria c on c.criterion_id = ifr.criterion_id
      where a.channel_id = $1 and ifr.created_at >= $2::timestamptz
      order by ifr.created_at desc
    `,
    [channelId, startedAtIso]
  );
  const finalSelectionResult = await pool.query(
    `
      select
        count(*)::int as total,
        count(*) filter (where is_selected = true)::int as selected
      from final_selection_results fsr
      join articles a on a.doc_id = fsr.doc_id
      where a.channel_id = $1 and fsr.created_at >= $2::timestamptz
    `,
    [channelId, startedAtIso]
  );
  const systemFeedResult = await pool.query(
    `
      select
        count(*)::int as total,
        count(*) filter (where eligible_for_feed = true)::int as eligible
      from system_feed_results sfr
      join articles a on a.doc_id = sfr.doc_id
      where a.channel_id = $1 and sfr.created_at >= $2::timestamptz
    `,
    [channelId, startedAtIso]
  );
  const outboxResult = await pool.query(
    `
      select
        event_id::text as event_id,
        created_at,
        payload_json
      from outbox_events
      where
        aggregate_id = $1
        and event_type = 'source.channel.sync.requested'
        and created_at >= $2::timestamptz
      order by created_at desc
    `,
    [channelId, startedAtIso]
  );

  const coveredInterests = new Set(
    interestFiltersResult.rows
      .map((row) => normalizeText(row.criterion_name))
      .filter((name) => interestNames.includes(name))
  );

  return {
    channelId,
    fetchRuns: fetchRunsResult.rows.map((row) => ({
      startedAt: row.started_at,
      outcomeKind: row.outcome_kind,
      httpStatus: row.http_status,
      errorText: row.error_text,
      fetchedItemCount: row.fetched_item_count,
      newArticleCount: row.new_article_count,
      duplicateSuppressedCount: row.duplicate_suppressed_count,
    })),
    articles: articlesResult.rows.map((row) => ({
      docId: row.doc_id,
      title: row.title,
      url: row.url,
      createdAt: row.created_at,
    })),
    interestFilterResults: interestFiltersResult.rows.map((row) => ({
      criterionName: row.criterion_name,
      semanticDecision: row.semantic_decision,
      compatDecision: row.compat_decision,
      filterScope: row.filter_scope,
      createdAt: row.created_at,
      docId: row.doc_id,
      title: row.title,
    })),
    finalSelection: {
      total: asInt(finalSelectionResult.rows[0]?.total, 0),
      selected: asInt(finalSelectionResult.rows[0]?.selected, 0),
    },
    systemFeed: {
      total: asInt(systemFeedResult.rows[0]?.total, 0),
      eligible: asInt(systemFeedResult.rows[0]?.eligible, 0),
    },
    outboxEvents: outboxResult.rows.map((row) => ({
      eventId: row.event_id,
      createdAt: row.created_at,
      payload: row.payload_json,
    })),
    coveredInterests: [...coveredInterests],
  };
}

async function waitForChannelEvidence(pool, channelId, startedAtIso, interestNames) {
  return waitFor(
    `downstream evidence for channel ${channelId}`,
    async () => readChannelEvidence(pool, channelId, startedAtIso, interestNames),
    (snapshot) =>
      snapshot.fetchRuns.length > 0 ||
      snapshot.articles.length > 0 ||
      snapshot.interestFilterResults.length > 0 ||
      snapshot.finalSelection.total > 0 ||
      snapshot.systemFeed.total > 0,
    {
      timeoutMs: DISCOVERY_LIVE_DEFAULTS.downstreamPollTimeoutMs,
      intervalMs: DISCOVERY_LIVE_DEFAULTS.pollIntervalMs,
    }
  );
}

async function readContentAnalysisEvidence(pool, downstreamRows, startedAtIso) {
  const candidateArticleIds = [
    ...new Set(
      asArray(downstreamRows)
        .flatMap((row) => asArray(row.articles).map((article) => normalizeText(article.docId)))
        .filter(Boolean)
    ),
  ];
  if (candidateArticleIds.length === 0) {
    return {
      status: "not_applicable",
      reason: "no_article_subjects_in_proof_window",
      sampledSubjectIds: [],
      sampledStoryClusterIds: [],
      candidateSubjectCount: 0,
      sampledSubjectCount: 0,
      sampledStoryClusterCount: 0,
      requiredAnalysisTypes: ["ner", "sentiment", "category", "system_interest_label", "content_filter"],
      analysisTypeCounts: {},
      entityTypeCounts: {},
      labelTypeCounts: {},
      filterModes: {},
      filterDecisions: {},
    };
  }

  const articleStateResult = await pool.query(
    `
      select processing_state, count(*)::int as count
      from articles
      where doc_id = any($1::uuid[])
      group by processing_state
      order by processing_state
    `,
    [candidateArticleIds]
  );
  const articleStateCounts = Object.fromEntries(
    articleStateResult.rows.map((row) => [normalizeText(row.processing_state), asInt(row.count, 0)])
  );
  const processedArticleResult = await pool.query(
    `
      select doc_id::text as doc_id
      from articles
      where
        doc_id = any($1::uuid[])
        and processing_state = any($2::text[])
      order by updated_at desc
    `,
    [candidateArticleIds, [...CONTENT_ANALYSIS_PROCESSED_ARTICLE_STATES]]
  );
  const articleIds = processedArticleResult.rows
    .map((row) => normalizeText(row.doc_id))
    .filter(Boolean);
  if (articleIds.length === 0) {
    return {
      status: "not_applicable",
      reason: "no_processed_article_subjects_in_proof_window",
      sampledSubjectIds: [],
      sampledStoryClusterIds: [],
      candidateSubjectCount: candidateArticleIds.length,
      sampledSubjectCount: 0,
      sampledStoryClusterCount: 0,
      articleStateCounts,
      requiredAnalysisTypes: ["ner", "sentiment", "category", "system_interest_label", "content_filter"],
      analysisTypeCounts: {},
      entityTypeCounts: {},
      labelTypeCounts: {},
      filterModes: {},
      filterDecisions: {},
    };
  }

  const storyClusterResult = await pool.query(
    `
      select distinct story_cluster_id
      from story_cluster_members
      where canonical_document_id = any($1::uuid[])
    `,
    [articleIds]
  );
  const storyClusterIds = storyClusterResult.rows
    .map((row) => normalizeText(row.story_cluster_id))
    .filter(Boolean);

  const analysisResult = await pool.query(
    `
      select analysis_type, subject_type, count(*)::int as count
      from content_analysis_results
      where
        updated_at >= $3::timestamptz
        and (
          (subject_type = 'article' and subject_id = any($1::uuid[]))
          or (subject_type = 'story_cluster' and subject_id = any($2::uuid[]))
        )
      group by analysis_type, subject_type
      order by analysis_type, subject_type
    `,
    [articleIds, storyClusterIds, startedAtIso]
  );
  const entityResult = await pool.query(
    `
      select entity_type, count(*)::int as count
      from content_entities
      where
        subject_type = 'article'
        and subject_id = any($1::uuid[])
        and created_at >= $2::timestamptz
      group by entity_type
      order by entity_type
    `,
    [articleIds, startedAtIso]
  );
  const labelResult = await pool.query(
    `
      select label_type, count(*)::int as count
      from content_labels
      where
        subject_type = 'article'
        and subject_id = any($1::uuid[])
        and created_at >= $2::timestamptz
      group by label_type
      order by label_type
    `,
    [articleIds, startedAtIso]
  );
  const filterResult = await pool.query(
    `
      select subject_type, mode, decision, count(*)::int as count
      from content_filter_results
      where
        updated_at >= $3::timestamptz
        and (
          (subject_type = 'article' and subject_id = any($1::uuid[]))
          or (subject_type = 'story_cluster' and subject_id = any($2::uuid[]))
        )
      group by subject_type, mode, decision
      order by subject_type, mode, decision
    `,
    [articleIds, storyClusterIds, startedAtIso]
  );

  const analysisTypeCounts = {};
  const analysisSubjectTypeCounts = {};
  for (const row of analysisResult.rows) {
    const analysisType = normalizeText(row.analysis_type);
    const subjectType = normalizeText(row.subject_type);
    const count = asInt(row.count, 0);
    analysisTypeCounts[analysisType] = (analysisTypeCounts[analysisType] ?? 0) + count;
    analysisSubjectTypeCounts[`${subjectType}:${analysisType}`] =
      (analysisSubjectTypeCounts[`${subjectType}:${analysisType}`] ?? 0) + count;
  }
  const entityTypeCounts = Object.fromEntries(
    entityResult.rows.map((row) => [normalizeText(row.entity_type), asInt(row.count, 0)])
  );
  const labelTypeCounts = Object.fromEntries(
    labelResult.rows.map((row) => [normalizeText(row.label_type), asInt(row.count, 0)])
  );
  const filterModes = {};
  const filterDecisions = {};
  const filterSubjectTypeCounts = {};
  for (const row of filterResult.rows) {
    const subjectType = normalizeText(row.subject_type);
    const mode = normalizeText(row.mode);
    const decision = normalizeText(row.decision);
    filterModes[mode] = (filterModes[mode] ?? 0) + asInt(row.count, 0);
    filterDecisions[decision] = (filterDecisions[decision] ?? 0) + asInt(row.count, 0);
    filterSubjectTypeCounts[subjectType] = (filterSubjectTypeCounts[subjectType] ?? 0) + asInt(row.count, 0);
  }

  const requiredAnalysisTypes = ["ner", "sentiment", "category", "system_interest_label", "content_filter"];
  const missingAnalysisTypes = requiredAnalysisTypes.filter(
    (analysisType) => asInt(analysisTypeCounts[analysisType], 0) <= 0
  );
  const allowedEntityTypes = ["ORG", "PERSON", "GPE", "DATE"];
  const entitySignalPresent = allowedEntityTypes.some((entityType) => asInt(entityTypeCounts[entityType], 0) > 0);
  const labelSignalPresent = ["taxonomy", "sentiment", "tone", "risk", "system_interest"].some(
    (labelType) => asInt(labelTypeCounts[labelType], 0) > 0
  );
  const filterDryRunOnly =
    Object.keys(filterModes).length > 0
    && Object.keys(filterModes).every((mode) => mode === "dry_run");
  const failures = [
    ...missingAnalysisTypes.map((analysisType) => `missing analysis ${analysisType}`),
    ...(entitySignalPresent ? [] : ["missing ORG/PERSON/GPE/DATE entity evidence"]),
    ...(labelSignalPresent ? [] : ["missing taxonomy/sentiment/tone/risk/system_interest label evidence"]),
    ...(filterDryRunOnly ? [] : ["missing dry_run-only content filter evidence"]),
  ];

  return {
    status: failures.length === 0 ? "passed" : "failed",
    failures,
    sampledSubjectIds: articleIds.slice(0, 20),
    sampledStoryClusterIds: storyClusterIds.slice(0, 20),
    candidateSubjectCount: candidateArticleIds.length,
    sampledSubjectCount: articleIds.length,
    sampledStoryClusterCount: storyClusterIds.length,
    articleStateCounts,
    requiredAnalysisTypes,
    analysisTypeCounts,
    analysisSubjectTypeCounts,
    entityTypeCounts,
    labelTypeCounts,
    filterModes,
    filterDecisions,
    filterSubjectTypeCounts,
  };
}

async function waitForContentAnalysisEvidence(pool, downstreamRows, startedAtIso) {
  return waitFor(
    "content-analysis evidence for sampled proof subjects",
    async () => readContentAnalysisEvidence(pool, downstreamRows, startedAtIso),
    (snapshot) => contentAnalysisStatusIsPassing(snapshot.status),
    {
      timeoutMs: 300000,
      intervalMs: DISCOVERY_LIVE_DEFAULTS.pollIntervalMs,
      describeLastValue: (snapshot) =>
        JSON.stringify({
          status: snapshot.status,
          failures: snapshot.failures ?? [],
          candidateSubjectCount: snapshot.candidateSubjectCount ?? 0,
          sampledSubjectCount: snapshot.sampledSubjectCount ?? 0,
          sampledStoryClusterCount: snapshot.sampledStoryClusterCount ?? 0,
          articleStateCounts: snapshot.articleStateCounts ?? {},
          analysisTypeCounts: snapshot.analysisTypeCounts ?? {},
          entityTypeCounts: snapshot.entityTypeCounts ?? {},
          labelTypeCounts: snapshot.labelTypeCounts ?? {},
          filterModes: snapshot.filterModes ?? {},
          filterSubjectTypeCounts: snapshot.filterSubjectTypeCounts ?? {},
        }),
    }
  );
}

function collectCandidateArticleIds(downstreamRows) {
  return [
    ...new Set(
      asArray(downstreamRows)
        .flatMap((row) => asArray(row.articles).map((article) => normalizeText(article.docId)))
        .filter(Boolean)
    ),
  ];
}

async function requestContentFilterBackfill(pool, downstreamRows) {
  const subjectIds = collectCandidateArticleIds(downstreamRows).slice(0, 100);
  if (subjectIds.length === 0) {
    return {
      status: "skipped",
      reason: "no_article_subjects_in_proof_window",
      subjectCount: 0,
    };
  }

  const queued = await postJson(
    `${API_BASE_URL}/maintenance/content-analysis/backfill`,
    {
      subjectTypes: ["article"],
      modules: ["content_filter"],
      missingOnly: true,
      policyKey: "default_recent_content_gate",
      subjectIds,
      batchSize: Math.min(100, Math.max(1, subjectIds.length)),
      maxTextChars: 50000,
      requestedByUserId: null,
    },
    { timeoutMs: 30000 }
  );
  const reindexJobId = normalizeText(queued?.reindexJobId);
  if (!reindexJobId) {
    throw new Error("Content-filter backfill request did not return a reindexJobId.");
  }

  const completed = await waitFor(
    `completed content-filter backfill job ${reindexJobId}`,
    async () => {
      const result = await pool.query(
        `
          select status, error_text, options_json
          from reindex_jobs
          where reindex_job_id = $1::uuid
        `,
        [reindexJobId]
      );
      return result.rows[0] ?? null;
    },
    (row) => row?.status === "completed" || row?.status === "failed",
    {
      timeoutMs: 300000,
      intervalMs: DISCOVERY_LIVE_DEFAULTS.pollIntervalMs,
      describeLastValue: (row) =>
        JSON.stringify({
          status: row?.status ?? "missing",
          errorText: row?.error_text ?? null,
          options: row?.options_json ?? null,
        }),
    }
  );

  if (completed.status === "failed") {
    throw new Error(
      `Content-filter backfill job ${reindexJobId} failed: ${completed.error_text || "unknown error"}`
    );
  }

  return {
    reindexJobId,
    status: completed.status,
    subjectCount: subjectIds.length,
    options: completed.options_json ?? null,
  };
}

async function runBaselineLane(pool, caseDefinition, startedAtIso) {
  const channelNames = asArray(caseDefinition.baselineProofChannelNames).length > 0
    ? caseDefinition.baselineProofChannelNames
    : asArray(caseDefinition.baselineChannelNames).slice(0, 3);
  const resolvedChannels = await resolveChannelsByName(pool, channelNames);
  const channelIds = resolvedChannels
    .filter((row) => row.channel_id && row.is_active === true)
    .map((row) => row.channel_id);
  const triggerPolls = await triggerChannelPolls(channelIds);
  const evidence = [];
  for (const channel of resolvedChannels) {
    if (!channel.channel_id || channel.is_active !== true) {
      evidence.push({
        channelId: channel.channel_id,
        channelName: channel.name,
        error: "baseline channel missing or inactive",
        fetchRuns: [],
        articles: [],
        interestFilterResults: [],
        finalSelection: { total: 0, selected: 0 },
        systemFeed: { total: 0, eligible: 0 },
        outboxEvents: [],
        coveredInterests: [],
      });
      continue;
    }
    try {
      const row = await waitForChannelEvidence(
        pool,
        channel.channel_id,
        startedAtIso,
        caseDefinition.interestNames
      );
      evidence.push({
        ...row,
        channelName: channel.name,
        lane: "baseline",
      });
    } catch (error) {
      evidence.push({
        channelId: channel.channel_id,
        channelName: channel.name,
        lane: "baseline",
        error: error instanceof Error ? error.message : String(error),
        fetchRuns: [],
        articles: [],
        interestFilterResults: [],
        finalSelection: { total: 0, selected: 0 },
        systemFeed: { total: 0, eligible: 0 },
        outboxEvents: [],
        coveredInterests: [],
      });
    }
  }
  const successfulFetches = evidence.filter((row) => hasSuccessfulFetchRun(row.fetchRuns)).length;
  return {
    requestedChannelNames: channelNames,
    resolvedChannels,
    triggerPolls,
    evidence,
    successfulFetches,
  };
}

async function runGraphLane(pool, caseDefinition, startedAtIso, materializedProfile) {
  const lane = {
    mission: null,
    materializedProfile: materializedProfile ?? null,
    preparedClasses: [],
    isolatedClasses: [],
    restoredIsolatedClasses: [],
    archivedClasses: [],
    runRequests: [],
    progress: [],
    candidates: [],
    feedback: null,
    reEvaluate: null,
    approvedChannelIds: [],
    residuals: [],
  };

  try {
    lane.preparedClasses = await ensureCaseGraphClasses(caseDefinition);
    lane.isolatedClasses = await isolateGraphClassesForCase(caseDefinition);

    const mission = await postJson(
      `${API_BASE_URL}/maintenance/discovery/missions`,
      buildProfileBackedGraphMissionPayload(
        caseDefinition,
        startedAtIso,
        normalizeOptionalText(materializedProfile?.profile_id)
      )
    );
    lane.mission = mission;
    const missionId = String(mission?.mission_id ?? "");

    const compiled = await postJson(
      `${API_BASE_URL}/maintenance/discovery/missions/${encodeURIComponent(missionId)}/compile-graph`,
      {}
    );
    lane.mission = compiled;

    lane.runRequests.push(
      await postJson(
        `${API_BASE_URL}/maintenance/discovery/missions/${encodeURIComponent(missionId)}/run`,
        {
          requestedBy: "infra:test-live-discovery-examples",
        }
      )
    );

    const rawCandidates = await collectGraphCandidates(pool, missionId, caseDefinition, lane);
    if (rawCandidates.length === 0) {
      lane.residuals.push({
        missionId,
        reason: "graph_no_candidates_after_bounded_attempts",
      });
      return lane;
    }

    const candidatePlans = rawCandidates
      .map((candidate) => {
        const plan = classifyGraphCandidate(candidate, caseDefinition, DISCOVERY_LIVE_DEFAULTS);
        return {
          candidate,
          plan,
        };
      })
      .sort((left, right) => right.plan.reviewScore - left.plan.reviewScore);

    let approvalsLeft = DISCOVERY_LIVE_DEFAULTS.maxGraphApprovalsPerCase;
    for (const item of candidatePlans) {
      const candidateId = String(item.candidate.candidate_id ?? "");
      if (item.plan.decision === "approvable" && approvalsLeft > 0) {
        const reviewed = await patchJson(
          `${API_BASE_URL}/maintenance/discovery/candidates/${encodeURIComponent(candidateId)}`,
          {
            status: "approved",
            reviewedBy: "infra:test-live-discovery-examples",
          }
        );
        approvalsLeft -= 1;
        const registeredChannelId = normalizeOptionalText(reviewed.registered_channel_id);
        if (registeredChannelId) {
          lane.approvedChannelIds.push(registeredChannelId);
        }
        const reviewedStatus = normalizeText(reviewed.status).toLowerCase();
        const registrationFailed = !registeredChannelId;
        if (registrationFailed) {
          lane.residuals.push({
            candidateId,
            providerType: item.candidate.provider_type,
            url: item.candidate.url,
            reason: "registration_failed",
          });
        }
        lane.candidates.push({
          candidateId,
          providerType: item.candidate.provider_type,
          title: item.candidate.title,
          url: item.candidate.url,
          domain: item.plan.context?.domain || null,
          classKey: normalizeOptionalText(item.candidate.class_key),
          tacticKey: normalizeOptionalText(item.candidate.tactic_key),
          benchmarkLike: item.plan.benchmarkLike === true,
          policySignals: item.plan.policySignals ?? {},
          reviewScore: item.plan.reviewScore,
          onboardingVerdict: item.plan.onboardingVerdict ?? null,
          productivityRisk: item.plan.productivityRisk ?? null,
          usefulnessDiagnostic: item.plan.usefulnessDiagnostic ?? null,
          stageLossBucket: item.plan.stageLossBucket ?? null,
          sourceFamily: item.plan.sourceFamily ?? null,
          sourceShape: item.plan.sourceShape ?? null,
          decision: reviewedStatus === "duplicate" ? "duplicate" : "approved",
          registeredChannelId,
          registrationFailed,
        });
        continue;
      }

      const rejectionReason =
        item.plan.decision === "approvable" && approvalsLeft <= 0
          ? "approval_cap_reached"
          : item.plan.rejectionReason || "not_selected";
      const reviewed = await patchJson(
        `${API_BASE_URL}/maintenance/discovery/candidates/${encodeURIComponent(candidateId)}`,
        {
          status: "rejected",
          reviewedBy: "infra:test-live-discovery-examples",
          rejectionReason,
        }
      );
      lane.candidates.push({
        candidateId,
        providerType: item.candidate.provider_type,
        title: item.candidate.title,
        url: item.candidate.url,
        domain: item.plan.context?.domain || null,
        classKey: normalizeOptionalText(item.candidate.class_key),
        tacticKey: normalizeOptionalText(item.candidate.tactic_key),
        benchmarkLike: item.plan.benchmarkLike === true,
        policySignals: item.plan.policySignals ?? {},
        reviewScore: item.plan.reviewScore,
        onboardingVerdict: item.plan.onboardingVerdict ?? null,
        productivityRisk: item.plan.productivityRisk ?? null,
        usefulnessDiagnostic: item.plan.usefulnessDiagnostic ?? null,
        stageLossBucket: item.plan.stageLossBucket ?? null,
        sourceFamily: item.plan.sourceFamily ?? null,
        sourceShape: item.plan.sourceShape ?? null,
        decision: "rejected",
        rejectionReason: reviewed.rejection_reason ?? rejectionReason,
      });
      if (rejectionReason !== "below_auto_approval_threshold") {
        lane.residuals.push({
          candidateId,
          providerType: item.candidate.provider_type,
          url: item.candidate.url,
          reason: rejectionReason,
        });
      }
    }

    const feedbackTarget = lane.candidates.find((candidate) => candidate.decision === "approved")
      || lane.candidates[0]
      || null;
    if (feedbackTarget) {
      lane.feedback = await postJson(`${API_BASE_URL}/maintenance/discovery/feedback`, {
        missionId,
        candidateId: feedbackTarget.candidateId,
        feedbackType: "automation_case_review",
        feedbackValue: feedbackTarget.decision,
        notes: `Automated live discovery feedback for ${caseDefinition.key}`,
        createdBy: "infra:test-live-discovery-examples",
      });
      lane.reEvaluate = await postJson(`${API_BASE_URL}/maintenance/discovery/re-evaluate`, {
        missionId,
      });
    }

    lane.mission = await getDiscoveryMission(missionId);

    return lane;
  } finally {
    lane.restoredIsolatedClasses = await restoreIsolatedGraphClasses(lane.isolatedClasses);
    lane.archivedClasses = await archiveCaseGraphClasses(caseDefinition);
  }
}

async function runRecallLane(caseDefinition, startedAtIso, materializedProfile) {
  const lane = {
    mission: null,
    materializedProfile: materializedProfile ?? null,
    acquisition: null,
    candidates: [],
    promotedChannelIds: [],
    residuals: [],
  };

  const recallMission = await postJson(
    `${API_BASE_URL}/maintenance/discovery/recall-missions`,
    buildProfileBackedRecallMissionPayload(
      caseDefinition,
      startedAtIso,
      normalizeOptionalText(materializedProfile?.profile_id)
    )
  );
  lane.mission = recallMission;
  const recallMissionId = String(recallMission?.recall_mission_id ?? "");

  lane.acquisition = await postJson(
    `${API_BASE_URL}/maintenance/discovery/recall-missions/${encodeURIComponent(recallMissionId)}/acquire`,
    {},
    { timeoutMs: DISCOVERY_LIVE_DEFAULTS.recallAcquireTimeoutMs }
  );
  lane.mission = await getDiscoveryRecallMission(recallMissionId);

  const rawCandidates = await waitFor(
    `recall candidates for ${caseDefinition.key}`,
    async () => listRecallCandidates(recallMissionId),
    (items) => Array.isArray(items) && items.length > 0,
    {
      timeoutMs: DISCOVERY_LIVE_DEFAULTS.recallCandidatePollTimeoutMs,
      intervalMs: DISCOVERY_LIVE_DEFAULTS.pollIntervalMs,
    }
  );

  const candidatePlans = rawCandidates
    .map((candidate) => ({
      candidate,
      plan: classifyRecallCandidate(candidate, caseDefinition, DISCOVERY_LIVE_DEFAULTS),
    }))
    .sort((left, right) => right.plan.reviewScore - left.plan.reviewScore);

  let promotionsLeft = DISCOVERY_LIVE_DEFAULTS.maxRecallPromotionsPerCase;
  for (const item of candidatePlans) {
    const candidateId = String(item.candidate.recall_candidate_id ?? "");
    const currentStatus = normalizeText(item.candidate.status).toLowerCase();
    const currentRejectionReason = normalizeText(
      item.candidate.rejection_reason ?? item.candidate.rejectionReason
    ).toLowerCase();
    const normalizedCurrentRejectionReason =
      currentRejectionReason === "invalid_feed" || currentRejectionReason === "probe_failed"
        ? "candidate_not_valid"
        : currentRejectionReason;
    const currentRegisteredChannelId = normalizeOptionalText(
      item.candidate.registered_channel_id ?? item.candidate.registeredChannelId
    );

    if (
      currentStatus === "duplicate"
      || (currentStatus === "shortlisted" && currentRegisteredChannelId)
    ) {
      if (currentRegisteredChannelId) {
        lane.promotedChannelIds.push(currentRegisteredChannelId);
      }
      lane.candidates.push({
        recallCandidateId: candidateId,
        providerType: item.candidate.provider_type,
        title: item.candidate.title,
        url: item.candidate.url,
        domain: item.plan.context?.domain || null,
        tacticKey: normalizeOptionalText(item.candidate.quality_signal_source),
        benchmarkLike: item.plan.benchmarkLike === true,
        policySignals: item.plan.policySignals ?? {},
        recallScore: item.plan.reviewScore,
        onboardingVerdict: item.plan.onboardingVerdict ?? null,
        productivityRisk: item.plan.productivityRisk ?? null,
        usefulnessDiagnostic: item.plan.usefulnessDiagnostic ?? null,
        stageLossBucket: item.plan.stageLossBucket ?? null,
        sourceFamily: item.plan.sourceFamily ?? null,
        sourceShape: item.plan.sourceShape ?? null,
        decision: "duplicate",
        registeredChannelId: currentRegisteredChannelId,
        registrationFailed: !currentRegisteredChannelId,
      });
      continue;
    }

    if (currentStatus === "rejected" && normalizedCurrentRejectionReason !== "already_registered") {
      lane.candidates.push({
        recallCandidateId: candidateId,
        providerType: item.candidate.provider_type,
        title: item.candidate.title,
        url: item.candidate.url,
        domain: item.plan.context?.domain || null,
        tacticKey: normalizeOptionalText(item.candidate.quality_signal_source),
        benchmarkLike: item.plan.benchmarkLike === true,
        policySignals: item.plan.policySignals ?? {},
        recallScore: item.plan.reviewScore,
        onboardingVerdict: item.plan.onboardingVerdict ?? null,
        productivityRisk: item.plan.productivityRisk ?? null,
        usefulnessDiagnostic: item.plan.usefulnessDiagnostic ?? null,
        stageLossBucket: item.plan.stageLossBucket ?? null,
        sourceFamily: item.plan.sourceFamily ?? null,
        sourceShape: item.plan.sourceShape ?? null,
        decision: "rejected",
        rejectionReason: normalizedCurrentRejectionReason || "not_selected",
      });
      if (
        normalizedCurrentRejectionReason
        && normalizedCurrentRejectionReason !== "below_auto_promotion_threshold"
        && normalizedCurrentRejectionReason !== "candidate_not_valid"
      ) {
        lane.residuals.push({
          recallCandidateId: candidateId,
          providerType: item.candidate.provider_type,
          url: item.candidate.url,
          reason: normalizedCurrentRejectionReason,
        });
      }
      continue;
    }

    if (item.plan.decision === "promotable" && promotionsLeft > 0) {
      const promoted = await postJson(
        `${API_BASE_URL}/maintenance/discovery/recall-candidates/${encodeURIComponent(candidateId)}/promote`,
        {
          reviewedBy: "infra:test-live-discovery-examples",
          enabled: true,
          tags: ["automation", caseDefinition.key],
        }
      );
      promotionsLeft -= 1;
      const channelId = normalizeOptionalText(
        promoted.registered_channel_id ?? promoted.channel_id
      );
      if (channelId) {
        lane.promotedChannelIds.push(channelId);
      }
      const promotedStatus = normalizeText(promoted.status).toLowerCase();
      const registrationFailed = !channelId;
      if (registrationFailed) {
        lane.residuals.push({
          recallCandidateId: candidateId,
          providerType: item.candidate.provider_type,
          url: item.candidate.url,
          reason: "registration_failed",
        });
      }
      lane.candidates.push({
        recallCandidateId: candidateId,
        providerType: item.candidate.provider_type,
        title: item.candidate.title,
        url: item.candidate.url,
        domain: item.plan.context?.domain || null,
        tacticKey: normalizeOptionalText(item.candidate.quality_signal_source),
        benchmarkLike: item.plan.benchmarkLike === true,
        policySignals: item.plan.policySignals ?? {},
        recallScore: item.plan.reviewScore,
        onboardingVerdict: item.plan.onboardingVerdict ?? null,
        productivityRisk: item.plan.productivityRisk ?? null,
        usefulnessDiagnostic: item.plan.usefulnessDiagnostic ?? null,
        stageLossBucket: item.plan.stageLossBucket ?? null,
        sourceFamily: item.plan.sourceFamily ?? null,
        sourceShape: item.plan.sourceShape ?? null,
        decision: promotedStatus === "duplicate" ? "duplicate" : "promoted",
        registeredChannelId: channelId,
        registrationFailed,
      });
      continue;
    }

    const rejectionReason =
      item.plan.decision === "promotable" && promotionsLeft <= 0
        ? "promotion_cap_reached"
        : item.plan.rejectionReason || "not_selected";
    const reviewed = await patchJson(
      `${API_BASE_URL}/maintenance/discovery/recall-candidates/${encodeURIComponent(candidateId)}`,
      {
        status: "rejected",
        reviewedBy: "infra:test-live-discovery-examples",
        rejectionReason,
      }
    );
    lane.candidates.push({
      recallCandidateId: candidateId,
      providerType: item.candidate.provider_type,
      title: item.candidate.title,
      url: item.candidate.url,
      domain: item.plan.context?.domain || null,
      tacticKey: normalizeOptionalText(item.candidate.quality_signal_source),
      benchmarkLike: item.plan.benchmarkLike === true,
      policySignals: item.plan.policySignals ?? {},
      recallScore: item.plan.reviewScore,
      onboardingVerdict: item.plan.onboardingVerdict ?? null,
      productivityRisk: item.plan.productivityRisk ?? null,
      usefulnessDiagnostic: item.plan.usefulnessDiagnostic ?? null,
      stageLossBucket: item.plan.stageLossBucket ?? null,
      sourceFamily: item.plan.sourceFamily ?? null,
      sourceShape: item.plan.sourceShape ?? null,
      decision: "rejected",
      rejectionReason: reviewed.rejection_reason ?? rejectionReason,
    });
    if (rejectionReason !== "below_auto_promotion_threshold") {
      lane.residuals.push({
        recallCandidateId: candidateId,
        providerType: item.candidate.provider_type,
        url: item.candidate.url,
        reason: rejectionReason,
      });
    }
  }

  return lane;
}

function buildCoverageMatrix(caseDefinition, downstreamRows, graphLane, recallLane) {
  const onboardedChannels =
    graphLane.approvedChannelIds.length + recallLane.promotedChannelIds.length;
  const candidateCount = graphLane.candidates.length + recallLane.candidates.length;
  const coveredInterests = new Set();
  for (const row of downstreamRows) {
    for (const interestName of row.coveredInterests) {
      coveredInterests.add(interestName);
    }
  }

  return caseDefinition.interestNames.map((interestName) => {
    let status = "no_viable_live_source_found";
    if (coveredInterests.has(interestName)) {
      status = "covered_downstream";
    } else if (onboardedChannels > 0) {
      status = "source_onboarded_no_match_yet";
    } else if (candidateCount > 0) {
      status = "candidate_found_not_onboarded";
    }
    return {
      interestName,
      status,
    };
  });
}

async function runCase(pool, caseDefinition, startedAtIso) {
  log(`Running live discovery case ${caseDefinition.shortLabel}.`);
  const materializedProfile = await upsertDiscoveryProfile(caseDefinition);
  const baselineLane = await runBaselineLane(pool, caseDefinition, startedAtIso);
  const graphLane = await runGraphLane(pool, caseDefinition, startedAtIso, materializedProfile);
  const recallLane = await runRecallLane(caseDefinition, startedAtIso, materializedProfile);
  const channelIds = [
    ...new Set([...graphLane.approvedChannelIds, ...recallLane.promotedChannelIds].filter(Boolean)),
  ];
  const triggerPolls = await triggerChannelPolls(channelIds);
  const discoveryEvidence = [];
  for (const channelId of channelIds) {
    try {
      const evidence = await waitForChannelEvidence(
        pool,
        channelId,
        startedAtIso,
        caseDefinition.interestNames
      );
      discoveryEvidence.push({
        ...evidence,
        lane: "discovery",
      });
    } catch (error) {
      discoveryEvidence.push({
        channelId,
        lane: "discovery",
        error: error instanceof Error ? error.message : String(error),
        fetchRuns: [],
        articles: [],
        interestFilterResults: [],
        finalSelection: { total: 0, selected: 0 },
        systemFeed: { total: 0, eligible: 0 },
        outboxEvents: [],
        coveredInterests: [],
      });
    }
  }
  const downstreamEvidence = [...baselineLane.evidence, ...discoveryEvidence];
  const contentAnalysisBackfill = await requestContentFilterBackfill(pool, downstreamEvidence);
  const contentAnalysisEvidence = await waitForContentAnalysisEvidence(
    pool,
    downstreamEvidence,
    startedAtIso
  );

  const coverageMatrix = buildCoverageMatrix(
    caseDefinition,
    downstreamEvidence,
    graphLane,
    recallLane
  );
  const candidateCount = graphLane.candidates.length + recallLane.candidates.length;
  const verdicts = determineCaseVerdicts(
    caseDefinition,
    {
      graphLane,
      recallLane,
      baselineLane,
      downstreamEvidence,
      coverageMatrix,
    },
    DISCOVERY_LIVE_DEFAULTS
  );

  return {
    key: caseDefinition.key,
    label: caseDefinition.label,
    packClass: caseDefinition.packClass || "unknown",
    materializedProfile,
    manualReplaySettings: buildManualReplaySettings(caseDefinition, {
      materializedProfile,
      graphMission: graphLane.mission,
      recallMission: recallLane.mission,
    }),
    graphLane,
    recallLane,
    baselineLane,
    triggerPolls: [...baselineLane.triggerPolls, ...triggerPolls],
    discoveryTriggerPolls: triggerPolls,
    baselineEvidence: baselineLane.evidence,
    discoveryEvidence,
    downstreamEvidence,
    contentAnalysisBackfill,
    contentAnalysisEvidence,
    coverageMatrix,
    status: verdicts.status,
    candidateCount,
    laneCompleted: verdicts.runtimeVerdict === "pass",
    downstreamUseful: verdicts.yieldSummary.channelsWithDownstreamEvidence > 0,
    runtimeVerdict: verdicts.runtimeVerdict,
    yieldVerdict: verdicts.yieldVerdict,
    yieldSummary: verdicts.yieldSummary,
    rootCauseClassification: verdicts.rootCauseClassification,
    residuals: [...graphLane.residuals, ...recallLane.residuals],
  };
}

async function main() {
  const runId = randomUUID().slice(0, 8);
  const startedAt = new Date().toISOString();
  const jsonPath = `/tmp/newsportal-live-discovery-examples-${runId}.json`;
  const mdPath = `/tmp/newsportal-live-discovery-examples-${runId}.md`;
  const env = await readEnvFile(".env.dev");
  applyEnv(env);

  const report = {
    runId,
    startedAt,
    enabledCasePacks: {
      runtime: DISCOVERY_RUNTIME_CASE_PACKS.map((casePack) => ({
        key: casePack.key,
        label: casePack.label,
        shortLabel: casePack.shortLabel,
        packClass: casePack.packClass,
      })),
      validation: DISCOVERY_VALIDATION_CASE_PACKS.map((casePack) => ({
        key: casePack.key,
        label: casePack.label,
        shortLabel: casePack.shortLabel,
        packClass: casePack.packClass,
        executionMode: casePack.executionMode,
      })),
    },
    ddgsOnlyGuard: null,
    preconditions: [],
    preflight: [],
    calibration: [],
    calibrationPassed: false,
    discoverySurfaces: null,
    fixtureSeed: null,
    archivedDisposableClasses: [],
    caseRuns: [],
    aggregateYieldDiagnostics: null,
    runtimeVerdict: "fail",
    yieldVerdict: "fail",
    finalVerdict: "fail",
    error: null,
  };
  let pool = null;

  try {
    report.ddgsOnlyGuard = validateDdgsOnlyEnv(env);
    if (report.ddgsOnlyGuard.status !== "passed") {
      report.finalVerdict = "fail";
      throw new Error(`DDGS-only guard failed: ${report.ddgsOnlyGuard.failures.join(" ")}`);
    }

    if (shouldSkipStackReset()) {
      log("Skipping compose stack reset because the parent harness already owns the live stack.");
    } else {
      await ensureComposeStack();
    }
    report.preflight = await runPreflightCommands();
    report.discoverySurfaces = await collectDiscoverySurfaceSnapshots();
    report.archivedDisposableClasses = await archiveDisposableDiscoveryClasses();
    log("Seeding repo-owned discovery proof fixtures through admin-managed truth.");
    report.fixtureSeed = await seedLiveDiscoveryExampleFixtures((message) => {
      log(message.replace(/^\[seed-live-discovery\]\s*/, ""));
    });

    const { getPool } = await loadRuntimeDependencies();
    pool = getPool();
    const preconditionState = await readPreconditionState(pool);
    report.calibration = DISCOVERY_VALIDATION_CASE_PACKS.map((caseDefinition) => ({
      key: caseDefinition.key,
      label: caseDefinition.label,
      ...evaluateCalibration(caseDefinition, DISCOVERY_LIVE_DEFAULTS),
    }));
    report.calibrationPassed = report.calibration.every((item) => item.passed === true);
    report.preconditions = DISCOVERY_RUNTIME_CASE_PACKS.map((caseDefinition) =>
      evaluateCasePreconditions(caseDefinition, preconditionState)
    );
    if (report.preconditions.some((item) => item.status !== "passed")) {
      report.runtimeVerdict = "fail";
      report.yieldVerdict = "fail";
      report.finalVerdict = "precondition_failed";
      throw new Error("Discovery live example preconditions failed.");
    }
    if (report.preflight.some((item) => !preflightStatusSucceeded(item.status))) {
      report.runtimeVerdict = "fail";
      report.yieldVerdict = "fail";
      report.finalVerdict = "fail";
      throw new Error("Discovery live example preflight failed.");
    }

    for (const caseDefinition of DISCOVERY_RUNTIME_CASE_PACKS) {
      const caseRun = await runCase(pool, caseDefinition, startedAt);
      report.caseRuns.push(caseRun);
    }
    report.aggregateYieldDiagnostics = summarizeAggregateRootCauses(report.caseRuns);

    const verdicts = determineRunVerdicts({
      preconditions: report.preconditions,
      preflight: report.preflight,
      caseRuns: report.caseRuns,
    });
    report.runtimeVerdict = verdicts.runtimeVerdict;
    report.yieldVerdict = verdicts.yieldVerdict;
    report.finalVerdict = verdicts.finalVerdict;
    if (
      report.runtimeVerdict === "pass"
      && report.yieldVerdict === "pass"
      && report.calibrationPassed !== true
    ) {
      report.yieldVerdict = "weak";
      report.finalVerdict = "yield_weak";
    }
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    if (pool && typeof pool.end === "function") {
      await pool.end().catch(() => undefined);
    }
    await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await writeFile(mdPath, `${formatDiscoveryEvidenceMarkdown(report)}\n`, "utf8");
    const artifactPointerPath = String(process.env.DISCOVERY_EXAMPLES_ARTIFACT_POINTER_FILE ?? "").trim();
    if (artifactPointerPath) {
      await writeFile(
        artifactPointerPath,
        `${JSON.stringify({ jsonPath, mdPath, finalVerdict: report.finalVerdict }, null, 2)}\n`,
        "utf8"
      );
    }
    log(`Wrote JSON evidence to ${jsonPath}`);
    log(`Wrote Markdown evidence to ${mdPath}`);
  }

  if (report.finalVerdict === "fail" || report.finalVerdict === "precondition_failed") {
    process.exitCode = 1;
  }
}

const isEntrypoint =
  process.argv[1] != null
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
