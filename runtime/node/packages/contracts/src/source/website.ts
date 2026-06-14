import { DEFAULT_WEBSITE_CHANNEL_CONFIG } from "./model";
import type { WebsiteChannelConfig } from "./model";
import {
  asRecord,
  readBoolean,
  readNumberInRange,
  readPositiveInteger,
  readString,
  readStringList,
} from "./shared";

export function parseWebsiteChannelConfig(config: unknown): WebsiteChannelConfig {
  const candidate = asRecord(config);
  const classification = asRecord(candidate.classification);
  const curated = asRecord(candidate.curated);
  const extraction = asRecord(candidate.extraction);

  return {
    maxResourcesPerPoll: readPositiveInteger(
      candidate.maxResourcesPerPoll,
      DEFAULT_WEBSITE_CHANNEL_CONFIG.maxResourcesPerPoll,
      "maxResourcesPerPoll"
    ),
    requestTimeoutMs: readPositiveInteger(
      candidate.requestTimeoutMs,
      DEFAULT_WEBSITE_CHANNEL_CONFIG.requestTimeoutMs,
      "requestTimeoutMs"
    ),
    totalPollTimeoutMs: readPositiveInteger(
      candidate.totalPollTimeoutMs,
      DEFAULT_WEBSITE_CHANNEL_CONFIG.totalPollTimeoutMs,
      "totalPollTimeoutMs"
    ),
    userAgent: readString(
      candidate.userAgent,
      DEFAULT_WEBSITE_CHANNEL_CONFIG.userAgent,
      "userAgent"
    ),
    sitemapDiscoveryEnabled: readBoolean(
      candidate.sitemapDiscoveryEnabled,
      DEFAULT_WEBSITE_CHANNEL_CONFIG.sitemapDiscoveryEnabled,
      "sitemapDiscoveryEnabled"
    ),
    feedDiscoveryEnabled: readBoolean(
      candidate.feedDiscoveryEnabled,
      DEFAULT_WEBSITE_CHANNEL_CONFIG.feedDiscoveryEnabled,
      "feedDiscoveryEnabled"
    ),
    collectionDiscoveryEnabled: readBoolean(
      candidate.collectionDiscoveryEnabled,
      DEFAULT_WEBSITE_CHANNEL_CONFIG.collectionDiscoveryEnabled,
      "collectionDiscoveryEnabled"
    ),
    downloadDiscoveryEnabled: readBoolean(
      candidate.downloadDiscoveryEnabled,
      DEFAULT_WEBSITE_CHANNEL_CONFIG.downloadDiscoveryEnabled,
      "downloadDiscoveryEnabled"
    ),
    browserFallbackEnabled: readBoolean(
      candidate.browserFallbackEnabled,
      DEFAULT_WEBSITE_CHANNEL_CONFIG.browserFallbackEnabled,
      "browserFallbackEnabled"
    ),
    maxBrowserFetchesPerPoll: readPositiveInteger(
      candidate.maxBrowserFetchesPerPoll,
      DEFAULT_WEBSITE_CHANNEL_CONFIG.maxBrowserFetchesPerPoll,
      "maxBrowserFetchesPerPoll"
    ),
    allowedUrlPatterns: readStringList(
      candidate.allowedUrlPatterns,
      DEFAULT_WEBSITE_CHANNEL_CONFIG.allowedUrlPatterns,
      "allowedUrlPatterns"
    ),
    blockedUrlPatterns: readStringList(
      candidate.blockedUrlPatterns,
      DEFAULT_WEBSITE_CHANNEL_CONFIG.blockedUrlPatterns,
      "blockedUrlPatterns"
    ),
    collectionSeedUrls: readStringList(
      candidate.collectionSeedUrls,
      DEFAULT_WEBSITE_CHANNEL_CONFIG.collectionSeedUrls,
      "collectionSeedUrls"
    ),
    downloadPatterns: readStringList(
      candidate.downloadPatterns,
      DEFAULT_WEBSITE_CHANNEL_CONFIG.downloadPatterns,
      "downloadPatterns"
    ),
    crawlDelayMs: readPositiveInteger(
      candidate.crawlDelayMs,
      DEFAULT_WEBSITE_CHANNEL_CONFIG.crawlDelayMs,
      "crawlDelayMs"
    ),
    classification: {
      enableRoughPageTypeDetection: readBoolean(
        classification.enableRoughPageTypeDetection,
        DEFAULT_WEBSITE_CHANNEL_CONFIG.classification.enableRoughPageTypeDetection,
        "classification.enableRoughPageTypeDetection"
      ),
      minConfidenceForTypedExtraction: readNumberInRange(
        classification.minConfidenceForTypedExtraction,
        DEFAULT_WEBSITE_CHANNEL_CONFIG.classification.minConfidenceForTypedExtraction,
        "classification.minConfidenceForTypedExtraction",
        0,
        1
      )
    },
    curated: {
      preferCollectionDiscovery: readBoolean(
        curated.preferCollectionDiscovery,
        DEFAULT_WEBSITE_CHANNEL_CONFIG.curated.preferCollectionDiscovery,
        "curated.preferCollectionDiscovery"
      ),
      preferBrowserFallback: readBoolean(
        curated.preferBrowserFallback,
        DEFAULT_WEBSITE_CHANNEL_CONFIG.curated.preferBrowserFallback,
        "curated.preferBrowserFallback"
      ),
      editorialUrlPatterns: readStringList(
        curated.editorialUrlPatterns,
        DEFAULT_WEBSITE_CHANNEL_CONFIG.curated.editorialUrlPatterns,
        "curated.editorialUrlPatterns"
      ),
      listingUrlPatterns: readStringList(
        curated.listingUrlPatterns,
        DEFAULT_WEBSITE_CHANNEL_CONFIG.curated.listingUrlPatterns,
        "curated.listingUrlPatterns"
      ),
      entityUrlPatterns: readStringList(
        curated.entityUrlPatterns,
        DEFAULT_WEBSITE_CHANNEL_CONFIG.curated.entityUrlPatterns,
        "curated.entityUrlPatterns"
      ),
      documentUrlPatterns: readStringList(
        curated.documentUrlPatterns,
        DEFAULT_WEBSITE_CHANNEL_CONFIG.curated.documentUrlPatterns,
        "curated.documentUrlPatterns"
      ),
      dataFileUrlPatterns: readStringList(
        curated.dataFileUrlPatterns,
        DEFAULT_WEBSITE_CHANNEL_CONFIG.curated.dataFileUrlPatterns,
        "curated.dataFileUrlPatterns"
      )
    },
    extraction: {
      minEditorialBodyLength: readPositiveInteger(
        extraction.minEditorialBodyLength,
        DEFAULT_WEBSITE_CHANNEL_CONFIG.extraction.minEditorialBodyLength,
        "extraction.minEditorialBodyLength"
      ),
      allowInlineJsonExtraction: readBoolean(
        extraction.allowInlineJsonExtraction,
        DEFAULT_WEBSITE_CHANNEL_CONFIG.extraction.allowInlineJsonExtraction,
        "extraction.allowInlineJsonExtraction"
      ),
      allowBrowserNetworkCapture: readBoolean(
        extraction.allowBrowserNetworkCapture,
        DEFAULT_WEBSITE_CHANNEL_CONFIG.extraction.allowBrowserNetworkCapture,
        "extraction.allowBrowserNetworkCapture"
      ),
      extractTables: readBoolean(
        extraction.extractTables,
        DEFAULT_WEBSITE_CHANNEL_CONFIG.extraction.extractTables,
        "extraction.extractTables"
      ),
      extractDownloads: readBoolean(
        extraction.extractDownloads,
        DEFAULT_WEBSITE_CHANNEL_CONFIG.extraction.extractDownloads,
        "extraction.extractDownloads"
      )
    }
  };
}
