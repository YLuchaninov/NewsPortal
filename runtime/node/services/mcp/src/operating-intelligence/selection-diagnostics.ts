import type { Pool } from "pg";

import {
  classifyLlmProviderError,
  countQuery,
  isRecord,
  readCountField,
  readStringArray,
  uniqueStrings,
} from "./shared";

export const SELECTION_COUNTER_SEMANTICS = {
  filterReasonCounts:
    "Backward-compatible row counts from interest_filter_results; one candidate can contribute one row per matching criterion, so these are not unique candidate counts.",
  filterReasonBreakdown:
    "Use distinctCandidateCount to estimate unique candidate impact; use filterRows only to understand processor/result-row volume.",
  criteriaMatches:
    "Backfill criteriaMatches are processor/result rows, not selected-signal proof and not unique candidates.",
  interestMatches:
    "Backfill interestMatches are processor diagnostics and must be verified through final_selection_results, content_items, residual samples, or operator.report.verify.",
  selectedProof:
    "Final selected proof comes from final_selection_results/content_items plus representative selected and rejected samples.",
};

export const SELECTION_SCORE_THRESHOLDS = {
  irrelevantMaxThreshold: 0.45,
  relevantMinThreshold: 0.72,
  grayZoneRange: "0.45 < S_final < 0.72",
  source: "runtime/python/src/signalops/workers/scoring.py decide_criterion",
};

function isLabelLikeCue(value: unknown): boolean {
  const cue = String(value ?? "").trim();
  if (!cue) {
    return false;
  }
  return /^[a-z0-9]+(?:[_-][a-z0-9]+)+$/iu.test(cue);
}

function readCandidateSignalGroups(definitionJson: unknown) {
  const definition = isRecord(definitionJson) ? definitionJson : ({} as Record<string, unknown>);
  const candidateSignals = isRecord(definition.candidateSignals)
    ? definition.candidateSignals
    : {};
  const readGroups = (key: "positiveGroups" | "negativeGroups") => {
    const groups = Array.isArray(candidateSignals[key]) ? candidateSignals[key] : [];
    return groups
      .map((group, index) => {
        if (typeof group === "string") {
          return {
            name: group,
            cues: [group],
            index,
          };
        }
        const record = isRecord(group) ? group : {};
        const cues = [
          ...readStringArray(record.cues),
          ...readStringArray(record.fragments),
          ...readStringArray(record.values),
        ];
        return {
          name: String(record.name ?? record.groupName ?? `group_${index + 1}`),
          cues,
          index,
        };
      })
      .filter((group) => group.name || group.cues.length > 0);
  };
  return {
    positiveGroups: readGroups("positiveGroups"),
    negativeGroups: readGroups("negativeGroups"),
  };
}

function buildCandidateSignalQualityWarningsFromDefinitions(
  rows: Array<Record<string, unknown>>
) {
  const labelLikeCueWarnings: Array<Record<string, unknown>> = [];
  const singleCueGroups: Array<Record<string, unknown>> = [];
  const zeroCueGroups: Array<Record<string, unknown>> = [];
  let positiveCueGroupCount = 0;
  let negativeCueGroupCount = 0;
  for (const row of rows) {
    const groups = readCandidateSignalGroups(row.definitionJson);
    const allGroups = [
      ...groups.positiveGroups.map((group) => ({ ...group, polarity: "positive" })),
      ...groups.negativeGroups.map((group) => ({ ...group, polarity: "negative" })),
    ];
    positiveCueGroupCount += groups.positiveGroups.length;
    negativeCueGroupCount += groups.negativeGroups.length;
    for (const group of allGroups) {
      if (group.cues.length === 0) {
        zeroCueGroups.push({
          interestTemplateId: row.interestTemplateId,
          name: row.name,
          groupName: group.name,
          polarity: group.polarity,
          warning: "candidateSignals group has no literal cue fragments.",
        });
      }
      if (group.cues.length === 1) {
        singleCueGroups.push({
          interestTemplateId: row.interestTemplateId,
          name: row.name,
          groupName: group.name,
          polarity: group.polarity,
          warning: "single-cue group has weak evidence diversity; verify with bounded replay.",
        });
      }
      for (const cue of group.cues) {
        if (!isLabelLikeCue(cue)) {
          continue;
        }
        labelLikeCueWarnings.push({
          interestTemplateId: row.interestTemplateId,
          name: row.name,
          groupName: group.name,
          polarity: group.polarity,
          cue,
          warning:
            "Cue looks like an id/concept label. candidateSignals cues must be literal observable text fragments that can appear in candidate text.",
        });
      }
    }
  }
  return {
    candidateSignalsConfigured: positiveCueGroupCount + negativeCueGroupCount > 0,
    positiveCueGroupConfiguredCount: positiveCueGroupCount,
    negativeCueGroupConfiguredCount: negativeCueGroupCount,
    candidateSignalsQualityWarnings: [
      ...labelLikeCueWarnings,
      ...singleCueGroups.slice(0, 25),
      ...zeroCueGroups.slice(0, 25),
    ],
    labelLikeCueWarnings,
    singleCueGroupWarnings: singleCueGroups,
    zeroCueGroupWarnings: zeroCueGroups,
  };
}

export function sourceClassExpression(): string {
  return `
    case
      when coalesce(sc.config_json #>> '{sourceClass}', sc.config_json #>> '{operator,sourceClass}', '') in ('test_or_audit_like', 'operator_like', 'unknown')
        then coalesce(sc.config_json #>> '{sourceClass}', sc.config_json #>> '{operator,sourceClass}')
      when coalesce(sc.config_json #>> '{testArtifact}', sc.config_json #>> '{audit,kind}', '') <> ''
        then 'test_or_audit_like'
      when sc.name ~* '(^|[[:space:]-])(audit|ui audit|viewport|test)([[:space:]-]|$)'
        then 'test_or_audit_like'
      when sc.is_active = true
        then 'operator_like'
      else 'unknown'
    end
  `;
}

export async function readSelectionPipelineDiagnostics(pool: Pool): Promise<Record<string, unknown>> {
  const [
    pipelineStats,
    filterReasonRows,
    filterReasonBreakdownRows,
    processingStats,
    invalidShortTokenRows,
    contentKindRows,
    contentKindMismatchRows,
    topAffectedRows,
    llmProviderErrorRows,
    activeTestChannelRows,
    candidateSignalConfigRows,
    candidateSignalRuntimeRows,
    staleProfileRows,
    scoreDistributionRows,
    finalSelectionReasonRows,
    embeddingDiagnosticRows,
  ] = await Promise.all([
    countQuery(
      pool,
      `
        select
          count(*) filter (where technical_filter_state = 'filtered_out')::int as "technicalFilterRows",
          count(*) filter (where coalesce(semantic_decision, 'not_evaluated') <> 'not_evaluated')::int as "semanticEvaluatedRows",
          count(*) filter (where coalesce(semantic_decision, 'not_evaluated') = 'not_evaluated')::int as "semanticNotEvaluatedRows"
        from interest_filter_results
        where filter_scope = 'system_criterion'
      `
    ),
    countQuery(
      pool,
      `
        select reason, count(*)::int as count
        from interest_filter_results ifr
        cross join lateral jsonb_array_elements_text(
          case
            when jsonb_typeof(coalesce(ifr.explain_json -> 'filterReasons', '[]'::jsonb)) = 'array'
            then coalesce(ifr.explain_json -> 'filterReasons', '[]'::jsonb)
            else '[]'::jsonb
          end
        ) as reasons(reason)
        where ifr.filter_scope = 'system_criterion'
        group by reason
        order by count desc, reason asc
        limit 25
      `
    ),
    countQuery(
      pool,
      `
        with reason_rows as (
          select
            reasons.reason,
            ifr.doc_id,
            ifr.criterion_id,
            coalesce(sc.name, 'unknown') as channel_name
          from interest_filter_results ifr
          left join signal_candidates a on a.doc_id = ifr.doc_id
          left join source_channels sc on sc.channel_id = a.channel_id
          cross join lateral jsonb_array_elements_text(
            case
              when jsonb_typeof(coalesce(ifr.explain_json -> 'filterReasons', '[]'::jsonb)) = 'array'
              then coalesce(ifr.explain_json -> 'filterReasons', '[]'::jsonb)
              else '[]'::jsonb
            end
          ) as reasons(reason)
          where ifr.filter_scope = 'system_criterion'
        ),
        reason_summary as (
          select
            reason,
            count(*)::int as "filterRows",
            count(distinct doc_id)::int as "distinctCandidateCount",
            count(distinct criterion_id)::int as "affectedCriteriaCount"
          from reason_rows
          group by reason
        ),
        channel_counts as (
          select
            reason,
            channel_name as "channelName",
            count(distinct doc_id)::int as "distinctCandidateCount"
          from reason_rows
          group by reason, channel_name
        ),
        ranked_channels as (
          select
            *,
            row_number() over (
              partition by reason
              order by "distinctCandidateCount" desc, "channelName" asc
            ) as channel_rank
          from channel_counts
        )
        select
          rs.reason,
          rs."filterRows",
          rs."distinctCandidateCount",
          rs."affectedCriteriaCount",
          coalesce(
            jsonb_agg(
              jsonb_build_object(
                'channelName', rc."channelName",
                'distinctCandidateCount', rc."distinctCandidateCount"
              )
              order by rc."distinctCandidateCount" desc, rc."channelName" asc
            ) filter (where rc.channel_rank <= 5),
            '[]'::jsonb
          ) as "topChannels"
        from reason_summary rs
        left join ranked_channels rc on rc.reason = rs.reason
        group by rs.reason, rs."filterRows", rs."distinctCandidateCount", rs."affectedCriteriaCount"
        order by rs."filterRows" desc, rs.reason asc
        limit 25
      `
    ),
    countQuery(
      pool,
      `
        with processed as (
          select
            count(distinct doc_id)::int as "processedCandidateCount",
            count(distinct criterion_id)::int as "criteriaCount",
            count(*)::int as "materializedResultRows"
          from interest_filter_results
          where filter_scope = 'system_criterion'
        ),
        raw as (
          select count(*)::int as "rawCandidateCount"
          from signal_candidates
        )
        select
          processed."processedCandidateCount",
          greatest(raw."rawCandidateCount" - processed."processedCandidateCount", 0)::int as "pendingCandidateCount",
          processed."criteriaCount",
          (processed."processedCandidateCount" * processed."criteriaCount")::int as "expectedResultRows",
          processed."materializedResultRows"
        from processed
        cross join raw
      `
    ),
    countQuery(
      pool,
      `
        select
          it.interest_template_id::text as "interestTemplateId",
          it.name,
          jsonb_agg(token.value order by token.ordinality) as "invalidShortTokensRequired"
        from interest_templates it
        cross join lateral jsonb_array_elements_text(
          case
            when jsonb_typeof(coalesce(it.short_tokens_required, '[]'::jsonb)) = 'array'
            then coalesce(it.short_tokens_required, '[]'::jsonb)
            else '[]'::jsonb
          end
        ) with ordinality as token(value, ordinality)
        where it.is_active = true
          and token.value ~ '\\s'
        group by it.interest_template_id, it.name
        order by it.name asc
        limit 25
      `
    ),
    countQuery(
      pool,
      `
        select coalesce(content_kind, 'unknown') as "contentKind", count(*)::int as count
        from signal_candidates
        group by coalesce(content_kind, 'unknown')
        order by count desc, "contentKind" asc
        limit 25
      `
    ),
    countQuery(
      pool,
      `
        with observed as (
          select coalesce(content_kind, 'unknown') as content_kind, count(*)::int as count
          from signal_candidates
          group by coalesce(content_kind, 'unknown')
        )
        select
          it.interest_template_id::text as "interestTemplateId",
          it.name,
          it.allowed_content_kinds as "allowedContentKinds",
          jsonb_agg(jsonb_build_object('contentKind', observed.content_kind, 'count', observed.count) order by observed.count desc) as "excludedObservedContentKinds"
        from interest_templates it
        cross join observed
        where it.is_active = true
          and jsonb_typeof(coalesce(it.allowed_content_kinds, '[]'::jsonb)) = 'array'
          and not exists (
            select 1
            from jsonb_array_elements_text(coalesce(it.allowed_content_kinds, '[]'::jsonb)) allowed(value)
            where allowed.value = observed.content_kind
          )
        group by it.interest_template_id, it.name, it.allowed_content_kinds
        order by count(*) desc, it.name asc
        limit 25
      `
    ),
    countQuery(
      pool,
      `
        select
          ifr.criterion_id::text as "criterionId",
          c.source_interest_template_id::text as "interestTemplateId",
          coalesce(it.name, ifr.criterion_id::text) as "name",
          reasons.reason,
          count(*)::int as count
        from interest_filter_results ifr
        left join criteria c on c.criterion_id = ifr.criterion_id
        left join interest_templates it on it.interest_template_id = c.source_interest_template_id
        cross join lateral jsonb_array_elements_text(
          case
            when jsonb_typeof(coalesce(ifr.explain_json -> 'filterReasons', '[]'::jsonb)) = 'array'
            then coalesce(ifr.explain_json -> 'filterReasons', '[]'::jsonb)
            else '[]'::jsonb
          end
        ) as reasons(reason)
        where ifr.filter_scope = 'system_criterion'
          and ifr.technical_filter_state = 'filtered_out'
        group by ifr.criterion_id, c.source_interest_template_id, it.name, reasons.reason
        order by count desc, "name" asc
        limit 25
      `
    ),
    countQuery(
      pool,
      `
        select
          ${"coalesce(response_json ->> 'error', response_json #>> '{error,message}', '')"} as "errorText",
          count(*)::int as count,
          max(created_at) as "lastSeenAt"
        from llm_review_log
        where created_at >= now() - interval '7 days'
          and coalesce(response_json ->> 'error', response_json #>> '{error,message}', '') <> ''
        group by 1
        order by count desc, "lastSeenAt" desc
        limit 10
      `
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
    countQuery(
      pool,
      `
        select
          it.interest_template_id::text as "interestTemplateId",
          it.name,
          sp.definition_json as "definitionJson"
        from interest_templates it
        left join selection_profiles sp on sp.source_interest_template_id = it.interest_template_id
          and sp.status = 'active'
        where it.is_active = true
        order by it.updated_at desc, it.name asc
        limit 100
      `
    ),
    countQuery(
      pool,
      `
        select
          count(*) filter (where ifr.explain_json ? 'candidateSignals')::int as "candidateSignalsRecoveryRows",
          count(*) filter (
            where coalesce((ifr.explain_json -> 'candidateSignals' ->> 'positiveSignalCount')::int, 0) > 0
          )::int as "positiveCueGroupHitCount",
          count(*) filter (
            where coalesce((ifr.explain_json -> 'candidateSignals' ->> 'noiseSignalCount')::int, 0) > 0
          )::int as "negativeCueGroupHitCount",
          count(*) filter (
            where coalesce((ifr.explain_json -> 'candidateSignals' ->> 'positiveSignalHitCount')::int, 0) > 0
          )::int as "positiveCueFragmentHitRows",
          count(*)::int as "evaluatedRows"
        from interest_filter_results ifr
        where ifr.filter_scope = 'system_criterion'
      `
    ),
    countQuery(
      pool,
      `
        with versions as (
          select
            ifr.doc_id,
            reasons.reason,
            sp.version as "activeSelectionProfileVersion",
            nullif(ifr.explain_json #>> '{selectionProfile,selectionProfileVersion}', '')::int as "filterResultProfileVersion"
          from interest_filter_results ifr
          left join criteria c on c.criterion_id = ifr.criterion_id
          left join selection_profiles sp on sp.source_interest_template_id = c.source_interest_template_id
            and sp.status = 'active'
          left join lateral jsonb_array_elements_text(
            case
              when jsonb_typeof(coalesce(ifr.explain_json -> 'filterReasons', '[]'::jsonb)) = 'array'
              then coalesce(ifr.explain_json -> 'filterReasons', '[]'::jsonb)
              else '[]'::jsonb
            end
          ) as reasons(reason) on true
          where ifr.filter_scope = 'system_criterion'
        )
        select
          "activeSelectionProfileVersion",
          "filterResultProfileVersion",
          count(*)::int as "filterRows",
          count(distinct doc_id)::int as "distinctCandidateCount",
          count(*) filter (
            where "activeSelectionProfileVersion" is not null
              and "filterResultProfileVersion" is not null
              and "activeSelectionProfileVersion" <> "filterResultProfileVersion"
          )::int as "staleFilterResultRows",
          coalesce(reason, 'unknown') as reason
        from versions
        group by "activeSelectionProfileVersion", "filterResultProfileVersion", coalesce(reason, 'unknown')
        order by "staleFilterResultRows" desc, "filterRows" desc
        limit 50
      `
    ),
    countQuery(
      pool,
      `
        with scores as (
          select
            nullif(ifr.explain_json ->> 'S_final', '')::float8 as s_final,
            nullif(ifr.explain_json ->> 'S_pos', '')::float8 as s_pos,
            nullif(ifr.explain_json ->> 'S_lex', '')::float8 as s_lex,
            nullif(ifr.explain_json ->> 'S_meta', '')::float8 as s_meta
          from interest_filter_results ifr
          where ifr.filter_scope = 'system_criterion'
        )
        select
          min(s_final) as "minSFinal",
          percentile_cont(0.5) within group (order by s_final) as "medianSFinal",
          max(s_final) as "maxSFinal",
          percentile_cont(0.5) within group (order by s_pos) as "medianSPos",
          max(s_pos) as "maxSPos",
          percentile_cont(0.5) within group (order by s_lex) as "medianSLex",
          max(s_lex) as "maxSLex",
          percentile_cont(0.5) within group (order by s_meta) as "medianSMeta",
          max(s_meta) as "maxSMeta",
          count(*) filter (where s_final > 0.34 and s_final <= 0.45)::int as "nearGrayThresholdRows",
          count(*) filter (where s_final > 0.45 and s_final < 0.72)::int as "grayZoneScoreRows"
        from scores
      `
    ),
    countQuery(
      pool,
      `
        select
          coalesce(final_decision, 'unknown') as "finalDecision",
          coalesce(explain_json ->> 'selectionReason', explain_json ->> 'selectionBlockerReason', 'unknown') as reason,
          count(*)::int as count
        from final_selection_results
        group by coalesce(final_decision, 'unknown'), coalesce(explain_json ->> 'selectionReason', explain_json ->> 'selectionBlockerReason', 'unknown')
        order by count desc, "finalDecision" asc, reason asc
        limit 25
      `
    ),
    countQuery(
      pool,
      `
        select
          count(*) filter (
            where jsonb_typeof(coalesce(cc.compiled_json -> 'positive_embedding_ids', '[]'::jsonb)) = 'array'
              and jsonb_array_length(coalesce(cc.compiled_json -> 'positive_embedding_ids', '[]'::jsonb)) > 0
          )::int as "criteriaWithPositiveEmbeddings",
          count(*) filter (
            where coalesce(nullif(ifr.explain_json ->> 'S_pos', '')::float8, 0) > 0
          )::int as "rowsWithPositiveScore",
          count(*)::int as "evaluatedRows"
        from interest_filter_results ifr
        left join criteria_compiled cc on cc.criterion_id = ifr.criterion_id
        where ifr.filter_scope = 'system_criterion'
      `
    ),
  ]);

  const stats = pipelineStats[0] ?? {};
  const processing = processingStats[0] ?? {};
  const filterReasonCounts = Object.fromEntries(
    filterReasonRows.map((row) => [String(row.reason ?? "unknown"), Number(row.count ?? 0)])
  );
  const filterReasonBreakdown = filterReasonBreakdownRows.map((row) => ({
    reason: String(row.reason ?? "unknown"),
    filterRows: Number(row.filterRows ?? 0),
    distinctCandidateCount: Number(row.distinctCandidateCount ?? 0),
    affectedCriteriaCount: Number(row.affectedCriteriaCount ?? 0),
    topChannels: Array.isArray(row.topChannels) ? row.topChannels : [],
  }));
  const technicalFilterRows = readCountField(stats, "technicalFilterRows");
  const semanticEvaluatedRows = readCountField(stats, "semanticEvaluatedRows");
  const invalidShortTokenPhraseCount = invalidShortTokenRows.length;
  const llmProviderErrors: Array<Record<string, unknown> & { classification: string }> =
    llmProviderErrorRows.map((row) => ({
    ...row,
    classification: classifyLlmProviderError(String(row.errorText ?? "")),
  }));
  const providerEndpointErrorCount = llmProviderErrors
    .filter((row) => row.classification === "provider_endpoint_error")
    .reduce((sum, row) => sum + Number(row.count ?? 0), 0);
  const activeTestOrAuditFailureCount = activeTestChannelRows
    .filter((row) => row.sourceClass === "test_or_audit_like")
    .reduce((sum, row) => sum + Number(row.activeFailures ?? 0), 0);
  const filterRowsNotCandidateRows = filterReasonBreakdown.some(
    (row) => row.distinctCandidateCount > 0 && row.filterRows >= row.distinctCandidateCount * 2
  );
  const candidateSignalQuality =
    buildCandidateSignalQualityWarningsFromDefinitions(candidateSignalConfigRows);
  const candidateSignalRuntime = candidateSignalRuntimeRows[0] ?? {};
  const candidateSignalsRecoveryRows = readCountField(
    candidateSignalRuntime,
    "candidateSignalsRecoveryRows"
  );
  const positiveCueGroupHitCount = readCountField(
    candidateSignalRuntime,
    "positiveCueGroupHitCount"
  );
  const negativeCueGroupHitCount = readCountField(
    candidateSignalRuntime,
    "negativeCueGroupHitCount"
  );
  const evaluatedRows = readCountField(candidateSignalRuntime, "evaluatedRows");
  const candidateSignalsHitRate =
    evaluatedRows > 0 ? Number((positiveCueGroupHitCount / evaluatedRows).toFixed(4)) : 0;
  const staleFilterResultRows = staleProfileRows.reduce(
    (sum, row) => sum + Number(row.staleFilterResultRows ?? 0),
    0
  );
  const filterProfileVersions = uniqueStrings(
    staleProfileRows.map((row) => String(row.filterResultProfileVersion ?? "unknown"))
  );
  const activeProfileVersions = uniqueStrings(
    staleProfileRows.map((row) => String(row.activeSelectionProfileVersion ?? "unknown"))
  );
  const mixedProfileVersions = filterProfileVersions.filter((value) => value !== "unknown").length > 1;
  const staleRowsByReason = staleProfileRows
    .filter((row) => Number(row.staleFilterResultRows ?? 0) > 0)
    .map((row) => ({
      reason: String(row.reason ?? "unknown"),
      activeSelectionProfileVersion: row.activeSelectionProfileVersion ?? null,
      filterResultProfileVersion: row.filterResultProfileVersion ?? null,
      staleFilterResultRows: Number(row.staleFilterResultRows ?? 0),
      distinctCandidateCount: Number(row.distinctCandidateCount ?? 0),
    }));
  const scoreDistribution = scoreDistributionRows[0] ?? {};
  const maxSFinal = Number(scoreDistribution.maxSFinal ?? 0);
  const embeddingDiagnostics = embeddingDiagnosticRows[0] ?? {};
  const criteriaEmbeddingsPresent =
    readCountField(embeddingDiagnostics, "criteriaWithPositiveEmbeddings") > 0;
  const positiveScoresPresent = readCountField(embeddingDiagnostics, "rowsWithPositiveScore") > 0;

  return {
    technicalFilterRows,
    semanticEvaluatedRows,
    semanticNotEvaluatedRows: readCountField(stats, "semanticNotEvaluatedRows"),
    processedCandidateCount: readCountField(processing, "processedCandidateCount"),
    pendingCandidateCount: readCountField(processing, "pendingCandidateCount"),
    criteriaCount: readCountField(processing, "criteriaCount"),
    expectedResultRows: readCountField(processing, "expectedResultRows"),
    materializedResultRows: readCountField(processing, "materializedResultRows"),
    filterReasonCounts,
    filterReasonBreakdown,
    counterSemantics: SELECTION_COUNTER_SEMANTICS,
    sampleBeforeTuningGuidance: [
      "For wrapper_directory_noise, time_window, must_not and other hard-filter residuals, inspect representative rejected candidates before changing config.",
      "Do not globally remove generic filters or switch broad from row counts alone; compare filterRows with distinctCandidateCount and verify false negatives.",
      "Use bounded maintenance.reindex.request docIds replay and operator.report.verify after any calibration.",
    ],
    topAffectedCriteria: topAffectedRows,
    invalidShortTokensRequired: invalidShortTokenRows,
    contentKindDistribution: contentKindRows,
    contentKindMismatches: contentKindMismatchRows,
    llmProviderErrors,
    scoreThresholds: SELECTION_SCORE_THRESHOLDS,
    scoreDistribution,
    semanticEvaluatedRowsFresh:
      staleFilterResultRows === 0 ? semanticEvaluatedRows : Math.max(semanticEvaluatedRows - staleFilterResultRows, 0),
    technicalFilteredRowsFresh:
      staleFilterResultRows === 0 ? technicalFilterRows : Math.max(technicalFilterRows - staleFilterResultRows, 0),
    staleRowsByReason,
    staleProfileDiagnostics: {
      activeSelectionProfileVersions: activeProfileVersions,
      filterResultProfileVersions: filterProfileVersions,
      staleFilterResultRows,
      mixedProfileVersions,
      staleReplayPossible: staleFilterResultRows > 0 || mixedProfileVersions,
      lastReplayJobId: null,
      lastReplayCompletedAt: null,
      rows: staleProfileRows,
    },
    finalSelectionReasonBreakdown: finalSelectionReasonRows,
    candidateSignalsConfigured: candidateSignalQuality.candidateSignalsConfigured,
    candidateSignalsHitRate,
    positiveCueGroupConfiguredCount: candidateSignalQuality.positiveCueGroupConfiguredCount,
    negativeCueGroupConfiguredCount: candidateSignalQuality.negativeCueGroupConfiguredCount,
    positiveCueGroupHitCount,
    negativeCueGroupHitCount,
    zeroHitCueGroups:
      candidateSignalQuality.candidateSignalsConfigured && positiveCueGroupHitCount + negativeCueGroupHitCount === 0
        ? candidateSignalConfigRows.map((row) => ({
            interestTemplateId: row.interestTemplateId,
            name: row.name,
            warning:
              "No configured candidateSignals cue groups produced hits in current interest_filter_results; inspect representative rejected docs and replace concept-label cues with literal fragments.",
          }))
        : [],
    labelLikeCueWarnings: candidateSignalQuality.labelLikeCueWarnings,
    candidateSignalsQualityWarnings: candidateSignalQuality.candidateSignalsQualityWarnings,
    candidateSignalsRecoveryRows,
    embeddingDiagnostics: {
      criteriaEmbeddingsPresent,
      positiveScoresPresent,
      rowsWithPositiveScore: readCountField(embeddingDiagnostics, "rowsWithPositiveScore"),
      criteriaWithPositiveEmbeddings: readCountField(
        embeddingDiagnostics,
        "criteriaWithPositiveEmbeddings"
      ),
      interestCentroidsNotSelectionRootCause:
        criteriaEmbeddingsPresent && positiveScoresPresent
          ? "interest_centroids empty may affect other paths, but current system-criterion scoring is using criteria_compiled embeddings."
          : null,
    },
    sourceHealthNoise: {
      bySourceClass: activeTestChannelRows,
      activeTestOrAuditFailureCount,
    },
    diagnosticFlags: {
      hardFilterCollapseSuspected: technicalFilterRows > 0 && semanticEvaluatedRows < technicalFilterRows,
      shortTokenPhraseMismatch: invalidShortTokenPhraseCount > 0 || Number(filterReasonCounts.short_tokens_required ?? 0) > 0,
      contentKindMismatch: contentKindMismatchRows.length > 0 || Number(filterReasonCounts.content_kind ?? 0) > 0,
      llmProviderEndpointError: providerEndpointErrorCount > 0,
      activeTestChannelNoise: activeTestOrAuditFailureCount > 0,
      filterRowsNotCandidateRows,
      belowGrayThreshold: maxSFinal > 0 && maxSFinal <= SELECTION_SCORE_THRESHOLDS.irrelevantMaxThreshold,
      zeroCandidateSignalHits:
        candidateSignalQuality.candidateSignalsConfigured &&
        positiveCueGroupHitCount + negativeCueGroupHitCount === 0,
      mixedProfileVersions,
      staleReplayPossible: staleFilterResultRows > 0 || mixedProfileVersions,
      hardGateUnsafeForHiddenSignal: Number(filterReasonCounts.must_have_any ?? 0) > 0,
      globalHardGateOnMixedSignal: Number(filterReasonCounts.must_have_any ?? 0) > 0,
      semanticEmbeddingsPresentButBelowThreshold:
        criteriaEmbeddingsPresent &&
        positiveScoresPresent &&
        maxSFinal <= SELECTION_SCORE_THRESHOLDS.irrelevantMaxThreshold,
    },
  };
}
