from __future__ import annotations

from typing import Any

from fastapi import APIRouter, FastAPI, Query

from services.api.app import llm_review_read_model as _llm_review_read_model
from services.api.app import observability_read_model as _observability_read_model
from services.api.app.content_selection_read_model import query_count
from services.api.app.database import query_all, query_one


def list_fetch_runs(
    limit: int = Query(default=50, ge=1, le=200),
    channel_id: str | None = Query(default=None),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=200, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    return _observability_read_model.list_fetch_runs(
        limit=limit,
        channel_id=channel_id,
        page=page,
        page_size=page_size,
        query_all_func=query_all,
        query_count_func=query_count,
    )


def list_llm_reviews(
    limit: int = Query(default=50, ge=1, le=200),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=200, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    return _llm_review_read_model.list_llm_reviews(
        limit=limit,
        page=page,
        page_size=page_size,
        query_all_func=query_all,
        query_count_func=query_count,
    )


def get_llm_usage_summary() -> dict[str, Any]:
    return _llm_review_read_model.get_llm_usage_summary(query_all_func=query_all)


def get_llm_budget_summary() -> dict[str, Any]:
    return _llm_review_read_model.get_llm_budget_summary(query_one_func=query_one)


def get_maintenance_llm_budget_summary() -> dict[str, Any]:
    return get_llm_budget_summary()


def list_outbox_events(
    limit: int = Query(default=50, ge=1, le=200),
    event_type: str | None = Query(default=None, alias="eventType"),
    aggregate_type: str | None = Query(default=None, alias="aggregateType"),
    aggregate_id: str | None = Query(default=None, alias="aggregateId"),
    status: str | None = Query(default=None),
) -> list[dict[str, Any]]:
    return _observability_read_model.list_outbox_events(
        limit=limit,
        event_type=event_type,
        aggregate_type=aggregate_type,
        aggregate_id=aggregate_id,
        status=status,
        query_all_func=query_all,
    )


def register_observability_routes(app: FastAPI, deps: dict[str, Any]) -> None:
    router = APIRouter()
    router.get("/dashboard/summary")(deps["get_dashboard_summary"])
    router.get("/maintenance/reindex-jobs")(deps["list_reindex_jobs"])
    router.get("/maintenance/fetch-runs")(list_fetch_runs)
    router.get("/maintenance/llm-reviews")(list_llm_reviews)
    router.get("/maintenance/llm-usage-summary")(get_llm_usage_summary)
    router.get("/maintenance/llm-budget-summary")(get_maintenance_llm_budget_summary)
    router.get("/maintenance/outbox")(list_outbox_events)
    app.include_router(router)
