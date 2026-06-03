-- Discovery vNext legacy schema sweep.
-- 0057 destructive-cleaned legacy rows; this migration removes the remaining
-- discovery-specific v3 tables so active runtime code cannot depend on them.
-- Shared source/channel/fetcher/content/outbox tables remain untouched.

drop table if exists
  discovery_llm_decisions,
  discovery_eval_runs,
  discovery_eval_cases,
  discovery_eval_suites,
  discovery_repairs,
  discovery_actions,
  discovery_source_edges,
  discovery_source_contracts,
  discovery_source_endpoints,
  discovery_source_identities,
  discovery_domain_inventory,
  discovery_claim_evidence,
  discovery_claims,
  discovery_signal_clusters,
  discovery_negative_evidence,
  discovery_evidence_items,
  discovery_provider_queries,
  discovery_debates,
  discovery_hypotheses,
  discovery_coverage_snapshots,
  discovery_provider_health,
  discovery_provider_capabilities,
  discovery_runs,
  discovery_targets,
  discovery_llm_task_templates,
  discovery_legacy_archive_batches
cascade;
