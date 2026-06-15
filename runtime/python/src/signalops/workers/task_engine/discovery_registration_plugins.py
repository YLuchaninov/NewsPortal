from __future__ import annotations

from typing import Any

from .discovery_plugin_common import (
    ContextTaskPlugin,
    _MISSING,
    _coerce_mapping_list,
    _lookup_from_mapping,
)
from . import discovery_runtime as _discovery_runtime
from .discovery_runtime import resolve_runtime_call
from ..provider_capabilities import BETA_INGEST_PROVIDER_TYPE_SET

_VALID_DISCOVERY_PROVIDER_TYPES = set(BETA_INGEST_PROVIDER_TYPE_SET)


class SourceRegistrarPlugin(ContextTaskPlugin):
    name = "discovery.source_registrar"
    description = "Register discovered sources through a pluggable DB/outbox adapter."
    category = "discovery"

    async def execute(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        sources_field = self._resolve_optional_string(
            options=options,
            context=context,
            key="sources_field",
            aliases=("sourcesField",),
        ) or "scored_sources"
        minimum_score = self._resolve_probability(
            options=options,
            context=context,
            key="minimum_score",
            aliases=("minimumScore",),
            default=0.0,
        )
        enabled = self._resolve_bool(
            options=options,
            context=context,
            key="enabled",
            default=False,
        )
        dry_run = self._resolve_bool(
            options=options,
            context=context,
            key="dry_run",
            aliases=("dryRun",),
            default=False,
        )
        created_by = self._resolve_optional_string(
            options=options,
            context=context,
            key="created_by",
            aliases=("createdBy",),
        )
        tags = self._resolve_string_list(
            options=options,
            context=context,
            key="tags",
            default=[],
        )
        provider_type = self._resolve_optional_string(
            options=options,
            context=context,
            key="provider_type",
            aliases=("providerType",),
        ) or "website"
        if provider_type not in _VALID_DISCOVERY_PROVIDER_TYPES:
            raise ValueError(
                f"{self.name} expected provider_type to be one of {sorted(_VALID_DISCOVERY_PROVIDER_TYPES)}."
            )

        sources = _coerce_mapping_list(context.get(sources_field) or [], field_name=sources_field)
        selected_sources = [
            dict(source)
            for source in sources
            if float(source.get("relevance_score", 0) or 0) >= minimum_score
            and (
                source.get("passes_threshold") is None
                or bool(source.get("passes_threshold"))
            )
        ]

        runtime = _discovery_runtime.get_discovery_runtime()
        raw_results = await resolve_runtime_call(
            runtime.source_registrar.register_sources(
                sources=selected_sources,
                enabled=enabled,
                dry_run=dry_run,
                created_by=created_by,
                tags=tags,
                provider_type=provider_type,
            )
        )
        registered = _coerce_mapping_list(raw_results, field_name="registered_channels")
        return {"registered_channels": registered}

    def validate_options(self, options: dict[str, Any]) -> list[str]:
        errors: list[str] = []
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="sources_field",
            aliases=("sourcesField",),
        )
        self._validate_optional_probability(
            options,
            errors,
            option_key="minimum_score",
            aliases=("minimumScore",),
        )
        self._validate_optional_boolean_like(options, errors, option_key="enabled")
        self._validate_optional_boolean_like(
            options,
            errors,
            option_key="dry_run",
            aliases=("dryRun",),
        )
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="created_by",
            aliases=("createdBy",),
        )
        provider_type = _lookup_from_mapping(options, "provider_type", "providerType")
        if (
            provider_type is not _MISSING
            and provider_type is not None
            and provider_type not in _VALID_DISCOVERY_PROVIDER_TYPES
        ):
            errors.append(
                f"provider_type must be one of {sorted(_VALID_DISCOVERY_PROVIDER_TYPES)} when provided."
            )
        self._validate_optional_string_list(options, errors, option_key="tags")
        return errors

    def describe_inputs(self) -> dict[str, str]:
        return {
            "sources_field": "Context field containing scored sources.",
            "minimum_score": "Minimum relevance score required for registration.",
            "enabled": "Whether newly registered channels should start enabled.",
            "dry_run": "Whether the registrar should skip durable writes.",
            "provider_type": "Provider type to register for the selected sources: rss, website, api, or email_imap.",
        }

    def describe_outputs(self) -> dict[str, str]:
        return {
            "registered_channels": "Channels created or proposed by the registrar adapter.",
        }
