import assert from "node:assert/strict";
import test from "node:test";

import { parseApiChannelConfig } from "../../../packages/contracts/src/source.ts";

test("parseApiChannelConfig preserves default single-page GET behavior", () => {
  const config = parseApiChannelConfig({});

  assert.equal(config.requestMethod, "GET");
  assert.deepEqual(config.requestHeaders, {});
  assert.equal(config.requestBodyJson, null);
  assert.deepEqual(config.pagination, {
    mode: "none",
    nextUrlPath: "next",
    pageParam: "page",
    pageStart: 1,
    maxPagesPerPoll: 1,
  });
});

test("parseApiChannelConfig accepts bounded POST and pagination options", () => {
  const config = parseApiChannelConfig({
    requestMethod: "post",
    requestHeaders: {
      "X-Api-Version": "2026-05-01",
    },
    requestBodyJson: {
      query: "energy",
      flags: ["fresh"],
    },
    pagination: {
      mode: "next_url",
      nextUrlPath: "paging.next",
      maxPagesPerPoll: 25,
    },
  });

  assert.equal(config.requestMethod, "POST");
  assert.deepEqual(config.requestHeaders, {
    "x-api-version": "2026-05-01",
  });
  assert.deepEqual(config.requestBodyJson, {
    query: "energy",
    flags: ["fresh"],
  });
  assert.deepEqual(config.pagination, {
    mode: "next_url",
    nextUrlPath: "paging.next",
    pageParam: "page",
    pageStart: 1,
    maxPagesPerPoll: 10,
  });
});

test("parseApiChannelConfig rejects unsafe header ownership", () => {
  assert.throws(
    () =>
      parseApiChannelConfig({
        requestHeaders: {
          Authorization: "Bearer hidden",
        },
      }),
    /managed by NewsPortal/,
  );
});

test("parseApiChannelConfig accepts experimental adapter metadata without field-mapping changes", () => {
  const config = parseApiChannelConfig({
    itemsPath: "data.records",
    api: {
      adapterKey: "hn_algolia_search",
      sourceRole: "community_search",
      contentKind: "api_payload",
      query: "looking for contractor",
      accessKind: "official_free",
      tosRisk: "low",
      tags: ["hidden-signal", "community"],
    },
  });

  assert.equal(config.itemsPath, "data.records");
  assert.equal(config.adapter.adapterKey, "hn_algolia_search");
  assert.equal(config.adapter.researchMode, "production");
  assert.equal(config.adapter.accessKind, "official_free");
  assert.equal(config.adapter.sourceRole, "community_search");
  assert.equal(config.adapter.contentKind, "api_payload");
  assert.equal(config.adapter.query, "looking for contractor");
  assert.equal(config.adapter.requiresProductionReplacement, false);
});

test("parseApiChannelConfig marks research adapters as research-only by default", () => {
  const config = parseApiChannelConfig({
    adapter: {
      adapterKey: "peopleperhour_public_projects_research",
      sourceRole: "project_marketplace",
      accessKind: "github_unofficial_public",
    },
  });

  assert.equal(config.adapter.researchMode, "research_only");
  assert.equal(config.adapter.tosRisk, "high");
  assert.equal(config.adapter.requiresProductionReplacement, true);
});

test("parseApiChannelConfig accepts generic indirect search query metadata", () => {
  const config = parseApiChannelConfig({
    adapter: {
      adapterKey: "searxng_search",
      sourceRole: "indirect_aggregator",
      accessKind: "official_free",
      query: "site:example.com looking for developer",
      platform: "example.com",
      searchQuery: {
        query: "site:example.com looking for developer",
        platform: "example.com",
        siteFilter: "example.com",
        locale: "en-US",
        timeRange: "month",
        maxResults: 12,
        searchProvider: "searxng_search",
        directCoverage: false,
      },
    },
  });

  assert.equal(config.adapter.adapterKey, "searxng_search");
  assert.equal(config.adapter.sourceRole, "indirect_aggregator");
  assert.equal(config.adapter.searchQuery.query, "site:example.com looking for developer");
  assert.equal(config.adapter.searchQuery.siteFilter, "example.com");
  assert.equal(config.adapter.searchQuery.maxResults, 12);
  assert.equal(config.adapter.searchQuery.directCoverage, false);
});
