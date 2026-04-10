create table if not exists user_content_state (
  user_id uuid not null references users (user_id) on delete cascade,
  content_item_id text not null,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  saved_state text not null default 'none',
  saved_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, content_item_id),
  constraint user_content_state_saved_state_check
    check (saved_state in ('none', 'saved', 'archived')),
  constraint user_content_state_saved_at_check
    check (
      (saved_state = 'none')
      or (saved_state = 'saved' and saved_at is not null)
      or (saved_state = 'archived' and saved_at is not null and archived_at is not null)
    )
);

create index if not exists user_content_state_saved_idx
  on user_content_state (user_id, saved_state, coalesce(saved_at, updated_at) desc);

create table if not exists user_digest_settings (
  user_id uuid primary key references users (user_id) on delete cascade,
  is_enabled boolean not null default false,
  cadence text not null default 'weekly',
  send_hour integer not null default 9,
  send_minute integer not null default 0,
  timezone text,
  skip_if_empty boolean not null default true,
  next_run_at timestamptz,
  last_sent_at timestamptz,
  last_delivery_status text,
  last_delivery_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_digest_settings_cadence_check
    check (cadence in ('daily', 'every_3_days', 'weekly', 'monthly')),
  constraint user_digest_settings_send_hour_check
    check (send_hour between 0 and 23),
  constraint user_digest_settings_send_minute_check
    check (send_minute between 0 and 59),
  constraint user_digest_settings_last_delivery_status_check
    check (
      last_delivery_status is null
      or last_delivery_status in ('queued', 'sent', 'skipped_empty', 'failed')
    )
);

create index if not exists user_digest_settings_next_run_idx
  on user_digest_settings (next_run_at)
  where is_enabled = true;

create table if not exists digest_delivery_log (
  digest_delivery_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (user_id) on delete cascade,
  digest_kind text not null,
  cadence text,
  status text not null,
  recipient_email text not null default '',
  subject text not null default '',
  body_text text not null default '',
  body_html text not null default '',
  metadata_json jsonb not null default '{}'::jsonb,
  error_text text,
  requested_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint digest_delivery_log_digest_kind_check
    check (digest_kind in ('manual_saved', 'scheduled_matches')),
  constraint digest_delivery_log_cadence_check
    check (
      cadence is null
      or cadence in ('daily', 'every_3_days', 'weekly', 'monthly')
    ),
  constraint digest_delivery_log_status_check
    check (status in ('queued', 'sent', 'skipped_empty', 'failed')),
  constraint digest_delivery_log_metadata_json_is_object_check
    check (jsonb_typeof(metadata_json) = 'object')
);

create index if not exists digest_delivery_log_user_id_requested_at_idx
  on digest_delivery_log (user_id, requested_at desc);

create index if not exists digest_delivery_log_status_requested_at_idx
  on digest_delivery_log (status, requested_at asc);

create table if not exists digest_delivery_items (
  digest_delivery_id uuid not null references digest_delivery_log (digest_delivery_id) on delete cascade,
  item_position integer not null,
  content_item_id text not null,
  created_at timestamptz not null default now(),
  primary key (digest_delivery_id, item_position),
  constraint digest_delivery_items_item_position_check
    check (item_position >= 0)
);

create unique index if not exists digest_delivery_items_unique_content_idx
  on digest_delivery_items (digest_delivery_id, content_item_id);

create table if not exists user_followed_event_clusters (
  user_id uuid not null references users (user_id) on delete cascade,
  event_cluster_id uuid not null references event_clusters (cluster_id) on delete cascade,
  followed_at timestamptz not null default now(),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, event_cluster_id)
);

create index if not exists user_followed_event_clusters_user_id_followed_at_idx
  on user_followed_event_clusters (user_id, followed_at desc);

insert into user_digest_settings (
  user_id,
  is_enabled,
  cadence,
  send_hour,
  send_minute,
  timezone,
  skip_if_empty,
  next_run_at,
  last_sent_at,
  last_delivery_status,
  last_delivery_error
)
select
  up.user_id,
  (
    coalesce((up.notification_preferences ->> 'weekly_email_digest')::boolean, true)
    and exists (
      select 1
      from user_notification_channels unc
      where unc.user_id = up.user_id
        and unc.channel_type = 'email_digest'
        and unc.is_enabled = true
    )
  ) as is_enabled,
  'weekly'::text as cadence,
  9 as send_hour,
  0 as send_minute,
  coalesce(nullif(up.timezone, ''), 'UTC') as timezone,
  true as skip_if_empty,
  null::timestamptz as next_run_at,
  null::timestamptz as last_sent_at,
  null::text as last_delivery_status,
  null::text as last_delivery_error
from user_profiles up
on conflict (user_id) do nothing;
