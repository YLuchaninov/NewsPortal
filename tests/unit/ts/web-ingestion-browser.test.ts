import assert from "node:assert/strict";
import test from "node:test";

import { parseWebsiteChannelConfig } from "../../../packages/contracts/src/source.ts";
import {
  buildBrowserRouteHeaders,
  buildWebsiteRequestHeaders,
  classifyResourceCandidate,
  CrawlPolicyCacheService,
  discoverWebsiteResources,
  extractCollectionLinkCandidates,
  probeWebsiteCapabilities,
  inferResourceKindsFromUrl,
  selectWebsiteDiscoveryModes,
  shouldAttemptBrowserAssistedDiscovery,
  type RuntimeCrawlPolicy,
  type WebsiteCapabilities,
} from "../../../services/fetchers/src/web-ingestion.ts";

function buildPolicy(overrides: Partial<RuntimeCrawlPolicy> = {}): RuntimeCrawlPolicy {
  return {
    domain: "example.com",
    sitemapUrls: [],
    feedUrls: [],
    llmsTxtBody: null,
    fetchedAt: "2026-04-15T12:00:00Z",
    expiresAt: "2026-04-15T13:00:00Z",
    fetchError: null,
    httpStatus: 200,
    requestValidators: {},
    responseCache: {},
    conditionalRequestHits: {
      homepage: 0,
      sitemap: 0,
      feed: 0,
      robots: 0,
      llms: 0,
    },
    isAllowed: () => true,
    crawlDelaySeconds: () => null,
    ...overrides,
  };
}

function buildCapabilities(overrides: Partial<WebsiteCapabilities> = {}): WebsiteCapabilities {
  return {
    sitemapUrls: [],
    feedUrls: [],
    inlineDataHints: false,
    jsHeavyHint: false,
    challengeKindHint: null,
    supportsDownloads: false,
    defaultCollectionUrls: [],
    contentTypes: ["text/html"],
    homepageHtml: "<html></html>",
    homepageStatus: 200,
    ...overrides,
  };
}

test("selectWebsiteDiscoveryModes keeps browser_assisted out of the cheap static mode list", () => {
  const config = parseWebsiteChannelConfig({
    browserFallbackEnabled: true,
    sitemapDiscoveryEnabled: true,
    feedDiscoveryEnabled: true,
    collectionDiscoveryEnabled: true,
    downloadDiscoveryEnabled: true,
  });

  const modes = selectWebsiteDiscoveryModes(
    buildCapabilities({
      sitemapUrls: ["https://example.com/sitemap.xml"],
      feedUrls: ["https://example.com/feed.xml"],
      inlineDataHints: true,
      supportsDownloads: true,
    }),
    config
  );

  assert.deepEqual(modes, ["sitemap", "feed", "collection", "inline_data", "download"]);
});

test("selectWebsiteDiscoveryModes can prefer collection discovery first for curated live sites", () => {
  const config = parseWebsiteChannelConfig({
    browserFallbackEnabled: true,
    sitemapDiscoveryEnabled: true,
    feedDiscoveryEnabled: true,
    collectionDiscoveryEnabled: true,
    curated: {
      preferCollectionDiscovery: true,
    },
  });

  const modes = selectWebsiteDiscoveryModes(
    buildCapabilities({
      sitemapUrls: ["https://example.com/sitemap.xml"],
      feedUrls: ["https://example.com/feed.xml"],
      inlineDataHints: true,
    }),
    config
  );

  assert.deepEqual(modes, ["collection", "sitemap", "feed", "inline_data"]);
});

test("shouldAttemptBrowserAssistedDiscovery requires the website browser fallback flag", () => {
  const disabledConfig = parseWebsiteChannelConfig({
    browserFallbackEnabled: false,
  });

  assert.equal(
    shouldAttemptBrowserAssistedDiscovery({
      capabilities: buildCapabilities({ jsHeavyHint: true }),
      config: disabledConfig,
      staticResourceCount: 0,
    }),
    false
  );
});

test("shouldAttemptBrowserAssistedDiscovery turns on for empty cheap discovery or explicit hard-site evidence", () => {
  const enabledConfig = parseWebsiteChannelConfig({
    browserFallbackEnabled: true,
    maxResourcesPerPoll: 10,
  });

  assert.equal(
    shouldAttemptBrowserAssistedDiscovery({
      capabilities: buildCapabilities(),
      config: enabledConfig,
      staticResourceCount: 0,
    }),
    true
  );

  assert.equal(
    shouldAttemptBrowserAssistedDiscovery({
      capabilities: buildCapabilities({ jsHeavyHint: true }),
      config: enabledConfig,
      staticResourceCount: 1,
    }),
    true
  );

  assert.equal(
    shouldAttemptBrowserAssistedDiscovery({
      capabilities: buildCapabilities({ jsHeavyHint: false }),
      config: enabledConfig,
      staticResourceCount: 3,
    }),
    false
  );
});

test("shouldAttemptBrowserAssistedDiscovery respects the tiny curated browser override", () => {
  const enabledConfig = parseWebsiteChannelConfig({
    browserFallbackEnabled: true,
    curated: {
      preferBrowserFallback: true,
    },
  });

  assert.equal(
    shouldAttemptBrowserAssistedDiscovery({
      capabilities: buildCapabilities({ jsHeavyHint: false }),
      config: enabledConfig,
      staticResourceCount: 6,
    }),
    true
  );
});

test("shouldAttemptBrowserAssistedDiscovery skips browser when static editorial results are already strong", () => {
  const enabledConfig = parseWebsiteChannelConfig({
    browserFallbackEnabled: true,
    maxResourcesPerPoll: 15,
  });

  assert.equal(
    shouldAttemptBrowserAssistedDiscovery({
      capabilities: buildCapabilities({
        jsHeavyHint: true,
        challengeKindHint: "cloudflare_js_challenge",
      }),
      config: enabledConfig,
      staticResourceCount: 8,
      staticEditorialCount: 6,
      staticListingCount: 1,
      staticUnknownCount: 0,
    }),
    false
  );
});

test("inferResourceKindsFromUrl matches whole path segments instead of browser-* substrings", () => {
  assert.deepEqual(
    inferResourceKindsFromUrl("https://example.com/news/browser-story-123.html"),
    ["editorial"]
  );

  assert.deepEqual(
    inferResourceKindsFromUrl("https://example.com/profiles/browser-entity-123.html"),
    ["entity"]
  );

  assert.deepEqual(
    inferResourceKindsFromUrl("https://example.com/browse/latest"),
    ["listing"]
  );

  assert.deepEqual(
    inferResourceKindsFromUrl("https://example.com/changelog"),
    ["listing"]
  );

  assert.deepEqual(
    inferResourceKindsFromUrl("https://example.com/changelog/new-mcp-runtime"),
    ["editorial"]
  );
});

test("classifyResourceCandidate promotes dated collection cards to editorial instead of leaving them listing-heavy", () => {
  const classification = classifyResourceCandidate({
    url: "https://example.com/news/eu-policy-package-april-2026",
    title: "EU policy package reaches final approval",
    summary: "The Commission approved the package after weeks of negotiations and published implementation details for member states.",
    hintedKinds: ["unknown"],
    hasRepeatedCards: true,
    hasPagination: true,
    publishedAtHint: "2026-04-16T00:00:00.000Z",
    discoverySource: "collection_page",
  });

  assert.equal(classification.kind, "editorial");
  assert.ok(classification.reasons.includes("signal:published_at"));
  assert.ok(classification.reasons.includes("collection:article_card"));
});

test("classifyResourceCandidate keeps detail-like editorial pages out of listing on ambient card-heavy layouts", () => {
  const classification = classifyResourceCandidate({
    url: "https://example.com/news/press-releases/eu-policy-package-reaches-final-approval",
    title: "EU policy package reaches final approval",
    summary:
      "The Department published implementation guidance, next steps, and a detailed explainer for member states after final approval.",
    hintedKinds: ["editorial"],
    hasRepeatedCards: true,
    hasPagination: true,
    publishedAtHint: "2026-04-16T00:00:00.000Z",
    discoverySource: "detail_page",
  });

  assert.equal(classification.kind, "editorial");
  assert.ok(classification.reasons.includes("path:editorial_detail"));
});

test("extractCollectionLinkCandidates infers heading titles for generic CTA links inside article cards", () => {
  const html = `
    <section class="views-row">
      <span class="field field--name-title field--type-string field--label-hidden">
        <h3>Nigeria: Updated EUAA Country Guidance reflects the country's security and social challenges</h3>
      </span>
      <time datetime="2026-03-26T12:00:00Z" class="datetime">26 March 2026</time>
      <a href="/news-events/nigeria-updated-euaa-country-guidance-reflects-countrys-security-and-social-challenges">Read More</a>
    </section>
  `;

  const candidates = extractCollectionLinkCandidates(html, "https://www.euaa.europa.eu/news-events/press-releases");

  assert.equal(candidates.length, 1);
  assert.equal(
    candidates[0]?.text,
    "Nigeria: Updated EUAA Country Guidance reflects the country's security and social challenges"
  );
  assert.equal(candidates[0]?.publishedAt, "2026-03-26T12:00:00.000Z");
  assert.ok(candidates[0]?.summary == null || candidates[0]?.summary.length >= 0);
});

test("extractCollectionLinkCandidates strips navigation residue out of the summary context", () => {
  const html = `
    <nav class="usa-nav__submenu">
      <a href="/news/press-releases">Press Releases</a>
      <div class="usa-nav__submenu-item no_menu_link">menu_level__1</div>
    </nav>
  `;

  const candidates = extractCollectionLinkCandidates(html, "https://www.justice.gov/careers/search-jobs");

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.text, "Press Releases");
  assert.equal(candidates[0]?.summary, null);
});

test("buildWebsiteRequestHeaders injects Authorization only for same-origin requests", () => {
  const sameOriginHeaders = buildWebsiteRequestHeaders({
    requestUrl: "https://example.com/feed.xml",
    channelUrl: "https://example.com/protected",
    authConfig: { authorizationHeader: "Bearer secret-token" },
    headers: { accept: "application/rss+xml" }
  });
  assert.equal(sameOriginHeaders.get("authorization"), "Bearer secret-token");
  assert.equal(sameOriginHeaders.get("accept"), "application/rss+xml");

  const crossOriginHeaders = buildWebsiteRequestHeaders({
    requestUrl: "https://cdn.example.net/feed.xml",
    channelUrl: "https://example.com/protected",
    authConfig: { authorizationHeader: "Bearer secret-token" },
    headers: { accept: "application/rss+xml" }
  });
  assert.equal(crossOriginHeaders.get("authorization"), null);
});

test("buildBrowserRouteHeaders preserves existing headers and blocks cross-origin auth leakage", () => {
  const sameOriginHeaders = buildBrowserRouteHeaders({
    requestUrl: "https://example.com/app/data.json",
    channelUrl: "https://example.com/",
    authConfig: { authorizationHeader: "Bearer browser-token" },
    headers: {
      accept: "application/json",
      "x-trace-id": "trace-123"
    }
  });
  assert.equal(sameOriginHeaders.authorization, "Bearer browser-token");
  assert.equal(sameOriginHeaders.accept, "application/json");
  assert.equal(sameOriginHeaders["x-trace-id"], "trace-123");

  const crossOriginHeaders = buildBrowserRouteHeaders({
    requestUrl: "https://static.example-cdn.com/app.js",
    channelUrl: "https://example.com/",
    authConfig: { authorizationHeader: "Bearer browser-token" },
    headers: {
      accept: "*/*"
    }
  });
  assert.equal(crossOriginHeaders.authorization, undefined);
  assert.equal(crossOriginHeaders.accept, "*/*");
});

test("CrawlPolicyCacheService.persistConditionalState updates validator/cache JSON without malformed SQL", async () => {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const service = new CrawlPolicyCacheService({
    query: async (text: string, values: unknown[]) => {
      calls.push({ text, values });
      return { rows: [] };
    },
  } as any);

  await service.persistConditionalState("https://example.com/news", {
    requestValidators: {
      homepage: {
        url: "https://example.com/news",
        etag: "\"homepage-etag\"",
        lastModified: "Tue, 15 Apr 2026 10:00:00 GMT",
      },
    },
    responseCache: {
      homepage: {
        url: "https://example.com/news",
        status: 200,
        contentType: "text/html; charset=utf-8",
        text: "<html></html>",
        updatedAt: "2026-04-15T10:00:00Z",
      },
    },
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].text, /update crawl_policy_cache/i);
  assert.doesNotMatch(calls[0].text, /response_cache_json = \$3::jsonb,\s*where/i);
  assert.deepEqual(calls[0].values, [
    "example.com",
    JSON.stringify({
      homepage: {
        url: "https://example.com/news",
        etag: "\"homepage-etag\"",
        lastModified: "Tue, 15 Apr 2026 10:00:00 GMT",
      },
    }),
    JSON.stringify({
      homepage: {
        url: "https://example.com/news",
        status: 200,
        contentType: "text/html; charset=utf-8",
        text: "<html></html>",
        updatedAt: "2026-04-15T10:00:00Z",
      },
    }),
  ]);
});

test("discoverWebsiteResources handles very large sitemap result sets without overflowing the call stack", async () => {
  const baseUrl = "https://large-sitemap.example.test";
  const sitemapBody = `<?xml version="1.0" encoding="UTF-8"?><urlset>${Array.from(
    { length: 70000 },
    (_, index) =>
      `<url><loc>${baseUrl}/articles/${index + 1}</loc><lastmod>2026-04-15T12:00:00Z</lastmod></url>`
  ).join("")}</urlset>`;
  const policy: RuntimeCrawlPolicy = {
    ...buildPolicy({
      domain: "large-sitemap.example.test",
      sitemapUrls: [`${baseUrl}/sitemap.xml`],
      responseCache: {
        homepage: {
          url: `${baseUrl}/`,
          status: 200,
          contentType: "text/html; charset=utf-8",
          text: "<html><head><title>Large sitemap fixture</title></head><body><h1>Fixture</h1></body></html>",
          updatedAt: "2026-04-15T12:00:00Z",
        },
      },
    }),
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === `${baseUrl}/sitemap.xml`) {
      return {
        url,
        status: 200,
        headers: new Headers({ "content-type": "application/xml; charset=utf-8" }),
        text: async () => sitemapBody,
      } as Response;
    }
    return {
      url,
      status: 404,
      headers: new Headers({ "content-type": "text/plain; charset=utf-8" }),
      text: async () => "not found",
    } as Response;
  }) as typeof fetch;

  try {
    const result = await discoverWebsiteResources({
      channelUrl: `${baseUrl}/`,
      policy,
      config: parseWebsiteChannelConfig({
        maxResourcesPerPoll: 5,
        browserFallbackEnabled: false,
      }),
      cursors: {},
    });

    assert.equal(result.homepageStatus, 200);
    assert.deepEqual(result.modes, ["sitemap", "collection"]);
    assert.equal(result.resources.length, 5);
    assert.ok(result.resources.every((resource) => resource.discoverySource === "sitemap"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("probeWebsiteCapabilities does not treat public nav sign-in links as a login challenge", async () => {
  const capabilities = await probeWebsiteCapabilities(
    "https://example.com/product",
    buildPolicy({
      responseCache: {
        homepage: {
          url: "https://example.com/product",
          status: 200,
          contentType: "text/html; charset=utf-8",
          text: `<!doctype html>
        <html>
          <head><title>Product updates</title></head>
          <body>
            <header>
              <a href="/pricing">Pricing</a>
              <a href="/login">Log in</a>
            </header>
            <main>
              <h1>Latest product updates</h1>
              <p>Public announcements for everyone.</p>
            </main>
          </body>
        </html>`,
          updatedAt: "2026-04-15T12:00:00Z",
        },
      },
    }),
    parseWebsiteChannelConfig({})
  );

  assert.equal(capabilities.challengeKindHint, null);
});

test("probeWebsiteCapabilities still marks real login gates as login challenges", async () => {
  const capabilities = await probeWebsiteCapabilities(
    "https://example.com/sign-in",
    buildPolicy({
      responseCache: {
        homepage: {
          url: "https://example.com/sign-in",
          status: 200,
          contentType: "text/html; charset=utf-8",
          text: `<!doctype html>
        <html>
          <head><title>Sign in</title></head>
          <body>
            <main>
              <h1>Sign in</h1>
              <form action="/session" method="post">
                <label>Email <input type="email" name="email" /></label>
                <label>Password <input type="password" name="password" /></label>
                <button type="submit">Sign in</button>
              </form>
            </main>
          </body>
        </html>`,
          updatedAt: "2026-04-15T12:00:00Z",
        },
      },
    }),
    parseWebsiteChannelConfig({})
  );

  assert.equal(capabilities.challengeKindHint, "login");
});

test("probeWebsiteCapabilities preserves homepage auth failure status from conditional state when no cached body exists", async () => {
  const capabilities = await probeWebsiteCapabilities(
    "https://example.com/protected",
    buildPolicy({
      requestValidators: {
        homepage: {
          etag: null,
          lastModified: null,
          finalUrl: "https://example.com/protected",
          contentType: "text/html; charset=utf-8",
          httpStatus: 401,
          updatedAt: "2026-04-16T10:00:00Z",
        },
      },
      responseCache: {},
    }),
    parseWebsiteChannelConfig({})
  );

  assert.equal(capabilities.homepageStatus, 401);
  assert.equal(capabilities.homepageHtml, null);
});

test("probeWebsiteCapabilities classifies Akamai interstitials as unsupported blocks", async () => {
  const capabilities = await probeWebsiteCapabilities(
    "https://example.com/news/press-releases",
    buildPolicy({
      responseCache: {
        homepage: {
          url: "https://example.com/news/press-releases",
          status: 200,
          contentType: "text/html; charset=utf-8",
          text: `<!DOCTYPE html>
            <html>
              <head>
                <meta http-equiv="refresh" content="5; URL='/news/press-releases?bm-verify=token'" />
                <title>&nbsp;</title>
              </head>
              <body>
                <p>Powered and protected by</p>
                <img src="/_sec/akamai-logo.svg" alt="Powered by Akamai" />
                <script>
                  fetch("/_sec/verify?provider=interstitial", { method: "POST" });
                </script>
              </body>
            </html>`,
          updatedAt: "2026-04-16T12:00:00Z",
        },
      },
    }),
    parseWebsiteChannelConfig({})
  );

  assert.equal(capabilities.challengeKindHint, "unsupported_block");
});

test("discoverWebsiteResources reuses cached homepage content and records conditional-request hits", async () => {
  const baseUrl = "https://conditional.example.test";
  const originalFetch = globalThis.fetch;
  const seenHeaders: Array<{ url: string; ifNoneMatch: string | null; ifModifiedSince: string | null }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    seenHeaders.push({
      url,
      ifNoneMatch: headers.get("if-none-match"),
      ifModifiedSince: headers.get("if-modified-since"),
    });
    if (url === `${baseUrl}/sitemap.xml`) {
      return {
        url,
        status: 304,
        headers: new Headers({
          etag: '"sitemap-v1"',
          "last-modified": "Sat, 28 Mar 2026 11:00:00 GMT",
        }),
        text: async () => "",
      } as Response;
    }
    if (url === `${baseUrl}/hidden-feed.xml`) {
      return {
        url,
        status: 304,
        headers: new Headers({
          etag: '"feed-v1"',
          "last-modified": "Sat, 28 Mar 2026 12:30:00 GMT",
        }),
        text: async () => "",
      } as Response;
    }
    return {
      url,
      status: 404,
      headers: new Headers({ "content-type": "text/plain; charset=utf-8" }),
      text: async () => "not found",
    } as Response;
  }) as typeof fetch;

  try {
    const result = await discoverWebsiteResources({
      channelUrl: `${baseUrl}/`,
      policy: buildPolicy({
        domain: "conditional.example.test",
        sitemapUrls: [`${baseUrl}/sitemap.xml`],
        feedUrls: [`${baseUrl}/hidden-feed.xml`],
        requestValidators: {
          "sitemap:https://conditional.example.test/sitemap.xml": {
            etag: '"sitemap-v1"',
            lastModified: "Sat, 28 Mar 2026 11:00:00 GMT",
            finalUrl: `${baseUrl}/sitemap.xml`,
            contentType: "application/xml",
            httpStatus: 200,
            updatedAt: "2026-04-15T12:00:00Z",
          },
          "feed:https://conditional.example.test/hidden-feed.xml": {
            etag: '"feed-v1"',
            lastModified: "Sat, 28 Mar 2026 12:30:00 GMT",
            finalUrl: `${baseUrl}/hidden-feed.xml`,
            contentType: "application/rss+xml",
            httpStatus: 200,
            updatedAt: "2026-04-15T12:00:00Z",
          },
        },
        responseCache: {
          homepage: {
            url: `${baseUrl}/`,
            status: 200,
            contentType: "text/html; charset=utf-8",
            text: `<!doctype html>
              <html>
                <head>
                  <title>Conditional fixture</title>
                  <link rel="alternate" type="application/rss+xml" href="${baseUrl}/hidden-feed.xml">
                </head>
                <body>
                  <main><h1>Conditional fixture</h1></main>
                </body>
              </html>`,
            updatedAt: "2026-04-15T12:00:00Z",
          },
        },
      }),
      config: parseWebsiteChannelConfig({
        maxResourcesPerPoll: 10,
        browserFallbackEnabled: true,
        collectionDiscoveryEnabled: false,
        downloadDiscoveryEnabled: false,
      }),
      cursors: {},
    });

    assert.equal(result.homepageStatus, 200);
    assert.equal(result.metrics.conditionalRequestHits.sitemap, 1);
    assert.equal(result.metrics.conditionalRequestHits.feed, 1);
    assert.equal(result.metrics.browserAttempted, false);
    assert.deepEqual(
      seenHeaders
        .filter((entry) => entry.url.includes("sitemap") || entry.url.includes("hidden-feed"))
        .map((entry) => [entry.ifNoneMatch, entry.ifModifiedSince]),
      [
        ['"sitemap-v1"', "Sat, 28 Mar 2026 11:00:00 GMT"],
        ['"feed-v1"', "Sat, 28 Mar 2026 12:30:00 GMT"],
      ]
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("discoverWebsiteResources ignores unrelated default collection seeds when channelUrl already targets a specific section", async () => {
  const channelUrl = "https://example.com/news/press-releases";
  const unrelatedSeed = "https://example.com/careers/search-jobs";
  const fetchedUrls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    fetchedUrls.push(url);
    if (url === channelUrl) {
      return {
        url,
        status: 200,
        headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
        text: async () => `
          <section class="views-row">
            <h3>DOJ announces new enforcement initiative</h3>
            <time datetime="2026-04-16T12:00:00Z">April 16, 2026</time>
            <a href="/news/press-releases/2026/04/16/doj-announces-new-enforcement-initiative">Read More</a>
          </section>
        `,
      } as Response;
    }
    if (url === unrelatedSeed) {
      return {
        url,
        status: 200,
        headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
        text: async () => `
          <nav class="usa-nav__submenu-item">
            <a href="/news/press-releases">Press Releases</a>
          </nav>
        `,
      } as Response;
    }
    return {
      url,
      status: 404,
      headers: new Headers({ "content-type": "text/plain; charset=utf-8" }),
      text: async () => "not found",
    } as Response;
  }) as typeof fetch;

  try {
    const result = await discoverWebsiteResources({
      channelUrl,
      policy: buildPolicy({
        domain: "example.com",
        responseCache: {
          homepage: {
            url: channelUrl,
            status: 200,
            contentType: "text/html; charset=utf-8",
            text: `
              <main>
                <a href="${unrelatedSeed}">Search jobs</a>
              </main>
            `,
            updatedAt: "2026-04-16T12:00:00Z",
          },
        },
      }),
      config: parseWebsiteChannelConfig({
        browserFallbackEnabled: false,
        collectionDiscoveryEnabled: true,
        sitemapDiscoveryEnabled: false,
        feedDiscoveryEnabled: false,
        downloadDiscoveryEnabled: false,
      }),
      cursors: {},
    });

    assert.deepEqual(fetchedUrls, [channelUrl]);
    assert.equal(result.resources.length, 1);
    assert.equal(result.resources[0]?.normalizedUrl, "https://example.com/news/press-releases/2026/04/16/doj-announces-new-enforcement-initiative");
    assert.equal(result.resources[0]?.classification.kind, "editorial");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("discoverWebsiteResources drops weak listing-root candidates coming from unrelated collection parents", async () => {
  const channelUrl = "https://example.com/news/press-releases";
  const unrelatedSeed = "https://example.com/careers/search-jobs";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === channelUrl) {
      return {
        url,
        status: 200,
        headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
        text: async () => "<main><h1>Press releases</h1></main>",
      } as Response;
    }
    if (url === unrelatedSeed) {
      return {
        url,
        status: 200,
        headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
        text: async () => `
          <nav class="usa-nav__submenu-item">
            <a href="/news/press-releases">Press Releases</a>
          </nav>
        `,
      } as Response;
    }
    return {
      url,
      status: 404,
      headers: new Headers({ "content-type": "text/plain; charset=utf-8" }),
      text: async () => "not found",
    } as Response;
  }) as typeof fetch;

  try {
    const result = await discoverWebsiteResources({
      channelUrl,
      policy: buildPolicy({
        domain: "example.com",
        responseCache: {
          homepage: {
            url: channelUrl,
            status: 200,
            contentType: "text/html; charset=utf-8",
            text: "<main><h1>Press releases</h1></main>",
            updatedAt: "2026-04-16T12:00:00Z",
          },
        },
      }),
      config: parseWebsiteChannelConfig({
        browserFallbackEnabled: false,
        collectionDiscoveryEnabled: true,
        sitemapDiscoveryEnabled: false,
        feedDiscoveryEnabled: false,
        downloadDiscoveryEnabled: false,
        blockedUrlPatterns: ["/careers"],
        collectionSeedUrls: [unrelatedSeed],
      }),
      cursors: {},
    });

    assert.equal(result.resources.length, 0);
    assert.equal(result.metrics.staticAcceptedCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("discoverWebsiteResources preserves blocked parentUrl through dedupe so sitemap plus collection duplicates can still be filtered", async () => {
  const channelUrl = "https://example.com/news/press-releases";
  const unrelatedSeed = "https://example.com/careers/search-jobs";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === channelUrl) {
      return {
        url,
        status: 200,
        headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
        text: async () => "<main><h1>Press releases</h1></main>",
      } as Response;
    }
    if (url === unrelatedSeed) {
      return {
        url,
        status: 200,
        headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
        text: async () => `
          <nav class="usa-nav__submenu-item no_menu_link">
            <time datetime="2026-04-16T12:00:00Z">April 16, 2026</time>
            <a href="/news/press-releases">Press Releases</a>
          </nav>
        `,
      } as Response;
    }
    if (url === "https://example.com/sitemap.xml") {
      return {
        url,
        status: 200,
        headers: new Headers({ "content-type": "application/xml; charset=utf-8" }),
        text: async () => `
          <?xml version="1.0" encoding="UTF-8"?>
          <urlset>
            <url><loc>https://example.com/news/press-releases</loc></url>
          </urlset>
        `,
      } as Response;
    }
    return {
      url,
      status: 404,
      headers: new Headers({ "content-type": "text/plain; charset=utf-8" }),
      text: async () => "not found",
    } as Response;
  }) as typeof fetch;

  try {
    const result = await discoverWebsiteResources({
      channelUrl,
      policy: buildPolicy({
        domain: "example.com",
        sitemapUrls: ["https://example.com/sitemap.xml"],
        responseCache: {
          homepage: {
            url: channelUrl,
            status: 200,
            contentType: "text/html; charset=utf-8",
            text: "<main><h1>Press releases</h1></main>",
            updatedAt: "2026-04-16T12:00:00Z",
          },
        },
      }),
      config: parseWebsiteChannelConfig({
        browserFallbackEnabled: false,
        collectionDiscoveryEnabled: true,
        sitemapDiscoveryEnabled: true,
        feedDiscoveryEnabled: false,
        downloadDiscoveryEnabled: false,
        blockedUrlPatterns: ["/careers"],
        collectionSeedUrls: [unrelatedSeed],
      }),
      cursors: {},
    });

    assert.equal(result.resources.length, 0);
    assert.equal(result.metrics.staticAcceptedCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
