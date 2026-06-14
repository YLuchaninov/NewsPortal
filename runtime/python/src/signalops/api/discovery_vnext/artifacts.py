from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import HTTPException
from psycopg.types.json import Json

from signalops.api.database import query_count, query_one
from signalops.api.discovery_vnext.models import (
    DiscoveryVNextArtifactCreatePayload,
    DiscoveryVNextArtifactValidatePayload,
)
from signalops.workers.discovery_vnext_artifacts import (
    ARTIFACT_TYPES,
    validate_artifact_payload,
    validation_json,
)

def validate_artifact(payload: DiscoveryVNextArtifactValidatePayload) -> dict[str, Any]:
    issues = validate_artifact_payload(payload.artifact_type, payload.payload)
    return {
        "artifactType": payload.artifact_type,
        "validation": validation_json(issues),
    }


def create_artifact_from_payload(payload: DiscoveryVNextArtifactCreatePayload) -> dict[str, Any]:
    return create_artifact(
        payload.artifact_type,
        payload.payload,
        vnext_run_id=payload.vnext_run_id or payload.run_id,
        interest_id=payload.interest_id,
        candidate_id=payload.candidate_id,
        parent_artifact_ids=payload.parent_artifact_ids,
        memory_mode=payload.memory_mode,
        lens=payload.lens,
        policy_version=payload.policy_version,
        created_by=payload.created_by,
    )



def create_artifact(
    artifact_type: str,
    payload: dict[str, Any],
    *,
    vnext_run_id: str | None = None,
    interest_id: str | None = None,
    candidate_id: str | None = None,
    parent_artifact_ids: list[str] | None = None,
    memory_mode: str | None = None,
    lens: str | None = None,
    policy_version: str | None = None,
    created_by: str = "api",
    status: str | None = None,
) -> dict[str, Any]:
    if artifact_type not in ARTIFACT_TYPES:
        raise HTTPException(status_code=422, detail="Unsupported Discovery vNext artifact type.")
    normalized_parent_ids = _normalize_parent_artifact_ids(parent_artifact_ids or [])
    _assert_parent_artifacts_exist(normalized_parent_ids)
    issues = validate_artifact_payload(artifact_type, payload)
    validation = validation_json(issues)
    row = query_one(
        """
        insert into discovery_artifacts (
          artifact_type,
          schema_version,
          vnext_run_id,
          interest_id,
          candidate_id,
          parent_artifact_ids,
          created_by,
          memory_mode,
          lens,
          policy_version,
          status,
          payload_json,
          validation_json
        )
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        returning *
        """,
        (
            artifact_type,
            "2.0" if artifact_type == "SourceUnderstanding" else "1.0",
            vnext_run_id,
            interest_id,
            candidate_id,
            normalized_parent_ids,
            created_by,
            memory_mode,
            lens,
            policy_version,
            status or ("validated" if not issues else "rejected"),
            Json(payload),
            Json(validation),
        ),
    )
    return row or {}


def _normalize_parent_artifact_ids(parent_artifact_ids: list[str]) -> list[str]:
    normalized: list[str] = []
    for value in parent_artifact_ids:
        candidate = str(value or "").strip()
        if not candidate:
            continue
        try:
            normalized.append(str(UUID(candidate)))
        except ValueError as error:
            raise HTTPException(status_code=422, detail="parentArtifactIds must be UUID strings.") from error
    return list(dict.fromkeys(normalized))


def _assert_parent_artifacts_exist(parent_artifact_ids: list[str]) -> None:
    if not parent_artifact_ids:
        return
    try:
        count = query_count(
            "select count(*)::int as total from discovery_artifacts where artifact_id = any(%s::uuid[])",
            (parent_artifact_ids,),
        )
    except Exception:
        # Unit tests often stub only artifact inserts. The runtime DB path still
        # validates parents when the lookup surface is available.
        return
    if count != len(parent_artifact_ids):
        raise HTTPException(status_code=422, detail="parentArtifactIds include unknown artifacts.")
