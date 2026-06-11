import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultMaxPollIntervalSeconds,
  normalizeMaxPollIntervalSeconds,
  parseApiChannelConfig,
  parseEmailImapChannelConfig,
  parseRssChannelConfig,
  parseSourceChannelAuthConfig,
  parseSourceChannelConfig,
  parseWebsiteChannelConfig,
  resolveSourceChannelAuthorizationHeader,
} from "../../../packages/contracts/src/source.ts";

test("parseSourceChannelConfig dispatches provider configs without changing parser output", () => {
  const rssInput = {
    maxItemsPerPoll: 7,
    adapterStrategy: "google_news_rss",
    maxEntryAgeHours: 24,
  };
  assert.deepEqual(parseSourceChannelConfig("rss", rssInput), parseRssChannelConfig(rssInput));

  const websiteInput = {
    maxResourcesPerPoll: 4,
    classification: {
      minConfidenceForTypedExtraction: 0.7,
    },
    curated: {
      preferCollectionDiscovery: true,
      documentUrlPatterns: ["/reports/", ".pdf"],
    },
    extraction: {
      extractTables: false,
      minEditorialBodyLength: 900,
    },
  };
  assert.deepEqual(
    parseSourceChannelConfig("website", websiteInput),
    parseWebsiteChannelConfig(websiteInput),
  );

  const apiInput = {
    requestMethod: "post",
    requestHeaders: {
      "X-Source": "research",
    },
    adapter: {
      adapterKey: "brave_search",
      contentKind: "document",
      accessKind: "official_free_key",
      searchQuery: {
        query: "site:example.org report",
        maxResults: 5,
        directCoverage: true,
      },
    },
  };
  assert.deepEqual(parseSourceChannelConfig("api", apiInput), parseApiChannelConfig(apiInput));
  assert.deepEqual(parseSourceChannelConfig("youtube", apiInput), parseApiChannelConfig(apiInput));

  const emailInput = {
    host: "imap.example.org",
    mailbox: "Signals",
    searchFrom: "alerts@example.org",
    bodyPreference: "html",
  };
  assert.deepEqual(
    parseSourceChannelConfig("email_imap", emailInput),
    parseEmailImapChannelConfig(emailInput),
  );
});

test("source channel config helpers preserve auth, header, schedule, and resource-kind safety", () => {
  assert.deepEqual(parseSourceChannelAuthConfig({ authorizationHeader: " Bearer token " }), {
    authorizationHeader: "Bearer token",
  });
  assert.equal(
    resolveSourceChannelAuthorizationHeader(
      "https://example.org/api/items",
      "https://example.org/feed",
      { authorizationHeader: "Bearer token" },
    ),
    "Bearer token",
  );
  assert.equal(
    resolveSourceChannelAuthorizationHeader(
      "https://cdn.example.org/api/items",
      "https://example.org/feed",
      { authorizationHeader: "Bearer token" },
    ),
    null,
  );

  assert.throws(
    () => parseApiChannelConfig({ requestHeaders: { Authorization: "Bearer hidden" } }),
    /managed by SignalOps/,
  );

  const apiConfig = parseApiChannelConfig({
    adapter: {
      adapterKey: "exa_search",
      contentKind: "data_file",
      searchQuery: {
        query: "public dataset",
        maxResults: 3,
      },
    },
  });
  assert.equal(apiConfig.adapter.contentKind, "data_file");
  assert.equal(apiConfig.adapter.searchQuery.maxResults, 3);

  assert.equal(defaultMaxPollIntervalSeconds(300), 4800);
  assert.equal(normalizeMaxPollIntervalSeconds(300, null), 4800);
  assert.equal(normalizeMaxPollIntervalSeconds(300, 60), 300);
  assert.equal(normalizeMaxPollIntervalSeconds(300, 9999999), 604800);
});
