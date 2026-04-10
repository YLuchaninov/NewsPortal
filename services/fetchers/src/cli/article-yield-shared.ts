import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Pool } from "pg";

import { loadFetchersConfig } from "../config";
import { createPgPool } from "../db";

const cliDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(cliDir, "..", "..", "..", "..");
const DEFAULT_ENV_FILE = ".env.dev";
const HOST_EXPR = "split_part(split_part(sc.fetch_url, '://', 2), '/', 1)";

type JsonRecord = Record<string, unknown>;

export interface ArticleYieldSnapshot {
  generatedAt: string;
  baseline: JsonRecord;
  views: Record<string, unknown>;
  samples: Record<string, unknown>;
  analysis: JsonRecord;
}

function asPlainObject(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as JsonRecord;
}

async function readEnvFile(relativePath: string): Promise<Record<string, string>> {
  const content = await readFile(path.join(repoRoot, relativePath), "utf8");
  return Object.fromEntries(
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separatorIndex = line.indexOf("=");
        if (separatorIndex < 0) {
          return [line, ""];
        }
        return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
      })
  );
}

export async function loadLocalEnvFileIntoProcessEnv(relativePath = DEFAULT_ENV_FILE): Promise<void> {
  const env = await readEnvFile(relativePath);
  for (const [key, value] of Object.entries(env)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

export async function createConfiguredPoolFromLocalEnv(): Promise<Pool> {
  await loadLocalEnvFileIntoProcessEnv();
  return createPgPool(loadFetchersConfig());
}

function timestampForPath(date = new Date()): string {
  return date.toISOString().replaceAll(":", "").replaceAll(".", "").replace("Z", "Z");
}

export async function createArticleYieldPackRoot(): Promise<string> {
  const rootDir = path.join("/tmp", `newsportal-article-yield-${timestampForPath()}`);
  await mkdir(rootDir, { recursive: true });
  return rootDir;
}

async function writeJson(targetPath: string, value: unknown): Promise<void> {
  await writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function queryRows<T extends JsonRecord>(
  pool: Pool,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await pool.query<T>(sql, params);
  return result.rows.map((row) => asPlainObject(row) as T);
}

async function querySingleRow<T extends JsonRecord>(
  pool: Pool,
  sql: string,
  params: unknown[] = []
): Promise<T> {
  const rows = await queryRows<T>(pool, sql, params);
  return (rows[0] ?? {}) as T;
}

function toMetricRow(value: JsonRecord, name: string): number {
  const raw = value[name];
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : 0;
}

function renderBulletList(rows: Array<{ label: string; detail: string }>): string {
  if (rows.length === 0) {
    return "- none";
  }

  return rows
    .map((row) => `- ${row.label}: ${row.detail}`)
    .join("\n");
}

function renderAnalysisMarkdown(snapshot: ArticleYieldSnapshot): string {
  const baseline = snapshot.baseline;
  const lossBuckets = Array.isArray(snapshot.analysis.lossBuckets)
    ? (snapshot.analysis.lossBuckets as JsonRecord[])
    : [];
  const rootCauses = Array.isArray(snapshot.analysis.rootCauses)
    ? (snapshot.analysis.rootCauses as JsonRecord[])
    : [];
  const failureCohorts = Array.isArray(snapshot.analysis.failureCohorts)
    ? (snapshot.analysis.failureCohorts as JsonRecord[])
    : [];
  const duplicateFamilies = Array.isArray(snapshot.analysis.duplicateFamilies)
    ? (snapshot.analysis.duplicateFamilies as JsonRecord[])
    : [];
  const nearThresholdTemplates = Array.isArray(snapshot.analysis.nearThresholdTemplates)
    ? (snapshot.analysis.nearThresholdTemplates as JsonRecord[])
    : [];
  const falsePositiveWinners = Array.isArray(snapshot.analysis.falsePositiveWinners)
    ? (snapshot.analysis.falsePositiveWinners as JsonRecord[])
    : [];

  return `# Article Yield Diagnostics

Generated at: ${snapshot.generatedAt}

## Baseline

- Active RSS channels: ${toMetricRow(baseline, "activeRssChannels")}
- Fetch runs: ${toMetricRow(baseline, "fetchRuns")}
- Article rows: ${toMetricRow(baseline, "articleRows")}
- Distinct URLs: ${toMetricRow(baseline, "distinctUrls")}
- System feed rows: ${toMetricRow(baseline, "systemFeedRows")}
- Eligible rows: ${toMetricRow(baseline, "eligibleRows")}
- Filtered rows: ${toMetricRow(baseline, "filteredRows")}
- Pending article.ingest.requested runs: ${toMetricRow(baseline, "pendingArticleIngestRuns")}
- Transient fetch failures: ${toMetricRow(baseline, "transientFetchFailures")}

## Loss Buckets

${renderBulletList(
    lossBuckets.map((bucket) => ({
      label: String(bucket.bucket ?? "unknown"),
      detail: `${bucket.count ?? 0} ${String(bucket.unit ?? "items")}`
    }))
  )}

## Root Cause Rank

${renderBulletList(
    rootCauses.map((cause) => ({
      label: `#${cause.rank ?? "?"} ${String(cause.bucket ?? "unknown")}`,
      detail: `${cause.count ?? 0} ${String(cause.unit ?? "items")} — ${String(
        cause.reason ?? ""
      )}`.trim()
    }))
  )}

## Failure Cohorts

${renderBulletList(
    failureCohorts.slice(0, 10).map((row) => ({
      label: `${String(row.host ?? "unknown")} / ${String(row.errorFamily ?? "unknown")}`,
      detail: `${row.channelCount ?? 0} channels`
    }))
  )}

## Duplicate Families

${renderBulletList(
    duplicateFamilies.slice(0, 10).map((row) => ({
      label: `${String(row.host ?? "unknown")} / ${String(row.country ?? "global")}`,
      detail: `${row.duplicateRows ?? 0} duplicate rows over ${row.distinctUrls ?? 0} distinct URLs`
    }))
  )}

## Near-Threshold Templates

${renderBulletList(
    nearThresholdTemplates.slice(0, 10).map((row) => ({
      label: String(row.criterionDescription ?? "unknown"),
      detail: `${row.nearThresholdRows ?? 0} near-threshold rows, max score ${row.maxScore ?? "0"}`
    }))
  )}

## False-Positive Winners

${renderBulletList(
    falsePositiveWinners.slice(0, 12).map((row) => ({
      label: String(row.title ?? "untitled"),
      detail: `${String(row.cohort ?? "candidate")} via ${String(row.channelName ?? "unknown channel")} (${String(
        row.host ?? "unknown host"
      )})`
    }))
  )}
`;
}

export async function writeSnapshotPack(
  snapshot: ArticleYieldSnapshot,
  targetDir: string
): Promise<void> {
  await mkdir(targetDir, { recursive: true });
  await Promise.all([
    writeJson(path.join(targetDir, "snapshot.json"), snapshot),
    writeJson(path.join(targetDir, "baseline.json"), snapshot.baseline),
    writeJson(path.join(targetDir, "views.json"), snapshot.views),
    writeJson(path.join(targetDir, "samples.json"), snapshot.samples),
    writeJson(path.join(targetDir, "analysis.json"), snapshot.analysis),
    writeFile(path.join(targetDir, "analysis.md"), renderAnalysisMarkdown(snapshot), "utf8"),
    writeJson(path.join(targetDir, "channel-health.json"), snapshot.views.channelHealth),
    writeJson(path.join(targetDir, "fetch-outcome-breakdown.json"), snapshot.views.fetchOutcomeBreakdown),
    writeJson(path.join(targetDir, "pipeline-runs.json"), snapshot.views.pipelineRuns),
    writeJson(path.join(targetDir, "article-state-distribution.json"), snapshot.views.articleStateDistribution),
    writeJson(path.join(targetDir, "url-ratio.json"), snapshot.views.urlRatio),
    writeJson(path.join(targetDir, "duplicate-url-groups.json"), snapshot.views.topDuplicateUrlGroups),
    writeJson(path.join(targetDir, "criterion-score-histogram.json"), snapshot.views.criterionScoreHistogram),
    writeJson(path.join(targetDir, "near-threshold-rows.json"), snapshot.views.topNearThresholdRows),
    writeJson(path.join(targetDir, "eligible-rows.json"), snapshot.views.currentEligibleRows)
  ]);
}

export async function collectArticleYieldSnapshot(pool: Pool): Promise<ArticleYieldSnapshot> {
  const [
    baseline,
    channelHealth,
    fetchOutcomeBreakdown,
    pipelineRuns,
    articleStateDistribution,
    urlRatio,
    topDuplicateUrlGroups,
    criterionScoreHistogram,
    topNearThresholdRows,
    currentEligibleRows,
    sourceChannelsSample,
    sourceChannelRuntimeSample,
    channelFetchRunsSample,
    sequenceRunsSample,
    articlesSample,
    criterionMatchSample,
    systemFeedSample,
    llmReviewSample,
    failureCohorts,
    duplicateFamilies,
    nearThresholdTemplates,
    falsePositiveWinners
  ] = await Promise.all([
    querySingleRow(
      pool,
      `
        select
          (select count(*)::int from source_channels where provider_type = 'rss' and is_active = true) as "activeRssChannels",
          (select count(*)::int from channel_fetch_runs) as "fetchRuns",
          (select count(*)::int from articles) as "articleRows",
          (select count(distinct url)::int from articles) as "distinctUrls",
          (select count(*)::int from system_feed_results) as "systemFeedRows",
          (select count(*)::int from system_feed_results where eligible_for_feed = true) as "eligibleRows",
          (select count(*)::int from system_feed_results where decision = 'filtered_out') as "filteredRows",
          (
            select count(*)::int
            from sequence_runs sr
            join sequences s on s.sequence_id = sr.sequence_id
            where s.trigger_event = 'article.ingest.requested'
              and sr.status = 'pending'
          ) as "pendingArticleIngestRuns",
          (
            select count(*)::int
            from channel_fetch_runs
            where outcome_kind = 'transient_failure'
          ) as "transientFetchFailures"
      `
    ),
    queryRows(
      pool,
      `
        select
          sc.provider_type as "providerType",
          ${HOST_EXPR} as "host",
          count(*)::int as "channelCount",
          sum(case when sc.is_active then 1 else 0 end)::int as "activeChannelCount",
          sum(case when runtime.last_result_kind = 'new_content' then 1 else 0 end)::int as "runtimeNewContent",
          sum(case when runtime.last_result_kind = 'no_change' then 1 else 0 end)::int as "runtimeNoChange",
          sum(case when runtime.last_result_kind = 'transient_failure' then 1 else 0 end)::int as "runtimeTransientFailure",
          sum(case when runtime.last_result_kind = 'hard_failure' then 1 else 0 end)::int as "runtimeHardFailure",
          sum(case when sc.last_error_at is not null then 1 else 0 end)::int as "channelsWithLastError",
          max(sc.last_fetch_at) as "latestFetchAt",
          max(sc.last_success_at) as "latestSuccessAt"
        from source_channels sc
        left join source_channel_runtime_state runtime on runtime.channel_id = sc.channel_id
        group by sc.provider_type, ${HOST_EXPR}
        order by "channelCount" desc, "host" asc
      `
    ),
    queryRows(
      pool,
      `
        select
          ${HOST_EXPR} as "host",
          cfr.outcome_kind as "outcomeKind",
          count(*)::int as "runCount",
          sum(coalesce(cfr.new_article_count, 0))::int as "newArticleCount",
          sum(coalesce(cfr.duplicate_suppressed_count, 0))::int as "duplicateSuppressedCount",
          max(cfr.finished_at) as "latestFinishedAt"
        from channel_fetch_runs cfr
        join source_channels sc on sc.channel_id = cfr.channel_id
        group by ${HOST_EXPR}, cfr.outcome_kind
        order by "runCount" desc, "host" asc, "outcomeKind" asc
      `
    ),
    queryRows(
      pool,
      `
        select
          coalesce(s.trigger_event, 'manual') as "triggerEvent",
          sr.status,
          count(*)::int as "runCount"
        from sequence_runs sr
        join sequences s on s.sequence_id = sr.sequence_id
        group by coalesce(s.trigger_event, 'manual'), sr.status
        order by
          case when coalesce(s.trigger_event, 'manual') = 'article.ingest.requested' then 0 else 1 end,
          "triggerEvent" asc,
          sr.status asc
      `
    ),
    queryRows(
      pool,
      `
        select
          'processing' as "dimension",
          coalesce(processing_state, 'null') as "state",
          count(*)::int as "rowCount"
        from articles
        group by 1, 2
        union all
        select
          'enrichment' as "dimension",
          coalesce(enrichment_state, 'null') as "state",
          count(*)::int as "rowCount"
        from articles
        group by 1, 2
        order by "dimension" asc, "rowCount" desc, "state" asc
      `
    ),
    querySingleRow(
      pool,
      `
        with url_totals as (
          select
            count(*)::int as article_rows,
            count(distinct url)::int as distinct_urls
          from articles
        ),
        duplicate_groups as (
          select count(*)::int as duplicate_groups
          from (
            select url
            from articles
            group by url
            having count(*) > 1
          ) dedup
        )
        select
          url_totals.article_rows as "articleRows",
          url_totals.distinct_urls as "distinctUrls",
          (url_totals.article_rows - url_totals.distinct_urls)::int as "duplicateRows",
          duplicate_groups.duplicate_groups as "duplicateGroups"
        from url_totals
        cross join duplicate_groups
      `
    ),
    queryRows(
      pool,
      `
        select
          a.url,
          count(*)::int as "articleCount",
          count(distinct a.channel_id)::int as "channelCount",
          (array_agg(distinct sc.name order by sc.name))[1:5] as "sampleChannels",
          (array_agg(distinct a.title order by a.title))[1:5] as "sampleTitles",
          max(a.created_at) as "latestCreatedAt"
        from articles a
        join source_channels sc on sc.channel_id = a.channel_id
        group by a.url
        having count(*) > 1
        order by "articleCount" desc, "channelCount" desc, a.url asc
        limit 25
      `
    ),
    queryRows(
      pool,
      `
        with bucketed as (
          select
            least(9, greatest(0, floor(score_final * 10)::int)) as bucket_index
          from criterion_match_results
        )
        select
          bucket_index as "bucketIndex",
          concat(
            trim(to_char((bucket_index::numeric / 10), 'FM0.0')),
            '-',
            trim(to_char(((bucket_index + 1)::numeric / 10), 'FM0.0'))
          ) as "bucket",
          count(*)::int as "rowCount"
        from bucketed
        group by bucket_index
        order by bucket_index asc
      `
    ),
    queryRows(
      pool,
      `
        select
          cmr.doc_id::text as "docId",
          cmr.score_final as "scoreFinal",
          cmr.decision,
          c.description as "criterionDescription",
          a.title,
          a.url,
          sc.name as "channelName",
          ${HOST_EXPR} as "host",
          a.processing_state as "processingState",
          a.created_at as "createdAt"
        from criterion_match_results cmr
        join criteria c on c.criterion_id = cmr.criterion_id
        join articles a on a.doc_id = cmr.doc_id
        join source_channels sc on sc.channel_id = a.channel_id
        where cmr.decision <> 'relevant'
          and cmr.score_final >= 0.45
          and cmr.score_final < 0.72
        order by cmr.score_final desc, a.created_at desc
        limit 30
      `
    ),
    queryRows(
      pool,
      `
        select
          sfr.doc_id::text as "docId",
          sfr.decision,
          sfr.eligible_for_feed as "eligibleForFeed",
          a.title,
          a.url,
          sc.name as "channelName",
          ${HOST_EXPR} as "host",
          a.created_at as "createdAt",
          sfr.updated_at as "updatedAt"
        from system_feed_results sfr
        join articles a on a.doc_id = sfr.doc_id
        join source_channels sc on sc.channel_id = a.channel_id
        where sfr.eligible_for_feed = true
        order by sfr.updated_at desc
        limit 20
      `
    ),
    queryRows(
      pool,
      `
        select
          channel_id::text as "channelId",
          name,
          provider_type as "providerType",
          fetch_url as "fetchUrl",
          country,
          is_active as "isActive",
          poll_interval_seconds as "pollIntervalSeconds",
          last_fetch_at as "lastFetchAt",
          last_error_message as "lastErrorMessage"
        from source_channels
        order by updated_at desc
        limit 5
      `
    ),
    queryRows(
      pool,
      `
        select
          channel_id::text as "channelId",
          adaptive_enabled as "adaptiveEnabled",
          effective_poll_interval_seconds as "effectivePollIntervalSeconds",
          max_poll_interval_seconds as "maxPollIntervalSeconds",
          next_due_at as "nextDueAt",
          last_result_kind as "lastResultKind",
          consecutive_failures as "consecutiveFailures",
          adaptive_reason as "adaptiveReason",
          updated_at as "updatedAt"
        from source_channel_runtime_state
        order by updated_at desc
        limit 5
      `
    ),
    queryRows(
      pool,
      `
        select
          fetch_run_id::text as "fetchRunId",
          channel_id::text as "channelId",
          provider_type as "providerType",
          outcome_kind as "outcomeKind",
          http_status as "httpStatus",
          error_text as "errorText",
          new_article_count as "newArticleCount",
          duplicate_suppressed_count as "duplicateSuppressedCount",
          finished_at as "finishedAt"
        from channel_fetch_runs
        order by finished_at desc nulls last
        limit 5
      `
    ),
    queryRows(
      pool,
      `
        select
          sr.run_id::text as "runId",
          s.title as "sequenceTitle",
          coalesce(s.trigger_event, 'manual') as "triggerEvent",
          sr.status,
          sr.error_text as "errorText",
          sr.created_at as "createdAt",
          sr.finished_at as "finishedAt"
        from sequence_runs sr
        join sequences s on s.sequence_id = sr.sequence_id
        order by sr.created_at desc
        limit 5
      `
    ),
    queryRows(
      pool,
      `
        select
          doc_id::text as "docId",
          channel_id::text as "channelId",
          title,
          url,
          processing_state as "processingState",
          enrichment_state as "enrichmentState",
          created_at as "createdAt"
        from articles
        order by created_at desc
        limit 5
      `
    ),
    queryRows(
      pool,
      `
        select
          criterion_match_id::text as "criterionMatchId",
          doc_id::text as "docId",
          criterion_id::text as "criterionId",
          score_final as "scoreFinal",
          decision,
          created_at as "createdAt"
        from criterion_match_results
        order by created_at desc
        limit 5
      `
    ),
    queryRows(
      pool,
      `
        select
          doc_id::text as "docId",
          decision,
          eligible_for_feed as "eligibleForFeed",
          relevant_criteria_count as "relevantCriteriaCount",
          irrelevant_criteria_count as "irrelevantCriteriaCount",
          pending_llm_criteria_count as "pendingLlmCriteriaCount",
          updated_at as "updatedAt"
        from system_feed_results
        order by updated_at desc
        limit 5
      `
    ),
    queryRows(
      pool,
      `
        select
          review_id::text as "reviewId",
          doc_id::text as "docId",
          scope,
          target_id::text as "targetId",
          llm_model as "llmModel",
          decision,
          score,
          created_at as "createdAt"
        from llm_review_log
        order by created_at desc
        limit 5
      `
    ),
    queryRows(
      pool,
      `
        select
          ${HOST_EXPR} as "host",
          case
            when lower(coalesce(sc.last_error_message, '')) like '%timed out%' then 'timeout'
            when lower(coalesce(sc.last_error_message, '')) like '%502%' then '502'
            when lower(coalesce(sc.last_error_message, '')) like '%503%' then '503'
            when lower(coalesce(sc.last_error_message, '')) like '%403%' then '403'
            when lower(coalesce(sc.last_error_message, '')) like '%401%' then '401'
            when lower(coalesce(sc.last_error_message, '')) like '%forbidden%' then 'forbidden'
            else coalesce(nullif(left(sc.last_error_message, 120), ''), 'unknown')
          end as "errorFamily",
          count(*)::int as "channelCount",
          (array_agg(sc.name order by sc.name))[1:5] as "sampleChannels"
        from source_channels sc
        where sc.is_active = true
          and sc.last_error_at is not null
        group by ${HOST_EXPR}, "errorFamily"
        order by "channelCount" desc, "host" asc, "errorFamily" asc
        limit 20
      `
    ),
    queryRows(
      pool,
      `
        select
          ${HOST_EXPR} as "host",
          coalesce(nullif(sc.country, ''), 'global') as "country",
          count(*)::int as "articleRows",
          count(distinct a.url)::int as "distinctUrls",
          (count(*) - count(distinct a.url))::int as "duplicateRows",
          count(distinct sc.channel_id)::int as "channelCount",
          (array_agg(distinct sc.name order by sc.name))[1:5] as "sampleChannels"
        from articles a
        join source_channels sc on sc.channel_id = a.channel_id
        group by ${HOST_EXPR}, coalesce(nullif(sc.country, ''), 'global')
        having count(*) > 1
        order by "duplicateRows" desc, "articleRows" desc, "host" asc
        limit 20
      `
    ),
    queryRows(
      pool,
      `
        select
          c.description as "criterionDescription",
          count(*)::int as "nearThresholdRows",
          max(cmr.score_final) as "maxScore",
          avg(cmr.score_final) as "avgScore"
        from criterion_match_results cmr
        join criteria c on c.criterion_id = cmr.criterion_id
        where cmr.decision <> 'relevant'
          and cmr.score_final >= 0.45
          and cmr.score_final < 0.72
        group by c.description
        order by "nearThresholdRows" desc, "maxScore" desc, "criterionDescription" asc
      `
    ),
    queryRows(
      pool,
      `
        with near_threshold as (
          select
            'near_threshold'::text as cohort,
            cmr.score_final as score,
            a.title,
            a.url,
            sc.name as "channelName",
            ${HOST_EXPR} as "host"
          from criterion_match_results cmr
          join articles a on a.doc_id = cmr.doc_id
          join source_channels sc on sc.channel_id = a.channel_id
          where cmr.decision <> 'relevant'
            and cmr.score_final >= 0.45
            and cmr.score_final < 0.72
          order by cmr.score_final desc, a.created_at desc
          limit 8
        ),
        eligible as (
          select
            'eligible'::text as cohort,
            coalesce(max(cmr.score_final), 1.0) as score,
            a.title,
            a.url,
            sc.name as "channelName",
            ${HOST_EXPR} as "host"
          from system_feed_results sfr
          join articles a on a.doc_id = sfr.doc_id
          join source_channels sc on sc.channel_id = a.channel_id
          left join criterion_match_results cmr on cmr.doc_id = sfr.doc_id
          where sfr.eligible_for_feed = true
          group by a.title, a.url, sc.name, ${HOST_EXPR}
          order by score desc, a.title asc
          limit 8
        )
        select *
        from (
          select * from eligible
          union all
          select * from near_threshold
        ) combined
        order by
          case when cohort = 'eligible' then 0 else 1 end,
          score desc,
          title asc
      `
    )
  ]);

  const duplicateRows = toMetricRow(urlRatio, "duplicateRows");
  const lossBuckets = [
    {
      bucket: "pending_pipeline",
      count: toMetricRow(baseline, "pendingArticleIngestRuns"),
      unit: "sequence_runs"
    },
    {
      bucket: "fetch_failure",
      count: toMetricRow(baseline, "transientFetchFailures"),
      unit: "channel_fetch_runs"
    },
    {
      bucket: "duplicate_noisy_source",
      count: duplicateRows,
      unit: "duplicate_article_rows"
    },
    {
      bucket: "scored_but_filtered",
      count: toMetricRow(baseline, "filteredRows"),
      unit: "system_feed_results"
    }
  ];

  const rootCauses = [
    {
      rank: 1,
      bucket: "pending_pipeline",
      count: toMetricRow(baseline, "pendingArticleIngestRuns"),
      unit: "pending article.ingest.requested runs",
      reason: "Backlog is the largest current blocker and prevents fresh rows from reaching scoring."
    },
    {
      rank: 2,
      bucket: "fetch_failure",
      count: toMetricRow(baseline, "transientFetchFailures"),
      unit: "transient fetch failures",
      reason: "Current source cohorts are losing coverage before article rows are even created."
    },
    {
      rank: 3,
      bucket: "duplicate_noisy_source",
      count: duplicateRows,
      unit: "duplicate article rows",
      reason: "The live corpus repeats the same canonical URLs across country-scoped source variants."
    },
    {
      rank: 4,
      bucket: "scored_but_filtered",
      count: toMetricRow(baseline, "filteredRows"),
      unit: "filtered system feed rows",
      reason: "Templates still produce near-threshold misses and weak winners after ingest completes."
    }
  ];

  return {
    generatedAt: new Date().toISOString(),
    baseline,
    views: {
      channelHealth,
      fetchOutcomeBreakdown,
      pipelineRuns,
      articleStateDistribution,
      urlRatio,
      topDuplicateUrlGroups,
      criterionScoreHistogram,
      topNearThresholdRows,
      currentEligibleRows
    },
    samples: {
      sourceChannels: sourceChannelsSample,
      sourceChannelRuntimeState: sourceChannelRuntimeSample,
      channelFetchRuns: channelFetchRunsSample,
      sequenceRuns: sequenceRunsSample,
      articles: articlesSample,
      criterionMatchResults: criterionMatchSample,
      systemFeedResults: systemFeedSample,
      llmReviewLog: llmReviewSample
    },
    analysis: {
      lossBuckets,
      rootCauses,
      failureCohorts,
      duplicateFamilies,
      nearThresholdTemplates,
      falsePositiveWinners
    }
  };
}

export function buildComparison(before: ArticleYieldSnapshot, after: ArticleYieldSnapshot): JsonRecord {
  const beforeEligible = new Set(
    (Array.isArray(before.views.currentEligibleRows) ? before.views.currentEligibleRows : [])
      .map((row) => asPlainObject(row).docId)
      .filter((value): value is string => typeof value === "string")
  );
  const afterEligible = new Set(
    (Array.isArray(after.views.currentEligibleRows) ? after.views.currentEligibleRows : [])
      .map((row) => asPlainObject(row).docId)
      .filter((value): value is string => typeof value === "string")
  );

  const missingEligible = [...beforeEligible].filter((docId) => !afterEligible.has(docId));
  const newEligible = [...afterEligible].filter((docId) => !beforeEligible.has(docId));

  const beforeBaseline = before.baseline;
  const afterBaseline = after.baseline;

  return {
    generatedAt: new Date().toISOString(),
    before: beforeBaseline,
    after: afterBaseline,
    deltas: {
      pendingArticleIngestRuns:
        toMetricRow(afterBaseline, "pendingArticleIngestRuns") -
        toMetricRow(beforeBaseline, "pendingArticleIngestRuns"),
      transientFetchFailures:
        toMetricRow(afterBaseline, "transientFetchFailures") -
        toMetricRow(beforeBaseline, "transientFetchFailures"),
      duplicateRows:
        toMetricRow(asPlainObject(after.views.urlRatio), "duplicateRows") -
        toMetricRow(asPlainObject(before.views.urlRatio), "duplicateRows"),
      eligibleRows:
        toMetricRow(afterBaseline, "eligibleRows") - toMetricRow(beforeBaseline, "eligibleRows")
    },
    eligibleSetCheck: {
      beforeCount: beforeEligible.size,
      afterCount: afterEligible.size,
      missingPreviouslyEligibleDocIds: missingEligible,
      newEligibleDocIds: newEligible
    }
  };
}

export async function writeComparisonPack(
  comparison: JsonRecord,
  targetDir: string
): Promise<void> {
  await mkdir(targetDir, { recursive: true });
  await writeJson(path.join(targetDir, "comparison.json"), comparison);
  const eligibleSetCheck = asPlainObject(comparison.eligibleSetCheck);
  const deltas = asPlainObject(comparison.deltas);
  const body = `# Before / After Comparison

- Pending article.ingest.requested delta: ${deltas.pendingArticleIngestRuns ?? 0}
- Transient fetch failure delta: ${deltas.transientFetchFailures ?? 0}
- Duplicate row delta: ${deltas.duplicateRows ?? 0}
- Eligible row delta: ${deltas.eligibleRows ?? 0}
- Missing previously eligible doc IDs: ${
    Array.isArray(eligibleSetCheck.missingPreviouslyEligibleDocIds)
      ? (eligibleSetCheck.missingPreviouslyEligibleDocIds as unknown[]).length
      : 0
  }
- New eligible doc IDs: ${
    Array.isArray(eligibleSetCheck.newEligibleDocIds)
      ? (eligibleSetCheck.newEligibleDocIds as unknown[]).length
      : 0
  }
`;
  await writeFile(path.join(targetDir, "comparison.md"), body, "utf8");
}
