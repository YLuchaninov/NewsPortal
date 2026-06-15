from __future__ import annotations

from typing import Any

from .pipeline_processor_adapters import (
    _MISSING,
    LegacyHandlerTaskPlugin,
)


class NormalizeSignalCandidatePlugin(LegacyHandlerTaskPlugin):
    name = "signal_candidate.normalize"
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


class DedupSignalCandidatePlugin(LegacyHandlerTaskPlugin):
    name = "signal_candidate.dedup"
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


class EmbedSignalCandidatePlugin(LegacyHandlerTaskPlugin):
    name = "signal_candidate.embed"
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
    name = "signal_candidate.match_criteria"
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


class ClusterSignalCandidatePlugin(LegacyHandlerTaskPlugin):
    name = "signal_candidate.cluster"
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
    name = "signal_candidate.match_interests"
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
    name = "signal_candidate.notify"
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
    name = "signal_candidate.llm_review"
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


SIGNAL_CANDIDATE_PIPELINE_PLUGIN_CLASSES = (
    NormalizeSignalCandidatePlugin,
    DedupSignalCandidatePlugin,
    EmbedSignalCandidatePlugin,
    MatchCriteriaPlugin,
    ClusterSignalCandidatePlugin,
    MatchInterestsPlugin,
    NotifyUsersPlugin,
    LlmReviewPlugin,
)
