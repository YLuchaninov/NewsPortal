import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveArticleOperatorGuidance,
  resolveArticleOperatorState,
  resolveArticleSelectionDiagnostics,
} from "../../../apps/admin/src/lib/server/operator-surfaces.ts";

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
