import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { validateProdEnvText } from "../../../infra/scripts/checks/check-prod-env.mjs";

function validProdEnv(overrides: Record<string, string> = {}): string {
  const values: Record<string, string> = {
    POSTGRES_DB: "signalops",
    POSTGRES_USER: "signalops",
    POSTGRES_PASSWORD: "very-strong-db-password",
    SIGNALOPS_PUBLIC_API_BASE_URL: "https://api.example.test",
    SIGNALOPS_WEB_APP_BASE_URL: "https://app.example.test/",
    SIGNALOPS_ADMIN_APP_BASE_URL: "https://app.example.test/admin/",
    SIGNALOPS_COOKIE_SECURE_POLICY: "always",
    SIGNALOPS_API_CONTENT_AUTH_REQUIRED: "true",
    SIGNALOPS_WEB_TEST_AUTH_ENABLED: "false",
    SIGNALOPS_WEB_GOOGLE_CLIENT_ID: "client.apps.googleusercontent.com",
    FIREBASE_PROJECT_ID: "signalops-beta",
    FIREBASE_WEB_API_KEY: "firebase-web-key",
    FIREBASE_CLIENT_CONFIG: JSON.stringify({ apiKey: "firebase-web-key", projectId: "signalops-beta" }),
    FIREBASE_ADMIN_CREDENTIALS: JSON.stringify({
      project_id: "signalops-beta",
      client_email: "firebase-admin@example.test",
      private_key: "escaped-private-key",
    }),
    ADMIN_ALLOWLIST_EMAILS: "admin@example.test",
    GEMINI_API_KEY: "gemini-key",
    GEMINI_MODEL: "gemini-3.1-flash-lite",
    GEMINI_BASE_URL: "https://generativelanguage.googleapis.com/v1beta",
    EMAIL_DIGEST_SMTP_URL: "smtps://smtp.example.test:465",
    EMAIL_DIGEST_FROM: "alerts@example.test",
    WEB_PUSH_VAPID_PUBLIC_KEY: "public-vapid-key",
    WEB_PUSH_VAPID_PRIVATE_KEY: "private-vapid-key",
    WEB_PUSH_VAPID_SUBJECT: "mailto:alerts@example.test",
    PUBLIC_API_SIGNING_KEY: "public-api-signing-key-with-32-chars",
    APP_SECRET: "app-secret-with-at-least-32-characters",
    EMAIL_IMAP_PROD_RUNTIME_REQUIRED: "false",
    ...overrides,
  };
  return Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

test("prod env validator accepts hardened beta settings", () => {
  const result = validateProdEnvText(validProdEnv());

  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
});

test("prod env validator rejects placeholders and unsafe beta auth settings", () => {
  const result = validateProdEnvText(
    validProdEnv({
      APP_SECRET: "replace-me",
      SIGNALOPS_API_CONTENT_AUTH_REQUIRED: "false",
      SIGNALOPS_COOKIE_SECURE_POLICY: "auto",
      ADMIN_ALLOWLIST_EMAILS: "admin@example.com,@signalops.local",
    })
  );

  assert.equal(result.ok, false);
  assert.match(result.issues.join("\n"), /APP_SECRET/);
  assert.match(result.issues.join("\n"), /SIGNALOPS_API_CONTENT_AUTH_REQUIRED/);
  assert.match(result.issues.join("\n"), /SIGNALOPS_COOKIE_SECURE_POLICY/);
  assert.match(result.issues.join("\n"), /ADMIN_ALLOWLIST_EMAILS/);
});

test("beta static guards pass for route exposure and control-plane ownership", () => {
  for (const script of [
    "infra/scripts/checks/check-beta-route-exposure.mjs",
    "infra/scripts/checks/check-control-plane-ownership.mjs",
  ]) {
    const result = spawnSync("node", [script], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    assert.equal(result.status, 0, `${script}\n${result.stdout}\n${result.stderr}`);
  }
});
