from __future__ import annotations

import asyncio
import time
from typing import Any, Awaitable, Callable

from .context import ContextManager
from .exceptions import TaskExecutionError
from .models import SequenceDefinition, TaskDefinition
from .plugins import TaskPlugin, TaskPluginRegistry
from .repository import SequenceRepository


class SequenceExecutor:
    """Runs sequence definitions and persists run/task lifecycle."""

    def __init__(
        self,
        *,
        repository: SequenceRepository,
        registry: TaskPluginRegistry,
        sleep: Callable[[float], Awaitable[None]] | None = None,
    ):
        self._repository = repository
        self._registry = registry
        self._sleep = sleep or asyncio.sleep

    async def execute_run(self, run_id: str) -> dict[str, Any]:
        run = await self._repository.get_run(run_id)
        if run is None:
            raise ValueError(f"Sequence run {run_id} was not found.")

        sequence = await self._repository.get_sequence(run.sequence_id)
        if sequence is None:
            raise ValueError(f"Sequence {run.sequence_id} was not found.")

        context_manager = ContextManager(
            self._build_initial_context(
                run_id=run.run_id,
                sequence_id=sequence.sequence_id,
                trigger_type=run.trigger_type,
                trigger_meta=run.trigger_meta or {},
                persisted_context=run.context_json,
            )
        )

        await self._repository.mark_run_running(run_id)

        try:
            for task_index, task in enumerate(sequence.task_graph):
                task_context = context_manager.task_view(
                    task_key=task.key,
                    task_index=task_index,
                )
                input_snapshot = task_context

                if not task.enabled:
                    await self._repository.create_skipped_task_run(
                        run_id=run_id,
                        task_index=task_index,
                        task_key=task.key,
                        module=task.module,
                        options_json=task.options,
                        input_json=input_snapshot,
                        output_json={"skipped": True, "reason": "disabled"},
                    )
                    continue

                task_run_id = await self._repository.create_running_task_run(
                    run_id=run_id,
                    task_index=task_index,
                    task_key=task.key,
                    module=task.module,
                    options_json=task.options,
                    input_json=input_snapshot,
                )
                started_at = time.perf_counter()

                try:
                    result = await self._execute_task(task=task, context=task_context)
                except Exception as error:
                    duration_ms = self._duration_ms_since(started_at)
                    await self._repository.mark_task_run_failed(
                        task_run_id,
                        error_text=str(error),
                        duration_ms=duration_ms,
                    )
                    await self._repository.mark_run_failed(
                        run_id,
                        context_json=context_manager.snapshot(),
                        error_text=str(error),
                    )
                    raise

                context_manager.merge(result)
                duration_ms = self._duration_ms_since(started_at)
                await self._repository.mark_task_run_completed(
                    task_run_id,
                    output_json=context_manager.snapshot_result(result),
                    duration_ms=duration_ms,
                )

                if context_manager.get("_stop"):
                    await self._mark_remaining_tasks_skipped(
                        sequence=sequence,
                        start_index=task_index + 1,
                        run_id=run_id,
                        context_manager=context_manager,
                    )
                    await self._repository.mark_run_completed(
                        run_id,
                        context_json=context_manager.snapshot(),
                    )
                    await self._repository.increment_sequence_run_count(sequence.sequence_id)
                    return {
                        "runId": run_id,
                        "status": "completed",
                        "stoppedEarly": True,
                        "context": context_manager.snapshot(),
                    }

            await self._repository.mark_run_completed(
                run_id,
                context_json=context_manager.snapshot(),
            )
            await self._repository.increment_sequence_run_count(sequence.sequence_id)
            return {
                "runId": run_id,
                "status": "completed",
                "stoppedEarly": False,
                "context": context_manager.snapshot(),
            }
        except Exception:
            raise

    def _build_initial_context(
        self,
        *,
        run_id: str,
        sequence_id: str,
        trigger_type: str,
        trigger_meta: dict[str, Any],
        persisted_context: dict[str, Any],
    ) -> dict[str, Any]:
        initial_context = {
            "_sequence_id": sequence_id,
            "_run_id": run_id,
            "_trigger_type": trigger_type,
            "_trigger_meta": dict(trigger_meta),
        }

        for key, value in persisted_context.items():
            if key.startswith("_"):
                continue
            initial_context[key] = value

        return initial_context

    async def _execute_task(
        self,
        *,
        task: TaskDefinition,
        context: dict[str, Any],
    ) -> dict[str, Any]:
        plugin = self._registry.create(task.module)
        attempts = task.retry.attempts
        delay_seconds = task.retry.delay_ms / 1000

        for attempt in range(1, attempts + 1):
            try:
                await plugin.on_before_execute(task.options, context)
                result = await asyncio.wait_for(
                    plugin.execute(task.options, context),
                    timeout=task.timeout_ms / 1000,
                )
                if not isinstance(result, dict):
                    raise TaskExecutionError(
                        f"Task {task.key} must return a dict result.",
                        retryable=False,
                    )
                await plugin.on_after_execute(task.options, context, result)
                return result
            except asyncio.TimeoutError as error:
                wrapped = TaskExecutionError(
                    f"Task {task.key} timed out after {task.timeout_ms}ms.",
                    retryable=False,
                )
                await self._notify_plugin_error(plugin, task.options, context, wrapped)
                raise wrapped from error
            except TaskExecutionError as error:
                await self._notify_plugin_error(plugin, task.options, context, error)
                if error.retryable and attempt < attempts:
                    await self._sleep(delay_seconds)
                    continue
                raise
            except Exception as error:
                await self._notify_plugin_error(plugin, task.options, context, error)
                raise

        raise RuntimeError(f"Task {task.key} exhausted retries without returning.")

    async def _mark_remaining_tasks_skipped(
        self,
        *,
        sequence: SequenceDefinition,
        start_index: int,
        run_id: str,
        context_manager: ContextManager,
    ) -> None:
        snapshot = context_manager.snapshot()

        for task_index, task in enumerate(sequence.task_graph[start_index:], start=start_index):
            await self._repository.create_skipped_task_run(
                run_id=run_id,
                task_index=task_index,
                task_key=task.key,
                module=task.module,
                options_json=task.options,
                input_json=snapshot,
                output_json={"skipped": True, "reason": "sequence_stopped"},
            )

    async def _notify_plugin_error(
        self,
        plugin: TaskPlugin,
        options: dict[str, Any],
        context: dict[str, Any],
        error: Exception,
    ) -> None:
        try:
            await plugin.on_error(options, context, error)
        except Exception:
            return None

    def _duration_ms_since(self, started_at: float) -> int:
        return max(0, int((time.perf_counter() - started_at) * 1000))
