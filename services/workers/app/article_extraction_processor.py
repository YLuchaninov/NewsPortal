from __future__ import annotations

from typing import Any

from .runtime_values import coerce_bool


async def process_article_extract(job: Any, _job_token: str) -> dict[str, Any]:
    from .task_engine.pipeline_plugins import ArticleExtractPlugin

    plugin = ArticleExtractPlugin()
    event_id = str(job.data.get("eventId"))
    doc_id = str(job.data.get("docId"))
    force_enrichment = coerce_bool(job.data.get("forceEnrichment"))

    return await plugin.execute(
        {},
        {
            "event_id": event_id,
            "doc_id": doc_id,
            "force_enrichment": force_enrichment,
        },
    )
