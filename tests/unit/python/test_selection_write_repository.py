import unittest
import uuid
from typing import Any

from services.workers.app.selection_write_repository import (
    persist_criterion_review_resolution,
)
from services.workers.app.worker_queues import SIGNAL_CANDIDATE_CRITERIA_MATCHED_EVENT


class _Cursor:
    def __init__(self) -> None:
        self.executed: list[tuple[str, tuple[Any, ...]]] = []

    async def execute(self, sql: str, params: tuple[Any, ...]) -> None:
        self.executed.append((sql, params))


class SelectionWriteRepositoryTests(unittest.IsolatedAsyncioTestCase):
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
