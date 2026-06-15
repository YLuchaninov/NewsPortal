from __future__ import annotations

import uuid
from typing import Any, Literal, Mapping

import psycopg
from fastapi import HTTPException
from psycopg.rows import dict_row

from signalops.api import sequence_commands as _sequence_commands
from signalops.api import sequence_payloads as _sequence_payloads
from signalops.api import sequence_read_model as _sequence_read_model
from signalops.api import sequence_route_compat as _sequence_route_compat
from signalops.api.content_selection_read_model import parse_content_item_id
from signalops.api.database import build_database_url, query_all, query_one
from signalops.api.main_common import query_count
from signalops.api.pagination import build_paginated_response, resolve_pagination
from signalops.api.sequence_worker_boundary import (
    RESERVED_CONTEXT_KEYS,
    TASK_REGISTRY,
    SequenceQueueDispatchError,
    dispatch_sequence_run_job,
    parse_cron_expression,
)
from signalops.api.status_constants import SEQUENCE_RUN_CANCELLABLE_STATUSES


SequenceValidationError = _sequence_read_model.SequenceValidationError
SequenceNotFoundError = _sequence_read_model.SequenceNotFoundError
SequenceConflictError = _sequence_read_model.SequenceConflictError

SequenceDispatchError = _sequence_read_model.SequenceDispatchError
SequenceCreatePayload = _sequence_payloads.SequenceCreatePayload
SequenceUpdatePayload = _sequence_payloads.SequenceUpdatePayload
SequenceManualRunPayload = _sequence_payloads.SequenceManualRunPayload
SequenceRetryRunPayload = _sequence_payloads.SequenceRetryRunPayload
AgentSequenceCreatePayload = _sequence_payloads.AgentSequenceCreatePayload
SequenceCancelPayload = _sequence_payloads.SequenceCancelPayload
SignalCandidateEnrichmentRetryPayload = _sequence_payloads.SignalCandidateEnrichmentRetryPayload


def validate_sequence_task_graph(task_graph: list[dict[str, Any]]) -> None:
    return _sequence_read_model.validate_sequence_task_graph(
        task_graph,
        task_registry=TASK_REGISTRY,
    )


def validate_sequence_context_json(context_json: dict[str, Any]) -> None:
    return _sequence_read_model.validate_sequence_context_json(
        context_json,
        reserved_context_keys=RESERVED_CONTEXT_KEYS,
    )


def sanitize_sequence_retry_context(context_json: Mapping[str, Any] | None) -> dict[str, Any]:
    return _sequence_read_model.sanitize_sequence_retry_context(
        context_json,
        reserved_context_keys=RESERVED_CONTEXT_KEYS,
    )


def validate_trigger_meta(trigger_meta: dict[str, Any]) -> None:
    return _sequence_read_model.validate_trigger_meta(trigger_meta)


def validate_sequence_editor_state(editor_state: dict[str, Any] | None) -> None:
    return _sequence_read_model.validate_sequence_editor_state(editor_state)


def normalize_sequence_cron(cron: str | None) -> str | None:
    return _sequence_read_model.normalize_sequence_cron(
        cron,
        parse_cron_expression_func=parse_cron_expression,
    )


def dump_json_value(value: Any, field_name: str) -> str:
    return _sequence_read_model.dump_json_value(value, field_name)


def sequence_select_sql() -> str:
    return _sequence_read_model.sequence_select_sql()


def sequence_run_select_sql() -> str:
    return _sequence_read_model.sequence_run_select_sql()


def list_sequence_plugins() -> list[dict[str, Any]]:
    return _sequence_read_model.list_sequence_plugins(task_registry=TASK_REGISTRY)


def list_sequences_page(
    *,
    limit: int,
    page: int | None,
    page_size: int | None,
) -> dict[str, Any] | list[dict[str, Any]]:
    return _sequence_read_model.list_sequences_page(
        limit=limit,
        page=page,
        page_size=page_size,
        sequence_select_sql_func=sequence_select_sql,
        resolve_pagination_func=resolve_pagination,
        query_all_func=query_all,
        query_count_func=query_count,
        build_paginated_response_func=build_paginated_response,
    )


def get_sequence_definition(sequence_id: str) -> dict[str, Any]:
    return _sequence_read_model.get_sequence_definition(
        sequence_id,
        sequence_select_sql_func=sequence_select_sql,
        query_one_func=query_one,
    )


def create_sequence_definition(payload: SequenceCreatePayload) -> dict[str, Any]:
    return _sequence_commands.create_sequence_definition(
        payload,
        validate_sequence_task_graph_func=validate_sequence_task_graph,
        validate_sequence_editor_state_func=validate_sequence_editor_state,
        normalize_sequence_cron_func=normalize_sequence_cron,
        dump_json_value_func=dump_json_value,
        build_database_url_func=build_database_url,
        connect_func=psycopg.connect,
        dict_row_value=dict_row,
    )


def update_sequence_definition(
    sequence_id: str,
    payload: SequenceUpdatePayload,
) -> dict[str, Any]:
    return _sequence_commands.update_sequence_definition(
        sequence_id,
        payload,
        validate_sequence_task_graph_func=validate_sequence_task_graph,
        validate_sequence_editor_state_func=validate_sequence_editor_state,
        normalize_sequence_cron_func=normalize_sequence_cron,
        dump_json_value_func=dump_json_value,
        build_database_url_func=build_database_url,
        connect_func=psycopg.connect,
        dict_row_value=dict_row,
    )


def archive_sequence_definition(sequence_id: str) -> dict[str, Any]:
    return _sequence_commands.archive_sequence_definition(
        sequence_id,
        build_database_url_func=build_database_url,
        connect_func=psycopg.connect,
        dict_row_value=dict_row,
    )


def enqueue_sequence_run_job(run_id: str, sequence_id: str) -> None:
    return _sequence_commands.enqueue_sequence_run_job(
        run_id,
        sequence_id,
        dispatch_sequence_run_job_func=dispatch_sequence_run_job,
        sequence_queue_dispatch_error_type=SequenceQueueDispatchError,
    )


def mark_sequence_run_failed_dispatch(run_id: str, error_text: str) -> None:
    return _sequence_commands.mark_sequence_run_failed_dispatch(
        run_id,
        error_text,
        build_database_url_func=build_database_url,
        connect_func=psycopg.connect,
        dict_row_value=dict_row,
    )


def create_sequence_run_request_for_trigger(
    sequence_id: str,
    *,
    context_json: dict[str, Any],
    trigger_meta: dict[str, Any],
    trigger_type: Literal["manual", "cron", "agent", "api", "event"],
    retry_of_run_id: str | None = None,
) -> dict[str, Any]:
    return _sequence_commands.create_sequence_run_request_for_trigger(
        sequence_id,
        context_json=context_json,
        trigger_meta=trigger_meta,
        trigger_type=trigger_type,
        retry_of_run_id=retry_of_run_id,
        uuid4_func=uuid.uuid4,
        validate_sequence_context_json_func=validate_sequence_context_json,
        validate_trigger_meta_func=validate_trigger_meta,
        dump_json_value_func=dump_json_value,
        build_database_url_func=build_database_url,
        connect_func=psycopg.connect,
        dict_row_value=dict_row,
        enqueue_sequence_run_job_func=enqueue_sequence_run_job,
        mark_sequence_run_failed_dispatch_func=mark_sequence_run_failed_dispatch,
        get_sequence_run_func=get_sequence_run,
    )


def create_sequence_run_request(
    sequence_id: str,
    payload: SequenceManualRunPayload,
) -> dict[str, Any]:
    return _sequence_commands.create_sequence_run_request(
        sequence_id,
        payload,
        create_sequence_run_request_for_trigger_func=create_sequence_run_request_for_trigger,
    )


def retry_sequence_run_request(
    run_id: str,
    payload: SequenceRetryRunPayload,
) -> dict[str, Any]:
    return _sequence_commands.retry_sequence_run_request(
        run_id,
        payload,
        get_sequence_run_func=get_sequence_run,
        sanitize_sequence_retry_context_func=sanitize_sequence_retry_context,
        validate_sequence_context_json_func=validate_sequence_context_json,
        create_sequence_run_request_for_trigger_func=create_sequence_run_request_for_trigger,
    )


def get_active_sequence_for_trigger(trigger_event: str) -> dict[str, Any]:
    return _sequence_commands.get_active_sequence_for_trigger(
        trigger_event,
        query_one_func=query_one,
    )


def ensure_published_signal_candidate_retry_event(*, event_id: str, doc_id: str) -> None:
    return _sequence_commands.ensure_published_signal_candidate_retry_event(
        event_id=event_id,
        doc_id=doc_id,
        dump_json_value_func=dump_json_value,
        build_database_url_func=build_database_url,
        connect_func=psycopg.connect,
        dict_row_value=dict_row,
    )


def request_signal_candidate_enrichment_retry(
    doc_id: str,
    payload: SignalCandidateEnrichmentRetryPayload | None = None,
) -> dict[str, Any]:
    return _sequence_commands.request_signal_candidate_enrichment_retry(
        doc_id,
        payload,
        query_one_func=query_one,
        get_active_sequence_for_trigger_func=get_active_sequence_for_trigger,
        uuid4_func=uuid.uuid4,
        ensure_published_signal_candidate_retry_event_func=ensure_published_signal_candidate_retry_event,
        create_sequence_run_request_for_trigger_func=create_sequence_run_request_for_trigger,
    )


def list_agent_sequence_tools() -> dict[str, Any]:
    return _sequence_commands.list_agent_sequence_tools(
        list_sequence_plugins_func=list_sequence_plugins,
    )


def create_agent_sequence_request(payload: AgentSequenceCreatePayload) -> dict[str, Any]:
    return _sequence_commands.create_agent_sequence_request(
        payload,
        sequence_create_payload_type=SequenceCreatePayload,
        create_sequence_definition_func=create_sequence_definition,
        create_sequence_run_request_for_trigger_func=create_sequence_run_request_for_trigger,
    )


def _sequence_route_namespace() -> dict[str, Any]:
    return {
        "HTTPException": HTTPException,
        "SequenceNotFoundError": SequenceNotFoundError,
        "SequenceConflictError": SequenceConflictError,
        "SequenceValidationError": SequenceValidationError,
        "SequenceDispatchError": SequenceDispatchError,
        "SequenceRetryRunPayload": SequenceRetryRunPayload,
        "SignalCandidateEnrichmentRetryPayload": SignalCandidateEnrichmentRetryPayload,
        "archive_sequence_definition": archive_sequence_definition,
        "cancel_sequence_run_request": cancel_sequence_run_request,
        "create_agent_sequence_request": create_agent_sequence_request,
        "create_sequence_definition": create_sequence_definition,
        "create_sequence_run_request": create_sequence_run_request,
        "get_sequence_definition": get_sequence_definition,
        "get_sequence_run": get_sequence_run,
        "list_agent_sequence_tools": list_agent_sequence_tools,
        "list_sequence_plugins": list_sequence_plugins,
        "list_sequence_task_runs": list_sequence_task_runs,
        "list_sequences_page": list_sequences_page,
        "parse_content_item_id": parse_content_item_id,
        "raise_sequence_http_exception": raise_sequence_http_exception,
        "request_content_item_enrichment_retry_route": request_content_item_enrichment_retry_route,
        "request_signal_candidate_enrichment_retry": request_signal_candidate_enrichment_retry,
        "request_signal_candidate_enrichment_retry_route": request_signal_candidate_enrichment_retry_route,
        "retry_sequence_run_request": retry_sequence_run_request,
        "update_sequence_definition": update_sequence_definition,
    }


def get_sequence_run(run_id: str) -> dict[str, Any]:
    return _sequence_read_model.get_sequence_run(
        run_id,
        sequence_run_select_sql_func=sequence_run_select_sql,
        query_one_func=query_one,
    )


def cancel_sequence_run_request(run_id: str, reason: str | None = None) -> dict[str, Any]:
    return _sequence_commands.cancel_sequence_run_request(
        run_id,
        reason=reason,
        cancellable_statuses=SEQUENCE_RUN_CANCELLABLE_STATUSES,
        build_database_url_func=build_database_url,
        connect_func=psycopg.connect,
        dict_row_value=dict_row,
        get_sequence_run_func=get_sequence_run,
    )


def list_sequence_task_runs(run_id: str) -> list[dict[str, Any]]:
    return _sequence_read_model.list_sequence_task_runs(
        run_id,
        get_sequence_run_func=get_sequence_run,
        query_all_func=query_all,
    )


def raise_sequence_http_exception(error: Exception) -> None:
    return _sequence_route_compat.raise_sequence_http_exception(_sequence_route_namespace(), error)


def list_sequences(
    limit: int = 20,
    page: int | None = None,
    page_size: int | None = None,
) -> dict[str, Any] | list[dict[str, Any]]:
    return _sequence_route_compat.list_sequences(
        _sequence_route_namespace(),
        limit=limit,
        page=page,
        page_size=page_size,
    )


def get_sequence(sequence_id: str) -> dict[str, Any]:
    return _sequence_route_compat.get_sequence(_sequence_route_namespace(), sequence_id)


def create_sequence(payload: SequenceCreatePayload) -> dict[str, Any]:
    return _sequence_route_compat.create_sequence(_sequence_route_namespace(), payload)


def update_sequence(
    sequence_id: str,
    payload: SequenceUpdatePayload,
) -> dict[str, Any]:
    return _sequence_route_compat.update_sequence(_sequence_route_namespace(), sequence_id, payload)


def delete_sequence(sequence_id: str) -> dict[str, Any]:
    return _sequence_route_compat.delete_sequence(_sequence_route_namespace(), sequence_id)


def get_sequence_plugins() -> list[dict[str, Any]]:
    return _sequence_route_compat.get_sequence_plugins(_sequence_route_namespace())


def get_agent_sequence_tools() -> dict[str, Any]:
    return _sequence_route_compat.get_agent_sequence_tools(_sequence_route_namespace())


def create_agent_sequence(payload: AgentSequenceCreatePayload) -> dict[str, Any]:
    return _sequence_route_compat.create_agent_sequence(_sequence_route_namespace(), payload)


def request_sequence_run(
    sequence_id: str,
    payload: SequenceManualRunPayload,
) -> dict[str, Any]:
    return _sequence_route_compat.request_sequence_run(_sequence_route_namespace(), sequence_id, payload)


def get_sequence_run_status(run_id: str) -> dict[str, Any]:
    return _sequence_route_compat.get_sequence_run_status(_sequence_route_namespace(), run_id)


def get_sequence_run_task_runs(run_id: str) -> list[dict[str, Any]]:
    return _sequence_route_compat.get_sequence_run_task_runs(_sequence_route_namespace(), run_id)


def cancel_sequence_run(
    run_id: str,
    payload: SequenceCancelPayload | None = None,
) -> dict[str, Any]:
    return _sequence_route_compat.cancel_sequence_run(_sequence_route_namespace(), run_id, payload)


def retry_sequence_run(
    run_id: str,
    payload: SequenceRetryRunPayload | None = None,
) -> dict[str, Any]:
    return _sequence_route_compat.retry_sequence_run(_sequence_route_namespace(), run_id, payload)


def request_signal_candidate_enrichment_retry_route(
    doc_id: str,
    payload: SignalCandidateEnrichmentRetryPayload | None = None,
) -> dict[str, Any]:
    return _sequence_route_compat.request_signal_candidate_enrichment_retry_route(
        _sequence_route_namespace(),
        doc_id,
        payload,
    )


def request_content_item_enrichment_retry_route(
    content_item_id: str,
    payload: SignalCandidateEnrichmentRetryPayload | None = None,
) -> dict[str, Any]:
    return _sequence_route_compat.request_content_item_enrichment_retry_route(
        _sequence_route_namespace(),
        content_item_id,
        payload,
    )
