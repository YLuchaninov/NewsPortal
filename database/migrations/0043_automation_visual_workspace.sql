alter table sequences
  add column if not exists editor_state jsonb;

alter table sequences
  drop constraint if exists sequences_editor_state_is_object_check;

alter table sequences
  add constraint sequences_editor_state_is_object_check
    check (editor_state is null or jsonb_typeof(editor_state) = 'object');

alter table sequence_runs
  add column if not exists retry_of_run_id uuid references sequence_runs (run_id) on delete set null;

create index if not exists idx_sequence_runs_retry_of_run_id
  on sequence_runs (retry_of_run_id)
  where retry_of_run_id is not null;
