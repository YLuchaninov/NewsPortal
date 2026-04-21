from __future__ import annotations

from typing import Any, Mapping

from .source_scoring import canonical_domain, clamp_score

SUPPORTED_DISCOVERY_PROVIDER_TYPES = {"rss", "website"}
PROCUREMENT_PORTAL_COMPAT_KINDS = {"procurement_portal", "listing", "document"}
PRE_PROBE_AGGREGATOR_DOMAINS = {
    "feedspot.com",
    "flipboard.com",
    "alltop.com",
    "blogarama.com",
    "rssing.com",
}
PRE_PROBE_PATH_HINTS = (
    "/about",
    "/about-us",
    "/contact",
    "/login",
    "/signin",
    "/search",
    "/profile",
    "/profiles",
)
PRE_PROBE_LISTICLE_HINTS = (
    "best blogs",
    "top blogs",
    "top 100",
    "top 50",
    "directory",
    "directories",
    "blog directory",
    "feed directory",
)
POST_PROBE_PROMO_HINTS = (
    "services",
    "agency",
    "consulting",
    "outsourcing",
    "book a demo",
    "contact sales",
)
POST_PROBE_EXPLAINER_HINTS = (
    "how to",
    "guide",
    "playbook",
    "what is",
    "process",
    "checklist",
)
POST_PROBE_ARCHIVE_HINTS = (
    "archive",
    "archives",
    "category",
    "tag/",
)


def _as_mapping(value: Any) -> dict[str, Any]:
    return dict(value) if isinstance(value, Mapping) else {}


def _normalize_string_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        items = [str(item).strip() for item in value if str(item).strip()]
    else:
        candidate = str(value).strip()
        items = [candidate] if candidate else []
    deduped: list[str] = []
    seen: set[str] = set()
    for item in items:
        lowered = item.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        deduped.append(item)
    return deduped


def _normalize_optional_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _normalize_domain_list(*values: Any) -> list[str]:
    domains: list[str] = []
    seen: set[str] = set()
    for value in values:
        for item in _normalize_string_list(value):
            normalized = canonical_domain(item)
            if normalized == "unknown":
                normalized = canonical_domain(f"https://{item}")
            if not normalized or normalized == "unknown" or normalized in seen:
                continue
            seen.add(normalized)
            domains.append(normalized)
    return domains


def _normalize_keyword_list(value: Any) -> list[str]:
    return [item.lower() for item in _normalize_string_list(value)]


def _includes_keyword(text_values: list[str], keywords: list[str]) -> bool:
    if not keywords:
        return False
    haystacks = [str(value or "").strip().lower() for value in text_values if str(value or "").strip()]
    return any(keyword in haystack for keyword in keywords for haystack in haystacks)


def _matches_domain(domain: str, domains: list[str]) -> bool:
    if not domain or not domains:
        return False
    return any(domain == candidate or domain.endswith(f".{candidate}") for candidate in domains)


def _normalize_supported_website_kinds(values: Any) -> list[str]:
    return [item.lower() for item in _normalize_string_list(values)]


def normalize_runtime_discovery_policy(
    *,
    lane: str,
    applied_policy_json: Mapping[str, Any] | None,
    mission_like: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    snapshot = _as_mapping(applied_policy_json)
    mission = _as_mapping(mission_like)
    mission_owned = _as_mapping(snapshot.get("missionOwned"))
    policy = _as_mapping(snapshot.get("graphPolicy" if lane == "graph" else "recallPolicy"))
    provider_types = [
        provider
        for provider in _normalize_string_list(policy.get("providerTypes"))
        if provider in SUPPORTED_DISCOVERY_PROVIDER_TYPES
    ]
    if not provider_types:
        provider_types = [
            provider
            for provider in _normalize_string_list(
                mission.get("target_provider_types") or mission_owned.get("targetProviderTypes")
            )
            if provider in SUPPORTED_DISCOVERY_PROVIDER_TYPES
        ]
    return {
        "lane": lane,
        "profileId": str(snapshot.get("profileId") or mission.get("profile_id") or "").strip() or None,
        "profileKey": str(snapshot.get("profileKey") or "").strip() or None,
        "profileDisplayName": str(snapshot.get("profileDisplayName") or "").strip() or None,
        "profileVersion": int(snapshot.get("profileVersion") or mission.get("applied_profile_version") or 0) or None,
        "providerTypes": provider_types or ["rss", "website"],
        "supportedWebsiteKinds": _normalize_supported_website_kinds(policy.get("supportedWebsiteKinds")),
        "preferredDomains": _normalize_domain_list(policy.get("preferredDomains")),
        "blockedDomains": _normalize_domain_list(
            policy.get("blockedDomains"),
            policy.get("negativeDomains"),
        ),
        "positiveKeywords": _normalize_keyword_list(policy.get("positiveKeywords")),
        "negativeKeywords": _normalize_keyword_list(policy.get("negativeKeywords")),
        "preferredTactics": _normalize_keyword_list(policy.get("preferredTactics")),
        "minRssReviewScore": _normalize_optional_float(policy.get("minRssReviewScore")),
        "minWebsiteReviewScore": _normalize_optional_float(policy.get("minWebsiteReviewScore")),
        "minPromotionScore": _normalize_optional_float(policy.get("minPromotionScore")),
        "yieldBenchmark": {
            "domains": _normalize_domain_list(_as_mapping(snapshot.get("yieldBenchmark")).get("domains")),
            "titleKeywords": _normalize_keyword_list(_as_mapping(snapshot.get("yieldBenchmark")).get("titleKeywords")),
            "tacticKeywords": _normalize_keyword_list(_as_mapping(snapshot.get("yieldBenchmark")).get("tacticKeywords")),
        },
        "missionOwned": mission_owned,
        "hasProfile": bool(str(snapshot.get("profileId") or mission.get("profile_id") or "").strip()),
    }


def website_kind_matches_supported(actual_kind: str | None, supported_kinds: list[str]) -> bool:
    if not supported_kinds:
        return True
    normalized_actual = str(actual_kind or "").strip().lower()
    if not normalized_actual:
        return True
    for supported_kind in supported_kinds:
        if supported_kind == normalized_actual:
            return True
        if supported_kind == "procurement_portal" and normalized_actual in PROCUREMENT_PORTAL_COMPAT_KINDS:
            return True
    return False


def resolve_policy_threshold(
    *,
    lane: str,
    provider_type: str,
    policy: Mapping[str, Any],
    fallback_threshold: float | None,
) -> float | None:
    if lane == "graph":
        threshold = (
            policy.get("minWebsiteReviewScore")
            if provider_type == "website"
            else policy.get("minRssReviewScore")
        )
    else:
        threshold = policy.get("minPromotionScore")
    if threshold is not None:
        return float(threshold)
    if not bool(policy.get("hasProfile")) and fallback_threshold is not None:
        return float(fallback_threshold)
    return None


def classify_pre_probe_negative(
    *,
    url: str,
    title: str,
    snippet: str,
) -> str | None:
    candidate_url = str(url or "").strip().lower()
    domain = canonical_domain(url)
    path_start = candidate_url.partition(domain)[2] if domain and domain != "unknown" else candidate_url
    title_text = str(title or "").strip().lower()
    snippet_text = str(snippet or "").strip().lower()
    combined = " ".join(part for part in (title_text, snippet_text, candidate_url) if part)
    if domain in PRE_PROBE_AGGREGATOR_DOMAINS:
        return "aggregator_domain"
    if any(path_hint in path_start for path_hint in PRE_PROBE_PATH_HINTS):
        return "non_source_path"
    if _includes_keyword([combined], list(PRE_PROBE_LISTICLE_HINTS)):
        return "listicle_or_directory"
    return None


def classify_post_probe_negative(
    *,
    url: str,
    title: str,
    description: str,
    sample_data: Any,
    provider_type: str,
    classification_kind: str | None,
) -> str | None:
    normalized_kind = str(classification_kind or "").strip().lower()
    if provider_type == "website" and normalized_kind in {"listing", "document", "procurement_portal"}:
        return None
    texts = [str(title or "").lower(), str(description or "").lower(), str(url or "").lower()]
    if isinstance(sample_data, list):
        for item in sample_data[:4]:
            if isinstance(item, Mapping):
                texts.extend(
                    [
                        str(item.get("title") or "").lower(),
                        str(item.get("snippet") or item.get("content") or "").lower(),
                    ]
                )
            else:
                texts.append(str(item).lower())
    if _includes_keyword(texts, list(POST_PROBE_PROMO_HINTS)):
        return "vendor_self_promo"
    if _includes_keyword(texts, list(POST_PROBE_EXPLAINER_HINTS)):
        return "guide_or_process_explainer"
    if _includes_keyword(texts, list(POST_PROBE_ARCHIVE_HINTS)):
        return "low_precision_archive"
    return None


def build_policy_review(
    *,
    lane: str,
    policy: Mapping[str, Any],
    candidate: Mapping[str, Any],
    evaluation_json: Mapping[str, Any] | None = None,
    fit_score: float | int | None = None,
    quality_prior: float | int | None = None,
    lexical_score: float | int | None = None,
    default_threshold: float | None = None,
    search_provider: str | None = None,
    query_family: str | None = None,
) -> dict[str, Any]:
    evaluation = _as_mapping(evaluation_json)
    classification = _as_mapping(evaluation.get("classification"))
    provider_type = str(candidate.get("provider_type") or "rss").strip().lower() or "rss"
    url = str(candidate.get("url") or candidate.get("final_url") or "").strip()
    title = str(candidate.get("title") or "").strip()
    description = str(candidate.get("description") or "").strip()
    tactic_key = str(candidate.get("tactic_key") or evaluation.get("quality_signal_source") or "").strip().lower()
    search_query = str(candidate.get("search_query") or evaluation.get("search_query") or "").strip().lower()
    classification_kind = str(classification.get("kind") or "").strip().lower() or None
    domain = canonical_domain(url)
    sample_data = evaluation.get("sample_data") if isinstance(evaluation.get("sample_data"), list) else candidate.get("sample_data")
    text_fields = [
        title.lower(),
        description.lower(),
        url.lower(),
        search_query,
        tactic_key,
    ]
    preferred_domain_match = _matches_domain(domain, list(policy.get("preferredDomains") or []))
    blocked_domain_match = _matches_domain(domain, list(policy.get("blockedDomains") or []))
    positive_keyword_match = _includes_keyword(text_fields, list(policy.get("positiveKeywords") or []))
    negative_keyword_match = _includes_keyword(text_fields, list(policy.get("negativeKeywords") or []))
    preferred_tactic_match = _includes_keyword([tactic_key, search_query], list(policy.get("preferredTactics") or []))
    benchmark = _as_mapping(policy.get("yieldBenchmark"))
    benchmark_like = (
        _matches_domain(domain, list(benchmark.get("domains") or []))
        or _includes_keyword([title.lower()], list(benchmark.get("titleKeywords") or []))
        or _includes_keyword([tactic_key, search_query], list(benchmark.get("tacticKeywords") or []))
    )
    provider_allowed = provider_type in list(policy.get("providerTypes") or ["rss", "website"])
    website_kind_supported = website_kind_matches_supported(
        classification_kind,
        list(policy.get("supportedWebsiteKinds") or []),
    )
    pre_probe_reason = classify_pre_probe_negative(
        url=url,
        title=title,
        snippet=str(evaluation.get("search_snippet") or description),
    )
    post_probe_reason = classify_post_probe_negative(
        url=url,
        title=title,
        description=description,
        sample_data=sample_data,
        provider_type=provider_type,
        classification_kind=classification_kind,
    )
    residuals: list[str] = []
    if bool(evaluation.get("browser_assisted_recommended")) and provider_type == "website":
        residuals.append("browser_assisted_recommended")
    challenge_kind = str(evaluation.get("challenge_kind") or "").strip().lower()
    if challenge_kind:
        residuals.append(f"challenge:{challenge_kind}")

    fit_score_value = clamp_score(fit_score if fit_score is not None else lexical_score)
    quality_prior_value = clamp_score(quality_prior)
    lexical_score_value = clamp_score(lexical_score if lexical_score is not None else fit_score_value)

    sample_texts: list[str] = []
    if isinstance(sample_data, list):
        for item in sample_data[:4]:
            if isinstance(item, Mapping):
                sample_texts.extend(
                    [
                        str(item.get("title") or "").lower(),
                        str(item.get("snippet") or item.get("content") or "").lower(),
                    ]
                )
            else:
                sample_texts.append(str(item).lower())
    sample_precision = 0.5
    if sample_texts:
        signal_hits = 0
        if _includes_keyword(sample_texts, list(policy.get("positiveKeywords") or [])):
            signal_hits += 1
        if preferred_domain_match or benchmark_like:
            signal_hits += 1
        if not _includes_keyword(sample_texts, list(policy.get("negativeKeywords") or [])):
            signal_hits += 1
        sample_precision = clamp_score(signal_hits / 3)

    domain_prior = 0.9 if preferred_domain_match else (0.7 if benchmark_like else 0.5)
    website_kind_fit = (
        1.0
        if provider_type != "website" or website_kind_supported
        else 0.0
    )
    policy_bonus = 0.08 if preferred_tactic_match else 0.0
    if positive_keyword_match:
        policy_bonus += 0.08
    if preferred_domain_match:
        policy_bonus += 0.08
    if benchmark_like:
        policy_bonus += 0.05
    policy_penalty = 0.0
    if blocked_domain_match:
        policy_penalty += 0.5
    if negative_keyword_match:
        policy_penalty += 0.2
    if pre_probe_reason:
        policy_penalty += 0.35
    if post_probe_reason:
        policy_penalty += 0.25
    if residuals:
        policy_penalty += 0.2
    final_review_score = clamp_score(
        fit_score_value * 0.35
        + quality_prior_value * 0.25
        + lexical_score_value * 0.15
        + sample_precision * 0.1
        + domain_prior * 0.1
        + website_kind_fit * 0.05
        + policy_bonus
        - policy_penalty
    )
    threshold = resolve_policy_threshold(
        lane=lane,
        provider_type=provider_type,
        policy=policy,
        fallback_threshold=default_threshold,
    )

    if str(candidate.get("status") or "").strip() == "duplicate":
        verdict = "duplicate"
        policy_verdict = "duplicate"
        reason_bucket = "already_registered"
    elif not provider_allowed:
        verdict = "rejected"
        policy_verdict = "rejected"
        reason_bucket = "provider_not_allowed"
    elif blocked_domain_match:
        verdict = "rejected"
        policy_verdict = "rejected"
        reason_bucket = "blocked_domain"
    elif provider_type == "website" and not website_kind_supported:
        verdict = "rejected"
        policy_verdict = "rejected"
        reason_bucket = "unsupported_website_kind"
    elif negative_keyword_match:
        verdict = "rejected"
        policy_verdict = "rejected"
        reason_bucket = "negative_keyword_match"
    elif pre_probe_reason:
        verdict = "rejected"
        policy_verdict = "rejected"
        reason_bucket = pre_probe_reason
    elif post_probe_reason:
        verdict = "rejected"
        policy_verdict = "rejected"
        reason_bucket = post_probe_reason
    elif residuals:
        verdict = "manual_review"
        policy_verdict = "manual_review"
        reason_bucket = "browser_assisted_residual" if "browser_assisted_recommended" in residuals else "challenge_residual"
    elif threshold is None:
        verdict = "pending_review"
        policy_verdict = "pending_review"
        reason_bucket = "threshold_not_configured"
    elif final_review_score >= threshold:
        verdict = "auto_approve" if lane == "graph" else "promotable"
        policy_verdict = "passed"
        reason_bucket = "above_lane_threshold"
    else:
        verdict = "pending_review"
        policy_verdict = "pending_review"
        reason_bucket = (
            "below_auto_approval_threshold" if lane == "graph" else "below_auto_promotion_threshold"
        )

    return {
        "lane": lane,
        "provider": str(search_provider or candidate.get("search_provider") or "unknown"),
        "providerType": provider_type,
        "profileId": policy.get("profileId"),
        "profileVersion": policy.get("profileVersion"),
        "fitScore": fit_score_value,
        "qualityPrior": quality_prior_value,
        "policyVerdict": policy_verdict,
        "finalReviewScore": final_review_score,
        "reviewScore": final_review_score,
        "threshold": threshold,
        "verdict": verdict,
        "reasonBucket": reason_bucket,
        "matchedSignals": {
            "preferredDomainMatch": preferred_domain_match,
            "blockedDomainMatch": blocked_domain_match,
            "positiveKeywordMatch": positive_keyword_match,
            "negativeKeywordMatch": negative_keyword_match,
            "preferredTacticMatch": preferred_tactic_match,
            "benchmarkLike": benchmark_like,
            "websiteKind": classification_kind,
            "websiteKindSupported": website_kind_supported,
            "queryFamily": query_family,
        },
        "residuals": residuals,
        "scoreBreakdown": {
            "lexicalScore": lexical_score_value,
            "samplePrecision": sample_precision,
            "domainPrior": domain_prior,
            "websiteKindFit": website_kind_fit,
            "policyBonus": round(policy_bonus, 4),
            "policyPenalty": round(policy_penalty, 4),
        },
    }
