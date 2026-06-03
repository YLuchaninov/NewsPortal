-- Discovery vNext source scope resolution.
-- Adds scope-aware typed artifacts and inventory metadata while keeping
-- source_inventory as the primary Discovery source truth.

alter table discovery_artifacts
  drop constraint if exists discovery_artifacts_type_check;

alter table discovery_artifacts
  add constraint discovery_artifacts_type_check
    check (artifact_type in (
      'DiscoveryBrief',
      'HypothesisBatch',
      'ProbePlan',
      'ProbeReport',
      'SourceScopeResolution',
      'SourceUnderstanding',
      'RoutingDecision',
      'QueryQualityReport'
    ));

alter table discovery_artifacts
  drop constraint if exists discovery_artifacts_memory_mode_check;

alter table discovery_artifacts
  add constraint discovery_artifacts_memory_mode_check
    check (memory_mode is null or memory_mode in (
      'blind',
      'thin',
      'gap_only',
      'locale',
      'artifact_lens',
      'adversarial',
      'full',
      'full_evaluator_only'
    ));

alter table discovery_run_steps
  drop constraint if exists discovery_run_steps_kind_check;

alter table discovery_run_steps
  add constraint discovery_run_steps_kind_check
    check (step_kind in (
      'brief_compile',
      'llm_gateway',
      'mega_loop',
      'candidate_acquisition',
      'probe',
      'scope_resolution',
      'understand_route',
      'monitoring_handoff',
      'probation_handoff',
      'replay',
      'rollback'
    ));

alter table source_inventory
  add column if not exists latest_source_scope_resolution_artifact_id uuid references discovery_artifacts(artifact_id) on delete set null,
  add column if not exists seed_item_url text null,
  add column if not exists resolved_source_url text null,
  add column if not exists source_scope_type text null,
  add column if not exists source_scope_confidence numeric null,
  add column if not exists monitoring_entry_urls_json jsonb not null default '[]'::jsonb,
  add column if not exists item_extraction_hints_json jsonb not null default '{}'::jsonb,
  add column if not exists scope_confirmation_json jsonb not null default '{}'::jsonb;

alter table source_inventory
  drop constraint if exists source_inventory_scope_type_check;

alter table source_inventory
  add constraint source_inventory_scope_type_check
    check (source_scope_type is null or source_scope_type in (
      'domain_root',
      'section',
      'feed',
      'api_endpoint',
      'listing_page',
      'search_endpoint',
      'document_collection',
      'single_item',
      'context_page',
      'blocked_or_unusable',
      'unknown'
    ));

create index if not exists source_inventory_scope_idx
  on source_inventory(source_scope_type, source_scope_confidence, updated_at desc);

alter table source_observations
  drop constraint if exists source_observations_kind_check;

alter table source_observations
  add constraint source_observations_kind_check
    check (observation_kind in (
      'fetch_health',
      'content_change',
      'artifact_sample',
      'blocker',
      'risk_signal',
      'scope_resolution'
    ));

alter table discovery_feedback_events
  drop constraint if exists discovery_feedback_type_check;

alter table discovery_feedback_events
  add constraint discovery_feedback_type_check
    check (feedback_type in (
      'approve',
      'reject',
      'correct',
      'rollback',
      'mark_noise',
      'mark_useful',
      'policy_issue',
      'source_scope_correct',
      'source_scope_wrong',
      'source_understanding_correct',
      'source_understanding_wrong',
      'routing_correct',
      'routing_wrong',
      'source_useful_as_inventory',
      'source_not_useful',
      'lead_useful',
      'lead_false_positive',
      'adapter_gap_confirmed',
      'adapter_gap_wrong'
    ));
