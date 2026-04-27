from typing import Any

from fastapi import FastAPI, Query


def register_sequence_routes(app: FastAPI, deps: dict[str, Any]) -> None:
    SequenceCreatePayload = deps["SequenceCreatePayload"]
    SequenceManualRunPayload = deps["SequenceManualRunPayload"]
    SequenceRetryRunPayload = deps["SequenceRetryRunPayload"]
    SequenceUpdatePayload = deps["SequenceUpdatePayload"]
    SequenceCancelPayload = deps["SequenceCancelPayload"]
    AgentSequenceCreatePayload = deps["AgentSequenceCreatePayload"]
    SequenceConflictError = deps["SequenceConflictError"]
    SequenceDispatchError = deps["SequenceDispatchError"]
    SequenceNotFoundError = deps["SequenceNotFoundError"]
    SequenceValidationError = deps["SequenceValidationError"]

    @app.get("/maintenance/sequences")
    def list_sequences(
        limit: int = Query(default=20, ge=1, le=100),
        page: int | None = Query(default=None, ge=1),
        page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
    ) -> dict[str, Any] | list[dict[str, Any]]:
        return deps["list_sequences_page"](limit=limit, page=page, page_size=page_size)

    @app.get("/maintenance/sequences/{sequence_id}")
    def get_sequence(sequence_id: str) -> dict[str, Any]:
        try:
            return deps["get_sequence_definition"](sequence_id)
        except SequenceNotFoundError as error:
            deps["raise_sequence_http_exception"](error)

    @app.post("/maintenance/sequences", status_code=201)
    def create_sequence(payload: SequenceCreatePayload) -> dict[str, Any]:
        try:
            return deps["create_sequence_definition"](payload)
        except (
            SequenceConflictError,
            SequenceValidationError,
        ) as error:
            deps["raise_sequence_http_exception"](error)

    @app.patch("/maintenance/sequences/{sequence_id}")
    def update_sequence(
        sequence_id: str,
        payload: SequenceUpdatePayload,
    ) -> dict[str, Any]:
        try:
            return deps["update_sequence_definition"](sequence_id, payload)
        except (
            SequenceConflictError,
            SequenceNotFoundError,
            SequenceValidationError,
        ) as error:
            deps["raise_sequence_http_exception"](error)

    @app.delete("/maintenance/sequences/{sequence_id}")
    def delete_sequence(sequence_id: str) -> dict[str, Any]:
        try:
            return deps["archive_sequence_definition"](sequence_id)
        except SequenceNotFoundError as error:
            deps["raise_sequence_http_exception"](error)

    @app.get("/maintenance/sequence-plugins")
    def get_sequence_plugins() -> list[dict[str, Any]]:
        return deps["list_sequence_plugins"]()

    @app.get("/maintenance/agent/sequence-tools")
    def get_agent_sequence_tools() -> dict[str, Any]:
        return deps["list_agent_sequence_tools"]()

    @app.post("/maintenance/agent/sequences", status_code=201)
    def create_agent_sequence(payload: AgentSequenceCreatePayload) -> dict[str, Any]:
        try:
            return deps["create_agent_sequence_request"](payload)
        except (
            SequenceConflictError,
            SequenceDispatchError,
            SequenceNotFoundError,
            SequenceValidationError,
        ) as error:
            deps["raise_sequence_http_exception"](error)

    @app.post("/maintenance/sequences/{sequence_id}/runs", status_code=202)
    def request_sequence_run(
        sequence_id: str,
        payload: SequenceManualRunPayload,
    ) -> dict[str, Any]:
        try:
            return deps["create_sequence_run_request"](sequence_id, payload)
        except (
            SequenceConflictError,
            SequenceDispatchError,
            SequenceNotFoundError,
            SequenceValidationError,
        ) as error:
            deps["raise_sequence_http_exception"](error)

    @app.get("/maintenance/sequence-runs/{run_id}")
    def get_sequence_run_status(run_id: str) -> dict[str, Any]:
        try:
            return deps["get_sequence_run"](run_id)
        except SequenceNotFoundError as error:
            deps["raise_sequence_http_exception"](error)

    @app.get("/maintenance/sequence-runs/{run_id}/task-runs")
    def get_sequence_run_task_runs(run_id: str) -> list[dict[str, Any]]:
        try:
            return deps["list_sequence_task_runs"](run_id)
        except SequenceNotFoundError as error:
            deps["raise_sequence_http_exception"](error)

    @app.post("/maintenance/sequence-runs/{run_id}/cancel")
    def cancel_sequence_run(
        run_id: str,
        payload: SequenceCancelPayload | None = None,
    ) -> dict[str, Any]:
        try:
            return deps["cancel_sequence_run_request"](
                run_id,
                reason=payload.reason if payload is not None else None,
            )
        except (
            SequenceConflictError,
            SequenceNotFoundError,
        ) as error:
            deps["raise_sequence_http_exception"](error)

    @app.post("/maintenance/sequence-runs/{run_id}/retry", status_code=202)
    def retry_sequence_run(
        run_id: str,
        payload: SequenceRetryRunPayload | None = None,
    ) -> dict[str, Any]:
        try:
            return deps["retry_sequence_run_request"](
                run_id,
                payload or SequenceRetryRunPayload(),
            )
        except (
            SequenceConflictError,
            SequenceDispatchError,
            SequenceNotFoundError,
            SequenceValidationError,
        ) as error:
            deps["raise_sequence_http_exception"](error)
