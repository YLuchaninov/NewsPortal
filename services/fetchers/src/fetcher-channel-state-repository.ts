import { randomUUID } from "node:crypto";

import { defaultMaxPollIntervalSeconds } from "@signalops/contracts";
import type { Pool, PoolClient } from "pg";

import {
  computeAdaptiveTransition,
  resolveRuntimeState
} from "./adaptive-scheduling";
import type { FetchersConfig } from "./config";
import type {
  ChannelPollCompletion,
  CursorMap,
  FetchCursorRow,
  SourceChannelRow
} from "./fetcher-persistence-types";

function isoAfterSeconds(isoTimestamp: string, seconds: number): string {
  return new Date(new Date(isoTimestamp).getTime() + seconds * 1000).toISOString();
}

export class FetcherChannelStateRepository {
  constructor(private readonly pool: Pool) {}

  async withChannelLease<T>(channelId: string, task: () => Promise<T>): Promise<T | null> {
    const client = await this.pool.connect();
    let locked = false;

    try {
      const result = await client.query<{ locked: boolean }>(
        `
          select pg_try_advisory_lock(
            hashtext('fetch_channel'),
            hashtext($1)
          ) as locked
        `,
        [channelId]
      );
      locked = result.rows[0]?.locked === true;
      if (!locked) {
        return null;
      }
      return await task();
    } finally {
      if (locked) {
        await client.query(
          `
            select pg_advisory_unlock(
              hashtext('fetch_channel'),
              hashtext($1)
            )
          `,
          [channelId]
        );
      }
      client.release();
    }
  }

  async loadDueChannels(config: FetchersConfig): Promise<SourceChannelRow[]> {
    const result = await this.pool.query<SourceChannelRow>(
      `
        with due_channels as (
          select
            source_channels.channel_id::text as "channelId",
            source_channels.provider_type as "providerType",
            source_channels.name,
            source_channels.fetch_url as "fetchUrl",
            source_channels.config_json as "configJson",
            source_channels.auth_config_json as "authConfigJson",
            source_channels.language,
            source_channels.poll_interval_seconds as "pollIntervalSeconds",
            source_channels.last_fetch_at as "lastFetchAt",
            runtime.adaptive_enabled as "adaptiveEnabled",
            runtime.effective_poll_interval_seconds as "effectivePollIntervalSeconds",
            runtime.max_poll_interval_seconds as "maxPollIntervalSeconds",
            runtime.next_due_at as "nextDueAt",
            runtime.adaptive_step as "adaptiveStep",
            runtime.last_result_kind as "lastResultKind",
            runtime.consecutive_no_change_polls as "consecutiveNoChangePolls",
            runtime.consecutive_failures as "consecutiveFailures",
            runtime.adaptive_reason as "adaptiveReason",
            coalesce(
              runtime.next_due_at,
              case
                when source_channels.last_fetch_at is null then now()
                else source_channels.last_fetch_at + make_interval(secs => source_channels.poll_interval_seconds)
              end
            ) as due_at,
            row_number() over (
              partition by source_channels.provider_type
              order by
                case
                  when source_channels.last_fetch_at is null then 0
                  else 1
                end,
                case
                  when source_channels.last_fetch_at is null then source_channels.created_at
                  else null
                end desc,
                coalesce(
                  runtime.next_due_at,
                  case
                    when source_channels.last_fetch_at is null then to_timestamp(0)
                    else source_channels.last_fetch_at + make_interval(secs => source_channels.poll_interval_seconds)
                  end
                ),
                coalesce(source_channels.last_fetch_at, to_timestamp(0)),
                source_channels.created_at
            ) as provider_rank
          from source_channels
          left join source_channel_runtime_state runtime
            on runtime.channel_id = source_channels.channel_id
          where
            source_channels.is_active = true
            and source_channels.provider_type in ('rss', 'website', 'api', 'email_imap')
            and (
              source_channels.provider_type = 'email_imap'
              or source_channels.fetch_url is not null
            )
            and (
              coalesce(
                runtime.next_due_at,
                case
                  when source_channels.last_fetch_at is null then now()
                  else source_channels.last_fetch_at + make_interval(secs => source_channels.poll_interval_seconds)
                end
              ) <= now()
            )
        )
        select
          "channelId",
          "providerType",
          name,
          "fetchUrl",
          "configJson",
          "authConfigJson",
          language,
          "pollIntervalSeconds",
          "lastFetchAt",
          "adaptiveEnabled",
          "effectivePollIntervalSeconds",
          "maxPollIntervalSeconds",
          "nextDueAt",
          "adaptiveStep",
          "lastResultKind",
          "consecutiveNoChangePolls",
          "consecutiveFailures",
          "adaptiveReason"
        from due_channels
        where provider_rank <= case
          when "providerType" = 'rss' then $2::bigint
          when "providerType" = 'website' then $3::bigint
          else $4::bigint
        end
        order by
          provider_rank,
          due_at,
          coalesce("lastFetchAt", to_timestamp(0)),
          "channelId"
        limit $1
      `,
      [
        config.fetchersBatchSize,
        Math.max(config.fetchersRssConcurrency, Math.ceil(config.fetchersBatchSize / 2)),
        Math.max(config.fetchersWebsiteConcurrency, Math.ceil(config.fetchersBatchSize / 2)),
        config.fetchersBatchSize
      ]
    );
    return result.rows;
  }

  async loadChannelById(channelId: string): Promise<SourceChannelRow | null> {
    const result = await this.pool.query<SourceChannelRow>(
      `
        select
          source_channels.channel_id::text as "channelId",
          source_channels.provider_type as "providerType",
          source_channels.name,
          source_channels.fetch_url as "fetchUrl",
          source_channels.config_json as "configJson",
          source_channels.auth_config_json as "authConfigJson",
          source_channels.language,
          source_channels.poll_interval_seconds as "pollIntervalSeconds",
          source_channels.last_fetch_at as "lastFetchAt",
          runtime.adaptive_enabled as "adaptiveEnabled",
          runtime.effective_poll_interval_seconds as "effectivePollIntervalSeconds",
          runtime.max_poll_interval_seconds as "maxPollIntervalSeconds",
          runtime.next_due_at as "nextDueAt",
          runtime.adaptive_step as "adaptiveStep",
          runtime.last_result_kind as "lastResultKind",
          runtime.consecutive_no_change_polls as "consecutiveNoChangePolls",
          runtime.consecutive_failures as "consecutiveFailures",
          runtime.adaptive_reason as "adaptiveReason"
        from source_channels
        left join source_channel_runtime_state runtime
          on runtime.channel_id = source_channels.channel_id
        where source_channels.channel_id = $1
          and source_channels.is_active = true
        limit 1
      `,
      [channelId]
    );
    return result.rows[0] ?? null;
  }

  async loadCursorMap(channelId: string): Promise<CursorMap> {
    const result = await this.pool.query<FetchCursorRow>(
      `
        select
          cursor_type as "cursorType",
          cursor_value as "cursorValue",
          cursor_json as "cursorJson"
        from fetch_cursors
        where channel_id = $1
      `,
      [channelId]
    );

    return Object.fromEntries(result.rows.map((row) => [row.cursorType, row])) as CursorMap;
  }

  async markChannelSuccess(channel: SourceChannelRow, completion: ChannelPollCompletion): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `
          update source_channels
          set
            last_fetch_at = $2,
            last_success_at = $2,
            last_error_at = null,
            last_error_message = null,
            updated_at = now()
          where channel_id = $1
        `,
        [channel.channelId, completion.finishedAt]
      );

      for (const cursorUpdate of completion.cursorUpdates) {
        if (!cursorUpdate.cursorValue) {
          continue;
        }
        await this.upsertCursor(
          client,
          channel.channelId,
          cursorUpdate.cursorType,
          cursorUpdate.cursorValue,
          cursorUpdate.cursorJson
        );
      }
      await this.upsertRuntimeState(client, channel, completion);
      await this.insertFetchRun(client, channel, completion);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async markChannelFailure(channel: SourceChannelRow, completion: ChannelPollCompletion): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(
        `
          update source_channels
          set
            last_fetch_at = $2,
            last_error_at = $2,
            last_error_message = $3,
            updated_at = now()
          where channel_id = $1
        `,
        [channel.channelId, completion.finishedAt, completion.errorMessage]
      );
      await this.upsertRuntimeState(client, channel, completion);
      await this.insertFetchRun(client, channel, completion);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  private buildScheduleSnapshot(channel: SourceChannelRow): Record<string, unknown> {
    const runtimeState = resolveRuntimeState(channel.pollIntervalSeconds, {
      adaptiveEnabled: channel.adaptiveEnabled,
      effectivePollIntervalSeconds: channel.effectivePollIntervalSeconds,
      maxPollIntervalSeconds: channel.maxPollIntervalSeconds,
      nextDueAt: channel.nextDueAt,
      adaptiveStep: channel.adaptiveStep,
      lastResultKind: channel.lastResultKind,
      consecutiveNoChangePolls: channel.consecutiveNoChangePolls,
      consecutiveFailures: channel.consecutiveFailures,
      adaptiveReason: channel.adaptiveReason
    });

    return {
      basePollIntervalSeconds: channel.pollIntervalSeconds,
      adaptiveEnabled: runtimeState.adaptiveEnabled,
      effectivePollIntervalSeconds: runtimeState.effectivePollIntervalSeconds,
      maxPollIntervalSeconds: runtimeState.maxPollIntervalSeconds,
      nextDueAt:
        channel.nextDueAt ??
        (channel.lastFetchAt
          ? isoAfterSeconds(channel.lastFetchAt, runtimeState.effectivePollIntervalSeconds)
          : null) ??
        null,
      adaptiveStep: runtimeState.adaptiveStep,
      lastResultKind: runtimeState.lastResultKind,
      consecutiveNoChangePolls: runtimeState.consecutiveNoChangePolls,
      consecutiveFailures: runtimeState.consecutiveFailures,
      adaptiveReason: runtimeState.adaptiveReason
    };
  }

  private async upsertRuntimeState(
    client: PoolClient,
    channel: SourceChannelRow,
    completion: ChannelPollCompletion
  ): Promise<void> {
    const nextState = computeAdaptiveTransition({
      basePollIntervalSeconds: channel.pollIntervalSeconds,
      fetchedAt: completion.finishedAt,
      outcome: completion.outcome,
      retryAfterSeconds: completion.retryAfterSeconds,
      state: {
        adaptiveEnabled: channel.adaptiveEnabled,
        effectivePollIntervalSeconds: channel.effectivePollIntervalSeconds,
        maxPollIntervalSeconds:
          channel.maxPollIntervalSeconds ??
          defaultMaxPollIntervalSeconds(channel.pollIntervalSeconds),
        nextDueAt: channel.nextDueAt,
        adaptiveStep: channel.adaptiveStep,
        lastResultKind: channel.lastResultKind,
        consecutiveNoChangePolls: channel.consecutiveNoChangePolls,
        consecutiveFailures: channel.consecutiveFailures,
        adaptiveReason: channel.adaptiveReason
      }
    });

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
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
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
        channel.channelId,
        nextState.adaptiveEnabled,
        nextState.effectivePollIntervalSeconds,
        nextState.maxPollIntervalSeconds,
        nextState.nextDueAt,
        nextState.adaptiveStep,
        nextState.lastResultKind,
        nextState.consecutiveNoChangePolls,
        nextState.consecutiveFailures,
        nextState.adaptiveReason
      ]
    );
  }

  private async insertFetchRun(
    client: PoolClient,
    channel: SourceChannelRow,
    completion: ChannelPollCompletion
  ): Promise<void> {
    await client.query(
      `
        insert into channel_fetch_runs (
          fetch_run_id,
          channel_id,
          provider_type,
          scheduled_at,
          started_at,
          finished_at,
          outcome_kind,
          http_status,
          retry_after_seconds,
          fetch_duration_ms,
          fetched_item_count,
          new_article_count,
          duplicate_suppressed_count,
          cursor_changed,
          error_text,
          adapter_key,
          adapter_runtime_kind,
          adapter_selection_mode,
          provider_metrics_json,
          schedule_snapshot_json
        )
        values (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          $16,
          $17,
          $18,
          $19::jsonb,
          $20::jsonb
        )
      `,
      [
        randomUUID(),
        channel.channelId,
        channel.providerType,
        channel.nextDueAt ?? channel.lastFetchAt ?? completion.startedAt,
        completion.startedAt,
        completion.finishedAt,
        completion.outcome,
        completion.httpStatus,
        completion.retryAfterSeconds,
        Math.max(
          0,
          new Date(completion.finishedAt).getTime() - new Date(completion.startedAt).getTime()
        ),
        completion.fetchedItemCount,
        completion.newArticleCount,
        completion.duplicateSuppressedCount,
        completion.cursorChanged,
        completion.errorMessage,
        completion.adapterKey ?? null,
        completion.adapterRuntimeKind ?? null,
        completion.adapterSelectionMode ?? null,
        JSON.stringify(completion.providerMetricsJson ?? {}),
        JSON.stringify(this.buildScheduleSnapshot(channel))
      ]
    );
  }

  private async upsertCursor(
    client: PoolClient,
    channelId: string,
    cursorType: string,
    cursorValue: string,
    cursorJson: Record<string, unknown>
  ): Promise<void> {
    await client.query(
      `
        insert into fetch_cursors (
          cursor_id,
          channel_id,
          cursor_type,
          cursor_value,
          cursor_json,
          updated_at
        )
        values ($1, $2, $3, $4, $5::jsonb, now())
        on conflict (channel_id, cursor_type)
        do update
        set
          cursor_value = excluded.cursor_value,
          cursor_json = excluded.cursor_json,
          updated_at = excluded.updated_at
      `,
      [randomUUID(), channelId, cursorType, cursorValue, JSON.stringify(cursorJson)]
    );
  }
}
