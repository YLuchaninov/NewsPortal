from __future__ import annotations

from typing import Any

from fastapi import APIRouter, FastAPI


def register_content_analysis_routes(app: FastAPI, deps: dict[str, Any]) -> None:
    router = APIRouter()
    router.get("/maintenance/content-analysis")(deps["list_content_analysis_results"])
    router.get("/maintenance/content-analysis/{analysis_id}")(
        deps["get_content_analysis_result"]
    )
    router.post("/maintenance/content-analysis/backfill", status_code=202)(
        deps["request_content_analysis_backfill"]
    )
    router.get("/maintenance/content-entities")(deps["list_content_entities"])
    router.get("/maintenance/content-labels")(deps["list_content_labels"])
    router.get("/maintenance/content-analysis-policies")(
        deps["list_content_analysis_policies"]
    )
    router.get("/maintenance/content-analysis-policies/{policy_id}")(
        deps["get_content_analysis_policy"]
    )
    router.post("/maintenance/content-analysis-policies", status_code=201)(
        deps["create_content_analysis_policy"]
    )
    router.patch("/maintenance/content-analysis-policies/{policy_id}")(
        deps["update_content_analysis_policy"]
    )
    router.get("/maintenance/content-filter-policies")(
        deps["list_content_filter_policies"]
    )
    router.get("/maintenance/content-filter-policies/{filter_policy_id}")(
        deps["get_content_filter_policy"]
    )
    router.post("/maintenance/content-filter-policies", status_code=201)(
        deps["create_content_filter_policy"]
    )
    router.patch("/maintenance/content-filter-policies/{filter_policy_id}")(
        deps["update_content_filter_policy"]
    )
    router.post("/maintenance/content-filter-policies/{filter_policy_id}/preview")(
        deps["preview_content_filter_policy"]
    )
    router.get("/maintenance/content-filter-results")(deps["list_content_filter_results"])
    app.include_router(router)
