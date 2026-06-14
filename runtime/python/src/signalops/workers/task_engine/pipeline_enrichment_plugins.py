from __future__ import annotations

import asyncio
import json
from typing import Any, Mapping
from urllib.request import Request

from .pipeline_fetchers_client import (
    build_fetchers_internal_base_url,
    request_fetchers_json,
)
from .pipeline_legacy import (
    _camel_to_snake,
    LegacyHandlerTaskPlugin,
)


class SignalCandidateExtractPlugin(LegacyHandlerTaskPlugin):
    name = "enrichment.signal_candidate_extract"
    description = "Call the fetchers-owned signal_candidate enrichment endpoint before normalization."
    handler_name = "fetchers_internal_enrichment"
    input_descriptions = {
        "doc_id": "SignalCandidate identifier passed via task options or sequence context.",
        "event_id": "Sequence-owned event identifier retained for downstream idempotency.",
        "force_enrichment": "Optional flag to force signal_candidate extraction even when normal skip rules would apply.",
    }
    output_descriptions = {
        "doc_id": "SignalCandidate identifier retained in sequence context.",
        "event_id": "Sequence-owned event identifier retained in sequence context.",
        "status": "Fetchers enrichment outcome: skipped, enriched, or failed.",
        "enrichment_state": "Persisted enrichment state written on the signal candidate row.",
        "body_replaced": "Whether enrichment replaced the signal candidate body before normalize ran.",
        "media_asset_count": "Number of media assets persisted by the fetchers enrichment owner.",
        "error": "Non-fatal extraction error text when fetchers continued with the feed body.",
    }

    def validate_options(self, options: dict[str, Any]) -> list[str]:
        errors = super().validate_options(options)
        self._validate_optional_boolean_like(
            options,
            errors,
            option_key="force_enrichment",
            aliases=("forceEnrichment", "force"),
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
            "docId": self._resolve_required_string(
                options=options,
                context=context,
                key="doc_id",
                aliases=("docId",),
            ),
            "forceEnrichment": self._resolve_bool(
                options=options,
                context=context,
                key="force_enrichment",
                aliases=("forceEnrichment", "force"),
                default=False,
            ),
        }

    async def execute(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        job_data = self.build_job_data(options, context)
        result = await asyncio.to_thread(self._request_enrichment, job_data)
        if not isinstance(result, dict):
            raise TypeError(
                "Fetchers enrichment endpoint must return a JSON object result."
            )
        return self.build_context_update(job_data, result)

    def build_context_update(
        self,
        job_data: Mapping[str, Any],
        result: Mapping[str, Any],
    ) -> dict[str, Any]:
        normalized_result = {
            _camel_to_snake(key): value for key, value in result.items()
        }
        normalized_result["doc_id"] = str(job_data["docId"])
        normalized_result["event_id"] = str(job_data["eventId"])
        normalized_result["force_enrichment"] = bool(job_data.get("forceEnrichment"))
        return normalized_result

    def _request_enrichment(self, job_data: Mapping[str, Any]) -> dict[str, Any]:
        doc_id = str(job_data["docId"])
        request_body = json.dumps(
            {
                "force": bool(job_data.get("forceEnrichment")),
            }
        ).encode("utf-8")
        request = Request(
            f"{build_fetchers_internal_base_url()}/internal/enrichment/signal-candidates/{doc_id}",
            data=request_body,
            headers={
                "accept": "application/json",
                "content-type": "application/json",
            },
            method="POST",
        )
        return request_fetchers_json(
            request=request,
            subject_label="signal_candidate",
            subject_id=doc_id,
        )


class ResourceExtractPlugin(LegacyHandlerTaskPlugin):
    name = "enrichment.resource_extract"
    description = "Call the fetchers-owned resource enrichment endpoint for website resources."
    handler_name = "fetchers_internal_resource_enrichment"
    input_descriptions = {
        "resource_id": "Resource identifier passed via task options or sequence context.",
        "event_id": "Sequence-owned event identifier retained for traceability.",
        "force_enrichment": "Optional flag to force resource extraction.",
    }
    output_descriptions = {
        "resource_id": "Resource identifier retained in sequence context.",
        "event_id": "Sequence-owned event identifier retained in sequence context.",
        "status": "Fetchers resource enrichment outcome: skipped, enriched, or failed.",
        "resource_kind": "Final resource kind after typed extraction.",
        "extraction_state": "Persisted extraction state written on the resource row.",
        "projected_doc_id": "Projected signal_candidate doc_id when the resource was editorial-compatible.",
        "documents_count": "Number of documents stored on the resource row.",
        "media_count": "Number of media assets stored on the resource row.",
        "error": "Non-fatal extraction error text when enrichment failed.",
    }

    def validate_options(self, options: dict[str, Any]) -> list[str]:
        errors = super().validate_options(options)
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="resource_id",
            aliases=("resourceId",),
        )
        self._validate_optional_boolean_like(
            options,
            errors,
            option_key="force_enrichment",
            aliases=("forceEnrichment", "force"),
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
            "resourceId": self._resolve_required_string(
                options=options,
                context=context,
                key="resource_id",
                aliases=("resourceId", "aggregate_id", "aggregateId"),
            ),
            "forceEnrichment": self._resolve_bool(
                options=options,
                context=context,
                key="force_enrichment",
                aliases=("forceEnrichment", "force"),
                default=False,
            ),
        }

    async def execute(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        job_data = self.build_job_data(options, context)
        result = await asyncio.to_thread(self._request_enrichment, job_data)
        if not isinstance(result, dict):
            raise TypeError(
                "Fetchers resource enrichment endpoint must return a JSON object result."
            )
        return self.build_context_update(job_data, result)

    def build_context_update(
        self,
        job_data: Mapping[str, Any],
        result: Mapping[str, Any],
    ) -> dict[str, Any]:
        normalized_result = {
            _camel_to_snake(key): value for key, value in result.items()
        }
        normalized_result["resource_id"] = str(job_data["resourceId"])
        normalized_result["event_id"] = str(job_data["eventId"])
        normalized_result["force_enrichment"] = bool(job_data.get("forceEnrichment"))
        return normalized_result

    def _request_enrichment(self, job_data: Mapping[str, Any]) -> dict[str, Any]:
        resource_id = str(job_data["resourceId"])
        request_body = json.dumps(
            {
                "force": bool(job_data.get("forceEnrichment")),
            }
        ).encode("utf-8")
        request = Request(
            f"{build_fetchers_internal_base_url()}/internal/enrichment/resources/{resource_id}",
            data=request_body,
            headers={
                "accept": "application/json",
                "content-type": "application/json",
            },
            method="POST",
        )
        return request_fetchers_json(
            request=request,
            subject_label="resource",
            subject_id=resource_id,
        )


ENRICHMENT_PIPELINE_PLUGIN_CLASSES = (
    SignalCandidateExtractPlugin,
    ResourceExtractPlugin,
)
