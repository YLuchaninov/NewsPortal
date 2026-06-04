import http from "node:http";
import { randomUUID } from "node:crypto";

import {
  ensureFirebasePasswordUser,
  postForm,
  postJson,
  queryPostgresRows,
  readAllowlistEntries,
  readEnvFile,
  requireConfigured,
  runCommand,
  runCompose,
  runComposeCapture,
  selectAdminEmail,
  createWaitFor,
  sqlLiteral,
} from "./lib/compose-proof-testkit.mjs";

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

const waitFor = createWaitFor({ timeoutMs: 180000, intervalMs: 2000 });
const SOAK_CHANNEL_COUNT = 60;
const SOAK_WORKER_PROGRESS_TIMEOUT_MS = 420000;

function getComposeServiceContainerId(service) {
  return runComposeCapture("ps", "-q", service).stdout.trim();
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
  const result = runComposeCapture("exec", "-T", service, "wget", "-qO-", url);
  const text = result.stdout.trim();

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
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
    <title>SignalOps multi RSS fixture</title>
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
    userAgent: "SignalOpsFetchers/multi-flow-proof",
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
  const firebaseApiKey = requireConfigured(env, "FIREBASE_WEB_API_KEY", {
    proofName: "RSS multi-flow proof",
  });
  const allowlistEntries = readAllowlistEntries(env);
  const runId = randomUUID().slice(0, 8);
  const adminEmail = selectAdminEmail(allowlistEntries, runId, {
    prefix: "rss-admin",
  });
  const adminPassword = `SignalOps!${runId}`;
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
    const bulkResponse = (
      await postJson(
        "http://127.0.0.1:4322/bff/admin/channels/bulk",
        {
          channels: bulkPayload
        },
        {
          cookie: adminCookie,
          expectStatus: 200
        }
      )
    ).json;
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
      "@signalops/fetchers",
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
        summary.articleCount === successfulCount && summary.progressedCount === successfulCount,
      {
        timeoutMs:
          options.channelCount >= SOAK_CHANNEL_COUNT ? SOAK_WORKER_PROGRESS_TIMEOUT_MS : undefined,
        describeLastValue: (summary) =>
          `articleCount=${summary.articleCount}, progressedCount=${summary.progressedCount}, expected=${successfulCount}`
      }
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
              and event_type = 'article.ingest.requested'
              and status = 'published'
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
              and event_type = 'article.normalized'
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
    )[0] ?? ["0", "0", "0", "0"];
    const firstArticleCount = Number.parseInt(firstCycleCounts[0] ?? "0", 10);
    const ingestOutboxCount = Number.parseInt(firstCycleCounts[1] ?? "0", 10);
    const normalizedOutboxCount = Number.parseInt(firstCycleCounts[2] ?? "0", 10);
    const processedInboxCount = Number.parseInt(firstCycleCounts[3] ?? "0", 10);
    const publishedOutboxCount = ingestOutboxCount + normalizedOutboxCount;

    if (firstArticleCount !== successfulCount) {
      throw new Error(`Expected ${successfulCount} successful article rows, got ${firstArticleCount}.`);
    }
    if (ingestOutboxCount < successfulCount) {
      throw new Error(
        `Expected at least ${successfulCount} published article ingest outbox events, got ${ingestOutboxCount}.`
      );
    }
    // Sequence-runtime pipelines suppress downstream article.normalized outbox fanout while still
    // recording normalize/dedup inbox consumption for the original ingest event. Legacy fanout may
    // still publish article.normalized, so accept either topology but reject partial normalized fanout.
    if (normalizedOutboxCount > 0 && normalizedOutboxCount < successfulCount) {
      throw new Error(
        `Expected either no normalized outbox fanout or at least ${successfulCount} published article.normalized events, got ${normalizedOutboxCount}.`
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
      "@signalops/fetchers",
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
