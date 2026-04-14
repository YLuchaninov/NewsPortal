type LooseRecord = Record<string, unknown>;

function asRecord(value: unknown): LooseRecord {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as LooseRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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

function asBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
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
  selectionReuseSource: "article_level" | "canonical_reused";
  reviewSource: "fresh_llm_review" | "reused_canonical_llm_review" | null;
  selectionDecision: string | null;
  compatDecision: string | null;
  selectionReason: string | null;
  selectionMode:
    | "selected"
    | "rejected"
    | "hold"
    | "llm_review_pending"
    | "gray_zone"
    | "compatibility_only"
    | "pending";
  selectionSummary: string;
  llmReviewPendingCount: number;
  holdCount: number;
  candidateSignalUpliftCount: number;
  candidateRecoveryState: "absent" | "present" | "review_pending" | "held";
  candidateRecoverySummary: string;
  canonicalReviewReused: boolean;
  canonicalReviewReusedCount: number;
  canonicalSelectionReused: boolean;
  duplicateArticleCountForCanonical: number;
  observationState: string | null;
  duplicateKind: string | null;
  canonicalDocumentId: string | null;
  storyClusterId: string | null;
  verificationState: string | null;
  processingState: string | null;
  enrichmentState: string | null;
}

export interface ArticleSelectionDiagnostics {
  source: string;
  decision: string | null;
  selectionMode: string;
  selectionSummary: string;
  selectionReason: string | null;
  holdCount: number;
  llmReviewPendingCount: number;
  candidateSignalUpliftCount: number;
  candidateRecoveryState: string;
  candidateRecoverySummary: string;
  systemCriterionRows: number;
  userInterestRows: number;
  matchedRows: number;
  noMatchRows: number;
  grayZoneRows: number;
  technicalFilteredOutRows: number;
  llmReviewRows: number;
  notificationRows: number;
}

export interface ArticleOperatorGuidance {
  tone: "positive" | "warning" | "neutral";
  summary: string;
}

export function resolveArticleOperatorState(articleLike: unknown): ArticleOperatorState {
  const article = asRecord(articleLike);
  const genericSelectionSource = asString(article.selection_source);
  const genericSelectionDecision = asString(article.selection_decision);
  const genericSelectionMode = asString(article.selection_mode);
  const genericSelectionSummary = asString(article.selection_summary);
  const genericSelectionReason = asString(article.selection_reason);
  const finalDecision = asString(article.final_selection_decision);
  const compatDecision = asString(article.system_feed_decision);
  const selectionReason = genericSelectionReason ?? asString(article.final_selection_reason);
  const precomputedSelectionMode = asString(article.final_selection_mode);
  const precomputedSelectionSummary = asString(article.final_selection_summary);
  const llmReviewPendingCount =
    asInteger(article.selection_llm_review_pending_count) ??
    asInteger(article.final_selection_llm_review_pending_count) ??
    0;
  const holdCount =
    asInteger(article.selection_hold_count) ?? asInteger(article.final_selection_hold_count) ?? 0;
  const candidateSignalUpliftCount =
    asInteger(article.selection_candidate_signal_uplift_count) ?? 0;
  const canonicalReviewReused = asBoolean(article.selection_canonical_review_reused);
  const canonicalReviewReusedCount =
    asInteger(article.selection_canonical_review_reused_count) ?? 0;
  const canonicalSelectionReused = asBoolean(article.selection_canonical_reused);
  const duplicateArticleCountForCanonical =
    asInteger(article.selection_duplicate_article_count_for_canonical) ?? 0;
  const selectionReuseSource =
    (asString(article.selection_reuse_source) as
      | ArticleOperatorState["selectionReuseSource"]
      | null) ?? "article_level";
  const reviewSource =
    (asString(article.selection_review_source) as
      | ArticleOperatorState["reviewSource"]
      | null) ??
    (canonicalReviewReused ? "reused_canonical_llm_review" : null);

  let selectionMode: ArticleOperatorState["selectionMode"] =
    (genericSelectionMode as ArticleOperatorState["selectionMode"] | null) ??
    (precomputedSelectionMode as ArticleOperatorState["selectionMode"] | null) ??
    "pending";
  let selectionSummary =
    genericSelectionSummary ?? precomputedSelectionSummary ?? "Selection not materialized yet";

  if (
    (!genericSelectionMode || !genericSelectionSummary)
    && (!precomputedSelectionMode || !precomputedSelectionSummary)
  ) {
    if (finalDecision === "gray_zone") {
      if (candidateSignalUpliftCount > 0
        && (llmReviewPendingCount > 0 || compatDecision === "pending_llm")) {
        selectionMode = "llm_review_pending";
        selectionSummary = "Recovered candidate waiting for LLM review";
      } else if (llmReviewPendingCount > 0 || compatDecision === "pending_llm") {
        selectionMode = "llm_review_pending";
        selectionSummary = "Gray zone pending LLM review";
      } else if (
        candidateSignalUpliftCount > 0
        && (holdCount > 0 || selectionReason === "candidate_signal_hold")
      ) {
        selectionMode = "hold";
        selectionSummary = "Recovered candidate held by profile policy";
      } else if (holdCount > 0 || selectionReason === "semantic_hold") {
        selectionMode = "hold";
        selectionSummary = "Gray zone held by profile policy";
      } else if (candidateSignalUpliftCount > 0) {
        selectionMode = "gray_zone";
        selectionSummary = "Recovered candidate remains in gray zone";
      } else {
        selectionMode = "gray_zone";
        selectionSummary = "Gray zone unresolved";
      }
    } else if (finalDecision === "selected") {
      selectionMode = "selected";
      selectionSummary = "Selected by final-selection policy";
    } else if (finalDecision === "rejected") {
      selectionMode = "rejected";
      selectionSummary = "Rejected by final-selection policy";
    } else if (compatDecision) {
      selectionMode =
        compatDecision === "pending_llm" ? "llm_review_pending" : "compatibility_only";
      selectionSummary =
        compatDecision === "pending_llm"
          ? "Compatibility projection waiting for review"
          : `Compatibility projection: ${compatDecision}`;
    }
  }

  const candidateRecoveryState =
    candidateSignalUpliftCount > 0
      ? (
          selectionMode === "llm_review_pending"
            ? "review_pending"
            : selectionMode === "hold"
              ? "held"
              : "present"
        )
      : "absent";
  const candidateRecoverySummary =
    candidateSignalUpliftCount > 0
      ? (
          selectionMode === "llm_review_pending"
            ? "Recovered candidate signals are materialized and waiting for LLM review."
            : selectionMode === "hold"
              ? "Recovered candidate signals are materialized but currently held."
              : "Recovered candidate signals are materialized on this item."
        )
      : "Recovered candidate signals have not materialized on this item yet.";

  return {
    selectionSource:
      (genericSelectionSource as ArticleOperatorState["selectionSource"] | null) ??
      (finalDecision
        ? "final_selection_results"
        : compatDecision
          ? "system_feed_results"
          : "pending"),
    selectionDecision: genericSelectionDecision ?? finalDecision ?? compatDecision,
    compatDecision,
    selectionReason,
    selectionMode,
    selectionSummary,
    llmReviewPendingCount,
    holdCount,
    candidateSignalUpliftCount,
    candidateRecoveryState,
    candidateRecoverySummary,
    canonicalReviewReused,
    canonicalReviewReusedCount,
    canonicalSelectionReused,
    duplicateArticleCountForCanonical,
    selectionReuseSource,
    reviewSource,
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

export function resolveArticleOperatorGuidance(
  stateLike: ArticleOperatorState | unknown
): ArticleOperatorGuidance {
  const precomputed = asRecord(
    asRecord(stateLike).selection_guidance ?? asRecord(stateLike).selectionGuidance
  );
  if (Object.keys(precomputed).length > 0) {
    return {
      tone:
        (asString(precomputed.tone) as ArticleOperatorGuidance["tone"] | null) ??
        "neutral",
      summary:
        asString(precomputed.summary) ??
        "Selection guidance is not available yet.",
    };
  }

  const state =
    stateLike && typeof stateLike === "object" && "selectionMode" in (stateLike as object)
      ? (stateLike as ArticleOperatorState)
      : resolveArticleOperatorState(stateLike);

  if (state.selectionMode === "selected") {
    return {
      tone: "positive",
      summary: "Final selection already passed. Use this row mainly to verify quality and downstream visibility.",
    };
  }
  if (state.selectionMode === "hold") {
    if (state.candidateSignalUpliftCount > 0) {
      return {
        tone: "warning",
        summary:
          "A recovered candidate was preserved out of early no-match, but profile policy still kept it on cheap hold. Tune evidence rules or escalation policy before broadening recall.",
      };
    }
    return {
      tone: "warning",
      summary:
        "Profile policy kept this item on cheap hold. Tune profile definitions or evidence rules before enabling broader escalation.",
    };
  }
  if (state.selectionMode === "llm_review_pending") {
    if (state.candidateSignalUpliftCount > 0) {
      return {
        tone: "warning",
        summary:
          "A candidate-recovery signal kept this item alive for LLM review. Watch these cases to see whether the new recall path surfaces real wins or only extra noise.",
      };
    }
    return {
      tone: "warning",
      summary:
        "This item is waiting for the LLM review path. Review budget and profile policy before treating it as a selected result.",
    };
  }
  if (state.selectionMode === "compatibility_only") {
    return {
      tone: "neutral",
      summary:
        "Only the legacy compatibility projection is materialized here. Prefer final-selection/profile truth before tuning semantics.",
    };
  }
  if (state.selectionMode === "rejected") {
    return {
      tone: "neutral",
      summary:
        "Final selection rejected this item. Revisit the profile only if you expect this pattern to pass consistently.",
    };
  }
  if (state.selectionMode === "gray_zone") {
    if (state.candidateSignalUpliftCount > 0) {
      return {
        tone: "warning",
        summary:
          "A recovered candidate remains unresolved in gray zone. Check whether canonical evidence or cluster context should turn this pattern into a cleaner escalation path.",
      };
    }
    return {
      tone: "warning",
      summary:
        "Gray zone remains unresolved. Check missing evidence and decide whether this profile should hold, reject, or escalate similar cases.",
    };
  }

  return {
    tone: "neutral",
    summary:
      "Selection is not materialized yet. Wait for the final-selection path before using this row for profile tuning decisions.",
  };
}

export function resolveArticleSelectionDiagnostics(
  explainLike: unknown,
  articleLike: unknown = null
): ArticleSelectionDiagnostics {
  const explain = asRecord(explainLike);
  const precomputed = asRecord(explain.selection_diagnostics);
  const articleState = resolveArticleOperatorState(articleLike);
  if (Object.keys(precomputed).length > 0) {
    return {
      source: asString(precomputed.source) ?? "pending",
      decision: asString(precomputed.decision),
      selectionMode: asString(precomputed.selectionMode) ?? "pending",
      selectionSummary:
        asString(precomputed.selectionSummary) ?? "Selection not explained yet",
      selectionReason: asString(precomputed.selectionReason),
      holdCount: asInteger(precomputed.holdCount) ?? 0,
      llmReviewPendingCount: asInteger(precomputed.llmReviewPendingCount) ?? 0,
      candidateSignalUpliftCount:
        asInteger(precomputed.candidateSignalUpliftCount) ?? 0,
      candidateRecoveryState:
        asString(precomputed.candidateRecoveryState) ?? "absent",
      candidateRecoverySummary:
        asString(precomputed.candidateRecoverySummary)
        ?? "Recovered candidate signals have not materialized on this item yet.",
      systemCriterionRows: asInteger(precomputed.systemCriterionRows) ?? 0,
      userInterestRows: asInteger(precomputed.userInterestRows) ?? 0,
      matchedRows: asInteger(precomputed.matchedRows) ?? 0,
      noMatchRows: asInteger(precomputed.noMatchRows) ?? 0,
      grayZoneRows: asInteger(precomputed.grayZoneRows) ?? 0,
      technicalFilteredOutRows:
        asInteger(precomputed.technicalFilteredOutRows) ?? 0,
      llmReviewRows: asInteger(precomputed.llmReviewRows) ?? 0,
      notificationRows: asInteger(precomputed.notificationRows) ?? 0,
    };
  }
  const selection = asRecord(explain.selection_explain);
  const filterResults = asArray(explain.interest_filter_results);

  let systemCriterionRows = 0;
  let userInterestRows = 0;
  let matchedRows = 0;
  let noMatchRows = 0;
  let grayZoneRows = 0;
  let technicalFilteredOutRows = 0;

  for (const rowLike of filterResults) {
    const row = asRecord(rowLike);
    const filterScope = asString(row.filter_scope);
    const semanticDecision = asString(row.semantic_decision);
    const technicalState = asString(row.technical_filter_state);

    if (filterScope === "system_criterion") {
      systemCriterionRows += 1;
    } else if (filterScope === "user_interest") {
      userInterestRows += 1;
    }

    if (semanticDecision === "match") {
      matchedRows += 1;
    } else if (semanticDecision === "no_match") {
      noMatchRows += 1;
    } else if (semanticDecision === "gray_zone") {
      grayZoneRows += 1;
    }

    if (technicalState === "filtered_out") {
      technicalFilteredOutRows += 1;
    }
  }

  return {
    source:
      asString(selection.source) ??
      (articleState.selectionSource === "pending" ? "pending" : articleState.selectionSource),
    decision: asString(selection.decision) ?? articleState.selectionDecision,
    selectionMode: asString(selection.selectionMode) ?? articleState.selectionMode,
    selectionSummary:
      asString(selection.selectionSummary) ?? articleState.selectionSummary,
    selectionReason: asString(selection.selectionReason) ?? articleState.selectionReason,
    holdCount: asInteger(selection.holdCount) ?? articleState.holdCount,
    llmReviewPendingCount:
      asInteger(selection.llmReviewPendingCount) ?? articleState.llmReviewPendingCount,
    candidateSignalUpliftCount:
      asInteger(selection.candidateSignalUpliftCount)
      ?? articleState.candidateSignalUpliftCount,
    candidateRecoveryState:
      asString(selection.candidateRecoveryState) ?? articleState.candidateRecoveryState,
    candidateRecoverySummary:
      asString(selection.candidateRecoverySummary)
      ?? articleState.candidateRecoverySummary,
    systemCriterionRows,
    userInterestRows,
    matchedRows,
    noMatchRows,
    grayZoneRows,
    technicalFilteredOutRows,
    llmReviewRows: asArray(explain.llm_reviews).length,
    notificationRows: asArray(explain.notifications).length,
  };
}
