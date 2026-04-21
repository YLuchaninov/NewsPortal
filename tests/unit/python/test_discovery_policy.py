import unittest
import sys
import types

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

from services.workers.app.discovery_policy import (
    build_policy_review,
    normalize_runtime_discovery_policy,
    website_kind_matches_supported,
)
from services.workers.app.task_engine.adapters.web_search import (
    BraveWebSearchAdapter,
    SerperWebSearchAdapter,
)


class DiscoveryPolicyTests(unittest.TestCase):
    def test_normalize_runtime_policy_accepts_negative_domains_alias(self) -> None:
        policy = normalize_runtime_discovery_policy(
            lane="graph",
            applied_policy_json={
                "profileId": "profile-1",
                "graphPolicy": {
                    "providerTypes": ["website"],
                    "supportedWebsiteKinds": ["editorial", "procurement_portal"],
                    "negativeDomains": ["spam.example"],
                    "expectedSourceShapes": ["editorial_stream"],
                    "allowedSourceFamilies": ["official_updates"],
                    "diversityCaps": {"maxPerSourceFamily": 2},
                },
            },
            mission_like={"target_provider_types": ["rss", "website"]},
        )

        self.assertEqual(policy["providerTypes"], ["website"])
        self.assertEqual(policy["blockedDomains"], ["spam.example"])
        self.assertEqual(
            policy["supportedWebsiteKinds"],
            ["editorial", "procurement_portal"],
        )
        self.assertEqual(policy["expectedSourceShapes"], ["editorial_stream"])
        self.assertEqual(policy["allowedSourceFamilies"], ["official_updates"])
        self.assertEqual(policy["diversityCaps"], {"maxPerSourceFamily": 2})

    def test_procurement_portal_matches_listing_like_probe_output(self) -> None:
        self.assertTrue(
            website_kind_matches_supported("listing", ["procurement_portal"])
        )
        self.assertTrue(
            website_kind_matches_supported("document", ["procurement_portal"])
        )
        self.assertFalse(
            website_kind_matches_supported("entity", ["procurement_portal"])
        )

    def test_policy_review_routes_browser_residuals_to_manual_review(self) -> None:
        policy = normalize_runtime_discovery_policy(
            lane="recall",
            applied_policy_json={
                "profileId": "profile-1",
                "recallPolicy": {
                    "providerTypes": ["website"],
                    "supportedWebsiteKinds": ["editorial"],
                    "minPromotionScore": 0.55,
                },
            },
            mission_like={"target_provider_types": ["website"]},
        )

        review = build_policy_review(
            lane="recall",
            policy=policy,
            candidate={
                "provider_type": "website",
                "url": "https://example.com/engineering",
                "title": "Engineering updates",
            },
            evaluation_json={
                "classification": {"kind": "editorial"},
                "browser_assisted_recommended": True,
            },
            fit_score=0.7,
            quality_prior=0.68,
            lexical_score=0.72,
            default_threshold=None,
            search_provider="ddgs",
            query_family="engineering_updates",
        )

        self.assertEqual(review["verdict"], "manual_review")
        self.assertEqual(review["policyVerdict"], "manual_review")
        self.assertEqual(review["reasonBucket"], "browser_assisted_residual")
        self.assertEqual(review["onboardingVerdict"], "manual_review")
        self.assertEqual(review["productivityRisk"], "high")
        self.assertEqual(review["usefulnessDiagnostic"], "manual_only_residual")

    def test_brave_adapter_normalizes_provider_payload(self) -> None:
        adapter = BraveWebSearchAdapter(
            api_key="brave-key",
            request_json=lambda **kwargs: {
                "web": {
                    "results": [
                        {
                            "url": "https://example.com/post",
                            "title": "Example title",
                            "description": "Example snippet",
                            "profile": {"name": "Example"},
                        }
                    ]
                }
            },
        )

        result = adapter.search(query="engineering updates", count=3, result_type="text", time_range="month")

        self.assertEqual(result["meta"]["provider"], "brave")
        self.assertEqual(result["meta"]["returned_count"], 1)
        self.assertEqual(result["results"][0]["url"], "https://example.com/post")
        self.assertEqual(result["results"][0]["provider_rank"], 1)

    def test_serper_adapter_normalizes_provider_payload(self) -> None:
        adapter = SerperWebSearchAdapter(
            api_key="serper-key",
            request_json=lambda **kwargs: {
                "organic": [
                    {
                        "link": "https://example.com/post",
                        "title": "Serper title",
                        "snippet": "Serper snippet",
                        "date": "2026-04-21",
                        "position": 2,
                    }
                ]
            },
        )

        result = adapter.search(query="release notes", count=5, result_type="text", time_range="month")

        self.assertEqual(result["meta"]["provider"], "serper")
        self.assertEqual(result["results"][0]["title"], "Serper title")
        self.assertEqual(result["results"][0]["provider_rank"], 1)


if __name__ == "__main__":
    unittest.main()
