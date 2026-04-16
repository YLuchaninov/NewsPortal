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

interface WebResourceRow {
  resourceId: string;
  url: string;
  finalUrl: string | null;
  resourceKind: string;
  discoverySource: string;
  extractionState: string;
  projectedArticleId: string | null;
  documentsCount: number;
  mediaCount: number;
  title: string;
  attributesJson: Record<string, unknown>;
}

interface ArticleRow {
  docId: string;
  sourceArticleId: string | null;
  url: string;
  title: string;
  body: string;
  fullContentHtml: string | null;
  enrichmentState: string;
  processingState: string;
}

interface CacheRow {
  domain: string;
  sitemapUrls: string[];
  feedUrls: string[];
  httpStatus: number | null;
  requestValidatorsJson: Record<string, unknown>;
  responseCacheJson: Record<string, unknown>;
}

interface FetchRunRow {
  outcomeKind: string;
  providerMetricsJson: Record<string, unknown>;
}

interface SmokeLogger {
  info(payload: unknown, message?: string): void;
  warn(payload: unknown, message?: string): void;
  error(payload: unknown, message?: string): void;
}

const WEBSITE_FIXTURE_HOST = "127.0.0.2";
const RESOURCE_INGEST_TRIGGER_EVENT = "resource.ingest.requested";
const ARTICLE_INGEST_TRIGGER_EVENT = "article.ingest.requested";

const PROCESSING_STATE_ORDER: Record<string, number> = {
  raw: 0,
  normalized: 1,
  deduped: 2,
  embedded: 3,
  clustered: 4,
  matched: 5,
  notified: 6,
};

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

  throw new Error("Timed out waiting for website smoke assertions.");
}

function editorialHtml(title: string, runId: string, label: string, imageUrl: string): string {
  const paragraphs = Array.from(
    { length: 10 },
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

function entityHtml(title: string, runId: string): string {
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

async function startFixtureServer(runId: string): Promise<{
  close: () => Promise<void>;
  siteUrl: string;
  hiddenFeedUrl: string;
  sitemapEditorialUrl: string;
  feedEditorialUrl: string;
  entityUrl: string;
  documentUrl: string;
}> {
  const server = createServer((request: IncomingMessage, response: ServerResponse): void => {
    const host = request.headers.host ?? "127.0.0.1";
    const baseUrl = `http://${host}`;
    const sitemapUrl = `${baseUrl}/sitemap.xml`;
    const hiddenFeedUrl = `${baseUrl}/hidden-feed.xml`;
    const sitemapEditorialUrl = `${baseUrl}/news/sitemap-story-${runId}.html`;
    const feedEditorialUrl = `${baseUrl}/news/feed-story-${runId}.html`;
    const entityUrl = `${baseUrl}/profiles/entity-detail-${runId}.html`;
    const documentUrl = `${baseUrl}/downloads/report-${runId}.pdf`;
    const sharedImageUrl = `${baseUrl}/media/preview-${runId}.jpg`;
    const sitemapTitle = `Website sitemap story ${runId}`;
    const feedTitle = `Website feed story ${runId}`;
    const entityTitle = `Website entity ${runId}`;
    const maybeNotModified = (etag: string, lastModified: string): boolean => {
      const ifNoneMatch = request.headers["if-none-match"];
      const ifModifiedSince = request.headers["if-modified-since"];
      return ifNoneMatch === etag || ifModifiedSince === lastModified;
    };

    if (request.url === "/robots.txt") {
      const etag = `"website-smoke-robots-${runId}"`;
      const lastModified = "Sat, 28 Mar 2026 10:00:00 GMT";
      if (maybeNotModified(etag, lastModified)) {
        response.writeHead(304, {
          ETag: etag,
          "Last-Modified": lastModified,
        });
        response.end();
        return;
      }
      response.writeHead(200, {
        "content-type": "text/plain; charset=utf-8",
        ETag: etag,
        "Last-Modified": lastModified,
      });
      response.end(`User-agent: *\nAllow: /\nCrawl-delay: 1\nSitemap: ${sitemapUrl}\n`);
      return;
    }

    if (request.url === "/" || request.url === "") {
      const etag = `"website-smoke-homepage-${runId}"`;
      const lastModified = "Sat, 28 Mar 2026 10:05:00 GMT";
      if (maybeNotModified(etag, lastModified)) {
        response.writeHead(304, {
          ETag: etag,
          "Last-Modified": lastModified,
        });
        response.end();
        return;
      }
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        ETag: etag,
        "Last-Modified": lastModified,
      });
      response.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Website smoke root ${runId}</title>
    <link rel="alternate" type="application/rss+xml" href="${hiddenFeedUrl}">
  </head>
  <body>
    <main>
      <h1>Website smoke root ${runId}</h1>
      <p>Universal website ingestion fixture with hidden feed hints and non-editorial resources.</p>
      <a href="${entityUrl}">Entity detail ${runId}</a>
      <a href="${documentUrl}">Quarterly report ${runId}</a>
    </main>
  </body>
</html>`);
      return;
    }

    if (request.url === "/sitemap.xml") {
      const etag = `"website-smoke-sitemap-${runId}"`;
      const lastModified = "Sat, 28 Mar 2026 11:00:00 GMT";
      if (maybeNotModified(etag, lastModified)) {
        response.writeHead(304, {
          ETag: etag,
          "Last-Modified": lastModified,
        });
        response.end();
        return;
      }
      response.writeHead(200, {
        "content-type": "application/xml; charset=utf-8",
        ETag: etag,
        "Last-Modified": lastModified,
      });
      response.end(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${sitemapEditorialUrl}</loc>
    <lastmod>2026-03-28T11:00:00Z</lastmod>
  </url>
</urlset>`);
      return;
    }

    if (request.url === "/hidden-feed.xml") {
      const etag = `"website-smoke-feed-${runId}"`;
      const lastModified = "Sat, 28 Mar 2026 12:30:00 GMT";
      if (maybeNotModified(etag, lastModified)) {
        response.writeHead(304, {
          ETag: etag,
          "Last-Modified": lastModified,
        });
        response.end();
        return;
      }
      response.writeHead(200, {
        "content-type": "application/rss+xml; charset=utf-8",
        ETag: etag,
        "Last-Modified": lastModified,
      });
      response.end(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Website hidden feed ${runId}</title>
    <link>${baseUrl}/</link>
    <description>Hidden feed fixture ${runId}</description>
    <item>
      <guid>feed-editorial-${runId}</guid>
      <title>${feedTitle}</title>
      <link>${feedEditorialUrl}</link>
      <description><![CDATA[Feed editorial summary ${runId}.]]></description>
      <content:encoded><![CDATA[<p>Feed editorial summary ${runId}.</p>]]></content:encoded>
      <pubDate>Sat, 28 Mar 2026 12:30:00 GMT</pubDate>
    </item>
  </channel>
</rss>`);
      return;
    }

    if (request.url === `/news/sitemap-story-${runId}.html`) {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
      });
      response.end(
        editorialHtml(sitemapTitle, runId, "Sitemap editorial sentinel", sharedImageUrl)
      );
      return;
    }

    if (request.url === `/news/feed-story-${runId}.html`) {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
      });
      response.end(
        editorialHtml(feedTitle, runId, "Feed editorial sentinel", sharedImageUrl)
      );
      return;
    }

    if (request.url === `/profiles/entity-detail-${runId}.html`) {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
      });
      response.end(entityHtml(entityTitle, runId));
      return;
    }

    if (request.url === `/downloads/report-${runId}.pdf`) {
      response.writeHead(200, {
        "content-type": "application/pdf",
      });
      response.end(`PDF fixture body ${runId} with enough text for deterministic document extraction.`);
      return;
    }

    if (request.url === `/media/preview-${runId}.jpg`) {
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

  await new Promise<void>((resolve, reject) => {
    server.listen(0, WEBSITE_FIXTURE_HOST, () => resolve());
    server.on("error", reject);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Website fixture server did not bind to an IPv4 port.");
  }

  const siteUrl = `http://${WEBSITE_FIXTURE_HOST}:${address.port}/`;
  return {
    siteUrl,
    hiddenFeedUrl: `${siteUrl}hidden-feed.xml`,
    sitemapEditorialUrl: `${siteUrl}news/sitemap-story-${runId}.html`,
    feedEditorialUrl: `${siteUrl}news/feed-story-${runId}.html`,
    entityUrl: `${siteUrl}profiles/entity-detail-${runId}.html`,
    documentUrl: `${siteUrl}downloads/report-${runId}.pdf`,
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

async function seedWebsiteChannel(pool: Pool, siteUrl: string): Promise<string> {
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
      `Website smoke channel ${randomUUID()}`,
      siteUrl,
      JSON.stringify({
        maxResourcesPerPoll: 10,
        requestTimeoutMs: 5000,
        totalPollTimeoutMs: 30000,
        userAgent: "NewsPortalFetchers/WebsiteSmoke",
        sitemapDiscoveryEnabled: true,
        feedDiscoveryEnabled: true,
        collectionDiscoveryEnabled: true,
        downloadDiscoveryEnabled: true,
        browserFallbackEnabled: false,
        maxBrowserFetchesPerPoll: 1,
        allowedUrlPatterns: ["\\/news\\/", "\\/profiles\\/", "\\.pdf(?:$|\\?)"],
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
          allowBrowserNetworkCapture: false,
          extractTables: true,
          extractDownloads: true,
        },
      }),
    ]
  );

  return result.rows[0].channelId;
}

async function fetchResourceRows(pool: Pool, channelId: string): Promise<WebResourceRow[]> {
  const result = await pool.query<WebResourceRow>(
    `
      select
        resource_id::text as "resourceId",
        url,
        final_url as "finalUrl",
        resource_kind as "resourceKind",
        discovery_source as "discoverySource",
        extraction_state as "extractionState",
        projected_article_id::text as "projectedArticleId",
        jsonb_array_length(documents_json)::int as "documentsCount",
        jsonb_array_length(media_json)::int as "mediaCount",
        title,
        attributes_json as "attributesJson"
      from web_resources
      where channel_id = $1
      order by url asc
    `,
    [channelId]
  );

  return result.rows;
}

async function fetchArticleRows(pool: Pool, channelId: string): Promise<ArticleRow[]> {
  const result = await pool.query<ArticleRow>(
    `
      select
        doc_id::text as "docId",
        source_article_id as "sourceArticleId",
        url,
        title,
        body,
        full_content_html as "fullContentHtml",
        enrichment_state as "enrichmentState",
        processing_state as "processingState"
      from articles
      where channel_id = $1
      order by url asc
    `,
    [channelId]
  );

  return result.rows;
}

async function fetchPolicyRow(pool: Pool, domain: string): Promise<CacheRow | null> {
  const result = await pool.query<CacheRow>(
    `
      select
        domain,
        sitemap_urls as "sitemapUrls",
        feed_urls as "feedUrls",
        http_status as "httpStatus",
        request_validators_json as "requestValidatorsJson",
        response_cache_json as "responseCacheJson"
      from crawl_policy_cache
      where domain = $1
      limit 1
    `,
    [domain]
  );

  return result.rows[0] ?? null;
}

async function fetchLatestRun(pool: Pool, channelId: string): Promise<FetchRunRow> {
  const result = await pool.query<FetchRunRow>(
    `
      select
        outcome_kind as "outcomeKind",
        provider_metrics_json as "providerMetricsJson"
      from channel_fetch_runs
      where channel_id = $1
      order by started_at desc
      limit 1
    `,
    [channelId]
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error(`Expected a fetch run for website smoke channel ${channelId}.`);
  }
  return row;
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

async function enrichDiscoveredResources(
  pool: Pool,
  resourceEnrichmentService: ResourceEnrichmentService,
  channelId: string,
  expectedCount: number
): Promise<void> {
  await waitForCondition(
    async () => {
      const resources = await fetchResourceRows(pool, channelId);
      return resources.length === expectedCount;
    },
    {
      timeoutMs: 20000,
      pollIntervalMs: 500,
    }
  );

  const resources = await fetchResourceRows(pool, channelId);
  for (const resource of resources) {
    await resourceEnrichmentService.enrichResource(resource.resourceId);
  }
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

async function assertWebsiteRows(
  pool: Pool,
  channelId: string,
  fixture: Awaited<ReturnType<typeof startFixtureServer>>,
  runId: string,
  resourceEnrichmentService: ResourceEnrichmentService
): Promise<void> {
  await enrichDiscoveredResources(pool, resourceEnrichmentService, channelId, 4);

  await waitForCondition(
    async () => {
      const [resources, articles] =
        await Promise.all([
          fetchResourceRows(pool, channelId),
          fetchArticleRows(pool, channelId),
        ]);
      const resourceIds = resources.map((resource) => resource.resourceId);
      const articleIds = articles.map((article) => article.docId);
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
        resources.length === 4 &&
        resources.every((resource) => resource.extractionState === "enriched") &&
        resources.filter((resource) => resource.projectedArticleId).length === 2 &&
        articles.length === 2 &&
        publishedResourceEvents >= 4 &&
        publishedArticleEvents >= 2 &&
        resourceSequenceRuns >= 4 &&
        articleSequenceRuns >= 2
      );
    },
    {
      timeoutMs: 90000,
      pollIntervalMs: 1000,
    }
  );

  const [channelRow, rssShadowChannels, policyRow, cursorTypes, resources, articles] = await Promise.all([
    pool.query<{ providerType: string }>(
      `
        select provider_type as "providerType"
        from source_channels
        where channel_id = $1
        limit 1
      `,
      [channelId]
    ),
    pool.query<{ count: string }>(
      `
        select count(*)::text as count
        from source_channels
        where provider_type = 'rss'
          and fetch_url = $1
      `,
      [fixture.hiddenFeedUrl]
    ),
    fetchPolicyRow(pool, new URL(fixture.siteUrl).hostname.toLowerCase()),
    pool.query<{ cursorType: string }>(
      `
        select cursor_type as "cursorType"
        from fetch_cursors
        where channel_id = $1
      `,
      [channelId]
    ),
    fetchResourceRows(pool, channelId),
    fetchArticleRows(pool, channelId),
  ]);

  if (channelRow.rows[0]?.providerType !== "website") {
    throw new Error("Expected the smoke channel to remain provider_type=website.");
  }

  if (rssShadowChannels.rows[0]?.count !== "0") {
    throw new Error("Hidden feed discovery must not auto-convert the website channel into RSS.");
  }

  if (!policyRow) {
    throw new Error("Expected crawl_policy_cache to contain a row for the website smoke domain.");
  }
  if (policyRow.httpStatus !== 200) {
    throw new Error(`Expected crawl policy cache HTTP status 200, got ${String(policyRow.httpStatus)}.`);
  }
  if (!policyRow.sitemapUrls.includes(`${fixture.siteUrl}sitemap.xml`)) {
    throw new Error("Expected crawl policy cache to retain the fixture sitemap URL with the port-preserving origin.");
  }
  if (!policyRow.feedUrls.includes(fixture.hiddenFeedUrl)) {
    throw new Error("Expected crawl policy cache to retain the hidden feed URL from the fixture homepage.");
  }
  if (!Object.keys(policyRow.requestValidatorsJson).some((key) => key.startsWith("sitemap:"))) {
    throw new Error("Expected crawl policy cache to retain conditional-request validators for sitemap URLs.");
  }
  if (!Object.keys(policyRow.requestValidatorsJson).some((key) => key.startsWith("feed:"))) {
    throw new Error("Expected crawl policy cache to retain conditional-request validators for feed URLs.");
  }
  if (!("homepage" in policyRow.responseCacheJson)) {
    throw new Error("Expected crawl policy cache to retain a cached homepage response for conditional reuse.");
  }

  const discoveredCursorTypes = new Set(cursorTypes.rows.map((row) => row.cursorType));
  for (const cursorType of ["timestamp", "lastmod", "set_diff"]) {
    if (!discoveredCursorTypes.has(cursorType)) {
      throw new Error(`Expected ${cursorType} fetch cursor for the website smoke channel.`);
    }
  }

  const resourceByUrl = new Map(resources.map((resource) => [resource.url, resource]));
  const sitemapEditorial = resourceByUrl.get(fixture.sitemapEditorialUrl);
  const feedEditorial = resourceByUrl.get(fixture.feedEditorialUrl);
  const entityResource = resourceByUrl.get(fixture.entityUrl);
  const documentResource = resourceByUrl.get(fixture.documentUrl);

  if (!sitemapEditorial || sitemapEditorial.discoverySource !== "sitemap") {
    throw new Error("Expected the sitemap editorial resource to be discovered from sitemap mode.");
  }
  if (sitemapEditorial.resourceKind !== "editorial" || !sitemapEditorial.projectedArticleId) {
    throw new Error("Expected the sitemap editorial resource to enrich as editorial and project into articles.");
  }

  if (!feedEditorial || feedEditorial.discoverySource !== "feed") {
    throw new Error("Expected the feed-only editorial resource to be discovered from feed mode.");
  }
  if (feedEditorial.resourceKind !== "editorial" || !feedEditorial.projectedArticleId) {
    throw new Error("Expected the feed editorial resource to enrich as editorial and project into articles.");
  }

  if (!entityResource || entityResource.discoverySource !== "collection_page") {
    throw new Error("Expected the entity resource to be discovered from collection_page mode.");
  }
  if (entityResource.resourceKind !== "entity" || entityResource.projectedArticleId) {
    throw new Error("Expected the entity resource to enrich in-place without article projection.");
  }
  if (String(entityResource.attributesJson.Region ?? "") !== "Europe") {
    throw new Error("Expected entity extraction to preserve structured attributes.");
  }

  if (!documentResource || documentResource.discoverySource !== "download") {
    throw new Error("Expected the document resource to be discovered from download mode.");
  }
  if (documentResource.resourceKind !== "document" || documentResource.projectedArticleId) {
    throw new Error("Expected the document resource to stay in the resource lane without article projection.");
  }
  if (documentResource.documentsCount < 1) {
    throw new Error("Expected the document resource to persist at least one document reference.");
  }

  const articleBySource = new Map(
    articles.map((article) => [article.sourceArticleId ?? article.url, article])
  );
  const sitemapArticle = articleBySource.get(fixture.sitemapEditorialUrl);
  const feedArticle = articleBySource.get(fixture.feedEditorialUrl);

  if (!sitemapArticle || !sitemapArticle.body.includes(`Sitemap editorial sentinel ${runId}`)) {
    throw new Error("Expected the sitemap editorial article projection to retain the extracted body.");
  }
  if (!feedArticle || !feedArticle.body.includes(`Feed editorial sentinel ${runId}`)) {
    throw new Error("Expected the feed editorial article projection to retain the extracted body.");
  }
}

async function assertSecondPollMetrics(pool: Pool, channelId: string): Promise<void> {
  const latestRun = await fetchLatestRun(pool, channelId);
  const metrics = latestRun.providerMetricsJson;
  const conditionalHits = (metrics.conditionalRequestHits ?? {}) as Record<string, unknown>;
  if (latestRun.outcomeKind !== "no_change") {
    throw new Error(`Expected second website smoke poll to be no_change, got ${latestRun.outcomeKind}.`);
  }
  if (Number(metrics.finalAcceptedCount ?? 0) !== 0) {
    throw new Error("Expected second website smoke poll to accept zero new resources after cursor filtering.");
  }
  if (Number(conditionalHits.sitemap ?? 0) < 1) {
    throw new Error("Expected second website smoke poll to record at least one sitemap conditional-request hit.");
  }
  if (Number(conditionalHits.feed ?? 0) < 1) {
    throw new Error("Expected second website smoke poll to record at least one feed conditional-request hit.");
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
  const fixtureDomain = new URL(fixtureServer.siteUrl).hostname.toLowerCase();

  try {
    await pool.query(`delete from crawl_policy_cache where domain = $1`, [fixtureDomain]);
    const channelId = await seedWebsiteChannel(pool, fixtureServer.siteUrl);
    channelIds.push(channelId);
    await service.pollChannel(channelId);
    await assertWebsiteRows(pool, channelId, fixtureServer, runId, resourceEnrichmentService);
    await service.pollChannel(channelId);
    await assertSecondPollMetrics(pool, channelId);
    console.log(`Website smoke test passed for channel ${channelId}.`);
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
