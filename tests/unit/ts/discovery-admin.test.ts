import assert from "node:assert/strict";
import test from "node:test";

import { readRuntimeConfig } from "../../../packages/config/src/index.ts";
import { createNewsPortalSdk } from "../../../packages/sdk/src/index.ts";
import {
  buildDiscoveryProfileCreateApiPayload,
  buildDiscoveryProfileUpdateApiPayload,
  buildDiscoveryAuditPayload,
  buildDiscoveryCandidateReviewApiPayload,
  buildDiscoveryFeedbackApiPayload,
  buildDiscoveryHypothesisClassCreateApiPayload,
  buildDiscoveryMissionCreateApiPayload,
  buildDiscoveryMissionUpdateApiPayload,
  buildDiscoveryRecallMissionCreateApiPayload,
  buildDiscoveryRecallMissionUpdateApiPayload,
  normalizeAuditEntityId,
  parseProviderTypes,
  parseTextList,
  resolveDiscoveryIntent,
} from "../../../apps/admin/src/pages/bff/admin/discovery.ts";

test("listDiscoverySourceInterestScores preserves filters and pagination params", async () => {
  let requestedUrl = "";
  const sdk = createNewsPortalSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return new Response(
        JSON.stringify({
          items: [],
          page: 2,
          pageSize: 12,
          total: 18,
          totalPages: 2,
          hasNext: false,
          hasPrev: true,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      );
    }) as typeof fetch,
  });

  await sdk.listDiscoverySourceInterestScores<Record<string, unknown>>({
    missionId: "mission-1",
    minScore: 0.8,
    page: 2,
    pageSize: 12,
  });

  assert.equal(
    requestedUrl,
    "http://api.example.test/maintenance/discovery/source-interest-scores?missionId=mission-1&minScore=0.8&page=2&pageSize=12"
  );
});

test("BFF discovery helpers normalize graph-first form inputs and registry intents", () => {
  assert.deepEqual(parseTextList(" AI\n\n policy \nEurope "), ["AI", "policy", "Europe"]);
  assert.deepEqual(parseProviderTypes("rss, website ,rss"), ["rss", "website", "rss"]);
  assert.deepEqual(parseProviderTypes(""), ["rss", "website", "api", "email_imap", "youtube"]);
  assert.equal(resolveDiscoveryIntent({ intent: "compile_graph" }), "compile_graph");
  assert.equal(resolveDiscoveryIntent({ intent: "archive_mission" }), "archive_mission");
  assert.equal(resolveDiscoveryIntent({ intent: "delete_class" }), "delete_class");
  assert.equal(resolveDiscoveryIntent({ intent: "create_profile" }), "create_profile");
  assert.equal(resolveDiscoveryIntent({ intent: "update_recall_mission" }), "update_recall_mission");
  assert.equal(resolveDiscoveryIntent({ intent: "unexpected" }), "create_mission");
  assert.equal(normalizeAuditEntityId("acceptance_class"), null);
  assert.equal(
    normalizeAuditEntityId("550e8400-e29b-41d4-a716-446655440000"),
    "550e8400-e29b-41d4-a716-446655440000"
  );
});

test("readRuntimeConfig defaults discovery runtime to ddgs with dedicated model and monthly quota support", () => {
  const defaults = readRuntimeConfig(
    {
      NEWSPORTAL_APP_BASE_URL: "http://127.0.0.1:4321/",
      NEWSPORTAL_API_BASE_URL: "http://127.0.0.1:8000",
      GEMINI_MODEL: "gemini-legacy",
    },
    {}
  );
  assert.equal(defaults.discoverySearchProvider, "ddgs");
  assert.equal(defaults.discoveryLlmModel, "gemini-legacy");
  assert.equal(defaults.discoveryMonthlyBudgetCents, 0);
  assert.equal(defaults.llmReviewEnabled, true);
  assert.equal(defaults.llmReviewMonthlyBudgetCents, 0);
  assert.equal(defaults.llmReviewBudgetExhaustAcceptGrayZone, false);

  const overridden = readRuntimeConfig(
    {
      NEWSPORTAL_APP_BASE_URL: "http://127.0.0.1:4321/",
      NEWSPORTAL_API_BASE_URL: "http://127.0.0.1:8000",
      DISCOVERY_SEARCH_PROVIDER: "stub",
      DISCOVERY_GEMINI_MODEL: "gemini-discovery",
      DISCOVERY_MONTHLY_BUDGET_CENTS: "2500",
      LLM_REVIEW_ENABLED: "0",
      LLM_REVIEW_MONTHLY_BUDGET_CENTS: "900",
      LLM_REVIEW_BUDGET_EXHAUST_ACCEPT_GRAY_ZONE: "1",
    },
    {}
  );
  assert.equal(overridden.discoverySearchProvider, "stub");
  assert.equal(overridden.discoveryLlmModel, "gemini-discovery");
  assert.equal(overridden.discoveryMonthlyBudgetCents, 2500);
  assert.equal(overridden.llmReviewEnabled, false);
  assert.equal(overridden.llmReviewMonthlyBudgetCents, 900);
  assert.equal(overridden.llmReviewBudgetExhaustAcceptGrayZone, true);
});

test("getLlmBudgetSummary uses the new maintenance endpoint", async () => {
  let requestedUrl = "";
  const sdk = createNewsPortalSdk({
    baseUrl: "http://api.example.test",
    fetchImpl: (async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify({ monthlyQuotaReached: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch,
  });

  await sdk.getLlmBudgetSummary<Record<string, unknown>>();

  assert.equal(requestedUrl, "http://api.example.test/maintenance/llm-budget-summary");
});

test("buildDiscoveryMissionCreateApiPayload converts form state into graph-first API payload", () => {
  const payload = buildDiscoveryMissionCreateApiPayload(
    {
      title: "  EU AI sources  ",
      description: "  Look for policy coverage ",
      seedTopics: "AI policy\nBrussels",
      seedLanguages: "en\npl",
      seedRegions: "EU\nPoland",
      targetProviderTypes: "website",
      maxHypotheses: "8",
      maxSources: "12",
      budgetCents: "450",
      priority: "3",
      interestGraph: '{"core_topic":"EU AI","subtopics":["policy"]}',
    },
    "admin-1"
  );

  assert.deepEqual(payload, {
    title: "EU AI sources",
    description: "Look for policy coverage",
    sourceKind: "manual",
    sourceRefId: null,
    seedTopics: ["AI policy", "Brussels"],
    seedLanguages: ["en", "pl"],
    seedRegions: ["EU", "Poland"],
    targetProviderTypes: ["website"],
    interestGraph: { core_topic: "EU AI", subtopics: ["policy"] },
    maxHypotheses: 8,
    maxSources: 12,
    budgetCents: 450,
    priority: 3,
    profileId: null,
    createdBy: "admin-1",
  });
});

test("buildDiscoveryMissionUpdateApiPayload, class payload and feedback payload keep optional fields explicit", () => {
  assert.deepEqual(
    buildDiscoveryMissionUpdateApiPayload({
      status: "archived",
      priority: "2",
      budgetCents: "",
      seedTopics: "",
      targetProviderTypes: "",
      profileId: "",
    }),
    {
      title: undefined,
      description: undefined,
      status: "archived",
      priority: 2,
      budgetCents: undefined,
      maxHypotheses: undefined,
      maxSources: undefined,
      seedTopics: undefined,
      seedLanguages: undefined,
      seedRegions: undefined,
      targetProviderTypes: undefined,
      interestGraph: undefined,
      profileId: null,
    }
  );

  assert.deepEqual(
    buildDiscoveryHypothesisClassCreateApiPayload({
      classKey: "regional_watch",
      displayName: "Regional Watch",
      status: "active",
      generationBackend: "graph_seed_only",
      defaultProviderTypes: "website",
      seedRulesJson: '{"tactics":["regional","local"]}',
      configJson: '{"weight":2}',
    }),
    {
      classKey: "regional_watch",
      displayName: "Regional Watch",
      description: null,
      status: "active",
      generationBackend: "graph_seed_only",
      defaultProviderTypes: ["website"],
      promptInstructions: null,
      seedRulesJson: { tactics: ["regional", "local"] },
      maxPerMission: 3,
      sortOrder: 0,
      configJson: { weight: 2 },
    }
  );

  assert.deepEqual(
    buildDiscoveryCandidateReviewApiPayload(
      {
        status: "rejected",
        rejectionReason: "duplicate homepage",
      },
      "admin-2"
    ),
    {
      status: "rejected",
      reviewedBy: "admin-2",
      rejectionReason: "duplicate homepage",
    }
  );

  assert.deepEqual(
    buildDiscoveryFeedbackApiPayload(
      {
        missionId: "mission-1",
        sourceProfileId: "profile-7",
        feedbackType: "valuable_source",
        feedbackValue: "keep",
        notes: "Strong regional signal",
      },
      "admin-3"
    ),
    {
      missionId: "mission-1",
      candidateId: null,
      sourceProfileId: "profile-7",
      feedbackType: "valuable_source",
      feedbackValue: "keep",
      notes: "Strong regional signal",
      createdBy: "admin-3",
    }
  );
});

test("profile and recall mission builders normalize structured policy and linkage fields", () => {
  assert.deepEqual(
    buildDiscoveryProfileCreateApiPayload(
      {
        profileKey: "editorial_news_default",
        displayName: "Editorial news",
        description: "Structured profile",
        status: "active",
        graphProviderTypes: "rss,website,api",
        graphPreferredDomains: "example.com\nnews.test",
        graphBlockedDomains: "spam.test",
        graphPositiveKeywords: "analysis\npolicy",
        graphNegativeKeywords: "sponsored",
        graphPreferredTactics: "editorial\nofficial",
        graphMinRssReviewScore: "0.71",
        graphMinWebsiteReviewScore: "0.83",
        graphAdvancedPromptInstructions: "Prefer newsroom voice",
        recallProviderTypes: "website,rss,email_imap",
        recallPreferredDomains: "procurement.test",
        recallBlockedDomains: "agency.test",
        recallPositiveKeywords: "rfp",
        recallNegativeKeywords: "for hire",
        recallPreferredTactics: "buyer_signal",
        recallMinPromotionScore: "0.66",
        recallAdvancedPromptInstructions: "Prefer buyer-side notices",
        benchmarkDomains: "benchmark.test",
        benchmarkTitleKeywords: "release notes",
        benchmarkTacticKeywords: "editorial",
      },
      "admin-4"
    ),
    {
      profileKey: "editorial_news_default",
      displayName: "Editorial news",
      description: "Structured profile",
      status: "active",
      graphPolicyJson: {
        providerTypes: ["rss", "website"],
        preferredDomains: ["example.com", "news.test"],
        blockedDomains: ["spam.test"],
        positiveKeywords: ["analysis", "policy"],
        negativeKeywords: ["sponsored"],
        preferredTactics: ["editorial", "official"],
        minRssReviewScore: 0.71,
        minWebsiteReviewScore: 0.83,
        advancedPromptInstructions: "Prefer newsroom voice",
      },
      recallPolicyJson: {
        providerTypes: ["website", "rss"],
        preferredDomains: ["procurement.test"],
        blockedDomains: ["agency.test"],
        positiveKeywords: ["rfp"],
        negativeKeywords: ["for hire"],
        preferredTactics: ["buyer_signal"],
        minPromotionScore: 0.66,
        advancedPromptInstructions: "Prefer buyer-side notices",
      },
      yieldBenchmarkJson: {
        domains: ["benchmark.test"],
        titleKeywords: ["release notes"],
        tacticKeywords: ["editorial"],
      },
      createdBy: "admin-4",
    }
  );

  assert.deepEqual(
    buildDiscoveryProfileUpdateApiPayload({
      displayName: "Updated profile",
      status: "archived",
      graphProviderTypes: "rss,website",
      recallProviderTypes: "rss",
    }),
    {
      displayName: "Updated profile",
      description: undefined,
      status: "archived",
      graphPolicyJson: {
        providerTypes: ["rss", "website"],
      },
      recallPolicyJson: {
        providerTypes: ["rss"],
      },
      yieldBenchmarkJson: undefined,
    }
  );

  assert.deepEqual(
    buildDiscoveryRecallMissionCreateApiPayload(
      {
        title: "Recall",
        description: "Recall mission",
        missionKind: "query_seed",
        seedDomains: "example.test",
        seedUrls: "https://example.test/feed.xml",
        seedQueries: "developer tools",
        targetProviderTypes: "rss,website",
        scopeJson: '{"regions":["EU"]}',
        maxCandidates: "7",
        profileId: "profile-1",
      },
      "admin-5"
    ),
    {
      title: "Recall",
      description: "Recall mission",
      missionKind: "query_seed",
      seedDomains: ["example.test"],
      seedUrls: ["https://example.test/feed.xml"],
      seedQueries: ["developer tools"],
      targetProviderTypes: ["rss", "website"],
      scopeJson: { regions: ["EU"] },
      maxCandidates: 7,
      profileId: "profile-1",
      createdBy: "admin-5",
    }
  );

  assert.deepEqual(
    buildDiscoveryRecallMissionUpdateApiPayload({
      status: "paused",
      profileId: "",
      maxCandidates: "3",
    }),
    {
      title: undefined,
      description: undefined,
      missionKind: undefined,
      seedDomains: undefined,
      seedUrls: undefined,
      seedQueries: undefined,
      targetProviderTypes: undefined,
      scopeJson: undefined,
      maxCandidates: 3,
      status: "paused",
      profileId: null,
    }
  );
});

test("buildDiscoveryAuditPayload captures per-intent adaptive details", () => {
  assert.deepEqual(
    buildDiscoveryAuditPayload(
      "create_mission",
      { title: "Discovery mission", seedTopics: "AI\npolicy", profileId: "profile-1" },
      { mission_id: "mission-9" }
    ),
    {
      title: "Discovery mission",
      missionId: "mission-9",
      seedTopics: ["AI", "policy"],
      profileId: "profile-1",
    }
  );

  assert.deepEqual(
    buildDiscoveryAuditPayload(
      "create_profile",
      { profileKey: "editorial_default", displayName: "Editorial default" },
      { profile_id: "profile-9", status: "active", version: 3 }
    ),
    {
      profileId: "profile-9",
      profileKey: "editorial_default",
      displayName: "Editorial default",
      status: "active",
      version: 3,
    }
  );

  assert.deepEqual(
    buildDiscoveryAuditPayload(
      "archive_mission",
      { missionId: "mission-2" },
      { mission_id: "mission-2" }
    ),
    {
      missionId: "mission-2",
      status: "archived",
      priority: undefined,
      budgetCents: undefined,
      profileId: null,
    }
  );

  assert.deepEqual(
    buildDiscoveryAuditPayload(
      "compile_graph",
      { missionId: "mission-3" },
      { interest_graph_status: "compiled", interest_graph_version: 2 }
    ),
    {
      missionId: "mission-3",
      interestGraphStatus: "compiled",
      interestGraphVersion: 2,
    }
  );
});
