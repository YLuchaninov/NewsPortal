type LooseRecord = Record<string, unknown>;

function asRecord(value: unknown): LooseRecord {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as LooseRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
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

export interface SignalCandidateOperatorState {
  selectionSource: "final_selection_results" | "system_feed_results" | "pending";
  selectionReuseSource: "signal_candidate_level" | "canonical_reused";
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
  duplicateSignalCandidateCountForCanonical: number;
  observationState: string | null;
  duplicateKind: string | null;
  canonicalDocumentId: string | null;
  storyClusterId: string | null;
  verificationState: string | null;
  processingState: string | null;
  enrichmentState: string | null;
}

export interface SignalCandidateSelectionDiagnostics {
  source: string;
  decision: string | null;
  selectionMode: string;
  selectionSummary: string;
  selectionReason: string | null;
  downstreamLossBucket: string | null;
  selectionBlockerStage: string | null;
  selectionBlockerReason: string | null;
  holdReason: string | null;
  semanticSignalSummary: Record<string, unknown>;
  verificationSignalSummary: Record<string, unknown>;
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

export interface SignalCandidateOperatorGuidance {
  tone: "positive" | "warning" | "neutral";
  summary: string;
}

export function resolveSignalCandidateOperatorState(signalCandidateLike: unknown): SignalCandidateOperatorState {
  const signal_candidate = asRecord(signalCandidateLike);
  const genericSelectionSource = asString(signal_candidate.selection_source);
  const genericSelectionDecision = asString(signal_candidate.selection_decision);
  const genericSelectionMode = asString(signal_candidate.selection_mode);
  const genericSelectionSummary = asString(signal_candidate.selection_summary);
  const genericSelectionReason = asString(signal_candidate.selection_reason);
  const finalDecision = asString(signal_candidate.final_selection_decision);
  const compatDecision = asString(signal_candidate.system_feed_decision);
  const selectionReason = genericSelectionReason ?? asString(signal_candidate.final_selection_reason);
  const precomputedSelectionMode = asString(signal_candidate.final_selection_mode);
  const precomputedSelectionSummary = asString(signal_candidate.final_selection_summary);
  const llmReviewPendingCount =
    asInteger(signal_candidate.selection_llm_review_pending_count) ??
    asInteger(signal_candidate.final_selection_llm_review_pending_count) ??
    0;
  const holdCount =
    asInteger(signal_candidate.selection_hold_count) ?? asInteger(signal_candidate.final_selection_hold_count) ?? 0;
  const candidateSignalUpliftCount =
    asInteger(signal_candidate.selection_candidate_signal_uplift_count) ?? 0;
  const canonicalReviewReused = asBoolean(signal_candidate.selection_canonical_review_reused);
  const canonicalReviewReusedCount =
    asInteger(signal_candidate.selection_canonical_review_reused_count) ?? 0;
  const canonicalSelectionReused = asBoolean(signal_candidate.selection_canonical_reused);
  const duplicateSignalCandidateCountForCanonical =
    asInteger(signal_candidate.selection_duplicate_signal_candidate_count_for_canonical) ?? 0;
  const selectionReuseSource =
    (asString(signal_candidate.selection_reuse_source) as
      | SignalCandidateOperatorState["selectionReuseSource"]
      | null) ?? "signal_candidate_level";
  const reviewSource =
    (asString(signal_candidate.selection_review_source) as
      | SignalCandidateOperatorState["reviewSource"]
      | null) ??
    (canonicalReviewReused ? "reused_canonical_llm_review" : null);

  let selectionMode: SignalCandidateOperatorState["selectionMode"] =
    (genericSelectionMode as SignalCandidateOperatorState["selectionMode"] | null) ??
    (precomputedSelectionMode as SignalCandidateOperatorState["selectionMode"] | null) ??
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
      (genericSelectionSource as SignalCandidateOperatorState["selectionSource"] | null) ??
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
    duplicateSignalCandidateCountForCanonical,
    selectionReuseSource,
    reviewSource,
    observationState: asString(signal_candidate.observation_state),
    duplicateKind: asString(signal_candidate.duplicate_kind),
    canonicalDocumentId: asString(signal_candidate.canonical_document_id),
    storyClusterId: asString(signal_candidate.story_cluster_id),
    verificationState:
      asString(signal_candidate.final_selection_verification_state) ??
      asString(signal_candidate.story_cluster_verification_state) ??
      asString(signal_candidate.canonical_verification_state),
    processingState: asString(signal_candidate.processing_state),
    enrichmentState: asString(signal_candidate.enrichment_state),
  };
}

export function resolveSignalCandidateOperatorGuidance(
  stateLike: SignalCandidateOperatorState | unknown
): SignalCandidateOperatorGuidance {
  const precomputed = asRecord(
    asRecord(stateLike).selection_guidance ?? asRecord(stateLike).selectionGuidance
  );
  if (Object.keys(precomputed).length > 0) {
    return {
      tone:
        (asString(precomputed.tone) as SignalCandidateOperatorGuidance["tone"] | null) ??
        "neutral",
      summary:
        asString(precomputed.summary) ??
        "Selection guidance is not available yet.",
    };
  }

  const state =
    stateLike && typeof stateLike === "object" && "selectionMode" in (stateLike as object)
      ? (stateLike as SignalCandidateOperatorState)
      : resolveSignalCandidateOperatorState(stateLike);

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

export function resolveSignalCandidateSelectionDiagnostics(
  explainLike: unknown,
  signalCandidateLike: unknown = null
): SignalCandidateSelectionDiagnostics {
  const explain = asRecord(explainLike);
  const precomputed = asRecord(explain.selection_diagnostics);
  const signalCandidateState = resolveSignalCandidateOperatorState(signalCandidateLike);
  if (Object.keys(precomputed).length > 0) {
    return {
      source: asString(precomputed.source) ?? "pending",
      decision: asString(precomputed.decision),
      selectionMode: asString(precomputed.selectionMode) ?? "pending",
      selectionSummary:
        asString(precomputed.selectionSummary) ?? "Selection not explained yet",
      selectionReason: asString(precomputed.selectionReason),
      downstreamLossBucket: asString(precomputed.downstreamLossBucket),
      selectionBlockerStage: asString(precomputed.selectionBlockerStage),
      selectionBlockerReason: asString(precomputed.selectionBlockerReason),
      holdReason: asString(precomputed.holdReason),
      semanticSignalSummary: asRecord(precomputed.semanticSignalSummary),
      verificationSignalSummary: asRecord(precomputed.verificationSignalSummary),
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
      (signalCandidateState.selectionSource === "pending" ? "pending" : signalCandidateState.selectionSource),
    decision: asString(selection.decision) ?? signalCandidateState.selectionDecision,
    selectionMode: asString(selection.selectionMode) ?? signalCandidateState.selectionMode,
    selectionSummary:
      asString(selection.selectionSummary) ?? signalCandidateState.selectionSummary,
    selectionReason: asString(selection.selectionReason) ?? signalCandidateState.selectionReason,
    downstreamLossBucket: asString(selection.downstreamLossBucket),
    selectionBlockerStage: asString(selection.selectionBlockerStage),
    selectionBlockerReason: asString(selection.selectionBlockerReason),
    holdReason: asString(selection.holdReason),
    semanticSignalSummary: asRecord(selection.semanticSignalSummary),
    verificationSignalSummary: asRecord(selection.verificationSignalSummary),
    holdCount: asInteger(selection.holdCount) ?? signalCandidateState.holdCount,
    llmReviewPendingCount:
      asInteger(selection.llmReviewPendingCount) ?? signalCandidateState.llmReviewPendingCount,
    candidateSignalUpliftCount:
      asInteger(selection.candidateSignalUpliftCount)
      ?? signalCandidateState.candidateSignalUpliftCount,
    candidateRecoveryState:
      asString(selection.candidateRecoveryState) ?? signalCandidateState.candidateRecoveryState,
    candidateRecoverySummary:
      asString(selection.candidateRecoverySummary)
      ?? signalCandidateState.candidateRecoverySummary,
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
