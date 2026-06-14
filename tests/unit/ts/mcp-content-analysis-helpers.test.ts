import assert from "node:assert/strict";
import test from "node:test";

import {
  expectedShapeForSchema,
  normalizeContentAnalysisBackfillPayload,
  readEntityIds,
  readStringArray,
} from "../../../runtime/node/services/mcp/src/tools/content-analysis-helpers.ts";

test("content analysis helper normalizes bounded backfill list fields", () => {
  assert.deepEqual(
    normalizeContentAnalysisBackfillPayload({
      subjectTypes: "signal_candidate,web_resource",
      modules: ["ner", "content_filter"],
      subjectIds: "doc-1, doc-2",
    }),
    {
      subjectTypes: ["signal_candidate", "web_resource"],
      modules: ["ner", "content_filter"],
      subjectIds: ["doc-1", "doc-2"],
    },
  );

  assert.throws(
    () => normalizeContentAnalysisBackfillPayload({ subjectTypes: "invalid" }),
    /unsupported value "invalid"/,
  );
});

test("content analysis helper exposes stable schema shape summaries", () => {
  assert.deepEqual(
    expectedShapeForSchema({
      type: "object",
      required: ["payload"],
      properties: {
        payload: { type: "object" },
      },
      additionalProperties: false,
    }),
    {
      type: "object",
      required: ["payload"],
      allowedProperties: ["payload"],
      additionalProperties: false,
    },
  );
});

test("content analysis helper reads arrays and entity id maps defensively", () => {
  assert.deepEqual(readStringArray(["doc-1", "", null, "doc-2"]), ["doc-1", "doc-2"]);
  assert.deepEqual(readStringArray("doc-1"), []);
  assert.deepEqual(readEntityIds({ entityIds: { docIds: ["doc-1"] } }), { docIds: ["doc-1"] });
  assert.deepEqual(readEntityIds({ entityIds: ["doc-1"] }), {});
});
