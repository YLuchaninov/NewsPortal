"""Cluster summaries and system label projections for content analysis."""

from __future__ import annotations

import json
from typing import Any

from psycopg.types.json import Json

from .content_analysis_repository import _replace_analysis_result
from .content_analysis_runtime import (
    CLUSTER_SUMMARY_MODEL_KEY,
    CLUSTER_SUMMARY_MODEL_VERSION,
    CLUSTER_SUMMARY_PROVIDER,
    SYSTEM_LABEL_MODEL_KEY,
    SYSTEM_LABEL_MODEL_VERSION,
    SYSTEM_LABEL_PROVIDER,
    analysis_source_hash as _analysis_source_hash,
    connect as _connect,
    policy_result_json as _policy_result_json,
    read_config_bool as _read_config_bool,
    resolve_policy_for_module as _resolve_policy_for_module,
    source_hash as _source_hash,
)
from .content_analysis_subjects import coerce_datetime as _coerce_datetime, load_content_subject


def load_story_cluster_summary(story_cluster_id: str) -> dict[str, Any] | None:
    with _connect() as connection:
        cluster = connection.execute(
            """
            select
              story_cluster_id::text as story_cluster_id,
              canonical_document_count,
              observation_count,
              source_family_count,
              corroboration_count,
              conflicting_signal_count,
              verification_state,
              primary_title,
              top_entities,
              top_places,
              min_published_at,
              max_published_at,
              updated_at
            from story_clusters
            where story_cluster_id = %s
            """,
            (story_cluster_id,),
        ).fetchone()
        if cluster is None:
            return None
        members = connection.execute(
            """
            select
              cd.canonical_document_id::text as canonical_document_id,
              cd.title,
              cd.canonical_domain,
              cd.published_at
            from story_cluster_members scm
            join canonical_documents cd
              on cd.canonical_document_id = scm.canonical_document_id
            where scm.story_cluster_id = %s
            order by cd.published_at desc nulls last, scm.created_at desc
            limit 20
            """,
            (story_cluster_id,),
        ).fetchall()
        verification = connection.execute(
            """
            select
              verification_state,
              corroboration_count,
              source_family_count,
              observation_count,
              conflicting_signal_count,
              rationale_json
            from verification_results
            where target_type = 'story_cluster'
              and target_id = %s
            """,
            (story_cluster_id,),
        ).fetchone()
    cluster_dict = dict(cluster)
    member_items = [dict(member) for member in members]
    source_families = sorted(
        {
            str(member.get("canonical_domain") or "").strip()
            for member in member_items
            if str(member.get("canonical_domain") or "").strip()
        }
    )
    min_published_at = _coerce_datetime(cluster_dict.get("min_published_at"))
    max_published_at = _coerce_datetime(cluster_dict.get("max_published_at"))
    updated_at = _coerce_datetime(cluster_dict.get("updated_at"))
    return {
        "storyClusterId": cluster_dict["story_cluster_id"],
        "primaryTitle": cluster_dict.get("primary_title"),
        "verificationState": cluster_dict.get("verification_state"),
        "canonicalDocumentCount": cluster_dict.get("canonical_document_count"),
        "observationCount": cluster_dict.get("observation_count"),
        "sourceFamilyCount": cluster_dict.get("source_family_count"),
        "corroborationCount": cluster_dict.get("corroboration_count"),
        "conflictingSignalCount": cluster_dict.get("conflicting_signal_count"),
        "topEntities": list(cluster_dict.get("top_entities") or []),
        "topPlaces": list(cluster_dict.get("top_places") or []),
        "sourceFamilies": source_families[:20],
        "publishedWindow": {
            "min": min_published_at.isoformat() if min_published_at else None,
            "max": max_published_at.isoformat() if max_published_at else None,
        },
        "members": [
            {
                "canonicalDocumentId": member.get("canonical_document_id"),
                "title": member.get("title"),
                "canonicalDomain": member.get("canonical_domain"),
                "publishedAt": published_at.isoformat() if published_at else None,
            }
            for member in member_items
            for published_at in [_coerce_datetime(member.get("published_at"))]
        ],
        "verification": dict(verification) if verification else None,
        "updatedAt": updated_at.isoformat() if updated_at else None,
    }


def persist_cluster_summary_analysis(story_cluster_id: str) -> dict[str, Any]:
    subject = load_content_subject("story_cluster", story_cluster_id)
    if subject is None:
        raise ValueError(f"Story cluster {story_cluster_id} was not found.")
    summary = load_story_cluster_summary(story_cluster_id)
    if summary is None:
        raise ValueError(f"Story cluster {story_cluster_id} was not found.")
    result_json = {
        **summary,
        "model": {
            "provider": CLUSTER_SUMMARY_PROVIDER,
            "modelKey": CLUSTER_SUMMARY_MODEL_KEY,
            "modelVersion": CLUSTER_SUMMARY_MODEL_VERSION,
        },
    }
    confidence_by_state = {
        "strong": 0.95,
        "medium": 0.8,
        "weak": 0.55,
        "conflicting": 0.65,
    }
    source_hash = _source_hash(json.dumps(summary, default=str, sort_keys=True))
    with _connect() as connection:
        with connection.transaction():
            analysis_id = _replace_analysis_result(
                connection,
                subject=subject,
                analysis_type="cluster_summary",
                provider=CLUSTER_SUMMARY_PROVIDER,
                model_key=CLUSTER_SUMMARY_MODEL_KEY,
                model_version=CLUSTER_SUMMARY_MODEL_VERSION,
                result_json=result_json,
                confidence=confidence_by_state.get(str(summary.get("verificationState")), 0.5),
                source_hash=source_hash,
            )
    return {
        "analysisId": str(analysis_id),
        "storyClusterId": story_cluster_id,
        "verificationState": summary.get("verificationState"),
        "canonicalDocumentCount": summary.get("canonicalDocumentCount"),
        "sourceFamilyCount": summary.get("sourceFamilyCount"),
        "memberCount": len(summary.get("members") or []),
    }


def project_system_interest_labels(doc_id: str) -> dict[str, Any]:
    subject = load_content_subject("signal_candidate", doc_id)
    if subject is None:
        raise ValueError(f"SignalCandidate {doc_id} was not found.")
    policy_candidate = _resolve_policy_for_module("system_interest_label", subject)
    if isinstance(policy_candidate, dict):
        return policy_candidate
    policy = policy_candidate
    include_gray_zone = _read_config_bool(policy.config, "includeGrayZone", True) if policy else True
    include_no_match = _read_config_bool(policy.config, "includeNoMatch", False) if policy else False
    decisions = ["match"]
    if include_gray_zone:
        decisions.append("gray_zone")
    if include_no_match:
        decisions.append("no_match")
    decision_literals = ", ".join(f"'{decision}'" for decision in decisions)
    with _connect() as connection:
        rows = connection.execute(
            f"""
            select
              ifr.filter_key,
              ifr.criterion_id::text as criterion_id,
              it.interest_template_id::text as interest_template_id,
              it.name as interest_name,
              ifr.semantic_decision,
              ifr.semantic_score,
              ifr.explain_json
            from interest_filter_results ifr
            left join criteria c on c.criterion_id = ifr.criterion_id
            left join interest_templates it on it.interest_template_id = c.source_interest_template_id
            where ifr.doc_id = %s
              and ifr.filter_scope = 'system_criterion'
              and ifr.semantic_decision in ({decision_literals})
            order by ifr.semantic_score desc
            """,
            (doc_id,),
        ).fetchall()
        with connection.transaction():
            analysis_id = _replace_analysis_result(
                connection,
                subject=subject,
                analysis_type="system_interest_label",
                provider=SYSTEM_LABEL_PROVIDER,
                model_key=SYSTEM_LABEL_MODEL_KEY,
                model_version=SYSTEM_LABEL_MODEL_VERSION,
                result_json={
                    "labelCount": len(rows),
                    "source": "interest_filter_results",
                    "includedDecisions": decisions,
                    "policy": _policy_result_json(policy),
                },
                confidence=max((float(row["semantic_score"] or 0) for row in rows), default=None),
                source_hash=_analysis_source_hash([dict(row) for row in rows], policy),
                policy=policy,
            )
            connection.execute(
                """
                delete from content_labels
                where subject_type = 'signal_candidate'
                  and subject_id = %s
                  and label_type = 'system_interest'
                """,
                (doc_id,),
            )
            for row in rows:
                label_key = str(row.get("interest_template_id") or row.get("criterion_id") or row["filter_key"])
                decision = str(row["semantic_decision"])
                if decision not in {"match", "gray_zone", "no_match"}:
                    decision = "match"
                connection.execute(
                    """
                    insert into content_labels (
                      subject_type,
                      subject_id,
                      canonical_document_id,
                      source_channel_id,
                      label_type,
                      label_key,
                      label_name,
                      decision,
                      score,
                      confidence,
                      explain_json,
                      analysis_id
                    )
                    values ('signal_candidate', %s, %s, %s, 'system_interest', %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        subject.subject_id,
                        subject.canonical_document_id,
                        subject.source_channel_id,
                        label_key,
                        row.get("interest_name"),
                        decision,
                        row.get("semantic_score"),
                        row.get("semantic_score"),
                        Json(dict(row.get("explain_json") or {})),
                        analysis_id,
                    ),
                )
    return {"analysisId": str(analysis_id), "labelCount": len(rows), "includedDecisions": decisions}
