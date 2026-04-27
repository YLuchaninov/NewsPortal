import sys
import types
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch


def _install_content_analysis_import_stubs() -> None:
    if "psycopg" not in sys.modules:
        psycopg_stub = types.ModuleType("psycopg")

        class _Connection:
            def __class_getitem__(cls, _item):
                return cls

        psycopg_stub.Connection = _Connection
        psycopg_stub.connect = lambda *args, **kwargs: None
        sys.modules["psycopg"] = psycopg_stub

    if "psycopg.rows" not in sys.modules:
        psycopg_rows_stub = types.ModuleType("psycopg.rows")
        psycopg_rows_stub.dict_row = object()
        sys.modules["psycopg.rows"] = psycopg_rows_stub

    if "psycopg.types" not in sys.modules:
        sys.modules["psycopg.types"] = types.ModuleType("psycopg.types")

    if "psycopg.types.json" not in sys.modules:
        psycopg_json_stub = types.ModuleType("psycopg.types.json")

        class _Json:
            def __init__(self, value):
                self.value = value

        psycopg_json_stub.Json = _Json
        sys.modules["psycopg.types.json"] = psycopg_json_stub


_install_content_analysis_import_stubs()

from services.workers.app.content_analysis import (  # noqa: E402
    ContentSubject,
    RuntimeAnalysisPolicy,
    _policy_supports_local_runtime,
    analyze_categories,
    analyze_sentiment,
    build_structured_extraction_hints,
    evaluate_content_filter_policy,
    extract_heuristic_entities,
    validate_structured_extraction_output,
)
from services.workers.app.content_analysis_structured import (  # noqa: E402
    structured_label_projection_allowed,
)


class ContentAnalysisTests(unittest.TestCase):
    def _make_subject(self, *, published_at: datetime | None) -> ContentSubject:
        now = datetime.now(timezone.utc)
        return ContentSubject(
            subject_type="article",
            subject_id="doc-1",
            title="Apple Inc announces Warsaw expansion",
            lead="Tim Cook met European Union officials.",
            body="The project was published for partner review.",
            language="en",
            source_channel_id="channel-1",
            canonical_document_id="canonical-1",
            dates={
                "published_at": published_at,
                "source_lastmod_at": None,
                "discovered_at": now,
                "ingested_at": now,
                "updated_at": now,
            },
        )

    def test_heuristic_entities_extracts_org_gpe_person_and_date(self) -> None:
        entities = extract_heuristic_entities(
            "Apple Inc opened an office in Warsaw. Tim Cook met the European Union on 2026-04-20."
        )

        by_text = {entity["text"]: entity for entity in entities}
        self.assertEqual(by_text["Apple Inc"]["type"], "ORG")
        self.assertEqual(by_text["Warsaw"]["type"], "GPE")
        self.assertEqual(by_text["Tim Cook"]["type"], "PERSON")
        self.assertEqual(by_text["European Union"]["type"], "GPE")
        self.assertEqual(by_text["2026-04-20"]["type"], "DATE")
        self.assertGreater(by_text["Apple Inc"]["confidence"], 0.0)

    def test_heuristic_entities_respects_policy_entity_type_allowlist(self) -> None:
        entities = extract_heuristic_entities(
            "Apple Inc opened an office in Warsaw. Tim Cook met the European Union on 2026-04-20.",
            config={"entityTypeAllowlist": ["GPE"]},
        )

        self.assertEqual({entity["type"] for entity in entities}, {"GPE"})
        self.assertIn("Warsaw", {entity["text"] for entity in entities})
        self.assertNotIn("Apple Inc", {entity["text"] for entity in entities})

    def test_filter_policy_keeps_recent_content(self) -> None:
        subject = self._make_subject(published_at=datetime.now(timezone.utc) - timedelta(days=20))
        policy = {
            "policy_key": "recent_gate",
            "version": 1,
            "mode": "dry_run",
            "combiner": "all",
            "policy_json": {
                "dateFallback": ["discovered_at", "ingested_at"],
                "onPass": "keep",
                "onFail": "reject",
                "rules": [
                    {
                        "key": "published_recently",
                        "field": "published_at",
                        "op": "gte_relative",
                        "value": {"amount": 3, "unit": "months"},
                    }
                ],
            },
        }

        result = evaluate_content_filter_policy(subject, policy)

        self.assertTrue(result["passed"])
        self.assertEqual(result["decision"], "keep")
        self.assertEqual(result["matchedRules"][0]["key"], "published_recently")

    def test_filter_policy_rejects_old_content(self) -> None:
        subject = self._make_subject(published_at=datetime.now(timezone.utc) - timedelta(days=140))
        policy = {
            "policy_key": "recent_gate",
            "version": 1,
            "mode": "dry_run",
            "combiner": "all",
            "policy_json": {
                "onPass": "keep",
                "onFail": "reject",
                "rules": [
                    {
                        "key": "published_recently",
                        "field": "published_at",
                        "op": "gte_relative",
                        "value": {"amount": 3, "unit": "months"},
                    }
                ],
            },
        }

        result = evaluate_content_filter_policy(subject, policy)

        self.assertFalse(result["passed"])
        self.assertEqual(result["decision"], "reject")
        self.assertEqual(result["failedRules"][0]["key"], "published_recently")

    def test_filter_policy_uses_date_fallback(self) -> None:
        subject = self._make_subject(published_at=None)
        policy = {
            "policy_key": "recent_gate",
            "version": 1,
            "mode": "dry_run",
            "combiner": "all",
            "policy_json": {
                "dateFallback": ["discovered_at", "ingested_at"],
                "rules": [
                    {
                        "key": "published_or_discovered_recently",
                        "field": "published_at",
                        "op": "gte_relative",
                        "value": {"amount": 3, "unit": "months"},
                    }
                ],
            },
        }

        result = evaluate_content_filter_policy(subject, policy)

        self.assertTrue(result["passed"])
        self.assertEqual(result["matchedRules"][0]["actualField"], "discovered_at")

    def test_sentiment_analysis_detects_negative_risk_signal(self) -> None:
        result = analyze_sentiment(
            "Company faces fraud investigation after market collapse and security breach."
        )

        self.assertEqual(result["sentiment"], "negative")
        self.assertGreater(result["riskScore"], 0)
        self.assertIn("fraud", result["matchedTerms"]["negative"])

    def test_sentiment_analysis_accepts_policy_terms_and_thresholds(self) -> None:
        result = analyze_sentiment(
            "The vendor posted a routine update but the rollout was brittle.",
            config={"negativeTerms": ["brittle"], "negativeThreshold": -0.1},
        )

        self.assertEqual(result["sentiment"], "negative")
        self.assertIn("brittle", result["matchedTerms"]["negative"])

    def test_category_analysis_projects_taxonomy_labels(self) -> None:
        result = analyze_categories(
            "The government announced a new AI cloud policy for cybersecurity companies."
        )

        keys = {item["key"] for item in result["categories"]}
        self.assertIn("technology", keys)
        self.assertIn("politics", keys)

    def test_category_analysis_accepts_policy_taxonomy_terms(self) -> None:
        result = analyze_categories(
            "The newsletter covers geothermal storage procurement.",
            config={"taxonomyTerms": {"energy_transition": ["geothermal", "storage"]}, "maxCategories": 1},
        )

        self.assertEqual(result["primaryCategory"], "energy_transition")
        self.assertEqual([item["key"] for item in result["categories"]], ["energy_transition"])

    def test_runtime_policy_support_refuses_external_provider_dispatch(self) -> None:
        policy = RuntimeAnalysisPolicy(
            policy_id="policy-1",
            policy_key="external_sentiment",
            module="sentiment",
            enabled=True,
            mode="observe",
            provider="external-nlp",
            model_key="remote-model",
            model_version="1",
            config={},
            failure_policy="skip",
            version=1,
        )

        self.assertFalse(_policy_supports_local_runtime(policy))

    def test_runtime_policy_support_accepts_gemini_structured_extraction(self) -> None:
        policy = RuntimeAnalysisPolicy(
            policy_id="policy-1",
            policy_key="structured",
            module="structured_extraction",
            enabled=True,
            mode="observe",
            provider="gemini",
            model_key="gemini-2.0-flash",
            model_version="1",
            config={},
            failure_policy="skip",
            version=1,
        )

        self.assertTrue(_policy_supports_local_runtime(policy))

    def test_runtime_policy_support_accepts_cluster_summary_canonical_module(self) -> None:
        policy = RuntimeAnalysisPolicy(
            policy_id="policy-1",
            policy_key="cluster_summary",
            module="cluster_summary",
            enabled=True,
            mode="observe",
            provider="newsportal",
            model_key="story-cluster-summary-v1",
            model_version="1",
            config={},
            failure_policy="skip",
            version=1,
        )

        self.assertTrue(_policy_supports_local_runtime(policy))

    def test_structured_extraction_hints_capture_job_and_buyer_signals(self) -> None:
        hints = build_structured_extraction_hints(
            "Acme Inc is hiring a remote Python engineer for $120k. Tender deadline is 2026-05-01."
        )

        self.assertIn("hiring", hints["matchedCueTerms"]["job"])
        self.assertIn("remote", hints["matchedCueTerms"]["job"])
        self.assertIn("tender", hints["matchedCueTerms"]["buyer"])
        self.assertIn("$120k", hints["candidateMoney"])
        self.assertIn("2026-05-01", hints["candidateDates"])

    def test_structured_extraction_validation_coerces_template_fields(self) -> None:
        template = {
            "entityTypes": [
                {
                    "type": "job_opening",
                    "fields": [
                        {"key": "company", "type": "string", "project": ["entity", "label"]},
                        {"key": "remote", "type": "boolean", "project": ["label"]},
                        {"key": "tech_stack", "type": "string[]", "project": ["label"]},
                    ],
                }
            ]
        }

        extractions, errors = validate_structured_extraction_output(
            {
                "extractions": [
                    {
                        "type": "job_opening",
                        "confidence": "0.82",
                        "fields": {
                            "company": "Acme Inc",
                            "remote": "true",
                            "tech_stack": ["Python", "PostgreSQL"],
                            "unsupported": "ignored",
                        },
                    }
                ]
            },
            template,
        )

        self.assertEqual(extractions[0]["fields"]["company"], "Acme Inc")
        self.assertTrue(extractions[0]["fields"]["remote"])
        self.assertEqual(extractions[0]["fields"]["tech_stack"], ["Python", "PostgreSQL"])
        self.assertIn("unsupported_field:job_opening.unsupported", errors)

    def test_structured_extraction_label_projection_blocks_high_cardinality_by_default(self) -> None:
        self.assertFalse(
            structured_label_projection_allowed(
                {"type": "string"},
                "Principal Backend Engineer",
                allow_high_cardinality_labels=False,
            )
        )
        self.assertFalse(
            structured_label_projection_allowed(
                {"type": "date"},
                "2026-05-01",
                allow_high_cardinality_labels=False,
            )
        )
        self.assertTrue(
            structured_label_projection_allowed(
                {"type": "boolean"},
                True,
                allow_high_cardinality_labels=False,
            )
        )
        self.assertTrue(
            structured_label_projection_allowed(
                {"type": "string"},
                "Principal Backend Engineer",
                allow_high_cardinality_labels=True,
            )
        )

    def test_filter_policy_can_match_persisted_sentiment_label(self) -> None:
        subject = self._make_subject(published_at=datetime.now(timezone.utc))
        policy = {
            "policy_key": "negative_gate",
            "version": 1,
            "mode": "dry_run",
            "combiner": "all",
            "policy_json": {
                "onPass": "needs_review",
                "rules": [
                    {
                        "key": "negative_sentiment",
                        "field": "label",
                        "op": "has_label",
                        "value": {
                            "labelType": "sentiment",
                            "labelKey": "negative",
                            "minScore": 0.2,
                        },
                    }
                ],
            },
        }

        with patch(
            "services.workers.app.content_analysis._load_subject_labels",
            return_value=[
                {
                    "label_type": "sentiment",
                    "label_key": "negative",
                    "decision": "match",
                    "score": 0.8,
                    "confidence": 0.9,
                }
            ],
        ):
            result = evaluate_content_filter_policy(subject, policy)

        self.assertTrue(result["passed"])
        self.assertEqual(result["decision"], "needs_review")
        self.assertEqual(result["matchedRules"][0]["key"], "negative_sentiment")

    def test_filter_policy_can_match_structured_extraction_field(self) -> None:
        subject = self._make_subject(published_at=datetime.now(timezone.utc))
        policy = {
            "policy_key": "remote_jobs",
            "version": 1,
            "mode": "dry_run",
            "combiner": "all",
            "policy_json": {
                "onPass": "keep",
                "rules": [
                    {
                        "key": "remote_job",
                        "op": "has_extracted_field",
                        "value": {
                            "entityType": "job_opening",
                            "fieldKey": "remote",
                            "value": True,
                            "minConfidence": 0.5,
                        },
                    }
                ],
            },
        }

        with patch(
            "services.workers.app.content_analysis._load_subject_structured_extractions",
            return_value=[
                {
                    "type": "job_opening",
                    "confidence": 0.91,
                    "fields": {"company": "Acme Inc", "remote": True},
                }
            ],
        ):
            result = evaluate_content_filter_policy(subject, policy)

        self.assertTrue(result["passed"])
        self.assertEqual(result["decision"], "keep")
        self.assertEqual(result["matchedRules"][0]["key"], "remote_job")


if __name__ == "__main__":
    unittest.main()
