from __future__ import annotations

from decimal import Decimal
from typing import Any

from psycopg.types.json import Json

from .discovery_runtime_settings import (
    USD_TO_CENTS as _USD_TO_CENTS,
    coerce_discovery_cost_usd,
    discovery_cost_usd_to_cents,
)


class DiscoveryCandidateRepositoryMixin:
    def _upsert_candidates(self, candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
        stored_rows: list[dict[str, Any]] = []
        if not candidates:
            return stored_rows
        with self._connect() as connection:
            with connection.transaction():
                with connection.cursor() as cursor:
                    for candidate in candidates:
                        cursor.execute(
                            """
                            insert into discovery_candidates (
                              hypothesis_id,
                              mission_id,
                              url,
                              final_url,
                              title,
                              description,
                              provider_type,
                              is_valid,
                              relevance_score,
                              evaluation_json,
                              llm_assessment,
                              sample_data,
                              status,
                              registered_channel_id,
                              rejection_reason
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
                              %s::jsonb,
                              %s::jsonb,
                              %s::jsonb,
                              %s,
                              %s,
                              %s
                            )
                            on conflict (url, mission_id)
                            do update
                            set
                              hypothesis_id = excluded.hypothesis_id,
                              final_url = excluded.final_url,
                              title = excluded.title,
                              description = excluded.description,
                              provider_type = excluded.provider_type,
                              is_valid = excluded.is_valid,
                              relevance_score = excluded.relevance_score,
                              evaluation_json = excluded.evaluation_json,
                              llm_assessment = excluded.llm_assessment,
                              sample_data = excluded.sample_data,
                              status = excluded.status,
                              registered_channel_id = coalesce(discovery_candidates.registered_channel_id, excluded.registered_channel_id),
                              rejection_reason = excluded.rejection_reason,
                              updated_at = now()
                            returning
                              candidate_id::text as candidate_id,
                              mission_id::text as mission_id,
                              hypothesis_id::text as hypothesis_id,
                              source_profile_id::text as source_profile_id,
                              registered_channel_id::text as registered_channel_id,
                              url,
                              final_url,
                              title,
                              description,
                              provider_type,
                              is_valid,
                              relevance_score,
                              evaluation_json,
                              llm_assessment,
                              sample_data,
                              status
                            """,
                            (
                                candidate["hypothesis_id"],
                                candidate["mission_id"],
                                candidate["url"],
                                candidate.get("final_url"),
                                candidate.get("title"),
                                candidate.get("description"),
                                candidate.get("provider_type") or "rss",
                                candidate.get("is_valid"),
                                candidate.get("relevance_score"),
                                Json(candidate.get("evaluation_json") or {}),
                                Json(candidate.get("llm_assessment") or {}),
                                Json(candidate.get("sample_data") or []),
                                candidate.get("status") or "pending",
                                candidate.get("registered_channel_id"),
                                candidate.get("rejection_reason"),
                            ),
                        )
                        row = cursor.fetchone()
                        if row is not None:
                            stored_rows.append(dict(row))
        return stored_rows

    def _upsert_recall_candidates(self, candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
        stored_rows: list[dict[str, Any]] = []
        if not candidates:
            return stored_rows
        with self._connect() as connection:
            with connection.transaction():
                with connection.cursor() as cursor:
                    for candidate in candidates:
                        cursor.execute(
                            """
                            insert into discovery_recall_candidates (
                              recall_mission_id,
                              source_profile_id,
                              canonical_domain,
                              url,
                              final_url,
                              title,
                              description,
                              provider_type,
                              status,
                              registered_channel_id,
                              quality_signal_source,
                              evaluation_json,
                              rejection_reason,
                              created_by
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
                              %s::jsonb,
                              %s,
                              %s
                            )
                            on conflict (recall_mission_id, url)
                            do update
                            set
                              source_profile_id = coalesce(discovery_recall_candidates.source_profile_id, excluded.source_profile_id),
                              canonical_domain = excluded.canonical_domain,
                              final_url = excluded.final_url,
                              title = excluded.title,
                              description = excluded.description,
                              provider_type = excluded.provider_type,
                              status = excluded.status,
                              registered_channel_id = coalesce(discovery_recall_candidates.registered_channel_id, excluded.registered_channel_id),
                              quality_signal_source = excluded.quality_signal_source,
                              evaluation_json = excluded.evaluation_json,
                              rejection_reason = excluded.rejection_reason,
                              updated_at = now()
                            returning
                              recall_candidate_id::text as recall_candidate_id,
                              recall_mission_id::text as recall_mission_id,
                              source_profile_id::text as source_profile_id,
                              registered_channel_id::text as registered_channel_id,
                              canonical_domain,
                              url,
                              final_url,
                              title,
                              description,
                              provider_type,
                              status,
                              quality_signal_source,
                              evaluation_json,
                              rejection_reason,
                              created_by,
                              reviewed_by,
                              reviewed_at,
                              created_at,
                              updated_at
                            """,
                            (
                                candidate["recall_mission_id"],
                                candidate.get("source_profile_id"),
                                candidate["canonical_domain"],
                                candidate["url"],
                                candidate.get("final_url"),
                                candidate.get("title"),
                                candidate.get("description"),
                                candidate.get("provider_type") or "rss",
                                candidate.get("status") or "pending",
                                candidate.get("registered_channel_id"),
                                candidate.get("quality_signal_source") or "recall_acquisition",
                                Json(candidate.get("evaluation_json") or {}),
                                candidate.get("rejection_reason"),
                                candidate.get("created_by") or "independent_recall:agent",
                            ),
                        )
                        row = cursor.fetchone()
                        if row is not None:
                            stored_rows.append(dict(row))
        return stored_rows

    def _link_candidate_profile(self, candidate_id: str, source_profile_id: str) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    update discovery_candidates
                    set source_profile_id = %s, updated_at = now()
                    where candidate_id = %s
                    """,
                    (source_profile_id, candidate_id),
                )

    def _link_recall_candidate_profile(self, recall_candidate_id: str, source_profile_id: str) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    update discovery_recall_candidates
                    set source_profile_id = %s, updated_at = now()
                    where recall_candidate_id = %s
                    """,
                    (source_profile_id, recall_candidate_id),
                )

    def _update_candidate_registration(
        self,
        candidate_id: str,
        status: str,
        channel_id: str | None,
        rejection_reason: str | None,
    ) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    update discovery_candidates
                    set
                      status = %s,
                      registered_channel_id = %s,
                      rejection_reason = %s,
                      reviewed_at = now(),
                      updated_at = now()
                    where candidate_id = %s
                    """,
                    (status, channel_id, rejection_reason, candidate_id),
                )

    def _update_candidate_review(
        self,
        candidate_id: str,
        evaluation_json: dict[str, Any],
        status: str | None,
        rejection_reason: str | None,
    ) -> None:
        assignments = ["evaluation_json = %s::jsonb", "updated_at = now()"]
        params: list[Any] = [Json(evaluation_json)]
        if status is not None:
            assignments.insert(0, "status = %s")
            params.insert(0, status)
        if rejection_reason is not None or status == "rejected":
            assignments.insert(1 if status is not None else 0, "rejection_reason = %s")
            params.insert(1 if status is not None else 0, rejection_reason)
        params.append(candidate_id)
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""
                    update discovery_candidates
                    set {', '.join(assignments)}
                    where candidate_id = %s
                    """,
                    tuple(params),
                )

    def _update_recall_candidate_review(
        self,
        recall_candidate_id: str,
        evaluation_json: dict[str, Any],
        status: str | None,
        rejection_reason: str | None,
    ) -> None:
        assignments = ["evaluation_json = %s::jsonb", "updated_at = now()"]
        params: list[Any] = [Json(evaluation_json)]
        if status is not None:
            assignments.insert(0, "status = %s")
            params.insert(0, status)
        if rejection_reason is not None or status == "rejected":
            assignments.insert(1 if status is not None else 0, "rejection_reason = %s")
            params.insert(1 if status is not None else 0, rejection_reason)
        params.append(recall_candidate_id)
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""
                    update discovery_recall_candidates
                    set {', '.join(assignments)}
                    where recall_candidate_id = %s
                    """,
                    tuple(params),
                )

    def _list_hypothesis_candidate_stats(self, hypothesis_ids: list[str]) -> list[dict[str, Any]]:
        if not hypothesis_ids:
            return []
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    select
                      h.hypothesis_id::text as hypothesis_id,
                      h.mission_id::text as mission_id,
                      h.class_key,
                      h.tactic_key,
                      count(c.candidate_id)::int as sources_found,
                      count(c.candidate_id) filter (
                        where c.status in ('approved', 'auto_approved')
                      )::int as sources_approved
                    from discovery_hypotheses h
                    left join discovery_candidates c on c.hypothesis_id = h.hypothesis_id
                    where h.hypothesis_id = any(%s::uuid[])
                    group by h.hypothesis_id, h.mission_id, h.class_key, h.tactic_key
                    """,
                    (hypothesis_ids,),
                )
                return [dict(row) for row in cursor.fetchall()]

    def _update_hypothesis_effectiveness(
        self,
        hypothesis_id: str,
        effectiveness: float,
        sources_approved: int,
    ) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    update discovery_hypotheses
                    set
                      effectiveness = %s,
                      sources_approved = %s
                    where hypothesis_id = %s
                    """,
                    (effectiveness, max(0, sources_approved), hypothesis_id),
                )

    def _refresh_mission_stats(self, mission_ids: list[str]) -> None:
        if not mission_ids:
            return
        with self._connect() as connection:
            with connection.transaction():
                with connection.cursor() as cursor:
                    for mission_id in mission_ids:
                        cursor.execute(
                            """
                            select
                              count(*) filter (where status in ('approved', 'auto_approved'))::int as approved_count
                            from discovery_candidates
                            where mission_id = %s
                            """,
                            (mission_id,),
                        )
                        approved_count = int((cursor.fetchone() or {}).get("approved_count") or 0)
                        cursor.execute(
                            """
                            select coalesce(sum(cost_usd), 0) as spent_usd
                            from discovery_cost_log
                            where mission_id = %s
                            """,
                            (mission_id,),
                        )
                        spent_usd = coerce_discovery_cost_usd((cursor.fetchone() or {}).get("spent_usd"))
                        spent_cents = discovery_cost_usd_to_cents(spent_usd)
                        cursor.execute(
                            """
                            select max_sources, budget_cents, status
                            from discovery_missions
                            where mission_id = %s
                            """,
                            (mission_id,),
                        )
                        mission = cursor.fetchone()
                        if mission is None:
                            continue
                        status = "active"
                        if approved_count >= int(mission["max_sources"] or 0):
                            status = "completed"
                        elif int(mission["budget_cents"] or 0) > 0 and spent_usd >= (
                            Decimal(int(mission["budget_cents"] or 0)) / _USD_TO_CENTS
                        ):
                            status = "completed"
                        elif str(mission["status"]) == "paused":
                            status = "paused"
                        cursor.execute(
                            """
                            update discovery_missions
                            set
                              spent_cents = %s,
                              run_count = run_count + 1,
                              last_run_at = now(),
                              status = %s,
                              updated_at = now()
                            where mission_id = %s
                            """,
                            (spent_cents, status, mission_id),
                        )

    def _refresh_recall_mission_stats(self, recall_mission_ids: list[str]) -> None:
        if not recall_mission_ids:
            return
        with self._connect() as connection:
            with connection.transaction():
                with connection.cursor() as cursor:
                    for recall_mission_id in recall_mission_ids:
                        cursor.execute(
                            """
                            select
                              count(*)::int as candidate_count
                            from discovery_recall_candidates
                            where recall_mission_id = %s
                            """,
                            (recall_mission_id,),
                        )
                        candidate_count = int((cursor.fetchone() or {}).get("candidate_count") or 0)
                        cursor.execute(
                            """
                            select max_candidates, status
                            from discovery_recall_missions
                            where recall_mission_id = %s
                            """,
                            (recall_mission_id,),
                        )
                        mission = cursor.fetchone()
                        if mission is None:
                            continue
                        status = "completed" if candidate_count >= int(mission.get("max_candidates") or 0) else "active"
                        if str(mission.get("status") or "") == "paused":
                            status = "paused"
                        cursor.execute(
                            """
                            update discovery_recall_missions
                            set
                              status = %s,
                              updated_at = now()
                            where recall_mission_id = %s
                            """,
                            (status, recall_mission_id),
                        )
