from __future__ import annotations

import json
from typing import Any, Callable


class ContentAnalysisPolicyWriteFailure(RuntimeError):
    pass


def create_content_analysis_policy(
    payload: Any,
    *,
    query_one_func: Callable[[str, tuple[Any, ...]], dict[str, Any] | None],
    get_content_analysis_policy_func: Callable[[str], dict[str, Any]],
) -> dict[str, Any]:
    row = query_one_func(
        """
        insert into content_analysis_policies (
          policy_key,
          title,
          description,
          scope_type,
          scope_id,
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
          is_active
        )
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s, %s)
        returning policy_id::text as policy_id
        """,
        (
            payload.policy_key,
            payload.title,
            payload.description,
            payload.scope_type,
            payload.scope_id,
            payload.module,
            payload.enabled,
            payload.mode,
            payload.provider,
            payload.model_key,
            payload.model_version,
            json.dumps(payload.config_json),
            payload.failure_policy,
            payload.priority,
            payload.version,
            payload.is_active,
        ),
    )
    if row is None:
        raise ContentAnalysisPolicyWriteFailure(
            "Content analysis policy was not created."
        )
    return get_content_analysis_policy_func(str(row["policy_id"]))


def update_content_analysis_policy(
    policy_id: str,
    payload: Any,
    *,
    get_content_analysis_policy_func: Callable[[str], dict[str, Any]],
    query_one_func: Callable[[str, tuple[Any, ...]], dict[str, Any] | None],
    build_database_url_func: Callable[[], str],
    connect_func: Callable[..., Any],
    dict_row_value: Any,
) -> dict[str, Any]:
    current = get_content_analysis_policy_func(policy_id)
    updated = {
        "title": payload.title if payload.title is not None else current["title"],
        "description": (
            payload.description if payload.description is not None else current["description"]
        ),
        "module": payload.module if payload.module is not None else current["module"],
        "enabled": payload.enabled if payload.enabled is not None else current["enabled"],
        "mode": payload.mode if payload.mode is not None else current["mode"],
        "provider": payload.provider if payload.provider is not None else current["provider"],
        "model_key": payload.model_key if payload.model_key is not None else current["model_key"],
        "model_version": (
            payload.model_version if payload.model_version is not None else current["model_version"]
        ),
        "config_json": (
            payload.config_json if payload.config_json is not None else current["config_json"]
        ),
        "failure_policy": (
            payload.failure_policy if payload.failure_policy is not None else current["failure_policy"]
        ),
        "is_active": (
            payload.is_active if payload.is_active is not None else current["is_active"]
        ),
        "priority": payload.priority if payload.priority is not None else current["priority"],
    }
    versioned_change = any(
        value is not None
        for value in (
            payload.module,
            payload.enabled,
            payload.mode,
            payload.provider,
            payload.model_key,
            payload.model_version,
            payload.config_json,
            payload.failure_policy,
        )
    )
    if versioned_change:
        with connect_func(build_database_url_func(), row_factory=dict_row_value) as connection:
            with connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        update content_analysis_policies
                        set is_active = false, updated_at = now()
                        where policy_id = %s
                        """,
                        (policy_id,),
                    )
                    cursor.execute(
                        """
                        insert into content_analysis_policies (
                          policy_key,
                          title,
                          description,
                          scope_type,
                          scope_id,
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
                          is_active
                        )
                        select
                          policy_key,
                          %s,
                          %s,
                          scope_type,
                          scope_id,
                          %s,
                          %s,
                          %s,
                          %s,
                          %s,
                          %s,
                          %s::jsonb,
                          %s,
                          %s,
                          (
                            select coalesce(max(version), 0) + 1
                            from content_analysis_policies
                            where policy_key = %s
                          ),
                          %s
                        from content_analysis_policies
                        where policy_id = %s
                        returning policy_id::text as policy_id
                        """,
                        (
                            updated["title"],
                            updated["description"],
                            updated["module"],
                            updated["enabled"],
                            updated["mode"],
                            updated["provider"],
                            updated["model_key"],
                            updated["model_version"],
                            json.dumps(updated["config_json"]),
                            updated["failure_policy"],
                            updated["priority"],
                            current["policy_key"],
                            updated["is_active"],
                            policy_id,
                        ),
                    )
                    row = cursor.fetchone()
        if row is None:
            raise ContentAnalysisPolicyWriteFailure(
                "Content analysis policy was not updated."
            )
        return get_content_analysis_policy_func(str(row["policy_id"]))
    query_one_func(
        """
        update content_analysis_policies
        set
          title = %s,
          description = %s,
          is_active = %s,
          priority = %s,
          updated_at = now()
        where policy_id = %s
        returning policy_id
        """,
        (
            updated["title"],
            updated["description"],
            updated["is_active"],
            updated["priority"],
            policy_id,
        ),
    )
    return get_content_analysis_policy_func(policy_id)


def create_content_filter_policy(
    payload: Any,
    *,
    query_one_func: Callable[[str, tuple[Any, ...]], dict[str, Any] | None],
    get_content_filter_policy_func: Callable[[str], dict[str, Any]],
) -> dict[str, Any]:
    row = query_one_func(
        """
        insert into content_filter_policies (
          policy_key,
          title,
          description,
          scope_type,
          scope_id,
          mode,
          combiner,
          policy_json,
          version,
          is_active,
          priority
        )
        values (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s)
        returning filter_policy_id::text as filter_policy_id
        """,
        (
            payload.policy_key,
            payload.title,
            payload.description,
            payload.scope_type,
            payload.scope_id,
            payload.mode,
            payload.combiner,
            json.dumps(payload.policy_json),
            payload.version,
            payload.is_active,
            payload.priority,
        ),
    )
    if row is None:
        raise ContentAnalysisPolicyWriteFailure("Content filter policy was not created.")
    return get_content_filter_policy_func(str(row["filter_policy_id"]))


def update_content_filter_policy(
    filter_policy_id: str,
    payload: Any,
    *,
    get_content_filter_policy_func: Callable[[str], dict[str, Any]],
    query_one_func: Callable[[str, tuple[Any, ...]], dict[str, Any] | None],
    build_database_url_func: Callable[[], str],
    connect_func: Callable[..., Any],
    dict_row_value: Any,
) -> dict[str, Any]:
    current = get_content_filter_policy_func(filter_policy_id)
    updated = {
        "title": payload.title if payload.title is not None else current["title"],
        "description": (
            payload.description if payload.description is not None else current["description"]
        ),
        "mode": payload.mode if payload.mode is not None else current["mode"],
        "combiner": payload.combiner if payload.combiner is not None else current["combiner"],
        "policy_json": (
            payload.policy_json if payload.policy_json is not None else current["policy_json"]
        ),
        "is_active": (
            payload.is_active if payload.is_active is not None else current["is_active"]
        ),
        "priority": payload.priority if payload.priority is not None else current["priority"],
    }
    if payload.mode is not None or payload.combiner is not None or payload.policy_json is not None:
        with connect_func(build_database_url_func(), row_factory=dict_row_value) as connection:
            with connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        update content_filter_policies
                        set is_active = false, updated_at = now()
                        where filter_policy_id = %s
                        """,
                        (filter_policy_id,),
                    )
                    cursor.execute(
                        """
                        insert into content_filter_policies (
                          policy_key,
                          title,
                          description,
                          scope_type,
                          scope_id,
                          mode,
                          combiner,
                          policy_json,
                          version,
                          is_active,
                          priority
                        )
                        select
                          policy_key,
                          %s,
                          %s,
                          scope_type,
                          scope_id,
                          %s,
                          %s,
                          %s::jsonb,
                          (
                            select coalesce(max(version), 0) + 1
                            from content_filter_policies
                            where policy_key = %s
                          ),
                          %s,
                          %s
                        from content_filter_policies
                        where filter_policy_id = %s
                        returning filter_policy_id::text as filter_policy_id
                        """,
                        (
                            updated["title"],
                            updated["description"],
                            updated["mode"],
                            updated["combiner"],
                            json.dumps(updated["policy_json"]),
                            current["policy_key"],
                            updated["is_active"],
                            updated["priority"],
                            filter_policy_id,
                        ),
                    )
                    row = cursor.fetchone()
        if row is None:
            raise ContentAnalysisPolicyWriteFailure(
                "Content filter policy was not updated."
            )
        return get_content_filter_policy_func(str(row["filter_policy_id"]))
    query_one_func(
        """
        update content_filter_policies
        set
          title = %s,
          description = %s,
          mode = %s,
          combiner = %s,
          policy_json = %s::jsonb,
          is_active = %s,
          priority = %s,
          updated_at = now()
        where filter_policy_id = %s
        returning filter_policy_id
        """,
        (
            updated["title"],
            updated["description"],
            updated["mode"],
            updated["combiner"],
            json.dumps(updated["policy_json"]),
            updated["is_active"],
            updated["priority"],
            filter_policy_id,
        ),
    )
    return get_content_filter_policy_func(filter_policy_id)
