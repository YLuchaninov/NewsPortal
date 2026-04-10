import json
import sys
import types
import unittest
from unittest.mock import patch

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

from services.workers.app.task_engine.adapters.source_registrar import (
    PostgresSourceRegistrarAdapter,
)
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
