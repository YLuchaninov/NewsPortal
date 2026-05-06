import asyncio
import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from tests.unit.python.support.stubs import install_psycopg_stub

install_psycopg_stub()

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

    def transaction(self) -> "_FakeConnection":
        return self


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
                "expectedSourceShapes": ["editorial_stream", "editorial_stream"],
                "allowedSourceFamilies": ["official_updates"],
                "disfavoredSourceFamilies": ["aggregator_directory"],
                "usefulnessHints": ["resource_only_expected"],
                "diversityCaps": {"maxPerSourceFamily": 2, "maxPerDomain": 1},
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
        self.assertEqual(graph_policy["expectedSourceShapes"], ["editorial_stream"])
        self.assertEqual(graph_policy["allowedSourceFamilies"], ["official_updates"])
        self.assertEqual(graph_policy["disfavoredSourceFamilies"], ["aggregator_directory"])
        self.assertEqual(graph_policy["usefulnessHints"], ["resource_only_expected"])
        self.assertEqual(
            graph_policy["diversityCaps"],
            {"maxPerSourceFamily": 2, "maxPerDomain": 1},
        )
        self.assertEqual(recall_policy["providerTypes"], ["website"])
        self.assertEqual(
            recall_policy["supportedWebsiteKinds"],
            ["editorial", "procurement_portal"],
        )

    def test_applied_discovery_policy_snapshot_preserves_graph_profile_and_mission_owned_inputs(
        self,
    ) -> None:
        snapshot = api_main.build_applied_discovery_policy_snapshot(
            lane="graph",
            mission_like={
                "target_provider_types": ["rss"],
                "seed_topics": ["AI policy"],
                "seed_languages": ["en"],
                "seed_regions": ["EU"],
            },
            profile={
                "profile_id": "profile-1",
                "profile_key": "eu-ai",
                "display_name": "EU AI",
                "version": 3,
                "graph_policy_json": {
                    "providerTypes": ["rss", "website", "unsupported"],
                    "preferredDomains": ["example.com"],
                },
                "yield_benchmark_json": {"domains": ["example.com"]},
            },
        )

        self.assertEqual(snapshot["lane"], "graph")
        self.assertEqual(snapshot["profileVersion"], 3)
        self.assertEqual(snapshot["graphPolicy"]["providerTypes"], ["rss", "website"])
        self.assertEqual(snapshot["graphPolicy"]["preferredDomains"], ["example.com"])
        self.assertEqual(snapshot["yieldBenchmark"]["domains"], ["example.com"])
        self.assertEqual(
            snapshot["missionOwned"],
            {
                "targetProviderTypes": ["rss"],
                "seedTopics": ["AI policy"],
                "seedLanguages": ["en"],
                "seedRegions": ["EU"],
            },
        )

    def test_snapshot_discovery_mission_profile_policy_persists_applied_policy(self) -> None:
        fake_connection = _FakeConnection()

        with (
            patch.object(
                api_main,
                "get_discovery_mission",
                return_value={
                    "mission_id": "mission-1",
                    "profile_id": "profile-1",
                    "target_provider_types": ["website"],
                    "seed_topics": ["climate"],
                    "seed_languages": ["en"],
                    "seed_regions": [],
                },
            ),
            patch.object(
                api_main,
                "require_attachable_discovery_policy_profile",
                return_value={
                    "profile_id": "profile-1",
                    "profile_key": "climate",
                    "display_name": "Climate",
                    "version": 4,
                    "graph_policy_json": {"providerTypes": ["website"]},
                    "yield_benchmark_json": {"titleKeywords": ["climate"]},
                },
            ),
            patch.object(api_main.psycopg, "connect", return_value=fake_connection),
        ):
            api_main.snapshot_discovery_mission_profile_policy("mission-1")

        update_sql, update_params = fake_connection.cursor_instance.executed[0]
        self.assertIn("update discovery_missions", update_sql.lower())
        self.assertEqual(update_params[0], 4)
        persisted_policy = json.loads(update_params[1])
        self.assertEqual(persisted_policy["lane"], "graph")
        self.assertEqual(persisted_policy["graphPolicy"]["providerTypes"], ["website"])
        self.assertEqual(persisted_policy["missionOwned"]["seedTopics"], ["climate"])
        self.assertEqual(update_params[2], "mission-1")

    def test_snapshot_discovery_recall_mission_profile_policy_clears_policy_without_profile(
        self,
    ) -> None:
        fake_connection = _FakeConnection()

        with (
            patch.object(
                api_main,
                "get_discovery_recall_mission",
                return_value={"recall_mission_id": "recall-1", "profile_id": None},
            ),
            patch.object(api_main.psycopg, "connect", return_value=fake_connection),
        ):
            api_main.snapshot_discovery_recall_mission_profile_policy("recall-1")

        update_sql, update_params = fake_connection.cursor_instance.executed[0]
        self.assertIn("update discovery_recall_missions", update_sql.lower())
        self.assertIn("applied_profile_version = null", update_sql)
        self.assertEqual(update_params, ("recall-1",))

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
        self.assertIn("from discovery_missions m", count_sql)
        self.assertIn("where m.status = %s", count_sql)
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

    def test_update_discovery_mission_profile_resets_applied_policy_snapshot(self) -> None:
        payload = api_main.DiscoveryMissionUpdatePayload.model_validate(
            {"profileId": " profile-3 "}
        )
        fake_connection = _FakeConnection(rows=[{"mission_id": "mission-1"}])

        with (
            patch.object(api_main, "build_database_url", return_value="postgres://test"),
            patch.object(
                api_main,
                "require_attachable_discovery_policy_profile",
                return_value={"profile_id": "profile-3"},
            ) as require_profile,
            patch.object(api_main.psycopg, "connect", return_value=fake_connection),
            patch.object(
                api_main,
                "get_discovery_mission",
                return_value={"mission_id": "mission-1", "profile_id": "profile-3"},
            ) as get_mission,
        ):
            result = api_main.update_discovery_mission("mission-1", payload)

        update_sql, update_params = fake_connection.cursor_instance.executed[0]
        self.assertIn("update discovery_missions", update_sql.lower())
        self.assertIn("profile_id = %s", update_sql)
        self.assertIn("applied_profile_version = null", update_sql)
        self.assertIn("applied_policy_json = null", update_sql)
        self.assertEqual(update_params, ("profile-3", "mission-1"))
        self.assertEqual(result["profile_id"], "profile-3")
        require_profile.assert_called_once_with("profile-3")
        get_mission.assert_called_once_with("mission-1")

    def test_compile_discovery_mission_graph_snapshots_policy_before_compile(self) -> None:
        repository = SimpleNamespace(
            get_mission=AsyncMock(
                side_effect=[
                    {"mission_id": "mission-1", "status": "planned"},
                    {"mission_id": "mission-1", "status": "planned", "profile_id": "profile-1"},
                ]
            )
        )
        expected = {"mission_id": "mission-1", "interest_graph_status": "compiled"}

        with (
            patch.object(api_main, "DiscoveryCoordinatorRepository", return_value=repository),
            patch.object(
                api_main,
                "snapshot_discovery_mission_profile_policy",
                return_value=None,
            ) as snapshot_profile_policy,
            patch.object(
                api_main,
                "compile_interest_graph_for_mission",
                new=AsyncMock(return_value=None),
            ) as compile_graph,
            patch.object(api_main, "get_discovery_mission", return_value=expected),
        ):
            result = asyncio.run(api_main.compile_discovery_mission_graph("mission-1"))

        self.assertEqual(result, expected)
        self.assertEqual(repository.get_mission.await_count, 2)
        snapshot_profile_policy.assert_called_once_with("mission-1")
        compile_graph.assert_awaited_once_with(
            mission={"mission_id": "mission-1", "status": "planned", "profile_id": "profile-1"},
            repository=repository,
        )

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

    def test_create_discovery_recall_mission_persists_attached_profile(self) -> None:
        payload = api_main.DiscoveryRecallMissionCreatePayload.model_validate(
            {
                "title": "Neutral recall",
                "missionKind": "query_seed",
                "seedQueries": ["public procurement"],
                "targetProviderTypes": ["rss", "website"],
                "scopeJson": {"region": "eu"},
                "maxCandidates": 12,
                "profileId": " profile-1 ",
                "createdBy": "admin-1",
            }
        )
        fake_connection = _FakeConnection(rows=[{"recall_mission_id": "recall-1"}])

        with (
            patch.object(api_main, "build_database_url", return_value="postgres://test"),
            patch.object(
                api_main,
                "require_attachable_discovery_policy_profile",
                return_value={"profile_id": "profile-1"},
            ) as require_profile,
            patch.object(api_main.psycopg, "connect", return_value=fake_connection),
            patch.object(
                api_main,
                "get_discovery_recall_mission",
                return_value={"recall_mission_id": "recall-1", "profile_id": "profile-1"},
            ) as get_recall_mission,
        ):
            result = api_main.create_discovery_recall_mission(payload)

        insert_sql, insert_params = fake_connection.cursor_instance.executed[0]
        self.assertIn("insert into discovery_recall_missions", insert_sql.lower())
        self.assertEqual(insert_params[7], json.dumps({"region": "eu"}))
        self.assertEqual(insert_params[9], "profile-1")
        self.assertEqual(insert_params[10], "admin-1")
        self.assertEqual(result["recall_mission_id"], "recall-1")
        require_profile.assert_called_once_with("profile-1")
        get_recall_mission.assert_called_once_with("recall-1")

    def test_update_discovery_recall_mission_profile_resets_applied_policy_snapshot(
        self,
    ) -> None:
        payload = api_main.DiscoveryRecallMissionUpdatePayload.model_validate(
            {"profileId": " profile-2 "}
        )
        fake_connection = _FakeConnection(rows=[{"recall_mission_id": "recall-1"}])

        with (
            patch.object(api_main, "build_database_url", return_value="postgres://test"),
            patch.object(
                api_main,
                "require_attachable_discovery_policy_profile",
                return_value={"profile_id": "profile-2"},
            ) as require_profile,
            patch.object(api_main.psycopg, "connect", return_value=fake_connection),
            patch.object(
                api_main,
                "get_discovery_recall_mission",
                return_value={"recall_mission_id": "recall-1", "profile_id": "profile-2"},
            ) as get_recall_mission,
        ):
            result = api_main.update_discovery_recall_mission("recall-1", payload)

        update_sql, update_params = fake_connection.cursor_instance.executed[0]
        self.assertIn("update discovery_recall_missions", update_sql.lower())
        self.assertIn("profile_id = %s", update_sql)
        self.assertIn("applied_profile_version = null", update_sql)
        self.assertIn("applied_policy_json = null", update_sql)
        self.assertEqual(update_params, ("profile-2", "recall-1"))
        self.assertEqual(result["profile_id"], "profile-2")
        require_profile.assert_called_once_with("profile-2")
        get_recall_mission.assert_called_once_with("recall-1")

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

    def test_create_discovery_feedback_trims_optional_ids_and_reads_created_row(self) -> None:
        payload = api_main.DiscoveryFeedbackCreatePayload.model_validate(
            {
                "missionId": " mission-1 ",
                "candidateId": " ",
                "sourceProfileId": " profile-1 ",
                "feedbackType": "source_quality",
                "feedbackValue": "useful",
                "notes": "Promising source",
                "createdBy": "admin-6",
            }
        )
        fake_connection = _FakeConnection(rows=[{"feedback_event_id": "feedback-1"}])
        expected = {"feedback_event_id": "feedback-1", "feedback_type": "source_quality"}

        with (
            patch.object(api_main, "build_database_url", return_value="postgres://test"),
            patch.object(api_main.psycopg, "connect", return_value=fake_connection),
            patch.object(api_main, "query_one", return_value=expected) as query_one,
        ):
            result = api_main.create_discovery_feedback(payload)

        insert_sql, insert_params = fake_connection.cursor_instance.executed[0]
        self.assertIn("insert into discovery_feedback_events", insert_sql.lower())
        self.assertEqual(
            insert_params,
            (
                "mission-1",
                None,
                "profile-1",
                "source_quality",
                "useful",
                "Promising source",
                "admin-6",
            ),
        )
        query_sql, query_params = query_one.call_args.args
        self.assertIn("where dfe.feedback_event_id = %s", query_sql)
        self.assertEqual(query_params, ("feedback-1",))
        self.assertEqual(result, expected)

    def test_re_evaluate_discovery_sources_route_delegates_to_orchestrator(self) -> None:
        payload = api_main.DiscoveryReEvaluatePayload.model_validate(
            {"missionId": "mission-1"}
        )
        expected = {"discovery_re_evaluated_count": 1}

        with (
            patch.object(api_main, "DiscoveryCoordinatorRepository", return_value="repo"),
            patch.object(
                api_main,
                "re_evaluate_sources",
                new=AsyncMock(return_value=expected),
            ) as re_evaluate_sources,
        ):
            result = asyncio.run(api_main.re_evaluate_discovery_sources_route(payload))

        self.assertEqual(result, expected)
        re_evaluate_sources.assert_awaited_once_with(
            mission_id="mission-1",
            repository="repo",
        )

    def test_create_content_filter_policy_persists_policy_json_and_reads_created_policy(
        self,
    ) -> None:
        payload = api_main.ContentFilterPolicyPayload.model_validate(
            {
                "policyKey": "filter-key",
                "title": "Filter policy",
                "policyJson": {"rules": [{"label": "keep"}]},
            }
        )
        expected = {"filter_policy_id": "filter-policy-1", "policy_key": "filter-key"}

        with (
            patch.object(
                api_main,
                "query_one",
                return_value={"filter_policy_id": "filter-policy-1"},
            ) as query_one,
            patch.object(
                api_main,
                "get_content_filter_policy",
                return_value=expected,
            ) as get_filter_policy,
        ):
            result = api_main.create_content_filter_policy(payload)

        insert_sql, insert_params = query_one.call_args.args
        self.assertIn("insert into content_filter_policies", insert_sql.lower())
        self.assertEqual(insert_params[0], "filter-key")
        self.assertEqual(insert_params[7], json.dumps({"rules": [{"label": "keep"}]}))
        get_filter_policy.assert_called_once_with("filter-policy-1")
        self.assertEqual(result, expected)

    def test_update_content_analysis_policy_versions_runtime_changes(self) -> None:
        payload = api_main.ContentAnalysisPolicyUpdatePayload.model_validate(
            {
                "mode": "enforce",
                "configJson": {"threshold": 0.9},
            }
        )
        fake_connection = _FakeConnection(rows=[{"policy_id": "policy-2"}])
        current = {
            "policy_id": "policy-1",
            "policy_key": "analysis-key",
            "title": "Analysis policy",
            "description": None,
            "module": "content_filter",
            "enabled": True,
            "mode": "dry_run",
            "provider": None,
            "model_key": None,
            "model_version": None,
            "config_json": {"threshold": 0.5},
            "failure_policy": "skip",
            "is_active": True,
            "priority": 100,
        }
        updated = dict(current, policy_id="policy-2", mode="enforce")

        with (
            patch.object(
                api_main,
                "get_content_analysis_policy",
                side_effect=[current, updated],
            ) as get_policy,
            patch.object(api_main, "build_database_url", return_value="postgres://test"),
            patch.object(api_main.psycopg, "connect", return_value=fake_connection),
        ):
            result = api_main.update_content_analysis_policy("policy-1", payload)

        deactivate_sql, deactivate_params = fake_connection.cursor_instance.executed[0]
        insert_sql, insert_params = fake_connection.cursor_instance.executed[1]
        self.assertIn("update content_analysis_policies", deactivate_sql.lower())
        self.assertEqual(deactivate_params, ("policy-1",))
        self.assertIn("insert into content_analysis_policies", insert_sql.lower())
        self.assertEqual(insert_params[2], "content_filter")
        self.assertEqual(insert_params[4], "enforce")
        self.assertEqual(insert_params[8], json.dumps({"threshold": 0.9}))
        self.assertEqual(insert_params[-1], "policy-1")
        self.assertEqual(result["policy_id"], "policy-2")
        self.assertEqual(get_policy.call_count, 2)

    def test_request_content_analysis_backfill_persists_job_and_outbox_event(
        self,
    ) -> None:
        payload = api_main.ContentAnalysisBackfillPayload.model_validate(
            {
                "subjectTypes": ["article"],
                "modules": ["content_filter"],
                "missingOnly": False,
                "policyKey": "strict-policy",
                "batchSize": 25,
                "maxTextChars": 12000,
                "requestedByUserId": " 11111111-1111-1111-1111-111111111111 ",
                "subjectIds": [
                    " 22222222-2222-2222-2222-222222222222 ",
                    "",
                    "33333333-3333-3333-3333-333333333333",
                ],
            }
        )
        fake_connection = _FakeConnection()

        with (
            patch.object(api_main.uuid, "uuid4", side_effect=["job-1", "event-1"]),
            patch.object(api_main, "build_database_url", return_value="postgres://test"),
            patch.object(api_main.psycopg, "connect", return_value=fake_connection),
        ):
            result = api_main.request_content_analysis_backfill(payload)

        advisory_sql, advisory_params = fake_connection.cursor_instance.executed[0]
        job_sql, job_params = fake_connection.cursor_instance.executed[1]
        cancel_queued_sql, cancel_queued_params = fake_connection.cursor_instance.executed[2]
        cancel_running_sql, cancel_running_params = fake_connection.cursor_instance.executed[3]
        event_sql, event_params = fake_connection.cursor_instance.executed[4]
        persisted_options = json.loads(job_params[1])
        persisted_event = json.loads(event_params[2])

        self.assertIn("pg_advisory_xact_lock", advisory_sql)
        self.assertTrue(advisory_params[0].startswith("reindex:content_analysis:content_analysis:"))
        self.assertIn("insert into reindex_jobs", job_sql.lower())
        self.assertIn("index_name", job_sql)
        self.assertEqual(job_params[0], "job-1")
        self.assertEqual(job_params[2], "11111111-1111-1111-1111-111111111111")
        self.assertEqual(job_params[3], advisory_params[0])
        self.assertIn("status = 'cancelled'", cancel_queued_sql)
        self.assertEqual(cancel_queued_params, ("job-1", advisory_params[0], "job-1"))
        self.assertIn("status = 'cancel_requested'", cancel_running_sql)
        self.assertEqual(cancel_running_params, ("job-1", advisory_params[0], "job-1"))
        self.assertEqual(persisted_options["batchSize"], 25)
        self.assertEqual(persisted_options["subjectTypes"], ["article"])
        self.assertEqual(persisted_options["modules"], ["content_filter"])
        self.assertEqual(persisted_options["missingOnly"], False)
        self.assertEqual(
            persisted_options["subjectIds"],
            [
                "22222222-2222-2222-2222-222222222222",
                "33333333-3333-3333-3333-333333333333",
            ],
        )
        self.assertEqual(
            persisted_options["requestSource"],
            "content_analysis_backfill",
        )
        self.assertIn("insert into outbox_events", event_sql.lower())
        self.assertIn("'reindex.requested'", event_sql)
        self.assertEqual(event_params[0], "event-1")
        self.assertEqual(event_params[1], "job-1")
        self.assertEqual(
            persisted_event,
            {
                "eventId": "event-1",
                "reindexJobId": "job-1",
                "indexName": "content_analysis",
                "jobKind": "content_analysis",
                "version": 1,
            },
        )
        self.assertEqual(result["status"], "queued")
        self.assertEqual(result["reindexJobId"], "job-1")
        self.assertEqual(result["jobKind"], "content_analysis")
        self.assertEqual(result["options"], persisted_options)
        self.assertEqual(result["cancellationKey"], advisory_params[0])

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

    def test_promote_discovery_recall_candidate_rejects_non_duplicate_rejection(
        self,
    ) -> None:
        payload = api_main.DiscoveryRecallCandidatePromotePayload.model_validate(
            {"reviewedBy": "admin-5"}
        )

        with (
            patch.object(
                api_main,
                "get_discovery_recall_candidate",
                return_value={
                    "recall_candidate_id": "recall-candidate-3",
                    "registered_channel_id": None,
                    "status": "rejected",
                    "rejection_reason": "low_quality",
                },
            ),
            patch.object(api_main, "PostgresSourceRegistrarAdapter") as registrar_class,
        ):
            with self.assertRaises(api_main.SequenceValidationError) as error:
                api_main.promote_discovery_recall_candidate(
                    "recall-candidate-3",
                    payload,
                )

        self.assertIn("Rejected recall candidates cannot be promoted", str(error.exception))
        registrar_class.assert_not_called()

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
