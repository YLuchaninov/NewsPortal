from __future__ import annotations

from decimal import Decimal
import os
from typing import Any, Callable

from services.api.app.database import query_all, query_one
from services.api.app.content_selection_read_model import query_count
from services.api.app.discovery_selects import (
    discovery_candidate_select_sql,
    discovery_class_select_sql,
    discovery_feedback_select_sql,
    discovery_hypothesis_select_sql,
    discovery_mission_select_sql,
    discovery_policy_profile_select_sql,
    discovery_recall_candidate_select_sql,
    discovery_recall_mission_select_sql,
    discovery_source_interest_score_select_sql,
    discovery_source_profile_select_sql,
    discovery_source_quality_snapshot_select_sql,
)
from services.api.app.pagination import build_paginated_response, resolve_pagination

QueryAllFunc = Callable[[str, tuple[Any, ...]], list[dict[str, Any]]]
QueryCountFunc = Callable[[str, tuple[Any, ...]], int]
QueryOneFunc = Callable[[str, tuple[Any, ...]], dict[str, Any] | None]
CostToCentsFunc = Callable[[Any], int]
CoerceCostFunc = Callable[[Any], Decimal]
LoadDiscoverySettingsFunc = Callable[[], Any]
MonthStartFunc = Callable[[], Any]


class DiscoveryReadModelNotFound(LookupError):
    pass


def _require_row(row: dict[str, Any] | None, message: str) -> dict[str, Any]:
    if row is None:
        raise DiscoveryReadModelNotFound(message)
    return row


def get_discovery_mission(
    mission_id: str,
    *,
    query_one_func: QueryOneFunc = query_one,
) -> dict[str, Any]:
    return _require_row(
        query_one_func(
            f"{discovery_mission_select_sql()}\nwhere m.mission_id = %s",
            (mission_id,),
        ),
        f"Discovery mission {mission_id} was not found.",
    )


def get_discovery_recall_mission(
    recall_mission_id: str,
    *,
    query_one_func: QueryOneFunc = query_one,
) -> dict[str, Any]:
    return _require_row(
        query_one_func(
            f"{discovery_recall_mission_select_sql()}\nwhere rm.recall_mission_id = %s",
            (recall_mission_id,),
        ),
        f"Discovery recall mission {recall_mission_id} was not found.",
    )


def get_discovery_policy_profile(
    profile_id: str,
    *,
    query_one_func: QueryOneFunc = query_one,
) -> dict[str, Any]:
    return _require_row(
        query_one_func(
            f"{discovery_policy_profile_select_sql()}\nwhere p.profile_id = %s",
            (profile_id,),
        ),
        f"Discovery policy profile {profile_id} was not found.",
    )


def get_discovery_class(
    class_key: str,
    *,
    query_one_func: QueryOneFunc = query_one,
) -> dict[str, Any]:
    return _require_row(
        query_one_func(
            f"{discovery_class_select_sql()}\nwhere class_key = %s",
            (class_key,),
        ),
        f"Discovery class {class_key} was not found.",
    )


def get_discovery_candidate(
    candidate_id: str,
    *,
    query_one_func: QueryOneFunc = query_one,
) -> dict[str, Any]:
    return _require_row(
        query_one_func(
            f"{discovery_candidate_select_sql()}\nwhere c.candidate_id = %s",
            (candidate_id,),
        ),
        f"Discovery candidate {candidate_id} was not found.",
    )


def get_discovery_source_profile_by_canonical_domain(
    canonical_domain_value: str,
    *,
    query_one_func: QueryOneFunc = query_one,
) -> dict[str, Any] | None:
    return query_one_func(
        f"{discovery_source_profile_select_sql()}\nwhere sp.canonical_domain = %s",
        (canonical_domain_value,),
    )


def get_discovery_recall_candidate(
    recall_candidate_id: str,
    *,
    query_one_func: QueryOneFunc = query_one,
) -> dict[str, Any]:
    return _require_row(
        query_one_func(
            f"{discovery_recall_candidate_select_sql()}\nwhere rc.recall_candidate_id = %s",
            (recall_candidate_id,),
        ),
        f"Discovery recall candidate {recall_candidate_id} was not found.",
    )


def get_discovery_hypothesis(
    hypothesis_id: str,
    *,
    query_one_func: QueryOneFunc = query_one,
) -> dict[str, Any]:
    return _require_row(
        query_one_func(
            f"{discovery_hypothesis_select_sql()}\nwhere h.hypothesis_id = %s",
            (hypothesis_id,),
        ),
        f"Discovery hypothesis {hypothesis_id} was not found.",
    )


def get_discovery_source_profile(
    source_profile_id: str,
    *,
    query_one_func: QueryOneFunc = query_one,
) -> dict[str, Any]:
    return _require_row(
        query_one_func(
            f"{discovery_source_profile_select_sql()}\nwhere sp.source_profile_id = %s",
            (source_profile_id,),
        ),
        f"Discovery source profile {source_profile_id} was not found.",
    )


def get_discovery_source_quality_snapshot(
    snapshot_id: str,
    *,
    query_one_func: QueryOneFunc = query_one,
) -> dict[str, Any]:
    return _require_row(
        query_one_func(
            f"{discovery_source_quality_snapshot_select_sql()}\nwhere sqs.snapshot_id = %s",
            (snapshot_id,),
        ),
        f"Discovery source-quality snapshot {snapshot_id} was not found.",
    )


def get_discovery_source_interest_score(
    score_id: str,
    *,
    query_one_func: QueryOneFunc = query_one,
) -> dict[str, Any]:
    return _require_row(
        query_one_func(
            f"{discovery_source_interest_score_select_sql()}\nwhere sis.score_id = %s",
            (score_id,),
        ),
        f"Discovery source-interest score {score_id} was not found.",
    )


def get_discovery_portfolio_snapshot(
    mission_id: str,
    *,
    get_discovery_mission_func: Callable[[str], dict[str, Any]],
    query_one_func: QueryOneFunc = query_one,
) -> dict[str, Any]:
    mission = get_discovery_mission_func(mission_id)
    snapshot = query_one_func(
        """
        select
          snapshot_id::text as snapshot_id,
          mission_id::text as mission_id,
          snapshot_reason,
          ranked_sources,
          gaps_json,
          summary_json,
          created_at
        from discovery_portfolio_snapshots
        where mission_id = %s
        order by created_at desc
        limit 1
        """,
        (mission_id,),
    )
    return {
        "missionId": mission_id,
        "missionTitle": mission.get("title"),
        "snapshot": snapshot,
    }


def get_discovery_monthly_quota_snapshot(
    *,
    load_discovery_settings_func: LoadDiscoverySettingsFunc,
    discovery_month_start_utc_func: MonthStartFunc,
    coerce_discovery_cost_usd_func: CoerceCostFunc,
    discovery_cost_usd_to_cents_func: CostToCentsFunc,
    query_one_func: QueryOneFunc = query_one,
) -> dict[str, Any]:
    settings = load_discovery_settings_func()
    month_start = discovery_month_start_utc_func()
    row = query_one_func(
        """
        select
          coalesce(sum(cost_usd), 0) as month_to_date_cost_usd
        from discovery_cost_log
        where created_at >= %s
        """,
        (month_start,),
    ) or {"month_to_date_cost_usd": 0}
    month_to_date_cost_usd = coerce_discovery_cost_usd_func(
        row.get("month_to_date_cost_usd")
    )
    month_to_date_cost_cents = discovery_cost_usd_to_cents_func(month_to_date_cost_usd)
    quota_enabled = settings.monthly_budget_cents > 0
    budget_usd = Decimal(settings.monthly_budget_cents) / Decimal("100")
    monthly_quota_reached = quota_enabled and month_to_date_cost_usd >= budget_usd
    remaining_cents = (
        discovery_cost_usd_to_cents_func(
            max(budget_usd - month_to_date_cost_usd, Decimal("0"))
        )
        if quota_enabled
        else None
    )
    return {
        "monthlyBudgetCents": settings.monthly_budget_cents,
        "monthToDateCostUsd": float(month_to_date_cost_usd),
        "monthToDateCostCents": month_to_date_cost_cents,
        "remainingMonthlyBudgetCents": remaining_cents,
        "monthlyQuotaReached": monthly_quota_reached,
        "monthStart": month_start,
    }


def get_discovery_summary(
    *,
    load_discovery_settings_func: LoadDiscoverySettingsFunc,
    get_discovery_monthly_quota_snapshot_func: Callable[[], dict[str, Any]],
    coerce_discovery_cost_usd_func: CoerceCostFunc,
    discovery_cost_usd_to_cents_func: CostToCentsFunc,
    discovery_enabled_env_value: str | None = None,
    query_one_func: QueryOneFunc = query_one,
) -> dict[str, Any]:
    summary = query_one_func(
        """
        select
          (select count(*)::int from discovery_missions) as mission_count,
          (select count(*)::int from discovery_missions where status = 'active') as active_mission_count,
          (select count(*)::int from discovery_recall_missions) as recall_mission_count,
          (select count(*)::int from discovery_recall_missions where status = 'active') as active_recall_mission_count,
          (select count(*)::int from discovery_missions where interest_graph_status = 'compiled') as compiled_graph_count,
          (select count(*)::int from discovery_hypothesis_classes where status = 'active') as active_class_count,
          (select count(*)::int from discovery_hypotheses) as hypothesis_count,
          (select count(*)::int from discovery_hypotheses where status = 'pending') as pending_hypothesis_count,
          (select count(*)::int from discovery_candidates) as candidate_count,
          (select count(*)::int from discovery_candidates where status = 'pending') as pending_candidate_count,
          (select count(*)::int from discovery_candidates where status in ('approved', 'auto_approved')) as approved_candidate_count,
          (select count(*)::int from discovery_recall_candidates) as recall_candidate_count,
          (select count(*)::int from discovery_recall_candidates where status = 'pending') as pending_recall_candidate_count,
          (select count(*)::int from discovery_recall_candidates where status = 'duplicate') as duplicate_recall_candidate_count,
          (select count(*)::int from discovery_recall_candidates where registered_channel_id is not null) as promoted_recall_candidate_count,
          (select count(*)::int from discovery_policy_profiles) as profile_count,
          (select count(*)::int from discovery_policy_profiles where status = 'active') as active_profile_count,
          (select count(*)::int from discovery_source_profiles) as source_profile_count,
          (select count(*)::int from discovery_source_quality_snapshots) as source_quality_snapshot_count,
          (select count(*)::int from discovery_source_interest_scores) as source_interest_score_count,
          (select count(*)::int from discovery_portfolio_snapshots) as portfolio_snapshot_count,
          (select count(*)::int from discovery_feedback_events) as feedback_event_count,
          (select count(*)::int from discovery_candidates c where coalesce(c.evaluation_json -> 'policyReview' ->> 'stageLossBucket', '') = 'candidate_rejected_by_policy') as candidate_rejected_by_policy_count,
          (select count(*)::int from discovery_candidates c where coalesce(c.evaluation_json -> 'policyReview' ->> 'stageLossBucket', '') = 'candidate_manual_only') as candidate_manual_only_count,
          (select count(*)::int from discovery_recall_candidates c where coalesce(c.evaluation_json -> 'policyReview' ->> 'stageLossBucket', '') = 'candidate_rejected_by_policy') as recall_candidate_rejected_by_policy_count,
          (select count(*)::int from discovery_recall_candidates c where coalesce(c.evaluation_json -> 'policyReview' ->> 'stageLossBucket', '') = 'candidate_manual_only') as recall_candidate_manual_only_count,
          (select count(*)::int from discovery_candidates c where coalesce(c.evaluation_json -> 'policyReview' ->> 'productivityRisk', '') = 'high') as high_productivity_risk_candidate_count,
          (
            select count(*)::int
            from (
              select distinct registered_channel_id as channel_id
              from discovery_candidates
              where registered_channel_id is not null
              union
              select distinct registered_channel_id as channel_id
              from discovery_recall_candidates
              where registered_channel_id is not null
            ) dc
            where not exists (select 1 from web_resources wr where wr.channel_id = dc.channel_id)
              and not exists (select 1 from articles a where a.channel_id = dc.channel_id)
          ) as source_onboarded_no_extracted_resources_count,
          (
            select count(*)::int
            from (
              select distinct registered_channel_id as channel_id
              from discovery_candidates
              where registered_channel_id is not null
              union
              select distinct registered_channel_id as channel_id
              from discovery_recall_candidates
              where registered_channel_id is not null
            ) dc
            where exists (select 1 from web_resources wr where wr.channel_id = dc.channel_id)
              and not exists (select 1 from articles a where a.channel_id = dc.channel_id)
          ) as resources_extracted_no_stable_articles_count,
          (
            select count(*)::int
            from (
              select distinct registered_channel_id as channel_id
              from discovery_candidates
              where registered_channel_id is not null
              union
              select distinct registered_channel_id as channel_id
              from discovery_recall_candidates
              where registered_channel_id is not null
            ) dc
            where exists (select 1 from articles a where a.channel_id = dc.channel_id)
              and not exists (
                select 1
                from final_selection_results fs
                join articles a on a.doc_id = fs.doc_id
                where a.channel_id = dc.channel_id
                  and fs.final_decision = 'selected'
              )
          ) as articles_produced_zero_selected_outputs_count,
          (
            select count(*)::int
            from (
              select distinct registered_channel_id as channel_id
              from discovery_candidates
              where registered_channel_id is not null
              union
              select distinct registered_channel_id as channel_id
              from discovery_recall_candidates
              where registered_channel_id is not null
            ) dc
            where exists (
              select 1
              from final_selection_results fs
              join articles a on a.doc_id = fs.doc_id
              where a.channel_id = dc.channel_id
                and fs.final_decision = 'selected'
            )
          ) as selected_useful_evidence_present_count,
          (select coalesce(sum(cost_usd), 0) from discovery_cost_log) as total_cost_usd
        """
    ) or {}
    settings = load_discovery_settings_func()
    total_cost_usd = coerce_discovery_cost_usd_func(summary.get("total_cost_usd"))
    quota_snapshot = get_discovery_monthly_quota_snapshot_func()
    enabled_value = (
        os.getenv("DISCOVERY_ENABLED", "0")
        if discovery_enabled_env_value is None
        else discovery_enabled_env_value
    )
    return {
        **summary,
        "total_cost_usd": float(total_cost_usd),
        "total_cost_cents": discovery_cost_usd_to_cents_func(total_cost_usd),
        "enabled": enabled_value.strip().lower() in {"1", "true", "yes", "on"},
        "defaultCron": settings.cron,
        "defaultBudgetCents": settings.default_budget_cents,
        "searchProvider": settings.search_provider,
        "llmProvider": settings.llm_provider,
        "llmModel": settings.llm_model,
        "monthlyBudgetCents": quota_snapshot["monthlyBudgetCents"],
        "monthToDateCostUsd": quota_snapshot["monthToDateCostUsd"],
        "monthToDateCostCents": quota_snapshot["monthToDateCostCents"],
        "remainingMonthlyBudgetCents": quota_snapshot["remainingMonthlyBudgetCents"],
        "monthlyQuotaReached": quota_snapshot["monthlyQuotaReached"],
    }


def get_discovery_cost_summary(
    *,
    discovery_month_start_utc_func: MonthStartFunc,
    get_discovery_monthly_quota_snapshot_func: Callable[[], dict[str, Any]],
    coerce_discovery_cost_usd_func: CoerceCostFunc,
    discovery_cost_usd_to_cents_func: CostToCentsFunc,
    query_all_func: QueryAllFunc = query_all,
    query_one_func: QueryOneFunc = query_one,
) -> dict[str, Any]:
    month_start = discovery_month_start_utc_func()
    provider_rows = query_all_func(
        """
        select
          provider,
          operation,
          count(*)::int as row_count,
          coalesce(sum(cost_usd), 0) as total_cost_usd,
          coalesce(sum(cost_usd) filter (where created_at >= %s), 0) as month_to_date_cost_usd
        from discovery_cost_log
        group by provider, operation
        order by provider asc, operation asc
        """,
        (month_start,),
    )
    total_row = query_one_func(
        """
        select
          coalesce(sum(cost_usd), 0) as total_cost_usd,
          coalesce(sum(cost_usd) filter (where created_at >= now() - interval '24 hours'), 0) as last_24h_cost_usd,
          coalesce(sum(cost_usd) filter (where created_at >= %s), 0) as month_to_date_cost_usd
        from discovery_cost_log
        """,
        (month_start,),
    ) or {"total_cost_usd": 0, "last_24h_cost_usd": 0, "month_to_date_cost_usd": 0}
    total_cost_usd = coerce_discovery_cost_usd_func(total_row.get("total_cost_usd"))
    last_24h_cost_usd = coerce_discovery_cost_usd_func(total_row.get("last_24h_cost_usd"))
    month_to_date_cost_usd = coerce_discovery_cost_usd_func(
        total_row.get("month_to_date_cost_usd")
    )
    quota_snapshot = get_discovery_monthly_quota_snapshot_func()
    return {
        "totalCostUsd": float(total_cost_usd),
        "totalCostCents": discovery_cost_usd_to_cents_func(total_cost_usd),
        "last24hCostUsd": float(last_24h_cost_usd),
        "last24hCostCents": discovery_cost_usd_to_cents_func(last_24h_cost_usd),
        "monthToDateCostUsd": float(month_to_date_cost_usd),
        "monthToDateCostCents": discovery_cost_usd_to_cents_func(month_to_date_cost_usd),
        "monthlyBudgetCents": quota_snapshot["monthlyBudgetCents"],
        "remainingMonthlyBudgetCents": quota_snapshot["remainingMonthlyBudgetCents"],
        "monthlyQuotaReached": quota_snapshot["monthlyQuotaReached"],
        "items": [
            {
                **row,
                "total_cost_usd": float(
                    coerce_discovery_cost_usd_func(row.get("total_cost_usd"))
                ),
                "total_cost_cents": discovery_cost_usd_to_cents_func(
                    row.get("total_cost_usd")
                ),
                "month_to_date_cost_usd": float(
                    coerce_discovery_cost_usd_func(row.get("month_to_date_cost_usd"))
                ),
                "month_to_date_cost_cents": discovery_cost_usd_to_cents_func(
                    row.get("month_to_date_cost_usd")
                ),
            }
            for row in provider_rows
        ],
    }


def list_discovery_missions_page(
    *,
    limit: int,
    page: int | None,
    page_size: int | None,
    status: str | None,
    query_all_func: QueryAllFunc = query_all,
    query_count_func: QueryCountFunc = query_count,
) -> dict[str, Any] | list[dict[str, Any]]:
    filters: list[str] = []
    params: list[Any] = []
    if status:
        filters.append("m.status = %s")
        params.append(status)

    base_sql = discovery_mission_select_sql()
    if filters:
        base_sql = f"{base_sql}\nwhere {' and '.join(filters)}"
    base_sql = f"{base_sql}\norder by priority desc, updated_at desc, created_at desc"
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, limit
    )
    if not paginate:
        return query_all_func(f"{base_sql}\nlimit %s", tuple([*params, limit]))

    count_sql = "select count(*)::int as total from discovery_missions m"
    if filters:
        count_sql = f"{count_sql}\nwhere {' and '.join(filters)}"
    total = query_count_func(count_sql, tuple(params))
    items = query_all_func(
        f"{base_sql}\nlimit %s\noffset %s",
        tuple([*params, resolved_page_size, offset]),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


def list_discovery_recall_missions_page(
    *,
    limit: int,
    page: int | None,
    page_size: int | None,
    status: str | None,
    mission_kind: str | None,
    query_all_func: QueryAllFunc = query_all,
    query_count_func: QueryCountFunc = query_count,
) -> dict[str, Any] | list[dict[str, Any]]:
    filters: list[str] = []
    params: list[Any] = []
    if status:
        filters.append("rm.status = %s")
        params.append(status)
    if mission_kind:
        filters.append("rm.mission_kind = %s")
        params.append(mission_kind)

    base_sql = discovery_recall_mission_select_sql()
    if filters:
        base_sql = f"{base_sql}\nwhere {' and '.join(filters)}"
    base_sql = f"{base_sql}\norder by rm.updated_at desc, rm.created_at desc"
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, limit
    )
    if not paginate:
        return query_all_func(f"{base_sql}\nlimit %s", tuple([*params, limit]))

    count_sql = "select count(*)::int as total from discovery_recall_missions rm"
    if filters:
        count_sql = f"{count_sql}\nwhere {' and '.join(filters)}"
    total = query_count_func(count_sql, tuple(params))
    items = query_all_func(
        f"{base_sql}\nlimit %s\noffset %s",
        tuple([*params, resolved_page_size, offset]),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


def list_discovery_policy_profiles_page(
    *,
    limit: int,
    page: int | None,
    page_size: int | None,
    status: str | None,
    query_all_func: QueryAllFunc = query_all,
    query_count_func: QueryCountFunc = query_count,
) -> dict[str, Any] | list[dict[str, Any]]:
    filters: list[str] = []
    params: list[Any] = []
    if status:
        filters.append("p.status = %s")
        params.append(status)

    base_sql = discovery_policy_profile_select_sql()
    if filters:
        base_sql = f"{base_sql}\nwhere {' and '.join(filters)}"
    base_sql = f"{base_sql}\norder by p.updated_at desc, p.created_at desc"
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, limit
    )
    if not paginate:
        return query_all_func(f"{base_sql}\nlimit %s", tuple([*params, limit]))

    count_sql = "select count(*)::int as total from discovery_policy_profiles p"
    if filters:
        count_sql = f"{count_sql}\nwhere {' and '.join(filters)}"
    total = query_count_func(count_sql, tuple(params))
    items = query_all_func(
        f"{base_sql}\nlimit %s\noffset %s",
        tuple([*params, resolved_page_size, offset]),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


def list_discovery_classes_page(
    *,
    limit: int,
    page: int | None,
    page_size: int | None,
    status: str | None,
    query_all_func: QueryAllFunc = query_all,
    query_count_func: QueryCountFunc = query_count,
) -> dict[str, Any] | list[dict[str, Any]]:
    filters: list[str] = []
    params: list[Any] = []
    if status:
        filters.append("status = %s")
        params.append(status)
    base_sql = discovery_class_select_sql()
    if filters:
        base_sql = f"{base_sql}\nwhere {' and '.join(filters)}"
    base_sql = f"{base_sql}\norder by sort_order asc, class_key asc"
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, limit
    )
    if not paginate:
        return query_all_func(f"{base_sql}\nlimit %s", tuple([*params, limit]))
    count_sql = "select count(*)::int as total from discovery_hypothesis_classes"
    if filters:
        count_sql = f"{count_sql}\nwhere {' and '.join(filters)}"
    total = query_count_func(count_sql, tuple(params))
    items = query_all_func(
        f"{base_sql}\nlimit %s\noffset %s",
        tuple([*params, resolved_page_size, offset]),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


def list_discovery_candidates_page(
    *,
    limit: int,
    page: int | None,
    page_size: int | None,
    mission_id: str | None,
    status: str | None,
    provider_type: str | None,
    query_all_func: QueryAllFunc = query_all,
    query_count_func: QueryCountFunc = query_count,
) -> dict[str, Any] | list[dict[str, Any]]:
    filters: list[str] = []
    params: list[Any] = []
    if mission_id:
        filters.append("c.mission_id = %s")
        params.append(mission_id)
    if status:
        filters.append("c.status = %s")
        params.append(status)
    if provider_type:
        filters.append("c.provider_type = %s")
        params.append(provider_type)

    base_sql = discovery_candidate_select_sql()
    if filters:
        base_sql = f"{base_sql}\nwhere {' and '.join(filters)}"
    base_sql = f"{base_sql}\norder by c.created_at desc"
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, limit
    )
    if not paginate:
        return query_all_func(f"{base_sql}\nlimit %s", tuple([*params, limit]))

    count_sql = "select count(*)::int as total from discovery_candidates c"
    if filters:
        count_sql = f"{count_sql}\nwhere {' and '.join(filters)}"
    total = query_count_func(count_sql, tuple(params))
    items = query_all_func(
        f"{base_sql}\nlimit %s\noffset %s",
        tuple([*params, resolved_page_size, offset]),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


def list_discovery_recall_candidates_page(
    *,
    limit: int,
    page: int | None,
    page_size: int | None,
    recall_mission_id: str | None,
    status: str | None,
    provider_type: str | None,
    canonical_domain_value: str | None,
    query_all_func: QueryAllFunc = query_all,
    query_count_func: QueryCountFunc = query_count,
) -> dict[str, Any] | list[dict[str, Any]]:
    filters: list[str] = []
    params: list[Any] = []
    if recall_mission_id:
        filters.append("rc.recall_mission_id = %s")
        params.append(recall_mission_id)
    if status:
        filters.append("rc.status = %s")
        params.append(status)
    if provider_type:
        filters.append("rc.provider_type = %s")
        params.append(provider_type)
    if canonical_domain_value:
        filters.append("rc.canonical_domain = %s")
        params.append(canonical_domain_value)

    base_sql = discovery_recall_candidate_select_sql()
    if filters:
        base_sql = f"{base_sql}\nwhere {' and '.join(filters)}"
    base_sql = (
        f"{base_sql}\norder by "
        "coalesce(sqs.recall_score, 0) desc, rc.created_at desc"
    )
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, limit
    )
    if not paginate:
        return query_all_func(f"{base_sql}\nlimit %s", tuple([*params, limit]))

    count_sql = "select count(*)::int as total from discovery_recall_candidates rc"
    if filters:
        count_sql = f"{count_sql}\nwhere {' and '.join(filters)}"
    total = query_count_func(count_sql, tuple(params))
    items = query_all_func(
        f"{base_sql}\nlimit %s\noffset %s",
        tuple([*params, resolved_page_size, offset]),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


def list_discovery_hypotheses_page(
    *,
    limit: int,
    page: int | None,
    page_size: int | None,
    mission_id: str | None,
    status: str | None,
    query_all_func: QueryAllFunc = query_all,
    query_count_func: QueryCountFunc = query_count,
) -> dict[str, Any] | list[dict[str, Any]]:
    filters: list[str] = []
    params: list[Any] = []
    if mission_id:
        filters.append("h.mission_id = %s")
        params.append(mission_id)
    if status:
        filters.append("h.status = %s")
        params.append(status)

    base_sql = discovery_hypothesis_select_sql()
    if filters:
        base_sql = f"{base_sql}\nwhere {' and '.join(filters)}"
    base_sql = f"{base_sql}\norder by h.created_at desc"
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, limit
    )
    if not paginate:
        return query_all_func(f"{base_sql}\nlimit %s", tuple([*params, limit]))

    count_sql = "select count(*)::int as total from discovery_hypotheses h"
    if filters:
        count_sql = f"{count_sql}\nwhere {' and '.join(filters)}"
    total = query_count_func(count_sql, tuple(params))
    items = query_all_func(
        f"{base_sql}\nlimit %s\noffset %s",
        tuple([*params, resolved_page_size, offset]),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


def list_discovery_source_profiles_page(
    *,
    limit: int,
    page: int | None,
    page_size: int | None,
    min_trust_score: float | None,
    source_type: str | None,
    query_all_func: QueryAllFunc = query_all,
    query_count_func: QueryCountFunc = query_count,
) -> dict[str, Any] | list[dict[str, Any]]:
    filters: list[str] = []
    params: list[Any] = []
    if min_trust_score is not None:
        filters.append("sp.trust_score >= %s")
        params.append(min_trust_score)
    if source_type is not None:
        filters.append("sp.source_type = %s")
        params.append(source_type)
    base_sql = discovery_source_profile_select_sql()
    if filters:
        base_sql = f"{base_sql}\nwhere {' and '.join(filters)}"
    base_sql = f"{base_sql}\norder by sp.trust_score desc, sp.updated_at desc"
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, limit
    )
    if not paginate:
        return query_all_func(f"{base_sql}\nlimit %s", tuple([*params, limit]))
    count_sql = "select count(*)::int as total from discovery_source_profiles sp"
    if filters:
        count_sql = f"{count_sql}\nwhere {' and '.join(filters)}"
    total = query_count_func(count_sql, tuple(params))
    items = query_all_func(
        f"{base_sql}\nlimit %s\noffset %s",
        tuple([*params, resolved_page_size, offset]),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


def list_discovery_source_quality_snapshots_page(
    *,
    limit: int,
    page: int | None,
    page_size: int | None,
    channel_id: str | None,
    min_recall_score: float | None,
    query_all_func: QueryAllFunc = query_all,
    query_count_func: QueryCountFunc = query_count,
) -> dict[str, Any] | list[dict[str, Any]]:
    filters: list[str] = []
    params: list[Any] = []
    if channel_id:
        filters.append("sqs.channel_id = %s")
        params.append(channel_id)
    if min_recall_score is not None:
        filters.append("sqs.recall_score >= %s")
        params.append(min_recall_score)
    base_sql = discovery_source_quality_snapshot_select_sql()
    if filters:
        base_sql = f"{base_sql}\nwhere {' and '.join(filters)}"
    base_sql = f"{base_sql}\norder by sqs.recall_score desc, sqs.scored_at desc"
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, limit
    )
    if not paginate:
        return query_all_func(f"{base_sql}\nlimit %s", tuple([*params, limit]))
    count_sql = "select count(*)::int as total from discovery_source_quality_snapshots sqs"
    if filters:
        count_sql = f"{count_sql}\nwhere {' and '.join(filters)}"
    total = query_count_func(count_sql, tuple(params))
    items = query_all_func(
        f"{base_sql}\nlimit %s\noffset %s",
        tuple([*params, resolved_page_size, offset]),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


def list_discovery_source_interest_scores_page(
    *,
    limit: int,
    page: int | None,
    page_size: int | None,
    mission_id: str | None,
    channel_id: str | None,
    min_score: float | None,
    query_all_func: QueryAllFunc = query_all,
    query_count_func: QueryCountFunc = query_count,
) -> dict[str, Any] | list[dict[str, Any]]:
    filters: list[str] = []
    params: list[Any] = []
    if mission_id:
        filters.append("sis.mission_id = %s")
        params.append(mission_id)
    if channel_id:
        filters.append("sis.channel_id = %s")
        params.append(channel_id)
    if min_score is not None:
        filters.append("sis.contextual_score >= %s")
        params.append(min_score)
    base_sql = discovery_source_interest_score_select_sql()
    if filters:
        base_sql = f"{base_sql}\nwhere {' and '.join(filters)}"
    base_sql = f"{base_sql}\norder by sis.contextual_score desc, sis.scored_at desc"
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, limit
    )
    if not paginate:
        return query_all_func(f"{base_sql}\nlimit %s", tuple([*params, limit]))
    count_sql = "select count(*)::int as total from discovery_source_interest_scores sis"
    if filters:
        count_sql = f"{count_sql}\nwhere {' and '.join(filters)}"
    total = query_count_func(count_sql, tuple(params))
    items = query_all_func(
        f"{base_sql}\nlimit %s\noffset %s",
        tuple([*params, resolved_page_size, offset]),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


def list_discovery_feedback_page(
    *,
    limit: int,
    page: int | None,
    page_size: int | None,
    mission_id: str | None,
    query_all_func: QueryAllFunc = query_all,
    query_count_func: QueryCountFunc = query_count,
) -> dict[str, Any] | list[dict[str, Any]]:
    filters: list[str] = []
    params: list[Any] = []
    if mission_id:
        filters.append("dfe.mission_id = %s")
        params.append(mission_id)
    base_sql = discovery_feedback_select_sql()
    if filters:
        base_sql = f"{base_sql}\nwhere {' and '.join(filters)}"
    base_sql = f"{base_sql}\norder by dfe.created_at desc"
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, limit
    )
    if not paginate:
        return query_all_func(f"{base_sql}\nlimit %s", tuple([*params, limit]))
    count_sql = "select count(*)::int as total from discovery_feedback_events dfe"
    if filters:
        count_sql = f"{count_sql}\nwhere {' and '.join(filters)}"
    total = query_count_func(count_sql, tuple(params))
    items = query_all_func(
        f"{base_sql}\nlimit %s\noffset %s",
        tuple([*params, resolved_page_size, offset]),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)
