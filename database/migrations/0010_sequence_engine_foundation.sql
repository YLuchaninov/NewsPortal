create table if not exists sequences (
  sequence_id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  task_graph jsonb not null,
  status text not null default 'draft',
  trigger_event text,
  cron text,
  max_runs integer,
  run_count integer not null default 0,
  tags text[] not null default '{}'::text[],
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sequences_status_check
    check (status in ('draft', 'active', 'archived')),
  constraint sequences_run_count_check
    check (run_count >= 0),
  constraint sequences_max_runs_check
    check (max_runs is null or max_runs > 0),
  constraint sequences_task_graph_is_array_check
    check (jsonb_typeof(task_graph) = 'array')
);

create index if not exists idx_sequences_trigger_event
  on sequences (trigger_event)
  where trigger_event is not null;

create index if not exists idx_sequences_status
  on sequences (status);

create table if not exists sequence_runs (
  run_id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references sequences (sequence_id) on delete cascade,
  status text not null default 'pending',
  context_json jsonb not null default '{}'::jsonb,
  trigger_type text not null default 'manual',
  trigger_meta jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  error_text text,
  created_at timestamptz not null default now(),
  constraint sequence_runs_status_check
    check (status in ('pending', 'running', 'completed', 'failed', 'cancelled')),
  constraint sequence_runs_trigger_type_check
    check (trigger_type in ('manual', 'cron', 'agent', 'api', 'event')),
  constraint sequence_runs_context_json_is_object_check
    check (jsonb_typeof(context_json) = 'object'),
  constraint sequence_runs_trigger_meta_is_object_check
    check (trigger_meta is null or jsonb_typeof(trigger_meta) = 'object')
);

create index if not exists idx_sequence_runs_sequence_id
  on sequence_runs (sequence_id);

create index if not exists idx_sequence_runs_status
  on sequence_runs (status);

create table if not exists sequence_task_runs (
  task_run_id uuid primary key default gen_random_uuid(),
  run_id uuid not null references sequence_runs (run_id) on delete cascade,
  task_index integer not null,
  task_key text not null,
  module text not null,
  status text not null default 'pending',
  options_json jsonb not null default '{}'::jsonb,
  input_json jsonb,
  output_json jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  error_text text,
  duration_ms integer,
  created_at timestamptz not null default now(),
  constraint sequence_task_runs_status_check
    check (status in ('pending', 'running', 'completed', 'failed', 'skipped')),
  constraint sequence_task_runs_task_index_check
    check (task_index >= 0),
  constraint sequence_task_runs_options_json_is_object_check
    check (jsonb_typeof(options_json) = 'object'),
  constraint sequence_task_runs_input_json_is_object_check
    check (input_json is null or jsonb_typeof(input_json) = 'object'),
  constraint sequence_task_runs_output_json_is_object_check
    check (output_json is null or jsonb_typeof(output_json) = 'object'),
  constraint sequence_task_runs_duration_ms_check
    check (duration_ms is null or duration_ms >= 0)
);

create unique index if not exists idx_sequence_task_runs_run_task_index
  on sequence_task_runs (run_id, task_index);

create index if not exists idx_sequence_task_runs_run_id
  on sequence_task_runs (run_id);

create index if not exists idx_sequence_task_runs_status
  on sequence_task_runs (status);
