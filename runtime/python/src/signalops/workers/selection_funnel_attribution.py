from __future__ import annotations

import uuid
from collections.abc import Mapping
from typing import Any

import psycopg

from .runtime_json import make_json_safe


def _compact_json_rows(rows: list[Mapping[str, Any]]) -> list[dict[str, Any]]:
    return [make_json_safe(dict(row)) for row in rows]


async def collect_funnel_runtime_attribution(
    cursor: psycopg.AsyncCursor[Any],
    doc_id: str | uuid.UUID,
) -> dict[str, Any]:
    await cursor.execute(
        """
        select distinct
          f.funnel_id::text as "funnelId",
          f.name as "funnelName",
          f.status as "funnelStatus",
          l.lane_id::text as "laneId",
          l.name as "laneName",
          l.lane_type as "laneType",
          l.routing_mode as "routingMode",
          fsib.binding_role as "bindingRole",
          c.criterion_id::text as "criterionId",
          c.source_interest_template_id::text as "interestTemplateId",
          it.name as "interestName",
          ifr.semantic_decision as "semanticDecision",
          ifr.technical_filter_state as "technicalFilterState"
        from interest_filter_results ifr
        join criteria c on c.criterion_id = ifr.criterion_id
        join funnel_system_interest_bindings fsib
          on fsib.interest_template_id = c.source_interest_template_id
        join operator_funnels f
          on f.funnel_id = fsib.funnel_id
          and f.status <> 'archived'
        left join funnel_lanes l on l.lane_id = fsib.lane_id
        left join interest_templates it
          on it.interest_template_id = c.source_interest_template_id
        where ifr.doc_id = %s
          and ifr.filter_scope = 'system_criterion'
        order by f.name asc, l.name asc nulls last, it.name asc nulls last
        limit 50
        """,
        (doc_id,),
    )
    system_interest_bindings = _compact_json_rows(await cursor.fetchall() or [])

    await cursor.execute(
        """
        select distinct
          f.funnel_id::text as "funnelId",
          f.name as "funnelName",
          f.status as "funnelStatus",
          l.lane_id::text as "laneId",
          l.name as "laneName",
          l.lane_type as "laneType",
          l.routing_mode as "routingMode",
          fsb.source_role as "sourceRole",
          fsb.binding_role as "bindingRole",
          a.channel_id::text as "channelId",
          sc.name as "channelName",
          sc.provider_type as "providerType"
        from signal_candidates a
        join funnel_source_bindings fsb on fsb.channel_id = a.channel_id
        join operator_funnels f
          on f.funnel_id = fsb.funnel_id
          and f.status <> 'archived'
        left join funnel_lanes l on l.lane_id = fsb.lane_id
        left join source_channels sc on sc.channel_id = a.channel_id
        where a.doc_id = %s
        order by f.name asc, l.name asc nulls last, fsb.source_role asc
        limit 50
        """,
        (doc_id,),
    )
    source_bindings = _compact_json_rows(await cursor.fetchall() or [])

    await cursor.execute(
        """
        with prompt_template_ids as (
          select distinct value::uuid as prompt_template_id
          from (
            select nullif(ifr.explain_json #>> '{llmReview,promptTemplateId}', '') as value
            from interest_filter_results ifr
            where ifr.doc_id = %s
              and ifr.filter_scope = 'system_criterion'
            union all
            select lrl.prompt_template_id::text as value
            from llm_review_log lrl
            where lrl.doc_id = %s
              and lrl.prompt_template_id is not null
          ) raw_template_ids
          where value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        )
        select distinct
          f.funnel_id::text as "funnelId",
          f.name as "funnelName",
          f.status as "funnelStatus",
          l.lane_id::text as "laneId",
          l.name as "laneName",
          l.lane_type as "laneType",
          l.routing_mode as "routingMode",
          ftb.binding_role as "bindingRole",
          lpt.prompt_template_id::text as "promptTemplateId",
          lpt.name as "templateName",
          lpt.scope as "templateScope",
          lpt.purpose as "templatePurpose"
        from prompt_template_ids p
        join funnel_template_bindings ftb on ftb.prompt_template_id = p.prompt_template_id
        join operator_funnels f
          on f.funnel_id = ftb.funnel_id
          and f.status <> 'archived'
        left join funnel_lanes l on l.lane_id = ftb.lane_id
        left join llm_prompt_templates lpt on lpt.prompt_template_id = p.prompt_template_id
        order by f.name asc, l.name asc nulls last, lpt.name asc nulls last
        limit 50
        """,
        (doc_id, doc_id),
    )
    template_bindings = _compact_json_rows(await cursor.fetchall() or [])

    await cursor.execute(
        """
        select distinct
          f.funnel_id::text as "funnelId",
          f.name as "funnelName",
          f.status as "funnelStatus",
          l.lane_id::text as "laneId",
          l.name as "laneName",
          l.lane_type as "laneType",
          l.routing_mode as "routingMode",
          frjb.binding_role as "bindingRole",
          frjb.verification_target as "verificationTarget",
          frjb.reindex_job_id::text as "reindexJobId",
          frjb.plan_id::text as "planId",
          rj.job_kind as "jobKind",
          rj.status as "jobStatus",
          rj.requested_at as "requestedAt",
          rj.finished_at as "finishedAt"
        from funnel_reindex_job_bindings frjb
        join reindex_jobs rj on rj.reindex_job_id = frjb.reindex_job_id
        join operator_funnels f
          on f.funnel_id = frjb.funnel_id
          and f.status <> 'archived'
        left join funnel_lanes l on l.lane_id = frjb.lane_id
        where jsonb_typeof(coalesce(rj.options_json -> 'docIds', '[]'::jsonb)) = 'array'
          and exists (
            select 1
            from jsonb_array_elements_text(coalesce(rj.options_json -> 'docIds', '[]'::jsonb)) doc(value)
            where doc.value = %s
          )
        order by rj.requested_at desc nulls last
        limit 25
        """,
        (str(doc_id),),
    )
    replay_bindings = _compact_json_rows(await cursor.fetchall() or [])

    funnel_ids = sorted(
        {
            str(row.get("funnelId"))
            for rows in (
                system_interest_bindings,
                source_bindings,
                template_bindings,
                replay_bindings,
            )
            for row in rows
            if row.get("funnelId")
        }
    )
    lane_ids = sorted(
        {
            str(row.get("laneId"))
            for rows in (
                system_interest_bindings,
                source_bindings,
                template_bindings,
                replay_bindings,
            )
            for row in rows
            if row.get("laneId")
        }
    )
    return {
        "version": "2.0",
        "source": "worker.final_selection_results",
        "scope": "funnel_runtime_attribution",
        "funnelIds": funnel_ids,
        "laneIds": lane_ids,
        "systemInterestBindings": system_interest_bindings,
        "sourceBindings": source_bindings,
        "templateBindings": template_bindings,
        "replayBindings": replay_bindings,
        "hasRuntimeAttribution": bool(
            system_interest_bindings
            or source_bindings
            or template_bindings
            or replay_bindings
        ),
    }
