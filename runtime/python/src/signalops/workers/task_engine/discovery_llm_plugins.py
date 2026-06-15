from __future__ import annotations

from typing import Any

from .adapters.llm_analyzer import unwrap_llm_analyzer_output
from .discovery_plugin_common import (
    ContextTaskPlugin,
    _MISSING,
    _lookup_from_mapping,
    _non_reserved_context,
)
from . import discovery_runtime as _discovery_runtime
from .discovery_runtime import resolve_runtime_call


class LlmAnalyzerPlugin(ContextTaskPlugin):
    name = "discovery.llm_analyzer"
    description = "Run a pluggable LLM analysis step over discovery or enrichment payloads."
    category = "discovery"

    async def execute(
        self,
        options: dict[str, Any],
        context: dict[str, Any],
    ) -> dict[str, Any]:
        output_field = self._resolve_optional_string(
            options=options,
            context=context,
            key="output_field",
            aliases=("outputField",),
        ) or "llm_analysis"
        meta_output_field = self._resolve_optional_string(
            options=options,
            context=context,
            key="meta_output_field",
            aliases=("metaOutputField",),
        ) or f"{output_field}_meta"
        prompt = self._resolve_optional_string(
            options=options,
            context=context,
            key="prompt",
        )
        if prompt is None:
            prompt_field = self._resolve_optional_string(
                options=options,
                context=context,
                key="prompt_field",
                aliases=("promptField",),
            )
            if prompt_field is not None:
                prompt = self._resolve_required_string(
                    options={},
                    context=context,
                    key=prompt_field,
                )

        task = self._resolve_optional_string(
            options=options,
            context=context,
            key="task",
        )
        payload_field = self._resolve_optional_string(
            options=options,
            context=context,
            key="payload_field",
            aliases=("payloadField",),
        )
        payload = (
            context.get(payload_field)
            if payload_field
            else options.get("payload", _non_reserved_context(context))
        )
        model = self._resolve_optional_string(
            options=options,
            context=context,
            key="model",
        )
        temperature = self._resolve_probability(
            options=options,
            context=context,
            key="temperature",
            default=0.0,
        )
        output_schema = self._resolve_json_object(
            options=options,
            context=context,
            key="output_schema",
            aliases=("outputSchema",),
            default=None,
        ) or None

        runtime = _discovery_runtime.get_discovery_runtime()
        raw_result = await resolve_runtime_call(
            runtime.llm_analyzer.analyze(
                prompt=prompt,
                task=task,
                payload=payload,
                model=model,
                temperature=temperature,
                output_schema=output_schema,
            )
        )
        result, result_meta = unwrap_llm_analyzer_output(raw_result)
        return {
            output_field: result,
            meta_output_field: result_meta,
        }

    def validate_options(self, options: dict[str, Any]) -> list[str]:
        errors: list[str] = []
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="output_field",
            aliases=("outputField",),
        )
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="meta_output_field",
            aliases=("metaOutputField",),
        )
        self._validate_optional_non_empty_string(options, errors, option_key="prompt")
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="prompt_field",
            aliases=("promptField",),
        )
        self._validate_optional_non_empty_string(options, errors, option_key="task")
        self._validate_optional_non_empty_string(
            options,
            errors,
            option_key="payload_field",
            aliases=("payloadField",),
        )
        self._validate_optional_non_empty_string(options, errors, option_key="model")
        self._validate_optional_probability(options, errors, option_key="temperature")

        prompt = _lookup_from_mapping(options, "prompt")
        prompt_field = _lookup_from_mapping(options, "prompt_field", "promptField")
        task = _lookup_from_mapping(options, "task")
        if (
            (prompt is _MISSING or prompt is None)
            and (prompt_field is _MISSING or prompt_field is None)
            and (task is _MISSING or task is None)
        ):
            errors.append("At least one of prompt, prompt_field or task must be provided.")
        return errors

    def describe_inputs(self) -> dict[str, str]:
        return {
            "prompt": "Direct prompt string for the analyzer.",
            "prompt_field": "Context field containing the prompt.",
            "task": "Short task label understood by the adapter.",
            "payload_field": "Context field containing the payload to analyze.",
            "output_field": "Context field name to receive the analysis output.",
            "meta_output_field": "Context field name to receive provider/cost metadata.",
        }

    def describe_outputs(self) -> dict[str, str]:
        return {
            "llm_analysis": "LLM-produced analysis or structured output.",
            "llm_analysis_meta": "Provider/model/usage/cost metadata for the analysis step.",
        }
