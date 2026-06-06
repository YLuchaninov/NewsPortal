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
import {
  applyChannelBulkOnboardingWithPool,
  planChannelBulkOnboardingWithPool
} from "../../../packages/control-plane/src/channel-bulk-onboarding.ts";
import { planChannelAlternativesWithPool } from "../../../packages/control-plane/src/channel-alternatives.ts";

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

test("channel bulk onboarding treats query-backed RSS feeds as distinct sources", async () => {
  const fakePool = {
    async query(sql: string, params?: unknown[]) {
      if (sql.includes("provider_type = any($1::text[])")) {
        assert.deepEqual(params?.[0], ["rss"]);
        return { rows: [] };
      }

      throw new Error(`Unexpected pool query: ${sql}`);
    }
  };

  const plan = await planChannelBulkOnboardingWithPool(
    fakePool as never,
    [
      {
        providerType: "rss",
        name: "HN Ask Shopify contractor search",
        fetchUrl: "https://hnrss.org/ask?q=shopify+contractor&count=20"
      },
      {
        providerType: "rss",
        name: "HN Ask CRM migration partner search",
        fetchUrl: "https://hnrss.org/ask?q=crm+migration+partner&count=20"
      },
      {
        providerType: "rss",
        name: "HN Ask Shopify contractor search duplicate window",
        fetchUrl: "https://hnrss.org/ask?q=shopify+contractor&count=50&utm_source=test"
      },
      {
        providerType: "rss",
        name: "Google News SMB CRM vendor search",
        fetchUrl:
          "https://news.google.com/rss/search?q=%22small+business%22+CRM+vendor+partner&hl=en-US&gl=US&ceid=US:en"
      },
      {
        providerType: "rss",
        name: "Google News SMB ERP vendor search",
        fetchUrl:
          "https://news.google.com/rss/search?q=%22small+business%22+ERP+vendor+partner&hl=en-US&gl=US&ceid=US:en"
      }
    ],
    { mode: "allow_overrides" }
  );

  assert.equal(plan.summary.duplicate, 1);
  assert.equal(plan.items[0]?.status, "ready_create");
  assert.equal(plan.items[1]?.status, "ready_create");
  assert.equal(plan.items[2]?.status, "duplicate");
  assert.equal(plan.items[3]?.status, "ready_create");
  assert.equal(plan.items[4]?.status, "ready_create");
});

test("channel bulk onboarding treats query-backed API adapter channels as distinct sources", async () => {
  const fakePool = {
    async query(sql: string, params?: unknown[]) {
      if (sql.includes("provider_type = any($1::text[])")) {
        assert.deepEqual(params?.[0], ["api"]);
        return { rows: [] };
      }

      throw new Error(`Unexpected pool query: ${sql}`);
    }
  };

  const plan = await planChannelBulkOnboardingWithPool(
    fakePool as never,
    [
      {
        providerType: "api",
        name: "HN contractor search",
        fetchUrl: "https://hn.algolia.com/api/v1/search_by_date?query=contractor",
        adapterKey: "hn_algolia_search",
      },
      {
        providerType: "api",
        name: "HN MVP search",
        fetchUrl: "https://hn.algolia.com/api/v1/search_by_date?query=mvp",
        adapterKey: "hn_algolia_search",
      },
      {
        providerType: "api",
        name: "HN contractor search duplicate window",
        fetchUrl: "https://hn.algolia.com/api/v1/search_by_date?query=contractor&utm_source=test",
        adapterKey: "hn_algolia_search",
      }
    ],
    { mode: "allow_overrides" }
  );

  assert.equal(plan.summary.duplicate, 1);
  assert.equal(plan.items[0]?.status, "ready_create");
  assert.equal(plan.items[1]?.status, "ready_create");
  assert.equal(plan.items[2]?.status, "duplicate");
});

test("channel bulk onboarding blocks non-existing channelId at row level", async () => {
  const missingChannelId = "11111111-1111-4111-8111-111111111111";
  const fakePool = {
    async query(sql: string, params?: unknown[]) {
      if (sql.includes("channel_id::text = any($1::text[])")) {
        assert.deepEqual(params, [[missingChannelId]]);
        return { rows: [] };
      }
      throw new Error(`Unexpected pool query: ${sql}`);
    }
  };

  const plan = await planChannelBulkOnboardingWithPool(fakePool as never, [
    {
      providerType: "rss",
      channelId: missingChannelId,
      name: "Mistaken create with id",
      fetchUrl: "https://example.com/feed.xml"
    }
  ]);

  assert.equal(plan.summary.invalidSchema, 1);
  assert.equal(plan.summary.blocked, 1);
  assert.equal(plan.items[0]?.status, "invalid_schema");
  assert.equal(plan.items[0]?.matchType, "channelId");
  assert.equal(plan.items[0]?.channelId, missingChannelId);
  assert.match(plan.items[0]?.warnings.join("\n") ?? "", /omit channelId/i);
  assert.match(plan.items[0]?.recommendedAction ?? "", /Omit channelId for creates/i);
});

test("channel bulk onboarding blocks webpage URLs masquerading as RSS", async () => {
  const fakePool = {
    async query(sql: string, params?: unknown[]) {
      if (sql.includes("provider_type = any($1::text[])")) {
        assert.deepEqual(params, [["rss"], ["https://example.com/products/widget"]]);
        return { rows: [] };
      }
      throw new Error(`Unexpected pool query: ${sql}`);
    }
  };
  const sources = [
    {
      providerType: "rss",
      name: "Product page",
      fetchUrl: "https://example.com/products/widget"
    }
  ];

  const plan = await planChannelBulkOnboardingWithPool(fakePool as never, sources, {
    mode: "allow_overrides"
  });

  assert.equal(plan.items[0]?.status, "needs_override");
  assert.equal(plan.blocked.length, 1);
  assert.equal(plan.items[0]?.validation?.classification, "website_page");
  assert.equal(plan.items[0]?.validation?.blocker, "rss_requires_feed_evidence");
  assert.equal(plan.items[0]?.validation?.recommendedProviderType, "website");

  await assert.rejects(
    () =>
      applyChannelBulkOnboardingWithPool(fakePool as never, "admin-user-1", sources, {
        planFingerprint: plan.planFingerprint,
        mode: "allow_overrides",
        confirm: true
      }),
    /overrideReason/
  );
});

test("channel bulk onboarding accepts non-feed-shaped RSS URL only with valid feed probe evidence", async () => {
  const fakePool = {
    async query(sql: string, params?: unknown[]) {
      if (sql.includes("provider_type = any($1::text[])")) {
        assert.deepEqual(params, [["rss"], ["https://example.com/news"]]);
        return { rows: [] };
      }
      throw new Error(`Unexpected pool query: ${sql}`);
    }
  };

  const plan = await planChannelBulkOnboardingWithPool(
    fakePool as never,
    [
      {
        providerType: "rss",
        name: "Validated feed at non-feed URL",
        fetchUrl: "https://example.com/news",
        feedProbeEvidence: {
          url: "https://example.com/news",
          final_url: "https://example.com/news",
          is_valid_rss: true
        }
      }
    ]
  );

  assert.equal(plan.items[0]?.status, "ready_create");
  assert.equal(plan.items[0]?.validation?.classification, "website_page");
  assert.equal(plan.items[0]?.validation?.blocker, null);
});

test("channel bulk onboarding marks API-like URLs as mapping-required", async () => {
  const fakePool = {
    async query(sql: string, params?: unknown[]) {
      if (sql.includes("provider_type = any($1::text[])")) {
        assert.deepEqual(params, [["rss"], ["https://example.com/api/items.json"]]);
        return { rows: [] };
      }
      throw new Error(`Unexpected pool query: ${sql}`);
    }
  };

  const plan = await planChannelBulkOnboardingWithPool(fakePool as never, [
    {
      providerType: "rss",
      name: "JSON API as RSS",
      fetchUrl: "https://example.com/api/items.json"
    }
  ]);

  assert.equal(plan.items[0]?.status, "api_mapping_required");
  assert.equal(plan.items[0]?.validation?.classification, "api_like");
  assert.equal(plan.items[0]?.validation?.recommendedProviderType, "api");
});

test("channel bulk onboarding blocks needs-probe alternatives until feed evidence exists", async () => {
  const fakePool = {
    async query(sql: string) {
      if (sql.includes("provider_type = any($1::text[])")) {
        return { rows: [] };
      }
      if (sql.includes("provider_type = 'rss'")) {
        return { rows: [] };
      }
      throw new Error(`Unexpected pool query: ${sql}`);
    }
  };

  const blockedPlan = await planChannelBulkOnboardingWithPool(fakePool as never, [
    {
      providerType: "rss",
      name: "Unprobed alternative",
      fetchUrl: "https://example.com/feed.xml",
      sourceCandidateStatus: "needs_probe"
    }
  ]);

  assert.equal(blockedPlan.items[0]?.status, "unsupported");
  assert.match(blockedPlan.items[0]?.warnings.join("\n") ?? "", /needs_probe/);

  const acceptedPlan = await planChannelBulkOnboardingWithPool(fakePool as never, [
    {
      providerType: "rss",
      name: "Validated alternative",
      fetchUrl: "https://example.com/feed.xml",
      sourceCandidateStatus: "needs_probe",
      feedProbeEvidence: {
        is_valid_rss: true,
        feed_url: "https://example.com/feed.xml"
      }
    }
  ]);

  assert.equal(acceptedPlan.items[0]?.status, "ready_create");
});

test("channel alternatives plan returns feed-probe candidates without creating channels", async () => {
  const fakePool = {
    async query(sql: string) {
      throw new Error(`Unexpected pool query for URL-only alternatives: ${sql}`);
    }
  };
  const fetchCalls: string[] = [];

  const plan = await planChannelAlternativesWithPool(fakePool as never, {
    urls: ["https://example.com/news"],
    includeFeedProbe: true,
    maxCandidates: 10,
    fetchImpl: (async (input) => {
      fetchCalls.push(String(input));
      return new Response(
        JSON.stringify({
          probed_feeds: [
            {
              url: "https://example.com/news",
              feed_url: "https://example.com/feed.xml",
              final_url: "https://example.com/feed.xml",
              is_valid_rss: true,
              sample_entries: [{ title: "Recent item" }]
            }
          ]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );
    }) as typeof fetch
  });

  const feedCandidate = plan.candidates.find((candidate) => candidate.strategy === "feed_probe");
  assert.equal(fetchCalls.length, 1);
  assert.equal(feedCandidate?.providerType, "rss");
  assert.equal(feedCandidate?.fetchUrl, "https://example.com/feed.xml");
  assert.equal(feedCandidate?.status, "candidate");
  assert.equal(feedCandidate?.validation.classification, "feed_like");
  assert.ok(plan.candidates.every((candidate) => candidate.sourceChannelId === null));
});

test("channel alternatives plan returns website fallback for technically broken RSS", async () => {
  const channelId = "11111111-1111-4111-8111-111111111111";
  const fakePool = {
    async query(sql: string, params?: unknown[]) {
      assert.match(sql, /from source_channels sc/i);
      assert.deepEqual(params?.[0], [channelId]);
      return {
        rows: [
          {
            channelId,
            name: "Broken RSS",
            providerType: "rss",
            fetchUrl: "https://example.com/news/feed.xml",
            lastResultKind: "malformed_feed",
            lastErrorMessage: "XML parse failed",
            consecutiveFailures: 3
          }
        ]
      };
    }
  };

  const plan = await planChannelAlternativesWithPool(fakePool as never, {
    channelIds: [channelId],
    includeFeedProbe: false,
    maxCandidates: 10
  });

  const fallback = plan.candidates.find((candidate) => candidate.strategy === "website_fallback");
  assert.equal(fallback?.providerType, "website");
  assert.equal(fallback?.status, "needs_probe");
  assert.equal(fallback?.fetchUrl, "https://example.com/");
  assert.equal(fallback?.sourceChannelId, channelId);
  assert.match(JSON.stringify(plan.nextActions), /channels\.bulk_onboard\.plan/);
  assert.match(JSON.stringify(plan.nextActions), /channels\.bulk_onboard\.verify/);
});

test("channel bulk onboarding applies fetchUrl matches as updates after override", async () => {
  const existingChannelId = "rss-existing-1";
  const fetchUrl = "https://hnrss.org/ask?q=looking+for+developer&count=100&link=comments";
  const clientQueries: Array<{ sql: string; params?: unknown[] }> = [];
  const fakeClient = {
    async query(sql: string, params?: unknown[]) {
      clientQueries.push({ sql, params });
      if (sql === "begin" || sql === "commit" || sql === "rollback") {
        return { rows: [], rowCount: 0 };
      }
      if (sql.includes("select auth_config_json")) {
        assert.equal(params?.[0], existingChannelId);
        return { rows: [{ auth_config_json: null }], rowCount: 1 };
      }
      if (sql.includes("update source_channels")) {
        assert.equal(params?.[0], existingChannelId);
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("insert into source_channel_runtime_state")) {
        assert.equal(params?.[0], existingChannelId);
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes("insert into source_channel_adapter_binding")) {
        assert.deepEqual(params, [existingChannelId, "rss.hn_comments_feed", "{}", "admin-channel-save"]);
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected client query: ${sql}`);
    },
    release() {}
  };
  const fakePool = {
    async query(sql: string, params?: unknown[]) {
      if (sql.includes("provider_type = any($1::text[])")) {
        assert.deepEqual(params, [["rss"], [fetchUrl]]);
        return {
          rows: [
            {
              channel_id: existingChannelId,
              provider_type: "rss",
              fetch_url: fetchUrl
            }
          ]
        };
      }
      if (sql.includes("provider_type = 'rss'") && sql.includes("channel_id::text = any")) {
        assert.deepEqual(params, [[existingChannelId]]);
        return {
          rows: [
            {
              channel_id: existingChannelId,
              name: "Existing HNRSS",
              fetch_url: fetchUrl
            }
          ]
        };
      }
      if (sql.includes("from source_providers")) {
        return { rows: [{ provider_id: "rss-provider-1" }] };
      }
      if (sql.includes("insert into audit_log")) {
        assert.equal(params?.[1], "channel_updated");
        assert.equal(params?.[3], existingChannelId);
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected pool query: ${sql}`);
    },
    async connect() {
      return fakeClient;
    }
  };
  const sources = [
    {
      providerType: "rss",
      name: "HN looking for developer",
      fetchUrl,
      language: "en",
      isActive: true
    }
  ];

  const plan = await planChannelBulkOnboardingWithPool(fakePool as never, sources, {
    mode: "allow_overrides"
  });
  assert.equal(plan.summary.matchedByFetchUrl, 1);
  assert.equal(plan.items[0]?.action, "update");
  assert.equal(plan.items[0]?.status, "ready_update");

  await assert.rejects(
    () =>
      applyChannelBulkOnboardingWithPool(fakePool as never, "admin-user-1", sources, {
        mode: "allow_overrides",
        planFingerprint: plan.planFingerprint
      }),
    /confirm=true/
  );

  const result = await applyChannelBulkOnboardingWithPool(
    fakePool as never,
    "admin-user-1",
    sources,
    {
      mode: "allow_overrides",
      planFingerprint: plan.planFingerprint,
      confirm: true
    }
  );

  assert.deepEqual(result.createdChannelIds, []);
  assert.deepEqual(result.updatedChannelIds, [existingChannelId]);
  assert.equal(result.summary.createdCount, 0);
  assert.equal(result.summary.updatedCount, 1);
  assert.equal(result.items[0]?.status, "updated");
  assert.equal(result.items[0]?.channelId, existingChannelId);
  assert.equal(
    clientQueries.some((entry) => entry.sql.includes("insert into source_channels")),
    false
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
