from __future__ import annotations

import os
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import HTTPException

from signalops.workers.task_engine.adapters.web_search import (
    BraveWebSearchAdapter,
    DdgsWebSearchAdapter,
    SerperWebSearchAdapter,
    StubWebSearchAdapter,
)

def _env(name: str) -> str:
    return os.getenv(name, "").strip()


def _env_flag(name: str, *, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _json_safe(value: Any) -> Any:
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, datetime | date):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    if isinstance(value, tuple):
        return [_json_safe(item) for item in value]
    return value


def _discovery_unavailable(code: str, message: str) -> HTTPException:
    return HTTPException(status_code=503, detail={"code": code, "message": message})


def _effective_run_budget(
    *,
    runtime_policy: dict[str, Any],
    request: dict[str, Any] | None,
    budget: dict[str, Any] | None,
    live_provider_execution: bool,
) -> dict[str, Any]:
    request_budget = request.get("budget") if isinstance(request, dict) and isinstance(request.get("budget"), dict) else {}
    policy_budget = {
        key: runtime_policy[key]
        for key in ("maxRunCostCents", "maxQueryAttemptsPerRun", "maxResultsPerQuery")
        if runtime_policy.get(key) is not None
    }
    return {
        **policy_budget,
        **request_budget,
        **(budget if isinstance(budget, dict) else {}),
        "liveProviderExecution": live_provider_execution,
    }


def _search_provider_from_request(request: dict[str, Any] | None) -> str:
    provider = request.get("searchProvider") if isinstance(request, dict) else None
    return str(provider or _env("DISCOVERY_SEARCH_PROVIDER") or "ddgs").strip().lower()


def _assert_search_provider_runtime_ready(provider: str) -> None:
    normalized = provider.strip().lower()
    if normalized in {"stub", ""}:
        return
    if normalized == "brave" and not _env("DISCOVERY_BRAVE_API_KEY"):
        raise _discovery_unavailable(
            "runtime_credentials_missing",
            "Discovery live execution requires DISCOVERY_BRAVE_API_KEY for searchProvider=brave.",
        )
    if normalized == "serper" and not _env("DISCOVERY_SERPER_API_KEY"):
        raise _discovery_unavailable(
            "runtime_credentials_missing",
            "Discovery live execution requires DISCOVERY_SERPER_API_KEY for searchProvider=serper.",
        )


def _assert_live_runtime_allowed(
    runtime_policy: dict[str, Any],
    budget: dict[str, Any] | None,
    *,
    provider: str | None = None,
) -> None:
    if runtime_policy.get("requireDiscoveryEnabled", True) and not _env_flag("DISCOVERY_ENABLED"):
        raise _discovery_unavailable(
            "runtime_disabled",
            "Discovery live execution requires DISCOVERY_ENABLED=1.",
        )
    effective_budget = budget if isinstance(budget, dict) else {}
    max_cost = int(effective_budget.get("maxRunCostCents") or runtime_policy.get("maxRunCostCents") or 0)
    if runtime_policy.get("requireRunBudget", True) and max_cost <= 0:
        raise _discovery_unavailable(
            "budget_missing",
            "Discovery live execution requires a positive maxRunCostCents budget.",
        )
    if provider:
        _assert_search_provider_runtime_ready(provider)


def _search_adapter(provider: str):
    normalized = provider.strip().lower()
    if normalized == "stub":
        return StubWebSearchAdapter()
    if normalized == "brave":
        return BraveWebSearchAdapter()
    if normalized == "serper":
        return SerperWebSearchAdapter()
    return DdgsWebSearchAdapter()
