from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable
from typing import Any

import psycopg

SelectionResultFetcher = Callable[
    [Any, str | uuid.UUID],
    Awaitable[dict[str, Any] | None],
]
SelectionGateFetcher = Callable[
    [Any, str | uuid.UUID],
    Awaitable[dict[str, Any] | None],
]
OpenConnectionFactory = Callable[[], Awaitable[Any]]


def _legacy_worker_main() -> Any:
    from . import main as legacy_main

    return legacy_main


async def fetch_final_selection_result_row(
    cursor: psycopg.AsyncCursor[Any],
    doc_id: str | uuid.UUID,
) -> dict[str, Any] | None:
    await cursor.execute(
        """
        select
          final_decision,
          is_selected,
          compat_system_feed_decision,
          verification_target_type,
          verification_target_id,
          verification_state,
          total_filter_count,
          matched_filter_count,
          no_match_filter_count,
          gray_zone_filter_count,
          technical_filtered_out_count,
          explain_json
        from final_selection_results
        where doc_id = %s
        """,
        (doc_id,),
    )
    return await cursor.fetchone()


async def fetch_system_feed_result_row(
    cursor: psycopg.AsyncCursor[Any],
    doc_id: str | uuid.UUID,
) -> dict[str, Any] | None:
    await cursor.execute(
        """
        select
          decision,
          eligible_for_feed,
          total_criteria_count,
          relevant_criteria_count,
          irrelevant_criteria_count,
          pending_llm_criteria_count,
          explain_json
        from system_feed_results
        where doc_id = %s
        """,
        (doc_id,),
    )
    return await cursor.fetchone()


async def fetch_selection_gate_result_row(
    cursor: psycopg.AsyncCursor[Any],
    doc_id: str | uuid.UUID,
    *,
    fetch_final_selection_result_row_func: SelectionResultFetcher | None = None,
    fetch_system_feed_result_row_func: SelectionResultFetcher | None = None,
) -> dict[str, Any] | None:
    if (
        fetch_final_selection_result_row_func is None
        or fetch_system_feed_result_row_func is None
    ):
        legacy_main = _legacy_worker_main()
        fetch_final_selection_result_row_func = (
            fetch_final_selection_result_row_func
            or legacy_main.fetch_final_selection_result_row
        )
        fetch_system_feed_result_row_func = (
            fetch_system_feed_result_row_func or legacy_main.fetch_system_feed_result_row
        )

    final_selection_result = await fetch_final_selection_result_row_func(cursor, doc_id)
    if final_selection_result is not None:
        return {
            "selection_source": "final_selection_results",
            "decision": str(final_selection_result.get("final_decision") or ""),
            "is_selected": bool(final_selection_result.get("is_selected")),
            "compat_system_feed_decision": str(
                final_selection_result.get("compat_system_feed_decision") or ""
            ),
            "verification_target_type": final_selection_result.get(
                "verification_target_type"
            ),
            "verification_target_id": final_selection_result.get("verification_target_id"),
            "verification_state": final_selection_result.get("verification_state"),
            "selection_reuse_source": "article_level",
        }

    await cursor.execute(
        """
        select canonical_doc_id
        from articles
        where doc_id = %s
        """,
        (doc_id,),
    )
    article_row = await cursor.fetchone() or {}
    canonical_document_id = article_row.get("canonical_doc_id")
    if canonical_document_id is not None:
        await cursor.execute(
            """
            select
              fsr.final_decision,
              fsr.is_selected,
              fsr.compat_system_feed_decision,
              fsr.verification_target_type,
              fsr.verification_target_id,
              fsr.verification_state
            from final_selection_results fsr
            where fsr.canonical_document_id = %s
            order by fsr.is_selected desc, fsr.updated_at desc, fsr.doc_id asc
            limit 1
            """,
            (canonical_document_id,),
        )
        canonical_final_selection = await cursor.fetchone()
        if canonical_final_selection is not None:
            return {
                "selection_source": "final_selection_results",
                "decision": str(canonical_final_selection.get("final_decision") or ""),
                "is_selected": bool(canonical_final_selection.get("is_selected")),
                "compat_system_feed_decision": str(
                    canonical_final_selection.get("compat_system_feed_decision") or ""
                ),
                "verification_target_type": canonical_final_selection.get(
                    "verification_target_type"
                ),
                "verification_target_id": canonical_final_selection.get(
                    "verification_target_id"
                ),
                "verification_state": canonical_final_selection.get("verification_state"),
                "selection_reuse_source": "canonical_reused",
            }

    system_feed_result = await fetch_system_feed_result_row_func(cursor, doc_id)
    if system_feed_result is None:
        if canonical_document_id is None:
            return None
        await cursor.execute(
            """
            select sfr.*
            from system_feed_results sfr
            join articles a on a.doc_id = sfr.doc_id
            where a.canonical_doc_id = %s
            order by coalesce(sfr.eligible_for_feed, false) desc, sfr.updated_at desc, sfr.doc_id asc
            limit 1
            """,
            (canonical_document_id,),
        )
        system_feed_result = await cursor.fetchone()
        if system_feed_result is None:
            return None

    return {
        "selection_source": "system_feed_results",
        "decision": str(system_feed_result.get("decision") or ""),
        "is_selected": bool(system_feed_result.get("eligible_for_feed")),
        "compat_system_feed_decision": str(system_feed_result.get("decision") or ""),
        "verification_target_type": None,
        "verification_target_id": None,
        "verification_state": None,
        "selection_reuse_source": (
            "canonical_reused" if canonical_document_id is not None else "article_level"
        ),
    }


async def is_article_eligible_for_personalization(
    *,
    doc_id: str,
    open_connection_func: OpenConnectionFactory | None = None,
    fetch_selection_gate_result_row_func: SelectionGateFetcher | None = None,
) -> bool:
    if open_connection_func is None or fetch_selection_gate_result_row_func is None:
        legacy_main = _legacy_worker_main()
        open_connection_func = open_connection_func or legacy_main.open_connection
        fetch_selection_gate_result_row_func = (
            fetch_selection_gate_result_row_func
            or legacy_main.fetch_selection_gate_result_row
        )

    async with await open_connection_func() as connection:
        async with connection.cursor() as cursor:
            result = await fetch_selection_gate_result_row_func(cursor, doc_id)
    return bool(result and result.get("is_selected"))
