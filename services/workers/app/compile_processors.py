from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from .runtime_values import coerce_bool, coerce_positive_int
from .worker_queues import (
    CRITERION_COMPILE_CONSUMER,
    INTEREST_CENTROIDS_INDEX_NAME,
    INTEREST_COMPILE_CONSUMER,
)


@dataclass(frozen=True)
class InterestCompileProcessorDependencies:
    open_connection: Callable[[], Awaitable[Any]]
    is_event_processed: Callable[..., Awaitable[bool]]
    fetch_interest_for_update: Callable[..., Awaitable[dict[str, Any]]]
    interest_compiler: Any
    embedding_provider: Any
    feature_extractor: Any
    upsert_embedding_registry: Callable[..., Awaitable[str]]
    compute_content_hash: Callable[..., str]
    upsert_interest_vector_registry: Callable[..., Awaitable[None]]
    resolve_interest_hnsw_label: Callable[..., Awaitable[int]]
    mark_interest_hnsw_dirty: Callable[..., Awaitable[None]]
    upsert_interest_compiled_row: Callable[..., Awaitable[None]]
    update_interest_compile_status: Callable[..., Awaitable[None]]
    record_processed_event: Callable[..., Awaitable[None]]
    queue_interest_auto_repair_job: Callable[..., Awaitable[dict[str, Any]]]
    interest_indexer: Any
    logger: Any


@dataclass(frozen=True)
class CriterionCompileProcessorDependencies:
    open_connection: Callable[[], Awaitable[Any]]
    is_event_processed: Callable[..., Awaitable[bool]]
    fetch_criterion_for_update: Callable[..., Awaitable[dict[str, Any]]]
    criterion_compiler: Any
    embedding_provider: Any
    feature_extractor: Any
    upsert_embedding_registry: Callable[..., Awaitable[str]]
    compute_content_hash: Callable[..., str]
    upsert_criterion_compiled_row: Callable[..., Awaitable[None]]
    update_criterion_compile_status: Callable[..., Awaitable[None]]
    record_processed_event: Callable[..., Awaitable[None]]


def build_interest_compile_processor_dependencies() -> InterestCompileProcessorDependencies:
    from . import main as legacy_main

    return InterestCompileProcessorDependencies(
        open_connection=legacy_main.open_connection,
        is_event_processed=legacy_main.is_event_processed,
        fetch_interest_for_update=legacy_main.fetch_interest_for_update,
        interest_compiler=legacy_main.INTEREST_COMPILER,
        embedding_provider=legacy_main.EMBEDDING_PROVIDER,
        feature_extractor=legacy_main.FEATURE_EXTRACTOR,
        upsert_embedding_registry=legacy_main.upsert_embedding_registry,
        compute_content_hash=legacy_main.compute_content_hash,
        upsert_interest_vector_registry=legacy_main.upsert_interest_vector_registry,
        resolve_interest_hnsw_label=legacy_main.resolve_interest_hnsw_label,
        mark_interest_hnsw_dirty=legacy_main.mark_interest_hnsw_dirty,
        upsert_interest_compiled_row=legacy_main.upsert_interest_compiled_row,
        update_interest_compile_status=legacy_main.update_interest_compile_status,
        record_processed_event=legacy_main.record_processed_event,
        queue_interest_auto_repair_job=legacy_main.queue_interest_auto_repair_job,
        interest_indexer=legacy_main.INTEREST_INDEXER,
        logger=legacy_main.LOGGER,
    )


def build_criterion_compile_processor_dependencies() -> CriterionCompileProcessorDependencies:
    from . import main as legacy_main

    return CriterionCompileProcessorDependencies(
        open_connection=legacy_main.open_connection,
        is_event_processed=legacy_main.is_event_processed,
        fetch_criterion_for_update=legacy_main.fetch_criterion_for_update,
        criterion_compiler=legacy_main.CRITERION_COMPILER,
        embedding_provider=legacy_main.EMBEDDING_PROVIDER,
        feature_extractor=legacy_main.FEATURE_EXTRACTOR,
        upsert_embedding_registry=legacy_main.upsert_embedding_registry,
        compute_content_hash=legacy_main.compute_content_hash,
        upsert_criterion_compiled_row=legacy_main.upsert_criterion_compiled_row,
        update_criterion_compile_status=legacy_main.update_criterion_compile_status,
        record_processed_event=legacy_main.record_processed_event,
    )


async def process_interest_compile_with_dependencies(
    job: Any,
    _job_token: str,
    deps: InterestCompileProcessorDependencies,
) -> dict[str, Any]:
    event_id = str(job.data.get("eventId"))
    interest_id = str(job.data.get("interestId"))
    source_version = coerce_positive_int(job.data.get("version"), 1)
    skip_auto_repair = coerce_bool(job.data.get("skipAutoRepair"))
    interest_user_id: str | None = None

    if not event_id or event_id == "None" or not interest_id or interest_id == "None":
        raise ValueError("Interest compile worker expected eventId and interestId.")

    connection = await deps.open_connection()
    async with connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                if await deps.is_event_processed(
                    cursor,
                    INTEREST_COMPILE_CONSUMER,
                    event_id,
                ):
                    return {"status": "duplicate-event", "interestId": interest_id}

                interest = await deps.fetch_interest_for_update(cursor, interest_id)
                interest_user_id = str(interest.get("user_id"))
                current_version = coerce_positive_int(interest.get("version"), 1)
                if current_version != source_version:
                    await deps.record_processed_event(
                        cursor,
                        INTEREST_COMPILE_CONSUMER,
                        event_id,
                    )
                    return {
                        "status": "stale-version",
                        "interestId": interest_id,
                        "expectedVersion": current_version,
                        "eventVersion": source_version,
                    }

                try:
                    compiled = deps.interest_compiler.compile(
                        interest,
                        deps.embedding_provider,
                    )
                    target_features = deps.feature_extractor.extract(
                        title=str(interest.get("description") or ""),
                        lead=" ".join(compiled.positive_prototypes),
                        body=" ".join(compiled.negative_prototypes),
                    )
                    positive_embedding_ids: list[str] = []
                    negative_embedding_ids: list[str] = []

                    for index, (prototype_text, vector) in enumerate(
                        zip(compiled.positive_prototypes, compiled.positive_embeddings)
                    ):
                        vector_type = f"positive:{index}"
                        embedding_id = await deps.upsert_embedding_registry(
                            cursor,
                            entity_type="interest",
                            entity_id=interest["interest_id"],
                            vector_type=vector_type,
                            model_key=compiled.model_key,
                            vector_version=source_version,
                            vector=vector,
                            content_hash=deps.compute_content_hash(
                                {
                                    "prototype": prototype_text,
                                    "vectorType": vector_type,
                                    "version": source_version,
                                }
                            ),
                        )
                        positive_embedding_ids.append(embedding_id)
                        await deps.upsert_interest_vector_registry(
                            cursor,
                            interest_id=interest["interest_id"],
                            vector_type=vector_type,
                            embedding_id=embedding_id,
                            vector_version=source_version,
                        )

                    for index, (prototype_text, vector) in enumerate(
                        zip(compiled.negative_prototypes, compiled.negative_embeddings)
                    ):
                        vector_type = f"negative:{index}"
                        embedding_id = await deps.upsert_embedding_registry(
                            cursor,
                            entity_type="interest",
                            entity_id=interest["interest_id"],
                            vector_type=vector_type,
                            model_key=compiled.model_key,
                            vector_version=source_version,
                            vector=vector,
                            content_hash=deps.compute_content_hash(
                                {
                                    "prototype": prototype_text,
                                    "vectorType": vector_type,
                                    "version": source_version,
                                }
                            ),
                        )
                        negative_embedding_ids.append(embedding_id)
                        await deps.upsert_interest_vector_registry(
                            cursor,
                            interest_id=interest["interest_id"],
                            vector_type=vector_type,
                            embedding_id=embedding_id,
                            vector_version=source_version,
                        )

                    hnsw_label = await deps.resolve_interest_hnsw_label(
                        cursor,
                        interest_id=interest["interest_id"],
                        model_key=compiled.model_key,
                        dimensions=compiled.dimensions,
                    )
                    centroid_embedding_id = await deps.upsert_embedding_registry(
                        cursor,
                        entity_type="interest",
                        entity_id=interest["interest_id"],
                        vector_type="centroid",
                        model_key=compiled.model_key,
                        vector_version=source_version,
                        vector=compiled.centroid_embedding,
                        content_hash=deps.compute_content_hash(
                            {
                                "positivePrototypes": compiled.positive_prototypes,
                                "vectorType": "centroid",
                                "version": source_version,
                            }
                        ),
                    )
                    await deps.upsert_interest_vector_registry(
                        cursor,
                        interest_id=interest["interest_id"],
                        vector_type="centroid",
                        embedding_id=centroid_embedding_id,
                        vector_version=source_version,
                        hnsw_index_name=INTEREST_CENTROIDS_INDEX_NAME,
                        hnsw_label=hnsw_label,
                    )
                    await deps.mark_interest_hnsw_dirty(
                        cursor,
                        model_key=compiled.model_key,
                        dimensions=compiled.dimensions,
                    )

                    compiled_payload = {
                        "positive_prototypes": compiled.positive_prototypes,
                        "negative_prototypes": compiled.negative_prototypes,
                        "lexical_query": compiled.lexical_query,
                        "hard_constraints": compiled.hard_constraints,
                        "positive_embedding_ids": positive_embedding_ids,
                        "negative_embedding_ids": negative_embedding_ids,
                        "centroid_embedding_id": centroid_embedding_id,
                        "hnsw_index_name": INTEREST_CENTROIDS_INDEX_NAME,
                        "hnsw_label": hnsw_label,
                        "target_features": {
                            "numbers": target_features.numbers,
                            "short_tokens": target_features.short_tokens,
                            "places": target_features.places,
                            "entities": target_features.entities,
                        },
                        "model_key": compiled.model_key,
                        "dimensions": compiled.dimensions,
                    }
                    await deps.upsert_interest_compiled_row(
                        cursor,
                        interest_id=interest["interest_id"],
                        source_version=source_version,
                        compile_status="compiled",
                        source_snapshot_json=compiled.source_snapshot,
                        compiled_json=compiled_payload,
                        centroid_embedding_id=centroid_embedding_id,
                        error_text=None,
                    )
                    await deps.update_interest_compile_status(
                        cursor,
                        interest_id=interest["interest_id"],
                        compiled=True,
                        compile_status="compiled",
                    )
                except Exception as error:
                    await deps.upsert_interest_compiled_row(
                        cursor,
                        interest_id=interest["interest_id"],
                        source_version=source_version,
                        compile_status="failed",
                        source_snapshot_json={"interestId": str(interest["interest_id"])},
                        compiled_json={},
                        centroid_embedding_id=None,
                        error_text=str(error),
                    )
                    await deps.update_interest_compile_status(
                        cursor,
                        interest_id=interest["interest_id"],
                        compiled=False,
                        compile_status="failed",
                    )
                    await deps.record_processed_event(
                        cursor,
                        INTEREST_COMPILE_CONSUMER,
                        event_id,
                    )
                    return {
                        "status": "failed",
                        "interestId": interest_id,
                        "error": str(error),
                    }

                await deps.record_processed_event(
                    cursor,
                    INTEREST_COMPILE_CONSUMER,
                    event_id,
                )

    auto_repair_result: dict[str, Any] | None = None
    if skip_auto_repair:
        auto_repair_result = {
            "status": "skipped",
            "reason": "skipAutoRepair",
        }
    elif interest_user_id:
        try:
            auto_repair_result = await deps.queue_interest_auto_repair_job(
                user_id=interest_user_id,
                interest_id=interest_id,
                source_version=source_version,
            )
        except Exception as error:  # pragma: no cover - DB/env dependent
            deps.logger.error(
                "Interest auto-repair queueing failed for %s: %s",
                interest_id,
                error,
            )
            auto_repair_result = {
                "status": "failed",
                "error": str(error),
            }

    try:
        rebuild_result = await deps.interest_indexer.rebuild_interest_centroids()
        return {
            "status": "compiled",
            "interestId": interest_id,
            "version": source_version,
            "rebuild": rebuild_result,
            "autoRepair": auto_repair_result,
        }
    except Exception as error:  # pragma: no cover - env and filesystem dependent
        deps.logger.error("Interest centroid rebuild failed after compile: %s", error)
        return {
            "status": "compiled-hnsw-dirty",
            "interestId": interest_id,
            "version": source_version,
            "error": str(error),
            "autoRepair": auto_repair_result,
        }


async def process_criterion_compile_with_dependencies(
    job: Any,
    _job_token: str,
    deps: CriterionCompileProcessorDependencies,
) -> dict[str, Any]:
    event_id = str(job.data.get("eventId"))
    criterion_id = str(job.data.get("criterionId"))
    source_version = coerce_positive_int(job.data.get("version"), 1)

    if not event_id or event_id == "None" or not criterion_id or criterion_id == "None":
        raise ValueError("Criterion compile worker expected eventId and criterionId.")

    connection = await deps.open_connection()
    async with connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                if await deps.is_event_processed(
                    cursor,
                    CRITERION_COMPILE_CONSUMER,
                    event_id,
                ):
                    return {"status": "duplicate-event", "criterionId": criterion_id}

                criterion = await deps.fetch_criterion_for_update(cursor, criterion_id)
                current_version = coerce_positive_int(criterion.get("version"), 1)
                if current_version != source_version:
                    await deps.record_processed_event(
                        cursor,
                        CRITERION_COMPILE_CONSUMER,
                        event_id,
                    )
                    return {
                        "status": "stale-version",
                        "criterionId": criterion_id,
                        "expectedVersion": current_version,
                        "eventVersion": source_version,
                    }

                try:
                    compiled = deps.criterion_compiler.compile(
                        criterion,
                        deps.embedding_provider,
                    )
                    target_features = deps.feature_extractor.extract(
                        title=str(criterion.get("description") or ""),
                        lead=" ".join(compiled.positive_prototypes),
                        body=" ".join(compiled.negative_prototypes),
                    )
                    positive_embedding_ids: list[str] = []
                    negative_embedding_ids: list[str] = []

                    for index, (prototype_text, vector) in enumerate(
                        zip(compiled.positive_prototypes, compiled.positive_embeddings)
                    ):
                        vector_type = f"positive:{index}"
                        embedding_id = await deps.upsert_embedding_registry(
                            cursor,
                            entity_type="criterion",
                            entity_id=criterion["criterion_id"],
                            vector_type=vector_type,
                            model_key=compiled.model_key,
                            vector_version=source_version,
                            vector=vector,
                            content_hash=deps.compute_content_hash(
                                {
                                    "prototype": prototype_text,
                                    "vectorType": vector_type,
                                    "version": source_version,
                                }
                            ),
                        )
                        positive_embedding_ids.append(embedding_id)

                    for index, (prototype_text, vector) in enumerate(
                        zip(compiled.negative_prototypes, compiled.negative_embeddings)
                    ):
                        vector_type = f"negative:{index}"
                        embedding_id = await deps.upsert_embedding_registry(
                            cursor,
                            entity_type="criterion",
                            entity_id=criterion["criterion_id"],
                            vector_type=vector_type,
                            model_key=compiled.model_key,
                            vector_version=source_version,
                            vector=vector,
                            content_hash=deps.compute_content_hash(
                                {
                                    "prototype": prototype_text,
                                    "vectorType": vector_type,
                                    "version": source_version,
                                }
                            ),
                        )
                        negative_embedding_ids.append(embedding_id)

                    centroid_embedding_id = await deps.upsert_embedding_registry(
                        cursor,
                        entity_type="criterion",
                        entity_id=criterion["criterion_id"],
                        vector_type="centroid",
                        model_key=compiled.model_key,
                        vector_version=source_version,
                        vector=compiled.centroid_embedding,
                        content_hash=deps.compute_content_hash(
                            {
                                "positivePrototypes": compiled.positive_prototypes,
                                "vectorType": "centroid",
                                "version": source_version,
                            }
                        ),
                    )

                    compiled_payload = {
                        "positive_prototypes": compiled.positive_prototypes,
                        "negative_prototypes": compiled.negative_prototypes,
                        "lexical_query": compiled.lexical_query,
                        "hard_constraints": compiled.hard_constraints,
                        "positive_embedding_ids": positive_embedding_ids,
                        "negative_embedding_ids": negative_embedding_ids,
                        "centroid_embedding_id": centroid_embedding_id,
                        "target_features": {
                            "numbers": target_features.numbers,
                            "short_tokens": target_features.short_tokens,
                            "places": target_features.places,
                            "entities": target_features.entities,
                        },
                        "model_key": compiled.model_key,
                        "dimensions": compiled.dimensions,
                    }
                    await deps.upsert_criterion_compiled_row(
                        cursor,
                        criterion_id=criterion["criterion_id"],
                        source_version=source_version,
                        compile_status="compiled",
                        source_snapshot_json=compiled.source_snapshot,
                        compiled_json=compiled_payload,
                        centroid_embedding_id=centroid_embedding_id,
                        error_text=None,
                    )
                    await deps.update_criterion_compile_status(
                        cursor,
                        criterion_id=criterion["criterion_id"],
                        compiled=True,
                        compile_status="compiled",
                    )
                except Exception as error:
                    await deps.upsert_criterion_compiled_row(
                        cursor,
                        criterion_id=criterion["criterion_id"],
                        source_version=source_version,
                        compile_status="failed",
                        source_snapshot_json={
                            "criterionId": str(criterion["criterion_id"])
                        },
                        compiled_json={},
                        centroid_embedding_id=None,
                        error_text=str(error),
                    )
                    await deps.update_criterion_compile_status(
                        cursor,
                        criterion_id=criterion["criterion_id"],
                        compiled=False,
                        compile_status="failed",
                    )
                    await deps.record_processed_event(
                        cursor,
                        CRITERION_COMPILE_CONSUMER,
                        event_id,
                    )
                    return {
                        "status": "failed",
                        "criterionId": criterion_id,
                        "error": str(error),
                    }

                await deps.record_processed_event(
                    cursor,
                    CRITERION_COMPILE_CONSUMER,
                    event_id,
                )

    return {
        "status": "compiled",
        "criterionId": criterion_id,
        "version": source_version,
    }


async def process_interest_compile(job: Any, _job_token: str) -> dict[str, Any]:
    return await process_interest_compile_with_dependencies(
        job,
        _job_token,
        build_interest_compile_processor_dependencies(),
    )


async def process_criterion_compile(job: Any, _job_token: str) -> dict[str, Any]:
    return await process_criterion_compile_with_dependencies(
        job,
        _job_token,
        build_criterion_compile_processor_dependencies(),
    )
