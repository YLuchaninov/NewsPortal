from __future__ import annotations

import argparse
import asyncio
import json
import uuid
from dataclasses import dataclass
from typing import Any

from .main import (
    open_connection,
    process_cluster,
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
from .system_feed import summarize_system_feed_result


@dataclass
class FakeJob:
    data: dict[str, Any]


def stable_uuid(name: str) -> uuid.UUID:
    return uuid.uuid5(uuid.NAMESPACE_URL, f"newsportal-phase3-smoke:{name}")


async def ensure_embed_fixture() -> str:
    channel_id = stable_uuid("embed-channel")
    doc_id = stable_uuid("embed-article")
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
                      'European Union AI policy response reaches Brussels and Warsaw. European Union AI policy response reaches Brussels and Warsaw as regulators in Warsaw and Brussels publish coordinated EU AI compliance guidance with 42 pages of response details.',
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
                      lang = excluded.lang,
                      lang_confidence = excluded.lang_confidence,
                      canonical_doc_id = excluded.doc_id,
                      family_id = excluded.doc_id,
                      is_exact_duplicate = false,
                      is_near_duplicate = false,
                      event_cluster_id = null,
                      processing_state = 'normalized',
                      normalized_at = now(),
                      embedded_at = null,
                      updated_at = now()
                    """,
                    (doc_id, channel_id),
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
                      'email_digest',
                      true,
                      '{"email":"phase4-user@example.test"}'::jsonb,
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
                    delete from event_cluster_members
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

    system_feed = await fetch_system_feed_result(doc_id)
    if not article or article["processing_state"] not in {"matched", "notified"}:
        raise RuntimeError("Phase 4 smoke verification failed: article did not advance to matched/notified.")
    if int(cluster_count["cluster_count"]) < 1:
        raise RuntimeError("Phase 4 smoke verification failed: event cluster membership is missing.")
    if int(criterion_count["criterion_count"]) < 1:
        raise RuntimeError("Phase 4 smoke verification failed: criterion matches are missing.")
    if int(interest_count["interest_count"]) < 1:
        raise RuntimeError("Phase 4 smoke verification failed: interest matches are missing.")
    if int(notification_count["notification_count"]) < 1:
        raise RuntimeError("Phase 4 smoke verification failed: notification log is missing.")
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
) -> None:
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

    actual_notification_count = await fetch_notification_count(doc_id)
    system_feed = await fetch_system_feed_result(doc_id)
    options_json = dict(reindex_job["options_json"] or {}) if reindex_job else {}
    progress = dict(options_json.get("progress") or {})

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
        FakeJob({"eventId": event_id, "interestId": interest_id, "version": 2}),
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
    clustered_event_id = str(uuid.uuid4())
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
        FakeJob({"eventId": interest_event_id, "interestId": interest_id, "version": 2}),
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
    cluster_result = await process_cluster(
        FakeJob({"eventId": embedded_event_id, "docId": doc_id, "version": 1}),
        "",
    )
    await ensure_outbox_event(
        event_id=clustered_event_id,
        event_type="article.clustered",
        aggregate_type="article",
        aggregate_id=doc_id,
        payload={"docId": doc_id, "version": 1},
    )
    criterion_result = await process_match_criteria(
        FakeJob({"eventId": clustered_event_id, "docId": doc_id, "version": 1}),
        "",
    )
    criteria_matched_event_id = await fetch_latest_article_event_id(
        doc_id,
        "article.criteria.matched",
    )
    interest_result = await process_match_interests(
        FakeJob({"eventId": criteria_matched_event_id, "docId": doc_id, "version": 1}),
        "",
    )
    matched_interest_event_id = await fetch_latest_article_event_id(
        doc_id,
        "article.interests.matched",
    )
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
    clustered_event_id = str(uuid.uuid4())
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
        FakeJob({"eventId": interest_event_id, "interestId": interest_id, "version": 2}),
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
    await process_cluster(
        FakeJob({"eventId": embedded_event_id, "docId": doc_id, "version": 1}),
        "",
    )
    await ensure_outbox_event(
        event_id=clustered_event_id,
        event_type="article.clustered",
        aggregate_type="article",
        aggregate_id=doc_id,
        payload={"docId": doc_id, "version": 1},
    )
    await process_match_criteria(
        FakeJob({"eventId": clustered_event_id, "docId": doc_id, "version": 1}),
        "",
    )
    criteria_matched_event_id = await fetch_latest_article_event_id(
        doc_id,
        "article.criteria.matched",
    )
    await process_match_interests(
        FakeJob({"eventId": criteria_matched_event_id, "docId": doc_id, "version": 1}),
        "",
    )
    matched_interest_event_id = await fetch_latest_article_event_id(
        doc_id,
        "article.interests.matched",
    )
    await process_notify(
        FakeJob({"eventId": matched_interest_event_id, "docId": doc_id, "version": 1}),
        "",
    )
    await verify_cluster_match_notify(doc_id)
    criterion_count_before, interest_count_before = await fetch_match_counts(doc_id)
    notification_count_before = await fetch_notification_count(doc_id)
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
    )
    return {
        "status": "reindex-backfill-ok",
        "docId": doc_id,
        "reindex": reindex_result,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="NewsPortal worker smoke commands")
    subparsers = parser.add_subparsers(dest="command", required=True)
    subparsers.add_parser("normalize-dedup")
    subparsers.add_parser("embed")
    subparsers.add_parser("interest-compile")
    subparsers.add_parser("criterion-compile")
    subparsers.add_parser("cluster-match-notify")
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
    elif args.command == "cluster-match-notify":
        result = await run_cluster_match_notify_smoke()
    else:
        result = await run_criterion_compile_smoke()
    print(json.dumps(result, ensure_ascii=True))
    return 0


def main() -> None:
    raise SystemExit(asyncio.run(run()))


if __name__ == "__main__":
    main()
