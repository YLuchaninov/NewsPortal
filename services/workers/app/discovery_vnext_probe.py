from __future__ import annotations

import inspect
from typing import Any, Protocol
from urllib.parse import urlparse

from services.workers.app.discovery_vnext_artifacts import (
    validate_probe_plan,
    validate_probe_report,
    validation_json,
)


class FeedProbeAdapter(Protocol):
    def probe_feeds(
        self,
        *,
        urls: list[str],
        sample_count: int,
        timeout_seconds: float | None = None,
    ) -> list[dict[str, Any]]: ...


class WebsiteProbeAdapter(Protocol):
    def probe_websites(
        self,
        *,
        urls: list[str],
        sample_count: int,
        allow_browser: bool | None = None,
        timeout_seconds: float | None = None,
    ) -> list[dict[str, Any]]: ...


DEFAULT_PROBE_POLICY = {
    "defaultStrategy": "cheap_static_first",
    "maxRequests": 10,
    "maxBrowserRequests": 0,
    "timeoutMs": 10000,
    "sampleCount": 5,
    "sameOriginOnly": True,
    "disallowedActions": ["login", "captcha_bypass", "cookie_replay", "stealth_scraping"],
}


def build_probe_plan(
    *,
    candidate_url: str,
    candidate_kind_guess: str = "unknown",
    policy: dict[str, Any] | None = None,
) -> dict[str, Any]:
    effective_policy = {**DEFAULT_PROBE_POLICY, **(policy or {})}
    max_browser_requests = max(0, int(effective_policy.get("maxBrowserRequests") or 0))
    checks = _checks_for_candidate(candidate_kind_guess, max_browser_requests=max_browser_requests)
    payload = {
        "candidateUrl": candidate_url,
        "candidateKindGuess": candidate_kind_guess or "unknown",
        "probeStrategy": str(effective_policy.get("defaultStrategy") or "cheap_static_first"),
        "checks": checks,
        "limits": {
            "maxRequests": max(1, int(effective_policy.get("maxRequests") or 10)),
            "maxBrowserRequests": max_browser_requests,
            "timeoutMs": max(1000, int(effective_policy.get("timeoutMs") or 10000)),
            "sampleCount": max(1, min(10, int(effective_policy.get("sampleCount") or 5))),
            "sameOriginOnly": bool(effective_policy.get("sameOriginOnly", True)),
        },
        "allowedEscalations": ["bounded_browser"] if max_browser_requests > 0 else [],
        "disallowedActions": _disallowed_actions(effective_policy),
        "fetchersBoundary": {
            "owner": "services/fetchers",
            "pythonRole": "orchestrate_only",
        },
    }
    issues = validate_probe_plan(payload)
    return {
        "artifactType": "ProbePlan",
        "schemaVersion": "1.0",
        "status": "validated" if not issues else "rejected",
        "payload": payload,
        "validation": validation_json(issues),
    }


def execute_probe_plan(
    probe_plan: dict[str, Any],
    *,
    feed_probe_adapter: FeedProbeAdapter | None = None,
    website_probe_adapter: WebsiteProbeAdapter | None = None,
) -> dict[str, Any]:
    issues = validate_probe_plan(probe_plan)
    if issues:
        payload = _failed_report_payload(
            candidate_url=str(probe_plan.get("candidateUrl") or ""),
            reason="invalid_probe_plan",
            observations=[issue.as_dict() for issue in issues],
        )
        return _probe_report_artifact(payload)

    candidate_url = str(probe_plan["candidateUrl"])
    limits = probe_plan.get("limits") if isinstance(probe_plan.get("limits"), dict) else {}
    sample_count = max(1, min(10, int(limits.get("sampleCount") or 5)))
    timeout_seconds = max(1.0, min(30.0, float(limits.get("timeoutMs") or 10000) / 1000.0))
    allow_browser = int(limits.get("maxBrowserRequests") or 0) > 0
    checks = {str(item) for item in probe_plan.get("checks", []) if str(item).strip()}

    feed_results: list[dict[str, Any]] = []
    website_results: list[dict[str, Any]] = []
    provider_failures: list[dict[str, Any]] = []

    if "rss_feed_probe" in checks:
        try:
            feed_results = _call_feed_probe(
                _feed_adapter(feed_probe_adapter),
                urls=[candidate_url],
                sample_count=sample_count,
                timeout_seconds=timeout_seconds,
            )
        except Exception as error:  # noqa: BLE001 - provider failure is telemetry, not source rejection.
            provider_failures.append({"provider": "fetchers.feed_probe", "error": str(error)})

    if checks.intersection({"website_static_probe", "sitemap_probe"}):
        try:
            website_results = _call_website_probe(
                _website_adapter(website_probe_adapter),
                urls=[candidate_url],
                sample_count=sample_count,
                allow_browser=allow_browser,
                timeout_seconds=timeout_seconds,
            )
        except Exception as error:  # noqa: BLE001 - provider failure is telemetry, not source rejection.
            provider_failures.append({"provider": "fetchers.website_probe", "error": str(error)})

    payload = build_probe_report_payload(
        candidate_url=candidate_url,
        probe_plan=probe_plan,
        feed_results=feed_results,
        website_results=website_results,
        provider_failures=provider_failures,
    )
    return _probe_report_artifact(payload)


def build_probe_report_payload(
    *,
    candidate_url: str,
    probe_plan: dict[str, Any],
    feed_results: list[dict[str, Any]],
    website_results: list[dict[str, Any]],
    provider_failures: list[dict[str, Any]],
) -> dict[str, Any]:
    access_pattern = _access_pattern(feed_results, website_results, provider_failures)
    observations = _observations(feed_results, website_results, provider_failures)
    browser_attempted = any(bool(item.get("browser_attempted") or item.get("browserAttempted")) for item in website_results)
    browser_recommended = any(
        bool(item.get("browser_assisted_recommended") or item.get("browserAssistedRecommended"))
        for item in website_results
    )
    payload = {
        "candidateUrl": candidate_url,
        "accessPattern": access_pattern,
        "technicalObservability": _technical_observability(
            feed_results,
            website_results,
            provider_failures,
            browser_recommended=browser_recommended,
        ),
        "observedArtifacts": _observed_artifacts(feed_results, website_results),
        "pageRoleHints": _page_role_hints(candidate_url, feed_results, website_results),
        "probeCost": _probe_cost(probe_plan, feed_results, website_results),
        "observations": observations,
        "fetchersBoundary": True,
        "browserProbeAttempted": browser_attempted,
        "browserProbeAllowed": int(_limits(probe_plan).get("maxBrowserRequests") or 0) > 0,
        "feedResults": feed_results,
        "websiteResults": website_results,
        "providerFailures": provider_failures,
        "negativeEvidencePolicy": {
            "providerFailuresDoNotPunishSource": True,
            "historicalYieldNotUsed": True,
        },
    }
    return payload


def _checks_for_candidate(candidate_kind_guess: str, *, max_browser_requests: int) -> list[str]:
    normalized = candidate_kind_guess.strip().lower()
    if normalized == "rss":
        return ["rss_feed_probe", "website_static_probe", "sitemap_probe"]
    if normalized in {"website", "document", "dataset", "unknown", "api"}:
        checks = ["website_static_probe", "rss_feed_probe", "sitemap_probe"]
        if max_browser_requests > 0:
            checks.append("bounded_browser_probe")
        return checks
    return ["website_static_probe", "rss_feed_probe"]


def _disallowed_actions(policy: dict[str, Any]) -> list[str]:
    configured = [str(item) for item in policy.get("disallowedActions") or [] if str(item).strip()]
    required = ["login", "captcha_bypass"]
    return list(dict.fromkeys([*configured, *required]))


def _call_feed_probe(
    adapter: FeedProbeAdapter,
    *,
    urls: list[str],
    sample_count: int,
    timeout_seconds: float,
) -> list[dict[str, Any]]:
    if _accepts_parameter(adapter.probe_feeds, "timeout_seconds"):
        return adapter.probe_feeds(urls=urls, sample_count=sample_count, timeout_seconds=timeout_seconds)
    return adapter.probe_feeds(urls=urls, sample_count=sample_count)


def _call_website_probe(
    adapter: WebsiteProbeAdapter,
    *,
    urls: list[str],
    sample_count: int,
    allow_browser: bool,
    timeout_seconds: float,
) -> list[dict[str, Any]]:
    if _accepts_parameter(adapter.probe_websites, "timeout_seconds"):
        return adapter.probe_websites(
            urls=urls,
            sample_count=sample_count,
            allow_browser=allow_browser,
            timeout_seconds=timeout_seconds,
        )
    return adapter.probe_websites(urls=urls, sample_count=sample_count, allow_browser=allow_browser)


def _accepts_parameter(function: Any, name: str) -> bool:
    try:
        return name in inspect.signature(function).parameters
    except (TypeError, ValueError):
        return False


def _feed_adapter(adapter: FeedProbeAdapter | None) -> FeedProbeAdapter:
    if adapter is not None:
        return adapter
    from services.workers.app.task_engine.adapters.fetchers_rss_probe import FetchersRssProbeAdapter

    return FetchersRssProbeAdapter()


def _website_adapter(adapter: WebsiteProbeAdapter | None) -> WebsiteProbeAdapter:
    if adapter is not None:
        return adapter
    from services.workers.app.task_engine.adapters.website_probe import FetchersWebsiteProbeAdapter

    return FetchersWebsiteProbeAdapter()


def _probe_report_artifact(payload: dict[str, Any]) -> dict[str, Any]:
    issues = validate_probe_report(payload)
    return {
        "artifactType": "ProbeReport",
        "schemaVersion": "1.0",
        "status": "validated" if not issues else "rejected",
        "payload": payload,
        "validation": validation_json(issues),
    }


def _failed_report_payload(
    *,
    candidate_url: str,
    reason: str,
    observations: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "candidateUrl": candidate_url,
        "accessPattern": "unknown",
        "technicalObservability": {
            "observable": False,
            "score": 0.0,
            "reason": reason,
        },
        "probeCost": {"requestsAttempted": 0, "browserRequestsAttempted": 0},
        "observations": observations,
        "fetchersBoundary": True,
        "browserProbeAttempted": False,
        "browserProbeAllowed": False,
        "providerFailures": [],
        "negativeEvidencePolicy": {
            "providerFailuresDoNotPunishSource": True,
            "historicalYieldNotUsed": True,
        },
    }


def _access_pattern(
    feed_results: list[dict[str, Any]],
    website_results: list[dict[str, Any]],
    provider_failures: list[dict[str, Any]],
) -> str:
    if any(str(item.get("challenge_kind") or "").lower() == "captcha" for item in website_results):
        return "captcha_blocked"
    if any(_mentions_auth(item) for item in [*feed_results, *website_results, *provider_failures]):
        return "requires_auth"
    if any(bool(item.get("is_valid_rss")) for item in feed_results):
        return "public"
    if any(_website_has_static_signal(item) for item in website_results):
        return "public"
    if any(bool(item.get("browser_assisted_recommended")) for item in website_results):
        return "requires_browser"
    return "unknown"


def _observations(
    feed_results: list[dict[str, Any]],
    website_results: list[dict[str, Any]],
    provider_failures: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    observations: list[dict[str, Any]] = []
    for item in feed_results:
        observations.append(
            {
                "kind": "feed_probe",
                "url": item.get("url") or item.get("feed_url"),
                "valid": bool(item.get("is_valid_rss")),
                "sampleEntryCount": len(item.get("sample_entries") or []),
                "errorText": item.get("error_text"),
            }
        )
    for item in website_results:
        observations.append(
            {
                "kind": "website_static_probe",
                "url": item.get("url") or item.get("final_url"),
                "classification": item.get("classification") or {},
                "pageRoleHints": _page_role_hints(str(item.get("url") or item.get("final_url") or ""), [], [item]),
                "discoveredFeedUrls": item.get("discovered_feed_urls") or [],
                "feedCount": len(item.get("discovered_feed_urls") or []),
                "listingCountEstimate": int(item.get("listing_count_estimate") or 0),
                "documentCountEstimate": int(item.get("document_count_estimate") or 0),
                "browserAssistedRecommended": bool(item.get("browser_assisted_recommended")),
                "challengeKind": item.get("challenge_kind"),
            }
        )
    for item in provider_failures:
        observations.append({"kind": "provider_failure", **item})
    return observations


def _observed_artifacts(feed_results: list[dict[str, Any]], website_results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    artifacts: list[dict[str, Any]] = []
    for item in feed_results:
        if bool(item.get("is_valid_rss")):
            entries = item.get("sample_entries") if isinstance(item.get("sample_entries"), list) else []
            artifacts.append(
                {
                    "artifactType": "article",
                    "countEstimate": len(entries),
                    "evidence": ["valid feed probe", "sample entries"],
                    "sampleUrls": [str(entry.get("url") or entry.get("link")) for entry in entries if isinstance(entry, dict) and (entry.get("url") or entry.get("link"))][:5],
                }
            )
    for item in website_results:
        listing_count = int(item.get("listing_count_estimate") or 0)
        document_count = int(item.get("document_count_estimate") or 0)
        if listing_count > 0:
            artifacts.append(
                {
                    "artifactType": "listing",
                    "countEstimate": listing_count,
                    "evidence": ["website probe observed repeated listing-like resources"],
                    "sampleUrls": _sample_urls(item),
                }
            )
        if document_count > 0:
            artifacts.append(
                {
                    "artifactType": "document",
                    "countEstimate": document_count,
                    "evidence": ["website probe observed document-like resources"],
                    "sampleUrls": _sample_urls(item),
                }
            )
        classification = item.get("classification") if isinstance(item.get("classification"), dict) else {}
        for artifact_type in classification.get("artifactTypes") or []:
            if isinstance(artifact_type, str) and artifact_type:
                artifacts.append(
                    {
                        "artifactType": artifact_type,
                        "countEstimate": 1,
                        "evidence": ["website classification artifact type"],
                        "sampleUrls": _sample_urls(item),
                    }
                )
    return _dedupe_artifacts(artifacts)


def _technical_observability(
    feed_results: list[dict[str, Any]],
    website_results: list[dict[str, Any]],
    provider_failures: list[dict[str, Any]],
    *,
    browser_recommended: bool,
) -> dict[str, Any]:
    feed_score = 0.85 if any(bool(item.get("is_valid_rss")) for item in feed_results) else 0.0
    website_score = max((_website_score(item) for item in website_results), default=0.0)
    provider_failure_penalty = 0.0 if (feed_results or website_results) else min(0.2, len(provider_failures) * 0.1)
    score = max(0.0, max(feed_score, website_score) - provider_failure_penalty)
    if browser_recommended and score < 0.55:
        score = max(score, 0.35)
    return {
        "observable": score >= 0.35,
        "score": round(score, 2),
        "feedValid": feed_score > 0,
        "staticWebsiteSignals": website_score > 0,
        "hasStableUrls": any(_sample_urls(item) for item in website_results),
        "hasDateOrVersionSignals": any(_has_date_or_version_signal(item) for item in website_results),
        "hasRecurringStructure": any(int(item.get("listing_count_estimate") or 0) > 0 for item in website_results) or feed_score > 0,
        "challengeDetected": any(bool(item.get("challenge_kind")) for item in website_results),
        "providerFailureCount": len(provider_failures),
        "providerFailuresAreTelemetryOnly": True,
    }


def _probe_cost(
    probe_plan: dict[str, Any],
    feed_results: list[dict[str, Any]],
    website_results: list[dict[str, Any]],
) -> dict[str, Any]:
    limits = _limits(probe_plan)
    return {
        "requestsAttempted": len(feed_results) + len(website_results),
        "browserRequestsAttempted": sum(1 for item in website_results if bool(item.get("browser_attempted"))),
        "maxRequests": int(limits.get("maxRequests") or 0),
        "maxBrowserRequests": int(limits.get("maxBrowserRequests") or 0),
        "bounded": True,
    }


def _website_score(item: dict[str, Any]) -> float:
    classification = item.get("classification") if isinstance(item.get("classification"), dict) else {}
    confidence = float(classification.get("confidence") or 0)
    signal_bonus = 0.0
    if item.get("discovered_feed_urls"):
        signal_bonus += 0.12
    if int(item.get("listing_count_estimate") or 0) > 0:
        signal_bonus += 0.12
    if int(item.get("document_count_estimate") or 0) > 0:
        signal_bonus += 0.08
    return min(0.9, confidence + signal_bonus)


def _website_has_static_signal(item: dict[str, Any]) -> bool:
    return bool(item.get("discovered_feed_urls")) or int(item.get("listing_count_estimate") or 0) > 0 or int(item.get("document_count_estimate") or 0) > 0


def _page_role_hints(
    candidate_url: str,
    feed_results: list[dict[str, Any]],
    website_results: list[dict[str, Any]],
) -> dict[str, bool]:
    text = " ".join(
        [
            candidate_url,
            *[
                " ".join(str(item.get(key) or "") for key in ("url", "final_url", "title", "snippet", "classification"))
                for item in website_results
            ],
        ]
    ).lower()
    host = ""
    try:
        host = (urlparse(candidate_url).hostname or "").lower()
    except ValueError:
        host = ""
    listing_count = max((int(item.get("listing_count_estimate") or 0) for item in website_results), default=0)
    document_count = max((int(item.get("document_count_estimate") or 0) for item in website_results), default=0)
    has_feed = any(bool(item.get("is_valid_rss")) for item in feed_results) or any(
        bool(item.get("discovered_feed_urls")) for item in website_results
    )
    return {
        "sellerOrVendorLikely": any(token in text for token in ("/pricing", "/services", "/solutions", "/demo", "book a demo", "our services", "consulting")),
        "officialOwnerLikely": any(token in text for token in ("/news", "/press", "/announcements", "/updates", "/changelog", "official")),
        "publicAuthorityLikely": host.endswith((".gov", ".gob", ".europa.eu", ".int", ".edu")) or any(token in text for token in ("ministry", "agency", "department", "commission")),
        "aggregatorOrDirectoryLikely": listing_count > 3 or any(token in text for token in ("/directory", "/marketplace", "/listings", "/registry", "/catalog")),
        "communityOrUgcLikely": any(token in text for token in ("/forum", "/community", "/questions", "/issues", "reddit", "stackoverflow", "github.com")),
        "secondaryExplainerLikely": any(token in text for token in ("/blog", "/guide", "/learn", "how to", "what is", "template")),
        "staticEvergreenLikely": any(token in text for token in ("/services", "/solutions", "/guide", "/template", "/blog")) and not has_feed and listing_count == 0,
        "recurringListingLikely": listing_count > 0 or has_feed,
        "datasetOrRegistryLikely": document_count > 0 or any(token in text for token in ("/data", "/dataset", "/registry", "/api", "open data")),
    }


def _sample_urls(item: dict[str, Any]) -> list[str]:
    values = item.get("sample_urls") or item.get("sampleUrls") or item.get("detail_urls") or []
    return [str(value) for value in values if isinstance(value, str) and value.strip()][:5]


def _has_date_or_version_signal(item: dict[str, Any]) -> bool:
    rendered = str(item).lower()
    return any(token in rendered for token in ("published", "updated", "date", "version", "deadline", "posted_at"))


def _dedupe_artifacts(artifacts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    result: list[dict[str, Any]] = []
    for artifact in artifacts:
        key = str(artifact.get("artifactType") or "unknown")
        if key in seen:
            continue
        seen.add(key)
        result.append(artifact)
    return result[:10]


def _mentions_auth(item: dict[str, Any]) -> bool:
    rendered = str(item).lower()
    return any(token in rendered for token in ("401", "403", "unauthorized", "forbidden", "login required"))


def _limits(probe_plan: dict[str, Any]) -> dict[str, Any]:
    limits = probe_plan.get("limits")
    return limits if isinstance(limits, dict) else {}
