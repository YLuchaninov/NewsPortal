import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  buildBulkChannelImportPreflightHeaders,
  getBulkChannelImportViewModel
} from "../../../apps/admin/src/components/BulkChannelImport.tsx";
import {
  buildAdminActionToken,
  prepareAdminAction,
  type AdminActionSession
} from "../../../apps/admin/src/lib/server/admin-action.ts";
import {
  formatBulkImportSuccessMessage,
  parseBulkChannels,
  planBulkImportWithPool,
  readBulkPayload
} from "../../../apps/admin/src/pages/bff/admin/channels/bulk/shared.ts";

const adminSession: AdminActionSession = {
  userId: "admin-user-1",
  roles: ["admin"],
  identity: {
    subject: "firebase-admin",
    provider: "firebase_email_link",
    email: "admin@example.test",
    isAnonymous: false
  }
};

async function withAppSecret<T>(secret: string, callback: () => Promise<T>): Promise<T> {
  const previous = process.env.APP_SECRET;
  process.env.APP_SECRET = secret;
  try {
    return await callback();
  } finally {
    if (previous == null) {
      delete process.env.APP_SECRET;
    } else {
      process.env.APP_SECRET = previous;
    }
  }
}

test("getBulkChannelImportViewModel exposes mixed-import copy and required providerType", () => {
  const viewModel = getBulkChannelImportViewModel("mixed");

  assert.match(viewModel.helpText, /providerType/);
  assert.match(viewModel.exampleJson, /"providerType": "website"/);
  assert.equal(viewModel.fieldSchema.providerType?.type, '"rss" | "website" | "api" | "email_imap"');
});

test("bulk import island carries scoped admin action tokens explicitly", () => {
  const headers = buildBulkChannelImportPreflightHeaders("preflight-token");

  assert.deepEqual(headers, {
    Accept: "application/json",
    "Content-Type": "application/json",
    "x-admin-action-token": "preflight-token"
  });

  const componentSource = readFileSync(
    join(process.cwd(), "apps/admin/src/components/BulkChannelImport.tsx"),
    "utf8"
  );
  const importPageSource = readFileSync(
    join(process.cwd(), "apps/admin/src/pages/channels/import.astro"),
    "utf8"
  );

  assert.match(componentSource, /name="adminActionToken" value=\{adminActionToken\}/);
  assert.match(importPageSource, /scope: "channels\.bulk"/);
  assert.match(importPageSource, /scope: "channels\.bulk\.preflight"/);
});

test("bulk import form payload preserves admin action token for the shared guard", async () => {
  await withAppSecret("bulk-import-test-secret", async () => {
    const requestUrl = "http://127.0.0.1:4322/bff/admin/channels/bulk";
    const token = buildAdminActionToken({
      request: new Request(requestUrl),
      session: adminSession,
      targetPath: "/bff/admin/channels/bulk",
      scope: "channels.bulk",
      ttlMs: 60_000
    });
    const body = new URLSearchParams({
      channelsJson: JSON.stringify([
        {
          providerType: "rss",
          name: "Example feed",
          fetchUrl: "https://example.com/feed.xml"
        }
      ]),
      confirmOverwrite: "true",
      adminActionToken: token
    });
    const result = await prepareAdminAction(
      new Request(requestUrl, {
        method: "POST",
        body
      }),
      {
        fallbackRedirectPath: "/channels/import",
        actionToken: { scope: "channels.bulk" },
        resolveSession: async () => adminSession,
        payloadReader: readBulkPayload
      }
    );

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.context.payload.adminActionToken, undefined);
      assert.equal(result.context.payload.confirmOverwrite, true);
      assert.equal(Array.isArray(result.context.payload.channelsPayload), true);
    }
  });
});

test("parseBulkChannels requires row-level providerType for shared bulk imports", () => {
  assert.throws(
    () =>
      parseBulkChannels([
        {
          name: "Missing provider",
          fetchUrl: "https://example.com/feed.xml"
        }
      ]),
    /must include providerType/
  );
});

test("planBulkImportWithPool groups mixed provider rows and preserves original indices", async () => {
  const channels = parseBulkChannels([
    {
      providerType: "website",
      name: "Website update",
      fetchUrl: "https://example.com/"
    },
    {
      providerType: "rss",
      channelId: "rss-123",
      name: "RSS update",
      fetchUrl: "https://example.com/feed.xml"
    },
    {
      providerType: "api",
      name: "API create",
      fetchUrl: "https://example.com/api/items",
      itemsPath: "data.records",
      titleField: "headline",
      leadField: "summary",
      bodyField: "body",
      urlField: "url",
      publishedAtField: "published_at",
      externalIdField: "external_id",
      languageField: "lang"
    },
    {
      providerType: "email_imap",
      name: "Inbox create",
      host: "imap.example.com",
      username: "alerts@example.com",
      password: "MailboxSecret!",
      mailbox: "INBOX"
    }
  ]);

  const fakePool = {
    async query(sql: string, params?: unknown[]) {
      if (sql.includes("provider_type = any($1::text[])")) {
        assert.deepEqual(params, [["api"], ["https://example.com/api/items"]]);
        return { rows: [] };
      }

      if (sql.includes("provider_type = 'rss'")) {
        assert.deepEqual(params, [["rss-123"]]);
        return {
          rows: [
            {
              channel_id: "rss-123",
              name: "Existing RSS",
              fetch_url: "https://example.com/feed.xml"
            }
          ]
        };
      }

      if (sql.includes("provider_type = 'website'")) {
        assert.deepEqual(params, [[], ["https://example.com/"]]);
        return {
          rows: [
            {
              channel_id: "website-123",
              name: "Existing website",
              fetch_url: "https://example.com/"
            }
          ]
        };
      }

      throw new Error(`Unexpected pool query: ${sql}`);
    }
  };

  const plan = await planBulkImportWithPool(fakePool as never, channels);

  assert.equal(plan.wouldCreate, 2);
  assert.equal(plan.wouldUpdate, 2);
  assert.equal(plan.matchedByChannelId, 1);
  assert.equal(plan.matchedByFetchUrl, 1);
  assert.deepEqual(plan.providerBreakdown, [
    { providerType: "rss", total: 1, wouldCreate: 0, wouldUpdate: 1 },
    { providerType: "website", total: 1, wouldCreate: 0, wouldUpdate: 1 },
    { providerType: "api", total: 1, wouldCreate: 1, wouldUpdate: 0 },
    { providerType: "email_imap", total: 1, wouldCreate: 1, wouldUpdate: 0 }
  ]);
  assert.deepEqual(
    plan.items.map((item) => ({
      index: item.index,
      providerType: item.providerType,
      action: item.action,
      matchType: item.matchType,
      channelId: item.channelId
    })),
    [
      {
        index: 0,
        providerType: "website",
        action: "update",
        matchType: "fetchUrl",
        channelId: "website-123"
      },
      {
        index: 1,
        providerType: "rss",
        action: "update",
        matchType: "channelId",
        channelId: "rss-123"
      },
      {
        index: 2,
        providerType: "api",
        action: "create",
        matchType: "create",
        channelId: null
      },
      {
        index: 3,
        providerType: "email_imap",
        action: "create",
        matchType: "create",
        channelId: null
      }
    ]
  );
  assert.equal(plan.channels[0]?.providerType, "website");
  assert.equal(
    (plan.channels[0]?.channel as { channelId?: string }).channelId,
    "website-123"
  );
});

test("formatBulkImportSuccessMessage summarizes mixed provider counts", () => {
  const message = formatBulkImportSuccessMessage({
    createdChannelIds: ["api-1", "email-1"],
    updatedChannelIds: ["rss-1"],
    authConfiguredChannelIds: [],
    authClearedChannelIds: [],
    providerBreakdown: [
      { providerType: "rss", createdCount: 0, updatedCount: 1 },
      { providerType: "api", createdCount: 1, updatedCount: 0 },
      { providerType: "email_imap", createdCount: 1, updatedCount: 0 }
    ]
  });

  assert.match(message, /Imported 2 new channels and updated 1 existing channel/);
  assert.match(message, /RSS 1/);
  assert.match(message, /API 1/);
  assert.match(message, /Email IMAP 1/);
});
