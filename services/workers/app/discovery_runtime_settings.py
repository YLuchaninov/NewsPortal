from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any

DEFAULT_DISCOVERY_CRON = "0 */6 * * *"
ZERO_USD = Decimal("0")
USD_TO_CENTS = Decimal("100")


def read_int_env(name: str, default: int) -> int:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    try:
        return max(0, int(raw_value))
    except ValueError:
        return default


def read_optional_probability_env(name: str) -> float | None:
    raw_value = os.getenv(name)
    if raw_value is None or not raw_value.strip():
        return None
    try:
        parsed = float(raw_value)
    except ValueError:
        return None
    if parsed < 0 or parsed > 1:
        return None
    return parsed


def read_text_env(primary_name: str, fallback_name: str, default: str) -> str:
    primary = os.getenv(primary_name)
    if primary is not None and primary.strip():
        return primary.strip()
    fallback = os.getenv(fallback_name)
    if fallback is not None and fallback.strip():
        return fallback.strip()
    return default


def coerce_discovery_cost_usd(value: Any) -> Decimal:
    if value is None:
        return ZERO_USD
    if isinstance(value, Decimal):
        return value if value >= ZERO_USD else ZERO_USD
    try:
        parsed = Decimal(str(value).strip())
    except (InvalidOperation, AttributeError):
        return ZERO_USD
    return parsed if parsed >= ZERO_USD else ZERO_USD


def discovery_cost_usd_to_cents(value: Any) -> int:
    normalized = coerce_discovery_cost_usd(value)
    return int((normalized * USD_TO_CENTS).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def discovery_month_start_utc(now: datetime | None = None) -> datetime:
    current = now.astimezone(timezone.utc) if now is not None else datetime.now(timezone.utc)
    return current.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


@dataclass(frozen=True)
class DiscoverySettings:
    cron: str = DEFAULT_DISCOVERY_CRON
    default_budget_cents: int = 500
    default_auto_approve_threshold: float | None = None
    max_hypotheses_per_run: int = 20
    default_max_sources: int = 20
    search_provider: str = "ddgs"
    monthly_budget_cents: int = 0
    ddgs_backend: str = "auto"
    ddgs_region: str = "us-en"
    ddgs_safesearch: str = "moderate"
    llm_provider: str = "gemini"
    llm_model: str = "gemini-2.0-flash"


def load_discovery_settings() -> DiscoverySettings:
    return DiscoverySettings(
        cron=os.getenv("DISCOVERY_CRON", DEFAULT_DISCOVERY_CRON).strip() or DEFAULT_DISCOVERY_CRON,
        default_budget_cents=read_int_env("DISCOVERY_BUDGET_CENTS_DEFAULT", 500),
        default_auto_approve_threshold=read_optional_probability_env(
            "DISCOVERY_AUTO_APPROVE_THRESHOLD"
        ),
        max_hypotheses_per_run=max(1, read_int_env("DISCOVERY_MAX_HYPOTHESES_PER_RUN", 20)),
        default_max_sources=max(1, read_int_env("DISCOVERY_MAX_SOURCES_DEFAULT", 20)),
        search_provider=(os.getenv("DISCOVERY_SEARCH_PROVIDER", "ddgs").strip() or "ddgs"),
        monthly_budget_cents=read_int_env("DISCOVERY_MONTHLY_BUDGET_CENTS", 0),
        ddgs_backend=os.getenv("DISCOVERY_DDGS_BACKEND", "auto").strip() or "auto",
        ddgs_region=os.getenv("DISCOVERY_DDGS_REGION", "us-en").strip() or "us-en",
        ddgs_safesearch=os.getenv("DISCOVERY_DDGS_SAFESEARCH", "moderate").strip() or "moderate",
        llm_provider="gemini",
        llm_model=read_text_env(
            "DISCOVERY_GEMINI_MODEL",
            "GEMINI_MODEL",
            "gemini-2.0-flash",
        ),
    )


def monthly_quota_reached(*, settings: DiscoverySettings, month_to_date_cost_usd: Decimal) -> bool:
    if settings.monthly_budget_cents <= 0:
        return False
    return month_to_date_cost_usd >= (Decimal(settings.monthly_budget_cents) / USD_TO_CENTS)


def mission_budget_exhausted(*, budget_cents: int, spent_usd: Decimal) -> bool:
    if budget_cents <= 0:
        return False
    return spent_usd >= (Decimal(budget_cents) / USD_TO_CENTS)
