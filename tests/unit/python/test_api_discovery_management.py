import asyncio
import sys
import types
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

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

from services.api.app import main as api_main


class _FakeCursor:
    def __init__(self, rows: list[dict[str, object]] | None = None) -> None:
        self.rows = list(rows or [])
        self.executed: list[tuple[str, tuple[object, ...] | None]] = []
        self._row_index = 0

    def __enter__(self) -> "_FakeCursor":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def execute(self, sql: str, params: tuple[object, ...] | None = None) -> None:
        self.executed.append((sql, params))

    def fetchone(self) -> dict[str, object] | None:
        if self._row_index >= len(self.rows):
            return None
        row = self.rows[self._row_index]
        self._row_index += 1
        return row


class _FakeConnection:
    def __init__(self, rows: list[dict[str, object]] | None = None) -> None:
        self.cursor_instance = _FakeCursor(rows)

    def __enter__(self) -> "_FakeConnection":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def cursor(self) -> _FakeCursor:
        return self.cursor_instance


class ApiDiscoveryManagementTests(unittest.TestCase):
    def test_profile_policy_normalization_preserves_supported_website_kinds(self) -> None:
        graph_policy = api_main.normalize_discovery_graph_policy(
            {
                "providerTypes": ["rss", "website", "youtube"],
                "supportedWebsiteKinds": [
                    "editorial",
                    "procurement_portal",
                    "listing",
                    "listing",
                ],
            }
        )
        recall_policy = api_main.normalize_discovery_recall_policy(
            {
                "providerTypes": ["website"],
                "supportedWebsiteKinds": ["editorial", "procurement_portal"],
            }
        )

        self.assertEqual(graph_policy["providerTypes"], ["rss", "website"])
        self.assertEqual(
            graph_policy["supportedWebsiteKinds"],
            ["editorial", "procurement_portal", "listing"],
        )
        self.assertEqual(recall_policy["providerTypes"], ["website"])
        self.assertEqual(
            recall_policy["supportedWebsiteKinds"],
            ["editorial", "procurement_portal"],
        )

    def test_discovery_routes_are_registered(self) -> None:
        paths = {route.path for route in api_main.app.routes}

        self.assertIn("/maintenance/discovery/summary", paths)
        self.assertIn("/maintenance/discovery/classes", paths)
        self.assertIn("/maintenance/discovery/classes/{class_key}", paths)
        self.assertIn("/maintenance/discovery/missions", paths)
        self.assertIn("/maintenance/discovery/missions/{mission_id}", paths)
        self.assertIn("/maintenance/discovery/missions/{mission_id}/compile-graph", paths)
        self.assertIn("/maintenance/discovery/missions/{mission_id}/run", paths)
        self.assertIn("/maintenance/discovery/recall-missions", paths)
        self.assertIn("/maintenance/discovery/recall-missions/{recall_mission_id}", paths)
        self.assertIn("/maintenance/discovery/recall-missions/{recall_mission_id}/acquire", paths)
        self.assertIn("/maintenance/discovery/candidates", paths)
        self.assertIn("/maintenance/discovery/candidates/{candidate_id}", paths)
        self.assertIn("/maintenance/discovery/recall-candidates", paths)
        self.assertIn("/maintenance/discovery/recall-candidates/{recall_candidate_id}", paths)
        self.assertIn("/maintenance/discovery/recall-candidates/{recall_candidate_id}/promote", paths)
        self.assertIn("/maintenance/discovery/hypotheses", paths)
        self.assertIn("/maintenance/discovery/hypotheses/{hypothesis_id}", paths)
        self.assertIn("/maintenance/discovery/source-profiles", paths)
        self.assertIn("/maintenance/discovery/source-profiles/{source_profile_id}", paths)
        self.assertIn("/maintenance/discovery/source-quality-snapshots", paths)
        self.assertIn("/maintenance/discovery/source-quality-snapshots/{snapshot_id}", paths)
        self.assertIn("/maintenance/discovery/source-interest-scores", paths)
        self.assertIn("/maintenance/discovery/source-interest-scores/{score_id}", paths)
        self.assertIn("/maintenance/discovery/missions/{mission_id}/portfolio", paths)
        self.assertIn("/maintenance/discovery/feedback", paths)
        self.assertIn("/maintenance/discovery/re-evaluate", paths)
        self.assertIn("/maintenance/discovery/costs/summary", paths)

    def test_list_discovery_missions_page_uses_discovery_table_and_pagination(self) -> None:
        items = [{"mission_id": "mission-1", "title": "Mission 1"}]
        with (
            patch.object(api_main, "query_count", return_value=5) as query_count,
            patch.object(api_main, "query_all", return_value=items) as query_all,
        ):
            result = api_main.list_discovery_missions_page(
                limit=25,
                page=2,
                page_size=3,
                status="active",
            )

        self.assertEqual(result["total"], 5)
        self.assertEqual(result["page"], 2)
        self.assertEqual(result["pageSize"], 3)
        self.assertEqual(result["items"], items)

        count_sql, count_params = query_count.call_args.args
        self.assertIn("from discovery_missions", count_sql)
        self.assertEqual(count_params, ("active",))

        items_sql, items_params = query_all.call_args.args
        self.assertIn("from discovery_missions", items_sql)
        self.assertIn("order by priority desc, updated_at desc, created_at desc", items_sql)
        self.assertEqual(items_params, ("active", 3, 3))

    def test_list_discovery_source_quality_snapshots_page_uses_quality_snapshot_table(self) -> None:
        items = [{"snapshot_id": "quality-1", "recall_score": 0.77}]
        with (
            patch.object(api_main, "query_count", return_value=2) as query_count,
            patch.object(api_main, "query_all", return_value=items) as query_all,
        ):
            result = api_main.list_discovery_source_quality_snapshots_page(
                limit=25,
                page=2,
                page_size=5,
                channel_id="channel-1",
                min_recall_score=0.5,
            )

        self.assertEqual(result["total"], 2)
        self.assertEqual(result["items"], items)

        count_sql, count_params = query_count.call_args.args
        self.assertIn("from discovery_source_quality_snapshots sqs", count_sql)
        self.assertEqual(count_params, ("channel-1", 0.5))

        items_sql, items_params = query_all.call_args.args
        self.assertIn("from discovery_source_quality_snapshots sqs", items_sql)
        self.assertIn("order by sqs.recall_score desc, sqs.scored_at desc", items_sql)
        self.assertEqual(items_params, ("channel-1", 0.5, 5, 5))

    def test_list_discovery_recall_missions_page_uses_recall_table_and_filters(self) -> None:
        items = [{"recall_mission_id": "recall-1", "title": "Neutral recall"}]
        with (
            patch.object(api_main, "query_count", return_value=3) as query_count,
            patch.object(api_main, "query_all", return_value=items) as query_all,
        ):
            result = api_main.list_discovery_recall_missions_page(
                limit=25,
                page=2,
                page_size=4,
                status="active",
                mission_kind="domain_seed",
            )

        self.assertEqual(result["total"], 3)
        self.assertEqual(result["items"], items)

        count_sql, count_params = query_count.call_args.args
        self.assertIn("from discovery_recall_missions rm", count_sql)
        self.assertEqual(count_params, ("active", "domain_seed"))

        items_sql, items_params = query_all.call_args.args
        self.assertIn("from discovery_recall_missions rm", items_sql)
        self.assertIn("order by rm.updated_at desc, rm.created_at desc", items_sql)
        self.assertEqual(items_params, ("active", "domain_seed", 4, 4))

    def test_list_discovery_recall_candidates_page_uses_recall_candidate_table(self) -> None:
        items = [{"recall_candidate_id": "recall-candidate-1", "canonical_domain": "example.com"}]
        with (
            patch.object(api_main, "query_count", return_value=4) as query_count,
            patch.object(api_main, "query_all", return_value=items) as query_all,
        ):
            result = api_main.list_discovery_recall_candidates_page(
                limit=25,
                page=2,
                page_size=6,
                recall_mission_id="recall-1",
                status="pending",
                provider_type="rss",
                canonical_domain_value="example.com",
            )

        self.assertEqual(result["total"], 4)
        self.assertEqual(result["items"], items)

        count_sql, count_params = query_count.call_args.args
        self.assertIn("from discovery_recall_candidates rc", count_sql)
        self.assertEqual(count_params, ("recall-1", "pending", "rss", "example.com"))

        items_sql, items_params = query_all.call_args.args
        self.assertIn("from discovery_recall_candidates rc", items_sql)
        self.assertIn("coalesce(sqs.recall_score, 0) desc, rc.created_at desc", items_sql)
        self.assertEqual(items_params, ("recall-1", "pending", "rss", "example.com", 6, 6))

    def test_discovery_recall_candidate_select_sql_includes_snapshot_breakdown_projection(self) -> None:
        sql = api_main.discovery_recall_candidate_select_sql()

        self.assertIn("sqs.scoring_breakdown as source_quality_scoring_breakdown", sql)
        self.assertIn("scoring_breakdown,", sql)

    def test_list_discovery_candidates_route_validates_status_and_provider_type(self) -> None:
        with self.assertRaises(api_main.HTTPException) as bad_status:
            api_main.list_discovery_candidates(limit=20, page=1, page_size=10, status="bogus")
        self.assertEqual(bad_status.exception.status_code, 422)

        with self.assertRaises(api_main.HTTPException) as bad_provider:
            api_main.list_discovery_candidates(
                limit=20,
                page=1,
                page_size=10,
                provider_type="json",
            )
        self.assertEqual(bad_provider.exception.status_code, 422)

    def test_list_discovery_recall_routes_validate_status_and_kind(self) -> None:
        with self.assertRaises(api_main.HTTPException) as bad_status:
            api_main.list_discovery_recall_missions(
                limit=20,
                page=1,
                page_size=10,
                status="bogus",
            )
        self.assertEqual(bad_status.exception.status_code, 422)

        with self.assertRaises(api_main.HTTPException) as bad_kind:
            api_main.list_discovery_recall_missions(
                limit=20,
                page=1,
                page_size=10,
                mission_kind="interest_graph",
            )
        self.assertEqual(bad_kind.exception.status_code, 422)

        with self.assertRaises(api_main.HTTPException) as bad_recall_candidate_status:
            api_main.list_discovery_recall_candidates(
                limit=20,
                page=1,
                page_size=10,
                status="approved",
            )
        self.assertEqual(bad_recall_candidate_status.exception.status_code, 422)

        with self.assertRaises(api_main.HTTPException) as bad_recall_candidate_provider:
            api_main.list_discovery_recall_candidates(
                limit=20,
                page=1,
                page_size=10,
                provider_type="json",
            )
        self.assertEqual(bad_recall_candidate_provider.exception.status_code, 422)

    def test_request_discovery_mission_run_delegates_to_sequence_trigger_helper(self) -> None:
        payload = api_main.DiscoveryMissionRunPayload.model_validate({"requestedBy": "admin-1"})
        expected = {"run_id": "run-123", "status": "queued"}
        fake_connection = _FakeConnection()

        with (
            patch.object(api_main, "get_discovery_mission", return_value={"mission_id": "mission-1"}),
            patch.object(
                api_main,
                "get_discovery_monthly_quota_snapshot",
                return_value={"monthlyQuotaReached": False},
            ),
            patch.object(api_main.psycopg, "connect", return_value=fake_connection),
            patch.object(
                api_main,
                "create_sequence_run_request_for_trigger",
                return_value=expected,
            ) as request_run,
        ):
            result = api_main.request_discovery_mission_run("mission-1", payload)

        self.assertEqual(result, expected)
        request_run.assert_called_once_with(
            api_main.DISCOVERY_ORCHESTRATOR_SEQUENCE_ID,
            context_json={"mission_id": "mission-1"},
            trigger_meta={
                "source": "maintenance_discovery_api",
                "missionId": "mission-1",
                "requestedBy": "admin-1",
            },
            trigger_type="api",
        )
        self.assertIn("update discovery_missions", fake_connection.cursor_instance.executed[0][0].lower())

    def test_create_discovery_mission_persists_interest_graph_when_provided(self) -> None:
        payload = api_main.DiscoveryMissionCreatePayload.model_validate(
            {
                "title": "Adaptive mission",
                "seedTopics": ["EU AI"],
                "interestGraph": {"core_topic": "EU AI", "subtopics": ["policy"]},
                "createdBy": "admin-1",
            }
        )
        fake_connection = _FakeConnection(rows=[{"mission_id": "mission-1"}])

        with (
            patch.object(api_main, "load_discovery_settings", return_value=SimpleNamespace(max_hypotheses_per_run=12, default_max_sources=20, default_budget_cents=500)),
            patch.object(api_main.psycopg, "connect", return_value=fake_connection),
            patch.object(api_main, "get_discovery_mission", return_value={"mission_id": "mission-1", "interest_graph_status": "compiled"}) as get_mission,
        ):
            result = api_main.create_discovery_mission(payload)

        insert_sql, insert_params = fake_connection.cursor_instance.executed[0]
        self.assertIn("insert into discovery_missions", insert_sql.lower())
        self.assertIn("interest_graph_status", insert_sql)
        self.assertEqual(insert_params[9], "compiled")
        self.assertEqual(insert_params[10], 1)
        get_mission.assert_called_once_with("mission-1")
        self.assertEqual(result["interest_graph_status"], "compiled")

    def test_delete_discovery_mission_removes_empty_mission(self) -> None:
        fake_connection = _FakeConnection(
            rows=[
                {
                    "hypothesis_count": 0,
                    "candidate_count": 0,
                    "portfolio_snapshot_count": 0,
                    "feedback_event_count": 0,
                    "source_interest_score_count": 0,
                    "strategy_stat_count": 0,
                    "cost_log_count": 0,
                },
                {"mission_id": "mission-empty"},
            ]
        )

        with (
            patch.object(
                api_main,
                "get_discovery_mission",
                return_value={
                    "mission_id": "mission-empty",
                    "run_count": 0,
                    "spent_cents": 0,
                    "last_run_at": None,
                },
            ),
            patch.object(api_main.psycopg, "connect", return_value=fake_connection),
        ):
            result = api_main.delete_discovery_mission("mission-empty")

        self.assertEqual(result, {"mission_id": "mission-empty", "deleted": True})
        self.assertIn(
            "delete from discovery_missions",
            fake_connection.cursor_instance.executed[1][0].lower(),
        )

    def test_delete_discovery_mission_rejects_mission_with_history(self) -> None:
        fake_connection = _FakeConnection(
            rows=[
                {
                    "hypothesis_count": 1,
                    "candidate_count": 0,
                    "portfolio_snapshot_count": 0,
                    "feedback_event_count": 0,
                    "source_interest_score_count": 0,
                    "strategy_stat_count": 0,
                    "cost_log_count": 0,
                }
            ]
        )

        with (
            patch.object(
                api_main,
                "get_discovery_mission",
                return_value={
                    "mission_id": "mission-history",
                    "run_count": 0,
                    "spent_cents": 0,
                    "last_run_at": None,
                },
            ),
            patch.object(api_main.psycopg, "connect", return_value=fake_connection),
        ):
            with self.assertRaises(api_main.SequenceConflictError) as error:
                api_main.delete_discovery_mission("mission-history")

        self.assertIn("Archive it instead of deleting it", str(error.exception))

    def test_delete_discovery_class_removes_unreferenced_class(self) -> None:
        fake_connection = _FakeConnection(
            rows=[
                {"hypothesis_count": 0},
                {"class_key": "empty_class"},
            ]
        )

        with (
            patch.object(
                api_main,
                "get_discovery_class",
                return_value={"class_key": "empty_class"},
            ),
            patch.object(api_main.psycopg, "connect", return_value=fake_connection),
        ):
            result = api_main.delete_discovery_class("empty_class")

        self.assertEqual(result, {"class_key": "empty_class", "deleted": True})
        self.assertIn(
            "delete from discovery_hypothesis_classes",
            fake_connection.cursor_instance.executed[1][0].lower(),
        )

    def test_delete_discovery_class_rejects_class_with_hypotheses(self) -> None:
        fake_connection = _FakeConnection(rows=[{"hypothesis_count": 1}])

        with (
            patch.object(
                api_main,
                "get_discovery_class",
                return_value={"class_key": "history_class"},
            ),
            patch.object(api_main.psycopg, "connect", return_value=fake_connection),
        ):
            with self.assertRaises(api_main.SequenceConflictError) as error:
                api_main.delete_discovery_class("history_class")

        self.assertIn("Archive it instead of deleting it", str(error.exception))

    def test_create_discovery_recall_candidate_links_existing_source_profile_by_canonical_domain(self) -> None:
        payload = api_main.DiscoveryRecallCandidateCreatePayload.model_validate(
            {
                "recallMissionId": "recall-1",
                "url": "https://www.example.com/feed.xml",
                "providerType": "rss",
                "createdBy": "admin-1",
            }
        )
        fake_connection = _FakeConnection(rows=[{"recall_candidate_id": "recall-candidate-1"}])

        with (
            patch.object(
                api_main,
                "get_discovery_recall_mission",
                return_value={"recall_mission_id": "recall-1"},
            ),
            patch.object(
                api_main,
                "get_discovery_source_profile_by_canonical_domain",
                return_value={"source_profile_id": "profile-7", "canonical_domain": "example.com"},
            ),
            patch.object(api_main.psycopg, "connect", return_value=fake_connection),
            patch.object(
                api_main,
                "get_discovery_recall_candidate",
                return_value={
                    "recall_candidate_id": "recall-candidate-1",
                    "source_profile_id": "profile-7",
                    "canonical_domain": "example.com",
                },
            ) as get_candidate,
        ):
            result = api_main.create_discovery_recall_candidate(payload)

        insert_sql, insert_params = fake_connection.cursor_instance.executed[0]
        self.assertIn("insert into discovery_recall_candidates", insert_sql.lower())
        self.assertEqual(insert_params[1], "profile-7")
        self.assertEqual(insert_params[2], "example.com")
        self.assertEqual(result["source_profile_id"], "profile-7")
        get_candidate.assert_called_once_with("recall-candidate-1")

    def test_request_discovery_recall_mission_acquisition_delegates_to_orchestrator(self) -> None:
        expected = {"discovery_recall_executed_count": 1}
        settings = SimpleNamespace(default_max_sources=20)

        with (
            patch.object(
                api_main,
                "get_discovery_recall_mission",
                return_value={"recall_mission_id": "recall-1"},
            ),
            patch.object(
                api_main,
                "load_discovery_settings",
                return_value=settings,
            ),
            patch.object(api_main, "DiscoveryCoordinatorRepository", return_value="repo"),
            patch.object(
                api_main,
                "acquire_recall_missions",
                new=AsyncMock(return_value=expected),
            ) as acquire_recall_missions,
            patch.object(
                api_main,
                "snapshot_discovery_recall_mission_profile_policy",
                return_value=None,
            ) as snapshot_profile_policy,
        ):
            result = asyncio.run(api_main.request_discovery_recall_mission_acquisition("recall-1"))

        self.assertEqual(result, expected)
        snapshot_profile_policy.assert_called_once_with("recall-1")
        acquire_recall_missions.assert_awaited_once_with(
            recall_mission_id="recall-1",
            settings=settings,
            repository="repo",
        )

    def test_request_discovery_mission_run_raises_conflict_when_monthly_quota_is_exhausted(self) -> None:
        payload = api_main.DiscoveryMissionRunPayload.model_validate({"requestedBy": "admin-1"})

        with (
            patch.object(api_main, "get_discovery_mission", return_value={"mission_id": "mission-1"}),
            patch.object(
                api_main,
                "get_discovery_monthly_quota_snapshot",
                return_value={"monthlyQuotaReached": True},
            ),
        ):
            with self.assertRaises(api_main.SequenceConflictError) as error:
                api_main.request_discovery_mission_run("mission-1", payload)

        self.assertIn("Monthly discovery quota is exhausted", str(error.exception))

    def test_request_discovery_mission_run_rejects_archived_mission(self) -> None:
        payload = api_main.DiscoveryMissionRunPayload.model_validate({"requestedBy": "admin-1"})

        with patch.object(
            api_main,
            "get_discovery_mission",
            return_value={"mission_id": "mission-1", "status": "archived"},
        ):
            with self.assertRaises(api_main.SequenceConflictError) as error:
                api_main.request_discovery_mission_run("mission-1", payload)

        self.assertIn("reactivated before they can run", str(error.exception))

    def test_monthly_quota_snapshot_uses_precise_usd_comparison(self) -> None:
        with (
            patch.object(
                api_main,
                "load_discovery_settings",
                return_value=SimpleNamespace(monthly_budget_cents=100),
            ),
            patch.object(
                api_main,
                "query_one",
                return_value={"month_to_date_cost_usd": "0.995"},
            ),
        ):
            snapshot = api_main.get_discovery_monthly_quota_snapshot()

        self.assertFalse(snapshot["monthlyQuotaReached"])
        self.assertEqual(snapshot["monthToDateCostCents"], 100)
        self.assertEqual(snapshot["remainingMonthlyBudgetCents"], 1)

    def test_get_discovery_summary_includes_recall_promotion_counts(self) -> None:
        settings = SimpleNamespace(
            cron="*/15 * * * *",
            default_budget_cents=700,
            search_provider="ddgs",
            llm_provider="openrouter",
            llm_model="openai/gpt-5-mini",
        )
        with (
            patch.object(
                api_main,
                "query_one",
                return_value={
                    "mission_count": 3,
                    "active_mission_count": 1,
                    "recall_mission_count": 2,
                    "active_recall_mission_count": 1,
                    "compiled_graph_count": 2,
                    "active_class_count": 4,
                    "hypothesis_count": 12,
                    "pending_hypothesis_count": 5,
                    "candidate_count": 8,
                    "pending_candidate_count": 3,
                    "approved_candidate_count": 2,
                    "recall_candidate_count": 7,
                    "pending_recall_candidate_count": 2,
                    "duplicate_recall_candidate_count": 1,
                    "promoted_recall_candidate_count": 4,
                    "source_profile_count": 9,
                    "source_quality_snapshot_count": 11,
                    "source_interest_score_count": 6,
                    "portfolio_snapshot_count": 2,
                    "feedback_event_count": 3,
                    "total_cost_usd": "4.25",
                },
            ) as query_one,
            patch.object(api_main, "load_discovery_settings", return_value=settings),
            patch.object(
                api_main,
                "get_discovery_monthly_quota_snapshot",
                return_value={
                    "monthlyBudgetCents": 700,
                    "monthToDateCostUsd": 1.25,
                    "monthToDateCostCents": 125,
                    "remainingMonthlyBudgetCents": 575,
                    "monthlyQuotaReached": False,
                },
            ),
        ):
            summary = api_main.get_discovery_summary()

        queried_sql = query_one.call_args.args[0]
        self.assertIn("duplicate_recall_candidate_count", queried_sql)
        self.assertIn("promoted_recall_candidate_count", queried_sql)
        self.assertEqual(summary["duplicate_recall_candidate_count"], 1)
        self.assertEqual(summary["promoted_recall_candidate_count"], 4)
        self.assertEqual(summary["searchProvider"], "ddgs")
        self.assertEqual(summary["llmModel"], "openai/gpt-5-mini")

    def test_discovery_source_profile_select_sql_surfaces_latest_generic_quality_snapshot(self) -> None:
        sql = api_main.discovery_source_profile_select_sql()

        self.assertIn("left join lateral", sql.lower())
        self.assertIn("latest_source_quality_snapshot_id", sql)
        self.assertIn("latest_source_quality_scoring_breakdown", sql)
        self.assertIn("latest_source_quality_recall_score", sql)

    def test_discovery_recall_candidate_select_sql_surfaces_quality_breakdown(self) -> None:
        sql = api_main.discovery_recall_candidate_select_sql()

        self.assertIn("source_quality_scoring_breakdown", sql)
        self.assertIn("source_quality_recall_score", sql)

    def test_update_discovery_recall_candidate_updates_review_fields_without_registration(self) -> None:
        payload = api_main.DiscoveryRecallCandidateUpdatePayload.model_validate(
            {"status": "shortlisted", "reviewedBy": "admin-2"}
        )
        fake_connection = _FakeConnection(rows=[{"recall_candidate_id": "recall-candidate-1"}])

        with (
            patch.object(
                api_main,
                "get_discovery_recall_candidate",
                side_effect=[
                    {
                        "recall_candidate_id": "recall-candidate-1",
                        "status": "pending",
                    },
                    {
                        "recall_candidate_id": "recall-candidate-1",
                        "status": "shortlisted",
                        "reviewed_by": "admin-2",
                    },
                ],
            ),
            patch.object(api_main.psycopg, "connect", return_value=fake_connection),
        ):
            result = api_main.update_discovery_recall_candidate("recall-candidate-1", payload)

        update_sql, update_params = fake_connection.cursor_instance.executed[0]
        self.assertIn("update discovery_recall_candidates", update_sql.lower())
        self.assertEqual(update_params, ("shortlisted", "admin-2", "recall-candidate-1"))
        self.assertEqual(result["status"], "shortlisted")

    def test_promote_discovery_recall_candidate_registers_source_and_links_channel(self) -> None:
        payload = api_main.DiscoveryRecallCandidatePromotePayload.model_validate(
            {"reviewedBy": "admin-3", "tags": ["operator-approved"]}
        )
        fake_connection = _FakeConnection(rows=[{"recall_candidate_id": "recall-candidate-1"}])

        with (
            patch.object(
                api_main,
                "get_discovery_recall_candidate",
                side_effect=[
                    {
                        "recall_candidate_id": "recall-candidate-1",
                        "source_profile_id": "profile-1",
                        "canonical_domain": "example.com",
                        "url": "https://example.com",
                        "final_url": "https://example.com/news",
                        "title": "Example site",
                        "provider_type": "website",
                        "evaluation_json": {
                            "classification": {"kind": "editorial"},
                            "capabilities": {"supports_collection_discovery": True},
                            "discovered_feed_urls": ["https://example.com/feed.xml"],
                            "browser_assisted_recommended": True,
                        },
                        "registered_channel_id": None,
                        "status": "pending",
                        "rejection_reason": None,
                    },
                    {
                        "recall_candidate_id": "recall-candidate-1",
                        "status": "shortlisted",
                        "registered_channel_id": "channel-8",
                    },
                ],
            ),
            patch.object(api_main, "build_database_url", return_value="postgresql://stub"),
            patch.object(api_main.psycopg, "connect", return_value=fake_connection),
            patch.object(api_main, "PostgresSourceRegistrarAdapter") as registrar_class,
        ):
            registrar_class.return_value.register_sources.return_value = [
                {
                    "channel_id": "channel-8",
                    "status": "registered",
                    "provider_type": "website",
                }
            ]

            result = api_main.promote_discovery_recall_candidate("recall-candidate-1", payload)

        self.assertEqual(result["status"], "shortlisted")
        self.assertEqual(result["registered_channel_id"], "channel-8")
        register_kwargs = registrar_class.return_value.register_sources.call_args.kwargs
        self.assertEqual(register_kwargs["provider_type"], "website")
        self.assertEqual(register_kwargs["created_by"], "admin-3")
        self.assertEqual(
            register_kwargs["tags"],
            ["discovery", "independent_recall", "promoted", "operator-approved"],
        )
        self.assertTrue(register_kwargs["sources"][0]["browser_assisted_recommended"])
        update_sql, update_params = fake_connection.cursor_instance.executed[0]
        self.assertIn("update discovery_recall_candidates", update_sql.lower())
        self.assertEqual(
            update_params,
            ("shortlisted", None, "admin-3", "channel-8", "recall-candidate-1"),
        )
        profile_sql, profile_params = fake_connection.cursor_instance.executed[1]
        self.assertIn("update discovery_source_profiles", profile_sql.lower())
        self.assertEqual(profile_params, ("channel-8", "profile-1"))

    def test_promote_discovery_recall_candidate_marks_duplicates_after_registration(self) -> None:
        payload = api_main.DiscoveryRecallCandidatePromotePayload.model_validate(
            {"reviewedBy": "admin-4"}
        )
        fake_connection = _FakeConnection(rows=[{"recall_candidate_id": "recall-candidate-2"}])

        with (
            patch.object(
                api_main,
                "get_discovery_recall_candidate",
                side_effect=[
                    {
                        "recall_candidate_id": "recall-candidate-2",
                        "source_profile_id": None,
                        "canonical_domain": "news.example.com",
                        "url": "https://news.example.com/feed.xml",
                        "final_url": "https://news.example.com/feed.xml",
                        "title": "Example feed",
                        "provider_type": "rss",
                        "evaluation_json": {},
                        "registered_channel_id": None,
                        "status": "pending",
                        "rejection_reason": None,
                    },
                    {
                        "recall_candidate_id": "recall-candidate-2",
                        "status": "duplicate",
                        "registered_channel_id": "channel-9",
                    },
                ],
            ),
            patch.object(api_main, "build_database_url", return_value="postgresql://stub"),
            patch.object(api_main.psycopg, "connect", return_value=fake_connection),
            patch.object(api_main, "PostgresSourceRegistrarAdapter") as registrar_class,
        ):
            registrar_class.return_value.register_sources.return_value = [
                {
                    "channel_id": "channel-9",
                    "status": "duplicate",
                    "provider_type": "rss",
                }
            ]

            result = api_main.promote_discovery_recall_candidate("recall-candidate-2", payload)

        self.assertEqual(result["status"], "duplicate")
        self.assertEqual(result["registered_channel_id"], "channel-9")
        update_sql, update_params = fake_connection.cursor_instance.executed[0]
        self.assertIn("update discovery_recall_candidates", update_sql.lower())
        self.assertEqual(
            update_params,
            ("duplicate", "already_registered", "admin-4", "channel-9", "recall-candidate-2"),
        )

    def test_update_discovery_candidate_marks_duplicates_after_registration(self) -> None:
        payload = api_main.DiscoveryCandidateUpdatePayload.model_validate(
            {"status": "approved", "reviewedBy": "admin-1"}
        )
        fake_connection = _FakeConnection()

        with (
            patch.object(
                api_main,
                "get_discovery_candidate",
                side_effect=[
                    {
                        "candidate_id": "candidate-1",
                        "url": "https://news.example.com/feed.xml",
                        "final_url": "https://news.example.com/feed.xml",
                        "title": "Example feed",
                        "provider_type": "rss",
                        "registered_channel_id": None,
                    },
                    {
                        "candidate_id": "candidate-1",
                        "status": "duplicate",
                        "registered_channel_id": "channel-7",
                    },
                ],
            ),
            patch.object(api_main, "build_database_url", return_value="postgresql://stub"),
            patch.object(api_main.psycopg, "connect", return_value=fake_connection),
            patch.object(api_main, "PostgresSourceRegistrarAdapter") as registrar_class,
        ):
            registrar_class.return_value.register_sources.return_value = [
                {
                    "channel_id": "channel-7",
                    "status": "duplicate",
                    "provider_type": "rss",
                }
            ]

            result = api_main.update_discovery_candidate("candidate-1", payload)

        self.assertEqual(result["status"], "duplicate")
        self.assertEqual(result["registered_channel_id"], "channel-7")
        update_sql, update_params = fake_connection.cursor_instance.executed[0]
        self.assertIn("update discovery_candidates", update_sql.lower())
        self.assertEqual(update_params, ("duplicate", "already_registered", "admin-1", "channel-7", "candidate-1"))


if __name__ == "__main__":
    unittest.main()
