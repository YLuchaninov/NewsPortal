import sys
import types
import unittest
from datetime import datetime, timedelta, timezone


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
                return types.SimpleNamespace(
                    numbers=[],
                    short_tokens=[],
                    places=[],
                    entities=[],
                )

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


_install_worker_import_stubs()

from services.workers.app import main as worker_main


class WorkerHardFilterTests(unittest.TestCase):
    def _make_article(self, *, title: str, lead: str = "", body: str = "") -> dict[str, str]:
        return {
            "title": title,
            "lead": lead,
            "body": body,
            "lang": "en",
            "published_at": datetime.now(timezone.utc).isoformat(),
        }

    def test_must_have_terms_pass_when_any_term_matches(self) -> None:
        passes, reasons, within_window = worker_main.passes_hard_filters(
            article=self._make_article(
                title="Enterprise launches vendor selection for ERP implementation partner"
            ),
            article_features={"places": [], "short_tokens": [], "entities": [], "numbers": []},
            hard_constraints={
                "must_have_terms": ["rfp", "vendor selection"],
                "time_window_hours": 168,
            },
        )

        self.assertTrue(passes)
        self.assertEqual(reasons, [])
        self.assertTrue(within_window)

    def test_must_have_terms_fail_only_when_no_term_matches(self) -> None:
        passes, reasons, within_window = worker_main.passes_hard_filters(
            article=self._make_article(
                title="Company announces new internal platform roadmap"
            ),
            article_features={"places": [], "short_tokens": [], "entities": [], "numbers": []},
            hard_constraints={
                "must_have_terms": ["rfp", "vendor selection"],
                "time_window_hours": 168,
            },
        )

        self.assertFalse(passes)
        self.assertEqual(reasons, ["must_have_any"])
        self.assertTrue(within_window)

    def test_blank_time_window_behaves_as_no_age_limit(self) -> None:
        article = self._make_article(title="Old but still relevant")
        article["published_at"] = (
            datetime.now(timezone.utc) - timedelta(days=365)
        ).isoformat()

        passes, reasons, within_window = worker_main.passes_hard_filters(
            article=article,
            article_features={"places": [], "short_tokens": [], "entities": [], "numbers": []},
            hard_constraints={},
        )

        self.assertTrue(passes)
        self.assertEqual(reasons, [])
        self.assertTrue(within_window)

    def test_rejects_wrapper_directory_noise_without_direct_request_signal(self) -> None:
        passes, reasons, within_window = worker_main.passes_hard_filters(
            article=self._make_article(
                title="Cold Calling Freelance Jobs: Work Remote & Earn Online",
                body=(
                    "Browse by Category. Hire freelancers. Find work. "
                    "Search buyers can search offers to buy now."
                ),
            ),
            article_features={"places": [], "short_tokens": [], "entities": [], "numbers": []},
            hard_constraints={},
        )

        self.assertFalse(passes)
        self.assertIn("wrapper_directory_noise", reasons)
        self.assertTrue(within_window)

    def test_keeps_buyer_request_page_even_with_marketplace_wrapper_text(self) -> None:
        passes, reasons, within_window = worker_main.passes_hard_filters(
            article=self._make_article(
                title="Looking for Developer Support on Ongoing Technical Projects",
                body=(
                    "Post Project. Browse by Category. Hire freelancers. "
                    "Search freelancers to request a proposal."
                ),
            ),
            article_features={"places": [], "short_tokens": [], "entities": [], "numbers": []},
            hard_constraints={},
        )

        self.assertTrue(passes)
        self.assertNotIn("wrapper_directory_noise", reasons)
        self.assertTrue(within_window)

    def test_content_analysis_backfill_defaults_are_safe(self) -> None:
        self.assertEqual(
            worker_main.normalize_content_analysis_backfill_subject_types(None),
            ["article", "web_resource", "story_cluster"],
        )
        self.assertEqual(
            worker_main.normalize_content_analysis_backfill_modules(None),
            {
                "ner",
                "sentiment",
                "category",
                "cluster_summary",
                "system_interest_labels",
                "content_filter",
            },
        )
        self.assertEqual(
            worker_main.normalize_content_analysis_backfill_modules(["structured_extraction"]),
            {"structured_extraction"},
        )
        self.assertEqual(
            worker_main.build_content_analysis_backfill_progress_patch(
                processed_items=3,
                total_items=9,
            ),
            {"progress": {"processedContentItems": 3, "totalContentItems": 9}},
        )

    def test_content_analysis_missing_clause_tracks_policy_key_for_gate(self) -> None:
        clause, params = worker_main.build_content_analysis_missing_clause(
            subject_type="web_resource",
            modules={"content_filter"},
            policy_key="recent_gate",
            alias="wr.resource_id",
        )

        self.assertIn("content_filter_results", clause)
        self.assertEqual(params, ["web_resource", "recent_gate"])

    def test_content_analysis_missing_clause_supports_story_cluster_summary(self) -> None:
        clause, params = worker_main.build_content_analysis_missing_clause(
            subject_type="story_cluster",
            modules={"cluster_summary"},
            policy_key="recent_gate",
            alias="sc.story_cluster_id",
        )

        self.assertIn("analysis_type = 'cluster_summary'", clause)
        self.assertEqual(params, [])

    def test_content_analysis_missing_clause_supports_structured_extraction(self) -> None:
        clause, params = worker_main.build_content_analysis_missing_clause(
            subject_type="article",
            modules={"structured_extraction"},
            policy_key="recent_gate",
            alias="a.doc_id",
        )

        self.assertIn("analysis_type = 'structured_extraction'", clause)
        self.assertEqual(params, ["article"])


if __name__ == "__main__":
    unittest.main()
