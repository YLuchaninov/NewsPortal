import sys
import types
import unittest

from services.workers.app.task_engine.adapters.rss_probe import FeedparserRssProbeAdapter


class _FakeResponse:
    def __init__(self, *, url: str, text: str) -> None:
        self.url = url
        self.text = text


class _FakeHttpxClient:
    responses: dict[str, _FakeResponse] = {}

    def __init__(self, *args, **kwargs) -> None:
        pass

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def get(self, url: str) -> _FakeResponse:
        response = self.responses.get(url)
        if response is None:
            raise RuntimeError(f"Unexpected URL: {url}")
        return response


def _build_feedparser_stub() -> types.ModuleType:
    module = types.ModuleType("feedparser")

    def parse(text: str):
        if "<rss" in text or "<feed" in text:
            entry_title = "RSS Story"
            if "Hidden Feed Story" in text:
                entry_title = "Hidden Feed Story"
            return types.SimpleNamespace(
                feed={"title": "Example Feed"},
                entries=[
                    {
                        "title": entry_title,
                        "link": "https://example.com/story",
                        "summary": "Feed summary",
                    }
                ],
            )
        return types.SimpleNamespace(feed={}, entries=[])

    module.parse = parse
    return module


class FeedparserRssProbeAdapterTests(unittest.TestCase):
    def test_probe_feeds_discovers_alternate_feed_from_html_origin(self) -> None:
        html_url = "https://news.example.com"
        feed_url = "https://news.example.com/feed.xml"
        html_body = """
        <html>
          <head>
            <link rel="alternate" type="application/rss+xml" href="/feed.xml" />
          </head>
          <body>Example site</body>
        </html>
        """
        feed_body = """
        <rss>
          <channel>
            <title>Example Feed</title>
            <item>
              <title>Hidden Feed Story</title>
              <link>https://news.example.com/story</link>
              <description>Story summary</description>
            </item>
          </channel>
        </rss>
        """

        httpx_stub = types.ModuleType("httpx")
        httpx_stub.Client = _FakeHttpxClient
        _FakeHttpxClient.responses = {
            html_url: _FakeResponse(url=html_url, text=html_body),
            feed_url: _FakeResponse(url=feed_url, text=feed_body),
        }

        feedparser_stub = _build_feedparser_stub()

        with unittest.mock.patch.dict(
            sys.modules,
            {
                "httpx": httpx_stub,
                "feedparser": feedparser_stub,
            },
            clear=False,
        ):
            adapter = FeedparserRssProbeAdapter()
            result = adapter.probe_feeds(urls=[html_url], sample_count=1)

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["url"], html_url)
        self.assertEqual(result[0]["feed_url"], feed_url)
        self.assertEqual(result[0]["final_url"], feed_url)
        self.assertEqual(result[0]["discovered_feed_urls"], [feed_url])
        self.assertTrue(result[0]["is_valid_rss"])
        self.assertEqual(result[0]["feed_title"], "Example Feed")
        self.assertEqual(result[0]["sample_entries"][0]["title"], "Hidden Feed Story")
        self.assertIsNone(result[0]["error_text"])
