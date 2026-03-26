from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any


def _make_json_safe(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, list):
        return [_make_json_safe(item) for item in value]
    if isinstance(value, tuple):
        return [_make_json_safe(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _make_json_safe(item) for key, item in value.items()}
    return str(value)


def render_llm_prompt_template(
    template_text: str,
    *,
    article: Mapping[str, Any],
    review_context: Mapping[str, Any],
    scope: str,
) -> str:
    safe_context = _make_json_safe(dict(review_context))
    context_text = json.dumps(safe_context, ensure_ascii=True, sort_keys=True)
    criterion_name = (
        str(review_context.get("criterion_name") or "")
        if scope == "criterion"
        else ""
    )
    interest_name = (
        str(review_context.get("interest_name") or "")
        if scope != "criterion"
        else ""
    )
    replacements = {
        "{title}": str(article.get("title") or ""),
        "{{title}}": str(article.get("title") or ""),
        "{lead}": str(article.get("lead") or ""),
        "{{lead}}": str(article.get("lead") or ""),
        "{body}": str(article.get("body") or "")[:4000],
        "{{body}}": str(article.get("body") or "")[:4000],
        "{context}": context_text,
        "{{context}}": context_text,
        "{explain_json}": context_text,
        "{{explain_json}}": context_text,
        "{criterion_name}": criterion_name,
        "{{criterion_name}}": criterion_name,
        "{interest_name}": interest_name,
        "{{interest_name}}": interest_name,
    }
    rendered = template_text
    for placeholder, value in replacements.items():
        rendered = rendered.replace(placeholder, value)
    return rendered
