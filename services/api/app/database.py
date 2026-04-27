from __future__ import annotations

import os
from typing import Any

import psycopg
from psycopg.rows import dict_row


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
