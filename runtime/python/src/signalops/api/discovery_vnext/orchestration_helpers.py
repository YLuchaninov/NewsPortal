from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse


def rank_search_results(
    results: list[dict[str, Any]],
    *,
    interest: dict[str, Any],
    query_text: str,
) -> list[dict[str, Any]]:
    tokens = search_quality_tokens(interest) or tokens_from_text(query_text)
    ranked: list[tuple[int, int, dict[str, Any]]] = []
    for index, result in enumerate(results):
        if not isinstance(result, dict):
            continue
        url = str(result.get("url") or result.get("candidateUrl") or "")
        if is_search_ad_or_noise_url(url):
            continue
        text = " ".join(str(result.get(key) or "") for key in ("url", "title", "snippet")).lower()
        score = sum(1 for token in tokens if token in text)
        if tokens and score < min(2, len(tokens)):
            continue
        if looks_like_primary_source(url):
            score += 2
        if any(
            term in text
            for term in (
                "official",
                "portal",
                "notice",
                "advisory",
                "changelog",
                "grant",
                "tender",
                "consultation",
            )
        ):
            score += 1
        ranked.append((score, -index, result))
    ranked.sort(reverse=True)
    return [result for _score, _rank, result in ranked]


def search_quality_tokens(interest: dict[str, Any]) -> list[str]:
    values: list[str] = []
    for key in (
        "positive_texts",
        "positiveTexts",
        "candidate_positive_signals",
        "candidatePositiveSignals",
    ):
        value = interest.get(key)
        if isinstance(value, list):
            values.extend(str(item) for item in value)
        elif isinstance(value, str):
            values.append(value)
    return tokens_from_text(" ".join(values))


def tokens_from_text(text: str) -> list[str]:
    stopwords = {
        "about",
        "after",
        "call",
        "from",
        "into",
        "official",
        "public",
        "source",
        "that",
        "this",
        "with",
        "without",
    }
    tokens: list[str] = []
    for token in re.findall(r"[a-z][a-z0-9_-]{4,}", text.lower()):
        if token in stopwords or token in tokens:
            continue
        tokens.append(token)
    return tokens


def is_search_ad_or_noise_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
    except ValueError:
        return True
    host = (parsed.hostname or "").lower()
    path = parsed.path.lower()
    if not host:
        return True
    if host in {"bing.com", "www.bing.com"} and path.startswith("/aclick"):
        return True
    if host.endswith("googleadservices.com") or host.endswith("doubleclick.net"):
        return True
    return False


def looks_like_primary_source(url: str) -> bool:
    try:
        host = (urlparse(url).hostname or "").lower()
    except ValueError:
        return False
    return host.endswith((".gov", ".gob", ".europa.eu", ".int", ".edu", ".ac.uk"))


def looks_like_document_url(url: str) -> bool:
    return bool(re.search(r"\.(pdf|docx?|xlsx?|pptx?|rtf)(?:$|\?)", url.lower()))


def reresolve_reason_code(scope_type: str, paused: bool) -> str:
    if paused:
        return f"auto_paused_forbidden_scope:{scope_type}"
    if scope_type in {"document_collection", "api_endpoint", "search_endpoint"}:
        return f"moved_to_adapter_backlog:{scope_type}"
    return f"scope_metadata_refreshed:{scope_type}"
