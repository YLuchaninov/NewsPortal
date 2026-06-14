import json
import unittest
from unittest.mock import patch

from signalops.workers.task_engine.adapters.fetchers_rss_probe import FetchersRssProbeAdapter
from signalops.workers.task_engine.adapters import build_live_discovery_runtime


class _FakeUrlopenResponse:
    def __init__(self, payload: dict) -> None:
        self._payload = json.dumps(payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def read(self) -> bytes:
        return self._payload


class FetchersRssProbeAdapterTests(unittest.TestCase):
    def test_live_discovery_runtime_uses_fetchers_rss_probe_by_default(self) -> None:
        with patch.dict("os.environ", {}, clear=True):
            runtime = build_live_discovery_runtime()

        self.assertIsInstance(runtime.rss_probe, FetchersRssProbeAdapter)

    def test_probe_feeds_uses_fetchers_internal_feed_probe_contract(self) -> None:
        captured_body: dict | None = None

        def fake_urlopen(request, timeout):  # type: ignore[no-untyped-def]
            nonlocal captured_body
            captured_body = json.loads(request.data.decode("utf-8"))
            return _FakeUrlopenResponse(
                {
                    "probed_feeds": [
                        {
                            "url": "https://example.com/feed.xml",
                            "feed_url": "https://example.com/feed.xml",
                            "final_url": "https://example.com/feed.xml",
                            "is_valid_rss": True,
                            "feed_title": "Example Feed",
                            "sample_entries": [
                                {
                                    "title": "Story",
                                    "link": "https://example.com/story",
                                    "snippet": "Summary",
                                }
                            ],
                            "diagnostics": [{"code": "guid_permalink_used"}],
                            "error_text": None,
                        }
                    ]
                }
            )

        with (
            patch(
                "signalops.workers.task_engine.adapters.fetchers_rss_probe.urlopen",
                fake_urlopen,
            ),
            patch.dict(
                "os.environ",
                {"FETCHERS_INTERNAL_BASE_URL": "http://fetchers.internal"},
                clear=False,
            ),
        ):
            result = FetchersRssProbeAdapter().probe_feeds(
                urls=["https://example.com/feed.xml"],
                sample_count=1,
            )

        self.assertEqual(captured_body, {"urls": ["https://example.com/feed.xml"], "sampleCount": 1})
        self.assertEqual(result[0]["feed_title"], "Example Feed")
        self.assertEqual(result[0]["sample_entries"][0]["link"], "https://example.com/story")
        self.assertEqual(result[0]["diagnostics"][0]["code"], "guid_permalink_used")

    def test_probe_feeds_rejects_invalid_fetchers_response_shape(self) -> None:
        def fake_urlopen(_request, timeout=None):  # type: ignore[no-untyped-def]
            return _FakeUrlopenResponse({"not_probed_feeds": []})

        with patch(
            "signalops.workers.task_engine.adapters.fetchers_rss_probe.urlopen",
            fake_urlopen,
        ):
            with self.assertRaisesRegex(TypeError, "probed_feeds"):
                FetchersRssProbeAdapter().probe_feeds(
                    urls=["https://example.com/feed.xml"],
                    sample_count=1,
                )
