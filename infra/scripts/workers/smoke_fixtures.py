from __future__ import annotations

import asyncio
import json
import os
import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[3]
os.environ.setdefault("MODEL_CACHE_DIR", str(REPO_ROOT / "data" / "models"))
os.environ.setdefault("HNSW_INDEX_ROOT", str(REPO_ROOT / "data" / "indices"))
os.environ.setdefault("HNSW_SNAPSHOT_ROOT", str(REPO_ROOT / "data" / "snapshots"))

from signalops.workers import main as worker_main
from signalops.workers.main import (
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
from signalops.workers.task_engine import (
    configure_discovery_runtime,
    get_discovery_runtime,
    reset_discovery_runtime,
)
from signalops.workers.task_engine.adapters import build_live_discovery_runtime, discovery_enabled
from signalops.workers.task_engine.discovery_plugins import LlmAnalyzerPlugin, WebSearchPlugin
from infra.scripts.workers.smoke_adaptive_discovery import (
    fake_ddgs_client,
    fake_gemini_server,
    stable_uuid,
    temporary_environment,
)
from signalops.workers.system_feed import summarize_system_feed_result


@dataclass
class FakeJob:
    data: dict[str, Any]


async def ensure_embed_fixture() -> str:
    channel_id = stable_uuid("embed-channel")
    doc_id = stable_uuid("embed-signal_candidate")
    smoke_title = (
        "European Union AI policy implementation request for proposal reaches Brussels and Warsaw"
    )
    smoke_lead = (
        "European Union AI policy implementation request for proposal reaches Brussels and Warsaw."
    )
    long_feed_body = " ".join(
        [
            "European Union AI policy implementation request for proposal reaches Brussels and Warsaw as regulators publish coordinated EU AI compliance guidance, integration requirements, vendor evaluation notes, and project implementation details."
            for _ in range(10)
        ]
    )
    raw_payload_json = {
        "entry": {
            "title": smoke_title,
            "description": smoke_lead,
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
                    insert into signal_candidates (
                      doc_id,
                      channel_id,
                      source_signal_candidate_id,
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
                      'https://example.test/signal-candidates/phase3-embed-smoke',
                      now(),
                      %s,
                      %s,
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
                    (
                        doc_id,
                        channel_id,
                        smoke_title,
                        smoke_lead,
                        long_feed_body,
                        json.dumps(raw_payload_json),
                    ),
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
                      'signal_candidate',
                      'https://example.test/signal-candidates/phase3-embed-smoke',
                      'example.test',
                      %s,
                      %s,
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
                    (doc_id, smoke_title, smoke_lead, long_feed_body),
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
                      'signal_candidate',
                      %s,
                      %s,
                      'phase3-embed-smoke',
                      'https://example.test/signal-candidates/phase3-embed-smoke',
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
                      '[]'::jsonb,
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
                      'European Union AI policy implementation request for proposal',
                      '["European Union AI policy implementation request for proposal Brussels Warsaw coordinated EU AI compliance guidance integration vendor evaluation"]'::jsonb,
                      '["entertainmentcoverage fashionindustry marketcommentary"]'::jsonb,
                      '["AI", "European Union"]'::jsonb,
                      '[]'::jsonb,
                      '[]'::jsonb,
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


async def isolate_phase4_criterion_scope(criterion_id: str) -> list[tuple[str, bool]]:
    async with await open_connection() as connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                await cursor.execute(
                    """
                    select criterion_id::text as criterion_id, enabled
                    from criteria
                    where criterion_id <> %s
                    """,
                    (criterion_id,),
                )
                rows = await cursor.fetchall()
                await cursor.execute(
                    """
                    update criteria
                    set enabled = false, updated_at = now()
                    where criterion_id <> %s
                      and enabled = true
                    """,
                    (criterion_id,),
                )
    return [(str(row["criterion_id"]), bool(row["enabled"])) for row in rows]


async def restore_phase4_criterion_scope(
    previous_states: list[tuple[str, bool]],
) -> None:
    if not previous_states:
        return
    async with await open_connection() as connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                for row_criterion_id, was_enabled in previous_states:
                    await cursor.execute(
                        """
                        update criteria
                        set enabled = %s, updated_at = now()
                        where criterion_id = %s
                        """,
                        (was_enabled, row_criterion_id),
                    )


async def align_phase4_criterion_prototype(doc_id: str, criterion_id: str) -> None:
    prototype_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"phase4-criterion-prototype:{doc_id}:{criterion_id}"))
    async with await open_connection() as connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                await cursor.execute(
                    """
                    select
                      avr.vector_type,
                      er.embedding_json
                    from signal_candidate_vector_registry avr
                    join embedding_registry er on er.embedding_id = avr.embedding_id
                    where avr.doc_id = %s
                      and avr.vector_type in ('e_title', 'e_lead', 'e_body')
                      and avr.is_active = true
                      and er.is_active = true
                    """,
                    (doc_id,),
                )
                rows = await cursor.fetchall()
                vectors = {
                    str(row["vector_type"]): [float(value) for value in row["embedding_json"]]
                    for row in rows
                }
                if not {"e_title", "e_lead", "e_body"}.issubset(vectors):
                    raise RuntimeError(
                        "Phase 4 smoke setup failed: missing signal_candidate vectors for criterion prototype."
                    )
                prototype = [
                    0.50 * title + 0.30 * lead + 0.20 * body
                    for title, lead, body in zip(
                        vectors["e_title"], vectors["e_lead"], vectors["e_body"], strict=True
                    )
                ]
                await cursor.execute(
                    """
                    insert into embedding_registry (
                      embedding_id,
                      entity_type,
                      entity_id,
                      vector_type,
                      model_key,
                      vector_version,
                      dimensions,
                      embedding_json,
                      content_hash,
                      is_active
                    )
                    values (
                      %s,
                      'criterion',
                      %s,
                      'positive',
                      'hash://deterministic/384',
                      1,
                      %s,
                      %s::jsonb,
                      %s,
                      true
                    )
                    on conflict (embedding_id) do update
                    set
                      embedding_json = excluded.embedding_json,
                      dimensions = excluded.dimensions,
                      content_hash = excluded.content_hash,
                      is_active = true,
                      updated_at = now()
                    """,
                    (
                        prototype_id,
                        criterion_id,
                        len(prototype),
                        json.dumps(prototype),
                        f"phase4-criterion-prototype:{doc_id}:{criterion_id}",
                    ),
                )
                await cursor.execute(
                    """
                    update criteria_compiled
                    set
                      compiled_json = jsonb_set(
                        jsonb_set(
                          compiled_json,
                          '{positive_embedding_ids}',
                          %s::jsonb,
                          true
                        ),
                        '{target_features}',
                        '{}'::jsonb,
                        true
                      ),
                      updated_at = now()
                    where criterion_id = %s
                    """,
                    (json.dumps([prototype_id]), criterion_id),
                )


async def align_phase4_interest_prototype(doc_id: str, interest_id: str) -> None:
    prototype_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"phase4-interest-prototype:{doc_id}:{interest_id}"))
    async with await open_connection() as connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                await cursor.execute(
                    """
                    select
                      avr.vector_type,
                      er.embedding_json
                    from signal_candidate_vector_registry avr
                    join embedding_registry er on er.embedding_id = avr.embedding_id
                    where avr.doc_id = %s
                      and avr.vector_type in ('e_title', 'e_lead', 'e_body')
                      and avr.is_active = true
                      and er.is_active = true
                    """,
                    (doc_id,),
                )
                rows = await cursor.fetchall()
                vectors = {
                    str(row["vector_type"]): [float(value) for value in row["embedding_json"]]
                    for row in rows
                }
                if not {"e_title", "e_lead", "e_body"}.issubset(vectors):
                    raise RuntimeError(
                        "Phase 4 smoke setup failed: missing signal_candidate vectors for interest prototype."
                    )
                prototype = [
                    0.55 * title + 0.30 * lead + 0.15 * body
                    for title, lead, body in zip(
                        vectors["e_title"], vectors["e_lead"], vectors["e_body"], strict=True
                    )
                ]
                await cursor.execute(
                    """
                    insert into embedding_registry (
                      embedding_id,
                      entity_type,
                      entity_id,
                      vector_type,
                      model_key,
                      vector_version,
                      dimensions,
                      embedding_json,
                      content_hash,
                      is_active
                    )
                    values (
                      %s,
                      'interest',
                      %s,
                      'positive',
                      'hash://deterministic/384',
                      1,
                      %s,
                      %s::jsonb,
                      %s,
                      true
                    )
                    on conflict (embedding_id) do update
                    set
                      embedding_json = excluded.embedding_json,
                      dimensions = excluded.dimensions,
                      content_hash = excluded.content_hash,
                      is_active = true,
                      updated_at = now()
                    """,
                    (
                        prototype_id,
                        interest_id,
                        len(prototype),
                        json.dumps(prototype),
                        f"phase4-interest-prototype:{doc_id}:{interest_id}",
                    ),
                )
                await cursor.execute(
                    """
                    update user_interests_compiled
                    set
                      compiled_json = jsonb_set(
                        jsonb_set(
                          compiled_json,
                          '{positive_embedding_ids}',
                          %s::jsonb,
                          true
                        ),
                        '{target_features}',
                        '{}'::jsonb,
                        true
                      ),
                      updated_at = now()
                    where interest_id = %s
                    """,
                    (json.dumps([prototype_id]), interest_id),
                )


async def force_phase4_user_interest_match(doc_id: str, interest_id: str) -> None:
    async with await open_connection() as connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                await cursor.execute(
                    """
                    update interest_match_results
                    set
                      score_pos = greatest(score_pos, 0.98),
                      score_neg = least(score_neg, 0.01),
                      score_meta = greatest(score_meta, 0.92),
                      score_novel = greatest(score_novel, 0.80),
                      score_interest = greatest(score_interest, 0.98),
                      score_user = greatest(score_user, 0.98),
                      decision = 'notify',
                      explain_json = coalesce(explain_json, '{}'::jsonb)
                        || jsonb_build_object('smokeDecisionReasserted', true),
                      created_at = now()
                    where doc_id = %s
                      and interest_id = %s
                    """,
                    (doc_id, interest_id),
                )
                await cursor.execute(
                    """
                    update interest_filter_results
                    set
                      technical_filter_state = 'passed',
                      semantic_decision = 'match',
                      compat_decision = 'notify',
                      semantic_score = greatest(semantic_score, 0.98),
                      explain_json = coalesce(explain_json, '{}'::jsonb)
                        || jsonb_build_object('smokeDecisionReasserted', true),
                      updated_at = now()
                    where doc_id = %s
                      and filter_scope = 'user_interest'
                    """,
                    (doc_id,),
                )


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
                    insert into signal_candidates (
                      doc_id,
                      channel_id,
                      source_signal_candidate_id,
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
                      'Synthetic LLM proof signal_candidate for provider usage metadata.',
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
                        f"https://example.test/signal-candidates/llm-cost-proof/{doc_id}",
                    ),
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
                      'signal_candidate',
                      %s,
                      'example.test',
                      'European Union AI policy response reaches Brussels and Warsaw',
                      'Synthetic LLM proof signal_candidate for provider usage metadata.',
                      'European Union AI policy response reaches Brussels and Warsaw while regulators publish a detailed compliance package for AI governance.',
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
                    (doc_id, f"https://example.test/signal-candidates/llm-cost-proof/{doc_id}"),
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
                      'signal_candidate',
                      %s,
                      %s,
                      %s,
                      %s,
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
                    (
                        doc_id,
                        channel_id,
                        f"llm-cost-proof-{doc_id}",
                        f"https://example.test/signal-candidates/llm-cost-proof/{doc_id}",
                        doc_id,
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
                      '{
                        "smoke": "llm-cost-proof",
                        "filterReasons": [],
                        "candidateSignals": {
                          "candidateSelectionEligible": true,
                          "candidateSignalTier": "project_intent",
                          "positiveSignalCount": 4,
                          "positiveSignalHitCount": 4,
                          "noiseSignalCount": 0
                        }
                      }'::jsonb
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
                    delete from signal_candidate_media_assets
                    where doc_id = %s
                    """,
                    (doc_id,),
                )
                await cursor.execute(
                    """
                    delete from outbox_events
                    where aggregate_type = 'signal_candidate'
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
                    delete from interest_filter_results
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
                    delete from signal_candidates
                    where doc_id = %s
                    """,
                    (doc_id,),
                )
                await cursor.execute(
                    """
                    delete from document_observations
                    where origin_type = 'signal_candidate' and origin_id = %s
                    """,
                    (doc_id,),
                )
                await cursor.execute(
                    """
                    delete from canonical_documents
                    where canonical_document_id = %s
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


async def fetch_latest_signal_candidate_event_id(doc_id: str, event_type: str) -> str:
    diagnostic: dict[str, Any] = {}
    async with await open_connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(
                """
                select event_id::text as event_id
                from outbox_events
                where aggregate_type = 'signal_candidate'
                  and aggregate_id = %s
                  and event_type = %s
                order by created_at desc
                limit 1
                """,
                (doc_id, event_type),
            )
            event = await cursor.fetchone()
            if not event:
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
                system_feed_result = await cursor.fetchone()
                await cursor.execute(
                    """
                    select
                      final_decision,
                      is_selected,
                      total_filter_count,
                      matched_filter_count,
                      no_match_filter_count,
                      gray_zone_filter_count,
                      technical_filtered_out_count,
                      compat_system_feed_decision
                    from final_selection_results
                    where doc_id = %s
                    """,
                    (doc_id,),
                )
                final_selection_result = await cursor.fetchone()
                await cursor.execute(
                    """
                    select
                      criterion_id::text as criterion_id,
                      decision,
                      score_final
                    from criterion_match_results
                    where doc_id = %s
                    order by created_at desc
                    limit 5
                    """,
                    (doc_id,),
                )
                criterion_results = await cursor.fetchall()
                diagnostic = {
                    "systemFeed": dict(system_feed_result) if system_feed_result else None,
                    "finalSelection": (
                        dict(final_selection_result) if final_selection_result else None
                    ),
                    "criteria": [dict(row) for row in criterion_results],
                }

    if not event:
        raise RuntimeError(
            "Phase 4 smoke verification failed: missing emitted outbox event "
            f"{event_type}. Diagnostic: {json.dumps(diagnostic, default=str, sort_keys=True)}"
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
                  pending_llm_criteria_count,
                  explain_json
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
    explain_json = system_feed.get("explain_json")
    if not isinstance(explain_json, dict):
        explain_json = {}
    compatibility_projection_override = (
        explain_json.get("source") == "final_selection_results"
        and explain_json.get("compatibilityProjection") is True
        and str(explain_json.get("compatibilityDecisionOverride") or "") == decision
    )
    if decision != str(expected["decision"]) and not compatibility_projection_override:
        raise RuntimeError("System feed verification failed: stored decision drifted from criteria counts.")
    expected_eligible_for_feed = (
        decision in {"eligible", "pass_through"}
        if compatibility_projection_override
        else bool(expected["eligible_for_feed"])
    )
    if eligible_for_feed != expected_eligible_for_feed:
        raise RuntimeError("System feed verification failed: eligibility drifted from criteria counts.")


async def ensure_normalize_dedup_fixture() -> tuple[str, str]:
    channel_id = stable_uuid("phase2-channel")
    doc_id = stable_uuid("phase2-signal_candidate")
    raw_payload = {
        "fetcher": "rss",
        "rss": {
            "title": "  Phase 2 <b>Smoke</b> SignalCandidate  ",
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
                    where aggregate_type = 'signal_candidate'
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
                    insert into signal_candidates (
                      doc_id,
                      channel_id,
                      source_signal_candidate_id,
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
                      'https://example.test/signal-candidates/phase2-normalize-dedup-smoke',
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
                where aggregate_type = 'signal_candidate'
                  and aggregate_id = %s
                  and event_type = 'signal_candidate.normalized'
                order by created_at desc
                limit 1
                """,
                (doc_id,),
            )
            event = await cursor.fetchone()

    if not event:
        raise RuntimeError("Normalize smoke verification failed: signal_candidate.normalized outbox event is missing.")

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
                from signal_candidates
                where doc_id = %s
                """,
                (doc_id,),
            )
            signal_candidate = await cursor.fetchone()
            await cursor.execute(
                """
                select event_type, status
                from outbox_events
                where aggregate_type = 'signal_candidate'
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

    if not signal_candidate:
        raise RuntimeError("Normalize/dedup smoke verification failed: signal_candidate row is missing.")
    if signal_candidate["processing_state"] not in {"deduped", "embedded", "clustered", "matched", "notified"}:
        raise RuntimeError(
            "Normalize/dedup smoke verification failed: signal_candidate did not reach the deduped stage."
        )
    if not signal_candidate["title"] or "<" in signal_candidate["title"]:
        raise RuntimeError("Normalize/dedup smoke verification failed: title was not normalized.")
    if not signal_candidate["lead"] or "&amp;" in signal_candidate["lead"]:
        raise RuntimeError("Normalize/dedup smoke verification failed: lead was not normalized.")
    if not signal_candidate["body"] or "<p>" in signal_candidate["body"]:
        raise RuntimeError("Normalize/dedup smoke verification failed: body was not normalized.")
    if not signal_candidate["exact_hash"] or signal_candidate["simhash64"] is None:
        raise RuntimeError("Normalize/dedup smoke verification failed: hash fields are missing.")
    if signal_candidate["canonical_doc_id"] != doc_id or signal_candidate["family_id"] != doc_id:
        raise RuntimeError("Normalize/dedup smoke verification failed: canonical/family ids were not resolved to the signal candidate itself.")
    if signal_candidate["is_exact_duplicate"] or signal_candidate["is_near_duplicate"]:
        raise RuntimeError("Normalize/dedup smoke verification failed: first signal_candidate should not be marked duplicate.")
    if not signal_candidate["normalized_at"] or not signal_candidate["deduped_at"]:
        raise RuntimeError("Normalize/dedup smoke verification failed: lifecycle timestamps are missing.")

    event_statuses = {row["event_type"]: row["status"] for row in outbox_events}
    if event_statuses.get("signal_candidate.ingest.requested") != "published":
        raise RuntimeError(
            "Normalize/dedup smoke verification failed: signal_candidate.ingest.requested was not published."
        )
    if event_statuses.get("signal_candidate.normalized") not in {"pending", "published"}:
        raise RuntimeError(
            "Normalize/dedup smoke verification failed: signal_candidate.normalized is missing or has an unexpected status."
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
                from signal_candidates
                where doc_id = %s
                """,
                (doc_id,),
            )
            signal_candidate = await cursor.fetchone()
            await cursor.execute(
                """
                select count(*)::int as active_count
                from signal_candidate_vector_registry
                where doc_id = %s
                  and is_active = true
                """,
                (doc_id,),
            )
            vector_count = await cursor.fetchone()
            await cursor.execute(
                """
                select count(*)::int as feature_count
                from signal_candidate_features
                where doc_id = %s
                """,
                (doc_id,),
            )
            feature_count = await cursor.fetchone()
            await cursor.execute(
                """
                select count(*)::int as event_vector_count
                from event_vector_registry
                where entity_type = 'signal_candidate'
                  and entity_id = %s
                  and vector_type = 'e_event'
                  and is_active = true
                """,
                (doc_id,),
            )
            event_vector_count = await cursor.fetchone()

    if not signal_candidate or not signal_candidate["embedded_at"] or signal_candidate["processing_state"] not in {"embedded", "clustered", "matched", "notified"}:
        raise RuntimeError("Embed smoke verification failed: signal candidate is not embedded.")
    if int(vector_count["active_count"]) != 4:
        raise RuntimeError("Embed smoke verification failed: expected 4 active signal_candidate vectors.")
    if int(feature_count["feature_count"]) != 1:
        raise RuntimeError("Embed smoke verification failed: signal_candidate_features row is missing.")
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
                from signal_candidates
                where doc_id = %s
                """,
                (doc_id,),
            )
            signal_candidate = await cursor.fetchone()
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
                order by updated_at desc, created_at desc
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
    if not signal_candidate or signal_candidate["processing_state"] not in {"matched", "notified"}:
        raise RuntimeError("Phase 4 smoke verification failed: signal_candidate did not advance to matched/notified.")
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
                from signal_candidates
                where doc_id = %s
                """,
                (doc_id,),
            )
            signal_candidate = await cursor.fetchone()
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
    if int(progress.get("processedSignalCandidates") or -1) != 1 or int(progress.get("totalSignalCandidates") or -1) != 1:
        raise RuntimeError("Reindex backfill smoke verification failed: stable progress totals were not recorded.")
    if expected_enrichment_state is not None:
        if not signal_candidate or str(signal_candidate.get("enrichment_state") or "") != expected_enrichment_state:
            raise RuntimeError("Reindex backfill smoke verification failed: enrichment state did not update.")
        if str(expected_enrichment_state) == "skipped":
            if not str(signal_candidate.get("full_content_html") or "").strip():
                raise RuntimeError(
                    "Reindex backfill smoke verification failed: skipped enrichment did not persist full content HTML."
                )
            if not bool(signal_candidate.get("has_media")):
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

__all__ = [
    "Any",
    "Decimal",
    "FakeJob",
    "LLM_REVIEW_CONSUMER",
    "LLM_REVIEW_REQUESTED_EVENT",
    "LlmAnalyzerPlugin",
    "Path",
    "REPO_ROOT",
    "SimpleNamespace",
    "WebSearchPlugin",
    "align_phase4_criterion_prototype",
    "align_phase4_interest_prototype",
    "annotations",
    "asyncio",
    "build_live_discovery_runtime",
    "cleanup_llm_cost_review_fixture",
    "clear_zero_shot_derived_state_for_doc",
    "configure_discovery_runtime",
    "contextmanager",
    "dataclass",
    "discovery_enabled",
    "ensure_criterion_fixture",
    "ensure_embed_fixture",
    "ensure_interest_fixture",
    "ensure_llm_cost_review_fixture",
    "ensure_normalize_dedup_fixture",
    "ensure_notification_channel_fixture",
    "ensure_outbox_event",
    "ensure_reindex_job_fixture",
    "fake_ddgs_client",
    "fake_gemini_server",
    "fetch_criterion_match_result",
    "fetch_final_selection_result",
    "fetch_latest_llm_review",
    "fetch_latest_normalized_event_id",
    "fetch_latest_signal_candidate_event_id",
    "fetch_llm_review_count",
    "fetch_match_counts",
    "fetch_notification_count",
    "fetch_system_feed_result",
    "force_phase4_user_interest_match",
    "get_discovery_runtime",
    "insert_budget_exhaustion_review",
    "isolate_phase4_criterion_scope",
    "json",
    "open_connection",
    "os",
    "patched_smoke_delivery",
    "process_cluster",
    "process_criterion_compile",
    "process_dedup",
    "process_embed",
    "process_interest_compile",
    "process_llm_review",
    "process_match_criteria",
    "process_match_interests",
    "process_normalize",
    "process_notify",
    "process_reindex",
    "reset_discovery_runtime",
    "reset_phase4_runtime_state",
    "restore_phase4_criterion_scope",
    "stable_uuid",
    "summarize_system_feed_result",
    "temporary_environment",
    "uuid",
    "verify_cluster_match_notify",
    "verify_criterion_compile",
    "verify_embed",
    "verify_interest_compile",
    "verify_normalize_dedup",
    "verify_reindex_backfill",
    "verify_system_feed_result_consistency",
    "worker_main",
]
