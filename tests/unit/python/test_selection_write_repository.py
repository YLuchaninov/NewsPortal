import unittest
import uuid
from typing import Any

from services.workers.app.selection_write_repository import (
    persist_criterion_review_resolution,
    upsert_final_selection_result,
)
from services.workers.app.worker_queues import SIGNAL_CANDIDATE_CRITERIA_MATCHED_EVENT


class _Cursor:
    def __init__(self) -> None:
        self.executed: list[tuple[str, tuple[Any, ...]]] = []

    async def execute(self, sql: str, params: tuple[Any, ...]) -> None:
        self.executed.append((sql, params))


class _FinalSelectionCursor:
    def __init__(self) -> None:
        self.executed: list[tuple[str, tuple[Any, ...]]] = []
        self._last_sql = ""

    async def execute(self, sql: str, params: tuple[Any, ...]) -> None:
        self._last_sql = sql
        self.executed.append((sql, params))

    async def fetchone(self) -> dict[str, Any] | None:
        if "candidate_signal_auto_select_count" in self._last_sql:
            return {
                "total_filter_count": 1,
                "matched_filter_count": 1,
                "no_match_filter_count": 0,
                "gray_zone_filter_count": 0,
                "llm_review_pending_filter_count": 0,
                "hold_filter_count": 0,
                "candidate_signal_uplift_count": 0,
                "candidate_signal_eligible_count": 1,
                "candidate_signal_strong_match_count": 1,
                "candidate_signal_auto_select_count": 0,
                "llm_approved_auto_select_count": 0,
                "candidate_signal_context_count": 0,
                "candidate_signal_buyer_intent_count": 0,
                "candidate_signal_project_intent_count": 1,
                "canonical_review_reused_count": 0,
                "technical_filtered_out_count": 0,
            }
        return None

    async def fetchall(self) -> list[dict[str, Any]]:
        if "explain_json -> 'filterReasons'" in self._last_sql:
            return []
        if "funnel_system_interest_bindings" in self._last_sql:
            return [
                {
                    "funnelId": "funnel-1",
                    "funnelName": "Enterprise buyer signals",
                    "funnelStatus": "active",
                    "laneId": "lane-1",
                    "laneName": "Hidden long-term vendor intent",
                    "laneType": "hidden_intent",
                    "routingMode": "llm_approved",
                    "bindingRole": "owned",
                    "criterionId": "criterion-1",
                    "interestTemplateId": "interest-1",
                    "interestName": "Long-term implementation partner",
                    "semanticDecision": "match",
                    "technicalFilterState": "passed",
                }
            ]
        if "funnel_source_bindings" in self._last_sql:
            return [
                {
                    "funnelId": "funnel-1",
                    "funnelName": "Enterprise buyer signals",
                    "funnelStatus": "active",
                    "laneId": "lane-1",
                    "laneName": "Hidden long-term vendor intent",
                    "laneType": "hidden_intent",
                    "routingMode": "llm_approved",
                    "sourceRole": "community_hidden_signal",
                    "bindingRole": "shared",
                    "channelId": "channel-1",
                    "channelName": "Forum source",
                    "providerType": "rss",
                }
            ]
        if "funnel_template_bindings" in self._last_sql:
            return [
                {
                    "funnelId": "funnel-1",
                    "funnelName": "Enterprise buyer signals",
                    "funnelStatus": "active",
                    "laneId": "lane-1",
                    "laneName": "Hidden long-term vendor intent",
                    "laneType": "hidden_intent",
                    "routingMode": "llm_approved",
                    "bindingRole": "owned",
                    "promptTemplateId": "template-1",
                    "templateName": "Selection review",
                    "templateScope": "criteria",
                    "templatePurpose": "selection_review",
                }
            ]
        if "funnel_reindex_job_bindings" in self._last_sql:
            return [
                {
                    "funnelId": "funnel-1",
                    "funnelName": "Enterprise buyer signals",
                    "funnelStatus": "active",
                    "laneId": "lane-1",
                    "laneName": "Hidden long-term vendor intent",
                    "laneType": "hidden_intent",
                    "routingMode": "llm_approved",
                    "bindingRole": "manual_tuning",
                    "verificationTarget": "replay",
                    "reindexJobId": "reindex-1",
                    "planId": "plan-1",
                    "jobKind": "backfill",
                    "jobStatus": "completed",
                    "requestedAt": None,
                    "finishedAt": None,
                }
            ]
        return []


class SelectionWriteRepositoryTests(unittest.IsolatedAsyncioTestCase):
    async def test_final_selection_result_includes_funnel_runtime_attribution(
        self,
    ) -> None:
        cursor = _FinalSelectionCursor()
        doc_id = uuid.uuid4()

        async def fetch_final_selection_result_row(*args: Any, **kwargs: Any) -> None:
            return None

        async def resolve_interest_filter_context(
            cursor: Any,
            *,
            signal_candidate: dict[str, Any],
            prefer_story_cluster: bool,
        ) -> dict[str, Any]:
            return {
                "canonicalDocumentId": None,
                "storyClusterId": None,
                "verificationTargetType": "canonical_document",
                "verificationTargetId": None,
                "verificationState": "medium",
            }

        result = await upsert_final_selection_result(
            cursor,  # type: ignore[arg-type]
            signal_candidate={"doc_id": doc_id},
            fetch_final_selection_result_row_func=fetch_final_selection_result_row,
            resolve_interest_filter_context_func=resolve_interest_filter_context,
        )

        attribution = result["funnelRuntimeAttribution"]
        self.assertIsInstance(attribution, dict)
        assert isinstance(attribution, dict)
        self.assertEqual(attribution["funnelIds"], ["funnel-1"])
        self.assertEqual(attribution["laneIds"], ["lane-1"])
        self.assertEqual(
            attribution["systemInterestBindings"][0]["interestName"],
            "Long-term implementation partner",
        )
        self.assertEqual(
            attribution["sourceBindings"][0]["sourceRole"],
            "community_hidden_signal",
        )
        self.assertEqual(
            attribution["templateBindings"][0]["templatePurpose"],
            "selection_review",
        )
        self.assertEqual(
            attribution["replayBindings"][0]["verificationTarget"],
            "replay",
        )
        self.assertEqual(
            result["explain_json"]["funnelRuntimeAttribution"]["source"],
            "worker.final_selection_results",
        )

    async def test_criterion_review_dispatch_uses_explicit_event_constant(self) -> None:
        cursor = _Cursor()
        doc_id = uuid.uuid4()
        criterion_id = uuid.uuid4()
        dispatched: list[tuple[str, str, dict[str, Any]]] = []

        async def resolve_interest_filter_context(
            cursor: Any,
            *,
            signal_candidate: dict[str, Any],
            prefer_story_cluster: bool,
        ) -> dict[str, Any]:
            return {
                "canonicalDocumentId": None,
                "storyClusterId": None,
                "verificationTargetType": "signal_candidate",
                "verificationTargetId": signal_candidate["doc_id"],
                "verificationState": "medium",
            }

        def resolve_criterion_filter_outcome(
            *,
            pass_filters: bool,
            compat_decision: str,
        ) -> tuple[str, str]:
            return ("passed", "match")

        async def upsert_interest_filter_result(*args: Any, **kwargs: Any) -> None:
            return None

        def build_interest_filter_explain(
            *,
            base_explain_json: dict[str, Any],
            technical_filter_state: str,
            semantic_decision: str,
            compat_decision: str,
            filter_scope: str,
            context: dict[str, Any],
        ) -> dict[str, Any]:
            return {
                **base_explain_json,
                "technicalFilterState": technical_filter_state,
                "semanticDecision": semantic_decision,
                "compatDecision": compat_decision,
                "filterScope": filter_scope,
            }

        async def upsert_system_feed_result(*args: Any, **kwargs: Any) -> dict[str, Any]:
            return {"eligible_for_feed": True}

        def should_dispatch_clustering(system_feed_result: dict[str, Any]) -> bool:
            return True

        async def insert_outbox_event(
            cursor: Any,
            event_type: str,
            aggregate_type: str,
            aggregate_id: uuid.UUID,
            payload: dict[str, Any],
        ) -> None:
            dispatched.append((event_type, aggregate_type, payload))

        await persist_criterion_review_resolution(
            cursor,  # type: ignore[arg-type]
            signal_candidate={"doc_id": doc_id},
            criterion_id=criterion_id,
            review_context={"explain_json": {"S_final": 0.82}},
            provider_decision="approve",
            provider_score=0.91,
            review_source="fresh_llm_review",
            review_id="review-1",
            refresh_selection_gate=True,
            historical_backfill=False,
            suppress_pipeline_fanout=False,
            resolve_interest_filter_context_func=resolve_interest_filter_context,
            resolve_criterion_filter_outcome_func=resolve_criterion_filter_outcome,
            upsert_interest_filter_result_func=upsert_interest_filter_result,
            build_interest_filter_explain_func=build_interest_filter_explain,
            upsert_system_feed_result_func=upsert_system_feed_result,
            should_dispatch_clustering_func=should_dispatch_clustering,
            insert_outbox_event_func=insert_outbox_event,
        )

        self.assertEqual(
            dispatched,
            [
                (
                    SIGNAL_CANDIDATE_CRITERIA_MATCHED_EVENT,
                    "signal_candidate",
                    {"docId": str(doc_id), "version": 1},
                )
            ],
        )


if __name__ == "__main__":
    unittest.main()
