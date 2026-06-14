from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from psycopg.types.json import Json

from signalops.api.database import query_one
from signalops.api.discovery_vnext.models import DiscoveryVNextFeedbackPayload

def submit_feedback(payload: DiscoveryVNextFeedbackPayload) -> dict[str, Any]:
    if payload.feedback_type == "mark_useful":
        if not (
            payload.feedback.get("classificationCorrect") is True
            or payload.feedback.get("sourceUsefulAsClassified") is True
            or payload.feedback.get("usefulnessKind") == "classification_usefulness"
        ):
            raise HTTPException(
                status_code=422,
                detail=(
                    "mark_useful means classification/usefulness was correct; include "
                    "classificationCorrect=true, sourceUsefulAsClassified=true, or usefulnessKind=classification_usefulness."
                ),
            )
    row = query_one(
        """
        insert into discovery_feedback_events (
          target_type,
          target_id,
          feedback_type,
          feedback_json,
          created_by
        )
        values (%s, %s, %s, %s, %s)
        returning *
        """,
        (
            payload.target_type,
            payload.target_id,
            payload.feedback_type,
            Json(payload.feedback),
            payload.created_by,
        ),
    )
    return row or {}



