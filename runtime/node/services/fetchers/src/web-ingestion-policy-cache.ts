import type { Pool } from "pg";

import {
  hasAuthorizationHeaderConfigured,
  type WebsiteAuthContext,
} from "./web-ingestion-headers";
import { CrawlPolicyCacheRepository } from "./web-ingestion-persistence";
import {
  cloneConditionalRequestHits,
  createEmptyConditionalRequestHits,
  readCachedTextResponses,
  readConditionalRequestStates,
} from "./web-ingestion-policy-state";
import {
  crawlDelayForUserAgent,
  extractSitemapUrlsFromRobots,
  isAllowedByRobots,
} from "./web-ingestion-robots";
import { extractLinkTagUrls } from "./web-ingestion-extraction";
import type {
  CrawlPolicyCacheRow,
  RuntimeCrawlPolicy,
  WebsiteCachedTextResponseState,
  WebsiteConditionalRequestState,
} from "./web-ingestion-types";
import { fetchTextWithAuth } from "./web-ingestion-fetch";

export class CrawlPolicyCacheService {
  private readonly repository: CrawlPolicyCacheRepository;

  constructor(pool: Pool) {
    this.repository = new CrawlPolicyCacheRepository(pool);
  }

  async getPolicy(
    rawUrl: string,
    userAgent: string,
    requestTimeoutMs: number,
    authContext?: WebsiteAuthContext
  ): Promise<RuntimeCrawlPolicy> {
    const parsedUrl = new URL(rawUrl);
    const domain = parsedUrl.hostname.toLowerCase();
    const cached = await this.repository.loadRow(domain);
    if (hasAuthorizationHeaderConfigured(authContext)) {
      const liveRow = await this.fetchPolicyRow(
        rawUrl,
        userAgent,
        requestTimeoutMs,
        authContext,
        cached
      );
      return this.buildRuntimePolicy(liveRow, userAgent);
    }

    if (cached && Date.parse(cached.expires_at) > Date.now()) {
      return this.buildRuntimePolicy(cached, userAgent);
    }

    const row = await this.repository.refreshRowWithDomainLock(
      domain,
      (insideTransaction) => Date.parse(insideTransaction.expires_at) > Date.now(),
      (insideTransaction) =>
        this.fetchPolicyRow(
          rawUrl,
          userAgent,
          requestTimeoutMs,
          undefined,
          insideTransaction ?? cached
        )
    );
    return this.buildRuntimePolicy(row, userAgent);
  }

  private async fetchPolicyRow(
    rawUrl: string,
    userAgent: string,
    requestTimeoutMs: number,
    authContext?: WebsiteAuthContext,
    previousRow?: CrawlPolicyCacheRow | null
  ): Promise<CrawlPolicyCacheRow> {
    const parsedUrl = new URL(rawUrl);
    const domain = parsedUrl.hostname.toLowerCase();
    const baseOrigin = parsedUrl.origin;
    const requestValidators = readConditionalRequestStates(previousRow?.request_validators_json);
    const responseCache = readCachedTextResponses(previousRow?.response_cache_json);
    const conditionalRequestHits = createEmptyConditionalRequestHits();
    let robotsBody: string | null = null;
    let llmsTxtBody: string | null = null;
    let httpStatus: number | null = null;
    let fetchError: string | null = null;
    let sitemapUrls: string[] = [];
    let feedUrls: string[] = [];

    try {
      const robotsResponse = await fetchTextWithAuth(
        `${baseOrigin}/robots.txt`,
        Math.min(requestTimeoutMs, 5000),
        { "user-agent": userAgent },
        authContext,
        {
          role: "robots",
          requestValidators,
          responseCache,
          conditionalRequestHits,
          cacheBody: true,
        }
      );
      httpStatus = robotsResponse.status;
      if (robotsResponse.status === 200 || (robotsResponse.status === 304 && robotsResponse.reusedCachedBody)) {
        robotsBody = robotsResponse.text;
        sitemapUrls = extractSitemapUrlsFromRobots(robotsBody, baseOrigin);
      } else if (![404, 410].includes(robotsResponse.status)) {
        fetchError = `HTTP ${robotsResponse.status}`;
      }
    } catch (error) {
      fetchError = error instanceof Error ? error.message : "robots_fetch_failed";
    }

    try {
      const homepage = await fetchTextWithAuth(
        `${baseOrigin}/`,
        Math.min(requestTimeoutMs, 5000),
        { "user-agent": userAgent, accept: "text/html,application/xhtml+xml" },
        authContext,
        {
          role: "homepage",
          requestValidators,
          responseCache,
          conditionalRequestHits,
          cacheBody: true,
        }
      );
      if (homepage.status === 200 || (homepage.status === 304 && homepage.reusedCachedBody)) {
        feedUrls = extractLinkTagUrls(homepage.text, homepage.url, ["rss", "atom", "xml"]);
      }
    } catch {
      // best effort
    }

    try {
      const llms = await fetchTextWithAuth(
        `${baseOrigin}/llms.txt`,
        Math.min(requestTimeoutMs, 3000),
        { "user-agent": userAgent, accept: "text/plain,text/markdown" },
        authContext,
        {
          role: "llms",
          requestValidators,
          responseCache,
          conditionalRequestHits,
          cacheBody: true,
        }
      );
      if (llms.status === 200 || (llms.status === 304 && llms.reusedCachedBody)) {
        llmsTxtBody = llms.text;
      }
    } catch {
      // best effort
    }

    const ttlMs = fetchError ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    return {
      domain,
      robots_txt_url: `${baseOrigin}/robots.txt`,
      robots_txt_body: robotsBody,
      sitemap_urls: sitemapUrls,
      feed_urls: feedUrls,
      llms_txt_url: `${baseOrigin}/llms.txt`,
      llms_txt_body: llmsTxtBody,
      request_validators_json: requestValidators,
      response_cache_json: responseCache,
      fetched_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + ttlMs).toISOString(),
      fetch_error: fetchError,
      http_status: httpStatus,
      conditional_request_hits: conditionalRequestHits,
    };
  }

  private buildRuntimePolicy(row: CrawlPolicyCacheRow, userAgent: string): RuntimeCrawlPolicy {
    return {
      domain: row.domain,
      sitemapUrls: row.sitemap_urls ?? [],
      feedUrls: row.feed_urls ?? [],
      llmsTxtBody: row.llms_txt_body,
      fetchedAt: row.fetched_at,
      expiresAt: row.expires_at,
      fetchError: row.fetch_error,
      httpStatus: row.http_status,
      requestValidators: readConditionalRequestStates(row.request_validators_json),
      responseCache: readCachedTextResponses(row.response_cache_json),
      conditionalRequestHits: cloneConditionalRequestHits(row.conditional_request_hits),
      isAllowed: (rawUrl, agent) => isAllowedByRobots(row.robots_txt_body, rawUrl, agent || userAgent),
      crawlDelaySeconds: (agent) => crawlDelayForUserAgent(row.robots_txt_body, agent || userAgent),
    };
  }

  async persistConditionalState(
    rawUrl: string,
    state: {
      requestValidators: Record<string, WebsiteConditionalRequestState>;
      responseCache: Record<string, WebsiteCachedTextResponseState>;
    },
    authContext?: WebsiteAuthContext
  ): Promise<void> {
    if (hasAuthorizationHeaderConfigured(authContext)) {
      return;
    }
    await this.repository.persistConditionalState(rawUrl, state);
  }
}
