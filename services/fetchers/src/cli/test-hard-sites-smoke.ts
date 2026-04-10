import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import type { Pool } from "pg";

import { loadFetchersConfig } from "../config";
import { createPgPool } from "../db";
import { RssFetcherService } from "../fetchers";
import { ResourceEnrichmentService } from "../resource-enrichment";

interface WaitOptions {
  timeoutMs: number;
  pollIntervalMs: number;
}

interface BrowserResourceRow {
  resourceId: string;
  url: string;
  discoverySource: string;
  extractionState: string;
  projectedArticleId: string | null;
  rawPayloadJson: Record<string, unknown>;
}

interface RuntimeRow {
  lastResultKind: string | null;
  adaptiveReason: string | null;
}

interface SmokeLogger {
  info(payload: unknown, message?: string): void;
  warn(payload: unknown, message?: string): void;
  error(payload: unknown, message?: string): void;
}

const HARD_SITE_FIXTURE_HOST = "127.0.0.3";
const RESOURCE_INGEST_TRIGGER_EVENT = "resource.ingest.requested";
const ARTICLE_INGEST_TRIGGER_EVENT = "article.ingest.requested";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function createSmokeLogger(): SmokeLogger {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
}

async function waitForCondition(
  predicate: () => Promise<boolean>,
  options: WaitOptions
): Promise<void> {
  const deadline = Date.now() + options.timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return;
    }
    await sleep(options.pollIntervalMs);
  }
  throw new Error("Timed out waiting for hard-site smoke assertions.");
}

function editorialHtml(title: string, runId: string): string {
  const paragraphs = Array.from(
    { length: 10 },
    (_, index) => `<p>${title} ${runId} paragraph ${index + 1} with operator-visible browser-assisted provenance.</p>`
  ).join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${title}</title>
    <meta name="description" content="${title} summary ${runId}">
  </head>
  <body>
    <article>
      <h1>${title}</h1>
      ${paragraphs}
    </article>
  </body>
</html>`;
}

function jsHeavyHardSiteHtml(dataUrl: string): string {
  const fillerScripts = Array.from({ length: 11 }, () => "<script>window.__NP = (window.__NP || 0) + 1;</script>").join("");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Browser assisted hard site</title>
  </head>
  <body>
    <main>
      <h1>Hard site</h1>
      <p>JS renders the actual resource links after load.</p>
      <div id="app"></div>
    </main>
    ${fillerScripts}
    <script>
      fetch(${JSON.stringify(dataUrl)})
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
</html>`;
}

function blockedHardSiteHtml(): string {
  const fillerScripts = Array.from({ length: 11 }, () => "<script>window.__BLOCK = true;</script>").join("");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Protected hard site</title>
  </head>
  <body>
    <main>
      <h1>Protected hard site</h1>
      <p>Please complete CAPTCHA verification before accessing this page.</p>
    </main>
    ${fillerScripts}
  </body>
</html>`;
}

async function startFixtureServer(runId: string): Promise<{
  close: () => Promise<void>;
  hardSiteUrl: string;
  blockedSiteUrl: string;
  storyUrl: string;
  entityUrl: string;
}> {
  const server = createServer((request: IncomingMessage, response: ServerResponse): void => {
    const host = request.headers.host ?? "127.0.0.1";
    const baseUrl = `http://${host}`;
    const storyUrl = `${baseUrl}/news/browser-story-${runId}.html`;
    const entityUrl = `${baseUrl}/profiles/browser-entity-${runId}.html`;

    if (request.url === "/robots.txt") {
      response.writeHead(200, {
        "content-type": "text/plain; charset=utf-8",
      });
      response.end("User-agent: *\nAllow: /\n");
      return;
    }

    if (request.url === "/hard-site/") {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
      });
      response.end(jsHeavyHardSiteHtml(`${baseUrl}/browser-data.json`));
      return;
    }

    if (request.url === "/browser-data.json") {
      response.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
      });
      response.end(
        JSON.stringify({
          items: [
            { url: storyUrl, title: `Browser hard story ${runId}` },
            { url: entityUrl, title: `Browser hard entity ${runId}` },
          ],
        })
      );
      return;
    }

    if (request.url === "/blocked/") {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
      });
      response.end(blockedHardSiteHtml());
      return;
    }

    if (request.url === `/news/browser-story-${runId}.html`) {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
      });
      response.end(editorialHtml(`Browser hard story ${runId}`, runId));
      return;
    }

    if (request.url === `/profiles/browser-entity-${runId}.html`) {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
      });
      response.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Browser hard entity ${runId}</title>
  </head>
  <body>
    <main>
      <h1>Browser hard entity ${runId}</h1>
      <dl>
        <dt>Region</dt>
        <dd>EU</dd>
      </dl>
    </main>
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
    server.listen(0, HARD_SITE_FIXTURE_HOST, () => resolve());
    server.on("error", reject);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Hard-site fixture server did not bind to an IPv4 port.");
  }

  const baseUrl = `http://${HARD_SITE_FIXTURE_HOST}:${address.port}`;
  return {
    hardSiteUrl: `${baseUrl}/hard-site/`,
    blockedSiteUrl: `${baseUrl}/blocked/`,
    storyUrl: `${baseUrl}/news/browser-story-${runId}.html`,
    entityUrl: `${baseUrl}/profiles/browser-entity-${runId}.html`,
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
    },
  };
}

async function seedWebsiteChannel(
  pool: Pool,
  siteUrl: string,
  channelLabel: string
): Promise<string> {
  const result = await pool.query<{ channelId: string }>(
    `
      insert into source_channels (
        provider_type,
        name,
        fetch_url,
        homepage_url,
        config_json,
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
        'en',
        3600,
        true,
        500
      )
      returning channel_id::text as "channelId"
    `,
    [
      channelLabel,
      siteUrl,
      JSON.stringify({
        maxResourcesPerPoll: 10,
        requestTimeoutMs: 5000,
        totalPollTimeoutMs: 30000,
        userAgent: "NewsPortalFetchers/HardSiteSmoke",
        sitemapDiscoveryEnabled: false,
        feedDiscoveryEnabled: false,
        collectionDiscoveryEnabled: true,
        downloadDiscoveryEnabled: false,
        browserFallbackEnabled: true,
        maxBrowserFetchesPerPoll: 2,
        allowedUrlPatterns: ["\\/news\\/", "\\/profiles\\/"],
        blockedUrlPatterns: [],
        collectionSeedUrls: [],
        downloadPatterns: [".pdf", ".csv", ".xlsx", ".json", ".xml", ".zip"],
        crawlDelayMs: 1000,
        classification: {
          enableRoughPageTypeDetection: true,
          minConfidenceForTypedExtraction: 0.45,
        },
        extraction: {
          minEditorialBodyLength: 500,
          allowInlineJsonExtraction: true,
          allowBrowserNetworkCapture: true,
          extractTables: true,
          extractDownloads: true,
        },
      }),
    ]
  );
  return result.rows[0].channelId;
}

async function fetchBrowserResources(pool: Pool, channelId: string): Promise<BrowserResourceRow[]> {
  const result = await pool.query<BrowserResourceRow>(
    `
      select
        resource_id::text as "resourceId",
        url,
        discovery_source as "discoverySource",
        extraction_state as "extractionState",
        projected_article_id::text as "projectedArticleId",
        raw_payload_json as "rawPayloadJson"
      from web_resources
      where channel_id = $1
      order by url asc
    `,
    [channelId]
  );
  return result.rows;
}

async function fetchRuntimeRow(pool: Pool, channelId: string): Promise<RuntimeRow | null> {
  const result = await pool.query<RuntimeRow>(
    `
      select
        last_result_kind as "lastResultKind",
        adaptive_reason as "adaptiveReason"
      from source_channel_runtime_state
      where channel_id = $1
      limit 1
    `,
    [channelId]
  );
  return result.rows[0] ?? null;
}

async function fetchLastChannelError(pool: Pool, channelId: string): Promise<string | null> {
  const result = await pool.query<{ lastErrorMessage: string | null }>(
    `
      select last_error_message as "lastErrorMessage"
      from source_channels
      where channel_id = $1
      limit 1
    `,
    [channelId]
  );
  return result.rows[0]?.lastErrorMessage ?? null;
}

async function fetchArticleIds(pool: Pool, channelId: string): Promise<string[]> {
  const result = await pool.query<{ docId: string }>(
    `
      select doc_id::text as "docId"
      from articles
      where channel_id = $1
      order by doc_id asc
    `,
    [channelId]
  );
  return result.rows.map((row) => row.docId);
}

async function countPublishedOutboxEvents(
  pool: Pool,
  eventType: string,
  aggregateIds: string[]
): Promise<number> {
  if (aggregateIds.length === 0) {
    return 0;
  }

  const result = await pool.query<{ count: string }>(
    `
      select count(*)::text as count
      from outbox_events
      where
        event_type = $1
        and status = 'published'
        and aggregate_id::text = any($2::text[])
    `,
    [eventType, aggregateIds]
  );

  return Number(result.rows[0]?.count ?? "0");
}

async function countResourceSequenceRuns(pool: Pool, resourceIds: string[]): Promise<number> {
  if (resourceIds.length === 0) {
    return 0;
  }

  const result = await pool.query<{ count: string }>(
    `
      select count(*)::text as count
      from sequence_runs sr
      join sequences s on s.sequence_id = sr.sequence_id
      where
        s.trigger_event = $1
        and sr.context_json ->> 'resource_id' = any($2::text[])
    `,
    [RESOURCE_INGEST_TRIGGER_EVENT, resourceIds]
  );

  return Number(result.rows[0]?.count ?? "0");
}

async function countArticleSequenceRuns(pool: Pool, articleIds: string[]): Promise<number> {
  if (articleIds.length === 0) {
    return 0;
  }

  const result = await pool.query<{ count: string }>(
    `
      select count(*)::text as count
      from sequence_runs sr
      join sequences s on s.sequence_id = sr.sequence_id
      where
        s.trigger_event = $1
        and sr.context_json ->> 'doc_id' = any($2::text[])
    `,
    [ARTICLE_INGEST_TRIGGER_EVENT, articleIds]
  );

  return Number(result.rows[0]?.count ?? "0");
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
  const sequenceContextIds = [...articleIds, ...resourceIds];

  if (sequenceContextIds.length > 0) {
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
      [sequenceContextIds]
    );
    await pool.query(
      `
        delete from sequence_runs
        where
          context_json ->> 'doc_id' = any($1::text[])
          or context_json ->> 'resource_id' = any($1::text[])
      `,
      [sequenceContextIds]
    );
    await pool.query(
      `
        delete from outbox_events
        where aggregate_id::text = any($1::text[])
      `,
      [sequenceContextIds]
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

async function assertProbeRecommendation(
  baseUrl: string,
  hardSiteUrl: string,
  blockedSiteUrl: string
): Promise<void> {
  const response = await fetch(`${baseUrl}/internal/discovery/websites/probe`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      urls: [hardSiteUrl, blockedSiteUrl],
      sampleCount: 4,
    }),
  });
  if (!response.ok) {
    throw new Error(`Expected hard-site discovery probe endpoint to return 200, got ${response.status}.`);
  }
  const payload = await response.json() as { probed_websites?: Array<Record<string, unknown>> };
  const rows = Array.isArray(payload.probed_websites) ? payload.probed_websites : [];
  const hardSite = rows.find((row) => String(row.url ?? "") === hardSiteUrl);
  const blockedSite = rows.find((row) => String(row.url ?? "") === blockedSiteUrl);
  if (!hardSite || hardSite.browser_assisted_recommended !== true) {
    throw new Error("Expected the hard-site probe to recommend browser assistance.");
  }
  const hardSiteSamples = Array.isArray(hardSite.sample_resources) ? hardSite.sample_resources : [];
  if (hardSiteSamples.length === 0) {
    throw new Error("Expected the hard-site probe to surface browser-discovered sample resources.");
  }
  if (String((hardSiteSamples[0] as Record<string, unknown>).discovery_source ?? "").startsWith("browser_assisted") !== true) {
    throw new Error("Expected the hard-site probe sample to carry browser-assisted provenance.");
  }
  if (!blockedSite || String(blockedSite.challenge_kind ?? "") !== "captcha") {
    throw new Error("Expected the protected hard-site probe to report captcha as an unsupported challenge.");
  }
}

async function assertBrowserIngest(
  pool: Pool,
  resourceEnrichmentService: ResourceEnrichmentService,
  channelId: string,
  storyUrl: string,
  entityUrl: string
): Promise<void> {
  await waitForCondition(
    async () => {
      const rows = await fetchBrowserResources(pool, channelId);
      return rows.length >= 2;
    },
    {
      timeoutMs: 20000,
      pollIntervalMs: 500,
    }
  );

  const discoveredResources = await fetchBrowserResources(pool, channelId);
  for (const resource of discoveredResources) {
    await resourceEnrichmentService.enrichResource(resource.resourceId);
  }

  await waitForCondition(
    async () => {
      const rows = await fetchBrowserResources(pool, channelId);
      const resourceIds = rows.map((row) => row.resourceId);
      const articleIds = await fetchArticleIds(pool, channelId);
      const [
        publishedResourceEvents,
        publishedArticleEvents,
        resourceSequenceRuns,
        articleSequenceRuns,
      ] = await Promise.all([
        countPublishedOutboxEvents(pool, RESOURCE_INGEST_TRIGGER_EVENT, resourceIds),
        countPublishedOutboxEvents(pool, ARTICLE_INGEST_TRIGGER_EVENT, articleIds),
        countResourceSequenceRuns(pool, resourceIds),
        countArticleSequenceRuns(pool, articleIds),
      ]);
      return (
        rows.length >= 2 &&
        rows.every((row) => row.extractionState === "enriched") &&
        rows.some((row) => row.projectedArticleId) &&
        publishedResourceEvents >= 2 &&
        publishedArticleEvents >= 1 &&
        resourceSequenceRuns >= 2 &&
        articleSequenceRuns >= 1
      );
    },
    {
      timeoutMs: 90000,
      pollIntervalMs: 1000,
    }
  );

  const rows = await fetchBrowserResources(pool, channelId);
  const byUrl = new Map(rows.map((row) => [row.url, row]));
  const story = byUrl.get(storyUrl);
  const entity = byUrl.get(entityUrl);
  if (!story || !story.projectedArticleId) {
    throw new Error("Expected the browser-discovered editorial story to project into articles.");
  }
  if (!story.discoverySource.startsWith("browser_assisted")) {
    throw new Error("Expected the browser-discovered editorial story to retain browser-assisted provenance.");
  }
  const storySignals = ((story.rawPayloadJson?.discovery as Record<string, unknown> | undefined)?.rawSignals ?? {}) as Record<string, unknown>;
  if (storySignals.browserAssisted !== true) {
    throw new Error("Expected raw discovery signals to retain browserAssisted=true for the editorial story.");
  }
  if (!entity || entity.projectedArticleId) {
    throw new Error("Expected the browser-discovered entity to remain resource-only.");
  }
  if (!entity.discoverySource.startsWith("browser_assisted")) {
    throw new Error("Expected the browser-discovered entity to retain browser-assisted provenance.");
  }
}

async function assertBlockedFailure(pool: Pool, channelId: string): Promise<void> {
  const runtimeRow = await fetchRuntimeRow(pool, channelId);
  if (runtimeRow?.lastResultKind !== "hard_failure") {
    throw new Error(`Expected blocked hard-site channel to finish with hard_failure, got ${String(runtimeRow?.lastResultKind)}.`);
  }
  const errorMessage = await fetchLastChannelError(pool, channelId);
  if (!errorMessage || !/unsupported captcha/i.test(errorMessage)) {
    throw new Error("Expected blocked hard-site channel to persist an explicit unsupported captcha error.");
  }
}

async function main(): Promise<void> {
  const config = loadFetchersConfig();
  const pool = createPgPool(config);
  const service = new RssFetcherService(pool, config);
  const resourceEnrichmentService = new ResourceEnrichmentService(
    pool,
    config,
    createSmokeLogger()
  );
  const runId = randomUUID();
  const fixtureServer = await startFixtureServer(runId);
  const channelIds: string[] = [];
  const fixtureDomain = new URL(fixtureServer.hardSiteUrl).hostname.toLowerCase();

  try {
    await pool.query(`delete from crawl_policy_cache where domain = $1`, [fixtureDomain]);
    await assertProbeRecommendation(
      `http://127.0.0.1:${config.fetchersPort}`,
      fixtureServer.hardSiteUrl,
      fixtureServer.blockedSiteUrl
    );

    const hardSiteChannelId = await seedWebsiteChannel(
      pool,
      fixtureServer.hardSiteUrl,
      `Hard-site smoke ${runId}`
    );
    channelIds.push(hardSiteChannelId);
    await service.pollChannel(hardSiteChannelId);
    await assertBrowserIngest(
      pool,
      resourceEnrichmentService,
      hardSiteChannelId,
      fixtureServer.storyUrl,
      fixtureServer.entityUrl
    );

    const blockedChannelId = await seedWebsiteChannel(
      pool,
      fixtureServer.blockedSiteUrl,
      `Blocked hard-site smoke ${runId}`
    );
    channelIds.push(blockedChannelId);
    let blockedFailed = false;
    try {
      await service.pollChannel(blockedChannelId);
    } catch {
      blockedFailed = true;
    }
    if (!blockedFailed) {
      throw new Error("Expected blocked hard-site channel polling to fail with an explicit unsupported challenge.");
    }
    await assertBlockedFailure(pool, blockedChannelId);

    console.log(`Hard-site smoke test passed for channels ${hardSiteChannelId} and ${blockedChannelId}.`);
  } finally {
    try {
      await cleanupSmokeArtifacts(pool, channelIds, fixtureDomain);
    } finally {
      await fixtureServer.close();
      await pool.end();
    }
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
