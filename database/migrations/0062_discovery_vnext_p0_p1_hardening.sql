-- Discovery vNext P0-P1 hardening.
-- Makes candidate identity hypothesis-aware, removes legacy memory mode,
-- adds fail-visible run statuses, and records reversible scope re-resolution
-- actions without deleting source/channel state.

alter table discovery_artifacts
  drop constraint if exists discovery_artifacts_memory_mode_check;

update discovery_artifacts
set memory_mode = 'full_evaluator_only'
where memory_mode = 'full';

alter table discovery_artifacts
  add constraint discovery_artifacts_memory_mode_check
    check (memory_mode is null or memory_mode in (
      'blind',
      'thin',
      'gap_only',
      'locale',
      'artifact_lens',
      'adversarial',
      'full_evaluator_only'
    ));

alter table discovery_vnext_runs
  drop constraint if exists discovery_vnext_runs_status_check;

alter table discovery_vnext_runs
  add constraint discovery_vnext_runs_status_check
    check (status in (
      'queued',
      'running',
      'succeeded',
      'completed',
      'failed',
      'cancelled',
      'passed_mechanical',
      'passed_with_quality_gap',
      'completed_with_coverage_gap',
      'mechanically_passed_quality_failed',
      'failed_validation',
      'partially_proven'
    ));

alter table discovery_candidates
  add column if not exists hypothesis_id text not null default 'unknown',
  add column if not exists hypothesis_batch_artifact_id uuid references discovery_artifacts(artifact_id) on delete set null,
  add column if not exists lens text null,
  add column if not exists memory_mode text null;

update discovery_candidates
set hypothesis_batch_artifact_id = coalesce(hypothesis_batch_artifact_id, hypothesis_artifact_id)
where hypothesis_artifact_id is not null;

update discovery_candidates dc
set
  hypothesis_id = coalesce(
    nullif(dc.acquisition_json #>> '{paths,0,hypothesisId}', ''),
    nullif(dc.acquisition_json #>> '{paths,0,hypothesis_id}', ''),
    nullif(dc.hypothesis_id, ''),
    'unknown'
  ),
  lens = coalesce(
    nullif(dc.acquisition_json #>> '{paths,0,lens}', ''),
    nullif(da.lens, ''),
    dc.lens
  ),
  memory_mode = coalesce(
    nullif(dc.acquisition_json #>> '{paths,0,memoryMode}', ''),
    nullif(dc.acquisition_json #>> '{paths,0,memory_mode}', ''),
    nullif(da.memory_mode, ''),
    dc.memory_mode
  )
from discovery_artifacts da
where da.artifact_id = dc.hypothesis_batch_artifact_id;

update discovery_candidates
set memory_mode = 'full_evaluator_only'
where memory_mode = 'full';

alter table discovery_candidates
  drop constraint if exists discovery_candidates_memory_mode_check;

alter table discovery_candidates
  add constraint discovery_candidates_memory_mode_check
    check (memory_mode is null or memory_mode in (
      'blind',
      'thin',
      'gap_only',
      'locale',
      'artifact_lens',
      'adversarial',
      'full_evaluator_only'
    ));

create index if not exists discovery_candidates_run_lens_idx
  on discovery_candidates(vnext_run_id, lens)
  where vnext_run_id is not null and lens is not null;

create index if not exists discovery_candidates_run_hypothesis_identity_idx
  on discovery_candidates(vnext_run_id, hypothesis_id)
  where vnext_run_id is not null;

create index if not exists discovery_candidates_run_domain_idx
  on discovery_candidates(vnext_run_id, canonical_domain)
  where vnext_run_id is not null;

alter table source_observations
  add column if not exists rollback_group_id uuid null,
  add column if not exists before_state_json jsonb not null default '{}'::jsonb,
  add column if not exists after_state_json jsonb not null default '{}'::jsonb,
  add column if not exists reason_code text null;
