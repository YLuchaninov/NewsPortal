alter table reindex_jobs
  drop constraint if exists reindex_jobs_job_kind_check;

alter table reindex_jobs
  add constraint reindex_jobs_job_kind_check
    check (job_kind in ('rebuild', 'repair', 'backfill', 'content_analysis'));
