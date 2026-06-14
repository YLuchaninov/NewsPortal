import type { PoolClient } from "pg";

export interface ManualSourceChannelRuntimeResetInput {
  channelId: string;
  adaptiveEnabled: boolean;
  pollIntervalSeconds: number;
  maxPollIntervalSeconds: number;
}

export type InitialSourceChannelRuntimeStateInput = ManualSourceChannelRuntimeResetInput;

export async function initializeSourceChannelRuntimeState(
  client: Pick<PoolClient, "query">,
  input: InitialSourceChannelRuntimeStateInput
): Promise<void> {
  await client.query(
    `
      insert into source_channel_runtime_state (
        channel_id,
        adaptive_enabled,
        effective_poll_interval_seconds,
        max_poll_interval_seconds,
        next_due_at,
        adaptive_step,
        last_result_kind,
        consecutive_no_change_polls,
        consecutive_failures,
        adaptive_reason,
        updated_at
      )
      values ($1, $2, $3, $4, now(), 0, null, 0, 0, null, now())
      on conflict (channel_id) do nothing
    `,
    [
      input.channelId,
      input.adaptiveEnabled,
      input.pollIntervalSeconds,
      input.maxPollIntervalSeconds
    ]
  );
}

export async function resetSourceChannelRuntimeStateForManualSchedule(
  client: Pick<PoolClient, "query">,
  input: ManualSourceChannelRuntimeResetInput
): Promise<void> {
  await client.query(
    `
      insert into source_channel_runtime_state (
        channel_id,
        adaptive_enabled,
        effective_poll_interval_seconds,
        max_poll_interval_seconds,
        next_due_at,
        adaptive_step,
        last_result_kind,
        consecutive_no_change_polls,
        consecutive_failures,
        adaptive_reason,
        updated_at
      )
      values ($1, $2, $3, $4, now() + make_interval(secs => $5), 0, null, 0, 0, 'manual_schedule_reset', now())
      on conflict (channel_id)
      do update
      set
        adaptive_enabled = excluded.adaptive_enabled,
        effective_poll_interval_seconds = excluded.effective_poll_interval_seconds,
        max_poll_interval_seconds = excluded.max_poll_interval_seconds,
        next_due_at = excluded.next_due_at,
        adaptive_step = excluded.adaptive_step,
        last_result_kind = excluded.last_result_kind,
        consecutive_no_change_polls = excluded.consecutive_no_change_polls,
        consecutive_failures = excluded.consecutive_failures,
        adaptive_reason = excluded.adaptive_reason,
        updated_at = excluded.updated_at
    `,
    [
      input.channelId,
      input.adaptiveEnabled,
      input.pollIntervalSeconds,
      input.maxPollIntervalSeconds,
      input.pollIntervalSeconds
    ]
  );
}
