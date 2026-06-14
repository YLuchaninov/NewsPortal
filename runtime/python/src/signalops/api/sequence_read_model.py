from __future__ import annotations

import json
from typing import Any, Callable, Mapping


class SequenceValidationError(ValueError):
    def __init__(self, errors: list[str]) -> None:
        self.errors = errors
        super().__init__("; ".join(errors))


class SequenceNotFoundError(LookupError):
    pass


class SequenceConflictError(ValueError):
    pass


class SequenceDispatchError(RuntimeError):
    pass


def validate_sequence_task_graph(
    task_graph: list[dict[str, Any]],
    *,
    task_registry: Any,
) -> None:
    if not isinstance(task_graph, list):
        raise SequenceValidationError(["task_graph must be an array."])

    errors = task_registry.validate_task_graph(task_graph)
    for index, task in enumerate(task_graph):
        label = task.get("label")
        notes = task.get("notes")
        if label is not None and not isinstance(label, str):
            errors.append(f"Task at index {index} label must be a string.")
        if notes is not None and not isinstance(notes, str):
            errors.append(f"Task at index {index} notes must be a string.")
    if errors:
        raise SequenceValidationError(errors)


def validate_sequence_context_json(
    context_json: dict[str, Any],
    *,
    reserved_context_keys: set[str],
) -> None:
    errors: list[str] = []
    if not isinstance(context_json, dict):
        errors.append("context_json must be an object.")
    else:
        reserved_keys = sorted(
            key
            for key in context_json.keys()
            if key in reserved_context_keys or key.startswith("_")
        )
        if reserved_keys:
            errors.append(
                "context_json must not include reserved keys: "
                + ", ".join(reserved_keys)
                + "."
            )

    if errors:
        raise SequenceValidationError(errors)


def sanitize_sequence_retry_context(
    context_json: Mapping[str, Any] | None,
    *,
    reserved_context_keys: set[str],
) -> dict[str, Any]:
    if not isinstance(context_json, Mapping):
        return {}

    return {
        str(key): value
        for key, value in context_json.items()
        if isinstance(key, str)
        and not key.startswith("_")
        and key not in reserved_context_keys
    }


def validate_trigger_meta(trigger_meta: dict[str, Any]) -> None:
    if not isinstance(trigger_meta, dict):
        raise SequenceValidationError(["trigger_meta must be an object."])


def validate_sequence_editor_state(editor_state: dict[str, Any] | None) -> None:
    if editor_state is None:
        return
    if not isinstance(editor_state, dict):
        raise SequenceValidationError(["editor_state must be an object."])


def normalize_sequence_cron(
    cron: str | None,
    *,
    parse_cron_expression_func: Callable[[str], Any],
) -> str | None:
    if cron is None:
        return None

    normalized = cron.strip()
    if not normalized:
        return None

    try:
        parse_cron_expression_func(normalized)
    except ValueError as error:
        raise SequenceValidationError([f"cron is invalid: {error}"]) from error

    return normalized


def dump_json_value(value: Any, field_name: str) -> str:
    try:
        return json.dumps(value)
    except TypeError as error:
        raise SequenceValidationError([f"{field_name} must be JSON-serializable."]) from error


def sequence_select_sql() -> str:
    return """
        select
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
        from sequences
    """


def sequence_run_select_sql() -> str:
    return """
        select
          sr.run_id::text as run_id,
          sr.sequence_id::text as sequence_id,
          sr.retry_of_run_id::text as retry_of_run_id,
          s.title as sequence_title,
          sr.status,
          sr.context_json,
          sr.trigger_type,
          sr.trigger_meta,
          sr.started_at,
          sr.finished_at,
          sr.error_text,
          sr.created_at,
          coalesce(task_stats.total_tasks, 0) as total_tasks,
          coalesce(task_stats.completed_tasks, 0) as completed_tasks,
          coalesce(task_stats.failed_tasks, 0) as failed_tasks,
          coalesce(task_stats.skipped_tasks, 0) as skipped_tasks,
          coalesce(task_stats.running_tasks, 0) as running_tasks
        from sequence_runs sr
        join sequences s on s.sequence_id = sr.sequence_id
        left join lateral (
          select
            count(*)::int as total_tasks,
            count(*) filter (where status = 'completed')::int as completed_tasks,
            count(*) filter (where status = 'failed')::int as failed_tasks,
            count(*) filter (where status = 'skipped')::int as skipped_tasks,
            count(*) filter (where status = 'running')::int as running_tasks
          from sequence_task_runs str
          where str.run_id = sr.run_id
        ) task_stats on true
    """


def list_sequence_plugins(*, task_registry: Any) -> list[dict[str, Any]]:
    return task_registry.list_all()


def list_sequences_page(
    *,
    limit: int,
    page: int | None,
    page_size: int | None,
    sequence_select_sql_func: Callable[[], str],
    resolve_pagination_func: Callable[
        [int | None, int | None, int], tuple[bool, int, int, int]
    ],
    query_all_func: Callable[[str, tuple[Any, ...]], list[dict[str, Any]]],
    query_count_func: Callable[..., int],
    build_paginated_response_func: Callable[
        [list[dict[str, Any]], int, int, int], dict[str, Any]
    ],
) -> dict[str, Any] | list[dict[str, Any]]:
    base_sql = f"{sequence_select_sql_func()}\norder by updated_at desc, created_at desc"
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination_func(
        page, page_size, limit
    )
    if not paginate:
        return query_all_func(f"{base_sql}\nlimit %s", (limit,))

    total = query_count_func(
        """
        select count(*)::int as total
        from sequences
        """
    )
    items = query_all_func(
        f"{base_sql}\nlimit %s\noffset %s",
        (resolved_page_size, offset),
    )
    return build_paginated_response_func(items, resolved_page, resolved_page_size, total)


def get_sequence_definition(
    sequence_id: str,
    *,
    sequence_select_sql_func: Callable[[], str],
    query_one_func: Callable[[str, tuple[Any, ...]], dict[str, Any] | None],
) -> dict[str, Any]:
    sequence = query_one_func(
        f"{sequence_select_sql_func()}\nwhere sequence_id = %s",
        (sequence_id,),
    )
    if sequence is None:
        raise SequenceNotFoundError(f"Sequence {sequence_id} was not found.")
    return sequence


def get_sequence_run(
    run_id: str,
    *,
    sequence_run_select_sql_func: Callable[[], str],
    query_one_func: Callable[[str, tuple[Any, ...]], dict[str, Any] | None],
) -> dict[str, Any]:
    run = query_one_func(
        f"{sequence_run_select_sql_func()}\nwhere sr.run_id = %s",
        (run_id,),
    )
    if run is None:
        raise SequenceNotFoundError(f"Sequence run {run_id} was not found.")
    return run


def list_sequence_task_runs(
    run_id: str,
    *,
    get_sequence_run_func: Callable[[str], dict[str, Any]],
    query_all_func: Callable[[str, tuple[Any, ...]], list[dict[str, Any]]],
) -> list[dict[str, Any]]:
    get_sequence_run_func(run_id)
    return query_all_func(
        """
        select
          task_run_id::text as task_run_id,
          run_id::text as run_id,
          task_index,
          task_key,
          module,
          status,
          options_json,
          input_json,
          output_json,
          started_at,
          finished_at,
          error_text,
          duration_ms,
          created_at
        from sequence_task_runs
        where run_id = %s
        order by task_index asc, created_at asc
        """,
        (run_id,),
    )
