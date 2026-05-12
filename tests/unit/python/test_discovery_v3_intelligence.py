import unittest

from services.workers.app.discovery_v3_autopilot import build_simple_target_payload, list_autopilot_profiles
from services.workers.app.discovery_v3_graph import build_target_from_system_interest, compile_interest_graph
from services.workers.app.discovery_v3_hypotheses import build_initial_frontier
from services.workers.app.discovery_v3_llm_gateway import DiscoveryV3LlmGateway
from services.workers.app.discovery_v3_llm_schemas import ConfigSimplificationOutput
from services.workers.app.discovery_v3_orchestrator import _accepted_hypotheses_from_pack
from services.workers.app.discovery_v3_source_expansion import build_existing_source_hypotheses
from services.workers.app.task_engine.adapters.search_fanout import SearchFanoutAdapter


class FakeRepository:
    def __init__(self) -> None:
        self.rows = []

    async def get_cached_llm_decision(self, *, task_name: str, input_hash: str):
        del task_name, input_hash
        return None

    async def insert_llm_decision(self, payload):
        self.rows.append(payload)
        return payload


class BadAnalyzer:
    def __init__(self) -> None:
        self.calls = 0

    def analyze(self, **kwargs):
        del kwargs
        self.calls += 1
        return {"result": {"unexpected": "shape"}, "meta": {"model": "fake", "cost_usd": 0}}


class FakeSearch:
    def __init__(self, provider, url):
        self.provider = provider
        self.url = url

    def search(self, **kwargs):
        del kwargs
        return {
            "results": [{"url": self.url, "title": self.provider, "provider_rank": 2}],
            "meta": {"provider": self.provider, "request_count": 1},
        }


class DiscoveryV3IntelligenceTests(unittest.IsolatedAsyncioTestCase):
    async def test_llm_gateway_repairs_once_then_logs_fallback(self):
        repository = FakeRepository()
        analyzer = BadAnalyzer()
        gateway = DiscoveryV3LlmGateway(repository=repository, llm_analyzer=analyzer)
        output = await gateway.run_json_task(
            task_name="discovery.config.simplify",
            input_payload={"prompt": "VMware migration Europe"},
            schema_model=ConfigSimplificationOutput,
            fallback_factory=lambda payload: {
                "title": payload["prompt"],
                "description": payload["prompt"],
                "seedTopics": [payload["prompt"]],
                "seedEntities": [],
                "seedGeos": [],
                "seedLanguages": ["en"],
                "autopilotProfile": "balanced",
                "policyHints": {},
                "assumptions": [],
            },
        )
        self.assertEqual(output["title"], "VMware migration Europe")
        self.assertEqual(analyzer.calls, 2)
        self.assertEqual(repository.rows[0]["status"], "fallback")
        self.assertTrue(repository.rows[0]["repair_attempted"])
        self.assertTrue(repository.rows[0]["fallback_used"])

    async def test_search_fanout_merges_provider_votes(self):
        fanout = SearchFanoutAdapter(
            {
                "ddgs": FakeSearch("ddgs", "https://example.com/news/"),
                "brave": FakeSearch("brave", "https://example.com/news"),
            }
        )
        result = await fanout.search(query="x", count=10, result_type="web", time_range=None)
        self.assertEqual(len(result["results"]), 1)
        self.assertEqual(set(result["results"][0]["provider_votes"]), {"ddgs", "brave"})
        self.assertEqual(result["meta"]["provider"], "fanout")

    def test_autopilot_profiles_include_conservative_and_simple_payload(self):
        profile_ids = {row["profileId"] for row in list_autopilot_profiles()}
        self.assertIn("conservative", profile_ids)
        payload = build_simple_target_payload({"prompt": "VMware alternatives in Poland"})
        self.assertEqual(payload["origin_kind"], "manual_prompt")
        self.assertEqual(payload["autopilot_json"]["websiteAutoPromote"], False)

    def test_system_interest_candidate_signals_flow_into_hidden_frontier(self):
        target = build_target_from_system_interest(
            {
                "interest_template_id": "interest-1",
                "name": "Workflow partner demand",
                "description": "Find hidden workflow implementation asks.",
                "positive_texts": ["workflow portal integration"],
                "selection_profile_definition_json": {
                    "candidateSignals": {
                        "positiveGroups": [{"name": "buyer", "cues": ["seeking", "budget"]}],
                        "negativeGroups": [{"name": "training", "cues": ["tutorial"]}],
                    },
                    "hiddenClaimExtraction": {
                        "thresholds": {"minPositiveGroups": 1, "minPositiveHits": 1, "maxNegativeGroups": 0}
                    },
                },
            }
        )
        target["target_id"] = "target-hidden"
        graph = compile_interest_graph(target)
        frontier = build_initial_frontier(
            target=target,
            graph=graph,
            coverage={"gaps_json": [{"sourceRole": "social_pain_signal", "gapScore": 0.9}]},
            run={"run_id": "run-hidden", "run_kind": "hidden_signal_scan"},
        )
        hidden = next(row for row in frontier if row["signal_mode"] == "hidden")

        self.assertEqual(hidden["hiddenClaimExtraction"]["positiveGroups"][0]["name"], "buyer")
        self.assertEqual(hidden["hiddenClaimExtraction"]["negativeGroups"][0]["name"], "training")
        self.assertEqual(hidden["hiddenClaimExtraction"]["thresholds"]["minPositiveGroups"], 1)

    def test_source_expansion_builds_sibling_and_replacement_hypotheses(self):
        target = {"target_id": "target-1", "title": "VMware migration"}
        graph = {"coreTopic": "VMware migration"}
        run = {"run_id": "run-1"}
        inventory = [
            {
                "channel_id": "strong",
                "fetch_url": "https://example.com/news",
                "source_role": "technical_change",
                "is_active": True,
                "config_json": {"discovery": {"trustStage": "active", "coverageContribution": 1.0}},
            },
            {
                "channel_id": "weak",
                "fetch_url": "https://weak.example/feed.xml",
                "source_role": "industry_niche",
                "is_active": False,
                "config_json": {"discovery": {"trustStage": "degraded", "coverageContribution": 0.0}},
            },
        ]
        hypotheses = build_existing_source_hypotheses(target=target, graph=graph, run=run, source_inventory=inventory)
        self.assertIn("sibling_endpoint", {row["hypothesis_type"] for row in hypotheses})
        self.assertIn("replacement_source", {row["hypothesis_type"] for row in hypotheses})

    def test_source_expansion_consumes_feed_probe_evidence_without_domain_rules(self):
        target = {"target_id": "target-1", "title": "Operational workflow signals"}
        graph = {"coreTopic": "Operational workflow signals"}
        run = {"run_id": "run-1"}
        inventory = [
            {
                "channel_id": "website-with-feed",
                "fetch_url": "https://example.com/news",
                "source_role": "industry_niche",
                "is_active": True,
                "config_json": {
                    "discovery": {"trustStage": "probation", "coverageContribution": 0.5},
                    "discoveryHints": {"discoveredFeedUrls": ["https://example.com/feed.xml"]},
                },
            }
        ]

        hypotheses = build_existing_source_hypotheses(target=target, graph=graph, run=run, source_inventory=inventory)
        feed_hypotheses = [row for row in hypotheses if row["hypothesis_type"] == "discovered_feed_candidate"]

        self.assertEqual(len(feed_hypotheses), 1)
        self.assertEqual(feed_hypotheses[0]["seed_url"], "https://example.com/feed.xml")
        self.assertEqual(feed_hypotheses[0]["expected_provider_types"], ["rss"])
        self.assertEqual(feed_hypotheses[0]["acquisition_tactic"], "feed_probe_autodiscovery")

    def test_referee_pack_rows_are_normalized_before_insert(self):
        rows = _accepted_hypotheses_from_pack(
            {
                "hypotheses": [
                    {
                        "hypothesisType": "missing_angle",
                        "signalMode": "direct",
                        "sourceRole": "report_research",
                        "providerId": "web_search",
                        "queryText": "VMware report",
                        "refereeDecision": "accept",
                    }
                ]
            },
            run={"run_id": "run-1"},
            target={"target_id": "target-1"},
        )
        self.assertEqual(rows[0]["hypothesis_type"], "missing_angle")
        self.assertEqual(rows[0]["source_role"], "report_research")


if __name__ == "__main__":
    unittest.main()
