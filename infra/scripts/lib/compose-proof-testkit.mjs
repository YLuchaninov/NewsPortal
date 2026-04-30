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

import { waitFor as waitForBase } from "./mcp-http-testkit.mjs";

export function createWaitFor(defaultOptions = {}) {
  return async function waitFor(label, producer, predicate, options = {}) {
    return await waitForBase(label, producer, predicate, {
      ...defaultOptions,
      ...options,
    });
  };
}
