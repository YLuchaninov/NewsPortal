from __future__ import annotations

import os
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any

_ZERO_USD = Decimal("0")
_USD_TO_CENTS = Decimal("100")


def env_flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def coerce_llm_review_cost_usd(value: Any) -> Decimal:
    if value is None:
        return _ZERO_USD
    if isinstance(value, Decimal):
        return value if value >= _ZERO_USD else _ZERO_USD
    try:
        parsed = Decimal(str(value).strip())
    except (InvalidOperation, AttributeError):
        return _ZERO_USD
    return parsed if parsed >= _ZERO_USD else _ZERO_USD


def llm_review_cost_usd_to_cents(value: Any) -> int:
    normalized = coerce_llm_review_cost_usd(value)
    return int((normalized * _USD_TO_CENTS).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def llm_review_month_start_utc(now: datetime | None = None) -> datetime:
    current = now.astimezone(timezone.utc) if now is not None else datetime.now(timezone.utc)
    return current.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def llm_review_enabled() -> bool:
    return env_flag("LLM_REVIEW_ENABLED", default=True)


def llm_review_monthly_budget_cents() -> int:
    raw_value = os.getenv("LLM_REVIEW_MONTHLY_BUDGET_CENTS", "0")
    try:
        return max(0, int(raw_value))
    except ValueError:
        return 0


def llm_review_accept_gray_zone_on_budget_exhaustion() -> bool:
    return env_flag("LLM_REVIEW_BUDGET_EXHAUST_ACCEPT_GRAY_ZONE", default=False)
