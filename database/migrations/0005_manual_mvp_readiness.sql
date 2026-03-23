create table if not exists source_channel_runtime_state (
  channel_id uuid primary key references source_channels (channel_id) on delete cascade,
  adaptive_enabled boolean not null default true,
  effective_poll_interval_seconds integer not null,
  max_poll_interval_seconds integer not null,
  next_due_at timestamptz,
  adaptive_step integer not null default 0,
  last_result_kind text,
  consecutive_no_change_polls integer not null default 0,
  consecutive_failures integer not null default 0,
  adaptive_reason text,
  updated_at timestamptz not null default now(),
  constraint source_channel_runtime_state_effective_poll_check
    check (effective_poll_interval_seconds > 0),
  constraint source_channel_runtime_state_max_poll_check
    check (
      max_poll_interval_seconds >= effective_poll_interval_seconds
      and max_poll_interval_seconds <= 604800
    ),
  constraint source_channel_runtime_state_adaptive_step_check
    check (adaptive_step >= 0),
  constraint source_channel_runtime_state_no_change_check
    check (consecutive_no_change_polls >= 0),
  constraint source_channel_runtime_state_failures_check
    check (consecutive_failures >= 0),
  constraint source_channel_runtime_state_last_result_kind_check
    check (
      last_result_kind is null
      or last_result_kind in (
        'new_content',
        'no_change',
        'rate_limited',
        'transient_failure',
        'hard_failure'
      )
    )
);

create index if not exists source_channel_runtime_state_next_due_idx
  on source_channel_runtime_state (next_due_at, adaptive_enabled);

create index if not exists source_channel_runtime_state_last_result_idx
  on source_channel_runtime_state (last_result_kind, updated_at desc);

insert into source_channel_runtime_state (
  channel_id,
  adaptive_enabled,
  effective_poll_interval_seconds,
  max_poll_interval_seconds,
  next_due_at,
  adaptive_step,
  last_result_kind,
  consecutive_no_change_polls,
  consecutive_failures,
  adaptive_reason
)
select
  sc.channel_id,
  true,
  sc.poll_interval_seconds,
  least(sc.poll_interval_seconds * 16, 259200),
  case
    when sc.last_fetch_at is null then now()
    else sc.last_fetch_at + make_interval(secs => sc.poll_interval_seconds)
  end,
  0,
  null,
  0,
  0,
  null
from source_channels sc
on conflict (channel_id) do nothing;

create table if not exists channel_fetch_runs (
  fetch_run_id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references source_channels (channel_id) on delete cascade,
  provider_type text not null,
  scheduled_at timestamptz not null,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  outcome_kind text not null,
  http_status integer,
  retry_after_seconds integer,
  fetch_duration_ms integer not null default 0,
  fetched_item_count integer not null default 0,
  new_article_count integer not null default 0,
  duplicate_suppressed_count integer not null default 0,
  cursor_changed boolean not null default false,
  error_text text,
  schedule_snapshot_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint channel_fetch_runs_provider_type_check
    check (provider_type in ('rss', 'website', 'api', 'email_imap', 'youtube')),
  constraint channel_fetch_runs_outcome_kind_check
    check (
      outcome_kind in (
        'new_content',
        'no_change',
        'rate_limited',
        'transient_failure',
        'hard_failure'
      )
    ),
  constraint channel_fetch_runs_duration_check
    check (fetch_duration_ms >= 0),
  constraint channel_fetch_runs_retry_after_check
    check (retry_after_seconds is null or retry_after_seconds >= 0),
  constraint channel_fetch_runs_fetched_item_count_check
    check (fetched_item_count >= 0),
  constraint channel_fetch_runs_new_article_count_check
    check (new_article_count >= 0),
  constraint channel_fetch_runs_duplicate_suppressed_count_check
    check (duplicate_suppressed_count >= 0),
  constraint channel_fetch_runs_finished_after_started_check
    check (finished_at >= started_at)
);

create index if not exists channel_fetch_runs_channel_started_idx
  on channel_fetch_runs (channel_id, started_at desc);

create index if not exists channel_fetch_runs_outcome_started_idx
  on channel_fetch_runs (outcome_kind, started_at desc);

create index if not exists channel_fetch_runs_provider_started_idx
  on channel_fetch_runs (provider_type, started_at desc);

alter table llm_review_log
  add column if not exists provider_latency_ms integer;

alter table llm_review_log
  add column if not exists prompt_tokens integer;

alter table llm_review_log
  add column if not exists completion_tokens integer;

alter table llm_review_log
  add column if not exists total_tokens integer;

alter table llm_review_log
  add column if not exists cost_estimate_usd numeric(12, 6);

alter table llm_review_log
  add column if not exists provider_usage_json jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'llm_review_log_provider_latency_ms_check'
  ) then
    alter table llm_review_log
      add constraint llm_review_log_provider_latency_ms_check
      check (provider_latency_ms is null or provider_latency_ms >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'llm_review_log_prompt_tokens_check'
  ) then
    alter table llm_review_log
      add constraint llm_review_log_prompt_tokens_check
      check (prompt_tokens is null or prompt_tokens >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'llm_review_log_completion_tokens_check'
  ) then
    alter table llm_review_log
      add constraint llm_review_log_completion_tokens_check
      check (completion_tokens is null or completion_tokens >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'llm_review_log_total_tokens_check'
  ) then
    alter table llm_review_log
      add constraint llm_review_log_total_tokens_check
      check (total_tokens is null or total_tokens >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'llm_review_log_cost_estimate_usd_check'
  ) then
    alter table llm_review_log
      add constraint llm_review_log_cost_estimate_usd_check
      check (cost_estimate_usd is null or cost_estimate_usd >= 0);
  end if;
end $$;
