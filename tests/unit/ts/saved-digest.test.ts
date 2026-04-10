import assert from "node:assert/strict";
import test from "node:test";

import {
  parseSelectedDigestItemIds,
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
