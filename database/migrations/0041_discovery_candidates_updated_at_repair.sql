alter table discovery_candidates
  add column if not exists updated_at timestamptz;

update discovery_candidates
set updated_at = coalesce(reviewed_at, created_at, now())
where updated_at is null;

alter table discovery_candidates
  alter column updated_at set default now();

alter table discovery_candidates
  alter column updated_at set not null;
