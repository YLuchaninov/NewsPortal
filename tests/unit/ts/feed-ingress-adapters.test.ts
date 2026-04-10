import assert from "node:assert/strict";
import test from "node:test";

import {
  parseRssChannelConfig,
  resolveRssChannelAdapterStrategy,
  resolveRssChannelMaxEntryAgeHours,
} from "../../../packages/contracts/src/source.ts";
import { adaptFeedIngress } from "../../../services/fetchers/src/feed-ingress-adapters.ts";

test("RSS adapter helpers infer aggregator strategies and default age gates", () => {
  const emptyConfig = parseRssChannelConfig({});

  assert.equal(
    resolveRssChannelAdapterStrategy("https://www.reddit.com/search.rss?q=signals", emptyConfig),
    "reddit_search_rss"
  );
  assert.equal(
    resolveRssChannelAdapterStrategy("https://hnrss.org/newest?points=50&link=comments", emptyConfig),
    "hn_comments_feed"
  );
  assert.equal(
    resolveRssChannelAdapterStrategy("https://news.google.com/rss/search?q=ai", emptyConfig),
    "google_news_rss"
  );
  assert.equal(
    resolveRssChannelAdapterStrategy("https://example.com/feed.xml", emptyConfig),
    "generic"
  );

  assert.equal(
    resolveRssChannelMaxEntryAgeHours("https://www.reddit.com/search.rss?q=signals", emptyConfig),
    168
  );
  assert.equal(
    resolveRssChannelMaxEntryAgeHours("https://example.com/feed.xml", emptyConfig),
    null
  );
});

test("Reddit adapter parses entity-heavy Atom feeds without the generic parser overflow", async () => {
  const repeatedEntities = "&amp;".repeat(1205);
  const atom = `<?xml version="1.0" encoding="UTF-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <title>Reddit search</title>
      <updated>2026-04-07T10:00:00Z</updated>
      <entry>
        <id>t3_abc123</id>
        <title>Integrator signal</title>
        <link rel="alternate" href="https://www.reddit.com/r/sysadmin/comments/abc123/integrator_signal/" />
        <summary type="html">${repeatedEntities}</summary>
        <content type="html"><p>Body</p></content>
        <updated>2026-04-07T09:30:00Z</updated>
      </entry>
    </feed>`;

  const adapted = await adaptFeedIngress({
    fetchUrl: "https://www.reddit.com/search.rss?q=integrator",
    rssConfig: parseRssChannelConfig({
      maxItemsPerPoll: 5,
      requestTimeoutMs: 2000,
      userAgent: "NewsPortalFetchers/Test",
      preferContentEncoded: true
    }),
    fetchedAt: "2026-04-07T10:00:00.000Z",
    contentType: "application/atom+xml",
    responseBody: atom
  });

  assert.equal(adapted.strategy, "reddit_search_rss");
  assert.equal(adapted.entries.length, 1);
  assert.equal(
    adapted.entries[0]?.url,
    "https://www.reddit.com/r/sysadmin/comments/abc123/integrator_signal"
  );
  assert.equal(adapted.droppedAdapterCount, 0);
  assert.equal(adapted.droppedStaleCount, 0);
});

test("Hacker News adapter extracts outbound article URLs, preserves discussion provenance, and drops stale/comment-only items", async () => {
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>HN comments</title>
        <item>
          <guid>hn-1</guid>
          <title>Vendor migration story</title>
          <link>https://news.ycombinator.com/item?id=1</link>
          <description><![CDATA[Article URL: https://publisher.example.com/story?id=1 Comments URL: https://news.ycombinator.com/item?id=1]]></description>
          <pubDate>Tue, 07 Apr 2026 09:00:00 GMT</pubDate>
        </item>
        <item>
          <guid>hn-2</guid>
          <title>Ask HN: how do you evaluate integration vendors?</title>
          <link>https://news.ycombinator.com/item?id=2</link>
          <description><![CDATA[Ask HN thread with no outbound article URL.]]></description>
          <pubDate>Tue, 07 Apr 2026 08:00:00 GMT</pubDate>
        </item>
        <item>
          <guid>hn-3</guid>
          <title>New comment by alice</title>
          <link>https://news.ycombinator.com/item?id=3</link>
          <description><![CDATA[Comment update only.]]></description>
          <pubDate>Tue, 07 Apr 2026 08:30:00 GMT</pubDate>
        </item>
        <item>
          <guid>hn-4</guid>
          <title>Old story</title>
          <link>https://news.ycombinator.com/item?id=4</link>
          <description><![CDATA[Article URL: https://publisher.example.com/old-story Comments URL: https://news.ycombinator.com/item?id=4]]></description>
          <pubDate>Sun, 29 Mar 2026 08:30:00 GMT</pubDate>
        </item>
      </channel>
    </rss>`;

  const adapted = await adaptFeedIngress({
    fetchUrl: "https://hnrss.org/newest?link=comments",
    rssConfig: parseRssChannelConfig({
      maxItemsPerPoll: 10,
      requestTimeoutMs: 2000,
      userAgent: "NewsPortalFetchers/Test",
      preferContentEncoded: true
    }),
    fetchedAt: "2026-04-07T10:00:00.000Z",
    contentType: "application/rss+xml",
    responseBody: rss
  });

  assert.equal(adapted.strategy, "hn_comments_feed");
  assert.equal(adapted.maxEntryAgeHours, 168);
  assert.equal(adapted.entries.length, 2);
  assert.equal(adapted.droppedAdapterCount, 1);
  assert.equal(adapted.droppedStaleCount, 1);

  const linked = adapted.entries[0];
  assert.equal(linked?.url, "https://publisher.example.com/story?id=1");
  assert.equal(linked?.feedAdapter.itemKind, "linked_article");
  assert.equal(linked?.feedAdapter.discussionUrl, "https://news.ycombinator.com/item?id=1");
  assert.equal(linked?.feedAdapter.discussionOnly, false);
  assert.equal(linked?.feedAdapter.canonicalResolved, true);

  const discussion = adapted.entries[1];
  assert.equal(discussion?.url, "https://news.ycombinator.com/item?id=2");
  assert.equal(discussion?.feedAdapter.itemKind, "discussion_thread");
  assert.equal(discussion?.feedAdapter.discussionOnly, true);
});

test("Google News adapter resolves publisher URLs with a per-poll cache and keeps wrapper provenance", async () => {
  const wrapperUrl = "https://news.google.com/rss/articles/CBMiTWh0dHBzOi8vbmV3cy5leGFtcGxlLmNvbS9zdG9yeT9vYz01";
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>Google News</title>
        <item>
          <guid>google-1</guid>
          <title>Cloud deal</title>
          <link>${wrapperUrl}</link>
          <description><![CDATA[Publisher summary]]></description>
          <pubDate>Tue, 07 Apr 2026 09:00:00 GMT</pubDate>
        </item>
        <item>
          <guid>google-2</guid>
          <title>Cloud deal duplicate wrapper</title>
          <link>${wrapperUrl}</link>
          <description><![CDATA[Publisher summary]]></description>
          <pubDate>Tue, 07 Apr 2026 09:05:00 GMT</pubDate>
        </item>
      </channel>
    </rss>`;

  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = (async () => {
    fetchCount += 1;
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      url: "https://publisher.example.com/cloud-deal?utm_source=google",
    } as Response;
  }) as typeof fetch;

  try {
    const adapted = await adaptFeedIngress({
      fetchUrl: "https://news.google.com/rss/search?q=cloud",
      rssConfig: parseRssChannelConfig({
        maxItemsPerPoll: 10,
        requestTimeoutMs: 2000,
        userAgent: "NewsPortalFetchers/Test",
        preferContentEncoded: true,
        adapterStrategy: "google_news_rss"
      }),
      fetchedAt: "2026-04-07T10:00:00.000Z",
      contentType: "application/rss+xml",
      responseBody: rss
    });

    assert.equal(adapted.entries.length, 2);
    assert.equal(fetchCount, 1);
    assert.equal(adapted.entries[0]?.url, "https://publisher.example.com/cloud-deal");
    assert.equal(adapted.entries[0]?.feedAdapter.sourceUrl, wrapperUrl);
    assert.equal(adapted.entries[0]?.feedAdapter.canonicalResolved, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
