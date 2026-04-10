import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveInternalContentHref,
  resolveSafeContentHref
} from "../../../apps/web/src/components/ContentItemCard.tsx";

test("resolveSafeContentHref accepts browser-safe content URLs", () => {
  assert.equal(
    resolveSafeContentHref("https://example.test/content/editorial%3A42?ref=collection"),
    "https://example.test/content/editorial%3A42?ref=collection"
  );
  assert.equal(
    resolveSafeContentHref("http://example.test/data/alpha"),
    "http://example.test/data/alpha"
  );
});

test("resolveSafeContentHref rejects unsafe or invalid content URLs", () => {
  assert.equal(resolveSafeContentHref(undefined), null);
  assert.equal(resolveSafeContentHref("javascript:alert(1)"), null);
  assert.equal(resolveSafeContentHref("imap://mail.example.test/INBOX/42"), null);
  assert.equal(resolveSafeContentHref("not a url"), null);
});

test("resolveInternalContentHref creates stable internal content detail links", () => {
  assert.equal(resolveInternalContentHref("editorial:doc-42"), "/content/editorial%3Adoc-42");
  assert.equal(resolveInternalContentHref("resource:item with spaces"), "/content/resource%3Aitem%20with%20spaces");
  assert.equal(resolveInternalContentHref(""), null);
});
