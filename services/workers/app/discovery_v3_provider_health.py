from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any


def evaluate_provider_health(metrics: dict[str, Any], *, now: datetime | None = None) -> dict[str, Any]:
    effective_now = now or datetime.now(UTC)
    error_rate = float(metrics.get("error_rate") or 0)
    auth_failed = bool(metrics.get("auth_failed")) or str(metrics.get("last_error_kind") or "") == "auth_failed"
    rate_limited = bool(metrics.get("rate_limited")) or str(metrics.get("last_error_kind") or "") == "rate_limited"

    status = "healthy"
    cooldown_until = metrics.get("cooldown_until")
    repair_kind = None
    budget_multiplier = 1.0

    if error_rate >= 0.50:
        status = "degraded"
        budget_multiplier = 0.30
    if rate_limited:
        status = "rate_limited"
        cooldown_until = cooldown_until or effective_now + timedelta(hours=1)
        repair_kind = "switch_provider"
        budget_multiplier = 0.0
    if auth_failed:
        status = "auth_failed"
        repair_kind = "repair_provider_auth"
        budget_multiplier = 0.0
    if bool(metrics.get("disabled")):
        status = "disabled"
        budget_multiplier = 0.0

    return {
        "provider_id": metrics.get("provider_id"),
        "status": status,
        "success_rate": float(metrics.get("success_rate") or max(0.0, 1 - error_rate)),
        "error_rate": error_rate,
        "rate_limit_score": 0.0 if rate_limited else float(metrics.get("rate_limit_score") or 1),
        "auth_health_score": 0.0 if auth_failed else float(metrics.get("auth_health_score") or 1),
        "latency_score": float(metrics.get("latency_score") or 1),
        "cooldown_until": cooldown_until,
        "budgetMultiplier": budget_multiplier,
        "repairKind": repair_kind,
        "shouldExecute": budget_multiplier > 0,
        "hypothesisFailure": False,
    }


def provider_execution_budget_multiplier(health: dict[str, Any]) -> float:
    status = str(health.get("status") or "healthy")
    if status == "healthy":
        return 1.0
    if status == "degraded":
        return 0.30
    return 0.0
