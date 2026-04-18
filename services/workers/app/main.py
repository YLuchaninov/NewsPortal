from __future__ import annotations

import asyncio
import hashlib
import html
import json
import logging
import os
import re
import signal
import sys
import unicodedata
import uuid
from collections.abc import Mapping, Sequence
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from urllib.parse import urlparse

SERVICES_ROOT = Path(__file__).resolve().parents[2]
if str(SERVICES_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICES_ROOT))

import psycopg
import redis
from bullmq import Job, Worker
from psycopg.rows import dict_row
from psycopg.types.json import Json

from indexer.app import InterestCentroidIndexer, load_indexer_config
from ml.app import (
    CriterionBaselineCompiler,
    HeuristicArticleFeatureExtractor,
    InterestBaselineCompiler,
    load_embedding_provider,
    mix_weighted_vectors,
    truncate_text_for_embedding,
)
from .delivery import dispatch_channel_message
from .canonical_documents import sync_article_canonical_document
from .digests import (
    DigestItem,
    build_digest_subject,
    coerce_digest_cadence,
    coerce_digest_send_hour,
    coerce_digest_send_minute,
    compute_next_digest_run_at,
    render_digest_html,
    render_digest_text,
    validate_timezone_name,
)
from .final_selection import (
    apply_document_candidate_signal_uplift,
    summarize_final_selection_result,
)
from .interest_filters import (
    build_interest_filter_explain,
    resolve_criterion_filter_outcome,
    resolve_interest_filter_context,
    resolve_user_interest_filter_outcome,
    upsert_interest_filter_result,
)
from .gemini import review_with_gemini
from .lexical import build_lexical_tsquery
from .notification_preferences import (
    is_channel_enabled_by_preferences,
    normalize_notification_preferences,
)
from .prompting import render_llm_prompt_template
from .reindex_backfill import (
    HistoricalBackfillDependencies,
    replay_historical_articles as replay_historical_articles_with_snapshot,
)
from .scoring import (
    compute_cluster_same_event_score,
    compute_criterion_final_score,
    compute_criterion_meta_score,
    compute_interest_final_score,
    compute_interest_meta_score,
    cosine_similarity,
    decide_cluster,
    decide_criterion,
    decide_interest,
    hours_between,
    is_major_update,
    normalize_fts_score,
    overlap_ratio,
    parse_datetime,
    place_match_score,
    semantic_prototype_score,
)
from .selection_profiles import (
    build_selection_profile_runtime_explain,
    coerce_selection_profile_runtime,
    resolve_profile_gray_zone_decision,
    selection_profile_allows_llm_review,
)
from .story_clusters import sync_story_cluster_and_verification
from .system_feed import summarize_system_feed_result
from .task_engine import (
    configure_discovery_runtime,
    enqueue_sequence_run_job_async,
    PostgresSequenceRepository,
    SequenceCronScheduler,
    SequenceRunJobProcessor,
)
from .task_engine.adapters import build_live_discovery_runtime, discovery_enabled

LOGGER = logging.getLogger("newsportal.workers")

NORMALIZE_QUEUE = "q.normalize"
DEDUP_QUEUE = "q.dedup"
EMBED_QUEUE = "q.embed"
CLUSTER_QUEUE = "q.cluster"
CRITERIA_MATCH_QUEUE = "q.match.criteria"
INTEREST_MATCH_QUEUE = "q.match.interests"
NOTIFY_QUEUE = "q.notify"
LLM_REVIEW_QUEUE = "q.llm.review"
FEEDBACK_INGEST_QUEUE = "q.feedback.ingest"
REINDEX_QUEUE = "q.reindex"
INTEREST_COMPILE_QUEUE = "q.interest.compile"
CRITERION_COMPILE_QUEUE = "q.criterion.compile"
SEQUENCE_QUEUE = "q.sequence"

NORMALIZE_CONSUMER = "worker.normalize"
DEDUP_CONSUMER = "worker.dedup"
EMBED_CONSUMER = "worker.embed"
CLUSTER_CONSUMER = "worker.cluster"
CRITERIA_MATCH_CONSUMER = "worker.match.criteria"
INTEREST_MATCH_CONSUMER = "worker.match.interests"
NOTIFY_CONSUMER = "worker.notify"
LLM_REVIEW_CONSUMER = "worker.llm.review"
FEEDBACK_INGEST_CONSUMER = "worker.feedback.ingest"
REINDEX_CONSUMER = "worker.reindex"
INTEREST_COMPILE_CONSUMER = "worker.interest.compile"
CRITERION_COMPILE_CONSUMER = "worker.criterion.compile"

ARTICLE_NORMALIZED_EVENT = "article.normalized"
ARTICLE_EMBEDDED_EVENT = "article.embedded"
ARTICLE_CLUSTERED_EVENT = "article.clustered"
ARTICLE_CRITERIA_MATCHED_EVENT = "article.criteria.matched"
ARTICLE_INTERESTS_MATCHED_EVENT = "article.interests.matched"
LLM_REVIEW_REQUESTED_EVENT = "llm.review.requested"
REINDEX_REQUESTED_EVENT = "reindex.requested"
INTEREST_CENTROIDS_INDEX_NAME = "interest_centroids"
EVENT_CLUSTER_CENTROIDS_INDEX_NAME = "event_cluster_centroids"
_ZERO_USD = Decimal("0")
_USD_TO_CENTS = Decimal("100")

PROCESSING_STATE_ORDER = {
    "raw": 0,
    "normalized": 1,
    "deduped": 2,
    "embedded": 3,
    "clustered": 4,
    "matched": 5,
    "notified": 6,
}

EMBEDDING_PROVIDER = load_embedding_provider()
FEATURE_EXTRACTOR = HeuristicArticleFeatureExtractor()
INTEREST_COMPILER = InterestBaselineCompiler()
CRITERION_COMPILER = CriterionBaselineCompiler()
INTEREST_INDEXER = InterestCentroidIndexer(load_indexer_config())


def build_database_url() -> str:
    if os.getenv("DATABASE_URL"):
        return os.environ["DATABASE_URL"]

    user = os.getenv("POSTGRES_USER", "newsportal")
    password = os.getenv("POSTGRES_PASSWORD", "newsportal")
    host = os.getenv("POSTGRES_HOST", "127.0.0.1")
    port = os.getenv(
        "POSTGRES_PORT",
        "55432" if host in {"127.0.0.1", "localhost"} else "5432",
    )
    database = os.getenv("POSTGRES_DB", "newsportal")
    return f"postgresql://{user}:{password}@{host}:{port}/{database}"


def build_redis_url() -> str:
    if os.getenv("REDIS_URL"):
        return os.environ["REDIS_URL"]

    host = os.getenv("REDIS_HOST", "127.0.0.1")
    port = os.getenv(
        "REDIS_PORT",
        "56379" if host in {"127.0.0.1", "localhost"} else "6379",
    )
    return f"redis://{host}:{port}"


def build_redis_connection_options() -> dict[str, Any]:
    parsed = urlparse(build_redis_url())
    return {
        "host": parsed.hostname or "127.0.0.1",
        "port": parsed.port or 6379,
        "db": int(parsed.path.lstrip("/") or "0"),
    }


def check_database() -> None:
    with psycopg.connect(build_database_url()) as connection:
        with connection.cursor() as cursor:
            cursor.execute("select 1")


def check_redis() -> None:
    client = redis.Redis.from_url(build_redis_url())
    try:
        client.ping()
    finally:
        client.close()


def env_flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def legacy_queue_consumers_enabled() -> bool:
    return env_flag("WORKER_ENABLE_LEGACY_QUEUE_CONSUMERS", default=False)


def sequence_runner_enabled() -> bool:
    return env_flag("WORKER_ENABLE_SEQUENCE_RUNNER", default=True)


def sequence_cron_scheduler_enabled() -> bool:
    return env_flag("WORKER_ENABLE_SEQUENCE_CRON_SCHEDULER", default=True)


def sequence_runner_concurrency() -> int:
    raw_value = os.getenv("WORKER_SEQUENCE_RUNNER_CONCURRENCY", "1")
    try:
        return max(1, int(raw_value))
    except ValueError:
        return 1


def sequence_cron_poll_interval_seconds() -> float:
    raw_value = os.getenv("WORKER_SEQUENCE_CRON_POLL_INTERVAL_SECONDS", "30")
    try:
        return max(1.0, float(raw_value))
    except ValueError:
        return 30.0


def user_digest_scheduler_enabled() -> bool:
    return env_flag("WORKER_ENABLE_USER_DIGEST_SCHEDULER", default=True)


def user_digest_poll_interval_seconds() -> float:
    raw_value = os.getenv("WORKER_USER_DIGEST_POLL_INTERVAL_SECONDS", "60")
    try:
        return max(5.0, float(raw_value))
    except ValueError:
        return 60.0


def coerce_llm_cost_usd(value: Any) -> Decimal:
    if value is None:
        return _ZERO_USD
    if isinstance(value, Decimal):
        return value if value >= _ZERO_USD else _ZERO_USD
    try:
        parsed = Decimal(str(value).strip())
    except (InvalidOperation, AttributeError):
        return _ZERO_USD
    return parsed if parsed >= _ZERO_USD else _ZERO_USD


def llm_cost_usd_to_cents(value: Any) -> int:
    normalized = coerce_llm_cost_usd(value)
    return int((normalized * _USD_TO_CENTS).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def llm_review_month_start_utc(now: datetime | None = None) -> datetime:
    current = now.astimezone(timezone.utc) if now is not None else datetime.now(timezone.utc)
    return current.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def llm_review_enabled() -> bool:
    return env_flag("LLM_REVIEW_ENABLED", default=True)


def llm_review_monthly_budget_cents() -> int:
    raw_value = os.getenv("LLM_REVIEW_MONTHLY_BUDGET_CENTS", "0")
    try:
        return max(0, int(raw_value))
    except ValueError:
        return 0


def llm_review_accept_gray_zone_on_budget_exhaustion() -> bool:
    return env_flag("LLM_REVIEW_BUDGET_EXHAUST_ACCEPT_GRAY_ZONE", default=False)


async def get_llm_review_monthly_quota_snapshot(
    cursor: psycopg.AsyncCursor[Any],
) -> dict[str, Any]:
    month_start = llm_review_month_start_utc()
    await cursor.execute(
        """
        select
          coalesce(sum(cost_estimate_usd), 0) as month_to_date_cost_usd
        from llm_review_log
        where created_at >= %s
          and scope = 'criterion'
        """,
        (month_start,),
    )
    row = await cursor.fetchone() or {}
    month_to_date_cost_usd = coerce_llm_cost_usd(row.get("month_to_date_cost_usd"))
    budget_cents = llm_review_monthly_budget_cents()
    budget_usd = Decimal(budget_cents) / _USD_TO_CENTS
    quota_enabled = budget_cents > 0
    monthly_quota_reached = quota_enabled and month_to_date_cost_usd >= budget_usd
    remaining_cents = (
        llm_cost_usd_to_cents(max(budget_usd - month_to_date_cost_usd, Decimal("0")))
        if quota_enabled
        else None
    )
    return {
        "enabled": llm_review_enabled(),
        "monthlyBudgetCents": budget_cents,
        "monthToDateCostUsd": float(month_to_date_cost_usd),
        "monthToDateCostCents": llm_cost_usd_to_cents(month_to_date_cost_usd),
        "remainingMonthlyBudgetCents": remaining_cents,
        "monthlyQuotaReached": monthly_quota_reached,
        "acceptGrayZoneOnBudgetExhaustion": llm_review_accept_gray_zone_on_budget_exhaustion(),
        "monthStart": month_start,
    }


def resolve_criterion_gray_zone_runtime_resolution(
    quota_snapshot: Mapping[str, Any],
    *,
    preserve_candidate_gray_zone: bool = False,
) -> dict[str, Any] | None:
    if not bool(quota_snapshot.get("enabled", True)):
        if preserve_candidate_gray_zone:
            return {
                "reason": "llm_review_disabled",
                "policy": "hold_candidate_recovery_gray_zone",
                "providerDecision": "hold",
                "finalDecision": "gray_zone",
            }
        return {
            "reason": "llm_review_disabled",
            "policy": "reject_gray_zone",
            "providerDecision": "reject",
            "finalDecision": "irrelevant",
        }
    if not bool(quota_snapshot.get("monthlyQuotaReached")):
        return None
    accept_gray_zone = bool(quota_snapshot.get("acceptGrayZoneOnBudgetExhaustion"))
    if preserve_candidate_gray_zone:
        return {
            "reason": "monthly_budget_exhausted",
            "policy": "hold_candidate_recovery_gray_zone",
            "providerDecision": "hold",
            "finalDecision": "gray_zone",
        }
    return {
        "reason": "monthly_budget_exhausted",
        "policy": "accept_gray_zone" if accept_gray_zone else "reject_gray_zone",
        "providerDecision": "approve" if accept_gray_zone else "reject",
        "finalDecision": "relevant" if accept_gray_zone else "irrelevant",
    }


def build_llm_budget_gate_explain(
    *,
    quota_snapshot: Mapping[str, Any],
    resolution: Mapping[str, Any],
) -> dict[str, Any]:
    month_start = quota_snapshot.get("monthStart")
    return {
        "reason": str(resolution.get("reason") or ""),
        "policy": str(resolution.get("policy") or ""),
        "enabled": bool(quota_snapshot.get("enabled", True)),
        "monthlyQuotaReached": bool(quota_snapshot.get("monthlyQuotaReached")),
        "acceptGrayZoneOnBudgetExhaustion": bool(
            quota_snapshot.get("acceptGrayZoneOnBudgetExhaustion")
        ),
        "monthStartUtc": (
            month_start.isoformat() if hasattr(month_start, "isoformat") else str(month_start or "")
        ),
        "monthToDateCostCents": int(quota_snapshot.get("monthToDateCostCents") or 0),
        "budgetCents": int(quota_snapshot.get("monthlyBudgetCents") or 0),
        "remainingMonthlyBudgetCents": quota_snapshot.get("remainingMonthlyBudgetCents"),
    }


def suppress_downstream_outbox(job: Job) -> bool:
    job_data = job.data if isinstance(job.data, Mapping) else {}
    return coerce_bool(job_data.get("suppressDownstreamOutbox")) or coerce_bool(
        job_data.get("sequenceRuntime")
    )


def strip_html(value: str) -> str:
    without_scripts = re.sub(r"<script[\s\S]*?</script>", " ", value, flags=re.IGNORECASE)
    without_styles = re.sub(r"<style[\s\S]*?</style>", " ", without_scripts, flags=re.IGNORECASE)
    return re.sub(r"<[^>]+>", " ", without_styles)


def normalize_text(value: str) -> str:
    unescaped = html.unescape(value)
    nfkc = unicodedata.normalize("NFKC", unescaped)
    stripped = strip_html(nfkc)
    return re.sub(r"\s+", " ", stripped).strip()


def derive_lead(summary_source: str, body_source: str) -> str:
    summary = normalize_text(summary_source)
    if summary:
        return summary

    body = normalize_text(body_source)
    if not body:
        return ""

    sentences = re.split(r"(?<=[.!?])\s+", body)
    return " ".join(sentences[:3]).strip()


def detect_language(text: str, existing_hint: str | None) -> tuple[str | None, float | None]:
    if existing_hint:
        normalized = existing_hint.lower()
        if normalized.startswith("uk"):
            return ("uk", 0.9)
        if normalized.startswith("en"):
            return ("en", 0.9)
        return (normalized[:8], 0.6)

    lowered = text.lower()
    if any(character in lowered for character in ("і", "ї", "є", "ґ")):
        return ("uk", 0.7)
    if re.search(r"[а-яё]", lowered):
        return ("uk", 0.45)
    if re.search(r"[a-z]", lowered):
        return ("en", 0.45)
    return (None, None)


def compute_exact_hash(title: str, lead: str, body: str) -> str:
    payload = "\n".join((title, lead, body)).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def stable_hash64(token: str) -> int:
    digest = hashlib.sha256(token.encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big", signed=False)


def to_signed_int64(value: int) -> int:
    if value >= (1 << 63):
        return value - (1 << 64)
    return value


def to_unsigned_int64(value: int) -> int:
    if value < 0:
        return value + (1 << 64)
    return value


def compute_simhash64(text: str) -> int:
    tokens = re.findall(r"[0-9A-Za-zА-Яа-яЁёІіЇїЄєҐґ-]{2,}", text.lower())
    if not tokens:
        return 0

    weights = [0] * 64
    for token in tokens:
        hashed = stable_hash64(token)
        for bit_index in range(64):
            if hashed & (1 << bit_index):
                weights[bit_index] += 1
            else:
                weights[bit_index] -= 1

    result = 0
    for bit_index, weight in enumerate(weights):
        if weight >= 0:
            result |= 1 << bit_index

    return to_signed_int64(result)


def hamming_distance64(left: int, right: int) -> int:
    return (to_unsigned_int64(left) ^ to_unsigned_int64(right)).bit_count()


def coerce_positive_int(value: Any, fallback: int = 1) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return fallback
    return parsed if parsed > 0 else fallback


def coerce_nullable_positive_int(value: Any) -> int | None:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def coerce_bool(value: Any, fallback: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        normalized = value.strip().casefold()
        if normalized in {"1", "true", "yes", "on"}:
            return True
        if normalized in {"0", "false", "no", "off"}:
            return False
    return fallback


def coerce_optional_string(value: Any) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    if not normalized or normalized == "None":
        return None
    return normalized


def advance_processing_state(current_state: str | None, target_state: str) -> str:
    current_rank = PROCESSING_STATE_ORDER.get(current_state or "raw", 0)
    target_rank = PROCESSING_STATE_ORDER[target_state]
    return target_state if target_rank > current_rank else str(current_state or target_state)


def compute_content_hash(value: Any) -> str:
    safe_value = make_json_safe(value)
    payload = json.dumps(
        safe_value,
        ensure_ascii=True,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def make_json_safe(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, uuid.UUID):
        return str(value)
    if hasattr(value, "isoformat"):
        try:
            return value.isoformat()
        except TypeError:
            pass
    if isinstance(value, Mapping):
        return {
            str(key): make_json_safe(raw_value)
            for key, raw_value in value.items()
        }
    if isinstance(value, (list, tuple, set)):
        return [make_json_safe(item) for item in value]
    return str(value)


async def open_connection() -> psycopg.AsyncConnection[Any]:
    return await psycopg.AsyncConnection.connect(
        build_database_url(),
        row_factory=dict_row,
    )


async def is_event_processed(
    cursor: psycopg.AsyncCursor[Any],
    consumer_name: str,
    event_id: str,
) -> bool:
    await cursor.execute(
        """
        select 1
        from inbox_processed_events
        where consumer_name = %s and event_id = %s
        """,
        (consumer_name, event_id),
    )
    return await cursor.fetchone() is not None


async def record_processed_event(
    cursor: psycopg.AsyncCursor[Any],
    consumer_name: str,
    event_id: str,
) -> None:
    await cursor.execute(
        """
        insert into inbox_processed_events (consumer_name, event_id)
        values (%s, %s)
        on conflict (consumer_name, event_id) do nothing
        """,
        (consumer_name, event_id),
    )


async def insert_outbox_event(
    cursor: psycopg.AsyncCursor[Any],
    event_type: str,
    aggregate_type: str,
    aggregate_id: uuid.UUID,
    payload: dict[str, Any],
) -> None:
    await cursor.execute(
        """
        insert into outbox_events (
          event_id,
          event_type,
          aggregate_type,
          aggregate_id,
          payload_json
        )
        values (%s, %s, %s, %s, %s::jsonb)
        """,
        (
            str(uuid.uuid4()),
            event_type,
            aggregate_type,
            aggregate_id,
            Json(make_json_safe(payload)),
        ),
    )


async def ensure_published_outbox_event(
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
                        Json(make_json_safe(payload)),
                    ),
                )


async def fetch_article_for_update(
    cursor: psycopg.AsyncCursor[Any],
    doc_id: str,
) -> dict[str, Any]:
    await cursor.execute(
        """
        select
          a.*,
          sc.language as channel_language
        from articles a
        join source_channels sc on sc.channel_id = a.channel_id
        where a.doc_id = %s
        for update of a
        """,
        (doc_id,),
    )
    article = await cursor.fetchone()
    if article is None:
        raise ValueError(f"Article {doc_id} was not found.")
    return article


async def fetch_interest_for_update(
    cursor: psycopg.AsyncCursor[Any],
    interest_id: str,
) -> dict[str, Any]:
    await cursor.execute(
        """
        select *
        from user_interests
        where interest_id = %s
        for update
        """,
        (interest_id,),
    )
    interest = await cursor.fetchone()
    if interest is None:
        raise ValueError(f"Interest {interest_id} was not found.")
    return interest


async def fetch_criterion_for_update(
    cursor: psycopg.AsyncCursor[Any],
    criterion_id: str,
) -> dict[str, Any]:
    await cursor.execute(
        """
        select *
        from criteria
        where criterion_id = %s
        for update
        """,
        (criterion_id,),
    )
    criterion = await cursor.fetchone()
    if criterion is None:
        raise ValueError(f"Criterion {criterion_id} was not found.")
    return criterion


def extract_raw_rss_payload(article: dict[str, Any]) -> tuple[str, str, str]:
    raw_payload = article.get("raw_payload_json") or {}
    entry_payload = raw_payload.get("entry") if isinstance(raw_payload, dict) else {}
    rss_payload = raw_payload.get("rss") if isinstance(raw_payload, dict) else {}
    if not isinstance(entry_payload, dict):
        entry_payload = {}
    if not isinstance(rss_payload, dict):
        rss_payload = {}

    title_source = str(article.get("title") or entry_payload.get("title") or rss_payload.get("title") or "")
    summary_source = str(
        article.get("extracted_description")
        or entry_payload.get("description")
        or rss_payload.get("description")
        or article.get("lead")
        or ""
    )
    content_source = str(
        article.get("full_content_html")
        or entry_payload.get("contentEncoded")
        or rss_payload.get("contentEncoded")
        or article.get("body")
        or ""
    )
    return (title_source, summary_source, content_source)


async def upsert_article_features(
    cursor: psycopg.AsyncCursor[Any],
    doc_id: uuid.UUID,
    *,
    numbers: Sequence[str],
    short_tokens: Sequence[str],
    places: Sequence[str],
    entities: Sequence[str],
    search_vector_version: int,
    feature_version: int,
) -> None:
    await cursor.execute(
        """
        insert into article_features (
          doc_id,
          numbers,
          short_tokens,
          places,
          entities,
          search_vector_version,
          feature_version
        )
        values (%s, %s, %s, %s, %s, %s, %s)
        on conflict (doc_id) do update
        set
          numbers = excluded.numbers,
          short_tokens = excluded.short_tokens,
          places = excluded.places,
          entities = excluded.entities,
          search_vector_version = excluded.search_vector_version,
          feature_version = excluded.feature_version,
          updated_at = now()
        """,
        (
            doc_id,
            list(numbers),
            list(short_tokens),
            list(places),
            list(entities),
            search_vector_version,
            feature_version,
        ),
    )


async def upsert_embedding_registry(
    cursor: psycopg.AsyncCursor[Any],
    *,
    entity_type: str,
    entity_id: uuid.UUID,
    vector_type: str,
    model_key: str,
    vector_version: int,
    vector: Sequence[float],
    content_hash: str,
) -> str:
    safe_vector = [float(value) for value in vector]
    await cursor.execute(
        """
        select embedding_id::text as embedding_id
        from embedding_registry
        where entity_type = %s
          and entity_id = %s
          and vector_type = %s
          and content_hash = %s
        limit 1
        """,
        (entity_type, entity_id, vector_type, content_hash),
    )
    existing = await cursor.fetchone()

    if existing is None:
        await cursor.execute(
            """
            insert into embedding_registry (
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
            values (%s, %s, %s, %s, %s, %s, %s::jsonb, %s, true)
            returning embedding_id::text as embedding_id
            """,
            (
                entity_type,
                entity_id,
                vector_type,
                model_key,
                vector_version,
                len(safe_vector),
                Json(safe_vector),
                content_hash,
            ),
        )
        existing = await cursor.fetchone()
    else:
        await cursor.execute(
            """
            update embedding_registry
            set
              model_key = %s,
              vector_version = %s,
              dimensions = %s,
              embedding_json = %s::jsonb,
              is_active = true,
              updated_at = now()
            where embedding_id = %s
            """,
            (
                model_key,
                vector_version,
                len(safe_vector),
                Json(safe_vector),
                existing["embedding_id"],
            ),
        )

    embedding_id = str(existing["embedding_id"])
    await cursor.execute(
        """
        update embedding_registry
        set
          is_active = (embedding_id = %s::uuid),
          updated_at = case when embedding_id = %s::uuid then now() else updated_at end
        where entity_type = %s
          and entity_id = %s
          and vector_type = %s
        """,
        (
            embedding_id,
            embedding_id,
            entity_type,
            entity_id,
            vector_type,
        ),
    )
    return embedding_id


async def upsert_article_vector_registry(
    cursor: psycopg.AsyncCursor[Any],
    *,
    doc_id: uuid.UUID,
    vector_type: str,
    embedding_id: str,
    vector_version: int,
) -> None:
    await cursor.execute(
        """
        insert into article_vector_registry (
          doc_id,
          vector_type,
          embedding_id,
          vector_version,
          is_active,
          updated_at
        )
        values (%s, %s, %s, %s, true, now())
        on conflict (doc_id, vector_type, vector_version) do update
        set
          embedding_id = excluded.embedding_id,
          is_active = true,
          updated_at = now()
        """,
        (doc_id, vector_type, embedding_id, vector_version),
    )


async def upsert_event_vector_registry(
    cursor: psycopg.AsyncCursor[Any],
    *,
    entity_type: str,
    entity_id: uuid.UUID,
    vector_type: str,
    embedding_id: str,
    vector_version: int,
    hnsw_index_name: str | None = None,
    hnsw_label: int | None = None,
) -> None:
    await cursor.execute(
        """
        insert into event_vector_registry (
          entity_type,
          entity_id,
          vector_type,
          embedding_id,
          hnsw_index_name,
          hnsw_label,
          vector_version,
          is_active,
          updated_at
        )
        values (%s, %s, %s, %s, %s, %s, %s, true, now())
        on conflict (entity_type, entity_id, vector_type, vector_version) do update
        set
          embedding_id = excluded.embedding_id,
          hnsw_index_name = excluded.hnsw_index_name,
          hnsw_label = excluded.hnsw_label,
          is_active = true,
          updated_at = now()
        """,
        (
            entity_type,
            entity_id,
            vector_type,
            embedding_id,
            hnsw_index_name,
            hnsw_label,
            vector_version,
        ),
    )


async def upsert_interest_vector_registry(
    cursor: psycopg.AsyncCursor[Any],
    *,
    interest_id: uuid.UUID,
    vector_type: str,
    embedding_id: str,
    vector_version: int,
    hnsw_index_name: str | None = None,
    hnsw_label: int | None = None,
) -> None:
    await cursor.execute(
        """
        update interest_vector_registry
        set
          is_active = false,
          updated_at = now()
        where interest_id = %s
          and vector_type = %s
          and vector_version <> %s
          and is_active = true
        """,
        (interest_id, vector_type, vector_version),
    )
    await cursor.execute(
        """
        insert into interest_vector_registry (
          interest_id,
          vector_type,
          embedding_id,
          hnsw_index_name,
          hnsw_label,
          vector_version,
          is_active,
          updated_at
        )
        values (%s, %s, %s, %s, %s, %s, true, now())
        on conflict (interest_id, vector_type, vector_version) do update
        set
          embedding_id = excluded.embedding_id,
          hnsw_index_name = excluded.hnsw_index_name,
          hnsw_label = excluded.hnsw_label,
          is_active = true,
          updated_at = now()
        """,
        (
            interest_id,
            vector_type,
            embedding_id,
            hnsw_index_name,
            hnsw_label,
            vector_version,
        ),
    )


async def resolve_interest_hnsw_label(
    cursor: psycopg.AsyncCursor[Any],
    *,
    interest_id: uuid.UUID,
    model_key: str,
    dimensions: int,
) -> int:
    await cursor.execute(
        """
        select hnsw_label
        from interest_vector_registry
        where interest_id = %s
          and vector_type = 'centroid'
          and hnsw_label is not null
        order by updated_at desc
        limit 1
        """,
        (interest_id,),
    )
    existing_label = await cursor.fetchone()
    if existing_label is not None and existing_label["hnsw_label"] is not None:
        return int(existing_label["hnsw_label"])

    await cursor.execute(
        """
        select last_assigned_label
        from hnsw_registry
        where index_name = %s
        for update
        """,
        (INTEREST_CENTROIDS_INDEX_NAME,),
    )
    registry_row = await cursor.fetchone()
    if registry_row is None:
        await cursor.execute(
            """
            insert into hnsw_registry (
              index_name,
              model_key,
              dimensions,
              vector_version,
              entry_count,
              last_assigned_label,
              is_dirty,
              metadata_json,
              created_at,
              updated_at
            )
            values (%s, %s, %s, 1, 0, 1, true, '{}'::jsonb, now(), now())
            """,
            (
                INTEREST_CENTROIDS_INDEX_NAME,
                model_key,
                dimensions,
            ),
        )
        return 1

    next_label = int(registry_row["last_assigned_label"] or 0) + 1
    await cursor.execute(
        """
        update hnsw_registry
        set
          last_assigned_label = %s,
          model_key = %s,
          dimensions = %s,
          is_dirty = true,
          updated_at = now()
        where index_name = %s
        """,
        (
            next_label,
            model_key,
            dimensions,
            INTEREST_CENTROIDS_INDEX_NAME,
        ),
    )
    return next_label


async def mark_interest_hnsw_dirty(
    cursor: psycopg.AsyncCursor[Any],
    *,
    model_key: str,
    dimensions: int,
) -> None:
    await cursor.execute(
        """
        insert into hnsw_registry (
          index_name,
          model_key,
          dimensions,
          vector_version,
          entry_count,
          last_assigned_label,
          is_dirty,
          metadata_json,
          created_at,
          updated_at
        )
        values (
          %s,
          %s,
          %s,
          1,
          0,
          0,
          true,
          '{}'::jsonb,
          now(),
          now()
        )
        on conflict (index_name) do update
        set
          model_key = excluded.model_key,
          dimensions = excluded.dimensions,
          is_dirty = true,
          updated_at = now()
        """,
        (
            INTEREST_CENTROIDS_INDEX_NAME,
            model_key,
            dimensions,
        ),
    )


async def upsert_interest_compiled_row(
    cursor: psycopg.AsyncCursor[Any],
    *,
    interest_id: uuid.UUID,
    source_version: int,
    compile_status: str,
    source_snapshot_json: dict[str, Any],
    compiled_json: dict[str, Any],
    centroid_embedding_id: str | None,
    error_text: str | None,
) -> None:
    compiled_at = "now()" if compile_status == "compiled" else "null"
    await cursor.execute(
        f"""
        insert into user_interests_compiled (
          interest_id,
          source_version,
          compile_status,
          source_snapshot_json,
          compiled_json,
          centroid_embedding_id,
          compiled_at,
          error_text,
          created_at,
          updated_at
        )
        values (%s, %s, %s, %s::jsonb, %s::jsonb, %s, {compiled_at}, %s, now(), now())
        on conflict (interest_id) do update
        set
          source_version = excluded.source_version,
          compile_status = excluded.compile_status,
          source_snapshot_json = excluded.source_snapshot_json,
          compiled_json = excluded.compiled_json,
          centroid_embedding_id = excluded.centroid_embedding_id,
          compiled_at = excluded.compiled_at,
          error_text = excluded.error_text,
          updated_at = now()
        """,
        (
            interest_id,
            source_version,
            compile_status,
            Json(make_json_safe(source_snapshot_json)),
            Json(make_json_safe(compiled_json)),
            centroid_embedding_id,
            error_text,
        ),
    )


async def upsert_criterion_compiled_row(
    cursor: psycopg.AsyncCursor[Any],
    *,
    criterion_id: uuid.UUID,
    source_version: int,
    compile_status: str,
    source_snapshot_json: dict[str, Any],
    compiled_json: dict[str, Any],
    centroid_embedding_id: str | None,
    error_text: str | None,
) -> None:
    compiled_at = "now()" if compile_status == "compiled" else "null"
    await cursor.execute(
        f"""
        insert into criteria_compiled (
          criterion_id,
          source_version,
          compile_status,
          source_snapshot_json,
          compiled_json,
          centroid_embedding_id,
          compiled_at,
          error_text,
          created_at,
          updated_at
        )
        values (%s, %s, %s, %s::jsonb, %s::jsonb, %s, {compiled_at}, %s, now(), now())
        on conflict (criterion_id) do update
        set
          source_version = excluded.source_version,
          compile_status = excluded.compile_status,
          source_snapshot_json = excluded.source_snapshot_json,
          compiled_json = excluded.compiled_json,
          centroid_embedding_id = excluded.centroid_embedding_id,
          compiled_at = excluded.compiled_at,
          error_text = excluded.error_text,
          updated_at = now()
        """,
        (
            criterion_id,
            source_version,
            compile_status,
            Json(make_json_safe(source_snapshot_json)),
            Json(make_json_safe(compiled_json)),
            centroid_embedding_id,
            error_text,
        ),
    )


async def update_interest_compile_status(
    cursor: psycopg.AsyncCursor[Any],
    *,
    interest_id: uuid.UUID,
    compiled: bool,
    compile_status: str,
) -> None:
    await cursor.execute(
        """
        update user_interests
        set
          compiled = %s,
          compile_status = %s,
          updated_at = now()
        where interest_id = %s
        """,
        (compiled, compile_status, interest_id),
    )


async def update_criterion_compile_status(
    cursor: psycopg.AsyncCursor[Any],
    *,
    criterion_id: uuid.UUID,
    compiled: bool,
    compile_status: str,
) -> None:
    await cursor.execute(
        """
        update criteria
        set
          compiled = %s,
          compile_status = %s,
          updated_at = now()
        where criterion_id = %s
        """,
        (compiled, compile_status, criterion_id),
    )


def coerce_text_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, tuple):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        try:
            decoded = json.loads(value)
        except json.JSONDecodeError:
            return [value.strip()] if value.strip() else []
        return coerce_text_list(decoded)
    return []


def coerce_json_object(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            decoded = json.loads(value)
        except json.JSONDecodeError:
            return {}
        return decoded if isinstance(decoded, dict) else {}
    return {}


async def fetch_article_features_row(
    cursor: psycopg.AsyncCursor[Any],
    doc_id: uuid.UUID,
) -> dict[str, list[str]]:
    await cursor.execute(
        """
        select numbers, short_tokens, places, entities
        from article_features
        where doc_id = %s
        """,
        (doc_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        return {
            "numbers": [],
            "short_tokens": [],
            "places": [],
            "entities": [],
        }
    return {
        "numbers": coerce_text_list(row.get("numbers")),
        "short_tokens": coerce_text_list(row.get("short_tokens")),
        "places": coerce_text_list(row.get("places")),
        "entities": coerce_text_list(row.get("entities")),
    }


async def fetch_article_vectors(
    cursor: psycopg.AsyncCursor[Any],
    doc_id: uuid.UUID,
) -> dict[str, list[float]]:
    await cursor.execute(
        """
        select
          avr.vector_type,
          er.embedding_json
        from article_vector_registry avr
        join embedding_registry er on er.embedding_id = avr.embedding_id
        where avr.doc_id = %s
          and avr.is_active = true
          and er.is_active = true
        """,
        (doc_id,),
    )
    rows = await cursor.fetchall()
    result: dict[str, list[float]] = {}
    for row in rows:
        result[str(row["vector_type"])] = [float(value) for value in row["embedding_json"]]
    return result


async def fetch_embedding_vectors_by_ids(
    cursor: psycopg.AsyncCursor[Any],
    embedding_ids: Sequence[str],
) -> list[list[float]]:
    if not embedding_ids:
        return []

    await cursor.execute(
        """
        select embedding_id::text as embedding_id, embedding_json
        from embedding_registry
        where embedding_id = any(%s::uuid[])
        order by array_position(%s::uuid[], embedding_id)
        """,
        (list(embedding_ids), list(embedding_ids)),
    )
    rows = await cursor.fetchall()
    vectors: list[list[float]] = []
    for row in rows:
        vectors.append([float(value) for value in row["embedding_json"]])
    return vectors


async def compute_lexical_score(
    cursor: psycopg.AsyncCursor[Any],
    doc_id: uuid.UUID,
    lexical_query: str,
) -> float:
    tsquery = build_lexical_tsquery(lexical_query)
    if not tsquery:
        return 0.0

    await cursor.execute(
        """
        select
          ts_rank_cd(
            search_vector,
            to_tsquery('simple', %s)
          ) as score
        from articles
        where doc_id = %s
        """,
        (tsquery, doc_id),
    )
    row = await cursor.fetchone()
    raw_score = float(row["score"] or 0.0) if row else 0.0
    return normalize_fts_score(raw_score)


def passes_allowed_content_kind(
    *,
    article: Mapping[str, Any],
    allowed_content_kinds: Sequence[str],
) -> tuple[bool, str]:
    article_content_kind = str(article.get("content_kind") or "editorial").strip() or "editorial"
    normalized_allowed = {
        str(value).strip()
        for value in allowed_content_kinds
        if str(value).strip()
    }
    if not normalized_allowed:
        return (True, article_content_kind)
    return (article_content_kind in normalized_allowed, article_content_kind)


def passes_hard_filters(
    *,
    article: Mapping[str, Any],
    article_features: Mapping[str, Sequence[str]],
    hard_constraints: Mapping[str, Any],
) -> tuple[bool, list[str], bool]:
    reasons: list[str] = []
    article_lang = str(article.get("lang") or "").strip().lower()
    article_text = " ".join(
        str(article.get(field) or "")
        for field in ("title", "lead", "body")
    ).casefold()
    allowed_languages = {value.casefold() for value in coerce_text_list(hard_constraints.get("languages_allowed"))}
    if allowed_languages and article_lang and article_lang not in allowed_languages:
        reasons.append("language")

    time_window_hours = coerce_nullable_positive_int(hard_constraints.get("time_window_hours"))
    published_at = parse_datetime(article.get("published_at"))
    now = datetime.now(timezone.utc)
    within_window = (
        True
        if time_window_hours is None
        else published_at is not None and hours_between(now, published_at) <= time_window_hours
    )
    if not within_window:
        reasons.append("time_window")

    must_have_terms = coerce_text_list(hard_constraints.get("must_have_terms"))
    if must_have_terms and not any(
        value.casefold() in article_text for value in must_have_terms
    ):
        reasons.append("must_have_any")

    for value in coerce_text_list(hard_constraints.get("must_not_have_terms")):
        if value.casefold() in article_text:
            reasons.append(f"must_not:{value}")

    target_places = coerce_text_list(hard_constraints.get("places"))
    if target_places and place_match_score(article_features.get("places", []), target_places) <= 0.0:
        reasons.append("places")

    required_short_tokens = {value.casefold() for value in coerce_text_list(hard_constraints.get("short_tokens_required"))}
    article_short_tokens = {
        value.casefold()
        for value in coerce_text_list(article_features.get("short_tokens"))
    }
    if required_short_tokens and not required_short_tokens.issubset(article_short_tokens):
        reasons.append("short_tokens_required")

    forbidden_short_tokens = {
        value.casefold()
        for value in coerce_text_list(hard_constraints.get("short_tokens_forbidden"))
    }
    if forbidden_short_tokens & article_short_tokens:
        reasons.append("short_tokens_forbidden")

    return (len(reasons) == 0, reasons, within_window)


async def upsert_system_feed_result(
    cursor: psycopg.AsyncCursor[Any],
    doc_id: str | uuid.UUID,
) -> dict[str, Any]:
    article = await fetch_article_for_update(cursor, doc_id)
    final_selection_result = await upsert_final_selection_result(
        cursor,
        article=article,
    )
    previous_result = await fetch_system_feed_result_row(cursor, doc_id)
    total_criteria_count = int(final_selection_result["totalFilterCount"])
    relevant_criteria_count = int(final_selection_result["matchedFilterCount"])
    pending_llm_criteria_count = int(final_selection_result["llmReviewPendingFilterCount"])
    irrelevant_criteria_count = int(
        final_selection_result["noMatchFilterCount"]
    ) + int(final_selection_result["technicalFilteredOutCount"]) + int(
        final_selection_result["holdFilterCount"]
    )
    summary = summarize_system_feed_result(
        total_criteria_count=total_criteria_count,
        relevant_criteria_count=relevant_criteria_count,
        irrelevant_criteria_count=irrelevant_criteria_count,
        pending_llm_criteria_count=pending_llm_criteria_count,
    )
    compatibility_decision = str(final_selection_result["compatSystemFeedDecision"])
    compatibility_eligible = bool(final_selection_result["compatEligibleForFeed"])
    explain_json = {
        **coerce_json_object(summary.get("explain_json")),
        "source": "final_selection_results",
        "compatibilityProjection": True,
        "finalSelection": coerce_json_object(final_selection_result.get("explain_json")),
    }
    if compatibility_decision != str(summary.get("decision") or ""):
        explain_json["compatibilityDecisionOverride"] = compatibility_decision
    await cursor.execute(
        """
        insert into system_feed_results (
          doc_id,
          decision,
          eligible_for_feed,
          total_criteria_count,
          relevant_criteria_count,
          irrelevant_criteria_count,
          pending_llm_criteria_count,
          explain_json
        )
        values (%s, %s, %s, %s, %s, %s, %s, %s::jsonb)
        on conflict (doc_id) do update
        set
          decision = excluded.decision,
          eligible_for_feed = excluded.eligible_for_feed,
          total_criteria_count = excluded.total_criteria_count,
          relevant_criteria_count = excluded.relevant_criteria_count,
          irrelevant_criteria_count = excluded.irrelevant_criteria_count,
          pending_llm_criteria_count = excluded.pending_llm_criteria_count,
          explain_json = excluded.explain_json,
          updated_at = now()
        """,
        (
            doc_id,
            compatibility_decision,
            compatibility_eligible,
            total_criteria_count,
            relevant_criteria_count,
            irrelevant_criteria_count,
            pending_llm_criteria_count,
            Json(make_json_safe(explain_json)),
        ),
    )
    return {
        "selection_source": "final_selection_results",
        "decision": compatibility_decision,
        "eligible_for_feed": compatibility_eligible,
        "final_selection_decision": str(final_selection_result["decision"]),
        "final_selection_selected": bool(final_selection_result["isSelected"]),
        "previous_final_selection_decision": final_selection_result.get("previousDecision"),
        "previous_final_selection_selected": bool(
            final_selection_result.get("previousSelected")
        ),
        "previous_decision": (
            str(previous_result.get("decision") or "")
            if previous_result is not None
            else None
        ),
        "previous_eligible_for_feed": (
            bool(previous_result.get("eligible_for_feed"))
            if previous_result is not None
            else False
        ),
    }


async def fetch_final_selection_result_row(
    cursor: psycopg.AsyncCursor[Any],
    doc_id: str | uuid.UUID,
) -> dict[str, Any] | None:
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
          technical_filtered_out_count,
          explain_json
        from final_selection_results
        where doc_id = %s
        """,
        (doc_id,),
    )
    return await cursor.fetchone()


async def find_reusable_criterion_llm_review(
    cursor: psycopg.AsyncCursor[Any],
    *,
    doc_id: str | uuid.UUID,
    criterion_id: str | uuid.UUID,
    canonical_document_id: str | uuid.UUID | None,
) -> dict[str, Any] | None:
    canonical_uuid = None
    if str(canonical_document_id or "").strip():
        try:
            canonical_uuid = uuid.UUID(str(canonical_document_id))
        except (TypeError, ValueError):
            canonical_uuid = None
    doc_uuid = uuid.UUID(str(doc_id))
    criterion_uuid = uuid.UUID(str(criterion_id))
    await cursor.execute(
        """
        select
          lrl.review_id::text as review_id,
          lrl.doc_id::text as reviewed_doc_id,
          reviewed_article.canonical_doc_id::text as reviewed_canonical_document_id,
          lrl.decision as provider_decision,
          lrl.score,
          lrl.prompt_template_id::text as prompt_template_id,
          lrl.prompt_version,
          lrl.created_at
        from llm_review_log lrl
        join articles reviewed_article on reviewed_article.doc_id = lrl.doc_id
        where lrl.scope = 'criterion'
          and lrl.target_id = %s
          and (
            (%s::uuid is not null and reviewed_article.canonical_doc_id = %s::uuid)
            or (%s::uuid is null and lrl.doc_id = %s)
          )
        order by lrl.created_at desc
        limit 1
        """,
        (
            criterion_uuid,
            canonical_uuid,
            canonical_uuid,
            canonical_uuid,
            doc_uuid,
        ),
    )
    return await cursor.fetchone()


def resolve_criterion_review_final_decision(provider_decision: str | None) -> str:
    return "relevant" if str(provider_decision or "").strip() == "approve" else "irrelevant"


async def persist_criterion_review_resolution(
    cursor: psycopg.AsyncCursor[Any],
    *,
    article: Mapping[str, Any],
    criterion_id: str | uuid.UUID,
    review_context: Mapping[str, Any],
    provider_decision: str,
    provider_score: float | None,
    review_source: str,
    review_id: str | None,
    reused_from_doc_id: str | None = None,
    reused_canonical_document_id: str | None = None,
    prompt_template_id: str | None = None,
    prompt_version: int | None = None,
    refresh_selection_gate: bool,
    historical_backfill: bool,
    suppress_pipeline_fanout: bool,
) -> dict[str, Any]:
    final_decision = resolve_criterion_review_final_decision(provider_decision)
    base_explain = coerce_json_object(review_context.get("explain_json"))
    runtime_review_state = coerce_json_object(base_explain.get("runtimeReviewState"))
    llm_review_payload: dict[str, Any] = {
        "decision": str(provider_decision),
        "score": provider_score,
        "source": review_source,
    }
    if review_id is not None:
        llm_review_payload["reviewId"] = str(review_id)
    if reused_from_doc_id is not None:
        llm_review_payload["reusedFromDocId"] = str(reused_from_doc_id)
    if reused_canonical_document_id is not None:
        llm_review_payload["reusedCanonicalDocumentId"] = str(reused_canonical_document_id)
    if prompt_template_id is not None:
        llm_review_payload["promptTemplateId"] = str(prompt_template_id)
    if prompt_version is not None:
        llm_review_payload["promptVersion"] = int(prompt_version)
    base_explain["llmReview"] = make_json_safe(llm_review_payload)
    base_explain["runtimeReviewState"] = {
        "reviewQueued": False,
        "reason": review_source,
        "candidateRecoveryProtected": bool(
            runtime_review_state.get("candidateRecoveryProtected")
        ),
        "resolvedByReview": True,
    }
    await cursor.execute(
        """
        update criterion_match_results
        set
          decision = %s,
          explain_json = explain_json || %s::jsonb
        where doc_id = %s and criterion_id = %s
        """,
        (
            final_decision,
            Json(
                {
                    "llmReview": llm_review_payload,
                    "runtimeReviewState": base_explain["runtimeReviewState"],
                }
            ),
            article["doc_id"],
            criterion_id,
        ),
    )
    filter_context = await resolve_interest_filter_context(
        cursor,
        article=article,
        prefer_story_cluster=False,
    )
    technical_filter_state, semantic_decision = resolve_criterion_filter_outcome(
        pass_filters=True,
        compat_decision=final_decision,
    )
    await upsert_interest_filter_result(
        cursor,
        filter_scope="system_criterion",
        doc_id=uuid.UUID(str(article["doc_id"])),
        canonical_document_id=filter_context["canonicalDocumentId"],
        story_cluster_id=filter_context["storyClusterId"],
        user_id=None,
        criterion_id=uuid.UUID(str(criterion_id)),
        interest_id=None,
        technical_filter_state=technical_filter_state,
        semantic_decision=semantic_decision,
        compat_decision=final_decision,
        verification_target_type=filter_context["verificationTargetType"],
        verification_target_id=filter_context["verificationTargetId"],
        verification_state=filter_context["verificationState"],
        semantic_score=float(base_explain.get("S_final") or 0.0),
        explain_json=build_interest_filter_explain(
            base_explain_json=make_json_safe(base_explain),
            technical_filter_state=technical_filter_state,
            semantic_decision=semantic_decision,
            compat_decision=final_decision,
            filter_scope="system_criterion",
            context=filter_context,
        ),
    )
    system_feed_result: dict[str, Any] | None = None
    if refresh_selection_gate:
        system_feed_result = await upsert_system_feed_result(cursor, article["doc_id"])
        if (
            should_dispatch_clustering(system_feed_result)
            and not historical_backfill
            and not suppress_pipeline_fanout
        ):
            await insert_outbox_event(
                cursor,
                ARTICLE_CRITERIA_MATCHED_EVENT,
                "article",
                article["doc_id"],
                {"docId": str(article["doc_id"]), "version": 1},
            )
    return {
        "finalDecision": final_decision,
        "reviewSource": review_source,
        "llmReview": llm_review_payload,
        "systemFeedResult": system_feed_result,
    }


async def upsert_final_selection_result(
    cursor: psycopg.AsyncCursor[Any],
    *,
    article: Mapping[str, Any],
) -> dict[str, Any]:
    doc_id = uuid.UUID(str(article["doc_id"]))
    previous_result = await fetch_final_selection_result_row(cursor, doc_id)
    selection_context = await resolve_interest_filter_context(
        cursor,
        article=article,
        prefer_story_cluster=True,
    )
    await cursor.execute(
        """
        select
          count(*)::int as total_filter_count,
          count(*) filter (where semantic_decision = 'match')::int as matched_filter_count,
          count(*) filter (where semantic_decision = 'no_match')::int as no_match_filter_count,
          count(*) filter (where semantic_decision = 'gray_zone')::int as gray_zone_filter_count,
          count(*) filter (
            where semantic_decision = 'gray_zone'
              and coalesce(
                (explain_json -> 'runtimeReviewState' ->> 'reviewQueued')::boolean,
                (explain_json -> 'selectionProfile' ->> 'llmReviewAllowed')::boolean,
                true
              )
          )::int as llm_review_pending_filter_count,
          count(*) filter (
            where semantic_decision = 'gray_zone'
              and coalesce(
                (explain_json -> 'runtimeReviewState' ->> 'reviewQueued')::boolean,
                (explain_json -> 'selectionProfile' ->> 'llmReviewAllowed')::boolean,
                true
              ) = false
          )::int as hold_filter_count,
          count(*) filter (
            where coalesce((explain_json -> 'candidateSignals' ->> 'upliftedToGrayZone')::boolean, false)
          )::int as candidate_signal_uplift_count,
          count(*) filter (
            where coalesce(explain_json -> 'llmReview' ->> 'source', '') = 'reused_canonical_llm_review'
          )::int as canonical_review_reused_count,
          count(*) filter (where technical_filter_state = 'filtered_out')::int as technical_filtered_out_count
        from interest_filter_results
        where doc_id = %s
          and filter_scope = 'system_criterion'
        """,
        (doc_id,),
    )
    counts = await cursor.fetchone() or {}
    duplicate_article_count = 1
    if selection_context.get("canonicalDocumentId") is not None:
        await cursor.execute(
            """
            select count(*)::int as duplicate_article_count
            from articles
            where canonical_doc_id = %s
            """,
            (selection_context["canonicalDocumentId"],),
        )
        duplicate_row = await cursor.fetchone() or {}
        duplicate_article_count = max(
            int(duplicate_row.get("duplicate_article_count") or 0),
            1,
        )
    summary = summarize_final_selection_result(
        total_filter_count=int(counts.get("total_filter_count") or 0),
        matched_filter_count=int(counts.get("matched_filter_count") or 0),
        no_match_filter_count=int(counts.get("no_match_filter_count") or 0),
        gray_zone_filter_count=int(counts.get("gray_zone_filter_count") or 0),
        llm_review_pending_filter_count=int(
            counts.get("llm_review_pending_filter_count") or 0
        ),
        hold_filter_count=int(counts.get("hold_filter_count") or 0),
        technical_filtered_out_count=int(counts.get("technical_filtered_out_count") or 0),
        verification_state=selection_context.get("verificationState"),
        candidate_signal_uplift_count=int(
            counts.get("candidate_signal_uplift_count") or 0
        ),
    )
    explain_json = coerce_json_object(summary.get("explain_json"))
    explain_json["candidateSignalUpliftCount"] = int(
        counts.get("candidate_signal_uplift_count") or 0
    )
    explain_json["canonicalReviewReused"] = bool(
        counts.get("canonical_review_reused_count") or 0
    )
    explain_json["canonicalReviewReusedCount"] = int(
        counts.get("canonical_review_reused_count") or 0
    )
    explain_json["duplicateArticleCountForCanonical"] = duplicate_article_count
    explain_json["canonicalSelectionReused"] = bool(
        duplicate_article_count > 1 and bool(summary["isSelected"])
    )
    explain_json["selectionReuseSource"] = (
        "canonical_reused"
        if duplicate_article_count > 1 and bool(summary["isSelected"])
        else "article_level"
    )
    explain_json["canonicalDocumentId"] = (
        None
        if selection_context.get("canonicalDocumentId") is None
        else str(selection_context["canonicalDocumentId"])
    )
    explain_json["storyClusterId"] = (
        None
        if selection_context.get("storyClusterId") is None
        else str(selection_context["storyClusterId"])
    )
    explain_json["verification"] = {
        "targetType": selection_context.get("verificationTargetType"),
        "targetId": (
            None
            if selection_context.get("verificationTargetId") is None
            else str(selection_context["verificationTargetId"])
        ),
        "state": selection_context.get("verificationState"),
    }
    await cursor.execute(
        """
        insert into final_selection_results (
          doc_id,
          canonical_document_id,
          story_cluster_id,
          verification_target_type,
          verification_target_id,
          verification_state,
          total_filter_count,
          matched_filter_count,
          no_match_filter_count,
          gray_zone_filter_count,
          technical_filtered_out_count,
          final_decision,
          is_selected,
          compat_system_feed_decision,
          explain_json
        )
        values (
          %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb
        )
        on conflict (doc_id) do update
        set
          canonical_document_id = excluded.canonical_document_id,
          story_cluster_id = excluded.story_cluster_id,
          verification_target_type = excluded.verification_target_type,
          verification_target_id = excluded.verification_target_id,
          verification_state = excluded.verification_state,
          total_filter_count = excluded.total_filter_count,
          matched_filter_count = excluded.matched_filter_count,
          no_match_filter_count = excluded.no_match_filter_count,
          gray_zone_filter_count = excluded.gray_zone_filter_count,
          technical_filtered_out_count = excluded.technical_filtered_out_count,
          final_decision = excluded.final_decision,
          is_selected = excluded.is_selected,
          compat_system_feed_decision = excluded.compat_system_feed_decision,
          explain_json = excluded.explain_json,
          updated_at = now()
        """,
        (
            doc_id,
            selection_context.get("canonicalDocumentId"),
            selection_context.get("storyClusterId"),
            selection_context.get("verificationTargetType"),
            selection_context.get("verificationTargetId"),
            selection_context.get("verificationState"),
            int(counts.get("total_filter_count") or 0),
            int(counts.get("matched_filter_count") or 0),
            int(counts.get("no_match_filter_count") or 0),
            int(counts.get("gray_zone_filter_count") or 0),
            int(counts.get("technical_filtered_out_count") or 0),
            str(summary["decision"]),
            bool(summary["isSelected"]),
            str(summary["compatSystemFeedDecision"]),
            Json(make_json_safe(explain_json)),
        ),
    )
    return {
        "decision": str(summary["decision"]),
        "isSelected": bool(summary["isSelected"]),
        "compatSystemFeedDecision": str(summary["compatSystemFeedDecision"]),
        "compatEligibleForFeed": bool(summary["compatEligibleForFeed"]),
        "selectionReason": str(summary["selectionReason"]),
        "verificationState": selection_context.get("verificationState"),
        "verificationTargetType": selection_context.get("verificationTargetType"),
        "verificationTargetId": selection_context.get("verificationTargetId"),
        "canonicalDocumentId": selection_context.get("canonicalDocumentId"),
        "storyClusterId": selection_context.get("storyClusterId"),
        "totalFilterCount": int(counts.get("total_filter_count") or 0),
        "matchedFilterCount": int(counts.get("matched_filter_count") or 0),
        "noMatchFilterCount": int(counts.get("no_match_filter_count") or 0),
        "grayZoneFilterCount": int(counts.get("gray_zone_filter_count") or 0),
        "llmReviewPendingFilterCount": int(
            counts.get("llm_review_pending_filter_count") or 0
        ),
        "holdFilterCount": int(counts.get("hold_filter_count") or 0),
        "candidateSignalUpliftCount": int(
            counts.get("candidate_signal_uplift_count") or 0
        ),
        "canonicalReviewReused": bool(counts.get("canonical_review_reused_count") or 0),
        "canonicalReviewReusedCount": int(
            counts.get("canonical_review_reused_count") or 0
        ),
        "duplicateArticleCountForCanonical": duplicate_article_count,
        "canonicalSelectionReused": bool(
            duplicate_article_count > 1 and bool(summary["isSelected"])
        ),
        "technicalFilteredOutCount": int(counts.get("technical_filtered_out_count") or 0),
        "previousDecision": (
            str(previous_result.get("final_decision") or "")
            if previous_result is not None
            else None
        ),
        "previousSelected": (
            bool(previous_result.get("is_selected"))
            if previous_result is not None
            else False
        ),
        "explain_json": explain_json,
    }


async def fetch_system_feed_result_row(
    cursor: psycopg.AsyncCursor[Any],
    doc_id: str | uuid.UUID,
) -> dict[str, Any] | None:
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
    return await cursor.fetchone()


async def fetch_selection_gate_result_row(
    cursor: psycopg.AsyncCursor[Any],
    doc_id: str | uuid.UUID,
) -> dict[str, Any] | None:
    final_selection_result = await fetch_final_selection_result_row(cursor, doc_id)
    if final_selection_result is not None:
        return {
            "selection_source": "final_selection_results",
            "decision": str(final_selection_result.get("final_decision") or ""),
            "is_selected": bool(final_selection_result.get("is_selected")),
            "compat_system_feed_decision": str(
                final_selection_result.get("compat_system_feed_decision") or ""
            ),
            "verification_target_type": final_selection_result.get(
                "verification_target_type"
            ),
            "verification_target_id": final_selection_result.get("verification_target_id"),
            "verification_state": final_selection_result.get("verification_state"),
            "selection_reuse_source": "article_level",
        }

    await cursor.execute(
        """
        select canonical_doc_id
        from articles
        where doc_id = %s
        """,
        (doc_id,),
    )
    article_row = await cursor.fetchone() or {}
    canonical_document_id = article_row.get("canonical_doc_id")
    if canonical_document_id is not None:
        await cursor.execute(
            """
            select
              fsr.final_decision,
              fsr.is_selected,
              fsr.compat_system_feed_decision,
              fsr.verification_target_type,
              fsr.verification_target_id,
              fsr.verification_state
            from final_selection_results fsr
            where fsr.canonical_document_id = %s
            order by fsr.is_selected desc, fsr.updated_at desc, fsr.doc_id asc
            limit 1
            """,
            (canonical_document_id,),
        )
        canonical_final_selection = await cursor.fetchone()
        if canonical_final_selection is not None:
            return {
                "selection_source": "final_selection_results",
                "decision": str(canonical_final_selection.get("final_decision") or ""),
                "is_selected": bool(canonical_final_selection.get("is_selected")),
                "compat_system_feed_decision": str(
                    canonical_final_selection.get("compat_system_feed_decision") or ""
                ),
                "verification_target_type": canonical_final_selection.get(
                    "verification_target_type"
                ),
                "verification_target_id": canonical_final_selection.get(
                    "verification_target_id"
                ),
                "verification_state": canonical_final_selection.get("verification_state"),
                "selection_reuse_source": "canonical_reused",
            }

    system_feed_result = await fetch_system_feed_result_row(cursor, doc_id)
    if system_feed_result is None:
        if canonical_document_id is None:
            return None
        await cursor.execute(
            """
            select sfr.*
            from system_feed_results sfr
            join articles a on a.doc_id = sfr.doc_id
            where a.canonical_doc_id = %s
            order by coalesce(sfr.eligible_for_feed, false) desc, sfr.updated_at desc, sfr.doc_id asc
            limit 1
            """,
            (canonical_document_id,),
        )
        system_feed_result = await cursor.fetchone()
        if system_feed_result is None:
            return None

    return {
        "selection_source": "system_feed_results",
        "decision": str(system_feed_result.get("decision") or ""),
        "is_selected": bool(system_feed_result.get("eligible_for_feed")),
        "compat_system_feed_decision": str(system_feed_result.get("decision") or ""),
        "verification_target_type": None,
        "verification_target_id": None,
        "verification_state": None,
        "selection_reuse_source": (
            "canonical_reused" if canonical_document_id is not None else "article_level"
        ),
    }


def should_dispatch_clustering(system_feed_result: Mapping[str, Any]) -> bool:
    if (
        "final_selection_selected" in system_feed_result
        or "previous_final_selection_selected" in system_feed_result
    ):
        return bool(system_feed_result.get("final_selection_selected")) and not bool(
            system_feed_result.get("previous_final_selection_selected")
        )
    return bool(system_feed_result.get("eligible_for_feed")) and not bool(
        system_feed_result.get("previous_eligible_for_feed")
    )


async def is_article_eligible_for_personalization(
    *,
    doc_id: str,
) -> bool:
    async with await open_connection() as connection:
        async with connection.cursor() as cursor:
            result = await fetch_selection_gate_result_row(cursor, doc_id)
    return bool(result and result.get("is_selected"))


async def list_compiled_criteria(
    cursor: psycopg.AsyncCursor[Any],
) -> list[dict[str, Any]]:
    await cursor.execute(
        """
        select
          c.criterion_id::text as criterion_id,
          c.source_interest_template_id::text as source_interest_template_id,
          c.description,
          c.enabled,
          c.priority,
          cc.source_version,
          cc.compiled_json,
          cc.source_snapshot_json,
          coalesce(
            case
              when jsonb_typeof(coalesce(it.allowed_content_kinds, '[]'::jsonb)) = 'array'
              then coalesce(it.allowed_content_kinds, '[]'::jsonb)
              else null
            end,
            case
              when jsonb_typeof(coalesce(sp.bindings_json -> 'allowedContentKinds', '[]'::jsonb)) = 'array'
              then coalesce(sp.bindings_json -> 'allowedContentKinds', '[]'::jsonb)
              else null
            end,
            case
              when jsonb_typeof(coalesce(sp.policy_json -> 'allowedContentKinds', '[]'::jsonb)) = 'array'
              then coalesce(sp.policy_json -> 'allowedContentKinds', '[]'::jsonb)
              else null
            end,
            '[]'::jsonb
          ) as allowed_content_kinds,
          sp.selection_profile_id::text as selection_profile_id,
          sp.profile_family as selection_profile_family,
          sp.status as selection_profile_status,
          sp.version as selection_profile_version,
          sp.definition_json as selection_profile_definition_json,
          sp.policy_json as selection_profile_policy_json
        from criteria c
        join criteria_compiled cc on cc.criterion_id = c.criterion_id
        left join interest_templates it
          on it.interest_template_id = c.source_interest_template_id
        left join selection_profiles sp on sp.source_criterion_id = c.criterion_id
        where c.enabled = true
          and c.compiled = true
          and cc.compile_status = 'compiled'
        order by c.updated_at desc
        """
    )
    return list(await cursor.fetchall())


async def list_compiled_interests(
    cursor: psycopg.AsyncCursor[Any],
    *,
    user_id: str | None = None,
    interest_id: str | None = None,
) -> list[dict[str, Any]]:
    filters = [
        "ui.enabled = true",
        "ui.compiled = true",
        "uic.compile_status = 'compiled'",
    ]
    params: list[Any] = []
    if user_id:
        filters.append("ui.user_id = %s")
        params.append(user_id)
    if interest_id:
        filters.append("ui.interest_id = %s")
        params.append(interest_id)

    await cursor.execute(
        f"""
        select
          ui.interest_id::text as interest_id,
          ui.user_id::text as user_id,
          ui.description,
          ui.priority,
          ui.enabled,
          uic.source_version,
          uic.compiled_json,
          uic.source_snapshot_json
        from user_interests ui
        join user_interests_compiled uic on uic.interest_id = ui.interest_id
        where {' and '.join(filters)}
        order by ui.updated_at desc
        """,
        tuple(params),
    )
    return list(await cursor.fetchall())


async def find_prompt_template(
    cursor: psycopg.AsyncCursor[Any],
    scope: str,
) -> dict[str, Any] | None:
    await cursor.execute(
        """
        select
          prompt_template_id::text as prompt_template_id,
          name,
          scope,
          template_text,
          version
        from llm_prompt_templates
        where is_active = true
          and scope in (%s, 'global')
        order by case when scope = %s then 0 else 1 end, version desc, updated_at desc
        limit 1
        """,
        (scope, scope),
    )
    return await cursor.fetchone()


async def fetch_cluster_event_vector(
    cursor: psycopg.AsyncCursor[Any],
    cluster_id: uuid.UUID,
) -> list[float]:
    await cursor.execute(
        """
        select er.embedding_json
        from event_vector_registry evr
        join embedding_registry er on er.embedding_id = evr.embedding_id
        where evr.entity_type = 'event_cluster'
          and evr.entity_id = %s
          and evr.vector_type = 'e_event'
          and evr.is_active = true
          and er.is_active = true
        order by evr.updated_at desc
        limit 1
        """,
        (cluster_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        return []
    return [float(value) for value in row["embedding_json"]]


async def load_recent_cluster_candidates(
    cursor: psycopg.AsyncCursor[Any],
) -> list[dict[str, Any]]:
    await cursor.execute(
        """
        select
          cluster_id,
          article_count,
          primary_title,
          top_entities,
          top_places,
          min_published_at,
          max_published_at,
          centroid_embedding_id
        from event_clusters
        where max_published_at is null or max_published_at >= now() - interval '72 hours'
        order by coalesce(max_published_at, created_at) desc
        limit 200
        """
    )
    return list(await cursor.fetchall())


async def rebuild_cluster_state(
    cursor: psycopg.AsyncCursor[Any],
    *,
    cluster_id: uuid.UUID,
    vector_version: int,
) -> bool:
    await cursor.execute(
        """
        select
          a.doc_id,
          a.title,
          a.published_at,
          af.entities,
          af.places
        from event_cluster_members ecm
        join articles a on a.doc_id = ecm.doc_id
        left join article_features af on af.doc_id = a.doc_id
        where ecm.cluster_id = %s
        order by a.published_at desc nulls last, ecm.created_at desc
        """,
        (cluster_id,),
    )
    member_rows = list(await cursor.fetchall())
    if not member_rows:
        await cursor.execute(
            """
            delete from event_vector_registry
            where entity_type = 'event_cluster'
              and entity_id = %s
            """,
            (cluster_id,),
        )
        await cursor.execute(
            """
            update embedding_registry
            set
              is_active = false,
              updated_at = now()
            where entity_type = 'event_cluster'
              and entity_id = %s
              and vector_type = 'e_event'
            """,
            (cluster_id,),
        )
        await cursor.execute(
            """
            delete from event_clusters
            where cluster_id = %s
            """,
            (cluster_id,),
        )
        return False

    weighted_vectors: list[tuple[float, Sequence[float]]] = []
    merged_entities: list[str] = []
    merged_places: list[str] = []
    published_values: list[datetime] = []
    member_doc_ids: list[str] = []
    primary_title = ""

    for member_row in member_rows:
        member_doc_id = member_row["doc_id"]
        member_doc_ids.append(str(member_doc_id))
        if not primary_title and str(member_row.get("title") or "").strip():
            primary_title = str(member_row.get("title") or "")
        published_at = parse_datetime(member_row.get("published_at"))
        if published_at is not None:
            published_values.append(published_at)
        merged_entities.extend(coerce_text_list(member_row.get("entities")))
        merged_places.extend(coerce_text_list(member_row.get("places")))

        article_vectors = await fetch_article_vectors(cursor, member_doc_id)
        event_vector = article_vectors.get("e_event")
        if event_vector:
            weighted_vectors.append((1.0, event_vector))

    centroid_embedding_id: str | None = None
    if weighted_vectors:
        centroid_vector = mix_weighted_vectors(weighted_vectors)
        centroid_embedding_id = await upsert_embedding_registry(
            cursor,
            entity_type="event_cluster",
            entity_id=cluster_id,
            vector_type="e_event",
            model_key=EMBEDDING_PROVIDER.model_key,
            vector_version=vector_version,
            vector=centroid_vector,
            content_hash=compute_content_hash(
                {
                    "clusterId": str(cluster_id),
                    "vectorType": "e_event",
                    "memberDocIds": member_doc_ids,
                    "version": vector_version,
                }
            ),
        )
        await upsert_event_vector_registry(
            cursor,
            entity_type="event_cluster",
            entity_id=cluster_id,
            vector_type="e_event",
            embedding_id=centroid_embedding_id,
            vector_version=vector_version,
        )
    else:
        await cursor.execute(
            """
            delete from event_vector_registry
            where entity_type = 'event_cluster'
              and entity_id = %s
              and vector_type = 'e_event'
            """,
            (cluster_id,),
        )

    await cursor.execute(
        """
        update event_clusters
        set
          centroid_embedding_id = %s,
          article_count = %s,
          primary_title = %s,
          top_entities = %s,
          top_places = %s,
          min_published_at = %s,
          max_published_at = %s,
          updated_at = now()
        where cluster_id = %s
        """,
        (
            centroid_embedding_id,
            len(member_rows),
            primary_title or None,
            list(dict.fromkeys(merged_entities))[:10],
            list(dict.fromkeys(merged_places))[:10],
            min(published_values) if published_values else None,
            max(published_values) if published_values else None,
            cluster_id,
        ),
    )
    return True


async def create_or_update_cluster(
    cursor: psycopg.AsyncCursor[Any],
    *,
    article: Mapping[str, Any],
    vector_version: int,
    cluster_row: Mapping[str, Any] | None,
) -> tuple[uuid.UUID, bool]:
    article_doc_id = article["doc_id"]
    cluster_id = uuid.uuid4() if cluster_row is None else cluster_row["cluster_id"]
    is_new_cluster = cluster_row is None

    await cursor.execute(
        """
        select cluster_id
        from event_cluster_members
        where doc_id = %s
        limit 1
        """,
        (article_doc_id,),
    )
    previous_membership = await cursor.fetchone()
    previous_cluster_id = (
        uuid.UUID(str(previous_membership["cluster_id"]))
        if previous_membership is not None
        else None
    )

    if is_new_cluster:
        await cursor.execute(
            """
            insert into event_clusters (
              cluster_id,
              article_count,
              created_at,
              updated_at
            )
            values (%s, 0, now(), now())
            on conflict (cluster_id) do nothing
            """,
            (cluster_id,),
        )

    await cursor.execute(
        """
        insert into event_cluster_members (cluster_id, doc_id)
        values (%s, %s)
        on conflict (doc_id) do update
        set cluster_id = excluded.cluster_id
        """,
        (cluster_id, article_doc_id),
    )
    await rebuild_cluster_state(
        cursor,
        cluster_id=cluster_id,
        vector_version=vector_version,
    )
    if previous_cluster_id is not None and previous_cluster_id != cluster_id:
        await rebuild_cluster_state(
            cursor,
            cluster_id=previous_cluster_id,
            vector_version=vector_version,
        )
    return cluster_id, is_new_cluster


async def fetch_recent_notification_history(
    cursor: psycopg.AsyncCursor[Any],
    *,
    user_id: uuid.UUID,
    interest_id: uuid.UUID,
    cluster_id: uuid.UUID | None,
    family_id: uuid.UUID | None,
) -> list[dict[str, Any]]:
    await cursor.execute(
        """
        select
          notification_id,
          status,
          created_at,
          doc_id,
          event_cluster_id,
          interest_id
        from notification_log
        where user_id = %s
          and (
            interest_id = %s
            or (%s::uuid is not null and event_cluster_id = %s::uuid)
            or (%s::uuid is not null and doc_id in (
              select doc_id from articles where family_id = %s::uuid
            ))
          )
          and created_at >= now() - interval '24 hours'
        order by created_at desc
        limit 20
        """,
        (user_id, interest_id, cluster_id, cluster_id, family_id, family_id),
    )
    return list(await cursor.fetchall())


async def compute_novelty_score(
    cursor: psycopg.AsyncCursor[Any],
    *,
    user_id: uuid.UUID,
    interest_id: uuid.UUID,
    cluster_id: uuid.UUID | None,
    family_id: uuid.UUID | None,
    article_features: Mapping[str, Sequence[str]],
) -> tuple[float, bool]:
    history = await fetch_recent_notification_history(
        cursor,
        user_id=user_id,
        interest_id=interest_id,
        cluster_id=cluster_id,
        family_id=family_id,
    )
    if not history:
        return 1.0, False

    if cluster_id is None:
        return 0.0, False

    await cursor.execute(
        """
        select
          ec.top_entities,
          ec.top_places
        from event_clusters ec
        where ec.cluster_id = %s
        """,
        (cluster_id,),
    )
    cluster_row = await cursor.fetchone()
    if cluster_row is None:
        return 0.0, False

    major_update = is_major_update(
        existing_entities=coerce_text_list(cluster_row.get("top_entities")),
        existing_places=coerce_text_list(cluster_row.get("top_places")),
        existing_numbers=[],
        incoming_entities=coerce_text_list(article_features.get("entities")),
        incoming_places=coerce_text_list(article_features.get("places")),
        incoming_numbers=coerce_text_list(article_features.get("numbers")),
    )
    if major_update:
        return 0.4, True
    return 0.0, False


async def fetch_user_notification_channels(
    cursor: psycopg.AsyncCursor[Any],
    user_id: uuid.UUID,
) -> list[dict[str, Any]]:
    await cursor.execute(
        """
        select
          channel_binding_id::text as channel_binding_id,
          channel_type,
          is_enabled,
          config_json,
          verified_at
        from user_notification_channels
        where user_id = %s
          and is_enabled = true
          and channel_type in ('web_push', 'telegram')
        order by channel_type, created_at
        """,
        (user_id,),
    )
    return list(await cursor.fetchall())


async def fetch_user_notification_preferences(
    cursor: psycopg.AsyncCursor[Any],
    user_id: uuid.UUID,
) -> dict[str, bool]:
    await cursor.execute(
        """
        select notification_preferences
        from user_profiles
        where user_id = %s
        limit 1
        """,
        (user_id,),
    )
    row = await cursor.fetchone()
    preferences = row.get("notification_preferences") if row else {}
    return normalize_notification_preferences(preferences if isinstance(preferences, dict) else None)


async def insert_notification_log_row(
    cursor: psycopg.AsyncCursor[Any],
    *,
    user_id: uuid.UUID,
    interest_id: uuid.UUID | None,
    doc_id: uuid.UUID,
    cluster_id: uuid.UUID | None,
    channel_type: str,
    status: str,
    title: str,
    body: str,
    decision_reason: str,
    delivery_payload_json: dict[str, Any],
) -> uuid.UUID:
    await cursor.execute(
        """
        insert into notification_log (
          user_id,
          interest_id,
          doc_id,
          event_cluster_id,
          channel_type,
          status,
          title,
          body,
          decision_reason,
          delivery_payload_json
        )
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
        returning notification_id
        """,
        (
            user_id,
            interest_id,
            doc_id,
            cluster_id,
            channel_type,
            status,
            title,
            body,
            decision_reason,
            Json(make_json_safe(delivery_payload_json)),
        ),
    )
    row = await cursor.fetchone()
    return row["notification_id"]


async def update_notification_delivery_status(
    cursor: psycopg.AsyncCursor[Any],
    *,
    notification_id: uuid.UUID,
    status: str,
    delivery_payload_json: dict[str, Any],
) -> None:
    await cursor.execute(
        """
        update notification_log
        set
          status = %s,
          delivery_payload_json = %s::jsonb,
          sent_at = case when %s = 'sent' then coalesce(sent_at, now()) else sent_at end,
          updated_at = now()
        where notification_id = %s
        """,
        (
            status,
            Json(make_json_safe(delivery_payload_json)),
            status,
            notification_id,
        ),
    )


async def fetch_user_digest_channel(
    cursor: psycopg.AsyncCursor[Any],
    user_id: uuid.UUID,
) -> dict[str, Any] | None:
    await cursor.execute(
        """
        select
          channel_binding_id::text as channel_binding_id,
          config_json,
          verified_at
        from user_notification_channels
        where user_id = %s
          and channel_type = 'email_digest'
          and is_enabled = true
        order by created_at desc
        limit 1
        """,
        (user_id,),
    )
    return await cursor.fetchone()


async def insert_digest_delivery_log_row(
    cursor: psycopg.AsyncCursor[Any],
    *,
    user_id: uuid.UUID,
    digest_kind: str,
    cadence: str | None,
    status: str,
    recipient_email: str,
    subject: str,
    body_text: str,
    body_html: str,
    metadata_json: dict[str, Any] | None = None,
    error_text: str | None = None,
) -> uuid.UUID:
    await cursor.execute(
        """
        insert into digest_delivery_log (
          user_id,
          digest_kind,
          cadence,
          status,
          recipient_email,
          subject,
          body_text,
          body_html,
          metadata_json,
          error_text
        )
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s)
        returning digest_delivery_id
        """,
        (
            user_id,
            digest_kind,
            cadence,
            status,
            recipient_email,
            subject,
            body_text,
            body_html,
            Json(make_json_safe(metadata_json or {})),
            error_text,
        ),
    )
    row = await cursor.fetchone()
    return row["digest_delivery_id"]


async def upsert_digest_delivery_items(
    cursor: psycopg.AsyncCursor[Any],
    *,
    digest_delivery_id: uuid.UUID,
    content_item_ids: Sequence[str],
) -> None:
    for index, content_item_id in enumerate(content_item_ids):
        await cursor.execute(
            """
            insert into digest_delivery_items (
              digest_delivery_id,
              item_position,
              content_item_id
            )
            values (%s, %s, %s)
            on conflict (digest_delivery_id, item_position) do update
            set content_item_id = excluded.content_item_id
            """,
            (digest_delivery_id, index, content_item_id),
        )


async def update_digest_delivery_status(
    cursor: psycopg.AsyncCursor[Any],
    *,
    digest_delivery_id: uuid.UUID,
    status: str,
    error_text: str | None = None,
) -> None:
    await cursor.execute(
        """
        update digest_delivery_log
        set
          status = %s,
          error_text = %s,
          sent_at = case
            when %s = 'sent' then coalesce(sent_at, now())
            else sent_at
          end,
          updated_at = now()
        where digest_delivery_id = %s
        """,
        (status, error_text, status, digest_delivery_id),
    )


async def update_user_digest_settings_runtime_state(
    cursor: psycopg.AsyncCursor[Any],
    *,
    user_id: uuid.UUID,
    next_run_at: datetime | None,
    last_sent_at: datetime | None = None,
    last_delivery_status: str | None = None,
    last_delivery_error: str | None = None,
) -> None:
    await cursor.execute(
        """
        update user_digest_settings
        set
          next_run_at = %s,
          last_sent_at = coalesce(%s, last_sent_at),
          last_delivery_status = %s,
          last_delivery_error = %s,
          updated_at = now()
        where user_id = %s
        """,
        (
            next_run_at,
            last_sent_at,
            last_delivery_status,
            last_delivery_error,
            user_id,
        ),
    )


async def fetch_queued_manual_digest_rows(
    cursor: psycopg.AsyncCursor[Any],
    *,
    limit: int = 10,
) -> list[dict[str, Any]]:
    await cursor.execute(
        """
        select
          digest_delivery_id,
          user_id,
          recipient_email,
          subject,
          body_text,
          body_html
        from digest_delivery_log
        where digest_kind = 'manual_saved'
          and status = 'queued'
        order by requested_at asc
        limit %s
        """,
        (limit,),
    )
    return list(await cursor.fetchall())


async def fetch_due_digest_settings_rows(
    cursor: psycopg.AsyncCursor[Any],
    *,
    limit: int = 10,
) -> list[dict[str, Any]]:
    await cursor.execute(
        """
        select
          uds.user_id,
          uds.is_enabled,
          uds.cadence,
          uds.send_hour,
          uds.send_minute,
          uds.timezone,
          uds.skip_if_empty,
          uds.next_run_at,
          uds.last_sent_at,
          uds.last_delivery_status,
          uds.last_delivery_error
        from user_digest_settings uds
        where uds.is_enabled = true
          and (uds.next_run_at is null or uds.next_run_at <= now())
        order by coalesce(uds.next_run_at, uds.created_at) asc
        limit %s
        """,
        (limit,),
    )
    return list(await cursor.fetchall())


async def fetch_scheduled_digest_items(
    cursor: psycopg.AsyncCursor[Any],
    *,
    user_id: uuid.UUID,
    since_at: datetime | None,
    until_at: datetime,
) -> list[DigestItem]:
    await cursor.execute(
        """
        with ranked_matches as (
          select
            'editorial:' || a.doc_id::text as content_item_id,
            a.title,
            a.url,
            a.lead,
            coalesce(a.extracted_source_name, sc.name) as source_name,
            coalesce(a.published_at, a.ingested_at)::text as published_at,
            row_number() over (
              partition by coalesce(a.canonical_doc_id, a.doc_id)
              order by
                a.published_at desc nulls last,
                a.ingested_at desc,
                a.doc_id
            ) as family_rank
          from interest_match_results imr
          join articles a on a.doc_id = imr.doc_id
          join source_channels sc on sc.channel_id = a.channel_id
          left join final_selection_results fsr on fsr.doc_id = a.doc_id
          left join system_feed_results sfr on sfr.doc_id = a.doc_id
          where imr.user_id = %s
            and imr.decision = 'notify'
            and imr.created_at <= %s
            and (%s::timestamptz is null or imr.created_at > %s::timestamptz)
            and a.visibility_state = 'visible'
            and (
              case
                when fsr.doc_id is not null then coalesce(fsr.is_selected, false)
                else coalesce(sfr.eligible_for_feed, false)
              end
            ) = true
        )
        select
          content_item_id,
          title,
          url,
          lead,
          source_name,
          published_at
        from ranked_matches
        where family_rank = 1
        order by published_at desc nulls last, content_item_id
        """,
        (user_id, until_at, since_at, since_at),
    )
    rows = await cursor.fetchall()
    return [
        DigestItem(
            content_item_id=str(row.get("content_item_id") or ""),
            title=str(row.get("title") or "Untitled article"),
            url=str(row.get("url") or "").strip() or None,
            summary=str(row.get("lead") or "").strip() or None,
            source_name=str(row.get("source_name") or "").strip() or None,
            published_at=str(row.get("published_at") or "").strip() or None,
        )
        for row in rows
        if str(row.get("content_item_id") or "").strip()
    ]


async def process_queued_manual_digests() -> None:
    connection = await open_connection()
    async with connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                rows = await fetch_queued_manual_digest_rows(cursor)
                for row in rows:
                    digest_delivery_id = row["digest_delivery_id"]
                    recipient_email = str(row.get("recipient_email") or "").strip()
                    if not recipient_email:
                        await update_digest_delivery_status(
                            cursor,
                            digest_delivery_id=digest_delivery_id,
                            status="failed",
                            error_text="Recipient email is missing.",
                        )
                        continue

                    attempt = dispatch_channel_message(
                        "email_digest",
                        {"email": recipient_email},
                        str(row.get("subject") or "Saved digest"),
                        str(row.get("body_text") or ""),
                        body_html=str(row.get("body_html") or "").strip() or None,
                    )
                    await update_digest_delivery_status(
                        cursor,
                        digest_delivery_id=digest_delivery_id,
                        status=attempt.status,
                        error_text=None if attempt.status == "sent" else attempt.detail,
                    )


async def process_due_scheduled_digests() -> None:
    now = datetime.now(timezone.utc)
    connection = await open_connection()
    async with connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                rows = await fetch_due_digest_settings_rows(cursor)
                for row in rows:
                    user_id = row["user_id"]
                    cadence = coerce_digest_cadence(row.get("cadence"))
                    send_hour = coerce_digest_send_hour(row.get("send_hour"))
                    send_minute = coerce_digest_send_minute(row.get("send_minute"))
                    timezone_name = str(row.get("timezone") or "").strip()
                    next_run_at = parse_datetime(row.get("next_run_at"))
                    last_sent_at = parse_datetime(row.get("last_sent_at"))
                    skip_if_empty = bool(row.get("skip_if_empty", True))

                    try:
                        validated_timezone = validate_timezone_name(timezone_name)
                    except ValueError as error:
                        await update_user_digest_settings_runtime_state(
                            cursor,
                            user_id=user_id,
                            next_run_at=None,
                            last_delivery_status="failed",
                            last_delivery_error=str(error),
                        )
                        continue

                    if next_run_at is None:
                        initialized_next_run = compute_next_digest_run_at(
                            now=now,
                            cadence=cadence,
                            timezone_name=validated_timezone,
                            send_hour=send_hour,
                            send_minute=send_minute,
                        )
                        await update_user_digest_settings_runtime_state(
                            cursor,
                            user_id=user_id,
                            next_run_at=initialized_next_run,
                            last_delivery_status="queued",
                            last_delivery_error=None,
                        )
                        continue

                    recipient_channel = await fetch_user_digest_channel(cursor, user_id)
                    recipient_email = (
                        str(
                            (
                                recipient_channel.get("config_json")
                                if recipient_channel and isinstance(recipient_channel.get("config_json"), dict)
                                else {}
                            ).get("email")
                            or ""
                        ).strip()
                    )
                    next_scheduled_run = compute_next_digest_run_at(
                        now=now,
                        cadence=cadence,
                        timezone_name=validated_timezone,
                        send_hour=send_hour,
                        send_minute=send_minute,
                        base_run_at=next_run_at,
                    )

                    if not recipient_email:
                        await update_user_digest_settings_runtime_state(
                            cursor,
                            user_id=user_id,
                            next_run_at=next_scheduled_run,
                            last_delivery_status="failed",
                            last_delivery_error="Connected digest email is missing.",
                        )
                        continue

                    run_cutoff = now
                    items = await fetch_scheduled_digest_items(
                        cursor,
                        user_id=user_id,
                        since_at=last_sent_at,
                        until_at=run_cutoff,
                    )
                    subject = build_digest_subject(
                        digest_kind="scheduled_matches",
                        item_count=len(items),
                        cadence=cadence,
                    )

                    if not items and skip_if_empty:
                        await insert_digest_delivery_log_row(
                            cursor,
                            user_id=user_id,
                            digest_kind="scheduled_matches",
                            cadence=cadence,
                            status="skipped_empty",
                            recipient_email=recipient_email,
                            subject=subject,
                            body_text="",
                            body_html="",
                            metadata_json={
                                "itemCount": 0,
                                "skipIfEmpty": True,
                            },
                        )
                        await update_user_digest_settings_runtime_state(
                            cursor,
                            user_id=user_id,
                            next_run_at=next_scheduled_run,
                            last_delivery_status="skipped_empty",
                            last_delivery_error=None,
                        )
                        continue

                    intro = (
                        "New personalized matches from the system-selected collection since your last successful digest."
                    )
                    body_text = render_digest_text(
                        heading=subject,
                        intro=intro,
                        items=items,
                    )
                    body_html = render_digest_html(
                        heading=subject,
                        intro=intro,
                        items=items,
                    )
                    digest_delivery_id = await insert_digest_delivery_log_row(
                        cursor,
                        user_id=user_id,
                        digest_kind="scheduled_matches",
                        cadence=cadence,
                        status="queued",
                        recipient_email=recipient_email,
                        subject=subject,
                        body_text=body_text,
                        body_html=body_html,
                        metadata_json={
                            "itemCount": len(items),
                            "scheduledRunAt": next_run_at.isoformat(),
                            "windowEnd": run_cutoff.isoformat(),
                            "windowStart": last_sent_at.isoformat() if last_sent_at else None,
                        },
                    )
                    await upsert_digest_delivery_items(
                        cursor,
                        digest_delivery_id=digest_delivery_id,
                        content_item_ids=[item.content_item_id for item in items],
                    )
                    attempt = dispatch_channel_message(
                        "email_digest",
                        {"email": recipient_email},
                        subject,
                        body_text,
                        body_html=body_html,
                    )
                    await update_digest_delivery_status(
                        cursor,
                        digest_delivery_id=digest_delivery_id,
                        status=attempt.status,
                        error_text=None if attempt.status == "sent" else attempt.detail,
                    )
                    if attempt.status == "sent":
                        await update_user_digest_settings_runtime_state(
                            cursor,
                            user_id=user_id,
                            next_run_at=next_scheduled_run,
                            last_sent_at=run_cutoff,
                            last_delivery_status="sent",
                            last_delivery_error=None,
                        )
                    else:
                        await update_user_digest_settings_runtime_state(
                            cursor,
                            user_id=user_id,
                            next_run_at=now + timedelta(minutes=15),
                            last_delivery_status="failed",
                            last_delivery_error=attempt.detail,
                        )


async def insert_notification_suppression(
    cursor: psycopg.AsyncCursor[Any],
    *,
    user_id: uuid.UUID,
    interest_id: uuid.UUID | None,
    notification_id: uuid.UUID | None,
    doc_id: uuid.UUID | None,
    family_id: uuid.UUID | None,
    cluster_id: uuid.UUID | None,
    reason: str,
) -> None:
    await cursor.execute(
        """
        insert into notification_suppression (
          user_id,
          interest_id,
          notification_id,
          doc_id,
          family_id,
          event_cluster_id,
          reason
        )
        values (%s, %s, %s, %s, %s, %s, %s)
        """,
        (
            user_id,
            interest_id,
            notification_id,
            doc_id,
            family_id,
            cluster_id,
            reason,
        ),
    )


async def find_exact_duplicate_candidate(
    cursor: psycopg.AsyncCursor[Any],
    doc_id: uuid.UUID,
    exact_hash: str,
) -> dict[str, Any] | None:
    await cursor.execute(
        """
        select
          doc_id,
          canonical_doc_id,
          family_id,
          ingested_at
        from articles
        where
          doc_id <> %s
          and exact_hash = %s
          and processing_state in ('normalized', 'deduped', 'embedded', 'clustered', 'matched', 'notified')
          and ingested_at >= now() - interval '7 days'
        order by ingested_at, doc_id
        limit 1
        """,
        (doc_id, exact_hash),
    )
    return await cursor.fetchone()


async def find_near_duplicate_candidate(
    cursor: psycopg.AsyncCursor[Any],
    doc_id: uuid.UUID,
    simhash64: int,
) -> dict[str, Any] | None:
    await cursor.execute(
        """
        select
          doc_id,
          canonical_doc_id,
          family_id,
          simhash64,
          ingested_at
        from articles
        where
          doc_id <> %s
          and simhash64 is not null
          and processing_state in ('normalized', 'deduped', 'embedded', 'clustered', 'matched', 'notified')
          and ingested_at >= now() - interval '7 days'
        order by ingested_at desc
        limit 200
        """,
        (doc_id,),
    )
    candidates = await cursor.fetchall()

    best_candidate: dict[str, Any] | None = None
    best_distance = 64
    for candidate in candidates:
        distance = hamming_distance64(simhash64, int(candidate["simhash64"]))
        if distance <= 3 and distance < best_distance:
            best_candidate = candidate
            best_distance = distance

    return best_candidate


def resolve_canonical_doc_id(candidate: dict[str, Any]) -> uuid.UUID:
    return candidate.get("canonical_doc_id") or candidate["doc_id"]


def resolve_family_id(candidate: dict[str, Any]) -> uuid.UUID:
    return candidate.get("family_id") or resolve_canonical_doc_id(candidate)


async def process_normalize(job: Job, _job_token: str) -> dict[str, Any]:
    event_id = str(job.data.get("eventId"))
    doc_id = str(job.data.get("docId"))
    suppress_pipeline_fanout = suppress_downstream_outbox(job)

    if not event_id or event_id == "None" or not doc_id or doc_id == "None":
        raise ValueError("Normalize worker expected eventId and docId.")

    connection = await open_connection()
    async with connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                if await is_event_processed(cursor, NORMALIZE_CONSUMER, event_id):
                    return {"status": "duplicate-event", "docId": doc_id}

                article = await fetch_article_for_update(cursor, doc_id)
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


async def process_article_extract(job: Job, _job_token: str) -> dict[str, Any]:
    from .task_engine.pipeline_plugins import ArticleExtractPlugin

    plugin = ArticleExtractPlugin()
    event_id = str(job.data.get("eventId"))
    doc_id = str(job.data.get("docId"))
    force_enrichment = coerce_bool(job.data.get("forceEnrichment"))

    return await plugin.execute(
        {},
        {
            "event_id": event_id,
            "doc_id": doc_id,
            "force_enrichment": force_enrichment,
        },
    )


async def process_dedup(job: Job, _job_token: str) -> dict[str, Any]:
    event_id = str(job.data.get("eventId"))
    doc_id = str(job.data.get("docId"))

    if not event_id or event_id == "None" or not doc_id or doc_id == "None":
        raise ValueError("Dedup worker expected eventId and docId.")

    connection = await open_connection()
    async with connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                if await is_event_processed(cursor, DEDUP_CONSUMER, event_id):
                    return {"status": "duplicate-event", "docId": doc_id}

                article = await fetch_article_for_update(cursor, doc_id)
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
                await sync_article_canonical_document(
                    cursor,
                    article,
                    canonical_document_id=canonical_doc_id,
                    is_exact_duplicate=is_exact_duplicate,
                    is_near_duplicate=is_near_duplicate,
                )
                await record_processed_event(cursor, DEDUP_CONSUMER, event_id)

    return {"status": "deduped", "docId": doc_id}


async def process_embed(job: Job, _job_token: str) -> dict[str, Any]:
    event_id = str(job.data.get("eventId"))
    doc_id = str(job.data.get("docId"))
    vector_version = coerce_positive_int(job.data.get("version"), 1)
    suppress_pipeline_fanout = suppress_downstream_outbox(job)

    if not event_id or event_id == "None" or not doc_id or doc_id == "None":
        raise ValueError("Embed worker expected eventId and docId.")

    connection = await open_connection()
    async with connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                if await is_event_processed(cursor, EMBED_CONSUMER, event_id):
                    return {"status": "duplicate-event", "docId": doc_id}

                article = await fetch_article_for_update(cursor, doc_id)
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
                        truncate_text_for_embedding(body),
                    )
                    if part
                )
                title_vector, lead_vector, body_vector = EMBEDDING_PROVIDER.embed_texts(
                    [
                        title or "Untitled article",
                        lead or title or "No lead provided",
                        embedding_body or title or lead or "No body provided",
                    ]
                )
                event_vector = mix_weighted_vectors(
                    [
                        (0.6, title_vector),
                        (0.4, lead_vector),
                    ]
                )
                features = FEATURE_EXTRACTOR.extract(title=title, lead=lead, body=body)
                await upsert_article_features(
                    cursor,
                    article["doc_id"],
                    numbers=features.numbers,
                    short_tokens=features.short_tokens,
                    places=features.places,
                    entities=features.entities,
                    search_vector_version=features.search_vector_version,
                    feature_version=features.feature_version,
                )

                e_title_id = await upsert_embedding_registry(
                    cursor,
                    entity_type="article",
                    entity_id=article["doc_id"],
                    vector_type="e_title",
                    model_key=EMBEDDING_PROVIDER.model_key,
                    vector_version=vector_version,
                    vector=title_vector,
                    content_hash=compute_content_hash({"text": title, "vectorType": "e_title"}),
                )
                e_lead_id = await upsert_embedding_registry(
                    cursor,
                    entity_type="article",
                    entity_id=article["doc_id"],
                    vector_type="e_lead",
                    model_key=EMBEDDING_PROVIDER.model_key,
                    vector_version=vector_version,
                    vector=lead_vector,
                    content_hash=compute_content_hash({"text": lead, "vectorType": "e_lead"}),
                )
                e_body_id = await upsert_embedding_registry(
                    cursor,
                    entity_type="article",
                    entity_id=article["doc_id"],
                    vector_type="e_body",
                    model_key=EMBEDDING_PROVIDER.model_key,
                    vector_version=vector_version,
                    vector=body_vector,
                    content_hash=compute_content_hash(
                        {"text": embedding_body, "vectorType": "e_body"}
                    ),
                )
                e_event_id = await upsert_embedding_registry(
                    cursor,
                    entity_type="article",
                    entity_id=article["doc_id"],
                    vector_type="e_event",
                    model_key=EMBEDDING_PROVIDER.model_key,
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
                    await upsert_article_vector_registry(
                        cursor,
                        doc_id=article["doc_id"],
                        vector_type=vector_type,
                        embedding_id=embedding_id,
                        vector_version=vector_version,
                    )

                await upsert_event_vector_registry(
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
        "modelKey": EMBEDDING_PROVIDER.model_key,
        "dimensions": EMBEDDING_PROVIDER.dimensions,
    }


async def process_cluster(job: Job, _job_token: str) -> dict[str, Any]:
    event_id = str(job.data.get("eventId"))
    doc_id = str(job.data.get("docId"))
    vector_version = coerce_positive_int(job.data.get("version"), 1)
    suppress_pipeline_fanout = suppress_downstream_outbox(job)

    if not event_id or event_id == "None" or not doc_id or doc_id == "None":
        raise ValueError("Cluster worker expected eventId and docId.")

    connection = await open_connection()
    async with connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                if await is_event_processed(cursor, CLUSTER_CONSUMER, event_id):
                    return {"status": "duplicate-event", "docId": doc_id}

                article = await fetch_article_for_update(cursor, doc_id)
                current_state = str(article.get("processing_state") or "raw")
                if PROCESSING_STATE_ORDER.get(current_state, 0) < PROCESSING_STATE_ORDER["embedded"]:
                    raise ValueError(f"Article {doc_id} must be embedded before clustering.")
                story_cluster_result = await sync_story_cluster_and_verification(
                    cursor,
                    article=article,
                    vector_version=vector_version,
                )
                system_feed_result = await upsert_system_feed_result(cursor, article["doc_id"])
                if system_feed_result is None or not bool(
                    system_feed_result.get(
                        "final_selection_selected",
                        system_feed_result.get("eligible_for_feed"),
                    )
                ):
                    await record_processed_event(cursor, CLUSTER_CONSUMER, event_id)
                    return {
                        "status": "skipped-selection-gate",
                        "docId": doc_id,
                        "selectionSource": str(
                            system_feed_result.get("selection_source")
                            if system_feed_result is not None
                            else "pending"
                        ),
                        "selectionDecision": str(
                            (
                                system_feed_result.get(
                                    "final_selection_decision",
                                    system_feed_result.get("decision"),
                                )
                                or ""
                            )
                            if system_feed_result is not None
                            else ""
                        ),
                        "selectionSelected": bool(
                            system_feed_result.get(
                                "final_selection_selected",
                                system_feed_result.get("eligible_for_feed"),
                            )
                            if system_feed_result is not None
                            else False
                        ),
                        "storyClusterId": story_cluster_result.get("storyClusterId"),
                        "storyVerificationState": story_cluster_result.get(
                            "storyVerificationState"
                        ),
                        "canonicalVerificationState": story_cluster_result.get(
                            "canonicalVerificationState"
                        ),
                    }

                article_features = await fetch_article_features_row(cursor, article["doc_id"])
                article_vectors = await fetch_article_vectors(cursor, article["doc_id"])
                event_vector = article_vectors.get("e_event")
                if not event_vector:
                    raise ValueError(f"Article {doc_id} is missing e_event embedding.")

                cluster_row: dict[str, Any] | None = None
                if article.get("family_id") and article.get("family_id") != article["doc_id"]:
                    await cursor.execute(
                        """
                        select ec.*
                        from articles a
                        join event_clusters ec on ec.cluster_id = a.event_cluster_id
                        where a.doc_id = %s
                        limit 1
                        """,
                        (article["family_id"],),
                    )
                    family_cluster = await cursor.fetchone()
                    if family_cluster is not None:
                        cluster_row = family_cluster

                if cluster_row is None:
                    candidates = await load_recent_cluster_candidates(cursor)
                    best_score = 0.0
                    article_published_at = parse_datetime(article.get("published_at"))
                    for candidate in candidates:
                        candidate_vector = await fetch_cluster_event_vector(
                            cursor, candidate["cluster_id"]
                        )
                        if not candidate_vector:
                            continue
                        semantic_score = cosine_similarity(event_vector, candidate_vector)
                        entity_score = overlap_ratio(
                            article_features.get("entities", []),
                            coerce_text_list(candidate.get("top_entities")),
                        )
                        geo_score = overlap_ratio(
                            article_features.get("places", []),
                            coerce_text_list(candidate.get("top_places")),
                        )
                        score_same_event = compute_cluster_same_event_score(
                            semantic_score=semantic_score,
                            entity_score=entity_score,
                            geo_score=geo_score,
                            delta_hours=hours_between(
                                article_published_at,
                                parse_datetime(candidate.get("max_published_at")),
                            ),
                        )
                        if score_same_event > best_score:
                            best_score = score_same_event
                            cluster_row = candidate if decide_cluster(score_same_event) else cluster_row

                cluster_id, is_new_cluster = await create_or_update_cluster(
                    cursor,
                    article=article,
                    vector_version=vector_version,
                    cluster_row=cluster_row,
                )
                next_state = advance_processing_state(current_state, "clustered")
                await cursor.execute(
                    """
                    update articles
                    set
                      event_cluster_id = %s,
                      processing_state = %s,
                      updated_at = now()
                    where doc_id = %s
                    """,
                    (cluster_id, next_state, article["doc_id"]),
                )
                if not suppress_pipeline_fanout:
                    await insert_outbox_event(
                        cursor,
                        ARTICLE_CLUSTERED_EVENT,
                        "article",
                        article["doc_id"],
                        {"docId": str(article["doc_id"]), "version": vector_version},
                    )
                await record_processed_event(cursor, CLUSTER_CONSUMER, event_id)

    return {
        "status": "clustered",
        "docId": doc_id,
        "isNewCluster": is_new_cluster,
        "clusterId": str(cluster_id),
        "storyClusterId": story_cluster_result.get("storyClusterId"),
        "storyVerificationState": story_cluster_result.get("storyVerificationState"),
        "canonicalVerificationState": story_cluster_result.get(
            "canonicalVerificationState"
        ),
        "isNewStoryCluster": bool(story_cluster_result.get("isNewStoryCluster")),
    }


async def process_match_criteria(job: Job, _job_token: str) -> dict[str, Any]:
    event_id = str(job.data.get("eventId"))
    doc_id = str(job.data.get("docId"))
    historical_backfill = coerce_bool(job.data.get("historicalBackfill"))
    suppress_pipeline_fanout = suppress_downstream_outbox(job)

    if not event_id or event_id == "None" or not doc_id or doc_id == "None":
        raise ValueError("Criteria match worker expected eventId and docId.")

    connection = await open_connection()
    async with connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                if await is_event_processed(cursor, CRITERIA_MATCH_CONSUMER, event_id):
                    return {"status": "duplicate-event", "docId": doc_id}

                article = await fetch_article_for_update(cursor, doc_id)
                article_features = await fetch_article_features_row(cursor, article["doc_id"])
                article_vectors = await fetch_article_vectors(cursor, article["doc_id"])
                criteria_rows = await list_compiled_criteria(cursor)
                prompt_template = await find_prompt_template(cursor, "criteria")
                llm_quota_snapshot = await get_llm_review_monthly_quota_snapshot(cursor)
                filter_context = await resolve_interest_filter_context(
                    cursor,
                    article=article,
                    prefer_story_cluster=False,
                )
                criteria_count = 0

                for criterion in criteria_rows:
                    compiled_json = coerce_json_object(criterion.get("compiled_json"))
                    hard_constraints = coerce_json_object(compiled_json.get("hard_constraints"))
                    base_pass_filters, filter_reasons, within_window = passes_hard_filters(
                        article=article,
                        article_features=article_features,
                        hard_constraints=hard_constraints,
                    )
                    allowed_content_kinds = coerce_text_list(
                        criterion.get("allowed_content_kinds")
                    )
                    content_kind_allowed, article_content_kind = passes_allowed_content_kind(
                        article=article,
                        allowed_content_kinds=allowed_content_kinds,
                    )
                    if not content_kind_allowed:
                        filter_reasons = ["content_kind", *filter_reasons]
                    pass_filters = base_pass_filters and content_kind_allowed
                    lexical_score = await compute_lexical_score(
                        cursor,
                        article["doc_id"],
                        str(compiled_json.get("lexical_query") or ""),
                    )
                    target_features = coerce_json_object(compiled_json.get("target_features"))
                    positive_vectors = await fetch_embedding_vectors_by_ids(
                        cursor,
                        coerce_text_list(compiled_json.get("positive_embedding_ids")),
                    )
                    negative_vectors = await fetch_embedding_vectors_by_ids(
                        cursor,
                        coerce_text_list(compiled_json.get("negative_embedding_ids")),
                    )
                    positive_score = 0.0
                    negative_score = 0.0
                    meta_score = 0.0
                    meta_components: dict[str, float] = {}
                    if pass_filters:
                        positive_score = semantic_prototype_score(
                            title_vector=article_vectors.get("e_title", []),
                            lead_vector=article_vectors.get("e_lead", []),
                            body_vector=article_vectors.get("e_body", []),
                            prototypes=positive_vectors,
                            title_weight=0.50,
                            lead_weight=0.30,
                            body_weight=0.20,
                        )
                        negative_score = semantic_prototype_score(
                            title_vector=article_vectors.get("e_title", []),
                            lead_vector=article_vectors.get("e_lead", []),
                            body_vector=article_vectors.get("e_body", []),
                            prototypes=negative_vectors,
                            title_weight=0.50,
                            lead_weight=0.30,
                            body_weight=0.20,
                        )
                        meta_score, meta_components = compute_criterion_meta_score(
                            article_features=article_features,
                            target_features=target_features,
                            place_constraints=coerce_text_list(hard_constraints.get("places")),
                            is_within_time_window=within_window,
                        )
                    score_final = (
                        compute_criterion_final_score(
                            positive_score=positive_score,
                            negative_score=negative_score,
                            lexical_score=lexical_score,
                            meta_score=meta_score,
                        )
                        if pass_filters
                        else 0.0
                    )
                    decision = decide_criterion(score_final) if pass_filters else "irrelevant"
                    decision, candidate_signal_explain = apply_document_candidate_signal_uplift(
                        title=str(article.get("title") or ""),
                        lead=str(article.get("lead") or ""),
                        body=str(article.get("body") or ""),
                        score_final=score_final,
                        positive_score=positive_score,
                        lexical_score=lexical_score,
                        canonical_document_id=(
                            str(filter_context.get("canonicalDocumentId") or "").strip()
                            or None
                        ),
                        story_cluster_id=(
                            str(filter_context.get("storyClusterId") or "").strip() or None
                        ),
                        verification_state=filter_context.get("verificationState"),
                        base_decision=decision,
                        candidate_signal_config=(
                            coerce_json_object(compiled_json.get("candidateSignals"))
                            or coerce_json_object(
                                coerce_json_object(
                                    criterion.get("selection_profile_definition_json")
                                ).get("candidateSignals")
                            )
                        ),
                    )
                    selection_profile_runtime = coerce_selection_profile_runtime(criterion)
                    explain_json = {
                        "filterReasons": filter_reasons,
                        "contentKind": {
                            "article": article_content_kind,
                            "allowed": allowed_content_kinds,
                            "matched": content_kind_allowed,
                        },
                        "S_pos": positive_score,
                        "S_neg": negative_score,
                        "S_lex": lexical_score,
                        "S_meta": meta_score,
                        "S_final": score_final,
                        "metaComponents": meta_components,
                        "selectionProfile": build_selection_profile_runtime_explain(
                            selection_profile_runtime
                        ),
                    }
                    if candidate_signal_explain is not None:
                        explain_json["candidateSignals"] = candidate_signal_explain
                    runtime_resolution = None
                    llm_review_allowed = selection_profile_allows_llm_review(
                        selection_profile_runtime
                    )
                    candidate_recovery_protected = bool(
                        candidate_signal_explain
                        and candidate_signal_explain.get("upliftedToGrayZone")
                    )
                    if decision == "gray_zone":
                        if llm_review_allowed:
                            runtime_resolution = resolve_criterion_gray_zone_runtime_resolution(
                                llm_quota_snapshot,
                                preserve_candidate_gray_zone=candidate_recovery_protected,
                            )
                            if runtime_resolution is not None:
                                decision = str(runtime_resolution["finalDecision"])
                                explain_json["llmBudgetGate"] = build_llm_budget_gate_explain(
                                    quota_snapshot=llm_quota_snapshot,
                                    resolution=runtime_resolution,
                                )
                                if decision == "gray_zone":
                                    explain_json["grayZonePolicy"] = {
                                        "reason": "candidate_recovery_runtime_policy",
                                        "finalDecision": decision,
                                        "llmReviewQueued": False,
                                        "blockedBy": str(
                                            runtime_resolution.get("reason") or ""
                                        ),
                                    }
                        else:
                            decision = resolve_profile_gray_zone_decision(
                                selection_profile_runtime
                            )
                            explain_json["grayZonePolicy"] = {
                                "reason": "selection_profile_runtime_policy",
                                "finalDecision": decision,
                                "llmReviewQueued": False,
                            }
                    llm_review_queued = (
                        decision == "gray_zone"
                        and runtime_resolution is None
                        and llm_review_allowed
                        and not historical_backfill
                    )
                    if decision == "gray_zone":
                        runtime_review_reason = "queued" if llm_review_queued else None
                        if runtime_review_reason is None and historical_backfill and llm_review_allowed:
                            runtime_review_reason = "historical_backfill_skip"
                        if runtime_review_reason is None:
                            runtime_review_reason = str(
                                coerce_json_object(explain_json.get("grayZonePolicy")).get("reason")
                                or ""
                            ).strip() or "not_queued"
                        explain_json["runtimeReviewState"] = {
                            "reviewQueued": llm_review_queued,
                            "reason": runtime_review_reason,
                            "candidateRecoveryProtected": candidate_recovery_protected,
                        }
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
                        values (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                        on conflict (doc_id, criterion_id) do update
                        set
                          score_pos = excluded.score_pos,
                          score_neg = excluded.score_neg,
                          score_lex = excluded.score_lex,
                          score_meta = excluded.score_meta,
                          score_final = excluded.score_final,
                          decision = excluded.decision,
                          explain_json = excluded.explain_json,
                          created_at = now()
                        """,
                        (
                            article["doc_id"],
                            criterion["criterion_id"],
                            positive_score,
                            negative_score,
                            lexical_score,
                            meta_score,
                            score_final,
                            decision,
                            Json(make_json_safe(explain_json)),
                        ),
                    )
                    technical_filter_state, semantic_decision = resolve_criterion_filter_outcome(
                        pass_filters=pass_filters,
                        compat_decision=decision,
                    )
                    await upsert_interest_filter_result(
                        cursor,
                        filter_scope="system_criterion",
                        doc_id=uuid.UUID(str(article["doc_id"])),
                        canonical_document_id=filter_context["canonicalDocumentId"],
                        story_cluster_id=filter_context["storyClusterId"],
                        user_id=None,
                        criterion_id=uuid.UUID(str(criterion["criterion_id"])),
                        interest_id=None,
                        technical_filter_state=technical_filter_state,
                        semantic_decision=semantic_decision,
                        compat_decision=decision,
                        verification_target_type=filter_context["verificationTargetType"],
                        verification_target_id=filter_context["verificationTargetId"],
                        verification_state=filter_context["verificationState"],
                        semantic_score=score_final,
                        explain_json=build_interest_filter_explain(
                            base_explain_json=make_json_safe(explain_json),
                            technical_filter_state=technical_filter_state,
                            semantic_decision=semantic_decision,
                            compat_decision=decision,
                            filter_scope="system_criterion",
                            context=filter_context,
                        ),
                    )
                    reused_review = None
                    if llm_review_queued:
                        reused_review = await find_reusable_criterion_llm_review(
                            cursor,
                            doc_id=article["doc_id"],
                            criterion_id=criterion["criterion_id"],
                            canonical_document_id=filter_context["canonicalDocumentId"],
                        )
                        if reused_review is not None:
                            await persist_criterion_review_resolution(
                                cursor,
                                article=article,
                                criterion_id=criterion["criterion_id"],
                                review_context={"explain_json": explain_json},
                                provider_decision=str(
                                    reused_review.get("provider_decision") or "reject"
                                ),
                                provider_score=(
                                    float(reused_review.get("score"))
                                    if reused_review.get("score") is not None
                                    else None
                                ),
                                review_source="reused_canonical_llm_review",
                                review_id=str(reused_review.get("review_id") or "").strip()
                                or None,
                                reused_from_doc_id=str(
                                    reused_review.get("reviewed_doc_id") or ""
                                ).strip()
                                or None,
                                reused_canonical_document_id=str(
                                    reused_review.get("reviewed_canonical_document_id") or ""
                                ).strip()
                                or None,
                                prompt_template_id=str(
                                    reused_review.get("prompt_template_id") or ""
                                ).strip()
                                or None,
                                prompt_version=(
                                    int(reused_review.get("prompt_version"))
                                    if reused_review.get("prompt_version") is not None
                                    else None
                                ),
                                refresh_selection_gate=False,
                                historical_backfill=historical_backfill,
                                suppress_pipeline_fanout=suppress_pipeline_fanout,
                            )
                            llm_review_queued = False
                    if llm_review_queued:
                        await insert_outbox_event(
                            cursor,
                            LLM_REVIEW_REQUESTED_EVENT,
                            "criterion",
                            uuid.UUID(criterion["criterion_id"]),
                            {
                                "docId": str(article["doc_id"]),
                                "scope": "criterion",
                                "targetId": str(criterion["criterion_id"]),
                                "promptTemplateId": (
                                    str(prompt_template["prompt_template_id"])
                                    if prompt_template is not None
                                    else None
                                ),
                                "version": int(criterion.get("source_version") or 1),
                            },
                        )
                    criteria_count += 1

                system_feed_result = await upsert_system_feed_result(cursor, article["doc_id"])
                if (
                    should_dispatch_clustering(system_feed_result)
                    and not historical_backfill
                    and not suppress_pipeline_fanout
                ):
                    await insert_outbox_event(
                        cursor,
                        ARTICLE_CRITERIA_MATCHED_EVENT,
                        "article",
                        article["doc_id"],
                        {"docId": str(article["doc_id"]), "version": 1},
                    )
                await record_processed_event(cursor, CRITERIA_MATCH_CONSUMER, event_id)

    return {
        "status": "matched",
        "docId": doc_id,
        "criteriaCount": criteria_count,
    }


async def process_match_interests(job: Job, _job_token: str) -> dict[str, Any]:
    event_id = str(job.data.get("eventId"))
    doc_id = str(job.data.get("docId"))
    historical_backfill = coerce_bool(job.data.get("historicalBackfill"))
    scoped_user_id = coerce_optional_string(job.data.get("userId"))
    scoped_interest_id = coerce_optional_string(job.data.get("interestId"))
    suppress_pipeline_fanout = suppress_downstream_outbox(job)

    if not event_id or event_id == "None" or not doc_id or doc_id == "None":
        raise ValueError("Interest match worker expected eventId and docId.")

    connection = await open_connection()
    async with connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                if await is_event_processed(cursor, INTEREST_MATCH_CONSUMER, event_id):
                    return {"status": "duplicate-event", "docId": doc_id}

                article = await fetch_article_for_update(cursor, doc_id)
                selection_gate = await fetch_selection_gate_result_row(
                    cursor,
                    article["doc_id"],
                )
                if selection_gate is None or not bool(selection_gate.get("is_selected")):
                    await record_processed_event(cursor, INTEREST_MATCH_CONSUMER, event_id)
                    return {
                        "status": "skipped-selection-gate",
                        "docId": doc_id,
                        "interestCount": 0,
                        "selectionSource": str(
                            selection_gate.get("selection_source")
                            if selection_gate is not None
                            else "pending"
                        ),
                        "selectionDecision": str(
                            selection_gate.get("decision")
                            if selection_gate is not None
                            else ""
                        ),
                        "selectionSelected": bool(
                            selection_gate.get("is_selected")
                            if selection_gate is not None
                            else False
                        ),
                    }
                article_features = await fetch_article_features_row(cursor, article["doc_id"])
                article_vectors = await fetch_article_vectors(cursor, article["doc_id"])
                filter_context = await resolve_interest_filter_context(
                    cursor,
                    article=article,
                    prefer_story_cluster=True,
                )
                if scoped_user_id or scoped_interest_id:
                    cleanup_filters = ["doc_id = %s"]
                    cleanup_params: list[Any] = [article["doc_id"]]
                    if scoped_user_id:
                        cleanup_filters.append("user_id = %s")
                        cleanup_params.append(scoped_user_id)
                    if scoped_interest_id:
                        cleanup_filters.append("interest_id = %s")
                        cleanup_params.append(scoped_interest_id)
                    await cursor.execute(
                        f"""
                        delete from interest_match_results
                        where {' and '.join(cleanup_filters)}
                        """,
                        tuple(cleanup_params),
                    )
                    interest_filter_cleanup_filters = ["doc_id = %s", "filter_scope = 'user_interest'"]
                    interest_filter_cleanup_params: list[Any] = [article["doc_id"]]
                    if scoped_user_id:
                        interest_filter_cleanup_filters.append("user_id = %s")
                        interest_filter_cleanup_params.append(scoped_user_id)
                    if scoped_interest_id:
                        interest_filter_cleanup_filters.append("interest_id = %s")
                        interest_filter_cleanup_params.append(scoped_interest_id)
                    await cursor.execute(
                        f"""
                        delete from interest_filter_results
                        where {' and '.join(interest_filter_cleanup_filters)}
                        """,
                        tuple(interest_filter_cleanup_params),
                    )

                interest_rows = await list_compiled_interests(
                    cursor,
                    user_id=scoped_user_id,
                    interest_id=scoped_interest_id,
                )
                pending_rows: list[dict[str, Any]] = []

                for interest in interest_rows:
                    compiled_json = coerce_json_object(interest.get("compiled_json"))
                    hard_constraints = coerce_json_object(compiled_json.get("hard_constraints"))
                    pass_filters, filter_reasons, _within_window = passes_hard_filters(
                        article=article,
                        article_features=article_features,
                        hard_constraints=hard_constraints,
                    )
                    user_id = uuid.UUID(str(interest["user_id"]))
                    interest_id = uuid.UUID(str(interest["interest_id"]))
                    cluster_id = article.get("event_cluster_id")
                    family_id = article.get("family_id")

                    target_features = coerce_json_object(compiled_json.get("target_features"))
                    positive_vectors = await fetch_embedding_vectors_by_ids(
                        cursor,
                        coerce_text_list(compiled_json.get("positive_embedding_ids")),
                    )
                    negative_vectors = await fetch_embedding_vectors_by_ids(
                        cursor,
                        coerce_text_list(compiled_json.get("negative_embedding_ids")),
                    )
                    positive_score = 0.0
                    negative_score = 0.0
                    meta_score = 0.0
                    meta_components: dict[str, float] = {}
                    novelty_score = 0.0
                    major_update = False

                    if pass_filters:
                        novelty_score, major_update = await compute_novelty_score(
                            cursor,
                            user_id=user_id,
                            interest_id=interest_id,
                            cluster_id=cluster_id,
                            family_id=family_id,
                            article_features=article_features,
                        )
                        positive_score = semantic_prototype_score(
                            title_vector=article_vectors.get("e_title", []),
                            lead_vector=article_vectors.get("e_lead", []),
                            body_vector=article_vectors.get("e_body", []),
                            prototypes=positive_vectors,
                            title_weight=0.45,
                            lead_weight=0.35,
                            body_weight=0.20,
                        )
                        negative_score = semantic_prototype_score(
                            title_vector=article_vectors.get("e_title", []),
                            lead_vector=article_vectors.get("e_lead", []),
                            body_vector=article_vectors.get("e_body", []),
                            prototypes=negative_vectors,
                            title_weight=0.45,
                            lead_weight=0.35,
                            body_weight=0.20,
                        )
                        allowed_languages = {
                            value.casefold()
                            for value in coerce_text_list(hard_constraints.get("languages_allowed"))
                        }
                        language_allowed = not allowed_languages or str(article.get("lang") or "").casefold() in allowed_languages
                        meta_score, meta_components = compute_interest_meta_score(
                            article_features=article_features,
                            target_features=target_features,
                            place_constraints=coerce_text_list(hard_constraints.get("places")),
                            language_allowed=language_allowed,
                        )

                    priority = float(hard_constraints.get("priority") or interest.get("priority") or 1.0)
                    score_interest = (
                        compute_interest_final_score(
                            positive_score=positive_score,
                            negative_score=negative_score,
                            meta_score=meta_score,
                            novelty_score=novelty_score,
                            priority=priority,
                        )
                        if pass_filters
                        else 0.0
                    )
                    decision = (
                        decide_interest(
                            score_interest,
                            novelty_score=novelty_score,
                            priority=priority,
                        )
                        if pass_filters
                        else "ignore"
                    )
                    pending_rows.append(
                        {
                            "doc_id": article["doc_id"],
                            "user_id": user_id,
                            "interest_id": interest_id,
                            "cluster_id": cluster_id,
                            "pass_filters": pass_filters,
                            "score_pos": positive_score,
                            "score_neg": negative_score,
                            "score_meta": meta_score,
                            "score_novel": novelty_score,
                            "score_interest": score_interest,
                            "decision": decision,
                            "explain_json": {
                                "filterReasons": filter_reasons,
                                "majorUpdate": major_update,
                                "metaComponents": meta_components,
                                "S_pos": positive_score,
                                "S_neg": negative_score,
                                "S_meta": meta_score,
                                "S_novel": novelty_score,
                                "S_interest": score_interest,
                            },
                        }
                    )

                max_score_by_user: dict[uuid.UUID, float] = defaultdict(float)
                for row in pending_rows:
                    max_score_by_user[row["user_id"]] = max(
                        max_score_by_user[row["user_id"]],
                        float(row["score_interest"]),
                    )

                should_trigger_notify = False
                for row in pending_rows:
                    score_user = max_score_by_user[row["user_id"]]
                    row["score_user"] = score_user
                    if row["decision"] in {"notify", "gray_zone"}:
                        should_trigger_notify = True
                    await cursor.execute(
                        """
                        insert into interest_match_results (
                          doc_id,
                          user_id,
                          interest_id,
                          event_cluster_id,
                          score_pos,
                          score_neg,
                          score_meta,
                          score_novel,
                          score_interest,
                          score_user,
                          decision,
                          explain_json
                        )
                        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                        on conflict (doc_id, interest_id) do update
                        set
                          user_id = excluded.user_id,
                          event_cluster_id = excluded.event_cluster_id,
                          score_pos = excluded.score_pos,
                          score_neg = excluded.score_neg,
                          score_meta = excluded.score_meta,
                          score_novel = excluded.score_novel,
                          score_interest = excluded.score_interest,
                          score_user = excluded.score_user,
                          decision = excluded.decision,
                          explain_json = excluded.explain_json,
                          created_at = now()
                        """,
                        (
                            row["doc_id"],
                            row["user_id"],
                            row["interest_id"],
                            row["cluster_id"],
                            row["score_pos"],
                            row["score_neg"],
                            row["score_meta"],
                            row["score_novel"],
                            row["score_interest"],
                            row["score_user"],
                            row["decision"],
                            Json(make_json_safe(row["explain_json"])),
                        ),
                    )
                    technical_filter_state, semantic_decision = resolve_user_interest_filter_outcome(
                        pass_filters=bool(row.get("pass_filters")),
                        compat_decision=str(row["decision"]),
                    )
                    await upsert_interest_filter_result(
                        cursor,
                        filter_scope="user_interest",
                        doc_id=uuid.UUID(str(row["doc_id"])),
                        canonical_document_id=filter_context["canonicalDocumentId"],
                        story_cluster_id=filter_context["storyClusterId"],
                        user_id=row["user_id"],
                        criterion_id=None,
                        interest_id=row["interest_id"],
                        technical_filter_state=technical_filter_state,
                        semantic_decision=semantic_decision,
                        compat_decision=str(row["decision"]),
                        verification_target_type=filter_context["verificationTargetType"],
                        verification_target_id=filter_context["verificationTargetId"],
                        verification_state=filter_context["verificationState"],
                        semantic_score=float(row["score_interest"]),
                        explain_json=build_interest_filter_explain(
                            base_explain_json=make_json_safe(row["explain_json"]),
                            technical_filter_state=technical_filter_state,
                            semantic_decision=semantic_decision,
                            compat_decision=str(row["decision"]),
                            filter_scope="user_interest",
                            context=filter_context,
                        ),
                    )

                next_state = advance_processing_state(article.get("processing_state"), "matched")
                await cursor.execute(
                    """
                    update articles
                    set
                      processing_state = %s,
                      updated_at = now()
                    where doc_id = %s
                    """,
                    (next_state, article["doc_id"]),
                )
                if should_trigger_notify and not historical_backfill and not suppress_pipeline_fanout:
                    await insert_outbox_event(
                        cursor,
                        ARTICLE_INTERESTS_MATCHED_EVENT,
                        "article",
                        article["doc_id"],
                        {"docId": str(article["doc_id"]), "version": 1},
                    )
                await record_processed_event(cursor, INTEREST_MATCH_CONSUMER, event_id)

    return {
        "status": "matched",
        "docId": doc_id,
        "interestCount": len(pending_rows),
    }


async def process_notify(job: Job, _job_token: str) -> dict[str, Any]:
    event_id = str(job.data.get("eventId"))
    doc_id = str(job.data.get("docId"))

    if not event_id or event_id == "None" or not doc_id or doc_id == "None":
        raise ValueError("Notify worker expected eventId and docId.")

    sent_count = 0
    suppressed_count = 0
    llm_review_count = 0

    connection = await open_connection()
    async with connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                if await is_event_processed(cursor, NOTIFY_CONSUMER, event_id):
                    return {"status": "duplicate-event", "docId": doc_id}

                article = await fetch_article_for_update(cursor, doc_id)
                await cursor.execute(
                    """
                    select
                      interest_match_id,
                      user_id,
                      interest_id,
                      event_cluster_id,
                      score_interest,
                      score_user,
                      decision,
                      explain_json
                    from interest_match_results
                    where doc_id = %s
                    order by user_id, score_user desc, score_interest desc, created_at desc
                    """,
                    (article["doc_id"],),
                )
                match_rows = list(await cursor.fetchall())
                best_by_user: dict[str, dict[str, Any]] = {}
                for row in match_rows:
                    user_key = str(row["user_id"])
                    if user_key not in best_by_user:
                        best_by_user[user_key] = row

                for match_row in best_by_user.values():
                    user_id = uuid.UUID(str(match_row["user_id"]))
                    interest_id = uuid.UUID(str(match_row["interest_id"]))
                    cluster_id = match_row.get("event_cluster_id")
                    explain_json = coerce_json_object(match_row.get("explain_json"))
                    major_update = bool(explain_json.get("majorUpdate"))
                    if str(article.get("visibility_state") or "visible") == "blocked":
                        await insert_notification_suppression(
                            cursor,
                            user_id=user_id,
                            interest_id=interest_id,
                            notification_id=None,
                            doc_id=article["doc_id"],
                            family_id=article.get("family_id"),
                            cluster_id=cluster_id,
                            reason="article_blocked",
                        )
                        suppressed_count += 1
                        continue

                    history = await fetch_recent_notification_history(
                        cursor,
                        user_id=user_id,
                        interest_id=interest_id,
                        cluster_id=cluster_id,
                        family_id=article.get("family_id"),
                    )
                    if history and not major_update and float(match_row.get("score_interest") or 0.0) < 0.9:
                        await insert_notification_suppression(
                            cursor,
                            user_id=user_id,
                            interest_id=interest_id,
                            notification_id=None,
                            doc_id=article["doc_id"],
                            family_id=article.get("family_id"),
                            cluster_id=cluster_id,
                            reason="recent_send_history",
                        )
                        suppressed_count += 1
                        continue

                    if match_row["decision"] == "gray_zone":
                        await insert_notification_suppression(
                            cursor,
                            user_id=user_id,
                            interest_id=interest_id,
                            notification_id=None,
                            doc_id=article["doc_id"],
                            family_id=article.get("family_id"),
                            cluster_id=cluster_id,
                            reason="interest_gray_zone_llm_disabled",
                        )
                        suppressed_count += 1
                        continue

                    if match_row["decision"] != "notify":
                        continue

                    title = str(article.get("title") or "News update")
                    body = str(article.get("lead") or article.get("body") or "")[:500]
                    notification_preferences = await fetch_user_notification_preferences(
                        cursor, user_id
                    )
                    channels = await fetch_user_notification_channels(cursor, user_id)
                    for channel in channels:
                        channel_type = str(channel["channel_type"])
                        if not is_channel_enabled_by_preferences(
                            channel_type, notification_preferences
                        ):
                            await insert_notification_suppression(
                                cursor,
                                user_id=user_id,
                                interest_id=interest_id,
                                notification_id=None,
                                doc_id=article["doc_id"],
                                family_id=article.get("family_id"),
                                cluster_id=cluster_id,
                                reason=f"preference_disabled:{channel_type}",
                            )
                            suppressed_count += 1
                            continue

                        notification_id = await insert_notification_log_row(
                            cursor,
                            user_id=user_id,
                            interest_id=interest_id,
                            doc_id=article["doc_id"],
                            cluster_id=cluster_id,
                            channel_type=channel_type,
                            status="queued",
                            title=title,
                            body=body,
                            decision_reason="notify",
                            delivery_payload_json={"interestMatchId": str(match_row["interest_match_id"])},
                        )
                        attempt = dispatch_channel_message(
                            channel_type,
                            coerce_json_object(channel.get("config_json")),
                            title,
                            body,
                        )
                        await update_notification_delivery_status(
                            cursor,
                            notification_id=notification_id,
                            status=attempt.status,
                            delivery_payload_json={
                                "interestMatchId": str(match_row["interest_match_id"]),
                                "detail": attempt.detail,
                            },
                        )
                        if attempt.status == "sent":
                            sent_count += 1
                        else:
                            suppressed_count += 1

                if sent_count > 0:
                    next_state = advance_processing_state(article.get("processing_state"), "notified")
                    await cursor.execute(
                        """
                        update articles
                        set
                          processing_state = %s,
                          updated_at = now()
                        where doc_id = %s
                        """,
                        (next_state, article["doc_id"]),
                    )
                await record_processed_event(cursor, NOTIFY_CONSUMER, event_id)

    return {
        "status": "notified",
        "docId": doc_id,
        "sentCount": sent_count,
        "suppressedCount": suppressed_count,
        "llmReviewCount": llm_review_count,
    }


async def process_llm_review(job: Job, _job_token: str) -> dict[str, Any]:
    event_id = str(job.data.get("eventId"))
    doc_id = str(job.data.get("docId"))
    scope = str(job.data.get("scope") or "interest")
    target_id = str(job.data.get("targetId"))
    historical_backfill = coerce_bool(job.data.get("historicalBackfill"))
    suppress_pipeline_fanout = suppress_downstream_outbox(job)
    raw_prompt_template_id = job.data.get("promptTemplateId")
    prompt_template_id = str(raw_prompt_template_id).strip() if raw_prompt_template_id else None

    if not event_id or event_id == "None" or not doc_id or doc_id == "None" or not target_id:
        raise ValueError("LLM review worker expected eventId, docId, and targetId.")

    connection = await open_connection()
    async with connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                if await is_event_processed(cursor, LLM_REVIEW_CONSUMER, event_id):
                    return {"status": "duplicate-event", "docId": doc_id, "scope": scope}

                article = await fetch_article_for_update(cursor, doc_id)
                await cursor.execute(
                    """
                    select
                      prompt_template_id::text as prompt_template_id,
                      name,
                      template_text,
                      version
                    from llm_prompt_templates
                    where prompt_template_id = %s
                    """,
                    (prompt_template_id,),
                )
                prompt_template = await cursor.fetchone()
                if prompt_template is None:
                    prompt_template = await find_prompt_template(
                        cursor,
                        "criteria" if scope == "criterion" else "interests",
                    )

                template_text = (
                    str(prompt_template.get("template_text"))
                    if prompt_template is not None
                    else (
                        "Review the news match below and respond with JSON "
                        '{"decision":"approve|reject|uncertain","score":0.0,"reason":"..."}.\n'
                        "Title: {title}\nLead: {lead}\nBody: {body}\nContext: {context}"
                    )
                )
                review_context: dict[str, Any] = {}
                if scope == "criterion":
                    await cursor.execute(
                        """
                        select
                          cmr.criterion_match_id,
                          cmr.explain_json,
                          cmr.decision,
                          c.description as criterion_name
                        from criterion_match_results cmr
                        join criteria c on c.criterion_id = cmr.criterion_id
                        where cmr.doc_id = %s and cmr.criterion_id = %s
                        order by cmr.created_at desc
                        limit 1
                        """,
                        (article["doc_id"], target_id),
                    )
                    review_context = await cursor.fetchone() or {}
                else:
                    await cursor.execute(
                        """
                        select
                          imr.interest_match_id,
                          imr.user_id,
                          imr.explain_json,
                          imr.decision,
                          ui.description as interest_name
                        from interest_match_results imr
                        join user_interests ui on ui.interest_id = imr.interest_id
                        where imr.doc_id = %s and imr.interest_id = %s
                        order by imr.created_at desc
                        limit 1
                        """,
                        (article["doc_id"], target_id),
                    )
                    review_context = await cursor.fetchone() or {}

                if scope == "criterion":
                    llm_quota_snapshot = await get_llm_review_monthly_quota_snapshot(cursor)
                    runtime_resolution = resolve_criterion_gray_zone_runtime_resolution(
                        llm_quota_snapshot
                    )
                    if runtime_resolution is not None:
                        final_decision = str(runtime_resolution["finalDecision"])
                        llm_budget_gate_explain = build_llm_budget_gate_explain(
                            quota_snapshot=llm_quota_snapshot,
                            resolution=runtime_resolution,
                        )
                        await cursor.execute(
                            """
                            update criterion_match_results
                            set
                              decision = %s,
                              explain_json = explain_json || %s::jsonb
                            where doc_id = %s and criterion_id = %s
                        """,
                            (
                                final_decision,
                                Json(
                                    {
                                        "llmBudgetGate": llm_budget_gate_explain
                                    }
                                ),
                                article["doc_id"],
                                target_id,
                            ),
                        )
                        filter_context = await resolve_interest_filter_context(
                            cursor,
                            article=article,
                            prefer_story_cluster=False,
                        )
                        technical_filter_state, semantic_decision = resolve_criterion_filter_outcome(
                            pass_filters=True,
                            compat_decision=final_decision,
                        )
                        base_filter_explain = coerce_json_object(review_context.get("explain_json"))
                        base_filter_explain["llmBudgetGate"] = llm_budget_gate_explain
                        await upsert_interest_filter_result(
                            cursor,
                            filter_scope="system_criterion",
                            doc_id=uuid.UUID(str(article["doc_id"])),
                            canonical_document_id=filter_context["canonicalDocumentId"],
                            story_cluster_id=filter_context["storyClusterId"],
                            user_id=None,
                            criterion_id=uuid.UUID(str(target_id)),
                            interest_id=None,
                            technical_filter_state=technical_filter_state,
                            semantic_decision=semantic_decision,
                            compat_decision=final_decision,
                            verification_target_type=filter_context["verificationTargetType"],
                            verification_target_id=filter_context["verificationTargetId"],
                            verification_state=filter_context["verificationState"],
                            semantic_score=float(
                                coerce_json_object(review_context.get("explain_json")).get(
                                    "S_final"
                                )
                                or 0.0
                            ),
                            explain_json=build_interest_filter_explain(
                                base_explain_json=make_json_safe(base_filter_explain),
                                technical_filter_state=technical_filter_state,
                                semantic_decision=semantic_decision,
                                compat_decision=final_decision,
                                filter_scope="system_criterion",
                                context=filter_context,
                            ),
                        )
                        system_feed_result = await upsert_system_feed_result(cursor, article["doc_id"])
                        if (
                            should_dispatch_clustering(system_feed_result)
                            and not historical_backfill
                            and not suppress_pipeline_fanout
                        ):
                            await insert_outbox_event(
                                cursor,
                                ARTICLE_CRITERIA_MATCHED_EVENT,
                                "article",
                                article["doc_id"],
                                {"docId": str(article["doc_id"]), "version": 1},
                            )
                        await record_processed_event(cursor, LLM_REVIEW_CONSUMER, event_id)
                        return {
                            "status": "review-skipped-runtime-policy",
                            "docId": doc_id,
                            "scope": scope,
                            "decision": str(runtime_resolution["providerDecision"]),
                            "runtimePolicyReason": str(runtime_resolution["reason"]),
                        }

                prompt = render_llm_prompt_template(
                    template_text,
                    article=article,
                    review_context=review_context,
                    scope=scope,
                )
                review_result = review_with_gemini(prompt)
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
                    values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb)
                    returning review_id
                    """,
                    (
                        article["doc_id"],
                        "criterion" if scope == "criterion" else "interest",
                        target_id,
                        prompt_template["prompt_template_id"] if prompt_template is not None else None,
                        int(prompt_template["version"]) if prompt_template is not None else 1,
                        review_result.model,
                        review_result.decision,
                        review_result.score,
                        review_result.provider_latency_ms,
                        review_result.prompt_tokens,
                        review_result.completion_tokens,
                        review_result.total_tokens,
                        review_result.cost_estimate_usd,
                        Json(make_json_safe(review_result.provider_usage_json)),
                        Json(make_json_safe(review_result.response_json)),
                    ),
                )
                review_row = await cursor.fetchone()

                if scope == "criterion":
                    await persist_criterion_review_resolution(
                        cursor,
                        article=article,
                        criterion_id=target_id,
                        review_context=review_context,
                        provider_decision=review_result.decision,
                        provider_score=review_result.score,
                        review_source="fresh_llm_review",
                        review_id=str(review_row["review_id"]),
                        prompt_template_id=(
                            str(review_row.get("prompt_template_id") or "").strip() or None
                        ),
                        prompt_version=(
                            int(review_row.get("prompt_version"))
                            if review_row.get("prompt_version") is not None
                            else None
                        ),
                        refresh_selection_gate=True,
                        historical_backfill=historical_backfill,
                        suppress_pipeline_fanout=suppress_pipeline_fanout,
                    )
                else:
                    final_decision = "suppress"
                    if review_result.decision == "approve":
                        final_decision = "notify"
                    await cursor.execute(
                        """
                        update interest_match_results
                        set
                          decision = %s,
                          explain_json = explain_json || %s::jsonb
                        where doc_id = %s and interest_id = %s
                        """,
                        (
                            final_decision,
                            Json(
                                {
                                    "llmReview": {
                                        "reviewId": str(review_row["review_id"]),
                                        "decision": review_result.decision,
                                        "score": review_result.score,
                                    }
                                }
                            ),
                            article["doc_id"],
                            target_id,
                        ),
                    )
                    filter_context = await resolve_interest_filter_context(
                        cursor,
                        article=article,
                        prefer_story_cluster=True,
                    )
                    technical_filter_state, semantic_decision = resolve_user_interest_filter_outcome(
                        pass_filters=True,
                        compat_decision=final_decision,
                    )
                    base_filter_explain = coerce_json_object(review_context.get("explain_json"))
                    base_filter_explain["llmReview"] = {
                        "reviewId": str(review_row["review_id"]),
                        "decision": review_result.decision,
                        "score": review_result.score,
                    }
                    await upsert_interest_filter_result(
                        cursor,
                        filter_scope="user_interest",
                        doc_id=uuid.UUID(str(article["doc_id"])),
                        canonical_document_id=filter_context["canonicalDocumentId"],
                        story_cluster_id=filter_context["storyClusterId"],
                        user_id=uuid.UUID(str(review_context["user_id"])),
                        criterion_id=None,
                        interest_id=uuid.UUID(str(target_id)),
                        technical_filter_state=technical_filter_state,
                        semantic_decision=semantic_decision,
                        compat_decision=final_decision,
                        verification_target_type=filter_context["verificationTargetType"],
                        verification_target_id=filter_context["verificationTargetId"],
                        verification_state=filter_context["verificationState"],
                        semantic_score=float(base_filter_explain.get("S_interest") or 0.0),
                        explain_json=build_interest_filter_explain(
                            base_explain_json=make_json_safe(base_filter_explain),
                            technical_filter_state=technical_filter_state,
                            semantic_decision=semantic_decision,
                            compat_decision=final_decision,
                            filter_scope="user_interest",
                            context=filter_context,
                        ),
                    )
                    if (
                        review_result.decision == "approve"
                        and not historical_backfill
                        and not suppress_pipeline_fanout
                    ):
                        await insert_outbox_event(
                            cursor,
                            ARTICLE_INTERESTS_MATCHED_EVENT,
                            "article",
                            article["doc_id"],
                            {"docId": str(article["doc_id"]), "version": 1},
                        )

                await record_processed_event(cursor, LLM_REVIEW_CONSUMER, event_id)

    return {
        "status": "reviewed",
        "docId": doc_id,
        "scope": scope,
        "decision": review_result.decision,
    }


async def process_feedback_ingest(job: Job, _job_token: str) -> dict[str, Any]:
    event_id = str(job.data.get("eventId"))
    notification_id = str(job.data.get("notificationId"))
    doc_id = str(job.data.get("docId"))
    user_id = str(job.data.get("userId"))

    if not event_id or event_id == "None" or not notification_id or not doc_id or not user_id:
        raise ValueError("Feedback ingest worker expected notificationId, docId, and userId.")

    connection = await open_connection()
    async with connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                if await is_event_processed(cursor, FEEDBACK_INGEST_CONSUMER, event_id):
                    return {"status": "duplicate-event", "notificationId": notification_id}

                await cursor.execute(
                    """
                    select count(*)::int as helpful_count
                    from notification_feedback
                    where notification_id = %s and feedback_value = 'helpful'
                    """,
                    (notification_id,),
                )
                helpful_row = await cursor.fetchone()
                await cursor.execute(
                    """
                    update notification_log
                    set
                      delivery_payload_json = delivery_payload_json || %s::jsonb,
                      updated_at = now()
                    where notification_id = %s
                    """,
                    (
                        Json(
                            {
                                "feedback": {
                                    "helpfulCount": int(helpful_row["helpful_count"] or 0)
                                }
                            }
                        ),
                        notification_id,
                    ),
                )
                await record_processed_event(cursor, FEEDBACK_INGEST_CONSUMER, event_id)

    return {
        "status": "processed",
        "notificationId": notification_id,
        "docId": doc_id,
        "userId": user_id,
    }


async def read_reindex_job_context(
    cursor: psycopg.AsyncCursor[Any],
    reindex_job_id: str,
) -> tuple[str, dict[str, Any]]:
    await cursor.execute(
        """
        select job_kind, options_json
        from reindex_jobs
        where reindex_job_id = %s
        for update
        """,
        (reindex_job_id,),
    )
    row = await cursor.fetchone()
    if row is None:
        raise ValueError(f"Reindex job {reindex_job_id} was not found.")
    return (str(row.get("job_kind") or "rebuild"), coerce_json_object(row.get("options_json")))


async def update_reindex_job_options(
    reindex_job_id: str,
    patch: dict[str, Any],
) -> None:
    async with await open_connection() as connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                await cursor.execute(
                    """
                    update reindex_jobs
                    set
                      options_json = options_json || %s::jsonb,
                      updated_at = now()
                    where reindex_job_id = %s
                    """,
                    (Json(make_json_safe(patch)), reindex_job_id),
                )


async def count_historical_backfill_snapshot_targets(reindex_job_id: str) -> int:
    async with await open_connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(
                """
                select count(*)::int as total
                from reindex_job_targets
                where reindex_job_id = %s
                """,
                (reindex_job_id,),
            )
            row = await cursor.fetchone()
    return int(row["total"] or 0) if row else 0


async def prepare_historical_backfill_snapshot(
    *,
    reindex_job_id: str,
    doc_ids: Sequence[str] | None = None,
    system_feed_only: bool = False,
    include_enrichment: bool = False,
    force_enrichment: bool = False,
) -> int:
    existing_total = await count_historical_backfill_snapshot_targets(reindex_job_id)
    if existing_total > 0:
        return existing_total

    async with await open_connection() as connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                enrichment_clause = ""
                if include_enrichment:
                    enrichment_clause = """
                      and coalesce(articles.url, '') ~* '^https?://'
                    """
                    if not force_enrichment:
                        enrichment_clause += """
                          and coalesce(articles.enrichment_state, 'pending') in ('pending', 'failed', 'skipped')
                        """
                if doc_ids:
                    system_feed_clause = ""
                    if system_feed_only:
                        system_feed_clause = """
                          and articles.visibility_state = 'visible'
                          and (
                            exists (
                              select 1
                              from final_selection_results fsr
                              where fsr.doc_id = articles.doc_id
                                and fsr.is_selected = true
                            )
                            or (
                              not exists (
                                select 1
                                from final_selection_results fsr_missing
                                where fsr_missing.doc_id = articles.doc_id
                              )
                              and exists (
                                select 1
                                from system_feed_results sfr
                                where sfr.doc_id = articles.doc_id
                                  and coalesce(sfr.eligible_for_feed, false) = true
                              )
                            )
                          )
                        """
                    await cursor.execute(
                        f"""
                        insert into reindex_job_targets (
                          reindex_job_id,
                          target_position,
                          doc_id
                        )
                        select
                          %s,
                          row_number() over (order by articles.created_at asc, articles.doc_id asc),
                          articles.doc_id
                        from articles
                        where processing_state in ('embedded', 'clustered', 'matched', 'notified')
                          and doc_id = any(%s::uuid[])
                          {system_feed_clause}
                          {enrichment_clause}
                        on conflict do nothing
                        """,
                        (reindex_job_id, list(doc_ids)),
                    )
                else:
                    system_feed_clause = ""
                    if system_feed_only:
                        system_feed_clause = """
                          and articles.visibility_state = 'visible'
                          and (
                            exists (
                              select 1
                              from final_selection_results fsr
                              where fsr.doc_id = articles.doc_id
                                and fsr.is_selected = true
                            )
                            or (
                              not exists (
                                select 1
                                from final_selection_results fsr_missing
                                where fsr_missing.doc_id = articles.doc_id
                              )
                              and exists (
                                select 1
                                from system_feed_results sfr
                                where sfr.doc_id = articles.doc_id
                                  and coalesce(sfr.eligible_for_feed, false) = true
                              )
                            )
                          )
                        """
                    await cursor.execute(
                        f"""
                        insert into reindex_job_targets (
                          reindex_job_id,
                          target_position,
                          doc_id
                        )
                        select
                          %s,
                          row_number() over (order by articles.created_at asc, articles.doc_id asc),
                          articles.doc_id
                        from articles
                        where processing_state in ('embedded', 'clustered', 'matched', 'notified')
                          {system_feed_clause}
                          {enrichment_clause}
                        on conflict do nothing
                        """,
                        (reindex_job_id,),
                    )

    return await count_historical_backfill_snapshot_targets(reindex_job_id)


async def list_historical_backfill_snapshot_batch(
    *,
    reindex_job_id: str,
    batch_size: int,
    after_position: int,
) -> list[dict[str, Any]]:
    async with await open_connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(
                """
                select
                  target_position,
                  doc_id::text as doc_id
                from reindex_job_targets
                where reindex_job_id = %s
                  and target_position > %s
                order by target_position asc
                limit %s
                """,
                (reindex_job_id, after_position, batch_size),
            )
            rows = list(await cursor.fetchall())
    return rows


async def find_current_prompt_template_id(scope: str) -> str | None:
    prompt_scope = "criteria" if scope == "criterion" else "interests"
    async with await open_connection() as connection:
        async with connection.cursor() as cursor:
            prompt_template = await find_prompt_template(cursor, prompt_scope)
    if prompt_template is None:
        return None
    return str(prompt_template["prompt_template_id"])


async def list_gray_zone_target_ids(
    *,
    doc_id: str,
    scope: str,
) -> list[str]:
    table_name = "criterion_match_results" if scope == "criterion" else "interest_match_results"
    column_name = "criterion_id" if scope == "criterion" else "interest_id"
    async with await open_connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(
                f"""
                select {column_name}::text as target_id
                from {table_name}
                where doc_id = %s
                  and decision = 'gray_zone'
                order by created_at desc
                """,
                (doc_id,),
            )
            rows = list(await cursor.fetchall())
    return [str(row["target_id"]) for row in rows]


async def replay_gray_zone_reviews_for_doc(
    *,
    doc_id: str,
    scope: str,
) -> int:
    prompt_template_id = await find_current_prompt_template_id(scope)
    if prompt_template_id is None:
        return 0

    target_ids = await list_gray_zone_target_ids(doc_id=doc_id, scope=scope)
    replay_count = 0
    for target_id in target_ids:
        review_event_id = str(uuid.uuid4())
        await ensure_published_outbox_event(
            event_id=review_event_id,
            event_type=LLM_REVIEW_REQUESTED_EVENT,
            aggregate_type="criterion" if scope == "criterion" else "interest",
            aggregate_id=target_id,
            payload={
                "docId": doc_id,
                "scope": scope,
                "targetId": target_id,
                "promptTemplateId": prompt_template_id,
                "historicalBackfill": True,
                "version": 1,
            },
        )
        await process_llm_review(
            SimpleNamespace(
                data={
                    "eventId": review_event_id,
                    "docId": doc_id,
                    "scope": scope,
                    "targetId": target_id,
                    "promptTemplateId": prompt_template_id,
                    "historicalBackfill": True,
                }
            ),
            "",
        )
        replay_count += 1
    return replay_count


async def replay_historical_articles(
    *,
    reindex_job_id: str,
    batch_size: int,
    doc_ids: Sequence[str] | None = None,
    user_id: str | None = None,
    interest_id: str | None = None,
    system_feed_only: bool = False,
    include_enrichment: bool = False,
    force_enrichment: bool = False,
) -> dict[str, Any]:
    return await replay_historical_articles_with_snapshot(
        reindex_job_id=reindex_job_id,
        batch_size=batch_size,
        doc_ids=list(doc_ids) if doc_ids is not None else None,
        user_id=user_id,
        interest_id=interest_id,
        system_feed_only=system_feed_only,
        include_enrichment=include_enrichment,
        force_enrichment=force_enrichment,
        dependencies=HistoricalBackfillDependencies(
            prepare_target_snapshot=prepare_historical_backfill_snapshot,
            list_target_batch=list_historical_backfill_snapshot_batch,
            update_job_options=update_reindex_job_options,
            publish_outbox_event=ensure_published_outbox_event,
            process_article_extract=process_article_extract,
            process_normalize=process_normalize,
            process_dedup=process_dedup,
            process_embed=process_embed,
            process_cluster=process_cluster,
            process_match_criteria=process_match_criteria,
            process_match_interests=process_match_interests,
            is_article_eligible_for_personalization=is_article_eligible_for_personalization,
            replay_gray_zone_reviews_for_doc=replay_gray_zone_reviews_for_doc,
        ),
    )


async def read_active_selection_profile_snapshot() -> dict[str, Any]:
    async with await open_connection() as connection:
        async with connection.cursor() as cursor:
            await cursor.execute(
                """
                select
                  count(*)::int as total_profiles,
                  count(*) filter (where status = 'active')::int as active_profiles,
                  count(*) filter (
                    where profile_family = 'compatibility_interest_template'
                  )::int as compatibility_profiles,
                  count(distinct source_interest_template_id)::int
                    as templates_with_profiles,
                  coalesce(max(version), 0)::int as max_version
                from selection_profiles
                """
            )
            row = await cursor.fetchone()

    snapshot = row or {}
    return {
        "totalProfiles": int(snapshot.get("total_profiles") or 0),
        "activeProfiles": int(snapshot.get("active_profiles") or 0),
        "compatibilityProfiles": int(snapshot.get("compatibility_profiles") or 0),
        "templatesWithProfiles": int(snapshot.get("templates_with_profiles") or 0),
        "maxVersion": int(snapshot.get("max_version") or 0),
    }


def build_interest_auto_repair_job_options(
    *,
    user_id: str,
    interest_id: str,
    source_version: int,
) -> dict[str, Any]:
    return {
        "batchSize": 100,
        "retroNotifications": "skip",
        "replayExistingArticles": True,
        "systemFeedOnly": True,
        "userId": user_id,
        "interestId": interest_id,
        "sourceVersion": source_version,
        "requestSource": "interest_compile",
    }


async def queue_interest_auto_repair_job(
    *,
    user_id: str,
    interest_id: str,
    source_version: int,
) -> dict[str, Any]:
    reindex_job_id = uuid.uuid4()
    options_json = build_interest_auto_repair_job_options(
        user_id=user_id,
        interest_id=interest_id,
        source_version=source_version,
    )

    async with await open_connection() as connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                await cursor.execute(
                    """
                    insert into reindex_jobs (
                      reindex_job_id,
                      index_name,
                      job_kind,
                      options_json,
                      requested_by_user_id,
                      status
                    )
                    values (%s, %s, 'repair', %s::jsonb, %s, 'queued')
                    """,
                    (
                        reindex_job_id,
                        INTEREST_CENTROIDS_INDEX_NAME,
                        Json(make_json_safe(options_json)),
                        user_id,
                    ),
                )
                await insert_outbox_event(
                    cursor,
                    REINDEX_REQUESTED_EVENT,
                    "reindex_job",
                    reindex_job_id,
                    {
                        "reindexJobId": str(reindex_job_id),
                        "indexName": INTEREST_CENTROIDS_INDEX_NAME,
                        "jobKind": "repair",
                        "version": 1,
                    },
                )

    return {
        "status": "queued",
        "reindexJobId": str(reindex_job_id),
        "jobKind": "repair",
        "options": options_json,
    }


async def process_reindex(job: Job, _job_token: str) -> dict[str, Any]:
    event_id = str(job.data.get("eventId"))
    reindex_job_id = str(job.data.get("reindexJobId"))
    index_name = str(job.data.get("indexName") or INTEREST_CENTROIDS_INDEX_NAME)

    if not event_id or event_id == "None" or not reindex_job_id:
        raise ValueError("Reindex worker expected eventId and reindexJobId.")

    connection = await open_connection()
    job_kind = "rebuild"
    job_options: dict[str, Any] = {}
    async with connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                if await is_event_processed(cursor, REINDEX_CONSUMER, event_id):
                    return {"status": "duplicate-event", "reindexJobId": reindex_job_id}

                job_kind, job_options = await read_reindex_job_context(cursor, reindex_job_id)

                await cursor.execute(
                    """
                    update reindex_jobs
                    set status = 'running', started_at = now(), updated_at = now()
                    where reindex_job_id = %s
                    """,
                    (reindex_job_id,),
                )

    result: dict[str, Any]
    try:
        result = {"indexName": index_name, "jobKind": job_kind}
        if job_kind in {"rebuild", "backfill"}:
            if index_name == INTEREST_CENTROIDS_INDEX_NAME:
                result["rebuild"] = await INTEREST_INDEXER.rebuild_interest_centroids()
            elif index_name == EVENT_CLUSTER_CENTROIDS_INDEX_NAME:
                result["rebuild"] = await INTEREST_INDEXER.rebuild_event_cluster_centroids()
            else:
                result["rebuild"] = {
                    "indexName": index_name,
                    "status": "skipped",
                    "reason": "unsupported_index",
                }
        elif job_kind == "repair":
            result["rebuild"] = {
                "indexName": index_name,
                "status": "skipped",
                "reason": "repair_job_skips_rebuild",
            }
        else:
            raise ValueError(f"Unsupported reindex job kind: {job_kind}")

        if job_kind in {"backfill", "repair"}:
            batch_size = min(max(coerce_positive_int(job_options.get("batchSize"), 100), 1), 500)
            target_doc_ids = coerce_text_list(job_options.get("docIds"))
            target_user_id = coerce_optional_string(job_options.get("userId"))
            target_interest_id = coerce_optional_string(job_options.get("interestId"))
            system_feed_only = coerce_bool(job_options.get("systemFeedOnly"))
            include_enrichment = coerce_bool(job_options.get("includeEnrichment"))
            force_enrichment = coerce_bool(job_options.get("forceEnrichment"))
            selection_profile_snapshot = await read_active_selection_profile_snapshot()
            result["backfill"] = await replay_historical_articles(
                reindex_job_id=reindex_job_id,
                batch_size=batch_size,
                doc_ids=target_doc_ids or None,
                user_id=target_user_id,
                interest_id=target_interest_id,
                system_feed_only=system_feed_only,
                include_enrichment=include_enrichment,
                force_enrichment=force_enrichment,
            )
            if isinstance(result["backfill"], dict):
                result["backfill"]["selectionProfileSnapshot"] = (
                    selection_profile_snapshot
                )
    except Exception as error:
        async with await open_connection() as connection:
            async with connection.transaction():
                async with connection.cursor() as cursor:
                    await cursor.execute(
                        """
                        update reindex_jobs
                        set
                          status = 'failed',
                          finished_at = now(),
                          error_text = %s,
                          updated_at = now()
                        where reindex_job_id = %s
                        """,
                        (str(error), reindex_job_id),
                    )
                    await record_processed_event(cursor, REINDEX_CONSUMER, event_id)
        return {
            "status": "failed",
            "reindexJobId": reindex_job_id,
            "error": str(error),
        }

    async with await open_connection() as connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                await cursor.execute(
                    """
                    update reindex_jobs
                    set
                      status = 'completed',
                      finished_at = now(),
                      error_text = null,
                      updated_at = now(),
                      options_json = options_json || %s::jsonb
                    where reindex_job_id = %s
                    """,
                    (Json(make_json_safe(result)), reindex_job_id),
                )
                await record_processed_event(cursor, REINDEX_CONSUMER, event_id)

    return {
        "status": "completed",
        "reindexJobId": reindex_job_id,
        "result": result,
    }


async def process_interest_compile(job: Job, _job_token: str) -> dict[str, Any]:
    event_id = str(job.data.get("eventId"))
    interest_id = str(job.data.get("interestId"))
    source_version = coerce_positive_int(job.data.get("version"), 1)
    skip_auto_repair = coerce_bool(job.data.get("skipAutoRepair"))
    interest_user_id: str | None = None

    if not event_id or event_id == "None" or not interest_id or interest_id == "None":
        raise ValueError("Interest compile worker expected eventId and interestId.")

    connection = await open_connection()
    async with connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                if await is_event_processed(cursor, INTEREST_COMPILE_CONSUMER, event_id):
                    return {"status": "duplicate-event", "interestId": interest_id}

                interest = await fetch_interest_for_update(cursor, interest_id)
                interest_user_id = str(interest.get("user_id"))
                current_version = coerce_positive_int(interest.get("version"), 1)
                if current_version != source_version:
                    await record_processed_event(cursor, INTEREST_COMPILE_CONSUMER, event_id)
                    return {
                        "status": "stale-version",
                        "interestId": interest_id,
                        "expectedVersion": current_version,
                        "eventVersion": source_version,
                    }

                try:
                    compiled = INTEREST_COMPILER.compile(interest, EMBEDDING_PROVIDER)
                    target_features = FEATURE_EXTRACTOR.extract(
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
                        embedding_id = await upsert_embedding_registry(
                            cursor,
                            entity_type="interest",
                            entity_id=interest["interest_id"],
                            vector_type=vector_type,
                            model_key=compiled.model_key,
                            vector_version=source_version,
                            vector=vector,
                            content_hash=compute_content_hash(
                                {
                                    "prototype": prototype_text,
                                    "vectorType": vector_type,
                                    "version": source_version,
                                }
                            ),
                        )
                        positive_embedding_ids.append(embedding_id)
                        await upsert_interest_vector_registry(
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
                        embedding_id = await upsert_embedding_registry(
                            cursor,
                            entity_type="interest",
                            entity_id=interest["interest_id"],
                            vector_type=vector_type,
                            model_key=compiled.model_key,
                            vector_version=source_version,
                            vector=vector,
                            content_hash=compute_content_hash(
                                {
                                    "prototype": prototype_text,
                                    "vectorType": vector_type,
                                    "version": source_version,
                                }
                            ),
                        )
                        negative_embedding_ids.append(embedding_id)
                        await upsert_interest_vector_registry(
                            cursor,
                            interest_id=interest["interest_id"],
                            vector_type=vector_type,
                            embedding_id=embedding_id,
                            vector_version=source_version,
                        )

                    hnsw_label = await resolve_interest_hnsw_label(
                        cursor,
                        interest_id=interest["interest_id"],
                        model_key=compiled.model_key,
                        dimensions=compiled.dimensions,
                    )
                    centroid_embedding_id = await upsert_embedding_registry(
                        cursor,
                        entity_type="interest",
                        entity_id=interest["interest_id"],
                        vector_type="centroid",
                        model_key=compiled.model_key,
                        vector_version=source_version,
                        vector=compiled.centroid_embedding,
                        content_hash=compute_content_hash(
                            {
                                "positivePrototypes": compiled.positive_prototypes,
                                "vectorType": "centroid",
                                "version": source_version,
                            }
                        ),
                    )
                    await upsert_interest_vector_registry(
                        cursor,
                        interest_id=interest["interest_id"],
                        vector_type="centroid",
                        embedding_id=centroid_embedding_id,
                        vector_version=source_version,
                        hnsw_index_name=INTEREST_CENTROIDS_INDEX_NAME,
                        hnsw_label=hnsw_label,
                    )
                    await mark_interest_hnsw_dirty(
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
                    await upsert_interest_compiled_row(
                        cursor,
                        interest_id=interest["interest_id"],
                        source_version=source_version,
                        compile_status="compiled",
                        source_snapshot_json=compiled.source_snapshot,
                        compiled_json=compiled_payload,
                        centroid_embedding_id=centroid_embedding_id,
                        error_text=None,
                    )
                    await update_interest_compile_status(
                        cursor,
                        interest_id=interest["interest_id"],
                        compiled=True,
                        compile_status="compiled",
                    )
                except Exception as error:
                    await upsert_interest_compiled_row(
                        cursor,
                        interest_id=interest["interest_id"],
                        source_version=source_version,
                        compile_status="failed",
                        source_snapshot_json={"interestId": str(interest["interest_id"])},
                        compiled_json={},
                        centroid_embedding_id=None,
                        error_text=str(error),
                    )
                    await update_interest_compile_status(
                        cursor,
                        interest_id=interest["interest_id"],
                        compiled=False,
                        compile_status="failed",
                    )
                    await record_processed_event(cursor, INTEREST_COMPILE_CONSUMER, event_id)
                    return {
                        "status": "failed",
                        "interestId": interest_id,
                        "error": str(error),
                    }

                await record_processed_event(cursor, INTEREST_COMPILE_CONSUMER, event_id)

    auto_repair_result: dict[str, Any] | None = None
    if skip_auto_repair:
        auto_repair_result = {
            "status": "skipped",
            "reason": "skipAutoRepair",
        }
    elif interest_user_id:
        try:
            auto_repair_result = await queue_interest_auto_repair_job(
                user_id=interest_user_id,
                interest_id=interest_id,
                source_version=source_version,
            )
        except Exception as error:  # pragma: no cover - DB/env dependent
            LOGGER.error("Interest auto-repair queueing failed for %s: %s", interest_id, error)
            auto_repair_result = {
                "status": "failed",
                "error": str(error),
            }

    try:
        rebuild_result = await INTEREST_INDEXER.rebuild_interest_centroids()
        return {
            "status": "compiled",
            "interestId": interest_id,
            "version": source_version,
            "rebuild": rebuild_result,
            "autoRepair": auto_repair_result,
        }
    except Exception as error:  # pragma: no cover - env and filesystem dependent
        LOGGER.error("Interest centroid rebuild failed after compile: %s", error)
        return {
            "status": "compiled-hnsw-dirty",
            "interestId": interest_id,
            "version": source_version,
            "error": str(error),
            "autoRepair": auto_repair_result,
        }


async def process_criterion_compile(job: Job, _job_token: str) -> dict[str, Any]:
    event_id = str(job.data.get("eventId"))
    criterion_id = str(job.data.get("criterionId"))
    source_version = coerce_positive_int(job.data.get("version"), 1)

    if not event_id or event_id == "None" or not criterion_id or criterion_id == "None":
        raise ValueError("Criterion compile worker expected eventId and criterionId.")

    connection = await open_connection()
    async with connection:
        async with connection.transaction():
            async with connection.cursor() as cursor:
                if await is_event_processed(cursor, CRITERION_COMPILE_CONSUMER, event_id):
                    return {"status": "duplicate-event", "criterionId": criterion_id}

                criterion = await fetch_criterion_for_update(cursor, criterion_id)
                current_version = coerce_positive_int(criterion.get("version"), 1)
                if current_version != source_version:
                    await record_processed_event(cursor, CRITERION_COMPILE_CONSUMER, event_id)
                    return {
                        "status": "stale-version",
                        "criterionId": criterion_id,
                        "expectedVersion": current_version,
                        "eventVersion": source_version,
                    }

                try:
                    compiled = CRITERION_COMPILER.compile(criterion, EMBEDDING_PROVIDER)
                    target_features = FEATURE_EXTRACTOR.extract(
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
                        embedding_id = await upsert_embedding_registry(
                            cursor,
                            entity_type="criterion",
                            entity_id=criterion["criterion_id"],
                            vector_type=vector_type,
                            model_key=compiled.model_key,
                            vector_version=source_version,
                            vector=vector,
                            content_hash=compute_content_hash(
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
                        embedding_id = await upsert_embedding_registry(
                            cursor,
                            entity_type="criterion",
                            entity_id=criterion["criterion_id"],
                            vector_type=vector_type,
                            model_key=compiled.model_key,
                            vector_version=source_version,
                            vector=vector,
                            content_hash=compute_content_hash(
                                {
                                    "prototype": prototype_text,
                                    "vectorType": vector_type,
                                    "version": source_version,
                                }
                            ),
                        )
                        negative_embedding_ids.append(embedding_id)

                    centroid_embedding_id = await upsert_embedding_registry(
                        cursor,
                        entity_type="criterion",
                        entity_id=criterion["criterion_id"],
                        vector_type="centroid",
                        model_key=compiled.model_key,
                        vector_version=source_version,
                        vector=compiled.centroid_embedding,
                        content_hash=compute_content_hash(
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
                    await upsert_criterion_compiled_row(
                        cursor,
                        criterion_id=criterion["criterion_id"],
                        source_version=source_version,
                        compile_status="compiled",
                        source_snapshot_json=compiled.source_snapshot,
                        compiled_json=compiled_payload,
                        centroid_embedding_id=centroid_embedding_id,
                        error_text=None,
                    )
                    await update_criterion_compile_status(
                        cursor,
                        criterion_id=criterion["criterion_id"],
                        compiled=True,
                        compile_status="compiled",
                    )
                except Exception as error:
                    await upsert_criterion_compiled_row(
                        cursor,
                        criterion_id=criterion["criterion_id"],
                        source_version=source_version,
                        compile_status="failed",
                        source_snapshot_json={"criterionId": str(criterion["criterion_id"])},
                        compiled_json={},
                        centroid_embedding_id=None,
                        error_text=str(error),
                    )
                    await update_criterion_compile_status(
                        cursor,
                        criterion_id=criterion["criterion_id"],
                        compiled=False,
                        compile_status="failed",
                    )
                    await record_processed_event(cursor, CRITERION_COMPILE_CONSUMER, event_id)
                    return {
                        "status": "failed",
                        "criterionId": criterion_id,
                        "error": str(error),
                    }

                await record_processed_event(cursor, CRITERION_COMPILE_CONSUMER, event_id)

    return {
        "status": "compiled",
        "criterionId": criterion_id,
        "version": source_version,
    }


def on_worker_error(label: str):
    def handler(*args: Any) -> None:
        LOGGER.error("%s worker event: %s", label, args)

    return handler


async def run_user_digest_scheduler_until_stopped(stop_event: asyncio.Event) -> None:
    poll_interval = user_digest_poll_interval_seconds()
    while not stop_event.is_set():
        try:
            await process_queued_manual_digests()
            await process_due_scheduled_digests()
        except Exception as error:  # pragma: no cover - runtime/env dependent
            LOGGER.error("User digest scheduler poll failed: %s", error)

        try:
            await asyncio.wait_for(stop_event.wait(), timeout=poll_interval)
        except TimeoutError:
            continue


async def run_workers() -> None:
    enable_legacy_queue_consumers = legacy_queue_consumers_enabled()
    enable_sequence_runner = sequence_runner_enabled()
    enable_sequence_cron_scheduler = sequence_cron_scheduler_enabled()
    enable_user_digest_scheduler = user_digest_scheduler_enabled()
    legacy_workers: list[tuple[str, str, Worker]] = []
    if enable_legacy_queue_consumers:
        legacy_workers = [
            (
                "normalize",
                NORMALIZE_QUEUE,
                Worker(
                    NORMALIZE_QUEUE,
                    process_normalize,
                    {
                        "connection": build_redis_connection_options(),
                        "concurrency": 4,
                    },
                ),
            ),
            (
                "dedup",
                DEDUP_QUEUE,
                Worker(
                    DEDUP_QUEUE,
                    process_dedup,
                    {
                        "connection": build_redis_connection_options(),
                        "concurrency": 4,
                    },
                ),
            ),
            (
                "embed",
                EMBED_QUEUE,
                Worker(
                    EMBED_QUEUE,
                    process_embed,
                    {
                        "connection": build_redis_connection_options(),
                        "concurrency": 2,
                    },
                ),
            ),
            (
                "cluster",
                CLUSTER_QUEUE,
                Worker(
                    CLUSTER_QUEUE,
                    process_cluster,
                    {
                        "connection": build_redis_connection_options(),
                        "concurrency": 2,
                    },
                ),
            ),
            (
                "match.criteria",
                CRITERIA_MATCH_QUEUE,
                Worker(
                    CRITERIA_MATCH_QUEUE,
                    process_match_criteria,
                    {
                        "connection": build_redis_connection_options(),
                        "concurrency": 2,
                    },
                ),
            ),
            (
                "match.interests",
                INTEREST_MATCH_QUEUE,
                Worker(
                    INTEREST_MATCH_QUEUE,
                    process_match_interests,
                    {
                        "connection": build_redis_connection_options(),
                        "concurrency": 2,
                    },
                ),
            ),
            (
                "notify",
                NOTIFY_QUEUE,
                Worker(
                    NOTIFY_QUEUE,
                    process_notify,
                    {
                        "connection": build_redis_connection_options(),
                        "concurrency": 2,
                    },
                ),
            ),
            (
                "llm.review",
                LLM_REVIEW_QUEUE,
                Worker(
                    LLM_REVIEW_QUEUE,
                    process_llm_review,
                    {
                        "connection": build_redis_connection_options(),
                        "concurrency": 1,
                    },
                ),
            ),
            (
                "feedback.ingest",
                FEEDBACK_INGEST_QUEUE,
                Worker(
                    FEEDBACK_INGEST_QUEUE,
                    process_feedback_ingest,
                    {
                        "connection": build_redis_connection_options(),
                        "concurrency": 2,
                    },
                ),
            ),
            (
                "reindex",
                REINDEX_QUEUE,
                Worker(
                    REINDEX_QUEUE,
                    process_reindex,
                    {
                        "connection": build_redis_connection_options(),
                        "concurrency": 1,
                    },
                ),
            ),
            (
                "interest.compile",
                INTEREST_COMPILE_QUEUE,
                Worker(
                    INTEREST_COMPILE_QUEUE,
                    process_interest_compile,
                    {
                        "connection": build_redis_connection_options(),
                        "concurrency": 2,
                    },
                ),
            ),
            (
                "criterion.compile",
                CRITERION_COMPILE_QUEUE,
                Worker(
                    CRITERION_COMPILE_QUEUE,
                    process_criterion_compile,
                    {
                        "connection": build_redis_connection_options(),
                        "concurrency": 2,
                    },
                ),
            ),
        ]
    sequence_worker: Worker | None = None
    if enable_sequence_runner:
        sequence_repository = PostgresSequenceRepository()
        sequence_job_processor = SequenceRunJobProcessor(repository=sequence_repository)

        async def process_sequence_queue_job(job: Job, _job_token: str) -> dict[str, Any]:
            payload = job.data if isinstance(job.data, Mapping) else {}
            return await sequence_job_processor.handle_payload(payload)

        sequence_worker = Worker(
            SEQUENCE_QUEUE,
            process_sequence_queue_job,
            {
                "connection": build_redis_connection_options(),
                "concurrency": sequence_runner_concurrency(),
            },
        )

    for label, _queue_name, worker in legacy_workers:
        worker.on("failed", on_worker_error(label))
    if sequence_worker is not None:
        sequence_worker.on("failed", on_worker_error("sequence"))

    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()

    for signame in ("SIGINT", "SIGTERM"):
        signum = getattr(signal, signame)
        loop.add_signal_handler(signum, stop_event.set)

    sequence_scheduler_task: asyncio.Task[None] | None = None
    if enable_sequence_cron_scheduler:
        sequence_repository = PostgresSequenceRepository()
        sequence_scheduler = SequenceCronScheduler(
            repository=sequence_repository,
            enqueue_run=enqueue_sequence_run_job_async,
            poll_interval_seconds=sequence_cron_poll_interval_seconds(),
        )
        sequence_scheduler_task = asyncio.create_task(
            sequence_scheduler.run_until_stopped(stop_event)
        )
    user_digest_scheduler_task: asyncio.Task[None] | None = None
    if enable_user_digest_scheduler:
        user_digest_scheduler_task = asyncio.create_task(
            run_user_digest_scheduler_until_stopped(stop_event)
        )

    consumed_queues = [queue_name for _label, queue_name, _worker in legacy_workers]
    if sequence_worker is not None:
        consumed_queues.append(SEQUENCE_QUEUE)

    LOGGER.info(
        "Workers booted. Consuming %s.",
        ", ".join(consumed_queues) if consumed_queues else "<none>",
    )
    if enable_sequence_cron_scheduler:
        LOGGER.info(
            "Sequence cron scheduler enabled with poll interval %.1fs.",
            sequence_cron_poll_interval_seconds(),
        )
    if enable_user_digest_scheduler:
        LOGGER.info(
            "User digest scheduler enabled with poll interval %.1fs.",
            user_digest_poll_interval_seconds(),
        )
    if enable_legacy_queue_consumers:
        LOGGER.warning("Legacy queue consumers are enabled alongside sequence runtime.")
    await stop_event.wait()
    LOGGER.info("Worker shutdown requested. Closing BullMQ consumers.")
    if sequence_scheduler_task is not None:
        await sequence_scheduler_task
    if user_digest_scheduler_task is not None:
        await user_digest_scheduler_task
    for _label, _queue_name, worker in legacy_workers:
        await worker.close()
    if sequence_worker is not None:
        await sequence_worker.close()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    check_database()
    check_redis()
    if discovery_enabled():
        configure_discovery_runtime(build_live_discovery_runtime())
        LOGGER.info("Discovery runtime configured with live adapters.")
    else:
        LOGGER.info("Discovery runtime remains disabled; default unavailable adapters stay active.")
    asyncio.run(run_workers())


if __name__ == "__main__":
    main()
