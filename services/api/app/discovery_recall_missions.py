from __future__ import annotations

import json
from typing import Any, Awaitable, Callable


class DiscoveryRecallMissionValidation(ValueError):
    def __init__(self, errors: list[str]):
        super().__init__("; ".join(errors))
        self.errors = errors


class DiscoveryRecallMissionNotFound(LookupError):
    pass


class DiscoveryRecallMissionConflict(ValueError):
    pass


def create_discovery_recall_mission(
    payload: Any,
    *,
    require_attachable_discovery_policy_profile_func: Callable[[str], dict[str, Any]],
    get_discovery_recall_mission_func: Callable[[str], dict[str, Any]],
    build_database_url_func: Callable[[], str],
    connect_func: Callable[..., Any],
    dict_row_value: Any,
) -> dict[str, Any]:
    profile_id = payload.profile_id.strip() if payload.profile_id else None
    if profile_id:
        require_attachable_discovery_policy_profile_func(profile_id)
    with connect_func(build_database_url_func(), row_factory=dict_row_value) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                insert into discovery_recall_missions (
                  title,
                  description,
                  mission_kind,
                  seed_domains,
                  seed_urls,
                  seed_queries,
                  target_provider_types,
                  scope_json,
                  status,
                  max_candidates,
                  profile_id,
                  applied_profile_version,
                  applied_policy_json,
                  created_by
                )
                values (
                  %s,
                  %s,
                  %s,
                  %s::text[],
                  %s::text[],
                  %s::text[],
                  %s::text[],
                  %s::jsonb,
                  'planned',
                  %s,
                  %s,
                  null,
                  null,
                  %s
                )
                returning recall_mission_id::text as recall_mission_id
                """,
                (
                    payload.title,
                    payload.description,
                    payload.mission_kind,
                    payload.seed_domains,
                    payload.seed_urls,
                    payload.seed_queries,
                    payload.target_provider_types,
                    json.dumps(payload.scope_json),
                    payload.max_candidates,
                    profile_id,
                    payload.created_by or "maintenance_api",
                ),
            )
            row = cursor.fetchone()
    if row is None:
        raise DiscoveryRecallMissionConflict(
            "Discovery recall mission creation did not return a row."
        )
    return get_discovery_recall_mission_func(str(row["recall_mission_id"]))


def update_discovery_recall_mission(
    recall_mission_id: str,
    payload: Any,
    *,
    require_attachable_discovery_policy_profile_func: Callable[[str], dict[str, Any]],
    get_discovery_recall_mission_func: Callable[[str], dict[str, Any]],
    build_database_url_func: Callable[[], str],
    connect_func: Callable[..., Any],
    dict_row_value: Any,
) -> dict[str, Any]:
    values = payload.model_dump(exclude_unset=True)
    if not values:
        raise DiscoveryRecallMissionValidation(
            ["At least one field must be provided for update."]
        )

    assignments: list[str] = []
    params: list[Any] = []
    for field_name, column_name, cast_suffix, as_json in (
        ("title", "title", "", False),
        ("description", "description", "", False),
        ("mission_kind", "mission_kind", "", False),
        ("seed_domains", "seed_domains", "::text[]", False),
        ("seed_urls", "seed_urls", "::text[]", False),
        ("seed_queries", "seed_queries", "::text[]", False),
        ("target_provider_types", "target_provider_types", "::text[]", False),
        ("scope_json", "scope_json", "::jsonb", True),
        ("status", "status", "", False),
        ("max_candidates", "max_candidates", "", False),
        ("profile_id", "profile_id", "", False),
    ):
        if field_name in values:
            if field_name == "profile_id":
                normalized_profile_id = str(values[field_name] or "").strip() or None
                if normalized_profile_id is not None:
                    require_attachable_discovery_policy_profile_func(normalized_profile_id)
                assignments.append("profile_id = %s")
                params.append(normalized_profile_id)
                assignments.append("applied_profile_version = null")
                assignments.append("applied_policy_json = null")
                continue
            assignments.append(f"{column_name} = %s{cast_suffix}")
            params.append(json.dumps(values[field_name]) if as_json else values[field_name])
    assignments.append("updated_at = now()")
    params.append(recall_mission_id)

    with connect_func(build_database_url_func(), row_factory=dict_row_value) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                update discovery_recall_missions
                set {', '.join(assignments)}
                where recall_mission_id = %s
                returning recall_mission_id::text as recall_mission_id
                """,
                tuple(params),
            )
            row = cursor.fetchone()
    if row is None:
        raise DiscoveryRecallMissionNotFound(
            f"Discovery recall mission {recall_mission_id} was not found."
        )
    return get_discovery_recall_mission_func(recall_mission_id)


async def request_discovery_recall_mission_acquisition(
    recall_mission_id: str,
    *,
    get_discovery_recall_mission_func: Callable[[str], dict[str, Any]],
    snapshot_discovery_recall_mission_profile_policy_func: Callable[[str], None],
    load_discovery_settings_func: Callable[[], Any],
    discovery_coordinator_repository_factory: Callable[[], Any],
    acquire_recall_missions_func: Callable[..., Awaitable[dict[str, Any]]],
) -> dict[str, Any]:
    get_discovery_recall_mission_func(recall_mission_id)
    snapshot_discovery_recall_mission_profile_policy_func(recall_mission_id)
    repository = discovery_coordinator_repository_factory()
    return await acquire_recall_missions_func(
        recall_mission_id=recall_mission_id,
        settings=load_discovery_settings_func(),
        repository=repository,
    )
