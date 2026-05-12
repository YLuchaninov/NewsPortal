from __future__ import annotations

import inspect
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib import robotparser
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from .discovery_v3_claims import build_claim_from_cluster, score_hidden_claim
from .discovery_v3_negative_evidence import build_negative_evidence
from .discovery_v3_provider_health import evaluate_provider_health
from .task_engine.discovery_v3_cluster_plugins import cluster_discovery_results
from .task_engine.discovery_v3_endpoint_sweep_plugins import sweep_endpoint_candidates
from .task_engine.discovery_v3_scoring_plugins import decide_endpoint_candidate, score_endpoint_candidate
from .task_engine.discovery_v3_source_directory_plugins import extract_source_directory_links


WEB_SEARCH_PROVIDER_IDS = {"web_search", "ddgs", "brave", "serper"}


def unwrap_web_search_output(value: Any) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if isinstance(value, dict):
        results = value.get("results")
        if isinstance(results, list):
            meta = value.get("meta")
            return [dict(item) for item in results if isinstance(item, dict)], dict(meta) if isinstance(meta, dict) else {}
    if isinstance(value, list):
        return [dict(item) for item in value if isinstance(item, dict)], {}
    return [], {}


async def _resolve_runtime_call(value: Any) -> Any:
    if inspect.isawaitable(value):
        return await value
    return value


async def execute_hypothesis_batch_live(
    hypotheses: list[dict[str, Any]],
    *,
    runtime: Any | None = None,
    max_results_per_hypothesis: int = 20,
    max_domains: int = 400,
    max_endpoints: int = 700,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Run bounded v3 discovery against configured live provider adapters.

    Live execution is intentionally narrow at this layer: web-search hypotheses
    can fan out through the configured search adapter, endpoint candidates are
    swept and probed through fetcher internals, and provider/adapter failures are
    reported as provider-health events instead of hypothesis failures.
    """

    if runtime is None:
        from .task_engine.discovery_runtime import get_discovery_runtime

        active_runtime = get_discovery_runtime()
    else:
        active_runtime = runtime
    effective_now = now or datetime.now(UTC)
    all_search_results: list[dict[str, Any]] = []
    all_provider_queries: list[dict[str, Any]] = []
    all_domains: list[dict[str, Any]] = []
    all_edges: list[dict[str, Any]] = []
    all_followups: list[dict[str, Any]] = []
    all_endpoints: list[dict[str, Any]] = []
    all_hidden_claims: list[dict[str, Any]] = []
    negative_evidence: list[dict[str, Any]] = []
    provider_health: list[dict[str, Any]] = []

    for hypothesis in hypotheses:
        if len(all_domains) >= max_domains or len(all_endpoints) >= max_endpoints:
            break

        query = str(hypothesis.get("query_text") or hypothesis.get("queryText") or "").strip()
        provider_id = _execution_provider_id(hypothesis)
        seed_url = str(hypothesis.get("seed_url") or hypothesis.get("seedUrl") or "").strip()
        seed_domain = str(hypothesis.get("seed_domain") or hypothesis.get("seedDomain") or "").strip()
        if seed_url or seed_domain:
            endpoints = sweep_endpoint_candidates(
                domains=[seed_domain] if seed_domain else [],
                seed_urls=[seed_url] if seed_url else [],
                endpoint_patterns=list(hypothesis.get("endpoint_patterns") or hypothesis.get("endpointPatterns") or []),
                source_role=str(hypothesis.get("source_role") or hypothesis.get("sourceRole") or "source_directory"),
                signal_mode=str(hypothesis.get("signal_mode") or hypothesis.get("signalMode") or "direct"),
            )
            all_endpoints.extend(endpoints[: max(0, max_endpoints - len(all_endpoints))])
            if seed_domain:
                all_domains.append({"canonical_domain": seed_domain.lower(), "homepage_url": f"https://{seed_domain.lower()}"})
            if not query:
                continue
        if not query:
            continue
        if provider_id not in WEB_SEARCH_PROVIDER_IDS:
            provider_health.append(
                evaluate_provider_health(
                    {
                        "provider_id": provider_id,
                        "error_rate": 1.0,
                        "last_error_kind": "needs_config",
                    },
                    now=effective_now,
                )
            )
            continue

        try:
            raw_output = await _resolve_runtime_call(
                active_runtime.web_search.search(
                    query=query,
                    count=max(1, max_results_per_hypothesis),
                    result_type="web",
                    time_range=None,
                )
            )
            results, meta = unwrap_web_search_output(raw_output)
        except Exception as error:  # pragma: no cover - covered through fake runtimes in tests
            provider_health.append(_provider_health_from_exception(provider_id="web_search", error=error, now=effective_now))
            continue

        all_provider_queries.append(
            {
                "run_id": hypothesis.get("run_id") or hypothesis.get("runId"),
                "target_id": hypothesis.get("target_id") or hypothesis.get("targetId"),
                "hypothesis_id": hypothesis.get("hypothesis_id") or hypothesis.get("hypothesisId"),
                "provider_id": "web_search",
                "query_text": query,
                "result_type": "web",
                "time_range": None,
                "provider_meta_json": meta,
                "cost_json": {
                    "costUsd": meta.get("cost_usd", 0),
                    "costCents": meta.get("cost_cents", 0),
                    "requestCount": meta.get("request_count", 1 if results else 0),
                },
            }
        )

        if not results:
            negative_evidence.append(
                build_negative_evidence(
                    failure_mode="no_results",
                    target_id=_string_or_none(hypothesis.get("target_id") or hypothesis.get("targetId")),
                    provider_id="web_search",
                    query_text=query,
                    source_role=_string_or_none(hypothesis.get("source_role") or hypothesis.get("sourceRole")),
                    signal_mode=_string_or_none(hypothesis.get("signal_mode") or hypothesis.get("signalMode")),
                    severity=0.55,
                    details={"hypothesisType": hypothesis.get("hypothesis_type") or hypothesis.get("hypothesisType")},
                    cooldown_until=effective_now + timedelta(days=7),
                )
            )
            continue

        normalized_results = _search_results_with_provider_votes(results, provider="web_search")
        clustered = cluster_discovery_results(normalized_results)
        all_search_results.extend(clustered["results"])
        all_domains.extend(clustered["domains"])
        if str(hypothesis.get("signal_mode") or hypothesis.get("signalMode") or "") == "hidden":
            control_results = await _run_control_search(
                active_runtime=active_runtime,
                hypothesis=hypothesis,
                count=max(1, max_results_per_hypothesis),
                effective_now=effective_now,
                provider_queries=all_provider_queries,
                provider_health=provider_health,
            )
            claim = _hidden_claim_from_results(
                hypothesis=hypothesis,
                target_results=clustered["results"],
                control_results=control_results,
            )
            if claim is not None:
                all_hidden_claims.append(claim)

        directory_domains: list[str] = []
        directory_pages_fetched = 0
        for result in clustered["results"]:
            if result.get("result_kind") != "source_directory":
                continue
            if directory_pages_fetched >= 3:
                break
            origin_url = str(result.get("canonical_url") or result.get("url") or "")
            html = _fetch_directory_html(origin_url)
            if not html:
                all_followups.append(
                    {
                        "hypothesis_type": "source_directory",
                        "signal_mode": "direct",
                        "source_role": hypothesis.get("source_role") or hypothesis.get("sourceRole") or "source_directory",
                        "provider_id": "web_search",
                        "seed_url": result.get("canonical_url"),
                        "query_text": query,
                        "acquisition_tactic": "source_directory_fetch_required",
                        "priority_score": 0.55,
                        "risk_score": 0.35,
                        "confidence_score": 0.45,
                        "explorer_json": {
                            "reason": "Source-directory page required fetch but bounded HTML retrieval returned no HTML.",
                        },
                    }
                )
                continue
            directory_pages_fetched += 1
            extracted = extract_source_directory_links(html, origin_url=origin_url)
            directory_domains.extend(
                str(row.get("canonical_domain"))
                for row in extracted["discoveredDomains"]
                if row.get("canonical_domain")
            )
            all_edges.extend(extracted["edges"][:80])
            all_followups.extend(extracted["followUpHypotheses"][:40])

        sweep_domains = [str(row["canonical_domain"]) for row in clustered["domains"]]
        sweep_domains.extend(directory_domains)
        endpoints = sweep_endpoint_candidates(
            domains=sweep_domains[: max(0, max_domains - len(all_domains) + len(clustered["domains"]))],
            seed_urls=[str(result["canonical_url"]) for result in clustered["results"]],
            endpoint_patterns=list(hypothesis.get("endpoint_patterns") or hypothesis.get("endpointPatterns") or []),
            source_role=str(hypothesis.get("source_role") or hypothesis.get("sourceRole") or "source_directory"),
            signal_mode=str(hypothesis.get("signal_mode") or hypothesis.get("signalMode") or "direct"),
        )
        all_endpoints.extend(endpoints[: max(0, max_endpoints - len(all_endpoints))])

    probed_endpoints, probe_health = await _probe_and_score_endpoints(
        all_endpoints[:max_endpoints],
        runtime=active_runtime,
        now=effective_now,
    )
    provider_health.extend(probe_health)
    endpoints = _dedupe_endpoints(probed_endpoints)
    domains = _dedupe_by(all_domains, "canonical_domain")[:max_domains]
    search_results = _dedupe_by(all_search_results, "canonical_url")
    hidden_claims = _dedupe_claims(all_hidden_claims)
    return {
        "providerQueries": all_provider_queries,
        "searchResults": search_results,
        "evidenceItems": _evidence_items_from_search_results(search_results),
        "hiddenClaims": hidden_claims,
        "domains": domains,
        "edges": all_edges,
        "followUpHypotheses": _dedupe_followups(all_followups),
        "endpoints": endpoints,
        "negativeEvidence": negative_evidence,
        "providerHealth": _dedupe_provider_health(provider_health),
        "summary": {
            "searchResultCount": len(search_results),
            "domainCount": len(domains),
            "endpointCount": len(endpoints),
            "promotableCount": sum(1 for endpoint in endpoints if endpoint.get("recommended_action") == "auto_promote"),
            "manualReviewCount": sum(1 for endpoint in endpoints if endpoint.get("status") == "manual_review"),
            "negativeEvidenceCount": len(negative_evidence),
            "providerHealthEventCount": len(_dedupe_provider_health(provider_health)),
            "hiddenClaimCount": len(hidden_claims),
            "confirmedHiddenClaimCount": sum(1 for claim in hidden_claims if claim.get("status") == "confirmed_signal"),
        },
    }


def execute_hypothesis_batch_with_fixtures(
    hypotheses: list[dict[str, Any]],
    *,
    provider_fixtures: dict[str, Any] | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Run the deterministic v3 execution bridge over stored provider fixtures.

    This is deliberately network-free. It gives the orchestrator/eval harness a
    real execution shape before live provider adapters are enabled: search
    results become clustered domains, source directories create outbound-domain
    follow-ups, endpoint sweep creates candidates, and scoring/action policy
    classifies them.
    """

    fixtures = provider_fixtures or {}
    effective_now = now or datetime.now(UTC)
    search_results_by_query = _mapping(fixtures.get("searchResultsByQuery") or fixtures.get("search_results_by_query"))
    source_directory_html_by_url = _mapping(
        fixtures.get("sourceDirectoryHtmlByUrl") or fixtures.get("source_directory_html_by_url")
    )
    endpoint_evidence_by_url = _mapping(
        fixtures.get("endpointEvidenceByUrl") or fixtures.get("endpoint_evidence_by_url")
    )

    all_search_results: list[dict[str, Any]] = []
    all_domains: list[dict[str, Any]] = []
    all_edges: list[dict[str, Any]] = []
    all_followups: list[dict[str, Any]] = []
    all_endpoints: list[dict[str, Any]] = []
    negative_evidence: list[dict[str, Any]] = []

    for hypothesis in hypotheses:
        query = str(hypothesis.get("query_text") or hypothesis.get("queryText") or "").strip()
        provider_id = str(hypothesis.get("provider_id") or hypothesis.get("providerId") or "web_search")
        results = _fixture_results(search_results_by_query, query, provider_id)
        if not results:
            negative_evidence.append(
                build_negative_evidence(
                    failure_mode="no_results",
                    target_id=_string_or_none(hypothesis.get("target_id") or hypothesis.get("targetId")),
                    provider_id=provider_id,
                    query_text=query or None,
                    source_role=_string_or_none(hypothesis.get("source_role") or hypothesis.get("sourceRole")),
                    signal_mode=_string_or_none(hypothesis.get("signal_mode") or hypothesis.get("signalMode")),
                    severity=0.55,
                    details={"hypothesisType": hypothesis.get("hypothesis_type") or hypothesis.get("hypothesisType")},
                    cooldown_until=effective_now + timedelta(days=7),
                )
            )
            continue

        clustered = cluster_discovery_results(results)
        all_search_results.extend(clustered["results"])
        all_domains.extend(clustered["domains"])

        directory_domains: list[str] = []
        for result in clustered["results"]:
            if result.get("result_kind") != "source_directory":
                continue
            html = source_directory_html_by_url.get(result["canonical_url"]) or source_directory_html_by_url.get(result["url"])
            if not isinstance(html, str) or not html.strip():
                continue
            extracted = extract_source_directory_links(html, origin_url=str(result["canonical_url"]))
            directory_domains.extend(str(row["canonical_domain"]) for row in extracted["discoveredDomains"])
            all_edges.extend(extracted["edges"])
            all_followups.extend(extracted["followUpHypotheses"])

        sweep_domains = [str(row["canonical_domain"]) for row in clustered["domains"]]
        sweep_domains.extend(directory_domains)
        endpoints = sweep_endpoint_candidates(
            domains=sweep_domains,
            seed_urls=[str(result["canonical_url"]) for result in clustered["results"]],
            endpoint_patterns=list(hypothesis.get("endpoint_patterns") or hypothesis.get("endpointPatterns") or []),
            source_role=str(hypothesis.get("source_role") or hypothesis.get("sourceRole") or "source_directory"),
            signal_mode=str(hypothesis.get("signal_mode") or hypothesis.get("signalMode") or "direct"),
        )
        for endpoint in endpoints:
            evidence = endpoint_evidence_by_url.get(endpoint["normalized_endpoint_url"]) or {}
            scored = score_endpoint_candidate({**endpoint, **dict(evidence)})
            all_endpoints.append(decide_endpoint_candidate(scored))

    endpoints = _dedupe_endpoints(all_endpoints)
    return {
        "providerQueries": [],
        "searchResults": _dedupe_by(all_search_results, "canonical_url"),
        "evidenceItems": _evidence_items_from_search_results(_dedupe_by(all_search_results, "canonical_url")),
        "domains": _dedupe_by(all_domains, "canonical_domain"),
        "edges": all_edges,
        "followUpHypotheses": _dedupe_followups(all_followups),
        "endpoints": endpoints,
        "negativeEvidence": negative_evidence,
        "providerHealth": [],
        "summary": {
            "searchResultCount": len(_dedupe_by(all_search_results, "canonical_url")),
            "domainCount": len(_dedupe_by(all_domains, "canonical_domain")),
            "endpointCount": len(endpoints),
            "promotableCount": sum(1 for endpoint in endpoints if endpoint.get("recommended_action") == "auto_promote"),
            "manualReviewCount": sum(1 for endpoint in endpoints if endpoint.get("status") == "manual_review"),
            "negativeEvidenceCount": len(negative_evidence),
        },
    }


async def _probe_and_score_endpoints(
    endpoints: list[dict[str, Any]],
    *,
    runtime: Any,
    now: datetime,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    if not endpoints:
        return [], []

    provider_health: list[dict[str, Any]] = []
    evidence_by_url: dict[str, dict[str, Any]] = {}
    endpoint_urls = [str(endpoint["normalized_endpoint_url"]) for endpoint in endpoints if endpoint.get("normalized_endpoint_url")]

    try:
        validations = await _resolve_runtime_call(runtime.url_validator.validate_urls(urls=endpoint_urls))
        for row in validations if isinstance(validations, list) else []:
            if not isinstance(row, dict):
                continue
            url = str(row.get("url") or row.get("normalized_url") or row.get("normalizedUrl") or row.get("final_url") or "")
            if url:
                evidence_by_url.setdefault(url, {}).setdefault("evidence_json", {})["urlValidation"] = row
    except Exception as error:  # pragma: no cover - covered through fake runtimes in tests
        provider_health.append(_provider_health_from_exception(provider_id="website", error=error, now=now))

    rss_urls = [url for url, endpoint in _endpoint_url_pairs(endpoints) if endpoint.get("provider_type") == "rss"]
    website_urls = [url for url, endpoint in _endpoint_url_pairs(endpoints) if endpoint.get("provider_type") == "website"]

    try:
        if rss_urls:
            rss_results = await _resolve_runtime_call(runtime.rss_probe.probe_feeds(urls=rss_urls, sample_count=5))
            for row in rss_results if isinstance(rss_results, list) else []:
                if isinstance(row, dict):
                    _merge_evidence_by_url(evidence_by_url, _probe_url(row), _rss_probe_evidence(row))
    except Exception as error:  # pragma: no cover - covered through fake runtimes in tests
        provider_health.append(_provider_health_from_exception(provider_id="rss", error=error, now=now))

    try:
        if website_urls:
            website_results = await _resolve_runtime_call(runtime.website_probe.probe_websites(urls=website_urls, sample_count=5))
            for row in website_results if isinstance(website_results, list) else []:
                if isinstance(row, dict):
                    _merge_evidence_by_url(evidence_by_url, _probe_url(row), _website_probe_evidence(row))
    except Exception as error:  # pragma: no cover - covered through fake runtimes in tests
        provider_health.append(_provider_health_from_exception(provider_id="website", error=error, now=now))

    scored: list[dict[str, Any]] = []
    for endpoint in endpoints:
        url = str(endpoint.get("normalized_endpoint_url") or "")
        evidence = evidence_by_url.get(url) or evidence_by_url.get(str(endpoint.get("endpoint_url") or "")) or {}
        merged = _deep_merge_endpoint_evidence(endpoint, evidence)
        merged = _apply_seed_review_evidence(merged)
        scored.append(decide_endpoint_candidate(score_endpoint_candidate(merged)))
    return scored, provider_health


def _endpoint_url_pairs(endpoints: list[dict[str, Any]]) -> list[tuple[str, dict[str, Any]]]:
    return [
        (str(endpoint.get("normalized_endpoint_url") or endpoint.get("endpoint_url") or ""), endpoint)
        for endpoint in endpoints
        if endpoint.get("normalized_endpoint_url") or endpoint.get("endpoint_url")
    ]


def _merge_evidence_by_url(evidence_by_url: dict[str, dict[str, Any]], url: str, evidence: dict[str, Any]) -> None:
    if not url:
        return
    current = evidence_by_url.get(url) or {}
    evidence_by_url[url] = _deep_merge_endpoint_evidence(current, evidence)


def _probe_url(row: dict[str, Any]) -> str:
    return str(
        row.get("url")
        or row.get("feed_url")
        or row.get("feedUrl")
        or row.get("website_url")
        or row.get("websiteUrl")
        or row.get("final_url")
        or row.get("finalUrl")
        or ""
    )


def _rss_probe_evidence(row: dict[str, Any]) -> dict[str, Any]:
    sample_count = _int_value(row, "sample_entry_count", "sampleEntryCount", "entry_count", "entryCount")
    entries = row.get("entries") or row.get("sample_entries") or row.get("sampleEntries")
    if not sample_count:
        sample_count = len(entries) if isinstance(entries, list) else 0
    recent_count = _int_value(row, "recent_entry_count", "recentEntryCount", "recent_count", "recentCount")
    if not recent_count and isinstance(entries, list):
        recent_count = _recent_entry_count(entries)
    valid = bool(row.get("is_valid") or row.get("isValid") or row.get("is_valid_rss") or row.get("isValidRss") or row.get("valid"))
    has_dates = bool(row.get("has_dates") or row.get("hasDates") or recent_count)
    evidence_score = min(
        1.0,
        (0.35 if valid else 0.0)
        + (0.20 if sample_count > 0 else 0.0)
        + (0.20 if recent_count > 0 else 0.0)
        + (0.10 if has_dates else 0.0)
        + 0.10,
    )
    return {
        "evidence_json": {"rss": row},
        "samples_json": entries or [],
        "evidence_score": evidence_score,
        "yield_score": min(1.0, sample_count / 5),
        "freshness_score": 0.85 if recent_count > 0 else 0.35,
        "extraction_ready_score": 0.95 if valid and sample_count > 0 else 0.25,
        "quality_score": 0.80 if valid else 0.35,
        "valid_feed": valid,
        "sample_entries": sample_count,
    }


def _recent_entry_count(entries: list[Any], *, window_days: int = 45) -> int:
    cutoff = datetime.now(UTC) - timedelta(days=window_days)
    count = 0
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        raw_value = entry.get("published_at") or entry.get("publishedAt") or entry.get("updated_at") or entry.get("updatedAt")
        if not raw_value:
            continue
        try:
            parsed = datetime.fromisoformat(str(raw_value).replace("Z", "+00:00"))
        except ValueError:
            continue
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
        if parsed >= cutoff:
            count += 1
    return count


def _website_probe_evidence(row: dict[str, Any]) -> dict[str, Any]:
    listing_count = _int_value(row, "listing_count_estimate", "listingCountEstimate", "listing_count", "listingCount")
    document_count = _int_value(row, "document_count_estimate", "documentCountEstimate", "document_count", "documentCount")
    sample_count = _int_value(row, "sample_resource_count", "sampleResourceCount", "sample_count", "sampleCount")
    browser_challenge = bool(row.get("browser_challenge") or row.get("browserChallenge"))
    http_valid = not bool(row.get("error") or row.get("error_text") or row.get("errorText"))
    evidence_score = min(
        1.0,
        (0.15 if http_valid else 0.0)
        + (0.20 if row.get("classification") else 0.0)
        + (0.20 if listing_count or document_count else 0.0)
        + (0.20 if sample_count else 0.0)
        + (0.15 if str(row.get("freshness") or "").lower() in {"recent", "fresh"} else 0.05)
        + (0.10 if not browser_challenge else 0.0),
    )
    return {
        "evidence_json": {"website": row},
        "samples_json": row.get("sample_resources") or row.get("sampleResources") or [],
        "evidence_score": evidence_score,
        "yield_score": min(1.0, (listing_count + document_count + sample_count) / 10),
        "freshness_score": 0.80 if str(row.get("freshness") or "").lower() in {"recent", "fresh"} else 0.35,
        "extraction_ready_score": 0.70 if http_valid and not browser_challenge and (listing_count or sample_count) else 0.30,
        "quality_score": 0.65 if http_valid and not browser_challenge else 0.25,
        "rejection_reason": "browser_challenge" if browser_challenge else None,
    }


async def _run_control_search(
    *,
    active_runtime: Any,
    hypothesis: dict[str, Any],
    count: int,
    effective_now: datetime,
    provider_queries: list[dict[str, Any]],
    provider_health: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    control_query = str(hypothesis.get("control_query_text") or hypothesis.get("controlQueryText") or "").strip()
    if not control_query:
        return []
    try:
        raw_output = await _resolve_runtime_call(
            active_runtime.web_search.search(
                query=control_query,
                count=count,
                result_type="web",
                time_range=None,
            )
        )
        results, meta = unwrap_web_search_output(raw_output)
    except Exception as error:  # pragma: no cover - covered through fake runtimes in tests
        provider_health.append(_provider_health_from_exception(provider_id="web_search", error=error, now=effective_now))
        return []

    provider_queries.append(
        {
            "run_id": hypothesis.get("run_id") or hypothesis.get("runId"),
            "target_id": hypothesis.get("target_id") or hypothesis.get("targetId"),
            "hypothesis_id": hypothesis.get("hypothesis_id") or hypothesis.get("hypothesisId"),
            "provider_id": "web_search",
            "query_text": control_query,
            "result_type": "web",
            "time_range": None,
            "provider_meta_json": {**meta, "control": True},
            "cost_json": {
                "costUsd": meta.get("cost_usd", 0),
                "costCents": meta.get("cost_cents", 0),
                "requestCount": meta.get("request_count", 1 if results else 0),
            },
        }
    )
    return _search_results_with_provider_votes(results, provider="web_search")


def _hidden_claim_from_results(
    *,
    hypothesis: dict[str, Any],
    target_results: list[dict[str, Any]],
    control_results: list[dict[str, Any]],
) -> dict[str, Any] | None:
    entities = _hypothesis_entities(hypothesis)
    context_terms = _hidden_context_terms(hypothesis)
    extraction_config = _hidden_claim_extraction_config(hypothesis)
    matching = [
        row
        for row in target_results
        if _hidden_result_score(
            row,
            context_terms=context_terms,
            require_context=True,
            extraction_config=extraction_config,
        )
        > 0
    ]
    if len(matching) < 2:
        return None

    control_matching = [
        row
        for row in control_results
        if _hidden_result_score(row, extraction_config=extraction_config) > 0
    ]
    target_total = max(1, len(target_results))
    control_total = max(1, len(control_results))
    target_rate = len(matching) / target_total
    control_rate = len(control_matching) / control_total if control_results else None
    domains = {
        str(row.get("canonical_domain") or canonical_domain_from_result(row))
        for row in matching
        if str(row.get("canonical_domain") or canonical_domain_from_result(row)).strip()
    }
    signal_type = _hidden_signal_type(matching)
    title = _claim_title(signal_type, hypothesis)
    cluster = {
        "signal_type": signal_type,
        "title": title,
        "summary": _claim_summary(signal_type, matching),
        "normalized_claim": title,
        "related_entities": entities,
        "related_geos": [],
        "related_languages": [],
        "evidence_count": len(matching),
        "independent_source_count": len(domains),
        "unique_author_count": len({str(row.get("url") or row.get("canonical_url")) for row in matching}),
        "need_score": min(1.0, 0.45 + 0.08 * len(matching)),
        "burst_score": 0.6 if len(matching) >= 5 else 0.35,
        "novelty_score": 0.65,
        "risk_score": 0.25 if len(domains) >= 2 else 0.45,
        "target_signal_rate": target_rate,
        "control_signal_rate": control_rate,
    }
    claim = build_claim_from_cluster(cluster)
    scored = score_hidden_claim(claim)
    return {
        **claim,
        "target_id": hypothesis.get("target_id") or hypothesis.get("targetId"),
        "run_id": hypothesis.get("run_id") or hypothesis.get("runId"),
        "control_query_text": hypothesis.get("control_query_text") or hypothesis.get("controlQueryText"),
        "specificity_score": scored["specificityScore"],
        "confidence_score": scored["confidenceScore"],
        "status": scored["status"] if scored["hasControlComparison"] else "needs_control",
        "support_evidence_urls": [
            str(row.get("canonical_url") or row.get("url") or "").strip()
            for row in matching
            if str(row.get("canonical_url") or row.get("url") or "").strip()
        ],
        "summary": (
            f"{claim.get('summary') or ''} "
            f"Evidence={len(matching)}/{target_total}; control={len(control_matching)}/{control_total if control_results else 0}."
        ).strip(),
    }


def _hidden_result_score(
    row: dict[str, Any],
    *,
    entities: list[str] | None = None,
    context_terms: list[str] | None = None,
    require_context: bool = False,
    extraction_config: dict[str, Any] | None = None,
) -> float:
    text = " ".join(str(row.get(key) or "") for key in ("title", "snippet", "description", "url")).lower()
    required_terms = [term.lower() for term in (context_terms or entities or []) if term]
    if require_context and required_terms and not any(term in text for term in required_terms):
        return 0.0
    config = _normalize_hidden_claim_extraction_config(extraction_config)
    positive_hits = _hidden_group_hits(text, config["positiveGroups"])
    negative_hits = _hidden_group_hits(text, config["negativeGroups"])
    positive_group_count = len(positive_hits)
    positive_hit_count = sum(len(values) for values in positive_hits.values())
    negative_group_count = len(negative_hits)
    negative_hit_count = sum(len(values) for values in negative_hits.values())
    thresholds = config["thresholds"]
    if positive_group_count < thresholds["minPositiveGroups"]:
        return 0.0
    if positive_hit_count < thresholds["minPositiveHits"]:
        return 0.0
    if negative_group_count > thresholds["maxNegativeGroups"]:
        return 0.0
    return float(positive_group_count + positive_hit_count - negative_group_count - negative_hit_count)


def _hidden_signal_type(rows: list[dict[str, Any]]) -> str:
    text = " ".join(
        " ".join(str(row.get(key) or "") for key in ("title", "snippet", "description", "url")).lower()
        for row in rows
    )
    if any(token in text for token in ("failed", "failure", "delayed", "stalled", "replacement", "moving away", "alternative")):
        return "vendor_replacement_or_project_rescue"
    if any(token in text for token in ("hiring", "contractor", "capacity", "shortage")):
        return "delivery_capacity_pressure"
    if any(token in text for token in ("compliance", "deadline", "nis2", "dora", "security")):
        return "compliance_or_security_urgency"
    return "implementation_pain"


def _claim_title(signal_type: str, hypothesis: dict[str, Any]) -> str:
    topic = str(
        hypothesis.get("query_text")
        or hypothesis.get("queryText")
        or hypothesis.get("seed_entity")
        or hypothesis.get("seedEntity")
        or "hidden demand"
    ).strip()
    return f"{signal_type}: {topic}"[:240]


def _claim_summary(signal_type: str, rows: list[dict[str, Any]]) -> str:
    examples = "; ".join(str(row.get("title") or row.get("url") or "").strip() for row in rows[:3] if row)
    return f"Open-web evidence cluster for {signal_type}. Sample evidence: {examples}"[:1000]


_DEFAULT_HIDDEN_POSITIVE_GROUPS: list[dict[str, Any]] = [
    {
        "name": "project_need",
        "cues": [
            "need help",
            "looking for",
            "seeking",
            "request for",
            "proposal",
            "quote",
            "vendor",
        ],
    },
    {
        "name": "implementation_change",
        "cues": [
            "implementation",
            "integration",
            "migration",
            "replacement",
            "upgrade",
            "replatform",
            "custom",
        ],
    },
    {
        "name": "urgency_or_capacity",
        "cues": [
            "urgent",
            "deadline",
            "delayed",
            "stalled",
            "capacity",
            "shortage",
            "temporary",
            "contractor",
        ],
    },
    {
        "name": "project_rescue",
        "cues": [
            "failed",
            "failure",
            "problem",
            "workaround",
            "moving away",
            "alternative",
            "take over",
        ],
    },
]

_DEFAULT_HIDDEN_NEGATIVE_GROUPS: list[dict[str, Any]] = [
    {
        "name": "generic_content",
        "cues": ["tutorial", "guide", "webinar", "training", "course", "best practices"],
    },
    {
        "name": "vendor_marketing",
        "cues": ["sponsored", "press release", "award winning", "our platform", "book a demo"],
    },
    {
        "name": "jobs_only",
        "cues": ["salary", "full-time", "job opening", "career", "apply now"],
    },
]

_DEFAULT_HIDDEN_THRESHOLDS = {
    "minPositiveGroups": 1,
    "minPositiveHits": 1,
    "maxNegativeGroups": 0,
}


def _coerce_group_config(value: Any, fallback: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return fallback
    groups: list[dict[str, Any]] = []
    for index, item in enumerate(value):
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or f"group_{index + 1}").strip()
        raw_cues = item.get("cues")
        if not isinstance(raw_cues, list):
            raw_cues = item.get("terms")
        cues = [str(entry).strip().lower() for entry in raw_cues or [] if str(entry).strip()]
        if name and cues:
            groups.append({"name": name, "cues": cues})
    return groups or fallback


def _coerce_threshold(value: Any, fallback: int, *, minimum: int, maximum: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = fallback
    return max(minimum, min(maximum, parsed))


def _normalize_hidden_claim_extraction_config(config: dict[str, Any] | None) -> dict[str, Any]:
    raw = config if isinstance(config, dict) else {}
    raw_thresholds = raw.get("thresholds") if isinstance(raw.get("thresholds"), dict) else {}
    return {
        "positiveGroups": _coerce_group_config(
            raw.get("positiveGroups"),
            _DEFAULT_HIDDEN_POSITIVE_GROUPS,
        ),
        "negativeGroups": _coerce_group_config(
            raw.get("negativeGroups"),
            _DEFAULT_HIDDEN_NEGATIVE_GROUPS,
        ),
        "thresholds": {
            "minPositiveGroups": _coerce_threshold(
                raw_thresholds.get("minPositiveGroups"),
                _DEFAULT_HIDDEN_THRESHOLDS["minPositiveGroups"],
                minimum=1,
                maximum=10,
            ),
            "minPositiveHits": _coerce_threshold(
                raw_thresholds.get("minPositiveHits"),
                _DEFAULT_HIDDEN_THRESHOLDS["minPositiveHits"],
                minimum=1,
                maximum=30,
            ),
            "maxNegativeGroups": _coerce_threshold(
                raw_thresholds.get("maxNegativeGroups"),
                _DEFAULT_HIDDEN_THRESHOLDS["maxNegativeGroups"],
                minimum=0,
                maximum=10,
            ),
        },
    }


def _hidden_claim_extraction_config(hypothesis: dict[str, Any]) -> dict[str, Any]:
    for key in ("hiddenClaimExtraction", "hidden_claim_extraction"):
        value = hypothesis.get(key)
        if isinstance(value, dict):
            return value
    for container_key in ("explorer_json", "explorerJson", "graph_json", "graphJson", "policy_json", "policyJson"):
        container = hypothesis.get(container_key)
        if not isinstance(container, dict):
            continue
        value = container.get("hiddenClaimExtraction") or container.get("hidden_claim_extraction")
        if isinstance(value, dict):
            return value
        candidate_signals = container.get("candidateSignals") or container.get("candidate_signals")
        if isinstance(candidate_signals, dict):
            return {
                "positiveGroups": candidate_signals.get("positiveGroups") or [],
                "negativeGroups": candidate_signals.get("negativeGroups") or [],
            }
    return {}


def _hidden_group_hits(text: str, groups: list[dict[str, Any]]) -> dict[str, list[str]]:
    hits: dict[str, list[str]] = {}
    for group in groups:
        name = str(group.get("name") or "").strip()
        cues = group.get("cues") if isinstance(group.get("cues"), list) else []
        matched = [str(cue).lower() for cue in cues if str(cue).lower() in text]
        if name and matched:
            hits[name] = matched
    return hits


def _hypothesis_entities(hypothesis: dict[str, Any]) -> list[str]:
    entities: list[str] = []
    for key in ("seed_entity", "seedEntity"):
        value = str(hypothesis.get(key) or "").strip()
        if value:
            entities.append(value)
    return list(dict.fromkeys(entities))


def _hidden_context_terms(hypothesis: dict[str, Any]) -> list[str]:
    entities = _hypothesis_entities(hypothesis)
    if entities:
        return entities
    query = str(hypothesis.get("query_text") or hypothesis.get("queryText") or "").lower()
    stop_terms = {
        "and",
        "or",
        "the",
        "after",
        "too",
        "expensive",
        "cost",
        "price",
        "problem",
        "failed",
        "failure",
        "alternative",
        "moving",
        "away",
        "replacement",
        "migration",
    }
    terms: list[str] = []
    current = ""
    for character in query:
        if character.isalnum():
            current += character
            continue
        if len(current) >= 3 and current not in stop_terms:
            terms.append(current)
        current = ""
    if len(current) >= 3 and current not in stop_terms:
        terms.append(current)
    return list(dict.fromkeys(terms))[:6]


def _dedupe_claims(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped: dict[str, dict[str, Any]] = {}
    for row in rows:
        key = str(row.get("normalized_claim") or row.get("title") or "").lower()
        if not key:
            continue
        existing = deduped.get(key)
        if existing is None or float(row.get("confidence_score") or 0) > float(existing.get("confidence_score") or 0):
            deduped[key] = row
    return list(deduped.values())


def canonical_domain_from_result(row: dict[str, Any]) -> str:
    try:
        return urlparse(str(row.get("canonical_url") or row.get("url") or "")).netloc.lower()
    except Exception:
        return ""


def _deep_merge_endpoint_evidence(endpoint: dict[str, Any], evidence: dict[str, Any]) -> dict[str, Any]:
    merged = {**endpoint, **{key: value for key, value in evidence.items() if value is not None}}
    if isinstance(endpoint.get("evidence_json"), dict) or isinstance(evidence.get("evidence_json"), dict):
        merged["evidence_json"] = {
            **(endpoint.get("evidence_json") if isinstance(endpoint.get("evidence_json"), dict) else {}),
            **(evidence.get("evidence_json") if isinstance(evidence.get("evidence_json"), dict) else {}),
        }
    return merged


SEED_REVIEW_ENDPOINTS: dict[tuple[str, str], dict[str, Any]] = {
    ("procurement_signal", "procurement"): {
        "reason": "operator_seed_procurement_url_validated",
        "missingEvidence": ["listing samples", "document links", "publication dates"],
    },
    ("security_advisory", "security_advisory"): {
        "reason": "operator_seed_security_advisory_url_validated",
        "missingEvidence": ["advisory samples", "publication dates", "CVE or advisory identifiers"],
    },
    ("primary_data", "dataset"): {
        "reason": "operator_seed_dataset_url_validated",
        "missingEvidence": ["dataset samples", "download links", "metadata update dates"],
    },
    ("report_research", "report_library"): {
        "reason": "operator_seed_report_library_url_validated",
        "missingEvidence": ["report samples", "publication dates", "downloadable documents"],
    },
    ("regulatory_policy", "regulatory_policy"): {
        "reason": "operator_seed_regulatory_policy_url_validated",
        "missingEvidence": ["policy document samples", "effective dates", "issuing authority metadata"],
    },
}


def _apply_seed_review_evidence(endpoint: dict[str, Any]) -> dict[str, Any]:
    """Allow known seed URLs to reach manual review with URL proof only.

    This is not promotion evidence. It creates a reviewable candidate when the
    operator supplied a direct role-specific portal seed and cheap website
    probing cannot extract enough samples from a dynamic/search page.
    """

    if endpoint.get("origin_kind") != "seed_url":
        return endpoint
    seed_policy = SEED_REVIEW_ENDPOINTS.get((str(endpoint.get("source_role")), str(endpoint.get("endpoint_kind"))))
    if seed_policy is None:
        return endpoint
    if float(endpoint.get("evidence_score") or 0) >= 0.45:
        return endpoint
    validation = dict(endpoint.get("evidence_json") or {}).get("urlValidation")
    if not isinstance(validation, dict) or not _url_validation_ok(validation):
        return endpoint
    evidence_json = dict(endpoint.get("evidence_json") or {})
    evidence_json["seedReview"] = {
        "reason": seed_policy["reason"],
        "missingEvidence": list(seed_policy["missingEvidence"]),
        "promotionPolicy": "website_manual_review_only",
    }
    return {
        **endpoint,
        "evidence_json": evidence_json,
        "evidence_score": 0.45,
        "yield_score": max(float(endpoint.get("yield_score") or 0), 0.10),
        "freshness_score": max(float(endpoint.get("freshness_score") or 0), 0.35),
        "extraction_ready_score": max(float(endpoint.get("extraction_ready_score") or 0), 0.30),
        "quality_score": max(float(endpoint.get("quality_score") or 0), 0.65),
        "rejection_reason": None,
    }


def _url_validation_ok(row: dict[str, Any]) -> bool:
    if row.get("error") or row.get("error_text") or row.get("errorText"):
        return False
    if row.get("is_valid") is not None:
        return bool(row.get("is_valid"))
    if row.get("isValid") is not None:
        return bool(row.get("isValid"))
    status = _int_value(row, "status", "status_code", "statusCode", "http_status", "httpStatus")
    return status == 0 or 200 <= status < 400


def _search_results_with_provider_votes(results: list[dict[str, Any]], *, provider: str) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for index, result in enumerate(results, start=1):
        row = dict(result)
        rank = _int_value(row, "provider_rank", "rank") or index
        row.setdefault("provider_rank", rank)
        row.setdefault("provider_votes", {provider: {"rank": rank}})
        normalized.append(row)
    return normalized


def _evidence_items_from_search_results(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    evidence: list[dict[str, Any]] = []
    for result in results:
        evidence.append(
            {
                "provider_id": "web_search",
                "evidence_kind": "search_result",
                "url": result.get("url"),
                "canonical_url": result.get("canonical_url"),
                "canonical_domain": result.get("canonical_domain"),
                "object_type": result.get("result_kind"),
                "title": result.get("title"),
                "text_excerpt": result.get("snippet") or result.get("description"),
                "raw_json": result,
                "normalized_json": {
                    "canonicalUrl": result.get("canonical_url"),
                    "canonicalDomain": result.get("canonical_domain"),
                    "resultKind": result.get("result_kind"),
                },
                "direct_signal_score": 0.5 if result.get("result_kind") not in {"community", "social"} else 0.1,
                "hidden_signal_score": 0.5 if result.get("result_kind") in {"community", "social"} else 0.0,
                "quality_score": 0.5,
                "risk_score": 0.25,
            }
        )
    return evidence


def _provider_health_from_exception(*, provider_id: str, error: Exception, now: datetime) -> dict[str, Any]:
    message = str(error)
    lowered = message.lower()
    last_error_kind = "provider_error"
    if any(token in lowered for token in ("auth", "api key", "apikey", "unauthorized", "forbidden")):
        last_error_kind = "auth_failed"
    elif any(token in lowered for token in ("rate limit", "too many requests", "429")):
        last_error_kind = "rate_limited"
    health = evaluate_provider_health(
        {
            "provider_id": provider_id,
            "error_rate": 1.0,
            "last_error_kind": last_error_kind,
            "metrics_json": {"error": message},
        },
        now=now,
    )
    return {**health, "last_error_kind": last_error_kind, "last_error_at": now, "metrics_json": {"error": message}}


def _fetch_directory_html(url: str, *, max_bytes: int = 200_000) -> str | None:
    if not url.startswith(("http://", "https://")):
        return None
    if not _robots_allows(url):
        return None
    try:
        request = Request(url, headers={"user-agent": "NewsPortalDiscovery/1.0"})
        with urlopen(request, timeout=10) as response:  # pragma: no cover - live network only
            content_type = response.headers.get("content-type", "")
            if "html" not in content_type.lower():
                return None
            return response.read(max_bytes).decode("utf-8", errors="ignore")
    except Exception:
        return None


def _robots_allows(url: str) -> bool:
    try:
        parsed = urlparse(url)
        parser = robotparser.RobotFileParser(f"{parsed.scheme}://{parsed.netloc}/robots.txt")
        parser.read()
        return parser.can_fetch("NewsPortalDiscovery/1.0", url)
    except Exception:
        return True


def _dedupe_provider_health(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped: dict[str, dict[str, Any]] = {}
    for row in rows:
        provider_id = str(row.get("provider_id") or row.get("providerId") or "")
        if provider_id:
            deduped[provider_id] = row
    return list(deduped.values())


def _execution_provider_id(hypothesis: dict[str, Any]) -> str:
    provider_id = str(hypothesis.get("provider_id") or hypothesis.get("providerId") or "web_search").strip()
    return provider_id or "web_search"


def _int_value(row: dict[str, Any], *keys: str) -> int:
    for key in keys:
        if row.get(key) is not None:
            try:
                return int(row[key])
            except (TypeError, ValueError):
                return 0
    return 0


def _fixture_results(fixtures: dict[str, Any], query: str, provider_id: str) -> list[dict[str, Any]]:
    provider_key = f"{provider_id}:{query}"
    value = fixtures.get(provider_key)
    if value is None:
        value = fixtures.get(query)
    if not isinstance(value, list):
        return []
    return [dict(item) for item in value if isinstance(item, dict)]


def _mapping(value: Any) -> dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _dedupe_by(rows: list[dict[str, Any]], key: str) -> list[dict[str, Any]]:
    deduped: dict[str, dict[str, Any]] = {}
    for row in rows:
        value = str(row.get(key) or "")
        if value and value not in deduped:
            deduped[value] = row
    return list(deduped.values())


def _dedupe_endpoints(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return _dedupe_by(rows, "normalized_endpoint_url")


def _dedupe_followups(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, str, str]] = set()
    deduped: list[dict[str, Any]] = []
    for row in rows:
        key = (
            str(row.get("seed_domain") or ""),
            str(row.get("source_role") or ""),
            str(row.get("query_text") or ""),
        )
        if key in seen:
            continue
        seen.add(key)
        deduped.append(row)
    return deduped


def _string_or_none(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None
