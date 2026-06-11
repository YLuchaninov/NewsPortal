from __future__ import annotations

import unittest
from inspect import Parameter, signature
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI

from services.api.app import discovery_vnext_api
from services.api.app.routes.discovery_routes import register_discovery_routes
from services.workers.app.discovery_vnext_artifacts import (
    validate_artifact_payload,
    validate_discovery_brief,
    validate_source_scope_resolution,
    validate_source_understanding,
)
from services.workers.app.discovery_vnext_brief import compile_discovery_brief
from services.workers.app.discovery_vnext_candidates import build_candidate_rows, query_quality_report
from services.workers.app.discovery_vnext_megaloop import (
    compare_hypothesis_batches,
    run_mega_loop_preview,
)
from services.workers.app.discovery_vnext_probe import build_probe_plan, execute_probe_plan
from services.workers.app.discovery_vnext_routing import route_source_understanding
from services.workers.app.discovery_vnext_scope_resolution import resolve_source_scope
from services.workers.app.discovery_vnext_understanding import synthesize_source_understanding


def _unwrap_json_param(value):  # type: ignore[no-untyped-def]
    if hasattr(value, "obj"):
        return value.obj
    if hasattr(value, "value"):
        return value.value
    return value


def _tech(score: float) -> dict[str, object]:
    return {
        "score": score,
        "canPollCheaply": score >= 0.5,
        "hasStableUrls": True,
        "hasDatesOrVersions": True,
        "hasListingsOrFeeds": score >= 0.5,
        "requiresBrowser": False,
        "requiresAuth": False,
    }


class DiscoveryVNextFoundationTests(unittest.TestCase):
    def test_core_vnext_modules_do_not_hardcode_eval_domains(self) -> None:
        root = Path(__file__).resolve().parents[3]
        core_paths = [
            root / "services/workers/app/discovery_vnext_brief.py",
            root / "services/workers/app/discovery_vnext_megaloop.py",
            root / "services/workers/app/discovery_vnext_candidates.py",
            root / "services/workers/app/discovery_vnext_probe.py",
            root / "services/workers/app/discovery_vnext_scope_resolution.py",
            root / "services/workers/app/discovery_vnext_understanding.py",
            root / "services/workers/app/discovery_vnext_routing.py",
            root / "services/workers/app/discovery_vnext_handoff.py",
            root / "services/api/app/discovery_vnext_api.py",
        ]
        forbidden_terms = [
            "out" + "sourcing",
            "procurement",
            "security advisory",
            "research grants",
            "local public records",
        ]
        rendered = "\n".join(path.read_text(encoding="utf-8").lower() for path in core_paths)

        for term in forbidden_terms:
            self.assertNotIn(term, rendered)

    def test_brief_compiler_is_domain_neutral_for_unrelated_interest(self) -> None:
        artifact = compile_discovery_brief(
            {
                "interestId": "interest-1",
                "name": "Clinical trial updates",
                "description": "Track public evidence of new clinical trial results and protocol updates.",
            }
        )

        self.assertEqual(artifact["artifactType"], "DiscoveryBrief")
        self.assertTrue(artifact["validation"]["schemaValid"], artifact["validation"])
        rendered = str(artifact["payload"]).lower()
        self.assertNotIn("procurement", rendered)
        self.assertNotIn("job board", rendered)
        self.assertNotIn("out" + "sourcing", rendered)

    def test_brief_compiler_prefers_signal_cues_over_proof_names_for_queries(self) -> None:
        brief = compile_discovery_brief(
            {
                "interestId": "interest-live-gap",
                "name": "Live gap proof: public procurement",
                "description": "Domain-neutral live proof pack.",
                "positive_texts": [
                    "public tender software implementation",
                    "request for proposal digital services",
                ],
                "candidate_positive_signals": [
                    "buyer_notice: public tender, RFP, RFQ, procurement notice, call for bids",
                ],
            }
        )

        self.assertIn("tender", brief["payload"]["keywordHints"])
        self.assertIn("public tender software implementation", brief["payload"]["querySeeds"])
        self.assertIn("request proposal digital services", brief["payload"]["querySeeds"])
        self.assertNotIn("proof", brief["payload"]["keywordHints"])
        preview = run_mega_loop_preview(brief["payload"], max_batches=1)
        query_families = preview["batches"][0]["payload"]["hypotheses"][0]["queryFamilies"]
        queries = [family["queries"][0] for family in query_families]
        self.assertEqual(queries[0], "public tender software implementation official")
        self.assertEqual(queries[1], "request proposal digital services official source")
        self.assertTrue(all("live gap proof" not in query for query in queries))

    def test_domain_contamination_is_rejected_when_interest_does_not_imply_it(self) -> None:
        issues = validate_discovery_brief(
            {
                "interestName": "Product changelog monitoring",
                "sourceInterestText": "Product changelog monitoring",
                "goal": "Find public product update signals.",
                "desiredSignals": [
                    {
                        "description": "Relevant public update",
                        "directness": "direct",
                        "expectedEvidencePatterns": ["official announcement"],
                    }
                ],
                "negativeSignals": [{"description": "noise"}],
                "artifactExpectations": ["changelog", "signal_candidate"],
                "freshnessNeed": "normal",
                "constraints": {"publicOnly": True},
                "keywordHints": ["procurement"],
            }
        )

        self.assertTrue(any(issue.code == "domain_contamination" for issue in issues))

    def test_source_understanding_rejects_yield_based_reasoning(self) -> None:
        issues = validate_source_understanding(
            {
                "sourceUrl": "https://example.org/updates",
                "sourceRoleDescription": "Publishes recurring public update artifacts.",
                "sourceVoice": "owner_or_operator",
                "artifactFreshnessKind": "official_update",
                "signalProductionMode": "official_update",
                "observedArtifactTypes": ["signal_candidate"],
                "canProduceSignals": [
                    {
                        "signalDescription": "Public update",
                        "capability": "high",
                        "capabilityScore": 0.8,
                        "directness": "direct",
                        "evidenceFromProbe": ["Probe observed listing pages."],
                    }
                ],
                "artifactFit": 0.8,
                "technicalObservability": _tech(0.7),
                "evidenceDirectness": 0.7,
                "sourceRoleConfidence": 0.8,
                "risk": {"overallRisk": "low"},
                "routingConfidence": 0.8,
                "yieldIndependent": True,
                "reasonToKeep": "Recent yield is high.",
                "reasonNotToAutoRegister": "No blocker.",
            }
        )

        self.assertTrue(any(issue.code == "yield_reason_forbidden" for issue in issues))

    def test_zero_historical_yield_does_not_downgrade_observable_source(self) -> None:
        decision = route_source_understanding(
            {
                "candidateId": "candidate-1",
                "sourceUrl": "https://example.org/updates",
                "sourceRoleDescription": "Publishes recurring public update artifacts.",
                "sourceVoice": "owner_or_operator",
                "artifactFreshnessKind": "official_update",
                "signalProductionMode": "official_update",
                "observedArtifactTypes": ["signal_candidate"],
                "canProduceSignals": [
                    {
                        "signalDescription": "Public update",
                        "capability": "high",
                        "capabilityScore": 0.60,
                        "directness": "direct",
                        "evidenceFromProbe": ["Probe observed listing and detail pages."],
                    }
                ],
                "artifactFit": 0.8,
                "technicalObservability": _tech(0.7),
                "evidenceDirectness": 0.7,
                "sourceRoleConfidence": 0.8,
                "risk": {"overallRisk": "low", "riskScore": 0.2},
                "routingConfidence": 0.8,
                "accessPattern": "public",
                "suggestedProviderType": "website",
                "probeSummary": {"pageRoleHints": {"officialOwnerLikely": True}},
                "yieldIndependent": True,
                "historicalTelemetry": {"usefulYieldScore": 0.0, "selectedCount": 0},
            },
            provider_type="website",
            access_pattern="public",
        )

        self.assertEqual(decision["decision"], "cheap_watch")
        self.assertNotIn("usefulYieldScore", decision["scoreComponents"])

    def test_high_confidence_rss_can_enter_probation(self) -> None:
        decision = route_source_understanding(
            {
                "candidateId": "candidate-2",
                "sourceUrl": "https://example.org/feed.xml",
                "sourceScopeType": "feed",
                "sourceRoleDescription": "Publishes recurring feed items.",
                "sourceVoice": "owner_or_operator",
                "artifactFreshnessKind": "recurring_feed",
                "signalProductionMode": "direct_event_feed",
                "observedArtifactTypes": ["signal_candidate"],
                "canProduceSignals": [
                    {
                        "signalDescription": "Public update",
                        "capability": "high",
                        "capabilityScore": 0.9,
                        "directness": "direct",
                        "evidenceFromProbe": ["Probe observed valid feed entries."],
                    }
                ],
                "artifactFit": 0.9,
                "technicalObservability": _tech(0.85),
                "evidenceDirectness": 0.8,
                "sourceRoleConfidence": 0.8,
                "risk": {"overallRisk": "low", "riskScore": 0.15},
                "routingConfidence": 0.9,
                "accessPattern": "public",
                "suggestedProviderType": "rss",
                "probeSummary": {
                    "validFeed": True,
                    "productiveFeed": True,
                    "feedSampleEntryCount": 2,
                    "feedFinalUrl": "https://feeds.example.org/updates.xml",
                },
                "yieldIndependent": True,
            },
            provider_type="rss",
            access_pattern="public",
        )

        self.assertEqual(decision["decision"], "auto_register_probation")
        self.assertEqual(decision["actions"][1]["actionType"], "create_probation_channel")

    def test_parseable_empty_rss_cannot_enter_probation(self) -> None:
        decision = route_source_understanding(
            {
                "candidateId": "candidate-empty-feed",
                "sourceUrl": "https://example.org/feed.xml",
                "sourceScopeType": "feed",
                "sourceRoleDescription": "Publishes feed metadata.",
                "sourceVoice": "owner_or_operator",
                "artifactFreshnessKind": "recurring_feed",
                "signalProductionMode": "direct_event_feed",
                "observedArtifactTypes": ["unknown"],
                "canProduceSignals": [
                    {
                        "signalDescription": "Public update",
                        "capability": "high",
                        "capabilityScore": 0.9,
                        "directness": "direct",
                        "evidenceFromProbe": ["Probe observed parseable feed metadata."],
                    }
                ],
                "artifactFit": 0.9,
                "technicalObservability": _tech(0.85),
                "evidenceDirectness": 0.8,
                "sourceRoleConfidence": 0.8,
                "risk": {"overallRisk": "low", "riskScore": 0.15},
                "routingConfidence": 0.9,
                "accessPattern": "public",
                "suggestedProviderType": "rss",
                "probeSummary": {"validFeed": True, "productiveFeed": False, "feedSampleEntryCount": 0},
                "yieldIndependent": True,
            },
            provider_type="rss",
            access_pattern="public",
        )

        self.assertEqual(decision["decision"], "manual_review")
        self.assertFalse(decision["allowChannelCreation"])

    def test_auth_and_captcha_route_to_safe_exception_paths(self) -> None:
        base = {
            "sourceUrl": "https://example.org/private",
            "sourceRoleDescription": "Potential source with restricted access.",
            "sourceVoice": "owner_or_operator",
            "artifactFreshnessKind": "official_update",
            "signalProductionMode": "official_update",
            "observedArtifactTypes": ["signal_candidate"],
            "canProduceSignals": [
                {
                    "signalDescription": "Public update",
                    "capability": "high",
                    "capabilityScore": 0.95,
                    "directness": "direct",
                    "evidenceFromProbe": ["Probe reached login page."],
                }
            ],
            "artifactFit": 0.9,
            "technicalObservability": _tech(0.8),
            "evidenceDirectness": 0.8,
            "sourceRoleConfidence": 0.8,
            "risk": {"overallRisk": "low", "riskScore": 0.2},
            "routingConfidence": 0.9,
            "yieldIndependent": True,
        }

        self.assertEqual(
            route_source_understanding(base, provider_type="website", access_pattern="requires_auth")["decision"],
            "adapter_backlog",
        )
        self.assertEqual(
            route_source_understanding(base, provider_type="website", access_pattern="captcha_blocked")["decision"],
            "blocked",
        )

    def test_artifact_validation_requires_probe_limits(self) -> None:
        issues = validate_artifact_payload(
            "ProbePlan",
            {
                "candidateUrl": "https://example.org",
                "probeStrategy": "cheap_static_first",
                "checks": ["fetch entry URL"],
                "disallowedActions": ["login", "captcha_bypass"],
            },
        )

        self.assertTrue(any(issue.path == "$.limits" for issue in issues))

    def test_api_registers_vnext_preview_and_read_paths_without_reintroducing_legacy_candidates(self) -> None:
        app = FastAPI()
        register_discovery_routes(app, {})
        paths = {route.path for route in app.routes}

        self.assertIn("/maintenance/discovery/brief/preview", paths)
        self.assertIn("/maintenance/discovery/artifacts", paths)
        self.assertIn("/maintenance/discovery/mega-loop/preview", paths)
        self.assertIn("/maintenance/discovery/candidates/normalize", paths)
        self.assertIn("/maintenance/discovery/probe/plan/preview", paths)
        self.assertIn("/maintenance/discovery/probe/execute", paths)
        self.assertIn("/maintenance/discovery/understand/preview", paths)
        self.assertIn("/maintenance/discovery/routing-decisions/apply", paths)
        self.assertIn("/maintenance/discovery/probation/handoff", paths)
        self.assertIn("/maintenance/discovery/feedback", paths)
        self.assertIn("/maintenance/discovery/source-inventory/{record_id}", paths)
        self.assertIn("/maintenance/discovery/replay", paths)
        self.assertIn("/maintenance/discovery/rollback/apply", paths)
        self.assertNotIn("/maintenance/discovery/vnext/artifacts", paths)
        self.assertNotIn("/maintenance/discovery/targets", paths)

    def test_brief_preview_facade_preserves_route_body_signature(self) -> None:
        app = FastAPI()
        register_discovery_routes(app, {})
        route = next(route for route in app.routes if route.path == "/maintenance/discovery/brief/preview")

        for endpoint in (discovery_vnext_api.preview_brief, route.endpoint):
            params = list(signature(endpoint).parameters.values())
            self.assertEqual([param.name for param in params], ["payload"])
            self.assertEqual(
                getattr(params[0].annotation, "__name__", params[0].annotation),
                "DiscoveryVNextBriefPreviewPayload",
            )
            self.assertNotEqual(params[0].kind, Parameter.VAR_POSITIONAL)
            self.assertNotEqual(params[0].kind, Parameter.VAR_KEYWORD)

    def test_discovery_vnext_api_facade_exposes_core_contract_symbols(self) -> None:
        expected_symbols = [
            "DiscoveryVNextBriefPreviewPayload",
            "DiscoveryVNextCandidateCreatePayload",
            "DiscoveryVNextProbeExecutePayload",
            "DiscoveryVNextRoutingApplyPayload",
            "DiscoveryVNextProbationHandoffPayload",
            "preview_brief",
            "list_vnext_records",
            "get_vnext_record",
            "source_identity_key",
            "apply_probation_handoff_from_payload",
            "execute_full_probe_understand_route",
        ]

        for symbol in expected_symbols:
            self.assertTrue(hasattr(discovery_vnext_api, symbol), symbol)

        payload = discovery_vnext_api.DiscoveryVNextBriefPreviewPayload.model_validate(
            {
                "interestId": "interest-1",
                "positiveTexts": "official update",
                "candidatePositiveSignals": ["item evidence"],
            }
        )
        dumped = payload.model_dump(by_alias=True)
        self.assertEqual(dumped["interestId"], "interest-1")
        self.assertEqual(payload.positive_texts, ["official update"])
        self.assertEqual(payload.candidate_positive_signals, ["item evidence"])
        with self.assertRaises(Exception):
            discovery_vnext_api.DiscoveryVNextBriefPreviewPayload.model_validate(
                {"name": "Portable source monitoring", "unexpected": True}
            )

    def test_probe_plan_defaults_to_fetchers_boundary_and_no_browser(self) -> None:
        plan = build_probe_plan(
            candidate_url="https://example.org/updates",
            candidate_kind_guess="website",
        )

        self.assertEqual(plan["artifactType"], "ProbePlan")
        self.assertTrue(plan["validation"]["schemaValid"], plan["validation"])
        self.assertEqual(plan["payload"]["limits"]["maxBrowserRequests"], 0)
        self.assertNotIn("bounded_browser", plan["payload"]["allowedEscalations"])
        self.assertIn("website_static_probe", plan["payload"]["checks"])
        self.assertEqual(plan["payload"]["fetchersBoundary"]["owner"], "services/fetchers")

    def test_probe_plan_requires_explicit_browser_escalation_when_browser_budget_is_positive(self) -> None:
        plan = build_probe_plan(
            candidate_url="https://example.org/updates",
            candidate_kind_guess="website",
            policy={"maxBrowserRequests": 2},
        )

        self.assertTrue(plan["validation"]["schemaValid"], plan["validation"])
        self.assertIn("bounded_browser", plan["payload"]["allowedEscalations"])
        self.assertIn("bounded_browser_probe", plan["payload"]["checks"])

    def test_execute_probe_plan_uses_fetchers_adapters_and_provider_failures_are_telemetry(self) -> None:
        class FakeFeedAdapter:
            def probe_feeds(self, *, urls, sample_count, timeout_seconds=None):  # type: ignore[no-untyped-def]
                self.urls = urls
                self.sample_count = sample_count
                self.timeout_seconds = timeout_seconds
                return [
                    {
                        "url": urls[0],
                        "feed_url": urls[0],
                        "is_valid_rss": True,
                        "sample_entries": [{"title": "Update"}],
                    }
                ]

        class FakeWebsiteAdapter:
            def probe_websites(self, *, urls, sample_count, allow_browser=None):  # type: ignore[no-untyped-def]
                self.urls = urls
                self.sample_count = sample_count
                self.allow_browser = allow_browser
                raise RuntimeError("fetchers website unavailable")

        feed_adapter = FakeFeedAdapter()
        website_adapter = FakeWebsiteAdapter()
        plan = build_probe_plan(
            candidate_url="https://example.org/feed.xml",
            candidate_kind_guess="website",
            policy={"timeoutMs": 2000},
        )

        report = execute_probe_plan(
            plan["payload"],
            feed_probe_adapter=feed_adapter,
            website_probe_adapter=website_adapter,
        )

        self.assertEqual(feed_adapter.urls, ["https://example.org/feed.xml"])
        self.assertEqual(feed_adapter.timeout_seconds, 2.0)
        self.assertFalse(website_adapter.allow_browser)
        self.assertEqual(report["artifactType"], "ProbeReport")
        self.assertTrue(report["validation"]["schemaValid"], report["validation"])
        self.assertEqual(report["payload"]["accessPattern"], "public")
        self.assertEqual(report["payload"]["technicalObservability"]["providerFailureCount"], 1)
        self.assertTrue(report["payload"]["technicalObservability"]["feedValid"])
        self.assertTrue(report["payload"]["technicalObservability"]["productiveFeed"])
        self.assertEqual(report["payload"]["technicalObservability"]["feedSampleEntryCount"], 1)
        self.assertTrue(
            report["payload"]["negativeEvidencePolicy"]["providerFailuresDoNotPunishSource"]
        )

    def test_parseable_empty_feed_is_not_productive_probe_evidence(self) -> None:
        class EmptyFeedAdapter:
            def probe_feeds(self, *, urls, sample_count, timeout_seconds=None):  # type: ignore[no-untyped-def]
                return [
                    {
                        "url": urls[0],
                        "feed_url": urls[0],
                        "final_url": urls[0],
                        "is_valid_rss": True,
                        "feed_title": "Updates",
                        "sample_entries": [],
                    }
                ]

        class EmptyWebsiteAdapter:
            def probe_websites(self, *, urls, sample_count, allow_browser=None):  # type: ignore[no-untyped-def]
                return []

        plan = build_probe_plan(candidate_url="https://example.org/feed.xml", candidate_kind_guess="rss")
        report = execute_probe_plan(
            plan["payload"],
            feed_probe_adapter=EmptyFeedAdapter(),
            website_probe_adapter=EmptyWebsiteAdapter(),
        )
        payload = report["payload"]

        self.assertTrue(payload["technicalObservability"]["feedValid"])
        self.assertFalse(payload["technicalObservability"]["productiveFeed"])
        self.assertEqual(payload["technicalObservability"]["feedSampleEntryCount"], 0)
        self.assertEqual(payload["observations"][0]["sampleEntryCount"], 0)
        self.assertEqual(payload["observedArtifacts"], [])

    def test_api_probe_execute_persists_plan_and_report_artifacts(self) -> None:
        calls: list[tuple[str, tuple[object, ...]]] = []

        def fake_query_one(sql, params):  # type: ignore[no-untyped-def]
            normalized = " ".join(str(sql).split()).lower()
            calls.append((normalized, params))
            if normalized.startswith("select * from discovery_policies"):
                return {"policy_name": "discovery-probe", "definition_json": {"maxBrowserRequests": 0}}
            if normalized.startswith("insert into discovery_artifacts"):
                artifact_ids = {
                    "ProbePlan": "11111111-1111-4111-8111-111111111111",
                    "ProbeReport": "22222222-2222-4222-8222-222222222222",
                }
                return {
                    "artifact_id": artifact_ids.get(params[0], "33333333-3333-4333-8333-333333333333"),
                    "artifact_type": params[0],
                    "status": params[10],
                    "payload_json": _unwrap_json_param(params[11]),
                    "validation_json": _unwrap_json_param(params[12]),
                }
            raise AssertionError(f"Unexpected SQL: {sql}")

        def fake_execute_probe_plan(probe_plan):  # type: ignore[no-untyped-def]
            return {
                "artifactType": "ProbeReport",
                "schemaVersion": "1.0",
                "status": "validated",
                "payload": {
                    "candidateUrl": probe_plan["candidateUrl"],
                    "accessPattern": "public",
                    "technicalObservability": {"observable": True, "score": 0.8},
                    "probeCost": {"requestsAttempted": 1},
                },
                "validation": {"schemaValid": True, "policyValid": True, "errors": []},
            }

        plan = build_probe_plan(candidate_url="https://example.org/feed.xml", candidate_kind_guess="rss")
        payload = discovery_vnext_api.DiscoveryVNextProbeExecutePayload(
            probePlan=plan,
            createdBy="operator",
        )

        with (
            patch.object(discovery_vnext_api, "query_one", side_effect=fake_query_one),
            patch.object(discovery_vnext_api, "execute_probe_plan", side_effect=fake_execute_probe_plan),
        ):
            result = discovery_vnext_api.execute_probe_from_payload(payload)

        self.assertEqual(result["probePlanArtifact"]["artifact_type"], "ProbePlan")
        self.assertEqual(result["probeReportArtifact"]["artifact_type"], "ProbeReport")
        self.assertEqual(len([call for call in calls if call[0].startswith("insert into discovery_artifacts")]), 2)

    def test_source_understanding_synthesis_uses_probe_evidence_without_yield_reasoning(self) -> None:
        brief = compile_discovery_brief(
            {
                "interestId": "interest-understand",
                "name": "Product changelog updates",
                "description": "Track public product changelog and release note updates.",
            }
        )
        probe_report = {
            "candidateUrl": "https://example.org/feed.xml",
            "accessPattern": "public",
            "technicalObservability": {
                "observable": True,
                "score": 0.85,
                "feedValid": True,
                "productiveFeed": True,
                "feedSampleEntryCount": 3,
                "staticWebsiteSignals": False,
            },
            "probeCost": {"requestsAttempted": 1, "browserRequestsAttempted": 0},
            "observations": [
                {
                    "kind": "feed_probe",
                    "url": "https://example.org/feed.xml",
                    "valid": True,
                    "sampleEntryCount": 3,
                }
            ],
            "providerFailures": [],
        }

        artifact = synthesize_source_understanding(
            discovery_brief=brief["payload"],
            probe_report=probe_report,
            candidate={"candidateId": "candidate-1", "candidateKindGuess": "rss"},
        )

        self.assertEqual(artifact["artifactType"], "SourceUnderstanding")
        self.assertTrue(artifact["validation"]["schemaValid"], artifact["validation"])
        payload = artifact["payload"]
        self.assertTrue(payload["yieldIndependent"])
        self.assertEqual(payload["suggestedProviderType"], "rss")
        self.assertEqual(payload["canProduceSignals"][0]["capability"], "high")
        rendered = str(payload).lower()
        self.assertNotIn("selected_count", rendered)
        self.assertNotIn("recent_yield", rendered)

    def test_source_understanding_routes_to_probation_from_strong_feed_probe(self) -> None:
        brief = compile_discovery_brief(
            {
                "interestId": "interest-route",
                "name": "Security advisory updates",
                "description": "Track public security advisory updates.",
            }
        )
        understanding = synthesize_source_understanding(
            discovery_brief=brief["payload"],
            probe_report={
                "candidateUrl": "https://example.org/feed.xml",
                "accessPattern": "public",
                "technicalObservability": {
                    "observable": True,
                    "score": 0.86,
                    "feedValid": True,
                    "productiveFeed": True,
                    "feedSampleEntryCount": 4,
                },
                "probeCost": {"requestsAttempted": 1},
                "observations": [
                    {
                        "kind": "feed_probe",
                        "valid": True,
                        "sampleEntryCount": 4,
                    }
                ],
            },
            candidate={"candidateKindGuess": "rss"},
        )["payload"]

        decision = route_source_understanding(
            understanding,
            provider_type=understanding["suggestedProviderType"],
            access_pattern=understanding["accessPattern"],
        )

        self.assertEqual(decision["decision"], "auto_register_probation")

    def test_source_scope_resolution_resolves_item_url_to_section(self) -> None:
        artifact = resolve_source_scope(
            candidate={"canonicalUrl": "https://example.org/news/2026/05/signal-title"},
            probe_report={
                "candidateUrl": "https://example.org/news/2026/05/signal-title",
                "accessPattern": "public",
                "technicalObservability": {"observable": True, "score": 0.55, "hasRecurringStructure": False},
                "probeCost": {"requestsAttempted": 1},
                "observations": [],
            },
        )

        self.assertTrue(artifact["validation"]["schemaValid"], artifact["validation"])
        self.assertEqual(artifact["payload"]["sourceScopeType"], "section")
        self.assertEqual(artifact["payload"]["resolvedSourceUrl"], "https://example.org/news")
        self.assertEqual(validate_source_scope_resolution(artifact["payload"]), [])

    def test_scope_aware_understanding_blocks_single_item_auto_register(self) -> None:
        brief = compile_discovery_brief({"name": "Public update signals", "description": "Track public updates."})
        scope = resolve_source_scope(
            candidate={"canonicalUrl": "https://example.org/file.pdf", "candidateKindGuess": "document"},
            probe_report={
                "candidateUrl": "https://example.org/file.pdf",
                "accessPattern": "public",
                "technicalObservability": {"observable": True, "score": 0.5},
                "probeCost": {"requestsAttempted": 1},
                "observations": [],
            },
        )["payload"]
        understanding = synthesize_source_understanding(
            discovery_brief=brief["payload"],
            probe_report={
                "candidateUrl": "https://example.org/file.pdf",
                "accessPattern": "public",
                "technicalObservability": {"observable": True, "score": 0.5},
                "probeCost": {"requestsAttempted": 1},
                "observations": [],
            },
            source_scope_resolution=scope,
            candidate={"candidateKindGuess": "document"},
        )["payload"]
        decision = route_source_understanding(
            understanding,
            provider_type=understanding["suggestedProviderType"],
            access_pattern=understanding["accessPattern"],
        )

        self.assertIn(understanding["sourceScopeType"], {"single_item", "document_collection"})
        self.assertEqual(decision["decision"], "adapter_backlog")

    def test_static_vendor_page_routes_to_inventory_context(self) -> None:
        brief = compile_discovery_brief(
            {
                "interestId": "interest-context",
                "name": "Public update signals",
                "description": "Track public update signals.",
            }
        )
        understanding = synthesize_source_understanding(
            discovery_brief=brief["payload"],
            probe_report={
                "candidateUrl": "https://vendor.example.org/services",
                "accessPattern": "public",
                "technicalObservability": {"observable": True, "score": 0.5, "staticWebsiteSignals": True},
                "probeCost": {"requestsAttempted": 1},
                "pageRoleHints": {"sellerOrVendorLikely": True, "staticEvergreenLikely": True},
                "observations": [
                    {
                        "kind": "website_static_probe",
                        "classification": {"pageRoleHints": {"sellerOrVendorLikely": True, "staticEvergreenLikely": True}},
                    }
                ],
            },
            candidate={"candidateKindGuess": "website"},
        )["payload"]

        decision = route_source_understanding(
            understanding,
            provider_type=understanding["suggestedProviderType"],
            access_pattern=understanding["accessPattern"],
        )

        self.assertEqual(understanding["sourceVoice"], "seller_or_vendor")
        self.assertEqual(understanding["signalProductionMode"], "unlikely")
        self.assertEqual(decision["decision"], "inventory_context")

    def test_blueprint_eval_source_role_labels_across_domains(self) -> None:
        brief = compile_discovery_brief(
            {
                "name": "Multi-domain public source discovery",
                "description": "Track public updates, listings, discussions, records and notices across several domains.",
            }
        )["payload"]
        cases = [
            (
                "seller_static_source",
                "https://agency.example.org/services",
                {"sellerOrVendorLikely": True, "staticEvergreenLikely": True},
                [{"kind": "website_static_probe"}],
                ("seller_or_vendor", "static_service_page", "unlikely", "inventory_context"),
            ),
            (
                "security_official_update",
                "https://vendor.example.org/security/advisories",
                {"officialOwnerLikely": True},
                [{"kind": "website_static_probe", "listingCountEstimate": 2}],
                ("owner_or_operator", "recurring_listing", "direct_request_or_listing", "cheap_watch"),
            ),
            (
                "public_policy_authority",
                "https://agency.example.gov/updates",
                {"publicAuthorityLikely": True},
                [{"kind": "website_static_probe", "listingCountEstimate": 1}],
                ("public_authority", "recurring_listing", "direct_request_or_listing", "cheap_watch"),
            ),
            (
                "grants_directory",
                "https://registry.example.org/directory",
                {"aggregatorOrDirectoryLikely": True, "recurringListingLikely": True},
                [{"kind": "website_static_probe", "listingCountEstimate": 6}],
                ("aggregator_or_directory", "recurring_listing", "direct_request_or_listing", "cheap_watch"),
            ),
            (
                "jobs_ugc_thread",
                "https://community.example.org/forum/jobs",
                {"communityOrUgcLikely": True},
                [{"kind": "website_static_probe", "listingCountEstimate": 1, "classification": {"artifactTypes": ["thread"]}}],
                ("community_or_ugc", "recurring_listing", "direct_request_or_listing", "cheap_watch"),
            ),
            (
                "changelog_explainer",
                "https://blog.example.org/guide/changelog",
                {"secondaryExplainerLikely": True, "staticEvergreenLikely": True},
                [{"kind": "website_static_probe"}],
                ("third_party_commentary", "evergreen_signal_candidate", "secondary_context", "inventory_context"),
            ),
        ]

        for key, url, hints, observations, expected in cases:
            with self.subTest(key=key):
                artifact = synthesize_source_understanding(
                    discovery_brief=brief,
                    candidate={"canonicalUrl": url, "candidateKindGuess": "website"},
                    probe_report={
                        "candidateUrl": url,
                        "accessPattern": "public",
                        "technicalObservability": {"observable": True, "score": 0.75, "staticWebsiteSignals": True},
                        "probeCost": {"requestsAttempted": 1},
                        "pageRoleHints": hints,
                        "observations": observations,
                    },
                )
                understanding = artifact["payload"]
                decision = route_source_understanding(
                    understanding,
                    provider_type=str(understanding.get("suggestedProviderType") or "website"),
                    access_pattern="public",
                    policy={
                        "yieldIndependent": True,
                        "cheapWatchThreshold": 0.2,
                        "autoRegisterThreshold": 0.99,
                        "providerPolicies": {"website": {"autoRegisterThreshold": 0.99, "allowProbation": True}},
                        "maxWatchRisk": 0.7,
                    },
                )
                self.assertEqual(
                    (
                        understanding["sourceVoice"],
                        understanding["artifactFreshnessKind"],
                        understanding["signalProductionMode"],
                        decision["decision"],
                    ),
                    expected,
                )

    def test_probation_handoff_refuses_invalid_rss_provider(self) -> None:
        result = discovery_vnext_api.apply_probation_handoff_from_payload(
            discovery_vnext_api.DiscoveryVNextProbationHandoffPayload(
                sourceUnderstanding={
                    "sourceUrl": "https://example.org/feed",
                    "sourceRoleDescription": "Guessed feed.",
                    "sourceVoice": "owner_or_operator",
                    "artifactFreshnessKind": "recurring_feed",
                    "signalProductionMode": "direct_event_feed",
                    "observedArtifactTypes": ["signal_candidate"],
                    "canProduceSignals": [
                        {
                            "signalDescription": "Public update",
                            "capability": "high",
                            "capabilityScore": 0.8,
                            "directness": "direct",
                            "evidenceFromProbe": ["Candidate text looked like RSS."],
                        }
                    ],
                    "artifactFit": 0.8,
                    "technicalObservability": _tech(0.8),
                    "evidenceDirectness": 0.8,
                    "sourceRoleConfidence": 0.8,
                    "risk": {"overallRisk": "low", "riskScore": 0.2},
                    "routingConfidence": 0.8,
                    "yieldIndependent": True,
                    "reasonToKeep": "Retain guessed feed.",
                    "reasonNotToAutoRegister": "Feed probe not validated.",
                    "accessPattern": "public",
                    "suggestedProviderType": "rss",
                    "probeSummary": {"validFeed": False},
                },
                routingDecision={
                    "decision": "auto_register_probation",
                    "policyVersion": "discovery-routing-vnext-1",
                    "actions": [{"actionType": "create_probation_channel", "providerType": "rss"}],
                },
                sourceInventoryId="inventory-1",
                providerType="rss",
            )
        )

        self.assertEqual(result["status"], "skipped")
        self.assertEqual(result["reason"], "rss_feed_not_validated")

    def test_probation_handoff_refuses_parseable_empty_rss_provider(self) -> None:
        result = discovery_vnext_api.apply_probation_handoff_from_payload(
            discovery_vnext_api.DiscoveryVNextProbationHandoffPayload(
                sourceUnderstanding={
                    "sourceUrl": "https://example.org/feed",
                    "sourceRoleDescription": "Guessed feed.",
                    "sourceVoice": "owner_or_operator",
                    "artifactFreshnessKind": "recurring_feed",
                    "signalProductionMode": "direct_event_feed",
                    "observedArtifactTypes": ["signal_candidate"],
                    "canProduceSignals": [
                        {
                            "signalDescription": "Public update",
                            "capability": "high",
                            "capabilityScore": 0.8,
                            "directness": "direct",
                            "evidenceFromProbe": ["Feed probe parsed metadata but returned no sample entries."],
                        }
                    ],
                    "artifactFit": 0.8,
                    "technicalObservability": _tech(0.8),
                    "evidenceDirectness": 0.8,
                    "sourceRoleConfidence": 0.8,
                    "risk": {"overallRisk": "low", "riskScore": 0.2},
                    "routingConfidence": 0.8,
                    "yieldIndependent": True,
                    "reasonToKeep": "Retain guessed feed.",
                    "reasonNotToAutoRegister": "Feed probe not productive.",
                    "accessPattern": "public",
                    "suggestedProviderType": "rss",
                    "probeSummary": {"validFeed": True, "productiveFeed": False, "feedSampleEntryCount": 0},
                },
                routingDecision={
                    "decision": "auto_register_probation",
                    "policyVersion": "discovery-routing-vnext-1",
                    "actions": [{"actionType": "create_probation_channel", "providerType": "rss"}],
                },
                sourceInventoryId="inventory-1",
                providerType="rss",
            )
        )

        self.assertEqual(result["status"], "skipped")
        self.assertEqual(result["reason"], "rss_feed_not_productive")

    def test_source_identity_key_excludes_run_interest_and_hypothesis_context(self) -> None:
        key = discovery_vnext_api.source_identity_key(
            canonical_url="https://www.example.org/updates/item?run_id=run-1&interest_id=interest-1",
            provider_type="website",
            source_understanding={"probeSummary": {"validFeed": False}},
        )

        self.assertTrue(key.startswith("website|example.org|https://example.org/updates"))
        self.assertNotIn("run-1", key)
        self.assertNotIn("interest-1", key)

    def test_source_identity_key_roots_provider_neutral_sections(self) -> None:
        website_key = discovery_vnext_api.source_identity_key(
            canonical_url="https://www.example.org/news/item-1?hypothesis_id=h1",
            provider_type="website",
            source_understanding={"probeSummary": {"validFeed": False}},
        )
        api_key = discovery_vnext_api.source_identity_key(
            canonical_url="https://api.example.org/v1/events/123?run_id=r1",
            provider_type="api",
            source_understanding={"probeSummary": {}},
        )
        rss_key = discovery_vnext_api.source_identity_key(
            canonical_url="https://www.example.org/feed.xml?utm_source=test",
            provider_type="rss",
            source_understanding={"probeSummary": {"validFeed": True, "productiveFeed": True, "feedSampleEntryCount": 2}},
        )

        self.assertEqual(website_key, "website|example.org|https://example.org/news/item-1")
        self.assertEqual(api_key, "api|api.example.org|https://api.example.org/v1/events/123")
        self.assertIn("feed.xml", rss_key)
        self.assertNotIn("utm_source", rss_key)
        self.assertNotIn("run_id", api_key)
        self.assertNotIn("hypothesis_id", website_key)

    def test_cheap_watch_handoff_requires_explicit_channel_creation(self) -> None:
        class Registrar:
            def register_sources(self, **kwargs):  # type: ignore[no-untyped-def]
                raise AssertionError("cheap_watch should not create a channel by default")

        result = discovery_vnext_api.apply_probation_handoff(
            source_understanding={
                "sourceUrl": "https://example.org/updates",
                "accessPattern": "public",
                "sourceVoice": "owner_or_operator",
                "artifactFreshnessKind": "official_update",
                "signalProductionMode": "official_update",
                "suggestedProviderType": "website",
                "probeSummary": {"validFeed": False},
            },
            routing_decision={"decision": "cheap_watch", "actions": []},
            registrar=Registrar(),
            provider_type="website",
        )

        self.assertEqual(result["status"], "skipped")
        self.assertEqual(result["reason"], "cheap_watch_channel_creation_not_enabled")

    def test_full_probe_understand_route_runs_without_pre_supplied_probe_or_understanding(self) -> None:
        calls: list[str] = []

        def fake_probe_plan(payload):  # type: ignore[no-untyped-def]
            calls.append("probe_plan")
            return {"payload": {"candidateUrl": payload.candidate_url, "candidateKindGuess": payload.candidate_kind_guess}}

        def fake_execute_probe(payload):  # type: ignore[no-untyped-def]
            calls.append("probe_execute")
            return {
                "probeReportArtifact": {
                    "payload_json": {
                        "candidateUrl": "https://example.org/updates",
                        "accessPattern": "public",
                        "technicalObservability": {"observable": True, "score": 0.75, "staticWebsiteSignals": True},
                        "probeCost": {"requestsAttempted": 1},
                        "pageRoleHints": {"officialOwnerLikely": True},
                        "observations": [{"kind": "website_static_probe", "listingCountEstimate": 2}],
                    }
                }
            }

        def fake_apply_routing(payload):  # type: ignore[no-untyped-def]
            calls.append("routing")
            return {
                "routingDecisionArtifact": {"payload_json": {"decision": "cheap_watch", "policyVersion": "test", "actions": []}},
                "sourceInventory": {"source_inventory_id": "inventory-1"},
            }

        def fake_apply_scope(payload):  # type: ignore[no-untyped-def]
            calls.append("scope")
            return {
                "sourceScopeResolutionArtifact": {
                    "artifact_id": "scope-artifact-1",
                    "payload_json": {
                        "candidateUrl": payload.probe_report["candidateUrl"],
                        "resolvedSourceUrl": payload.probe_report["candidateUrl"],
                        "sourceScopeType": "listing_page",
                        "sourceScopeConfidence": 0.82,
                        "seedItemUrl": None,
                        "monitoringEntryUrls": [payload.probe_report["candidateUrl"]],
                        "itemExtractionHints": {},
                        "resolutionEvidence": ["listing"],
                        "risk": {"overallRisk": "low"},
                    },
                }
            }

        def fake_handoff(payload):  # type: ignore[no-untyped-def]
            calls.append("handoff")
            return {"status": "skipped", "reason": "dry_run"}

        with (
            patch.object(discovery_vnext_api, "get_required_active_policy", return_value={"definition_json": {"yieldIndependent": True}}),
            patch.object(discovery_vnext_api, "preview_probe_plan", side_effect=fake_probe_plan),
            patch.object(discovery_vnext_api, "execute_probe_from_payload", side_effect=fake_execute_probe),
            patch.object(discovery_vnext_api, "apply_scope_resolution", side_effect=fake_apply_scope),
            patch.object(discovery_vnext_api, "apply_routing_decision", side_effect=fake_apply_routing),
            patch.object(discovery_vnext_api, "apply_probation_handoff_from_payload", side_effect=fake_handoff),
            patch.object(discovery_vnext_api, "_mark_candidate_status"),
        ):
            result = discovery_vnext_api.execute_full_probe_understand_route(
                run_id="run-1",
                interest_id="interest-1",
                brief_payload=compile_discovery_brief({"name": "Public updates", "description": "Track updates."})["payload"],
                candidates=[
                    {
                        "candidate_id": "candidate-1",
                        "canonical_url": "https://example.org/updates",
                        "canonical_domain": "example.org",
                        "candidate_kind_guess": "website",
                    }
                ],
                request={},
                created_by="operator",
            )

        self.assertEqual(calls, ["probe_plan", "probe_execute", "scope", "routing"])
        self.assertEqual(result["summary"]["candidateCount"], 1)
        self.assertEqual(result["summary"]["cheapWatchCount"], 1)

    def test_full_probe_selection_respects_query_quality_and_per_hypothesis_caps(self) -> None:
        candidates = [
            {
                "candidate_id": "bad-1",
                "canonical_url": "https://seller.example.org/services",
                "canonical_domain": "seller.example.org",
                "hypothesis_artifact_id": "hypothesis-a",
                "hypothesis_id": "hypothesis-1",
                "queryQuality": {"quality": "noisy"},
                "rediscovery_count": 1,
            },
            {
                "candidate_id": "good-1",
                "canonical_url": "https://authority.example.gov/updates",
                "canonical_domain": "authority.example.gov",
                "hypothesis_artifact_id": "hypothesis-a",
                "hypothesis_id": "hypothesis-1",
                "queryQuality": {"quality": "useful_for_source_acquisition"},
                "rediscovery_count": 1,
            },
            {
                "candidate_id": "good-2",
                "canonical_url": "https://authority.example.gov/news",
                "canonical_domain": "authority.example.gov",
                "hypothesis_artifact_id": "hypothesis-a",
                "hypothesis_id": "hypothesis-1",
                "queryQuality": {"quality": "useful_for_source_acquisition"},
                "rediscovery_count": 1,
            },
            {
                "candidate_id": "other-1",
                "canonical_url": "https://registry.example.org/directory",
                "canonical_domain": "registry.example.org",
                "hypothesis_artifact_id": "hypothesis-b",
                "hypothesis_id": "hypothesis-2",
                "queryQuality": {"quality": "useful_for_query_expansion"},
                "rediscovery_count": 2,
            },
        ]

        selected = discovery_vnext_api.select_candidates_for_probe(
            candidates,
            request={
                "maxProbeCandidatesPerRun": 3,
                "maxProbeCandidatesPerDomain": 2,
                "maxProbeCandidatesPerHypothesis": 1,
            },
        )

        self.assertEqual([candidate["candidate_id"] for candidate in selected], ["good-1", "other-1"])

    def test_api_probation_handoff_uses_registrar_and_marks_inventory_channel(self) -> None:
        class FakeRegistrar:
            def __init__(self) -> None:
                self.calls: list[dict[str, object]] = []

            def register_sources(self, **kwargs):  # type: ignore[no-untyped-def]
                self.calls.append(kwargs)
                return [
                    {
                        "channel_id": "channel-1",
                        "url": kwargs["sources"][0]["url"],
                        "provider_type": kwargs["provider_type"],
                        "status": "registered",
                    }
                ]

        registrar = FakeRegistrar()

        def fake_registrar_factory():  # type: ignore[no-untyped-def]
            return registrar

        def fake_query_one(sql, params):  # type: ignore[no-untyped-def]
            normalized = " ".join(str(sql).split()).lower()
            self.assertTrue(normalized.startswith("update source_inventory"))
            return {
                "source_inventory_id": params[2],
                "registered_channel_id": params[0],
                "current_state": params[1],
            }

        payload = discovery_vnext_api.DiscoveryVNextProbationHandoffPayload(
            sourceInventoryId="inventory-1",
            providerType="rss",
            createdBy="operator",
            sourceUnderstanding={
                "sourceUrl": "https://example.org/feed.xml",
                "sourceRoleDescription": "Publishes recurring public feed artifacts.",
                "sourceVoice": "owner_or_operator",
                "artifactProducingBehavior": "valid feed entries",
                "artifactFreshnessKind": "recurring_feed",
                "signalProductionMode": "direct_event_feed",
                "observedArtifactTypes": ["signal_candidate"],
                "canProduceSignals": [
                    {
                        "signalDescription": "Public update",
                        "capability": "high",
                        "capabilityScore": 0.86,
                        "directness": "direct",
                        "evidenceFromProbe": ["Fetchers feed probe observed a valid recurring feed."],
                    }
                ],
                "artifactFit": 0.85,
                "technicalObservability": _tech(0.85),
                "evidenceDirectness": 0.8,
                "sourceRoleConfidence": 0.8,
                "risk": {"overallRisk": "low", "riskScore": 0.2},
                "routingConfidence": 0.9,
                "yieldIndependent": True,
                "reasonToKeep": "Retain recurring feed.",
                "reasonNotToAutoRegister": "No blocker.",
                "accessPattern": "public",
                "suggestedProviderType": "rss",
                "probeSummary": {
                    "validFeed": True,
                    "productiveFeed": True,
                    "feedSampleEntryCount": 2,
                    "feedFinalUrl": "https://feeds.example.org/updates.xml",
                },
            },
            routingDecision={
                "decision": "auto_register_probation",
                "policyVersion": "discovery-routing-vnext-1",
                "actions": [
                    {"actionType": "store_in_inventory"},
                    {"actionType": "create_probation_channel", "providerType": "rss"},
                ],
            },
        )

        with (
            patch.object(discovery_vnext_api, "PostgresSourceRegistrarAdapter", side_effect=fake_registrar_factory),
            patch.object(discovery_vnext_api, "query_one", side_effect=fake_query_one),
        ):
            result = discovery_vnext_api.apply_probation_handoff_from_payload(payload)

        self.assertEqual(result["status"], "applied")
        self.assertEqual(result["sourceInventory"]["registered_channel_id"], "channel-1")
        self.assertEqual(registrar.calls[0]["provider_type"], "rss")
        self.assertEqual(registrar.calls[0]["sources"][0]["url"], "https://feeds.example.org/updates.xml")
        self.assertEqual(registrar.calls[0]["sources"][0]["feed_url"], "https://feeds.example.org/updates.xml")
        self.assertTrue(registrar.calls[0]["enabled"])
        self.assertFalse(registrar.calls[0]["dry_run"])

    def test_api_probation_handoff_registers_cheap_watch_decisions(self) -> None:
        class FakeRegistrar:
            def __init__(self) -> None:
                self.calls: list[dict[str, object]] = []

            def register_sources(self, **kwargs):  # type: ignore[no-untyped-def]
                self.calls.append(kwargs)
                source = kwargs["sources"][0]
                return [
                    {
                        "channel_id": "channel-watch-1",
                        "url": source["url"],
                        "provider_type": kwargs["provider_type"],
                        "status": "registered",
                    }
                ]

        registrar = FakeRegistrar()

        payload = discovery_vnext_api.DiscoveryVNextProbationHandoffPayload(
            sourceUnderstanding={
                "sourceUrl": "https://example.org/watch",
                "sourceRoleDescription": "Publishes low-cost watchable updates.",
                "sourceVoice": "public_authority",
                "artifactFreshnessKind": "official_update",
                "signalProductionMode": "official_update",
                "observedArtifactTypes": ["signal_candidate"],
                "canProduceSignals": [
                    {
                        "signalDescription": "Public update",
                        "capability": "medium",
                        "capabilityScore": 0.6,
                        "directness": "direct",
                        "evidenceFromProbe": ["Probe observed official update page."],
                    }
                ],
                "artifactFit": 0.7,
                "technicalObservability": _tech(0.7),
                "evidenceDirectness": 0.7,
                "sourceRoleConfidence": 0.7,
                "risk": {"overallRisk": "low", "riskScore": 0.2},
                "routingConfidence": 0.75,
                "accessPattern": "public",
                "suggestedProviderType": "website",
                "probeSummary": {"pageRoleHints": {"officialOwnerLikely": True}},
                "yieldIndependent": True,
                "reasonToKeep": "Retain official update page.",
                "reasonNotToAutoRegister": "Watch only.",
            },
            routingDecision={
                "decision": "cheap_watch",
                "policyVersion": "discovery-routing-vnext-1",
                "actions": [{"actionType": "create_cheap_watch_channel"}],
                "allowChannelCreation": True,
            },
            sourceInventoryId="inventory-1",
        )

        with (
            patch.object(discovery_vnext_api, "PostgresSourceRegistrarAdapter", return_value=registrar),
            patch.object(
                discovery_vnext_api,
                "query_one",
                return_value={
                    "source_inventory_id": "inventory-1",
                    "registered_channel_id": "channel-watch-1",
                    "current_state": "cheap_watch",
                },
            ),
        ):
            result = discovery_vnext_api.apply_probation_handoff_from_payload(payload)

        self.assertEqual(result["status"], "applied")
        self.assertEqual(registrar.calls[0]["tags"], ["discovery-vnext", "cheap_watch", "website"])
        self.assertEqual(
            registrar.calls[0]["sources"][0]["discovery"]["trustStage"],
            "cheap_watch",
        )

    def test_api_probation_handoff_skips_non_registerable_decisions(self) -> None:
        payload = discovery_vnext_api.DiscoveryVNextProbationHandoffPayload(
            sourceUnderstanding={"sourceUrl": "https://example.org"},
            routingDecision={"decision": "inventory"},
            sourceInventoryId="inventory-1",
        )

        with patch.object(discovery_vnext_api, "query_one") as query_one_mock:
            result = discovery_vnext_api.apply_probation_handoff_from_payload(payload)

        self.assertEqual(result["status"], "skipped")
        query_one_mock.assert_not_called()

    def test_api_source_inventory_confirm_scope_returns_readable_confirmation(self) -> None:
        payload = discovery_vnext_api.DiscoveryVNextSourceInventoryActionPayload(
            sourceInventoryId="inventory-1",
            action="confirm_scope",
            reason="operator verified source scope",
            createdBy="unit-test",
        )

        def fake_query_one(sql, params):  # type: ignore[no-untyped-def]
            normalized = " ".join(str(sql).split()).lower()
            if normalized.startswith("update source_inventory"):
                self.assertEqual(params[0], "confirmed")
                return {
                    "source_inventory_id": "inventory-1",
                    "scope_confirmation_json": {
                        "scopeStatus": "confirmed",
                        "reason": "operator verified source scope",
                        "createdBy": "unit-test",
                    },
                    "current_state": "inventory",
                }
            raise AssertionError(f"Unexpected SQL: {sql}")

        with (
            patch.object(discovery_vnext_api, "query_one", side_effect=fake_query_one),
            patch.object(
                discovery_vnext_api,
                "create_source_observation",
                return_value={
                    "source_inventory_id": "inventory-1",
                    "observation_kind": "scope_resolution",
                },
            ),
        ):
            result = discovery_vnext_api.apply_source_inventory_action(payload)

        self.assertFalse(result["destructiveConfirmationRequired"])
        self.assertEqual(
            result["sourceInventory"]["scope_confirmation_json"]["scopeStatus"],
            "confirmed",
        )

    def test_mega_loop_preview_generates_valid_diverse_hypothesis_batches(self) -> None:
        brief = compile_discovery_brief(
            {
                "interestId": "interest-ml",
                "name": "Local record updates",
                "description": "Track public municipal records and public notice updates.",
            }
        )

        preview = run_mega_loop_preview(brief["payload"], max_batches=4, locale="pl-PL")

        self.assertEqual(preview["artifactType"], "HypothesisMegaLoopPreview")
        self.assertEqual(preview["status"], "completed_with_coverage_gap")
        self.assertEqual(preview["limits"]["actualBatches"], 4)
        self.assertGreaterEqual(len(preview["comparison"]["lensCoverage"]), 4)
        self.assertTrue(preview["comparison"]["missingLenses"])
        for batch in preview["batches"]:
            self.assertEqual(batch["artifactType"], "HypothesisBatch")
            self.assertTrue(batch["validation"]["schemaValid"], batch["validation"])
            self.assertEqual(batch["status"], "validated")
            for hypothesis in batch["payload"]["hypotheses"]:
                self.assertIn("expectedSourceScopeTypes", hypothesis)
                self.assertIn("badIfScopeIs", hypothesis)
                self.assertTrue(hypothesis["expectedSignalLinks"])

    def test_mega_loop_fails_closed_when_brief_has_no_desired_signals(self) -> None:
        preview = run_mega_loop_preview(
            {
                "interestId": "interest-empty",
                "goal": "Track public updates.",
                "desiredSignals": [],
                "negativeSignals": [{"description": "noise"}],
                "artifactExpectations": ["listing"],
                "freshnessNeed": "normal",
                "constraints": {"publicOnly": True},
            },
            max_batches=3,
        )

        self.assertEqual(preview["status"], "failed")
        self.assertEqual(preview["error"]["code"], "brief_missing_desired_signals")
        self.assertEqual(preview["batches"], [])

    def test_brief_preview_payload_accepts_camel_case_cue_fields(self) -> None:
        payload = discovery_vnext_api.DiscoveryVNextBriefPreviewPayload.model_validate(
            {
                "name": "Portable source monitoring",
                "positiveTexts": "official update\nstable item URL",
                "negativeTexts": ["wrapper only"],
                "candidatePositiveSignals": ["item_evidence: date, status"],
                "candidateNegativeSignals": "context_only: explainer",
            }
        )

        self.assertEqual(payload.positive_texts, ["official update", "stable item URL"])
        self.assertEqual(payload.negative_texts, ["wrapper only"])
        self.assertEqual(payload.candidate_positive_signals, ["item_evidence: date, status"])
        self.assertEqual(payload.candidate_negative_signals, ["context_only: explainer"])

    def test_live_runtime_budget_errors_are_coded_and_effective_budget_merges_request(self) -> None:
        runtime_policy = {"requireDiscoveryEnabled": False, "requireRunBudget": True}
        budget = discovery_vnext_api._effective_run_budget(
            runtime_policy=runtime_policy,
            request={"budget": {"maxRunCostCents": 10}},
            budget={"maxRunCostCents": 50},
            live_provider_execution=True,
        )

        self.assertEqual(budget["maxRunCostCents"], 50)
        self.assertTrue(budget["liveProviderExecution"])

        with self.assertRaises(Exception) as context:
            discovery_vnext_api._assert_live_runtime_allowed(
                runtime_policy,
                {},
                provider="stub",
            )
        self.assertEqual(context.exception.detail["code"], "budget_missing")

    def test_mega_loop_default_covers_all_universal_lenses(self) -> None:
        brief = compile_discovery_brief(
            {
                "interestId": "interest-ml-full",
                "name": "Universal public signals",
                "description": "Track public updates, records, discussions, datasets and listings.",
            }
        )

        preview = run_mega_loop_preview(brief["payload"], max_batches=11)

        self.assertEqual(preview["status"], "completed")
        self.assertEqual(len(preview["coveragePolicy"]["requiredLensCoverage"]), 11)
        self.assertEqual(preview["comparison"]["missingLenses"], [])

    def test_hypothesis_comparator_marks_duplicate_source_roles(self) -> None:
        hypothesis = {
            "hypothesisId": "h1",
            "sourceRoleDescription": "Official source with public records.",
            "expectedArtifacts": ["document", "listing"],
            "expectedSignalLinks": [{"signalId": "s1", "capabilityReason": "direct"}],
            "queryFamilies": [{"familyId": "q1", "intent": "find records", "queries": ["records"]}],
        }

        comparison = compare_hypothesis_batches(
            [
                {"memoryMode": "blind", "lens": "official_owners", "hypotheses": [hypothesis]},
                {
                    "memoryMode": "thin",
                    "lens": "documents_and_reports",
                    "hypotheses": [{**hypothesis, "hypothesisId": "h2"}],
                },
            ]
        )

        self.assertEqual(comparison["uniqueHypothesisCount"], 1)
        self.assertEqual(comparison["rediscoveryCount"], 1)
        self.assertEqual(comparison["duplicates"][0]["duplicateOf"], "h1")

    def test_candidate_rows_normalize_dedupe_and_report_query_quality(self) -> None:
        rows = build_candidate_rows(
            run_id="run-1",
            interest_id="interest-1",
            hypothesis_id="hypothesis-1",
            query_attempt_id="query-1",
            results=[
                {"url": "HTTPS://WWW.Example.org/Updates/#section", "title": "Updates"},
                {"url": "https://www.example.org/Updates/", "title": "Duplicate"},
                {"url": "mailto:noise@example.org", "title": "Noise"},
                {"url": "https://data.example.org/feed.xml", "title": "RSS feed"},
            ],
        )
        report = query_quality_report(
            query="public records updates",
            query_family_intent="Find public source updates.",
            candidates=rows,
            raw_result_count=4,
        )

        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["canonicalUrl"], "https://www.example.org/Updates")
        self.assertEqual(rows[0]["canonicalDomain"], "example.org")
        self.assertEqual(rows[0]["rediscoveryCount"], 2)
        self.assertEqual(rows[0]["acquisitionEvidence"]["paths"][0]["provider"], "fixture")
        self.assertEqual(rows[1]["candidateKindGuess"], "rss")
        self.assertEqual(report["observedResultMix"]["duplicates"], 1)
        self.assertIn("official_or_owner_sources", report["observedResultMix"])
        self.assertEqual(report["queryPurpose"], "find_direct_sources")
        self.assertEqual(report["quality"], "useful_for_source_acquisition")

    def test_candidate_rows_preserve_live_provider_evidence(self) -> None:
        rows = build_candidate_rows(
            run_id="run-1",
            interest_id="interest-1",
            hypothesis_id="hypothesis-1",
            query_attempt_id="query-1",
            results=[
                {
                    "url": "https://example.org/tender",
                    "title": "Tender notice",
                    "provider": "ddgs",
                }
            ],
        )

        self.assertEqual(rows[0]["acquisitionEvidence"]["paths"][0]["provider"], "ddgs")

    def test_api_normalize_candidates_returns_quality_report_without_persistence(self) -> None:
        with patch.object(
            discovery_vnext_api,
            "get_required_active_policy",
            return_value={"policy_name": "discovery-runtime", "definition_json": {"maxQueryAttemptsPerRun": 20}},
        ):
            result = discovery_vnext_api.normalize_candidates(
                discovery_vnext_api.DiscoveryVNextCandidateNormalizePayload(
                    hypothesisId="hypothesis-1",
                    queryAttemptId="query-1",
                    query="policy updates",
                    queryFamilyIntent="Find public policy source updates.",
                    results=[
                        {"url": "https://example.org/news", "title": "News"},
                        {"url": "/relative", "title": "Invalid"},
                    ],
                )
            )

        self.assertEqual(len(result["candidates"]), 1)
        self.assertEqual(result["queryQualityReport"]["quality"], "useful_for_source_acquisition")

    def test_live_acquisition_ranking_filters_ads_and_requires_interest_cues(self) -> None:
        ranked = discovery_vnext_api._rank_search_results(
            [
                {
                    "url": "https://www.bing.com/aclick?ld=ad",
                    "title": "Proposal management ad",
                    "snippet": "Sponsored proposal software.",
                },
                {
                    "url": "https://noise.example.org/",
                    "title": "Unrelated landing page",
                    "snippet": "Generic services page.",
                },
                {
                    "url": "https://sam.gov/opp/example",
                    "title": "Procurement notice for software implementation",
                    "snippet": "Public tender deadline and contract scope.",
                },
            ],
            interest={"positive_texts": ["public tender software implementation"]},
            query_text='"public tender software implementation" official',
        )

        self.assertEqual([item["url"] for item in ranked], ["https://sam.gov/opp/example"])

    def test_api_create_candidates_persists_query_quality_artifact_and_rows(self) -> None:
        calls: list[tuple[str, tuple[object, ...]]] = []

        def fake_query_one(sql, params):  # type: ignore[no-untyped-def]
            normalized = " ".join(str(sql).split()).lower()
            calls.append((normalized, params))
            if normalized.startswith("select * from discovery_policies"):
                return {"policy_name": "discovery-runtime", "definition_json": {"maxQueryAttemptsPerRun": 20}}
            if normalized.startswith("insert into discovery_artifacts"):
                return {
                    "artifact_id": "quality-artifact",
                    "artifact_type": params[0],
                    "status": params[10],
                    "payload_json": _unwrap_json_param(params[11]),
                    "validation_json": _unwrap_json_param(params[12]),
                }
            if normalized.startswith("insert into discovery_candidates"):
                return {
                    "candidate_id": "candidate-1",
                    "canonical_url": params[8],
                    "canonical_domain": params[9],
                    "query_quality_artifact_id": params[7],
                    "rediscovery_count": params[12],
                }
            raise AssertionError(f"Unexpected SQL: {sql}")

        payload = discovery_vnext_api.DiscoveryVNextCandidateCreatePayload(
            runId=None,
            interestId="interest-1",
            hypothesisId="hypothesis-1",
            hypothesisArtifactId=None,
            queryAttemptId="query-1",
            query="public updates",
            queryFamilyIntent="Find public source updates.",
            results=[{"url": "https://example.org/feed.xml", "title": "Feed"}],
            createdBy="operator",
        )

        with patch.object(discovery_vnext_api, "query_one", side_effect=fake_query_one):
            result = discovery_vnext_api.create_candidates_from_payload(payload)

        self.assertEqual(result["queryQualityReportArtifact"]["artifact_type"], "QueryQualityReport")
        self.assertEqual(result["candidates"][0]["query_quality_artifact_id"], "quality-artifact")
        self.assertEqual(len([call for call in calls if call[0].startswith("insert into")]), 2)

    def test_api_list_vnext_records_builds_bounded_filters(self) -> None:
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
            patch.object(discovery_vnext_api, "query_count", side_effect=fake_query_count),
            patch.object(discovery_vnext_api, "query_all", side_effect=fake_query_all),
        ):
            result = discovery_vnext_api.list_vnext_records(
                "artifacts",
                page=2,
                page_size=10,
                status="validated",
                artifact_type="DiscoveryBrief",
                interest_id="interest-1",
            )

        self.assertEqual(result["items"], [])
        self.assertIn("artifact_type = %s", str(seen["count_sql"]))
        self.assertEqual(
            seen["count_params"],
            ("validated", "DiscoveryBrief", "interest-1"),
        )
        self.assertEqual(
            seen["list_params"],
            ("validated", "DiscoveryBrief", "interest-1", 10, 10),
        )

    def test_api_create_artifact_persists_validation_json(self) -> None:
        seen: dict[str, object] = {}

        def fake_query_one(sql, params):  # type: ignore[no-untyped-def]
            seen["sql"] = sql
            seen["params"] = params
            return {
                "artifact_id": "artifact-1",
                "artifact_type": params[0],
                "status": params[10],
                "payload_json": _unwrap_json_param(params[11]),
                "validation_json": _unwrap_json_param(params[12]),
            }

        payload = discovery_vnext_api.DiscoveryVNextArtifactCreatePayload(
            artifactType="DiscoveryBrief",
            payload={
                "goal": "Detect public observable signals.",
                "desiredSignals": [
                    {
                        "description": "Relevant public artifact",
                        "directness": "direct",
                        "expectedEvidencePatterns": ["official announcement"],
                    }
                ],
                "negativeSignals": [{"description": "noise"}],
                "artifactExpectations": ["signal_candidate"],
                "freshnessNeed": "normal",
                "constraints": {"publicOnly": True},
            },
            createdBy="operator",
        )

        with patch.object(discovery_vnext_api, "query_one", side_effect=fake_query_one):
            row = discovery_vnext_api.create_artifact_from_payload(payload)

        self.assertEqual(row["status"], "validated")
        self.assertTrue(row["validation_json"]["schemaValid"])
        self.assertIn("insert into discovery_artifacts", " ".join(str(seen["sql"]).split()).lower())

    def test_api_create_artifact_persists_lineage_and_artifact_metadata(self) -> None:
        parent_id = "11111111-1111-4111-8111-111111111111"
        seen: dict[str, object] = {}

        def fake_query_one(sql, params):  # type: ignore[no-untyped-def]
            seen["params"] = params
            return {
                "artifact_id": "artifact-2",
                "artifact_type": params[0],
                "parent_artifact_ids": params[5],
                "memory_mode": params[7],
                "lens": params[8],
                "policy_version": params[9],
                "status": params[10],
                "payload_json": _unwrap_json_param(params[11]),
                "validation_json": _unwrap_json_param(params[12]),
            }

        payload = discovery_vnext_api.DiscoveryVNextArtifactCreatePayload(
            artifactType="HypothesisBatch",
            payload={
                "batchId": "batch-1",
                "memoryMode": "thin",
                "lens": "official_owners",
                "hypotheses": [
                    {
                        "sourceRoleDescription": "Official owners",
                        "expectedSignalLinks": [{"signalId": "sig-1"}],
                        "queryFamilies": [{"queries": ["official updates"]}],
                    }
                ],
            },
            parentArtifactIds=[parent_id],
            memoryMode="thin",
            lens="official_owners",
            policyVersion="discovery-mega-loop-vnext-1",
            createdBy="operator",
        )

        with (
            patch.object(discovery_vnext_api, "query_count", return_value=1),
            patch.object(discovery_vnext_api, "query_one", side_effect=fake_query_one),
        ):
            row = discovery_vnext_api.create_artifact_from_payload(payload)

        self.assertEqual(row["parent_artifact_ids"], [parent_id])
        self.assertEqual(row["memory_mode"], "thin")
        self.assertEqual(row["lens"], "official_owners")
        self.assertEqual(row["policy_version"], "discovery-mega-loop-vnext-1")

    def test_mark_useful_feedback_requires_classification_usefulness_semantics(self) -> None:
        with self.assertRaises(Exception) as error:
            discovery_vnext_api.submit_feedback(
                discovery_vnext_api.DiscoveryVNextFeedbackPayload(
                    targetType="candidate",
                    targetId="candidate-1",
                    feedbackType="mark_useful",
                    feedback={"note": "smoke reached this step"},
                )
            )

        self.assertIn("classification/usefulness", str(error.exception))

    def test_api_apply_routing_decision_writes_artifacts_and_inventory(self) -> None:
        inserts: list[tuple[str, tuple[object, ...]]] = []

        def fake_query_one(sql, params):  # type: ignore[no-untyped-def]
            normalized = " ".join(str(sql).split()).lower()
            if normalized.startswith("select * from discovery_policies"):
                return {
                    "policy_name": "discovery-routing",
                    "definition_json": {"yieldIndependent": True},
                }
            inserts.append((normalized, params))
            if normalized.startswith("insert into discovery_artifacts"):
                artifact_type = params[0]
                artifact_ids = {
                    "SourceUnderstanding": "11111111-1111-4111-8111-111111111111",
                    "RoutingDecision": "22222222-2222-4222-8222-222222222222",
                }
                return {
                    "artifact_id": artifact_ids.get(artifact_type, "33333333-3333-4333-8333-333333333333"),
                    "artifact_type": artifact_type,
                    "status": params[10],
                    "payload_json": _unwrap_json_param(params[11]),
                    "validation_json": _unwrap_json_param(params[12]),
                }
            if normalized.startswith("insert into source_inventory"):
                return {
                    "source_inventory_id": "inventory-1",
                    "source_identity_key": params[2],
                    "current_state": params[3],
                    "latest_source_understanding_artifact_id": params[5],
                    "latest_routing_decision_artifact_id": params[6],
                }
            if normalized.startswith("insert into source_monitoring_state"):
                return {"source_inventory_id": params[0], "monitoring_mode": params[1]}
            if normalized.startswith("insert into source_observations"):
                return {"source_inventory_id": params[0], "observation_kind": params[1]}
            if normalized.startswith("select * from source_inventory"):
                return {
                    "source_inventory_id": "inventory-1",
                    "current_state": "probation_channel",
                    "registered_channel_id": None,
                    "tags": ["discovery-vnext"],
                }
            if normalized.startswith("insert into discovery_rollback_groups"):
                return {"rollback_group_id": "rollback-1", "source_inventory_id": params[0], "status": "prepared"}
            if normalized.startswith("insert into discovery_rollback_actions"):
                return {"rollback_action_id": "action-1", "rollback_group_id": params[0]}
            raise AssertionError(f"Unexpected SQL: {sql}")

        payload = discovery_vnext_api.DiscoveryVNextRoutingApplyPayload(
            canonicalUrl="https://example.org/feed.xml",
            canonicalDomain="example.org",
            sourceIdentityKey="example.org:rss",
            providerType="rss",
            accessPattern="public",
            sourceUnderstanding={
                "sourceUrl": "https://example.org/feed.xml",
                "sourceScopeType": "feed",
                "sourceRoleDescription": "Publishes recurring feed items.",
                "sourceVoice": "owner_or_operator",
                "artifactFreshnessKind": "recurring_feed",
                "signalProductionMode": "direct_event_feed",
                "observedArtifactTypes": ["signal_candidate"],
                "canProduceSignals": [
                    {
                        "signalDescription": "Public update",
                        "capability": "high",
                        "capabilityScore": 0.9,
                        "directness": "direct",
                        "evidenceFromProbe": ["Probe observed valid feed entries."],
                    }
                ],
                "artifactFit": 0.9,
                "technicalObservability": _tech(0.85),
                "evidenceDirectness": 0.8,
                "sourceRoleConfidence": 0.8,
                "risk": {"overallRisk": "low", "riskScore": 0.15},
                "routingConfidence": 0.9,
                "yieldIndependent": True,
                "reasonToKeep": "Retain recurring feed.",
                "reasonNotToAutoRegister": "No blocker.",
                "accessPattern": "public",
                "suggestedProviderType": "rss",
                "probeSummary": {"validFeed": True, "productiveFeed": True, "feedSampleEntryCount": 2},
            },
            createdBy="operator",
        )

        with patch.object(discovery_vnext_api, "query_one", side_effect=fake_query_one):
            result = discovery_vnext_api.apply_routing_decision(payload)

        self.assertEqual(result["routingDecisionArtifact"]["payload_json"]["decision"], "auto_register_probation")
        self.assertEqual(result["sourceInventory"]["current_state"], "probation_channel")
        self.assertEqual(result["monitoringState"]["monitoring_mode"], "probation")
        self.assertEqual(result["rollback"]["rollbackGroup"]["rollback_group_id"], "rollback-1")

    def test_api_apply_routing_decision_creates_adapter_backlog_for_auth_required_source(self) -> None:
        def fake_query_one(sql, params):  # type: ignore[no-untyped-def]
            normalized = " ".join(str(sql).split()).lower()
            if normalized.startswith("select * from discovery_policies"):
                return {
                    "policy_name": "discovery-routing",
                    "definition_json": {"yieldIndependent": True},
                }
            if normalized.startswith("insert into discovery_artifacts"):
                artifact_ids = {
                    "SourceUnderstanding": "11111111-1111-4111-8111-111111111111",
                    "RoutingDecision": "22222222-2222-4222-8222-222222222222",
                }
                return {
                    "artifact_id": artifact_ids.get(params[0], "33333333-3333-4333-8333-333333333333"),
                    "artifact_type": params[0],
                    "status": params[10],
                    "payload_json": _unwrap_json_param(params[11]),
                    "validation_json": _unwrap_json_param(params[12]),
                }
            if normalized.startswith("insert into source_inventory"):
                return {"source_inventory_id": "inventory-2", "current_state": params[3]}
            if normalized.startswith("insert into source_monitoring_state"):
                return {"source_inventory_id": params[0], "monitoring_mode": params[1]}
            if normalized.startswith("insert into source_observations"):
                return {"source_inventory_id": params[0], "observation_kind": params[1]}
            if normalized.startswith("insert into adapter_backlog"):
                return {
                    "adapter_backlog_id": "backlog-1",
                    "source_inventory_id": params[0],
                    "adapter_need": params[2],
                    "reason_json": _unwrap_json_param(params[3]),
                }
            if normalized.startswith("select * from source_inventory"):
                return {
                    "source_inventory_id": "inventory-2",
                    "current_state": "adapter_backlog",
                    "registered_channel_id": None,
                    "tags": ["discovery-vnext"],
                }
            if normalized.startswith("insert into discovery_rollback_groups"):
                return {"rollback_group_id": "rollback-2", "source_inventory_id": params[0], "status": "prepared"}
            if normalized.startswith("insert into discovery_rollback_actions"):
                return {"rollback_action_id": "action-2", "rollback_group_id": params[0]}
            raise AssertionError(f"Unexpected SQL: {sql}")

        payload = discovery_vnext_api.DiscoveryVNextRoutingApplyPayload(
            canonicalUrl="https://example.org/private",
            canonicalDomain="example.org",
            sourceIdentityKey="example.org:private",
            providerType="website",
            accessPattern="requires_auth",
            sourceUnderstanding={
                "sourceUrl": "https://example.org/private",
                "sourceRoleDescription": "Potential restricted source.",
                "sourceVoice": "owner_or_operator",
                "artifactFreshnessKind": "official_update",
                "signalProductionMode": "official_update",
                "observedArtifactTypes": ["signal_candidate"],
                "canProduceSignals": [
                    {
                        "signalDescription": "Public update",
                        "capability": "high",
                        "capabilityScore": 0.9,
                        "directness": "direct",
                        "evidenceFromProbe": ["Probe observed login boundary."],
                    }
                ],
                "artifactFit": 0.8,
                "technicalObservability": _tech(0.7),
                "evidenceDirectness": 0.7,
                "sourceRoleConfidence": 0.7,
                "risk": {"overallRisk": "low", "riskScore": 0.2},
                "routingConfidence": 0.8,
                "yieldIndependent": True,
                "reasonToKeep": "Retain pending adapter review.",
                "reasonNotToAutoRegister": "Requires auth.",
                "accessPattern": "requires_auth",
                "suggestedProviderType": "website",
                "probeSummary": {},
            },
            createdBy="operator",
        )

        with patch.object(discovery_vnext_api, "query_one", side_effect=fake_query_one):
            result = discovery_vnext_api.apply_routing_decision(payload)

        self.assertEqual(result["sourceInventory"]["current_state"], "adapter_backlog")
        self.assertEqual(result["adapterBacklogItem"]["adapter_need"], "auth_config")
