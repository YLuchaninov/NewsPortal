import assert from "node:assert/strict";
import test from "node:test";

import {
  parseSelectedDigestItemIds,
  resolveSavedDigestItemIds,
  renderSavedDigestHtml,
  renderSavedDigestText,
} from "../../../apps/web/src/lib/server/saved-digest.ts";

test("parseSelectedDigestItemIds keeps order and removes duplicates", () => {
  const params = new URLSearchParams();
  params.append("item", "editorial:1");
  params.append("item", "editorial:1");
  params.append("item", "resource:2");

  assert.deepEqual(parseSelectedDigestItemIds(params), ["editorial:1", "resource:2"]);
});

test("saved digest renderers include titles and source links", () => {
  const items = [
    {
      content_item_id: "editorial:1",
      title: "AI policy update",
      summary: "A concise summary",
      source_name: "Example News",
      published_at: "2026-04-04T09:00:00Z",
      url: "https://example.test/ai-policy",
    },
  ];

  const textBody = renderSavedDigestText(items as any);
  const htmlBody = renderSavedDigestHtml(items as any);

  assert.match(textBody, /AI policy update/);
  assert.match(textBody, /https:\/\/example\.test\/ai-policy/);
  assert.match(htmlBody, /Saved digest/);
  assert.match(htmlBody, /Example News/);
  assert.match(htmlBody, /https:\/\/example\.test\/ai-policy/);
});

test("resolveSavedDigestItemIds falls back to all saved items when no explicit selection is provided", async () => {
  const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
  const pool = {
    async query(sql: string, params?: unknown[]) {
      calls.push({ sql, params });
      if (sql.includes("with requested_editorial as")) {
        return {
          rows: [{ requested_content_item_id: "editorial:2", content_item_id: "editorial:9" }],
        };
      }
      return {
        rows: [{ content_item_id: "editorial:2" }, { content_item_id: "resource:3" }],
      };
    },
  };

  const itemIds = await resolveSavedDigestItemIds(pool as any, "user-1", []);

  assert.deepEqual(itemIds, ["editorial:9", "resource:3"]);
  assert.equal(calls.length, 2);
  assert.match(calls[0]!.sql, /saved_state = 'saved'/);
  assert.deepEqual(calls[0]!.params, ["user-1"]);
});

test("resolveSavedDigestItemIds preserves explicit selection order while dropping unsaved ids", async () => {
  const pool = {
    async query(sql: string) {
      if (sql.includes("with requested_editorial as")) {
        return {
          rows: [
            { requested_content_item_id: "editorial:2", content_item_id: "editorial:9" },
            { requested_content_item_id: "editorial:7", content_item_id: "editorial:9" },
          ],
        };
      }
      return {
        rows: [
          { content_item_id: "resource:3" },
          { content_item_id: "editorial:2" },
          { content_item_id: "editorial:7" },
        ],
      };
    },
  };

  const itemIds = await resolveSavedDigestItemIds(pool as any, "user-1", [
    "editorial:2",
    "editorial:7",
    "missing:1",
    "resource:3",
  ]);

  assert.deepEqual(itemIds, ["editorial:9", "resource:3"]);
});
