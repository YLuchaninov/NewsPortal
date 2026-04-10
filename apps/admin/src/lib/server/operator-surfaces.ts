type LooseRecord = Record<string, unknown>;

function asRecord(value: unknown): LooseRecord {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as LooseRecord)
    : {};
}

function asNumber(value: unknown): number | null {
  const parsed =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function asInteger(value: unknown): number | null {
  const parsed =
    typeof value === "number" && Number.isFinite(value)
      ? Math.trunc(value)
      : Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function asString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

export interface DiscoveryChannelMetricsSummary {
  metricSource: string;
  yieldScore: number | null;
  leadTimeScore: number | null;
  duplicationScore: number | null;
  totalArticlesPeriod: number | null;
  uniqueArticlesPeriod: number | null;
  duplicateArticlesPeriod: number | null;
  freshArticlesPeriod: number | null;
  fetchHealthScore: number | null;
}

export function resolveDiscoveryChannelMetrics(
  scoreLike: unknown
): DiscoveryChannelMetricsSummary {
  const score = asRecord(scoreLike);
  const breakdown = asRecord(score.scoring_breakdown);
  const channelMetrics = asRecord(breakdown.channelMetrics);

  return {
    metricSource:
      asString(channelMetrics.metricSource) ??
      asString(score.metric_source) ??
      "generic_channel_quality",
    yieldScore: asNumber(channelMetrics.yieldScore ?? score.yield_score),
    leadTimeScore: asNumber(channelMetrics.leadTimeScore ?? score.lead_time_score),
    duplicationScore: asNumber(channelMetrics.duplicationScore ?? score.duplication_score),
    totalArticlesPeriod: asInteger(
      channelMetrics.totalArticlesPeriod ?? score.total_articles_period
    ),
    uniqueArticlesPeriod: asInteger(
      channelMetrics.uniqueArticlesPeriod ?? score.unique_articles_period
    ),
    duplicateArticlesPeriod: asInteger(
      channelMetrics.duplicateArticlesPeriod ?? score.duplicate_articles_period
    ),
    freshArticlesPeriod: asInteger(
      channelMetrics.freshArticlesPeriod ?? score.fresh_articles_period
    ),
    fetchHealthScore: asNumber(
      channelMetrics.fetchHealthScore ?? score.fetch_health_score
    ),
  };
}

export interface DiscoveryOperatorSummary {
  operatingModel: "dual_path" | "graph_first_only";
  graphMissionCount: number;
  activeGraphMissionCount: number;
  compiledGraphCount: number;
  pendingHypothesisCount: number;
  graphCandidateCount: number;
  sourceInterestScoreCount: number;
  portfolioSnapshotCount: number;
  recallMissionCount: number;
  activeRecallMissionCount: number;
  recallCandidateCount: number;
  pendingRecallCandidateCount: number;
  promotedRecallCandidateCount: number;
  duplicateRecallCandidateCount: number;
  sourceProfileCount: number;
  sourceQualitySnapshotCount: number;
}

export function resolveDiscoveryOperatorSummary(
  summaryLike: unknown
): DiscoveryOperatorSummary {
  const summary = asRecord(summaryLike);
  const hasRecallSurface =
    summary.recall_mission_count != null ||
    summary.recall_candidate_count != null ||
    summary.source_quality_snapshot_count != null;

  return {
    operatingModel: hasRecallSurface ? "dual_path" : "graph_first_only",
    graphMissionCount: asInteger(summary.mission_count) ?? 0,
    activeGraphMissionCount: asInteger(summary.active_mission_count) ?? 0,
    compiledGraphCount: asInteger(summary.compiled_graph_count) ?? 0,
    pendingHypothesisCount: asInteger(summary.pending_hypothesis_count) ?? 0,
    graphCandidateCount: asInteger(summary.candidate_count) ?? 0,
    sourceInterestScoreCount: asInteger(summary.source_interest_score_count) ?? 0,
    portfolioSnapshotCount: asInteger(summary.portfolio_snapshot_count) ?? 0,
    recallMissionCount: asInteger(summary.recall_mission_count) ?? 0,
    activeRecallMissionCount: asInteger(summary.active_recall_mission_count) ?? 0,
    recallCandidateCount: asInteger(summary.recall_candidate_count) ?? 0,
    pendingRecallCandidateCount: asInteger(summary.pending_recall_candidate_count) ?? 0,
    promotedRecallCandidateCount:
      asInteger(summary.promoted_recall_candidate_count) ?? 0,
    duplicateRecallCandidateCount:
      asInteger(summary.duplicate_recall_candidate_count) ?? 0,
    sourceProfileCount: asInteger(summary.source_profile_count) ?? 0,
    sourceQualitySnapshotCount:
      asInteger(summary.source_quality_snapshot_count) ?? 0,
  };
}

export interface DiscoverySourceQualitySummary {
  snapshotId: string | null;
  snapshotReason: string | null;
  scoredAt: string | null;
  recallScore: number | null;
  metricSource: string;
  yieldScore: number | null;
  leadTimeScore: number | null;
  duplicationScore: number | null;
  totalArticlesPeriod: number | null;
  uniqueArticlesPeriod: number | null;
  duplicateArticlesPeriod: number | null;
  freshArticlesPeriod: number | null;
  fetchHealthScore: number | null;
}

export function resolveDiscoverySourceQuality(
  snapshotLike: unknown
): DiscoverySourceQualitySummary {
  const snapshot = asRecord(snapshotLike);
  const metrics = resolveDiscoveryChannelMetrics({
    metric_source: "generic_channel_quality",
    yield_score:
      snapshot.latest_source_quality_yield_score ?? snapshot.source_quality_yield_score,
    lead_time_score:
      snapshot.latest_source_quality_lead_time_score ??
      snapshot.source_quality_lead_time_score,
    duplication_score:
      snapshot.latest_source_quality_duplication_score ??
      snapshot.source_quality_duplication_score,
    total_articles_period:
      snapshot.latest_source_quality_total_articles_period ??
      snapshot.source_quality_total_articles_period,
    unique_articles_period:
      snapshot.latest_source_quality_unique_articles_period ??
      snapshot.source_quality_unique_articles_period,
    duplicate_articles_period:
      snapshot.latest_source_quality_duplicate_articles_period ??
      snapshot.source_quality_duplicate_articles_period,
    fresh_articles_period:
      snapshot.latest_source_quality_fresh_articles_period ??
      snapshot.source_quality_fresh_articles_period,
    fetch_health_score:
      snapshot.latest_source_quality_fetch_health_score ??
      snapshot.source_quality_fetch_health_score,
    scoring_breakdown:
      snapshot.latest_source_quality_scoring_breakdown ??
      snapshot.source_quality_scoring_breakdown,
  });

  return {
    snapshotId:
      asString(snapshot.latest_source_quality_snapshot_id) ??
      asString(snapshot.source_quality_snapshot_id),
    snapshotReason:
      asString(snapshot.latest_source_quality_snapshot_reason) ??
      asString(snapshot.source_quality_snapshot_reason),
    scoredAt:
      asString(snapshot.latest_source_quality_scored_at) ??
      asString(snapshot.source_quality_scored_at),
    recallScore:
      asNumber(snapshot.latest_source_quality_recall_score) ??
      asNumber(snapshot.source_quality_recall_score),
    ...metrics,
  };
}

export interface DiscoveryRecallCandidateState {
  status: string | null;
  promotionState:
    | "pending"
    | "promoted"
    | "linked_duplicate"
    | "rejected"
    | "reviewed";
  qualitySignalSource: string | null;
  registeredChannelId: string | null;
  channelId: string | null;
}

export function resolveDiscoveryRecallCandidateState(
  candidateLike: unknown
): DiscoveryRecallCandidateState {
  const candidate = asRecord(candidateLike);
  const status = asString(candidate.status);
  const registeredChannelId = asString(candidate.registered_channel_id);
  const channelId = asString(candidate.channel_id) ?? registeredChannelId;

  let promotionState: DiscoveryRecallCandidateState["promotionState"] = "reviewed";
  if (status === "pending") {
    promotionState = "pending";
  } else if (status === "rejected") {
    promotionState = "rejected";
  } else if (status === "duplicate" && channelId) {
    promotionState = "linked_duplicate";
  } else if (channelId) {
    promotionState = "promoted";
  }

  return {
    status,
    promotionState,
    qualitySignalSource: asString(candidate.quality_signal_source),
    registeredChannelId,
    channelId,
  };
}

export interface ArticleOperatorState {
  selectionSource: "final_selection_results" | "system_feed_results" | "pending";
  selectionDecision: string | null;
  compatDecision: string | null;
  observationState: string | null;
  duplicateKind: string | null;
  canonicalDocumentId: string | null;
  storyClusterId: string | null;
  verificationState: string | null;
  processingState: string | null;
  enrichmentState: string | null;
}

export function resolveArticleOperatorState(articleLike: unknown): ArticleOperatorState {
  const article = asRecord(articleLike);
  const finalDecision = asString(article.final_selection_decision);
  const compatDecision = asString(article.system_feed_decision);

  return {
    selectionSource: finalDecision
      ? "final_selection_results"
      : compatDecision
        ? "system_feed_results"
        : "pending",
    selectionDecision: finalDecision ?? compatDecision,
    compatDecision,
    observationState: asString(article.observation_state),
    duplicateKind: asString(article.duplicate_kind),
    canonicalDocumentId: asString(article.canonical_document_id),
    storyClusterId: asString(article.story_cluster_id),
    verificationState:
      asString(article.final_selection_verification_state) ??
      asString(article.story_cluster_verification_state) ??
      asString(article.canonical_verification_state),
    processingState: asString(article.processing_state),
    enrichmentState: asString(article.enrichment_state),
  };
}
