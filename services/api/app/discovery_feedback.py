from __future__ import annotations

from typing import Any, Callable


class DiscoveryFeedbackConflict(ValueError):
    pass


def create_discovery_feedback(
    payload: Any,
    *,
    discovery_feedback_select_sql_func: Callable[[], str],
    query_one_func: Callable[[str, tuple[Any, ...]], dict[str, Any] | None],
    build_database_url_func: Callable[[], str],
    connect_func: Callable[..., Any],
    dict_row_value: Any,
) -> dict[str, Any]:
    mission_id = str(payload.mission_id or "").strip() or None
    candidate_id = str(payload.candidate_id or "").strip() or None
    source_profile_id = str(payload.source_profile_id or "").strip() or None
    with connect_func(build_database_url_func(), row_factory=dict_row_value) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                insert into discovery_feedback_events (
                  mission_id,
                  candidate_id,
                  source_profile_id,
                  feedback_type,
                  feedback_value,
                  notes,
                  created_by
                )
                values (%s, %s, %s, %s, %s, %s, %s)
                returning feedback_event_id::text as feedback_event_id
                """,
                (
                    mission_id,
                    candidate_id,
                    source_profile_id,
                    payload.feedback_type,
                    payload.feedback_value,
                    payload.notes,
                    payload.created_by or "maintenance_api",
                ),
            )
            row = cursor.fetchone()
    if row is None:
        raise DiscoveryFeedbackConflict("Discovery feedback creation did not return a row.")
    return query_one_func(
        f"{discovery_feedback_select_sql_func()}\nwhere dfe.feedback_event_id = %s",
        (row["feedback_event_id"],),
    ) or {}
