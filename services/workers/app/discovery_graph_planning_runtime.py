from __future__ import annotations

from typing import Any

from .discovery_cost_helpers import (
    meta_cost_usd as _meta_cost_usd,
    meta_input_tokens as _meta_input_tokens,
    meta_output_tokens as _meta_output_tokens,
    meta_request_count as _meta_request_count,
    should_log_external_call as _should_log_external_call,
)
from .discovery_planning import (
    build_default_hypotheses_from_graph as _build_default_hypotheses_from_graph,
    coerce_mapping_list as _coerce_mapping_list,
    dedup_hypotheses as _dedup_hypotheses,
    default_interest_graph as _default_interest_graph,
    normalize_text_list as _normalize_text_list,
    validate_interest_graph as _validate_interest_graph,
)
from .discovery_runtime_settings import (
    discovery_cost_usd_to_cents,
    discovery_month_start_utc,
    monthly_quota_reached as _monthly_quota_reached,
)
from .task_engine.adapters.llm_analyzer import unwrap_llm_analyzer_output
from .task_engine.discovery_runtime import get_discovery_runtime, resolve_runtime_call


async def compile_interest_graph_for_mission(
    *,
    mission: dict[str, Any],
    repository: Any,
    get_discovery_runtime_func: Any = get_discovery_runtime,
    resolve_runtime_call_func: Any = resolve_runtime_call,
) -> dict[str, Any]:
    existing_graph = mission.get("interest_graph")
    if isinstance(existing_graph, dict):
        try:
            graph = _validate_interest_graph(existing_graph)
            await repository.upsert_interest_graph(
                mission_id=str(mission["mission_id"]),
                interest_graph=graph,
                status="compiled",
                error_text=None,
            )
            return graph
        except Exception:
            pass

    runtime = get_discovery_runtime_func()
    existing_urls = await repository.list_existing_source_urls()
    fallback_graph = _default_interest_graph(mission, existing_urls)
    llm_meta: dict[str, Any] = {}
    try:
        raw_graph = await resolve_runtime_call_func(
            runtime.llm_analyzer.analyze(
                prompt=None,
                task="discovery_compile_interest_graph",
                payload={
                    "title": mission.get("title"),
                    "description": mission.get("description"),
                    "seed_topics": _normalize_text_list(mission.get("seed_topics")),
                    "seed_languages": _normalize_text_list(mission.get("seed_languages")),
                    "seed_regions": _normalize_text_list(mission.get("seed_regions")),
                    "target_provider_types": _normalize_text_list(mission.get("target_provider_types")),
                    "known_good_sources": fallback_graph["known_good_sources"],
                },
                model=None,
                temperature=0.0,
                output_schema=None,
            )
        )
        graph_result, llm_meta = unwrap_llm_analyzer_output(raw_graph)
        graph = _validate_interest_graph(graph_result)
    except Exception:
        graph = fallback_graph
    await repository.upsert_interest_graph(
        mission_id=str(mission["mission_id"]),
        interest_graph=graph,
        status="compiled",
        error_text=None,
    )
    if _should_log_external_call(llm_meta):
        llm_cost_usd = _meta_cost_usd(llm_meta)
        await repository.log_cost(
            mission_id=str(mission["mission_id"]),
            hypothesis_id=None,
            operation="mission_graph_compile_llm",
            provider=str(llm_meta.get("provider") or "gemini"),
            cost_usd=llm_cost_usd,
            cost_cents=discovery_cost_usd_to_cents(llm_cost_usd),
            input_tokens=_meta_input_tokens(llm_meta),
            output_tokens=_meta_output_tokens(llm_meta),
            request_count=_meta_request_count(llm_meta),
            metadata={**llm_meta, "task": "discovery_compile_interest_graph"},
        )
    return graph


async def plan_hypotheses(
    *,
    mission_id: str | None,
    settings: Any,
    repository: Any,
    class_keys: list[str] | None = None,
    get_discovery_runtime_func: Any = get_discovery_runtime,
    resolve_runtime_call_func: Any = resolve_runtime_call,
    compile_interest_graph_for_mission_func: Any = compile_interest_graph_for_mission,
) -> dict[str, Any]:
    await repository.ensure_interest_template_missions(settings=settings)
    existing_source_channels = await repository.list_existing_source_channels()
    existing_source_urls = set(existing_source_channels.keys())
    runtime = get_discovery_runtime_func()
    month_to_date_cost_usd = await repository.get_month_to_date_cost_usd(
        discovery_month_start_utc()
    )
    class_rows = await repository.list_active_hypothesis_classes(class_keys=class_keys)
    planned_hypothesis_ids: list[str] = []
    planned_mission_ids: list[str] = []

    for mission in await repository.list_runnable_missions(mission_id=mission_id):
        if _monthly_quota_reached(
            settings=settings,
            month_to_date_cost_usd=month_to_date_cost_usd,
        ):
            break
        graph = mission.get("interest_graph")
        if not isinstance(graph, dict) or mission.get("interest_graph_status") != "compiled":
            graph = await compile_interest_graph_for_mission_func(
                mission=mission,
                repository=repository,
            )
        recent = await repository.list_recent_hypotheses(str(mission["mission_id"]))
        stats_rows = await repository.list_strategy_stats(str(mission["mission_id"]))
        seed_hypotheses = _build_default_hypotheses_from_graph(
            graph=graph,
            class_rows=class_rows,
            stats_rows=stats_rows,
            applied_policy_json=(
                mission.get("applied_policy_json")
                if isinstance(mission.get("applied_policy_json"), dict)
                else None
            ),
        )
        raw_hypotheses = await resolve_runtime_call_func(
            runtime.llm_analyzer.analyze(
                prompt=None,
                task="discovery_plan_hypotheses",
                payload={
                    "mission_id": mission["mission_id"],
                    "interest_graph": graph,
                    "classes": class_rows,
                    "seed_hypotheses": seed_hypotheses,
                    "recent_hypotheses": recent,
                    "known_good_sources": sorted(existing_source_urls)[:200],
                },
                model=None,
                temperature=0.0,
                output_schema=None,
            )
        )
        llm_hypotheses, llm_meta = unwrap_llm_analyzer_output(raw_hypotheses)
        if _should_log_external_call(llm_meta):
            llm_cost_usd = _meta_cost_usd(llm_meta)
            await repository.log_cost(
                mission_id=str(mission["mission_id"]),
                hypothesis_id=None,
                operation="mission_planning_llm",
                provider=str(llm_meta.get("provider") or settings.llm_provider),
                cost_usd=llm_cost_usd,
                cost_cents=discovery_cost_usd_to_cents(llm_cost_usd),
                input_tokens=_meta_input_tokens(llm_meta),
                output_tokens=_meta_output_tokens(llm_meta),
                request_count=_meta_request_count(llm_meta),
                metadata={**llm_meta, "task": "discovery_plan_hypotheses"},
            )
            month_to_date_cost_usd += llm_cost_usd

        hypotheses = _coerce_mapping_list(llm_hypotheses) or seed_hypotheses
        filtered = _dedup_hypotheses(
            hypotheses,
            recent,
            max_hypotheses=min(
                int(mission.get("max_hypotheses") or settings.max_hypotheses_per_run),
                settings.max_hypotheses_per_run,
            ),
        )
        inserted_ids = await repository.insert_hypotheses(
            mission_id=str(mission["mission_id"]),
            hypotheses=filtered,
        )
        if inserted_ids:
            planned_mission_ids.append(str(mission["mission_id"]))
            planned_hypothesis_ids.extend(inserted_ids)

    return {
        "discovery_planned_mission_ids": planned_mission_ids,
        "discovery_planned_hypothesis_ids": planned_hypothesis_ids,
        "discovery_planned_count": len(planned_hypothesis_ids),
    }
