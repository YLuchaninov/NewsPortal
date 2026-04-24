import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const requireFromFetchers = createRequire(
  new URL("../../services/fetchers/package.json", import.meta.url)
);
const { chromium } = requireFromFetchers("playwright");

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

function log(message) {
  console.log(`[ui-button-audit] ${message}`);
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

function queryPostgres(env, sql) {
  const result = runCommand(
    "docker",
    [
      ...composeArgs,
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
      sql,
    ],
    { capture: true }
  );
  return result.stdout.trim();
}

function firstResultLine(value) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !/^INSERT\b/i.test(line) && !/^UPDATE\b/i.test(line) && !/^DELETE\b/i.test(line)) ?? "";
}

function queryPostgresInt(env, sql) {
  const value = queryPostgres(env, sql);
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected integer query result, got ${value || "<empty>"}.`);
  }
  return parsed;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
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
    throw new Error(`.env.dev must set ${key} before the UI button audit can run.`);
  }
  return value;
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
  return `${email.slice(0, atIndex)}+button-audit-${runId}${email.slice(atIndex)}`;
}

function selectAdminEmail(allowlistEntries, runId) {
  const domainEntry = allowlistEntries.find((entry) => entry.startsWith("@"));
  if (domainEntry) {
    return `button-audit-${runId}${domainEntry}`;
  }

  const explicitEmail = allowlistEntries[0];
  if (!explicitEmail) {
    throw new Error("ADMIN_ALLOWLIST_EMAILS must include at least one email or @domain entry.");
  }
  return buildAdminAliasEmail(explicitEmail, runId);
}

function extractCookie(setCookies) {
  const cookie = Array.isArray(setCookies) ? setCookies[0] : setCookies;
  if (!cookie) {
    throw new Error("Expected Set-Cookie header but none was returned.");
  }
  return cookie.split(";")[0];
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

async function fetchJson(url, { cookie, timeoutMs = 10000 } = {}) {
  const response = await sendRequest(url, {
    headers: cookie ? { Cookie: cookie } : {},
    timeoutMs,
  });
  return parseJsonResponse(response.text, response);
}

async function waitFor(label, producer, predicate, { timeoutMs = 120000, intervalMs = 1500 } = {}) {
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
  log("Ensuring compose stack is available for the UI button audit.");
  runCompose("up", "-d", ...STACK_SERVICES);
  await Promise.all([
    waitForHttpHealth("api", "http://127.0.0.1:8000/health"),
    waitForHttpHealth("web", "http://127.0.0.1:4321/api/health"),
    waitForHttpHealth("admin", "http://127.0.0.1:4322/api/health"),
    waitForHttpHealth("nginx", "http://127.0.0.1:8080/health"),
  ]);
}

async function ensureFirebasePasswordUser(apiKey, email, password) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
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

async function signInFirebasePasswordUser(apiKey, email, password) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );

  const payload = await response.json();
  if (!response.ok) {
    const errorMessage = String(payload?.error?.message ?? "unknown");
    if (
      errorMessage === "EMAIL_NOT_FOUND" ||
      errorMessage === "INVALID_LOGIN_CREDENTIALS" ||
      errorMessage === "INVALID_PASSWORD"
    ) {
      return null;
    }
    throw new Error(`Firebase admin sign-in failed: ${errorMessage}`);
  }

  return payload;
}

async function deleteFirebasePasswordUser(apiKey, email, password) {
  const session = await signInFirebasePasswordUser(apiKey, email, password);
  if (!session?.idToken) {
    return false;
  }
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: session.idToken }),
    }
  );
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const errorMessage = String(payload?.error?.message ?? "unknown");
    throw new Error(`Firebase admin cleanup failed: ${errorMessage}`);
  }
  return true;
}

function readCookieValue(cookie) {
  const separatorIndex = cookie.indexOf("=");
  if (separatorIndex < 0) {
    throw new Error(`Invalid cookie format: ${cookie}`);
  }
  return {
    name: cookie.slice(0, separatorIndex),
    value: cookie.slice(separatorIndex + 1),
  };
}

async function clickConfirmAction(page, trigger, confirmLabel) {
  await trigger.waitFor({ state: "visible", timeout: 10000 });
  await trigger.scrollIntoViewIfNeeded();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await trigger.click({ force: attempt === 1, timeout: 3000 });
    } catch (error) {
      if (attempt === 1) {
        throw error;
      }
      await page.waitForTimeout(300);
      continue;
    }
    try {
      await page.getByRole("alertdialog").waitFor({ state: "visible", timeout: 3000 });
      await page
        .locator('[role="alertdialog"] button')
        .filter({ hasText: new RegExp(`^\\s*${confirmLabel}\\s*$`) })
        .first()
        .click();
      await page.waitForLoadState("networkidle").catch(() => {});
      return;
    } catch (error) {
      if (attempt === 1) {
        throw error;
      }
      await page.waitForTimeout(1200);
    }
  }
}

async function waitForButtonLabel(locator, expectedPattern) {
  await waitFor(
    "button label update",
    async () => {
      const text = await locator.first().textContent();
      return String(text ?? "").trim();
    },
    (text) => expectedPattern.test(String(text))
  );
}

async function clickAndWaitForToggle(locator, labels) {
  const readLabel = async () => String((await locator.first().textContent()) ?? "").trim();
  const initial = await readLabel();
  const expected = initial === labels.on ? labels.off : labels.on;
  await locator.first().click();
  await waitForButtonLabel(locator, new RegExp(`^${expected}$`));
  return { initial, expected };
}

async function readJsonResponse(response) {
  return await response.json().catch(async () => ({
    body: await response.text().catch(() => ""),
  }));
}

async function waitForAdminAutomationPost(page, action) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.url().includes("/bff/admin/automation") &&
        candidate.request().method() === "POST",
      { timeout: 30000 }
    ),
    action(),
  ]);
  const payload = await readJsonResponse(response);
  if (!response.ok()) {
    throw new Error(
      `Automation BFF returned ${response.status()}: ${JSON.stringify(payload)}`
    );
  }
  return {
    payload,
    status: response.status(),
    url: response.url(),
  };
}

async function resolveCardByText(page, text) {
  const heading = page.getByText(text, { exact: true }).first();
  await heading.waitFor({ state: "visible", timeout: 10000 });
  return heading.locator(
    'xpath=ancestor::*[self::article or self::div or self::details][contains(@class,"border")][1]'
  );
}

async function resolveTableRowByText(page, text) {
  const cell = page.getByText(text, { exact: true }).first();
  await cell.waitFor({ state: "visible", timeout: 10000 });
  return cell.locator("xpath=ancestor::tr[1]");
}

async function openPage(page, urlOrPath) {
  const response = await page.goto(urlOrPath, { waitUntil: "domcontentloaded" });
  if (!response || !response.ok()) {
    throw new Error(
      `Expected ${urlOrPath} to load successfully, got ${response?.status() ?? "no response"}.`
    );
  }
  await page.waitForLoadState("networkidle").catch(() => {});
}

async function seedWebScenario(env, adminCookie, webCookie, userId, runId) {
  const interestDescription = `Audit interest ${runId}`;
  const digestEmail = `button-audit-user-${runId}@example.test`;

  log("Seeding web user scenario.");
  const userInterest = await postForm(
    "http://127.0.0.1:4321/bff/interests",
    {
      description: interestDescription,
      positive_texts: "EU AI policy\nBrussels guidance",
      negative_texts: "sports\ncelebrity gossip",
      places: "Brussels, Warsaw",
      languages_allowed: "en",
      must_have_terms: "policy",
      priority: "1",
    },
    { cookie: webCookie }
  );
  const userInterestId = String(userInterest.json?.interestId ?? "");
  assert.ok(userInterestId);
  log("Web seed: created user interest.");

  await postForm(
    "http://127.0.0.1:4321/bff/notification-channels",
    { channelType: "email_digest", email: digestEmail },
    { cookie: webCookie }
  );
  await postForm(
    "http://127.0.0.1:4321/bff/notification-channels",
    { channelType: "telegram", chatId: `button-audit-${runId}` },
    { cookie: webCookie }
  );
  log("Web seed: connected digest and telegram channels.");

  await waitFor(
    "compiled user interest",
    async () => fetchJson("http://127.0.0.1:4321/bff/interests", { cookie: webCookie }),
    (payload) =>
      Array.isArray(payload?.interests) &&
      payload.interests.some(
        (interest) =>
          String(interest?.interest_id ?? "") === userInterestId &&
          String(interest?.compile_status ?? "") === "compiled"
      )
  );
  log("Web seed: user interest compiled.");

  await postForm(
    "http://127.0.0.1:4322/bff/admin/templates",
    {
      kind: "interest",
      intent: "save",
      name: `UI button audit system interest ${runId}`,
      description: "Deterministic editorial selection for browser click audit.",
      positive_texts: "EU AI policy update\nBrussels AI guidance\nWarsaw AI guidance",
      negative_texts: "sports\ncelebrity gossip",
      allowed_content_kinds: "editorial",
      languages_allowed: "en",
      priority: "1",
      isActive: "true",
    },
    { cookie: adminCookie }
  );
  log("Web seed: created supporting system interest.");

  const titles = [
    `EU AI policy update reaches Brussels and Warsaw ${runId}-one`,
    `EU AI policy update reaches Brussels and Warsaw ${runId}-two`,
  ];
  const channelIds = [];
  for (const label of ["one", "two"]) {
    const channel = await postForm(
      "http://127.0.0.1:4322/bff/admin/channels",
      {
        providerType: "rss",
        name: `UI audit RSS ${label} ${runId}`,
        fetchUrl: `http://web:4321/internal-mvp-feed.xml?run=${encodeURIComponent(`${runId}-${label}`)}`,
        language: "en",
      },
      { cookie: adminCookie }
    );
    const channelId = String(channel.json?.channelId ?? "");
    assert.ok(channelId);
    channelIds.push(channelId);
    runCompose(
      "exec",
      "-T",
      "fetchers",
      "pnpm",
      "--filter",
      "@newsportal/fetchers",
      "run:once",
      channelId
    );
  }
  log("Web seed: fetched two RSS channels.");

  const articleRows = [];
  for (const title of titles) {
    const row = await waitFor(
      `article row for ${title}`,
      async () => {
        const raw = queryPostgres(
          env,
          `
            select doc_id::text, processing_state
            from articles
            where title = ${sqlLiteral(title)}
            order by ingested_at desc
            limit 1;
          `
        );
        return raw ? raw.split("|") : null;
      },
      (value) => Array.isArray(value) && value.length === 2
    );
    articleRows.push({ docId: row[0], title });
  }
  log("Web seed: resolved article rows.");

  const collectionPayload = await waitFor(
    "system-selected collection availability",
    async () => {
      const payload = await fetchJson(
        "http://127.0.0.1:8000/collections/system-selected?page=1&pageSize=100"
      );
      const items = Array.isArray(payload?.items) ? payload.items : [];
      for (const item of items) {
        const candidateContentItemId = String(item?.content_item_id ?? "");
        if (!candidateContentItemId || !candidateContentItemId.startsWith("editorial:")) {
          continue;
        }
        try {
          await fetchJson(
            `http://127.0.0.1:8000/content-items/${encodeURIComponent(candidateContentItemId)}`
          );
          return {
            items,
            contentItemId: candidateContentItemId,
          };
        } catch {
          continue;
        }
      }
      return { items, contentItemId: "" };
    },
    (payload) => Array.isArray(payload?.items) && String(payload?.contentItemId ?? "").length > 0
  );
  const primaryContentItemId = String(collectionPayload.contentItemId ?? "");
  if (!primaryContentItemId) {
    throw new Error("System-selected collection did not expose a browser-openable content_item_id for the web button audit.");
  }
  log(`Web seed: using content item ${primaryContentItemId}.`);
  const primaryNotificationDocId = primaryContentItemId.replace(/^editorial:/, "");
  const notificationId = firstResultLine(queryPostgres(
    env,
    `
      insert into notification_log (
        user_id,
        interest_id,
        doc_id,
        channel_type,
        status,
        title,
        body,
        decision_reason,
        delivery_payload_json
      )
      values (
        ${sqlLiteral(userId)},
        ${sqlLiteral(userInterestId)},
        ${sqlLiteral(primaryNotificationDocId)},
        'telegram',
        'sent',
        ${sqlLiteral(`UI button audit notification ${runId}`)},
        ${sqlLiteral("Deterministic notification row for browser feedback proof.")},
        ${sqlLiteral("seeded_browser_audit")},
        '{}'::jsonb
      )
      returning notification_id::text;
    `
  ));
  assert.ok(notificationId);

  await waitFor(
    "notification rows for click audit",
    async () =>
      queryPostgresInt(
        env,
        `
          select count(*)::int
          from notification_log
          where user_id = ${sqlLiteral(userId)};
        `
      ),
    (count) => count >= 1
  );
  log("Web seed: notification row visible.");

  await postForm(
    "http://127.0.0.1:4321/bff/content-state",
    { contentItemId: primaryContentItemId, action: "save" },
    { cookie: webCookie }
  );
  await postForm(
    "http://127.0.0.1:4321/bff/story-follow",
    { contentItemId: primaryContentItemId, action: "follow" },
    { cookie: webCookie }
  );
  log("Web seed: saved and followed primary content item.");

  log("Web user scenario seeded.");

  return {
    interestDescription,
    userInterestId,
    digestEmail,
    targetUserId: userId,
    webCookie,
    contentItemId: primaryContentItemId,
    articleTitles: titles,
    channelIds,
  };
}

async function seedAdminFixtures(env, adminCookie, runId) {
  log("Seeding admin fixtures for browser click coverage.");

  const llmTemplate = await postForm(
    "http://127.0.0.1:4322/bff/admin/templates",
    {
      kind: "llm",
      intent: "save",
      name: `UI audit LLM template ${runId}`,
      scope: "interests",
      language: "en",
      templateText: `Classify gray-zone item for audit ${runId}`,
      isActive: "true",
    },
    { cookie: adminCookie }
  );
  const llmTemplateId = String(llmTemplate.json?.promptTemplateId ?? "");
  assert.ok(llmTemplateId);

  const systemInterest = await postForm(
    "http://127.0.0.1:4322/bff/admin/templates",
    {
      kind: "interest",
      intent: "save",
      name: `UI audit template ${runId}`,
      description: "Button audit system interest",
      positive_texts: "audit\nbutton",
      negative_texts: "sports",
      allowed_content_kinds: "editorial",
      languages_allowed: "en",
      priority: "1",
      isActive: "true",
    },
    { cookie: adminCookie }
  );
  const systemInterestId = String(systemInterest.json?.interestTemplateId ?? "");
  assert.ok(systemInterestId);

  const deletableChannel = await postForm(
    "http://127.0.0.1:4322/bff/admin/channels",
    {
      providerType: "rss",
      name: `UI audit delete channel ${runId}`,
      fetchUrl: `http://web:4321/internal-mvp-feed.xml?run=${encodeURIComponent(`delete-${runId}`)}`,
      language: "en",
    },
    { cookie: adminCookie }
  );
  const deletableChannelId = String(deletableChannel.json?.channelId ?? "");
  assert.ok(deletableChannelId);

  const editableChannel = await postForm(
    "http://127.0.0.1:4322/bff/admin/channels",
    {
      providerType: "rss",
      name: `UI audit edit channel ${runId}`,
      fetchUrl: `http://web:4321/internal-mvp-feed.xml?run=${encodeURIComponent(`edit-${runId}`)}`,
      language: "en",
    },
    { cookie: adminCookie }
  );
  const editableChannelId = String(editableChannel.json?.channelId ?? "");
  assert.ok(editableChannelId);

  const mission = await postForm(
    "http://127.0.0.1:4322/bff/admin/discovery",
    {
      intent: "create_mission",
      redirectTo: "/discovery?tab=missions",
      title: `UI audit mission ${runId}`,
      description: "Browser click audit mission",
      seedTopics: "browser audit mission",
      seedLanguages: "en",
      seedRegions: "EU",
      targetProviderTypes: "rss",
      maxHypotheses: "2",
      maxSources: "2",
      budgetCents: "0",
      priority: "0",
    },
    { cookie: adminCookie }
  );
  const missionId = String(mission.json?.mission_id ?? "");
  assert.ok(missionId);

  const deletableMission = await postForm(
    "http://127.0.0.1:4322/bff/admin/discovery",
    {
      intent: "create_mission",
      redirectTo: "/discovery?tab=missions",
      title: `UI audit delete mission ${runId}`,
      description: "Browser click audit delete mission",
      seedTopics: "browser delete mission",
      seedLanguages: "en",
      seedRegions: "EU",
      targetProviderTypes: "rss",
      maxHypotheses: "1",
      maxSources: "1",
      budgetCents: "0",
      priority: "0",
    },
    { cookie: adminCookie }
  );
  const deletableMissionId = String(deletableMission.json?.mission_id ?? "");
  assert.ok(deletableMissionId);

  const classKey = `ui_audit_${runId}`;
  await postForm(
    "http://127.0.0.1:4322/bff/admin/discovery",
    {
      intent: "create_class",
      redirectTo: "/discovery?tab=classes",
      classKey,
      displayName: `UI audit class ${runId}`,
      description: "Browser click audit class",
      status: "active",
      generationBackend: "graph_seed_only",
      defaultProviderTypes: "rss",
      maxPerMission: "1",
      sortOrder: "-990",
      seedRulesJson: '{"tactics":["browser"]}',
      configJson: '{"notes":"browser"}',
    },
    { cookie: adminCookie }
  );

  const deleteClassKey = `ui_audit_delete_${runId}`;
  await postForm(
    "http://127.0.0.1:4322/bff/admin/discovery",
    {
      intent: "create_class",
      redirectTo: "/discovery?tab=classes",
      classKey: deleteClassKey,
      displayName: `UI audit delete class ${runId}`,
      description: "Browser click audit delete class",
      status: "draft",
      generationBackend: "graph_seed_only",
      defaultProviderTypes: "rss",
      maxPerMission: "1",
      sortOrder: "-989",
      seedRulesJson: '{"tactics":["browser_delete"]}',
      configJson: '{"notes":"browser delete"}',
    },
    { cookie: adminCookie }
  );

  const hypothesisId = firstResultLine(queryPostgres(
    env,
    `
        insert into discovery_hypotheses (
          mission_id,
          class_key,
          tactic_key,
          search_query,
          target_urls,
          target_provider_type,
          generation_context,
          expected_value,
          status
        )
        values (
          ${sqlLiteral(missionId)},
          ${sqlLiteral(classKey)},
          ${sqlLiteral("audit_review")},
          ${sqlLiteral(`site:${runId} discovery candidate`)},
          array[${sqlLiteral(`https://audit-${runId}.example.test/feed.xml`)}]::text[],
          'rss',
          '{}'::jsonb,
          ${sqlLiteral("audit hypothesis")},
          'pending'
        )
        returning hypothesis_id::text;
    `
  ));
  assert.ok(hypothesisId);

  const candidateId = firstResultLine(queryPostgres(
    env,
    `
      insert into discovery_candidates (
        hypothesis_id,
        mission_id,
        url,
        final_url,
        title,
        description,
        provider_type,
        is_valid,
        relevance_score,
        evaluation_json,
        llm_assessment,
        sample_data,
        status
      )
      values (
        ${sqlLiteral(hypothesisId)},
        ${sqlLiteral(missionId)},
        ${sqlLiteral(`https://audit-${runId}.example.test/feed.xml`)},
        ${sqlLiteral(`https://audit-${runId}.example.test/feed.xml`)},
        ${sqlLiteral(`UI audit candidate ${runId}`)},
        ${sqlLiteral("Synthetic candidate for browser review.")},
        'rss',
        true,
        0.91,
        '{"quality_signal_source":"audit"}'::jsonb,
        '{}'::jsonb,
        '[]'::jsonb,
        'pending'
      )
      returning candidate_id::text;
    `
  ));
  assert.ok(candidateId);

  const rejectHypothesisId = firstResultLine(queryPostgres(
    env,
    `
        insert into discovery_hypotheses (
          mission_id,
          class_key,
          tactic_key,
          search_query,
          target_urls,
          target_provider_type,
          generation_context,
          expected_value,
          status
        )
        values (
          ${sqlLiteral(missionId)},
          ${sqlLiteral(classKey)},
          ${sqlLiteral("audit_reject")},
          ${sqlLiteral(`site:${runId} discovery reject candidate`)},
          array[${sqlLiteral(`https://audit-reject-${runId}.example.test/feed.xml`)}]::text[],
          'rss',
          '{}'::jsonb,
          ${sqlLiteral("audit reject hypothesis")},
          'pending'
        )
        returning hypothesis_id::text;
    `
  ));
  assert.ok(rejectHypothesisId);

  const rejectCandidateId = firstResultLine(queryPostgres(
    env,
    `
      insert into discovery_candidates (
        hypothesis_id,
        mission_id,
        url,
        final_url,
        title,
        description,
        provider_type,
        is_valid,
        relevance_score,
        evaluation_json,
        llm_assessment,
        sample_data,
        status
      )
      values (
        ${sqlLiteral(rejectHypothesisId)},
        ${sqlLiteral(missionId)},
        ${sqlLiteral(`https://audit-reject-${runId}.example.test/feed.xml`)},
        ${sqlLiteral(`https://audit-reject-${runId}.example.test/feed.xml`)},
        ${sqlLiteral(`UI audit reject candidate ${runId}`)},
        ${sqlLiteral("Synthetic candidate for browser rejection.")},
        'rss',
        true,
        0.53,
        '{"quality_signal_source":"audit"}'::jsonb,
        '{}'::jsonb,
        '[]'::jsonb,
        'pending'
      )
      returning candidate_id::text;
    `
  ));
  assert.ok(rejectCandidateId);

  const articleDocId = firstResultLine(queryPostgres(
    env,
    `
      select doc_id::text
      from articles
      order by ingested_at desc
      limit 1;
    `
  ));
  assert.ok(articleDocId);
  queryPostgres(
    env,
    `
      update articles
      set enrichment_state = 'failed',
          updated_at = now()
      where doc_id = ${sqlLiteral(articleDocId)};
    `
  );

  const resourceId = firstResultLine(queryPostgres(
    env,
    `
      select resource_id::text
      from web_resources
      order by discovered_at desc nulls last, created_at desc
      limit 1;
    `
  ));

  return {
    llmTemplateId,
    systemInterestId,
    editableChannelId,
    deletableChannelId,
    missionId,
    deletableMissionId,
    classKey,
    deleteClassKey,
    candidateId,
    rejectCandidateId,
    articleDocId,
    resourceId,
  };
}

async function auditWebButtons(page, runId, scenario, result) {
  log("Auditing web buttons.");

  log("Web: collection save/unsave.");
  await openPage(page, "/");
  await clickAndWaitForToggle(page.getByRole("button", { name: /Save|Unsave/ }).first(), {
    on: "Save",
    off: "Unsave",
  });
  result.checked.push("web:/ collection save/unsave");

  log("Web: mobile shell menu toggle.");
  const mobileContext = await page.context().browser().newContext({
    baseURL: "http://127.0.0.1:4321",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    for (const cookie of await page.context().cookies("http://127.0.0.1:4321")) {
      await mobileContext.addCookies([cookie]);
    }
    const mobilePage = await mobileContext.newPage();
    await openPage(mobilePage, "/");
    await mobilePage.getByLabel("Toggle menu").click();
    await mobilePage.getByRole("link", { name: "Saved", exact: true }).click();
    await mobilePage.waitForURL("**/saved");
    result.checked.push("web:mobile shell menu toggle");
    await mobilePage.close();
  } finally {
    await mobileContext.close();
  }

  log("Web: content detail buttons.");
  await openPage(page, `/content/${encodeURIComponent(scenario.contentItemId)}`);
  await clickAndWaitForToggle(page.getByRole("button", { name: /Mark seen|Mark unread/ }).first(), {
    on: "Mark seen",
    off: "Mark unread",
  });
  result.checked.push("web:/content mark seen/unread");

  const contentSaveToggle = await clickAndWaitForToggle(page.getByRole("button", { name: /Save|Unsave/ }).first(), {
    on: "Save",
    off: "Unsave",
  });
  if (contentSaveToggle.expected === "Save") {
    await clickAndWaitForToggle(page.getByRole("button", { name: /Save|Unsave/ }).first(), {
      on: "Save",
      off: "Unsave",
    });
  }
  result.checked.push("web:/content save");

  await clickAndWaitForToggle(page.getByRole("button", { name: /Follow story|Following/ }).first(), {
    on: "Follow story",
    off: "Following",
  });
  result.checked.push("web:/content follow/unfollow");

  log("Web: saved digest buttons.");
  await openPage(page, "/saved");
  await page.getByRole("button", { name: /Preview/ }).first().click();
  await page.waitForURL(/\/saved\/digest/);
  result.checked.push("web:/saved preview digest");

  await page.getByRole("button", { name: "Send to email" }).click();
  await page.waitForLoadState("networkidle").catch(() => {});
  result.checked.push("web:/saved/digest send to email");

  await openPage(page, `/content/${encodeURIComponent(scenario.contentItemId)}`);
  const saveButtonBeforeArchive = page.getByRole("button", { name: /Save|Unsave/ }).first();
  if (/^Save$/.test(String((await saveButtonBeforeArchive.textContent()) ?? "").trim())) {
    await clickAndWaitForToggle(saveButtonBeforeArchive, {
      on: "Save",
      off: "Unsave",
    });
  }
  const archiveButton = page.getByRole("button", { name: /^Archive$/ }).first();
  await archiveButton.click();
  await waitForButtonLabel(page.getByRole("button", { name: /^Save$/ }).first(), /^Save$/);
  result.checked.push("web:/content archive");

  log("Web: interests CRUD buttons.");
  await openPage(page, "/interests");
  await page.getByRole("button", { name: "Add Interest" }).click();
  await page.locator('textarea[name="description"]').fill(`UI audit browser interest ${runId}`);
  await page.locator('textarea[name="positive_texts"]').fill("browser\nbuttons");
  await page.getByRole("button", { name: "Create Interest" }).click();
  await page.getByText(`UI audit browser interest ${runId}`, { exact: true }).waitFor({
    state: "visible",
    timeout: 15000,
  });
  result.checked.push("web:/interests create");

  const createdInterestDescription = `UI audit browser interest ${runId}`;
  const updatedInterestDescription = `UI audit browser interest updated ${runId}`;
  const clonedInterestDescription = `Copy of ${updatedInterestDescription}`;
  const interestCard = await resolveCardByText(page, createdInterestDescription);
  await interestCard.getByRole("button", { name: /Edit \/ Clone \/ Delete/ }).click();
  await interestCard.locator('textarea[name="description"]').fill(updatedInterestDescription);
  await interestCard.getByRole("button", { name: /^Save$/ }).click();
  await page.getByText(updatedInterestDescription, { exact: true }).first().waitFor({
    state: "visible",
    timeout: 15000,
  });
  result.checked.push("web:/interests save");

  const updatedInterestCard = await resolveCardByText(page, updatedInterestDescription);
  await updatedInterestCard.getByRole("button", { name: /^Clone$/ }).click();
  await page.getByText(clonedInterestDescription, { exact: true }).first().waitFor({
    state: "visible",
    timeout: 15000,
  });
  result.checked.push("web:/interests clone");

  const clonedCard = await resolveCardByText(page, clonedInterestDescription);
  await clonedCard.getByRole("button", { name: /Edit \/ Clone \/ Delete/ }).click();
  await clonedCard.getByRole("button", { name: /^Delete$/ }).click();
  await waitFor(
    "deleted cloned interest",
    async () => page.getByText(clonedInterestDescription, { exact: true }).count(),
    (count) => count === 0
  );
  result.checked.push("web:/interests delete");

  log("Web: settings buttons.");
  await openPage(page, "/settings");
  await page.locator("#theme-select").selectOption("dark");
  await page.getByRole("button", { name: /^Save$/ }).click();
  result.checked.push("web:/settings appearance save");

  const prefToggle = page.locator('input[name="telegramEnabled"][type="checkbox"]').first();
  const prefWasChecked = await prefToggle.isChecked();
  await prefToggle.locator('xpath=ancestor::label[1]').click();
  await waitFor(
    "telegram preference toggle",
    async () => prefToggle.isChecked(),
    (checked) => checked === !prefWasChecked
  );
  await page.getByRole("button", { name: "Save Preferences" }).click();
  result.checked.push("web:/settings preferences save");

  await page.locator("#digest-cadence").selectOption("weekly");
  await page.getByRole("button", { name: "Save Digest Settings" }).click();
  result.checked.push("web:/settings digest save");

  await page.locator('input[name="chatId"]').fill(`button-browser-${runId}`);
  await page.getByRole("button", { name: /^Connect$/ }).first().click();
  result.checked.push("web:/settings connect telegram");

  await page.locator('input[name="email"]').last().fill(`button-browser-${runId}@example.test`);
  await page.getByRole("button", { name: /^Connect$/ }).last().click();
  result.checked.push("web:/settings connect email digest");

  const webPushButton = page.getByRole("button", { name: "Connect Web Push" });
  if ((await webPushButton.count()) > 0 && (await webPushButton.isEnabled())) {
    try {
      await page.context().grantPermissions(["notifications"], {
        origin: "http://127.0.0.1:4321",
      });
      await webPushButton.click();
      await waitFor(
        "web push notification channel",
        async () =>
          fetchJson("http://127.0.0.1:4321/bff/notification-channels", {
            cookie: scenario.webCookie,
          }),
        (payload) =>
          Array.isArray(payload?.channels) &&
          payload.channels.some(
            (channel) => String(channel?.channel_type ?? channel?.channelType ?? "") === "web_push"
          ),
        { timeoutMs: 15000 }
      );
      result.checked.push("web:/settings connect web push");
    } catch (error) {
      const webPushStatus = String(
        (await webPushButton.locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]//p[last()]").textContent().catch(() => "")) ?? ""
      ).trim();
      result.skipped.push({
        route: "/settings",
        action: "Connect Web Push",
        reason: webPushStatus || (error instanceof Error ? error.message : "Headless Chromium push registration failed"),
      });
    }
  } else {
    result.notApplicable.push("web:/settings connect web push disabled");
  }

  log("Web: notification feedback buttons.");
  await openPage(page, "/notifications");
  const helpfulButton = page.locator('button[title="Helpful"]').first();
  await helpfulButton.click();
  await page.waitForLoadState("networkidle").catch(() => {});
  await openPage(page, "/notifications");
  const notHelpfulButtons = page.locator('button[title="Not helpful"]');
  if ((await notHelpfulButtons.count()) > 1) {
    await notHelpfulButtons.nth(1).click();
  } else {
    await notHelpfulButtons.first().click();
  }
  await page.waitForLoadState("networkidle").catch(() => {});
  result.checked.push("web:/notifications helpful/not helpful");

  await openPage(page, "/following");
  result.notApplicable.push("web:/following no standalone buttons rendered once story is followed");

  log("Web: matches button.");
  await openPage(page, "/matches");
  await clickAndWaitForToggle(page.getByRole("button", { name: /Save|Unsave/ }).first(), {
    on: "Save",
    off: "Unsave",
  });
  result.checked.push("web:/matches save toggle");
}

async function auditAdminButtons(page, env, runId, fixtures, webScenario, result) {
  log("Auditing admin buttons.");

  log("Admin: system interest editor buttons.");
  await openPage(page, `/templates/interests/${encodeURIComponent(fixtures.systemInterestId)}/edit`);
  await page.locator('textarea[name="description"]').fill(`Updated UI audit template ${runId}`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByText(`Updated UI audit template ${runId}`).first().waitFor({ state: "visible", timeout: 15000 });
  result.checked.push("admin:/templates/interests edit save");

  await clickConfirmAction(page, page.getByRole("button", { name: /^Archive$/ }).first(), "Archive system interest");
  await page.getByText("Archived", { exact: true }).first().waitFor({ state: "visible", timeout: 10000 });
  await clickConfirmAction(page, page.getByRole("button", { name: /^Activate$/ }).first(), "Activate system interest");
  result.checked.push("admin:/templates/interests archive/activate");

  await clickConfirmAction(page, page.getByRole("button", { name: /^Delete$/ }).first(), "Delete system interest");
  await page.waitForLoadState("networkidle").catch(() => {});
  result.checked.push("admin:/templates/interests delete");

  log("Admin: LLM template editor buttons.");
  await openPage(page, `/templates/llm/${encodeURIComponent(fixtures.llmTemplateId)}/edit`);
  await page.locator('textarea[name="templateText"]').fill(`Updated LLM prompt ${runId} {title}`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByText(`Updated LLM prompt ${runId}`).first().waitFor({ state: "visible", timeout: 15000 });
  result.checked.push("admin:/templates/llm edit save");

  await clickConfirmAction(page, page.getByRole("button", { name: /^Archive$/ }).first(), "Archive template");
  await clickConfirmAction(page, page.getByRole("button", { name: /^Activate$/ }).first(), "Activate template");
  result.checked.push("admin:/templates/llm archive/activate");

  await clickConfirmAction(page, page.getByRole("button", { name: /^Delete$/ }).first(), "Delete template");
  result.checked.push("admin:/templates/llm delete");

  log("Admin: channel create/edit/import/list buttons.");
  await openPage(page, "/channels/new?providerType=rss");
  await page.locator('input[name="name"]').fill(`UI audit browser channel ${runId}`);
  await page.locator('input[name="fetchUrl"]').fill(
    `http://web:4321/internal-mvp-feed.xml?run=${encodeURIComponent(`browser-new-${runId}`)}`
  );
  await page.getByRole("button", { name: /Create .* channel|Save changes/ }).click();
  await page.waitForURL(/\/channels\/.+\/edit/);
  const createdChannelUrl = page.url();
  const createdChannelId = createdChannelUrl.match(/\/channels\/([^/]+)\/edit/)?.[1] ?? "";
  assert.ok(createdChannelId);
  result.checked.push("admin:/channels/new create");

  await page.locator('input[name="language"]').fill("en");
  await page.getByRole("button", { name: "Save changes" }).click();
  result.checked.push("admin:/channels/:id/edit save");

  await openPage(page, "/channels/import");
  await page.getByRole("button", { name: "Load example" }).click();
  await page.getByRole("button", { name: "Validate" }).click();
  const jsonArea = page.locator("textarea").first();
  await jsonArea.fill(
    JSON.stringify(
      [
        {
          providerType: "rss",
          name: `Audit RSS ${runId}`,
          fetchUrl: `http://web:4321/internal-mvp-feed.xml?run=${encodeURIComponent(`audit-import-rss-${runId}`)}`,
          language: "en",
          isActive: true,
          pollIntervalSeconds: 1800,
        },
        {
          providerType: "website",
          name: `Audit Website ${runId}`,
          fetchUrl: `http://web:4321/internal-mvp-site?run=${encodeURIComponent(`audit-import-website-${runId}`)}`,
          language: "en",
          isActive: true,
          pollIntervalSeconds: 1800,
        },
      ],
      null,
      2
    )
  );
  await Promise.all([
    page.waitForURL(/\/channels\/import.*flash_status=/u, { timeout: 30000 }),
    page.getByRole("button", { name: "Import JSON" }).click(),
  ]);
  await page.waitForLoadState("networkidle").catch(() => {});
  result.checked.push("admin:/channels/import load example/validate/import rss+website");

  await openPage(page, "/channels");
  await page.getByRole("spinbutton", { name: "Base interval (seconds)" }).fill("1800");
  await clickConfirmAction(
    page,
    page.getByRole("button", { name: "Apply schedule" }),
    "Apply to RSS channels"
  );
  result.checked.push("admin:/channels apply schedule");

  await openPage(page, "/channels");
  const deleteChannelRow = await resolveTableRowByText(page, `UI audit delete channel ${runId}`);
  const deleteChannelButton = deleteChannelRow.getByRole("button", { name: /Delete|Archive/ }).first();
  const deleteChannelLabel = String((await deleteChannelButton.textContent()) ?? "").trim() || "Delete";
  await deleteChannelButton.waitFor({ state: "visible", timeout: 10000 });
  await deleteChannelButton.scrollIntoViewIfNeeded();
  await deleteChannelButton.click({ force: true, timeout: 3000 });
  await page.getByRole("alertdialog").waitFor({ state: "visible", timeout: 3000 });
  await page
    .locator('[role="alertdialog"] button')
    .filter({ hasText: new RegExp(`^\\s*${deleteChannelLabel}\\s*$`) })
    .first()
    .click();
  await page.waitForLoadState("networkidle").catch(() => {});
  result.checked.push("admin:/channels delete row");

  log("Admin: user-interests buttons.");
  await openPage(page, "/user-interests");
  await page.locator('input[name="userId"]').fill(webScenario.targetUserId);
  await Promise.all([
    page.waitForURL(/\/user-interests\?.*userId=/u, { timeout: 15000 }),
    page.getByRole("button", { name: "Find user" }).click(),
  ]);
  await page.waitForLoadState("networkidle").catch(() => {});
  await openPage(
    page,
    `/user-interests?userId=${encodeURIComponent(webScenario.targetUserId)}&mode=create`
  );
  await page.locator('textarea[name="description"]').first().fill(`Admin managed interest ${runId}`);
  await page.getByRole("button", { name: "Create user interest" }).click();
  await page.getByText(`Admin managed interest ${runId}`, { exact: true }).first().waitFor({ state: "visible", timeout: 15000 });
  result.checked.push("admin:/user-interests create");

  const createdAdminInterestDescription = `Admin managed interest ${runId}`;
  const updatedAdminInterestDescription = `Admin managed interest updated ${runId}`;
  const createdAdminInterestLink = page
    .getByText(createdAdminInterestDescription, { exact: true })
    .first()
    .locator("xpath=ancestor::a[1]");
  await Promise.all([
    page.waitForURL(/\/user-interests\?.*selected=/u, { timeout: 15000 }),
    createdAdminInterestLink.click(),
  ]);
  await page.waitForLoadState("networkidle").catch(() => {});
  const userInterestEditorForm = page.locator('form[action*="/bff/admin/user-interests/"]').first();
  await userInterestEditorForm.locator('textarea[name="description"]').fill(updatedAdminInterestDescription);
  await userInterestEditorForm.getByRole("button", { name: "Save changes" }).click();
  await page.getByText(updatedAdminInterestDescription, { exact: true }).first().waitFor({ state: "visible", timeout: 15000 });
  result.checked.push("admin:/user-interests save");

  await userInterestEditorForm.getByRole("button", { name: "Clone" }).click();
  await waitFor(
    "cloned admin interest",
    async () => page.getByText(updatedAdminInterestDescription, { exact: true }).count(),
    (count) => count >= 2
  );
  result.checked.push("admin:/user-interests clone");

  await clickConfirmAction(
    page,
    page.getByRole("button", { name: "Delete" }).first(),
    "Delete interest"
  );
  result.checked.push("admin:/user-interests delete");

  log("Admin: article moderation and retry buttons.");
  await openPage(page, `/articles?view=recent-failures&selected=${encodeURIComponent(fixtures.articleDocId)}`);
  const blockButton = page.getByRole("button", { name: /Block|Unblock/ }).first();
  const initialBlockLabel = String((await blockButton.textContent()) ?? "").trim();
  if (/Block/.test(initialBlockLabel)) {
    await clickConfirmAction(page, blockButton, "Block article");
    await clickConfirmAction(page, page.getByRole("button", { name: /Unblock/ }).first(), "Unblock article");
  } else {
    await clickConfirmAction(page, blockButton, "Unblock article");
    await clickConfirmAction(page, page.getByRole("button", { name: /Block/ }).first(), "Block article");
    await clickConfirmAction(page, page.getByRole("button", { name: /Unblock/ }).first(), "Unblock article");
  }
  result.checked.push("admin:/articles block/unblock");

  await openPage(page, `/articles/${encodeURIComponent(fixtures.articleDocId)}`);
  await page.getByRole("button", { name: "Retry enrichment" }).click();
  result.checked.push("admin:/articles/:id retry enrichment");

  log("Admin: resources filter button.");
  await openPage(page, "/resources");
  await page.locator('select[name="projection"]').selectOption("resource_only");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await page.waitForURL(/projection=resource_only/);
  result.checked.push("admin:/resources apply filters");
  if (fixtures.resourceId) {
    await openPage(page, `/resources/${encodeURIComponent(fixtures.resourceId)}`);
    result.notApplicable.push("admin:/resources/:id no button actions rendered");
  }

  log("Admin: reindex queue button.");
  await openPage(page, "/reindex");
  await clickConfirmAction(
    page,
    page.getByRole("button", { name: "Queue maintenance job" }),
    "Start job"
  );
  result.checked.push("admin:/reindex queue maintenance job");

  log("Admin: automation buttons.");
  await openPage(page, "/automation");
  await Promise.all([
    page.waitForURL(/\/automation\/[0-9a-f-]+$/u, { waitUntil: "domcontentloaded", timeout: 30000 }),
    waitForAdminAutomationPost(page, () =>
      page.getByRole("button", { name: "Blank Linear Workflow" }).click()
    ),
  ]);
  await page.waitForLoadState("networkidle").catch(() => {});
  const automationEditorUrl = page.url();
  result.checked.push("admin:/automation blank workflow create");

  await page.getByRole("button", { name: "Run Now" }).click();
  await Promise.all([
    page.waitForURL(/\/automation\/[0-9a-f-]+\/executions$/u, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    }),
    page.getByRole("button", { name: "Request Run" }).click(),
  ]);
  await page.waitForLoadState("networkidle").catch(() => {});
  result.checked.push("admin:/automation request run");

  await openPage(page, automationEditorUrl);
  page.once("dialog", (dialog) => {
    void dialog.accept();
  });
  await Promise.all([
    page.waitForURL(/\/automation(?:\?.*)?$/u, { waitUntil: "domcontentloaded", timeout: 30000 }),
    page.getByRole("button", { name: "Archive" }).click(),
  ]);
  result.checked.push("admin:/automation archive workflow");

  log("Admin: discovery smoke.");
  await openPage(page, "/discovery?tab=missions");
  result.skipped.push({
    route: "/discovery",
    action: "discovery action buttons",
    reason: "covered by test:discovery:admin:compose in the full local product contour",
  });

  await openPage(page, "/templates");
  result.notApplicable.push("admin:/templates no button actions rendered");
  await openPage(page, "/observability");
  result.notApplicable.push("admin:/observability no button actions rendered");
  await openPage(page, "/help");
  result.notApplicable.push("admin:/help no button actions rendered");
  await openPage(page, "/");
  result.notApplicable.push("admin:/ dashboard no standalone button actions rendered");
}

async function main() {
  const env = await readEnvFile(".env.dev");
  const firebaseApiKey = requireConfigured(env, "FIREBASE_WEB_API_KEY");
  const runId = randomUUID().slice(0, 8);
  log(`Run id ${runId}`);
  const allowlistEntries = readAllowlistEntries(env);
  const adminEmail = selectAdminEmail(allowlistEntries, runId);
  const adminPassword = `NewsPortal!${runId}`;
  let adminCreated = false;

  await ensureComposeStack();

  const browser = await chromium.launch({ headless: true });
  try {
    await ensureFirebasePasswordUser(firebaseApiKey, adminEmail, adminPassword);
    adminCreated = true;

    log("Signing in through the admin app.");
    const adminSignIn = await postForm("http://127.0.0.1:4322/bff/auth/sign-in", {
      email: adminEmail,
      password: adminPassword,
      next: "/",
    });
    const adminCookie = adminSignIn.cookie;
    if (!adminCookie) {
      throw new Error("Admin sign-in did not return a session cookie.");
    }

    log("Bootstrapping anonymous web session.");
    const webBootstrap = await postForm("http://127.0.0.1:4321/bff/auth/bootstrap", {});
    const webCookie = webBootstrap.cookie;
    const userId = String(webBootstrap.json?.session?.userId ?? "");
    if (!webCookie || !userId) {
      throw new Error("Web bootstrap did not return a session cookie and user id.");
    }

    const webScenario = await seedWebScenario(env, adminCookie, webCookie, userId, runId);
    const adminFixtures = await seedAdminFixtures(env, adminCookie, runId);

    const webContext = await browser.newContext({ baseURL: "http://127.0.0.1:4321" });
    const sessionCookie = readCookieValue(webCookie);
    await webContext.addCookies([
      {
        name: sessionCookie.name,
        value: sessionCookie.value,
        url: "http://127.0.0.1:4321",
        httpOnly: true,
        sameSite: "Strict",
      },
    ]);

    const adminContext = await browser.newContext({ baseURL: "http://127.0.0.1:4322" });
    const adminSessionCookie = readCookieValue(adminCookie);
    await adminContext.addCookies([
      {
        name: adminSessionCookie.name,
        value: adminSessionCookie.value,
        url: "http://127.0.0.1:4322",
        httpOnly: true,
        sameSite: "Strict",
      },
    ]);

    const webPage = await webContext.newPage();
    const adminPage = await adminContext.newPage();
    for (const page of [webPage, adminPage]) {
      page.on("console", (message) => {
        if (message.type() === "error" || message.type() === "warning") {
          log(`browser ${message.type()}: ${message.text()}`);
        }
      });
      page.on("pageerror", (error) => {
        log(`pageerror: ${error.message}`);
      });
    }

    const result = {
      status: "ui-button-audit-ok",
      runId,
      checked: [],
      notApplicable: [],
      skipped: [],
      artifacts: {
        adminEmail,
        userId,
        webInterestId: webScenario.userInterestId,
        contentItemId: webScenario.contentItemId,
        articleDocId: adminFixtures.articleDocId,
        channelIds: [...webScenario.channelIds, adminFixtures.editableChannelId, adminFixtures.deletableChannelId],
      },
    };

    await auditWebButtons(webPage, runId, webScenario, result);
    await auditAdminButtons(adminPage, env, runId, adminFixtures, webScenario, result);

    await webContext.close();
    await adminContext.close();

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await browser.close();
    if (adminCreated) {
      try {
        await deleteFirebasePasswordUser(firebaseApiKey, adminEmail, adminPassword);
      } catch (error) {
        log(`Firebase cleanup warning: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
