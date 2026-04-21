import unittest
from dataclasses import replace
from datetime import datetime, timezone
from itertools import count
from typing import Any

from services.workers.app.task_engine import (
    parse_cron_expression,
    SequenceCronScheduler,
    SequenceDefinition,
    SequenceRunJobProcessor,
    SequenceRunRecord,
    TaskPlugin,
    TaskPluginRegistry,
)


class EmitPlugin(TaskPlugin):
    name = "test.emit"
    description = "Emit a fixed value for scheduler tests."
    category = "test"

    async def execute(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        return {
            "emitted": options.get("value", "ok"),
            "doc_id": context.get("doc_id"),
        }


class FakeCronRepository:
    def __init__(self, sequences: list[SequenceDefinition]) -> None:
        self.sequences = list(sequences)
        self.created_runs: list[dict[str, Any]] = []
        self.failed_runs: list[dict[str, Any]] = []
        self._ids = count(1)

    async def list_active_cron_sequences(self) -> list[SequenceDefinition]:
        return list(self.sequences)

    async def create_pending_cron_run(
        self,
        *,
        sequence_id: str,
        scheduled_for: datetime,
        trigger_meta: dict[str, Any],
    ) -> str | None:
        scheduled_for_text = scheduled_for.isoformat()
        for created in self.created_runs:
            if (
                created["sequence_id"] == sequence_id
                and created["scheduled_for"] == scheduled_for_text
            ):
                return None

        run_id = f"cron-run-{next(self._ids)}"
        self.created_runs.append(
            {
                "run_id": run_id,
                "sequence_id": sequence_id,
                "scheduled_for": scheduled_for_text,
                "trigger_meta": dict(trigger_meta),
            }
        )
        return run_id

    async def mark_run_failed(
        self,
        run_id: str,
        *,
        context_json: dict[str, Any],
        error_text: str,
    ) -> None:
        self.failed_runs.append(
            {
                "run_id": run_id,
                "context_json": dict(context_json),
                "error_text": error_text,
            }
        )


class InMemoryRunRepository:
    def __init__(
        self,
        *,
        sequences: dict[str, SequenceDefinition],
        runs: dict[str, SequenceRunRecord],
    ) -> None:
        self.sequences = dict(sequences)
        self.runs = dict(runs)
        self.task_runs: list[dict[str, Any]] = []
        self._task_run_ids = count(1)

    async def get_sequence(self, sequence_id: str) -> SequenceDefinition | None:
        return self.sequences.get(sequence_id)

    async def get_run(self, run_id: str) -> SequenceRunRecord | None:
        return self.runs.get(run_id)

    async def mark_run_running(self, run_id: str) -> bool:
        run = self.runs[run_id]
        if run.status != "pending":
            return False
        self.runs[run_id] = replace(run, status="running", error_text=None)
        return True

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
        return None

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
                "input_json": dict(input_json),
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
                "input_json": dict(input_json),
                "output_json": dict(output_json),
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
        for task_run in self.task_runs:
            if task_run["task_run_id"] == task_run_id:
                task_run["status"] = "completed"
                task_run["output_json"] = dict(output_json)
                task_run["duration_ms"] = duration_ms
                return
        raise KeyError(task_run_id)

    async def mark_task_run_failed(
        self,
        task_run_id: str,
        *,
        error_text: str,
        duration_ms: int,
    ) -> None:
        for task_run in self.task_runs:
            if task_run["task_run_id"] == task_run_id:
                task_run["status"] = "failed"
                task_run["error_text"] = error_text
                task_run["duration_ms"] = duration_ms
                return
        raise KeyError(task_run_id)


class CronExpressionTests(unittest.TestCase):
    def test_parse_cron_expression_supports_steps_ranges_and_named_weekdays(self) -> None:
        expression = parse_cron_expression("*/15 9-17 * * mon-fri")

        self.assertTrue(
            expression.matches(datetime(2026, 3, 27, 9, 30, tzinfo=timezone.utc))
        )
        self.assertFalse(
            expression.matches(datetime(2026, 3, 28, 9, 30, tzinfo=timezone.utc))
        )
        self.assertFalse(
            expression.matches(datetime(2026, 3, 27, 9, 31, tzinfo=timezone.utc))
        )

    def test_parse_cron_expression_rejects_invalid_token(self) -> None:
        with self.assertRaises(ValueError):
            parse_cron_expression("bad * * * *")


class SequenceCronSchedulerTests(unittest.IsolatedAsyncioTestCase):
    async def test_tick_enqueues_matching_active_sequence_once(self) -> None:
        sequence = SequenceDefinition.from_record(
            {
                "sequence_id": "sequence-1",
                "title": "Every ten minutes",
                "task_graph": [],
                "status": "active",
                "cron": "*/10 * * * *",
            }
        )
        repository = FakeCronRepository([sequence])
        dispatched: list[tuple[str, str]] = []
        scheduler = SequenceCronScheduler(
            repository=repository,
            enqueue_run=lambda run_id, sequence_id: _record_dispatch(
                dispatched,
                run_id,
                sequence_id,
            ),
            now=lambda: datetime(2026, 3, 27, 12, 20, 42, tzinfo=timezone.utc),
        )

        outcomes = await scheduler.tick()
        duplicate_outcomes = await scheduler.tick()

        self.assertEqual(len(outcomes), 1)
        self.assertEqual(outcomes[0]["status"], "enqueued")
        self.assertEqual(dispatched, [("cron-run-1", "sequence-1")])
        self.assertEqual(duplicate_outcomes, [])

    async def test_tick_marks_failed_dispatch_when_enqueue_raises(self) -> None:
        sequence = SequenceDefinition.from_record(
            {
                "sequence_id": "sequence-2",
                "title": "Hourly",
                "task_graph": [],
                "status": "active",
                "cron": "0 * * * *",
            }
        )
        repository = FakeCronRepository([sequence])

        async def fail_enqueue(_run_id: str, _sequence_id: str) -> None:
            raise RuntimeError("queue unavailable")

        scheduler = SequenceCronScheduler(
            repository=repository,
            enqueue_run=fail_enqueue,
            now=lambda: datetime(2026, 3, 27, 13, 0, 1, tzinfo=timezone.utc),
        )

        outcomes = await scheduler.tick()

        self.assertEqual(len(outcomes), 1)
        self.assertEqual(outcomes[0]["status"], "failed_dispatch")
        self.assertEqual(repository.failed_runs[0]["run_id"], "cron-run-1")
        self.assertIn("queue unavailable", repository.failed_runs[0]["error_text"])


class SequenceRunJobProcessorTests(unittest.IsolatedAsyncioTestCase):
    async def test_handle_payload_accepts_snake_case_ids_and_executes_run(self) -> None:
        sequence = SequenceDefinition.from_record(
            {
                "sequence_id": "sequence-processor",
                "title": "Processor",
                "task_graph": [
                    {
                        "key": "emit",
                        "module": "test.emit",
                        "options": {"value": "ok"},
                    }
                ],
                "status": "active",
            }
        )
        run = SequenceRunRecord.from_record(
            {
                "run_id": "run-processor",
                "sequence_id": "sequence-processor",
                "status": "pending",
                "context_json": {"doc_id": "doc-1"},
                "trigger_type": "agent",
                "trigger_meta": {"source": "agent_api"},
            }
        )
        repository = InMemoryRunRepository(
            sequences={sequence.sequence_id: sequence},
            runs={run.run_id: run},
        )
        registry = TaskPluginRegistry()
        registry.register(EmitPlugin)
        processor = SequenceRunJobProcessor(repository=repository, registry=registry)

        result = await processor.handle_payload(
            {
                "run_id": "run-processor",
                "sequence_id": "sequence-processor",
            }
        )

        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["sequenceId"], "sequence-processor")
        self.assertEqual(repository.runs["run-processor"].status, "completed")
        self.assertEqual(repository.runs["run-processor"].context_json["emitted"], "ok")


async def _record_dispatch(
    dispatched: list[tuple[str, str]],
    run_id: str,
    sequence_id: str,
) -> None:
    dispatched.append((run_id, sequence_id))


if __name__ == "__main__":
    unittest.main()
