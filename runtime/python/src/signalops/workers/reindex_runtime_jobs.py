from __future__ import annotations

import hashlib
import json
from typing import Any

import psycopg
from psycopg.types.json import Json

from .runtime_db import open_connection
from .runtime_json import coerce_json_object, make_json_safe

REINDEX_RUNTIME_OPTION_KEYS = {
    "backfill",
    "contentAnalysis",
    "progress",
    "rebuild",
    "result",
    "selectionProfileSnapshot",
}
REINDEX_BATCH_ONLY_OPTION_KEYS = {"batchSize"}


def _normalize_reindex_cancellation_value(value: Any) -> Any:
    if isinstance(value, list):
        return sorted(
            (_normalize_reindex_cancellation_value(item) for item in value),
            key=lambda item: json.dumps(item, sort_keys=True, default=str),
        )
    if isinstance(value, dict):
        return {
            key: _normalize_reindex_cancellation_value(value[key])
            for key in sorted(value)
            if key not in REINDEX_RUNTIME_OPTION_KEYS
            and key not in REINDEX_BATCH_ONLY_OPTION_KEYS
        }
    return value


def build_reindex_cancellation_key(
    *,
    index_name: str,
    job_kind: str,
    options_json: dict[str, Any],
) -> str:
    normalized_options = json.dumps(
        _normalize_reindex_cancellation_value(options_json),
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )
    digest = hashlib.sha256(normalized_options.encode("utf-8")).hexdigest()
    return ":".join(
        [
            "reindex",
            index_name,
            job_kind,
            "sha256",
            digest,
        ]
    )


async def read_reindex_job_context(
    cursor: psycopg.AsyncCursor[Any],
    reindex_job_id: str,
) -> tuple[str, dict[str, Any], str]:
    await cursor.execute(
        """
        select job_kind, options_json, status
        from reindex_jobs
        where reindex_job_id = %s
        for update
        """,
        (reindex_job_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        raise ValueError(f"Reindex job {reindex_job_id} was not found.")
    return (
        str(row.get("job_kind") or "rebuild"),
        coerce_json_object(row.get("options_json")),
        str(row.get("status") or "queued"),
    )


async def is_reindex_job_cancel_requested(reindex_job_id: str) -> bool:
    async with await open_connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(
                """
                select status
                from reindex_jobs
                where reindex_job_id = %s
                """,
                (reindex_job_id,),
            )
            row = await cursor.fetchone()
    return bool(row and str(row.get("status") or "") in {"cancel_requested", "cancelled"})


async def update_reindex_job_options(
    reindex_job_id: str,
    patch: dict[str, Any],
) -> None:
    async with await open_connection() as connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                await cursor.execute(
                    """
                    update reindex_jobs
                    set
                      options_json = options_json || %s::jsonb,
                      updated_at = now()
                    where reindex_job_id = %s
                    """,
                    (Json(make_json_safe(patch)), reindex_job_id),
                )


async def read_active_selection_profile_snapshot() -> dict[str, Any]:
    async with await open_connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(
                """
                select
                  count(*)::int as total_profiles,
                  count(*) filter (where status = 'active')::int as active_profiles,
                  count(*) filter (
                    where profile_family = 'compatibility_interest_template'
                  )::int as compatibility_profiles,
                  count(distinct source_interest_template_id)::int
                    as templates_with_profiles,
                  coalesce(max(version), 0)::int as max_version
                from selection_profiles
                """
            )
            row = await cursor.fetchone()

    snapshot = row or {}
    return {
        "totalProfiles": int(snapshot.get("total_profiles") or 0),
        "activeProfiles": int(snapshot.get("active_profiles") or 0),
        "compatibilityProfiles": int(snapshot.get("compatibility_profiles") or 0),
        "templatesWithProfiles": int(snapshot.get("templates_with_profiles") or 0),
        "maxVersion": int(snapshot.get("max_version") or 0),
    }
