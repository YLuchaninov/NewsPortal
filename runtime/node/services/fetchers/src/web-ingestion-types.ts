import type { ResourceKind } from "@signalops/contracts";

export type WebsiteDiscoveryMode =
  | "sitemap"
  | "feed"
  | "collection"
  | "inline_data"
  | "download"
  | "browser_assisted";

export type WebsiteChallengeKind =
  | "login"
  | "captcha"
  | "cloudflare_js_challenge"
  | "unsupported_block";

export type ConditionalFetchRole = "robots" | "homepage" | "llms" | "sitemap" | "feed";

export interface WebsiteConditionalRequestState {
  etag: string | null;
  lastModified: string | null;
  finalUrl: string | null;
  contentType: string | null;
  httpStatus: number | null;
  updatedAt: string | null;
}

export interface WebsiteCachedTextResponseState {
  url: string;
  status: number;
  contentType: string | null;
  text: string;
  updatedAt: string;
}

export interface WebsiteConditionalRequestHits {
  homepage: number;
  sitemap: number;
  feed: number;
  robots: number;
  llms: number;
}

export interface CrawlPolicyCacheRow {
  domain: string;
  robots_txt_url: string;
  robots_txt_body: string | null;
  sitemap_urls: string[];
  feed_urls: string[];
  llms_txt_url: string | null;
  llms_txt_body: string | null;
  request_validators_json: Record<string, unknown>;
  response_cache_json: Record<string, unknown>;
  fetched_at: string;
  expires_at: string;
  fetch_error: string | null;
  http_status: number | null;
  conditional_request_hits?: WebsiteConditionalRequestHits;
}

export interface CursorSnapshot {
  cursorType: string;
  cursorValue: string | null;
  cursorJson: Record<string, unknown>;
}

export interface WebsiteCursorUpdate {
  cursorType: string;
  cursorValue: string;
  cursorJson: Record<string, unknown>;
}

export interface DiscoveredWebsiteResource {
  url: string;
  normalizedUrl: string;
  externalResourceId: string;
  title: string | null;
  summary: string | null;
  parentUrl: string | null;
  publishedAt: string | null;
  modifiedAt: string | null;
  freshnessMarkerType: "timestamp" | "lastmod" | "set_diff" | null;
  freshnessMarkerValue: string | null;
  discoverySource: string;
  hintedKinds: ResourceKind[];
  classification: {
    kind: ResourceKind;
    confidence: number;
    reasons: string[];
  };
  rawSignals: Record<string, unknown>;
}

export interface WebsiteCapabilities {
  sitemapUrls: string[];
  feedUrls: string[];
  inlineDataHints: boolean;
  jsHeavyHint: boolean;
  challengeKindHint: WebsiteChallengeKind | null;
  supportsDownloads: boolean;
  defaultCollectionUrls: string[];
  contentTypes: string[];
  homepageHtml: string | null;
  homepageStatus: number | null;
}

export interface WebsiteBrowserAttempt {
  attempted: boolean;
  recommended: boolean;
  recommendationReasons: string[];
  challengeKind: WebsiteChallengeKind | null;
  blockedReason: string | null;
}

export interface WebsiteDiscoveryMetrics {
  staticCandidateCount: number;
  staticAcceptedCount: number;
  browserRecommended: boolean;
  browserAttempted: boolean;
  browserRecommendationReasons: string[];
  browserChallengeKind: WebsiteChallengeKind | null;
  browserDiscoveredCount: number;
  browserAcceptedCount: number;
  browserOnlyAcceptedCount: number;
  finalAcceptedCount: number;
  modeCounts: Record<string, number>;
  resourceKindCounts: Record<string, number>;
  conditionalRequestHits: WebsiteConditionalRequestHits;
}

export interface DiscoveryWebsiteProbeResult {
  url: string;
  final_url: string;
  title: string;
  classification: {
    kind: ResourceKind;
    confidence: number;
    reasons: string[];
  };
  capabilities: {
    supports_feed_discovery: boolean;
    supports_collection_discovery: boolean;
    supports_download_discovery: boolean;
    inline_data_hint: boolean;
    js_heavy_hint: boolean;
  };
  discovered_feed_urls: string[];
  listing_urls: string[];
  document_urls: string[];
  detail_count_estimate: number;
  listing_count_estimate: number;
  document_count_estimate: number;
  sample_resources: Array<{
    url: string;
    title: string | null;
    kind: ResourceKind;
    discovery_source: string;
    reasons?: string[];
  }>;
  is_news_site: boolean;
  has_hidden_rss: boolean;
  hidden_rss_urls: string[];
  signal_candidate_count_estimate: number;
  freshness: "daily" | "unknown";
  date_patterns_found: boolean;
  category_urls: string[];
  sample_signal_candidates: Array<{
    url: string;
    title: string | null;
    date: string | null;
  }>;
  browser_assisted_recommended: boolean;
  browser_assisted_recommendation_reasons?: string[];
  challenge_kind: WebsiteChallengeKind | null;
}

export interface RuntimeCrawlPolicy {
  domain: string;
  sitemapUrls: string[];
  feedUrls: string[];
  llmsTxtBody: string | null;
  fetchedAt: string;
  expiresAt: string;
  fetchError: string | null;
  httpStatus: number | null;
  requestValidators: Record<string, WebsiteConditionalRequestState>;
  responseCache: Record<string, WebsiteCachedTextResponseState>;
  conditionalRequestHits: WebsiteConditionalRequestHits;
  isAllowed: (rawUrl: string, userAgent: string) => boolean;
  crawlDelaySeconds: (userAgent: string) => number | null;
}
