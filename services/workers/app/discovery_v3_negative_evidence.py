from __future__ import annotations

from datetime import UTC, datetime
from typing import Any


FAILURE_MODES = {
    "no_results",
    "low_relevance",
    "seo_noise",
    "social_noise",
    "duplicate",
    "provider_mismatch",
    "provider_error",
    "auth_required",
    "rate_limited",
    "blocked_domain",
    "dead_endpoint",
    "probe_failed",
    "browser_challenge",
    "hidden_signal_not_confirmed",
    "compliance_blocked",
    "contract_failed",
}


def build_negative_evidence(
    *,
    failure_mode: str,
    target_id: str | None = None,
    provider_id: str | None = None,
    query_text: str | None = None,
    canonical_domain: str | None = None,
    endpoint_url: str | None = None,
    source_role: str | None = None,
    signal_mode: str | None = None,
    severity: float = 0.5,
    details: dict[str, Any] | None = None,
    cooldown_until: datetime | None = None,
) -> dict[str, Any]:
    if failure_mode not in FAILURE_MODES:
        failure_mode = "low_relevance"
    return {
        "target_id": target_id,
        "evidence_kind": "negative_evidence",
        "provider_id": provider_id,
        "query_text": query_text,
        "canonical_domain": canonical_domain,
        "endpoint_url": endpoint_url,
        "source_role": source_role,
        "signal_mode": signal_mode,
        "failure_mode": failure_mode,
        "severity": max(0.0, min(1.0, float(severity))),
        "details_json": details or {},
        "cooldown_until": cooldown_until,
    }


def negative_evidence_blocks_hypothesis(
    hypothesis: dict[str, Any],
    negative_evidence_rows: list[dict[str, Any]],
    *,
    now: datetime | None = None,
) -> tuple[bool, str | None]:
    effective_now = now or datetime.now(UTC)
    provider_id = str(hypothesis.get("providerId") or hypothesis.get("provider_id") or "")
    query_text = str(hypothesis.get("queryText") or hypothesis.get("query_text") or "").lower()
    seed_domain = str(hypothesis.get("seedDomain") or hypothesis.get("seed_domain") or "").lower()
    seed_url = str(hypothesis.get("seedUrl") or hypothesis.get("seed_url") or "").lower()
    source_role = str(hypothesis.get("sourceRole") or hypothesis.get("source_role") or "")
    signal_mode = str(hypothesis.get("signalMode") or hypothesis.get("signal_mode") or "")

    for row in negative_evidence_rows:
        cooldown_until = row.get("cooldown_until")
        if isinstance(cooldown_until, datetime) and cooldown_until <= effective_now:
            continue
        if cooldown_until is None:
            continue

        row_provider = str(row.get("provider_id") or "")
        row_query = str(row.get("query_text") or "").lower()
        row_domain = str(row.get("canonical_domain") or "").lower()
        row_endpoint = str(row.get("endpoint_url") or "").lower()
        row_role = str(row.get("source_role") or "")
        row_signal = str(row.get("signal_mode") or "")

        provider_match = not row_provider or row_provider == provider_id
        role_match = not row_role or row_role == source_role
        signal_match = not row_signal or row_signal == signal_mode
        query_match = bool(row_query and row_query == query_text)
        domain_match = bool(row_domain and row_domain == seed_domain)
        endpoint_match = bool(row_endpoint and (row_endpoint == seed_url or row_endpoint in seed_url))

        if provider_match and role_match and signal_match and (query_match or domain_match or endpoint_match):
            return True, str(row.get("failure_mode") or "negative_evidence_cooldown")

    return False, None
