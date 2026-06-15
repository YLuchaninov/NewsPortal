from __future__ import annotations

from typing import Any

from fastapi import HTTPException, Query

from signalops.api import channel_read_model as _channel_read_model
from signalops.api import cluster_read_model as _cluster_read_model
from signalops.api import dashboard_read_model as _dashboard_read_model
from signalops.api import llm_review_read_model as _llm_review_read_model
from signalops.api import notification_read_model as _notification_read_model
from signalops.api import reindex_read_model as _reindex_read_model
from signalops.api import system_interest_read_model as _system_interest_read_model
from signalops.api import user_interest_read_model as _user_interest_read_model
from signalops.api import user_match_read_model as _user_match_read_model
from signalops.api.content_selection_read_model import (
    canonical_signal_candidate_family_expr,
    feed_eligible_signal_candidate_clause,
    final_selection_join_clause,
    processed_signal_candidate_clause,
    system_feed_join_clause,
)
from signalops.api.database import query_all, query_one
from signalops.api.main_common import (
    apply_reindex_selection_profile_payload,
    query_count,
    with_resolved_channel_adapter_fields,
)
from signalops.api.pagination import build_paginated_response, resolve_pagination
from signalops.api.content_selection_read_model import (
    normalize_system_interest_selection_profile_payload,
)

def get_dashboard_summary() -> dict[str, Any]:
    return _dashboard_read_model.get_dashboard_summary(
        canonical_signal_candidate_family_expr_func=canonical_signal_candidate_family_expr,
        final_selection_join_clause_func=final_selection_join_clause,
        system_feed_join_clause_func=system_feed_join_clause,
        feed_eligible_signal_candidate_clause_func=feed_eligible_signal_candidate_clause,
        processed_signal_candidate_clause_func=processed_signal_candidate_clause,
        query_one_func=query_one,
        get_llm_budget_summary_func=get_llm_budget_summary,
    )


def get_llm_budget_summary() -> dict[str, Any]:
    return _llm_review_read_model.get_llm_budget_summary(query_one_func=query_one)


def list_channels(
    provider_type: str | None = Query(default=None, alias="providerType"),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    return _channel_read_model.list_channels(
        provider_type=provider_type,
        page=page,
        page_size=page_size,
        resolve_pagination_func=resolve_pagination,
        query_all_func=query_all,
        query_count_func=query_count,
        build_paginated_response_func=build_paginated_response,
        with_resolved_channel_adapter_fields_func=with_resolved_channel_adapter_fields,
    )


def get_channel(channel_id: str) -> dict[str, Any]:
    try:
        return _channel_read_model.get_channel(
            channel_id,
            query_one_func=query_one,
            with_resolved_channel_adapter_fields_func=with_resolved_channel_adapter_fields,
        )
    except _channel_read_model.ChannelNotFoundError:
        raise HTTPException(status_code=404, detail="Channel not found.")


def list_clusters(
    limit: int = Query(default=20, ge=1, le=100),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    return _cluster_read_model.list_clusters(
        limit=limit,
        page=page,
        page_size=page_size,
        resolve_pagination_func=resolve_pagination,
        query_all_func=query_all,
        query_count_func=query_count,
        build_paginated_response_func=build_paginated_response,
    )


def list_user_interests(
    user_id: str,
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    return _user_interest_read_model.list_user_interests(
        user_id=user_id,
        page=page,
        page_size=page_size,
        resolve_pagination_func=resolve_pagination,
        query_all_func=query_all,
        query_count_func=query_count,
        build_paginated_response_func=build_paginated_response,
    )


def list_user_matches(
    user_id: str,
    limit: int = Query(default=20, ge=1, le=100),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
    sort: str | None = Query(default=None),
    q: str | None = Query(default=None),
) -> dict[str, Any] | list[dict[str, Any]]:
    return _user_match_read_model.list_user_matches(
        user_id=user_id,
        limit=limit,
        page=page,
        page_size=page_size,
        sort=sort,
        q=q,
        resolve_pagination_func=resolve_pagination,
        query_all_func=query_all,
        query_count_func=query_count,
        build_paginated_response_func=build_paginated_response,
    )


def list_user_notifications(
    user_id: str,
    limit: int = Query(default=20, ge=1, le=100),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    return _notification_read_model.list_user_notifications(
        user_id=user_id,
        limit=limit,
        page=page,
        page_size=page_size,
        resolve_pagination_func=resolve_pagination,
        query_all_func=query_all,
        query_count_func=query_count,
        build_paginated_response_func=build_paginated_response,
    )


def list_llm_templates(
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    return _llm_review_read_model.list_llm_templates(
        page=page,
        page_size=page_size,
        query_all_func=query_all,
        query_count_func=query_count,
    )


def get_llm_template(prompt_template_id: str) -> dict[str, Any]:
    try:
        return _llm_review_read_model.get_llm_template(
            prompt_template_id,
            query_one_func=query_one,
        )
    except _llm_review_read_model.LlmTemplateNotFoundError:
        raise HTTPException(status_code=404, detail="LLM template not found.")


def list_system_interests(
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    return _system_interest_read_model.list_system_interests(
        page=page,
        page_size=page_size,
        resolve_pagination_func=resolve_pagination,
        query_all_func=query_all,
        query_count_func=query_count,
        build_paginated_response_func=build_paginated_response,
        normalize_payload_func=normalize_system_interest_selection_profile_payload,
    )


def get_system_interest(interest_template_id: str) -> dict[str, Any]:
    try:
        return _system_interest_read_model.get_system_interest(
            interest_template_id,
            query_one_func=query_one,
            normalize_payload_func=normalize_system_interest_selection_profile_payload,
        )
    except _system_interest_read_model.SystemInterestNotFoundError:
        raise HTTPException(status_code=404, detail="System interest not found.")


def list_reindex_jobs(
    limit: int = Query(default=20, ge=1, le=100),
    page: int | None = Query(default=None, ge=1),
    page_size: int | None = Query(default=None, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any] | list[dict[str, Any]]:
    return _reindex_read_model.list_reindex_jobs(
        limit=limit,
        page=page,
        page_size=page_size,
        resolve_pagination_func=resolve_pagination,
        query_all_func=query_all,
        query_count_func=query_count,
        build_paginated_response_func=build_paginated_response,
        apply_payload_func=apply_reindex_selection_profile_payload,
    )
