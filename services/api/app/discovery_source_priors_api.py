from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException
from psycopg.types.json import Json
from pydantic import BaseModel, ConfigDict, Field

from services.api.app.database import query_all, query_count, query_one
from services.api.app.pagination import build_paginated_response
from services.workers.app.discovery_v3_graph import compile_interest_graph
from services.workers.app.rare_signal_source_prior import build_rare_signal_source_prior
from services.workers.app.source_scoring import (
    build_source_profile,
    compute_source_interest_score,
    summarize_channel_quality_metrics,
)


class DiscoveryV3SourcePriorPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    target_id: str | None = Field(default=None, alias="targetId")
    channel_id: str | None = Field(default=None, alias="channelId")
    endpoint_id: str | None = Field(default=None, alias="endpointId")
    contract_id: str | None = Field(default=None, alias="contractId")
    requested_by: str | None = Field(default=None, alias="requestedBy")


def _json_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _json_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _row_or_404(row: dict[str, Any] | None, label: str) -> dict[str, Any]:
    if row is None:
        raise HTTPException(status_code=404, detail=f"{label} was not found.")
    return row


def _get_channel(channel_id: str | None) -> dict[str, Any] | None:
    if not channel_id:
        return None
    return _row_or_404(
        query_one("select * from source_channels where channel_id = %s", (channel_id,)),
        "Source channel",
    )


def _get_endpoint(endpoint_id: str | None) -> dict[str, Any] | None:
    if not endpoint_id:
        return None
    return _row_or_404(
        query_one(
            "select * from discovery_source_endpoints where endpoint_id = %s",
            (endpoint_id,),
        ),
        "Discovery endpoint",
    )


def _get_contract(contract_id: str | None) -> dict[str, Any] | None:
    if not contract_id:
        return None
    return _row_or_404(
        query_one(
            "select * from discovery_source_contracts where contract_id = %s",
            (contract_id,),
        ),
        "Discovery source contract",
    )


def _find_contract(
    *,
    target_id: str,
    channel_id: str | None,
    endpoint_id: str | None,
) -> dict[str, Any] | None:
    if endpoint_id:
        row = query_one(
            """
            select *
            from discovery_source_contracts
            where target_id = %s and endpoint_id = %s
            order by updated_at desc
            limit 1
            """,
            (target_id, endpoint_id),
        )
        if row:
            return row
    if channel_id:
        return query_one(
            """
            select *
            from discovery_source_contracts
            where target_id = %s and source_channel_id = %s
            order by updated_at desc
            limit 1
            """,
            (target_id, channel_id),
        )
    return None


def _target_id_from_payload(
    payload: DiscoveryV3SourcePriorPayload,
    *,
    channel: dict[str, Any] | None,
    endpoint: dict[str, Any] | None,
    contract: dict[str, Any] | None,
) -> str:
    if payload.target_id:
        return payload.target_id
    if contract and contract.get("target_id"):
        return str(contract["target_id"])
    if endpoint and endpoint.get("target_id"):
        return str(endpoint["target_id"])
    discovery_config = _json_dict(_json_dict(channel.get("config_json") if channel else {}).get("discovery"))
    target_id = discovery_config.get("targetId") or discovery_config.get("target_id")
    if target_id:
        return str(target_id)
    raise HTTPException(
        status_code=422,
        detail="targetId is required unless it can be derived from endpoint/contract/channel discovery config.",
    )


def _get_target(target_id: str) -> dict[str, Any]:
    return _row_or_404(
        query_one("select * from discovery_targets where target_id = %s", (target_id,)),
        "Discovery target",
    )


def _build_candidate(
    *,
    channel: dict[str, Any] | None,
    endpoint: dict[str, Any] | None,
    contract: dict[str, Any] | None,
) -> dict[str, Any]:
    channel_config = _json_dict(channel.get("config_json") if channel else {})
    channel_discovery = _json_dict(channel_config.get("discovery"))
    endpoint_evidence = _json_dict(endpoint.get("evidence_json") if endpoint else {})
    why_found = _json_list(endpoint.get("why_found_json") if endpoint else None)
    samples = _json_list(endpoint.get("samples_json") if endpoint else None)
    url = (
        (endpoint or {}).get("endpoint_url")
        or (channel or {}).get("fetch_url")
        or (channel or {}).get("homepage_url")
        or ""
    )
    return {
        "url": url,
        "final_url": url,
        "endpoint_url": (endpoint or {}).get("endpoint_url"),
        "homepage_url": (endpoint or {}).get("homepage_url") or (channel or {}).get("homepage_url"),
        "title": (endpoint or {}).get("title") or (channel or {}).get("name") or url,
        "description": (endpoint or {}).get("description") or endpoint_evidence.get("description"),
        "provider_type": (endpoint or {}).get("provider_type") or (channel or {}).get("provider_type"),
        "source_role": (
            (endpoint or {}).get("source_role")
            or (contract or {}).get("source_role")
            or channel_discovery.get("sourceRole")
        ),
        "endpoint_kind": (
            (endpoint or {}).get("endpoint_kind")
            or (contract or {}).get("endpoint_kind")
            or channel_discovery.get("endpointKind")
        ),
        "signal_mode": (
            (endpoint or {}).get("signal_mode")
            or (contract or {}).get("signal_mode")
            or channel_discovery.get("signalMode")
            or "direct"
        ),
        "expected_data_shape": (contract or {}).get("expected_data_shape"),
        "relevance_score": (
            (endpoint or {}).get("interest_fit_score")
            or (endpoint or {}).get("total_score")
            or channel_discovery.get("interestFitScore")
        ),
        "is_valid": True,
        "sample_data": samples,
        "llm_assessment": {
            "quality_signals": why_found or endpoint_evidence.get("qualitySignals") or [],
            "reasoning": endpoint_evidence.get("reasoning") or "source-prior evaluation",
        },
    }


def _channel_metrics(channel_id: str | None) -> dict[str, Any]:
    if not channel_id:
        return summarize_channel_quality_metrics({})
    fetch_metrics = query_one(
        """
        select
          count(*)::int as fetch_runs_period,
          count(*) filter (
            where outcome_kind in ('new_content', 'no_change')
          )::int as successful_fetch_runs_period,
          count(*) filter (where outcome_kind = 'new_content')::int as new_content_fetch_runs_period,
          count(*) filter (
            where outcome_kind in ('rate_limited', 'transient_failure', 'hard_failure')
          )::int as degraded_fetch_runs_period,
          coalesce(sum(duplicate_suppressed_count), 0)::int as duplicate_suppressed_period,
          coalesce(sum(new_article_count), 0)::int as new_articles_from_fetch_period
        from channel_fetch_runs
        where channel_id = %s and started_at >= now() - interval '30 days'
        """,
        (channel_id,),
    ) or {}
    article_metrics = query_one(
        """
        select
          count(*)::int as total_articles_period,
          count(*) filter (where is_exact_duplicate = false and is_near_duplicate = false)::int
            as unique_articles_period,
          count(*) filter (where is_exact_duplicate = true or is_near_duplicate = true)::int
            as duplicate_articles_period,
          count(*) filter (where published_at >= now() - interval '30 days')::int
            as fresh_articles_period
        from articles
        where channel_id = %s and ingested_at >= now() - interval '30 days'
        """,
        (channel_id,),
    ) or {}
    runtime = query_one(
        """
        select effective_poll_interval_seconds, consecutive_failures, last_result_kind
        from source_channel_runtime_state
        where channel_id = %s
        """,
        (channel_id,),
    ) or {}
    return summarize_channel_quality_metrics({**fetch_metrics, **article_metrics, **runtime})


def _negative_evidence(
    *,
    target_id: str,
    candidate: dict[str, Any],
    profile: dict[str, Any],
) -> list[dict[str, Any]]:
    domain = str(profile.get("canonical_domain") or "")
    endpoint_url = str(candidate.get("endpoint_url") or candidate.get("url") or "")
    source_role = str(candidate.get("source_role") or "")
    provider_type = str(candidate.get("provider_type") or "")
    clauses = ["(target_id = %s or target_id is null)"]
    params: list[Any] = [target_id]
    match_clauses: list[str] = []
    if domain and domain != "unknown":
        match_clauses.append("canonical_domain = %s")
        params.append(domain)
    if endpoint_url:
        match_clauses.append("endpoint_url = %s")
        params.append(endpoint_url)
    if source_role:
        match_clauses.append("source_role = %s")
        params.append(source_role)
    if provider_type:
        match_clauses.append("provider_id = %s")
        params.append(provider_type)
    if match_clauses:
        clauses.append("(" + " or ".join(match_clauses) + ")")
    where_sql = " and ".join(clauses)
    return query_all(
        f"""
        select *
        from discovery_negative_evidence
        where {where_sql}
        order by created_at desc
        limit 50
        """,
        tuple(params),
    )


def _build_context(payload: DiscoveryV3SourcePriorPayload) -> dict[str, Any]:
    if not (payload.channel_id or payload.endpoint_id or payload.contract_id):
        raise HTTPException(
            status_code=422,
            detail="channelId, endpointId or contractId is required for source-prior evaluation.",
        )
    channel = _get_channel(payload.channel_id)
    endpoint = _get_endpoint(payload.endpoint_id)
    contract = _get_contract(payload.contract_id)
    target_id = _target_id_from_payload(
        payload,
        channel=channel,
        endpoint=endpoint,
        contract=contract,
    )
    if not contract:
        contract = _find_contract(
            target_id=target_id,
            channel_id=payload.channel_id or str((endpoint or {}).get("source_channel_id") or ""),
            endpoint_id=payload.endpoint_id,
        )
    if endpoint and endpoint.get("source_channel_id") and not channel:
        channel = _get_channel(str(endpoint["source_channel_id"]))
    target = _get_target(target_id)
    graph = _json_dict(target.get("graph_json")) or compile_interest_graph(target)
    candidate = _build_candidate(channel=channel, endpoint=endpoint, contract=contract)
    profile = build_source_profile(candidate)
    metrics_channel_id = str(channel.get("channel_id")) if channel and channel.get("channel_id") else None
    metrics = _channel_metrics(metrics_channel_id)
    source_score = compute_source_interest_score(
        mission_graph=graph,
        profile=profile,
        candidate=candidate,
        channel_metrics=metrics,
    )
    negative_evidence = _negative_evidence(target_id=target_id, candidate=candidate, profile=profile)
    prior = build_rare_signal_source_prior(
        target=target,
        mission_graph=graph,
        candidate=candidate,
        profile=profile,
        source_score=source_score,
        channel_metrics=metrics,
        negative_evidence=negative_evidence,
    )
    return {
        "target": target,
        "channel": channel,
        "endpoint": endpoint,
        "contract": contract,
        "candidate": candidate,
        "profile": profile,
        "sourceScore": source_score,
        "channelMetrics": metrics,
        "sourcePrior": prior,
    }


def _source_identity(context: dict[str, Any]) -> dict[str, Any]:
    target = context["target"]
    channel = context.get("channel")
    endpoint = context.get("endpoint")
    contract = context.get("contract")
    return {
        "targetId": str(target.get("target_id")),
        "channelId": str(channel.get("channel_id")) if channel else None,
        "endpointId": str(endpoint.get("endpoint_id")) if endpoint else None,
        "contractId": str(contract.get("contract_id")) if contract else None,
    }


def evaluate_source_prior(payload: DiscoveryV3SourcePriorPayload) -> dict[str, Any]:
    context = _build_context(payload)
    return {
        **_source_identity(context),
        "readOnly": True,
        "sourcePrior": context["sourcePrior"],
        "inputSummary": {
            "candidate": {
                key: context["candidate"].get(key)
                for key in ("title", "url", "provider_type", "source_role", "endpoint_kind")
            },
            "profile": {
                "canonicalDomain": context["profile"].get("canonical_domain"),
                "trustScore": context["profile"].get("trust_score"),
            },
            "channelMetrics": context["channelMetrics"],
        },
        "selectionGuardrails": context["sourcePrior"]["selectionGuardrails"],
    }


def _stored_prior(context: dict[str, Any], requested_by: str | None) -> dict[str, Any]:
    return {
        **context["sourcePrior"],
        "source": _source_identity(context),
        "appliedBy": requested_by,
        "appliedAt": datetime.now(UTC).isoformat(),
    }


def _upsert_contract_prior(
    *,
    context: dict[str, Any],
    stored_prior: dict[str, Any],
) -> dict[str, Any]:
    target = context["target"]
    channel = context.get("channel")
    endpoint = context.get("endpoint")
    contract = context.get("contract")
    candidate = context["candidate"]
    prior_state = str(stored_prior.get("priorState") or "")
    status = "probation" if prior_state == "rare_signal_probation" else "weak"
    if contract:
        update_weights = contract.get("source_channel_id") is None
        row = query_one(
            """
            update discovery_source_contracts
            set contract_json = contract_json || jsonb_build_object('rareSignalPrior', %s::jsonb),
                status = case when %s then %s else status end,
                coverage_contribution = case when %s then 0.0 else coverage_contribution end,
                downstream_weight = case when %s then 0.0 else downstream_weight end,
                updated_at = now()
            where contract_id = %s
            returning *
            """,
            (
                Json(stored_prior),
                update_weights,
                status,
                update_weights,
                update_weights,
                contract["contract_id"],
            ),
        )
        return _row_or_404(row, "Discovery source contract")
    row = query_one(
        """
        insert into discovery_source_contracts (
          target_id, endpoint_id, source_channel_id, source_role, signal_mode,
          provider_type, endpoint_kind, expected_data_shape, contract_json,
          status, coverage_contribution, downstream_weight
        )
        values (%s, %s, %s, %s, %s, %s, %s, %s, jsonb_build_object('rareSignalPrior', %s::jsonb),
                %s, 0.0, 0.0)
        returning *
        """,
        (
            target["target_id"],
            endpoint.get("endpoint_id") if endpoint else None,
            channel.get("channel_id") if channel else None,
            candidate.get("source_role") or "industry_niche",
            candidate.get("signal_mode") or "direct",
            candidate.get("provider_type") or "website",
            candidate.get("endpoint_kind") or "unknown",
            candidate.get("expected_data_shape"),
            Json(stored_prior),
            status,
        ),
    )
    return _row_or_404(row, "Discovery source contract")


def _apply_channel_prior(channel_id: str, stored_prior: dict[str, Any]) -> dict[str, Any]:
    row = query_one(
        """
        update source_channels
        set config_json = jsonb_set(
              config_json,
              '{discovery}',
              coalesce(config_json -> 'discovery', '{}'::jsonb)
                || jsonb_build_object('rareSignalPrior', %s::jsonb),
              true
            ),
            updated_at = now()
        where channel_id = %s
        returning channel_id::text as "channelId", config_json as "configJson", updated_at as "updatedAt"
        """,
        (Json(stored_prior), channel_id),
    )
    return _row_or_404(row, "Source channel")


def apply_source_prior(payload: DiscoveryV3SourcePriorPayload) -> dict[str, Any]:
    context = _build_context(payload)
    prior_state = str(context["sourcePrior"].get("priorState") or "")
    if prior_state not in {"monitor_only", "rare_signal_probation"}:
        raise HTTPException(
            status_code=422,
            detail="Only monitor_only or rare_signal_probation source priors can be applied.",
        )
    stored_prior = _stored_prior(context, payload.requested_by)
    contract = _upsert_contract_prior(context=context, stored_prior=stored_prior)
    channel = context.get("channel")
    channel_update = (
        _apply_channel_prior(str(channel["channel_id"]), stored_prior)
        if channel and channel.get("channel_id")
        else None
    )
    return {
        **_source_identity({**context, "contract": contract}),
        "applied": True,
        "sourcePrior": stored_prior,
        "contract": contract,
        "channel": channel_update,
        "selectionGuardrails": stored_prior["selectionGuardrails"],
        "warnings": [
            "Source prior extends monitoring only; it does not select articles.",
            "Coverage/downstream contribution for prior-only evidence remains zero.",
        ],
    }


def list_source_priors(
    *,
    page: int = 1,
    page_size: int = 50,
    target_id: str | None = None,
    channel_id: str | None = None,
    endpoint_id: str | None = None,
    contract_id: str | None = None,
) -> dict[str, Any]:
    filters = {
        "targetId": target_id,
        "channelId": channel_id,
        "endpointId": endpoint_id,
        "contractId": contract_id,
    }
    where_parts: list[str] = []
    params: list[Any] = []
    for column, value in filters.items():
        if value:
            where_parts.append(f'"{column}" = %s')
            params.append(value)
    where_sql = " where " + " and ".join(where_parts) if where_parts else ""
    base_sql = """
      select *
      from (
        select
          'channel' as "surface",
          coalesce(
            sc.config_json #>> '{discovery,rareSignalPrior,source,targetId}',
            sc.config_json #>> '{discovery,targetId}'
          ) as "targetId",
          sc.channel_id::text as "channelId",
          coalesce(
            sc.config_json #>> '{discovery,rareSignalPrior,source,endpointId}',
            sc.config_json #>> '{discovery,endpointId}'
          ) as "endpointId",
          null::text as "contractId",
          sc.name as "sourceName",
          sc.provider_type as "providerType",
          sc.config_json #> '{discovery,rareSignalPrior}' as "sourcePrior",
          sc.updated_at as "updatedAt"
        from source_channels sc
        where jsonb_typeof(sc.config_json #> '{discovery,rareSignalPrior}') = 'object'

        union all

        select
          'contract' as "surface",
          dsc.target_id::text as "targetId",
          dsc.source_channel_id::text as "channelId",
          dsc.endpoint_id::text as "endpointId",
          dsc.contract_id::text as "contractId",
          coalesce(dse.title, sc.name, dsc.source_role) as "sourceName",
          dsc.provider_type as "providerType",
          dsc.contract_json #> '{rareSignalPrior}' as "sourcePrior",
          dsc.updated_at as "updatedAt"
        from discovery_source_contracts dsc
        left join discovery_source_endpoints dse on dse.endpoint_id = dsc.endpoint_id
        left join source_channels sc on sc.channel_id = dsc.source_channel_id
        where jsonb_typeof(dsc.contract_json #> '{rareSignalPrior}') = 'object'
      ) source_priors
    """
    total = query_count(f"select count(*) as total from ({base_sql}) q{where_sql}", tuple(params))
    offset = (max(1, page) - 1) * page_size
    rows = query_all(
        f"{base_sql}{where_sql} order by \"updatedAt\" desc limit %s offset %s",
        (*params, page_size, offset),
    )
    return build_paginated_response(rows, max(1, page), page_size, total)
