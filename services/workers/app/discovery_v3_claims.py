from __future__ import annotations

from typing import Any

from .discovery_v3_settings import DiscoveryV3Settings


def compute_specificity_score(target_signal_rate: float, control_signal_rate: float, epsilon: float = 0.001) -> float:
    return max(0.0, float(target_signal_rate)) / max(float(control_signal_rate), epsilon)


def score_hidden_claim(
    claim: dict[str, Any],
    *,
    settings: DiscoveryV3Settings | None = None,
) -> dict[str, Any]:
    effective_settings = settings or DiscoveryV3Settings()
    evidence_count = int(claim.get("support_evidence_count") or claim.get("evidence_count") or 0)
    independent_sources = int(claim.get("independent_source_count") or 0)
    unique_authors = int(claim.get("unique_author_count") or 0)
    need_score = float(claim.get("need_score") or 0)
    burst_score = float(claim.get("burst_score") or 0)
    novelty_score = float(claim.get("novelty_score") or 0)
    risk_score = float(claim.get("risk_score") or 0)
    control_rate = claim.get("control_signal_rate")
    target_rate = float(claim.get("target_signal_rate") or 0)
    specificity = (
        compute_specificity_score(target_rate, float(control_rate))
        if control_rate is not None
        else 0.0
    )
    specificity_component = 1.0 if specificity >= effective_settings.hidden_signal_strong_specificity_threshold else 0.4
    if specificity < effective_settings.hidden_signal_weak_specificity_threshold:
        specificity_component = 0.15

    confidence = max(
        0.0,
        min(
            1.0,
            need_score * 0.24
            + min(1.0, evidence_count / 20) * 0.14
            + min(1.0, independent_sources / 5) * 0.18
            + min(1.0, unique_authors / 12) * 0.10
            + burst_score * 0.10
            + novelty_score * 0.10
            + specificity_component * 0.14
            - risk_score * 0.18,
        ),
    )

    has_control = control_rate is not None
    if not has_control:
        confidence = min(confidence, effective_settings.hidden_signal_max_confidence_without_control)

    status = "candidate"
    if (
        evidence_count >= effective_settings.hidden_signal_min_evidence_count
        and independent_sources >= effective_settings.hidden_signal_min_independent_sources
        and unique_authors >= effective_settings.hidden_signal_min_unique_authors
        and confidence >= effective_settings.hidden_signal_min_confidence
        and has_control
        and specificity >= effective_settings.hidden_signal_weak_specificity_threshold
    ):
        status = "confirmed_signal"

    return {
        "confidenceScore": round(confidence, 4),
        "specificityScore": round(specificity, 4),
        "hasControlComparison": has_control,
        "status": status,
        "canGenerateDirectFollowup": status == "confirmed_signal",
    }


def build_claim_from_cluster(cluster: dict[str, Any]) -> dict[str, Any]:
    return {
        "claim_type": cluster.get("signal_type") or cluster.get("signalType") or "need",
        "signal_mode": "hidden",
        "title": cluster.get("title") or "Hidden signal claim",
        "normalized_claim": cluster.get("normalized_claim") or cluster.get("summary") or cluster.get("title"),
        "summary": cluster.get("summary"),
        "related_entities": list(cluster.get("related_entities") or cluster.get("relatedEntities") or []),
        "related_geos": list(cluster.get("related_geos") or cluster.get("relatedGeos") or []),
        "related_languages": list(cluster.get("related_languages") or cluster.get("relatedLanguages") or []),
        "support_evidence_count": int(cluster.get("evidence_count") or 0),
        "independent_source_count": int(cluster.get("independent_source_count") or 0),
        "unique_author_count": int(cluster.get("unique_author_count") or 0),
        "need_score": float(cluster.get("need_score") or 0),
        "burst_score": float(cluster.get("burst_score") or 0),
        "novelty_score": float(cluster.get("novelty_score") or 0),
        "risk_score": float(cluster.get("risk_score") or 0),
        "target_signal_rate": cluster.get("target_signal_rate"),
        "control_signal_rate": cluster.get("control_signal_rate"),
    }


def claim_can_generate_direct_followup(
    claim: dict[str, Any],
    *,
    settings: DiscoveryV3Settings | None = None,
) -> tuple[bool, dict[str, Any]]:
    scored = score_hidden_claim(claim, settings=settings)
    status = str(claim.get("status") or scored["status"])
    can_generate = status == "confirmed_signal" and bool(scored["hasControlComparison"])
    if not can_generate:
        can_generate = bool(scored["canGenerateDirectFollowup"])
    return can_generate, scored


def build_direct_followup_hypotheses_from_claim(
    *,
    claim: dict[str, Any],
    target: dict[str, Any],
    graph: dict[str, Any],
    run: dict[str, Any],
    settings: DiscoveryV3Settings | None = None,
) -> list[dict[str, Any]]:
    can_generate, scored = claim_can_generate_direct_followup(claim, settings=settings)
    if not can_generate:
        return []

    target_id = target["target_id"]
    run_id = run.get("run_id")
    claim_id = claim.get("claim_id") or claim.get("claimId")
    claim_text = str(
        claim.get("normalized_claim")
        or claim.get("normalizedClaim")
        or claim.get("title")
        or graph.get("coreTopic")
        or target.get("title")
        or ""
    ).strip()
    entities = [
        str(item).strip()
        for item in [
            *(claim.get("related_entities") or claim.get("relatedEntities") or []),
            *(graph.get("entities") or []),
        ]
        if str(item).strip()
    ]
    entities = list(dict.fromkeys(entities))[:3]
    topic = claim_text or str(graph.get("coreTopic") or target.get("title") or "").strip()
    source_role = str(claim.get("source_role") or claim.get("sourceRole") or "")
    role_plan = _direct_roles_for_claim(str(claim.get("claim_type") or claim.get("claimType") or ""), source_role)

    hypotheses: list[dict[str, Any]] = []
    for role, templates in role_plan:
        for template in templates:
            for entity in entities or [topic]:
                query = template.format(topic=topic, entity=entity)
                hypotheses.append(
                    {
                        "run_id": run_id,
                        "target_id": target_id,
                        "hypothesis_type": "hidden_claim_direct_followup",
                        "signal_mode": "direct",
                        "source_role": role,
                        "acquisition_tactic": "claim_followup_search",
                        "query_text": query,
                        "provider_id": "web_search",
                        "expected_provider_types": ["rss", "website"],
                        "expected_endpoint_kinds": [],
                        "endpoint_patterns": [],
                        "expected_data_shape": role,
                        "priority_score": min(1.0, 0.65 + float(scored["confidenceScore"]) * 0.25),
                        "gap_score": 0.75,
                        "risk_score": 0.35,
                        "confidence_score": float(scored["confidenceScore"]),
                        "explorer_json": {
                            "generatedBy": "hidden_claim_direct_followup",
                            "claimId": str(claim_id) if claim_id else None,
                            "claimConfidence": scored["confidenceScore"],
                            "specificityScore": scored["specificityScore"],
                            "hasControlComparison": scored["hasControlComparison"],
                        },
                    }
                )
    return _dedupe_hypotheses(hypotheses)


def _direct_roles_for_claim(claim_type: str, source_role: str) -> list[tuple[str, list[str]]]:
    if source_role and source_role not in {"social_pain_signal", "community_early_signal"}:
        return [(source_role, _templates_for_role(source_role))]
    if claim_type in {"purchase_research", "intent", "need", "migration_pressure"}:
        return [
            ("authoritative_anchor", ['"{entity}" official blog', '"{topic}" announcement']),
            ("procurement_signal", ['"{topic}" tender', '"{topic}" public procurement', '"{topic}" contract award']),
            ("report_research", ['"{topic}" report', '"{topic}" research']),
        ]
    if claim_type in {"workaround", "complaint", "pain"}:
        return [
            ("technical_change", ['"{entity}" release notes', '"{topic}" migration guide', 'inurl:docs "{topic}"']),
            ("industry_niche", ['"{topic}" analysis', '"{topic}" industry news']),
        ]
    return [
        ("authoritative_anchor", ['"{entity}" newsroom', '"{topic}" press releases']),
        ("report_research", ['"{topic}" report']),
    ]


def _templates_for_role(source_role: str) -> list[str]:
    if source_role == "technical_change":
        return ['"{entity}" release notes', '"{topic}" migration guide', 'inurl:docs "{topic}"']
    if source_role == "procurement_signal":
        return ['"{topic}" tender', '"{topic}" public procurement', '"{topic}" contract award']
    if source_role == "report_research":
        return ['"{topic}" report', '"{topic}" research']
    return ['"{entity}" official blog', '"{topic}" newsroom']


def _dedupe_hypotheses(hypotheses: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, str, str]] = set()
    result: list[dict[str, Any]] = []
    for item in hypotheses:
        key = (
            str(item.get("source_role") or ""),
            str(item.get("provider_id") or ""),
            str(item.get("query_text") or ""),
        )
        if key in seen:
            continue
        seen.add(key)
        result.append(item)
    return result
