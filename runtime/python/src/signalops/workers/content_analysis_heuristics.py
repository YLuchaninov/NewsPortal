from __future__ import annotations

from typing import Any, Callable, Mapping

from .content_analysis_heuristic_terms import (
    CATEGORY_TERMS,
    DATE_PATTERN,
    GPE_HINTS,
    NEGATIVE_TERMS,
    ORG_HINT_PATTERN,
    POSITIVE_TERMS,
    RISK_TERMS,
    TITLECASE_PATTERN,
    WORD_PATTERN,
)
from .content_analysis_runtime import (
    merge_terms,
    normalize_key,
    read_config_float,
    read_config_int,
)

DEFAULT_MAX_TEXT_CHARS = 50_000


def classify_entity(text: str) -> str:
    if text in GPE_HINTS:
        return "GPE"
    if ORG_HINT_PATTERN.search(text):
        return "ORG"
    if len(text.split()) >= 2:
        return "PERSON"
    return "ORG"


def tokenize(text: str, *, max_chars: int = DEFAULT_MAX_TEXT_CHARS) -> list[str]:
    return [match.group(0).casefold() for match in WORD_PATTERN.finditer(text[:max_chars])]


def score_terms(tokens: list[str], terms: set[str]) -> tuple[int, list[str]]:
    token_counts: dict[str, int] = {}
    for token in tokens:
        token_counts[token] = token_counts.get(token, 0) + 1
    matched = sorted(term for term in terms if token_counts.get(term.casefold(), 0) > 0)
    total = sum(token_counts.get(term.casefold(), 0) for term in terms)
    return total, matched


def extract_heuristic_entities(
    text: str,
    *,
    max_chars: int = DEFAULT_MAX_TEXT_CHARS,
    config: Mapping[str, Any] | None = None,
    normalize_key_func: Callable[[str], str] = normalize_key,
) -> list[dict[str, Any]]:
    config = config or {}
    bounded_text = text[:max_chars]
    allowed_types_raw = config.get("entityTypeAllowlist")
    allowed_types = (
        {str(item).strip().upper() for item in allowed_types_raw if str(item).strip()}
        if isinstance(allowed_types_raw, list)
        else set()
    )
    mentions_by_key: dict[tuple[str, str], dict[str, Any]] = {}
    for match in TITLECASE_PATTERN.finditer(bounded_text):
        entity_text = match.group(0).strip()
        if len(entity_text) < 3:
            continue
        entity_type = classify_entity(entity_text)
        if allowed_types and entity_type not in allowed_types:
            continue
        key = (entity_type, normalize_key_func(entity_text))
        current = mentions_by_key.setdefault(
            key,
            {
                "text": entity_text,
                "type": entity_type,
                "normalizedKey": key[1],
                "mentions": [],
            },
        )
        current["mentions"].append(
            {
                "text": entity_text,
                "start": match.start(),
                "end": match.end(),
            }
        )
    for match in DATE_PATTERN.finditer(bounded_text):
        entity_text = match.group(0)
        if allowed_types and "DATE" not in allowed_types:
            continue
        key = ("DATE", normalize_key_func(entity_text))
        mentions_by_key[key] = {
            "text": entity_text,
            "type": "DATE",
            "normalizedKey": key[1],
            "mentions": [{"text": entity_text, "start": match.start(), "end": match.end()}],
        }
    entities = list(mentions_by_key.values())
    entities.sort(key=lambda item: (-len(item["mentions"]), str(item["text"]).casefold()))
    total_mentions = sum(len(item["mentions"]) for item in entities) or 1
    for entity in entities:
        mention_count = len(entity["mentions"])
        entity["mentionCount"] = mention_count
        entity["confidence"] = min(0.95, 0.55 + (0.08 * mention_count))
        entity["salience"] = mention_count / total_mentions
    return entities


def analyze_sentiment(
    text: str,
    *,
    max_chars: int = DEFAULT_MAX_TEXT_CHARS,
    config: Mapping[str, Any] | None = None,
    merge_terms_func: Callable[[set[str], Mapping[str, Any], str], set[str]] = merge_terms,
    read_config_float_func: Callable[[Mapping[str, Any], str, float], float] = read_config_float,
    read_config_int_func: Callable[[Mapping[str, Any], str, int], int] = read_config_int,
) -> dict[str, Any]:
    config = config or {}
    tokens = tokenize(text, max_chars=max_chars)
    positive_count, positive_terms = score_terms(
        tokens, merge_terms_func(POSITIVE_TERMS, config, "positiveTerms")
    )
    negative_count, negative_terms = score_terms(
        tokens, merge_terms_func(NEGATIVE_TERMS, config, "negativeTerms")
    )
    risk_count, risk_terms = score_terms(
        tokens, merge_terms_func(RISK_TERMS, config, "riskTerms")
    )
    total_signal = positive_count + negative_count
    polarity_score = 0.0 if total_signal == 0 else (positive_count - negative_count) / total_signal
    positive_threshold = read_config_float_func(config, "positiveThreshold", 0.2)
    negative_threshold = read_config_float_func(config, "negativeThreshold", -0.2)
    if polarity_score >= positive_threshold:
        sentiment = "positive"
    elif polarity_score <= negative_threshold:
        sentiment = "negative"
    else:
        sentiment = "neutral"
    risk_score = min(1.0, risk_count / max(1, read_config_int_func(config, "riskScaleTerms", 5)))
    high_risk_threshold = read_config_float_func(config, "highRiskThreshold", 0.4)
    risk_watch_threshold = read_config_float_func(config, "riskWatchThreshold", 0.0)
    tone = (
        "high_risk"
        if risk_score >= high_risk_threshold
        else ("risk_watch" if risk_score > risk_watch_threshold else "standard")
    )
    confidence = min(0.95, 0.45 + (0.08 * total_signal) + (0.04 * risk_count))
    return {
        "sentiment": sentiment,
        "score": round(polarity_score, 4),
        "positiveCount": positive_count,
        "negativeCount": negative_count,
        "riskCount": risk_count,
        "riskScore": round(risk_score, 4),
        "tone": tone,
        "matchedTerms": {
            "positive": positive_terms[:20],
            "negative": negative_terms[:20],
            "risk": risk_terms[:20],
        },
        "confidence": confidence,
        "textChars": min(len(text), max_chars),
    }


def analyze_categories(
    text: str,
    *,
    max_chars: int = DEFAULT_MAX_TEXT_CHARS,
    config: Mapping[str, Any] | None = None,
    normalize_key_func: Callable[[str], str] = normalize_key,
    read_config_float_func: Callable[[Mapping[str, Any], str, float], float] = read_config_float,
    read_config_int_func: Callable[[Mapping[str, Any], str, int], int] = read_config_int,
) -> dict[str, Any]:
    config = config or {}
    tokens = tokenize(text, max_chars=max_chars)
    category_results: list[dict[str, Any]] = []
    category_terms: dict[str, set[str]] = {key: set(terms) for key, terms in CATEGORY_TERMS.items()}
    custom_terms = config.get("taxonomyTerms")
    if isinstance(custom_terms, Mapping):
        for raw_key, raw_terms in custom_terms.items():
            category_key = normalize_key_func(str(raw_key))
            if not category_key or not isinstance(raw_terms, list):
                continue
            terms = category_terms.setdefault(category_key, set())
            for raw_term in raw_terms:
                term = str(raw_term).strip().casefold()
                if term:
                    terms.add(term)
    min_score = read_config_float_func(config, "minScore", 0.0)
    max_categories = max(1, read_config_int_func(config, "maxCategories", 50))
    for category_key, terms in category_terms.items():
        count, matched_terms = score_terms(tokens, terms)
        if count <= 0:
            continue
        score = min(1.0, count / 5)
        if score < min_score:
            continue
        category_results.append(
            {
                "key": category_key,
                "name": category_key.replace("_", " ").title(),
                "score": round(score, 4),
                "termCount": count,
                "matchedTerms": matched_terms[:20],
                "confidence": min(0.95, 0.5 + (0.08 * count)),
            }
        )
    category_results.sort(key=lambda item: (-float(item["score"]), str(item["key"])))
    category_results = category_results[:max_categories]
    primary = category_results[0]["key"] if category_results else "general"
    confidence = float(category_results[0]["confidence"]) if category_results else 0.35
    return {
        "primaryCategory": primary,
        "categories": category_results,
        "categoryCount": len(category_results),
        "confidence": confidence,
        "textChars": min(len(text), max_chars),
    }
