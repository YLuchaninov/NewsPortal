-- Discovery vNext source understanding v2.
-- Keeps source_inventory as primary source truth while allowing context-only
-- retained sources that must not become operational source_channels.

alter table source_inventory
  drop constraint if exists source_inventory_state_check;

alter table source_inventory
  add constraint source_inventory_state_check
    check (current_state in (
      'inventory',
      'inventory_context',
      'inventory_low_priority',
      'cheap_watch',
      'probation_channel',
      'stable_channel',
      'manual_review',
      'adapter_backlog',
      'blocked',
      'rejected_structural'
    ));

alter table source_inventory
  add column if not exists source_voice text null,
  add column if not exists artifact_freshness_kind text null,
  add column if not exists signal_production_mode text null,
  add column if not exists source_role_confidence numeric null,
  add column if not exists inventory_reason text null;

create index if not exists source_inventory_understanding_v2_idx
  on source_inventory(source_voice, artifact_freshness_kind, signal_production_mode, updated_at desc);
