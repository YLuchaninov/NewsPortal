import path from "node:path";

import {
  normalizeMaxPollIntervalSeconds,
  parseRssChannelConfig
} from "@newsportal/contracts";
import type { PoolClient } from "pg";

import {
  buildComparison,
  collectArticleYieldSnapshot,
  createArticleYieldPackRoot,
  createConfiguredPoolFromLocalEnv,
  writeComparisonPack,
  writeSnapshotPack
} from "./article-yield-shared";

interface HnChannelRow {
  channelId: string;
  name: string;
  country: string | null;
  pollIntervalSeconds: number;
  configJson: unknown;
  adaptiveEnabled: boolean | null;
  runtimeMaxPollIntervalSeconds: number | null;
}

function hasFlag(flag: string): boolean {
  return process.argv.slice(2).includes(flag);
}

async function quarantineGoogleRssChannels(client: PoolClient): Promise<number> {
  const updated = await client.query<{ channel_id: string }>(
    `
      update source_channels
      set
        is_active = false,
        updated_at = now()
      where provider_type = 'rss'
        and is_active = true
        and split_part(split_part(fetch_url, '://', 2), '/', 1) = 'news.google.com'
      returning channel_id::text
    `
  );

  if ((updated.rowCount ?? 0) > 0) {
    await client.query(
      `
        update source_channel_runtime_state
        set
          next_due_at = null,
          adaptive_reason = 'article_yield_google_quarantine',
          updated_at = now()
        where channel_id = any($1::uuid[])
      `,
      [updated.rows.map((row) => row.channel_id)]
    );
  }

  return updated.rowCount ?? 0;
}

async function updateRuntimeSchedule(
  client: PoolClient,
  input: {
    channelId: string;
    adaptiveEnabled: boolean;
    pollIntervalSeconds: number;
    maxPollIntervalSeconds: number;
    reason: string;
  }
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
      values ($1, $2, $3::int, $4::int, now() + make_interval(secs => $3::int), 0, null, 0, 0, $5, now())
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
      input.reason
    ]
  );
}

async function tuneHnChannels(client: PoolClient): Promise<{
  updatedTimeoutCount: number;
  deprioritizedCountryScopedCount: number;
}> {
  const rows = await client.query<HnChannelRow>(
    `
      select
        sc.channel_id::text as "channelId",
        sc.name,
        sc.country,
        sc.poll_interval_seconds as "pollIntervalSeconds",
        sc.config_json as "configJson",
        runtime.adaptive_enabled as "adaptiveEnabled",
        runtime.max_poll_interval_seconds as "runtimeMaxPollIntervalSeconds"
      from source_channels sc
      left join source_channel_runtime_state runtime on runtime.channel_id = sc.channel_id
      where sc.provider_type = 'rss'
        and sc.is_active = true
        and split_part(split_part(sc.fetch_url, '://', 2), '/', 1) = 'hnrss.org'
    `
  );

  let updatedTimeoutCount = 0;
  let deprioritizedCountryScopedCount = 0;

  for (const row of rows.rows) {
    const config = parseRssChannelConfig(row.configJson);
    const isCountryScoped =
      Boolean(row.country && row.country.trim()) || row.name.startsWith("[Country:");
    const nextRequestTimeoutMs = Math.max(config.requestTimeoutMs, 10000);
    const nextPollIntervalSeconds = isCountryScoped
      ? Math.max(row.pollIntervalSeconds, 86400)
      : row.pollIntervalSeconds;
    const nextMaxEntryAgeHours = isCountryScoped
      ? config.maxEntryAgeHours == null
        ? 48
        : Math.min(config.maxEntryAgeHours, 48)
      : config.maxEntryAgeHours;

    const changedConfig =
      nextRequestTimeoutMs !== config.requestTimeoutMs ||
      nextMaxEntryAgeHours !== config.maxEntryAgeHours;
    const changedSchedule = nextPollIntervalSeconds !== row.pollIntervalSeconds;

    if (!changedConfig && !changedSchedule) {
      continue;
    }

    await client.query(
      `
        update source_channels
        set
          poll_interval_seconds = $2,
          config_json = $3::jsonb,
          updated_at = now()
        where channel_id = $1
      `,
      [
        row.channelId,
        nextPollIntervalSeconds,
        JSON.stringify({
          ...config,
          requestTimeoutMs: nextRequestTimeoutMs,
          maxEntryAgeHours: nextMaxEntryAgeHours
        })
      ]
    );

    if (changedConfig) {
      updatedTimeoutCount += 1;
    }

    if (changedSchedule) {
      deprioritizedCountryScopedCount += 1;
      await updateRuntimeSchedule(client, {
        channelId: row.channelId,
        adaptiveEnabled: row.adaptiveEnabled ?? true,
        pollIntervalSeconds: nextPollIntervalSeconds,
        maxPollIntervalSeconds: normalizeMaxPollIntervalSeconds(
          nextPollIntervalSeconds,
          row.runtimeMaxPollIntervalSeconds
        ),
        reason: "article_yield_hn_deprioritized"
      });
    }
  }

  return {
    updatedTimeoutCount,
    deprioritizedCountryScopedCount
  };
}

async function applyRemediation(client: PoolClient): Promise<Record<string, unknown>> {
  const googleChannelsQuarantined = await quarantineGoogleRssChannels(client);
  const hnTuning = await tuneHnChannels(client);

  return {
    templateSync: {
      mode: "skipped",
      reason: "runtime_truth_lives_in_admin"
    },
    googleChannelsQuarantined,
    hnTuning
  };
}

async function main(): Promise<void> {
  const apply = hasFlag("--apply");
  const pool = await createConfiguredPoolFromLocalEnv();
  const packRoot = await createArticleYieldPackRoot();

  try {
    const before = await collectArticleYieldSnapshot(pool);
    await writeSnapshotPack(before, path.join(packRoot, "before"));

    let remediationSummary: Record<string, unknown> = {
      mode: "dry_run"
    };

    if (apply) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        remediationSummary = {
          mode: "applied",
          ...(await applyRemediation(client))
        };
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    }

    const after = await collectArticleYieldSnapshot(pool);
    await writeSnapshotPack(after, path.join(packRoot, "after"));

    const comparison = buildComparison(before, after);
    await writeComparisonPack(comparison, packRoot);

    console.log(
      JSON.stringify(
        {
          packRoot,
          remediationSummary,
          comparison
        },
        null,
        2
      )
    );
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
