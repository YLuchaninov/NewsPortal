from __future__ import annotations

import os


def build_database_url() -> str:
    if os.getenv("DATABASE_URL"):
        return os.environ["DATABASE_URL"]

    user = os.getenv("POSTGRES_USER", "signalops")
    password = os.getenv("POSTGRES_PASSWORD", "signalops")
    host = os.getenv("POSTGRES_HOST", "127.0.0.1")
    port = os.getenv(
        "POSTGRES_PORT",
        "55432" if host in {"127.0.0.1", "localhost"} else "5432",
    )
    database = os.getenv("POSTGRES_DB", "signalops")
    return f"postgresql://{user}:{password}@{host}:{port}/{database}"
