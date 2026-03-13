from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from datetime import datetime, timezone
from typing import Any

EPSILON = 1e-9


def cosine_similarity(left: Sequence[float], right: Sequence[float]) -> float:
    if not left or not right or len(left) != len(right):
        return 0.0

    dot = 0.0
    left_norm = 0.0
    right_norm = 0.0
    for left_value, right_value in zip(left, right):
        left_float = float(left_value)
        right_float = float(right_value)
        dot += left_float * right_float
        left_norm += left_float * left_float
        right_norm += right_float * right_float

    if left_norm <= EPSILON or right_norm <= EPSILON:
        return 0.0

    return dot / math.sqrt(left_norm * right_norm)


def semantic_prototype_score(
    *,
    title_vector: Sequence[float],
    lead_vector: Sequence[float],
    body_vector: Sequence[float],
    prototypes: Sequence[Sequence[float]],
    title_weight: float,
    lead_weight: float,
    body_weight: float,
) -> float:
    best = 0.0
    for prototype in prototypes:
        score = (
            title_weight * cosine_similarity(title_vector, prototype)
            + lead_weight * cosine_similarity(lead_vector, prototype)
            + body_weight * cosine_similarity(body_vector, prototype)
        )
        best = max(best, score)
    return best


def overlap_ratio(doc_values: Sequence[str], target_values: Sequence[str]) -> float:
    if not target_values:
        return 0.0

    doc_keys = {str(value).casefold() for value in doc_values if str(value).strip()}
    target_keys = {str(value).casefold() for value in target_values if str(value).strip()}
    if not target_keys:
        return 0.0
    return len(doc_keys & target_keys) / (len(target_keys) + EPSILON)


def place_match_score(doc_places: Sequence[str], target_places: Sequence[str]) -> float:
    if not target_places:
        return 0.0

    doc_keys = {str(value).casefold() for value in doc_places if str(value).strip()}
    target_keys = {str(value).casefold() for value in target_places if str(value).strip()}
    if not doc_keys or not target_keys:
        return 0.0

    intersection = doc_keys & target_keys
    if not intersection:
        return 0.0
    if intersection == target_keys or len(intersection) >= max(1, len(target_keys) // 2):
        return 1.0
    return 0.5


def normalize_weighted_components(
    components: Mapping[str, tuple[float, float, bool]],
) -> float:
    weighted_total = 0.0
    weight_total = 0.0
    for value, weight, is_present in components.values():
        if not is_present:
            continue
        weighted_total += float(value) * float(weight)
        weight_total += float(weight)
    if weight_total <= EPSILON:
        return 0.0
    return weighted_total / weight_total


def compute_criterion_meta_score(
    *,
    article_features: Mapping[str, Sequence[str]],
    target_features: Mapping[str, Sequence[str]],
    place_constraints: Sequence[str],
    is_within_time_window: bool,
) -> tuple[float, dict[str, float]]:
    short_score = overlap_ratio(
        article_features.get("short_tokens", []),
        target_features.get("short_tokens", []),
    )
    number_score = overlap_ratio(
        article_features.get("numbers", []),
        target_features.get("numbers", []),
    )
    place_score = place_match_score(
        article_features.get("places", []),
        place_constraints or target_features.get("places", []),
    )
    entity_score = overlap_ratio(
        article_features.get("entities", []),
        target_features.get("entities", []),
    )
    time_score = 1.0 if is_within_time_window else 0.0
    score = normalize_weighted_components(
        {
            "short": (short_score, 0.25, bool(target_features.get("short_tokens"))),
            "num": (number_score, 0.20, bool(target_features.get("numbers"))),
            "place": (
                place_score,
                0.20,
                bool(place_constraints or target_features.get("places")),
            ),
            "time": (time_score, 0.15, True),
            "entity": (entity_score, 0.20, bool(target_features.get("entities"))),
        }
    )
    return score, {
        "S_short": short_score,
        "S_num": number_score,
        "S_place": place_score,
        "S_time": time_score,
        "S_entity": entity_score,
    }


def compute_interest_meta_score(
    *,
    article_features: Mapping[str, Sequence[str]],
    target_features: Mapping[str, Sequence[str]],
    place_constraints: Sequence[str],
    language_allowed: bool,
) -> tuple[float, dict[str, float]]:
    place_score = place_match_score(
        article_features.get("places", []),
        place_constraints or target_features.get("places", []),
    )
    lang_score = 1.0 if language_allowed else 0.0
    entity_score = overlap_ratio(
        article_features.get("entities", []),
        target_features.get("entities", []),
    )
    short_score = overlap_ratio(
        article_features.get("short_tokens", []),
        target_features.get("short_tokens", []),
    )
    score = normalize_weighted_components(
        {
            "place": (
                place_score,
                0.30,
                bool(place_constraints or target_features.get("places")),
            ),
            "lang": (lang_score, 0.25, True),
            "entity": (entity_score, 0.25, bool(target_features.get("entities"))),
            "short": (short_score, 0.20, bool(target_features.get("short_tokens"))),
        }
    )
    return score, {
        "S_place": place_score,
        "S_lang": lang_score,
        "S_entity": entity_score,
        "S_short": short_score,
    }


def normalize_fts_score(score: float) -> float:
    bounded = max(float(score), 0.0)
    return bounded / (1.0 + bounded)


def compute_criterion_final_score(
    *,
    positive_score: float,
    negative_score: float,
    lexical_score: float,
    meta_score: float,
) -> float:
    return (
        0.50 * positive_score
        + 0.25 * lexical_score
        + 0.20 * meta_score
        - 0.25 * negative_score
    )


def decide_criterion(score_final: float) -> str:
    if score_final >= 0.72:
        return "relevant"
    if score_final <= 0.45:
        return "irrelevant"
    return "gray_zone"


def compute_interest_final_score(
    *,
    positive_score: float,
    negative_score: float,
    meta_score: float,
    novelty_score: float,
    priority: float,
) -> float:
    bounded_priority = max(0.0, min(float(priority), 1.0))
    return (
        0.55 * positive_score
        + 0.15 * meta_score
        + 0.15 * novelty_score
        + 0.15 * bounded_priority
        - 0.30 * negative_score
    )


def decide_interest(score_interest: float, *, novelty_score: float, priority: float) -> str:
    if score_interest >= 0.78:
      return "notify"
    if score_interest >= 0.60:
        if novelty_score >= 1.0 or priority >= 0.9:
            return "notify"
        return "gray_zone"
    return "ignore"


def hours_between(left: datetime | None, right: datetime | None) -> float:
    if left is None or right is None:
        return 9999.0
    return abs((left - right).total_seconds()) / 3600.0


def compute_cluster_same_event_score(
    *,
    semantic_score: float,
    entity_score: float,
    geo_score: float,
    delta_hours: float,
) -> float:
    time_score = max(0.0, 1.0 - (delta_hours / 72.0))
    return (
        0.55 * semantic_score
        + 0.20 * entity_score
        + 0.15 * geo_score
        + 0.10 * time_score
    )


def decide_cluster(score_same_event: float) -> bool:
    return score_same_event >= 0.78


def parse_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc)
    try:
        text = str(value).replace("Z", "+00:00")
        return datetime.fromisoformat(text).astimezone(timezone.utc)
    except ValueError:
        return None


def is_major_update(
    *,
    existing_entities: Sequence[str],
    existing_places: Sequence[str],
    existing_numbers: Sequence[str],
    incoming_entities: Sequence[str],
    incoming_places: Sequence[str],
    incoming_numbers: Sequence[str],
) -> bool:
    existing_entity_keys = {value.casefold() for value in existing_entities}
    existing_place_keys = {value.casefold() for value in existing_places}
    existing_number_keys = {str(value) for value in existing_numbers}

    new_entities = {
        value.casefold()
        for value in incoming_entities
        if value.casefold() not in existing_entity_keys
    }
    new_places = {
        value.casefold()
        for value in incoming_places
        if value.casefold() not in existing_place_keys
    }
    new_numbers = {
        str(value)
        for value in incoming_numbers
        if str(value) not in existing_number_keys
    }
    return bool(new_entities or new_places or new_numbers)
