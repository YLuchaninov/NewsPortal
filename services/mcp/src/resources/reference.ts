import type { McpResourceDefinition } from "./types";

export const referenceResources: readonly McpResourceDefinition[] = [
  {
    uri: "signalops://guide/reference/selection-evidence-semantics",
    name: "guide.reference.selection-evidence-semantics",
    title: "Selection Evidence Semantics",
    description: "Reference semantics for selection evidence fields, counters, and anti-patterns used by MCP clients.",
    mimeType: "application/json",
    read: async () => ({
      objective:
        "Prevent MCP clients from treating acquisition counters, lexical gates, or keyword edits as final selected-signal proof.",
      semantics: {
        must_have_terms:
          "Hard lexical any-of text constraint. A candidate passes this gate when any configured term appears in the evaluated title/lead/body text; it is not an all-terms AND requirement. Any-of is still a hard pre-semantic gate and is unsafe for hidden intent unless mandatory marker proof exists.",
        short_tokens_required:
          "Extracted short-token requirement. The configured tokens must be present in extracted short-token features, so it is dangerous as a broad OR keyword replacement. Multi-word phrase entries are invalid at MCP/admin write boundaries.",
        positive_texts:
          "Semantic prototypes for the interest. They should be representative snippets with item-level evidence, not keyword piles and not the primary recovery path for hidden operational signals.",
        candidateSignals:
          "Item-level evidence recovery path. Candidate positive/negative cue groups can move repeated near-miss items toward gray/hold/review, but they do not directly publish or select content.",
        "llmReviewMode=always":
          "Review mode is not a bypass. It does not override semantic_rejected/no_system_match; only candidates that reach a reviewable path can spend LLM budget.",
        backfillCounters:
          "criteriaMatches and interestMatches from backfill/reporting are processed-row or processor counters. They are not final selection proof and must be followed by residual, final_selection_results, content_items, or operator.report.verify read-back.",
        rowCountersVsDistinctCandidates:
          "filterReasonCounts, criteriaMatches, interestMatches and similar hard-filter totals are result-row counters. One candidate evaluated against many criteria can contribute many rows. Filter rows are not distinct candidates; use filterReasonBreakdown.distinctCandidateCount before estimating unique candidate impact.",
        sourceHealthReadBack:
          "Channel counts and failure status in a session report are historical evidence. Current active source count and active failures must be read back with channels.bottlenecks.summary/list before final reporting.",
        grayZoneCollapse:
          "A drop in gray_zone rows is ambiguous. It can mean better precision, lost recall, stale replay, hard-filter collapse, no reviewable path, or technical filtering.",
      },
      hiddenSignalRecovery: [
        "Read signalops://guide/reference/hidden-signal-evidence-lanes before recommending hard gates for explicit_marker, hidden_intent, mixed, or unknown signals.",
        "For hidden/unknown signals, the baseline is must_have_terms=[] and short_tokens_required=[].",
        "For mixed signals, split evidence paths into lane-like system interests/criteria/config-pack entries; hidden lanes must not inherit explicit-marker hard gates.",
        "For 0 selected, classify hard-filter collapse before semantic tuning: operator.selection.dashboard filterReasonBreakdown/filterReasonCounts, technicalFilterRows, semanticEvaluatedRows, distinctCandidateCount, and diagnosticHints.",
        "Start from signal_candidates.residuals.summary/list, then inspect 1-3 signal_candidates.explain rows.",
        "Read the affected system_interests.read record and system_interests.compile_status.list before writing.",
        "If short_tokens_required or content_kind dominates, repair token-like gates or allowed_content_kinds first; do not expand positive terms to bypass hard filters.",
        "Prefer candidateSignals, content/filter policy evidence, and near-miss negative cue groups over adding positive terms.",
        "If positive_texts change, use real representative snippets as secondary semantic prototypes, not short keyword phrases.",
        "Replay only bounded docIds from the diagnosed residual bucket.",
        "Verify through maintenance.reindex_jobs.list, operator.effect.verify, and operator.report.verify.",
      ],
      antiPatterns: [
        "Saying must_have_terms is AND when runtime semantics are any-of.",
        "Replacing must_have_terms with short_tokens_required as if short_tokens_required were a free OR keyword gate.",
        "Saving phrases such as 'vendor needs to provide' in short_tokens_required.",
        "Treating content-kind mismatch as a reason to relabel RSS/API editorial candidates instead of fixing operator config or source projection.",
        "Treating criteriaMatches or interestMatches backfill counters as selected-signal proof.",
        "Treating filter row counts as unique candidate counts.",
        "Globally removing wrapper/source-navigation filters from row counts without rejected samples proving false negatives.",
        "Reporting active source counts or active failures from stale session notes without channels.bottlenecks.summary/list read-back.",
        "Reporting gray_zone collapse as more precise without selected and near-miss sample proof.",
        "For hidden operational signals, recommending positive-term expansion before candidateSignals and representative residual explains.",
        "Assuming OR hard gates are hidden-signal safe.",
        "Applying one global must_have_terms gate to mixed signal lanes.",
        "Using positive_texts as short keyword piles.",
        "Treating HTTP 404 in llm_review_log as budget pressure instead of provider_endpoint_error/provider_404.",
        "Treating 0 LLM spend as an LLM outage before checking no_pending_gray_zone or semantic rejection before LLM.",
      ],
      nextReadBack: [
        "signal_candidates.residuals.summary",
        "signal_candidates.residuals.list",
        "signal_candidates.explain",
        "system_interests.read",
        "system_interests.compile_status.list",
        "maintenance.reindex_jobs.list",
        "operator.report.verify",
      ],
    }),
  },
  {
    uri: "signalops://guide/reference/hidden-signal-evidence-lanes",
    name: "guide.reference.hidden-signal-evidence-lanes",
    title: "Hidden Signal Evidence Lanes",
    description:
      "Domain-neutral reference for explicit, hidden, mixed and unknown signal visibility, evidence lanes, hard-gate safety and candidateSignals cue contracts.",
    mimeType: "application/json",
    read: async () => ({
      objective:
        "Prevent MCP clients from using global hard lexical gates or keyword piles when the monitored signal may be hidden, operational, rare, or mixed.",
      taxonomy: {
        signalVisibility: {
          explicit_marker:
            "The signal has a proven mandatory observable marker. Hard gates may be considered only after sample proof.",
          hidden_intent:
            "The signal is indirect or operational. Relevant items may not contain a stable lexical marker, so hard lexical gates are forbidden by default.",
          mixed:
            "The signal has both explicit and hidden evidence paths. It must be split into lane-like system interests, criteria or scenario-pack entries rather than using one global hard gate.",
          unknown:
            "The client has not proven visibility yet. Treat as hidden-safe until representative samples prove otherwise.",
        },
        evidenceLaneType: {
          explicit_marker_lane:
            "Lane for a proven mandatory marker, with mandatory-marker proof and bounded replay before/after hard gates.",
          hidden_intent_lane:
            "Lane for indirect item-level evidence, using representative prototypes, literal candidateSignals cue groups, source/context evidence, near-miss negatives, gray/hold/review.",
          source_context_lane:
            "Lane for source authority, listing shape, document shape or channel context; source proof remains separate from selected proof.",
          negative_control_lane:
            "Lane for generic advice, source wrappers, stale items, seller-authored pages, jobs, or other near-miss negatives.",
        },
        hardGatePolicy: {
          forbidden_by_default:
            "Default for hidden_intent, mixed hidden lanes and unknown signals. Use must_have_terms=[] and short_tokens_required=[].",
          allowed_with_mandatory_marker_proof:
            "Allowed only for explicit_marker lanes after representative samples prove the marker is mandatory and bounded replay proves recall is not collapsing.",
          allowed:
            "Allowed only when the operator has explicit proof and accepts the precision/recall tradeoff for that lane.",
        },
      },
      mandatoryRules: [
        "must_have_terms is any-of, but still a hard pre-semantic gate.",
        "OR hard gate is not hidden-signal safe.",
        "For hidden, rare, operational or unknown signals, empty hard gates are the baseline: must_have_terms=[] and short_tokens_required=[].",
        "Mandatory marker gates require explicit sample proof, current read-back and bounded replay before they can be trusted.",
        "Mixed signals must be split into lanes; hidden lanes must not inherit explicit-marker gates.",
        "In v1, lane split is configuration-level: separate system interests, criteria, or scenario-pack entries. Do not implement domain-specific runtime defaults.",
      ],
      candidateSignalsContract: [
        "candidateSignals group.name is a conceptual label.",
        "candidateSignals group.cues must be literal observable text fragments that could appear in title, lead or body text.",
        "Snake_case or id-like values such as rfp_published or vendor_search are usually labels, not observable cues, and should trigger read-back warnings.",
        "A single-cue group is weak evidence diversity; verify with rejected samples and bounded replay.",
        "candidateSignals can recover candidates toward gray/hold/review paths, and can select only through an explicit auto-select policy with clean evidence thresholds and veto checks.",
      ],
      defaultNextSteps: [
        "Read operator.selection.dashboard and check stale profile versions before tuning.",
        "Classify signalVisibility before proposing must_have_terms, short_tokens_required or strictness changes.",
        "If signalVisibility is mixed, split evidence lanes first.",
        "Inspect 10-20 representative rejected docs when candidateSignals hit rate is zero.",
        "Replace label-like cues with literal observed fragments and near-miss negatives.",
        "Replay 25-50 explicit docIds and verify with maintenance.reindex_jobs.list plus operator.report.verify includeSamples=true.",
      ],
      doNotDoFirst: [
        "Do not add broad must-have terms for hidden or unknown signals.",
        "Do not replace must_have_terms with short_tokens_required as a hidden-signal recovery trick.",
        "Do not switch strictness=broad as the first response.",
        "Do not rewrite LLM templates or increase LLM budget before candidates reach a reviewable path.",
        "Do not add more source volume before selection proof identifies acquisition as the bottleneck.",
        "Do not treat discovery.brief.preview as persisted Discovery proof.",
      ],
    }),
  },
];
