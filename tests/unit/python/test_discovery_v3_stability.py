from __future__ import annotations

from datetime import UTC, datetime, timedelta
import unittest

from services.workers.app.discovery_v3_actions import action_blocked_by_safety
from services.workers.app.discovery_v3_adversarial import refine_hypothesis_pack
from services.workers.app.discovery_v3_claims import build_direct_followup_hypotheses_from_claim, score_hidden_claim
from services.workers.app.discovery_v3_contracts import (
    build_discovery_config_fragment,
    build_source_evidence_contract,
    evaluate_source_contract,
)
from services.workers.app.discovery_v3_eval import run_fixture_replay_eval, run_replay_eval
from services.workers.app.discovery_v3_execution import (
    _hidden_claim_from_results,
    execute_hypothesis_batch_live,
    execute_hypothesis_batch_with_fixtures,
)
from services.workers.app.discovery_v3_hypotheses import build_initial_frontier
from services.workers.app.discovery_v3_identity import is_duplicate_endpoint, resolve_source_identity
from services.workers.app.discovery_v3_negative_evidence import negative_evidence_blocks_hypothesis
from services.workers.app.discovery_v3_orchestrator import diagnose_and_queue_repairs, filter_frontier_for_runtime_guards
from services.workers.app.discovery_v3_provider_health import evaluate_provider_health
from services.workers.app.discovery_v3_referee import decide_hypothesis_execution
from services.workers.app.discovery_v3_repository import DiscoveryV3Repository
from services.workers.app.discovery_v3_repair import rank_and_trim_by_diversity, repair_hypothesis_pack
from services.workers.app.discovery_v3_self_healing import build_repair_rows, diagnose_run_health
from services.workers.app.task_engine.discovery_v3_cluster_plugins import DiscoveryV3UrlClusterPlugin
from services.workers.app.task_engine.discovery_v3_endpoint_sweep_plugins import DiscoveryV3EndpointSweepPlugin
from services.workers.app.task_engine.discovery_v3_scoring_plugins import (
    DiscoveryV3ActionDeciderPlugin,
    DiscoveryV3EndpointScorerPlugin,
)
from services.workers.app.task_engine.discovery_v3_source_directory_plugins import (
    DiscoveryV3SourceDirectoryExtractorPlugin,
    extract_source_directory_links,
)
from services.workers.app.task_engine.discovery_runtime import DiscoveryRuntime


class DiscoveryV3StabilityTests(unittest.IsolatedAsyncioTestCase):
    def test_insert_hypotheses_reuses_unexecuted_dedupe_match_for_later_run(self) -> None:
        repository = DiscoveryV3Repository(database_url="postgresql://unused")
        calls: list[tuple[str, tuple[object, ...]]] = []

        def fake_query_one(sql: str, params: tuple[object, ...]) -> dict[str, object] | None:
            calls.append((sql, params))
            normalized = " ".join(sql.split()).lower()
            if normalized.startswith("insert into discovery_hypotheses"):
                return None
            if normalized.startswith("select * from discovery_hypotheses"):
                return {
                    "hypothesis_id": "old-hypothesis-1",
                    "run_id": "old-dry-run",
                    "target_id": "target-1",
                    "hypothesis_type": "source_directory",
                    "signal_mode": "direct",
                    "source_role": "procurement_signal",
                    "provider_id": "web_search",
                    "query_text": '"software development" "RFP"',
                    "status": "queued",
                }
            raise AssertionError(f"Unexpected SQL: {sql}")

        repository._query_one = fake_query_one  # type: ignore[method-assign]
        rows = repository._insert_hypotheses(
            [
                {
                    "run_id": "new-live-run",
                    "target_id": "target-1",
                    "hypothesis_type": "source_directory",
                    "signal_mode": "direct",
                    "source_role": "procurement_signal",
                    "acquisition_tactic": "search_fanout",
                    "query_text": '"software development" "RFP"',
                    "provider_id": "web_search",
                }
            ]
        )

        self.assertEqual(rows[0]["hypothesis_id"], "old-hypothesis-1")
        self.assertEqual(rows[0]["run_id"], "new-live-run")
        self.assertEqual(len(calls), 2)

    def test_seed_url_frontier_does_not_force_procurement_when_graph_has_many_roles(self) -> None:
        target = {
            "target_id": "target-community",
            "title": "Developer community paid help",
            "description": "Find GitHub, Hacker News and Stack Overflow paid-help source feeds.",
            "seed_topics": ["GitHub issue willing to pay bounty paid feature", "Hacker News contractor MVP budget"],
            "seed_entities": ["GitHub", "Hacker News", "Stack Overflow"],
            "seed_urls": ["https://github.com/search?q=%22paid%20feature%22&type=issues"],
            "graph_json": {
                "coreTopic": "Developer community paid help",
                "entities": ["GitHub"],
                "sourceRoleTargets": {
                    "procurement_signal": {"target": 1},
                    "social_pain_signal": {"target": 1},
                    "technical_change": {"target": 1},
                },
                "preferredSourceRoles": ["social_pain_signal"],
            },
        }
        frontier = build_initial_frontier(
            target=target,
            graph=target["graph_json"],
            coverage={"gaps_json": [{"sourceRole": "social_pain_signal", "gapScore": 0.9}]},
            run={"run_id": "run-community", "run_kind": "hidden_signal_scan"},
        )

        seed_probe = next(item for item in frontier if item["hypothesis_type"] == "seed_endpoint_probe")
        self.assertEqual(seed_probe["source_role"], "social_pain_signal")
        self.assertNotIn("tender_listing", seed_probe["expected_endpoint_kinds"])

    def test_seed_url_frontier_keeps_procurement_role_when_target_text_matches_procurement(self) -> None:
        target = {
            "target_id": "target-procurement",
            "title": "Software development RFP tender source finder",
            "description": "Find public procurement portals.",
            "seed_topics": ["software development RFP tender"],
            "seed_entities": ["SAM.gov"],
            "seed_urls": ["https://sam.gov/content/opportunities"],
            "graph_json": {
                "coreTopic": "Software development RFP tender source finder",
                "entities": ["SAM.gov"],
                "sourceRoleTargets": {
                    "procurement_signal": {"target": 1},
                    "social_pain_signal": {"target": 1},
                    "technical_change": {"target": 1},
                },
                "preferredSourceRoles": ["procurement_signal"],
            },
        }
        frontier = build_initial_frontier(
            target=target,
            graph=target["graph_json"],
            coverage={"gaps_json": [{"sourceRole": "primary_data", "gapScore": 0.9}]},
            run={"run_id": "run-procurement", "run_kind": "source_expand"},
        )

        seed_probe = next(item for item in frontier if item["hypothesis_type"] == "seed_endpoint_probe")
        self.assertEqual(seed_probe["source_role"], "procurement_signal")
        self.assertIn("tender_listing", seed_probe["expected_endpoint_kinds"])

    def test_frontier_filters_default_procurement_gap_for_grant_target(self) -> None:
        target = {
            "target_id": "target-grants",
            "title": "Grant and funded research deliverable sources",
            "description": "Find grant award, SBIR, research, clinical trial and foundation sources.",
            "seed_topics": ["grant award software platform dashboard data system source"],
            "seed_entities": ["Grants.gov", "SBIR", "NIH RePORTER", "EU Funding and Tenders"],
            "seed_domains": ["grants.gov", "sbir.gov"],
            "graph_json": {
                "coreTopic": "Grant and funded research deliverable sources",
                "preferredSourceRoles": ["primary_data", "report_research", "official_newsroom"],
            },
        }
        frontier = build_initial_frontier(
            target=target,
            graph=target["graph_json"],
            coverage={
                "gaps_json": [
                    {"sourceRole": "procurement_signal", "gapScore": 1.0},
                    {"sourceRole": "primary_data", "gapScore": 0.8},
                    {"sourceRole": "report_research", "gapScore": 0.7},
                ]
            },
            run={"run_id": "run-grants", "run_kind": "source_expand"},
        )

        roles = {item["source_role"] for item in frontier}
        self.assertNotIn("procurement_signal", roles)
        self.assertIn("primary_data", roles)
        seed_sweeps = [item for item in frontier if item["hypothesis_type"] == "seed_domain_sweep"]
        self.assertTrue(seed_sweeps)
        self.assertTrue(all("tender" not in str(item.get("query_text") or "").lower() for item in seed_sweeps))

    def test_frontier_uses_source_directory_for_ats_hiring_target(self) -> None:
        target = {
            "target_id": "target-ats",
            "title": "ATS hiring capacity gap APIs",
            "description": "Find public job board source endpoints for hiring-spike capacity gaps.",
            "seed_topics": ["founding engineer first engineer ATS API source"],
            "seed_entities": ["Greenhouse", "Lever", "Workable"],
            "seed_domains": ["jobs.lever.co", "boards.greenhouse.io"],
            "graph_json": {
                "coreTopic": "ATS hiring capacity gap APIs",
                "sourceRoleTargets": {
                    "procurement_signal": {"target": 5},
                    "source_directory": {"target": 3},
                    "primary_data": {"target": 3},
                },
                "preferredSourceRoles": ["source_directory", "primary_data", "official_newsroom"],
            },
        }
        frontier = build_initial_frontier(
            target=target,
            graph=target["graph_json"],
            coverage={
                "gaps_json": [
                    {"sourceRole": "procurement_signal", "gapScore": 1.0},
                    {"sourceRole": "source_directory", "gapScore": 0.8},
                    {"sourceRole": "primary_data", "gapScore": 0.7},
                ]
            },
            run={"run_id": "run-ats", "run_kind": "source_expand"},
        )

        seed_sweep = next(item for item in frontier if item["hypothesis_type"] == "seed_domain_sweep")
        self.assertEqual(seed_sweep["source_role"], "source_directory")
        self.assertNotIn("tender", str(seed_sweep.get("query_text") or "").lower())
        self.assertNotIn("tender_listing", seed_sweep["expected_endpoint_kinds"])

    def test_constructive_skeptic_additions_are_bounded(self) -> None:
        added_ideas = [
            {
                "additionType": "negative_control",
                "sourceRole": "social_pain_signal",
                "signalMode": "hidden",
                "providerId": "reddit",
                "queryText": f'"VMware alternative" control {index}',
                "expectedEvidence": ["noise rate"],
                "riskScore": 0.2,
                "priority": 0.9,
            }
            for index in range(25)
        ]
        repaired = repair_hypothesis_pack(
            {"hypotheses": []},
            {"repairPatches": [], "addedIdeas": added_ideas},
            budget={
                "total": 20,
                "bySignalMode": {"hidden": 20},
                "bySourceRole": {"social_pain_signal": 20},
                "maxPerProvider": {"reddit": 20},
                "maxPerQueryCluster": 20,
            },
        )
        self.assertEqual(len(repaired["hypotheses"]), 10)
        self.assertTrue(all(item["additionType"] == "negative_control" for item in repaired["hypotheses"]))

    async def test_low_meaningful_change_stops_repair_loop(self) -> None:
        async def explorer(_: dict) -> dict:
            return {
                "hypotheses": [
                    {
                        "hypothesisRef": "h1",
                        "hypothesisType": "official_source",
                        "signalMode": "direct",
                        "sourceRole": "authoritative_anchor",
                        "providerId": "web_search",
                        "queryText": '"VMware" official blog',
                        "riskScore": 0.3,
                    }
                ]
            }

        async def skeptic_review(_: dict) -> dict:
            return {
                "decision": "repair_required",
                "disagreementScore": 0.2,
                "maxSeverity": 0.4,
                "summary": "same issue",
                "critiques": [{"riskType": "too_broad"}],
                "repairPatches": [],
                "addedIdeas": [],
                "rejectHypotheses": [],
                "manualReviewItems": [],
                "globalWarnings": [],
            }

        async def skeptic_verify(_: dict) -> dict:
            return {
                "decision": "accept",
                "disagreementScore": 0.1,
                "maxSeverity": 0.2,
                "summary": "ok",
                "critiques": [],
                "repairPatches": [],
                "addedIdeas": [],
                "rejectHypotheses": [],
                "manualReviewItems": [],
                "globalWarnings": [],
            }

        final = await refine_hypothesis_pack(
            {},
            explorer=explorer,
            skeptic_review=skeptic_review,
            skeptic_verify=skeptic_verify,
        )
        self.assertEqual(len(final["debateLog"]), 1)

    def test_referee_routes_persistent_disagreement_to_manual_review(self) -> None:
        decision, reason = decide_hypothesis_execution(
            {
                "providerId": "web_search",
                "signalMode": "direct",
                "riskScore": 0.4,
            },
            {"disagreementScore": 0.7, "maxSeverity": 0.4},
        )
        self.assertEqual((decision, reason), ("manual_review", "persistent_disagreement"))

    def test_hidden_signal_confidence_is_capped_without_control(self) -> None:
        scored = score_hidden_claim(
            {
                "support_evidence_count": 100,
                "independent_source_count": 30,
                "unique_author_count": 50,
                "need_score": 1.0,
                "burst_score": 1.0,
                "novelty_score": 1.0,
                "risk_score": 0.0,
                "target_signal_rate": 0.8,
            }
        )
        self.assertLessEqual(scored["confidenceScore"], 0.70)
        self.assertFalse(scored["canGenerateDirectFollowup"])

    def test_hidden_signal_can_confirm_with_control_comparison(self) -> None:
        scored = score_hidden_claim(
            {
                "support_evidence_count": 25,
                "independent_source_count": 6,
                "unique_author_count": 15,
                "need_score": 0.9,
                "burst_score": 0.8,
                "novelty_score": 0.8,
                "risk_score": 0.1,
                "target_signal_rate": 0.5,
                "control_signal_rate": 0.1,
            }
        )
        self.assertEqual(scored["status"], "confirmed_signal")
        self.assertTrue(scored["canGenerateDirectFollowup"])

    def test_hidden_claim_is_built_from_open_web_target_and_control_results(self) -> None:
        target_results = [
            {
                "url": f"https://example-{index}.com/vmware-broadcom-migration-{index}",
                "canonical_url": f"https://example-{index}.com/vmware-broadcom-migration-{index}",
                "canonical_domain": f"example-{index}.com",
                "title": "VMware customers seek alternatives after Broadcom price increases",
                "snippet": "Teams report migration pressure, replacement planning, and implementation help needs.",
            }
            for index in range(10)
        ]
        control_results = [
            {
                "url": "https://generic.example/software-project-discussion",
                "canonical_url": "https://generic.example/software-project-discussion",
                "canonical_domain": "generic.example",
                "title": "Software project discussion",
                "snippet": "Generic project commentary without a specific buying pattern.",
            }
        ]
        claim = _hidden_claim_from_results(
            hypothesis={
                "target_id": "target-1",
                "run_id": "run-1",
                "query_text": '"VMware Broadcom" alternative migration problem',
                "control_query_text": "software project implementation problem alternative",
            },
            target_results=target_results,
            control_results=control_results,
        )

        self.assertIsNotNone(claim)
        assert claim is not None
        self.assertEqual(claim["signal_mode"], "hidden")
        self.assertEqual(claim["status"], "confirmed_signal")
        self.assertGreaterEqual(claim["support_evidence_count"], 8)
        self.assertGreaterEqual(claim["specificity_score"], 1.5)

    def test_hidden_claim_rejects_generic_pain_without_query_context(self) -> None:
        target_results = [
            {
                "url": f"https://generic-{index}.example/story",
                "canonical_url": f"https://generic-{index}.example/story",
                "canonical_domain": f"generic-{index}.example",
                "title": "Game subscription is too expensive",
                "snippet": "Readers discuss price increases and entertainment subscriptions.",
            }
            for index in range(5)
        ]
        claim = _hidden_claim_from_results(
            hypothesis={
                "target_id": "target-1",
                "run_id": "run-1",
                "query_text": '"failed ERP implementation vendor replacement" too expensive',
                "control_query_text": "software project implementation problem alternative",
            },
            target_results=target_results,
            control_results=[],
        )

        self.assertIsNone(claim)

    def test_hidden_claim_uses_configured_candidate_signal_groups(self) -> None:
        target_results = [
            {
                "url": f"https://local-{index}.example/discussion",
                "canonical_url": f"https://local-{index}.example/discussion",
                "canonical_domain": f"local-{index}.example",
                "title": "Local workflow team asks for paid build help",
                "snippet": "Budget approved for portal integration; seeking a specialist partner this quarter.",
            }
            for index in range(8)
        ]
        control_results = [
            {
                "url": "https://training.example/course",
                "canonical_url": "https://training.example/course",
                "canonical_domain": "training.example",
                "title": "Workflow portal tutorial",
                "snippet": "Training course and generic best practices.",
            }
        ]
        claim = _hidden_claim_from_results(
            hypothesis={
                "target_id": "target-1",
                "run_id": "run-1",
                "query_text": "workflow portal integration",
                "control_query_text": "workflow portal tutorial",
                "hiddenClaimExtraction": {
                    "positiveGroups": [
                        {"name": "buyer_ask", "cues": ["asks for", "seeking"]},
                        {"name": "budget", "cues": ["budget approved"]},
                        {"name": "delivery_object", "cues": ["portal integration"]},
                    ],
                    "negativeGroups": [
                        {"name": "training", "cues": ["tutorial", "training course"]},
                    ],
                    "thresholds": {
                        "minPositiveGroups": 2,
                        "minPositiveHits": 2,
                        "maxNegativeGroups": 0,
                    },
                },
            },
            target_results=target_results,
            control_results=control_results,
        )

        self.assertIsNotNone(claim)
        assert claim is not None
        self.assertEqual(claim["status"], "confirmed_signal")
        self.assertGreaterEqual(claim["support_evidence_count"], 8)

    def test_confirmed_hidden_claim_generates_direct_followup_only_with_control(self) -> None:
        target = {"target_id": "target-1", "title": "VMware migration Europe"}
        graph = {"coreTopic": "VMware migration Europe", "entities": ["VMware", "Broadcom"]}
        run = {"run_id": "run-1"}
        claim = {
            "claim_id": "claim-1",
            "claim_type": "migration_pressure",
            "status": "confirmed_signal",
            "title": "Companies are looking for VMware alternatives after Broadcom licensing pressure",
            "normalized_claim": "VMware alternative Broadcom licensing pressure",
            "related_entities": ["VMware", "Broadcom"],
            "support_evidence_count": 25,
            "independent_source_count": 6,
            "unique_author_count": 15,
            "need_score": 0.9,
            "burst_score": 0.8,
            "novelty_score": 0.8,
            "risk_score": 0.1,
            "target_signal_rate": 0.5,
            "control_signal_rate": 0.1,
        }

        followups = build_direct_followup_hypotheses_from_claim(
            claim=claim,
            target=target,
            graph=graph,
            run=run,
        )
        self.assertTrue(followups)
        self.assertTrue(all(item["signal_mode"] == "direct" for item in followups))
        self.assertTrue(all(item["provider_id"] == "web_search" for item in followups))
        self.assertTrue(any(item["source_role"] == "procurement_signal" for item in followups))
        self.assertEqual(followups[0]["explorer_json"]["claimId"], "claim-1")

        no_control = {**claim, "control_signal_rate": None}
        self.assertEqual(
            build_direct_followup_hypotheses_from_claim(
                claim=no_control,
                target=target,
                graph=graph,
                run=run,
            ),
            [],
        )

    def test_source_contract_probation_passes_and_fails_for_rss(self) -> None:
        contract = build_source_evidence_contract(
            {
                "provider_type": "rss",
                "source_role": "technical_change",
                "endpoint_kind": "rss_feed",
            }
        )
        passed = evaluate_source_contract(
            contract,
            {
                "successful_fetch_count": 3,
                "useful_item_count": 4,
                "duplicate_rate": 0.2,
                "noise_rate": 0.1,
                "topic_fit_score": 0.7,
                "extraction_success_rate": 0.9,
            },
        )
        failed = evaluate_source_contract(
            contract,
            {
                "successful_fetch_count": 3,
                "useful_item_count": 1,
                "duplicate_rate": 0.8,
                "noise_rate": 0.2,
                "topic_fit_score": 0.7,
                "extraction_success_rate": 0.9,
            },
        )
        self.assertEqual(passed["trust"]["coverageContribution"], 1.0)
        self.assertEqual(failed["status"], "degraded")

    def test_promotion_config_starts_in_probation(self) -> None:
        fragment = build_discovery_config_fragment(
            {
                "target_id": "target",
                "endpoint_id": "endpoint",
                "provider_type": "website",
                "source_role": "procurement_signal",
                "endpoint_kind": "procurement",
            }
        )
        self.assertEqual(fragment["trustStage"], "probation")
        self.assertEqual(fragment["coverageContribution"], 0.25)
        self.assertEqual(fragment["downstreamWeight"], 0.3)
        self.assertIn("evidenceContract", fragment)

    def test_negative_evidence_suppresses_cooldown_queries(self) -> None:
        now = datetime(2026, 5, 7, tzinfo=UTC)
        blocked, reason = negative_evidence_blocks_hypothesis(
            {
                "providerId": "web_search",
                "queryText": '"VMware alternative" "top 10"',
                "sourceRole": "industry_niche",
                "signalMode": "direct",
            },
            [
                {
                    "provider_id": "web_search",
                    "query_text": '"VMware alternative" "top 10"',
                    "source_role": "industry_niche",
                    "signal_mode": "direct",
                    "failure_mode": "seo_noise",
                    "cooldown_until": now + timedelta(days=7),
                }
            ],
            now=now,
        )
        self.assertTrue(blocked)
        self.assertEqual(reason, "seo_noise")

    def test_provider_auth_failure_is_provider_health_not_hypothesis_failure(self) -> None:
        health = evaluate_provider_health(
            {
                "provider_id": "reddit",
                "error_rate": 0.2,
                "auth_failed": True,
            }
        )
        self.assertEqual(health["status"], "auth_failed")
        self.assertEqual(health["repairKind"], "repair_provider_auth")
        self.assertFalse(health["hypothesisFailure"])
        self.assertFalse(health["shouldExecute"])

    def test_runtime_guards_filter_negative_evidence_and_provider_breakers(self) -> None:
        now = datetime(2026, 5, 7, tzinfo=UTC)
        accepted, skipped = filter_frontier_for_runtime_guards(
            [
                {
                    "provider_id": "web_search",
                    "query_text": '"VMware alternative" "top 10"',
                    "source_role": "industry_niche",
                    "signal_mode": "direct",
                },
                {
                    "provider_id": "reddit",
                    "query_text": '"VMware too expensive"',
                    "source_role": "social_pain_signal",
                    "signal_mode": "hidden",
                },
                {
                    "provider_id": "web_search",
                    "query_text": '"VMware release notes"',
                    "source_role": "technical_change",
                    "signal_mode": "direct",
                    "priority_score": 1.0,
                },
            ],
            negative_evidence=[
                {
                    "provider_id": "web_search",
                    "query_text": '"VMware alternative" "top 10"',
                    "source_role": "industry_niche",
                    "signal_mode": "direct",
                    "failure_mode": "seo_noise",
                    "cooldown_until": now + timedelta(days=7),
                }
            ],
            provider_health=[
                {
                    "provider_id": "reddit",
                    "status": "auth_failed",
                },
                {
                    "provider_id": "web_search",
                    "status": "degraded",
                },
            ],
        )
        self.assertEqual(len(accepted), 1)
        self.assertEqual(accepted[0]["priority_score"], 0.3)
        self.assertEqual(
            {item["reason"] for item in skipped},
            {"negative_evidence_cooldown", "provider_circuit_breaker"},
        )

    async def test_live_execution_provider_auth_failure_updates_health_not_negative_evidence(self) -> None:
        class FailingSearch:
            def search(self, **_: object) -> object:
                raise RuntimeError("API key unauthorized")

        result = await execute_hypothesis_batch_live(
            [
                {
                    "target_id": "00000000-0000-0000-0000-000000000001",
                    "run_id": "00000000-0000-0000-0000-000000000002",
                    "hypothesis_id": "00000000-0000-0000-0000-000000000003",
                    "provider_id": "web_search",
                    "query_text": '"VMware" official blog',
                    "source_role": "authoritative_anchor",
                    "signal_mode": "direct",
                }
            ],
            runtime=DiscoveryRuntime(web_search=FailingSearch()),
        )
        self.assertEqual(result["negativeEvidence"], [])
        self.assertEqual(result["providerHealth"][0]["status"], "auth_failed")
        self.assertFalse(result["providerHealth"][0]["hypothesisFailure"])

    async def test_live_execution_search_probe_scores_endpoint_candidates(self) -> None:
        class Search:
            def search(self, **_: object) -> object:
                return {
                    "results": [
                        {
                            "url": "https://example.com/changelog",
                            "title": "Example changelog",
                            "snippet": "Release notes and migration updates",
                        }
                    ],
                    "meta": {"provider": "stub", "request_count": 1, "returned_count": 1},
                }

        class Validator:
            def validate_urls(self, *, urls: list[str]) -> list[dict]:
                return [{"url": url, "isValid": True} for url in urls]

        class RssProbe:
            def probe_feeds(self, *, urls: list[str], sample_count: int) -> list[dict]:
                del sample_count
                return [
                    {
                        "url": url,
                        "isValid": True,
                        "sampleEntryCount": 5,
                        "recentEntryCount": 3,
                        "hasDates": True,
                        "entries": [{"title": "Release 1"}],
                    }
                    for url in urls
                ]

        class WebsiteProbe:
            def probe_websites(self, *, urls: list[str], sample_count: int) -> list[dict]:
                del sample_count
                return [
                    {
                        "url": url,
                        "classification": {"kind": "changelog"},
                        "listingCountEstimate": 5,
                        "sampleResourceCount": 2,
                        "freshness": "recent",
                    }
                    for url in urls
                ]

        result = await execute_hypothesis_batch_live(
            [
                {
                    "target_id": "00000000-0000-0000-0000-000000000001",
                    "run_id": "00000000-0000-0000-0000-000000000002",
                    "hypothesis_id": "00000000-0000-0000-0000-000000000003",
                    "provider_id": "web_search",
                    "query_text": '"VMware" release notes',
                    "source_role": "technical_change",
                    "signal_mode": "direct",
                    "endpoint_patterns": ["/feed.xml"],
                }
            ],
            runtime=DiscoveryRuntime(
                web_search=Search(),
                url_validator=Validator(),
                rss_probe=RssProbe(),
                website_probe=WebsiteProbe(),
            ),
            max_results_per_hypothesis=5,
            max_domains=5,
            max_endpoints=5,
        )
        self.assertEqual(len(result["providerQueries"]), 1)
        self.assertEqual(len(result["searchResults"]), 1)
        self.assertTrue(result["evidenceItems"])
        self.assertTrue(result["endpoints"])
        self.assertEqual(result["providerHealth"], [])
        self.assertGreaterEqual(max(endpoint["evidence_score"] for endpoint in result["endpoints"]), 0.7)

    async def test_live_execution_seed_feed_uses_fetcher_rss_truth_for_guarded_promotion(self) -> None:
        class Validator:
            def validate_urls(self, *, urls: list[str]) -> list[dict]:
                return [{"url": url, "isValid": True} for url in urls]

        class RssProbe:
            def probe_feeds(self, *, urls: list[str], sample_count: int) -> list[dict]:
                del sample_count
                return [
                    {
                        "url": url,
                        "is_valid_rss": True,
                        "feed_title": "Example Engineering",
                        "sample_entries": [
                            {
                                "title": f"Release {index}",
                                "published_at": datetime.now(UTC).isoformat(),
                            }
                            for index in range(5)
                        ],
                    }
                    for url in urls
                ]

        result = await execute_hypothesis_batch_live(
            [
                {
                    "target_id": "00000000-0000-0000-0000-000000000001",
                    "run_id": "00000000-0000-0000-0000-000000000002",
                    "hypothesis_id": "00000000-0000-0000-0000-000000000003",
                    "provider_id": "web_search",
                    "seed_url": "https://example.com/feed/",
                    "source_role": "technical_change",
                    "signal_mode": "direct",
                }
            ],
            runtime=DiscoveryRuntime(
                url_validator=Validator(),
                rss_probe=RssProbe(),
            ),
            max_endpoints=5,
        )

        endpoint = result["endpoints"][0]
        self.assertEqual(endpoint["provider_type"], "rss")
        self.assertTrue(endpoint["valid_feed"])
        self.assertEqual(endpoint["sample_entries"], 5)
        self.assertEqual(endpoint["recommended_action"], "auto_promote")

    async def test_live_execution_seed_procurement_url_reaches_manual_review_with_validation(self) -> None:
        class Validator:
            def validate_urls(self, *, urls: list[str]) -> list[dict]:
                return [{"url": url, "isValid": True, "status": 200} for url in urls]

        class WebsiteProbe:
            def probe_websites(self, *, urls: list[str], sample_count: int) -> list[dict]:
                del sample_count
                return [
                    {
                        "url": url,
                        "title": "Official tender opportunities",
                    }
                    for url in urls
                ]

        result = await execute_hypothesis_batch_live(
            [
                {
                    "target_id": "00000000-0000-0000-0000-000000000001",
                    "run_id": "00000000-0000-0000-0000-000000000002",
                    "hypothesis_id": "00000000-0000-0000-0000-000000000003",
                    "provider_id": "web_search",
                    "seed_url": "https://sam.gov/content/opportunities",
                    "source_role": "procurement_signal",
                    "signal_mode": "direct",
                }
            ],
            runtime=DiscoveryRuntime(
                url_validator=Validator(),
                website_probe=WebsiteProbe(),
            ),
            max_endpoints=5,
        )

        endpoint = result["endpoints"][0]
        self.assertEqual(endpoint["provider_type"], "website")
        self.assertEqual(endpoint["endpoint_kind"], "procurement")
        self.assertEqual(endpoint["recommended_action"], "review")
        self.assertEqual(endpoint["status"], "manual_review")
        self.assertIn("seedReview", endpoint["evidence_json"])

    def test_procurement_seed_targets_generate_procurement_seed_hypotheses(self) -> None:
        frontier = build_initial_frontier(
            target={
                "target_id": "00000000-0000-0000-0000-000000000001",
                "title": "Software migration public procurement",
                "seed_topics": ["cloud modernization contract opportunities"],
                "seed_entities": ["SAM.gov"],
                "seed_urls": ["https://sam.gov/content/opportunities"],
                "seed_domains": ["sam.gov"],
            },
            graph={
                "coreTopic": "Software migration public procurement",
                "entities": ["SAM.gov"],
                "subtopics": ["cloud modernization contract opportunities"],
            },
            coverage={"gaps_json": [{"sourceRole": "procurement_signal", "gapScore": 1.0}]},
            run={"run_id": "00000000-0000-0000-0000-000000000002"},
        )
        seed_hypotheses = [
            hypothesis for hypothesis in frontier if hypothesis["acquisition_tactic"].startswith("seed_")
        ]
        self.assertTrue(seed_hypotheses)
        self.assertTrue(all(item["source_role"] == "procurement_signal" for item in seed_hypotheses))
        self.assertTrue(any("/content/opportunities" in item["endpoint_patterns"] for item in seed_hypotheses))
        self.assertTrue(any("/przetargi" in item["endpoint_patterns"] for item in seed_hypotheses))
        self.assertTrue(any("/ausschreibungen" in item["endpoint_patterns"] for item in seed_hypotheses))

    def test_extended_seed_targets_generate_role_specific_hypotheses(self) -> None:
        examples = [
            (
                "security_advisory",
                "Cybersecurity advisories and vulnerability updates",
                ["security advisory CVE"],
                ["CISA"],
                ["https://www.cisa.gov/news-events/cybersecurity-advisories"],
                ["cisa.gov"],
                "/security/advisories",
                ["security_advisory"],
            ),
            (
                "primary_data",
                "Government open data datasets",
                ["open data catalog datasets"],
                ["Data.gov"],
                ["https://catalog.data.gov/dataset"],
                ["catalog.data.gov"],
                "/datasets",
                ["dataset", "api_openapi"],
            ),
            (
                "report_research",
                "Research reports and publication libraries",
                ["research publications reports"],
                ["NIST"],
                ["https://www.nist.gov/publications"],
                ["nist.gov"],
                "/publications",
                ["report_library", "source_directory"],
            ),
            (
                "regulatory_policy",
                "AI regulatory policy guidance",
                ["AI regulatory guidance policy standards"],
                ["NIST"],
                ["https://www.nist.gov/standardsgov"],
                ["nist.gov"],
                "/guidance",
                ["regulatory_policy"],
            ),
        ]
        for role, title, topics, entities, seed_urls, seed_domains, expected_pattern, expected_kinds in examples:
            with self.subTest(role=role):
                frontier = build_initial_frontier(
                    target={
                        "target_id": "00000000-0000-0000-0000-000000000001",
                        "title": title,
                        "seed_topics": topics,
                        "seed_entities": entities,
                        "seed_urls": seed_urls,
                        "seed_domains": seed_domains,
                    },
                    graph={"coreTopic": title, "entities": entities, "subtopics": topics},
                    coverage={"gaps_json": [{"sourceRole": role, "gapScore": 1.0}]},
                    run={"run_id": "00000000-0000-0000-0000-000000000002"},
                )
                seed_hypotheses = [
                    hypothesis for hypothesis in frontier if hypothesis["acquisition_tactic"].startswith("seed_")
                ]
                self.assertTrue(seed_hypotheses)
                self.assertTrue(all(item["source_role"] == role for item in seed_hypotheses))
                self.assertTrue(any(expected_pattern in item["endpoint_patterns"] for item in seed_hypotheses))
                self.assertTrue(
                    any(set(expected_kinds).issubset(set(item["expected_endpoint_kinds"])) for item in seed_hypotheses)
                )

    def test_source_identity_dedupes_same_domain_kind_role_and_feed_title(self) -> None:
        duplicate, reason = is_duplicate_endpoint(
            {
                "endpoint_url": "https://example.com/news/rss",
                "endpoint_kind": "rss_feed",
                "source_role": "official_newsroom",
            },
            [
                {
                    "endpoint_url": "https://example.com/news/feed.xml",
                    "endpoint_kind": "rss_feed",
                    "source_role": "official_newsroom",
                }
            ],
        )
        self.assertTrue(duplicate)
        self.assertEqual(reason, "same_domain_kind_role")
        identity = resolve_source_identity(
            {"endpoint_url": "https://example.com/news/rss", "endpoint_kind": "rss_feed"},
            [],
        )
        self.assertIn("https://example.com/news/rss", identity["known_feed_urls"])

    def test_diversity_budget_prevents_single_provider_collapse(self) -> None:
        hypotheses = [
            {
                "hypothesisType": "social_need_signal",
                "signalMode": "hidden",
                "sourceRole": "social_pain_signal",
                "providerId": "reddit",
                "queryText": f"same cluster {index}",
                "priorityScore": 1.0,
            }
            for index in range(20)
        ]
        selected = rank_and_trim_by_diversity(
            hypotheses,
            {
                "total": 20,
                "bySignalMode": {"hidden": 20},
                "bySourceRole": {"social_pain_signal": 20},
                "maxPerProvider": {"reddit": 3},
                "maxPerQueryCluster": 20,
            },
        )
        self.assertEqual(len(selected), 3)

    def test_kill_switch_blocks_auto_promotion(self) -> None:
        blocked, reason = action_blocked_by_safety(
            "auto_promote",
            {"killSwitch": True, "maxAutoPromotedRssPerDay": 20},
            {"autoPromotedRssToday": 0},
        )
        self.assertTrue(blocked)
        self.assertEqual(reason, "global_discovery_kill_switch")

    def test_replay_eval_records_precision_recall_noise(self) -> None:
        result = run_replay_eval(
            [
                {
                    "expectedSources": [{"url": "https://good.example/feed.xml"}],
                    "expectedRejects": [{"url": "https://bad.example"}],
                }
            ],
            lambda _: {
                "sources": [
                    {"url": "https://good.example/feed.xml"},
                    {"url": "https://noise.example"},
                ],
                "rejects": [{"url": "https://bad.example"}],
                "cost": 1.2,
            },
        )
        self.assertEqual(result["caseCount"], 1)
        self.assertEqual(result["metrics"]["precision"], 0.5)
        self.assertEqual(result["metrics"]["recall"], 1.0)
        self.assertEqual(result["metrics"]["noise"], 0.5)

    def test_fixture_replay_eval_reports_hidden_claim_precision_recall(self) -> None:
        result = run_fixture_replay_eval(
            [
                {
                    "provider_fixtures_json": {
                        "sources": [{"url": "https://good.example/feed.xml"}],
                        "rejects": [{"url": "https://bad.example"}],
                        "hiddenClaims": [{"normalized_claim": "vmware licensing pressure"}],
                    },
                    "expected_sources_json": [{"url": "https://good.example/feed.xml"}],
                    "expected_rejects_json": [{"url": "https://bad.example"}],
                    "expected_hidden_claims_json": [
                        {"normalized_claim": "vmware licensing pressure"},
                        {"normalized_claim": "missing claim"},
                    ],
                }
            ]
        )
        self.assertEqual(result["metrics"]["precision"], 1.0)
        self.assertEqual(result["metrics"]["rejectRecall"], 1.0)
        self.assertEqual(result["metrics"]["hiddenClaimRecall"], 0.5)
        self.assertEqual(result["metrics"]["hiddenClaimPrecision"], 1.0)

    def test_self_healing_diagnoses_provider_failure_without_hypothesis_poisoning(self) -> None:
        diagnosis = diagnose_run_health(
            {
                "provider_error_rate": 0.72,
                "coverage_score_delta": 0.0,
                "new_endpoint_count": 0,
                "new_signal_cluster_count": 0,
            }
        )
        failure_modes = {item["failureMode"] for item in diagnosis["diagnosis"]}
        repair_kinds = {item["repairKind"] for item in diagnosis["repairPlan"]}
        self.assertIn("provider_errors_high", failure_modes)
        self.assertIn("repair_provider_auth", repair_kinds)
        self.assertIn("coverage_not_improving", failure_modes)
        self.assertTrue(diagnosis["shouldRerun"])

        rows = build_repair_rows(target_id="target-1", run_id="run-1", diagnosis=diagnosis)
        self.assertTrue(rows)
        self.assertTrue(all(row["trigger_kind"] == "self_healing" for row in rows))
        self.assertEqual(rows[0]["target_id"], "target-1")

    async def test_self_healing_queues_bounded_repairs(self) -> None:
        class FakeRepository:
            def __init__(self) -> None:
                self.rows: list[dict[str, object]] = []

            async def insert_repairs(self, rows):  # type: ignore[no-untyped-def]
                self.rows.extend(rows)
                return rows

        repository = FakeRepository()
        result = await diagnose_and_queue_repairs(
            target_id="target-1",
            run_id="run-1",
            metrics={
                "search_result_count": 75,
                "new_endpoint_count": 0,
                "new_signal_cluster_count": 0,
                "coverage_score_delta": 0.0,
            },
            repository=repository,  # type: ignore[arg-type]
        )
        self.assertGreater(result["repairsQueued"], 0)
        self.assertEqual(len(repository.rows), result["repairsQueued"])
        self.assertTrue(any(row["repair_kind"] == "retry_endpoint_sweep" for row in repository.rows))

    async def test_v3_task_plugins_cluster_sweep_score_and_decide(self) -> None:
        clustered = await DiscoveryV3UrlClusterPlugin().execute(
            {},
            {
                "search_results": [
                    {
                        "url": "https://example.com/newsroom",
                        "title": "Example Newsroom",
                        "snippet": "Announcements and press releases",
                    }
                ]
            },
        )
        self.assertEqual(clustered["discovery_v3_domain_inventory"][0]["canonical_domain"], "example.com")

        swept = await DiscoveryV3EndpointSweepPlugin().execute(
            {
                "endpointPatterns": ["/feed.xml", "/przetargi"],
                "sourceRole": "technical_change",
                "languages": ["pl"],
            },
            clustered,
        )
        endpoints = swept["discovery_v3_endpoint_candidates"]
        self.assertTrue(any(endpoint["endpoint_kind"] == "rss_feed" for endpoint in endpoints))
        self.assertTrue(any(endpoint["endpoint_kind"] == "procurement" for endpoint in endpoints))

        scored = await DiscoveryV3EndpointScorerPlugin().execute(
            {
                "defaults": {
                    "interest_fit_score": 0.95,
                    "evidence_score": 0.85,
                    "quality_score": 0.8,
                    "yield_score": 0.8,
                    "freshness_score": 0.8,
                    "extraction_ready_score": 0.95,
                    "coverage_gap_score": 1.0,
                    "compliance_score": 0.98,
                    "adversarial_confidence_score": 0.8,
                    "novelty_score": 1.0,
                    "sample_entries": 3,
                    "valid_feed": True,
                }
            },
            swept,
        )
        rss_endpoint = next(
            endpoint
            for endpoint in scored["discovery_v3_scored_endpoints"]
            if endpoint["provider_type"] == "rss"
        )
        decided = await DiscoveryV3ActionDeciderPlugin().execute({}, {"discovery_v3_scored_endpoints": [rss_endpoint]})
        self.assertEqual(decided["discovery_v3_actioned_endpoints"][0]["recommended_action"], "auto_promote")

    async def test_source_directory_extractor_creates_followup_hypotheses(self) -> None:
        html = """
        <html><body>
          <a href="https://vendor.example/docs/vmware-migration">Vendor migration docs</a>
          <a href="https://facebook.com/vendor">Social profile</a>
          <a href="/internal">Internal navigation</a>
        </body></html>
        """
        extracted = extract_source_directory_links(html, origin_url="https://directory.example/resources")
        self.assertEqual(len(extracted["discoveredDomains"]), 1)
        self.assertEqual(extracted["discoveredDomains"][0]["canonical_domain"], "vendor.example")
        self.assertEqual(extracted["discoveredDomains"][0]["suggestedSourceRole"], "technical_change")
        self.assertEqual(extracted["edges"][0]["edge_kind"], "discovered_from_source_directory")
        self.assertEqual(extracted["followUpHypotheses"][0]["source_role"], "technical_change")
        self.assertEqual(extracted["followUpHypotheses"][0]["provider_id"], "web_search")

        plugin_result = await DiscoveryV3SourceDirectoryExtractorPlugin().execute(
            {"originUrl": "https://directory.example/resources", "html": html},
            {},
        )
        self.assertEqual(
            plugin_result["discovery_v3_source_directory_domains"][0]["canonical_domain"],
            "vendor.example",
        )

    def test_fixture_execution_bridge_produces_endpoints_and_negative_evidence(self) -> None:
        result = execute_hypothesis_batch_with_fixtures(
            [
                {
                    "target_id": "target-1",
                    "hypothesis_type": "source_directory",
                    "source_role": "technical_change",
                    "signal_mode": "direct",
                    "provider_id": "web_search",
                    "query_text": "vmware migration resources",
                    "endpoint_patterns": ["/feed.xml"],
                },
                {
                    "target_id": "target-1",
                    "hypothesis_type": "official_source",
                    "source_role": "authoritative_anchor",
                    "signal_mode": "direct",
                    "provider_id": "web_search",
                    "query_text": "no results query",
                },
            ],
            provider_fixtures={
                "searchResultsByQuery": {
                    "vmware migration resources": [
                        {
                            "url": "https://directory.example/resources",
                            "title": "VMware migration resources",
                            "snippet": "Directory of migration guides",
                        }
                    ]
                },
                "sourceDirectoryHtmlByUrl": {
                    "https://directory.example/resources": """
                    <a href="https://vendor.example/docs/vmware-migration">Vendor migration docs</a>
                    """
                },
                "endpointEvidenceByUrl": {
                    "https://vendor.example/feed.xml": {
                        "interest_fit_score": 0.95,
                        "evidence_score": 0.85,
                        "quality_score": 0.8,
                        "yield_score": 0.8,
                        "freshness_score": 0.8,
                        "extraction_ready_score": 0.95,
                        "coverage_gap_score": 1.0,
                        "compliance_score": 0.98,
                        "adversarial_confidence_score": 0.8,
                        "novelty_score": 1.0,
                        "sample_entries": 3,
                        "valid_feed": True,
                    }
                },
            },
        )
        self.assertTrue(any(endpoint["canonical_domain"] == "vendor.example" for endpoint in result["endpoints"]))
        self.assertTrue(any(endpoint["recommended_action"] == "auto_promote" for endpoint in result["endpoints"]))
        self.assertEqual(result["negativeEvidence"][0]["failure_mode"], "no_results")
        self.assertEqual(result["summary"]["negativeEvidenceCount"], 1)


if __name__ == "__main__":
    unittest.main()
