from __future__ import annotations

from decimal import Decimal
from typing import Any

from .discovery_candidate_evaluation import (
    candidate_rows_from_context as _candidate_rows_from_context,
)
from .discovery_cost_helpers import (
    meta_cost_usd as _meta_cost_usd,
    meta_input_tokens as _meta_input_tokens,
    meta_output_tokens as _meta_output_tokens,
    meta_request_count as _meta_request_count,
    should_log_external_call as _should_log_external_call,
)
from .discovery_planning import normalize_text_list as _normalize_text_list
from .discovery_policy import (
    build_policy_review,
    normalize_runtime_discovery_policy,
)
from .discovery_runtime_settings import (
    coerce_discovery_cost_usd,
    discovery_cost_usd_to_cents,
    discovery_month_start_utc,
    mission_budget_exhausted as _mission_budget_exhausted,
    monthly_quota_reached as _monthly_quota_reached,
)
from .source_scoring import (
    build_gap_filling_hypotheses,
    build_portfolio_snapshot,
    build_source_profile,
    canonical_domain,
    clamp_score,
    compute_source_interest_score,
    compute_source_recall_quality_snapshot,
)
from .task_engine.adapters.common import normalize_url
from .task_engine.discovery_runtime import get_discovery_runtime, resolve_runtime_call
from .task_engine.executor import SequenceExecutor
from .task_engine.plugins import TASK_REGISTRY


async def execute_hypotheses(
    *,
    mission_id: str | None,
    settings: Any,
    repository: Any,
    sequence_repository: Any,
    rss_pipeline_sequence_id: str,
    website_pipeline_sequence_id: str,
    get_discovery_runtime_func: Any = get_discovery_runtime,
    resolve_runtime_call_func: Any = resolve_runtime_call,
    executor_class: Any = SequenceExecutor,
    task_registry: Any = TASK_REGISTRY,
) -> dict[str, Any]:
    pending_hypotheses = await repository.list_pending_hypotheses(
        mission_id=mission_id,
        limit=settings.max_hypotheses_per_run,
    )
    existing_source_channels = await repository.list_existing_source_channels()
    runtime = get_discovery_runtime_func()
    executor = executor_class(repository=sequence_repository, registry=task_registry)
    month_to_date_cost_usd = await repository.get_month_to_date_cost_usd(
        discovery_month_start_utc()
    )
    mission_spend_usd_map: dict[str, Decimal] = {}

    executed_ids: list[str] = []
    candidate_count = 0
    score_count = 0
    quality_snapshot_count = 0
    for hypothesis in pending_hypotheses:
        mission_id_text = str(hypothesis["mission_id"])
        hypothesis_id_text = str(hypothesis["hypothesis_id"])
        mission_budget_cents = int(hypothesis.get("budget_cents") or 0)
        mission_spent_usd = mission_spend_usd_map.get(
            mission_id_text,
            coerce_discovery_cost_usd(hypothesis.get("spent_usd")),
        )
        if _monthly_quota_reached(
            settings=settings,
            month_to_date_cost_usd=month_to_date_cost_usd,
        ):
            await repository.mark_hypothesis_skipped(
                hypothesis_id=hypothesis_id_text,
                error_text="Monthly discovery quota exhausted before execution.",
            )
            continue
        if _mission_budget_exhausted(
            budget_cents=mission_budget_cents,
            spent_usd=mission_spent_usd,
        ):
            await repository.mark_hypothesis_skipped(
                hypothesis_id=hypothesis_id_text,
                error_text="Mission budget exhausted before execution.",
            )
            continue

        sequence_id = (
            rss_pipeline_sequence_id
            if str(hypothesis.get("target_provider_type") or "rss") == "rss"
            else website_pipeline_sequence_id
        )
        graph = hypothesis.get("interest_graph") if isinstance(hypothesis.get("interest_graph"), dict) else {}
        run_context = {
            "mission_id": mission_id_text,
            "hypothesis_id": hypothesis_id_text,
            "search_query": str(hypothesis.get("search_query") or "").strip(),
            "target_topics": [graph.get("core_topic"), *(_normalize_text_list(graph.get("subtopics"))[:4])],
            "target_urls": _normalize_text_list(hypothesis.get("target_urls")),
            "target_provider_type": str(hypothesis.get("target_provider_type") or "rss"),
            "class_key": str(hypothesis.get("class_key") or ""),
            "tactic_key": str(hypothesis.get("tactic_key") or ""),
        }
        run_id = await sequence_repository.create_pending_run(
            sequence_id=sequence_id,
            context_json=run_context,
            trigger_type="agent",
            trigger_meta={
                "source": "adaptive_discovery_orchestrator",
                "missionId": mission_id_text,
                "hypothesisId": hypothesis_id_text,
                "classKey": str(hypothesis.get("class_key") or ""),
                "tacticKey": str(hypothesis.get("tactic_key") or ""),
            },
        )
        await repository.mark_hypothesis_running(
            hypothesis_id=hypothesis_id_text,
            sequence_run_id=run_id,
        )

        try:
            run_result = await executor.execute_run(run_id)
        except Exception as error:
            await repository.mark_hypothesis_failed(
                hypothesis_id=hypothesis_id_text,
                error_text=str(error),
            )
            continue

        context = dict(run_result.get("context") or {})
        candidates = _candidate_rows_from_context(
            mission_id=mission_id_text,
            hypothesis_id=hypothesis_id_text,
            provider_type=str(hypothesis.get("target_provider_type") or "rss"),
            context=context,
            existing_source_channels=existing_source_channels,
        )
        stored_candidates = await repository.upsert_candidates(candidates)
        approved_count = 0
        graph_policy = normalize_runtime_discovery_policy(
            lane="graph",
            applied_policy_json=(
                hypothesis.get("applied_policy_json")
                if isinstance(hypothesis.get("applied_policy_json"), dict)
                else None
            ),
            mission_like=hypothesis,
        )
        scored_sources: list[dict[str, Any]] = []
        for stored_candidate in stored_candidates:
            candidate_id = str(stored_candidate["candidate_id"])
            evaluation_json = (
                dict(stored_candidate.get("evaluation_json") or {})
                if isinstance(stored_candidate.get("evaluation_json"), dict)
                else {}
            )
            profile_input = build_source_profile(stored_candidate)
            stored_profile = await repository.upsert_source_profile(
                candidate_id=candidate_id,
                profile=profile_input,
            )
            source_profile_id = str(stored_profile.get("source_profile_id") or "")
            if source_profile_id:
                await repository.link_candidate_profile(
                    candidate_id=candidate_id,
                    source_profile_id=source_profile_id,
                )
            channel_metrics = await repository.get_channel_metrics(
                str(stored_candidate.get("registered_channel_id") or "") or None
            )
            if source_profile_id:
                quality_snapshot = compute_source_recall_quality_snapshot(
                    profile={**profile_input, **stored_profile},
                    candidate=stored_candidate,
                    channel_metrics=channel_metrics,
                )
                await repository.upsert_source_quality_snapshot(
                    source_profile_id=source_profile_id,
                    channel_id=str(stored_candidate.get("registered_channel_id") or "") or None,
                    snapshot_reason="discovery_execution",
                    snapshot_row=quality_snapshot,
                )
                quality_snapshot_count += 1
            else:
                quality_snapshot = {"recall_score": 0.0}
            score_input = compute_source_interest_score(
                mission_graph=graph,
                profile={**profile_input, **stored_profile},
                candidate=stored_candidate,
                channel_metrics=channel_metrics,
            )
            await repository.upsert_source_interest_score(
                mission_id=mission_id_text,
                source_profile_id=source_profile_id,
                channel_id=str(stored_candidate.get("registered_channel_id") or "") or None,
                score_row=score_input,
            )
            score_count += 1
            policy_review = build_policy_review(
                lane="graph",
                policy=graph_policy,
                candidate={
                    **stored_candidate,
                    "search_query": hypothesis.get("search_query"),
                    "tactic_key": hypothesis.get("tactic_key"),
                },
                evaluation_json=evaluation_json,
                fit_score=score_input.get("fit_score"),
                quality_prior=quality_snapshot.get("recall_score"),
                lexical_score=score_input.get("contextual_score"),
                default_threshold=settings.default_auto_approve_threshold,
                search_provider=str(evaluation_json.get("search_provider") or settings.search_provider),
                query_family=str(
                    (hypothesis.get("generation_context") or {}).get("query_family")
                    if isinstance(hypothesis.get("generation_context"), dict)
                    else ""
                ),
            )
            evaluation_json["policyReview"] = policy_review
            next_status = None
            next_rejection_reason = None
            if str(stored_candidate.get("status") or "") != "duplicate":
                if policy_review["verdict"] == "rejected":
                    next_status = "rejected"
                    next_rejection_reason = str(policy_review.get("reasonBucket") or "policy_rejected")
                else:
                    next_status = "pending"
            await repository.update_candidate_review(
                candidate_id=candidate_id,
                evaluation_json=evaluation_json,
                status=next_status,
                rejection_reason=next_rejection_reason,
            )
            ranked_source = {
                "candidate_id": candidate_id,
                "source_profile_id": source_profile_id,
                "canonical_domain": stored_profile.get("canonical_domain") or canonical_domain(str(stored_candidate.get("url") or "")),
                "trust_score": clamp_score(stored_profile.get("trust_score")),
                "contextual_score": clamp_score(score_input.get("contextual_score")),
                "fit_score": clamp_score(score_input.get("fit_score")),
                "quality_prior": clamp_score(score_input.get("quality_prior")),
                "final_review_score": clamp_score(policy_review.get("finalReviewScore") or score_input.get("final_review_score")),
                "novelty_score": clamp_score(score_input.get("novelty_score")),
                "lead_time_score": clamp_score(score_input.get("lead_time_score")),
                "yield_score": clamp_score(score_input.get("yield_score")),
                "duplication_score": clamp_score(score_input.get("duplication_score")),
                "role_labels": score_input.get("role_labels") or [],
                "source_family": (
                    policy_review.get("matchedSignals", {}).get("sourceFamily")
                    or policy_review.get("matchedSignals", {}).get("queryFamily")
                    if isinstance(policy_review.get("matchedSignals"), dict)
                    else None
                ),
                "title": stored_candidate.get("title"),
                "url": stored_candidate.get("url"),
            }
            scored_sources.append(ranked_source)

            if stored_candidate.get("status") == "duplicate":
                continue
            if policy_review.get("verdict") == "auto_approve":
                source_payload = dict(stored_candidate)
                source_payload["relevance_score"] = clamp_score(policy_review.get("finalReviewScore"))
                source_payload["evaluation_json"] = evaluation_json
                registrations = await resolve_runtime_call_func(
                    runtime.source_registrar.register_sources(
                        sources=[source_payload],
                        enabled=True,
                        dry_run=False,
                        created_by="adaptive_discovery:agent",
                        tags=["discovery", "adaptive"],
                        provider_type=str(source_payload.get("provider_type") or "rss"),
                    )
                )
                registration = registrations[0] if isinstance(registrations, list) and registrations else {}
                status = "auto_approved"
                channel_id = registration.get("channel_id") if isinstance(registration, dict) else None
                rejection_reason = None
                if isinstance(registration, dict) and registration.get("status") == "duplicate":
                    status = "duplicate"
                    rejection_reason = "already_registered"
                await repository.update_candidate_registration(
                    candidate_id=candidate_id,
                    status=status,
                    channel_id=str(channel_id) if channel_id else None,
                    rejection_reason=rejection_reason,
                )
                if status == "auto_approved":
                    approved_count += 1
            elif stored_candidate.get("status") in {"approved", "auto_approved"}:
                approved_count += 1
            channel_id = str(stored_candidate.get("registered_channel_id") or "").strip()
            if channel_id:
                existing_source_channels[normalize_url(str(stored_candidate.get("url") or ""))] = channel_id

        portfolio = build_portfolio_snapshot(
            mission_graph=graph,
            scored_sources=scored_sources,
            diversity_caps=(
                graph_policy.get("diversityCaps")
                if isinstance(graph_policy.get("diversityCaps"), dict)
                else None
            ),
        )
        await repository.replace_portfolio_snapshot(
            mission_id=mission_id_text,
            snapshot_reason="execution",
            ranked_sources=portfolio["ranked_sources"],
            gaps=portfolio["gaps"],
            summary=portfolio["summary"],
        )
        gap_hypotheses = build_gap_filling_hypotheses(
            mission_graph=graph,
            gaps=portfolio["gaps"],
            class_rows=await repository.list_active_hypothesis_classes(),
        )
        await repository.insert_gap_hypotheses(
            mission_id=mission_id_text,
            hypotheses=gap_hypotheses,
        )

        search_meta = dict(context.get("search_meta") or {}) if isinstance(context.get("search_meta"), dict) else {}
        llm_meta = dict(context.get("llm_analysis_meta") or {}) if isinstance(context.get("llm_analysis_meta"), dict) else {}
        search_cost_usd = _meta_cost_usd(search_meta)
        llm_cost_usd = _meta_cost_usd(llm_meta)
        if _should_log_external_call(search_meta):
            await repository.log_cost(
                mission_id=mission_id_text,
                hypothesis_id=hypothesis_id_text,
                operation="hypothesis_search",
                provider=str(search_meta.get("provider") or settings.search_provider),
                cost_usd=search_cost_usd,
                cost_cents=discovery_cost_usd_to_cents(search_cost_usd),
                input_tokens=None,
                output_tokens=None,
                request_count=_meta_request_count(search_meta),
                metadata={**search_meta, "sequenceRunId": run_id, "sequenceId": sequence_id},
            )
        if _should_log_external_call(llm_meta):
            await repository.log_cost(
                mission_id=mission_id_text,
                hypothesis_id=hypothesis_id_text,
                operation="hypothesis_llm_analysis",
                provider=str(llm_meta.get("provider") or settings.llm_provider),
                cost_usd=llm_cost_usd,
                cost_cents=discovery_cost_usd_to_cents(llm_cost_usd),
                input_tokens=_meta_input_tokens(llm_meta),
                output_tokens=_meta_output_tokens(llm_meta),
                request_count=_meta_request_count(llm_meta),
                metadata={**llm_meta, "sequenceRunId": run_id, "sequenceId": sequence_id},
            )
        execution_cost_usd = search_cost_usd + llm_cost_usd
        execution_cost_cents = discovery_cost_usd_to_cents(execution_cost_usd)
        await repository.mark_hypothesis_completed(
            hypothesis_id=hypothesis_id_text,
            sources_found=len(stored_candidates),
            sources_approved=approved_count,
            execution_cost_cents=execution_cost_cents,
            execution_cost_usd=execution_cost_usd,
        )
        month_to_date_cost_usd += execution_cost_usd
        mission_spend_usd_map[mission_id_text] = mission_spent_usd + execution_cost_usd
        executed_ids.append(hypothesis_id_text)
        candidate_count += len(stored_candidates)

    return {
        "discovery_executed_hypothesis_ids": executed_ids,
        "discovery_executed_count": len(executed_ids),
        "discovery_candidate_count": candidate_count,
        "discovery_source_interest_score_count": score_count,
        "discovery_source_quality_snapshot_count": quality_snapshot_count,
    }
