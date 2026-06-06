import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultIngressAdapterKeyForProvider,
  ingressAdapterKeyToLegacyApiAdapterKey,
  ingressAdapterKeyToLegacyRssStrategy,
  legacyApiAdapterKeyToIngressAdapterKey,
  legacyRssStrategyToIngressAdapterKey,
} from "../../../packages/contracts/src/ingress-adapters";
import { parseApiChannelConfig } from "../../../packages/contracts/src/source";
import {
  applyResolvedIngressAdapterToChannel,
  buildIngressAdapterProviderMetrics,
  resolveIngressAdapterForChannel,
  type ResolvedIngressAdapter,
} from "../../../services/fetchers/src/ingress-adapters/resolver";
import { dryRunIngressAdapter } from "../../../services/fetchers/src/ingress-adapters/dry-run";
import type { SourceChannelRow } from "../../../services/fetchers/src/fetcher-persistence";

function channel(overrides: Partial<SourceChannelRow>): SourceChannelRow {
  return {
    channelId: "channel-1",
    providerType: "rss",
    name: "Example",
    fetchUrl: "https://example.com/feed.xml",
    configJson: {},
    authConfigJson: {},
    language: "en",
    pollIntervalSeconds: 300,
    lastFetchAt: null,
    adaptiveEnabled: true,
    effectivePollIntervalSeconds: 300,
    maxPollIntervalSeconds: 4800,
    nextDueAt: null,
    adaptiveStep: 0,
    lastResultKind: null,
    consecutiveNoChangePolls: 0,
    consecutiveFailures: 0,
    adaptiveReason: null,
    ...overrides,
  };
}

async function withAcquisitionAllowlist<T>(value: string, run: () => Promise<T>): Promise<T> {
  const previousAllowlist = process.env.FETCHERS_ACQUISITION_PRIVATE_HOST_ALLOWLIST;
  process.env.FETCHERS_ACQUISITION_PRIVATE_HOST_ALLOWLIST = value;
  try {
    return await run();
  } finally {
    if (previousAllowlist == null) {
      delete process.env.FETCHERS_ACQUISITION_PRIVATE_HOST_ALLOWLIST;
    } else {
      process.env.FETCHERS_ACQUISITION_PRIVATE_HOST_ALLOWLIST = previousAllowlist;
    }
  }
}

async function withMockFetch<T>(mockFetch: typeof globalThis.fetch, run: () => Promise<T>): Promise<T> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockFetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function fetchInputUrl(input: Parameters<typeof fetch>[0]): URL {
  return new URL(input instanceof Request ? input.url : String(input));
}

function fetchInputMethod(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): string {
  return String(init?.method ?? (input instanceof Request ? input.method : "GET"));
}

async function fetchInputBody(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<string> {
  if (typeof init?.body === "string") {
    return init.body;
  }
  if (input instanceof Request) {
    return await input.text();
  }
  return "";
}

test("legacy RSS strategies map to canonical ingress adapter keys", () => {
  assert.equal(legacyRssStrategyToIngressAdapterKey("generic"), "rss.generic");
  assert.equal(legacyRssStrategyToIngressAdapterKey("google_news_rss"), "rss.google_news_rss");
  assert.equal(ingressAdapterKeyToLegacyRssStrategy("rss.hn_comments_feed"), "hn_comments_feed");
  assert.equal(ingressAdapterKeyToLegacyRssStrategy("api.hn_algolia_search"), null);
});

test("legacy API adapter keys map to canonical ingress adapter keys", () => {
  assert.equal(legacyApiAdapterKeyToIngressAdapterKey("hn_algolia_search"), "api.hn_algolia_search");
  assert.equal(legacyApiAdapterKeyToIngressAdapterKey("unknown"), null);
  assert.equal(ingressAdapterKeyToLegacyApiAdapterKey("api.ddgs_search"), "ddgs_search");
  assert.equal(ingressAdapterKeyToLegacyApiAdapterKey("rss.generic"), null);
});

test("provider defaults preserve provider ownership", () => {
  assert.equal(defaultIngressAdapterKeyForProvider("rss"), "rss.generic");
  assert.equal(defaultIngressAdapterKeyForProvider("website"), "website.generic_discovery");
  assert.equal(defaultIngressAdapterKeyForProvider("api"), "api.generic_json_mapping");
  assert.equal(defaultIngressAdapterKeyForProvider("email_imap"), "email_imap.generic_mailbox");
  assert.equal(defaultIngressAdapterKeyForProvider("youtube"), null);
});

test("declarative API config accepts bounded v2 recipe fields", () => {
  const config = parseApiChannelConfig({
    requestMethod: "POST",
    requestBodyJson: { query: "out" + "sourcing" },
    responseFormat: "ndjson",
    pagination: { mode: "cursor", cursorParam: "after", cursorPath: "paging.next", maxPagesPerPoll: 2 },
    titleField: ["headline", "title"],
    urlField: ["link", "url"],
  });
  assert.equal(config.requestMethod, "POST");
  assert.deepEqual(config.requestBodyJson, { query: "out" + "sourcing" });
  assert.equal(config.responseFormat, "ndjson");
  assert.equal(config.pagination.mode, "cursor");
  assert.equal(config.pagination.cursorParam, "after");
  assert.deepEqual(config.titleField, ["headline", "title"]);
  assert.deepEqual(config.urlField, ["link", "url"]);
});

test("RSS resolver ignores legacy URL inference when no binding exists", async () => {
  const pool = {
    query: async () => ({ rows: [] }),
  };
  const resolved = await resolveIngressAdapterForChannel(
    pool as never,
    channel({
      providerType: "rss",
      fetchUrl: "https://news.google.com/rss/search?q=public%20updates",
      configJson: {},
    })
  );
  assert.equal(resolved?.source, "provider_default");
  assert.equal(resolved?.adapterKey, "rss.generic");
  assert.equal(resolved?.selectionMode, "provider_default");
});

test("active binding wins over legacy config", async () => {
  const pool = {
    query: async () => ({
      rows: [
        {
          adapter_key: "rss.generic",
          runtime_kind: "builtin",
          provider_type: "rss",
          output_mode: "signal_candidates",
          selection_mode: "manual",
          config_json: { maxEntryAgeHours: 12 },
        },
      ],
    }),
  };
  const resolved = await resolveIngressAdapterForChannel(
    pool as never,
    channel({
      providerType: "rss",
      fetchUrl: "https://news.google.com/rss/search?q=public%20updates",
      configJson: { adapterStrategy: "google_news_rss" },
    })
  );
  assert.equal(resolved?.source, "binding");
  assert.equal(resolved?.adapterKey, "rss.generic");
  assert.deepEqual(resolved?.bindingConfigJson, { maxEntryAgeHours: 12 });
});

test("disabled or inactive binding rows fall through to provider default instead of legacy API config", async () => {
  const pool = {
    query: async () => ({ rows: [] }),
  };
  const resolved = await resolveIngressAdapterForChannel(
    pool as never,
    channel({
      providerType: "api",
      fetchUrl: "https://example.com/items.json",
      configJson: { adapterKey: "hn_algolia_search" },
    })
  );
  assert.equal(resolved?.source, "provider_default");
  assert.equal(resolved?.adapterKey, "api.generic_json_mapping");
});

test("provider default fallback covers channels without binding or legacy adapter", async () => {
  const pool = {
    query: async () => ({ rows: [] }),
  };
  const resolved = await resolveIngressAdapterForChannel(
    pool as never,
    channel({
      providerType: "website",
      fetchUrl: "https://example.com/",
      configJson: {},
    })
  );
  assert.equal(resolved?.source, "provider_default");
  assert.equal(resolved?.adapterKey, "website.generic_discovery");
});

test("resolved RSS binding only applies binding config and does not rehydrate legacy strategy", () => {
  const resolved: ResolvedIngressAdapter = {
    source: "binding",
    adapterKey: "rss.google_news_rss",
    runtimeKind: "builtin",
    providerType: "rss",
    outputMode: "signal_candidates",
    selectionMode: "migration",
    bindingConfigJson: { maxEntryAgeHours: 24 },
    catalogRecipeJson: {},
  };
  const updated = applyResolvedIngressAdapterToChannel(
    channel({ providerType: "rss", configJson: { adapterStrategy: "generic" } }),
    resolved
  );
  assert.deepEqual(updated.configJson, {
    adapterStrategy: "generic",
    maxEntryAgeHours: 24,
  });
});

test("resolved API binding only applies binding config and does not rehydrate legacy adapterKey", () => {
  const resolved: ResolvedIngressAdapter = {
    source: "binding",
    adapterKey: "api.hn_algolia_search",
    runtimeKind: "builtin",
    providerType: "api",
    outputMode: "signal_candidates",
    selectionMode: "manual",
    bindingConfigJson: { query: "out" + "sourcing" },
    catalogRecipeJson: {},
  };
  const updated = applyResolvedIngressAdapterToChannel(
    channel({ providerType: "api", configJson: { itemsPath: "items" } }),
    resolved
  );
  assert.deepEqual(updated.configJson, {
    itemsPath: "items",
    query: "out" + "sourcing",
  });
});

test("adapter metrics payload is stable for fetch runs", () => {
  const metrics = buildIngressAdapterProviderMetrics({
    source: "binding",
    adapterKey: "website.generic_discovery",
    runtimeKind: "builtin",
    providerType: "website",
    outputMode: "web_resources",
    selectionMode: "migration",
    bindingConfigJson: {},
    catalogRecipeJson: {},
  });
  assert.deepEqual(metrics, {
    adapterKey: "website.generic_discovery",
    adapterRuntimeKind: "builtin",
    adapterSelectionMode: "migration",
    adapterResolutionSource: "binding",
  });
});

test("declarative JSON dry-run maps GET pages with static non-secret headers", async () => {
  const requests: string[] = [];
  const port = 18081;

  await withAcquisitionAllowlist(`127.0.0.1:${port}`, async () => withMockFetch(async (input, init) => {
    const url = fetchInputUrl(input);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    requests.push(`${url.pathname}${url.search}:${headers.get("x-preview") ?? ""}`);
    const page = Number(url.searchParams.get("page") ?? "1");
    const items = page === 1
      ? [
          { id: "1", title: "One", url: "/one", publishedAt: "2026-05-15T00:00:00Z" },
          { id: "2", title: "Two", url: "/two", publishedAt: "2026-05-15T00:00:00Z" },
        ]
      : [
          { id: "3", title: "Three", url: "/three", publishedAt: "2026-05-15T00:00:00Z" },
          { id: "4", title: "Four", url: "/four", publishedAt: "2026-05-15T00:00:00Z" },
        ];
    return new Response(JSON.stringify({ data: { items } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }, async () => {
    const result = await dryRunIngressAdapter({
      adapterKey: "api.generic_json_mapping",
      providerType: "api",
      fetchUrl: `http://127.0.0.1:${port}/items`,
      limit: 3,
      config: {
        requestHeaders: { "x-preview": "1" },
        itemsPath: "data.items",
        titleField: "title",
        urlField: "url",
        externalIdField: "id",
        publishedAtField: "publishedAt",
        pagination: { mode: "page", pageParam: "page", pageStart: 1, maxPagesPerPoll: 2 },
      },
    });
    assert.equal(result.status, "ok");
    assert.equal(Array.isArray(result.itemsPreview) ? result.itemsPreview.length : 0, 3);
    assert.deepEqual(requests, ["/items?page=1:1", "/items?page=2:1"]);
  }));
});

test("declarative JSON dry-run supports POST NDJSON and fallback field paths", async () => {
  const requests: Array<{ url: string; method: string; body: string }> = [];
  const port = 18082;

  await withAcquisitionAllowlist(`127.0.0.1:${port}`, async () => withMockFetch(async (input, init) => {
    const url = fetchInputUrl(input);
    requests.push({
      url: `${url.pathname}${url.search}`,
      method: fetchInputMethod(input, init),
      body: await fetchInputBody(input, init),
    });
    return new Response([
      JSON.stringify({ id: "1", headline: "One", link: "/one" }),
      JSON.stringify({ id: "2", title: "Two", url: "/two" }),
    ].join("\n"), {
      status: 200,
      headers: { "content-type": "application/x-ndjson" },
    });
  }, async () => {
    const result = await dryRunIngressAdapter({
      adapterKey: "api.generic_json_mapping",
      providerType: "api",
      fetchUrl: `http://127.0.0.1:${port}/items`,
      limit: 2,
      config: {
        requestMethod: "POST",
        requestBodyJson: { query: "out" + "sourcing" },
        responseFormat: "ndjson",
        pagination: { mode: "none" },
        titleField: ["headline", "title"],
        urlField: ["link", "url"],
        externalIdField: "id",
      },
    });
    assert.equal(result.status, "ok");
    assert.deepEqual(
      (result.itemsPreview as Array<Record<string, unknown>>).map((item) => item.title),
      ["One", "Two"]
    );
    assert.deepEqual(requests.map((request) => `${request.method} ${request.url}`), ["POST /items"]);
    assert(requests.every((request) => request.body === JSON.stringify({ query: "out" + "sourcing" })));
  }));
});

test("declarative JSON dry-run supports URL templates from record fields", async () => {
  const port = 18086;

  await withAcquisitionAllowlist(`127.0.0.1:${port}`, async () => withMockFetch(async () => {
    return new Response(JSON.stringify({
      procnotices: [
        {
          id: "OP00316630",
          bid_description: "Accounting Software",
          notice_text: "Buyer notice text",
          noticedate: "18-Oct-2024",
        },
      ],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }, async () => {
    const result = await dryRunIngressAdapter({
      adapterKey: "api.worldbank_procurement_notices",
      providerType: "api",
      fetchUrl: `http://127.0.0.1:${port}/procnotices`,
      limit: 1,
      config: {
        itemsPath: "procnotices",
        titleField: "bid_description",
        bodyField: "notice_text",
        urlTemplate: "https://projects.worldbank.org/en/projects-operations/procurement-detail/{id}",
        externalIdField: "id",
        publishedAtField: "noticedate",
        pagination: { mode: "none" },
      },
    });
    assert.equal(result.status, "ok");
    assert.equal(
      (result.itemsPreview as Array<Record<string, unknown>>)[0]?.url,
      "https://projects.worldbank.org/en/projects-operations/procurement-detail/OP00316630"
    );
  }));
});

test("declarative JSON dry-run supports numeric array field paths", async () => {
  const port = 18087;

  await withAcquisitionAllowlist(`127.0.0.1:${port}`, async () => withMockFetch(async () => {
    return new Response(JSON.stringify({
      releases: [
        {
          ocid: "ocds-123",
          tender: {
            title: "Case management platform",
            documents: [{ url: "/docs/rfp.pdf" }],
          },
          awards: [{ suppliers: [{ name: "Supplier A" }] }],
        },
      ],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }, async () => {
    const result = await dryRunIngressAdapter({
      adapterKey: "api.generic_json_mapping",
      providerType: "api",
      fetchUrl: `http://127.0.0.1:${port}/releases`,
      limit: 1,
      config: {
        itemsPath: "releases",
        titleField: "awards.0.suppliers.0.name",
        bodyField: "tender.title",
        urlField: "tender.documents.0.url",
        externalIdField: "ocid",
        pagination: { mode: "none" },
      },
    });
    assert.equal(result.status, "ok");
    const item = (result.itemsPreview as Array<Record<string, unknown>>)[0];
    assert.equal(item?.url, `http://127.0.0.1:${port}/docs/rfp.pdf`);
    assert.equal(item?.title, "Supplier A");
  }));
});

test("declarative JSON dry-run supports cursor pagination", async () => {
  const requests: string[] = [];
  const port = 18083;

  await withAcquisitionAllowlist(`127.0.0.1:${port}`, async () => withMockFetch(async (input) => {
    const url = fetchInputUrl(input);
    requests.push(`${url.pathname}${url.search}`);
    const cursor = url.searchParams.get("after");
    if (!cursor) {
      return new Response(JSON.stringify({ items: [{ id: "1", title: "One", url: "/one" }], paging: { next: "cursor-2" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ items: [{ id: "2", title: "Two", url: "/two" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }, async () => {
    const result = await dryRunIngressAdapter({
      adapterKey: "api.generic_json_mapping",
      providerType: "api",
      fetchUrl: `http://127.0.0.1:${port}/items`,
      limit: 2,
      config: {
        pagination: { mode: "cursor", cursorParam: "after", cursorPath: "paging.next", maxPagesPerPoll: 2 },
      },
    });
    assert.equal(result.status, "ok");
    assert.deepEqual(
      (result.itemsPreview as Array<Record<string, unknown>>).map((item) => item.title),
      ["One", "Two"]
    );
    assert.deepEqual(requests, ["/items", "/items?after=cursor-2"]);
  }));
});

test("declarative JSON dry-run rejects unsafe methods and secret-bearing config", async () => {
  const methodResult = await dryRunIngressAdapter({
    adapterKey: "api.generic_json_mapping",
    providerType: "api",
    fetchUrl: "https://example.com/items.json",
    config: { requestMethod: "PUT" },
  });
  assert.equal(methodResult.status, "failed");

  const secretResult = await dryRunIngressAdapter({
    adapterKey: "api.generic_json_mapping",
    providerType: "api",
    fetchUrl: "https://example.com/items.json",
    config: { apiToken: "secret" },
  });
  assert.equal(secretResult.status, "failed");
});
