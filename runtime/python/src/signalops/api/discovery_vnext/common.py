from __future__ import annotations

from typing import Any
from uuid import UUID


def request_interest(request: dict[str, Any]) -> dict[str, Any]:
    value = request.get("systemInterest") or request.get("interest") or request
    if isinstance(value, dict):
        return value
    return {"name": "System interest", "description": str(value or "")}


def string_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value if str(item).strip()]
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    return []


def artifact_payload(artifact: Any) -> dict[str, Any]:
    if not isinstance(artifact, dict):
        return {}
    value = artifact.get("payload_json") or artifact.get("payload")
    return value if isinstance(value, dict) else {}


def uuid_or_none(value: Any) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        return str(UUID(text))
    except ValueError:
        return None
