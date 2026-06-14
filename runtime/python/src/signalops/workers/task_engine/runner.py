from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from .executor import SequenceExecutor
from .plugins import TASK_REGISTRY, TaskPluginRegistry
from .repository import PostgresSequenceRepository, SequenceRepository


class SequenceJobPayloadError(ValueError):
    pass


def extract_sequence_job_payload(payload: Mapping[str, Any]) -> tuple[str, str]:
    run_id = payload.get("runId", payload.get("run_id"))
    sequence_id = payload.get("sequenceId", payload.get("sequence_id"))

    if not isinstance(run_id, str) or not run_id.strip():
        raise SequenceJobPayloadError("Sequence job payload must include a non-empty runId.")
    if not isinstance(sequence_id, str) or not sequence_id.strip():
        raise SequenceJobPayloadError("Sequence job payload must include a non-empty sequenceId.")

    return run_id.strip(), sequence_id.strip()


class SequenceRunJobProcessor:
    def __init__(
        self,
        *,
        repository: SequenceRepository | None = None,
        registry: TaskPluginRegistry | None = None,
        executor: SequenceExecutor | None = None,
    ):
        resolved_repository = repository or PostgresSequenceRepository()
        resolved_registry = registry or TASK_REGISTRY
        self._executor = executor or SequenceExecutor(
            repository=resolved_repository,
            registry=resolved_registry,
        )

    async def handle_payload(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        run_id, sequence_id = extract_sequence_job_payload(payload)
        result = await self._executor.execute_run(run_id)
        return {
            **result,
            "sequenceId": sequence_id,
        }
