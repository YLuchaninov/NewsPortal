import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import type { Pool } from "pg";

import { loadFetchersConfig } from "../config";
import { createPgPool } from "../db";
import { RssFetcherService } from "../fetchers";

interface FetchRunRow {
  outcomeKind: string;
  httpStatus: number | null;
  retryAfterSeconds: number | null;
  errorMessage: string | null;
}

interface RuntimeRow {
  lastResultKind: string | null;
  nextDueAt: string | null;
}

interface WebsiteResourceRow {
  url: string;
  discoverySource: string;
}

interface FixtureState {
  rssAuthorizationHeaders: string[];
  websiteAuthorizationHeaders: string[];
  browserDataAuthorizationHeaders: string[];
  crossOriginAuthorizationHeaders: string[];
}

function readAuthorizationHeader(request: IncomingMessage): string | null {
  const value = request.headers.authorization;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function unauthorized(response: ServerResponse): void {
  response.writeHead(401, {
    "content-type": "text/plain; charset=utf-8",
  });
  response.end("unauthorized");
}

async function startCrossOriginAssetServer(state: FixtureState): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const server = createServer((request: IncomingMessage, response: ServerResponse): void => {
    const authorizationHeader = readAuthorizationHeader(request);
    if (authorizationHeader) {
      state.crossOriginAuthorizationHeaders.push(authorizationHeader);
    }
    response.writeHead(200, {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end("window.__npCrossOriginAssetLoaded = true;");
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => resolve());
    server.on("error", reject);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Cross-origin asset server did not bind to an IPv4 port.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
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

async function startFixtureServer(input: {
  runId: string;
  rssAuthorizationHeader: string;
  websiteAuthorizationHeader: string;
  crossOriginAssetBaseUrl: string;
  state: FixtureState;
}): Promise<{
  baseUrl: string;
  protectedRssUrl: string;
  rateLimitedRssUrl: string;
  staticWebsiteUrl: string;
  browserWebsiteUrl: string;
  close: () => Promise<void>;
}> {
  const server = createServer((request: IncomingMessage, response: ServerResponse): void => {
    const host = request.headers.host ?? "127.0.0.1";
    const baseUrl = `http://${host}`;
    const staticStoryUrl = `${baseUrl}/news/static-story-${input.runId}.html`;
    const browserStoryUrl = `${baseUrl}/news/browser-story-${input.runId}.html`;
    const protectedFeedUrl = `${baseUrl}/protected-feed.xml`;
    const sitemapUrl = `${baseUrl}/sitemap.xml`;
    const browserDataUrl = `${baseUrl}/browser-data.json`;

    if (request.url === "/protected-rss.xml") {
      const authorizationHeader = readAuthorizationHeader(request);
      if (authorizationHeader !== input.rssAuthorizationHeader) {
        unauthorized(response);
        return;
      }
      input.state.rssAuthorizationHeaders.push(authorizationHeader);
      response.writeHead(200, {
        "content-type": "application/rss+xml; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Protected RSS ${input.runId}</title>
    <link>${baseUrl}/</link>
    <description>Protected RSS fixture</description>
    <item>
      <guid>protected-rss-${input.runId}</guid>
      <title>Protected RSS story ${input.runId}</title>
      <link>${baseUrl}/rss-story-${input.runId}.html</link>
      <description><![CDATA[Protected RSS summary ${input.runId}.]]></description>
      <content:encoded><![CDATA[<p>Protected RSS body ${input.runId}.</p>]]></content:encoded>
      <pubDate>Tue, 07 Apr 2026 09:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`);
      return;
    }

    if (request.url === "/rate-limit.xml") {
      response.writeHead(429, {
        "content-type": "text/plain; charset=utf-8",
        "retry-after": "7",
        "cache-control": "no-store",
      });
      response.end("rate limited");
      return;
    }

    const requiresWebsiteAuth = new Set([
      "/",
      "/robots.txt",
      "/llms.txt",
      "/sitemap.xml",
      "/protected-feed.xml",
      "/browser/",
      "/browser-data.json",
      `/news/static-story-${input.runId}.html`,
      `/news/browser-story-${input.runId}.html`
    ]);
    if (request.url && requiresWebsiteAuth.has(request.url)) {
      const authorizationHeader = readAuthorizationHeader(request);
      if (authorizationHeader !== input.websiteAuthorizationHeader) {
        unauthorized(response);
        return;
      }
      input.state.websiteAuthorizationHeaders.push(authorizationHeader);
      if (request.url === "/browser-data.json") {
        input.state.browserDataAuthorizationHeaders.push(authorizationHeader);
      }
    }

    if (request.url === "/robots.txt") {
      response.writeHead(200, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(`User-agent: *\nAllow: /\nSitemap: ${sitemapUrl}\n`);
      return;
    }

    if (request.url === "/llms.txt") {
      response.writeHead(200, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end("# fixture\n");
      return;
    }

    if (request.url === "/" || request.url === "") {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Protected static website ${input.runId}</title>
    <link rel="alternate" type="application/rss+xml" href="${protectedFeedUrl}">
  </head>
  <body>
    <main>
      <h1>Protected static website ${input.runId}</h1>
      <a href="${staticStoryUrl}">Static story ${input.runId}</a>
    </main>
  </body>
</html>`);
      return;
    }

    if (request.url === "/sitemap.xml") {
      response.writeHead(200, {
        "content-type": "application/xml; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${staticStoryUrl}</loc>
    <lastmod>2026-04-07T08:00:00Z</lastmod>
  </url>
</urlset>`);
      return;
    }

    if (request.url === "/protected-feed.xml") {
      response.writeHead(200, {
        "content-type": "application/rss+xml; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Protected website feed ${input.runId}</title>
    <link>${baseUrl}/</link>
    <description>Protected website feed fixture</description>
    <item>
      <guid>website-feed-${input.runId}</guid>
      <title>Protected website feed story ${input.runId}</title>
      <link>${staticStoryUrl}</link>
      <description><![CDATA[Protected website feed summary ${input.runId}.]]></description>
      <content:encoded><![CDATA[<p>Protected website feed body ${input.runId}.</p>]]></content:encoded>
      <pubDate>Tue, 07 Apr 2026 09:15:00 GMT</pubDate>
    </item>
  </channel>
</rss>`);
      return;
    }

    if (request.url === `/news/static-story-${input.runId}.html`) {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Static protected story ${input.runId}</title>
  </head>
  <body>
    <article>
      <h1>Static protected story ${input.runId}</h1>
      <p>Static protected story body ${input.runId}.</p>
    </article>
  </body>
</html>`);
      return;
    }

    if (request.url === "/browser/") {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Protected browser website ${input.runId}</title>
  </head>
  <body>
    <main>
      <h1>Protected browser website ${input.runId}</h1>
      <div id="app"></div>
    </main>
    <script src="${input.crossOriginAssetBaseUrl}/asset.js"></script>
    ${Array.from({ length: 11 }, () => "<script>window.__np = (window.__np || 0) + 1;</script>").join("")}
    <script>
      fetch(${JSON.stringify(browserDataUrl)})
        .then((response) => response.json())
        .then((payload) => {
          const root = document.getElementById("app");
          payload.items.forEach((item) => {
            const card = document.createElement("article");
            const link = document.createElement("a");
            link.href = item.url;
            link.textContent = item.title;
            card.appendChild(link);
            root.appendChild(card);
          });
        });
    </script>
  </body>
</html>`);
      return;
    }

    if (request.url === "/browser-data.json") {
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(
        JSON.stringify({
          items: [
            {
              url: browserStoryUrl,
              title: `Browser protected story ${input.runId}`
            }
          ]
        })
      );
      return;
    }

    if (request.url === `/news/browser-story-${input.runId}.html`) {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Browser protected story ${input.runId}</title>
  </head>
  <body>
    <article>
      <h1>Browser protected story ${input.runId}</h1>
      <p>Browser protected story body ${input.runId}.</p>
    </article>
  </body>
</html>`);
      return;
    }

    response.writeHead(404, {
      "content-type": "text/plain; charset=utf-8",
    });
    response.end("not found");
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => resolve());
    server.on("error", reject);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Auth fixture server did not bind to an IPv4 port.");
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    baseUrl,
    protectedRssUrl: `${baseUrl}/protected-rss.xml`,
    rateLimitedRssUrl: `${baseUrl}/rate-limit.xml`,
    staticWebsiteUrl: `${baseUrl}/`,
    browserWebsiteUrl: `${baseUrl}/browser/`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
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

async function seedRssChannel(
  pool: Pool,
  input: {
    name: string;
    fetchUrl: string;
    authorizationHeader?: string | null;
  }
): Promise<string> {
  const result = await pool.query<{ channelId: string }>(
    `
      insert into source_channels (
        provider_type,
        name,
        fetch_url,
        homepage_url,
        config_json,
        auth_config_json,
        language,
        poll_interval_seconds,
        enrichment_enabled,
        enrichment_min_body_length
      )
      values (
        'rss',
        $1,
        $2,
        $2,
        $3::jsonb,
        $4::jsonb,
        'en',
        300,
        true,
        500
      )
      returning channel_id::text as "channelId"
    `,
    [
      input.name,
      input.fetchUrl,
      JSON.stringify({
        maxItemsPerPoll: 10,
        requestTimeoutMs: 5000,
        userAgent: "NewsPortalFetchers/ChannelAuthSmoke",
        preferContentEncoded: true
      }),
      JSON.stringify(
        input.authorizationHeader ? { authorizationHeader: input.authorizationHeader } : {}
      )
    ]
  );
  return result.rows[0].channelId;
}

async function seedWebsiteChannel(
  pool: Pool,
  input: {
    name: string;
    fetchUrl: string;
    browserFallbackEnabled: boolean;
    sitemapDiscoveryEnabled?: boolean;
    feedDiscoveryEnabled?: boolean;
    authorizationHeader?: string | null;
  }
): Promise<string> {
  const result = await pool.query<{ channelId: string }>(
    `
      insert into source_channels (
        provider_type,
        name,
        fetch_url,
        homepage_url,
        config_json,
        auth_config_json,
        language,
        poll_interval_seconds,
        enrichment_enabled,
        enrichment_min_body_length
      )
      values (
        'website',
        $1,
        $2,
        $2,
        $3::jsonb,
        $4::jsonb,
        'en',
        900,
        true,
        500
      )
      returning channel_id::text as "channelId"
    `,
    [
      input.name,
      input.fetchUrl,
      JSON.stringify({
        maxResourcesPerPoll: 10,
        requestTimeoutMs: 5000,
        totalPollTimeoutMs: 30000,
        userAgent: "NewsPortalFetchers/ChannelAuthSmoke",
        sitemapDiscoveryEnabled: input.sitemapDiscoveryEnabled ?? true,
        feedDiscoveryEnabled: input.feedDiscoveryEnabled ?? true,
        collectionDiscoveryEnabled: true,
        downloadDiscoveryEnabled: false,
        browserFallbackEnabled: input.browserFallbackEnabled,
        maxBrowserFetchesPerPoll: 2,
        allowedUrlPatterns: ["\\/news\\/"],
        blockedUrlPatterns: [],
        collectionSeedUrls: [],
        downloadPatterns: [".pdf", ".csv", ".xlsx", ".json", ".xml", ".zip"],
        crawlDelayMs: 1000,
        classification: {
          enableRoughPageTypeDetection: true,
          minConfidenceForTypedExtraction: 0.45
        },
        extraction: {
          minEditorialBodyLength: 500,
          allowInlineJsonExtraction: true,
          allowBrowserNetworkCapture: true,
          extractTables: true,
          extractDownloads: true
        }
      }),
      JSON.stringify(
        input.authorizationHeader ? { authorizationHeader: input.authorizationHeader } : {}
      )
    ]
  );
  return result.rows[0].channelId;
}

async function pollChannelIgnoringExpectedFailure(
  service: RssFetcherService,
  channelId: string
): Promise<void> {
  try {
    await service.pollChannel(channelId);
  } catch {
    // Expected for the auth-failure and rate-limit fixtures.
  }
}

async function fetchLatestRun(pool: Pool, channelId: string): Promise<FetchRunRow> {
  const result = await pool.query<FetchRunRow>(
    `
      select
        outcome_kind as "outcomeKind",
        http_status as "httpStatus",
        retry_after_seconds as "retryAfterSeconds",
        error_text as "errorMessage"
      from channel_fetch_runs
      where channel_id = $1
      order by started_at desc
      limit 1
    `,
    [channelId]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`Expected a fetch run for channel ${channelId}.`);
  }
  return row;
}

async function fetchRuntime(pool: Pool, channelId: string): Promise<RuntimeRow> {
  const result = await pool.query<RuntimeRow>(
    `
      select
        last_result_kind as "lastResultKind",
        next_due_at::text as "nextDueAt"
      from source_channel_runtime_state
      where channel_id = $1
      limit 1
    `,
    [channelId]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`Expected runtime state for channel ${channelId}.`);
  }
  return row;
}

async function countArticles(pool: Pool, channelId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `
      select count(*)::text as count
      from articles
      where channel_id = $1
    `,
    [channelId]
  );
  return Number.parseInt(result.rows[0]?.count ?? "0", 10);
}

async function fetchWebsiteResources(pool: Pool, channelId: string): Promise<WebsiteResourceRow[]> {
  const result = await pool.query<WebsiteResourceRow>(
    `
      select
        url,
        discovery_source as "discoverySource"
      from web_resources
      where channel_id = $1
      order by url asc
    `,
    [channelId]
  );
  return result.rows;
}

async function cleanupSmokeArtifacts(pool: Pool, channelIds: string[], domain: string): Promise<void> {
  if (channelIds.length === 0) {
    return;
  }

  const articleIds = (
    await pool.query<{ docId: string }>(
      `
        select doc_id::text as "docId"
        from articles
        where channel_id = any($1::uuid[])
      `,
      [channelIds]
    )
  ).rows.map((row) => row.docId);
  const resourceIds = (
    await pool.query<{ resourceId: string }>(
      `
        select resource_id::text as "resourceId"
        from web_resources
        where channel_id = any($1::uuid[])
      `,
      [channelIds]
    )
  ).rows.map((row) => row.resourceId);

  if (articleIds.length > 0 || resourceIds.length > 0) {
    await pool.query(
      `
        delete from sequence_task_runs
        where run_id in (
          select run_id
          from sequence_runs
          where
            context_json ->> 'doc_id' = any($1::text[])
            or context_json ->> 'resource_id' = any($1::text[])
        )
      `,
      [[...articleIds, ...resourceIds]]
    );
    await pool.query(
      `
        delete from sequence_runs
        where
          context_json ->> 'doc_id' = any($1::text[])
          or context_json ->> 'resource_id' = any($1::text[])
      `,
      [[...articleIds, ...resourceIds]]
    );
    await pool.query(
      `
        delete from outbox_events
        where aggregate_id::text = any($1::text[])
      `,
      [[...articleIds, ...resourceIds]]
    );
  }

  await pool.query(
    `
      delete from web_resources
      where channel_id = any($1::uuid[])
    `,
    [channelIds]
  );
  await pool.query(
    `
      delete from articles
      where channel_id = any($1::uuid[])
    `,
    [channelIds]
  );
  await pool.query(
    `
      delete from source_channels
      where channel_id = any($1::uuid[])
    `,
    [channelIds]
  );
  await pool.query(
    `
      delete from crawl_policy_cache
      where domain = $1
    `,
    [domain]
  );
}

async function main(): Promise<void> {
  const runId = randomUUID().slice(0, 8);
  const rssAuthorizationHeader = `Bearer rss-${runId}`;
  const websiteAuthorizationHeader = `Bearer website-${runId}`;
  const fixtureState: FixtureState = {
    rssAuthorizationHeaders: [],
    websiteAuthorizationHeaders: [],
    browserDataAuthorizationHeaders: [],
    crossOriginAuthorizationHeaders: []
  };
  const config = loadFetchersConfig();
  const pool = createPgPool(config);
  const service = new RssFetcherService(pool, config);
  const channelIds: string[] = [];
  let fixtureDomain = "";
  let fixtureServer: Awaited<ReturnType<typeof startFixtureServer>> | null = null;
  let crossOriginServer: Awaited<ReturnType<typeof startCrossOriginAssetServer>> | null = null;

  try {
    crossOriginServer = await startCrossOriginAssetServer(fixtureState);
    fixtureServer = await startFixtureServer({
      runId,
      rssAuthorizationHeader,
      websiteAuthorizationHeader,
      crossOriginAssetBaseUrl: crossOriginServer.baseUrl,
      state: fixtureState
    });
    fixtureDomain = new URL(fixtureServer.baseUrl).hostname.toLowerCase();

    const rssNoAuthChannelId = await seedRssChannel(pool, {
      name: `RSS no auth ${runId}`,
      fetchUrl: fixtureServer.protectedRssUrl
    });
    channelIds.push(rssNoAuthChannelId);

    const rssAuthChannelId = await seedRssChannel(pool, {
      name: `RSS auth ${runId}`,
      fetchUrl: fixtureServer.protectedRssUrl,
      authorizationHeader: rssAuthorizationHeader
    });
    channelIds.push(rssAuthChannelId);

    const rssRateLimitedChannelId = await seedRssChannel(pool, {
      name: `RSS rate limited ${runId}`,
      fetchUrl: fixtureServer.rateLimitedRssUrl
    });
    channelIds.push(rssRateLimitedChannelId);

    const websiteNoAuthChannelId = await seedWebsiteChannel(pool, {
      name: `Website no auth ${runId}`,
      fetchUrl: fixtureServer.staticWebsiteUrl,
      browserFallbackEnabled: false
    });
    channelIds.push(websiteNoAuthChannelId);

    const websiteStaticAuthChannelId = await seedWebsiteChannel(pool, {
      name: `Website static auth ${runId}`,
      fetchUrl: fixtureServer.staticWebsiteUrl,
      browserFallbackEnabled: false,
      authorizationHeader: websiteAuthorizationHeader
    });
    channelIds.push(websiteStaticAuthChannelId);

    const websiteBrowserAuthChannelId = await seedWebsiteChannel(pool, {
      name: `Website browser auth ${runId}`,
      fetchUrl: fixtureServer.browserWebsiteUrl,
      browserFallbackEnabled: true,
      sitemapDiscoveryEnabled: false,
      feedDiscoveryEnabled: false,
      authorizationHeader: websiteAuthorizationHeader
    });
    channelIds.push(websiteBrowserAuthChannelId);

    await pollChannelIgnoringExpectedFailure(service, rssNoAuthChannelId);
    await pollChannelIgnoringExpectedFailure(service, rssAuthChannelId);
    await pollChannelIgnoringExpectedFailure(service, rssRateLimitedChannelId);
    await pollChannelIgnoringExpectedFailure(service, websiteNoAuthChannelId);
    await pollChannelIgnoringExpectedFailure(service, websiteStaticAuthChannelId);
    await pollChannelIgnoringExpectedFailure(service, websiteBrowserAuthChannelId);

    const rssNoAuthRun = await fetchLatestRun(pool, rssNoAuthChannelId);
    assert.equal(rssNoAuthRun.outcomeKind, "hard_failure");
    assert.equal(rssNoAuthRun.httpStatus, 401);
    assert.match(
      rssNoAuthRun.errorMessage ?? "",
      /Authorization header/i
    );

    const rssAuthRun = await fetchLatestRun(pool, rssAuthChannelId);
    assert.equal(rssAuthRun.outcomeKind, "new_content");
    assert.equal(rssAuthRun.httpStatus, 200);
    assert.equal(await countArticles(pool, rssAuthChannelId), 1);
    assert.ok(
      fixtureState.rssAuthorizationHeaders.includes(rssAuthorizationHeader),
      "Expected the protected RSS fixture to receive the configured Authorization header."
    );

    const rssRateLimitRun = await fetchLatestRun(pool, rssRateLimitedChannelId);
    assert.equal(rssRateLimitRun.outcomeKind, "rate_limited");
    assert.equal(rssRateLimitRun.httpStatus, 429);
    assert.equal(rssRateLimitRun.retryAfterSeconds, 7);
    const rssRateLimitRuntime = await fetchRuntime(pool, rssRateLimitedChannelId);
    assert.equal(rssRateLimitRuntime.lastResultKind, "rate_limited");
    assert.ok(rssRateLimitRuntime.nextDueAt, "Expected the rate-limited channel to schedule a next_due_at.");
    assert.ok(
      Date.parse(rssRateLimitRuntime.nextDueAt ?? "") > Date.now() + 5000,
      "Expected next_due_at to honor the Retry-After backoff."
    );

    const websiteNoAuthRun = await fetchLatestRun(pool, websiteNoAuthChannelId);
    assert.equal(websiteNoAuthRun.outcomeKind, "hard_failure");
    assert.equal(websiteNoAuthRun.httpStatus, 401);
    assert.match(
      websiteNoAuthRun.errorMessage ?? "",
      /Authorization header/i
    );

    const websiteStaticRun = await fetchLatestRun(pool, websiteStaticAuthChannelId);
    assert.equal(websiteStaticRun.httpStatus, 200);
    assert.equal(websiteStaticRun.outcomeKind, "new_content");
    const staticResources = await fetchWebsiteResources(pool, websiteStaticAuthChannelId);
    assert.ok(
      staticResources.some((row) => row.url.includes(`/news/static-story-${runId}.html`)),
      "Expected the protected static website channel to discover the protected story."
    );

    const websiteBrowserRun = await fetchLatestRun(pool, websiteBrowserAuthChannelId);
    assert.equal(websiteBrowserRun.httpStatus, 200);
    assert.equal(websiteBrowserRun.outcomeKind, "new_content");
    const browserResources = await fetchWebsiteResources(pool, websiteBrowserAuthChannelId);
    assert.ok(
      browserResources.some((row) => row.discoverySource.startsWith("browser_assisted")),
      "Expected the browser-assisted website channel to persist browser-assisted discoveries."
    );
    assert.ok(
      fixtureState.browserDataAuthorizationHeaders.includes(websiteAuthorizationHeader),
      "Expected the same-origin browser data request to receive the configured Authorization header."
    );
    assert.deepEqual(
      fixtureState.crossOriginAuthorizationHeaders,
      [],
      "Expected cross-origin browser asset requests to omit the channel Authorization header."
    );

    console.log("Channel auth smoke passed.");
  } finally {
    try {
      if (fixtureDomain) {
        await cleanupSmokeArtifacts(pool, channelIds, fixtureDomain);
      }
    } finally {
      await fixtureServer?.close().catch(() => undefined);
      await crossOriginServer?.close().catch(() => undefined);
      await pool.end();
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
