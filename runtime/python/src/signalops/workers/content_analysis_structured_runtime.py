"""Structured extraction content-analysis runtime workflows."""

from __future__ import annotations

from typing import Any, Mapping

from psycopg.types.json import Json

from .content_analysis_heuristic_terms import BUYER_CUE_TERMS, DATE_PATTERN, JOB_CUE_TERMS, MONEY_PATTERN, URL_PATTERN
from .content_analysis_heuristics import extract_heuristic_entities, tokenize as _tokenize
from .content_analysis_repository import _replace_analysis_result
from .content_analysis_runtime import (
    DEFAULT_MAX_TEXT_CHARS,
    ContentSubject,
    RuntimeAnalysisPolicy,
    analysis_source_hash as _analysis_source_hash,
    connect as _connect,
    default_model_for_module as _default_model_for_module,
    normalize_key as _normalize_key,
    policy_result_json as _policy_result_json,
    resolve_max_text_chars as _resolve_max_text_chars,
    resolve_policy_for_module as _resolve_policy_for_module,
)
from .content_analysis_structured import (
    build_structured_extraction_prompt,
    iter_structured_field_values as _iter_structured_field_values,
    normalize_structured_template as _normalize_structured_template,
    structured_entity_type as _structured_entity_type,
    structured_field_specs as _structured_field_specs,
    structured_label_key as _structured_label_key,
    structured_label_projection_allowed as _structured_label_projection_allowed,
    validate_structured_extraction_output,
)
from .gemini import review_with_gemini


def build_structured_extraction_hints(
    text: str,
    *,
    max_chars: int = DEFAULT_MAX_TEXT_CHARS,
) -> dict[str, Any]:
    bounded_text = text[:max_chars]
    tokens = set(_tokenize(bounded_text, max_chars=max_chars))
    entities = extract_heuristic_entities(
        bounded_text,
        max_chars=max_chars,
        config={"entityTypeAllowlist": ["ORG", "GPE", "DATE"]},
    )
    return {
        "candidateEntities": [
            {
                "text": entity["text"],
                "type": entity["type"],
                "mentionCount": entity["mentionCount"],
            }
            for entity in entities[:20]
        ],
        "candidateDates": [match.group(0) for match in DATE_PATTERN.finditer(bounded_text)][:20],
        "candidateMoney": [match.group(0) for match in MONEY_PATTERN.finditer(bounded_text)][:20],
        "candidateUrls": [match.group(0) for match in URL_PATTERN.finditer(bounded_text)][:20],
        "matchedCueTerms": {
            "job": sorted(term for term in JOB_CUE_TERMS if term.casefold() in tokens)[:20],
            "buyer": sorted(term for term in BUYER_CUE_TERMS if term.casefold() in tokens)[:20],
        },
    }


def persist_structured_extraction_analysis(
    subject: ContentSubject,
    *,
    max_text_chars: int | None = None,
) -> dict[str, Any]:
    policy_candidate = _resolve_policy_for_module("structured_extraction", subject)
    if isinstance(policy_candidate, dict):
        return policy_candidate
    if policy_candidate is None:
        return {"skipped": True, "reason": "missing_policy", "policyKey": "structured_extraction"}
    policy = policy_candidate
    resolved_max_text_chars = _resolve_max_text_chars(explicit_max_text_chars=max_text_chars, policy=policy)
    provider, default_model_key, model_version = _default_model_for_module("structured_extraction")
    model_key = policy.model_key or default_model_key
    if policy.model_version:
        model_version = policy.model_version
    text = subject.text
    try:
        template = _normalize_structured_template(policy.config)
    except ValueError as error:
        return _persist_structured_extraction_failure(
            subject,
            policy=policy,
            provider=provider,
            model_key=model_key,
            model_version=model_version,
            source_hash=_analysis_source_hash(text[:resolved_max_text_chars], policy),
            reason=str(error),
            parsed=None,
            provider_meta={},
        )
    hints = build_structured_extraction_hints(text, max_chars=resolved_max_text_chars)
    prompt = build_structured_extraction_prompt(
        subject=subject,
        template=template,
        hints=hints,
        max_text_chars=resolved_max_text_chars,
    )
    review = review_with_gemini(prompt, model_override=model_key, temperature=0)
    parsed = review.response_json.get("parsed") if isinstance(review.response_json, Mapping) else None
    extractions, validation_errors = validate_structured_extraction_output(parsed, template)
    source_hash = _analysis_source_hash(
        {
            "text": text[:resolved_max_text_chars],
            "template": template,
            "prompt": prompt,
        },
        policy,
    )
    provider_meta = {
        "providerLatencyMs": review.provider_latency_ms,
        "promptTokens": review.prompt_tokens,
        "completionTokens": review.completion_tokens,
        "totalTokens": review.total_tokens,
        "costEstimateUsd": float(review.cost_estimate_usd) if review.cost_estimate_usd is not None else None,
        "providerUsage": review.provider_usage_json,
    }
    if validation_errors:
        return _persist_structured_extraction_failure(
            subject,
            policy=policy,
            provider=provider,
            model_key=model_key,
            model_version=model_version,
            source_hash=source_hash,
            reason="; ".join(validation_errors[:5]),
            parsed=parsed,
            provider_meta=provider_meta,
        )
    field_specs = _structured_field_specs(template)
    result_json = {
        "templateKey": template["templateKey"],
        "extractions": extractions,
        "extractionCount": len(extractions),
        "hints": hints,
        "model": {
            "provider": provider,
            "modelKey": model_key,
            "modelVersion": model_version,
        },
        "policy": _policy_result_json(policy),
        "llm": provider_meta,
        "textChars": min(len(text), resolved_max_text_chars),
    }
    projected_entity_count = 0
    projected_label_count = 0
    with _connect() as connection:
        with connection.transaction():
            analysis_id = _replace_analysis_result(
                connection,
                subject=subject,
                analysis_type="structured_extraction",
                provider=provider,
                model_key=model_key,
                model_version=model_version,
                result_json=result_json,
                confidence=max((float(item["confidence"]) for item in extractions), default=0.0),
                source_hash=source_hash,
                policy=policy,
            )
            connection.execute(
                """
                delete from content_entities
                where subject_type = %s
                  and subject_id = %s
                  and provider = %s
                  and model_key = %s
                  and analysis_id in (
                    select analysis_id
                    from content_analysis_results
                    where subject_type = %s
                      and subject_id = %s
                      and analysis_type = 'structured_extraction'
                  )
                """,
                (
                    subject.subject_type,
                    subject.subject_id,
                    provider,
                    model_key,
                    subject.subject_type,
                    subject.subject_id,
                ),
            )
            connection.execute(
                """
                delete from content_labels
                where subject_type = %s
                  and subject_id = %s
                  and label_type = 'extracted_field'
                """,
                (subject.subject_type, subject.subject_id),
            )
            for index, extraction in enumerate(extractions):
                entity_type = str(extraction["type"])
                fields = extraction["fields"] if isinstance(extraction.get("fields"), Mapping) else {}
                display_text = str(fields.get("company") or fields.get("role") or fields.get("need") or entity_type)
                connection.execute(
                    """
                    insert into content_entities (
                      subject_type,
                      subject_id,
                      canonical_document_id,
                      source_channel_id,
                      entity_text,
                      normalized_key,
                      entity_type,
                      salience,
                      confidence,
                      mention_count,
                      mentions_json,
                      provider,
                      model_key,
                      analysis_id
                    )
                    values (%s, %s, %s, %s, %s, %s, %s, %s, %s, 1, %s, %s, %s, %s)
                    """,
                    (
                        subject.subject_type,
                        subject.subject_id,
                        subject.canonical_document_id,
                        subject.source_channel_id,
                        display_text,
                        _normalize_key(f"{entity_type}:{display_text}:{index}"),
                        _structured_entity_type(entity_type),
                        1.0 / max(1, len(extractions)),
                        extraction["confidence"],
                        Json(extraction.get("evidence", [])),
                        provider,
                        model_key,
                        analysis_id,
                    ),
                )
                projected_entity_count += 1
                for field_key, raw_value in fields.items():
                    field_spec = field_specs.get((entity_type, field_key), {})
                    projection = set(field_spec.get("project", []))
                    for value in _iter_structured_field_values(raw_value):
                        if "entity" in projection:
                            connection.execute(
                                """
                                insert into content_entities (
                                  subject_type,
                                  subject_id,
                                  canonical_document_id,
                                  source_channel_id,
                                  entity_text,
                                  normalized_key,
                                  entity_type,
                                  salience,
                                  confidence,
                                  mention_count,
                                  mentions_json,
                                  provider,
                                  model_key,
                                  analysis_id
                                )
                                values (%s, %s, %s, %s, %s, %s, %s, 0.5, %s, 1, %s, %s, %s, %s)
                                """,
                                (
                                    subject.subject_type,
                                    subject.subject_id,
                                    subject.canonical_document_id,
                                    subject.source_channel_id,
                                    str(value),
                                    _normalize_key(str(value)),
                                    _structured_entity_type(entity_type, field_key),
                                    extraction["confidence"],
                                    Json(extraction.get("evidence", [])),
                                    provider,
                                    model_key,
                                    analysis_id,
                                ),
                            )
                            projected_entity_count += 1
                        if "label" in projection and _structured_label_projection_allowed(
                            field_spec,
                            value,
                            allow_high_cardinality_labels=bool(template.get("allowHighCardinalityLabels")),
                        ):
                            label_key = _structured_label_key(entity_type, field_key, value)
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
                                values (%s, %s, %s, %s, 'extracted_field', %s, %s, 'match', %s, %s, %s, %s)
                                """,
                                (
                                    subject.subject_type,
                                    subject.subject_id,
                                    subject.canonical_document_id,
                                    subject.source_channel_id,
                                    label_key,
                                    f"{entity_type}.{field_key}",
                                    extraction["confidence"],
                                    extraction["confidence"],
                                    Json(
                                        {
                                            "entityType": entity_type,
                                            "fieldKey": field_key,
                                            "value": value,
                                            "templateKey": template["templateKey"],
                                        }
                                    ),
                                    analysis_id,
                                ),
                            )
                            projected_label_count += 1
    return {
        "analysisId": str(analysis_id),
        "extractionCount": len(extractions),
        "entityCount": projected_entity_count,
        "labelCount": projected_label_count,
        "templateKey": template["templateKey"],
    }


def _persist_structured_extraction_failure(
    subject: ContentSubject,
    *,
    policy: RuntimeAnalysisPolicy,
    provider: str,
    model_key: str,
    model_version: str,
    source_hash: str,
    reason: str,
    parsed: Any,
    provider_meta: Mapping[str, Any],
) -> dict[str, Any]:
    status = "skipped" if policy.failure_policy == "skip" else "failed"
    result_json = {
        "error": reason,
        "parsed": parsed if isinstance(parsed, Mapping) else {},
        "policy": _policy_result_json(policy),
        "llm": dict(provider_meta),
    }
    with _connect() as connection:
        with connection.transaction():
            analysis_id = _replace_analysis_result(
                connection,
                subject=subject,
                analysis_type="structured_extraction",
                provider=provider,
                model_key=model_key,
                model_version=model_version,
                result_json=result_json,
                confidence=0.0,
                source_hash=source_hash,
                policy=policy,
                status=status,
                error_text=reason,
            )
    return {
        "skipped": status == "skipped",
        "failed": status == "failed",
        "reason": reason,
        "analysisId": str(analysis_id),
        "policyKey": policy.policy_key,
        "policyVersion": policy.version,
    }
