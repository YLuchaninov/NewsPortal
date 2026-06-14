import type { OperatingDomain, OperatorFlowMode } from "./model";
import { normalizeText } from "./value-normalization";

export function buildStrictRecommendationLevels(
  domain: OperatingDomain,
  objective: string,
  residualBucket: string | null,
  flowMode: OperatorFlowMode = "diagnostic",
  operatorOverrideAllowed = false
) {
  if (flowMode === "expert_override") {
    return {
      must_do_next: [
        operatorOverrideAllowed
          ? "Read back affected entities immediately after the explicit operator override action, then verify with operator.report.verify before reporting success."
          : "Collect operatorOverrideReason and affectedScope before treating expert override as allowed.",
      ],
      allowed_after: [
        "Apply only the explicitly chosen bounded action after the operator names expected effect, read-back target, verification target, and rollback or previous-state hint.",
        "Continue or expand only after MCP read-back and report verification show the intended effect.",
      ],
      do_not_do_yet: [
        "Do not treat expert override as permission for unbounded mass edits, domain-specific runtime defaults, or skipped final verification.",
      ],
      blocked_until: operatorOverrideAllowed
        ? ["Blocked from success claims until read-back and operator.report.verify proof exist."]
        : [
            "Blocked until operatorOverrideReason, affectedScope, read-back target, verification target, and rollback or previous-state hint are explicit.",
          ],
    };
  }
  if (flowMode === "planned_change") {
    return {
      must_do_next: [
        "State the operator intent, read the affected current config/state, and propose one scoped staged write before any broader rollout.",
      ],
      allowed_after: [
        "One bounded MCP/admin write after current read-back confirms the affected owner.",
        "Sample replay or source probe after write read-back confirms persisted state.",
        "Expand scope only after operator.report.verify or operator.effect.verify confirms expected movement.",
      ],
      do_not_do_yet: [
        "Do not present a mutation response as verified effect.",
        "Do not run emergency zero-selected diagnosis unless current read-back shows a diagnostic failure state.",
      ],
      blocked_until: [
        "Blocked from rollout claims until current-state read-back, write read-back, sample replay/probe, and report verification exist.",
      ],
    };
  }
  if (flowMode === "source_onboarding") {
    return {
      must_do_next: [
        "Plan source/provider shape, probe or review alternatives, then apply only through MCP/admin onboarding with read-back.",
      ],
      allowed_after: [
        "channels.bulk_onboard.plan/apply/verify or Discovery vNext routing handoff after source evidence is current.",
        "Downstream selection tuning only after persisted candidates/resources prove acquisition worked.",
      ],
      do_not_do_yet: [
        "Do not auto-create website/RSS/API alternatives from stale reports or invalid feed URLs without probe/read-back evidence.",
        "Do not report source acquisition as selected-signal proof.",
      ],
      blocked_until: [
        "Blocked until source bottlenecks/alternatives, apply read-back, fetch/resource or source inventory proof, and downstream report verification exist.",
      ],
    };
  }
  if (flowMode === "scenario_pack_rollout") {
    return {
      must_do_next: [
        "Load the scenario pack as operator config evidence, preview the diff against current MCP/admin state, and request explicit approval before writes.",
      ],
      allowed_after: [
        "Apply approved config only through MCP/admin, read back persisted state, run bounded replay, then verify with samples.",
      ],
      do_not_do_yet: [
        "Do not encode scenario vocabulary into runtime defaults, prompts, required tests, or hardcoded policies.",
      ],
      blocked_until: [
        "Blocked until preview diff, approved config scope, read-back, bounded replay and report verification exist.",
      ],
    };
  }
  if (flowMode === "cleanup") {
    return {
      must_do_next: [
        "Build a read-only inventory, separate reversible archive/deactivate actions from destructive actions, and verify final lifecycle state.",
      ],
      allowed_after: [
        "Use destructive tools only with existing scopes and confirm=true after inventory proves the target is disposable.",
      ],
      do_not_do_yet: [
        "Do not delete protected/default/system objects or retained audit evidence without explicit operator confirmation.",
      ],
      blocked_until: [
        "Blocked until inventory, chosen reversible/destructive action list, read-back, and cleanup report verification exist.",
      ],
    };
  }
  const normalizedResidual = normalizeText(residualBucket);
  const selectionRecall =
    domain === "selection" &&
    (objective === "increase_recall" ||
      normalizedResidual.includes("0 selected") ||
      normalizedResidual.includes("zero selected") ||
      normalizedResidual.includes("semantic_rejected") ||
      normalizedResidual.includes("no_system_match") ||
      normalizedResidual.includes("technical_filter_rejected"));
  if (selectionRecall) {
    return {
      must_do_next: [
        "Read operator.selection.dashboard, signal_candidates.residuals.summary/list, 1-3 signal_candidates.explain rows, system_interests.read, and system_interests.compile_status.list before proposing any write.",
        "If a write was already attempted, verify actual profile/candidateSignals/compile status with MCP read-back before replay.",
      ],
      allowed_after: [
        "One bounded system_interests.update using canonical fields after representative evidence identifies the affected interest.",
        "maintenance.reindex.request with 25-50 explicit docIds after write read-back confirms persisted state.",
        "operator.report.verify reportKind=selection includeSamples=true after maintenance.reindex_jobs.list shows completion.",
      ],
      do_not_do_yet: [
        "Do not mass edit interests, switch strictness=broad, expand positive terms, rewrite LLM templates, or add more RSS as the first response.",
        "Do not report LLM failure from zero spend until no_reviewable_path, review_disabled, budget_exhausted, worker_not_running, provider_credentials_missing, and provider_endpoint_error are classified.",
      ],
      blocked_until: [
        "Blocked until residual summary/list, representative explains, affected interest read-back, compile/profile read-back, bounded docIds replay result, and operator.report.verify proof exist.",
      ],
    };
  }
  if (
    domain === "llm_budget" ||
    objective === "reduce_cost" ||
    normalizedResidual.includes("0 llm") ||
    normalizedResidual.includes("zero llm")
  ) {
    return {
      must_do_next: [
        "Classify absent LLM review as no_reviewable_path, review_disabled, budget_exhausted, worker_not_running, provider_credentials_missing, or provider_endpoint_error before changing budget/templates.",
      ],
      allowed_after: [
        "Tune budget or templates only after candidates are proven to reach a reviewable gray/hold path or provider endpoint errors are isolated.",
      ],
      do_not_do_yet: [
        "Do not call LLM broken and do not tune spend from zero LLM usage alone.",
        "Do not rewrite LLM templates to bypass semantic_rejected/no_system_match.",
      ],
      blocked_until: [
        "Blocked until llm_budget.summary, operator.system.health, operator.issue.explain, residuals, and representative explains identify the exact LLM-review layer.",
      ],
    };
  }
  if (domain === "discovery" || objective === "stabilize_discovery") {
    return {
      must_do_next: [
        "Report Discovery status with candidate count, distinct persisted candidates, probe coverage, warnings, routing decisions, and handoff counts.",
        "Treat passed_with_quality_gap as partial proof only.",
      ],
      allowed_after: [
        "Run channels.bottlenecks.* and channels.alternatives.plan for broken RSS/API/website shape.",
        "Register/apply sources only through MCP/admin, then sync/read-back/verify.",
      ],
      do_not_do_yet: [
        "Do not use discovery.brief.preview as a bypass for domain_contamination or persisted artifact validation.",
        "Do not auto-trust listing/website sources without SourceUnderstanding and downstream selection proof.",
      ],
      blocked_until: [
        "Blocked until Discovery run read-back, source inventory/routing evidence, probe coverage warnings, and source/channel verification are available.",
      ],
    };
  }
  return {
    must_do_next: [
      "Read current state, classify the failing layer, and call operator.report.verify before proposing writes.",
    ],
    allowed_after: ["Apply one bounded MCP/admin write only after read-back evidence identifies the owner."],
    do_not_do_yet: ["Do not mass edit configuration or report success from intent without MCP read-back."],
    blocked_until: ["Blocked until read-back and verification proof exist."],
  };
}
