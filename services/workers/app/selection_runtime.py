from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

from .runtime_json import coerce_text_list
from .runtime_values import coerce_nullable_positive_int
from .scoring import hours_between, parse_datetime, place_match_score


def passes_allowed_content_kind(
    *,
    article: Mapping[str, Any],
    allowed_content_kinds: Sequence[str],
) -> tuple[bool, str]:
    article_content_kind = str(article.get("content_kind") or "editorial").strip() or "editorial"
    normalized_allowed = {
        str(value).strip()
        for value in allowed_content_kinds
        if str(value).strip()
    }
    if not normalized_allowed:
        return (True, article_content_kind)
    return (article_content_kind in normalized_allowed, article_content_kind)


_WRAPPER_DIRECTORY_TITLE_FRAGMENTS = (
    "search results",
    "remote jobs",
    "jobs online",
    "work remote & earn online",
    "employment",
    "talent network",
    "browse jobs",
    "browse profiles",
    "provider directory",
)

_WRAPPER_DIRECTORY_BODY_FRAGMENTS = (
    "browse by category",
    "browse profiles",
    "find work",
    "search buyers can",
    "search providers to request a proposal",
    "providers can search projects to quote on",
    "top providers",
    "talent network",
    "work remote & earn online",
    "jobs online",
)

_DIRECT_REQUEST_TITLE_FRAGMENTS = (
    "looking for",
    "need ",
    "seeking ",
    "request for",
    "rfp",
    "quote",
    "proposals",
    "fixed price",
    "open for proposals",
    "vendor selection",
    "implementation partner",
    "migration partner",
    "take over",
    "continue development",
    "support takeover",
)

_SELLER_LANDING_TITLE_FRAGMENTS = (
    "contact us",
    "get started",
    "start now",
    "it's free",
    "4.9/5",
    "on clutch",
)

_GENERIC_ADVICE_TITLE_PREFIXES = (
    "how to ",
    "how ",
    "guide to ",
    "what is ",
    "why ",
)


def has_wrapper_directory_noise(article: Mapping[str, Any]) -> bool:
    url = str(article.get("url") or "").strip()
    if _has_search_ad_url(url) or _has_wrapper_category_url(url):
        return True

    title_and_lead = " ".join(
        str(article.get(field) or "")
        for field in ("title", "lead")
    ).casefold()
    article_text = " ".join(
        str(article.get(field) or "")
        for field in ("title", "lead", "body")
    ).casefold()
    if _has_professional_network_noise_url(url, title_and_lead):
        return True
    if _looks_like_job_only_page(title_and_lead):
        return True
    if any(fragment in title_and_lead for fragment in _DIRECT_REQUEST_TITLE_FRAGMENTS):
        return False

    if _looks_like_seller_landing_page(title_and_lead) or _looks_like_generic_advice(title_and_lead):
        return True

    title_hits = [
        fragment for fragment in _WRAPPER_DIRECTORY_TITLE_FRAGMENTS if fragment in title_and_lead
    ]
    if "search results" in title_hits:
        return True

    body_hit_count = sum(
        1 for fragment in _WRAPPER_DIRECTORY_BODY_FRAGMENTS if fragment in article_text
    )
    return bool(title_hits) and body_hit_count >= 2


def _has_search_ad_url(url: str) -> bool:
    if not url:
        return False
    try:
        parsed = urlparse(url)
    except ValueError:
        return False

    hostname = (parsed.hostname or "").casefold()
    path = parsed.path.casefold()
    return (
        (hostname.endswith("bing.com") and path == "/aclick")
        or hostname.endswith("googleadservices.com")
        or hostname.endswith("doubleclick.net")
    )


def _has_wrapper_category_url(url: str) -> bool:
    if not url:
        return False
    try:
        parsed = urlparse(url)
    except ValueError:
        return False

    hostname = (parsed.hostname or "").casefold()
    path_parts = [part for part in parsed.path.casefold().split("/") if part]
    query = parsed.query.casefold()

    if hostname.endswith("peopleperhour.com") and path_parts[:1] == ["freelance-jobs"]:
        # PeoplePerHour project-detail URLs carry a concrete detail slug/id. Category
        # lanes such as /freelance-jobs/technology-programming/software-testing are
        # acquisition wrappers, not buyer-authored project asks.
        tail = path_parts[1:]
        if tail and not any(any(char.isdigit() for char in part) for part in tail):
            return True
    if hostname.endswith("upwork.com") and not path_parts and "s=" in query:
        return True
    if "filters=tag" in query or "filter=tag" in query:
        return True
    if any(part in {"tag", "tags", "category", "categories"} for part in path_parts):
        return True
    return False


def _has_professional_network_noise_url(url: str, title_and_lead: str) -> bool:
    if not url:
        return False
    try:
        parsed = urlparse(url)
    except ValueError:
        return False

    hostname = (parsed.hostname or "").casefold()
    path_parts = [part for part in parsed.path.casefold().split("/") if part]
    if "linkedin." not in hostname:
        return False

    if path_parts[:1] in (["pulse"], ["in"], ["jobs"]):
        return True
    if path_parts[:1] == ["posts"] and _looks_like_job_only_page(title_and_lead):
        return True
    return False


def _looks_like_job_only_page(title_and_lead: str) -> bool:
    job_markers = (
        " remote job",
        " job ",
        " job,",
        " job.",
        " job:",
        " jobs ",
        " job opening",
        " hiring ",
        " careers ",
        " apply now",
        " salary ",
        " full-time",
        " full time",
        " part-time",
        " part time",
    )
    if any(marker in f" {title_and_lead} " for marker in job_markers):
        project_markers = (
            "fixed price",
            "fixed-price",
            "open for proposals",
            "request for proposal",
            "rfp",
            "rfq",
            "quote",
            "vendor selection",
            "implementation partner",
            "migration partner",
        )
        return not any(marker in title_and_lead for marker in project_markers)
    return False


def _looks_like_seller_landing_page(title_and_lead: str) -> bool:
    return any(fragment in title_and_lead for fragment in _SELLER_LANDING_TITLE_FRAGMENTS)


def _looks_like_generic_advice(title_and_lead: str) -> bool:
    return any(title_and_lead.strip().startswith(prefix) for prefix in _GENERIC_ADVICE_TITLE_PREFIXES)


def passes_hard_filters(
    *,
    article: Mapping[str, Any],
    article_features: Mapping[str, Sequence[str]],
    hard_constraints: Mapping[str, Any],
) -> tuple[bool, list[str], bool]:
    reasons: list[str] = []
    article_lang = str(article.get("lang") or "").strip().lower()
    article_text = " ".join(
        str(article.get(field) or "")
        for field in ("title", "lead", "body")
    ).casefold()
    allowed_languages = {value.casefold() for value in coerce_text_list(hard_constraints.get("languages_allowed"))}
    if allowed_languages and article_lang and article_lang not in allowed_languages:
        reasons.append("language")

    time_window_hours = coerce_nullable_positive_int(hard_constraints.get("time_window_hours"))
    published_at = parse_datetime(article.get("published_at"))
    now = datetime.now(timezone.utc)
    within_window = (
        True
        if time_window_hours is None
        else published_at is not None and hours_between(now, published_at) <= time_window_hours
    )
    if not within_window:
        reasons.append("time_window")

    must_have_terms = coerce_text_list(hard_constraints.get("must_have_terms"))
    if must_have_terms and not any(
        value.casefold() in article_text for value in must_have_terms
    ):
        reasons.append("must_have_any")

    for value in coerce_text_list(hard_constraints.get("must_not_have_terms")):
        if value.casefold() in article_text:
            reasons.append(f"must_not:{value}")

    target_places = coerce_text_list(hard_constraints.get("places"))
    if target_places and place_match_score(article_features.get("places", []), target_places) <= 0.0:
        reasons.append("places")

    required_short_tokens = {value.casefold() for value in coerce_text_list(hard_constraints.get("short_tokens_required"))}
    article_short_tokens = {
        value.casefold()
        for value in coerce_text_list(article_features.get("short_tokens"))
    }
    if required_short_tokens and not required_short_tokens.issubset(article_short_tokens):
        reasons.append("short_tokens_required")

    forbidden_short_tokens = {
        value.casefold()
        for value in coerce_text_list(hard_constraints.get("short_tokens_forbidden"))
    }
    if forbidden_short_tokens & article_short_tokens:
        reasons.append("short_tokens_forbidden")

    if has_wrapper_directory_noise(article):
        reasons.append("wrapper_directory_noise")

    return (len(reasons) == 0, reasons, within_window)
