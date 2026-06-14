"""FastAPI route registration modules for the API entrypoint."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from fastapi import FastAPI

from signalops.api.routes.catalog_routes import register_catalog_routes
from signalops.api.routes.content_analysis_routes import register_content_analysis_routes
from signalops.api.routes.content_routes import register_content_routes
from signalops.api.routes.discovery_routes import register_discovery_routes
from signalops.api.routes.health_routes import register_health_routes
from signalops.api.routes.ingress_adapter_routes import register_ingress_adapter_routes
from signalops.api.routes.observability_routes import register_observability_routes
from signalops.api.routes.sequence_routes import register_sequence_routes


def register_api_routes(app: FastAPI, deps: Mapping[str, Any]) -> None:
    register_health_routes(app)
    register_content_routes(app, deps)
    register_catalog_routes(app, deps)
    register_ingress_adapter_routes(app, deps)
    register_sequence_routes(app, deps)
    register_content_analysis_routes(app, deps)
    register_discovery_routes(app, deps)
    register_observability_routes(app, deps)
