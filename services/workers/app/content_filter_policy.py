from __future__ import annotations

from typing import Any, Mapping


def combine_filter_rule_results(
    *,
    policy: Mapping[str, Any],
    matched_rules: list[dict[str, Any]],
    failed_rules: list[dict[str, Any]],
) -> dict[str, Any]:
    combiner = str(policy.get("combiner") or "all")
    passed = any(item["passed"] for item in matched_rules) if combiner == "any" else not failed_rules
    policy_json = policy.get("policy_json") if isinstance(policy.get("policy_json"), Mapping) else {}
    decision = str(policy_json.get("onPass") or "keep") if passed else str(policy_json.get("onFail") or "reject")
    if decision not in {"keep", "reject", "hold", "needs_review"}:
        decision = "keep" if passed else "reject"
    return {
        "passed": passed,
        "decision": decision,
        "combiner": combiner,
    }
