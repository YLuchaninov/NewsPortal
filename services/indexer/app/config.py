from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path

SERVICES_ROOT = Path(__file__).resolve().parents[2]
if str(SERVICES_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICES_ROOT))

from ml.app.embedding import DEFAULT_SENTENCE_TRANSFORMER_MODEL


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


def _build_database_url() -> str:
    if os.getenv("DATABASE_URL"):
        return os.environ["DATABASE_URL"]

    user = os.getenv("POSTGRES_USER", "newsportal")
    password = os.getenv("POSTGRES_PASSWORD", "newsportal")
    host = os.getenv("POSTGRES_HOST", "127.0.0.1")
    port = os.getenv(
        "POSTGRES_PORT",
        "55432" if host in {"127.0.0.1", "localhost"} else "5432",
    )
    database = os.getenv("POSTGRES_DB", "newsportal")
    return f"postgresql://{user}:{password}@{host}:{port}/{database}"


def load_indexer_config() -> IndexerConfig:
    return IndexerConfig(
        database_url=_build_database_url(),
        index_root=os.getenv("HNSW_INDEX_ROOT", "/workspace/data/indices"),
        snapshot_root=os.getenv("HNSW_SNAPSHOT_ROOT", "/workspace/data/snapshots"),
        default_model_key=os.getenv("EMBEDDING_MODEL", DEFAULT_SENTENCE_TRANSFORMER_MODEL),
        default_dimensions=int(os.getenv("EMBEDDING_HASH_DIMENSIONS", "384")),
        hnsw_m=int(os.getenv("HNSW_M", "16")),
        hnsw_ef_construction=int(os.getenv("HNSW_EF_CONSTRUCTION", "200")),
        hnsw_ef_search=int(os.getenv("HNSW_EF_SEARCH", "64")),
    )
