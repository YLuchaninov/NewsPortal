from __future__ import annotations

import hashlib
import logging
import math
import os
from collections.abc import Sequence
from typing import Any

DEFAULT_SENTENCE_TRANSFORMER_MODEL = (
    "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
)

LOGGER = logging.getLogger("newsportal.ml.embedding")


def normalize_vector(values: Sequence[float]) -> list[float]:
    norm = math.sqrt(sum(float(value) * float(value) for value in values))
    if norm <= 0.0:
        return [0.0 for _ in values]
    return [float(value) / norm for value in values]


def mean_vectors(vectors: Sequence[Sequence[float]]) -> list[float]:
    if not vectors:
        return []

    dimensions = len(vectors[0])
    totals = [0.0] * dimensions
    for vector in vectors:
        for index, value in enumerate(vector):
            totals[index] += float(value)
    return [value / float(len(vectors)) for value in totals]


def mix_weighted_vectors(weighted_vectors: Sequence[tuple[float, Sequence[float]]]) -> list[float]:
    if not weighted_vectors:
        return []

    dimensions = len(weighted_vectors[0][1])
    totals = [0.0] * dimensions
    for weight, vector in weighted_vectors:
        for index, value in enumerate(vector):
            totals[index] += float(weight) * float(value)
    return normalize_vector(totals)


def truncate_text_for_embedding(
    value: str,
    token_limit: int | None = None,
    tail_token_limit: int | None = None,
) -> str:
    tokens = value.split()
    safe_token_limit = token_limit or int(os.getenv("EMBEDDING_BODY_TOKEN_LIMIT", "256"))
    safe_tail_token_limit = tail_token_limit or int(
        os.getenv("EMBEDDING_BODY_TAIL_TOKEN_LIMIT", "32")
    )

    if len(tokens) <= safe_token_limit:
        return value.strip()

    head_tokens = tokens[:safe_token_limit]
    tail_tokens = tokens[-safe_tail_token_limit:] if safe_tail_token_limit > 0 else []
    merged = head_tokens + (["..."] if tail_tokens else []) + tail_tokens
    return " ".join(merged).strip()


class HashEmbeddingProvider:
    def __init__(self, dimensions: int = 384) -> None:
        self.model_key = f"hash://deterministic/{dimensions}"
        self.dimensions = dimensions

    def embed_texts(self, texts: Sequence[str]) -> list[list[float]]:
        return [self._embed_text(text) for text in texts]

    def _embed_text(self, text: str) -> list[float]:
        payload = text.encode("utf-8") or b"\x00"
        values: list[float] = []
        counter = 0
        while len(values) < self.dimensions:
            digest = hashlib.sha256(payload + counter.to_bytes(4, "big")).digest()
            for offset in range(0, len(digest), 4):
                if len(values) >= self.dimensions:
                    break
                chunk = digest[offset : offset + 4]
                if len(chunk) < 4:
                    chunk = chunk.ljust(4, b"\x00")
                number = int.from_bytes(chunk, "big", signed=False)
                values.append((number / 0xFFFFFFFF) * 2.0 - 1.0)
            counter += 1
        return normalize_vector(values)


class SentenceTransformerEmbeddingProvider:
    def __init__(
        self,
        model_name: str,
        fallback_to_hash: bool = True,
        hash_dimensions: int = 384,
    ) -> None:
        self.model_key = model_name
        self._model_name = model_name
        self._fallback_to_hash = fallback_to_hash
        self._fallback_provider = HashEmbeddingProvider(hash_dimensions)
        self._model: Any | None = None
        self.dimensions = self._fallback_provider.dimensions

    def embed_texts(self, texts: Sequence[str]) -> list[list[float]]:
        try:
            model = self._load_model()
            raw_vectors = model.encode(
                list(texts),
                normalize_embeddings=True,
                show_progress_bar=False,
            )
            vectors: list[list[float]] = [
                [float(value) for value in raw_vector]
                for raw_vector in raw_vectors
            ]
            if vectors:
                self.dimensions = len(vectors[0])
            return vectors
        except Exception as error:  # pragma: no cover - fallback path depends on env
            if not self._fallback_to_hash:
                raise

            LOGGER.warning(
                "Falling back to deterministic hash embeddings for %s: %s",
                self._model_name,
                error,
            )
            self.model_key = self._fallback_provider.model_key
            self.dimensions = self._fallback_provider.dimensions
            return self._fallback_provider.embed_texts(texts)

    def _load_model(self) -> Any:
        if self._model is not None:
            return self._model

        from sentence_transformers import SentenceTransformer

        cache_dir = os.getenv("MODEL_CACHE_DIR")
        self._model = SentenceTransformer(self._model_name, cache_folder=cache_dir)
        try:
            dimensions = self._model.get_sentence_embedding_dimension()
        except AttributeError:
            dimensions = None
        if isinstance(dimensions, int) and dimensions > 0:
            self.dimensions = dimensions
        return self._model


def load_embedding_provider() -> HashEmbeddingProvider | SentenceTransformerEmbeddingProvider:
    backend = os.getenv("EMBEDDING_BACKEND", "auto").strip().lower()
    dimensions = int(os.getenv("EMBEDDING_HASH_DIMENSIONS", "384"))

    if backend == "hash":
        return HashEmbeddingProvider(dimensions)

    model_name = os.getenv("EMBEDDING_MODEL", DEFAULT_SENTENCE_TRANSFORMER_MODEL)
    fallback_to_hash = backend in {"auto", "", "sentence-transformers"}
    return SentenceTransformerEmbeddingProvider(
        model_name=model_name,
        fallback_to_hash=fallback_to_hash,
        hash_dimensions=dimensions,
    )
