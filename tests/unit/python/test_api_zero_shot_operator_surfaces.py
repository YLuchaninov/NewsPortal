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
        self.assertEqual(result["items"][0]["doc_id"], "doc-1")
        self.assertEqual(result["items"][0]["selection_guidance"]["tone"], "neutral")
        query_count.assert_called_once()
        items_sql = query_all.call_args.args[0]
        self.assertIn("left join document_observations obs", items_sql)
        self.assertIn("obs.observation_state", items_sql)
        self.assertIn("obs.duplicate_kind", items_sql)
        self.assertIn("obs.canonical_document_id::text as canonical_document_id", items_sql)
        self.assertIn("fsr.story_cluster_id::text as story_cluster_id", items_sql)
        self.assertIn("fsr.verification_target_type", items_sql)
        self.assertIn("fsr.explain_json ->> 'selectionMode' as final_selection_mode", items_sql)
        self.assertIn("fsr.explain_json ->> 'selectionSummary' as final_selection_summary", items_sql)
        self.assertIn("fsr.explain_json ->> 'selectionReason' as final_selection_reason", items_sql)
        self.assertIn("as final_selection_llm_review_pending_count", items_sql)
        self.assertIn("as final_selection_hold_count", items_sql)
        self.assertIn("as final_selection_canonical_review_reused", items_sql)
        self.assertIn("as final_selection_duplicate_article_count_for_canonical", items_sql)
        self.assertIn("as final_selection_reuse_source", items_sql)

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
        self.assertIn("final_selection_mode", sql)
        self.assertIn("final_selection_summary", sql)
        self.assertIn("final_selection_reason", sql)
        self.assertIn("final_selection_llm_review_pending_count", sql)
        self.assertIn("final_selection_hold_count", sql)
        self.assertIn("final_selection_canonical_review_reused", sql)
        self.assertIn("final_selection_duplicate_article_count_for_canonical", sql)
        self.assertIn("final_selection_reuse_source", sql)

    def test_get_article_includes_selection_diagnostics_from_article_read_model(self) -> None:
        with (
            patch.object(
                api_main,
                "query_one",
                return_value={
                    "doc_id": "doc-1",
                    "final_selection_decision": "gray_zone",
                    "final_selection_mode": "hold",
                    "final_selection_summary": "Gray zone held by profile policy",
                    "final_selection_reason": "semantic_hold",
                    "final_selection_hold_count": 1,
                    "final_selection_llm_review_pending_count": 0,
                    "system_feed_decision": "filtered_out",
                },
            ),
            patch.object(api_main, "query_all", side_effect=[[], [], [], []]),
        ):
            article = api_main.get_article("doc-1")

        diagnostics = article["selection_diagnostics"]
        self.assertEqual(article["selection_mode"], "hold")
        self.assertEqual(article["selection_source"], "final_selection_results")
        self.assertEqual(diagnostics["selectionMode"], "hold")
        self.assertEqual(diagnostics["selectionSummary"], "Gray zone held by profile policy")
        self.assertEqual(
            diagnostics["downstreamLossBucket"],
            "articles_missing_interest_filter_results",
        )
        self.assertEqual(
            diagnostics["selectionBlockerStage"], "interest_filtering"
        )
        self.assertEqual(
            diagnostics["selectionBlockerReason"], "missing_interest_filter_results"
        )
        self.assertEqual(diagnostics["holdReason"], None)
        self.assertEqual(diagnostics["holdCount"], 1)
        self.assertEqual(diagnostics["notificationRows"], 0)
        self.assertEqual(article["selection_guidance"]["tone"], "warning")

    def test_get_article_marks_compatibility_only_selection_payload_when_final_row_missing(self) -> None:
        with (
            patch.object(
                api_main,
                "query_one",
                return_value={
                    "doc_id": "doc-compat",
                    "system_feed_decision": "eligible",
                    "system_feed_eligible": True,
                },
            ),
            patch.object(api_main, "query_all", side_effect=[[], [], [], []]),
        ):
            article = api_main.get_article("doc-compat")

        self.assertEqual(article["selection_source"], "system_feed_results")
        self.assertEqual(article["selection_decision"], "eligible")
        self.assertEqual(article["selection_mode"], "compatibility_only")
        self.assertEqual(article["selection_summary"], "Compatibility projection: eligible")
        self.assertEqual(article["selection_guidance"]["tone"], "neutral")

    def test_get_article_explain_returns_stage6_selection_summary(self) -> None:
        article = {
            "doc_id": "doc-1",
            "final_selection_decision": "selected",
            "final_selection_selected": True,
            "final_selection_verification_state": "strong",
            "final_selection_reason": "semantic_match",
            "final_selection_llm_review_pending_count": 0,
            "final_selection_hold_count": 0,
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
                    {"final_decision": "selected"},
                    {"decision": "eligible"},
                    {"canonical_document_id": "canonical-1"},
                    {"story_cluster_id": "cluster-1"},
                ],
            ),
        ):
            result = api_main.get_article_explain("doc-1")

        self.assertEqual(result["selection_explain"]["source"], "final_selection_results")
        self.assertEqual(result["selection_explain"]["canonicalDocumentId"], "canonical-1")
        self.assertEqual(result["selection_explain"]["storyClusterId"], "cluster-1")
        self.assertEqual(result["selection_explain"]["verificationState"], "strong")
        self.assertEqual(result["selection_explain"]["selectionMode"], "selected")
        self.assertEqual(result["selection_explain"]["selectionReason"], "semantic_match")
        self.assertEqual(result["selection_diagnostics"]["selectionMode"], "selected")
        self.assertEqual(
            result["selection_diagnostics"]["downstreamLossBucket"],
            "articles_missing_interest_filter_results",
        )
        self.assertEqual(
            result["selection_diagnostics"]["selectionBlockerStage"],
            "interest_filtering",
        )
        self.assertEqual(result["selection_diagnostics"]["systemCriterionRows"], 0)
        self.assertEqual(result["selection_guidance"]["tone"], "positive")
        self.assertEqual(len(result["verification_results"]), 2)

    def test_get_article_explain_surfaces_canonical_reuse_metadata(self) -> None:
        article = {
            "doc_id": "doc-reused",
            "final_selection_decision": "selected",
            "final_selection_selected": True,
            "final_selection_verification_state": "strong",
            "system_feed_decision": "eligible",
            "system_feed_eligible": True,
            "canonical_document_id": "canonical-reused",
        }

        with (
            patch.object(api_main, "get_article", return_value=article),
            patch.object(api_main, "query_all", return_value=[]),
            patch.object(
                api_main,
                "query_one",
                side_effect=[
                    {
                        "final_decision": "selected",
                        "is_selected": True,
                        "verification_state": "strong",
                        "explain_json": {
                            "canonicalReviewReused": True,
                            "canonicalReviewReusedCount": 3,
                            "canonicalSelectionReused": True,
                            "duplicateArticleCountForCanonical": 6,
                            "selectionReuseSource": "canonical_reused",
                        },
                    },
                    {"decision": "eligible"},
                    None,
                    None,
                ],
            ),
        ):
            result = api_main.get_article_explain("doc-reused")

        explain = result["selection_explain"]
        self.assertEqual(explain["selectionReuseSource"], "canonical_reused")
        self.assertEqual(explain["reviewSource"], "reused_canonical_llm_review")
        self.assertEqual(explain["canonicalReviewReused"], True)
        self.assertEqual(explain["canonicalReviewReusedCount"], 3)
        self.assertEqual(explain["canonicalSelectionReused"], True)
        self.assertEqual(explain["duplicateArticleCountForCanonical"], 6)

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
                    "final_selection_reason": "semantic_match",
                    "final_selection_hold_count": 0,
                    "final_selection_llm_review_pending_count": 0,
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
        self.assertEqual(explain["selectionMode"], "selected")
        self.assertEqual(explain["selectionSummary"], "Selected by final-selection policy")
        self.assertEqual(result["selection_diagnostics"]["selectionMode"], "selected")
        self.assertEqual(result["selection_diagnostics"]["notificationRows"], 0)
        self.assertEqual(result["selection_guidance"]["tone"], "positive")

    def test_content_item_explain_marks_compatibility_projection_as_compatibility_only(self) -> None:
        with (
            patch.object(
                api_main,
                "get_content_item",
                return_value={
                    "origin_type": "editorial",
                    "system_feed_decision": "eligible",
                    "system_feed_eligible": True,
                },
            ),
            patch.object(api_main, "query_all", return_value=[]),
            patch.object(
                api_main,
                "query_one",
                side_effect=[None, {"decision": "eligible"}],
            ),
        ):
            result = api_main.get_content_item_explain("editorial:doc-compat")

        explain = result["selection_explain"]
        self.assertEqual(explain["source"], "system_feed_results")
        self.assertEqual(explain["decision"], "eligible")
        self.assertEqual(explain["selectionMode"], "compatibility_only")
        self.assertEqual(explain["selectionSummary"], "Compatibility projection: eligible")
        self.assertEqual(result["selection_guidance"]["tone"], "neutral")

    def test_get_content_item_falls_back_to_editorial_article_when_family_preview_hides_exact_duplicate(self) -> None:
        article = {
            "doc_id": "doc-dup",
            "url": "https://example.test/dup",
            "title": "Duplicate article",
            "lead": "Lead",
            "lang": "en",
            "published_at": "2026-04-14T09:00:00Z",
            "ingested_at": "2026-04-14T09:01:00Z",
            "updated_at": "2026-04-14T09:02:00Z",
            "source_name": "Example",
            "author_name": "Reporter",
            "read_time_seconds": 120,
            "final_selection_decision": "selected",
            "final_selection_selected": True,
            "system_feed_decision": "eligible",
            "system_feed_eligible": True,
            "has_media": False,
            "primary_media_kind": None,
            "primary_media_url": None,
            "primary_media_thumbnail_url": None,
            "primary_media_source_url": None,
            "primary_media_title": None,
            "primary_media_alt_text": None,
            "like_count": 0,
            "dislike_count": 0,
            "summary": None,
            "body_html": None,
            "full_content_html": "<p>Body</p>",
        }

        with (
            patch.object(api_main, "get_article", return_value=article) as get_article,
            patch.object(
                api_main,
                "get_selected_content_item_preview",
                side_effect=api_main.HTTPException(
                    status_code=404, detail="Content item not found."
                ),
            ) as get_preview,
        ):
            result = api_main.get_content_item("editorial:doc-dup")

        get_article.assert_called_once_with("doc-dup")
        get_preview.assert_called_once_with("editorial:doc-dup")
        self.assertEqual(result["content_item_id"], "editorial:doc-dup")
        self.assertEqual(result["origin_type"], "editorial")
        self.assertEqual(result["origin_id"], "doc-dup")
        self.assertEqual(result["system_selection_decision"], "selected")
        self.assertEqual(result["system_selected"], True)
        self.assertEqual(result["summary"], "Lead")
        self.assertEqual(result["body_html"], "<p>Body</p>")

    def test_article_explain_marks_profile_hold_as_hold_in_selection_summary(self) -> None:
        article = {
            "doc_id": "doc-2",
            "final_selection_decision": "gray_zone",
            "final_selection_selected": False,
            "final_selection_verification_state": "weak",
            "final_selection_reason": "semantic_hold",
            "final_selection_llm_review_pending_count": 0,
            "final_selection_hold_count": 1,
            "system_feed_decision": "filtered_out",
            "system_feed_eligible": False,
            "observation_state": "canonicalized",
            "duplicate_kind": "canonical",
            "canonical_document_id": "canonical-2",
            "story_cluster_id": "cluster-2",
            "verification_target_type": "story_cluster",
            "verification_target_id": "cluster-2",
            "story_cluster_verification_state": "weak",
            "canonical_verification_state": "weak",
        }

        with (
            patch.object(api_main, "get_article", return_value=article),
            patch.object(
                api_main,
                "query_all",
                side_effect=[
                    [{"target_type": "canonical_document", "target_id": "canonical-2"}],
                    [{"target_type": "story_cluster", "target_id": "cluster-2"}],
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
                    {
                        "final_decision": "gray_zone",
                        "explain_json": {
                            "selectionReason": "semantic_hold",
                            "filterCounts": {"hold": 1, "llmReviewPending": 0},
                        },
                    },
                    {"decision": "filtered_out"},
                    {"canonical_document_id": "canonical-2"},
                    {"story_cluster_id": "cluster-2"},
                ],
            ),
        ):
            result = api_main.get_article_explain("doc-2")

        explain = result["selection_explain"]
        self.assertEqual(explain["selectionMode"], "hold")
        self.assertEqual(explain["selectionReason"], "semantic_hold")
        self.assertEqual(explain["holdCount"], 1)
        self.assertEqual(explain["llmReviewPendingCount"], 0)
        diagnostics = result["selection_diagnostics"]
        self.assertEqual(diagnostics["selectionMode"], "hold")
        self.assertEqual(
            diagnostics["downstreamLossBucket"],
            "articles_missing_interest_filter_results",
        )
        self.assertEqual(
            diagnostics["selectionBlockerStage"], "interest_filtering"
        )
        self.assertEqual(
            diagnostics["selectionBlockerReason"], "missing_interest_filter_results"
        )
        self.assertEqual(diagnostics["grayZoneRows"], 0)
        self.assertEqual(diagnostics["holdCount"], 1)
        self.assertEqual(result["selection_guidance"]["tone"], "warning")


if __name__ == "__main__":
    unittest.main()
