from __future__ import annotations

import json
import os
from typing import Any
from urllib.request import Request, urlopen

from fastapi import APIRouter, Body, FastAPI, HTTPException, Query

from signalops.api import ingress_adapter_read_model as _ingress_adapters


def _mutation_error(error: Exception) -> HTTPException:
    return HTTPException(status_code=400, detail=str(error))


def _fetchers_internal_base_url() -> str:
    configured = os.getenv("FETCHERS_INTERNAL_BASE_URL")
    if configured:
        return configured.rstrip("/")
    postgres_host = os.getenv("POSTGRES_HOST", "127.0.0.1")
    default_host = "127.0.0.1" if postgres_host in {"127.0.0.1", "localhost"} else "fetchers"
    return f"http://{default_host}:{os.getenv('FETCHERS_PORT', '4100')}"


def register_ingress_adapter_routes(app: FastAPI, deps: dict[str, Any]) -> None:
    router = APIRouter()

    @router.get("/maintenance/ingress-adapters")
    def list_ingress_adapters(
        provider_type: str | None = Query(default=None, alias="providerType"),
        runtime_kind: str | None = Query(default=None, alias="runtimeKind"),
        status: str | None = Query(default=None),
    ) -> list[dict[str, Any]]:
        return _ingress_adapters.list_ingress_adapters(
            provider_type=provider_type,
            runtime_kind=runtime_kind,
            status=status,
        )

    @router.get("/maintenance/ingress-adapters/legacy-fallback-report")
    def read_legacy_fallback_report() -> dict[str, Any]:
        return _ingress_adapters.read_legacy_fallback_report()

    @router.get("/maintenance/ingress-adapters/{adapter_key:path}")
    def get_ingress_adapter(adapter_key: str) -> dict[str, Any]:
        try:
            return _ingress_adapters.get_ingress_adapter(adapter_key)
        except _ingress_adapters.IngressAdapterNotFoundError:
            raise HTTPException(status_code=404, detail="Ingress adapter not found.")

    @router.post("/maintenance/ingress-adapters")
    def create_declarative_ingress_adapter(
        payload: dict[str, Any] = Body(default_factory=dict),
    ) -> dict[str, Any]:
        try:
            return _ingress_adapters.create_declarative_ingress_adapter(payload)
        except _ingress_adapters.IngressAdapterMutationError as error:
            raise _mutation_error(error)

    @router.patch("/maintenance/ingress-adapters/{adapter_key:path}")
    def update_declarative_ingress_adapter(
        adapter_key: str,
        payload: dict[str, Any] = Body(default_factory=dict),
    ) -> dict[str, Any]:
        try:
            return _ingress_adapters.update_declarative_ingress_adapter(adapter_key, payload)
        except _ingress_adapters.IngressAdapterNotFoundError:
            raise HTTPException(status_code=404, detail="Ingress adapter not found.")
        except _ingress_adapters.IngressAdapterMutationError as error:
            raise _mutation_error(error)

    @router.post("/maintenance/ingress-adapters/recommend")
    def recommend_ingress_adapters(payload: dict[str, Any] = Body(default_factory=dict)) -> dict[str, Any]:
        channel_id = str(payload.get("channelId") or payload.get("channel_id") or "").strip()
        if not channel_id:
            raise HTTPException(status_code=400, detail="channelId is required.")
        try:
            return {
                "channelId": channel_id,
                "recommendations": _ingress_adapters.recommend_adapters_for_channel(channel_id),
            }
        except _ingress_adapters.IngressAdapterMutationError as error:
            raise _mutation_error(error)

    @router.post("/maintenance/ingress-adapters/{adapter_key:path}/dry-run")
    def dry_run_ingress_adapter(
        adapter_key: str,
        payload: dict[str, Any] = Body(default_factory=dict),
    ) -> dict[str, Any]:
        request_body = json.dumps({"adapterKey": adapter_key, **payload}).encode("utf-8")
        request = Request(
            f"{_fetchers_internal_base_url()}/internal/ingress-adapters/dry-run",
            data=request_body,
            headers={"content-type": "application/json"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=30) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as error:
            raise HTTPException(status_code=502, detail=f"Fetchers dry-run failed: {error}")

    @router.get("/maintenance/channels/{channel_id}/adapter-binding")
    def read_channel_adapter_binding(channel_id: str) -> dict[str, Any]:
        binding = _ingress_adapters.read_channel_adapter_binding(channel_id)
        if binding is None:
            raise HTTPException(status_code=404, detail="Channel adapter binding not found.")
        return binding

    @router.put("/maintenance/channels/{channel_id}/adapter-binding")
    def set_channel_adapter_binding(
        channel_id: str,
        payload: dict[str, Any] = Body(default_factory=dict),
    ) -> dict[str, Any]:
        try:
            return _ingress_adapters.upsert_channel_adapter_binding(channel_id, payload)
        except _ingress_adapters.IngressAdapterNotFoundError:
            raise HTTPException(status_code=404, detail="Ingress adapter not found.")
        except _ingress_adapters.IngressAdapterMutationError as error:
            raise _mutation_error(error)

    @router.delete("/maintenance/channels/{channel_id}/adapter-binding")
    def delete_channel_adapter_binding(channel_id: str) -> dict[str, Any]:
        return _ingress_adapters.delete_channel_adapter_binding(channel_id)

    @router.get("/maintenance/channels/{channel_id}/adapter-recommendations")
    def recommend_channel_adapter_binding(channel_id: str) -> dict[str, Any]:
        try:
            return {
                "channelId": channel_id,
                "recommendations": _ingress_adapters.recommend_adapters_for_channel(channel_id),
            }
        except _ingress_adapters.IngressAdapterMutationError as error:
            raise _mutation_error(error)

    app.include_router(router)
