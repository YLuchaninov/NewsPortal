from __future__ import annotations

from typing import Any, Callable, Mapping

from services.api.app.json_read_model import as_json_int, as_json_object, as_json_str

REINDEX_RUNNING_STALL_SECONDS = 300


def build_reindex_selection_profile_payload(
    job_like: Mapping[str, Any],
) -> dict[str, Any] | None:
    snapshot = as_json_object(
        as_json_object(as_json_object(job_like.get("result_json")).get("backfill")).get(
            "selectionProfileSnapshot"
        )
    )
    if not snapshot:
        return None

    active_profiles = as_json_int(snapshot.get("activeProfiles"))
    total_profiles = as_json_int(snapshot.get("totalProfiles"))
    compatibility_profiles = as_json_int(snapshot.get("compatibilityProfiles"))
    templates_with_profiles = as_json_int(snapshot.get("templatesWithProfiles"))
    max_version = as_json_int(snapshot.get("maxVersion"))

    parts: list[str] = []
    if total_profiles > 0 or active_profiles > 0:
        parts.append(f"{active_profiles}/{total_profiles} active")
    if compatibility_profiles > 0:
        parts.append(f"{compatibility_profiles} compatibility")
    if templates_with_profiles > 0:
        parts.append(f"{templates_with_profiles} template-bound")
    if max_version > 0:
        parts.append(f"max v{max_version}")

    return {
        "activeProfiles": active_profiles,
        "totalProfiles": total_profiles,
        "compatibilityProfiles": compatibility_profiles,
        "templatesWithProfiles": templates_with_profiles,
        "maxVersion": max_version,
        "summary": " | ".join(parts) if parts else None,
    }


def apply_reindex_selection_profile_payload(
    job_like: Mapping[str, Any],
) -> dict[str, Any]:
    payload = dict(job_like)
    selection_profile_snapshot = build_reindex_selection_profile_payload(job_like)
    progress = as_json_object(job_like.get("options_json")).get("progress")
    progress_payload = as_json_object(progress)
    status = as_json_str(job_like.get("status")) or "queued"
    processed_signal_candidates = as_json_int(progress_payload.get("processedSignalCandidates"))
    total_signal_candidates = as_json_int(progress_payload.get("totalSignalCandidates"))
    progress_elapsed_seconds = as_json_int(progress_payload.get("elapsedSeconds"))
    review_failures = as_json_int(progress_payload.get("llmReviewFailures"))
    derived_state = status
    if status == "running":
        if not progress_payload:
            derived_state = "running_no_progress_yet"
        elif (
            total_signal_candidates > 0
            and processed_signal_candidates < total_signal_candidates
            and progress_elapsed_seconds >= REINDEX_RUNNING_STALL_SECONDS
        ):
            derived_state = "running_stalled"
        else:
            derived_state = "running_active"
    elif status == "completed" and review_failures > 0:
        derived_state = "completed_with_review_failures"

    payload["selection_profile_snapshot"] = selection_profile_snapshot
    payload["selection_profile_summary"] = (
        selection_profile_snapshot.get("summary")
        if isinstance(selection_profile_snapshot, dict)
        else None
    )
    payload["progress"] = progress_payload or None
    payload["derived_state"] = derived_state
    payload["derivedState"] = derived_state
    return payload


def list_reindex_jobs(
    *,
    limit: int,
    page: int | None,
    page_size: int | None,
    resolve_pagination_func: Callable[
        [int | None, int | None, int], tuple[bool, int, int, int]
    ],
    query_all_func: Callable[[str, tuple[Any, ...] | None], list[dict[str, Any]]],
    query_count_func: Callable[[str], int],
    build_paginated_response_func: Callable[
        [list[dict[str, Any]], int, int, int], dict[str, Any]
    ],
    apply_payload_func: Callable[[Mapping[str, Any]], dict[str, Any]] = (
        apply_reindex_selection_profile_payload
    ),
) -> dict[str, Any] | list[dict[str, Any]]:
    reindex_select = """
        select *
        from reindex_jobs
        order by requested_at desc
    """
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination_func(
        page, page_size, limit
    )
    if not paginate:
        items = query_all_func(f"{reindex_select}\nlimit %s", (limit,))
        return [apply_payload_func(item) for item in items]

    total = query_count_func(
        """
        select count(*)::int as total
        from reindex_jobs
        """
    )
    items = query_all_func(
        f"{reindex_select}\nlimit %s\noffset %s",
        (resolved_page_size, offset),
    )
    projected_items = [apply_payload_func(item) for item in items]
    return build_paginated_response_func(
        projected_items, resolved_page, resolved_page_size, total
    )
