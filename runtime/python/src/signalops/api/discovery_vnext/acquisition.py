from __future__ import annotations

from typing import Any

from psycopg.types.json import Json

from signalops.api.database import query_one
from signalops.api.discovery_vnext.artifacts import create_artifact
from signalops.api.discovery_vnext.common import artifact_payload
from signalops.api.discovery_vnext.models import (
    DiscoveryVNextCandidateCreatePayload,
    DiscoveryVNextCandidateNormalizePayload,
)
from signalops.api.discovery_vnext.policy import resolve_required_policy_payload
from signalops.api.discovery_vnext.providers import (
    _assert_live_runtime_allowed,
    _effective_run_budget,
    _search_adapter,
    _search_provider_from_request,
)
from signalops.api.discovery_vnext.repository import get_vnext_record
from signalops.api.discovery_vnext.run_lifecycle import (
    finish_query_attempt as _finish_query_attempt,
    insert_query_attempt as _insert_query_attempt,
    rank_discovery_search_results as _rank_search_results,
)
from signalops.workers.discovery_vnext_candidates import build_candidate_rows, query_quality_report
from signalops.workers.task_engine.adapters.web_search import StubWebSearchAdapter, unwrap_web_search_output

def normalize_candidates(payload: DiscoveryVNextCandidateNormalizePayload) -> dict[str, Any]:
    resolve_required_policy_payload({}, "discovery-runtime")
    candidates = build_candidate_rows(
        run_id=payload.vnext_run_id or payload.run_id,
        interest_id=payload.interest_id,
        hypothesis_id=payload.hypothesis_id,
        query_attempt_id=payload.query_attempt_id,
        results=payload.results,
        lens=payload.lens,
        memory_mode=payload.memory_mode,
    )
    return {
        "candidates": candidates,
        "queryQualityReport": query_quality_report(
            query=payload.query,
            query_family_intent=payload.query_family_intent,
            candidates=candidates,
            raw_result_count=len(payload.results),
        ),
    }


def create_candidates_from_payload(payload: DiscoveryVNextCandidateCreatePayload) -> dict[str, Any]:
    normalized = normalize_candidates(payload)
    query_quality_artifact = create_artifact(
        "QueryQualityReport",
        normalized["queryQualityReport"],
        vnext_run_id=payload.vnext_run_id or payload.run_id,
        interest_id=payload.interest_id,
        parent_artifact_ids=[payload.hypothesis_artifact_id] if payload.hypothesis_artifact_id else [],
        created_by=payload.created_by,
    )
    candidates = [
        upsert_candidate(
            {**candidate, "queryQuality": normalized["queryQualityReport"]},
            hypothesis_artifact_id=payload.hypothesis_artifact_id,
            query_quality_artifact_id=str(query_quality_artifact.get("artifact_id") or ""),
        )
        for candidate in normalized["candidates"]
    ]
    return {
        "queryQualityReportArtifact": query_quality_artifact,
        "candidates": candidates,
    }



def execute_candidate_acquisition(
    *,
    run_id: str,
    interest_id: str | None,
    hypothesis_artifacts: list[dict[str, Any]],
    request: dict[str, Any],
    budget: dict[str, Any],
    live_provider_execution: bool,
    created_by: str,
) -> dict[str, Any]:
    runtime_policy = resolve_required_policy_payload({}, "discovery-runtime")
    effective_budget = _effective_run_budget(
        runtime_policy=runtime_policy,
        request=request,
        budget=budget,
        live_provider_execution=live_provider_execution,
    )
    provider = _search_provider_from_request(request)
    if live_provider_execution:
        _assert_live_runtime_allowed(runtime_policy, effective_budget, provider=provider)
    max_attempts = max(1, min(50, int(runtime_policy.get("maxQueryAttemptsPerRun") or 20)))
    max_results = max(1, min(20, int(runtime_policy.get("maxResultsPerQuery") or 10)))
    adapter = _search_adapter(provider) if live_provider_execution else StubWebSearchAdapter()
    attempts: list[dict[str, Any]] = []
    candidates: list[dict[str, Any]] = []
    for artifact in hypothesis_artifacts[:max_attempts]:
        hypothesis_artifact_id = str(artifact.get("artifact_id") or "")
        hypothesis_payload = artifact_payload(artifact)
        artifact_lens = str(artifact.get("lens") or hypothesis_payload.get("lens") or "") or None
        artifact_memory_mode = str(artifact.get("memory_mode") or hypothesis_payload.get("memoryMode") or "") or None
        for query_row in _queries_from_hypothesis_artifact(artifact):
            if len(attempts) >= max_attempts:
                break
            query_text = str(query_row.get("query") or "").strip()
            if not query_text:
                continue
            attempt = _insert_query_attempt(
                run_id=run_id,
                hypothesis_artifact_id=hypothesis_artifact_id or None,
                provider=provider,
                query_text=query_text,
                query_family_intent=str(query_row.get("intent") or ""),
                live_provider_execution=live_provider_execution,
                created_by=created_by,
            )
            try:
                raw = adapter.search(query=query_text, count=max_results, result_type="text", time_range=request.get("timeRange"))
                results, meta = unwrap_web_search_output(raw)
                filtered_results = _rank_search_results(
                    results,
                    interest=request.get("interest") if isinstance(request.get("interest"), dict) else {},
                    query_text=query_text,
                )
                enriched_results = [
                    {**result, "provider": result.get("provider") or provider}
                    for result in filtered_results
                    if isinstance(result, dict)
                ]
                normalized = DiscoveryVNextCandidateCreatePayload(
                    runId=run_id,
                    interestId=interest_id,
                    hypothesisId=str(query_row.get("hypothesisId") or "unknown"),
                    hypothesisArtifactId=hypothesis_artifact_id or None,
                    queryAttemptId=str(attempt["query_attempt_id"]),
                    query=query_text,
                    queryFamilyIntent=str(query_row.get("intent") or ""),
                    lens=artifact_lens,
                    memoryMode=artifact_memory_mode,
                    results=enriched_results,
                    createdBy=created_by,
                )
                persisted = create_candidates_from_payload(normalized)
                _finish_query_attempt(
                    str(attempt["query_attempt_id"]),
                    "succeeded",
                    meta=meta,
                    results=enriched_results,
                    quality_artifact=persisted.get("queryQualityReportArtifact"),
                )
                attempts.append(get_vnext_record("query-attempts", str(attempt["query_attempt_id"])))
                candidates.extend(persisted.get("candidates") or [])
            except Exception as error:  # noqa: BLE001 - provider failure is telemetry.
                _finish_query_attempt(str(attempt["query_attempt_id"]), "failed", error={"detail": str(error), "type": type(error).__name__})
                attempts.append(get_vnext_record("query-attempts", str(attempt["query_attempt_id"])))
    return {"queryAttempts": attempts, "candidates": candidates}



def upsert_candidate(
    candidate: dict[str, Any],
    *,
    hypothesis_artifact_id: str | None,
    query_quality_artifact_id: str | None,
) -> dict[str, Any]:
    acquisition = dict(candidate.get("acquisitionEvidence") or {})
    if isinstance(candidate.get("queryQuality"), dict):
        acquisition["queryQuality"] = candidate["queryQuality"]
    row = query_one(
        """
        insert into discovery_candidates (
          vnext_run_id,
          interest_id,
          hypothesis_artifact_id,
          hypothesis_id,
          hypothesis_batch_artifact_id,
          lens,
          memory_mode,
          query_quality_artifact_id,
          canonical_url,
          canonical_domain,
          candidate_kind_guess,
          acquisition_json,
          rediscovery_count,
          status
        )
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'new')
        on conflict (vnext_run_id, canonical_url) where vnext_run_id is not null
        do update set
          hypothesis_id = excluded.hypothesis_id,
          hypothesis_batch_artifact_id = excluded.hypothesis_batch_artifact_id,
          lens = coalesce(excluded.lens, discovery_candidates.lens),
          memory_mode = coalesce(excluded.memory_mode, discovery_candidates.memory_mode),
          query_quality_artifact_id = excluded.query_quality_artifact_id,
          acquisition_json = discovery_candidates.acquisition_json || excluded.acquisition_json,
          rediscovery_count = discovery_candidates.rediscovery_count + excluded.rediscovery_count,
          status = case
            when discovery_candidates.status = 'duplicate' then discovery_candidates.status
            else excluded.status
          end,
          updated_at = now()
        returning *
        """,
        (
            candidate.get("runId"),
            candidate.get("interestId"),
            hypothesis_artifact_id,
            str(candidate.get("hypothesisId") or "unknown"),
            hypothesis_artifact_id,
            candidate.get("lens"),
            candidate.get("memoryMode"),
            query_quality_artifact_id or None,
            candidate["canonicalUrl"],
            candidate["canonicalDomain"],
            candidate.get("candidateKindGuess", "unknown"),
            Json(acquisition),
            candidate.get("rediscoveryCount", 1),
        ),
    )
    return row or {}



def _queries_from_hypothesis_artifact(artifact: dict[str, Any]) -> list[dict[str, Any]]:
    payload = artifact_payload(artifact)
    rows: list[dict[str, Any]] = []
    for hypothesis in payload.get("hypotheses") or []:
        if not isinstance(hypothesis, dict):
            continue
        for family in hypothesis.get("queryFamilies") or []:
            if not isinstance(family, dict):
                continue
            for query in family.get("queries") or []:
                rows.append(
                    {
                        "query": str(query),
                        "intent": str(family.get("intent") or ""),
                        "hypothesisId": str(hypothesis.get("hypothesisId") or ""),
                    }
                )
    return rows
