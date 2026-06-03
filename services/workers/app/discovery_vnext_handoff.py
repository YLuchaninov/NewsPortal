from __future__ import annotations

from typing import Any, Protocol


class SourceRegistrar(Protocol):
    def register_sources(
        self,
        *,
        sources: list[dict[str, Any]],
        enabled: bool,
        dry_run: bool,
        created_by: str | None,
        tags: list[str],
        provider_type: str,
    ) -> list[dict[str, Any]]: ...


def build_probation_source_candidate(
    *,
    source_understanding: dict[str, Any],
    routing_decision: dict[str, Any],
    provider_type: str | None = None,
    created_by: str = "api",
) -> dict[str, Any]:
    selected_provider_type = provider_type or _provider_type_from_decision(source_understanding, routing_decision)
    decision = str(routing_decision.get("decision") or "auto_register_probation")
    trust_stage = "cheap_watch" if decision == "cheap_watch" else "probation"
    source_url = str(source_understanding.get("sourceUrl") or "").strip()
    probe_summary = (
        source_understanding.get("probeSummary")
        if isinstance(source_understanding.get("probeSummary"), dict)
        else {}
    )
    return {
        "url": source_url,
        "source_url": source_url,
        "provider_type": selected_provider_type,
        "title": source_understanding.get("sourceRoleDescription") or source_url,
        "created_by": created_by,
        "tags": ["discovery-vnext", trust_stage, selected_provider_type],
        "poll_interval_seconds": 1800 if selected_provider_type == "rss" else 3600,
        "evaluation_json": {
            "sourceUnderstanding": source_understanding,
            "routingDecision": routing_decision,
            "probeSummary": probe_summary,
            "discovered_feed_urls": _discovered_feed_urls(source_understanding),
        },
        "discovered_feed_urls": _discovered_feed_urls(source_understanding),
        "discovery": {
            "version": "vnext-1",
            "trustStage": trust_stage,
            "coverageContribution": 0.15 if trust_stage == "cheap_watch" else 0.25,
            "downstreamWeight": 0.2 if trust_stage == "cheap_watch" else 0.3,
            "evidenceContract": {
                "sourceRole": source_understanding.get("sourceRoleDescription"),
                "signalMode": _signal_mode(source_understanding),
                "artifactProducingBehavior": source_understanding.get("artifactProducingBehavior"),
                "yieldIndependent": True,
            },
            "routingDecision": routing_decision.get("decision"),
            "routingPolicyVersion": routing_decision.get("policyVersion"),
        },
    }


def apply_probation_handoff(
    *,
    source_understanding: dict[str, Any],
    routing_decision: dict[str, Any],
    registrar: SourceRegistrar,
    provider_type: str | None = None,
    created_by: str = "api",
    dry_run: bool = False,
) -> dict[str, Any]:
    decision = str(routing_decision.get("decision") or "")
    if decision not in {"auto_register_probation", "cheap_watch"}:
        return {
            "status": "skipped",
            "reason": "routing_decision_is_not_registerable_watch",
            "registrarResults": [],
        }
    selected_provider_type = provider_type or _provider_type_from_decision(source_understanding, routing_decision)
    guard = _handoff_guard(source_understanding, routing_decision, selected_provider_type)
    if guard:
        return {
            "status": "skipped",
            "reason": guard,
            "registrarResults": [],
        }
    source = build_probation_source_candidate(
        source_understanding=source_understanding,
        routing_decision=routing_decision,
        provider_type=selected_provider_type,
        created_by=created_by,
    )
    selected_provider_type = str(source["provider_type"])
    trust_stage = str(source.get("discovery", {}).get("trustStage") or "probation")
    results = registrar.register_sources(
        sources=[source],
        enabled=True,
        dry_run=dry_run,
        created_by=created_by,
        tags=["discovery-vnext", trust_stage, selected_provider_type],
        provider_type=selected_provider_type,
    )
    return {
        "status": "applied" if results else "no_result",
        "reason": "registered_through_source_registrar_outbox_path",
        "sourceCandidate": source,
        "registrarResults": results,
    }


def _provider_type_from_decision(source_understanding: dict[str, Any], routing_decision: dict[str, Any]) -> str:
    for action in routing_decision.get("actions") or []:
        if isinstance(action, dict) and str(action.get("providerType") or "").strip():
            return str(action["providerType"])
    provider_type = str(source_understanding.get("suggestedProviderType") or "website").strip()
    return provider_type if provider_type in {"rss", "website", "api", "email_imap"} else "website"


def _handoff_guard(
    source_understanding: dict[str, Any],
    routing_decision: dict[str, Any],
    provider_type: str,
) -> str | None:
    summary = source_understanding.get("probeSummary") if isinstance(source_understanding.get("probeSummary"), dict) else {}
    access_pattern = str(source_understanding.get("accessPattern") or "unknown")
    source_voice = str(source_understanding.get("sourceVoice") or "unknown")
    mode = str(source_understanding.get("signalProductionMode") or "unknown")
    freshness = str(source_understanding.get("artifactFreshnessKind") or "unknown")
    decision = str(routing_decision.get("decision") or "")
    if access_pattern != "public":
        return "access_pattern_not_public"
    if provider_type == "rss" and summary.get("validFeed") is not True:
        return "rss_feed_not_validated"
    if decision == "cheap_watch" and routing_decision.get("allowChannelCreation") is not True:
        return "cheap_watch_channel_creation_not_enabled"
    if decision == "auto_register_probation":
        if source_voice in {"seller_or_vendor", "third_party_commentary"}:
            return "source_voice_not_auto_register_eligible"
        if mode not in {"direct_event_feed", "direct_request_or_listing", "official_update", "source_directory"}:
            return "signal_production_mode_not_auto_register_eligible"
        if freshness not in {"recurring_listing", "recurring_feed", "official_update", "dataset_or_registry"}:
            return "artifact_freshness_not_auto_register_eligible"
    return None


def _discovered_feed_urls(source_understanding: dict[str, Any]) -> list[str]:
    summary = source_understanding.get("probeSummary")
    if not isinstance(summary, dict):
        return []
    values = summary.get("discoveredFeedUrls") or summary.get("discovered_feed_urls") or []
    return [str(item) for item in values if isinstance(item, str) and item.strip()]


def _signal_mode(source_understanding: dict[str, Any]) -> str:
    for signal in source_understanding.get("canProduceSignals") or []:
        if isinstance(signal, dict) and str(signal.get("directness") or "").strip():
            return str(signal["directness"])
    return "contextual"
