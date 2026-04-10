import assert from "node:assert/strict";
import test from "node:test";

import {
  parseApiAdminChannelInput,
  upsertApiChannels,
} from "../../../apps/admin/src/lib/server/api-channels.ts";

test("parseApiAdminChannelInput normalizes API admin payload fields", () => {
  const channel = parseApiAdminChannelInput({
    name: "Transparency API",
    fetchUrl: "https://example.com/api/items",
    language: "en",
    isActive: "false",
    pollIntervalSeconds: "600",
    adaptiveEnabled: "false",
    maxPollIntervalSeconds: "3600",
    maxItemsPerPoll: "15",
    requestTimeoutMs: "7000",
    userAgent: "NewsPortalFetchers/admin-api",
    itemsPath: "data.records",
    titleField: "headline",
    leadField: "summary",
    bodyField: "body_html",
    urlField: "canonical_url",
    publishedAtField: "published_at",
    externalIdField: "external_id",
    languageField: "lang",
    enrichmentEnabled: "false",
    enrichmentMinBodyLength: "750",
  });

  assert.deepEqual(channel, {
    channelId: undefined,
    providerType: "api",
    name: "Transparency API",
    fetchUrl: "https://example.com/api/items",
    language: "en",
    isActive: false,
    pollIntervalSeconds: 600,
    adaptiveEnabled: false,
    maxPollIntervalSeconds: 3600,
    maxItemsPerPoll: 15,
    requestTimeoutMs: 7000,
    userAgent: "NewsPortalFetchers/admin-api",
    itemsPath: "data.records",
    titleField: "headline",
    leadField: "summary",
    bodyField: "body_html",
    urlField: "canonical_url",
    publishedAtField: "published_at",
    externalIdField: "external_id",
    languageField: "lang",
    enrichmentEnabled: false,
    enrichmentMinBodyLength: 750,
    authorizationHeaderUpdate: {
      mode: "disabled",
      authorizationHeader: null,
    },
  });
});

test("parseApiAdminChannelInput supports replace, preserve, and clear authorization header semantics", () => {
  const createInput = parseApiAdminChannelInput({
    name: "Protected API",
    fetchUrl: "https://example.com/api/items",
    authorizationHeader: "Bearer api-token",
  });
  assert.deepEqual(createInput.authorizationHeaderUpdate, {
    mode: "replace",
    authorizationHeader: "Bearer api-token",
  });

  const preserveInput = parseApiAdminChannelInput({
    channelId: "channel-123",
    name: "Protected API",
    fetchUrl: "https://example.com/api/items",
  });
  assert.deepEqual(preserveInput.authorizationHeaderUpdate, {
    mode: "preserve",
    authorizationHeader: null,
  });

  const clearInput = parseApiAdminChannelInput({
    channelId: "channel-123",
    name: "Protected API",
    fetchUrl: "https://example.com/api/items",
    clearAuthorizationHeader: "true",
  });
  assert.deepEqual(clearInput.authorizationHeaderUpdate, {
    mode: "clear",
    authorizationHeader: null,
  });
});

test("parseApiAdminChannelInput rejects non-API providers and invalid fetch URLs", () => {
  assert.throws(
    () =>
      parseApiAdminChannelInput({
        providerType: "rss",
        name: "Wrong provider",
        fetchUrl: "https://example.com/feed.xml",
      }),
    /Only API channels are supported/
  );

  assert.throws(
    () =>
      parseApiAdminChannelInput({
        name: "Broken API",
        fetchUrl: "not-a-url",
      }),
    /must be a valid absolute URL/
  );
});

test("upsertApiChannels preserves existing auth headers on update until explicitly cleared", async () => {
  const clientQueries: Array<{ sql: string; params: unknown[] | undefined }> = [];
  const fakeClient = {
    async query(sql: string, params?: unknown[]) {
      clientQueries.push({ sql, params });
      if (sql.includes("select auth_config_json")) {
        return {
          rowCount: 1,
          rows: [{ auth_config_json: { authorizationHeader: "Bearer persisted-token" } }],
        };
      }
      if (sql.includes("update source_channels")) {
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    },
    release() {},
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
    },
  };

  const preserveInput = parseApiAdminChannelInput({
    channelId: "channel-123",
    name: "Protected API",
    fetchUrl: "https://example.com/api/items",
  });
  await upsertApiChannels(fakePool as never, [preserveInput]);

  const preserveUpdate = clientQueries.find(({ sql }) => sql.includes("update source_channels"));
  assert.ok(preserveUpdate, "Expected update flow to issue an API channel update.");
  assert.deepEqual(
    preserveUpdate.params?.[8],
    JSON.stringify({ authorizationHeader: "Bearer persisted-token" })
  );

  clientQueries.length = 0;

  const clearInput = parseApiAdminChannelInput({
    channelId: "channel-123",
    name: "Protected API",
    fetchUrl: "https://example.com/api/items",
    clearAuthorizationHeader: "true",
  });
  await upsertApiChannels(fakePool as never, [clearInput]);

  const clearUpdate = clientQueries.find(({ sql }) => sql.includes("update source_channels"));
  assert.ok(clearUpdate, "Expected clear flow to issue an API channel update.");
  assert.deepEqual(clearUpdate.params?.[8], JSON.stringify({}));
});
