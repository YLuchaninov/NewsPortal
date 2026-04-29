from __future__ import annotations

from typing import Any

import psycopg


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
