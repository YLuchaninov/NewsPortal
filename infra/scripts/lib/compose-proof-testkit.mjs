export {
  adminBaseUrl,
  apiBaseUrl,
  assertExpectedStatus,
  assertHtmlContains,
  buildHttpDiagnostics,
  composeArgs,
  createLogger,
  deleteFirebasePasswordUser,
  ensureFirebasePasswordUser,
  extractCookie,
  extractHttpDiagnostics,
  fetchJson,
  getJson,
  nginxBaseUrl,
  parseJsonPayload,
  parseJsonResponse,
  postForm,
  postJson,
  readAllowlistEntries,
  readEnvFile,
  repoRoot,
  requireConfigured,
  runCommand,
  runCompose,
  runComposeCapture,
  selectAdminEmail,
  sendRequest,
  waitFor,
  waitForHttpHealth,
} from "./mcp-http-testkit.mjs";

import {
  runComposeCapture,
  waitFor as waitForBase,
} from "./mcp-http-testkit.mjs";

export function createWaitFor(defaultOptions = {}) {
  return async function waitFor(label, producer, predicate, options = {}) {
    return await waitForBase(label, producer, predicate, {
      ...defaultOptions,
      ...options,
    });
  };
}

export function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function firstResultLine(value) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(
      (line) =>
        line.length > 0 &&
        !/^INSERT\b/iu.test(line) &&
        !/^UPDATE\b/iu.test(line) &&
        !/^DELETE\b/iu.test(line)
    ) ?? "";
}

export function queryPostgres(env, sql) {
  const result = runComposeCapture(
    "exec",
    "-T",
    "postgres",
    "psql",
    "-U",
    env.POSTGRES_USER || "newsportal",
    "-d",
    env.POSTGRES_DB || "newsportal",
    "-At",
    "-F",
    "|",
    "-c",
    sql
  );
  return result.stdout.trim();
}

export function queryPostgresInt(env, sql) {
  const value = firstResultLine(queryPostgres(env, sql));
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected integer query result, got ${value || "<empty>"}.`);
  }
  return parsed;
}

export function queryPostgresRows(env, sql) {
  const output = queryPostgres(env, sql);
  return output
    ? output
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => line.split("|"))
    : [];
}
