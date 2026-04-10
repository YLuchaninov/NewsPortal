import assert from "node:assert/strict";
import test from "node:test";

import {
  parseWebsiteAdminChannelInput,
  upsertWebsiteChannels,
} from "../../../apps/admin/src/lib/server/website-channels.ts";

test("parseWebsiteAdminChannelInput normalizes website admin payload fields", () => {
  const channel = parseWebsiteAdminChannelInput({
    name: "EU policy portal",
    fetchUrl: "https://example.com/",
    language: "en",
    isActive: "false",
    pollIntervalSeconds: "1200",
    adaptiveEnabled: "false",
    maxPollIntervalSeconds: "7200",
    requestTimeoutMs: "4000",
    totalPollTimeoutMs: "20000",
    userAgent: "NewsPortalFetchers/admin-website",
    maxResourcesPerPoll: "12",
    crawlDelayMs: "1500",
    sitemapDiscoveryEnabled: "true",
    feedDiscoveryEnabled: "false",
    collectionDiscoveryEnabled: "true",
    downloadDiscoveryEnabled: "false",
    browserFallbackEnabled: "false",
    collectionSeedUrls: "https://example.com/directory\nhttps://example.com/archive",
    allowedUrlPatterns: "\\/news\\/\n\\/directory\\/",
    blockedUrlPatterns: "\\/login\\/\n\\/privacy\\/"
  });

  assert.deepEqual(channel, {
    channelId: undefined,
    providerType: "website",
    name: "EU policy portal",
    fetchUrl: "https://example.com/",
    language: "en",
    isActive: false,
    pollIntervalSeconds: 1200,
    adaptiveEnabled: false,
    maxPollIntervalSeconds: 7200,
    requestTimeoutMs: 4000,
    totalPollTimeoutMs: 20000,
    userAgent: "NewsPortalFetchers/admin-website",
    maxResourcesPerPoll: 12,
    crawlDelayMs: 1500,
    sitemapDiscoveryEnabled: true,
    feedDiscoveryEnabled: false,
    collectionDiscoveryEnabled: true,
    downloadDiscoveryEnabled: false,
    browserFallbackEnabled: false,
    collectionSeedUrls: ["https://example.com/directory", "https://example.com/archive"],
    allowedUrlPatterns: ["\\/news\\/", "\\/directory\\/"],
    blockedUrlPatterns: ["\\/login\\/", "\\/privacy\\/"],
    authorizationHeaderUpdate: {
      mode: "disabled",
      authorizationHeader: null
    }
  });
});

test("parseWebsiteAdminChannelInput supports replace, preserve, and clear authorization header semantics", () => {
  const createInput = parseWebsiteAdminChannelInput({
    name: "Protected website",
    fetchUrl: "https://example.com/",
    authorizationHeader: "Bearer website-token"
  });
  assert.deepEqual(createInput.authorizationHeaderUpdate, {
    mode: "replace",
    authorizationHeader: "Bearer website-token"
  });

  const preserveInput = parseWebsiteAdminChannelInput({
    channelId: "channel-123",
    name: "Protected website",
    fetchUrl: "https://example.com/"
  });
  assert.deepEqual(preserveInput.authorizationHeaderUpdate, {
    mode: "preserve",
    authorizationHeader: null
  });

  const clearInput = parseWebsiteAdminChannelInput({
    channelId: "channel-123",
    name: "Protected website",
    fetchUrl: "https://example.com/",
    clearAuthorizationHeader: "true"
  });
  assert.deepEqual(clearInput.authorizationHeaderUpdate, {
    mode: "clear",
    authorizationHeader: null
  });
});

test("parseWebsiteAdminChannelInput rejects non-website providers and invalid URLs", () => {
  assert.throws(
    () =>
      parseWebsiteAdminChannelInput({
        providerType: "rss",
        name: "Wrong provider",
        fetchUrl: "https://example.com/feed.xml"
      }),
    /Only website channels are supported/
  );

  assert.throws(
    () =>
      parseWebsiteAdminChannelInput({
        name: "Broken website",
        fetchUrl: "not-a-url"
      }),
    /must be a valid absolute URL/
  );

  assert.throws(
    () =>
      parseWebsiteAdminChannelInput({
        name: "Broken seed",
        fetchUrl: "https://example.com/",
        collectionSeedUrls: "notaurl"
      }),
    /collectionSeedUrls/
  );
});

test("upsertWebsiteChannels persists homepage_url alongside fetch_url for create and update flows", async () => {
  const providerQueries: Array<{ sql: string; params: unknown[] | undefined }> = [];
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
    release() {},
  };
  const fakePool = {
    async query(sql: string, params?: unknown[]) {
      providerQueries.push({ sql, params });
      if (sql.includes("from source_providers")) {
        return { rows: [{ provider_id: "provider-1" }] };
      }
      throw new Error(`Unexpected pool query: ${sql}`);
    },
    async connect() {
      return fakeClient;
    },
  };

  const createInput = parseWebsiteAdminChannelInput({
    name: "Create website",
    fetchUrl: "https://example.com/",
  });
  await upsertWebsiteChannels(fakePool as never, [createInput]);

  const createQuery = clientQueries.find(({ sql }) => sql.includes("insert into source_channels"));
  assert.ok(createQuery, "Expected create flow to insert a source_channels row.");
  assert.match(createQuery.sql, /homepage_url/);
  assert.match(createQuery.sql, /auth_config_json/);
  assert.match(createQuery.sql, /values \(\$1, \$2, 'website', \$3, \$4, \$4, \$5, \$6, \$7, \$8::jsonb, \$9::jsonb, true, 500\)/);
  assert.deepEqual(createQuery.params?.[8], JSON.stringify({}));

  clientQueries.length = 0;

  const updateInput = parseWebsiteAdminChannelInput({
    channelId: "channel-123",
    name: "Update website",
    fetchUrl: "https://example.com/updated",
  });
  await upsertWebsiteChannels(fakePool as never, [updateInput]);

  const updateQuery = clientQueries.find(({ sql }) => sql.includes("update source_channels"));
  assert.ok(updateQuery, "Expected update flow to update a source_channels row.");
  assert.match(updateQuery.sql, /homepage_url = \$4/);
  assert.match(updateQuery.sql, /auth_config_json = \$9::jsonb/);
  assert.deepEqual(updateQuery.params?.[8], JSON.stringify({ authorizationHeader: "Bearer persisted-token" }));
});
