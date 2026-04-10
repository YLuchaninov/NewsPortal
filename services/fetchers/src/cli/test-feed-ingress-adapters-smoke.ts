import assert from "node:assert/strict";

import { parseRssChannelConfig } from "@newsportal/contracts";

import { adaptFeedIngress } from "../feed-ingress-adapters";

async function run(): Promise<void> {
  const redditEntities = "&amp;".repeat(1205);
  const redditFeed = `<?xml version="1.0" encoding="UTF-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <title>Reddit search</title>
      <updated>2026-04-07T10:00:00Z</updated>
      <entry>
        <id>t3_smoke</id>
        <title>Reddit smoke item</title>
        <link rel="alternate" href="https://www.reddit.com/r/sysadmin/comments/smoke/reddit_smoke/" />
        <summary type="html">${redditEntities}</summary>
        <content type="html"><p>Reddit smoke body</p></content>
        <updated>2026-04-07T09:30:00Z</updated>
      </entry>
    </feed>`;

  const redditResult = await adaptFeedIngress({
    fetchUrl: "https://www.reddit.com/search.rss?q=smoke",
    rssConfig: parseRssChannelConfig({
      maxItemsPerPoll: 5,
      requestTimeoutMs: 2000,
      userAgent: "NewsPortalFetchers/Smoke",
      preferContentEncoded: true,
    }),
    fetchedAt: "2026-04-07T10:00:00.000Z",
    contentType: "application/atom+xml",
    responseBody: redditFeed,
  });
  assert.equal(redditResult.entries.length, 1);
  assert.equal(redditResult.strategy, "reddit_search_rss");

  const hnFeed = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>HN smoke</title>
        <item>
          <guid>hn-1</guid>
          <title>Linked story</title>
          <link>https://news.ycombinator.com/item?id=11</link>
          <description><![CDATA[Article URL: https://publisher.example.com/smoke-story Comments URL: https://news.ycombinator.com/item?id=11]]></description>
          <pubDate>Tue, 07 Apr 2026 09:00:00 GMT</pubDate>
        </item>
        <item>
          <guid>hn-2</guid>
          <title>New comment by bob</title>
          <link>https://news.ycombinator.com/item?id=12</link>
          <description><![CDATA[Comment update]]></description>
          <pubDate>Tue, 07 Apr 2026 09:15:00 GMT</pubDate>
        </item>
        <item>
          <guid>hn-3</guid>
          <title>Old linked story</title>
          <link>https://news.ycombinator.com/item?id=13</link>
          <description><![CDATA[Article URL: https://publisher.example.com/old-story Comments URL: https://news.ycombinator.com/item?id=13]]></description>
          <pubDate>Sat, 28 Mar 2026 09:15:00 GMT</pubDate>
        </item>
      </channel>
    </rss>`;

  const hnResult = await adaptFeedIngress({
    fetchUrl: "https://hnrss.org/newest?link=comments",
    rssConfig: parseRssChannelConfig({
      maxItemsPerPoll: 10,
      requestTimeoutMs: 2000,
      userAgent: "NewsPortalFetchers/Smoke",
      preferContentEncoded: true,
    }),
    fetchedAt: "2026-04-07T10:00:00.000Z",
    contentType: "application/rss+xml",
    responseBody: hnFeed,
  });
  assert.equal(hnResult.entries.length, 1);
  assert.equal(hnResult.entries[0]?.url, "https://publisher.example.com/smoke-story");
  assert.equal(hnResult.droppedAdapterCount, 1);
  assert.equal(hnResult.droppedStaleCount, 1);

  const googleWrapper = "https://news.google.com/rss/articles/CBMiQGh0dHBzOi8vbmV3cy5leGFtcGxlLmNvbS9zbW9rZS1zdG9yeQ";
  const googleFeed = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>Google smoke</title>
        <item>
          <guid>google-1</guid>
          <title>Google smoke item</title>
          <link>${googleWrapper}</link>
          <description><![CDATA[Google smoke summary]]></description>
          <pubDate>Tue, 07 Apr 2026 09:00:00 GMT</pubDate>
        </item>
      </channel>
    </rss>`;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      url: "https://publisher.example.com/google-smoke?utm_source=news-google",
    } as Response;
  }) as typeof fetch;

  try {
    const googleResult = await adaptFeedIngress({
      fetchUrl: "https://news.google.com/rss/search?q=smoke",
      rssConfig: parseRssChannelConfig({
        maxItemsPerPoll: 5,
        requestTimeoutMs: 2000,
        userAgent: "NewsPortalFetchers/Smoke",
        preferContentEncoded: true,
        adapterStrategy: "google_news_rss",
      }),
      fetchedAt: "2026-04-07T10:00:00.000Z",
      contentType: "application/rss+xml",
      responseBody: googleFeed,
    });
    assert.equal(googleResult.entries.length, 1);
    assert.equal(googleResult.entries[0]?.url, "https://publisher.example.com/google-smoke");
    assert.equal(googleResult.entries[0]?.feedAdapter.sourceUrl, googleWrapper);
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log("feed-ingress-adapters smoke passed");
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
