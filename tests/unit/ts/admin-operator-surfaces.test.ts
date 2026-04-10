import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveArticleOperatorState,
  resolveDiscoveryChannelMetrics,
  resolveDiscoveryOperatorSummary,
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

test("resolveArticleOperatorState prefers final-selection truth over compatibility badges", () => {
  const state = resolveArticleOperatorState({
    final_selection_decision: "selected",
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
    selectionDecision: "selected",
    compatDecision: "eligible",
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
  assert.equal(state.selectionDecision, "pending_llm");
  assert.equal(state.compatDecision, "pending_llm");
  assert.equal(state.verificationState, "weak");
});
