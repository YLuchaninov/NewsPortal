import { readOptionalString, readRequiredString } from "../protocol";
import type { McpPromptDefinition } from "./types";

export const selectionTuningPrompts: readonly McpPromptDefinition[] = [
  {
    name: "selection.tuning.plan",
    description: "Plan a safe selection fine-tuning session from residual/signal_candidate evidence.",
    arguments: [
      { name: "objective", description: "increase_recall or increase_precision.", required: true },
      { name: "residualBucket", description: "Observed residual/downstream-loss bucket." },
    ],
    render: (args) => {
      const objective = readRequiredString(args.objective, "objective");
      const residualBucket = readOptionalString(args.residualBucket) ?? "dominant residual bucket";
      return {
        description: "Selection tuning plan",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Prepare a read-first selection tuning plan for objective "${objective}" and residual pattern "${residualBucket}". ` +
                `Call operator.flow.route first with domain=selection, objective, residualBucket and symptoms when known, then report the route block before any mutation proposal. Read signalops://guide/playbooks/flow-routing, signalops://guide/playbooks/operator-flow-modes, signalops://guide/playbooks/change-intents, signalops://guide/playbooks/strict-next-steps, signalops://guide/scenarios/selection-calibration, signalops://guide/reference/selection-evidence-semantics, signalops://guide/tuning/selection, signal_candidates.residuals.summary, representative signal_candidates.explain rows, and operator.tuning.recommend. ` +
                `Choose flowMode: diagnostic for current 0 selected/residual failures, planned_change for deliberate improvements on a working system, and expert_override only with operatorOverrideReason; planned_change still requires bounded proof but does not need to pretend this is emergency zero-selected diagnosis. ` +
                `Use changeIntent=selection_tuning and a tuningLayer such as technical_filter, semantic_match, candidate_signal, gray_zone_review, or final_selection. ` +
                `Classify signalVisibility as explicit_marker, hidden_intent, mixed, or unknown; for hidden/unknown use must_have_terms=[] and short_tokens_required=[] as baseline, and for mixed split lane-like interests/criteria/config entries before any global hard gate. ` +
                `Check scoreThresholdDiagnostics, staleProfileDiagnostics, candidateSignalsHitRate, zeroHitCueGroups, and labelLikeCueWarnings before proposing writes. ` +
                `If the residual is technical_filter_rejected, short_tokens_required, content_kind, time_window, must_have, wrapper, or must_not collapse, diagnose filterReasonBreakdown/filterReasonCounts/top affected criteria before semantic tuning; filter rows are not distinct candidates, short_tokens_required accepts token-like values only, and content-kind mismatch is operator config/source projection evidence. ` +
                `If the residual is semantic_rejected/no_system_match, do not start with strictness=broad, LLM template rewrites, positive-term expansion, hard lexical gates, or more RSS; inspect the affected interest/compile status and candidateSignals, then calibrate one interest against representative candidates using literal cue fragments, policy evidence and near-miss negatives. ` +
                `Any system_interests.update proposal must use canonical MCP fields candidate_positive_signals/candidate_negative_signals or structured candidate_positive_signal_groups/candidate_negative_signal_groups, selection_profile_llm_review_mode, selection_profile_auto_select_mode, selection_profile_signal_visibility, and allowed_content_kinds; never candidateSignals, selectionProfile, llmReviewMode, or allowedContentKinds. ` +
                `Do not treat criteriaMatches/interestMatches/filterReasonCounts as selected proof, do not remove wrapper filters or switch broad from row counts alone, and do not infer success from gray-zone collapse without rejected/selected/near-miss samples. ` +
                `Return suggested guarded MCP writes only as proposals, require MCP read-back, replay bounded docIds chunks, and verify with operator.report.verify plus operator.effect.verify after any applied change.`,
            },
          },
        ],
      };
    },
  },
];

export const systemInterestPrompts: readonly McpPromptDefinition[] = [
  {
    name: "system_interest.create",
    description: "Draft a bounded system-interest payload before calling MCP write tools.",
    arguments: [
      { name: "topic", description: "Core monitoring topic.", required: true },
      { name: "audience", description: "Who the signal is for." },
    ],
    render: (args) => {
      const topic = readRequiredString(args.topic, "topic");
      const audience = readOptionalString(args.audience) ?? "operators";
      return {
        description: "System interest drafting guide",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Draft a SignalOps system interest for topic "${topic}" aimed at ${audience}. ` +
                `Return a concise interest payload with signal families, representative positive prototypes, near-miss negative prototypes, must-not terms, candidate uplift positive/negative cue groups, allowed content kinds, places, languages, strictness/review-policy recommendation, and priority. ` +
                `Do not use positive_texts as short keyword piles; include real item-level evidence patterns and candidate cue groups that can support bounded candidateSignals recovery. candidateSignals group.name is a conceptual label; group.cues must be literal observable text fragments, not snake_case concept ids. Hidden/operational signals need evidence groups and near-miss negatives, not keyword piles or primary positive-term expansion. ` +
                `Classify signalVisibility. For hidden/unknown signals, keep must_have_terms=[] and short_tokens_required=[] as baseline; for mixed signals split lane-like interests/criteria/config entries; for explicit markers use hard gates only after mandatory-marker proof and bounded replay.`,
            },
          },
        ],
      };
    },
  },
  {
    name: "system_interest.polish",
    description: "Turn signal_candidate residual evidence into a bounded system-interest tuning recommendation.",
    arguments: [
      { name: "interestName", description: "Interest or topic being tuned.", required: true },
      { name: "residualPattern", description: "Observed blocker bucket or repeated evidence pattern.", required: true },
    ],
    render: (args) => {
      const interestName = readRequiredString(args.interestName, "interestName");
      const residualPattern = readRequiredString(args.residualPattern, "residualPattern");
      return {
        description: "System-interest tuning guide",
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Use signalops://guide/scenarios/signal_candidate-diagnostics and the current signal_candidate/content diagnostics to tune the system interest "${interestName}". ` +
                `The repeated residual pattern is "${residualPattern}". ` +
                `Return a bounded recommendation covering: what evidence suggests the current scope is too narrow or too broad, which positive/negative signals and candidate cue groups should change, whether short-form buyer/project evidence should recover items into gray/LLM/hold despite weak semantic similarity, whether hard gates such as must-have terms or time windows would harm recall for rare signals, what should stay unchanged, and what follow-up read-after-write checks an operator should perform. Do not auto-write changes.`,
            },
          },
        ],
      };
    },
  },
];
