import http from "node:http";
import https from "node:https";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(scriptDir, "..", "..", "..");

export const composeArgs = [
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
  "mcp",
  "nginx",
];

const REBUILD_SERVICES = ["migrate", "relay", "worker", "api", "admin", "mcp"];

export const adminBaseUrl = "http://127.0.0.1:4322";
export const apiBaseUrl = "http://127.0.0.1:8000";
export const nginxBaseUrl = "http://127.0.0.1:8080";
export const mcpBaseUrl = `${nginxBaseUrl}/mcp`;

function stringifyError(error) {
  return error instanceof Error ? error.message : String(error);
}

function readHeader(headers, name) {
  const raw = headers?.[name.toLowerCase()];
  if (Array.isArray(raw)) {
    return raw.join(", ");
  }
  return typeof raw === "string" ? raw : "";
}

function truncateBodyPreview(text, maxLength = 400) {
  const normalized = String(text ?? "").replace(/\s+/gu, " ").trim();
  if (!normalized) {
    return "";
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function detectBodyKind(contentType, text) {
  const normalizedContentType = String(contentType ?? "").toLowerCase();
  const normalizedText = String(text ?? "").trim().toLowerCase();
  if (!normalizedText) {
    return "empty";
  }
  if (
    normalizedContentType.includes("json") ||
    normalizedText.startsWith("{") ||
    normalizedText.startsWith("[")
  ) {
    return "json";
  }
  if (
    normalizedContentType.includes("html") ||
    normalizedText.startsWith("<!doctype html") ||
    normalizedText.startsWith("<html") ||
    normalizedText.startsWith("<body")
  ) {
    return "html";
  }
  return "text";
}

function inferSourceHint(url, contentType, bodyPreview, status) {
  const host = new URL(url).host.toLowerCase();
  const localHost = host.startsWith("127.0.0.1") || host.startsWith("localhost");
  const normalizedPreview = String(bodyPreview ?? "").toLowerCase();
  const normalizedContentType = String(contentType ?? "").toLowerCase();
  const upstreamChallengeLikely =
    normalizedContentType.includes("html") &&
    /attention required|just a moment|verify you are human|captcha|cloudflare|akamai|access denied|incapsula/u.test(
      normalizedPreview
    );
  const gatewayResidualLikely =
    normalizedContentType.includes("html") &&
    (status === 502 ||
      status === 503 ||
      status === 504 ||
      /bad gateway|gateway timeout|temporarily unavailable|upstream/u.test(normalizedPreview));

  if (upstreamChallengeLikely) {
    return "external-upstream-challenge-likely";
  }
  if (gatewayResidualLikely) {
    return localHost ? "newsportal-gateway-upstream-html" : "external-gateway-html";
  }
  if (localHost && normalizedContentType.includes("html")) {
    return "newsportal-boundary-html";
  }
  if (localHost) {
    return "newsportal-boundary-json-or-text";
  }
  return "external-upstream";
}

function buildDiagnosticError(message, diagnostics, cause) {
  const error = new Error(message);
  error.name = "HttpDiagnosticError";
  if (cause) {
    error.cause = cause;
  }
  error.httpDiagnostics = diagnostics;
  return error;
}

function toDiagnosticJson(value) {
  if (value == null) {
    return null;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return {
      value: String(value),
    };
  }
}

function buildMcpDiagnosticError(message, diagnostics) {
  const error = new Error(message);
  error.name = "McpDiagnosticError";
  error.mcpDiagnostics = diagnostics;
  return error;
}

export function createLogger(prefix) {
  return (message) => {
    console.log(`[${prefix}] ${message}`);
  };
}

export function runCommand(command, args, options = {}) {
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

export function runCompose(...args) {
  return runCommand("docker", [...composeArgs, ...args]);
}

export async function readEnvFile(relativePath) {
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

export function requireConfigured(env, key) {
  const value = String(process.env[key] ?? env[key] ?? "").trim();
  if (!value || value === "replace-me") {
    throw new Error(`.env.dev must set ${key} before MCP HTTP proof can run.`);
  }
  return value;
}

export function parseJsonResponse(text, responseMeta) {
  const json = parseJsonPayload(text, responseMeta);
  if (responseMeta.status < 200 || responseMeta.status >= 300) {
    const message =
      typeof json?.error === "string"
        ? json.error
        : typeof json?.error?.message === "string"
          ? json.error.message
          : `HTTP ${responseMeta.status} ${responseMeta.statusText}`;
    throw new Error(message);
  }
  return json;
}

export function buildHttpDiagnostics(
  { url, method = "GET" },
  response,
  { bodyPreviewLength = 400 } = {}
) {
  const contentType = readHeader(response.headers, "content-type");
  const bodyPreview = truncateBodyPreview(response.text, bodyPreviewLength);
  return {
    requestUrl: url,
    requestMethod: method,
    status: response.status,
    statusText: response.statusText,
    contentType: contentType || null,
    contentLength: String(response.text ?? "").length,
    bodyKind: detectBodyKind(contentType, response.text),
    bodyPreview: bodyPreview || null,
    location: readHeader(response.headers, "location") || null,
    server: readHeader(response.headers, "server") || null,
    sourceHint: inferSourceHint(url, contentType, bodyPreview, response.status),
  };
}

export function parseJsonPayload(text, responseMeta, requestMeta = {}) {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    const diagnostics = buildHttpDiagnostics(
      {
        url: requestMeta.url ?? "unknown",
        method: requestMeta.method ?? "GET",
      },
      responseMeta
    );
    throw buildDiagnosticError(
      `Expected JSON from ${diagnostics.requestMethod} ${diagnostics.requestUrl}, got ${diagnostics.bodyKind} body (HTTP ${diagnostics.status}).`,
      diagnostics,
      error
    );
  }
}

export function assertExpectedStatus(response, expectStatus, requestMeta = {}) {
  if (!expectStatus || response.status === expectStatus) {
    return;
  }
  const diagnostics = buildHttpDiagnostics(
    {
      url: requestMeta.url ?? "unknown",
      method: requestMeta.method ?? "GET",
    },
    response
  );
  throw buildDiagnosticError(
    `Expected ${diagnostics.requestMethod} ${diagnostics.requestUrl} to return ${expectStatus}, got ${diagnostics.status}.`,
    diagnostics
  );
}

export function extractHttpDiagnostics(error) {
  const diagnostics =
    error && typeof error === "object" && "httpDiagnostics" in error
      ? error.httpDiagnostics
      : null;
  if (!diagnostics || typeof diagnostics !== "object") {
    return null;
  }
  return {
    requestUrl: diagnostics.requestUrl ?? null,
    requestMethod: diagnostics.requestMethod ?? null,
    status: diagnostics.status ?? null,
    statusText: diagnostics.statusText ?? null,
    contentType: diagnostics.contentType ?? null,
    contentLength: diagnostics.contentLength ?? null,
    bodyKind: diagnostics.bodyKind ?? null,
    bodyPreview: diagnostics.bodyPreview ?? null,
    location: diagnostics.location ?? null,
    server: diagnostics.server ?? null,
    sourceHint: diagnostics.sourceHint ?? null,
  };
}

export function extractMcpDiagnostics(error) {
  const diagnostics =
    error && typeof error === "object" && "mcpDiagnostics" in error
      ? error.mcpDiagnostics
      : null;
  if (!diagnostics || typeof diagnostics !== "object") {
    return null;
  }
  return {
    rpcMethod: diagnostics.rpcMethod ?? null,
    toolName: diagnostics.toolName ?? null,
    promptName: diagnostics.promptName ?? null,
    resourceUri: diagnostics.resourceUri ?? null,
    errorCode: diagnostics.errorCode ?? null,
    errorMessage: diagnostics.errorMessage ?? null,
    errorData: toDiagnosticJson(diagnostics.errorData),
    requestArgs: toDiagnosticJson(diagnostics.requestArgs),
    response: toDiagnosticJson(diagnostics.response),
  };
}

export async function sendRequest(
  url,
  { method = "GET", headers = {}, body = "", timeoutMs = 10000 } = {}
) {
  const target = new URL(url);
  const client = target.protocol === "https:" ? https : http;

  return await new Promise((resolve, reject) => {
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

export async function postForm(url, payload, { cookie } = {}) {
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

export async function postJson(
  url,
  payload,
  { cookie, bearerToken, expectStatus, timeoutMs = 20000 } = {}
) {
  const target = new URL(url);
  const body = JSON.stringify(payload);
  const response = await sendRequest(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Origin: target.origin,
      Referer: `${target.origin}/`,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body).toString(),
    },
    body,
    timeoutMs,
  });

  assertExpectedStatus(response, expectStatus, {
    url,
    method: "POST",
  });

  return {
    status: response.status,
    json: parseJsonPayload(response.text, response, {
      url,
      method: "POST",
    }),
    headers: response.headers,
    text: response.text,
  };
}

export async function getJson(url, { cookie, bearerToken, expectStatus, timeoutMs = 15000 } = {}) {
  const response = await sendRequest(url, {
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
      Accept: "application/json",
    },
    timeoutMs,
  });

  assertExpectedStatus(response, expectStatus, {
    url,
    method: "GET",
  });

  return {
    status: response.status,
    json: parseJsonPayload(response.text, response, {
      url,
      method: "GET",
    }),
    headers: response.headers,
    text: response.text,
  };
}

export async function assertHtmlContains(url, snippets, { cookie } = {}) {
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
  return response.text;
}

export async function waitFor(
  label,
  producer,
  predicate,
  { timeoutMs = 60000, intervalMs = 1500 } = {}
) {
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

export async function waitForHttpHealth(label, url) {
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

export async function ensureComposeStack(logger, { rebuild = true } = {}) {
  if (rebuild) {
    logger("Rebuilding MCP-related services.");
    runCompose("build", ...REBUILD_SERVICES);
  }
  logger("Starting compose stack.");
  runCompose("up", "-d", ...STACK_SERVICES);
  await Promise.all([
    waitForHttpHealth("api", `${apiBaseUrl}/health`),
    waitForHttpHealth("admin", `${adminBaseUrl}/api/health`),
    waitForHttpHealth("mcp", "http://127.0.0.1:4300/health"),
    waitForHttpHealth("nginx", `${nginxBaseUrl}/health`),
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
  return `${email.slice(0, atIndex)}+mcp-admin-${runId}${email.slice(atIndex)}`;
}

function selectAdminEmail(allowlistEntries, runId) {
  const domainEntry = allowlistEntries.find((entry) => entry.startsWith("@"));
  if (domainEntry) {
    return `mcp-admin-${runId}${domainEntry}`;
  }

  const explicitEmail = allowlistEntries[0];
  if (!explicitEmail) {
    throw new Error("ADMIN_ALLOWLIST_EMAILS must include at least one email or @domain entry.");
  }
  return buildAdminAliasEmail(explicitEmail, runId);
}

export async function signInFirebasePasswordUser(apiKey, email, password) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
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
    throw new Error(`Firebase password sign-in failed: ${payload?.error?.message ?? "unknown"}`);
  }

  return payload;
}

export async function ensureFirebasePasswordUser(apiKey, email, password) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      returnSecureToken: true,
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    const errorMessage = String(payload?.error?.message ?? "unknown");
    if (errorMessage !== "EMAIL_EXISTS") {
      throw new Error(`Firebase admin bootstrap failed: ${errorMessage}`);
    }
  }
}

export async function deleteFirebasePasswordUser(apiKey, email, password) {
  const session = await signInFirebasePasswordUser(apiKey, email, password);
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      idToken: session.idToken,
    }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(
      `Firebase password user cleanup failed: ${payload?.error?.message ?? response.status}`
    );
  }
}

export async function signInAdmin(email, password) {
  const signIn = await postForm(`${adminBaseUrl}/bff/auth/sign-in`, {
    email,
    password,
    next: "/automation/mcp",
  });
  const sessionCookie = signIn.cookie;
  if (!sessionCookie) {
    throw new Error("Expected admin sign-in to return a session cookie.");
  }
  return sessionCookie;
}

export async function issueMcpToken(adminCookie, payload) {
  const result = await postJson(
    `${adminBaseUrl}/bff/admin/mcp-tokens`,
    {
      intent: "issue",
      ...payload,
    },
    {
      cookie: adminCookie,
      expectStatus: 201,
    }
  );
  if (!result.json?.token || !result.json?.tokenRecord?.tokenId) {
    throw new Error("MCP token issuance did not return the expected payload.");
  }
  return result.json;
}

export async function revokeMcpToken(adminCookie, tokenId) {
  const result = await postJson(
    `${adminBaseUrl}/bff/admin/mcp-tokens`,
    {
      intent: "revoke",
      tokenId,
    },
    {
      cookie: adminCookie,
      expectStatus: 200,
    }
  );
  if (String(result.json?.tokenRecord?.status ?? "") !== "revoked") {
    throw new Error("MCP token revoke did not return a revoked token record.");
  }
  return result.json;
}

function createCoverageTracker() {
  return {
    rpcMethods: new Set(),
    tools: new Set(),
    resources: new Set(),
    prompts: new Set(),
  };
}

function snapshotCoverage(coverage) {
  return {
    rpcMethods: Array.from(coverage.rpcMethods).sort(),
    tools: Array.from(coverage.tools).sort(),
    resources: Array.from(coverage.resources).sort(),
    prompts: Array.from(coverage.prompts).sort(),
  };
}

export function extractObjectArrays(value, found = []) {
  if (!value || typeof value !== "object") {
    return found;
  }

  if (Array.isArray(value)) {
    if (value.every((entry) => entry && typeof entry === "object" && !Array.isArray(entry))) {
      found.push(value);
    }
    for (const entry of value) {
      extractObjectArrays(entry, found);
    }
    return found;
  }

  for (const nestedValue of Object.values(value)) {
    extractObjectArrays(nestedValue, found);
  }
  return found;
}

export function extractFirstObjectRow(value) {
  const arrays = extractObjectArrays(value);
  for (const array of arrays) {
    if (array.length > 0) {
      return array[0];
    }
  }
  return null;
}

export function readIdentifier(value, candidateKeys) {
  if (!value || typeof value !== "object") {
    return "";
  }
  for (const key of candidateKeys) {
    const raw = value[key];
    const normalized = String(raw ?? "").trim();
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

export function toIsoForDatetimeLocal(value) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return "";
  }
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return normalized;
  }
  return date.toISOString();
}

export function createHarness({ logPrefix = "mcp-http-proof" } = {}) {
  const log = createLogger(logPrefix);
  const coverage = createCoverageTracker();
  const cleanupQueue = [];
  const tokenRecords = [];
  const entities = {};
  const scenarioResults = [];
  const runId = randomUUID();

  const state = {
    env: null,
    firebaseApiKey: "",
    adminEmail: "",
    adminPassword: "",
    adminCookie: "",
    workerStopped: false,
    shippedInventory: {
      tools: [],
      resources: [],
      prompts: [],
    },
    coverage,
    cleanupQueue,
    tokenRecords,
    entities,
    scenarioResults,
    runId,
  };

  return {
    ...state,
    log,
    async setup({ rebuild = true } = {}) {
      state.env = await readEnvFile(".env.dev");
      state.firebaseApiKey = requireConfigured(state.env, "FIREBASE_WEB_API_KEY");
      state.adminPassword = `McpHttp!${runId.slice(0, 10)}`;
      state.adminEmail = selectAdminEmail(readAllowlistEntries(state.env), runId);

      await ensureComposeStack(log, { rebuild });
      await ensureFirebasePasswordUser(state.firebaseApiKey, state.adminEmail, state.adminPassword);
      state.adminCookie = await signInAdmin(state.adminEmail, state.adminPassword);
      return this;
    },
    async cleanup() {
      for (let index = cleanupQueue.length - 1; index >= 0; index -= 1) {
        const item = cleanupQueue[index];
        try {
          await item.run();
        } catch (error) {
          log(`Cleanup warning for ${item.label}: ${stringifyError(error)}`);
        }
      }

      if (state.workerStopped) {
        runCompose("start", "worker");
        state.workerStopped = false;
      }

      await deleteFirebasePasswordUser(
        state.firebaseApiKey,
        state.adminEmail,
        state.adminPassword
      ).catch(() => false);
    },
    addCleanup(label, run) {
      cleanupQueue.push({ label, run });
    },
    rememberEntity(key, value) {
      entities[key] = value;
      return value;
    },
    getEntity(key) {
      return entities[key];
    },
    recordScenario(result) {
      scenarioResults.push(result);
    },
    getCoverage() {
      return snapshotCoverage(coverage);
    },
    async assertAdminHtml(snippets) {
      return await assertHtmlContains(`${adminBaseUrl}/automation/mcp`, snippets, {
        cookie: state.adminCookie,
      });
    },
    async issueToken(payload) {
      const issued = await issueMcpToken(state.adminCookie, payload);
      tokenRecords.push({
        label: issued.tokenRecord.label,
        token: issued.token,
        ...issued.tokenRecord,
      });
      return {
        token: issued.token,
        tokenRecord: issued.tokenRecord,
      };
    },
    async revokeToken(tokenId) {
      return await revokeMcpToken(state.adminCookie, tokenId);
    },
    async mcpRpc(token, method, params = {}, options = {}) {
      coverage.rpcMethods.add(String(method));
      return (
        await postJson(
          mcpBaseUrl,
          {
            jsonrpc: "2.0",
            id: randomUUID(),
            method,
            params,
          },
          {
            bearerToken: token,
            expectStatus: options.expectStatus,
            timeoutMs: options.timeoutMs,
          }
        )
      ).json;
    },
    async mcpToolCall(token, name, args = {}, options = {}) {
      coverage.tools.add(String(name));
      const response = await this.mcpRpc(
        token,
        "tools/call",
        {
          name,
          arguments: args,
        },
        options
      );
      if (options.expectError) {
        return response;
      }
      if (response?.error) {
        const errorMessage =
          typeof response.error.message === "string"
            ? response.error.message
            : `MCP tool ${name} returned an error response.`;
        throw buildMcpDiagnosticError(
          `MCP tool ${name} failed. ${errorMessage}`,
          {
            rpcMethod: "tools/call",
            toolName: name,
            errorCode: response.error.code ?? null,
            errorMessage,
            errorData: response.error.data ?? null,
            requestArgs: args,
            response,
          }
        );
      }
      if (!response?.result?.structuredContent) {
        throw buildMcpDiagnosticError(
          `MCP tool ${name} did not return structuredContent.`,
          {
            rpcMethod: "tools/call",
            toolName: name,
            requestArgs: args,
            response,
          }
        );
      }
      return response.result.structuredContent;
    },
    async mcpResourceRead(token, uri, options = {}) {
      coverage.resources.add(String(uri));
      return await this.mcpRpc(
        token,
        "resources/read",
        {
          uri,
        },
        options
      );
    },
    async mcpPromptGet(token, name, args = {}, options = {}) {
      coverage.prompts.add(String(name));
      return await this.mcpRpc(
        token,
        "prompts/get",
        {
          name,
          arguments: args,
        },
        options
      );
    },
    async getMcpSummary(token) {
      return await getJson(mcpBaseUrl, {
        bearerToken: token,
      });
    },
    async postMcpRaw(token, payload, options = {}) {
      return await postJson(mcpBaseUrl, payload, {
        bearerToken: token,
        expectStatus: options.expectStatus,
        timeoutMs: options.timeoutMs,
      });
    },
    async queryPostgres(sql) {
      const result = runCommand(
        "docker",
        [
          ...composeArgs,
          "exec",
          "-T",
          "postgres",
          "psql",
          "-U",
          state.env?.POSTGRES_USER || "newsportal",
          "-d",
          state.env?.POSTGRES_DB || "newsportal",
          "-At",
          "-F",
          "|",
          "-c",
          sql,
        ],
        {
          capture: true,
        }
      );

      return result.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => !/^(INSERT|UPDATE|DELETE) \d+( \d+)?$/u.test(line))
        .join("\n")
        .trim();
    },
    async stopWorker() {
      if (!state.workerStopped) {
        runCompose("stop", "worker");
        state.workerStopped = true;
      }
    },
    async startWorker() {
      if (state.workerStopped) {
        runCompose("start", "worker");
        state.workerStopped = false;
      }
    },
    async writeArtifacts(baseName, report, markdown) {
      const jsonPath = `/tmp/${baseName}-${runId}.json`;
      const mdPath = `/tmp/${baseName}-${runId}.md`;
      await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
      await writeFile(mdPath, `${markdown}\n`, "utf8");
      return {
        jsonPath,
        mdPath,
      };
    },
  };
}
