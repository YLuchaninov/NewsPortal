import assert from "node:assert/strict";
import test from "node:test";

import {
  assertDiscoveryVNextPayload,
  DISCOVERY_VNEXT_ARTIFACT_ENVELOPE_SCHEMA,
  validateDiscoveryVNextPayload,
} from "../../../packages/contracts/src/discovery-vnext";
import { validateJsonSchema } from "../../../packages/contracts/src/schema";

test("Discovery vNext envelope schema accepts typed artifact lineage", () => {
  const issues = validateJsonSchema(
    {
      artifactType: "DiscoveryBrief",
      schemaVersion: "1.0",
      runId: null,
      interestId: "interest-1",
      candidateId: null,
      parentArtifactIds: [],
      createdBy: "system",
      creatorModel: null,
      memoryMode: "thin",
      lens: null,
      policyVersion: null,
      status: "generated",
      validation: { schemaValid: true, policyValid: true, errors: [] },
      payload: { goal: "Find public evidence." },
    },
    DISCOVERY_VNEXT_ARTIFACT_ENVELOPE_SCHEMA
  );

  assert.deepEqual(issues, []);
});

test("DiscoveryBrief payload schema requires signals and constraints", () => {
  const issues = validateDiscoveryVNextPayload("DiscoveryBrief", {
    goal: "Find public evidence.",
    desiredSignals: [],
    negativeSignals: [],
    artifactExpectations: ["article"],
    freshnessNeed: "normal",
  });

  assert.ok(issues.some((issue) => issue.path === "constraints"));
});

test("SourceUnderstanding payload requires yieldIndependent flag", () => {
  const issues = validateDiscoveryVNextPayload("SourceUnderstanding", {
    sourceUrl: "https://example.org",
    sourceRoleDescription: "Publishes recurring updates.",
    sourceVoice: "owner_or_operator",
    artifactFreshnessKind: "official_update",
    signalProductionMode: "official_update",
    observedArtifactTypes: ["article"],
    canProduceSignals: [
      {
        signalDescription: "Public update",
        capability: "high",
        directness: "direct",
        evidenceFromProbe: ["listing observed"],
      },
    ],
    artifactFit: 0.8,
    technicalObservability: 0.7,
    evidenceDirectness: 0.7,
    sourceRoleConfidence: 0.8,
    risk: { overallRisk: "low" },
    routingConfidence: 0.8,
    reasonToKeep: "Retain official updates.",
    reasonNotToAutoRegister: "No blocker.",
  });

  assert.ok(issues.some((issue) => issue.path === "yieldIndependent"));
});

test("SourceScopeResolution payload schema accepts resolved source scope", () => {
  const issues = validateDiscoveryVNextPayload("SourceScopeResolution", {
    candidateUrl: "https://example.org/news/2026/launch",
    canonicalCandidateUrl: "https://example.org/news/2026/launch",
    originalCandidateUrl: "https://example.org/news/2026/launch?utm_source=test",
    resolvedSourceUrl: "https://example.org/news",
    sourceScopeType: "section",
    sourceScopeConfidence: 0.82,
    seedItemUrl: "https://example.org/news/2026/launch",
    monitoringEntryUrls: ["https://example.org/news", "https://example.org/feed.xml"],
    itemExtractionHints: {
      itemUrlPattern: "/news/{slug}",
      listingUrlPattern: "/news",
      datePatternObserved: true,
      paginationObserved: false,
      documentLinksObserved: false,
    },
    resolutionEvidence: ["Candidate URL looks like an item detail page."],
    normalizationEvidence: ["Removed tracking query parameter utm_source."],
    notMonitoringReason: null,
    scopeCandidates: [
      {
        url: "https://example.org/news",
        type: "section",
        score: 0.82,
        selected: true,
      },
    ],
    warnings: [],
    risk: { overallRisk: "low" },
  });

  assert.deepEqual(issues, []);
});

test("SourceScopeResolution payload rejects unsupported scope enum", () => {
  const issues = validateDiscoveryVNextPayload("SourceScopeResolution", {
    candidateUrl: "https://example.org",
    resolvedSourceUrl: "https://example.org",
    sourceScopeType: "procurement_portal",
    sourceScopeConfidence: 0.8,
    seedItemUrl: null,
    monitoringEntryUrls: ["https://example.org"],
    itemExtractionHints: {},
    resolutionEvidence: ["scope"],
    risk: {},
  });

  assert.ok(issues.some((issue) => issue.path === "sourceScopeType"));
});

test("ProbePlan payload schema requires bounded limits and disallowed actions", () => {
  const issues = validateDiscoveryVNextPayload("ProbePlan", {
    candidateUrl: "https://example.org",
    probeStrategy: "cheap_static_first",
    checks: ["rss_feed_probe"],
  });

  assert.ok(issues.some((issue) => issue.path === "limits"));
  assert.ok(issues.some((issue) => issue.path === "disallowedActions"));
});

test("ProbeReport payload schema rejects unsupported access patterns", () => {
  assert.throws(
    () =>
      assertDiscoveryVNextPayload("ProbeReport", {
        candidateUrl: "https://example.org",
        accessPattern: "login_bypass",
        technicalObservability: { observable: false },
        probeCost: { requestsAttempted: 0 },
      }),
    /unsupported value/i
  );
});

test("QueryQualityReport payload schema keeps quality enum strict", () => {
  const issues = validateDiscoveryVNextPayload("QueryQualityReport", {
    query: "public updates",
    queryFamilyIntent: "Find public updates.",
    queryPurpose: "find_direct_sources",
    observedResultMix: {},
    quality: "excellent",
  });

  assert.ok(issues.some((issue) => issue.path === "quality"));
});

test("QueryQualityReport payload schema accepts result-mix quality values", () => {
  const issues = validateDiscoveryVNextPayload("QueryQualityReport", {
    query: "public updates",
    queryFamilyIntent: "Find official update sources.",
    queryPurpose: "find_official_owners",
    observedResultMix: { official_or_owner_sources: 2, feeds: 1, duplicates: 0 },
    quality: "useful_for_source_acquisition",
    recommendedNextAction: "probe_top_candidates",
  });

  assert.deepEqual(issues, []);
});

test("RoutingDecision schema accepts inventory_context", () => {
  assertDiscoveryVNextPayload("RoutingDecision", {
    decision: "inventory_context",
    reason: "Context source retained for query expansion.",
    policyVersion: "discovery-routing-vnext-1",
    scoreComponents: {},
    actions: [{ actionType: "retain_for_context" }],
    manualReviewRequired: false,
  });
});

test("RoutingDecision schema rejects unsupported decision values", () => {
  assert.throws(
    () =>
      assertDiscoveryVNextPayload("RoutingDecision", {
        decision: "auto_promote",
        reason: "old v3 action",
        policyVersion: "discovery-routing-vnext-1",
        scoreComponents: {},
        actions: [],
        manualReviewRequired: false,
      }),
    /unsupported value/i
  );
});
