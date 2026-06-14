import { computeFunnelLiveStateHash } from "./funnel-live-state";
import type { FunnelAutoplanResult, Queryable } from "./funnel-model";
import { buildLaneDraft, hashValue, titleFromIdea } from "./funnel-model";
import { resolveFunnelPreset } from "./funnel-presets";

export async function buildOperatorFunnelAutoplan(
  queryable: Queryable,
  input: {
    idea?: unknown;
    funnelId?: unknown;
    operatorExperience?: unknown;
  }
): Promise<FunnelAutoplanResult> {
  const idea = String(input.idea ?? "").trim();
  const operatorExperience =
    String(input.operatorExperience ?? "novice").trim() === "expert" ? "expert" : "novice";
  const funnelId = String(input.funnelId ?? "").trim() || null;
  const liveStateHash = await computeFunnelLiveStateHash(queryable);
  const preset = resolveFunnelPreset("default");
  const laneTypes = preset.classifyIdea(idea);
  const lanes = laneTypes.map(buildLaneDraft);
  const primaryLaneType = laneTypes[0] ?? "unknown";
  const groups = preset.buildCandidateSignalGroups(primaryLaneType);
  const title = titleFromIdea(idea);
  const planCore = {
    version: "2.0",
    idea,
    funnelId,
    lanes,
    operatorExperience,
    generatedAt: new Date().toISOString(),
  };
  const planFingerprint = hashValue({ liveStateHash, planCore });
  const requiresLlmReview = lanes.some((lane) => lane.routingMode === "llm_approved");
  return {
    readOnly: true,
    generatedAt: planCore.generatedAt,
    planFingerprint,
    liveStateHash,
    operatorExperience,
    funnelId,
    funnelDraft: funnelId
      ? null
      : {
          name: title,
          goal: idea,
          status: "draft",
        },
    suggestedAction:
      laneTypes.length > 1 ? "split_or_choose" : primaryLaneType === "unknown" ? "calibrate" : funnelId ? "attach_existing" : "create_new",
    lanes,
    systemInterestDrafts: lanes.map((lane) => ({
      name: `${title} / ${lane.name}`,
      description: idea || `Autopilot generated ${lane.name} lane.`,
      positive_texts: [idea || "Representative item-level evidence for this funnel lane."],
      negative_texts: ["Generic commentary without active item-level evidence."],
      must_have_terms: [],
      short_tokens_required: [],
      allowed_content_kinds: ["editorial", "listing", "document", "data_file", "api_payload"],
      candidate_positive_signal_groups: groups.positive,
      candidate_negative_signal_groups: groups.negative,
      selection_profile_signal_visibility: lane.policy.signalVisibility,
      selection_profile_auto_select_mode: lane.policy.autoSelectMode,
      selection_profile_llm_review_mode: lane.policy.llmReviewMode,
      selection_profile_auto_select_min_positive_groups: lane.policy.autoSelectMinPositiveGroups,
      selection_profile_auto_select_min_cue_hits: lane.policy.autoSelectMinCueHits,
      selection_profile_auto_select_requires_no_noise: lane.policy.autoSelectRequiresNoNoise,
      selection_profile_auto_select_requires_no_technical_veto:
        lane.policy.autoSelectRequiresNoTechnicalVeto,
    })),
    llmTemplateDrafts: requiresLlmReview
      ? [
          {
            name: `${title} selection review`,
            scope: "criteria",
            purpose: "selection_review",
            templateText:
              'Review this candidate for the configured funnel lane. Return JSON only: {"decision":"approve|reject|uncertain","score":0.0,"reason":"..."}.\nTitle: {title}\nLead: {lead}\nBody: {body}\nContext: {context}',
          },
        ]
      : [],
    sourcePlan: {
      sourceRoles: [
        "direct_intent",
        "formal_notice",
        "community_hidden_signal",
        "context_only",
        "negative_control",
        "adapter_required",
        "technical_repair",
      ],
      guidance:
        "Sources can be shared acquisition inventory, but sourceRole is bound per funnel and is not semantic proof.",
    },
    replayPlan: {
      mode: "bounded",
      maxDocIdsPerChunk: requiresLlmReview ? 25 : 50,
      fullReplayRequiresOverride: true,
      tool: "maintenance.reindex.request",
    },
    verificationPlan: {
      tools: [
        "operator.funnel.verify",
        "operator.report.verify",
        "operator.selection.precision_audit",
        "signal_candidates.holds.summary",
      ],
    },
    doNotDoYet: [
      "Do not broaden hidden lanes with hard keyword gates.",
      "Do not treat source acquisition proof as selected-signal proof.",
      "Do not run full replay before bounded replay proves the direction.",
    ],
    blockedUntil: [
      "Plan validates as ready.",
      "Affected entities are read back after write.",
      "Bounded replay/report verification proves effect.",
    ],
    manualTuningPath: {
      supported: true,
      route: "manual_tuning",
      tools: ["system_interests.update", "llm_templates.update", "channels.bulk_onboard.apply"],
      requirements: ["funnelId or explicit shared/global scope", "read-back", "verification target"],
    },
  };
}
