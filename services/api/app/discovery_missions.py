from __future__ import annotations

import json
from typing import Any, Awaitable, Callable


class DiscoveryMissionValidation(ValueError):
    def __init__(self, errors: list[str]):
        super().__init__("; ".join(errors))
        self.errors = errors


class DiscoveryMissionNotFound(LookupError):
    pass


class DiscoveryMissionConflict(ValueError):
    pass


def create_discovery_mission(
    payload: Any,
    *,
    load_discovery_settings_func: Callable[[], Any],
    require_attachable_discovery_policy_profile_func: Callable[[str], dict[str, Any]],
    get_discovery_mission_func: Callable[[str], dict[str, Any]],
    build_database_url_func: Callable[[], str],
    connect_func: Callable[..., Any],
    dict_row_value: Any,
) -> dict[str, Any]:
    settings = load_discovery_settings_func()
    interest_graph = payload.interest_graph if isinstance(payload.interest_graph, dict) else None
    graph_status = "compiled" if interest_graph else "pending"
    graph_version = 1 if interest_graph else 0
    profile_id = payload.profile_id.strip() if payload.profile_id else None
    if profile_id:
        require_attachable_discovery_policy_profile_func(profile_id)
    with connect_func(build_database_url_func(), row_factory=dict_row_value) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                insert into discovery_missions (
                  title,
                  description,
                  source_kind,
                  source_ref_id,
                  seed_topics,
                  seed_languages,
                  seed_regions,
                  target_provider_types,
                  interest_graph,
                  interest_graph_status,
                  interest_graph_version,
                  interest_graph_compiled_at,
                  interest_graph_error_text,
                  max_hypotheses,
                  max_sources,
                  budget_cents,
                  priority,
                  profile_id,
                  applied_profile_version,
                  applied_policy_json,
                  status,
                  created_by
                )
                values (
                  %s,
                  %s,
                  %s,
                  %s,
                  %s::text[],
                  %s::text[],
                  %s::text[],
                  %s::text[],
                  %s::jsonb,
                  %s,
                  %s,
                  case when %s = 'compiled' then now() else null end,
                  null,
                  %s,
                  %s,
                  %s,
                  %s,
                  %s,
                  null,
                  null,
                  'planned',
                  %s
                )
                returning mission_id::text as mission_id
                """,
                (
                    payload.title,
                    payload.description,
                    payload.source_kind,
                    payload.source_ref_id,
                    payload.seed_topics,
                    payload.seed_languages,
                    payload.seed_regions,
                    payload.target_provider_types,
                    json.dumps(interest_graph) if interest_graph is not None else None,
                    graph_status,
                    graph_version,
                    graph_status,
                    payload.max_hypotheses or min(12, settings.max_hypotheses_per_run),
                    payload.max_sources or settings.default_max_sources,
                    payload.budget_cents
                    if payload.budget_cents is not None
                    else settings.default_budget_cents,
                    payload.priority,
                    profile_id,
                    payload.created_by or "maintenance_api",
                ),
            )
            row = cursor.fetchone()
    if row is None:
        raise DiscoveryMissionConflict("Discovery mission creation did not return a row.")
    return get_discovery_mission_func(str(row["mission_id"]))


def update_discovery_mission(
    mission_id: str,
    payload: Any,
    *,
    require_attachable_discovery_policy_profile_func: Callable[[str], dict[str, Any]],
    get_discovery_mission_func: Callable[[str], dict[str, Any]],
    build_database_url_func: Callable[[], str],
    connect_func: Callable[..., Any],
    dict_row_value: Any,
) -> dict[str, Any]:
    values = payload.model_dump(exclude_unset=True)
    if not values:
        raise DiscoveryMissionValidation(["At least one field must be provided for update."])

    assignments: list[str] = []
    params: list[Any] = []
    for field_name, column_name, cast_suffix in (
        ("title", "title", ""),
        ("description", "description", ""),
        ("status", "status", ""),
        ("priority", "priority", ""),
        ("max_hypotheses", "max_hypotheses", ""),
        ("max_sources", "max_sources", ""),
        ("budget_cents", "budget_cents", ""),
        ("seed_topics", "seed_topics", "::text[]"),
        ("seed_languages", "seed_languages", "::text[]"),
        ("seed_regions", "seed_regions", "::text[]"),
        ("target_provider_types", "target_provider_types", "::text[]"),
        ("profile_id", "profile_id", ""),
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
            params.append(values[field_name])
    if "interest_graph" in values:
        graph_value = values["interest_graph"]
        graph_status = "compiled" if isinstance(graph_value, dict) and graph_value else "pending"
        assignments.extend(
            [
                "interest_graph = %s::jsonb",
                "interest_graph_status = %s",
                "interest_graph_version = interest_graph_version + 1",
                "interest_graph_compiled_at = case when %s = 'compiled' then now() else interest_graph_compiled_at end",
                "interest_graph_error_text = null",
            ]
        )
        params.extend(
            [
                json.dumps(graph_value) if graph_value is not None else None,
                graph_status,
                graph_status,
            ]
        )
    assignments.append("updated_at = now()")
    params.append(mission_id)

    with connect_func(build_database_url_func(), row_factory=dict_row_value) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                update discovery_missions
                set {', '.join(assignments)}
                where mission_id = %s
                returning mission_id::text as mission_id
                """,
                tuple(params),
            )
            row = cursor.fetchone()
    if row is None:
        raise DiscoveryMissionNotFound(f"Discovery mission {mission_id} was not found.")
    return get_discovery_mission_func(mission_id)


def delete_discovery_mission(
    mission_id: str,
    *,
    get_discovery_mission_func: Callable[[str], dict[str, Any]],
    build_database_url_func: Callable[[], str],
    connect_func: Callable[..., Any],
    dict_row_value: Any,
) -> dict[str, Any]:
    mission = get_discovery_mission_func(mission_id)
    with connect_func(build_database_url_func(), row_factory=dict_row_value) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select
                  (select count(*)::int from discovery_hypotheses where mission_id = %s) as hypothesis_count,
                  (select count(*)::int from discovery_candidates where mission_id = %s) as candidate_count,
                  (select count(*)::int from discovery_portfolio_snapshots where mission_id = %s) as portfolio_snapshot_count,
                  (select count(*)::int from discovery_feedback_events where mission_id = %s) as feedback_event_count,
                  (select count(*)::int from discovery_source_interest_scores where mission_id = %s) as source_interest_score_count,
                  (select count(*)::int from discovery_strategy_stats where mission_id = %s) as strategy_stat_count,
                  (select count(*)::int from discovery_cost_log where mission_id = %s) as cost_log_count
                """,
                (
                    mission_id,
                    mission_id,
                    mission_id,
                    mission_id,
                    mission_id,
                    mission_id,
                    mission_id,
                ),
            )
            blockers = cursor.fetchone() or {}
            has_history = (
                int(mission.get("run_count") or 0) > 0
                or int(mission.get("spent_cents") or 0) > 0
                or mission.get("last_run_at") is not None
                or any(int(blockers.get(key) or 0) > 0 for key in blockers)
            )
            if has_history:
                raise DiscoveryMissionConflict(
                    "Discovery mission already has generated history. Archive it instead of deleting it."
                )
            cursor.execute(
                """
                delete from discovery_missions
                where mission_id = %s
                returning mission_id::text as mission_id
                """,
                (mission_id,),
            )
            row = cursor.fetchone()
    if row is None:
        raise DiscoveryMissionNotFound(f"Discovery mission {mission_id} was not found.")
    return {"mission_id": str(row["mission_id"]), "deleted": True}


async def compile_discovery_mission_graph(
    mission_id: str,
    *,
    discovery_coordinator_repository_factory: Callable[[], Any],
    snapshot_discovery_mission_profile_policy_func: Callable[[str], None],
    compile_interest_graph_for_mission_func: Callable[..., Awaitable[Any]],
    get_discovery_mission_func: Callable[[str], dict[str, Any]],
) -> dict[str, Any]:
    repository = discovery_coordinator_repository_factory()
    mission = await repository.get_mission(mission_id)
    if mission is None:
        raise DiscoveryMissionNotFound(f"Discovery mission {mission_id} was not found.")
    if mission.get("status") == "archived":
        raise DiscoveryMissionConflict(
            "Archived discovery missions must be reactivated before compiling the interest graph."
        )
    snapshot_discovery_mission_profile_policy_func(mission_id)
    mission = await repository.get_mission(mission_id)
    if mission is None:
        raise DiscoveryMissionNotFound(f"Discovery mission {mission_id} was not found.")
    await compile_interest_graph_for_mission_func(mission=mission, repository=repository)
    return get_discovery_mission_func(mission_id)


def request_discovery_mission_run(
    mission_id: str,
    payload: Any,
    *,
    discovery_orchestrator_sequence_id: str,
    get_discovery_mission_func: Callable[[str], dict[str, Any]],
    get_discovery_monthly_quota_snapshot_func: Callable[[], dict[str, Any]],
    snapshot_discovery_mission_profile_policy_func: Callable[[str], None],
    create_sequence_run_request_for_trigger_func: Callable[..., dict[str, Any]],
    build_database_url_func: Callable[[], str],
    connect_func: Callable[..., Any],
    dict_row_value: Any,
) -> dict[str, Any]:
    mission = get_discovery_mission_func(mission_id)
    if mission.get("status") == "archived":
        raise DiscoveryMissionConflict(
            "Archived discovery missions must be reactivated before they can run."
        )
    quota_snapshot = get_discovery_monthly_quota_snapshot_func()
    if quota_snapshot["monthlyQuotaReached"]:
        raise DiscoveryMissionConflict(
            "Monthly discovery quota is exhausted; increase DISCOVERY_MONTHLY_BUDGET_CENTS or wait for the next UTC month."
        )
    snapshot_discovery_mission_profile_policy_func(mission_id)
    with connect_func(build_database_url_func(), row_factory=dict_row_value) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                update discovery_missions
                set status = 'active', updated_at = now()
                where mission_id = %s
                """,
                (mission_id,),
            )
    trigger_meta = {"source": "maintenance_discovery_api", "missionId": mission_id}
    if payload.requested_by:
        trigger_meta["requestedBy"] = payload.requested_by
    return create_sequence_run_request_for_trigger_func(
        discovery_orchestrator_sequence_id,
        context_json={"mission_id": mission_id},
        trigger_meta=trigger_meta,
        trigger_type="api",
    )
