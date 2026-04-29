from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from .source_scoring import (
    build_gap_filling_hypotheses,
    build_portfolio_snapshot,
    clamp_score,
    compute_source_interest_score,
    compute_source_recall_quality_snapshot,
)


async def evaluate_hypotheses(
    *,
    hypothesis_ids: list[str],
    repository: Any,
) -> dict[str, Any]:
    stats = await repository.list_hypothesis_candidate_stats(hypothesis_ids)
    mission_ids: set[str] = set()
    for row in stats:
        sources_found = int(row.get("sources_found") or 0)
        sources_approved = int(row.get("sources_approved") or 0)
        effectiveness = round(sources_approved / max(sources_found, 1), 4)
        await repository.update_hypothesis_effectiveness(
            hypothesis_id=str(row["hypothesis_id"]),
            effectiveness=effectiveness,
            sources_approved=sources_approved,
        )
        await repository.upsert_strategy_stat(
            mission_id=str(row["mission_id"]),
            class_key=str(row.get("class_key") or ""),
            tactic_key=str(row.get("tactic_key") or ""),
            success=sources_approved > 0,
            effectiveness=effectiveness,
        )
        mission_ids.add(str(row.get("mission_id") or ""))
    if mission_ids:
        mission_ids.difference_update({""})
        await repository.refresh_mission_stats(sorted(mission_ids))
    return {
        "discovery_evaluated_hypothesis_ids": hypothesis_ids,
        "discovery_evaluated_count": len(hypothesis_ids),
    }


async def re_evaluate_sources(
    *,
    mission_id: str | None,
    repository: Any,
    compile_interest_graph_for_mission_func: Callable[..., Awaitable[dict[str, Any]]],
) -> dict[str, Any]:
    target_mission_ids: list[str]
    if mission_id:
        target_mission_ids = [mission_id]
    else:
        target_mission_ids = [str(item["mission_id"]) for item in await repository.list_runnable_missions()]

    portfolio_count = 0
    feedback_count = 0
    quality_snapshot_count = 0
    class_rows = await repository.list_active_hypothesis_classes()
    for mission_id_text in target_mission_ids:
        mission = await repository.get_mission(mission_id_text)
        if mission is None:
            continue
        graph = mission.get("interest_graph") if isinstance(mission.get("interest_graph"), dict) else {}
        if not graph:
            graph = await compile_interest_graph_for_mission_func(
                mission=mission,
                repository=repository,
            )
        feedback_rows = await repository.list_feedback_events(mission_id_text)
        feedback_count += len(feedback_rows)
        feedback_by_profile: dict[str, list[dict[str, Any]]] = {}
        for row in feedback_rows:
            profile_id = str(row.get("source_profile_id") or "")
            if not profile_id:
                continue
            feedback_by_profile.setdefault(profile_id, []).append(row)

        scored_sources: list[dict[str, Any]] = []
        for row in await repository.list_mission_candidate_profiles(mission_id_text):
            source_profile_id = str(row.get("source_profile_id") or "")
            if not source_profile_id:
                continue
            channel_metrics = await repository.get_channel_metrics(
                str(row.get("registered_channel_id") or "") or None
            )
            if source_profile_id:
                quality_snapshot = compute_source_recall_quality_snapshot(
                    profile={
                        "source_profile_id": source_profile_id,
                        "canonical_domain": row.get("canonical_domain"),
                        "source_type": row.get("source_type"),
                        "trust_score": row.get("trust_score"),
                        "source_linking_quality": row.get("source_linking_quality"),
                        "technical_quality": row.get("technical_quality"),
                        "historical_stability": row.get("historical_stability"),
                        "spam_signals": row.get("spam_signals"),
                        "extraction_data": row.get("extraction_data") or {},
                    },
                    candidate=row,
                    channel_metrics=channel_metrics,
                )
                await repository.upsert_source_quality_snapshot(
                    source_profile_id=source_profile_id,
                    channel_id=str(row.get("registered_channel_id") or "") or None,
                    snapshot_reason="discovery_re_evaluate",
                    snapshot_row=quality_snapshot,
                )
                quality_snapshot_count += 1
            score_row = compute_source_interest_score(
                mission_graph=graph,
                profile={
                    "source_profile_id": source_profile_id,
                    "canonical_domain": row.get("canonical_domain"),
                    "source_type": row.get("source_type"),
                    "trust_score": row.get("trust_score"),
                    "source_linking_quality": row.get("source_linking_quality"),
                    "technical_quality": row.get("technical_quality"),
                    "historical_stability": row.get("historical_stability"),
                    "spam_signals": row.get("spam_signals"),
                    "extraction_data": row.get("extraction_data") or {},
                },
                candidate=row,
                channel_metrics=channel_metrics,
            )
            profile_feedback = feedback_by_profile.get(source_profile_id, [])
            if profile_feedback:
                positive = sum(
                    1
                    for item in profile_feedback
                    if str(item.get("feedback_type") or "") in {"valuable_source", "early_signal", "keep"}
                )
                negative = sum(
                    1
                    for item in profile_feedback
                    if str(item.get("feedback_type") or "") in {"too_noisy", "duplicate_source", "reject"}
                )
                adjusted = clamp_score(
                    clamp_score(score_row.get("contextual_score")) + positive * 0.05 - negative * 0.07
                )
                score_row["contextual_score"] = adjusted
            await repository.upsert_source_interest_score(
                mission_id=mission_id_text,
                source_profile_id=source_profile_id,
                channel_id=str(row.get("registered_channel_id") or "") or None,
                score_row=score_row,
            )
            scored_sources.append(
                {
                    "candidate_id": row.get("candidate_id"),
                    "source_profile_id": source_profile_id,
                    "canonical_domain": row.get("canonical_domain"),
                    "trust_score": clamp_score(row.get("trust_score")),
                    "contextual_score": clamp_score(score_row.get("contextual_score")),
                    "fit_score": clamp_score(score_row.get("fit_score")),
                    "quality_prior": clamp_score(score_row.get("quality_prior")),
                    "final_review_score": clamp_score(score_row.get("final_review_score")),
                    "novelty_score": clamp_score(score_row.get("novelty_score")),
                    "lead_time_score": clamp_score(score_row.get("lead_time_score")),
                    "yield_score": clamp_score(score_row.get("yield_score")),
                    "duplication_score": clamp_score(score_row.get("duplication_score")),
                    "role_labels": score_row.get("role_labels") or [],
                    "source_family": (
                        (row.get("evaluation_json") or {}).get("policyReview", {}).get("matchedSignals", {}).get("queryFamily")
                        if isinstance(row.get("evaluation_json"), dict)
                        else None
                    ),
                    "title": row.get("title"),
                    "url": row.get("url"),
                }
            )

        portfolio = build_portfolio_snapshot(
            mission_graph=graph,
            scored_sources=scored_sources,
        )
        await repository.replace_portfolio_snapshot(
            mission_id=mission_id_text,
            snapshot_reason="re_evaluate",
            ranked_sources=portfolio["ranked_sources"],
            gaps=portfolio["gaps"],
            summary=portfolio["summary"],
        )
        portfolio_count += 1
        await repository.insert_gap_hypotheses(
            mission_id=mission_id_text,
            hypotheses=build_gap_filling_hypotheses(
                mission_graph=graph,
                gaps=portfolio["gaps"],
                class_rows=class_rows,
            ),
        )

    return {
        "discovery_re_evaluated_mission_ids": target_mission_ids,
        "discovery_re_evaluated_count": len(target_mission_ids),
        "discovery_portfolio_snapshot_count": portfolio_count,
        "discovery_feedback_row_count": feedback_count,
        "discovery_source_quality_snapshot_count": quality_snapshot_count,
    }
