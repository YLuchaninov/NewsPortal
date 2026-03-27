import http from "node:http";
import https from "node:https";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
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
  "infra/docker/compose.dev.yml"
];
const SUCCESS_STATES = ["deduped", "embedded", "clustered", "matched", "notified"];
const PROFILE_SEQUENCE = [
  "healthy",
  "healthy",
  "healthy",
  "healthy",
  "duplicate",
  "healthy",
  "healthy",
  "not_modified",
  "healthy",
  "invalid_xml",
  "healthy",
  "timeout"
];
const ALLOWED_PROFILES = new Set(PROFILE_SEQUENCE);

function log(message) {
  console.log(`[rss-multi-flow] ${message}`);
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit"
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
    stderr: result.stderr ?? ""
  };
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
  const value = String(env[key] ?? "").trim();
  if (!value || value === "replace-me") {
    throw new Error(`.env.dev must set ${key} before RSS multi-flow proof can run.`);
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

  return `${email.slice(0, atIndex)}+rss-admin-${runId}${email.slice(atIndex)}`;
}

function selectAdminEmail(allowlistEntries, runId) {
  const domainEntry = allowlistEntries.find((entry) => entry.startsWith("@"));
  if (domainEntry) {
    return `rss-admin-${runId}${domainEntry}`;
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

async function sendRequest(url, { method = "GET", headers = {}, body = "" } = {}) {
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
          ...headers
        }
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
            text
          });
        });
      }
    );

    request.on("error", reject);
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
      "Content-Length": Buffer.byteLength(body).toString()
    },
    body
  });

  return {
    cookie: response.headers["set-cookie"] ? extractCookie(response.headers["set-cookie"]) : null,
    json: parseJsonResponse(response.text, response)
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
      "Content-Length": Buffer.byteLength(body).toString()
    },
    body
  });

  return parseJsonResponse(response.text, response);
}

async function waitFor(label, producer, predicate, { timeoutMs = 180000, intervalMs = 2000 } = {}) {
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

async function ensureFirebasePasswordUser(apiKey, email, password) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true
      })
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

function runCompose(...args) {
  runCommand("docker", [...composeArgs, ...args]);
}

function getComposeServiceContainerId(service) {
  return runCommand("docker", [...composeArgs, "ps", "-q", service], {
    capture: true
  }).stdout.trim();
}

function getContainerHealthStatus(containerId) {
  return runCommand(
    "docker",
    [
      "inspect",
      "--format",
      "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}",
      containerId
    ],
    {
      capture: true
    }
  ).stdout.trim();
}

function fetchComposeJson(service, url) {
  const result = runCommand(
    "docker",
    [...composeArgs, "exec", "-T", service, "wget", "-qO-", url],
    {
      capture: true
    }
  );
  const text = result.stdout.trim();

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
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
      sql
    ],
    {
      capture: true
    }
  );
  return result.stdout.trim();
}

function queryPostgresRows(env, sql) {
  const output = queryPostgres(env, sql);
  return output
    ? output
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => line.split("|"))
    : [];
}

function parseArgs(argv) {
  const options = {
    channelCount: 24,
    keepStack: false,
    profiles: [...PROFILE_SEQUENCE]
  };

  for (const argument of argv) {
    if (argument.startsWith("--channel-count=")) {
      options.channelCount = Number.parseInt(argument.split("=")[1] ?? "", 10);
      continue;
    }
    if (argument === "--keep-stack") {
      options.keepStack = true;
      continue;
    }
    if (argument.startsWith("--profiles=")) {
      options.profiles = argument
        .split("=")[1]
        .split(",")
        .map((profile) => profile.trim())
        .filter(Boolean);
    }
  }

  if (!Number.isInteger(options.channelCount) || options.channelCount <= 0) {
    throw new Error("--channel-count must be a positive integer.");
  }

  if (options.profiles.length === 0) {
    throw new Error("--profiles must include at least one fixture profile.");
  }

  const unsupportedProfiles = options.profiles.filter((profile) => !ALLOWED_PROFILES.has(profile));
  if (unsupportedProfiles.length > 0) {
    throw new Error(
      `--profiles includes unsupported values: ${unsupportedProfiles.join(", ")}.`
    );
  }

  return options;
}

function buildFixtureXml({ title, guid, url, summary, body, publishedAt }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>NewsPortal multi RSS fixture</title>
    <language>en-US</language>
    <item>
      <guid>${guid}</guid>
      <title><![CDATA[${title}]]></title>
      <link>${url}</link>
      <description><![CDATA[${summary}]]></description>
      <content:encoded><![CDATA[<p>${body}</p>]]></content:encoded>
      <pubDate>${publishedAt}</pubDate>
    </item>
  </channel>
</rss>`;
}

function buildFixtures(runId, channelCount, profiles) {
  return Array.from({ length: channelCount }, (_, index) => {
    const fixtureIndex = index + 1;
    const profile = profiles[index % profiles.length];
    const channelKey = `${runId}-${String(fixtureIndex).padStart(3, "0")}`;
    const publishedAt = new Date(Date.UTC(2026, 2, 20, 8, fixtureIndex, 0)).toUTCString();
    const title = `RSS multi fixture ${profile} ${channelKey}`;
    const url = `https://example.com/rss/${channelKey}`;

    return {
      channelKey,
      profile,
      name: `RSS multi ${channelKey} ${profile}`,
      path: `/feeds/${channelKey}.xml`,
      requestCount: 0,
      notModifiedCount: 0,
      xml: buildFixtureXml({
        title,
        guid: `guid-${channelKey}`,
        url,
        summary: `Synthetic RSS summary for ${channelKey}.`,
        body: `Synthetic RSS body for ${channelKey}.`,
        publishedAt
      })
    };
  });
}

async function startFixtureServer(fixtures) {
  const fixtureMap = new Map(fixtures.map((fixture) => [fixture.path, fixture]));
  const server = http.createServer((request, response) => {
    const fixture = fixtureMap.get(request.url ?? "");
    if (!fixture) {
      response.writeHead(404);
      response.end("not found");
      return;
    }

    fixture.requestCount += 1;
    const etag = `"${fixture.channelKey}-v1"`;
    const lastModified = "Fri, 20 Mar 2026 09:00:00 GMT";

    if (fixture.profile === "timeout") {
      setTimeout(() => {
        response.writeHead(200, {
          "content-type": "application/rss+xml; charset=utf-8",
          Connection: "close",
          ETag: etag,
          "Last-Modified": lastModified
        });
        response.end(fixture.xml);
      }, 1500);
      return;
    }

    if (
      fixture.profile === "not_modified" &&
      (request.headers["if-none-match"] === etag ||
        request.headers["if-modified-since"] === lastModified)
    ) {
      fixture.notModifiedCount += 1;
      response.writeHead(304, {
        Connection: "close",
        ETag: etag,
        "Last-Modified": lastModified
      });
      response.end();
      return;
    }

    if (fixture.profile === "invalid_xml") {
      response.writeHead(200, {
        "content-type": "application/rss+xml; charset=utf-8",
        Connection: "close",
        ETag: etag,
        "Last-Modified": lastModified
      });
      response.end("<html>broken rss fixture</html>");
      return;
    }

    response.writeHead(200, {
      "content-type": "application/rss+xml; charset=utf-8",
      Connection: "close",
      ETag: etag,
      "Last-Modified": lastModified
    });
    response.end(fixture.xml);
  });

  await new Promise((resolve, reject) => {
    server.listen(0, "0.0.0.0", () => resolve());
    server.on("error", reject);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Fixture server did not bind to a TCP port.");
  }

  return {
    port: address.port,
    close: async () => {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  };
}

function buildBulkChannels(fixtures, port) {
  return fixtures.map((fixture) => ({
    name: fixture.name,
    providerType: "rss",
    fetchUrl: `http://host.docker.internal:${port}${fixture.path}`,
    language: "en",
    pollIntervalSeconds: 1,
    maxItemsPerPoll: 5,
    requestTimeoutMs: fixture.profile === "timeout" ? 250 : 4000,
    userAgent: "NewsPortalFetchers/multi-flow-proof",
    preferContentEncoded: fixture.profile !== "duplicate",
    isActive: true
  }));
}

function collectExpectedCounts(fixtures) {
  const successfulProfiles = new Set(["healthy", "duplicate", "not_modified"]);
  const successfulFixtures = fixtures.filter((fixture) => successfulProfiles.has(fixture.profile));
  const failedFixtures = fixtures.filter((fixture) => !successfulProfiles.has(fixture.profile));

  return {
    successfulFixtures,
    failedFixtures,
    successfulCount: successfulFixtures.length,
    failedCount: failedFixtures.length
  };
}

function verifyFixtureServerState(fixtures) {
  const notModifiedFixtures = fixtures.filter((fixture) => fixture.profile === "not_modified");
  const duplicateFixtures = fixtures.filter((fixture) => fixture.profile === "duplicate");

  if (notModifiedFixtures.some((fixture) => fixture.notModifiedCount < 1)) {
    throw new Error("Expected at least one 304 response for every not_modified RSS fixture.");
  }

  if (duplicateFixtures.some((fixture) => fixture.requestCount < 2)) {
    throw new Error("Expected duplicate RSS fixtures to be fetched at least twice.");
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const env = await readEnvFile(".env.dev");
  const firebaseApiKey = requireConfigured(env, "FIREBASE_WEB_API_KEY");
  const allowlistEntries = readAllowlistEntries(env);
  const runId = randomUUID().slice(0, 8);
  const adminEmail = selectAdminEmail(allowlistEntries, runId);
  const adminPassword = `NewsPortal!${runId}`;
  const fixtures = buildFixtures(runId, options.channelCount, options.profiles);
  const { successfulFixtures, failedFixtures, successfulCount, failedCount } =
    collectExpectedCounts(fixtures);
  const fixtureServer = await startFixtureServer(fixtures);
  let stackStarted = false;
  let keepStack = options.keepStack;

  try {
    log(
      `Starting compose.dev stack for ${options.channelCount} RSS channels with profiles ${options.profiles.join(", ")}.`
    );
    runCompose(
      "up",
      "--build",
      "-d",
      "postgres",
      "redis",
      "migrate",
      "relay",
      "fetchers",
      "worker",
      "admin"
    );
    stackStarted = true;

    await waitFor(
      "worker health",
      async () => {
        const containerId = getComposeServiceContainerId("worker");
        if (!containerId) {
          throw new Error("Worker container id is not available yet.");
        }
        return getContainerHealthStatus(containerId);
      },
      (status) => status === "healthy"
    );
    await waitFor(
      "relay health",
      async () => fetchComposeJson("relay", "http://127.0.0.1:4000/health"),
      (payload) => Boolean(payload)
    );
    await waitFor(
      "fetchers health",
      async () => fetchComposeJson("fetchers", "http://127.0.0.1:4100/health"),
      (payload) => Boolean(payload)
    );
    await waitFor(
      "admin health",
      async () => {
        const response = await fetch("http://127.0.0.1:4322/api/health");
        if (!response.ok) {
          throw new Error(`Admin responded with ${response.status}`);
        }
        return response.json();
      },
      (payload) => Boolean(payload)
    );

    log("Bootstrapping admin identity.");
    await ensureFirebasePasswordUser(firebaseApiKey, adminEmail, adminPassword);
    const adminSignIn = await postForm("http://127.0.0.1:4322/bff/auth/sign-in", {
      email: adminEmail,
      password: adminPassword
    });
    const adminCookie = adminSignIn.cookie;
    if (!adminCookie) {
      throw new Error("Admin sign-in did not return a session cookie.");
    }

    log("Creating RSS channels through the admin bulk endpoint.");
    const bulkPayload = buildBulkChannels(fixtures, fixtureServer.port);
    const bulkResponse = await postJson(
      "http://127.0.0.1:4322/bff/admin/channels/bulk",
      {
        channels: bulkPayload
      },
      {
        cookie: adminCookie
      }
    );
    if (Number(bulkResponse?.createdCount ?? 0) !== options.channelCount) {
      throw new Error(
        `Expected ${options.channelCount} created RSS channels, got ${String(bulkResponse?.createdCount ?? "0")}.`
      );
    }

    log("Running the first fetch cycle across all due channels.");
    runCompose(
      "exec",
      "-T",
      "fetchers",
      "pnpm",
      "--filter",
      "@newsportal/fetchers",
      "run:once"
    );

    await waitFor(
      "multi-RSS channel states after first fetch",
      async () => {
        const rows = queryPostgresRows(
          env,
          `
            select
              count(*)::int,
              count(*) filter (where last_fetch_at is not null)::int,
              count(*) filter (where last_success_at is not null)::int,
              count(*) filter (where coalesce(last_error_message, '') <> '')::int
            from source_channels
            where name like ${sqlLiteral(`RSS multi ${runId}%`)};
          `
        )[0] ?? ["0", "0", "0", "0"];

        return {
          totalChannels: Number.parseInt(rows[0] ?? "0", 10),
          fetchedChannels: Number.parseInt(rows[1] ?? "0", 10),
          successfulChannels: Number.parseInt(rows[2] ?? "0", 10),
          failedChannels: Number.parseInt(rows[3] ?? "0", 10)
        };
      },
      (summary) =>
        summary.totalChannels === options.channelCount &&
        summary.fetchedChannels === options.channelCount &&
        summary.successfulChannels >= successfulCount &&
        summary.failedChannels >= failedCount
    );

    await waitFor(
      "deduped worker progression for successful RSS channels",
      async () => {
        const rows = queryPostgresRows(
          env,
          `
            select
              count(*)::int,
              count(*) filter (
                where processing_state in (${SUCCESS_STATES.map((state) => sqlLiteral(state)).join(", ")})
              )::int
            from articles
            where channel_id in (
              select channel_id
              from source_channels
              where name like ${sqlLiteral(`RSS multi ${runId}%`)}
            );
          `
        )[0] ?? ["0", "0"];

        return {
          articleCount: Number.parseInt(rows[0] ?? "0", 10),
          progressedCount: Number.parseInt(rows[1] ?? "0", 10)
        };
      },
      (summary) =>
        summary.articleCount === successfulCount && summary.progressedCount === successfulCount
    );

    const firstCycleCounts = queryPostgresRows(
      env,
      `
        select
          (
            select count(*)::int
            from articles
            where channel_id in (
              select channel_id
              from source_channels
              where name like ${sqlLiteral(`RSS multi ${runId}%`)}
            )
          ),
          (
            select count(*)::int
            from outbox_events
            where
              aggregate_type = 'article'
              and aggregate_id in (
                select doc_id
                from articles
                where channel_id in (
                  select channel_id
                  from source_channels
                  where name like ${sqlLiteral(`RSS multi ${runId}%`)}
                )
              )
              and event_type in ('article.ingest.requested', 'article.normalized')
              and status = 'published'
          ),
          (
            select count(*)::int
            from inbox_processed_events
            where consumer_name in ('worker.normalize', 'worker.dedup')
              and event_id in (
                select event_id
                from outbox_events
                where aggregate_type = 'article'
                  and aggregate_id in (
                    select doc_id
                    from articles
                    where channel_id in (
                      select channel_id
                      from source_channels
                      where name like ${sqlLiteral(`RSS multi ${runId}%`)}
                    )
                  )
              )
          )
      `
    )[0] ?? ["0", "0", "0"];
    const firstArticleCount = Number.parseInt(firstCycleCounts[0] ?? "0", 10);
    const publishedOutboxCount = Number.parseInt(firstCycleCounts[1] ?? "0", 10);
    const processedInboxCount = Number.parseInt(firstCycleCounts[2] ?? "0", 10);

    if (firstArticleCount !== successfulCount) {
      throw new Error(`Expected ${successfulCount} successful article rows, got ${firstArticleCount}.`);
    }
    if (publishedOutboxCount < successfulCount * 2) {
      throw new Error(
        `Expected at least ${successfulCount * 2} published article outbox events, got ${publishedOutboxCount}.`
      );
    }
    if (processedInboxCount < successfulCount * 2) {
      throw new Error(
        `Expected at least ${successfulCount * 2} normalize/dedup inbox rows, got ${processedInboxCount}.`
      );
    }

    if (failedFixtures.length > 0) {
      const invalidRows = queryPostgresRows(
        env,
        `
          select
            name,
            coalesce(last_error_message, '')
          from source_channels
          where name in (${failedFixtures.map((fixture) => sqlLiteral(fixture.name)).join(", ")})
          order by name
        `
      );
      if (invalidRows.some(([, errorMessage]) => !errorMessage)) {
        throw new Error(
          "Expected every failing RSS fixture to persist a non-empty last_error_message."
        );
      }
    }

    await waitFor(
      "all multi-RSS channels to become due for the second fetch",
      async () => {
        const rows = queryPostgresRows(
          env,
          `
            select count(*)::int
            from source_channels
            where
              name like ${sqlLiteral(`RSS multi ${runId}%`)}
              and last_fetch_at <= now() - interval '1 second'
          `
        )[0] ?? ["0"];

        return Number.parseInt(rows[0] ?? "0", 10);
      },
      (dueCount) => dueCount === options.channelCount
    );

    log("Running the second fetch cycle for idempotency and 304 coverage.");
    runCompose(
      "exec",
      "-T",
      "fetchers",
      "pnpm",
      "--filter",
      "@newsportal/fetchers",
      "run:once"
    );

    await waitFor(
      "stable article and outbox counts after second fetch",
      async () => {
        const rows = queryPostgresRows(
          env,
          `
            select
              (
                select count(*)::int
                from articles
                where channel_id in (
                  select channel_id
                  from source_channels
                  where name like ${sqlLiteral(`RSS multi ${runId}%`)}
                )
              ),
              (
                select count(*)::int
                from outbox_events
                where
                  aggregate_type = 'article'
                  and aggregate_id in (
                    select doc_id
                    from articles
                    where channel_id in (
                      select channel_id
                      from source_channels
                      where name like ${sqlLiteral(`RSS multi ${runId}%`)}
                    )
                  )
                  and event_type in ('article.ingest.requested', 'article.normalized')
                  and status = 'published'
              )
          `
        )[0] ?? ["0", "0"];

        return {
          articleCount: Number.parseInt(rows[0] ?? "0", 10),
          outboxCount: Number.parseInt(rows[1] ?? "0", 10)
        };
      },
      (summary) =>
        summary.articleCount === firstArticleCount &&
        summary.outboxCount === publishedOutboxCount
    );

    verifyFixtureServerState(fixtures);

    const failedChannelNames = failedFixtures.map((fixture) => fixture.name).join(", ");
    const successfulChannelNames = successfulFixtures.slice(0, 3).map((fixture) => fixture.name).join(", ");
    log(
      `RSS multi-flow proof passed for ${options.channelCount} channels. Healthy sample: ${successfulChannelNames}. Failing sample: ${failedChannelNames || "none"}.`
    );
  } finally {
    await fixtureServer.close();
    if (stackStarted && !keepStack) {
      log("Stopping compose.dev stack.");
      runCompose("down", "-v", "--remove-orphans");
    }
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
