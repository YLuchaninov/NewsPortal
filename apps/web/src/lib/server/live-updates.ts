import { DEFAULT_PAGE } from "@newsportal/contracts";
import { readRuntimeConfig } from "@newsportal/config";
import { createNewsPortalSdk } from "@newsportal/sdk";

import {
  buildLiveRevision,
  type LiveRepairJobSnapshot,
  type LiveUpdatesSnapshot,
} from "../live-updates";
import { queryOne, queryRows } from "./db";

type ApiListRow = Record<string, unknown>;
type InterestAggregateRow = {
  total: number;
  queued_count: number;
  failed_count: number;
  updated_at: string | null;
  compiled_updated_at: string | null;
};

type UserProfileSnapshotRow = {
  updated_at: string | null;
  notification_preferences: Record<string, unknown> | null;
};

type ChannelAggregateRow = {
  total: number;
  updated_at: string | null;
  verified_at: string | null;
};

type RepairJobRow = {
  reindex_job_id: string;
  status: string;
  error_text: string | null;
  finished_at: string | null;
  requested_at: string;
  options_json: Record<string, unknown> | null;
};

function stableJson(value: Record<string, unknown> | null | undefined): string {
  if (!value) {
    return "{}";
  }

  return JSON.stringify(
    Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = value[key];
        return accumulator;
      }, {})
  );
}

function readMetricRevision(total: number, row: ApiListRow | undefined, timeKeys: string[]): string {
  const firstId =
    row?.doc_id ??
    row?.notification_id ??
    row?.interest_id ??
    null;
  const firstTimestamp =
    timeKeys
      .map((key) => row?.[key])
      .find((value) => value != null) ?? null;
  return buildLiveRevision([total, firstId, firstTimestamp]);
}

function parseRepairJob(row: RepairJobRow): LiveRepairJobSnapshot {
  const optionsJson = row.options_json ?? {};
  const progress =
    optionsJson.progress && typeof optionsJson.progress === "object"
      ? (optionsJson.progress as Record<string, unknown>)
      : null;

  return {
    reindexJobId: row.reindex_job_id,
    status: row.status,
    interestId:
      typeof optionsJson.interestId === "string" && optionsJson.interestId.trim()
        ? optionsJson.interestId.trim()
        : null,
    processedArticles:
      progress && Number.isFinite(Number(progress.processedArticles))
        ? Number(progress.processedArticles)
        : null,
    totalArticles:
      progress && Number.isFinite(Number(progress.totalArticles))
        ? Number(progress.totalArticles)
        : null,
    finishedAt: row.finished_at,
    errorText: row.error_text,
  };
}

export async function loadLiveUpdatesSnapshot(
  userId: string
): Promise<LiveUpdatesSnapshot> {
  const runtimeConfig = readRuntimeConfig(process.env, {
    defaultAppBaseUrl: "http://127.0.0.1:4321/",
  });
  const sdk = createNewsPortalSdk({
    baseUrl: runtimeConfig.apiBaseUrl,
    fetchImpl: fetch,
  });

  const [feedPage, matchesPage, notificationsPage, interestAggregate, profileRow, channelAggregate, repairRows] =
    await Promise.all([
      sdk.listFeedArticles<ApiListRow>({ page: DEFAULT_PAGE, pageSize: 1 }),
      sdk.listMatchesPage<ApiListRow>(userId, { page: DEFAULT_PAGE, pageSize: 1 }),
      sdk.listNotificationsPage<ApiListRow>(userId, {
        page: DEFAULT_PAGE,
        pageSize: 1,
      }),
      queryOne<InterestAggregateRow>(
        `
          select
            count(*)::int as total,
            count(*) filter (
              where ui.compile_status in ('pending', 'queued')
            )::int as queued_count,
            count(*) filter (where ui.compile_status = 'failed')::int as failed_count,
            max(ui.updated_at)::text as updated_at,
            max(coalesce(uic.updated_at, uic.compiled_at))::text as compiled_updated_at
          from user_interests ui
          left join user_interests_compiled uic on uic.interest_id = ui.interest_id
          where ui.user_id = $1
        `,
        [userId]
      ),
      queryOne<UserProfileSnapshotRow>(
        `
          select updated_at::text as updated_at, notification_preferences
          from user_profiles
          where user_id = $1
          limit 1
        `,
        [userId]
      ),
      queryOne<ChannelAggregateRow>(
        `
          select
            count(*)::int as total,
            max(updated_at)::text as updated_at,
            max(verified_at)::text as verified_at
          from user_notification_channels
          where user_id = $1
        `,
        [userId]
      ),
      queryRows<RepairJobRow>(
        `
          with ranked_jobs as (
            select
              rj.reindex_job_id::text as reindex_job_id,
              rj.status,
              rj.error_text,
              rj.finished_at::text as finished_at,
              rj.requested_at::text as requested_at,
              rj.options_json,
              row_number() over (
                partition by coalesce(rj.options_json ->> 'interestId', rj.reindex_job_id::text)
                order by rj.requested_at desc
              ) as row_number
            from reindex_jobs rj
            where rj.requested_by_user_id = $1
              and rj.job_kind = 'repair'
          )
          select
            reindex_job_id,
            status,
            error_text,
            finished_at,
            requested_at,
            options_json
          from ranked_jobs
          where row_number = 1
          order by requested_at desc
          limit 12
        `,
        [userId]
      ),
    ]);

  const interestsTotal = Number(interestAggregate?.total ?? 0);
  const queuedCount = Number(interestAggregate?.queued_count ?? 0);
  const failedCount = Number(interestAggregate?.failed_count ?? 0);
  const channelCount = Number(channelAggregate?.total ?? 0);

  return {
    fetchedAt: new Date().toISOString(),
    feed: {
      total: feedPage.total,
      revision: readMetricRevision(feedPage.total, feedPage.items[0], [
        "published_at",
        "ingested_at",
      ]),
    },
    interests: {
      total: interestsTotal,
      queuedCount,
      failedCount,
      revision: buildLiveRevision([
        interestsTotal,
        queuedCount,
        failedCount,
        interestAggregate?.updated_at,
        interestAggregate?.compiled_updated_at,
      ]),
    },
    matches: {
      total: matchesPage.total,
      revision: readMetricRevision(matchesPage.total, matchesPage.items[0], [
        "created_at",
        "published_at",
        "ingested_at",
      ]),
    },
    notifications: {
      total: notificationsPage.total,
      revision: readMetricRevision(
        notificationsPage.total,
        notificationsPage.items[0],
        ["created_at", "sent_at"]
      ),
    },
    settings: {
      channelCount,
      preferencesRevision: buildLiveRevision([
        profileRow?.updated_at,
        stableJson(profileRow?.notification_preferences),
      ]),
      channelsRevision: buildLiveRevision([
        channelCount,
        channelAggregate?.updated_at,
        channelAggregate?.verified_at,
      ]),
    },
    repairJobs: repairRows.map((row) => parseRepairJob(row)),
  };
}
