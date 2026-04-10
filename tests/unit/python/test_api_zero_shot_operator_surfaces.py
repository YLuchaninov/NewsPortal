import sys
import types
import unittest
from unittest.mock import patch

if "psycopg" not in sys.modules:
    psycopg_stub = types.ModuleType("psycopg")
    psycopg_stub.connect = lambda *args, **kwargs: None
    sys.modules["psycopg"] = psycopg_stub

if "psycopg.rows" not in sys.modules:
    psycopg_rows_stub = types.ModuleType("psycopg.rows")
    psycopg_rows_stub.dict_row = object()
    sys.modules["psycopg.rows"] = psycopg_rows_stub

if "psycopg.types" not in sys.modules:
    sys.modules["psycopg.types"] = types.ModuleType("psycopg.types")

if "psycopg.types.json" not in sys.modules:
    psycopg_types_json_stub = types.ModuleType("psycopg.types.json")
    psycopg_types_json_stub.Json = lambda value: value
    sys.modules["psycopg.types.json"] = psycopg_types_json_stub

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

from services.api.app import main as api_main


class ApiZeroShotOperatorSurfaceTests(unittest.TestCase):
    def test_list_articles_query_exposes_observation_and_selection_fields(self) -> None:
        with (
            patch.object(api_main, "query_count", return_value=1) as query_count,
            patch.object(api_main, "query_all", return_value=[{"doc_id": "doc-1"}]) as query_all,
        ):
            result = api_main.list_articles(page=1, page_size=20)

        self.assertEqual(result["total"], 1)
        self.assertEqual(result["items"], [{"doc_id": "doc-1"}])
        query_count.assert_called_once()
        items_sql = query_all.call_args.args[0]
        self.assertIn("left join document_observations obs", items_sql)
        self.assertIn("obs.observation_state", items_sql)
        self.assertIn("obs.duplicate_kind", items_sql)
        self.assertIn("obs.canonical_document_id::text as canonical_document_id", items_sql)
        self.assertIn("fsr.story_cluster_id::text as story_cluster_id", items_sql)
        self.assertIn("fsr.verification_target_type", items_sql)

    def test_get_article_query_exposes_canonical_and_story_cluster_context(self) -> None:
        with (
            patch.object(api_main, "query_one", return_value={"doc_id": "doc-1"}) as query_one,
            patch.object(api_main, "query_all", return_value=[]),
        ):
            article = api_main.get_article("doc-1")

        self.assertEqual(article["doc_id"], "doc-1")
        sql = query_one.call_args.args[0]
        self.assertIn("left join document_observations obs", sql)
        self.assertIn("left join canonical_documents cd", sql)
        self.assertIn("left join story_cluster_members scm", sql)
        self.assertIn("left join story_clusters st", sql)
        self.assertIn("left join verification_results vrc", sql)
        self.assertIn("canonical_document_url", sql)
        self.assertIn("story_cluster_verification_state", sql)

    def test_get_article_explain_returns_stage6_selection_summary(self) -> None:
        article = {
            "doc_id": "doc-1",
            "final_selection_decision": "selected",
            "final_selection_selected": True,
            "final_selection_verification_state": "strong",
            "system_feed_decision": "eligible",
            "system_feed_eligible": True,
            "observation_state": "canonicalized",
            "duplicate_kind": "canonical",
            "canonical_document_id": "canonical-1",
            "story_cluster_id": "cluster-1",
            "verification_target_type": "story_cluster",
            "verification_target_id": "cluster-1",
            "story_cluster_verification_state": "strong",
            "canonical_verification_state": "medium",
        }

        with (
            patch.object(api_main, "get_article", return_value=article),
            patch.object(
                api_main,
                "query_all",
                side_effect=[
                    [{"target_type": "canonical_document", "target_id": "canonical-1"}],
                    [{"target_type": "story_cluster", "target_id": "cluster-1"}],
                    [],
                    [],
                    [],
                    [],
                    [],
                ],
            ),
            patch.object(
                api_main,
                "query_one",
                side_effect=[
                    {"canonical_document_id": "canonical-1"},
                    {"story_cluster_id": "cluster-1"},
                    {"final_decision": "selected"},
                    {"decision": "eligible"},
                ],
            ),
        ):
            result = api_main.get_article_explain("doc-1")

        self.assertEqual(result["selection_explain"]["source"], "final_selection_results")
        self.assertEqual(result["selection_explain"]["canonicalDocumentId"], "canonical-1")
        self.assertEqual(result["selection_explain"]["storyClusterId"], "cluster-1")
        self.assertEqual(result["selection_explain"]["verificationState"], "strong")
        self.assertEqual(len(result["verification_results"]), 2)

    def test_content_item_explain_includes_operator_selection_fields(self) -> None:
        with (
            patch.object(
                api_main,
                "get_content_item",
                return_value={
                    "origin_type": "editorial",
                    "system_selection_decision": "selected",
                    "system_selected": True,
                    "observation_state": "canonicalized",
                    "duplicate_kind": "canonical",
                    "canonical_document_id": "canonical-1",
                    "story_cluster_id": "cluster-1",
                    "final_selection_verification_state": "strong",
                    "verification_target_type": "story_cluster",
                    "verification_target_id": "cluster-1",
                },
            ),
            patch.object(api_main, "query_all", return_value=[]),
            patch.object(
                api_main,
                "query_one",
                side_effect=[
                    {"final_decision": "selected"},
                    {"decision": "eligible"},
                ],
            ),
        ):
            result = api_main.get_content_item_explain("editorial:doc-1")

        explain = result["selection_explain"]
        self.assertEqual(explain["canonicalDocumentId"], "canonical-1")
        self.assertEqual(explain["storyClusterId"], "cluster-1")
        self.assertEqual(explain["verificationState"], "strong")
        self.assertEqual(explain["verificationTargetType"], "story_cluster")


if __name__ == "__main__":
    unittest.main()
