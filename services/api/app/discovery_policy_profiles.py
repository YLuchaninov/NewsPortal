from __future__ import annotations

import json
from typing import Any, Callable, Mapping


class DiscoveryPolicyProfileConflict(ValueError):
    pass


class DiscoveryPolicyProfileNotFound(LookupError):
    pass


class DiscoveryPolicyProfileValidation(ValueError):
    def __init__(self, errors: list[str]):
        super().__init__("; ".join(errors))
        self.errors = errors


def require_attachable_discovery_policy_profile(
    profile_id: str,
    *,
    get_discovery_policy_profile_func: Callable[[str], dict[str, Any]],
) -> dict[str, Any]:
    profile = get_discovery_policy_profile_func(profile_id)
    if str(profile.get("status") or "") != "active":
        raise DiscoveryPolicyProfileConflict(
            "Only active discovery profiles can be attached to missions or recall missions."
        )
    return profile


def create_discovery_policy_profile(
    payload: Any,
    *,
    build_discovery_profile_payload_func: Callable[..., tuple[dict[str, Any], dict[str, Any], dict[str, Any]]],
    get_discovery_policy_profile_func: Callable[[str], dict[str, Any]],
    build_database_url_func: Callable[[], str],
    connect_func: Callable[..., Any],
    dict_row_value: Any,
) -> dict[str, Any]:
    graph_policy_json, recall_policy_json, yield_benchmark_json = (
        build_discovery_profile_payload_func(
            graph_policy_json=payload.graph_policy_json,
            recall_policy_json=payload.recall_policy_json,
            yield_benchmark_json=payload.yield_benchmark_json,
        )
    )
    with connect_func(build_database_url_func(), row_factory=dict_row_value) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                insert into discovery_policy_profiles (
                  profile_key,
                  display_name,
                  description,
                  status,
                  graph_policy_json,
                  recall_policy_json,
                  yield_benchmark_json,
                  created_by
                )
                values (%s, %s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s)
                returning profile_id::text as profile_id
                """,
                (
                    payload.profile_key.strip(),
                    payload.display_name.strip(),
                    payload.description,
                    payload.status,
                    json.dumps(graph_policy_json),
                    json.dumps(recall_policy_json),
                    json.dumps(yield_benchmark_json),
                    payload.created_by or "maintenance_api",
                ),
            )
            row = cursor.fetchone()
    if row is None:
        raise DiscoveryPolicyProfileConflict(
            "Discovery policy profile creation did not return a row."
        )
    return get_discovery_policy_profile_func(str(row["profile_id"]))


def update_discovery_policy_profile(
    profile_id: str,
    payload: Any,
    *,
    get_discovery_policy_profile_func: Callable[[str], dict[str, Any]],
    parse_discovery_profile_json_func: Callable[[Any], dict[str, Any]],
    normalize_discovery_graph_policy_func: Callable[[Mapping[str, Any] | None], dict[str, Any]],
    normalize_discovery_recall_policy_func: Callable[[Mapping[str, Any] | None], dict[str, Any]],
    normalize_discovery_yield_benchmark_func: Callable[[Mapping[str, Any] | None], dict[str, Any]],
    build_database_url_func: Callable[[], str],
    connect_func: Callable[..., Any],
    dict_row_value: Any,
) -> dict[str, Any]:
    values = payload.model_dump(exclude_unset=True)
    if not values:
        raise DiscoveryPolicyProfileValidation(
            ["At least one field must be provided for update."]
        )
    existing = get_discovery_policy_profile_func(profile_id)

    assignments: list[str] = []
    params: list[Any] = []
    if "display_name" in values:
        assignments.append("display_name = %s")
        params.append(values["display_name"])
    if "description" in values:
        assignments.append("description = %s")
        params.append(values["description"])
    if "status" in values:
        assignments.append("status = %s")
        params.append(values["status"])
    if "graph_policy_json" in values:
        merged_graph_policy = {
            **parse_discovery_profile_json_func(existing.get("graph_policy_json")),
            **(values["graph_policy_json"] or {}),
        }
        assignments.append("graph_policy_json = %s::jsonb")
        params.append(json.dumps(normalize_discovery_graph_policy_func(merged_graph_policy)))
    if "recall_policy_json" in values:
        merged_recall_policy = {
            **parse_discovery_profile_json_func(existing.get("recall_policy_json")),
            **(values["recall_policy_json"] or {}),
        }
        assignments.append("recall_policy_json = %s::jsonb")
        params.append(json.dumps(normalize_discovery_recall_policy_func(merged_recall_policy)))
    if "yield_benchmark_json" in values:
        merged_yield_benchmark = {
            **parse_discovery_profile_json_func(existing.get("yield_benchmark_json")),
            **(values["yield_benchmark_json"] or {}),
        }
        assignments.append("yield_benchmark_json = %s::jsonb")
        params.append(
            json.dumps(normalize_discovery_yield_benchmark_func(merged_yield_benchmark))
        )

    assignments.extend(["version = version + 1", "updated_at = now()"])
    params.append(profile_id)
    with connect_func(build_database_url_func(), row_factory=dict_row_value) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                update discovery_policy_profiles
                set {', '.join(assignments)}
                where profile_id = %s
                returning profile_id::text as profile_id
                """,
                tuple(params),
            )
            row = cursor.fetchone()
    if row is None:
        raise DiscoveryPolicyProfileNotFound(
            f"Discovery policy profile {profile_id} was not found."
        )
    return get_discovery_policy_profile_func(profile_id)


def delete_discovery_policy_profile(
    profile_id: str,
    *,
    get_discovery_policy_profile_func: Callable[[str], dict[str, Any]],
    build_database_url_func: Callable[[], str],
    connect_func: Callable[..., Any],
    dict_row_value: Any,
) -> dict[str, Any]:
    get_discovery_policy_profile_func(profile_id)
    with connect_func(build_database_url_func(), row_factory=dict_row_value) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select
                  (select count(*)::int from discovery_missions where profile_id = %s) as mission_count,
                  (select count(*)::int from discovery_recall_missions where profile_id = %s) as recall_mission_count
                """,
                (profile_id, profile_id),
            )
            usage = cursor.fetchone() or {}
            if int(usage.get("mission_count") or 0) > 0 or int(
                usage.get("recall_mission_count") or 0
            ) > 0:
                raise DiscoveryPolicyProfileConflict(
                    "Discovery profile is already attached to missions or recall missions. Archive it instead of deleting it."
                )
            cursor.execute(
                """
                delete from discovery_policy_profiles
                where profile_id = %s
                returning profile_id::text as profile_id
                """,
                (profile_id,),
            )
            row = cursor.fetchone()
    if row is None:
        raise DiscoveryPolicyProfileNotFound(
            f"Discovery policy profile {profile_id} was not found."
        )
    return {"profile_id": str(row["profile_id"]), "deleted": True}
