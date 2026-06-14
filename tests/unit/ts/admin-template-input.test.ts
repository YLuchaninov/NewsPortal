import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeCandidateSignalGroups,
  parseCandidateSignalGroups,
  readTextList,
  slugifyCandidateSignalName,
} from "../../../runtime/node/apps/admin/src/lib/server/admin-template-input.ts";

test("admin template input helpers split list payloads consistently", () => {
  assert.deepEqual(readTextList(["alpha\nbeta", "gamma, delta"], { splitCommas: true }), [
    "alpha",
    "beta",
    "gamma",
    "delta",
  ]);
});

test("admin template input helpers parse candidate signal groups", () => {
  assert.equal(slugifyCandidateSignalName("Buyer intent!", "fallback"), "buyer_intent");
  assert.deepEqual(parseCandidateSignalGroups("Buyer intent: seeking help|rfp\nmigration, upgrade"), [
    { name: "buyer_intent", cues: ["seeking help", "rfp"] },
    { name: "group_2", cues: ["migration", "upgrade"] },
  ]);
});

test("admin template input helpers normalize structured candidate signal groups", () => {
  assert.deepEqual(
    normalizeCandidateSignalGroups([
      { name: "Project Intent", terms: [" migration ", ""] },
      { name: "empty", cues: [] },
    ]),
    [{ name: "project_intent", cues: ["migration"] }],
  );
});
