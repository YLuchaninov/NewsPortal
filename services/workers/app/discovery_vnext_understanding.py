from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

from services.workers.app.discovery_vnext_artifacts import (
    validate_source_understanding,
    validation_json,
)
from services.workers.app.discovery_vnext_routing import clamp_score


SOURCE_VOICE_WEIGHTS = {
    "public_authority": 0.90,
    "owner_or_operator": 0.80,
    "aggregator_or_directory": 0.75,
    "community_or_ugc": 0.55,
    "third_party_commentary": 0.40,
    "seller_or_vendor": 0.20,
    "unknown": 0.35,
}

ARTIFACT_FRESHNESS_WEIGHTS = {
    "recurring_listing": 0.95,
    "recurring_feed": 0.90,
    "official_update": 0.80,
    "dataset_or_registry": 0.75,
    "community_thread": 0.55,
    "documentation_or_guide": 0.40,
    "evergreen_signal_candidate": 0.30,
    "static_service_page": 0.15,
    "unknown": 0.25,
}

SIGNAL_PRODUCTION_WEIGHTS = {
    "direct_event_feed": 0.95,
    "direct_request_or_listing": 0.95,
    "official_update": 0.80,
    "source_directory": 0.70,
    "precursor_context": 0.55,
    "secondary_context": 0.35,
    "unlikely": 0.10,
    "unknown": 0.25,
}


def synthesize_source_understanding(
    *,
    discovery_brief: dict[str, Any],
    probe_report: dict[str, Any],
    source_scope_resolution: dict[str, Any] | None = None,
    candidate: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = build_source_understanding_payload(
        discovery_brief=discovery_brief,
        probe_report=probe_report,
        source_scope_resolution=source_scope_resolution or {},
        candidate=candidate or {},
    )
    issues = validate_source_understanding(payload)
    return {
        "artifactType": "SourceUnderstanding",
        "schemaVersion": "2.0",
        "status": "validated" if not issues else "rejected",
        "payload": payload,
        "validation": validation_json(issues),
    }


def build_source_understanding_payload(
    *,
    discovery_brief: dict[str, Any],
    probe_report: dict[str, Any],
    source_scope_resolution: dict[str, Any],
    candidate: dict[str, Any],
) -> dict[str, Any]:
    scope_payload = (
        source_scope_resolution.get("payload")
        if isinstance(source_scope_resolution.get("payload"), dict)
        else source_scope_resolution
    )
    if not scope_payload:
        scope_payload = _fallback_scope_from_probe(probe_report, candidate)
    source_url = str(
        scope_payload.get("resolvedSourceUrl")
        or probe_report.get("candidateUrl")
        or candidate.get("canonicalUrl")
        or candidate.get("url")
        or ""
    )
    role_context = _role_context(probe_report, candidate, scope_payload)
    technical_observability_score = _technical_score(probe_report)
    technical_observability = _technical_observability(probe_report, scope_payload, technical_observability_score)
    access_pattern = str(probe_report.get("accessPattern") or "unknown")
    artifact_fit = _artifact_fit(discovery_brief, probe_report, role_context)
    evidence_directness = _evidence_directness(probe_report, role_context)
    risk = _risk(probe_report, scope_payload)
    signals = _signals(discovery_brief, probe_report, role_context, artifact_fit, technical_observability_score, risk)
    payload = {
        "candidateId": candidate.get("candidateId") or candidate.get("candidate_id"),
        "sourceUrl": source_url,
        "sourceScopeResolutionArtifactId": source_scope_resolution.get("artifact_id")
        or source_scope_resolution.get("artifactId"),
        "seedItemUrl": scope_payload.get("seedItemUrl"),
        "sourceScopeType": scope_payload.get("sourceScopeType") or "unknown",
        "sourceScopeEvidence": scope_payload.get("resolutionEvidence") or [],
        "sourceRoleDescription": _source_role_description(source_url, role_context),
        "sourceVoice": role_context["sourceVoice"],
        "sourceVoiceEvidence": _role_evidence("sourceVoice", role_context, scope_payload),
        "artifactProducingBehavior": _artifact_behavior(probe_report, role_context),
        "artifactFreshnessKind": role_context["artifactFreshnessKind"],
        "artifactFreshnessEvidence": _role_evidence("artifactFreshnessKind", role_context, scope_payload),
        "signalProductionMode": role_context["signalProductionMode"],
        "signalProductionEvidence": _role_evidence("signalProductionMode", role_context, scope_payload),
        "observedArtifactTypes": role_context["observedArtifactTypes"],
        "canProduceSignals": signals,
        "notExpectedToProduce": _not_expected_to_produce(discovery_brief, role_context),
        "negativeRoleEvidence": _negative_role_evidence(role_context, scope_payload),
        "artifactFit": artifact_fit,
        "technicalObservability": technical_observability,
        "evidenceDirectness": evidence_directness,
        "sourceRoleConfidence": role_context["sourceRoleConfidence"],
        "risk": risk,
        "routingConfidence": _routing_confidence(
            technical_observability_score,
            artifact_fit,
            evidence_directness,
            role_context["sourceRoleConfidence"],
            risk,
        ),
        "hardBlockers": [],
        "classificationUncertain": role_context["classificationUncertain"],
        "potentialHigh": role_context["potentialHigh"],
        "adapterRequired": _adapter_required(probe_report, access_pattern, scope_payload),
        "yieldIndependent": True,
        "reasonToKeep": _reason_to_keep(role_context),
        "reasonNotToAutoRegister": _reason_not_to_auto_register(role_context, access_pattern, risk),
        "accessPattern": access_pattern,
        "suggestedProviderType": _suggested_provider_type(candidate, probe_report, scope_payload),
        "probeSummary": _probe_summary(probe_report),
        "sourceScopeResolution": scope_payload,
    }
    hard_blocker = _hard_blocker(access_pattern, risk)
    if hard_blocker:
        payload["hardBlockers"] = [hard_blocker]
    return payload


def _signals(
    discovery_brief: dict[str, Any],
    probe_report: dict[str, Any],
    role_context: dict[str, Any],
    artifact_fit: float,
    technical_observability: float,
    risk: dict[str, Any],
) -> list[dict[str, Any]]:
    desired = [
        signal
        for signal in discovery_brief.get("desiredSignals", [])
        if isinstance(signal, dict)
    ]
    if not desired:
        desired = [{"description": "Relevant public source artifact", "directness": "contextual"}]
    evidence = _probe_evidence(probe_report)
    score = _capability_score(role_context, artifact_fit, technical_observability, risk)
    capability = _capability_label(score)
    directness = _directness_for_mode(role_context["signalProductionMode"])
    counter_evidence = _counter_evidence(role_context, probe_report)
    return [
        {
            "signalId": signal.get("signalId") or f"signal-{index + 1}",
            "signalDescription": str(signal.get("description") or "Relevant public source artifact"),
            "capability": capability,
            "capabilityScore": score,
            "directness": str(signal.get("directness") or directness),
            "reason": (
                "Capability is inferred from domain-neutral source voice, artifact freshness, "
                "signal production mode and bounded probe evidence."
            ),
            "evidenceFromProbe": evidence,
            "counterEvidence": counter_evidence,
        }
        for index, signal in enumerate(desired[:5])
    ]


def _fallback_scope_from_probe(probe_report: dict[str, Any], candidate: dict[str, Any]) -> dict[str, Any]:
    candidate_url = str(probe_report.get("candidateUrl") or candidate.get("canonicalUrl") or candidate.get("url") or "")
    observations = probe_report.get("observations") if isinstance(probe_report.get("observations"), list) else []
    technical = probe_report.get("technicalObservability") if isinstance(probe_report.get("technicalObservability"), dict) else {}
    valid_feed = bool(technical.get("feedValid")) or any(isinstance(item, dict) and item.get("valid") for item in observations)
    listing = any(isinstance(item, dict) and int(item.get("listingCountEstimate") or 0) > 0 for item in observations)
    scope_type = "feed" if valid_feed else "listing_page" if listing else "unknown"
    return {
        "candidateUrl": candidate_url,
        "canonicalCandidateUrl": candidate_url,
        "originalCandidateUrl": candidate_url,
        "resolvedSourceUrl": candidate_url,
        "sourceScopeType": scope_type,
        "sourceScopeConfidence": 0.65 if scope_type != "unknown" else 0.35,
        "seedItemUrl": None,
        "monitoringEntryUrls": [candidate_url] if candidate_url else [],
        "itemExtractionHints": {},
        "resolutionEvidence": ["Fallback scope inferred from probe evidence."],
        "normalizationEvidence": ["Fallback scope used probe candidate URL without resolver normalization."],
        "notMonitoringReason": None,
        "scopeCandidates": [],
        "warnings": ["fallback_scope_resolution_used"],
        "risk": {},
    }


def _probe_evidence(probe_report: dict[str, Any]) -> list[str]:
    evidence: list[str] = []
    technical = probe_report.get("technicalObservability")
    if isinstance(technical, dict) and technical.get("productiveFeed"):
        evidence.append("Fetchers feed probe observed a productive recurring feed.")
    elif isinstance(technical, dict) and technical.get("feedValid"):
        evidence.append("Fetchers feed probe observed parseable feed metadata without sample entries.")
    if isinstance(technical, dict) and technical.get("staticWebsiteSignals"):
        evidence.append("Fetchers website probe observed static source artifacts.")
    for artifact in probe_report.get("observedArtifacts") or []:
        if isinstance(artifact, dict):
            artifact_type = str(artifact.get("artifactType") or "artifact")
            if artifact.get("countEstimate") is not None:
                evidence.append(f"Probe observed {artifact_type} artifacts.")
    for observation in probe_report.get("observations") or []:
        if not isinstance(observation, dict):
            continue
        kind = str(observation.get("kind") or "probe")
        if observation.get("sampleEntryCount"):
            evidence.append(f"{kind} returned sample entries.")
        if observation.get("feedCount"):
            evidence.append(f"{kind} discovered feed links.")
        if observation.get("listingCountEstimate"):
            evidence.append(f"{kind} found listing-like resources.")
        if observation.get("documentCountEstimate"):
            evidence.append(f"{kind} found document-like resources.")
    if not evidence:
        evidence.append("Probe completed without source-owned parser duplication.")
    return list(dict.fromkeys(evidence))[:8]


def _artifact_fit(discovery_brief: dict[str, Any], probe_report: dict[str, Any], role_context: dict[str, Any]) -> float:
    expectations = {str(item) for item in discovery_brief.get("artifactExpectations") or []}
    observations = probe_report.get("observations") or []
    observed_types = set(role_context["observedArtifactTypes"])
    score = 0.25
    if expectations and expectations.intersection(observed_types):
        score = max(score, 0.78)
    if any(isinstance(item, dict) and int(item.get("sampleEntryCount") or 0) > 0 for item in observations):
        score = max(score, 0.82 if "signal_candidate" in expectations or "changelog" in expectations else 0.72)
    if any(isinstance(item, dict) and int(item.get("listingCountEstimate") or 0) > 0 for item in observations):
        score = max(score, 0.78 if "listing" in expectations else 0.62)
    if any(isinstance(item, dict) and int(item.get("documentCountEstimate") or 0) > 0 for item in observations):
        score = max(score, 0.78 if expectations.intersection({"document", "report", "dataset"}) else 0.58)
    if role_context["artifactFreshnessKind"] in {"static_service_page", "evergreen_signal_candidate"}:
        score = min(score, 0.42)
    if role_context["signalProductionMode"] == "unlikely":
        score = min(score, 0.28)
    return round(score, 2)


def _technical_score(probe_report: dict[str, Any]) -> float:
    technical = probe_report.get("technicalObservability")
    if isinstance(technical, dict):
        return round(clamp_score(technical.get("score")), 2)
    return 0.0


def _technical_observability(probe_report: dict[str, Any], scope_payload: dict[str, Any], score: float) -> dict[str, Any]:
    technical = probe_report.get("technicalObservability") if isinstance(probe_report.get("technicalObservability"), dict) else {}
    scope_type = str(scope_payload.get("sourceScopeType") or "unknown")
    access_pattern = str(probe_report.get("accessPattern") or "unknown")
    return {
        "score": score,
        "canPollCheaply": scope_type in {"feed", "listing_page", "section"} and access_pattern == "public",
        "hasStableUrls": bool(scope_payload.get("resolvedSourceUrl")),
        "hasDatesOrVersions": bool((scope_payload.get("itemExtractionHints") or {}).get("dateOrVersionObserved")),
        "hasListingsOrFeeds": scope_type in {"feed", "listing_page", "section", "document_collection"} or bool(technical.get("feedValid")),
        "requiresBrowser": access_pattern == "requires_browser",
        "requiresAuth": access_pattern in {"requires_auth", "captcha_blocked", "blocked"},
        "feedValid": bool(technical.get("feedValid")),
        "productiveFeed": bool(technical.get("productiveFeed")),
        "feedSampleEntryCount": int(technical.get("feedSampleEntryCount") or 0),
        "feedFinalUrl": technical.get("feedFinalUrl"),
        "feedDiagnostics": technical.get("feedDiagnostics") if isinstance(technical.get("feedDiagnostics"), list) else [],
        "observable": bool(technical.get("observable")) if "observable" in technical else score >= 0.35,
    }


def _evidence_directness(probe_report: dict[str, Any], role_context: dict[str, Any]) -> float:
    mode = str(role_context.get("signalProductionMode") or "unknown")
    if mode in {"direct_event_feed", "direct_request_or_listing"}:
        return 0.86
    if mode == "official_update":
        return 0.76
    if mode == "source_directory":
        return 0.66
    if mode == "secondary_context":
        return 0.35
    if mode == "unlikely":
        return 0.14
    if _technical_score(probe_report) >= 0.35:
        return 0.45
    return 0.2


def _capability_label(score: float) -> str:
    if score >= 0.75:
        return "high"
    if score >= 0.50:
        return "medium"
    if score >= 0.25:
        return "low"
    return "unknown"


def _risk(probe_report: dict[str, Any], source_scope_resolution: dict[str, Any] | None = None) -> dict[str, Any]:
    access_pattern = str(probe_report.get("accessPattern") or "unknown")
    provider_failures = probe_report.get("providerFailures") if isinstance(probe_report.get("providerFailures"), list) else []
    scope_risk = source_scope_resolution.get("risk") if isinstance(source_scope_resolution, dict) and isinstance(source_scope_resolution.get("risk"), dict) else {}
    if access_pattern == "captcha_blocked":
        return {
            **scope_risk,
            "overallRisk": "high",
            "riskScore": 0.9,
            "authOrCaptchaRisk": "high",
            "providerFailureCount": len(provider_failures),
        }
    if access_pattern == "blocked":
        return {
            **scope_risk,
            "overallRisk": "high",
            "riskScore": 0.95,
            "authOrCaptchaRisk": "high",
            "providerFailureCount": len(provider_failures),
        }
    if access_pattern == "requires_auth":
        return {
            **scope_risk,
            "overallRisk": "medium",
            "riskScore": 0.55,
            "authOrCaptchaRisk": "medium",
            "providerFailureCount": len(provider_failures),
        }
    if access_pattern == "requires_browser":
        return {
            **scope_risk,
            "overallRisk": "medium",
            "riskScore": 0.45,
            "authOrCaptchaRisk": "low",
            "providerFailureCount": len(provider_failures),
        }
    return {
        **scope_risk,
        "overallRisk": "low" if _technical_score(probe_report) >= 0.35 else "unknown",
        "riskScore": 0.2 if _technical_score(probe_report) >= 0.35 else 0.5,
        "authOrCaptchaRisk": "low",
        "providerFailureCount": len(provider_failures),
    }


def _routing_confidence(
    technical_observability: float,
    artifact_fit: float,
    evidence_directness: float,
    source_role_confidence: float,
    risk: dict[str, Any],
) -> float:
    risk_drag = clamp_score(risk.get("riskScore")) * 0.20
    confidence = (technical_observability + artifact_fit + evidence_directness + source_role_confidence) / 4
    return round(max(0.0, min(1.0, confidence - risk_drag + 0.12)), 2)


def _role_evidence(kind: str, role_context: dict[str, Any], scope_payload: dict[str, Any]) -> list[str]:
    value = str(role_context.get(kind) or "unknown")
    evidence = [f"{kind} classified as {value} from structural probe and source-scope evidence."]
    for item in scope_payload.get("resolutionEvidence") or []:
        if isinstance(item, str) and item:
            evidence.append(item)
            break
    return evidence


def _source_role_description(source_url: str, role_context: dict[str, Any]) -> str:
    host = urlparse(source_url).hostname or "source"
    voice = str(role_context["sourceVoice"]).replace("_", " ")
    freshness = str(role_context["artifactFreshnessKind"]).replace("_", " ")
    mode = str(role_context["signalProductionMode"]).replace("_", " ")
    return f"{host} appears to be a {voice} source with {freshness} artifacts and {mode} signal production."


def _artifact_behavior(probe_report: dict[str, Any], role_context: dict[str, Any]) -> str:
    summary = _probe_summary(probe_report)
    behaviors = []
    if summary["productiveFeed"]:
        behaviors.append("valid feed entries")
    elif summary["validFeed"]:
        behaviors.append("parseable feed metadata")
    if summary["listingSignals"]:
        behaviors.append("listing resources")
    if summary["documentSignals"]:
        behaviors.append("document resources")
    behaviors.extend(str(item) for item in role_context["observedArtifactTypes"] if item != "unknown")
    return ", ".join(dict.fromkeys(behaviors)) if behaviors else "observable source metadata"


def _probe_summary(probe_report: dict[str, Any]) -> dict[str, Any]:
    observations = probe_report.get("observations") if isinstance(probe_report.get("observations"), list) else []
    feed_observations = [item for item in observations if isinstance(item, dict) and item.get("kind") == "feed_probe"]
    feed_sample_entry_count = sum(int(item.get("sampleEntryCount") or 0) for item in feed_observations)
    technical = probe_report.get("technicalObservability") if isinstance(probe_report.get("technicalObservability"), dict) else {}
    return {
        "validFeed": any(isinstance(item, dict) and item.get("valid") for item in feed_observations),
        "productiveFeed": feed_sample_entry_count > 0,
        "feedSampleEntryCount": feed_sample_entry_count,
        "feedFinalUrl": _first_observation_value(feed_observations, "finalUrl", "feedUrl", "url") or technical.get("feedFinalUrl"),
        "feedDiagnostics": _feed_diagnostics(feed_observations, technical),
        "listingSignals": any(isinstance(item, dict) and int(item.get("listingCountEstimate") or 0) > 0 for item in observations),
        "documentSignals": any(isinstance(item, dict) and int(item.get("documentCountEstimate") or 0) > 0 for item in observations),
        "observedArtifacts": probe_report.get("observedArtifacts") if isinstance(probe_report.get("observedArtifacts"), list) else [],
        "pageRoleHints": _page_role_hints(probe_report),
        "discoveredFeedUrls": _discovered_feed_urls(probe_report),
        "accessPattern": probe_report.get("accessPattern") or "unknown",
        "browserProbeAttempted": bool(probe_report.get("browserProbeAttempted")),
    }


def _first_observation_value(observations: list[dict[str, Any]], *keys: str) -> str | None:
    for observation in observations:
        for key in keys:
            value = observation.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return None


def _feed_diagnostics(observations: list[dict[str, Any]], technical: dict[str, Any]) -> list[Any]:
    diagnostics: list[Any] = []
    for observation in observations:
        raw = observation.get("diagnostics")
        if isinstance(raw, list):
            diagnostics.extend(raw)
    raw_technical = technical.get("feedDiagnostics")
    if isinstance(raw_technical, list):
        diagnostics.extend(raw_technical)
    return diagnostics[:10]


def _suggested_provider_type(candidate: dict[str, Any], probe_report: dict[str, Any], source_scope_resolution: dict[str, Any] | None = None) -> str:
    scope_type = str((source_scope_resolution or {}).get("sourceScopeType") or "")
    if scope_type == "feed":
        return "rss"
    if scope_type == "api_endpoint":
        return "api"
    if scope_type == "document_collection":
        return "document_portal"
    candidate_guess = str(candidate.get("candidateKindGuess") or candidate.get("providerType") or "").strip()
    observations = probe_report.get("observations") if isinstance(probe_report.get("observations"), list) else []
    if any(isinstance(item, dict) and item.get("valid") for item in observations):
        return "rss"
    if candidate_guess == "api":
        return "api"
    if _technical_score(probe_report) >= 0.35 or _discovered_feed_urls(probe_report):
        return "website"
    if candidate_guess == "document":
        return "document_portal"
    if candidate_guess in {"website", "api", "document_portal", "unknown"} and candidate_guess != "unknown":
        return candidate_guess
    return "unknown"


def _not_expected_to_produce(discovery_brief: dict[str, Any], role_context: dict[str, Any]) -> list[dict[str, Any]]:
    negatives = [
        {"description": str(item.get("description") or item)}
        for item in discovery_brief.get("negativeSignals") or []
        if isinstance(item, dict) or str(item).strip()
    ]
    if role_context["signalProductionMode"] in {"secondary_context", "unlikely"}:
        negatives.append(
            {
                "reason": "The source role is structurally unlikely to produce primary desired events.",
                "signalProductionMode": role_context["signalProductionMode"],
            }
        )
    return negatives[:5]


def _negative_role_evidence(role_context: dict[str, Any], source_scope_resolution: dict[str, Any]) -> list[str]:
    evidence: list[str] = []
    scope_type = str(source_scope_resolution.get("sourceScopeType") or "unknown")
    if scope_type in {"single_item", "context_page"}:
        evidence.append(f"{scope_type} scopes are evidence or context, not recurring source channels.")
    if role_context["sourceVoice"] in {"seller_or_vendor", "third_party_commentary"}:
        evidence.append(f"{role_context['sourceVoice']} voice is not authoritative enough for auto-registration.")
    if role_context["artifactFreshnessKind"] in {"static_service_page", "evergreen_signal_candidate", "documentation_or_guide"}:
        evidence.append("Static/evergreen artifacts are useful context but weak recurring signal sources.")
    return evidence[:5]


def _hard_blocker(access_pattern: str, risk: dict[str, Any]) -> str | None:
    if access_pattern == "captcha_blocked":
        return "unsupported_auth_or_captcha"
    if access_pattern == "blocked":
        return "unusable_access"
    if clamp_score(risk.get("riskScore")) >= 0.9:
        return "hard_blocker"
    return None


def _role_context(probe_report: dict[str, Any], candidate: dict[str, Any], source_scope_resolution: dict[str, Any] | None = None) -> dict[str, Any]:
    hints = _page_role_hints(probe_report)
    observed_types = _observed_artifact_types(probe_report)
    source_voice = _source_voice(hints, probe_report, candidate)
    freshness = _artifact_freshness(hints, observed_types, probe_report)
    production_mode = _signal_production_mode(source_voice, freshness, hints, probe_report)
    scope_type = str((source_scope_resolution or {}).get("sourceScopeType") or "unknown")
    if scope_type in {"single_item", "context_page"}:
        production_mode = "secondary_context" if source_voice != "seller_or_vendor" else "unlikely"
        if scope_type == "context_page":
            freshness = "static_service_page" if source_voice == "seller_or_vendor" else freshness
    if scope_type == "api_endpoint":
        freshness = "dataset_or_registry"
        production_mode = "source_directory"
    if scope_type == "document_collection":
        freshness = "documentation_or_guide"
    confidence = _source_role_confidence(hints, observed_types, probe_report)
    return {
        "sourceVoice": source_voice,
        "artifactFreshnessKind": freshness,
        "signalProductionMode": production_mode,
        "observedArtifactTypes": observed_types,
        "sourceRoleConfidence": confidence,
        "classificationUncertain": confidence < 0.45 or source_voice == "unknown" or production_mode == "unknown",
        "potentialHigh": production_mode in {"direct_event_feed", "direct_request_or_listing", "official_update", "source_directory"},
    }


def _page_role_hints(probe_report: dict[str, Any]) -> dict[str, bool]:
    merged: dict[str, bool] = {}
    hints = probe_report.get("pageRoleHints")
    if isinstance(hints, dict):
        merged.update({str(key): bool(value) for key, value in hints.items()})
    for artifact in probe_report.get("observedArtifacts") or []:
        if isinstance(artifact, dict) and isinstance(artifact.get("pageRoleHints"), dict):
            merged.update({str(key): bool(value) for key, value in artifact["pageRoleHints"].items()})
    for observation in probe_report.get("observations") or []:
        if not isinstance(observation, dict):
            continue
        classification = observation.get("classification") if isinstance(observation.get("classification"), dict) else {}
        role_hints = classification.get("pageRoleHints") if isinstance(classification.get("pageRoleHints"), dict) else {}
        merged.update({str(key): bool(value) for key, value in role_hints.items()})
    return merged


def _observed_artifact_types(probe_report: dict[str, Any]) -> list[str]:
    observed: list[str] = []
    for artifact in probe_report.get("observedArtifacts") or []:
        if isinstance(artifact, dict) and str(artifact.get("artifactType") or "").strip():
            observed.append(str(artifact["artifactType"]))
    for observation in probe_report.get("observations") or []:
        if not isinstance(observation, dict):
            continue
        if int(observation.get("sampleEntryCount") or 0) > 0:
            observed.append("signal_candidate")
        if int(observation.get("listingCountEstimate") or 0) > 0:
            observed.append("listing")
        if int(observation.get("documentCountEstimate") or 0) > 0:
            observed.append("document")
        classification = observation.get("classification") if isinstance(observation.get("classification"), dict) else {}
        for item in classification.get("artifactTypes") or []:
            if isinstance(item, str):
                observed.append(item)
    if not observed and _technical_score(probe_report) >= 0.35:
        observed.append("unknown")
    return list(dict.fromkeys(observed))[:8] or ["unknown"]


def _source_voice(hints: dict[str, bool], probe_report: dict[str, Any], candidate: dict[str, Any]) -> str:
    url_text = " ".join(
        str(value or "")
        for value in (
            probe_report.get("candidateUrl"),
            candidate.get("canonicalUrl"),
            candidate.get("title"),
            candidate.get("snippet"),
        )
    ).lower()
    if hints.get("publicAuthorityLikely") or _host_matches(url_text, (".gov", ".gob", ".europa.eu", ".int", ".edu")):
        return "public_authority"
    if hints.get("sellerOrVendorLikely") or any(token in url_text for token in ("pricing", "services", "solutions", "demo", "consulting")):
        return "seller_or_vendor"
    if hints.get("aggregatorOrDirectoryLikely"):
        return "aggregator_or_directory"
    if hints.get("communityOrUgcLikely"):
        return "community_or_ugc"
    if hints.get("secondaryExplainerLikely") or hints.get("staticEvergreenLikely"):
        return "third_party_commentary"
    if hints.get("officialOwnerLikely"):
        return "owner_or_operator"
    return "unknown"


def _artifact_freshness(hints: dict[str, bool], observed_types: list[str], probe_report: dict[str, Any]) -> str:
    technical = probe_report.get("technicalObservability") if isinstance(probe_report.get("technicalObservability"), dict) else {}
    if technical.get("productiveFeed"):
        return "recurring_feed"
    if hints.get("recurringListingLikely") or "listing" in observed_types:
        return "recurring_listing"
    if hints.get("datasetOrRegistryLikely") or "dataset" in observed_types or "registry_entry" in observed_types:
        return "dataset_or_registry"
    if hints.get("communityOrUgcLikely") or "thread" in observed_types:
        return "community_thread"
    if hints.get("officialOwnerLikely") or hints.get("publicAuthorityLikely"):
        return "official_update"
    if hints.get("sellerOrVendorLikely"):
        return "static_service_page"
    if hints.get("staticEvergreenLikely"):
        return "evergreen_signal_candidate"
    if "document" in observed_types:
        return "documentation_or_guide"
    return "unknown"


def _signal_production_mode(source_voice: str, freshness: str, hints: dict[str, bool], probe_report: dict[str, Any]) -> str:
    technical = probe_report.get("technicalObservability") if isinstance(probe_report.get("technicalObservability"), dict) else {}
    if technical.get("productiveFeed") and freshness == "recurring_feed":
        return "direct_event_feed"
    if freshness == "recurring_listing":
        return "direct_request_or_listing"
    if freshness == "official_update" or source_voice == "public_authority":
        return "official_update"
    if freshness == "dataset_or_registry" or source_voice == "aggregator_or_directory":
        return "source_directory"
    if source_voice == "community_or_ugc" or freshness == "community_thread":
        return "precursor_context"
    if source_voice in {"seller_or_vendor", "third_party_commentary"} and freshness in {"static_service_page", "evergreen_signal_candidate", "documentation_or_guide"}:
        return "secondary_context" if source_voice == "third_party_commentary" else "unlikely"
    if hints.get("secondaryExplainerLikely"):
        return "secondary_context"
    return "unknown"


def _source_role_confidence(hints: dict[str, bool], observed_types: list[str], probe_report: dict[str, Any]) -> float:
    true_hints = sum(1 for value in hints.values() if value)
    score = 0.25 + min(0.35, true_hints * 0.10)
    if observed_types and observed_types != ["unknown"]:
        score += 0.20
    score += min(0.20, _technical_score(probe_report) * 0.20)
    return round(clamp_score(score), 2)


def _capability_score(role_context: dict[str, Any], artifact_fit: float, technical_observability: float, risk: dict[str, Any]) -> float:
    score = (
        SIGNAL_PRODUCTION_WEIGHTS.get(role_context["signalProductionMode"], 0.25) * 0.35
        + ARTIFACT_FRESHNESS_WEIGHTS.get(role_context["artifactFreshnessKind"], 0.25) * 0.20
        + SOURCE_VOICE_WEIGHTS.get(role_context["sourceVoice"], 0.35) * 0.15
        + artifact_fit * 0.15
        + technical_observability * 0.10
        + role_context["sourceRoleConfidence"] * 0.05
    )
    risk_penalty = clamp_score(risk.get("riskScore")) * 0.18
    return round(clamp_score(score - risk_penalty), 2)


def _directness_for_mode(mode: str) -> str:
    if mode in {"direct_event_feed", "direct_request_or_listing", "official_update"}:
        return "direct"
    if mode == "precursor_context":
        return "precursor"
    return "contextual"


def _counter_evidence(role_context: dict[str, Any], probe_report: dict[str, Any]) -> list[str]:
    evidence: list[str] = []
    if role_context["signalProductionMode"] in {"secondary_context", "unlikely"}:
        evidence.append("Source role is context-only or structurally unlikely to produce primary events.")
    if role_context["artifactFreshnessKind"] in {"static_service_page", "evergreen_signal_candidate"}:
        evidence.append("Observed artifact freshness is static/evergreen rather than recurring.")
    if probe_report.get("accessPattern") in {"requires_auth", "captcha_blocked", "blocked"}:
        evidence.append("Access pattern prevents safe automatic monitoring.")
    return evidence


def _reason_to_keep(role_context: dict[str, Any]) -> str:
    mode = role_context["signalProductionMode"]
    if mode in {"secondary_context", "unlikely"}:
        return "Retain as context/query-expansion inventory without treating it as an active signal channel."
    if mode in {"direct_event_feed", "direct_request_or_listing", "official_update", "source_directory"}:
        return "Retain because source role and artifact shape can plausibly produce interest-conditioned public signals."
    return "Retain as inventory until more probe or operator evidence clarifies source role."


def _reason_not_to_auto_register(role_context: dict[str, Any], access_pattern: str, risk: dict[str, Any]) -> str:
    if access_pattern != "public":
        return f"Access pattern is {access_pattern}, so automatic channel registration is unsafe."
    if role_context["sourceVoice"] in {"seller_or_vendor", "third_party_commentary"}:
        return "Source voice is context/vendor/commentary, not an eligible primary signal producer."
    if role_context["signalProductionMode"] in {"secondary_context", "unlikely", "unknown"}:
        return "Signal production mode is not eligible for automatic channel registration."
    if role_context["artifactFreshnessKind"] in {"static_service_page", "evergreen_signal_candidate", "documentation_or_guide", "unknown"}:
        return "Artifact freshness does not prove recurring or official-update monitoring value."
    if clamp_score(risk.get("riskScore")) > 0.35:
        return "Risk score exceeds automatic registration limit."
    return "No source-mode blocker; automatic registration still depends on routing policy thresholds and provider validation."


def _adapter_required(probe_report: dict[str, Any], access_pattern: str, source_scope_resolution: dict[str, Any] | None = None) -> bool:
    scope_type = str((source_scope_resolution or {}).get("sourceScopeType") or "")
    candidate_url = str((source_scope_resolution or {}).get("candidateUrl") or probe_report.get("candidateUrl") or "").lower()
    return scope_type in {"api_endpoint", "document_collection"} or candidate_url.endswith((".pdf", ".doc", ".docx", ".xls", ".xlsx")) or access_pattern in {"requires_auth", "requires_browser"} or any(
        isinstance(item, dict) and item.get("adapterRequired")
        for item in probe_report.get("observations") or []
    )


def _discovered_feed_urls(probe_report: dict[str, Any]) -> list[str]:
    urls: list[str] = []
    for result in probe_report.get("websiteResults") or []:
        if isinstance(result, dict):
            urls.extend(str(item) for item in result.get("discovered_feed_urls") or [] if str(item).strip())
    for observation in probe_report.get("observations") or []:
        if isinstance(observation, dict):
            urls.extend(str(item) for item in observation.get("discoveredFeedUrls") or [] if str(item).strip())
    return list(dict.fromkeys(urls))[:10]


def _host_matches(text: str, suffixes: tuple[str, ...]) -> bool:
    if "://" in text:
        try:
            host = urlparse(text).hostname or ""
        except ValueError:
            host = text
    else:
        host = text
    return any(host.endswith(suffix) or suffix in host for suffix in suffixes)
