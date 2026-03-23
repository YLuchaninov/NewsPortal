from __future__ import annotations

import os
from typing import Any

import psycopg
from fastapi import FastAPI, HTTPException, Query
from psycopg.rows import dict_row


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


def query_all(sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    with psycopg.connect(build_database_url(), row_factory=dict_row) as connection:
        with connection.cursor() as cursor:
            cursor.execute(sql, params)
            return [dict(row) for row in cursor.fetchall()]


def query_one(sql: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
    rows = query_all(sql, params)
    return rows[0] if rows else None


def check_database() -> None:
    with psycopg.connect(build_database_url()) as connection:
        with connection.cursor() as cursor:
            cursor.execute("select 1")


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


@app.get("/articles")
def list_articles(limit: int = Query(default=20, ge=1, le=100)) -> list[dict[str, Any]]:
    return query_all(
        """
        select
          a.doc_id,
          a.title,
          a.lead,
          a.lang,
          a.published_at,
          a.processing_state,
          a.visibility_state,
          a.event_cluster_id,
          a.has_media,
          coalesce(ars.like_count, 0) as like_count,
          coalesce(ars.dislike_count, 0) as dislike_count
        from articles a
        left join article_reaction_stats ars on ars.doc_id = a.doc_id
        order by a.published_at desc, a.ingested_at desc
        limit %s
        """,
        (limit,),
    )


@app.get("/articles/{doc_id}")
def get_article(doc_id: str) -> dict[str, Any]:
    article = query_one(
        """
        select
          a.*,
          coalesce(ars.like_count, 0) as like_count,
          coalesce(ars.dislike_count, 0) as dislike_count
        from articles a
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
    return article


@app.get("/articles/{doc_id}/explain")
def get_article_explain(doc_id: str) -> dict[str, Any]:
    article = get_article(doc_id)
    return {
        "article": article,
        "criteria_matches": query_all(
            """
            select *
            from criterion_match_results
            where doc_id = %s
            order by created_at desc
            """,
            (doc_id,),
        ),
        "interest_matches": query_all(
            """
            select *
            from interest_match_results
            where doc_id = %s
            order by created_at desc
            """,
            (doc_id,),
        ),
        "llm_reviews": query_all(
            """
            select *
            from llm_review_log
            where doc_id = %s
            order by created_at desc
            """,
            (doc_id,),
        ),
        "notifications": query_all(
            """
            select *
            from notification_log
            where doc_id = %s
            order by created_at desc
            """,
            (doc_id,),
        ),
    }


@app.get("/dashboard/summary")
def get_dashboard_summary() -> dict[str, Any]:
    counts = query_one(
        """
        select
          (select count(*)::int from articles where visibility_state = 'visible') as active_news,
          (select count(*)::int from articles) as processed_total,
          (select count(*)::int from articles where ingested_at >= now() - interval '1 day') as processed_today,
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
    return counts or {}


@app.get("/channels")
def list_channels() -> list[dict[str, Any]]:
    return query_all(
        """
        select
          sc.channel_id,
          sc.name,
          sc.provider_type,
          sc.fetch_url,
          sc.language,
          sc.is_active,
          sc.poll_interval_seconds,
          sc.config_json,
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
        order by sc.updated_at desc, sc.created_at desc
        """
    )


@app.get("/clusters")
def list_clusters(limit: int = Query(default=20, ge=1, le=100)) -> list[dict[str, Any]]:
    return query_all(
        """
        select
          ec.*,
          (
            select json_agg(ecm.doc_id order by ecm.created_at desc)
            from event_cluster_members ecm
            where ecm.cluster_id = ec.cluster_id
          ) as doc_ids
        from event_clusters ec
        order by ec.max_published_at desc nulls last, ec.updated_at desc
        limit %s
        """,
        (limit,),
    )


@app.get("/users/{user_id}/interests")
def list_user_interests(user_id: str) -> list[dict[str, Any]]:
    return query_all(
        """
        select
          ui.*,
          uic.compiled_json,
          uic.compiled_at,
          uic.error_text
        from user_interests ui
        left join user_interests_compiled uic on uic.interest_id = ui.interest_id
        where ui.user_id = %s
        order by ui.updated_at desc
        """,
        (user_id,),
    )


@app.get("/users/{user_id}/notifications")
def list_user_notifications(user_id: str, limit: int = Query(default=20, ge=1, le=100)) -> list[dict[str, Any]]:
    return query_all(
        """
        select
          nl.*,
          a.title as article_title,
          a.lead as article_lead
        from notification_log nl
        join articles a on a.doc_id = nl.doc_id
        where nl.user_id = %s
        order by nl.created_at desc
        limit %s
        """,
        (user_id, limit),
    )


@app.get("/templates/llm")
def list_llm_templates() -> list[dict[str, Any]]:
    return query_all(
        """
        select *
        from llm_prompt_templates
        order by is_active desc, updated_at desc
        """
    )


@app.get("/templates/interests")
def list_interest_templates() -> list[dict[str, Any]]:
    return query_all(
        """
        select *
        from interest_templates
        where is_active = true
        order by updated_at desc, created_at desc
        """
    )


@app.get("/maintenance/reindex-jobs")
def list_reindex_jobs(limit: int = Query(default=20, ge=1, le=100)) -> list[dict[str, Any]]:
    return query_all(
        """
        select *
        from reindex_jobs
        order by requested_at desc
        limit %s
        """,
        (limit,),
    )


@app.get("/maintenance/fetch-runs")
def list_fetch_runs(
    limit: int = Query(default=50, ge=1, le=200),
    channel_id: str | None = Query(default=None),
) -> list[dict[str, Any]]:
    if channel_id:
        return query_all(
            """
            select *
            from channel_fetch_runs
            where channel_id = %s
            order by started_at desc
            limit %s
            """,
            (channel_id, limit),
        )

    return query_all(
        """
        select *
        from channel_fetch_runs
        order by started_at desc
        limit %s
        """,
        (limit,),
    )


@app.get("/maintenance/llm-reviews")
def list_llm_reviews(limit: int = Query(default=50, ge=1, le=200)) -> list[dict[str, Any]]:
    return query_all(
        """
        select
          lr.*,
          a.title as article_title
        from llm_review_log lr
        join articles a on a.doc_id = lr.doc_id
        order by lr.created_at desc
        limit %s
        """,
        (limit,),
    )


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
