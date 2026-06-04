import type { Pool } from "pg";

import {
  buildProviderShapeValidation,
  type ChannelProviderShapeValidation,
} from "./channel-bulk-onboarding";

export type ChannelBottleneckFailureBucket =
  | "healthy"
  | "working_noisy"
  | "working_low_yield"
  | "broken_fetch"
  | "provider_shape_mismatch"
  | "adapter_required"
  | "rate_limited"
  | "robots_blocked"
  | "projection_blocked"
  | "gone_404"
  | "auth_or_blocked_403"
  | "not_acceptable_406"
  | "malformed_feed"
  | "html_instead_of_feed"
  | "timeout_dns_tls"
  | "too_large";

export type ChannelBottleneckRepairLane =
  | "none"
  | "monitor_quality"
  | "deep_alternatives"
  | "configure_adapter"
  | "respect_rate_limit"
  | "access_or_auth_required"
  | "polite_retry"
  | "projection_repair";

export interface ChannelBottleneckListOptions {
  page?: number;
  pageSize?: number;
  channelIds?: string[];
  providerType?: string;
  failureBucket?: string;
  repairLane?: string;
  q?: string;
}

export interface ChannelBottleneckRow {
  channelId: string;
  name: string;
  providerType: string;
  adapterKey: string | null;
  researchMode: string | null;
  tosRisk: string | null;
  sourceRole: string | null;
  fetchUrl: string | null;
  isActive: boolean;
  activeState: "active" | "paused";
  pollIntervalSeconds: number;
  effectivePollIntervalSeconds: number;
  maxPollIntervalSeconds: number;
  nextDueAt: string | null;
  repairDue: boolean;
  lastOutcomeKind: string | null;
  lastHttpStatus: number | null;
  lastErrorText: string | null;
  consecutiveFailures: number;
  consecutiveNoChangePolls: number;
  adaptiveReason: string | null;
  outcomes24h: Record<string, number>;
  outcomes7d: Record<string, number>;
  runStats24h: {
    runs: number;
    failures: number;
    fetchedItems: number;
    newItems: number;
    duplicates: number;
  };
  runStats7d: {
    runs: number;
    failures: number;
    fetchedItems: number;
    newItems: number;
    duplicates: number;
  };
  contentStats: {
    signalCandidateCount: number;
    selectedRows: number;
    selectedUniqueContent: number;
    grayRows: number;
    rejectedRows: number;
    visibleSignalCandidates: number;
    duplicateSignalCandidates: number;
  };
  projectionStats: {
    resources: number;
    projectedResources: number;
    resourceOnly: number;
    extractionFailed: number;
    projectedSelected: number;
    projectedGray: number;
    projectedRejected: number;
  };
  providerShapeValidation: ChannelProviderShapeValidation;
  failureBucket: ChannelBottleneckFailureBucket;
  repairLane: ChannelBottleneckRepairLane;
  legacyDdgsInternalBridge: boolean;
  legacyBridgeWarning: string | null;
}

export interface ChannelBottleneckList {
  generatedAt: string;
  page: number;
  pageSize: number;
  total: number;
  items: ChannelBottleneckRow[];
}

export interface ChannelBottleneckSummary {
  generatedAt: string;
  totalChannels: number;
  activeChannels: number;
  technicalBottlenecks: number;
  workingNoisy: number;
  workingLowYield: number;
  byFailureBucket: Array<{ failureBucket: ChannelBottleneckFailureBucket; count: number }>;
  byRepairLane: Array<{ repairLane: ChannelBottleneckRepairLane; count: number }>;
  byProvider: Array<{ providerType: string; count: number; technicalBottlenecks: number }>;
  nextReadBack: Array<Record<string, unknown>>;
}

export class ChannelBottleneckNotFoundError extends Error {
  constructor(channelId: string) {
    super(`Channel ${channelId} was not found in the source bottleneck read model.`);
    this.name = "ChannelBottleneckNotFoundError";
  }
}

interface RawChannelBottleneckRow {
  channelId: string;
  name: string;
  providerType: string;
  adapterKey: string | null;
  researchMode: string | null;
  tosRisk: string | null;
  sourceRole: string | null;
  fetchUrl: string | null;
  isActive: boolean;
  pollIntervalSeconds: number;
  effectivePollIntervalSeconds: number;
  maxPollIntervalSeconds: number;
  nextDueAt: string | null;
  consecutiveFailures: number;
  consecutiveNoChangePolls: number;
  adaptiveReason: string | null;
  lastOutcomeKind: string | null;
  lastHttpStatus: number | null;
  lastErrorText: string | null;
  lastProviderMetrics: Record<string, unknown> | null;
  outcomeCounts24h: Record<string, unknown> | null;
  outcomeCounts7d: Record<string, unknown> | null;
  runCount24h: number;
  failureCount24h: number;
  fetchedItemCount24h: number;
  newItemCount24h: number;
  duplicateCount24h: number;
  runCount7d: number;
  failureCount7d: number;
  fetchedItemCount7d: number;
  newItemCount7d: number;
  duplicateCount7d: number;
  signalCandidateCount: number;
  selectedRows: number;
  selectedUniqueContent: number;
  grayRows: number;
  rejectedRows: number;
  visibleSignalCandidates: number;
  duplicateSignalCandidates: number;
  webResourceCount: number;
  projectedResourceCount: number;
  resourceOnlyCount: number;
  extractionFailedCount: number;
  projectedSelectedRows: number;
  projectedGrayRows: number;
  projectedRejectedRows: number;
}

const TECHNICAL_BUCKETS = new Set<ChannelBottleneckFailureBucket>([
  "broken_fetch",
  "provider_shape_mismatch",
  "adapter_required",
  "rate_limited",
  "robots_blocked",
  "projection_blocked",
  "gone_404",
  "auth_or_blocked_403",
  "not_acceptable_406",
  "malformed_feed",
  "html_instead_of_feed",
  "timeout_dns_tls",
  "too_large",
]);

function normalizeString(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeStringOrNull(value: unknown): string | null {
  const normalized = normalizeString(value);
  return normalized || null;
}

function normalizeAdapterKeyOrNull(value: unknown): string | null {
  const normalized = normalizeString(value).replace(/^(api|rss|website|email_imap)\./u, "");
  return normalized || null;
}

function toNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toBoolean(value: unknown): boolean {
  return value === true || value === "true";
}

function normalizeCounterMap(value: Record<string, unknown> | null): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, count] of Object.entries(value ?? {})) {
    result[key] = toNumber(count);
  }
  return result;
}

function increment<K extends string>(map: Map<K, number>, key: K): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function isTechnicalBucket(bucket: ChannelBottleneckFailureBucket): boolean {
  return TECHNICAL_BUCKETS.has(bucket);
}

function readMaxPageSize(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 50;
  }
  return Math.max(1, Math.min(200, Math.trunc(value ?? 50)));
}

function readPage(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(1, Math.trunc(value ?? 1));
}

function classifyErrorBucket(row: RawChannelBottleneckRow): ChannelBottleneckFailureBucket | null {
  const errorText = [
    row.lastErrorText,
    row.lastProviderMetrics ? JSON.stringify(row.lastProviderMetrics) : "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const status = toNumber(row.lastHttpStatus);

  if (row.lastOutcomeKind === "rate_limited" || status === 429 || errorText.includes("too many requests")) {
    return "rate_limited";
  }
  if (status === 404 || errorText.includes(" 404") || errorText.includes("not found")) {
    return "gone_404";
  }
  if (status === 401 || status === 403 || errorText.includes("forbidden") || errorText.includes("unauthorized")) {
    return "auth_or_blocked_403";
  }
  if (status === 406 || errorText.includes("not acceptable")) {
    return "not_acceptable_406";
  }
  if (status === 413 || errorText.includes("too large") || errorText.includes("content-length")) {
    return "too_large";
  }
  if (errorText.includes("robots")) {
    return "robots_blocked";
  }
  if (
    errorText.includes("html") &&
    (errorText.includes("rss") || errorText.includes("feed") || errorText.includes("xml"))
  ) {
    return "html_instead_of_feed";
  }
  if (
    errorText.includes("malformed") ||
    errorText.includes("not well-formed") ||
    errorText.includes("xml parse") ||
    errorText.includes("invalid feed") ||
    errorText.includes("bozo")
  ) {
    return "malformed_feed";
  }
  if (
    errorText.includes("timeout") ||
    errorText.includes("timed out") ||
    errorText.includes("enotfound") ||
    errorText.includes("econn") ||
    errorText.includes("dns") ||
    errorText.includes("tls") ||
    errorText.includes("certificate") ||
    errorText.includes("network")
  ) {
    return "timeout_dns_tls";
  }
  if (["hard_failure", "transient_failure"].includes(String(row.lastOutcomeKind ?? ""))) {
    return "broken_fetch";
  }
  return null;
}

function classifyFailureBucket(
  row: RawChannelBottleneckRow,
  validation: ChannelProviderShapeValidation,
): ChannelBottleneckFailureBucket {
  if (validation.blocker === "api_mapping_required") {
    return "adapter_required";
  }
  if (validation.blocker === "rss_requires_feed_evidence") {
    return "provider_shape_mismatch";
  }

  const errorBucket = classifyErrorBucket(row);
  if (errorBucket) {
    return errorBucket;
  }

  if (
    row.providerType === "website" &&
    toNumber(row.webResourceCount) > 0 &&
    toNumber(row.projectedResourceCount) === 0 &&
    toNumber(row.extractionFailedCount) > 0
  ) {
    return "projection_blocked";
  }

  const selectedUnique = toNumber(row.selectedUniqueContent) + toNumber(row.projectedSelectedRows);
  const observed = toNumber(row.signalCandidateCount) + toNumber(row.webResourceCount);
  const recentActivity =
    toNumber(row.fetchedItemCount7d) + toNumber(row.newItemCount7d) + toNumber(row.duplicateCount7d);
  const rejectedOrGray =
    toNumber(row.rejectedRows) +
    toNumber(row.grayRows) +
    toNumber(row.projectedRejectedRows) +
    toNumber(row.projectedGrayRows);

  if (selectedUnique > 0) {
    return "working_low_yield";
  }
  if (observed > 0 || recentActivity > 0 || rejectedOrGray > 0) {
    return "working_noisy";
  }
  return "healthy";
}

function repairLaneFor(bucket: ChannelBottleneckFailureBucket): ChannelBottleneckRepairLane {
  switch (bucket) {
    case "provider_shape_mismatch":
    case "gone_404":
    case "not_acceptable_406":
    case "malformed_feed":
    case "html_instead_of_feed":
    case "too_large":
      return "deep_alternatives";
    case "adapter_required":
      return "configure_adapter";
    case "rate_limited":
      return "respect_rate_limit";
    case "auth_or_blocked_403":
    case "robots_blocked":
      return "access_or_auth_required";
    case "timeout_dns_tls":
    case "broken_fetch":
      return "polite_retry";
    case "projection_blocked":
      return "projection_repair";
    case "working_noisy":
    case "working_low_yield":
      return "monitor_quality";
    default:
      return "none";
  }
}

function isLegacyDdgsInternalBridge(row: Pick<RawChannelBottleneckRow, "adapterKey" | "fetchUrl">): boolean {
  if (normalizeAdapterKeyOrNull(row.adapterKey) !== "ddgs_search") {
    return false;
  }
  const rawUrl = normalizeStringOrNull(row.fetchUrl);
  if (!rawUrl) {
    return false;
  }
  try {
    const parsed = new URL(rawUrl);
    return (
      parsed.pathname === "/maintenance/discovery/search/ddgs" &&
      ["api", "api:8000"].includes(parsed.host.toLowerCase())
    );
  } catch {
    return false;
  }
}

function mapRow(row: RawChannelBottleneckRow): ChannelBottleneckRow {
  const validation = buildProviderShapeValidation(row.providerType, row.fetchUrl);
  const failureBucket = classifyFailureBucket(row, validation);
  const repairLane = repairLaneFor(failureBucket);
  const nextDueAt = normalizeStringOrNull(row.nextDueAt);
  const nextDueTime = nextDueAt ? new Date(nextDueAt).getTime() : Number.NaN;
  const legacyDdgsInternalBridge = isLegacyDdgsInternalBridge(row);

  return {
    channelId: normalizeString(row.channelId),
    name: normalizeString(row.name),
    providerType: normalizeString(row.providerType),
    adapterKey: normalizeStringOrNull(row.adapterKey),
    researchMode: normalizeStringOrNull(row.researchMode),
    tosRisk: normalizeStringOrNull(row.tosRisk),
    sourceRole: normalizeStringOrNull(row.sourceRole),
    fetchUrl: normalizeStringOrNull(row.fetchUrl),
    isActive: toBoolean(row.isActive),
    activeState: toBoolean(row.isActive) ? "active" : "paused",
    pollIntervalSeconds: toNumber(row.pollIntervalSeconds),
    effectivePollIntervalSeconds: toNumber(row.effectivePollIntervalSeconds),
    maxPollIntervalSeconds: toNumber(row.maxPollIntervalSeconds),
    nextDueAt,
    repairDue: isTechnicalBucket(failureBucket) && (Number.isNaN(nextDueTime) || nextDueTime <= Date.now()),
    lastOutcomeKind: normalizeStringOrNull(row.lastOutcomeKind),
    lastHttpStatus: row.lastHttpStatus == null ? null : toNumber(row.lastHttpStatus),
    lastErrorText: normalizeStringOrNull(row.lastErrorText),
    consecutiveFailures: toNumber(row.consecutiveFailures),
    consecutiveNoChangePolls: toNumber(row.consecutiveNoChangePolls),
    adaptiveReason: normalizeStringOrNull(row.adaptiveReason),
    outcomes24h: normalizeCounterMap(row.outcomeCounts24h),
    outcomes7d: normalizeCounterMap(row.outcomeCounts7d),
    runStats24h: {
      runs: toNumber(row.runCount24h),
      failures: toNumber(row.failureCount24h),
      fetchedItems: toNumber(row.fetchedItemCount24h),
      newItems: toNumber(row.newItemCount24h),
      duplicates: toNumber(row.duplicateCount24h),
    },
    runStats7d: {
      runs: toNumber(row.runCount7d),
      failures: toNumber(row.failureCount7d),
      fetchedItems: toNumber(row.fetchedItemCount7d),
      newItems: toNumber(row.newItemCount7d),
      duplicates: toNumber(row.duplicateCount7d),
    },
    contentStats: {
      signalCandidateCount: toNumber(row.signalCandidateCount),
      selectedRows: toNumber(row.selectedRows),
      selectedUniqueContent: toNumber(row.selectedUniqueContent),
      grayRows: toNumber(row.grayRows),
      rejectedRows: toNumber(row.rejectedRows),
      visibleSignalCandidates: toNumber(row.visibleSignalCandidates),
      duplicateSignalCandidates: toNumber(row.duplicateSignalCandidates),
    },
    projectionStats: {
      resources: toNumber(row.webResourceCount),
      projectedResources: toNumber(row.projectedResourceCount),
      resourceOnly: toNumber(row.resourceOnlyCount),
      extractionFailed: toNumber(row.extractionFailedCount),
      projectedSelected: toNumber(row.projectedSelectedRows),
      projectedGray: toNumber(row.projectedGrayRows),
      projectedRejected: toNumber(row.projectedRejectedRows),
    },
    providerShapeValidation: validation,
    failureBucket,
    repairLane,
    legacyDdgsInternalBridge,
    legacyBridgeWarning: legacyDdgsInternalBridge
      ? "DDGS channel identity still points at the removed internal API bridge. Fetchers now execute ddgs_search directly from adapter.searchQuery, so polling can continue without private-host allowlisting; re-materialize through channels.bulk_onboard.plan later to replace the display URL."
      : null,
  };
}

async function readRawBottleneckRows(
  pool: Pool,
  options: Pick<ChannelBottleneckListOptions, "channelIds" | "providerType" | "q"> = {},
): Promise<RawChannelBottleneckRow[]> {
  const channelIds = Array.from(new Set((options.channelIds ?? []).map(normalizeString).filter(Boolean)));
  const providerType = normalizeStringOrNull(options.providerType);
  const queryText = normalizeStringOrNull(options.q);
  const result = await pool.query<RawChannelBottleneckRow>(
    `
      select
        sc.channel_id::text as "channelId",
        sc.name,
        sc.provider_type as "providerType",
        scab.adapter_key as "adapterKey",
        coalesce(sc.config_json #>> '{api,researchMode}', sc.config_json #>> '{adapter,researchMode}', sc.config_json #>> '{researchMode}') as "researchMode",
        coalesce(sc.config_json #>> '{api,tosRisk}', sc.config_json #>> '{adapter,tosRisk}', sc.config_json #>> '{tosRisk}') as "tosRisk",
        coalesce(sc.config_json #>> '{api,sourceRole}', sc.config_json #>> '{adapter,sourceRole}', sc.config_json #>> '{discovery,sourceRole}', sc.config_json #>> '{sourceRole}') as "sourceRole",
        sc.fetch_url as "fetchUrl",
        sc.is_active as "isActive",
        sc.poll_interval_seconds as "pollIntervalSeconds",
        coalesce(scrs.effective_poll_interval_seconds, sc.poll_interval_seconds)::int as "effectivePollIntervalSeconds",
        coalesce(scrs.max_poll_interval_seconds, least(sc.poll_interval_seconds * 16, 259200))::int as "maxPollIntervalSeconds",
        coalesce(
          scrs.next_due_at,
          case
            when sc.last_fetch_at is null then now()
            else sc.last_fetch_at + make_interval(secs => sc.poll_interval_seconds)
          end
        ) as "nextDueAt",
        coalesce(scrs.consecutive_failures, 0)::int as "consecutiveFailures",
        coalesce(scrs.consecutive_no_change_polls, 0)::int as "consecutiveNoChangePolls",
        scrs.adaptive_reason as "adaptiveReason",
        coalesce(last_run.outcome_kind, scrs.last_result_kind) as "lastOutcomeKind",
        last_run.http_status as "lastHttpStatus",
        coalesce(last_run.error_text, sc.last_error_message) as "lastErrorText",
        last_run.provider_metrics_json as "lastProviderMetrics",
        coalesce(outcomes.outcome_counts_24h, '{}'::jsonb) as "outcomeCounts24h",
        coalesce(outcomes.outcome_counts_7d, '{}'::jsonb) as "outcomeCounts7d",
        coalesce(runs.run_count_24h, 0)::int as "runCount24h",
        coalesce(runs.failure_count_24h, 0)::int as "failureCount24h",
        coalesce(runs.fetched_item_count_24h, 0)::int as "fetchedItemCount24h",
        coalesce(runs.new_item_count_24h, 0)::int as "newItemCount24h",
        coalesce(runs.duplicate_count_24h, 0)::int as "duplicateCount24h",
        coalesce(runs.run_count_7d, 0)::int as "runCount7d",
        coalesce(runs.failure_count_7d, 0)::int as "failureCount7d",
        coalesce(runs.fetched_item_count_7d, 0)::int as "fetchedItemCount7d",
        coalesce(runs.new_item_count_7d, 0)::int as "newItemCount7d",
        coalesce(runs.duplicate_count_7d, 0)::int as "duplicateCount7d",
        coalesce(signal_candidate_stats.signal_candidate_count, 0)::int as "signalCandidateCount",
        coalesce(signal_candidate_stats.selected_rows, 0)::int as "selectedRows",
        coalesce(signal_candidate_stats.selected_unique_content, 0)::int as "selectedUniqueContent",
        coalesce(signal_candidate_stats.gray_rows, 0)::int as "grayRows",
        coalesce(signal_candidate_stats.rejected_rows, 0)::int as "rejectedRows",
        coalesce(signal_candidate_stats.visible_signal_candidates, 0)::int as "visibleSignalCandidates",
        coalesce(signal_candidate_stats.duplicate_signal_candidates, 0)::int as "duplicateSignalCandidates",
        coalesce(web_stats.web_resource_count, 0)::int as "webResourceCount",
        coalesce(web_stats.projected_resource_count, 0)::int as "projectedResourceCount",
        coalesce(web_stats.resource_only_count, 0)::int as "resourceOnlyCount",
        coalesce(web_stats.extraction_failed_count, 0)::int as "extractionFailedCount",
        coalesce(web_stats.projected_selected_rows, 0)::int as "projectedSelectedRows",
        coalesce(web_stats.projected_gray_rows, 0)::int as "projectedGrayRows",
        coalesce(web_stats.projected_rejected_rows, 0)::int as "projectedRejectedRows"
      from source_channels sc
      left join source_channel_runtime_state scrs on scrs.channel_id = sc.channel_id
      left join source_channel_adapter_binding scab on scab.channel_id = sc.channel_id and scab.enabled = true
      left join lateral (
        select cfr.outcome_kind,
               cfr.http_status,
               cfr.error_text,
               cfr.provider_metrics_json
        from channel_fetch_runs cfr
        where cfr.channel_id = sc.channel_id
        order by cfr.started_at desc
        limit 1
      ) last_run on true
      left join lateral (
        select
          coalesce(jsonb_object_agg("outcomeKind", "count24h") filter (where "count24h" > 0), '{}'::jsonb) as outcome_counts_24h,
          coalesce(jsonb_object_agg("outcomeKind", "count7d") filter (where "count7d" > 0), '{}'::jsonb) as outcome_counts_7d
        from (
          select
            cfr.outcome_kind as "outcomeKind",
            count(*) filter (where cfr.started_at >= now() - interval '24 hours')::int as "count24h",
            count(*) filter (where cfr.started_at >= now() - interval '7 days')::int as "count7d"
          from channel_fetch_runs cfr
          where cfr.channel_id = sc.channel_id
            and cfr.started_at >= now() - interval '7 days'
          group by cfr.outcome_kind
        ) counts
      ) outcomes on true
      left join lateral (
        select
          count(*) filter (where cfr.started_at >= now() - interval '24 hours')::int as run_count_24h,
          count(*) filter (
            where cfr.started_at >= now() - interval '24 hours'
              and cfr.outcome_kind in ('rate_limited', 'transient_failure', 'hard_failure')
          )::int as failure_count_24h,
          coalesce(sum(cfr.fetched_item_count) filter (where cfr.started_at >= now() - interval '24 hours'), 0)::int as fetched_item_count_24h,
          coalesce(sum(cfr.new_signal_candidate_count) filter (where cfr.started_at >= now() - interval '24 hours'), 0)::int as new_item_count_24h,
          coalesce(sum(cfr.duplicate_suppressed_count) filter (where cfr.started_at >= now() - interval '24 hours'), 0)::int as duplicate_count_24h,
          count(*) filter (where cfr.started_at >= now() - interval '7 days')::int as run_count_7d,
          count(*) filter (
            where cfr.started_at >= now() - interval '7 days'
              and cfr.outcome_kind in ('rate_limited', 'transient_failure', 'hard_failure')
          )::int as failure_count_7d,
          coalesce(sum(cfr.fetched_item_count) filter (where cfr.started_at >= now() - interval '7 days'), 0)::int as fetched_item_count_7d,
          coalesce(sum(cfr.new_signal_candidate_count) filter (where cfr.started_at >= now() - interval '7 days'), 0)::int as new_item_count_7d,
          coalesce(sum(cfr.duplicate_suppressed_count) filter (where cfr.started_at >= now() - interval '7 days'), 0)::int as duplicate_count_7d
        from channel_fetch_runs cfr
        where cfr.channel_id = sc.channel_id
          and cfr.started_at >= now() - interval '7 days'
      ) runs on true
      left join lateral (
        select
          count(*)::int as signal_candidate_count,
          count(*) filter (where fsr.final_decision = 'selected')::int as selected_rows,
          count(distinct coalesce(fsr.canonical_document_id, a.canonical_doc_id, a.doc_id)) filter (where fsr.is_selected = true)::int as selected_unique_content,
          count(*) filter (where fsr.final_decision = 'gray_zone')::int as gray_rows,
          count(*) filter (where fsr.final_decision = 'rejected')::int as rejected_rows,
          count(*) filter (where a.visibility_state = 'visible')::int as visible_signal_candidates,
          count(*) filter (where a.is_exact_duplicate = true or a.is_near_duplicate = true or a.canonical_doc_id is not null)::int as duplicate_signal_candidates
        from signal_candidates a
        left join final_selection_results fsr on fsr.doc_id = a.doc_id
        where a.channel_id = sc.channel_id
      ) signal_candidate_stats on true
      left join lateral (
        select
          count(*)::int as web_resource_count,
          count(*) filter (where wr.projected_signal_candidate_id is not null)::int as projected_resource_count,
          count(*) filter (where wr.projected_signal_candidate_id is null)::int as resource_only_count,
          count(*) filter (where wr.extraction_state = 'failed')::int as extraction_failed_count,
          count(*) filter (where fsr.final_decision = 'selected')::int as projected_selected_rows,
          count(*) filter (where fsr.final_decision = 'gray_zone')::int as projected_gray_rows,
          count(*) filter (where fsr.final_decision = 'rejected')::int as projected_rejected_rows
        from web_resources wr
        left join final_selection_results fsr on fsr.doc_id = wr.projected_signal_candidate_id
        where wr.channel_id = sc.channel_id
      ) web_stats on true
      where
        (cardinality($1::text[]) = 0 or sc.channel_id::text = any($1::text[]))
        and ($2::text is null or sc.provider_type = $2::text)
        and (
          $3::text is null
          or sc.name ilike ('%' || $3::text || '%')
          or coalesce(sc.fetch_url, '') ilike ('%' || $3::text || '%')
        )
      order by
        case when coalesce(scrs.consecutive_failures, 0) > 0 then 0 else 1 end,
        coalesce(scrs.updated_at, sc.updated_at) desc,
        sc.updated_at desc
    `,
    [channelIds, providerType, queryText],
  );
  return result.rows;
}

async function readMappedRows(
  pool: Pool,
  options: ChannelBottleneckListOptions = {},
): Promise<ChannelBottleneckRow[]> {
  const rows = (await readRawBottleneckRows(pool, options)).map(mapRow);
  return rows.filter((row) => {
    if (options.failureBucket && row.failureBucket !== options.failureBucket) {
      return false;
    }
    if (options.repairLane && row.repairLane !== options.repairLane) {
      return false;
    }
    return true;
  });
}

export async function listChannelBottlenecksWithPool(
  pool: Pool,
  options: ChannelBottleneckListOptions = {},
): Promise<ChannelBottleneckList> {
  const page = readPage(options.page);
  const pageSize = readMaxPageSize(options.pageSize);
  const rows = await readMappedRows(pool, options);
  const offset = (page - 1) * pageSize;
  return {
    generatedAt: new Date().toISOString(),
    page,
    pageSize,
    total: rows.length,
    items: rows.slice(offset, offset + pageSize),
  };
}

export async function summarizeChannelBottlenecksWithPool(
  pool: Pool,
  options: Omit<ChannelBottleneckListOptions, "page" | "pageSize"> = {},
): Promise<ChannelBottleneckSummary> {
  const rows = await readMappedRows(pool, options);
  const byBucket = new Map<ChannelBottleneckFailureBucket, number>();
  const byLane = new Map<ChannelBottleneckRepairLane, number>();
  const byProvider = new Map<string, { providerType: string; count: number; technicalBottlenecks: number }>();
  for (const row of rows) {
    increment(byBucket, row.failureBucket);
    increment(byLane, row.repairLane);
    const provider = byProvider.get(row.providerType) ?? {
      providerType: row.providerType,
      count: 0,
      technicalBottlenecks: 0,
    };
    provider.count += 1;
    if (isTechnicalBucket(row.failureBucket)) {
      provider.technicalBottlenecks += 1;
    }
    byProvider.set(row.providerType, provider);
  }

  return {
    generatedAt: new Date().toISOString(),
    totalChannels: rows.length,
    activeChannels: rows.filter((row) => row.isActive).length,
    technicalBottlenecks: rows.filter((row) => isTechnicalBucket(row.failureBucket)).length,
    workingNoisy: rows.filter((row) => row.failureBucket === "working_noisy").length,
    workingLowYield: rows.filter((row) => row.failureBucket === "working_low_yield").length,
    byFailureBucket: [...byBucket.entries()]
      .map(([failureBucket, count]) => ({ failureBucket, count }))
      .sort((left, right) => right.count - left.count || left.failureBucket.localeCompare(right.failureBucket)),
    byRepairLane: [...byLane.entries()]
      .map(([repairLane, count]) => ({ repairLane, count }))
      .sort((left, right) => right.count - left.count || left.repairLane.localeCompare(right.repairLane)),
    byProvider: [...byProvider.values()].sort(
      (left, right) => right.technicalBottlenecks - left.technicalBottlenecks || right.count - left.count,
    ),
    nextReadBack: [
      { tool: "channels.bottlenecks.list", arguments: { failureBucket: "provider_shape_mismatch" } },
      { tool: "channels.alternatives.plan", arguments: { failureKinds: ["hard_failure"], includeFeedProbe: true } },
      { tool: "operator.report.verify", arguments: { reportKind: "source_bottleneck", entityIds: {} } },
    ],
  };
}

export async function explainChannelBottleneckWithPool(
  pool: Pool,
  channelId: string,
): Promise<ChannelBottleneckRow & { diagnosis: Record<string, unknown>; nextActions: Array<Record<string, unknown>> }> {
  const rows = await readMappedRows(pool, { channelIds: [channelId] });
  const row = rows[0];
  if (!row) {
    throw new ChannelBottleneckNotFoundError(channelId);
  }
  return {
    ...row,
    diagnosis: {
      sourceHealthDoesNotSelectContent: true,
      lowYieldIsFailure: false,
      failureBucket: row.failureBucket,
      repairLane: row.repairLane,
      providerShapeBlocker: row.providerShapeValidation.blocker,
      legacyDdgsInternalBridge: row.legacyDdgsInternalBridge,
      legacyBridgeWarning: row.legacyBridgeWarning,
      selectedContentEvidence: row.contentStats.selectedUniqueContent,
      projectionEvidence: row.projectionStats,
    },
    nextActions: [
      ...(row.repairLane === "deep_alternatives"
        ? [
            {
              tool: "channels.alternatives.plan",
              arguments: { channelIds: [row.channelId], includeFeedProbe: true, maxCandidates: 20 },
            },
          ]
        : []),
      ...(row.legacyDdgsInternalBridge
        ? [
            {
              tool: "channels.bulk_onboard.plan",
              arguments: { providerType: "api", maxChannels: 20 },
              reason: "Re-materialize legacy DDGS bridge channels with safe duckduckgo.com identity URLs; do not delete retained evidence.",
            },
          ]
        : []),
      ...(row.providerShapeValidation.blocker
        ? [
            {
              tool: "channels.bulk_onboard.plan",
              arguments: { sources: row.providerShapeValidation.recommendedAlternatives },
            },
          ]
        : []),
      {
        tool: "fetch_runs.list",
        arguments: { channelId: row.channelId, pageSize: 10 },
      },
    ],
  };
}
