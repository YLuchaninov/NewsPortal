import assert from "node:assert/strict";
import test from "node:test";

import { NEWSPORTAL_ERROR_CODES } from "../../../packages/contracts/src/index.ts";
import { probeFeedsForDiscovery } from "../../../services/fetchers/src/feed-probe.ts";
import { normalizeProbeUrl, validateAcquisitionUrl } from "../../../services/fetchers/src/probe-url-guard.ts";
import { validateUrlsForDiscovery } from "../../../services/fetchers/src/url-validation.ts";

test("normalizeProbeUrl rejects unsafe probe targets", () => {
  assert.equal(normalizeProbeUrl("ftp://example.com/feed.xml").url, null);
  assert.equal(normalizeProbeUrl("https://user:pass@example.com/feed.xml").url, null);
  assert.equal(normalizeProbeUrl("//example.com/feed.xml").url, null);
  assert.equal(normalizeProbeUrl("http://127.0.0.1/feed.xml").url, null);
  assert.equal(normalizeProbeUrl("http://2130706433/feed.xml").url, null);
  assert.equal(normalizeProbeUrl("http://[::ffff:127.0.0.1]/feed.xml").url, null);
  assert.equal(normalizeProbeUrl("http://169.254.169.254/latest/meta-data").url, null);
  assert.equal(normalizeProbeUrl("https://example.com/feed.xml").url, "https://example.com/feed.xml");
});

test("validateAcquisitionUrl rejects hosts that resolve to private addresses", async () => {
  const result = await validateAcquisitionUrl("https://private.example/feed.xml", {
    resolveDns: true,
    resolver: async () => [{ address: "10.10.10.10" }],
  });

  assert.equal(result.url, null);
  assert.match(result.error ?? "", /blocked address/);
});

test("validateAcquisitionUrl allows exact private compose fixture origins only when configured", async () => {
  const allowed = await validateAcquisitionUrl("http://web:4321/internal-mvp-feed.xml", {
    resolveDns: true,
    privateHostAllowlist: ["web:4321"],
    resolver: async () => [{ address: "192.168.97.6" }],
  });
  assert.equal(allowed.url, "http://web:4321/internal-mvp-feed.xml");
  assert.equal(allowed.error, null);

  const wrongPort = await validateAcquisitionUrl("http://web:4322/internal-mvp-feed.xml", {
    resolveDns: true,
    privateHostAllowlist: ["web:4321"],
    resolver: async () => [{ address: "192.168.97.6" }],
  });
  assert.equal(wrongPort.url, null);
  assert.match(wrongPort.error ?? "", /blocked address/);

  const adjacentHost = await validateAcquisitionUrl("http://web.evil.test/internal-mvp-feed.xml", {
    resolveDns: true,
    privateHostAllowlist: ["web:4321"],
    resolver: async () => [{ address: "192.168.97.6" }],
  });
  assert.equal(adjacentHost.url, null);
  assert.match(adjacentHost.error ?? "", /blocked address/);
});

test("validateAcquisitionUrl rejects internal API hosts when not explicitly allowlisted", async () => {
  const result = await validateAcquisitionUrl("http://api:8000/maintenance/discovery/search/ddgs", {
    resolveDns: true,
    privateHostAllowlist: [],
    resolver: async () => [{ address: "172.20.0.10" }],
  });

  assert.equal(result.url, null);
  assert.match(result.error ?? "", /blocked address/);
});

test("validateUrlsForDiscovery rejects unsafe inputs before fetch", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error("fetch should not be called");
  };

  try {
    const result = await validateUrlsForDiscovery({
      urls: ["http://169.254.169.254/latest/meta-data"],
      userAgent: "NewsPortalTest/0.1",
      timeoutMs: 1000,
    });

    assert.equal(fetchCalled, false);
    assert.equal(result.validated_urls[0]?.status, null);
    assert.equal(result.validated_urls[0]?.error_code, NEWSPORTAL_ERROR_CODES.acquisitionUrlBlocked);
    assert.equal(result.validated_urls[0]?.error_diagnostic?.domain, "acquisition_url");
    assert.match(result.validated_urls[0]?.error_text ?? "", /not allowed/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("validateUrlsForDiscovery revalidates final redirect targets", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    ({
      status: 200,
      headers: new Headers({ "content-type": "text/html" }),
      url: "http://127.0.0.1/admin",
      body: { cancel: async () => undefined },
    }) as unknown as Response;

  try {
    const result = await validateUrlsForDiscovery({
      urls: ["https://example.com/start"],
      userAgent: "NewsPortalTest/0.1",
      timeoutMs: 1000,
    });

    assert.equal(result.validated_urls[0]?.status, 200);
    assert.equal(result.validated_urls[0]?.error_code, NEWSPORTAL_ERROR_CODES.acquisitionUrlFinalBlocked);
    assert.equal(result.validated_urls[0]?.error_diagnostic?.retry_hint, "after_operator_fix");
    assert.match(result.validated_urls[0]?.error_text ?? "", /not allowed/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("probeFeedsForDiscovery returns normalized feed samples and diagnostics", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      `<?xml version="1.0"?>
        <rss>
          <channel>
            <title>Probe Feed</title>
            <item>
              <guid isPermaLink="true">https://example.com/story?utm_source=rss</guid>
              <title>Probe Story</title>
              <description>Probe summary</description>
            </item>
          </channel>
        </rss>`,
      {
        status: 200,
        headers: { "content-type": "application/rss+xml" },
      },
    );

  try {
    const result = await probeFeedsForDiscovery({
      urls: ["https://example.com/feed.xml"],
      sampleCount: 1,
      userAgent: "NewsPortalTest/0.1",
      timeoutMs: 1000,
    });

    assert.equal(result.probed_feeds.length, 1);
    assert.equal(result.probed_feeds[0]?.is_valid_rss, true);
    assert.equal(result.probed_feeds[0]?.error_code, null);
    assert.equal(result.probed_feeds[0]?.feed_title, "Probe Feed");
    assert.equal(result.probed_feeds[0]?.sample_entries[0]?.link, "https://example.com/story");
    assert.equal(result.probed_feeds[0]?.sample_entries[0]?.snippet, "Probe summary");
    assert.ok(result.probed_feeds[0]?.diagnostics.some((item) => item.code === "guid_permalink_used"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("probeFeedsForDiscovery discovers alternate feeds from HTML origins", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "https://example.com/") {
      return new Response(
        '<html><head><link rel="alternate" type="application/rss+xml" href="/feed.xml"></head></html>',
        {
          status: 200,
          headers: { "content-type": "text/html" },
        },
      );
    }
    return new Response(
      '<rss><channel><title>Hidden Feed</title><item><title>Hidden Story</title><link>https://example.com/story</link></item></channel></rss>',
      {
        status: 200,
        headers: { "content-type": "application/rss+xml" },
      },
    );
  };

  try {
    const result = await probeFeedsForDiscovery({
      urls: ["https://example.com/"],
      sampleCount: 1,
      userAgent: "NewsPortalTest/0.1",
      timeoutMs: 1000,
    });

    assert.equal(result.probed_feeds[0]?.is_valid_rss, true);
    assert.deepEqual(result.probed_feeds[0]?.discovered_feed_urls, ["https://example.com/feed.xml"]);
    assert.equal(result.probed_feeds[0]?.feed_url, "https://example.com/feed.xml");
    assert.equal(result.probed_feeds[0]?.sample_entries[0]?.title, "Hidden Story");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("probeFeedsForDiscovery resolves HTML alternates against base href", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "https://example.com/blog/page") {
      return new Response(
        '<html><head><base href="https://example.com/blog/"><link rel="alternate" type="application/atom+xml" href="feed.xml"></head></html>',
        {
          status: 200,
          headers: { "content-type": "text/html" },
        },
      );
    }
    return new Response(
      '<feed xmlns="http://www.w3.org/2005/Atom"><title>Base Feed</title><entry><title>Base Story</title><link href="https://example.com/blog/story"/></entry></feed>',
      {
        status: 200,
        headers: { "content-type": "application/atom+xml" },
      },
    );
  };

  try {
    const result = await probeFeedsForDiscovery({
      urls: ["https://example.com/blog/page"],
      sampleCount: 1,
      userAgent: "NewsPortalTest/0.1",
      timeoutMs: 1000,
    });

    assert.equal(result.probed_feeds[0]?.is_valid_rss, true);
    assert.deepEqual(result.probed_feeds[0]?.discovered_feed_urls, ["https://example.com/blog/feed.xml"]);
    assert.equal(result.probed_feeds[0]?.feed_url, "https://example.com/blog/feed.xml");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("probeFeedsForDiscovery discovers feeds from HTTP Link headers", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "https://example.com/news") {
      return new Response("<html><head><title>News</title></head><body>News</body></html>", {
        status: 200,
        headers: {
          "content-type": "text/html",
          link: '<https://example.com/rss.xml>; rel="alternate"; type="application/rss+xml"',
        },
      });
    }
    return new Response(
      '<rss><channel><title>Header Feed</title><item><title>Header Story</title><link>https://example.com/story</link></item></channel></rss>',
      {
        status: 200,
        headers: { "content-type": "application/rss+xml" },
      },
    );
  };

  try {
    const result = await probeFeedsForDiscovery({
      urls: ["https://example.com/news"],
      sampleCount: 1,
      userAgent: "NewsPortalTest/0.1",
      timeoutMs: 1000,
    });

    assert.equal(result.probed_feeds[0]?.is_valid_rss, true);
    assert.deepEqual(result.probed_feeds[0]?.discovered_feed_urls, ["https://example.com/rss.xml"]);
    assert.equal(result.probed_feeds[0]?.feed_title, "Header Feed");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("probeFeedsForDiscovery uses parsed HTML alternates and rejects unsafe redirects", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === "https://example.com/") {
      return new Response(
        '<html><head><LINK data-x="1" href="/rss.xml" TYPE="application/rss+xml" REL="author alternate"></head></html>',
        {
          status: 200,
          headers: { "content-type": "text/html" },
        },
      );
    }
    return new Response(
      '<rss><channel><title>Parsed Feed</title><item><title>Story</title><link>https://example.com/story</link></item></channel></rss>',
      {
        status: 200,
        headers: { "content-type": "application/rss+xml" },
      },
    );
  };

  try {
    const result = await probeFeedsForDiscovery({
      urls: [
        "https://example.com/",
        "https://example.com/",
        "http://127.0.0.1/feed.xml",
      ],
      sampleCount: 1,
      userAgent: "NewsPortalTest/0.1",
      timeoutMs: 1000,
    });

    assert.equal(result.probed_feeds.length, 2);
    assert.equal(result.probed_feeds[0]?.feed_title, "Parsed Feed");
    assert.equal(result.probed_feeds[1]?.is_valid_rss, false);
    assert.equal(result.probed_feeds[1]?.error_code, NEWSPORTAL_ERROR_CODES.acquisitionUrlBlocked);
    assert.equal(result.probed_feeds[1]?.error_diagnostic?.domain, "acquisition_url");
    assert.match(result.probed_feeds[1]?.error_text ?? "", /not allowed/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
