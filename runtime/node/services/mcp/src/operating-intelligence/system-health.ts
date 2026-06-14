import type { Pool } from "pg";
import type { McpToolContext } from "../tools/shared";
import { sourceClassExpression } from "./selection-diagnostics";
import { classifyLlmProviderError, countQuery, issue, isRecord } from "./shared";
import { allSettledRecord, readDomains, readSinceHours } from "./guidance-common";

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
    llmProviderErrors,
    channelSourceClasses,
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
        left join final_selection_results fsr on fsr.doc_id = wr.projected_signal_candidate_id
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
          select 'run' as kind, status from discovery_vnext_runs
          union all
          select 'artifact' as kind, status from discovery_artifacts
          union all
          select 'candidate' as kind, status from discovery_candidates
          union all
          select 'source_inventory' as kind, current_state as status from source_inventory
          union all
          select 'adapter_backlog' as kind, status from adapter_backlog
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
    countQuery(
      pool,
      `
        select
          coalesce(response_json ->> 'error', response_json #>> '{error,message}', '') as "errorText",
          count(*)::int as count,
          max(created_at) as "lastSeenAt"
        from llm_review_log
        where created_at >= now() - ($1::int * interval '1 hour')
          and coalesce(response_json ->> 'error', response_json #>> '{error,message}', '') <> ''
        group by 1
        order by count desc, "lastSeenAt" desc
        limit 10
      `,
      [sinceHours]
    ),
    countQuery(
      pool,
      `
        select
          ${sourceClassExpression()} as "sourceClass",
          count(*)::int as count,
          count(*) filter (where coalesce(scrs.consecutive_failures, 0) > 0)::int as "activeFailures"
        from source_channels sc
        left join source_channel_runtime_state scrs on scrs.channel_id = sc.channel_id
        where sc.is_active = true
        group by "sourceClass"
        order by "activeFailures" desc, count desc
      `
    ),
    allSettledRecord({
      dashboardSummary: sdk.getDashboardSummary<Record<string, unknown>>(),
      discoveryRuns: sdk.listDiscoveryVNextRecords<Record<string, unknown>>("runs", {
        page: 1,
        pageSize: 20,
      }),
      llmBudgetSummary: sdk.getLlmBudgetSummary<Record<string, unknown>>(),
      residualSummary: sdk.getSignalCandidateResidualSummary<Record<string, unknown>>(),
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
    llmProviderErrors,
    channelSourceClasses,
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
      "API-backed dashboard/discovery/LLM budget/signal_candidate residual summaries",
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
      llmProviderErrors: llmProviderErrors.map((row: Record<string, unknown>) => ({
        ...row,
        classification: classifyLlmProviderError(String(row.errorText ?? "")),
      })),
      channelSourceClasses,
      apiSummaries,
    },
    issues: issues.filter((entry) => domains.includes(entry.domain)),
    samples,
    nextReadBack: [
      "signalops://ops/health",
      "signalops://ops/issues",
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
  const llmProviderErrorRows =
    Array.isArray(input.llmProviderErrors) ? input.llmProviderErrors as Record<string, unknown>[] : [];
  const channelSourceClassRows =
    Array.isArray(input.channelSourceClasses) ? input.channelSourceClasses as Record<string, unknown>[] : [];
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
          "Inspect signal_candidates.explain and content_filter_results.list for projected signal_candidate IDs.",
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
        "Use signal_candidates.residuals.summary and signal_candidates.explain before changing review policy.",
        "Tune one interest/template/profile at a time if this is too conservative.",
      ])
    );
  }

  const endpointErrors = llmProviderErrorRows
    .filter((row) => classifyLlmProviderError(String(row.errorText ?? "")) === "provider_endpoint_error")
    .reduce((sum, row) => sum + Number(row.count ?? 0), 0);
  if (endpointErrors > 0) {
    issues.push(
      issue(
        "critical",
        "llm_budget",
        "Recent LLM reviews failed with provider endpoint/model errors.",
        {
          reason: "provider_endpoint_error",
          provider404: llmProviderErrorRows.some((row) =>
            String(row.errorText ?? "").toLowerCase().includes("404")
          ),
          samples: llmProviderErrorRows.slice(0, 5),
        },
        [
          "Treat this as provider preflight failure, not budget tuning.",
          "Check provider base URL/model configuration and credentials through existing operator config paths.",
          "If no candidates reach gray-zone/review, diagnose hard filters first; provider errors only explain attempted reviews.",
        ]
      )
    );
  }

  const activeTestOrAuditFailures = channelSourceClassRows
    .filter((row) => row.sourceClass === "test_or_audit_like")
    .reduce((sum, row) => sum + Number(row.activeFailures ?? 0), 0);
  if (activeTestOrAuditFailures > 0) {
    issues.push(
      issue(
        "warning",
        "channels",
        "Active test/audit-like channels are contributing source-health failure noise.",
        { activeTestOrAuditFailures, bySourceClass: channelSourceClassRows },
        [
          "Separate operator_like failures from test_or_audit_like failures in channels.bottlenecks.summary/list.",
          "Use channels.set_active with a reason and read-back proof if the operator wants to pause test artifacts.",
          "Do not delete channels automatically.",
        ]
      )
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
    .filter((row) => row.kind === "endpoint" && ["rejected", "duplicate"].includes(String(row.status)))
    .reduce((sum, row) => sum + Number(row.count ?? 0), 0);
  if (weakDiscovery > 0) {
    issues.push(
      issue("info", "discovery", "Discovery has rejected or duplicate endpoints.", { weakDiscovery }, [
        "Review rejected reasons before changing target coverage policy or thresholds.",
        "Rejected endpoints may be correct for captcha/login/unsupported kind, duplicate identity, or missing-contract cases.",
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
                 wr.projected_signal_candidate_id::text as "projectedSignalCandidateId",
                 fsr.final_decision as "finalDecision"
          from web_resources wr
          join final_selection_results fsr on fsr.doc_id = wr.projected_signal_candidate_id
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
