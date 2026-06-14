from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

import psycopg

from .runtime_config import (
    coerce_llm_cost_usd,
    llm_cost_usd_to_cents,
    llm_review_accept_gray_zone_on_budget_exhaustion,
    llm_review_enabled,
    llm_review_monthly_budget_cents,
)

_USD_TO_CENTS = Decimal("100")


def llm_review_month_start_utc(now: datetime | None = None) -> datetime:
    current = now.astimezone(timezone.utc) if now is not None else datetime.now(timezone.utc)
    return current.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


async def get_llm_review_monthly_quota_snapshot(
    cursor: psycopg.AsyncCursor[Any],
) -> dict[str, Any]:
    month_start = llm_review_month_start_utc()
    await cursor.execute(
        """
        select
          coalesce(sum(cost_estimate_usd), 0) as month_to_date_cost_usd
        from llm_review_log
        where created_at >= %s
          and scope = 'criterion'
        """,
        (month_start,),
    )
    row = await cursor.fetchone() or {}
    month_to_date_cost_usd = coerce_llm_cost_usd(row.get("month_to_date_cost_usd"))
    budget_cents = llm_review_monthly_budget_cents()
    budget_usd = Decimal(budget_cents) / _USD_TO_CENTS
    quota_enabled = budget_cents > 0
    monthly_quota_reached = quota_enabled and month_to_date_cost_usd >= budget_usd
    remaining_cents = (
        llm_cost_usd_to_cents(max(budget_usd - month_to_date_cost_usd, Decimal("0")))
        if quota_enabled
        else None
    )
    return {
        "enabled": llm_review_enabled(),
        "monthlyBudgetCents": budget_cents,
        "monthToDateCostUsd": float(month_to_date_cost_usd),
        "monthToDateCostCents": llm_cost_usd_to_cents(month_to_date_cost_usd),
        "remainingMonthlyBudgetCents": remaining_cents,
        "monthlyQuotaReached": monthly_quota_reached,
        "acceptGrayZoneOnBudgetExhaustion": llm_review_accept_gray_zone_on_budget_exhaustion(),
        "monthStart": month_start,
    }


def resolve_criterion_gray_zone_runtime_resolution(
    quota_snapshot: Mapping[str, Any],
    *,
    preserve_candidate_gray_zone: bool = False,
) -> dict[str, Any] | None:
    if not bool(quota_snapshot.get("enabled", True)):
        if preserve_candidate_gray_zone:
            return {
                "reason": "llm_review_disabled",
                "policy": "hold_candidate_recovery_gray_zone",
                "providerDecision": "hold",
                "finalDecision": "gray_zone",
            }
        return {
            "reason": "llm_review_disabled",
            "policy": "reject_gray_zone",
            "providerDecision": "reject",
            "finalDecision": "irrelevant",
        }
    if not bool(quota_snapshot.get("monthlyQuotaReached")):
        return None
    accept_gray_zone = bool(quota_snapshot.get("acceptGrayZoneOnBudgetExhaustion"))
    if preserve_candidate_gray_zone:
        return {
            "reason": "monthly_budget_exhausted",
            "policy": "hold_candidate_recovery_gray_zone",
            "providerDecision": "hold",
            "finalDecision": "gray_zone",
        }
    return {
        "reason": "monthly_budget_exhausted",
        "policy": "accept_gray_zone" if accept_gray_zone else "reject_gray_zone",
        "providerDecision": "approve" if accept_gray_zone else "reject",
        "finalDecision": "relevant" if accept_gray_zone else "irrelevant",
    }


def build_llm_budget_gate_explain(
    *,
    quota_snapshot: Mapping[str, Any],
    resolution: Mapping[str, Any],
) -> dict[str, Any]:
    month_start = quota_snapshot.get("monthStart")
    return {
        "reason": str(resolution.get("reason") or ""),
        "policy": str(resolution.get("policy") or ""),
        "enabled": bool(quota_snapshot.get("enabled", True)),
        "monthlyQuotaReached": bool(quota_snapshot.get("monthlyQuotaReached")),
        "acceptGrayZoneOnBudgetExhaustion": bool(
            quota_snapshot.get("acceptGrayZoneOnBudgetExhaustion")
        ),
        "monthStartUtc": (
            month_start.isoformat() if hasattr(month_start, "isoformat") else str(month_start or "")
        ),
        "monthToDateCostCents": int(quota_snapshot.get("monthToDateCostCents") or 0),
        "budgetCents": int(quota_snapshot.get("monthlyBudgetCents") or 0),
        "remainingMonthlyBudgetCents": quota_snapshot.get("remainingMonthlyBudgetCents"),
    }
