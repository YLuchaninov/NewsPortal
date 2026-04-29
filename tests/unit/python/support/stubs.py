from __future__ import annotations

import sys
import types
from typing import Any


def install_psycopg_stub(
    *,
    connection: type[Any] | None = None,
    async_connection: type[Any] | None = None,
    async_cursor: type[Any] | None = None,
    json_wrapper: type[Any] | None = None,
) -> None:
    if "psycopg" not in sys.modules:
        psycopg_stub = types.ModuleType("psycopg")
        psycopg_stub.connect = lambda *args, **kwargs: None
        if connection is not None:
            psycopg_stub.Connection = connection
        if async_connection is not None:
            psycopg_stub.AsyncConnection = async_connection
        if async_cursor is not None:
            psycopg_stub.AsyncCursor = async_cursor
        sys.modules["psycopg"] = psycopg_stub

    if "psycopg.rows" not in sys.modules:
        psycopg_rows_stub = types.ModuleType("psycopg.rows")
        psycopg_rows_stub.dict_row = object()
        sys.modules["psycopg.rows"] = psycopg_rows_stub

    if "psycopg.types" not in sys.modules:
        sys.modules["psycopg.types"] = types.ModuleType("psycopg.types")

    if "psycopg.types.json" not in sys.modules:
        psycopg_types_json_stub = types.ModuleType("psycopg.types.json")
        psycopg_types_json_stub.Json = json_wrapper if json_wrapper is not None else lambda value: value
        sys.modules["psycopg.types.json"] = psycopg_types_json_stub


def install_redis_stub(redis_cls: type[Any]) -> None:
    if "redis" not in sys.modules:
        redis_stub = types.ModuleType("redis")
        redis_stub.Redis = redis_cls
        sys.modules["redis"] = redis_stub


def install_bullmq_stub(job_cls: type[Any], worker_cls: type[Any]) -> None:
    if "bullmq" not in sys.modules:
        bullmq_stub = types.ModuleType("bullmq")
        bullmq_stub.Job = job_cls
        bullmq_stub.Worker = worker_cls
        sys.modules["bullmq"] = bullmq_stub


def install_gemini_stub() -> None:
    if "services.workers.app.gemini" not in sys.modules:
        gemini_stub = types.ModuleType("services.workers.app.gemini")
        gemini_stub.review_with_gemini = lambda *args, **kwargs: None
        gemini_stub.DEFAULT_PRICE_CARD = {
            "default": {
                "input_cost_per_million_tokens_usd": 0.10,
                "output_cost_per_million_tokens_usd": 0.40,
            }
        }
        gemini_stub.PRICE_CARD_VERSION = "test"
        sys.modules["services.workers.app.gemini"] = gemini_stub


def install_worker_runtime_import_stubs() -> None:
    class _AsyncConnection:
        def __class_getitem__(cls, _item):
            return cls

        @staticmethod
        async def connect(*args, **kwargs):
            return None

    class _AsyncCursor:
        def __class_getitem__(cls, _item):
            return cls

    class _Json:
        def __init__(self, value):
            self.value = value

    class _RedisClient:
        def ping(self):
            return True

        def close(self):
            return None

    class _Redis:
        @staticmethod
        def from_url(_url):
            return _RedisClient()

    class _Job:
        def __init__(self, data=None):
            self.data = data or {}

    class _Worker:
        def __init__(self, *args, **kwargs):
            return None

        def on(self, *args, **kwargs):
            return None

        async def close(self):
            return None

    install_psycopg_stub(
        async_connection=_AsyncConnection,
        async_cursor=_AsyncCursor,
        json_wrapper=_Json,
    )
    install_redis_stub(_Redis)
    install_bullmq_stub(_Job, _Worker)

    if "indexer.app" not in sys.modules:
        indexer_pkg_stub = types.ModuleType("indexer")
        sys.modules["indexer"] = indexer_pkg_stub
        indexer_stub = types.ModuleType("indexer.app")

        class _InterestCentroidIndexer:
            def __init__(self, _config):
                return None

            async def rebuild_interest_centroids(self):
                return {"status": "ok"}

            async def rebuild_event_cluster_centroids(self):
                return {"status": "ok"}

        indexer_stub.InterestCentroidIndexer = _InterestCentroidIndexer
        indexer_stub.load_indexer_config = lambda: {}
        sys.modules["indexer.app"] = indexer_stub

    if "ml.app" not in sys.modules:
        ml_pkg_stub = types.ModuleType("ml")
        sys.modules["ml"] = ml_pkg_stub
        ml_stub = types.ModuleType("ml.app")

        class _CriterionBaselineCompiler:
            pass

        class _HeuristicArticleFeatureExtractor:
            def extract(self, *args, **kwargs):
                return types.SimpleNamespace(numbers=[], short_tokens=[], places=[], entities=[])

        class _InterestBaselineCompiler:
            def compile(self, *args, **kwargs):
                raise NotImplementedError

        ml_stub.CriterionBaselineCompiler = _CriterionBaselineCompiler
        ml_stub.HeuristicArticleFeatureExtractor = _HeuristicArticleFeatureExtractor
        ml_stub.InterestBaselineCompiler = _InterestBaselineCompiler
        ml_stub.load_embedding_provider = lambda: object()
        ml_stub.mix_weighted_vectors = lambda *args, **kwargs: []
        ml_stub.truncate_text_for_embedding = lambda text, *_args, **_kwargs: text
        sys.modules["ml.app"] = ml_stub

    if "services.workers.app.delivery" not in sys.modules:
        delivery_stub = types.ModuleType("services.workers.app.delivery")
        delivery_stub.dispatch_channel_message = lambda *args, **kwargs: types.SimpleNamespace(
            status="queued",
            detail="stubbed",
            delivery_payload_json={},
        )
        sys.modules["services.workers.app.delivery"] = delivery_stub

    install_gemini_stub()
