create table if not exists reindex_job_targets (
  reindex_job_id uuid not null references reindex_jobs (reindex_job_id) on delete cascade,
  target_position bigint not null,
  doc_id uuid not null references articles (doc_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (reindex_job_id, target_position),
  constraint reindex_job_targets_doc_unique
    unique (reindex_job_id, doc_id),
  constraint reindex_job_targets_position_check
    check (target_position > 0)
);

create index if not exists reindex_job_targets_doc_idx
  on reindex_job_targets (doc_id);
