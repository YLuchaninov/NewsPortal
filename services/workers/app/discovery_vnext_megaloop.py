from __future__ import annotations

from hashlib import sha256
from typing import Any

from services.workers.app.discovery_vnext_artifacts import (
    validate_hypothesis_batch,
    validation_json,
)


UNIVERSAL_LENSES = [
    "official_owners",
    "registries_and_directories",
    "documents_and_reports",
    "datasets_and_apis",
    "announcements_and_newsrooms",
    "change_logs_and_updates",
    "public_discussions",
    "marketplaces_and_listings",
    "local_language_forms",
    "weird_public_artifacts",
    "adversarial_missing_sources",
]

DEFAULT_GENERATOR_CONFIGS = [
    {"memoryMode": "blind", "lens": "official_owners"},
    {"memoryMode": "thin", "lens": "registries_and_directories"},
    {"memoryMode": "gap_only", "lens": "documents_and_reports"},
    {"memoryMode": "artifact_lens", "lens": "datasets_and_apis"},
    {"memoryMode": "thin", "lens": "announcements_and_newsrooms"},
    {"memoryMode": "gap_only", "lens": "change_logs_and_updates"},
    {"memoryMode": "adversarial", "lens": "public_discussions"},
    {"memoryMode": "artifact_lens", "lens": "marketplaces_and_listings"},
    {"memoryMode": "locale", "lens": "local_language_forms"},
    {"memoryMode": "adversarial", "lens": "weird_public_artifacts"},
    {"memoryMode": "adversarial", "lens": "adversarial_missing_sources"},
]

LENS_ARTIFACTS = {
    "official_owners": ["signal_candidate", "listing", "document"],
    "registries_and_directories": ["registry_entry", "listing", "profile"],
    "documents_and_reports": ["document", "report", "listing"],
    "datasets_and_apis": ["dataset", "registry_entry", "unknown"],
    "announcements_and_newsrooms": ["signal_candidate", "changelog", "listing"],
    "change_logs_and_updates": ["changelog", "signal_candidate", "registry_entry"],
    "public_discussions": ["thread", "profile", "signal_candidate"],
    "marketplaces_and_listings": ["listing", "profile", "unknown"],
    "local_language_forms": ["listing", "document", "registry_entry"],
    "weird_public_artifacts": ["unknown", "dataset", "document"],
    "adversarial_missing_sources": ["unknown", "listing", "dataset"],
}


def run_mega_loop_preview(
    discovery_brief: dict[str, Any],
    *,
    max_batches: int = 5,
    coverage_policy: dict[str, Any] | None = None,
    adaptive_policy: dict[str, Any] | None = None,
    locale: str | None = None,
    previous_hypotheses: list[dict[str, Any]] | None = None,
    source_inventory: list[dict[str, Any]] | None = None,
    feedback_events: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    if not [
        signal
        for signal in discovery_brief.get("desiredSignals", [])
        if isinstance(signal, dict)
    ]:
        return {
            "artifactType": "HypothesisMegaLoopPreview",
            "status": "failed",
            "error": {
                "code": "brief_missing_desired_signals",
                "message": "DiscoveryBrief must include non-empty desiredSignals before MegaLoop can generate HypothesisBatch artifacts.",
            },
            "batches": [],
            "comparison": {"missingLenses": [], "warnings": []},
            "coveragePolicy": _coverage_policy(max_batches=max_batches, requested=coverage_policy),
            "adaptivePolicy": _adaptive_policy(adaptive_policy),
            "warnings": [
                {
                    "code": "brief_missing_desired_signals",
                    "message": "DiscoveryBrief must include non-empty desiredSignals.",
                }
            ],
            "limits": {
                "maxBatches": max_batches,
                "actualBatches": 0,
                "liveProviderExecution": False,
            },
        }
    coverage_policy = _coverage_policy(max_batches=max_batches, requested=coverage_policy)
    adaptive_policy = _adaptive_policy(adaptive_policy)
    required_lenses = [lens for lens in coverage_policy["requiredLensCoverage"] if lens in UNIVERSAL_LENSES]
    config_by_lens = {config["lens"]: config for config in DEFAULT_GENERATOR_CONFIGS}
    configs = [config_by_lens[lens] for lens in required_lenses if lens in config_by_lens]
    configs = configs[: max(1, min(max_batches, len(configs)))]
    batches = [
        generate_hypothesis_batch(discovery_brief, config["memoryMode"], config["lens"], locale=locale)
        for config in configs
    ]
    comparison = compare_hypothesis_batches(
        [batch["payload"] for batch in batches],
        previous_hypotheses=previous_hypotheses,
        source_inventory=source_inventory,
        feedback_events=feedback_events,
    )
    executed_lenses = {str(batch.get("lens") or batch.get("payload", {}).get("lens") or "") for batch in batches}
    missing_lenses = [lens for lens in coverage_policy["requiredLensCoverage"] if lens not in executed_lenses]
    warnings = []
    if missing_lenses:
        warnings.append(
            {
                "code": "missing_required_lenses",
                "message": "MegaLoop budget ended before all universal lenses executed.",
                "missingLenses": missing_lenses,
            }
        )
    return {
        "artifactType": "HypothesisMegaLoopPreview",
        "status": "completed_with_coverage_gap" if missing_lenses else "completed",
        "batches": batches,
        "comparison": {**comparison, "missingLenses": missing_lenses, "warnings": warnings},
        "coveragePolicy": coverage_policy,
        "adaptivePolicy": adaptive_policy,
        "warnings": warnings,
        "limits": {
            "maxBatches": max_batches,
            "actualBatches": len(batches),
            "liveProviderExecution": False,
        },
    }


def _coverage_policy(*, max_batches: int, requested: dict[str, Any] | None = None) -> dict[str, Any]:
    requested = requested if isinstance(requested, dict) else {}
    required = requested.get("requiredLensCoverage") if isinstance(requested.get("requiredLensCoverage"), list) else UNIVERSAL_LENSES
    return {
        "loopStrategy": "universal_broad_coverage",
        "requiredLensCoverage": [str(lens) for lens in required],
        "minHypothesesPerLens": int(requested.get("minHypothesesPerLens") or 5),
        "minQueriesPerHypothesis": int(requested.get("minQueriesPerHypothesis") or 3),
        "minProbeCandidatesPerLens": int(requested.get("minProbeCandidatesPerLens") or 5),
        "maxBatches": max_batches,
    }


def _adaptive_policy(requested: dict[str, Any] | None = None) -> dict[str, Any]:
    requested = requested if isinstance(requested, dict) else {}
    return {
        "allocateExtraBudgetTo": requested.get("allocateExtraBudgetTo")
        if isinstance(requested.get("allocateExtraBudgetTo"), list)
        else ["highNovelty", "highSourceScopeConfidence", "underCoveredLens", "highQueryQuality", "adapterBacklogOpportunity"],
        "stopWhen": requested.get("stopWhen")
        if isinstance(requested.get("stopWhen"), list)
        else ["lowNoveltyAcrossThreeBatches", "mostlyDuplicateCandidates", "mostlyBlockedOrContextOnly", "budgetExhausted"],
    }


def generate_hypothesis_batch(
    discovery_brief: dict[str, Any],
    memory_mode: str,
    lens: str,
    *,
    locale: str | None = None,
) -> dict[str, Any]:
    desired_signals = [
        signal
        for signal in discovery_brief.get("desiredSignals", [])
        if isinstance(signal, dict)
    ]
    artifacts = LENS_ARTIFACTS.get(lens, ["unknown"])
    query_terms = _query_terms(discovery_brief, lens, locale)
    hypotheses = _hypotheses_for_lens(
        discovery_brief=discovery_brief,
        desired_signals=desired_signals,
        artifacts=artifacts,
        memory_mode=memory_mode,
        lens=lens,
        locale=locale,
        query_terms=query_terms,
    )
    payload = {
        "batchId": _stable_id("batch", memory_mode, lens, locale or ""),
        "memoryMode": memory_mode,
        "lens": lens,
        "briefArtifactId": discovery_brief.get("artifactId"),
        "hypotheses": hypotheses,
    }
    issues = validate_hypothesis_batch(payload)
    return {
        "artifactType": "HypothesisBatch",
        "schemaVersion": "1.0",
        "status": "validated" if not issues else "rejected",
        "memoryMode": memory_mode,
        "lens": lens,
        "payload": payload,
        "validation": validation_json(issues),
    }


def compare_hypothesis_batches(
    batches: list[dict[str, Any]],
    *,
    previous_hypotheses: list[dict[str, Any]] | None = None,
    source_inventory: list[dict[str, Any]] | None = None,
    feedback_events: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    seen: dict[str, dict[str, Any]] = {}
    accepted: list[dict[str, Any]] = []
    duplicates: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    historical_keys = {_hypothesis_key(item) for item in previous_hypotheses or [] if isinstance(item, dict)}
    noisy_keys = _noisy_hypothesis_keys(feedback_events or [])
    inventory_domains = {
        str(item.get("canonical_domain") or item.get("canonicalDomain") or "")
        for item in source_inventory or []
        if isinstance(item, dict)
    }
    for batch in batches:
        for hypothesis in batch.get("hypotheses", []):
            if not isinstance(hypothesis, dict):
                continue
            key = _hypothesis_key(hypothesis)
            if key in noisy_keys:
                rejected.append(
                    {
                        "hypothesisId": hypothesis.get("hypothesisId"),
                        "memoryMode": batch.get("memoryMode"),
                        "lens": batch.get("lens"),
                        "status": "rejected",
                        "reasonCode": "operator_noisy_feedback",
                        "reason": "operator feedback marked similar hypothesis noisy",
                    }
                )
                continue
            if key in seen:
                duplicates.append(
                    {
                        "hypothesisId": hypothesis.get("hypothesisId"),
                        "duplicateOf": seen[key].get("hypothesisId"),
                        "memoryMode": batch.get("memoryMode"),
                        "lens": batch.get("lens"),
                        "status": "duplicate",
                        "reasonCode": "same_role_artifacts_and_queries",
                    }
                )
                continue
            seen[key] = hypothesis
            rediscovery_count = 1 + (1 if key in historical_keys else 0)
            coverage_gain = _coverage_gain(hypothesis, inventory_domains)
            status = "needs_probe" if coverage_gain >= 0.55 else "accepted"
            accepted.append(
                {
                    "hypothesisId": hypothesis.get("hypothesisId"),
                    "memoryMode": batch.get("memoryMode"),
                    "lens": batch.get("lens"),
                    "noveltyScore": 0.45 if key in historical_keys else 1.0,
                    "coverageGain": coverage_gain,
                    "actionabilityScore": _actionability_score(str(hypothesis.get("actionability") or "unknown")),
                    "riskScore": _risk_score(str(hypothesis.get("riskAssumption") or "unknown")),
                    "rediscoveryCount": rediscovery_count,
                    "duplicateOf": None,
                    "mergedInto": None,
                    "status": status,
                    "reasonCode": "new_coverage" if status == "needs_probe" else "known_coverage_retained",
                }
            )
    return {
        "accepted": accepted,
        "duplicates": duplicates,
        "rejected": rejected,
        "uniqueHypothesisCount": len(accepted),
        "lensCoverage": sorted({str(item.get("lens")) for item in accepted}),
        "rediscoveryCount": len(duplicates),
    }


def _hypotheses_for_lens(
    *,
    discovery_brief: dict[str, Any],
    desired_signals: list[dict[str, Any]],
    artifacts: list[str],
    memory_mode: str,
    lens: str,
    locale: str | None,
    query_terms: list[str],
) -> list[dict[str, Any]]:
    roles = _source_roles_for_lens(lens)
    hypotheses: list[dict[str, Any]] = []
    for role_index, role in enumerate(roles[:5]):
        artifact_slice = _artifact_slice(artifacts, role_index)
        families = [
            {
                "familyId": _stable_id("query", lens, role, term),
                "intent": f"Find {role.replace('_', ' ')} sources with {lens.replace('_', ' ')} artifacts.",
                "queries": [term, f"{term} {role.replace('_', ' ')}"],
                "badIfResultsAre": ["seller pages", "generic SEO content", "static explainers"],
            }
            for term in query_terms[:3]
        ]
        hypotheses.append(
            {
                "hypothesisId": _stable_id(memory_mode, lens, role, locale or "", role_index),
                "description": "Public sources with this role/artifact behavior may expose desired signals.",
                "sourceRoleDescription": _source_role_description(lens, locale, role),
                "expectedArtifacts": artifact_slice,
                "expectedSourceScopeTypes": _expected_scope_types(lens, artifact_slice),
                "badIfScopeIs": ["single_item", "static_service_page", "context_page"],
                "expectedSignalLinks": [
                    {
                        "signalId": str(signal.get("signalId") or f"signal-{index + 1}"),
                        "capabilityReason": (
                            "The expected artifact/source role can directly or indirectly expose this signal "
                            "after downstream filtering."
                        ),
                        "expectedDirectness": str(signal.get("directness") or "contextual"),
                    }
                    for index, signal in enumerate(desired_signals[:5])
                ],
                "queryFamilies": families,
                "negativePatterns": ["seller pages", "generic SEO content", "static explainers"],
                "whyThisCouldWork": "The universal lens targets recurring public artifacts whose scope can be resolved before channel projection.",
                "riskAssumption": _risk_assumption(lens),
                "actionability": _actionability(lens, role),
                "memoryMode": memory_mode,
                "lens": lens,
            }
        )
    return hypotheses[:20]


def _expected_scope_types(lens: str, artifacts: list[str]) -> list[str]:
    if lens == "datasets_and_apis":
        return ["api_endpoint", "section", "domain_root"]
    if "document" in artifacts or "report" in artifacts:
        return ["document_collection", "section", "listing_page"]
    if "listing" in artifacts or "registry_entry" in artifacts:
        return ["listing_page", "section", "feed"]
    if lens in {"public_discussions", "marketplaces_and_listings"}:
        return ["listing_page", "search_endpoint", "section"]
    return ["section", "feed", "domain_root"]


def _query_terms(discovery_brief: dict[str, Any], lens: str, locale: str | None) -> list[str]:
    hints = [str(item) for item in discovery_brief.get("keywordHints", []) if str(item).strip()]
    if not hints:
        hints = ["public", "updates", "evidence"]
    seeds = [str(item).strip().lower() for item in discovery_brief.get("querySeeds", []) if str(item).strip()]
    if not seeds:
        seeds = [" ".join(hints[:4])]
    qualifiers = _lens_query_qualifiers(lens)
    queries = []
    for index, seed in enumerate(seeds[:3]):
        qualifier = qualifiers[index % len(qualifiers)]
        query = f"{seed} {qualifier}".strip()
        queries.append(query)
    if locale:
        queries.append(f"{seeds[0]} {locale} {qualifiers[0]}")
    return _unique(queries)


def _lens_query_qualifiers(lens: str) -> list[str]:
    if lens == "official_owners":
        return ["official", "official source", "portal"]
    if lens == "documents_and_reports":
        return ["notice", "document", "deadline"]
    if lens == "datasets_and_apis":
        return ["dataset", "api", "registry"]
    if lens == "announcements_and_newsrooms":
        return ["announcement", "newsroom", "update"]
    if lens == "change_logs_and_updates":
        return ["changelog", "release notes", "migration"]
    if lens == "local_language_forms":
        return ["portal", "notice", "application"]
    return ["public source", "official", "updates"]


def _source_roles_for_lens(lens: str) -> list[str]:
    return {
        "official_owners": ["owner_or_operator", "public_authority", "official_update_source", "program_operator", "standards_owner"],
        "registries_and_directories": ["aggregator_or_directory", "registry_operator", "public_index", "catalog_source", "listing_broker"],
        "documents_and_reports": ["document_publisher", "public_authority", "owner_or_operator", "research_report_source", "archive_source"],
        "datasets_and_apis": ["dataset_registry", "api_publisher", "public_authority", "open_data_portal", "machine_readable_catalog"],
        "announcements_and_newsrooms": ["owner_or_operator", "public_authority", "newsroom", "press_release_source", "official_update_source"],
        "change_logs_and_updates": ["changelog_publisher", "owner_or_operator", "release_note_source", "status_update_source", "documentation_publisher"],
        "public_discussions": ["community_or_ugc", "issue_tracker", "forum_source", "public_question_board", "social_discussion_source"],
        "marketplaces_and_listings": ["aggregator_or_directory", "marketplace_source", "listing_broker", "opportunity_board", "directory_source"],
        "local_language_forms": ["public_authority", "owner_or_operator", "local_directory", "regional_registry", "local_notice_source"],
        "weird_public_artifacts": ["archive_source", "file_index", "calendar_source", "public_spreadsheet", "metadata_endpoint"],
        "adversarial_missing_sources": ["overlooked_owner", "indirect_directory", "edge_case_public_record", "low_frequency_update_source", "non_obvious_registry"],
    }.get(lens, ["public_source", "owner_or_operator", "aggregator_or_directory", "public_authority", "context_source"])


def _artifact_slice(artifacts: list[str], index: int) -> list[str]:
    if not artifacts:
        return ["unknown"]
    first = artifacts[index % len(artifacts)]
    second = artifacts[(index + 1) % len(artifacts)]
    return list(dict.fromkeys([first, second]))


def _source_role_description(lens: str, locale: str | None, role: str) -> str:
    suffix = f" in locale {locale}" if locale else ""
    return f"A {role.replace('_', ' ')} that may publish {lens.replace('_', ' ')} artifacts{suffix}."


def _risk_assumption(lens: str) -> str:
    if lens in {"public_discussions", "weird_public_artifacts"}:
        return "medium"
    if lens in {"datasets_and_apis"}:
        return "unknown"
    return "low"


def _actionability(lens: str, role: str) -> str:
    if lens in {"public_discussions", "weird_public_artifacts"}:
        return "medium"
    if role in {"context_source", "archive_source", "file_index"}:
        return "low"
    return "high"


def _hypothesis_key(hypothesis: dict[str, Any]) -> str:
    role = str(hypothesis.get("sourceRoleDescription") or "").lower()
    artifacts = ",".join(sorted(str(item) for item in hypothesis.get("expectedArtifacts", [])))
    return f"{role}|{artifacts}"


def _coverage_gain(hypothesis: dict[str, Any], inventory_domains: set[str]) -> float:
    del inventory_domains
    artifacts = len(hypothesis.get("expectedArtifacts", []))
    families = len(hypothesis.get("queryFamilies", []))
    return round(min(1.0, 0.35 + artifacts * 0.10 + families * 0.08), 2)


def _actionability_score(actionability: str) -> float:
    return {"high": 0.85, "medium": 0.55, "low": 0.25}.get(actionability, 0.35)


def _risk_score(risk: str) -> float:
    return {"low": 0.2, "medium": 0.55, "high": 0.85, "unknown": 0.65}.get(risk, 0.65)


def _noisy_hypothesis_keys(feedback_events: list[dict[str, Any]]) -> set[str]:
    keys: set[str] = set()
    for event in feedback_events:
        feedback_type = str(event.get("feedbackType") or event.get("feedback_type") or "")
        feedback = event.get("feedback") if isinstance(event.get("feedback"), dict) else {}
        hypothesis = feedback.get("hypothesis") if isinstance(feedback.get("hypothesis"), dict) else None
        if feedback_type == "mark_noise" and hypothesis:
            keys.add(_hypothesis_key(hypothesis))
    return keys


def _unique(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def _stable_id(*parts: object) -> str:
    raw = "|".join(str(part) for part in parts)
    return sha256(raw.encode("utf-8")).hexdigest()[:16]
