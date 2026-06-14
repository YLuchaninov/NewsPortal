import { readOptionalString } from "../protocol";
import type { McpToolContext } from "../tools/shared";
import type { OperatingDomain } from "./model";
import { appendSelectionFunnelScopeClause, hasFunnelReadScope, readFunnelReadScope, type FunnelReadScope } from "./scope";
import { readSinceHours } from "./guidance-common";
import { countQuery } from "./shared";

export async function verifyOperatorEffect(
  { pool }: McpToolContext,
  args: Record<string, unknown>
) {
  const domain = (readOptionalString(args.domain) ?? "selection") as OperatingDomain;
  const baselineWindowHours = readSinceHours(args.baselineWindowHours, 24);
  const comparisonWindowHours = readSinceHours(args.comparisonWindowHours, 24);
  const changeRef = readOptionalString(args.changeRef) ?? "unspecified change";
  const includeSamples = args.includeSamples === true;
  const scope = readFunnelReadScope(args);

  const query = effectQueryForDomain(domain, scope);
  const [baseline, comparison] = await Promise.all([
    countQuery(pool, query.sql, [
      baselineWindowHours + comparisonWindowHours,
      comparisonWindowHours,
      ...query.params,
    ]),
    countQuery(pool, query.sql, [comparisonWindowHours, 0, ...query.params]),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    domain,
    changeRef,
    funnelScope: {
      funnelId: scope.funnelId,
      laneId: scope.laneId,
      selectionScope:
        hasFunnelReadScope(scope) && domain === "selection"
          ? "funnel_system_interest_bindings"
          : hasFunnelReadScope(scope)
            ? "not_applied_to_non_selection_domain"
            : "global",
    },
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
      ...(hasFunnelReadScope(scope) && domain !== "selection"
        ? ["Funnel scope is currently applied to selection metrics only for operator.effect.verify."]
        : []),
    ],
    samples: includeSamples ? { baseline, comparison } : {},
  };
}

function effectQueryForDomain(domain: OperatingDomain, scope: FunnelReadScope) {
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
      params: [],
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
        left join final_selection_results fsr on fsr.doc_id = wr.projected_signal_candidate_id
        where wr.updated_at >= now() - ($1::int * interval '1 hour')
          and wr.updated_at < now() - ($2::int * interval '1 hour')
        group by wr.projection_state, coalesce(fsr.final_decision, 'not_projected')
        order by wr.projection_state, coalesce(fsr.final_decision, 'not_projected')
      `,
      params: [],
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
      params: [],
    };
  }
  if (domain === "discovery") {
    return {
      metric: "discovery vNext inventory states",
      sql: `
        select current_provider_type as "providerType", current_state as status, count(*)::int as count
        from source_inventory
        where created_at >= now() - ($1::int * interval '1 hour')
          and created_at < now() - ($2::int * interval '1 hour')
        group by current_provider_type, current_state
        order by current_provider_type, current_state
      `,
      params: [],
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
      params: [],
    };
  }
  const params: unknown[] = [];
  const scopeClause = appendSelectionFunnelScopeClause(params, scope, "fsr", 3);
  return {
    metric: "final selection decisions",
    sql: `
      select final_decision as "finalDecision", verification_state as "verificationState", count(*)::int as count
      from final_selection_results
      where updated_at >= now() - ($1::int * interval '1 hour')
        and updated_at < now() - ($2::int * interval '1 hour')
        ${scopeClause ? `and ${scopeClause}` : ""}
      group by final_decision, verification_state
      order by final_decision, verification_state
    `,
    params,
  };
}
