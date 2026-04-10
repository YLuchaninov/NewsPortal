from __future__ import annotations

from typing import Any


class PostgresArticleEnricherAdapter:
    def enrich_articles(
        self,
        *,
        articles: list[dict[str, Any]],
        enrichment: Any,
        mode: str,
        target_field: str | None,
    ) -> dict[str, Any]:
        field_name = target_field or "enrichment"
        annotations = enrichment if isinstance(enrichment, dict) else {}
        enriched_articles: list[dict[str, Any]] = []
        for article in articles:
            article_copy = dict(article)
            value = annotations.get(article.get("doc_id"), {})
            if mode == "replace":
                article_copy[field_name] = value
            else:
                existing = article_copy.get(field_name)
                if isinstance(existing, dict) and isinstance(value, dict):
                    article_copy[field_name] = {**existing, **value}
                else:
                    article_copy[field_name] = value
            enriched_articles.append(article_copy)
        return {
            "articles": enriched_articles,
            "enriched_count": len(enriched_articles),
            "mode": mode,
        }

