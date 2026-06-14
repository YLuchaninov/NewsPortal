from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, FastAPI

from signalops.api.web_content_auth import require_api_content_read_session


def register_content_routes(app: FastAPI, deps: dict[str, Any]) -> None:
    router = APIRouter()
    router.get("/maintenance/signal-candidates")(deps["list_signal_candidates"])
    router.get("/maintenance/signal-candidates/selection-summary")(
        deps["summarize_signal_candidate_selection_counts"]
    )
    router.get("/maintenance/signal-candidates/residuals")(deps["list_signal_candidate_residuals"])
    router.get("/maintenance/signal-candidates/residuals/summary")(
        deps["summarize_signal_candidate_residuals"]
    )
    content_read_guard = [Depends(require_api_content_read_session)]
    router.get("/collections/system-selected", dependencies=content_read_guard)(
        deps["list_system_selected_content_items"]
    )
    router.get("/content-items", dependencies=content_read_guard)(deps["list_content_items"])
    router.get("/content-items/{content_item_id}", dependencies=content_read_guard)(deps["get_content_item"])
    router.get("/content-items/{content_item_id}/explain", dependencies=content_read_guard)(
        deps["get_content_item_explain"]
    )
    router.get("/maintenance/web-resources")(deps["list_web_resources"])
    router.get("/maintenance/web-resources/{resource_id}")(deps["get_web_resource"])
    router.get("/maintenance/signal-candidates/{doc_id}")(deps["get_signal_candidate"])
    router.get("/maintenance/signal-candidates/{doc_id}/explain")(deps["get_signal_candidate_explain"])
    router.post("/maintenance/signal-candidates/{doc_id}/enrichment/retry", status_code=202)(
        deps["request_signal_candidate_enrichment_retry_route"]
    )
    router.post("/maintenance/content-items/{content_item_id}/enrichment/retry", status_code=202)(
        deps["request_content_item_enrichment_retry_route"]
    )
    app.include_router(router)
