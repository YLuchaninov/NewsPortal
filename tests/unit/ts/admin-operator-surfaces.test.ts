import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveArticleOperatorGuidance,
  resolveArticleOperatorState,
  resolveArticleSelectionDiagnostics,
  resolveDiscoveryChannelMetrics,
  resolveDiscoveryOperatorSummary,
  resolveDiscoveryPolicyExplainability,
  resolveDiscoveryRecallCandidateState,
  resolveDiscoverySourceQuality,
} from "../../../apps/admin/src/lib/server/operator-surfaces.ts";

test("resolveDiscoveryChannelMetrics prefers persisted channelMetrics breakdown", () => {
  const metrics = resolveDiscoveryChannelMetrics({
    scoring_breakdown: {
      channelMetrics: {
        metricSource: "generic_channel_quality",
        yieldScore: 0.82,
        leadTimeScore: 0.71,
        duplicationScore: 0.19,
        totalArticlesPeriod: 18,
        uniqueArticlesPeriod: 13,
        duplicateArticlesPeriod: 5,
        freshArticlesPeriod: 9,
        fetchHealthScore: 0.88,
      },
    },
    yield_score: 0.1,
  });

  assert.deepEqual(metrics, {
    metricSource: "generic_channel_quality",
    yieldScore: 0.82,
    leadTimeScore: 0.71,
    duplicationScore: 0.19,
    totalArticlesPeriod: 18,
    uniqueArticlesPeriod: 13,
    duplicateArticlesPeriod: 5,
    freshArticlesPeriod: 9,
    fetchHealthScore: 0.88,
  });
});

test("resolveDiscoveryChannelMetrics falls back to flat score rows", () => {
  const metrics = resolveDiscoveryChannelMetrics({
    metric_source: "generic_channel_quality",
    yield_score: 0.63,
    lead_time_score: 0.58,
    duplication_score: 0.22,
    total_articles_period: 12,
    unique_articles_period: 10,
    duplicate_articles_period: 2,
  });

  assert.equal(metrics.metricSource, "generic_channel_quality");
  assert.equal(metrics.yieldScore, 0.63);
  assert.equal(metrics.leadTimeScore, 0.58);
  assert.equal(metrics.duplicationScore, 0.22);
  assert.equal(metrics.totalArticlesPeriod, 12);
  assert.equal(metrics.uniqueArticlesPeriod, 10);
  assert.equal(metrics.duplicateArticlesPeriod, 2);
});

test("resolveDiscoveryOperatorSummary exposes dual-path discovery counters", () => {
  const summary = resolveDiscoveryOperatorSummary({
    mission_count: 3,
    active_mission_count: 1,
    compiled_graph_count: 2,
    pending_hypothesis_count: 4,
    candidate_count: 5,
    source_interest_score_count: 6,
    portfolio_snapshot_count: 2,
    recall_mission_count: 2,
    active_recall_mission_count: 1,
    recall_candidate_count: 7,
    pending_recall_candidate_count: 3,
    promoted_recall_candidate_count: 4,
    duplicate_recall_candidate_count: 1,
    source_profile_count: 9,
    source_quality_snapshot_count: 11,
  });

  assert.deepEqual(summary, {
    operatingModel: "dual_path",
    profileCount: 0,
    activeProfileCount: 0,
    graphMissionCount: 3,
    activeGraphMissionCount: 1,
    compiledGraphCount: 2,
    pendingHypothesisCount: 4,
    graphCandidateCount: 5,
    sourceInterestScoreCount: 6,
    portfolioSnapshotCount: 2,
    recallMissionCount: 2,
    activeRecallMissionCount: 1,
    recallCandidateCount: 7,
    pendingRecallCandidateCount: 3,
    promotedRecallCandidateCount: 4,
    duplicateRecallCandidateCount: 1,
    sourceProfileCount: 9,
    sourceQualitySnapshotCount: 11,
  });
});

test("resolveDiscoveryOperatorSummary exposes profile counters when present", () => {
  const summary = resolveDiscoveryOperatorSummary({
    profile_count: 4,
    active_profile_count: 2,
  });

  assert.equal(summary.profileCount, 4);
  assert.equal(summary.activeProfileCount, 2);
});

test("resolveDiscoverySourceQuality reads latest source-profile snapshot fields", () => {
  const quality = resolveDiscoverySourceQuality({
    latest_source_quality_snapshot_id: "snapshot-1",
    latest_source_quality_snapshot_reason: "recall_acquisition",
    latest_source_quality_recall_score: 0.76,
    latest_source_quality_scored_at: "2026-04-09T10:15:00Z",
    latest_source_quality_scoring_breakdown: {
      channelMetrics: {
        yieldScore: 0.81,
        leadTimeScore: 0.64,
        duplicationScore: 0.18,
        totalArticlesPeriod: 20,
        uniqueArticlesPeriod: 16,
      },
    },
  });

  assert.equal(quality.snapshotId, "snapshot-1");
  assert.equal(quality.snapshotReason, "recall_acquisition");
  assert.equal(quality.recallScore, 0.76);
  assert.equal(quality.yieldScore, 0.81);
  assert.equal(quality.leadTimeScore, 0.64);
  assert.equal(quality.duplicationScore, 0.18);
  assert.equal(quality.uniqueArticlesPeriod, 16);
});

test("resolveDiscoveryRecallCandidateState distinguishes promoted duplicates", () => {
  const state = resolveDiscoveryRecallCandidateState({
    status: "duplicate",
    registered_channel_id: "channel-9",
    channel_id: "channel-9",
    quality_signal_source: "source_quality_snapshot",
  });

  assert.deepEqual(state, {
    status: "duplicate",
    promotionState: "linked_duplicate",
    qualitySignalSource: "source_quality_snapshot",
    registeredChannelId: "channel-9",
    channelId: "channel-9",
  });
});

test("resolveDiscoveryPolicyExplainability maps graph policy signals and thresholds", () => {
  const explainability = resolveDiscoveryPolicyExplainability(
    {
      provider_type: "website",
      canonical_domain: "news.example.test",
      title: "Official policy analysis",
      description: "Editorial report",
      relevance_score: 0.84,
      profile_display_name: "Editorial profile",
      applied_profile_version: 3,
      applied_policy_json: {
        graphPolicy: {
          preferredDomains: ["example.test"],
          blockedDomains: ["spam.test"],
          positiveKeywords: ["policy"],
          negativeKeywords: ["sponsored"],
          minWebsiteReviewScore: 0.8,
        },
        yieldBenchmark: {
          domains: ["example.test"],
        },
      },
      evaluation_json: {
        normalizedReasonBucket: "below_auto_approval_threshold",
      },
    },
    "graph"
  );

  assert.deepEqual(explainability, {
    lane: "graph",
    reasonBucket: "below_auto_approval_threshold",
    score: 0.84,
    threshold: 0.8,
    fitScore: null,
    qualityPrior: null,
    finalReviewScore: null,
    policyVerdict: null,
    onboardingVerdict: null,
    productivityRisk: null,
    usefulnessDiagnostic: null,
    stageLossBucket: null,
    sourceFamily: null,
    sourceShape: null,
    provider: null,
    residuals: [],
    preferredDomainMatch: true,
    negativeDomainMatch: false,
    positiveKeywordMatch: true,
    negativeKeywordMatch: false,
    benchmarkLike: true,
    profileName: "Editorial profile",
    profileVersion: 3,
  });
});

test("resolveDiscoveryPolicyExplainability maps recall threshold from applied policy snapshot", () => {
  const explainability = resolveDiscoveryPolicyExplainability(
    {
      provider_type: "rss",
      canonical_domain: "procurement.example.test",
      title: "Vendor selection notice",
      source_quality_recall_score: 0.69,
      applied_policy_json: {
        profileDisplayName: "Procurement profile",
        profileVersion: 2,
        recallPolicy: {
          preferredDomains: ["procurement.example.test"],
          positiveKeywords: ["vendor selection"],
          minPromotionScore: 0.65,
        },
        yieldBenchmark: {
          titleKeywords: ["vendor selection"],
        },
      },
    },
    "recall"
  );

  assert.equal(explainability.lane, "recall");
  assert.equal(explainability.threshold, 0.65);
  assert.equal(explainability.score, 0.69);
  assert.equal(explainability.fitScore, null);
  assert.equal(explainability.qualityPrior, null);
  assert.equal(explainability.finalReviewScore, null);
  assert.equal(explainability.policyVerdict, null);
  assert.equal(explainability.onboardingVerdict, null);
  assert.equal(explainability.productivityRisk, null);
  assert.equal(explainability.usefulnessDiagnostic, null);
  assert.equal(explainability.stageLossBucket, null);
  assert.equal(explainability.sourceFamily, null);
  assert.equal(explainability.sourceShape, null);
  assert.equal(explainability.provider, null);
  assert.deepEqual(explainability.residuals, []);
  assert.equal(explainability.preferredDomainMatch, true);
  assert.equal(explainability.positiveKeywordMatch, true);
  assert.equal(explainability.benchmarkLike, true);
  assert.equal(explainability.profileName, "Procurement profile");
  assert.equal(explainability.profileVersion, 2);
});

test("resolveDiscoveryPolicyExplainability prefers runtime policyReview when present", () => {
  const explainability = resolveDiscoveryPolicyExplainability(
    {
      provider_type: "website",
      title: "Engineering updates",
      evaluation_json: {
        policyReview: {
          threshold: 0.7,
          reviewScore: 0.78,
          fitScore: 0.73,
          qualityPrior: 0.69,
          finalReviewScore: 0.78,
          policyVerdict: "manual_review",
          onboardingVerdict: "manual_review",
          productivityRisk: "high",
          usefulnessDiagnostic: "manual_only_residual",
          stageLossBucket: "candidate_manual_only",
          provider: "brave",
          reasonBucket: "browser_assisted_residual",
          residuals: ["browser_assisted_recommended"],
          matchedSignals: {
            preferredDomainMatch: true,
            blockedDomainMatch: false,
            positiveKeywordMatch: true,
            negativeKeywordMatch: false,
            benchmarkLike: false,
            sourceFamily: "official_updates",
            sourceShape: "editorial_stream",
          },
        },
      },
    },
    "graph"
  );

  assert.equal(explainability.threshold, 0.7);
  assert.equal(explainability.score, 0.78);
  assert.equal(explainability.fitScore, 0.73);
  assert.equal(explainability.qualityPrior, 0.69);
  assert.equal(explainability.finalReviewScore, 0.78);
  assert.equal(explainability.policyVerdict, "manual_review");
  assert.equal(explainability.onboardingVerdict, "manual_review");
  assert.equal(explainability.productivityRisk, "high");
  assert.equal(explainability.usefulnessDiagnostic, "manual_only_residual");
  assert.equal(explainability.stageLossBucket, "candidate_manual_only");
  assert.equal(explainability.sourceFamily, "official_updates");
  assert.equal(explainability.sourceShape, "editorial_stream");
  assert.equal(explainability.provider, "brave");
  assert.deepEqual(explainability.residuals, ["browser_assisted_recommended"]);
  assert.equal(explainability.reasonBucket, "browser_assisted_residual");
  assert.equal(explainability.preferredDomainMatch, true);
  assert.equal(explainability.positiveKeywordMatch, true);
});

test("resolveArticleOperatorState prefers final-selection truth over compatibility badges", () => {
  const state = resolveArticleOperatorState({
    final_selection_decision: "selected",
    final_selection_mode: "selected",
    final_selection_summary: "Selected by final-selection policy",
    final_selection_reason: "semantic_match",
    final_selection_llm_review_pending_count: 0,
    final_selection_hold_count: 0,
    system_feed_decision: "eligible",
    final_selection_verification_state: "strong",
    observation_state: "canonicalized",
    duplicate_kind: "canonical",
    canonical_document_id: "canonical-1",
    story_cluster_id: "cluster-1",
    processing_state: "matched",
    enrichment_state: "enriched",
  });

  assert.deepEqual(state, {
    selectionSource: "final_selection_results",
    selectionReuseSource: "article_level",
    reviewSource: null,
    selectionDecision: "selected",
    compatDecision: "eligible",
    selectionReason: "semantic_match",
    selectionMode: "selected",
    selectionSummary: "Selected by final-selection policy",
    llmReviewPendingCount: 0,
    holdCount: 0,
    candidateSignalUpliftCount: 0,
    candidateRecoveryState: "absent",
    candidateRecoverySummary:
      "Recovered candidate signals have not materialized on this item yet.",
    canonicalReviewReused: false,
    canonicalReviewReusedCount: 0,
    canonicalSelectionReused: false,
    duplicateArticleCountForCanonical: 0,
    observationState: "canonicalized",
    duplicateKind: "canonical",
    canonicalDocumentId: "canonical-1",
    storyClusterId: "cluster-1",
    verificationState: "strong",
    processingState: "matched",
    enrichmentState: "enriched",
  });
});

test("resolveArticleOperatorState falls back to compatibility truth when final selection is missing", () => {
  const state = resolveArticleOperatorState({
    system_feed_decision: "pending_llm",
    story_cluster_verification_state: "weak",
  });

  assert.equal(state.selectionSource, "system_feed_results");
  assert.equal(state.selectionReuseSource, "article_level");
  assert.equal(state.reviewSource, null);
  assert.equal(state.selectionDecision, "pending_llm");
  assert.equal(state.compatDecision, "pending_llm");
  assert.equal(state.selectionMode, "llm_review_pending");
  assert.equal(state.selectionSummary, "Compatibility projection waiting for review");
  assert.equal(state.verificationState, "weak");
  assert.equal(state.candidateSignalUpliftCount, 0);
  assert.equal(state.candidateRecoveryState, "absent");
});

test("resolveArticleOperatorState prefers generic server-owned selection payload when present", () => {
  const state = resolveArticleOperatorState({
    selection_source: "system_feed_results",
    selection_decision: "eligible",
    selection_mode: "compatibility_only",
    selection_summary: "Compatibility projection: eligible",
    selection_reason: null,
    selection_llm_review_pending_count: 0,
    selection_hold_count: 0,
    system_feed_decision: "eligible",
  });

  assert.equal(state.selectionSource, "system_feed_results");
  assert.equal(state.selectionReuseSource, "article_level");
  assert.equal(state.selectionDecision, "eligible");
  assert.equal(state.selectionMode, "compatibility_only");
  assert.equal(state.selectionSummary, "Compatibility projection: eligible");
  assert.equal(state.candidateSignalUpliftCount, 0);
  assert.equal(state.candidateRecoveryState, "absent");
});

test("resolveArticleOperatorState distinguishes cheap hold from review-pending gray zone", () => {
  const state = resolveArticleOperatorState({
    final_selection_decision: "gray_zone",
    final_selection_mode: "hold",
    final_selection_summary: "Gray zone held by profile policy",
    final_selection_reason: "semantic_hold",
    final_selection_llm_review_pending_count: 0,
    final_selection_hold_count: 1,
    system_feed_decision: "filtered_out",
  });

  assert.equal(state.selectionSource, "final_selection_results");
  assert.equal(state.selectionReuseSource, "article_level");
  assert.equal(state.selectionMode, "hold");
  assert.equal(state.selectionSummary, "Gray zone held by profile policy");
  assert.equal(state.selectionReason, "semantic_hold");
  assert.equal(state.holdCount, 1);
  assert.equal(state.llmReviewPendingCount, 0);
  assert.equal(state.candidateSignalUpliftCount, 0);
  assert.equal(state.candidateRecoveryState, "absent");
});

test("resolveArticleOperatorState trusts precomputed API selection summary when present", () => {
  const state = resolveArticleOperatorState({
    final_selection_decision: "gray_zone",
    final_selection_mode: "llm_review_pending",
    final_selection_summary: "Recovered candidate waiting for LLM review",
    final_selection_reason: "candidate_signal_gray_zone",
    final_selection_llm_review_pending_count: 1,
    final_selection_hold_count: 0,
    selection_candidate_signal_uplift_count: 1,
    system_feed_decision: "pending_llm",
  });

  assert.equal(state.selectionMode, "llm_review_pending");
  assert.equal(state.selectionSummary, "Recovered candidate waiting for LLM review");
  assert.equal(state.llmReviewPendingCount, 1);
  assert.equal(state.candidateSignalUpliftCount, 1);
  assert.equal(state.candidateRecoveryState, "review_pending");
});

test("resolveArticleOperatorState surfaces canonical review reuse metadata", () => {
  const state = resolveArticleOperatorState({
    final_selection_decision: "selected",
    final_selection_mode: "selected",
    final_selection_summary: "Selected by final-selection policy",
    final_selection_reason: "semantic_match",
    final_selection_llm_review_pending_count: 0,
    final_selection_hold_count: 0,
    selection_canonical_review_reused: true,
    selection_canonical_review_reused_count: 2,
    selection_canonical_reused: true,
    selection_duplicate_article_count_for_canonical: 5,
    selection_reuse_source: "canonical_reused",
    selection_review_source: "reused_canonical_llm_review",
  });

  assert.equal(state.selectionReuseSource, "canonical_reused");
  assert.equal(state.reviewSource, "reused_canonical_llm_review");
  assert.equal(state.canonicalReviewReused, true);
  assert.equal(state.canonicalReviewReusedCount, 2);
  assert.equal(state.canonicalSelectionReused, true);
  assert.equal(state.duplicateArticleCountForCanonical, 5);
});

test("resolveArticleSelectionDiagnostics summarizes explain payload rows generically", () => {
  const diagnostics = resolveArticleSelectionDiagnostics({
    selection_explain: {
      source: "final_selection_results",
      decision: "gray_zone",
      selectionMode: "hold",
      selectionSummary: "Gray zone held by profile policy",
      selectionReason: "semantic_hold",
      holdCount: 1,
      llmReviewPendingCount: 0,
      candidateSignalUpliftCount: 0,
      candidateRecoveryState: "absent",
      candidateRecoverySummary:
        "Recovered candidate signals have not materialized on this item yet.",
    },
    interest_filter_results: [
      {
        filter_scope: "system_criterion",
        semantic_decision: "gray_zone",
        technical_filter_state: "passed",
      },
      {
        filter_scope: "system_criterion",
        semantic_decision: "match",
        technical_filter_state: "passed",
      },
      {
        filter_scope: "user_interest",
        semantic_decision: "no_match",
        technical_filter_state: "filtered_out",
      },
    ],
    llm_reviews: [],
    notifications: [{ notification_id: "n-1" }],
  });

  assert.deepEqual(diagnostics, {
    source: "final_selection_results",
    decision: "gray_zone",
    selectionMode: "hold",
    selectionSummary: "Gray zone held by profile policy",
    selectionReason: "semantic_hold",
    downstreamLossBucket: null,
    selectionBlockerStage: null,
    selectionBlockerReason: null,
    holdReason: null,
    semanticSignalSummary: {},
    verificationSignalSummary: {},
    holdCount: 1,
    llmReviewPendingCount: 0,
    candidateSignalUpliftCount: 0,
    candidateRecoveryState: "absent",
    candidateRecoverySummary:
      "Recovered candidate signals have not materialized on this item yet.",
    systemCriterionRows: 2,
    userInterestRows: 1,
    matchedRows: 1,
    noMatchRows: 1,
    grayZoneRows: 1,
    technicalFilteredOutRows: 1,
    llmReviewRows: 0,
    notificationRows: 1,
  });
});

test("resolveArticleSelectionDiagnostics prefers precomputed API diagnostics when present", () => {
  const diagnostics = resolveArticleSelectionDiagnostics({
    selection_diagnostics: {
      source: "final_selection_results",
      decision: "selected",
      selectionMode: "selected",
      selectionSummary: "Selected by final-selection policy",
      selectionReason: "semantic_match",
      downstreamLossBucket: "selected_useful_evidence_present",
      selectionBlockerStage: "selected",
      selectionBlockerReason: "semantic_match",
      holdReason: null,
      semanticSignalSummary: {
        total: 3,
        matched: 2,
        noMatch: 1,
      },
      verificationSignalSummary: {
        verificationState: "strong",
        selectionDecision: "selected",
      },
      holdCount: 0,
      llmReviewPendingCount: 0,
      candidateSignalUpliftCount: 1,
      candidateRecoveryState: "present",
      candidateRecoverySummary:
        "Recovered candidate signals are materialized on this item.",
      systemCriterionRows: 3,
      userInterestRows: 2,
      matchedRows: 2,
      noMatchRows: 2,
      grayZoneRows: 1,
      technicalFilteredOutRows: 1,
      llmReviewRows: 0,
      notificationRows: 4,
    },
    selection_explain: {
      selectionMode: "hold",
    },
  });

  assert.equal(diagnostics.selectionMode, "selected");
  assert.equal(diagnostics.downstreamLossBucket, "selected_useful_evidence_present");
  assert.equal(diagnostics.selectionBlockerStage, "selected");
  assert.equal(diagnostics.selectionBlockerReason, "semantic_match");
  assert.equal(diagnostics.systemCriterionRows, 3);
  assert.equal(diagnostics.notificationRows, 4);
  assert.equal(diagnostics.candidateSignalUpliftCount, 1);
  assert.equal(diagnostics.candidateRecoveryState, "present");
});

test("resolveArticleSelectionDiagnostics falls back to article read-model selection truth", () => {
  const diagnostics = resolveArticleSelectionDiagnostics(null, {
    final_selection_decision: "gray_zone",
    final_selection_mode: "hold",
    final_selection_summary: "Gray zone held by profile policy",
    final_selection_reason: "semantic_hold",
    final_selection_hold_count: 1,
    final_selection_llm_review_pending_count: 0,
    system_feed_decision: "filtered_out",
  });

  assert.deepEqual(diagnostics, {
    source: "final_selection_results",
    decision: "gray_zone",
    selectionMode: "hold",
    selectionSummary: "Gray zone held by profile policy",
    selectionReason: "semantic_hold",
    downstreamLossBucket: null,
    selectionBlockerStage: null,
    selectionBlockerReason: null,
    holdReason: null,
    semanticSignalSummary: {},
    verificationSignalSummary: {},
    holdCount: 1,
    llmReviewPendingCount: 0,
    candidateSignalUpliftCount: 0,
    candidateRecoveryState: "absent",
    candidateRecoverySummary:
      "Recovered candidate signals have not materialized on this item yet.",
    systemCriterionRows: 0,
    userInterestRows: 0,
    matchedRows: 0,
    noMatchRows: 0,
    grayZoneRows: 0,
    technicalFilteredOutRows: 0,
    llmReviewRows: 0,
    notificationRows: 0,
  });
});

test("resolveArticleOperatorGuidance distinguishes hold from optional review", () => {
  assert.deepEqual(
    resolveArticleOperatorGuidance({
      selectionMode: "hold",
      selectionSummary: "Gray zone held by profile policy",
      selectionSource: "final_selection_results",
    }),
    {
      tone: "warning",
      summary:
        "Profile policy kept this item on cheap hold. Tune profile definitions or evidence rules before enabling broader escalation.",
    }
  );

  assert.deepEqual(
    resolveArticleOperatorGuidance({
      selectionMode: "llm_review_pending",
      selectionSummary: "Gray zone pending LLM review",
      selectionSource: "final_selection_results",
    }),
    {
      tone: "warning",
      summary:
        "This item is waiting for the LLM review path. Review budget and profile policy before treating it as a selected result.",
    }
  );

  assert.deepEqual(
    resolveArticleOperatorGuidance({
      selectionMode: "llm_review_pending",
      selectionSummary: "Recovered candidate waiting for LLM review",
      selectionSource: "final_selection_results",
      candidateSignalUpliftCount: 1,
    }),
    {
      tone: "warning",
      summary:
        "A candidate-recovery signal kept this item alive for LLM review. Watch these cases to see whether the new recall path surfaces real wins or only extra noise.",
    }
  );
});

test("resolveArticleOperatorGuidance prefers server-provided guidance when present", () => {
  assert.deepEqual(
    resolveArticleOperatorGuidance({
      selection_guidance: {
        tone: "warning",
        summary: "Server-owned operator guidance",
      },
      selectionMode: "selected",
    }),
    {
      tone: "warning",
      summary: "Server-owned operator guidance",
    }
  );
});
