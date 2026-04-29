from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from typing import Any

import psycopg

from .article_lifecycle import (
    compute_exact_hash,
    compute_simhash64,
    derive_lead,
    detect_language,
    extract_raw_rss_payload,
    find_exact_duplicate_candidate,
    find_near_duplicate_candidate,
    normalize_text,
    resolve_canonical_doc_id,
    resolve_family_id,
)
from .article_repository import fetch_article_for_update as default_fetch_article_for_update
from .canonical_documents import sync_article_canonical_document as default_sync_article_canonical_document
from .worker_events import (
    advance_processing_state,
    compute_content_hash,
    insert_outbox_event,
    is_event_processed,
    record_processed_event,
    suppress_downstream_outbox,
)
from .runtime_values import coerce_positive_int
from .worker_queues import (
    ARTICLE_EMBEDDED_EVENT,
    ARTICLE_NORMALIZED_EVENT,
    DEDUP_CONSUMER,
    EMBED_CONSUMER,
    NORMALIZE_CONSUMER,
    PROCESSING_STATE_ORDER,
)


@dataclass(frozen=True)
class ArticleProcessorDependencies:
    open_connection: Callable[[], Awaitable[Any]]
    fetch_article_for_update: Callable[
        [psycopg.AsyncCursor[Any], str],
        Awaitable[dict[str, Any]],
    ]
    sync_article_canonical_document: Callable[..., Awaitable[None]]


@dataclass(frozen=True)
class ArticleEmbedProcessorDependencies:
    open_connection: Callable[[], Awaitable[Any]]
    fetch_article_for_update: Callable[
        [psycopg.AsyncCursor[Any], str],
        Awaitable[dict[str, Any]],
    ]
    embedding_provider: Any
    feature_extractor: Any
    truncate_text_for_embedding: Callable[[str], str]
    mix_weighted_vectors: Callable[
        [Sequence[tuple[float, Sequence[float]]]],
        list[float],
    ]
    upsert_article_features: Callable[..., Awaitable[None]]
    upsert_embedding_registry: Callable[..., Awaitable[str]]
    upsert_article_vector_registry: Callable[..., Awaitable[None]]
    upsert_event_vector_registry: Callable[..., Awaitable[None]]


def build_article_processor_dependencies(
    *,
    open_connection: Callable[[], Awaitable[Any]] | None = None,
    fetch_article_for_update: Callable[
        [psycopg.AsyncCursor[Any], str],
        Awaitable[dict[str, Any]],
    ] = default_fetch_article_for_update,
    sync_article_canonical_document: Callable[
        ...,
        Awaitable[None],
    ] = default_sync_article_canonical_document,
) -> ArticleProcessorDependencies:
    if open_connection is None:
        from .runtime_db import open_connection as default_open_connection

        open_connection = default_open_connection

    return ArticleProcessorDependencies(
        open_connection=open_connection,
        fetch_article_for_update=fetch_article_for_update,
        sync_article_canonical_document=sync_article_canonical_document,
    )


def build_article_embed_processor_dependencies(
    *,
    open_connection: Callable[[], Awaitable[Any]] | None = None,
    fetch_article_for_update: Callable[
        [psycopg.AsyncCursor[Any], str],
        Awaitable[dict[str, Any]],
    ] = default_fetch_article_for_update,
    embedding_provider: Any | None = None,
    feature_extractor: Any | None = None,
    truncate_text_for_embedding: Callable[[str], str] | None = None,
    mix_weighted_vectors: Callable[
        [Sequence[tuple[float, Sequence[float]]]],
        list[float],
    ]
    | None = None,
    upsert_article_features: Callable[..., Awaitable[None]] | None = None,
    upsert_embedding_registry: Callable[..., Awaitable[str]] | None = None,
    upsert_article_vector_registry: Callable[..., Awaitable[None]] | None = None,
    upsert_event_vector_registry: Callable[..., Awaitable[None]] | None = None,
) -> ArticleEmbedProcessorDependencies:
    if open_connection is None:
        from .runtime_db import open_connection as default_open_connection

        open_connection = default_open_connection
    if (
        embedding_provider is None
        or feature_extractor is None
        or truncate_text_for_embedding is None
        or mix_weighted_vectors is None
    ):
        from ml.app import (
            HeuristicArticleFeatureExtractor,
            load_embedding_provider,
            mix_weighted_vectors as default_mix_weighted_vectors,
            truncate_text_for_embedding as default_truncate_text_for_embedding,
        )

        if embedding_provider is None:
            embedding_provider = load_embedding_provider()
        if feature_extractor is None:
            feature_extractor = HeuristicArticleFeatureExtractor()
        if truncate_text_for_embedding is None:
            truncate_text_for_embedding = default_truncate_text_for_embedding
        if mix_weighted_vectors is None:
            mix_weighted_vectors = default_mix_weighted_vectors
    if (
        upsert_article_features is None
        or upsert_embedding_registry is None
        or upsert_article_vector_registry is None
        or upsert_event_vector_registry is None
    ):
        from .vector_registry import (
            upsert_article_features as default_upsert_article_features,
            upsert_article_vector_registry as default_upsert_article_vector_registry,
            upsert_embedding_registry as default_upsert_embedding_registry,
            upsert_event_vector_registry as default_upsert_event_vector_registry,
        )

        if upsert_article_features is None:
            upsert_article_features = default_upsert_article_features
        if upsert_embedding_registry is None:
            upsert_embedding_registry = default_upsert_embedding_registry
        if upsert_article_vector_registry is None:
            upsert_article_vector_registry = default_upsert_article_vector_registry
        if upsert_event_vector_registry is None:
            upsert_event_vector_registry = default_upsert_event_vector_registry

    return ArticleEmbedProcessorDependencies(
        open_connection=open_connection,
        fetch_article_for_update=fetch_article_for_update,
        embedding_provider=embedding_provider,
        feature_extractor=feature_extractor,
        truncate_text_for_embedding=truncate_text_for_embedding,
        mix_weighted_vectors=mix_weighted_vectors,
        upsert_article_features=upsert_article_features,
        upsert_embedding_registry=upsert_embedding_registry,
        upsert_article_vector_registry=upsert_article_vector_registry,
        upsert_event_vector_registry=upsert_event_vector_registry,
    )


async def process_normalize_with_dependencies(
    job: Any,
    _job_token: str,
    deps: ArticleProcessorDependencies,
) -> dict[str, Any]:
    event_id = str(job.data.get("eventId"))
    doc_id = str(job.data.get("docId"))
    suppress_pipeline_fanout = suppress_downstream_outbox(job)

    if not event_id or event_id == "None" or not doc_id or doc_id == "None":
        raise ValueError("Normalize worker expected eventId and docId.")

    connection = await deps.open_connection()
    async with connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                if await is_event_processed(cursor, NORMALIZE_CONSUMER, event_id):
                    return {"status": "duplicate-event", "docId": doc_id}

                article = await deps.fetch_article_for_update(cursor, doc_id)
                title_source, summary_source, content_source = extract_raw_rss_payload(article)
                title = normalize_text(title_source) or "Untitled article"
                lead = derive_lead(summary_source, content_source)
                body = normalize_text(content_source or summary_source or article.get("body") or "")
                lang, lang_confidence = detect_language(
                    " ".join(part for part in (title, lead, body) if part),
                    article.get("lang") or article.get("channel_language"),
                )
                exact_hash = compute_exact_hash(title, lead, body)
                simhash64 = compute_simhash64(" ".join(part for part in (title, lead) if part))
                next_state = advance_processing_state(article.get("processing_state"), "normalized")

                await cursor.execute(
                    """
                    update articles
                    set
                      title = %s,
                      lead = %s,
                      body = %s,
                      lang = %s,
                      lang_confidence = %s,
                      exact_hash = %s,
                      simhash64 = %s,
                      processing_state = %s,
                      normalized_at = coalesce(normalized_at, now()),
                      updated_at = now()
                    where doc_id = %s
                    """,
                    (
                        title,
                        lead,
                        body,
                        lang,
                        lang_confidence,
                        exact_hash,
                        simhash64,
                        next_state,
                        doc_id,
                    ),
                )
                if not suppress_pipeline_fanout:
                    await insert_outbox_event(
                        cursor,
                        ARTICLE_NORMALIZED_EVENT,
                        "article",
                        article["doc_id"],
                        {"docId": str(article["doc_id"]), "version": 1},
                    )
                await record_processed_event(cursor, NORMALIZE_CONSUMER, event_id)

    return {"status": "normalized", "docId": doc_id}


async def process_dedup_with_dependencies(
    job: Any,
    _job_token: str,
    deps: ArticleProcessorDependencies,
) -> dict[str, Any]:
    event_id = str(job.data.get("eventId"))
    doc_id = str(job.data.get("docId"))

    if not event_id or event_id == "None" or not doc_id or doc_id == "None":
        raise ValueError("Dedup worker expected eventId and docId.")

    connection = await deps.open_connection()
    async with connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                if await is_event_processed(cursor, DEDUP_CONSUMER, event_id):
                    return {"status": "duplicate-event", "docId": doc_id}

                article = await deps.fetch_article_for_update(cursor, doc_id)
                exact_hash = article.get("exact_hash")
                simhash64 = article.get("simhash64")
                if not exact_hash or simhash64 is None:
                    raise ValueError(f"Article {doc_id} must be normalized before dedup.")

                exact_candidate = await find_exact_duplicate_candidate(
                    cursor,
                    article["doc_id"],
                    exact_hash,
                )

                canonical_doc_id: uuid.UUID
                family_id: uuid.UUID
                is_exact_duplicate = False
                is_near_duplicate = False

                if exact_candidate is not None:
                    canonical_doc_id = resolve_canonical_doc_id(exact_candidate)
                    family_id = resolve_family_id(exact_candidate)
                    is_exact_duplicate = True
                else:
                    near_candidate = await find_near_duplicate_candidate(
                        cursor,
                        article["doc_id"],
                        int(simhash64),
                    )
                    if near_candidate is not None:
                        canonical_doc_id = resolve_canonical_doc_id(near_candidate)
                        family_id = resolve_family_id(near_candidate)
                        is_near_duplicate = True
                    else:
                        canonical_doc_id = article["doc_id"]
                        family_id = article["doc_id"]

                next_state = advance_processing_state(article.get("processing_state"), "deduped")
                await cursor.execute(
                    """
                    update articles
                    set
                      canonical_doc_id = %s,
                      family_id = %s,
                      is_exact_duplicate = %s,
                      is_near_duplicate = %s,
                      processing_state = %s,
                      deduped_at = coalesce(deduped_at, now()),
                      updated_at = now()
                    where doc_id = %s
                    """,
                    (
                        canonical_doc_id,
                        family_id,
                        is_exact_duplicate,
                        is_near_duplicate,
                        next_state,
                        doc_id,
                    ),
                )
                await deps.sync_article_canonical_document(
                    cursor,
                    article,
                    canonical_document_id=canonical_doc_id,
                    is_exact_duplicate=is_exact_duplicate,
                    is_near_duplicate=is_near_duplicate,
                )
                await record_processed_event(cursor, DEDUP_CONSUMER, event_id)

    return {"status": "deduped", "docId": doc_id}


async def process_embed_with_dependencies(
    job: Any,
    _job_token: str,
    deps: ArticleEmbedProcessorDependencies,
) -> dict[str, Any]:
    event_id = str(job.data.get("eventId"))
    doc_id = str(job.data.get("docId"))
    vector_version = coerce_positive_int(job.data.get("version"), 1)
    suppress_pipeline_fanout = suppress_downstream_outbox(job)

    if not event_id or event_id == "None" or not doc_id or doc_id == "None":
        raise ValueError("Embed worker expected eventId and docId.")

    connection = await deps.open_connection()
    async with connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                if await is_event_processed(cursor, EMBED_CONSUMER, event_id):
                    return {"status": "duplicate-event", "docId": doc_id}

                article = await deps.fetch_article_for_update(cursor, doc_id)
                current_state = str(article.get("processing_state") or "raw")
                if PROCESSING_STATE_ORDER.get(current_state, 0) < PROCESSING_STATE_ORDER["normalized"]:
                    raise ValueError(f"Article {doc_id} must be normalized before embedding.")

                title = str(article.get("title") or "")
                lead = str(article.get("lead") or "")
                body = str(article.get("body") or "")
                embedding_body = " ".join(
                    part
                    for part in (
                        title,
                        lead,
                        deps.truncate_text_for_embedding(body),
                    )
                    if part
                )
                title_vector, lead_vector, body_vector = deps.embedding_provider.embed_texts(
                    [
                        title or "Untitled article",
                        lead or title or "No lead provided",
                        embedding_body or title or lead or "No body provided",
                    ]
                )
                event_vector = deps.mix_weighted_vectors(
                    [
                        (0.6, title_vector),
                        (0.4, lead_vector),
                    ]
                )
                features = deps.feature_extractor.extract(title=title, lead=lead, body=body)
                await deps.upsert_article_features(
                    cursor,
                    article["doc_id"],
                    numbers=features.numbers,
                    short_tokens=features.short_tokens,
                    places=features.places,
                    entities=features.entities,
                    search_vector_version=features.search_vector_version,
                    feature_version=features.feature_version,
                )

                e_title_id = await deps.upsert_embedding_registry(
                    cursor,
                    entity_type="article",
                    entity_id=article["doc_id"],
                    vector_type="e_title",
                    model_key=deps.embedding_provider.model_key,
                    vector_version=vector_version,
                    vector=title_vector,
                    content_hash=compute_content_hash({"text": title, "vectorType": "e_title"}),
                )
                e_lead_id = await deps.upsert_embedding_registry(
                    cursor,
                    entity_type="article",
                    entity_id=article["doc_id"],
                    vector_type="e_lead",
                    model_key=deps.embedding_provider.model_key,
                    vector_version=vector_version,
                    vector=lead_vector,
                    content_hash=compute_content_hash({"text": lead, "vectorType": "e_lead"}),
                )
                e_body_id = await deps.upsert_embedding_registry(
                    cursor,
                    entity_type="article",
                    entity_id=article["doc_id"],
                    vector_type="e_body",
                    model_key=deps.embedding_provider.model_key,
                    vector_version=vector_version,
                    vector=body_vector,
                    content_hash=compute_content_hash(
                        {"text": embedding_body, "vectorType": "e_body"}
                    ),
                )
                e_event_id = await deps.upsert_embedding_registry(
                    cursor,
                    entity_type="article",
                    entity_id=article["doc_id"],
                    vector_type="e_event",
                    model_key=deps.embedding_provider.model_key,
                    vector_version=vector_version,
                    vector=event_vector,
                    content_hash=compute_content_hash(
                        {
                            "title": title,
                            "lead": lead,
                            "vectorType": "e_event",
                        }
                    ),
                )

                for vector_type, embedding_id in (
                    ("e_title", e_title_id),
                    ("e_lead", e_lead_id),
                    ("e_body", e_body_id),
                    ("e_event", e_event_id),
                ):
                    await deps.upsert_article_vector_registry(
                        cursor,
                        doc_id=article["doc_id"],
                        vector_type=vector_type,
                        embedding_id=embedding_id,
                        vector_version=vector_version,
                    )

                await deps.upsert_event_vector_registry(
                    cursor,
                    entity_type="article",
                    entity_id=article["doc_id"],
                    vector_type="e_event",
                    embedding_id=e_event_id,
                    vector_version=vector_version,
                )

                next_state = advance_processing_state(current_state, "embedded")
                await cursor.execute(
                    """
                    update articles
                    set
                      search_vector =
                        setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
                        setweight(to_tsvector('simple', coalesce(lead, '')), 'B') ||
                        setweight(to_tsvector('simple', coalesce(body, '')), 'C'),
                      processing_state = %s,
                      embedded_at = coalesce(embedded_at, now()),
                      updated_at = now()
                    where doc_id = %s
                    """,
                    (
                        next_state,
                        article["doc_id"],
                    ),
                )
                if not suppress_pipeline_fanout:
                    await insert_outbox_event(
                        cursor,
                        ARTICLE_EMBEDDED_EVENT,
                        "article",
                        article["doc_id"],
                        {"docId": str(article["doc_id"]), "version": vector_version},
                    )
                await record_processed_event(cursor, EMBED_CONSUMER, event_id)

    return {
        "status": "embedded",
        "docId": doc_id,
        "modelKey": deps.embedding_provider.model_key,
        "dimensions": deps.embedding_provider.dimensions,
    }


async def process_normalize(job: Any, job_token: str) -> dict[str, Any]:
    return await process_normalize_with_dependencies(
        job,
        job_token,
        build_article_processor_dependencies(),
    )


async def process_dedup(job: Any, job_token: str) -> dict[str, Any]:
    return await process_dedup_with_dependencies(
        job,
        job_token,
        build_article_processor_dependencies(),
    )


async def process_embed(job: Any, job_token: str) -> dict[str, Any]:
    return await process_embed_with_dependencies(
        job,
        job_token,
        build_article_embed_processor_dependencies(),
    )
