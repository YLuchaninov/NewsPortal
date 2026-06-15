from __future__ import annotations

import re
from importlib import import_module
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Final, Mapping

from .plugins import TaskPlugin

LegacyHandler = Callable[[Any, str], Awaitable[dict[str, Any]]]
ProcessorHandlerSpec = tuple[str, str]
DIRECT_PROCESSOR_HANDLERS: dict[str, ProcessorHandlerSpec] = {
    "process_signal_candidate_extract": (
        "signalops.workers.signal_candidate_extraction_processor",
        "process_signal_candidate_extract",
    ),
    "process_normalize": (
        "signalops.workers.signal_candidate_processors",
        "process_normalize",
    ),
    "process_dedup": (
        "signalops.workers.signal_candidate_processors",
        "process_dedup",
    ),
    "process_embed": (
        "signalops.workers.signal_candidate_processors",
        "process_embed",
    ),
    "process_feedback_ingest": (
        "signalops.workers.feedback_ingest_processor",
        "process_feedback_ingest",
    ),
    "process_cluster": (
        "signalops.workers.cluster_processor",
        "process_cluster",
    ),
    "process_interest_compile": (
        "signalops.workers.compile_processors",
        "process_interest_compile",
    ),
    "process_criterion_compile": (
        "signalops.workers.compile_processors",
        "process_criterion_compile",
    ),
    "process_match_criteria": (
        "signalops.workers.criteria_match_processor",
        "process_match_criteria",
    ),
    "process_match_interests": (
        "signalops.workers.interest_match_processor",
        "process_match_interests",
    ),
    "process_llm_review": (
        "signalops.workers.llm_review_processor",
        "process_llm_review",
    ),
    "process_notify": (
        "signalops.workers.notification_processor",
        "process_notify",
    ),
    "process_reindex": (
        "signalops.workers.reindex_processor",
        "process_reindex",
    ),
}

_CAMEL_CASE_BOUNDARY = re.compile(r"(?<!^)(?=[A-Z])")
_MISSING: Final = object()
_BOOLEAN_TRUE_VALUES = {"1", "true", "yes", "on"}
_BOOLEAN_FALSE_VALUES = {"0", "false", "no", "off"}


@dataclass(frozen=True)
class LegacyJobShim:
    data: dict[str, Any]


def load_legacy_handler(handler_name: str) -> LegacyHandler:
    handler_spec = DIRECT_PROCESSOR_HANDLERS.get(handler_name)
    if handler_spec is not None:
        module_name, attribute_name = handler_spec
        return getattr(import_module(module_name), attribute_name)

    raise LookupError(
        f"Legacy worker handler {handler_name} was not found in the direct processor registry."
    )


def _camel_to_snake(value: str) -> str:
    return _CAMEL_CASE_BOUNDARY.sub("_", value).lower()


class LegacyHandlerTaskPlugin(TaskPlugin):
    category = "pipeline"
    handler_name: str
    input_descriptions: dict[str, str] = {
        "doc_id": "SignalCandidate identifier passed via task options or sequence context.",
        "event_id": "Existing outbox event UUID forwarded into the legacy handler shim.",
    }
    output_descriptions: dict[str, str] = {
        "doc_id": "SignalCandidate identifier retained in sequence context.",
        "event_id": "Legacy event identifier retained in sequence context.",
        "legacy_handler": "Legacy process_* handler invoked by this adapter.",
        "status": "Normalized handler status copied from the legacy result.",
    }

    async def execute(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        job_data = self.build_job_data(options, context)
        handler = load_legacy_handler(self.handler_name)
        result = await handler(LegacyJobShim(job_data), "")
        if not isinstance(result, dict):
            raise TypeError(
                f"Legacy worker handler {self.handler_name} must return a dict result."
            )
        return self.build_context_update(job_data, result)

    def describe_inputs(self) -> dict[str, str]:
        return dict(self.input_descriptions)

    def describe_outputs(self) -> dict[str, str]:
        return dict(self.output_descriptions)

    def validate_options(self, options: dict[str, Any]) -> list[str]:
        errors: list[str] = []
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="doc_id",
            aliases=("docId",),
        )
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="event_id",
            aliases=("eventId",),
        )
        return errors

    def build_job_data(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        raise NotImplementedError

    def _sequence_runtime_flags(self) -> dict[str, Any]:
        return {
            "sequenceRuntime": True,
            "suppressDownstreamOutbox": True,
        }

    def build_context_update(
        self,
        job_data: Mapping[str, Any],
        result: Mapping[str, Any],
    ) -> dict[str, Any]:
        normalized_result = {
            _camel_to_snake(key): value for key, value in result.items()
        }
        if "docId" in job_data and job_data["docId"] is not None:
            normalized_result["doc_id"] = str(job_data["docId"])
        normalized_result["event_id"] = str(job_data["eventId"])
        normalized_result["legacy_handler"] = self.handler_name

        if "version" in job_data:
            normalized_result["version"] = int(job_data["version"])
        if "historicalBackfill" in job_data:
            normalized_result["historical_backfill"] = bool(job_data["historicalBackfill"])
        if "scope" in job_data:
            normalized_result["scope"] = str(job_data["scope"])
        if "targetId" in job_data:
            normalized_result["target_id"] = str(job_data["targetId"])
        if "promptTemplateId" in job_data and job_data["promptTemplateId"] is not None:
            normalized_result["prompt_template_id"] = str(job_data["promptTemplateId"])
        if "userId" in job_data and job_data["userId"] is not None:
            normalized_result["user_id"] = str(job_data["userId"])
        if "interestId" in job_data and job_data["interestId"] is not None:
            normalized_result["interest_id"] = str(job_data["interestId"])
        if "criterionId" in job_data and job_data["criterionId"] is not None:
            normalized_result["criterion_id"] = str(job_data["criterionId"])
        if "notificationId" in job_data and job_data["notificationId"] is not None:
            normalized_result["notification_id"] = str(job_data["notificationId"])
        if "reindexJobId" in job_data and job_data["reindexJobId"] is not None:
            normalized_result["reindex_job_id"] = str(job_data["reindexJobId"])
        if "indexName" in job_data and job_data["indexName"] is not None:
            normalized_result["index_name"] = str(job_data["indexName"])

        return normalized_result

    def _resolve_required_string(
        self,
        *,
        options: Mapping[str, Any],
        context: Mapping[str, Any],
        key: str,
        aliases: tuple[str, ...] = (),
    ) -> str:
        value = self._lookup_value(options, context, key, *aliases)
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
        value = self._lookup_value(options, context, key, *aliases)
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
        value = self._lookup_value(options, context, key, *aliases)
        if value is _MISSING or value is None:
            return default
        try:
            normalized = int(value)
        except (TypeError, ValueError) as error:
            raise ValueError(f"{self.name} expected {key} to be a positive integer.") from error
        if normalized < 1:
            raise ValueError(f"{self.name} expected {key} to be a positive integer.")
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
        value = self._lookup_value(options, context, key, *aliases)
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

    def _lookup_value(
        self,
        options: Mapping[str, Any],
        context: Mapping[str, Any],
        *keys: str,
    ) -> Any:
        for source in (options, context):
            for key in keys:
                if key in source:
                    return source[key]
        return _MISSING

    def _validate_optional_non_empty_string(
        self,
        options: Mapping[str, Any],
        errors: list[str],
        *,
        option_key: str,
        aliases: tuple[str, ...] = (),
    ) -> None:
        value = self._lookup_from_mapping(options, option_key, *aliases)
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
        value = self._lookup_from_mapping(options, option_key, *aliases)
        if value is _MISSING or value is None:
            return
        try:
            normalized = int(value)
        except (TypeError, ValueError):
            errors.append(f"{option_key} must be a positive integer when provided.")
            return
        if normalized < 1:
            errors.append(f"{option_key} must be a positive integer when provided.")

    def _validate_optional_boolean_like(
        self,
        options: Mapping[str, Any],
        errors: list[str],
        *,
        option_key: str,
        aliases: tuple[str, ...] = (),
    ) -> None:
        value = self._lookup_from_mapping(options, option_key, *aliases)
        if value is _MISSING or value is None:
            return
        if isinstance(value, bool):
            return
        if isinstance(value, int) and value in {0, 1}:
            return
        if isinstance(value, str) and value.strip().casefold() in (
            _BOOLEAN_TRUE_VALUES | _BOOLEAN_FALSE_VALUES
        ):
            return
        errors.append(f"{option_key} must be boolean-like when provided.")

    def _lookup_from_mapping(self, mapping: Mapping[str, Any], *keys: str) -> Any:
        for key in keys:
            if key in mapping:
                return mapping[key]
        return _MISSING
