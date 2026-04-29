from __future__ import annotations

from typing import Any, Callable


def request_content_analysis_backfill(
    payload: Any,
    *,
    normalize_subject_id_func: Callable[[str | None], str | None],
    dump_json_value_func: Callable[[Any, str], str],
    build_database_url_func: Callable[[], str],
    connect_func: Callable[..., Any],
    dict_row_value: Any,
    uuid4_func: Callable[[], Any],
) -> dict[str, Any]:
    requested_by_user_id = normalize_subject_id_func(payload.requested_by_user_id)
    reindex_job_id = str(uuid4_func())
    event_id = str(uuid4_func())
    options_json = {
        "batchSize": payload.batch_size,
        "retroNotifications": "skip",
        "subjectTypes": payload.subject_types,
        "modules": payload.modules,
        "missingOnly": payload.missing_only,
        "policyKey": payload.policy_key,
        "maxTextChars": payload.max_text_chars,
        "subjectIds": [
            subject_id
            for subject_id in (
                normalize_subject_id_func(subject_id)
                for subject_id in payload.subject_ids
            )
            if subject_id is not None
        ],
        "requestSource": "content_analysis_backfill",
    }
    with connect_func(build_database_url_func(), row_factory=dict_row_value) as connection:
        with connection.transaction():
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    insert into reindex_jobs (
                      reindex_job_id,
                      index_name,
                      job_kind,
                      options_json,
                      requested_by_user_id,
                      status
                    )
                    values (%s, 'content_analysis', 'content_analysis', %s::jsonb, %s, 'queued')
                    """,
                    (
                        reindex_job_id,
                        dump_json_value_func(options_json, "options_json"),
                        requested_by_user_id,
                    ),
                )
                cursor.execute(
                    """
                    insert into outbox_events (
                      event_id,
                      event_type,
                      aggregate_type,
                      aggregate_id,
                      payload_json
                    )
                    values (
                      %s,
                      'reindex.requested',
                      'reindex_job',
                      %s,
                      %s::jsonb
                    )
                    """,
                    (
                        event_id,
                        reindex_job_id,
                        dump_json_value_func(
                            {
                                "eventId": event_id,
                                "reindexJobId": reindex_job_id,
                                "indexName": "content_analysis",
                                "jobKind": "content_analysis",
                                "version": 1,
                            },
                            "payload_json",
                        ),
                    ),
                )
    return {
        "status": "queued",
        "reindexJobId": reindex_job_id,
        "jobKind": "content_analysis",
        "options": options_json,
    }
