from __future__ import annotations

from fastapi import HTTPException

from services.api.app import content_analysis_policies as _content_analysis_policies
from services.api.app import discovery_candidates as _discovery_candidates
from services.api.app import discovery_classes as _discovery_classes
from services.api.app import discovery_feedback as _discovery_feedback
from services.api.app import discovery_missions as _discovery_missions
from services.api.app import discovery_policy_profiles as _discovery_policy_profiles
from services.api.app import discovery_read_model as _discovery_read_model
from services.api.app import discovery_recall_missions as _discovery_recall_missions
from services.api.app.sequence_read_model import (
    SequenceConflictError,
    SequenceNotFoundError,
    SequenceValidationError,
)


def raise_discovery_read_model_not_found(
    error: _discovery_read_model.DiscoveryReadModelNotFound,
) -> None:
    raise SequenceNotFoundError(str(error)) from error


def raise_content_analysis_policy_write_error(error: Exception) -> None:
    if isinstance(error, _content_analysis_policies.ContentAnalysisPolicyWriteFailure):
        raise HTTPException(status_code=500, detail=str(error)) from error
    raise error


def raise_discovery_policy_profile_error(error: Exception) -> None:
    if isinstance(error, _discovery_policy_profiles.DiscoveryPolicyProfileValidation):
        raise SequenceValidationError(error.errors) from error
    if isinstance(error, _discovery_policy_profiles.DiscoveryPolicyProfileNotFound):
        raise SequenceNotFoundError(str(error)) from error
    if isinstance(error, _discovery_policy_profiles.DiscoveryPolicyProfileConflict):
        raise SequenceConflictError(str(error)) from error
    raise error


def raise_discovery_class_error(error: Exception) -> None:
    if isinstance(error, _discovery_classes.DiscoveryClassValidation):
        raise SequenceValidationError(error.errors) from error
    if isinstance(error, _discovery_classes.DiscoveryClassNotFound):
        raise SequenceNotFoundError(str(error)) from error
    if isinstance(error, _discovery_classes.DiscoveryClassConflict):
        raise SequenceConflictError(str(error)) from error
    raise error


def raise_discovery_candidate_error(error: Exception) -> None:
    if isinstance(error, _discovery_candidates.DiscoveryCandidateValidation):
        raise SequenceValidationError(error.errors) from error
    if isinstance(error, _discovery_candidates.DiscoveryCandidateNotFound):
        raise SequenceNotFoundError(str(error)) from error
    if isinstance(error, _discovery_candidates.DiscoveryCandidateConflict):
        raise SequenceConflictError(str(error)) from error
    raise error


def raise_discovery_feedback_error(error: Exception) -> None:
    if isinstance(error, _discovery_feedback.DiscoveryFeedbackConflict):
        raise SequenceConflictError(str(error)) from error
    raise error


def raise_discovery_mission_error(error: Exception) -> None:
    if isinstance(error, _discovery_missions.DiscoveryMissionValidation):
        raise SequenceValidationError(error.errors) from error
    if isinstance(error, _discovery_missions.DiscoveryMissionNotFound):
        raise SequenceNotFoundError(str(error)) from error
    if isinstance(error, _discovery_missions.DiscoveryMissionConflict):
        raise SequenceConflictError(str(error)) from error
    raise error


def raise_discovery_recall_mission_error(error: Exception) -> None:
    if isinstance(error, _discovery_recall_missions.DiscoveryRecallMissionValidation):
        raise SequenceValidationError(error.errors) from error
    if isinstance(error, _discovery_recall_missions.DiscoveryRecallMissionNotFound):
        raise SequenceNotFoundError(str(error)) from error
    if isinstance(error, _discovery_recall_missions.DiscoveryRecallMissionConflict):
        raise SequenceConflictError(str(error)) from error
    raise error
