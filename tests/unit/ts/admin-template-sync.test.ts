import assert from "node:assert/strict";
import test from "node:test";

import { syncInterestTemplateCriterion } from "../../../apps/admin/src/lib/server/admin-templates";

type QueryResponse = { rows: any[] };

function createQueryable(responses: QueryResponse[]) {
  const calls: Array<{ sql: string; params: unknown[] | undefined }> = [];
  const queue = [...responses];

  return {
    calls,
    query: async (sql: string, params?: unknown[]) => {
      calls.push({ sql, params });
      const next = queue.shift();
      if (!next) {
        throw new Error(`Unexpected query: ${sql}`);
      }
      return next;
    },
  };
}

test("syncInterestTemplateCriterion inserts a new queued criterion for an active template", async () => {
  const queryable = createQueryable([
    {
      rows: [
        {
          interest_template_id: "template-1",
          name: "AI Policy",
          description: "Policy changes around AI",
          positive_texts: ["EU AI act"],
          negative_texts: ["sports"],
          must_have_terms: ["policy"],
          must_not_have_terms: ["football"],
          places: ["Brussels"],
          languages_allowed: ["en"],
          short_tokens_required: ["AI"],
          short_tokens_forbidden: ["NBA"],
          priority: 0.9,
          is_active: true,
        },
      ],
    },
    { rows: [] },
    {
      rows: [
        {
          criterion_id: "criterion-1",
          version: 1,
        },
      ],
    },
  ]);

  const result = await syncInterestTemplateCriterion(queryable as any, "template-1");

  assert.deepEqual(result, {
    criterionId: "criterion-1",
    version: 1,
    created: true,
    compileRequested: true,
  });
  assert.equal(queryable.calls.length, 3);
  assert.deepEqual(queryable.calls[2].params?.slice(0, 3), [
    "template-1",
    "AI Policy",
    JSON.stringify(["EU AI act"]),
  ]);
});

test("syncInterestTemplateCriterion preserves compiled criteria on pure activation toggles", async () => {
  const queryable = createQueryable([
    {
      rows: [
        {
          interest_template_id: "template-2",
          name: "Crisis Watch",
          description: "",
          positive_texts: ["Crisis watch"],
          negative_texts: ["celebrity gossip"],
          must_have_terms: [],
          must_not_have_terms: [],
          places: [],
          languages_allowed: ["en"],
          short_tokens_required: [],
          short_tokens_forbidden: [],
          priority: 1,
          is_active: true,
        },
      ],
    },
    {
      rows: [
        {
          criterion_id: "criterion-2",
          version: 4,
          description: "Crisis Watch",
          positive_texts: ["Crisis watch"],
          negative_texts: ["celebrity gossip"],
          must_have_terms: [],
          must_not_have_terms: [],
          places: [],
          languages_allowed: ["en"],
          short_tokens_required: [],
          short_tokens_forbidden: [],
          priority: 1,
          enabled: false,
          compiled: true,
          compile_status: "compiled",
        },
      ],
    },
    { rows: [] },
  ]);

  const result = await syncInterestTemplateCriterion(queryable as any, "template-2");

  assert.deepEqual(result, {
    criterionId: "criterion-2",
    version: 4,
    created: false,
    compileRequested: false,
  });
  assert.equal(queryable.calls.length, 3);
  assert.equal(queryable.calls[2].params?.[11], true);
  assert.equal(queryable.calls[2].params?.[12], true);
  assert.equal(queryable.calls[2].params?.[13], "compiled");
  assert.equal(queryable.calls[2].params?.[14], 4);
});

test("syncInterestTemplateCriterion queues recompilation when active template content changes", async () => {
  const queryable = createQueryable([
    {
      rows: [
        {
          interest_template_id: "template-3",
          name: "AI Safety",
          description: "",
          positive_texts: ["AI safety bill", "model audit rules"],
          negative_texts: ["gaming laptops"],
          must_have_terms: ["safety"],
          must_not_have_terms: [],
          places: ["EU"],
          languages_allowed: ["en"],
          short_tokens_required: ["AI"],
          short_tokens_forbidden: [],
          priority: 1,
          is_active: true,
        },
      ],
    },
    {
      rows: [
        {
          criterion_id: "criterion-3",
          version: 2,
          description: "AI Safety",
          positive_texts: ["AI safety bill"],
          negative_texts: ["gaming laptops"],
          must_have_terms: ["safety"],
          must_not_have_terms: [],
          places: ["EU"],
          languages_allowed: ["en"],
          short_tokens_required: ["AI"],
          short_tokens_forbidden: [],
          priority: 1,
          enabled: true,
          compiled: true,
          compile_status: "compiled",
        },
      ],
    },
    { rows: [] },
  ]);

  const result = await syncInterestTemplateCriterion(queryable as any, "template-3");

  assert.deepEqual(result, {
    criterionId: "criterion-3",
    version: 3,
    created: false,
    compileRequested: true,
  });
  assert.equal(queryable.calls[2].params?.[12], false);
  assert.equal(queryable.calls[2].params?.[13], "queued");
  assert.equal(queryable.calls[2].params?.[14], 3);
});
