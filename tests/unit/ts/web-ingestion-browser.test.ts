import assert from "node:assert/strict";
import test from "node:test";

import { parseWebsiteChannelConfig } from "../../../packages/contracts/src/source.ts";
import {
  buildBrowserRouteHeaders,
  buildWebsiteRequestHeaders,
  inferResourceKindsFromUrl,
  selectWebsiteDiscoveryModes,
  shouldAttemptBrowserAssistedDiscovery,
  type WebsiteCapabilities,
} from "../../../services/fetchers/src/web-ingestion.ts";

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
