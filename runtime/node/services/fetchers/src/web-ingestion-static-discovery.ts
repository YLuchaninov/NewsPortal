import type { WebsiteChannelConfig } from "@signalops/contracts";

import { parseFeed } from "./feed-parser/index";
import { inferResourceKindsFromUrl } from "./web-ingestion-classification";
import {
  DOWNLOAD_EXTENSION_PATTERN,
  FEED_HINT_PATTERN,
  MAX_COLLECTION_FETCHES,
  detectWebsiteChallengeKind,
  extractCollectionLinkCandidates,
  extractDownloadUrls,
  extractInlineDataUrls,
  isLikelyContentContext,
  matchesSameDomain,
  normalizeText,
  normalizeUrl,
  parseJsonLdTypes,
  parseXmlEntries,
  resourceFromUrl,
  shouldKeepDefaultCollectionSeed,
  selectCollectionSeedUrls,
} from "./web-ingestion-extraction";
import type { WebsiteAuthContext } from "./web-ingestion-headers";
import type {
  ConditionalFetchRole,
  DiscoveredWebsiteResource,
  RuntimeCrawlPolicy,
  WebsiteCachedTextResponseState,
  WebsiteCapabilities,
  WebsiteConditionalRequestHits,
  WebsiteConditionalRequestState,
} from "./web-ingestion-types";

const MAX_SITEMAP_DEPTH = 3;
const MAX_SITEMAP_FETCHES = 10;

export interface WebsiteTextFetchResult {
  url: string;
  status: number;
  text: string;
  contentType: string | null;
  etag: string | null;
  lastModified: string | null;
  conditionalHit: boolean;
  reusedCachedBody: boolean;
}

export type WebsiteTextFetcher = (
  url: string,
  timeoutMs: number,
  headers?: HeadersInit,
  authContext?: WebsiteAuthContext,
  conditional?: {
    role: ConditionalFetchRole;
    key?: string;
    requestValidators: Record<string, WebsiteConditionalRequestState>;
    responseCache: Record<string, WebsiteCachedTextResponseState>;
    conditionalRequestHits?: WebsiteConditionalRequestHits;
    cacheBody?: boolean;
  }
) => Promise<WebsiteTextFetchResult>;

export type WebsiteConditionalStateKeyBuilder = (
  role: ConditionalFetchRole,
  rawUrl?: string
) => string;

interface WebsiteStaticDiscoveryConditionalState {
  requestValidators: Record<string, WebsiteConditionalRequestState>;
  responseCache: Record<string, WebsiteCachedTextResponseState>;
  conditionalRequestHits: WebsiteConditionalRequestHits;
}

export async function discoverFromSitemaps(input: {
  sitemapUrls: readonly string[];
  policy: RuntimeCrawlPolicy;
  config: WebsiteChannelConfig;
  baseDomain: string;
  conditionalState: WebsiteStaticDiscoveryConditionalState;
  fetchText: WebsiteTextFetcher;
  buildConditionalStateKey: WebsiteConditionalStateKeyBuilder;
  authContext?: WebsiteAuthContext;
}): Promise<DiscoveredWebsiteResource[]> {
  const resources: DiscoveredWebsiteResource[] = [];
  const queue = input.sitemapUrls.map((url) => ({ url, depth: 0 }));
  const visited = new Set<string>();

  while (queue.length > 0 && visited.size < MAX_SITEMAP_FETCHES) {
    const current = queue.shift();
    if (!current || visited.has(current.url) || current.depth > MAX_SITEMAP_DEPTH) {
      continue;
    }
    visited.add(current.url);
    if (!input.policy.isAllowed(current.url, input.config.userAgent)) {
      continue;
    }
    let response: WebsiteTextFetchResult;
    try {
      response = await input.fetchText(
        current.url,
        input.config.requestTimeoutMs,
        {
          "user-agent": input.config.userAgent,
          accept: "application/xml,text/xml",
        },
        input.authContext,
        {
          role: "sitemap",
          key: input.buildConditionalStateKey("sitemap", current.url),
          requestValidators: input.conditionalState.requestValidators,
          responseCache: input.conditionalState.responseCache,
          conditionalRequestHits: input.conditionalState.conditionalRequestHits,
          cacheBody: false,
        }
      );
    } catch {
      continue;
    }
    if (response.status === 304) {
      continue;
    }
    if (response.status !== 200) {
      continue;
    }

    const isSitemapIndex = /<sitemapindex\b/i.test(response.text);
    if (isSitemapIndex) {
      for (const entry of parseXmlEntries(response.text, "sitemap")) {
        const normalizedUrl = normalizeUrl(entry.loc, current.url);
        if (normalizedUrl) {
          queue.push({ url: normalizedUrl, depth: current.depth + 1 });
        }
      }
      continue;
    }

    const structuredTypes = /news:/i.test(response.text) ? ["NewsArticle"] : [];
    for (const entry of parseXmlEntries(response.text, "url")) {
      const normalizedUrl = normalizeUrl(entry.loc, current.url);
      if (!normalizedUrl || !matchesSameDomain(normalizedUrl, input.baseDomain)) {
        continue;
      }
      const resource = resourceFromUrl(normalizedUrl, input.config, {
        discoverySource: "sitemap",
        modifiedAt: entry.lastmod,
        freshnessMarkerType: entry.lastmod ? "lastmod" : null,
        freshnessMarkerValue: entry.lastmod,
        structuredTypes,
        rawSignals: {
          sitemapUrl: current.url,
        },
      });
      if (resource) {
        resources.push(resource);
      }
    }
  }
  return resources;
}

export async function discoverFromFeeds(input: {
  feedUrls: readonly string[];
  config: WebsiteChannelConfig;
  baseDomain: string;
  conditionalState: WebsiteStaticDiscoveryConditionalState;
  fetchText: WebsiteTextFetcher;
  buildConditionalStateKey: WebsiteConditionalStateKeyBuilder;
  authContext?: WebsiteAuthContext;
}): Promise<DiscoveredWebsiteResource[]> {
  const resources: DiscoveredWebsiteResource[] = [];
  for (const feedUrl of input.feedUrls.slice(0, MAX_COLLECTION_FETCHES)) {
    try {
      const response = await input.fetchText(
        feedUrl,
        input.config.requestTimeoutMs,
        {
          "user-agent": input.config.userAgent,
          accept:
            "application/feed+json, application/json;q=0.95, application/atom+xml;q=0.92, application/rss+xml;q=0.9, application/xml;q=0.85, text/xml;q=0.8",
        },
        input.authContext,
        {
          role: "feed",
          key: input.buildConditionalStateKey("feed", feedUrl),
          requestValidators: input.conditionalState.requestValidators,
          responseCache: input.conditionalState.responseCache,
          conditionalRequestHits: input.conditionalState.conditionalRequestHits,
          cacheBody: false,
        }
      );
      if (response.status === 304) {
        continue;
      }
      if (response.status !== 200) {
        continue;
      }
      const parsedFeed = parseFeed({
        body: response.text,
        contentType: response.contentType,
        feedUrl,
      });
      for (const entry of parsedFeed.entries.slice(0, input.config.maxResourcesPerPoll)) {
        if (!entry.url) {
          continue;
        }
        const normalizedUrl = normalizeUrl(entry.url);
        if (!normalizedUrl || !matchesSameDomain(normalizedUrl, input.baseDomain)) {
          continue;
        }
        const resource = resourceFromUrl(normalizedUrl, input.config, {
          title: entry.title,
          summary: normalizeText(entry.summaryHtml),
          publishedAt: entry.publishedAt,
          modifiedAt: entry.publishedAt,
          freshnessMarkerType: entry.publishedAt ? "timestamp" : null,
          freshnessMarkerValue: entry.publishedAt,
          discoverySource: "feed",
          structuredTypes: ["SignalCandidate"],
          rawSignals: {
            feedUrl,
          },
        });
        if (resource) {
          resources.push(resource);
        }
      }
    } catch {
      continue;
    }
  }
  return resources;
}

export async function discoverFromCollectionPages(input: {
  channelUrl: string;
  capabilities: WebsiteCapabilities;
  policy: RuntimeCrawlPolicy;
  config: WebsiteChannelConfig;
  baseDomain: string;
  fetchText: WebsiteTextFetcher;
  authContext?: WebsiteAuthContext;
}): Promise<DiscoveredWebsiteResource[]> {
  const seedUrls = selectCollectionSeedUrls({
    channelUrl: input.channelUrl,
    defaultCollectionUrls: input.capabilities.defaultCollectionUrls,
    configuredSeedUrls: input.config.collectionSeedUrls,
  });
  const resources: DiscoveredWebsiteResource[] = [];

  for (const seedUrl of seedUrls) {
    if (!input.policy.isAllowed(seedUrl, input.config.userAgent)) {
      continue;
    }
    try {
      const response = await input.fetchText(
        seedUrl,
        input.config.requestTimeoutMs,
        {
          "user-agent": input.config.userAgent,
          accept: "text/html,application/xhtml+xml",
        },
        input.authContext
      );
      if (response.status !== 200 || !(response.contentType ?? "").includes("html")) {
        continue;
      }
      if (detectWebsiteChallengeKind(response.text)) {
        continue;
      }
      const links = extractCollectionLinkCandidates(response.text, response.url);
      const hasRepeatedCards = links.length >= 8;
      const hasPagination = /\b(page|pagination|next)\b/i.test(response.text);
      const structuredTypes = parseJsonLdTypes(response.text);
      const seedRelatedToChannel = shouldKeepDefaultCollectionSeed(input.channelUrl, seedUrl);
      for (const link of links) {
        if (!matchesSameDomain(link.url, input.baseDomain) || link.url === seedUrl || FEED_HINT_PATTERN.test(link.url)) {
          continue;
        }
        if (DOWNLOAD_EXTENSION_PATTERN.test(link.url)) {
          continue;
        }
        const linkKinds = inferResourceKindsFromUrl(link.url);
        const strongDetailCandidate =
          Boolean(link.publishedAt) ||
          ((link.summary?.length ?? 0) >= 80 && isLikelyContentContext(link.summary)) ||
          linkKinds.includes("editorial");
        if (!seedRelatedToChannel && !strongDetailCandidate) {
          continue;
        }
        const resource = resourceFromUrl(link.url, input.config, {
          title: link.text || null,
          summary: link.summary,
          parentUrl: seedUrl,
          publishedAt: link.publishedAt,
          freshnessMarkerType: "set_diff",
          freshnessMarkerValue: null,
          discoverySource: "collection_page",
          structuredTypes,
          hasRepeatedCards,
          hasPagination,
          rawSignals: {
            parentUrl: seedUrl,
            collectionPublishedAt: link.publishedAt,
            collectionSummary: link.summary,
          },
        });
        if (resource) {
          resources.push(resource);
        }
      }
    } catch {
      continue;
    }
  }
  return resources;
}

export function discoverFromInlineData(input: {
  channelUrl: string;
  capabilities: WebsiteCapabilities;
  config: WebsiteChannelConfig;
  baseDomain: string;
}): DiscoveredWebsiteResource[] {
  if (!input.capabilities.homepageHtml) {
    return [];
  }
  const urls = extractInlineDataUrls(input.capabilities.homepageHtml, input.channelUrl);
  const resources: DiscoveredWebsiteResource[] = [];
  for (const url of urls) {
    if (!matchesSameDomain(url, input.baseDomain) || FEED_HINT_PATTERN.test(url)) {
      continue;
    }
    const resource = resourceFromUrl(url, input.config, {
      discoverySource: "inline_data",
      freshnessMarkerType: "set_diff",
      freshnessMarkerValue: null,
      rawSignals: {
        source: "__NEXT_DATA__",
      },
    });
    if (resource) {
      resources.push(resource);
    }
  }
  return resources;
}

export function discoverFromDownloads(input: {
  channelUrl: string;
  capabilities: WebsiteCapabilities;
  config: WebsiteChannelConfig;
  baseDomain: string;
}): DiscoveredWebsiteResource[] {
  if (!input.capabilities.homepageHtml) {
    return [];
  }
  const downloadUrls = extractDownloadUrls(
    input.capabilities.homepageHtml,
    input.channelUrl,
    input.config.downloadPatterns
  );
  const resources: DiscoveredWebsiteResource[] = [];
  for (const url of downloadUrls) {
    if (!matchesSameDomain(url, input.baseDomain)) {
      continue;
    }
    const resource = resourceFromUrl(url, input.config, {
      discoverySource: "download",
      freshnessMarkerType: "set_diff",
      freshnessMarkerValue: null,
      hasDownloads: true,
      rawSignals: {
        parentUrl: input.channelUrl,
      },
    });
    if (resource) {
      resources.push(resource);
    }
  }
  return resources;
}
