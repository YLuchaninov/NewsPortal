import assert from "node:assert/strict";
import test from "node:test";

import { classifyDuplicatePreflightInputs } from "../../../services/fetchers/src/fetchers.ts";

test("classifyDuplicatePreflightInputs drops items with known external ids", () => {
  const decisions = classifyDuplicatePreflightInputs(
    [
      {
        externalArticleId: "known-guid",
        url: "https://example.com/already-seen",
        label: "known"
      },
      {
        externalArticleId: "fresh-guid",
        url: "https://example.com/fresh",
        label: "fresh"
      }
    ],
    new Set(["known-guid"]),
    new Set()
  );

  assert.equal(decisions[0]?.shouldPersist, false);
  assert.equal(decisions[0]?.duplicateReason, "externalArticleId");
  assert.equal(decisions[1]?.shouldPersist, true);
  assert.equal(decisions[1]?.duplicateReason, null);
});

test("classifyDuplicatePreflightInputs drops items with known urls", () => {
  const decisions = classifyDuplicatePreflightInputs(
    [
      {
        externalArticleId: "fresh-guid",
        url: "https://example.com/known-url",
        label: "known-url"
      }
    ],
    new Set(),
    new Set(["https://example.com/known-url"])
  );

  assert.equal(decisions[0]?.shouldPersist, false);
  assert.equal(decisions[0]?.duplicateReason, "url");
});

test("classifyDuplicatePreflightInputs suppresses duplicates within the same poll batch", () => {
  const decisions = classifyDuplicatePreflightInputs(
    [
      {
        externalArticleId: "fresh-1",
        url: "https://example.com/news/1",
        label: "first-fresh"
      },
      {
        externalArticleId: "fresh-1",
        url: "https://example.com/news/2",
        label: "duplicate-by-external-id"
      },
      {
        externalArticleId: "fresh-3",
        url: "https://example.com/news/1",
        label: "duplicate-by-url"
      }
    ],
    new Set(),
    new Set()
  );

  assert.equal(decisions[0]?.shouldPersist, true);
  assert.equal(decisions[1]?.shouldPersist, false);
  assert.equal(decisions[1]?.duplicateReason, "externalArticleId");
  assert.equal(decisions[2]?.shouldPersist, false);
  assert.equal(decisions[2]?.duplicateReason, "url");
});

test("classifyDuplicatePreflightInputs handles mixed new and duplicate inputs deterministically", () => {
  const decisions = classifyDuplicatePreflightInputs(
    [
      {
        externalArticleId: "fresh-1",
        url: "https://example.com/news/1",
        label: "fresh"
      },
      {
        externalArticleId: "known-guid",
        url: "https://example.com/news/known-id",
        label: "known-guid"
      },
      {
        externalArticleId: "fresh-3",
        url: "https://example.com/news/known-url",
        label: "known-url"
      },
      {
        externalArticleId: "fresh-4",
        url: "https://example.com/news/4",
        label: "fresh-2"
      }
    ],
    new Set(["known-guid"]),
    new Set(["https://example.com/news/known-url"])
  );

  assert.deepEqual(
    decisions.map((decision) => ({
      label: decision.input.label,
      shouldPersist: decision.shouldPersist,
      duplicateReason: decision.duplicateReason
    })),
    [
      {
        label: "fresh",
        shouldPersist: true,
        duplicateReason: null
      },
      {
        label: "known-guid",
        shouldPersist: false,
        duplicateReason: "externalArticleId"
      },
      {
        label: "known-url",
        shouldPersist: false,
        duplicateReason: "url"
      },
      {
        label: "fresh-2",
        shouldPersist: true,
        duplicateReason: null
      }
    ]
  );
});
