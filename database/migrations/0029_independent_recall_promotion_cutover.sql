alter table discovery_recall_candidates
  add column registered_channel_id uuid references source_channels (channel_id) on delete set null;

create index discovery_recall_candidates_registered_channel_idx
  on discovery_recall_candidates (registered_channel_id, updated_at desc)
  where registered_channel_id is not null;
