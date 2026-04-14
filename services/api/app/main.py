from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any, Literal, Mapping
from urllib.parse import urlparse

import psycopg
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from psycopg.rows import dict_row

from services.workers.app.discovery_orchestrator import (
    DISCOVERY_ORCHESTRATOR_SEQUENCE_ID,
    DiscoveryCoordinatorRepository,
    acquire_recall_missions,
    compile_interest_graph_for_mission,
    coerce_discovery_cost_usd,
    discovery_cost_usd_to_cents,
    discovery_month_start_utc,
    load_discovery_settings,
    re_evaluate_sources,
)
from services.workers.app.source_scoring import canonical_domain
from services.workers.app.task_engine.adapters.source_registrar import (
    PostgresSourceRegistrarAdapter,
)
from services.workers.app.task_engine import (
    enqueue_sequence_run_job as dispatch_sequence_run_job,
    parse_cron_expression,
    SequenceQueueDispatchError,
    TASK_REGISTRY,
)
from services.workers.app.task_engine.context import RESERVED_CONTEXT_KEYS


SEQUENCE_DEFINITION_STATUSES = {"draft", "active", "archived"}
SEQUENCE_RUN_CANCELLABLE_STATUSES = {"pending"}
DISCOVERY_MISSION_STATUSES = {"planned", "active", "completed", "paused", "failed", "archived"}
DISCOVERY_RECALL_MISSION_STATUSES = {"planned", "active", "completed", "paused", "failed"}
DISCOVERY_RECALL_MISSION_KINDS = {"manual", "domain_seed", "query_seed"}
DISCOVERY_CLASS_STATUSES = {"draft", "active", "archived"}
DISCOVERY_GRAPH_STATUSES = {"pending", "compiled", "failed"}
DISCOVERY_CANDIDATE_STATUSES = {"pending", "approved", "rejected", "auto_approved", "duplicate"}
DISCOVERY_RECALL_CANDIDATE_STATUSES = {"pending", "shortlisted", "rejected", "duplicate"}
DISCOVERY_HYPOTHESIS_STATUSES = {"pending", "running", "completed", "failed", "skipped"}
DISCOVERY_PROVIDER_TYPES = {"rss", "website", "api", "email_imap", "youtube"}
CONTENT_ITEM_ORIGINS = {"editorial", "resource"}
WEB_RESOURCE_EXTRACTION_STATES = {"pending", "enriched", "skipped", "failed"}
WEB_CONTENT_LIST_SORTS = {"latest", "oldest", "title_asc", "title_desc"}
WEB_RESOURCE_KINDS = {
    "editorial",
    "listing",
    "entity",
    "document",
    "data_file",
    "api_payload",
    "unknown",
}
WEB_RESOURCE_PROJECTION_FILTERS = {"all", "projected", "resource_only"}
_ZERO_USD = Decimal("0")
_USD_TO_CENTS = Decimal("100")


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


def env_flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def coerce_llm_review_cost_usd(value: Any) -> Decimal:
    if value is None:
        return _ZERO_USD
    if isinstance(value, Decimal):
        return value if value >= _ZERO_USD else _ZERO_USD
    try:
        parsed = Decimal(str(value).strip())
    except (InvalidOperation, AttributeError):
        return _ZERO_USD
    return parsed if parsed >= _ZERO_USD else _ZERO_USD


def llm_review_cost_usd_to_cents(value: Any) -> int:
    normalized = coerce_llm_review_cost_usd(value)
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


def query_all(sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    with psycopg.connect(build_database_url(), row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(sql, params)
            return [dict(row) for row in cursor.fetchall()]


def query_one(sql: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
    rows = query_all(sql, params)
    return rows[0] if rows else None


def normalize_system_interest_selection_profile_payload(
    template: Mapping[str, Any],
) -> dict[str, Any]:
    normalized = dict(template)
    family = str(template.get("selection_profile_family") or "").strip()
    raw_policy = template.get("selection_profile_policy_json")
    policy = raw_policy if isinstance(raw_policy, Mapping) else {}
    normalized_policy = dict(policy)

    if family == "compatibility_interest_template":
        llm_review_mode = str(normalized_policy.get("llmReviewMode") or "").strip()
        if not llm_review_mode or llm_review_mode == "optional_high_value_only":
            normalized_policy["llmReviewMode"] = "always"

    raw_definition = template.get("selection_profile_definition_json")
    definition_json = raw_definition if isinstance(raw_definition, Mapping) else {}
    raw_candidate_signals = (
        definition_json.get("candidateSignals")
        if isinstance(definition_json.get("candidateSignals"), Mapping)
        else {}
    )
    positive_groups = raw_candidate_signals.get("positiveGroups")
    negative_groups = raw_candidate_signals.get("negativeGroups")
    positive_group_count = len(positive_groups) if isinstance(positive_groups, list) else 0
    negative_group_count = len(negative_groups) if isinstance(negative_groups, list) else 0

    normalized["selection_profile_policy_json"] = normalized_policy
    normalized["selection_profile_definition_json"] = definition_json
    normalized["selection_profile_candidate_signal_summary"] = {
        "source": (
            "selection_profile_definition"
            if positive_group_count > 0 or negative_group_count > 0
            else "generic_fallback"
        ),
        "positiveGroupCount": positive_group_count,
        "negativeGroupCount": negative_group_count,
    }
    return normalized


def infer_feed_ingress_adapter_strategy(fetch_url: str | None) -> str:
    if not fetch_url:
        return "generic"

    try:
        parsed = urlparse(fetch_url)
    except ValueError:
        return "generic"

    hostname = (parsed.hostname or "").lower()
    pathname = (parsed.path or "").lower()

    if hostname.endswith("reddit.com") and "search.rss" in pathname:
        return "reddit_search_rss"
    if hostname == "hnrss.org":
        return "hn_comments_feed"
    if hostname == "news.google.com" and pathname.startswith("/rss/"):
        return "google_news_rss"
    return "generic"


def default_max_entry_age_hours_for_adapter(strategy: str) -> int | None:
    if strategy in {"reddit_search_rss", "hn_comments_feed", "google_news_rss"}:
        return 168
    return None


def resolve_feed_ingress_adapter_strategy(fetch_url: str | None, config_json: Any) -> str:
    explicit_strategy = None
    if isinstance(config_json, dict):
        candidate = config_json.get("adapterStrategy")
        if isinstance(candidate, str) and candidate.strip():
            explicit_strategy = candidate.strip()

    return explicit_strategy or infer_feed_ingress_adapter_strategy(fetch_url)


def resolve_feed_ingress_max_entry_age_hours(fetch_url: str | None, config_json: Any) -> int | None:
    if isinstance(config_json, dict):
        candidate = config_json.get("maxEntryAgeHours")
        if isinstance(candidate, int) and candidate > 0:
            return candidate

    return default_max_entry_age_hours_for_adapter(
        resolve_feed_ingress_adapter_strategy(fetch_url, config_json)
    )


def with_resolved_channel_adapter_fields(channel: dict[str, Any]) -> dict[str, Any]:
    channel["resolved_adapter_strategy"] = resolve_feed_ingress_adapter_strategy(
        str(channel.get("fetch_url") or ""),
        channel.get("config_json"),
    )
    channel["resolved_max_entry_age_hours"] = resolve_feed_ingress_max_entry_age_hours(
        str(channel.get("fetch_url") or ""),
        channel.get("config_json"),
    )
    return channel


def check_database() -> None:
    with psycopg.connect(build_database_url()) as connection:
        with connection.cursor() as cursor:
            cursor.execute("select 1")


def processed_article_clause(alias: str = "a") -> str:
    return (
        "("
        f"{alias}.processing_state in ('matched', 'notified')"
        f" or exists ("
        f"select 1 from final_selection_results fsr_processed "
        f"where fsr_processed.doc_id = {alias}.doc_id "
        "and fsr_processed.final_decision in ('selected', 'rejected', 'gray_zone')"
        ")"
        f" or exists ("
        f"select 1 from system_feed_results sfr_processed "
        f"where sfr_processed.doc_id = {alias}.doc_id "
        "and sfr_processed.decision in ('pass_through', 'eligible', 'filtered_out')"
        ")"
        ")"
    )


def final_selection_join_clause(
    article_alias: str = "a",
    final_alias: str = "fsr",
) -> str:
    return f"left join final_selection_results {final_alias} on {final_alias}.doc_id = {article_alias}.doc_id"


def system_feed_join_clause(article_alias: str = "a", system_alias: str = "sfr") -> str:
    return f"left join system_feed_results {system_alias} on {system_alias}.doc_id = {article_alias}.doc_id"


def article_observation_join_clause(
    article_alias: str = "a",
    observation_alias: str = "obs",
) -> str:
    return (
        f"left join document_observations {observation_alias} "
        f"on {observation_alias}.origin_type = 'article' "
        f"and {observation_alias}.origin_id = {article_alias}.doc_id"
    )


def effective_system_selected_expr(
    final_alias: str = "fsr",
    system_alias: str = "sfr",
) -> str:
    return f"""
      case
        when {final_alias}.doc_id is not null then coalesce({final_alias}.is_selected, false)
        else coalesce({system_alias}.eligible_for_feed, false)
      end
    """


def effective_system_selection_decision_expr(
    final_alias: str = "fsr",
    system_alias: str = "sfr",
) -> str:
    return f"""
      case
        when {final_alias}.doc_id is not null and {final_alias}.final_decision = 'selected' then 'selected'
        when {final_alias}.doc_id is not null and {final_alias}.final_decision = 'gray_zone' then 'gray_zone'
        when {final_alias}.doc_id is not null and {final_alias}.final_decision = 'rejected' then 'rejected'
        when coalesce({system_alias}.eligible_for_feed, false) then 'selected'
        when {system_alias}.decision = 'pending_llm' then 'pending_ai_review'
        when {system_alias}.decision in ('eligible', 'filtered_out', 'pass_through') then 'filtered_out'
        else 'unknown'
      end
    """


def canonical_article_family_expr(article_alias: str = "a") -> str:
    return f"coalesce({article_alias}.canonical_doc_id, {article_alias}.doc_id)"


def canonical_article_family_order_clause(article_alias: str = "a") -> str:
    family_expr = canonical_article_family_expr(article_alias)
    return (
        f"case when {article_alias}.doc_id = {family_expr} then 0 else 1 end, "
        f"{article_alias}.published_at desc nulls last, "
        f"{article_alias}.ingested_at desc, "
        f"{article_alias}.doc_id"
    )


def feed_eligible_article_clause(
    article_alias: str = "a",
    final_alias: str = "fsr",
    system_alias: str = "sfr",
) -> str:
    return (
        f"{article_alias}.visibility_state = 'visible' and "
        f"{effective_system_selected_expr(final_alias, system_alias)} = true"
    )


def build_content_item_id(origin_type: str, origin_id: str) -> str:
    return f"{origin_type}:{origin_id}"


def parse_content_item_id(content_item_id: str) -> tuple[str, str]:
    origin_type, separator, origin_id = str(content_item_id or "").partition(":")
    if separator != ":" or origin_type not in CONTENT_ITEM_ORIGINS or not origin_id:
        raise HTTPException(status_code=404, detail="Content item not found.")
    return origin_type, origin_id


def system_interest_kind_enabled_clause(kind_expr: str) -> str:
    return f"""
      exists (
        select 1
        from interest_templates it
        where it.is_active = true
          and (
            jsonb_array_length(
              case
                when jsonb_typeof(coalesce(it.allowed_content_kinds, '[]'::jsonb)) = 'array'
                then coalesce(it.allowed_content_kinds, '[]'::jsonb)
                else '[]'::jsonb
              end
            ) = 0
            or exists (
              select 1
              from jsonb_array_elements_text(
                case
                  when jsonb_typeof(coalesce(it.allowed_content_kinds, '[]'::jsonb)) = 'array'
                  then coalesce(it.allowed_content_kinds, '[]'::jsonb)
                  else '[]'::jsonb
                end
              ) allowed(kind)
              where allowed.kind = {kind_expr}
            )
          )
      )
    """


def primary_media_join_clause(
    article_alias: str = "a",
    media_alias: str = "pma",
) -> str:
    return f"left join article_media_assets {media_alias} on {media_alias}.asset_id = {article_alias}.primary_media_asset_id"


def article_preview_projection(
    article_alias: str = "a",
    channel_alias: str = "sc",
    media_alias: str = "pma",
) -> str:
    return f"""
          {article_alias}.has_media,
          {article_alias}.enrichment_state,
          coalesce({article_alias}.extracted_source_name, {channel_alias}.name) as source_name,
          {article_alias}.extracted_author as author_name,
          {article_alias}.extracted_ttr_seconds as read_time_seconds,
          {media_alias}.asset_id::text as primary_media_asset_id,
          {media_alias}.media_kind as primary_media_kind,
          {media_alias}.storage_kind as primary_media_storage_kind,
          coalesce({media_alias}.thumbnail_url, {media_alias}.source_url) as primary_media_url,
          {media_alias}.thumbnail_url as primary_media_thumbnail_url,
          {media_alias}.source_url as primary_media_source_url,
          {media_alias}.title as primary_media_title,
          {media_alias}.alt_text as primary_media_alt_text
    """


def build_paginated_response(
    items: list[dict[str, Any]], page: int, page_size: int, total: int
) -> dict[str, Any]:
    total_pages = (total + page_size - 1) // page_size if total else 0
    return {
        "items": items,
        "page": page,
        "pageSize": page_size,
        "total": total,
        "totalPages": total_pages,
        "hasNext": page < total_pages,
        "hasPrev": page > 1,
    }


def resolve_pagination(
    page: int | None, page_size: int | None, default_page_size: int
) -> tuple[bool, int, int, int]:
    paginate = page is not None or page_size is not None
    resolved_page = page if page is not None else 1
    resolved_page_size = page_size if page_size is not None else default_page_size
    offset = (resolved_page - 1) * resolved_page_size
    return paginate, resolved_page, resolved_page_size, offset


def query_count(sql: str, params: tuple[Any, ...] = ()) -> int:
    row = query_one(sql, params)
    return int(row["total"]) if row and row.get("total") is not None else 0


def normalize_web_content_list_sort(value: str | None) -> str:
    if not isinstance(value, str):
        return "latest"
    normalized = str(value or "").strip().lower()
    if normalized in WEB_CONTENT_LIST_SORTS:
        return normalized
    return "latest"


def normalize_web_content_search_query(value: str | None) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def build_web_content_search_pattern(query: str) -> str:
    escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def build_web_content_search_clause(
    query: str | None,
    *,
    alias: str,
) -> tuple[str, tuple[Any, ...]]:
    if query is None:
        return "", ()
    return (
        f"where coalesce({alias}._search_text, '') ilike %s escape '\\'",
        (build_web_content_search_pattern(query),),
    )


def build_web_content_order_clause(sort: str, *, alias: str) -> str:
    if sort == "oldest":
        return (
            f"order by {alias}.published_at asc nulls last, "
            f"{alias}.ingested_at asc nulls last, {alias}.content_item_id"
        )
    if sort == "title_asc":
        return (
            f"order by {alias}._normalized_title asc nulls last, "
            f"{alias}.published_at desc nulls last, "
            f"{alias}.ingested_at desc nulls last, {alias}.content_item_id"
        )
    if sort == "title_desc":
        return (
            f"order by {alias}._normalized_title desc nulls last, "
            f"{alias}.published_at desc nulls last, "
            f"{alias}.ingested_at desc nulls last, {alias}.content_item_id"
        )
    return (
        f"order by {alias}.published_at desc nulls last, "
        f"{alias}.ingested_at desc nulls last, {alias}.content_item_id"
    )


def strip_web_content_internal_fields(
    rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    return [
        {key: value for key, value in row.items() if not key.startswith("_")}
        for row in rows
    ]


def as_json_object(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def as_json_int(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def as_json_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


def as_json_str(value: Any) -> str | None:
    normalized = str(value or "").strip()
    return normalized or None


def build_reindex_selection_profile_payload(
    job_like: Mapping[str, Any],
) -> dict[str, Any] | None:
    snapshot = as_json_object(
        as_json_object(as_json_object(job_like.get("result_json")).get("backfill")).get(
            "selectionProfileSnapshot"
        )
    )
    if not snapshot:
        return None

    active_profiles = as_json_int(snapshot.get("activeProfiles"))
    total_profiles = as_json_int(snapshot.get("totalProfiles"))
    compatibility_profiles = as_json_int(snapshot.get("compatibilityProfiles"))
    templates_with_profiles = as_json_int(snapshot.get("templatesWithProfiles"))
    max_version = as_json_int(snapshot.get("maxVersion"))

    parts: list[str] = []
    if total_profiles > 0 or active_profiles > 0:
        parts.append(f"{active_profiles}/{total_profiles} active")
    if compatibility_profiles > 0:
        parts.append(f"{compatibility_profiles} compatibility")
    if templates_with_profiles > 0:
        parts.append(f"{templates_with_profiles} template-bound")
    if max_version > 0:
        parts.append(f"max v{max_version}")

    return {
        "activeProfiles": active_profiles,
        "totalProfiles": total_profiles,
        "compatibilityProfiles": compatibility_profiles,
        "templatesWithProfiles": templates_with_profiles,
        "maxVersion": max_version,
        "summary": " | ".join(parts) if parts else None,
    }


def apply_reindex_selection_profile_payload(
    job_like: Mapping[str, Any],
) -> dict[str, Any]:
    payload = dict(job_like)
    selection_profile_snapshot = build_reindex_selection_profile_payload(job_like)
    payload["selection_profile_snapshot"] = selection_profile_snapshot
    payload["selection_profile_summary"] = (
        selection_profile_snapshot.get("summary")
        if isinstance(selection_profile_snapshot, dict)
        else None
    )
    return payload


def build_selection_explain_payload(
    *,
    selection_like: Mapping[str, Any],
    final_selection_result: Mapping[str, Any] | None,
    system_feed_result: Mapping[str, Any] | None,
) -> dict[str, Any]:
    final_result = final_selection_result or {}
    system_result = system_feed_result or {}
    final_explain = as_json_object(final_result.get("explain_json"))
    filter_counts = as_json_object(final_explain.get("filterCounts"))
    hold_count = as_json_int(
        filter_counts.get("hold") or selection_like.get("final_selection_hold_count")
    )
    llm_review_pending_count = as_json_int(
        filter_counts.get("llmReviewPending")
        or selection_like.get("final_selection_llm_review_pending_count")
    )
    candidate_signal_uplift_count = as_json_int(
        final_explain.get("candidateSignalUpliftCount")
    )
    canonical_review_reused = as_json_bool(
        final_explain.get("canonicalReviewReused")
        if "canonicalReviewReused" in final_explain
        else selection_like.get("final_selection_canonical_review_reused")
    )
    canonical_review_reused_count = as_json_int(
        final_explain.get("canonicalReviewReusedCount")
        if "canonicalReviewReusedCount" in final_explain
        else selection_like.get("final_selection_canonical_review_reused_count")
    )
    duplicate_article_count_for_canonical = as_json_int(
        final_explain.get("duplicateArticleCountForCanonical")
        if "duplicateArticleCountForCanonical" in final_explain
        else selection_like.get("final_selection_duplicate_article_count_for_canonical")
    )
    canonical_selection_reused = as_json_bool(
        final_explain.get("canonicalSelectionReused")
        if "canonicalSelectionReused" in final_explain
        else selection_like.get("final_selection_canonical_selection_reused")
    )
    selection_reuse_source = (
        as_json_str(
            final_explain.get("selectionReuseSource")
            if "selectionReuseSource" in final_explain
            else selection_like.get("final_selection_reuse_source")
        )
        or "article_level"
    )
    selection_reason = (
        str(
            selection_like.get("final_selection_reason")
            or final_explain.get("selectionReason")
            or ""
        ).strip()
        or None
    )
    compatibility_decision = (
        str(
            selection_like.get("system_feed_decision")
            or system_result.get("decision")
            or ""
        ).strip()
        or None
    )
    final_decision = (
        str(
            selection_like.get("final_selection_decision")
            or final_result.get("final_decision")
            or ""
        ).strip()
        or None
    )

    if final_decision == "gray_zone":
        if candidate_signal_uplift_count and (
            llm_review_pending_count > 0 or compatibility_decision == "pending_llm"
        ):
            selection_mode = "llm_review_pending"
            selection_summary = "Recovered candidate waiting for LLM review"
        elif llm_review_pending_count > 0 or compatibility_decision == "pending_llm":
            selection_mode = "llm_review_pending"
            selection_summary = "Gray zone pending LLM review"
        elif candidate_signal_uplift_count and (
            hold_count > 0 or selection_reason == "candidate_signal_hold"
        ):
            selection_mode = "hold"
            selection_summary = "Recovered candidate held by profile policy"
        elif hold_count > 0 or selection_reason == "semantic_hold":
            selection_mode = "hold"
            selection_summary = "Gray zone held by profile policy"
        elif candidate_signal_uplift_count:
            selection_mode = "gray_zone"
            selection_summary = "Recovered candidate remains in gray zone"
        else:
            selection_mode = "gray_zone"
            selection_summary = "Gray zone unresolved"
    elif final_decision == "selected":
        selection_mode = "selected"
        selection_summary = "Selected by final-selection policy"
    elif final_decision == "rejected":
        selection_mode = "rejected"
        selection_summary = "Rejected by final-selection policy"
    elif compatibility_decision == "pending_llm":
        selection_mode = "llm_review_pending"
        selection_summary = "Compatibility projection waiting for review"
    elif compatibility_decision:
        selection_mode = "compatibility_only"
        selection_summary = f"Compatibility projection: {compatibility_decision}"
    else:
        selection_mode = "pending"
        selection_summary = "Selection not materialized yet"

    if candidate_signal_uplift_count:
        candidate_recovery_state = (
            "review_pending"
            if selection_mode == "llm_review_pending"
            else "held"
            if selection_mode == "hold"
            else "present"
        )
        candidate_recovery_summary = (
            "Recovered candidate signals are materialized and waiting for LLM review."
            if selection_mode == "llm_review_pending"
            else "Recovered candidate signals are materialized but currently held."
            if selection_mode == "hold"
            else "Recovered candidate signals are materialized on this item."
        )
    else:
        candidate_recovery_state = "absent"
        candidate_recovery_summary = (
            "Recovered candidate signals have not materialized on this item yet."
        )

    return {
        "source": (
            "final_selection_results"
            if final_decision
            else "system_feed_results"
            if compatibility_decision
            else "pending"
        ),
        "decision": final_decision or compatibility_decision,
        "systemSelected": (
            selection_like.get("final_selection_selected")
            if selection_like.get("final_selection_selected") is not None
            else selection_like.get("system_feed_eligible")
        ),
        "selectionReason": selection_reason,
        "selectionMode": selection_mode,
        "selectionSummary": selection_summary,
        "llmReviewPendingCount": llm_review_pending_count,
        "holdCount": hold_count,
        "candidateSignalUpliftCount": candidate_signal_uplift_count,
        "candidateRecoveryState": candidate_recovery_state,
        "candidateRecoverySummary": candidate_recovery_summary,
        "canonicalReviewReused": canonical_review_reused,
        "canonicalReviewReusedCount": canonical_review_reused_count,
        "canonicalSelectionReused": canonical_selection_reused,
        "duplicateArticleCountForCanonical": duplicate_article_count_for_canonical,
        "selectionReuseSource": selection_reuse_source,
        "reviewSource": (
            "reused_canonical_llm_review" if canonical_review_reused else None
        ),
        "compatibilityDecision": compatibility_decision,
        "observationState": selection_like.get("observation_state"),
        "duplicateKind": selection_like.get("duplicate_kind"),
        "canonicalDocumentId": selection_like.get("canonical_document_id"),
        "storyClusterId": selection_like.get("story_cluster_id"),
        "verificationState": selection_like.get("final_selection_verification_state")
        or selection_like.get("story_cluster_verification_state")
        or selection_like.get("canonical_verification_state"),
        "verificationTargetType": selection_like.get("verification_target_type"),
        "verificationTargetId": selection_like.get("verification_target_id"),
        "finalSelectionResult": final_selection_result,
        "systemFeedResult": system_feed_result,
    }


def build_selection_diagnostics_payload(
    *,
    selection_explain: Mapping[str, Any],
    interest_filter_results: list[Mapping[str, Any]],
    llm_reviews: list[Mapping[str, Any]],
    notifications: list[Mapping[str, Any]],
) -> dict[str, Any]:
    system_criterion_rows = 0
    user_interest_rows = 0
    matched_rows = 0
    no_match_rows = 0
    gray_zone_rows = 0
    technical_filtered_out_rows = 0

    for row in interest_filter_results:
        filter_scope = str(row.get("filter_scope") or "").strip()
        semantic_decision = str(row.get("semantic_decision") or "").strip()
        technical_filter_state = str(row.get("technical_filter_state") or "").strip()

        if filter_scope == "system_criterion":
            system_criterion_rows += 1
        elif filter_scope == "user_interest":
            user_interest_rows += 1

        if semantic_decision == "match":
            matched_rows += 1
        elif semantic_decision == "no_match":
            no_match_rows += 1
        elif semantic_decision == "gray_zone":
            gray_zone_rows += 1

        if technical_filter_state == "filtered_out":
            technical_filtered_out_rows += 1

    return {
        "source": selection_explain.get("source") or "pending",
        "decision": selection_explain.get("decision"),
        "selectionMode": selection_explain.get("selectionMode") or "pending",
        "selectionSummary": selection_explain.get("selectionSummary")
        or "Selection not explained yet",
        "selectionReason": selection_explain.get("selectionReason"),
        "holdCount": as_json_int(selection_explain.get("holdCount")),
        "llmReviewPendingCount": as_json_int(
            selection_explain.get("llmReviewPendingCount")
        ),
        "candidateSignalUpliftCount": as_json_int(
            selection_explain.get("candidateSignalUpliftCount")
        ),
        "candidateRecoveryState": selection_explain.get("candidateRecoveryState")
        or "absent",
        "candidateRecoverySummary": selection_explain.get("candidateRecoverySummary")
        or "Recovered candidate signals have not materialized on this item yet.",
        "systemCriterionRows": system_criterion_rows,
        "userInterestRows": user_interest_rows,
        "matchedRows": matched_rows,
        "noMatchRows": no_match_rows,
        "grayZoneRows": gray_zone_rows,
        "technicalFilteredOutRows": technical_filtered_out_rows,
        "llmReviewRows": len(llm_reviews),
        "notificationRows": len(notifications),
    }


def build_selection_guidance_payload(
    *, selection_explain: Mapping[str, Any]
) -> dict[str, Any]:
    selection_mode = str(selection_explain.get("selectionMode") or "").strip() or "pending"
    selection_source = str(selection_explain.get("source") or "").strip() or "pending"
    candidate_signal_uplift_count = as_json_int(
        selection_explain.get("candidateSignalUpliftCount")
    )

    if selection_mode == "selected":
        if selection_source == "system_interest_content_kind":
            return {
                "tone": "positive",
                "summary": "Content-kind eligibility already selected this resource. Use this row mainly to verify projection quality and downstream visibility.",
            }
        return {
            "tone": "positive",
            "summary": "Final selection already passed. Use this row mainly to verify quality and downstream visibility.",
        }
    if selection_mode == "hold":
        if candidate_signal_uplift_count:
            return {
                "tone": "warning",
                "summary": "A recovered candidate was preserved out of early no-match, but profile policy still kept it on cheap hold. Tune evidence rules or escalation policy before broadening recall.",
            }
        return {
            "tone": "warning",
            "summary": "Profile policy kept this item on cheap hold. Tune profile definitions or evidence rules before enabling broader escalation.",
        }
    if selection_mode == "llm_review_pending":
        if candidate_signal_uplift_count:
            return {
                "tone": "warning",
                "summary": "A candidate-recovery signal kept this item alive for LLM review. Watch these cases to see whether the new recall path surfaces real wins or only extra noise.",
            }
        return {
            "tone": "warning",
            "summary": "This item is waiting for the LLM review path. Review budget and profile policy before treating it as a selected result.",
        }
    if selection_mode == "compatibility_only":
        return {
            "tone": "neutral",
            "summary": "Only the legacy compatibility projection is materialized here. Prefer final-selection/profile truth before tuning semantics.",
        }
    if selection_mode == "rejected":
        return {
            "tone": "neutral",
            "summary": "Final selection rejected this item. Revisit the profile only if you expect this pattern to pass consistently.",
        }
    if selection_mode == "gray_zone":
        if candidate_signal_uplift_count:
            return {
                "tone": "warning",
                "summary": "A recovered candidate remains unresolved in gray zone. Check whether canonical evidence or cluster context should turn this pattern into a cleaner escalation path.",
            }
        return {
            "tone": "warning",
            "summary": "Gray zone remains unresolved. Check missing evidence and decide whether this profile should hold, reject, or escalate similar cases.",
        }

    return {
        "tone": "neutral",
        "summary": "Selection is not materialized yet. Wait for the final-selection path before using this row for profile tuning decisions.",
    }


def build_content_kind_selection_explain_payload(
    *, content_like: Mapping[str, Any]
) -> dict[str, Any]:
    return {
        "source": "system_interest_content_kind",
        "decision": content_like.get("system_selection_decision") or "kind_enabled",
        "systemSelected": True,
        "selectionReason": None,
        "selectionMode": "selected",
        "selectionSummary": "Selected by content-kind eligibility",
        "llmReviewPendingCount": 0,
        "holdCount": 0,
        "candidateSignalUpliftCount": 0,
        "candidateRecoveryState": "absent",
        "candidateRecoverySummary":
            "Recovered candidate signals have not materialized on this item yet.",
        "canonicalReviewReused": False,
        "canonicalReviewReusedCount": 0,
        "canonicalSelectionReused": False,
        "duplicateArticleCountForCanonical": 0,
        "selectionReuseSource": "article_level",
        "reviewSource": None,
        "compatibilityDecision": None,
        "observationState": None,
        "duplicateKind": None,
        "canonicalDocumentId": None,
        "storyClusterId": None,
        "verificationState": None,
        "verificationTargetType": None,
        "verificationTargetId": None,
        "finalSelectionResult": None,
        "systemFeedResult": None,
    }


def build_resource_selection_explain_payload(
    *, resource_like: Mapping[str, Any]
) -> dict[str, Any]:
    if resource_like.get("projected_article_id"):
        return build_selection_explain_payload(
            selection_like=resource_like,
            final_selection_result=None,
            system_feed_result=None,
        )
    if resource_like.get("content_item_ready"):
        return build_content_kind_selection_explain_payload(content_like=resource_like)
    return {
        "source": "pending",
        "decision": None,
        "systemSelected": False,
        "selectionReason": None,
        "selectionMode": "pending",
        "selectionSummary": "Selection not materialized yet",
        "llmReviewPendingCount": 0,
        "holdCount": 0,
        "candidateSignalUpliftCount": 0,
        "candidateRecoveryState": "absent",
        "candidateRecoverySummary":
            "Recovered candidate signals have not materialized on this item yet.",
        "canonicalReviewReused": False,
        "canonicalReviewReusedCount": 0,
        "canonicalSelectionReused": False,
        "duplicateArticleCountForCanonical": 0,
        "selectionReuseSource": "article_level",
        "reviewSource": None,
        "compatibilityDecision": None,
        "observationState": None,
        "duplicateKind": None,
        "canonicalDocumentId": None,
        "storyClusterId": None,
        "verificationState": None,
        "verificationTargetType": None,
        "verificationTargetId": None,
        "finalSelectionResult": None,
        "systemFeedResult": None,
    }


def apply_resource_selection_payload(
    resource_like: Mapping[str, Any],
    *,
    interest_filter_results: list[Mapping[str, Any]] | None = None,
    llm_reviews: list[Mapping[str, Any]] | None = None,
    notifications: list[Mapping[str, Any]] | None = None,
) -> dict[str, Any]:
    resource = dict(resource_like)
    selection_explain = build_resource_selection_explain_payload(resource_like=resource)
    resource["selection_source"] = selection_explain.get("source")
    resource["selection_decision"] = selection_explain.get("decision")
    resource["selection_mode"] = selection_explain.get("selectionMode")
    resource["selection_summary"] = selection_explain.get("selectionSummary")
    resource["selection_reason"] = selection_explain.get("selectionReason")
    resource["selection_hold_count"] = as_json_int(selection_explain.get("holdCount"))
    resource["selection_llm_review_pending_count"] = as_json_int(
        selection_explain.get("llmReviewPendingCount")
    )
    resource["selection_candidate_signal_uplift_count"] = as_json_int(
        selection_explain.get("candidateSignalUpliftCount")
    )
    resource["selection_candidate_recovery_state"] = selection_explain.get(
        "candidateRecoveryState"
    )
    resource["selection_candidate_recovery_summary"] = selection_explain.get(
        "candidateRecoverySummary"
    )
    resource["selection_canonical_review_reused"] = selection_explain.get(
        "canonicalReviewReused"
    )
    resource["selection_canonical_review_reused_count"] = as_json_int(
        selection_explain.get("canonicalReviewReusedCount")
    )
    resource["selection_canonical_reused"] = selection_explain.get(
        "canonicalSelectionReused"
    )
    resource["selection_duplicate_article_count_for_canonical"] = as_json_int(
        selection_explain.get("duplicateArticleCountForCanonical")
    )
    resource["selection_reuse_source"] = selection_explain.get("selectionReuseSource")
    resource["selection_review_source"] = selection_explain.get("reviewSource")
    resource["selection_guidance"] = build_selection_guidance_payload(
        selection_explain=selection_explain
    )
    if (
        interest_filter_results is not None
        and llm_reviews is not None
        and notifications is not None
    ):
        resource["selection_diagnostics"] = build_selection_diagnostics_payload(
            selection_explain=selection_explain,
            interest_filter_results=interest_filter_results,
            llm_reviews=llm_reviews,
            notifications=notifications,
        )
    return resource


def apply_article_selection_payload(
    article_like: Mapping[str, Any],
    *,
    interest_filter_results: list[Mapping[str, Any]] | None = None,
    llm_reviews: list[Mapping[str, Any]] | None = None,
    notifications: list[Mapping[str, Any]] | None = None,
) -> dict[str, Any]:
    article = dict(article_like)
    selection_explain = build_selection_explain_payload(
        selection_like=article,
        final_selection_result=None,
        system_feed_result=None,
    )
    article["selection_source"] = selection_explain.get("source")
    article["selection_decision"] = selection_explain.get("decision")
    article["selection_mode"] = selection_explain.get("selectionMode")
    article["selection_summary"] = selection_explain.get("selectionSummary")
    article["selection_reason"] = selection_explain.get("selectionReason")
    article["selection_hold_count"] = as_json_int(selection_explain.get("holdCount"))
    article["selection_llm_review_pending_count"] = as_json_int(
        selection_explain.get("llmReviewPendingCount")
    )
    article["selection_candidate_signal_uplift_count"] = as_json_int(
        selection_explain.get("candidateSignalUpliftCount")
    )
    article["selection_candidate_recovery_state"] = selection_explain.get(
        "candidateRecoveryState"
    )
    article["selection_candidate_recovery_summary"] = selection_explain.get(
        "candidateRecoverySummary"
    )
    article["selection_canonical_review_reused"] = selection_explain.get(
        "canonicalReviewReused"
    )
    article["selection_canonical_review_reused_count"] = as_json_int(
        selection_explain.get("canonicalReviewReusedCount")
    )
    article["selection_canonical_reused"] = selection_explain.get(
        "canonicalSelectionReused"
    )
    article["selection_duplicate_article_count_for_canonical"] = as_json_int(
        selection_explain.get("duplicateArticleCountForCanonical")
    )
    article["selection_reuse_source"] = selection_explain.get("selectionReuseSource")
    article["selection_review_source"] = selection_explain.get("reviewSource")
    article["selection_guidance"] = build_selection_guidance_payload(
        selection_explain=selection_explain
    )
    if (
        interest_filter_results is not None
        and llm_reviews is not None
        and notifications is not None
    ):
        article["selection_diagnostics"] = build_selection_diagnostics_payload(
            selection_explain=selection_explain,
            interest_filter_results=interest_filter_results,
            llm_reviews=llm_reviews,
            notifications=notifications,
        )
    return article


def resolve_discovery_canonical_domain(url: str | None) -> str:
    domain = canonical_domain(str(url or "").strip())
    if not domain or domain == "unknown":
        raise SequenceValidationError(
            ["Candidate URL must include a hostname so canonical_domain can be resolved."]
        )
    return domain


def editorial_content_select_sql(*, include_internal_fields: bool = False) -> str:
    family_expr = canonical_article_family_expr("a")
    family_order = canonical_article_family_order_clause("a")
    internal_projection = ""
    if include_internal_fields:
        internal_projection = """
            nullif(lower(btrim(coalesce(a.title, ''))), '') as _normalized_title,
            concat_ws(' ', coalesce(a.title, ''), coalesce(a.lead, ''), coalesce(a.body, '')) as _search_text,
        """
    return f"""
        select
          ranked.content_item_id,
          ranked.content_kind,
          ranked.origin_type,
          ranked.origin_id,
          ranked.url,
          ranked.title,
          ranked.summary,
          ranked.lead,
          ranked.lang,
          ranked.published_at,
          ranked.ingested_at,
          ranked.updated_at,
          ranked.source_name,
          ranked.author_name,
          ranked.read_time_seconds,
          ranked.system_selection_decision,
          ranked.system_selected,
          ranked.has_media,
          ranked.primary_media_kind,
          ranked.primary_media_url,
          ranked.primary_media_thumbnail_url,
          ranked.primary_media_source_url,
          ranked.primary_media_title,
          ranked.primary_media_alt_text,
          ranked.like_count,
          ranked.dislike_count,
          ranked.matched_interest_id,
          ranked.matched_interest_description,
          ranked.interest_match_score,
          ranked.interest_match_decision
          {", ranked._normalized_title, ranked._search_text" if include_internal_fields else ""}
        from (
          select
            {repr('editorial:')} || a.doc_id::text as content_item_id,
            'editorial'::text as content_kind,
            'editorial'::text as origin_type,
            a.doc_id::text as origin_id,
            a.url,
            a.title,
            a.lead as summary,
            a.lead,
            a.lang,
            a.published_at,
            a.ingested_at,
            a.updated_at,
            coalesce(a.extracted_source_name, sc.name) as source_name,
            a.extracted_author as author_name,
            a.extracted_ttr_seconds as read_time_seconds,
            {effective_system_selection_decision_expr("fsr", "sfr")} as system_selection_decision,
            {effective_system_selected_expr("fsr", "sfr")} as system_selected,
            a.has_media,
            pma.media_kind as primary_media_kind,
            coalesce(pma.thumbnail_url, pma.source_url) as primary_media_url,
            pma.thumbnail_url as primary_media_thumbnail_url,
            pma.source_url as primary_media_source_url,
            pma.title as primary_media_title,
            pma.alt_text as primary_media_alt_text,
            coalesce(ars.like_count, 0) as like_count,
            coalesce(ars.dislike_count, 0) as dislike_count,
            null::text as matched_interest_id,
            null::text as matched_interest_description,
            null::double precision as interest_match_score,
            null::text as interest_match_decision,
            {internal_projection if include_internal_fields else ""}
            row_number() over (
              partition by {family_expr}
              order by {family_order}
            ) as family_rank
          from articles a
          join source_channels sc on sc.channel_id = a.channel_id
          {final_selection_join_clause("a", "fsr")}
          left join system_feed_results sfr on sfr.doc_id = a.doc_id
          left join article_media_assets pma on pma.asset_id = a.primary_media_asset_id
          left join article_reaction_stats ars on ars.doc_id = a.doc_id
          where {feed_eligible_article_clause("a", "fsr", "sfr")}
            and {system_interest_kind_enabled_clause("'editorial'")}
        ) ranked
        where ranked.family_rank = 1
    """


def resource_content_select_sql(*, include_internal_fields: bool = False) -> str:
    internal_projection = ""
    if include_internal_fields:
        internal_projection = """
          ,
          nullif(lower(btrim(coalesce(wr.title, ''))), '') as _normalized_title,
          concat_ws(' ', coalesce(wr.title, ''), coalesce(wr.summary, ''), coalesce(wr.body, '')) as _search_text
        """
    return f"""
        select
          {repr('resource:')} || wr.resource_id::text as content_item_id,
          wr.resource_kind as content_kind,
          'resource'::text as origin_type,
          wr.resource_id::text as origin_id,
          coalesce(wr.final_url, wr.url) as url,
          wr.title,
          wr.summary,
          wr.summary as lead,
          wr.lang,
          wr.published_at,
          wr.discovered_at as ingested_at,
          wr.updated_at,
          sc.name as source_name,
          null::text as author_name,
          null::integer as read_time_seconds,
          'kind_enabled'::text as system_selection_decision,
          true as system_selected,
          jsonb_array_length(coalesce(wr.media_json, '[]'::jsonb)) > 0 as has_media,
          wr.media_json -> 0 ->> 'media_kind' as primary_media_kind,
          coalesce(wr.media_json -> 0 ->> 'thumbnail_url', wr.media_json -> 0 ->> 'source_url') as primary_media_url,
          wr.media_json -> 0 ->> 'thumbnail_url' as primary_media_thumbnail_url,
          wr.media_json -> 0 ->> 'source_url' as primary_media_source_url,
          wr.media_json -> 0 ->> 'title' as primary_media_title,
          wr.media_json -> 0 ->> 'alt_text' as primary_media_alt_text,
          0::bigint as like_count,
          0::bigint as dislike_count,
          null::text as matched_interest_id,
          null::text as matched_interest_description,
          null::double precision as interest_match_score,
          null::text as interest_match_decision
          {internal_projection}
        from web_resources wr
        join source_channels sc on sc.channel_id = wr.channel_id
        where wr.resource_kind <> 'editorial'
          and wr.extraction_state in ('enriched', 'skipped')
          and {system_interest_kind_enabled_clause("wr.resource_kind")}
    """


def combined_content_items_select_sql(*, include_internal_fields: bool = False) -> str:
    return f"""
      select *
      from (
        {editorial_content_select_sql(include_internal_fields=include_internal_fields)}
        union all
        {resource_content_select_sql(include_internal_fields=include_internal_fields)}
      ) content_items
    """


def build_editorial_content_item_preview_from_article(
    article: Mapping[str, Any],
) -> dict[str, Any]:
    final_selection_decision = str(article.get("final_selection_decision") or "").strip()
    system_feed_decision = str(article.get("system_feed_decision") or "").strip()
    final_selection_selected = article.get("final_selection_selected")
    system_feed_eligible = article.get("system_feed_eligible")
    system_selected = (
        bool(final_selection_selected)
        if final_selection_selected is not None
        else bool(system_feed_eligible)
    )

    if final_selection_decision == "selected":
        system_selection_decision = "selected"
    elif final_selection_decision == "gray_zone":
        system_selection_decision = "gray_zone"
    elif final_selection_decision == "rejected":
        system_selection_decision = "rejected"
    elif system_feed_eligible:
        system_selection_decision = "selected"
    elif system_feed_decision == "pending_llm":
        system_selection_decision = "pending_ai_review"
    elif system_feed_decision in {"eligible", "filtered_out", "pass_through"}:
        system_selection_decision = "filtered_out"
    else:
        system_selection_decision = "unknown"

    return {
        "content_item_id": build_content_item_id(
            "editorial", str(article.get("doc_id") or "")
        ),
        "content_kind": "editorial",
        "origin_type": "editorial",
        "origin_id": str(article.get("doc_id") or ""),
        "url": article.get("url"),
        "title": article.get("title"),
        "lead": article.get("lead"),
        "lang": article.get("lang"),
        "published_at": article.get("published_at"),
        "ingested_at": article.get("ingested_at"),
        "updated_at": article.get("updated_at"),
        "source_name": article.get("source_name"),
        "author_name": article.get("author_name"),
        "read_time_seconds": article.get("read_time_seconds"),
        "system_selection_decision": system_selection_decision,
        "system_selected": system_selected,
        "has_media": article.get("has_media"),
        "primary_media_kind": article.get("primary_media_kind"),
        "primary_media_url": article.get("primary_media_url"),
        "primary_media_thumbnail_url": article.get("primary_media_thumbnail_url"),
        "primary_media_source_url": article.get("primary_media_source_url"),
        "primary_media_title": article.get("primary_media_title"),
        "primary_media_alt_text": article.get("primary_media_alt_text"),
        "like_count": article.get("like_count", 0),
        "dislike_count": article.get("dislike_count", 0),
        "matched_interest_id": None,
        "matched_interest_description": None,
        "interest_match_score": None,
        "interest_match_decision": None,
    }


def get_selected_content_item_preview(content_item_id: str) -> dict[str, Any]:
    content_item = query_one(
        f"""
        select *
        from ({combined_content_items_select_sql()}) content_items
        where content_item_id = %s
        """,
        (content_item_id,),
    )
    if content_item is None:
        raise HTTPException(status_code=404, detail="Content item not found.")
    return content_item


class SequenceValidationError(ValueError):
    def __init__(self, errors: list[str]):
        super().__init__("; ".join(errors))
        self.errors = errors


class SequenceNotFoundError(LookupError):
    pass


class SequenceConflictError(ValueError):
    pass


class SequenceDispatchError(RuntimeError):
    pass


class SequenceCreatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    task_graph: list[dict[str, Any]] = Field(alias="taskGraph")
    description: str | None = None
    status: Literal["draft", "active", "archived"] = "draft"
    trigger_event: str | None = Field(default=None, alias="triggerEvent")
    cron: str | None = None
    max_runs: int | None = Field(default=None, ge=1, alias="maxRuns")
    tags: list[str] = Field(default_factory=list)
    created_by: str | None = Field(default=None, alias="createdBy")


class SequenceUpdatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = None
    task_graph: list[dict[str, Any]] | None = Field(default=None, alias="taskGraph")
    description: str | None = None
    status: Literal["draft", "active", "archived"] | None = None
    trigger_event: str | None = Field(default=None, alias="triggerEvent")
    cron: str | None = None
    max_runs: int | None = Field(default=None, ge=1, alias="maxRuns")
    tags: list[str] | None = None
    created_by: str | None = Field(default=None, alias="createdBy")


class SequenceManualRunPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    context_json: dict[str, Any] = Field(default_factory=dict, alias="contextJson")
    trigger_meta: dict[str, Any] = Field(default_factory=dict, alias="triggerMeta")
    requested_by: str | None = Field(default=None, alias="requestedBy")


class AgentSequenceCreatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    task_graph: list[dict[str, Any]] = Field(alias="taskGraph")
    description: str | None = None
    tags: list[str] = Field(default_factory=list)
    created_by: str | None = Field(default=None, alias="createdBy")
    context_json: dict[str, Any] = Field(default_factory=dict, alias="contextJson")
    trigger_meta: dict[str, Any] = Field(default_factory=dict, alias="triggerMeta")
    run_now: bool = Field(default=True, alias="runNow")


class SequenceCancelPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str | None = None


class ArticleEnrichmentRetryPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    requested_by: str | None = Field(default=None, alias="requestedBy")


class DiscoveryMissionCreatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    description: str | None = None
    source_kind: Literal["interest_template", "manual"] = Field(
        default="manual",
        alias="sourceKind",
    )
    source_ref_id: str | None = Field(default=None, alias="sourceRefId")
    seed_topics: list[str] = Field(default_factory=list, alias="seedTopics")
    seed_languages: list[str] = Field(default_factory=list, alias="seedLanguages")
    seed_regions: list[str] = Field(default_factory=list, alias="seedRegions")
    target_provider_types: list[
        Literal["rss", "website", "api", "email_imap", "youtube"]
    ] = Field(
        default_factory=lambda: ["rss", "website", "api", "email_imap", "youtube"],
        alias="targetProviderTypes",
    )
    interest_graph: dict[str, Any] | None = Field(default=None, alias="interestGraph")
    max_hypotheses: int | None = Field(default=None, ge=1, alias="maxHypotheses")
    max_sources: int | None = Field(default=None, ge=1, alias="maxSources")
    budget_cents: int | None = Field(default=None, ge=0, alias="budgetCents")
    priority: int = 0
    created_by: str | None = Field(default=None, alias="createdBy")


class DiscoveryMissionUpdatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = None
    description: str | None = None
    seed_topics: list[str] | None = Field(default=None, alias="seedTopics")
    seed_languages: list[str] | None = Field(default=None, alias="seedLanguages")
    seed_regions: list[str] | None = Field(default=None, alias="seedRegions")
    target_provider_types: list[
        Literal["rss", "website", "api", "email_imap", "youtube"]
    ] | None = Field(
        default=None,
        alias="targetProviderTypes",
    )
    interest_graph: dict[str, Any] | None = Field(default=None, alias="interestGraph")
    max_hypotheses: int | None = Field(default=None, ge=1, alias="maxHypotheses")
    max_sources: int | None = Field(default=None, ge=1, alias="maxSources")
    budget_cents: int | None = Field(default=None, ge=0, alias="budgetCents")
    priority: int | None = None
    status: Literal["planned", "active", "completed", "paused", "failed", "archived"] | None = None


class DiscoveryMissionRunPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    requested_by: str | None = Field(default=None, alias="requestedBy")


class DiscoveryRecallMissionCreatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    description: str | None = None
    mission_kind: Literal["manual", "domain_seed", "query_seed"] = Field(
        default="manual",
        alias="missionKind",
    )
    seed_domains: list[str] = Field(default_factory=list, alias="seedDomains")
    seed_urls: list[str] = Field(default_factory=list, alias="seedUrls")
    seed_queries: list[str] = Field(default_factory=list, alias="seedQueries")
    target_provider_types: list[
        Literal["rss", "website", "api", "email_imap", "youtube"]
    ] = Field(
        default_factory=lambda: ["rss", "website", "api", "email_imap", "youtube"],
        alias="targetProviderTypes",
    )
    scope_json: dict[str, Any] = Field(default_factory=dict, alias="scopeJson")
    max_candidates: int = Field(default=50, ge=1, alias="maxCandidates")
    created_by: str | None = Field(default=None, alias="createdBy")


class DiscoveryRecallMissionUpdatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = None
    description: str | None = None
    mission_kind: Literal["manual", "domain_seed", "query_seed"] | None = Field(
        default=None,
        alias="missionKind",
    )
    seed_domains: list[str] | None = Field(default=None, alias="seedDomains")
    seed_urls: list[str] | None = Field(default=None, alias="seedUrls")
    seed_queries: list[str] | None = Field(default=None, alias="seedQueries")
    target_provider_types: list[
        Literal["rss", "website", "api", "email_imap", "youtube"]
    ] | None = Field(
        default=None,
        alias="targetProviderTypes",
    )
    scope_json: dict[str, Any] | None = Field(default=None, alias="scopeJson")
    max_candidates: int | None = Field(default=None, ge=1, alias="maxCandidates")
    status: Literal["planned", "active", "completed", "paused", "failed"] | None = None


class DiscoveryRecallCandidateCreatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    recall_mission_id: str = Field(alias="recallMissionId")
    source_profile_id: str | None = Field(default=None, alias="sourceProfileId")
    url: str
    final_url: str | None = Field(default=None, alias="finalUrl")
    title: str | None = None
    description: str | None = None
    provider_type: Literal["rss", "website", "api", "email_imap", "youtube"] = Field(
        default="rss",
        alias="providerType",
    )
    status: Literal["pending", "shortlisted", "rejected", "duplicate"] = "pending"
    quality_signal_source: str = Field(default="manual", alias="qualitySignalSource")
    evaluation_json: dict[str, Any] = Field(default_factory=dict, alias="evaluationJson")
    rejection_reason: str | None = Field(default=None, alias="rejectionReason")
    created_by: str | None = Field(default=None, alias="createdBy")


class DiscoveryRecallCandidateUpdatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["pending", "shortlisted", "rejected", "duplicate"] | None = None
    reviewed_by: str | None = Field(default=None, alias="reviewedBy")
    rejection_reason: str | None = Field(default=None, alias="rejectionReason")
    quality_signal_source: str | None = Field(default=None, alias="qualitySignalSource")
    evaluation_json: dict[str, Any] | None = Field(default=None, alias="evaluationJson")


class DiscoveryRecallCandidatePromotePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reviewed_by: str | None = Field(default=None, alias="reviewedBy")
    enabled: bool = True
    tags: list[str] = Field(default_factory=list)


class DiscoveryHypothesisClassCreatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    class_key: str = Field(alias="classKey")
    display_name: str = Field(alias="displayName")
    description: str | None = None
    status: Literal["draft", "active", "archived"] = "draft"
    generation_backend: Literal["graph_seed_llm", "graph_seed_only"] = Field(
        default="graph_seed_llm",
        alias="generationBackend",
    )
    default_provider_types: list[
        Literal["rss", "website", "api", "email_imap", "youtube"]
    ] = Field(
        default_factory=lambda: ["rss", "website", "api", "email_imap", "youtube"],
        alias="defaultProviderTypes",
    )
    prompt_instructions: str | None = Field(default=None, alias="promptInstructions")
    seed_rules_json: dict[str, Any] = Field(default_factory=dict, alias="seedRulesJson")
    max_per_mission: int = Field(default=3, ge=1, alias="maxPerMission")
    sort_order: int = Field(default=0, alias="sortOrder")
    config_json: dict[str, Any] = Field(default_factory=dict, alias="configJson")


class DiscoveryHypothesisClassUpdatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str | None = Field(default=None, alias="displayName")
    description: str | None = None
    status: Literal["draft", "active", "archived"] | None = None
    generation_backend: Literal["graph_seed_llm", "graph_seed_only"] | None = Field(
        default=None,
        alias="generationBackend",
    )
    default_provider_types: list[
        Literal["rss", "website", "api", "email_imap", "youtube"]
    ] | None = Field(
        default=None,
        alias="defaultProviderTypes",
    )
    prompt_instructions: str | None = Field(default=None, alias="promptInstructions")
    seed_rules_json: dict[str, Any] | None = Field(default=None, alias="seedRulesJson")
    max_per_mission: int | None = Field(default=None, ge=1, alias="maxPerMission")
    sort_order: int | None = Field(default=None, alias="sortOrder")
    config_json: dict[str, Any] | None = Field(default=None, alias="configJson")


class DiscoveryCandidateUpdatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["approved", "rejected", "pending"]
    reviewed_by: str | None = Field(default=None, alias="reviewedBy")
    rejection_reason: str | None = Field(default=None, alias="rejectionReason")


class DiscoveryFeedbackCreatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mission_id: str | None = Field(default=None, alias="missionId")
    candidate_id: str | None = Field(default=None, alias="candidateId")
    source_profile_id: str | None = Field(default=None, alias="sourceProfileId")
    feedback_type: str = Field(alias="feedbackType")
    feedback_value: str | None = Field(default=None, alias="feedbackValue")
    notes: str | None = None
    created_by: str | None = Field(default=None, alias="createdBy")


class DiscoveryReEvaluatePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mission_id: str | None = Field(default=None, alias="missionId")


def validate_sequence_task_graph(task_graph: list[dict[str, Any]]) -> None:
    if not isinstance(task_graph, list):
        raise SequenceValidationError(["task_graph must be an array."])

    errors = TASK_REGISTRY.validate_task_graph(task_graph)
    if errors:
        raise SequenceValidationError(errors)


def validate_sequence_context_json(context_json: dict[str, Any]) -> None:
    errors: list[str] = []
    if not isinstance(context_json, dict):
        errors.append("context_json must be an object.")
    else:
        reserved_keys = sorted(
            key for key in context_json.keys() if key in RESERVED_CONTEXT_KEYS or key.startswith("_")
        )
        if reserved_keys:
            errors.append(
                "context_json must not include reserved keys: "
                + ", ".join(reserved_keys)
                + "."
            )

    if errors:
        raise SequenceValidationError(errors)


def validate_trigger_meta(trigger_meta: dict[str, Any]) -> None:
    if not isinstance(trigger_meta, dict):
        raise SequenceValidationError(["trigger_meta must be an object."])


def normalize_sequence_cron(cron: str | None) -> str | None:
    if cron is None:
        return None

    normalized = cron.strip()
    if not normalized:
        return None

    try:
        parse_cron_expression(normalized)
    except ValueError as error:
        raise SequenceValidationError([f"cron is invalid: {error}"]) from error

    return normalized


def dump_json_value(value: Any, field_name: str) -> str:
    try:
        return json.dumps(value)
    except TypeError as error:
        raise SequenceValidationError([f"{field_name} must be JSON-serializable."]) from error


def sequence_select_sql() -> str:
    return """
        select
          sequence_id::text as sequence_id,
          title,
          description,
          task_graph,
          status,
          trigger_event,
          cron,
          max_runs,
          run_count,
          tags,
          created_by,
          created_at,
          updated_at
        from sequences
    """


def sequence_run_select_sql() -> str:
    return """
        select
          sr.run_id::text as run_id,
          sr.sequence_id::text as sequence_id,
          s.title as sequence_title,
          sr.status,
          sr.context_json,
          sr.trigger_type,
          sr.trigger_meta,
          sr.started_at,
          sr.finished_at,
          sr.error_text,
          sr.created_at,
          coalesce(task_stats.total_tasks, 0) as total_tasks,
          coalesce(task_stats.completed_tasks, 0) as completed_tasks,
          coalesce(task_stats.failed_tasks, 0) as failed_tasks,
          coalesce(task_stats.skipped_tasks, 0) as skipped_tasks,
          coalesce(task_stats.running_tasks, 0) as running_tasks
        from sequence_runs sr
        join sequences s on s.sequence_id = sr.sequence_id
        left join lateral (
          select
            count(*)::int as total_tasks,
            count(*) filter (where status = 'completed')::int as completed_tasks,
            count(*) filter (where status = 'failed')::int as failed_tasks,
            count(*) filter (where status = 'skipped')::int as skipped_tasks,
            count(*) filter (where status = 'running')::int as running_tasks
          from sequence_task_runs str
          where str.run_id = sr.run_id
        ) task_stats on true
    """


def list_sequence_plugins() -> list[dict[str, Any]]:
    return TASK_REGISTRY.list_all()


def list_sequences_page(
    *,
    limit: int,
    page: int | None,
    page_size: int | None,
) -> dict[str, Any] | list[dict[str, Any]]:
    base_sql = f"{sequence_select_sql()}\norder by updated_at desc, created_at desc"
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, limit
    )
    if not paginate:
        return query_all(f"{base_sql}\nlimit %s", (limit,))

    total = query_count(
        """
        select count(*)::int as total
        from sequences
        """
    )
    items = query_all(
        f"{base_sql}\nlimit %s\noffset %s",
        (resolved_page_size, offset),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


def get_sequence_definition(sequence_id: str) -> dict[str, Any]:
    sequence = query_one(
        f"{sequence_select_sql()}\nwhere sequence_id = %s",
        (sequence_id,),
    )
    if sequence is None:
        raise SequenceNotFoundError(f"Sequence {sequence_id} was not found.")
    return sequence


def create_sequence_definition(payload: SequenceCreatePayload) -> dict[str, Any]:
    validate_sequence_task_graph(payload.task_graph)
    normalized_cron = normalize_sequence_cron(payload.cron)

    with psycopg.connect(build_database_url(), row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                insert into sequences (
                  title,
                  description,
                  task_graph,
                  status,
                  trigger_event,
                  cron,
                  max_runs,
                  tags,
                  created_by
                )
                values (%s, %s, %s::jsonb, %s, %s, %s, %s, %s::text[], %s)
                returning
                  sequence_id::text as sequence_id,
                  title,
                  description,
                  task_graph,
                  status,
                  trigger_event,
                  cron,
                  max_runs,
                  run_count,
                  tags,
                  created_by,
                  created_at,
                  updated_at
                """,
                (
                    payload.title,
                    payload.description,
                    dump_json_value(payload.task_graph, "task_graph"),
                    payload.status,
                    payload.trigger_event,
                    normalized_cron,
                    payload.max_runs,
                    payload.tags,
                    payload.created_by,
                ),
            )
            row = cursor.fetchone()

    if row is None:
        raise SequenceConflictError("Sequence creation did not return a row.")

    return dict(row)


def update_sequence_definition(
    sequence_id: str,
    payload: SequenceUpdatePayload,
) -> dict[str, Any]:
    values = payload.model_dump(exclude_unset=True)
    if not values:
        raise SequenceValidationError(["At least one field must be provided for update."])

    errors: list[str] = []
    for field_name in ("title", "status", "task_graph", "tags"):
        if field_name in values and values[field_name] is None:
            errors.append(f"{field_name} cannot be null.")
    if errors:
        raise SequenceValidationError(errors)

    if "task_graph" in values and values["task_graph"] is not None:
        validate_sequence_task_graph(values["task_graph"])
    if "cron" in values:
        values["cron"] = normalize_sequence_cron(values["cron"])

    assignments: list[str] = []
    params: list[Any] = []

    for field_name, column_name in (
        ("title", "title"),
        ("description", "description"),
        ("status", "status"),
        ("trigger_event", "trigger_event"),
        ("cron", "cron"),
        ("max_runs", "max_runs"),
        ("created_by", "created_by"),
    ):
        if field_name in values:
            assignments.append(f"{column_name} = %s")
            params.append(values[field_name])

    if "task_graph" in values:
        assignments.append("task_graph = %s::jsonb")
        params.append(dump_json_value(values["task_graph"], "task_graph"))

    if "tags" in values:
        assignments.append("tags = %s::text[]")
        params.append(values["tags"])

    assignments.append("updated_at = now()")
    params.append(sequence_id)

    with psycopg.connect(build_database_url(), row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                update sequences
                set {', '.join(assignments)}
                where sequence_id = %s
                returning
                  sequence_id::text as sequence_id,
                  title,
                  description,
                  task_graph,
                  status,
                  trigger_event,
                  cron,
                  max_runs,
                  run_count,
                  tags,
                  created_by,
                  created_at,
                  updated_at
                """,
                tuple(params),
            )
            row = cursor.fetchone()

    if row is None:
        raise SequenceNotFoundError(f"Sequence {sequence_id} was not found.")

    return dict(row)


def archive_sequence_definition(sequence_id: str) -> dict[str, Any]:
    with psycopg.connect(build_database_url(), row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                update sequences
                set
                  status = 'archived',
                  updated_at = now()
                where sequence_id = %s
                returning
                  sequence_id::text as sequence_id,
                  title,
                  description,
                  task_graph,
                  status,
                  trigger_event,
                  cron,
                  max_runs,
                  run_count,
                  tags,
                  created_by,
                  created_at,
                  updated_at
                """,
                (sequence_id,),
            )
            row = cursor.fetchone()

    if row is None:
        raise SequenceNotFoundError(f"Sequence {sequence_id} was not found.")

    return dict(row)


def enqueue_sequence_run_job(run_id: str, sequence_id: str) -> None:
    try:
        dispatch_sequence_run_job(run_id, sequence_id)
    except SequenceQueueDispatchError as error:
        raise SequenceDispatchError(str(error)) from error
    except SequenceDispatchError:
        raise
    except Exception as error:  # pragma: no cover - runtime dependent
        raise SequenceDispatchError(
            f"Failed to enqueue sequence run {run_id}: {error}"
        ) from error


def mark_sequence_run_failed_dispatch(run_id: str, error_text: str) -> None:
    with psycopg.connect(build_database_url(), row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                update sequence_runs
                set
                  status = 'failed',
                  finished_at = now(),
                  error_text = %s
                where run_id = %s
                """,
                (error_text, run_id),
            )


def create_sequence_run_request_for_trigger(
    sequence_id: str,
    *,
    context_json: dict[str, Any],
    trigger_meta: dict[str, Any],
    trigger_type: Literal["manual", "cron", "agent", "api", "event"],
) -> dict[str, Any]:
    validate_sequence_context_json(context_json)
    validate_trigger_meta(trigger_meta)
    run_id = str(uuid.uuid4())

    with psycopg.connect(build_database_url(), row_factory=dict_row) as connection:
        with connection.transaction():
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    select sequence_id::text as sequence_id, status
                    from sequences
                    where sequence_id = %s
                    for update
                    """,
                    (sequence_id,),
                )
                sequence_row = cursor.fetchone()
                if sequence_row is None:
                    raise SequenceNotFoundError(f"Sequence {sequence_id} was not found.")
                if sequence_row["status"] == "archived":
                    raise SequenceConflictError(
                        f"Sequence {sequence_id} is archived and cannot be run."
                    )

                cursor.execute(
                    """
                    insert into sequence_runs (
                      run_id,
                      sequence_id,
                      status,
                      context_json,
                      trigger_type,
                      trigger_meta
                    )
                    values (%s, %s, 'pending', %s::jsonb, %s, %s::jsonb)
                    """,
                    (
                        run_id,
                        sequence_id,
                        dump_json_value(context_json, "context_json"),
                        trigger_type,
                        dump_json_value(trigger_meta, "trigger_meta"),
                    ),
                )

    try:
        enqueue_sequence_run_job(run_id, sequence_id)
    except SequenceDispatchError:
        mark_sequence_run_failed_dispatch(run_id, "BullMQ transport is not available in this API runtime.")
        raise
    except Exception as error:  # pragma: no cover - runtime dependent
        mark_sequence_run_failed_dispatch(run_id, str(error))
        raise SequenceDispatchError(str(error)) from error

    return get_sequence_run(run_id)


def create_sequence_run_request(
    sequence_id: str,
    payload: SequenceManualRunPayload,
) -> dict[str, Any]:
    trigger_meta = {
        "source": "maintenance_api",
        **payload.trigger_meta,
    }
    if payload.requested_by:
        trigger_meta["requestedBy"] = payload.requested_by
    return create_sequence_run_request_for_trigger(
        sequence_id,
        context_json=payload.context_json,
        trigger_meta=trigger_meta,
        trigger_type="manual",
    )


def get_active_sequence_for_trigger(trigger_event: str) -> dict[str, Any]:
    row = query_one(
        """
        select
          sequence_id::text as sequence_id,
          title,
          status,
          trigger_event
        from sequences
        where trigger_event = %s
          and status = 'active'
        order by updated_at desc, created_at desc
        limit 1
        """,
        (trigger_event,),
    )
    if row is None:
        raise SequenceNotFoundError(
            f"No active sequence is registered for trigger {trigger_event!r}."
        )
    return row


def ensure_published_article_retry_event(*, event_id: str, doc_id: str) -> None:
    payload = {
        "docId": doc_id,
        "eventId": event_id,
        "manualRetry": True,
        "source": "maintenance_article_enrichment_retry",
    }
    with psycopg.connect(build_database_url(), row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
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
                values (
                  %s,
                  'article.ingest.requested',
                  'article',
                  %s,
                  %s::jsonb,
                  'published',
                  now(),
                  1,
                  null
                )
                on conflict (event_id) do update
                set
                  aggregate_id = excluded.aggregate_id,
                  payload_json = excluded.payload_json,
                  status = 'published',
                  published_at = now(),
                  attempt_count = greatest(outbox_events.attempt_count, 1),
                  error_message = null
                """,
                (
                    event_id,
                    doc_id,
                    dump_json_value(payload, "payload_json"),
                ),
            )


def request_article_enrichment_retry(
    doc_id: str,
    payload: ArticleEnrichmentRetryPayload | None = None,
) -> dict[str, Any]:
    article = query_one(
        """
        select doc_id::text as doc_id
        from articles
        where doc_id = %s
        limit 1
        """,
        (doc_id,),
    )
    if article is None:
        raise SequenceNotFoundError(f"Article {doc_id} was not found.")

    sequence = get_active_sequence_for_trigger("article.ingest.requested")
    event_id = str(uuid.uuid4())
    trigger_meta = {
        "source": "maintenance_article_enrichment_retry",
        "docId": doc_id,
    }
    if payload and payload.requested_by:
        trigger_meta["requestedBy"] = payload.requested_by

    ensure_published_article_retry_event(event_id=event_id, doc_id=doc_id)

    return create_sequence_run_request_for_trigger(
        str(sequence["sequence_id"]),
        context_json={
            "doc_id": doc_id,
            "event_id": event_id,
            "force_enrichment": True,
        },
        trigger_meta=trigger_meta,
        trigger_type="manual",
    )


def list_agent_sequence_tools() -> dict[str, Any]:
    return {
        "availablePlugins": list_sequence_plugins(),
        "sequenceDefaults": {
            "status": "draft",
            "triggerType": "agent",
        },
        "notes": [
            "Agent-created sequences are stored first and stay draft by default.",
            "Agent-triggered runs still persist in sequence_runs and dispatch through q.sequence.",
        ],
    }


def create_agent_sequence_request(payload: AgentSequenceCreatePayload) -> dict[str, Any]:
    create_payload = SequenceCreatePayload.model_validate(
        {
            "title": payload.title,
            "taskGraph": payload.task_graph,
            "description": payload.description,
            "status": "draft",
            "tags": payload.tags,
            "createdBy": payload.created_by or "agent",
        }
    )
    sequence = create_sequence_definition(create_payload)

    run: dict[str, Any] | None = None
    if payload.run_now:
        trigger_meta = {
            "source": "agent_api",
            "createdSequenceId": sequence["sequence_id"],
            **payload.trigger_meta,
        }
        if payload.created_by:
            trigger_meta["requestedBy"] = payload.created_by
        run = create_sequence_run_request_for_trigger(
            sequence["sequence_id"],
            context_json=payload.context_json,
            trigger_meta=trigger_meta,
            trigger_type="agent",
        )

    return {
        "sequence": sequence,
        "run": run,
    }


def get_sequence_run(run_id: str) -> dict[str, Any]:
    run = query_one(
        f"{sequence_run_select_sql()}\nwhere sr.run_id = %s",
        (run_id,),
    )
    if run is None:
        raise SequenceNotFoundError(f"Sequence run {run_id} was not found.")
    return run


def cancel_sequence_run_request(run_id: str, reason: str | None = None) -> dict[str, Any]:
    with psycopg.connect(build_database_url(), row_factory=dict_row) as connection:
        with connection.transaction():
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    select run_id::text as run_id, status
                    from sequence_runs
                    where run_id = %s
                    for update
                    """,
                    (run_id,),
                )
                run = cursor.fetchone()
                if run is None:
                    raise SequenceNotFoundError(f"Sequence run {run_id} was not found.")
                if run["status"] not in SEQUENCE_RUN_CANCELLABLE_STATUSES:
                    raise SequenceConflictError(
                        f"Sequence run {run_id} cannot be cancelled from status {run['status']}."
                    )

                error_text = reason.strip() if isinstance(reason, str) and reason.strip() else "Cancelled via maintenance API."
                cursor.execute(
                    """
                    update sequence_runs
                    set
                      status = 'cancelled',
                      finished_at = now(),
                      error_text = %s
                    where run_id = %s
                    returning run_id::text as run_id
                    """,
                    (error_text, run_id),
                )
                cursor.fetchone()

    return get_sequence_run(run_id)


def list_sequence_task_runs(run_id: str) -> list[dict[str, Any]]:
    get_sequence_run(run_id)
    return query_all(
        """
        select
          task_run_id::text as task_run_id,
          run_id::text as run_id,
          task_index,
          task_key,
          module,
          status,
          options_json,
          input_json,
          output_json,
          started_at,
          finished_at,
          error_text,
          duration_ms,
          created_at
        from sequence_task_runs
        where run_id = %s
        order by task_index asc, created_at asc
        """,
        (run_id,),
    )


def raise_sequence_http_exception(error: Exception) -> None:
    if isinstance(error, SequenceNotFoundError):
        raise HTTPException(status_code=404, detail=str(error)) from error
    if isinstance(error, SequenceConflictError):
        raise HTTPException(status_code=409, detail=str(error)) from error
    if isinstance(error, SequenceValidationError):
        raise HTTPException(status_code=422, detail=error.errors) from error
    if isinstance(error, SequenceDispatchError):
        raise HTTPException(status_code=503, detail=str(error)) from error
    raise error


def discovery_mission_select_sql() -> str:
    return """
        select
          m.mission_id::text as mission_id,
          m.title,
          m.description,
          m.source_kind,
          m.source_ref_id::text as source_ref_id,
          m.seed_topics,
          m.seed_languages,
          m.seed_regions,
          m.target_provider_types,
          m.interest_graph,
          m.interest_graph_status,
          m.interest_graph_version,
          m.interest_graph_compiled_at,
          m.interest_graph_error_text,
          m.max_hypotheses,
          m.max_sources,
          m.budget_cents,
          m.spent_cents,
          m.status,
          m.priority,
          m.run_count,
          m.last_run_at,
          m.latest_portfolio_snapshot_id::text as latest_portfolio_snapshot_id,
          (
            select summary_json
            from discovery_portfolio_snapshots dps
            where dps.snapshot_id = m.latest_portfolio_snapshot_id
          ) as latest_portfolio_summary,
          m.created_by,
          m.created_at,
          m.updated_at
        from discovery_missions m
    """


def discovery_recall_mission_select_sql() -> str:
    return """
        select
          rm.recall_mission_id::text as recall_mission_id,
          rm.title,
          rm.description,
          rm.mission_kind,
          rm.seed_domains,
          rm.seed_urls,
          rm.seed_queries,
          rm.target_provider_types,
          rm.scope_json,
          rm.status,
          rm.max_candidates,
          rm.created_by,
          rm.created_at,
          rm.updated_at
        from discovery_recall_missions rm
    """


def discovery_class_select_sql() -> str:
    return """
        select
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
          config_json,
          created_at,
          updated_at
        from discovery_hypothesis_classes
    """


def discovery_candidate_select_sql() -> str:
    return """
        select
          c.candidate_id::text as candidate_id,
          c.hypothesis_id::text as hypothesis_id,
          c.mission_id::text as mission_id,
          c.source_profile_id::text as source_profile_id,
          c.url,
          c.final_url,
          c.title,
          c.description,
          c.provider_type,
          c.is_valid,
          c.relevance_score,
          c.evaluation_json,
          c.llm_assessment,
          c.sample_data,
          c.status,
          c.rejection_reason,
          c.registered_channel_id::text as registered_channel_id,
          c.reviewed_by,
          c.reviewed_at,
          c.created_at,
          m.title as mission_title,
          h.class_key,
          h.tactic_key,
          h.search_query,
          sp.canonical_domain,
          sp.source_type,
          sp.trust_score
        from discovery_candidates c
        join discovery_missions m on m.mission_id = c.mission_id
        join discovery_hypotheses h on h.hypothesis_id = c.hypothesis_id
        left join discovery_source_profiles sp on sp.source_profile_id = c.source_profile_id
    """


def discovery_recall_candidate_select_sql() -> str:
    return """
        select
          rc.recall_candidate_id::text as recall_candidate_id,
          rc.recall_mission_id::text as recall_mission_id,
          rc.source_profile_id::text as source_profile_id,
          rc.canonical_domain,
          rc.url,
          rc.final_url,
          rc.title,
          rc.description,
          rc.provider_type,
          rc.status,
          rc.quality_signal_source,
          rc.evaluation_json,
          rc.rejection_reason,
          rc.registered_channel_id::text as registered_channel_id,
          rc.created_by,
          rc.reviewed_by,
          rc.reviewed_at,
          rc.created_at,
          rc.updated_at,
          rm.title as recall_mission_title,
          rm.mission_kind,
          coalesce(sp.channel_id, rc.registered_channel_id)::text as channel_id,
          sp.source_type,
          sp.trust_score,
          sqs.snapshot_id::text as source_quality_snapshot_id,
          sqs.snapshot_reason as source_quality_snapshot_reason,
          sqs.recall_score as source_quality_recall_score,
          sqs.scoring_breakdown as source_quality_scoring_breakdown,
          sqs.scored_at as source_quality_scored_at
        from discovery_recall_candidates rc
        join discovery_recall_missions rm on rm.recall_mission_id = rc.recall_mission_id
        left join discovery_source_profiles sp on sp.source_profile_id = rc.source_profile_id
        left join lateral (
          select
            snapshot_id,
            snapshot_reason,
            recall_score,
            scoring_breakdown,
            scored_at
          from discovery_source_quality_snapshots sqs
          where sqs.source_profile_id = rc.source_profile_id
          order by sqs.scored_at desc, sqs.updated_at desc, sqs.created_at desc
          limit 1
        ) sqs on true
    """


def discovery_hypothesis_select_sql() -> str:
    return """
        select
          h.hypothesis_id::text as hypothesis_id,
          h.mission_id::text as mission_id,
          h.class_key,
          h.tactic_key,
          h.search_query,
          h.target_urls,
          h.target_provider_type,
          h.generation_context,
          h.expected_value,
          h.status,
          h.sequence_run_id::text as sequence_run_id,
          h.sources_found,
          h.sources_approved,
          h.effectiveness,
          h.execution_cost_cents,
          h.execution_cost_usd,
          h.error_text,
          h.started_at,
          h.finished_at,
          h.created_at,
          m.title as mission_title
        from discovery_hypotheses h
        join discovery_missions m on m.mission_id = h.mission_id
    """


def discovery_source_profile_select_sql() -> str:
    return """
        select
          sp.source_profile_id::text as source_profile_id,
          sp.candidate_id::text as candidate_id,
          sp.channel_id::text as channel_id,
          sp.canonical_domain,
          sp.source_type,
          sp.org_name,
          sp.country,
          sp.languages,
          sp.ownership_transparency,
          sp.author_accountability,
          sp.source_linking_quality,
          sp.historical_stability,
          sp.technical_quality,
          sp.spam_signals,
          sp.trust_score,
          sp.extraction_data,
          sqs.snapshot_id::text as latest_source_quality_snapshot_id,
          sqs.snapshot_reason as latest_source_quality_snapshot_reason,
          sqs.recall_score as latest_source_quality_recall_score,
          sqs.yield_score as latest_source_quality_yield_score,
          sqs.lead_time_score as latest_source_quality_lead_time_score,
          sqs.duplication_score as latest_source_quality_duplication_score,
          sqs.scoring_breakdown as latest_source_quality_scoring_breakdown,
          sqs.scored_at as latest_source_quality_scored_at,
          sp.created_at,
          sp.updated_at
        from discovery_source_profiles sp
        left join lateral (
          select
            snapshot_id,
            snapshot_reason,
            recall_score,
            yield_score,
            lead_time_score,
            duplication_score,
            scoring_breakdown,
            scored_at
          from discovery_source_quality_snapshots sqs
          where sqs.source_profile_id = sp.source_profile_id
          order by sqs.scored_at desc, sqs.updated_at desc, sqs.created_at desc
          limit 1
        ) sqs on true
    """


def discovery_source_quality_snapshot_select_sql() -> str:
    return """
        select
          sqs.snapshot_id::text as snapshot_id,
          sqs.source_profile_id::text as source_profile_id,
          sqs.channel_id::text as channel_id,
          sqs.snapshot_reason,
          sqs.trust_score,
          sqs.extraction_quality_score,
          sqs.stability_score,
          sqs.independence_score,
          sqs.freshness_score,
          sqs.lead_time_score,
          sqs.yield_score,
          sqs.duplication_score,
          sqs.recall_score,
          sqs.scoring_breakdown,
          sqs.scoring_period_days,
          sqs.scored_at,
          sqs.created_at,
          sqs.updated_at,
          sp.canonical_domain,
          sp.source_type
        from discovery_source_quality_snapshots sqs
        join discovery_source_profiles sp on sp.source_profile_id = sqs.source_profile_id
    """


def discovery_source_interest_score_select_sql() -> str:
    return """
        select
          sis.score_id::text as score_id,
          sis.source_profile_id::text as source_profile_id,
          sis.channel_id::text as channel_id,
          sis.mission_id::text as mission_id,
          sis.topic_coverage,
          sis.specificity,
          sis.audience_fit,
          sis.evidence_depth,
          sis.signal_to_noise,
          sis.fit_score,
          sis.novelty_score,
          sis.lead_time_score,
          sis.yield_score,
          sis.duplication_score,
          sis.contextual_score,
          sis.role_labels,
          sis.scoring_breakdown,
          sis.scoring_period_days,
          sis.scored_at,
          sis.created_at,
          sis.updated_at,
          m.title as mission_title,
          sp.canonical_domain,
          sp.trust_score
        from discovery_source_interest_scores sis
        join discovery_missions m on m.mission_id = sis.mission_id
        join discovery_source_profiles sp on sp.source_profile_id = sis.source_profile_id
    """


def discovery_feedback_select_sql() -> str:
    return """
        select
          dfe.feedback_event_id::text as feedback_event_id,
          dfe.mission_id::text as mission_id,
          dfe.candidate_id::text as candidate_id,
          dfe.source_profile_id::text as source_profile_id,
          dfe.feedback_type,
          dfe.feedback_value,
          dfe.notes,
          dfe.created_by,
          dfe.created_at
        from discovery_feedback_events dfe
    """


def list_discovery_missions_page(
    *,
    limit: int,
    page: int | None,
    page_size: int | None,
    status: str | None,
) -> dict[str, Any] | list[dict[str, Any]]:
    filters: list[str] = []
    params: list[Any] = []
    if status:
        filters.append("m.status = %s")
        params.append(status)

    base_sql = discovery_mission_select_sql()
    if filters:
        base_sql = f"{base_sql}\nwhere {' and '.join(filters)}"
    base_sql = f"{base_sql}\norder by priority desc, updated_at desc, created_at desc"
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, limit
    )
    if not paginate:
        return query_all(f"{base_sql}\nlimit %s", tuple([*params, limit]))

    count_sql = "select count(*)::int as total from discovery_missions"
    if filters:
        count_sql = f"{count_sql}\nwhere {' and '.join(filters)}"
    total = query_count(count_sql, tuple(params))
    items = query_all(
        f"{base_sql}\nlimit %s\noffset %s",
        tuple([*params, resolved_page_size, offset]),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


def get_discovery_mission(mission_id: str) -> dict[str, Any]:
    mission = query_one(
        f"{discovery_mission_select_sql()}\nwhere m.mission_id = %s",
        (mission_id,),
    )
    if mission is None:
        raise SequenceNotFoundError(f"Discovery mission {mission_id} was not found.")
    return mission


def list_discovery_recall_missions_page(
    *,
    limit: int,
    page: int | None,
    page_size: int | None,
    status: str | None,
    mission_kind: str | None,
) -> dict[str, Any] | list[dict[str, Any]]:
    filters: list[str] = []
    params: list[Any] = []
    if status:
        filters.append("rm.status = %s")
        params.append(status)
    if mission_kind:
        filters.append("rm.mission_kind = %s")
        params.append(mission_kind)

    base_sql = discovery_recall_mission_select_sql()
    if filters:
        base_sql = f"{base_sql}\nwhere {' and '.join(filters)}"
    base_sql = f"{base_sql}\norder by rm.updated_at desc, rm.created_at desc"
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, limit
    )
    if not paginate:
        return query_all(f"{base_sql}\nlimit %s", tuple([*params, limit]))

    count_sql = "select count(*)::int as total from discovery_recall_missions rm"
    if filters:
        count_sql = f"{count_sql}\nwhere {' and '.join(filters)}"
    total = query_count(count_sql, tuple(params))
    items = query_all(
        f"{base_sql}\nlimit %s\noffset %s",
        tuple([*params, resolved_page_size, offset]),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


def get_discovery_recall_mission(recall_mission_id: str) -> dict[str, Any]:
    mission = query_one(
        f"{discovery_recall_mission_select_sql()}\nwhere rm.recall_mission_id = %s",
        (recall_mission_id,),
    )
    if mission is None:
        raise SequenceNotFoundError(
            f"Discovery recall mission {recall_mission_id} was not found."
        )
    return mission


def create_discovery_recall_mission(
    payload: DiscoveryRecallMissionCreatePayload,
) -> dict[str, Any]:
    with psycopg.connect(build_database_url(), row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                insert into discovery_recall_missions (
                  title,
                  description,
                  mission_kind,
                  seed_domains,
                  seed_urls,
                  seed_queries,
                  target_provider_types,
                  scope_json,
                  status,
                  max_candidates,
                  created_by
                )
                values (
                  %s,
                  %s,
                  %s,
                  %s::text[],
                  %s::text[],
                  %s::text[],
                  %s::text[],
                  %s::jsonb,
                  'planned',
                  %s,
                  %s
                )
                returning recall_mission_id::text as recall_mission_id
                """,
                (
                    payload.title,
                    payload.description,
                    payload.mission_kind,
                    payload.seed_domains,
                    payload.seed_urls,
                    payload.seed_queries,
                    payload.target_provider_types,
                    json.dumps(payload.scope_json),
                    payload.max_candidates,
                    payload.created_by or "maintenance_api",
                ),
            )
            row = cursor.fetchone()
    if row is None:
        raise SequenceConflictError("Discovery recall mission creation did not return a row.")
    return get_discovery_recall_mission(str(row["recall_mission_id"]))


def update_discovery_recall_mission(
    recall_mission_id: str,
    payload: DiscoveryRecallMissionUpdatePayload,
) -> dict[str, Any]:
    values = payload.model_dump(exclude_unset=True)
    if not values:
        raise SequenceValidationError(["At least one field must be provided for update."])

    assignments: list[str] = []
    params: list[Any] = []
    for field_name, column_name, cast_suffix, as_json in (
        ("title", "title", "", False),
        ("description", "description", "", False),
        ("mission_kind", "mission_kind", "", False),
        ("seed_domains", "seed_domains", "::text[]", False),
        ("seed_urls", "seed_urls", "::text[]", False),
        ("seed_queries", "seed_queries", "::text[]", False),
        ("target_provider_types", "target_provider_types", "::text[]", False),
        ("scope_json", "scope_json", "::jsonb", True),
        ("status", "status", "", False),
        ("max_candidates", "max_candidates", "", False),
    ):
        if field_name in values:
            assignments.append(f"{column_name} = %s{cast_suffix}")
            params.append(json.dumps(values[field_name]) if as_json else values[field_name])
    assignments.append("updated_at = now()")
    params.append(recall_mission_id)

    with psycopg.connect(build_database_url(), row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                update discovery_recall_missions
                set {', '.join(assignments)}
                where recall_mission_id = %s
                returning recall_mission_id::text as recall_mission_id
                """,
                tuple(params),
            )
            row = cursor.fetchone()
    if row is None:
        raise SequenceNotFoundError(
            f"Discovery recall mission {recall_mission_id} was not found."
        )
    return get_discovery_recall_mission(recall_mission_id)


async def request_discovery_recall_mission_acquisition(
    recall_mission_id: str,
) -> dict[str, Any]:
    get_discovery_recall_mission(recall_mission_id)
    repository = DiscoveryCoordinatorRepository()
    return await acquire_recall_missions(
        recall_mission_id=recall_mission_id,
        settings=load_discovery_settings(),
        repository=repository,
    )


def create_discovery_mission(payload: DiscoveryMissionCreatePayload) -> dict[str, Any]:
    settings = load_discovery_settings()
    interest_graph = payload.interest_graph if isinstance(payload.interest_graph, dict) else None
    graph_status = "compiled" if interest_graph else "pending"
    graph_version = 1 if interest_graph else 0
    with psycopg.connect(build_database_url(), row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                insert into discovery_missions (
                  title,
                  description,
                  source_kind,
                  source_ref_id,
                  seed_topics,
                  seed_languages,
                  seed_regions,
                  target_provider_types,
                  interest_graph,
                  interest_graph_status,
                  interest_graph_version,
                  interest_graph_compiled_at,
                  interest_graph_error_text,
                  max_hypotheses,
                  max_sources,
                  budget_cents,
                  priority,
                  status,
                  created_by
                )
                values (
                  %s,
                  %s,
                  %s,
                  %s,
                  %s::text[],
                  %s::text[],
                  %s::text[],
                  %s::text[],
                  %s::jsonb,
                  %s,
                  %s,
                  case when %s = 'compiled' then now() else null end,
                  null,
                  %s,
                  %s,
                  %s,
                  %s,
                  'planned',
                  %s
                )
                returning mission_id::text as mission_id
                """,
                (
                    payload.title,
                    payload.description,
                    payload.source_kind,
                    payload.source_ref_id,
                    payload.seed_topics,
                    payload.seed_languages,
                    payload.seed_regions,
                    payload.target_provider_types,
                    json.dumps(interest_graph) if interest_graph is not None else None,
                    graph_status,
                    graph_version,
                    graph_status,
                    payload.max_hypotheses or min(12, settings.max_hypotheses_per_run),
                    payload.max_sources or settings.default_max_sources,
                    payload.budget_cents
                    if payload.budget_cents is not None
                    else settings.default_budget_cents,
                    payload.priority,
                    payload.created_by or "maintenance_api",
                ),
            )
            row = cursor.fetchone()
    if row is None:
        raise SequenceConflictError("Discovery mission creation did not return a row.")
    return get_discovery_mission(str(row["mission_id"]))


def update_discovery_mission(
    mission_id: str,
    payload: DiscoveryMissionUpdatePayload,
) -> dict[str, Any]:
    values = payload.model_dump(exclude_unset=True)
    if not values:
        raise SequenceValidationError(["At least one field must be provided for update."])

    assignments: list[str] = []
    params: list[Any] = []
    for field_name, column_name, cast_suffix in (
        ("title", "title", ""),
        ("description", "description", ""),
        ("status", "status", ""),
        ("priority", "priority", ""),
        ("max_hypotheses", "max_hypotheses", ""),
        ("max_sources", "max_sources", ""),
        ("budget_cents", "budget_cents", ""),
        ("seed_topics", "seed_topics", "::text[]"),
        ("seed_languages", "seed_languages", "::text[]"),
        ("seed_regions", "seed_regions", "::text[]"),
        ("target_provider_types", "target_provider_types", "::text[]"),
    ):
        if field_name in values:
            assignments.append(f"{column_name} = %s{cast_suffix}")
            params.append(values[field_name])
    if "interest_graph" in values:
        graph_value = values["interest_graph"]
        graph_status = "compiled" if isinstance(graph_value, dict) and graph_value else "pending"
        assignments.extend(
            [
                "interest_graph = %s::jsonb",
                "interest_graph_status = %s",
                "interest_graph_version = interest_graph_version + 1",
                "interest_graph_compiled_at = case when %s = 'compiled' then now() else interest_graph_compiled_at end",
                "interest_graph_error_text = null",
            ]
        )
        params.extend(
            [
                json.dumps(graph_value) if graph_value is not None else None,
                graph_status,
                graph_status,
            ]
        )
    assignments.append("updated_at = now()")
    params.append(mission_id)

    with psycopg.connect(build_database_url(), row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                update discovery_missions
                set {', '.join(assignments)}
                where mission_id = %s
                returning mission_id::text as mission_id
                """,
                tuple(params),
            )
            row = cursor.fetchone()
    if row is None:
        raise SequenceNotFoundError(f"Discovery mission {mission_id} was not found.")
    return get_discovery_mission(mission_id)


def delete_discovery_mission(mission_id: str) -> dict[str, Any]:
    mission = get_discovery_mission(mission_id)
    with psycopg.connect(build_database_url(), row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select
                  (select count(*)::int from discovery_hypotheses where mission_id = %s) as hypothesis_count,
                  (select count(*)::int from discovery_candidates where mission_id = %s) as candidate_count,
                  (select count(*)::int from discovery_portfolio_snapshots where mission_id = %s) as portfolio_snapshot_count,
                  (select count(*)::int from discovery_feedback_events where mission_id = %s) as feedback_event_count,
                  (select count(*)::int from discovery_source_interest_scores where mission_id = %s) as source_interest_score_count,
                  (select count(*)::int from discovery_strategy_stats where mission_id = %s) as strategy_stat_count,
                  (select count(*)::int from discovery_cost_log where mission_id = %s) as cost_log_count
                """,
                (
                    mission_id,
                    mission_id,
                    mission_id,
                    mission_id,
                    mission_id,
                    mission_id,
                    mission_id,
                ),
            )
            blockers = cursor.fetchone() or {}
            has_history = (
                int(mission.get("run_count") or 0) > 0
                or int(mission.get("spent_cents") or 0) > 0
                or mission.get("last_run_at") is not None
                or any(int(blockers.get(key) or 0) > 0 for key in blockers)
            )
            if has_history:
                raise SequenceConflictError(
                    "Discovery mission already has generated history. Archive it instead of deleting it."
                )
            cursor.execute(
                """
                delete from discovery_missions
                where mission_id = %s
                returning mission_id::text as mission_id
                """,
                (mission_id,),
            )
            row = cursor.fetchone()
    if row is None:
        raise SequenceNotFoundError(f"Discovery mission {mission_id} was not found.")
    return {"mission_id": str(row["mission_id"]), "deleted": True}


async def compile_discovery_mission_graph(mission_id: str) -> dict[str, Any]:
    repository = DiscoveryCoordinatorRepository()
    mission = await repository.get_mission(mission_id)
    if mission is None:
        raise SequenceNotFoundError(f"Discovery mission {mission_id} was not found.")
    if mission.get("status") == "archived":
        raise SequenceConflictError(
            "Archived discovery missions must be reactivated before compiling the interest graph."
        )
    await compile_interest_graph_for_mission(mission=mission, repository=repository)
    return get_discovery_mission(mission_id)


def request_discovery_mission_run(
    mission_id: str,
    payload: DiscoveryMissionRunPayload,
) -> dict[str, Any]:
    mission = get_discovery_mission(mission_id)
    if mission.get("status") == "archived":
        raise SequenceConflictError(
            "Archived discovery missions must be reactivated before they can run."
        )
    quota_snapshot = get_discovery_monthly_quota_snapshot()
    if quota_snapshot["monthlyQuotaReached"]:
        raise SequenceConflictError(
            "Monthly discovery quota is exhausted; increase DISCOVERY_MONTHLY_BUDGET_CENTS or wait for the next UTC month."
        )
    with psycopg.connect(build_database_url(), row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                update discovery_missions
                set status = 'active', updated_at = now()
                where mission_id = %s
                """,
                (mission_id,),
            )
    trigger_meta = {"source": "maintenance_discovery_api", "missionId": mission_id}
    if payload.requested_by:
        trigger_meta["requestedBy"] = payload.requested_by
    return create_sequence_run_request_for_trigger(
        DISCOVERY_ORCHESTRATOR_SEQUENCE_ID,
        context_json={"mission_id": mission_id},
        trigger_meta=trigger_meta,
        trigger_type="api",
    )


def list_discovery_classes_page(
    *,
    limit: int,
    page: int | None,
    page_size: int | None,
    status: str | None,
) -> dict[str, Any] | list[dict[str, Any]]:
    filters: list[str] = []
    params: list[Any] = []
    if status:
        filters.append("status = %s")
        params.append(status)
    base_sql = discovery_class_select_sql()
    if filters:
        base_sql = f"{base_sql}\nwhere {' and '.join(filters)}"
    base_sql = f"{base_sql}\norder by sort_order asc, class_key asc"
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(page, page_size, limit)
    if not paginate:
        return query_all(f"{base_sql}\nlimit %s", tuple([*params, limit]))
    count_sql = "select count(*)::int as total from discovery_hypothesis_classes"
    if filters:
        count_sql = f"{count_sql}\nwhere {' and '.join(filters)}"
    total = query_count(count_sql, tuple(params))
    items = query_all(
        f"{base_sql}\nlimit %s\noffset %s",
        tuple([*params, resolved_page_size, offset]),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


def get_discovery_class(class_key: str) -> dict[str, Any]:
    item = query_one(f"{discovery_class_select_sql()}\nwhere class_key = %s", (class_key,))
    if item is None:
        raise SequenceNotFoundError(f"Discovery class {class_key} was not found.")
    return item


def create_discovery_class(payload: DiscoveryHypothesisClassCreatePayload) -> dict[str, Any]:
    with psycopg.connect(build_database_url(), row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
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
                  %s,
                  %s,
                  %s,
                  %s,
                  %s::text[],
                  %s,
                  %s::jsonb,
                  %s,
                  %s,
                  %s::jsonb
                )
                returning class_key
                """,
                (
                    payload.class_key,
                    payload.display_name,
                    payload.description,
                    payload.status,
                    payload.generation_backend,
                    payload.default_provider_types,
                    payload.prompt_instructions,
                    json.dumps(payload.seed_rules_json),
                    payload.max_per_mission,
                    payload.sort_order,
                    json.dumps(payload.config_json),
                ),
            )
            row = cursor.fetchone()
    if row is None:
        raise SequenceConflictError("Discovery class creation did not return a row.")
    return get_discovery_class(str(row["class_key"]))


def update_discovery_class(
    class_key: str,
    payload: DiscoveryHypothesisClassUpdatePayload,
) -> dict[str, Any]:
    values = payload.model_dump(exclude_unset=True)
    if not values:
        raise SequenceValidationError(["At least one field must be provided for class update."])
    assignments: list[str] = []
    params: list[Any] = []
    for field_name, column_name, cast_suffix, as_json in (
        ("display_name", "display_name", "", False),
        ("description", "description", "", False),
        ("status", "status", "", False),
        ("generation_backend", "generation_backend", "", False),
        ("default_provider_types", "default_provider_types", "::text[]", False),
        ("prompt_instructions", "prompt_instructions", "", False),
        ("seed_rules_json", "seed_rules_json", "::jsonb", True),
        ("max_per_mission", "max_per_mission", "", False),
        ("sort_order", "sort_order", "", False),
        ("config_json", "config_json", "::jsonb", True),
    ):
        if field_name in values:
            assignments.append(f"{column_name} = %s{cast_suffix}")
            params.append(json.dumps(values[field_name]) if as_json else values[field_name])
    assignments.append("updated_at = now()")
    params.append(class_key)
    with psycopg.connect(build_database_url(), row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                update discovery_hypothesis_classes
                set {', '.join(assignments)}
                where class_key = %s
                returning class_key
                """,
                tuple(params),
            )
            row = cursor.fetchone()
    if row is None:
        raise SequenceNotFoundError(f"Discovery class {class_key} was not found.")
    return get_discovery_class(class_key)


def delete_discovery_class(class_key: str) -> dict[str, Any]:
    get_discovery_class(class_key)
    with psycopg.connect(build_database_url(), row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select count(*)::int as hypothesis_count
                from discovery_hypotheses
                where class_key = %s
                """,
                (class_key,),
            )
            blocker_row = cursor.fetchone() or {}
            if int(blocker_row.get("hypothesis_count") or 0) > 0:
                raise SequenceConflictError(
                    "Discovery class already has generated hypotheses. Archive it instead of deleting it."
                )
            cursor.execute(
                """
                delete from discovery_hypothesis_classes
                where class_key = %s
                returning class_key
                """,
                (class_key,),
            )
            row = cursor.fetchone()
    if row is None:
        raise SequenceNotFoundError(f"Discovery class {class_key} was not found.")
    return {"class_key": str(row["class_key"]), "deleted": True}


def list_discovery_candidates_page(
    *,
    limit: int,
    page: int | None,
    page_size: int | None,
    mission_id: str | None,
    status: str | None,
    provider_type: str | None,
) -> dict[str, Any] | list[dict[str, Any]]:
    filters: list[str] = []
    params: list[Any] = []
    if mission_id:
        filters.append("c.mission_id = %s")
        params.append(mission_id)
    if status:
        filters.append("c.status = %s")
        params.append(status)
    if provider_type:
        filters.append("c.provider_type = %s")
        params.append(provider_type)

    base_sql = discovery_candidate_select_sql()
    if filters:
        base_sql = f"{base_sql}\nwhere {' and '.join(filters)}"
    base_sql = f"{base_sql}\norder by c.created_at desc"
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, limit
    )
    if not paginate:
        return query_all(f"{base_sql}\nlimit %s", tuple([*params, limit]))

    count_sql = "select count(*)::int as total from discovery_candidates c"
    if filters:
        count_sql = f"{count_sql}\nwhere {' and '.join(filters)}"
    total = query_count(count_sql, tuple(params))
    items = query_all(
        f"{base_sql}\nlimit %s\noffset %s",
        tuple([*params, resolved_page_size, offset]),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


def get_discovery_candidate(candidate_id: str) -> dict[str, Any]:
    candidate = query_one(
        f"{discovery_candidate_select_sql()}\nwhere c.candidate_id = %s",
        (candidate_id,),
    )
    if candidate is None:
        raise SequenceNotFoundError(f"Discovery candidate {candidate_id} was not found.")
    return candidate


def update_discovery_candidate(
    candidate_id: str,
    payload: DiscoveryCandidateUpdatePayload,
) -> dict[str, Any]:
    candidate = get_discovery_candidate(candidate_id)
    registered_channel_id: str | None = candidate.get("registered_channel_id")
    final_status = payload.status
    rejection_reason = payload.rejection_reason

    if payload.status == "approved" and not registered_channel_id:
        registrar = PostgresSourceRegistrarAdapter(build_database_url())
        registrations = registrar.register_sources(
            sources=[
                {
                    "source_url": candidate["url"],
                    "final_url": candidate.get("final_url"),
                    "title": candidate.get("title"),
                    "relevance_score": candidate.get("relevance_score"),
                    "provider_type": candidate.get("provider_type"),
                }
            ],
            enabled=True,
            dry_run=False,
            created_by=payload.reviewed_by or "adaptive_discovery:manual_review",
            tags=["discovery", "adaptive", "approved"],
            provider_type=str(candidate.get("provider_type") or "rss"),
        )
        registration = registrations[0] if registrations else {}
        if isinstance(registration, dict):
            registered_channel_id = (
                str(registration.get("channel_id"))
                if registration.get("channel_id") is not None
                else None
            )
            if registration.get("status") == "duplicate":
                final_status = "duplicate"
                rejection_reason = "already_registered"

    with psycopg.connect(build_database_url(), row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                update discovery_candidates
                set
                  status = %s,
                  rejection_reason = %s,
                  reviewed_by = %s,
                  reviewed_at = now(),
                  registered_channel_id = %s
                where candidate_id = %s
                """,
                (
                    final_status,
                    rejection_reason,
                    payload.reviewed_by or "maintenance_api",
                    registered_channel_id,
                    candidate_id,
                ),
            )
    return get_discovery_candidate(candidate_id)


def get_discovery_source_profile_by_canonical_domain(canonical_domain_value: str) -> dict[str, Any] | None:
    return query_one(
        f"{discovery_source_profile_select_sql()}\nwhere sp.canonical_domain = %s",
        (canonical_domain_value,),
    )


def list_discovery_recall_candidates_page(
    *,
    limit: int,
    page: int | None,
    page_size: int | None,
    recall_mission_id: str | None,
    status: str | None,
    provider_type: str | None,
    canonical_domain_value: str | None,
) -> dict[str, Any] | list[dict[str, Any]]:
    filters: list[str] = []
    params: list[Any] = []
    if recall_mission_id:
        filters.append("rc.recall_mission_id = %s")
        params.append(recall_mission_id)
    if status:
        filters.append("rc.status = %s")
        params.append(status)
    if provider_type:
        filters.append("rc.provider_type = %s")
        params.append(provider_type)
    if canonical_domain_value:
        filters.append("rc.canonical_domain = %s")
        params.append(canonical_domain_value)

    base_sql = discovery_recall_candidate_select_sql()
    if filters:
        base_sql = f"{base_sql}\nwhere {' and '.join(filters)}"
    base_sql = (
        f"{base_sql}\norder by "
        "coalesce(sqs.recall_score, 0) desc, rc.created_at desc"
    )
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, limit
    )
    if not paginate:
        return query_all(f"{base_sql}\nlimit %s", tuple([*params, limit]))

    count_sql = "select count(*)::int as total from discovery_recall_candidates rc"
    if filters:
        count_sql = f"{count_sql}\nwhere {' and '.join(filters)}"
    total = query_count(count_sql, tuple(params))
    items = query_all(
        f"{base_sql}\nlimit %s\noffset %s",
        tuple([*params, resolved_page_size, offset]),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


def get_discovery_recall_candidate(recall_candidate_id: str) -> dict[str, Any]:
    candidate = query_one(
        f"{discovery_recall_candidate_select_sql()}\nwhere rc.recall_candidate_id = %s",
        (recall_candidate_id,),
    )
    if candidate is None:
        raise SequenceNotFoundError(
            f"Discovery recall candidate {recall_candidate_id} was not found."
        )
    return candidate


def create_discovery_recall_candidate(
    payload: DiscoveryRecallCandidateCreatePayload,
) -> dict[str, Any]:
    get_discovery_recall_mission(payload.recall_mission_id)
    resolved_domain = resolve_discovery_canonical_domain(payload.final_url or payload.url)

    source_profile_id = payload.source_profile_id
    if source_profile_id:
        profile = get_discovery_source_profile(source_profile_id)
        if profile.get("canonical_domain") != resolved_domain:
            raise SequenceValidationError(
                [
                    "sourceProfileId canonical_domain does not match the candidate URL domain."
                ]
            )
    else:
        profile = get_discovery_source_profile_by_canonical_domain(resolved_domain)
        if profile is not None:
            source_profile_id = str(profile["source_profile_id"])

    with psycopg.connect(build_database_url(), row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                insert into discovery_recall_candidates (
                  recall_mission_id,
                  source_profile_id,
                  canonical_domain,
                  url,
                  final_url,
                  title,
                  description,
                  provider_type,
                  status,
                  quality_signal_source,
                  evaluation_json,
                  rejection_reason,
                  created_by
                )
                values (
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
                  %s::jsonb,
                  %s,
                  %s
                )
                returning recall_candidate_id::text as recall_candidate_id
                """,
                (
                    payload.recall_mission_id,
                    source_profile_id,
                    resolved_domain,
                    payload.url,
                    payload.final_url,
                    payload.title,
                    payload.description,
                    payload.provider_type,
                    payload.status,
                    payload.quality_signal_source.strip() or "manual",
                    json.dumps(payload.evaluation_json),
                    payload.rejection_reason,
                    payload.created_by or "maintenance_api",
                ),
            )
            row = cursor.fetchone()
    if row is None:
        raise SequenceConflictError("Discovery recall candidate creation did not return a row.")
    return get_discovery_recall_candidate(str(row["recall_candidate_id"]))


def update_discovery_recall_candidate(
    recall_candidate_id: str,
    payload: DiscoveryRecallCandidateUpdatePayload,
) -> dict[str, Any]:
    values = payload.model_dump(exclude_unset=True)
    if not values:
        raise SequenceValidationError(["At least one field must be provided for update."])
    get_discovery_recall_candidate(recall_candidate_id)

    assignments: list[str] = []
    params: list[Any] = []
    if "status" in values:
        assignments.append("status = %s")
        params.append(values["status"])
    if "rejection_reason" in values:
        assignments.append("rejection_reason = %s")
        params.append(values["rejection_reason"])
    if "quality_signal_source" in values:
        quality_signal_source = str(values["quality_signal_source"] or "").strip()
        if not quality_signal_source:
            raise SequenceValidationError(["qualitySignalSource must not be empty."])
        assignments.append("quality_signal_source = %s")
        params.append(quality_signal_source)
    if "evaluation_json" in values:
        assignments.append("evaluation_json = %s::jsonb")
        params.append(json.dumps(values["evaluation_json"]))

    if (
        "status" in values
        or "rejection_reason" in values
        or "reviewed_by" in values
    ):
        assignments.append("reviewed_by = %s")
        params.append(values.get("reviewed_by") or "maintenance_api")
        assignments.append("reviewed_at = now()")

    assignments.append("updated_at = now()")
    params.append(recall_candidate_id)

    with psycopg.connect(build_database_url(), row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                f"""
                update discovery_recall_candidates
                set {', '.join(assignments)}
                where recall_candidate_id = %s
                returning recall_candidate_id::text as recall_candidate_id
                """,
                tuple(params),
            )
            row = cursor.fetchone()
    if row is None:
        raise SequenceNotFoundError(
            f"Discovery recall candidate {recall_candidate_id} was not found."
        )
    return get_discovery_recall_candidate(recall_candidate_id)


def promote_discovery_recall_candidate(
    recall_candidate_id: str,
    payload: DiscoveryRecallCandidatePromotePayload,
) -> dict[str, Any]:
    candidate = get_discovery_recall_candidate(recall_candidate_id)
    existing_channel_id = str(candidate.get("registered_channel_id") or "").strip() or None
    if existing_channel_id is not None:
        return candidate

    current_status = str(candidate.get("status") or "").strip()
    rejection_reason = str(candidate.get("rejection_reason") or "").strip() or None
    if current_status == "rejected" and rejection_reason != "already_registered":
        raise SequenceValidationError(
            [
                "Rejected recall candidates cannot be promoted unless they were rejected as already_registered."
            ]
        )

    review_actor = payload.reviewed_by or "independent_recall:manual_review"
    deduped_tags: list[str] = []
    seen_tags: set[str] = set()
    for tag in ["discovery", "independent_recall", "promoted", *payload.tags]:
        normalized_tag = str(tag or "").strip()
        if not normalized_tag or normalized_tag in seen_tags:
            continue
        seen_tags.add(normalized_tag)
        deduped_tags.append(normalized_tag)

    evaluation_json = (
        dict(candidate.get("evaluation_json") or {})
        if isinstance(candidate.get("evaluation_json"), dict)
        else {}
    )
    registrar = PostgresSourceRegistrarAdapter(build_database_url())
    registrations = registrar.register_sources(
        sources=[
            {
                "source_url": candidate["url"],
                "final_url": candidate.get("final_url"),
                "title": candidate.get("title"),
                "provider_type": candidate.get("provider_type"),
                "evaluation_json": evaluation_json,
                "classification": evaluation_json.get("classification"),
                "capabilities": evaluation_json.get("capabilities"),
                "discovered_feed_urls": evaluation_json.get("discovered_feed_urls"),
                "browser_assisted_recommended": evaluation_json.get("browser_assisted_recommended"),
                "challenge_kind": evaluation_json.get("challenge_kind"),
                "created_by": review_actor,
            }
        ],
        enabled=payload.enabled,
        dry_run=False,
        created_by=review_actor,
        tags=deduped_tags,
        provider_type=str(candidate.get("provider_type") or "rss"),
    )
    registration = registrations[0] if registrations else {}
    if not isinstance(registration, dict):
        raise SequenceConflictError("Recall candidate promotion did not return a registration result.")

    registration_status = str(registration.get("status") or "").strip()
    registered_channel_id = (
        str(registration.get("channel_id")).strip()
        if registration.get("channel_id") is not None
        else None
    )
    final_status = "shortlisted"
    final_rejection_reason: str | None = None
    if registration_status == "duplicate":
        final_status = "duplicate"
        final_rejection_reason = "already_registered"
    elif registration_status != "registered":
        raise SequenceConflictError(
            f"Recall candidate promotion returned unsupported registration status {registration_status!r}."
        )

    source_profile_id = str(candidate.get("source_profile_id") or "").strip() or None
    canonical_domain_value = str(candidate.get("canonical_domain") or "").strip() or None
    with psycopg.connect(build_database_url(), row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                update discovery_recall_candidates
                set
                  status = %s,
                  rejection_reason = %s,
                  reviewed_by = %s,
                  reviewed_at = now(),
                  registered_channel_id = %s,
                  updated_at = now()
                where recall_candidate_id = %s
                returning recall_candidate_id::text as recall_candidate_id
                """,
                (
                    final_status,
                    final_rejection_reason,
                    review_actor,
                    registered_channel_id,
                    recall_candidate_id,
                ),
            )
            row = cursor.fetchone()
            if row is None:
                raise SequenceNotFoundError(
                    f"Discovery recall candidate {recall_candidate_id} was not found."
                )
            if registered_channel_id is not None:
                if source_profile_id is not None:
                    cursor.execute(
                        """
                        update discovery_source_profiles
                        set
                          channel_id = coalesce(channel_id, %s),
                          updated_at = now()
                        where source_profile_id = %s
                        """,
                        (registered_channel_id, source_profile_id),
                    )
                elif canonical_domain_value:
                    cursor.execute(
                        """
                        update discovery_source_profiles
                        set
                          channel_id = coalesce(channel_id, %s),
                          updated_at = now()
                        where canonical_domain = %s
                        """,
                        (registered_channel_id, canonical_domain_value),
                    )

    return get_discovery_recall_candidate(recall_candidate_id)


def list_discovery_hypotheses_page(
    *,
    limit: int,
    page: int | None,
    page_size: int | None,
    mission_id: str | None,
    status: str | None,
) -> dict[str, Any] | list[dict[str, Any]]:
    filters: list[str] = []
    params: list[Any] = []
    if mission_id:
        filters.append("h.mission_id = %s")
        params.append(mission_id)
    if status:
        filters.append("h.status = %s")
        params.append(status)

    base_sql = discovery_hypothesis_select_sql()
    if filters:
        base_sql = f"{base_sql}\nwhere {' and '.join(filters)}"
    base_sql = f"{base_sql}\norder by h.created_at desc"
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, limit
    )
    if not paginate:
        return query_all(f"{base_sql}\nlimit %s", tuple([*params, limit]))

    count_sql = "select count(*)::int as total from discovery_hypotheses h"
    if filters:
        count_sql = f"{count_sql}\nwhere {' and '.join(filters)}"
    total = query_count(count_sql, tuple(params))
    items = query_all(
        f"{base_sql}\nlimit %s\noffset %s",
        tuple([*params, resolved_page_size, offset]),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


def get_discovery_hypothesis(hypothesis_id: str) -> dict[str, Any]:
    hypothesis = query_one(
        f"{discovery_hypothesis_select_sql()}\nwhere h.hypothesis_id = %s",
        (hypothesis_id,),
    )
    if hypothesis is None:
        raise SequenceNotFoundError(f"Discovery hypothesis {hypothesis_id} was not found.")
    return hypothesis


def list_discovery_source_profiles_page(
    *,
    limit: int,
    page: int | None,
    page_size: int | None,
    min_trust_score: float | None,
    source_type: str | None,
) -> dict[str, Any] | list[dict[str, Any]]:
    filters: list[str] = []
    params: list[Any] = []
    if min_trust_score is not None:
        filters.append("sp.trust_score >= %s")
        params.append(min_trust_score)
    if source_type is not None:
        filters.append("sp.source_type = %s")
        params.append(source_type)
    base_sql = discovery_source_profile_select_sql()
    if filters:
        base_sql = f"{base_sql}\nwhere {' and '.join(filters)}"
    base_sql = f"{base_sql}\norder by sp.trust_score desc, sp.updated_at desc"
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(page, page_size, limit)
    if not paginate:
        return query_all(f"{base_sql}\nlimit %s", tuple([*params, limit]))
    count_sql = "select count(*)::int as total from discovery_source_profiles sp"
    if filters:
        count_sql = f"{count_sql}\nwhere {' and '.join(filters)}"
    total = query_count(count_sql, tuple(params))
    items = query_all(
        f"{base_sql}\nlimit %s\noffset %s",
        tuple([*params, resolved_page_size, offset]),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


def get_discovery_source_profile(source_profile_id: str) -> dict[str, Any]:
    profile = query_one(
        f"{discovery_source_profile_select_sql()}\nwhere sp.source_profile_id = %s",
        (source_profile_id,),
    )
    if profile is None:
        raise SequenceNotFoundError(f"Discovery source profile {source_profile_id} was not found.")
    return profile


def list_discovery_source_quality_snapshots_page(
    *,
    limit: int,
    page: int | None,
    page_size: int | None,
    channel_id: str | None,
    min_recall_score: float | None,
) -> dict[str, Any] | list[dict[str, Any]]:
    filters: list[str] = []
    params: list[Any] = []
    if channel_id:
        filters.append("sqs.channel_id = %s")
        params.append(channel_id)
    if min_recall_score is not None:
        filters.append("sqs.recall_score >= %s")
        params.append(min_recall_score)
    base_sql = discovery_source_quality_snapshot_select_sql()
    if filters:
        base_sql = f"{base_sql}\nwhere {' and '.join(filters)}"
    base_sql = f"{base_sql}\norder by sqs.recall_score desc, sqs.scored_at desc"
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(page, page_size, limit)
    if not paginate:
        return query_all(f"{base_sql}\nlimit %s", tuple([*params, limit]))
    count_sql = "select count(*)::int as total from discovery_source_quality_snapshots sqs"
    if filters:
        count_sql = f"{count_sql}\nwhere {' and '.join(filters)}"
    total = query_count(count_sql, tuple(params))
    items = query_all(
        f"{base_sql}\nlimit %s\noffset %s",
        tuple([*params, resolved_page_size, offset]),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


def get_discovery_source_quality_snapshot(snapshot_id: str) -> dict[str, Any]:
    snapshot = query_one(
        f"{discovery_source_quality_snapshot_select_sql()}\nwhere sqs.snapshot_id = %s",
        (snapshot_id,),
    )
    if snapshot is None:
        raise SequenceNotFoundError(f"Discovery source-quality snapshot {snapshot_id} was not found.")
    return snapshot


def list_discovery_source_interest_scores_page(
    *,
    limit: int,
    page: int | None,
    page_size: int | None,
    mission_id: str | None,
    channel_id: str | None,
    min_score: float | None,
) -> dict[str, Any] | list[dict[str, Any]]:
    filters: list[str] = []
    params: list[Any] = []
    if mission_id:
        filters.append("sis.mission_id = %s")
        params.append(mission_id)
    if channel_id:
        filters.append("sis.channel_id = %s")
        params.append(channel_id)
    if min_score is not None:
        filters.append("sis.contextual_score >= %s")
        params.append(min_score)
    base_sql = discovery_source_interest_score_select_sql()
    if filters:
        base_sql = f"{base_sql}\nwhere {' and '.join(filters)}"
    base_sql = f"{base_sql}\norder by sis.contextual_score desc, sis.scored_at desc"
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(page, page_size, limit)
    if not paginate:
        return query_all(f"{base_sql}\nlimit %s", tuple([*params, limit]))
    count_sql = "select count(*)::int as total from discovery_source_interest_scores sis"
    if filters:
        count_sql = f"{count_sql}\nwhere {' and '.join(filters)}"
    total = query_count(count_sql, tuple(params))
    items = query_all(
        f"{base_sql}\nlimit %s\noffset %s",
        tuple([*params, resolved_page_size, offset]),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


def get_discovery_source_interest_score(score_id: str) -> dict[str, Any]:
    score = query_one(
        f"{discovery_source_interest_score_select_sql()}\nwhere sis.score_id = %s",
        (score_id,),
    )
    if score is None:
        raise SequenceNotFoundError(f"Discovery source-interest score {score_id} was not found.")
    return score


def get_discovery_portfolio_snapshot(mission_id: str) -> dict[str, Any]:
    mission = get_discovery_mission(mission_id)
    snapshot = query_one(
        """
        select
          snapshot_id::text as snapshot_id,
          mission_id::text as mission_id,
          snapshot_reason,
          ranked_sources,
          gaps_json,
          summary_json,
          created_at
        from discovery_portfolio_snapshots
        where mission_id = %s
        order by created_at desc
        limit 1
        """,
        (mission_id,),
    )
    return {
        "missionId": mission_id,
        "missionTitle": mission.get("title"),
        "snapshot": snapshot,
    }


def list_discovery_feedback_page(
    *,
    limit: int,
    page: int | None,
    page_size: int | None,
    mission_id: str | None,
) -> dict[str, Any] | list[dict[str, Any]]:
    filters: list[str] = []
    params: list[Any] = []
    if mission_id:
        filters.append("dfe.mission_id = %s")
        params.append(mission_id)
    base_sql = discovery_feedback_select_sql()
    if filters:
        base_sql = f"{base_sql}\nwhere {' and '.join(filters)}"
    base_sql = f"{base_sql}\norder by dfe.created_at desc"
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(page, page_size, limit)
    if not paginate:
        return query_all(f"{base_sql}\nlimit %s", tuple([*params, limit]))
    count_sql = "select count(*)::int as total from discovery_feedback_events dfe"
    if filters:
        count_sql = f"{count_sql}\nwhere {' and '.join(filters)}"
    total = query_count(count_sql, tuple(params))
    items = query_all(
        f"{base_sql}\nlimit %s\noffset %s",
        tuple([*params, resolved_page_size, offset]),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


def create_discovery_feedback(payload: DiscoveryFeedbackCreatePayload) -> dict[str, Any]:
    with psycopg.connect(build_database_url(), row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
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
                values (%s, %s, %s, %s, %s, %s, %s)
                returning feedback_event_id::text as feedback_event_id
                """,
                (
                    payload.mission_id,
                    payload.candidate_id,
                    payload.source_profile_id,
                    payload.feedback_type,
                    payload.feedback_value,
                    payload.notes,
                    payload.created_by or "maintenance_api",
                ),
            )
            row = cursor.fetchone()
    if row is None:
        raise SequenceConflictError("Discovery feedback creation did not return a row.")
    return query_one(
        f"{discovery_feedback_select_sql()}\nwhere dfe.feedback_event_id = %s",
        (row["feedback_event_id"],),
    ) or {}


def get_discovery_monthly_quota_snapshot() -> dict[str, Any]:
    settings = load_discovery_settings()
    month_start = discovery_month_start_utc()
    row = query_one(
        """
        select
          coalesce(sum(cost_usd), 0) as month_to_date_cost_usd
        from discovery_cost_log
        where created_at >= %s
        """,
        (month_start,),
    ) or {"month_to_date_cost_usd": 0}
    month_to_date_cost_usd = coerce_discovery_cost_usd(row.get("month_to_date_cost_usd"))
    month_to_date_cost_cents = discovery_cost_usd_to_cents(month_to_date_cost_usd)
    quota_enabled = settings.monthly_budget_cents > 0
    budget_usd = Decimal(settings.monthly_budget_cents) / Decimal("100")
    monthly_quota_reached = quota_enabled and month_to_date_cost_usd >= budget_usd
    remaining_cents = (
        discovery_cost_usd_to_cents(max(budget_usd - month_to_date_cost_usd, Decimal("0")))
        if quota_enabled
        else None
    )
    return {
        "monthlyBudgetCents": settings.monthly_budget_cents,
        "monthToDateCostUsd": float(month_to_date_cost_usd),
        "monthToDateCostCents": month_to_date_cost_cents,
        "remainingMonthlyBudgetCents": remaining_cents,
        "monthlyQuotaReached": monthly_quota_reached,
        "monthStart": month_start,
    }


def get_discovery_summary() -> dict[str, Any]:
    summary = query_one(
        """
        select
          (select count(*)::int from discovery_missions) as mission_count,
          (select count(*)::int from discovery_missions where status = 'active') as active_mission_count,
          (select count(*)::int from discovery_recall_missions) as recall_mission_count,
          (select count(*)::int from discovery_recall_missions where status = 'active') as active_recall_mission_count,
          (select count(*)::int from discovery_missions where interest_graph_status = 'compiled') as compiled_graph_count,
          (select count(*)::int from discovery_hypothesis_classes where status = 'active') as active_class_count,
          (select count(*)::int from discovery_hypotheses) as hypothesis_count,
          (select count(*)::int from discovery_hypotheses where status = 'pending') as pending_hypothesis_count,
          (select count(*)::int from discovery_candidates) as candidate_count,
          (select count(*)::int from discovery_candidates where status = 'pending') as pending_candidate_count,
          (select count(*)::int from discovery_candidates where status in ('approved', 'auto_approved')) as approved_candidate_count,
          (select count(*)::int from discovery_recall_candidates) as recall_candidate_count,
          (select count(*)::int from discovery_recall_candidates where status = 'pending') as pending_recall_candidate_count,
          (select count(*)::int from discovery_recall_candidates where status = 'duplicate') as duplicate_recall_candidate_count,
          (select count(*)::int from discovery_recall_candidates where registered_channel_id is not null) as promoted_recall_candidate_count,
          (select count(*)::int from discovery_source_profiles) as source_profile_count,
          (select count(*)::int from discovery_source_quality_snapshots) as source_quality_snapshot_count,
          (select count(*)::int from discovery_source_interest_scores) as source_interest_score_count,
          (select count(*)::int from discovery_portfolio_snapshots) as portfolio_snapshot_count,
          (select count(*)::int from discovery_feedback_events) as feedback_event_count,
          (select coalesce(sum(cost_usd), 0) from discovery_cost_log) as total_cost_usd
        """
    ) or {}
    settings = load_discovery_settings()
    total_cost_usd = coerce_discovery_cost_usd(summary.get("total_cost_usd"))
    quota_snapshot = get_discovery_monthly_quota_snapshot()
    return {
        **summary,
        "total_cost_usd": float(total_cost_usd),
        "total_cost_cents": discovery_cost_usd_to_cents(total_cost_usd),
        "enabled": os.getenv("DISCOVERY_ENABLED", "0").strip().lower() in {"1", "true", "yes", "on"},
        "defaultCron": settings.cron,
        "defaultBudgetCents": settings.default_budget_cents,
        "searchProvider": settings.search_provider,
        "llmProvider": settings.llm_provider,
        "llmModel": settings.llm_model,
        "monthlyBudgetCents": quota_snapshot["monthlyBudgetCents"],
        "monthToDateCostUsd": quota_snapshot["monthToDateCostUsd"],
        "monthToDateCostCents": quota_snapshot["monthToDateCostCents"],
        "remainingMonthlyBudgetCents": quota_snapshot["remainingMonthlyBudgetCents"],
        "monthlyQuotaReached": quota_snapshot["monthlyQuotaReached"],
    }


def get_discovery_cost_summary() -> dict[str, Any]:
    month_start = discovery_month_start_utc()
    provider_rows = query_all(
        """
        select
          provider,
          operation,
          count(*)::int as row_count,
          coalesce(sum(cost_usd), 0) as total_cost_usd,
          coalesce(sum(cost_usd) filter (where created_at >= %s), 0) as month_to_date_cost_usd
        from discovery_cost_log
        group by provider, operation
        order by provider asc, operation asc
        """,
        (month_start,),
    )
    total_row = query_one(
        """
        select
          coalesce(sum(cost_usd), 0) as total_cost_usd,
          coalesce(sum(cost_usd) filter (where created_at >= now() - interval '24 hours'), 0) as last_24h_cost_usd,
          coalesce(sum(cost_usd) filter (where created_at >= %s), 0) as month_to_date_cost_usd
        from discovery_cost_log
        """,
        (month_start,),
    ) or {"total_cost_usd": 0, "last_24h_cost_usd": 0, "month_to_date_cost_usd": 0}
    total_cost_usd = coerce_discovery_cost_usd(total_row.get("total_cost_usd"))
    last_24h_cost_usd = coerce_discovery_cost_usd(total_row.get("last_24h_cost_usd"))
    month_to_date_cost_usd = coerce_discovery_cost_usd(total_row.get("month_to_date_cost_usd"))
    quota_snapshot = get_discovery_monthly_quota_snapshot()
    return {
        "totalCostUsd": float(total_cost_usd),
        "totalCostCents": discovery_cost_usd_to_cents(total_cost_usd),
        "last24hCostUsd": float(last_24h_cost_usd),
        "last24hCostCents": discovery_cost_usd_to_cents(last_24h_cost_usd),
        "monthToDateCostUsd": float(month_to_date_cost_usd),
        "monthToDateCostCents": discovery_cost_usd_to_cents(month_to_date_cost_usd),
        "monthlyBudgetCents": quota_snapshot["monthlyBudgetCents"],
        "remainingMonthlyBudgetCents": quota_snapshot["remainingMonthlyBudgetCents"],
        "monthlyQuotaReached": quota_snapshot["monthlyQuotaReached"],
        "items": [
            {
                **row,
                "total_cost_usd": float(coerce_discovery_cost_usd(row.get("total_cost_usd"))),
                "total_cost_cents": discovery_cost_usd_to_cents(row.get("total_cost_usd")),
                "month_to_date_cost_usd": float(
                    coerce_discovery_cost_usd(row.get("month_to_date_cost_usd"))
                ),
                "month_to_date_cost_cents": discovery_cost_usd_to_cents(
                    row.get("month_to_date_cost_usd")
                ),
            }
            for row in provider_rows
        ],
    }


app = FastAPI(title="NewsPortal API MVP")


@app.get("/health")
def health() -> dict[str, object]:
    check_database()
    return {
        "service": "api",
        "status": "ok",
        "checks": {
            "database": "ok",
        },
    }


@app.get("/maintenance/articles")
def list_articles(
    limit: int = Query(default=20, ge=1, le=100),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    article_select = f"""
        select
          a.doc_id,
          a.url,
          a.title,
          a.lead,
          a.lang,
          a.published_at,
          a.processing_state,
          a.visibility_state,
          a.event_cluster_id,
          obs.observation_state,
          obs.duplicate_kind,
          obs.canonical_document_id::text as canonical_document_id,
          fsr.final_decision as final_selection_decision,
          fsr.is_selected as final_selection_selected,
          fsr.verification_state as final_selection_verification_state,
          fsr.explain_json ->> 'selectionMode' as final_selection_mode,
          fsr.explain_json ->> 'selectionSummary' as final_selection_summary,
          fsr.explain_json ->> 'selectionReason' as final_selection_reason,
          coalesce((fsr.explain_json -> 'filterCounts' ->> 'llmReviewPending')::int, 0)
            as final_selection_llm_review_pending_count,
          coalesce((fsr.explain_json -> 'filterCounts' ->> 'hold')::int, 0)
            as final_selection_hold_count,
          coalesce((fsr.explain_json ->> 'canonicalReviewReused')::boolean, false)
            as final_selection_canonical_review_reused,
          coalesce((fsr.explain_json ->> 'canonicalReviewReusedCount')::int, 0)
            as final_selection_canonical_review_reused_count,
          coalesce((fsr.explain_json ->> 'canonicalSelectionReused')::boolean, false)
            as final_selection_canonical_selection_reused,
          coalesce((fsr.explain_json ->> 'duplicateArticleCountForCanonical')::int, 0)
            as final_selection_duplicate_article_count_for_canonical,
          fsr.explain_json ->> 'selectionReuseSource' as final_selection_reuse_source,
          fsr.story_cluster_id::text as story_cluster_id,
          fsr.verification_target_type,
          fsr.verification_target_id::text as verification_target_id,
          sfr.decision as system_feed_decision,
          coalesce(sfr.eligible_for_feed, false) as system_feed_eligible,
          {article_preview_projection("a", "sc", "pma")},
          coalesce(ars.like_count, 0) as like_count,
          coalesce(ars.dislike_count, 0) as dislike_count
        from articles a
        join source_channels sc on sc.channel_id = a.channel_id
        {article_observation_join_clause("a", "obs")}
        {final_selection_join_clause("a", "fsr")}
        {system_feed_join_clause("a", "sfr")}
        {primary_media_join_clause("a", "pma")}
        left join article_reaction_stats ars on ars.doc_id = a.doc_id
        order by a.published_at desc nulls last, a.ingested_at desc
    """
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, limit
    )
    def with_article_selection_payload(
        rows: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        return [apply_article_selection_payload(row) for row in rows]

    if not paginate:
        return with_article_selection_payload(query_all(f"{article_select}\nlimit %s", (limit,)))

    total = query_count(
        """
        select count(*)::int as total
        from articles
        """
    )
    items = with_article_selection_payload(
        query_all(
            f"{article_select}\nlimit %s\noffset %s",
            (resolved_page_size, offset),
        )
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


def list_system_selected_content_items_page(
    *,
    page: int = 1,
    page_size: int = 20,
    sort: str | None = None,
    q: str | None = None,
) -> dict[str, Any]:
    offset = (page - 1) * page_size
    resolved_sort = normalize_web_content_list_sort(sort)
    resolved_query = normalize_web_content_search_query(q)
    base_select = combined_content_items_select_sql(include_internal_fields=True)
    visible_select = f"select * from ({base_select}) content_items"
    search_clause, search_params = build_web_content_search_clause(
        resolved_query, alias="content_items"
    )
    order_clause = build_web_content_order_clause(resolved_sort, alias="content_items")
    filtered_select = f"""
        {visible_select}
        {search_clause}
    """
    total = query_count(
        f"select count(*)::int as total from ({filtered_select}) counted",
        search_params,
    )
    items = strip_web_content_internal_fields(
        query_all(
            f"""
            {filtered_select}
            {order_clause}
            limit %s
            offset %s
            """,
            tuple([*search_params, page_size, offset]),
        )
    )
    return build_paginated_response(items, page, page_size, total)


@app.get("/collections/system-selected")
def list_system_selected_content_items(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    sort: str | None = Query(default=None),
    q: str | None = Query(default=None),
) -> dict[str, Any]:
    return list_system_selected_content_items_page(
        page=page,
        page_size=page_size,
        sort=sort,
        q=q,
    )


@app.get("/content-items")
def list_content_items(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100, alias="pageSize"),
    sort: str | None = Query(default=None),
    q: str | None = Query(default=None),
) -> dict[str, Any]:
    return list_system_selected_content_items_page(
        page=page,
        page_size=page_size,
        sort=sort,
        q=q,
    )


def get_resource_content_item(resource_id: str) -> dict[str, Any]:
    resource = query_one(
        """
        select
          wr.resource_id::text as origin_id,
          'resource:' || wr.resource_id::text as content_item_id,
          wr.resource_kind as content_kind,
          'resource'::text as origin_type,
          coalesce(wr.final_url, wr.url) as url,
          wr.title,
          wr.summary,
          wr.summary as lead,
          wr.body,
          wr.body_html,
          wr.lang,
          wr.published_at,
          wr.discovered_at as ingested_at,
          wr.updated_at,
          sc.channel_id::text as channel_id,
          sc.name as channel_name,
          sc.name as source_name,
          'kind_enabled'::text as system_selection_decision,
          true as system_selected,
          jsonb_array_length(coalesce(wr.media_json, '[]'::jsonb)) > 0 as has_media,
          wr.media_json -> 0 ->> 'media_kind' as primary_media_kind,
          coalesce(wr.media_json -> 0 ->> 'thumbnail_url', wr.media_json -> 0 ->> 'source_url') as primary_media_url,
          wr.media_json -> 0 ->> 'thumbnail_url' as primary_media_thumbnail_url,
          wr.media_json -> 0 ->> 'source_url' as primary_media_source_url,
          wr.media_json -> 0 ->> 'title' as primary_media_title,
          wr.media_json -> 0 ->> 'alt_text' as primary_media_alt_text,
          wr.classification_json,
          wr.attributes_json,
          wr.documents_json,
          wr.media_json,
          wr.links_out_json,
          wr.child_resources_json,
          wr.raw_payload_json,
          wr.extraction_state,
          wr.extraction_error
        from web_resources wr
        join source_channels sc on sc.channel_id = wr.channel_id
        where wr.resource_id = %s
        """,
        (resource_id,),
    )
    if resource is None:
        raise HTTPException(status_code=404, detail="Content item not found.")
    return resource


@app.get("/content-items/{content_item_id}")
def get_content_item(content_item_id: str) -> dict[str, Any]:
    origin_type, origin_id = parse_content_item_id(content_item_id)
    if origin_type == "editorial":
        article = get_article(origin_id)
        try:
            content_item = get_selected_content_item_preview(content_item_id)
        except HTTPException as exc:
            if exc.status_code != 404:
                raise
            content_item = build_editorial_content_item_preview_from_article(article)
        article.update(content_item)
        article["summary"] = article.get("summary") or article.get("lead")
        article["body_html"] = article.get("body_html") or article.get("full_content_html")
        return article
    content_item = get_selected_content_item_preview(content_item_id)
    resource = get_resource_content_item(origin_id)
    resource.update(content_item)
    return resource


@app.get("/content-items/{content_item_id}/explain")
def get_content_item_explain(content_item_id: str) -> dict[str, Any]:
    origin_type, origin_id = parse_content_item_id(content_item_id)
    content_item = get_content_item(content_item_id)
    if origin_type == "editorial":
        final_selection = query_one(
            """
            select *
            from final_selection_results
            where doc_id = %s
            """,
            (origin_id,),
        )
        system_feed = query_one(
            """
            select *
            from system_feed_results
            where doc_id = %s
            """,
            (origin_id,),
        )
        system_interest_matches = query_all(
            """
            select *
            from criterion_match_results
            where doc_id = %s
            order by created_at desc
            """,
            (origin_id,),
        )
        user_interest_matches = query_all(
            """
            select *
            from interest_match_results
            where doc_id = %s
            order by created_at desc
            """,
            (origin_id,),
        )
        ai_reviews = query_all(
            """
            select *
            from llm_review_log
            where doc_id = %s
            order by created_at desc
            """,
            (origin_id,),
        )
        notifications = query_all(
            """
            select *
            from notification_log
            where doc_id = %s
            order by created_at desc
            """,
            (origin_id,),
        )
        interest_filter_results = query_all(
            """
            select *
            from interest_filter_results
            where doc_id = %s
            order by filter_scope, created_at desc
            """,
            (origin_id,),
        )
        selection_explain = build_selection_explain_payload(
            selection_like=content_item,
            final_selection_result=final_selection,
            system_feed_result=system_feed,
        )
        return {
            "content_item": content_item,
            "system_interest_matches": system_interest_matches,
            "user_interest_matches": user_interest_matches,
            "ai_reviews": ai_reviews,
            "notifications": notifications,
            "interest_filter_results": interest_filter_results,
            "selection_explain": selection_explain,
            "selection_diagnostics": build_selection_diagnostics_payload(
                selection_explain=selection_explain,
                interest_filter_results=interest_filter_results,
                llm_reviews=ai_reviews,
                notifications=notifications,
            ),
            "selection_guidance": build_selection_guidance_payload(
                selection_explain=selection_explain
            ),
        }
    selection_explain = build_content_kind_selection_explain_payload(
        content_like=content_item
    )
    return {
        "content_item": content_item,
        "system_interest_matches": [],
        "user_interest_matches": [],
        "ai_reviews": [],
        "notifications": [],
        "interest_filter_results": [],
        "selection_explain": selection_explain,
        "selection_diagnostics": build_selection_diagnostics_payload(
            selection_explain=selection_explain,
            interest_filter_results=[],
            llm_reviews=[],
            notifications=[],
        ),
        "selection_guidance": build_selection_guidance_payload(
            selection_explain=selection_explain
        ),
    }


def list_web_resources_page(
    *,
    limit: int = 20,
    page: int | None = None,
    page_size: int | None = None,
    channel_id: str | None = None,
    extraction_state: str | None = None,
    projection: str = "all",
    resource_kind: str | None = None,
) -> dict[str, Any] | list[dict[str, Any]]:
    if extraction_state and extraction_state not in WEB_RESOURCE_EXTRACTION_STATES:
        raise HTTPException(status_code=422, detail="Unsupported web resource extractionState.")
    if projection not in WEB_RESOURCE_PROJECTION_FILTERS:
        raise HTTPException(status_code=422, detail="Unsupported web resource projection filter.")
    if resource_kind and resource_kind not in WEB_RESOURCE_KINDS:
        raise HTTPException(status_code=422, detail="Unsupported web resource resourceKind.")

    resource_filters = ["sc.provider_type = 'website'"]
    params: list[Any] = []
    if channel_id:
        resource_filters.append("wr.channel_id = %s")
        params.append(channel_id)
    if extraction_state:
        resource_filters.append("wr.extraction_state = %s")
        params.append(extraction_state)
    if resource_kind:
        resource_filters.append("wr.resource_kind = %s")
        params.append(resource_kind)
    if projection == "projected":
        resource_filters.append("wr.projected_article_id is not null")
    elif projection == "resource_only":
        resource_filters.append("wr.projected_article_id is null")

    where_clause = f"where {' and '.join(resource_filters)}" if resource_filters else ""
    content_item_ready_expr = f"""
        (
          wr.resource_kind <> 'editorial'
          and wr.extraction_state in ('enriched', 'skipped')
          and {system_interest_kind_enabled_clause("wr.resource_kind")}
        )
    """
    resource_select = f"""
        select
          wr.resource_id::text as resource_id,
          sc.channel_id::text as channel_id,
          sc.name as channel_name,
          wr.url,
          wr.final_url,
          wr.normalized_url,
          wr.title,
          wr.summary,
          wr.lang,
          wr.published_at,
          wr.discovered_at,
          wr.updated_at,
          wr.resource_kind,
          wr.discovery_source,
          wr.extraction_state,
          wr.extraction_error,
          wr.projected_article_id::text as projected_article_id,
          pa.title as projected_article_title,
          case
            when {content_item_ready_expr}
            then 'resource:' || wr.resource_id::text
            else null
          end as content_item_id,
          ({content_item_ready_expr}) as content_item_ready,
          sfr.decision as system_feed_decision,
          sfr.eligible_for_feed as system_feed_eligible,
          fsr.final_decision as final_selection_decision,
          fsr.is_selected as final_selection_selected,
          fsr.verification_state as final_selection_verification_state,
          fsr.explain_json ->> 'selectionMode' as final_selection_mode,
          fsr.explain_json ->> 'selectionSummary' as final_selection_summary,
          fsr.explain_json ->> 'selectionReason' as final_selection_reason,
          coalesce(
            nullif(fsr.explain_json -> 'filterCounts' ->> 'llmReviewPending', '')::int,
            0
          ) as final_selection_llm_review_pending_count,
          coalesce(
            nullif(fsr.explain_json -> 'filterCounts' ->> 'hold', '')::int,
            0
          ) as final_selection_hold_count,
          coalesce((fsr.explain_json ->> 'canonicalReviewReused')::boolean, false)
            as final_selection_canonical_review_reused,
          coalesce((fsr.explain_json ->> 'canonicalReviewReusedCount')::int, 0)
            as final_selection_canonical_review_reused_count,
          coalesce((fsr.explain_json ->> 'canonicalSelectionReused')::boolean, false)
            as final_selection_canonical_selection_reused,
          coalesce((fsr.explain_json ->> 'duplicateArticleCountForCanonical')::int, 0)
            as final_selection_duplicate_article_count_for_canonical,
          fsr.explain_json ->> 'selectionReuseSource' as final_selection_reuse_source,
          jsonb_array_length(coalesce(wr.documents_json, '[]'::jsonb))::int as documents_count,
          jsonb_array_length(coalesce(wr.media_json, '[]'::jsonb))::int as media_count,
          jsonb_array_length(coalesce(wr.links_out_json, '[]'::jsonb))::int as links_out_count,
          jsonb_array_length(coalesce(wr.child_resources_json, '[]'::jsonb))::int as child_resources_count
        from web_resources wr
        join source_channels sc on sc.channel_id = wr.channel_id
        left join articles pa on pa.doc_id = wr.projected_article_id
        left join final_selection_results fsr on fsr.doc_id = wr.projected_article_id
        left join system_feed_results sfr on sfr.doc_id = wr.projected_article_id
        {where_clause}
        order by coalesce(wr.published_at, wr.discovered_at) desc nulls last, wr.updated_at desc, wr.resource_id
    """
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, limit
    )
    if not paginate:
        return [
            apply_resource_selection_payload(row)
            for row in query_all(f"{resource_select}\nlimit %s", tuple([*params, limit]))
        ]

    count_sql = """
        select count(*)::int as total
        from web_resources wr
        join source_channels sc on sc.channel_id = wr.channel_id
    """
    if where_clause:
        count_sql = f"{count_sql}\n{where_clause}"
    total = query_count(count_sql, tuple(params))
    items = query_all(
        f"{resource_select}\nlimit %s\noffset %s",
        tuple([*params, resolved_page_size, offset]),
    )
    items = [apply_resource_selection_payload(row) for row in items]
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


@app.get("/maintenance/web-resources")
def list_web_resources(
    limit: int = Query(default=20, ge=1, le=200),
    channel_id: str | None = Query(default=None, alias="channelId"),
    extraction_state: str | None = Query(default=None, alias="extractionState"),
    projection: str = Query(default="all"),
    resource_kind: str | None = Query(default=None, alias="resourceKind"),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=200, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    return list_web_resources_page(
        limit=limit,
        page=page,
        page_size=page_size,
        channel_id=channel_id,
        extraction_state=extraction_state,
        projection=projection,
        resource_kind=resource_kind,
    )


@app.get("/maintenance/web-resources/{resource_id}")
def get_web_resource(resource_id: str) -> dict[str, Any]:
    content_item_ready_expr = f"""
        (
          wr.resource_kind <> 'editorial'
          and wr.extraction_state in ('enriched', 'skipped')
          and {system_interest_kind_enabled_clause("wr.resource_kind")}
        )
    """
    resource = query_one(
        f"""
        select
          wr.resource_id::text as resource_id,
          sc.channel_id::text as channel_id,
          sc.name as channel_name,
          wr.url,
          wr.final_url,
          wr.normalized_url,
          wr.title,
          wr.summary,
          wr.body,
          wr.body_html,
          wr.lang,
          wr.published_at,
          wr.discovered_at,
          wr.updated_at,
          wr.resource_kind,
          wr.discovery_source,
          wr.extraction_state,
          wr.extraction_error,
          wr.projected_article_id::text as projected_article_id,
          pa.title as projected_article_title,
          case
            when {content_item_ready_expr}
            then 'resource:' || wr.resource_id::text
            else null
          end as content_item_id,
          ({content_item_ready_expr}) as content_item_ready,
          sfr.decision as system_feed_decision,
          sfr.eligible_for_feed as system_feed_eligible,
          fsr.final_decision as final_selection_decision,
          fsr.is_selected as final_selection_selected,
          fsr.verification_state as final_selection_verification_state,
          fsr.explain_json ->> 'selectionMode' as final_selection_mode,
          fsr.explain_json ->> 'selectionSummary' as final_selection_summary,
          fsr.explain_json ->> 'selectionReason' as final_selection_reason,
          coalesce(
            nullif(fsr.explain_json -> 'filterCounts' ->> 'llmReviewPending', '')::int,
            0
          ) as final_selection_llm_review_pending_count,
          coalesce(
            nullif(fsr.explain_json -> 'filterCounts' ->> 'hold', '')::int,
            0
          ) as final_selection_hold_count,
          coalesce((fsr.explain_json ->> 'canonicalReviewReused')::boolean, false)
            as final_selection_canonical_review_reused,
          coalesce((fsr.explain_json ->> 'canonicalReviewReusedCount')::int, 0)
            as final_selection_canonical_review_reused_count,
          coalesce((fsr.explain_json ->> 'canonicalSelectionReused')::boolean, false)
            as final_selection_canonical_selection_reused,
          coalesce((fsr.explain_json ->> 'duplicateArticleCountForCanonical')::int, 0)
            as final_selection_duplicate_article_count_for_canonical,
          fsr.explain_json ->> 'selectionReuseSource' as final_selection_reuse_source,
          jsonb_array_length(coalesce(wr.documents_json, '[]'::jsonb))::int as documents_count,
          jsonb_array_length(coalesce(wr.media_json, '[]'::jsonb))::int as media_count,
          jsonb_array_length(coalesce(wr.links_out_json, '[]'::jsonb))::int as links_out_count,
          jsonb_array_length(coalesce(wr.child_resources_json, '[]'::jsonb))::int as child_resources_count,
          wr.classification_json,
          wr.attributes_json,
          wr.documents_json,
          wr.media_json,
          wr.links_out_json,
          wr.child_resources_json,
          wr.raw_payload_json
        from web_resources wr
        join source_channels sc on sc.channel_id = wr.channel_id
        left join articles pa on pa.doc_id = wr.projected_article_id
        left join final_selection_results fsr on fsr.doc_id = wr.projected_article_id
        left join system_feed_results sfr on sfr.doc_id = wr.projected_article_id
        where wr.resource_id = %s
        """,
        (resource_id,),
    )
    if resource is None:
        raise HTTPException(status_code=404, detail="Web resource not found.")
    interest_filter_results: list[dict[str, Any]] = []
    llm_reviews: list[dict[str, Any]] = []
    notifications: list[dict[str, Any]] = []
    projected_article_id = str(resource.get("projected_article_id") or "").strip()
    if projected_article_id:
        interest_filter_results = query_all(
            """
            select *
            from interest_filter_results
            where doc_id = %s
            order by filter_scope, created_at desc
            """,
            (projected_article_id,),
        )
        llm_reviews = query_all(
            """
            select *
            from llm_review_log
            where doc_id = %s
            order by created_at desc
            """,
            (projected_article_id,),
        )
        notifications = query_all(
            """
            select *
            from notification_log
            where doc_id = %s
            order by created_at desc
            """,
            (projected_article_id,),
        )
    return apply_resource_selection_payload(
        resource,
        interest_filter_results=interest_filter_results,
        llm_reviews=llm_reviews,
        notifications=notifications,
    )


@app.get("/maintenance/articles/{doc_id}")
def get_article(doc_id: str) -> dict[str, Any]:
    article = query_one(
        """
        select
          a.*,
          sc.name as channel_name,
          coalesce(a.extracted_source_name, sc.name) as source_name,
          a.extracted_author as author_name,
          a.extracted_ttr_seconds as read_time_seconds,
          pma.asset_id::text as primary_media_asset_id,
          pma.media_kind as primary_media_kind,
          pma.storage_kind as primary_media_storage_kind,
          coalesce(pma.thumbnail_url, pma.source_url) as primary_media_url,
          pma.thumbnail_url as primary_media_thumbnail_url,
          pma.source_url as primary_media_source_url,
          pma.title as primary_media_title,
          pma.alt_text as primary_media_alt_text,
          obs.observation_state,
          obs.duplicate_kind,
          coalesce(fsr.canonical_document_id, obs.canonical_document_id)::text as canonical_document_id,
          cd.canonical_url as canonical_document_url,
          cd.canonical_domain,
          cd.observation_count as canonical_observation_count,
          cd.first_observed_at as canonical_first_observed_at,
          cd.last_observed_at as canonical_last_observed_at,
          vrc.verification_state as canonical_verification_state,
          coalesce(fsr.story_cluster_id, scm.story_cluster_id)::text as story_cluster_id,
          st.primary_title as story_cluster_title,
          st.verification_state as story_cluster_verification_state,
          st.canonical_document_count as story_cluster_document_count,
          st.source_family_count as story_cluster_source_family_count,
          st.corroboration_count as story_cluster_corroboration_count,
          fsr.final_decision as final_selection_decision,
          fsr.is_selected as final_selection_selected,
          fsr.verification_state as final_selection_verification_state,
          fsr.explain_json ->> 'selectionMode' as final_selection_mode,
          fsr.explain_json ->> 'selectionSummary' as final_selection_summary,
          fsr.explain_json ->> 'selectionReason' as final_selection_reason,
          coalesce((fsr.explain_json -> 'filterCounts' ->> 'llmReviewPending')::int, 0)
            as final_selection_llm_review_pending_count,
          coalesce((fsr.explain_json -> 'filterCounts' ->> 'hold')::int, 0)
            as final_selection_hold_count,
          coalesce((fsr.explain_json ->> 'canonicalReviewReused')::boolean, false)
            as final_selection_canonical_review_reused,
          coalesce((fsr.explain_json ->> 'canonicalReviewReusedCount')::int, 0)
            as final_selection_canonical_review_reused_count,
          coalesce((fsr.explain_json ->> 'canonicalSelectionReused')::boolean, false)
            as final_selection_canonical_selection_reused,
          coalesce((fsr.explain_json ->> 'duplicateArticleCountForCanonical')::int, 0)
            as final_selection_duplicate_article_count_for_canonical,
          fsr.explain_json ->> 'selectionReuseSource' as final_selection_reuse_source,
          fsr.verification_target_type,
          fsr.verification_target_id::text as verification_target_id,
          coalesce(ars.like_count, 0) as like_count,
          coalesce(ars.dislike_count, 0) as dislike_count,
          sfr.decision as system_feed_decision,
          coalesce(sfr.eligible_for_feed, false) as system_feed_eligible
        from articles a
        join source_channels sc on sc.channel_id = a.channel_id
        left join document_observations obs
          on obs.origin_type = 'article'
         and obs.origin_id = a.doc_id
        left join final_selection_results fsr on fsr.doc_id = a.doc_id
        left join system_feed_results sfr on sfr.doc_id = a.doc_id
        left join canonical_documents cd
          on cd.canonical_document_id = coalesce(fsr.canonical_document_id, obs.canonical_document_id)
        left join story_cluster_members scm
          on scm.canonical_document_id = cd.canonical_document_id
        left join story_clusters st
          on st.story_cluster_id = coalesce(fsr.story_cluster_id, scm.story_cluster_id)
        left join verification_results vrc
          on vrc.target_type = 'canonical_document'
         and vrc.target_id = cd.canonical_document_id
        left join article_media_assets pma on pma.asset_id = a.primary_media_asset_id
        left join article_reaction_stats ars on ars.doc_id = a.doc_id
        where a.doc_id = %s
        """,
        (doc_id,),
    )
    if article is None:
        raise HTTPException(status_code=404, detail="Article not found.")

    article["media_assets"] = query_all(
        """
        select *
        from article_media_assets
        where doc_id = %s
        order by sort_order, created_at
        """,
        (doc_id,),
    )
    interest_filter_results = query_all(
        """
        select *
        from interest_filter_results
        where doc_id = %s
        order by filter_scope, created_at desc
        """,
        (doc_id,),
    )
    llm_reviews = query_all(
        """
        select *
        from llm_review_log
        where doc_id = %s
        order by created_at desc
        """,
        (doc_id,),
    )
    notifications = query_all(
        """
        select *
        from notification_log
        where doc_id = %s
        order by created_at desc
        """,
        (doc_id,),
    )
    article = apply_article_selection_payload(
        article,
        interest_filter_results=interest_filter_results,
        llm_reviews=llm_reviews,
        notifications=notifications,
    )
    article["enrichment_debug"] = {
        "state": article.get("enrichment_state"),
        "enriched_at": article.get("enriched_at"),
        "full_content_html": article.get("full_content_html"),
        "extracted_description": article.get("extracted_description"),
        "extracted_author": article.get("extracted_author"),
        "extracted_ttr_seconds": article.get("extracted_ttr_seconds"),
        "extracted_image_url": article.get("extracted_image_url"),
        "extracted_favicon_url": article.get("extracted_favicon_url"),
        "extracted_published_at": article.get("extracted_published_at"),
        "extracted_source_name": article.get("extracted_source_name"),
        "raw_payload_json": article.get("raw_payload_json"),
    }
    return article


@app.get("/maintenance/articles/{doc_id}/explain")
def get_article_explain(doc_id: str) -> dict[str, Any]:
    article = get_article(doc_id)
    canonical_document_id = article.get("canonical_document_id")
    story_cluster_id = article.get("story_cluster_id")
    verification_results: list[dict[str, Any]] = []
    if canonical_document_id:
        verification_results.extend(
            query_all(
                """
                select *
                from verification_results
                where target_type = 'canonical_document'
                  and target_id = %s
                order by updated_at desc
                """,
                (canonical_document_id,),
            )
        )
    if story_cluster_id:
        verification_results.extend(
            query_all(
                """
                select *
                from verification_results
                where target_type = 'story_cluster'
                  and target_id = %s
                order by updated_at desc
                """,
                (story_cluster_id,),
            )
        )
    final_selection_result = query_one(
        """
        select *
        from final_selection_results
        where doc_id = %s
        """,
        (doc_id,),
    )
    system_feed_result = query_one(
        """
        select *
        from system_feed_results
        where doc_id = %s
        """,
        (doc_id,),
    )
    criteria_matches = query_all(
        """
        select *
        from criterion_match_results
        where doc_id = %s
        order by created_at desc
        """,
        (doc_id,),
    )
    interest_matches = query_all(
        """
        select *
        from interest_match_results
        where doc_id = %s
        order by created_at desc
        """,
        (doc_id,),
    )
    interest_filter_results = query_all(
        """
        select *
        from interest_filter_results
        where doc_id = %s
        order by filter_scope, created_at desc
        """,
        (doc_id,),
    )
    llm_reviews = query_all(
        """
        select *
        from llm_review_log
        where doc_id = %s
        order by created_at desc
        """,
        (doc_id,),
    )
    notifications = query_all(
        """
        select *
        from notification_log
        where doc_id = %s
        order by created_at desc
        """,
        (doc_id,),
    )
    selection_explain = build_selection_explain_payload(
        selection_like=article,
        final_selection_result=final_selection_result,
        system_feed_result=system_feed_result,
    )
    return {
        "article": article,
        "criteria_matches": criteria_matches,
        "interest_matches": interest_matches,
        "interest_filter_results": interest_filter_results,
        "canonical_document": query_one(
            """
            select *
            from canonical_documents
            where canonical_document_id = %s
            """,
            (canonical_document_id,),
        )
        if canonical_document_id
        else None,
        "story_cluster": query_one(
            """
            select *
            from story_clusters
            where story_cluster_id = %s
            """,
            (story_cluster_id,),
        )
        if story_cluster_id
        else None,
        "verification_results": verification_results,
        "final_selection_result": final_selection_result,
        "system_feed_result": system_feed_result,
        "llm_reviews": llm_reviews,
        "notifications": notifications,
        "selection_explain": selection_explain,
        "selection_diagnostics": build_selection_diagnostics_payload(
            selection_explain=selection_explain,
            interest_filter_results=interest_filter_results,
            llm_reviews=llm_reviews,
            notifications=notifications,
        ),
        "selection_guidance": build_selection_guidance_payload(
            selection_explain=selection_explain
        ),
    }


@app.get("/dashboard/summary")
def get_dashboard_summary() -> dict[str, Any]:
    family_expr = canonical_article_family_expr("a")
    counts = query_one(
        f"""
        select
          (
            select count(*)::int
            from (
              select distinct {family_expr} as family_doc_id
              from articles a
              {final_selection_join_clause("a", "fsr")}
              {system_feed_join_clause("a", "sfr")}
              where {feed_eligible_article_clause("a", "fsr", "sfr")}
            ) deduped
          ) as active_news,
          (select count(*)::int from articles a where {processed_article_clause("a")}) as processed_total,
          (
            select count(*)::int
            from articles a
            where {processed_article_clause("a")}
              and a.ingested_at >= now() - interval '24 hours'
          ) as processed_today,
          (select count(*)::int from users) as total_users,
          (select count(*)::int from source_channels where is_active = true) as active_channels,
          (select count(*)::int from reindex_jobs where status = 'queued') as queued_reindex_jobs,
          (
            select count(*)::int
            from source_channels sc
            left join source_channel_runtime_state scrs on scrs.channel_id = sc.channel_id
            where sc.is_active = true
              and coalesce(
                scrs.next_due_at,
                case
                  when sc.last_fetch_at is null then now()
                  else sc.last_fetch_at + make_interval(secs => sc.poll_interval_seconds)
                end
              ) <= now()
          ) as overdue_channels,
          (
            select count(*)::int
            from source_channels sc
            join source_channel_runtime_state scrs on scrs.channel_id = sc.channel_id
            where sc.is_active = true
              and scrs.effective_poll_interval_seconds > sc.poll_interval_seconds
          ) as adapted_channels,
          (
            select count(*)::int
            from source_channel_runtime_state
            where last_result_kind = 'hard_failure' or consecutive_failures >= 2
          ) as attention_channels,
          (
            select coalesce(percentile_disc(0.5) within group (order by fetch_duration_ms), 0)::int
            from channel_fetch_runs
            where started_at >= now() - interval '24 hours'
          ) as fetch_median_duration_ms_24h,
          (
            select count(*)::int
            from channel_fetch_runs
            where started_at >= now() - interval '24 hours'
              and outcome_kind = 'new_content'
          ) as fetch_new_content_24h,
          (
            select count(*)::int
            from channel_fetch_runs
            where started_at >= now() - interval '24 hours'
              and outcome_kind = 'no_change'
          ) as fetch_no_change_24h,
          (
            select count(*)::int
            from channel_fetch_runs
            where started_at >= now() - interval '24 hours'
              and outcome_kind in ('rate_limited', 'transient_failure', 'hard_failure')
          ) as fetch_failures_24h,
          (
            select count(*)::int
            from llm_review_log
            where created_at >= now() - interval '24 hours'
          ) as llm_review_count_24h,
          (
            select coalesce(sum(total_tokens), 0)::int
            from llm_review_log
            where created_at >= now() - interval '24 hours'
          ) as llm_total_tokens_24h,
          (
            select coalesce(sum(cost_estimate_usd), 0)::float
            from llm_review_log
            where created_at >= now() - interval '24 hours'
          ) as llm_cost_usd_24h
        """
    )
    budget_summary = get_llm_budget_summary()
    return {
        **(counts or {}),
        "llm_review_enabled": budget_summary["enabled"],
        "llm_monthly_budget_cents": budget_summary["monthlyBudgetCents"],
        "llm_month_to_date_cost_usd": budget_summary["monthToDateCostUsd"],
        "llm_month_to_date_cost_cents": budget_summary["monthToDateCostCents"],
        "llm_remaining_monthly_budget_cents": budget_summary["remainingMonthlyBudgetCents"],
        "llm_monthly_quota_reached": budget_summary["monthlyQuotaReached"],
        "llm_accept_gray_zone_on_budget_exhaustion": budget_summary[
            "acceptGrayZoneOnBudgetExhaustion"
        ],
    }


@app.get("/channels")
def list_channels(
    provider_type: str | None = Query(default=None, alias="providerType"),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    channel_filters: list[str] = []
    params: list[Any] = []
    if provider_type:
        channel_filters.append("sc.provider_type = %s")
        params.append(provider_type)

    where_clause = f"where {' and '.join(channel_filters)}" if channel_filters else ""
    channel_select = f"""
        select
          sc.channel_id,
          sc.name,
          sc.provider_type,
          sc.fetch_url,
          sc.language,
          sc.is_active,
          sc.poll_interval_seconds,
          sc.enrichment_enabled,
          sc.enrichment_min_body_length,
          sc.config_json,
          (coalesce(sc.auth_config_json ->> 'authorizationHeader', '') <> '') as has_authorization_header,
          sc.last_fetch_at,
          sc.last_success_at,
          sc.last_error_at,
          sc.last_error_message,
          coalesce(scrs.adaptive_enabled, true) as adaptive_enabled,
          coalesce(scrs.effective_poll_interval_seconds, sc.poll_interval_seconds) as effective_poll_interval_seconds,
          coalesce(scrs.max_poll_interval_seconds, least(sc.poll_interval_seconds * 16, 259200)) as max_poll_interval_seconds,
          coalesce(
            scrs.next_due_at,
            case
              when sc.last_fetch_at is null then now()
              else sc.last_fetch_at + make_interval(secs => sc.poll_interval_seconds)
            end
          ) as next_due_at,
          scrs.adaptive_step,
          scrs.last_result_kind,
          scrs.consecutive_no_change_polls,
          scrs.consecutive_failures,
          scrs.adaptive_reason,
          greatest(
            0,
            extract(
              epoch from (
                now() - coalesce(
                  scrs.next_due_at,
                  case
                    when sc.last_fetch_at is null then now()
                    else sc.last_fetch_at + make_interval(secs => sc.poll_interval_seconds)
                  end
                )
              )
            )
          )::int as overdue_seconds,
          (
            coalesce(scrs.last_result_kind, '') = 'hard_failure'
            or coalesce(scrs.consecutive_failures, 0) >= 2
          ) as needs_attention,
          last_run.started_at as last_run_started_at,
          last_run.outcome_kind as last_run_outcome_kind,
          last_run.fetch_duration_ms as last_run_duration_ms,
          last_run.error_text as last_run_error_text,
          recent_runs.recent_failure_count_24h,
          channel_item_counts.stored_item_count,
          sp.provider_id,
          sp.name as provider_name
        from source_channels sc
        left join source_providers sp on sp.provider_id = sc.provider_id
        left join source_channel_runtime_state scrs on scrs.channel_id = sc.channel_id
        left join lateral (
          select
            started_at,
            outcome_kind,
            fetch_duration_ms,
            error_text
          from channel_fetch_runs cfr
          where cfr.channel_id = sc.channel_id
          order by cfr.started_at desc
          limit 1
        ) last_run on true
        left join lateral (
          select
            count(*) filter (
              where outcome_kind in ('rate_limited', 'transient_failure', 'hard_failure')
            )::int as recent_failure_count_24h
          from channel_fetch_runs cfr
          where cfr.channel_id = sc.channel_id
            and cfr.started_at >= now() - interval '24 hours'
        ) recent_runs on true
        left join lateral (
          select (
            coalesce(
              (
                select count(*)::int
                from articles a
                where a.channel_id = sc.channel_id
              ),
              0
            )
            +
            coalesce(
              (
                select count(*)::int
                from web_resources wr
                where wr.channel_id = sc.channel_id
                  and wr.projected_article_id is null
              ),
              0
            )
          )::int as stored_item_count
        ) channel_item_counts on true
        {where_clause}
        order by sc.updated_at desc, sc.created_at desc
    """
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, 20
    )
    if not paginate:
        return [
            with_resolved_channel_adapter_fields(item)
            for item in query_all(channel_select, tuple(params))
        ]

    count_sql = "select count(*)::int as total from source_channels sc"
    if where_clause:
        count_sql = f"{count_sql}\n{where_clause}"
    total = query_count(count_sql, tuple(params))
    items = [
        with_resolved_channel_adapter_fields(item)
        for item in query_all(
            f"{channel_select}\nlimit %s\noffset %s",
            tuple([*params, resolved_page_size, offset]),
        )
    ]
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


@app.get("/channels/{channel_id}")
def get_channel(channel_id: str) -> dict[str, Any]:
    channel = query_one(
        """
        select
          sc.channel_id,
          sc.name,
          sc.provider_type,
          sc.fetch_url,
          sc.language,
          sc.is_active,
          sc.poll_interval_seconds,
          sc.enrichment_enabled,
          sc.enrichment_min_body_length,
          sc.config_json,
          (coalesce(sc.auth_config_json ->> 'authorizationHeader', '') <> '') as has_authorization_header,
          sc.last_fetch_at,
          sc.last_success_at,
          sc.last_error_at,
          sc.last_error_message,
          coalesce(scrs.adaptive_enabled, true) as adaptive_enabled,
          coalesce(scrs.effective_poll_interval_seconds, sc.poll_interval_seconds) as effective_poll_interval_seconds,
          coalesce(scrs.max_poll_interval_seconds, least(sc.poll_interval_seconds * 16, 259200)) as max_poll_interval_seconds,
          coalesce(
            scrs.next_due_at,
            case
              when sc.last_fetch_at is null then now()
              else sc.last_fetch_at + make_interval(secs => sc.poll_interval_seconds)
            end
          ) as next_due_at,
          scrs.adaptive_step,
          scrs.last_result_kind,
          scrs.consecutive_no_change_polls,
          scrs.consecutive_failures,
          scrs.adaptive_reason,
          greatest(
            0,
            extract(
              epoch from (
                now() - coalesce(
                  scrs.next_due_at,
                  case
                    when sc.last_fetch_at is null then now()
                    else sc.last_fetch_at + make_interval(secs => sc.poll_interval_seconds)
                  end
                )
              )
            )
          )::int as overdue_seconds,
          (
            coalesce(scrs.last_result_kind, '') = 'hard_failure'
            or coalesce(scrs.consecutive_failures, 0) >= 2
          ) as needs_attention,
          (
            coalesce(
              (
                select count(*)::int
                from articles a
                where a.channel_id = sc.channel_id
              ),
              0
            )
            +
            coalesce(
              (
                select count(*)::int
                from web_resources wr
                where wr.channel_id = sc.channel_id
                  and wr.projected_article_id is null
              ),
              0
            )
          )::int as stored_item_count,
          sp.provider_id,
          sp.name as provider_name
        from source_channels sc
        left join source_providers sp on sp.provider_id = sc.provider_id
        left join source_channel_runtime_state scrs on scrs.channel_id = sc.channel_id
        where sc.channel_id = %s
        """,
        (channel_id,),
    )
    if channel is None:
        raise HTTPException(status_code=404, detail="Channel not found.")
    return with_resolved_channel_adapter_fields(channel)


@app.get("/clusters")
def list_clusters(
    limit: int = Query(default=20, ge=1, le=100),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    cluster_select = """
        select
          ec.*,
          (
            select json_agg(ecm.doc_id order by ecm.created_at desc)
            from event_cluster_members ecm
            where ecm.cluster_id = ec.cluster_id
          ) as doc_ids
        from event_clusters ec
        order by ec.max_published_at desc nulls last, ec.updated_at desc
    """
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, limit
    )
    if not paginate:
        return query_all(f"{cluster_select}\nlimit %s", (limit,))

    total = query_count(
        """
        select count(*)::int as total
        from event_clusters
        """
    )
    items = query_all(
        f"{cluster_select}\nlimit %s\noffset %s",
        (resolved_page_size, offset),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


@app.get("/users/{user_id}/interests")
def list_user_interests(
    user_id: str,
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    interest_select = """
        select
          ui.*,
          uic.compiled_json,
          uic.compiled_at,
          uic.error_text
        from user_interests ui
        left join user_interests_compiled uic on uic.interest_id = ui.interest_id
        where ui.user_id = %s
        order by ui.updated_at desc
    """
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, 20
    )
    if not paginate:
        return query_all(interest_select, (user_id,))

    total = query_count(
        """
        select count(*)::int as total
        from user_interests
        where user_id = %s
        """,
        (user_id,),
    )
    items = query_all(
        f"{interest_select}\nlimit %s\noffset %s",
        (user_id, resolved_page_size, offset),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


@app.get("/users/{user_id}/matches")
def list_user_matches(
    user_id: str,
    limit: int = Query(default=20, ge=1, le=100),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
    sort: str | None = Query(default=None),
    q: str | None = Query(default=None),
) -> dict[str, Any] | list[dict[str, Any]]:
    family_expr = canonical_article_family_expr("a")
    ranked_match_select = f"""
        select
          {repr('editorial:')} || a.doc_id::text as content_item_id,
          'editorial'::text as content_kind,
          'editorial'::text as origin_type,
          a.doc_id::text as origin_id,
          a.url,
          a.title,
          a.lead as summary,
          a.lead,
          a.lang,
          a.published_at,
          a.ingested_at,
          a.updated_at,
          a.has_media,
          coalesce(a.extracted_source_name, sc.name) as source_name,
          a.extracted_author as author_name,
          a.extracted_ttr_seconds as read_time_seconds,
          pma.media_kind as primary_media_kind,
          coalesce(pma.thumbnail_url, pma.source_url) as primary_media_url,
          pma.thumbnail_url as primary_media_thumbnail_url,
          pma.source_url as primary_media_source_url,
          pma.title as primary_media_title,
          pma.alt_text as primary_media_alt_text,
          coalesce(ars.like_count, 0) as like_count,
          coalesce(ars.dislike_count, 0) as dislike_count,
          {effective_system_selection_decision_expr("fsr", "sfr")} as system_selection_decision,
          {effective_system_selected_expr("fsr", "sfr")} as system_selected,
          imr.interest_id::text as matched_interest_id,
          ui.description as matched_interest_description,
          imr.score_interest as interest_match_score,
          imr.decision as interest_match_decision,
          nullif(lower(btrim(coalesce(a.title, ''))), '') as _normalized_title,
          concat_ws(' ', coalesce(a.title, ''), coalesce(a.lead, ''), coalesce(a.body, '')) as _search_text,
          row_number() over (
            partition by {family_expr}
            order by
              imr.score_interest desc nulls last,
              imr.created_at desc,
              case when a.doc_id = {family_expr} then 0 else 1 end,
              a.published_at desc nulls last,
              a.ingested_at desc,
              a.doc_id
          ) as family_rank
        from interest_match_results imr
        join articles a on a.doc_id = imr.doc_id
        join source_channels sc on sc.channel_id = a.channel_id
        join user_interests ui on ui.interest_id = imr.interest_id
        {final_selection_join_clause("a", "fsr")}
        {system_feed_join_clause("a", "sfr")}
        {primary_media_join_clause("a", "pma")}
        left join article_reaction_stats ars on ars.doc_id = a.doc_id
        where imr.user_id = %s
          and imr.decision = 'notify'
          and {feed_eligible_article_clause("a", "fsr", "sfr")}
    """
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, limit
    )
    ranked_params: tuple[Any, ...] = (user_id,)
    deduped_select = f"""
        select
          matched.content_item_id,
          matched.content_kind,
          matched.origin_type,
          matched.origin_id,
          matched.url,
          matched.title,
          matched.summary,
          matched.lead,
          matched.lang,
          matched.published_at,
          matched.ingested_at,
          matched.updated_at,
          matched.system_selection_decision,
          matched.system_selected,
          matched.has_media,
          matched.source_name,
          matched.author_name,
          matched.read_time_seconds,
          matched.primary_media_kind,
          matched.primary_media_url,
          matched.primary_media_thumbnail_url,
          matched.primary_media_source_url,
          matched.primary_media_title,
          matched.primary_media_alt_text,
          matched.like_count,
          matched.dislike_count,
          matched.matched_interest_id,
          matched.matched_interest_description,
          matched.interest_match_score,
          matched.interest_match_decision,
          matched._normalized_title,
          matched._search_text
        from ({ranked_match_select}) matched
        where matched.family_rank = 1
    """
    resolved_sort = normalize_web_content_list_sort(sort)
    resolved_query = normalize_web_content_search_query(q)
    if not paginate:
        visible_matches_select = f"select * from ({deduped_select}) matched_items"
        search_clause, search_params = build_web_content_search_clause(
            resolved_query, alias="matched_items"
        )
        order_clause = build_web_content_order_clause(resolved_sort, alias="matched_items")
        return strip_web_content_internal_fields(
            query_all(
                f"""
                {visible_matches_select}
                {search_clause}
                {order_clause}
                limit %s
                """,
                tuple([*ranked_params, *search_params, limit]),
            )
        )

    visible_matches_select = f"select * from ({deduped_select}) matched_items"
    search_clause, search_params = build_web_content_search_clause(
        resolved_query, alias="matched_items"
    )
    order_clause = build_web_content_order_clause(resolved_sort, alias="matched_items")
    filtered_select = f"""
        {visible_matches_select}
        {search_clause}
    """
    total = query_count(
        f"select count(*)::int as total from ({filtered_select}) counted",
        tuple([*ranked_params, *search_params]),
    )
    items = strip_web_content_internal_fields(
        query_all(
            f"""
            {filtered_select}
            {order_clause}
            limit %s
            offset %s
            """,
            tuple([*ranked_params, *search_params, resolved_page_size, offset]),
        )
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


@app.get("/users/{user_id}/notifications")
def list_user_notifications(
    user_id: str,
    limit: int = Query(default=20, ge=1, le=100),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    notification_select = """
        select
          nl.*,
          a.title as article_title,
          a.lead as article_lead
        from notification_log nl
        join articles a on a.doc_id = nl.doc_id
        where nl.user_id = %s
        order by nl.created_at desc
    """
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, limit
    )
    if not paginate:
        return query_all(f"{notification_select}\nlimit %s", (user_id, limit))

    total = query_count(
        """
        select count(*)::int as total
        from notification_log
        where user_id = %s
        """,
        (user_id,),
    )
    items = query_all(
        f"{notification_select}\nlimit %s\noffset %s",
        (user_id, resolved_page_size, offset),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


@app.get("/templates/llm")
def list_llm_templates(
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    llm_template_select = """
        select *
        from llm_prompt_templates
        order by is_active desc, updated_at desc
    """
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, 20
    )
    if not paginate:
        return query_all(llm_template_select)

    total = query_count(
        """
        select count(*)::int as total
        from llm_prompt_templates
        """
    )
    items = query_all(
        f"{llm_template_select}\nlimit %s\noffset %s",
        (resolved_page_size, offset),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


@app.get("/templates/llm/{prompt_template_id}")
def get_llm_template(prompt_template_id: str) -> dict[str, Any]:
    template = query_one(
        """
        select *
        from llm_prompt_templates
        where prompt_template_id = %s
        """,
        (prompt_template_id,),
    )
    if template is None:
        raise HTTPException(status_code=404, detail="LLM template not found.")
    return template


@app.get("/system-interests")
def list_system_interests(
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    interest_template_select = """
        select
          it.interest_template_id,
          it.name,
          it.description,
          it.positive_texts,
          it.negative_texts,
          it.must_have_terms,
          it.must_not_have_terms,
          it.places,
          it.languages_allowed,
          it.time_window_hours,
          coalesce(
            it.allowed_content_kinds,
            '["editorial","listing","entity","document","data_file","api_payload"]'::jsonb
          ) as allowed_content_kinds,
          it.short_tokens_required,
          it.short_tokens_forbidden,
          it.priority,
          it.is_active,
          it.created_at,
          it.updated_at,
          sp.selection_profile_id::text as selection_profile_id,
          sp.profile_family as selection_profile_family,
          sp.status as selection_profile_status,
          sp.version as selection_profile_version,
          sp.definition_json as selection_profile_definition_json,
          sp.policy_json as selection_profile_policy_json
        from interest_templates it
        left join selection_profiles sp
          on sp.source_interest_template_id = it.interest_template_id
        order by it.is_active desc, it.updated_at desc, it.created_at desc
    """
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, 20
    )
    if not paginate:
        return [
            normalize_system_interest_selection_profile_payload(item)
            for item in query_all(interest_template_select)
        ]

    total = query_count(
        """
        select count(*)::int as total
        from interest_templates it
        """
    )
    items = query_all(
        f"{interest_template_select}\nlimit %s\noffset %s",
        (resolved_page_size, offset),
    )
    return build_paginated_response(
        [
            normalize_system_interest_selection_profile_payload(item)
            for item in items
        ],
        resolved_page,
        resolved_page_size,
        total,
    )


@app.get("/system-interests/{interest_template_id}")
def get_system_interest(interest_template_id: str) -> dict[str, Any]:
    template = query_one(
        """
        select
          it.interest_template_id,
          it.name,
          it.description,
          it.positive_texts,
          it.negative_texts,
          it.must_have_terms,
          it.must_not_have_terms,
          it.places,
          it.languages_allowed,
          it.time_window_hours,
          coalesce(
            it.allowed_content_kinds,
            '["editorial","listing","entity","document","data_file","api_payload"]'::jsonb
          ) as allowed_content_kinds,
          it.short_tokens_required,
          it.short_tokens_forbidden,
          it.priority,
          it.is_active,
          it.created_at,
          it.updated_at,
          sp.selection_profile_id::text as selection_profile_id,
          sp.profile_family as selection_profile_family,
          sp.status as selection_profile_status,
          sp.version as selection_profile_version,
          sp.definition_json as selection_profile_definition_json,
          sp.policy_json as selection_profile_policy_json
        from interest_templates it
        left join selection_profiles sp
          on sp.source_interest_template_id = it.interest_template_id
        where it.interest_template_id = %s
        """,
        (interest_template_id,),
    )
    if template is None:
        raise HTTPException(status_code=404, detail="System interest not found.")
    return normalize_system_interest_selection_profile_payload(template)


@app.get("/maintenance/reindex-jobs")
def list_reindex_jobs(
    limit: int = Query(default=20, ge=1, le=100),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    reindex_select = """
        select *
        from reindex_jobs
        order by requested_at desc
    """
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, limit
    )
    if not paginate:
        items = query_all(f"{reindex_select}\nlimit %s", (limit,))
        return [apply_reindex_selection_profile_payload(item) for item in items]

    total = query_count(
        """
        select count(*)::int as total
        from reindex_jobs
        """
    )
    items = query_all(
        f"{reindex_select}\nlimit %s\noffset %s",
        (resolved_page_size, offset),
    )
    items = [apply_reindex_selection_profile_payload(item) for item in items]
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


@app.get("/maintenance/sequences")
def list_sequences(
    limit: int = Query(default=20, ge=1, le=100),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    return list_sequences_page(limit=limit, page=page, page_size=page_size)


@app.get("/maintenance/sequences/{sequence_id}")
def get_sequence(sequence_id: str) -> dict[str, Any]:
    try:
        return get_sequence_definition(sequence_id)
    except SequenceNotFoundError as error:
        raise_sequence_http_exception(error)


@app.post("/maintenance/sequences", status_code=201)
def create_sequence(payload: SequenceCreatePayload) -> dict[str, Any]:
    try:
        return create_sequence_definition(payload)
    except (
        SequenceConflictError,
        SequenceValidationError,
    ) as error:
        raise_sequence_http_exception(error)


@app.patch("/maintenance/sequences/{sequence_id}")
def update_sequence(
    sequence_id: str,
    payload: SequenceUpdatePayload,
) -> dict[str, Any]:
    try:
        return update_sequence_definition(sequence_id, payload)
    except (
        SequenceConflictError,
        SequenceNotFoundError,
        SequenceValidationError,
    ) as error:
        raise_sequence_http_exception(error)


@app.delete("/maintenance/sequences/{sequence_id}")
def delete_sequence(sequence_id: str) -> dict[str, Any]:
    try:
        return archive_sequence_definition(sequence_id)
    except SequenceNotFoundError as error:
        raise_sequence_http_exception(error)


@app.get("/maintenance/sequence-plugins")
def get_sequence_plugins() -> list[dict[str, Any]]:
    return list_sequence_plugins()


@app.post("/maintenance/articles/{doc_id}/enrichment/retry", status_code=202)
def request_article_enrichment_retry_route(
    doc_id: str,
    payload: ArticleEnrichmentRetryPayload | None = None,
) -> dict[str, Any]:
    try:
        return request_article_enrichment_retry(
            doc_id,
            payload or ArticleEnrichmentRetryPayload.model_validate({}),
        )
    except (
        SequenceConflictError,
        SequenceDispatchError,
        SequenceNotFoundError,
        SequenceValidationError,
    ) as error:
        raise_sequence_http_exception(error)


@app.post("/maintenance/content-items/{content_item_id}/enrichment/retry", status_code=202)
def request_content_item_enrichment_retry_route(
    content_item_id: str,
    payload: ArticleEnrichmentRetryPayload | None = None,
) -> dict[str, Any]:
    origin_type, origin_id = parse_content_item_id(content_item_id)
    if origin_type != "editorial":
        raise HTTPException(
            status_code=409,
            detail="Manual retry is only supported for editorial content items in the current runtime.",
        )
    return request_article_enrichment_retry_route(origin_id, payload)


@app.get("/maintenance/discovery/summary")
def get_discovery_summary_route() -> dict[str, Any]:
    return get_discovery_summary()


@app.get("/maintenance/discovery/classes")
def list_discovery_classes(
    limit: int = Query(default=20, ge=1, le=100),
    status: str | None = Query(default=None),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    if status is not None and status not in DISCOVERY_CLASS_STATUSES:
        raise HTTPException(status_code=422, detail=f"Unsupported discovery class status {status!r}.")
    return list_discovery_classes_page(limit=limit, page=page, page_size=page_size, status=status)


@app.post("/maintenance/discovery/classes", status_code=201)
def create_discovery_class_route(payload: DiscoveryHypothesisClassCreatePayload) -> dict[str, Any]:
    try:
        return create_discovery_class(payload)
    except SequenceConflictError as error:
        raise_sequence_http_exception(error)


@app.get("/maintenance/discovery/classes/{class_key}")
def get_discovery_class_route(class_key: str) -> dict[str, Any]:
    try:
        return get_discovery_class(class_key)
    except SequenceNotFoundError as error:
        raise_sequence_http_exception(error)


@app.patch("/maintenance/discovery/classes/{class_key}")
def update_discovery_class_route(
    class_key: str,
    payload: DiscoveryHypothesisClassUpdatePayload,
) -> dict[str, Any]:
    try:
        return update_discovery_class(class_key, payload)
    except (SequenceNotFoundError, SequenceValidationError) as error:
        raise_sequence_http_exception(error)


@app.delete("/maintenance/discovery/classes/{class_key}")
def delete_discovery_class_route(class_key: str) -> dict[str, Any]:
    try:
        return delete_discovery_class(class_key)
    except (SequenceConflictError, SequenceNotFoundError) as error:
        raise_sequence_http_exception(error)


@app.get("/maintenance/discovery/missions")
def list_discovery_missions(
    limit: int = Query(default=20, ge=1, le=100),
    status: str | None = Query(default=None),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    if status is not None and status not in DISCOVERY_MISSION_STATUSES:
        raise HTTPException(status_code=422, detail=f"Unsupported discovery mission status {status!r}.")
    return list_discovery_missions_page(limit=limit, page=page, page_size=page_size, status=status)


@app.post("/maintenance/discovery/missions", status_code=201)
def create_discovery_mission_route(payload: DiscoveryMissionCreatePayload) -> dict[str, Any]:
    return create_discovery_mission(payload)


@app.get("/maintenance/discovery/recall-missions")
def list_discovery_recall_missions(
    limit: int = Query(default=20, ge=1, le=100),
    status: str | None = Query(default=None),
    mission_kind: str | None = Query(default=None, alias="missionKind"),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    if status is not None and status not in DISCOVERY_RECALL_MISSION_STATUSES:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported discovery recall mission status {status!r}.",
        )
    if mission_kind is not None and mission_kind not in DISCOVERY_RECALL_MISSION_KINDS:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported discovery recall mission kind {mission_kind!r}.",
        )
    return list_discovery_recall_missions_page(
        limit=limit,
        page=page,
        page_size=page_size,
        status=status,
        mission_kind=mission_kind,
    )


@app.post("/maintenance/discovery/recall-missions", status_code=201)
def create_discovery_recall_mission_route(
    payload: DiscoveryRecallMissionCreatePayload,
) -> dict[str, Any]:
    return create_discovery_recall_mission(payload)


@app.get("/maintenance/discovery/recall-missions/{recall_mission_id}")
def get_discovery_recall_mission_route(recall_mission_id: str) -> dict[str, Any]:
    try:
        return get_discovery_recall_mission(recall_mission_id)
    except SequenceNotFoundError as error:
        raise_sequence_http_exception(error)


@app.patch("/maintenance/discovery/recall-missions/{recall_mission_id}")
def update_discovery_recall_mission_route(
    recall_mission_id: str,
    payload: DiscoveryRecallMissionUpdatePayload,
) -> dict[str, Any]:
    try:
        return update_discovery_recall_mission(recall_mission_id, payload)
    except (SequenceNotFoundError, SequenceValidationError) as error:
        raise_sequence_http_exception(error)


@app.post("/maintenance/discovery/recall-missions/{recall_mission_id}/acquire")
async def request_discovery_recall_mission_acquisition_route(
    recall_mission_id: str,
) -> dict[str, Any]:
    try:
        return await request_discovery_recall_mission_acquisition(recall_mission_id)
    except (SequenceNotFoundError, SequenceValidationError) as error:
        raise_sequence_http_exception(error)


@app.get("/maintenance/discovery/missions/{mission_id}")
def get_discovery_mission_route(mission_id: str) -> dict[str, Any]:
    try:
        return get_discovery_mission(mission_id)
    except SequenceNotFoundError as error:
        raise_sequence_http_exception(error)


@app.patch("/maintenance/discovery/missions/{mission_id}")
def update_discovery_mission_route(
    mission_id: str,
    payload: DiscoveryMissionUpdatePayload,
) -> dict[str, Any]:
    try:
        return update_discovery_mission(mission_id, payload)
    except (SequenceNotFoundError, SequenceValidationError) as error:
        raise_sequence_http_exception(error)


@app.delete("/maintenance/discovery/missions/{mission_id}")
def delete_discovery_mission_route(mission_id: str) -> dict[str, Any]:
    try:
        return delete_discovery_mission(mission_id)
    except (SequenceConflictError, SequenceNotFoundError) as error:
        raise_sequence_http_exception(error)


@app.post("/maintenance/discovery/missions/{mission_id}/compile-graph")
async def compile_discovery_mission_graph_route(mission_id: str) -> dict[str, Any]:
    try:
        return await compile_discovery_mission_graph(mission_id)
    except (SequenceConflictError, SequenceNotFoundError) as error:
        raise_sequence_http_exception(error)


@app.post("/maintenance/discovery/missions/{mission_id}/run", status_code=202)
def request_discovery_mission_run_route(
    mission_id: str,
    payload: DiscoveryMissionRunPayload | None = None,
) -> dict[str, Any]:
    try:
        return request_discovery_mission_run(
            mission_id,
            payload or DiscoveryMissionRunPayload.model_validate({}),
        )
    except (
        SequenceConflictError,
        SequenceDispatchError,
        SequenceNotFoundError,
        SequenceValidationError,
    ) as error:
        raise_sequence_http_exception(error)


@app.get("/maintenance/discovery/candidates")
def list_discovery_candidates(
    limit: int = Query(default=50, ge=1, le=200),
    mission_id: str | None = Query(default=None, alias="missionId"),
    status: str | None = Query(default=None),
    provider_type: str | None = Query(default=None, alias="providerType"),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=200, alias="pageSize"),
    ) -> dict[str, Any] | list[dict[str, Any]]:
    if status is not None and status not in DISCOVERY_CANDIDATE_STATUSES:
        raise HTTPException(status_code=422, detail=f"Unsupported discovery candidate status {status!r}.")
    if provider_type is not None and provider_type not in DISCOVERY_PROVIDER_TYPES:
        raise HTTPException(status_code=422, detail=f"Unsupported discovery provider type {provider_type!r}.")
    return list_discovery_candidates_page(
        limit=limit,
        page=page,
        page_size=page_size,
        mission_id=mission_id,
        status=status,
        provider_type=provider_type,
    )


@app.get("/maintenance/discovery/recall-candidates")
def list_discovery_recall_candidates(
    limit: int = Query(default=50, ge=1, le=200),
    recall_mission_id: str | None = Query(default=None, alias="recallMissionId"),
    status: str | None = Query(default=None),
    provider_type: str | None = Query(default=None, alias="providerType"),
    canonical_domain_value: str | None = Query(default=None, alias="canonicalDomain"),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=200, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    if status is not None and status not in DISCOVERY_RECALL_CANDIDATE_STATUSES:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported discovery recall candidate status {status!r}.",
        )
    if provider_type is not None and provider_type not in DISCOVERY_PROVIDER_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported discovery provider type {provider_type!r}.",
        )
    return list_discovery_recall_candidates_page(
        limit=limit,
        page=page,
        page_size=page_size,
        recall_mission_id=recall_mission_id,
        status=status,
        provider_type=provider_type,
        canonical_domain_value=canonical_domain_value,
    )


@app.post("/maintenance/discovery/recall-candidates", status_code=201)
def create_discovery_recall_candidate_route(
    payload: DiscoveryRecallCandidateCreatePayload,
) -> dict[str, Any]:
    try:
        return create_discovery_recall_candidate(payload)
    except (SequenceNotFoundError, SequenceValidationError, SequenceConflictError) as error:
        raise_sequence_http_exception(error)


@app.get("/maintenance/discovery/recall-candidates/{recall_candidate_id}")
def get_discovery_recall_candidate_route(recall_candidate_id: str) -> dict[str, Any]:
    try:
        return get_discovery_recall_candidate(recall_candidate_id)
    except SequenceNotFoundError as error:
        raise_sequence_http_exception(error)


@app.post("/maintenance/discovery/recall-candidates/{recall_candidate_id}/promote")
def promote_discovery_recall_candidate_route(
    recall_candidate_id: str,
    payload: DiscoveryRecallCandidatePromotePayload | None = None,
) -> dict[str, Any]:
    try:
        return promote_discovery_recall_candidate(
            recall_candidate_id,
            payload or DiscoveryRecallCandidatePromotePayload.model_validate({}),
        )
    except (
        SequenceConflictError,
        SequenceNotFoundError,
        SequenceValidationError,
    ) as error:
        raise_sequence_http_exception(error)


@app.patch("/maintenance/discovery/recall-candidates/{recall_candidate_id}")
def update_discovery_recall_candidate_route(
    recall_candidate_id: str,
    payload: DiscoveryRecallCandidateUpdatePayload,
) -> dict[str, Any]:
    try:
        return update_discovery_recall_candidate(recall_candidate_id, payload)
    except (SequenceNotFoundError, SequenceValidationError) as error:
        raise_sequence_http_exception(error)


@app.get("/maintenance/discovery/candidates/{candidate_id}")
def get_discovery_candidate_route(candidate_id: str) -> dict[str, Any]:
    try:
        return get_discovery_candidate(candidate_id)
    except SequenceNotFoundError as error:
        raise_sequence_http_exception(error)


@app.patch("/maintenance/discovery/candidates/{candidate_id}")
def update_discovery_candidate_route(
    candidate_id: str,
    payload: DiscoveryCandidateUpdatePayload,
) -> dict[str, Any]:
    try:
        return update_discovery_candidate(candidate_id, payload)
    except (SequenceNotFoundError, SequenceValidationError) as error:
        raise_sequence_http_exception(error)


@app.get("/maintenance/discovery/hypotheses")
def list_discovery_hypotheses(
    limit: int = Query(default=50, ge=1, le=200),
    mission_id: str | None = Query(default=None, alias="missionId"),
    status: str | None = Query(default=None),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=200, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    if status is not None and status not in DISCOVERY_HYPOTHESIS_STATUSES:
        raise HTTPException(status_code=422, detail=f"Unsupported discovery hypothesis status {status!r}.")
    return list_discovery_hypotheses_page(
        limit=limit,
        page=page,
        page_size=page_size,
        mission_id=mission_id,
        status=status,
    )


@app.get("/maintenance/discovery/hypotheses/{hypothesis_id}")
def get_discovery_hypothesis_route(hypothesis_id: str) -> dict[str, Any]:
    try:
        return get_discovery_hypothesis(hypothesis_id)
    except SequenceNotFoundError as error:
        raise_sequence_http_exception(error)


@app.get("/maintenance/discovery/source-profiles")
def list_discovery_source_profiles(
    limit: int = Query(default=50, ge=1, le=200),
    min_trust_score: float | None = Query(default=None, alias="minTrustScore"),
    source_type: str | None = Query(default=None, alias="sourceType"),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=200, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    return list_discovery_source_profiles_page(
        limit=limit,
        page=page,
        page_size=page_size,
        min_trust_score=min_trust_score,
        source_type=source_type,
    )


@app.get("/maintenance/discovery/source-profiles/{source_profile_id}")
def get_discovery_source_profile_route(source_profile_id: str) -> dict[str, Any]:
    try:
        return get_discovery_source_profile(source_profile_id)
    except SequenceNotFoundError as error:
        raise_sequence_http_exception(error)


@app.get("/maintenance/discovery/source-quality-snapshots")
def list_discovery_source_quality_snapshots(
    limit: int = Query(default=50, ge=1, le=200),
    channel_id: str | None = Query(default=None, alias="channelId"),
    min_recall_score: float | None = Query(default=None, alias="minRecallScore"),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=200, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    return list_discovery_source_quality_snapshots_page(
        limit=limit,
        page=page,
        page_size=page_size,
        channel_id=channel_id,
        min_recall_score=min_recall_score,
    )


@app.get("/maintenance/discovery/source-quality-snapshots/{snapshot_id}")
def get_discovery_source_quality_snapshot_route(snapshot_id: str) -> dict[str, Any]:
    try:
        return get_discovery_source_quality_snapshot(snapshot_id)
    except SequenceNotFoundError as error:
        raise_sequence_http_exception(error)


@app.get("/maintenance/discovery/source-interest-scores")
def list_discovery_source_interest_scores(
    limit: int = Query(default=50, ge=1, le=200),
    mission_id: str | None = Query(default=None, alias="missionId"),
    channel_id: str | None = Query(default=None, alias="channelId"),
    min_score: float | None = Query(default=None, alias="minScore"),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=200, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    return list_discovery_source_interest_scores_page(
        limit=limit,
        page=page,
        page_size=page_size,
        mission_id=mission_id,
        channel_id=channel_id,
        min_score=min_score,
    )


@app.get("/maintenance/discovery/source-interest-scores/{score_id}")
def get_discovery_source_interest_score_route(score_id: str) -> dict[str, Any]:
    try:
        return get_discovery_source_interest_score(score_id)
    except SequenceNotFoundError as error:
        raise_sequence_http_exception(error)


@app.get("/maintenance/discovery/missions/{mission_id}/portfolio")
def get_discovery_portfolio_snapshot_route(mission_id: str) -> dict[str, Any]:
    try:
        return get_discovery_portfolio_snapshot(mission_id)
    except SequenceNotFoundError as error:
        raise_sequence_http_exception(error)


@app.get("/maintenance/discovery/feedback")
def list_discovery_feedback(
    limit: int = Query(default=50, ge=1, le=200),
    mission_id: str | None = Query(default=None, alias="missionId"),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=200, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    return list_discovery_feedback_page(
        limit=limit,
        page=page,
        page_size=page_size,
        mission_id=mission_id,
    )


@app.post("/maintenance/discovery/feedback", status_code=201)
def create_discovery_feedback_route(payload: DiscoveryFeedbackCreatePayload) -> dict[str, Any]:
    try:
        return create_discovery_feedback(payload)
    except SequenceConflictError as error:
        raise_sequence_http_exception(error)


@app.post("/maintenance/discovery/re-evaluate")
async def re_evaluate_discovery_sources_route(
    payload: DiscoveryReEvaluatePayload | None = None,
) -> dict[str, Any]:
    repository = DiscoveryCoordinatorRepository()
    try:
        return await re_evaluate_sources(
            mission_id=(payload.mission_id if payload else None),
            repository=repository,
        )
    except SequenceNotFoundError as error:
        raise_sequence_http_exception(error)


@app.get("/maintenance/discovery/costs/summary")
def get_discovery_cost_summary_route() -> dict[str, Any]:
    return get_discovery_cost_summary()


@app.get("/maintenance/agent/sequence-tools")
def get_agent_sequence_tools() -> dict[str, Any]:
    return list_agent_sequence_tools()


@app.post("/maintenance/agent/sequences", status_code=201)
def create_agent_sequence(payload: AgentSequenceCreatePayload) -> dict[str, Any]:
    try:
        return create_agent_sequence_request(payload)
    except (
        SequenceConflictError,
        SequenceDispatchError,
        SequenceNotFoundError,
        SequenceValidationError,
    ) as error:
        raise_sequence_http_exception(error)


@app.get("/maintenance/fetch-runs")
def list_fetch_runs(
    limit: int = Query(default=50, ge=1, le=200),
    channel_id: str | None = Query(default=None),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=200, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    fetch_filters: list[str] = []
    params: list[Any] = []
    if channel_id:
        fetch_filters.append("channel_id = %s")
        params.append(channel_id)

    where_clause = f"where {' and '.join(fetch_filters)}" if fetch_filters else ""
    fetch_run_select = f"""
        select *
        from channel_fetch_runs
        {where_clause}
        order by started_at desc
    """
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, limit
    )
    if not paginate:
        return query_all(
            f"{fetch_run_select}\nlimit %s",
            tuple([*params, limit]),
        )

    count_sql = "select count(*)::int as total from channel_fetch_runs"
    if where_clause:
        count_sql = f"{count_sql}\n{where_clause}"
    total = query_count(count_sql, tuple(params))
    items = query_all(
        f"{fetch_run_select}\nlimit %s\noffset %s",
        tuple([*params, resolved_page_size, offset]),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


@app.get("/maintenance/llm-reviews")
def list_llm_reviews(
    limit: int = Query(default=50, ge=1, le=200),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=200, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    llm_review_select = """
        select
          lr.*,
          a.title as article_title
        from llm_review_log lr
        join articles a on a.doc_id = lr.doc_id
        order by lr.created_at desc
    """
    paginate, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, limit
    )
    if not paginate:
        return query_all(f"{llm_review_select}\nlimit %s", (limit,))

    total = query_count(
        """
        select count(*)::int as total
        from llm_review_log
        """
    )
    items = query_all(
        f"{llm_review_select}\nlimit %s\noffset %s",
        (resolved_page_size, offset),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


@app.get("/maintenance/llm-usage-summary")
def get_llm_usage_summary() -> dict[str, Any]:
    rows = query_all(
        """
        select
          window_name,
          review_count,
          total_tokens,
          prompt_tokens,
          completion_tokens,
          cost_estimate_usd
        from (
          select
            '24h'::text as window_name,
            count(*)::int as review_count,
            coalesce(sum(total_tokens), 0)::int as total_tokens,
            coalesce(sum(prompt_tokens), 0)::int as prompt_tokens,
            coalesce(sum(completion_tokens), 0)::int as completion_tokens,
            coalesce(sum(cost_estimate_usd), 0)::float as cost_estimate_usd
          from llm_review_log
          where created_at >= now() - interval '24 hours'
          union all
          select
            '7d'::text as window_name,
            count(*)::int as review_count,
            coalesce(sum(total_tokens), 0)::int as total_tokens,
            coalesce(sum(prompt_tokens), 0)::int as prompt_tokens,
            coalesce(sum(completion_tokens), 0)::int as completion_tokens,
            coalesce(sum(cost_estimate_usd), 0)::float as cost_estimate_usd
          from llm_review_log
          where created_at >= now() - interval '7 days'
        ) usage_windows
        """
    )
    return {
        row["window_name"]: {
            "review_count": row["review_count"],
            "total_tokens": row["total_tokens"],
            "prompt_tokens": row["prompt_tokens"],
            "completion_tokens": row["completion_tokens"],
            "cost_estimate_usd": row["cost_estimate_usd"],
        }
        for row in rows
    }


def get_llm_budget_summary() -> dict[str, Any]:
    month_start = llm_review_month_start_utc()
    row = query_one(
        """
        select
          coalesce(sum(cost_estimate_usd), 0) as month_to_date_cost_usd
        from llm_review_log
        where created_at >= %s
          and scope = 'criterion'
        """,
        (month_start,),
    ) or {"month_to_date_cost_usd": 0}
    month_to_date_cost_usd = coerce_llm_review_cost_usd(row.get("month_to_date_cost_usd"))
    budget_cents = llm_review_monthly_budget_cents()
    budget_usd = Decimal(budget_cents) / Decimal("100")
    quota_enabled = budget_cents > 0
    monthly_quota_reached = quota_enabled and month_to_date_cost_usd >= budget_usd
    remaining_cents = (
        llm_review_cost_usd_to_cents(max(budget_usd - month_to_date_cost_usd, Decimal("0")))
        if quota_enabled
        else None
    )
    return {
        "enabled": llm_review_enabled(),
        "monthlyBudgetCents": budget_cents,
        "monthToDateCostUsd": float(month_to_date_cost_usd),
        "monthToDateCostCents": llm_review_cost_usd_to_cents(month_to_date_cost_usd),
        "remainingMonthlyBudgetCents": remaining_cents,
        "monthlyQuotaReached": monthly_quota_reached,
        "acceptGrayZoneOnBudgetExhaustion": llm_review_accept_gray_zone_on_budget_exhaustion(),
        "monthStart": month_start,
    }


@app.get("/maintenance/llm-budget-summary")
def get_maintenance_llm_budget_summary() -> dict[str, Any]:
    return get_llm_budget_summary()


@app.get("/maintenance/outbox")
def list_outbox_events(limit: int = Query(default=50, ge=1, le=200)) -> list[dict[str, Any]]:
    return query_all(
        """
        select *
        from outbox_events
        order by created_at desc
        limit %s
        """,
        (limit,),
    )


@app.post("/maintenance/sequences/{sequence_id}/runs", status_code=202)
def request_sequence_run(
    sequence_id: str,
    payload: SequenceManualRunPayload,
) -> dict[str, Any]:
    try:
        return create_sequence_run_request(sequence_id, payload)
    except (
        SequenceConflictError,
        SequenceDispatchError,
        SequenceNotFoundError,
        SequenceValidationError,
    ) as error:
        raise_sequence_http_exception(error)


@app.get("/maintenance/sequence-runs/{run_id}")
def get_sequence_run_status(run_id: str) -> dict[str, Any]:
    try:
        return get_sequence_run(run_id)
    except SequenceNotFoundError as error:
        raise_sequence_http_exception(error)


@app.get("/maintenance/sequence-runs/{run_id}/task-runs")
def get_sequence_run_task_runs(run_id: str) -> list[dict[str, Any]]:
    try:
        return list_sequence_task_runs(run_id)
    except SequenceNotFoundError as error:
        raise_sequence_http_exception(error)


@app.post("/maintenance/sequence-runs/{run_id}/cancel")
def cancel_sequence_run(
    run_id: str,
    payload: SequenceCancelPayload | None = None,
) -> dict[str, Any]:
    try:
        return cancel_sequence_run_request(
            run_id,
            reason=payload.reason if payload is not None else None,
        )
    except (
        SequenceConflictError,
        SequenceNotFoundError,
    ) as error:
        raise_sequence_http_exception(error)
