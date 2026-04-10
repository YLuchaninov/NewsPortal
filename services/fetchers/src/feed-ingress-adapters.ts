import {
  resolveRssChannelAdapterStrategy,
  resolveRssChannelMaxEntryAgeHours,
  type FeedIngressAdapterStrategy,
  type RssChannelConfig
} from "@newsportal/contracts";

import { parseFeed, parseRedditSearchFeed, type ParsedFeed, type ParsedFeedEntry } from "./feed-parser";
import { canonicalizeUrl, collapseWhitespace, stripHtmlTags } from "./rss";

export interface FeedIngressAdapterContext {
  fetchUrl: string;
  rssConfig: RssChannelConfig;
  fetchedAt: string;
  contentType: string | null;
  responseBody: string;
}

export interface FeedIngressAdapterProvenance {
  strategy: FeedIngressAdapterStrategy;
  sourceUrl: string | null;
  canonicalUrl: string | null;
  canonicalResolved: boolean;
  discussionUrl: string | null;
  discussionOnly: boolean;
  itemKind: "generic" | "discussion_thread" | "linked_article";
}

export interface AdaptedFeedEntry {
  entry: ParsedFeedEntry;
  url: string | null;
  publishedAt: string | null;
  feedAdapter: FeedIngressAdapterProvenance;
}

export interface AdaptedFeedResult {
  parsedFeed: ParsedFeed;
  strategy: FeedIngressAdapterStrategy;
  maxEntryAgeHours: number | null;
  droppedAdapterCount: number;
  droppedStaleCount: number;
  entries: AdaptedFeedEntry[];
}

interface FeedIngressAdapter {
  parse(context: FeedIngressAdapterContext): Promise<ParsedFeed> | ParsedFeed;
  normalizeEntry(
    entry: ParsedFeedEntry,
    context: FeedIngressAdapterRuntimeContext
  ): Promise<AdaptedFeedEntry | null> | AdaptedFeedEntry | null;
}

interface FeedIngressAdapterRuntimeContext extends FeedIngressAdapterContext {
  strategy: FeedIngressAdapterStrategy;
  canonicalUrlCache: Map<string, string | null>;
}

function normalizeUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  try {
    return canonicalizeUrl(url);
  } catch {
    return url.trim() || null;
  }
}

function isOlderThanMaxEntryAge(
  publishedAt: string | null,
  fetchedAt: string,
  maxEntryAgeHours: number | null
): boolean {
  if (!publishedAt || maxEntryAgeHours == null) {
    return false;
  }

  const publishedAtMs = new Date(publishedAt).getTime();
  const fetchedAtMs = new Date(fetchedAt).getTime();
  if (Number.isNaN(publishedAtMs) || Number.isNaN(fetchedAtMs)) {
    return false;
  }

  return fetchedAtMs - publishedAtMs > maxEntryAgeHours * 60 * 60 * 1000;
}

function toPlaintext(value: string): string {
  return collapseWhitespace(stripHtmlTags(value));
}

function extractFirstHttpUrl(value: string): string | null {
  const match = value.match(/https?:\/\/[^\s<>"')]+/i);
  return match?.[0] ?? null;
}

function extractHackerNewsArticleUrl(entry: ParsedFeedEntry): string | null {
  const htmlSources = [entry.contentHtml, entry.summaryHtml].filter(Boolean);
  for (const html of htmlSources) {
    const anchorMatch = html.match(/Article URL:\s*<a[^>]+href="([^"]+)"/i);
    if (anchorMatch?.[1]) {
      return anchorMatch[1];
    }
  }

  const textSources = [entry.contentHtml, entry.summaryHtml]
    .map((value) => toPlaintext(value))
    .filter(Boolean);
  for (const text of textSources) {
    const articleSection = text.match(/Article URL:\s*(.+?)(?:Comments URL:|Points:|#\s*Comments?:|$)/i);
    if (!articleSection?.[1]) {
      continue;
    }

    const articleUrl = extractFirstHttpUrl(articleSection[1]);
    if (articleUrl) {
      return articleUrl;
    }
  }

  return null;
}

function isHackerNewsCommentUpdate(entry: ParsedFeedEntry): boolean {
  const title = collapseWhitespace(stripHtmlTags(entry.title)).toLowerCase();
  return /^new comment by\b/.test(title) || /^new comments?\b/.test(title);
}

async function resolveGoogleNewsPublisherUrl(
  sourceUrl: string,
  context: FeedIngressAdapterRuntimeContext
): Promise<{ canonicalUrl: string; canonicalResolved: boolean }> {
  const cached = context.canonicalUrlCache.get(sourceUrl);
  if (cached !== undefined) {
    return {
      canonicalUrl: cached ?? sourceUrl,
      canonicalResolved: Boolean(cached)
    };
  }

  try {
    const response = await fetch(sourceUrl, {
      redirect: "follow",
      headers: {
        "user-agent": context.rssConfig.userAgent,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      signal: AbortSignal.timeout(Math.min(context.rssConfig.requestTimeoutMs, 3000))
    });

    const finalUrl = normalizeUrl(response.url);
    if (finalUrl && finalUrl !== sourceUrl) {
      context.canonicalUrlCache.set(sourceUrl, finalUrl);
      return {
        canonicalUrl: finalUrl,
        canonicalResolved: true
      };
    }
  } catch {
    // Graceful fallback to the source wrapper URL.
  }

  context.canonicalUrlCache.set(sourceUrl, null);
  return {
    canonicalUrl: sourceUrl,
    canonicalResolved: false
  };
}

const genericAdapter: FeedIngressAdapter = {
  parse(context) {
    return parseFeed({
      body: context.responseBody,
      contentType: context.contentType
    });
  },
  normalizeEntry(entry, context) {
    const sourceUrl = normalizeUrl(entry.url);

    return {
      entry,
      url: sourceUrl,
      publishedAt: entry.publishedAt,
      feedAdapter: {
        strategy: context.strategy,
        sourceUrl,
        canonicalUrl: sourceUrl,
        canonicalResolved: false,
        discussionUrl: null,
        discussionOnly: false,
        itemKind: "generic"
      }
    };
  }
};

const redditSearchAdapter: FeedIngressAdapter = {
  parse(context) {
    return parseRedditSearchFeed({
      body: context.responseBody,
      contentType: context.contentType
    });
  },
  normalizeEntry(entry, context) {
    const sourceUrl = normalizeUrl(entry.url);
    return {
      entry,
      url: sourceUrl,
      publishedAt: entry.publishedAt,
      feedAdapter: {
        strategy: context.strategy,
        sourceUrl,
        canonicalUrl: sourceUrl,
        canonicalResolved: false,
        discussionUrl: null,
        discussionOnly: false,
        itemKind: "generic"
      }
    };
  }
};

const hackerNewsCommentsAdapter: FeedIngressAdapter = {
  parse: genericAdapter.parse,
  normalizeEntry(entry, context) {
    if (isHackerNewsCommentUpdate(entry)) {
      return null;
    }

    const discussionUrl = normalizeUrl(entry.url);
    const articleUrl = normalizeUrl(extractHackerNewsArticleUrl(entry));
    const canonicalUrl = articleUrl ?? discussionUrl;
    const itemKind = articleUrl ? "linked_article" : "discussion_thread";

    return {
      entry,
      url: canonicalUrl,
      publishedAt: entry.publishedAt,
      feedAdapter: {
        strategy: context.strategy,
        sourceUrl: discussionUrl,
        canonicalUrl,
        canonicalResolved: Boolean(articleUrl && discussionUrl && articleUrl !== discussionUrl),
        discussionUrl,
        discussionOnly: !articleUrl,
        itemKind
      }
    };
  }
};

const googleNewsAdapter: FeedIngressAdapter = {
  parse: genericAdapter.parse,
  async normalizeEntry(entry, context) {
    const sourceUrl = normalizeUrl(entry.url);
    if (!sourceUrl) {
      return {
        entry,
        url: null,
        publishedAt: entry.publishedAt,
        feedAdapter: {
          strategy: context.strategy,
          sourceUrl: null,
          canonicalUrl: null,
          canonicalResolved: false,
          discussionUrl: null,
          discussionOnly: false,
          itemKind: "generic"
        }
      };
    }

    const resolved = await resolveGoogleNewsPublisherUrl(sourceUrl, context);
    return {
      entry,
      url: resolved.canonicalUrl,
      publishedAt: entry.publishedAt,
      feedAdapter: {
        strategy: context.strategy,
        sourceUrl,
        canonicalUrl: resolved.canonicalUrl,
        canonicalResolved: resolved.canonicalResolved,
        discussionUrl: null,
        discussionOnly: false,
        itemKind: "generic"
      }
    };
  }
};

const FEED_INGRESS_ADAPTERS: Record<FeedIngressAdapterStrategy, FeedIngressAdapter> = {
  generic: genericAdapter,
  reddit_search_rss: redditSearchAdapter,
  hn_comments_feed: hackerNewsCommentsAdapter,
  google_news_rss: googleNewsAdapter
};

export async function adaptFeedIngress(
  context: FeedIngressAdapterContext
): Promise<AdaptedFeedResult> {
  const strategy = resolveRssChannelAdapterStrategy(context.fetchUrl, context.rssConfig);
  const maxEntryAgeHours = resolveRssChannelMaxEntryAgeHours(context.fetchUrl, context.rssConfig);
  const adapterContext: FeedIngressAdapterRuntimeContext = {
    ...context,
    strategy,
    canonicalUrlCache: new Map()
  };
  const adapter = FEED_INGRESS_ADAPTERS[strategy];
  const parsedFeed = await adapter.parse(adapterContext);
  const rawEntries = parsedFeed.entries.slice(0, context.rssConfig.maxItemsPerPoll);
  const entries: AdaptedFeedEntry[] = [];
  let droppedAdapterCount = 0;
  let droppedStaleCount = 0;

  for (const entry of rawEntries) {
    const normalized = await adapter.normalizeEntry(entry, adapterContext);
    if (!normalized || !normalized.url) {
      droppedAdapterCount += 1;
      continue;
    }

    if (isOlderThanMaxEntryAge(normalized.publishedAt, context.fetchedAt, maxEntryAgeHours)) {
      droppedStaleCount += 1;
      continue;
    }

    entries.push(normalized);
  }

  return {
    parsedFeed,
    strategy,
    maxEntryAgeHours,
    droppedAdapterCount,
    droppedStaleCount,
    entries
  };
}
