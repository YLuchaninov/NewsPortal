import unittest
from unittest.mock import patch

from tests.unit.python.support.stubs import install_gemini_stub, install_psycopg_stub

install_psycopg_stub()
install_gemini_stub()

from signalops.api import main as api_main


class ApiZeroShotOperatorSurfaceTests(unittest.TestCase):
    def test_list_signal_candidates_query_exposes_observation_and_selection_fields(self) -> None:
        with (
            patch.object(api_main, "query_count", return_value=1) as query_count,
            patch.object(api_main, "query_all", return_value=[{"doc_id": "doc-1"}]) as query_all,
        ):
            result = api_main.list_signal_candidates(page=1, page_size=20)

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
        self.assertIn("as final_selection_duplicate_signal_candidate_count_for_canonical", items_sql)
        self.assertIn("as final_selection_reuse_source", items_sql)

    def test_list_signal_candidates_supports_channel_and_query_filters(self) -> None:
        with (
            patch.object(api_main, "query_count", return_value=0) as query_count,
            patch.object(api_main, "query_all", return_value=[]) as query_all,
        ):
            api_main.list_signal_candidates(
                page=1,
                page_size=20,
                channel_id="00000000-0000-4000-8000-000000000001",
                q="security advisory",
            )

        count_sql, count_params = query_count.call_args.args
        self.assertIn("a.channel_id = %s", count_sql)
        self.assertIn("concat_ws(' ', coalesce(a.title, ''), coalesce(a.lead, ''), coalesce(a.url, '')) ilike %s escape '\\'", count_sql)
        self.assertEqual(
            count_params,
            ("00000000-0000-4000-8000-000000000001", "%security advisory%"),
        )
        items_sql, items_params = query_all.call_args.args
        self.assertIn("a.channel_id = %s", items_sql)
        self.assertEqual(
            items_params,
            ("00000000-0000-4000-8000-000000000001", "%security advisory%", 20, 0),
        )

    def test_signal_candidate_selection_summary_separates_raw_observations_from_signals(self) -> None:
        count_values = iter([185, 1, 0])
        decision_rows = [
            {
                "decision": "rejected",
                "count": 185,
                "selected_count": 0,
                "hold_count": 0,
                "llm_review_pending_count": 0,
            }
        ]
        with (
            patch.object(api_main, "query_count", side_effect=lambda *_args: next(count_values)) as query_count,
            patch.object(api_main, "query_all", return_value=decision_rows) as query_all,
        ):
            summary = api_main.summarize_signal_candidate_selection_counts()

        self.assertEqual(summary["counts"]["rawSignalCandidateObservations"], 185)
        self.assertEqual(summary["counts"]["blockedSignalCandidateObservations"], 1)
        self.assertEqual(summary["counts"]["pendingSelectionRows"], 0)
        self.assertEqual(summary["counts"]["selectedSignalCandidateSignals"], 0)
        self.assertEqual(summary["counts"]["rejectedRows"], 185)
        self.assertIn("Raw signal_candidate observations", summary["interpretation"])
        query_count.assert_called()
        self.assertIn("from final_selection_results", query_all.call_args.args[0])

    def test_get_signal_candidate_query_exposes_canonical_and_story_cluster_context(self) -> None:
        with (
            patch.object(api_main, "query_one", return_value={"doc_id": "doc-1"}) as query_one,
            patch.object(api_main, "query_all", return_value=[]),
        ):
            signal_candidate = api_main.get_signal_candidate("doc-1")

        self.assertEqual(signal_candidate["doc_id"], "doc-1")
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
        self.assertIn("final_selection_duplicate_signal_candidate_count_for_canonical", sql)
        self.assertIn("final_selection_reuse_source", sql)

    def test_get_signal_candidate_preserves_404_when_signal_candidate_missing(self) -> None:
        with patch.object(api_main, "query_one", return_value=None):
            with self.assertRaises(api_main.HTTPException) as raised:
                api_main.get_signal_candidate("missing-doc")

        self.assertEqual(raised.exception.status_code, 404)
        self.assertEqual(raised.exception.detail, "SignalCandidate not found.")

    def test_get_signal_candidate_includes_selection_diagnostics_from_signal_candidate_read_model(self) -> None:
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
            signal_candidate = api_main.get_signal_candidate("doc-1")

        diagnostics = signal_candidate["selection_diagnostics"]
        self.assertEqual(signal_candidate["selection_mode"], "hold")
        self.assertEqual(signal_candidate["selection_source"], "final_selection_results")
        self.assertEqual(diagnostics["selectionMode"], "hold")
        self.assertEqual(diagnostics["selectionSummary"], "Gray zone held by profile policy")
        self.assertEqual(
            diagnostics["downstreamLossBucket"],
            "signal_candidates_missing_interest_filter_results",
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
        self.assertEqual(signal_candidate["selection_guidance"]["tone"], "warning")

    def test_get_signal_candidate_marks_compatibility_only_selection_payload_when_final_row_missing(self) -> None:
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
            signal_candidate = api_main.get_signal_candidate("doc-compat")

        self.assertEqual(signal_candidate["selection_source"], "system_feed_results")
        self.assertEqual(signal_candidate["selection_decision"], "eligible")
        self.assertEqual(signal_candidate["selection_mode"], "compatibility_only")
        self.assertEqual(signal_candidate["selection_summary"], "Compatibility projection: eligible")
        self.assertEqual(signal_candidate["selection_guidance"]["tone"], "neutral")

    def test_get_signal_candidate_explain_returns_stage6_selection_summary(self) -> None:
        signal_candidate = {
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
            patch.object(api_main, "get_signal_candidate", return_value=signal_candidate),
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
            result = api_main.get_signal_candidate_explain("doc-1")

        self.assertEqual(result["selection_explain"]["source"], "final_selection_results")
        self.assertEqual(result["selection_explain"]["canonicalDocumentId"], "canonical-1")
        self.assertEqual(result["selection_explain"]["storyClusterId"], "cluster-1")
        self.assertEqual(result["selection_explain"]["verificationState"], "strong")
        self.assertEqual(result["selection_explain"]["selectionMode"], "selected")
        self.assertEqual(result["selection_explain"]["selectionReason"], "semantic_match")
        self.assertEqual(result["selection_diagnostics"]["selectionMode"], "selected")
        self.assertEqual(
            result["selection_diagnostics"]["downstreamLossBucket"],
            "signal_candidates_missing_interest_filter_results",
        )
        self.assertEqual(
            result["selection_diagnostics"]["selectionBlockerStage"],
            "interest_filtering",
        )
        self.assertEqual(result["selection_diagnostics"]["systemCriterionRows"], 0)
        self.assertEqual(result["selection_guidance"]["tone"], "positive")
        self.assertEqual(len(result["verification_results"]), 2)

    def test_get_signal_candidate_explain_surfaces_canonical_reuse_metadata(self) -> None:
        signal_candidate = {
            "doc_id": "doc-reused",
            "final_selection_decision": "selected",
            "final_selection_selected": True,
            "final_selection_verification_state": "strong",
            "system_feed_decision": "eligible",
            "system_feed_eligible": True,
            "canonical_document_id": "canonical-reused",
        }

        with (
            patch.object(api_main, "get_signal_candidate", return_value=signal_candidate),
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
                            "duplicateSignalCandidateCountForCanonical": 6,
                            "selectionReuseSource": "canonical_reused",
                        },
                    },
                    {"decision": "eligible"},
                    None,
                    None,
                ],
            ),
        ):
            result = api_main.get_signal_candidate_explain("doc-reused")

        explain = result["selection_explain"]
        self.assertEqual(explain["selectionReuseSource"], "canonical_reused")
        self.assertEqual(explain["reviewSource"], "reused_canonical_llm_review")
        self.assertEqual(explain["canonicalReviewReused"], True)
        self.assertEqual(explain["canonicalReviewReusedCount"], 3)
        self.assertEqual(explain["canonicalSelectionReused"], True)
        self.assertEqual(explain["duplicateSignalCandidateCountForCanonical"], 6)

    def test_list_signal_candidate_residuals_filters_and_shapes_selection_buckets(self) -> None:
        row = {
            "doc_id": "doc-semantic",
            "url": "https://example.com/semantic",
            "title": "Semantic miss",
            "lead": "Residual evidence",
            "lang": "en",
            "processing_state": "processed",
            "observation_state": "canonicalized",
            "duplicate_kind": "canonical",
            "final_selection_decision": "rejected",
            "final_selection_selected": False,
            "final_selection_verification_state": "weak",
            "final_selection_reason": "semantic_no_match",
            "system_feed_decision": "filtered_out",
            "system_feed_eligible": False,
            "system_criterion_rows": 2,
            "user_interest_rows": 0,
            "matched_rows": 0,
            "no_match_rows": 2,
            "gray_zone_rows": 0,
            "technical_filtered_out_rows": 0,
            "llm_review_rows": 0,
            "notification_rows": 0,
        }

        with patch.object(api_main, "query_all", return_value=[row]) as query_all:
            result = api_main.list_signal_candidate_residuals(
                downstream_loss_bucket="semantic_rejected",
                selection_blocker_stage="semantic_filter",
                selection_blocker_reason="semantic_no_match",
                selection_mode="rejected",
                verification_state="weak",
                processing_state="processed",
                observation_state="canonicalized",
                duplicate_kind="canonical",
                q="semantic",
                page=1,
                page_size=20,
            )

        self.assertEqual(result["total"], 1)
        item = result["items"][0]
        self.assertEqual(item["doc_id"], "doc-semantic")
        self.assertEqual(item["selection_mode"], "rejected")
        self.assertEqual(
            item["selection_diagnostics"]["downstreamLossBucket"],
            "semantic_rejected",
        )
        self.assertEqual(
            item["selection_diagnostics"]["selectionBlockerStage"],
            "semantic_filter",
        )
        self.assertEqual(
            item["selection_diagnostics"]["selectionBlockerReason"],
            "semantic_no_match",
        )
        self.assertEqual(item["interest_filter_summary"]["noMatchRows"], 2)
        sql = query_all.call_args.args[0]
        params = query_all.call_args.args[1]
        self.assertIn("from interest_filter_results", sql)
        self.assertIn("coalesce(fsr.verification_state, st.verification_state, vrc.verification_state)", sql)
        self.assertIn("coalesce(a.title, '') ilike %s", sql)
        self.assertIn("%semantic%", params)

    def test_list_signal_candidate_residuals_can_filter_hold_bucket_without_new_taxonomy(self) -> None:
        hold_row = {
            "doc_id": "doc-hold",
            "title": "Held row",
            "final_selection_decision": "gray_zone",
            "final_selection_reason": "semantic_hold",
            "final_selection_hold_count": 1,
            "system_criterion_rows": 2,
            "gray_zone_rows": 1,
            "llm_review_rows": 0,
            "notification_rows": 0,
        }
        selected_row = {
            "doc_id": "doc-selected",
            "title": "Selected row",
            "final_selection_decision": "selected",
            "final_selection_selected": True,
            "system_criterion_rows": 2,
            "matched_rows": 2,
            "llm_review_rows": 0,
            "notification_rows": 0,
        }

        with patch.object(api_main, "query_all", return_value=[hold_row, selected_row]):
            result = api_main.list_signal_candidate_residuals(
                downstream_loss_bucket="gray_zone_hold",
                selection_mode="hold",
                page=1,
                page_size=20,
            )

        self.assertEqual(result["total"], 1)
        self.assertEqual(result["items"][0]["doc_id"], "doc-hold")
        self.assertEqual(
            result["items"][0]["selection_diagnostics"]["selectionBlockerStage"],
            "hold_policy",
        )

    def test_signal_candidate_residual_summary_returns_bucket_counts(self) -> None:
        rows = [
            {
                "doc_id": "doc-selected",
                "final_selection_decision": "selected",
                "final_selection_selected": True,
                "final_selection_verification_state": "strong",
                "system_criterion_rows": 2,
                "matched_rows": 2,
                "llm_review_rows": 0,
                "notification_rows": 1,
            },
            {
                "doc_id": "doc-technical",
                "final_selection_decision": "rejected",
                "final_selection_reason": "technical_filtered_out",
                "processing_state": "processed",
                "observation_state": "canonicalized",
                "duplicate_kind": "canonical",
                "system_criterion_rows": 1,
                "matched_rows": 0,
                "no_match_rows": 0,
                "gray_zone_rows": 0,
                "technical_filtered_out_rows": 1,
                "llm_review_rows": 0,
                "notification_rows": 0,
            },
            {
                "doc_id": "doc-hold",
                "final_selection_decision": "gray_zone",
                "final_selection_reason": "semantic_hold",
                "final_selection_hold_count": 1,
                "processing_state": "processed",
                "observation_state": "canonicalized",
                "duplicate_kind": "canonical",
                "system_criterion_rows": 2,
                "gray_zone_rows": 1,
                "llm_review_rows": 0,
                "notification_rows": 0,
            },
        ]

        with patch.object(api_main, "query_all", return_value=rows):
            result = api_main.summarize_signal_candidate_residuals()

        self.assertEqual(result["total"], 3)
        self.assertEqual(result["totals"]["selected"], 1)
        self.assertEqual(result["totals"]["technicalFiltered"], 1)
        self.assertEqual(result["totals"]["hold"], 1)
        downstream_groups = {
            row["value"]: row["count"] for row in result["groups"]["downstreamLossBuckets"]
        }
        self.assertEqual(downstream_groups["selected_useful_evidence_present"], 1)
        self.assertEqual(downstream_groups["technical_filter_rejected"], 1)
        self.assertEqual(downstream_groups["gray_zone_hold"], 1)

    def test_content_item_explain_includes_operator_selection_fields(self) -> None:
        with (
            patch.object(
                api_main,
                "get_content_item",
                return_value={
                    "origin_type": "signal_candidate",
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
            result = api_main.get_content_item_explain(
                "signal_candidate:00000000-0000-4000-8000-000000000001"
            )

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
                    "origin_type": "signal_candidate",
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
            result = api_main.get_content_item_explain(
                "signal_candidate:00000000-0000-4000-8000-000000000002"
            )

        explain = result["selection_explain"]
        self.assertEqual(explain["source"], "system_feed_results")
        self.assertEqual(explain["decision"], "eligible")
        self.assertEqual(explain["selectionMode"], "compatibility_only")
        self.assertEqual(explain["selectionSummary"], "Compatibility projection: eligible")
        self.assertEqual(result["selection_guidance"]["tone"], "neutral")

    def test_get_content_item_falls_back_to_editorial_signal_candidate_when_family_preview_hides_exact_duplicate(self) -> None:
        signal_candidate = {
            "doc_id": "00000000-0000-4000-8000-000000000003",
            "url": "https://example.test/dup",
            "title": "Duplicate signal_candidate",
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
            patch.object(api_main, "get_signal_candidate", return_value=signal_candidate) as get_signal_candidate,
            patch.object(
                api_main,
                "get_selected_content_item_preview",
                side_effect=api_main.HTTPException(
                    status_code=404, detail="Content item not found."
                ),
            ) as get_preview,
            patch.object(api_main, "load_content_analysis_summary", return_value={}),
        ):
            result = api_main.get_content_item(
                "signal_candidate:00000000-0000-4000-8000-000000000003"
            )

        get_signal_candidate.assert_called_once_with("00000000-0000-4000-8000-000000000003")
        get_preview.assert_called_once_with(
            "signal_candidate:00000000-0000-4000-8000-000000000003"
        )
        self.assertEqual(
            result["content_item_id"],
            "signal_candidate:00000000-0000-4000-8000-000000000003",
        )
        self.assertEqual(result["origin_type"], "signal_candidate")
        self.assertEqual(result["origin_id"], "00000000-0000-4000-8000-000000000003")
        self.assertEqual(result["system_selection_decision"], "selected")
        self.assertEqual(result["system_selected"], True)
        self.assertEqual(result["summary"], "Lead")
        self.assertEqual(result["body_html"], "<p>Body</p>")

    def test_signal_candidate_explain_marks_profile_hold_as_hold_in_selection_summary(self) -> None:
        signal_candidate = {
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
            patch.object(api_main, "get_signal_candidate", return_value=signal_candidate),
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
            result = api_main.get_signal_candidate_explain("doc-2")

        explain = result["selection_explain"]
        self.assertEqual(explain["selectionMode"], "hold")
        self.assertEqual(explain["selectionReason"], "semantic_hold")
        self.assertEqual(explain["holdCount"], 1)
        self.assertEqual(explain["llmReviewPendingCount"], 0)
        diagnostics = result["selection_diagnostics"]
        self.assertEqual(diagnostics["selectionMode"], "hold")
        self.assertEqual(
            diagnostics["downstreamLossBucket"],
            "signal_candidates_missing_interest_filter_results",
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
