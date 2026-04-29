from __future__ import annotations

import re
from typing import Any, Final, Iterable, Mapping
from urllib.parse import urlparse

from .context import RESERVED_CONTEXT_KEYS
from .plugins import TaskPlugin

_MISSING: Final = object()
_BOOLEAN_TRUE_VALUES = {"1", "true", "yes", "on"}
_BOOLEAN_FALSE_VALUES = {"0", "false", "no", "off"}
_TOKEN_RE = re.compile(r"[a-z0-9]+")


def _lookup_from_mapping(source: Mapping[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in source:
            return source[key]
    return _MISSING


def _lookup_value(
    options: Mapping[str, Any],
    context: Mapping[str, Any],
    *keys: str,
) -> Any:
    for source in (options, context):
        value = _lookup_from_mapping(source, *keys)
        if value is not _MISSING:
            return value
    return _MISSING


def _iter_text_fragments(value: Any) -> Iterable[str]:
    if value is None:
        return
    if isinstance(value, str):
        text = value.strip()
        if text:
            yield text
        return
    if isinstance(value, Mapping):
        for key in (
            "title",
            "snippet",
            "description",
            "summary",
            "feed_title",
            "content",
            "body",
            "query",
            "topic",
            "source_name",
        ):
            if key in value:
                yield from _iter_text_fragments(value[key])
        for key in ("sample_entries", "articles", "matched_terms", "topics", "tags"):
            if key in value:
                yield from _iter_text_fragments(value[key])
        return
    if isinstance(value, list):
        for item in value:
            yield from _iter_text_fragments(item)


def _tokenize(value: Any) -> list[str]:
    text = " ".join(_iter_text_fragments(value)).lower()
    return _TOKEN_RE.findall(text)


def _unique_preserving_order(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    unique_values: list[str] = []
    for value in values:
        normalized = value.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        unique_values.append(normalized)
    return unique_values


def _extract_url_candidates(value: Any) -> list[str]:
    urls: list[str] = []
    if isinstance(value, str):
        return [value]
    if isinstance(value, Mapping):
        for key in ("url", "source_url", "feed_url", "final_url", "link"):
            candidate = value.get(key)
            if isinstance(candidate, str) and candidate.strip():
                urls.append(candidate.strip())
        return urls
    if isinstance(value, list):
        for item in value:
            urls.extend(_extract_url_candidates(item))
    return urls


def _is_http_url(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def _looks_like_rss_candidate(url: str, content_type: str | None = None) -> bool:
    lowered_url = url.casefold()
    lowered_type = content_type.casefold() if isinstance(content_type, str) else ""
    if any(
        hint in lowered_type
        for hint in ("application/rss+xml", "application/atom+xml", "xml", "rss", "atom")
    ):
        return True
    return any(hint in lowered_url for hint in ("/feed", "/rss", ".rss", ".xml", "atom"))


def _coerce_mapping_list(value: Any, *, field_name: str) -> list[dict[str, Any]]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise TypeError(f"{field_name} must be a list of objects.")

    items: list[dict[str, Any]] = []
    for index, item in enumerate(value):
        if not isinstance(item, Mapping):
            raise TypeError(f"{field_name}[{index}] must be an object.")
        items.append(dict(item))
    return items


def _non_reserved_context(context: Mapping[str, Any]) -> dict[str, Any]:
    return {
        key: value
        for key, value in context.items()
        if key not in RESERVED_CONTEXT_KEYS and not key.startswith("_")
    }


class ContextTaskPlugin(TaskPlugin):
    def _resolve_required_string(
        self,
        *,
        options: Mapping[str, Any],
        context: Mapping[str, Any],
        key: str,
        aliases: tuple[str, ...] = (),
    ) -> str:
        value = _lookup_value(options, context, key, *aliases)
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"{self.name} expected {key}.")
        return value.strip()

    def _resolve_optional_string(
        self,
        *,
        options: Mapping[str, Any],
        context: Mapping[str, Any],
        key: str,
        aliases: tuple[str, ...] = (),
    ) -> str | None:
        value = _lookup_value(options, context, key, *aliases)
        if value is _MISSING or value is None:
            return None
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"{self.name} expected {key} to be a non-empty string when provided.")
        return value.strip()

    def _resolve_positive_int(
        self,
        *,
        options: Mapping[str, Any],
        context: Mapping[str, Any],
        key: str,
        aliases: tuple[str, ...] = (),
        default: int,
    ) -> int:
        value = _lookup_value(options, context, key, *aliases)
        if value is _MISSING or value is None:
            return default
        try:
            normalized = int(value)
        except (TypeError, ValueError) as error:
            raise ValueError(f"{self.name} expected {key} to be a positive integer.") from error
        if normalized < 1:
            raise ValueError(f"{self.name} expected {key} to be a positive integer.")
        return normalized

    def _resolve_probability(
        self,
        *,
        options: Mapping[str, Any],
        context: Mapping[str, Any],
        key: str,
        aliases: tuple[str, ...] = (),
        default: float,
    ) -> float:
        value = _lookup_value(options, context, key, *aliases)
        if value is _MISSING or value is None:
            return default
        try:
            normalized = float(value)
        except (TypeError, ValueError) as error:
            raise ValueError(f"{self.name} expected {key} to be a float between 0 and 1.") from error
        if normalized < 0 or normalized > 1:
            raise ValueError(f"{self.name} expected {key} to be a float between 0 and 1.")
        return normalized

    def _resolve_bool(
        self,
        *,
        options: Mapping[str, Any],
        context: Mapping[str, Any],
        key: str,
        aliases: tuple[str, ...] = (),
        default: bool = False,
    ) -> bool:
        value = _lookup_value(options, context, key, *aliases)
        if value is _MISSING or value is None:
            return default
        if isinstance(value, bool):
            return value
        if isinstance(value, int) and value in {0, 1}:
            return bool(value)
        if isinstance(value, str):
            lowered = value.strip().casefold()
            if lowered in _BOOLEAN_TRUE_VALUES:
                return True
            if lowered in _BOOLEAN_FALSE_VALUES:
                return False
        raise ValueError(f"{self.name} expected {key} to be boolean-like.")

    def _resolve_json_object(
        self,
        *,
        options: Mapping[str, Any],
        context: Mapping[str, Any],
        key: str,
        aliases: tuple[str, ...] = (),
        default: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        value = _lookup_value(options, context, key, *aliases)
        if value is _MISSING or value is None:
            return dict(default or {})
        if not isinstance(value, Mapping):
            raise ValueError(f"{self.name} expected {key} to be an object.")
        return dict(value)

    def _resolve_string_list(
        self,
        *,
        options: Mapping[str, Any],
        context: Mapping[str, Any],
        key: str,
        aliases: tuple[str, ...] = (),
        default: list[str] | None = None,
    ) -> list[str]:
        value = _lookup_value(options, context, key, *aliases)
        if value is _MISSING or value is None:
            return list(default or [])
        if isinstance(value, str):
            return [value.strip()] if value.strip() else []
        if not isinstance(value, list):
            raise ValueError(f"{self.name} expected {key} to be a list of strings.")

        items: list[str] = []
        for item in value:
            if not isinstance(item, str) or not item.strip():
                raise ValueError(f"{self.name} expected {key} to contain only non-empty strings.")
            items.append(item.strip())
        return items

    def _validate_optional_non_empty_string(
        self,
        options: Mapping[str, Any],
        errors: list[str],
        *,
        option_key: str,
        aliases: tuple[str, ...] = (),
    ) -> None:
        value = _lookup_from_mapping(options, option_key, *aliases)
        if value is _MISSING or value is None:
            return
        if not isinstance(value, str) or not value.strip():
            errors.append(f"{option_key} must be a non-empty string when provided.")

    def _validate_optional_positive_int(
        self,
        options: Mapping[str, Any],
        errors: list[str],
        *,
        option_key: str,
        aliases: tuple[str, ...] = (),
    ) -> None:
        value = _lookup_from_mapping(options, option_key, *aliases)
        if value is _MISSING or value is None:
            return
        try:
            normalized = int(value)
        except (TypeError, ValueError):
            errors.append(f"{option_key} must be a positive integer when provided.")
            return
        if normalized < 1:
            errors.append(f"{option_key} must be a positive integer when provided.")

    def _validate_optional_probability(
        self,
        options: Mapping[str, Any],
        errors: list[str],
        *,
        option_key: str,
        aliases: tuple[str, ...] = (),
    ) -> None:
        value = _lookup_from_mapping(options, option_key, *aliases)
        if value is _MISSING or value is None:
            return
        try:
            normalized = float(value)
        except (TypeError, ValueError):
            errors.append(f"{option_key} must be a float between 0 and 1 when provided.")
            return
        if normalized < 0 or normalized > 1:
            errors.append(f"{option_key} must be a float between 0 and 1 when provided.")

    def _validate_optional_boolean_like(
        self,
        options: Mapping[str, Any],
        errors: list[str],
        *,
        option_key: str,
        aliases: tuple[str, ...] = (),
    ) -> None:
        value = _lookup_from_mapping(options, option_key, *aliases)
        if value is _MISSING or value is None:
            return
        try:
            self._resolve_bool(options=options, context={}, key=option_key, aliases=aliases)
        except ValueError:
            errors.append(f"{option_key} must be boolean-like when provided.")

    def _validate_optional_string_list(
        self,
        options: Mapping[str, Any],
        errors: list[str],
        *,
        option_key: str,
        aliases: tuple[str, ...] = (),
    ) -> None:
        value = _lookup_from_mapping(options, option_key, *aliases)
        if value is _MISSING or value is None:
            return
        if isinstance(value, str):
            if not value.strip():
                errors.append(f"{option_key} must not be blank when provided as a string.")
            return
        if not isinstance(value, list):
            errors.append(f"{option_key} must be a list of strings when provided.")
            return
        for item in value:
            if not isinstance(item, str) or not item.strip():
                errors.append(f"{option_key} must contain only non-empty strings.")
                return

    def _validate_regex_list(
        self,
        options: Mapping[str, Any],
        errors: list[str],
        *,
        option_key: str,
    ) -> None:
        value = _lookup_from_mapping(options, option_key)
        if value is _MISSING or value is None:
            return
        if not isinstance(value, list):
            errors.append(f"{option_key} must be a list of regex strings when provided.")
            return
        for item in value:
            if not isinstance(item, str) or not item.strip():
                errors.append(f"{option_key} must contain only non-empty regex strings.")
                return
            try:
                re.compile(item)
            except re.error:
                errors.append(f"{option_key} contains invalid regex {item!r}.")
                return
