from __future__ import annotations

from typing import Any

from services.workers.app.source_scoring import clamp_score


RARE_SIGNAL_PRIOR_VERSION = "rare_signal_source_prior.v1"

HIGH_PRIOR_THRESHOLDS = {
    "semanticFit": 0.68,
    "sourceRoleFit": 0.60,
    "trustScore": 0.45,
    "fetchHealth": 0.40,
}

MEDIUM_PRIOR_THRESHOLDS = {
    "semanticFit": 0.55,
    "sourceRoleFit": 0.45,
    "trustScore": 0.35,
    "fetchHealth": 0.25,
}

HIGH_OBSERVATION_BUDGET = {
    "windowDays": 30,
    "minSuccessfulFetches": 6,
    "minObservedItems": 300,
}

MEDIUM_OBSERVATION_BUDGET = {
    "windowDays": 14,
    "minSuccessfulFetches": 3,
    "minObservedItems": 100,
}

SEVERE_NEGATIVE_FAILURE_MODES = {
    "auth_required",
    "blocked_domain",
    "browser_challenge",
    "compliance_blocked",
    "contract_failed",
    "dead_endpoint",
    "hidden_signal_not_confirmed",
    "low_relevance",
    "probe_failed",
    "seo_noise",
    "social_noise",
}

NON_POISONING_FAILURE_MODES = {
    "provider_error",
    "rate_limited",
}

ROLE_LABEL_PRIORS = {
    "authoritative_anchor": 0.72,
    "early_signal": 0.74,
    "niche_specialist": 0.70,
    "primary_source": 0.68,
    "contrarian_edge": 0.58,
    "explainer_background": 0.48,
}

ENDPOINT_KIND_PRIORS = {
    "api_openapi": 0.62,
    "dataset": 0.62,
    "docs": 0.56,
    "forum": 0.70,
    "newsletter": 0.64,
    "procurement": 0.76,
    "release_notes": 0.62,
    "report_library": 0.64,
    "rss_feed": 0.58,
    "source_directory": 0.66,
}

PROVIDER_TYPE_PRIORS = {
    "api": 0.60,
    "forum": 0.70,
    "rss": 0.58,
    "search": 0.42,
    "social": 0.55,
    "website": 0.54,
}


def _tokens(value: Any) -> set[str]:
    if value is None:
        return set()
    if isinstance(value, str):
        text = value
    elif isinstance(value, dict):
        text = " ".join(str(item) for item in value.values())
    elif isinstance(value, list):
        text = " ".join(str(item) for item in value)
    else:
        text = str(value)
    tokens: set[str] = set()
    for raw in text.lower().replace("/", " ").replace("-", " ").split():
        token = "".join(ch for ch in raw if ch.isalnum() or ch == "_").strip()
        if len(token) >= 2:
            tokens.add(token)
    return tokens


def _string_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        return [value.strip()]
    return []


def _role_hints_from_target(target: dict[str, Any], mission_graph: dict[str, Any]) -> set[str]:
    policy = target.get("policy_json") if isinstance(target.get("policy_json"), dict) else {}
    autopilot = target.get("autopilot_json") if isinstance(target.get("autopilot_json"), dict) else {}
    graph_roles = mission_graph.get("sourceRoleTargets")
    role_hints: set[str] = set()
    if isinstance(graph_roles, dict):
        role_hints.update(str(role) for role in graph_roles)
    for container in (policy, autopilot, mission_graph):
        for key in (
            "rareSignalSourceRoleHints",
            "sourceRoleHints",
            "preferredSourceRoles",
            "hiddenSignalRoles",
        ):
            role_hints.update(_string_list(container.get(key)))
    return role_hints


def _score_source_role_fit(
    *,
    target: dict[str, Any],
    mission_graph: dict[str, Any],
    candidate: dict[str, Any],
    source_score: dict[str, Any],
) -> float:
    role_hints = _role_hints_from_target(target, mission_graph)
    source_role = str(
        candidate.get("source_role") or candidate.get("sourceRole") or ""
    ).strip()
    endpoint_kind = str(
        candidate.get("endpoint_kind") or candidate.get("endpointKind") or ""
    ).strip()
    provider_type = str(
        candidate.get("provider_type") or candidate.get("providerType") or ""
    ).strip()
    labels = [
        str(label).strip()
        for label in source_score.get("role_labels") or []
        if str(label).strip()
    ]

    direct_role_score = 0.0
    if source_role:
        direct_role_score = 1.0 if source_role in role_hints else 0.52

    role_hint_tokens = _tokens(list(role_hints))
    source_role_tokens = _tokens([source_role, endpoint_kind, provider_type])
    role_overlap_score = (
        clamp_score(len(role_hint_tokens & source_role_tokens) / max(1, len(source_role_tokens)))
        if source_role_tokens
        else 0.0
    )
    endpoint_score = ENDPOINT_KIND_PRIORS.get(endpoint_kind, 0.0)
    provider_score = PROVIDER_TYPE_PRIORS.get(provider_type, 0.0)
    label_score = max((ROLE_LABEL_PRIORS.get(label, 0.0) for label in labels), default=0.0)

    source_text_tokens = _tokens(
        [
            candidate.get("title"),
            candidate.get("description"),
            candidate.get("url"),
            candidate.get("endpoint_url"),
            candidate.get("homepage_url"),
        ]
    )
    text_role_score = (
        clamp_score(len(role_hint_tokens & source_text_tokens) / max(1, len(role_hint_tokens)))
        if role_hint_tokens
        else 0.0
    )

    return clamp_score(
        direct_role_score * 0.30
        + role_overlap_score * 0.20
        + endpoint_score * 0.18
        + provider_score * 0.12
        + label_score * 0.14
        + text_role_score * 0.06
    )


def summarize_negative_evidence(rows: list[dict[str, Any]] | None) -> dict[str, Any]:
    evidence_rows = list(rows or [])
    severe: list[dict[str, Any]] = []
    for row in evidence_rows:
        mode = str(row.get("failure_mode") or row.get("failureMode") or "")
        if mode in NON_POISONING_FAILURE_MODES:
            continue
        severity = clamp_score(row.get("severity"))
        if severity >= 0.75 and mode in SEVERE_NEGATIVE_FAILURE_MODES:
            severe.append(
                {
                    "failureMode": mode,
                    "severity": severity,
                    "negativeEvidenceId": str(
                        row.get("negative_evidence_id") or row.get("negativeEvidenceId") or ""
                    ),
                }
            )
    return {
        "totalCount": len(evidence_rows),
        "severeCount": len(severe),
        "severeEvidence": severe[:10],
        "hasSevereNegativeEvidence": bool(severe),
    }


def _semantic_fit(candidate: dict[str, Any], source_score: dict[str, Any]) -> float:
    return clamp_score(
        max(
            clamp_score(source_score.get("fit_score")),
            clamp_score(source_score.get("contextual_score")),
            clamp_score(source_score.get("final_review_score")),
            clamp_score(candidate.get("relevance_score") or candidate.get("interest_fit_score")),
        )
    )


def _meets(scores: dict[str, float], thresholds: dict[str, float]) -> bool:
    return all(scores[key] >= thresholds[key] for key in thresholds)


def build_rare_signal_source_prior(
    *,
    target: dict[str, Any],
    mission_graph: dict[str, Any],
    candidate: dict[str, Any],
    profile: dict[str, Any],
    source_score: dict[str, Any],
    channel_metrics: dict[str, Any],
    negative_evidence: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    negative_summary = summarize_negative_evidence(negative_evidence)
    scores = {
        "semanticFit": _semantic_fit(candidate, source_score),
        "sourceRoleFit": _score_source_role_fit(
            target=target,
            mission_graph=mission_graph,
            candidate=candidate,
            source_score=source_score,
        ),
        "trustScore": clamp_score(profile.get("trust_score")),
        "fetchHealth": clamp_score(channel_metrics.get("fetch_health_score", 0.5)),
    }
    has_severe_negative = bool(negative_summary["hasSevereNegativeEvidence"])

    if has_severe_negative:
        tier = "blocked"
        prior_state = "negative_evidence_review"
        budget = {"windowDays": 0, "minSuccessfulFetches": 0, "minObservedItems": 0}
        exploration_contribution = 0.0
        recommended_action = "review_negative_evidence"
    elif _meets(scores, HIGH_PRIOR_THRESHOLDS):
        tier = "high"
        prior_state = "rare_signal_probation"
        budget = dict(HIGH_OBSERVATION_BUDGET)
        exploration_contribution = 0.35
        recommended_action = "extend_monitoring_and_expand_source_neighborhood"
    elif _meets(scores, MEDIUM_PRIOR_THRESHOLDS):
        tier = "medium"
        prior_state = "monitor_only"
        budget = dict(MEDIUM_OBSERVATION_BUDGET)
        exploration_contribution = 0.15
        recommended_action = "monitor_only_until_observation_budget_exhausted"
    else:
        tier = "low"
        prior_state = "no_prior"
        budget = {"windowDays": 0, "minSuccessfulFetches": 0, "minObservedItems": 0}
        exploration_contribution = 0.0
        recommended_action = "do_not_extend_without_more_evidence"

    rationale = [
        "Source prior is source-level evidence for extended observation only.",
        "Prior-only evidence cannot select articles or create a found-signal claim.",
    ]
    if tier in {"high", "medium"}:
        rationale.append("Observation budget should be exhausted before zero-yield degradation.")
    if has_severe_negative:
        rationale.append("Severe negative evidence blocks rare-signal probation.")

    return {
        "priorVersion": RARE_SIGNAL_PRIOR_VERSION,
        "tier": tier,
        "priorState": prior_state,
        "recommendedAction": recommended_action,
        "scores": scores,
        "thresholds": {
            "high": HIGH_PRIOR_THRESHOLDS,
            "medium": MEDIUM_PRIOR_THRESHOLDS,
        },
        "observationBudget": budget,
        "observedState": {
            "successfulFetches": int(channel_metrics.get("successful_fetch_runs_period") or 0),
            "observedItems": int(channel_metrics.get("total_articles_period") or 0),
            "fetchRuns": int(channel_metrics.get("fetch_runs_period") or 0),
        },
        "negativeEvidence": negative_summary,
        "selectionGuardrails": {
            "priorCanSelectArticle": False,
            "priorCanRankArticle": False,
            "priorCanEscalateArticle": False,
            "articleFromSourceSelectionEligible": True,
            "selectedContentImpact": "none_from_prior",
            "sourcePriorIsSignalEvidence": False,
            "requiresArticleOrClaimEvidenceForWebSelection": True,
        },
        "coverageContribution": 0.0,
        "downstreamWeight": 0.0,
        "explorationContribution": exploration_contribution,
        "priorOnly": True,
        "rationale": rationale,
    }
