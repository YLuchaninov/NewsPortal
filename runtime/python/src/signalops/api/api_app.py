from __future__ import annotations

from dataclasses import dataclass

from fastapi import FastAPI

from signalops.api.route_deps import ApiRouteDependencies
from signalops.api.routes import register_api_routes


@dataclass(frozen=True)
class ApiAppContext:
    route_deps: ApiRouteDependencies
    title: str = "SignalOps API MVP"


def create_api_app(context: ApiAppContext) -> FastAPI:
    app = FastAPI(title=context.title)
    register_api_routes(app, context.route_deps)
    return app
