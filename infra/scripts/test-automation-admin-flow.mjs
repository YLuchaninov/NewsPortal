import http from "node:http";
import https from "node:https";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { readFile } from "node:fs/promises";

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
const REBUILD_SERVICES = ["migrate", "relay", "worker", "api", "admin"];

function log(message) {
  console.log(`[automation-admin] ${message}`);
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });

  if (result.status !== 0) {
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
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function runCompose(...args) {
  runCommand("docker", [...composeArgs, ...args]);
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

function requireConfigured(env, key) {
  const value = String(process.env[key] ?? env[key] ?? "").trim();
  if (!value || value === "replace-me") {
    throw new Error(`.env.dev must set ${key} before automation admin acceptance can run.`);
  }
  return value;
}

function parseJsonResponse(text, responseMeta) {
  const json = text ? JSON.parse(text) : null;
  if (responseMeta.status < 200 || responseMeta.status >= 300) {
    const message =
      typeof json?.error === "string"
        ? json.error
        : `HTTP ${responseMeta.status} ${responseMeta.statusText}`;
    throw new Error(message);
  }
  return json;
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

function extractCookie(setCookies) {
  const cookie = Array.isArray(setCookies) ? setCookies[0] : setCookies;
  if (!cookie) {
    throw new Error("Expected Set-Cookie header but none was returned.");
  }
  return cookie.split(";")[0];
}

async function postForm(url, payload, { cookie } = {}) {
  const target = new URL(url);
  const body = new URLSearchParams(
    Object.entries(payload).map(([key, value]) => [key, String(value)])
  ).toString();
  const response = await sendRequest(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Origin: target.origin,
      Referer: `${target.origin}/`,
      ...(cookie ? { Cookie: cookie } : {}),
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(body).toString(),
    },
    body,
    timeoutMs: 15000,
  });

  return {
    cookie: response.headers["set-cookie"] ? extractCookie(response.headers["set-cookie"]) : null,
    json: parseJsonResponse(response.text, response),
  };
}

async function assertHtmlContains(url, snippets, { cookie } = {}) {
  const response = await sendRequest(url, {
    headers: cookie ? { Cookie: cookie } : {},
    timeoutMs: 15000,
  });
  if (response.status !== 200) {
    throw new Error(`Expected ${url} to respond with 200, got ${response.status}.`);
  }
  for (const snippet of snippets) {
    if (!response.text.includes(snippet)) {
      throw new Error(`Expected HTML from ${url} to include ${snippet}.`);
    }
  }
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
      const response = await sendRequest(url);
      if (response.status !== 200) {
        throw new Error(`${label} responded with ${response.status}.`);
      }
      return true;
    },
    Boolean
  );
}

async function ensureComposeStack() {
  log("Ensuring compose stack is available for automation-admin acceptance.");
  log("Rebuilding the automation admin services so compose uses the current workspace code.");
  runCompose("build", ...REBUILD_SERVICES);
  runCompose("up", "-d", ...STACK_SERVICES);
  await Promise.all([
    waitForHttpHealth("api", "http://127.0.0.1:8000/health"),
    waitForHttpHealth("admin", "http://127.0.0.1:4322/api/health"),
    waitForHttpHealth("nginx", "http://127.0.0.1:8080/health"),
  ]);
}

function readAllowlistEntries(env) {
  return String(env.ADMIN_ALLOWLIST_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function buildAdminAliasEmail(email, runId) {
  const atIndex = email.lastIndexOf("@");
  if (atIndex <= 0 || atIndex === email.length - 1) {
    return email;
  }
  return `${email.slice(0, atIndex)}+automation-admin-${runId}${email.slice(atIndex)}`;
}

function selectAdminEmail(allowlistEntries, runId) {
  const domainEntry = allowlistEntries.find((entry) => entry.startsWith("@"));
  if (domainEntry) {
    return `automation-admin-${runId}${domainEntry}`;
  }
  const explicitEmail = allowlistEntries[0];
  if (!explicitEmail) {
    throw new Error("ADMIN_ALLOWLIST_EMAILS must include at least one email or @domain entry.");
  }
  return buildAdminAliasEmail(explicitEmail, runId);
}

async function ensureFirebasePasswordUser(apiKey, email, password) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    }
  );

  const payload = await response.json();
  if (!response.ok) {
    const errorMessage = String(payload?.error?.message ?? "unknown");
    if (errorMessage !== "EMAIL_EXISTS") {
      throw new Error(`Firebase admin bootstrap failed: ${errorMessage}`);
    }
  }
}

async function signInAdmin(adminBaseUrl, email, password) {
  const signIn = await postForm(`${adminBaseUrl}/bff/auth/sign-in`, {
    email,
    password,
    next: "/automation",
  });
  const sessionCookie = signIn.cookie;
  if (!sessionCookie) {
    throw new Error("Expected admin sign-in to return a session cookie.");
  }
  return sessionCookie;
}

async function main() {
  const env = await readEnvFile(".env.dev");
  const runId = randomUUID();
  const firebaseApiKey = requireConfigured(env, "FIREBASE_WEB_API_KEY");
  const adminPassword = `Automation!${runId.slice(0, 12)}`;
  const adminEmail = selectAdminEmail(readAllowlistEntries(env), runId);
  const adminBaseUrl = "http://127.0.0.1:4322";
  const automationUrl = `${adminBaseUrl}/automation`;
  let workerStopped = false;

  await ensureComposeStack();
  await ensureFirebasePasswordUser(firebaseApiKey, adminEmail, adminPassword);

  log("Signing in through the admin app.");
  const adminCookie = await signInAdmin(adminBaseUrl, adminEmail, adminPassword);

  log("Preflighting the automation surface.");
  await assertHtmlContains(
    automationUrl,
    [
      "Build, run, and tune automations from one visual control room",
      "Workflow Library",
      "Recent Outbox",
    ],
    { cookie: adminCookie }
  );

  const sequenceTitle = `Admin automation acceptance ${runId}`;
  log("Creating a new sequence through the admin surface.");
  const createResult = await postForm(
    `${adminBaseUrl}/bff/admin/automation`,
    {
      intent: "create_sequence",
      title: sequenceTitle,
      description: "Stage 3 operator acceptance sequence",
      status: "draft",
      tags: "ops,acceptance",
      taskGraph: JSON.stringify(
        [
          {
            key: "normalize",
            module: "article.normalize",
            options: {},
          },
        ],
        null,
        2
      ),
    },
    { cookie: adminCookie }
  );
  const sequenceId = String(createResult.json.sequence_id ?? "");
  if (!sequenceId) {
    throw new Error("Sequence creation did not return a sequence_id.");
  }

  const updatedTitle = `${sequenceTitle} updated`;
  log("Updating the sequence through the admin surface.");
  const updateResult = await postForm(
    `${adminBaseUrl}/bff/admin/automation`,
    {
      intent: "update_sequence",
      sequenceId,
      title: updatedTitle,
      description: "Updated from admin acceptance",
      status: "active",
      triggerEvent: "",
      cron: "",
      maxRuns: "",
      tags: "ops,acceptance,updated",
      taskGraph: JSON.stringify(
        [
          {
            key: "normalize",
            module: "article.normalize",
            options: {},
          },
        ],
        null,
        2
      ),
    },
    { cookie: adminCookie }
  );
  if (String(updateResult.json.title ?? "") !== updatedTitle) {
    throw new Error("Sequence update did not persist the new title.");
  }
  await assertHtmlContains(
    `${adminBaseUrl}/automation/${sequenceId}`,
    [updatedTitle, "Visual Workflow Builder", "Run Now"],
    { cookie: adminCookie }
  );

  log("Stopping the worker so the new run remains cancellable.");
  runCompose("stop", "worker");
  workerStopped = true;

  log("Requesting a pending sequence run through the admin surface.");
  const runResult = await postForm(
    `${adminBaseUrl}/bff/admin/automation`,
    {
      intent: "run_sequence",
      sequenceId,
      contextJson: "{}",
      triggerMeta: '{"sourceEventId":"automation-admin-acceptance"}',
    },
    { cookie: adminCookie }
  );
  const runIdText = String(runResult.json.run_id ?? "");
  if (!runIdText) {
    throw new Error("Run request did not return a run_id.");
  }
  if (String(runResult.json.status ?? "") !== "pending") {
    throw new Error(`Expected pending run status, received ${String(runResult.json.status ?? "unknown")}.`);
  }

  const executionsUrl = `${adminBaseUrl}/automation/${sequenceId}/executions`;

  await assertHtmlContains(
    executionsUrl,
    [updatedTitle, runIdText, "Selected Run"],
    { cookie: adminCookie }
  );

  log("Cancelling the pending run through the admin surface.");
  const cancelResult = await postForm(
    `${adminBaseUrl}/bff/admin/automation`,
    {
      intent: "cancel_run",
      runId: runIdText,
      reason: "Cancelled via automation admin acceptance.",
    },
    { cookie: adminCookie }
  );
  if (String(cancelResult.json.status ?? "") !== "cancelled") {
    throw new Error("Run cancellation did not return cancelled status.");
  }

  log("Archiving the sequence through the admin surface.");
  const archiveResult = await postForm(
    `${adminBaseUrl}/bff/admin/automation`,
    {
      intent: "archive_sequence",
      sequenceId,
    },
    { cookie: adminCookie }
  );
  if (String(archiveResult.json.status ?? "") !== "archived") {
    throw new Error("Sequence archive did not return archived status.");
  }

  log("Creating a reindex job to prove outbox visibility on the automation page.");
  const reindexResult = await postForm(
    `${adminBaseUrl}/bff/admin/reindex`,
    {
      indexName: "interest_centroids",
      jobKind: "rebuild",
    },
    { cookie: adminCookie }
  );
  const reindexJobId = String(reindexResult.json.reindexJobId ?? "");
  if (!reindexJobId) {
    throw new Error("Reindex request did not return a reindexJobId.");
  }

  await waitFor(
    "automation outbox row",
    async () => {
      const response = await sendRequest(automationUrl, {
        headers: { Cookie: adminCookie },
      });
      if (response.status !== 200) {
        throw new Error(`Automation page returned ${response.status}.`);
      }
      return response.text;
    },
    (html) =>
      html.includes("reindex.requested") &&
      html.includes(reindexJobId) &&
      html.includes(runIdText) &&
      html.includes("cancelled")
  );

  log("Restarting the worker after the cancellable-run proof.");
  runCompose("up", "-d", "worker");
  workerStopped = false;

  console.log(
    JSON.stringify(
      {
        status: "automation-admin-ok",
        sequenceId,
        updatedTitle,
        runId: runIdText,
        reindexJobId,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    try {
      runCompose("up", "-d", "worker");
    } catch {
      // Best effort cleanup; the main failure should stay visible.
    }
  });
