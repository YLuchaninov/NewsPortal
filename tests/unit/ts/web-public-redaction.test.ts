import assert from "node:assert/strict";
import test from "node:test";

import { buildPublicRedactedSignalCard } from "../../../runtime/node/apps/web/src/lib/server/public-redacted-content.ts";

test("public redacted signal card serialization excludes source-identifying fields", () => {
  const card = buildPublicRedactedSignalCard(
    {
      content_kind: "editorial",
      lang: "en",
      published_at: "2026-06-05T12:00:00.000Z",
      updated_at: "2026-06-05T12:30:00.000Z",
      content_item_id: "signal_candidate:secret-doc",
      url: "https://source.example.com/private/story",
      title: "Exact private title",
      summary: "Exact private summary",
      lead: "Exact private lead",
      source_name: "Source Example",
      author_name: "Private Author",
      raw_payload_json: { source: "source.example.com" },
      primary_media_url: "https://cdn.example.com/image.jpg",
    } as never,
    1
  );
  const serialized = JSON.stringify(card);

  assert.equal(serialized.includes("source.example.com"), false);
  assert.equal(serialized.includes("cdn.example.com"), false);
  assert.equal(serialized.includes("secret-doc"), false);
  assert.equal(serialized.includes("Exact private title"), false);
  assert.equal(serialized.includes("Exact private summary"), false);
  assert.equal(serialized.includes("Exact private lead"), false);
  assert.equal(serialized.includes("Source Example"), false);
  assert.equal(serialized.includes("Private Author"), false);
  assert.deepEqual(Object.keys(card).sort(), ["contentKind", "index", "lang", "publishedBucket"]);
});
