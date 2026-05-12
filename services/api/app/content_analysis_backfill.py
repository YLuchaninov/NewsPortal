from __future__ import annotations

import json
import hashlib
from typing import Any, Callable

RUNTIME_OPTION_KEYS = {
    "backfill",
    "contentAnalysis",
    "progress",
    "rebuild",
    "result",
    "selectionProfileSnapshot",
}
BATCH_ONLY_OPTION_KEYS = {"batchSize"}


def _normalize_for_cancellation(value: Any) -> Any:
    if isinstance(value, list):
        return sorted(
            (_normalize_for_cancellation(item) for item in value),
            key=lambda item: json.dumps(item, sort_keys=True, default=str),
        )
    if isinstance(value, dict):
        return {
            key: _normalize_for_cancellation(value[key])
            for key in sorted(value)
            if key not in RUNTIME_OPTION_KEYS and key not in BATCH_ONLY_OPTION_KEYS
        }
    return value


def build_reindex_cancellation_key(
    *,
    index_name: str,
    job_kind: str,
    options_json: dict[str, Any],
) -> str:
    normalized_options = json.dumps(
        _normalize_for_cancellation(options_json),
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
    cancellation_key = build_reindex_cancellation_key(
        index_name="content_analysis",
        job_kind="content_analysis",
        options_json=options_json,
    )
    with connect_func(build_database_url_func(), row_factory=dict_row_value) as connection:
        with connection.transaction():
            with connection.cursor() as cursor:
                cursor.execute(
                    "select pg_advisory_xact_lock(hashtext(%s))",
                    (cancellation_key,),
                )
                cursor.execute(
                    """
                    insert into reindex_jobs (
                      reindex_job_id,
                      index_name,
                      job_kind,
                      options_json,
                      requested_by_user_id,
                      status,
                      cancellation_key
                    )
                    values (%s, 'content_analysis', 'content_analysis', %s::jsonb, %s, 'queued', %s)
                    """,
                    (
                        reindex_job_id,
                        dump_json_value_func(options_json, "options_json"),
                        requested_by_user_id,
                        cancellation_key,
                    ),
                )
                cursor.execute(
                    """
                    update reindex_jobs
                    set
                      status = 'cancelled',
                      finished_at = coalesce(finished_at, now()),
                      error_text = 'Cancelled because a newer same-lane reindex job was queued.',
                      superseded_by_reindex_job_id = %s,
                      updated_at = now()
                    where cancellation_key = %s
                      and reindex_job_id <> %s
                      and status = 'queued'
                    """,
                    (reindex_job_id, cancellation_key, reindex_job_id),
                )
                cursor.execute(
                    """
                    update reindex_jobs
                    set
                      status = 'cancel_requested',
                      error_text = 'Cancellation requested because a newer same-lane reindex job was queued.',
                      superseded_by_reindex_job_id = %s,
                      updated_at = now()
                    where cancellation_key = %s
                      and reindex_job_id <> %s
                      and status in ('running', 'cancel_requested')
                    """,
                    (reindex_job_id, cancellation_key, reindex_job_id),
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
        "cancellationKey": cancellation_key,
    }
