import unittest
from unittest.mock import Mock, patch

from tests.unit.python.support.stubs import (
    JsonValueWrapper,
    SubscriptableConnection,
    install_psycopg_stub,
)

install_psycopg_stub(connection=SubscriptableConnection, json_wrapper=JsonValueWrapper)

from signalops.api.api_app import ApiAppContext, create_api_app
from signalops.api.route_deps import (
    ROUTE_DEPENDENCY_KEYS,
    ApiRouteDependencyValues,
    build_route_deps,
)


class ApiRouteDependencyBoundaryTests(unittest.TestCase):
    def test_build_route_deps_fails_fast_when_required_dependency_is_missing(self) -> None:
        namespace = {key: object() for key in ROUTE_DEPENDENCY_KEYS}
        missing_key = ROUTE_DEPENDENCY_KEYS[0]
        del namespace[missing_key]

        with self.assertRaisesRegex(TypeError, missing_key):
            ApiRouteDependencyValues(**namespace)

    def test_route_deps_reject_undeclared_dependency_lookup(self) -> None:
        namespace = {key: object() for key in ROUTE_DEPENDENCY_KEYS}
        deps = build_route_deps(ApiRouteDependencyValues(**namespace))

        self.assertIs(deps[ROUTE_DEPENDENCY_KEYS[0]], namespace[ROUTE_DEPENDENCY_KEYS[0]])
        with self.assertRaisesRegex(KeyError, "not declared"):
            _ = deps["not_a_route_dependency"]

    def test_create_api_app_registers_routes_from_explicit_context(self) -> None:
        namespace = {key: object() for key in ROUTE_DEPENDENCY_KEYS}
        deps = build_route_deps(ApiRouteDependencyValues(**namespace))
        register_mock = Mock()

        with patch("signalops.api.api_app.register_api_routes", register_mock):
            app = create_api_app(ApiAppContext(route_deps=deps, title="Unit API"))

        self.assertEqual(app.title, "Unit API")
        register_mock.assert_called_once_with(app, deps)


if __name__ == "__main__":
    unittest.main()
