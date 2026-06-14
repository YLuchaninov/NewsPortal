from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from signalops.ml.embedding import DEFAULT_HASH_MODEL_KEY
from signalops.runtime_config import build_database_url

REPO_ROOT = Path(__file__).resolve().parents[5]
WORKSPACE_ROOT = Path("/workspace")


def resolve_runtime_path(path: str | Path) -> Path:
    candidate = Path(path)
    if candidate.is_absolute() and not WORKSPACE_ROOT.exists():
        try:
            return REPO_ROOT / candidate.relative_to(WORKSPACE_ROOT)
        except ValueError:
            return candidate
    return candidate


@dataclass(frozen=True)
class IndexerConfig:
    database_url: str
    index_root: str
    snapshot_root: str
    default_model_key: str
    default_dimensions: int
    hnsw_m: int
    hnsw_ef_construction: int
    hnsw_ef_search: int


def load_indexer_config() -> IndexerConfig:
    return IndexerConfig(
        database_url=build_database_url(),
        index_root=os.getenv("HNSW_INDEX_ROOT", "/workspace/data/indices"),
        snapshot_root=os.getenv("HNSW_SNAPSHOT_ROOT", "/workspace/data/snapshots"),
        default_model_key=os.getenv("EMBEDDING_MODEL", DEFAULT_HASH_MODEL_KEY),
        default_dimensions=int(os.getenv("EMBEDDING_HASH_DIMENSIONS", "384")),
        hnsw_m=int(os.getenv("HNSW_M", "16")),
        hnsw_ef_construction=int(os.getenv("HNSW_EF_CONSTRUCTION", "200")),
        hnsw_ef_search=int(os.getenv("HNSW_EF_SEARCH", "64")),
    )
