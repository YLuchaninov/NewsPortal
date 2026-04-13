import asyncio
import unittest
from collections.abc import Mapping
from dataclasses import replace
from itertools import count
from typing import Any

from services.workers.app.task_engine.context import ContextManager
from services.workers.app.task_engine.exceptions import TaskExecutionError
from services.workers.app.task_engine.executor import SequenceExecutor
from services.workers.app.task_engine.models import SequenceDefinition, SequenceRunRecord
from services.workers.app.task_engine.plugins import TaskPlugin, TaskPluginRegistry


class EmitPlugin(TaskPlugin):
    name = "Emit"
    description = "Emit a configured value."
    category = "test"

    async def execute(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        value_key = str(options["key"])
        return {
            value_key: options["value"],
            "lastTaskKey": context["_task_key"],
            "lastTaskIndex": context["_task_index"],
        }


class CombinePlugin(TaskPlugin):
    name = "Combine"
    description = "Read existing context and combine values."
    category = "test"

    async def execute(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        left_key = str(options["left_key"])
        right_value = int(options["right_value"])
        return {
            "combined": int(context[left_key]) + right_value,
        }


class StopPlugin(TaskPlugin):
    name = "Stop"
    description = "Stop the sequence early."
    category = "test"

    async def execute(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        return {"_stop": True, "stopped": True}


class FlakyPlugin(TaskPlugin):
    name = "Flaky"
    description = "Fails once, then succeeds."
    category = "test"

    def __init__(self) -> None:
        self.calls = 0

    async def execute(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        self.calls += 1
        if self.calls == 1:
            raise TaskExecutionError("retry me", retryable=True)
        return {"flakySucceeded": True}


class DeadlockDetected(Exception):
    sqlstate = "40P01"


class TransientDatabaseFlakyPlugin(TaskPlugin):
    name = "TransientDatabaseFlaky"
    description = "Fails once with a transient database error, then succeeds."
    category = "test"

    def __init__(self) -> None:
        self.calls = 0

    async def execute(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        self.calls += 1
        if self.calls == 1:
            raise DeadlockDetected("deadlock detected while updating articles")
        return {"transientRetrySucceeded": True}


class TimeoutPlugin(TaskPlugin):
    name = "Timeout"
    description = "Sleeps longer than the configured timeout."
    category = "test"

    async def execute(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        await asyncio.sleep(0.02)
        return {"timeout": False}


class ValidatedPlugin(TaskPlugin):
    name = "Validated"
    description = "Requires a label option."
    category = "test"

    async def execute(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        return {"label": options["label"]}

    def validate_options(self, options: dict[str, Any]) -> list[str]:
        if not isinstance(options.get("label"), str) or not options["label"]:
            return ["label must be a non-empty string."]
        return []


class InMemorySequenceRepository:
    def __init__(
        self,
        *,
        sequences: dict[str, SequenceDefinition],
        runs: dict[str, SequenceRunRecord],
    ) -> None:
        self.sequences = dict(sequences)
        self.runs = dict(runs)
        self.sequence_run_counts = {sequence_id: sequence.run_count for sequence_id, sequence in sequences.items()}
        self.task_runs: list[dict[str, Any]] = []
        self._task_run_ids = count(1)

    async def get_sequence(self, sequence_id: str) -> SequenceDefinition | None:
        return self.sequences.get(sequence_id)

    async def get_run(self, run_id: str) -> SequenceRunRecord | None:
        return self.runs.get(run_id)

    async def mark_run_running(self, run_id: str) -> None:
        self.runs[run_id] = replace(self.runs[run_id], status="running", error_text=None)

    async def mark_run_completed(self, run_id: str, *, context_json: dict[str, Any]) -> None:
        self.runs[run_id] = replace(
            self.runs[run_id],
            status="completed",
            context_json=dict(context_json),
            error_text=None,
        )

    async def mark_run_failed(
        self,
        run_id: str,
        *,
        context_json: dict[str, Any],
        error_text: str,
    ) -> None:
        self.runs[run_id] = replace(
            self.runs[run_id],
            status="failed",
            context_json=dict(context_json),
            error_text=error_text,
        )

    async def increment_sequence_run_count(self, sequence_id: str) -> None:
        self.sequence_run_counts[sequence_id] = self.sequence_run_counts.get(sequence_id, 0) + 1

    async def create_running_task_run(
        self,
        *,
        run_id: str,
        task_index: int,
        task_key: str,
        module: str,
        options_json: dict[str, Any],
        input_json: dict[str, Any],
    ) -> str:
        task_run_id = f"task-run-{next(self._task_run_ids)}"
        self.task_runs.append(
            {
                "task_run_id": task_run_id,
                "run_id": run_id,
                "task_index": task_index,
                "task_key": task_key,
                "module": module,
                "status": "running",
                "options_json": dict(options_json),
                "input_json": dict(input_json),
                "output_json": None,
                "error_text": None,
                "duration_ms": None,
            }
        )
        return task_run_id

    async def create_skipped_task_run(
        self,
        *,
        run_id: str,
        task_index: int,
        task_key: str,
        module: str,
        options_json: dict[str, Any],
        input_json: dict[str, Any],
        output_json: dict[str, Any],
    ) -> str:
        task_run_id = f"task-run-{next(self._task_run_ids)}"
        self.task_runs.append(
            {
                "task_run_id": task_run_id,
                "run_id": run_id,
                "task_index": task_index,
                "task_key": task_key,
                "module": module,
                "status": "skipped",
                "options_json": dict(options_json),
                "input_json": dict(input_json),
                "output_json": dict(output_json),
                "error_text": None,
                "duration_ms": 0,
            }
        )
        return task_run_id

    async def mark_task_run_completed(
        self,
        task_run_id: str,
        *,
        output_json: dict[str, Any],
        duration_ms: int,
    ) -> None:
        task_run = self._find_task_run(task_run_id)
        task_run["status"] = "completed"
        task_run["output_json"] = dict(output_json)
        task_run["duration_ms"] = duration_ms
        task_run["error_text"] = None

    async def mark_task_run_failed(
        self,
        task_run_id: str,
        *,
        error_text: str,
        duration_ms: int,
    ) -> None:
        task_run = self._find_task_run(task_run_id)
        task_run["status"] = "failed"
        task_run["error_text"] = error_text
        task_run["duration_ms"] = duration_ms

    def _find_task_run(self, task_run_id: str) -> dict[str, Any]:
        for task_run in self.task_runs:
            if task_run["task_run_id"] == task_run_id:
                return task_run
        raise KeyError(task_run_id)


class DelayedVisibilitySequenceRepository(InMemorySequenceRepository):
    def __init__(
        self,
        *,
        sequences: dict[str, SequenceDefinition],
        runs: dict[str, SequenceRunRecord],
        hidden_get_run_calls: int,
    ) -> None:
        super().__init__(sequences=sequences, runs=runs)
        self.hidden_get_run_calls = hidden_get_run_calls

    async def get_run(self, run_id: str) -> SequenceRunRecord | None:
        if self.hidden_get_run_calls > 0:
            self.hidden_get_run_calls -= 1
            return None
        return await super().get_run(run_id)


class ContextManagerTests(unittest.TestCase):
    def test_context_manager_preserves_reserved_keys_and_keeps_control_flags(self) -> None:
        manager = ContextManager(
            {
                "_sequence_id": "sequence-1",
                "_run_id": "run-1",
                "doc_id": "doc-1",
            }
        )

        manager.merge(
            {
                "_sequence_id": "override-me",
                "doc_id": "doc-2",
                "_stop": True,
            }
        )

        self.assertEqual(manager.get("_sequence_id"), "sequence-1")
        self.assertEqual(manager.get("doc_id"), "doc-2")
        self.assertTrue(manager.get("_stop"))
        self.assertNotIn("not_jsonable", manager.snapshot_result({"not_jsonable": object()}))


class TaskPluginRegistryTests(unittest.TestCase):
    def test_validate_task_graph_reports_duplicates_unknown_modules_and_option_errors(self) -> None:
        registry = TaskPluginRegistry()
        registry.register(ValidatedPlugin)

        errors = registry.validate_task_graph(
            [
                {"key": "validated", "module": "Validated", "options": {}},
                {"key": "validated", "module": "Missing", "options": {}},
            ]
        )

        self.assertIn("Task validated: label must be a non-empty string.", errors)
        self.assertIn("Task key validated is duplicated.", errors)
        self.assertIn("Task validated references unknown module Missing.", errors)


class SequenceExecutorTests(unittest.IsolatedAsyncioTestCase):
    async def test_executor_completes_run_and_persists_task_lifecycle(self) -> None:
        executor, repository = self._build_executor(
            task_graph=[
                {
                    "key": "emit",
                    "module": "Emit",
                    "options": {"key": "value", "value": 3},
                },
                {
                    "key": "combine",
                    "module": "Combine",
                    "options": {"left_key": "value", "right_value": 4},
                },
            ]
        )

        result = await executor.execute_run("run-1")

        self.assertEqual(result["status"], "completed")
        self.assertFalse(result["stoppedEarly"])
        self.assertEqual(repository.runs["run-1"].status, "completed")
        self.assertEqual(repository.sequence_run_counts["sequence-1"], 1)
        self.assertEqual(repository.runs["run-1"].context_json["combined"], 7)
        self.assertEqual(len(repository.task_runs), 2)
        self.assertEqual(repository.task_runs[0]["status"], "completed")
        self.assertEqual(repository.task_runs[0]["input_json"]["_task_key"], "emit")
        self.assertEqual(repository.task_runs[1]["output_json"]["combined"], 7)

    async def test_executor_marks_remaining_tasks_skipped_after_stop(self) -> None:
        executor, repository = self._build_executor(
            task_graph=[
                {"key": "stop", "module": "Stop", "options": {}},
                {"key": "emit", "module": "Emit", "options": {"key": "value", "value": 10}},
            ]
        )

        result = await executor.execute_run("run-1")

        self.assertEqual(result["status"], "completed")
        self.assertTrue(result["stoppedEarly"])
        self.assertEqual(repository.task_runs[0]["status"], "completed")
        self.assertEqual(repository.task_runs[1]["status"], "skipped")
        self.assertEqual(repository.task_runs[1]["output_json"]["reason"], "sequence_stopped")

    async def test_executor_retries_retryable_errors(self) -> None:
        slept_for: list[float] = []

        async def fake_sleep(delay: float) -> None:
            slept_for.append(delay)

        executor, repository = self._build_executor(
            task_graph=[
                {
                    "key": "flaky",
                    "module": "Flaky",
                    "options": {},
                    "retry": {"attempts": 2, "delay_ms": 25},
                }
            ],
            sleep=fake_sleep,
        )

        result = await executor.execute_run("run-1")

        self.assertEqual(result["status"], "completed")
        self.assertEqual(repository.task_runs[0]["status"], "completed")
        self.assertEqual(repository.runs["run-1"].context_json["flakySucceeded"], True)
        self.assertEqual(slept_for, [0.025])

    async def test_executor_retries_transient_database_errors_without_explicit_task_retry(self) -> None:
        slept_for: list[float] = []

        async def fake_sleep(delay: float) -> None:
            slept_for.append(delay)

        executor, repository = self._build_executor(
            task_graph=[
                {
                    "key": "deadlock-once",
                    "module": "TransientDatabaseFlaky",
                    "options": {},
                }
            ],
            sleep=fake_sleep,
        )

        result = await executor.execute_run("run-1")

        self.assertEqual(result["status"], "completed")
        self.assertEqual(repository.task_runs[0]["status"], "completed")
        self.assertEqual(
            repository.runs["run-1"].context_json["transientRetrySucceeded"], True
        )
        self.assertEqual(slept_for, [1.0])

    async def test_executor_marks_timeout_as_failed_run(self) -> None:
        executor, repository = self._build_executor(
            task_graph=[
                {
                    "key": "timeout",
                    "module": "Timeout",
                    "options": {},
                    "timeout_ms": 5,
                }
            ]
        )

        with self.assertRaises(TaskExecutionError):
            await executor.execute_run("run-1")

        self.assertEqual(repository.runs["run-1"].status, "failed")
        self.assertEqual(repository.task_runs[0]["status"], "failed")
        self.assertIn("timed out", repository.task_runs[0]["error_text"])

    async def test_executor_retries_run_lookup_until_sequence_run_is_visible(self) -> None:
        slept_for: list[float] = []

        async def fake_sleep(delay: float) -> None:
            slept_for.append(delay)

        executor, repository = self._build_executor(
            task_graph=[
                {"key": "emit", "module": "Emit", "options": {"key": "value", "value": 7}}
            ],
            sleep=fake_sleep,
            repository_class=DelayedVisibilitySequenceRepository,
            repository_kwargs={"hidden_get_run_calls": 1},
        )

        result = await executor.execute_run("run-1")

        self.assertEqual(result["status"], "completed")
        self.assertEqual(repository.runs["run-1"].status, "completed")
        self.assertEqual(repository.runs["run-1"].context_json["value"], 7)
        self.assertEqual(slept_for, [0.1])

    def _build_executor(
        self,
        *,
        task_graph: list[Mapping[str, Any]],
        sleep=None,
        repository_class=InMemorySequenceRepository,
        repository_kwargs: dict[str, Any] | None = None,
    ) -> tuple[SequenceExecutor, InMemorySequenceRepository]:
        registry = TaskPluginRegistry()
        for plugin_class in (
            EmitPlugin,
            CombinePlugin,
            StopPlugin,
            FlakyPlugin,
            TransientDatabaseFlakyPlugin,
            TimeoutPlugin,
        ):
            registry.register(plugin_class)

        sequence = SequenceDefinition.from_record(
            {
                "sequence_id": "sequence-1",
                "title": "Sequence 1",
                "task_graph": task_graph,
                "status": "draft",
                "run_count": 0,
            }
        )
        run = SequenceRunRecord(
            run_id="run-1",
            sequence_id="sequence-1",
            status="pending",
            context_json={"doc_id": "doc-1"},
            trigger_type="manual",
            trigger_meta={"source": "unit-test"},
        )
        repository = repository_class(
            sequences={"sequence-1": sequence},
            runs={"run-1": run},
            **(repository_kwargs or {}),
        )
        return (
            SequenceExecutor(
                repository=repository,
                registry=registry,
                sleep=sleep,
            ),
            repository,
        )


if __name__ == "__main__":
    unittest.main()
