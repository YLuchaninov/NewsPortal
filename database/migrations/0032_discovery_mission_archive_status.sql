alter table discovery_missions
  drop constraint if exists discovery_missions_status_check;

alter table discovery_missions
  add constraint discovery_missions_status_check
  check (status in ('planned', 'active', 'paused', 'completed', 'failed', 'archived'));
