from __future__ import annotations

from copy import deepcopy
from typing import Any


ProviderCard = dict[str, Any]


PROVIDER_CAPABILITIES: dict[str, ProviderCard] = {
    "web_search": {
        "providerId": "web_search",
        "providerKind": "web_search",
        "displayName": "Web search fanout",
        "discoverySupported": True,
        "ingestionSupported": False,
        "promotionMode": "disabled",
        "accessMode": "configured_adapter",
        "authRequired": False,
        "queryPrimitives": {"keywordSearch": True, "timeRange": True},
        "objectTypes": ["web_result", "news_result"],
        "signalModes": ["direct", "hidden"],
        "compliance": {"requiresOfficialApi": False, "piiRisk": "low"},
        "defaultAction": "discover_only",
    },
    "rss": {
        "providerId": "rss",
        "providerKind": "feed",
        "displayName": "RSS/Atom feed",
        "discoverySupported": True,
        "ingestionSupported": True,
        "promotionMode": "auto_or_manual",
        "accessMode": "public_http",
        "authRequired": False,
        "queryPrimitives": {"urlProbe": True, "feedProbe": True},
        "objectTypes": ["feed", "entry"],
        "signalModes": ["direct"],
        "compliance": {"piiRisk": "low"},
        "defaultAction": "manual_promote",
    },
    "website": {
        "providerId": "website",
        "providerKind": "website",
        "displayName": "Website",
        "discoverySupported": True,
        "ingestionSupported": True,
        "promotionMode": "manual_or_guarded_auto",
        "accessMode": "public_http",
        "authRequired": False,
        "queryPrimitives": {
            "urlProbe": True,
            "websiteProbe": True,
            "sitemap": True,
            "endpointSweep": True,
        },
        "objectTypes": ["homepage", "listing", "document", "download"],
        "signalModes": ["direct"],
        "compliance": {
            "piiRisk": "low",
            "browserChallengeRequiresOperatorPolicy": True,
        },
        "defaultAction": "review",
    },
    "custom_api": {
        "providerId": "custom_api",
        "providerKind": "api",
        "displayName": "Custom API",
        "discoverySupported": True,
        "ingestionSupported": False,
        "promotionMode": "needs_config",
        "accessMode": "operator_config",
        "authRequired": True,
        "queryPrimitives": {"openapiProbe": True},
        "objectTypes": ["openapi", "endpoint", "schema"],
        "signalModes": ["direct"],
        "compliance": {"requiresOperatorConfig": True, "piiRisk": "medium"},
        "defaultAction": "needs_config",
    },
    "email_imap": {
        "providerId": "email_imap",
        "providerKind": "email",
        "displayName": "Email IMAP",
        "discoverySupported": True,
        "ingestionSupported": True,
        "promotionMode": "needs_config",
        "accessMode": "operator_mailbox_config",
        "authRequired": True,
        "queryPrimitives": {"newsletterDetect": True},
        "objectTypes": ["newsletter", "message", "archive"],
        "signalModes": ["direct", "hidden"],
        "compliance": {"requiresMailboxConfig": True, "piiRisk": "high"},
        "defaultAction": "needs_config",
    },
    "youtube": {
        "providerId": "youtube",
        "providerKind": "social_video",
        "displayName": "YouTube",
        "discoverySupported": True,
        "ingestionSupported": False,
        "promotionMode": "monitor_only",
        "accessMode": "official_api",
        "authRequired": True,
        "queryPrimitives": {
            "keywordSearch": True,
            "channelSearch": True,
            "regionCode": True,
            "languageHint": True,
        },
        "objectTypes": ["video", "channel", "playlist", "comment"],
        "signalModes": ["direct", "hidden"],
        "rateLimit": {"searchListCostUnits": 100},
        "compliance": {"requiresOfficialApi": True, "piiRisk": "medium"},
        "defaultAction": "monitor_only",
    },
    "x_recent_search": {
        "providerId": "x_recent_search",
        "providerKind": "social_microblog",
        "displayName": "X recent search",
        "discoverySupported": True,
        "ingestionSupported": False,
        "promotionMode": "monitor_only",
        "accessMode": "official_api",
        "authRequired": True,
        "queryPrimitives": {
            "keywordSearch": True,
            "recentSearchWindowDays": 7,
            "operators": True,
            "language": True,
            "hashtags": True,
        },
        "objectTypes": ["post", "profile"],
        "signalModes": ["direct", "hidden"],
        "compliance": {"requiresOfficialApi": True, "piiRisk": "high"},
        "defaultAction": "monitor_only",
    },
    "reddit": {
        "providerId": "reddit",
        "providerKind": "community_forum",
        "displayName": "Reddit",
        "discoverySupported": True,
        "ingestionSupported": False,
        "promotionMode": "monitor_only",
        "accessMode": "official_api",
        "authRequired": True,
        "queryPrimitives": {
            "keywordSearch": True,
            "subredditScope": True,
            "listingPagination": True,
        },
        "objectTypes": ["post", "comment", "subreddit"],
        "signalModes": ["direct", "hidden"],
        "compliance": {
            "oauthRequired": True,
            "deletedContentRemovalRequired": True,
            "userAgentRequired": True,
            "piiRisk": "high",
        },
        "defaultAction": "monitor_only",
    },
    "meta_content_library": {
        "providerId": "meta_content_library",
        "providerKind": "social_research_library",
        "displayName": "Meta Content Library",
        "discoverySupported": True,
        "ingestionSupported": False,
        "promotionMode": "monitor_only",
        "accessMode": "official_research_tool",
        "authRequired": True,
        "queryPrimitives": {"keywordSearch": True, "publicContentLibrary": True},
        "objectTypes": [
            "facebook_page_post",
            "facebook_group_post",
            "instagram_post",
            "threads_post",
        ],
        "signalModes": ["direct", "hidden"],
        "compliance": {
            "requiresQualifiedAccess": True,
            "unauthorizedScrapingBlocked": True,
            "piiRisk": "high",
        },
        "defaultAction": "monitor_only",
    },
    "tiktok_research": {
        "providerId": "tiktok_research",
        "providerKind": "social_video",
        "displayName": "TikTok Research",
        "discoverySupported": True,
        "ingestionSupported": False,
        "promotionMode": "monitor_only",
        "accessMode": "official_research_api",
        "authRequired": True,
        "queryPrimitives": {"keywordSearch": True, "researchQuery": True},
        "objectTypes": ["account", "content", "shop"],
        "signalModes": ["direct", "hidden"],
        "compliance": {
            "requiresApplicationApproval": True,
            "commercialUseRestricted": True,
            "piiRisk": "high",
        },
        "defaultAction": "monitor_only",
    },
}


def get_provider_card(provider_id: str) -> ProviderCard | None:
    card = PROVIDER_CAPABILITIES.get(provider_id)
    return deepcopy(card) if card is not None else None


def require_provider_card(provider_id: str) -> ProviderCard:
    card = get_provider_card(provider_id)
    if card is None:
        raise ValueError(f"Unknown discovery provider: {provider_id}")
    return card


def provider_supports_signal_mode(provider_id: str, signal_mode: str) -> bool:
    card = get_provider_card(provider_id)
    if card is None:
        return False
    return signal_mode in set(card.get("signalModes") or [])


def provider_supports_query(provider_id: str, query_kind: str) -> bool:
    card = get_provider_card(provider_id)
    if card is None:
        return False
    primitives = card.get("queryPrimitives")
    return bool(isinstance(primitives, dict) and primitives.get(query_kind))


def provider_requires_config(provider_id: str) -> bool:
    card = get_provider_card(provider_id)
    if card is None:
        return True
    if bool(card.get("authRequired")):
        return True
    return card.get("promotionMode") == "needs_config"


def provider_allows_promotion(provider_id: str) -> bool:
    card = get_provider_card(provider_id)
    if card is None:
        return False
    return card.get("promotionMode") in {
        "auto_or_manual",
        "manual",
        "manual_or_guarded_auto",
    }


def provider_default_action(provider_id: str) -> str:
    card = get_provider_card(provider_id)
    if card is None:
        return "needs_config"
    return str(card.get("defaultAction") or "review")


def provider_compliance_score(provider_id: str, action: str) -> float:
    card = get_provider_card(provider_id)
    if card is None:
        return 0.0
    compliance = card.get("compliance") if isinstance(card.get("compliance"), dict) else {}
    if compliance.get("unauthorizedScrapingBlocked") and action not in {
        "monitor",
        "detect_only",
        "needs_config",
    }:
        return 0.2
    if compliance.get("requiresQualifiedAccess") or compliance.get("requiresApplicationApproval"):
        return 0.5 if action in {"monitor", "detect_only", "needs_config"} else 0.35
    if compliance.get("requiresOfficialApi") and card.get("accessMode") != "official_api":
        return 0.4
    if compliance.get("piiRisk") == "high" and action == "auto_promote":
        return 0.3
    return 1.0
