import assert from "node:assert/strict";
import test from "node:test";

import { createNewsPortalSdk } from "../../../packages/sdk/src/index.ts";

test("listFeedArticles sends pagination params and returns the paginated envelope", async () => {
  let requestedUrl = "";
  const expected = {
    items: [{ doc_id: "article-1" }],
    page: 2,
    pageSize: 50,
    total: 125,
    totalPages: 3,
    hasNext: true,
    hasPrev: true,
  };

  const sdk = createNewsPortalSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify(expected), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  });

  const response = await sdk.listFeedArticles<Record<string, unknown>>({
    page: 2,
    pageSize: 50,
  });

  assert.equal(requestedUrl, "http://api.example.test/feed?page=2&pageSize=50");
  assert.deepEqual(response, expected);
});

test("listFeedArticles omits empty pagination params", async () => {
  let requestedUrl = "";
  const sdk = createNewsPortalSdk({
    baseUrl: "http://api.example.test/",
    fetchImpl: (async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return new Response(
        JSON.stringify({
          items: [],
          page: 1,
          pageSize: 20,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      );
    }) as typeof fetch,
  });

  await sdk.listFeedArticles();

  assert.equal(requestedUrl, "http://api.example.test/feed");
});

test("listArticlesPage sends pagination params to the admin article list", async () => {
  let requestedUrl = "";
  const expected = {
    items: [],
    page: 3,
    pageSize: 10,
    total: 42,
    totalPages: 5,
    hasNext: true,
    hasPrev: true,
  };

  const sdk = createNewsPortalSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify(expected), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  });

  const response = await sdk.listArticlesPage<Record<string, unknown>>({
    page: 3,
    pageSize: 10,
  });

  assert.equal(requestedUrl, "http://api.example.test/articles?page=3&pageSize=10");
  assert.deepEqual(response, expected);
});

test("listFetchRunsPage preserves filters while sending pagination params", async () => {
  let requestedUrl = "";
  const sdk = createNewsPortalSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return new Response(
        JSON.stringify({
          items: [],
          page: 2,
          pageSize: 25,
          total: 60,
          totalPages: 3,
          hasNext: true,
          hasPrev: true,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      );
    }) as typeof fetch,
  });

  await sdk.listFetchRunsPage<Record<string, unknown>>({
    channelId: "channel-123",
    page: 2,
    pageSize: 25,
  });

  assert.equal(
    requestedUrl,
    "http://api.example.test/maintenance/fetch-runs?page=2&pageSize=25&channel_id=channel-123"
  );
});

test("listNotificationsPage targets the user-specific notification path", async () => {
  let requestedUrl = "";
  const sdk = createNewsPortalSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return new Response(
        JSON.stringify({
          items: [],
          page: 1,
          pageSize: 20,
          total: 0,
          totalPages: 0,
          hasNext: false,
          hasPrev: false,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      );
    }) as typeof fetch,
  });

  await sdk.listNotificationsPage<Record<string, unknown>>("user-42", { page: 1, pageSize: 20 });

  assert.equal(requestedUrl, "http://api.example.test/users/user-42/notifications?page=1&pageSize=20");
});

test("listClustersPage sends pagination params", async () => {
  let requestedUrl = "";
  const sdk = createNewsPortalSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return new Response(
        JSON.stringify({
          items: [],
          page: 1,
          pageSize: 12,
          total: 24,
          totalPages: 2,
          hasNext: true,
          hasPrev: false,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      );
    }) as typeof fetch,
  });

  await sdk.listClustersPage<Record<string, unknown>>({ page: 1, pageSize: 12 });

  assert.equal(requestedUrl, "http://api.example.test/clusters?page=1&pageSize=12");
});

test("listLlmTemplatesPage and listInterestTemplatesPage send independent pagination params", async () => {
  const requestedUrls: string[] = [];
  const sdk = createNewsPortalSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async (input: RequestInfo | URL) => {
      requestedUrls.push(String(input));
      return new Response(
        JSON.stringify({
          items: [],
          page: 2,
          pageSize: 8,
          total: 16,
          totalPages: 2,
          hasNext: false,
          hasPrev: true,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      );
    }) as typeof fetch,
  });

  await sdk.listLlmTemplatesPage<Record<string, unknown>>({ page: 2, pageSize: 8 });
  await sdk.listInterestTemplatesPage<Record<string, unknown>>({ page: 2, pageSize: 8 });

  assert.deepEqual(requestedUrls, [
    "http://api.example.test/templates/llm?page=2&pageSize=8",
    "http://api.example.test/templates/interests?page=2&pageSize=8",
  ]);
});

test("listInterestsPage targets the user-specific interests path", async () => {
  let requestedUrl = "";
  const sdk = createNewsPortalSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return new Response(
        JSON.stringify({
          items: [],
          page: 3,
          pageSize: 6,
          total: 18,
          totalPages: 3,
          hasNext: false,
          hasPrev: true,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      );
    }) as typeof fetch,
  });

  await sdk.listInterestsPage<Record<string, unknown>>("user-42", { page: 3, pageSize: 6 });

  assert.equal(requestedUrl, "http://api.example.test/users/user-42/interests?page=3&pageSize=6");
});
