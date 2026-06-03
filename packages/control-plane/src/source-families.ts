import type { Pool } from "pg";

import { buildProviderShapeValidation } from "./channel-bulk-onboarding";

export const SOURCE_FAMILY_KEYS = [
  "direct_rss",
  "query_rss_google_news",
  "query_rss_hnrss",
  "query_rss_reddit",
  "procurement",
  "forum_support",
  "marketplace_api",
  "ats_jobs",
  "remote_jobs",
  "indirect_search",
  "website",
  "adapter_required",
  "access_required",
  "unknown",
] as const;

export type SourceFamilyKey = (typeof SOURCE_FAMILY_KEYS)[number];

export const SOURCE_LIFECYCLE_LABELS = [
  "working_high_signal",
  "working_noisy_semantic_match",
  "working_low_yield",
  "negative_control_useful",
  "technical_bottleneck",
  "provider_shape_mismatch",
  "adapter_required",
  "access_required",
  "policy_restricted",
  "operator_disabled",
] as const;

export type SourceLifecycleLabel = (typeof SOURCE_LIFECYCLE_LABELS)[number];

export interface SourceFamilyChannelLike {
  providerType?: string | null;
  adapterKey?: string | null;
  sourceRole?: string | null;
  fetchUrl?: string | null;
  isActive?: boolean | string | null;
  lastSuccessAt?: string | Date | null;
  lastErrorText?: string | null;
  lastOutcomeKind?: string | null;
  lastHttpStatus?: number | string | null;
  consecutiveFailures?: number | string | null;
  runCount7d?: number | string | null;
  failureCount7d?: number | string | null;
  newItemCount7d?: number | string | null;
  articleCount?: number | string | null;
  webResourceCount?: number | string | null;
  selectedRows?: number | string | null;
  grayRows?: number | string | null;
  rejectedRows?: number | string | null;
  configJson?: Record<string, unknown> | null;
}

interface RawSourceFamilyChannelRow {
  channelId: string;
  name: string;
  providerType: string;
  adapterKey: string | null;
  researchMode: string | null;
  tosRisk: string | null;
  sourceRole: string | null;
  fetchUrl: string | null;
  isActive: boolean;
  pollIntervalSeconds: number | null;
  effectivePollIntervalSeconds: number | null;
  lastSuccessAt: Date | string | null;
  lastErrorText: string | null;
  lastOutcomeKind: string | null;
  lastHttpStatus: number | null;
  consecutiveFailures: number | null;
  runCount7d: number;
  failureCount7d: number;
  newItemCount7d: number;
  articleCount: number;
  webResourceCount: number;
  selectedRows: number;
  grayRows: number;
  rejectedRows: number;
  configJson: Record<string, unknown> | null;
}

interface RawSourceFamilyEndpointRow {
  sourceRole: string | null;
  providerType: string | null;
  endpointUrl: string | null;
  status: string | null;
  recommendedAction: string | null;
  evidenceJson: Record<string, unknown> | null;
}

export interface SourceFamilyCoverageRow {
  sourceFamily: SourceFamilyKey;
  channels: number;
  activeChannels: number;
  workingChannels: number;
  workingHighSignal: number;
  workingNoisySemanticMatch: number;
  workingLowYield: number;
  negativeControlUseful: number;
  technicalBottlenecks: number;
  providerShapeMismatch: number;
  adapterRequired: number;
  accessRequired: number;
  policyRestricted: number;
  operatorDisabled: number;
  endpointCandidates: number;
  selectedRows: number;
  grayRows: number;
  rejectedRows: number;
  newItems7d: number;
  examples: Array<Record<string, unknown>>;
}

export interface SourceFamilyCoverage {
  generatedAt: string;
  families: SourceFamilyCoverageRow[];
  missingFamilies: SourceFamilyKey[];
  lifecycleCounts: Array<{ lifecycleLabel: SourceLifecycleLabel; count: number }>;
  retainedWorkingNoisyChannels: number;
  retainedWorkingLowYieldChannels: number;
  negativeControlUsefulChannels: number;
  technicalRepairChannels: number;
  operatorDisabledChannels: number;
  risks: string[];
  autoDisablePolicy: {
    semanticNoisyAutoDisableAllowed: false;
    lowYieldAutoDisableAllowed: false;
    negativeControlAutoDisableAllowed: false;
    automaticActionsAllowed: readonly string[];
    operatorDisableRequiresExplicitReason: true;
  };
  recommendations: Array<Record<string, unknown>>;
  nextReadBack: string[];
}

const SEARCH_ADAPTER_KEYS = new Set([
  "ddgs_search",
  "searxng_search",
  "brave_search",
  "tavily_search",
  "exa_search",
  "serpapi_google_news_research",
]);

const MARKETPLACE_ADAPTER_KEYS = new Set([
  "peopleperhour_public_projects_research",
  "freelancer_public_projects_research",
  "guru_public_projects_research",
  "malt_public_projects_research",
  "contra_public_search_research",
  "upwork_public_signal_research",
  "linkedin_public_signal_research",
]);

const ATS_ADAPTER_KEYS = new Set(["greenhouse_job_board", "lever_postings", "ashby_job_postings"]);
const REMOTE_JOB_ADAPTER_KEYS = new Set(["remotive_jobs", "remoteok_jobs", "weworkremotely_rss"]);
const FORUM_ADAPTER_KEYS = new Set(["hn_algolia_search", "stack_exchange_search", "github_issues_search", "discourse_search"]);

const TECHNICAL_LIFECYCLE_LABELS = new Set<SourceLifecycleLabel>([
  "technical_bottleneck",
  "provider_shape_mismatch",
  "adapter_required",
  "access_required",
  "policy_restricted",
]);

function normalizeString(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeLower(value: unknown): string {
  return normalizeString(value).toLowerCase();
}

function normalizeAdapterKey(value: unknown): string {
  return normalizeLower(value).replace(/^(api|rss|website|email_imap)\./u, "");
}

function toNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toBoolean(value: unknown): boolean {
  return value === true || value === "true";
}

function hostFromUrl(rawUrl: string | null | undefined): string {
  try {
    return new URL(String(rawUrl ?? "")).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function nestedString(config: Record<string, unknown> | null | undefined, path: string[]): string {
  let current: unknown = config;
  for (const key of path) {
    if (current == null || typeof current !== "object" || Array.isArray(current)) {
      return "";
    }
    current = (current as Record<string, unknown>)[key];
  }
  return normalizeLower(current);
}

function nestedBoolean(config: Record<string, unknown> | null | undefined, path: string[]): boolean {
  let current: unknown = config;
  for (const key of path) {
    if (current == null || typeof current !== "object" || Array.isArray(current)) {
      return false;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return toBoolean(current);
}

function isKnownSemanticRole(role: string): boolean {
  return Boolean(role) && role !== "unknown" && role !== "rss_web";
}

function hasRareSignalPrior(config: Record<string, unknown> | null | undefined): boolean {
  return Boolean(
    nestedString(config, ["discovery", "rareSignalPrior", "tier"]) ||
      nestedString(config, ["rareSignalPrior", "tier"]),
  );
}

function isNegativeControl(config: Record<string, unknown> | null | undefined): boolean {
  return (
    nestedBoolean(config, ["discovery", "negativeControl"]) ||
    nestedBoolean(config, ["negativeControl"]) ||
    nestedBoolean(config, ["api", "negativeControl"]) ||
    nestedBoolean(config, ["adapter", "negativeControl"])
  );
}

export function classifySourceFamily(input: SourceFamilyChannelLike): SourceFamilyKey {
  const providerType = normalizeLower(input.providerType);
  const adapterKey = normalizeAdapterKey(input.adapterKey);
  const sourceRole = normalizeLower(input.sourceRole);
  const url = normalizeLower(input.fetchUrl);
  const host = hostFromUrl(input.fetchUrl);

  if (sourceRole === "indirect_aggregator" || SEARCH_ADAPTER_KEYS.has(adapterKey) || url.startsWith("search://")) {
    return "indirect_search";
  }
  if (sourceRole === "project_marketplace" || MARKETPLACE_ADAPTER_KEYS.has(adapterKey)) {
    return "marketplace_api";
  }
  if (sourceRole === "ats_job_board" || ATS_ADAPTER_KEYS.has(adapterKey)) {
    return "ats_jobs";
  }
  if (sourceRole === "remote_job_board" || REMOTE_JOB_ADAPTER_KEYS.has(adapterKey)) {
    return "remote_jobs";
  }
  if (sourceRole === "procurement") {
    return "procurement";
  }
  if (providerType === "rss") {
    if (host === "news.google.com") return "query_rss_google_news";
    if (host === "hnrss.org") return "query_rss_hnrss";
    if (host.endsWith("reddit.com") || host === "reddit.com") return "query_rss_reddit";
    return "direct_rss";
  }
  if (sourceRole === "forum_support" || sourceRole === "community_search" || FORUM_ADAPTER_KEYS.has(adapterKey)) {
    return "forum_support";
  }
  if (providerType === "website") {
    return "website";
  }
  return "unknown";
}

function classifyTechnicalLifecycle(input: SourceFamilyChannelLike): SourceLifecycleLabel | null {
  const providerType = normalizeString(input.providerType);
  const fetchUrl = normalizeString(input.fetchUrl);
  const validation = buildProviderShapeValidation(providerType, fetchUrl);
  const adapterKey = normalizeAdapterKey(input.adapterKey);
  const tosRisk = nestedString(input.configJson, ["api", "tosRisk"]) || nestedString(input.configJson, ["adapter", "tosRisk"]);
  const researchMode =
    nestedString(input.configJson, ["api", "researchMode"]) || nestedString(input.configJson, ["adapter", "researchMode"]);
  const errorText = normalizeLower(input.lastErrorText);
  const outcome = normalizeLower(input.lastOutcomeKind);
  const status = toNumber(input.lastHttpStatus);
  const consecutiveFailures = toNumber(input.consecutiveFailures);
  const hasFeedEvidence =
    Boolean(input.lastSuccessAt) ||
    status === 200 ||
    outcome === "new_content" ||
    outcome === "no_change" ||
    outcome === "success";

  if (validation.blocker === "api_mapping_required") return "adapter_required";
  if (validation.blocker === "rss_requires_feed_evidence" && !hasFeedEvidence) return "provider_shape_mismatch";
  if (tosRisk === "high" && researchMode !== "research_only") return "policy_restricted";
  if (adapterKey.includes("linkedin") || adapterKey.includes("upwork")) {
    if (researchMode === "research_only" && nestedString(input.configJson, ["api", "accessKind"]).includes("closed")) {
      return "access_required";
    }
  }
  if (status === 401 || status === 403 || errorText.includes("forbidden") || errorText.includes("unauthorized")) {
    return "access_required";
  }
  if (errorText.includes("robots") || errorText.includes("captcha") || errorText.includes("login required")) {
    return "access_required";
  }
  if (outcome === "hard_failure" || consecutiveFailures >= 3 || status === 404 || status === 406) {
    return "technical_bottleneck";
  }
  if (
    errorText.includes("malformed") ||
    errorText.includes("invalid feed") ||
    errorText.includes("html instead") ||
    errorText.includes("not well-formed") ||
    errorText.includes("timeout") ||
    errorText.includes("dns") ||
    errorText.includes("tls")
  ) {
    return "technical_bottleneck";
  }
  return null;
}

export function classifySourceLifecycleLabel(input: SourceFamilyChannelLike): SourceLifecycleLabel {
  if (!toBoolean(input.isActive)) {
    return "operator_disabled";
  }
  if (isNegativeControl(input.configJson)) {
    return "negative_control_useful";
  }
  const technical = classifyTechnicalLifecycle(input);
  if (technical) {
    return technical;
  }

  const selected = toNumber(input.selectedRows);
  const gray = toNumber(input.grayRows);
  const rejected = toNumber(input.rejectedRows);
  const articles = toNumber(input.articleCount);
  const resources = toNumber(input.webResourceCount);
  const newItems = toNumber(input.newItemCount7d);
  const hasSuccess = Boolean(input.lastSuccessAt) || toNumber(input.runCount7d) > toNumber(input.failureCount7d);
  const semanticMatch =
    isKnownSemanticRole(normalizeLower(input.sourceRole)) ||
    classifySourceFamily(input) !== "unknown" ||
    hasRareSignalPrior(input.configJson);

  if (selected > 0) {
    return "working_high_signal";
  }
  if (semanticMatch && hasSuccess && gray + rejected + articles + resources + newItems > 0) {
    return "working_noisy_semantic_match";
  }
  return "working_low_yield";
}

function createFamilyRow(sourceFamily: SourceFamilyKey): SourceFamilyCoverageRow {
  return {
    sourceFamily,
    channels: 0,
    activeChannels: 0,
    workingChannels: 0,
    workingHighSignal: 0,
    workingNoisySemanticMatch: 0,
    workingLowYield: 0,
    negativeControlUseful: 0,
    technicalBottlenecks: 0,
    providerShapeMismatch: 0,
    adapterRequired: 0,
    accessRequired: 0,
    policyRestricted: 0,
    operatorDisabled: 0,
    endpointCandidates: 0,
    selectedRows: 0,
    grayRows: 0,
    rejectedRows: 0,
    newItems7d: 0,
    examples: [],
  };
}

function incrementLifecycle(row: SourceFamilyCoverageRow, label: SourceLifecycleLabel): void {
  if (label === "working_high_signal") row.workingHighSignal += 1;
  if (label === "working_noisy_semantic_match") row.workingNoisySemanticMatch += 1;
  if (label === "working_low_yield") row.workingLowYield += 1;
  if (label === "negative_control_useful") row.negativeControlUseful += 1;
  if (label === "technical_bottleneck") row.technicalBottlenecks += 1;
  if (label === "provider_shape_mismatch") row.providerShapeMismatch += 1;
  if (label === "adapter_required") row.adapterRequired += 1;
  if (label === "access_required") row.accessRequired += 1;
  if (label === "policy_restricted") row.policyRestricted += 1;
  if (label === "operator_disabled") row.operatorDisabled += 1;
  if (!TECHNICAL_LIFECYCLE_LABELS.has(label) && label !== "operator_disabled") {
    row.workingChannels += 1;
  }
}

function addRecommendation(recommendations: Array<Record<string, unknown>>, row: SourceFamilyCoverageRow): void {
  if (row.channels === 0 && row.endpointCandidates === 0) {
    recommendations.push({
      action: "expand_source_family",
      sourceFamily: row.sourceFamily,
      reason: "Coverage-first rare-signal funnels should keep plausible source families represented.",
      autoDisablesSources: false,
    });
  } else if (row.technicalBottlenecks + row.providerShapeMismatch + row.adapterRequired + row.accessRequired > 0) {
    recommendations.push({
      action: "repair_or_map_technical_bottlenecks",
      sourceFamily: row.sourceFamily,
      reason: "Repair transport/provider-shape/access issues separately from semantic selection.",
      autoDisablesSources: false,
    });
  } else if (row.workingNoisySemanticMatch > 0 || row.workingLowYield > 0) {
    recommendations.push({
      action: "retain_and_measure",
      sourceFamily: row.sourceFamily,
      reason: "Working noisy or low-yield semantic sources may contain rare positives; adjust cadence/measurement, not activation.",
      autoDisablesSources: false,
    });
  }
}

function endpointFamily(row: RawSourceFamilyEndpointRow): SourceFamilyKey {
  const evidence = row.evidenceJson ?? {};
  const adapterResearch = (evidence.adapterBacklog ?? evidence.adapterResearch ?? {}) as Record<string, unknown>;
  const accessKind = normalizeLower(adapterResearch.accessKind);
  if (accessKind === "closed_access" || accessKind === "github_unofficial_restricted") {
    return "access_required";
  }
  if (normalizeLower(row.recommendedAction).includes("needs_config") || evidence.adapterResearch) {
    return "adapter_required";
  }
  return classifySourceFamily({
    providerType: row.providerType,
    sourceRole: row.sourceRole,
    fetchUrl: row.endpointUrl,
    adapterKey: normalizeString(adapterResearch.adapterKey),
  });
}

export async function getSourceFamilyCoverageWithPool(
  pool: Pool,
  input: { includeExamples?: boolean } = {},
): Promise<SourceFamilyCoverage> {
  const channelResult = await pool.query<RawSourceFamilyChannelRow>(`
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
      sc.last_success_at as "lastSuccessAt",
      coalesce(last_run.error_text, sc.last_error_message) as "lastErrorText",
      coalesce(last_run.outcome_kind, scrs.last_result_kind) as "lastOutcomeKind",
      last_run.http_status as "lastHttpStatus",
      coalesce(scrs.consecutive_failures, 0)::int as "consecutiveFailures",
      coalesce(runs.run_count_7d, 0)::int as "runCount7d",
      coalesce(runs.failure_count_7d, 0)::int as "failureCount7d",
      coalesce(runs.new_item_count_7d, 0)::int as "newItemCount7d",
      coalesce(article_stats.article_count, 0)::int as "articleCount",
      coalesce(article_stats.selected_rows, 0)::int as "selectedRows",
      coalesce(article_stats.gray_rows, 0)::int as "grayRows",
      coalesce(article_stats.rejected_rows, 0)::int as "rejectedRows",
      coalesce(web_stats.web_resource_count, 0)::int as "webResourceCount",
      sc.config_json as "configJson"
    from source_channels sc
    left join source_channel_runtime_state scrs on scrs.channel_id = sc.channel_id
    left join source_channel_adapter_binding scab on scab.channel_id = sc.channel_id and scab.enabled = true
    left join lateral (
      select cfr.outcome_kind, cfr.http_status, cfr.error_text
      from channel_fetch_runs cfr
      where cfr.channel_id = sc.channel_id
      order by cfr.started_at desc
      limit 1
    ) last_run on true
    left join lateral (
      select
        count(*) filter (where cfr.started_at >= now() - interval '7 days')::int as run_count_7d,
        count(*) filter (
          where cfr.started_at >= now() - interval '7 days'
            and cfr.outcome_kind in ('rate_limited', 'transient_failure', 'hard_failure')
        )::int as failure_count_7d,
        coalesce(sum(cfr.new_article_count) filter (where cfr.started_at >= now() - interval '7 days'), 0)::int as new_item_count_7d
      from channel_fetch_runs cfr
      where cfr.channel_id = sc.channel_id
        and cfr.started_at >= now() - interval '7 days'
    ) runs on true
    left join lateral (
      select
        count(*)::int as article_count,
        count(*) filter (where fsr.final_decision = 'selected')::int as selected_rows,
        count(*) filter (where fsr.final_decision = 'gray_zone')::int as gray_rows,
        count(*) filter (where fsr.final_decision = 'rejected')::int as rejected_rows
      from articles a
      left join final_selection_results fsr on fsr.doc_id = a.doc_id
      where a.channel_id = sc.channel_id
    ) article_stats on true
    left join lateral (
      select count(*)::int as web_resource_count
      from web_resources wr
      where wr.channel_id = sc.channel_id
    ) web_stats on true
  `);

  const endpointResult = await pool.query<RawSourceFamilyEndpointRow>(`
    select
      coalesce(
        su.payload_json #>> '{sourceRoleDescription}',
        si.risk_json #>> '{sourceRole}',
        'unknown'
      ) as "sourceRole",
      si.current_provider_type as "providerType",
      si.canonical_url as "endpointUrl",
      si.current_state as status,
      case
        when ab.adapter_backlog_id is not null then 'needs_config'
        when si.current_state = 'cheap_watch' then 'monitor'
        else si.current_state
      end as "recommendedAction",
      jsonb_build_object(
        'adapterBacklog', ab.reason_json,
        'inventoryRisk', si.risk_json,
        'currentState', si.current_state
      ) as "evidenceJson"
    from source_inventory si
    left join discovery_artifacts su
      on su.artifact_id = si.latest_source_understanding_artifact_id
    left join adapter_backlog ab
      on ab.source_inventory_id = si.source_inventory_id
     and ab.status in ('open', 'planned')
    where si.current_state in ('inventory', 'cheap_watch', 'manual_review', 'adapter_backlog', 'blocked')
       or ab.adapter_backlog_id is not null
  `);

  const rows = new Map<SourceFamilyKey, SourceFamilyCoverageRow>(
    SOURCE_FAMILY_KEYS.map((sourceFamily) => [sourceFamily, createFamilyRow(sourceFamily)]),
  );
  const lifecycleCounts = new Map<SourceLifecycleLabel, number>();

  for (const channel of channelResult.rows) {
    const sourceFamily = classifySourceFamily(channel);
    const lifecycleLabel = classifySourceLifecycleLabel(channel);
    lifecycleCounts.set(lifecycleLabel, (lifecycleCounts.get(lifecycleLabel) ?? 0) + 1);
    const row = rows.get(sourceFamily) ?? rows.get("unknown")!;
    row.channels += 1;
    row.activeChannels += channel.isActive ? 1 : 0;
    row.selectedRows += toNumber(channel.selectedRows);
    row.grayRows += toNumber(channel.grayRows);
    row.rejectedRows += toNumber(channel.rejectedRows);
    row.newItems7d += toNumber(channel.newItemCount7d);
    incrementLifecycle(row, lifecycleLabel);
    if (input.includeExamples && row.examples.length < 5) {
      row.examples.push({
        channelId: channel.channelId,
        name: channel.name,
        providerType: channel.providerType,
        sourceFamily,
        lifecycleLabel,
        sourceRole: channel.sourceRole,
        adapterKey: channel.adapterKey,
        fetchUrl: channel.fetchUrl,
        selectedRows: channel.selectedRows,
        grayRows: channel.grayRows,
        rejectedRows: channel.rejectedRows,
      });
    }
  }

  for (const endpoint of endpointResult.rows) {
    const family = endpointFamily(endpoint);
    const row = rows.get(family) ?? rows.get("unknown")!;
    row.endpointCandidates += 1;
    if (family === "adapter_required") row.adapterRequired += 1;
    if (family === "access_required") row.accessRequired += 1;
  }

  const families = [...rows.values()];
  const missingFamilies = families
    .filter((row) => row.sourceFamily !== "unknown")
    .filter((row) => row.channels === 0 && row.endpointCandidates === 0)
    .map((row) => row.sourceFamily);
  const recommendations: Array<Record<string, unknown>> = [];
  for (const row of families.filter((entry) => entry.sourceFamily !== "unknown")) {
    addRecommendation(recommendations, row);
  }
  const googleNewsChannels = rows.get("query_rss_google_news")?.channels ?? 0;
  const nonGoogleQueryChannels =
    (rows.get("query_rss_hnrss")?.channels ?? 0) + (rows.get("query_rss_reddit")?.channels ?? 0);
  const risks = [
    ...(googleNewsChannels > 0 && nonGoogleQueryChannels === 0 ? ["queryRssOverConcentratedOnGoogleNews"] : []),
    ...(missingFamilies.length > 0 ? ["missingSourceFamilies"] : []),
    ...(families.some((row) => row.technicalBottlenecks + row.providerShapeMismatch > 0)
      ? ["technicalRepairBacklog"]
      : []),
  ];

  return {
    generatedAt: new Date().toISOString(),
    families,
    missingFamilies,
    lifecycleCounts: SOURCE_LIFECYCLE_LABELS.map((label) => ({
      lifecycleLabel: label,
      count: lifecycleCounts.get(label) ?? 0,
    })),
    retainedWorkingNoisyChannels: lifecycleCounts.get("working_noisy_semantic_match") ?? 0,
    retainedWorkingLowYieldChannels: lifecycleCounts.get("working_low_yield") ?? 0,
    negativeControlUsefulChannels: lifecycleCounts.get("negative_control_useful") ?? 0,
    technicalRepairChannels: [...TECHNICAL_LIFECYCLE_LABELS].reduce(
      (total, label) => total + (lifecycleCounts.get(label) ?? 0),
      0,
    ),
    operatorDisabledChannels: lifecycleCounts.get("operator_disabled") ?? 0,
    risks,
    autoDisablePolicy: {
      semanticNoisyAutoDisableAllowed: false,
      lowYieldAutoDisableAllowed: false,
      negativeControlAutoDisableAllowed: false,
      automaticActionsAllowed: [
        "label",
        "measure",
        "adjust_polling_cadence",
        "repair_technical_bottleneck",
        "mark_adapter_required",
        "mark_access_required",
      ],
      operatorDisableRequiresExplicitReason: true,
    },
    recommendations,
    nextReadBack: [
      "discovery.source_families.coverage",
      "operator.report.verify reportKind=source_family_balance",
      "operator.funnel.autoplan",
      "operator.funnel.iteration.recommend",
    ],
  };
}

export function buildCoverageFirstAutoplan(input: {
  objective?: string;
  coverage?: SourceFamilyCoverage;
  maxNewChannels?: number;
}): Record<string, unknown> {
  const coverage = input.coverage;
  const missingFamilies = coverage?.missingFamilies ?? [];
  const maxNewChannels = Math.max(1, Math.min(500, Math.trunc(Number(input.maxNewChannels ?? 50))));
  return {
    objective: normalizeString(input.objective) || "coverage-first rare-signal funnel",
    strategy: "coverage_first_retention",
    principle:
      "Cover all plausible safe/reachable source families, retain working noisy semantic channels, and let strict item-level selection filter content.",
    sourceLifecycleLabels: SOURCE_LIFECYCLE_LABELS,
    sourceFamilies: SOURCE_FAMILY_KEYS,
    coverageExpansionPlan: missingFamilies.map((sourceFamily) => ({
      sourceFamily,
      maxCandidates: Math.max(1, Math.floor(maxNewChannels / Math.max(1, missingFamilies.length))),
      preferredMcpFlow:
        sourceFamily === "indirect_search"
          ? "discovery.candidates.create -> discovery.probe.execute -> discovery.route.preview"
          : "discovery.mega_loop.preview -> discovery.candidates.create -> discovery.probe.execute -> discovery.route.preview",
      autoDisablesSources: false,
    })),
    pollingPlan: {
      workingHighSignal: "poll normally or slightly faster within provider limits",
      workingNoisySemanticMatch: "retain; slow cadence or observation tier if cost pressure exists",
      workingLowYield: "retain; slow cadence and keep source-family balance metrics",
      negativeControlUseful: "retain for calibration/negative evidence unless operator disables explicitly",
      technicalBottleneck: "repair cadence or alternatives; do not treat as semantic failure",
    },
    negativeControlPlan: {
      keepNegativeHeavySources: true,
      useForCueQuality: true,
      autoDisableAllowed: false,
    },
    repairPlan: {
      allowedAutomaticMoves: ["technical_bottleneck", "provider_shape_mismatch", "adapter_required", "access_required", "policy_restricted"],
      forbiddenAutomaticMoves: ["working_noisy_semantic_match", "working_low_yield", "negative_control_useful"],
    },
    selectionTuningPlan: {
      sourceMetadataCanSelect: false,
      sourceMetadataCanRank: false,
      sourceMetadataCanPublish: false,
      tuneOnlyFromItemEvidence: true,
    },
    proofPlan: [
      "discovery.source_families.coverage",
      "operator.report.verify reportKind=source_family_balance",
      "operator.report.verify reportKind=selection",
      "content_items.list",
    ],
    currentCoverage: coverage
      ? {
          missingFamilies: coverage.missingFamilies,
          retainedWorkingNoisyChannels: coverage.retainedWorkingNoisyChannels,
          retainedWorkingLowYieldChannels: coverage.retainedWorkingLowYieldChannels,
          technicalRepairChannels: coverage.technicalRepairChannels,
          risks: coverage.risks,
        }
      : null,
  };
}

export function buildCoverageFirstIterationRecommendation(input: {
  objective?: string;
  coverage: SourceFamilyCoverage;
}): Record<string, unknown> {
  const technical = input.coverage.recommendations.find((entry) => entry.action === "repair_or_map_technical_bottlenecks");
  const expansion = input.coverage.recommendations.find((entry) => entry.action === "expand_source_family");
  const retain = input.coverage.recommendations.find((entry) => entry.action === "retain_and_measure");
  const nextAction = technical ?? expansion ?? retain ?? {
    action: "measure_selection_and_hold_quality",
    reason: "Coverage is represented; continue quality measurement and bounded replay from item-level evidence.",
    autoDisablesSources: false,
  };
  return {
    objective: normalizeString(input.objective) || "coverage-first rare-signal funnel",
    nextAction,
    decisionPolicy: {
      autoDisableWorkingNoisySources: false,
      autoDisableLowYieldSources: false,
      autoDisableNegativeControls: false,
      disableRequiresOperatorAction: true,
    },
    boundedMcpActions:
      nextAction.action === "repair_or_map_technical_bottlenecks"
        ? [
            "channels.bottlenecks.list",
            "channels.alternatives.plan",
            "channels.bulk_onboard.plan/apply/verify for validated alternatives only",
          ]
        : nextAction.action === "expand_source_family"
          ? [
              "discovery.mega_loop.preview",
              "discovery.candidates.create",
              "discovery.probe.execute",
              "discovery.route.preview",
              "channels.bulk_onboard.plan/apply/verify",
            ]
          : [
              "operator.selection.precision_audit",
              "articles.holds.summary/list/explain",
              "maintenance.reindex.request bounded docIds only when justified",
            ],
    nextReadBack: input.coverage.nextReadBack,
  };
}
