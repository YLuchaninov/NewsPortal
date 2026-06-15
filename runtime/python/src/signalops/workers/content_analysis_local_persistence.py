"""Local heuristic content-analysis persistence workflows."""

from __future__ import annotations

from typing import Any

from psycopg.types.json import Json

from .content_analysis_heuristics import analyze_categories, analyze_sentiment, extract_heuristic_entities
from .content_analysis_repository import _replace_analysis_result
from .content_analysis_runtime import (
    ContentSubject,
    analysis_source_hash as _analysis_source_hash,
    connect as _connect,
    default_model_for_module as _default_model_for_module,
    policy_result_json as _policy_result_json,
    resolve_max_text_chars as _resolve_max_text_chars,
    resolve_policy_for_module as _resolve_policy_for_module,
)


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
