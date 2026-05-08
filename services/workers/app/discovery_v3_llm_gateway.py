from __future__ import annotations

import hashlib
import inspect
import json
from typing import Any, Callable, TypeVar

from pydantic import BaseModel

try:  # pragma: no cover - import availability varies in lean unit runtimes.
    from .task_engine.adapters.llm_analyzer import unwrap_llm_analyzer_output
except Exception:  # pragma: no cover
    def unwrap_llm_analyzer_output(value: Any) -> tuple[Any, dict[str, Any]]:
        if isinstance(value, dict) and "result" in value:
            meta = value.get("meta")
            return value.get("result"), dict(meta) if isinstance(meta, dict) else {}
        return value, {}


SchemaT = TypeVar("SchemaT", bound=BaseModel)
FallbackFactory = Callable[[dict[str, Any]], dict[str, Any]]


def stable_json_hash(payload: Any) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


async def _maybe_await(value: Any) -> Any:
    if inspect.isawaitable(value):
        return await value
    return value


class DiscoveryV3LlmGateway:
    """Schema-first LLM gateway for discovery v3.

    The gateway intentionally treats model output as a proposal: every response
    is schema-validated, logged, cached by task/input hash and has a deterministic
    fallback path. Decisions remain with deterministic discovery policies.
    """

    def __init__(
        self,
        *,
        repository: Any | None = None,
        llm_analyzer: Any | None = None,
        enabled: bool = True,
        model: str | None = None,
    ) -> None:
        self.repository = repository
        self.llm_analyzer = llm_analyzer
        self.enabled = enabled
        self.model = model

    async def run_json_task(
        self,
        *,
        task_name: str,
        input_payload: dict[str, Any],
        schema_model: type[SchemaT],
        fallback_factory: FallbackFactory,
        refs: dict[str, Any] | None = None,
        prompt: str | None = None,
        output_schema: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        input_hash = stable_json_hash(input_payload)
        cached = await self._get_cached(task_name, input_hash)
        if cached:
            cached_output = cached.get("output_json")
            if isinstance(cached_output, dict):
                return cached_output

        fallback = fallback_factory(input_payload)
        status = "fallback"
        output = fallback
        meta: dict[str, Any] = {}
        error_text: str | None = None
        repair_attempted = False
        fallback_used = True

        if self.enabled and self.llm_analyzer is not None:
            try:
                raw = await _maybe_await(
                    self.llm_analyzer.analyze(
                        prompt=prompt,
                        task=task_name,
                        payload=input_payload,
                        model=self.model,
                        temperature=0.0,
                        output_schema=output_schema,
                    )
                )
                candidate, meta = unwrap_llm_analyzer_output(raw)
                candidate_json = self._coerce_json(candidate)
                output = schema_model.model_validate(candidate_json).model_dump(by_alias=True)
                status = "valid"
                fallback_used = False
            except Exception as first_error:
                repair_attempted = True
                try:
                    repair_payload = {
                        "taskName": task_name,
                        "input": input_payload,
                        "invalidOutputError": str(first_error),
                        "requiredSchema": schema_model.model_json_schema(),
                    }
                    raw = await _maybe_await(
                        self.llm_analyzer.analyze(
                            prompt=(
                                "Repair the previous discovery LLM output so it matches the JSON schema. "
                                "Return JSON only."
                            ),
                            task=f"{task_name}.repair",
                            payload=repair_payload,
                            model=self.model,
                            temperature=0.0,
                            output_schema=output_schema,
                        )
                    )
                    candidate, repair_meta = unwrap_llm_analyzer_output(raw)
                    meta = {**meta, "repair": repair_meta}
                    candidate_json = self._coerce_json(candidate)
                    output = schema_model.model_validate(candidate_json).model_dump(by_alias=True)
                    status = "valid"
                    fallback_used = False
                except Exception as repair_error:
                    output = fallback
                    error_text = f"{type(first_error).__name__}: {first_error}; repair: {type(repair_error).__name__}: {repair_error}"

        await self._log_decision(
            {
                **(refs or {}),
                "task_name": task_name,
                "input_hash": input_hash,
                "input_json": input_payload,
                "output_json": output,
                "fallback_output_json": fallback,
                "status": status,
                "schema_name": schema_model.__name__,
                "schema_version": "1",
                "llm_model": self.model or meta.get("model"),
                "repair_attempted": repair_attempted,
                "fallback_used": fallback_used,
                "error_text": error_text,
                "cost_json": {
                    "costUsd": meta.get("cost_usd", 0),
                    "costCents": meta.get("cost_cents", 0),
                    "requestCount": meta.get("request_count", 0),
                    "promptTokens": meta.get("prompt_tokens"),
                    "completionTokens": meta.get("completion_tokens"),
                    "totalTokens": meta.get("total_tokens"),
                },
                "meta_json": meta,
            }
        )
        return output

    async def _get_cached(self, task_name: str, input_hash: str) -> dict[str, Any] | None:
        if self.repository is None or not hasattr(self.repository, "get_cached_llm_decision"):
            return None
        try:
            return await self.repository.get_cached_llm_decision(task_name=task_name, input_hash=input_hash)
        except Exception:
            return None

    async def _log_decision(self, row: dict[str, Any]) -> None:
        if self.repository is None or not hasattr(self.repository, "insert_llm_decision"):
            return
        try:
            await self.repository.insert_llm_decision(row)
        except Exception:
            return

    def _coerce_json(self, value: Any) -> dict[str, Any]:
        if isinstance(value, dict):
            return value
        if isinstance(value, BaseModel):
            return value.model_dump()
        if isinstance(value, str):
            parsed = json.loads(value)
            if isinstance(parsed, dict):
                return parsed
        raise ValueError("LLM output was not a JSON object.")
