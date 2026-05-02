import unittest

from services.workers.app.task_engine.adapters.content_sampler import FetchersContentSamplerAdapter


class _FakeRssProbe:
    def __init__(self, results: list[dict]) -> None:
        self.results = results
        self.calls: list[dict] = []

    def probe_feeds(self, *, urls, sample_count):  # type: ignore[no-untyped-def]
        self.calls.append({"urls": urls, "sample_count": sample_count})
        return self.results


class _FakeWebsiteProbe:
    def __init__(self, results: list[dict]) -> None:
        self.results = results
        self.calls: list[dict] = []

    def probe_websites(self, *, urls, sample_count):  # type: ignore[no-untyped-def]
        self.calls.append({"urls": urls, "sample_count": sample_count})
        return self.results


class FetchersContentSamplerAdapterTests(unittest.TestCase):
    def test_sample_content_prefers_fetchers_feed_probe_samples(self) -> None:
        rss_probe = _FakeRssProbe(
            [
                {
                    "is_valid_rss": True,
                    "sample_entries": [
                        {
                            "title": "Feed Story",
                            "link": "https://example.com/story",
                            "snippet": "Feed summary",
                        }
                    ],
                }
            ]
        )
        website_probe = _FakeWebsiteProbe([])

        result = FetchersContentSamplerAdapter(
            rss_probe=rss_probe,
            website_probe=website_probe,
        ).sample_content(
            source_urls=["https://example.com/feed.xml"],
            article_count=1,
            max_chars=20,
        )

        self.assertEqual(result[0]["articles"][0]["title"], "Feed Story")
        self.assertEqual(result[0]["articles"][0]["content"], "Feed summary")
        self.assertEqual(len(website_probe.calls), 0)

    def test_sample_content_falls_back_to_fetchers_website_probe_without_direct_http(self) -> None:
        rss_probe = _FakeRssProbe([])
        website_probe = _FakeWebsiteProbe(
            [
                {
                    "title": "Example Site",
                    "final_url": "https://example.com/",
                    "sample_articles": [
                        {
                            "title": "Website Story",
                            "url": "https://example.com/story",
                        }
                    ],
                }
            ]
        )

        result = FetchersContentSamplerAdapter(
            rss_probe=rss_probe,
            website_probe=website_probe,
        ).sample_content(
            source_urls=["https://example.com/"],
            article_count=1,
            max_chars=20,
        )

        self.assertEqual(result[0]["articles"][0]["title"], "Website Story")
        self.assertEqual(result[0]["articles"][0]["url"], "https://example.com/story")
        self.assertEqual(website_probe.calls[0]["urls"], ["https://example.com/"])
