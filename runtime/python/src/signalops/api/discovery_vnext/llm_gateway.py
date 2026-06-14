from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from psycopg.types.json import Json

from signalops.api.database import query_one
from signalops.api.discovery_vnext.models import DiscoveryVNextLlmGatewayPayload
from signalops.api.discovery_vnext.policy import resolve_required_policy_payload
from signalops.api.discovery_vnext.providers import _assert_live_runtime_allowed, _env
from signalops.workers.task_engine.adapters.llm_analyzer import GeminiLlmAnalyzerAdapter

def run_llm_gateway(payload: DiscoveryVNextLlmGatewayPayload) -> dict[str, Any]:
    runtime_policy = resolve_required_policy_payload({}, "discovery-runtime")
    if payload.live_provider_execution:
        _assert_live_runtime_allowed(runtime_policy, payload.budget)
    started = query_one(
        """
        insert into discovery_llm_gateway_events (
          vnext_run_id,
          artifact_id,
          task,
          provider,
          model,
          status,
          prompt_json,
          request_json,
          live_provider_execution,
          created_by,
          started_at
        )
        values (%s, %s, %s, 'gemini', %s, 'running', %s, %s, %s, %s, now())
        returning *
        """,
        (
            payload.vnext_run_id or payload.run_id,
            payload.artifact_id,
            payload.task,
            payload.model or _env("DISCOVERY_GEMINI_MODEL") or _env("GEMINI_MODEL") or "gemini-3.5-flash",
            Json({"prompt": payload.prompt}),
            Json({"task": payload.task, "payload": payload.payload, "temperature": payload.temperature}),
            payload.live_provider_execution,
            payload.created_by,
        ),
    )
    analyzer = GeminiLlmAnalyzerAdapter()
    result = analyzer.analyze(
        prompt=payload.prompt,
        task=payload.task,
        payload=payload.payload,
        model=payload.model,
        temperature=payload.temperature,
        output_schema=payload.output_schema,
    )
    meta = result.get("meta") if isinstance(result.get("meta"), dict) else {}
    if payload.live_provider_execution and meta.get("deterministic_fallback"):
        status = "failed"
        error = {"detail": meta.get("error") or "LLM live execution did not call provider."}
    else:
        status = "succeeded"
        error = {}
    updated = query_one(
        """
        update discovery_llm_gateway_events
        set status = %s,
            response_json = %s,
            validation_json = %s,
            error_json = %s,
            prompt_tokens = %s,
            completion_tokens = %s,
            total_tokens = %s,
            cost_cents = %s,
            deterministic_fallback = %s,
            completed_at = now()
        where llm_gateway_event_id = %s
        returning *
        """,
        (
            status,
            Json(result),
            Json({"schemaValid": status == "succeeded", "policyValid": status == "succeeded", "errors": [] if status == "succeeded" else [error]}),
            Json(error),
            meta.get("prompt_tokens"),
            meta.get("completion_tokens"),
            meta.get("total_tokens"),
            int(meta.get("cost_cents") or 0),
            bool(meta.get("deterministic_fallback")),
            started["llm_gateway_event_id"],
        ),
    )
    if status == "failed":
        raise HTTPException(status_code=503, detail=error["detail"])
    return {"event": updated, "result": result.get("result")}

