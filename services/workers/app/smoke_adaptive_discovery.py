from __future__ import annotations

import json
import os
import threading
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from .main import open_connection
from .task_engine.adapters import web_search as web_search_module


class _FakeGeminiHandler(BaseHTTPRequestHandler):
    response_payload: dict[str, Any] = {}
    request_paths: list[str] = []

    def do_POST(self) -> None:  # noqa: N802 - stdlib handler contract
        content_length = int(self.headers.get("Content-Length", "0") or 0)
        if content_length > 0:
            self.rfile.read(content_length)
        type(self).request_paths.append(self.path)
        encoded = json.dumps(type(self).response_payload, ensure_ascii=True).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A003 - stdlib signature
        return None


class _FakeDdgsClient:
    calls: list[tuple[str, dict[str, Any]]] = []

    def text(self, **kwargs: Any) -> list[dict[str, Any]]:
        type(self).calls.append(("text", dict(kwargs)))
        return [
            {
                "href": "https://feeds.example.com/eu-ai.xml",
                "title": "EU AI feed",
                "body": "European AI coverage feed.",
            }
        ]

    def news(self, **kwargs: Any) -> list[dict[str, Any]]:
        type(self).calls.append(("news", dict(kwargs)))
        return [
            {
                "url": "https://news.example.com/eu-ai",
                "title": "EU AI daily",
                "body": "European AI daily roundup.",
                "source": "Example News",
                "date": "2026-03-28",
            }
        ]


@dataclass(frozen=True)
class AdaptiveDiscoverySmokeFixture:
    mission_id: str
    class_key: str
    website_url: str
    feed_url: str
    canonical_domain: str


class _AdaptiveSmokeWebSearchAdapter:
    def __init__(self, *, website_url: str) -> None:
        self._website_url = website_url

    def search(
        self,
        *,
        query: str,
        count: int,
        result_type: str,
        time_range: str | None,
    ) -> dict[str, Any]:
        del count
        return {
            "results": [
                {
                    "url": self._website_url,
                    "title": "Adaptive smoke source",
                    "snippet": f"{query} coverage with regulatory and evidence-trail reporting.",
                    "source": "adaptive-smoke",
                }
            ],
            "meta": {
                "provider": "adaptive_smoke",
                "request_count": 1,
                "returned_count": 1,
                "result_type": result_type,
                "time_range": time_range,
                "cost_usd": 0.0,
                "cost_cents": 0,
            },
        }


class _AdaptiveSmokeUrlValidatorAdapter:
    def validate_urls(self, *, urls: list[str]) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        for url in urls:
            results.append(
                {
                    "url": url,
                    "final_url": url,
                    "is_valid": True,
                    "is_rss_candidate": url.endswith(".xml"),
                    "is_website_candidate": not url.endswith(".xml"),
                    "source_type_hint": "rss" if url.endswith(".xml") else "website",
                }
            )
        return results


class _AdaptiveSmokeWebsiteProbeAdapter:
    def __init__(self, *, website_url: str, feed_url: str) -> None:
        self._website_url = website_url
        self._feed_url = feed_url

    def probe_websites(self, *, urls: list[str], sample_count: int) -> list[dict[str, Any]]:
        del sample_count
        return [
            {
                "url": url,
                "final_url": url,
                "title": "Adaptive smoke source",
                "classification": {
                    "kind": "editorial",
                    "confidence": 0.84,
                    "reasons": ["detail:editorial", "hint:feed"],
                },
                "capabilities": {
                    "supports_feed_discovery": True,
                    "supports_collection_discovery": True,
                    "supports_download_discovery": False,
                    "inline_data_hint": False,
                    "js_heavy_hint": False,
                },
                "discovered_feed_urls": [self._feed_url],
                "listing_urls": [self._website_url],
                "document_urls": [],
                "detail_count_estimate": 12,
                "listing_count_estimate": 1,
                "document_count_estimate": 0,
                "sample_resources": [
                    {
                        "url": f"{self._website_url}/stories/eu-ai-oversight",
                        "title": "EU AI oversight signal",
                        "kind": "editorial",
                    }
                ],
                "is_news_site": True,
                "has_hidden_rss": True,
                "hidden_rss_urls": [self._feed_url],
                "article_count_estimate": 12,
                "freshness": "daily",
                "date_patterns_found": True,
                "category_urls": [self._website_url],
                "browser_assisted_recommended": False,
                "challenge_kind": None,
                "sample_articles": [
                    {
                        "url": f"{self._website_url}/stories/eu-ai-oversight",
                        "title": "EU AI oversight signal",
                    }
                ],
            }
            for url in urls
        ]


class _AdaptiveSmokeContentSamplerAdapter:
    def sample_content(
        self,
        *,
        source_urls: list[str],
        article_count: int,
        max_chars: int,
    ) -> list[dict[str, Any]]:
        del article_count
        del max_chars
        return [
            {
                "source_url": url,
                "articles": [
                    {
                        "url": f"{url.rstrip('/')}/stories/eu-ai-oversight",
                        "title": "EU AI oversight investigation",
                        "content_text": (
                            "EU AI oversight, regulatory evidence, early signal reporting and "
                            "compliance updates from Brussels."
                        ),
                    }
                ],
            }
            for url in source_urls
        ]


@contextmanager
def fake_ddgs_client():
    original_ddgs = web_search_module._DDGS
    _FakeDdgsClient.calls = []
    web_search_module._DDGS = _FakeDdgsClient
    try:
        yield _FakeDdgsClient.calls
    finally:
        web_search_module._DDGS = original_ddgs


def stable_uuid(name: str) -> uuid.UUID:
    return uuid.uuid5(uuid.NAMESPACE_URL, f"newsportal-phase3-smoke:{name}")


@contextmanager
def temporary_environment(overrides: dict[str, str]):
    original = {key: os.environ.get(key) for key in overrides}
    try:
        for key, value in overrides.items():
            os.environ[key] = value
        yield
    finally:
        for key, previous_value in original.items():
            if previous_value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = previous_value


@contextmanager
def fake_gemini_server(response_payload: dict[str, Any]):
    class Handler(_FakeGeminiHandler):
        pass

    Handler.response_payload = response_payload
    Handler.request_paths = []
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}", Handler.request_paths
    finally:
        server.shutdown()
        thread.join(timeout=5)
        server.server_close()


async def create_adaptive_discovery_smoke_fixture() -> AdaptiveDiscoverySmokeFixture:
    suffix = uuid.uuid4().hex[:12]
    mission_id = str(uuid.uuid4())
    class_key = f"adaptive_smoke_{suffix}"
    canonical_domain = f"adaptive-smoke-{suffix}.example.com"
    website_url = f"https://{canonical_domain}/news"
    feed_url = f"https://{canonical_domain}/feed.xml"
    async with await open_connection() as connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                await cursor.execute(
                    """
                    insert into discovery_hypothesis_classes (
                      class_key,
                      display_name,
                      description,
                      status,
                      generation_backend,
                      default_provider_types,
                      prompt_instructions,
                      seed_rules_json,
                      max_per_mission,
                      sort_order,
                      config_json
                    )
                    values (
                      %s,
                      'Adaptive Smoke',
                      'Compose-backed adaptive discovery smoke class.',
                      'active',
                      'graph_seed_only',
                      %s::text[],
                      'Synthetic compose smoke class for adaptive discovery.',
                      %s::jsonb,
                      1,
                      1,
                      '{}'::jsonb
                    )
                    """,
                    (
                        class_key,
                        ["website"],
                        json.dumps({"seedFields": ["core_topic"], "tactics": ["signal"]}),
                    ),
                )
                await cursor.execute(
                    """
                    insert into discovery_missions (
                      mission_id,
                      title,
                      description,
                      source_kind,
                      seed_topics,
                      seed_languages,
                      seed_regions,
                      target_provider_types,
                      max_hypotheses,
                      max_sources,
                      budget_cents,
                      status,
                      priority,
                      created_by
                    )
                    values (
                      %s,
                      'Adaptive smoke mission',
                      'Compose-backed adaptive discovery walkthrough.',
                      'manual',
                      %s::text[],
                      %s::text[],
                      %s::text[],
                      %s::text[],
                      1,
                      5,
                      500,
                      'active',
                      100,
                      'adaptive-discovery-smoke'
                    )
                    """,
                    (
                        mission_id,
                        ["EU AI oversight", "regulation"],
                        ["en"],
                        ["EU"],
                        ["website"],
                    ),
                )
    return AdaptiveDiscoverySmokeFixture(
        mission_id=mission_id,
        class_key=class_key,
        website_url=website_url,
        feed_url=feed_url,
        canonical_domain=canonical_domain,
    )


async def insert_adaptive_discovery_smoke_feedback(
    *,
    mission_id: str,
    candidate_id: str,
    source_profile_id: str,
) -> None:
    async with await open_connection() as connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                await cursor.execute(
                    """
                    insert into discovery_feedback_events (
                      mission_id,
                      candidate_id,
                      source_profile_id,
                      feedback_type,
                      feedback_value,
                      notes,
                      created_by
                    )
                    values (%s, %s, %s, 'valuable_source', 'positive', 'adaptive smoke feedback', 'adaptive-discovery-smoke')
                    """,
                    (mission_id, candidate_id, source_profile_id),
                )


async def cleanup_adaptive_discovery_smoke_fixture(
    fixture: AdaptiveDiscoverySmokeFixture,
) -> None:
    async with await open_connection() as connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                await cursor.execute(
                    """
                    select
                      registered_channel_id::text as registered_channel_id
                    from discovery_candidates
                    where mission_id = %s
                      and registered_channel_id is not null
                    """,
                    (fixture.mission_id,),
                )
                channel_ids = [
                    str(row["registered_channel_id"])
                    for row in (await cursor.fetchall())
                    if row.get("registered_channel_id")
                ]
                await cursor.execute(
                    """
                    select
                      sequence_run_id::text as sequence_run_id
                    from discovery_hypotheses
                    where mission_id = %s
                      and sequence_run_id is not null
                    """,
                    (fixture.mission_id,),
                )
                run_ids = [
                    str(row["sequence_run_id"])
                    for row in (await cursor.fetchall())
                    if row.get("sequence_run_id")
                ]
                if run_ids:
                    await cursor.execute(
                        """
                        delete from sequence_task_runs
                        where run_id = any(%s::uuid[])
                        """,
                        (run_ids,),
                    )
                    await cursor.execute(
                        """
                        delete from sequence_runs
                        where run_id = any(%s::uuid[])
                        """,
                        (run_ids,),
                    )
                await cursor.execute(
                    "delete from discovery_missions where mission_id = %s",
                    (fixture.mission_id,),
                )
                await cursor.execute(
                    """
                    delete from discovery_source_profiles
                    where canonical_domain = %s
                    """,
                    (fixture.canonical_domain,),
                )
                if channel_ids:
                    await cursor.execute(
                        """
                        delete from outbox_events
                        where aggregate_type = 'source_channel'
                          and aggregate_id = any(%s::uuid[])
                        """,
                        (channel_ids,),
                    )
                    await cursor.execute(
                        """
                        delete from source_channel_runtime_state
                        where channel_id = any(%s::uuid[])
                        """,
                        (channel_ids,),
                    )
                    await cursor.execute(
                        """
                        delete from source_channels
                        where channel_id = any(%s::uuid[])
                        """,
                        (channel_ids,),
                    )
                await cursor.execute(
                    "delete from discovery_hypothesis_classes where class_key = %s",
                    (fixture.class_key,),
                )
