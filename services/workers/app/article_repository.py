from __future__ import annotations

from typing import Any

import psycopg


async def fetch_article_for_update(
    cursor: psycopg.AsyncCursor[Any],
    doc_id: str,
) -> dict[str, Any]:
    await cursor.execute(
        """
        select
          a.*,
          sc.language as channel_language
        from articles a
        join source_channels sc on sc.channel_id = a.channel_id
        where a.doc_id = %s
        for update of a
        """,
        (doc_id,),
    )
    article = await cursor.fetchone()
    if article is None:
        raise ValueError(f"Article {doc_id} was not found.")
    return article
