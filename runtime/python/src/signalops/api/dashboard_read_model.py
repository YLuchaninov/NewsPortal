from __future__ import annotations

from typing import Any, Callable


def get_dashboard_summary(
    *,
    canonical_signal_candidate_family_expr_func: Callable[[str], str],
    final_selection_join_clause_func: Callable[[str, str], str],
    system_feed_join_clause_func: Callable[[str, str], str],
    feed_eligible_signal_candidate_clause_func: Callable[[str, str, str], str],
    processed_signal_candidate_clause_func: Callable[[str], str],
    query_one_func: Callable[[str], dict[str, Any] | None],
    get_llm_budget_summary_func: Callable[[], dict[str, Any]],
) -> dict[str, Any]:
    family_expr = canonical_signal_candidate_family_expr_func("a")
    counts = query_one_func(
        f"""
        select
          (
            select count(*)::int
            from (
              select distinct {family_expr} as family_doc_id
              from signal_candidates a
              {final_selection_join_clause_func("a", "fsr")}
              {system_feed_join_clause_func("a", "sfr")}
              where {feed_eligible_signal_candidate_clause_func("a", "fsr", "sfr")}
            ) deduped
          ) as active_signals,
          (select count(*)::int from signal_candidates a where {processed_signal_candidate_clause_func("a")}) as processed_total,
          (
            select count(*)::int
            from signal_candidates a
            where {processed_signal_candidate_clause_func("a")}
              and a.ingested_at >= now() - interval '24 hours'
          ) as processed_today,
          (select count(*)::int from users) as total_users,
          (select count(*)::int from source_channels where is_active = true) as active_channels,
          (select count(*)::int from reindex_jobs where status = 'queued') as queued_reindex_jobs,
          (
            select count(*)::int
            from source_channels sc
            left join source_channel_runtime_state scrs on scrs.channel_id = sc.channel_id
            where sc.is_active = true
              and coalesce(
                scrs.next_due_at,
                case
                  when sc.last_fetch_at is null then now()
                  else sc.last_fetch_at + make_interval(secs => sc.poll_interval_seconds)
                end
              ) <= now()
          ) as overdue_channels,
          (
            select count(*)::int
            from source_channels sc
            join source_channel_runtime_state scrs on scrs.channel_id = sc.channel_id
            where sc.is_active = true
              and scrs.effective_poll_interval_seconds > sc.poll_interval_seconds
          ) as adapted_channels,
          (
            select count(*)::int
            from source_channel_runtime_state
            where last_result_kind = 'hard_failure' or consecutive_failures >= 2
          ) as attention_channels,
          (
            select coalesce(percentile_disc(0.5) within group (order by fetch_duration_ms), 0)::int
            from channel_fetch_runs
            where started_at >= now() - interval '24 hours'
          ) as fetch_median_duration_ms_24h,
          (
            select count(*)::int
            from channel_fetch_runs
            where started_at >= now() - interval '24 hours'
              and outcome_kind = 'new_content'
          ) as fetch_new_content_24h,
          (
            select count(*)::int
            from channel_fetch_runs
            where started_at >= now() - interval '24 hours'
              and outcome_kind = 'no_change'
          ) as fetch_no_change_24h,
          (
            select count(*)::int
            from channel_fetch_runs
            where started_at >= now() - interval '24 hours'
              and outcome_kind in ('rate_limited', 'transient_failure', 'hard_failure')
          ) as fetch_failures_24h,
          (
            select count(*)::int
            from llm_review_log
            where created_at >= now() - interval '24 hours'
          ) as llm_review_count_24h,
          (
            select coalesce(sum(total_tokens), 0)::int
            from llm_review_log
            where created_at >= now() - interval '24 hours'
          ) as llm_total_tokens_24h,
          (
            select coalesce(sum(cost_estimate_usd), 0)::float
            from llm_review_log
            where created_at >= now() - interval '24 hours'
          ) as llm_cost_usd_24h
        """
    )
    budget_summary = get_llm_budget_summary_func()
    return {
        **(counts or {}),
        "llm_review_enabled": budget_summary["enabled"],
        "llm_monthly_budget_cents": budget_summary["monthlyBudgetCents"],
        "llm_month_to_date_cost_usd": budget_summary["monthToDateCostUsd"],
        "llm_month_to_date_cost_cents": budget_summary["monthToDateCostCents"],
        "llm_remaining_monthly_budget_cents": budget_summary[
            "remainingMonthlyBudgetCents"
        ],
        "llm_monthly_quota_reached": budget_summary["monthlyQuotaReached"],
        "llm_accept_gray_zone_on_budget_exhaustion": budget_summary[
            "acceptGrayZoneOnBudgetExhaustion"
        ],
    }
