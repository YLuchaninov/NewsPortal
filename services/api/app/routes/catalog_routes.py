from __future__ import annotations

from typing import Any

from fastapi import APIRouter, FastAPI


def register_catalog_routes(app: FastAPI, deps: dict[str, Any]) -> None:
    router = APIRouter()
    router.get("/channels")(deps["list_channels"])
    router.get("/channels/{channel_id}")(deps["get_channel"])
    router.get("/clusters")(deps["list_clusters"])
    router.get("/users/{user_id}/interests")(deps["list_user_interests"])
    router.get("/users/{user_id}/matches")(deps["list_user_matches"])
    router.get("/users/{user_id}/notifications")(deps["list_user_notifications"])
    router.get("/templates/llm")(deps["list_llm_templates"])
    router.get("/templates/llm/{prompt_template_id}")(deps["get_llm_template"])
    router.get("/system-interests")(deps["list_system_interests"])
    router.get("/system-interests/{interest_template_id}")(deps["get_system_interest"])
    app.include_router(router)
