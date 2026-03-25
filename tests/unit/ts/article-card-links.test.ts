import assert from "node:assert/strict";
import test from "node:test";

import { resolveSafeArticleHref } from "../../../apps/web/src/components/ArticleCard.tsx";

test("resolveSafeArticleHref accepts browser-safe article URLs", () => {
  assert.equal(
    resolveSafeArticleHref("https://example.test/articles/42?ref=feed"),
    "https://example.test/articles/42?ref=feed"
  );
  assert.equal(
    resolveSafeArticleHref("http://example.test/news/alpha"),
    "http://example.test/news/alpha"
  );
});

test("resolveSafeArticleHref rejects unsafe or invalid article URLs", () => {
  assert.equal(resolveSafeArticleHref(undefined), null);
  assert.equal(resolveSafeArticleHref("javascript:alert(1)"), null);
  assert.equal(resolveSafeArticleHref("imap://mail.example.test/INBOX/42"), null);
  assert.equal(resolveSafeArticleHref("not a url"), null);
});
