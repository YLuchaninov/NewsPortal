from __future__ import annotations

import json
import os
import uuid
from typing import Any, Literal

import psycopg
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from psycopg.rows import dict_row

from services.workers.app.task_engine import (
    enqueue_sequence_run_job as dispatch_sequence_run_job,
    parse_cron_expression,
    SequenceQueueDispatchError,
    TASK_REGISTRY,
)
from services.workers.app.task_engine.context import RESERVED_CONTEXT_KEYS


SEQUENCE_DEFINITION_STATUSES = {"draft", "active", "archived"}
SEQUENCE_RUN_CANCELLABLE_STATUSES = {"pending"}


def build_database_url() -> str:
    if os.getenv("DATABASE_URL"):
        return os.environ["DATABASE_URL"]

    user = os.getenv("POSTGRES_USER", "newsportal")
    password = os.getenv("POSTGRES_PASSWORD", "newsportal")
    host = os.getenv("POSTGRES_HOST", "127.0.0.1")
    port = os.getenv(
        "POSTGRES_PORT",
        "55432" if host in {"127.0.0.1", "localhost"} else "5432",
    )
    database = os.getenv("POSTGRES_DB", "newsportal")
    return f"postgresql://{user}:{password}@{host}:{port}/{database}"


def query_all(sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    with psycopg.connect(build_database_url(), row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(sql, params)
            return [dict(row) for row in cursor.fetchall()]


def query_one(sql: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
    rows = query_all(sql, params)
    return rows[0] if rows else None


def check_database() -> None:
    with psycopg.connect(build_database_url()) as connection:
        with connection.cursor() as cursor:
            cursor.execute("select 1")


def processed_article_clause(alias: str = "a") -> str:
    return (
        "("
        f"{alias}.processing_state in ('matched', 'notified')"
        f" or exists ("
        f"select 1 from system_feed_results sfr_processed "
        f"where sfr_processed.doc_id = {alias}.doc_id "
        "and sfr_processed.decision in ('pass_through', 'eligible', 'filtered_out')"
        ")"
        ")"
    )


def system_feed_join_clause(article_alias: str = "a", system_alias: str = "sfr") -> str:
    return f"left join system_feed_results {system_alias} on {system_alias}.doc_id = {article_alias}.doc_id"


def canonical_article_family_expr(article_alias: str = "a") -> str:
    return f"coalesce({article_alias}.canonical_doc_id, {article_alias}.doc_id)"


def canonical_article_family_order_clause(article_alias: str = "a") -> str:
    family_expr = canonical_article_family_expr(article_alias)
    return (
        f"case when {article_alias}.doc_id = {family_expr} then 0 else 1 end, "
        f"{article_alias}.published_at desc nulls last, "
        f"{article_alias}.ingested_at desc, "
        f"{article_alias}.doc_id"
    )


def feed_eligible_article_clause(
    article_alias: str = "a",
    system_alias: str = "sfr",
) -> str:
    return (
        f"{article_alias}.visibility_state = 'visible' and "
        f"coalesce({system_alias}.eligible_for_feed, false) = true"
    )


def build_paginated_response(
    items: list[dict[str, Any]], page: int, page_size: int, total: int
) -> dict[str, Any]:
    total_pages = (total + page_size - 1) // page_size if total else 0
    return {
        "items": items,
        "page": page,
        "pageSize": page_size,
        "total": total,
        "totalPages": total_pages,
        "hasNext": page < total_pages,
        "hasPrev": page > 1,
    }


def resolve_pagination(
    page: int | None, page_size: int | None, default_page_size: int
) -> tuple[bool, int, int, int]:
    paginate = page is not None or page_size is not None
    resolved_page = page if page is not None else 1
    resolved_page_size = page_size if page_size is not None else default_page_size
    offset = (resolved_page - 1) * resolved_page_size
    return paginate, resolved_page, resolved_page_size, offset


def query_count(sql: str, params: tuple[Any, ...] = ()) -> int:
    row = query_one(sql, params)
    return int(row["total"]) if row and row.get("total") is not None else 0


class SequenceValidationError(ValueError):
    def __init__(self, errors: list[str]):
        super().__init__("; ".join(errors))
        self.errors = errors


class SequenceNotFoundError(LookupError):
    pass


class SequenceConflictError(ValueError):
    pass


class SequenceDispatchError(RuntimeError):
    pass


class SequenceCreatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    task_graph: list[dict[str, Any]] = Field(alias="taskGraph")
    description: str | None = None
    status: Literal["draft", "active", "archived"] = "draft"
    trigger_event: str | None = Field(default=None, alias="triggerEvent")
    cron: str | None = None
    max_runs: int | None = Field(default=None, ge=1, alias="maxRuns")
    tags: list[str] = Field(default_factory=list)
    created_by: str | None = Field(default=None, alias="createdBy")


class SequenceUpdatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = None
    task_graph: list[dict[str, Any]] | None = Field(default=None, alias="taskGraph")
    description: str | None = None
    status: Literal["draft", "active", "archived"] | None = None
    trigger_event: str | None = Field(default=None, alias="triggerEvent")
    cron: str | None = None
    max_runs: int | None = Field(default=None, ge=1, alias="maxRuns")
    tags: list[str] | None = None
    created_by: str | None = Field(default=None, alias="createdBy")


class SequenceManualRunPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    context_json: dict[str, Any] = Field(default_factory=dict, alias="contextJson")
    trigger_meta: dict[str, Any] = Field(default_factory=dict, alias="triggerMeta")
    requested_by: str | None = Field(default=None, alias="requestedBy")


class AgentSequenceCreatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    task_graph: list[dict[str, Any]] = Field(alias="taskGraph")
    description: str | None = None
    tags: list[str] = Field(default_factory=list)
    created_by: str | None = Field(default=None, alias="createdBy")
    context_json: dict[str, Any] = Field(default_factory=dict, alias="contextJson")
    trigger_meta: dict[str, Any] = Field(default_factory=dict, alias="triggerMeta")
    run_now: bool = Field(default=True, alias="runNow")


class SequenceCancelPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str | None = None


def validate_sequence_task_graph(task_graph: list[dict[str, Any]]) -> None:
    if not isinstance(task_graph, list):
        raise SequenceValidationError(["task_graph must be an array."])

    errors = TASK_REGISTRY.validate_task_graph(task_graph)
    if errors:
        raise SequenceValidationError(errors)


def validate_sequence_context_json(context_json: dict[str, Any]) -> None:
    errors: list[str] = []
    if not isinstance(context_json, dict):
        errors.append("context_json must be an object.")
    else:
        reserved_keys = sorted(
            key for key in context_json.keys() if key in RESERVED_CONTEXT_KEYS or key.startswith("_")
        )
        if reserved_keys:
            errors.append(
                "context_json must not include reserved keys: "
                + ", ".join(reserved_keys)
                + "."
            )

    if errors:
        raise SequenceValidationError(errors)


def validate_trigger_meta(trigger_meta: dict[str, Any]) -> None:
    if not isinstance(trigger_meta, dict):
        raise SequenceValidationError(["trigger_meta must be an object."])


def normalize_sequence_cron(cron: str | None) -> str | None:
    if cron is None:
        return None

    normalized = cron.strip()
    if not normalized:
        return None

    try:
        parse_cron_expression(normalized)
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


def list_sequence_plugins() -> list[dict[str, Any]]:
    return TASK_REGISTRY.list_all()


def list_sequences_page(
    *,
    limit: int,
    page: int | None,
    page_size: int | None,
) -> dict[str, Any] | list[dict[str, Any]]:
    base_sql = f"{sequence_select_sql()}\norder by updated_at desc, created_at desc"
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, limit
    )
    if not paginate:
        return query_all(f"{base_sql}\nlimit %s", (limit,))

    total = query_count(
        """
        select count(*)::int as total
        from sequences
        """
    )
    items = query_all(
        f"{base_sql}\nlimit %s\noffset %s",
        (resolved_page_size, offset),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


def get_sequence_definition(sequence_id: str) -> dict[str, Any]:
    sequence = query_one(
        f"{sequence_select_sql()}\nwhere sequence_id = %s",
        (sequence_id,),
    )
    if sequence is None:
        raise SequenceNotFoundError(f"Sequence {sequence_id} was not found.")
    return sequence


def create_sequence_definition(payload: SequenceCreatePayload) -> dict[str, Any]:
    validate_sequence_task_graph(payload.task_graph)
    normalized_cron = normalize_sequence_cron(payload.cron)

    with psycopg.connect(build_database_url(), row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                insert into sequences (
                  title,
                  description,
                  task_graph,
                  status,
                  trigger_event,
                  cron,
                  max_runs,
                  tags,
                  created_by
                )
                values (%s, %s, %s::jsonb, %s, %s, %s, %s, %s::text[], %s)
                returning
                  sequence_id::text as sequence_id,
                  title,
                  description,
                  task_graph,
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
                    dump_json_value(payload.task_graph, "task_graph"),
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
    payload: SequenceUpdatePayload,
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
        validate_sequence_task_graph(values["task_graph"])
    if "cron" in values:
        values["cron"] = normalize_sequence_cron(values["cron"])

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
        params.append(dump_json_value(values["task_graph"], "task_graph"))

    if "tags" in values:
        assignments.append("tags = %s::text[]")
        params.append(values["tags"])

    assignments.append("updated_at = now()")
    params.append(sequence_id)

    with psycopg.connect(build_database_url(), row_factory=dict_row) as connection:
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


def archive_sequence_definition(sequence_id: str) -> dict[str, Any]:
    with psycopg.connect(build_database_url(), row_factory=dict_row) as connection:
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


def enqueue_sequence_run_job(run_id: str, sequence_id: str) -> None:
    try:
        dispatch_sequence_run_job(run_id, sequence_id)
    except SequenceQueueDispatchError as error:
        raise SequenceDispatchError(str(error)) from error
    except SequenceDispatchError:
        raise
    except Exception as error:  # pragma: no cover - runtime dependent
        raise SequenceDispatchError(
            f"Failed to enqueue sequence run {run_id}: {error}"
        ) from error


def mark_sequence_run_failed_dispatch(run_id: str, error_text: str) -> None:
    with psycopg.connect(build_database_url(), row_factory=dict_row) as connection:
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
    trigger_type: Literal["manual", "cron", "agent", "api", "event"],
) -> dict[str, Any]:
    validate_sequence_context_json(context_json)
    validate_trigger_meta(trigger_meta)
    run_id = str(uuid.uuid4())

    with psycopg.connect(build_database_url(), row_factory=dict_row) as connection:
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
                      status,
                      context_json,
                      trigger_type,
                      trigger_meta
                    )
                    values (%s, %s, 'pending', %s::jsonb, %s, %s::jsonb)
                    """,
                    (
                        run_id,
                        sequence_id,
                        dump_json_value(context_json, "context_json"),
                        trigger_type,
                        dump_json_value(trigger_meta, "trigger_meta"),
                    ),
                )

    try:
        enqueue_sequence_run_job(run_id, sequence_id)
    except SequenceDispatchError:
        mark_sequence_run_failed_dispatch(run_id, "BullMQ transport is not available in this API runtime.")
        raise
    except Exception as error:  # pragma: no cover - runtime dependent
        mark_sequence_run_failed_dispatch(run_id, str(error))
        raise SequenceDispatchError(str(error)) from error

    return get_sequence_run(run_id)


def create_sequence_run_request(
    sequence_id: str,
    payload: SequenceManualRunPayload,
) -> dict[str, Any]:
    trigger_meta = {
        "source": "maintenance_api",
        **payload.trigger_meta,
    }
    if payload.requested_by:
        trigger_meta["requestedBy"] = payload.requested_by
    return create_sequence_run_request_for_trigger(
        sequence_id,
        context_json=payload.context_json,
        trigger_meta=trigger_meta,
        trigger_type="manual",
    )


def list_agent_sequence_tools() -> dict[str, Any]:
    return {
        "availablePlugins": list_sequence_plugins(),
        "sequenceDefaults": {
            "status": "draft",
            "triggerType": "agent",
        },
        "notes": [
            "Agent-created sequences are stored first and stay draft by default.",
            "Agent-triggered runs still persist in sequence_runs and dispatch through q.sequence.",
        ],
    }


def create_agent_sequence_request(payload: AgentSequenceCreatePayload) -> dict[str, Any]:
    create_payload = SequenceCreatePayload.model_validate(
        {
            "title": payload.title,
            "taskGraph": payload.task_graph,
            "description": payload.description,
            "status": "draft",
            "tags": payload.tags,
            "createdBy": payload.created_by or "agent",
        }
    )
    sequence = create_sequence_definition(create_payload)

    run: dict[str, Any] | None = None
    if payload.run_now:
        trigger_meta = {
            "source": "agent_api",
            "createdSequenceId": sequence["sequence_id"],
            **payload.trigger_meta,
        }
        if payload.created_by:
            trigger_meta["requestedBy"] = payload.created_by
        run = create_sequence_run_request_for_trigger(
            sequence["sequence_id"],
            context_json=payload.context_json,
            trigger_meta=trigger_meta,
            trigger_type="agent",
        )

    return {
        "sequence": sequence,
        "run": run,
    }


def get_sequence_run(run_id: str) -> dict[str, Any]:
    run = query_one(
        f"{sequence_run_select_sql()}\nwhere sr.run_id = %s",
        (run_id,),
    )
    if run is None:
        raise SequenceNotFoundError(f"Sequence run {run_id} was not found.")
    return run


def cancel_sequence_run_request(run_id: str, reason: str | None = None) -> dict[str, Any]:
    with psycopg.connect(build_database_url(), row_factory=dict_row) as connection:
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
                if run["status"] not in SEQUENCE_RUN_CANCELLABLE_STATUSES:
                    raise SequenceConflictError(
                        f"Sequence run {run_id} cannot be cancelled from status {run['status']}."
                    )

                error_text = reason.strip() if isinstance(reason, str) and reason.strip() else "Cancelled via maintenance API."
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

    return get_sequence_run(run_id)


def list_sequence_task_runs(run_id: str) -> list[dict[str, Any]]:
    get_sequence_run(run_id)
    return query_all(
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


def raise_sequence_http_exception(error: Exception) -> None:
    if isinstance(error, SequenceNotFoundError):
        raise HTTPException(status_code=404, detail=str(error)) from error
    if isinstance(error, SequenceConflictError):
        raise HTTPException(status_code=409, detail=str(error)) from error
    if isinstance(error, SequenceValidationError):
        raise HTTPException(status_code=422, detail=error.errors) from error
    if isinstance(error, SequenceDispatchError):
        raise HTTPException(status_code=503, detail=str(error)) from error
    raise error


app = FastAPI(title="NewsPortal API MVP")


@app.get("/health")
def health() -> dict[str, object]:
    check_database()
    return {
        "service": "api",
        "status": "ok",
        "checks": {
            "database": "ok",
        },
    }


@app.get("/articles")
def list_articles(
    limit: int = Query(default=20, ge=1, le=100),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    article_select = """
        select
          a.doc_id,
          a.title,
          a.lead,
          a.lang,
          a.published_at,
          a.processing_state,
          a.visibility_state,
          a.event_cluster_id,
          sfr.decision as system_feed_decision,
          coalesce(sfr.eligible_for_feed, false) as system_feed_eligible,
          a.has_media,
          coalesce(ars.like_count, 0) as like_count,
          coalesce(ars.dislike_count, 0) as dislike_count
        from articles a
        left join system_feed_results sfr on sfr.doc_id = a.doc_id
        left join article_reaction_stats ars on ars.doc_id = a.doc_id
        order by a.published_at desc nulls last, a.ingested_at desc
    """
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, limit
    )
    if not paginate:
        return query_all(f"{article_select}\nlimit %s", (limit,))

    total = query_count(
        """
        select count(*)::int as total
        from articles
        """
    )
    items = query_all(
        f"{article_select}\nlimit %s\noffset %s",
        (resolved_page_size, offset),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


@app.get("/feed")
def list_feed_articles(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any]:
    offset = (page - 1) * page_size
    family_expr = canonical_article_family_expr("a")
    family_order = canonical_article_family_order_clause("a")
    total_row = query_one(
        f"""
        select count(*)::int as total
        from (
          select distinct {family_expr} as family_doc_id
          from articles a
          {system_feed_join_clause("a", "sfr")}
          where {feed_eligible_article_clause("a", "sfr")}
        ) deduped
        """
    )
    items = query_all(
        f"""
        select
          ranked.doc_id,
          ranked.url,
          ranked.title,
          ranked.lead,
          ranked.lang,
          ranked.published_at,
          ranked.processing_state,
          ranked.visibility_state,
          ranked.event_cluster_id,
          ranked.system_feed_decision,
          ranked.system_feed_eligible,
          ranked.has_media,
          ranked.like_count,
          ranked.dislike_count
        from (
          select
            a.doc_id,
            a.url,
            a.title,
            a.lead,
            a.lang,
            a.published_at,
            a.ingested_at,
            a.processing_state,
            a.visibility_state,
            a.event_cluster_id,
            sfr.decision as system_feed_decision,
            coalesce(sfr.eligible_for_feed, false) as system_feed_eligible,
            a.has_media,
            coalesce(ars.like_count, 0) as like_count,
            coalesce(ars.dislike_count, 0) as dislike_count,
            row_number() over (
              partition by {family_expr}
              order by {family_order}
            ) as family_rank
          from articles a
          left join system_feed_results sfr on sfr.doc_id = a.doc_id
          left join article_reaction_stats ars on ars.doc_id = a.doc_id
          where {feed_eligible_article_clause("a", "sfr")}
        ) ranked
        where ranked.family_rank = 1
        order by ranked.published_at desc nulls last, ranked.ingested_at desc, ranked.doc_id
        limit %s
        offset %s
        """,
        (page_size, offset),
    )
    total = int(total_row["total"]) if total_row else 0
    return build_paginated_response(items, page, page_size, total)


@app.get("/articles/{doc_id}")
def get_article(doc_id: str) -> dict[str, Any]:
    article = query_one(
        """
        select
          a.*,
          coalesce(ars.like_count, 0) as like_count,
          coalesce(ars.dislike_count, 0) as dislike_count
        from articles a
        left join article_reaction_stats ars on ars.doc_id = a.doc_id
        where a.doc_id = %s
        """,
        (doc_id,),
    )
    if article is None:
        raise HTTPException(status_code=404, detail="Article not found.")

    article["media_assets"] = query_all(
        """
        select *
        from article_media_assets
        where doc_id = %s
        order by sort_order, created_at
        """,
        (doc_id,),
    )
    return article


@app.get("/articles/{doc_id}/explain")
def get_article_explain(doc_id: str) -> dict[str, Any]:
    article = get_article(doc_id)
    return {
        "article": article,
        "criteria_matches": query_all(
            """
            select *
            from criterion_match_results
            where doc_id = %s
            order by created_at desc
            """,
            (doc_id,),
        ),
        "interest_matches": query_all(
            """
            select *
            from interest_match_results
            where doc_id = %s
            order by created_at desc
            """,
            (doc_id,),
        ),
        "llm_reviews": query_all(
            """
            select *
            from llm_review_log
            where doc_id = %s
            order by created_at desc
            """,
            (doc_id,),
        ),
        "notifications": query_all(
            """
            select *
            from notification_log
            where doc_id = %s
            order by created_at desc
            """,
            (doc_id,),
        ),
    }


@app.get("/dashboard/summary")
def get_dashboard_summary() -> dict[str, Any]:
    family_expr = canonical_article_family_expr("a")
    counts = query_one(
        f"""
        select
          (
            select count(*)::int
            from (
              select distinct {family_expr} as family_doc_id
              from articles a
              {system_feed_join_clause("a", "sfr")}
              where {feed_eligible_article_clause("a", "sfr")}
            ) deduped
          ) as active_news,
          (select count(*)::int from articles a where {processed_article_clause("a")}) as processed_total,
          (
            select count(*)::int
            from articles a
            where {processed_article_clause("a")}
              and a.ingested_at >= now() - interval '24 hours'
          ) as processed_today,
          (select count(*)::int from users) as total_users,
          (select count(*)::int from source_channels where is_active = true) as active_channels,
          (select count(*)::int from reindex_jobs where status = 'queued') as queued_reindex_jobs,
          (
            select count(*)::int
            from source_channels sc
            left join source_channel_runtime_state scrs on scrs.channel_id = sc.channel_id
            where sc.is_active = true
              and coalesce(
                scrs.next_due_at,
                case
                  when sc.last_fetch_at is null then now()
                  else sc.last_fetch_at + make_interval(secs => sc.poll_interval_seconds)
                end
              ) <= now()
          ) as overdue_channels,
          (
            select count(*)::int
            from source_channels sc
            join source_channel_runtime_state scrs on scrs.channel_id = sc.channel_id
            where sc.is_active = true
              and scrs.effective_poll_interval_seconds > sc.poll_interval_seconds
          ) as adapted_channels,
          (
            select count(*)::int
            from source_channel_runtime_state
            where last_result_kind = 'hard_failure' or consecutive_failures >= 2
          ) as attention_channels,
          (
            select coalesce(percentile_disc(0.5) within group (order by fetch_duration_ms), 0)::int
            from channel_fetch_runs
            where started_at >= now() - interval '24 hours'
          ) as fetch_median_duration_ms_24h,
          (
            select count(*)::int
            from channel_fetch_runs
            where started_at >= now() - interval '24 hours'
              and outcome_kind = 'new_content'
          ) as fetch_new_content_24h,
          (
            select count(*)::int
            from channel_fetch_runs
            where started_at >= now() - interval '24 hours'
              and outcome_kind = 'no_change'
          ) as fetch_no_change_24h,
          (
            select count(*)::int
            from channel_fetch_runs
            where started_at >= now() - interval '24 hours'
              and outcome_kind in ('rate_limited', 'transient_failure', 'hard_failure')
          ) as fetch_failures_24h,
          (
            select count(*)::int
            from llm_review_log
            where created_at >= now() - interval '24 hours'
          ) as llm_review_count_24h,
          (
            select coalesce(sum(total_tokens), 0)::int
            from llm_review_log
            where created_at >= now() - interval '24 hours'
          ) as llm_total_tokens_24h,
          (
            select coalesce(sum(cost_estimate_usd), 0)::float
            from llm_review_log
            where created_at >= now() - interval '24 hours'
          ) as llm_cost_usd_24h
        """
    )
    return counts or {}


@app.get("/channels")
def list_channels(
    provider_type: str | None = Query(default=None, alias="providerType"),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    channel_filters: list[str] = []
    params: list[Any] = []
    if provider_type:
        channel_filters.append("sc.provider_type = %s")
        params.append(provider_type)

    where_clause = f"where {' and '.join(channel_filters)}" if channel_filters else ""
    channel_select = f"""
        select
          sc.channel_id,
          sc.name,
          sc.provider_type,
          sc.fetch_url,
          sc.language,
          sc.is_active,
          sc.poll_interval_seconds,
          sc.config_json,
          sc.last_fetch_at,
          sc.last_success_at,
          sc.last_error_at,
          sc.last_error_message,
          coalesce(scrs.adaptive_enabled, true) as adaptive_enabled,
          coalesce(scrs.effective_poll_interval_seconds, sc.poll_interval_seconds) as effective_poll_interval_seconds,
          coalesce(scrs.max_poll_interval_seconds, least(sc.poll_interval_seconds * 16, 259200)) as max_poll_interval_seconds,
          coalesce(
            scrs.next_due_at,
            case
              when sc.last_fetch_at is null then now()
              else sc.last_fetch_at + make_interval(secs => sc.poll_interval_seconds)
            end
          ) as next_due_at,
          scrs.adaptive_step,
          scrs.last_result_kind,
          scrs.consecutive_no_change_polls,
          scrs.consecutive_failures,
          scrs.adaptive_reason,
          greatest(
            0,
            extract(
              epoch from (
                now() - coalesce(
                  scrs.next_due_at,
                  case
                    when sc.last_fetch_at is null then now()
                    else sc.last_fetch_at + make_interval(secs => sc.poll_interval_seconds)
                  end
                )
              )
            )
          )::int as overdue_seconds,
          (
            coalesce(scrs.last_result_kind, '') = 'hard_failure'
            or coalesce(scrs.consecutive_failures, 0) >= 2
          ) as needs_attention,
          last_run.started_at as last_run_started_at,
          last_run.outcome_kind as last_run_outcome_kind,
          last_run.fetch_duration_ms as last_run_duration_ms,
          last_run.error_text as last_run_error_text,
          recent_runs.recent_failure_count_24h,
          article_counts.article_count,
          sp.provider_id,
          sp.name as provider_name
        from source_channels sc
        left join source_providers sp on sp.provider_id = sc.provider_id
        left join source_channel_runtime_state scrs on scrs.channel_id = sc.channel_id
        left join lateral (
          select
            started_at,
            outcome_kind,
            fetch_duration_ms,
            error_text
          from channel_fetch_runs cfr
          where cfr.channel_id = sc.channel_id
          order by cfr.started_at desc
          limit 1
        ) last_run on true
        left join lateral (
          select
            count(*) filter (
              where outcome_kind in ('rate_limited', 'transient_failure', 'hard_failure')
            )::int as recent_failure_count_24h
          from channel_fetch_runs cfr
          where cfr.channel_id = sc.channel_id
            and cfr.started_at >= now() - interval '24 hours'
        ) recent_runs on true
        left join lateral (
          select count(*)::int as article_count
          from articles a
          where a.channel_id = sc.channel_id
        ) article_counts on true
        {where_clause}
        order by sc.updated_at desc, sc.created_at desc
    """
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, 20
    )
    if not paginate:
        return query_all(channel_select, tuple(params))

    count_sql = "select count(*)::int as total from source_channels sc"
    if where_clause:
        count_sql = f"{count_sql}\n{where_clause}"
    total = query_count(count_sql, tuple(params))
    items = query_all(
        f"{channel_select}\nlimit %s\noffset %s",
        tuple([*params, resolved_page_size, offset]),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


@app.get("/channels/{channel_id}")
def get_channel(channel_id: str) -> dict[str, Any]:
    channel = query_one(
        """
        select
          sc.channel_id,
          sc.name,
          sc.provider_type,
          sc.fetch_url,
          sc.language,
          sc.is_active,
          sc.poll_interval_seconds,
          sc.config_json,
          sc.last_fetch_at,
          sc.last_success_at,
          sc.last_error_at,
          sc.last_error_message,
          coalesce(scrs.adaptive_enabled, true) as adaptive_enabled,
          coalesce(scrs.effective_poll_interval_seconds, sc.poll_interval_seconds) as effective_poll_interval_seconds,
          coalesce(scrs.max_poll_interval_seconds, least(sc.poll_interval_seconds * 16, 259200)) as max_poll_interval_seconds,
          coalesce(
            scrs.next_due_at,
            case
              when sc.last_fetch_at is null then now()
              else sc.last_fetch_at + make_interval(secs => sc.poll_interval_seconds)
            end
          ) as next_due_at,
          scrs.adaptive_step,
          scrs.last_result_kind,
          scrs.consecutive_no_change_polls,
          scrs.consecutive_failures,
          scrs.adaptive_reason,
          greatest(
            0,
            extract(
              epoch from (
                now() - coalesce(
                  scrs.next_due_at,
                  case
                    when sc.last_fetch_at is null then now()
                    else sc.last_fetch_at + make_interval(secs => sc.poll_interval_seconds)
                  end
                )
              )
            )
          )::int as overdue_seconds,
          (
            coalesce(scrs.last_result_kind, '') = 'hard_failure'
            or coalesce(scrs.consecutive_failures, 0) >= 2
          ) as needs_attention,
          (
            select count(*)::int
            from articles a
            where a.channel_id = sc.channel_id
          ) as article_count,
          sp.provider_id,
          sp.name as provider_name
        from source_channels sc
        left join source_providers sp on sp.provider_id = sc.provider_id
        left join source_channel_runtime_state scrs on scrs.channel_id = sc.channel_id
        where sc.channel_id = %s
        """,
        (channel_id,),
    )
    if channel is None:
        raise HTTPException(status_code=404, detail="Channel not found.")
    return channel


@app.get("/clusters")
def list_clusters(
    limit: int = Query(default=20, ge=1, le=100),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    cluster_select = """
        select
          ec.*,
          (
            select json_agg(ecm.doc_id order by ecm.created_at desc)
            from event_cluster_members ecm
            where ecm.cluster_id = ec.cluster_id
          ) as doc_ids
        from event_clusters ec
        order by ec.max_published_at desc nulls last, ec.updated_at desc
    """
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, limit
    )
    if not paginate:
        return query_all(f"{cluster_select}\nlimit %s", (limit,))

    total = query_count(
        """
        select count(*)::int as total
        from event_clusters
        """
    )
    items = query_all(
        f"{cluster_select}\nlimit %s\noffset %s",
        (resolved_page_size, offset),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


@app.get("/users/{user_id}/interests")
def list_user_interests(
    user_id: str,
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    interest_select = """
        select
          ui.*,
          uic.compiled_json,
          uic.compiled_at,
          uic.error_text
        from user_interests ui
        left join user_interests_compiled uic on uic.interest_id = ui.interest_id
        where ui.user_id = %s
        order by ui.updated_at desc
    """
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, 20
    )
    if not paginate:
        return query_all(interest_select, (user_id,))

    total = query_count(
        """
        select count(*)::int as total
        from user_interests
        where user_id = %s
        """,
        (user_id,),
    )
    items = query_all(
        f"{interest_select}\nlimit %s\noffset %s",
        (user_id, resolved_page_size, offset),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


@app.get("/users/{user_id}/matches")
def list_user_matches(
    user_id: str,
    limit: int = Query(default=20, ge=1, le=100),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    family_expr = canonical_article_family_expr("a")
    ranked_match_select = f"""
        select
          a.doc_id,
          a.url,
          a.title,
          a.lead,
          a.lang,
          a.published_at,
          a.ingested_at,
          a.processing_state,
          a.visibility_state,
          a.event_cluster_id,
          sfr.decision as system_feed_decision,
          coalesce(sfr.eligible_for_feed, false) as system_feed_eligible,
          a.has_media,
          coalesce(ars.like_count, 0) as like_count,
          coalesce(ars.dislike_count, 0) as dislike_count,
          imr.interest_id::text as matched_interest_id,
          ui.description as matched_interest_description,
          imr.score_interest as interest_match_score,
          imr.decision as interest_match_decision,
          row_number() over (
            partition by {family_expr}
            order by
              imr.score_interest desc nulls last,
              imr.created_at desc,
              case when a.doc_id = {family_expr} then 0 else 1 end,
              a.published_at desc nulls last,
              a.ingested_at desc,
              a.doc_id
          ) as family_rank
        from interest_match_results imr
        join articles a on a.doc_id = imr.doc_id
        join user_interests ui on ui.interest_id = imr.interest_id
        {system_feed_join_clause("a", "sfr")}
        left join article_reaction_stats ars on ars.doc_id = a.doc_id
        where imr.user_id = %s
          and imr.decision = 'notify'
          and {feed_eligible_article_clause("a", "sfr")}
    """
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, limit
    )
    ranked_params: tuple[Any, ...] = (user_id,)
    deduped_select = f"""
        select
          matched.doc_id,
          matched.url,
          matched.title,
          matched.lead,
          matched.lang,
          matched.published_at,
          matched.processing_state,
          matched.visibility_state,
          matched.event_cluster_id,
          matched.system_feed_decision,
          matched.system_feed_eligible,
          matched.has_media,
          matched.like_count,
          matched.dislike_count,
          matched.matched_interest_id,
          matched.matched_interest_description,
          matched.interest_match_score,
          matched.interest_match_decision
        from ({ranked_match_select}) matched
        where matched.family_rank = 1
    """
    if not paginate:
        return query_all(
            f"{deduped_select}\norder by matched.published_at desc nulls last, matched.ingested_at desc\nlimit %s",
            tuple([*ranked_params, limit]),
        )

    total = query_count(
        f"""
        select count(*)::int as total
        from (
          select distinct {family_expr} as family_doc_id
          from interest_match_results imr
          join articles a on a.doc_id = imr.doc_id
          {system_feed_join_clause("a", "sfr")}
          where imr.user_id = %s
            and imr.decision = 'notify'
            and {feed_eligible_article_clause("a", "sfr")}
        ) deduped
        """,
        ranked_params,
    )
    items = query_all(
        f"{deduped_select}\norder by matched.published_at desc nulls last, matched.ingested_at desc\nlimit %s\noffset %s",
        tuple([*ranked_params, resolved_page_size, offset]),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


@app.get("/users/{user_id}/notifications")
def list_user_notifications(
    user_id: str,
    limit: int = Query(default=20, ge=1, le=100),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    notification_select = """
        select
          nl.*,
          a.title as article_title,
          a.lead as article_lead
        from notification_log nl
        join articles a on a.doc_id = nl.doc_id
        where nl.user_id = %s
        order by nl.created_at desc
    """
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, limit
    )
    if not paginate:
        return query_all(f"{notification_select}\nlimit %s", (user_id, limit))

    total = query_count(
        """
        select count(*)::int as total
        from notification_log
        where user_id = %s
        """,
        (user_id,),
    )
    items = query_all(
        f"{notification_select}\nlimit %s\noffset %s",
        (user_id, resolved_page_size, offset),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


@app.get("/templates/llm")
def list_llm_templates(
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    llm_template_select = """
        select *
        from llm_prompt_templates
        order by is_active desc, updated_at desc
    """
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, 20
    )
    if not paginate:
        return query_all(llm_template_select)

    total = query_count(
        """
        select count(*)::int as total
        from llm_prompt_templates
        """
    )
    items = query_all(
        f"{llm_template_select}\nlimit %s\noffset %s",
        (resolved_page_size, offset),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


@app.get("/templates/llm/{prompt_template_id}")
def get_llm_template(prompt_template_id: str) -> dict[str, Any]:
    template = query_one(
        """
        select *
        from llm_prompt_templates
        where prompt_template_id = %s
        """,
        (prompt_template_id,),
    )
    if template is None:
        raise HTTPException(status_code=404, detail="LLM template not found.")
    return template


@app.get("/templates/interests")
def list_interest_templates(
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    interest_template_select = """
        select *
        from interest_templates
        order by is_active desc, updated_at desc, created_at desc
    """
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, 20
    )
    if not paginate:
        return query_all(interest_template_select)

    total = query_count(
        """
        select count(*)::int as total
        from interest_templates
        """
    )
    items = query_all(
        f"{interest_template_select}\nlimit %s\noffset %s",
        (resolved_page_size, offset),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


@app.get("/templates/interests/{interest_template_id}")
def get_interest_template(interest_template_id: str) -> dict[str, Any]:
    template = query_one(
        """
        select *
        from interest_templates
        where interest_template_id = %s
        """,
        (interest_template_id,),
    )
    if template is None:
        raise HTTPException(status_code=404, detail="Interest template not found.")
    return template


@app.get("/maintenance/reindex-jobs")
def list_reindex_jobs(
    limit: int = Query(default=20, ge=1, le=100),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    reindex_select = """
        select *
        from reindex_jobs
        order by requested_at desc
    """
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, limit
    )
    if not paginate:
        return query_all(f"{reindex_select}\nlimit %s", (limit,))

    total = query_count(
        """
        select count(*)::int as total
        from reindex_jobs
        """
    )
    items = query_all(
        f"{reindex_select}\nlimit %s\noffset %s",
        (resolved_page_size, offset),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


@app.get("/maintenance/sequences")
def list_sequences(
    limit: int = Query(default=20, ge=1, le=100),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    return list_sequences_page(limit=limit, page=page, page_size=page_size)


@app.get("/maintenance/sequences/{sequence_id}")
def get_sequence(sequence_id: str) -> dict[str, Any]:
    try:
        return get_sequence_definition(sequence_id)
    except SequenceNotFoundError as error:
        raise_sequence_http_exception(error)


@app.post("/maintenance/sequences", status_code=201)
def create_sequence(payload: SequenceCreatePayload) -> dict[str, Any]:
    try:
        return create_sequence_definition(payload)
    except (
        SequenceConflictError,
        SequenceValidationError,
    ) as error:
        raise_sequence_http_exception(error)


@app.patch("/maintenance/sequences/{sequence_id}")
def update_sequence(
    sequence_id: str,
    payload: SequenceUpdatePayload,
) -> dict[str, Any]:
    try:
        return update_sequence_definition(sequence_id, payload)
    except (
        SequenceConflictError,
        SequenceNotFoundError,
        SequenceValidationError,
    ) as error:
        raise_sequence_http_exception(error)


@app.delete("/maintenance/sequences/{sequence_id}")
def delete_sequence(sequence_id: str) -> dict[str, Any]:
    try:
        return archive_sequence_definition(sequence_id)
    except SequenceNotFoundError as error:
        raise_sequence_http_exception(error)


@app.get("/maintenance/sequence-plugins")
def get_sequence_plugins() -> list[dict[str, Any]]:
    return list_sequence_plugins()


@app.get("/maintenance/agent/sequence-tools")
def get_agent_sequence_tools() -> dict[str, Any]:
    return list_agent_sequence_tools()


@app.post("/maintenance/agent/sequences", status_code=201)
def create_agent_sequence(payload: AgentSequenceCreatePayload) -> dict[str, Any]:
    try:
        return create_agent_sequence_request(payload)
    except (
        SequenceConflictError,
        SequenceDispatchError,
        SequenceNotFoundError,
        SequenceValidationError,
    ) as error:
        raise_sequence_http_exception(error)


@app.get("/maintenance/fetch-runs")
def list_fetch_runs(
    limit: int = Query(default=50, ge=1, le=200),
    channel_id: str | None = Query(default=None),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=200, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    fetch_filters: list[str] = []
    params: list[Any] = []
    if channel_id:
        fetch_filters.append("channel_id = %s")
        params.append(channel_id)

    where_clause = f"where {' and '.join(fetch_filters)}" if fetch_filters else ""
    fetch_run_select = f"""
        select *
        from channel_fetch_runs
        {where_clause}
        order by started_at desc
    """
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, limit
    )
    if not paginate:
        return query_all(
            f"{fetch_run_select}\nlimit %s",
            tuple([*params, limit]),
        )

    count_sql = "select count(*)::int as total from channel_fetch_runs"
    if where_clause:
        count_sql = f"{count_sql}\n{where_clause}"
    total = query_count(count_sql, tuple(params))
    items = query_all(
        f"{fetch_run_select}\nlimit %s\noffset %s",
        tuple([*params, resolved_page_size, offset]),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


@app.get("/maintenance/llm-reviews")
def list_llm_reviews(
    limit: int = Query(default=50, ge=1, le=200),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=200, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    llm_review_select = """
        select
          lr.*,
          a.title as article_title
        from llm_review_log lr
        join articles a on a.doc_id = lr.doc_id
        order by lr.created_at desc
    """
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, limit
    )
    if not paginate:
        return query_all(f"{llm_review_select}\nlimit %s", (limit,))

    total = query_count(
        """
        select count(*)::int as total
        from llm_review_log
        """
    )
    items = query_all(
        f"{llm_review_select}\nlimit %s\noffset %s",
        (resolved_page_size, offset),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


@app.get("/maintenance/llm-usage-summary")
def get_llm_usage_summary() -> dict[str, Any]:
    rows = query_all(
        """
        select
          window_name,
          review_count,
          total_tokens,
          prompt_tokens,
          completion_tokens,
          cost_estimate_usd
        from (
          select
            '24h'::text as window_name,
            count(*)::int as review_count,
            coalesce(sum(total_tokens), 0)::int as total_tokens,
            coalesce(sum(prompt_tokens), 0)::int as prompt_tokens,
            coalesce(sum(completion_tokens), 0)::int as completion_tokens,
            coalesce(sum(cost_estimate_usd), 0)::float as cost_estimate_usd
          from llm_review_log
          where created_at >= now() - interval '24 hours'
          union all
          select
            '7d'::text as window_name,
            count(*)::int as review_count,
            coalesce(sum(total_tokens), 0)::int as total_tokens,
            coalesce(sum(prompt_tokens), 0)::int as prompt_tokens,
            coalesce(sum(completion_tokens), 0)::int as completion_tokens,
            coalesce(sum(cost_estimate_usd), 0)::float as cost_estimate_usd
          from llm_review_log
          where created_at >= now() - interval '7 days'
        ) usage_windows
        """
    )
    return {
        row["window_name"]: {
            "review_count": row["review_count"],
            "total_tokens": row["total_tokens"],
            "prompt_tokens": row["prompt_tokens"],
            "completion_tokens": row["completion_tokens"],
            "cost_estimate_usd": row["cost_estimate_usd"],
        }
        for row in rows
    }


@app.get("/maintenance/outbox")
def list_outbox_events(limit: int = Query(default=50, ge=1, le=200)) -> list[dict[str, Any]]:
    return query_all(
        """
        select *
        from outbox_events
        order by created_at desc
        limit %s
        """,
        (limit,),
    )


@app.post("/maintenance/sequences/{sequence_id}/runs", status_code=202)
def request_sequence_run(
    sequence_id: str,
    payload: SequenceManualRunPayload,
) -> dict[str, Any]:
    try:
        return create_sequence_run_request(sequence_id, payload)
    except (
        SequenceConflictError,
        SequenceDispatchError,
        SequenceNotFoundError,
        SequenceValidationError,
    ) as error:
        raise_sequence_http_exception(error)


@app.get("/maintenance/sequence-runs/{run_id}")
def get_sequence_run_status(run_id: str) -> dict[str, Any]:
    try:
        return get_sequence_run(run_id)
    except SequenceNotFoundError as error:
        raise_sequence_http_exception(error)


@app.get("/maintenance/sequence-runs/{run_id}/task-runs")
def get_sequence_run_task_runs(run_id: str) -> list[dict[str, Any]]:
    try:
        return list_sequence_task_runs(run_id)
    except SequenceNotFoundError as error:
        raise_sequence_http_exception(error)


@app.post("/maintenance/sequence-runs/{run_id}/cancel")
def cancel_sequence_run(
    run_id: str,
    payload: SequenceCancelPayload | None = None,
) -> dict[str, Any]:
    try:
        return cancel_sequence_run_request(
            run_id,
            reason=payload.reason if payload is not None else None,
        )
    except (
        SequenceConflictError,
        SequenceNotFoundError,
    ) as error:
        raise_sequence_http_exception(error)
