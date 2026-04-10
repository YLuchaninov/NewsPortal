from __future__ import annotations

from typing import Any

import psycopg
from psycopg.rows import dict_row

from .common import build_database_url


class PostgresArticleLoaderAdapter:
    def __init__(self, database_url: str | None = None) -> None:
        self._database_url = database_url or build_database_url()

    def load_articles(
        self,
        *,
        filters: dict[str, Any],
        limit: int,
        include_blocked: bool,
    ) -> list[dict[str, Any]]:
        sql = """
            select
              doc_id::text as doc_id,
              title,
              body,
              language,
              visibility_state,
              published_at
            from articles
        """
        conditions: list[str] = []
        params: list[Any] = []
        if not include_blocked:
            conditions.append("visibility_state = 'visible'")
        if isinstance(filters.get("lang"), str) and filters["lang"].strip():
            conditions.append("language = %s")
            params.append(filters["lang"].strip())
        if conditions:
            sql = f"{sql}\nwhere {' and '.join(conditions)}"
        sql = f"{sql}\norder by published_at desc nulls last, ingested_at desc\nlimit %s"
        params.append(limit)

        with psycopg.connect(self._database_url, row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                cursor.execute(sql, tuple(params))
                return [dict(row) for row in cursor.fetchall()]

