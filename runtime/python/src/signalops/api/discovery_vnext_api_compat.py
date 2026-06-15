from __future__ import annotations

import sys
from functools import wraps
from inspect import signature
from typing import Any

from signalops.api.database import query_all, query_count, query_one
from signalops.api.discovery_vnext import acquisition as _acquisition
from signalops.api.discovery_vnext import artifacts as _artifacts
from signalops.api.discovery_vnext import briefs as _briefs
from signalops.api.discovery_vnext import feedback as _feedback
from signalops.api.discovery_vnext import llm_gateway as _llm_gateway
from signalops.api.discovery_vnext import models as _models
from signalops.api.discovery_vnext import orchestration as _orchestration
from signalops.api.discovery_vnext import policy as _policy
from signalops.api.discovery_vnext import probing as _probing
from signalops.api.discovery_vnext import providers as _providers
from signalops.api.discovery_vnext import replay as _replay
from signalops.api.discovery_vnext import repository as _repository
from signalops.api.discovery_vnext import rollback as _rollback
from signalops.api.discovery_vnext import routing as _routing
from signalops.api.discovery_vnext import run_steps as _run_steps
from signalops.api.discovery_vnext import runs as _runs
from signalops.api.discovery_vnext import source_inventory as _source_inventory
from signalops.api.discovery_vnext import (
    source_inventory_actions as _source_inventory_actions,
)
from signalops.api.discovery_vnext import source_sync as _source_sync
from signalops.workers.discovery_vnext_handoff import apply_probation_handoff
from signalops.workers.discovery_vnext_probe import execute_probe_plan
from signalops.workers.task_engine.adapters.source_registrar import (
    PostgresSourceRegistrarAdapter,
)

FACADE_MODULE_NAME = "signalops.api.discovery_vnext_api"
_PAYLOAD_MODEL_NAMES = (
    "DiscoveryVNextArtifactCreatePayload",
    "DiscoveryVNextArtifactValidatePayload",
    "DiscoveryVNextBriefPreviewPayload",
    "DiscoveryVNextCandidateCreatePayload",
    "DiscoveryVNextCandidateNormalizePayload",
    "DiscoveryVNextFeedbackPayload",
    "DiscoveryVNextLlmGatewayPayload",
    "DiscoveryVNextMegaLoopPreviewPayload",
    "DiscoveryVNextPolicyActivatePayload",
    "DiscoveryVNextProbationHandoffPayload",
    "DiscoveryVNextProbeExecutePayload",
    "DiscoveryVNextProbePlanPreviewPayload",
    "DiscoveryVNextReplayPayload",
    "DiscoveryVNextRollbackApplyPayload",
    "DiscoveryVNextRollbackPreparePayload",
    "DiscoveryVNextRoutePreviewPayload",
    "DiscoveryVNextRoutingApplyPayload",
    "DiscoveryVNextRunCreatePayload",
    "DiscoveryVNextRunStartPayload",
    "DiscoveryVNextScopeResolvePayload",
    "DiscoveryVNextSourceInventoryActionPayload",
    "DiscoveryVNextSourceInventoryExplainPayload",
    "DiscoveryVNextSourceInventoryResolveScopesPayload",
    "DiscoveryVNextUnderstandPayload",
)
for _model_name in _PAYLOAD_MODEL_NAMES:
    globals()[_model_name] = getattr(_models, _model_name)

_EXTERNAL_COMPAT_EXPORT_VALUES = (
    query_all,
    query_count,
    query_one,
    apply_probation_handoff,
    execute_probe_plan,
    PostgresSourceRegistrarAdapter,
)

_PATCH_MODULES = (
    _orchestration,
    _providers,
    _repository,
    _source_inventory,
    _acquisition,
    _artifacts,
    _briefs,
    _feedback,
    _llm_gateway,
    _policy,
    _probing,
    _replay,
    _rollback,
    _routing,
    _run_steps,
    _runs,
    _source_inventory_actions,
    _source_sync,
)
_EXTERNAL_PATCHABLES = (
    "query_one",
    "query_all",
    "query_count",
    "execute_probe_plan",
    "PostgresSourceRegistrarAdapter",
)
_WRAPPER_ORIGINALS: dict[str, Any] = {}
_INTERNAL_ORIGINALS: dict[tuple[object, str], Any] = {}


def _facade_value(name: str) -> Any:
    facade_module = sys.modules.get(FACADE_MODULE_NAME)
    if facade_module is not None and hasattr(facade_module, name):
        return getattr(facade_module, name)
    return globals().get(name)


def _remember_internal_originals(names: list[str]) -> None:
    for module in _PATCH_MODULES:
        for name in names:
            if hasattr(module, name):
                _INTERNAL_ORIGINALS[(module, name)] = getattr(module, name)


def _sync_test_overrides() -> None:
    for name in _EXTERNAL_PATCHABLES:
        value = _facade_value(name)
        for module in _PATCH_MODULES:
            if value is not None and hasattr(module, name):
                setattr(module, name, value)

    for name, wrapper in _WRAPPER_ORIGINALS.items():
        value = _facade_value(name)
        for module in _PATCH_MODULES:
            if not hasattr(module, name):
                continue
            if value is wrapper:
                original = _INTERNAL_ORIGINALS.get((module, name))
                if original is not None:
                    setattr(module, name, original)
            else:
                setattr(module, name, value)


def _wrap(module: object, name: str):
    original = getattr(module, name)

    @wraps(original)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        _sync_test_overrides()
        return getattr(module, name)(*args, **kwargs)

    wrapper.__signature__ = signature(original)  # type: ignore[attr-defined]
    return wrapper


def _install_wrapper(name: str, module: object) -> None:
    wrapper = _wrap(module, name)
    globals()[name] = wrapper
    _WRAPPER_ORIGINALS[name] = wrapper


_install_wrapper("list_vnext_records", _repository)
_install_wrapper("get_vnext_record", _repository)
_install_wrapper("_effective_run_budget", _providers)
_install_wrapper("_assert_live_runtime_allowed", _providers)
_install_wrapper("_search_provider_from_request", _providers)
_install_wrapper("_assert_search_provider_runtime_ready", _providers)
_install_wrapper("_search_adapter", _providers)
_install_wrapper("_json_safe", _providers)
_install_wrapper("apply_probation_handoff_from_payload", _source_inventory)
_install_wrapper("mark_inventory_registered_channel", _source_inventory)
_install_wrapper("source_identity_key", _source_inventory)
_install_wrapper("_inventory_state_for_decision", _source_inventory)
_install_wrapper("_first_registered_channel_id", _source_inventory)
_install_wrapper("_domain_from_url", _source_inventory)
_install_wrapper("preview_brief", _orchestration)
_install_wrapper("create_run", _orchestration)
_install_wrapper("start_run", _orchestration)
_install_wrapper("cancel_run", _orchestration)
_install_wrapper("diagnose_run", _orchestration)
_install_wrapper("validate_artifact", _orchestration)
_install_wrapper("create_artifact_from_payload", _orchestration)
_install_wrapper("resolve_required_policy_payload", _orchestration)
_install_wrapper("preview_route", _orchestration)
_install_wrapper("preview_mega_loop", _orchestration)
_install_wrapper("normalize_candidates", _orchestration)
_install_wrapper("create_candidates_from_payload", _orchestration)
_install_wrapper("preview_probe_plan", _orchestration)
_install_wrapper("execute_probe_from_payload", _orchestration)
_install_wrapper("preview_scope_resolution", _orchestration)
_install_wrapper("apply_scope_resolution", _orchestration)
_install_wrapper("preview_source_understanding", _orchestration)
_install_wrapper("apply_routing_decision", _orchestration)
_install_wrapper("create_artifact", _orchestration)
_install_wrapper("upsert_source_inventory", _orchestration)
_install_wrapper("create_adapter_backlog_item", _orchestration)
_install_wrapper("upsert_monitoring_state", _orchestration)
_install_wrapper("create_source_observation", _orchestration)
_install_wrapper("validate_policy", _orchestration)
_install_wrapper("activate_policy", _orchestration)
_install_wrapper("get_required_active_policy", _orchestration)
_install_wrapper("start_replay", _orchestration)
_install_wrapper("run_llm_gateway", _orchestration)
_install_wrapper("execute_run_steps", _orchestration)
_install_wrapper("execute_full_probe_understand_route", _orchestration)
_install_wrapper("select_candidates_for_probe", _orchestration)
_install_wrapper("_mark_candidate_status", _orchestration)
_install_wrapper("execute_candidate_acquisition", _orchestration)
_install_wrapper("_rank_search_results", _orchestration)
_install_wrapper("prepare_rollback", _orchestration)
_install_wrapper("apply_rollback", _orchestration)
_install_wrapper("explain_source_inventory", _orchestration)
_install_wrapper("resolve_source_inventory_scopes", _orchestration)
_install_wrapper("apply_source_inventory_action", _orchestration)
_install_wrapper("upsert_candidate", _orchestration)
_install_wrapper("submit_feedback", _orchestration)
_remember_internal_originals(list(_WRAPPER_ORIGINALS.keys()))
