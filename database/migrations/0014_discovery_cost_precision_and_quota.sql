alter table discovery_hypotheses
  add column if not exists execution_cost_usd numeric(12, 6) not null default 0;

update discovery_hypotheses
set execution_cost_usd = round((coalesce(execution_cost_cents, 0)::numeric / 100), 6)
where execution_cost_usd = 0
  and coalesce(execution_cost_cents, 0) <> 0;

alter table discovery_hypotheses
  add constraint discovery_hypotheses_execution_cost_usd_check
  check (execution_cost_usd >= 0) not valid;

alter table discovery_hypotheses
  validate constraint discovery_hypotheses_execution_cost_usd_check;

alter table discovery_cost_log
  add column if not exists cost_usd numeric(12, 6) not null default 0;

update discovery_cost_log
set cost_usd = round((coalesce(cost_cents, 0)::numeric / 100), 6)
where cost_usd = 0
  and coalesce(cost_cents, 0) <> 0;

alter table discovery_cost_log
  add constraint discovery_cost_log_cost_usd_check
  check (cost_usd >= 0) not valid;

alter table discovery_cost_log
  validate constraint discovery_cost_log_cost_usd_check;
