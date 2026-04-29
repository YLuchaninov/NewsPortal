from __future__ import annotations

from fastapi import APIRouter, FastAPI

from services.api.app.database import check_database


def register_health_routes(app: FastAPI) -> None:
    router = APIRouter()

    @router.get("/health")
    def health() -> dict[str, object]:
        check_database()
        return {
            "service": "api",
            "status": "ok",
            "checks": {
                "database": "ok",
            },
        }

    app.include_router(router)
