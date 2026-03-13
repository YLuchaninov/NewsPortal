from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(frozen=True)
class ArticleFeatureSet:
    numbers: list[str]
    short_tokens: list[str]
    places: list[str]
    entities: list[str]
    feature_version: int
    search_vector_version: int


@dataclass(frozen=True)
class CompiledRepresentation:
    source_snapshot: dict[str, Any]
    positive_prototypes: list[str]
    negative_prototypes: list[str]
    lexical_query: str
    hard_constraints: dict[str, Any]
    positive_embeddings: list[list[float]]
    negative_embeddings: list[list[float]]
    centroid_embedding: list[float]
    model_key: str
    dimensions: int


class EmbeddingProvider(Protocol):
    model_key: str
    dimensions: int

    def embed_texts(self, texts: Sequence[str]) -> list[list[float]]:
        ...


class FeatureExtractor(Protocol):
    feature_version: int
    search_vector_version: int

    def extract(self, title: str, lead: str, body: str) -> ArticleFeatureSet:
        ...


class InterestCompiler(Protocol):
    def compile(
        self,
        source: Mapping[str, Any],
        embedding_provider: EmbeddingProvider,
    ) -> CompiledRepresentation:
        ...


class CriterionCompiler(Protocol):
    def compile(
        self,
        source: Mapping[str, Any],
        embedding_provider: EmbeddingProvider,
    ) -> CompiledRepresentation:
        ...


class HnswIndexStore(Protocol):
    def rebuild_interest_centroids(self) -> dict[str, Any]:
        ...

    def rebuild_event_cluster_centroids(self) -> dict[str, Any]:
        ...


class HnswSnapshotStore(Protocol):
    def create_snapshot(self, source_path: str, snapshot_name: str) -> str:
        ...
