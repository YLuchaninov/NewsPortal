from __future__ import annotations

from dataclasses import dataclass
from math import sqrt
from typing import Any
from urllib.parse import urlparse


ROLE_SLOTS: dict[str, dict[str, int]] = {
    "authoritative_anchor": {"min": 2, "max": 3},
    "early_signal": {"min": 1, "max": 2},
    "niche_specialist": {"min": 1, "max": 2},
    "primary_source": {"min": 1, "max": 2},
    "contrarian_edge": {"min": 1, "max": 2},
    "explainer_background": {"min": 1, "max": 2},
}


def clamp_score(value: float | int | None) -> float:
    if value is None:
        return 0.0
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return 0.0
    if numeric < 0:
        return 0.0
    if numeric > 1:
        return 1.0
    return round(numeric, 4)


def _coerce_non_negative_int(value: Any) -> int:
    try:
        numeric = int(value)
    except (TypeError, ValueError):
        return 0
    return max(numeric, 0)


def _coerce_non_negative_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None
    return max(numeric, 0.0)


def _tokenize(value: Any) -> set[str]:
    text = ""
    if isinstance(value, str):
        text = value
    elif isinstance(value, list):
        text = " ".join(str(item) for item in value)
    elif isinstance(value, dict):
        text = " ".join(str(item) for item in value.values())
    else:
        text = str(value)
    tokens: set[str] = set()
    for raw in text.lower().replace("/", " ").replace("-", " ").split():
        token = "".join(ch for ch in raw if ch.isalnum() or ch == "_").strip()
        if len(token) >= 2:
            tokens.add(token)
    return tokens


def canonical_domain(url: str) -> str:
    parsed = urlparse(url or "")
    netloc = (parsed.netloc or "").lower()
    if netloc.startswith("www."):
        netloc = netloc[4:]
    return netloc or "unknown"


def _average(values: list[float]) -> float:
    if not values:
        return 0.0
    return round(sum(values) / len(values), 4)


def compute_trust_score(signals: dict[str, Any]) -> float:
    ownership = clamp_score(signals.get("ownership_transparency"))
    accountability = clamp_score(signals.get("author_accountability"))
    linking = clamp_score(signals.get("source_linking_quality"))
    stability = clamp_score(signals.get("historical_stability"))
    technical = clamp_score(signals.get("technical_quality"))
    spam = clamp_score(signals.get("spam_signals"))
    score = (
        ownership * 0.2
        + accountability * 0.18
        + linking * 0.17
        + stability * 0.15
        + technical * 0.15
        + (1 - spam) * 0.15
    )
    return clamp_score(score)


def summarize_channel_quality_metrics(raw_metrics: dict[str, Any] | None = None) -> dict[str, Any]:
    metrics = dict(raw_metrics or {})
    total_articles = _coerce_non_negative_int(metrics.get("total_articles_period"))
    unique_articles = _coerce_non_negative_int(metrics.get("unique_articles_period"))
    duplicate_articles = _coerce_non_negative_int(metrics.get("duplicate_articles_period"))
    fresh_articles = _coerce_non_negative_int(metrics.get("fresh_articles_period"))
    fetch_runs = _coerce_non_negative_int(metrics.get("fetch_runs_period"))
    successful_fetch_runs = _coerce_non_negative_int(metrics.get("successful_fetch_runs_period"))
    new_content_fetch_runs = _coerce_non_negative_int(metrics.get("new_content_fetch_runs_period"))
    degraded_fetch_runs = _coerce_non_negative_int(metrics.get("degraded_fetch_runs_period"))
    duplicate_suppressed = _coerce_non_negative_int(metrics.get("duplicate_suppressed_period"))
    new_articles_from_fetch = _coerce_non_negative_int(metrics.get("new_articles_from_fetch_period"))
    effective_poll_interval_seconds = _coerce_non_negative_int(metrics.get("effective_poll_interval_seconds"))
    consecutive_failures = _coerce_non_negative_int(metrics.get("consecutive_failures"))
    avg_article_delay_seconds = _coerce_non_negative_float(metrics.get("avg_article_delay_seconds"))
    last_result_kind = str(metrics.get("last_result_kind") or "").strip() or None

    uniqueness_score = (
        clamp_score(unique_articles / max(total_articles, 1))
        if total_articles
        else 0.5
    )
    freshness_score = (
        clamp_score(fresh_articles / max(total_articles, 1))
        if total_articles
        else 0.5
    )
    fetch_health_score = (
        clamp_score(successful_fetch_runs / max(fetch_runs, 1))
        if fetch_runs
        else 0.5
    )
    activity_score = (
        clamp_score(new_content_fetch_runs / max(fetch_runs, 1))
        if fetch_runs
        else freshness_score
    )

    poll_interval_score = (
        clamp_score(1 - (min(effective_poll_interval_seconds, 172800) / 172800))
        if effective_poll_interval_seconds > 0
        else 0.5
    )
    delay_score = (
        clamp_score(1 - (min(avg_article_delay_seconds, 172800.0) / 172800.0))
        if avg_article_delay_seconds is not None
        else poll_interval_score
    )
    lead_time_score = clamp_score(delay_score * 0.6 + poll_interval_score * 0.4)

    duplicate_ratio = (
        clamp_score(duplicate_articles / max(total_articles, 1))
        if total_articles
        else 0.0
    )
    suppressed_ratio = (
        clamp_score(duplicate_suppressed / max(duplicate_suppressed + new_articles_from_fetch, 1))
        if duplicate_suppressed or new_articles_from_fetch
        else 0.0
    )
    duplication_score = (
        clamp_score(duplicate_ratio * 0.7 + suppressed_ratio * 0.3)
        if total_articles or duplicate_suppressed or new_articles_from_fetch
        else 0.15
    )

    failure_penalty = clamp_score(consecutive_failures / 5)
    if last_result_kind in {"transient_failure", "hard_failure", "rate_limited"}:
        failure_penalty = clamp_score(failure_penalty + 0.1)

    yield_score = clamp_score(
        uniqueness_score * 0.35
        + fetch_health_score * 0.25
        + activity_score * 0.15
        + freshness_score * 0.15
        + lead_time_score * 0.1
        - failure_penalty * 0.15
    )

    return {
        "metric_source": "generic_channel_quality",
        "total_articles_period": total_articles,
        "unique_articles_period": unique_articles,
        "duplicate_articles_period": duplicate_articles,
        "fresh_articles_period": fresh_articles,
        "fetch_runs_period": fetch_runs,
        "successful_fetch_runs_period": successful_fetch_runs,
        "new_content_fetch_runs_period": new_content_fetch_runs,
        "degraded_fetch_runs_period": degraded_fetch_runs,
        "duplicate_suppressed_period": duplicate_suppressed,
        "new_articles_from_fetch_period": new_articles_from_fetch,
        "effective_poll_interval_seconds": effective_poll_interval_seconds,
        "consecutive_failures": consecutive_failures,
        "last_result_kind": last_result_kind,
        "fetch_health_score": fetch_health_score,
        "freshness_score": freshness_score,
        "uniqueness_score": uniqueness_score,
        "activity_score": activity_score,
        "lead_time_score": lead_time_score,
        "yield_score": yield_score,
        "duplication_score": duplication_score,
    }


def build_source_profile(candidate: dict[str, Any]) -> dict[str, Any]:
    domain = canonical_domain(str(candidate.get("url") or candidate.get("final_url") or ""))
    sample_data = candidate.get("sample_data") if isinstance(candidate.get("sample_data"), list) else []
    llm_assessment = candidate.get("llm_assessment") if isinstance(candidate.get("llm_assessment"), dict) else {}
    title_tokens = _tokenize(candidate.get("title"))
    reasoning_tokens = _tokenize(llm_assessment.get("reasoning"))
    description_tokens = _tokenize(candidate.get("description"))
    sample_tokens = _tokenize(sample_data)
    source_type = str(candidate.get("provider_type") or "unknown")
    has_about_hint = any(token in reasoning_tokens for token in {"about", "editorial", "author"})
    ownership_transparency = 0.75 if has_about_hint else 0.5
    author_accountability = 0.7 if has_about_hint or "author" in reasoning_tokens else 0.45
    source_linking_quality = 0.65 if any(token in sample_tokens for token in {"source", "report", "official"}) else 0.45
    historical_stability = 0.7 if candidate.get("is_valid", True) else 0.35
    technical_quality = 0.85 if candidate.get("is_valid", True) else 0.4
    spam_signals = 0.1 if not any(token in domain for token in ("spam", "click", "casino")) else 0.7
    trust_score = compute_trust_score(
        {
            "ownership_transparency": ownership_transparency,
            "author_accountability": author_accountability,
            "source_linking_quality": source_linking_quality,
            "historical_stability": historical_stability,
            "technical_quality": technical_quality,
            "spam_signals": spam_signals,
        }
    )
    source_kind = "official_organization" if any(token in domain for token in ("gov", "org", "official")) else source_type
    return {
        "canonical_domain": domain,
        "source_type": source_kind,
        "org_name": (domain.split(".")[0] if domain != "unknown" else None),
        "country": None,
        "languages": [],
        "ownership_transparency": ownership_transparency,
        "author_accountability": author_accountability,
        "source_linking_quality": source_linking_quality,
        "historical_stability": historical_stability,
        "technical_quality": technical_quality,
        "spam_signals": spam_signals,
        "trust_score": trust_score,
        "extraction_data": {
            "titleTokens": sorted(title_tokens),
            "reasoningTokens": sorted(reasoning_tokens),
            "descriptionTokens": sorted(description_tokens),
            "sampleTokens": sorted(sample_tokens),
        },
    }


def _match_ratio(left: set[str], right: set[str]) -> float:
    if not left or not right:
        return 0.0
    return clamp_score(len(left.intersection(right)) / max(len(left), 1))


def compute_source_interest_score(
    *,
    mission_graph: dict[str, Any],
    profile: dict[str, Any],
    candidate: dict[str, Any],
    channel_metrics: dict[str, Any] | None = None,
) -> dict[str, Any]:
    graph_tokens = _tokenize(mission_graph)
    source_tokens = _tokenize(candidate) | _tokenize(profile.get("extraction_data"))
    subtopic_tokens = _tokenize(mission_graph.get("subtopics") or [])
    source_type_tokens = _tokenize(mission_graph.get("source_types") or [])
    quality_signals = _tokenize((candidate.get("llm_assessment") or {}).get("quality_signals") or [])

    topic_coverage = _match_ratio(graph_tokens, source_tokens)
    specificity = _match_ratio(subtopic_tokens or graph_tokens, source_tokens)
    audience_fit = max(
        _match_ratio(source_type_tokens, _tokenize(profile.get("source_type"))),
        clamp_score(candidate.get("relevance_score")),
    )
    evidence_depth = clamp_score(
        0.5
        + 0.25 * _match_ratio({"source", "official", "report", "analysis"}, quality_signals | source_tokens)
        + 0.25 * clamp_score(profile.get("source_linking_quality"))
    )
    signal_to_noise = clamp_score(
        (clamp_score(candidate.get("relevance_score")) * 0.7)
        + ((1 - clamp_score(profile.get("spam_signals"))) * 0.3)
    )
    fit_score = clamp_score(
        topic_coverage * 0.3
        + specificity * 0.2
        + audience_fit * 0.15
        + evidence_depth * 0.2
        + signal_to_noise * 0.15
    )

    novelty_score = clamp_score(
        1
        - _match_ratio(
            _tokenize(candidate.get("url")),
            _tokenize(candidate.get("final_url")) | _tokenize(profile.get("canonical_domain")),
        )
        + 0.15
    )
    lead_time_score = clamp_score((channel_metrics or {}).get("lead_time_score", 0.5))
    yield_score = clamp_score((channel_metrics or {}).get("yield_score", 0.5))
    duplication_score = clamp_score((channel_metrics or {}).get("duplication_score", 0.15))
    quality_prior = clamp_score(
        clamp_score(profile.get("trust_score")) * 0.45
        + clamp_score(profile.get("source_linking_quality")) * 0.2
        + lead_time_score * 0.1
        + yield_score * 0.15
        + (1 - duplication_score) * 0.1
    )
    contextual_score = clamp_score(
        fit_score * 0.45
        + novelty_score * 0.15
        + lead_time_score * 0.15
        + yield_score * 0.15
        + (1 - duplication_score) * 0.1
    )
    final_review_score = clamp_score(contextual_score * 0.7 + quality_prior * 0.3)

    score = {
        "topic_coverage": topic_coverage,
        "specificity": specificity,
        "audience_fit": audience_fit,
        "evidence_depth": evidence_depth,
        "signal_to_noise": signal_to_noise,
        "fit_score": fit_score,
        "quality_prior": quality_prior,
        "novelty_score": novelty_score,
        "lead_time_score": lead_time_score,
        "yield_score": yield_score,
        "duplication_score": duplication_score,
        "contextual_score": contextual_score,
        "final_review_score": final_review_score,
        "scoring_breakdown": {
            "graphTokens": sorted(graph_tokens),
            "sourceTokens": sorted(source_tokens),
            "qualityPrior": quality_prior,
            "finalReviewScore": final_review_score,
            "channelMetrics": {
                "metricSource": str((channel_metrics or {}).get("metric_source") or "generic_channel_quality"),
                "yieldScore": yield_score,
                "leadTimeScore": lead_time_score,
                "duplicationScore": duplication_score,
                "fetchHealthScore": clamp_score((channel_metrics or {}).get("fetch_health_score", 0.5)),
                "freshnessScore": clamp_score((channel_metrics or {}).get("freshness_score", 0.5)),
                "uniquenessScore": clamp_score((channel_metrics or {}).get("uniqueness_score", 0.5)),
                "activityScore": clamp_score((channel_metrics or {}).get("activity_score", 0.5)),
                "totalArticlesPeriod": _coerce_non_negative_int((channel_metrics or {}).get("total_articles_period")),
                "uniqueArticlesPeriod": _coerce_non_negative_int((channel_metrics or {}).get("unique_articles_period")),
                "duplicateArticlesPeriod": _coerce_non_negative_int((channel_metrics or {}).get("duplicate_articles_period")),
                "fetchRunsPeriod": _coerce_non_negative_int((channel_metrics or {}).get("fetch_runs_period")),
                "successfulFetchRunsPeriod": _coerce_non_negative_int((channel_metrics or {}).get("successful_fetch_runs_period")),
                "newContentFetchRunsPeriod": _coerce_non_negative_int((channel_metrics or {}).get("new_content_fetch_runs_period")),
                "degradedFetchRunsPeriod": _coerce_non_negative_int((channel_metrics or {}).get("degraded_fetch_runs_period")),
                "duplicateSuppressedPeriod": _coerce_non_negative_int((channel_metrics or {}).get("duplicate_suppressed_period")),
                "newArticlesFromFetchPeriod": _coerce_non_negative_int((channel_metrics or {}).get("new_articles_from_fetch_period")),
                "effectivePollIntervalSeconds": _coerce_non_negative_int((channel_metrics or {}).get("effective_poll_interval_seconds")),
                "consecutiveFailures": _coerce_non_negative_int((channel_metrics or {}).get("consecutive_failures")),
                "lastResultKind": str((channel_metrics or {}).get("last_result_kind") or ""),
            },
        },
    }
    score["role_labels"] = classify_source_roles(profile, score)
    return score


def compute_source_recall_quality_snapshot(
    *,
    profile: dict[str, Any],
    candidate: dict[str, Any],
    channel_metrics: dict[str, Any] | None = None,
) -> dict[str, Any]:
    metrics = dict(channel_metrics or {})
    trust_score = clamp_score(profile.get("trust_score"))
    extraction_quality_score = clamp_score(
        clamp_score(profile.get("source_linking_quality")) * 0.45
        + clamp_score(profile.get("technical_quality")) * 0.45
        + (1 - clamp_score(profile.get("spam_signals"))) * 0.1
    )
    stability_score = clamp_score(
        clamp_score(profile.get("historical_stability")) * 0.55
        + clamp_score(metrics.get("fetch_health_score", 0.5)) * 0.45
    )
    freshness_score = clamp_score(metrics.get("freshness_score", 0.5))
    lead_time_score = clamp_score(metrics.get("lead_time_score", 0.5))
    yield_score = clamp_score(metrics.get("yield_score", 0.5))
    duplication_score = clamp_score(metrics.get("duplication_score", 0.15))
    independence_score = clamp_score(
        clamp_score(metrics.get("uniqueness_score", 0.5)) * 0.7
        + (1 - duplication_score) * 0.3
    )
    recall_score = clamp_score(
        trust_score * 0.22
        + extraction_quality_score * 0.16
        + stability_score * 0.16
        + independence_score * 0.16
        + freshness_score * 0.1
        + lead_time_score * 0.1
        + yield_score * 0.1
    )
    return {
        "quality_source": "generic_recall_quality",
        "trust_score": trust_score,
        "extraction_quality_score": extraction_quality_score,
        "stability_score": stability_score,
        "independence_score": independence_score,
        "freshness_score": freshness_score,
        "lead_time_score": lead_time_score,
        "yield_score": yield_score,
        "duplication_score": duplication_score,
        "recall_score": recall_score,
        "scoring_breakdown": {
            "sourceProfile": {
                "canonicalDomain": str(profile.get("canonical_domain") or ""),
                "sourceType": str(profile.get("source_type") or ""),
                "trustScore": trust_score,
                "sourceLinkingQuality": clamp_score(profile.get("source_linking_quality")),
                "technicalQuality": clamp_score(profile.get("technical_quality")),
                "historicalStability": clamp_score(profile.get("historical_stability")),
                "spamSignals": clamp_score(profile.get("spam_signals")),
            },
            "candidate": {
                "url": str(candidate.get("url") or ""),
                "finalUrl": str(candidate.get("final_url") or ""),
                "providerType": str(candidate.get("provider_type") or ""),
                "title": str(candidate.get("title") or ""),
            },
            "channelMetrics": {
                "metricSource": str(metrics.get("metric_source") or "generic_channel_quality"),
                "fetchHealthScore": clamp_score(metrics.get("fetch_health_score", 0.5)),
                "freshnessScore": freshness_score,
                "uniquenessScore": clamp_score(metrics.get("uniqueness_score", 0.5)),
                "activityScore": clamp_score(metrics.get("activity_score", 0.5)),
                "leadTimeScore": lead_time_score,
                "yieldScore": yield_score,
                "duplicationScore": duplication_score,
                "totalArticlesPeriod": _coerce_non_negative_int(metrics.get("total_articles_period")),
                "uniqueArticlesPeriod": _coerce_non_negative_int(metrics.get("unique_articles_period")),
                "duplicateArticlesPeriod": _coerce_non_negative_int(metrics.get("duplicate_articles_period")),
                "fetchRunsPeriod": _coerce_non_negative_int(metrics.get("fetch_runs_period")),
                "successfulFetchRunsPeriod": _coerce_non_negative_int(metrics.get("successful_fetch_runs_period")),
                "newContentFetchRunsPeriod": _coerce_non_negative_int(metrics.get("new_content_fetch_runs_period")),
                "degradedFetchRunsPeriod": _coerce_non_negative_int(metrics.get("degraded_fetch_runs_period")),
                "duplicateSuppressedPeriod": _coerce_non_negative_int(metrics.get("duplicate_suppressed_period")),
                "newArticlesFromFetchPeriod": _coerce_non_negative_int(metrics.get("new_articles_from_fetch_period")),
                "effectivePollIntervalSeconds": _coerce_non_negative_int(metrics.get("effective_poll_interval_seconds")),
                "consecutiveFailures": _coerce_non_negative_int(metrics.get("consecutive_failures")),
                "lastResultKind": str(metrics.get("last_result_kind") or ""),
            },
        },
    }


def classify_source_roles(profile: dict[str, Any], score: dict[str, Any]) -> list[str]:
    roles: list[str] = []
    if clamp_score(profile.get("trust_score")) >= 0.7 and clamp_score(score.get("fit_score")) >= 0.6:
        roles.append("authoritative_anchor")
    if clamp_score(score.get("lead_time_score")) >= 0.6:
        roles.append("early_signal")
    if clamp_score(score.get("specificity")) >= 0.6 and clamp_score(score.get("evidence_depth")) >= 0.6:
        roles.append("niche_specialist")
    if str(profile.get("source_type") or "") in {"docs", "registry", "official_organization"}:
        roles.append("primary_source")
    if clamp_score(score.get("novelty_score")) >= 0.65:
        roles.append("contrarian_edge")
    if str(profile.get("source_type") or "") in {"blog", "website"} and clamp_score(score.get("evidence_depth")) >= 0.55:
        roles.append("explainer_background")
    return roles or ["unclassified"]


def compute_source_similarity(left: dict[str, Any], right: dict[str, Any]) -> float:
    left_vector = [
        clamp_score(left.get("contextual_score")),
        clamp_score(left.get("fit_score")),
        clamp_score(left.get("novelty_score")),
        clamp_score(left.get("lead_time_score")),
        clamp_score(left.get("yield_score")),
    ]
    right_vector = [
        clamp_score(right.get("contextual_score")),
        clamp_score(right.get("fit_score")),
        clamp_score(right.get("novelty_score")),
        clamp_score(right.get("lead_time_score")),
        clamp_score(right.get("yield_score")),
    ]
    dot = sum(a * b for a, b in zip(left_vector, right_vector, strict=False))
    left_norm = sqrt(sum(item * item for item in left_vector))
    right_norm = sqrt(sum(item * item for item in right_vector))
    if left_norm <= 0 or right_norm <= 0:
        return 0.0
    return clamp_score(dot / (left_norm * right_norm))


@dataclass
class RankedSource:
    source_profile_id: str
    candidate_id: str | None
    canonical_domain: str
    trust_score: float
    contextual_score: float
    fit_score: float
    novelty_score: float
    lead_time_score: float
    yield_score: float
    duplication_score: float
    role_labels: list[str]
    quality_prior: float = 0.0
    final_review_score: float = 0.0
    source_family: str | None = None
    title: str | None = None
    url: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "source_profile_id": self.source_profile_id,
            "candidate_id": self.candidate_id,
            "canonical_domain": self.canonical_domain,
            "trust_score": self.trust_score,
            "contextual_score": self.contextual_score,
            "fit_score": self.fit_score,
            "quality_prior": self.quality_prior,
            "final_review_score": self.final_review_score,
            "novelty_score": self.novelty_score,
            "lead_time_score": self.lead_time_score,
            "yield_score": self.yield_score,
            "duplication_score": self.duplication_score,
            "role_labels": list(self.role_labels),
            "source_family": self.source_family,
            "title": self.title,
            "url": self.url,
        }


def rank_portfolio(scored_sources: list[dict[str, Any]]) -> list[dict[str, Any]]:
    remaining = [dict(item) for item in scored_sources]
    selected: list[dict[str, Any]] = []
    slot_counts = {role: 0 for role in ROLE_SLOTS}

    while remaining:
        best_index = -1
        best_gain = -1.0
        for index, candidate in enumerate(remaining):
            gain = clamp_score(candidate.get("final_review_score") or candidate.get("contextual_score"))
            if selected:
                max_similarity = max(
                    compute_source_similarity(candidate, existing)
                    for existing in selected
                )
                gain -= 0.25 * max_similarity
                if any(
                    str(existing.get("canonical_domain") or "") == str(candidate.get("canonical_domain") or "")
                    for existing in selected
                ):
                    gain -= 0.4
                candidate_family = str(candidate.get("source_family") or "").strip().lower()
                if candidate_family and any(
                    str(existing.get("source_family") or "").strip().lower() == candidate_family
                    for existing in selected
                ):
                    gain -= 0.15
            for role in candidate.get("role_labels") or []:
                slot = ROLE_SLOTS.get(role)
                if slot and slot_counts[role] < slot["min"]:
                    gain += 0.15
            if gain > best_gain:
                best_gain = gain
                best_index = index
        if best_index < 0:
            break
        winner = remaining.pop(best_index)
        selected.append(winner)
        for role in winner.get("role_labels") or []:
            if role in slot_counts:
                slot_counts[role] += 1
        if len(selected) >= 12:
            break

    return selected


def detect_coverage_gaps(
    portfolio: list[dict[str, Any]],
    mission_graph: dict[str, Any],
) -> list[dict[str, Any]]:
    gaps: list[dict[str, Any]] = []
    role_counts = {role: 0 for role in ROLE_SLOTS}
    for source in portfolio:
        for role in source.get("role_labels") or []:
            if role in role_counts:
                role_counts[role] += 1
    for role, limits in ROLE_SLOTS.items():
        if role_counts[role] < limits["min"]:
            gaps.append(
                {
                    "type": "role_gap",
                    "role": role,
                    "current": role_counts[role],
                    "required": limits["min"],
                }
            )

    covered_tokens: set[str] = set()
    for source in portfolio:
        covered_tokens |= _tokenize(source.get("title"))
        covered_tokens |= _tokenize(source.get("canonical_domain"))
    for subtopic in mission_graph.get("subtopics") or []:
        if not (_tokenize(subtopic) & covered_tokens):
            gaps.append({"type": "subtopic_gap", "subtopic": str(subtopic)})
    for geo in mission_graph.get("geos") or []:
        if not (_tokenize(geo) & covered_tokens):
            gaps.append({"type": "geo_gap", "geo": str(geo)})
    return gaps


def build_portfolio_snapshot(
    *,
    mission_graph: dict[str, Any],
    scored_sources: list[dict[str, Any]],
) -> dict[str, Any]:
    ranked = rank_portfolio(scored_sources)
    gaps = detect_coverage_gaps(ranked, mission_graph)
    return {
        "ranked_sources": ranked,
        "gaps": gaps,
        "summary": {
            "selected_count": len(ranked),
            "gap_count": len(gaps),
            "average_contextual_score": _average(
                [clamp_score(item.get("contextual_score")) for item in ranked]
            ),
            "average_trust_score": _average(
                [clamp_score(item.get("trust_score")) for item in ranked]
            ),
        },
    }


def build_gap_filling_hypotheses(
    *,
    mission_graph: dict[str, Any],
    gaps: list[dict[str, Any]],
    class_rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    active_classes = {str(row.get("class_key")): row for row in class_rows}
    hypotheses: list[dict[str, Any]] = []
    for gap in gaps:
        if gap.get("type") == "role_gap" and "contrarian" in active_classes:
            hypotheses.append(
                {
                    "class_key": "contrarian",
                    "tactic_key": "gap_fill_role",
                    "search_query": f"{mission_graph.get('core_topic', 'news')} niche early signal source",
                    "target_provider_type": "website",
                    "expected_value": f"Fill role gap {gap.get('role')}",
                    "generation_context": {"gap": gap, "origin": "portfolio_gap"},
                }
            )
        elif gap.get("type") == "subtopic_gap" and "facet" in active_classes:
            hypotheses.append(
                {
                    "class_key": "facet",
                    "tactic_key": "gap_fill_subtopic",
                    "search_query": f"{gap.get('subtopic')} news source RSS",
                    "target_provider_type": "rss",
                    "expected_value": f"Cover subtopic {gap.get('subtopic')}",
                    "generation_context": {"gap": gap, "origin": "portfolio_gap"},
                }
            )
    return hypotheses
