import assert from "node:assert/strict";
import test from "node:test";

import { parseApiChannelConfig } from "../../../packages/contracts/src/source.ts";
import { fetchApiAdapterItems } from "../../../services/fetchers/src/api-adapter-registry.ts";
import type { SourceChannelRow } from "../../../services/fetchers/src/fetcher-persistence.ts";

function channel(fetchUrl: string): SourceChannelRow {
  return {
    channelId: "11111111-1111-4111-8111-111111111111",
    providerType: "api",
    name: "Adapter channel",
    fetchUrl,
    configJson: {},
    authConfigJson: null,
    language: "en",
    pollIntervalSeconds: 300,
    lastFetchAt: null,
    adaptiveEnabled: true,
    effectivePollIntervalSeconds: 300,
    maxPollIntervalSeconds: 3600,
    nextDueAt: null,
    adaptiveStep: 0,
    lastResultKind: null,
    consecutiveNoChangePolls: 0,
    consecutiveFailures: 0,
    adaptiveReason: null,
  };
}

test("HN Algolia adapter normalizes search hits to acquisition items", async () => {
  const apiConfig = parseApiChannelConfig({
    api: {
      adapterKey: "hn_algolia_search",
      sourceRole: "community_search",
      accessKind: "official_free",
      tosRisk: "low",
    },
  });
  const items = await fetchApiAdapterItems("hn_algolia_search", {
    channel: channel("https://hn.algolia.com/api/v1/search_by_date?query=contractor"),
    apiConfig,
    fetchedAt: "2026-05-11T10:00:00.000Z",
    fetchJson: async () => ({
      hits: [
        {
          objectID: "42",
          title: "Ask HN: Looking for a contractor to build an integration",
          url: "https://news.ycombinator.com/item?id=42",
          created_at: "2026-05-10T08:00:00.000Z",
          author: "buyer",
        },
      ],
    }),
    fetchText: async () => ({ text: "", finalUrl: "", status: 200 }),
  });

  assert.equal(items.length, 1);
  assert.equal(items[0]?.externalArticleId, "hn_algolia_search:42");
  assert.equal(items[0]?.rawPayload.fetcher, "api_adapter");
  assert.equal(items[0]?.rawPayload.sourceRole, "community_search");
});

test("Stack Exchange adapter converts epoch creation dates", async () => {
  const apiConfig = parseApiChannelConfig({
    api: {
      adapterKey: "stack_exchange_search",
      sourceRole: "community_search",
      accessKind: "official_free",
    },
  });
  const items = await fetchApiAdapterItems("stack_exchange_search", {
    channel: channel("https://api.stackexchange.com/2.3/search/advanced?site=stackoverflow&q=paid"),
    apiConfig,
    fetchedAt: "2026-05-11T10:00:00.000Z",
    fetchJson: async () => ({
      items: [
        {
          question_id: 7,
          title: "Paid help for migration issue",
          link: "https://stackoverflow.com/questions/7/example",
          creation_date: 1778493600,
          tags: ["migration", "api"],
        },
      ],
    }),
    fetchText: async () => ({ text: "", finalUrl: "", status: 200 }),
  });

  assert.equal(items.length, 1);
  assert.equal(items[0]?.publishedAt, "2026-05-11T10:00:00.000Z");
  assert.match(items[0]?.lead ?? "", /migration/);
});

test("GitHub issues adapter normalizes public issue search results", async () => {
  const apiConfig = parseApiChannelConfig({
    api: {
      adapterKey: "github_issues_search",
      sourceRole: "community_search",
      accessKind: "official_free",
    },
  });
  const items = await fetchApiAdapterItems("github_issues_search", {
    channel: channel("https://api.github.com/search/issues?q=%22willing%20to%20pay%22"),
    apiConfig,
    fetchedAt: "2026-05-11T10:00:00.000Z",
    fetchJson: async () => ({
      items: [
        {
          id: 99,
          title: "Willing to pay for migration support",
          html_url: "https://github.com/acme/project/issues/99",
          created_at: "2026-05-09T12:00:00.000Z",
          body: "We need someone to help migrate this integration.",
          user: { login: "buyer-org" },
          labels: [{ name: "help wanted" }],
        },
      ],
    }),
    fetchText: async () => ({ text: "", finalUrl: "", status: 200 }),
  });

  assert.equal(items.length, 1);
  assert.equal(items[0]?.externalArticleId, "github_issues_search:99");
  assert.equal(items[0]?.rawPayload.adapterKey, "github_issues_search");
  assert.match(items[0]?.body ?? "", /migrate/);
});

test("research marketplace adapter extracts public project links with risk metadata", async () => {
  const apiConfig = parseApiChannelConfig({
    adapter: {
      adapterKey: "peopleperhour_public_projects_research",
      sourceRole: "project_marketplace",
      accessKind: "github_unofficial_public",
    },
  });
  const items = await fetchApiAdapterItems("peopleperhour_public_projects_research", {
    channel: channel("https://www.peopleperhour.com/freelance-jobs"),
    apiConfig,
    fetchedAt: "2026-05-11T10:00:00.000Z",
    fetchJson: async () => ({}),
    fetchText: async () => ({
      finalUrl: "https://www.peopleperhour.com/freelance-jobs",
      status: 200,
      text: `
        <section>
          <a href="/freelance-jobs/technology-programming/build-custom-crm-integration-123">
            Build custom CRM integration for a small business
          </a>
          <span>Budget $12,000</span>
        </section>
      `,
    }),
  });

  assert.equal(items.length, 1);
  assert.equal(items[0]?.rawPayload.researchMode, "research_only");
  assert.equal(items[0]?.rawPayload.requiresProductionReplacement, true);
  assert.match(items[0]?.lead ?? "", /\$12,000/);
  assert.equal(items[0]?.rawPayload.extractionKind, "project_detail");
  assert.equal(items[0]?.rawPayload.detailFetchAttempted, false);
  assert.equal(typeof items[0]?.rawPayload.projectDetailConfidence, "number");
});

test("research marketplace adapter rejects category and navigation links", async () => {
  const apiConfig = parseApiChannelConfig({
    adapter: {
      adapterKey: "freelancer_public_projects_research",
      sourceRole: "project_marketplace",
      accessKind: "github_unofficial_public",
    },
  });
  const items = await fetchApiAdapterItems("freelancer_public_projects_research", {
    channel: channel("https://www.freelancer.com/jobs"),
    apiConfig,
    fetchedAt: "2026-05-11T10:00:00.000Z",
    fetchJson: async () => ({}),
    fetchText: async () => ({
      finalUrl: "https://www.freelancer.com/jobs",
      status: 200,
      text: `
        <nav><a href="/freelancers">Freelancers</a></nav>
        <a href="/categories/technology">Technology & Programming</a>
        <a href="https://www.peopleperhour.com/freelance-jobs/technology-programming/erp-crm-development">
          ERP/CRM Development
        </a>
        <a href="/projects/shopify-pos-custom-app-987654">
          Need Shopify POS custom app developer, budget $8,000
        </a>
      `,
    }),
  });

  assert.equal(items.length, 1);
  assert.match(items[0]?.title ?? "", /Shopify POS/);
});

test("SearXNG search adapter normalizes indirect aggregator results", async () => {
  const apiConfig = parseApiChannelConfig({
    adapter: {
      adapterKey: "searxng_search",
      sourceRole: "indirect_aggregator",
      accessKind: "official_free",
      searchQuery: {
        query: "site:upwork.com MVP budget",
        platform: "upwork.com",
        searchProvider: "searxng_search",
        directCoverage: false,
      },
    },
  });
  const items = await fetchApiAdapterItems("searxng_search", {
    channel: channel("https://searx.example/search?q=site%3Aupwork.com+MVP&format=json"),
    apiConfig,
    fetchedAt: "2026-05-11T10:00:00.000Z",
    fetchJson: async () => ({
      results: [
        {
          title: "Looking for developer to build MVP",
          url: "https://www.upwork.com/jobs/example",
          content: "Client has budget and needs an MVP developer.",
          engine: "brave",
        },
      ],
    }),
    fetchText: async () => ({ text: "", finalUrl: "", status: 200 }),
  });

  assert.equal(items.length, 1);
  assert.equal(items[0]?.rawPayload.sourceRole, "indirect_aggregator");
  assert.equal(items[0]?.rawPayload.directCoverage, false);
  assert.equal(items[0]?.rawPayload.resultRank, 1);
  assert.equal((items[0]?.rawPayload.searchQuery as Record<string, unknown>)?.platform, "upwork.com");
});

test("DDGS search adapter normalizes internal bridge results", async () => {
  const apiConfig = parseApiChannelConfig({
    adapter: {
      adapterKey: "ddgs_search",
      sourceRole: "indirect_aggregator",
      accessKind: "github_unofficial_public",
      researchMode: "research_only",
      searchQuery: {
        query: "site:upwork.com MVP budget",
        platform: "upwork.com",
        searchProvider: "ddgs_search",
        directCoverage: false,
      },
    },
  });
  const items = await fetchApiAdapterItems("ddgs_search", {
    channel: channel("http://api:8000/maintenance/discovery/search/ddgs?q=site%3Aupwork.com+MVP"),
    apiConfig,
    fetchedAt: "2026-05-11T10:00:00.000Z",
    fetchJson: async () => ({
      results: [
        {
          title: "Looking for developer to build MVP",
          url: "https://www.upwork.com/jobs/example",
          snippet: "Client has budget and needs an MVP developer.",
          provider_rank: 1,
        },
      ],
      meta: { provider: "ddgs", backend: "auto" },
    }),
    fetchText: async () => ({ text: "", finalUrl: "", status: 200 }),
  });

  assert.equal(items.length, 1);
  assert.equal(items[0]?.rawPayload.adapterKey, "ddgs_search");
  assert.equal(items[0]?.rawPayload.directCoverage, false);
  assert.equal(items[0]?.rawPayload.resultRank, 1);
  assert.equal((items[0]?.rawPayload.searchQuery as Record<string, unknown>)?.searchProvider, "ddgs_search");
});

test("search adapters drop ad-click result URLs before ingestion", async () => {
  const apiConfig = parseApiChannelConfig({
    adapter: {
      adapterKey: "ddgs_search",
      sourceRole: "indirect_aggregator",
      accessKind: "github_unofficial_public",
      researchMode: "research_only",
      searchQuery: {
        query: "site:example.com developer",
        searchProvider: "ddgs_search",
        directCoverage: false,
      },
    },
  });
  const items = await fetchApiAdapterItems("ddgs_search", {
    channel: channel("http://api:8000/maintenance/discovery/search/ddgs"),
    apiConfig,
    fetchedAt: "2026-05-11T10:00:00.000Z",
    fetchJson: async () => ({
      results: [
        {
          title: "Developer services - Contact Us",
          url: "https://www.bing.com/aclick?u=https%3A%2F%2Fvendor.example%2Fservices",
          snippet: "Vendor landing page.",
        },
        {
          title: "Need API integration developer",
          url: "https://example.com/projects/api-integration-123",
          snippet: "Budget $10,000.",
        },
      ],
    }),
    fetchText: async () => ({ text: "", finalUrl: "", status: 200 }),
  });

  assert.equal(items.length, 1);
  assert.match(items[0]?.title ?? "", /Need API/);
});

test("Brave, Tavily, Exa, and SerpAPI search adapters normalize fixture responses", async () => {
  const cases = [
    {
      key: "brave_search" as const,
      payload: { web: { results: [{ title: "Need CRM integration", url: "https://example.com/a", description: "Buyer asks for API help" }] } },
    },
    {
      key: "tavily_search" as const,
      payload: { results: [{ title: "Need ERP migration", url: "https://example.com/b", content: "Budget available" }] },
    },
    {
      key: "exa_search" as const,
      payload: { results: [{ id: "c", title: "Need Shopify custom app", url: "https://example.com/c", text: "Looking for developer" }] },
    },
    {
      key: "serpapi_google_news_research" as const,
      payload: { news_results: [{ title: "Need software partner", link: "https://example.com/d", snippet: "Public ask" }] },
    },
  ];

  for (const entry of cases) {
    const apiConfig = parseApiChannelConfig({
      adapter: {
        adapterKey: entry.key,
        sourceRole: "indirect_aggregator",
        accessKind: entry.key === "serpapi_google_news_research" ? "official_paid" : "official_free_key",
        researchMode: entry.key === "serpapi_google_news_research" ? "research_only" : "production",
        searchQuery: { query: "need developer", searchProvider: entry.key, directCoverage: false },
      },
    });
    const items = await fetchApiAdapterItems(entry.key, {
      channel: channel("https://search.example/api"),
      apiConfig,
      fetchedAt: "2026-05-11T10:00:00.000Z",
      fetchJson: async () => entry.payload,
      fetchText: async () => ({ text: "", finalUrl: "", status: 200 }),
    });

    assert.equal(items.length, 1);
    assert.equal(items[0]?.rawPayload.adapterKey, entry.key);
    assert.equal(items[0]?.rawPayload.directCoverage, false);
  }
});

test("Discourse search adapter normalizes forum-support topics", async () => {
  const apiConfig = parseApiChannelConfig({
    adapter: {
      adapterKey: "discourse_search",
      sourceRole: "forum_support",
      accessKind: "official_free",
      searchQuery: { query: "custom integration", searchProvider: "discourse_search", directCoverage: false },
    },
  });
  const items = await fetchApiAdapterItems("discourse_search", {
    channel: channel("https://forum.example/search.json?q=custom%20integration"),
    apiConfig,
    fetchedAt: "2026-05-11T10:00:00.000Z",
    fetchJson: async () => ({
      topics: [
        {
          id: 123,
          slug: "custom-integration-help",
          title: "Looking for help with custom integration",
          created_at: "2026-05-10T10:00:00.000Z",
          excerpt: "We need a developer to connect our CRM.",
          posts_count: 3,
        },
      ],
    }),
    fetchText: async () => ({ text: "", finalUrl: "", status: 200 }),
  });

  assert.equal(items.length, 1);
  assert.equal(items[0]?.rawPayload.sourceRole, "forum_support");
  assert.match(items[0]?.url ?? "", /custom-integration-help/);
});
