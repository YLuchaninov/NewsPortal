alter table crawl_policy_cache
  add column if not exists request_validators_json jsonb not null default '{}'::jsonb,
  add column if not exists response_cache_json jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'crawl_policy_cache_request_validators_json_is_object_check'
  ) then
    alter table crawl_policy_cache
      add constraint crawl_policy_cache_request_validators_json_is_object_check
        check (jsonb_typeof(request_validators_json) = 'object');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'crawl_policy_cache_response_cache_json_is_object_check'
  ) then
    alter table crawl_policy_cache
      add constraint crawl_policy_cache_response_cache_json_is_object_check
        check (jsonb_typeof(response_cache_json) = 'object');
  end if;
end $$;

alter table channel_fetch_runs
  add column if not exists provider_metrics_json jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'channel_fetch_runs_provider_metrics_json_is_object_check'
  ) then
    alter table channel_fetch_runs
      add constraint channel_fetch_runs_provider_metrics_json_is_object_check
        check (jsonb_typeof(provider_metrics_json) = 'object');
  end if;
end $$;
