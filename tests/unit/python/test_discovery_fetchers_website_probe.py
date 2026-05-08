import json
import unittest
from unittest.mock import patch

from tests.unit.python.support.stubs import install_psycopg_stub

install_psycopg_stub()

from services.workers.app.task_engine.adapters.source_registrar import (
    PostgresSourceRegistrarAdapter,
)
from services.workers.app.task_engine.adapters import source_registrar
from services.workers.app.task_engine.adapters.website_probe import (
    FetchersWebsiteProbeAdapter,
)


class _FakeHttpResponse:
    def __init__(self, payload: dict[str, object]) -> None:
        self._payload = json.dumps(payload).encode("utf-8")

    def read(self) -> bytes:
        return self._payload

    def __enter__(self) -> "_FakeHttpResponse":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        del exc_type, exc, tb
        return None


class _FakeCursor:
    def __init__(self, connection: "_FakeConnection") -> None:
        self.connection = connection
        self.rows: list[dict[str, object]] = []

    def __enter__(self) -> "_FakeCursor":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        del exc_type, exc, tb
        return None

    def execute(self, sql: str, params: tuple[object, ...] = ()) -> None:
        self.connection.statements.append((sql, params))
        lowered = sql.lower()
        if "from source_providers" in lowered:
            self.rows = [
                {"provider_type": "rss", "provider_id": "provider-rss"},
                {"provider_type": "website", "provider_id": "provider-website"},
            ]
        elif "from source_channels" in lowered:
            self.rows = []
        elif "update discovery_source_endpoints" in lowered and "returning *" in lowered:
            self.rows = [
                {
                    "endpoint_id": params[2],
                    "source_channel_id": params[0],
                    "status": "registered",
                }
            ]
        else:
            self.rows = []

    def fetchall(self) -> list[dict[str, object]]:
        return self.rows

    def fetchone(self) -> dict[str, object] | None:
        return self.rows[0] if self.rows else None


class _FakeConnection:
    def __init__(self) -> None:
        self.statements: list[tuple[str, tuple[object, ...]]] = []

    def __enter__(self) -> "_FakeConnection":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        del exc_type, exc, tb
        return None

    def transaction(self) -> "_FakeConnection":
        return self

    def cursor(self) -> _FakeCursor:
        return _FakeCursor(self)


class FetchersWebsiteProbeAdapterTests(unittest.TestCase):
    def test_probe_websites_calls_fetchers_internal_endpoint_and_preserves_hard_site_fields(
        self,
    ) -> None:
        captured: dict[str, object] = {}

        def fake_urlopen(request, timeout):  # type: ignore[no-untyped-def]
            captured["url"] = request.full_url
            captured["timeout"] = timeout
            captured["body"] = json.loads(request.data.decode("utf-8"))
            return _FakeHttpResponse(
                {
                    "probed_websites": [
                        {
                            "url": "https://news.example.com",
                            "title": "Hard site",
                            "browser_assisted_recommended": True,
                            "challenge_kind": "captcha",
                        }
                    ]
                }
            )

        adapter = FetchersWebsiteProbeAdapter()
        with patch(
            "services.workers.app.task_engine.adapters.website_probe.urlopen",
            new=fake_urlopen,
        ):
            rows = adapter.probe_websites(
                urls=["https://news.example.com"], sample_count=3
            )

        self.assertEqual(
            captured["url"],
            "http://127.0.0.1:4100/internal/discovery/websites/probe",
        )
        self.assertEqual(
            captured["body"],
            {
                "urls": ["https://news.example.com"],
                "sampleCount": 3,
            },
        )
        self.assertEqual(len(rows), 1)
        self.assertTrue(rows[0]["browser_assisted_recommended"])
        self.assertEqual(rows[0]["challenge_kind"], "captcha")


class SourceRegistrarBrowserConfigTests(unittest.TestCase):
    def test_normalize_source_candidate_enables_browser_fallback_only_when_recommended(
        self,
    ) -> None:
        adapter = PostgresSourceRegistrarAdapter(database_url="postgresql://stub")
        normalized = adapter._normalize_source_candidate(  # noqa: SLF001 - targeted unit coverage
            {
                "url": "https://hard.example.com",
                "title": "Hard site",
                "provider_type": "website",
                "evaluation_json": {
                    "discovered_feed_urls": ["https://hard.example.com/feed.xml"],
                    "browser_assisted_recommended": True,
                    "challenge_kind": "captcha",
                    "capabilities": {
                        "js_heavy_hint": True,
                    },
                },
            },
            provider_type="website",
        )

        assert normalized is not None
        self.assertTrue(normalized["config_json"]["browserFallbackEnabled"])
        self.assertEqual(
            normalized["config_json"]["maxBrowserFetchesPerPoll"], 2
        )
        self.assertTrue(
            normalized["config_json"]["discoveryHints"][
                "browserAssistedRecommended"
            ]
        )
        self.assertEqual(
            normalized["config_json"]["discoveryHints"]["discoveredFeedUrls"],
            ["https://hard.example.com/feed.xml"],
        )
        self.assertEqual(
            normalized["config_json"]["discoveryHints"]["challengeKind"],
            "captcha",
        )

    def test_normalize_endpoint_candidate_builds_probation_contract_config(
        self,
    ) -> None:
        adapter = PostgresSourceRegistrarAdapter(database_url="postgresql://stub")
        normalized = adapter._normalize_endpoint_candidate(  # noqa: SLF001 - targeted unit coverage
            {
                "target_id": "target-1",
                "endpoint_id": "endpoint-1",
                "endpoint_url": "https://example.gov/przetargi",
                "normalized_endpoint_url": "https://example.gov/przetargi",
                "homepage_url": "https://example.gov",
                "provider_type": "website",
                "source_role": "procurement_signal",
                "signal_mode": "direct",
                "endpoint_kind": "procurement",
                "expected_data_shape": "procurement_notice",
                "total_score": 0.82,
            },
            created_by="operator",
            tags=["vmware"],
            operator_config={"reviewTicket": "DISC-1"},
        )

        discovery = normalized["config_json"]["discovery"]
        self.assertEqual(normalized["provider_type"], "website")
        self.assertEqual(normalized["poll_interval_seconds"], 3600)
        self.assertEqual(discovery["trustStage"], "probation")
        self.assertEqual(discovery["coverageContribution"], 0.25)
        self.assertEqual(discovery["downstreamWeight"], 0.3)
        self.assertEqual(discovery["operatorConfig"], {"reviewTicket": "DISC-1"})
        self.assertEqual(discovery["evidenceContract"]["sourceRole"], "procurement_signal")
        self.assertTrue(normalized["config_json"]["downloadDiscoveryEnabled"])
        self.assertIn("przetargi", normalized["config_json"]["curated"]["listingUrlPatterns"])
        self.assertEqual(normalized["config_json"]["tags"], ["discovery", "procurement_signal", "vmware"])

    def test_register_endpoint_source_writes_channel_contract_outbox_and_action(
        self,
    ) -> None:
        connection = _FakeConnection()
        adapter = PostgresSourceRegistrarAdapter(database_url="postgresql://stub")

        with patch.object(
            source_registrar.psycopg,
            "connect",
            return_value=connection,
        ):
            result = adapter.register_endpoint_source(
                endpoint={
                    "target_id": "target-1",
                    "endpoint_id": "endpoint-1",
                    "endpoint_url": "https://example.com/feed.xml",
                    "normalized_endpoint_url": "https://example.com/feed.xml",
                    "homepage_url": "https://example.com",
                    "provider_type": "rss",
                    "source_role": "technical_change",
                    "signal_mode": "direct",
                    "endpoint_kind": "rss_feed",
                    "title": "Example feed",
                },
                enabled=True,
                created_by="operator",
                tags=["vmware"],
                operator_config={},
                reason="manual review passed",
            )

        sql_text = "\n".join(sql.lower() for sql, _params in connection.statements)
        self.assertEqual(result["status"], "registered")
        self.assertIn("insert into source_channels", sql_text)
        self.assertIn("insert into source_channel_runtime_state", sql_text)
        self.assertIn("insert into outbox_events", sql_text)
        self.assertIn("insert into discovery_source_contracts", sql_text)
        self.assertIn("update discovery_source_endpoints", sql_text)
        self.assertIn("insert into discovery_actions", sql_text)
