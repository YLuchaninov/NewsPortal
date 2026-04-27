from __future__ import annotations

from typing import Any

from fastapi import FastAPI


def register_catalog_routes(app: FastAPI, deps: dict[str, Any]) -> None:
    app.get("/channels")(deps["list_channels"])
    app.get("/channels/{channel_id}")(deps["get_channel"])
    app.get("/clusters")(deps["list_clusters"])
    app.get("/users/{user_id}/interests")(deps["list_user_interests"])
    app.get("/users/{user_id}/matches")(deps["list_user_matches"])
    app.get("/users/{user_id}/notifications")(deps["list_user_notifications"])
    app.get("/templates/llm")(deps["list_llm_templates"])
    app.get("/templates/llm/{prompt_template_id}")(deps["get_llm_template"])
    app.get("/system-interests")(deps["list_system_interests"])
    app.get("/system-interests/{interest_template_id}")(deps["get_system_interest"])
