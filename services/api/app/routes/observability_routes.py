from __future__ import annotations

from typing import Any

from fastapi import FastAPI


def register_observability_routes(app: FastAPI, deps: dict[str, Any]) -> None:
    app.get("/dashboard/summary")(deps["get_dashboard_summary"])
    app.get("/maintenance/reindex-jobs")(deps["list_reindex_jobs"])
    app.get("/maintenance/fetch-runs")(deps["list_fetch_runs"])
    app.get("/maintenance/llm-reviews")(deps["list_llm_reviews"])
    app.get("/maintenance/llm-usage-summary")(deps["get_llm_usage_summary"])
    app.get("/maintenance/llm-budget-summary")(deps["get_maintenance_llm_budget_summary"])
    app.get("/maintenance/outbox")(deps["list_outbox_events"])
