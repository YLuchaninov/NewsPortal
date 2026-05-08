from __future__ import annotations

import unittest
from unittest.mock import patch

from fastapi import FastAPI

from services.api.app import discovery_v3_api
from services.api.app.routes.discovery_routes import register_discovery_routes
from services.workers.app.discovery_v3_coverage import compute_coverage
from services.workers.app.discovery_v3_graph import compile_interest_graph
from services.workers.app.discovery_v3_hypotheses import build_initial_frontier


def _unwrap_json_param(value):  # type: ignore[no-untyped-def]
    if hasattr(value, "obj"):
        return value.obj
    if hasattr(value, "value"):
        return value.value
    return value


class DiscoveryV3CutoverTests(unittest.TestCase):
    def test_api_route_registration_exposes_v3_paths_only(self) -> None:
        app = FastAPI()
        register_discovery_routes(app, {})
        paths = {route.path for route in app.routes}

        self.assertIn("/maintenance/discovery/targets", paths)
        self.assertIn("/maintenance/discovery/runs", paths)
        self.assertIn("/maintenance/discovery/endpoints/{endpoint_id}/promote", paths)
        self.assertIn("/maintenance/discovery/contracts/{contract_id}/evaluate", paths)
        self.assertIn("/maintenance/discovery/negative-evidence/{negative_evidence_id}/clear-cooldown", paths)
        self.assertIn("/maintenance/discovery/eval-suites/{eval_suite_id}/run", paths)

        self.assertNotIn("/maintenance/discovery/missions", paths)
        self.assertNotIn("/maintenance/discovery/recall-missions", paths)
        self.assertNotIn("/maintenance/discovery/candidates", paths)
        self.assertNotIn("/maintenance/discovery/recall-candidates", paths)
        self.assertNotIn("/maintenance/discovery/classes", paths)

    def test_domain_list_filters_by_first_seen_target(self) -> None:
        seen: dict[str, object] = {}

        def fake_query_count(sql, params):  # type: ignore[no-untyped-def]
            seen["count_sql"] = sql
            seen["count_params"] = params
            return 0

        def fake_query_all(sql, params):  # type: ignore[no-untyped-def]
            seen["list_sql"] = sql
            seen["list_params"] = params
            return []

        with (
            patch.object(discovery_v3_api, "query_count", side_effect=fake_query_count),
            patch.object(discovery_v3_api, "query_all", side_effect=fake_query_all),
        ):
            result = discovery_v3_api.list_v3_records(
                "domains",
                target_id="target-1",
                page=1,
                page_size=20,
            )

        self.assertEqual(result["items"], [])
        self.assertIn("first_seen_target_id = %s", str(seen["count_sql"]))
        self.assertNotIn(" where target_id = %s", str(seen["count_sql"]))
        self.assertEqual(seen["count_params"], ("target-1",))
        self.assertEqual(seen["list_params"], ("target-1", 20, 0))

    def test_coverage_counts_probation_as_partial_not_strong(self) -> None:
        graph = {
            "sourceRoleTargets": {
                "technical_change": {"target": 2},
            }
        }
        coverage = compute_coverage(
            target_id="target-1",
            graph=graph,
            source_inventory=[
                {
                    "target_id": "target-1",
                    "source_role": "technical_change",
                    "is_active": True,
                    "config_json": {
                        "discovery": {
                            "trustStage": "probation",
                            "coverageContribution": 0.25,
                        }
                    },
                }
            ],
        )
        role = coverage["coverage_json"]["roles"]["technical_change"]
        self.assertEqual(role["probation"], 1)
        self.assertEqual(role["strong"], 0)
        self.assertEqual(role["coverageContribution"], 0.25)
        self.assertEqual(coverage["coverage_score"], 0.125)
        self.assertEqual(coverage["strong_source_count"], 0)
        self.assertEqual(coverage["missing_role_count"], 1)

    def test_coverage_dedupes_source_identity_before_counting_strength(self) -> None:
        graph = {
            "sourceRoleTargets": {
                "official_newsroom": {"target": 2},
            }
        }
        coverage = compute_coverage(
            target_id="target-1",
            graph=graph,
            source_inventory=[
                {
                    "target_id": "target-1",
                    "source_role": "official_newsroom",
                    "endpoint_kind": "rss_feed",
                    "fetch_url": "https://example.com/news/feed.xml",
                    "is_active": True,
                    "config_json": {"discovery": {"trustStage": "active"}},
                },
                {
                    "target_id": "target-1",
                    "source_role": "official_newsroom",
                    "endpoint_kind": "rss_feed",
                    "fetch_url": "https://example.com/news/rss",
                    "is_active": True,
                    "config_json": {"discovery": {"trustStage": "active"}},
                },
            ],
        )
        role = coverage["coverage_json"]["roles"]["official_newsroom"]
        self.assertEqual(role["strong"], 1)
        self.assertEqual(role["duplicate"], 1)
        self.assertEqual(coverage["strong_source_count"], 1)
        self.assertEqual(coverage["coverage_score"], 0.5)

    def test_graph_and_hypothesis_factory_generate_gap_frontier(self) -> None:
        target = {
            "target_id": "target-1",
            "title": "VMware migration Europe",
            "description": "Track migration pressure.",
            "seed_topics": ["VMware migration"],
            "seed_entities": ["VMware"],
            "seed_geos": ["Europe"],
            "seed_languages": ["en"],
        }
        graph = compile_interest_graph(target)
        coverage = {
            "gaps_json": [
                {
                    "sourceRole": "technical_change",
                    "gapScore": 1.0,
                }
            ]
        }
        frontier = build_initial_frontier(
            target=target,
            graph=graph,
            coverage=coverage,
            run={"run_id": "run-1"},
        )
        self.assertTrue(frontier)
        self.assertTrue(all(item["source_role"] == "technical_change" for item in frontier))
        self.assertTrue(any("release notes" in item["query_text"] for item in frontier))

    def test_promote_endpoint_delegates_to_endpoint_aware_registrar(self) -> None:
        endpoint = {
            "endpoint_id": "endpoint-1",
            "endpoint_url": "https://example.com/feed.xml",
            "provider_type": "rss",
            "source_role": "technical_change",
            "endpoint_kind": "rss_feed",
            "source_channel_id": None,
        }
        registered = {"endpoint_id": "endpoint-1", "status": "registered"}

        class FakeRegistrar:
            def __init__(self) -> None:
                self.calls = []

            def register_endpoint_source(self, **kwargs):
                self.calls.append(kwargs)
                return registered

        registrar = FakeRegistrar()
        with (
            patch.object(discovery_v3_api, "get_v3_record", return_value=endpoint),
            patch.object(discovery_v3_api, "PostgresSourceRegistrarAdapter", return_value=registrar),
        ):
            result = discovery_v3_api.promote_endpoint(
                "endpoint-1",
                discovery_v3_api.DiscoveryV3EndpointDecisionPayload(
                    reviewedBy="operator",
                    enabled=True,
                    tags=["vmware"],
                    operatorConfig={"ticket": "DISC-1"},
                ),
            )

        self.assertEqual(result, registered)
        self.assertEqual(registrar.calls[0]["endpoint"], endpoint)
        self.assertEqual(registrar.calls[0]["created_by"], "operator")
        self.assertEqual(registrar.calls[0]["tags"], ["vmware"])
        self.assertEqual(registrar.calls[0]["operator_config"], {"ticket": "DISC-1"})

    def test_run_eval_suite_records_completed_fixture_metrics(self) -> None:
        captured: dict[str, object] = {}

        def fake_query_all(sql, params):  # type: ignore[no-untyped-def]
            self.assertIn("from discovery_eval_cases", sql)
            self.assertEqual(params, ("suite-1",))
            return [
                {
                    "provider_fixtures_json": {
                        "sources": [{"url": "https://good.example/feed.xml"}],
                        "rejects": [{"url": "https://bad.example"}],
                    },
                    "expected_sources_json": [{"url": "https://good.example/feed.xml"}],
                    "expected_rejects_json": [{"url": "https://bad.example"}],
                }
            ]

        def fake_query_one(sql, params):  # type: ignore[no-untyped-def]
            self.assertIn("insert into discovery_eval_runs", sql)
            captured["params"] = params
            return {
                "eval_run_id": "eval-run-1",
                "metrics_json": _unwrap_json_param(params[2]),
            }

        with (
            patch.object(discovery_v3_api, "query_all", side_effect=fake_query_all),
            patch.object(discovery_v3_api, "query_one", side_effect=fake_query_one),
        ):
            result = discovery_v3_api.run_eval_suite(
                "suite-1",
                discovery_v3_api.DiscoveryV3EvalRunPayload(
                    configJson={"thresholdVersion": "test"},
                    requestedBy="operator",
                ),
            )

        params = captured["params"]
        config_json = _unwrap_json_param(params[1])
        metrics_json = result["metrics_json"]
        self.assertEqual(config_json["requestedBy"], "operator")
        self.assertEqual(metrics_json["status"], "completed")
        self.assertEqual(metrics_json["caseCount"], 1)
        self.assertEqual(metrics_json["metrics"]["precision"], 1.0)
        self.assertEqual(metrics_json["metrics"]["rejectRecall"], 1.0)


if __name__ == "__main__":
    unittest.main()
