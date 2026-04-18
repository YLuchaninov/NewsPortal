import assert from "node:assert/strict";
import test from "node:test";

import {
  countRssChannelsRequiringOverwriteConfirmation,
  parseBulkRssAdminChannelInputs,
  parseRssAdminChannelInput,
  planRssBulkImport,
  resolveRssChannelDeleteMode,
  upsertRssChannels
} from "../../../apps/admin/src/lib/server/rss-channels.ts";

test("parseRssAdminChannelInput normalizes RSS admin payload fields", () => {
  const channel = parseRssAdminChannelInput({
    name: "Reuters World RSS",
    fetchUrl: "https://example.com/feed.xml",
    language: "en",
    isActive: "false",
    pollIntervalSeconds: "600",
    maxItemsPerPoll: "25",
    requestTimeoutMs: "4000",
    userAgent: "NewsPortalFetchers/admin",
    preferContentEncoded: "false",
    adapterStrategy: "google_news_rss",
    maxEntryAgeHours: "72",
    enrichmentEnabled: "false",
    enrichmentMinBodyLength: "900"
  });

  assert.deepEqual(channel, {
    channelId: undefined,
    providerType: "rss",
    name: "Reuters World RSS",
    fetchUrl: "https://example.com/feed.xml",
    language: "en",
    isActive: false,
    pollIntervalSeconds: 600,
    adaptiveEnabled: true,
    maxPollIntervalSeconds: 9600,
    maxItemsPerPoll: 25,
    requestTimeoutMs: 4000,
    userAgent: "NewsPortalFetchers/admin",
    preferContentEncoded: false,
    adapterStrategy: "google_news_rss",
    maxEntryAgeHours: 72,
    enrichmentEnabled: false,
    enrichmentMinBodyLength: 900,
    authorizationHeaderUpdate: {
      mode: "disabled",
      authorizationHeader: null
    }
  });
});

test("parseRssAdminChannelInput accepts explicit adaptive scheduling fields", () => {
  const channel = parseRssAdminChannelInput({
    name: "Daily policy digest",
    fetchUrl: "https://example.com/daily.xml",
    pollIntervalSeconds: "86400",
    adaptiveEnabled: "false",
    maxPollIntervalSeconds: "604800"
  });

  assert.equal(channel.adaptiveEnabled, false);
  assert.equal(channel.pollIntervalSeconds, 86400);
  assert.equal(channel.maxPollIntervalSeconds, 604800);
});

test("parseRssAdminChannelInput keeps adapter strategy optional for runtime inference", () => {
  const channel = parseRssAdminChannelInput({
    name: "Auto inferred aggregator",
    fetchUrl: "https://www.reddit.com/search.rss?q=procurement",
    adapterStrategy: "auto",
  });

  assert.equal(channel.adapterStrategy, null);
  assert.equal(channel.maxEntryAgeHours, null);
});

test("parseRssAdminChannelInput supports replace, preserve, and clear authorization header semantics", () => {
  const createInput = parseRssAdminChannelInput({
    name: "Protected RSS",
    fetchUrl: "https://example.com/protected.xml",
    authorizationHeader: "Bearer create-token"
  });
  assert.deepEqual(createInput.authorizationHeaderUpdate, {
    mode: "replace",
    authorizationHeader: "Bearer create-token"
  });

  const preserveInput = parseRssAdminChannelInput({
    channelId: "channel-123",
    name: "Protected RSS",
    fetchUrl: "https://example.com/protected.xml"
  });
  assert.deepEqual(preserveInput.authorizationHeaderUpdate, {
    mode: "preserve",
    authorizationHeader: null
  });

  const clearInput = parseRssAdminChannelInput({
    channelId: "channel-123",
    name: "Protected RSS",
    fetchUrl: "https://example.com/protected.xml",
    clearAuthorizationHeader: "true"
  });
  assert.deepEqual(clearInput.authorizationHeaderUpdate, {
    mode: "clear",
    authorizationHeader: null
  });
});

test("parseRssAdminChannelInput rejects non-RSS providers and invalid fetch URLs", () => {
  assert.throws(
    () =>
      parseRssAdminChannelInput({
        providerType: "api",
        name: "API channel",
        fetchUrl: "https://example.com/items.json"
      }),
    /Only RSS channels are supported/
  );

  assert.throws(
    () =>
      parseRssAdminChannelInput({
        name: "Broken RSS",
        fetchUrl: "not-a-url"
      }),
    /must be a valid absolute URL/
  );
});

test("parseBulkRssAdminChannelInputs rejects partially invalid payloads", () => {
  assert.throws(
    () =>
      parseBulkRssAdminChannelInputs([
        {
          name: "Valid channel",
          fetchUrl: "https://example.com/valid.xml"
        },
        {
          name: "Broken channel",
          fetchUrl: "https://example.com/broken.xml",
          pollIntervalSeconds: "0"
        }
      ]),
    /index 1 is invalid/
  );
});

test("parseBulkRssAdminChannelInputs rejects empty payloads", () => {
  assert.throws(
    () => parseBulkRssAdminChannelInputs([]),
    /must include at least one channel/
  );
});

test("resolveRssChannelDeleteMode archives channels with historical articles", () => {
  assert.equal(resolveRssChannelDeleteMode(0), "delete");
  assert.equal(resolveRssChannelDeleteMode(1), "archive");
  assert.equal(resolveRssChannelDeleteMode(24), "archive");
});

test("countRssChannelsRequiringOverwriteConfirmation flags updates in bulk payloads", () => {
  const channels = parseBulkRssAdminChannelInputs([
    {
      name: "Create me",
      fetchUrl: "https://example.com/create.xml"
    },
    {
      channelId: "channel-123",
      name: "Update me",
      fetchUrl: "https://example.com/update.xml"
    }
  ]);

  assert.equal(countRssChannelsRequiringOverwriteConfirmation(channels), 1);
});

test("planRssBulkImport reports create and channelId update targets", async () => {
  const channels = parseBulkRssAdminChannelInputs([
    {
      name: "Create me",
      fetchUrl: "https://example.com/create.xml"
    },
    {
      channelId: "channel-123",
      name: "Update me",
      fetchUrl: "https://example.com/update.xml"
    }
  ]);
  const fakePool = {
    async query(sql: string, params?: unknown[]) {
      assert.match(sql, /provider_type = 'rss'/);
      assert.deepEqual(params, [["channel-123"]]);
      return {
        rows: [
          {
            channel_id: "channel-123",
            name: "Existing RSS",
            fetch_url: "https://example.com/update.xml"
          }
        ]
      };
    }
  };

  const plan = await planRssBulkImport(fakePool as never, channels);

  assert.equal(plan.wouldCreate, 1);
  assert.equal(plan.wouldUpdate, 1);
  assert.equal(plan.matchedByChannelId, 1);
  assert.equal(plan.matchedByFetchUrl, 0);
  assert.deepEqual(plan.items, [
    {
      index: 0,
      name: "Create me",
      fetchUrl: "https://example.com/create.xml",
      action: "create",
      matchType: "create",
      channelId: null,
      existingName: null,
      existingFetchUrl: null
    },
    {
      index: 1,
      name: "Update me",
      fetchUrl: "https://example.com/update.xml",
      action: "update",
      matchType: "channelId",
      channelId: "channel-123",
      existingName: "Existing RSS",
      existingFetchUrl: "https://example.com/update.xml"
    }
  ]);
});

test("upsertRssChannels preserves existing auth headers on update until explicitly cleared", async () => {
  const clientQueries: Array<{ sql: string; params: unknown[] | undefined }> = [];
  const fakeClient = {
    async query(sql: string, params?: unknown[]) {
      clientQueries.push({ sql, params });
      if (sql.includes("select auth_config_json")) {
        return {
          rowCount: 1,
          rows: [{ auth_config_json: { authorizationHeader: "Bearer persisted-token" } }]
        };
      }
      if (sql.includes("update source_channels")) {
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    },
    release() {}
  };
  const fakePool = {
    async query(sql: string) {
      if (sql.includes("from source_providers")) {
        return { rows: [{ provider_id: "provider-1" }] };
      }
      throw new Error(`Unexpected pool query: ${sql}`);
    },
    async connect() {
      return fakeClient;
    }
  };

  const preserveInput = parseRssAdminChannelInput({
    channelId: "channel-123",
    name: "Protected RSS",
    fetchUrl: "https://example.com/protected.xml"
  });
  await upsertRssChannels(fakePool as never, [preserveInput]);

  const preserveUpdate = clientQueries.find(({ sql }) => sql.includes("update source_channels"));
  assert.ok(preserveUpdate, "Expected update flow to issue an RSS channel update.");
  assert.deepEqual(preserveUpdate.params?.[8], JSON.stringify({ authorizationHeader: "Bearer persisted-token" }));

  clientQueries.length = 0;

  const clearInput = parseRssAdminChannelInput({
    channelId: "channel-123",
    name: "Protected RSS",
    fetchUrl: "https://example.com/protected.xml",
    clearAuthorizationHeader: "true"
  });
  await upsertRssChannels(fakePool as never, [clearInput]);

  const clearUpdate = clientQueries.find(({ sql }) => sql.includes("update source_channels"));
  assert.ok(clearUpdate, "Expected clear flow to issue an RSS channel update.");
  assert.deepEqual(clearUpdate.params?.[8], JSON.stringify({}));
});
