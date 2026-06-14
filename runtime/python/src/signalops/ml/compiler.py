from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any

from .embedding import mean_vectors, normalize_vector
from .interfaces import CompiledRepresentation, EmbeddingProvider


def _coerce_text_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        try:
            decoded = json.loads(value)
        except json.JSONDecodeError:
            return [value.strip()] if value.strip() else []
        return _coerce_text_list(decoded)
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, tuple):
        return [str(item).strip() for item in value if str(item).strip()]
    return []


def _dedupe_preserve_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        key = value.casefold()
        if key in seen:
            continue
        seen.add(key)
        result.append(value)
    return result


def _build_lexical_query(description: str, positive_texts: list[str]) -> str:
    lexemes: list[str] = []
    for raw_value in [description, *positive_texts]:
        for token in raw_value.split():
            normalized = "".join(character for character in token.lower() if character.isalnum())
            if len(normalized) < 3:
                continue
            lexemes.append(normalized)
    return " ".join(_dedupe_preserve_order(lexemes))


def _build_hard_constraints(source: Mapping[str, Any]) -> dict[str, Any]:
    raw_time_window = source.get("time_window_hours")
    time_window_hours = None
    if raw_time_window not in (None, ""):
        time_window_hours = int(raw_time_window)

    return {
        "must_have_terms": _coerce_text_list(source.get("must_have_terms")),
        "must_not_have_terms": _coerce_text_list(source.get("must_not_have_terms")),
        "places": _coerce_text_list(source.get("places")),
        "languages_allowed": _coerce_text_list(source.get("languages_allowed")),
        "time_window_hours": time_window_hours,
        "short_tokens_required": _coerce_text_list(source.get("short_tokens_required")),
        "short_tokens_forbidden": _coerce_text_list(source.get("short_tokens_forbidden")),
        "priority": float(source.get("priority") or 1.0),
        "enabled": bool(source.get("enabled", True)),
        "notification_mode": source.get("notification_mode"),
    }


class _BaselineCompiler:
    def compile(
        self,
        source: Mapping[str, Any],
        embedding_provider: EmbeddingProvider,
    ) -> CompiledRepresentation:
        description = str(source.get("description") or "").strip()
        if not description:
            raise ValueError("Compiled representations require a non-empty description.")

        positive_texts = _coerce_text_list(source.get("positive_texts"))
        negative_texts = _coerce_text_list(source.get("negative_texts"))
        positive_prototypes = _dedupe_preserve_order([description, *positive_texts])
        negative_prototypes = _dedupe_preserve_order(negative_texts)

        if not positive_prototypes:
            raise ValueError("Compiled representations require at least one positive prototype.")
        if not negative_prototypes:
            raise ValueError("Compiled representations require at least one negative prototype.")

        positive_embeddings = embedding_provider.embed_texts(positive_prototypes)
        negative_embeddings = embedding_provider.embed_texts(negative_prototypes)
        centroid_embedding = normalize_vector(mean_vectors(positive_embeddings))
        source_snapshot = dict(source)
        source_snapshot["positive_texts"] = positive_texts
        source_snapshot["negative_texts"] = negative_texts

        return CompiledRepresentation(
            source_snapshot=source_snapshot,
            positive_prototypes=positive_prototypes,
            negative_prototypes=negative_prototypes,
            lexical_query=_build_lexical_query(description, positive_texts),
            hard_constraints=_build_hard_constraints(source),
            positive_embeddings=positive_embeddings,
            negative_embeddings=negative_embeddings,
            centroid_embedding=centroid_embedding,
            model_key=embedding_provider.model_key,
            dimensions=embedding_provider.dimensions,
        )


class InterestBaselineCompiler(_BaselineCompiler):
    pass


class CriterionBaselineCompiler(_BaselineCompiler):
    pass
