from __future__ import annotations

from typing import Any, Callable, Mapping

from signalops.api.sequence_read_model import (
    SequenceConflictError,
    SequenceDispatchError,
    SequenceNotFoundError,
    SequenceValidationError,
)


def create_sequence_definition(
    payload: Any,
    *,
    validate_sequence_task_graph_func: Callable[[list[dict[str, Any]]], None],
    validate_sequence_editor_state_func: Callable[[dict[str, Any] | None], None],
    normalize_sequence_cron_func: Callable[[str | None], str | None],
    dump_json_value_func: Callable[[Any, str], str],
    build_database_url_func: Callable[[], str],
    connect_func: Callable[..., Any],
    dict_row_value: Any,
) -> dict[str, Any]:
    validate_sequence_task_graph_func(payload.task_graph)
    validate_sequence_editor_state_func(payload.editor_state)
    normalized_cron = normalize_sequence_cron_func(payload.cron)

    with connect_func(build_database_url_func(), row_factory=dict_row_value) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                insert into sequences (
                  title,
                  description,
                  task_graph,
                  editor_state,
                  status,
                  trigger_event,
                  cron,
                  max_runs,
                  tags,
                  created_by
                )
                values (%s, %s, %s::jsonb, %s::jsonb, %s, %s, %s, %s, %s::text[], %s)
                returning
                  sequence_id::text as sequence_id,
                  title,
                  description,
                  task_graph,
                  editor_state,
                  status,
                  trigger_event,
                  cron,
                  max_runs,
                  run_count,
                  tags,
                  created_by,
                  created_at,
                  updated_at
                """,
                (
                    payload.title,
                    payload.description,
                    dump_json_value_func(payload.task_graph, "task_graph"),
                    (
                        dump_json_value_func(payload.editor_state, "editor_state")
                        if payload.editor_state is not None
                        else None
                    ),
                    payload.status,
                    payload.trigger_event,
                    normalized_cron,
                    payload.max_runs,
                    payload.tags,
                    payload.created_by,
                ),
            )
            row = cursor.fetchone()

    if row is None:
        raise SequenceConflictError("Sequence creation did not return a row.")

    return dict(row)


def update_sequence_definition(
    sequence_id: str,
    payload: Any,
    *,
    validate_sequence_task_graph_func: Callable[[list[dict[str, Any]]], None],
    validate_sequence_editor_state_func: Callable[[dict[str, Any] | None], None],
    normalize_sequence_cron_func: Callable[[str | None], str | None],
    dump_json_value_func: Callable[[Any, str], str],
    build_database_url_func: Callable[[], str],
    connect_func: Callable[..., Any],
    dict_row_value: Any,
) -> dict[str, Any]:
    values = payload.model_dump(exclude_unset=True)
    if not values:
        raise SequenceValidationError(["At least one field must be provided for update."])

    errors: list[str] = []
    for field_name in ("title", "status", "task_graph", "tags"):
        if field_name in values and values[field_name] is None:
            errors.append(f"{field_name} cannot be null.")
    if errors:
        raise SequenceValidationError(errors)

    if "task_graph" in values and values["task_graph"] is not None:
        validate_sequence_task_graph_func(values["task_graph"])
    if "editor_state" in values:
        validate_sequence_editor_state_func(values["editor_state"])
    if "cron" in values:
        values["cron"] = normalize_sequence_cron_func(values["cron"])

    assignments: list[str] = []
    params: list[Any] = []

    for field_name, column_name in (
        ("title", "title"),
        ("description", "description"),
        ("status", "status"),
        ("trigger_event", "trigger_event"),
        ("cron", "cron"),
        ("max_runs", "max_runs"),
        ("created_by", "created_by"),
    ):
        if field_name in values:
            assignments.append(f"{column_name} = %s")
            params.append(values[field_name])

    if "task_graph" in values:
        assignments.append("task_graph = %s::jsonb")
        params.append(dump_json_value_func(values["task_graph"], "task_graph"))

    if "editor_state" in values:
        assignments.append("editor_state = %s::jsonb")
        params.append(
            dump_json_value_func(values["editor_state"], "editor_state")
            if values["editor_state"] is not None
            else None
        )

    if "tags" in values:
        assignments.append("tags = %s::text[]")
        params.append(values["tags"])

    assignments.append("updated_at = now()")
    params.append(sequence_id)

    with connect_func(build_database_url_func(), row_factory=dict_row_value) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                update sequences
                set {', '.join(assignments)}
                where sequence_id = %s
                returning
                  sequence_id::text as sequence_id,
                  title,
                  description,
                  task_graph,
                  editor_state,
                  status,
                  trigger_event,
                  cron,
                  max_runs,
                  run_count,
                  tags,
                  created_by,
                  created_at,
                  updated_at
                """,
                tuple(params),
            )
            row = cursor.fetchone()

    if row is None:
        raise SequenceNotFoundError(f"Sequence {sequence_id} was not found.")

    return dict(row)


def archive_sequence_definition(
    sequence_id: str,
    *,
    build_database_url_func: Callable[[], str],
    connect_func: Callable[..., Any],
    dict_row_value: Any,
) -> dict[str, Any]:
    with connect_func(build_database_url_func(), row_factory=dict_row_value) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                update sequences
                set
                  status = 'archived',
                  updated_at = now()
                where sequence_id = %s
                returning
                  sequence_id::text as sequence_id,
                  title,
                  description,
                  task_graph,
                  editor_state,
                  status,
                  trigger_event,
                  cron,
                  max_runs,
                  run_count,
                  tags,
                  created_by,
                  created_at,
                  updated_at
                """,
                (sequence_id,),
            )
            row = cursor.fetchone()

    if row is None:
        raise SequenceNotFoundError(f"Sequence {sequence_id} was not found.")

    return dict(row)


def enqueue_sequence_run_job(
    run_id: str,
    sequence_id: str,
    *,
    dispatch_sequence_run_job_func: Callable[[str, str], Any],
    sequence_queue_dispatch_error_type: type[Exception],
) -> None:
    try:
        dispatch_sequence_run_job_func(run_id, sequence_id)
    except sequence_queue_dispatch_error_type as error:
        raise SequenceDispatchError(str(error)) from error
    except SequenceDispatchError:
        raise
    except Exception as error:  # pragma: no cover - runtime dependent
        raise SequenceDispatchError(
            f"Failed to enqueue sequence run {run_id}: {error}"
        ) from error


def mark_sequence_run_failed_dispatch(
    run_id: str,
    error_text: str,
    *,
    build_database_url_func: Callable[[], str],
    connect_func: Callable[..., Any],
    dict_row_value: Any,
) -> None:
    with connect_func(build_database_url_func(), row_factory=dict_row_value) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                update sequence_runs
                set
                  status = 'failed',
                  finished_at = now(),
                  error_text = %s
                where run_id = %s
                """,
                (error_text, run_id),
            )


def create_sequence_run_request_for_trigger(
    sequence_id: str,
    *,
    context_json: dict[str, Any],
    trigger_meta: dict[str, Any],
    trigger_type: str,
    retry_of_run_id: str | None = None,
    uuid4_func: Callable[[], Any],
    validate_sequence_context_json_func: Callable[[dict[str, Any]], None],
    validate_trigger_meta_func: Callable[[dict[str, Any]], None],
    dump_json_value_func: Callable[[Any, str], str],
    build_database_url_func: Callable[[], str],
    connect_func: Callable[..., Any],
    dict_row_value: Any,
    enqueue_sequence_run_job_func: Callable[[str, str], None],
    mark_sequence_run_failed_dispatch_func: Callable[[str, str], None],
    get_sequence_run_func: Callable[[str], dict[str, Any]],
) -> dict[str, Any]:
    validate_sequence_context_json_func(context_json)
    validate_trigger_meta_func(trigger_meta)
    run_id = str(uuid4_func())

    with connect_func(build_database_url_func(), row_factory=dict_row_value) as connection:
        with connection.transaction():
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    select sequence_id::text as sequence_id, status
                    from sequences
                    where sequence_id = %s
                    for update
                    """,
                    (sequence_id,),
                )
                sequence_row = cursor.fetchone()
                if sequence_row is None:
                    raise SequenceNotFoundError(f"Sequence {sequence_id} was not found.")
                if sequence_row["status"] == "archived":
                    raise SequenceConflictError(
                        f"Sequence {sequence_id} is archived and cannot be run."
                    )

                cursor.execute(
                    """
                    insert into sequence_runs (
                      run_id,
                      sequence_id,
                      retry_of_run_id,
                      status,
                      context_json,
                      trigger_type,
                      trigger_meta
                    )
                    values (%s, %s, %s, 'pending', %s::jsonb, %s, %s::jsonb)
                    """,
                    (
                        run_id,
                        sequence_id,
                        retry_of_run_id,
                        dump_json_value_func(context_json, "context_json"),
                        trigger_type,
                        dump_json_value_func(trigger_meta, "trigger_meta"),
                    ),
                )

    try:
        enqueue_sequence_run_job_func(run_id, sequence_id)
    except SequenceDispatchError:
        mark_sequence_run_failed_dispatch_func(
            run_id,
            "BullMQ transport is not available in this API runtime.",
        )
        raise
    except Exception as error:  # pragma: no cover - runtime dependent
        mark_sequence_run_failed_dispatch_func(run_id, str(error))
        raise SequenceDispatchError(str(error)) from error

    return get_sequence_run_func(run_id)


def create_sequence_run_request(
    sequence_id: str,
    payload: Any,
    *,
    create_sequence_run_request_for_trigger_func: Callable[..., dict[str, Any]],
) -> dict[str, Any]:
    trigger_meta = {
        "source": "maintenance_api",
        **payload.trigger_meta,
    }
    if payload.requested_by:
        trigger_meta["requestedBy"] = payload.requested_by
    return create_sequence_run_request_for_trigger_func(
        sequence_id,
        context_json=payload.context_json,
        trigger_meta=trigger_meta,
        trigger_type="manual",
    )


def retry_sequence_run_request(
    run_id: str,
    payload: Any,
    *,
    get_sequence_run_func: Callable[[str], dict[str, Any]],
    sanitize_sequence_retry_context_func: Callable[
        [Mapping[str, Any] | None], dict[str, Any]
    ],
    validate_sequence_context_json_func: Callable[[dict[str, Any]], None],
    create_sequence_run_request_for_trigger_func: Callable[..., dict[str, Any]],
) -> dict[str, Any]:
    existing_run = get_sequence_run_func(run_id)
    if str(existing_run.get("status") or "") != "failed":
        raise SequenceConflictError(
            f"Sequence run {run_id} is not failed and cannot be retried."
        )

    base_context = sanitize_sequence_retry_context_func(
        existing_run.get("context_json")
        if isinstance(existing_run.get("context_json"), Mapping)
        else None
    )
    merged_context = {
        **base_context,
        **payload.context_overrides,
    }
    validate_sequence_context_json_func(merged_context)

    base_trigger_meta = (
        dict(existing_run["trigger_meta"])
        if isinstance(existing_run.get("trigger_meta"), Mapping)
        else {}
    )
    trigger_meta = {
        **base_trigger_meta,
        **payload.trigger_meta,
        "source": "maintenance_retry",
        "retryOfRunId": run_id,
        "originalTriggerType": existing_run.get("trigger_type"),
    }
    if payload.requested_by:
        trigger_meta["requestedBy"] = payload.requested_by

    return create_sequence_run_request_for_trigger_func(
        str(existing_run["sequence_id"]),
        context_json=merged_context,
        trigger_meta=trigger_meta,
        trigger_type="manual",
        retry_of_run_id=run_id,
    )


def get_active_sequence_for_trigger(
    trigger_event: str,
    *,
    query_one_func: Callable[[str, tuple[Any, ...]], dict[str, Any] | None],
) -> dict[str, Any]:
    row = query_one_func(
        """
        select
          sequence_id::text as sequence_id,
          title,
          status,
          trigger_event
        from sequences
        where trigger_event = %s
          and status = 'active'
        order by updated_at desc, created_at desc
        limit 1
        """,
        (trigger_event,),
    )
    if row is None:
        raise SequenceNotFoundError(
            f"No active sequence is registered for trigger {trigger_event!r}."
        )
    return row


def ensure_published_signal_candidate_retry_event(
    *,
    event_id: str,
    doc_id: str,
    dump_json_value_func: Callable[[Any, str], str],
    build_database_url_func: Callable[[], str],
    connect_func: Callable[..., Any],
    dict_row_value: Any,
) -> None:
    payload = {
        "docId": doc_id,
        "eventId": event_id,
        "manualRetry": True,
        "source": "maintenance_signal_candidate_enrichment_retry",
    }
    with connect_func(build_database_url_func(), row_factory=dict_row_value) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                insert into outbox_events (
                  event_id,
                  event_type,
                  aggregate_type,
                  aggregate_id,
                  payload_json,
                  status,
                  published_at,
                  attempt_count,
                  error_message
                )
                values (
                  %s,
                  'signal_candidate.ingest.requested',
                  'signal_candidate',
                  %s,
                  %s::jsonb,
                  'published',
                  now(),
                  1,
                  null
                )
                on conflict (event_id) do update
                set
                  aggregate_id = excluded.aggregate_id,
                  payload_json = excluded.payload_json,
                  status = 'published',
                  published_at = now(),
                  attempt_count = greatest(outbox_events.attempt_count, 1),
                  error_message = null
                """,
                (
                    event_id,
                    doc_id,
                    dump_json_value_func(payload, "payload_json"),
                ),
            )


def request_signal_candidate_enrichment_retry(
    doc_id: str,
    payload: Any | None = None,
    *,
    query_one_func: Callable[[str, tuple[Any, ...]], dict[str, Any] | None],
    get_active_sequence_for_trigger_func: Callable[[str], dict[str, Any]],
    uuid4_func: Callable[[], Any],
    ensure_published_signal_candidate_retry_event_func: Callable[..., None],
    create_sequence_run_request_for_trigger_func: Callable[..., dict[str, Any]],
) -> dict[str, Any]:
    signal_candidate = query_one_func(
        """
        select doc_id::text as doc_id
        from signal_candidates
        where doc_id = %s
        limit 1
        """,
        (doc_id,),
    )
    if signal_candidate is None:
        raise SequenceNotFoundError(f"SignalCandidate {doc_id} was not found.")

    sequence = get_active_sequence_for_trigger_func("signal_candidate.ingest.requested")
    event_id = str(uuid4_func())
    trigger_meta = {
        "source": "maintenance_signal_candidate_enrichment_retry",
        "docId": doc_id,
    }
    if payload and payload.requested_by:
        trigger_meta["requestedBy"] = payload.requested_by

    ensure_published_signal_candidate_retry_event_func(event_id=event_id, doc_id=doc_id)

    return create_sequence_run_request_for_trigger_func(
        str(sequence["sequence_id"]),
        context_json={
            "doc_id": doc_id,
            "event_id": event_id,
            "force_enrichment": True,
        },
        trigger_meta=trigger_meta,
        trigger_type="manual",
    )


def list_agent_sequence_tools(
    *,
    list_sequence_plugins_func: Callable[[], list[dict[str, Any]]],
) -> dict[str, Any]:
    return {
        "availablePlugins": list_sequence_plugins_func(),
        "sequenceDefaults": {
            "status": "draft",
            "triggerType": "agent",
        },
        "notes": [
            "Agent-created sequences are stored first and stay draft by default.",
            "Agent-triggered runs still persist in sequence_runs and dispatch through q.sequence.",
        ],
    }


def create_agent_sequence_request(
    payload: Any,
    *,
    sequence_create_payload_type: Any,
    create_sequence_definition_func: Callable[[Any], dict[str, Any]],
    create_sequence_run_request_for_trigger_func: Callable[..., dict[str, Any]],
) -> dict[str, Any]:
    create_payload = sequence_create_payload_type.model_validate(
        {
            "title": payload.title,
            "taskGraph": payload.task_graph,
            "description": payload.description,
            "status": "draft",
            "tags": payload.tags,
            "createdBy": payload.created_by or "agent",
        }
    )
    sequence = create_sequence_definition_func(create_payload)

    run: dict[str, Any] | None = None
    if payload.run_now:
        trigger_meta = {
            "source": "agent_api",
            "createdSequenceId": sequence["sequence_id"],
            **payload.trigger_meta,
        }
        if payload.created_by:
            trigger_meta["requestedBy"] = payload.created_by
        run = create_sequence_run_request_for_trigger_func(
            sequence["sequence_id"],
            context_json=payload.context_json,
            trigger_meta=trigger_meta,
            trigger_type="agent",
        )

    return {
        "sequence": sequence,
        "run": run,
    }


def cancel_sequence_run_request(
    run_id: str,
    *,
    reason: str | None = None,
    cancellable_statuses: set[str],
    build_database_url_func: Callable[[], str],
    connect_func: Callable[..., Any],
    dict_row_value: Any,
    get_sequence_run_func: Callable[[str], dict[str, Any]],
) -> dict[str, Any]:
    with connect_func(build_database_url_func(), row_factory=dict_row_value) as connection:
        with connection.transaction():
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    select run_id::text as run_id, status
                    from sequence_runs
                    where run_id = %s
                    for update
                    """,
                    (run_id,),
                )
                run = cursor.fetchone()
                if run is None:
                    raise SequenceNotFoundError(f"Sequence run {run_id} was not found.")
                if run["status"] not in cancellable_statuses:
                    raise SequenceConflictError(
                        f"Sequence run {run_id} cannot be cancelled from status {run['status']}."
                    )

                error_text = (
                    reason.strip()
                    if isinstance(reason, str) and reason.strip()
                    else "Cancelled via maintenance API."
                )
                cursor.execute(
                    """
                    update sequence_runs
                    set
                      status = 'cancelled',
                      finished_at = now(),
                      error_text = %s
                    where run_id = %s
                    returning run_id::text as run_id
                    """,
                    (error_text, run_id),
                )
                cursor.fetchone()

    return get_sequence_run_func(run_id)
