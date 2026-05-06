import type { Pool } from "pg";

import { readOptionalInteger, readOptionalString } from "./protocol";
import type { McpToolContext } from "./tools/shared";

export const OPERATING_DOMAIN_VALUES = [
  "channels",
  "website_pipeline",
  "selection",
  "content_analysis",
  "llm_budget",
  "discovery",
  "sequences",
  "cleanup",
] as const;

export type OperatingDomain = (typeof OPERATING_DOMAIN_VALUES)[number];

export const OPERATING_REPORT_KINDS = [
  "system_health",
  "channel_health",
  "website_pipeline",
  "selection_tuning",
  "content_analysis",
  "llm_budget",
  "sequence_run",
  "discovery_yield",
] as const;

export const OPERATIONAL_RESOURCE_URIS = [
  "newsportal://ops/health",
  "newsportal://ops/issues",
  "newsportal://ops/tuning-backlog",
  "newsportal://ops/recent-changes",
] as const;

type IssueSeverity = "info" | "warning" | "critical";

interface OperatingDomainGuide {
  domain: OperatingDomain;
  title: string;
  lifecycle: readonly string[];
  keyMetrics: readonly string[];
  normalStates: readonly string[];
  commonSymptoms: readonly string[];
  commonCauses: readonly string[];
  tuningLevers: readonly string[];
  readBackChecks: readonly string[];
}

export const OPERATING_DOMAIN_REGISTRY: Readonly<Record<OperatingDomain, OperatingDomainGuide>> = {
  channels: {
    domain: "channels",
    title: "Source Channels",
    lifecycle: ["configured", "scheduled", "fetched", "persisted", "verified", "tuned"],
    keyMetrics: ["active channel count", "fetch outcomes", "new articles/resources", "last success/error"],
    normalStates: [
      "Active RSS/API/email channels usually produce articles directly.",
      "Website channels may produce resource-only rows before downstream projection/selection succeeds.",
    ],
    commonSymptoms: ["fetch failures", "duplicate-heavy fetches", "active channel with no recent runs"],
    commonCauses: ["bad URL", "provider rate limit", "site blocks crawler", "poll interval too aggressive"],
    tuningLevers: ["fetchUrl/homepageUrl", "pollIntervalSeconds", "provider-specific config", "active flag"],
    readBackChecks: ["channels.read", "fetch_runs.list", "web_resources.list"],
  },
  website_pipeline: {
    domain: "website_pipeline",
    title: "Website Resource Pipeline",
    lifecycle: ["fetch", "resource extraction", "enrichment", "common-pipeline projection", "final selection"],
    keyMetrics: ["web resource count", "extraction state", "projection state", "projected article decision"],
    normalStates: [
      "resource_only is valid for listings/documents that should stay in resources.",
      "projected_to_common_pipeline plus final_decision=rejected means acquisition worked and downstream selection rejected it.",
    ],
    commonSymptoms: [
      "resources exist but no selected articles",
      "many explicitly_rejected_before_pipeline rows",
      "projected articles all rejected",
    ],
    commonCauses: [
      "resource kind is listing/document",
      "content filter or selection profile rejects the article",
      "website discovery settings are too broad",
      "browser fallback is needed for heavy JS sites",
    ],
    tuningLevers: ["website discovery settings", "content filter policy", "system interests", "selection profile"],
    readBackChecks: ["web_resources.list", "articles.explain", "content_filter_results.list"],
  },
  selection: {
    domain: "selection",
    title: "Final Selection",
    lifecycle: ["article observation", "interest/filter evaluation", "LLM review when configured", "final decision"],
    keyMetrics: ["selected/rejected/gray_zone counts", "residual buckets", "verification state"],
    normalStates: [
      "final_decision=rejected can be correct automation behavior.",
      "gray_zone/hold is expected when profile policy says uncertain items need operator review.",
    ],
    commonSymptoms: ["useful article rejected", "LLM approved but item held", "too many gray_zone rows"],
    commonCauses: [
      "profile hold policy",
      "weak verification",
      "negative signal match",
      "content filter policy in hold/enforce mode",
    ],
    tuningLevers: ["system interest definition", "LLM template", "content filter policy", "selection profile strictness"],
    readBackChecks: ["articles.residuals.summary", "articles.explain", "content_items.explain"],
  },
  content_analysis: {
    domain: "content_analysis",
    title: "Content Analysis and Gating",
    lifecycle: ["policy", "analysis result", "labels/entities", "filter result", "selection consumption"],
    keyMetrics: ["analysis status", "filter decisions", "policy mode", "failure policy"],
    normalStates: [
      "observe and dry_run policies record evidence without blocking content.",
      "hold/enforce policies can intentionally stop or hold content.",
    ],
    commonSymptoms: ["failed analysis", "unexpected hold/reject", "missing labels/entities"],
    commonCauses: ["disabled policy", "unsupported provider/model", "policy mode changed", "rule too broad"],
    tuningLevers: ["policy mode", "policy config", "failure policy", "content filter rules"],
    readBackChecks: ["content_analysis.list", "content_filter_results.list", "content_filter_policies.read"],
  },
  llm_budget: {
    domain: "llm_budget",
    title: "LLM Budget",
    lifecycle: ["budget configured", "review requested", "review logged", "cost summarized", "escalation tuned"],
    keyMetrics: ["budget remaining", "review count", "estimated cost", "review outcomes"],
    normalStates: [
      "Cheap hold can be correct when escalation is disabled or signal is weak.",
      "Low review count may be normal if deterministic filters decide most items.",
    ],
    commonSymptoms: ["reviews stopped", "too many expensive reviews", "gray_zone held after review"],
    commonCauses: ["budget exhausted", "review mode always", "weak verification", "template too broad"],
    tuningLevers: ["LLM review mode", "review thresholds", "template scope", "budget ceiling"],
    readBackChecks: ["llm_budget.summary", "articles.explain", "operator.report.verify"],
  },
  discovery: {
    domain: "discovery",
    title: "Discovery",
    lifecycle: ["profile", "mission", "graph compile", "run/acquire", "candidate review", "promotion"],
    keyMetrics: ["active profiles/missions", "candidate statuses", "promotion readiness", "run status/cost"],
    normalStates: [
      "Default operation is guarded automation: profile-backed missions can use configured thresholds, while manual review is fallback unless explicitly requested.",
      "Rejected recall candidates can be correct when probes show captcha/login/unsupported kind.",
      "Promotable candidates should still be verified before channel creation.",
    ],
    commonSymptoms: ["low yield", "unsupported website kind", "candidate promotion blocked"],
    commonCauses: ["profile too narrow", "site requires browser/login", "seed domains are marketplaces/blogs", "budget too low"],
    tuningLevers: ["preferred domains", "positive/negative keywords", "supported website kinds", "recall thresholds"],
    readBackChecks: ["discovery.summary.get", "discovery.recall_candidates.list", "operator.report.verify"],
  },
  sequences: {
    domain: "sequences",
    title: "Sequences",
    lifecycle: ["definition", "run", "task runs", "completed/failed/cancelled", "retry/archive"],
    keyMetrics: ["run status", "failed task count", "retry lineage", "protected system sequence count"],
    normalStates: [
      "Migration-owned default/adaptive sequences are system objects.",
      "Retries should reference failed run evidence, not replace diagnosis.",
    ],
    commonSymptoms: ["pending/stuck run", "failed run", "manual run denied for system reindex"],
    commonCauses: ["missing event context", "task plugin failure", "queue worker unavailable", "invalid run payload"],
    tuningLevers: ["task graph", "trigger event", "retry policy", "maintenance request tool"],
    readBackChecks: ["sequences.read", "sequences.runs.read", "sequences.run_task_runs.list"],
  },
  cleanup: {
    domain: "cleanup",
    title: "Cleanup",
    lifecycle: ["inventory", "classify protected/user/test artifacts", "archive", "delete/revoke", "verify"],
    keyMetrics: ["active artifacts", "protected system objects", "active MCP tokens"],
    normalStates: [
      "Audit/protected objects should remain after cleanup.",
      "MCP token lifecycle requires scoped MCP token tools or admin UI, not REST bypass.",
    ],
    commonSymptoms: ["agent tries direct REST/SQL", "system sequences archived", "tokens not revocable through current scope"],
    commonCauses: ["missing tool scope", "no read-only inventory", "client guessed schema or ownership"],
    tuningLevers: ["cleanup prompt", "destructive confirmation", "token scopes", "archive before delete policy"],
    readBackChecks: ["admin.summary.get", "admin.mcp_tokens.list", "operator.report.verify"],
  },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => readOptionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function readDomains(value: unknown): OperatingDomain[] {
  const requested = readStringArray(value).filter((entry): entry is OperatingDomain =>
    (OPERATING_DOMAIN_VALUES as readonly string[]).includes(entry)
  );
  return requested.length > 0 ? requested : [...OPERATING_DOMAIN_VALUES];
}

function readSinceHours(value: unknown, fallback = 24): number {
  const parsed = readOptionalInteger(value);
  if (parsed == null) {
    return fallback;
  }
  return Math.min(Math.max(parsed, 1), 24 * 30);
}

function readEntityIds(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function compactRows(rows: unknown[], includeSamples: boolean, limit = 8): unknown[] {
  return includeSamples ? rows.slice(0, limit) : [];
}

function issue(
  severity: IssueSeverity,
  domain: OperatingDomain,
  title: string,
  evidence: Record<string, unknown>,
  nextSteps: string[]
) {
  return {
    severity,
    domain,
    title,
    evidence,
    nextSteps,
  };
}

async function allSettledRecord<T extends Record<string, Promise<unknown>>>(
  entries: T
): Promise<Record<keyof T, unknown>> {
  const resolved = await Promise.allSettled(Object.values(entries));
  const result: Record<string, unknown> = {};
  Object.keys(entries).forEach((key, index) => {
    const item = resolved[index];
    result[key] =
      item?.status === "fulfilled"
        ? item.value
        : {
            unavailable: true,
            error: item?.reason instanceof Error ? item.reason.message : "request failed",
          };
  });
  return result as Record<keyof T, unknown>;
}

async function countQuery(pool: Pool, sql: string, params: unknown[] = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

export function getOperatingModelGuide() {
  return {
    model: "observe -> diagnose -> recommend -> guarded change -> verify effect -> monitor",
    domains: OPERATING_DOMAIN_REGISTRY,
    operatingRules: [
      "Operational tools are read-only unless their normal MCP tool name already advertises a write scope.",
      "Diagnosis must state source-of-truth evidence and stale-data warnings.",
      "Tuning recommendations can include suggestedToolCalls, but they never execute them.",
      "After writes, clients should read the affected entity plus newsportal://ops/health and newsportal://ops/issues.",
    ],
    fallbackForLimitedClients: {
      notifications:
        "If resources/subscribe is not supported, mutation responses include nextReadBack resources/tools.",
      elicitation:
        "If client-side elicitation is unavailable, operator.tuning.recommend returns tuningChoices and asks the client to choose an objective before writing.",
    },
  };
}

export function getDiagnosticsGuide(domain: string) {
  const guide = OPERATING_DOMAIN_REGISTRY[domain as OperatingDomain];
  return guide
    ? {
        domain,
        guide,
        diagnosticFlow: [
          "Start with operator.system.health scoped to this domain.",
          "Use operator.issue.explain for the concrete symptom.",
          "Inspect the suggested samples with domain list/read/explain tools.",
          "Call operator.tuning.recommend only after the repeated evidence pattern is clear.",
        ],
      }
    : {
        domain,
        knownDomains: OPERATING_DOMAIN_VALUES,
        error: "Unknown operating domain.",
      };
}

export function getTuningGuide(domain: string) {
  const guide = OPERATING_DOMAIN_REGISTRY[domain as OperatingDomain];
  return guide
    ? {
        domain,
        tuningLevers: guide.tuningLevers,
        readBackChecks: guide.readBackChecks,
        safeTuningRules: [
          "Choose one objective per tuning session.",
          "Prefer narrow configuration changes over broad rewrites.",
          "Do not use downstream diagnostics as automatic approval; use them as operator evidence.",
          "Verify effect with operator.effect.verify after applying guarded writes.",
        ],
        objectives: [
          "increase_recall",
          "increase_precision",
          "reduce_cost",
          "debug_source",
          "stabilize_discovery",
        ],
      }
    : {
        domain,
        knownDomains: OPERATING_DOMAIN_VALUES,
        error: "Unknown operating domain.",
      };
}

export async function buildSystemHealth(
  { sdk, pool }: McpToolContext,
  args: Record<string, unknown> = {}
) {
  const domains = readDomains(args.domains);
  const sinceHours = readSinceHours(args.sinceHours, 24);
  const includeSamples = args.includeSamples === true;

  const [
    channels,
    fetchRuns,
    webResources,
    selection,
    selectionStalePassThrough,
    contentAnalysis,
    contentFilters,
    discovery,
    sequences,
    cleanup,
    mcpErrors,
    apiSummaries,
  ] = await Promise.all([
    countQuery(
      pool,
      `
        select provider_type as "providerType", is_active as "isActive", count(*)::int as count
        from source_channels
        group by provider_type, is_active
        order by provider_type, is_active desc
      `
    ),
    countQuery(
      pool,
      `
        select outcome_kind as "outcomeKind", provider_type as "providerType", count(*)::int as count
        from channel_fetch_runs
        where started_at >= now() - ($1::int * interval '1 hour')
        group by outcome_kind, provider_type
        order by provider_type, outcome_kind
      `,
      [sinceHours]
    ),
    countQuery(
      pool,
      `
        select wr.extraction_state as "extractionState",
               wr.projection_state as "projectionState",
               coalesce(fsr.final_decision, 'not_projected') as "finalDecision",
               count(*)::int as count
        from web_resources wr
        left join final_selection_results fsr on fsr.doc_id = wr.projected_article_id
        where wr.updated_at >= now() - ($1::int * interval '1 hour')
        group by wr.extraction_state, wr.projection_state, coalesce(fsr.final_decision, 'not_projected')
        order by wr.extraction_state, wr.projection_state, coalesce(fsr.final_decision, 'not_projected')
      `,
      [sinceHours]
    ),
    countQuery(
      pool,
      `
        select final_decision as "finalDecision", verification_state as "verificationState", count(*)::int as count
        from final_selection_results
        where updated_at >= now() - ($1::int * interval '1 hour')
        group by final_decision, verification_state
        order by final_decision, verification_state
      `,
      [sinceHours]
    ),
    countQuery(
      pool,
      `
        select count(*)::int as "stalePassThroughCount"
        from final_selection_results fsr
        where fsr.updated_at >= now() - ($1::int * interval '1 hour')
          and fsr.total_filter_count = 0
          and (
            fsr.is_selected = true
            or fsr.final_decision = 'selected'
            or fsr.compat_system_feed_decision = 'pass_through'
          )
          and not exists (
            select 1
            from interest_filter_results ifr
            where ifr.doc_id = fsr.doc_id
              and ifr.filter_scope = 'system_criterion'
          )
      `,
      [sinceHours]
    ),
    countQuery(
      pool,
      `
        select analysis_type as "analysisType", status, count(*)::int as count
        from content_analysis_results
        where updated_at >= now() - ($1::int * interval '1 hour')
        group by analysis_type, status
        order by analysis_type, status
      `,
      [sinceHours]
    ),
    countQuery(
      pool,
      `
        select decision, passed, mode, count(*)::int as count
        from content_filter_results
        where updated_at >= now() - ($1::int * interval '1 hour')
        group by decision, passed, mode
        order by decision, mode
      `,
      [sinceHours]
    ),
    countQuery(
      pool,
      `
        select kind, status, count(*)::int as count
        from (
          select 'profile' as kind, status from discovery_policy_profiles
          union all
          select 'mission' as kind, status from discovery_missions
          union all
          select 'recall_mission' as kind, status from discovery_recall_missions
          union all
          select 'recall_candidate' as kind, status from discovery_recall_candidates
        ) state
        group by kind, status
        order by kind, status
      `
    ),
    countQuery(
      pool,
      `
        select status, trigger_type as "triggerType", count(*)::int as count
        from sequence_runs
        where created_at >= now() - ($1::int * interval '1 hour')
        group by status, trigger_type
        order by status, trigger_type
      `,
      [sinceHours]
    ),
    countQuery(
      pool,
      `
        select
          (select count(*)::int from source_channels where is_active = true) as "activeChannels",
          (select count(*)::int from sequences where created_by like 'migration:%' and status in ('draft', 'active')) as "protectedActiveSequences",
          (select count(*)::int from mcp_access_tokens where status = 'active' and (expires_at is null or expires_at > now())) as "activeMcpTokens"
      `
    ),
    countQuery(
      pool,
      `
        select count(*)::int as "errorCount",
               count(*) filter (where error_text ilike '%422%' or error_text ilike '%Unprocessable Entity%')::int as "backend422LikeErrors"
        from mcp_request_log
        where success = false
          and created_at >= now() - ($1::int * interval '1 hour')
      `,
      [sinceHours]
    ),
    allSettledRecord({
      dashboardSummary: sdk.getDashboardSummary<Record<string, unknown>>(),
      discoverySummary: sdk.getDiscoverySummary<Record<string, unknown>>(),
      llmBudgetSummary: sdk.getLlmBudgetSummary<Record<string, unknown>>(),
      residualSummary: sdk.getArticleResidualSummary<Record<string, unknown>>(),
    }),
  ]);

  const issues = buildIssuesFromHealth({
    channels,
    fetchRuns,
    webResources,
    selection,
    selectionStalePassThrough: selectionStalePassThrough[0] ?? {},
    contentAnalysis,
    contentFilters,
    discovery,
    sequences,
    cleanup: cleanup[0] ?? {},
    mcpErrors: mcpErrors[0] ?? {},
  });

  const samples = includeSamples
    ? await collectHealthSamples(pool, sinceHours)
    : {};

  return {
    generatedAt: new Date().toISOString(),
    sinceHours,
    domains,
    sourceOfTruth: [
      "PostgreSQL source_channels/channel_fetch_runs/web_resources/final_selection_results/content_analysis_results/content_filter_results/discovery*/sequence_runs/mcp_request_log",
      "API-backed dashboard/discovery/LLM budget/article residual summaries",
    ],
    health: {
      channels,
      fetchRuns,
      webResources,
      selection,
      selectionStalePassThrough: selectionStalePassThrough[0] ?? {},
      contentAnalysis,
      contentFilters,
      discovery,
      sequences,
      cleanup: cleanup[0] ?? {},
      mcpErrors: mcpErrors[0] ?? {},
      apiSummaries,
    },
    issues: issues.filter((entry) => domains.includes(entry.domain)),
    samples,
    nextReadBack: [
      "newsportal://ops/health",
      "newsportal://ops/issues",
      "operator.report.verify",
    ],
  };
}

function buildIssuesFromHealth(input: Record<string, unknown>) {
  const fetchRows = Array.isArray(input.fetchRuns) ? input.fetchRuns as Record<string, unknown>[] : [];
  const webRows = Array.isArray(input.webResources) ? input.webResources as Record<string, unknown>[] : [];
  const selectionRows = Array.isArray(input.selection) ? input.selection as Record<string, unknown>[] : [];
  const selectionStalePassThrough = isRecord(input.selectionStalePassThrough)
    ? input.selectionStalePassThrough
    : {};
  const analysisRows =
    Array.isArray(input.contentAnalysis) ? input.contentAnalysis as Record<string, unknown>[] : [];
  const filterRows =
    Array.isArray(input.contentFilters) ? input.contentFilters as Record<string, unknown>[] : [];
  const sequenceRows = Array.isArray(input.sequences) ? input.sequences as Record<string, unknown>[] : [];
  const discoveryRows = Array.isArray(input.discovery) ? input.discovery as Record<string, unknown>[] : [];
  const cleanup = isRecord(input.cleanup) ? input.cleanup : {};
  const mcpErrors = isRecord(input.mcpErrors) ? input.mcpErrors : {};
  const issues = [];

  const failedFetches = fetchRows
    .filter((row) => ["hard_failure", "transient_failure", "rate_limited"].includes(String(row.outcomeKind)))
    .reduce((sum, row) => sum + Number(row.count ?? 0), 0);
  if (failedFetches > 0) {
    issues.push(
      issue("warning", "channels", "Recent fetch failures or rate limits exist.", { failedFetches }, [
        "Inspect fetch_runs.list for affected channels.",
        "Check provider URL, auth/rate limits, and poll interval before tuning downstream selection.",
      ])
    );
  }

  const projectedRejected = webRows
    .filter((row) => row.projectionState === "projected_to_common_pipeline" && row.finalDecision === "rejected")
    .reduce((sum, row) => sum + Number(row.count ?? 0), 0);
  if (projectedRejected > 0) {
    issues.push(
      issue(
        "info",
        "website_pipeline",
        "Website resources projected into the common pipeline but were rejected downstream.",
        { projectedRejected },
        [
          "Treat this as selection/filter evidence, not channel creation failure.",
          "Inspect articles.explain and content_filter_results.list for projected article IDs.",
        ]
      )
    );
  }

  const grayZone = selectionRows
    .filter((row) => row.finalDecision === "gray_zone")
    .reduce((sum, row) => sum + Number(row.count ?? 0), 0);
  const stalePassThroughCount = Number(selectionStalePassThrough.stalePassThroughCount ?? 0);
  if (stalePassThroughCount > 0) {
    issues.push(
      issue(
        "warning",
        "selection",
        "Stale selected/pass_through rows lack system-criterion interest_filter_results.",
        { stalePassThroughCount },
        [
          "Likely cause: selection backfill needed after interest/template/criteria changes.",
          "Queue maintenance.reindex.request with payload.indexName=interest_centroids and payload.jobKind=backfill.",
          "After completion, verify with maintenance.reindex_jobs.list and operator.report.verify reportKind=selection.",
        ]
      )
    );
  }
  if (grayZone > 0) {
    issues.push(
      issue("info", "selection", "Gray-zone selections are being held by policy.", { grayZone }, [
        "Use articles.residuals.summary and articles.explain before changing review policy.",
        "Tune one interest/template/profile at a time if this is too conservative.",
      ])
    );
  }

  const failedAnalysis = analysisRows
    .filter((row) => row.status === "failed")
    .reduce((sum, row) => sum + Number(row.count ?? 0), 0);
  const blockingFilters = filterRows
    .filter((row) => row.passed === false || ["reject", "hold", "needs_review"].includes(String(row.decision)))
    .reduce((sum, row) => sum + Number(row.count ?? 0), 0);
  if (failedAnalysis > 0 || blockingFilters > 0) {
    issues.push(
      issue("warning", "content_analysis", "Content analysis/filtering has failed or blocking decisions.", {
        failedAnalysis,
        blockingFilters,
      }, [
        "Read content_analysis.list and content_filter_results.list by subject/channel.",
        "Check policy mode before loosening selection interests.",
      ])
    );
  }

  const failedRuns = sequenceRows
    .filter((row) => row.status === "failed")
    .reduce((sum, row) => sum + Number(row.count ?? 0), 0);
  if (failedRuns > 0) {
    issues.push(
      issue("warning", "sequences", "Recent sequence runs failed.", { failedRuns }, [
        "Read sequences.runs.read and sequences.run_task_runs.list for failed run IDs.",
        "Retry only after the failed task and context are understood.",
      ])
    );
  }

  const weakDiscovery = discoveryRows
    .filter((row) => row.kind === "recall_candidate" && ["rejected", "duplicate"].includes(String(row.status)))
    .reduce((sum, row) => sum + Number(row.count ?? 0), 0);
  if (weakDiscovery > 0) {
    issues.push(
      issue("info", "discovery", "Discovery has rejected or duplicate recall candidates.", { weakDiscovery }, [
        "Review rejected reasons before changing profile thresholds.",
        "Rejected candidates may be correct for captcha/login/unsupported kind cases.",
      ])
    );
  }

  if (Number(cleanup.activeChannels ?? 0) === 0) {
    issues.push(
      issue("info", "cleanup", "System currently has zero active channels.", cleanup, [
        "This is expected only after intentional cleanup.",
        "Before product testing, create channels or run an example setup.",
      ])
    );
  }

  if (Number(mcpErrors.backend422LikeErrors ?? 0) > 0) {
    issues.push(
      issue("critical", "cleanup", "Recent MCP requests still produced backend 422-like errors.", mcpErrors, [
        "Add or tighten MCP boundary validation for the failing tool.",
        "Regression proof should assert MCP -32602 instead of backend 422.",
      ])
    );
  }

  return issues;
}

async function collectHealthSamples(pool: Pool, sinceHours: number) {
  const [
    failedFetchRuns,
    rejectedWebsiteResources,
    grayZoneSelections,
    stalePassThroughSelections,
    failedSequences,
    mcpErrors,
  ] =
    await Promise.all([
      countQuery(
        pool,
        `
          select fetch_run_id::text as "fetchRunId", channel_id::text as "channelId",
                 provider_type as "providerType", outcome_kind as "outcomeKind",
                 error_text as "errorText", started_at as "startedAt"
          from channel_fetch_runs
          where started_at >= now() - ($1::int * interval '1 hour')
            and outcome_kind in ('hard_failure', 'transient_failure', 'rate_limited')
          order by started_at desc
          limit 8
        `,
        [sinceHours]
      ),
      countQuery(
        pool,
        `
          select wr.resource_id::text as "resourceId", wr.channel_id::text as "channelId",
                 wr.title, wr.url, wr.projection_state as "projectionState",
                 wr.projected_article_id::text as "projectedArticleId",
                 fsr.final_decision as "finalDecision"
          from web_resources wr
          join final_selection_results fsr on fsr.doc_id = wr.projected_article_id
          where wr.updated_at >= now() - ($1::int * interval '1 hour')
            and fsr.final_decision = 'rejected'
          order by wr.updated_at desc
          limit 8
        `,
        [sinceHours]
      ),
      countQuery(
        pool,
        `
          select doc_id::text as "docId", verification_state as "verificationState",
                 matched_filter_count as "matchedFilterCount",
                 gray_zone_filter_count as "grayZoneFilterCount",
                 updated_at as "updatedAt"
          from final_selection_results
          where updated_at >= now() - ($1::int * interval '1 hour')
            and final_decision = 'gray_zone'
          order by updated_at desc
          limit 8
        `,
        [sinceHours]
      ),
      countQuery(
        pool,
        `
          select fsr.doc_id::text as "docId",
                 fsr.final_decision as "finalDecision",
                 fsr.compat_system_feed_decision as "compatSystemFeedDecision",
                 fsr.total_filter_count as "totalFilterCount",
                 fsr.updated_at as "updatedAt"
          from final_selection_results fsr
          where fsr.updated_at >= now() - ($1::int * interval '1 hour')
            and fsr.total_filter_count = 0
            and (
              fsr.is_selected = true
              or fsr.final_decision = 'selected'
              or fsr.compat_system_feed_decision = 'pass_through'
            )
            and not exists (
              select 1
              from interest_filter_results ifr
              where ifr.doc_id = fsr.doc_id
                and ifr.filter_scope = 'system_criterion'
            )
          order by fsr.updated_at desc
          limit 8
        `,
        [sinceHours]
      ),
      countQuery(
        pool,
        `
          select run_id::text as "runId", sequence_id::text as "sequenceId",
                 status, trigger_type as "triggerType", created_at as "updatedAt"
          from sequence_runs
          where created_at >= now() - ($1::int * interval '1 hour')
            and status = 'failed'
          order by created_at desc
          limit 8
        `,
        [sinceHours]
      ),
      countQuery(
        pool,
        `
          select request_log_id::text as "requestLogId", request_method as "requestMethod",
                 tool_name as "toolName", error_text as "errorText", created_at as "createdAt"
          from mcp_request_log
          where success = false
            and created_at >= now() - ($1::int * interval '1 hour')
          order by created_at desc
          limit 8
        `,
        [sinceHours]
      ),
    ]);
  return {
    failedFetchRuns,
    rejectedWebsiteResources,
    grayZoneSelections,
    stalePassThroughSelections,
    failedSequences,
    mcpErrors,
  };
}

export async function explainOperatorIssue(context: McpToolContext, args: Record<string, unknown>) {
  const symptom = readOptionalString(args.symptom) ?? "general operational issue";
  const domain = (readOptionalString(args.domain) ?? inferDomainFromSymptom(symptom)) as OperatingDomain;
  const sinceHours = readSinceHours(args.sinceHours, 24);
  const includeSamples = args.includeSamples === true;
  const entityIds = readEntityIds(args.entityIds);
  const guide = OPERATING_DOMAIN_REGISTRY[domain];
  const health = await buildSystemHealth(context, {
    domains: [domain],
    sinceHours,
    includeSamples,
  });
  const selectionStalePassThrough =
    isRecord(health.health) && isRecord(health.health.selectionStalePassThrough)
      ? health.health.selectionStalePassThrough
      : {};
  const stalePassThroughCount = Number(selectionStalePassThrough.stalePassThroughCount ?? 0);
  const likelyCauses =
    domain === "selection" && stalePassThroughCount > 0 && guide
      ? [
          "selection backfill needed: selected/pass_through rows exist with total_filter_count=0 and no system_criterion interest_filter_results",
          ...guide.commonCauses,
        ]
      : guide?.commonCauses;

  return {
    generatedAt: new Date().toISOString(),
    symptom,
    domain,
    sourceOfTruth: health.sourceOfTruth,
    diagnosis: guide
      ? {
          lifecycle: guide.lifecycle,
          likelyCauses,
          normalStatesToCheck: guide.normalStates,
          readBackChecks: guide.readBackChecks,
        }
      : {
          unknownDomain: domain,
          knownDomains: OPERATING_DOMAIN_VALUES,
        },
    evidence: {
      entityIds,
      health: health.health,
      issues: health.issues,
      samples: compactRows(Object.values(health.samples ?? {}), includeSamples),
    },
    staleDataWarnings: [
      `Evidence is scoped to the last ${sinceHours} hours unless entityIds force a narrower read.`,
      "If async workers are still running, repeat the same read after the run finishes.",
      ...(domain === "selection" && stalePassThroughCount > 0
        ? [
            "Selection backfill is likely needed before trusting selected/pass_through counts after interest/template/criteria changes.",
          ]
        : []),
    ],
    nextSteps:
      domain === "selection" && stalePassThroughCount > 0
        ? [
            "maintenance.reindex.request payload={indexName: interest_centroids, jobKind: backfill}",
            "maintenance.reindex_jobs.list until completed/failed",
            "operator.report.verify reportKind=selection after completion",
          ]
        : guide?.readBackChecks ?? ["operator.system.health"],
  };
}

function inferDomainFromSymptom(symptom: string): OperatingDomain {
  const normalized = symptom.toLowerCase();
  if (normalized.includes("website") || normalized.includes("resource") || normalized.includes("project")) {
    return "website_pipeline";
  }
  if (normalized.includes("llm") || normalized.includes("budget") || normalized.includes("gray")) {
    return "llm_budget";
  }
  if (normalized.includes("discover") || normalized.includes("candidate") || normalized.includes("recall")) {
    return "discovery";
  }
  if (normalized.includes("sequence") || normalized.includes("run")) {
    return "sequences";
  }
  if (normalized.includes("filter") || normalized.includes("analysis") || normalized.includes("label")) {
    return "content_analysis";
  }
  if (normalized.includes("cleanup") || normalized.includes("token")) {
    return "cleanup";
  }
  if (normalized.includes("channel") || normalized.includes("fetch")) {
    return "channels";
  }
  return "selection";
}

export async function recommendOperatorTuning(
  context: McpToolContext,
  args: Record<string, unknown>
) {
  const domain = (readOptionalString(args.domain) ?? "selection") as OperatingDomain;
  const objective = readOptionalString(args.objective) ?? "increase_precision";
  const residualBucket = readOptionalString(args.residualBucket);
  const sinceHours = readSinceHours(args.sinceHours, 24);
  const entityIds = readEntityIds(args.entityIds);
  const guide = OPERATING_DOMAIN_REGISTRY[domain];
  const issueExplanation = await explainOperatorIssue(context, {
    symptom: residualBucket ?? objective,
    domain,
    entityIds,
    sinceHours,
    includeSamples: args.includeSamples === true,
  });

  const recommendations = buildTuningRecommendations(domain, objective, residualBucket);
  return {
    generatedAt: new Date().toISOString(),
    domain,
    objective,
    residualBucket,
    diagnosis: issueExplanation.diagnosis,
    evidence: issueExplanation.evidence,
    tuningChoices: [
      "increase_recall",
      "increase_precision",
      "reduce_cost",
      "debug_source",
      "stabilize_discovery",
    ],
    recommendedChanges: recommendations.recommendedChanges,
    riskLevel: recommendations.riskLevel,
    expectedEffect: recommendations.expectedEffect,
    verificationPlan: [
      ...(guide?.readBackChecks ?? []),
      "operator.effect.verify",
      "newsportal://ops/health",
      "newsportal://ops/issues",
    ],
    suggestedToolCalls: recommendations.suggestedToolCalls,
    mutationPolicy:
      "This tool is advisory and read-only. Apply changes only through the suggested guarded MCP write tools after an operator chooses the objective.",
  };
}

function buildTuningRecommendations(
  domain: OperatingDomain,
  objective: string,
  residualBucket: string | null
) {
  const base = {
    riskLevel: "medium",
    expectedEffect: "Bounded configuration change with measurable read-back evidence.",
    recommendedChanges: [] as Array<Record<string, unknown>>,
    suggestedToolCalls: [] as Array<Record<string, unknown>>,
  };
  if (domain === "website_pipeline" || objective === "debug_source") {
    base.riskLevel = "low";
    base.expectedEffect =
      "Clarify whether the issue is source acquisition, resource projection, or downstream selection before changing policy.";
    base.recommendedChanges.push({
      target: "website channel/resource settings",
      action: "Inspect fetch runs and resources first; tune website discovery settings only for repeated extraction/projection failures.",
      reason: residualBucket ?? "website resources need source-of-truth diagnosis",
    });
    base.suggestedToolCalls.push(
      { toolName: "fetch_runs.list", argumentsTemplate: { channelId: "<channelId>" } },
      { toolName: "web_resources.list", argumentsTemplate: { channelId: "<channelId>", projection: "all" } }
    );
    return base;
  }
  if (domain === "llm_budget" || objective === "reduce_cost") {
    base.riskLevel = "medium";
    base.expectedEffect = "Reduce unnecessary LLM escalation while preserving deterministic selection evidence.";
    base.recommendedChanges.push({
      target: "LLM review/template policy",
      action: "Narrow review mode or template scope for repeated low-value gray-zone items.",
      reason: residualBucket ?? "cost or hold pressure",
    });
    base.suggestedToolCalls.push(
      { toolName: "llm_budget.summary", argumentsTemplate: {} },
      { toolName: "llm_templates.update", argumentsTemplate: { promptTemplateId: "<templateId>", payload: {} } }
    );
    return base;
  }
  if (domain === "discovery" || objective === "stabilize_discovery") {
    base.riskLevel = "medium";
    base.expectedEffect = "Improve candidate yield without forcing weak or unsupported promotions.";
    base.recommendedChanges.push({
      target: "discovery profile/recall policy",
      action: "Adjust preferred domains, positive/negative keywords, or supported website kinds from rejected-candidate evidence.",
      reason: residualBucket ?? "discovery yield needs tuning",
    });
    base.suggestedToolCalls.push(
      { toolName: "discovery.recall_candidates.list", argumentsTemplate: { status: "rejected" } },
      { toolName: "discovery.profiles.update", argumentsTemplate: { profileId: "<profileId>", payload: {} } }
    );
    return base;
  }
  if (domain === "content_analysis") {
    base.riskLevel = "medium";
    base.expectedEffect = "Move only the policy/rule causing repeated hold/reject evidence.";
    base.recommendedChanges.push({
      target: "content analysis/filter policy",
      action: "Inspect failed or blocking filter results, then adjust one policy version.",
      reason: residualBucket ?? "content gating evidence",
    });
    base.suggestedToolCalls.push(
      { toolName: "content_filter_results.list", argumentsTemplate: { decision: "hold" } },
      { toolName: "content_filter_policies.update", argumentsTemplate: { filterPolicyId: "<policyId>", payload: {} } }
    );
    return base;
  }
  if (objective === "increase_recall") {
    base.expectedEffect = "Let more borderline items reach review/selection while monitoring false positives.";
    base.recommendedChanges.push({
      target: "system interest/profile",
      action: "Broaden positive signals or lower strictness for a repeated under-selection pattern.",
      reason: residualBucket ?? "recall objective",
    });
  } else {
    base.expectedEffect = "Reject or hold more weak matches while monitoring missed valuable items.";
    base.recommendedChanges.push({
      target: "system interest/profile/filter",
      action: "Add negative signals or tighten policy for a repeated noisy pattern.",
      reason: residualBucket ?? "precision objective",
    });
  }
  base.suggestedToolCalls.push(
    { toolName: "articles.residuals.summary", argumentsTemplate: { downstreamLossBucket: residualBucket ?? undefined } },
    { toolName: "system_interests.update", argumentsTemplate: { interestTemplateId: "<interestId>", payload: {} } }
  );
  return base;
}

export async function verifyOperatorEffect(
  { pool }: McpToolContext,
  args: Record<string, unknown>
) {
  const domain = (readOptionalString(args.domain) ?? "selection") as OperatingDomain;
  const baselineWindowHours = readSinceHours(args.baselineWindowHours, 24);
  const comparisonWindowHours = readSinceHours(args.comparisonWindowHours, 24);
  const changeRef = readOptionalString(args.changeRef) ?? "unspecified change";
  const includeSamples = args.includeSamples === true;

  const query = effectQueryForDomain(domain);
  const [baseline, comparison] = await Promise.all([
    countQuery(pool, query.sql, [baselineWindowHours + comparisonWindowHours, comparisonWindowHours]),
    countQuery(pool, query.sql, [comparisonWindowHours, 0]),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    domain,
    changeRef,
    windows: {
      baseline: `${baselineWindowHours}h before the most recent ${comparisonWindowHours}h`,
      comparison: `last ${comparisonWindowHours}h`,
    },
    metric: query.metric,
    baseline,
    comparison,
    interpretation: [
      "This is a deterministic before/after read-back, not causal proof by itself.",
      "If workers or fetchers are still processing, repeat after async state settles.",
    ],
    samples: includeSamples ? { baseline, comparison } : {},
  };
}

function effectQueryForDomain(domain: OperatingDomain) {
  if (domain === "channels") {
    return {
      metric: "channel_fetch_runs by outcome/provider",
      sql: `
        select outcome_kind as "outcomeKind", provider_type as "providerType", count(*)::int as count
        from channel_fetch_runs
        where started_at >= now() - ($1::int * interval '1 hour')
          and started_at < now() - ($2::int * interval '1 hour')
        group by outcome_kind, provider_type
        order by provider_type, outcome_kind
      `,
    };
  }
  if (domain === "website_pipeline") {
    return {
      metric: "web_resources by projection/final decision",
      sql: `
        select wr.projection_state as "projectionState",
               coalesce(fsr.final_decision, 'not_projected') as "finalDecision",
               count(*)::int as count
        from web_resources wr
        left join final_selection_results fsr on fsr.doc_id = wr.projected_article_id
        where wr.updated_at >= now() - ($1::int * interval '1 hour')
          and wr.updated_at < now() - ($2::int * interval '1 hour')
        group by wr.projection_state, coalesce(fsr.final_decision, 'not_projected')
        order by wr.projection_state, coalesce(fsr.final_decision, 'not_projected')
      `,
    };
  }
  if (domain === "content_analysis") {
    return {
      metric: "content filter decisions",
      sql: `
        select decision, passed, mode, count(*)::int as count
        from content_filter_results
        where created_at >= now() - ($1::int * interval '1 hour')
          and created_at < now() - ($2::int * interval '1 hour')
        group by decision, passed, mode
        order by decision, mode
      `,
    };
  }
  if (domain === "discovery") {
    return {
      metric: "recall candidate statuses",
      sql: `
        select provider_type as "providerType", status, count(*)::int as count
        from discovery_recall_candidates
        where created_at >= now() - ($1::int * interval '1 hour')
          and created_at < now() - ($2::int * interval '1 hour')
        group by provider_type, status
        order by provider_type, status
      `,
    };
  }
  if (domain === "sequences") {
    return {
      metric: "sequence run statuses",
      sql: `
        select status, trigger_type as "triggerType", count(*)::int as count
        from sequence_runs
        where updated_at >= now() - ($1::int * interval '1 hour')
          and updated_at < now() - ($2::int * interval '1 hour')
        group by status, trigger_type
        order by status, trigger_type
      `,
    };
  }
  return {
    metric: "final selection decisions",
    sql: `
      select final_decision as "finalDecision", verification_state as "verificationState", count(*)::int as count
      from final_selection_results
      where updated_at >= now() - ($1::int * interval '1 hour')
        and updated_at < now() - ($2::int * interval '1 hour')
      group by final_decision, verification_state
      order by final_decision, verification_state
    `,
  };
}

export async function buildOperationalReportVerification(
  context: McpToolContext,
  reportKind: string,
  entityIds: Record<string, unknown>,
  includeSamples: boolean
) {
  const domainByKind: Record<string, OperatingDomain> = {
    system_health: "selection",
    channel_health: "channels",
    website_pipeline: "website_pipeline",
    selection_tuning: "selection",
    content_analysis: "content_analysis",
    llm_budget: "llm_budget",
    sequence_run: "sequences",
    discovery_yield: "discovery",
  };
  const domain = domainByKind[reportKind] ?? "selection";
  const health = await buildSystemHealth(context, {
    domains: reportKind === "system_health" ? OPERATING_DOMAIN_VALUES : [domain],
    includeSamples,
  });
  return {
    reportKind,
    verifiedAt: new Date().toISOString(),
    entityIds,
    domain,
    counts: health.health,
    warnings: health.issues,
    staleReportNotes: [
      "This verification is read-only and DB/API-backed.",
      "Repeat after async workers finish if the report covers an in-flight run.",
    ],
    nextReadBack: [
      "operator.system.health",
      "operator.issue.explain",
      "operator.effect.verify",
    ],
  };
}

export async function buildOpsIssuesResource(context: McpToolContext) {
  const health = await buildSystemHealth(context, { sinceHours: 24, includeSamples: true });
  return {
    generatedAt: health.generatedAt,
    issues: health.issues,
    sampleEvidence: health.samples,
    nextSteps: [
      "Use operator.issue.explain for the most relevant issue.",
      "Use operator.tuning.recommend only after repeated evidence is visible.",
    ],
  };
}

export async function buildOpsTuningBacklogResource(context: McpToolContext) {
  const health = await buildSystemHealth(context, { sinceHours: 24, includeSamples: false });
  return {
    generatedAt: health.generatedAt,
    candidates: health.issues.map((entry: Record<string, unknown>) => ({
      domain: entry.domain,
      symptom: entry.title,
      severity: entry.severity,
      recommendedTool: "operator.tuning.recommend",
      objectiveChoices: [
        "increase_recall",
        "increase_precision",
        "reduce_cost",
        "debug_source",
        "stabilize_discovery",
      ],
    })),
    mutationPolicy: "Backlog entries are advisory. They never apply settings by themselves.",
  };
}

export async function buildOpsRecentChangesResource({ pool }: McpToolContext) {
  const rows = await countQuery(
    pool,
    `
      select request_log_id::text as "requestLogId", request_method as "requestMethod",
             tool_name as "toolName", resource_uri as "resourceUri", prompt_name as "promptName",
             success, error_text as "errorText", created_at as "createdAt"
      from mcp_request_log
      where created_at >= now() - interval '24 hours'
      order by created_at desc
      limit 50
    `
  );
  return {
    generatedAt: new Date().toISOString(),
    sourceOfTruth: "mcp_request_log",
    recentMcpRequests: rows,
    note:
      "This is MCP-visible recent activity, not a full audit-log replacement for every admin/API path.",
  };
}

export function affectedOperationalResourcesForTool(toolName: string): string[] {
  if (toolName.startsWith("operator.") || toolName.endsWith(".list") || toolName.endsWith(".read")) {
    return [];
  }
  return [...OPERATIONAL_RESOURCE_URIS, "newsportal://admin/summary"];
}

export function nextReadBackForTool(toolName: string): Record<string, unknown> {
  if (toolName === "discovery.missions.run") {
    return {
      nextReadBack: {
        resources: [...OPERATIONAL_RESOURCE_URIS, "newsportal://admin/summary"],
        tools: [
          {
            name: "operator.report.verify",
            arguments: {
              reportKind: "discovery_run",
              entityIds: { missionIds: ["<missionId>"], runIds: ["<runId-from-response>"] },
              includeSamples: true,
            },
            verify:
              "Treat discovery.missions.run as a run request. Poll until the sequence run is completed or failed; inspect task runs, hypothesis status counts, and candidate status counts before reporting outcomes.",
          },
          {
            name: "discovery.candidates.list",
            arguments: { page: 1, pageSize: 20 },
            verify:
              "Use candidates as noisy evidence for review/promotion; rejected or low-score candidates are not a successful source discovery outcome.",
          },
        ],
        note:
          "Discovery runs are asynchronous and may execute child search/probe sequences. Do not report completed discovery from the mutation response alone. NewsPortal is guarded-automation-first: if the operator did not ask for manual approval, prefer profile-backed graph/recall missions and configured thresholds. If the graph or recall mission has no profileId/applied policy, candidates are manual-review-only fallback and auto-promotion/recallPolicy thresholds should not be reported as configured.",
      },
    };
  }
  if (toolName === "maintenance.reindex.request") {
    return {
      nextReadBack: {
        resources: [...OPERATIONAL_RESOURCE_URIS, "newsportal://admin/summary"],
        tools: [
          {
            name: "maintenance.reindex_jobs.list",
            arguments: { page: 1, pageSize: 20 },
            verify: "Wait until the target job reaches completed or failed; inspect status, job_kind, index_name, and options_json.",
          },
          {
            name: "operator.report.verify",
            arguments: { reportKind: "selection", entityIds: {}, includeSamples: true },
            verify: "Run after the backfill job completes when reporting selected/pass_through or current-interest selection state.",
          },
        ],
        note:
          "Do not report reindex success from the mutation response alone; wait for completed/failed job evidence.",
      },
    };
  }
  if (toolName === "content_analysis.backfill.request") {
    return {
      nextReadBack: {
        resources: [...OPERATIONAL_RESOURCE_URIS, "newsportal://admin/summary"],
        tools: [
          {
            name: "maintenance.reindex_jobs.list",
            arguments: { page: 1, pageSize: 20 },
            verify: "Confirm the content_analysis job reaches completed or failed.",
          },
          {
            name: "operator.report.verify",
            arguments: { reportKind: "content_analysis", entityIds: {}, includeSamples: true },
            verify: "Use content-analysis report verification for labels/filter evidence, not final selection replay.",
          },
        ],
        note:
          "Content-analysis backfill does not recompute article.match_criteria, interest_filter_results, or final_selection_results.",
      },
    };
  }
  if (toolName === "channels.set_active") {
    return {
      nextReadBack: {
        resources: [...OPERATIONAL_RESOURCE_URIS, "newsportal://admin/summary"],
        tools: [
          {
            name: "channels.read",
            arguments: { channelId: "<channelId-from-response>" },
            verify: "Confirm isActive reflects the requested operational state.",
          },
          {
            name: "operator.report.verify",
            arguments: {
              reportKind: "channel_health",
              entityIds: { channelIds: ["<channelId-from-response>"] },
              includeSamples: true,
            },
            verify:
              "Use channel health verification to separate activation state from fetch-run history.",
          },
        ],
        note:
          "channels.set_active only toggles activation state. Historical fetch failures remain visible in recent run history.",
      },
    };
  }
  const resources = affectedOperationalResourcesForTool(toolName);
  if (resources.length === 0) {
    return {};
  }
  return {
    nextReadBack: {
      resources,
      tools: ["operator.system.health", "operator.report.verify"],
      note:
        "Use these read-back surfaces when the MCP client does not support resources/subscribe notifications.",
    },
  };
}
