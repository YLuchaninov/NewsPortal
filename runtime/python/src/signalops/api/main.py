from __future__ import annotations

from signalops.api.api_app import ApiAppContext, create_api_app
from signalops.api.main_compat import install_main_compat_exports
from signalops.api.route_deps import build_route_deps

_api_route_dependency_values = install_main_compat_exports(globals())

app = create_api_app(ApiAppContext(route_deps=build_route_deps(_api_route_dependency_values())))
