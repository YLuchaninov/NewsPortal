from __future__ import annotations

from decimal import Decimal
from typing import Any, Callable

from signalops.api.content_selection_read_model import query_count
from signalops.api.database import query_all, query_one
from signalops.api.llm_review_budget import (
    coerce_llm_review_cost_usd,
    llm_review_accept_gray_zone_on_budget_exhaustion,
    llm_review_cost_usd_to_cents,
    llm_review_enabled,
    llm_review_month_start_utc,
    llm_review_monthly_budget_cents,
)
from signalops.api.pagination import build_paginated_response, resolve_pagination

QueryAllFunc = Callable[[str, tuple[Any, ...]], list[dict[str, Any]]]
QueryOneFunc = Callable[[str, tuple[Any, ...]], dict[str, Any] | None]
QueryCountFunc = Callable[[str, tuple[Any, ...]], int]


class LlmTemplateNotFoundError(LookupError):
    pass


def list_llm_templates(
    *,
    page: int | None,
    page_size: int | None,
    query_all_func: Callable[..., list[dict[str, Any]]] = query_all,
    query_count_func: Callable[..., int] = query_count,
) -> dict[str, Any] | list[dict[str, Any]]:
    llm_template_select = """
        select *
        from llm_prompt_templates
        order by is_active desc, updated_at desc
    """
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, 20
    )
    if not paginate:
        return query_all_func(llm_template_select)

    total = query_count_func(
        """
        select count(*)::int as total
        from llm_prompt_templates
        """
    )
    items = query_all_func(
        f"{llm_template_select}\nlimit %s\noffset %s",
        (resolved_page_size, offset),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


def get_llm_template(
    prompt_template_id: str,
    *,
    query_one_func: QueryOneFunc = query_one,
) -> dict[str, Any]:
    template = query_one_func(
        """
        select *
        from llm_prompt_templates
        where prompt_template_id = %s
        """,
        (prompt_template_id,),
    )
    if template is None:
        raise LlmTemplateNotFoundError
    return template


def list_llm_reviews(
    *,
    limit: int = 50,
    page: int | None = None,
    page_size: int | None = None,
    query_all_func: QueryAllFunc = query_all,
    query_count_func: QueryCountFunc = query_count,
) -> dict[str, Any] | list[dict[str, Any]]:
    llm_review_select = """
        select
          lr.*,
          a.title as signal_candidate_title
        from llm_review_log lr
        join signal_candidates a on a.doc_id = lr.doc_id
        order by lr.created_at desc
    """
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, limit
    )
    if not paginate:
        return query_all_func(f"{llm_review_select}\nlimit %s", (limit,))

    total = query_count_func(
        """
        select count(*)::int as total
        from llm_review_log
        """,
        (),
    )
    items = query_all_func(
        f"{llm_review_select}\nlimit %s\noffset %s",
        (resolved_page_size, offset),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


def get_llm_usage_summary(
    *,
    query_all_func: QueryAllFunc = query_all,
) -> dict[str, Any]:
    rows = query_all_func(
        """
        select
          window_name,
          review_count,
          total_tokens,
          prompt_tokens,
          completion_tokens,
          cost_estimate_usd
        from (
          select
            '24h'::text as window_name,
            count(*)::int as review_count,
            coalesce(sum(total_tokens), 0)::int as total_tokens,
            coalesce(sum(prompt_tokens), 0)::int as prompt_tokens,
            coalesce(sum(completion_tokens), 0)::int as completion_tokens,
            coalesce(sum(cost_estimate_usd), 0)::float as cost_estimate_usd
          from llm_review_log
          where created_at >= now() - interval '24 hours'
          union all
          select
            '7d'::text as window_name,
            count(*)::int as review_count,
            coalesce(sum(total_tokens), 0)::int as total_tokens,
            coalesce(sum(prompt_tokens), 0)::int as prompt_tokens,
            coalesce(sum(completion_tokens), 0)::int as completion_tokens,
            coalesce(sum(cost_estimate_usd), 0)::float as cost_estimate_usd
          from llm_review_log
          where created_at >= now() - interval '7 days'
        ) usage_windows
        """,
        (),
    )
    return {
        row["window_name"]: {
            "review_count": row["review_count"],
            "total_tokens": row["total_tokens"],
            "prompt_tokens": row["prompt_tokens"],
            "completion_tokens": row["completion_tokens"],
            "cost_estimate_usd": row["cost_estimate_usd"],
        }
        for row in rows
    }


def get_llm_budget_summary(
    *,
    query_one_func: QueryOneFunc = query_one,
) -> dict[str, Any]:
    month_start = llm_review_month_start_utc()
    row = query_one_func(
        """
        select
          coalesce(sum(cost_estimate_usd), 0) as month_to_date_cost_usd
        from llm_review_log
        where created_at >= %s
          and scope = 'criterion'
        """,
        (month_start,),
    ) or {"month_to_date_cost_usd": 0}
    month_to_date_cost_usd = coerce_llm_review_cost_usd(row.get("month_to_date_cost_usd"))
    budget_cents = llm_review_monthly_budget_cents()
    budget_usd = Decimal(budget_cents) / Decimal("100")
    quota_enabled = budget_cents > 0
    monthly_quota_reached = quota_enabled and month_to_date_cost_usd >= budget_usd
    remaining_cents = (
        llm_review_cost_usd_to_cents(max(budget_usd - month_to_date_cost_usd, Decimal("0")))
        if quota_enabled
        else None
    )
    return {
        "enabled": llm_review_enabled(),
        "monthlyBudgetCents": budget_cents,
        "monthToDateCostUsd": float(month_to_date_cost_usd),
        "monthToDateCostCents": llm_review_cost_usd_to_cents(month_to_date_cost_usd),
        "remainingMonthlyBudgetCents": remaining_cents,
        "monthlyQuotaReached": monthly_quota_reached,
        "acceptGrayZoneOnBudgetExhaustion": llm_review_accept_gray_zone_on_budget_exhaustion(),
        "monthStart": month_start,
    }
