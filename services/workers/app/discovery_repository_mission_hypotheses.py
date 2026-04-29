from __future__ import annotations

from decimal import Decimal
from typing import Any

from psycopg.types.json import Json

from .discovery_planning import normalize_text_list as _normalize_text_list
from .discovery_runtime_settings import DiscoverySettings, coerce_discovery_cost_usd
from .task_engine.adapters.common import normalize_url


class DiscoveryMissionHypothesisRepositoryMixin:
    def _ensure_interest_template_missions(self, settings: DiscoverySettings) -> list[str]:
        created_ids: list[str] = []
        with self._connect() as connection:
            with connection.transaction():
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        select
                          interest_template_id::text as interest_template_id,
                          name,
                          positive_texts,
                          languages_allowed
                        from interest_templates
                        where is_active = true
                        order by priority desc, created_at desc
                        """
                    )
                    templates = cursor.fetchall()
                    for template in templates:
                        template_id = str(template["interest_template_id"])
                        cursor.execute(
                            """
                            select mission_id::text as mission_id
                            from discovery_missions
                            where source_kind = 'interest_template'
                              and source_ref_id = %s
                              and status in ('planned', 'active', 'paused')
                            order by created_at desc
                            limit 1
                            """,
                            (template_id,),
                        )
                        if cursor.fetchone() is not None:
                            continue
                        seed_topics = [str(template["name"]).strip(), *_normalize_text_list(template["positive_texts"])][:8]
                        seed_languages = _normalize_text_list(template["languages_allowed"])
                        cursor.execute(
                            """
                            insert into discovery_missions (
                              title,
                              description,
                              source_kind,
                              source_ref_id,
                              seed_topics,
                              seed_languages,
                              target_provider_types,
                              max_hypotheses,
                              max_sources,
                              budget_cents,
                              status,
                              created_by
                            )
                            values (
                              %s,
                              %s,
                              'interest_template',
                              %s,
                              %s::text[],
                              %s::text[],
                              '{rss,website,api,email_imap,youtube}'::text[],
                              %s,
                              %s,
                              %s,
                              'active',
                              'discovery:auto'
                            )
                            returning mission_id::text as mission_id
                            """,
                            (
                                f"Interest template: {template['name']}",
                                f"Adaptive discovery mission for interest template {template['name']}.",
                                template_id,
                                seed_topics,
                                seed_languages,
                                min(12, settings.max_hypotheses_per_run),
                                settings.default_max_sources,
                                settings.default_budget_cents,
                            ),
                        )
                        row = cursor.fetchone()
                        if row is not None:
                            created_ids.append(str(row["mission_id"]))
        return created_ids

    def _list_runnable_missions(self, mission_id: str | None) -> list[dict[str, Any]]:
        where_clauses = ["status in ('planned', 'active')"]
        params: list[Any] = []
        if mission_id is not None:
            where_clauses.append("mission_id = %s")
            params.append(mission_id)
        sql = f"""
            select
              mission_id::text as mission_id,
              title,
              description,
              source_kind,
              source_ref_id::text as source_ref_id,
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
              spent_cents,
              status,
              priority,
              profile_id::text as profile_id,
              applied_profile_version,
              applied_policy_json,
              run_count,
              last_run_at,
              latest_portfolio_snapshot_id::text as latest_portfolio_snapshot_id,
              created_by
            from discovery_missions
            where {' and '.join(where_clauses)}
            order by priority desc, created_at asc
        """
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(sql, tuple(params))
                return [dict(row) for row in cursor.fetchall()]

    def _list_runnable_recall_missions(self, recall_mission_id: str | None) -> list[dict[str, Any]]:
        where_clauses = ["status in ('planned', 'active')"]
        params: list[Any] = []
        if recall_mission_id is not None:
            where_clauses.append("recall_mission_id = %s")
            params.append(recall_mission_id)
        sql = f"""
            select
              recall_mission_id::text as recall_mission_id,
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
              profile_id::text as profile_id,
              applied_profile_version,
              applied_policy_json,
              created_by,
              created_at,
              updated_at
            from discovery_recall_missions
            where {' and '.join(where_clauses)}
            order by updated_at desc, created_at asc
        """
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(sql, tuple(params))
                return [dict(row) for row in cursor.fetchall()]

    def _get_mission(self, mission_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    select
                      mission_id::text as mission_id,
                      title,
                      description,
                      source_kind,
                      source_ref_id::text as source_ref_id,
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
                      spent_cents,
                      status,
                      priority,
                      profile_id::text as profile_id,
                      applied_profile_version,
                      applied_policy_json,
                      run_count,
                      last_run_at,
                      latest_portfolio_snapshot_id::text as latest_portfolio_snapshot_id,
                      created_by,
                      created_at,
                      updated_at
                    from discovery_missions
                    where mission_id = %s
                    """,
                    (mission_id,),
                )
                row = cursor.fetchone()
        return dict(row) if row is not None else None

    def _get_recall_mission(self, recall_mission_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    select
                      recall_mission_id::text as recall_mission_id,
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
                      profile_id::text as profile_id,
                      applied_profile_version,
                      applied_policy_json,
                      created_by,
                      created_at,
                      updated_at
                    from discovery_recall_missions
                    where recall_mission_id = %s
                    """,
                    (recall_mission_id,),
                )
                row = cursor.fetchone()
        return dict(row) if row is not None else None

    def _list_active_hypothesis_classes(
        self,
        class_keys: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                if class_keys:
                    cursor.execute(
                        """
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
                        where status = 'active'
                          and class_key = any(%s::text[])
                        order by sort_order asc, class_key asc
                        """,
                        (class_keys,),
                    )
                else:
                    cursor.execute(
                        """
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
                        where status = 'active'
                        order by sort_order asc, class_key asc
                        """
                    )
                return [dict(row) for row in cursor.fetchall()]

    def _list_strategy_stats(self, mission_id: str) -> list[dict[str, Any]]:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    select
                      mission_id::text as mission_id,
                      class_key,
                      tactic_key,
                      trials,
                      successes,
                      alpha,
                      beta,
                      last_effectiveness,
                      last_selected_at,
                      updated_at
                    from discovery_strategy_stats
                    where mission_id = %s
                    order by class_key asc, tactic_key asc
                    """,
                    (mission_id,),
                )
                return [dict(row) for row in cursor.fetchall()]

    def _list_existing_source_channels(self) -> dict[str, str]:
        channels: dict[str, str] = {}
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    select channel_id::text as channel_id, fetch_url, homepage_url
                    from source_channels
                    where fetch_url is not null or homepage_url is not null
                    """
                )
                for row in cursor.fetchall():
                    channel_id = str(row.get("channel_id") or "").strip()
                    if not channel_id:
                        continue
                    for candidate in (row["fetch_url"], row["homepage_url"]):
                        if isinstance(candidate, str) and candidate.strip():
                            channels.setdefault(normalize_url(candidate), channel_id)
        return channels

    def _list_existing_source_urls(self) -> set[str]:
        return set(self._list_existing_source_channels().keys())

    def _list_recent_hypotheses(self, mission_id: str) -> list[dict[str, Any]]:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    select
                      hypothesis_id::text as hypothesis_id,
                      class_key,
                      tactic_key,
                      search_query,
                      target_provider_type,
                      created_at
                    from discovery_hypotheses
                    where mission_id = %s
                    order by created_at desc
                    limit 50
                    """,
                    (mission_id,),
                )
                return [dict(row) for row in cursor.fetchall()]

    def _upsert_interest_graph(
        self,
        mission_id: str,
        interest_graph: dict[str, Any],
        status: str,
        error_text: str | None,
    ) -> dict[str, Any] | None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    update discovery_missions
                    set
                      interest_graph = %s::jsonb,
                      interest_graph_status = %s,
                      interest_graph_version = interest_graph_version + 1,
                      interest_graph_compiled_at = case when %s = 'compiled' then now() else interest_graph_compiled_at end,
                      interest_graph_error_text = %s,
                      updated_at = now()
                    where mission_id = %s
                    returning
                      mission_id::text as mission_id,
                      interest_graph,
                      interest_graph_status,
                      interest_graph_version,
                      interest_graph_compiled_at,
                      interest_graph_error_text
                    """,
                    (Json(interest_graph), status, status, error_text, mission_id),
                )
                row = cursor.fetchone()
        return dict(row) if row is not None else None

    def _insert_hypotheses(self, mission_id: str, hypotheses: list[dict[str, Any]]) -> list[str]:
        created_ids: list[str] = []
        if not hypotheses:
            return created_ids
        with self._connect() as connection:
            with connection.transaction():
                with connection.cursor() as cursor:
                    for hypothesis in hypotheses:
                        cursor.execute(
                            """
                            insert into discovery_hypotheses (
                              mission_id,
                              class_key,
                              tactic_key,
                              search_query,
                              target_urls,
                              target_provider_type,
                              generation_context,
                              expected_value,
                              status
                            )
                            values (%s, %s, %s, %s, %s::text[], %s, %s::jsonb, %s, 'pending')
                            on conflict (mission_id, class_key, tactic_key, search_query)
                            do nothing
                            returning hypothesis_id::text as hypothesis_id
                            """,
                            (
                                mission_id,
                                hypothesis["class_key"],
                                hypothesis["tactic_key"],
                                hypothesis.get("search_query"),
                                hypothesis.get("target_urls") or [],
                                hypothesis.get("target_provider_type") or "rss",
                                Json(hypothesis.get("generation_context") or {}),
                                hypothesis.get("expected_value"),
                            ),
                        )
                        row = cursor.fetchone()
                        if row is not None:
                            created_ids.append(str(row["hypothesis_id"]))
        return created_ids

    def _list_pending_hypotheses(self, mission_id: str | None, limit: int) -> list[dict[str, Any]]:
        where_clauses = ["h.status = 'pending'", "m.status in ('planned', 'active')"]
        params: list[Any] = []
        if mission_id is not None:
            where_clauses.append("m.mission_id = %s")
            params.append(mission_id)
        params.append(limit)
        sql = f"""
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
              m.interest_graph,
              m.profile_id::text as profile_id,
              m.applied_profile_version,
              m.applied_policy_json,
              m.budget_cents,
              (
                select coalesce(sum(cost_usd), 0)
                from discovery_cost_log dcl
                where dcl.mission_id = m.mission_id
              ) as spent_usd
            from discovery_hypotheses h
            join discovery_missions m on m.mission_id = h.mission_id
            where {' and '.join(where_clauses)}
            order by m.priority desc, h.created_at asc
            limit %s
        """
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(sql, tuple(params))
                return [dict(row) for row in cursor.fetchall()]

    def _mark_hypothesis_running(self, hypothesis_id: str, sequence_run_id: str) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    update discovery_hypotheses
                    set
                      status = 'running',
                      sequence_run_id = %s,
                      started_at = now(),
                      error_text = null
                    where hypothesis_id = %s
                    """,
                    (sequence_run_id, hypothesis_id),
                )

    def _mark_hypothesis_completed(
        self,
        hypothesis_id: str,
        sources_found: int,
        sources_approved: int,
        execution_cost_cents: int,
        execution_cost_usd: Decimal,
    ) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    update discovery_hypotheses
                    set
                      status = 'completed',
                      sources_found = %s,
                      sources_approved = %s,
                      execution_cost_cents = %s,
                      execution_cost_usd = %s,
                      finished_at = now(),
                      error_text = null
                    where hypothesis_id = %s
                    """,
                    (
                        max(0, sources_found),
                        max(0, sources_approved),
                        max(0, execution_cost_cents),
                        coerce_discovery_cost_usd(execution_cost_usd),
                        hypothesis_id,
                    ),
                )

    def _mark_hypothesis_failed(self, hypothesis_id: str, error_text: str) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    update discovery_hypotheses
                    set
                      status = 'failed',
                      finished_at = now(),
                      error_text = %s
                    where hypothesis_id = %s
                    """,
                    (error_text, hypothesis_id),
                )

    def _mark_hypothesis_skipped(self, hypothesis_id: str, error_text: str) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    update discovery_hypotheses
                    set
                      status = 'skipped',
                      finished_at = now(),
                      error_text = %s
                    where hypothesis_id = %s
                    """,
                    (error_text, hypothesis_id),
                )
