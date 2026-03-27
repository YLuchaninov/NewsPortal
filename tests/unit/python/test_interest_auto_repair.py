import unittest
import sys
import types
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch


def _install_worker_import_stubs() -> None:
    if "psycopg" not in sys.modules:
        psycopg_stub = types.ModuleType("psycopg")

        class _AsyncConnection:
            def __class_getitem__(cls, _item):
                return cls

            @staticmethod
            async def connect(*args, **kwargs):
                return None

        class _AsyncCursor:
            def __class_getitem__(cls, _item):
                return cls

        psycopg_stub.AsyncConnection = _AsyncConnection
        psycopg_stub.AsyncCursor = _AsyncCursor
        psycopg_stub.connect = lambda *args, **kwargs: None
        sys.modules["psycopg"] = psycopg_stub

    if "psycopg.rows" not in sys.modules:
        psycopg_rows_stub = types.ModuleType("psycopg.rows")
        psycopg_rows_stub.dict_row = object()
        sys.modules["psycopg.rows"] = psycopg_rows_stub

    if "psycopg.types.json" not in sys.modules:
        psycopg_types_stub = types.ModuleType("psycopg.types")
        sys.modules["psycopg.types"] = psycopg_types_stub
        psycopg_json_stub = types.ModuleType("psycopg.types.json")

        class _Json:
            def __init__(self, value):
                self.value = value

        psycopg_json_stub.Json = _Json
        sys.modules["psycopg.types.json"] = psycopg_json_stub

    if "redis" not in sys.modules:
        redis_stub = types.ModuleType("redis")

        class _RedisClient:
            def ping(self):
                return True

            def close(self):
                return None

        class _Redis:
            @staticmethod
            def from_url(_url):
                return _RedisClient()

        redis_stub.Redis = _Redis
        sys.modules["redis"] = redis_stub

    if "bullmq" not in sys.modules:
        bullmq_stub = types.ModuleType("bullmq")

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

        bullmq_stub.Job = _Job
        bullmq_stub.Worker = _Worker
        sys.modules["bullmq"] = bullmq_stub

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
                return SimpleNamespace(numbers=[], short_tokens=[], places=[], entities=[])

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
        delivery_stub.dispatch_channel_message = lambda *args, **kwargs: SimpleNamespace(
            status="queued",
            detail="stubbed",
            delivery_payload_json={},
        )
        sys.modules["services.workers.app.delivery"] = delivery_stub

    if "services.workers.app.gemini" not in sys.modules:
        gemini_stub = types.ModuleType("services.workers.app.gemini")
        gemini_stub.review_with_gemini = lambda *args, **kwargs: None
        sys.modules["services.workers.app.gemini"] = gemini_stub


_install_worker_import_stubs()

from services.workers.app import main as worker_main


class _FakeCursor:
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def execute(self, *args, **kwargs):
        return None

    async def fetchone(self):
        return None

    async def fetchall(self):
        return []


class _FakeTransaction:
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False


class _FakeConnection:
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    def transaction(self):
        return _FakeTransaction()

    def cursor(self):
        return _FakeCursor()


class InterestAutoRepairTests(unittest.IsolatedAsyncioTestCase):
    def test_build_interest_auto_repair_job_options_is_scoped(self) -> None:
        options = worker_main.build_interest_auto_repair_job_options(
            user_id="user-1",
            interest_id="interest-1",
            source_version=7,
        )

        self.assertEqual(options["userId"], "user-1")
        self.assertEqual(options["interestId"], "interest-1")
        self.assertEqual(options["sourceVersion"], 7)
        self.assertTrue(options["systemFeedOnly"])
        self.assertEqual(options["retroNotifications"], "skip")

    async def test_process_interest_compile_queues_auto_repair_on_success(self) -> None:
        compiled = SimpleNamespace(
            positive_prototypes=["AI policy"],
            positive_embeddings=[[0.1, 0.2]],
            negative_prototypes=["sports"],
            negative_embeddings=[[0.2, 0.1]],
            lexical_query="ai policy",
            hard_constraints={"languages_allowed": ["en"]},
            source_snapshot={"description": "AI policy"},
            model_key="test-model",
            dimensions=2,
            centroid_embedding=[0.15, 0.15],
        )
        features = SimpleNamespace(numbers=[], short_tokens=["ai"], places=[], entities=["EU"])
        interest_row = {
            "interest_id": "interest-1",
            "user_id": "user-1",
            "version": 2,
            "description": "AI policy",
        }

        with (
            patch.object(worker_main, "open_connection", AsyncMock(return_value=_FakeConnection())),
            patch.object(worker_main, "is_event_processed", AsyncMock(return_value=False)),
            patch.object(worker_main, "fetch_interest_for_update", AsyncMock(return_value=interest_row)),
            patch.object(worker_main.INTEREST_COMPILER, "compile", return_value=compiled),
            patch.object(worker_main.FEATURE_EXTRACTOR, "extract", return_value=features),
            patch.object(
                worker_main,
                "upsert_embedding_registry",
                AsyncMock(side_effect=["pos-1", "neg-1", "cent-1"]),
            ),
            patch.object(worker_main, "upsert_interest_vector_registry", AsyncMock()),
            patch.object(worker_main, "resolve_interest_hnsw_label", AsyncMock(return_value=11)),
            patch.object(worker_main, "mark_interest_hnsw_dirty", AsyncMock()),
            patch.object(worker_main, "upsert_interest_compiled_row", AsyncMock()),
            patch.object(worker_main, "update_interest_compile_status", AsyncMock()),
            patch.object(worker_main, "record_processed_event", AsyncMock()),
            patch.object(
                worker_main,
                "queue_interest_auto_repair_job",
                AsyncMock(return_value={"status": "queued", "reindexJobId": "job-1"}),
            ) as queue_auto_repair_job,
            patch.object(
                worker_main.INTEREST_INDEXER,
                "rebuild_interest_centroids",
                AsyncMock(return_value={"status": "ok"}),
            ),
        ):
            result = await worker_main.process_interest_compile(
                SimpleNamespace(
                    data={
                        "eventId": "evt-1",
                        "interestId": "interest-1",
                        "version": 2,
                    }
                ),
                "",
            )

        queue_auto_repair_job.assert_awaited_once_with(
            user_id="user-1",
            interest_id="interest-1",
            source_version=2,
        )
        self.assertEqual(result["status"], "compiled")
        self.assertEqual(result["autoRepair"]["status"], "queued")

    async def test_process_interest_compile_does_not_queue_auto_repair_on_failure(self) -> None:
        with (
            patch.object(worker_main, "open_connection", AsyncMock(return_value=_FakeConnection())),
            patch.object(worker_main, "is_event_processed", AsyncMock(return_value=False)),
            patch.object(
                worker_main,
                "fetch_interest_for_update",
                AsyncMock(
                    return_value={
                        "interest_id": "interest-1",
                        "user_id": "user-1",
                        "version": 1,
                        "description": "AI policy",
                    }
                ),
            ),
            patch.object(
                worker_main.INTEREST_COMPILER,
                "compile",
                side_effect=RuntimeError("compile failed"),
            ),
            patch.object(worker_main, "upsert_interest_compiled_row", AsyncMock()),
            patch.object(worker_main, "update_interest_compile_status", AsyncMock()),
            patch.object(worker_main, "record_processed_event", AsyncMock()),
            patch.object(worker_main, "queue_interest_auto_repair_job", AsyncMock()) as queue_auto_repair_job,
        ):
            result = await worker_main.process_interest_compile(
                SimpleNamespace(
                    data={
                        "eventId": "evt-2",
                        "interestId": "interest-1",
                        "version": 1,
                    }
                ),
                "",
            )

        queue_auto_repair_job.assert_not_awaited()
        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["interestId"], "interest-1")

    async def test_process_interest_compile_respects_skip_auto_repair_flag(self) -> None:
        compiled = SimpleNamespace(
            positive_prototypes=["AI policy"],
            positive_embeddings=[[0.1, 0.2]],
            negative_prototypes=["sports"],
            negative_embeddings=[[0.2, 0.1]],
            lexical_query="ai policy",
            hard_constraints={"languages_allowed": ["en"]},
            source_snapshot={"description": "AI policy"},
            model_key="test-model",
            dimensions=2,
            centroid_embedding=[0.15, 0.15],
        )
        features = SimpleNamespace(numbers=[], short_tokens=["ai"], places=[], entities=["EU"])
        interest_row = {
            "interest_id": "interest-1",
            "user_id": "user-1",
            "version": 2,
            "description": "AI policy",
        }

        with (
            patch.object(worker_main, "open_connection", AsyncMock(return_value=_FakeConnection())),
            patch.object(worker_main, "is_event_processed", AsyncMock(return_value=False)),
            patch.object(worker_main, "fetch_interest_for_update", AsyncMock(return_value=interest_row)),
            patch.object(worker_main.INTEREST_COMPILER, "compile", return_value=compiled),
            patch.object(worker_main.FEATURE_EXTRACTOR, "extract", return_value=features),
            patch.object(
                worker_main,
                "upsert_embedding_registry",
                AsyncMock(side_effect=["pos-1", "neg-1", "cent-1"]),
            ),
            patch.object(worker_main, "upsert_interest_vector_registry", AsyncMock()),
            patch.object(worker_main, "resolve_interest_hnsw_label", AsyncMock(return_value=11)),
            patch.object(worker_main, "mark_interest_hnsw_dirty", AsyncMock()),
            patch.object(worker_main, "upsert_interest_compiled_row", AsyncMock()),
            patch.object(worker_main, "update_interest_compile_status", AsyncMock()),
            patch.object(worker_main, "record_processed_event", AsyncMock()),
            patch.object(worker_main, "queue_interest_auto_repair_job", AsyncMock()) as queue_auto_repair_job,
            patch.object(
                worker_main.INTEREST_INDEXER,
                "rebuild_interest_centroids",
                AsyncMock(return_value={"status": "ok"}),
            ),
        ):
            result = await worker_main.process_interest_compile(
                SimpleNamespace(
                    data={
                        "eventId": "evt-3",
                        "interestId": "interest-1",
                        "version": 2,
                        "skipAutoRepair": True,
                    }
                ),
                "",
            )

        queue_auto_repair_job.assert_not_awaited()
        self.assertEqual(result["status"], "compiled")
        self.assertEqual(result["autoRepair"]["status"], "skipped")
        self.assertEqual(result["autoRepair"]["reason"], "skipAutoRepair")

    async def test_process_match_criteria_dispatches_llm_review_without_active_template(self) -> None:
        criterion_row = {
            "criterion_id": "11111111-1111-1111-1111-111111111111",
            "source_version": 3,
            "compiled_json": {
                "hard_constraints": {},
                "lexical_query": "ai policy",
                "target_features": {},
                "positive_embedding_ids": [],
                "negative_embedding_ids": [],
            },
        }
        article_row = {
            "doc_id": "22222222-2222-2222-2222-222222222222",
            "processing_state": "embedded",
            "title": "AI policy",
            "lead": "Lead",
            "body": "Body",
            "lang": "en",
        }

        with (
            patch.object(worker_main, "open_connection", AsyncMock(return_value=_FakeConnection())),
            patch.object(worker_main, "is_event_processed", AsyncMock(return_value=False)),
            patch.object(worker_main, "fetch_article_for_update", AsyncMock(return_value=article_row)),
            patch.object(worker_main, "fetch_article_features_row", AsyncMock(return_value={})),
            patch.object(worker_main, "fetch_article_vectors", AsyncMock(return_value={})),
            patch.object(worker_main, "list_compiled_criteria", AsyncMock(return_value=[criterion_row])),
            patch.object(worker_main, "find_prompt_template", AsyncMock(return_value=None)),
            patch.object(worker_main, "passes_hard_filters", return_value=(True, [], True)),
            patch.object(worker_main, "compute_lexical_score", AsyncMock(return_value=0.25)),
            patch.object(worker_main, "fetch_embedding_vectors_by_ids", AsyncMock(return_value=[])),
            patch.object(worker_main, "semantic_prototype_score", return_value=0.0),
            patch.object(worker_main, "compute_criterion_meta_score", return_value=(0.0, {})),
            patch.object(worker_main, "compute_criterion_final_score", return_value=0.6),
            patch.object(worker_main, "decide_criterion", return_value="gray_zone"),
            patch.object(
                worker_main,
                "insert_outbox_event",
                AsyncMock(),
            ) as insert_outbox_event,
            patch.object(
                worker_main,
                "upsert_system_feed_result",
                AsyncMock(
                    return_value={
                        "decision": "pending_llm",
                        "eligible_for_feed": False,
                        "previous_eligible_for_feed": False,
                    }
                ),
            ),
            patch.object(worker_main, "should_dispatch_clustering", return_value=False),
            patch.object(worker_main, "record_processed_event", AsyncMock()),
        ):
            result = await worker_main.process_match_criteria(
                SimpleNamespace(
                    data={
                        "eventId": "evt-criteria-1",
                        "docId": article_row["doc_id"],
                    }
                ),
                "",
            )

        insert_outbox_event.assert_awaited_once()
        call_args = insert_outbox_event.await_args.args
        self.assertEqual(call_args[1], worker_main.LLM_REVIEW_REQUESTED_EVENT)
        self.assertEqual(call_args[2], "criterion")
        self.assertEqual(call_args[4]["docId"], article_row["doc_id"])
        self.assertEqual(call_args[4]["scope"], "criterion")
        self.assertEqual(call_args[4]["targetId"], criterion_row["criterion_id"])
        self.assertIsNone(call_args[4]["promptTemplateId"])
        self.assertEqual(result["status"], "matched")
        self.assertEqual(result["criteriaCount"], 1)

    async def test_process_cluster_skips_articles_outside_system_feed(self) -> None:
        article_row = {
            "doc_id": "33333333-3333-3333-3333-333333333333",
            "processing_state": "embedded",
        }

        with (
            patch.object(worker_main, "open_connection", AsyncMock(return_value=_FakeConnection())),
            patch.object(worker_main, "is_event_processed", AsyncMock(return_value=False)),
            patch.object(worker_main, "fetch_article_for_update", AsyncMock(return_value=article_row)),
            patch.object(
                worker_main,
                "fetch_system_feed_result_row",
                AsyncMock(return_value={"eligible_for_feed": False}),
            ),
            patch.object(worker_main, "record_processed_event", AsyncMock()) as record_processed_event,
        ):
            result = await worker_main.process_cluster(
                SimpleNamespace(
                    data={
                        "eventId": "evt-cluster-1",
                        "docId": article_row["doc_id"],
                        "version": 1,
                    }
                ),
                "",
            )

        record_processed_event.assert_awaited_once()
        self.assertEqual(result["status"], "skipped-system-feed")
        self.assertEqual(result["docId"], article_row["doc_id"])

    async def test_process_match_interests_skips_articles_outside_system_feed(self) -> None:
        article_row = {
            "doc_id": "44444444-4444-4444-4444-444444444444",
            "processing_state": "embedded",
        }

        with (
            patch.object(worker_main, "open_connection", AsyncMock(return_value=_FakeConnection())),
            patch.object(worker_main, "is_event_processed", AsyncMock(return_value=False)),
            patch.object(worker_main, "fetch_article_for_update", AsyncMock(return_value=article_row)),
            patch.object(
                worker_main,
                "fetch_system_feed_result_row",
                AsyncMock(return_value={"eligible_for_feed": False}),
            ),
            patch.object(worker_main, "record_processed_event", AsyncMock()) as record_processed_event,
        ):
            result = await worker_main.process_match_interests(
                SimpleNamespace(
                    data={
                        "eventId": "evt-interests-1",
                        "docId": article_row["doc_id"],
                    }
                ),
                "",
            )

        record_processed_event.assert_awaited_once()
        self.assertEqual(result["status"], "skipped-system-feed")
        self.assertEqual(result["docId"], article_row["doc_id"])
        self.assertEqual(result["interestCount"], 0)


if __name__ == "__main__":
    unittest.main()
