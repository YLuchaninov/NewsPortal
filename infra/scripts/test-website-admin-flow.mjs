import http from "node:http";
import https from "node:https";
import { randomUUID } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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

function log(message) {
  console.log(`[website-admin] ${message}`);
}

function buildStaleStackError(label, url) {
  const error = new Error(
    `Compose stack is missing ${label} at ${url}. Rebuild the local stack with pnpm dev:mvp:internal before running pnpm test:website:admin:compose.`
  );
  error.fatal = true;
  return error;
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
  const value = String(env[key] ?? "").trim();
  if (!value || value === "replace-me") {
    throw new Error(`.env.dev must set ${key} before website admin acceptance can run.`);
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
  return `${email.slice(0, atIndex)}+website-admin-${runId}${email.slice(atIndex)}`;
}

function selectAdminEmail(allowlistEntries, runId) {
  const domainEntry = allowlistEntries.find((entry) => entry.startsWith("@"));
  if (domainEntry) {
    return `website-admin-${runId}${domainEntry}`;
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
  });

  return {
    cookie: response.headers["set-cookie"] ? extractCookie(response.headers["set-cookie"]) : null,
    json: parseJsonResponse(response.text, response),
  };
}

async function postJson(url, payload, { cookie } = {}) {
  const target = new URL(url);
  const body = JSON.stringify(payload);
  const response = await sendRequest(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Origin: target.origin,
      Referer: `${target.origin}/`,
      ...(cookie ? { Cookie: cookie } : {}),
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body).toString(),
    },
    body,
  });

  return {
    cookie: response.headers["set-cookie"] ? extractCookie(response.headers["set-cookie"]) : null,
    json: parseJsonResponse(response.text, response),
  };
}

async function fetchJson(url, { cookie, timeoutMs } = {}) {
  const response = await sendRequest(url, {
    headers: cookie ? { Cookie: cookie } : {},
    timeoutMs,
  });
  return parseJsonResponse(response.text, response);
}

async function assertRouteAvailable(label, url, { cookie } = {}) {
  const response = await sendRequest(url, {
    headers: cookie ? { Cookie: cookie } : {},
  });
  if (response.status === 404) {
    throw buildStaleStackError(label, url);
  }
  if (response.status !== 200) {
    throw new Error(`Expected ${label} at ${url} to respond with 200, got ${response.status}.`);
  }
}

async function assertHtmlContains(url, snippets, { cookie } = {}) {
  const response = await sendRequest(url, {
    headers: cookie ? { Cookie: cookie } : {},
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

async function waitFor(
  label,
  producer,
  predicate,
  { timeoutMs = 180000, intervalMs = 2000 } = {}
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
      if (error && typeof error === "object" && "fatal" in error && error.fatal) {
        throw error;
      }
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  const reason = lastError instanceof Error ? ` Last error: ${lastError.message}` : "";
  throw new Error(`Timed out waiting for ${label}.${reason}`);
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

async function signInFirebasePasswordUser(apiKey, email, password) {
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
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        idToken: session.idToken,
      }),
    }
  );

  const payload = await response.json();
  if (!response.ok) {
    const errorMessage = String(payload?.error?.message ?? "unknown");
    throw new Error(`Firebase admin cleanup failed: ${errorMessage}`);
  }

  return true;
}

function runCompose(...args) {
  runCommand("docker", [...composeArgs, ...args]);
}

function runComposeCapture(...args) {
  return runCommand("docker", [...composeArgs, ...args], { capture: true });
}

function parseHealthPayload(text) {
  const normalized = String(text ?? "").trim();
  if (!normalized) {
    return true;
  }

  try {
    return JSON.parse(normalized);
  } catch {
    return normalized;
  }
}

async function waitForHttpHealth(label, url) {
  await waitFor(
    `${label} health`,
    async () => {
      const response = await sendRequest(url);
      if (response.status !== 200) {
        throw new Error(`${label} responded with ${response.status}.`);
      }
      return parseHealthPayload(response.text);
    },
    (payload) => Boolean(payload)
  );
}

async function waitForFetchersHealth() {
  await waitFor(
    "fetchers health",
    async () => {
      const { stdout } = runComposeCapture(
        "exec",
        "-T",
        "fetchers",
        "wget",
        "-qO-",
        "http://127.0.0.1:4100/health"
      );
      return parseHealthPayload(stdout);
    },
    (payload) => Boolean(payload)
  );
}

async function ensureComposeStack() {
  log("Ensuring compose stack is available for website-admin acceptance.");
  runCompose("up", "-d", ...STACK_SERVICES);
  await Promise.all([
    waitForHttpHealth("api", "http://127.0.0.1:8000/health"),
    waitForFetchersHealth(),
    waitForHttpHealth("admin", "http://127.0.0.1:4322/api/health"),
    waitForHttpHealth("nginx", "http://127.0.0.1:8080/health"),
  ]);
}

function clearCrawlPolicyCache(domain) {
  runCompose(
    "exec",
    "-T",
    "postgres",
    "psql",
    "-U",
    "newsportal",
    "-d",
    "newsportal",
    "-c",
    `delete from crawl_policy_cache where domain = '${domain.replaceAll("'", "''")}';`
  );
}

function buildFixtureServerScript() {
  return `
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";

const runId = process.argv[process.argv.length - 2];
const statePath = process.argv[process.argv.length - 1];
const editorialHtml = ${editorialHtml.toString()};
const entityHtml = ${entityHtml.toString()};
const state = {
  pid: null,
  port: null,
  apiAuthorizationHeaders: [],
};

function persistState() {
  writeFileSync(statePath, JSON.stringify(state));
}

const server = createServer((request, response) => {
  const host = request.headers.host ?? "127.0.0.1";
  const baseUrl = \`http://\${host}\`;
  const sitemapUrl = \`\${baseUrl}/sitemap.xml\`;
  const hiddenFeedUrl = \`\${baseUrl}/hidden-feed.xml\`;
  const sitemapEditorialUrl = \`\${baseUrl}/news/sitemap-story-\${runId}.html\`;
  const feedEditorialUrl = \`\${baseUrl}/news/feed-story-\${runId}.html\`;
  const entityUrl = \`\${baseUrl}/profiles/entity-detail-\${runId}.html\`;
  const documentUrl = \`\${baseUrl}/downloads/report-\${runId}.pdf\`;
  const sharedImageUrl = \`\${baseUrl}/media/preview-\${runId}.jpg\`;
  const sitemapTitle = \`Website sitemap story \${runId}\`;
  const feedTitle = \`Website feed story \${runId}\`;
  const entityTitle = \`Website entity \${runId}\`;
  const apiArticleUrl = \`\${baseUrl}/records/api-story-\${runId}\`;

  if (request.url === "/" || request.url === "") {
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
    });
    response.end(\`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Website admin fixture \${runId}</title>
    <link rel="alternate" type="application/rss+xml" href="\${hiddenFeedUrl}">
  </head>
  <body>
    <main>
      <h1>Website admin fixture \${runId}</h1>
      <p>Admin acceptance fixture with projected editorial content plus non-editorial resources.</p>
      <a href="\${entityUrl}">Entity detail \${runId}</a>
      <a href="\${documentUrl}">Quarterly report \${runId}</a>
    </main>
  </body>
</html>\`);
    return;
  }

  if (request.url === "/robots.txt") {
    response.writeHead(200, {
      "content-type": "text/plain; charset=utf-8",
    });
    response.end(\`User-agent: *\\nAllow: /\\nCrawl-delay: 1\\nSitemap: \${sitemapUrl}\\n\`);
    return;
  }

  if (request.url === "/sitemap.xml") {
    response.writeHead(200, {
      "content-type": "application/xml; charset=utf-8",
    });
    response.end(\`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>\${sitemapEditorialUrl}</loc>
    <lastmod>2026-03-30T11:00:00Z</lastmod>
  </url>
</urlset>\`);
    return;
  }

  if (request.url === "/hidden-feed.xml") {
    response.writeHead(200, {
      "content-type": "application/rss+xml; charset=utf-8",
    });
    response.end(\`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Website hidden feed \${runId}</title>
    <link>\${baseUrl}/</link>
    <description>Hidden feed fixture \${runId}</description>
    <item>
      <guid>feed-editorial-\${runId}</guid>
      <title>\${feedTitle}</title>
      <link>\${feedEditorialUrl}</link>
      <description><![CDATA[Feed editorial summary \${runId}.]]></description>
      <content:encoded><![CDATA[<p>Feed editorial summary \${runId}.</p>]]></content:encoded>
      <pubDate>Mon, 30 Mar 2026 12:30:00 GMT</pubDate>
    </item>
  </channel>
</rss>\`);
    return;
  }

  if (request.url === "/api/items") {
    const authorizationHeader = Array.isArray(request.headers.authorization)
      ? request.headers.authorization[0] ?? null
      : request.headers.authorization ?? null;
    state.apiAuthorizationHeaders.push(authorizationHeader);
    persistState();
    response.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(JSON.stringify({
      items: [
        {
          id: \`api-item-\${runId}\`,
          title: \`API fixture story \${runId}\`,
          lead: \`API fixture summary \${runId}\`,
          body: \`API fixture body \${runId} with operator proof text and enough detail for deterministic ingest.\`,
          url: apiArticleUrl,
          publishedAt: "2026-03-30T14:00:00Z",
          language: "en",
        },
      ],
    }));
    return;
  }

  if (request.url === \`/news/sitemap-story-\${runId}.html\`) {
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
    });
    response.end(
      editorialHtml(sitemapTitle, runId, "Sitemap editorial sentinel", sharedImageUrl)
    );
    return;
  }

  if (request.url === \`/news/feed-story-\${runId}.html\`) {
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
    });
    response.end(
      editorialHtml(feedTitle, runId, "Feed editorial sentinel", sharedImageUrl)
    );
    return;
  }

  if (request.url === \`/profiles/entity-detail-\${runId}.html\`) {
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
    });
    response.end(entityHtml(entityTitle, runId));
    return;
  }

  if (request.url === \`/downloads/report-\${runId}.pdf\`) {
    response.writeHead(200, {
      "content-type": "application/pdf",
    });
    response.end(\`PDF fixture body \${runId} with enough text for deterministic document extraction.\`);
    return;
  }

  if (request.url === \`/media/preview-\${runId}.jpg\`) {
    response.writeHead(200, {
      "content-type": "image/jpeg",
    });
    response.end("fixture-image");
    return;
  }

  response.writeHead(404, {
    "content-type": "text/plain; charset=utf-8",
  });
  response.end("not found");
});

server.listen(0, "127.0.0.1", async () => {
  const address = server.address();
  if (!address || typeof address === "string") {
    process.exit(1);
    return;
  }

  state.pid = process.pid;
  state.port = address.port;
  persistState();
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    server.close(() => {
      process.exit(0);
    });
  });
}
`;
}

function editorialHtml(title, runId, label, imageUrl) {
  const paragraphs = Array.from(
    { length: 8 },
    (_, index) =>
      `<p>${label} ${runId} paragraph ${index + 1} with Brussels evidence trails, regulatory context, and operator notes.</p>`
  ).join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${title}</title>
    <meta name="description" content="${label} ${runId} summary">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${label} ${runId} summary">
    <meta property="og:image" content="${imageUrl}">
  </head>
  <body>
    <article>
      <h1>${title}</h1>
      ${paragraphs}
      <img src="${imageUrl}" alt="${title}">
    </article>
  </body>
</html>`;
}

function entityHtml(title, runId) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${title}</title>
    <meta name="description" content="Entity detail ${runId}">
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      <p>Entity profile ${runId} with structured attributes and a durable ownership surface.</p>
      <dl>
        <dt>Region</dt>
        <dd>Europe</dd>
        <dt>Focus</dt>
        <dd>Policy implementation</dd>
      </dl>
      <table>
        <tr><th>Employees</th><td>42</td></tr>
        <tr><th>Founded</th><td>2021</td></tr>
      </table>
    </main>
  </body>
</html>`;
}

async function startFixtureServer(runId) {
  const statePath = `/tmp/newsportal-website-admin-fixture-${runId}.json`;
  const remoteScriptPath = `/tmp/newsportal-website-admin-fixture-${runId}.mjs`;
  const localScriptPath = path.join("/tmp", `newsportal-website-admin-fixture-${runId}.mjs`);

  await writeFile(localScriptPath, buildFixtureServerScript(), "utf8");
  try {
    runCompose("cp", localScriptPath, `fetchers:${remoteScriptPath}`);
  } finally {
    await rm(localScriptPath, { force: true });
  }

  runCompose(
    "exec",
    "-T",
    "-d",
    "fetchers",
    "node",
    remoteScriptPath,
    runId,
    statePath
  );

  const readState = async () =>
    JSON.parse(runComposeCapture("exec", "-T", "fetchers", "cat", statePath).stdout);
  const state = await waitFor(
    "fetchers website fixture readiness",
    readState,
    (payload) =>
      Number.isInteger(payload?.pid) &&
      Number.isInteger(payload?.port) &&
      payload.port > 0
  );

  return {
    port: state.port,
    readState,
    close: async () => {
      try {
        runCompose(
          "exec",
          "-T",
          "fetchers",
          "node",
          "--input-type=module",
          "-e",
          "process.kill(Number(process.argv[1]), 'SIGTERM')",
          String(state.pid)
        );
      } catch {
        // best effort cleanup for detached fixture processes
      }
      try {
        runCompose("exec", "-T", "fetchers", "rm", "-f", statePath, remoteScriptPath);
      } catch {
        // best effort cleanup for copied fixture assets
      }
    },
  };
}

async function main() {
  const runId = randomUUID();
  const env = await readEnvFile(".env.dev");
  const firebaseApiKey = requireConfigured(env, "FIREBASE_WEB_API_KEY");
  const allowlistEntries = readAllowlistEntries(env);
  const adminEmail = selectAdminEmail(allowlistEntries, runId);
  const adminPassword = `WebsiteAdmin!${runId.slice(0, 10)}`;
  await ensureComposeStack();
  const fixtureServer = await startFixtureServer(runId);

  let adminCookie;
  try {
    await ensureFirebasePasswordUser(firebaseApiKey, adminEmail, adminPassword);

    log("Signing in through the admin app.");
    const adminSignIn = await postForm("http://127.0.0.1:4322/bff/auth/sign-in", {
      email: adminEmail,
      password: adminPassword,
    });
    adminCookie = adminSignIn.cookie;
    if (!adminCookie) {
      throw new Error("Admin sign-in did not return a session cookie.");
    }

    const adminSession = await fetchJson("http://127.0.0.1:4322/bff/session", {
      cookie: adminCookie,
    });
    if (!adminSession?.session?.roles?.includes?.("admin")) {
      throw new Error("Admin session does not contain the admin role after allowlist bootstrap.");
    }

    log("Preflighting website resources surfaces.");
    await assertRouteAvailable(
      "maintenance web-resources API",
      "http://127.0.0.1:8000/maintenance/web-resources?page=1&pageSize=1"
    );
    await assertRouteAvailable("admin resources page", "http://127.0.0.1:4322/resources", {
      cookie: adminCookie,
    });

    const channelName = `Website admin acceptance ${runId}`;
    log("Creating a website channel through the admin surface.");
    const adminChannel = await postForm(
      "http://127.0.0.1:4322/bff/admin/channels",
      {
        providerType: "website",
        name: channelName,
        fetchUrl: `http://127.0.0.1:${fixtureServer.port}/`,
        language: "en",
        maxResourcesPerPoll: "12",
        requestTimeoutMs: "5000",
        totalPollTimeoutMs: "20000",
        crawlDelayMs: "250",
        sitemapDiscoveryEnabled: "true",
        feedDiscoveryEnabled: "true",
        collectionDiscoveryEnabled: "true",
        downloadDiscoveryEnabled: "true",
        browserFallbackEnabled: "false",
      },
      {
        cookie: adminCookie,
      }
    );
    const channelId = String(adminChannel.json?.channelId ?? "");
    if (!channelId) {
      throw new Error("Admin website channel creation did not return a channelId.");
    }

    const bulkUpdatedChannelName = `${channelName} bulk updated`;
    log("Preflighting a website bulk update matched by fetchUrl.");
    const bulkWebsitePreflight = await postJson(
      "http://127.0.0.1:4322/bff/admin/channels/bulk/preflight",
      {
        providerType: "website",
        channels: [
          {
            providerType: "website",
            name: bulkUpdatedChannelName,
            fetchUrl: `http://127.0.0.1:${fixtureServer.port}/`,
            language: "en",
            isActive: true,
            pollIntervalSeconds: 1200,
            adaptiveEnabled: false,
            maxPollIntervalSeconds: 4800,
            requestTimeoutMs: 5000,
            totalPollTimeoutMs: 20000,
            userAgent: "NewsPortalFetchers/admin-website-bulk",
            maxResourcesPerPoll: 14,
            crawlDelayMs: 250,
            sitemapDiscoveryEnabled: true,
            feedDiscoveryEnabled: true,
            collectionDiscoveryEnabled: true,
            downloadDiscoveryEnabled: true,
            browserFallbackEnabled: true,
            collectionSeedUrls: [`http://127.0.0.1:${fixtureServer.port}/`],
          },
        ],
      },
      {
        cookie: adminCookie,
      }
    );
    if (Number(bulkWebsitePreflight.json?.wouldUpdate ?? 0) !== 1) {
      throw new Error("Website bulk preflight did not detect the expected update target.");
    }
    if (Number(bulkWebsitePreflight.json?.matchedByFetchUrl ?? 0) !== 1) {
      throw new Error("Website bulk preflight did not report the expected fetchUrl match.");
    }

    log("Applying the website bulk update through the admin surface.");
    const bulkWebsiteImport = await postJson(
      "http://127.0.0.1:4322/bff/admin/channels/bulk",
      {
        providerType: "website",
        confirmOverwrite: true,
        channels: [
          {
            providerType: "website",
            name: bulkUpdatedChannelName,
            fetchUrl: `http://127.0.0.1:${fixtureServer.port}/`,
            language: "en",
            isActive: true,
            pollIntervalSeconds: 1200,
            adaptiveEnabled: false,
            maxPollIntervalSeconds: 4800,
            requestTimeoutMs: 5000,
            totalPollTimeoutMs: 20000,
            userAgent: "NewsPortalFetchers/admin-website-bulk",
            maxResourcesPerPoll: 14,
            crawlDelayMs: 250,
            sitemapDiscoveryEnabled: true,
            feedDiscoveryEnabled: true,
            collectionDiscoveryEnabled: true,
            downloadDiscoveryEnabled: true,
            browserFallbackEnabled: true,
            collectionSeedUrls: [`http://127.0.0.1:${fixtureServer.port}/`],
          },
        ],
      },
      {
        cookie: adminCookie,
      }
    );
    if (String(bulkWebsiteImport.json?.updatedChannelIds?.[0] ?? "") !== channelId) {
      throw new Error("Website bulk import did not update the expected existing channel.");
    }

    await waitFor(
      "website bulk update reflection",
      async () =>
        fetchJson(`http://127.0.0.1:8000/channels/${encodeURIComponent(channelId)}`),
      (payload) =>
        String(payload?.name ?? "") === bulkUpdatedChannelName &&
        Number(payload?.poll_interval_seconds ?? 0) === 1200 &&
        Number(payload?.config_json?.maxResourcesPerPoll ?? 0) === 14 &&
        payload?.config_json?.browserFallbackEnabled === true
    );

    log("Clearing crawl policy cache for 127.0.0.1.");
    clearCrawlPolicyCache("127.0.0.1");

    log("Triggering a deterministic website fetch.");
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

    log("Waiting for projected website resources and operator diagnostics.");
    const resourcesPayload = await waitFor(
      "website resources in maintenance API",
      async () =>
        fetchJson(
          `http://127.0.0.1:8000/maintenance/web-resources?channelId=${encodeURIComponent(channelId)}&page=1&pageSize=20`
        ),
      (payload) =>
        Array.isArray(payload?.items) &&
        payload.items.length >= 4 &&
        payload.items.some(
          (item) =>
            String(item.resource_kind ?? "") === "entity" &&
            item.projected_article_id &&
            String(item.extraction_state ?? "") === "enriched" &&
            String(item.title ?? "").trim().length > 0
        ) &&
        payload.items.some(
          (item) =>
            String(item.resource_kind ?? "") === "document" &&
            item.projected_article_id &&
            String(item.extraction_state ?? "") === "enriched" &&
            String(item.title ?? "").trim().length > 0
        ) &&
        payload.items.some(
          (item) =>
            String(item.resource_kind ?? "") === "editorial" &&
            item.projected_article_id &&
            String(item.extraction_state ?? "") === "enriched" &&
            String(item.title ?? "").trim().length > 0
        )
    );
    const latestResourcesPayload = await fetchJson(
      `http://127.0.0.1:8000/maintenance/web-resources?channelId=${encodeURIComponent(channelId)}&page=1&pageSize=20`
    );

    const entityResource = latestResourcesPayload.items.find(
      (item) => String(item.resource_kind ?? "") === "entity"
    );
    const documentResource = latestResourcesPayload.items.find(
      (item) => String(item.resource_kind ?? "") === "document"
    );
    const projectedEditorial = latestResourcesPayload.items.find(
      (item) => String(item.resource_kind ?? "") === "editorial" && item.projected_article_id
    );

    if (!entityResource || !documentResource || !projectedEditorial) {
      throw new Error("Website admin acceptance could not resolve the expected resource mix.");
    }

    await assertHtmlContains(
      `http://127.0.0.1:4322/resources?channelId=${encodeURIComponent(channelId)}`,
      [
        channelName,
        String(entityResource.title ?? ""),
        String(documentResource.title ?? ""),
        String(projectedEditorial.title ?? ""),
        "projection:projected_to_common_pipeline",
      ],
      { cookie: adminCookie }
    );

    await assertHtmlContains(
      `http://127.0.0.1:4322/resources/${encodeURIComponent(String(entityResource.resource_id ?? ""))}`,
      [
        String(entityResource.title ?? ""),
        "Projected into article",
        `/articles/${encodeURIComponent(String(entityResource.projected_article_id ?? ""))}`,
      ],
      { cookie: adminCookie }
    );

    await assertHtmlContains(
      `http://127.0.0.1:4322/resources/${encodeURIComponent(String(projectedEditorial.resource_id ?? ""))}`,
      [
        String(projectedEditorial.title ?? ""),
        "Projected into article",
        `/articles/${encodeURIComponent(String(projectedEditorial.projected_article_id ?? ""))}`,
      ],
      { cookie: adminCookie }
    );

    const projectedArticle = await waitFor(
      "projected editorial article detail",
      async () =>
        fetchJson(
          `http://127.0.0.1:8000/maintenance/articles/${encodeURIComponent(String(projectedEditorial.projected_article_id ?? ""))}`
        ),
      (payload) => String(payload?.doc_id ?? "") === String(projectedEditorial.projected_article_id ?? "")
    );

    console.log(
      JSON.stringify(
        {
          status: "website-admin-ok",
          scope: "rss-and-website-only",
          channelId,
          resourceCount: resourcesPayload.items.length,
          entityResourceId: entityResource.resource_id,
          documentResourceId: documentResource.resource_id,
          projectedArticleId: projectedEditorial.projected_article_id,
          projectedArticleTitle: projectedArticle.title,
          providerChannelsVerified: ["website"],
          parkedIngestionLanes: ["api", "email_imap", "telegram"],
        },
        null,
        2
      )
    );
  } finally {
    clearCrawlPolicyCache("127.0.0.1");
    await fixtureServer.close();
    await deleteFirebasePasswordUser(firebaseApiKey, adminEmail, adminPassword).catch(() => false);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
