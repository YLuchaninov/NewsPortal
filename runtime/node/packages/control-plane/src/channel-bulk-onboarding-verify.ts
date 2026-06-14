import type { Pool } from "pg";

import type { BulkOnboardingVerifyResult } from "./channel-bulk-onboarding-model";
import {
  buildProviderShapeValidation,
} from "./channel-provider-shape";
export {
  buildProviderShapeValidation,
  classifyChannelProviderShape
} from "./channel-provider-shape";
export type {
  ChannelProviderShapeAlternative,
  ChannelProviderShapeClassification,
  ChannelProviderShapeValidation
} from "./channel-provider-shape";
export type {
  BulkImportChannel,
  BulkImportExecutionBreakdown,
  BulkImportExecutionResult,
  BulkImportPlan,
  BulkImportPlanItem,
  BulkImportProviderBreakdown,
  BulkOnboardingApplyOptions,
  BulkOnboardingApplyResult,
  BulkOnboardingItemStatus,
  BulkOnboardingMode,
  BulkOnboardingPlan,
  BulkOnboardingPlanItem,
  BulkOnboardingPlanOptions,
  BulkOnboardingSummary,
  BulkOnboardingVerifyResult,
  ParsedBulkImportChannel,
} from "./channel-bulk-onboarding-model";

import { nextBulkReadBack } from "./channel-bulk-onboarding-planning";
import { normalizeString } from "./channel-bulk-onboarding-parsing";

export async function verifyChannelBulkOnboardingWithPool(
  pool: Pool,
  channelIds: string[],
  includeSamples = false
): Promise<BulkOnboardingVerifyResult> {
  const requestedIds = [...new Set(channelIds.map((id) => normalizeString(id)).filter(Boolean))];
  const channelResult = await pool.query(
    `
      select sc.channel_id::text as "channelId",
             sc.name,
             sc.provider_type as "providerType",
             sc.is_active as "isActive",
             sc.fetch_url as "fetchUrl",
             sc.updated_at as "updatedAt",
             (select count(*)::int from signal_candidates a where a.channel_id = sc.channel_id) as "signalCandidateCount",
             (select count(*)::int from channel_fetch_runs cfr where cfr.channel_id = sc.channel_id) as "fetchRunCount",
             (select count(*)::int from channel_fetch_runs cfr where cfr.channel_id = sc.channel_id and cfr.outcome_kind in ('success', 'new_content')) as "successfulFetchRunCount",
             (select count(*)::int from web_resources wr where wr.channel_id = sc.channel_id) as "webResourceCount",
             (select count(*)::int from web_resources wr where wr.channel_id = sc.channel_id and wr.projected_signal_candidate_id is not null) as "projectedSignalCandidateCount",
             (
               select count(*)::int
               from web_resources wr
               join final_selection_results fsr on fsr.doc_id = wr.projected_signal_candidate_id
               where wr.channel_id = sc.channel_id and fsr.final_decision = 'selected'
             ) as "selectedProjectedSignalCandidateCount",
             (
               select count(*)::int
               from web_resources wr
               join final_selection_results fsr on fsr.doc_id = wr.projected_signal_candidate_id
               where wr.channel_id = sc.channel_id and fsr.final_decision = 'rejected'
             ) as "rejectedProjectedSignalCandidateCount",
             (
               select count(*)::int
               from web_resources wr
               join final_selection_results fsr on fsr.doc_id = wr.projected_signal_candidate_id
               where wr.channel_id = sc.channel_id and fsr.final_decision = 'gray_zone'
             ) as "grayZoneProjectedSignalCandidateCount"
      from source_channels sc
      where cardinality($1::text[]) = 0 or sc.channel_id::text = any($1::text[])
      order by sc.updated_at desc
      limit 100
    `,
    [requestedIds]
  );
  const foundIds = new Set(channelResult.rows.map((row) => String(row.channelId)));
  const missingChannelIds = requestedIds.filter((id) => !foundIds.has(id));
  const decisionCounts = await pool.query(
    `
      select sc.channel_id::text as "channelId",
             sc.name,
             coalesce(fsr.final_decision, 'not_projected') as "finalDecision",
             wr.projection_state as "projectionState",
             count(*)::int as count
      from source_channels sc
      join web_resources wr on wr.channel_id = sc.channel_id
      left join final_selection_results fsr on fsr.doc_id = wr.projected_signal_candidate_id
      where (cardinality($1::text[]) = 0 or sc.channel_id::text = any($1::text[]))
        and sc.provider_type = 'website'
      group by sc.channel_id, sc.name, coalesce(fsr.final_decision, 'not_projected'), wr.projection_state
      order by sc.name, coalesce(fsr.final_decision, 'not_projected'), wr.projection_state
    `,
    [requestedIds]
  );

  const samples = includeSamples
    ? {
        fetchRuns: (
          await pool.query(
            `
              select cfr.fetch_run_id::text as "runId",
                     cfr.channel_id::text as "channelId",
                     cfr.provider_type as "providerType",
                     cfr.outcome_kind as "outcomeKind",
                     cfr.started_at as "startedAt",
                     cfr.finished_at as "completedAt",
                     cfr.error_text as "errorMessage"
              from channel_fetch_runs cfr
              where cardinality($1::text[]) = 0 or cfr.channel_id::text = any($1::text[])
              order by cfr.started_at desc
              limit 20
            `,
            [requestedIds]
          )
        ).rows,
        webResources: (
          await pool.query(
            `
              select wr.resource_id::text as "resourceId",
                     wr.channel_id::text as "channelId",
                     wr.url,
                     wr.resource_kind as "resourceKind",
                     wr.extraction_state as "extractionState",
                     wr.projection_state as "projectionState",
                     wr.projected_signal_candidate_id::text as "projectedSignalCandidateId",
                     fsr.final_decision as "finalDecision",
                     fsr.verification_state as "verificationState"
              from web_resources wr
              left join final_selection_results fsr on fsr.doc_id = wr.projected_signal_candidate_id
              where cardinality($1::text[]) = 0 or wr.channel_id::text = any($1::text[])
              order by wr.updated_at desc
              limit 20
            `,
            [requestedIds]
          )
        ).rows
      }
    : undefined;

  const acquisitionSucceeded = channelResult.rows.filter((row) => {
    const providerType = String(row.providerType ?? "");
    const fetchRuns = Number(row.fetchRunCount ?? 0);
    const signal_candidates = Number(row.signalCandidateCount ?? 0);
    const resources = Number(row.webResourceCount ?? 0);
    return fetchRuns > 0 || signal_candidates > 0 || (providerType === "website" && resources > 0);
  }).length;
  const websiteProjected = channelResult.rows.reduce(
    (sum, row) => sum + Number(row.projectedSignalCandidateCount ?? 0),
    0
  );
  const websiteProjectedRejected = channelResult.rows.reduce(
    (sum, row) => sum + Number(row.rejectedProjectedSignalCandidateCount ?? 0),
    0
  );
  const warnings: string[] = [];
  if (missingChannelIds.length > 0) {
    warnings.push("Some requested channelIds were not found in source_channels.");
  }
  if (websiteProjectedRejected > 0) {
    warnings.push(
      "Some website resources projected into signal_candidates and were rejected downstream by final_selection_results; that is selection/content policy behavior, not channel onboarding failure."
    );
  }
  const providerShapeRisks = channelResult.rows
    .map((row) => ({
      channelId: row.channelId,
      name: row.name,
      providerType: row.providerType,
      fetchUrl: row.fetchUrl,
      validation: buildProviderShapeValidation(
        String(row.providerType ?? ""),
        String(row.fetchUrl ?? "")
      ),
    }))
    .filter((row) => row.validation.blocker);
  if (providerShapeRisks.length > 0) {
    warnings.push(
      `${providerShapeRisks.length} channel${providerShapeRisks.length === 1 ? "" : "s"} have provider-shape blockers; run channels.alternatives.plan before judging source quality.`
    );
  }

  return {
    reportKind: "channel_onboarding",
    verifiedAt: new Date().toISOString(),
    summary: {
      requestedChannels: requestedIds.length,
      foundChannels: channelResult.rows.length,
      missingChannelIds,
      acquisitionSucceeded,
      websiteProjected,
      websiteProjectedRejected
    },
    channels: channelResult.rows,
    websitePipeline: {
      note:
        "Website onboarding is verified in stages: channel row, fetch/acquisition, web_resources, projection, then downstream final selection. resource_only/projected/projected-but-rejected are distinct states.",
      countsByDecision: decisionCounts.rows
    },
    providerShapeRisks,
    ...(samples ? { samples } : {}),
    warnings,
    nextReadBack: nextBulkReadBack(requestedIds)
  };
}
