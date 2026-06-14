from __future__ import annotations

from typing import Any

import psycopg
from psycopg.rows import dict_row

from signalops.runtime_config import build_database_url


def check_database() -> None:
    with psycopg.connect(build_database_url()) as connection:
        with connection.cursor() as cursor:
            cursor.execute("select 1")


def query_all(sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    with psycopg.connect(build_database_url(), row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(sql, params)
            return [dict(row) for row in cursor.fetchall()]


def query_one(sql: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
    rows = query_all(sql, params)
    return rows[0] if rows else None


def query_count(sql: str, params: tuple[Any, ...] = ()) -> int:
    row = query_one(sql, params)
    return int(row["total"]) if row and row.get("total") is not None else 0
