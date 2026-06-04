import test from "node:test";
import assert from "node:assert/strict";

import {
  sanitizeOptionalPositiveInt,
  sanitizeOptionalTimestamptzInput
} from "../../../services/fetchers/src/enrichment";

test("sanitizeOptionalPositiveInt keeps only strictly positive integers", () => {
  assert.equal(sanitizeOptionalPositiveInt(12.2), 12);
  assert.equal(sanitizeOptionalPositiveInt("48"), 48);
  assert.equal(sanitizeOptionalPositiveInt(0), null);
  assert.equal(sanitizeOptionalPositiveInt(-3), null);
  assert.equal(sanitizeOptionalPositiveInt("not-a-number"), null);
});

test("sanitizeOptionalTimestamptzInput accepts valid timestamps and rejects malformed payloads", () => {
  assert.equal(
    sanitizeOptionalTimestamptzInput("2026-04-08T10:30:00Z"),
    "2026-04-08T10:30:00.000Z"
  );
  assert.equal(
    sanitizeOptionalTimestamptzInput(new Date("2026-04-08T10:30:00Z")),
    "2026-04-08T10:30:00.000Z"
  );
  assert.equal(sanitizeOptionalTimestamptzInput({ published: "2026-04-08" }), null);
  assert.equal(sanitizeOptionalTimestamptzInput("[object Object]"), null);
  assert.equal(sanitizeOptionalTimestamptzInput("9971-69-38"), null);
  assert.equal(sanitizeOptionalTimestamptzInput("0000-06-19T00:00:00.000Z"), null);
  assert.equal(
    sanitizeOptionalTimestamptzInput(new Date("0000-06-19T00:00:00.000Z")),
    null
  );
});
