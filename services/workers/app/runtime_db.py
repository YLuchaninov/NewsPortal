from __future__ import annotations

import os
from typing import Any
from urllib.parse import urlparse

import psycopg
import redis
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


def build_redis_url() -> str:
    if os.getenv("REDIS_URL"):
        return os.environ["REDIS_URL"]

    host = os.getenv("REDIS_HOST", "127.0.0.1")
    port = os.getenv(
        "REDIS_PORT",
        "56379" if host in {"127.0.0.1", "localhost"} else "6379",
    )
    return f"redis://{host}:{port}"


def build_redis_connection_options() -> dict[str, Any]:
    parsed = urlparse(build_redis_url())
    return {
        "host": parsed.hostname or "127.0.0.1",
        "port": parsed.port or 6379,
        "db": int(parsed.path.lstrip("/") or "0"),
    }


def check_database() -> None:
    with psycopg.connect(build_database_url()) as connection:
        with connection.cursor() as cursor:
            cursor.execute("select 1")


def check_redis() -> None:
    client = redis.Redis.from_url(build_redis_url())
    try:
        client.ping()
    finally:
        client.close()


async def open_connection() -> psycopg.AsyncConnection[Any]:
    return await psycopg.AsyncConnection.connect(
        build_database_url(),
        row_factory=dict_row,
    )
