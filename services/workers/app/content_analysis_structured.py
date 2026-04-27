from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any, Mapping


def normalize_key(value: str) -> str:
    lowered = value.strip().casefold()
    return re.sub(r"[^0-9a-zа-яіїєґ]+", "_", lowered).strip("_")


def read_bool(value: Any, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().casefold()
        if lowered in {"true", "1", "yes", "on"}:
            return True
        if lowered in {"false", "0", "no", "off"}:
            return False
    return default


def coerce_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    text = str(value).strip()
    if not text:
        return None
    normalized = text.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def normalize_projection(raw_value: Any) -> set[str]:
    if not isinstance(raw_value, list):
        return set()
    return {str(item).strip() for item in raw_value if str(item).strip() in {"entity", "label"}}


def normalize_structured_template(config: Mapping[str, Any]) -> dict[str, Any]:
    raw_entity_types = config.get("entityTypes")
    if not isinstance(raw_entity_types, list) or not raw_entity_types:
        raise ValueError("structured_extraction config_json.entityTypes must be a non-empty array.")
    entity_types: list[dict[str, Any]] = []
    for raw_entity_type in raw_entity_types:
        if not isinstance(raw_entity_type, Mapping):
            continue
        entity_type = normalize_key(str(raw_entity_type.get("type") or ""))
        raw_fields = raw_entity_type.get("fields")
        if not entity_type or not isinstance(raw_fields, list):
            continue
        fields: list[dict[str, Any]] = []
        for raw_field in raw_fields:
            if not isinstance(raw_field, Mapping):
                continue
            key = normalize_key(str(raw_field.get("key") or ""))
            field_type = str(raw_field.get("type") or "string").strip()
            if not key or field_type not in {"string", "string[]", "boolean", "date", "enum", "number"}:
                continue
            enum_values = (
                [str(item).strip() for item in raw_field.get("values", []) if str(item).strip()]
                if isinstance(raw_field.get("values"), list)
                else []
            )
            fields.append(
                {
                    "key": key,
                    "type": field_type,
                    "values": enum_values,
                    "project": sorted(normalize_projection(raw_field.get("project"))),
                }
            )
        if fields:
            entity_types.append({"type": entity_type, "fields": fields})
    if not entity_types:
        raise ValueError("structured_extraction config_json.entityTypes must define at least one entity type with fields.")
    return {
        "templateKey": str(config.get("templateKey") or "structured_extraction_template").strip(),
        "instructions": str(config.get("instructions") or "Extract only facts explicitly supported by the source text.").strip(),
        "allowHighCardinalityLabels": read_bool(config.get("allowHighCardinalityLabels"), False),
        "entityTypes": entity_types,
    }


def build_structured_extraction_prompt(
    *,
    subject: Any,
    template: Mapping[str, Any],
    hints: Mapping[str, Any],
    max_text_chars: int,
) -> str:
    schema = {
        "extractions": [
            {
                "type": "<one configured entity type>",
                "confidence": 0.0,
                "fields": {"<configured_field_key>": "<value or null>"},
                "evidence": ["short source-supported evidence snippets"],
            }
        ]
    }
    payload = {
        "task": "structured_content_extraction",
        "instructions": template["instructions"],
        "template": {
            "templateKey": template["templateKey"],
            "entityTypes": template["entityTypes"],
        },
        "outputContract": schema,
        "rules": [
            "Return strict JSON only.",
            "Use only configured entity types and fields.",
            "Use null or omit a field when the source text does not explicitly support it.",
            "Do not infer facts from general knowledge.",
            "Keep evidence snippets short and copied from the source text.",
        ],
        "localHints": hints,
        "subject": {
            "subjectType": subject.subject_type,
            "subjectId": subject.subject_id,
            "title": subject.title,
            "lead": subject.lead,
            "text": subject.text[:max_text_chars],
        },
    }
    return json.dumps(payload, ensure_ascii=True, default=str)


def coerce_structured_value(value: Any, field: Mapping[str, Any]) -> Any:
    if value is None:
        return None
    field_type = str(field.get("type") or "string")
    if field_type == "string":
        text = str(value).strip()
        return text or None
    if field_type == "string[]":
        values = value if isinstance(value, list) else [value]
        normalized = [str(item).strip() for item in values if str(item).strip()]
        return normalized or None
    if field_type == "boolean":
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            lowered = value.strip().casefold()
            if lowered in {"true", "yes", "1"}:
                return True
            if lowered in {"false", "no", "0"}:
                return False
        return None
    if field_type == "date":
        if coerce_datetime(value) is None:
            return None
        return str(value).strip()
    if field_type == "number":
        try:
            return float(value)
        except (TypeError, ValueError):
            return None
    if field_type == "enum":
        text = str(value).strip()
        allowed = {str(item) for item in field.get("values", [])}
        return text if text in allowed else None
    return None


def validate_structured_extraction_output(
    parsed: Any,
    template: Mapping[str, Any],
) -> tuple[list[dict[str, Any]], list[str]]:
    if not isinstance(parsed, Mapping):
        return [], ["llm_response_not_object"]
    raw_extractions = parsed.get("extractions")
    if not isinstance(raw_extractions, list):
        return [], ["missing_extractions_array"]
    entity_fields = {
        str(entity_type["type"]): {
            str(field["key"]): field
            for field in entity_type.get("fields", [])
            if isinstance(field, Mapping)
        }
        for entity_type in template.get("entityTypes", [])
        if isinstance(entity_type, Mapping)
    }
    errors: list[str] = []
    extractions: list[dict[str, Any]] = []
    for raw_item in raw_extractions:
        if not isinstance(raw_item, Mapping):
            errors.append("extraction_not_object")
            continue
        entity_type = normalize_key(str(raw_item.get("type") or ""))
        fields_for_type = entity_fields.get(entity_type)
        if not fields_for_type:
            errors.append(f"unsupported_entity_type:{entity_type or 'missing'}")
            continue
        raw_fields = raw_item.get("fields")
        if not isinstance(raw_fields, Mapping):
            errors.append(f"missing_fields:{entity_type}")
            continue
        fields: dict[str, Any] = {}
        for raw_key, raw_value in raw_fields.items():
            field_key = normalize_key(str(raw_key))
            field = fields_for_type.get(field_key)
            if field is None:
                errors.append(f"unsupported_field:{entity_type}.{field_key}")
                continue
            value = coerce_structured_value(raw_value, field)
            if value is not None:
                fields[field_key] = value
        if not fields:
            continue
        confidence = raw_item.get("confidence")
        try:
            confidence_value = max(0.0, min(1.0, float(confidence)))
        except (TypeError, ValueError):
            confidence_value = 0.5
        evidence = (
            [str(item).strip()[:240] for item in raw_item.get("evidence", []) if str(item).strip()]
            if isinstance(raw_item.get("evidence"), list)
            else []
        )
        extractions.append(
            {
                "type": entity_type,
                "confidence": round(confidence_value, 4),
                "fields": fields,
                "evidence": evidence[:10],
            }
        )
    return extractions, errors


def structured_field_specs(template: Mapping[str, Any]) -> dict[tuple[str, str], dict[str, Any]]:
    specs: dict[tuple[str, str], dict[str, Any]] = {}
    for entity_type in template.get("entityTypes", []):
        if not isinstance(entity_type, Mapping):
            continue
        type_key = str(entity_type.get("type") or "")
        for field in entity_type.get("fields", []):
            if isinstance(field, Mapping):
                specs[(type_key, str(field.get("key") or ""))] = dict(field)
    return specs


def iter_structured_field_values(value: Any) -> list[Any]:
    if isinstance(value, list):
        return [item for item in value if item is not None and str(item).strip()]
    if value is None or not str(value).strip():
        return []
    return [value]


def structured_entity_type(entity_type: str, field_key: str | None = None) -> str:
    if field_key == "company":
        return "ORG"
    if field_key == "location":
        return "GPE"
    if field_key in {"posted_at", "deadline", "date"}:
        return "DATE"
    return normalize_key(entity_type).upper()


def structured_label_key(entity_type: str, field_key: str, value: Any) -> str:
    return f"{normalize_key(entity_type)}.{normalize_key(field_key)}:{normalize_key(str(value))}"


def structured_label_projection_allowed(
    field_spec: Mapping[str, Any],
    value: Any,
    *,
    allow_high_cardinality_labels: bool,
) -> bool:
    if allow_high_cardinality_labels:
        return True
    field_type = str(field_spec.get("type") or "string")
    if field_type in {"boolean", "enum"}:
        return True
    if field_type == "string[]":
        values = value if isinstance(value, list) else [value]
        return all(len(str(item).strip()) <= 48 and len(str(item).split()) <= 4 for item in values)
    return False
