from __future__ import annotations

import asyncio
import os
from typing import Any

from .discovery_v3_adversarial import refine_hypothesis_pack
from .discovery_v3_claims import build_direct_followup_hypotheses_from_claim
from .discovery_v3_coverage import compute_coverage
from .discovery_v3_graph import compile_interest_graph, merge_graph_expansions
from .discovery_v3_hypotheses import build_initial_frontier
from .discovery_v3_execution import execute_hypothesis_batch_live, execute_hypothesis_batch_with_fixtures
from .discovery_v3_llm_gateway import DiscoveryV3LlmGateway
from .discovery_v3_llm_tasks import constructive_skeptic_review, expand_graph_with_llm, verification_skeptic_review
from .discovery_v3_negative_evidence import negative_evidence_blocks_hypothesis
from .discovery_v3_provider_health import provider_execution_budget_multiplier
from .discovery_v3_repository import DiscoveryV3Repository
from .discovery_v3_self_healing import build_repair_rows, diagnose_run_health
from .discovery_v3_settings import DiscoveryV3Settings
from .discovery_v3_source_expansion import build_existing_source_hypotheses
from .task_engine.adapters import build_live_discovery_runtime
from .task_engine.adapters.source_registrar import PostgresSourceRegistrarAdapter


def filter_frontier_for_runtime_guards(
    hypotheses: list[dict[str, Any]],
    *,
    negative_evidence: list[dict[str, Any]],
    provider_health: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    health_by_provider = {
        str(row.get("provider_id") or row.get("providerId") or ""): row
        for row in provider_health
        if row.get("provider_id") or row.get("providerId")
    }
    accepted: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    for hypothesis in hypotheses:
        blocked, failure_mode = negative_evidence_blocks_hypothesis(hypothesis, negative_evidence)
        if blocked:
            skipped.append(
                {
                    "hypothesis": hypothesis,
                    "reason": "negative_evidence_cooldown",
                    "failureMode": failure_mode,
                }
            )
            continue

        provider_id = str(hypothesis.get("provider_id") or hypothesis.get("providerId") or "")
        health = health_by_provider.get(provider_id)
        if health:
            multiplier = provider_execution_budget_multiplier(health)
            if multiplier <= 0:
                skipped.append(
                    {
                        "hypothesis": hypothesis,
                        "reason": "provider_circuit_breaker",
                        "providerId": provider_id,
                        "providerStatus": health.get("status"),
                    }
                )
                continue
            if multiplier < 1:
                hypothesis = {
                    **hypothesis,
                    "priority_score": round(float(hypothesis.get("priority_score") or 0.5) * multiplier, 4),
                    "explorer_json": {
                        **(hypothesis.get("explorer_json") if isinstance(hypothesis.get("explorer_json"), dict) else {}),
                        "providerBudgetMultiplier": multiplier,
                    },
                }

        accepted.append(hypothesis)
    return accepted, skipped


async def bootstrap_system_interest_targets(
    *,
    repository: DiscoveryV3Repository,
) -> list[dict[str, Any]]:
    from .discovery_v3_graph import build_target_from_system_interest

    targets: list[dict[str, Any]] = []
    for row in await repository.list_active_system_interests():
        target_payload = build_target_from_system_interest(row)
        target_payload["graph_json"] = compile_interest_graph(target_payload)
        targets.append(await repository.upsert_target_from_origin(target_payload))
    return targets


async def refresh_coverage(
    *,
    target_id: str,
    repository: DiscoveryV3Repository,
    run_id: str | None = None,
) -> dict[str, Any]:
    target = await repository.get_target(target_id)
    graph = target.get("graph_json") or compile_interest_graph(target)
    inventory = await repository.list_source_inventory()
    coverage = compute_coverage(target_id=target_id, graph=graph, source_inventory=inventory)
    return await repository.save_coverage_snapshot({**coverage, "target_id": target_id, "run_id": run_id})


async def start_discovery_run(
    *,
    target_id: str,
    run_kind: str,
    repository: DiscoveryV3Repository,
    trigger_kind: str = "manual",
    created_by: str | None = None,
    summary_json: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return await repository.create_run(
        {
            "target_id": target_id,
            "run_kind": run_kind,
            "trigger_kind": trigger_kind,
            "created_by": created_by,
            "summary_json": summary_json or {},
        }
    )


async def run_discovery(
    *,
    run_id: str,
    repository: DiscoveryV3Repository,
    llm_gateway: DiscoveryV3LlmGateway | None = None,
) -> dict[str, Any]:
    run = await repository.get_run(run_id)
    await repository.mark_run_running(run_id)
    target = await repository.get_target(str(run["target_id"]))
    graph = target.get("graph_json") or compile_interest_graph(target)
    if llm_gateway is not None and _llm_graph_enabled(target):
        expansion = await expand_graph_with_llm(gateway=llm_gateway, target=target, graph=graph)
        graph = merge_graph_expansions(graph, _graph_expansion_payload(expansion))
        await repository.update_target_graph(str(target["target_id"]), graph)
    coverage_snapshot = await refresh_coverage(
        target_id=str(target["target_id"]),
        repository=repository,
        run_id=run_id,
    )
    inventory = await repository.list_source_inventory()
    frontier = build_initial_frontier(
        target=target,
        graph=graph,
        coverage=coverage_snapshot,
        run=run,
    )
    if str(run.get("run_kind")) in {"source_expand", "replacement"}:
        summary_json = run.get("summary_json") if isinstance(run.get("summary_json"), dict) else {}
        channel_id = summary_json.get("sourceChannelId") or summary_json.get("channelId")
        frontier.extend(
            build_existing_source_hypotheses(
                target=target,
                graph=graph,
                run=run,
                source_inventory=inventory,
                channel_id=str(channel_id) if channel_id else None,
                replacement_only=str(run.get("run_kind")) == "replacement",
            )
        )
    confirmed_claims = await repository.list_confirmed_claims(str(target["target_id"]))
    for claim in confirmed_claims:
        frontier.extend(
            build_direct_followup_hypotheses_from_claim(
                claim=claim,
                target=target,
                graph=graph,
                run=run,
            )
        )
    execution_fixtures = _provider_fixtures_from_run(run)
    max_depth = max(1, min(int(run.get("max_depth") or 1), 3))
    max_hypotheses = int(run.get("max_hypotheses") or 120)
    total_stored = 0
    total_skipped = 0
    runtime_guard_reasons: set[str] = set()
    execution_summaries: list[dict[str, Any]] = []
    seen_queries: set[str] = set()

    for depth in range(max_depth):
        if not frontier or total_stored >= max_hypotheses:
            break
        refined_pack = await _refine_frontier(
            target=target,
            run=run,
            graph=graph,
            coverage=coverage_snapshot,
            frontier=frontier,
            llm_gateway=llm_gateway,
        )
        await _persist_debate(repository=repository, target=target, run=run, pack=refined_pack)
        hypotheses = _accepted_hypotheses_from_pack(refined_pack, run=run, target=target)
        hypotheses = [
            hypothesis
            for hypothesis in hypotheses
            if not (hypothesis.get("query_text") and str(hypothesis["query_text"]) in seen_queries)
        ]
        negative_evidence = await repository.list_negative_evidence(str(target["target_id"]))
        provider_health = await repository.list_provider_health()
        guarded_hypotheses, skipped_hypotheses = filter_frontier_for_runtime_guards(
            hypotheses,
            negative_evidence=negative_evidence,
            provider_health=provider_health,
        )
        total_skipped += len(skipped_hypotheses)
        runtime_guard_reasons.update(str(item.get("reason")) for item in skipped_hypotheses)
        stored = await repository.insert_hypotheses(guarded_hypotheses[: max(0, max_hypotheses - total_stored)])
        total_stored += len(stored)
        seen_queries.update(str(row.get("query_text")) for row in stored if row.get("query_text"))
        if not stored:
            break

        execution_result: dict[str, Any] | None = None
        execution_summary: dict[str, Any] = {"executionMode": "provider_execution_disabled_until_operator_approval"}
        if execution_fixtures:
            execution_result = execute_hypothesis_batch_with_fixtures(stored, provider_fixtures=execution_fixtures)
            execution_summary = {"executionMode": "fixture_execution_bridge", **execution_result["summary"]}
        elif _live_execution_enabled(run):
            execution_result = await execute_hypothesis_batch_live(
                stored,
                runtime=build_live_discovery_runtime(),
                max_results_per_hypothesis=max(1, min(20, int(run.get("max_search_results") or 800))),
                max_domains=int(run.get("max_domains") or 400),
                max_endpoints=int(run.get("max_endpoints") or 700),
            )
            execution_summary = {"executionMode": "bounded_live_provider_execution", **execution_result["summary"]}

        if execution_result is not None:
            await _persist_execution_result(
                repository=repository,
                target_id=str(target["target_id"]),
                run_id=run_id,
                execution_result=execution_result,
            )
            frontier = [row for row in execution_result.get("followUpHypotheses", []) if isinstance(row, dict)]
            coverage_snapshot = await refresh_coverage(
                target_id=str(target["target_id"]),
                repository=repository,
                run_id=run_id,
            )
            if not frontier and not execution_result["summary"].get("endpointCount") and not execution_result["summary"].get("domainCount"):
                execution_summaries.append({"depth": depth, **execution_summary})
                break
        else:
            frontier = []
        execution_summaries.append({"depth": depth, **execution_summary})
        if float(coverage_snapshot.get("coverage_score") or 0) >= DiscoveryV3Settings().min_coverage_score:
            break

    summary = {
        "targetId": str(target["target_id"]),
        "coverageSnapshotId": str(coverage_snapshot["coverage_snapshot_id"]),
        "hypothesesCreated": total_stored,
        "confirmedClaimsUsed": len(confirmed_claims),
        "hypothesesSkippedByRuntimeGuards": total_skipped,
        "runtimeGuardReasons": sorted(runtime_guard_reasons),
        "generations": execution_summaries,
        **(execution_summaries[-1] if execution_summaries else {"executionMode": "no_hypotheses_executed"}),
    }
    await repository.mark_run_completed(run_id, summary)
    return summary


def _provider_fixtures_from_run(run: dict[str, Any]) -> dict[str, Any]:
    summary_json = run.get("summary_json") if isinstance(run.get("summary_json"), dict) else {}
    params_json = run.get("params_json") if isinstance(run.get("params_json"), dict) else {}
    fixtures = summary_json.get("providerFixtures") or summary_json.get("provider_fixtures")
    if fixtures is None:
        fixtures = params_json.get("providerFixtures") or params_json.get("provider_fixtures")
    return dict(fixtures) if isinstance(fixtures, dict) else {}


def _live_execution_enabled(run: dict[str, Any]) -> bool:
    summary_json = run.get("summary_json") if isinstance(run.get("summary_json"), dict) else {}
    if summary_json.get("providerExecutionEnabled") is True or summary_json.get("provider_execution_enabled") is True:
        return True
    return os.getenv("DISCOVERY_V3_LIVE_EXECUTION", "0").strip().lower() in {"1", "true", "yes", "on"}


def _llm_graph_enabled(target: dict[str, Any]) -> bool:
    policy = target.get("policy_json") if isinstance(target.get("policy_json"), dict) else {}
    autopilot = target.get("autopilot_json") if isinstance(target.get("autopilot_json"), dict) else {}
    return bool(policy.get("llmGraphExpansion") or autopilot.get("llmGraphExpansion"))


def _graph_expansion_payload(expansion: dict[str, Any]) -> dict[str, Any]:
    return {
        "entities": expansion.get("entities") or [],
        "aliases": expansion.get("aliases") or [],
        "subtopics": expansion.get("subtopics") or [],
        "eventTypes": expansion.get("eventTypes") or [],
        "directSignalPhrases": expansion.get("directSignalPhrases") or [],
        "hiddenSignalPhrases": expansion.get("hiddenSignalPhrases") or [],
        "sourceRoleHints": expansion.get("sourceRoleHints") or [],
        "localizedTerms": expansion.get("localizedTerms") or {},
        "negativePatterns": expansion.get("negativePatterns") or [],
        "providerHints": expansion.get("providerHints") or [],
        "llmAssumptions": expansion.get("assumptions") or [],
    }


async def _refine_frontier(
    *,
    target: dict[str, Any],
    run: dict[str, Any],
    graph: dict[str, Any],
    coverage: dict[str, Any],
    frontier: list[dict[str, Any]],
    llm_gateway: DiscoveryV3LlmGateway | None,
) -> dict[str, Any]:
    input_payload = {
        "target": target,
        "run": run,
        "graph": graph,
        "coverage": coverage,
        "hypotheses": frontier,
    }

    async def explorer(payload: dict[str, Any]) -> dict[str, Any]:
        return {"hypotheses": list(payload.get("hypotheses") or [])}

    async def review(payload: dict[str, Any]) -> dict[str, Any]:
        return await constructive_skeptic_review(
            gateway=llm_gateway,
            payload=payload,
            target_id=str(target.get("target_id")),
            run_id=str(run.get("run_id")),
        )

    async def verify(payload: dict[str, Any]) -> dict[str, Any]:
        return await verification_skeptic_review(
            gateway=llm_gateway,
            payload=payload,
            target_id=str(target.get("target_id")),
            run_id=str(run.get("run_id")),
        )

    return await refine_hypothesis_pack(
        input_payload,
        explorer=explorer,
        skeptic_review=review,
        skeptic_verify=verify,
        settings=DiscoveryV3Settings(),
    )


def _accepted_hypotheses_from_pack(
    pack: dict[str, Any],
    *,
    run: dict[str, Any],
    target: dict[str, Any],
) -> list[dict[str, Any]]:
    accepted_decisions = {"accept", "accept_after_repair", "monitor_only", "manual_review"}
    rows: list[dict[str, Any]] = []
    for item in list(pack.get("hypotheses") or []):
        if not isinstance(item, dict):
            continue
        decision = str(item.get("refereeDecision") or "accept")
        if decision not in accepted_decisions:
            continue
        row = dict(item)
        row = _normalize_hypothesis_for_insert(row)
        row["run_id"] = row.get("run_id") or run.get("run_id")
        row["target_id"] = row.get("target_id") or target.get("target_id")
        row["debate_state"] = "referee_accepted"
        row["skeptic_json"] = {
            **(row.get("skeptic_json") if isinstance(row.get("skeptic_json"), dict) else {}),
            "refereeDecision": decision,
            "refereeReason": row.get("refereeReason"),
        }
        rows.append(row)
    return rows


def _normalize_hypothesis_for_insert(row: dict[str, Any]) -> dict[str, Any]:
    mapping = {
        "hypothesisType": "hypothesis_type",
        "signalMode": "signal_mode",
        "sourceRole": "source_role",
        "acquisitionTactic": "acquisition_tactic",
        "queryText": "query_text",
        "seedUrl": "seed_url",
        "seedDomain": "seed_domain",
        "seedEntity": "seed_entity",
        "providerId": "provider_id",
        "controlQueryText": "control_query_text",
        "controlProviderId": "control_provider_id",
        "controlExpectedNoise": "control_expected_noise",
        "expectedProviderTypes": "expected_provider_types",
        "expectedEndpointKinds": "expected_endpoint_kinds",
        "endpointPatterns": "endpoint_patterns",
        "expectedDataShape": "expected_data_shape",
        "priorityScore": "priority_score",
        "noveltyScore": "novelty_score",
        "gapScore": "gap_score",
        "riskScore": "risk_score",
        "confidenceScore": "confidence_score",
    }
    normalized = dict(row)
    for camel, snake in mapping.items():
        if camel in normalized and snake not in normalized:
            normalized[snake] = normalized[camel]
    normalized.setdefault("hypothesis_type", "skeptic_added")
    normalized.setdefault("signal_mode", "direct")
    normalized.setdefault("source_role", "source_directory")
    normalized.setdefault("acquisition_tactic", "search_fanout")
    normalized.setdefault("provider_id", "web_search")
    normalized.setdefault("expected_provider_types", ["rss", "website"])
    normalized.setdefault("expected_endpoint_kinds", [])
    normalized.setdefault("endpoint_patterns", [])
    normalized.setdefault("priority_score", 0.5)
    normalized.setdefault("novelty_score", 0.5)
    normalized.setdefault("gap_score", 0.5)
    normalized.setdefault("risk_score", 0.5)
    normalized.setdefault("confidence_score", 0.5)
    return normalized


async def _persist_debate(
    *,
    repository: DiscoveryV3Repository,
    target: dict[str, Any],
    run: dict[str, Any],
    pack: dict[str, Any],
) -> None:
    try:
        await repository.insert_debate(
            {
                "target_id": target.get("target_id"),
                "run_id": run.get("run_id"),
                "debate_kind": "hypothesis_generation",
                "explorer_output_json": {"hypothesisCount": len(pack.get("hypotheses") or [])},
                "skeptic_output_json": {"debateLog": pack.get("debateLog") or []},
                "repaired_output_json": {"repairMeta": pack.get("repairMeta") or {}},
                "referee_output_json": {
                    "verification": pack.get("verification") or {},
                    "decisions": [
                        {"decision": row.get("refereeDecision"), "reason": row.get("refereeReason")}
                        for row in list(pack.get("hypotheses") or [])
                        if isinstance(row, dict)
                    ],
                },
                "disagreement_score": float((pack.get("verification") or {}).get("disagreementScore") or 0),
                "accepted": True,
            }
        )
    except Exception:
        return


async def _persist_execution_result(
    *,
    repository: DiscoveryV3Repository,
    target_id: str,
    run_id: str,
    execution_result: dict[str, Any],
) -> None:
    provider_queries = [
        {
            **row,
            "target_id": row.get("target_id") or target_id,
            "run_id": row.get("run_id") or run_id,
        }
        for row in execution_result.get("providerQueries", [])
        if isinstance(row, dict)
    ]
    if provider_queries:
        await repository.insert_provider_queries(provider_queries)

    evidence_items = [
        {
            **row,
            "target_id": row.get("target_id") or target_id,
            "run_id": row.get("run_id") or run_id,
        }
        for row in execution_result.get("evidenceItems", [])
        if isinstance(row, dict)
    ]
    if evidence_items:
        await repository.insert_evidence_items(evidence_items)

    domain_rows = [
        {
            **row,
            "first_seen_target_id": row.get("first_seen_target_id") or target_id,
            "first_seen_run_id": row.get("first_seen_run_id") or run_id,
        }
        for row in execution_result.get("domains", [])
        if isinstance(row, dict)
    ]
    if domain_rows:
        await repository.upsert_domain_inventory(domain_rows)

    endpoint_rows = [
        {
            **endpoint,
            "target_id": endpoint.get("target_id") or target_id,
            "run_id": endpoint.get("run_id") or run_id,
            "provider_id": endpoint.get("provider_id") or endpoint.get("provider_type") or "web_search",
        }
        for endpoint in execution_result.get("endpoints", [])
        if isinstance(endpoint, dict)
    ]
    if endpoint_rows:
        inserted_endpoints = await repository.upsert_source_endpoints(endpoint_rows)
        auto_promote_endpoints = [
            endpoint
            for endpoint in inserted_endpoints
            if endpoint.get("provider_type") == "rss" and endpoint.get("recommended_action") == "auto_promote"
        ]
        if auto_promote_endpoints:
            await asyncio.to_thread(_auto_promote_rss_endpoints, auto_promote_endpoints)

    edge_rows = [
        {
            **edge,
            "target_id": edge.get("target_id") or target_id,
            "run_id": edge.get("run_id") or run_id,
        }
        for edge in execution_result.get("edges", [])
        if isinstance(edge, dict)
    ]
    if edge_rows:
        await repository.insert_edges(edge_rows)

    negative_rows = [
        {
            **row,
            "target_id": row.get("target_id") or target_id,
            "run_id": row.get("run_id") or run_id,
        }
        for row in execution_result.get("negativeEvidence", [])
        if isinstance(row, dict)
    ]
    if negative_rows:
        await repository.insert_negative_evidence(negative_rows)

    provider_health_rows = [row for row in execution_result.get("providerHealth", []) if isinstance(row, dict)]
    if provider_health_rows:
        await repository.upsert_provider_health(provider_health_rows)
        repair_rows = [
            {
                "target_id": target_id,
                "run_id": run_id,
                "repair_kind": row.get("repairKind") or "switch_provider",
                "trigger_kind": "provider_health",
                "diagnosis_json": {
                    "providerId": row.get("provider_id") or row.get("providerId"),
                    "status": row.get("status"),
                    "lastErrorKind": row.get("last_error_kind") or row.get("lastErrorKind"),
                },
                "action_plan_json": {"budgetMultiplier": row.get("budgetMultiplier")},
            }
            for row in provider_health_rows
            if row.get("repairKind") or row.get("status") in {"auth_failed", "rate_limited", "degraded"}
        ]
        if repair_rows:
            await repository.insert_repairs(repair_rows)


def _auto_promote_rss_endpoints(endpoints: list[dict[str, Any]]) -> None:
    registrar = PostgresSourceRegistrarAdapter()
    for endpoint in endpoints:
        registrar.register_endpoint_source(
            endpoint=endpoint,
            enabled=True,
            created_by="discovery_v3_auto_promote",
            tags=["auto_promote"],
            reason="strong_rss_evidence",
        )


async def expand_existing_source(
    *,
    target_id: str,
    channel_id: str,
    repository: DiscoveryV3Repository,
) -> dict[str, Any]:
    run = await start_discovery_run(
        target_id=target_id,
        run_kind="source_expand",
        trigger_kind="api",
        repository=repository,
        summary_json={"sourceChannelId": channel_id},
    )
    return {"runId": str(run["run_id"]), "channelId": channel_id, "status": "queued"}


async def replace_existing_source(
    *,
    target_id: str,
    channel_id: str,
    repository: DiscoveryV3Repository,
) -> dict[str, Any]:
    run = await start_discovery_run(
        target_id=target_id,
        run_kind="replacement",
        trigger_kind="api",
        repository=repository,
        summary_json={"sourceChannelId": channel_id},
    )
    return {"runId": str(run["run_id"]), "channelId": channel_id, "status": "queued"}


async def diagnose_and_queue_repairs(
    *,
    target_id: str | None,
    run_id: str | None,
    metrics: dict[str, Any],
    repository: DiscoveryV3Repository,
) -> dict[str, Any]:
    diagnosis = diagnose_run_health(metrics)
    rows = build_repair_rows(target_id=target_id, run_id=run_id, diagnosis=diagnosis)
    inserted = await repository.insert_repairs(rows) if rows else []
    return {**diagnosis, "repairsQueued": len(inserted)}
