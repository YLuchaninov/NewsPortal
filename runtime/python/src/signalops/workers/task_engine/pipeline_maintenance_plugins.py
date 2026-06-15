from __future__ import annotations

from typing import Any, Mapping

from .pipeline_processor_adapters import LegacyHandlerTaskPlugin


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
        "doc_id": "SignalCandidate identifier associated with the notification.",
        "user_id": "User identifier associated with the feedback.",
        "event_id": "Existing outbox event UUID forwarded into the legacy handler shim.",
    }
    output_descriptions = {
        "notification_id": "Resolved notification identifier.",
        "doc_id": "Resolved signal_candidate identifier.",
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
