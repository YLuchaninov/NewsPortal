from __future__ import annotations

from typing import Any, Mapping

from services.api.app.json_read_model import as_json_int, as_json_object


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
    payload["selection_profile_snapshot"] = selection_profile_snapshot
    payload["selection_profile_summary"] = (
        selection_profile_snapshot.get("summary")
        if isinstance(selection_profile_snapshot, dict)
        else None
    )
    return payload
