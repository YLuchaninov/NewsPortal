from __future__ import annotations

from copy import deepcopy
from typing import Any

from .discovery_v3_provider_capabilities import (
    provider_default_action,
    provider_supports_signal_mode,
)
from .discovery_v3_settings import DEFAULT_HYPOTHESIS_BUDGET, DiscoveryV3Settings


def hypothesis_key(hypothesis: dict[str, Any]) -> tuple[str, ...]:
    return (
        str(hypothesis.get("hypothesisType") or hypothesis.get("hypothesis_type") or ""),
        str(hypothesis.get("signalMode") or hypothesis.get("signal_mode") or ""),
        str(hypothesis.get("sourceRole") or hypothesis.get("source_role") or ""),
        str(hypothesis.get("providerId") or hypothesis.get("provider_id") or ""),
        str(hypothesis.get("queryText") or hypothesis.get("query_text") or ""),
        str(hypothesis.get("seedDomain") or hypothesis.get("seed_domain") or ""),
        str(hypothesis.get("seedUrl") or hypothesis.get("seed_url") or ""),
    )


def dedupe_hypotheses(hypotheses: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, ...]] = set()
    deduped: list[dict[str, Any]] = []
    for hypothesis in hypotheses:
        key = hypothesis_key(hypothesis)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(hypothesis)
    return deduped


def convert_idea_to_hypothesis(idea: dict[str, Any]) -> dict[str, Any]:
    provider_id = str(idea.get("providerId") or "web_search")
    signal_mode = str(idea.get("signalMode") or "direct")
    return {
        "hypothesisType": idea.get("hypothesisType") or str(idea.get("additionType") or "skeptic_added"),
        "signalMode": signal_mode,
        "sourceRole": str(idea.get("sourceRole") or "source_directory"),
        "providerId": provider_id,
        "queryText": idea.get("queryText"),
        "expectedEvidence": list(idea.get("expectedEvidence") or []),
        "recommendedAction": idea.get("recommendedAction") or provider_default_action(provider_id),
        "priorityScore": float(idea.get("priority") or 0.45),
        "riskScore": float(idea.get("riskScore") or 0.5),
        "confidenceScore": float(idea.get("confidence") or 0.5),
        "addedBy": "constructive_skeptic",
        "additionType": idea.get("additionType"),
    }


def provider_capability_ok(hypothesis: dict[str, Any]) -> bool:
    provider_id = str(hypothesis.get("providerId") or hypothesis.get("provider_id") or "web_search")
    signal_mode = str(hypothesis.get("signalMode") or hypothesis.get("signal_mode") or "direct")
    return provider_supports_signal_mode(provider_id, signal_mode)


def apply_repair_patch(hypothesis: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    repaired = dict(hypothesis)
    change_type = str(patch.get("changeType") or "")
    payload = patch.get("patch") if isinstance(patch.get("patch"), dict) else {}

    if change_type == "switch_provider" and payload.get("providerId"):
        repaired["providerId"] = str(payload["providerId"])
    elif change_type == "change_role" and payload.get("sourceRole"):
        repaired["sourceRole"] = str(payload["sourceRole"])
    elif change_type == "split_direct_hidden" and payload.get("signalMode"):
        repaired["signalMode"] = str(payload["signalMode"])
    elif change_type == "add_endpoint_patterns":
        existing = list(repaired.get("endpointPatterns") or [])
        repaired["endpointPatterns"] = existing + [
            str(item) for item in list(payload.get("endpointPatterns") or []) if str(item)
        ]
    elif change_type == "localize":
        terms = [str(item) for item in list(payload.get("addQueryTerms") or []) if str(item)]
        if terms and repaired.get("queryText"):
            repaired["queryText"] = f"{repaired['queryText']} {' '.join(terms)}"
    elif change_type == "mark_monitor_only":
        repaired["recommendedAction"] = "monitor_only"
    elif change_type == "mark_needs_config":
        repaired["recommendedAction"] = "needs_config"
    elif change_type in {"narrow", "broaden"} and payload.get("queryText"):
        repaired["queryText"] = str(payload["queryText"])

    repaired["repairApplied"] = True
    return repaired


def compute_meaningful_change_score(before: list[dict[str, Any]], after: list[dict[str, Any]]) -> float:
    before_roles = {str(item.get("sourceRole") or item.get("source_role") or "") for item in before}
    after_roles = {str(item.get("sourceRole") or item.get("source_role") or "") for item in after}
    before_providers = {
        str(item.get("providerId") or item.get("provider_id") or "") for item in before
    }
    after_providers = {
        str(item.get("providerId") or item.get("provider_id") or "") for item in after
    }
    localized_added = any(
        str(item.get("queryText") or "").lower() != str(old.get("queryText") or "").lower()
        for item, old in zip(after, before, strict=False)
    )
    before_invalid_split = any(str(item.get("signalMode") or "") not in {"direct", "hidden", "mixed"} for item in before)
    split_fixed = before_invalid_split and any(
        str(item.get("signalMode") or "") in {"direct", "hidden"} for item in after
    )
    duplicate_increase = max(0, len(after) - len(dedupe_hypotheses(after)))

    return max(
        0.0,
        min(
            1.0,
            len(after_roles - before_roles) * 0.25
            + bool(after_providers - before_providers) * 0.20
            + bool(localized_added) * 0.15
            + bool(split_fixed) * 0.20
            - duplicate_increase * 0.20,
        ),
    )


def _query_cluster(hypothesis: dict[str, Any]) -> str:
    query = str(hypothesis.get("queryText") or hypothesis.get("query_text") or "").lower()
    tokens = [token for token in query.replace('"', " ").split() if token]
    return " ".join(tokens[:3]) if tokens else str(hypothesis.get("seedDomain") or "")


def rank_and_trim_by_diversity(
    hypotheses: list[dict[str, Any]],
    budget: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    policy = budget or DEFAULT_HYPOTHESIS_BUDGET
    total_limit = int(policy.get("total") or len(hypotheses))
    by_signal = dict(policy.get("bySignalMode") or {})
    by_provider = dict(policy.get("maxPerProvider") or {})
    by_role = dict(policy.get("bySourceRole") or {})
    max_per_cluster = int(policy.get("maxPerQueryCluster") or total_limit)

    selected: list[dict[str, Any]] = []
    counts_signal: dict[str, int] = {}
    counts_provider: dict[str, int] = {}
    counts_role: dict[str, int] = {}
    counts_cluster: dict[str, int] = {}

    ranked = sorted(
        hypotheses,
        key=lambda item: float(item.get("priorityScore") or item.get("priority_score") or 0),
        reverse=True,
    )
    for hypothesis in ranked:
        signal = str(hypothesis.get("signalMode") or hypothesis.get("signal_mode") or "")
        provider = str(hypothesis.get("providerId") or hypothesis.get("provider_id") or "")
        role = str(hypothesis.get("sourceRole") or hypothesis.get("source_role") or "")
        cluster = _query_cluster(hypothesis)

        if len(selected) >= total_limit:
            break
        if signal and counts_signal.get(signal, 0) >= int(by_signal.get(signal, total_limit)):
            continue
        if provider and counts_provider.get(provider, 0) >= int(by_provider.get(provider, total_limit)):
            continue
        if role and counts_role.get(role, 0) >= int(by_role.get(role, total_limit)):
            continue
        if cluster and counts_cluster.get(cluster, 0) >= max_per_cluster:
            continue

        selected.append(hypothesis)
        counts_signal[signal] = counts_signal.get(signal, 0) + 1
        counts_provider[provider] = counts_provider.get(provider, 0) + 1
        counts_role[role] = counts_role.get(role, 0) + 1
        counts_cluster[cluster] = counts_cluster.get(cluster, 0) + 1

    return selected


def repair_hypothesis_pack(
    pack: dict[str, Any],
    skeptic_output: dict[str, Any],
    settings: DiscoveryV3Settings | None = None,
    *,
    total_added_so_far: int = 0,
    budget: dict[str, Any] | None = None,
) -> dict[str, Any]:
    effective_settings = settings or DiscoveryV3Settings()
    current = deepcopy(pack)
    hypotheses = [dict(item) for item in list(current.get("hypotheses") or []) if isinstance(item, dict)]
    before = deepcopy(hypotheses)

    patch_by_ref = {
        str(patch.get("hypothesisRef") or ""): patch
        for patch in list(skeptic_output.get("repairPatches") or [])
        if isinstance(patch, dict)
    }
    repaired_hypotheses: list[dict[str, Any]] = []
    for index, hypothesis in enumerate(hypotheses):
        ref = str(hypothesis.get("hypothesisRef") or hypothesis.get("id") or index)
        patch = patch_by_ref.get(ref)
        repaired_hypotheses.append(apply_repair_patch(hypothesis, patch) if patch else hypothesis)

    added: list[dict[str, Any]] = []
    negative_controls_added = 0
    for idea in list(skeptic_output.get("addedIdeas") or []):
        if len(added) >= effective_settings.max_skeptic_added_hypotheses_per_round:
            break
        if total_added_so_far + len(added) >= effective_settings.max_skeptic_added_hypotheses_total:
            break
        if not isinstance(idea, dict):
            continue
        if str(idea.get("additionType") or "") == "negative_control":
            if negative_controls_added >= effective_settings.max_negative_controls_per_run:
                continue
            negative_controls_added += 1
        candidate = convert_idea_to_hypothesis(idea)
        if not provider_capability_ok(candidate):
            continue
        if float(candidate.get("riskScore") or 0) > 0.75:
            continue
        if hypothesis_key(candidate) in {hypothesis_key(item) for item in repaired_hypotheses + added}:
            continue
        added.append(candidate)

    repaired_hypotheses.extend(added)
    repaired_hypotheses = dedupe_hypotheses(repaired_hypotheses)
    repaired_hypotheses = [
        item for item in repaired_hypotheses if provider_capability_ok(item)
    ]
    repaired_hypotheses = rank_and_trim_by_diversity(repaired_hypotheses, budget)

    current["hypotheses"] = repaired_hypotheses
    current["repairMeta"] = {
        "addedCount": len(added),
        "meaningfulChangeScore": compute_meaningful_change_score(before, repaired_hypotheses),
    }
    return current
