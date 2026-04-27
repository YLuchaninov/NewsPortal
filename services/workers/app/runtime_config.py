from __future__ import annotations

import os
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from typing import Any

_ZERO_USD = Decimal("0")
_USD_TO_CENTS = Decimal("100")


def env_flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def legacy_queue_consumers_enabled() -> bool:
    return env_flag("WORKER_ENABLE_LEGACY_QUEUE_CONSUMERS", default=False)


def sequence_runner_enabled() -> bool:
    return env_flag("WORKER_ENABLE_SEQUENCE_RUNNER", default=True)


def sequence_cron_scheduler_enabled() -> bool:
    return env_flag("WORKER_ENABLE_SEQUENCE_CRON_SCHEDULER", default=True)


def sequence_runner_concurrency() -> int:
    raw_value = os.getenv("WORKER_SEQUENCE_RUNNER_CONCURRENCY", "1")
    try:
        return max(1, int(raw_value))
    except ValueError:
        return 1


def sequence_runner_lock_duration_ms() -> int:
    raw_value = os.getenv("WORKER_SEQUENCE_RUNNER_LOCK_DURATION_MS", "300000")
    try:
        return max(30000, int(raw_value))
    except ValueError:
        return 300000


def sequence_runner_stalled_interval_ms() -> int:
    raw_value = os.getenv("WORKER_SEQUENCE_RUNNER_STALLED_INTERVAL_MS")
    if raw_value is None:
        return sequence_runner_lock_duration_ms()
    try:
        return max(30000, int(raw_value))
    except ValueError:
        return sequence_runner_lock_duration_ms()


def sequence_cron_poll_interval_seconds() -> float:
    raw_value = os.getenv("WORKER_SEQUENCE_CRON_POLL_INTERVAL_SECONDS", "30")
    try:
        return max(1.0, float(raw_value))
    except ValueError:
        return 30.0


def user_digest_scheduler_enabled() -> bool:
    return env_flag("WORKER_ENABLE_USER_DIGEST_SCHEDULER", default=True)


def user_digest_poll_interval_seconds() -> float:
    raw_value = os.getenv("WORKER_USER_DIGEST_POLL_INTERVAL_SECONDS", "60")
    try:
        return max(5.0, float(raw_value))
    except ValueError:
        return 60.0


def coerce_llm_cost_usd(value: Any) -> Decimal:
    if value is None:
        return _ZERO_USD
    if isinstance(value, Decimal):
        return value if value >= _ZERO_USD else _ZERO_USD
    try:
        parsed = Decimal(str(value).strip())
    except (InvalidOperation, AttributeError):
        return _ZERO_USD
    return parsed if parsed >= _ZERO_USD else _ZERO_USD


def llm_cost_usd_to_cents(value: Any) -> int:
    normalized = coerce_llm_cost_usd(value)
    return int((normalized * _USD_TO_CENTS).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


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
