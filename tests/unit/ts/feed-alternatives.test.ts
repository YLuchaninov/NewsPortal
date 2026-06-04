import assert from "node:assert/strict";
import test from "node:test";

import { planFeedAlternativesForDiscovery } from "../../../services/fetchers/src/feed-alternatives.ts";

test("planFeedAlternativesForDiscovery validates HTML alternate feeds and keeps unprobed paths separate", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "https://example.com/news") {
      return new Response(
        '<html><head><link rel="alternate" type="application/rss+xml" href="/feed.xml"></head><body><a href="/blog">Blog</a></body></html>',
        {
          status: 200,
          headers: { "content-type": "text/html" },
        },
      );
    }
    if (url === "https://example.com/robots.txt") {
      return new Response("Sitemap: https://example.com/sitemap.xml", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    }
    if (url === "https://example.com/sitemap.xml") {
      return new Response(
        '<urlset><url><loc>https://example.com/blog/post-1</loc><lastmod>2026-05-09</lastmod></url></urlset>',
        {
          status: 200,
          headers: { "content-type": "application/xml" },
        },
      );
    }
    if (url === "https://example.com/feed.xml") {
      return new Response(
        '<rss><channel><title>Validated Feed</title><item><title>Story</title><link>https://example.com/story</link></item></channel></rss>',
        {
          status: 200,
          headers: { "content-type": "application/rss+xml" },
        },
      );
    }
    return new Response("not found", { status: 404, statusText: "Not Found" });
  };

  try {
    const result = await planFeedAlternativesForDiscovery({
      urls: ["https://example.com/news"],
      sampleCount: 1,
      userAgent: "SignalOpsTest/0.1",
      timeoutMs: 1000,
      maxCandidatesPerUrl: 20,
    });

    const plan = result.alternative_plans[0];
    assert.equal(plan?.url, "https://example.com/news");
    assert.ok(
      plan?.candidates.some(
        (candidate) =>
          candidate.status === "candidate" &&
          candidate.provider_type === "rss" &&
          candidate.fetch_url === "https://example.com/feed.xml" &&
          candidate.feed_probe_evidence?.is_valid_rss === true,
      ),
    );
    assert.ok(plan?.candidates.some((candidate) => candidate.strategy === "robots_sitemap"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
