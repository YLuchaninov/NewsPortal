from __future__ import annotations

from typing import Any

from fastapi import FastAPI


def register_content_routes(app: FastAPI, deps: dict[str, Any]) -> None:
    app.get("/maintenance/articles")(deps["list_articles"])
    app.get("/maintenance/articles/residuals")(deps["list_article_residuals"])
    app.get("/maintenance/articles/residuals/summary")(
        deps["summarize_article_residuals"]
    )
    app.get("/collections/system-selected")(deps["list_system_selected_content_items"])
    app.get("/content-items")(deps["list_content_items"])
    app.get("/content-items/{content_item_id}")(deps["get_content_item"])
    app.get("/content-items/{content_item_id}/explain")(deps["get_content_item_explain"])
    app.get("/maintenance/web-resources")(deps["list_web_resources"])
    app.get("/maintenance/web-resources/{resource_id}")(deps["get_web_resource"])
    app.get("/maintenance/articles/{doc_id}")(deps["get_article"])
    app.get("/maintenance/articles/{doc_id}/explain")(deps["get_article_explain"])
    app.post("/maintenance/articles/{doc_id}/enrichment/retry", status_code=202)(
        deps["request_article_enrichment_retry_route"]
    )
    app.post("/maintenance/content-items/{content_item_id}/enrichment/retry", status_code=202)(
        deps["request_content_item_enrichment_retry_route"]
    )
