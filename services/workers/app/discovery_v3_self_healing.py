from __future__ import annotations

from typing import Any


REPAIR_RECIPES: dict[str, list[str]] = {
    "no_search_results": [
        "broaden_queries",
        "add_aliases",
        "add_localized_terms",
        "switch_provider",
        "use_source_directory_queries",
    ],
    "many_results_no_endpoints": [
        "retry_endpoint_sweep",
        "expand_source_directory",
        "refresh_graph",
    ],
    "many_low_quality_results": [
        "reduce_noise",
        "refresh_graph",
        "increase_direct_signal_weight",
    ],
    "many_duplicates": [
        "reduce_noise",
        "refresh_graph",
    ],
    "hidden_signal_noise_high": [
        "reduce_noise",
        "expand_hidden_signals",
    ],
    "coverage_not_improving": [
        "refresh_graph",
        "expand_source_directory",
        "switch_provider",
    ],
    "provider_errors_high": [
        "repair_provider_auth",
        "switch_provider",
    ],
    "source_stale": [
        "resweep_domain",
        "try_sibling_endpoints",
        "replace_source",
    ],
}


def diagnose_run_health(metrics: dict[str, Any]) -> dict[str, Any]:
    """Convert run metrics into bounded repair recipes.

    Provider failures are reported as provider-health failures, never as bad
    hypotheses. That keeps the negative-evidence ledger from poisoning useful
    branches when the real problem is auth, quota, or provider availability.
    """

    diagnosis: list[dict[str, Any]] = []
    repair_plan: list[dict[str, Any]] = []

    def add(failure_mode: str, severity: float, evidence: list[str]) -> None:
        diagnosis.append(
            {
                "failureMode": failure_mode,
                "severity": round(max(0.0, min(1.0, severity)), 4),
                "evidence": evidence,
            }
        )
        for index, repair_kind in enumerate(REPAIR_RECIPES.get(failure_mode, [])):
            repair_plan.append(
                {
                    "repairKind": repair_kind,
                    "triggerFailureMode": failure_mode,
                    "priority": round(max(0.1, severity - index * 0.08), 4),
                    "params": {},
                }
            )

    provider_error_rate = float(metrics.get("provider_error_rate") or metrics.get("providerErrorRate") or 0)
    probe_error_rate = float(metrics.get("probe_error_rate") or metrics.get("probeErrorRate") or 0)
    coverage_delta = float(metrics.get("coverage_score_delta") or metrics.get("coverageScoreDelta") or 0)
    new_endpoint_count = int(metrics.get("new_endpoint_count") or metrics.get("newEndpointCount") or 0)
    new_signal_cluster_count = int(metrics.get("new_signal_cluster_count") or metrics.get("newSignalClusterCount") or 0)
    search_result_count = int(metrics.get("search_result_count") or metrics.get("searchResultCount") or 0)
    duplicate_rate = float(metrics.get("duplicate_rate") or metrics.get("duplicateRate") or 0)
    low_quality_rate = float(metrics.get("low_quality_rate") or metrics.get("lowQualityRate") or 0)
    social_noise_rate = float(metrics.get("social_noise_rate") or metrics.get("socialNoiseRate") or 0)
    hidden_confirmation_rate = float(
        metrics.get("hidden_signal_confirmation_rate") or metrics.get("hiddenSignalConfirmationRate") or 1
    )
    stale_source_count = int(metrics.get("stale_source_count") or metrics.get("staleSourceCount") or 0)

    if bool(metrics.get("no_search_results_for_all_hypotheses")):
        add("no_search_results", 0.82, ["all executed hypotheses produced zero search/provider results"])

    if provider_error_rate >= 0.50:
        add("provider_errors_high", provider_error_rate, [f"provider_error_rate={provider_error_rate:.2f}"])
    elif probe_error_rate >= 0.60:
        add("provider_errors_high", probe_error_rate, [f"probe_error_rate={probe_error_rate:.2f}"])

    if search_result_count >= 50 and new_endpoint_count == 0:
        add(
            "many_results_no_endpoints",
            0.72,
            [f"search_result_count={search_result_count}", "new_endpoint_count=0"],
        )

    if low_quality_rate >= 0.50:
        add("many_low_quality_results", low_quality_rate, [f"low_quality_rate={low_quality_rate:.2f}"])

    if duplicate_rate >= 0.50:
        add("many_duplicates", duplicate_rate, [f"duplicate_rate={duplicate_rate:.2f}"])

    if social_noise_rate >= 0.50 or (
        new_signal_cluster_count > 0 and hidden_confirmation_rate < 0.20
    ):
        add(
            "hidden_signal_noise_high",
            max(social_noise_rate, 0.65),
            [
                f"social_noise_rate={social_noise_rate:.2f}",
                f"hidden_signal_confirmation_rate={hidden_confirmation_rate:.2f}",
            ],
        )

    if coverage_delta < 0.02 and new_endpoint_count < 5 and new_signal_cluster_count < 2:
        add(
            "coverage_not_improving",
            0.66,
            [
                f"coverage_score_delta={coverage_delta:.3f}",
                f"new_endpoint_count={new_endpoint_count}",
                f"new_signal_cluster_count={new_signal_cluster_count}",
            ],
        )

    if stale_source_count > 0:
        add("source_stale", min(1.0, 0.55 + stale_source_count * 0.05), [f"stale_source_count={stale_source_count}"])

    repair_plan = _dedupe_repair_plan(repair_plan)
    return {
        "diagnosis": diagnosis,
        "repairPlan": repair_plan,
        "shouldRerun": bool(repair_plan) and not bool(metrics.get("manual_review_required")),
        "confidence": _diagnosis_confidence(diagnosis),
    }


def build_repair_rows(
    *,
    target_id: str | None,
    run_id: str | None,
    diagnosis: dict[str, Any],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    diagnosis_items = list(diagnosis.get("diagnosis") or [])
    for repair in list(diagnosis.get("repairPlan") or []):
        rows.append(
            {
                "target_id": target_id,
                "run_id": run_id,
                "repair_kind": repair["repairKind"],
                "trigger_kind": "self_healing",
                "diagnosis_json": {
                    "items": diagnosis_items,
                    "confidence": diagnosis.get("confidence"),
                    "shouldRerun": diagnosis.get("shouldRerun"),
                },
                "action_plan_json": repair,
                "status": "queued",
            }
        )
    return rows


def _dedupe_repair_plan(repairs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_kind: dict[str, dict[str, Any]] = {}
    for repair in repairs:
        kind = str(repair.get("repairKind") or "")
        if not kind:
            continue
        existing = by_kind.get(kind)
        if existing is None or float(repair.get("priority") or 0) > float(existing.get("priority") or 0):
            by_kind[kind] = repair
    return sorted(by_kind.values(), key=lambda item: float(item.get("priority") or 0), reverse=True)


def _diagnosis_confidence(diagnosis: list[dict[str, Any]]) -> float:
    if not diagnosis:
        return 0.0
    return round(sum(float(item.get("severity") or 0) for item in diagnosis) / len(diagnosis), 4)
