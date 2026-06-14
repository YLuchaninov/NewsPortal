from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Mapping

import psycopg
from psycopg.types.json import Json

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
from .content_filter_policy import combine_filter_rule_results
from .content_analysis_heuristic_terms import (
    BUYER_CUE_TERMS,
    DATE_PATTERN,
    JOB_CUE_TERMS,
    MONEY_PATTERN,
    URL_PATTERN,
)
from .content_analysis_heuristics import (
    analyze_categories,
    analyze_sentiment,
    extract_heuristic_entities,
    tokenize as _tokenize,
)
from .content_analysis_runtime import (
    CLUSTER_SUMMARY_MODEL_KEY,
    CLUSTER_SUMMARY_MODEL_VERSION,
    CLUSTER_SUMMARY_PROVIDER,
    CONTENT_FILTER_MODEL_KEY,
    CONTENT_FILTER_MODEL_VERSION,
    CONTENT_FILTER_PROVIDER,
    DEFAULT_CONTENT_FILTER_POLICY_KEY,
    DEFAULT_MAX_TEXT_CHARS,
    SYSTEM_LABEL_MODEL_KEY,
    SYSTEM_LABEL_MODEL_VERSION,
    SYSTEM_LABEL_PROVIDER,
    ContentSubject,
    RuntimeAnalysisPolicy,
    analysis_source_hash as _analysis_source_hash,
    connect as _connect,
    default_model_for_module as _default_model_for_module,
    normalize_key as _normalize_key,
    policy_supports_local_runtime as _runtime_policy_supports_local_runtime,
    policy_result_json as _policy_result_json,
    read_config_bool as _read_config_bool,
    resolve_max_text_chars as _resolve_max_text_chars,
    resolve_policy_for_module as _resolve_policy_for_module,
    source_hash as _source_hash,
)
from .content_analysis_subjects import (
    coerce_datetime as _coerce_datetime,
    load_content_subject,
)
from .gemini import review_with_gemini


_policy_supports_local_runtime = _runtime_policy_supports_local_runtime


def persist_ner_analysis(subject: ContentSubject, *, max_text_chars: int | None = None) -> dict[str, Any]:
    policy_candidate = _resolve_policy_for_module("ner", subject)
    if isinstance(policy_candidate, dict):
        return policy_candidate
    policy = policy_candidate
    resolved_max_text_chars = _resolve_max_text_chars(explicit_max_text_chars=max_text_chars, policy=policy)
    provider, model_key, model_version = _default_model_for_module("ner")
    if policy is not None:
        provider = policy.provider or provider
        model_key = policy.model_key or model_key
        model_version = policy.model_version or model_version
    text = subject.text
    source_hash = _analysis_source_hash(text[:resolved_max_text_chars], policy)
    entities = extract_heuristic_entities(text, max_chars=resolved_max_text_chars, config=policy.config if policy else None)
    result_json = {
        "entities": entities,
        "entityCount": len(entities),
        "model": {
            "provider": provider,
            "modelKey": model_key,
            "modelVersion": model_version,
        },
        "policy": _policy_result_json(policy),
        "textChars": min(len(text), resolved_max_text_chars),
    }
    with _connect() as connection:
        with connection.transaction():
            analysis_id = _replace_analysis_result(
                connection,
                subject=subject,
                analysis_type="ner",
                provider=provider,
                model_key=model_key,
                model_version=model_version,
                result_json=result_json,
                confidence=max((float(item["confidence"]) for item in entities), default=None),
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
                """,
                (
                    subject.subject_type,
                    subject.subject_id,
                    provider,
                    model_key,
                ),
            )
            for entity in entities:
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
                    values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        subject.subject_type,
                        subject.subject_id,
                        subject.canonical_document_id,
                        subject.source_channel_id,
                        entity["text"],
                        entity["normalizedKey"],
                        entity["type"],
                        entity["salience"],
                        entity["confidence"],
                        entity["mentionCount"],
                        Json(entity["mentions"]),
                        provider,
                        model_key,
                        analysis_id,
                    ),
                )
    return {"analysisId": str(analysis_id), "entityCount": len(entities), "entityTypes": sorted({str(item["type"]) for item in entities})}


def _replace_analysis_result(
    connection: psycopg.Connection[Any],
    *,
    subject: ContentSubject,
    analysis_type: str,
    provider: str,
    model_key: str,
    model_version: str,
    result_json: Mapping[str, Any],
    confidence: float | None,
    source_hash: str | None,
    policy: RuntimeAnalysisPolicy | None = None,
    status: str = "completed",
    error_text: str | None = None,
) -> uuid.UUID:
    row = connection.execute(
        """
        insert into content_analysis_results (
          subject_type,
          subject_id,
          canonical_document_id,
          source_channel_id,
          analysis_type,
          provider,
          model_key,
          model_version,
          language,
          policy_id,
          policy_version,
          status,
          result_json,
          confidence,
          source_hash,
          error_text
        )
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        on conflict (
          subject_type,
          subject_id,
          analysis_type,
          provider,
          model_key,
          (coalesce(source_hash, ''::text))
        )
        do update set
          canonical_document_id = excluded.canonical_document_id,
          source_channel_id = excluded.source_channel_id,
          model_version = excluded.model_version,
          language = excluded.language,
          policy_id = excluded.policy_id,
          policy_version = excluded.policy_version,
          status = excluded.status,
          result_json = excluded.result_json,
          confidence = excluded.confidence,
          error_text = excluded.error_text,
          updated_at = now()
        returning analysis_id
        """,
        (
            subject.subject_type,
            subject.subject_id,
            subject.canonical_document_id,
            subject.source_channel_id,
            analysis_type,
            provider,
            model_key,
            model_version,
            subject.language,
            policy.policy_id if policy else None,
            policy.version if policy else None,
            status,
            Json(dict(result_json)),
            confidence,
            source_hash,
            error_text,
        ),
    ).fetchone()
    return uuid.UUID(str(row["analysis_id"]))


def persist_sentiment_analysis(
    subject: ContentSubject,
    *,
    max_text_chars: int | None = None,
) -> dict[str, Any]:
    policy_candidate = _resolve_policy_for_module("sentiment", subject)
    if isinstance(policy_candidate, dict):
        return policy_candidate
    policy = policy_candidate
    resolved_max_text_chars = _resolve_max_text_chars(explicit_max_text_chars=max_text_chars, policy=policy)
    provider, model_key, model_version = _default_model_for_module("sentiment")
    if policy is not None:
        provider = policy.provider or provider
        model_key = policy.model_key or model_key
        model_version = policy.model_version or model_version
    text = subject.text
    source_hash = _analysis_source_hash(text[:resolved_max_text_chars], policy)
    analysis = analyze_sentiment(text, max_chars=resolved_max_text_chars, config=policy.config if policy else None)
    result_json = {
        **analysis,
        "model": {
            "provider": provider,
            "modelKey": model_key,
            "modelVersion": model_version,
        },
        "policy": _policy_result_json(policy),
    }
    labels = [
        {
            "labelType": "sentiment",
            "labelKey": analysis["sentiment"],
            "labelName": str(analysis["sentiment"]).title(),
            "score": abs(float(analysis["score"])),
            "confidence": analysis["confidence"],
            "explain": {
                "score": analysis["score"],
                "matchedTerms": analysis["matchedTerms"],
            },
        },
        {
            "labelType": "tone",
            "labelKey": analysis["tone"],
            "labelName": str(analysis["tone"]).replace("_", " ").title(),
            "score": analysis["riskScore"],
            "confidence": analysis["confidence"],
            "explain": {
                "riskScore": analysis["riskScore"],
                "riskCount": analysis["riskCount"],
                "matchedTerms": analysis["matchedTerms"]["risk"],
            },
        },
    ]
    if float(analysis["riskScore"]) > 0:
        labels.append(
            {
                "labelType": "risk",
                "labelKey": "risk_signal",
                "labelName": "Risk Signal",
                "score": analysis["riskScore"],
                "confidence": analysis["confidence"],
                "explain": {
                    "riskScore": analysis["riskScore"],
                    "riskCount": analysis["riskCount"],
                    "matchedTerms": analysis["matchedTerms"]["risk"],
                },
            }
        )
    with _connect() as connection:
        with connection.transaction():
            analysis_id = _replace_analysis_result(
                connection,
                subject=subject,
                analysis_type="sentiment",
                provider=provider,
                model_key=model_key,
                model_version=model_version,
                result_json=result_json,
                confidence=float(analysis["confidence"]),
                source_hash=source_hash,
                policy=policy,
            )
            connection.execute(
                """
                delete from content_labels
                where subject_type = %s
                  and subject_id = %s
                  and label_type in ('sentiment', 'tone', 'risk')
                """,
                (subject.subject_type, subject.subject_id),
            )
            for label in labels:
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
                    values (%s, %s, %s, %s, %s, %s, %s, 'match', %s, %s, %s, %s)
                    """,
                    (
                        subject.subject_type,
                        subject.subject_id,
                        subject.canonical_document_id,
                        subject.source_channel_id,
                        label["labelType"],
                        label["labelKey"],
                        label["labelName"],
                        label["score"],
                        label["confidence"],
                        Json(label["explain"]),
                        analysis_id,
                    ),
                )
    return {
        "analysisId": str(analysis_id),
        "sentiment": analysis["sentiment"],
        "score": analysis["score"],
        "riskScore": analysis["riskScore"],
        "labelCount": len(labels),
    }


def persist_category_analysis(
    subject: ContentSubject,
    *,
    max_text_chars: int | None = None,
) -> dict[str, Any]:
    policy_candidate = _resolve_policy_for_module("category", subject)
    if isinstance(policy_candidate, dict):
        return policy_candidate
    policy = policy_candidate
    resolved_max_text_chars = _resolve_max_text_chars(explicit_max_text_chars=max_text_chars, policy=policy)
    provider, model_key, model_version = _default_model_for_module("category")
    if policy is not None:
        provider = policy.provider or provider
        model_key = policy.model_key or model_key
        model_version = policy.model_version or model_version
    text = subject.text
    source_hash = _analysis_source_hash(text[:resolved_max_text_chars], policy)
    analysis = analyze_categories(text, max_chars=resolved_max_text_chars, config=policy.config if policy else None)
    result_json = {
        **analysis,
        "model": {
            "provider": provider,
            "modelKey": model_key,
            "modelVersion": model_version,
        },
        "policy": _policy_result_json(policy),
    }
    with _connect() as connection:
        with connection.transaction():
            analysis_id = _replace_analysis_result(
                connection,
                subject=subject,
                analysis_type="category",
                provider=provider,
                model_key=model_key,
                model_version=model_version,
                result_json=result_json,
                confidence=float(analysis["confidence"]),
                source_hash=source_hash,
                policy=policy,
            )
            connection.execute(
                """
                delete from content_labels
                where subject_type = %s
                  and subject_id = %s
                  and label_type = 'taxonomy'
                """,
                (subject.subject_type, subject.subject_id),
            )
            for category in analysis["categories"]:
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
                    values (%s, %s, %s, %s, 'taxonomy', %s, %s, 'match', %s, %s, %s, %s)
                    """,
                    (
                        subject.subject_type,
                        subject.subject_id,
                        subject.canonical_document_id,
                        subject.source_channel_id,
                        category["key"],
                        category["name"],
                        category["score"],
                        category["confidence"],
                        Json(
                            {
                                "primaryCategory": analysis["primaryCategory"],
                                "matchedTerms": category["matchedTerms"],
                                "termCount": category["termCount"],
                            }
                        ),
                        analysis_id,
                    ),
                )
    return {
        "analysisId": str(analysis_id),
        "primaryCategory": analysis["primaryCategory"],
        "categoryCount": analysis["categoryCount"],
        "labelCount": len(analysis["categories"]),
    }


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


def load_filter_policy(policy_key: str = DEFAULT_CONTENT_FILTER_POLICY_KEY) -> dict[str, Any] | None:
    with _connect() as connection:
        row = connection.execute(
            """
            select
              filter_policy_id::text as filter_policy_id,
              policy_key,
              mode,
              combiner,
              policy_json,
              version
            from content_filter_policies
            where policy_key = %s
              and is_active = true
            order by version desc, priority asc
            limit 1
            """,
            (policy_key,),
        ).fetchone()
    return dict(row) if row else None


def _relative_threshold(value: Mapping[str, Any]) -> datetime:
    amount = int(value.get("amount") or 0)
    unit = str(value.get("unit") or "days")
    days_by_unit = {
        "day": 1,
        "days": 1,
        "week": 7,
        "weeks": 7,
        "month": 30,
        "months": 30,
        "year": 365,
        "years": 365,
    }
    days = max(0, amount) * days_by_unit.get(unit, 1)
    return datetime.now(timezone.utc) - timedelta(days=days)


def _resolve_date(subject: ContentSubject, field: str, policy_json: Mapping[str, Any]) -> tuple[datetime | None, str | None]:
    candidates = [field]
    candidates.extend(str(item) for item in policy_json.get("dateFallback", []) if str(item).strip())
    for candidate in candidates:
        value = subject.dates.get(candidate)
        if value is not None:
            return value, candidate
    return None, None


def _load_subject_labels(subject: ContentSubject) -> list[dict[str, Any]]:
    with _connect() as connection:
        rows = connection.execute(
            """
            select
              label_type,
              label_key,
              label_name,
              decision,
              score,
              confidence,
              explain_json
            from content_labels
            where subject_type = %s
              and subject_id = %s
            """,
            (subject.subject_type, subject.subject_id),
        ).fetchall()
    return [dict(row) for row in rows]


def _evaluate_label_rule(subject: ContentSubject, value: Any) -> tuple[bool, dict[str, Any]]:
    detail: dict[str, Any] = {}
    if not isinstance(value, Mapping):
        detail["reason"] = "invalid_label_rule_value"
        return False, detail
    label_type = str(value.get("labelType") or value.get("label_type") or "").strip()
    label_key = str(value.get("labelKey") or value.get("label_key") or "").strip()
    decisions = {
        str(item)
        for item in value.get("decisions", ["match", "gray_zone"])
        if str(item).strip()
    }
    min_score_value = value.get("minScore", value.get("min_score"))
    min_score = float(min_score_value) if min_score_value is not None else None
    detail.update(
        {
            "labelType": label_type or None,
            "labelKey": label_key or None,
            "decisions": sorted(decisions),
            "minScore": min_score,
        }
    )
    labels = _load_subject_labels(subject)
    matched_labels: list[dict[str, Any]] = []
    for label in labels:
        if label_type and str(label.get("label_type")) != label_type:
            continue
        if label_key and str(label.get("label_key")) != label_key:
            continue
        if decisions and str(label.get("decision")) not in decisions:
            continue
        score = label.get("score")
        if min_score is not None and (score is None or float(score) < min_score):
            continue
        matched_labels.append(
            {
                "labelType": label.get("label_type"),
                "labelKey": label.get("label_key"),
                "decision": label.get("decision"),
                "score": label.get("score"),
                "confidence": label.get("confidence"),
            }
        )
    detail["matchedLabels"] = matched_labels[:10]
    return bool(matched_labels), detail


def _load_subject_structured_extractions(subject: ContentSubject) -> list[dict[str, Any]]:
    with _connect() as connection:
        row = connection.execute(
            """
            select result_json
            from content_analysis_results
            where subject_type = %s
              and subject_id = %s
              and analysis_type = 'structured_extraction'
              and status = 'completed'
            order by updated_at desc
            limit 1
            """,
            (subject.subject_type, subject.subject_id),
        ).fetchone()
    result_json = row.get("result_json") if row and isinstance(row.get("result_json"), Mapping) else {}
    extractions = result_json.get("extractions") if isinstance(result_json, Mapping) else []
    return [dict(item) for item in extractions if isinstance(item, Mapping)] if isinstance(extractions, list) else []


def _structured_field_matches(
    extraction: Mapping[str, Any],
    *,
    entity_type: str,
    field_key: str,
    expected: Any = None,
    expected_values: set[str] | None = None,
    min_confidence: float | None = None,
) -> tuple[bool, Any]:
    if entity_type and str(extraction.get("type") or "") != entity_type:
        return False, None
    confidence = extraction.get("confidence")
    if min_confidence is not None:
        try:
            if float(confidence) < min_confidence:
                return False, None
        except (TypeError, ValueError):
            return False, None
    fields = extraction.get("fields")
    if not isinstance(fields, Mapping) or field_key not in fields:
        return False, None
    raw_value = fields.get(field_key)
    values = _iter_structured_field_values(raw_value)
    if expected is None and expected_values is None:
        return bool(values), raw_value
    normalized_values = {_normalize_key(str(value)) for value in values}
    if expected is not None and _normalize_key(str(expected)) in normalized_values:
        return True, raw_value
    if expected_values and normalized_values.intersection(expected_values):
        return True, raw_value
    return False, raw_value


def _evaluate_structured_field_rule(
    subject: ContentSubject,
    value: Any,
    *,
    op: str,
) -> tuple[bool, dict[str, Any]]:
    detail: dict[str, Any] = {}
    if not isinstance(value, Mapping):
        detail["reason"] = "invalid_structured_rule_value"
        return False, detail
    entity_type = _normalize_key(str(value.get("entityType") or value.get("entity_type") or ""))
    field_key = _normalize_key(str(value.get("fieldKey") or value.get("field_key") or ""))
    min_confidence_raw = value.get("minConfidence", value.get("min_confidence"))
    min_confidence = float(min_confidence_raw) if min_confidence_raw is not None else None
    expected_values = None
    if op == "extracted_field_in":
        raw_values = value.get("values")
        if isinstance(raw_values, list):
            expected_values = {_normalize_key(str(item)) for item in raw_values if str(item).strip()}
    detail.update(
        {
            "entityType": entity_type or None,
            "fieldKey": field_key or None,
            "minConfidence": min_confidence,
        }
    )
    if not field_key:
        detail["reason"] = "missing_field_key"
        return False, detail
    matched: list[dict[str, Any]] = []
    for extraction in _load_subject_structured_extractions(subject):
        passed, raw_value = _structured_field_matches(
            extraction,
            entity_type=entity_type,
            field_key=field_key,
            expected=value.get("value") if op == "has_extracted_field" else None,
            expected_values=expected_values,
            min_confidence=min_confidence,
        )
        if passed:
            matched.append(
                {
                    "entityType": extraction.get("type"),
                    "fieldKey": field_key,
                    "value": raw_value,
                    "confidence": extraction.get("confidence"),
                }
            )
    detail["matchedExtractions"] = matched[:10]
    return bool(matched), detail


def _evaluate_structured_date_rule(subject: ContentSubject, value: Any) -> tuple[bool, dict[str, Any]]:
    detail: dict[str, Any] = {}
    if not isinstance(value, Mapping):
        detail["reason"] = "invalid_structured_date_rule_value"
        return False, detail
    threshold_value = value.get("threshold")
    threshold = _relative_threshold(threshold_value) if isinstance(threshold_value, Mapping) else _relative_threshold(value)
    passed, field_detail = _evaluate_structured_field_rule(subject, value, op="has_extracted_field")
    detail.update(field_detail)
    detail["threshold"] = threshold.isoformat()
    if not passed:
        return False, detail
    matched_dates: list[dict[str, Any]] = []
    for matched in field_detail.get("matchedExtractions", []):
        actual = _coerce_datetime(matched.get("value"))
        if actual is not None and actual >= threshold:
            matched_dates.append({**matched, "actual": actual.isoformat()})
    detail["matchedDates"] = matched_dates[:10]
    return bool(matched_dates), detail


def evaluate_content_filter_policy(subject: ContentSubject, policy: Mapping[str, Any]) -> dict[str, Any]:
    policy_json = policy.get("policy_json") if isinstance(policy.get("policy_json"), Mapping) else {}
    rules = policy_json.get("rules") if isinstance(policy_json, Mapping) else []
    matched: list[dict[str, Any]] = []
    failed: list[dict[str, Any]] = []
    for raw_rule in rules if isinstance(rules, list) else []:
        if not isinstance(raw_rule, Mapping):
            continue
        key = str(raw_rule.get("key") or raw_rule.get("field") or "rule")
        field = str(raw_rule.get("field") or "")
        op = str(raw_rule.get("op") or "")
        value = raw_rule.get("value")
        passed = False
        detail: dict[str, Any] = {"key": key, "field": field, "op": op}
        if op == "gte_relative" and field.endswith("_at") and isinstance(value, Mapping):
            actual, actual_field = _resolve_date(subject, field, policy_json)
            threshold = _relative_threshold(value)
            passed = actual is not None and actual >= threshold
            detail.update(
                {
                    "actual": actual.isoformat() if actual else None,
                    "actualField": actual_field,
                    "threshold": threshold.isoformat(),
                }
            )
        elif op == "exists":
            passed = bool(subject.text.strip()) if field in {"text", "body"} else False
        elif op == "has_label":
            passed, label_detail = _evaluate_label_rule(subject, value)
            detail.update(label_detail)
        elif op == "not_has_label":
            has_label, label_detail = _evaluate_label_rule(subject, value)
            passed = not has_label
            detail.update(label_detail)
        elif op in {"has_extracted_field", "extracted_field_in"}:
            passed, structured_detail = _evaluate_structured_field_rule(subject, value, op=op)
            detail.update(structured_detail)
        elif op == "extracted_date_gte_relative":
            passed, structured_detail = _evaluate_structured_date_rule(subject, value)
            detail.update(structured_detail)
        detail["passed"] = passed
        (matched if passed else failed).append(detail)
    combined = combine_filter_rule_results(policy=policy, matched_rules=matched, failed_rules=failed)
    return {
        "passed": combined["passed"],
        "decision": combined["decision"],
        "matchedRules": matched,
        "failedRules": failed,
        "explain": {
            "policyKey": policy.get("policy_key"),
            "policyVersion": policy.get("version"),
            "combiner": combined["combiner"],
            "mode": policy.get("mode"),
        },
    }


def persist_content_filter_result(
    subject_type: str,
    subject_id: str,
    *,
    policy_key: str = DEFAULT_CONTENT_FILTER_POLICY_KEY,
    mode_override: str | None = None,
) -> dict[str, Any]:
    subject = load_content_subject(subject_type, subject_id)
    if subject is None:
        raise ValueError(f"{subject_type} {subject_id} was not found.")
    policy = load_filter_policy(policy_key)
    if policy is None:
        return {"skipped": True, "reason": "missing_policy", "policyKey": policy_key}
    mode = mode_override or str(policy["mode"])
    if mode == "disabled":
        return {"skipped": True, "reason": "disabled_policy", "policyKey": policy_key}
    evaluation = evaluate_content_filter_policy(subject, policy)
    with _connect() as connection:
        with connection.transaction():
            result_row = connection.execute(
                """
                insert into content_filter_results (
                  subject_type,
                  subject_id,
                  canonical_document_id,
                  source_channel_id,
                  filter_policy_id,
                  policy_key,
                  policy_version,
                  mode,
                  decision,
                  passed,
                  score,
                  matched_rules_json,
                  failed_rules_json,
                  explain_json
                )
                values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                on conflict (subject_type, subject_id, policy_key, policy_version) do update
                set
                  canonical_document_id = excluded.canonical_document_id,
                  source_channel_id = excluded.source_channel_id,
                  filter_policy_id = excluded.filter_policy_id,
                  mode = excluded.mode,
                  decision = excluded.decision,
                  passed = excluded.passed,
                  score = excluded.score,
                  matched_rules_json = excluded.matched_rules_json,
                  failed_rules_json = excluded.failed_rules_json,
                  explain_json = excluded.explain_json,
                  updated_at = now()
                returning filter_result_id
                """,
                (
                    subject.subject_type,
                    subject.subject_id,
                    subject.canonical_document_id,
                    subject.source_channel_id,
                    policy["filter_policy_id"],
                    policy["policy_key"],
                    policy["version"],
                    mode,
                    evaluation["decision"],
                    evaluation["passed"],
                    1.0 if evaluation["passed"] else 0.0,
                    Json(evaluation["matchedRules"]),
                    Json(evaluation["failedRules"]),
                    Json(evaluation["explain"]),
                ),
            ).fetchone()
            _replace_analysis_result(
                connection,
                subject=subject,
                analysis_type="content_filter",
                provider=CONTENT_FILTER_PROVIDER,
                model_key=CONTENT_FILTER_MODEL_KEY,
                model_version=CONTENT_FILTER_MODEL_VERSION,
                result_json=evaluation,
                confidence=1.0,
                source_hash=_source_hash(json.dumps(policy, default=str)),
            )
    return {
        "filterResultId": str(result_row["filter_result_id"]),
        "policyKey": policy["policy_key"],
        "policyVersion": policy["version"],
        "mode": mode,
        "decision": evaluation["decision"],
        "passed": evaluation["passed"],
    }
