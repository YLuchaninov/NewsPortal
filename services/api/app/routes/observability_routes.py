from __future__ import annotations

from typing import Any

from fastapi import APIRouter, FastAPI


def register_observability_routes(app: FastAPI, deps: dict[str, Any]) -> None:
    router = APIRouter()
    router.get("/dashboard/summary")(deps["get_dashboard_summary"])
    router.get("/maintenance/reindex-jobs")(deps["list_reindex_jobs"])
    router.get("/maintenance/fetch-runs")(deps["list_fetch_runs"])
    router.get("/maintenance/llm-reviews")(deps["list_llm_reviews"])
    router.get("/maintenance/llm-usage-summary")(deps["get_llm_usage_summary"])
    router.get("/maintenance/llm-budget-summary")(deps["get_maintenance_llm_budget_summary"])
    router.get("/maintenance/outbox")(deps["list_outbox_events"])
    app.include_router(router)
