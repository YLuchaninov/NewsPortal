alter table source_channels
  add column if not exists auth_config_json jsonb not null default '{}'::jsonb;
