from __future__ import annotations

from datetime import date, datetime
from typing import Any
from uuid import UUID

from .discovery_v3_identity import identity_key_for_endpoint


def _json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(item) for item in value]
    if isinstance(value, set):
        return sorted(_json_safe(item) for item in value)
    if isinstance(value, (datetime, date, UUID)):
        return str(value)
    return value


def _trust_stage(item: dict[str, Any]) -> str:
    config = item.get("config_json") if isinstance(item.get("config_json"), dict) else {}
    discovery = config.get("discovery") if isinstance(config.get("discovery"), dict) else {}
    return str(discovery.get("trustStage") or "active")


def _source_role(item: dict[str, Any]) -> str:
    return str(item.get("source_role") or item.get("sourceRole") or "industry_niche")


def _coverage_contribution(item: dict[str, Any], trust_stage: str, is_active: bool) -> float:
    config = item.get("config_json") if isinstance(item.get("config_json"), dict) else {}
    discovery = config.get("discovery") if isinstance(config.get("discovery"), dict) else {}
    raw = discovery.get("coverageContribution")
    if raw is not None:
        return max(0.0, min(1.0, float(raw)))
    if trust_stage == "probation":
        return 0.25
    if trust_stage == "degraded" or not is_active:
        return 0.0
    return 1.0


def _identity_candidate(source: dict[str, Any], role: str) -> dict[str, Any]:
    endpoint_url = source.get("fetch_url") or source.get("endpoint_url") or source.get("url") or ""
    return {
        "endpoint_url": endpoint_url,
        "normalized_endpoint_url": source.get("normalized_endpoint_url") or endpoint_url,
        "canonical_domain": source.get("canonical_domain"),
        "endpoint_kind": source.get("endpoint_kind") or source.get("endpointKind") or "unknown",
        "source_role": role,
    }


def compute_coverage(
    *,
    target_id: str,
    graph: dict[str, Any],
    source_inventory: list[dict[str, Any]],
) -> dict[str, Any]:
    role_targets = dict(graph.get("sourceRoleTargets") or {})
    role_rows: dict[str, dict[str, Any]] = {
        role: {
            "target": int(config.get("target", 1)),
            "strong": 0,
            "weak": 0,
            "probation": 0,
            "duplicate": 0,
            "coverageContribution": 0.0,
        }
        for role, config in role_targets.items()
        if isinstance(config, dict)
    }
    inventory_rows: list[dict[str, Any]] = []
    seen_identities: set[tuple[str, str, str]] = set()
    for source in source_inventory:
        if source.get("target_id") not in {None, "", target_id}:
            continue
        safe_source = _json_safe(source)
        role = _source_role(source)
        role_row = role_rows.setdefault(
            role,
            {
                "target": 1,
                "strong": 0,
                "weak": 0,
                "probation": 0,
                "duplicate": 0,
                "coverageContribution": 0.0,
            },
        )
        identity_key = identity_key_for_endpoint(_identity_candidate(source, role))
        if identity_key in seen_identities:
            role_row["duplicate"] += 1
            inventory_rows.append({**safe_source, "sourceRole": role, "coverageStatus": "duplicate"})
            continue
        seen_identities.add(identity_key)

        trust_stage = _trust_stage(source)
        is_active = bool(source.get("is_active", True))
        contribution = _coverage_contribution(source, trust_stage, is_active)
        if trust_stage == "probation":
            role_row["probation"] += 1
            status = "probation"
        elif is_active:
            role_row["strong"] += 1
            status = "strong"
        else:
            role_row["weak"] += 1
            status = "weak"
        role_row["coverageContribution"] = round(
            min(float(role_row["target"]), float(role_row["coverageContribution"]) + contribution),
            4,
        )
        inventory_rows.append(
            {**safe_source, "sourceRole": role, "coverageStatus": status, "coverageContribution": contribution}
        )

    gaps: list[dict[str, Any]] = []
    strong_total = 0
    contribution_total = 0.0
    for role, row in role_rows.items():
        target = int(row["target"])
        strong = int(row["strong"])
        strong_total += strong
        contribution_total += float(row.get("coverageContribution") or 0)
        missing = max(0, target - strong)
        row["missing"] = missing
        row["status"] = "missing" if strong == 0 else "weak" if missing else "ok"
        if missing:
            gaps.append(
                {
                    "sourceRole": role,
                    "gapScore": 1.0 if strong == 0 else 0.75,
                    "reason": f"{role} has {strong}/{target} strong sources.",
                    "recommendedTactics": ["gap_fill", "source_directory", "endpoint_sweep"],
                }
            )
    target_total = sum(int(row["target"]) for row in role_rows.values()) or 1
    return {
        "coverage_json": {"coverageScore": min(1.0, contribution_total / target_total), "roles": role_rows},
        "gaps_json": gaps,
        "source_inventory_json": inventory_rows,
        "summary_json": {"generatedBy": "discovery_v3_coverage", "targetId": target_id},
        "coverage_score": min(1.0, contribution_total / target_total),
        "source_count": len(inventory_rows),
        "strong_source_count": strong_total,
        "missing_role_count": len(gaps),
    }
