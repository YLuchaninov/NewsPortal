from __future__ import annotations

import json
from typing import Any, Callable


class DiscoveryCandidateValidation(ValueError):
    def __init__(self, errors: list[str]):
        super().__init__("; ".join(errors))
        self.errors = errors


class DiscoveryCandidateNotFound(LookupError):
    pass


class DiscoveryCandidateConflict(ValueError):
    pass


def resolve_discovery_canonical_domain(
    url: str | None,
    *,
    canonical_domain_func: Callable[[str], str],
) -> str:
    domain = canonical_domain_func(str(url or "").strip())
    if not domain or domain == "unknown":
        raise DiscoveryCandidateValidation(
            ["Candidate URL must include a hostname so canonical_domain can be resolved."]
        )
    return domain


def update_discovery_candidate(
    candidate_id: str,
    payload: Any,
    *,
    get_discovery_candidate_func: Callable[[str], dict[str, Any]],
    registrar_adapter_factory: Callable[[str], Any],
    build_database_url_func: Callable[[], str],
    connect_func: Callable[..., Any],
    dict_row_value: Any,
) -> dict[str, Any]:
    candidate = get_discovery_candidate_func(candidate_id)
    registered_channel_id: str | None = candidate.get("registered_channel_id")
    final_status = payload.status
    rejection_reason = payload.rejection_reason

    if payload.status == "approved" and not registered_channel_id:
        registrar = registrar_adapter_factory(build_database_url_func())
        registrations = registrar.register_sources(
            sources=[
                {
                    "source_url": candidate["url"],
                    "final_url": candidate.get("final_url"),
                    "title": candidate.get("title"),
                    "relevance_score": candidate.get("relevance_score"),
                    "provider_type": candidate.get("provider_type"),
                }
            ],
            enabled=True,
            dry_run=False,
            created_by=payload.reviewed_by or "adaptive_discovery:manual_review",
            tags=["discovery", "adaptive", "approved"],
            provider_type=str(candidate.get("provider_type") or "rss"),
        )
        registration = registrations[0] if registrations else {}
        if isinstance(registration, dict):
            registered_channel_id = (
                str(registration.get("channel_id"))
                if registration.get("channel_id") is not None
                else None
            )
            if registration.get("status") == "duplicate":
                final_status = "duplicate"
                rejection_reason = "already_registered"

    with connect_func(build_database_url_func(), row_factory=dict_row_value) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                update discovery_candidates
                set
                  status = %s,
                  rejection_reason = %s,
                  reviewed_by = %s,
                  reviewed_at = now(),
                  registered_channel_id = %s,
                  updated_at = now()
                where candidate_id = %s
                """,
                (
                    final_status,
                    rejection_reason,
                    payload.reviewed_by or "maintenance_api",
                    registered_channel_id,
                    candidate_id,
                ),
            )
    return get_discovery_candidate_func(candidate_id)


def create_discovery_recall_candidate(
    payload: Any,
    *,
    get_discovery_recall_mission_func: Callable[[str], dict[str, Any]],
    resolve_discovery_canonical_domain_func: Callable[[str | None], str],
    get_discovery_source_profile_func: Callable[[str], dict[str, Any]],
    get_discovery_source_profile_by_canonical_domain_func: Callable[
        [str], dict[str, Any] | None
    ],
    get_discovery_recall_candidate_func: Callable[[str], dict[str, Any]],
    build_database_url_func: Callable[[], str],
    connect_func: Callable[..., Any],
    dict_row_value: Any,
) -> dict[str, Any]:
    get_discovery_recall_mission_func(payload.recall_mission_id)
    resolved_domain = resolve_discovery_canonical_domain_func(payload.final_url or payload.url)

    source_profile_id = payload.source_profile_id
    if source_profile_id:
        profile = get_discovery_source_profile_func(source_profile_id)
        if profile.get("canonical_domain") != resolved_domain:
            raise DiscoveryCandidateValidation(
                ["sourceProfileId canonical_domain does not match the candidate URL domain."]
            )
    else:
        profile = get_discovery_source_profile_by_canonical_domain_func(resolved_domain)
        if profile is not None:
            source_profile_id = str(profile["source_profile_id"])

    with connect_func(build_database_url_func(), row_factory=dict_row_value) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                insert into discovery_recall_candidates (
                  recall_mission_id,
                  source_profile_id,
                  canonical_domain,
                  url,
                  final_url,
                  title,
                  description,
                  provider_type,
                  status,
                  quality_signal_source,
                  evaluation_json,
                  rejection_reason,
                  created_by
                )
                values (
                  %s,
                  %s,
                  %s,
                  %s,
                  %s,
                  %s,
                  %s,
                  %s,
                  %s,
                  %s,
                  %s::jsonb,
                  %s,
                  %s
                )
                returning recall_candidate_id::text as recall_candidate_id
                """,
                (
                    payload.recall_mission_id,
                    source_profile_id,
                    resolved_domain,
                    payload.url,
                    payload.final_url,
                    payload.title,
                    payload.description,
                    payload.provider_type,
                    payload.status,
                    payload.quality_signal_source.strip() or "manual",
                    json.dumps(payload.evaluation_json),
                    payload.rejection_reason,
                    payload.created_by or "maintenance_api",
                ),
            )
            row = cursor.fetchone()
    if row is None:
        raise DiscoveryCandidateConflict(
            "Discovery recall candidate creation did not return a row."
        )
    return get_discovery_recall_candidate_func(str(row["recall_candidate_id"]))


def update_discovery_recall_candidate(
    recall_candidate_id: str,
    payload: Any,
    *,
    get_discovery_recall_candidate_func: Callable[[str], dict[str, Any]],
    build_database_url_func: Callable[[], str],
    connect_func: Callable[..., Any],
    dict_row_value: Any,
) -> dict[str, Any]:
    values = payload.model_dump(exclude_unset=True)
    if not values:
        raise DiscoveryCandidateValidation(
            ["At least one field must be provided for update."]
        )
    get_discovery_recall_candidate_func(recall_candidate_id)

    assignments: list[str] = []
    params: list[Any] = []
    if "status" in values:
        assignments.append("status = %s")
        params.append(values["status"])
    if "rejection_reason" in values:
        assignments.append("rejection_reason = %s")
        params.append(values["rejection_reason"])
    if "quality_signal_source" in values:
        quality_signal_source = str(values["quality_signal_source"] or "").strip()
        if not quality_signal_source:
            raise DiscoveryCandidateValidation(["qualitySignalSource must not be empty."])
        assignments.append("quality_signal_source = %s")
        params.append(quality_signal_source)
    if "evaluation_json" in values:
        assignments.append("evaluation_json = %s::jsonb")
        params.append(json.dumps(values["evaluation_json"]))

    if (
        "status" in values
        or "rejection_reason" in values
        or "reviewed_by" in values
    ):
        assignments.append("reviewed_by = %s")
        params.append(values.get("reviewed_by") or "maintenance_api")
        assignments.append("reviewed_at = now()")

    assignments.append("updated_at = now()")
    params.append(recall_candidate_id)

    with connect_func(build_database_url_func(), row_factory=dict_row_value) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                update discovery_recall_candidates
                set {', '.join(assignments)}
                where recall_candidate_id = %s
                returning recall_candidate_id::text as recall_candidate_id
                """,
                tuple(params),
            )
            row = cursor.fetchone()
    if row is None:
        raise DiscoveryCandidateNotFound(
            f"Discovery recall candidate {recall_candidate_id} was not found."
        )
    return get_discovery_recall_candidate_func(recall_candidate_id)


def promote_discovery_recall_candidate(
    recall_candidate_id: str,
    payload: Any,
    *,
    get_discovery_recall_candidate_func: Callable[[str], dict[str, Any]],
    registrar_adapter_factory: Callable[[str], Any],
    build_database_url_func: Callable[[], str],
    connect_func: Callable[..., Any],
    dict_row_value: Any,
) -> dict[str, Any]:
    candidate = get_discovery_recall_candidate_func(recall_candidate_id)
    existing_channel_id = str(candidate.get("registered_channel_id") or "").strip() or None
    if existing_channel_id is not None:
        return candidate

    current_status = str(candidate.get("status") or "").strip()
    rejection_reason = str(candidate.get("rejection_reason") or "").strip() or None
    if current_status == "rejected" and rejection_reason != "already_registered":
        raise DiscoveryCandidateValidation(
            [
                "Rejected recall candidates cannot be promoted unless they were rejected as already_registered."
            ]
        )

    review_actor = payload.reviewed_by or "independent_recall:manual_review"
    deduped_tags: list[str] = []
    seen_tags: set[str] = set()
    for tag in ["discovery", "independent_recall", "promoted", *payload.tags]:
        normalized_tag = str(tag or "").strip()
        if not normalized_tag or normalized_tag in seen_tags:
            continue
        seen_tags.add(normalized_tag)
        deduped_tags.append(normalized_tag)

    evaluation_json = (
        dict(candidate.get("evaluation_json") or {})
        if isinstance(candidate.get("evaluation_json"), dict)
        else {}
    )
    registrar = registrar_adapter_factory(build_database_url_func())
    registrations = registrar.register_sources(
        sources=[
            {
                "source_url": candidate["url"],
                "final_url": candidate.get("final_url"),
                "title": candidate.get("title"),
                "provider_type": candidate.get("provider_type"),
                "evaluation_json": evaluation_json,
                "classification": evaluation_json.get("classification"),
                "capabilities": evaluation_json.get("capabilities"),
                "discovered_feed_urls": evaluation_json.get("discovered_feed_urls"),
                "browser_assisted_recommended": evaluation_json.get(
                    "browser_assisted_recommended"
                ),
                "challenge_kind": evaluation_json.get("challenge_kind"),
                "created_by": review_actor,
            }
        ],
        enabled=payload.enabled,
        dry_run=False,
        created_by=review_actor,
        tags=deduped_tags,
        provider_type=str(candidate.get("provider_type") or "rss"),
    )
    registration = registrations[0] if registrations else {}
    if not isinstance(registration, dict):
        raise DiscoveryCandidateConflict(
            "Recall candidate promotion did not return a registration result."
        )

    registration_status = str(registration.get("status") or "").strip()
    registered_channel_id = (
        str(registration.get("channel_id")).strip()
        if registration.get("channel_id") is not None
        else None
    )
    final_status = "shortlisted"
    final_rejection_reason: str | None = None
    if registration_status == "duplicate":
        final_status = "duplicate"
        final_rejection_reason = "already_registered"
    elif registration_status != "registered":
        raise DiscoveryCandidateConflict(
            f"Recall candidate promotion returned unsupported registration status {registration_status!r}."
        )

    source_profile_id = str(candidate.get("source_profile_id") or "").strip() or None
    canonical_domain_value = str(candidate.get("canonical_domain") or "").strip() or None
    with connect_func(build_database_url_func(), row_factory=dict_row_value) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                update discovery_recall_candidates
                set
                  status = %s,
                  rejection_reason = %s,
                  reviewed_by = %s,
                  reviewed_at = now(),
                  registered_channel_id = %s,
                  updated_at = now()
                where recall_candidate_id = %s
                returning recall_candidate_id::text as recall_candidate_id
                """,
                (
                    final_status,
                    final_rejection_reason,
                    review_actor,
                    registered_channel_id,
                    recall_candidate_id,
                ),
            )
            row = cursor.fetchone()
            if row is None:
                raise DiscoveryCandidateNotFound(
                    f"Discovery recall candidate {recall_candidate_id} was not found."
                )
            if registered_channel_id is not None:
                if source_profile_id is not None:
                    cursor.execute(
                        """
                        update discovery_source_profiles
                        set
                          channel_id = coalesce(channel_id, %s),
                          updated_at = now()
                        where source_profile_id = %s
                        """,
                        (registered_channel_id, source_profile_id),
                    )
                elif canonical_domain_value:
                    cursor.execute(
                        """
                        update discovery_source_profiles
                        set
                          channel_id = coalesce(channel_id, %s),
                          updated_at = now()
                        where canonical_domain = %s
                        """,
                        (registered_channel_id, canonical_domain_value),
                    )

    return get_discovery_recall_candidate_func(recall_candidate_id)
