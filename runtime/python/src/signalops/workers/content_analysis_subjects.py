from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Mapping

from .content_analysis_runtime import ContentSubject, connect


def coerce_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if value is None:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def load_content_subject(subject_type: str, subject_id: str) -> ContentSubject | None:
    if subject_type == "signal_candidate":
        sql = """
            select
              a.doc_id::text as subject_id,
              a.title,
              a.lead,
              a.body,
              a.lang,
              a.channel_id::text as source_channel_id,
              coalesce(obs.canonical_document_id, a.canonical_doc_id)::text as canonical_document_id,
              a.published_at,
              a.ingested_at,
              a.updated_at,
              a.extracted_published_at
            from signal_candidates a
            left join document_observations obs
              on obs.origin_type = 'signal_candidate'
             and obs.origin_id = a.doc_id
            where a.doc_id = %s
        """
        with connect() as connection:
            row = connection.execute(sql, (subject_id,)).fetchone()
        if row is None:
            return None
        return ContentSubject(
            subject_type="signal_candidate",
            subject_id=str(row["subject_id"]),
            title=str(row.get("title") or ""),
            lead=str(row.get("lead") or ""),
            body=str(row.get("body") or ""),
            language=str(row.get("lang") or "") or None,
            source_channel_id=str(row.get("source_channel_id") or "") or None,
            canonical_document_id=str(row.get("canonical_document_id") or "") or None,
            dates={
                "published_at": coerce_datetime(row.get("extracted_published_at") or row.get("published_at")),
                "source_lastmod_at": None,
                "discovered_at": coerce_datetime(row.get("ingested_at")),
                "ingested_at": coerce_datetime(row.get("ingested_at")),
                "updated_at": coerce_datetime(row.get("updated_at")),
            },
        )
    if subject_type == "web_resource":
        sql = """
            select
              wr.resource_id::text as subject_id,
              wr.title,
              wr.summary,
              wr.body,
              wr.lang,
              wr.channel_id::text as source_channel_id,
              wr.projected_signal_candidate_id::text as canonical_document_id,
              wr.published_at,
              wr.discovered_at,
              wr.updated_at,
              wr.raw_payload_json
            from web_resources wr
            where wr.resource_id = %s
        """
        with connect() as connection:
            row = connection.execute(sql, (subject_id,)).fetchone()
        if row is None:
            return None
        raw_payload = row.get("raw_payload_json") if isinstance(row.get("raw_payload_json"), Mapping) else {}
        source_lastmod = None
        if isinstance(raw_payload, Mapping):
            source_lastmod = raw_payload.get("lastmod") or raw_payload.get("sourceLastmodAt")
        return ContentSubject(
            subject_type="web_resource",
            subject_id=str(row["subject_id"]),
            title=str(row.get("title") or ""),
            lead=str(row.get("summary") or ""),
            body=str(row.get("body") or ""),
            language=str(row.get("lang") or "") or None,
            source_channel_id=str(row.get("source_channel_id") or "") or None,
            canonical_document_id=str(row.get("canonical_document_id") or "") or None,
            dates={
                "published_at": coerce_datetime(row.get("published_at")),
                "source_lastmod_at": coerce_datetime(source_lastmod),
                "discovered_at": coerce_datetime(row.get("discovered_at")),
                "ingested_at": coerce_datetime(row.get("discovered_at")),
                "updated_at": coerce_datetime(row.get("updated_at")),
            },
        )
    if subject_type == "story_cluster":
        sql = """
            select
              story_cluster_id::text as subject_id,
              primary_title,
              top_entities,
              top_places,
              min_published_at,
              max_published_at,
              created_at,
              updated_at
            from story_clusters
            where story_cluster_id = %s
        """
        with connect() as connection:
            row = connection.execute(sql, (subject_id,)).fetchone()
        if row is None:
            return None
        top_entities = row.get("top_entities") if isinstance(row.get("top_entities"), list) else []
        top_places = row.get("top_places") if isinstance(row.get("top_places"), list) else []
        return ContentSubject(
            subject_type="story_cluster",
            subject_id=str(row["subject_id"]),
            title=str(row.get("primary_title") or ""),
            lead=" ".join(str(item) for item in top_entities[:10]),
            body=" ".join(str(item) for item in top_places[:10]),
            language=None,
            source_channel_id=None,
            canonical_document_id=None,
            dates={
                "published_at": coerce_datetime(row.get("max_published_at")),
                "source_lastmod_at": None,
                "discovered_at": coerce_datetime(row.get("created_at")),
                "ingested_at": coerce_datetime(row.get("created_at")),
                "updated_at": coerce_datetime(row.get("updated_at")),
                "min_published_at": coerce_datetime(row.get("min_published_at")),
                "max_published_at": coerce_datetime(row.get("max_published_at")),
            },
        )
    return None
