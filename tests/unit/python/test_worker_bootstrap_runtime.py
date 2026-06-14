import unittest
from unittest.mock import patch

from tests.unit.python.support.stubs import install_worker_runtime_import_stubs

install_worker_runtime_import_stubs()

from signalops.workers import worker_bootstrap


class _ImmediateEvent:
    def is_set(self) -> bool:
        return True

    def set(self) -> None:
        return None

    async def wait(self) -> None:
        return None


class _Loop:
    def add_signal_handler(self, *_args, **_kwargs) -> None:
        return None


class _Logger:
    def __init__(self) -> None:
        self.warnings: list[tuple[object, ...]] = []

    def info(self, *_args, **_kwargs) -> None:
        return None

    def warning(self, *args, **_kwargs) -> None:
        self.warnings.append(args)

    def error(self, *_args, **_kwargs) -> None:
        return None


class _FakeWorker:
    created: list[str] = []

    def __init__(self, queue_name: str, _processor, _options) -> None:
        self.queue_name = queue_name
        self.closed = False
        self.__class__.created.append(queue_name)

    def on(self, *_args, **_kwargs) -> None:
        return None

    async def close(self) -> None:
        self.closed = True


class _SequenceRunJobProcessor:
    async def handle_payload(self, payload):
        return {"payload": payload}


class WorkerBootstrapRuntimeTests(unittest.IsolatedAsyncioTestCase):
    async def test_worker_runtime_starts_only_sequence_consumer(self) -> None:
        deps = {
            "sequence_runner_enabled": lambda: True,
            "sequence_cron_scheduler_enabled": lambda: False,
            "user_digest_scheduler_enabled": lambda: False,
            "PostgresSequenceRepository": lambda: object(),
            "SequenceRunJobProcessor": lambda repository: _SequenceRunJobProcessor(),
            "SEQUENCE_QUEUE": "q.sequence",
            "build_redis_connection_options": lambda: {},
            "sequence_runner_concurrency": lambda: 1,
            "sequence_runner_lock_duration_ms": lambda: 300000,
            "sequence_runner_stalled_interval_ms": lambda: 300000,
        }
        logger = _Logger()
        _FakeWorker.created = []

        with (
            patch.object(worker_bootstrap, "Worker", _FakeWorker),
            patch.object(worker_bootstrap.asyncio, "Event", _ImmediateEvent),
            patch.object(worker_bootstrap.asyncio, "get_running_loop", lambda: _Loop()),
        ):
            await worker_bootstrap.run_workers(deps, logger)

        self.assertEqual(_FakeWorker.created, ["q.sequence"])
        self.assertEqual(logger.warnings, [])


if __name__ == "__main__":
    unittest.main()
