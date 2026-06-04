import assert from "node:assert/strict";
import test from "node:test";

import { pollApiProviderChannel } from "../../../services/fetchers/src/fetcher-api-poller.ts";
import type {
  ChannelPollCompletion,
  PersistArticleInput,
  SourceChannelRow,
} from "../../../services/fetchers/src/fetcher-persistence.ts";

const API_URL = "https://93.184.216.34/api/items";

function buildChannel(configJson: unknown): SourceChannelRow {
  return {
    channelId: "11111111-1111-4111-8111-111111111111",
    providerType: "api",
    name: "API channel",
    fetchUrl: API_URL,
    configJson,
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

function jsonResponse(payload: unknown, url: string): Response {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Headers({ "content-type": "application/json" }),
    url,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as Response;
}

test("pollApiProviderChannel supports POST next_url pagination and relative item URLs", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    if (calls.length === 1) {
      return jsonResponse(
        {
          data: {
            records: [
              {
                id: "a-1",
                title: "First story",
                url: "/stories/first",
                publishedAt: "2026-05-01T10:00:00.000Z",
              },
            ],
          },
          paging: { next: "/api/items?page=2" },
        },
        API_URL,
      );
    }
    return jsonResponse(
      {
        data: {
          records: [
            {
              id: "a-2",
              title: "Second story",
              url: "https://93.184.216.34/stories/second?utm_source=api",
              publishedAt: "2026-05-01T10:05:00.000Z",
            },
          ],
        },
      },
      "https://93.184.216.34/api/items?page=2",
    );
  }) as typeof fetch;

  const persisted: PersistArticleInput[][] = [];
  let completion: ChannelPollCompletion | null = null;

  try {
    await pollApiProviderChannel(
      buildChannel({
        requestMethod: "POST",
        requestHeaders: { "x-api-version": "2026-05-01" },
        requestBodyJson: { topic: "markets" },
        itemsPath: "data.records",
        pagination: {
          mode: "next_url",
          nextUrlPath: "paging.next",
          maxPagesPerPoll: 2,
        },
      }),
      "2026-05-01T10:10:00.000Z",
      {
        config: {
          defaultUserAgent: "SignalOpsTest/0.1",
        } as never,
        loadCursorMap: async () => ({}),
        persistInputsWithPreflight: async (_channelId, inputs) => {
          persisted.push([...inputs]);
          return { ingestedCount: inputs.length, duplicateCount: 0 };
        },
        markChannelSuccess: async (_channel, result) => {
          completion = result;
        },
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.init.method, "POST");
  assert.equal(calls[0]?.init.body, JSON.stringify({ topic: "markets" }));
  assert.equal(new Headers(calls[0]?.init.headers).get("x-api-version"), "2026-05-01");
  assert.equal(calls[1]?.url, "https://93.184.216.34/api/items?page=2");
  assert.equal(persisted[0]?.length, 2);
  assert.equal(persisted[0]?.[0]?.url, "https://93.184.216.34/stories/first");
  assert.equal(persisted[0]?.[1]?.url, "https://93.184.216.34/stories/second");
  assert.equal(completion?.fetchedItemCount, 2);
  assert.deepEqual(
    completion?.cursorUpdates.map((item) => [item.cursorType, item.cursorValue, item.cursorJson]),
    [
      ["timestamp", "2026-05-01T10:05:00.000Z", { provider: "api" }],
      ["api_page_token", null, { provider: "api", paginationMode: "next_url" }],
    ],
  );
});
