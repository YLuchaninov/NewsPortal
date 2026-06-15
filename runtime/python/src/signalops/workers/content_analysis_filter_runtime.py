"""Content filter policy evaluation and persistence workflows."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any, Mapping

from psycopg.types.json import Json

from .content_analysis_repository import _replace_analysis_result
from .content_analysis_runtime import (
    CONTENT_FILTER_MODEL_KEY,
    CONTENT_FILTER_MODEL_VERSION,
    CONTENT_FILTER_PROVIDER,
    DEFAULT_CONTENT_FILTER_POLICY_KEY,
    ContentSubject,
    connect as _connect,
    normalize_key as _normalize_key,
    source_hash as _source_hash,
)
from .content_analysis_structured import iter_structured_field_values as _iter_structured_field_values
from .content_analysis_subjects import coerce_datetime as _coerce_datetime, load_content_subject
from .content_filter_policy import combine_filter_rule_results


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
