import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInterestCompileRequestedEvent,
  buildUserInterestUpdatePatch,
  createUserInterest,
  parseUserInterestCreateInput,
} from "../../../apps/web/src/lib/server/user-interests.ts";

type QueryResponse = {
  rowCount?: number;
  rows?: unknown[];
};

function createQueryable(responses: QueryResponse[]) {
  const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
  const queue = [...responses];

  return {
    calls,
    query: async <T>(sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      const next = queue.shift();
      if (!next) {
        throw new Error(`Unexpected query: ${sql}`);
      }
      return {
        rowCount: next.rowCount,
        rows: (next.rows ?? []) as T[],
      };
    },
  };
}

test("parseUserInterestCreateInput applies defaults and clamps priority", () => {
  const input = parseUserInterestCreateInput({
    description: " AI policy ",
    positive_texts: "",
    languages_allowed: "",
    priority: "4.2",
    enabled: "false",
    must_have_terms: "policy, regulation",
  });

  assert.deepEqual(input, {
    description: "AI policy",
    positiveTexts: ["AI policy"],
    negativeTexts: [],
    places: [],
    languagesAllowed: ["en"],
    mustHaveTerms: ["policy", "regulation"],
    mustNotHaveTerms: [],
    shortTokensRequired: [],
    shortTokensForbidden: [],
    priority: 1,
    enabled: false,
  });
});

test("buildUserInterestUpdatePatch only mutates explicitly provided fields", () => {
  const patch = buildUserInterestUpdatePatch({
    description: "   ",
    positive_texts: "AI Act\nEU oversight",
    places: "",
    enabled: "false",
  });

  assert.deepEqual(patch, {
    positiveTexts: ["AI Act", "EU oversight"],
    places: [],
    enabled: false,
  });
  assert.equal("description" in patch, false);
});

test("createUserInterest inserts for the selected owner and returns a queueable compile event", async () => {
  const queryable = createQueryable([{ rows: [] }]);
  const input = parseUserInterestCreateInput({
    description: "Robotics",
    negative_texts: "sports",
    languages_allowed: "en, uk",
  });

  const result = await createUserInterest(
    queryable,
    "user-1",
    input,
    "interest-1"
  );

  assert.deepEqual(result, {
    interestId: "interest-1",
    version: 1,
  });
  assert.deepEqual(queryable.calls[0]?.params?.slice(0, 4), [
    "interest-1",
    "user-1",
    "Robotics",
    JSON.stringify(["Robotics"]),
  ]);
  assert.deepEqual(
    buildInterestCompileRequestedEvent(result.interestId, result.version),
    {
      eventType: "interest.compile.requested",
      aggregateType: "interest",
      aggregateId: "interest-1",
      payload: {
        interestId: "interest-1",
        version: 1,
      },
    }
  );
});
