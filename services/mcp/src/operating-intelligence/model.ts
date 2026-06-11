export const OPERATING_DOMAIN_VALUES = [
  "channels",
  "website_pipeline",
  "selection",
  "content_analysis",
  "llm_budget",
  "discovery",
  "sequences",
  "cleanup",
] as const;

export type OperatingDomain = (typeof OPERATING_DOMAIN_VALUES)[number];

export const OPERATOR_FLOW_MODE_VALUES = [
  "diagnostic",
  "planned_change",
  "expert_override",
  "source_onboarding",
  "scenario_pack_rollout",
  "cleanup",
] as const;

export type OperatorFlowMode = (typeof OPERATOR_FLOW_MODE_VALUES)[number];

export const OPERATOR_CHANGE_INTENT_VALUES = [
  "config_update",
  "system_update",
  "selection_tuning",
  "llm_tuning",
  "source_tuning",
  "policy_update",
  "cadence_update",
  "model_update",
  "schema_or_contract_update",
] as const;

export type OperatorChangeIntent = (typeof OPERATOR_CHANGE_INTENT_VALUES)[number];

export const OPERATOR_CLEANUP_INTENT_VALUES = [
  "test_artifacts",
  "stale_sources",
  "duplicate_config",
  "revoked_tokens",
  "audit_evidence",
  "failed_runs",
  "temporary_scenario_pack",
] as const;

export type OperatorCleanupIntent = (typeof OPERATOR_CLEANUP_INTENT_VALUES)[number];

export const OPERATOR_TUNING_LAYER_VALUES = [
  "acquisition",
  "technical_filter",
  "semantic_match",
  "candidate_signal",
  "gray_zone_review",
  "llm_provider",
  "final_selection",
  "reporting",
] as const;

export type OperatorTuningLayer = (typeof OPERATOR_TUNING_LAYER_VALUES)[number];

export const OPERATOR_UPDATE_RISK_VALUES = ["low", "medium", "high"] as const;

export type OperatorUpdateRisk = (typeof OPERATOR_UPDATE_RISK_VALUES)[number];

export const SIGNAL_VISIBILITY_VALUES = [
  "explicit_marker",
  "hidden_intent",
  "mixed",
  "unknown",
] as const;

export type SignalVisibility = (typeof SIGNAL_VISIBILITY_VALUES)[number];

export const EVIDENCE_LANE_TYPE_VALUES = [
  "explicit_marker_lane",
  "hidden_intent_lane",
  "source_context_lane",
  "negative_control_lane",
] as const;

export type EvidenceLaneType = (typeof EVIDENCE_LANE_TYPE_VALUES)[number];

export const HARD_GATE_POLICY_VALUES = [
  "forbidden_by_default",
  "allowed_with_mandatory_marker_proof",
  "allowed",
] as const;

export type HardGatePolicy = (typeof HARD_GATE_POLICY_VALUES)[number];

export const OPERATOR_FLOW_SYMPTOM_VALUES = [
  "zero_selected",
  "zero_llm_reviews",
  "technical_filter_rejected",
  "semantic_rejected",
  "discovery_quality_gap",
  "source_failure",
  "source_onboarding",
  "config_write",
  "planned_update",
  "cleanup",
  "expert_override",
  "scenario_pack_rollout",
  "model_update",
] as const;

export type OperatorFlowSymptom = (typeof OPERATOR_FLOW_SYMPTOM_VALUES)[number];

export const OPERATING_REPORT_KINDS = [
  "system_health",
  "channel_health",
  "source_bottleneck",
  "funnel_calibration",
  "selection_precision",
  "selection_hold_quality",
  "source_family_balance",
  "indirect_search_execution",
  "marketplace_extraction_quality",
  "website_pipeline",
  "selection_tuning",
  "content_analysis",
  "llm_budget",
  "sequence_run",
] as const;

export const OPERATIONAL_RESOURCE_URIS = [
  "signalops://ops/health",
  "signalops://ops/issues",
  "signalops://ops/tuning-backlog",
  "signalops://ops/recent-changes",
] as const;

export interface OperatingDomainGuide {
  domain: OperatingDomain;
  title: string;
  lifecycle: readonly string[];
  keyMetrics: readonly string[];
  normalStates: readonly string[];
  commonSymptoms: readonly string[];
  commonCauses: readonly string[];
  tuningLevers: readonly string[];
  readBackChecks: readonly string[];
}

export const OPERATING_DOMAIN_REGISTRY: Readonly<Record<OperatingDomain, OperatingDomainGuide>> = {
  channels: {
    domain: "channels",
    title: "Source Channels",
    lifecycle: ["configured", "scheduled", "fetched", "persisted", "verified", "tuned"],
    keyMetrics: ["active channel count", "fetch outcomes", "new signal_candidates/resources", "last success/error"],
    normalStates: [
      "Active RSS/API/email channels usually produce signal_candidates directly.",
      "Website channels may produce resource-only rows before downstream projection/selection succeeds.",
    ],
    commonSymptoms: ["fetch failures", "duplicate-heavy fetches", "active channel with no recent runs"],
    commonCauses: ["bad URL", "provider rate limit", "site blocks crawler", "poll interval too aggressive"],
    tuningLevers: ["fetchUrl/homepageUrl", "pollIntervalSeconds", "provider-specific config", "active flag"],
    readBackChecks: ["channels.read", "fetch_runs.list", "web_resources.list"],
  },
  website_pipeline: {
    domain: "website_pipeline",
    title: "Website Resource Pipeline",
    lifecycle: ["fetch", "resource extraction", "enrichment", "common-pipeline projection", "final selection"],
    keyMetrics: ["web resource count", "extraction state", "projection state", "projected signal_candidate decision"],
    normalStates: [
      "resource_only is valid for listings/documents that should stay in resources.",
      "projected_to_common_pipeline plus final_decision=rejected means acquisition worked and downstream selection rejected it.",
    ],
    commonSymptoms: [
      "resources exist but no selected signal_candidates",
      "many explicitly_rejected_before_pipeline rows",
      "projected signal_candidates all rejected",
    ],
    commonCauses: [
      "resource kind is listing/document",
      "content filter or selection profile rejects the signal candidate",
      "website discovery settings are too broad",
      "browser fallback is needed for heavy JS sites",
    ],
    tuningLevers: ["website discovery settings", "content filter policy", "system interests", "selection profile"],
    readBackChecks: ["web_resources.list", "signal_candidates.explain", "content_filter_results.list"],
  },
  selection: {
    domain: "selection",
    title: "Final Selection",
    lifecycle: ["signal_candidate observation", "interest/filter evaluation", "LLM review when configured", "final decision"],
    keyMetrics: ["selected/rejected/gray_zone counts", "residual buckets", "verification state"],
    normalStates: [
      "final_decision=rejected can be correct automation behavior.",
      "gray_zone/hold is expected when profile policy says uncertain items need operator review.",
    ],
    commonSymptoms: ["useful signal_candidate rejected", "LLM approved but item held", "too many gray_zone rows"],
    commonCauses: [
      "profile hold policy",
      "weak verification",
      "negative signal match",
      "content filter policy in hold/enforce mode",
    ],
    tuningLevers: ["system interest definition", "LLM template", "content filter policy", "selection profile strictness"],
    readBackChecks: ["signal_candidates.residuals.summary", "signal_candidates.explain", "content_items.explain"],
  },
  content_analysis: {
    domain: "content_analysis",
    title: "Content Analysis and Gating",
    lifecycle: ["policy", "analysis result", "labels/entities", "filter result", "selection consumption"],
    keyMetrics: ["analysis status", "filter decisions", "policy mode", "failure policy"],
    normalStates: [
      "observe and dry_run policies record evidence without blocking content.",
      "hold/enforce policies can intentionally stop or hold content.",
    ],
    commonSymptoms: ["failed analysis", "unexpected hold/reject", "missing labels/entities"],
    commonCauses: ["disabled policy", "unsupported provider/model", "policy mode changed", "rule too broad"],
    tuningLevers: ["policy mode", "policy config", "failure policy", "content filter rules"],
    readBackChecks: ["content_analysis.list", "content_filter_results.list", "content_filter_policies.read"],
  },
  llm_budget: {
    domain: "llm_budget",
    title: "LLM Budget",
    lifecycle: ["budget configured", "review requested", "review logged", "cost summarized", "escalation tuned"],
    keyMetrics: ["budget remaining", "review count", "estimated cost", "review outcomes"],
    normalStates: [
      "Cheap hold can be correct when escalation is disabled or signal is weak.",
      "Low review count may be normal if deterministic filters decide most items.",
    ],
    commonSymptoms: ["reviews stopped", "too many expensive reviews", "gray_zone held after review"],
    commonCauses: ["budget exhausted", "review mode always", "weak verification", "template too broad"],
    tuningLevers: ["LLM review mode", "review thresholds", "template scope", "budget ceiling"],
    readBackChecks: ["llm_budget.summary", "signal_candidates.explain", "operator.report.verify"],
  },
  discovery: {
    domain: "discovery",
    title: "Discovery",
    lifecycle: ["run", "artifact", "candidate", "probe", "understanding", "routing", "inventory", "replay/rollback"],
    keyMetrics: ["active runs", "artifact validation", "candidate rediscovery", "probe quality", "routing decisions", "inventory state", "policy version"],
    normalStates: [
      "Probation handoff uses existing source_channels and outbox sync after vNext routing accepts a source.",
      "Provider failures are negative transport evidence only and must not punish a source's capability score.",
      "Historical yield is reporting telemetry and never drives keep/drop routing decisions.",
    ],
    commonSymptoms: ["artifact rejected", "candidate dedupe unexpected", "probe blocked", "routing rejected", "inventory stale", "rollback pending"],
    commonCauses: ["invalid artifact schema", "missing active policy", "source identity duplicates", "provider auth/rate limits", "risk policy denial"],
    tuningLevers: ["routing policy", "probe policy", "mega-loop budget", "risk policy", "rollback policy", "replay eval thresholds"],
    readBackChecks: ["discovery.runs.list", "discovery.artifacts.list", "discovery.candidates.list", "discovery.source_inventory.list", "discovery.policies.list"],
  },
  sequences: {
    domain: "sequences",
    title: "Sequences",
    lifecycle: ["definition", "run", "task runs", "completed/failed/cancelled", "retry/archive"],
    keyMetrics: ["run status", "failed task count", "retry lineage", "protected system sequence count"],
    normalStates: [
      "Migration-owned default/adaptive sequences are system objects.",
      "Retries should reference failed run evidence, not replace diagnosis.",
    ],
    commonSymptoms: ["pending/stuck run", "failed run", "manual run denied for system reindex"],
    commonCauses: ["missing event context", "task plugin failure", "queue worker unavailable", "invalid run payload"],
    tuningLevers: ["task graph", "trigger event", "retry policy", "maintenance request tool"],
    readBackChecks: ["sequences.read", "sequences.runs.read", "sequences.run_task_runs.list"],
  },
  cleanup: {
    domain: "cleanup",
    title: "Cleanup",
    lifecycle: ["inventory", "classify protected/user/test artifacts", "archive", "delete/revoke", "verify"],
    keyMetrics: ["active artifacts", "protected system objects", "active MCP tokens"],
    normalStates: [
      "Audit/protected objects should remain after cleanup.",
      "MCP token lifecycle requires scoped MCP token tools or admin UI, not REST bypass.",
    ],
    commonSymptoms: ["agent tries direct REST/SQL", "system sequences archived", "tokens not revocable through current scope"],
    commonCauses: ["missing tool scope", "no read-only inventory", "client guessed schema or ownership"],
    tuningLevers: ["cleanup prompt", "destructive confirmation", "token scopes", "archive before delete policy"],
    readBackChecks: ["admin.summary.get", "admin.mcp_tokens.list", "operator.report.verify"],
  },
} as const;
