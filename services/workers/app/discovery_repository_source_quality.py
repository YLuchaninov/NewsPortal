from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from psycopg.types.json import Json

from .discovery_runtime_settings import coerce_discovery_cost_usd
from .source_scoring import clamp_score, summarize_channel_quality_metrics


class DiscoverySourceQualityRepositoryMixin:
    def _get_month_to_date_cost_usd(self, month_start: datetime) -> Decimal:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    select coalesce(sum(cost_usd), 0) as month_to_date_cost_usd
                    from discovery_cost_log
                    where created_at >= %s
                    """,
                    (month_start,),
                )
                row = cursor.fetchone() or {}
        return coerce_discovery_cost_usd(row.get("month_to_date_cost_usd"))

    def _log_cost(
        self,
        mission_id: str,
        hypothesis_id: str | None,
        operation: str,
        provider: str,
        cost_usd: Decimal,
        cost_cents: int,
        input_tokens: int | None,
        output_tokens: int | None,
        request_count: int,
        metadata: dict[str, Any],
    ) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    insert into discovery_cost_log (
                      mission_id,
                      hypothesis_id,
                      operation,
                      provider,
                      cost_usd,
                      cost_cents,
                      input_tokens,
                      output_tokens,
                      request_count,
                      metadata
                    )
                    values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                    """,
                    (
                        mission_id,
                        hypothesis_id,
                        operation,
                        provider,
                        coerce_discovery_cost_usd(cost_usd),
                        max(0, cost_cents),
                        input_tokens if input_tokens is None or input_tokens >= 0 else None,
                        output_tokens if output_tokens is None or output_tokens >= 0 else None,
                        max(0, request_count),
                        Json(metadata),
                    ),
                )

    def _upsert_source_profile(self, candidate_id: str, profile: dict[str, Any]) -> dict[str, Any]:
        with self._connect() as connection:
            with connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        insert into discovery_source_profiles (
                          candidate_id,
                          canonical_domain,
                          source_type,
                          org_name,
                          country,
                          languages,
                          ownership_transparency,
                          author_accountability,
                          source_linking_quality,
                          historical_stability,
                          technical_quality,
                          spam_signals,
                          trust_score,
                          extraction_data
                        )
                        values (
                          %s,
                          %s,
                          %s,
                          %s,
                          %s,
                          %s::text[],
                          %s,
                          %s,
                          %s,
                          %s,
                          %s,
                          %s,
                          %s,
                          %s::jsonb
                        )
                        on conflict (canonical_domain)
                        do update
                        set
                          candidate_id = excluded.candidate_id,
                          source_type = excluded.source_type,
                          org_name = excluded.org_name,
                          country = excluded.country,
                          languages = excluded.languages,
                          ownership_transparency = excluded.ownership_transparency,
                          author_accountability = excluded.author_accountability,
                          source_linking_quality = excluded.source_linking_quality,
                          historical_stability = excluded.historical_stability,
                          technical_quality = excluded.technical_quality,
                          spam_signals = excluded.spam_signals,
                          trust_score = excluded.trust_score,
                          extraction_data = excluded.extraction_data,
                          updated_at = now()
                        returning
                          source_profile_id::text as source_profile_id,
                          candidate_id::text as candidate_id,
                          channel_id::text as channel_id,
                          canonical_domain,
                          source_type,
                          trust_score,
                          extraction_data
                        """,
                        (
                            candidate_id,
                            profile["canonical_domain"],
                            profile.get("source_type") or "unknown",
                            profile.get("org_name"),
                            profile.get("country"),
                            profile.get("languages") or [],
                            clamp_score(profile.get("ownership_transparency")),
                            clamp_score(profile.get("author_accountability")),
                            clamp_score(profile.get("source_linking_quality")),
                            clamp_score(profile.get("historical_stability")),
                            clamp_score(profile.get("technical_quality")),
                            clamp_score(profile.get("spam_signals")),
                            clamp_score(profile.get("trust_score")),
                            Json(profile.get("extraction_data") or {}),
                        ),
                    )
                    row = cursor.fetchone()
        return dict(row or {})

    def _upsert_source_profile_for_recall_candidate(self, profile: dict[str, Any]) -> dict[str, Any]:
        with self._connect() as connection:
            with connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        insert into discovery_source_profiles (
                          candidate_id,
                          canonical_domain,
                          source_type,
                          org_name,
                          country,
                          languages,
                          ownership_transparency,
                          author_accountability,
                          source_linking_quality,
                          historical_stability,
                          technical_quality,
                          spam_signals,
                          trust_score,
                          extraction_data
                        )
                        values (
                          null,
                          %s,
                          %s,
                          %s,
                          %s,
                          %s::text[],
                          %s,
                          %s,
                          %s,
                          %s,
                          %s,
                          %s,
                          %s,
                          %s::jsonb
                        )
                        on conflict (canonical_domain)
                        do update
                        set
                          candidate_id = coalesce(discovery_source_profiles.candidate_id, excluded.candidate_id),
                          channel_id = coalesce(discovery_source_profiles.channel_id, excluded.channel_id),
                          source_type = excluded.source_type,
                          org_name = coalesce(discovery_source_profiles.org_name, excluded.org_name),
                          country = coalesce(discovery_source_profiles.country, excluded.country),
                          languages = excluded.languages,
                          ownership_transparency = excluded.ownership_transparency,
                          author_accountability = excluded.author_accountability,
                          source_linking_quality = excluded.source_linking_quality,
                          historical_stability = excluded.historical_stability,
                          technical_quality = excluded.technical_quality,
                          spam_signals = excluded.spam_signals,
                          trust_score = excluded.trust_score,
                          extraction_data = excluded.extraction_data,
                          updated_at = now()
                        returning
                          source_profile_id::text as source_profile_id,
                          candidate_id::text as candidate_id,
                          channel_id::text as channel_id,
                          canonical_domain,
                          source_type,
                          trust_score,
                          extraction_data
                        """,
                        (
                            profile["canonical_domain"],
                            profile.get("source_type") or "unknown",
                            profile.get("org_name"),
                            profile.get("country"),
                            profile.get("languages") or [],
                            clamp_score(profile.get("ownership_transparency")),
                            clamp_score(profile.get("author_accountability")),
                            clamp_score(profile.get("source_linking_quality")),
                            clamp_score(profile.get("historical_stability")),
                            clamp_score(profile.get("technical_quality")),
                            clamp_score(profile.get("spam_signals")),
                            clamp_score(profile.get("trust_score")),
                            Json(profile.get("extraction_data") or {}),
                        ),
                    )
                    row = cursor.fetchone()
        return dict(row or {})

    def _upsert_source_interest_score(
        self,
        mission_id: str,
        source_profile_id: str,
        channel_id: str | None,
        score_row: dict[str, Any],
    ) -> dict[str, Any]:
        with self._connect() as connection:
            with connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        insert into discovery_source_interest_scores (
                          source_profile_id,
                          channel_id,
                          mission_id,
                          topic_coverage,
                          specificity,
                          audience_fit,
                          evidence_depth,
                          signal_to_noise,
                          fit_score,
                          novelty_score,
                          lead_time_score,
                          yield_score,
                          duplication_score,
                          contextual_score,
                          role_labels,
                          scoring_breakdown
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
                          %s,
                          %s,
                          %s,
                          %s,
                          %s::text[],
                          %s::jsonb
                        )
                        on conflict (mission_id, source_profile_id)
                        do update
                        set
                          channel_id = excluded.channel_id,
                          topic_coverage = excluded.topic_coverage,
                          specificity = excluded.specificity,
                          audience_fit = excluded.audience_fit,
                          evidence_depth = excluded.evidence_depth,
                          signal_to_noise = excluded.signal_to_noise,
                          fit_score = excluded.fit_score,
                          novelty_score = excluded.novelty_score,
                          lead_time_score = excluded.lead_time_score,
                          yield_score = excluded.yield_score,
                          duplication_score = excluded.duplication_score,
                          contextual_score = excluded.contextual_score,
                          role_labels = excluded.role_labels,
                          scoring_breakdown = excluded.scoring_breakdown,
                          scored_at = now(),
                          updated_at = now()
                        returning
                          score_id::text as score_id,
                          source_profile_id::text as source_profile_id,
                          mission_id::text as mission_id,
                          contextual_score,
                          role_labels,
                          scoring_breakdown
                        """,
                        (
                            source_profile_id,
                            channel_id,
                            mission_id,
                            clamp_score(score_row.get("topic_coverage")),
                            clamp_score(score_row.get("specificity")),
                            clamp_score(score_row.get("audience_fit")),
                            clamp_score(score_row.get("evidence_depth")),
                            clamp_score(score_row.get("signal_to_noise")),
                            clamp_score(score_row.get("fit_score")),
                            clamp_score(score_row.get("novelty_score")),
                            clamp_score(score_row.get("lead_time_score")),
                            clamp_score(score_row.get("yield_score")),
                            clamp_score(score_row.get("duplication_score")),
                            clamp_score(score_row.get("contextual_score")),
                            score_row.get("role_labels") or [],
                            Json(score_row.get("scoring_breakdown") or {}),
                        ),
                    )
                    row = cursor.fetchone()
        return dict(row or {})

    def _upsert_source_quality_snapshot(
        self,
        source_profile_id: str,
        channel_id: str | None,
        snapshot_reason: str,
        snapshot_row: dict[str, Any],
    ) -> dict[str, Any]:
        with self._connect() as connection:
            with connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        insert into discovery_source_quality_snapshots (
                          source_profile_id,
                          channel_id,
                          snapshot_reason,
                          trust_score,
                          extraction_quality_score,
                          stability_score,
                          independence_score,
                          freshness_score,
                          lead_time_score,
                          yield_score,
                          duplication_score,
                          recall_score,
                          scoring_breakdown
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
                          %s,
                          %s,
                          %s::jsonb
                        )
                        on conflict (source_profile_id)
                        do update
                        set
                          channel_id = excluded.channel_id,
                          snapshot_reason = excluded.snapshot_reason,
                          trust_score = excluded.trust_score,
                          extraction_quality_score = excluded.extraction_quality_score,
                          stability_score = excluded.stability_score,
                          independence_score = excluded.independence_score,
                          freshness_score = excluded.freshness_score,
                          lead_time_score = excluded.lead_time_score,
                          yield_score = excluded.yield_score,
                          duplication_score = excluded.duplication_score,
                          recall_score = excluded.recall_score,
                          scoring_breakdown = excluded.scoring_breakdown,
                          scored_at = now(),
                          updated_at = now()
                        returning
                          snapshot_id::text as snapshot_id,
                          source_profile_id::text as source_profile_id,
                          channel_id::text as channel_id,
                          snapshot_reason,
                          recall_score,
                          scoring_breakdown,
                          scored_at
                        """,
                        (
                            source_profile_id,
                            channel_id,
                            snapshot_reason,
                            clamp_score(snapshot_row.get("trust_score")),
                            clamp_score(snapshot_row.get("extraction_quality_score")),
                            clamp_score(snapshot_row.get("stability_score")),
                            clamp_score(snapshot_row.get("independence_score")),
                            clamp_score(snapshot_row.get("freshness_score")),
                            clamp_score(snapshot_row.get("lead_time_score")),
                            clamp_score(snapshot_row.get("yield_score")),
                            clamp_score(snapshot_row.get("duplication_score")),
                            clamp_score(snapshot_row.get("recall_score")),
                            Json(snapshot_row.get("scoring_breakdown") or {}),
                        ),
                    )
                    row = cursor.fetchone()
        return dict(row or {})

    def _replace_portfolio_snapshot(
        self,
        mission_id: str,
        snapshot_reason: str,
        ranked_sources: list[dict[str, Any]],
        gaps: list[dict[str, Any]],
        summary: dict[str, Any],
    ) -> dict[str, Any]:
        with self._connect() as connection:
            with connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        insert into discovery_portfolio_snapshots (
                          mission_id,
                          snapshot_reason,
                          ranked_sources,
                          gaps_json,
                          summary_json
                        )
                        values (%s, %s, %s::jsonb, %s::jsonb, %s::jsonb)
                        returning
                          snapshot_id::text as snapshot_id,
                          mission_id::text as mission_id,
                          snapshot_reason,
                          ranked_sources,
                          gaps_json,
                          summary_json,
                          created_at
                        """,
                        (
                            mission_id,
                            snapshot_reason,
                            Json(ranked_sources),
                            Json(gaps),
                            Json(summary),
                        ),
                    )
                    row = cursor.fetchone()
                    if row is not None:
                        cursor.execute(
                            """
                            update discovery_missions
                            set latest_portfolio_snapshot_id = %s, updated_at = now()
                            where mission_id = %s
                            """,
                            (row["snapshot_id"], mission_id),
                        )
        return dict(row or {})

    def _list_mission_candidate_profiles(self, mission_id: str) -> list[dict[str, Any]]:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    select
                      c.candidate_id::text as candidate_id,
                      c.mission_id::text as mission_id,
                      c.hypothesis_id::text as hypothesis_id,
                      c.source_profile_id::text as source_profile_id,
                      c.registered_channel_id::text as registered_channel_id,
                      c.url,
                      c.final_url,
                      c.title,
                      c.description,
                      c.provider_type,
                      c.is_valid,
                      c.relevance_score,
                      c.llm_assessment,
                      c.sample_data,
                      c.status,
                      h.class_key,
                      h.tactic_key,
                      m.interest_graph,
                      sp.canonical_domain,
                      sp.source_type,
                      sp.source_linking_quality,
                      sp.historical_stability,
                      sp.technical_quality,
                      sp.spam_signals,
                      sp.trust_score,
                      sp.extraction_data
                    from discovery_candidates c
                    join discovery_hypotheses h on h.hypothesis_id = c.hypothesis_id
                    join discovery_missions m on m.mission_id = c.mission_id
                    left join discovery_source_profiles sp on sp.source_profile_id = c.source_profile_id
                    where c.mission_id = %s
                    order by c.created_at desc
                    """,
                    (mission_id,),
                )
                return [dict(row) for row in cursor.fetchall()]

    def _list_feedback_events(self, mission_id: str) -> list[dict[str, Any]]:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    select
                      feedback_event_id::text as feedback_event_id,
                      mission_id::text as mission_id,
                      candidate_id::text as candidate_id,
                      source_profile_id::text as source_profile_id,
                      feedback_type,
                      feedback_value,
                      notes,
                      created_by,
                      created_at
                    from discovery_feedback_events
                    where mission_id = %s
                    order by created_at desc
                    """,
                    (mission_id,),
                )
                return [dict(row) for row in cursor.fetchall()]

    def _upsert_strategy_stat(
        self,
        mission_id: str,
        class_key: str,
        tactic_key: str,
        success: bool,
        effectiveness: float | None,
    ) -> None:
        with self._connect() as connection:
            with connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        insert into discovery_strategy_stats (
                          mission_id,
                          class_key,
                          tactic_key,
                          trials,
                          successes,
                          alpha,
                          beta,
                          last_effectiveness,
                          last_selected_at
                        )
                        values (
                          %s,
                          %s,
                          %s,
                          1,
                          %s,
                          %s,
                          %s,
                          %s,
                          now()
                        )
                        on conflict (mission_id, class_key, tactic_key)
                        do update
                        set
                          trials = discovery_strategy_stats.trials + 1,
                          successes = discovery_strategy_stats.successes + %s,
                          alpha = discovery_strategy_stats.alpha + %s,
                          beta = discovery_strategy_stats.beta + %s,
                          last_effectiveness = %s,
                          last_selected_at = now(),
                          updated_at = now()
                        """,
                        (
                            mission_id,
                            class_key,
                            tactic_key,
                            1 if success else 0,
                            2 if success else 1,
                            1 if success else 2,
                            effectiveness,
                            1 if success else 0,
                            1 if success else 0,
                            0 if success else 1,
                            effectiveness,
                        ),
                    )

    def _get_channel_metrics(self, channel_id: str | None) -> dict[str, Any]:
        if not channel_id:
            return summarize_channel_quality_metrics()
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    with recent_articles as (
                      select
                        doc_id,
                        canonical_doc_id,
                        published_at,
                        ingested_at
                      from articles
                      where channel_id = %s
                        and coalesce(published_at, ingested_at) >= now() - interval '30 days'
                    ),
                    article_metrics as (
                      select
                        count(*)::int as total_articles_period,
                        count(distinct coalesce(canonical_doc_id, doc_id))::int as unique_articles_period,
                        greatest(
                          count(*)::int - count(distinct coalesce(canonical_doc_id, doc_id))::int,
                          0
                        )::int as duplicate_articles_period,
                        count(*) filter (
                          where coalesce(published_at, ingested_at) >= now() - interval '7 days'
                        )::int as fresh_articles_period,
                        avg(
                          greatest(
                            extract(epoch from (coalesce(ingested_at, now()) - published_at)),
                            0
                          )
                        ) filter (
                          where published_at is not null
                            and ingested_at is not null
                        ) as avg_article_delay_seconds
                      from recent_articles
                    ),
                    recent_fetch_runs as (
                      select
                        outcome_kind,
                        new_article_count,
                        duplicate_suppressed_count
                      from channel_fetch_runs
                      where channel_id = %s
                        and started_at >= now() - interval '30 days'
                    ),
                    fetch_metrics as (
                      select
                        count(*)::int as fetch_runs_period,
                        count(*) filter (
                          where outcome_kind in ('new_content', 'no_change')
                        )::int as successful_fetch_runs_period,
                        count(*) filter (
                          where outcome_kind = 'new_content'
                        )::int as new_content_fetch_runs_period,
                        count(*) filter (
                          where outcome_kind in ('transient_failure', 'hard_failure', 'rate_limited')
                        )::int as degraded_fetch_runs_period,
                        coalesce(sum(duplicate_suppressed_count), 0)::int as duplicate_suppressed_period,
                        coalesce(sum(new_article_count), 0)::int as new_articles_from_fetch_period
                      from recent_fetch_runs
                    )
                    select
                      am.total_articles_period,
                      am.unique_articles_period,
                      am.duplicate_articles_period,
                      am.fresh_articles_period,
                      am.avg_article_delay_seconds,
                      fm.fetch_runs_period,
                      fm.successful_fetch_runs_period,
                      fm.new_content_fetch_runs_period,
                      fm.degraded_fetch_runs_period,
                      fm.duplicate_suppressed_period,
                      fm.new_articles_from_fetch_period,
                      scrs.effective_poll_interval_seconds,
                      scrs.consecutive_failures,
                      scrs.last_result_kind
                    from article_metrics am
                    cross join fetch_metrics fm
                    left join source_channel_runtime_state scrs
                      on scrs.channel_id = %s
                    """,
                    (channel_id, channel_id, channel_id),
                )
                row = cursor.fetchone() or {}
        return summarize_channel_quality_metrics(dict(row))
