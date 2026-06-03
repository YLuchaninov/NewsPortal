import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCoverageFirstAutoplan,
  buildCoverageFirstIterationRecommendation,
  classifySourceFamily,
  classifySourceLifecycleLabel,
  getSourceFamilyCoverageWithPool,
} from "../../../packages/control-plane/src/source-families.ts";

test("source family classifier separates query RSS, marketplace, search, and forums", () => {
  assert.equal(
    classifySourceFamily({ providerType: "rss", fetchUrl: "https://news.google.com/rss/search?q=test" }),
    "query_rss_google_news",
  );
  assert.equal(
    classifySourceFamily({ providerType: "rss", fetchUrl: "https://hnrss.org/newest?q=contractor" }),
    "query_rss_hnrss",
  );
  assert.equal(
    classifySourceFamily({ providerType: "api", adapterKey: "peopleperhour_public_projects_research" }),
    "marketplace_api",
  );
  assert.equal(
    classifySourceFamily({ providerType: "api", adapterKey: "ddgs_search", sourceRole: "indirect_aggregator" }),
    "indirect_search",
  );
  assert.equal(
    classifySourceFamily({ providerType: "api", adapterKey: "stack_exchange_search" }),
    "forum_support",
  );
});

test("working noisy semantic channels remain retained instead of disabled", () => {
  const label = classifySourceLifecycleLabel({
    providerType: "rss",
    sourceRole: "community_search",
    fetchUrl: "https://hnrss.org/newest?q=project",
    isActive: true,
    lastSuccessAt: "2026-05-11T10:00:00.000Z",
    runCount7d: 4,
    failureCount7d: 0,
    selectedRows: 0,
    grayRows: 12,
    rejectedRows: 200,
    articleCount: 212,
  });

  assert.equal(label, "working_noisy_semantic_match");
});

test("low-yield and negative-control working sources are not auto-disable candidates", () => {
  assert.equal(
    classifySourceLifecycleLabel({
      providerType: "rss",
      fetchUrl: "https://example.com/feed.xml",
      isActive: true,
      lastSuccessAt: "2026-05-11T10:00:00.000Z",
      selectedRows: 0,
      articleCount: 0,
    }),
    "working_low_yield",
  );
  assert.equal(
    classifySourceLifecycleLabel({
      providerType: "rss",
      fetchUrl: "https://example.com/feed.xml",
      isActive: true,
      configJson: { discovery: { negativeControl: true } },
    }),
    "negative_control_useful",
  );
});

test("technical provider-shape and fetch failures go to repair labels", () => {
  assert.equal(
    classifySourceLifecycleLabel({
      providerType: "rss",
      fetchUrl: "https://example.com/about",
      isActive: true,
    }),
    "provider_shape_mismatch",
  );
  assert.equal(
    classifySourceLifecycleLabel({
      providerType: "rss",
      fetchUrl: "https://example.com/feed.xml",
      isActive: true,
      lastOutcomeKind: "hard_failure",
      consecutiveFailures: 4,
    }),
    "technical_bottleneck",
  );
});

test("coverage-first autoplan forbids source-derived selection and auto-disabling", () => {
  const coverage = {
    generatedAt: "2026-05-11T10:00:00.000Z",
    families: [],
    missingFamilies: ["query_rss_reddit" as const, "forum_support" as const],
    lifecycleCounts: [],
    retainedWorkingNoisyChannels: 7,
    retainedWorkingLowYieldChannels: 3,
    negativeControlUsefulChannels: 2,
    technicalRepairChannels: 1,
    operatorDisabledChannels: 0,
    risks: ["missingSourceFamilies"],
    autoDisablePolicy: {
      semanticNoisyAutoDisableAllowed: false as const,
      lowYieldAutoDisableAllowed: false as const,
      negativeControlAutoDisableAllowed: false as const,
      automaticActionsAllowed: ["label"],
      operatorDisableRequiresExplicitReason: true as const,
    },
    recommendations: [],
    nextReadBack: [],
  };

  const plan = buildCoverageFirstAutoplan({ objective: "rare buyer demand", coverage, maxNewChannels: 20 });
  assert.equal((plan.selectionTuningPlan as Record<string, unknown>).sourceMetadataCanSelect, false);
  assert.equal((plan.negativeControlPlan as Record<string, unknown>).autoDisableAllowed, false);
  assert.equal((plan.coverageExpansionPlan as unknown[]).length, 2);

  const recommendation = buildCoverageFirstIterationRecommendation({
    objective: "rare buyer demand",
    coverage: {
      ...coverage,
      recommendations: [{ action: "retain_and_measure", sourceFamily: "forum_support" }],
    },
  });
  assert.equal(
    (recommendation.decisionPolicy as Record<string, unknown>).autoDisableWorkingNoisySources,
    false,
  );
});

test("source-family coverage read model reports retained noisy sources", async () => {
  const pool = {
    async query(sql: string) {
      if (/from source_channels sc/i.test(sql)) {
        return {
          rows: [
            {
              channelId: "11111111-1111-4111-8111-111111111111",
              name: "HN query",
              providerType: "rss",
              adapterKey: null,
              researchMode: null,
              tosRisk: null,
              sourceRole: "community_search",
              fetchUrl: "https://hnrss.org/newest?q=project",
              isActive: true,
              pollIntervalSeconds: 3600,
              effectivePollIntervalSeconds: 3600,
              lastSuccessAt: new Date("2026-05-11T10:00:00.000Z"),
              lastErrorText: null,
              lastOutcomeKind: "new_content",
              lastHttpStatus: 200,
              consecutiveFailures: 0,
              runCount7d: 3,
              failureCount7d: 0,
              newItemCount7d: 25,
              articleCount: 25,
              webResourceCount: 0,
              selectedRows: 0,
              grayRows: 3,
              rejectedRows: 22,
              configJson: {},
            },
            {
              channelId: "22222222-2222-4222-8222-222222222222",
              name: "Bad RSS",
              providerType: "rss",
              adapterKey: null,
              researchMode: null,
              tosRisk: null,
              sourceRole: null,
              fetchUrl: "https://example.com/about",
              isActive: true,
              pollIntervalSeconds: 3600,
              effectivePollIntervalSeconds: 3600,
              lastSuccessAt: null,
              lastErrorText: null,
              lastOutcomeKind: null,
              lastHttpStatus: null,
              consecutiveFailures: 0,
              runCount7d: 0,
              failureCount7d: 0,
              newItemCount7d: 0,
              articleCount: 0,
              webResourceCount: 0,
              selectedRows: 0,
              grayRows: 0,
              rejectedRows: 0,
              configJson: {},
            },
          ],
        };
      }
      if (/from source_inventory/i.test(sql)) {
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };

  const coverage = await getSourceFamilyCoverageWithPool(pool as never, { includeExamples: true });
  assert.equal(coverage.retainedWorkingNoisyChannels, 1);
  assert.equal(coverage.autoDisablePolicy.semanticNoisyAutoDisableAllowed, false);
  assert.ok(
    coverage.families.some(
      (family) => family.sourceFamily === "query_rss_hnrss" && family.workingNoisySemanticMatch === 1,
    ),
  );
  assert.ok(coverage.technicalRepairChannels > 0);
});
