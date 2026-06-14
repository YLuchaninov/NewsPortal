import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = process.cwd();
const PLACEHOLDER_VALUES = new Set(["", "replace-me", "change-me", "{}", "[]"]);
const REQUIRED_NON_PLACEHOLDER_KEYS = [
  "POSTGRES_DB",
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "SIGNALOPS_PUBLIC_API_BASE_URL",
  "SIGNALOPS_WEB_APP_BASE_URL",
  "SIGNALOPS_ADMIN_APP_BASE_URL",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_WEB_API_KEY",
  "FIREBASE_CLIENT_CONFIG",
  "FIREBASE_ADMIN_CREDENTIALS",
  "ADMIN_ALLOWLIST_EMAILS",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "GEMINI_BASE_URL",
  "EMAIL_DIGEST_SMTP_URL",
  "EMAIL_DIGEST_FROM",
  "WEB_PUSH_VAPID_PUBLIC_KEY",
  "WEB_PUSH_VAPID_PRIVATE_KEY",
  "WEB_PUSH_VAPID_SUBJECT",
  "PUBLIC_API_SIGNING_KEY",
  "APP_SECRET",
];
const BOOLEAN_KEYS = new Set([
  "SIGNALOPS_API_CONTENT_AUTH_REQUIRED",
  "SIGNALOPS_WEB_TEST_AUTH_ENABLED",
  "EMAIL_IMAP_PROD_RUNTIME_REQUIRED",
]);

export function parseEnvText(text) {
  const values = new Map();
  const issues = [];
  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    if (separator <= 0) {
      issues.push(`line ${index + 1} is not KEY=value syntax.`);
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
      issues.push(`line ${index + 1} has invalid env key "${key}".`);
      continue;
    }
    if (values.has(key)) {
      issues.push(`line ${index + 1} duplicates env key "${key}".`);
      continue;
    }
    values.set(key, value);
  }
  return { values, issues };
}

function hasValue(values, key) {
  if (!values.has(key)) {
    return false;
  }
  const value = String(values.get(key) ?? "").trim();
  return (
    !PLACEHOLDER_VALUES.has(value) &&
    !value.toLowerCase().startsWith("replace-me") &&
    !value.toLowerCase().startsWith("change-me")
  );
}

function validateBoolean(values, key, expected = null) {
  if (!values.has(key)) {
    return [`${key} is missing.`];
  }
  const value = String(values.get(key) ?? "").trim().toLowerCase();
  if (value !== "true" && value !== "false") {
    return [`${key} must be true or false.`];
  }
  if (expected != null && value !== expected) {
    return [`${key} must be ${expected} for Public Beta.`];
  }
  return [];
}

function validateHttpsUrl(values, key) {
  if (!hasValue(values, key)) {
    return [`${key} must be configured.`];
  }
  try {
    const url = new URL(String(values.get(key)));
    if (url.protocol !== "https:") {
      return [`${key} must use https for Public Beta.`];
    }
  } catch {
    return [`${key} must be a valid URL.`];
  }
  return [];
}

function validateJsonObject(values, key, requiredFields = []) {
  if (!hasValue(values, key)) {
    return [`${key} must be configured.`];
  }
  try {
    const parsed = JSON.parse(String(values.get(key)));
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return [`${key} must be a JSON object.`];
    }
    return requiredFields
      .filter((field) => !String(parsed[field] ?? "").trim())
      .map((field) => `${key} must include ${field}.`);
  } catch {
    return [`${key} must be valid JSON.`];
  }
}

function validateSecretLength(values, key, minLength) {
  if (!hasValue(values, key)) {
    return [`${key} must be configured.`];
  }
  const value = String(values.get(key));
  if (value.length < minLength) {
    return [`${key} must be at least ${minLength} characters.`];
  }
  return [];
}

export function validateProdEnvText(text) {
  const parsed = parseEnvText(text);
  const issues = [...parsed.issues];
  const { values } = parsed;

  for (const key of REQUIRED_NON_PLACEHOLDER_KEYS) {
    if (!hasValue(values, key)) {
      issues.push(`${key} must be configured and must not be a placeholder.`);
    }
  }
  for (const key of BOOLEAN_KEYS) {
    if (values.has(key)) {
      const value = String(values.get(key) ?? "").trim().toLowerCase();
      if (value !== "true" && value !== "false") {
        issues.push(`${key} must be true or false.`);
      }
    }
  }

  issues.push(...validateHttpsUrl(values, "SIGNALOPS_PUBLIC_API_BASE_URL"));
  issues.push(...validateHttpsUrl(values, "SIGNALOPS_WEB_APP_BASE_URL"));
  issues.push(...validateHttpsUrl(values, "SIGNALOPS_ADMIN_APP_BASE_URL"));
  issues.push(...validateBoolean(values, "SIGNALOPS_API_CONTENT_AUTH_REQUIRED", "true"));
  issues.push(...validateBoolean(values, "SIGNALOPS_WEB_TEST_AUTH_ENABLED", "false"));
  issues.push(...validateJsonObject(values, "FIREBASE_CLIENT_CONFIG", ["apiKey", "projectId"]));
  issues.push(
    ...validateJsonObject(values, "FIREBASE_ADMIN_CREDENTIALS", [
      "project_id",
      "client_email",
      "private_key",
    ])
  );
  issues.push(...validateSecretLength(values, "APP_SECRET", 32));
  issues.push(...validateSecretLength(values, "PUBLIC_API_SIGNING_KEY", 32));

  const cookiePolicy = String(values.get("SIGNALOPS_COOKIE_SECURE_POLICY") ?? "").trim();
  if (cookiePolicy !== "always") {
    issues.push("SIGNALOPS_COOKIE_SECURE_POLICY must be always for Public Beta.");
  }

  const adminAllowlist = String(values.get("ADMIN_ALLOWLIST_EMAILS") ?? "").trim();
  if (!adminAllowlist || adminAllowlist === "admin@example.com" || adminAllowlist.includes("@signalops.local")) {
    issues.push("ADMIN_ALLOWLIST_EMAILS must use real beta admin emails/domains, not example/local values.");
  }

  if (String(values.get("DISCOVERY_ENABLED") ?? "0").trim() === "1") {
    for (const key of [
      "DISCOVERY_SEARCH_PROVIDER",
      "DISCOVERY_MONTHLY_BUDGET_CENTS",
      "DISCOVERY_GEMINI_MODEL",
      "DISCOVERY_GEMINI_BASE_URL",
    ]) {
      if (!hasValue(values, key)) {
        issues.push(`${key} must be configured when DISCOVERY_ENABLED=1.`);
      }
    }
  }

  if (String(values.get("EMAIL_IMAP_PROD_RUNTIME_REQUIRED") ?? "false").trim().toLowerCase() === "true") {
    for (const key of ["IMAP_HOST", "IMAP_USERNAME", "IMAP_PASSWORD"]) {
      if (!hasValue(values, key)) {
        issues.push(`${key} must be configured when EMAIL_IMAP_PROD_RUNTIME_REQUIRED=true.`);
      }
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    keyCount: values.size,
  };
}

function parseArgs(argv) {
  const parsed = {
    envFile: ".env.prod",
  };
  for (const argument of argv) {
    if (argument.startsWith("--env-file=")) {
      parsed.envFile = argument.slice("--env-file=".length);
    }
  }
  return parsed;
}

function main() {
  const { envFile } = parseArgs(process.argv.slice(2));
  const envPath = path.resolve(repoRoot, envFile);
  if (!fs.existsSync(envPath)) {
    console.error(`Production env check failed: ${path.relative(repoRoot, envPath)} is missing.`);
    process.exit(1);
  }
  const result = validateProdEnvText(fs.readFileSync(envPath, "utf8"));
  if (!result.ok) {
    console.error("Production env check failed:");
    for (const issue of result.issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }
  console.log(`Production env check passed: ${result.keyCount} keys validated without printing secret values.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
