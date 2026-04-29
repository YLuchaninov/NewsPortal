import type { WebsiteChannelConfig } from "@newsportal/contracts";

import {
  detectInlineDataHint,
  detectJsHeavyHint,
  detectWebsiteChallengeKind,
  extractDefaultCollectionUrls,
  extractDownloadUrls,
  extractLinkTagUrls,
} from "./web-ingestion-extraction";
import { buildConditionalStateKey } from "./web-ingestion-policy-state";
import type {
  RuntimeCrawlPolicy,
  WebsiteCapabilities,
} from "./web-ingestion-types";

export async function probeWebsiteCapabilities(
  channelUrl: string,
  policy: RuntimeCrawlPolicy,
  config: WebsiteChannelConfig
): Promise<WebsiteCapabilities> {
  const contentTypes: string[] = [];
  const homepageKey = buildConditionalStateKey("homepage", channelUrl);
  const homepage = policy.responseCache[homepageKey];
  const homepageState = policy.requestValidators[homepageKey];
  if (homepage?.contentType) {
    contentTypes.push(homepage.contentType);
  } else if (homepageState?.contentType) {
    contentTypes.push(homepageState.contentType);
  }
  const homepageStatus = homepage?.status ?? homepageState?.httpStatus ?? null;
  if (!homepage || homepage.status !== 200) {
    return {
      sitemapUrls: policy.sitemapUrls,
      feedUrls: policy.feedUrls,
      inlineDataHints: false,
      jsHeavyHint: false,
      challengeKindHint: null,
      supportsDownloads: false,
      defaultCollectionUrls: [],
      contentTypes,
      homepageHtml: null,
      homepageStatus,
    };
  }
  const feedUrls = Array.from(
    new Set([
      ...policy.feedUrls,
      ...extractLinkTagUrls(homepage.text, homepage.url, ["rss", "atom", "xml"]),
    ])
  );
  return {
    sitemapUrls: policy.sitemapUrls,
    feedUrls,
    inlineDataHints: detectInlineDataHint(homepage.text),
    jsHeavyHint: detectJsHeavyHint(homepage.text),
    challengeKindHint: detectWebsiteChallengeKind(homepage.text),
    supportsDownloads:
      extractDownloadUrls(homepage.text, homepage.url, config.downloadPatterns).length > 0,
    defaultCollectionUrls: extractDefaultCollectionUrls(homepage.text, homepage.url),
    contentTypes,
    homepageHtml: homepage.text,
    homepageStatus: homepage.status,
  };
}
