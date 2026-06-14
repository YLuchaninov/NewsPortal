from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, FastAPI

from signalops.api.web_content_auth import require_api_content_read_session


def register_catalog_routes(app: FastAPI, deps: dict[str, Any]) -> None:
    router = APIRouter()
    router.get("/channels")(deps["list_channels"])
    router.get("/channels/{channel_id}")(deps["get_channel"])
    router.get("/clusters")(deps["list_clusters"])
    content_read_guard = [Depends(require_api_content_read_session)]
    router.get("/users/{user_id}/interests", dependencies=content_read_guard)(deps["list_user_interests"])
    router.get("/users/{user_id}/matches", dependencies=content_read_guard)(deps["list_user_matches"])
    router.get("/users/{user_id}/notifications", dependencies=content_read_guard)(
        deps["list_user_notifications"]
    )
    router.get("/templates/llm")(deps["list_llm_templates"])
    router.get("/templates/llm/{prompt_template_id}")(deps["get_llm_template"])
    router.get("/system-interests")(deps["list_system_interests"])
    router.get("/system-interests/{interest_template_id}")(deps["get_system_interest"])
    app.include_router(router)
