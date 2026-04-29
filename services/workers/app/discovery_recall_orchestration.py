from __future__ import annotations

from typing import Any

from .discovery_cost_helpers import meta_request_count as _meta_request_count
from .discovery_planning import (
    coerce_mapping_list as _coerce_mapping_list,
    normalize_text_list as _normalize_text_list,
)
from .discovery_policy import (
    build_policy_review,
    classify_pre_probe_negative,
    normalize_runtime_discovery_policy,
)
from .discovery_recall_runtime import (
    build_recall_search_plans as _build_recall_search_plans,
    canonical_origin_url as _canonical_origin_url,
    looks_like_feed_candidate_url as _looks_like_feed_candidate_url,
    probe_failure_rows as _probe_failure_rows,
    recall_candidate_rows_from_probe_results as _recall_candidate_rows_from_probe_results,
    seed_probe_targets_for_recall_mission as _seed_probe_targets_for_recall_mission,
)
from .source_scoring import (
    build_source_profile,
    clamp_score,
    compute_source_recall_quality_snapshot,
)
from .task_engine.adapters.common import normalize_url
from .task_engine.adapters.web_search import unwrap_web_search_output
from .task_engine.discovery_runtime import get_discovery_runtime, resolve_runtime_call


async def acquire_recall_missions(
    *,
    recall_mission_id: str | None,
    settings: Any,
    repository: Any,
    get_discovery_runtime_func: Any = get_discovery_runtime,
    resolve_runtime_call_func: Any = resolve_runtime_call,
) -> dict[str, Any]:
    runtime = get_discovery_runtime_func()
    existing_source_channels = await repository.list_existing_source_channels()
    executed_mission_ids: list[str] = []
    candidate_count = 0
    source_profile_count = 0
    quality_snapshot_count = 0
    search_request_count = 0
    probe_count = 0
    provider_breakdown: dict[str, int] = {}

    for mission in await repository.list_runnable_recall_missions(
        recall_mission_id=recall_mission_id
    ):
        recall_mission_id_text = str(mission["recall_mission_id"])
        max_candidates = max(1, int(mission.get("max_candidates") or settings.default_max_sources))
        mission_candidates: list[dict[str, Any]] = []
        recall_policy = normalize_runtime_discovery_policy(
            lane="recall",
            applied_policy_json=(
                mission.get("applied_policy_json")
                if isinstance(mission.get("applied_policy_json"), dict)
                else None
            ),
            mission_like=mission,
        )
        supported_provider_types = [
            provider
            for provider in _normalize_text_list(mission.get("target_provider_types"))
            if provider in {"rss", "website"}
        ]
        if not supported_provider_types:
            continue

        for provider_type in supported_provider_types:
            remaining_capacity = max_candidates - len(mission_candidates)
            if remaining_capacity <= 0:
                break
            probe_targets = _seed_probe_targets_for_recall_mission(
                mission=mission,
                provider_type=provider_type,
            )
            search_plans = _build_recall_search_plans(
                mission=mission,
                provider_type=provider_type,
                max_plans=min(max_candidates, 8),
                policy=recall_policy,
            )
            for search_plan in search_plans:
                if len(probe_targets) >= max_candidates:
                    break
                try:
                    raw_results = await resolve_runtime_call_func(
                        runtime.web_search.search(
                            query=str(search_plan["query"]),
                            count=min(remaining_capacity, 5),
                            result_type="text",
                            time_range="month",
                        )
                    )
                    search_results, search_meta = unwrap_web_search_output(raw_results)
                except Exception as error:
                    search_results = []
                    search_meta = {
                        "provider": settings.search_provider,
                        "request_count": 1,
                        "error_text": str(error),
                    }
                search_request_count += max(1, _meta_request_count(search_meta))
                for result in search_results:
                    result_url = str(result.get("url") or "").strip()
                    if not result_url:
                        continue
                    pre_probe_negative = classify_pre_probe_negative(
                        url=result_url,
                        title=str(result.get("title") or ""),
                        snippet=str(result.get("snippet") or ""),
                    )
                    if pre_probe_negative:
                        continue
                    if provider_type == "rss" and not _looks_like_feed_candidate_url(result_url):
                        continue
                    probe_url = (
                        _canonical_origin_url(result_url)
                        if provider_type == "website"
                        else result_url
                    )
                    if not probe_url:
                        continue
                    normalized_probe_url = normalize_url(probe_url)
                    probe_targets.setdefault(
                        normalized_probe_url,
                        {
                            "probe_url": probe_url,
                            "quality_signal_source": search_plan["quality_signal_source"],
                            "seed_type": search_plan["seed_type"],
                            "seed_value": search_plan["seed_value"],
                            "search_query": search_plan["query"],
                            "search_provider": str(
                                search_meta.get("provider") or settings.search_provider
                            ),
                            "search_result_title": str(result.get("title") or ""),
                            "search_snippet": str(result.get("snippet") or ""),
                            "query_family": str(search_plan.get("query_family") or ""),
                        },
                    )
                    if len(probe_targets) >= max_candidates:
                        break

            probe_urls = [
                item["probe_url"]
                for item in list(probe_targets.values())[:remaining_capacity]
                if isinstance(item.get("probe_url"), str) and item["probe_url"].strip()
            ]
            if not probe_urls:
                continue

            try:
                if provider_type == "rss":
                    raw_probe_rows = await resolve_runtime_call_func(
                        runtime.rss_probe.probe_feeds(urls=probe_urls, sample_count=3)
                    )
                else:
                    raw_probe_rows = await resolve_runtime_call_func(
                        runtime.website_probe.probe_websites(urls=probe_urls, sample_count=3)
                    )
            except Exception as error:
                raw_probe_rows = _probe_failure_rows(
                    provider_type=provider_type,
                    probe_urls=probe_urls,
                    error_text=str(error),
                )
            probe_rows = _coerce_mapping_list(raw_probe_rows)
            probe_count += len(probe_urls)
            provider_breakdown[provider_type] = provider_breakdown.get(provider_type, 0) + len(
                probe_rows
            )
            mission_candidates.extend(
                _recall_candidate_rows_from_probe_results(
                    recall_mission_id=recall_mission_id_text,
                    provider_type=provider_type,
                    probe_rows=probe_rows,
                    probe_targets=probe_targets,
                    existing_source_channels=existing_source_channels,
                )
            )

        stored_candidates = await repository.upsert_recall_candidates(
            mission_candidates[:max_candidates]
        )
        for stored_candidate in stored_candidates:
            evaluation_json = (
                dict(stored_candidate.get("evaluation_json") or {})
                if isinstance(stored_candidate.get("evaluation_json"), dict)
                else {}
            )
            if stored_candidate.get("status") == "rejected" and stored_candidate.get(
                "rejection_reason"
            ) in {"invalid_feed", "probe_failed"}:
                continue
            profile_input = build_source_profile(
                {
                    **stored_candidate,
                    "is_valid": bool(evaluation_json.get("is_valid", True)),
                    "sample_data": (
                        evaluation_json.get("sample_data")
                        if isinstance(evaluation_json.get("sample_data"), list)
                        else []
                    ),
                    "llm_assessment": {},
                }
            )
            stored_profile = await repository.upsert_source_profile_for_recall_candidate(
                profile=profile_input
            )
            source_profile_id = str(stored_profile.get("source_profile_id") or "")
            if source_profile_id:
                await repository.link_recall_candidate_profile(
                    recall_candidate_id=str(stored_candidate["recall_candidate_id"]),
                    source_profile_id=source_profile_id,
                )
                quality_snapshot = compute_source_recall_quality_snapshot(
                    profile={**profile_input, **stored_profile},
                    candidate={
                        **stored_candidate,
                        "is_valid": bool(evaluation_json.get("is_valid", True)),
                    },
                    channel_metrics=await repository.get_channel_metrics(None),
                )
                await repository.upsert_source_quality_snapshot(
                    source_profile_id=source_profile_id,
                    channel_id=None,
                    snapshot_reason="recall_acquisition",
                    snapshot_row=quality_snapshot,
                )
                source_profile_count += 1
                quality_snapshot_count += 1
                policy_review = build_policy_review(
                    lane="recall",
                    policy=recall_policy,
                    candidate=stored_candidate,
                    evaluation_json=evaluation_json,
                    fit_score=clamp_score(evaluation_json.get("relevance_score")),
                    quality_prior=quality_snapshot.get("recall_score"),
                    lexical_score=quality_snapshot.get("recall_score"),
                    default_threshold=settings.default_auto_approve_threshold,
                    search_provider=str(
                        evaluation_json.get("search_provider") or settings.search_provider
                    ),
                    query_family=str(evaluation_json.get("query_family") or ""),
                )
                evaluation_json["policyReview"] = policy_review
                candidate_status = str(stored_candidate.get("status") or "pending")
                next_status = candidate_status
                rejection_reason = str(stored_candidate.get("rejection_reason") or "").strip() or None
                if candidate_status != "duplicate":
                    if policy_review["verdict"] == "rejected":
                        next_status = "rejected"
                        rejection_reason = str(policy_review["reasonBucket"] or "policy_rejected")
                    else:
                        next_status = "pending"
                        rejection_reason = None
                await repository.update_recall_candidate_review(
                    recall_candidate_id=str(stored_candidate["recall_candidate_id"]),
                    evaluation_json=evaluation_json,
                    status=next_status,
                    rejection_reason=rejection_reason,
                )
            if str(stored_candidate.get("url") or "").strip():
                channel_id = str(stored_candidate.get("registered_channel_id") or "").strip()
                if channel_id:
                    existing_source_channels[normalize_url(str(stored_candidate["url"]))] = channel_id

        await repository.refresh_recall_mission_stats([recall_mission_id_text])
        executed_mission_ids.append(recall_mission_id_text)
        candidate_count += len(stored_candidates)

    return {
        "discovery_recall_executed_mission_ids": executed_mission_ids,
        "discovery_recall_executed_count": len(executed_mission_ids),
        "discovery_recall_candidate_count": candidate_count,
        "discovery_recall_source_profile_count": source_profile_count,
        "discovery_recall_source_quality_snapshot_count": quality_snapshot_count,
        "discovery_recall_search_request_count": search_request_count,
        "discovery_recall_probe_count": probe_count,
        "discovery_recall_provider_breakdown": provider_breakdown,
    }
