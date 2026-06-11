import {
  DEFAULT_AGGREGATOR_MAX_ENTRY_AGE_HOURS,
  DEFAULT_RSS_CHANNEL_CONFIG,
  FEED_INGRESS_ADAPTER_STRATEGIES,
} from "./model";
import type { FeedIngressAdapterStrategy, RssChannelConfig } from "./model";
import {
  asRecord,
  readBoolean,
  readNullablePositiveInteger,
  readPositiveInteger,
  readString,
} from "./shared";

function readFeedIngressAdapterStrategy(
  value: unknown,
  fallback: FeedIngressAdapterStrategy | null,
  fieldName: string
): FeedIngressAdapterStrategy | null {
  if (value == null) {
    return fallback;
  }

  if (typeof value !== "string") {
    throw new Error(`Source channel config field "${fieldName}" must be a string.`);
  }

  const normalized = value.trim();
  if (!normalized) {
    return fallback;
  }

  if (
    (FEED_INGRESS_ADAPTER_STRATEGIES as readonly string[]).includes(normalized)
  ) {
    return normalized as FeedIngressAdapterStrategy;
  }

  throw new Error(
    `Source channel config field "${fieldName}" must be one of ${FEED_INGRESS_ADAPTER_STRATEGIES.join(", ")}.`
  );
}

export function inferFeedIngressAdapterStrategy(
  fetchUrl: string | null | undefined
): FeedIngressAdapterStrategy {
  if (!fetchUrl) {
    return "generic";
  }

  try {
    const parsed = new URL(fetchUrl);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();

    if (hostname.endsWith("reddit.com") && pathname.includes("search.rss")) {
      return "reddit_search_rss";
    }

    if (hostname === "hnrss.org") {
      return "hn_comments_feed";
    }

    if (hostname === "news.google.com" && pathname.startsWith("/rss/")) {
      return "google_news_rss";
    }
  } catch {
    return "generic";
  }

  return "generic";
}

export function defaultMaxEntryAgeHoursForFeedIngressAdapter(
  strategy: FeedIngressAdapterStrategy
): number | null {
  switch (strategy) {
    case "reddit_search_rss":
    case "hn_comments_feed":
    case "google_news_rss":
      return DEFAULT_AGGREGATOR_MAX_ENTRY_AGE_HOURS;
    case "generic":
    default:
      return null;
  }
}

export function resolveFeedIngressAdapterStrategy(
  fetchUrl: string | null | undefined,
  explicitStrategy: FeedIngressAdapterStrategy | null | undefined
): FeedIngressAdapterStrategy {
  return explicitStrategy ?? inferFeedIngressAdapterStrategy(fetchUrl);
}

export function resolveRssChannelAdapterStrategy(
  fetchUrl: string | null | undefined,
  config: Pick<RssChannelConfig, "adapterStrategy">
): FeedIngressAdapterStrategy {
  return resolveFeedIngressAdapterStrategy(fetchUrl, config.adapterStrategy);
}

export function resolveRssChannelMaxEntryAgeHours(
  fetchUrl: string | null | undefined,
  config: Pick<RssChannelConfig, "adapterStrategy" | "maxEntryAgeHours">
): number | null {
  if (config.maxEntryAgeHours != null) {
    return config.maxEntryAgeHours;
  }

  return defaultMaxEntryAgeHoursForFeedIngressAdapter(
    resolveFeedIngressAdapterStrategy(fetchUrl, config.adapterStrategy)
  );
}

export function parseRssChannelConfig(config: unknown): RssChannelConfig {
  const candidate = asRecord(config);

  return {
    maxItemsPerPoll: readPositiveInteger(
      candidate.maxItemsPerPoll,
      DEFAULT_RSS_CHANNEL_CONFIG.maxItemsPerPoll,
      "maxItemsPerPoll"
    ),
    requestTimeoutMs: readPositiveInteger(
      candidate.requestTimeoutMs,
      DEFAULT_RSS_CHANNEL_CONFIG.requestTimeoutMs,
      "requestTimeoutMs"
    ),
    userAgent: readString(
      candidate.userAgent,
      DEFAULT_RSS_CHANNEL_CONFIG.userAgent,
      "userAgent"
    ),
    preferContentEncoded: readBoolean(
      candidate.preferContentEncoded,
      DEFAULT_RSS_CHANNEL_CONFIG.preferContentEncoded,
      "preferContentEncoded"
    ),
    adapterStrategy: readFeedIngressAdapterStrategy(
      candidate.adapterStrategy,
      DEFAULT_RSS_CHANNEL_CONFIG.adapterStrategy,
      "adapterStrategy"
    ),
    maxEntryAgeHours: readNullablePositiveInteger(
      candidate.maxEntryAgeHours,
      DEFAULT_RSS_CHANNEL_CONFIG.maxEntryAgeHours,
      "maxEntryAgeHours"
    )
  };
}
