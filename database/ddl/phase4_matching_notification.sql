create table if not exists source_providers (
  provider_id uuid primary key default gen_random_uuid(),
  provider_type text not null unique,
  name text not null,
  base_url text,
  auth_config_json jsonb not null default '{}'::jsonb,
  config_json jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint source_providers_provider_type_check
    check (provider_type in ('rss', 'website', 'api', 'email_imap', 'youtube'))
);

insert into source_providers (provider_type, name, base_url, is_active)
values
  ('rss', 'RSS baseline provider', null, true),
  ('website', 'Website baseline provider', null, true),
  ('api', 'External API baseline provider', null, true),
  ('email_imap', 'IMAP baseline provider', null, true),
  ('youtube', 'Future YouTube provider', null, false)
on conflict (provider_type) do nothing;

alter table source_channels
  add column if not exists provider_id uuid references source_providers (provider_id) on delete set null;

update source_channels sc
set provider_id = sp.provider_id
from source_providers sp
where sc.provider_id is null
  and sc.provider_type = sp.provider_type;

create index if not exists source_channels_provider_id_idx
  on source_channels (provider_id);

create table if not exists article_media_assets (
  asset_id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references articles (doc_id) on delete cascade,
  media_kind text not null default 'image',
  storage_kind text not null default 'external_url',
  source_url text not null,
  canonical_url text,
  thumbnail_url text,
  mime_type text,
  title text,
  alt_text text,
  width_px integer,
  height_px integer,
  duration_seconds integer,
  embed_html text,
  sort_order integer not null default 0,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint article_media_assets_media_kind_check
    check (media_kind in ('image', 'video', 'embed')),
  constraint article_media_assets_storage_kind_check
    check (storage_kind in ('external_url', 'youtube', 'object_storage')),
  constraint article_media_assets_width_px_check
    check (width_px is null or width_px > 0),
  constraint article_media_assets_height_px_check
    check (height_px is null or height_px > 0),
  constraint article_media_assets_duration_seconds_check
    check (duration_seconds is null or duration_seconds >= 0)
);

create index if not exists article_media_assets_doc_id_sort_order_idx
  on article_media_assets (doc_id, sort_order, created_at);

create table if not exists user_article_reactions (
  reaction_id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references articles (doc_id) on delete cascade,
  user_id uuid not null references users (user_id) on delete cascade,
  reaction_type text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_article_reactions_reaction_type_check
    check (reaction_type in ('like', 'dislike')),
  constraint user_article_reactions_user_doc_unique
    unique (user_id, doc_id)
);

create index if not exists user_article_reactions_doc_id_idx
  on user_article_reactions (doc_id, reaction_type);

create table if not exists article_moderation_actions (
  moderation_action_id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references articles (doc_id) on delete cascade,
  admin_user_id uuid not null references users (user_id) on delete restrict,
  action_type text not null,
  reason text,
  created_at timestamptz not null default now(),
  constraint article_moderation_actions_action_type_check
    check (action_type in ('block', 'unblock'))
);

create index if not exists article_moderation_actions_doc_id_created_at_idx
  on article_moderation_actions (doc_id, created_at desc);

create table if not exists user_notification_channels (
  channel_binding_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (user_id) on delete cascade,
  channel_type text not null,
  is_enabled boolean not null default true,
  config_json jsonb not null default '{}'::jsonb,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_notification_channels_channel_type_check
    check (channel_type in ('web_push', 'telegram', 'email_digest'))
);

create index if not exists user_notification_channels_user_id_idx
  on user_notification_channels (user_id, channel_type, is_enabled);

create table if not exists llm_prompt_templates (
  prompt_template_id uuid primary key default gen_random_uuid(),
  name text not null,
  scope text not null,
  language text,
  template_text text not null,
  is_active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint llm_prompt_templates_scope_check
    check (scope in ('criteria', 'interests', 'global')),
  constraint llm_prompt_templates_version_check
    check (version > 0)
);

create index if not exists llm_prompt_templates_scope_active_idx
  on llm_prompt_templates (scope, is_active, updated_at desc);

create table if not exists llm_review_log (
  review_id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references articles (doc_id) on delete cascade,
  scope text not null,
  target_id uuid not null,
  prompt_template_id uuid references llm_prompt_templates (prompt_template_id) on delete set null,
  prompt_version integer not null default 1,
  llm_model text not null,
  decision text not null,
  score double precision not null default 0,
  provider_latency_ms integer,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  cost_estimate_usd numeric(12, 6),
  provider_usage_json jsonb not null default '{}'::jsonb,
  response_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint llm_review_log_scope_check
    check (scope in ('criterion', 'interest')),
  constraint llm_review_log_decision_check
    check (decision in ('approve', 'reject', 'uncertain')),
  constraint llm_review_log_prompt_version_check
    check (prompt_version > 0),
  constraint llm_review_log_provider_latency_ms_check
    check (provider_latency_ms is null or provider_latency_ms >= 0),
  constraint llm_review_log_prompt_tokens_check
    check (prompt_tokens is null or prompt_tokens >= 0),
  constraint llm_review_log_completion_tokens_check
    check (completion_tokens is null or completion_tokens >= 0),
  constraint llm_review_log_total_tokens_check
    check (total_tokens is null or total_tokens >= 0),
  constraint llm_review_log_cost_estimate_usd_check
    check (cost_estimate_usd is null or cost_estimate_usd >= 0)
);

create index if not exists llm_review_log_doc_id_created_at_idx
  on llm_review_log (doc_id, created_at desc);

create table if not exists criterion_match_results (
  criterion_match_id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references articles (doc_id) on delete cascade,
  criterion_id uuid not null references criteria (criterion_id) on delete cascade,
  score_pos double precision not null default 0,
  score_neg double precision not null default 0,
  score_lex double precision not null default 0,
  score_meta double precision not null default 0,
  score_final double precision not null default 0,
  decision text not null,
  explain_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint criterion_match_results_decision_check
    check (decision in ('relevant', 'irrelevant', 'gray_zone'))
);

create index if not exists criterion_match_results_doc_id_idx
  on criterion_match_results (doc_id, created_at desc);

create index if not exists criterion_match_results_criterion_id_idx
  on criterion_match_results (criterion_id, created_at desc);

create unique index if not exists criterion_match_results_doc_criterion_unique
  on criterion_match_results (doc_id, criterion_id);

create table if not exists interest_match_results (
  interest_match_id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references articles (doc_id) on delete cascade,
  user_id uuid not null references users (user_id) on delete cascade,
  interest_id uuid not null references user_interests (interest_id) on delete cascade,
  event_cluster_id uuid references event_clusters (cluster_id) on delete set null,
  score_pos double precision not null default 0,
  score_neg double precision not null default 0,
  score_meta double precision not null default 0,
  score_novel double precision not null default 0,
  score_interest double precision not null default 0,
  score_user double precision not null default 0,
  decision text not null,
  explain_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint interest_match_results_decision_check
    check (decision in ('notify', 'suppress', 'gray_zone', 'ignore'))
);

create index if not exists interest_match_results_doc_id_idx
  on interest_match_results (doc_id, created_at desc);

create index if not exists interest_match_results_user_interest_idx
  on interest_match_results (user_id, interest_id, created_at desc);

create unique index if not exists interest_match_results_doc_interest_unique
  on interest_match_results (doc_id, interest_id);

create table if not exists notification_log (
  notification_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (user_id) on delete cascade,
  interest_id uuid references user_interests (interest_id) on delete set null,
  doc_id uuid not null references articles (doc_id) on delete cascade,
  event_cluster_id uuid references event_clusters (cluster_id) on delete set null,
  channel_type text not null,
  status text not null,
  title text not null default '',
  body text not null default '',
  decision_reason text,
  delivery_payload_json jsonb not null default '{}'::jsonb,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_log_channel_type_check
    check (channel_type in ('web_push', 'telegram', 'email_digest')),
  constraint notification_log_status_check
    check (status in ('queued', 'sent', 'suppressed', 'failed'))
);

create index if not exists notification_log_user_id_created_at_idx
  on notification_log (user_id, created_at desc);

create index if not exists notification_log_cluster_idx
  on notification_log (user_id, event_cluster_id, created_at desc)
  where event_cluster_id is not null;

create table if not exists notification_feedback (
  feedback_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (user_id) on delete cascade,
  notification_id uuid not null references notification_log (notification_id) on delete cascade,
  doc_id uuid not null references articles (doc_id) on delete cascade,
  interest_id uuid references user_interests (interest_id) on delete set null,
  feedback_value text not null,
  created_at timestamptz not null default now(),
  constraint notification_feedback_value_check
    check (feedback_value in ('helpful', 'not_helpful')),
  constraint notification_feedback_notification_unique
    unique (user_id, notification_id)
);

create index if not exists notification_feedback_doc_id_idx
  on notification_feedback (doc_id, created_at desc);

create table if not exists notification_suppression (
  suppression_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (user_id) on delete cascade,
  interest_id uuid references user_interests (interest_id) on delete set null,
  notification_id uuid references notification_log (notification_id) on delete set null,
  doc_id uuid references articles (doc_id) on delete set null,
  family_id uuid references articles (doc_id) on delete set null,
  event_cluster_id uuid references event_clusters (cluster_id) on delete set null,
  reason text not null,
  window_key text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notification_suppression_user_id_created_at_idx
  on notification_suppression (user_id, created_at desc);

create index if not exists notification_suppression_cluster_idx
  on notification_suppression (user_id, event_cluster_id, created_at desc)
  where event_cluster_id is not null;

create table if not exists interest_templates (
  interest_template_id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  positive_texts jsonb not null default '[]'::jsonb,
  negative_texts jsonb not null default '[]'::jsonb,
  must_have_terms jsonb not null default '[]'::jsonb,
  must_not_have_terms jsonb not null default '[]'::jsonb,
  places jsonb not null default '[]'::jsonb,
  languages_allowed jsonb not null default '[]'::jsonb,
  short_tokens_required jsonb not null default '[]'::jsonb,
  short_tokens_forbidden jsonb not null default '[]'::jsonb,
  priority double precision not null default 1.0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists audit_log (
  audit_log_id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references users (user_id) on delete set null,
  action_type text not null,
  entity_type text not null,
  entity_id uuid,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_actor_created_at_idx
  on audit_log (actor_user_id, created_at desc);

create or replace view article_reaction_stats as
select
  doc_id,
  count(*) filter (where reaction_type = 'like')::int as like_count,
  count(*) filter (where reaction_type = 'dislike')::int as dislike_count,
  max(updated_at) as updated_at
from user_article_reactions
group by doc_id;
