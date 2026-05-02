import json
import unittest
from unittest.mock import patch

from services.workers.app.task_engine.adapters.url_validator import FetchersUrlValidatorAdapter


class _FakeUrlopenResponse:
    def __init__(self, payload: dict) -> None:
        self._payload = json.dumps(payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def read(self) -> bytes:
        return self._payload


class FetchersUrlValidatorAdapterTests(unittest.TestCase):
    def test_validate_urls_uses_fetchers_internal_contract(self) -> None:
        captured_body: dict | None = None

        def fake_urlopen(request, timeout):  # type: ignore[no-untyped-def]
            nonlocal captured_body
            captured_body = json.loads(request.data.decode("utf-8"))
            return _FakeUrlopenResponse(
                {
                    "validated_urls": [
                        {
                            "url": "https://example.com/",
                            "status": 200,
                            "content_type": "text/html",
                            "final_url": "https://example.com/",
                            "is_rss_candidate": False,
                            "is_website_candidate": True,
                            "source_type_hint": "website",
                            "error_text": None,
                        }
                    ]
                }
            )

        with (
            patch(
                "services.workers.app.task_engine.adapters.url_validator.urlopen",
                fake_urlopen,
            ),
            patch.dict(
                "os.environ",
                {"FETCHERS_INTERNAL_BASE_URL": "http://fetchers.internal"},
                clear=False,
            ),
        ):
            result = FetchersUrlValidatorAdapter().validate_urls(
                urls=["https://example.com/"],
            )

        self.assertEqual(captured_body, {"urls": ["https://example.com/"]})
        self.assertEqual(result[0]["source_type_hint"], "website")
        self.assertTrue(result[0]["is_website_candidate"])

    def test_validate_urls_rejects_invalid_fetchers_response_shape(self) -> None:
        def fake_urlopen(_request, timeout=None):  # type: ignore[no-untyped-def]
            return _FakeUrlopenResponse({"not_validated_urls": []})

        with patch(
            "services.workers.app.task_engine.adapters.url_validator.urlopen",
            fake_urlopen,
        ):
            with self.assertRaisesRegex(TypeError, "validated_urls"):
                FetchersUrlValidatorAdapter().validate_urls(
                    urls=["https://example.com/"],
                )
