alter table reindex_jobs
  drop constraint if exists reindex_jobs_status_check;

alter table reindex_jobs
  add constraint reindex_jobs_status_check
    check (status in ('queued', 'running', 'cancel_requested', 'cancelled', 'completed', 'failed'));

alter table reindex_jobs
  add column if not exists cancellation_key text,
  add column if not exists superseded_by_reindex_job_id uuid references reindex_jobs (reindex_job_id) on delete set null;

create index if not exists reindex_jobs_cancellation_key_status_requested_at_idx
  on reindex_jobs (cancellation_key, status, requested_at desc)
  where cancellation_key is not null
    and status in ('queued', 'running', 'cancel_requested');

with failed_reindex_runs as (
  select
    oe.aggregate_id::uuid as reindex_job_id,
    sr.error_text
  from outbox_events oe
  join sequence_runs sr
    on sr.trigger_meta ->> 'eventId' = oe.event_id::text
  join sequences s
    on s.sequence_id = sr.sequence_id
  where oe.event_type = 'reindex.requested'
    and oe.aggregate_type = 'reindex_job'
    and s.trigger_event = 'reindex.requested'
    and sr.status = 'failed'
)
update reindex_jobs rj
set
  status = 'failed',
  finished_at = coalesce(rj.finished_at, now()),
  error_text = coalesce(failed_reindex_runs.error_text, 'Sequence run failed before reindex job completed.'),
  updated_at = now()
from failed_reindex_runs
where rj.reindex_job_id = failed_reindex_runs.reindex_job_id
  and rj.status = 'running';

update sequences
set
  task_graph = (
    select jsonb_agg(
      case
        when task ->> 'module' = 'maintenance.reindex'
          then task || jsonb_build_object('timeoutMs', 1800000)
        else task
      end
      order by ordinality
    )
    from jsonb_array_elements(task_graph) with ordinality as expanded(task, ordinality)
  ),
  updated_at = now()
where trigger_event = 'reindex.requested'
  and task_graph @> '[{"module":"maintenance.reindex"}]'::jsonb;
