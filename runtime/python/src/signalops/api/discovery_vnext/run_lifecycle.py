from __future__ import annotations

from typing import Any

from psycopg.types.json import Json

from signalops.api.database import query_one
from signalops.api.discovery_vnext.orchestration_helpers import rank_search_results
from signalops.api.discovery_vnext.providers import _json_safe


def complete_run(
    run_id: str,
    *,
    status: str,
    result: dict[str, Any] | None = None,
    error: dict[str, Any] | None = None,
) -> None:
    if not run_id:
        return
    query_one(
        """
        update discovery_vnext_runs
        set status = %s,
            result_json = %s,
            error_json = %s,
            completed_at = now(),
            updated_at = now()
        where vnext_run_id = %s
        returning vnext_run_id
        """,
        (status, Json(_json_safe(result or {})), Json(_json_safe(error or {})), run_id),
    )


def start_run_step(vnext_run_id: str, step_kind: str, input_json: dict[str, Any]) -> dict[str, Any]:
    row = query_one(
        """
        insert into discovery_run_steps (
          vnext_run_id,
          step_kind,
          status,
          input_json,
          started_at
        )
        values (%s, %s, 'running', %s, now())
        returning *
        """,
        (vnext_run_id, step_kind, Json(_json_safe(input_json))),
    )
    return row or {}


def finish_run_step(
    run_step_id: str,
    status: str,
    output: dict[str, Any] | None = None,
    error: dict[str, Any] | None = None,
) -> None:
    query_one(
        """
        update discovery_run_steps
        set status = %s,
            output_json = %s,
            error_json = %s,
            completed_at = now(),
            updated_at = now()
        where run_step_id = %s
        returning run_step_id
        """,
        (status, Json(_json_safe(output or {})), Json(_json_safe(error or {})), run_step_id),
    )


def insert_query_attempt(
    *,
    run_id: str,
    hypothesis_artifact_id: str | None,
    provider: str,
    query_text: str,
    query_family_intent: str,
    live_provider_execution: bool,
    created_by: str,
) -> dict[str, Any]:
    row = query_one(
        """
        insert into discovery_query_attempts (
          vnext_run_id,
          hypothesis_artifact_id,
          provider,
          query_text,
          query_family_intent,
          status,
          request_json,
          live_provider_execution,
          created_by,
          started_at
        )
        values (%s, %s, %s, %s, %s, 'running', %s, %s, %s, now())
        returning *
        """,
        (
            run_id,
            hypothesis_artifact_id,
            provider,
            query_text,
            query_family_intent,
            Json({"query": query_text, "provider": provider}),
            live_provider_execution,
            created_by,
        ),
    )
    return row or {}


def rank_discovery_search_results(
    results: list[dict[str, Any]],
    *,
    interest: dict[str, Any],
    query_text: str,
) -> list[dict[str, Any]]:
    return rank_search_results(results, interest=interest, query_text=query_text)


def finish_query_attempt(
    query_attempt_id: str,
    status: str,
    *,
    meta: dict[str, Any] | None = None,
    results: list[dict[str, Any]] | None = None,
    quality_artifact: dict[str, Any] | None = None,
    error: dict[str, Any] | None = None,
) -> None:
    query_one(
        """
        update discovery_query_attempts
        set status = %s,
            query_quality_artifact_id = %s,
            response_json = %s,
            error_json = %s,
            result_count = %s,
            request_count = %s,
            cost_cents = %s,
            completed_at = now()
        where query_attempt_id = %s
        returning query_attempt_id
        """,
        (
            status,
            (quality_artifact or {}).get("artifact_id"),
            Json(
                {
                    "meta": meta or {},
                    "results": results or [],
                    "queryQuality": (quality_artifact or {}).get("payload_json")
                    or (quality_artifact or {}).get("payload")
                    or {},
                }
            ),
            Json(error or {}),
            len(results or []),
            int((meta or {}).get("request_count") or (1 if results else 0)),
            int((meta or {}).get("cost_cents") or 0),
            query_attempt_id,
        ),
    )
