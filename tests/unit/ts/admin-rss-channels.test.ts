import assert from "node:assert/strict";
import test from "node:test";

import {
  parseBulkRssAdminChannelInputs,
  parseRssAdminChannelInput
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
    preferContentEncoded: "false"
  });

  assert.deepEqual(channel, {
    channelId: undefined,
    providerType: "rss",
    name: "Reuters World RSS",
    fetchUrl: "https://example.com/feed.xml",
    language: "en",
    isActive: false,
    pollIntervalSeconds: 600,
    maxItemsPerPoll: 25,
    requestTimeoutMs: 4000,
    userAgent: "NewsPortalFetchers/admin",
    preferContentEncoded: false
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
