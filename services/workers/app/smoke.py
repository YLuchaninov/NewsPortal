from __future__ import annotations

import argparse
import asyncio
import json
import os
import threading
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from decimal import Decimal
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from types import SimpleNamespace
from typing import Any

from . import main as worker_main
from .main import (
    LLM_REVIEW_REQUESTED_EVENT,
    LLM_REVIEW_CONSUMER,
    open_connection,
    process_cluster,
    process_llm_review,
    process_match_criteria,
    process_match_interests,
    process_notify,
    process_dedup,
    process_normalize,
    process_criterion_compile,
    process_embed,
    process_interest_compile,
    process_reindex,
)
from .discovery_orchestrator import (
    DiscoveryCoordinatorRepository,
    compile_interest_graph_for_mission,
    evaluate_hypotheses,
    execute_hypotheses,
    load_discovery_settings,
    plan_hypotheses,
    re_evaluate_sources,
)
from .task_engine import configure_discovery_runtime, get_discovery_runtime, reset_discovery_runtime
from .task_engine.adapters import build_live_discovery_runtime, discovery_enabled
from .task_engine.discovery_runtime import DiscoveryRuntime
from .task_engine.discovery_plugins import LlmAnalyzerPlugin, WebSearchPlugin
from .task_engine.repository import PostgresSequenceRepository
from .task_engine.adapters import web_search as web_search_module
from .system_feed import summarize_system_feed_result


@dataclass
class FakeJob:
    data: dict[str, Any]


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
                "browser_assisted_recommended": True,
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


async def ensure_embed_fixture() -> str:
    channel_id = stable_uuid("embed-channel")
    doc_id = stable_uuid("embed-article")
    long_feed_body = " ".join(
        [
            "European Union AI policy response reaches Brussels and Warsaw as regulators in Warsaw and Brussels publish coordinated EU AI compliance guidance with 42 pages of response details."
            for _ in range(10)
        ]
    )
    raw_payload_json = {
        "entry": {
            "title": "European Union AI policy response reaches Brussels and Warsaw",
            "description": "European Union AI policy response reaches Brussels and Warsaw.",
            "contentEncoded": f"<p>{long_feed_body}</p>",
            "mediaContentUrl": "https://example.test/media/phase3-embed-smoke.jpg",
        }
    }
    async with await open_connection() as connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                await cursor.execute(
                    """
                    insert into source_channels (
                      channel_id,
                      provider_type,
                      name,
                      fetch_url,
                      language,
                      is_active
                    )
                    values (%s, 'rss', 'Phase 3 Embed Smoke', 'https://example.test/feed', 'en', true)
                    on conflict (channel_id) do update
                    set
                      name = excluded.name,
                      fetch_url = excluded.fetch_url,
                      language = excluded.language,
                      is_active = true,
                      updated_at = now()
                    """,
                    (channel_id,),
                )
                await cursor.execute(
                    """
                    insert into articles (
                      doc_id,
                      channel_id,
                      source_article_id,
                      url,
                      published_at,
                      title,
                      lead,
                      body,
                      raw_payload_json,
                      lang,
                      lang_confidence,
                      processing_state,
                      normalized_at,
                      updated_at
                    )
                    values (
                      %s,
                      %s,
                      'phase3-embed-smoke',
                      'https://example.test/articles/phase3-embed-smoke',
                      now(),
                      'European Union AI policy response reaches Brussels and Warsaw',
                      'European Union AI policy response reaches Brussels and Warsaw.',
                      %s,
                      %s::jsonb,
                      'en',
                      0.9,
                      'normalized',
                      now(),
                      now()
                    )
                    on conflict (doc_id) do update
                    set
                      published_at = now(),
                      title = excluded.title,
                      lead = excluded.lead,
                      body = excluded.body,
                      raw_payload_json = excluded.raw_payload_json,
                      lang = excluded.lang,
                      lang_confidence = excluded.lang_confidence,
                      canonical_doc_id = excluded.doc_id,
                      family_id = excluded.doc_id,
                      is_exact_duplicate = false,
                      is_near_duplicate = false,
                      event_cluster_id = null,
                      enrichment_state = 'pending',
                      enriched_at = null,
                      full_content_html = null,
                      extracted_description = null,
                      extracted_author = null,
                      extracted_ttr_seconds = null,
                      extracted_image_url = null,
                      extracted_favicon_url = null,
                      extracted_published_at = null,
                      extracted_source_name = null,
                      has_media = false,
                      primary_media_asset_id = null,
                      processing_state = 'normalized',
                      normalized_at = now(),
                      embedded_at = null,
                      updated_at = now()
                    """,
                    (doc_id, channel_id, long_feed_body, json.dumps(raw_payload_json)),
                )
                await cursor.execute(
                    """
                    insert into canonical_documents (
                      canonical_document_id,
                      content_kind,
                      content_format,
                      canonical_url,
                      canonical_domain,
                      title,
                      lead,
                      body,
                      lang,
                      lang_confidence,
                      published_at,
                      first_observed_at,
                      last_observed_at,
                      observation_count
                    )
                    values (
                      %s,
                      'editorial',
                      'article',
                      'https://example.test/articles/phase3-embed-smoke',
                      'example.test',
                      'European Union AI policy response reaches Brussels and Warsaw',
                      'European Union AI policy response reaches Brussels and Warsaw.',
                      %s,
                      'en',
                      0.9,
                      now(),
                      now(),
                      now(),
                      1
                    )
                    on conflict (canonical_document_id) do update
                    set
                      canonical_url = excluded.canonical_url,
                      canonical_domain = excluded.canonical_domain,
                      title = excluded.title,
                      lead = excluded.lead,
                      body = excluded.body,
                      lang = excluded.lang,
                      lang_confidence = excluded.lang_confidence,
                      published_at = excluded.published_at,
                      first_observed_at = excluded.first_observed_at,
                      last_observed_at = excluded.last_observed_at,
                      observation_count = excluded.observation_count,
                      updated_at = now()
                    """,
                    (doc_id, long_feed_body),
                )
                await cursor.execute(
                    """
                    insert into document_observations (
                      origin_type,
                      origin_id,
                      channel_id,
                      source_record_id,
                      observed_url,
                      published_at,
                      ingested_at,
                      canonical_document_id,
                      duplicate_kind,
                      observation_state
                    )
                    values (
                      'article',
                      %s,
                      %s,
                      'phase3-embed-smoke',
                      'https://example.test/articles/phase3-embed-smoke',
                      now(),
                      now(),
                      %s,
                      'canonical',
                      'canonicalized'
                    )
                    on conflict (origin_type, origin_id) do update
                    set
                      channel_id = excluded.channel_id,
                      source_record_id = excluded.source_record_id,
                      observed_url = excluded.observed_url,
                      published_at = excluded.published_at,
                      ingested_at = excluded.ingested_at,
                      canonical_document_id = excluded.canonical_document_id,
                      duplicate_kind = excluded.duplicate_kind,
                      observation_state = excluded.observation_state,
                      updated_at = now()
                    """,
                    (doc_id, channel_id, doc_id),
                )
    await reset_phase4_runtime_state(
        doc_id=str(doc_id),
        user_id=str(stable_uuid("interest-user")),
        interest_id=str(stable_uuid("interest-row")),
    )
    return str(doc_id)


async def ensure_interest_fixture() -> str:
    user_id = stable_uuid("interest-user")
    interest_id = stable_uuid("interest-row")
    async with await open_connection() as connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                await cursor.execute(
                    """
                    insert into users (
                      user_id,
                      auth_subject,
                      auth_provider,
                      email,
                      is_anonymous,
                      status,
                      updated_at
                    )
                    values (%s, 'phase3-interest-user', 'firebase_anonymous', 'phase3-interest@example.test', false, 'active', now())
                    on conflict (user_id) do update
                    set
                      email = excluded.email,
                      updated_at = now()
                    """,
                    (user_id,),
                )
                await cursor.execute(
                    """
                    insert into user_interests (
                      interest_id,
                      user_id,
                      description,
                      positive_texts,
                      negative_texts,
                      must_have_terms,
                      must_not_have_terms,
                      places,
                      languages_allowed,
                      short_tokens_required,
                      short_tokens_forbidden,
                      priority,
                      enabled,
                      compiled,
                      compile_status,
                      version,
                      updated_at
                    )
                    values (
                      %s,
                      %s,
                      'AI policy changes in the European Union',
                      '["EU AI policy", "European AI regulation", "Brussels AI rules"]'::jsonb,
                      '["US sports coverage", "consumer gadget reviews"]'::jsonb,
                      '["policy"]'::jsonb,
                      '["sports"]'::jsonb,
                      '["Brussels", "Warsaw"]'::jsonb,
                      '["en"]'::jsonb,
                      '["EU", "AI"]'::jsonb,
                      '["NBA"]'::jsonb,
                      1.0,
                      true,
                      false,
                      'queued',
                      2,
                      now()
                    )
                    on conflict (interest_id) do update
                    set
                      description = excluded.description,
                      positive_texts = excluded.positive_texts,
                      negative_texts = excluded.negative_texts,
                      must_have_terms = excluded.must_have_terms,
                      must_not_have_terms = excluded.must_not_have_terms,
                      places = excluded.places,
                      languages_allowed = excluded.languages_allowed,
                      short_tokens_required = excluded.short_tokens_required,
                      short_tokens_forbidden = excluded.short_tokens_forbidden,
                      priority = excluded.priority,
                      enabled = excluded.enabled,
                      compiled = false,
                      compile_status = 'queued',
                      version = 2,
                      updated_at = now()
                    """,
                    (interest_id, user_id),
                )
    return str(interest_id)


async def ensure_notification_channel_fixture() -> str:
    user_id = stable_uuid("interest-user")
    channel_binding_id = stable_uuid("notification-channel")
    async with await open_connection() as connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                await cursor.execute(
                    """
                    insert into user_notification_channels (
                      channel_binding_id,
                      user_id,
                      channel_type,
                      is_enabled,
                      config_json,
                      verified_at,
                      updated_at
                    )
                    values (
                      %s,
                      %s,
                      'web_push',
                      true,
                      '{"subscription":{"endpoint":"https://push.example.test/subscription/phase4","keys":{"auth":"phase4-auth","p256dh":"phase4-p256dh"}}}'::jsonb,
                      now(),
                      now()
                    )
                    on conflict (channel_binding_id) do update
                    set
                      is_enabled = true,
                      config_json = excluded.config_json,
                      verified_at = now(),
                      updated_at = now()
                    """,
                    (channel_binding_id, user_id),
                )
    return str(channel_binding_id)


@contextmanager
def patched_smoke_delivery() -> Any:
    original_dispatch = worker_main.dispatch_channel_message
    worker_main.dispatch_channel_message = lambda *args, **kwargs: SimpleNamespace(
        status="sent",
        detail="smoke_web_push",
    )
    try:
        yield
    finally:
        worker_main.dispatch_channel_message = original_dispatch


async def ensure_criterion_fixture() -> str:
    criterion_id = stable_uuid("criterion-row")
    async with await open_connection() as connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                await cursor.execute(
                    """
                    insert into criteria (
                      criterion_id,
                      description,
                      positive_texts,
                      negative_texts,
                      must_have_terms,
                      must_not_have_terms,
                      places,
                      languages_allowed,
                      short_tokens_required,
                      short_tokens_forbidden,
                      priority,
                      enabled,
                      compiled,
                      compile_status,
                      version,
                      updated_at
                    )
                    values (
                      %s,
                      'European Union AI policy response',
                      '[]'::jsonb,
                      '["entertainmentcoverage fashionindustry marketcommentary"]'::jsonb,
                      '["AI", "European Union"]'::jsonb,
                      '[]'::jsonb,
                      '["Brussels", "Warsaw"]'::jsonb,
                      '["en"]'::jsonb,
                      '["AI", "EU"]'::jsonb,
                      '[]'::jsonb,
                      1.0,
                      true,
                      false,
                      'queued',
                      3,
                      now()
                    )
                    on conflict (criterion_id) do update
                    set
                      description = excluded.description,
                      positive_texts = excluded.positive_texts,
                      negative_texts = excluded.negative_texts,
                      must_have_terms = excluded.must_have_terms,
                      must_not_have_terms = excluded.must_not_have_terms,
                      places = excluded.places,
                      languages_allowed = excluded.languages_allowed,
                      short_tokens_required = excluded.short_tokens_required,
                      short_tokens_forbidden = excluded.short_tokens_forbidden,
                      priority = excluded.priority,
                      enabled = excluded.enabled,
                      compiled = false,
                      compile_status = 'queued',
                      version = 3,
                      updated_at = now()
                    """,
                    (criterion_id,),
                )
    return str(criterion_id)


async def ensure_llm_cost_review_fixture() -> tuple[str, str, str]:
    channel_id = str(uuid.uuid4())
    doc_id = str(uuid.uuid4())
    criterion_id = str(uuid.uuid4())
    async with await open_connection() as connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                await cursor.execute(
                    """
                    insert into source_channels (
                      channel_id,
                      provider_type,
                      name,
                      fetch_url,
                      language,
                      is_active
                    )
                    values (%s, 'rss', 'LLM Cost Proof Smoke', 'https://example.test/llm-cost-proof.xml', 'en', true)
                    """,
                    (channel_id,),
                )
                await cursor.execute(
                    """
                    insert into articles (
                      doc_id,
                      channel_id,
                      source_article_id,
                      url,
                      published_at,
                      title,
                      lead,
                      body,
                      lang,
                      lang_confidence,
                      processing_state,
                      normalized_at,
                      embedded_at,
                      updated_at
                    )
                    values (
                      %s,
                      %s,
                      %s,
                      %s,
                      now(),
                      'European Union AI policy response reaches Brussels and Warsaw',
                      'Synthetic LLM proof article for provider usage metadata.',
                      'European Union AI policy response reaches Brussels and Warsaw while regulators publish a detailed compliance package for AI governance.',
                      'en',
                      0.9,
                      'embedded',
                      now(),
                      now(),
                      now()
                    )
                    """,
                    (
                        doc_id,
                        channel_id,
                        f"llm-cost-proof-{doc_id}",
                        f"https://example.test/articles/llm-cost-proof/{doc_id}",
                    ),
                )
                await cursor.execute(
                    """
                    insert into criteria (
                      criterion_id,
                      description,
                      positive_texts,
                      negative_texts,
                      must_have_terms,
                      must_not_have_terms,
                      places,
                      languages_allowed,
                      short_tokens_required,
                      short_tokens_forbidden,
                      priority,
                      enabled,
                      compiled,
                      compile_status,
                      version,
                      updated_at
                    )
                    values (
                      %s,
                      'Synthetic LLM cost proof criterion',
                      '["EU AI policy", "AI governance"]'::jsonb,
                      '[]'::jsonb,
                      '["AI"]'::jsonb,
                      '[]'::jsonb,
                      '["Brussels"]'::jsonb,
                      '["en"]'::jsonb,
                      '["AI"]'::jsonb,
                      '[]'::jsonb,
                      1.0,
                      true,
                      true,
                      'compiled',
                      1,
                      now()
                    )
                    """,
                    (criterion_id,),
                )
                await cursor.execute(
                    """
                    insert into criterion_match_results (
                      doc_id,
                      criterion_id,
                      score_pos,
                      score_neg,
                      score_lex,
                      score_meta,
                      score_final,
                      decision,
                      explain_json
                    )
                    values (
                      %s,
                      %s,
                      0.48,
                      0.05,
                      0.12,
                      0.01,
                      0.56,
                      'gray_zone',
                      '{"smoke":"llm-cost-proof"}'::jsonb
                    )
                    """,
                    (doc_id, criterion_id),
                )
    return channel_id, doc_id, criterion_id


async def reset_phase4_runtime_state(
    *,
    doc_id: str,
    user_id: str,
    interest_id: str,
) -> None:
    async with await open_connection() as connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                await cursor.execute(
                    """
                    delete from notification_feedback
                    where notification_id in (
                      select notification_id
                      from notification_log
                      where doc_id = %s
                         or (user_id = %s and interest_id = %s)
                    )
                    """,
                    (doc_id, user_id, interest_id),
                )
                await cursor.execute(
                    """
                    delete from notification_suppression
                    where doc_id = %s
                       or family_id = %s
                       or (user_id = %s and interest_id = %s)
                    """,
                    (doc_id, doc_id, user_id, interest_id),
                )
                await cursor.execute(
                    """
                    delete from notification_log
                    where doc_id = %s
                       or (user_id = %s and interest_id = %s)
                    """,
                    (doc_id, user_id, interest_id),
                )
                await cursor.execute(
                    """
                    delete from llm_review_log
                    where doc_id = %s
                    """,
                    (doc_id,),
                )
                await cursor.execute(
                    """
                    delete from interest_match_results
                    where doc_id = %s
                    """,
                    (doc_id,),
                )
                await cursor.execute(
                    """
                    delete from interest_filter_results
                    where doc_id = %s
                    """,
                    (doc_id,),
                )
                await cursor.execute(
                    """
                    delete from criterion_match_results
                    where doc_id = %s
                    """,
                    (doc_id,),
                )
                await cursor.execute(
                    """
                    delete from system_feed_results
                    where doc_id = %s
                    """,
                    (doc_id,),
                )
                await cursor.execute(
                    """
                    delete from final_selection_results
                    where doc_id = %s
                    """,
                    (doc_id,),
                )
                await cursor.execute(
                    """
                    delete from event_cluster_members
                    where doc_id = %s
                    """,
                    (doc_id,),
                )
                await cursor.execute(
                    """
                    delete from verification_results
                    where
                      (target_type = 'canonical_document' and target_id = %s)
                      or (
                        target_type = 'story_cluster'
                        and target_id in (
                          select story_cluster_id
                          from story_cluster_members
                          where canonical_document_id = %s
                        )
                      )
                    """,
                    (doc_id, doc_id),
                )
                await cursor.execute(
                    """
                    delete from story_cluster_members
                    where canonical_document_id = %s
                    """,
                    (doc_id,),
                )
                await cursor.execute(
                    """
                    delete from story_clusters sc
                    where not exists (
                      select 1
                      from story_cluster_members scm
                      where scm.story_cluster_id = sc.story_cluster_id
                    )
                    """,
                )
                await cursor.execute(
                    """
                    delete from article_media_assets
                    where doc_id = %s
                    """,
                    (doc_id,),
                )
                await cursor.execute(
                    """
                    delete from outbox_events
                    where aggregate_type = 'article'
                      and aggregate_id = %s
                    """,
                    (doc_id,),
                )


async def cleanup_llm_cost_review_fixture(
    *,
    channel_id: str,
    doc_id: str,
    criterion_id: str,
    event_id: str,
) -> None:
    async with await open_connection() as connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                await cursor.execute(
                    """
                    delete from inbox_processed_events
                    where event_id = %s and consumer_name = %s
                    """,
                    (event_id, LLM_REVIEW_CONSUMER),
                )
                await cursor.execute(
                    """
                    delete from outbox_events
                    where aggregate_id = %s
                       or (aggregate_type = 'criterion' and aggregate_id = %s)
                    """,
                    (doc_id, criterion_id),
                )
                await cursor.execute(
                    """
                    delete from llm_review_log
                    where doc_id = %s
                    """,
                    (doc_id,),
                )
                await cursor.execute(
                    """
                    delete from system_feed_results
                    where doc_id = %s
                    """,
                    (doc_id,),
                )
                await cursor.execute(
                    """
                    delete from final_selection_results
                    where doc_id = %s
                    """,
                    (doc_id,),
                )
                await cursor.execute(
                    """
                    delete from criterion_match_results
                    where doc_id = %s and criterion_id = %s
                    """,
                    (doc_id, criterion_id),
                )
                await cursor.execute(
                    """
                    delete from criteria
                    where criterion_id = %s
                    """,
                    (criterion_id,),
                )
                await cursor.execute(
                    """
                    delete from articles
                    where doc_id = %s
                    """,
                    (doc_id,),
                )
                await cursor.execute(
                    """
                    delete from source_channels
                    where channel_id = %s
                    """,
                    (channel_id,),
                )


async def fetch_latest_article_event_id(doc_id: str, event_type: str) -> str:
    async with await open_connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(
                """
                select event_id::text as event_id
                from outbox_events
                where aggregate_type = 'article'
                  and aggregate_id = %s
                  and event_type = %s
                order by created_at desc
                limit 1
                """,
                (doc_id, event_type),
            )
            event = await cursor.fetchone()

    if not event:
        raise RuntimeError(
            f"Phase 4 smoke verification failed: missing emitted outbox event {event_type}."
        )

    return str(event["event_id"])


async def ensure_outbox_event(
    *,
    event_id: str,
    event_type: str,
    aggregate_type: str,
    aggregate_id: str,
    payload: dict[str, Any],
) -> None:
    async with await open_connection() as connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                await cursor.execute(
                    """
                    insert into outbox_events (
                      event_id,
                      event_type,
                      aggregate_type,
                      aggregate_id,
                      payload_json,
                      status,
                      published_at,
                      attempt_count,
                      error_message
                    )
                    values (%s, %s, %s, %s, %s::jsonb, 'published', now(), 1, null)
                    on conflict (event_id) do update
                    set
                      event_type = excluded.event_type,
                      aggregate_type = excluded.aggregate_type,
                      aggregate_id = excluded.aggregate_id,
                      payload_json = excluded.payload_json,
                      status = 'published',
                      published_at = now(),
                      attempt_count = greatest(outbox_events.attempt_count, 1),
                      error_message = null
                    """,
                    (
                        event_id,
                        event_type,
                        aggregate_type,
                        aggregate_id,
                        json.dumps(payload),
                    ),
                )


async def ensure_reindex_job_fixture(reindex_job_id: str, doc_id: str) -> None:
    user_id = stable_uuid("interest-user")
    options_json = json.dumps(
        {
            "batchSize": 1,
            "retroNotifications": "skip",
            "docIds": [doc_id],
            "includeEnrichment": True,
            "forceEnrichment": False,
        }
    )
    async with await open_connection() as connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                await cursor.execute(
                    """
                    delete from reindex_job_targets
                    where reindex_job_id = %s
                    """,
                    (reindex_job_id,),
                )
                await cursor.execute(
                    """
                    insert into reindex_jobs (
                      reindex_job_id,
                      index_name,
                      job_kind,
                      options_json,
                      requested_by_user_id,
                      status,
                      created_at,
                      updated_at
                    )
                    values (
                      %s,
                      'interest_centroids',
                      'backfill',
                      %s::jsonb,
                      %s,
                      'queued',
                      now(),
                      now()
                    )
                    on conflict (reindex_job_id) do update
                    set
                      job_kind = 'backfill',
                      options_json = %s::jsonb,
                      status = 'queued',
                      error_text = null,
                      started_at = null,
                      finished_at = null,
                      updated_at = now()
                    """,
                    (reindex_job_id, options_json, user_id, options_json),
                )


async def clear_zero_shot_derived_state_for_doc(doc_id: str) -> None:
    async with await open_connection() as connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                await cursor.execute(
                    """
                    delete from verification_results
                    where
                      (target_type = 'canonical_document' and target_id = %s)
                      or (
                        target_type = 'story_cluster'
                        and target_id in (
                          select story_cluster_id
                          from story_cluster_members
                          where canonical_document_id = %s
                        )
                      )
                    """,
                    (doc_id, doc_id),
                )
                await cursor.execute(
                    """
                    delete from story_cluster_members
                    where canonical_document_id = %s
                    """,
                    (doc_id,),
                )
                await cursor.execute(
                    """
                    delete from story_clusters sc
                    where not exists (
                      select 1
                      from story_cluster_members scm
                      where scm.story_cluster_id = sc.story_cluster_id
                    )
                    """,
                )
                await cursor.execute(
                    """
                    delete from interest_filter_results
                    where doc_id = %s
                    """,
                    (doc_id,),
                )
                await cursor.execute(
                    """
                    delete from final_selection_results
                    where doc_id = %s
                    """,
                    (doc_id,),
                )
                await cursor.execute(
                    """
                    delete from system_feed_results
                    where doc_id = %s
                    """,
                    (doc_id,),
                )


async def fetch_notification_count(doc_id: str) -> int:
    async with await open_connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(
                """
                select count(*)::int as notification_count
                from notification_log
                where doc_id = %s
                """,
                (doc_id,),
            )
            row = await cursor.fetchone()
    return int(row["notification_count"] or 0) if row else 0


async def fetch_match_counts(doc_id: str) -> tuple[int, int]:
    async with await open_connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(
                """
                select count(*)::int as criterion_count
                from criterion_match_results
                where doc_id = %s
                """,
                (doc_id,),
            )
            criterion_count = await cursor.fetchone()
            await cursor.execute(
                """
                select count(*)::int as interest_count
                from interest_match_results
                where doc_id = %s
                """,
                (doc_id,),
            )
            interest_count = await cursor.fetchone()

    return (
        int(criterion_count["criterion_count"] or 0) if criterion_count else 0,
        int(interest_count["interest_count"] or 0) if interest_count else 0,
    )


async def fetch_system_feed_result(doc_id: str) -> dict[str, Any] | None:
    async with await open_connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(
                """
                select
                  decision,
                  eligible_for_feed,
                  total_criteria_count,
                  relevant_criteria_count,
                  irrelevant_criteria_count,
                  pending_llm_criteria_count
                from system_feed_results
                where doc_id = %s
                """,
                (doc_id,),
            )
            row = await cursor.fetchone()
    return dict(row) if row else None


async def fetch_final_selection_result(doc_id: str) -> dict[str, Any] | None:
    async with await open_connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(
                """
                select
                  final_decision,
                  is_selected,
                  compat_system_feed_decision,
                  verification_target_type,
                  verification_target_id,
                  verification_state,
                  total_filter_count,
                  matched_filter_count,
                  no_match_filter_count,
                  gray_zone_filter_count,
                  technical_filtered_out_count
                from final_selection_results
                where doc_id = %s
                """,
                (doc_id,),
            )
            row = await cursor.fetchone()
    return dict(row) if row else None


async def fetch_latest_llm_review(doc_id: str) -> dict[str, Any] | None:
    async with await open_connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(
                """
                select
                  review_id::text as review_id,
                  decision,
                  prompt_tokens,
                  completion_tokens,
                  total_tokens,
                  cost_estimate_usd::text as cost_estimate_usd,
                  provider_usage_json
                from llm_review_log
                where doc_id = %s
                order by created_at desc
                limit 1
                """,
                (doc_id,),
            )
            row = await cursor.fetchone()
    return dict(row) if row else None


async def fetch_llm_review_count(doc_id: str) -> int:
    async with await open_connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(
                """
                select count(*)::int as review_count
                from llm_review_log
                where doc_id = %s
                """,
                (doc_id,),
            )
            row = await cursor.fetchone()
    return int(row["review_count"] or 0) if row else 0


async def fetch_criterion_match_result(doc_id: str, criterion_id: str) -> dict[str, Any] | None:
    async with await open_connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(
                """
                select decision, explain_json
                from criterion_match_results
                where doc_id = %s and criterion_id = %s
                """,
                (doc_id, criterion_id),
            )
            row = await cursor.fetchone()
    return dict(row) if row else None


async def insert_budget_exhaustion_review(
    *,
    doc_id: str,
    criterion_id: str,
    cost_estimate_usd: Decimal,
) -> None:
    async with await open_connection() as connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                await cursor.execute(
                    """
                    insert into llm_review_log (
                      doc_id,
                      scope,
                      target_id,
                      prompt_template_id,
                      prompt_version,
                      llm_model,
                      decision,
                      score,
                      provider_latency_ms,
                      prompt_tokens,
                      completion_tokens,
                      total_tokens,
                      cost_estimate_usd,
                      provider_usage_json,
                      response_json
                    )
                    values (
                      %s,
                      'criterion',
                      %s,
                      null,
                      1,
                      'synthetic-budget-stop-smoke',
                      'approve',
                      1.0,
                      0,
                      0,
                      0,
                      0,
                      %s,
                      %s::jsonb,
                      %s::jsonb
                    )
                    """,
                    (
                        doc_id,
                        criterion_id,
                        str(cost_estimate_usd.quantize(Decimal("0.000001"))),
                        json.dumps({"smoke": "llm-budget-stop-preexisting", "totalTokenCount": 0}),
                        json.dumps({"smoke": "llm-budget-stop-preexisting"}),
                    ),
                )


def verify_system_feed_result_consistency(
    system_feed: dict[str, Any] | None,
    *,
    require_criteria_counts: bool,
) -> None:
    if not system_feed:
        raise RuntimeError("System feed verification failed: result row is missing.")

    total = int(system_feed.get("total_criteria_count") or 0)
    relevant = int(system_feed.get("relevant_criteria_count") or 0)
    irrelevant = int(system_feed.get("irrelevant_criteria_count") or 0)
    pending = int(system_feed.get("pending_llm_criteria_count") or 0)
    decision = str(system_feed.get("decision") or "")
    eligible_for_feed = system_feed.get("eligible_for_feed") is True

    if require_criteria_counts and total < 1:
        raise RuntimeError("System feed verification failed: criteria totals are missing.")

    expected = summarize_system_feed_result(
        total_criteria_count=total,
        relevant_criteria_count=relevant,
        irrelevant_criteria_count=irrelevant,
        pending_llm_criteria_count=pending,
    )
    if decision != str(expected["decision"]):
        raise RuntimeError("System feed verification failed: stored decision drifted from criteria counts.")
    if eligible_for_feed != bool(expected["eligible_for_feed"]):
        raise RuntimeError("System feed verification failed: eligibility drifted from criteria counts.")


async def ensure_normalize_dedup_fixture() -> tuple[str, str]:
    channel_id = stable_uuid("phase2-channel")
    doc_id = stable_uuid("phase2-article")
    raw_payload = {
        "fetcher": "rss",
        "rss": {
            "title": "  Phase 2 <b>Smoke</b> Article  ",
            "description": "Phase 2 <i>summary</i> with &amp; entities.",
            "contentEncoded": "<p>Phase 2 body for normalize and dedup smoke.</p>",
        },
    }

    async with await open_connection() as connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                await cursor.execute(
                    """
                    delete from outbox_events
                    where aggregate_type = 'article'
                      and aggregate_id = %s
                    """,
                    (doc_id,),
                )
                await cursor.execute(
                    """
                    insert into source_channels (
                      channel_id,
                      provider_type,
                      name,
                      fetch_url,
                      language,
                      is_active
                    )
                    values (%s, 'rss', 'Phase 2 Normalize/Dedup Smoke', 'https://example.test/rss-phase2.xml', 'en', true)
                    on conflict (channel_id) do update
                    set
                      name = excluded.name,
                      fetch_url = excluded.fetch_url,
                      language = excluded.language,
                      is_active = true,
                      updated_at = now()
                    """,
                    (channel_id,),
                )
                await cursor.execute(
                    """
                    insert into articles (
                      doc_id,
                      channel_id,
                      source_article_id,
                      url,
                      published_at,
                      title,
                      lead,
                      body,
                      lang,
                      lang_confidence,
                      exact_hash,
                      simhash64,
                      canonical_doc_id,
                      family_id,
                      is_exact_duplicate,
                      is_near_duplicate,
                      processing_state,
                      raw_payload_json,
                      normalized_at,
                      deduped_at,
                      updated_at
                    )
                    values (
                      %s,
                      %s,
                      'phase2-normalize-dedup-smoke',
                      'https://example.test/articles/phase2-normalize-dedup-smoke',
                      now(),
                      '',
                      '',
                      '',
                      'en',
                      0.8,
                      null,
                      null,
                      null,
                      null,
                      false,
                      false,
                      'raw',
                      %s::jsonb,
                      null,
                      null,
                      now()
                    )
                    on conflict (doc_id) do update
                    set
                      title = excluded.title,
                      lead = excluded.lead,
                      body = excluded.body,
                      lang = excluded.lang,
                      lang_confidence = excluded.lang_confidence,
                      exact_hash = null,
                      simhash64 = null,
                      canonical_doc_id = null,
                      family_id = null,
                      is_exact_duplicate = false,
                      is_near_duplicate = false,
                      processing_state = 'raw',
                      raw_payload_json = excluded.raw_payload_json,
                      normalized_at = null,
                      deduped_at = null,
                      updated_at = now()
                    """,
                    (doc_id, channel_id, json.dumps(raw_payload)),
                )
    return (str(doc_id), str(channel_id))


async def fetch_latest_normalized_event_id(doc_id: str) -> str:
    async with await open_connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(
                """
                select event_id::text as event_id
                from outbox_events
                where aggregate_type = 'article'
                  and aggregate_id = %s
                  and event_type = 'article.normalized'
                order by created_at desc
                limit 1
                """,
                (doc_id,),
            )
            event = await cursor.fetchone()

    if not event:
        raise RuntimeError("Normalize smoke verification failed: article.normalized outbox event is missing.")

    return str(event["event_id"])


async def verify_normalize_dedup(doc_id: str, ingest_event_id: str, normalized_event_id: str) -> None:
    async with await open_connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(
                """
                select
                  processing_state,
                  title,
                  lead,
                  body,
                  lang,
                  exact_hash,
                  simhash64,
                  canonical_doc_id::text as canonical_doc_id,
                  family_id::text as family_id,
                  is_exact_duplicate,
                  is_near_duplicate,
                  normalized_at,
                  deduped_at
                from articles
                where doc_id = %s
                """,
                (doc_id,),
            )
            article = await cursor.fetchone()
            await cursor.execute(
                """
                select event_type, status
                from outbox_events
                where aggregate_type = 'article'
                  and aggregate_id = %s
                order by created_at
                """,
                (doc_id,),
            )
            outbox_events = await cursor.fetchall()
            await cursor.execute(
                """
                select consumer_name, event_id::text as event_id
                from inbox_processed_events
                where event_id in (%s, %s)
                order by consumer_name
                """,
                (ingest_event_id, normalized_event_id),
            )
            inbox_rows = await cursor.fetchall()

    if not article:
        raise RuntimeError("Normalize/dedup smoke verification failed: article row is missing.")
    if article["processing_state"] not in {"deduped", "embedded", "clustered", "matched", "notified"}:
        raise RuntimeError(
            "Normalize/dedup smoke verification failed: article did not reach the deduped stage."
        )
    if not article["title"] or "<" in article["title"]:
        raise RuntimeError("Normalize/dedup smoke verification failed: title was not normalized.")
    if not article["lead"] or "&amp;" in article["lead"]:
        raise RuntimeError("Normalize/dedup smoke verification failed: lead was not normalized.")
    if not article["body"] or "<p>" in article["body"]:
        raise RuntimeError("Normalize/dedup smoke verification failed: body was not normalized.")
    if not article["exact_hash"] or article["simhash64"] is None:
        raise RuntimeError("Normalize/dedup smoke verification failed: hash fields are missing.")
    if article["canonical_doc_id"] != doc_id or article["family_id"] != doc_id:
        raise RuntimeError("Normalize/dedup smoke verification failed: canonical/family ids were not resolved to the article itself.")
    if article["is_exact_duplicate"] or article["is_near_duplicate"]:
        raise RuntimeError("Normalize/dedup smoke verification failed: first article should not be marked duplicate.")
    if not article["normalized_at"] or not article["deduped_at"]:
        raise RuntimeError("Normalize/dedup smoke verification failed: lifecycle timestamps are missing.")

    event_statuses = {row["event_type"]: row["status"] for row in outbox_events}
    if event_statuses.get("article.ingest.requested") != "published":
        raise RuntimeError(
            "Normalize/dedup smoke verification failed: article.ingest.requested was not published."
        )
    if event_statuses.get("article.normalized") not in {"pending", "published"}:
        raise RuntimeError(
            "Normalize/dedup smoke verification failed: article.normalized is missing or has an unexpected status."
        )

    actual_inbox_rows = [(row["consumer_name"], row["event_id"]) for row in inbox_rows]
    expected_inbox_rows = [
        ("worker.dedup", normalized_event_id),
        ("worker.normalize", ingest_event_id),
    ]
    if actual_inbox_rows != expected_inbox_rows:
        raise RuntimeError(
            f"Normalize/dedup smoke verification failed: expected inbox rows {expected_inbox_rows}, got {actual_inbox_rows}."
        )


async def verify_embed(doc_id: str) -> None:
    async with await open_connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(
                """
                select processing_state, embedded_at
                from articles
                where doc_id = %s
                """,
                (doc_id,),
            )
            article = await cursor.fetchone()
            await cursor.execute(
                """
                select count(*)::int as active_count
                from article_vector_registry
                where doc_id = %s
                  and is_active = true
                """,
                (doc_id,),
            )
            vector_count = await cursor.fetchone()
            await cursor.execute(
                """
                select count(*)::int as feature_count
                from article_features
                where doc_id = %s
                """,
                (doc_id,),
            )
            feature_count = await cursor.fetchone()
            await cursor.execute(
                """
                select count(*)::int as event_vector_count
                from event_vector_registry
                where entity_type = 'article'
                  and entity_id = %s
                  and vector_type = 'e_event'
                  and is_active = true
                """,
                (doc_id,),
            )
            event_vector_count = await cursor.fetchone()

    if not article or not article["embedded_at"] or article["processing_state"] not in {"embedded", "clustered", "matched", "notified"}:
        raise RuntimeError("Embed smoke verification failed: article is not embedded.")
    if int(vector_count["active_count"]) != 4:
        raise RuntimeError("Embed smoke verification failed: expected 4 active article vectors.")
    if int(feature_count["feature_count"]) != 1:
        raise RuntimeError("Embed smoke verification failed: article_features row is missing.")
    if int(event_vector_count["event_vector_count"]) != 1:
        raise RuntimeError("Embed smoke verification failed: e_event registry row is missing.")


async def verify_interest_compile(interest_id: str) -> None:
    async with await open_connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(
                """
                select compile_status, compiled
                from user_interests
                where interest_id = %s
                """,
                (interest_id,),
            )
            interest = await cursor.fetchone()
            await cursor.execute(
                """
                select compile_status, centroid_embedding_id, compiled_json
                from user_interests_compiled
                where interest_id = %s
                """,
                (interest_id,),
            )
            compiled = await cursor.fetchone()
            await cursor.execute(
                """
                select hnsw_label
                from interest_vector_registry
                where interest_id = %s
                  and vector_type = 'centroid'
                  and is_active = true
                """,
                (interest_id,),
            )
            centroid = await cursor.fetchone()
            await cursor.execute(
                """
                select active_index_path, active_snapshot_path
                from hnsw_registry
                where index_name = 'interest_centroids'
                """,
            )
            registry = await cursor.fetchone()

    if not interest or interest["compile_status"] != "compiled" or not interest["compiled"]:
        raise RuntimeError("Interest compile smoke verification failed: source row is not compiled.")
    if not compiled or compiled["compile_status"] != "compiled" or not compiled["centroid_embedding_id"]:
        raise RuntimeError("Interest compile smoke verification failed: compiled row is missing.")
    if not centroid or centroid["hnsw_label"] is None:
        raise RuntimeError("Interest compile smoke verification failed: centroid label is missing.")
    if not registry or not registry["active_index_path"] or not registry["active_snapshot_path"]:
        raise RuntimeError("Interest compile smoke verification failed: HNSW registry paths are missing.")


async def verify_criterion_compile(criterion_id: str) -> None:
    async with await open_connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(
                """
                select compile_status, compiled
                from criteria
                where criterion_id = %s
                """,
                (criterion_id,),
            )
            criterion = await cursor.fetchone()
            await cursor.execute(
                """
                select compile_status, centroid_embedding_id
                from criteria_compiled
                where criterion_id = %s
                """,
                (criterion_id,),
            )
            compiled = await cursor.fetchone()
            await cursor.execute(
                """
                select count(*)::int as extra_indexes
                from hnsw_registry
                where index_name not in ('interest_centroids', 'event_cluster_centroids')
                """,
            )
            extra_indexes = await cursor.fetchone()

    if not criterion or criterion["compile_status"] != "compiled" or not criterion["compiled"]:
        raise RuntimeError("Criterion compile smoke verification failed: source row is not compiled.")
    if not compiled or compiled["compile_status"] != "compiled" or not compiled["centroid_embedding_id"]:
        raise RuntimeError("Criterion compile smoke verification failed: compiled row is missing.")
    if extra_indexes and int(extra_indexes["extra_indexes"]) != 0:
        raise RuntimeError("Criterion compile smoke verification failed: unexpected HNSW index mutation detected.")


async def verify_cluster_match_notify(doc_id: str) -> None:
    async with await open_connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(
                """
                select processing_state, event_cluster_id::text as event_cluster_id
                from articles
                where doc_id = %s
                """,
                (doc_id,),
            )
            article = await cursor.fetchone()
            await cursor.execute(
                """
                select count(*)::int as cluster_count
                from event_cluster_members
                where doc_id = %s
                """,
                (doc_id,),
            )
            cluster_count = await cursor.fetchone()
            await cursor.execute(
                """
                select count(*)::int as criterion_count
                from criterion_match_results
                where doc_id = %s
                """,
                (doc_id,),
            )
            criterion_count = await cursor.fetchone()
            await cursor.execute(
                """
                select count(*)::int as interest_count
                from interest_match_results
                where doc_id = %s
                """,
                (doc_id,),
            )
            interest_count = await cursor.fetchone()
            await cursor.execute(
                """
                select count(*)::int as notification_count
                from notification_log
                where doc_id = %s
                """,
                (doc_id,),
            )
            notification_count = await cursor.fetchone()
            await cursor.execute(
                """
                select count(*)::int as filter_count
                from interest_filter_results
                where doc_id = %s
                """,
                (doc_id,),
            )
            filter_count = await cursor.fetchone()
            await cursor.execute(
                """
                select count(*)::int as system_filter_count
                from interest_filter_results
                where doc_id = %s
                  and filter_scope = 'system_criterion'
                """,
                (doc_id,),
            )
            system_filter_count = await cursor.fetchone()
            await cursor.execute(
                """
                select count(*)::int as user_filter_count
                from interest_filter_results
                where doc_id = %s
                  and filter_scope = 'user_interest'
                """,
                (doc_id,),
            )
            user_filter_count = await cursor.fetchone()
            await cursor.execute(
                """
                select count(*)::int as story_cluster_count
                from story_cluster_members
                where canonical_document_id = %s
                """,
                (doc_id,),
            )
            story_cluster_count = await cursor.fetchone()
            await cursor.execute(
                """
                select
                  sc.canonical_document_count,
                  sc.source_family_count,
                  sc.verification_state
                from story_clusters sc
                join story_cluster_members scm on scm.story_cluster_id = sc.story_cluster_id
                where scm.canonical_document_id = %s
                limit 1
                """,
                (doc_id,),
            )
            story_cluster = await cursor.fetchone()
            await cursor.execute(
                """
                select
                  technical_filter_state,
                  semantic_decision,
                  verification_target_type,
                  verification_state
                from interest_filter_results
                where doc_id = %s
                  and filter_scope = 'system_criterion'
                order by created_at desc
                limit 1
                """,
                (doc_id,),
            )
            system_filter = await cursor.fetchone()
            await cursor.execute(
                """
                select
                  technical_filter_state,
                  semantic_decision,
                  verification_target_type,
                  verification_state
                from interest_filter_results
                where doc_id = %s
                  and filter_scope = 'user_interest'
                order by created_at desc
                limit 1
                """,
                (doc_id,),
            )
            user_filter = await cursor.fetchone()
            await cursor.execute(
                """
                select verification_state, source_family_count, observation_count
                from verification_results
                where target_type = 'canonical_document'
                  and target_id = %s
                limit 1
                """,
                (doc_id,),
            )
            canonical_verification = await cursor.fetchone()
            await cursor.execute(
                """
                select verification_state, source_family_count, observation_count
                from verification_results
                where target_type = 'story_cluster'
                  and target_id in (
                    select story_cluster_id
                    from story_cluster_members
                    where canonical_document_id = %s
                  )
                limit 1
                """,
                (doc_id,),
            )
            story_verification = await cursor.fetchone()

    system_feed = await fetch_system_feed_result(doc_id)
    final_selection = await fetch_final_selection_result(doc_id)
    if not article or article["processing_state"] not in {"matched", "notified"}:
        raise RuntimeError("Phase 4 smoke verification failed: article did not advance to matched/notified.")
    if int(cluster_count["cluster_count"]) < 1:
        raise RuntimeError("Phase 4 smoke verification failed: event cluster membership is missing.")
    if int(story_cluster_count["story_cluster_count"]) < 1:
        raise RuntimeError("Phase 4 smoke verification failed: canonical story cluster membership is missing.")
    if int(criterion_count["criterion_count"]) < 1:
        raise RuntimeError("Phase 4 smoke verification failed: criterion matches are missing.")
    if int(interest_count["interest_count"]) < 1:
        raise RuntimeError("Phase 4 smoke verification failed: interest matches are missing.")
    if int(filter_count["filter_count"]) < 2:
        raise RuntimeError("Phase 4 smoke verification failed: split interest-filter results are missing.")
    if int(system_filter_count["system_filter_count"]) < 1:
        raise RuntimeError("Phase 4 smoke verification failed: system criterion filter results are missing.")
    if int(user_filter_count["user_filter_count"]) < 1:
        raise RuntimeError("Phase 4 smoke verification failed: user interest filter results are missing.")
    if int(notification_count["notification_count"]) < 1:
        raise RuntimeError("Phase 4 smoke verification failed: notification log is missing.")
    if not story_cluster or int(story_cluster["canonical_document_count"]) < 1:
        raise RuntimeError("Phase 4 smoke verification failed: story cluster aggregate row is missing.")
    if not system_filter or str(system_filter["technical_filter_state"]) != "passed":
        raise RuntimeError("Phase 4 smoke verification failed: system filter technical state drifted.")
    if str(system_filter["semantic_decision"]) != "match":
        raise RuntimeError("Phase 4 smoke verification failed: system filter semantic decision drifted.")
    if str(system_filter["verification_target_type"]) != "canonical_document":
        raise RuntimeError("Phase 4 smoke verification failed: system filter verification target drifted.")
    if str(system_filter["verification_state"]) != "weak":
        raise RuntimeError("Phase 4 smoke verification failed: system filter verification state drifted.")
    if not user_filter or str(user_filter["technical_filter_state"]) != "passed":
        raise RuntimeError("Phase 4 smoke verification failed: user filter technical state drifted.")
    if str(user_filter["semantic_decision"]) != "match":
        raise RuntimeError("Phase 4 smoke verification failed: user filter semantic decision drifted.")
    if str(user_filter["verification_target_type"]) != "story_cluster":
        raise RuntimeError("Phase 4 smoke verification failed: user filter verification target drifted.")
    if str(user_filter["verification_state"]) != "weak":
        raise RuntimeError("Phase 4 smoke verification failed: user filter verification state drifted.")
    if str(story_cluster["verification_state"]) != "weak":
        raise RuntimeError("Phase 4 smoke verification failed: unexpected story-cluster verification state.")
    if int(story_cluster["source_family_count"]) != 1:
        raise RuntimeError("Phase 4 smoke verification failed: story-cluster source-family count drifted.")
    if not canonical_verification or str(canonical_verification["verification_state"]) != "weak":
        raise RuntimeError("Phase 4 smoke verification failed: canonical-document verification is missing.")
    if int(canonical_verification["source_family_count"]) != 1 or int(canonical_verification["observation_count"]) != 1:
        raise RuntimeError("Phase 4 smoke verification failed: canonical-document verification counts drifted.")
    if not story_verification or str(story_verification["verification_state"]) != "weak":
        raise RuntimeError("Phase 4 smoke verification failed: story-cluster verification is missing.")
    if int(story_verification["source_family_count"]) != 1 or int(story_verification["observation_count"]) != 1:
        raise RuntimeError("Phase 4 smoke verification failed: story-cluster verification counts drifted.")
    if not final_selection:
        raise RuntimeError("Phase 4 smoke verification failed: final-selection row is missing.")
    if str(final_selection.get("final_decision") or "") != "selected":
        raise RuntimeError("Phase 4 smoke verification failed: final selection did not become selected.")
    if final_selection.get("is_selected") is not True:
        raise RuntimeError("Phase 4 smoke verification failed: final selection eligibility drifted.")
    if str(final_selection.get("compat_system_feed_decision") or "") != "eligible":
        raise RuntimeError("Phase 4 smoke verification failed: final selection compatibility projection drifted.")
    if str(final_selection.get("verification_target_type") or "") != "story_cluster":
        raise RuntimeError("Phase 4 smoke verification failed: final selection verification target drifted.")
    if str(final_selection.get("verification_state") or "") != "weak":
        raise RuntimeError("Phase 4 smoke verification failed: final selection verification state drifted.")
    if int(final_selection.get("matched_filter_count") or 0) < 1:
        raise RuntimeError("Phase 4 smoke verification failed: final selection matched-count drifted.")
    try:
        verify_system_feed_result_consistency(system_feed, require_criteria_counts=True)
    except RuntimeError as error:
        raise RuntimeError(f"Phase 4 smoke verification failed: {error}") from error
    if str((system_feed or {}).get("decision") or "") != "eligible":
        raise RuntimeError("Phase 4 smoke verification failed: system feed did not become eligible.")


async def verify_reindex_backfill(
    doc_id: str,
    *,
    reindex_job_id: str,
    expected_criterion_count: int,
    expected_interest_count: int,
    expected_notification_count: int,
    expected_enrichment_state: str | None = None,
) -> None:
    async with await open_connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(
                """
                select
                  enrichment_state,
                  full_content_html,
                  has_media
                from articles
                where doc_id = %s
                """,
                (doc_id,),
            )
            article = await cursor.fetchone()
            await cursor.execute(
                """
                select count(*)::int as criterion_count
                from criterion_match_results
                where doc_id = %s
                """,
                (doc_id,),
            )
            criterion_count = await cursor.fetchone()
            await cursor.execute(
                """
                select count(*)::int as interest_count
                from interest_match_results
                where doc_id = %s
                """,
                (doc_id,),
            )
            interest_count = await cursor.fetchone()
            await cursor.execute(
                """
                select status, options_json
                from reindex_jobs
                where reindex_job_id = %s
                """,
                (reindex_job_id,),
            )
            reindex_job = await cursor.fetchone()
            await cursor.execute(
                """
                select count(*)::int as target_count
                from reindex_job_targets
                where reindex_job_id = %s
                """,
                (reindex_job_id,),
            )
            target_count = await cursor.fetchone()
            await cursor.execute(
                """
                select count(*)::int as filter_count
                from interest_filter_results
                where doc_id = %s
                """,
                (doc_id,),
            )
            filter_count = await cursor.fetchone()
            await cursor.execute(
                """
                select count(*)::int as system_filter_count
                from interest_filter_results
                where doc_id = %s
                  and filter_scope = 'system_criterion'
                """,
                (doc_id,),
            )
            system_filter_count = await cursor.fetchone()
            await cursor.execute(
                """
                select count(*)::int as user_filter_count
                from interest_filter_results
                where doc_id = %s
                  and filter_scope = 'user_interest'
                """,
                (doc_id,),
            )
            user_filter_count = await cursor.fetchone()
            await cursor.execute(
                """
                select count(*)::int as story_cluster_count
                from story_cluster_members
                where canonical_document_id = %s
                """,
                (doc_id,),
            )
            story_cluster_count = await cursor.fetchone()
            await cursor.execute(
                """
                select verification_state, source_family_count, observation_count
                from verification_results
                where target_type = 'canonical_document'
                  and target_id = %s
                limit 1
                """,
                (doc_id,),
            )
            canonical_verification = await cursor.fetchone()
            await cursor.execute(
                """
                select verification_state, source_family_count, observation_count
                from verification_results
                where target_type = 'story_cluster'
                  and target_id in (
                    select story_cluster_id
                    from story_cluster_members
                    where canonical_document_id = %s
                  )
                limit 1
                """,
                (doc_id,),
            )
            story_verification = await cursor.fetchone()

    actual_notification_count = await fetch_notification_count(doc_id)
    system_feed = await fetch_system_feed_result(doc_id)
    final_selection = await fetch_final_selection_result(doc_id)
    options_json = dict(reindex_job["options_json"] or {}) if reindex_job else {}
    progress = dict(options_json.get("progress") or {})
    backfill_result = dict(options_json.get("backfill") or {})

    if int(criterion_count["criterion_count"]) != expected_criterion_count:
        raise RuntimeError("Reindex backfill smoke verification failed: criterion match cardinality changed.")
    if int(interest_count["interest_count"]) != expected_interest_count:
        raise RuntimeError("Reindex backfill smoke verification failed: interest match cardinality changed.")
    if actual_notification_count != expected_notification_count:
        raise RuntimeError("Reindex backfill smoke verification failed: retro notifications were sent.")
    if not reindex_job or reindex_job["status"] != "completed":
        raise RuntimeError("Reindex backfill smoke verification failed: reindex job did not complete.")
    if int(target_count["target_count"]) != 1:
        raise RuntimeError("Reindex backfill smoke verification failed: target snapshot row count drifted.")
    if int(progress.get("processedArticles") or -1) != 1 or int(progress.get("totalArticles") or -1) != 1:
        raise RuntimeError("Reindex backfill smoke verification failed: stable progress totals were not recorded.")
    if expected_enrichment_state is not None:
        if not article or str(article.get("enrichment_state") or "") != expected_enrichment_state:
            raise RuntimeError("Reindex backfill smoke verification failed: enrichment state did not update.")
        if str(expected_enrichment_state) == "skipped":
            if not str(article.get("full_content_html") or "").strip():
                raise RuntimeError(
                    "Reindex backfill smoke verification failed: skipped enrichment did not persist full content HTML."
                )
            if not bool(article.get("has_media")):
                raise RuntimeError(
                    "Reindex backfill smoke verification failed: skipped enrichment did not persist feed media."
                )
        if int(backfill_result.get("enrichmentProcessed") or -1) != 1:
            raise RuntimeError("Reindex backfill smoke verification failed: enrichment replay count was not recorded.")
        if bool(backfill_result.get("includeEnrichment")) is not True:
            raise RuntimeError("Reindex backfill smoke verification failed: includeEnrichment result flag was lost.")
        if expected_enrichment_state == "skipped" and int(backfill_result.get("enrichmentSkipped") or -1) != 1:
            raise RuntimeError("Reindex backfill smoke verification failed: skipped enrichment count was not recorded.")
    if int(filter_count["filter_count"] or 0) < 2:
        raise RuntimeError("Reindex backfill smoke verification failed: split interest-filter rows were not rebuilt.")
    if int(system_filter_count["system_filter_count"] or 0) < 1:
        raise RuntimeError(
            "Reindex backfill smoke verification failed: system-criterion filter rows were not rebuilt."
        )
    if int(user_filter_count["user_filter_count"] or 0) < 1:
        raise RuntimeError(
            "Reindex backfill smoke verification failed: user-interest filter rows were not rebuilt."
        )
    if int(story_cluster_count["story_cluster_count"] or 0) < 1:
        raise RuntimeError(
            "Reindex backfill smoke verification failed: story-cluster membership was not rebuilt."
        )
    if not canonical_verification or str(canonical_verification["verification_state"]) != "weak":
        raise RuntimeError(
            "Reindex backfill smoke verification failed: canonical-document verification was not rebuilt."
        )
    if int(canonical_verification["source_family_count"] or 0) != 1 or int(
        canonical_verification["observation_count"] or 0
    ) != 1:
        raise RuntimeError(
            "Reindex backfill smoke verification failed: canonical-document verification counts drifted."
        )
    if not story_verification or str(story_verification["verification_state"]) != "weak":
        raise RuntimeError(
            "Reindex backfill smoke verification failed: story-cluster verification was not rebuilt."
        )
    if int(story_verification["source_family_count"] or 0) != 1 or int(
        story_verification["observation_count"] or 0
    ) != 1:
        raise RuntimeError(
            "Reindex backfill smoke verification failed: story-cluster verification counts drifted."
        )
    if not final_selection:
        raise RuntimeError("Reindex backfill smoke verification failed: final-selection row was not rebuilt.")
    if str(final_selection.get("final_decision") or "") != "selected":
        raise RuntimeError("Reindex backfill smoke verification failed: final selection did not remain selected.")
    if final_selection.get("is_selected") is not True:
        raise RuntimeError(
            "Reindex backfill smoke verification failed: final selection selected flag drifted."
        )
    if str(final_selection.get("compat_system_feed_decision") or "") != "eligible":
        raise RuntimeError(
            "Reindex backfill smoke verification failed: final-selection compatibility projection drifted."
        )
    if str(final_selection.get("verification_target_type") or "") != "story_cluster":
        raise RuntimeError(
            "Reindex backfill smoke verification failed: final-selection verification target drifted."
        )
    if str(final_selection.get("verification_state") or "") != "weak":
        raise RuntimeError(
            "Reindex backfill smoke verification failed: final-selection verification state drifted."
        )
    try:
        verify_system_feed_result_consistency(system_feed, require_criteria_counts=True)
    except RuntimeError as error:
        raise RuntimeError(f"Reindex backfill smoke verification failed: {error}") from error
    if str((system_feed or {}).get("decision") or "") != "eligible":
        raise RuntimeError(
            "Reindex backfill smoke verification failed: system feed did not remain eligible."
        )


async def run_embed_smoke() -> dict[str, Any]:
    doc_id = await ensure_embed_fixture()
    event_id = str(uuid.uuid4())
    await ensure_outbox_event(
        event_id=event_id,
        event_type="article.normalized",
        aggregate_type="article",
        aggregate_id=doc_id,
        payload={"docId": doc_id, "version": 1},
    )
    result = await process_embed(
        FakeJob({"eventId": event_id, "docId": doc_id, "version": 1}),
        "",
    )
    await verify_embed(doc_id)
    return result


async def run_normalize_dedup_smoke() -> dict[str, Any]:
    doc_id, _channel_id = await ensure_normalize_dedup_fixture()
    ingest_event_id = str(uuid.uuid4())
    await ensure_outbox_event(
        event_id=ingest_event_id,
        event_type="article.ingest.requested",
        aggregate_type="article",
        aggregate_id=doc_id,
        payload={"docId": doc_id, "version": 1},
    )
    normalize_result = await process_normalize(
        FakeJob({"eventId": ingest_event_id, "docId": doc_id, "version": 1}),
        "",
    )
    normalized_event_id = await fetch_latest_normalized_event_id(doc_id)
    dedup_result = await process_dedup(
        FakeJob({"eventId": normalized_event_id, "docId": doc_id, "version": 1}),
        "",
    )
    await verify_normalize_dedup(doc_id, ingest_event_id, normalized_event_id)
    return {
        "status": "deduped",
        "docId": doc_id,
        "normalize": normalize_result,
        "dedup": dedup_result,
    }


async def run_interest_compile_smoke() -> dict[str, Any]:
    interest_id = await ensure_interest_fixture()
    event_id = str(uuid.uuid4())
    await ensure_outbox_event(
        event_id=event_id,
        event_type="interest.compile.requested",
        aggregate_type="interest",
        aggregate_id=interest_id,
        payload={"interestId": interest_id, "version": 2},
    )
    result = await process_interest_compile(
        FakeJob(
            {
                "eventId": event_id,
                "interestId": interest_id,
                "version": 2,
                "skipAutoRepair": True,
            }
        ),
        "",
    )
    await verify_interest_compile(interest_id)
    return result


async def run_criterion_compile_smoke() -> dict[str, Any]:
    criterion_id = await ensure_criterion_fixture()
    event_id = str(uuid.uuid4())
    await ensure_outbox_event(
        event_id=event_id,
        event_type="criterion.compile.requested",
        aggregate_type="criterion",
        aggregate_id=criterion_id,
        payload={"criterionId": criterion_id, "version": 3},
    )
    result = await process_criterion_compile(
        FakeJob({"eventId": event_id, "criterionId": criterion_id, "version": 3}),
        "",
    )
    await verify_criterion_compile(criterion_id)
    return result


async def run_cluster_match_notify_smoke() -> dict[str, Any]:
    doc_id = await ensure_embed_fixture()
    interest_id = await ensure_interest_fixture()
    criterion_id = await ensure_criterion_fixture()
    await ensure_notification_channel_fixture()

    interest_event_id = str(uuid.uuid4())
    criterion_event_id = str(uuid.uuid4())
    normalized_event_id = str(uuid.uuid4())
    embedded_event_id = str(uuid.uuid4())
    await ensure_outbox_event(
        event_id=interest_event_id,
        event_type="interest.compile.requested",
        aggregate_type="interest",
        aggregate_id=interest_id,
        payload={"interestId": interest_id, "version": 2},
    )
    await ensure_outbox_event(
        event_id=criterion_event_id,
        event_type="criterion.compile.requested",
        aggregate_type="criterion",
        aggregate_id=criterion_id,
        payload={"criterionId": criterion_id, "version": 3},
    )
    await process_interest_compile(
        FakeJob(
            {
                "eventId": interest_event_id,
                "interestId": interest_id,
                "version": 2,
                "skipAutoRepair": True,
            }
        ),
        "",
    )
    await process_criterion_compile(
        FakeJob({"eventId": criterion_event_id, "criterionId": criterion_id, "version": 3}),
        "",
    )

    await ensure_outbox_event(
        event_id=normalized_event_id,
        event_type="article.normalized",
        aggregate_type="article",
        aggregate_id=doc_id,
        payload={"docId": doc_id, "version": 1},
    )
    embed_result = await process_embed(
        FakeJob({"eventId": normalized_event_id, "docId": doc_id, "version": 1}),
        "",
    )
    await ensure_outbox_event(
        event_id=embedded_event_id,
        event_type="article.embedded",
        aggregate_type="article",
        aggregate_id=doc_id,
        payload={"docId": doc_id, "version": 1},
    )
    criterion_result = await process_match_criteria(
        FakeJob({"eventId": embedded_event_id, "docId": doc_id, "version": 1}),
        "",
    )
    criteria_matched_event_id = await fetch_latest_article_event_id(
        doc_id,
        "article.criteria.matched",
    )
    cluster_result = await process_cluster(
        FakeJob({"eventId": criteria_matched_event_id, "docId": doc_id, "version": 1}),
        "",
    )
    clustered_event_id = await fetch_latest_article_event_id(
        doc_id,
        "article.clustered",
    )
    interest_result = await process_match_interests(
        FakeJob({"eventId": clustered_event_id, "docId": doc_id, "version": 1}),
        "",
    )
    matched_interest_event_id = await fetch_latest_article_event_id(
        doc_id,
        "article.interests.matched",
    )
    with patched_smoke_delivery():
        notify_result = await process_notify(
            FakeJob({"eventId": matched_interest_event_id, "docId": doc_id, "version": 1}),
            "",
        )
    await verify_cluster_match_notify(doc_id)
    return {
        "status": "phase4-ok",
        "docId": doc_id,
        "embed": embed_result,
        "cluster": cluster_result,
        "criteria": criterion_result,
        "interests": interest_result,
        "notify": notify_result,
    }


async def run_reindex_backfill_smoke() -> dict[str, Any]:
    doc_id = await ensure_embed_fixture()
    interest_id = await ensure_interest_fixture()
    criterion_id = await ensure_criterion_fixture()
    await ensure_notification_channel_fixture()

    interest_event_id = str(uuid.uuid4())
    criterion_event_id = str(uuid.uuid4())
    normalized_event_id = str(uuid.uuid4())
    embedded_event_id = str(uuid.uuid4())
    reindex_event_id = str(uuid.uuid4())
    reindex_job_id = str(stable_uuid("reindex-backfill-job"))

    await ensure_outbox_event(
        event_id=interest_event_id,
        event_type="interest.compile.requested",
        aggregate_type="interest",
        aggregate_id=interest_id,
        payload={"interestId": interest_id, "version": 2},
    )
    await ensure_outbox_event(
        event_id=criterion_event_id,
        event_type="criterion.compile.requested",
        aggregate_type="criterion",
        aggregate_id=criterion_id,
        payload={"criterionId": criterion_id, "version": 3},
    )
    await process_interest_compile(
        FakeJob(
            {
                "eventId": interest_event_id,
                "interestId": interest_id,
                "version": 2,
                "skipAutoRepair": True,
            }
        ),
        "",
    )
    await process_criterion_compile(
        FakeJob({"eventId": criterion_event_id, "criterionId": criterion_id, "version": 3}),
        "",
    )
    await ensure_outbox_event(
        event_id=normalized_event_id,
        event_type="article.normalized",
        aggregate_type="article",
        aggregate_id=doc_id,
        payload={"docId": doc_id, "version": 1},
    )
    await process_embed(
        FakeJob({"eventId": normalized_event_id, "docId": doc_id, "version": 1}),
        "",
    )
    await ensure_outbox_event(
        event_id=embedded_event_id,
        event_type="article.embedded",
        aggregate_type="article",
        aggregate_id=doc_id,
        payload={"docId": doc_id, "version": 1},
    )
    await process_match_criteria(
        FakeJob({"eventId": embedded_event_id, "docId": doc_id, "version": 1}),
        "",
    )
    criteria_matched_event_id = await fetch_latest_article_event_id(
        doc_id,
        "article.criteria.matched",
    )
    await process_cluster(
        FakeJob({"eventId": criteria_matched_event_id, "docId": doc_id, "version": 1}),
        "",
    )
    clustered_event_id = await fetch_latest_article_event_id(
        doc_id,
        "article.clustered",
    )
    await process_match_interests(
        FakeJob({"eventId": clustered_event_id, "docId": doc_id, "version": 1}),
        "",
    )
    matched_interest_event_id = await fetch_latest_article_event_id(
        doc_id,
        "article.interests.matched",
    )
    with patched_smoke_delivery():
        await process_notify(
            FakeJob({"eventId": matched_interest_event_id, "docId": doc_id, "version": 1}),
            "",
        )
    await verify_cluster_match_notify(doc_id)
    criterion_count_before, interest_count_before = await fetch_match_counts(doc_id)
    notification_count_before = await fetch_notification_count(doc_id)
    await clear_zero_shot_derived_state_for_doc(doc_id)
    await ensure_reindex_job_fixture(reindex_job_id, doc_id)
    await ensure_outbox_event(
        event_id=reindex_event_id,
        event_type="reindex.requested",
        aggregate_type="reindex_job",
        aggregate_id=reindex_job_id,
        payload={"reindexJobId": reindex_job_id, "indexName": "interest_centroids", "version": 1},
    )
    reindex_result = await process_reindex(
        FakeJob(
            {
                "eventId": reindex_event_id,
                "reindexJobId": reindex_job_id,
                "indexName": "interest_centroids",
            }
        ),
        "",
    )
    backfill_result = dict(reindex_result.get("backfill") or {})
    if int(backfill_result.get("interestLlmReviews") or 0) != 0:
        raise RuntimeError(
            "Reindex backfill smoke verification failed: interest-scope LLM review was unexpectedly replayed."
        )
    await verify_reindex_backfill(
        doc_id,
        reindex_job_id=reindex_job_id,
        expected_criterion_count=criterion_count_before,
        expected_interest_count=interest_count_before,
        expected_notification_count=notification_count_before,
        expected_enrichment_state="skipped",
    )
    return {
        "status": "reindex-backfill-ok",
        "docId": doc_id,
        "reindex": reindex_result,
    }


async def run_llm_cost_proof_smoke() -> dict[str, Any]:
    channel_id, doc_id, criterion_id = await ensure_llm_cost_review_fixture()
    event_id = str(uuid.uuid4())
    fake_payload = {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {
                            "text": '{"decision":"approve","score":0.91,"reason":"synthetic provider usage proof"}'
                        }
                    ]
                }
            }
        ],
        "usageMetadata": {
            "promptTokenCount": 200,
            "candidatesTokenCount": 100,
            "totalTokenCount": 300,
        },
    }

    try:
        await ensure_outbox_event(
            event_id=event_id,
            event_type=LLM_REVIEW_REQUESTED_EVENT,
            aggregate_type="criterion",
            aggregate_id=criterion_id,
            payload={
                "docId": doc_id,
                "scope": "criterion",
                "targetId": criterion_id,
                "version": 1,
            },
        )
        with fake_gemini_server(fake_payload) as (base_url, request_paths):
            with temporary_environment(
                {
                    "GEMINI_API_KEY": "local-proof-key",
                    "GEMINI_MODEL": "gemini-2.0-flash",
                    "GEMINI_BASE_URL": base_url,
                    "LLM_INPUT_COST_PER_MILLION_USD": "0.10",
                    "LLM_OUTPUT_COST_PER_MILLION_USD": "0.40",
                }
            ):
                result = await process_llm_review(
                    FakeJob(
                        {
                            "eventId": event_id,
                            "docId": doc_id,
                            "scope": "criterion",
                            "targetId": criterion_id,
                        }
                    ),
                    "",
                )

        review_row = await fetch_latest_llm_review(doc_id)
        if review_row is None:
            raise RuntimeError("LLM cost proof smoke failed: llm_review_log row was not written.")
        if int(review_row.get("prompt_tokens") or 0) != 200:
            raise RuntimeError("LLM cost proof smoke failed: prompt_tokens did not match provider usage.")
        if int(review_row.get("completion_tokens") or 0) != 100:
            raise RuntimeError("LLM cost proof smoke failed: completion_tokens did not match provider usage.")
        if int(review_row.get("total_tokens") or 0) != 300:
            raise RuntimeError("LLM cost proof smoke failed: total_tokens did not match provider usage.")

        cost_text = str(review_row.get("cost_estimate_usd") or "").strip()
        if Decimal(cost_text or "0").quantize(Decimal("0.000001")) != Decimal("0.000060"):
            raise RuntimeError("LLM cost proof smoke failed: cost_estimate_usd did not match the expected tariff.")

        provider_usage = review_row.get("provider_usage_json")
        if not isinstance(provider_usage, dict):
            raise RuntimeError("LLM cost proof smoke failed: provider_usage_json is not a JSON object.")
        usage_metadata = provider_usage.get("usageMetadata")
        if not isinstance(usage_metadata, dict) or int(usage_metadata.get("totalTokenCount") or 0) != 300:
            raise RuntimeError(
                "LLM cost proof smoke failed: provider_usage_json.usageMetadata did not preserve provider totals."
            )
        if provider_usage.get("priceCardSource") != "env_override":
            raise RuntimeError("LLM cost proof smoke failed: priceCardSource did not reflect the env override path.")
        if len(request_paths) != 1:
            raise RuntimeError("LLM cost proof smoke failed: fake Gemini endpoint was not called exactly once.")

        system_feed = await fetch_system_feed_result(doc_id)
        verify_system_feed_result_consistency(system_feed, require_criteria_counts=True)

        return {
            "status": "llm-cost-proof-ok",
            "docId": doc_id,
            "criterionId": criterion_id,
            "reviewId": review_row["review_id"],
            "costEstimateUsd": cost_text,
            "providerPath": request_paths[0],
            "result": result,
        }
    finally:
        await cleanup_llm_cost_review_fixture(
            channel_id=channel_id,
            doc_id=doc_id,
            criterion_id=criterion_id,
            event_id=event_id,
        )


async def run_llm_budget_stop_smoke() -> dict[str, Any]:
    fake_payload = {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {
                            "text": '{"decision":"approve","score":0.91,"reason":"provider should not be called in budget smoke"}'
                        }
                    ]
                }
            }
        ],
        "usageMetadata": {
            "promptTokenCount": 200,
            "candidatesTokenCount": 100,
            "totalTokenCount": 300,
        },
    }
    scenarios: list[dict[str, Any]] = []

    for accept_gray_zone in (False, True):
        channel_id, doc_id, criterion_id = await ensure_llm_cost_review_fixture()
        event_id = str(uuid.uuid4())
        expected_policy = "accept_gray_zone" if accept_gray_zone else "reject_gray_zone"
        expected_provider_decision = "approve" if accept_gray_zone else "reject"
        expected_criterion_decision = "relevant" if accept_gray_zone else "irrelevant"
        expected_system_decision = "eligible" if accept_gray_zone else "filtered_out"

        try:
            await insert_budget_exhaustion_review(
                doc_id=doc_id,
                criterion_id=criterion_id,
                cost_estimate_usd=Decimal("5.000000"),
            )
            review_count_before = await fetch_llm_review_count(doc_id)
            await ensure_outbox_event(
                event_id=event_id,
                event_type=LLM_REVIEW_REQUESTED_EVENT,
                aggregate_type="criterion",
                aggregate_id=criterion_id,
                payload={
                    "docId": doc_id,
                    "scope": "criterion",
                    "targetId": criterion_id,
                    "version": 1,
                },
            )

            with fake_gemini_server(fake_payload) as (base_url, request_paths):
                with temporary_environment(
                    {
                        "GEMINI_API_KEY": "local-budget-stop-proof-key",
                        "GEMINI_MODEL": "gemini-2.0-flash",
                        "GEMINI_BASE_URL": base_url,
                        "LLM_REVIEW_ENABLED": "1",
                        "LLM_REVIEW_MONTHLY_BUDGET_CENTS": "100",
                        "LLM_REVIEW_BUDGET_EXHAUST_ACCEPT_GRAY_ZONE": "1"
                        if accept_gray_zone
                        else "0",
                    }
                ):
                    result = await process_llm_review(
                        FakeJob(
                            {
                                "eventId": event_id,
                                "docId": doc_id,
                                "scope": "criterion",
                                "targetId": criterion_id,
                            }
                        ),
                        "",
                    )

            review_count_after = await fetch_llm_review_count(doc_id)
            if review_count_after != review_count_before:
                raise RuntimeError(
                    "LLM budget stop smoke failed: runtime gate wrote a new llm_review_log row."
                )
            if request_paths:
                raise RuntimeError(
                    "LLM budget stop smoke failed: fake Gemini endpoint should not be called after hard stop."
                )
            if result.get("status") != "review-skipped-runtime-policy":
                raise RuntimeError(
                    "LLM budget stop smoke failed: queued review was not short-circuited by runtime policy."
                )
            if str(result.get("decision") or "") != expected_provider_decision:
                raise RuntimeError(
                    "LLM budget stop smoke failed: runtime policy returned an unexpected provider decision."
                )
            if str(result.get("runtimePolicyReason") or "") != "monthly_budget_exhausted":
                raise RuntimeError(
                    "LLM budget stop smoke failed: runtime policy reason did not report exhausted budget."
                )

            criterion_match = await fetch_criterion_match_result(doc_id, criterion_id)
            if criterion_match is None:
                raise RuntimeError(
                    "LLM budget stop smoke failed: criterion_match_results row is missing after runtime resolution."
                )
            if str(criterion_match.get("decision") or "") != expected_criterion_decision:
                raise RuntimeError(
                    "LLM budget stop smoke failed: gray-zone criterion did not resolve to the expected final decision."
                )
            criterion_explain = criterion_match.get("explain_json")
            if not isinstance(criterion_explain, dict):
                raise RuntimeError(
                    "LLM budget stop smoke failed: criterion explain_json did not stay structured."
                )
            llm_budget_gate = criterion_explain.get("llmBudgetGate")
            if not isinstance(llm_budget_gate, dict):
                raise RuntimeError(
                    "LLM budget stop smoke failed: llmBudgetGate explain block is missing on the criterion row."
                )
            if str(llm_budget_gate.get("reason") or "") != "monthly_budget_exhausted":
                raise RuntimeError(
                    "LLM budget stop smoke failed: criterion explain block did not record the hard-stop reason."
                )
            if str(llm_budget_gate.get("policy") or "") != expected_policy:
                raise RuntimeError(
                    "LLM budget stop smoke failed: criterion explain block did not preserve the configured policy."
                )
            if int(llm_budget_gate.get("budgetCents") or 0) != 100:
                raise RuntimeError(
                    "LLM budget stop smoke failed: criterion explain block did not preserve the configured budget."
                )

            system_feed = await fetch_system_feed_result(doc_id)
            verify_system_feed_result_consistency(system_feed, require_criteria_counts=True)
            if str((system_feed or {}).get("decision") or "") != expected_system_decision:
                raise RuntimeError(
                    "LLM budget stop smoke failed: system feed decision did not match the configured runtime policy."
                )
            if int((system_feed or {}).get("pending_llm_criteria_count") or 0) != 0:
                raise RuntimeError(
                    "LLM budget stop smoke failed: system feed still reports pending_llm after runtime resolution."
                )

            scenarios.append(
                {
                    "policy": expected_policy,
                    "docId": doc_id,
                    "criterionId": criterion_id,
                    "reviewCount": review_count_after,
                    "systemFeedDecision": expected_system_decision,
                    "result": result,
                }
            )
        finally:
            await cleanup_llm_cost_review_fixture(
                channel_id=channel_id,
                doc_id=doc_id,
                criterion_id=criterion_id,
                event_id=event_id,
            )

    return {
        "status": "llm-budget-stop-ok",
        "scenarios": scenarios,
    }


async def run_discovery_enabled_smoke() -> dict[str, Any]:
    fake_payload = {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {
                            "text": '[{"source_url":"https://news.example.com/eu-ai","verdict":"approve","relevance":0.93,"reasoning":"synthetic discovery smoke"}]'
                        }
                    ]
                }
            }
        ],
        "usageMetadata": {
            "promptTokenCount": 240,
            "candidatesTokenCount": 80,
            "totalTokenCount": 320,
        },
    }
    discovered_model = os.getenv("DISCOVERY_GEMINI_MODEL") or os.getenv("GEMINI_MODEL") or "gemini-2.0-flash"
    discovered_base_url = os.getenv("DISCOVERY_GEMINI_BASE_URL") or os.getenv("GEMINI_BASE_URL") or "https://generativelanguage.googleapis.com/v1beta"
    discovered_input_cost = os.getenv("DISCOVERY_LLM_INPUT_COST_PER_MILLION_USD") or os.getenv(
        "LLM_INPUT_COST_PER_MILLION_USD"
    ) or "0.10"
    discovered_output_cost = os.getenv("DISCOVERY_LLM_OUTPUT_COST_PER_MILLION_USD") or os.getenv(
        "LLM_OUTPUT_COST_PER_MILLION_USD"
    ) or "0.40"
    adaptive_fixture: AdaptiveDiscoverySmokeFixture | None = None

    with fake_gemini_server(fake_payload) as (base_url, request_paths):
        with fake_ddgs_client() as ddgs_calls:
            with temporary_environment(
                {
                    "DISCOVERY_ENABLED": "1",
                    "DISCOVERY_SEARCH_PROVIDER": "ddgs",
                    "DISCOVERY_DDGS_BACKEND": "auto",
                    "DISCOVERY_DDGS_REGION": "us-en",
                    "DISCOVERY_DDGS_SAFESEARCH": "moderate",
                    "DISCOVERY_GEMINI_API_KEY": "local-discovery-proof-key",
                    "DISCOVERY_GEMINI_MODEL": discovered_model,
                    "DISCOVERY_GEMINI_BASE_URL": base_url,
                    "DISCOVERY_LLM_INPUT_COST_PER_MILLION_USD": discovered_input_cost,
                    "DISCOVERY_LLM_OUTPUT_COST_PER_MILLION_USD": discovered_output_cost,
                    "DISCOVERY_MONTHLY_BUDGET_CENTS": "500",
                }
            ):
                try:
                    if not discovery_enabled():
                        raise RuntimeError("Discovery enabled smoke failed: DISCOVERY_ENABLED was not honored.")

                    configure_discovery_runtime(build_live_discovery_runtime())
                    runtime = get_discovery_runtime()
                    settings = load_discovery_settings()

                    if runtime.web_search.__class__.__name__ != "DdgsWebSearchAdapter":
                        raise RuntimeError("Discovery enabled smoke failed: live DDGS adapter was not configured.")
                    if runtime.llm_analyzer.__class__.__name__ != "GeminiLlmAnalyzerAdapter":
                        raise RuntimeError("Discovery enabled smoke failed: live Gemini analyzer was not configured.")
                    if settings.search_provider != "ddgs":
                        raise RuntimeError("Discovery enabled smoke failed: discovery settings did not resolve DDGS.")
                    if settings.monthly_budget_cents != 500:
                        raise RuntimeError("Discovery enabled smoke failed: monthly quota did not resolve to $5.00.")

                    search_result = await WebSearchPlugin().execute(
                        options={
                            "query": "EU AI news",
                            "count": 1,
                            "type": "news",
                            "time_range": "day",
                        },
                        context={},
                    )
                    if search_result["search_meta"].get("provider") != "ddgs":
                        raise RuntimeError("Discovery enabled smoke failed: search meta did not report DDGS.")
                    if search_result["search_meta"].get("result_type") != "news":
                        raise RuntimeError("Discovery enabled smoke failed: search meta did not preserve result type.")
                    if len(search_result["search_results"]) != 1:
                        raise RuntimeError("Discovery enabled smoke failed: expected one normalized DDGS result.")
                    if len(ddgs_calls) != 1 or ddgs_calls[0][0] != "news":
                        raise RuntimeError("Discovery enabled smoke failed: fake DDGS news search was not called once.")

                    llm_result = await LlmAnalyzerPlugin().execute(
                        options={
                            "task": "discovery_source_evaluation",
                            "payload": search_result["search_results"],
                            "output_field": "analysis",
                        },
                        context={},
                    )
                    llm_meta = llm_result["analysis_meta"]
                    if llm_meta.get("provider") != "gemini":
                        raise RuntimeError("Discovery enabled smoke failed: LLM meta did not report Gemini.")
                    if int(llm_meta.get("request_count") or 0) != 1:
                        raise RuntimeError("Discovery enabled smoke failed: discovery Gemini was not called exactly once.")
                    if Decimal(str(llm_meta.get("cost_usd") or "0")).quantize(Decimal("0.000001")) <= Decimal("0"):
                        raise RuntimeError("Discovery enabled smoke failed: LLM cost metadata was not recorded.")
                    if len(request_paths) != 1:
                        raise RuntimeError("Discovery enabled smoke failed: fake discovery Gemini endpoint was not called once.")

                    adaptive_fixture = await create_adaptive_discovery_smoke_fixture()
                    adaptive_summary: dict[str, Any] = {}
                    try:
                        with temporary_environment(
                            {
                                "DISCOVERY_GEMINI_API_KEY": "",
                                "GEMINI_API_KEY": "",
                                "DISCOVERY_AUTO_APPROVE_THRESHOLD": "0",
                            }
                        ):
                            configure_discovery_runtime(
                                DiscoveryRuntime(
                                    web_search=_AdaptiveSmokeWebSearchAdapter(
                                        website_url=adaptive_fixture.website_url
                                    ),
                                    url_validator=_AdaptiveSmokeUrlValidatorAdapter(),
                                    rss_probe=runtime.rss_probe,
                                    content_sampler=_AdaptiveSmokeContentSamplerAdapter(),
                                    llm_analyzer=runtime.llm_analyzer,
                                    source_registrar=runtime.source_registrar,
                                    db_store=runtime.db_store,
                                    article_loader=runtime.article_loader,
                                    article_enricher=runtime.article_enricher,
                                    website_probe=_AdaptiveSmokeWebsiteProbeAdapter(
                                        website_url=adaptive_fixture.website_url,
                                        feed_url=adaptive_fixture.feed_url,
                                    ),
                                )
                            )
                            adaptive_settings = load_discovery_settings()
                            repository = DiscoveryCoordinatorRepository()
                            sequence_repository = PostgresSequenceRepository()
                            mission = await repository.get_mission(adaptive_fixture.mission_id)
                            if mission is None:
                                raise RuntimeError(
                                    "Discovery enabled smoke failed: adaptive mission fixture was not created."
                                )

                            compiled_graph = await compile_interest_graph_for_mission(
                                mission=mission,
                                repository=repository,
                            )
                            if str(compiled_graph.get("core_topic") or "") != "EU AI oversight":
                                raise RuntimeError(
                                    "Discovery enabled smoke failed: graph compilation did not preserve the mission core topic."
                                )

                            planned = await plan_hypotheses(
                                mission_id=adaptive_fixture.mission_id,
                                settings=adaptive_settings,
                                repository=repository,
                            )
                            if planned["discovery_planned_count"] != 1:
                                raise RuntimeError(
                                    "Discovery enabled smoke failed: adaptive planning did not emit exactly one bounded hypothesis."
                                )

                            executed = await execute_hypotheses(
                                mission_id=adaptive_fixture.mission_id,
                                settings=adaptive_settings,
                                repository=repository,
                                sequence_repository=sequence_repository,
                            )
                            if executed["discovery_executed_count"] != 1:
                                raise RuntimeError(
                                    "Discovery enabled smoke failed: adaptive execution did not run the planned hypothesis."
                                )
                            evaluated = await evaluate_hypotheses(
                                hypothesis_ids=executed["discovery_executed_hypothesis_ids"],
                                repository=repository,
                            )

                            async with await open_connection() as connection:
                                async with connection.cursor() as cursor:
                                    await cursor.execute(
                                        """
                                        select
                                          h.hypothesis_id::text as hypothesis_id,
                                          h.class_key,
                                          c.candidate_id::text as candidate_id,
                                          c.status as candidate_status,
                                          c.registered_channel_id::text as registered_channel_id,
                                          c.source_profile_id::text as source_profile_id,
                                          sis.score_id::text as score_id,
                                          dps.snapshot_id::text as snapshot_id,
                                          dss.trials,
                                          dss.successes,
                                          sc.fetch_url,
                                          sc.config_json,
                                          oe.event_type
                                        from discovery_hypotheses h
                                        left join discovery_candidates c on c.hypothesis_id = h.hypothesis_id
                                        left join discovery_source_interest_scores sis
                                          on sis.mission_id = h.mission_id
                                         and sis.source_profile_id = c.source_profile_id
                                        left join discovery_strategy_stats dss
                                          on dss.mission_id = h.mission_id
                                         and dss.class_key = h.class_key
                                         and dss.tactic_key = h.tactic_key
                                        left join discovery_portfolio_snapshots dps
                                          on dps.snapshot_id = (
                                            select latest_portfolio_snapshot_id
                                            from discovery_missions
                                            where mission_id = h.mission_id
                                          )
                                        left join source_channels sc on sc.channel_id = c.registered_channel_id
                                        left join outbox_events oe
                                          on oe.aggregate_type = 'source_channel'
                                         and oe.aggregate_id = c.registered_channel_id
                                        where h.mission_id = %s
                                        order by c.created_at desc nulls last
                                        limit 1
                                        """,
                                        (adaptive_fixture.mission_id,),
                                    )
                                    state_row = await cursor.fetchone()
                                    if state_row is None:
                                        raise RuntimeError(
                                            "Discovery enabled smoke failed: adaptive walkthrough produced no persisted discovery rows."
                                        )
                                    if str(state_row.get("class_key") or "") != adaptive_fixture.class_key:
                                        raise RuntimeError(
                                            "Discovery enabled smoke failed: custom registry class did not own the emitted hypothesis."
                                        )
                                    candidate_id = str(state_row.get("candidate_id") or "")
                                    source_profile_id = str(state_row.get("source_profile_id") or "")
                                    registered_channel_id = str(state_row.get("registered_channel_id") or "")
                                    first_snapshot_id = str(state_row.get("snapshot_id") or "")
                                    if not candidate_id or not source_profile_id:
                                        raise RuntimeError(
                                            "Discovery enabled smoke failed: candidate/profile persistence was incomplete."
                                        )
                                    if not state_row.get("score_id"):
                                        raise RuntimeError(
                                            "Discovery enabled smoke failed: source interest score was not persisted."
                                        )
                                    if not first_snapshot_id:
                                        raise RuntimeError(
                                            "Discovery enabled smoke failed: execution portfolio snapshot was not persisted."
                                        )
                                    if int(state_row.get("trials") or 0) < 1 or int(state_row.get("successes") or 0) < 1:
                                        raise RuntimeError(
                                            "Discovery enabled smoke failed: strategy stats were not updated after evaluation."
                                        )
                                    if str(state_row.get("candidate_status") or "") not in {"approved", "auto_approved"}:
                                        raise RuntimeError(
                                            "Discovery enabled smoke failed: candidate did not reach an approved registration state."
                                        )
                                    if not registered_channel_id:
                                        raise RuntimeError(
                                            "Discovery enabled smoke failed: approved source was not registered as a source channel."
                                        )
                                    if str(state_row.get("fetch_url") or "") != adaptive_fixture.website_url:
                                        raise RuntimeError(
                                            "Discovery enabled smoke failed: registered website channel did not preserve the adaptive website URL."
                                        )
                                    if str(state_row.get("event_type") or "") != "source.channel.sync.requested":
                                        raise RuntimeError(
                                            "Discovery enabled smoke failed: source registration did not publish the outbox sync event."
                                        )
                                    config_json = state_row.get("config_json") or {}
                                    discovery_hints = (
                                        config_json.get("discoveryHints", {})
                                        if isinstance(config_json, dict)
                                        else {}
                                    )
                                    discovered_feed_urls = (
                                        discovery_hints.get("discoveredFeedUrls", [])
                                        if isinstance(discovery_hints, dict)
                                        else []
                                    )
                                    if not isinstance(config_json, dict) or not bool(config_json.get("browserFallbackEnabled")):
                                        raise RuntimeError(
                                            "Discovery enabled smoke failed: browser-assisted website recommendation did not materialize into the registered source channel config."
                                        )
                                    if adaptive_fixture.feed_url not in discovered_feed_urls:
                                        raise RuntimeError(
                                            "Discovery enabled smoke failed: hidden feed hints were not preserved on the registered website channel."
                                        )

                            await insert_adaptive_discovery_smoke_feedback(
                                mission_id=adaptive_fixture.mission_id,
                                candidate_id=candidate_id,
                                source_profile_id=source_profile_id,
                            )
                            re_evaluated = await re_evaluate_sources(
                                mission_id=adaptive_fixture.mission_id,
                                repository=repository,
                            )
                            if re_evaluated["discovery_portfolio_snapshot_count"] != 1:
                                raise RuntimeError(
                                    "Discovery enabled smoke failed: re-evaluation did not persist a fresh portfolio snapshot."
                                )
                            if re_evaluated["discovery_feedback_row_count"] != 1:
                                raise RuntimeError(
                                    "Discovery enabled smoke failed: feedback row was not visible during re-evaluation."
                                )

                            async with await open_connection() as connection:
                                async with connection.cursor() as cursor:
                                    await cursor.execute(
                                        """
                                        select latest_portfolio_snapshot_id::text as latest_portfolio_snapshot_id
                                        from discovery_missions
                                        where mission_id = %s
                                        """,
                                        (adaptive_fixture.mission_id,),
                                    )
                                    mission_row = await cursor.fetchone()
                                    latest_snapshot_id = (
                                        str(mission_row.get("latest_portfolio_snapshot_id") or "")
                                        if mission_row is not None
                                        else ""
                                    )
                                    if not latest_snapshot_id or latest_snapshot_id == first_snapshot_id:
                                        raise RuntimeError(
                                            "Discovery enabled smoke failed: re-evaluation did not advance the portfolio snapshot pointer."
                                        )

                            adaptive_summary = {
                                "missionId": adaptive_fixture.mission_id,
                                "customClassKey": adaptive_fixture.class_key,
                                "plannedCount": planned["discovery_planned_count"],
                                "executedCount": executed["discovery_executed_count"],
                                "evaluatedCount": evaluated["discovery_evaluated_count"],
                                "candidateId": candidate_id,
                                "sourceProfileId": source_profile_id,
                                "registeredChannelId": registered_channel_id,
                                "firstSnapshotId": first_snapshot_id,
                                "latestSnapshotId": latest_snapshot_id,
                                "reEvaluatedCount": re_evaluated["discovery_re_evaluated_count"],
                            }
                    finally:
                        if adaptive_fixture is not None:
                            await cleanup_adaptive_discovery_smoke_fixture(adaptive_fixture)

                    return {
                        "status": "discovery-enabled-ok",
                        "enabled": True,
                        "searchProvider": settings.search_provider,
                        "llmModel": settings.llm_model,
                        "monthlyBudgetCents": settings.monthly_budget_cents,
                        "searchMeta": search_result["search_meta"],
                        "llmMeta": llm_meta,
                        "ddgsCall": ddgs_calls[0],
                        "providerPath": request_paths[0],
                        "configuredBaseUrl": discovered_base_url,
                        "adaptiveWalkthrough": adaptive_summary,
                    }
                finally:
                    reset_discovery_runtime()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="NewsPortal worker smoke commands")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("normalize-dedup")
    subparsers.add_parser("embed")
    subparsers.add_parser("interest-compile")
    subparsers.add_parser("criterion-compile")
    subparsers.add_parser("cluster-match-notify")
    subparsers.add_parser("discovery-enabled")
    subparsers.add_parser("llm-budget-stop")
    subparsers.add_parser("llm-cost-proof")
    subparsers.add_parser("reindex-backfill")
    return parser


async def run() -> int:
    args = build_parser().parse_args()
    if args.command == "normalize-dedup":
        result = await run_normalize_dedup_smoke()
    elif args.command == "embed":
        result = await run_embed_smoke()
    elif args.command == "interest-compile":
        result = await run_interest_compile_smoke()
    elif args.command == "reindex-backfill":
        result = await run_reindex_backfill_smoke()
    elif args.command == "llm-budget-stop":
        result = await run_llm_budget_stop_smoke()
    elif args.command == "llm-cost-proof":
        result = await run_llm_cost_proof_smoke()
    elif args.command == "cluster-match-notify":
        result = await run_cluster_match_notify_smoke()
    elif args.command == "discovery-enabled":
        result = await run_discovery_enabled_smoke()
    else:
        result = await run_criterion_compile_smoke()
    print(json.dumps(result, ensure_ascii=True))
    return 0


def main() -> None:
    raise SystemExit(asyncio.run(run()))


if __name__ == "__main__":
    main()
