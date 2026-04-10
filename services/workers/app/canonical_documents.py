from __future__ import annotations

from urllib.parse import urlparse
import uuid
from typing import Any

import psycopg


def derive_canonical_domain(raw_url: str | None) -> str | None:
    if not raw_url:
        return None
    try:
        hostname = urlparse(str(raw_url)).hostname
    except ValueError:
        return None
    if not hostname:
        return None
    normalized = hostname.casefold()
    if normalized.startswith("www."):
        normalized = normalized[4:]
    return normalized or None


def resolve_observation_duplicate_kind(
    *,
    article_doc_id: uuid.UUID,
    canonical_document_id: uuid.UUID | None,
    is_exact_duplicate: bool,
    is_near_duplicate: bool,
) -> str:
    if canonical_document_id is None:
        return "pending"
    if is_exact_duplicate:
        return "exact_duplicate"
    if is_near_duplicate:
        return "near_duplicate"
    if canonical_document_id == article_doc_id:
        return "canonical"
    return "canonical"


def resolve_observation_state(*, canonical_document_id: uuid.UUID | None) -> str:
    return "canonicalized" if canonical_document_id is not None else "pending_canonicalization"


async def fetch_canonical_document_source(
    cursor: psycopg.AsyncCursor[Any],
    canonical_document_id: uuid.UUID,
) -> dict[str, Any]:
    await cursor.execute(
        """
        select
          a.*,
          coalesce(a.extracted_source_name, sc.name) as resolved_source_name
        from articles a
        join source_channels sc on sc.channel_id = a.channel_id
        where a.doc_id = %s
        limit 1
        """,
        (canonical_document_id,),
    )
    article = await cursor.fetchone()
    if article is None:
        raise ValueError(
            f"Canonical document source article {canonical_document_id} was not found."
        )
    return article


async def upsert_canonical_document(
    cursor: psycopg.AsyncCursor[Any],
    canonical_article: dict[str, Any],
) -> None:
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
          exact_hash,
          simhash64,
          source_name,
          author_name,
          published_at,
          first_observed_at,
          last_observed_at,
          observation_count
        )
        values (
          %s,
          'editorial',
          %s,
          %s,
          %s,
          %s,
          %s,
          %s,
          %s,
          %s,
          %s,
          %s,
          %s,
          %s,
          %s,
          coalesce(%s, now()),
          coalesce(%s, %s, now()),
          0
        )
        on conflict (canonical_document_id) do update
        set
          content_kind = excluded.content_kind,
          content_format = excluded.content_format,
          canonical_url = excluded.canonical_url,
          canonical_domain = excluded.canonical_domain,
          title = excluded.title,
          lead = excluded.lead,
          body = excluded.body,
          lang = excluded.lang,
          lang_confidence = excluded.lang_confidence,
          exact_hash = excluded.exact_hash,
          simhash64 = excluded.simhash64,
          source_name = excluded.source_name,
          author_name = excluded.author_name,
          published_at = excluded.published_at,
          updated_at = now()
        """,
        (
            canonical_article["doc_id"],
            canonical_article["content_format"],
            canonical_article["url"],
            derive_canonical_domain(canonical_article.get("url")),
            canonical_article["title"],
            canonical_article["lead"],
            canonical_article["body"],
            canonical_article.get("lang"),
            canonical_article.get("lang_confidence"),
            canonical_article.get("exact_hash"),
            canonical_article.get("simhash64"),
            canonical_article.get("resolved_source_name"),
            canonical_article.get("extracted_author"),
            canonical_article.get("published_at"),
            canonical_article.get("ingested_at"),
            canonical_article.get("updated_at"),
            canonical_article.get("ingested_at"),
        ),
    )


async def upsert_document_observation(
    cursor: psycopg.AsyncCursor[Any],
    article: dict[str, Any],
    *,
    canonical_document_id: uuid.UUID | None,
    duplicate_kind: str,
    observation_state: str,
) -> None:
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
          %s,
          %s,
          %s,
          %s,
          %s,
          %s,
          %s
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
            article["doc_id"],
            article["channel_id"],
            article.get("source_article_id"),
            article["url"],
            article.get("published_at"),
            article.get("ingested_at"),
            canonical_document_id,
            duplicate_kind,
            observation_state,
        ),
    )


async def refresh_canonical_document_stats(
    cursor: psycopg.AsyncCursor[Any],
    canonical_document_id: uuid.UUID,
) -> None:
    await cursor.execute(
        """
        update canonical_documents cd
        set
          first_observed_at = stats.first_observed_at,
          last_observed_at = stats.last_observed_at,
          observation_count = stats.observation_count,
          updated_at = now()
        from (
          select
            canonical_document_id,
            min(ingested_at) as first_observed_at,
            max(ingested_at) as last_observed_at,
            count(*)::int as observation_count
          from document_observations
          where canonical_document_id = %s
          group by canonical_document_id
        ) stats
        where cd.canonical_document_id = stats.canonical_document_id
        """,
        (canonical_document_id,),
    )


async def sync_article_canonical_document(
    cursor: psycopg.AsyncCursor[Any],
    article: dict[str, Any],
    *,
    canonical_document_id: uuid.UUID,
    is_exact_duplicate: bool,
    is_near_duplicate: bool,
) -> None:
    canonical_article = await fetch_canonical_document_source(cursor, canonical_document_id)
    await upsert_canonical_document(cursor, canonical_article)
    await upsert_document_observation(
        cursor,
        canonical_article,
        canonical_document_id=canonical_document_id,
        duplicate_kind="canonical",
        observation_state=resolve_observation_state(
            canonical_document_id=canonical_document_id
        ),
    )
    duplicate_kind = resolve_observation_duplicate_kind(
        article_doc_id=article["doc_id"],
        canonical_document_id=canonical_document_id,
        is_exact_duplicate=is_exact_duplicate,
        is_near_duplicate=is_near_duplicate,
    )
    observation_state = resolve_observation_state(
        canonical_document_id=canonical_document_id
    )
    if article["doc_id"] != canonical_article["doc_id"]:
        await upsert_document_observation(
            cursor,
            article,
            canonical_document_id=canonical_document_id,
            duplicate_kind=duplicate_kind,
            observation_state=observation_state,
        )
    await refresh_canonical_document_stats(cursor, canonical_document_id)
