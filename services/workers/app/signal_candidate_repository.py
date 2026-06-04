from __future__ import annotations

from typing import Any

import psycopg


async def fetch_signal_candidate_for_update(
    cursor: psycopg.AsyncCursor[Any],
    doc_id: str,
) -> dict[str, Any]:
    await cursor.execute(
        """
        select
          a.*,
          sc.language as channel_language
        from signal_candidates a
        join source_channels sc on sc.channel_id = a.channel_id
        where a.doc_id = %s
        for update of a
        """,
        (doc_id,),
    )
    signal_candidate = await cursor.fetchone()
    if signal_candidate is None:
        raise ValueError(f"SignalCandidate {doc_id} was not found.")
    return signal_candidate
