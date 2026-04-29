from __future__ import annotations

import sys
import types
from typing import Any


def install_psycopg_stub(
    *,
    connection: type[Any] | None = None,
    async_connection: type[Any] | None = None,
    async_cursor: type[Any] | None = None,
) -> None:
    if "psycopg" not in sys.modules:
        psycopg_stub = types.ModuleType("psycopg")
        psycopg_stub.connect = lambda *args, **kwargs: None
        if connection is not None:
            psycopg_stub.Connection = connection
        if async_connection is not None:
            psycopg_stub.AsyncConnection = async_connection
        if async_cursor is not None:
            psycopg_stub.AsyncCursor = async_cursor
        sys.modules["psycopg"] = psycopg_stub

    if "psycopg.rows" not in sys.modules:
        psycopg_rows_stub = types.ModuleType("psycopg.rows")
        psycopg_rows_stub.dict_row = object()
        sys.modules["psycopg.rows"] = psycopg_rows_stub

    if "psycopg.types" not in sys.modules:
        sys.modules["psycopg.types"] = types.ModuleType("psycopg.types")

    if "psycopg.types.json" not in sys.modules:
        psycopg_types_json_stub = types.ModuleType("psycopg.types.json")
        psycopg_types_json_stub.Json = lambda value: value
        sys.modules["psycopg.types.json"] = psycopg_types_json_stub


def install_redis_stub(redis_cls: type[Any]) -> None:
    if "redis" not in sys.modules:
        redis_stub = types.ModuleType("redis")
        redis_stub.Redis = redis_cls
        sys.modules["redis"] = redis_stub


def install_bullmq_stub(job_cls: type[Any], worker_cls: type[Any]) -> None:
    if "bullmq" not in sys.modules:
        bullmq_stub = types.ModuleType("bullmq")
        bullmq_stub.Job = job_cls
        bullmq_stub.Worker = worker_cls
        sys.modules["bullmq"] = bullmq_stub
