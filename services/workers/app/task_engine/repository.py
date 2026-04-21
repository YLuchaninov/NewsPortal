from __future__ import annotations

import asyncio
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Protocol

from .models import SequenceDefinition, SequenceRunRecord


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


class SequenceRepository(Protocol):
    async def get_sequence(self, sequence_id: str) -> SequenceDefinition | None: ...

    async def get_run(self, run_id: str) -> SequenceRunRecord | None: ...

    async def create_pending_run(
        self,
        *,
        sequence_id: str,
        context_json: dict[str, Any],
        trigger_type: str,
        trigger_meta: dict[str, Any],
    ) -> str: ...

    async def mark_run_running(self, run_id: str) -> bool: ...

    async def mark_run_completed(self, run_id: str, *, context_json: dict[str, Any]) -> None: ...

    async def mark_run_failed(
        self,
        run_id: str,
        *,
        context_json: dict[str, Any],
        error_text: str,
    ) -> None: ...

    async def increment_sequence_run_count(self, sequence_id: str) -> None: ...

    async def create_running_task_run(
        self,
        *,
        run_id: str,
        task_index: int,
        task_key: str,
        module: str,
        options_json: dict[str, Any],
        input_json: dict[str, Any],
    ) -> str: ...

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
    ) -> str: ...

    async def mark_task_run_completed(
        self,
        task_run_id: str,
        *,
        output_json: dict[str, Any],
        duration_ms: int,
    ) -> None: ...

    async def mark_task_run_failed(
        self,
        task_run_id: str,
        *,
        error_text: str,
        duration_ms: int,
    ) -> None: ...

    async def list_task_runs(self, run_id: str) -> list[dict[str, Any]]: ...


class SequenceScheduleRepository(Protocol):
    async def list_active_cron_sequences(self) -> list[SequenceDefinition]: ...

    async def create_pending_cron_run(
        self,
        *,
        sequence_id: str,
        scheduled_for: datetime,
        trigger_meta: dict[str, Any],
    ) -> str | None: ...

    async def mark_run_failed(
        self,
        run_id: str,
        *,
        context_json: dict[str, Any],
        error_text: str,
    ) -> None: ...


class PostgresSequenceRepository:
    def __init__(self, database_url: str | None = None):
        self._database_url = database_url or build_database_url()

    async def get_sequence(self, sequence_id: str) -> SequenceDefinition | None:
        row = await asyncio.to_thread(self._fetch_sequence, sequence_id)
        return SequenceDefinition.from_record(row) if row else None

    async def get_run(self, run_id: str) -> SequenceRunRecord | None:
        row = await asyncio.to_thread(self._fetch_run, run_id)
        return SequenceRunRecord.from_record(row) if row else None

    async def create_pending_run(
        self,
        *,
        sequence_id: str,
        context_json: dict[str, Any],
        trigger_type: str,
        trigger_meta: dict[str, Any],
    ) -> str:
        return await asyncio.to_thread(
            self._create_pending_run,
            sequence_id,
            context_json,
            trigger_type,
            trigger_meta,
        )

    async def mark_run_running(self, run_id: str) -> bool:
        return await asyncio.to_thread(self._mark_run_running, run_id)

    async def mark_run_completed(self, run_id: str, *, context_json: dict[str, Any]) -> None:
        await asyncio.to_thread(self._mark_run_completed, run_id, context_json)

    async def mark_run_failed(
        self,
        run_id: str,
        *,
        context_json: dict[str, Any],
        error_text: str,
    ) -> None:
        await asyncio.to_thread(self._mark_run_failed, run_id, context_json, error_text)

    async def list_active_cron_sequences(self) -> list[SequenceDefinition]:
        rows = await asyncio.to_thread(self._list_active_cron_sequences)
        return [SequenceDefinition.from_record(row) for row in rows]

    async def create_pending_cron_run(
        self,
        *,
        sequence_id: str,
        scheduled_for: datetime,
        trigger_meta: dict[str, Any],
    ) -> str | None:
        return await asyncio.to_thread(
            self._create_pending_cron_run,
            sequence_id,
            scheduled_for,
            trigger_meta,
        )

    async def increment_sequence_run_count(self, sequence_id: str) -> None:
        await asyncio.to_thread(self._increment_sequence_run_count, sequence_id)

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
        return await asyncio.to_thread(
            self._create_running_task_run,
            run_id,
            task_index,
            task_key,
            module,
            options_json,
            input_json,
        )

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
        return await asyncio.to_thread(
            self._create_skipped_task_run,
            run_id,
            task_index,
            task_key,
            module,
            options_json,
            input_json,
            output_json,
        )

    async def mark_task_run_completed(
        self,
        task_run_id: str,
        *,
        output_json: dict[str, Any],
        duration_ms: int,
    ) -> None:
        await asyncio.to_thread(
            self._mark_task_run_completed,
            task_run_id,
            output_json,
            duration_ms,
        )

    async def mark_task_run_failed(
        self,
        task_run_id: str,
        *,
        error_text: str,
        duration_ms: int,
    ) -> None:
        await asyncio.to_thread(
            self._mark_task_run_failed,
            task_run_id,
            error_text,
            duration_ms,
        )

    async def list_task_runs(self, run_id: str) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._list_task_runs, run_id)

    def _connect(self) -> Any:
        import psycopg
        from psycopg.rows import dict_row

        return psycopg.connect(self._database_url, row_factory=dict_row)

    def _fetch_sequence(self, sequence_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
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
                      created_by
                    from sequences
                    where sequence_id = %s
                    """,
                    (sequence_id,),
                )
                row = cursor.fetchone()
        return dict(row) if row else None

    def _fetch_run(self, run_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    select
                      run_id::text as run_id,
                      sequence_id::text as sequence_id,
                      status,
                      context_json,
                      trigger_type,
                      trigger_meta,
                      error_text
                    from sequence_runs
                    where run_id = %s
                    """,
                    (run_id,),
                )
                row = cursor.fetchone()
        return dict(row) if row else None

    def _create_pending_run(
        self,
        sequence_id: str,
        context_json: dict[str, Any],
        trigger_type: str,
        trigger_meta: dict[str, Any],
    ) -> str:
        run_id = str(uuid.uuid4())
        with self._connect() as connection:
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
                        raise ValueError(f"Sequence {sequence_id} was not found.")
                    if str(sequence_row["status"]) == "archived":
                        raise ValueError(f"Sequence {sequence_id} is archived and cannot be run.")

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
                        returning run_id::text as run_id
                        """,
                        (
                            run_id,
                            sequence_id,
                            self._json(context_json),
                            trigger_type,
                            self._json(trigger_meta),
                        ),
                    )
                    row = cursor.fetchone()
        if not row:
            raise RuntimeError(f"Failed to create sequence run for {sequence_id}.")
        return str(row["run_id"])

    def _mark_run_running(self, run_id: str) -> bool:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    update sequence_runs
                    set status = 'running', started_at = now(), error_text = null
                    where run_id = %s
                      and status = 'pending'
                    """,
                    (run_id,),
                )
                return cursor.rowcount > 0

    def _mark_run_completed(self, run_id: str, context_json: dict[str, Any]) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    update sequence_runs
                    set
                      status = 'completed',
                      context_json = %s::jsonb,
                      finished_at = now(),
                      error_text = null
                    where run_id = %s
                    """,
                    (self._json(context_json), run_id),
                )

    def _mark_run_failed(
        self,
        run_id: str,
        context_json: dict[str, Any],
        error_text: str,
    ) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    update sequence_runs
                    set
                      status = 'failed',
                      context_json = %s::jsonb,
                      finished_at = now(),
                      error_text = %s
                    where run_id = %s
                    """,
                    (self._json(context_json), error_text, run_id),
                )

    def _list_active_cron_sequences(self) -> list[dict[str, Any]]:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
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
                      created_by
                    from sequences
                    where status = 'active'
                      and cron is not null
                      and btrim(cron) <> ''
                      and (max_runs is null or run_count < max_runs)
                    order by updated_at desc, created_at desc
                    """
                )
                return [dict(row) for row in cursor.fetchall()]

    def _create_pending_cron_run(
        self,
        sequence_id: str,
        scheduled_for: datetime,
        trigger_meta: dict[str, Any],
    ) -> str | None:
        scheduled_for_utc = scheduled_for.astimezone(timezone.utc).replace(
            second=0,
            microsecond=0,
        )
        scheduled_for_iso = scheduled_for_utc.isoformat()
        run_id = str(uuid.uuid4())

        with self._connect() as connection:
            with connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        select pg_try_advisory_xact_lock(hashtext(%s), hashtext(%s)) as acquired
                        """,
                        (f"sequence-cron:{sequence_id}", scheduled_for_iso),
                    )
                    lock_row = cursor.fetchone()
                    if not lock_row or not bool(lock_row["acquired"]):
                        return None

                    cursor.execute(
                        """
                        select run_id::text as run_id
                        from sequence_runs
                        where sequence_id = %s
                          and trigger_type = 'cron'
                          and coalesce(trigger_meta ->> 'scheduledFor', '') = %s
                        limit 1
                        """,
                        (sequence_id, scheduled_for_iso),
                    )
                    existing = cursor.fetchone()
                    if existing is not None:
                        return None

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
                        values (%s, %s, 'pending', '{}'::jsonb, 'cron', %s::jsonb)
                        returning run_id::text as run_id
                        """,
                        (
                            run_id,
                            sequence_id,
                            self._json(
                                {
                                    **trigger_meta,
                                    "scheduledFor": scheduled_for_iso,
                                }
                            ),
                        ),
                    )
                    row = cursor.fetchone()

        return str(row["run_id"]) if row else None

    def _increment_sequence_run_count(self, sequence_id: str) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    update sequences
                    set run_count = run_count + 1, updated_at = now()
                    where sequence_id = %s
                    """,
                    (sequence_id,),
                )

    def _create_running_task_run(
        self,
        run_id: str,
        task_index: int,
        task_key: str,
        module: str,
        options_json: dict[str, Any],
        input_json: dict[str, Any],
    ) -> str:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    insert into sequence_task_runs (
                      run_id,
                      task_index,
                      task_key,
                      module,
                      status,
                      options_json,
                      input_json,
                      started_at
                    )
                    values (%s, %s, %s, %s, 'running', %s::jsonb, %s::jsonb, now())
                    returning task_run_id::text as task_run_id
                    """,
                    (
                        run_id,
                        task_index,
                        task_key,
                        module,
                        self._json(options_json),
                        self._json(input_json),
                    ),
                )
                row = cursor.fetchone()

        if not row:
            raise RuntimeError("Failed to create running sequence_task_run row.")

        return str(row["task_run_id"])

    def _create_skipped_task_run(
        self,
        run_id: str,
        task_index: int,
        task_key: str,
        module: str,
        options_json: dict[str, Any],
        input_json: dict[str, Any],
        output_json: dict[str, Any],
    ) -> str:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    insert into sequence_task_runs (
                      run_id,
                      task_index,
                      task_key,
                      module,
                      status,
                      options_json,
                      input_json,
                      output_json,
                      started_at,
                      finished_at,
                      duration_ms
                    )
                    values (
                      %s,
                      %s,
                      %s,
                      %s,
                      'skipped',
                      %s::jsonb,
                      %s::jsonb,
                      %s::jsonb,
                      now(),
                      now(),
                      0
                    )
                    returning task_run_id::text as task_run_id
                    """,
                    (
                        run_id,
                        task_index,
                        task_key,
                        module,
                        self._json(options_json),
                        self._json(input_json),
                        self._json(output_json),
                    ),
                )
                row = cursor.fetchone()

        if not row:
            raise RuntimeError("Failed to create skipped sequence_task_run row.")

        return str(row["task_run_id"])

    def _mark_task_run_completed(
        self,
        task_run_id: str,
        output_json: dict[str, Any],
        duration_ms: int,
    ) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    update sequence_task_runs
                    set
                      status = 'completed',
                      output_json = %s::jsonb,
                      finished_at = now(),
                      duration_ms = %s,
                      error_text = null
                    where task_run_id = %s
                    """,
                    (self._json(output_json), duration_ms, task_run_id),
                )

    def _mark_task_run_failed(
        self,
        task_run_id: str,
        error_text: str,
        duration_ms: int,
    ) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    update sequence_task_runs
                    set
                      status = 'failed',
                      finished_at = now(),
                      duration_ms = %s,
                      error_text = %s
                    where task_run_id = %s
                    """,
                    (duration_ms, error_text, task_run_id),
                )

    def _list_task_runs(self, run_id: str) -> list[dict[str, Any]]:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
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
                return [dict(row) for row in cursor.fetchall()]

    def _json(self, value: dict[str, Any]) -> Any:
        from psycopg.types.json import Json

        return Json(value)
