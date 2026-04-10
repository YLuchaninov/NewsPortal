alter table interest_templates
  add column if not exists time_window_hours integer not null default 168;

alter table interest_templates
  drop constraint if exists interest_templates_time_window_hours_check;

alter table interest_templates
  add constraint interest_templates_time_window_hours_check
    check (time_window_hours > 0);
