import assert from "node:assert/strict";
import test from "node:test";

import { createNewsPortalSdk } from "../../../packages/sdk/src/index.ts";

test("listSystemSelectedContentItems sends pagination, sort, and search params", async () => {
  let requestedUrl = "";
  const expected = {
    items: [{ content_item_id: "editorial:article-1" }],
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

  const response = await sdk.listSystemSelectedContentItems<Record<string, unknown>>({
    page: 2,
    pageSize: 50,
    sort: "title_asc",
    q: "AI policy",
  });

  assert.equal(
    requestedUrl,
    "http://api.example.test/collections/system-selected?page=2&pageSize=50&sort=title_asc&q=AI+policy"
  );
  assert.deepEqual(response, expected);
});

test("listSystemSelectedContentItems omits empty pagination params and blank search", async () => {
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

  await sdk.listSystemSelectedContentItems({ q: "   " });

  assert.equal(requestedUrl, "http://api.example.test/collections/system-selected");
});

test("listMatchesPage sends pagination, sort, and search params", async () => {
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

  await sdk.listMatchesPage<Record<string, unknown>>("user-42", {
    page: 3,
    pageSize: 10,
    sort: "title_desc",
    q: "robotics",
  });

  assert.equal(
    requestedUrl,
    "http://api.example.test/users/user-42/matches?page=3&pageSize=10&sort=title_desc&q=robotics"
  );
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

  assert.equal(requestedUrl, "http://api.example.test/maintenance/articles?page=3&pageSize=10");
  assert.deepEqual(response, expected);
});

test("listContentItemsPage preserves search and sort params", async () => {
  let requestedUrl = "";
  const sdk = createNewsPortalSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return new Response(
        JSON.stringify({
          items: [],
          page: 2,
          pageSize: 5,
          total: 8,
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

  await sdk.listContentItemsPage<Record<string, unknown>>({
    page: 2,
    pageSize: 5,
    sort: "title_desc",
    q: "agent hints",
  });

  assert.equal(
    requestedUrl,
    "http://api.example.test/content-items?page=2&pageSize=5&sort=title_desc&q=agent+hints"
  );
});

test("article residual endpoints preserve filters and pagination params", async () => {
  const requestedUrls = [];
  const sdk = createNewsPortalSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async (input: RequestInfo | URL) => {
      requestedUrls.push(String(input));
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

  await sdk.listArticleResidualsPage<Record<string, unknown>>({
    page: 3,
    pageSize: 15,
    downstreamLossBucket: "semantic_rejected",
    selectionBlockerStage: "semantic_filter",
    selectionBlockerReason: "semantic_no_match",
    selectionMode: "rejected",
    verificationState: "weak",
    processingState: "processed",
    observationState: "canonicalized",
    duplicateKind: "canonical",
    q: "climate",
  });
  await sdk.getArticleResidualSummary<Record<string, unknown>>({
    downstreamLossBucket: "gray_zone_hold",
    selectionMode: "hold",
    q: "operators",
  });

  assert.equal(
    requestedUrls[0],
    "http://api.example.test/maintenance/articles/residuals?page=3&pageSize=15&downstreamLossBucket=semantic_rejected&selectionBlockerStage=semantic_filter&selectionBlockerReason=semantic_no_match&selectionMode=rejected&verificationState=weak&processingState=processed&observationState=canonicalized&duplicateKind=canonical&q=climate"
  );
  assert.equal(
    requestedUrls[1],
    "http://api.example.test/maintenance/articles/residuals/summary?downstreamLossBucket=gray_zone_hold&selectionMode=hold&q=operators"
  );
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

test("listWebResourcesPage preserves website filters while sending pagination params", async () => {
  let requestedUrl = "";
  const sdk = createNewsPortalSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return new Response(
        JSON.stringify({
          items: [],
          page: 2,
          pageSize: 15,
          total: 31,
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

  await sdk.listWebResourcesPage<Record<string, unknown>>({
    channelId: "channel-9",
    extractionState: "skipped",
    projection: "resource_only",
    resourceKind: "entity",
    page: 2,
    pageSize: 15,
  });

  assert.equal(
    requestedUrl,
    "http://api.example.test/maintenance/web-resources?page=2&pageSize=15&channelId=channel-9&extractionState=skipped&projection=resource_only&resourceKind=entity"
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

test("retryArticleEnrichment posts to the dedicated maintenance route", async () => {
  let requestedUrl = "";
  let requestedMethod = "";
  let requestedBody = "";
  const sdk = createNewsPortalSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
      requestedUrl = String(input);
      requestedMethod = String(init?.method ?? "GET");
      requestedBody = String(init?.body ?? "");
      return new Response(
        JSON.stringify({
          run_id: "run-1",
          status: "pending",
        }),
        {
          status: 202,
          headers: { "content-type": "application/json" },
        }
      );
    }) as typeof fetch,
  });

  await sdk.retryArticleEnrichment<Record<string, unknown>>("doc-99", {
    requestedBy: "admin-1",
  });

  assert.equal(
    requestedUrl,
    "http://api.example.test/maintenance/articles/doc-99/enrichment/retry"
  );
  assert.equal(requestedMethod, "POST");
  assert.match(requestedBody, /"requestedBy":"admin-1"/);
});

test("listSequencesPage sends pagination params to sequence maintenance", async () => {
  let requestedUrl = "";
  const sdk = createNewsPortalSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return new Response(
        JSON.stringify({
          items: [],
          page: 2,
          pageSize: 5,
          total: 9,
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

  await sdk.listSequencesPage<Record<string, unknown>>({ page: 2, pageSize: 5 });

  assert.equal(requestedUrl, "http://api.example.test/maintenance/sequences?page=2&pageSize=5");
});

test("requestSequenceRun posts to the sequence run route", async () => {
  let requestedUrl = "";
  let requestedMethod = "";
  let requestedBody = "";
  const sdk = createNewsPortalSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
      requestedUrl = String(input);
      requestedMethod = String(init?.method ?? "GET");
      requestedBody = String(init?.body ?? "");
      return new Response(
        JSON.stringify({
          run_id: "run-sequence-1",
          status: "pending",
        }),
        {
          status: 202,
          headers: { "content-type": "application/json" },
        }
      );
    }) as typeof fetch,
  });

  await sdk.requestSequenceRun<Record<string, unknown>>("sequence-7", {
    requestedBy: "admin-1",
    contextJson: { manual: true },
  });

  assert.equal(
    requestedUrl,
    "http://api.example.test/maintenance/sequences/sequence-7/runs"
  );
  assert.equal(requestedMethod, "POST");
  assert.match(requestedBody, /"requestedBy":"admin-1"/);
  assert.match(requestedBody, /"manual":true/);
});

test("cancelSequenceRun posts cancel reason to the dedicated route", async () => {
  let requestedUrl = "";
  let requestedMethod = "";
  let requestedBody = "";
  const sdk = createNewsPortalSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
      requestedUrl = String(input);
      requestedMethod = String(init?.method ?? "GET");
      requestedBody = String(init?.body ?? "");
      return new Response(
        JSON.stringify({
          run_id: "run-1",
          status: "cancelled",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      );
    }) as typeof fetch,
  });

  await sdk.cancelSequenceRun<Record<string, unknown>>("run-1", {
    reason: "Operator requested stop.",
  });

  assert.equal(
    requestedUrl,
    "http://api.example.test/maintenance/sequence-runs/run-1/cancel"
  );
  assert.equal(requestedMethod, "POST");
  assert.match(requestedBody, /"reason":"Operator requested stop\."}/);
});

test("retrySequenceRun posts retry payload to the dedicated route", async () => {
  let requestedUrl = "";
  let requestedMethod = "";
  let requestedBody = "";
  const sdk = createNewsPortalSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
      requestedUrl = String(input);
      requestedMethod = String(init?.method ?? "GET");
      requestedBody = String(init?.body ?? "");
      return new Response(
        JSON.stringify({
          run_id: "run-2",
          status: "pending",
          retry_of_run_id: "run-1",
        }),
        {
          status: 202,
          headers: { "content-type": "application/json" },
        }
      );
    }) as typeof fetch,
  });

  await sdk.retrySequenceRun<Record<string, unknown>>("run-1", {
    requestedBy: "admin-1",
    contextOverrides: { force: true },
  });

  assert.equal(
    requestedUrl,
    "http://api.example.test/maintenance/sequence-runs/run-1/retry"
  );
  assert.equal(requestedMethod, "POST");
  assert.match(requestedBody, /"requestedBy":"admin-1"/);
  assert.match(requestedBody, /"force":true/);
});

test("listOutboxEvents preserves explicit limit", async () => {
  let requestedUrl = "";
  const sdk = createNewsPortalSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  });

  await sdk.listOutboxEvents<Record<string, unknown>[]>(15);

  assert.equal(requestedUrl, "http://api.example.test/maintenance/outbox?limit=15");
});

test("listLlmTemplatesPage and listSystemInterestsPage send independent pagination params", async () => {
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
  await sdk.listSystemInterestsPage<Record<string, unknown>>({ page: 2, pageSize: 8 });

  assert.deepEqual(requestedUrls, [
    "http://api.example.test/templates/llm?page=2&pageSize=8",
    "http://api.example.test/system-interests?page=2&pageSize=8",
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
