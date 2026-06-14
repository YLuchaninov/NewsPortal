from __future__ import annotations

from typing import Any

from .discovery_plugin_common import ContextTaskPlugin, _coerce_mapping_list, _tokenize


class RelevanceScorerPlugin(ContextTaskPlugin):
    name = "discovery.relevance_scorer"
    description = "Deterministically score candidate sources against target topics."
    category = "discovery"

    async def execute(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        sources_field = self._resolve_optional_string(
            options=options,
            context=context,
            key="sources_field",
            aliases=("sourcesField",),
        )
        threshold = self._resolve_probability(
            options=options,
            context=context,
            key="threshold",
            default=0.35,
        )
        max_sources = self._resolve_positive_int(
            options=options,
            context=context,
            key="max_sources",
            aliases=("maxSources",),
            default=100,
        )

        target_topics = self._resolve_string_list(
            options=options,
            context=context,
            key="target_topics",
            aliases=("targetTopics",),
            default=[],
        )
        if not target_topics:
            topics_field = self._resolve_optional_string(
                options=options,
                context=context,
                key="target_topics_field",
                aliases=("targetTopicsField",),
            )
            if topics_field:
                target_topics = self._resolve_string_list(
                    options={},
                    context=context,
                    key=topics_field,
                )
        if not target_topics:
            search_query = self._resolve_optional_string(
                options=options,
                context=context,
                key="search_query",
                aliases=("searchQuery",),
            ) or (
                str(context.get("search_query")).strip()
                if isinstance(context.get("search_query"), str)
                else ""
            )
            if search_query:
                target_topics = [search_query]

        source_candidates = context.get(sources_field) if sources_field else (
            context.get("sampled_content")
            or context.get("probed_feeds")
            or context.get("validated_urls")
            or context.get("search_results")
            or []
        )
        sources = _coerce_mapping_list(source_candidates, field_name="sources")

        target_tokens = set(_tokenize(target_topics))
        scored_sources: list[dict[str, Any]] = []

        for source in sources[:max_sources]:
            source_url = next(
                (
                    str(candidate).strip()
                    for candidate in (
                        source.get("source_url"),
                        source.get("url"),
                        source.get("final_url"),
                    )
                    if isinstance(candidate, str) and candidate.strip()
                ),
                None,
            )
            if source_url is None:
                continue

            source_tokens = set(_tokenize(source))
            matched_terms = sorted(target_tokens.intersection(source_tokens))
            score = round(
                len(matched_terms) / len(target_tokens),
                4,
            ) if target_tokens else 0.0
            scored_sources.append(
                {
                    "source_url": source_url,
                    "relevance_score": score,
                    "passes_threshold": score >= threshold,
                    "matched_terms": matched_terms,
                }
            )

        return {"scored_sources": scored_sources}

    def validate_options(self, options: dict[str, Any]) -> list[str]:
        errors: list[str] = []
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="sources_field",
            aliases=("sourcesField",),
        )
        self._validate_optional_probability(options, errors, option_key="threshold")
        self._validate_optional_positive_int(
            options,
            errors,
            option_key="max_sources",
            aliases=("maxSources",),
        )
        self._validate_optional_string_list(
            options,
            errors,
            option_key="target_topics",
            aliases=("targetTopics",),
        )
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="target_topics_field",
            aliases=("targetTopicsField",),
        )
        return errors

    def describe_inputs(self) -> dict[str, str]:
        return {
            "sources_field": "Context field containing discovery source candidates.",
            "target_topics": "Explicit target topics or keywords.",
            "target_topics_field": "Context field containing the target topic list.",
            "threshold": "Score threshold used to mark passing sources.",
        }

    def describe_outputs(self) -> dict[str, str]:
        return {
            "scored_sources": "Candidate sources with deterministic relevance scores and threshold decisions.",
        }
