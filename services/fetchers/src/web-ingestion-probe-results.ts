import type { ResourceKind } from "@signalops/contracts";

import type {
  DiscoveredWebsiteResource,
  DiscoveryWebsiteProbeResult,
  WebsiteBrowserAttempt,
  WebsiteCapabilities,
  WebsiteChallengeKind,
} from "./web-ingestion-types";

function classifyWebsiteProbeFromResources(input: {
  resources: readonly DiscoveredWebsiteResource[];
  discoveredFeedUrls: readonly string[];
  challengeKind: WebsiteChallengeKind | null;
}): { kind: ResourceKind; confidence: number; reasons: string[] } {
  if (input.challengeKind) {
    return {
      kind: "unknown",
      confidence: 0.2,
      reasons: [`challenge:${input.challengeKind}`],
    };
  }
  const editorialCount = input.resources.filter((item) => item.classification.kind === "editorial").length;
  const listingCount = input.resources.filter((item) => item.classification.kind === "listing").length;
  const entityCount = input.resources.filter((item) => item.classification.kind === "entity").length;
  const documentCount = input.resources.filter((item) =>
    ["document", "data_file"].includes(item.classification.kind)
  ).length;
  if (editorialCount > 0) {
    return {
      kind: "editorial",
      confidence: Number(Math.min(0.95, 0.72 + editorialCount * 0.04).toFixed(2)),
      reasons: [
        "detail:editorial",
        ...(input.discoveredFeedUrls.length > 0 ? ["hint:feed"] : []),
      ],
    };
  }
  if (listingCount > 0) {
    return {
      kind: "listing",
      confidence: Number(Math.min(0.9, 0.64 + listingCount * 0.04).toFixed(2)),
      reasons: ["layout:listing"],
    };
  }
  if (entityCount > 0) {
    return {
      kind: "entity",
      confidence: Number(Math.min(0.9, 0.62 + entityCount * 0.04).toFixed(2)),
      reasons: ["detail:entity"],
    };
  }
  if (documentCount > 0) {
    return {
      kind: "document",
      confidence: Number(Math.min(0.88, 0.58 + documentCount * 0.04).toFixed(2)),
      reasons: ["layout:downloads"],
    };
  }
  return {
    kind: "unknown",
    confidence: 0.2,
    reasons: ["probe:no_resources"],
  };
}

export function buildDiscoveryWebsiteProbeResult(input: {
  url: string;
  finalUrl: string;
  title: string | null;
  capabilities: WebsiteCapabilities;
  discoveredFeedUrls: readonly string[];
  resources: readonly DiscoveredWebsiteResource[];
  browserAttempt: WebsiteBrowserAttempt;
  listingUrls: readonly string[];
  documentUrls: readonly string[];
  datePatternsFound: boolean;
  sampleCount: number;
}): DiscoveryWebsiteProbeResult {
  const sampleResources = input.resources.slice(0, Math.max(1, input.sampleCount)).map((resource) => ({
    url: resource.url,
    title: resource.title,
    kind: resource.classification.kind,
    discovery_source: resource.discoverySource,
    reasons: resource.classification.reasons.slice(0, 4),
  }));
  const sampleArticles = sampleResources
    .filter((resource) => ["editorial", "entity"].includes(resource.kind))
    .slice(0, Math.max(1, input.sampleCount))
    .map((resource) => ({
      url: resource.url,
      title: resource.title,
      date: null,
    }));
  const detailCountEstimate = input.resources.filter((resource) =>
    ["editorial", "entity"].includes(resource.classification.kind)
  ).length;
  const listingCountEstimate =
    input.listingUrls.length ||
    input.resources.filter((resource) => resource.classification.kind === "listing").length;
  const documentCountEstimate =
    input.documentUrls.length ||
    input.resources.filter((resource) => ["document", "data_file"].includes(resource.classification.kind)).length;
  const classification = classifyWebsiteProbeFromResources({
    resources: input.resources,
    discoveredFeedUrls: input.discoveredFeedUrls,
    challengeKind: input.browserAttempt.challengeKind,
  });

  return {
    url: input.url,
    final_url: input.finalUrl,
    title: input.title ?? new URL(input.finalUrl || input.url).hostname,
    classification,
    capabilities: {
      supports_feed_discovery: input.discoveredFeedUrls.length > 0,
      supports_collection_discovery:
        input.capabilities.defaultCollectionUrls.length > 0 || listingCountEstimate > 0,
      supports_download_discovery:
        input.capabilities.supportsDownloads || documentCountEstimate > 0,
      inline_data_hint: input.capabilities.inlineDataHints,
      js_heavy_hint: input.capabilities.jsHeavyHint,
    },
    discovered_feed_urls: [...input.discoveredFeedUrls],
    listing_urls: [...input.listingUrls].slice(0, 10),
    document_urls: [...input.documentUrls].slice(0, 10),
    detail_count_estimate: detailCountEstimate,
    listing_count_estimate: listingCountEstimate,
    document_count_estimate: documentCountEstimate,
    sample_resources: sampleResources,
    is_news_site: classification.kind === "editorial",
    has_hidden_rss: input.discoveredFeedUrls.length > 0,
    hidden_rss_urls: [...input.discoveredFeedUrls],
    article_count_estimate: detailCountEstimate,
    freshness: input.datePatternsFound ? "daily" : "unknown",
    date_patterns_found: input.datePatternsFound,
    category_urls: [...input.listingUrls].slice(0, 10),
    sample_articles: sampleArticles,
    browser_assisted_recommended: input.browserAttempt.recommended,
    browser_assisted_recommendation_reasons: input.browserAttempt.recommendationReasons,
    challenge_kind: input.browserAttempt.challengeKind,
  };
}
