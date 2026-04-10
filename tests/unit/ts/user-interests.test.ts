import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInterestCompileRequestedEvent,
  buildUserInterestUpdatePatch,
  createUserInterest,
  parseUserInterestCreateInput,
  updateUserInterest,
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
    time_window_hours: "",
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
    timeWindowHours: null,
    mustHaveTerms: ["policy", "regulation"],
    mustNotHaveTerms: [],
    shortTokensRequired: [],
    shortTokensForbidden: [],
    priority: 1,
    enabled: false,
  });
});

test("parseUserInterestCreateInput accepts newline-delimited advanced fields and numeric time windows", () => {
  const input = parseUserInterestCreateInput({
    description: "AI procurement",
    positive_texts: "",
    languages_allowed: "en\npl",
    time_window_hours: "240",
    must_have_terms: "policy\nprocurement",
    must_not_have_terms: "sports,celebrity",
    short_tokens_required: "AI\nEU",
    short_tokens_forbidden: "NBA, NFL",
  });

  assert.deepEqual(input.languagesAllowed, ["en", "pl"]);
  assert.equal(input.timeWindowHours, 240);
  assert.deepEqual(input.mustHaveTerms, ["policy", "procurement"]);
  assert.deepEqual(input.mustNotHaveTerms, ["sports", "celebrity"]);
  assert.deepEqual(input.shortTokensRequired, ["AI", "EU"]);
  assert.deepEqual(input.shortTokensForbidden, ["NBA", "NFL"]);
});

test("buildUserInterestUpdatePatch only mutates explicitly provided fields", () => {
  const patch = buildUserInterestUpdatePatch({
    description: "   ",
    positive_texts: "AI Act\nEU oversight",
    places: "",
    must_have_terms: "policy\nprocurement",
    time_window_hours: "",
    enabled: "false",
  });

  assert.deepEqual(patch, {
    positiveTexts: ["AI Act", "EU oversight"],
    places: [],
    mustHaveTerms: ["policy", "procurement"],
    timeWindowHours: null,
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
    time_window_hours: "336",
    must_have_terms: "robotics\nautomation",
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
  assert.equal(queryable.calls[0]?.params?.[7], 336);
  assert.equal(queryable.calls[0]?.params?.[8], JSON.stringify(["robotics", "automation"]));
  assert.match(
    String(queryable.calls[0]?.sql ?? ""),
    /\$7::jsonb,\s+\$8,\s+\$9::jsonb,\s+\$10::jsonb,\s+\$11::jsonb,\s+\$12::jsonb/s
  );
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

test("updateUserInterest clears time_window_hours when the patch explicitly sets it to null", async () => {
  const queryable = createQueryable([
    {
      rows: [
        {
          interest_id: "interest-1",
          version: 2,
          description: "AI procurement",
          positive_texts: ["AI procurement"],
          negative_texts: [],
          places: ["Warsaw"],
          languages_allowed: ["en"],
          time_window_hours: 240,
          must_have_terms: ["policy"],
          must_not_have_terms: [],
          short_tokens_required: ["AI"],
          short_tokens_forbidden: [],
          priority: 1,
          enabled: true,
        },
      ],
    },
    { rows: [] },
  ]);

  const result = await updateUserInterest(queryable as any, "interest-1", "user-1", {
    timeWindowHours: null,
  });

  assert.deepEqual(result, {
    interestId: "interest-1",
    version: 3,
  });
  assert.equal(queryable.calls[1]?.params?.[7], null);
});
