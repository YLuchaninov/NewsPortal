from __future__ import annotations

from typing import Any

import psycopg


async def fetch_interest_for_update(
    cursor: psycopg.AsyncCursor[Any],
    interest_id: str,
) -> dict[str, Any]:
    await cursor.execute(
        """
        select *
        from user_interests
        where interest_id = %s
        for update
        """,
        (interest_id,),
    )
    interest = await cursor.fetchone()
    if interest is None:
        raise ValueError(f"Interest {interest_id} was not found.")
    return interest


async def fetch_criterion_for_update(
    cursor: psycopg.AsyncCursor[Any],
    criterion_id: str,
) -> dict[str, Any]:
    await cursor.execute(
        """
        select *
        from criteria
        where criterion_id = %s
        for update
        """,
        (criterion_id,),
    )
    criterion = await cursor.fetchone()
    if criterion is None:
        raise ValueError(f"Criterion {criterion_id} was not found.")
    return criterion
