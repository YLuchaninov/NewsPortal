import type { Pool } from "pg";

import {
  parseWebsiteChannelConfig,
  type WebsiteChannelConfig
} from "@signalops/contracts";

import { validateAcquisitionUrl } from "./probe-url-guard";
import {
  appendItems,
  applyPatternFilters,
  dedupeResources,
  evaluateBrowserAssistedDiscoveryRecommendation,
  extractHtmlTitle,
  matchesCursor,
  readOptionalString,
  selectLatestTimestamp,
  selectWebsiteDiscoveryModes,
  summarizeResourceKinds,
} from "./web-ingestion-extraction";
import { discoverFromBrowserAssisted } from "./web-ingestion-browser-runtime";
import { fetchTextWithAuth } from "./web-ingestion-fetch";
import { CrawlPolicyCacheService } from "./web-ingestion-policy-cache";
import {
  discoverFromCollectionPages,
  discoverFromDownloads,
  discoverFromFeeds,
  discoverFromInlineData,
  discoverFromSitemaps,
} from "./web-ingestion-static-discovery";
import { probeWebsiteCapabilities } from "./web-ingestion-capabilities";
import {
  buildConditionalStateKey,
  cloneConditionalRequestHits,
} from "./web-ingestion-policy-state";
import { buildDiscoveryWebsiteProbeResult } from "./web-ingestion-probe-results";
import type {
  CursorSnapshot,
  DiscoveredWebsiteResource,
  DiscoveryWebsiteProbeResult,
  RuntimeCrawlPolicy,
  WebsiteCachedTextResponseState,
  WebsiteConditionalRequestState,
  WebsiteBrowserAttempt,
  WebsiteCursorUpdate,
  WebsiteDiscoveryMetrics,
  WebsiteDiscoveryMode,
} from "./web-ingestion-types";

export {
  classifyResourceCandidate,
  inferResourceKindsFromUrl,
} from "./web-ingestion-classification";
export {
  extractCollectionLinkCandidates,
  selectWebsiteDiscoveryModes,
  shouldAttemptBrowserAssistedDiscovery,
} from "./web-ingestion-extraction";
export {
  buildBrowserRouteHeaders,
  buildWebsiteRequestHeaders,
} from "./web-ingestion-headers";
export { probeWebsiteCapabilities } from "./web-ingestion-capabilities";
export { CrawlPolicyCacheService } from "./web-ingestion-policy-cache";
export { isAllowedByRobots, parseRobotsTxt } from "./web-ingestion-robots";
export type {
  CrawlPolicyCacheRow,
  CursorSnapshot,
  DiscoveredWebsiteResource,
  DiscoveryWebsiteProbeResult,
  RuntimeCrawlPolicy,
  WebsiteBrowserAttempt,
  WebsiteCachedTextResponseState,
  WebsiteCapabilities,
  WebsiteChallengeKind,
  WebsiteConditionalRequestHits,
  WebsiteConditionalRequestState,
  WebsiteCursorUpdate,
  WebsiteDiscoveryMetrics,
  WebsiteDiscoveryMode,
} from "./web-ingestion-types";

const SET_DIFF_CURSOR_LIMIT = 200;
const DEFAULT_PROBE_SAMPLE_COUNT = 5;

export async function probeWebsitesForDiscovery(input: {
  pool: Pool;
  urls: string[];
  sampleCount?: number;
  config?: Partial<WebsiteChannelConfig>;
}): Promise<{ probed_websites: DiscoveryWebsiteProbeResult[] }> {
  const config = parseWebsiteChannelConfig({
    browserFallbackEnabled: true,
    maxResourcesPerPoll: Math.max(DEFAULT_PROBE_SAMPLE_COUNT, input.sampleCount ?? DEFAULT_PROBE_SAMPLE_COUNT),
    ...input.config,
  });
  const crawlPolicyCache = new CrawlPolicyCacheService(input.pool);
  const results: DiscoveryWebsiteProbeResult[] = [];
  for (const candidateUrl of Array.from(new Set(input.urls.map((url) => url.trim()).filter(Boolean))).slice(0, 10)) {
    const guardedUrl = await validateAcquisitionUrl(candidateUrl, { resolveDns: true });
    if (!guardedUrl.url) {
      results.push({
        url: candidateUrl,
        final_url: candidateUrl,
        title: candidateUrl || "Invalid probe URL",
        classification: {
          kind: "unknown",
          confidence: 0.0,
          reasons: ["probe_url_rejected"],
        },
        capabilities: {
          supports_feed_discovery: false,
          supports_collection_discovery: false,
          supports_download_discovery: false,
          inline_data_hint: false,
          js_heavy_hint: false,
        },
        discovered_feed_urls: [],
        listing_urls: [],
        document_urls: [],
        detail_count_estimate: 0,
        listing_count_estimate: 0,
        document_count_estimate: 0,
        sample_resources: [],
        is_news_site: false,
        has_hidden_rss: false,
        hidden_rss_urls: [],
        signal_candidate_count_estimate: 0,
        freshness: "unknown",
        date_patterns_found: false,
        category_urls: [],
        sample_signal_candidates: [],
        browser_assisted_recommended: false,
        challenge_kind: null,
      });
      continue;
    }
    const rawUrl = guardedUrl.url;
    try {
      const policy = await crawlPolicyCache.getPolicy(rawUrl, config.userAgent, config.requestTimeoutMs);
      const homepageKey = buildConditionalStateKey("homepage", rawUrl);
      const finalHomepageUrl = policy.requestValidators[homepageKey]?.finalUrl;
      if (finalHomepageUrl) {
        const guardedFinalUrl = await validateAcquisitionUrl(finalHomepageUrl);
        if (!guardedFinalUrl.url) {
          throw new Error(guardedFinalUrl.error ?? "Website probe final URL is not allowed.");
        }
      }
      const capabilities = await probeWebsiteCapabilities(rawUrl, policy, config);
      const baseDomain = new URL(rawUrl).hostname.toLowerCase();
      const conditionalState = {
        requestValidators: { ...policy.requestValidators },
        responseCache: { ...policy.responseCache },
        conditionalRequestHits: cloneConditionalRequestHits(policy.conditionalRequestHits),
      };
      const staticModes = selectWebsiteDiscoveryModes(capabilities, {
        ...config,
        browserFallbackEnabled: false,
      });
      const staticDiscovered: DiscoveredWebsiteResource[] = [];
      for (const mode of staticModes) {
        if (mode === "sitemap") {
          appendItems(
            staticDiscovered,
            await discoverFromSitemaps({
              sitemapUrls: capabilities.sitemapUrls,
              policy,
              config,
              baseDomain,
              conditionalState,
              fetchText: fetchTextWithAuth,
              buildConditionalStateKey,
            })
          );
        } else if (mode === "feed") {
          appendItems(
            staticDiscovered,
            await discoverFromFeeds({
              feedUrls: capabilities.feedUrls,
              config,
              baseDomain,
              conditionalState,
              fetchText: fetchTextWithAuth,
              buildConditionalStateKey,
            })
          );
        } else if (mode === "collection") {
          appendItems(
            staticDiscovered,
            await discoverFromCollectionPages({
              channelUrl: rawUrl,
              capabilities,
              policy,
              config,
              baseDomain,
              fetchText: fetchTextWithAuth,
            })
          );
        } else if (mode === "inline_data") {
          appendItems(
            staticDiscovered,
            discoverFromInlineData({
              channelUrl: rawUrl,
              capabilities,
              config,
              baseDomain,
            })
          );
        } else if (mode === "download") {
          appendItems(
            staticDiscovered,
            discoverFromDownloads({
              channelUrl: rawUrl,
              capabilities,
              config,
              baseDomain,
            })
          );
        }
      }
      const dedupedStatic = dedupeResources(staticDiscovered).slice(0, config.maxResourcesPerPoll);
      let mergedResources = [...dedupedStatic];
      let listingUrls = dedupedStatic
        .filter((resource) => resource.classification.kind === "listing")
        .map((resource) => resource.url)
        .slice(0, 10);
      let documentUrls = dedupedStatic
        .filter((resource) => ["document", "data_file"].includes(resource.classification.kind))
        .map((resource) => resource.url)
        .slice(0, 10);
      let finalUrl = rawUrl;
      let title = readOptionalString(extractHtmlTitle(capabilities.homepageHtml ?? "")) ?? null;
      let datePatternsFound = /\b20\d{2}-\d{2}-\d{2}\b/.test(capabilities.homepageHtml ?? "");
      const staticSummary = summarizeResourceKinds(dedupedStatic);
      const browserRecommendation = evaluateBrowserAssistedDiscoveryRecommendation({
        capabilities,
        config,
        staticResourceCount: dedupedStatic.length,
        staticEditorialCount: staticSummary.editorialCount,
        staticListingCount: staticSummary.listingCount,
        staticUnknownCount: staticSummary.unknownCount,
      });
      const browserAttempt: WebsiteBrowserAttempt = {
        attempted: false,
        recommended: browserRecommendation.recommended,
        recommendationReasons: browserRecommendation.reasons,
        challengeKind: capabilities.challengeKindHint,
        blockedReason: null,
      };
      if (browserAttempt.recommended) {
        browserAttempt.attempted = true;
        try {
          const browserDiscovery = await discoverFromBrowserAssisted({
            channelUrl: rawUrl,
            capabilities,
            config,
            baseDomain,
          });
          if (browserDiscovery.finalUrl) {
            const guardedBrowserFinalUrl = await validateAcquisitionUrl(browserDiscovery.finalUrl);
            if (!guardedBrowserFinalUrl.url) {
              throw new Error(guardedBrowserFinalUrl.error ?? "Browser-assisted probe final URL is not allowed.");
            }
            finalUrl = guardedBrowserFinalUrl.url;
          }
          title = title ?? browserDiscovery.title;
          datePatternsFound = datePatternsFound || browserDiscovery.datePatternsFound;
          listingUrls = Array.from(new Set([...listingUrls, ...browserDiscovery.listingUrls])).slice(0, 10);
          documentUrls = Array.from(new Set([...documentUrls, ...browserDiscovery.documentUrls])).slice(0, 10);
          if (browserDiscovery.challengeKind) {
            browserAttempt.challengeKind = browserDiscovery.challengeKind;
            browserAttempt.blockedReason = `unsupported:${browserDiscovery.challengeKind}`;
            mergedResources = [];
          } else {
            browserAttempt.challengeKind = null;
            mergedResources = dedupeResources([...mergedResources, ...browserDiscovery.resources]).slice(
              0,
              config.maxResourcesPerPoll
            );
          }
        } catch (error) {
          browserAttempt.challengeKind = "unsupported_block";
          browserAttempt.blockedReason = error instanceof Error ? error.message : "browser_probe_failed";
          mergedResources = dedupeResources(mergedResources);
        }
      }
      results.push(
        buildDiscoveryWebsiteProbeResult({
          url: rawUrl,
          finalUrl,
          title,
          capabilities,
          discoveredFeedUrls: capabilities.feedUrls,
          resources: mergedResources,
          browserAttempt,
          listingUrls,
          documentUrls,
          datePatternsFound,
          sampleCount: input.sampleCount ?? DEFAULT_PROBE_SAMPLE_COUNT,
        })
      );
    } catch {
      let fallbackTitle = rawUrl;
      try {
        fallbackTitle = new URL(rawUrl).hostname;
      } catch {
        // keep the raw URL when parsing fails
      }
      results.push({
        url: rawUrl,
        final_url: rawUrl,
        title: fallbackTitle,
        classification: {
          kind: "unknown",
          confidence: 0.0,
          reasons: ["probe_error"],
        },
        capabilities: {
          supports_feed_discovery: false,
          supports_collection_discovery: false,
          supports_download_discovery: false,
          inline_data_hint: false,
          js_heavy_hint: false,
        },
        discovered_feed_urls: [],
        listing_urls: [],
        document_urls: [],
        detail_count_estimate: 0,
        listing_count_estimate: 0,
        document_count_estimate: 0,
        sample_resources: [],
        is_news_site: false,
        has_hidden_rss: false,
        hidden_rss_urls: [],
        signal_candidate_count_estimate: 0,
        freshness: "unknown",
        date_patterns_found: false,
        category_urls: [],
        sample_signal_candidates: [],
        browser_assisted_recommended: false,
        challenge_kind: null,
      });
    }
  }
  return { probed_websites: results };
}

export async function discoverWebsiteResources(input: {
  channelUrl: string;
  policy: RuntimeCrawlPolicy;
  config: WebsiteChannelConfig;
  cursors: Record<string, CursorSnapshot>;
  authConfig?: unknown;
}): Promise<{
  resources: DiscoveredWebsiteResource[];
  cursorUpdates: WebsiteCursorUpdate[];
  modes: WebsiteDiscoveryMode[];
  browserAttempt: WebsiteBrowserAttempt;
  homepageStatus: number | null;
  metrics: WebsiteDiscoveryMetrics;
  policyState: {
    requestValidators: Record<string, WebsiteConditionalRequestState>;
    responseCache: Record<string, WebsiteCachedTextResponseState>;
  };
}> {
  const baseDomain = new URL(input.channelUrl).hostname.toLowerCase();
  const conditionalState = {
    requestValidators: { ...input.policy.requestValidators },
    responseCache: { ...input.policy.responseCache },
    conditionalRequestHits: cloneConditionalRequestHits(input.policy.conditionalRequestHits),
  };
  const authContext =
    input.authConfig == null
      ? undefined
      : {
          channelUrl: input.channelUrl,
          authConfig: input.authConfig
        };
  const capabilities = await probeWebsiteCapabilities(
    input.channelUrl,
    input.policy,
    input.config
  );
  const modes = selectWebsiteDiscoveryModes(capabilities, input.config);
  const discovered: DiscoveredWebsiteResource[] = [];

  for (const mode of modes) {
    if (mode === "sitemap") {
      appendItems(
        discovered,
        await discoverFromSitemaps({
          sitemapUrls: capabilities.sitemapUrls,
          policy: input.policy,
          config: input.config,
          baseDomain,
          conditionalState,
          fetchText: fetchTextWithAuth,
          buildConditionalStateKey,
          authContext,
        })
      );
      continue;
    }
    if (mode === "feed") {
      appendItems(
        discovered,
        await discoverFromFeeds({
          feedUrls: capabilities.feedUrls,
          config: input.config,
          baseDomain,
          conditionalState,
          fetchText: fetchTextWithAuth,
          buildConditionalStateKey,
          authContext,
        })
      );
      continue;
    }
    if (mode === "collection") {
      appendItems(
        discovered,
        await discoverFromCollectionPages({
          channelUrl: input.channelUrl,
          capabilities,
          policy: input.policy,
          config: input.config,
          baseDomain,
          fetchText: fetchTextWithAuth,
          authContext,
        })
      );
      continue;
    }
    if (mode === "inline_data") {
      appendItems(
        discovered,
        discoverFromInlineData({
          channelUrl: input.channelUrl,
          capabilities,
          config: input.config,
          baseDomain,
        })
      );
      continue;
    }
    if (mode === "download") {
      appendItems(
        discovered,
        discoverFromDownloads({
          channelUrl: input.channelUrl,
          capabilities,
          config: input.config,
          baseDomain,
        })
      );
    }
  }

  const deduped = dedupeResources(discovered);
  let filtered = applyPatternFilters(deduped, input.config)
    .filter((resource) => !matchesCursor(resource, input.cursors))
    .slice(0, input.config.maxResourcesPerPoll);
  const staticCandidateCount = deduped.length;
  const staticAcceptedUrls = new Set(filtered.map((resource) => resource.normalizedUrl));
  const browserAttempt: WebsiteBrowserAttempt = {
    attempted: false,
          recommended: false,
          recommendationReasons: [],
          challengeKind: capabilities.challengeKindHint,
          blockedReason: null,
        };
  const filteredSummary = summarizeResourceKinds(filtered);
  const browserRecommendation = evaluateBrowserAssistedDiscoveryRecommendation({
    capabilities,
    config: input.config,
    staticResourceCount: filtered.length,
    staticNoChangeEvidence:
      conditionalState.conditionalRequestHits.sitemap > 0 ||
      conditionalState.conditionalRequestHits.feed > 0,
    staticEditorialCount: filteredSummary.editorialCount,
    staticListingCount: filteredSummary.listingCount,
    staticUnknownCount: filteredSummary.unknownCount,
  });
  browserAttempt.recommended = browserRecommendation.recommended;
  browserAttempt.recommendationReasons = browserRecommendation.reasons;
  let browserDiscoveredCount = 0;
  if (browserAttempt.recommended) {
    browserAttempt.attempted = true;
    modes.push("browser_assisted");
    try {
      const browserDiscovery = await discoverFromBrowserAssisted({
        channelUrl: input.channelUrl,
        capabilities,
        config: input.config,
        baseDomain,
        authContext,
      });
      browserDiscoveredCount = browserDiscovery.resources.length;
      if (browserDiscovery.challengeKind) {
        browserAttempt.challengeKind = browserDiscovery.challengeKind;
        browserAttempt.blockedReason = `unsupported:${browserDiscovery.challengeKind}`;
        if (filtered.length === 0) {
          filtered = [];
        }
      } else {
        browserAttempt.challengeKind = null;
        filtered = applyPatternFilters(
          dedupeResources([...filtered, ...browserDiscovery.resources]),
          input.config
        )
          .filter((resource) => !matchesCursor(resource, input.cursors))
          .slice(0, input.config.maxResourcesPerPoll);
      }
    } catch (error) {
      browserAttempt.challengeKind = "unsupported_block";
      browserAttempt.blockedReason = error instanceof Error ? error.message : "browser_discovery_failed";
    }
  }
  const browserAcceptedCount = filtered.filter(
    (resource) => Boolean(resource.rawSignals.browserAssisted)
  ).length;
  const browserOnlyAcceptedCount = filtered.filter(
    (resource) => Boolean(resource.rawSignals.browserAssisted) && !staticAcceptedUrls.has(resource.normalizedUrl)
  ).length;
  const modeCounts = filtered.reduce<Record<string, number>>((counts, resource) => {
    counts[resource.discoverySource] = (counts[resource.discoverySource] ?? 0) + 1;
    return counts;
  }, {});
  const resourceKindCounts = filtered.reduce<Record<string, number>>((counts, resource) => {
    counts[resource.classification.kind] = (counts[resource.classification.kind] ?? 0) + 1;
    return counts;
  }, {});

  const cursorUpdates: WebsiteCursorUpdate[] = [];
  const latestTimestamp = selectLatestTimestamp(filtered, "timestamp");
  if (latestTimestamp) {
    cursorUpdates.push({
      cursorType: "timestamp",
      cursorValue: latestTimestamp,
      cursorJson: {
        source: "website_discovery"
      }
    });
  }
  const latestLastmod = selectLatestTimestamp(filtered, "lastmod");
  if (latestLastmod) {
    cursorUpdates.push({
      cursorType: "lastmod",
      cursorValue: latestLastmod,
      cursorJson: {
        source: "website_discovery"
      }
    });
  }
  if (filtered.length > 0) {
    cursorUpdates.push({
      cursorType: "set_diff",
      cursorValue: new Date().toISOString(),
      cursorJson: {
        last_seen_urls: filtered.map((resource) => resource.normalizedUrl).slice(0, SET_DIFF_CURSOR_LIMIT)
      }
    });
  }

  return {
    resources: filtered,
    cursorUpdates,
    modes,
    browserAttempt,
    homepageStatus: capabilities.homepageStatus,
    metrics: {
      staticCandidateCount,
      staticAcceptedCount: staticAcceptedUrls.size,
      browserRecommended: browserAttempt.recommended,
      browserAttempted: browserAttempt.attempted,
      browserRecommendationReasons: browserAttempt.recommendationReasons,
      browserChallengeKind: browserAttempt.challengeKind,
      browserDiscoveredCount,
      browserAcceptedCount,
      browserOnlyAcceptedCount,
      finalAcceptedCount: filtered.length,
      modeCounts,
      resourceKindCounts,
      conditionalRequestHits: conditionalState.conditionalRequestHits,
    },
    policyState: {
      requestValidators: conditionalState.requestValidators,
      responseCache: conditionalState.responseCache,
    },
  };
}
