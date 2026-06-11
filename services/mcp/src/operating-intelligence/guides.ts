import {
  OPERATING_DOMAIN_REGISTRY,
  OPERATING_DOMAIN_VALUES,
  type OperatingDomain,
} from "./model";

export function getOperatingModelGuide() {
  return {
    model: "observe -> diagnose -> recommend -> guarded change -> verify effect -> monitor",
    domains: OPERATING_DOMAIN_REGISTRY,
    operatingRules: [
      "Operational tools are read-only unless their normal MCP tool name already advertises a write scope.",
      "Diagnosis must state source-of-truth evidence and stale-data warnings.",
      "Tuning recommendations can include suggestedToolCalls, but they never execute them.",
      "After writes, clients should read the affected entity plus signalops://ops/health and signalops://ops/issues.",
    ],
    fallbackForLimitedClients: {
      notifications:
        "If resources/subscribe is not supported, mutation responses include nextReadBack resources/tools.",
      elicitation:
        "If client-side elicitation is unavailable, operator.tuning.recommend returns tuningChoices and asks the client to choose an objective before writing.",
    },
  };
}

export function getDiagnosticsGuide(domain: string) {
  const guide = OPERATING_DOMAIN_REGISTRY[domain as OperatingDomain];
  return guide
    ? {
        domain,
        guide,
        diagnosticFlow: [
          "Start with operator.system.health scoped to this domain.",
          "Use operator.issue.explain for the concrete symptom.",
          "Inspect the suggested samples with domain list/read/explain tools.",
          "Call operator.tuning.recommend only after the repeated evidence pattern is clear.",
        ],
      }
    : {
        domain,
        knownDomains: OPERATING_DOMAIN_VALUES,
        error: "Unknown operating domain.",
      };
}

export function getTuningGuide(domain: string) {
  const guide = OPERATING_DOMAIN_REGISTRY[domain as OperatingDomain];
  const selectionAddendum =
    domain === "selection"
      ? {
          zeroSelectedCalibration: [
            "Read admin.summary.get, signal_candidates.residuals.summary/list, and 1-3 representative signal_candidates.explain rows before writes.",
            "For semantic_rejected/no_system_match, inspect the affected system_interests.read output, compile status, and candidateSignals before changing strictness or templates.",
            "Apply one-interest/one-candidate calibration only: bounded write, MCP read-back, bounded maintenance.reindex.request docIds replay, then operator.report.verify.",
          ],
          semanticRejectedNoSystemMatch: {
            meaning:
              "The item did not reach a matching criterion or reviewable gray-zone path, so LLM template tuning alone cannot recover it.",
            recovery:
              "Use signal families, representative positive prototypes, near-miss negatives, and candidateSignals cue groups to create item-level evidence for the affected interest.",
            invariant: "llmReviewMode=always does not bypass semantic_rejected/no_system_match.",
          },
          llmDiagnostics: [
            "0 LLM spend can mean no_pending_gray_zone, semantic rejection before LLM, llm_review_disabled, budget_exhausted, worker_not_running, or provider_credentials_missing.",
            "Classify the reason with llm_budget.summary, operator.system.health, operator.issue.explain, and representative explains before editing budgets/templates.",
          ],
          antiPatterns: [
            "Do not mass-set strictness=broad for 0 selected.",
            "Do not mass edit interests or rewrite LLM templates without representative explains.",
            "Do not treat RSS/channel volume as selected-signal proof.",
            "Do not mask API/portal/search sources as RSS/website.",
          ],
          primaryScenario: "signalops://guide/scenarios/selection-calibration",
        }
      : {};
  return guide
    ? {
        domain,
        tuningLevers: guide.tuningLevers,
        readBackChecks: guide.readBackChecks,
        safeTuningRules: [
          "Choose one objective per tuning session.",
          "Prefer narrow configuration changes over broad rewrites.",
          "Do not use downstream diagnostics as automatic approval; use them as operator evidence.",
          "Verify effect with operator.effect.verify after applying guarded writes.",
        ],
        objectives: [
          "increase_recall",
          "increase_precision",
          "reduce_cost",
          "debug_source",
          "stabilize_discovery",
        ],
        ...selectionAddendum,
      }
    : {
        domain,
        knownDomains: OPERATING_DOMAIN_VALUES,
        error: "Unknown operating domain.",
      };
}
