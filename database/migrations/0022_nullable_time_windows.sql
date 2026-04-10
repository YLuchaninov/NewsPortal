alter table criteria
  alter column time_window_hours drop default,
  alter column time_window_hours drop not null;

alter table criteria
  drop constraint if exists criteria_time_window_hours_check;

alter table criteria
  add constraint criteria_time_window_hours_check
    check (time_window_hours is null or time_window_hours > 0);

alter table user_interests
  alter column time_window_hours drop default,
  alter column time_window_hours drop not null;

alter table user_interests
  drop constraint if exists user_interests_time_window_hours_check;

alter table user_interests
  add constraint user_interests_time_window_hours_check
    check (time_window_hours is null or time_window_hours > 0);

alter table interest_templates
  alter column time_window_hours drop default,
  alter column time_window_hours drop not null;

alter table interest_templates
  drop constraint if exists interest_templates_time_window_hours_check;

alter table interest_templates
  add constraint interest_templates_time_window_hours_check
    check (time_window_hours is null or time_window_hours > 0);
