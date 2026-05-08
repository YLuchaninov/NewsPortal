from __future__ import annotations

from typing import Any, Callable


def _urls(rows: list[dict[str, Any]]) -> set[str]:
    return {
        str(row.get("normalized_endpoint_url") or row.get("endpoint_url") or row.get("url") or "")
        for row in rows
        if row
    }


def evaluate_replay_case(expected: dict[str, Any], actual: dict[str, Any]) -> dict[str, float]:
    expected_sources = _urls(list(expected.get("expected_sources_json") or expected.get("expectedSources") or []))
    expected_rejects = _urls(list(expected.get("expected_rejects_json") or expected.get("expectedRejects") or []))
    actual_sources = _urls(list(actual.get("sources") or []))
    actual_rejects = _urls(list(actual.get("rejects") or []))

    true_positive = len(expected_sources & actual_sources)
    false_positive = len(actual_sources - expected_sources)
    false_negative = len(expected_sources - actual_sources)
    true_reject = len(expected_rejects & actual_rejects)
    reject_miss = len(expected_rejects - actual_rejects)

    precision = true_positive / max(1, true_positive + false_positive)
    recall = true_positive / max(1, true_positive + false_negative)
    noise = false_positive / max(1, len(actual_sources))
    reject_recall = true_reject / max(1, true_reject + reject_miss)

    return {
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "noise": round(noise, 4),
        "rejectRecall": round(reject_recall, 4),
        "cost": float(actual.get("cost") or 0),
    }


def run_replay_eval(
    cases: list[dict[str, Any]],
    runner: Callable[[dict[str, Any]], dict[str, Any]],
) -> dict[str, Any]:
    case_metrics: list[dict[str, Any]] = []
    for case in cases:
        actual = runner(case)
        case_metrics.append(evaluate_replay_case(case, actual))

    if not case_metrics:
        return {"caseCount": 0, "metrics": {}}

    keys = {"precision", "recall", "noise", "rejectRecall", "cost"}
    aggregate = {
        key: round(sum(metric[key] for metric in case_metrics) / len(case_metrics), 4)
        for key in keys
    }
    return {"caseCount": len(case_metrics), "caseMetrics": case_metrics, "metrics": aggregate}


def fixture_replay_runner(case: dict[str, Any]) -> dict[str, Any]:
    fixtures = case.get("provider_fixtures_json") or case.get("providerFixtures") or {}
    if not isinstance(fixtures, dict):
        fixtures = {}
    return {
        "sources": list(fixtures.get("sources") or fixtures.get("acceptedSources") or []),
        "rejects": list(fixtures.get("rejects") or fixtures.get("rejectedSources") or []),
        "hiddenClaims": list(fixtures.get("hiddenClaims") or []),
        "cost": float(fixtures.get("cost") or 0),
    }


def run_fixture_replay_eval(cases: list[dict[str, Any]]) -> dict[str, Any]:
    result = run_replay_eval(cases, fixture_replay_runner)
    hidden_claim_metrics = _evaluate_hidden_claims(cases)
    result["metrics"] = {**dict(result.get("metrics") or {}), **hidden_claim_metrics}
    return result


def _evaluate_hidden_claims(cases: list[dict[str, Any]]) -> dict[str, float]:
    expected_total = 0
    actual_total = 0
    matched = 0
    for case in cases:
        expected = {
            _claim_key(claim)
            for claim in list(case.get("expected_hidden_claims_json") or case.get("expectedHiddenClaims") or [])
            if claim
        }
        fixtures = case.get("provider_fixtures_json") or {}
        actual = {
            _claim_key(claim)
            for claim in list(dict(fixtures).get("hiddenClaims") or [])
            if claim
        }
        expected_total += len(expected)
        actual_total += len(actual)
        matched += len(expected & actual)
    return {
        "hiddenClaimRecall": round(matched / max(1, expected_total), 4),
        "hiddenClaimPrecision": round(matched / max(1, actual_total), 4),
    }


def _claim_key(claim: dict[str, Any]) -> str:
    return str(
        claim.get("normalized_claim")
        or claim.get("normalizedClaim")
        or claim.get("title")
        or ""
    ).strip().lower()
