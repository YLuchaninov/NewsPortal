from __future__ import annotations

import re

from .interfaces import ArticleFeatureSet

FEATURE_VERSION = 1
SEARCH_VECTOR_VERSION = 1

SHORT_TOKEN_PATTERN = re.compile(r"\b[0-9A-Za-zА-Яа-яЁёІіЇїЄєҐґ-]{2,5}\b")
NUMBER_PATTERN = re.compile(r"\b\d+(?:[.,:/-]\d+)*\b")
TITLECASE_PATTERN = re.compile(
    r"\b[A-ZА-ЯІЇЄҐ][a-zа-яіїєґ'’-]+(?:\s+[A-ZА-ЯІЇЄҐ][a-zа-яіїєґ'’-]+){0,2}\b"
)
PLACE_CONTEXT_PATTERN = re.compile(
    r"\b(?:in|at|from|near|across|outside|inside|around|within)\s+"
    r"([A-ZА-ЯІЇЄҐ][a-zа-яіїєґ'’-]+(?:\s+[A-ZА-ЯІЇЄҐ][a-zа-яіїєґ'’-]+){0,2})\b"
)
STOPWORDS = {
    "a",
    "an",
    "and",
    "for",
    "from",
    "has",
    "have",
    "into",
    "its",
    "new",
    "not",
    "now",
    "off",
    "per",
    "the",
    "this",
    "that",
    "their",
    "them",
    "they",
    "with",
}


def _dedupe_preserve_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        normalized = value.strip()
        if not normalized:
            continue
        key = normalized.casefold()
        if key in seen:
            continue
        seen.add(key)
        result.append(normalized)
    return result


class HeuristicArticleFeatureExtractor:
    feature_version = FEATURE_VERSION
    search_vector_version = SEARCH_VECTOR_VERSION

    def extract(self, title: str, lead: str, body: str) -> ArticleFeatureSet:
        combined = " ".join(part for part in (title, lead, body) if part)
        numbers = _dedupe_preserve_order(NUMBER_PATTERN.findall(combined))
        short_tokens = self._extract_short_tokens(combined)
        places = self._extract_places(combined)
        entities = self._extract_entities(combined, places)
        return ArticleFeatureSet(
            numbers=numbers,
            short_tokens=short_tokens,
            places=places,
            entities=entities,
            feature_version=self.feature_version,
            search_vector_version=self.search_vector_version,
        )

    def _extract_short_tokens(self, text: str) -> list[str]:
        candidates = SHORT_TOKEN_PATTERN.findall(text)
        filtered: list[str] = []
        for candidate in candidates:
            lowered = candidate.casefold()
            if lowered in STOPWORDS:
                continue
            if candidate.isdigit():
                continue
            filtered.append(candidate)
        return _dedupe_preserve_order(filtered)

    def _extract_places(self, text: str) -> list[str]:
        matches = [match.group(1) for match in PLACE_CONTEXT_PATTERN.finditer(text)]
        return _dedupe_preserve_order(matches)

    def _extract_entities(self, text: str, places: list[str]) -> list[str]:
        place_keys = {place.casefold() for place in places}
        entities: list[str] = []
        for match in TITLECASE_PATTERN.findall(text):
            if match.casefold() in place_keys:
                continue
            entities.append(match)
        return _dedupe_preserve_order(entities)
