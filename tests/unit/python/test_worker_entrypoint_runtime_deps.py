import unittest

from tests.unit.python.support.stubs import install_worker_runtime_import_stubs

install_worker_runtime_import_stubs()

from services.workers.app import main as worker_main


class WorkerEntrypointRuntimeDepsTests(unittest.TestCase):
    def test_runtime_deps_are_resolved_from_main_namespace_at_call_time(self) -> None:
        original_notify = worker_main.process_notify
        sentinel_notify = object()
        try:
            worker_main.process_notify = sentinel_notify  # type: ignore[assignment]

            deps = worker_main.build_worker_runtime_deps()
        finally:
            worker_main.process_notify = original_notify

        self.assertIs(deps["process_notify"], sentinel_notify)

    def test_runtime_deps_keep_required_worker_bootstrap_keys(self) -> None:
        deps = worker_main.build_worker_runtime_deps()

        self.assertIs(deps["process_normalize"], worker_main.process_normalize)
        self.assertIs(deps["process_match_criteria"], worker_main.process_match_criteria)
        self.assertIs(deps["process_reindex"], worker_main.process_reindex)
        self.assertIs(deps["build_redis_connection_options"], worker_main.build_redis_connection_options)
        self.assertNotIn("legacy_queue_consumers_enabled", deps)


if __name__ == "__main__":
    unittest.main()
