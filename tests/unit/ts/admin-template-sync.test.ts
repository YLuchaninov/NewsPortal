import assert from "node:assert/strict";
import test from "node:test";

import {
  parseInterestTemplateInput,
  saveInterestTemplate,
  syncInterestTemplateCriterion,
  syncInterestTemplateSelectionProfile,
} from "../../../apps/admin/src/lib/server/admin-templates";

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
          time_window_hours: 168,
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
  assert.deepEqual(queryable.calls[2].params?.slice(0, 4), [
    "template-1",
    "AI Policy",
    JSON.stringify(["EU AI act"]),
    JSON.stringify(["sports"]),
  ]);
  assert.equal(queryable.calls[2].params?.[8], 168);
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
          time_window_hours: 336,
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
          time_window_hours: 336,
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
  assert.equal(queryable.calls[2].params?.[8], 336);
  assert.equal(queryable.calls[2].params?.[12], true);
  assert.equal(queryable.calls[2].params?.[13], true);
  assert.equal(queryable.calls[2].params?.[14], "compiled");
  assert.equal(queryable.calls[2].params?.[15], 4);
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
          time_window_hours: 168,
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
          time_window_hours: 168,
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
  assert.equal(queryable.calls[2].params?.[13], false);
  assert.equal(queryable.calls[2].params?.[14], "queued");
  assert.equal(queryable.calls[2].params?.[15], 3);
});

test("syncInterestTemplateCriterion passes through a blank template time window as null", async () => {
  const queryable = createQueryable([
    {
      rows: [
        {
          interest_template_id: "template-4",
          name: "Long-tail sourcing",
          description: "",
          positive_texts: ["Need a delivery partner"],
          negative_texts: ["vendor blog"],
          must_have_terms: [],
          must_not_have_terms: [],
          places: [],
          languages_allowed: ["en"],
          time_window_hours: null,
          short_tokens_required: [],
          short_tokens_forbidden: [],
          priority: 1,
          is_active: true,
        },
      ],
    },
    { rows: [] },
    {
      rows: [
        {
          criterion_id: "criterion-4",
          version: 1,
        },
      ],
    },
  ]);

  const result = await syncInterestTemplateCriterion(queryable as any, "template-4");

  assert.deepEqual(result, {
    criterionId: "criterion-4",
    version: 1,
    created: true,
    compileRequested: true,
  });
  assert.equal(queryable.calls[2].params?.[8], null);
});

test("syncInterestTemplateSelectionProfile inserts a compatibility profile for an active template", async () => {
  const queryable = createQueryable([
    {
      rows: [
        {
          interest_template_id: "template-profile-1",
          name: "AI Policy",
          description: "Policy changes around AI",
          positive_texts: ["EU AI act"],
          negative_texts: ["sports"],
          must_have_terms: ["policy"],
          must_not_have_terms: ["football"],
          places: ["Brussels"],
          languages_allowed: ["en"],
          time_window_hours: 168,
          allowed_content_kinds: ["editorial", "document"],
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
          criterion_id: "criterion-profile-1",
          description: "AI Policy",
        },
      ],
    },
    {
      rows: [
        {
          selection_profile_id: "profile-1",
          version: 1,
        },
      ],
    },
  ]);

  const result = await syncInterestTemplateSelectionProfile(
    queryable as any,
    "template-profile-1",
    {
      interestTemplateId: "template-profile-1",
      name: "AI Policy",
      description: "Policy changes around AI",
      positiveTexts: ["EU AI act", "AI regulation package"],
      negativeTexts: ["sports"],
      mustHaveTerms: ["policy"],
      mustNotHaveTerms: ["football"],
      places: ["Brussels"],
      languagesAllowed: ["en"],
      timeWindowHours: 168,
      allowedContentKinds: ["editorial", "document"],
      shortTokensRequired: ["AI"],
      shortTokensForbidden: ["NBA"],
      candidatePositiveSignals: [],
      candidateNegativeSignals: [],
      selectionProfileStrictness: "broad",
      selectionProfileUnresolvedDecision: "reject",
      selectionProfileLlmReviewMode: "disabled",
      priority: 0.9,
      isActive: true,
    }
  );

  assert.deepEqual(result, {
    selectionProfileId: "profile-1",
    version: 1,
    created: true,
  });
  assert.equal(queryable.calls.length, 4);
  assert.deepEqual(queryable.calls[3].params?.slice(0, 4), [
    "template-profile-1",
    "criterion-profile-1",
    "AI Policy",
    "Policy changes around AI",
  ]);
  assert.equal(queryable.calls[3].params?.[10], "active");
  assert.deepEqual(
    JSON.parse(String(queryable.calls[3].params?.[6] ?? "{}")).candidateSignals,
    {
      positiveGroups: [],
      negativeGroups: [],
    }
  );
  assert.deepEqual(JSON.parse(String(queryable.calls[3].params?.[7] ?? "{}")), {
    strictness: "broad",
    unresolvedDecision: "reject",
    llmReviewMode: "disabled",
    finalSelectionMode: "compatibility_system_selected",
    priority: 0.9,
    allowedContentKinds: ["editorial", "document"],
  });
});

test("syncInterestTemplateSelectionProfile bumps version when compatibility payload changes", async () => {
  const queryable = createQueryable([
    {
      rows: [
        {
          interest_template_id: "template-profile-2",
          name: "AI Safety",
          description: "",
          positive_texts: ["AI safety bill", "model audit rules"],
          negative_texts: ["gaming laptops"],
          must_have_terms: ["safety"],
          must_not_have_terms: [],
          places: ["EU"],
          languages_allowed: ["en"],
          time_window_hours: 168,
          allowed_content_kinds: ["editorial"],
          short_tokens_required: ["AI"],
          short_tokens_forbidden: [],
          priority: 1,
          is_active: false,
        },
      ],
    },
    {
      rows: [
        {
          selection_profile_id: "profile-2",
          source_criterion_id: "criterion-profile-2",
          name: "AI Safety",
          description: "",
          profile_scope: "system",
          profile_family: "compatibility_interest_template",
          definition_json: {
            description: "",
            positiveDefinitions: ["AI safety bill"],
            negativeDefinitions: ["gaming laptops"],
            requiredEvidence: {
              mustHaveTerms: ["safety"],
              shortTokensRequired: ["AI"],
            },
            forbiddenEvidence: {
              mustNotHaveTerms: [],
              shortTokensForbidden: [],
            },
            constraints: {
              places: ["EU"],
              languagesAllowed: ["en"],
              timeWindowHours: 168,
            },
            compatibility: {
              source: "interest_template",
              sourceInterestTemplateId: "template-profile-2",
              sourceCriterionId: "criterion-profile-2",
              sourceCriterionDescription: "AI Safety",
            },
          },
          policy_json: {
            strictness: "balanced",
            unresolvedDecision: "hold",
            llmReviewMode: "always",
            finalSelectionMode: "compatibility_system_selected",
            priority: 1,
            allowedContentKinds: ["editorial"],
          },
          facets_json: [],
          bindings_json: {
            sourceBindingMode: "compatibility_system_template",
            allowedContentKinds: ["editorial"],
            compatibility: {
              sourceInterestTemplateId: "template-profile-2",
              sourceCriterionId: "criterion-profile-2",
            },
          },
          status: "active",
          version: 2,
        },
      ],
    },
    {
      rows: [
        {
          criterion_id: "criterion-profile-2",
          description: "AI Safety",
        },
      ],
    },
    { rows: [] },
  ]);

  const result = await syncInterestTemplateSelectionProfile(
    queryable as any,
    "template-profile-2"
  );

  assert.deepEqual(result, {
    selectionProfileId: "profile-2",
    version: 3,
    created: false,
  });
  assert.equal(queryable.calls.length, 4);
  assert.equal(queryable.calls[3].params?.[0], "profile-2");
  assert.equal(queryable.calls[3].params?.[10], "archived");
  assert.equal(queryable.calls[3].params?.[11], 3);
});

test("parseInterestTemplateInput accepts blank time_window_hours as any-time and falls back to default content kinds", () => {
  const blankParsed = parseInterestTemplateInput({
    name: "Evergreen demand",
    positive_texts: "Looking for an agency",
    time_window_hours: "",
  });

  assert.equal(blankParsed.timeWindowHours, null);
  assert.ok(blankParsed.allowedContentKinds.includes("editorial"));

  const parsed = parseInterestTemplateInput({
    name: "Outsourcing demand",
    positive_texts: "Looking for an agency\nRFP for MVP build",
    time_window_hours: "336",
    priority: "0.8",
  });

  assert.equal(parsed.timeWindowHours, 336);
  assert.equal(parsed.priority, 0.8);
  assert.ok(parsed.allowedContentKinds.includes("editorial"));
  assert.ok(parsed.allowedContentKinds.includes("document"));
  assert.deepEqual(parsed.candidatePositiveSignals, []);
  assert.deepEqual(parsed.candidateNegativeSignals, []);
  assert.equal(parsed.selectionProfileStrictness, "balanced");
  assert.equal(parsed.selectionProfileUnresolvedDecision, "hold");
  assert.equal(parsed.selectionProfileLlmReviewMode, "always");
});

test("parseInterestTemplateInput preserves fine-grained priority decimals and accepts comma decimals", () => {
  const dotParsed = parseInterestTemplateInput({
    name: "Outsourcing demand",
    positive_texts: "Looking for an agency\nRFP for MVP build",
    priority: "0.845",
  });

  const commaParsed = parseInterestTemplateInput({
    name: "Outsourcing demand",
    positive_texts: "Looking for an agency\nRFP for MVP build",
    priority: "0,95",
  });

  assert.equal(dotParsed.priority, 0.845);
  assert.equal(commaParsed.priority, 0.95);
});

test("parseInterestTemplateInput accepts grouped candidate signal cues", () => {
  const parsed = parseInterestTemplateInput({
    name: "Outsourcing demand",
    positive_texts: "Looking for an agency\nRFP for MVP build",
    selection_profile_strictness: "strict",
    selection_profile_unresolved_decision: "reject",
    selection_profile_llm_review_mode: "optional_high_value_only",
    candidate_positive_signals:
      "request_search: looking for | need help | seeking\nexternal_delivery: implementation partner | systems integrator",
    candidate_negative_signals:
      "hiring_noise: hiring | recruiter | career page\nmarketplace_noise: freelancer | per hour | bids",
  });

  assert.deepEqual(parsed.candidatePositiveSignals, [
    {
      name: "request_search",
      cues: ["looking for", "need help", "seeking"],
    },
    {
      name: "external_delivery",
      cues: ["implementation partner", "systems integrator"],
    },
  ]);
  assert.deepEqual(parsed.candidateNegativeSignals, [
    {
      name: "hiring_noise",
      cues: ["hiring", "recruiter", "career page"],
    },
    {
      name: "marketplace_noise",
      cues: ["freelancer", "per hour", "bids"],
    },
  ]);
  assert.equal(parsed.selectionProfileStrictness, "strict");
  assert.equal(parsed.selectionProfileUnresolvedDecision, "reject");
  assert.equal(parsed.selectionProfileLlmReviewMode, "optional_high_value_only");
});

test("saveInterestTemplate keeps json casts aligned around nullable time windows on create", async () => {
  const queryable = createQueryable([{ rows: [] }]);

  const result = await saveInterestTemplate(queryable as any, {
    name: "Outsourcing demand",
    description: "trace create path",
    positiveTexts: ["Need an agency"],
    negativeTexts: ["sports"],
    mustHaveTerms: ["agency"],
    mustNotHaveTerms: ["sports"],
    places: ["Warsaw"],
    languagesAllowed: ["en"],
    timeWindowHours: null,
    allowedContentKinds: ["editorial", "document"],
    shortTokensRequired: ["AI"],
    shortTokensForbidden: ["NBA"],
    candidatePositiveSignals: [],
    candidateNegativeSignals: [],
    selectionProfileStrictness: "balanced",
    selectionProfileUnresolvedDecision: "hold",
    selectionProfileLlmReviewMode: "always",
    priority: 1,
    isActive: true,
  });

  assert.equal(result.created, true);
  assert.equal(queryable.calls.length, 1);
  assert.equal(queryable.calls[0]?.params?.[8], JSON.stringify(["en"]));
  assert.equal(queryable.calls[0]?.params?.[9], null);
  assert.equal(queryable.calls[0]?.params?.[10], JSON.stringify(["editorial", "document"]));
  assert.match(
    String(queryable.calls[0]?.sql ?? ""),
    /\$9::jsonb,\s+\$10,\s+\$11::jsonb,\s+\$12::jsonb,\s+\$13::jsonb/s
  );
});
