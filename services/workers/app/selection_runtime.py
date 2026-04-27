from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import datetime, timezone
from typing import Any

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
    "freelance jobs",
    "remote jobs",
    "jobs online",
    "work remote & earn online",
    "employment",
    "talent network",
    "browse jobs",
)

_WRAPPER_DIRECTORY_BODY_FRAGMENTS = (
    "browse by category",
    "hire freelancers",
    "find work",
    "search buyers can",
    "search freelancers to request a proposal",
    "freelancers can search projects to quote on",
    "top freelancers",
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


def has_wrapper_directory_noise(article: Mapping[str, Any]) -> bool:
    title_and_lead = " ".join(
        str(article.get(field) or "")
        for field in ("title", "lead")
    ).casefold()
    article_text = " ".join(
        str(article.get(field) or "")
        for field in ("title", "lead", "body")
    ).casefold()
    if any(fragment in title_and_lead for fragment in _DIRECT_REQUEST_TITLE_FRAGMENTS):
        return False

    title_hits = [
        fragment for fragment in _WRAPPER_DIRECTORY_TITLE_FRAGMENTS if fragment in title_and_lead
    ]
    if "search results" in title_hits:
        return True

    body_hit_count = sum(
        1 for fragment in _WRAPPER_DIRECTORY_BODY_FRAGMENTS if fragment in article_text
    )
    return bool(title_hits) and body_hit_count >= 2


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
