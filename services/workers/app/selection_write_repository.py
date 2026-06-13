from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable, Mapping
from typing import Any

import psycopg
from psycopg.types.json import Json

from .final_selection import summarize_final_selection_result
from .runtime_json import coerce_json_object, make_json_safe
from .selection_signal_summary import build_candidate_signal_tier_summary
from .system_feed import summarize_system_feed_result
from .worker_queues import SIGNAL_CANDIDATE_CRITERIA_MATCHED_EVENT

AsyncFunc = Callable[..., Awaitable[Any]]
SyncFunc = Callable[..., Any]


def _legacy_worker_main() -> Any:
    from . import main as legacy_main

    return legacy_main


def _collect_signal_candidate_shape_veto_reasons(signal_candidate: Mapping[str, Any]) -> set[str]:
    title = str(signal_candidate.get("title") or "").strip().lower()
    url = str(signal_candidate.get("url") or signal_candidate.get("source_url") or "").strip().lower()
    reasons: set[str] = set()

    if "github.com/" in url and (
        "/pull/" in url
        or "/commit/" in url
        or title.startswith(("feat:", "fix:", "chore:", "refactor:", "docs:", "test:"))
    ):
        reasons.add("repo_internal_change_noise")

    if any(host in url for host in ("linkedin.com/posts/", "linkedin.com/feed/update/")):
        reasons.add("professional_network_post_noise")

    if any(host in url for host in ("remotive.com/remote-jobs/", "remoteok.com/remote-jobs/")):
        reasons.add("jobs_only_post_noise")

    if title.startswith(("top ", "best ", "top 7 ", "top 10 ", "the best ")) or any(
        fragment in title
        for fragment in (
            " top ",
            " best ",
            " we've tested",
            "developers (202",
            "software we've tested",
        )
    ):
        reasons.add("directory_listicle_noise")

    return reasons


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


async def upsert_system_feed_result(
    cursor: psycopg.AsyncCursor[Any],
    doc_id: str | uuid.UUID,
    *,
    fetch_signal_candidate_for_update_func: AsyncFunc | None = None,
    upsert_final_selection_result_func: AsyncFunc | None = None,
    fetch_system_feed_result_row_func: AsyncFunc | None = None,
) -> dict[str, Any]:
    if (
        fetch_signal_candidate_for_update_func is None
        or upsert_final_selection_result_func is None
        or fetch_system_feed_result_row_func is None
    ):
        legacy_main = _legacy_worker_main()
        fetch_signal_candidate_for_update_func = (
            fetch_signal_candidate_for_update_func or legacy_main.fetch_signal_candidate_for_update
        )
        upsert_final_selection_result_func = (
            upsert_final_selection_result_func
            or legacy_main.upsert_final_selection_result
        )
        fetch_system_feed_result_row_func = (
            fetch_system_feed_result_row_func
            or legacy_main.fetch_system_feed_result_row
        )

    signal_candidate = await fetch_signal_candidate_for_update_func(cursor, doc_id)
    final_selection_result = await upsert_final_selection_result_func(
        cursor,
        signal_candidate=signal_candidate,
    )
    previous_result = await fetch_system_feed_result_row_func(cursor, doc_id)
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


async def find_reusable_criterion_llm_review(
    cursor: psycopg.AsyncCursor[Any],
    *,
    doc_id: str | uuid.UUID,
    criterion_id: str | uuid.UUID,
    canonical_document_id: str | uuid.UUID | None,
    prompt_template_id: str | uuid.UUID | None = None,
    prompt_version: int | None = None,
) -> dict[str, Any] | None:
    canonical_uuid = None
    if str(canonical_document_id or "").strip():
        try:
            canonical_uuid = uuid.UUID(str(canonical_document_id))
        except (TypeError, ValueError):
            canonical_uuid = None
    doc_uuid = uuid.UUID(str(doc_id))
    criterion_uuid = uuid.UUID(str(criterion_id))
    prompt_template_uuid = None
    if str(prompt_template_id or "").strip():
        try:
            prompt_template_uuid = uuid.UUID(str(prompt_template_id))
        except (TypeError, ValueError):
            prompt_template_uuid = None
    await cursor.execute(
        """
        select
          lrl.review_id::text as review_id,
          lrl.doc_id::text as reviewed_doc_id,
          reviewed_signal_candidate.canonical_doc_id::text as reviewed_canonical_document_id,
          lrl.decision as provider_decision,
          lrl.score,
          lrl.prompt_template_id::text as prompt_template_id,
          lrl.prompt_version,
          lrl.created_at
        from llm_review_log lrl
        join signal_candidates reviewed_signal_candidate on reviewed_signal_candidate.doc_id = lrl.doc_id
        where lrl.scope = 'criterion'
          and lrl.target_id = %s
          and (%s::uuid is null or lrl.prompt_template_id = %s::uuid)
          and (%s::integer is null or lrl.prompt_version = %s::integer)
          and (
            (%s::uuid is not null and reviewed_signal_candidate.canonical_doc_id = %s::uuid)
            or (%s::uuid is null and lrl.doc_id = %s)
          )
        order by lrl.created_at desc
        limit 1
        """,
        (
            criterion_uuid,
            prompt_template_uuid,
            prompt_template_uuid,
            int(prompt_version) if prompt_version is not None else None,
            int(prompt_version) if prompt_version is not None else None,
            canonical_uuid,
            canonical_uuid,
            canonical_uuid,
            doc_uuid,
        ),
    )
    return await cursor.fetchone()


def resolve_criterion_review_final_decision(provider_decision: str | None) -> str:
    normalized = str(provider_decision or "").strip()
    if normalized == "approve":
        return "relevant"
    if normalized == "uncertain":
        return "gray_zone"
    return "irrelevant"


async def persist_criterion_review_resolution(
    cursor: psycopg.AsyncCursor[Any],
    *,
    signal_candidate: Mapping[str, Any],
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
    resolve_interest_filter_context_func: AsyncFunc | None = None,
    resolve_criterion_filter_outcome_func: SyncFunc | None = None,
    upsert_interest_filter_result_func: AsyncFunc | None = None,
    build_interest_filter_explain_func: SyncFunc | None = None,
    upsert_system_feed_result_func: AsyncFunc | None = None,
    should_dispatch_clustering_func: SyncFunc | None = None,
    insert_outbox_event_func: AsyncFunc | None = None,
) -> dict[str, Any]:
    if (
        resolve_interest_filter_context_func is None
        or resolve_criterion_filter_outcome_func is None
        or upsert_interest_filter_result_func is None
        or build_interest_filter_explain_func is None
        or upsert_system_feed_result_func is None
        or should_dispatch_clustering_func is None
        or insert_outbox_event_func is None
    ):
        legacy_main = _legacy_worker_main()
        resolve_interest_filter_context_func = (
            resolve_interest_filter_context_func
            or legacy_main.resolve_interest_filter_context
        )
        resolve_criterion_filter_outcome_func = (
            resolve_criterion_filter_outcome_func
            or legacy_main.resolve_criterion_filter_outcome
        )
        upsert_interest_filter_result_func = (
            upsert_interest_filter_result_func
            or legacy_main.upsert_interest_filter_result
        )
        build_interest_filter_explain_func = (
            build_interest_filter_explain_func
            or legacy_main.build_interest_filter_explain
        )
        upsert_system_feed_result_func = (
            upsert_system_feed_result_func or legacy_main.upsert_system_feed_result
        )
        should_dispatch_clustering_func = (
            should_dispatch_clustering_func or legacy_main.should_dispatch_clustering
        )
        insert_outbox_event_func = insert_outbox_event_func or legacy_main.insert_outbox_event

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
            signal_candidate["doc_id"],
            criterion_id,
        ),
    )
    filter_context = await resolve_interest_filter_context_func(
        cursor,
        signal_candidate=signal_candidate,
        prefer_story_cluster=False,
    )
    technical_filter_state, semantic_decision = resolve_criterion_filter_outcome_func(
        pass_filters=True,
        compat_decision=final_decision,
    )
    await upsert_interest_filter_result_func(
        cursor,
        filter_scope="system_criterion",
        doc_id=uuid.UUID(str(signal_candidate["doc_id"])),
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
        explain_json=build_interest_filter_explain_func(
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
        system_feed_result = await upsert_system_feed_result_func(
            cursor,
            signal_candidate["doc_id"],
        )
        if (
            should_dispatch_clustering_func(system_feed_result)
            and not historical_backfill
            and not suppress_pipeline_fanout
        ):
            await insert_outbox_event_func(
                cursor,
                SIGNAL_CANDIDATE_CRITERIA_MATCHED_EVENT,
                "signal_candidate",
                signal_candidate["doc_id"],
                {"docId": str(signal_candidate["doc_id"]), "version": 1},
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
    signal_candidate: Mapping[str, Any],
    fetch_final_selection_result_row_func: AsyncFunc | None = None,
    resolve_interest_filter_context_func: AsyncFunc | None = None,
) -> dict[str, Any]:
    if (
        fetch_final_selection_result_row_func is None
        or resolve_interest_filter_context_func is None
    ):
        legacy_main = _legacy_worker_main()
        fetch_final_selection_result_row_func = (
            fetch_final_selection_result_row_func
            or legacy_main.fetch_final_selection_result_row
        )
        resolve_interest_filter_context_func = (
            resolve_interest_filter_context_func
            or legacy_main.resolve_interest_filter_context
        )

    doc_id = uuid.UUID(str(signal_candidate["doc_id"]))
    previous_result = await fetch_final_selection_result_row_func(cursor, doc_id)
    selection_context = await resolve_interest_filter_context_func(
        cursor,
        signal_candidate=signal_candidate,
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
            where coalesce((explain_json -> 'candidateSignals' ->> 'candidateSelectionEligible')::boolean, false)
          )::int as candidate_signal_eligible_count,
          count(*) filter (
            where semantic_decision = 'match'
              and coalesce((explain_json -> 'candidateSignals' ->> 'candidateSelectionEligible')::boolean, false)
              and coalesce(explain_json -> 'candidateSignals' ->> 'candidateSignalTier', '') in ('buyer_intent', 'project_intent')
              and coalesce((explain_json -> 'candidateSignals' ->> 'positiveSignalCount')::int, 0) >= 3
              and coalesce((explain_json -> 'candidateSignals' ->> 'positiveSignalHitCount')::int, 0) >= 4
              and coalesce((explain_json -> 'candidateSignals' ->> 'noiseSignalCount')::int, 0) = 0
              and jsonb_array_length(coalesce(explain_json -> 'filterReasons', '[]'::jsonb)) = 0
          )::int as candidate_signal_strong_match_count,
          count(*) filter (
            where coalesce((explain_json -> 'candidateSignals' ->> 'candidateSelectionEligible')::boolean, false)
              and coalesce((explain_json -> 'candidateSignals' ->> 'evidenceLedUplift')::boolean, false)
              and coalesce(explain_json -> 'candidateSignals' ->> 'candidateSignalTier', '') in ('buyer_intent', 'project_intent')
              and coalesce(explain_json -> 'selectionProfile' ->> 'autoSelectMode', '') in ('evidence_led', 'evidence_or_llm')
              and coalesce((explain_json -> 'candidateSignals' ->> 'positiveSignalCount')::int, 0) >= coalesce(nullif(explain_json -> 'selectionProfile' ->> 'autoSelectMinPositiveGroups', '')::int, 3)
              and coalesce((explain_json -> 'candidateSignals' ->> 'positiveSignalHitCount')::int, 0) >= coalesce(nullif(explain_json -> 'selectionProfile' ->> 'autoSelectMinCueHits', '')::int, 4)
              and (
                coalesce(nullif(explain_json -> 'selectionProfile' ->> 'autoSelectRequiresNoNoise', '')::boolean, true) = false
                or coalesce((explain_json -> 'candidateSignals' ->> 'noiseSignalCount')::int, 0) = 0
              )
              and (
                coalesce(nullif(explain_json -> 'selectionProfile' ->> 'autoSelectRequiresNoTechnicalVeto', '')::boolean, true) = false
                or jsonb_array_length(coalesce(explain_json -> 'filterReasons', '[]'::jsonb)) = 0
              )
          )::int as candidate_signal_auto_select_count,
          count(*) filter (
            where coalesce(explain_json -> 'llmReview' ->> 'decision', '') = 'approve'
              and coalesce(explain_json -> 'selectionProfile' ->> 'autoSelectMode', '') in ('llm_approved', 'evidence_or_llm')
              and jsonb_array_length(coalesce(explain_json -> 'filterReasons', '[]'::jsonb)) = 0
          )::int as llm_approved_auto_select_count,
          count(*) filter (
            where coalesce((explain_json -> 'candidateSignals' ->> 'candidateSelectionEligible')::boolean, false)
              and coalesce(explain_json -> 'candidateSignals' ->> 'candidateSignalTier', '') = 'context'
          )::int as candidate_signal_context_count,
          count(*) filter (
            where coalesce((explain_json -> 'candidateSignals' ->> 'candidateSelectionEligible')::boolean, false)
              and coalesce(explain_json -> 'candidateSignals' ->> 'candidateSignalTier', '') = 'buyer_intent'
          )::int as candidate_signal_buyer_intent_count,
          count(*) filter (
            where coalesce((explain_json -> 'candidateSignals' ->> 'candidateSelectionEligible')::boolean, false)
              and coalesce(explain_json -> 'candidateSignals' ->> 'candidateSignalTier', '') = 'project_intent'
          )::int as candidate_signal_project_intent_count,
          count(*) filter (
            where coalesce(explain_json -> 'llmReview' ->> 'source', '') = 'reused_canonical_llm_review'
          )::int as canonical_review_reused_count,
          count(*) filter (where technical_filter_state = 'filtered_out')::int as technical_filtered_out_count
        from interest_filter_results
        join criteria c
          on c.criterion_id = interest_filter_results.criterion_id
          and c.enabled = true
        where doc_id = %s
          and filter_scope = 'system_criterion'
        """,
        (doc_id,),
    )
    counts = await cursor.fetchone() or {}
    await cursor.execute(
        """
        select explain_json -> 'filterReasons' as filter_reasons
        from interest_filter_results
        join criteria c
          on c.criterion_id = interest_filter_results.criterion_id
          and c.enabled = true
        where doc_id = %s
          and filter_scope = 'system_criterion'
        """,
        (doc_id,),
    )
    filter_reason_rows = await cursor.fetchall() or []
    filter_reason_counts: dict[str, int] = {}
    for row in filter_reason_rows:
        raw_reasons = row.get("filter_reasons")
        if not isinstance(raw_reasons, list):
            continue
        for raw_reason in raw_reasons:
            reason = str(raw_reason or "").strip()
            if not reason:
                continue
            filter_reason_counts[reason] = filter_reason_counts.get(reason, 0) + 1
    for reason in _collect_signal_candidate_shape_veto_reasons(signal_candidate):
        filter_reason_counts[reason] = max(
            filter_reason_counts.get(reason, 0),
            int(counts.get("total_filter_count") or 0),
        )
    candidate_signal_tier, candidate_signal_tier_counts = build_candidate_signal_tier_summary(
        counts
    )
    duplicate_signal_candidate_count = 1
    if selection_context.get("canonicalDocumentId") is not None:
        await cursor.execute(
            """
            select count(*)::int as duplicate_signal_candidate_count
            from signal_candidates
            where canonical_doc_id = %s
            """,
            (selection_context["canonicalDocumentId"],),
        )
        duplicate_row = await cursor.fetchone() or {}
        duplicate_signal_candidate_count = max(
            int(duplicate_row.get("duplicate_signal_candidate_count") or 0),
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
        candidate_signal_eligible_count=int(
            counts.get("candidate_signal_eligible_count") or 0
        ),
        candidate_signal_strong_match_count=int(
            counts.get("candidate_signal_strong_match_count") or 0
        ),
        candidate_signal_auto_select_count=int(
            counts.get("candidate_signal_auto_select_count") or 0
        ),
        llm_approved_auto_select_count=int(
            counts.get("llm_approved_auto_select_count") or 0
        ),
        candidate_signal_tier=candidate_signal_tier,
        candidate_signal_tier_counts=candidate_signal_tier_counts,
        filter_reason_counts=filter_reason_counts,
    )
    explain_json = coerce_json_object(summary.get("explain_json"))
    explain_json["candidateSignalUpliftCount"] = int(
        counts.get("candidate_signal_uplift_count") or 0
    )
    explain_json["candidateSignalEligibleCount"] = int(
        counts.get("candidate_signal_eligible_count") or 0
    )
    explain_json["candidateSignalStrongMatchCount"] = int(
        counts.get("candidate_signal_strong_match_count") or 0
    )
    explain_json["candidateSignalAutoSelectCount"] = int(
        counts.get("candidate_signal_auto_select_count") or 0
    )
    explain_json["llmApprovedAutoSelectCount"] = int(
        counts.get("llm_approved_auto_select_count") or 0
    )
    explain_json["candidateSignalTier"] = candidate_signal_tier
    explain_json["candidateSignalTierCounts"] = candidate_signal_tier_counts
    explain_json["canonicalReviewReused"] = bool(
        counts.get("canonical_review_reused_count") or 0
    )
    explain_json["canonicalReviewReusedCount"] = int(
        counts.get("canonical_review_reused_count") or 0
    )
    explain_json["duplicateSignalCandidateCountForCanonical"] = duplicate_signal_candidate_count
    explain_json["canonicalSelectionReused"] = bool(
        duplicate_signal_candidate_count > 1 and bool(summary["isSelected"])
    )
    explain_json["selectionReuseSource"] = (
        "canonical_reused"
        if duplicate_signal_candidate_count > 1 and bool(summary["isSelected"])
        else "signal_candidate_level"
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
    funnel_runtime_attribution = await collect_funnel_runtime_attribution(cursor, doc_id)
    if funnel_runtime_attribution["hasRuntimeAttribution"]:
        explain_json["funnelRuntimeAttribution"] = funnel_runtime_attribution
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
        "candidateSignalEligibleCount": int(
            counts.get("candidate_signal_eligible_count") or 0
        ),
        "candidateSignalStrongMatchCount": int(
            counts.get("candidate_signal_strong_match_count") or 0
        ),
        "candidateSignalAutoSelectCount": int(
            counts.get("candidate_signal_auto_select_count") or 0
        ),
        "llmApprovedAutoSelectCount": int(
            counts.get("llm_approved_auto_select_count") or 0
        ),
        "canonicalReviewReused": bool(counts.get("canonical_review_reused_count") or 0),
        "canonicalReviewReusedCount": int(
            counts.get("canonical_review_reused_count") or 0
        ),
        "duplicateSignalCandidateCountForCanonical": duplicate_signal_candidate_count,
        "canonicalSelectionReused": bool(
            duplicate_signal_candidate_count > 1 and bool(summary["isSelected"])
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
        "funnelRuntimeAttribution": (
            funnel_runtime_attribution
            if funnel_runtime_attribution["hasRuntimeAttribution"]
            else None
        ),
        "explain_json": explain_json,
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
