from __future__ import annotations

from typing import Any, Callable

from fastapi import HTTPException

from signalops.api import content_query as _content_query
from signalops.api.content_analysis_filters import (
    CONTENT_ANALYSIS_POLICY_MODULES,
    normalize_content_analysis_status,
    normalize_content_analysis_subject_id,
    normalize_content_analysis_subject_type,
    normalize_content_analysis_type,
    normalize_content_filter_decision,
    normalize_optional_query_bool,
)
from signalops.api.content_selection_read_model import query_count
from signalops.api.database import query_all, query_one
from signalops.api.pagination import build_paginated_response, resolve_pagination

QueryAllFunc = Callable[[str, tuple[Any, ...]], list[dict[str, Any]]]
QueryOneFunc = Callable[[str, tuple[Any, ...]], dict[str, Any] | None]
QueryCountFunc = Callable[[str, tuple[Any, ...]], int]


def load_content_analysis_summary(
    *,
    subject_type: str,
    subject_id: str,
    query_all_func: QueryAllFunc = query_all,
    query_one_func: QueryOneFunc = query_one,
) -> dict[str, Any]:
    resolved_subject_type = normalize_content_analysis_subject_type(subject_type)
    try:
        resolved_subject_id = normalize_content_analysis_subject_id(subject_id)
    except HTTPException:
        return {
            "subjectType": resolved_subject_type,
            "subjectId": str(subject_id),
            "latestResults": [],
            "entities": [],
            "labels": [],
            "contentFilter": None,
        }
    if resolved_subject_id is None:
        raise HTTPException(status_code=400, detail="subjectId is required.")
    latest_results = query_all_func(
        """
        select distinct on (analysis_type)
          analysis_id::text as analysis_id,
          subject_type,
          subject_id::text as subject_id,
          canonical_document_id::text as canonical_document_id,
          source_channel_id::text as source_channel_id,
          analysis_type,
          provider,
          model_key,
          model_version,
          language,
          status,
          result_json,
          confidence,
          source_hash,
          error_text,
          created_at,
          updated_at
        from content_analysis_results
        where subject_type = %s
          and subject_id = %s
        order by analysis_type, updated_at desc
        """,
        (resolved_subject_type, resolved_subject_id),
    )
    entities = query_all_func(
        """
        select
          entity_id::text as entity_id,
          subject_type,
          subject_id::text as subject_id,
          canonical_document_id::text as canonical_document_id,
          source_channel_id::text as source_channel_id,
          entity_text,
          normalized_key,
          entity_type,
          salience,
          confidence,
          mention_count,
          mentions_json,
          provider,
          model_key,
          analysis_id::text as analysis_id,
          created_at
        from content_entities
        where subject_type = %s
          and subject_id = %s
        order by mention_count desc, confidence desc nulls last, entity_text
        limit 50
        """,
        (resolved_subject_type, resolved_subject_id),
    )
    labels = query_all_func(
        """
        select
          label_id::text as label_id,
          subject_type,
          subject_id::text as subject_id,
          canonical_document_id::text as canonical_document_id,
          source_channel_id::text as source_channel_id,
          label_type,
          label_key,
          label_name,
          decision,
          score,
          confidence,
          explain_json,
          analysis_id::text as analysis_id,
          created_at
        from content_labels
        where subject_type = %s
          and subject_id = %s
        order by label_type, score desc nulls last, label_key
        limit 50
        """,
        (resolved_subject_type, resolved_subject_id),
    )
    content_filter = query_one_func(
        """
        select
          filter_result_id::text as filter_result_id,
          subject_type,
          subject_id::text as subject_id,
          canonical_document_id::text as canonical_document_id,
          source_channel_id::text as source_channel_id,
          filter_policy_id::text as filter_policy_id,
          policy_key,
          policy_version,
          mode,
          decision,
          passed,
          score,
          matched_rules_json,
          failed_rules_json,
          explain_json,
          created_at,
          updated_at
        from content_filter_results
        where subject_type = %s
          and subject_id = %s
        order by updated_at desc
        limit 1
        """,
        (resolved_subject_type, resolved_subject_id),
    )
    return {
        "subjectType": resolved_subject_type,
        "subjectId": resolved_subject_id,
        "latestResults": latest_results,
        "entities": entities,
        "labels": labels,
        "contentFilter": content_filter,
    }


def build_content_analysis_filter_clause(
    *,
    subject_alias: str,
    subject_type: str,
    entity_type: str | None = None,
    entity_text: str | None = None,
    entity_normalized_key: str | None = None,
    label_type: str | None = None,
    label_key: str | None = None,
    content_filter_passed: bool | None = None,
    content_filter_decision: str | None = None,
) -> tuple[list[str], list[Any]]:
    entity_type = _content_query.normalize_optional_query_string(entity_type)
    entity_text = _content_query.normalize_optional_query_string(entity_text)
    entity_normalized_key = _content_query.normalize_optional_query_string(
        entity_normalized_key
    )
    label_type = _content_query.normalize_optional_query_string(label_type)
    label_key = _content_query.normalize_optional_query_string(label_key)
    content_filter_passed = normalize_optional_query_bool(content_filter_passed)
    content_filter_decision = normalize_content_filter_decision(content_filter_decision)
    filters: list[str] = []
    params: list[Any] = []
    if entity_type or entity_text or entity_normalized_key:
        entity_clauses = [
            "ce.subject_type = %s",
            f"ce.subject_id = {subject_alias}",
        ]
        entity_params: list[Any] = [subject_type]
        if entity_type:
            entity_clauses.append("ce.entity_type = %s")
            entity_params.append(entity_type)
        if entity_text:
            entity_clauses.append("ce.entity_text ilike %s")
            entity_params.append(f"%{entity_text}%")
        if entity_normalized_key:
            entity_clauses.append("ce.normalized_key = %s")
            entity_params.append(entity_normalized_key)
        filters.append(
            f"exists (select 1 from content_entities ce where {' and '.join(entity_clauses)})"
        )
        params.extend(entity_params)
    if label_type or label_key:
        label_clauses = [
            "cl.subject_type = %s",
            f"cl.subject_id = {subject_alias}",
        ]
        label_params: list[Any] = [subject_type]
        if label_type:
            label_clauses.append("cl.label_type = %s")
            label_params.append(label_type)
        if label_key:
            label_clauses.append("cl.label_key = %s")
            label_params.append(label_key)
        filters.append(
            f"exists (select 1 from content_labels cl where {' and '.join(label_clauses)})"
        )
        params.extend(label_params)
    if content_filter_passed is not None or content_filter_decision:
        filter_clauses = [
            "cfr.subject_type = %s",
            f"cfr.subject_id = {subject_alias}",
        ]
        filter_params: list[Any] = [subject_type]
        if content_filter_passed is not None:
            filter_clauses.append("cfr.passed = %s")
            filter_params.append(content_filter_passed)
        if content_filter_decision:
            filter_clauses.append("cfr.decision = %s")
            filter_params.append(content_filter_decision)
        filters.append(
            f"exists (select 1 from content_filter_results cfr where {' and '.join(filter_clauses)})"
        )
        params.extend(filter_params)
    return filters, params


def list_content_analysis_results(
    *,
    subject_type: str | None = None,
    subject_id: str | None = None,
    analysis_type: str | None = None,
    status: str | None = None,
    page: int | None = None,
    page_size: int | None = None,
    query_all_func: QueryAllFunc = query_all,
    query_count_func: QueryCountFunc = query_count,
) -> dict[str, Any]:
    filters: list[str] = []
    params: list[Any] = []
    if subject_type:
        filters.append("subject_type = %s")
        params.append(normalize_content_analysis_subject_type(subject_type))
    resolved_subject_id = normalize_content_analysis_subject_id(subject_id)
    if resolved_subject_id:
        filters.append("subject_id = %s")
        params.append(resolved_subject_id)
    resolved_analysis_type = normalize_content_analysis_type(analysis_type)
    if resolved_analysis_type:
        filters.append("analysis_type = %s")
        params.append(resolved_analysis_type)
    resolved_status = normalize_content_analysis_status(status)
    if resolved_status:
        filters.append("status = %s")
        params.append(resolved_status)
    where_clause = f"where {' and '.join(filters)}" if filters else ""
    _, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, 20
    )
    total = query_count_func(
        f"select count(*)::int as total from content_analysis_results {where_clause}",
        tuple(params),
    )
    items = query_all_func(
        f"""
        select
          analysis_id::text as analysis_id,
          subject_type,
          subject_id::text as subject_id,
          canonical_document_id::text as canonical_document_id,
          source_channel_id::text as source_channel_id,
          analysis_type,
          provider,
          model_key,
          model_version,
          language,
          status,
          result_json,
          confidence,
          source_hash,
          error_text,
          created_at,
          updated_at
        from content_analysis_results
        {where_clause}
        order by updated_at desc
        limit %s
        offset %s
        """,
        tuple([*params, resolved_page_size, offset]),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


def get_content_analysis_result(
    analysis_id: str,
    *,
    query_one_func: QueryOneFunc = query_one,
) -> dict[str, Any]:
    result = query_one_func(
        """
        select
          analysis_id::text as analysis_id,
          subject_type,
          subject_id::text as subject_id,
          canonical_document_id::text as canonical_document_id,
          source_channel_id::text as source_channel_id,
          analysis_type,
          provider,
          model_key,
          model_version,
          language,
          status,
          result_json,
          confidence,
          source_hash,
          error_text,
          created_at,
          updated_at
        from content_analysis_results
        where analysis_id = %s
        """,
        (analysis_id,),
    )
    if result is None:
        raise HTTPException(status_code=404, detail="Content analysis result not found.")
    return result


def list_content_entities(
    *,
    subject_type: str | None = None,
    subject_id: str | None = None,
    entity_type: str | None = None,
    entity_text: str | None = None,
    normalized_key: str | None = None,
    page: int | None = None,
    page_size: int | None = None,
    query_all_func: QueryAllFunc = query_all,
    query_count_func: QueryCountFunc = query_count,
) -> dict[str, Any]:
    filters: list[str] = []
    params: list[Any] = []
    if subject_type:
        filters.append("subject_type = %s")
        params.append(normalize_content_analysis_subject_type(subject_type))
    resolved_subject_id = normalize_content_analysis_subject_id(subject_id)
    if resolved_subject_id:
        filters.append("subject_id = %s")
        params.append(resolved_subject_id)
    if entity_type:
        filters.append("entity_type = %s")
        params.append(entity_type)
    if entity_text:
        filters.append("entity_text ilike %s")
        params.append(f"%{entity_text}%")
    if normalized_key:
        filters.append("normalized_key = %s")
        params.append(normalized_key)
    where_clause = f"where {' and '.join(filters)}" if filters else ""
    _, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, 20
    )
    total = query_count_func(
        f"select count(*)::int as total from content_entities {where_clause}",
        tuple(params),
    )
    items = query_all_func(
        f"""
        select
          entity_id::text as entity_id,
          subject_type,
          subject_id::text as subject_id,
          canonical_document_id::text as canonical_document_id,
          source_channel_id::text as source_channel_id,
          entity_text,
          normalized_key,
          entity_type,
          salience,
          confidence,
          mention_count,
          mentions_json,
          provider,
          model_key,
          analysis_id::text as analysis_id,
          created_at
        from content_entities
        {where_clause}
        order by created_at desc
        limit %s
        offset %s
        """,
        tuple([*params, resolved_page_size, offset]),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


def list_content_labels(
    *,
    subject_type: str | None = None,
    subject_id: str | None = None,
    label_type: str | None = None,
    label_key: str | None = None,
    decision: str | None = None,
    page: int | None = None,
    page_size: int | None = None,
    query_all_func: QueryAllFunc = query_all,
    query_count_func: QueryCountFunc = query_count,
) -> dict[str, Any]:
    filters: list[str] = []
    params: list[Any] = []
    if subject_type:
        filters.append("subject_type = %s")
        params.append(normalize_content_analysis_subject_type(subject_type))
    resolved_subject_id = normalize_content_analysis_subject_id(subject_id)
    if resolved_subject_id:
        filters.append("subject_id = %s")
        params.append(resolved_subject_id)
    if label_type:
        filters.append("label_type = %s")
        params.append(label_type)
    if label_key:
        filters.append("label_key = %s")
        params.append(label_key)
    if decision:
        filters.append("decision = %s")
        params.append(decision)
    where_clause = f"where {' and '.join(filters)}" if filters else ""
    _, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, 20
    )
    total = query_count_func(
        f"select count(*)::int as total from content_labels {where_clause}",
        tuple(params),
    )
    items = query_all_func(
        f"""
        select
          label_id::text as label_id,
          subject_type,
          subject_id::text as subject_id,
          canonical_document_id::text as canonical_document_id,
          source_channel_id::text as source_channel_id,
          label_type,
          label_key,
          label_name,
          decision,
          score,
          confidence,
          explain_json,
          analysis_id::text as analysis_id,
          created_at
        from content_labels
        {where_clause}
        order by created_at desc
        limit %s
        offset %s
        """,
        tuple([*params, resolved_page_size, offset]),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


def list_content_analysis_policies(
    *,
    module: str | None = None,
    page: int | None = None,
    page_size: int | None = None,
    query_all_func: QueryAllFunc = query_all,
    query_count_func: QueryCountFunc = query_count,
) -> dict[str, Any]:
    filters: list[str] = []
    params: list[Any] = []
    if module:
        normalized_module = str(module or "").strip()
        if normalized_module not in CONTENT_ANALYSIS_POLICY_MODULES:
            raise HTTPException(status_code=400, detail="Unsupported content analysis policy module.")
        if normalized_module == "cluster_summary":
            filters.append("module = any(%s)")
            params.append(["cluster_summary", "clustering"])
        else:
            filters.append("module = %s")
            params.append(normalized_module)
    where_clause = f"where {' and '.join(filters)}" if filters else ""
    _, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, 20
    )
    total = query_count_func(
        f"select count(*)::int as total from content_analysis_policies {where_clause}",
        tuple(params),
    )
    items = query_all_func(
        f"""
        select
          policy_id::text as policy_id,
          policy_key,
          title,
          description,
          scope_type,
          scope_id::text as scope_id,
          module,
          enabled,
          mode,
          provider,
          model_key,
          model_version,
          config_json,
          failure_policy,
          priority,
          version,
          is_active,
          created_at,
          updated_at
        from content_analysis_policies
        {where_clause}
        order by is_active desc, priority asc, updated_at desc
        limit %s
        offset %s
        """,
        tuple([*params, resolved_page_size, offset]),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


def get_content_analysis_policy(
    policy_id: str,
    *,
    query_one_func: QueryOneFunc = query_one,
) -> dict[str, Any]:
    policy = query_one_func(
        """
        select
          policy_id::text as policy_id,
          policy_key,
          title,
          description,
          scope_type,
          scope_id::text as scope_id,
          module,
          enabled,
          mode,
          provider,
          model_key,
          model_version,
          config_json,
          failure_policy,
          priority,
          version,
          is_active,
          created_at,
          updated_at
        from content_analysis_policies
        where policy_id = %s
        """,
        (policy_id,),
    )
    if policy is None:
        raise HTTPException(status_code=404, detail="Content analysis policy not found.")
    return policy


def list_content_filter_policies(
    *,
    page: int | None = None,
    page_size: int | None = None,
    query_all_func: QueryAllFunc = query_all,
    query_count_func: QueryCountFunc = query_count,
) -> dict[str, Any]:
    _, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, 20
    )
    total = query_count_func("select count(*)::int as total from content_filter_policies", ())
    items = query_all_func(
        """
        select
          filter_policy_id::text as filter_policy_id,
          policy_key,
          title,
          description,
          scope_type,
          scope_id::text as scope_id,
          mode,
          combiner,
          policy_json,
          version,
          is_active,
          priority,
          created_at,
          updated_at
        from content_filter_policies
        order by is_active desc, priority asc, updated_at desc
        limit %s
        offset %s
        """,
        (resolved_page_size, offset),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)


def get_content_filter_policy(
    filter_policy_id: str,
    *,
    query_one_func: QueryOneFunc = query_one,
) -> dict[str, Any]:
    policy = query_one_func(
        """
        select
          filter_policy_id::text as filter_policy_id,
          policy_key,
          title,
          description,
          scope_type,
          scope_id::text as scope_id,
          mode,
          combiner,
          policy_json,
          version,
          is_active,
          priority,
          created_at,
          updated_at
        from content_filter_policies
        where filter_policy_id = %s
        """,
        (filter_policy_id,),
    )
    if policy is None:
        raise HTTPException(status_code=404, detail="Content filter policy not found.")
    return policy


def preview_content_filter_policy(
    filter_policy_id: str,
    *,
    get_content_filter_policy_func: Callable[[str], dict[str, Any]],
    query_one_func: QueryOneFunc = query_one,
    query_count_func: QueryCountFunc = query_count,
) -> dict[str, Any]:
    policy = get_content_filter_policy_func(filter_policy_id)
    current_results = query_one_func(
        """
        select
          count(*)::int as result_count,
          count(*) filter (where passed)::int as passed_count,
          count(*) filter (where not passed)::int as failed_count
        from content_filter_results
        where policy_key = %s
          and policy_version = %s
        """,
        (policy["policy_key"], policy["version"]),
    ) or {"result_count": 0, "passed_count": 0, "failed_count": 0}
    recent_selected = query_count_func(
        """
        select count(*)::int as total
        from final_selection_results
        where is_selected = true
        """,
        (),
    )
    return {
        "policy": policy,
        "currentResults": current_results,
        "selectedContentCount": recent_selected,
        "mode": policy["mode"],
        "previewOnly": True,
    }


def list_content_filter_results(
    *,
    subject_type: str | None = None,
    subject_id: str | None = None,
    policy_key: str | None = None,
    decision: str | None = None,
    passed: bool | None = None,
    page: int | None = None,
    page_size: int | None = None,
    query_all_func: QueryAllFunc = query_all,
    query_count_func: QueryCountFunc = query_count,
) -> dict[str, Any]:
    filters: list[str] = []
    params: list[Any] = []
    if subject_type:
        filters.append("subject_type = %s")
        params.append(normalize_content_analysis_subject_type(subject_type))
    resolved_subject_id = normalize_content_analysis_subject_id(subject_id)
    if resolved_subject_id:
        filters.append("subject_id = %s")
        params.append(resolved_subject_id)
    if policy_key:
        filters.append("policy_key = %s")
        params.append(policy_key)
    resolved_decision = normalize_content_filter_decision(decision)
    if resolved_decision:
        filters.append("decision = %s")
        params.append(resolved_decision)
    if passed is not None:
        filters.append("passed = %s")
        params.append(passed)
    where_clause = f"where {' and '.join(filters)}" if filters else ""
    _, resolved_page, resolved_page_size, offset = resolve_pagination(
        page, page_size, 20
    )
    total = query_count_func(
        f"select count(*)::int as total from content_filter_results {where_clause}",
        tuple(params),
    )
    items = query_all_func(
        f"""
        select
          filter_result_id::text as filter_result_id,
          subject_type,
          subject_id::text as subject_id,
          canonical_document_id::text as canonical_document_id,
          source_channel_id::text as source_channel_id,
          filter_policy_id::text as filter_policy_id,
          policy_key,
          policy_version,
          mode,
          decision,
          passed,
          score,
          matched_rules_json,
          failed_rules_json,
          explain_json,
          created_at,
          updated_at
        from content_filter_results
        {where_clause}
        order by updated_at desc
        limit %s
        offset %s
        """,
        tuple([*params, resolved_page_size, offset]),
    )
    return build_paginated_response(items, resolved_page, resolved_page_size, total)
