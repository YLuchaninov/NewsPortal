from __future__ import annotations

from typing import Any

from fastapi import FastAPI


def register_content_analysis_routes(app: FastAPI, deps: dict[str, Any]) -> None:
    app.get("/maintenance/content-analysis")(deps["list_content_analysis_results"])
    app.get("/maintenance/content-analysis/{analysis_id}")(
        deps["get_content_analysis_result"]
    )
    app.post("/maintenance/content-analysis/backfill", status_code=202)(
        deps["request_content_analysis_backfill"]
    )
    app.get("/maintenance/content-entities")(deps["list_content_entities"])
    app.get("/maintenance/content-labels")(deps["list_content_labels"])
    app.get("/maintenance/content-analysis-policies")(
        deps["list_content_analysis_policies"]
    )
    app.get("/maintenance/content-analysis-policies/{policy_id}")(
        deps["get_content_analysis_policy"]
    )
    app.post("/maintenance/content-analysis-policies", status_code=201)(
        deps["create_content_analysis_policy"]
    )
    app.patch("/maintenance/content-analysis-policies/{policy_id}")(
        deps["update_content_analysis_policy"]
    )
    app.get("/maintenance/content-filter-policies")(
        deps["list_content_filter_policies"]
    )
    app.get("/maintenance/content-filter-policies/{filter_policy_id}")(
        deps["get_content_filter_policy"]
    )
    app.post("/maintenance/content-filter-policies", status_code=201)(
        deps["create_content_filter_policy"]
    )
    app.patch("/maintenance/content-filter-policies/{filter_policy_id}")(
        deps["update_content_filter_policy"]
    )
    app.post("/maintenance/content-filter-policies/{filter_policy_id}/preview")(
        deps["preview_content_filter_policy"]
    )
    app.get("/maintenance/content-filter-results")(deps["list_content_filter_results"])
