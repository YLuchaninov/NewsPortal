from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class DiscoveryV3Settings:
    enabled: bool = True
    max_targets_per_cycle: int = 10
    max_runs_per_cycle: int = 3
    max_depth: int = 3
    max_hypotheses_per_run: int = 120
    max_hypotheses_per_generation: int = 40
    max_search_results_per_hypothesis: int = 20
    max_domains_per_run: int = 400
    max_endpoints_per_domain: int = 12
    max_endpoints_per_run: int = 700
    max_social_items_per_run: int = 1000
    max_source_directory_pages_per_run: int = 30
    max_outbound_links_per_directory: int = 80
    rss_auto_promote_threshold: float = 0.88
    rss_manual_promote_threshold: float = 0.70
    website_manual_promote_threshold: float = 0.78
    review_threshold: float = 0.58
    min_coverage_score: float = 0.75
    hidden_signal_min_confidence: float = 0.65
    hidden_signal_min_evidence_count: int = 8
    hidden_signal_min_independent_sources: int = 3
    hidden_signal_min_unique_authors: int = 5
    hidden_signal_max_confidence_without_control: float = 0.70
    hidden_signal_strong_specificity_threshold: float = 2.5
    hidden_signal_weak_specificity_threshold: float = 1.5
    max_full_repair_rounds: int = 2
    max_verification_rounds: int = 1
    max_skeptic_added_hypotheses_per_round: int = 12
    max_skeptic_added_hypotheses_total: int = 20
    max_negative_controls_per_run: int = 10
    max_debate_tokens_per_run: int = 60000
    min_meaningful_change_score: float = 0.12
    max_repeated_critique_types: int = 2
    force_manual_review_on_persistent_disagreement: bool = True
    search_providers: tuple[str, ...] = ("ddgs", "brave", "serper")
    default_languages: tuple[str, ...] = ("en",)


BALANCED_AUTOPILOT = {
    "maxDepth": 2,
    "maxHypotheses": 80,
    "maxDomains": 250,
    "maxEndpoints": 400,
    "directSignalWeight": 0.65,
    "hiddenSignalWeight": 0.35,
    "autoPromote": ["rss"],
    "websiteAutoPromote": False,
    "socialAction": "monitor_only",
    "sourceOfSources": True,
    "existingSourceExpansion": True,
    "replacementDiscovery": True,
}

WIDE_AUTOPILOT = {
    "maxDepth": 3,
    "maxHypotheses": 160,
    "maxDomains": 500,
    "maxEndpoints": 800,
    "maxSocialItems": 1500,
    "directSignalWeight": 0.50,
    "hiddenSignalWeight": 0.50,
    "autoPromote": ["rss"],
    "websiteAutoPromote": False,
    "socialAction": "monitor_only",
    "sourceOfSources": True,
    "existingSourceExpansion": True,
    "replacementDiscovery": True,
    "localizedSearch": True,
}

RESEARCH_AUTOPILOT = {
    "maxDepth": 3,
    "maxHypotheses": 120,
    "maxDomains": 350,
    "maxEndpoints": 600,
    "directSignalWeight": 0.75,
    "hiddenSignalWeight": 0.25,
    "focusRoles": [
        "primary_data",
        "report_research",
        "regulatory_policy",
        "procurement_signal",
        "technical_change",
    ],
    "autoPromote": [],
    "manualReviewOnly": True,
    "apiDetection": True,
}

SOCIAL_EARLY_SIGNAL_AUTOPILOT = {
    "maxDepth": 2,
    "maxHypotheses": 100,
    "maxSocialItems": 2500,
    "directSignalWeight": 0.25,
    "hiddenSignalWeight": 0.75,
    "socialAction": "monitor_only",
    "minIndependentSources": 3,
    "minUniqueAuthors": 5,
    "requireCrossProviderConfirmation": True,
    "autoPromote": [],
}

AUTOPILOT_MODES = {
    "balanced": BALANCED_AUTOPILOT,
    "wide": WIDE_AUTOPILOT,
    "research": RESEARCH_AUTOPILOT,
    "social_early_signal": SOCIAL_EARLY_SIGNAL_AUTOPILOT,
}

DEFAULT_HYPOTHESIS_BUDGET = {
    "total": 120,
    "bySignalMode": {
        "direct": 70,
        "hidden": 50,
    },
    "bySourceRole": {
        "authoritative_anchor": 15,
        "technical_change": 15,
        "security_advisory": 10,
        "procurement_signal": 20,
        "primary_data": 10,
        "report_research": 10,
        "regulatory_policy": 10,
        "industry_niche": 15,
        "social_pain_signal": 20,
        "source_directory": 15,
    },
    "maxPerQueryCluster": 5,
    "maxPerProvider": {
        "web_search": 70,
        "reddit": 20,
        "x_recent_search": 20,
        "youtube": 15,
    },
}

GLOBAL_DISCOVERY_SAFETY = {
    "maxNewSourceChannelsPerDay": 50,
    "maxAutoPromotedRssPerDay": 20,
    "maxWebsitePromotionsPerDay": 0,
    "maxProviderSpendUsdPerDay": 100,
    "maxSocialItemsPerDay": 10000,
    "maxFailedRunsBeforePause": 5,
    "killSwitch": False,
}

TARGET_DISCOVERY_SAFETY = {
    "maxNewSourcesPerRun": 10,
    "maxAutoPromotionsPerRun": 3,
    "maxHiddenSignalClustersPerRun": 20,
    "manualReviewRequired": False,
}
