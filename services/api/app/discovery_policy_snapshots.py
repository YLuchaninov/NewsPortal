from __future__ import annotations

import json
from typing import Any, Callable, Literal, Mapping


def build_applied_discovery_policy_snapshot(
    *,
    lane: Literal["graph", "recall"],
    mission_like: Mapping[str, Any],
    profile: Mapping[str, Any],
    parse_discovery_profile_json_func: Callable[[Any], dict[str, Any]],
    normalize_discovery_graph_policy_func: Callable[[Mapping[str, Any] | None], dict[str, Any]],
    normalize_discovery_recall_policy_func: Callable[[Mapping[str, Any] | None], dict[str, Any]],
    normalize_discovery_yield_benchmark_func: Callable[[Mapping[str, Any] | None], dict[str, Any]],
) -> dict[str, Any]:
    if lane == "graph":
        return {
            "lane": "graph",
            "profileId": str(profile.get("profile_id") or ""),
            "profileKey": str(profile.get("profile_key") or ""),
            "profileDisplayName": str(profile.get("display_name") or ""),
            "profileVersion": int(profile.get("version") or 1),
            "graphPolicy": normalize_discovery_graph_policy_func(
                parse_discovery_profile_json_func(profile.get("graph_policy_json"))
            ),
            "yieldBenchmark": normalize_discovery_yield_benchmark_func(
                parse_discovery_profile_json_func(profile.get("yield_benchmark_json"))
            ),
            "missionOwned": {
                "targetProviderTypes": list(mission_like.get("target_provider_types") or []),
                "seedTopics": list(mission_like.get("seed_topics") or []),
                "seedLanguages": list(mission_like.get("seed_languages") or []),
                "seedRegions": list(mission_like.get("seed_regions") or []),
            },
        }

    return {
        "lane": "recall",
        "profileId": str(profile.get("profile_id") or ""),
        "profileKey": str(profile.get("profile_key") or ""),
        "profileDisplayName": str(profile.get("display_name") or ""),
        "profileVersion": int(profile.get("version") or 1),
        "recallPolicy": normalize_discovery_recall_policy_func(
            parse_discovery_profile_json_func(profile.get("recall_policy_json"))
        ),
        "yieldBenchmark": normalize_discovery_yield_benchmark_func(
            parse_discovery_profile_json_func(profile.get("yield_benchmark_json"))
        ),
        "missionOwned": {
            "targetProviderTypes": list(mission_like.get("target_provider_types") or []),
            "seedDomains": list(mission_like.get("seed_domains") or []),
            "seedUrls": list(mission_like.get("seed_urls") or []),
            "seedQueries": list(mission_like.get("seed_queries") or []),
        },
    }


def snapshot_discovery_mission_profile_policy(
    mission_id: str,
    *,
    get_discovery_mission_func: Callable[[str], dict[str, Any]],
    require_attachable_discovery_policy_profile_func: Callable[[str], dict[str, Any]],
    build_database_url_func: Callable[[], str],
    connect_func: Callable[..., Any],
    dict_row_value: Any,
    parse_discovery_profile_json_func: Callable[[Any], dict[str, Any]],
    normalize_discovery_graph_policy_func: Callable[[Mapping[str, Any] | None], dict[str, Any]],
    normalize_discovery_recall_policy_func: Callable[[Mapping[str, Any] | None], dict[str, Any]],
    normalize_discovery_yield_benchmark_func: Callable[[Mapping[str, Any] | None], dict[str, Any]],
) -> None:
    mission = get_discovery_mission_func(mission_id)
    profile_id = str(mission.get("profile_id") or "").strip()
    if not profile_id:
        with connect_func(build_database_url_func(), row_factory=dict_row_value) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    update discovery_missions
                    set applied_profile_version = null, applied_policy_json = null, updated_at = now()
                    where mission_id = %s
                    """,
                    (mission_id,),
                )
        return

    profile = require_attachable_discovery_policy_profile_func(profile_id)
    applied_policy_json = build_applied_discovery_policy_snapshot(
        lane="graph",
        mission_like=mission,
        profile=profile,
        parse_discovery_profile_json_func=parse_discovery_profile_json_func,
        normalize_discovery_graph_policy_func=normalize_discovery_graph_policy_func,
        normalize_discovery_recall_policy_func=normalize_discovery_recall_policy_func,
        normalize_discovery_yield_benchmark_func=normalize_discovery_yield_benchmark_func,
    )
    with connect_func(build_database_url_func(), row_factory=dict_row_value) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                update discovery_missions
                set
                  applied_profile_version = %s,
                  applied_policy_json = %s::jsonb,
                  updated_at = now()
                where mission_id = %s
                """,
                (
                    int(profile.get("version") or 1),
                    json.dumps(applied_policy_json),
                    mission_id,
                ),
            )


def snapshot_discovery_recall_mission_profile_policy(
    recall_mission_id: str,
    *,
    get_discovery_recall_mission_func: Callable[[str], dict[str, Any]],
    require_attachable_discovery_policy_profile_func: Callable[[str], dict[str, Any]],
    build_database_url_func: Callable[[], str],
    connect_func: Callable[..., Any],
    dict_row_value: Any,
    parse_discovery_profile_json_func: Callable[[Any], dict[str, Any]],
    normalize_discovery_graph_policy_func: Callable[[Mapping[str, Any] | None], dict[str, Any]],
    normalize_discovery_recall_policy_func: Callable[[Mapping[str, Any] | None], dict[str, Any]],
    normalize_discovery_yield_benchmark_func: Callable[[Mapping[str, Any] | None], dict[str, Any]],
) -> None:
    mission = get_discovery_recall_mission_func(recall_mission_id)
    profile_id = str(mission.get("profile_id") or "").strip()
    if not profile_id:
        with connect_func(build_database_url_func(), row_factory=dict_row_value) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    update discovery_recall_missions
                    set applied_profile_version = null, applied_policy_json = null, updated_at = now()
                    where recall_mission_id = %s
                    """,
                    (recall_mission_id,),
                )
        return

    profile = require_attachable_discovery_policy_profile_func(profile_id)
    applied_policy_json = build_applied_discovery_policy_snapshot(
        lane="recall",
        mission_like=mission,
        profile=profile,
        parse_discovery_profile_json_func=parse_discovery_profile_json_func,
        normalize_discovery_graph_policy_func=normalize_discovery_graph_policy_func,
        normalize_discovery_recall_policy_func=normalize_discovery_recall_policy_func,
        normalize_discovery_yield_benchmark_func=normalize_discovery_yield_benchmark_func,
    )
    with connect_func(build_database_url_func(), row_factory=dict_row_value) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                update discovery_recall_missions
                set
                  applied_profile_version = %s,
                  applied_policy_json = %s::jsonb,
                  updated_at = now()
                where recall_mission_id = %s
                """,
                (
                    int(profile.get("version") or 1),
                    json.dumps(applied_policy_json),
                    recall_mission_id,
                ),
            )
