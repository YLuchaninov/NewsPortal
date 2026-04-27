from __future__ import annotations

import asyncio
from typing import Any, Mapping

from ..content_analysis import (
    DEFAULT_CONTENT_FILTER_POLICY_KEY,
    load_content_subject,
    persist_category_analysis,
    persist_cluster_summary_analysis,
    persist_content_filter_result,
    persist_ner_analysis,
    persist_sentiment_analysis,
    persist_structured_extraction_analysis,
    project_system_interest_labels,
)
from .plugins import TASK_REGISTRY, TaskPlugin, TaskPluginRegistry


def _read_string(
    *,
    options: Mapping[str, Any],
    context: Mapping[str, Any],
    key: str,
    aliases: tuple[str, ...] = (),
) -> str | None:
    for source in (options, context):
        for name in (key, *aliases):
            value = source.get(name)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return None


def _read_optional_positive_int(options: Mapping[str, Any], key: str) -> int | None:
    value = options.get(key)
    if value is None:
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return max(1, parsed)


def _resolve_subject(options: Mapping[str, Any], context: Mapping[str, Any]) -> tuple[str, str]:
    subject_type = _read_string(options=options, context=context, key="subject_type", aliases=("subjectType",))
    if subject_type is None or subject_type == "auto":
        subject_type = (
            "story_cluster"
            if _read_string(options=options, context=context, key="story_cluster_id", aliases=("storyClusterId",))
            else "web_resource"
            if _read_string(options=options, context=context, key="resource_id", aliases=("resourceId",))
            else "article"
        )
    if subject_type == "web_resource":
        subject_id = _read_string(
            options=options,
            context=context,
            key="resource_id",
            aliases=("resourceId", "aggregate_id", "aggregateId"),
        )
    elif subject_type == "story_cluster":
        subject_id = _read_string(
            options=options,
            context=context,
            key="story_cluster_id",
            aliases=("storyClusterId", "aggregate_id", "aggregateId"),
        )
    else:
        subject_type = "article"
        subject_id = _read_string(options=options, context=context, key="doc_id", aliases=("docId",))
    if subject_id is None:
        raise ValueError(f"Unable to resolve content analysis subject id for {subject_type}.")
    return subject_type, subject_id


class ContentNerExtractPlugin(TaskPlugin):
    name = "content.ner_extract"
    description = "Extract named entities for a content subject and persist content_analysis rows."
    category = "content_analysis"

    def validate_options(self, options: dict[str, Any]) -> list[str]:
        errors: list[str] = []
        subject_type = options.get("subjectType", options.get("subject_type", "auto"))
        if subject_type not in {"auto", "article", "web_resource", None}:
            errors.append("subjectType must be auto, article, or web_resource.")
        return errors

    def describe_inputs(self) -> dict[str, str]:
        return {
            "doc_id": "Article subject id when subjectType is article or auto.",
            "resource_id": "Web resource subject id when subjectType is web_resource or auto.",
        }

    def describe_outputs(self) -> dict[str, str]:
        return {
            "ner_analysis_id": "Persisted content_analysis_results row id.",
            "entity_count": "Number of persisted content_entities.",
            "entity_types": "Entity types observed in the subject.",
        }

    async def execute(self, options: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        subject_type, subject_id = _resolve_subject(options, context)
        max_text_chars = _read_optional_positive_int(options, "maxTextChars")
        subject = await asyncio.to_thread(load_content_subject, subject_type, subject_id)
        if subject is None:
            return {
                "content_analysis_skipped": True,
                "content_analysis_reason": "subject_not_found",
                "content_analysis_subject_type": subject_type,
                "content_analysis_subject_id": subject_id,
            }
        result = await asyncio.to_thread(persist_ner_analysis, subject, max_text_chars=max_text_chars)
        if result.get("skipped"):
            return {
                "content_analysis_skipped": True,
                "content_analysis_reason": result.get("reason"),
                "content_analysis_subject_type": subject_type,
                "content_analysis_subject_id": subject_id,
                "content_analysis_policy_key": result.get("policyKey"),
                "content_analysis_policy_version": result.get("policyVersion"),
            }
        return {
            "content_analysis_subject_type": subject_type,
            "content_analysis_subject_id": subject_id,
            "ner_analysis_id": result["analysisId"],
            "entity_count": result["entityCount"],
            "entity_types": result["entityTypes"],
        }


class ContentSystemInterestLabelProjectPlugin(TaskPlugin):
    name = "content.system_interest_label_project"
    description = "Project existing system interest filter results into queryable content_labels."
    category = "content_analysis"

    def describe_inputs(self) -> dict[str, str]:
        return {"doc_id": "Article id with interest_filter_results to project."}

    def describe_outputs(self) -> dict[str, str]:
        return {
            "system_interest_label_analysis_id": "Persisted projection analysis id.",
            "system_interest_label_count": "Number of content_labels written.",
        }

    async def execute(self, options: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        del options
        doc_id = _read_string(options={}, context=context, key="doc_id", aliases=("docId",))
        if doc_id is None:
            raise ValueError("content.system_interest_label_project expected doc_id.")
        result = await asyncio.to_thread(project_system_interest_labels, doc_id)
        if result.get("skipped"):
            return {
                "content_analysis_skipped": True,
                "content_analysis_reason": result.get("reason"),
                "content_analysis_subject_type": "article",
                "content_analysis_subject_id": doc_id,
                "content_analysis_policy_key": result.get("policyKey"),
                "content_analysis_policy_version": result.get("policyVersion"),
            }
        return {
            "system_interest_label_analysis_id": result["analysisId"],
            "system_interest_label_count": result["labelCount"],
        }


class ContentSentimentAnalyzePlugin(TaskPlugin):
    name = "content.sentiment_analyze"
    description = "Analyze sentiment, tone, and risk signals for a content subject."
    category = "content_analysis"

    def validate_options(self, options: dict[str, Any]) -> list[str]:
        errors: list[str] = []
        subject_type = options.get("subjectType", options.get("subject_type", "auto"))
        if subject_type not in {"auto", "article", "web_resource", None}:
            errors.append("subjectType must be auto, article, or web_resource.")
        return errors

    def describe_inputs(self) -> dict[str, str]:
        return {
            "doc_id": "Article subject id when subjectType is article or auto.",
            "resource_id": "Web resource subject id when subjectType is web_resource or auto.",
        }

    def describe_outputs(self) -> dict[str, str]:
        return {
            "sentiment_analysis_id": "Persisted content_analysis_results row id.",
            "sentiment": "positive, neutral, or negative.",
            "risk_score": "Lexical risk score from 0 to 1.",
        }

    async def execute(self, options: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        subject_type, subject_id = _resolve_subject(options, context)
        max_text_chars = _read_optional_positive_int(options, "maxTextChars")
        subject = await asyncio.to_thread(load_content_subject, subject_type, subject_id)
        if subject is None:
            return {
                "content_analysis_skipped": True,
                "content_analysis_reason": "subject_not_found",
                "content_analysis_subject_type": subject_type,
                "content_analysis_subject_id": subject_id,
            }
        result = await asyncio.to_thread(persist_sentiment_analysis, subject, max_text_chars=max_text_chars)
        if result.get("skipped"):
            return {
                "content_analysis_skipped": True,
                "content_analysis_reason": result.get("reason"),
                "content_analysis_subject_type": subject_type,
                "content_analysis_subject_id": subject_id,
                "content_analysis_policy_key": result.get("policyKey"),
                "content_analysis_policy_version": result.get("policyVersion"),
            }
        return {
            "content_analysis_subject_type": subject_type,
            "content_analysis_subject_id": subject_id,
            "sentiment_analysis_id": result["analysisId"],
            "sentiment": result["sentiment"],
            "sentiment_score": result["score"],
            "risk_score": result["riskScore"],
            "sentiment_label_count": result["labelCount"],
        }


class ContentCategoryClassifyPlugin(TaskPlugin):
    name = "content.category_classify"
    description = "Classify a content subject into deterministic taxonomy labels."
    category = "content_analysis"

    def validate_options(self, options: dict[str, Any]) -> list[str]:
        errors: list[str] = []
        subject_type = options.get("subjectType", options.get("subject_type", "auto"))
        if subject_type not in {"auto", "article", "web_resource", None}:
            errors.append("subjectType must be auto, article, or web_resource.")
        return errors

    def describe_inputs(self) -> dict[str, str]:
        return {
            "doc_id": "Article subject id when subjectType is article or auto.",
            "resource_id": "Web resource subject id when subjectType is web_resource or auto.",
        }

    def describe_outputs(self) -> dict[str, str]:
        return {
            "category_analysis_id": "Persisted content_analysis_results row id.",
            "primary_category": "Top taxonomy label key.",
            "category_label_count": "Number of taxonomy labels written.",
        }

    async def execute(self, options: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        subject_type, subject_id = _resolve_subject(options, context)
        max_text_chars = _read_optional_positive_int(options, "maxTextChars")
        subject = await asyncio.to_thread(load_content_subject, subject_type, subject_id)
        if subject is None:
            return {
                "content_analysis_skipped": True,
                "content_analysis_reason": "subject_not_found",
                "content_analysis_subject_type": subject_type,
                "content_analysis_subject_id": subject_id,
            }
        result = await asyncio.to_thread(persist_category_analysis, subject, max_text_chars=max_text_chars)
        if result.get("skipped"):
            return {
                "content_analysis_skipped": True,
                "content_analysis_reason": result.get("reason"),
                "content_analysis_subject_type": subject_type,
                "content_analysis_subject_id": subject_id,
                "content_analysis_policy_key": result.get("policyKey"),
                "content_analysis_policy_version": result.get("policyVersion"),
            }
        return {
            "content_analysis_subject_type": subject_type,
            "content_analysis_subject_id": subject_id,
            "category_analysis_id": result["analysisId"],
            "primary_category": result["primaryCategory"],
            "category_count": result["categoryCount"],
            "category_label_count": result["labelCount"],
        }


class ContentStructuredExtractPlugin(TaskPlugin):
    name = "content.structured_extract"
    description = "Extract operator-configured structured entities with local hints plus LLM JSON output."
    category = "content_analysis"

    def validate_options(self, options: dict[str, Any]) -> list[str]:
        errors: list[str] = []
        subject_type = options.get("subjectType", options.get("subject_type", "auto"))
        if subject_type not in {"auto", "article", "web_resource", None}:
            errors.append("subjectType must be auto, article, or web_resource.")
        return errors

    def describe_inputs(self) -> dict[str, str]:
        return {
            "doc_id": "Article subject id when subjectType is article or auto.",
            "resource_id": "Web resource subject id when subjectType is web_resource or auto.",
        }

    def describe_outputs(self) -> dict[str, str]:
        return {
            "structured_extraction_analysis_id": "Persisted content_analysis_results row id.",
            "structured_extraction_count": "Number of extracted structured objects.",
            "structured_extraction_label_count": "Number of projected extracted_field labels.",
        }

    async def execute(self, options: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        subject_type, subject_id = _resolve_subject(options, context)
        max_text_chars = _read_optional_positive_int(options, "maxTextChars")
        subject = await asyncio.to_thread(load_content_subject, subject_type, subject_id)
        if subject is None:
            return {
                "content_analysis_skipped": True,
                "content_analysis_reason": "subject_not_found",
                "content_analysis_subject_type": subject_type,
                "content_analysis_subject_id": subject_id,
            }
        result = await asyncio.to_thread(
            persist_structured_extraction_analysis,
            subject,
            max_text_chars=max_text_chars,
        )
        if result.get("skipped") or result.get("failed"):
            return {
                "content_analysis_skipped": bool(result.get("skipped")),
                "content_analysis_failed": bool(result.get("failed")),
                "content_analysis_reason": result.get("reason"),
                "content_analysis_subject_type": subject_type,
                "content_analysis_subject_id": subject_id,
                "content_analysis_policy_key": result.get("policyKey"),
                "content_analysis_policy_version": result.get("policyVersion"),
            }
        return {
            "content_analysis_subject_type": subject_type,
            "content_analysis_subject_id": subject_id,
            "structured_extraction_analysis_id": result["analysisId"],
            "structured_extraction_count": result["extractionCount"],
            "structured_extraction_entity_count": result["entityCount"],
            "structured_extraction_label_count": result["labelCount"],
            "structured_extraction_template_key": result["templateKey"],
        }


class ContentClusterSummaryProjectPlugin(TaskPlugin):
    name = "content.cluster_summary_project"
    description = "Project existing story-cluster verification context into content_analysis."
    category = "content_analysis"

    def validate_options(self, options: dict[str, Any]) -> list[str]:
        errors: list[str] = []
        subject_type = options.get("subjectType", options.get("subject_type", "story_cluster"))
        if subject_type not in {"auto", "story_cluster", None}:
            errors.append("subjectType must be auto or story_cluster.")
        return errors

    def describe_inputs(self) -> dict[str, str]:
        return {
            "story_cluster_id": "Story cluster id, usually from article.cluster output.",
        }

    def describe_outputs(self) -> dict[str, str]:
        return {
            "cluster_summary_analysis_id": "Persisted content_analysis_results row id.",
            "cluster_verification_state": "Existing story-cluster verification state.",
            "cluster_canonical_document_count": "Number of canonical documents in the story cluster.",
        }

    async def execute(self, options: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        story_cluster_id = _read_string(
            options=options,
            context=context,
            key="story_cluster_id",
            aliases=("storyClusterId",),
        )
        if story_cluster_id is None:
            return {
                "content_analysis_skipped": True,
                "content_analysis_reason": "story_cluster_not_available",
            }
        result = await asyncio.to_thread(persist_cluster_summary_analysis, story_cluster_id)
        return {
            "content_analysis_subject_type": "story_cluster",
            "content_analysis_subject_id": story_cluster_id,
            "cluster_summary_analysis_id": result["analysisId"],
            "cluster_verification_state": result["verificationState"],
            "cluster_canonical_document_count": result["canonicalDocumentCount"],
            "cluster_source_family_count": result["sourceFamilyCount"],
            "cluster_member_count": result["memberCount"],
        }


class ContentFilterGatePlugin(TaskPlugin):
    name = "content.filter_gate"
    description = "Evaluate a content_filter_policy and persist a dry-run/hold/enforce gate result."
    category = "content_analysis"

    def validate_options(self, options: dict[str, Any]) -> list[str]:
        errors: list[str] = []
        mode = options.get("mode")
        if mode is not None and mode not in {"disabled", "observe", "dry_run", "hold", "enforce"}:
            errors.append("mode must be disabled, observe, dry_run, hold, or enforce.")
        return errors

    def describe_inputs(self) -> dict[str, str]:
        return {
            "doc_id": "Article subject id when subjectType is article or auto.",
            "resource_id": "Web resource subject id when subjectType is web_resource or auto.",
        }

    def describe_outputs(self) -> dict[str, str]:
        return {
            "content_filter_result_id": "Persisted content_filter_results row id.",
            "content_filter_passed": "Whether the evaluated policy passed.",
            "content_filter_decision": "keep, reject, hold, or needs_review.",
        }

    async def execute(self, options: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
        subject_type, subject_id = _resolve_subject(options, context)
        policy_key = (
            _read_string(options=options, context=context, key="policy_key", aliases=("policyKey",))
            or DEFAULT_CONTENT_FILTER_POLICY_KEY
        )
        mode = _read_string(options=options, context=context, key="mode")
        result = await asyncio.to_thread(
            persist_content_filter_result,
            subject_type,
            subject_id,
            policy_key=policy_key,
            mode_override=mode,
        )
        if result.get("skipped"):
            return {
                "content_filter_skipped": True,
                "content_filter_reason": result.get("reason"),
                "content_filter_policy_key": policy_key,
            }
        return {
            "content_filter_result_id": result["filterResultId"],
            "content_filter_policy_key": result["policyKey"],
            "content_filter_policy_version": result["policyVersion"],
            "content_filter_mode": result["mode"],
            "content_filter_decision": result["decision"],
            "content_filter_passed": result["passed"],
        }


CONTENT_ANALYSIS_PLUGIN_CLASSES = (
    ContentNerExtractPlugin,
    ContentSentimentAnalyzePlugin,
    ContentCategoryClassifyPlugin,
    ContentStructuredExtractPlugin,
    ContentClusterSummaryProjectPlugin,
    ContentSystemInterestLabelProjectPlugin,
    ContentFilterGatePlugin,
)


def register_content_analysis_plugins(
    registry: TaskPluginRegistry | None = None,
) -> TaskPluginRegistry:
    target_registry = registry or TASK_REGISTRY
    for plugin_class in CONTENT_ANALYSIS_PLUGIN_CLASSES:
        target_registry.register(plugin_class)
    return target_registry


register_content_analysis_plugins(TASK_REGISTRY)
