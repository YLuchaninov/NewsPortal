from __future__ import annotations

import asyncio
from typing import Any

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Json

from .task_engine.repository import build_database_url


class DiscoveryV3Repository:
    def __init__(self, database_url: str | None = None) -> None:
        self._database_url = database_url or build_database_url()
        self._column_cache: dict[str, set[str]] = {}

    def _connect(self) -> Any:
        return psycopg.connect(self._database_url, row_factory=dict_row)

    async def list_active_system_interests(self) -> list[dict[str, Any]]:
        return await asyncio.to_thread(
            self._query_all,
            """
            select it.*,
                   sp.definition_json as selection_profile_definition_json,
                   sp.policy_json as selection_profile_policy_json
            from interest_templates it
            left join selection_profiles sp
              on sp.source_interest_template_id = it.interest_template_id
             and sp.profile_family = 'compatibility_interest_template'
            where it.is_active = true
            """,
            (),
        )

    async def list_active_user_interests(self) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._query_all, "select * from user_interests where is_active = true", ())

    async def upsert_target_from_origin(self, target: dict[str, Any]) -> dict[str, Any]:
        return await asyncio.to_thread(self._upsert_target_from_origin, target)

    async def get_target(self, target_id: str) -> dict[str, Any]:
        row = await asyncio.to_thread(
            self._query_one,
            "select * from discovery_targets where target_id = %s",
            (target_id,),
        )
        if row is None:
            raise LookupError(f"Discovery target {target_id} was not found.")
        return row

    async def list_active_targets(self) -> list[dict[str, Any]]:
        return await asyncio.to_thread(
            self._query_all,
            "select * from discovery_targets where status = 'active' order by priority desc, updated_at desc",
            (),
        )

    async def update_target_graph(self, target_id: str, graph: dict[str, Any]) -> None:
        await asyncio.to_thread(
            self._execute,
            """
            update discovery_targets
            set graph_json = %s::jsonb, updated_at = now()
            where target_id = %s
            """,
            (Json(graph), target_id),
        )

    async def create_run(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await asyncio.to_thread(self._create_run, payload)

    async def get_run(self, run_id: str) -> dict[str, Any]:
        row = await asyncio.to_thread(
            self._query_one,
            "select * from discovery_runs where run_id = %s",
            (run_id,),
        )
        if row is None:
            raise LookupError(f"Discovery run {run_id} was not found.")
        return row

    async def mark_run_running(self, run_id: str) -> None:
        await asyncio.to_thread(
            self._execute,
            "update discovery_runs set status = 'running', started_at = coalesce(started_at, now()) where run_id = %s",
            (run_id,),
        )

    async def mark_run_completed(self, run_id: str, summary: dict[str, Any]) -> None:
        await asyncio.to_thread(
            self._execute,
            """
            update discovery_runs
            set status = 'completed', finished_at = now(), summary_json = %s::jsonb
            where run_id = %s
            """,
            (Json(summary), run_id),
        )

    async def mark_run_failed(self, run_id: str, error_text: str) -> None:
        await asyncio.to_thread(
            self._execute,
            "update discovery_runs set status = 'failed', finished_at = now(), error_text = %s where run_id = %s",
            (error_text, run_id),
        )

    async def list_source_inventory(self) -> list[dict[str, Any]]:
        return await asyncio.to_thread(
            self._query_all,
            "select * from discovery_source_inventory_view order by updated_at desc",
            (),
        )

    async def save_coverage_snapshot(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await asyncio.to_thread(self._save_coverage_snapshot, payload)

    async def get_latest_coverage(self, target_id: str) -> dict[str, Any] | None:
        return await asyncio.to_thread(
            self._query_one,
            """
            select *
            from discovery_coverage_snapshots
            where target_id = %s
            order by created_at desc
            limit 1
            """,
            (target_id,),
        )

    async def list_negative_evidence(self, target_id: str) -> list[dict[str, Any]]:
        return await asyncio.to_thread(
            self._query_all,
            """
            select *
            from discovery_negative_evidence
            where target_id = %s or target_id is null
            order by created_at desc
            limit 500
            """,
            (target_id,),
        )

    async def list_provider_health(self) -> list[dict[str, Any]]:
        return await asyncio.to_thread(
            self._query_all,
            """
            select *
            from discovery_provider_health
            where status <> 'healthy'
            order by updated_at desc
            """,
            (),
        )

    async def list_confirmed_claims(self, target_id: str) -> list[dict[str, Any]]:
        return await asyncio.to_thread(
            self._query_all,
            """
            select *
            from discovery_claims
            where target_id = %s
              and status = 'confirmed_signal'
            order by confidence_score desc, updated_at desc
            limit 50
            """,
            (target_id,),
        )

    async def insert_hypotheses(self, hypotheses: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._insert_hypotheses, hypotheses)

    async def list_queued_hypotheses(self, run_id: str, limit: int) -> list[dict[str, Any]]:
        return await asyncio.to_thread(
            self._query_all,
            """
            select *
            from discovery_hypotheses
            where run_id = %s and status = 'queued'
            order by priority_score desc, created_at
            limit %s
            """,
            (run_id, limit),
        )

    async def update_hypothesis_result(self, hypothesis_id: str, result: dict[str, Any]) -> None:
        await asyncio.to_thread(
            self._execute,
            """
            update discovery_hypotheses
            set status = %s,
                results_count = %s,
                evidence_count = %s,
                endpoints_found = %s,
                signals_found = %s
            where hypothesis_id = %s
            """,
            (
                result.get("status", "completed"),
                int(result.get("results_count") or 0),
                int(result.get("evidence_count") or 0),
                int(result.get("endpoints_found") or 0),
                int(result.get("signals_found") or 0),
                hypothesis_id,
            ),
        )

    async def insert_provider_query(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await asyncio.to_thread(self._insert_json_row, "discovery_provider_queries", payload, "provider_query_id")

    async def insert_provider_queries(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._insert_many_json_rows, "discovery_provider_queries", rows)

    async def insert_search_run(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Compatibility name for the v3 provider-query table."""
        return await self.insert_provider_query(payload)

    async def insert_search_results(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return await self.insert_evidence_items(rows)

    async def insert_evidence_items(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._insert_many_json_rows, "discovery_evidence_items", rows)

    async def insert_claims(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._insert_many_json_rows, "discovery_claims", rows)

    async def insert_claim_evidence_links(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._insert_many_json_rows, "discovery_claim_evidence", rows)

    async def upsert_domain_inventory(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._insert_many_json_rows, "discovery_domain_inventory", rows)

    async def upsert_source_endpoints(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._insert_many_json_rows, "discovery_source_endpoints", rows)

    async def get_endpoint(self, endpoint_id: str) -> dict[str, Any]:
        row = await asyncio.to_thread(
            self._query_one,
            "select * from discovery_source_endpoints where endpoint_id = %s",
            (endpoint_id,),
        )
        if row is None:
            raise LookupError(f"Discovery endpoint {endpoint_id} was not found.")
        return row

    async def update_endpoint_action(self, endpoint_id: str, action: dict[str, Any]) -> None:
        await asyncio.to_thread(
            self._execute,
            """
            update discovery_source_endpoints
            set status = %s, recommended_action = %s, rejection_reason = %s, updated_at = now()
            where endpoint_id = %s
            """,
            (
                action.get("status", "manual_review"),
                action.get("recommended_action", "review"),
                action.get("rejection_reason"),
                endpoint_id,
            ),
        )

    async def insert_edges(self, rows: list[dict[str, Any]]) -> None:
        await asyncio.to_thread(self._insert_many_json_rows, "discovery_source_edges", rows)

    async def insert_negative_evidence(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._insert_many_json_rows, "discovery_negative_evidence", rows)

    async def upsert_provider_health(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._upsert_provider_health, rows)

    async def create_action(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await asyncio.to_thread(self._insert_json_row, "discovery_actions", payload, "action_id")

    async def complete_action(self, action_id: str, result: dict[str, Any]) -> None:
        await asyncio.to_thread(
            self._execute,
            """
            update discovery_actions
            set status = 'completed', result_json = %s::jsonb, completed_at = now()
            where action_id = %s
            """,
            (Json(result), action_id),
        )

    async def insert_repairs(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._insert_many_json_rows, "discovery_repairs", rows)

    async def insert_debate(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await asyncio.to_thread(self._insert_json_row, "discovery_debates", payload, "debate_id")

    async def get_cached_llm_decision(self, *, task_name: str, input_hash: str) -> dict[str, Any] | None:
        return await asyncio.to_thread(
            self._query_one,
            """
            select *
            from discovery_llm_decisions
            where task_name = %s and input_hash = %s
              and status in ('valid', 'fallback', 'cached')
            order by created_at desc
            limit 1
            """,
            (task_name, input_hash),
        )

    async def insert_llm_decision(self, payload: dict[str, Any]) -> dict[str, Any] | None:
        return await asyncio.to_thread(self._upsert_llm_decision, payload)

    async def list_llm_decisions(self, limit: int = 100) -> list[dict[str, Any]]:
        return await asyncio.to_thread(
            self._query_all,
            """
            select *
            from discovery_llm_decisions
            order by created_at desc
            limit %s
            """,
            (limit,),
        )

    async def get_llm_decision(self, decision_id: str) -> dict[str, Any]:
        row = await asyncio.to_thread(
            self._query_one,
            "select * from discovery_llm_decisions where decision_id = %s",
            (decision_id,),
        )
        if row is None:
            raise LookupError(f"Discovery LLM decision {decision_id} was not found.")
        return row

    def _query_all(self, sql: str, params: tuple[Any, ...]) -> list[dict[str, Any]]:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(sql, params)
                return [dict(row) for row in cursor.fetchall()]

    def _query_one(self, sql: str, params: tuple[Any, ...]) -> dict[str, Any] | None:
        rows = self._query_all(sql, params)
        return rows[0] if rows else None

    def _execute(self, sql: str, params: tuple[Any, ...]) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(sql, params)

    def _upsert_target_from_origin(self, target: dict[str, Any]) -> dict[str, Any]:
        row = self._query_one(
            """
            insert into discovery_targets (
              origin_kind, origin_id, title, description, seed_topics,
              seed_entities, seed_geos, seed_languages, seed_urls, seed_domains,
              graph_json, policy_json, autopilot_json, created_by
            )
            values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s)
            on conflict (origin_kind, origin_id) where origin_id is not null
            do update set
              title = excluded.title,
              description = excluded.description,
              seed_topics = excluded.seed_topics,
              seed_entities = excluded.seed_entities,
              seed_geos = excluded.seed_geos,
              seed_languages = excluded.seed_languages,
              seed_urls = excluded.seed_urls,
              seed_domains = excluded.seed_domains,
              graph_json = excluded.graph_json,
              policy_json = excluded.policy_json,
              autopilot_json = excluded.autopilot_json,
              updated_at = now()
            returning *
            """,
            (
                target["origin_kind"],
                target.get("origin_id"),
                target["title"],
                target.get("description"),
                target.get("seed_topics", []),
                target.get("seed_entities", []),
                target.get("seed_geos", []),
                target.get("seed_languages", []),
                target.get("seed_urls", []),
                target.get("seed_domains", []),
                Json(target.get("graph_json", {})),
                Json(target.get("policy_json", {})),
                Json(target.get("autopilot_json", {})),
                target.get("created_by"),
            ),
        )
        if row is None:
            raise RuntimeError("Target upsert did not return a row.")
        return row

    def _create_run(self, payload: dict[str, Any]) -> dict[str, Any]:
        row = self._query_one(
            """
            insert into discovery_runs (
              target_id, run_kind, trigger_kind, max_depth, max_hypotheses,
              max_search_results, max_domains, max_endpoints, max_social_items, summary_json, created_by
            )
            values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s)
            returning *
            """,
            (
                payload["target_id"],
                payload.get("run_kind", "manual"),
                payload.get("trigger_kind", "scheduled"),
                int(payload.get("max_depth", 3)),
                int(payload.get("max_hypotheses", 120)),
                int(payload.get("max_search_results", 800)),
                int(payload.get("max_domains", 400)),
                int(payload.get("max_endpoints", 700)),
                int(payload.get("max_social_items", 1000)),
                Json(payload.get("summary_json", {})),
                payload.get("created_by"),
            ),
        )
        if row is None:
            raise RuntimeError("Run insert did not return a row.")
        return row

    def _save_coverage_snapshot(self, payload: dict[str, Any]) -> dict[str, Any]:
        row = self._query_one(
            """
            insert into discovery_coverage_snapshots (
              target_id, run_id, coverage_json, gaps_json, source_inventory_json,
              summary_json, coverage_score, source_count, strong_source_count,
              missing_role_count
            )
            values (%s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb, %s, %s, %s, %s)
            returning *
            """,
            (
                payload["target_id"],
                payload.get("run_id"),
                Json(payload.get("coverage_json", {})),
                Json(payload.get("gaps_json", [])),
                Json(payload.get("source_inventory_json", [])),
                Json(payload.get("summary_json", {})),
                float(payload.get("coverage_score", 0)),
                int(payload.get("source_count", 0)),
                int(payload.get("strong_source_count", 0)),
                int(payload.get("missing_role_count", 0)),
            ),
        )
        if row is None:
            raise RuntimeError("Coverage snapshot insert did not return a row.")
        self._execute(
            """
            update discovery_targets
            set last_coverage_snapshot_id = %s, updated_at = now()
            where target_id = %s
            """,
            (row["coverage_snapshot_id"], payload["target_id"]),
        )
        return row

    def _insert_hypotheses(self, hypotheses: list[dict[str, Any]]) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for hypothesis in hypotheses:
            row = self._query_one(
                """
                insert into discovery_hypotheses (
                  run_id, target_id, parent_hypothesis_id, generation_depth,
                  hypothesis_type, signal_mode, source_role, acquisition_tactic,
                  query_text, seed_url, seed_domain, seed_entity, provider_id,
                  control_query_text, control_provider_id, control_expected_noise,
                  expected_provider_types, expected_endpoint_kinds, endpoint_patterns,
                  expected_data_shape, explorer_json, skeptic_json, repair_json,
                  debate_state, repair_round, verification_round, meaningful_change_score,
                  priority_score, novelty_score, gap_score, risk_score, confidence_score
                )
                values (
                  %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                  %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s, %s, %s, %s,
                  %s, %s, %s, %s, %s
                )
                on conflict do nothing
                returning *
                """,
                (
                    hypothesis.get("run_id"),
                    hypothesis["target_id"],
                    hypothesis.get("parent_hypothesis_id"),
                    int(hypothesis.get("generation_depth", 0)),
                    hypothesis["hypothesis_type"],
                    hypothesis.get("signal_mode", "direct"),
                    hypothesis["source_role"],
                    hypothesis.get("acquisition_tactic", "search"),
                    hypothesis.get("query_text"),
                    hypothesis.get("seed_url"),
                    hypothesis.get("seed_domain"),
                    hypothesis.get("seed_entity"),
                    hypothesis.get("provider_id"),
                    hypothesis.get("control_query_text"),
                    hypothesis.get("control_provider_id"),
                    hypothesis.get("control_expected_noise"),
                    hypothesis.get("expected_provider_types", []),
                    hypothesis.get("expected_endpoint_kinds", []),
                    hypothesis.get("endpoint_patterns", []),
                    hypothesis.get("expected_data_shape"),
                    Json(hypothesis.get("explorer_json", {})),
                    Json(hypothesis.get("skeptic_json", {})),
                    Json(hypothesis.get("repair_json", {})),
                    hypothesis.get("debate_state", "draft"),
                    int(hypothesis.get("repair_round", 0)),
                    int(hypothesis.get("verification_round", 0)),
                    float(hypothesis.get("meaningful_change_score", 0)),
                    float(hypothesis.get("priority_score", 0.5)),
                    float(hypothesis.get("novelty_score", 0.5)),
                    float(hypothesis.get("gap_score", 0.5)),
                    float(hypothesis.get("risk_score", 0.5)),
                    float(hypothesis.get("confidence_score", 0.5)),
                ),
            )
            if row is None:
                row = self._find_reusable_hypothesis_for_execution(hypothesis)
            if row:
                if hypothesis.get("run_id"):
                    row = {**row, "run_id": hypothesis["run_id"]}
                rows.append(row)
        return rows

    def _find_reusable_hypothesis_for_execution(self, hypothesis: dict[str, Any]) -> dict[str, Any] | None:
        """Find an existing unexecuted dedupe match for a later approved run."""

        return self._query_one(
            """
            select *
            from discovery_hypotheses
            where target_id = %s
              and hypothesis_type = %s
              and signal_mode = %s
              and source_role = %s
              and coalesce(provider_id, '') = coalesce(%s, '')
              and coalesce(query_text, '') = coalesce(%s, '')
              and coalesce(seed_url, '') = coalesce(%s, '')
              and coalesce(seed_domain, '') = coalesce(%s, '')
              and coalesce(seed_entity, '') = coalesce(%s, '')
              and status in ('queued', 'failed')
            order by created_at asc
            limit 1
            """,
            (
                hypothesis.get("target_id"),
                hypothesis.get("hypothesis_type"),
                hypothesis.get("signal_mode", "direct"),
                hypothesis.get("source_role"),
                hypothesis.get("provider_id"),
                hypothesis.get("query_text"),
                hypothesis.get("seed_url"),
                hypothesis.get("seed_domain"),
                hypothesis.get("seed_entity"),
            ),
        )

    def _insert_json_row(self, table: str, payload: dict[str, Any], id_column: str) -> dict[str, Any]:
        rows = self._insert_many_json_rows(table, [payload])
        if not rows:
            raise RuntimeError(f"{table} insert did not return a row.")
        return rows[0]

    def _insert_many_json_rows(self, table: str, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        inserted: list[dict[str, Any]] = []
        valid_columns = self._valid_columns(table)
        for row in rows:
            if not row:
                continue
            normalized_row = {column: value for column, value in row.items() if column in valid_columns}
            if not normalized_row:
                continue
            columns = list(normalized_row)
            placeholders = []
            params: list[Any] = []
            for column in columns:
                value = normalized_row[column]
                if column.endswith("_json") or column in {"raw_json", "provider_votes", "evidence_json"}:
                    placeholders.append("%s::jsonb")
                    params.append(Json(value))
                else:
                    placeholders.append("%s")
                    params.append(value)
            inserted_row = self._query_one(
                f"""
                insert into {table} ({", ".join(columns)})
                values ({", ".join(placeholders)})
                on conflict do nothing
                returning *
                """,
                tuple(params),
            )
            if inserted_row:
                inserted.append(inserted_row)
        return inserted

    def _valid_columns(self, table: str) -> set[str]:
        if table not in self._column_cache:
            rows = self._query_all(
                """
                select column_name
                from information_schema.columns
                where table_schema = 'public' and table_name = %s
                """,
                (table,),
            )
            self._column_cache[table] = {str(row["column_name"]) for row in rows}
        return self._column_cache[table]

    def _upsert_provider_health(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        inserted: list[dict[str, Any]] = []
        for row in rows:
            provider_id = str(row.get("provider_id") or row.get("providerId") or "").strip()
            if not provider_id:
                continue
            inserted_row = self._query_one(
                """
                insert into discovery_provider_health (
                  provider_id, status, success_rate, error_rate, rate_limit_score,
                  auth_health_score, latency_score, last_success_at, last_error_at,
                  last_error_kind, cooldown_until, metrics_json, updated_at
                )
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, now())
                on conflict (provider_id) do update set
                  status = excluded.status,
                  success_rate = excluded.success_rate,
                  error_rate = excluded.error_rate,
                  rate_limit_score = excluded.rate_limit_score,
                  auth_health_score = excluded.auth_health_score,
                  latency_score = excluded.latency_score,
                  last_success_at = coalesce(excluded.last_success_at, discovery_provider_health.last_success_at),
                  last_error_at = coalesce(excluded.last_error_at, discovery_provider_health.last_error_at),
                  last_error_kind = coalesce(excluded.last_error_kind, discovery_provider_health.last_error_kind),
                  cooldown_until = excluded.cooldown_until,
                  metrics_json = discovery_provider_health.metrics_json || excluded.metrics_json,
                  updated_at = now()
                returning *
                """,
                (
                    provider_id,
                    row.get("status", "healthy"),
                    float(row.get("success_rate") or row.get("successRate") or 1),
                    float(row.get("error_rate") or row.get("errorRate") or 0),
                    float(row.get("rate_limit_score") or row.get("rateLimitScore") or 1),
                    float(row.get("auth_health_score") or row.get("authHealthScore") or 1),
                    float(row.get("latency_score") or row.get("latencyScore") or 1),
                    row.get("last_success_at") or row.get("lastSuccessAt"),
                    row.get("last_error_at") or row.get("lastErrorAt"),
                    row.get("last_error_kind") or row.get("lastErrorKind"),
                    row.get("cooldown_until") or row.get("cooldownUntil"),
                    Json(row.get("metrics_json") if isinstance(row.get("metrics_json"), dict) else row.get("metricsJson") if isinstance(row.get("metricsJson"), dict) else {}),
                ),
            )
            if inserted_row:
                inserted.append(inserted_row)
        return inserted

    def _upsert_llm_decision(self, payload: dict[str, Any]) -> dict[str, Any] | None:
        valid_columns = self._valid_columns("discovery_llm_decisions")
        if not valid_columns:
            return None
        row = {column: value for column, value in payload.items() if column in valid_columns}
        if not row:
            return None
        columns = list(row)
        placeholders: list[str] = []
        params: list[Any] = []
        for column in columns:
            value = row[column]
            if column.endswith("_json") or column == "meta_json":
                placeholders.append("%s::jsonb")
                params.append(Json(value))
            else:
                placeholders.append("%s")
                params.append(value)
        update_columns = [
            column
            for column in columns
            if column not in {"decision_id", "task_name", "input_hash", "created_at"}
        ]
        update_sql = ", ".join(f"{column} = excluded.{column}" for column in update_columns)
        if not update_sql:
            update_sql = "status = excluded.status"
        return self._query_one(
            f"""
            insert into discovery_llm_decisions ({", ".join(columns)})
            values ({", ".join(placeholders)})
            on conflict (task_name, input_hash) do update set {update_sql}
            returning *
            """,
            tuple(params),
        )
