from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Awaitable, Callable, Final, Mapping

from .plugins import TASK_REGISTRY, TaskPlugin, TaskPluginRegistry

LegacyHandler = Callable[[Any, str], Awaitable[dict[str, Any]]]

_CAMEL_CASE_BOUNDARY = re.compile(r"(?<!^)(?=[A-Z])")
_MISSING: Final = object()
_BOOLEAN_TRUE_VALUES = {"1", "true", "yes", "on"}
_BOOLEAN_FALSE_VALUES = {"0", "false", "no", "off"}


@dataclass(frozen=True)
class LegacyJobShim:
    data: dict[str, Any]


@lru_cache(maxsize=1)
def _load_legacy_main_module() -> Any:
    from .. import main as legacy_main

    return legacy_main


def load_legacy_handler(handler_name: str) -> LegacyHandler:
    handler = getattr(_load_legacy_main_module(), handler_name, None)
    if handler is None or not callable(handler):
        raise LookupError(f"Legacy worker handler {handler_name} was not found.")
    return handler


def _camel_to_snake(value: str) -> str:
    return _CAMEL_CASE_BOUNDARY.sub("_", value).lower()


class LegacyHandlerTaskPlugin(TaskPlugin):
    category = "pipeline"
    handler_name: str
    input_descriptions: dict[str, str] = {
        "doc_id": "Article identifier passed via task options or sequence context.",
        "event_id": "Existing outbox event UUID forwarded into the legacy handler shim.",
    }
    output_descriptions: dict[str, str] = {
        "doc_id": "Article identifier retained in sequence context.",
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


class NormalizeArticlePlugin(LegacyHandlerTaskPlugin):
    name = "article.normalize"
    description = "Wrap the legacy normalize handler behind a task-engine plugin."
    handler_name = "process_normalize"

    def build_job_data(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        return {
            **self._sequence_runtime_flags(),
            "eventId": self._resolve_required_string(
                options=options,
                context=context,
                key="event_id",
                aliases=("eventId",),
            ),
            "docId": self._resolve_required_string(
                options=options,
                context=context,
                key="doc_id",
                aliases=("docId",),
            ),
        }


class DedupArticlePlugin(LegacyHandlerTaskPlugin):
    name = "article.dedup"
    description = "Wrap the legacy dedup handler behind a task-engine plugin."
    handler_name = "process_dedup"

    def build_job_data(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        return {
            **self._sequence_runtime_flags(),
            "eventId": self._resolve_required_string(
                options=options,
                context=context,
                key="event_id",
                aliases=("eventId",),
            ),
            "docId": self._resolve_required_string(
                options=options,
                context=context,
                key="doc_id",
                aliases=("docId",),
            ),
        }


class EmbedArticlePlugin(LegacyHandlerTaskPlugin):
    name = "article.embed"
    description = "Wrap the legacy embed handler behind a task-engine plugin."
    handler_name = "process_embed"
    input_descriptions = {
        **LegacyHandlerTaskPlugin.input_descriptions,
        "version": "Optional embedding vector version; defaults to 1.",
    }

    def validate_options(self, options: dict[str, Any]) -> list[str]:
        errors = super().validate_options(options)
        self._validate_optional_positive_int(
            options,
            errors,
            option_key="version",
        )
        return errors

    def build_job_data(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        return {
            **self._sequence_runtime_flags(),
            "eventId": self._resolve_required_string(
                options=options,
                context=context,
                key="event_id",
                aliases=("eventId",),
            ),
            "docId": self._resolve_required_string(
                options=options,
                context=context,
                key="doc_id",
                aliases=("docId",),
            ),
            "version": self._resolve_positive_int(
                options=options,
                context=context,
                key="version",
                default=1,
            ),
        }


class MatchCriteriaPlugin(LegacyHandlerTaskPlugin):
    name = "article.match_criteria"
    description = "Wrap the legacy system-criteria matching handler behind a task plugin."
    handler_name = "process_match_criteria"
    input_descriptions = {
        **LegacyHandlerTaskPlugin.input_descriptions,
        "historical_backfill": "Optional flag to suppress fresh-ingest fanout while replaying history.",
    }

    def validate_options(self, options: dict[str, Any]) -> list[str]:
        errors = super().validate_options(options)
        self._validate_optional_boolean_like(
            options,
            errors,
            option_key="historical_backfill",
            aliases=("historicalBackfill",),
        )
        return errors

    def build_job_data(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        return {
            **self._sequence_runtime_flags(),
            "eventId": self._resolve_required_string(
                options=options,
                context=context,
                key="event_id",
                aliases=("eventId",),
            ),
            "docId": self._resolve_required_string(
                options=options,
                context=context,
                key="doc_id",
                aliases=("docId",),
            ),
            "historicalBackfill": self._resolve_bool(
                options=options,
                context=context,
                key="historical_backfill",
                aliases=("historicalBackfill",),
                default=False,
            ),
        }


class ClusterArticlePlugin(LegacyHandlerTaskPlugin):
    name = "article.cluster"
    description = "Wrap the legacy event-clustering handler behind a task-engine plugin."
    handler_name = "process_cluster"
    input_descriptions = {
        **LegacyHandlerTaskPlugin.input_descriptions,
        "version": "Optional event vector version; defaults to 1.",
    }

    def validate_options(self, options: dict[str, Any]) -> list[str]:
        errors = super().validate_options(options)
        self._validate_optional_positive_int(
            options,
            errors,
            option_key="version",
        )
        return errors

    def build_job_data(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        return {
            **self._sequence_runtime_flags(),
            "eventId": self._resolve_required_string(
                options=options,
                context=context,
                key="event_id",
                aliases=("eventId",),
            ),
            "docId": self._resolve_required_string(
                options=options,
                context=context,
                key="doc_id",
                aliases=("docId",),
            ),
            "version": self._resolve_positive_int(
                options=options,
                context=context,
                key="version",
                default=1,
            ),
        }


class MatchInterestsPlugin(LegacyHandlerTaskPlugin):
    name = "article.match_interests"
    description = "Wrap the legacy user-interest matching handler behind a task plugin."
    handler_name = "process_match_interests"
    input_descriptions = {
        **LegacyHandlerTaskPlugin.input_descriptions,
        "historical_backfill": "Optional flag to suppress notify fanout while replaying history.",
        "user_id": "Optional scope to one user during reindex or manual replay.",
        "interest_id": "Optional scope to one interest during reindex or manual replay.",
    }

    def validate_options(self, options: dict[str, Any]) -> list[str]:
        errors = super().validate_options(options)
        self._validate_optional_boolean_like(
            options,
            errors,
            option_key="historical_backfill",
            aliases=("historicalBackfill",),
        )
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="user_id",
            aliases=("userId",),
        )
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="interest_id",
            aliases=("interestId",),
        )
        return errors

    def build_job_data(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        job_data: dict[str, Any] = {
            **self._sequence_runtime_flags(),
            "eventId": self._resolve_required_string(
                options=options,
                context=context,
                key="event_id",
                aliases=("eventId",),
            ),
            "docId": self._resolve_required_string(
                options=options,
                context=context,
                key="doc_id",
                aliases=("docId",),
            ),
            "historicalBackfill": self._resolve_bool(
                options=options,
                context=context,
                key="historical_backfill",
                aliases=("historicalBackfill",),
                default=False,
            ),
        }
        user_id = self._resolve_optional_string(
            options=options,
            context=context,
            key="user_id",
            aliases=("userId",),
        )
        interest_id = self._resolve_optional_string(
            options=options,
            context=context,
            key="interest_id",
            aliases=("interestId",),
        )
        if user_id is not None:
            job_data["userId"] = user_id
        if interest_id is not None:
            job_data["interestId"] = interest_id
        return job_data


class NotifyUsersPlugin(LegacyHandlerTaskPlugin):
    name = "article.notify"
    description = "Wrap the legacy notification dispatch handler behind a task-engine plugin."
    handler_name = "process_notify"

    def build_job_data(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        return {
            **self._sequence_runtime_flags(),
            "eventId": self._resolve_required_string(
                options=options,
                context=context,
                key="event_id",
                aliases=("eventId",),
            ),
            "docId": self._resolve_required_string(
                options=options,
                context=context,
                key="doc_id",
                aliases=("docId",),
            ),
        }


class LlmReviewPlugin(LegacyHandlerTaskPlugin):
    name = "article.llm_review"
    description = "Wrap the legacy LLM review handler behind a task-engine plugin."
    handler_name = "process_llm_review"
    input_descriptions = {
        **LegacyHandlerTaskPlugin.input_descriptions,
        "scope": "Required review scope: criterion or interest.",
        "target_id": "Required criterion_id or interest_id for the review.",
        "prompt_template_id": "Optional explicit prompt template identifier override.",
        "historical_backfill": "Optional flag to suppress downstream fanout during replay.",
    }
    output_descriptions = {
        **LegacyHandlerTaskPlugin.output_descriptions,
        "scope": "Resolved review scope.",
        "target_id": "Resolved review target identifier.",
        "decision": "Provider decision returned by the legacy LLM review handler.",
        "llm_review_id": "Persisted review-log row identifier.",
    }

    def validate_options(self, options: dict[str, Any]) -> list[str]:
        errors = super().validate_options(options)
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="target_id",
            aliases=("targetId",),
        )
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="prompt_template_id",
            aliases=("promptTemplateId",),
        )
        self._validate_optional_boolean_like(
            options,
            errors,
            option_key="historical_backfill",
            aliases=("historicalBackfill",),
        )

        scope = self._lookup_from_mapping(options, "scope")
        if scope is not _MISSING and scope not in {"criterion", "interest"}:
            errors.append("scope must be either 'criterion' or 'interest' when provided.")
        return errors

    def build_job_data(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        scope = self._resolve_required_string(
            options=options,
            context=context,
            key="scope",
        )
        if scope not in {"criterion", "interest"}:
            raise ValueError(
                f"{self.name} expected scope to be either 'criterion' or 'interest'."
            )

        job_data: dict[str, Any] = {
            **self._sequence_runtime_flags(),
            "eventId": self._resolve_required_string(
                options=options,
                context=context,
                key="event_id",
                aliases=("eventId",),
            ),
            "docId": self._resolve_required_string(
                options=options,
                context=context,
                key="doc_id",
                aliases=("docId",),
            ),
            "scope": scope,
            "targetId": self._resolve_required_string(
                options=options,
                context=context,
                key="target_id",
                aliases=("targetId",),
            ),
            "historicalBackfill": self._resolve_bool(
                options=options,
                context=context,
                key="historical_backfill",
                aliases=("historicalBackfill",),
                default=False,
            ),
        }
        prompt_template_id = self._resolve_optional_string(
            options=options,
            context=context,
            key="prompt_template_id",
            aliases=("promptTemplateId",),
        )
        if prompt_template_id is not None:
            job_data["promptTemplateId"] = prompt_template_id
        return job_data


class LegacyMaintenanceTaskPlugin(LegacyHandlerTaskPlugin):
    category = "maintenance"


class InterestCompilePlugin(LegacyMaintenanceTaskPlugin):
    name = "maintenance.interest_compile"
    description = "Wrap the legacy interest compile handler behind a task-engine plugin."
    handler_name = "process_interest_compile"
    input_descriptions = {
        "interest_id": "Interest identifier passed via task options or sequence context.",
        "event_id": "Existing outbox event UUID forwarded into the legacy handler shim.",
        "version": "Optional interest source version; defaults to 1.",
        "skip_auto_repair": "Optional flag to skip the queued historical repair job.",
    }
    output_descriptions = {
        "interest_id": "Resolved interest identifier.",
        "event_id": "Legacy event identifier retained in sequence context.",
        "status": "Compile status returned by the legacy handler.",
        "version": "Resolved interest source version.",
        "legacy_handler": "Legacy process_* handler invoked by this adapter.",
    }

    def validate_options(self, options: dict[str, Any]) -> list[str]:
        errors = super().validate_options(options)
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="interest_id",
            aliases=("interestId",),
        )
        self._validate_optional_positive_int(
            options,
            errors,
            option_key="version",
        )
        self._validate_optional_boolean_like(
            options,
            errors,
            option_key="skip_auto_repair",
            aliases=("skipAutoRepair",),
        )
        return errors

    def build_job_data(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        return {
            **self._sequence_runtime_flags(),
            "eventId": self._resolve_required_string(
                options=options,
                context=context,
                key="event_id",
                aliases=("eventId",),
            ),
            "interestId": self._resolve_required_string(
                options=options,
                context=context,
                key="interest_id",
                aliases=("interestId",),
            ),
            "version": self._resolve_positive_int(
                options=options,
                context=context,
                key="version",
                default=1,
            ),
            "skipAutoRepair": self._resolve_bool(
                options=options,
                context=context,
                key="skip_auto_repair",
                aliases=("skipAutoRepair",),
                default=False,
            ),
        }

    def build_context_update(
        self,
        job_data: Mapping[str, Any],
        result: Mapping[str, Any],
    ) -> dict[str, Any]:
        normalized_result = super().build_context_update(job_data, result)
        normalized_result["skip_auto_repair"] = bool(job_data["skipAutoRepair"])
        return normalized_result


class CriterionCompilePlugin(LegacyMaintenanceTaskPlugin):
    name = "maintenance.criterion_compile"
    description = "Wrap the legacy criterion compile handler behind a task-engine plugin."
    handler_name = "process_criterion_compile"
    input_descriptions = {
        "criterion_id": "Criterion identifier passed via task options or sequence context.",
        "event_id": "Existing outbox event UUID forwarded into the legacy handler shim.",
        "version": "Optional criterion source version; defaults to 1.",
    }
    output_descriptions = {
        "criterion_id": "Resolved criterion identifier.",
        "event_id": "Legacy event identifier retained in sequence context.",
        "status": "Compile status returned by the legacy handler.",
        "version": "Resolved criterion source version.",
        "legacy_handler": "Legacy process_* handler invoked by this adapter.",
    }

    def validate_options(self, options: dict[str, Any]) -> list[str]:
        errors = super().validate_options(options)
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="criterion_id",
            aliases=("criterionId",),
        )
        self._validate_optional_positive_int(
            options,
            errors,
            option_key="version",
        )
        return errors

    def build_job_data(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        return {
            **self._sequence_runtime_flags(),
            "eventId": self._resolve_required_string(
                options=options,
                context=context,
                key="event_id",
                aliases=("eventId",),
            ),
            "criterionId": self._resolve_required_string(
                options=options,
                context=context,
                key="criterion_id",
                aliases=("criterionId",),
            ),
            "version": self._resolve_positive_int(
                options=options,
                context=context,
                key="version",
                default=1,
            ),
        }


class FeedbackIngestPlugin(LegacyMaintenanceTaskPlugin):
    name = "maintenance.feedback_ingest"
    description = "Wrap the legacy feedback ingest handler behind a task-engine plugin."
    handler_name = "process_feedback_ingest"
    input_descriptions = {
        "notification_id": "Notification identifier forwarded into the legacy handler.",
        "doc_id": "Article identifier associated with the notification.",
        "user_id": "User identifier associated with the feedback.",
        "event_id": "Existing outbox event UUID forwarded into the legacy handler shim.",
    }
    output_descriptions = {
        "notification_id": "Resolved notification identifier.",
        "doc_id": "Resolved article identifier.",
        "user_id": "Resolved user identifier.",
        "status": "Feedback ingest status returned by the legacy handler.",
        "legacy_handler": "Legacy process_* handler invoked by this adapter.",
    }

    def validate_options(self, options: dict[str, Any]) -> list[str]:
        errors = super().validate_options(options)
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="notification_id",
            aliases=("notificationId",),
        )
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="user_id",
            aliases=("userId",),
        )
        return errors

    def build_job_data(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        return {
            "eventId": self._resolve_required_string(
                options=options,
                context=context,
                key="event_id",
                aliases=("eventId",),
            ),
            "notificationId": self._resolve_required_string(
                options=options,
                context=context,
                key="notification_id",
                aliases=("notificationId",),
            ),
            "docId": self._resolve_required_string(
                options=options,
                context=context,
                key="doc_id",
                aliases=("docId",),
            ),
            "userId": self._resolve_required_string(
                options=options,
                context=context,
                key="user_id",
                aliases=("userId",),
            ),
        }


class ReindexPlugin(LegacyMaintenanceTaskPlugin):
    name = "maintenance.reindex"
    description = "Wrap the legacy reindex/backfill handler behind a task-engine plugin."
    handler_name = "process_reindex"
    input_descriptions = {
        "reindex_job_id": "Reindex job identifier passed via task options or sequence context.",
        "event_id": "Existing outbox event UUID forwarded into the legacy handler shim.",
        "index_name": "Optional target index name; defaults inside the legacy handler.",
    }
    output_descriptions = {
        "reindex_job_id": "Resolved reindex job identifier.",
        "index_name": "Resolved index name when one is supplied.",
        "status": "Reindex status returned by the legacy handler.",
        "result": "Rebuild/backfill payload returned by the legacy handler.",
        "legacy_handler": "Legacy process_* handler invoked by this adapter.",
    }

    def validate_options(self, options: dict[str, Any]) -> list[str]:
        errors = super().validate_options(options)
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="reindex_job_id",
            aliases=("reindexJobId",),
        )
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="index_name",
            aliases=("indexName",),
        )
        return errors

    def build_job_data(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        job_data: dict[str, Any] = {
            "eventId": self._resolve_required_string(
                options=options,
                context=context,
                key="event_id",
                aliases=("eventId",),
            ),
            "reindexJobId": self._resolve_required_string(
                options=options,
                context=context,
                key="reindex_job_id",
                aliases=("reindexJobId",),
            ),
        }
        index_name = self._resolve_optional_string(
            options=options,
            context=context,
            key="index_name",
            aliases=("indexName",),
        )
        if index_name is not None:
            job_data["indexName"] = index_name
        return job_data


CORE_PIPELINE_PLUGIN_CLASSES = (
    NormalizeArticlePlugin,
    DedupArticlePlugin,
    EmbedArticlePlugin,
    MatchCriteriaPlugin,
    ClusterArticlePlugin,
    MatchInterestsPlugin,
    NotifyUsersPlugin,
    LlmReviewPlugin,
)

MAINTENANCE_PLUGIN_CLASSES = (
    InterestCompilePlugin,
    CriterionCompilePlugin,
    FeedbackIngestPlugin,
    ReindexPlugin,
)

BUILTIN_PLUGIN_CLASSES = CORE_PIPELINE_PLUGIN_CLASSES + MAINTENANCE_PLUGIN_CLASSES


def register_core_pipeline_plugins(
    registry: TaskPluginRegistry | None = None,
) -> TaskPluginRegistry:
    target_registry = registry or TASK_REGISTRY
    for plugin_class in CORE_PIPELINE_PLUGIN_CLASSES:
        target_registry.register(plugin_class)
    return target_registry


def register_maintenance_plugins(
    registry: TaskPluginRegistry | None = None,
) -> TaskPluginRegistry:
    target_registry = registry or TASK_REGISTRY
    for plugin_class in MAINTENANCE_PLUGIN_CLASSES:
        target_registry.register(plugin_class)
    return target_registry


def register_builtin_plugins(
    registry: TaskPluginRegistry | None = None,
) -> TaskPluginRegistry:
    target_registry = registry or TASK_REGISTRY
    for plugin_class in BUILTIN_PLUGIN_CLASSES:
        target_registry.register(plugin_class)
    return target_registry


register_builtin_plugins(TASK_REGISTRY)
