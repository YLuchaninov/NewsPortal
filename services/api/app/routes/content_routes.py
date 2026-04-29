from __future__ import annotations

from typing import Any

from fastapi import APIRouter, FastAPI


def register_content_routes(app: FastAPI, deps: dict[str, Any]) -> None:
    router = APIRouter()
    router.get("/maintenance/articles")(deps["list_articles"])
    router.get("/maintenance/articles/residuals")(deps["list_article_residuals"])
    router.get("/maintenance/articles/residuals/summary")(
        deps["summarize_article_residuals"]
    )
    router.get("/collections/system-selected")(deps["list_system_selected_content_items"])
    router.get("/content-items")(deps["list_content_items"])
    router.get("/content-items/{content_item_id}")(deps["get_content_item"])
    router.get("/content-items/{content_item_id}/explain")(deps["get_content_item_explain"])
    router.get("/maintenance/web-resources")(deps["list_web_resources"])
    router.get("/maintenance/web-resources/{resource_id}")(deps["get_web_resource"])
    router.get("/maintenance/articles/{doc_id}")(deps["get_article"])
    router.get("/maintenance/articles/{doc_id}/explain")(deps["get_article_explain"])
    router.post("/maintenance/articles/{doc_id}/enrichment/retry", status_code=202)(
        deps["request_article_enrichment_retry_route"]
    )
    router.post("/maintenance/content-items/{content_item_id}/enrichment/retry", status_code=202)(
        deps["request_content_item_enrichment_retry_route"]
    )
    app.include_router(router)
