from __future__ import annotations

from typing import Any

from .discovery_v3_provider_capabilities import provider_compliance_score


def action_blocked_by_safety(
    action: str,
    safety: dict[str, Any] | None,
    counters: dict[str, Any] | None = None,
) -> tuple[bool, str | None]:
    policy = safety or {}
    observed = counters or {}
    if bool(policy.get("killSwitch")):
        return True, "global_discovery_kill_switch"
    if action == "auto_promote":
        max_auto_rss = policy.get("maxAutoPromotedRssPerDay")
        if max_auto_rss is not None and int(observed.get("autoPromotedRssToday") or 0) >= int(max_auto_rss):
            return True, "rss_auto_promote_daily_limit"
    if action in {"auto_promote", "manual_promote"}:
        max_sources = policy.get("maxNewSourceChannelsPerDay")
        if max_sources is not None and int(observed.get("newSourceChannelsToday") or 0) >= int(max_sources):
            return True, "new_source_channel_daily_limit"
    if action == "manual_promote":
        max_websites = policy.get("maxWebsitePromotionsPerDay")
        if max_websites is not None and int(observed.get("websitePromotionsToday") or 0) >= int(max_websites):
            return True, "website_promotion_daily_limit"
    return False, None


def decide_action(endpoint: dict[str, Any]) -> tuple[str, str]:
    provider_type = str(endpoint.get("provider_type") or "").strip()
    provider_id = str(endpoint.get("provider_id") or provider_type or "").strip()
    score = float(endpoint.get("total_score") or 0)
    evidence = float(endpoint.get("evidence_score") or 0)
    extraction = float(endpoint.get("extraction_ready_score") or 0)
    compliance = float(
        endpoint.get("compliance_score")
        if endpoint.get("compliance_score") is not None
        else provider_compliance_score(provider_id, "review")
    )
    novelty = 1.0 if endpoint.get("novelty_score") is None else float(endpoint.get("novelty_score") or 0)
    signal_mode = str(endpoint.get("signal_mode") or "direct")

    if novelty <= 0.05:
        return "reject", "duplicate_endpoint"

    if signal_mode == "hidden":
        return "monitor", "hidden_signal_requires_cluster_confirmation"

    if compliance < 0.50:
        return "needs_config", "provider_compliance_or_access_risk"

    if provider_type in {"youtube", "social", "forum"}:
        return "monitor", "social_or_video_provider_monitor_only"

    if provider_type == "email_imap":
        return "needs_config", "newsletter_requires_mailbox_config"

    if provider_type == "api":
        if score >= 0.70 and evidence >= 0.60:
            return "needs_config", "api_requires_operator_config"
        return "detect_only", "api_detected_but_not_ready"

    if provider_type == "rss":
        if (
            score >= 0.88
            and evidence >= 0.80
            and extraction >= 0.90
            and compliance >= 0.95
            and bool(endpoint.get("valid_feed", True))
            and int(endpoint.get("sample_entries") or 0) >= 3
        ):
            return "auto_promote", "strong_rss_evidence"
        if score >= 0.70 and evidence >= 0.60:
            return "manual_promote", "rss_candidate_requires_review"
        return "reject", "low_rss_score"

    if provider_type == "website":
        if score >= 0.78 and evidence >= 0.70 and extraction >= 0.60 and compliance >= 0.90:
            return "manual_promote", "strong_website_endpoint"
        if score >= 0.58 and evidence >= 0.45:
            return "review", "medium_website_candidate"
        return "reject", "low_website_score"

    return "reject", "unsupported_provider"
