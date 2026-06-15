from __future__ import annotations

from typing import Any, Mapping

from .discovery_plugin_common import (
    ContextTaskPlugin,
    _MISSING,
    _coerce_mapping_list,
    _lookup_from_mapping,
)
from . import discovery_runtime as _discovery_runtime
from .discovery_runtime import resolve_runtime_call

_VALID_ENRICHMENT_MODES = {"merge", "replace"}


class SignalCandidateLoaderPlugin(ContextTaskPlugin):
    name = "enrichment.signal_candidate_loader"
    description = "Load signal_candidates for enrichment through a pluggable data adapter."
    category = "enrichment"

    async def execute(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        filters = self._resolve_json_object(
            options=options,
            context=context,
            key="filters",
            default={},
        )
        filters_field = self._resolve_optional_string(
            options=options,
            context=context,
            key="filters_field",
            aliases=("filtersField",),
        )
        if filters_field is not None:
            filters = self._resolve_json_object(
                options={},
                context=context,
                key=filters_field,
            )
        limit = self._resolve_positive_int(
            options=options,
            context=context,
            key="limit",
            default=50,
        )
        include_blocked = self._resolve_bool(
            options=options,
            context=context,
            key="include_blocked",
            aliases=("includeBlocked",),
            default=False,
        )

        runtime = _discovery_runtime.get_discovery_runtime()
        raw_results = await resolve_runtime_call(
            runtime.signal_candidate_loader.load_signal_candidates(
                filters=filters,
                limit=limit,
                include_blocked=include_blocked,
            )
        )
        signal_candidates = _coerce_mapping_list(raw_results, field_name="signal_candidates")
        return {"signal_candidates": signal_candidates}

    def validate_options(self, options: dict[str, Any]) -> list[str]:
        errors: list[str] = []
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="filters_field",
            aliases=("filtersField",),
        )
        self._validate_optional_positive_int(options, errors, option_key="limit")
        self._validate_optional_boolean_like(
            options,
            errors,
            option_key="include_blocked",
            aliases=("includeBlocked",),
        )
        return errors

    def describe_inputs(self) -> dict[str, str]:
        return {
            "filters": "Direct signal_candidate loader filters.",
            "filters_field": "Context field containing the loader filters.",
            "limit": "Maximum number of signal_candidates to load.",
            "include_blocked": "Whether blocked signal_candidates may be included.",
        }

    def describe_outputs(self) -> dict[str, str]:
        return {
            "signal_candidates": "Loaded signal_candidate rows for later enrichment tasks.",
        }


class SignalCandidateEnricherPlugin(ContextTaskPlugin):
    name = "enrichment.signal_candidate_enricher"
    description = "Persist enrichment results back to signal_candidates through a pluggable adapter."
    category = "enrichment"

    async def execute(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        signal_candidates_field = self._resolve_optional_string(
            options=options,
            context=context,
            key="signal_candidates_field",
            aliases=("signalCandidatesField",),
        ) or "signal_candidates"
        signal_candidates = _coerce_mapping_list(context.get(signal_candidates_field) or [], field_name=signal_candidates_field)

        enrichment_field = self._resolve_optional_string(
            options=options,
            context=context,
            key="enrichment_field",
            aliases=("enrichmentField",),
        )
        enrichment = (
            context.get(enrichment_field)
            if enrichment_field
            else options.get("enrichment", context.get("llm_analysis"))
        )
        mode = self._resolve_optional_string(
            options=options,
            context=context,
            key="mode",
        ) or "merge"
        if mode not in _VALID_ENRICHMENT_MODES:
            raise ValueError(
                f"{self.name} expected mode to be one of {sorted(_VALID_ENRICHMENT_MODES)}."
            )
        target_field = self._resolve_optional_string(
            options=options,
            context=context,
            key="target_field",
            aliases=("targetField",),
        )

        runtime = _discovery_runtime.get_discovery_runtime()
        raw_result = await resolve_runtime_call(
            runtime.signal_candidate_enricher.enrich_signal_candidates(
                signal_candidates=signal_candidates,
                enrichment=enrichment,
                mode=mode,
                target_field=target_field,
            )
        )

        updated_signal_candidates = signal_candidates
        enriched_count = len(signal_candidates)
        if isinstance(raw_result, Mapping):
            if raw_result.get("signal_candidates") is not None:
                updated_signal_candidates = _coerce_mapping_list(
                    raw_result.get("signal_candidates"),
                    field_name="signal_candidates",
                )
            if raw_result.get("enriched_count") is not None:
                enriched_count = int(raw_result["enriched_count"])
        elif isinstance(raw_result, list):
            updated_signal_candidates = _coerce_mapping_list(raw_result, field_name="signal_candidates")
            enriched_count = len(updated_signal_candidates)
        elif isinstance(raw_result, int):
            enriched_count = raw_result

        return {
            "signal_candidates": updated_signal_candidates,
            "enriched_count": max(0, int(enriched_count)),
        }

    def validate_options(self, options: dict[str, Any]) -> list[str]:
        errors: list[str] = []
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="signal_candidates_field",
            aliases=("signalCandidatesField",),
        )
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="enrichment_field",
            aliases=("enrichmentField",),
        )
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="target_field",
            aliases=("targetField",),
        )
        mode = _lookup_from_mapping(options, "mode")
        if mode is not _MISSING and mode is not None and mode not in _VALID_ENRICHMENT_MODES:
            errors.append(f"mode must be one of {sorted(_VALID_ENRICHMENT_MODES)} when provided.")
        return errors

    def describe_inputs(self) -> dict[str, str]:
        return {
            "signal_candidates_field": "Context field containing signal_candidates to enrich.",
            "enrichment_field": "Context field containing enrichment payload.",
            "mode": "How to apply enrichment: merge or replace.",
            "target_field": "Optional signal_candidate field to update through the adapter.",
        }

    def describe_outputs(self) -> dict[str, str]:
        return {
            "signal_candidates": "Updated signal_candidate rows after enrichment.",
            "enriched_count": "Number of signal_candidates acknowledged by the enricher adapter.",
        }
