from __future__ import annotations

from collections.abc import Mapping
from typing import Any


def raise_sequence_http_exception(namespace: Mapping[str, Any], error: Exception) -> None:
    http_exception_type = namespace["HTTPException"]
    if isinstance(error, namespace["SequenceNotFoundError"]):
        raise http_exception_type(status_code=404, detail=str(error)) from error
    if isinstance(error, namespace["SequenceConflictError"]):
        raise http_exception_type(status_code=409, detail=str(error)) from error
    if isinstance(error, namespace["SequenceValidationError"]):
        raise http_exception_type(status_code=422, detail=error.errors) from error
    if isinstance(error, namespace["SequenceDispatchError"]):
        raise http_exception_type(status_code=503, detail=str(error)) from error
    raise error


def list_sequences(
    namespace: Mapping[str, Any],
    *,
    limit: int = 20,
    page: int | None = None,
    page_size: int | None = None,
) -> dict[str, Any] | list[dict[str, Any]]:
    return namespace["list_sequences_page"](limit=limit, page=page, page_size=page_size)


def get_sequence(namespace: Mapping[str, Any], sequence_id: str) -> dict[str, Any]:
    try:
        return namespace["get_sequence_definition"](sequence_id)
    except namespace["SequenceNotFoundError"] as error:
        namespace["raise_sequence_http_exception"](error)


def create_sequence(namespace: Mapping[str, Any], payload: Any) -> dict[str, Any]:
    try:
        return namespace["create_sequence_definition"](payload)
    except (
        namespace["SequenceConflictError"],
        namespace["SequenceValidationError"],
    ) as error:
        namespace["raise_sequence_http_exception"](error)


def update_sequence(
    namespace: Mapping[str, Any],
    sequence_id: str,
    payload: Any,
) -> dict[str, Any]:
    try:
        return namespace["update_sequence_definition"](sequence_id, payload)
    except (
        namespace["SequenceConflictError"],
        namespace["SequenceNotFoundError"],
        namespace["SequenceValidationError"],
    ) as error:
        namespace["raise_sequence_http_exception"](error)


def delete_sequence(namespace: Mapping[str, Any], sequence_id: str) -> dict[str, Any]:
    try:
        return namespace["archive_sequence_definition"](sequence_id)
    except namespace["SequenceNotFoundError"] as error:
        namespace["raise_sequence_http_exception"](error)


def get_sequence_plugins(namespace: Mapping[str, Any]) -> list[dict[str, Any]]:
    return namespace["list_sequence_plugins"]()


def get_agent_sequence_tools(namespace: Mapping[str, Any]) -> dict[str, Any]:
    return namespace["list_agent_sequence_tools"]()


def create_agent_sequence(namespace: Mapping[str, Any], payload: Any) -> dict[str, Any]:
    try:
        return namespace["create_agent_sequence_request"](payload)
    except (
        namespace["SequenceConflictError"],
        namespace["SequenceDispatchError"],
        namespace["SequenceNotFoundError"],
        namespace["SequenceValidationError"],
    ) as error:
        namespace["raise_sequence_http_exception"](error)


def request_sequence_run(
    namespace: Mapping[str, Any],
    sequence_id: str,
    payload: Any,
) -> dict[str, Any]:
    try:
        return namespace["create_sequence_run_request"](sequence_id, payload)
    except (
        namespace["SequenceConflictError"],
        namespace["SequenceDispatchError"],
        namespace["SequenceNotFoundError"],
        namespace["SequenceValidationError"],
    ) as error:
        namespace["raise_sequence_http_exception"](error)


def get_sequence_run_status(namespace: Mapping[str, Any], run_id: str) -> dict[str, Any]:
    try:
        return namespace["get_sequence_run"](run_id)
    except namespace["SequenceNotFoundError"] as error:
        namespace["raise_sequence_http_exception"](error)


def get_sequence_run_task_runs(namespace: Mapping[str, Any], run_id: str) -> list[dict[str, Any]]:
    try:
        return namespace["list_sequence_task_runs"](run_id)
    except namespace["SequenceNotFoundError"] as error:
        namespace["raise_sequence_http_exception"](error)


def cancel_sequence_run(
    namespace: Mapping[str, Any],
    run_id: str,
    payload: Any | None = None,
) -> dict[str, Any]:
    try:
        return namespace["cancel_sequence_run_request"](
            run_id,
            reason=payload.reason if payload is not None else None,
        )
    except (
        namespace["SequenceConflictError"],
        namespace["SequenceNotFoundError"],
    ) as error:
        namespace["raise_sequence_http_exception"](error)


def retry_sequence_run(
    namespace: Mapping[str, Any],
    run_id: str,
    payload: Any | None = None,
) -> dict[str, Any]:
    try:
        return namespace["retry_sequence_run_request"](
            run_id,
            payload or namespace["SequenceRetryRunPayload"](),
        )
    except (
        namespace["SequenceConflictError"],
        namespace["SequenceDispatchError"],
        namespace["SequenceNotFoundError"],
        namespace["SequenceValidationError"],
    ) as error:
        namespace["raise_sequence_http_exception"](error)


def request_signal_candidate_enrichment_retry_route(
    namespace: Mapping[str, Any],
    doc_id: str,
    payload: Any | None = None,
) -> dict[str, Any]:
    try:
        return namespace["request_signal_candidate_enrichment_retry"](
            doc_id,
            payload or namespace["SignalCandidateEnrichmentRetryPayload"].model_validate({}),
        )
    except (
        namespace["SequenceConflictError"],
        namespace["SequenceDispatchError"],
        namespace["SequenceNotFoundError"],
        namespace["SequenceValidationError"],
    ) as error:
        namespace["raise_sequence_http_exception"](error)


def request_content_item_enrichment_retry_route(
    namespace: Mapping[str, Any],
    content_item_id: str,
    payload: Any | None = None,
) -> dict[str, Any]:
    origin_type, origin_id = namespace["parse_content_item_id"](content_item_id)
    if origin_type != "signal_candidate":
        raise namespace["HTTPException"](
            status_code=409,
            detail="Manual retry is only supported for editorial content items in the current runtime.",
        )
    return namespace["request_signal_candidate_enrichment_retry_route"](origin_id, payload)
